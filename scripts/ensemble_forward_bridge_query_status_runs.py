#!/usr/bin/env python3
from __future__ import annotations

from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_forward_bridge_query_core import _conversation_messages, _conversation_rooms
from ensemble_forward_bridge_query_status_base import (
    _status_confidence_age_hours,
    _status_confidence_attention,
    _status_confidence_level,
    _status_confidence_score,
)

def _status_confidence_run_row(
    repository: LoopStateRepository,
    conversations: ConversationReadService,
    run: dict[str, Any],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    run_id = str(run["run_id"])
    iterations = repository.list_iterations(run_id)
    validators = repository.list_validator_results(run_id)
    pending_approvals = repository.list_approval_requests(run_id=run_id, status="pending")
    blocked_handoffs = conversations.handoffs(run_id=run_id, status="blocked")
    rooms = _conversation_rooms(conversations, run_id=run_id)
    messages = _conversation_messages(conversations, run_id=run_id)
    tool_events = repository.list_tool_events(run_id=run_id)
    tasks = repository.list_operator_tasks(linked_run_id=run_id, include_archived=True)
    latest_validator = validators[-1] if validators else None
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"run:{run_id}"]

    age_hours = _status_confidence_age_hours(str(run.get("updated_at") or ""), now)
    if str(run.get("status")) in {"active", "running"} and age_hours is not None and age_hours > stale_age_hours:
        reason_codes.append("stale_active_run")
        reasons.append("Active run has not updated within the stale-age window.")
    if not iterations:
        reason_codes.append("no_iteration_evidence")
        reasons.append("Run has no recorded iterations.")
    if pending_approvals:
        reason_codes.append("pending_approval")
        reasons.append("Run has pending approval requests.")
        evidence_refs.extend([f"approval:{row['request_id']}" for row in pending_approvals[:4]])
    if blocked_handoffs:
        reason_codes.append("blocked_handoff")
        reasons.append("Run has blocked handoff packets.")
        evidence_refs.extend([f"handoff:{row['handoff_id']}" for row in blocked_handoffs[:4]])
    if latest_validator is not None:
        evidence_refs.append(f"validator_result:{latest_validator['id']}")
        if latest_validator["passed"]:
            reason_codes.append("validator_passed")
            reasons.append("Latest validator result passed.")
        else:
            reason_codes.append("latest_validator_failed")
            reasons.append("Latest validator result failed.")
    elif str(run.get("status")) in {"stopped", "done", "complete", "completed"}:
        reason_codes.append("unverified_terminal_run")
        reasons.append("Terminal-looking run status has no validator evidence.")
    if not rooms and not messages and not tool_events:
        reason_codes.append("no_room_activity")
        reasons.append("Run has no room, message, or tool-event activity.")
    if not reason_codes:
        reason_codes.append("run_status_supported")
        reasons.append("Run status has recent activity and no attention flags.")

    level = _status_confidence_level(reason_codes)
    return {
        "id": f"run:{run_id}",
        "subject_type": "run",
        "subject_id": run_id,
        "status": str(run.get("status") or ""),
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": str(run.get("updated_at") or ""),
        "age_hours": age_hours,
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "latest_iteration_id": iterations[-1]["iteration_id"] if iterations else None,
            "room_ids": [str(room["room_id"]) for room in rooms[:8]],
            "task_ids": [str(task["task_id"]) for task in tasks[:8]],
        },
        "signals": {
            "iterations": len(iterations),
            "validator_results": len(validators),
            "latest_validator_passed": latest_validator["passed"] if latest_validator else None,
            "pending_approvals": len(pending_approvals),
            "blocked_handoffs": len(blocked_handoffs),
            "rooms": len(rooms),
            "messages": len(messages),
            "tool_events": len(tool_events),
            "linked_tasks": len(tasks),
        },
    }


__all__ = ["_status_confidence_run_row"]
