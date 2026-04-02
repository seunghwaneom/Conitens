from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIBE_BRAIN = ROOT / ".vibe" / "brain"
sys.path.insert(0, str(VIBE_BRAIN))

from check_circular import run_cycle_gate
from context_db import ContextDB
from doctor import run_doctor
from precommit import collect_staged_files
from typecheck_baseline import evaluate_baseline, ensure_baseline


class VibeQualityTests(unittest.TestCase):
    def prepare_workspace(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".vibe").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "config.json").write_text(
            json.dumps(
                {
                    "db_path": ".vibe/brain/context.sqlite3",
                    "latest_context_path": ".vibe/context/LATEST_CONTEXT.md",
                    "doctor_report_path": ".vibe/context/DOCTOR_REPORT.md",
                    "typecheck_baseline_path": ".vibe/baselines/typecheck.json",
                    "include_globs": ["**/*.py", "**/*.ts"],
                    "scan_globs": ["**/*.py", "**/*.ts"],
                    "ignore_dirs": [".git", ".vibe"],
                    "temp_suffixes": [".tmp", ".temp", ".swp", ".swx", "~"],
                    "watch_extensions": [".py", ".ts"],
                    "debounce_ms": 100
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return root

    def fake_runner_factory(self, mapping: dict[str, tuple[int, str]]):
        def run(command: str, cwd: Path):
            exit_code, output = mapping[command]
            return {"returncode": exit_code, "output": output}
        return run

    def test_baseline_init(self) -> None:
        root = self.prepare_workspace()
        runner = self.fake_runner_factory({"pnpm.cmd --filter @conitens/command-center typecheck": (1, "error TS1000: one")})

        command = "pnpm.cmd --filter @conitens/command-center typecheck"
        result = ensure_baseline(root, [command], runner=runner)

        self.assertTrue((root / ".vibe" / "baselines" / "typecheck.json").exists())
        baseline = json.loads((root / ".vibe" / "baselines" / "typecheck.json").read_text(encoding="utf-8"))
        self.assertEqual(baseline["targets"]["@conitens/command-center::typecheck"]["error_count"], 1)

    def test_increased_type_errors_cause_failure(self) -> None:
        root = self.prepare_workspace()
        command = "pnpm.cmd --filter @conitens/command-center typecheck"
        ensure_baseline(root, [command], runner=self.fake_runner_factory({command: (1, "error TS1000: one")}))

        result = evaluate_baseline(root, [command], runner=self.fake_runner_factory({command: (1, "error TS1000: one\nerror TS1001: two")}))

        self.assertFalse(result["ok"])
        self.assertEqual(result["results"][0]["delta"], 1)

    def test_same_or_decreased_type_errors_pass(self) -> None:
        root = self.prepare_workspace()
        command = "pnpm.cmd --filter @conitens/command-center typecheck"
        ensure_baseline(root, [command], runner=self.fake_runner_factory({command: (1, "error TS1000: one\nerror TS1001: two")}))

        same = evaluate_baseline(root, [command], runner=self.fake_runner_factory({command: (1, "error TS1000: one\nerror TS1001: two")}))
        less = evaluate_baseline(root, [command], runner=self.fake_runner_factory({command: (1, "error TS1000: one")}))

        self.assertTrue(same["ok"])
        self.assertTrue(less["ok"])

    def test_cycle_detection_blocks(self) -> None:
        root = self.prepare_workspace()
        db = ContextDB(root)
        db.upsert_file(path="src/a.ts", mtime=1.0, hash_value="a", loc=1, parse_error=None, indexed_at="t")
        db.upsert_file(path="src/b.ts", mtime=1.0, hash_value="b", loc=1, parse_error=None, indexed_at="t")
        db.replace_file_rows(
            path="src/a.ts",
            functions=[],
            deps=[{"from_file": "src/a.ts", "to_file": "src/b.ts", "kind": "import"}],
            fts_rows=[],
        )
        db.replace_file_rows(
            path="src/b.ts",
            functions=[],
            deps=[{"from_file": "src/b.ts", "to_file": "src/a.ts", "kind": "import"}],
            fts_rows=[],
        )

        result = run_cycle_gate(db, focus_files=["src/a.ts"])

        self.assertFalse(result["ok"])
        self.assertTrue(result["cycles"])

    def test_precommit_staged_only_logic(self) -> None:
        root = self.prepare_workspace()
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.name", "Codex"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.email", "codex@example.invalid"], cwd=root, check=True)
        (root / "src").mkdir()
        staged = root / "src" / "staged.py"
        unstaged = root / "src" / "unstaged.py"
        staged.write_text("print('a')\n", encoding="utf-8")
        unstaged.write_text("print('b')\n", encoding="utf-8")
        subprocess.run(["git", "add", "src/staged.py"], cwd=root, check=True)

        files = collect_staged_files(root)

        self.assertEqual(files, ["src/staged.py"])

    def test_doctor_generates_report(self) -> None:
        root = self.prepare_workspace()
        (root / "src").mkdir()
        (root / "src" / "alpha.py").write_text("def alpha(x):\n    return x\n", encoding="utf-8")
        (root / "src" / "beta.ts").write_text("export function beta(x) { return x; }\n", encoding="utf-8")

        result = run_doctor(root)

        self.assertTrue((root / ".vibe" / "context" / "DOCTOR_REPORT.md").exists())
        self.assertTrue((root / ".vibe" / "context" / "LATEST_CONTEXT.md").exists())
        self.assertIn("report_path", result)


if __name__ == "__main__":
    unittest.main()
