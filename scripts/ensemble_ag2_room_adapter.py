#!/usr/bin/env python3
"""
Batch 11 AG2-compatible room adapter.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from ensemble_room_service import RoomService


AG2_AVAILABLE = any(
    importlib.util.find_spec(name) is not None for name in ("ag2", "autogen", "autogen_agentchat")
)

ROOM_KIND_MAP = {
    "debate": "debate",
    "review": "review",
    "decision": "decision",
    "user-approval": "user-approval",
    "discussion": "discussion",
}


class AG2RoomAdapter:
    def __init__(self, workspace: str | Path, *, max_recent_messages: int = 12, max_chars: int = 4000):
        self.workspace = Path(workspace)
        self.rooms = RoomService(self.workspace)
        self.max_recent_messages = max_recent_messages
        self.max_chars = max_chars
        self.backend = "ag2" if AG2_AVAILABLE else "local-fallback"

    def create_episode(
        self,
        *,
        room_kind: str,
        name: str,
        participants: list[str],
        actor: str,
        task_id: str | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        objective: str | None = None,
    ) -> dict[str, Any]:
        if room_kind not in ROOM_KIND_MAP:
            raise ValueError(f"Unsupported room kind: {room_kind}")
        room = self.rooms.create_room(
            name=name,
            room_type=ROOM_KIND_MAP[room_kind],
            participants=participants,
            actor=actor,
            task_id=task_id,
            run_id=run_id,
            iteration_id=iteration_id,
            session_boundary={
                "backend": self.backend,
                "max_recent_messages": self.max_recent_messages,
                "max_chars": self.max_chars,
                "objective": objective,
            },
        )
        if objective:
            self.rooms.append_message(
                room_id=room["room_id"],
                sender=actor,
                sender_kind="agent",
                message_type="objective",
                text=objective,
                task_id=task_id,
                run_id=run_id,
                iteration_id=iteration_id,
            )
        return room

    def create_debate_room(self, **kwargs: Any) -> dict[str, Any]:
        return self.create_episode(room_kind="debate", **kwargs)

    def create_review_room(self, **kwargs: Any) -> dict[str, Any]:
        return self.create_episode(room_kind="review", **kwargs)

    def create_decision_room(self, **kwargs: Any) -> dict[str, Any]:
        return self.create_episode(room_kind="decision", **kwargs)

    def create_user_approval_room(self, **kwargs: Any) -> dict[str, Any]:
        return self.create_episode(room_kind="user-approval", **kwargs)

    def append_user_message(self, *, room_id: str, sender: str, text: str, **kwargs: Any) -> dict[str, Any]:
        return self.rooms.append_message(room_id=room_id, sender=sender, sender_kind="user", text=text, **kwargs)

    def append_agent_message(self, *, room_id: str, sender: str, text: str, message_type: str = "text", **kwargs: Any) -> dict[str, Any]:
        return self.rooms.append_message(
            room_id=room_id,
            sender=sender,
            sender_kind="agent",
            text=text,
            message_type=message_type,
            **kwargs,
        )

    def append_tool_event(self, *, room_id: str, actor: str, tool_name: str, payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return self.rooms.append_tool_event(room_id=room_id, actor=actor, tool_name=tool_name, payload=payload, **kwargs)

    def bounded_history(self, room_id: str) -> list[dict[str, Any]]:
        snapshot = self.rooms.room_snapshot(room_id)
        rows = snapshot["messages"][-self.max_recent_messages :]
        total_chars = 0
        kept: list[dict[str, Any]] = []
        for row in reversed(rows):
            content = row["content"]
            if not kept and len(content) > self.max_chars:
                truncated = dict(row)
                truncated["content"] = content[: self.max_chars]
                kept.append(truncated)
                total_chars = len(truncated["content"])
                break
            next_chars = total_chars + len(content)
            if kept and next_chars > self.max_chars:
                break
            kept.append(row)
            total_chars = next_chars
        kept.reverse()
        return kept


__all__ = ["AG2_AVAILABLE", "AG2RoomAdapter", "ROOM_KIND_MAP"]
