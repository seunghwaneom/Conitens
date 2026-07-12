from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_episode_closure import (
    ClosureRequest,
    EpisodeClosureError,
    close_episode,
    show_improvement_digest,
)
from ensemble_events import append_event, load_events


def cli_env() -> dict[str, str]:
    return {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}


def seed_episode(workspace: Path, episode_id: str) -> None:
    append_event(
        workspace,
        event_type="task.created",
        actor={"type": "agent", "name": "test"},
        scope={"episode_id": episode_id},
        payload={"episode_id": episode_id, "summary": "seed episode"},
    )


def seed_validation_passed(workspace: Path, episode_id: str) -> None:
    append_event(
        workspace,
        event_type="validation.passed",
        actor={"type": "agent", "name": "verifier"},
        scope={"episode_id": episode_id},
        payload={"episode_id": episode_id, "validator": "fixture"},
    )


class EpisodeClosureCliSecurityTests(unittest.TestCase):
    def test_path_shaped_episode_id_stays_inside_artifact_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            artifact_root = (workspace / ".notes" / "artifacts" / "agent-improvement").resolve()
            episode_id = "../nested\\evil:episode"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    summary="Path-shaped id closes safely.",
                    goal="Keep artifacts under the agent-improvement root",
                ),
            )

            for relative_path in (result.evidence_path, result.digest_path, result.projection_path):
                resolved = (workspace / relative_path).resolve()
                resolved.relative_to(artifact_root)
                self.assertNotIn("..", Path(relative_path).parts)
            self.assertEqual((workspace / result.projection_path).parent.name, "episodes")

    def test_tampered_index_digest_path_cannot_escape_artifact_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            private_digest = workspace / ".notes" / "artifacts" / "agent-improvement" / "evidence" / "raw.md"
            private_digest.parent.mkdir(parents=True, exist_ok=True)
            private_digest.write_text("private raw should not render", encoding="utf-8")
            index_path = workspace / ".notes" / "artifacts" / "agent-improvement" / "public" / "index.jsonl"
            index_path.parent.mkdir(parents=True, exist_ok=True)
            index_path.write_text(
                json.dumps(
                    {
                        "artifact_id": "closure-tampered",
                        "artifact_kind": "episode_closure_bundle",
                        "episode_id": "ep-tampered",
                        "status": "closed",
                        "risk": "low",
                        "summary": "tampered",
                        "digest_path": ".notes/artifacts/agent-improvement/evidence/raw.md",
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(EpisodeClosureError, "outside public digests"):
                show_improvement_digest(workspace, "closure-tampered")

    def test_cli_episode_close_and_improvement_list_show(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-cli"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            close_proc = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "episode",
                    "close",
                    episode_id,
                    "--summary",
                    "CLI closure succeeded.",
                    "--goal",
                    "Close through CLI",
                    "--actor",
                    "supervisor",
                    "--comparison-key",
                    "workflow.context-curator:v1",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=cli_env(),
            )
            artifact_id = _artifact_id_from_stdout(close_proc.stdout)

            list_proc = _run_ensemble(workspace, "improvement", "list")
            self.assertIn(artifact_id, list_proc.stdout)
            self.assertIn("ep-cli", list_proc.stdout)
            self.assertIn("closed", list_proc.stdout)
            self.assertIn("workflow.context-curator:v1", list_proc.stdout)

            show_proc = _run_ensemble(workspace, "improvement", "show", artifact_id)
            self.assertIn("# Episode ep-cli Closure Attempt", show_proc.stdout)
            self.assertIn("CLI closure succeeded.", show_proc.stdout)
            self.assertIn("workflow.context-curator:v1", show_proc.stdout)

            event = [item for item in load_events(workspace) if item["type"] == "task.artifact_added"][-1]
            self.assertEqual(event["payload"]["comparison_key"], "workflow.context-curator:v1")

    def test_cli_unsafe_comparison_key_fails_before_event_or_projection(self) -> None:
        for unsafe_key in (
            r"C:\\Users\\alice\\secret token=supersecret123",
            "github_pat_11AAABBBCCCDDDEEEFFF000111222333444",
            "AKIAIOSFODNN7EXAMPLE",
        ):
            with self.subTest(unsafe_key=unsafe_key):
                with tempfile.TemporaryDirectory() as temp_dir:
                    workspace = Path(temp_dir)
                    episode_id = "ep-cli-unsafe-key"
                    seed_episode(workspace, episode_id)
                    seed_validation_passed(workspace, episode_id)
                    baseline = load_events(workspace)

                    result = _run_ensemble_unchecked(
                        workspace,
                        "episode",
                        "close",
                        episode_id,
                        "--summary",
                        "Validation passed.",
                        "--goal",
                        "Reject unsafe comparison key",
                        "--comparison-key",
                        unsafe_key,
                    )

                    self.assertNotEqual(result.returncode, 0)
                    combined = result.stdout + result.stderr
                    self.assertNotIn(unsafe_key, combined)
                    self.assertNotIn(str(workspace.resolve()), combined)
                    self.assertEqual(load_events(workspace), baseline)
                    self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())

    def test_cli_missing_validation_creates_blocked_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-cli-blocked"
            seed_episode(workspace, episode_id)

            close_proc = _run_ensemble(
                workspace,
                "episode",
                "close",
                episode_id,
                "--summary",
                "Closure attempted before validation.",
                "--goal",
                "Close through CLI",
            )

            self.assertIn("Status: blocked", close_proc.stdout)
            digest = show_improvement_digest(workspace, _artifact_id_from_stdout(close_proc.stdout))
            self.assertIn("validation.passed event missing", digest)

    def test_cli_improvement_list_collapses_summary_whitespace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-cli-whitespace"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            _run_ensemble(
                workspace,
                "episode",
                "close",
                episode_id,
                "--summary",
                "Line one\twith tab\nline two",
                "--goal",
                "Close through CLI",
            )

            rows = _run_ensemble(workspace, "improvement", "list").stdout.splitlines()
            self.assertEqual(len(rows), 2)
            self.assertIn("Line one with tab line two", rows[1])

    def test_public_text_is_redacted_before_event_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-redacted"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    summary=r"token=supersecret123 at C:\\Users\\alice\\secret.txt",
                    goal="Close validated episode",
                ),
            )

            event_text = json.dumps(
                [event for event in load_events(workspace) if event["type"] == "task.artifact_added"][-1],
                ensure_ascii=False,
            )
            public_outputs = (
                show_improvement_digest(workspace, result.artifact_id),
                (workspace / result.evidence_path).read_text(encoding="utf-8"),
                event_text,
            )
            for public_text in public_outputs:
                self.assertNotIn("supersecret123", public_text)
                self.assertNotIn(r"C:\\Users\\alice", public_text)
                self.assertIn("[REDACTED]", public_text)

    def test_cli_public_summary_rejects_absolute_posix_path_without_leak(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-cli-private-path"
            unsafe_summary = "Review /private/customer/export.json before closure."
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)
            baseline = load_events(workspace)

            result = _run_ensemble_unchecked(
                workspace,
                "episode",
                "close",
                episode_id,
                "--summary",
                unsafe_summary,
                "--goal",
                "Reject private paths",
            )

            output = result.stdout + result.stderr
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(unsafe_summary, output)
            self.assertNotIn(str(workspace), output)
            self.assertEqual(load_events(workspace), baseline)
            self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())

    def test_sensitive_episode_id_does_not_leak_to_public_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = r"C:\\Users\\alice\\secret.txt token=supersecret123"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    summary="Sensitive id closes safely.",
                    goal="Close validated episode",
                ),
            )

            event = [item for item in load_events(workspace) if item["type"] == "task.artifact_added"][-1]
            public_outputs = (
                result.artifact_id,
                result.digest_path,
                result.evidence_path,
                json.dumps(event, ensure_ascii=False),
                json.dumps(load_index(workspace), ensure_ascii=False),
                show_improvement_digest(workspace, result.artifact_id),
                (workspace / result.evidence_path).read_text(encoding="utf-8"),
            )
            self.assertEqual(event["scope"], {"surface": "agent-improvement"})
            for public_text in public_outputs:
                self.assertNotIn("supersecret123", public_text)
                self.assertNotIn("secret.txt", public_text)
                self.assertNotIn(r"C:\\Users\\alice", public_text)
            self.assertRegex(result.artifact_id, r"^closure-[0-9a-f]{16}-[0-9a-f]{8}$")
            self.assertIn("episode-sha256:", json.dumps(event["payload"], ensure_ascii=False))

    def test_private_raw_marker_is_rejected_without_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-private"
            seed_episode(workspace, episode_id)
            seed_validation_passed(workspace, episode_id)

            with self.assertRaisesRegex(EpisodeClosureError, "private raw transcript"):
                close_episode(
                    workspace,
                    ClosureRequest(
                        episode_id=episode_id,
                        summary="raw transcript: provider completion copied here",
                        goal="Close validated episode",
                    ),
                )

            self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())


def _run_ensemble(workspace: Path, *args: str) -> subprocess.CompletedProcess[str]:
    result = _run_ensemble_unchecked(workspace, *args)
    result.check_returncode()
    return result


def _run_ensemble_unchecked(workspace: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=cli_env(),
    )


def _artifact_id_from_stdout(stdout: str) -> str:
    return next(line for line in stdout.splitlines() if line.startswith("Closure attempt created:")).split(":", 1)[1].strip()


def load_index(workspace: Path) -> list[dict[str, object]]:
    index_path = workspace / ".notes" / "artifacts" / "agent-improvement" / "public" / "index.jsonl"
    return [json.loads(line) for line in index_path.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__":
    unittest.main()
