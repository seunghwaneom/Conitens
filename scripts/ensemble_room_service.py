#!/usr/bin/env python3
"""
Batch 11 room persistence and timeline service.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_loop_repository import LoopStateRepository
from ensemble_room import create_room, post_room_message, room_log_path, room_meta_path


ROOM_TYPES = {"debate", "review", "decision", "user-approval", "discussion"}


def _default_sender_kind(sender: str) -> str:
    normalized = sender.strip().lower()
    if normalized in {"user", "human", "owner"}:
        return "user"
    if normalized in {"tool", "validator", "system"}:
        return "tool"
    return "agent"


class RoomService:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)

    def create_room(
        self,
        *,
        name: str,
        room_type: str,
        participants: list[str] | None = None,
        actor: str = "CLI",
        task_id: str | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        session_boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if room_type not in ROOM_TYPES:
            raise ValueError(f"Unsupported room type: {room_type}")
        return create_room(
            self.workspace,
            name=name,
            participants=participants,
            actor=actor,
            task_id=task_id,
            room_type=room_type,
            run_id=run_id,
            iteration_id=iteration_id,
            session_boundary=session_boundary or {},
        )

    def append_message(
        self,
        *,
        room_id: str,
        sender: str,
        text: str,
        message_type: str = "text",
        attachments: list[str] | None = None,
        task_id: str | None = None,
        sender_kind: str | None = None,
        evidence_refs: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        self.sync_legacy_room(room_id)
        return post_room_message(
            self.workspace,
            room_id=room_id,
            sender=sender,
            text=text,
            message_type=message_type,
            attachments=attachments,
            task_id=task_id,
            sender_kind=sender_kind or _default_sender_kind(sender),
            evidence_refs=evidence_refs,
            metadata=metadata,
            run_id=run_id,
            iteration_id=iteration_id,
            created_at=created_at,
        )

    def append_tool_event(
        self,
        *,
        room_id: str | None,
        actor: str,
        tool_name: str,
        payload: dict[str, Any],
        run_id: str | None = None,
        iteration_id: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        event = self.repository.append_tool_event(
            room_id=room_id,
            run_id=run_id,
            iteration_id=iteration_id,
            actor=actor,
            tool_name=tool_name,
            payload=payload,
            created_at=created_at,
        )
        append_event(
            self.workspace,
            event_type="ROOM_TOOL_EVENT" if room_id else "TOOL_EVENT",
            actor={"type": "agent", "name": actor},
            scope={"room_id": room_id, "run_id": run_id, "task_id": run_id, "correlation_id": run_id or room_id},
            payload={"tool_name": tool_name, "payload": payload},
        )
        return event

    def get_room(self, room_id: str) -> dict[str, Any]:
        self.sync_legacy_room(room_id)
        room = self.repository.get_room_record(room_id)
        if room is None:
            raise FileNotFoundError(f"Room not found: {room_id}")
        return room

    def list_rooms(self, *, run_id: str | None = None, iteration_id: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_room_records(run_id=run_id, iteration_id=iteration_id)

    def room_timeline(self, room_id: str) -> list[dict[str, Any]]:
        room = self.get_room(room_id)
        messages = self.repository.list_room_messages(room_id=room_id)
        tool_events = self.repository.list_tool_events(room_id=room_id)
        insights = self.repository.list_insights(room_id=room_id)
        items: list[dict[str, Any]] = [
            {
                "kind": "room",
                "timestamp": room["created_at"],
                "room_id": room_id,
                "summary": f"Room created: {room['name']}",
                "payload": room,
            }
        ]
        for row in messages:
            items.append(
                {
                    "kind": "message",
                    "timestamp": row["created_at"],
                    "room_id": room_id,
                    "summary": row["content"],
                    "payload": row,
                }
            )
        for row in tool_events:
            items.append(
                {
                    "kind": "tool_event",
                    "timestamp": row["created_at"],
                    "room_id": room_id,
                    "summary": row["tool_name"],
                    "payload": row,
                }
            )
        for row in insights:
            items.append(
                {
                    "kind": "insight",
                    "timestamp": row["created_at"],
                    "room_id": room_id,
                    "summary": row["summary"],
                    "payload": row,
                }
            )
        items.sort(key=lambda item: (item["timestamp"], item["kind"]))
        return items

    def room_snapshot(self, room_id: str) -> dict[str, Any]:
        room = self.get_room(room_id)
        return {
            "room": room,
            "messages": self.repository.list_room_messages(room_id=room_id),
            "tool_events": self.repository.list_tool_events(room_id=room_id),
            "insights": self.repository.list_insights(room_id=room_id),
            "timeline": self.room_timeline(room_id),
        }

    def bounded_context_for_run(
        self,
        run_id: str,
        *,
        room_limit: int = 2,
        per_room_messages: int = 2,
        message_char_limit: int = 80,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        rooms = self.repository.list_room_records(run_id=run_id)
        for room in rooms[:room_limit]:
            messages = self.repository.list_room_messages(room_id=room["room_id"])
            if not messages:
                continue
            selected = messages[-per_room_messages:]
            rendered = []
            for message in selected:
                rendered.append(
                    {
                        "sender": message["sender"],
                        "message_type": message["message_type"],
                        "text": self._truncate(str(message["content"]), message_char_limit),
                    }
                )
            items.append(
                {
                    "kind": "room_episode_summary",
                    "room_id": room["room_id"],
                    "room_type": room["room_type"],
                    "updated_at": room["updated_at"],
                    "messages": rendered,
                }
            )
        return items

    def sync_legacy_room(self, room_id: str) -> None:
        if self.repository.get_room_record(room_id) is not None:
            return
        meta_path = room_meta_path(self.workspace, room_id)
        if not meta_path.exists():
            return
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.repository.upsert_room(
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
            updated_at=meta.get("updated_at") or meta.get("created_at"),
        )
        log_path = room_log_path(self.workspace, room_id)
        if not log_path.exists():
            return
        for line in log_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            message = json.loads(line)
            self.repository.append_room_message(
                room_id=room_id,
                run_id=message.get("run_id"),
                iteration_id=message.get("iteration_id"),
                sender=message.get("sender") or "legacy",
                sender_kind=message.get("sender_kind") or _default_sender_kind(message.get("sender") or "legacy"),
                message_type=message.get("message_type") or "text",
                content=message.get("text") or "",
                evidence_refs=message.get("attachments") or [],
                metadata=message.get("metadata") or {},
                created_at=message.get("ts_utc"),
            )

    def _truncate(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return text[: limit - 1] + "?"


__all__ = ["ROOM_TYPES", "RoomService"]
