from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_events import load_events
from ensemble_gjc_adapter import import_gjc_run_file


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class GjcAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.workspace, ignore_errors=True))

    def safe_fixture(self) -> dict[str, object]:
        return {
            "harness": "gajae-code",
            "runtime": "gjc",
            "harness_version": "0.8.1",
            "run_id": "gjc-run-001",
            "iteration_id": "iter-001",
            "task_id": "task-001",
            "status": "completed",
            "observed_at": "2026-07-04T14:40:00Z",
            "redaction_status": "metadata_only",
            "transcript_ref": "artifact:gjc/gjc-run-001.transcript.redacted.jsonl",
            "summary": "GJC run observed; raw transcript stayed outside Conitens.",
            "evidence_refs": [
                "gjc:run:gjc-run-001",
                ".omx/artifacts/gjc/gjc-run-001.metadata.json",
            ],
        }

    def test_import_gjc_run_file_appends_metadata_only_harness_event(self) -> None:
        fixture = self.workspace / "fixtures" / "gjc-run.json"
        write_json(fixture, self.safe_fixture())

        event = import_gjc_run_file(self.workspace, fixture)

        self.assertEqual(event["type"], "harness.evidence_observed")
        self.assertEqual(event["actor"], {"type": "system", "name": "gjc-adapter"})
        self.assertEqual(event["scope"], {"run_id": "gjc-run-001", "iteration_id": "iter-001", "task_id": "task-001"})
        payload = event["payload"]
        self.assertEqual(payload["harness"], "gajae-code")
        self.assertEqual(payload["runtime"], "gjc")
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["redaction_status"], "metadata_only")
        self.assertEqual(payload["evidence_refs"], ["gjc:run:gjc-run-001", "artifact:.omx/artifacts/gjc/gjc-run-001.metadata.json"])
        notes_files = [
            path.relative_to(self.workspace / ".notes").as_posix()
            for path in (self.workspace / ".notes").rglob("*")
            if path.is_file()
        ]
        self.assertEqual(notes_files, ["events/events.jsonl"])
        self.assertEqual(len(load_events(self.workspace)), 1)

    def test_import_rejects_raw_harness_content_before_append(self) -> None:
        fixture = self.safe_fixture()
        fixture["rawTranscript"] = "secret transcript should not be stored"
        fixture["stdout"] = "secret stdout should not be stored"
        fixture_path = self.workspace / "fixtures" / "gjc-unsafe.json"
        write_json(fixture_path, fixture)

        with self.assertRaisesRegex(ValueError, "raw harness content fields"):
            import_gjc_run_file(self.workspace, fixture_path)

        self.assertEqual(load_events(self.workspace), [])

    def test_import_rejects_unsafe_evidence_paths_before_append(self) -> None:
        fixture = self.safe_fixture()
        fixture["evidence_refs"] = ["../outside.json", str(self.workspace / "raw-transcript.jsonl")]
        fixture_path = self.workspace / "fixtures" / "gjc-unsafe-path.json"
        write_json(fixture_path, fixture)

        with self.assertRaisesRegex(ValueError, "unsafe evidence ref"):
            import_gjc_run_file(self.workspace, fixture_path)

        self.assertEqual(load_events(self.workspace), [])

    def test_import_rejects_unsafe_artifact_refs_before_append(self) -> None:
        fixture = self.safe_fixture()
        fixture["transcript_ref"] = "artifact:../raw-transcript.jsonl"
        fixture["evidence_refs"] = ["artifact:C:/tmp/raw-transcript.jsonl"]
        fixture_path = self.workspace / "fixtures" / "gjc-unsafe-artifact-ref.json"
        write_json(fixture_path, fixture)

        with self.assertRaisesRegex(ValueError, "unsafe evidence ref"):
            import_gjc_run_file(self.workspace, fixture_path)

        self.assertEqual(load_events(self.workspace), [])

    def test_import_rejects_unsafe_symbolic_refs_before_append(self) -> None:
        fixture = self.safe_fixture()
        fixture["transcript_ref"] = "gjc:../raw-transcript.jsonl"
        fixture["evidence_refs"] = ["event:C:/tmp/raw-transcript.jsonl"]
        fixture_path = self.workspace / "fixtures" / "gjc-unsafe-symbolic-ref.json"
        write_json(fixture_path, fixture)

        with self.assertRaisesRegex(ValueError, "unsafe evidence ref"):
            import_gjc_run_file(self.workspace, fixture_path)

        self.assertEqual(load_events(self.workspace), [])

    def test_cli_import_run_outputs_redacted_event_json(self) -> None:
        fixture = self.workspace / "fixtures" / "gjc-run.json"
        write_json(fixture, self.safe_fixture())

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "ensemble_gjc_adapter.py"),
                "--workspace",
                str(self.workspace),
                "import-run",
                "--input",
                str(fixture),
                "--format",
                "json",
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

        payload = json.loads(result.stdout)
        payload_text = json.dumps(payload, ensure_ascii=False)
        self.assertEqual(payload["event_type"], "harness.evidence_observed")
        self.assertEqual(payload["payload"]["runtime"], "gjc")
        self.assertEqual(payload["payload"]["redaction_status"], "metadata_only")
        self.assertNotIn("secret", payload_text.lower())
        self.assertNotIn(str(self.workspace), payload_text)
        self.assertEqual(len(load_events(self.workspace)), 1)

    def test_cli_import_rejection_does_not_expose_unsafe_ref(self) -> None:
        fixture = self.workspace / "fixtures" / "gjc-unsafe-cli.json"
        unsafe_ref = "artifact:C:/tmp/raw-transcript.jsonl"
        payload = self.safe_fixture()
        payload["evidence_refs"] = [unsafe_ref]
        write_json(fixture, payload)

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "ensemble_gjc_adapter.py"),
                "--workspace",
                str(self.workspace),
                "import-run",
                "--input",
                str(fixture),
                "--format",
                "json",
            ],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("unsafe evidence ref", result.stderr)
        self.assertNotIn(unsafe_ref, result.stderr)
        self.assertNotIn("C:/tmp", result.stderr)
        self.assertEqual(load_events(self.workspace), [])


if __name__ == "__main__":
    unittest.main()
