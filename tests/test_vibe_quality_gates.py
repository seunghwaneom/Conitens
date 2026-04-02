from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIBE_BRAIN = ROOT / ".vibe" / "brain"
sys.path.insert(0, str(VIBE_BRAIN))

from check_circular import detect_cycles
from doctor import run_doctor
from indexer import scan_all
from precommit import run_precommit
from typecheck_baseline import capture_baseline, check_against_baseline


class FakeRunner:
    def __init__(self, outputs: list[tuple[int, str, str]]):
        self.outputs = outputs
        self.calls: list[list[str]] = []

    def __call__(self, command: list[str], cwd: Path):
        self.calls.append(command)
        exit_code, stdout, stderr = self.outputs.pop(0)
        from typecheck_baseline import CommandResult

        return CommandResult(exit_code, stdout, stderr)


class VibeQualityGatesTests(unittest.TestCase):
    def prepare_repo(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".vibe" / "brain").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "config.json").write_text(
            json.dumps(
                {
                    "db_path": ".vibe/brain/context.sqlite3",
                    "latest_context_path": ".vibe/context/LATEST_CONTEXT.md",
                    "doctor_report_path": ".vibe/context/DOCTOR_REPORT.md",
                    "typecheck_baseline_path": ".vibe/baselines/typecheck_baseline.json",
                    "scan_globs": ["**/*.py", "**/*.ts"],
                    "ignore_dirs": [".git", ".vibe", ".conitens", "node_modules"],
                    "temp_suffixes": [".tmp", ".temp", ".swp", ".swx", "~"],
                    "watch_extensions": [".py", ".ts"],
                    "debounce_ms": 100,
                    "fast_smoke_tests": ["python -m unittest tests.test_vibe_brain"]
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (root / "packages" / "command-center").mkdir(parents=True, exist_ok=True)
        (root / "packages" / "command-center" / "package.json").write_text(
            json.dumps(
                {
                    "name": "@conitens/command-center",
                    "scripts": {"typecheck": "tsc -b --noEmit"},
                }
            ),
            encoding="utf-8",
        )
        return root

    def test_baseline_init(self) -> None:
        root = self.prepare_repo()
        runner = FakeRunner([(1, "", "a.ts(1,1): error TS1000: oops")])
        result = capture_baseline(root, ["packages/command-center/src/app.ts"], runner=runner)
        self.assertEqual(result["status"], "initialized")
        self.assertTrue((root / ".vibe" / "baselines" / "typecheck_baseline.json").exists())

    def test_increased_type_errors_cause_failure(self) -> None:
        root = self.prepare_repo()
        capture_baseline(root, ["packages/command-center/src/app.ts"], runner=FakeRunner([(1, "", "error TS1000\na\nerror TS2000")]))
        result = check_against_baseline(root, ["packages/command-center/src/app.ts"], runner=FakeRunner([(1, "", "error TS1000\na\nerror TS2000\nerror TS3000")]))
        self.assertEqual(result["status"], "failed")

    def test_same_or_decreased_type_errors_pass(self) -> None:
        root = self.prepare_repo()
        capture_baseline(root, ["packages/command-center/src/app.ts"], runner=FakeRunner([(1, "", "error TS1000\na\nerror TS2000")]))
        result = check_against_baseline(root, ["packages/command-center/src/app.ts"], runner=FakeRunner([(1, "", "error TS1000")]))
        self.assertEqual(result["status"], "passed")

    def test_cycle_detection_blocks(self) -> None:
        root = self.prepare_repo()
        (root / "src").mkdir()
        (root / "src" / "a.py").write_text("from .b import thing\n", encoding="utf-8")
        (root / "src" / "b.py").write_text("from .a import thing\n", encoding="utf-8")
        scan_all(root)
        cycles = detect_cycles(root)
        self.assertTrue(cycles)

    def test_precommit_staged_only_logic(self) -> None:
        root = self.prepare_repo()
        (root / "src").mkdir()
        (root / "src" / "one.py").write_text("def one():\n    return 1\n", encoding="utf-8")
        (root / "README.md").write_text("docs\n", encoding="utf-8")
        summary = run_precommit(
            root,
            staged_files=["src/one.py", "README.md"],
            runner=FakeRunner([(0, "", "")]),
        )
        self.assertIn("src/one.py", summary["scannable_files"])
        self.assertNotIn("README.md", summary["scannable_files"])

    def test_doctor_generates_report(self) -> None:
        root = self.prepare_repo()
        (root / "src").mkdir()
        (root / "src" / "alpha.py").write_text("def alpha():\n    return 1\n", encoding="utf-8")
        result = run_doctor(root, runner=FakeRunner([(0, "", "")]))
        report = Path(result["report_path"])
        self.assertTrue(report.exists())
        content = report.read_text(encoding="utf-8")
        self.assertIn("## Scan", content)
        self.assertIn("## Hotspots", content)


if __name__ == "__main__":
    unittest.main()
