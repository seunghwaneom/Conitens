#!/usr/bin/env python3
"""
Changed-file impact analysis using the .vibe dependency graph.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from context_db import ContextDB


def _reverse_graph(db: ContextDB) -> dict[str, set[str]]:
    graph: dict[str, set[str]] = {}
    known_files = {item["path"] for item in db.list_files()}
    for dep in db.list_deps():
        from_file = dep["from_file"]
        to_file = dep["to_file"]
        if to_file not in known_files:
            continue
        graph.setdefault(to_file, set()).add(from_file)
    return graph


def _transitive_fanout(graph: dict[str, set[str]], start: str) -> set[str]:
    seen: set[str] = set()
    stack = list(graph.get(start, set()))
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        stack.extend(graph.get(node, set()) - seen)
    return seen


def analyze_impact(repo_root: str | Path, changed_files: list[str]) -> dict[str, Any]:
    db = ContextDB(Path(repo_root).resolve())
    reverse = _reverse_graph(db)
    hotspot_map = {item["file"]: item for item in db.summarize_hotspots(limit=50)}
    functions_by_file: dict[str, list[dict[str, Any]]] = {}
    for function in db.list_functions():
        functions_by_file.setdefault(function["file"], []).append(function)

    results = []
    for file_path in changed_files:
        impacted = sorted(_transitive_fanout(reverse, file_path))
        functions = functions_by_file.get(file_path, [])
        exported_count = sum(1 for item in functions if item["exported_int"])
        hotspot = hotspot_map.get(file_path, {})
        loc = int(hotspot.get("loc") or 0)
        inbound = int(hotspot.get("inbound_dep_count") or 0)
        fanout = len(impacted)
        risk_score = min(
            100,
            fanout * 8
            + exported_count * 10
            + (15 if loc >= 500 else 0)
            + (10 if inbound >= 10 else 0),
        )
        results.append(
            {
                "file": file_path,
                "reverse_dependents": impacted,
                "fanout": fanout,
                "exported_symbols": exported_count,
                "risk_score": risk_score,
            }
        )
    return {"files": results}


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze reverse dependency fan-out for changed files")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    print(json.dumps(analyze_impact(args.repo_root, args.files), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
