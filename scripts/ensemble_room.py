#!/usr/bin/env python3
"""
Append-only project chat room helpers.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_paths import ensure_notes_dir


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def rooms_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "rooms")


def room_meta_path(workspace: str | Path, room_id: str) -> Path:
    return rooms_dir(workspace) / f"{room_id}.json"


def room_log_path(workspace: str | Path, room_id: str) -> Path:
    return rooms_dir(workspace) / f"{room_id}.jsonl"


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
) -> dict[str, Any]:
    room_id = next_room_id(workspace)
    record = {
        "room_id": room_id,
        "schema_v": 1,
        "name": name,
        "participants": participants or [],
        "task_id": task_id,
        "created_by": actor,
        "created_at": utc_iso(),
    }
    room_meta_path(workspace, room_id).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    room_log_path(workspace, room_id).write_text("", encoding="utf-8")
    append_event(
        workspace,
        event_type="ROOM_CREATED",
        actor={"type": "agent", "name": actor},
        scope={"task_id": task_id, "room_id": room_id, "correlation_id": task_id or room_id},
        payload={"name": name, "participants": participants or []},
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
) -> dict[str, Any]:
    meta = json.loads(room_meta_path(workspace, room_id).read_text(encoding="utf-8"))
    entry = {
        "ts_utc": utc_iso(),
        "room_id": room_id,
        "sender": sender,
        "message_type": message_type,
        "text": text,
        "attachments": attachments or [],
        "task_id": task_id or meta.get("task_id"),
    }
    with room_log_path(workspace, room_id).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    append_event(
        workspace,
        event_type="ROOM_MESSAGE",
        actor={"type": "agent", "name": sender},
        scope={"task_id": entry["task_id"], "room_id": room_id, "correlation_id": entry["task_id"] or room_id},
        payload={"message_type": message_type, "attachments": attachments or []},
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
    export_path = rooms_dir(workspace) / f"{room_id}.md"
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

