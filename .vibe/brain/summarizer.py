#!/usr/bin/env python3
"""
Repo intelligence summarizer for .vibe/context/LATEST_CONTEXT.md.
"""

from __future__ import annotations

from pathlib import Path

from context_db import ContextDB, load_config


class RepoSummarizer:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.db = ContextDB(self.root)

    def write(self) -> Path:
        return write_latest_context(self.root, db=self.db)


def recent_changes(db: ContextDB, limit: int = 8) -> list[str]:
    return [item["path"] for item in db.list_recent_files(limit=limit)]


def critical_map(db: ContextDB, limit: int = 8) -> list[str]:
    items = []
    for function in db.list_functions():
        tags = set(function["tags_json"])
        if function["exported_int"] or "critical" in tags:
            tag_text = ", ".join(sorted(tags))
            items.append(f"`{function['file']}:{function['line']}` {function['name']} [{tag_text}]")
    return items[:limit]


def warnings(db: ContextDB, limit: int = 8) -> list[str]:
    items: list[str] = []
    for file_info in db.list_files():
        if file_info.get("parse_error"):
            items.append(f"`{file_info['path']}` parse error: {file_info['parse_error']}")
    for hotspot in db.summarize_hotspots(limit):
        if hotspot["inbound_dep_count"] >= 10:
            items.append(f"`{hotspot['file']}` has high inbound dependency count ({hotspot['inbound_dep_count']})")
    return items[:limit]


def hotspots(db: ContextDB, limit: int = 8) -> list[str]:
    return [
        f"`{item['file']}` loc={item['loc']}, functions={item['fn_count']}, inbound_deps={item['inbound_dep_count']}"
        for item in db.summarize_hotspots(limit)
    ]


def next_actions(db: ContextDB) -> list[str]:
    warning_items = warnings(db, limit=3)
    if warning_items:
        return [f"Investigate {item}" for item in warning_items]
    hotspot_items = hotspots(db, limit=3)
    if hotspot_items:
        return [f"Review hotspot {item}" for item in hotspot_items]
    return ["No urgent repo-intelligence actions detected."]


def render_latest_context(db: ContextDB, *, pack_name: str = "conitens-repo-intel") -> str:
    latest_index_time = db.list_recent_files(limit=1)
    generated = latest_index_time[0]["indexed_at"] if latest_index_time else "n/a"
    lines = [
        "# LATEST_CONTEXT",
        "",
        f"> Generated: {generated}",
        f"> Pack: {pack_name}",
        "",
        "## [1] Recent Changes",
        "<!-- ## Recent Changes -->",
        "",
    ]
    recent = recent_changes(db)
    lines.extend(f"- `{item}`" for item in recent) if recent else lines.append("No recent changes.")
    lines.extend(["", "## [2] Critical Map", "<!-- ## Critical Map -->", ""])
    critical = critical_map(db)
    lines.extend(f"- {item}" for item in critical) if critical else lines.append("No critical map items.")
    lines.extend(["", "## [3] Warnings", "<!-- ## Warnings -->", ""])
    warning_items = warnings(db)
    lines.extend(f"- {item}" for item in warning_items) if warning_items else lines.append("No warnings.")
    lines.extend(["", "## [4] Hotspots", "<!-- ## Hotspots -->", ""])
    hotspot_items = hotspots(db)
    lines.extend(f"- {item}" for item in hotspot_items) if hotspot_items else lines.append("No hotspots.")
    lines.extend(["", "## [5] Next Actions", "<!-- ## Next Actions -->", ""])
    lines.extend(f"- {item}" for item in next_actions(db))
    return "\n".join(lines).rstrip() + "\n"


def write_latest_context(root: str | Path, *, db: ContextDB | None = None) -> Path:
    root_path = Path(root).resolve()
    config = load_config(root_path)
    database = db or ContextDB(root_path)
    target = root_path / (config.get("latest_context_path") or config["digest_path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_latest_context(database), encoding="utf-8")
    return target


generate_digest = write_latest_context
write_digest = write_latest_context
