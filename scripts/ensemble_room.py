#!/usr/bin/env python3
"""
Append-only project chat room helpers.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_loop_repository import LoopStateRepository
from ensemble_paths import ensure_notes_dir


SAFE_ROOM_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def rooms_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "rooms")


def validate_room_id(room_id: str) -> str:
    candidate = str(room_id).strip()
    if not candidate:
        raise ValueError("room_id is required")
    if ".." in candidate or "/" in candidate or "\\" in candidate:
        raise ValueError(f"Invalid room_id: {room_id}")
    if not SAFE_ROOM_ID_PATTERN.fullmatch(candidate):
        raise ValueError(f"Invalid room_id: {room_id}")
    return candidate


def room_meta_path(workspace: str | Path, room_id: str) -> Path:
    return rooms_dir(workspace) / f"{validate_room_id(room_id)}.json"


def room_log_path(workspace: str | Path, room_id: str) -> Path:
    return rooms_dir(workspace) / f"{validate_room_id(room_id)}.jsonl"


def next_room_id(workspace: str | Path) -> str:
    prefix = datetime.now().strftime("R-%Y%m%d-")
    max_num = 0
    for path in rooms_dir(workspace).glob(f"{prefix}*.json"):
        try:
            max_num = max(max_num, int(path.stem.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefix}{max_num + 1:03d}"


def next_message_id(room_id: str) -> str:
    return f"msg:{validate_room_id(room_id)}:{uuid.uuid4().hex[:12]}"


def create_room(
    workspace: str | Path,
    *,
    name: str,
    participants: list[str] | None = None,
    actor: str = "CLI",
    task_id: str | None = None,
    room_type: str = "discussion",
    run_id: str | None = None,
    iteration_id: str | None = None,
    session_boundary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    room_id = next_room_id(workspace)
    now = utc_iso()
    record = {
        "room_id": room_id,
        "schema_v": 1,
        "name": name,
        "room_type": room_type,
        "participants": participants or [],
        "task_id": task_id,
        "run_id": run_id,
        "iteration_id": iteration_id,
        "created_by": actor,
        "created_at": now,
        "updated_at": now,
        "status": "active",
        "session_boundary": session_boundary or {},
    }
    event = append_event(
        workspace,
        event_type="ROOM_CREATED",
        actor={"type": "agent", "name": actor},
        scope={
            "task_id": task_id,
            "room_id": room_id,
            "correlation_id": task_id or room_id,
            "run_id": run_id,
            "iteration_id": iteration_id,
        },
        payload=record,
    )
    projected_record = dict(event.get("payload") or record)
    projected_record.setdefault("room_id", room_id)
    projected_record.setdefault("schema_v", 1)
    room_meta_path(workspace, room_id).write_text(json.dumps(projected_record, indent=2, ensure_ascii=False), encoding="utf-8")
    room_log_path(workspace, room_id).write_text("", encoding="utf-8")
    LoopStateRepository(workspace).upsert_room(
        room_id=room_id,
        room_type=str(projected_record.get("room_type") or room_type),
        name=str(projected_record.get("name") or name),
        status=str(projected_record.get("status") or "active"),
        created_by=str(projected_record.get("created_by") or actor),
        participants=list(projected_record.get("participants") or []),
        session_boundary=dict(projected_record.get("session_boundary") or {}),
        run_id=projected_record.get("run_id"),
        iteration_id=projected_record.get("iteration_id"),
        task_id=projected_record.get("task_id"),
        created_at=projected_record.get("created_at"),
        updated_at=projected_record.get("updated_at"),
    )
    return projected_record


def post_room_message(
    workspace: str | Path,
    *,
    room_id: str,
    sender: str,
    text: str,
    message_type: str = "text",
    attachments: list[str] | None = None,
    task_id: str | None = None,
    sender_kind: str = "agent",
    evidence_refs: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    run_id: str | None = None,
    iteration_id: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    meta = json.loads(room_meta_path(workspace, room_id).read_text(encoding="utf-8"))
    message_id = next_message_id(room_id)
    created = created_at or utc_iso()
    message_task_id = task_id or meta.get("task_id")
    message_run_id = run_id or meta.get("run_id")
    message_iteration_id = iteration_id or meta.get("iteration_id")
    projected_evidence_refs = evidence_refs or attachments or []
    event_metadata = {"attachments": attachments or [], **(metadata or {})}
    entry = {
        "message_id": message_id,
        "ts_utc": created,
        "created_at": created,
        "room_id": room_id,
        "sender": sender,
        "sender_kind": sender_kind,
        "message_type": message_type,
        "text": text,
        "content": text,
        "attachments": attachments or [],
        "evidence_refs": projected_evidence_refs,
        "task_id": message_task_id,
        "run_id": message_run_id,
        "iteration_id": message_iteration_id,
        "metadata": event_metadata,
    }
    event = append_event(
        workspace,
        event_type="ROOM_MESSAGE",
        actor={"type": "agent", "name": sender},
        scope={
            "task_id": entry["task_id"],
            "room_id": room_id,
            "correlation_id": entry["task_id"] or room_id,
            "run_id": entry.get("run_id"),
            "iteration_id": entry.get("iteration_id"),
            "message_id": message_id,
        },
        payload={
            "room_id": room_id,
            "message_id": message_id,
            "sender": sender,
            "sender_kind": sender_kind,
            "message_type": message_type,
            "content": text,
            "created_at": created,
            "attachments": attachments or [],
            "evidence_refs": projected_evidence_refs,
            "metadata": event_metadata,
            "task_id": entry["task_id"],
            "run_id": entry["run_id"],
            "iteration_id": entry["iteration_id"],
        },
    )
    payload = dict(event.get("payload") or {})
    projected_entry = {
        **entry,
        "message_id": payload.get("message_id", message_id),
        "room_id": payload.get("room_id", room_id),
        "sender": payload.get("sender", sender),
        "sender_kind": payload.get("sender_kind", sender_kind),
        "message_type": payload.get("message_type", message_type),
        "text": payload.get("content", text),
        "content": payload.get("content", text),
        "attachments": payload.get("attachments", attachments or []),
        "evidence_refs": payload.get("evidence_refs", projected_evidence_refs),
        "task_id": payload.get("task_id", entry["task_id"]),
        "run_id": payload.get("run_id", entry["run_id"]),
        "iteration_id": payload.get("iteration_id", entry["iteration_id"]),
        "metadata": payload.get("metadata", event_metadata),
        "created_at": payload.get("created_at", created),
        "ts_utc": payload.get("created_at", created),
    }
    meta["updated_at"] = projected_entry["ts_utc"]
    room_meta_path(workspace, room_id).write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    with room_log_path(workspace, room_id).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(projected_entry, ensure_ascii=False) + "\n")
    repository = LoopStateRepository(workspace)
    repository.upsert_room(
        room_id=room_id,
        room_type=meta.get("room_type") or "discussion",
        name=meta.get("name") or room_id,
        status=meta.get("status") or "active",
        created_by=meta.get("created_by") or "legacy",
        participants=list(meta.get("participants") or []),
        session_boundary=meta.get("session_boundary") or {},
        run_id=meta.get("run_id"),
        iteration_id=meta.get("iteration_id"),
        task_id=meta.get("task_id"),
        created_at=meta.get("created_at"),
        updated_at=meta["updated_at"],
    )
    db_entry = repository.append_room_message(
        room_id=room_id,
        run_id=projected_entry.get("run_id"),
        iteration_id=projected_entry.get("iteration_id"),
        sender=str(projected_entry.get("sender") or sender),
        sender_kind=str(projected_entry.get("sender_kind") or sender_kind),
        message_type=str(projected_entry.get("message_type") or message_type),
        content=str(projected_entry.get("content") or ""),
        evidence_refs=list(projected_entry.get("evidence_refs") or []),
        metadata=dict(projected_entry.get("metadata") or {}),
        created_at=projected_entry["ts_utc"],
    )
    projected_entry["id"] = db_entry["id"]
    return projected_entry


def show_room(workspace: str | Path, room_id: str) -> dict[str, Any]:
    meta = json.loads(room_meta_path(workspace, room_id).read_text(encoding="utf-8"))
    messages = []
    for line in room_log_path(workspace, room_id).read_text(encoding="utf-8").splitlines():
        if line.strip():
            messages.append(json.loads(line))
    return {"room": meta, "messages": messages}


def export_room_markdown(workspace: str | Path, room_id: str) -> Path:
    snapshot = show_room(workspace, room_id)
    export_path = rooms_dir(workspace) / f"{validate_room_id(room_id)}.md"
    lines = [
        f"# Room {snapshot['room']['name']}",
        "",
        f"- Room ID: {room_id}",
        f"- Participants: {', '.join(snapshot['room'].get('participants', []))}",
        f"- Created At: {snapshot['room'].get('created_at')}",
        "",
        "## Transcript",
        "",
    ]
    for message in snapshot["messages"]:
        lines.append(f"- [{message['ts_utc']}] {message['sender']}: {message['text']}")
    export_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    append_artifact_manifest(
        workspace,
        artifact_type="room_export",
        path=str(export_path),
        actor="CLI",
        task_id=snapshot["room"].get("task_id"),
        correlation_id=snapshot["room"].get("task_id") or room_id,
        subject_ref=room_id,
        metadata={"room_id": room_id, "message_count": len(snapshot["messages"])},
    )
    return export_path

