from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_obsidian
from ensemble_events import append_event


class EventAuthorityTests(unittest.TestCase):
    def test_append_event_uses_canonical_alias_id_path_and_redaction(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)

            event = append_event(
                workspace,
                event_type="ROOM_MESSAGE",
                actor={"type": "agent", "name": "builder"},
                scope={"workspace": "demo"},
                payload={
                    "message": r"see C:\Users\eomsh\repo\secret.txt with token=abc123",
                    "nested": [
                        r"C:\\Users\\sam\\repo\\secret.txt",
                        "/Users/sam/project/file.md",
                        "/home/eomsh/project/file.md",
                    ],
                },
            )

            canonical_path = workspace / ".notes" / "events" / "events.jsonl"
            legacy_path = workspace / ".notes" / "EVENTS" / "events.jsonl"
            self.assertTrue(canonical_path.exists())
            self.assertTrue(legacy_path.exists())

            canonical_event = json.loads(canonical_path.read_text(encoding="utf-8").strip())
            legacy_event = json.loads(legacy_path.read_text(encoding="utf-8").strip())
            self.assertEqual(canonical_event, legacy_event)
            self.assertEqual(event["event_id"], canonical_event["event_id"])
            self.assertTrue(canonical_event["event_id"].startswith("E-"))
            self.assertEqual(canonical_event["type"], "thread.message_appended")
            self.assertTrue(canonical_event["redaction"]["applied"])
            self.assertCountEqual(canonical_event["redaction"]["rules"], ["path", "token"])

            payload_text = json.dumps(canonical_event["payload"], ensure_ascii=False)
            self.assertIn("[REDACTED]", payload_text)
            self.assertNotIn("eomsh", payload_text)
            self.assertNotIn("sam", payload_text)
            self.assertNotIn("abc123", payload_text)

    def test_forbidden_raw_provider_and_harness_fields_do_not_write_partial_events(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            append_event(
                workspace,
                event_type="system.started",
                payload={"summary": "baseline"},
            )
            canonical_path = workspace / ".notes" / "events" / "events.jsonl"
            legacy_path = workspace / ".notes" / "EVENTS" / "events.jsonl"
            before_canonical = canonical_path.read_text(encoding="utf-8")
            before_legacy = legacy_path.read_text(encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "raw content fields"):
                append_event(
                    workspace,
                    event_type="provider.call_recorded",
                    payload={"prompt": "raw prompt must not persist"},
                )
            with self.assertRaisesRegex(ValueError, "raw harness content fields"):
                append_event(
                    workspace,
                    event_type="harness.evidence_observed",
                    payload={"stderr": "raw terminal output must not persist"},
                )

            self.assertEqual(canonical_path.read_text(encoding="utf-8"), before_canonical)
            self.assertEqual(legacy_path.read_text(encoding="utf-8"), before_legacy)

    def test_rebuild_all_is_deterministic_and_overwrites_stale_projection(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            events_dir = workspace / ".notes" / "events"
            events_dir.mkdir(parents=True)
            events_path = events_dir / "events.jsonl"
            fixture_events = [
                {
                    "event_v": 1,
                    "event_id": "E-20260710-010000-aaaaaa",
                    "ts_utc": "2026-07-10T01:00:00Z",
                    "type": "thread.created",
                    "payload": {
                        "thread_id": "thread-fixed",
                        "kind": "review",
                        "workspace": "demo-workspace",
                        "run": "run-1",
                        "participants": ["architect", "builder"],
                    },
                },
                {
                    "event_v": 1,
                    "event_id": "E-20260710-010001-bbbbbb",
                    "ts_utc": "2026-07-10T01:00:01Z",
                    "type": "thread.message_appended",
                    "payload": {
                        "thread_id": "thread-fixed",
                        "sender": "architect",
                        "message": "Lock the event-first contract.",
                    },
                },
                {
                    "event_v": 1,
                    "event_id": "E-20260710-010002-cccccc",
                    "ts_utc": "2026-07-10T01:00:02Z",
                    "type": "thread.closed",
                    "payload": {
                        "thread_id": "thread-fixed",
                        "summary": "Contract locked.",
                    },
                },
            ]
            events_path.write_text(
                "\n".join(json.dumps(event, sort_keys=True) for event in fixture_events) + "\n",
                encoding="utf-8",
            )

            original_notes_dir = ensemble_obsidian.NOTES_DIR
            original_index_dir = ensemble_obsidian.INDEX_DIR
            original_comms_db = ensemble_obsidian.COMMS_DB
            try:
                ensemble_obsidian.NOTES_DIR = workspace / ".notes"
                ensemble_obsidian.INDEX_DIR = ensemble_obsidian.NOTES_DIR / ".index"
                ensemble_obsidian.COMMS_DB = ensemble_obsidian.INDEX_DIR / "comms.sqlite3"

                stale_path = (
                    ensemble_obsidian.NOTES_DIR
                    / "40_Comms"
                    / "2026"
                    / "07"
                    / "10"
                    / "thread-fixed.md"
                )
                stale_path.parent.mkdir(parents=True)
                stale_path.write_text("manual stale projection must disappear", encoding="utf-8")

                with patch.object(
                    ensemble_obsidian,
                    "_utc_now",
                    side_effect=["2026-07-10T01:00:03Z", "2026-07-10T01:00:04Z"],
                ):
                    first_counts = ensemble_obsidian.rebuild_all(events_dir)
                    first_projection = stale_path.read_text(encoding="utf-8")
                    second_counts = ensemble_obsidian.rebuild_all(events_dir)
                    second_projection = stale_path.read_text(encoding="utf-8")
            finally:
                ensemble_obsidian.NOTES_DIR = original_notes_dir
                ensemble_obsidian.INDEX_DIR = original_index_dir
                ensemble_obsidian.COMMS_DB = original_comms_db

            self.assertEqual(first_counts, {"threads": 1, "decisions": 0, "errors": 0})
            self.assertEqual(second_counts, first_counts)
            self.assertNotIn("manual stale projection", first_projection)
            self.assertIn("Lock the event-first contract.", first_projection)
            self.assertEqual(second_projection, first_projection)


if __name__ == "__main__":
    unittest.main()
