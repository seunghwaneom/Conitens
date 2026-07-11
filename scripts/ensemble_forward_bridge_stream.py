#!/usr/bin/env python3
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from ensemble_conversation_read_service import ConversationReadService
from ensemble_forward_bridge_public_projection import public_approval_record
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository


@dataclass(frozen=True, slots=True)
class StreamPollConfig:
    interval_seconds: float = 1.0
    max_events: int | None = None


@dataclass(frozen=True, slots=True)
class StreamEvent:
    event: str
    data: dict[str, Any]
    event_id: str


def _public_stream_timeline_item(row: dict[str, Any]) -> dict[str, Any]:
    item = {
        "kind": str(row.get("kind") or "event"),
        "timestamp": str(row.get("timestamp") or row.get("created_at") or ""),
    }
    if row.get("id") is not None:
        item["id"] = row["id"]
    return item


def _timeline_sort_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("timestamp") or row.get("created_at") or row.get("updated_at") or ""),
        str(row.get("kind") or ""),
        str(row.get("id") or row.get("request_id") or row.get("room_id") or ""),
    )


def _latest_run_event(
    repository: LoopStateRepository,
    conversations: ConversationReadService,
    run_id: str,
) -> dict[str, Any] | None:
    items: list[dict[str, Any]] = []
    for room in conversations.rooms(run_id=run_id):
        items.append({"kind": "room", "timestamp": room.get("created_at"), "room_id": room.get("room_id")})
    for row in conversations.messages(run_id=run_id):
        items.append({"kind": "message", "timestamp": row.get("created_at"), "id": row.get("id")})
    for row in conversations.tool_events(run_id=run_id):
        items.append({"kind": "tool_event", "timestamp": row.get("created_at"), "id": row.get("id")})
    for row in repository.list_validator_results(run_id):
        items.append({"kind": "validator", "timestamp": row.get("created_at"), "id": row.get("id")})
    for row in repository.list_approval_requests(run_id=run_id):
        items.append({"kind": "approval", "timestamp": row.get("updated_at"), "request_id": row.get("request_id")})
    for row in conversations.insights(run_id=run_id):
        items.append({"kind": "insight", "timestamp": row.get("created_at"), "id": row.get("id")})
    for row in conversations.handoffs(run_id=run_id):
        items.append({"kind": "handoff", "timestamp": row.get("updated_at")})
    if not items:
        return None
    return _public_stream_timeline_item(sorted(items, key=_timeline_sort_key)[-1])


def _latest_room_event(conversation: ConversationReadService, room_id: str) -> dict[str, Any] | None:
    timeline = conversation.room_snapshot(room_id)["timeline"]
    if not timeline:
        return None
    return _public_stream_timeline_item(sorted(timeline, key=_timeline_sort_key)[-1])


def _stream_snapshot_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    payload: dict[str, Any] = {
        "generated_at": time.time(),
        "run_id": run_id,
        "room_id": room_id,
        "pending_approvals": [
            public_approval_record(row)
            for row in repository.list_approval_requests(run_id=run_id, status="pending")
        ],
    }
    if run_id:
        payload["latest_run_event"] = _latest_run_event(repository, conversations, run_id)
    if room_id:
        payload["latest_room_event"] = _latest_room_event(conversations, room_id)
    return payload


def serialize_sse_event(*, event: str, data: dict[str, Any], event_id: str | None = None) -> bytes:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, ensure_ascii=False)
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _snapshot_comparison_key(snapshot: dict[str, Any]) -> str:
    comparable = {key: value for key, value in snapshot.items() if key != "generated_at"}
    return json.dumps(comparable, ensure_ascii=False, sort_keys=True)


def stream_snapshot_events(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
    config: StreamPollConfig | None = None,
) -> Iterator[StreamEvent]:
    settings = config or StreamPollConfig()
    event_id = 0
    snapshot = _stream_snapshot_payload(workspace, run_id=run_id, room_id=room_id)
    last_payload_key = _snapshot_comparison_key(snapshot)
    yield StreamEvent(event="snapshot", data=snapshot, event_id=str(event_id))
    while settings.max_events is None or event_id < settings.max_events - 1:
        time.sleep(settings.interval_seconds)
        current = _stream_snapshot_payload(workspace, run_id=run_id, room_id=room_id)
        current_key = _snapshot_comparison_key(current)
        event_id += 1
        if current_key != last_payload_key:
            last_payload_key = current_key
            yield StreamEvent(event="snapshot", data=current, event_id=str(event_id))
        else:
            yield StreamEvent(
                event="heartbeat",
                data={"ts": time.time(), "run_id": run_id, "room_id": room_id},
                event_id=str(event_id),
            )


__all__ = [
    "StreamEvent",
    "StreamPollConfig",
    "_stream_snapshot_payload",
    "serialize_sse_event",
    "stream_snapshot_events",
]
