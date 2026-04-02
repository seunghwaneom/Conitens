#!/usr/bin/env python3
"""
Batch 11 replay timeline queries.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService


def _sorted(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: (item.get("timestamp") or "", item.get("kind") or "", item.get("id") or 0))


class ReplayService:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.rooms = RoomService(self.workspace)

    def room_timeline(self, room_id: str) -> dict[str, Any]:
        snapshot = self.rooms.room_snapshot(room_id)
        return {
            "room": snapshot["room"],
            "timeline": snapshot["timeline"],
            "messages": snapshot["messages"],
            "tool_events": snapshot["tool_events"],
            "insights": snapshot["insights"],
        }

    def run_timeline(self, run_id: str) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        validator_rows = self.repository.list_validator_results(run_id)
        for room in self.repository.list_room_records(run_id=run_id):
            items.append({"kind": "room", "timestamp": room["created_at"], "summary": room["name"], "payload": room})
        for row in self.repository.list_room_messages(run_id=run_id):
            items.append({"kind": "message", "timestamp": row["created_at"], "summary": row["content"], "payload": row, "id": row["id"]})
        for row in self.repository.list_tool_events(run_id=run_id):
            items.append({"kind": "tool_event", "timestamp": row["created_at"], "summary": row["tool_name"], "payload": row, "id": row["id"]})
        for row in validator_rows:
            items.append(
                {
                    "kind": "validator",
                    "timestamp": row["created_at"],
                    "summary": row["feedback_text"],
                    "payload": row,
                    "id": row["id"],
                }
            )
        for row in self.repository.list_approval_requests(run_id=run_id):
            items.append(
                {
                    "kind": "approval",
                    "timestamp": row["updated_at"],
                    "summary": f"{row['status']}: {row['action_type']}",
                    "payload": row,
                }
            )
        for row in self.repository.list_insights(run_id=run_id):
            items.append({"kind": "insight", "timestamp": row["created_at"], "summary": row["summary"], "payload": row, "id": row["id"]})
        for row in self.repository.list_handoff_packets(run_id=run_id):
            items.append({"kind": "handoff", "timestamp": row["updated_at"], "summary": row["summary"], "payload": row})
        return {
            "run": self.repository.get_run(run_id),
            "timeline": _sorted(items),
            "validator_history": validator_rows,
            "approvals": self.repository.list_approval_requests(run_id=run_id),
            "insights": self.repository.list_insights(run_id=run_id),
            "handoff_packets": self.repository.list_handoff_packets(run_id=run_id),
        }

    def iteration_timeline(self, iteration_id: str) -> dict[str, Any]:
        iteration = self.repository.get_iteration(iteration_id)
        items: list[dict[str, Any]] = []
        validator_rows = [row for row in self.repository.list_validator_results(iteration["run_id"]) if row["iteration_id"] == iteration_id]
        for room in self.repository.list_room_records(iteration_id=iteration_id):
            items.append({"kind": "room", "timestamp": room["created_at"], "summary": room["name"], "payload": room})
        for row in self.repository.list_room_messages(iteration_id=iteration_id):
            items.append({"kind": "message", "timestamp": row["created_at"], "summary": row["content"], "payload": row, "id": row["id"]})
        for row in self.repository.list_tool_events(iteration_id=iteration_id):
            items.append({"kind": "tool_event", "timestamp": row["created_at"], "summary": row["tool_name"], "payload": row, "id": row["id"]})
        for row in validator_rows:
            items.append({"kind": "validator", "timestamp": row["created_at"], "summary": row["feedback_text"], "payload": row, "id": row["id"]})
        for row in self.repository.list_approval_requests(iteration_id=iteration_id):
            items.append({"kind": "approval", "timestamp": row["updated_at"], "summary": f"{row['status']}: {row['action_type']}", "payload": row})
        for row in self.repository.list_insights(iteration_id=iteration_id):
            items.append({"kind": "insight", "timestamp": row["created_at"], "summary": row["summary"], "payload": row, "id": row["id"]})
        for row in self.repository.list_handoff_packets(iteration_id=iteration_id):
            items.append({"kind": "handoff", "timestamp": row["updated_at"], "summary": row["summary"], "payload": row})
        return {
            "iteration": iteration,
            "timeline": _sorted(items),
            "validator_history": validator_rows,
            "approvals": self.repository.list_approval_requests(iteration_id=iteration_id),
            "insights": self.repository.list_insights(iteration_id=iteration_id),
            "handoff_packets": self.repository.list_handoff_packets(iteration_id=iteration_id),
        }

    def validator_history(self, run_id: str) -> list[dict[str, Any]]:
        return self.repository.list_validator_results(run_id)

    def approvals(self, run_id: str) -> list[dict[str, Any]]:
        return self.repository.list_approval_requests(run_id=run_id)

    def insights(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        room_id: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        return self.repository.list_insights(run_id=run_id, iteration_id=iteration_id, room_id=room_id, limit=limit)


__all__ = ["ReplayService"]
