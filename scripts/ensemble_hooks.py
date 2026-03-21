#!/usr/bin/env python3
"""
Local git hook helpers for Conitens.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import py_compile
import subprocess
from pathlib import Path
from typing import Any

from ensemble_context import update_context
from ensemble_events import append_event
from ensemble_contracts import parse_simple_yaml
from ensemble_gate import create_workflow_approval, list_gate_records, update_gate_record


HOOK_DIR = ".githooks"
BLOCKING_GATES_FILE = "blocking_gates.yaml"
HOOK_POLICY_FILE = "hooks.yaml"


def repo_root(workspace: str | Path) -> Path:
    return Path(workspace)


def hook_policy_path(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent" / "policies" / HOOK_POLICY_FILE


def load_hook_policy(workspace: str | Path) -> dict[str, Any]:
    path = hook_policy_path(workspace)
    if not path.exists():
        return {"schema_v": 1, "default_action": "allow", "critical_paths": [], "blocked_command_patterns": []}
    return parse_simple_yaml(path.read_text(encoding="utf-8"))


def evaluate_critical_operation(
    workspace: str | Path,
    *,
    command_tokens: list[str] | None = None,
    touched_files: list[str] | None = None,
) -> dict[str, Any]:
    policy = load_hook_policy(workspace)
    violations: list[str] = []
    for raw_path in touched_files or []:
        normalized = str(raw_path).replace("\\", "/")
        for pattern in [str(item).replace("\\", "/") for item in policy.get("critical_paths", [])]:
            if pattern and fnmatch.fnmatch(normalized, pattern):
                violations.append(f"critical path blocked: {normalized}")
                break
    command_text = " ".join(command_tokens or []).lower()
    for pattern in [str(item).lower() for item in policy.get("blocked_command_patterns", [])]:
        if pattern and pattern in command_text:
            violations.append(f"command blocked by hook policy: {pattern}")
    return {"allowed": not violations, "violations": violations, "policy": policy}


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
    touched = []
    for path in files:
        try:
            touched.append(str(path.relative_to(workspace)).replace("\\", "/"))
        except ValueError:
            touched.append(str(path).replace("\\", "/"))
    critical_check = evaluate_critical_operation(workspace, touched_files=touched)
    if not critical_check["allowed"]:
        for violation in critical_check["violations"]:
            results.append({"file": "HOOK_POLICY", "ok": False, "detail": violation})
    status = "PASS" if all(item["ok"] for item in results) else "FAIL"
    append_event(
        workspace,
        event_type="HOOK_RESULT",
        actor={"type": "system", "name": "HOOK"},
        severity="error" if status == "FAIL" else "info",
        payload={"hook": "pre-commit", "status": status, "files": [item["file"] for item in results], "violations": critical_check["violations"]},
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


def blocking_gates_path(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent" / "policies" / BLOCKING_GATES_FILE


def load_blocking_gates(workspace: str | Path) -> dict[str, Any]:
    path = blocking_gates_path(workspace)
    if not path.exists():
        return {"schema_v": 1, "actions": []}
    return parse_simple_yaml(path.read_text(encoding="utf-8"))


def check_action_policy(
    workspace: str | Path,
    *,
    action: str,
    actor: str = "CLI",
    task_id: str | None = None,
    subject_ref: str | None = None,
    consume_on_allow: bool = True,
) -> dict[str, Any]:
    policy = load_blocking_gates(workspace)
    actions = policy.get("actions", [])
    match = None
    for rule in actions:
        if not isinstance(rule, dict):
            continue
        if rule.get("action") == action:
            match = rule
            break
    if not match:
        return {"status": "allow", "action": action}

    subject = subject_ref or task_id or action
    for gate in list_gate_records(workspace):
        if gate.get("action_class") == action and gate.get("subject_ref") == subject and gate.get("status") in {"approved", "resumed"}:
            if consume_on_allow:
                gate = update_gate_record(
                    workspace,
                    gate_id=str(gate.get("gate_id") or ""),
                    status="consumed",
                    decision=gate.get("decision"),
                    actor=actor,
                )
            return {"status": "allow", "action": action, "subject_ref": subject, "gate_id": gate.get("gate_id")}

    question = create_workflow_approval(
        workspace,
        run_id=f"manual-{action}",
        workflow_id="manual.hook",
        step_id=action,
        actor=actor,
        question=str(match.get("prompt") or f"Approve action '{action}' for '{subject}'."),
        action_class=action,
        task_id=task_id,
        correlation_id=subject,
    )
    return {
        "status": "blocked",
        "action": action,
        "subject_ref": subject,
        "question_id": question["question_id"],
        "gate_id": ((question.get("context") or {}).get("gate_id")),
        "reason": match.get("reason") or "approval_required",
    }


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
    check_parser = subparsers.add_parser("check-action")
    check_parser.add_argument("--action", required=True)
    check_parser.add_argument("--actor", default="CLI")
    check_parser.add_argument("--task")
    check_parser.add_argument("--subject-ref")

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
    if args.command == "check-action":
        result = check_action_policy(
            args.workspace,
            action=args.action,
            actor=args.actor,
            task_id=args.task,
            subject_ref=args.subject_ref,
            consume_on_allow=False,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "allow" else 2
    if args.command == "commit-msg":
        print(json.dumps(run_commit_msg(args.workspace, args.message_file), ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
