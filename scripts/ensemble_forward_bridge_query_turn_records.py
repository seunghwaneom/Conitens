#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository, utc_iso
from ensemble_forward_bridge_query_core import _conversation_messages
from ensemble_forward_bridge_query_shared import (
    TURN_RECORD_DEFAULT_LIMIT,
    TURN_RECORD_MAX_LIMIT,
)

def _bounded_turn_record_limit(limit: int | None) -> int:
    if limit is None:
        return TURN_RECORD_DEFAULT_LIMIT
    return max(1, min(int(limit), TURN_RECORD_MAX_LIMIT))


def _metadata_keys(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return []
    return sorted(str(key) for key in value)[:20]


def _evidence_refs(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item)[:180] for item in value if isinstance(item, (str, int, float))][:8]


def build_operator_turn_records_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    safe_limit = _bounded_turn_record_limit(limit)
    messages = _conversation_messages(conversations, run_id=run_id, room_id=room_id)
    tool_events = repository.list_tool_events(run_id=run_id, room_id=room_id)
    records: list[dict[str, Any]] = []

    for message in messages:
        content = str(message.get("content") or "")
        records.append(
            {
                "id": f"message:{message['id']}",
                "record_type": "message",
                "created_at": message["created_at"],
                "room_id": message.get("room_id"),
                "run_id": message.get("run_id"),
                "iteration_id": message.get("iteration_id"),
                "actor": str(message.get("sender") or "")[:120],
                "actor_kind": str(message.get("sender_kind") or "")[:60],
                "message_type": str(message.get("message_type") or "")[:80],
                "content_length": len(content),
                "content_redacted": True,
                "metadata_keys": _metadata_keys(message.get("metadata_json")),
                "evidence_refs": _evidence_refs(message.get("evidence_refs_json")),
            }
        )

    for event in tool_events:
        payload = event.get("payload_json") if isinstance(event.get("payload_json"), dict) else {}
        records.append(
            {
                "id": f"tool_event:{event['id']}",
                "record_type": "tool_event",
                "created_at": event["created_at"],
                "room_id": event.get("room_id"),
                "run_id": event.get("run_id"),
                "iteration_id": event.get("iteration_id"),
                "actor": str(event.get("actor") or "")[:120],
                "actor_kind": "agent",
                "tool_name": str(event.get("tool_name") or "")[:120],
                "payload_keys": _metadata_keys(payload),
                "payload_redacted": True,
                "evidence_refs": [],
            }
        )

    records.sort(key=lambda row: (str(row.get("created_at") or ""), str(row.get("id") or "")))
    total_records = len(records)
    if total_records > safe_limit:
        records = records[-safe_limit:]

    return {
        "generated_at": utc_iso(),
        "status": "ok",
        "scope": {
            "run_id": run_id,
            "room_id": room_id,
            "limit": safe_limit,
        },
        "records": records,
        "counts": {
            "returned": len(records),
            "total": total_records,
            "messages": len(messages),
            "tool_events": len(tool_events),
            "agent_messages": sum(1 for message in messages if str(message.get("sender_kind")) == "agent"),
            "truncated": total_records > safe_limit,
        },
        "wake_sources": [
            {
                "id": "room_messages",
                "status": "present" if messages else "empty",
                "record_count": len(messages),
                "detail": "Persisted room message metadata is available without transcript content.",
            },
            {
                "id": "tool_events",
                "status": "present" if tool_events else "empty",
                "record_count": len(tool_events),
                "detail": "Persisted tool-event metadata is available without payload values.",
            },
        ],
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_values_exposed": False,
            "metadata_values_exposed": False,
            "raw_transcript_exposed": False,
            "detail": "Turn records expose metadata, lengths, keys, and evidence refs only; message content and tool payload values are omitted.",
        },
    }


__all__ = ["build_operator_turn_records_payload"]
