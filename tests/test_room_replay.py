from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_room
from ensemble_ag2_room_adapter import AG2RoomAdapter
from ensemble_allowed_events import resolve_event_type
from ensemble_approval import ApprovalInterruptAdapter
from ensemble_context_assembler import ContextAssembler
from ensemble_context_markdown import ContextRegenerator, TaskPlanWriterReader
from ensemble_handoff import create_handoff, transition_handoff
from ensemble_insight_extractor import InsightExtractor
from ensemble_iteration_service import IterationService
from ensemble_events import load_events
from ensemble_loop_repository import LoopStateRepository
from ensemble_replay_service import ReplayService
from ensemble_room_service import RoomService
from ensemble_run_service import RunService
from ensemble_ui import launch_web_ui


class RoomReplayTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, str, str]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST_CONTEXT\n\nrepo digest\n", encoding="utf-8")
        (root / ".conitens" / "personas" / "sample-agent.yaml").write_text(
            "\n".join(
                [
                    "id: sample-agent",
                    "display_name: Sample Agent",
                    "role: architect",
                    "public_persona: calm and direct",
                    "private_policy:",
                    "  identity_core_locked: true",
                    "expertise_tags:",
                    "  - runtime",
                    "default_skill_refs: []",
                    "memory_namespace: sample-namespace",
                    "handoff:",
                    "  preferred_format: checklist",
                    "self_improvement:",
                    "  allow_candidate_patches: true",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        repo = LoopStateRepository(root)
        run_id = RunService(repo).create_run("Batch 11 replay test")["run_id"]
        iteration_id = IterationService(repo).append_iteration(run_id, "Room replay iteration")["iteration_id"]
        TaskPlanWriterReader(repo).update_from_structured_input(
            run_id=run_id,
            current_plan="Replay plan",
            objective="Correct objective from persisted state",
            steps=[{"title": "Replay step", "status": "in_progress", "owner": "sample-agent"}],
            acceptance_criteria=["artifact_contains:required-token"],
            owner="sample-agent",
        )
        ContextRegenerator(repo).regenerate_all(run_id)
        return root, repo, run_id, iteration_id

    def test_legacy_room_file_import_remains_supported(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        legacy_room = ensemble_room.create_room(
            root,
            name="legacy-room",
            room_type="discussion",
            participants=["user", "sample-agent"],
            actor="legacy-cli",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        ensemble_room.post_room_message(
            root,
            room_id=legacy_room["room_id"],
            sender="user",
            sender_kind="user",
            text="Legacy transcript line",
            attachments=["artifact:legacy-attachment"],
            evidence_refs=["evidence:legacy-message"],
            run_id=run_id,
            iteration_id=iteration_id,
        )

        repository = LoopStateRepository(root)
        with repository.connect() as connection:
            connection.execute("DELETE FROM messages WHERE room_id = ?", (legacy_room["room_id"],))
            connection.execute("DELETE FROM rooms WHERE room_id = ?", (legacy_room["room_id"],))

        snapshot = RoomService(root).room_snapshot(legacy_room["room_id"])

        self.assertEqual(snapshot["room"]["room_id"], legacy_room["room_id"])
        self.assertEqual(snapshot["messages"][0]["content"], "Legacy transcript line")
        self.assertEqual(snapshot["messages"][0]["sender_kind"], "user")
        self.assertEqual(snapshot["messages"][0]["evidence_refs_json"], ["evidence:legacy-message"])

    def test_room_create_event_is_appended_before_projection_writes(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        observed: list[dict[str, Any]] = []

        def capture_event(
            workspace: Path,
            *,
            event_type: str,
            scope: dict[str, Any],
            payload: dict[str, Any],
            **_: Any,
        ) -> dict[str, Any]:
            room_id = str(scope["room_id"])
            observed.append(
                {
                    "event_type": resolve_event_type(event_type),
                    "room_id": room_id,
                    "payload": payload,
                    "meta_exists": ensemble_room.room_meta_path(workspace, room_id).exists(),
                    "log_exists": ensemble_room.room_log_path(workspace, room_id).exists(),
                    "repo_room": LoopStateRepository(workspace).get_room_record(room_id),
                }
            )
            return {"event_type": resolve_event_type(event_type), "scope": scope, "payload": payload}

        with patch.object(ensemble_room, "append_event", side_effect=capture_event):
            room = ensemble_room.create_room(
                root,
                name="event-first-room",
                room_type="decision",
                participants=["user", "sample-agent"],
                actor="sample-agent",
                task_id=run_id,
                run_id=run_id,
                iteration_id=iteration_id,
            )

        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0]["event_type"], "thread.created")
        self.assertEqual(observed[0]["room_id"], room["room_id"])
        self.assertFalse(observed[0]["meta_exists"])
        self.assertFalse(observed[0]["log_exists"])
        self.assertIsNone(observed[0]["repo_room"])

    def test_room_create_append_failure_does_not_project_room_state(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()

        def fail_append(*_: Any, **__: Any) -> None:
            raise RuntimeError("event append failed")

        with patch.object(ensemble_room, "append_event", side_effect=fail_append):
            with self.assertRaises(RuntimeError):
                ensemble_room.create_room(
                    root,
                    name="atomic-create-room",
                    room_type="review",
                    participants=["user", "sample-agent"],
                    actor="sample-agent",
                    task_id=run_id,
                    run_id=run_id,
                    iteration_id=iteration_id,
                )

        room_projection_dir = root / ".notes" / "rooms"
        self.assertFalse(list(room_projection_dir.glob("*.json")) if room_projection_dir.exists() else [])
        self.assertFalse(list(room_projection_dir.glob("*.jsonl")) if room_projection_dir.exists() else [])
        self.assertEqual(LoopStateRepository(root).list_room_records(run_id=run_id), [])

    def test_room_create_projection_failure_keeps_committed_event(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()

        with patch.object(
            ensemble_room.LoopStateRepository,
            "upsert_room",
            side_effect=RuntimeError("room projection failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "room projection failed"):
                ensemble_room.create_room(
                    root,
                    name="projection-failure-room",
                    room_type="review",
                    participants=["user", "sample-agent"],
                    actor="sample-agent",
                    task_id=run_id,
                    run_id=run_id,
                    iteration_id=iteration_id,
                )

        created_events = [
            event
            for event in load_events(root)
            if event["type"] == "thread.created"
            and event.get("payload", {}).get("name") == "projection-failure-room"
        ]
        self.assertEqual(len(created_events), 1)
        room_id = created_events[0]["payload"]["room_id"]
        self.assertTrue(ensemble_room.room_meta_path(root, room_id).exists())
        self.assertTrue(ensemble_room.room_log_path(root, room_id).exists())
        self.assertIsNone(LoopStateRepository(root).get_room_record(room_id))

    def test_room_message_event_is_appended_before_projection_writes(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = ensemble_room.create_room(
            root,
            name="message-event-first-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        baseline_log_lines = ensemble_room.room_log_path(root, room["room_id"]).read_text(encoding="utf-8").splitlines()
        baseline_updated_at = json.loads(ensemble_room.room_meta_path(root, room["room_id"]).read_text(encoding="utf-8"))["updated_at"]
        observed: list[dict[str, Any]] = []

        def capture_event(
            workspace: Path,
            *,
            event_type: str,
            scope: dict[str, Any],
            payload: dict[str, Any],
            **_: Any,
        ) -> dict[str, Any]:
            observed.append(
                {
                    "event_type": resolve_event_type(event_type),
                    "payload": payload,
                    "log_lines": ensemble_room.room_log_path(workspace, room["room_id"]).read_text(encoding="utf-8").splitlines(),
                    "updated_at": json.loads(ensemble_room.room_meta_path(workspace, room["room_id"]).read_text(encoding="utf-8"))["updated_at"],
                    "repo_messages": LoopStateRepository(workspace).list_room_messages(room_id=room["room_id"]),
                }
            )
            return {"event_type": resolve_event_type(event_type), "scope": scope, "payload": payload}

        with patch.object(ensemble_room, "append_event", side_effect=capture_event):
            message = ensemble_room.post_room_message(
                root,
                room_id=room["room_id"],
                sender="user",
                sender_kind="user",
                text="Message must be committed as an event first",
                run_id=run_id,
                iteration_id=iteration_id,
            )

        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0]["event_type"], "thread.message_appended")
        self.assertEqual(message["room_id"], room["room_id"])
        self.assertEqual(observed[0]["log_lines"], baseline_log_lines)
        self.assertEqual(observed[0]["updated_at"], baseline_updated_at)
        self.assertEqual(observed[0]["repo_messages"], [])

    def test_room_message_append_failure_does_not_project_message_state(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = ensemble_room.create_room(
            root,
            name="atomic-message-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        meta_path = ensemble_room.room_meta_path(root, room["room_id"])
        log_path = ensemble_room.room_log_path(root, room["room_id"])
        baseline_meta = meta_path.read_text(encoding="utf-8")
        baseline_log = log_path.read_text(encoding="utf-8")
        baseline_messages = LoopStateRepository(root).list_room_messages(room_id=room["room_id"])

        def fail_append(*_: Any, **__: Any) -> None:
            raise RuntimeError("event append failed")

        with patch.object(ensemble_room, "append_event", side_effect=fail_append):
            with self.assertRaises(RuntimeError):
                ensemble_room.post_room_message(
                    root,
                    room_id=room["room_id"],
                    sender="user",
                    sender_kind="user",
                    text="This projection must not survive a failed event append",
                    run_id=run_id,
                    iteration_id=iteration_id,
                )

        self.assertEqual(meta_path.read_text(encoding="utf-8"), baseline_meta)
        self.assertEqual(log_path.read_text(encoding="utf-8"), baseline_log)
        self.assertEqual(LoopStateRepository(root).list_room_messages(room_id=room["room_id"]), baseline_messages)

    def test_room_message_projection_failure_keeps_committed_event(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = ensemble_room.create_room(
            root,
            name="message-projection-failure-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )

        with patch.object(
            ensemble_room.LoopStateRepository,
            "append_room_message",
            side_effect=RuntimeError("message projection failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "message projection failed"):
                ensemble_room.post_room_message(
                    root,
                    room_id=room["room_id"],
                    sender="sample-agent",
                    sender_kind="agent",
                    text="Committed event survives projection failure",
                    run_id=run_id,
                    iteration_id=iteration_id,
                )

        message_events = [
            event
            for event in load_events(root)
            if event["type"] == "thread.message_appended"
            and event.get("payload", {}).get("content")
            == "Committed event survives projection failure"
        ]
        self.assertEqual(len(message_events), 1)
        self.assertRegex(message_events[0]["payload"]["message_id"], r"^msg:")
        self.assertEqual(
            LoopStateRepository(root).list_room_messages(room_id=room["room_id"]),
            [],
        )

    def test_room_message_event_payload_is_replay_sufficient(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = ensemble_room.create_room(
            root,
            name="replay-payload-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        observed: list[dict[str, Any]] = []

        def capture_event(
            workspace: Path,
            *,
            event_type: str,
            actor: dict[str, str],
            scope: dict[str, Any],
            payload: dict[str, Any],
            **_: Any,
        ) -> dict[str, Any]:
            observed.append(
                {
                    "event_type": resolve_event_type(event_type),
                    "actor": actor,
                    "scope": scope,
                    "payload": payload,
                    "repo_messages": LoopStateRepository(workspace).list_room_messages(room_id=room["room_id"]),
                }
            )
            return {"event_type": resolve_event_type(event_type), "scope": scope, "payload": payload}

        with patch.object(ensemble_room, "append_event", side_effect=capture_event):
            ensemble_room.post_room_message(
                root,
                room_id=room["room_id"],
                sender="sample-agent",
                sender_kind="agent",
                text="DECISION: room messages must replay from events",
                message_type="text",
                attachments=["artifact:room-note"],
                evidence_refs=["evidence:room-note"],
                metadata={"importance": "high"},
                run_id=run_id,
                iteration_id=iteration_id,
                created_at="2026-04-01T00:00:01Z",
            )

        self.assertEqual(len(observed), 1)
        event = observed[0]
        payload = event["payload"]
        scope = event["scope"]
        self.assertEqual(event["event_type"], "thread.message_appended")
        self.assertEqual(scope["room_id"], room["room_id"])
        self.assertEqual(scope["run_id"], run_id)
        self.assertIn("room_id", payload)
        self.assertIn("message_id", payload)
        self.assertIn("sender", payload)
        self.assertIn("content", payload)
        self.assertIn("created_at", payload)
        self.assertIn("evidence_refs", payload)
        self.assertIn("metadata", payload)
        self.assertEqual(payload["room_id"], room["room_id"])
        self.assertRegex(str(payload["message_id"]), r"^msg:[A-Za-z0-9._:-]+$")
        self.assertEqual(payload["sender"], "sample-agent")
        self.assertEqual(payload["sender_kind"], "agent")
        self.assertEqual(payload["message_type"], "text")
        self.assertEqual(payload["content"], "DECISION: room messages must replay from events")
        self.assertEqual(payload["created_at"], "2026-04-01T00:00:01Z")
        self.assertEqual(payload["evidence_refs"], ["evidence:room-note"])
        self.assertEqual(payload["metadata"], {"importance": "high", "attachments": ["artifact:room-note"]})
        self.assertEqual(event["repo_messages"], [])

    def test_room_message_returns_authority_and_projection_ids(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = ensemble_room.create_room(
            root,
            name="message-identity-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )

        message = ensemble_room.post_room_message(
            root,
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="Stable authority identity",
            attachments=["artifact:identity-note"],
            run_id=run_id,
            iteration_id=iteration_id,
        )

        log_entry = json.loads(
            ensemble_room.room_log_path(root, room["room_id"])
            .read_text(encoding="utf-8")
            .strip()
        )
        stored = LoopStateRepository(root).list_room_messages(room_id=room["room_id"])
        self.assertRegex(message["message_id"], r"^msg:[A-Za-z0-9._:-]+$")
        self.assertIsInstance(message["id"], int)
        self.assertEqual(log_entry["message_id"], message["message_id"])
        self.assertEqual(stored[0]["id"], message["id"])
        self.assertEqual(stored[0]["evidence_refs_json"], ["artifact:identity-note"])

    def test_room_tool_event_is_appended_before_projection(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        room = rooms.create_room(
            name="tool-event-first-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        observed: list[dict[str, Any]] = []

        def capture_event(
            workspace: Path,
            *,
            event_type: str,
            payload: dict[str, Any],
            **_: Any,
        ) -> dict[str, Any]:
            observed.append(
                {
                    "event_type": resolve_event_type(event_type),
                    "payload": payload,
                    "stored": LoopStateRepository(workspace).list_tool_events(
                        room_id=room["room_id"]
                    ),
                }
            )
            return {"type": resolve_event_type(event_type), "payload": payload}

        with patch("ensemble_room_service.append_event", side_effect=capture_event):
            rooms.append_tool_event(
                room_id=room["room_id"],
                actor="sample-agent",
                tool_name="validator",
                payload={"status": "checked"},
                run_id=run_id,
                iteration_id=iteration_id,
                created_at="2026-04-01T00:00:02Z",
            )

        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0]["event_type"], "interaction.command_executed")
        self.assertEqual(observed[0]["stored"], [])
        self.assertEqual(observed[0]["payload"]["room_id"], room["room_id"])
        self.assertEqual(observed[0]["payload"]["actor"], "sample-agent")
        self.assertEqual(observed[0]["payload"]["tool_name"], "validator")
        self.assertEqual(observed[0]["payload"]["payload"], {"status": "checked"})
        self.assertEqual(observed[0]["payload"]["created_at"], "2026-04-01T00:00:02Z")

    def test_room_tool_event_append_failure_does_not_project_state(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        room = rooms.create_room(
            name="tool-event-append-failure-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )

        with patch(
            "ensemble_room_service.append_event",
            side_effect=RuntimeError("tool event append failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "tool event append failed"):
                rooms.append_tool_event(
                    room_id=room["room_id"],
                    actor="sample-agent",
                    tool_name="validator",
                    payload={"status": "checked"},
                    run_id=run_id,
                    iteration_id=iteration_id,
                )

        self.assertEqual(
            LoopStateRepository(root).list_tool_events(room_id=room["room_id"]),
            [],
        )

    def test_create_room_persists_room_record(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        adapter = AG2RoomAdapter(root)

        room = adapter.create_decision_room(
            name="decision-room",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
            objective="DECISION: keep transcripts out of execution packets",
        )
        stored = repo.get_room_record(room["room_id"])

        self.assertIsNotNone(stored)
        self.assertEqual(stored["room_type"], "decision")
        self.assertEqual(stored["run_id"], run_id)
        self.assertEqual(stored["iteration_id"], iteration_id)
        self.assertEqual(stored["session_boundary_json"]["backend"], "local-fallback")

    def test_append_user_agent_and_tool_events(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        room = rooms.create_room(
            name="review-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )

        rooms.append_message(room_id=room["room_id"], sender="user", sender_kind="user", text="RISK: shipping without replay is unsafe", run_id=run_id, iteration_id=iteration_id)
        rooms.append_message(room_id=room["room_id"], sender="sample-agent", sender_kind="agent", text="DECISION: add replay queries first", run_id=run_id, iteration_id=iteration_id)
        rooms.append_tool_event(room_id=room["room_id"], actor="sample-agent", tool_name="validator", payload={"status": "checked"}, run_id=run_id, iteration_id=iteration_id)

        snapshot = rooms.room_snapshot(room["room_id"])

        self.assertEqual(len(snapshot["messages"]), 2)
        self.assertEqual(len(snapshot["tool_events"]), 1)
        self.assertEqual(snapshot["messages"][0]["sender_kind"], "user")
        self.assertEqual(snapshot["tool_events"][0]["tool_name"], "validator")

    def test_replay_timeline_ordering(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        replay = ReplayService(root)
        room = rooms.create_room(
            name="debate-room",
            room_type="debate",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        rooms.append_message(room_id=room["room_id"], sender="user", sender_kind="user", text="BLOCKER: missing replay API", run_id=run_id, iteration_id=iteration_id, created_at="2026-04-01T00:00:01.000000Z")
        rooms.append_tool_event(room_id=room["room_id"], actor="sample-agent", tool_name="room.post", payload={"ok": True}, run_id=run_id, iteration_id=iteration_id, created_at="2026-04-01T00:00:02.000000Z")
        handoff = create_handoff(root, from_actor="sample-agent", to_actor="reviewer", summary="handoff replay room", run_id=run_id, task_id=run_id, iteration_id=iteration_id)
        transition_handoff(root, handoff_id=handoff["handoff_id"], state="completed", actor="reviewer", detail="done")
        _repo = LoopStateRepository(root)
        _repo.record_validator_result(run_id=run_id, iteration_id=iteration_id, passed=False, issues=[{"message": "validator failed"}], feedback_text="validator failed")
        approval = ApprovalInterruptAdapter(root).enqueue_request(run_id=run_id, iteration_id=iteration_id, actor="sample-agent", action_type="shell_execution", action_payload={"command": "echo hi"})
        ApprovalInterruptAdapter(root).decide(request_id=approval["request_id"], status="approved", reviewer="owner", reviewer_note="ok")
        InsightExtractor(root).extract_from_room(room["room_id"])

        timeline = replay.run_timeline(run_id)
        kinds = [item["kind"] for item in timeline["timeline"]]

        self.assertIn("message", kinds)
        self.assertIn("tool_event", kinds)
        self.assertIn("validator", kinds)
        self.assertIn("approval", kinds)
        self.assertIn("handoff", kinds)

    def test_room_session_persistence_boundaries(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        adapter = AG2RoomAdapter(root, max_recent_messages=3, max_chars=40)
        room = adapter.create_review_room(
            name="review-room",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
            objective="Keep room state bounded",
        )
        for index in range(6):
            adapter.append_agent_message(room_id=room["room_id"], sender="sample-agent", text=f"message-{index}-" + ("x" * 20), run_id=run_id, iteration_id=iteration_id)

        bounded = adapter.bounded_history(room["room_id"])

        self.assertLessEqual(len(bounded), 3)
        self.assertLessEqual(sum(len(row["content"]) for row in bounded), 40)
        self.assertEqual(RoomService(root).get_room(room["room_id"])["session_boundary_json"]["backend"], "local-fallback")

    def test_insight_extraction_output_shape(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        room = rooms.create_room(
            name="decision-room",
            room_type="decision",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        rooms.append_message(room_id=room["room_id"], sender="sample-agent", sender_kind="agent", text="DECISION: ship replay first", run_id=run_id, iteration_id=iteration_id)
        rooms.append_message(room_id=room["room_id"], sender="user", sender_kind="user", text="RISK: validator history might be hidden", run_id=run_id, iteration_id=iteration_id)

        insights = InsightExtractor(root).extract_from_room(room["room_id"])

        self.assertEqual({item["kind"] for item in insights}, {"decision", "risk"})
        self.assertTrue(all(isinstance(item["evidence_refs_json"], list) for item in insights))
        self.assertTrue(all(isinstance(item["details_json"], dict) for item in insights))

    def test_insight_extraction_is_idempotent_for_same_room(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        rooms = RoomService(root)
        room = rooms.create_room(
            name="decision-room",
            room_type="decision",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        rooms.append_message(room_id=room["room_id"], sender="sample-agent", sender_kind="agent", text="DECISION: keep replay additive", run_id=run_id, iteration_id=iteration_id)

        first = InsightExtractor(root).extract_from_room(room["room_id"])
        second = InsightExtractor(root).extract_from_room(room["room_id"])

        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 1)
        self.assertEqual(first[0]["id"], second[0]["id"])

    def test_room_transcript_is_not_sole_execution_memory(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = RoomService(root).create_room(
            name="debate-room",
            room_type="debate",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        for index in range(8):
            RoomService(root).append_message(
                room_id=room["room_id"],
                sender="user",
                sender_kind="user",
                text=f"Wrong objective from transcript {index}",
                run_id=run_id,
                iteration_id=iteration_id,
            )

        packet = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run_id)["packet"]

        self.assertEqual(packet["objective"], "Correct objective from persisted state")
        self.assertLessEqual(len(packet["recent_message_slice"]), 3)

    def test_replay_api_route_exposes_room_and_insights(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        room = RoomService(root).create_room(
            name="review-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        RoomService(root).append_message(
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="DECISION: expose replay via dashboard",
            run_id=run_id,
            iteration_id=iteration_id,
        )
        InsightExtractor(root).extract_from_room(room["room_id"])
        launched = launch_web_ui(root, host="127.0.0.1", port=8878)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8878/api/replay/room/" + room["room_id"], timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            room_request = Request(
                "http://127.0.0.1:8878/api/replay/room/" + room["room_id"],
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(room_request, timeout=10) as response:
                room_payload = json.loads(response.read().decode("utf-8"))
            insights_request = Request(
                "http://127.0.0.1:8878/api/insights?room_id=" + room["room_id"],
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(insights_request, timeout=10) as response:
                insights_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(room_payload["room"]["room_id"], room["room_id"])
        self.assertTrue(room_payload["timeline"])
        self.assertTrue(insights_payload)

    def test_invalid_room_identifier_is_rejected_by_api(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_web_ui(root, host="127.0.0.1", port=8879)
        try:
            request = Request(
                "http://127.0.0.1:8879/api/replay/room/..%2F..%2Fsecret",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()

    def test_invalid_run_identifier_is_rejected_by_api(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_web_ui(root, host="127.0.0.1", port=8880)
        try:
            request = Request(
                "http://127.0.0.1:8880/api/replay/run/..%2F..%2Fevil",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()

    def test_invalid_insights_identifier_is_rejected_by_api(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_web_ui(root, host="127.0.0.1", port=8881)
        try:
            request = Request(
                "http://127.0.0.1:8881/api/insights?room_id=..%2F..%2Fsecret",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()


if __name__ == "__main__":
    unittest.main()
