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


class ForwardRuntimeModeTests(unittest.TestCase):
    def cli_env(self) -> dict[str, str]:
        return {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }

    def run_cli(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "ensemble.py"), *args],
            check=check,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=self.cli_env(),
        )

    def test_forward_status_json_reports_forward_runtime_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "forward", "status", "--format", "json")
            payload = json.loads(result.stdout)
            self.assertEqual(payload["mode"], "forward")
            self.assertEqual(payload["entry_contract"]["default_runtime"], "legacy")
            self.assertIn("forward", payload["entry_contract"]["selector"])
            self.assertEqual(payload["runtime"]["schema_version"], 8)
            self.assertTrue(payload["artifacts"]["loop_state_db"].endswith("loop_state.sqlite3"))
            self.assertIn("run_state", payload["runtime"]["authoritative_state_owners"])

    def test_forward_context_latest_keeps_runtime_and_repo_digests_separate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            runtime_context = workspace / ".conitens" / "context"
            runtime_context.mkdir(parents=True, exist_ok=True)
            (runtime_context / "LATEST_CONTEXT.md").write_text("runtime-digest", encoding="utf-8")
            repo_context = workspace / ".vibe" / "context"
            repo_context.mkdir(parents=True, exist_ok=True)
            (repo_context / "LATEST_CONTEXT.md").write_text("repo-digest", encoding="utf-8")

            result = self.run_cli("--workspace", str(workspace), "forward", "context-latest", "--format", "json")
            payload = json.loads(result.stdout)
            self.assertEqual(payload["runtime_latest"]["content"], "runtime-digest")
            self.assertEqual(payload["repo_latest"]["content"], "repo-digest")
            self.assertNotEqual(payload["runtime_latest"]["path"], payload["repo_latest"]["path"])

    def test_forward_flag_alias_maps_status_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "--forward", "status")
            self.assertIn("Forward Runtime Status", result.stdout)
            self.assertIn("Default runtime: legacy", result.stdout)

    def test_forward_flag_rejects_non_status_legacy_commands(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "--forward", "start", check=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--forward currently supports only the read-only 'status' command", result.stderr)
