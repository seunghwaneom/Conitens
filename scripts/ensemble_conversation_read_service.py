#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_conversation_legacy_reader import (
    LegacyConversationReadError,
    LegacyConversationReader,
    validate_thread_id,
)
from ensemble_events import load_events
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository


def _thread_metadata_matches(thread_id: str, thread: dict[str, Any], needle: str) -> bool:
    public_metadata = (
        thread_id,
        thread.get("kind"),
        thread.get("workspace"),
        thread.get("status"),
    )
    return any(needle in str(value or "").casefold() for value in public_metadata)


class ConversationReadService:
    def __init__(self, workspace: str | Path) -> None:
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.legacy = LegacyConversationReader(self.workspace)

    def room_snapshot(self, room_id: str, *, source: str = "repository") -> dict[str, Any]:
        if source == "legacy_compatibility":
            return self.legacy.room_snapshot(room_id)

        room = self.repository.get_room_record(room_id)
        if room is None:
            return {
                "source": "repository",
                "room": None,
                "messages": [],
                "tool_events": [],
                "insights": [],
                "timeline": [],
            }

        messages = self.repository.list_room_messages(room_id=room_id)
        tool_events = self.repository.list_tool_events(room_id=room_id)
        insights = self.repository.list_insights(room_id=room_id)
        timeline = [{"kind": "room", "created_at": room.get("created_at"), "room_id": room_id}]
        timeline.extend(
            {"kind": "message", "created_at": item.get("created_at"), "id": item.get("id")}
            for item in messages
        )
        timeline.extend(
            {"kind": "tool_event", "created_at": item.get("created_at"), "id": item.get("id")}
            for item in tool_events
        )
        timeline.extend(
            {"kind": "insight", "created_at": item.get("created_at"), "id": item.get("id")}
            for item in insights
        )
        timeline.sort(
            key=lambda item: (
                str(item.get("created_at") or ""),
                str(item.get("kind") or ""),
                str(item.get("id") or item.get("room_id") or ""),
            )
        )
        return {
            "source": "repository",
            "room": room,
            "messages": messages,
            "tool_events": tool_events,
            "insights": insights,
            "timeline": timeline,
        }

    def rooms(self, *, run_id: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_room_records(run_id=run_id)

    def messages(
        self,
        *,
        run_id: str | None = None,
        room_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if room_id is not None:
            return list(self.room_snapshot(room_id)["messages"])
        return self.repository.list_room_messages(run_id=run_id)

    def tool_events(self, *, run_id: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_tool_events(run_id=run_id)

    def insights(self, *, run_id: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_insights(run_id=run_id)

    def handoffs(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        exact = self.repository.list_handoff_packets(
            run_id=run_id,
            iteration_id=iteration_id,
            status=status,
        )
        if exact or (run_id is None and iteration_id is None):
            return exact

        rows = self.repository.list_handoff_packets(status=status)
        return [
            row
            for row in rows
            if row.get("run_id") in {None, run_id}
            and row.get("iteration_id") in {None, iteration_id}
        ]

    def thread_list(
        self,
        *,
        workspace: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        event_rows = [
            thread
            for thread in self._event_threads().values()
            if (workspace is None or thread.get("workspace") == workspace)
            and (status is None or thread.get("status") == status)
        ]
        event_ids = {str(row.get("id") or "") for row in event_rows}
        legacy_rows = [
            thread
            for thread in self.legacy.threads().values()
            if str(thread.get("id") or "") not in event_ids
            and (workspace is None or thread.get("workspace") == workspace)
            and (status is None or thread.get("status") == status)
        ]
        rows = [*event_rows, *legacy_rows]
        rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        return [
            {
                "id": str(row.get("id") or ""),
                "kind": str(row.get("kind") or ""),
                "workspace": str(row.get("workspace") or ""),
                "status": str(row.get("status") or "open"),
                "participants": list(row.get("participants") or []),
                "created_at": str(row.get("created_at") or ""),
                "updated_at": str(row.get("updated_at") or ""),
            }
            for row in rows[:limit]
        ]

    def thread_show(self, thread_id: str, *, source: str = "events") -> dict[str, Any] | None:
        safe_thread_id = validate_thread_id(thread_id)
        if source == "legacy_compatibility":
            return self.legacy.thread_show(safe_thread_id)

        thread = self._event_threads().get(safe_thread_id)
        if thread is None:
            return None
        return {
            "id": thread["id"],
            "kind": thread.get("kind", ""),
            "workspace": thread.get("workspace", ""),
            "status": thread.get("status", "open"),
            "participants": list(thread.get("participants") or []),
            "created_at": thread.get("created_at", ""),
            "updated_at": thread.get("updated_at", ""),
            "messages": list(thread.get("messages") or []),
        }

    def thread_search(self, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
        needle = query.strip().casefold()
        if not needle:
            return []
        matches: list[dict[str, Any]] = []
        for thread_id, thread in self._event_threads().items():
            if _thread_metadata_matches(thread_id, thread, needle):
                matches.append({"thread_id": thread_id})
            if len(matches) >= limit:
                break
        if len(matches) < limit:
            matched_ids = {str(row.get("thread_id") or "") for row in matches}
            for thread_id, thread in self.legacy.threads().items():
                if thread_id in matched_ids:
                    continue
                if _thread_metadata_matches(thread_id, thread, needle):
                    matches.append({"thread_id": thread_id})
                if len(matches) >= limit:
                    break
        return matches

    def _event_threads(self) -> dict[str, dict[str, Any]]:
        threads: dict[str, dict[str, Any]] = {}
        for event in self._load_workspace_events():
            event_type = str(event.get("type") or "")
            payload = event.get("payload")
            if not isinstance(payload, dict):
                continue
            thread_id = str(payload.get("thread_id") or "")
            if not thread_id:
                continue
            ts_utc = str(event.get("ts_utc") or "")
            if event_type == "thread.created":
                threads[thread_id] = {
                    "id": thread_id,
                    "kind": str(payload.get("kind") or ""),
                    "workspace": str(payload.get("workspace") or ""),
                    "status": "open",
                    "participants": list(payload.get("participants") or []),
                    "created_at": ts_utc,
                    "updated_at": ts_utc,
                    "messages": [],
                }
            elif event_type == "thread.message_appended" and thread_id in threads:
                threads[thread_id]["messages"].append(
                    {
                        "sender": str(payload.get("sender") or ""),
                        "message": str(payload.get("message") or ""),
                    }
                )
                threads[thread_id]["updated_at"] = ts_utc
            elif event_type == "thread.closed" and thread_id in threads:
                threads[thread_id]["status"] = "closed"
                threads[thread_id]["updated_at"] = ts_utc
        return threads

    def _load_workspace_events(self) -> list[dict[str, Any]]:
        return load_events(self.workspace)
