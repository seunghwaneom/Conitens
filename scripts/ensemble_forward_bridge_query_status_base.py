#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_forward_bridge_query_core import _conversation_messages
from ensemble_forward_bridge_query_shared import (
    STATUS_CONFIDENCE_DEFAULT_LIMIT,
    STATUS_CONFIDENCE_MAX_LIMIT,
    _parse_utc_iso_timestamp,
)

def _bounded_status_confidence_limit(limit: int | None) -> int:
    if limit is None:
        return STATUS_CONFIDENCE_DEFAULT_LIMIT
    return max(1, min(int(limit), STATUS_CONFIDENCE_MAX_LIMIT))


def _status_confidence_age_hours(value: str | None, now: datetime) -> float | None:
    parsed = _parse_utc_iso_timestamp(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return round(max(0.0, (now - parsed).total_seconds() / 3600), 2)


def _status_confidence_level(reason_codes: list[str]) -> str:
    if any(code.endswith("_stale") or code == "stale_active_run" for code in reason_codes):
        return "stale"
    partial_tokens = (
        "missing",
        "pending",
        "blocked",
        "failed",
        "no_activity",
        "no_iteration",
        "unverified",
        "unknown",
    )
    if any(any(token in code for token in partial_tokens) for code in reason_codes):
        return "partial"
    return "high"


def _status_confidence_score(level: str) -> float:
    return {"high": 0.92, "partial": 0.58, "stale": 0.34}.get(level, 0.5)


def _status_confidence_attention(reason_codes: list[str]) -> list[str]:
    flags: list[str] = []
    if any("pending" in code for code in reason_codes):
        flags.append("pending_approval")
    if any("blocked" in code for code in reason_codes):
        flags.append("blocked")
    if any("failed" in code or "unverified" in code for code in reason_codes):
        flags.append("needs_validation")
    if any("stale" in code for code in reason_codes):
        flags.append("stale")
    return flags


def _status_confidence_latest_at(values: list[str | None]) -> str | None:
    parsed: list[tuple[datetime, str]] = []
    for value in values:
        timestamp = _parse_utc_iso_timestamp(value)
        if timestamp is None or value is None:
            continue
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        parsed.append((timestamp, value))
    if not parsed:
        return None
    parsed.sort(key=lambda item: item[0])
    return parsed[-1][1]


def _status_confidence_task_row(
    repository: LoopStateRepository,
    conversations: ConversationReadService,
    task: dict[str, Any],
    runs_by_id: dict[str, dict[str, Any]],
    rooms_by_id: dict[str, dict[str, Any]],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    task_id = str(task["task_id"])
    linked_run_id = task.get("linked_run_id")
    linked_room_ids = [str(item) for item in (task.get("linked_room_ids_json") or []) if isinstance(item, str)]
    linked_rooms = [rooms_by_id[room_id] for room_id in linked_room_ids if room_id in rooms_by_id]
    linked_run = runs_by_id.get(str(linked_run_id)) if linked_run_id else None
    pending_approvals = repository.list_approval_requests(task_id=task_id, status="pending")
    validator_history: list[dict[str, Any]] = []
    blocked_handoffs: list[dict[str, Any]] = []
    run_pending_approvals: list[dict[str, Any]] = []
    room_message_count = 0
    room_tool_event_count = 0

    if linked_run:
        validator_history = repository.list_validator_results(str(linked_run["run_id"]))
        blocked_handoffs = conversations.handoffs(run_id=str(linked_run["run_id"]), status="blocked")
        run_pending_approvals = [
            row
            for row in repository.list_approval_requests(run_id=str(linked_run["run_id"]), status="pending")
            if row.get("task_id") != task_id
        ]
    for room in linked_rooms:
        room_message_count += len(_conversation_messages(conversations, room_id=str(room["room_id"])))
        room_tool_event_count += len(repository.list_tool_events(room_id=str(room["room_id"])))

    latest_validator = validator_history[-1] if validator_history else None
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"operator_task:{task_id}"]

    status = str(task.get("status") or "")
    if task.get("archived_at"):
        reason_codes.append("task_archived")
        reasons.append("Task is archived; status is historical.")
    if status == "blocked" or task.get("blocked_reason"):
        reason_codes.append("task_blocked")
        reasons.append("Task is explicitly blocked.")
    if status in {"in_progress", "in_review", "done"} and not linked_run_id:
        reason_codes.append("missing_linked_run")
        reasons.append("Task status expects run evidence but no linked run is recorded.")
    if linked_run_id and linked_run is None:
        reason_codes.append("missing_linked_run_record")
        reasons.append("Task references a linked run that is not present in SQLite state.")
    if linked_run:
        evidence_refs.append(f"run:{linked_run['run_id']}")
        run_age = _status_confidence_age_hours(str(linked_run.get("updated_at") or ""), now)
        if str(linked_run.get("status")) in {"active", "running"} and run_age is not None and run_age > stale_age_hours:
            reason_codes.append("linked_run_stale")
            reasons.append("Linked active run has not updated within the stale-age window.")
    if pending_approvals or run_pending_approvals:
        reason_codes.append("pending_approval")
        reasons.append("A pending approval is associated with this task or linked run.")
        evidence_refs.extend([f"approval:{row['request_id']}" for row in (pending_approvals + run_pending_approvals)[:4]])
    if blocked_handoffs:
        reason_codes.append("blocked_handoff")
        reasons.append("A blocked handoff is associated with the linked run.")
        evidence_refs.extend([f"handoff:{row['handoff_id']}" for row in blocked_handoffs[:4]])
    if latest_validator is not None:
        evidence_refs.append(f"validator_result:{latest_validator['id']}")
        if not latest_validator["passed"]:
            reason_codes.append("latest_validator_failed")
            reasons.append("Latest validator result for the linked run failed.")
    elif status in {"in_review", "done"}:
        reason_codes.append("unverified_task_status")
        reasons.append("Task is in review or done without validator evidence.")
    if linked_run and not validator_history and not pending_approvals and not blocked_handoffs and not linked_rooms:
        reason_codes.append("no_activity_evidence")
        reasons.append("Linked run exists, but no validation, approval, handoff, or linked room evidence is attached.")
    if not reason_codes:
        reason_codes.append("status_supported")
        reasons.append("Task status has matching linked evidence and no attention flags.")

    level = _status_confidence_level(reason_codes)
    updated_at = str(task.get("updated_at") or "")
    return {
        "id": f"task:{task_id}",
        "subject_type": "task",
        "subject_id": task_id,
        "status": status,
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": updated_at,
        "age_hours": _status_confidence_age_hours(updated_at, now),
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "run_id": linked_run_id,
            "iteration_id": task.get("linked_iteration_id"),
            "room_ids": linked_room_ids[:8],
        },
        "signals": {
            "pending_approvals": len(pending_approvals) + len(run_pending_approvals),
            "validator_results": len(validator_history),
            "latest_validator_passed": latest_validator["passed"] if latest_validator else None,
            "blocked_handoffs": len(blocked_handoffs),
            "linked_rooms": len(linked_rooms),
            "room_messages": room_message_count,
            "room_tool_events": room_tool_event_count,
            "acceptance_items": len(task.get("acceptance_json") or []),
        },
    }


__all__ = [
    "_bounded_status_confidence_limit",
    "_status_confidence_age_hours",
    "_status_confidence_attention",
    "_status_confidence_latest_at",
    "_status_confidence_level",
    "_status_confidence_score",
    "_status_confidence_task_row",
]
