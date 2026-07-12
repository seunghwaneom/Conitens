#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_forward import build_runtime_cli_checks
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository, utc_iso
from ensemble_forward_bridge_query_core import _conversation_rooms
from ensemble_forward_bridge_query_operator_tasks import (
    build_operator_doctor_evidence_payload,
    build_operator_evidence_summary_payload,
)
from ensemble_forward_bridge_query_runtime_roster import build_operator_runtime_roster_payload
from ensemble_forward_bridge_query_shared import (
    RuntimeChecksBuilder,
    _parse_utc_iso_timestamp,
)

def build_operator_summary_payload(
    workspace: str | Path,
    *,
    runtime_checks_builder: RuntimeChecksBuilder = build_runtime_cli_checks,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    runs = repository.list_runs()
    pending_approvals = repository.list_approval_requests(status="pending")
    rooms = _conversation_rooms(conversations)
    handoffs = conversations.handoffs()
    latest_run = repository.get_most_recent_run()

    awaiting_approval_run_ids = {
        row["run_id"]
        for row in pending_approvals
        if isinstance(row.get("run_id"), str) and row.get("run_id")
    }

    failing_runs = 0
    latest_failure_reason: str | None = None
    latest_failure_at: str | None = None
    for run in runs:
        validator_results = repository.list_validator_results(run["run_id"])
        if not validator_results:
            continue
        latest_for_run = validator_results[-1]
        if not latest_for_run["passed"]:
            failing_runs += 1
        for row in validator_results:
            if row["passed"]:
                continue
            created_at = str(row["created_at"])
            if latest_failure_at is None or created_at > latest_failure_at:
                latest_failure_at = created_at
                latest_failure_reason = "validation failed"

    return {
        "generated_at": utc_iso(),
        "runs": {
            "total": len(runs),
            "active": sum(1 for row in runs if str(row.get("status")) in {"active", "running"}),
            "awaiting_approval": len(awaiting_approval_run_ids),
            "with_failures": failing_runs,
            "latest_run_id": latest_run["run_id"] if latest_run else None,
            "latest_status": latest_run["status"] if latest_run else None,
        },
        "approvals": {
            "pending": len(pending_approvals),
        },
        "rooms": {
            "active": sum(1 for row in rooms if str(row.get("status")) == "active"),
            "review": sum(1 for row in rooms if str(row.get("room_type")) == "review"),
        },
        "validation": {
            "failing_runs": failing_runs,
            "latest_failure_reason": latest_failure_reason,
        },
        "handoffs": {
            "open": sum(1 for row in handoffs if str(row.get("status")) != "completed"),
            "blocked": sum(1 for row in handoffs if str(row.get("status")) == "blocked"),
        },
        "evidence": build_operator_evidence_summary_payload(workspace),
        "doctor": build_operator_doctor_evidence_payload(workspace),
        "runtime_roster": build_operator_runtime_roster_payload(
            workspace,
            probe_versions=False,
            runtime_checks_builder=runtime_checks_builder,
        ),
    }


def _sort_attention_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    severity_rank = {"danger": 0, "warning": 1, "info": 2}

    def sort_key(item: dict[str, Any]) -> tuple[int, float, str]:
        severity = severity_rank.get(str(item.get("severity")), 9)
        created_at = _parse_utc_iso_timestamp(str(item.get("created_at") or "")) or datetime.fromtimestamp(0, timezone.utc)
        return (severity, -created_at.timestamp(), str(item.get("id") or ""))

    return sorted(items, key=sort_key)


def _guess_agent_role(agent_id: str) -> str:
    normalized = agent_id.strip().lower()
    if any(token in normalized for token in ("validator", "sentinel", "gate")):
        return "validator"
    if any(token in normalized for token in ("review", "auditor", "critic")):
        return "reviewer"
    if any(token in normalized for token in ("research", "scout", "analyst")):
        return "researcher"
    if any(token in normalized for token in ("owner", "architect", "planner", "orchestr")):
        return "orchestrator"
    return "implementer"


def _role_archetype(role: str) -> str:
    return {
        "orchestrator": "Floor lead",
        "implementer": "Builder",
        "researcher": "Explorer",
        "reviewer": "Inspector",
        "validator": "Gatekeeper",
    }.get(role, "Operator")


def _derive_agent_status(*, latest_run_status: str | None, last_active: datetime | None) -> str:
    if latest_run_status in {"active", "running"}:
        return "running"
    if last_active is None:
        return "dormant"
    if datetime.now(timezone.utc) - last_active > timedelta(hours=24):
        return "dormant"
    return "idle"


__all__ = [
    "_derive_agent_status",
    "_guess_agent_role",
    "_role_archetype",
    "_sort_attention_items",
    "build_operator_summary_payload",
]
