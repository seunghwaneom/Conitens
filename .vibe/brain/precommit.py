#!/usr/bin/env python3
"""
Staged-only fast-lane checks for the .vibe sidecar.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path
from typing import Any

from check_circular import detect_cycles
from check_complexity import analyze_complexity
from context_db import load_config
from impact_analyzer import analyze_impact
from indexer import scan_file
from run_core_tests import run_core_tests
from typecheck_baseline import check_against_baseline


def list_staged_files(repo_root: str | Path) -> list[str]:
    root = Path(repo_root)
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def collect_staged_files(repo_root: str | Path) -> list[str]:
    return list_staged_files(repo_root)


def run_precommit(
    repo_root: str | Path,
    *,
    staged_files: list[str] | None = None,
    runner=None,
) -> dict[str, Any]:
    root = Path(repo_root)
    start = time.perf_counter()
    config = load_config(root)
    watch_extensions = {suffix.lower() for suffix in config.get("watch_extensions", [])}
    staged = staged_files if staged_files is not None else list_staged_files(root)
    scannable = []
    for path in staged:
        absolute = root / path
        if absolute.exists() and absolute.is_file() and absolute.suffix.lower() in watch_extensions:
            try:
                scan_file(root, path)
                scannable.append(path)
            except Exception:
                pass
    impact = analyze_impact(root, scannable) if scannable else {"files": []}
    baseline = check_against_baseline(root, staged, runner=runner) if runner is not None else check_against_baseline(root, staged)
    all_cycles = detect_cycles(root)
    cycles = [cycle for cycle in all_cycles if any(path in cycle for path in scannable)] if scannable else []
    complexity = analyze_complexity(root, scannable) if scannable else {"files": []}
    smoke = run_core_tests(root, staged, runner=runner) if runner is not None else run_core_tests(root, staged)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    blocked = bool(cycles) or baseline.get("status") == "failed" or smoke.get("status") == "failed"
    return {
        "status": "failed" if blocked else "passed",
        "staged_files": staged,
        "scannable_files": scannable,
        "impact": impact,
        "baseline": baseline,
        "cycles": cycles,
        "complexity": complexity,
        "smoke": smoke,
        "duration_ms": duration_ms,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run staged-only .vibe precommit checks")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--file", action="append", dest="files")
    args = parser.parse_args()
    result = run_precommit(args.repo_root, staged_files=args.files)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
