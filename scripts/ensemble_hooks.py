#!/usr/bin/env python3
"""
Local git hook helpers for Conitens.
"""

from __future__ import annotations

import argparse
import json
import os
import py_compile
import subprocess
from pathlib import Path
from typing import Any

from ensemble_context import update_context
from ensemble_events import append_event


HOOK_DIR = ".githooks"


def repo_root(workspace: str | Path) -> Path:
    return Path(workspace)


def staged_files(workspace: str | Path) -> list[Path]:
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return []
    if result.returncode != 0:
        return []
    return [Path(workspace) / line.strip() for line in result.stdout.splitlines() if line.strip()]


def check_file(path: Path) -> tuple[bool, str]:
    if not path.exists() or path.is_dir():
        return True, "SKIP"

    suffix = path.suffix.lower()
    if suffix == ".py":
        try:
            py_compile.compile(str(path), doraise=True)
            return True, "PASS"
        except py_compile.PyCompileError as exc:
            return False, str(exc)

    if suffix in {".js", ".mjs", ".cjs"}:
        try:
            result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True, timeout=15)
        except FileNotFoundError:
            return True, "SKIP(node missing)"
        return (result.returncode == 0, result.stderr.strip() or "PASS")

    if suffix == ".json":
        try:
            json.loads(path.read_text(encoding="utf-8"))
            return True, "PASS"
        except json.JSONDecodeError as exc:
            return False, str(exc)

    if suffix == ".sh":
        try:
            result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, timeout=15)
        except FileNotFoundError:
            return True, "SKIP(bash missing)"
        return (result.returncode == 0, result.stderr.strip() or "PASS")

    return True, "SKIP"


def run_pre_commit(workspace: str | Path) -> dict[str, Any]:
    files = staged_files(workspace)
    results = []
    for path in files:
        ok, detail = check_file(path)
        results.append({"file": str(path), "ok": ok, "detail": detail})
    status = "PASS" if all(item["ok"] for item in results) else "FAIL"
    append_event(
        workspace,
        event_type="HOOK_RESULT",
        actor={"type": "system", "name": "HOOK"},
        severity="error" if status == "FAIL" else "info",
        payload={"hook": "pre-commit", "status": status, "files": [item["file"] for item in results]},
    )
    return {"hook": "pre-commit", "status": status, "results": results}


def run_post_commit(workspace: str | Path) -> dict[str, Any]:
    context_path = update_context(str(workspace))
    append_event(
        workspace,
        event_type="HOOK_RESULT",
        actor={"type": "system", "name": "HOOK"},
        payload={"hook": "post-commit", "status": "PASS", "context": str(context_path)},
    )
    return {"hook": "post-commit", "status": "PASS", "context": str(context_path)}


def active_task_id(workspace: str | Path) -> str | None:
    focus_file = Path(workspace) / ".notes" / "ACTIVE" / "_focus.md"
    if not focus_file.exists():
        return None
    for line in focus_file.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("current_task:"):
            value = line.split(":", 1)[1].strip()
            return None if value == "null" else value
    return None


def run_commit_msg(workspace: str | Path, message_file: str | Path) -> dict[str, Any]:
    message_path = Path(message_file)
    if not message_path.exists():
        return {"hook": "commit-msg", "status": "SKIP", "reason": "missing message file"}

    current_task = active_task_id(workspace)
    content = message_path.read_text(encoding="utf-8")
    if current_task and current_task not in content:
        lines = content.splitlines()
        for index, line in enumerate(lines):
            if line.strip() and not line.startswith("#"):
                lines[index] = f"[{current_task}] {line}"
                break
        else:
            lines.append(f"[{current_task}]")
        message_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    append_event(
        workspace,
        event_type="HOOK_RESULT",
        actor={"type": "system", "name": "HOOK"},
        payload={"hook": "commit-msg", "status": "PASS", "task_id": current_task},
    )
    return {"hook": "commit-msg", "status": "PASS", "task_id": current_task}


def install_hooks(workspace: str | Path, configure_git: bool = False) -> Path:
    root = repo_root(workspace)
    hook_path = root / HOOK_DIR
    hook_path.mkdir(parents=True, exist_ok=True)

    script_root = Path(__file__).resolve().parent
    entries = {
        "pre-commit": f"#!/bin/sh\npython \"{script_root / 'ensemble_hooks.py'}\" --workspace \"{root}\" pre-commit\n",
        "post-commit": f"#!/bin/sh\npython \"{script_root / 'ensemble_hooks.py'}\" --workspace \"{root}\" post-commit\n",
        "commit-msg": f"#!/bin/sh\npython \"{script_root / 'ensemble_hooks.py'}\" --workspace \"{root}\" commit-msg \"$1\"\n",
    }
    for name, content in entries.items():
        target = hook_path / name
        target.write_text(content, encoding="utf-8")
        try:
            target.chmod(0o755)
        except OSError:
            pass

    if configure_git:
        subprocess.run(["git", "config", "core.hooksPath", HOOK_DIR], cwd=workspace, check=False)

    append_event(
        workspace,
        event_type="HOOK_RESULT",
        actor={"type": "system", "name": "HOOK"},
        payload={"hook": "install", "status": "PASS", "path": str(hook_path), "configured_git": configure_git},
    )
    return hook_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens local hook helpers")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    install_parser = subparsers.add_parser("install")
    install_parser.add_argument("--configure-git", action="store_true")

    subparsers.add_parser("pre-commit")
    subparsers.add_parser("post-commit")

    commit_parser = subparsers.add_parser("commit-msg")
    commit_parser.add_argument("message_file")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "install":
        print(install_hooks(args.workspace, args.configure_git))
        return 0
    if args.command == "pre-commit":
        result = run_pre_commit(args.workspace)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "PASS" else 1
    if args.command == "post-commit":
        print(json.dumps(run_post_commit(args.workspace), ensure_ascii=False, indent=2))
        return 0
    if args.command == "commit-msg":
        print(json.dumps(run_commit_msg(args.workspace, args.message_file), ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
