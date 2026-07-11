from __future__ import annotations

import importlib
import getpass
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import TaskPlanWriterReader
from ensemble_forward_bridge import (
    build_run_context_latest_payload,
    build_run_state_docs_payload,
)
from ensemble_iteration_service import IterationService
from ensemble_forward_bridge_query import (
    build_room_timeline_payload,
    build_thread_detail_payload,
    build_thread_search_payload,
)
from ensemble_loop_paths import task_plan_path
from ensemble_loop_repository import LoopStateRepository
from ensemble_run_service import RunService


class ForwardPublicContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.workspace, ignore_errors=True))

    def _prepare_private_context_seed(self) -> tuple[LoopStateRepository, str, str]:
        repository = LoopStateRepository(self.workspace)
        run_id = RunService(repository).create_run(
            "RAW_USER_REQUEST_DO_NOT_PUBLISH use C:\\Users\\private-owner\\repo with token=raw-request-secret",
        )["run_id"]
        iteration_id = IterationService(repository).append_iteration(
            run_id,
            "ITERATION_OBJECTIVE_DO_NOT_PUBLISH stdout=raw iteration objective",
        )["iteration_id"]

        TaskPlanWriterReader(repository).update_from_structured_input(
            run_id=run_id,
            current_plan="PRIVATE_CURRENT_PLAN_DO_NOT_PUBLISH",
            objective="Public objective survives 공개 목표",
            steps=[
                {
                    "title": "Public step survives 공개 단계",
                    "status": "in_progress",
                    "owner": "local/private-owner",
                    "notes": "STEP_NOTES_DO_NOT_PUBLISH transcript=private notes",
                    "acceptance_criteria": ["STEP_ACCEPTANCE_DO_NOT_PUBLISH"],
                },
            ],
            acceptance_criteria=["PLAN_ACCEPTANCE_DO_NOT_PUBLISH"],
            owner="private-owner",
        )
        with task_plan_path(self.workspace).open("a", encoding="utf-8") as handle:
            handle.write("\n## Manual Notes\n\nTASK_MANUAL_NOTE_DO_NOT_PUBLISH\n")

        repository.append_finding(
            run_id=run_id,
            iteration_id=iteration_id,
            category="discovery",
            actor="private-owner",
            summary="Public finding summary survives 공개 발견",
            details="FINDING_DETAILS_DO_NOT_PUBLISH raw_prompt=private finding",
        )
        repository.append_finding(
            run_id=run_id,
            iteration_id=iteration_id,
            category="validation_issue",
            actor="local/private-owner",
            summary="Public blocker summary survives 공개 차단",
            details="FINDING_BLOCKER_DETAILS_DO_NOT_PUBLISH stderr=private blocker",
        )
        repository.append_progress_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="local/private-owner",
            summary="Public progress summary survives 공개 진행",
        )

        repo_latest_path = self.workspace / ".vibe" / "context" / "LATEST_CONTEXT.md"
        repo_latest_path.parent.mkdir(parents=True, exist_ok=True)
        repo_latest_path.write_text(
            "\n".join(
                [
                    "# Repo Context",
                    "REPO_RAW_BODY_DO_NOT_PUBLISH raw_body={secret}",
                    "PROMPT_MARKER_DO_NOT_PUBLISH prompt: private",
                    "TRANSCRIPT_MARKER_DO_NOT_PUBLISH transcript: private",
                    "STDOUT_MARKER_DO_NOT_PUBLISH stdout: private",
                    "STDERR_MARKER_DO_NOT_PUBLISH stderr: private",
                    "SECRET_MARKER_DO_NOT_PUBLISH sk-testprivate123456789",
                    r"WINDOWS_PATH_DO_NOT_PUBLISH C:\Users\private-owner\repo\secret.txt",
                    "POSIX_PATH_DO_NOT_PUBLISH /home/private-owner/repo/secret.txt",
                    "USERNAME_MARKER_DO_NOT_PUBLISH username=private-owner",
                    "REPO_MANUAL_NOTE_DO_NOT_PUBLISH",
                ]
            ),
            encoding="utf-8",
        )
        return repository, run_id, iteration_id

    def test_public_context_module_exposes_allowlisted_builders(self) -> None:
        module = importlib.import_module("ensemble_forward_public_context")

        self.assertTrue(callable(module.build_public_state_docs_payload))
        self.assertTrue(callable(module.build_public_context_latest_payload))

    def test_public_text_rejects_additional_absolute_paths_and_credential_urls(self) -> None:
        module = importlib.import_module("ensemble_forward_public_context")

        unsafe_values = [
            "/opt/private/project/secret.txt",
            "/private/project/secret.txt",
            "/custom/workspace/secret.txt",
            "C:/Users/private-owner/project/secret.txt",
            r"\\private-server\private-share\secret.txt",
            "postgresql://private-user:private-password@localhost/control",
            "Authorization: Bearer abcdefghijklmnopqrstuv",
            "AWS_ACCESS_KEY_ID=AKIAEXAMPLEPRIVATE1234",
        ]

        for value in unsafe_values:
            with self.subTest(value=value):
                self.assertEqual(module._public_text(value), "[redacted]")

    def test_state_docs_and_context_latest_use_public_allowlist(self) -> None:
        _repository, run_id, _iteration_id = self._prepare_private_context_seed()

        state_docs = build_run_state_docs_payload(self.workspace, run_id)
        context_latest = build_run_context_latest_payload(self.workspace, run_id)
        serialized = json.dumps(
            {"state_docs": state_docs, "context_latest": context_latest},
            ensure_ascii=False,
        )

        self.assertEqual(
            set(state_docs["documents"]),
            {"task_plan", "findings", "progress", "latest_context"},
        )
        for envelope in state_docs["documents"].values():
            self.assertEqual(set(envelope), {"path", "content"})
            self.assertIsInstance(envelope["path"], str)
            self.assertIsInstance(envelope["content"], str)
        self.assertEqual(set(context_latest["runtime_latest"]), {"path", "content"})
        self.assertIsInstance(context_latest["runtime_latest"]["path"], str)
        self.assertIsInstance(context_latest["runtime_latest"]["content"], str)
        self.assertIsNone(context_latest["repo_latest"])

        for forbidden in [
            "RAW_USER_REQUEST_DO_NOT_PUBLISH",
            "PRIVATE_CURRENT_PLAN_DO_NOT_PUBLISH",
            "private-owner",
            "local/private-owner",
            "STEP_NOTES_DO_NOT_PUBLISH",
            "STEP_ACCEPTANCE_DO_NOT_PUBLISH",
            "PLAN_ACCEPTANCE_DO_NOT_PUBLISH",
            "TASK_MANUAL_NOTE_DO_NOT_PUBLISH",
            "FINDING_DETAILS_DO_NOT_PUBLISH",
            "FINDING_BLOCKER_DETAILS_DO_NOT_PUBLISH",
            "REPO_RAW_BODY_DO_NOT_PUBLISH",
            "PROMPT_MARKER_DO_NOT_PUBLISH",
            "TRANSCRIPT_MARKER_DO_NOT_PUBLISH",
            "STDOUT_MARKER_DO_NOT_PUBLISH",
            "STDERR_MARKER_DO_NOT_PUBLISH",
            "SECRET_MARKER_DO_NOT_PUBLISH",
            "WINDOWS_PATH_DO_NOT_PUBLISH",
            "POSIX_PATH_DO_NOT_PUBLISH",
            "USERNAME_MARKER_DO_NOT_PUBLISH",
            "REPO_MANUAL_NOTE_DO_NOT_PUBLISH",
            r"C:\Users\private-owner\repo\secret.txt",
            "/home/private-owner/repo/secret.txt",
            "sk-testprivate123456789",
            "raw_body={secret}",
            "raw_prompt=private",
            "transcript=private",
            "stdout: private",
            "stderr: private",
        ]:
            self.assertNotIn(forbidden, serialized)

        self.assertIn("Public objective survives 공개 목표", serialized)
        self.assertIn("Public step survives 공개 단계", serialized)
        self.assertIn("in_progress", serialized)
        self.assertIn("Public finding summary survives 공개 발견", serialized)
        self.assertIn("Public blocker summary survives 공개 차단", serialized)
        self.assertIn("Public progress summary survives 공개 진행", serialized)

    def test_public_conversation_builders_expose_metadata_without_message_or_tool_bodies(self) -> None:
        repository = LoopStateRepository(self.workspace)
        run_id = RunService(repository).create_run("Public collaboration projection")["run_id"]
        iteration_id = IterationService(repository).append_iteration(run_id, "Project public metadata")["iteration_id"]
        room_id = "room-public-boundary"
        local_actor = f"local/{getpass.getuser()}"
        repository.upsert_room(
            room_id=room_id,
            room_type="review",
            name="Public review room",
            status="active",
            created_by=local_actor,
            participants=[local_actor, "sentinel"],
            session_boundary={"raw_prompt": "ROOM_BOUNDARY_SECRET"},
            run_id=run_id,
            iteration_id=iteration_id,
            task_id=run_id,
        )
        repository.append_room_message(
            room_id=room_id,
            run_id=run_id,
            iteration_id=iteration_id,
            sender=local_actor,
            sender_kind="agent",
            message_type="text",
            content="ROOM_MESSAGE_SECRET token=room-secret-value",
            evidence_refs=["event:room-message"],
            metadata={"transcript": "ROOM_TRANSCRIPT_SECRET"},
        )
        repository.append_tool_event(
            room_id=room_id,
            run_id=run_id,
            iteration_id=iteration_id,
            actor=local_actor,
            tool_name="validator",
            payload={"stdout": "TOOL_PAYLOAD_SECRET"},
        )
        repository.append_insight(
            room_id=room_id,
            run_id=run_id,
            iteration_id=iteration_id,
            kind="decision",
            summary="Public collaboration decision",
            evidence_refs=["event:insight"],
            details={"raw_response": "INSIGHT_DETAILS_SECRET"},
        )

        events_path = self.workspace / ".notes" / "events" / "events.jsonl"
        events_path.parent.mkdir(parents=True, exist_ok=True)
        thread_id = "thread-public-boundary"
        events = [
            {
                "event_v": 1,
                "event_id": "event-thread-public-created",
                "ts_utc": "2026-07-11T00:00:00Z",
                "actor": {"type": "system", "name": "test"},
                "scope": {"thread_id": thread_id, "workspace": "workspace-a"},
                "type": "thread.created",
                "severity": "info",
                "payload": {
                    "thread_id": thread_id,
                    "kind": "user_agent",
                    "workspace": "workspace-a",
                    "participants": [local_actor, "sentinel"],
                },
                "redaction": {"applied": False, "rules": []},
            },
            {
                "event_v": 1,
                "event_id": "event-thread-public-message",
                "ts_utc": "2026-07-11T00:00:01Z",
                "actor": {"type": "agent", "name": getpass.getuser()},
                "scope": {"thread_id": thread_id, "workspace": "workspace-a"},
                "type": "thread.message_appended",
                "severity": "info",
                "payload": {
                    "thread_id": thread_id,
                    "sender": local_actor,
                    "message": "THREAD_MESSAGE_SECRET C:\\Users\\private-owner\\secret.txt",
                },
                "redaction": {"applied": False, "rules": []},
            },
        ]
        events_path.write_text(
            "".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events),
            encoding="utf-8",
        )

        thread_detail = build_thread_detail_payload(self.workspace, thread_id)
        private_body_search = build_thread_search_payload(self.workspace, "THREAD_MESSAGE_SECRET")
        public_metadata_search = build_thread_search_payload(self.workspace, thread_id)
        room_timeline = build_room_timeline_payload(self.workspace, room_id)
        serialized = json.dumps(
            {
                "thread_detail": thread_detail,
                "private_body_search": private_body_search,
                "public_metadata_search": public_metadata_search,
                "room_timeline": room_timeline,
            },
            ensure_ascii=False,
        )

        self.assertEqual(thread_detail["message_count"], 1)
        self.assertEqual(private_body_search["results"], [])
        self.assertEqual(
            public_metadata_search["results"],
            [{"thread_id": thread_id, "matched": True}],
        )
        self.assertTrue(room_timeline["messages"])
        self.assertTrue(room_timeline["tool_events"])
        self.assertTrue(room_timeline["insights"])
        self.assertIn("Public collaboration decision", serialized)
        for forbidden in [
            "ROOM_BOUNDARY_SECRET",
            "ROOM_MESSAGE_SECRET",
            "room-secret-value",
            "ROOM_TRANSCRIPT_SECRET",
            "TOOL_PAYLOAD_SECRET",
            "INSIGHT_DETAILS_SECRET",
            "THREAD_MESSAGE_SECRET",
            "private-owner",
            getpass.getuser(),
        ]:
            self.assertNotIn(forbidden, serialized)

    def test_public_context_bounds_each_allowlisted_text_leaf(self) -> None:
        repository = LoopStateRepository(self.workspace)
        run_id = RunService(repository).create_run("Bound public text")["run_id"]
        iteration_id = IterationService(repository).append_iteration(run_id, "Bound projection")["iteration_id"]
        oversized = "public-" + ("x" * 2_000)
        TaskPlanWriterReader(repository).update_from_structured_input(
            run_id=run_id,
            current_plan="private plan",
            objective=oversized,
            steps=[{"title": oversized, "status": "in_progress"}],
            acceptance_criteria=[],
            owner="owner",
        )
        repository.append_finding(
            run_id=run_id,
            iteration_id=iteration_id,
            category="discovery",
            actor="owner",
            summary=oversized,
            details="private details",
        )
        repository.append_progress_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="owner",
            summary=oversized,
        )

        payload = build_run_state_docs_payload(self.workspace, run_id)
        contents = [str(envelope["content"]) for envelope in payload["documents"].values()]

        self.assertTrue(any("…" in content for content in contents))
        self.assertTrue(all("x" * 300 not in content for content in contents))
        self.assertTrue(all(max(map(len, content.splitlines())) <= 280 for content in contents))


if __name__ == "__main__":
    unittest.main()
