#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_forward_public_context import sanitize_public_text
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_forward_bridge_query_core import _conversation_rooms, _public_actor_label
from ensemble_forward_bridge_query_shared import (
    _parse_utc_iso_timestamp,
)
from ensemble_forward_bridge_query_summary import _derive_agent_status, _guess_agent_role, _role_archetype

def build_operator_agents_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    runs = repository.list_runs()
    approvals = repository.list_approval_requests()
    rooms = _conversation_rooms(conversations)
    memory_records = repository.list_memory_records()
    handoffs = conversations.handoffs()

    known_ids: set[str] = set()

    def ingest(value: str | None) -> None:
        public_value = _public_actor_label(value)
        if not public_value:
            return
        normalized = public_value.strip()
        if not normalized:
            return
        if normalized.lower() in {"user", "human", "cli", "system", "tool"}:
            return
        known_ids.add(normalized)

    for approval in approvals:
        ingest(str(approval.get("actor") or ""))
        ingest(str(approval.get("reviewer") or ""))
    for room in rooms:
        ingest(str(room.get("created_by") or ""))
        for participant in room.get("participants_json") or []:
            if isinstance(participant, str):
                ingest(participant)
    for row in memory_records:
        ingest(str(row.get("agent_id") or ""))
    for handoff in handoffs:
        ingest(str(handoff.get("from_actor") or ""))
        ingest(str(handoff.get("to_actor") or ""))
    for run in runs:
        plan = repository.get_task_plan(run["run_id"])
        ingest(str((plan or {}).get("owner") or ""))
        build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
        if build_checkpoint:
            ingest(str((build_checkpoint.get("state_json") or {}).get("agent_id") or ""))
        planner_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="planner")
        if planner_checkpoint:
            ingest(str((planner_checkpoint.get("state_json") or {}).get("agent_id") or ""))

    agent_rows: list[dict[str, Any]] = []
    for agent_id in sorted(known_ids):
        role = _guess_agent_role(agent_id)
        related_runs: list[dict[str, Any]] = []
        latest_blocker: tuple[str | None, str | None] = (None, None)
        for run in runs:
            plan = repository.get_task_plan(run["run_id"])
            owner = _public_actor_label((plan or {}).get("owner")) or ""
            build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
            checkpoint_agent = _public_actor_label(
                ((build_checkpoint or {}).get("state_json") or {}).get("agent_id")
            ) or ""
            if agent_id not in {owner, checkpoint_agent}:
                continue
            related_runs.append(run)

            for validator in repository.list_validator_results(run["run_id"]):
                if validator["passed"]:
                    continue
                created_at = str(validator["created_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, "validation failed")
            for approval in approvals:
                if approval.get("status") != "pending":
                    continue
                if approval.get("run_id") != run["run_id"] and approval.get("actor") != agent_id:
                    continue
                created_at = str(approval["updated_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, f"approval pending: {approval['action_type']}")
            for handoff in handoffs:
                if handoff.get("status") != "blocked":
                    continue
                if handoff.get("run_id") != run["run_id"] and agent_id not in {
                    _public_actor_label(handoff.get("from_actor")),
                    _public_actor_label(handoff.get("to_actor")),
                }:
                    continue
                created_at = str(handoff["updated_at"])
                blocked_reason = ""
                if isinstance(handoff.get("packet_json"), dict):
                    blocked_reason = str(handoff["packet_json"].get("blocked_reason") or "")
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (
                        created_at,
                        sanitize_public_text(
                            blocked_reason or handoff.get("summary"),
                            fallback="handoff blocked",
                        ),
                    )

        latest_run = None
        if related_runs:
            latest_run = max(related_runs, key=lambda row: str(row.get("updated_at") or ""))

        related_rooms = [
            room
            for room in rooms
            if agent_id == (_public_actor_label(room.get("created_by")) or "")
            or agent_id in {
                public_participant
                for participant in (room.get("participants_json") or [])
                if isinstance(participant, str)
                for public_participant in [_public_actor_label(participant)]
                if public_participant
            }
        ]
        latest_room = max(related_rooms, key=lambda row: str(row.get("updated_at") or ""), default=None)

        memory_count = sum(
            1
            for row in memory_records
            if _public_actor_label(row.get("agent_id")) == agent_id
        )
        pending_approvals = sum(
            1
            for row in approvals
            if row.get("status") == "pending"
            and (
                _public_actor_label(row.get("actor")) == agent_id
                or row.get("run_id") in {r["run_id"] for r in related_runs}
            )
        )

        validator_failures = 0
        for run in related_runs:
            validator_results = repository.list_validator_results(run["run_id"])
            if validator_results and not validator_results[-1]["passed"]:
                validator_failures += 1
        error_rate = (validator_failures / len(related_runs)) if related_runs else 0.0

        activity_candidates = [
            _parse_utc_iso_timestamp(str(item))
            for item in [
                latest_run["updated_at"] if latest_run else None,
                latest_room["updated_at"] if latest_room else None,
                max(
                    (
                        str(row.get("created_at") or "")
                        for row in memory_records
                        if str(row.get("agent_id") or "") == agent_id
                    ),
                    default="",
                ),
            ]
        ]
        last_active_dt = max((item for item in activity_candidates if item is not None), default=None)
        last_active = (last_active_dt or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        agent_rows.append(
            {
                "agent_id": agent_id,
                "name": agent_id,
                "role": role,
                "archetype": _role_archetype(role),
                "status": _derive_agent_status(
                    latest_run_status=str(latest_run.get("status")) if latest_run else None,
                    last_active=last_active_dt,
                ),
                "room_id": str((latest_room or {}).get("room_id") or "unassigned"),
                "task_count": len(related_runs),
                "last_active": last_active,
                "memory_count": memory_count,
                "error_rate": round(error_rate, 4),
                "latest_run_id": str(latest_run.get("run_id")) if latest_run else None,
                "latest_run_status": str(latest_run.get("status")) if latest_run else None,
                "latest_blocker": latest_blocker[1],
                "pending_approvals": pending_approvals,
                "workspace_ref": None,
            }
        )

    return {
        "agents": sorted(agent_rows, key=lambda row: (row["role"], row["name"])),
        "count": len(agent_rows),
    }


__all__ = ["build_operator_agents_payload"]
