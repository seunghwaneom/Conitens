from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_allowed_events import resolve_event_type
from ensemble_events import load_events
from ensemble_handoff import create_handoff, handoff_path, transition_handoff
from ensemble_loop_repository import LoopStateRepository
from ensemble_meeting import (
    append_meeting_record,
    end_meeting,
    get_active_meeting_file,
    load_transcript,
    meeting_path,
    say,
    start_meeting,
    summary_path,
    write_active_meeting,
)
from ensemble_spawn import (
    _write_spawn_record,
    refresh_spawn_record,
    spawn_record_path,
    start_spawn,
    stop_spawn,
)


class MeetingSpawnAuthorityTests(unittest.TestCase):
    def _seed_meeting(self, workspace: Path) -> tuple[str, dict[str, object]]:
        meeting_id = "MTG-20260710-001"
        start_record: dict[str, object] = {
            "msg_v": 1,
            "ts_utc": "2026-07-10T00:00:00Z",
            "meeting_id": meeting_id,
            "sender": "SYSTEM",
            "channel": "cli",
            "content": {"type": "decision", "text": "Meeting started: authority repair"},
            "refs": {"task_id": "TASK-1", "files": []},
            "redaction": {"applied": False, "rules": []},
        }
        append_meeting_record(workspace, meeting_id, start_record)
        write_active_meeting(
            workspace,
            {
                "meeting_id": meeting_id,
                "topic": "authority repair",
                "started_at": start_record["ts_utc"],
                "opened_by": "TEST",
                "task_id": "TASK-1",
            },
        )
        return meeting_id, start_record

    def _fake_process(self) -> MagicMock:
        process = MagicMock()
        process.pid = 4242
        process.poll.return_value = None

        def wait(*, timeout: float | None = None) -> int:
            if timeout == 0.25:
                raise subprocess.TimeoutExpired(cmd="test-provider", timeout=timeout)
            return 0

        process.wait.side_effect = wait
        return process

    def _spawn_stack(self, workspace: Path, process: MagicMock) -> tuple[ExitStack, MagicMock]:
        stack = ExitStack()
        stack.enter_context(patch("ensemble_spawn.check_action_policy", return_value={"status": "allow"}))
        stack.enter_context(patch("ensemble_spawn.get_provider_manifest", return_value={"provider_id": "test"}))
        stack.enter_context(patch("ensemble_spawn.get_workspace_manifest", return_value={"workspace_id": "root"}))
        stack.enter_context(
            patch(
                "ensemble_spawn.resolve_workspace_target",
                return_value={"path": str(workspace), "strategy": "in-place", "created": False},
            )
        )
        stack.enter_context(
            patch(
                "ensemble_spawn.initialize_agent_memory",
                return_value={
                    "long_term_memory_file": "memory.md",
                    "persona_file": "persona.md",
                    "shared_memory_file": "shared.md",
                },
            )
        )
        stack.enter_context(patch("ensemble_spawn.next_spawn_id", return_value="S-20260710-001"))
        stack.enter_context(patch("ensemble_spawn._build_command", return_value=[sys.executable, "-c", "pass"]))
        stack.enter_context(patch("ensemble_spawn.shutil.which", return_value=sys.executable))
        popen = stack.enter_context(patch("ensemble_spawn.subprocess.Popen", return_value=process))
        stack.enter_context(patch("ensemble_spawn.create_handoff", return_value={"handoff_id": "H-20260710-001"}))
        stack.enter_context(patch("ensemble_spawn.transition_handoff", return_value={"status": "started"}))
        stack.enter_context(patch("ensemble_spawn.append_artifact_manifest", return_value={"artifact_id": "A-1"}))
        return stack, popen

    def _spawn(self, workspace: Path) -> dict[str, object]:
        return start_spawn(
            workspace,
            provider_id="test",
            agent_id="worker-1",
            workspace_id="root",
            actor="TEST",
            task_id="TASK-1",
            room_id="ROOM-1",
            summary="authority repair",
        )

    def test_legacy_lifecycle_aliases_resolve_to_canonical_types(self) -> None:
        expected = {
            "MEETING_STARTED": "meeting.started",
            "MEETING_MSG": "meeting.deliberation",
            "MEETING_ENDED": "meeting.ended",
            "SUBAGENT_SPAWNED": "agent.spawned",
            "SUBAGENT_STOPPED": "agent.terminated",
            "HANDOFF_STARTED": "handoff.started",
            "HANDOFF_BLOCKED": "handoff.blocked",
        }
        self.assertEqual({raw: resolve_event_type(raw) for raw in expected}, expected)

    def test_start_meeting_append_failure_leaves_no_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            meeting_id = "MTG-20260710-001"
            with (
                patch("ensemble_meeting.generate_meeting_id", return_value=meeting_id),
                patch("ensemble_meeting.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                start_meeting(workspace, topic="authority repair", actor="TEST", task_id="TASK-1")

            self.assertFalse(meeting_path(workspace, meeting_id).exists())
            self.assertFalse(get_active_meeting_file(workspace).exists())

    def test_say_append_failure_does_not_change_transcript(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            meeting_id, _record = self._seed_meeting(workspace)
            before = meeting_path(workspace, meeting_id).read_text(encoding="utf-8")

            with (
                patch("ensemble_meeting.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                say(workspace, meeting_id=meeting_id, sender="worker-1", text="private decision")

            self.assertEqual(meeting_path(workspace, meeting_id).read_text(encoding="utf-8"), before)

    def test_missing_meeting_is_rejected_before_say_or_end_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            missing_id = "MTG-20260710-999"

            with self.assertRaisesRegex(FileNotFoundError, "Meeting not found"):
                say(
                    workspace,
                    meeting_id=missing_id,
                    sender="worker-1",
                    text="orphan message",
                )
            with self.assertRaisesRegex(FileNotFoundError, "Meeting not found"):
                end_meeting(workspace, meeting_id=missing_id, actor="TEST")

            self.assertEqual(load_events(workspace), [])
            self.assertFalse(meeting_path(workspace, missing_id).exists())
            self.assertFalse(summary_path(workspace, missing_id).exists())

    def test_end_meeting_append_failure_leaves_existing_state_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            meeting_id, _record = self._seed_meeting(workspace)
            before = meeting_path(workspace, meeting_id).read_text(encoding="utf-8")

            with (
                patch("ensemble_meeting.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                end_meeting(workspace, meeting_id=meeting_id, actor="TEST")

            self.assertEqual(meeting_path(workspace, meeting_id).read_text(encoding="utf-8"), before)
            self.assertFalse(summary_path(workspace, meeting_id).exists())
            self.assertTrue(get_active_meeting_file(workspace).exists())

    def test_meeting_events_link_redacted_transcript_records_without_message_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            started = start_meeting(workspace, topic="authority repair", actor="TEST", task_id="TASK-1")
            meeting_id = str(started["meeting_id"])
            posted = say(
                workspace,
                meeting_id=meeting_id,
                sender="worker-1",
                text=r"review C:\Users\private-owner\secret.txt with sk-secret123",
                files=[r"C:\Users\private-owner\evidence.txt"],
            )
            end_meeting(workspace, meeting_id=meeting_id, actor="TEST")

            events = load_events(workspace)
            self.assertEqual(
                [event["type"] for event in events],
                ["meeting.started", "meeting.deliberation", "meeting.ended"],
            )
            started_payload = events[0]["payload"]
            message_event = events[1]
            ended_payload = events[2]["payload"]
            self.assertEqual(started_payload["meeting_id"], meeting_id)
            self.assertIsInstance(started_payload["room_id"], str)
            self.assertEqual(started_payload["initiated_by"], "TEST")
            self.assertEqual(started_payload["participant_ids"], ["TEST"])
            self.assertEqual(message_event["payload"]["meeting_id"], meeting_id)
            self.assertEqual(message_event["payload"]["room_id"], started_payload["room_id"])
            self.assertEqual(message_event["payload"]["initiated_by"], "worker-1")
            self.assertEqual(ended_payload["meeting_id"], meeting_id)
            self.assertEqual(ended_payload["room_id"], started_payload["room_id"])
            self.assertEqual(ended_payload["ended_by"], "TEST")
            self.assertNotIn("text", message_event["payload"])
            self.assertNotIn("content", message_event["payload"])
            self.assertEqual(message_event["payload"]["message_id"], posted["message_id"])
            self.assertEqual(message_event["payload"]["content_sha256"], posted["content_sha256"])
            self.assertEqual(message_event["payload"]["transcript_ref"], f"meetings/{meeting_id}.jsonl")
            self.assertEqual(posted["event_id"], message_event["event_id"])
            self.assertEqual(len(str(posted["content_sha256"])), 64)
            self.assertNotIn("private-owner", json.dumps(events, ensure_ascii=False))
            self.assertNotIn("sk-secret123", json.dumps(events, ensure_ascii=False))
            for row in load_transcript(workspace, meeting_id):
                self.assertIn("message_id", row)
                self.assertIn("content_sha256", row)
                self.assertIn("event_id", row)

    def test_create_handoff_append_failure_leaves_no_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            handoff_id = "H-20260710-001"
            with (
                patch("ensemble_handoff.next_handoff_id", return_value=handoff_id),
                patch("ensemble_handoff.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                create_handoff(
                    workspace,
                    from_actor="TEST",
                    to_actor="worker-1",
                    summary="authority repair",
                    task_id="TASK-1",
                )

            self.assertFalse(handoff_path(workspace, handoff_id).exists())
            self.assertIsNone(LoopStateRepository(workspace).get_handoff_packet(handoff_id))

    def test_transition_handoff_append_failure_preserves_requested_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            handoff = create_handoff(
                workspace,
                from_actor="TEST",
                to_actor="worker-1",
                summary="authority repair",
                task_id="TASK-1",
            )
            path = handoff_path(workspace, str(handoff["handoff_id"]))
            before = path.read_text(encoding="utf-8")

            with (
                patch("ensemble_handoff.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                transition_handoff(
                    workspace,
                    handoff_id=str(handoff["handoff_id"]),
                    state="started",
                    actor="TEST",
                )

            self.assertEqual(path.read_text(encoding="utf-8"), before)
            stored = LoopStateRepository(workspace).get_handoff_packet(str(handoff["handoff_id"]))
            self.assertEqual(stored["status"], "requested")

    def test_create_handoff_manifest_failure_preserves_committed_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            with patch(
                "ensemble_handoff.append_artifact_manifest",
                side_effect=RuntimeError("manifest unavailable"),
            ):
                handoff = create_handoff(
                    workspace,
                    from_actor="TEST",
                    to_actor="worker-1",
                    summary="authority repair",
                    task_id="TASK-1",
                )

            self.assertEqual(handoff["status"], "requested")
            self.assertEqual(
                handoff["artifact_manifest_warning"],
                "Artifact manifest projection failed.",
            )
            stored = LoopStateRepository(workspace).get_handoff_packet(str(handoff["handoff_id"]))
            self.assertEqual(stored["status"], "requested")
            self.assertEqual(stored["packet_json"]["artifact_manifest_warning"], "Artifact manifest projection failed.")
            projected = json.loads(
                handoff_path(workspace, str(handoff["handoff_id"])).read_text(encoding="utf-8")
            )
            self.assertEqual(projected["artifact_manifest_warning"], "Artifact manifest projection failed.")

    def test_transition_handoff_manifest_failure_preserves_committed_transition(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            handoff = create_handoff(
                workspace,
                from_actor="TEST",
                to_actor="worker-1",
                summary="authority repair",
                task_id="TASK-1",
            )
            with patch(
                "ensemble_handoff.append_artifact_manifest",
                side_effect=RuntimeError("manifest unavailable"),
            ):
                transitioned = transition_handoff(
                    workspace,
                    handoff_id=str(handoff["handoff_id"]),
                    state="started",
                    actor="TEST",
                )

            self.assertEqual(transitioned["status"], "started")
            self.assertEqual(
                transitioned["artifact_manifest_warning"],
                "Artifact manifest projection failed.",
            )
            stored = LoopStateRepository(workspace).get_handoff_packet(str(handoff["handoff_id"]))
            self.assertEqual(stored["status"], "started")
            self.assertEqual(stored["packet_json"]["artifact_manifest_warning"], "Artifact manifest projection failed.")
            projected = json.loads(
                handoff_path(workspace, str(handoff["handoff_id"])).read_text(encoding="utf-8")
            )
            self.assertEqual(projected["status"], "started")
            self.assertEqual(projected["artifact_manifest_warning"], "Artifact manifest projection failed.")

    def test_handoff_events_use_private_projection_refs_instead_of_raw_context(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            private_path = workspace / "private" / "spawn.log"
            summary = f"Inspect {private_path} with sk-secret123"
            handoff = create_handoff(
                workspace,
                from_actor="TEST",
                to_actor="worker-1",
                summary=summary,
                task_id="TASK-1",
                files=[str(private_path)],
                worktree_id=str(workspace / "worktree"),
                lease_paths=[str(workspace / "lease")],
            )
            transition_handoff(
                workspace,
                handoff_id=str(handoff["handoff_id"]),
                state="blocked",
                actor="TEST",
                detail=summary,
                result={"secret": "sk-secret123", "path": str(private_path)},
            )

            events = [event for event in load_events(workspace) if event["type"].startswith("handoff.")]
            serialized = json.dumps(events, ensure_ascii=False)
            self.assertNotIn(summary, serialized)
            self.assertNotIn(str(private_path), serialized)
            self.assertNotIn("sk-secret123", serialized)
            self.assertEqual(events[0]["payload"]["handoff_ref"], f"handoffs/{handoff['handoff_id']}.json")
            self.assertEqual(events[0]["payload"]["file_refs"], ["private/spawn.log"])
            self.assertEqual(len(events[0]["payload"]["summary_sha256"]), 64)
            self.assertEqual(len(events[1]["payload"]["detail_sha256"]), 64)
            self.assertEqual(len(events[1]["payload"]["result_sha256"]), 64)

            projected = json.loads(
                handoff_path(workspace, str(handoff["handoff_id"])).read_text(encoding="utf-8")
            )
            self.assertEqual(projected["summary"], summary)
            self.assertEqual(projected["latest_result"]["path"], str(private_path))

    def test_spawn_request_append_failure_does_not_launch_or_write_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            stack, popen = self._spawn_stack(workspace, process)
            with stack:
                with (
                    patch(
                        "ensemble_spawn.resolve_workspace_target",
                        return_value={"path": str(workspace), "strategy": "in-place", "created": False},
                    ) as resolve_workspace,
                    patch(
                        "ensemble_spawn.initialize_agent_memory",
                        return_value={
                            "long_term_memory_file": "memory.md",
                            "persona_file": "persona.md",
                            "shared_memory_file": "shared.md",
                        },
                    ) as initialize_memory,
                    patch("ensemble_spawn.append_event", side_effect=RuntimeError("event unavailable")),
                    self.assertRaises(RuntimeError),
                ):
                    self._spawn(workspace)

            popen.assert_not_called()
            resolve_workspace.assert_not_called()
            initialize_memory.assert_not_called()
            self.assertFalse(spawn_record_path(workspace, "S-20260710-001").exists())

    def test_spawn_observed_event_failure_terminates_process_without_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                if kwargs["event_type"] == "agent.spawn_requested":
                    return {
                        "event_id": "E-request",
                        "ts_utc": "2026-07-10T00:00:00Z",
                        "payload": dict(kwargs.get("payload") or {}),
                    }
                raise RuntimeError("spawn observation unavailable")

            with stack:
                with (
                    patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                    self.assertRaises(RuntimeError),
                ):
                    self._spawn(workspace)

            process.terminate.assert_called()
            self.assertFalse(spawn_record_path(workspace, "S-20260710-001").exists())

    def test_spawn_immediate_exit_records_error_without_spawned_observation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            process.poll.return_value = 7
            stack, _popen = self._spawn_stack(workspace, process)
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            with stack, patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event):
                with self.assertRaisesRegex(RuntimeError, "exited before spawn observation"):
                    self._spawn(workspace)

            self.assertEqual(
                [event_type for event_type, _payload in events],
                ["agent.spawn_requested", "agent.error"],
            )
            self.assertIs(events[1][1]["recoverable"], True)
            self.assertFalse(spawn_record_path(workspace, "S-20260710-001").exists())

    def test_spawn_immediate_clean_exit_records_completed_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            process.poll.return_value = 0
            stack, _popen = self._spawn_stack(workspace, process)
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            with (
                stack,
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                patch("ensemble_spawn.transition_handoff", return_value={}) as transition,
            ):
                record = self._spawn(workspace)

            self.assertEqual(
                [event_type for event_type, _payload in events],
                ["agent.spawn_requested", "agent.spawned", "agent.terminated"],
            )
            self.assertEqual(
                events[2][1],
                {
                    "agent_id": "worker-1",
                    "reason": "task_completed",
                    "final_task_id": "TASK-1",
                },
            )
            self.assertEqual(record["status"], "completed")
            self.assertEqual(record["terminated_event_id"], "E-3")
            self.assertFalse(spawn_record_path(workspace, "S-20260710-001").exists())
            self.assertTrue(spawn_record_path(workspace, "S-20260710-001", completed=True).exists())
            transition.assert_called_once_with(
                workspace,
                handoff_id="H-20260710-001",
                state="completed",
                actor="TEST",
                detail="Subagent process completed.",
            )
            process.terminate.assert_not_called()
            process.kill.assert_not_called()

    def test_spawn_clean_exit_during_observation_grace_records_completed_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            process.poll.return_value = None
            process.wait.side_effect = None
            process.wait.return_value = 0
            stack, _popen = self._spawn_stack(workspace, process)
            events: list[str] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                events.append(str(kwargs["event_type"]))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": dict(kwargs.get("payload") or {}),
                }

            with stack, patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event):
                record = self._spawn(workspace)

            self.assertEqual(events, ["agent.spawn_requested", "agent.spawned", "agent.terminated"])
            self.assertEqual(record["status"], "completed")
            process.wait.assert_any_call(timeout=0.25)

    def test_spawn_projection_failure_records_terminal_observation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            worktree = workspace / "spawn-worktree"
            workspace_info = {
                "path": str(worktree),
                "strategy": "git-worktree",
                "created": True,
                "repo_root": str(workspace),
                "branch": "codex/worker-1/task-1",
            }
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            with (
                stack,
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                patch("ensemble_spawn.resolve_workspace_target", return_value=workspace_info),
                patch("ensemble_spawn.cleanup_git_worktree") as cleanup_worktree,
                patch("ensemble_spawn._write_spawn_record", side_effect=RuntimeError("projection unavailable")),
                self.assertRaisesRegex(RuntimeError, "projection unavailable"),
            ):
                self._spawn(workspace)

            process.terminate.assert_called()
            cleanup_worktree.assert_called_once_with(workspace_info)
            self.assertEqual(
                [event_type for event_type, _payload in events],
                ["agent.spawn_requested", "agent.spawned", "agent.terminated", "agent.error"],
            )
            self.assertEqual(
                events[2][1],
                {
                    "agent_id": "worker-1",
                    "reason": "error",
                    "final_task_id": "TASK-1",
                },
            )
            self.assertIs(events[3][1]["recoverable"], False)

    def test_preparation_failure_cleans_created_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            worktree = workspace / "spawn-worktree"
            workspace_info = {
                "path": str(worktree),
                "strategy": "git-worktree",
                "created": True,
                "repo_root": str(workspace),
                "branch": "codex/worker-1/task-1",
            }
            process = self._fake_process()
            stack, popen = self._spawn_stack(workspace, process)

            with (
                stack,
                patch("ensemble_spawn.resolve_workspace_target", return_value=workspace_info),
                patch(
                    "ensemble_spawn.initialize_agent_memory",
                    side_effect=RuntimeError("memory unavailable"),
                ),
                patch("ensemble_spawn.cleanup_git_worktree") as cleanup_worktree,
                patch(
                    "ensemble_spawn.append_event",
                    side_effect=[
                        {
                            "event_id": "E-request",
                            "ts_utc": "2026-07-10T00:00:00Z",
                            "payload": {},
                        },
                        {
                            "event_id": "E-error",
                            "ts_utc": "2026-07-10T00:00:01Z",
                            "payload": {},
                        },
                    ],
                ),
                self.assertRaisesRegex(RuntimeError, "memory unavailable"),
            ):
                self._spawn(workspace)

            cleanup_worktree.assert_called_once_with(workspace_info)
            popen.assert_not_called()

    def test_handoff_failure_cleans_created_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            workspace_info = {
                "path": str(workspace / "spawn-worktree"),
                "strategy": "git-worktree",
                "created": True,
                "repo_root": str(workspace),
                "branch": "codex/worker-1/task-1",
            }
            process = self._fake_process()
            stack, popen = self._spawn_stack(workspace, process)

            with (
                stack,
                patch("ensemble_spawn.resolve_workspace_target", return_value=workspace_info),
                patch("ensemble_spawn.create_handoff", side_effect=RuntimeError("handoff unavailable")),
                patch("ensemble_spawn.cleanup_git_worktree") as cleanup_worktree,
                patch(
                    "ensemble_spawn.append_event",
                    side_effect=[
                        {"event_id": "E-request", "ts_utc": "2026-07-10T00:00:00Z"},
                        {"event_id": "E-error", "ts_utc": "2026-07-10T00:00:01Z"},
                    ],
                ),
                self.assertRaisesRegex(RuntimeError, "handoff unavailable"),
            ):
                self._spawn(workspace)

            cleanup_worktree.assert_called_once_with(workspace_info)
            popen.assert_not_called()

    def test_process_launch_failure_cleans_created_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            workspace_info = {
                "path": str(workspace / "spawn-worktree"),
                "strategy": "git-worktree",
                "created": True,
                "repo_root": str(workspace),
                "branch": "codex/worker-1/task-1",
            }
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)

            with (
                stack,
                patch("ensemble_spawn.resolve_workspace_target", return_value=workspace_info),
                patch("ensemble_spawn.subprocess.Popen", side_effect=OSError("launch unavailable")),
                patch("ensemble_spawn.cleanup_git_worktree") as cleanup_worktree,
                patch(
                    "ensemble_spawn.append_event",
                    side_effect=[
                        {"event_id": "E-request", "ts_utc": "2026-07-10T00:00:00Z"},
                        {"event_id": "E-error", "ts_utc": "2026-07-10T00:00:01Z"},
                    ],
                ),
                self.assertRaisesRegex(OSError, "launch unavailable"),
            ):
                self._spawn(workspace)

            cleanup_worktree.assert_called_once_with(workspace_info)

    def test_spawn_observation_failure_cleans_created_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            workspace_info = {
                "path": str(workspace / "spawn-worktree"),
                "strategy": "git-worktree",
                "created": True,
                "repo_root": str(workspace),
                "branch": "codex/worker-1/task-1",
            }
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)
            append_count = 0

            def append_lifecycle_event(*_args: object, **_kwargs: object) -> dict[str, object]:
                nonlocal append_count
                append_count += 1
                if append_count == 2:
                    raise RuntimeError("spawn observation unavailable")
                return {
                    "event_id": f"E-{append_count}",
                    "ts_utc": f"2026-07-10T00:00:0{append_count}Z",
                }

            with (
                stack,
                patch("ensemble_spawn.resolve_workspace_target", return_value=workspace_info),
                patch("ensemble_spawn.cleanup_git_worktree") as cleanup_worktree,
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                self.assertRaisesRegex(RuntimeError, "spawn observation unavailable"),
            ):
                self._spawn(workspace)

            process.terminate.assert_called_once()
            cleanup_worktree.assert_called_once_with(workspace_info)

    def test_spawn_failure_recording_error_is_attached_to_primary_exception(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)
            append_count = 0

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                nonlocal append_count
                append_count += 1
                if append_count == 1:
                    return {
                        "event_id": "E-request",
                        "ts_utc": "2026-07-10T00:00:00Z",
                        "payload": dict(kwargs.get("payload") or {}),
                    }
                raise RuntimeError("failure event unavailable")

            with stack, patch(
                "ensemble_spawn.resolve_workspace_target",
                side_effect=ValueError("preparation unavailable"),
            ), patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event):
                with self.assertRaisesRegex(ValueError, "preparation unavailable") as raised:
                    self._spawn(workspace)

            notes = getattr(raised.exception, "__notes__", [])
            self.assertTrue(any("failure event unavailable" in note for note in notes), notes)

    def test_successful_spawn_records_requested_then_observed_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            with stack, patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event):
                record = self._spawn(workspace)

            self.assertEqual([event_type for event_type, _payload in events], ["agent.spawn_requested", "agent.spawned"])
            self.assertEqual(
                events[0][1],
                {
                    "agent_id": "worker-1",
                    "persona": "test",
                    "room_id": "ROOM-1",
                    "run_id": "TASK-1",
                    "request_id": "S-20260710-001",
                    "requested_by": "TEST",
                },
            )
            self.assertEqual(
                events[1][1],
                {
                    "agent_id": "worker-1",
                    "persona": "test",
                    "room_id": "ROOM-1",
                    "run_id": "TASK-1",
                    "parent_agent_id": "TEST",
                },
            )
            self.assertEqual(record["request_event_id"], "E-1")
            self.assertEqual(record["spawned_event_id"], "E-2")

    def test_spawn_manifest_failure_keeps_running_process_and_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            process = self._fake_process()
            stack, _popen = self._spawn_stack(workspace, process)

            with (
                stack,
                patch(
                    "ensemble_spawn.append_artifact_manifest",
                    side_effect=RuntimeError("manifest unavailable"),
                ),
            ):
                record = self._spawn(workspace)

            self.assertEqual(record["status"], "running")
            self.assertEqual(
                record["artifact_manifest_warning"],
                "Artifact manifest projection failed.",
            )
            process.terminate.assert_not_called()
            process.kill.assert_not_called()
            stored = json.loads(
                spawn_record_path(workspace, "S-20260710-001").read_text(encoding="utf-8")
            )
            self.assertEqual(stored["status"], "running")
            self.assertEqual(stored["artifact_manifest_warning"], "Artifact manifest projection failed.")

    def test_stop_request_append_failure_does_not_kill_or_move_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            record = {
                "schema_v": 1,
                "spawn_id": "S-20260710-001",
                "pid": 4242,
                "status": "running",
                "task_id": "TASK-1",
                "workspace": {"strategy": "in-place", "created": False},
                "handoff_id": "H-20260710-001",
                "created_at": "2026-07-10T00:00:00Z",
                "updated_at": "2026-07-10T00:00:00Z",
            }
            active_path = _write_spawn_record(workspace, record)
            completed_path = spawn_record_path(workspace, "S-20260710-001", completed=True)

            with (
                patch("ensemble_spawn.append_event", side_effect=RuntimeError("event unavailable")),
                patch("ensemble_spawn._pid_is_running", return_value=True),
                patch("ensemble_spawn.subprocess.run") as taskkill,
                patch("ensemble_spawn.os.killpg", create=True) as killpg,
                patch("ensemble_spawn.transition_handoff", return_value={}),
                self.assertRaises(RuntimeError),
            ):
                stop_spawn(workspace, spawn_id="S-20260710-001", actor="TEST")

            taskkill.assert_not_called()
            killpg.assert_not_called()
            self.assertTrue(active_path.exists())
            self.assertFalse(completed_path.exists())
            self.assertEqual(json.loads(active_path.read_text(encoding="utf-8"))["status"], "running")

    @unittest.skipUnless(sys.platform == "win32", "Windows taskkill contract")
    def test_stop_taskkill_failure_does_not_emit_terminated_or_move_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            active_path = _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "agent_id": "worker-1",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {"strategy": "in-place", "created": False},
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            taskkill_result = MagicMock(returncode=1, stderr="Access denied")
            with (
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                patch("ensemble_spawn._pid_is_running", return_value=True),
                patch("ensemble_spawn.subprocess.run", return_value=taskkill_result),
                patch("ensemble_spawn.transition_handoff") as transition,
                self.assertRaisesRegex(RuntimeError, "Failed to terminate subagent process"),
            ):
                stop_spawn(workspace, spawn_id="S-20260710-001", actor="TEST")

            self.assertEqual(
                [event_type for event_type, _payload in events],
                ["command.issued", "command.failed"],
            )
            self.assertEqual(
                events[1][1],
                {
                    "command_id": "stop:S-20260710-001",
                    "command_type": "agent.terminate",
                    "error_code": "PROCESS_TERMINATION_FAILED",
                    "error_message": "Failed to terminate subagent process.",
                    "retryable": True,
                },
            )
            transition.assert_not_called()
            self.assertTrue(active_path.exists())
            self.assertEqual(json.loads(active_path.read_text(encoding="utf-8"))["status"], "running")

    def test_successful_stop_records_requested_then_observed_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "agent_id": "worker-1",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {"strategy": "in-place", "created": False},
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )
            events: list[tuple[str, dict[str, object]]] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                payload = dict(kwargs.get("payload") or {})
                events.append((event_type, payload))
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": payload,
                }

            with (
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                patch("ensemble_spawn._pid_is_running", return_value=False),
                patch("ensemble_spawn.transition_handoff", return_value={}),
            ):
                stopped = stop_spawn(workspace, spawn_id="S-20260710-001", actor="TEST")

            self.assertEqual(
                [event_type for event_type, _payload in events],
                ["command.issued", "agent.terminated", "command.completed"],
            )
            self.assertEqual(
                events[0][1],
                {
                    "command_id": "stop:S-20260710-001",
                    "command_type": "agent.terminate",
                    "source": "cli",
                    "input": {
                        "agent_id": "worker-1",
                        "reason": "user_requested",
                        "force": False,
                    },
                },
            )
            self.assertEqual(
                events[1][1],
                {
                    "agent_id": "worker-1",
                    "reason": "user_requested",
                    "final_task_id": "TASK-1",
                },
            )
            self.assertEqual(
                events[2][1],
                {
                    "command_id": "stop:S-20260710-001",
                    "command_type": "agent.terminate",
                    "result": {"agent_id": "worker-1", "status": "terminated"},
                    "emitted_event_ids": ["E-2"],
                },
            )
            self.assertEqual(stopped["termination_request_event_id"], "E-1")
            self.assertEqual(stopped["terminated_event_id"], "E-2")
            self.assertEqual(stopped["command_completed_event_id"], "E-3")
            self.assertEqual(stopped["status"], "stopped")

    def test_stop_command_completion_failure_still_persists_stopped_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            active_path = _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "agent_id": "worker-1",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {"strategy": "in-place", "created": False},
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )
            events: list[str] = []

            def append_lifecycle_event(*_args: object, **kwargs: object) -> dict[str, object]:
                event_type = str(kwargs["event_type"])
                events.append(event_type)
                if event_type == "command.completed":
                    raise RuntimeError("command completion unavailable")
                return {
                    "event_id": f"E-{len(events)}",
                    "ts_utc": f"2026-07-10T00:00:0{len(events)}Z",
                    "payload": dict(kwargs.get("payload") or {}),
                }

            with (
                patch("ensemble_spawn._pid_is_running", return_value=False),
                patch("ensemble_spawn.append_event", side_effect=append_lifecycle_event),
                patch("ensemble_spawn.transition_handoff", return_value={}),
            ):
                stopped = stop_spawn(workspace, spawn_id="S-20260710-001", actor="TEST")

            self.assertEqual(
                events,
                ["command.issued", "agent.terminated", "command.completed", "command.failed"],
            )
            self.assertFalse(active_path.exists())
            completed_path = spawn_record_path(workspace, "S-20260710-001", completed=True)
            self.assertTrue(completed_path.exists())
            self.assertEqual(stopped["status"], "stopped")
            self.assertEqual(stopped["terminated_event_id"], "E-2")
            self.assertEqual(stopped["command_failed_event_id"], "E-4")
            self.assertEqual(stopped["command_completion_warning"], "Stop command completion event failed.")

    def test_stop_cleanup_failure_still_persists_terminal_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            active_path = _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "agent_id": "worker-1",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {
                        "strategy": "git-worktree",
                        "created": True,
                        "path": str(workspace / "spawn-worktree"),
                    },
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )

            with (
                patch("ensemble_spawn._pid_is_running", return_value=False),
                patch(
                    "ensemble_spawn.append_event",
                    side_effect=[
                        {"event_id": "E-command", "ts_utc": "2026-07-10T00:00:01Z"},
                        {"event_id": "E-terminated", "ts_utc": "2026-07-10T00:00:02Z"},
                        {"event_id": "E-completed", "ts_utc": "2026-07-10T00:00:03Z"},
                    ],
                ),
                patch(
                    "ensemble_spawn.cleanup_git_worktree",
                    side_effect=RuntimeError("cleanup unavailable"),
                ),
                patch("ensemble_spawn.transition_handoff", return_value={}),
            ):
                stopped = stop_spawn(workspace, spawn_id="S-20260710-001", actor="TEST")

            self.assertFalse(active_path.exists())
            completed_path = spawn_record_path(workspace, "S-20260710-001", completed=True)
            self.assertTrue(completed_path.exists())
            self.assertEqual(stopped["status"], "stopped")
            self.assertEqual(stopped["workspace_cleanup_warning"], "Workspace cleanup failed.")

    def test_refresh_append_failure_does_not_move_running_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            active_path = _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {"strategy": "in-place", "created": False},
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )
            completed_path = spawn_record_path(workspace, "S-20260710-001", completed=True)

            with (
                patch("ensemble_spawn._pid_is_running", return_value=False),
                patch("ensemble_spawn.append_event", side_effect=RuntimeError("event unavailable")),
                self.assertRaises(RuntimeError),
            ):
                refresh_spawn_record(workspace, "S-20260710-001")

            self.assertTrue(active_path.exists())
            self.assertFalse(completed_path.exists())
            self.assertEqual(json.loads(active_path.read_text(encoding="utf-8"))["status"], "running")

    def test_refresh_cleanup_failure_still_persists_terminal_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            active_path = _write_spawn_record(
                workspace,
                {
                    "schema_v": 1,
                    "spawn_id": "S-20260710-001",
                    "agent_id": "worker-1",
                    "pid": 4242,
                    "status": "running",
                    "task_id": "TASK-1",
                    "workspace": {
                        "strategy": "git-worktree",
                        "created": True,
                        "path": str(workspace / "spawn-worktree"),
                    },
                    "handoff_id": "H-20260710-001",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:00Z",
                },
            )

            with (
                patch("ensemble_spawn._pid_is_running", return_value=False),
                patch(
                    "ensemble_spawn.append_event",
                    return_value={
                        "event_id": "E-terminated",
                        "ts_utc": "2026-07-10T00:00:01Z",
                    },
                ),
                patch(
                    "ensemble_spawn.cleanup_git_worktree",
                    side_effect=RuntimeError("cleanup unavailable"),
                ),
            ):
                refreshed = refresh_spawn_record(workspace, "S-20260710-001")

            self.assertFalse(active_path.exists())
            completed_path = spawn_record_path(workspace, "S-20260710-001", completed=True)
            self.assertTrue(completed_path.exists())
            self.assertEqual(refreshed["status"], "completed")
            self.assertEqual(refreshed["workspace_cleanup_warning"], "Workspace cleanup failed.")


if __name__ == "__main__":
    unittest.main()
