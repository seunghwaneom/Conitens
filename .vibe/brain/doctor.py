#!/usr/bin/env python3
"""
Slow-lane doctor report for full repo intelligence refresh.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from check_circular import detect_cycles
from dependency_hotspots import report_hotspots
from indexer import scan_all
from summarizer import write_latest_context
from typecheck_baseline import check_against_baseline, load_baseline


def doctor_report_path(repo_root: str | Path) -> Path:
    root = Path(repo_root)
    config = json.loads((root / ".vibe" / "config.json").read_text(encoding="utf-8"))
    target = root / config["doctor_report_path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def run_doctor(repo_root: str | Path, *, runner=None) -> dict[str, Any]:
    root = Path(repo_root)
    scan = scan_all(root)
    digest = write_latest_context(root)
    hotspots = report_hotspots(root)
    cycles = detect_cycles(root)
    baseline = check_against_baseline(root, None, runner=runner) if runner is not None else check_against_baseline(root, None)
    report_path = doctor_report_path(root)
    report_lines = [
        "# DOCTOR_REPORT",
        "",
        "## Scan",
        "",
        f"- Indexed files: {scan['files_indexed']}",
        f"- Errors: {len(scan['errors'])}",
        "",
        "## Cycles",
        "",
    ]
    if cycles:
        report_lines.extend(f"- {' -> '.join(cycle)}" for cycle in cycles)
    else:
        report_lines.append("- No cycles detected.")
    report_lines.extend(["", "## Hotspots", ""])
    report_lines.extend(f"- `{item['file']}` inbound={item['inbound_dep_count']}, functions={item['fn_count']}, loc={item['loc']}" for item in hotspots["hotspots"][:8])
    report_lines.extend(["", "## Typecheck Baseline", ""])
    report_lines.append(f"- Status: {baseline['status']}")
    if baseline.get("reason"):
        report_lines.append(f"- Reason: {baseline['reason']}")
    report_lines.extend(["", "## Digest", "", f"- {digest}"])
    report_path.write_text("\n".join(report_lines).rstrip() + "\n", encoding="utf-8")
    return {
        "report_path": str(report_path),
        "scan": scan,
        "cycles": cycles,
        "hotspots": hotspots,
        "baseline": baseline,
        "digest_path": str(digest),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run slow-lane .vibe doctor")
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()
    result = run_doctor(args.repo_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["cycles"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
