#!/usr/bin/env python3
"""
Regression-only typecheck baseline gate for brownfield packages.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from context_db import load_config


ERROR_PATTERN = re.compile(r"error TS\d+", re.IGNORECASE)


@dataclass
class CommandResult:
    exit_code: int
    stdout: str
    stderr: str


Runner = Callable[[list[str], Path], CommandResult]


def default_runner(command: list[str], cwd: Path) -> CommandResult:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return CommandResult(completed.returncode, completed.stdout, completed.stderr)


def _normalize_result(result: CommandResult | dict[str, Any] | tuple[Any, ...]) -> CommandResult:
    if isinstance(result, CommandResult):
        return result
    if isinstance(result, tuple):
        exit_code = int(result[0]) if len(result) > 0 else 0
        stdout = str(result[1]) if len(result) > 1 else ""
        stderr = str(result[2]) if len(result) > 2 else ""
        return CommandResult(exit_code, stdout, stderr)
    return CommandResult(
        int(result.get("exit_code", result.get("returncode", 0))),
        str(result.get("stdout", result.get("output", ""))),
        str(result.get("stderr", "")),
    )


def baseline_path(repo_root: str | Path) -> Path:
    root = Path(repo_root)
    config = load_config(root)
    target = root / config["typecheck_baseline_path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def discover_typecheck_targets(repo_root: str | Path) -> list[dict[str, Any]]:
    root = Path(repo_root)
    targets: list[dict[str, Any]] = []
    manifests = [root / "package.json", *sorted((root / "packages").glob("*/package.json"))]
    for manifest in manifests:
        if not manifest.exists():
            continue
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        scripts = payload.get("scripts", {})
        package_name = payload.get("name") or manifest.parent.name
        package_root = manifest.parent.relative_to(root).as_posix() if manifest.parent != root else "."
        for script_name in sorted(key for key in scripts if key.startswith("typecheck")):
            targets.append(
                {
                    "package_name": package_name,
                    "package_root": package_root,
                    "script": script_name,
                    "command": [resolve_pnpm_binary(), "--filter", package_name, script_name],
                }
            )
    return targets


def resolve_pnpm_binary() -> str:
    return "pnpm.cmd" if shutil.which("pnpm.cmd") else "pnpm"


def affected_targets(repo_root: str | Path, changed_files: list[str] | None = None) -> list[dict[str, Any]]:
    targets = discover_typecheck_targets(repo_root)
    if not changed_files:
        return targets
    if changed_files and isinstance(changed_files[0], list):
        if targets:
            wanted = {" ".join(item) for item in changed_files}
            return [target for target in targets if " ".join(target["command"]) in wanted]
        result = []
        for command in changed_files:
            command_text = " ".join(command)
            result.append(
                {
                    "package_name": command[2] if len(command) > 2 else command_text,
                    "package_root": ".",
                    "script": command[-1] if command else command_text,
                    "command": command,
                }
            )
        return result
    changed = [Path(item).as_posix() for item in changed_files]
    result = []
    for target in targets:
        root_prefix = "" if target["package_root"] == "." else f"{target['package_root']}/"
        if any(path == target["package_root"] or path.startswith(root_prefix) for path in changed):
            result.append(target)
    return result


def count_errors(result: CommandResult) -> int:
    merged = f"{result.stdout}\n{result.stderr}"
    count = len(ERROR_PATTERN.findall(merged))
    if count == 0 and result.exit_code != 0:
        return 1
    return count


def load_baseline(repo_root: str | Path) -> dict[str, Any]:
    path = baseline_path(repo_root)
    if not path.exists():
        return {"targets": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def capture_baseline(repo_root: str | Path, changed_files: list[str] | None = None, runner: Runner = default_runner) -> dict[str, Any]:
    root = Path(repo_root)
    targets = affected_targets(root, changed_files)
    if not targets:
        return {"status": "skipped", "reason": "no typecheck target for changed files"}
    data = {"targets": {}}
    for target in targets:
        result = _normalize_result(runner(target["command"], root))
        key = f"{target['package_name']}::{target['script']}"
        data["targets"][key] = {
            "package_name": target["package_name"],
            "script": target["script"],
            "error_count": count_errors(result),
        }
    path = baseline_path(root)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "initialized", "path": str(path), "targets": list(data["targets"].keys())}


def check_against_baseline(repo_root: str | Path, changed_files: list[str] | None = None, runner: Runner = default_runner) -> dict[str, Any]:
    root = Path(repo_root)
    targets = affected_targets(root, changed_files)
    if not targets:
        return {"status": "skipped", "reason": "no typecheck target for changed files"}
    baseline = load_baseline(root)
    if not baseline.get("targets"):
        return capture_baseline(root, changed_files, runner)
    regressions = []
    observed = {}
    results = []
    for target in targets:
        key = f"{target['package_name']}::{target['script']}"
        result = _normalize_result(runner(target["command"], root))
        current = count_errors(result)
        baseline_count = int(baseline["targets"].get(key, {}).get("error_count", current))
        observed[key] = current
        delta = current - baseline_count
        results.append({"target": key, "baseline": baseline_count, "current": current, "delta": delta})
        if current > baseline_count:
            regressions.append({"target": key, "baseline": baseline_count, "current": current})
    return {
        "status": "failed" if regressions else "passed",
        "ok": not regressions,
        "regressions": regressions,
        "observed": observed,
        "results": results,
    }


def discover_typecheck_commands(repo_root: str | Path, changed_files: list[str] | None = None) -> list[str]:
    commands = []
    for target in affected_targets(repo_root, changed_files):
        commands.append(" ".join(target["command"]))
    return commands


def ensure_baseline(
    repo_root: str | Path,
    commands: list[str],
    *,
    runner: Callable[[str, str | Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    if not commands:
        return {"status": "skipped", "reason": "no_typecheck_commands"}
    payload = {"targets": {}}
    for command in commands:
        if runner is None:
            result = _normalize_result(default_runner(command.split(), root))
        else:
            result = _normalize_result(runner(command, root))
        key = command.split("--filter ", 1)[1].split()[0] + "::" + command.split()[-1] if "--filter " in command else command
        payload["targets"][key] = {
            "package_name": key.split("::", 1)[0],
            "script": key.split("::", 1)[1] if "::" in key else command,
            "error_count": count_errors(result),
        }
    path = baseline_path(root)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"initialized": True, "baseline": payload}


def evaluate_baseline(
    repo_root: str | Path,
    commands: list[str],
    *,
    runner: Callable[[str, str | Path], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    root = Path(repo_root)
    if not commands:
        return {"status": "skipped", "reason": "no_typecheck_commands"}
    baseline = load_baseline(root)
    if not baseline.get("targets"):
        return ensure_baseline(root, commands, runner=runner)
    regressions = []
    observed = {}
    results = []
    for command in commands:
        result = _normalize_result(runner(command, root) if runner is not None else default_runner(command.split(), root))
        current = count_errors(result)
        key = command.split("--filter ", 1)[1].split()[0] + "::" + command.split()[-1] if "--filter " in command else command
        baseline_count = int(baseline["targets"].get(key, {}).get("error_count", current))
        observed[key] = current
        delta = current - baseline_count
        results.append({"target": key, "baseline": baseline_count, "current": current, "delta": delta})
        if current > baseline_count:
            regressions.append({"target": key, "baseline": baseline_count, "current": current})
    return {
        "status": "failed" if regressions else "passed",
        "ok": not regressions,
        "regressions": regressions,
        "observed": observed,
        "results": results,
    }


def init_baseline(
    repo_root: str | Path,
    commands: list[list[str]],
    *,
    runner: Callable[[list[str], Path], CommandResult | dict[str, Any] | tuple[Any, ...]] = default_runner,
) -> dict[str, Any]:
    root = Path(repo_root)
    data = {"commands": {}}
    for command in commands:
        result = _normalize_result(runner(command, root))
        key = " ".join(command)
        data["commands"][key] = {"errors": count_errors(result)}
    path = baseline_path(root)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
