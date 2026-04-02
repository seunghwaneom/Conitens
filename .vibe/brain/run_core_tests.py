#!/usr/bin/env python3
"""
Cheap smoke-test selection for the fast lane.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from typecheck_baseline import CommandResult, Runner, default_runner


def select_smoke_commands(repo_root: str | Path, changed_files: list[str]) -> list[list[str]]:
    normalized = [Path(path).as_posix() for path in changed_files]
    if normalized and all(path.startswith(".vibe/") or path == "tests/test_vibe_brain.py" or path == "tests/test_vibe_quality_gates.py" for path in normalized):
        return [[
            "python",
            "-m",
            "unittest",
            "tests.test_vibe_brain",
            "tests.test_vibe_quality_gates",
        ]]
    if all(
        path.startswith("scripts/")
        or path == "tests/test_loop_state.py"
        or path == "tests/test_context_markdown.py"
        or path.startswith(".vibe/")
        or path.startswith(".conitens/context/")
        for path in normalized
    ):
        return [[
            "python",
            "-m",
            "unittest",
            "tests.test_loop_state",
            "tests.test_context_markdown",
        ]]
    return []


def run_core_tests(repo_root: str | Path, changed_files: list[str], runner: Runner = default_runner) -> dict[str, Any]:
    root = Path(repo_root)
    commands = select_smoke_commands(root, changed_files)
    if not commands:
        return {"status": "skipped", "reason": "no cheap smoke suite for changed files"}
    results = []
    failed = False
    for command in commands:
        result = runner(command, root)
        results.append({"command": command, "exit_code": result.exit_code})
        if result.exit_code != 0:
            failed = True
    return {"status": "failed" if failed else "passed", "results": results}
