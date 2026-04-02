#!/usr/bin/env python3
"""
Report dependency hotspots from the .vibe graph.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from context_db import ContextDB


def top_hotspots(db: ContextDB, *, limit: int = 10) -> list[dict]:
    return db.summarize_hotspots(limit)


def report_hotspots(repo_root: str | Path, *, limit: int = 10) -> dict:
    db = ContextDB(Path(repo_root).resolve())
    return {"hotspots": top_hotspots(db, limit=limit)}


def report_hotspots(repo_root: str | Path, *, limit: int = 10) -> dict[str, object]:
    db = ContextDB(Path(repo_root).resolve())
    return {"hotspots": top_hotspots(db, limit=limit)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Dependency hotspot report")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    print(json.dumps(report_hotspots(args.repo_root, limit=args.limit), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
