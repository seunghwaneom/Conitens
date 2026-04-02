#!/usr/bin/env python3
"""
Append-only project chat room helpers.
"""

from __future__ import annotations

import json
import re
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
        "created_at": utc_iso(),
        "updated_at": utc_iso(),
        "status": "active",
        "session_boundary": session_boundary or {},
    }
    room_meta_path(workspace, room_id).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    room_log_path(workspace, room_id).write_text("", encoding="utf-8")
    LoopStateRepository(workspace).upsert_room(
        room_id=room_id,
        room_type=room_type,
        name=name,
        status="active",
        created_by=actor,
        participants=participants or [],
        session_boundary=session_boundary or {},
        run_id=run_id,
        iteration_id=iteration_id,
        task_id=task_id,
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )
    append_event(
        workspace,
        event_type="ROOM_CREATED",
        actor={"type": "agent", "name": actor},
        scope={"task_id": task_id, "room_id": room_id, "correlation_id": task_id or room_id},
        payload={"name": name, "participants": participants or [], "room_type": room_type},
    )
    return record


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
    entry = {
        "ts_utc": created_at or utc_iso(),
        "room_id": room_id,
        "sender": sender,
        "sender_kind": sender_kind,
        "message_type": message_type,
        "text": text,
        "attachments": attachments or [],
        "task_id": task_id or meta.get("task_id"),
        "run_id": run_id or meta.get("run_id"),
        "iteration_id": iteration_id or meta.get("iteration_id"),
        "metadata": metadata or {},
    }
    meta["updated_at"] = entry["ts_utc"]
    room_meta_path(workspace, room_id).write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    with room_log_path(workspace, room_id).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
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
        run_id=entry.get("run_id"),
        iteration_id=entry.get("iteration_id"),
        sender=sender,
        sender_kind=sender_kind,
        message_type=message_type,
        content=text,
        evidence_refs=evidence_refs or attachments or [],
        metadata={"attachments": attachments or [], **(metadata or {})},
        created_at=entry["ts_utc"],
    )
    entry["message_id"] = db_entry["id"]
    append_event(
        workspace,
        event_type="ROOM_MESSAGE",
        actor={"type": "agent", "name": sender},
        scope={"task_id": entry["task_id"], "room_id": room_id, "correlation_id": entry["task_id"] or room_id, "run_id": entry.get("run_id")},
        payload={"message_type": message_type, "attachments": attachments or [], "sender_kind": sender_kind},
    )
    return entry


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

