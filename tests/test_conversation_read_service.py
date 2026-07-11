from __future__ import annotations

import importlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_room
from ensemble_loop_repository import LoopStateRepository


def _conversation_module() -> ModuleType:
    return importlib.import_module("ensemble_conversation_read_service")


def _service(workspace: Path) -> Any:
    return _conversation_module().ConversationReadService(workspace)


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def _workspace_thread_event(
    *,
    event_type: str,
    thread_id: str,
    payload: dict[str, Any],
    ts_utc: str,
) -> dict[str, Any]:
    return {
        "event_v": 1,
        "event_id": f"event-{thread_id}-{event_type}-{ts_utc}",
        "ts_utc": ts_utc,
        "actor": {"type": "system", "name": "test"},
        "scope": {"thread_id": thread_id, "workspace": "workspace-a"},
        "type": event_type,
        "severity": "info",
        "payload": {"thread_id": thread_id, **payload},
        "redaction": {"applied": False, "rules": []},
    }


class ConversationReadServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.root, ignore_errors=True))

    def _repository_room(self) -> tuple[LoopStateRepository, str]:
        repo = LoopStateRepository(self.root)
        room_id = "room-primary"
        repo.upsert_room(
            room_id=room_id,
            room_type="review",
            name="Repository Room",
            status="active",
            created_by="test",
            participants=["owner", "reviewer"],
            session_boundary={"backend": "repository"},
            run_id="run-1",
            iteration_id="iter-1",
            task_id="run-1",
            created_at="2026-07-11T00:00:00Z",
            updated_at="2026-07-11T00:00:02Z",
        )
        repo.append_room_message(
            room_id=room_id,
            run_id="run-1",
            iteration_id="iter-1",
            sender="owner",
            sender_kind="user",
            message_type="text",
            content="repository message wins",
            evidence_refs=["event:message-1"],
            metadata={"source": "repository"},
            created_at="2026-07-11T00:00:01Z",
        )
        repo.upsert_handoff_packet(
            handoff_id="handoff-1",
            run_id="run-1",
            iteration_id="iter-1",
            from_actor="architect",
            to_actor="sentinel",
            status="blocked",
            summary="repository handoff wins",
            packet={"next_action": "review evidence"},
            created_at="2026-07-11T00:00:01Z",
            updated_at="2026-07-11T00:00:03Z",
        )
        return repo, room_id

    def _write_conflicting_legacy_room(self, room_id: str) -> None:
        ensemble_room.room_meta_path(self.root, room_id).write_text(
            json.dumps(
                {
                    "room_id": room_id,
                    "name": "Legacy Room",
                    "room_type": "discussion",
                    "status": "active",
                    "created_by": "legacy",
                    "participants": ["legacy"],
                    "run_id": "run-legacy",
                    "iteration_id": "iter-legacy",
                    "created_at": "2026-07-10T00:00:00Z",
                    "updated_at": "2026-07-10T00:00:01Z",
                }
            ),
            encoding="utf-8",
        )
        _write_jsonl(
            ensemble_room.room_log_path(self.root, room_id),
            [
                {
                    "sender": "legacy",
                    "sender_kind": "agent",
                    "message_type": "text",
                    "content": "legacy message must not override repository",
                    "ts_utc": "2026-07-10T00:00:01Z",
                }
            ],
        )

    def _read_mutation_guards(self) -> list[Any]:
        def fail_write(*_: Any, **__: Any) -> None:
            raise AssertionError("read path attempted a repository or event write")

        return [
            patch.object(LoopStateRepository, "upsert_room", side_effect=fail_write),
            patch.object(LoopStateRepository, "append_room_message", side_effect=fail_write),
            patch.object(LoopStateRepository, "append_tool_event", side_effect=fail_write),
            patch.object(LoopStateRepository, "append_insight", side_effect=fail_write),
            patch.object(LoopStateRepository, "upsert_handoff_packet", side_effect=fail_write),
        ]

    def test_room_snapshot_uses_repository_room_messages_timeline_and_handoffs_when_legacy_conflicts(self) -> None:
        _repo, room_id = self._repository_room()
        self._write_conflicting_legacy_room(room_id)

        snapshot = _service(self.root).room_snapshot(room_id)
        handoffs = _service(self.root).handoffs(run_id="run-1")

        self.assertEqual(snapshot["room"]["name"], "Repository Room")
        self.assertEqual(snapshot["source"], "repository")
        self.assertEqual(snapshot["messages"][0]["content"], "repository message wins")
        self.assertEqual([item["kind"] for item in snapshot["timeline"]], ["room", "message"])
        self.assertEqual(handoffs[0]["summary"], "repository handoff wins")

    def test_room_reads_do_not_upsert_append_or_sync_during_repository_snapshot(self) -> None:
        _repo, room_id = self._repository_room()
        self._write_conflicting_legacy_room(room_id)

        guards = self._read_mutation_guards()
        with guards[0], guards[1], guards[2], guards[3], guards[4]:
            snapshot = _service(self.root).room_snapshot(room_id)

        self.assertEqual(snapshot["messages"][0]["content"], "repository message wins")

    def test_legacy_only_room_is_readable_only_through_explicit_compatibility_source_without_repository_writes(self) -> None:
        room_id = "room-legacy-only"
        self._write_conflicting_legacy_room(room_id)

        guards = self._read_mutation_guards()
        with guards[0], guards[1], guards[2], guards[3], guards[4]:
            snapshot = _service(self.root).room_snapshot(
                room_id,
                source="legacy_compatibility",
            )

        self.assertEqual(snapshot["source"], "legacy_compatibility")
        self.assertEqual(snapshot["room"]["room_id"], room_id)
        self.assertEqual(snapshot["messages"][0]["content"], "legacy message must not override repository")
        self.assertIsNone(LoopStateRepository(self.root).get_room_record(room_id))

    def test_malformed_legacy_room_returns_bounded_degraded_metadata_or_typed_safe_error(self) -> None:
        room_id = "room-malformed"
        ensemble_room.room_meta_path(self.root, room_id).write_text("{not-json", encoding="utf-8")

        module = _conversation_module()
        try:
            snapshot = module.ConversationReadService(self.root).room_snapshot(
                room_id,
                source="legacy_compatibility",
            )
        except module.LegacyConversationReadError as exc:
            self.assertEqual(exc.room_id, room_id)
            self.assertNotIn("{not-json", str(exc))
        else:
            self.assertEqual(snapshot["source"], "legacy_compatibility")
            self.assertTrue(snapshot["degraded"])
            self.assertEqual(snapshot["room"]["room_id"], room_id)
            self.assertLessEqual(len(json.dumps(snapshot, ensure_ascii=False)), 800)
            self.assertNotIn("{not-json", json.dumps(snapshot, ensure_ascii=False))

    def test_thread_list_show_and_search_reduce_workspace_events_without_global_repo_threads(self) -> None:
        events_path = self.root / ".notes" / "events" / "events.jsonl"
        _write_jsonl(
            events_path,
            [
                _workspace_thread_event(
                    event_type="thread.created",
                    thread_id="thread-workspace",
                    payload={
                        "kind": "user_agent",
                        "workspace": "workspace-a",
                        "participants": ["owner", "agent"],
                    },
                    ts_utc="2026-07-11T00:00:00Z",
                ),
                _workspace_thread_event(
                    event_type="thread.message_appended",
                    thread_id="thread-workspace",
                    payload={"sender": "owner", "message": "workspace event message"},
                    ts_utc="2026-07-11T00:00:01Z",
                ),
            ],
        )

        def fail_global_reader(*_: Any, **__: Any) -> None:
            raise AssertionError("read path used global ensemble_comms projection")

        service = _service(self.root)
        with (
            patch("ensemble_comms.thread_list", side_effect=fail_global_reader),
            patch("ensemble_comms.thread_show", side_effect=fail_global_reader),
            patch("ensemble_comms.thread_search", side_effect=fail_global_reader),
        ):
            listed = service.thread_list(workspace="workspace-a")
            shown = service.thread_show("thread-workspace")
            searched = service.thread_search("thread-workspace")
            private_body_search = service.thread_search("workspace event message")

        self.assertEqual([row["id"] for row in listed], ["thread-workspace"])
        self.assertEqual(set(listed[0]), {"id", "kind", "workspace", "status", "participants", "created_at", "updated_at"})
        self.assertEqual(shown["id"], "thread-workspace")
        self.assertEqual(shown["messages"], [{"sender": "owner", "message": "workspace event message"}])
        self.assertEqual(searched[0]["thread_id"], "thread-workspace")
        self.assertEqual(private_body_search, [])

    def test_legacy_only_thread_requires_explicit_compatibility_source_and_does_not_write_repository(self) -> None:
        thread_path = self.root / ".notes" / "40_Comms" / "workspace-a" / "thread-legacy.md"
        thread_path.parent.mkdir(parents=True, exist_ok=True)
        thread_path.write_text(
            "---\nid: thread-legacy\nkind: user_agent\nworkspace: workspace-a\nstatus: open\nparticipants: [owner, agent]\ncreated_at: 2026-07-10T00:00:00Z\nupdated_at: 2026-07-10T00:00:01Z\n---\n\n## Messages\n- legacy line\n",
            encoding="utf-8",
        )

        guards = self._read_mutation_guards()
        with guards[0], guards[1], guards[2], guards[3], guards[4]:
            shown = _service(self.root).thread_show(
                "thread-legacy",
                source="legacy_compatibility",
            )

        self.assertEqual(shown["id"], "thread-legacy")
        self.assertEqual(shown["source"], "legacy_compatibility")
        self.assertEqual(shown["messages"], [{"raw": "legacy line"}])

        listed = _service(self.root).thread_list(workspace="workspace-a")
        searched = _service(self.root).thread_search("thread-legacy")
        private_body_search = _service(self.root).thread_search("legacy line")
        self.assertEqual([row["id"] for row in listed], ["thread-legacy"])
        self.assertEqual(searched[0]["thread_id"], "thread-legacy")
        self.assertEqual(private_body_search, [])

    def test_legacy_thread_identifier_rejects_path_traversal(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid thread_id"):
            _service(self.root).thread_show("../../README", source="legacy_compatibility")


if __name__ == "__main__":
    unittest.main()
