#!/usr/bin/env python3
"""
Detect dependency cycles from the .vibe dependency graph.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from context_db import ContextDB


def detect_cycles(repo_root: str | Path) -> list[list[str]]:
    db = ContextDB(Path(repo_root).resolve())
    known_files = {item["path"] for item in db.list_files()}
    graph: dict[str, list[str]] = {path: [] for path in known_files}
    for dep in db.list_deps():
        if dep["to_file"] in known_files:
            graph.setdefault(dep["from_file"], []).append(dep["to_file"])

    cycles: list[list[str]] = []
    stack: list[str] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def dfs(node: str) -> None:
        if node in visiting:
            try:
                index = stack.index(node)
            except ValueError:
                index = 0
            cycle = stack[index:] + [node]
            if cycle not in cycles:
                cycles.append(cycle)
            return
        if node in visited:
            return
        visiting.add(node)
        stack.append(node)
        for neighbor in graph.get(node, []):
            dfs(neighbor)
        stack.pop()
        visiting.remove(node)
        visited.add(node)

    for node in sorted(graph):
        dfs(node)
    return cycles


def find_cycles(db_or_root: ContextDB | str | Path) -> list[list[str]]:
    if isinstance(db_or_root, ContextDB):
        db = db_or_root
        known_files = {item["path"] for item in db.list_files()}
        graph: dict[str, list[str]] = {path: [] for path in known_files}
        for dep in db.list_deps():
            if dep["to_file"] in known_files:
                graph.setdefault(dep["from_file"], []).append(dep["to_file"])

        cycles: list[list[str]] = []
        stack: list[str] = []
        visiting: set[str] = set()
        visited: set[str] = set()

        def dfs(node: str) -> None:
            if node in visiting:
                try:
                    index = stack.index(node)
                except ValueError:
                    index = 0
                cycle = stack[index:] + [node]
                if cycle not in cycles:
                    cycles.append(cycle)
                return
            if node in visited:
                return
            visiting.add(node)
            stack.append(node)
            for neighbor in graph.get(node, []):
                dfs(neighbor)
            stack.pop()
            visiting.remove(node)
            visited.add(node)

        for node in sorted(graph):
            dfs(node)
        return cycles
    return detect_cycles(db_or_root)


def run_cycle_check(repo_root: str | Path) -> dict[str, object]:
    cycles = detect_cycles(repo_root)
    return {"ok": not cycles, "cycles": cycles}


def run_cycle_gate(db_or_root: ContextDB | str | Path, focus_files: list[str] | None = None) -> dict[str, object]:
    cycles = find_cycles(db_or_root)
    if focus_files:
        cycles = [cycle for cycle in cycles if any(path in cycle for path in focus_files)]
    return {"ok": not cycles, "cycles": cycles}


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect dependency cycles in the .vibe graph")
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()
    cycles = detect_cycles(args.repo_root)
    print(json.dumps({"cycles": cycles, "count": len(cycles)}, ensure_ascii=False, indent=2))
    return 1 if cycles else 0


if __name__ == "__main__":
    raise SystemExit(main())
