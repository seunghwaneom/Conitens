from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_ag2_room_adapter import AG2RoomAdapter
from ensemble_approval import ApprovalInterruptAdapter
from ensemble_context_assembler import ContextAssembler
from ensemble_context_markdown import ContextRegenerator, TaskPlanWriterReader
from ensemble_handoff import create_handoff, transition_handoff
from ensemble_insight_extractor import InsightExtractor
from ensemble_iteration_service import IterationService
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
