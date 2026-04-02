#!/usr/bin/env python3
"""
Forward runtime entry helpers for the additive `.conitens` stack.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from ensemble_loop_paths import latest_context_path as runtime_latest_context_path
from ensemble_loop_paths import loop_state_db_path, loop_state_debug_path
from ensemble_loop_repository import LoopStateRepository
from ensemble_state_restore import StateRestoreService


FORWARD_SUPPORTED_ACTIONS = ("status", "context-latest")
FORWARD_CLI_ACTIONS = FORWARD_SUPPORTED_ACTIONS + ("serve",)
FORWARD_ENTRY_NOTE = (
    "Forward mode is additive and read-only here. The active runtime default remains "
    "scripts/ensemble.py + .notes/ + .agent/."
)


def _read_optional_text(path: Path) -> str | None:
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def _repo_latest_context_path(workspace: str | Path) -> Path:
    return Path(workspace) / ".vibe" / "context" / "LATEST_CONTEXT.md"


def build_forward_status(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    restore = StateRestoreService(repository)
    latest_snapshot = restore.restore_latest_active_run_from_disk()
    latest_run = latest_snapshot["run"] if latest_snapshot else None
    latest_iteration = latest_snapshot["latest_iteration"] if latest_snapshot else None
    return {
        "mode": "forward",
        "entry_contract": {
            "selector": ["forward", "--forward status"],
            "scope": "read_only_forward_runtime_entry",
            "supported_actions": list(FORWARD_CLI_ACTIONS),
            "default_runtime": "legacy",
            "note": FORWARD_ENTRY_NOTE,
        },
        "workspace_root": str(Path(workspace).resolve()),
        "artifacts": {
            "loop_state_db": str(loop_state_db_path(workspace)),
            "loop_state_debug": str(loop_state_debug_path(workspace)),
            "runtime_latest_context": str(runtime_latest_context_path(workspace)),
            "repo_latest_context": str(_repo_latest_context_path(workspace)),
        },
        "runtime": {
            "active_runtime_truth": "scripts/ensemble.py + .notes/ + .agent/",
            "forward_runtime_surface": ".conitens/ + scripts/ensemble_*.py",
            "schema_version": repository.schema_version(),
            "authoritative_state_owners": repository.authoritative_state_owners(),
            "counts": {
                "runs": len(repository.list_runs()),
                "iterations": len(repository.list_iterations(latest_run["run_id"])) if latest_run else 0,
                "approval_requests": len(repository.list_approval_requests()),
                "rooms": len(repository.list_room_records()),
                "messages": len(repository.list_room_messages()),
                "tool_events": len(repository.list_tool_events()),
                "insights": len(repository.list_insights()),
                "handoff_packets": len(repository.list_handoff_packets()),
            },
            "latest_active_run": {
                "run_id": latest_run["run_id"] if latest_run else None,
                "status": latest_run["status"] if latest_run else None,
                "latest_iteration_id": latest_iteration["iteration_id"] if latest_iteration else None,
                "latest_iteration_status": latest_iteration["status"] if latest_iteration else None,
            },
        },
    }


def build_context_latest_payload(workspace: str | Path) -> dict[str, Any]:
    runtime_path = runtime_latest_context_path(workspace)
    repo_path = _repo_latest_context_path(workspace)
    return {
        "mode": "forward",
        "runtime_latest": {
            "path": str(runtime_path),
            "content": _read_optional_text(runtime_path),
        },
        "repo_latest": (
            {
                "path": str(repo_path),
                "content": _read_optional_text(repo_path),
            }
            if repo_path.exists()
            else None
        ),
    }


def render_forward_status_text(payload: dict[str, Any]) -> str:
    runtime = payload["runtime"]
    counts = runtime["counts"]
    latest = runtime["latest_active_run"]
    lines = [
        "Forward Runtime Status",
        "",
        f"Default runtime: {payload['entry_contract']['default_runtime']}",
        f"Forward surface: {runtime['forward_runtime_surface']}",
        f"Schema version: {runtime['schema_version']}",
        f"Latest active run: {latest['run_id'] or 'none'}",
        f"Latest iteration: {latest['latest_iteration_id'] or 'none'}",
        "",
        "Counts:",
        f"- runs: {counts['runs']}",
        f"- iterations (latest run scope): {counts['iterations']}",
        f"- approval_requests: {counts['approval_requests']}",
        f"- rooms: {counts['rooms']}",
        f"- messages: {counts['messages']}",
        f"- tool_events: {counts['tool_events']}",
        f"- insights: {counts['insights']}",
        f"- handoff_packets: {counts['handoff_packets']}",
        "",
        "Artifacts:",
        f"- loop_state_db: {payload['artifacts']['loop_state_db']}",
        f"- loop_state_debug: {payload['artifacts']['loop_state_debug']}",
        f"- runtime_latest_context: {payload['artifacts']['runtime_latest_context']}",
        f"- repo_latest_context: {payload['artifacts']['repo_latest_context']}",
        "",
        f"Note: {payload['entry_contract']['note']}",
    ]
    return "\n".join(lines)


def render_context_latest_text(payload: dict[str, Any]) -> str:
    runtime_latest = payload["runtime_latest"]
    repo_latest = payload["repo_latest"]
    lines = [
        "Forward Context Latest",
        "",
        f"runtime_latest.path: {runtime_latest['path']}",
        "",
        runtime_latest["content"] or "_missing_",
        "",
    ]
    if repo_latest is None:
        lines.extend(["repo_latest.path: _missing_", "", "_missing_"])
    else:
        lines.extend(
            [
                f"repo_latest.path: {repo_latest['path']}",
                "",
                repo_latest["content"] or "_missing_",
            ]
        )
    return "\n".join(lines)


def run_forward_action(workspace: str | Path, *, action: str, output_format: str = "text") -> str:
    if action == "status":
        payload = build_forward_status(workspace)
        if output_format == "json":
            return json.dumps(payload, ensure_ascii=False, indent=2)
        return render_forward_status_text(payload)
    if action == "context-latest":
        payload = build_context_latest_payload(workspace)
        if output_format == "json":
            return json.dumps(payload, ensure_ascii=False, indent=2)
        return render_context_latest_text(payload)
    raise ValueError(f"Unsupported forward action: {action}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens forward runtime helpers")
    parser.add_argument("--workspace", default=os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd()))
    parser.add_argument("action", choices=FORWARD_CLI_ACTIONS)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8785)
    parser.add_argument("--reviewer")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.action == "serve":
        from ensemble_forward_bridge import run_forward_bridge

        launched = run_forward_bridge(
            args.workspace,
            host=args.host,
            port=args.port,
            once=args.once,
            reviewer_identity=args.reviewer,
        )
        print(
            json.dumps(
                {
                    "url": launched["url"],
                    "api_root": launched["api_root"],
                    "token": launched["token"],
                    "reviewer_identity": launched["reviewer_identity"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    print(run_forward_action(args.workspace, action=args.action, output_format=args.format))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
