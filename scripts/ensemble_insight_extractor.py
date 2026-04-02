#!/usr/bin/env python3
"""
Batch 11 replay insight extraction.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_loop_repository import LoopStateRepository
from ensemble_replay_service import ReplayService


INSIGHT_KINDS = {"decision", "risk", "blocker", "hotspot", "outcome"}
HOTSPOT_TOOLS = {"apply_patch", "shell_execution", "network_access", "typecheck", "build", "test"}
PREFIX_TO_KIND = {
    "decision:": "decision",
    "risk:": "risk",
    "blocker:": "blocker",
    "hotspot:": "hotspot",
    "outcome:": "outcome",
}


class InsightExtractor:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.replay = ReplayService(self.workspace)

    def extract_from_room(self, room_id: str) -> list[dict[str, Any]]:
        snapshot = self.replay.room_timeline(room_id)
        room = snapshot["room"]
        created: list[dict[str, Any]] = []
        for message in snapshot["messages"]:
            content = str(message["content"]).strip()
            lowered = content.lower()
            for prefix, kind in PREFIX_TO_KIND.items():
                if lowered.startswith(prefix):
                    created.append(
                        self._store(
                            kind=kind,
                            summary=content[len(prefix):].strip() or content,
                            room_id=room_id,
                            run_id=message.get("run_id") or room.get("run_id"),
                            iteration_id=message.get("iteration_id") or room.get("iteration_id"),
                            evidence_refs=[f"room:{room_id}:message:{message['id']}"],
                            details={"source": "room_message", "message_type": message["message_type"]},
                        )
                    )
                    break
        for item in snapshot["tool_events"]:
            tool_name = item["tool_name"]
            if tool_name not in HOTSPOT_TOOLS:
                continue
            created.append(
                self._store(
                    kind="hotspot",
                    summary=f"Tool activity in room: {tool_name}",
                    room_id=room_id,
                    run_id=item.get("run_id") or room.get("run_id"),
                    iteration_id=item.get("iteration_id") or room.get("iteration_id"),
                    evidence_refs=[f"room:{room_id}:tool:{item['id']}"],
                    details={"source": "tool_event", "tool_name": tool_name},
                )
            )
        return created

    def extract_from_run(self, run_id: str) -> list[dict[str, Any]]:
        timeline = self.replay.run_timeline(run_id)
        created: list[dict[str, Any]] = []
        for row in timeline["validator_history"]:
            if not row["passed"]:
                created.append(
                    self._store(
                        kind="risk",
                        summary=row["feedback_text"],
                        run_id=run_id,
                        iteration_id=row["iteration_id"],
                        evidence_refs=[f"validator:{row['id']}"],
                        details={"source": "validator", "issues": row["issues_json"]},
                    )
                )
            else:
                created.append(
                    self._store(
                        kind="outcome",
                        summary=f"Validator passed for {row['iteration_id']}",
                        run_id=run_id,
                        iteration_id=row["iteration_id"],
                        evidence_refs=[f"validator:{row['id']}"],
                        details={"source": "validator"},
                    )
                )
        for row in timeline["approvals"]:
            if row["status"] == "rejected":
                created.append(
                    self._store(
                        kind="blocker",
                        summary=row.get("reviewer_note") or f"Approval rejected: {row['action_type']}",
                        run_id=run_id,
                        iteration_id=row["iteration_id"],
                        evidence_refs=[f"approval:{row['request_id']}"],
                        details={"source": "approval", "action_type": row["action_type"]},
                    )
                )
            elif row["status"] in {"approved", "edited"}:
                created.append(
                    self._store(
                        kind="decision",
                        summary=f"Approval {row['status']}: {row['action_type']}",
                        run_id=run_id,
                        iteration_id=row["iteration_id"],
                        evidence_refs=[f"approval:{row['request_id']}"],
                        details={"source": "approval", "reviewer": row.get("reviewer")},
                    )
                )
        return created

    def _store(
        self,
        *,
        kind: str,
        summary: str,
        evidence_refs: list[str],
        details: dict[str, Any],
        run_id: str | None = None,
        iteration_id: str | None = None,
        room_id: str | None = None,
    ) -> dict[str, Any]:
        if kind not in INSIGHT_KINDS:
            raise ValueError(f"Unsupported insight kind: {kind}")
        existing = self._find_existing(
            kind=kind,
            summary=summary,
            run_id=run_id,
            iteration_id=iteration_id,
            room_id=room_id,
        )
        if existing is not None:
            return existing
        insight = self.repository.append_insight(
            kind=kind,
            summary=summary,
            evidence_refs=evidence_refs,
            details=details,
            run_id=run_id,
            iteration_id=iteration_id,
            room_id=room_id,
        )
        append_event(
            self.workspace,
            event_type="INSIGHT_EXTRACTED",
            actor={"type": "agent", "name": "insight-extractor"},
            scope={"run_id": run_id, "room_id": room_id, "task_id": run_id, "correlation_id": run_id or room_id},
            payload={"kind": kind, "summary": summary, "evidence_refs": evidence_refs},
        )
        return insight

    def _find_existing(
        self,
        *,
        kind: str,
        summary: str,
        run_id: str | None,
        iteration_id: str | None,
        room_id: str | None,
    ) -> dict[str, Any] | None:
        for row in self.repository.list_insights(run_id=run_id, iteration_id=iteration_id, room_id=room_id):
            if row["kind"] == kind and row["summary"] == summary:
                return row
        return None


__all__ = ["INSIGHT_KINDS", "InsightExtractor"]
