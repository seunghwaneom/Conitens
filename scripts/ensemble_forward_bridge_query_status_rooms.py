#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository, utc_iso
from ensemble_forward_bridge_query_core import _conversation_messages, _conversation_rooms
from ensemble_forward_bridge_query_shared import (
    STALE_RUN_AGE_HOURS,
    _parse_utc_iso_timestamp,
    _status_from_counts,
)
from ensemble_forward_bridge_query_status_base import (
    _bounded_status_confidence_limit,
    _status_confidence_age_hours,
    _status_confidence_attention,
    _status_confidence_latest_at,
    _status_confidence_level,
    _status_confidence_score,
    _status_confidence_task_row,
)
from ensemble_forward_bridge_query_status_runs import _status_confidence_run_row

def _status_confidence_room_row(
    repository: LoopStateRepository,
    conversations: ConversationReadService,
    room: dict[str, Any],
    runs_by_id: dict[str, dict[str, Any]],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    room_id = str(room["room_id"])
    run_id = room.get("run_id")
    linked_run = runs_by_id.get(str(run_id)) if run_id else None
    messages = _conversation_messages(conversations, room_id=room_id)
    tool_events = repository.list_tool_events(room_id=room_id)
    latest_activity = _status_confidence_latest_at(
        [str(room.get("updated_at") or "")]
        + [str(row.get("created_at") or "") for row in messages]
        + [str(row.get("created_at") or "") for row in tool_events]
    )
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"room:{room_id}"]

    if not messages and not tool_events:
        reason_codes.append("no_activity_evidence")
        reasons.append("Room has no persisted messages or tool events.")
    if run_id and linked_run is None:
        reason_codes.append("missing_linked_run_record")
        reasons.append("Room references a run that is not present in SQLite state.")
    if linked_run:
        evidence_refs.append(f"run:{linked_run['run_id']}")
        run_age = _status_confidence_age_hours(str(linked_run.get("updated_at") or ""), now)
        if str(linked_run.get("status")) in {"active", "running"} and run_age is not None and run_age > stale_age_hours:
            reason_codes.append("linked_run_stale")
            reasons.append("Room is attached to a stale active run.")
    activity_age = _status_confidence_age_hours(latest_activity, now)
    if str(room.get("status")) == "active" and activity_age is not None and activity_age > stale_age_hours:
        reason_codes.append("room_activity_stale")
        reasons.append("Active room has no recent persisted activity.")
    if not reason_codes:
        reason_codes.append("room_status_supported")
        reasons.append("Room has persisted activity and no attention flags.")

    level = _status_confidence_level(reason_codes)
    return {
        "id": f"room:{room_id}",
        "subject_type": "room",
        "subject_id": room_id,
        "status": str(room.get("status") or ""),
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": str(room.get("updated_at") or ""),
        "age_hours": _status_confidence_age_hours(str(room.get("updated_at") or ""), now),
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "run_id": run_id,
            "iteration_id": room.get("iteration_id"),
            "task_id": room.get("task_id"),
        },
        "signals": {
            "participants": len(room.get("participants_json") or []),
            "messages": len(messages),
            "tool_events": len(tool_events),
            "latest_activity_at": latest_activity,
            "latest_activity_age_hours": activity_age,
        },
    }


def _sort_status_confidence_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rank = {"stale": 0, "partial": 1, "high": 2}

    def sort_key(row: dict[str, Any]) -> tuple[int, float, str]:
        updated = _parse_utc_iso_timestamp(str(row.get("updated_at") or "")) or datetime.fromtimestamp(0, timezone.utc)
        return (rank.get(str(row.get("confidence_level")), 9), -updated.timestamp(), str(row.get("id") or ""))

    return sorted(rows, key=sort_key)


def build_operator_status_confidence_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    safe_limit = _bounded_status_confidence_limit(limit)
    now = datetime.now(timezone.utc)
    runs_by_id = {str(row["run_id"]): row for row in repository.list_runs()}
    all_rooms = _conversation_rooms(conversations)
    rooms_by_id = {str(row["room_id"]): row for row in all_rooms}

    selected_tasks: list[dict[str, Any]]
    selected_runs: list[dict[str, Any]]
    selected_rooms: list[dict[str, Any]]

    if task_id:
        task = repository.get_operator_task(task_id)
        if task is None:
            raise FileNotFoundError(f"Operator task not found: {task_id}")
        selected_tasks = [task]
        linked_run_id = str(task.get("linked_run_id") or "")
        selected_runs = [runs_by_id[linked_run_id]] if linked_run_id in runs_by_id else []
        linked_room_ids = {str(item) for item in (task.get("linked_room_ids_json") or []) if isinstance(item, str)}
        selected_rooms = [
            room
            for room in all_rooms
            if str(room["room_id"]) in linked_room_ids or str(room.get("task_id") or "") == task_id
        ]
    elif run_id:
        if run_id not in runs_by_id:
            raise FileNotFoundError(f"Run not found: {run_id}")
        selected_runs = [runs_by_id[run_id]]
        selected_tasks = repository.list_operator_tasks(linked_run_id=run_id, include_archived=True)
        selected_rooms = _conversation_rooms(conversations, run_id=run_id)
    elif room_id:
        room = rooms_by_id.get(room_id)
        if room is None:
            raise FileNotFoundError(f"Room not found: {room_id}")
        selected_rooms = [room]
        linked_run_id = str(room.get("run_id") or "")
        selected_runs = [runs_by_id[linked_run_id]] if linked_run_id in runs_by_id else []
        selected_tasks = [
            task
            for task in repository.list_operator_tasks(include_archived=True)
            if str(task.get("task_id") or "") == str(room.get("task_id") or "")
            or room_id in [str(item) for item in (task.get("linked_room_ids_json") or [])]
        ]
    else:
        selected_tasks = repository.list_operator_tasks()
        selected_runs = list(runs_by_id.values())
        selected_rooms = all_rooms

    rows: list[dict[str, Any]] = []
    for task in selected_tasks:
        rows.append(
            _status_confidence_task_row(
                repository,
                conversations,
                task,
                runs_by_id,
                rooms_by_id,
                now=now,
                stale_age_hours=STALE_RUN_AGE_HOURS,
            )
        )
    for run in selected_runs:
        rows.append(_status_confidence_run_row(repository, conversations, run, now=now, stale_age_hours=STALE_RUN_AGE_HOURS))
    for room in selected_rooms:
        rows.append(
            _status_confidence_room_row(
                repository,
                conversations,
                room,
                runs_by_id,
                now=now,
                stale_age_hours=STALE_RUN_AGE_HOURS,
            )
        )

    sorted_rows = _sort_status_confidence_rows(rows)
    total_rows = len(sorted_rows)
    returned_rows = sorted_rows[:safe_limit]
    warning_count = sum(1 for row in rows if row["confidence_level"] in {"partial", "stale"})
    return {
        "generated_at": utc_iso(),
        "status": _status_from_counts(danger=0, warning=warning_count),
        "scope": {
            "task_id": task_id,
            "run_id": run_id,
            "room_id": room_id,
            "limit": safe_limit,
            "stale_age_hours": STALE_RUN_AGE_HOURS,
        },
        "diagnostics": returned_rows,
        "counts": {
            "returned": len(returned_rows),
            "total": total_rows,
            "tasks": sum(1 for row in rows if row["subject_type"] == "task"),
            "runs": sum(1 for row in rows if row["subject_type"] == "run"),
            "rooms": sum(1 for row in rows if row["subject_type"] == "room"),
            "high": sum(1 for row in rows if row["confidence_level"] == "high"),
            "partial": sum(1 for row in rows if row["confidence_level"] == "partial"),
            "stale": sum(1 for row in rows if row["confidence_level"] == "stale"),
            "blocked": sum(1 for row in rows if "blocked" in row.get("attention_flags", [])),
            "pending_approval": sum(1 for row in rows if "pending_approval" in row.get("attention_flags", [])),
            "truncated": total_rows > safe_limit,
        },
        "diagnostic_contract": {
            "read_only": True,
            "mutations_performed": False,
            "external_fetch_performed": False,
            "task_status_mutated": False,
            "run_status_mutated": False,
            "room_status_mutated": False,
        },
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_values_exposed": False,
            "approval_payload_values_exposed": False,
            "raw_transcript_exposed": False,
            "detail": "Status-confidence diagnostics expose ids, statuses, counts, reason codes, and evidence refs only.",
        },
    }


__all__ = ["build_operator_status_confidence_payload"]
