#!/usr/bin/env python3
"""
Install a git pre-commit hook that chains the .vibe fast lane.
"""

from __future__ import annotations

from pathlib import Path


VIBE_MARKER = "# conitens-vibe-precommit"


def install_hooks(repo_root: str | Path) -> Path:
    root = Path(repo_root).resolve()
    hook_dir = root / ".githooks"
    hook_dir.mkdir(parents=True, exist_ok=True)
    target = hook_dir / "pre-commit"
    existing = target.read_text(encoding="utf-8") if target.exists() else "#!/bin/sh\n"
    if VIBE_MARKER not in existing:
        if not existing.endswith("\n"):
            existing += "\n"
        existing += f"{VIBE_MARKER}\npython \"{root / '.vibe' / 'brain' / 'precommit.py'}\" --repo-root \"{root}\"\n"
    target.write_text(existing, encoding="utf-8")
    return target


if __name__ == "__main__":
    print(install_hooks(Path(__file__).resolve().parents[1]))
