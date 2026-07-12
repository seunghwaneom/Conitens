#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_operator_reconciler import reconcile_operator_task
from ensemble_forward_public_context import sanitize_public_text
from ensemble_forward_bridge_query_core import _ensure_run_exists, _public_actor_label
from ensemble_forward_bridge_query_shared import (
    STALE_RUN_AGE_HOURS,
    _parse_utc_iso_timestamp,
)
from ensemble_forward_bridge_query_summary import _sort_attention_items

def build_operator_inbox_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    items: list[dict[str, Any]] = []

    for request in repository.list_approval_requests(status="pending"):
        public_actor = _public_actor_label(request.get("actor")) or "agent"
        items.append(
            {
                "id": f"approval:{request['request_id']}",
                "kind": "approval",
                "severity": "warning",
                "title": f"Approval required for {request['action_type']}",
                "summary": f"{public_actor} requested {request['action_type']}",
                "run_id": request.get("run_id"),
                "iteration_id": request.get("iteration_id"),
                "room_id": None,
                "created_at": request["updated_at"],
                "action_label": "Review approval",
            }
        )

    for run in repository.list_runs():
        validator_results = repository.list_validator_results(run["run_id"])
        if validator_results:
            latest_validator = validator_results[-1]
            if not latest_validator["passed"]:
                items.append(
                    {
                        "id": f"validator:{run['run_id']}:{latest_validator['id']}",
                        "kind": "validator_failure",
                        "severity": "danger",
                        "title": f"Validator failed for {run['run_id']}",
                        "summary": "validation failed",
                        "run_id": run["run_id"],
                        "iteration_id": latest_validator.get("iteration_id"),
                        "room_id": None,
                        "created_at": latest_validator["created_at"],
                        "action_label": "Inspect run",
                    }
                )

        updated_at = _parse_utc_iso_timestamp(str(run.get("updated_at") or ""))
        if updated_at and str(run.get("status")) in {"active", "running"}:
            if datetime.now(timezone.utc) - updated_at > timedelta(hours=STALE_RUN_AGE_HOURS):
                items.append(
                    {
                        "id": f"stale-run:{run['run_id']}",
                        "kind": "stale_run",
                        "severity": "warning",
                        "title": f"Run {run['run_id']} looks stale",
                        "summary": f"Last updated at {run['updated_at']}",
                        "run_id": run["run_id"],
                        "iteration_id": None,
                        "room_id": None,
                        "created_at": run["updated_at"],
                        "action_label": "Inspect run",
                    }
                )

    for handoff in conversations.handoffs(status="blocked"):
        packet = handoff.get("packet_json") if isinstance(handoff.get("packet_json"), dict) else {}
        public_reason = sanitize_public_text(
            packet.get("blocked_reason") or handoff.get("summary"),
            fallback="handoff blocked",
        )
        items.append(
            {
                "id": f"handoff:{handoff['handoff_id']}",
                "kind": "handoff_attention",
                "severity": "warning",
                "title": f"Blocked handoff {handoff['handoff_id']}",
                "summary": public_reason,
                "run_id": handoff.get("run_id"),
                "iteration_id": handoff.get("iteration_id"),
                "room_id": None,
                "created_at": handoff["updated_at"],
                "action_label": "Inspect run",
            }
        )

    return {
        "items": _sort_attention_items(items),
        "count": len(items),
    }


def build_operator_task_reconcile_preview_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")

    linked_run = None
    approvals = repository.list_approval_requests(task_id=task_id, status="pending")
    validator_history: list[dict[str, Any]] = []
    handoffs: list[dict[str, Any]] = []
    linked_run_id = task.get("linked_run_id")
    if isinstance(linked_run_id, str) and linked_run_id:
        linked_run = _ensure_run_exists(repository, linked_run_id)
        approvals.extend(
            [
                row
                for row in repository.list_approval_requests(run_id=linked_run_id, status="pending")
                if row.get("task_id") != task_id
            ]
        )
        validator_history = repository.list_validator_results(linked_run_id)
        handoffs = conversations.handoffs(run_id=linked_run_id, status="blocked")

    return reconcile_operator_task(
        task,
        linked_run=linked_run,
        approvals=approvals,
        validator_history=validator_history,
        handoffs=handoffs,
        stale_age_hours=STALE_RUN_AGE_HOURS,
    )


__all__ = [
    "build_operator_inbox_payload",
    "build_operator_task_reconcile_preview_payload",
]
