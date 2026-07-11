#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService, LegacyConversationReadError
from ensemble_forward import _sanitize_public_text
from ensemble_forward_bridge_public_projection import public_approval_record, public_handoff_record
from ensemble_forward_public_context import build_public_context_latest_payload, build_public_state_docs_payload
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_forward_bridge_query_core import _ensure_run_exists, _public_actor_label
from ensemble_forward_bridge_query_shared import (
    PUBLIC_CONVERSATION_ITEM_LIMIT,
)

def build_approvals_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    iteration_id: str | None = None,
    task_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    return {
        "approvals": [
            public_approval_record(row)
            for row in repository.list_approval_requests(
                run_id=run_id,
                iteration_id=iteration_id,
                task_id=task_id,
                status=status,
            )
        ],
    }


def build_approval_detail_payload(workspace: str | Path, request_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    approval = repository.get_approval_request(request_id)
    if approval is None:
        raise FileNotFoundError(f"Approval request not found: {request_id}")
    return {"approval": public_approval_record(approval)}


def build_run_state_docs_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    _ensure_run_exists(LoopStateRepository(workspace), run_id)
    return build_public_state_docs_payload(workspace, run_id)


def build_run_context_latest_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    _ensure_run_exists(LoopStateRepository(workspace), run_id)
    return build_public_context_latest_payload(workspace, run_id)


def build_handoffs_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    iteration_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    rows = ConversationReadService(workspace).handoffs(
        run_id=run_id,
        iteration_id=iteration_id,
        status=status,
    )
    public_rows = [public_handoff_record(row) for row in rows]
    return {"handoffs": public_rows, "count": len(public_rows)}


def build_threads_payload(
    workspace: str | Path,
    *,
    workspace_ref: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit), 100))
    rows = ConversationReadService(workspace).thread_list(
        workspace=workspace_ref,
        status=status,
        limit=safe_limit,
    )
    return {"threads": rows, "total": len(rows)}


def build_thread_detail_payload(workspace: str | Path, thread_id: str) -> dict[str, Any]:
    conversations = ConversationReadService(workspace)
    detail = conversations.thread_show(thread_id)
    if detail is None:
        detail = conversations.thread_show(thread_id, source="legacy_compatibility")
    if detail is None:
        raise FileNotFoundError(f"Thread {thread_id} not found")
    messages = detail.get("messages") if isinstance(detail.get("messages"), list) else []
    participants = detail.get("participants") if isinstance(detail.get("participants"), list) else []
    return {
        "id": str(detail.get("id") or thread_id),
        "kind": str(detail.get("kind") or ""),
        "workspace": _sanitize_public_text(str(detail.get("workspace") or ""), workspace) or "",
        "status": str(detail.get("status") or "open"),
        "participants": [
            public_label
            for participant in participants[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            for public_label in [_public_actor_label(participant)]
            if public_label
        ],
        "created_at": str(detail.get("created_at") or ""),
        "updated_at": str(detail.get("updated_at") or ""),
        "message_count": len(messages),
        "messages": [
            {
                "sender": _public_actor_label(message.get("sender")) or "participant",
                "content_exposed": False,
            }
            for message in messages[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            if isinstance(message, dict)
        ],
        "source": str(detail.get("source") or "events"),
    }


def build_thread_search_payload(
    workspace: str | Path,
    query: str,
    *,
    limit: int = 20,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit), 100))
    rows = ConversationReadService(workspace).thread_search(query, limit=safe_limit)
    results = [
        {"thread_id": str(row.get("thread_id") or ""), "matched": True}
        for row in rows
        if isinstance(row, dict) and row.get("thread_id")
    ]
    return {"results": results, "total": len(results)}


def build_room_timeline_payload(workspace: str | Path, room_id: str) -> dict[str, Any]:
    conversations = ConversationReadService(workspace)
    snapshot = conversations.room_snapshot(room_id)
    if snapshot["room"] is None:
        try:
            snapshot = conversations.room_snapshot(room_id, source="legacy_compatibility")
        except LegacyConversationReadError as exc:
            raise FileNotFoundError(f"Room not found: {room_id}") from exc
    room = snapshot["room"] if isinstance(snapshot.get("room"), dict) else {}
    messages = snapshot["messages"] if isinstance(snapshot.get("messages"), list) else []
    tool_events = snapshot["tool_events"] if isinstance(snapshot.get("tool_events"), list) else []
    insights = snapshot["insights"] if isinstance(snapshot.get("insights"), list) else []
    timeline = snapshot["timeline"] if isinstance(snapshot.get("timeline"), list) else []
    participants = room.get("participants_json") if isinstance(room.get("participants_json"), list) else []
    return {
        "room": {
            "room_id": str(room.get("room_id") or room_id),
            "run_id": room.get("run_id"),
            "iteration_id": room.get("iteration_id"),
            "task_id": room.get("task_id"),
            "room_type": str(room.get("room_type") or ""),
            "name": _sanitize_public_text(str(room.get("name") or ""), workspace) or "",
            "status": str(room.get("status") or ""),
            "created_by": _public_actor_label(room.get("created_by")),
            "participants_json": [
                public_label
                for participant in participants[:PUBLIC_CONVERSATION_ITEM_LIMIT]
                for public_label in [_public_actor_label(participant)]
                if public_label
            ],
            "created_at": str(room.get("created_at") or ""),
            "updated_at": str(room.get("updated_at") or ""),
        },
        "timeline": [
            {
                "kind": str(item.get("kind") or "event"),
                "created_at": str(item.get("created_at") or ""),
                "id": item.get("id") or item.get("room_id"),
            }
            for item in timeline[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            if isinstance(item, dict)
        ],
        "messages": [
            {
                "id": item.get("id"),
                "room_id": item.get("room_id"),
                "run_id": item.get("run_id"),
                "iteration_id": item.get("iteration_id"),
                "sender": _public_actor_label(item.get("sender")) or "participant",
                "sender_kind": str(item.get("sender_kind") or ""),
                "message_type": str(item.get("message_type") or ""),
                "created_at": str(item.get("created_at") or item.get("ts_utc") or ""),
                "content_exposed": False,
            }
            for item in messages[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            if isinstance(item, dict)
        ],
        "tool_events": [
            {
                "id": item.get("id"),
                "room_id": item.get("room_id"),
                "run_id": item.get("run_id"),
                "iteration_id": item.get("iteration_id"),
                "actor": _public_actor_label(item.get("actor")) or "agent",
                "tool_name": str(item.get("tool_name") or ""),
                "created_at": str(item.get("created_at") or ""),
                "payload_exposed": False,
            }
            for item in tool_events[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            if isinstance(item, dict)
        ],
        "insights": [
            {
                "id": item.get("id"),
                "room_id": item.get("room_id"),
                "run_id": item.get("run_id"),
                "iteration_id": item.get("iteration_id"),
                "kind": str(item.get("kind") or ""),
                "summary": _sanitize_public_text(str(item.get("summary") or ""), workspace) or "",
                "created_at": str(item.get("created_at") or ""),
                "details_exposed": False,
            }
            for item in insights[:PUBLIC_CONVERSATION_ITEM_LIMIT]
            if isinstance(item, dict)
        ],
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_exposed": False,
            "insight_details_exposed": False,
            "session_boundary_exposed": False,
        },
    }


__all__ = [
    "build_approval_detail_payload",
    "build_approvals_payload",
    "build_handoffs_payload",
    "build_room_timeline_payload",
    "build_run_context_latest_payload",
    "build_run_state_docs_payload",
    "build_thread_detail_payload",
    "build_thread_search_payload",
    "build_threads_payload",
]
