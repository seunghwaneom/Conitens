#!/usr/bin/env python3
"""
Canonical .notes path helpers with lowercase-first aliases.
"""

from __future__ import annotations

from pathlib import Path


NOTES_DIRNAME = ".notes"
LOWERCASE_NOTES_DIRS = {
    "workflows": "workflows",
    "events": "events",
    "meetings": "meetings",
    "office": "office",
    "context": "context",
    "artifacts": "artifacts",
    "handoffs": "handoffs",
    "gates": "gates",
    "agents": "agents",
    "subagents": "subagents",
    "memories": "memories",
    "rooms": "rooms",
}
LEGACY_NOTES_DIRS = {
    "workflows": "WORKFLOWS",
    "events": "EVENTS",
    "meetings": "MEETINGS",
    "office": "OFFICE",
    "context": "context",
    "artifacts": "ARTIFACTS",
    "handoffs": "HANDOFFS",
    "gates": "GATES",
    "agents": "AGENTS",
    "subagents": "SUBAGENTS",
    "memories": "MEMORIES",
    "rooms": "ROOMS",
}


def notes_root(workspace: str | Path) -> Path:
    return Path(workspace) / NOTES_DIRNAME


def canonical_notes_dir(workspace: str | Path, logical_name: str) -> Path:
    return notes_root(workspace) / LOWERCASE_NOTES_DIRS[logical_name]


def legacy_notes_dir(workspace: str | Path, logical_name: str) -> Path:
    return notes_root(workspace) / LEGACY_NOTES_DIRS[logical_name]


def ensure_notes_dir(workspace: str | Path, logical_name: str) -> Path:
    path = canonical_notes_dir(workspace, logical_name)
    path.mkdir(parents=True, exist_ok=True)
    return path


def preferred_notes_dir(workspace: str | Path, logical_name: str, *, create: bool = False) -> Path:
    canonical = canonical_notes_dir(workspace, logical_name)
    legacy = legacy_notes_dir(workspace, logical_name)
    if canonical.exists():
        return canonical
    if legacy.exists():
        return legacy
    if create:
        canonical.mkdir(parents=True, exist_ok=True)
        return canonical
    return canonical


def candidate_notes_dirs(workspace: str | Path, logical_name: str, *, include_missing: bool = False) -> list[Path]:
    canonical = canonical_notes_dir(workspace, logical_name)
    legacy = legacy_notes_dir(workspace, logical_name)
    candidates: list[Path] = []
    for path in (canonical, legacy):
        if include_missing or path.exists():
            candidates.append(path)
    seen: set[str] = set()
    deduped: list[Path] = []
    for path in candidates:
        key = str(path.resolve()) if path.exists() else str(path)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(path)
    return deduped


__all__ = [
    "candidate_notes_dirs",
    "canonical_notes_dir",
    "ensure_notes_dir",
    "legacy_notes_dir",
    "notes_root",
    "preferred_notes_dir",
]
