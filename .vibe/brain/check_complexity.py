#!/usr/bin/env python3
"""
Warn-only complexity heuristics for staged or full repo checks.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from context_db import ContextDB


def complexity_warnings(db: ContextDB, files: list[str] | None = None) -> list[dict[str, Any]]:
    file_filter = set(files or [])
    file_meta = {item["path"]: item for item in db.list_files()}
    warnings: list[dict[str, Any]] = []
    for function in db.list_functions():
        if file_filter and function["file"] not in file_filter:
            continue
        param_count = len(function["params_json"])
        if param_count > 5:
            warnings.append(
                {
                    "kind": "params",
                    "file": function["file"],
                    "line": function["line"],
                    "symbol": function["name"],
                    "message": f"{function['name']} has {param_count} parameters",
                }
            )
    for path, info in file_meta.items():
        if file_filter and path not in file_filter:
            continue
        if int(info.get("loc") or 0) >= 800:
            warnings.append(
                {
                    "kind": "loc",
                    "file": path,
                    "line": 1,
                    "symbol": path,
                    "message": f"{path} is large ({info['loc']} LOC)",
                }
            )
    return warnings


def analyze_complexity(repo_root: str | Path, files: list[str]) -> dict[str, Any]:
    db = ContextDB(Path(repo_root).resolve())
    warnings = complexity_warnings(db, files or None)
    grouped: dict[str, list[str]] = {}
    for item in warnings:
        grouped.setdefault(item["file"], []).append(item["message"])
    return {"files": [{"file": file_path, "warnings": messages} for file_path, messages in grouped.items()]}


def main() -> int:
    parser = argparse.ArgumentParser(description="Warn-only complexity checks")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("files", nargs="*")
    args = parser.parse_args()
    db = ContextDB(Path(args.repo_root).resolve())
    print(json.dumps({"warnings": complexity_warnings(db, args.files or None)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
