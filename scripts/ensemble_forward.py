#!/usr/bin/env python3
"""
Forward runtime entry helpers for the additive `.conitens` stack.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from ensemble_forward_public_context import build_public_workspace_context_latest_payload
from ensemble_loop_paths import latest_context_path as runtime_latest_context_path
from ensemble_loop_paths import loop_state_db_path, loop_state_debug_path
from ensemble_loop_repository import LoopStateRepository
from ensemble_state_restore import StateRestoreService


FORWARD_READ_ONLY_ACTIONS = (
    "status",
    "context-latest",
    "doctor-evidence",
    "runtime-roster",
    "turn-records",
    "workflow-contracts",
    "status-confidence",
    "wake-readiness",
    "import-pr-ci-evidence",
)
FORWARD_MUTATING_ACTIONS = ("append-pr-ci-evidence",)
FORWARD_SUPPORTED_ACTIONS = FORWARD_READ_ONLY_ACTIONS + FORWARD_MUTATING_ACTIONS
FORWARD_CLI_ACTIONS = FORWARD_SUPPORTED_ACTIONS + ("serve",)
FORWARD_ENTRY_NOTE = (
    "Forward mode is additive. Default actions are read-only; evidence artifacts and "
    "PR/CI evidence events are written only through explicit commands. The active runtime default remains "
    "scripts/ensemble.py + .notes/ + .agent/."
)
FORWARD_DOCTOR_ARTIFACT_DIR = Path(".omx") / "artifacts" / "forward-doctor-evidence"
PR_CI_EVIDENCE_INPUT_ALLOWED_FIELDS = frozenset(
    {
        "kind",
        "event_type",
        "provider",
        "repository",
        "pr_number",
        "pr_id",
        "title",
        "workflow",
        "job",
        "ci_run_id",
        "check_run_id",
        "check_suite_id",
        "status",
        "conclusion",
        "url",
        "branch",
        "head_branch",
        "base_branch",
        "commit_sha",
        "observed_at",
        "summary",
        "evidence_refs",
        "task_id",
        "run_id",
        "conitens_run_id",
        "iteration_id",
        "agent_id",
    }
)
SECRET_PATTERNS = (
    re.compile(r"bearer\s+[A-Za-z0-9._-]{12,}", re.IGNORECASE),
    re.compile(r"(api[_-]?key|token|secret)\s*[:=]\s*[^\s]+", re.IGNORECASE),
    re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{12,}"),
)
PUBLIC_LOCAL_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\r\n<>\"']+", re.IGNORECASE),
    re.compile(
        r"(?<![A-Za-z0-9:])/(?:home|Users|tmp|var|opt|srv|mnt|private|workspace|workspaces|root)/[^\r\n<>\"']+",
        re.IGNORECASE,
    ),
)
PUBLIC_LOCAL_USERNAME_PATTERNS = (
    re.compile(
        r"\b(?:username|local[_-]?username|local[_-]?user)\s*[:=]\s*[^\s]+",
        re.IGNORECASE,
    ),
    re.compile(r"\blocal/[A-Za-z0-9._-]+\b", re.IGNORECASE),
)
EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
RUNTIME_CLI_CHECKS = (
    {"id": "python", "label": "Python", "candidates": (sys.executable, "python3", "python"), "version_args": ("--version",)},
    {"id": "node", "label": "Node.js", "candidates": ("node",), "version_args": ("--version",)},
    {"id": "pnpm", "label": "pnpm", "candidates": ("pnpm",), "version_args": ("--version",)},
    {"id": "git", "label": "Git", "candidates": ("git",), "version_args": ("--version",)},
    {"id": "codex", "label": "Codex CLI", "candidates": ("codex", "codex.cmd"), "version_args": ("--version",)},
    {"id": "claude", "label": "Claude CLI", "candidates": ("claude", "claude.cmd"), "version_args": ("--version",)},
    {"id": "gemini", "label": "Gemini CLI", "candidates": ("gemini", "gemini.cmd"), "version_args": ("--version",)},
    {"id": "opencode", "label": "OpenCode CLI", "candidates": ("opencode", "opencode.cmd"), "version_args": ("--version",)},
    {"id": "gjc", "label": "Gajae-Code (GJC)", "candidates": ("gjc", "gjc.cmd"), "version_args": ("--version",)},
)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_optional_text(path: Path) -> str | None:
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def _repo_latest_context_path(workspace: str | Path) -> Path:
    return Path(workspace) / ".vibe" / "context" / "LATEST_CONTEXT.md"


def _safe_path_label(path: str | Path, workspace_root: str | Path) -> str:
    resolved_workspace = Path(workspace_root).resolve()
    resolved_path = Path(path).resolve()
    try:
        label = resolved_path.relative_to(resolved_workspace)
    except ValueError:
        return resolved_path.name
    return str(label).replace("\\", "/") or "."


def _sanitize_public_text(value: str | None, workspace_root: str | Path) -> str | None:
    if value is None:
        return None
    sanitized = value
    resolved_workspace = str(Path(workspace_root).resolve())
    workspace_variants = {
        resolved_workspace,
        resolved_workspace.replace("\\", "/"),
        resolved_workspace.replace("/", "\\"),
    }
    for workspace_value in sorted(workspace_variants, key=len, reverse=True):
        if workspace_value:
            sanitized = re.sub(
                re.escape(workspace_value),
                "[WORKSPACE]",
                sanitized,
                flags=re.IGNORECASE,
            )
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    redacted, _rules = _redact_reviewed_metadata(sanitized)
    sanitized = str(redacted)
    for pattern in PUBLIC_LOCAL_PATH_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    for pattern in PUBLIC_LOCAL_USERNAME_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    return sanitized


def _sanitize_forward_status_payload(payload: dict[str, Any], workspace: str | Path) -> dict[str, Any]:
    safe_payload = json.loads(json.dumps(payload, ensure_ascii=False))
    safe_payload["workspace_root"] = "."
    artifacts = safe_payload.get("artifacts")
    if isinstance(artifacts, dict):
        for key, value in list(artifacts.items()):
            if isinstance(value, str):
                artifacts[key] = _safe_path_label(value, workspace)
    return safe_payload


def build_forward_status(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace, read_only=True)
    restore = StateRestoreService(repository)
    latest_snapshot = restore.restore_latest_active_run_from_disk()
    latest_run = latest_snapshot["run"] if latest_snapshot else None
    latest_iteration = latest_snapshot["latest_iteration"] if latest_snapshot else None
    return {
        "mode": "forward",
        "entry_contract": {
            "selector": ["forward", "--forward status"],
            "scope": "read_only_by_default_forward_runtime_entry",
            "supported_actions": list(FORWARD_CLI_ACTIONS),
            "default_runtime": "legacy",
            "note": FORWARD_ENTRY_NOTE,
        },
        "workspace_root": str(Path(workspace).resolve()),
        "artifacts": {
            "loop_state_db": str(loop_state_db_path(workspace, create_parent=False)),
            "loop_state_debug": str(loop_state_debug_path(workspace, create_parent=False)),
            "runtime_latest_context": str(runtime_latest_context_path(workspace, create_parent=False)),
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
    return build_public_workspace_context_latest_payload(workspace)


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


def _first_line(value: str) -> str:
    return value.replace("\r", "\n").split("\n", 1)[0].strip()


def _sanitize_probe_output(value: str) -> str | None:
    output = _first_line(value)[:200]
    if not output:
        return None
    for pattern in SECRET_PATTERNS:
        output = pattern.sub("[REDACTED]", output)
    if "[REDACTED]" in output:
        return "[REDACTED]"
    if "/" in output or "\\" in output or EMAIL_PATTERN.search(output):
        return None
    return output or None


def sanitize_runtime_label(value: str | None) -> str | None:
    if value is None:
        return None
    return _sanitize_probe_output(value)


def _redact_reviewed_metadata(value: Any) -> tuple[Any, list[str]]:
    from ensemble_events import redact_data

    redacted, applied_rules = redact_data(value)
    return redacted, sorted(applied_rules)


def _resolve_exact_path_command(candidate: str) -> str | None:
    if os.path.dirname(candidate):
        return None
    suffixes = [""]
    if os.name == "nt" and not Path(candidate).suffix:
        suffixes.extend(
            suffix.lower()
            for suffix in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(";")
            if suffix
        )
    for path_entry in os.environ.get("PATH", "").split(os.pathsep):
        if not path_entry:
            continue
        for suffix in suffixes:
            exact_path = Path(path_entry) / f"{candidate}{suffix}"
            if exact_path.is_file() and (os.name == "nt" or os.access(exact_path, os.X_OK)):
                return str(exact_path)
    return None


def _resolve_command(candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        if not candidate:
            continue
        candidate_path = Path(candidate)
        if candidate_path.exists():
            return str(candidate_path)
        exact_path = _resolve_exact_path_command(candidate)
        if exact_path:
            return exact_path
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def _run_probe_command(command: list[str]) -> str | None:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return _sanitize_probe_output(result.stdout or result.stderr or "")


def _run_version_probe(executable: str, args: tuple[str, ...]) -> str | None:
    version = _run_probe_command([executable, *args])
    if version is not None:
        return version
    executable_path = Path(executable)
    shell = shutil.which("sh")
    if os.name == "nt" and shell and executable_path.suffix == "" and executable_path.is_file():
        return _run_probe_command([shell, executable, *args])
    return None


def build_runtime_cli_checks(*, probe_versions: bool = True) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    for spec in RUNTIME_CLI_CHECKS:
        executable = _resolve_command(tuple(spec["candidates"]))
        version = _run_version_probe(executable, tuple(spec["version_args"])) if executable and probe_versions else None
        command_name = Path(str(spec["candidates"][0])).name
        checks.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "status": "ok" if executable else "warning",
                "command": command_name,
                "available": executable is not None,
                "executable": Path(executable).name if executable else None,
                "version": version,
                "detail": f"{command_name} is available on PATH" if executable else f"{command_name} was not found on PATH",
            }
        )
    return checks


def _combined_status(statuses: list[str]) -> str:
    if any(status == "danger" for status in statuses):
        return "danger"
    if any(status == "warning" for status in statuses):
        return "warning"
    return "ok"


def build_forward_doctor_evidence_payload(workspace: str | Path) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_doctor_evidence_payload

    workspace_root = Path(workspace)
    doctor = build_operator_doctor_evidence_payload(workspace_root)
    runtime_cli_checks = build_runtime_cli_checks()
    forward_status = _sanitize_forward_status_payload(build_forward_status(workspace_root), workspace_root)
    return {
        "kind": "forward_doctor_evidence",
        "generated_at": _utc_iso(),
        "workspace_root": ".",
        "status": _combined_status([doctor["status"], *[check["status"] for check in runtime_cli_checks]]),
        "doctor": doctor,
        "forward_status": forward_status,
        "runtime_cli_checks": runtime_cli_checks,
        "privacy": {
            "environment_dumped": False,
            "auth_tokens_exposed": False,
            "auth_status_detail": "Provider auth commands are not executed by this evidence flow; run provider-specific auth checks manually when support triage requires it.",
            "path_redaction": "Only executable basenames and short version strings are recorded for runtime CLI checks.",
        },
        "artifact_policy": {
            "default_output": "stdout",
            "write_location": str(FORWARD_DOCTOR_ARTIFACT_DIR),
            "write_artifact_is_mutating": True,
            "notes": "Artifacts are written only when --write-artifact is supplied.",
        },
    }


def render_forward_doctor_evidence_text(payload: dict[str, Any]) -> str:
    doctor = payload["doctor"]
    artifact = payload.get("artifact")
    lines = [
        "Forward Doctor Evidence",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        "",
        "Core checks:",
    ]
    for check in doctor["checks"]:
        lines.append(f"- [{check['status']}] {check['label']}: {check['detail']} ({check['evidence_ref']})")
    lines.extend(["", "Runtime CLI checks:"])
    for check in payload["runtime_cli_checks"]:
        version = f" - {check['version']}" if check.get("version") else ""
        lines.append(f"- [{check['status']}] {check['label']}: {check['detail']}{version}")
    lines.extend(
        [
            "",
            "Privacy:",
            f"- environment_dumped: {payload['privacy']['environment_dumped']}",
            f"- auth_tokens_exposed: {payload['privacy']['auth_tokens_exposed']}",
            f"- auth_status_detail: {payload['privacy']['auth_status_detail']}",
        ]
    )
    if artifact:
        lines.extend(
            [
                "",
                "Artifact:",
                f"- json: {artifact['json_path']}",
                f"- markdown: {artifact['markdown_path']}",
            ]
        )
    return "\n".join(lines)


def build_forward_runtime_roster_payload(
    workspace: str | Path,
    *,
    probe_versions: bool = True,
    runtime_id: str | None = None,
    runtime_category: str | None = None,
) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_runtime_roster_payload

    payload = build_operator_runtime_roster_payload(
        workspace,
        probe_versions=probe_versions,
        runtime_id=runtime_id,
        category=runtime_category,
    )
    return {
        "kind": "forward_runtime_roster",
        "workspace_root": ".",
        "probe_versions": probe_versions,
        **payload,
    }


def render_forward_runtime_roster_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward Runtime Roster",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        f"Version probes: {payload['probe_versions']}",
        f"Scope: runtime={payload['scope']['runtime_id'] or '*'} category={payload['scope']['category'] or '*'}",
        "",
        "Counts:",
        f"- total: {payload['counts']['total']}",
        f"- agent_runtimes: {payload['counts']['agent_runtimes']}",
        f"- toolchains: {payload['counts']['toolchains']}",
        f"- available: {payload['counts']['available']}",
        f"- observed: {payload['counts']['observed']}",
        f"- missing_agent_runtimes: {payload['counts']['missing_agent_runtimes']}",
        "",
        "UX Summary:",
        f"- preferred_agent_runtime: {payload['ux_summary']['preferred_agent_runtime'] or '-'}",
        f"- observed_agent_runtimes: {','.join(payload['ux_summary']['observed_agent_runtimes']) or '-'}",
        f"- available_unobserved_agent_runtimes: {','.join(payload['ux_summary']['available_unobserved_agent_runtimes']) or '-'}",
        f"- missing_agent_runtimes: {','.join(payload['ux_summary']['missing_agent_runtimes']) or '-'}",
        "",
        "Runtimes:",
    ]
    for runtime in payload["runtimes"]:
        version = f" ({runtime['version']})" if runtime.get("version") else ""
        lines.append(
            f"- [{runtime['availability_status']}] {runtime['label']}: "
            f"{runtime['session_status']} via {runtime['command']}{version}"
        )
    lines.append("")
    lines.append("Next Actions:")
    for action in payload["ux_summary"]["next_actions"]:
        lines.append(f"- {action}")
    lines.extend(
        [
            "",
            "Privacy:",
            f"- environment_dumped: {payload['privacy']['environment_dumped']}",
            f"- auth_tokens_exposed: {payload['privacy']['auth_tokens_exposed']}",
            f"- provider_auth_commands_executed: {payload['privacy']['provider_auth_commands_executed']}",
            f"- raw_session_content_exposed: {payload['privacy']['raw_session_content_exposed']}",
            f"- detail: {payload['privacy']['detail']}",
        ]
    )
    return "\n".join(lines)


def build_forward_turn_records_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_turn_records_payload

    payload = build_operator_turn_records_payload(workspace, run_id=run_id, room_id=room_id, limit=limit)
    return {
        "kind": "forward_turn_records",
        "workspace_root": ".",
        **payload,
    }


def render_forward_turn_records_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward Turn Records",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        f"Scope: run={payload['scope']['run_id'] or '*'} room={payload['scope']['room_id'] or '*'} limit={payload['scope']['limit']}",
        "",
        "Counts:",
        f"- returned: {payload['counts']['returned']}",
        f"- total: {payload['counts']['total']}",
        f"- messages: {payload['counts']['messages']}",
        f"- tool_events: {payload['counts']['tool_events']}",
        f"- agent_messages: {payload['counts']['agent_messages']}",
        f"- truncated: {payload['counts']['truncated']}",
        "",
        "Records:",
    ]
    for record in payload["records"]:
        if record["record_type"] == "message":
            lines.append(
                f"- {record['id']} {record['created_at']}: {record['actor']} "
                f"message_type={record['message_type']} content_length={record['content_length']}"
            )
        else:
            lines.append(
                f"- {record['id']} {record['created_at']}: {record['actor']} "
                f"tool={record.get('tool_name', '')}"
            )
    lines.extend(
        [
            "",
            "Privacy:",
            f"- message_content_exposed: {payload['privacy']['message_content_exposed']}",
            f"- tool_payload_values_exposed: {payload['privacy']['tool_payload_values_exposed']}",
            f"- raw_transcript_exposed: {payload['privacy']['raw_transcript_exposed']}",
        ]
    )
    return "\n".join(lines)


def build_forward_workflow_contracts_payload(
    workspace: str | Path,
    *,
    workflow_ref: str | None = None,
) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_workflow_contracts_payload

    payload = build_operator_workflow_contracts_payload(workspace, workflow_ref=workflow_ref)
    return {
        "kind": "forward_workflow_contracts",
        "workspace_root": ".",
        **payload,
    }


def render_forward_workflow_contracts_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward Workflow Contracts",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        f"Source: {payload['source']['path']}",
        "",
        "Counts:",
        f"- total: {payload['counts']['total']}",
        f"- ready: {payload['counts']['ready']}",
        f"- with_errors: {payload['counts']['with_errors']}",
        f"- requiring_approval: {payload['counts']['requiring_approval']}",
        f"- supporting_parallel: {payload['counts']['supporting_parallel']}",
        f"- feature_flagged: {payload['counts']['feature_flagged']}",
        "",
        "Contracts:",
    ]
    for contract in payload["contracts"]:
        status = "ready" if contract.get("ready") else "error"
        required = ",".join(contract.get("required_inputs") or []) or "-"
        kinds = ",".join(contract.get("step_kinds") or []) or "-"
        lines.append(
            f"- [{status}] {contract['slug']}: steps={contract['step_count']} "
            f"kinds={kinds} required_inputs={required} approval={contract['requires_approval']}"
        )
    lines.extend(
        [
            "",
            "Router Contract:",
            f"- read_only: {payload['router_contract']['read_only']}",
            f"- execution_performed: {payload['router_contract']['execution_performed']}",
            f"- workflow_runs_created: {payload['router_contract']['workflow_runs_created']}",
            f"- approval_bypassed: {payload['router_contract']['approval_bypassed']}",
            "",
            "Privacy:",
            f"- raw_workflow_body_exposed: {payload['privacy']['raw_workflow_body_exposed']}",
            f"- rendered_command_values_exposed: {payload['privacy']['rendered_command_values_exposed']}",
            f"- rendered_payload_values_exposed: {payload['privacy']['rendered_payload_values_exposed']}",
        ]
    )
    return "\n".join(lines)


def build_forward_status_confidence_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_status_confidence_payload

    payload = build_operator_status_confidence_payload(
        workspace,
        task_id=task_id,
        run_id=run_id,
        room_id=room_id,
        limit=limit,
    )
    return {
        "kind": "forward_status_confidence",
        "workspace_root": ".",
        **payload,
    }


def render_forward_status_confidence_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward Status Confidence",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        (
            f"Scope: task={payload['scope']['task_id'] or '*'} "
            f"run={payload['scope']['run_id'] or '*'} "
            f"room={payload['scope']['room_id'] or '*'} "
            f"limit={payload['scope']['limit']}"
        ),
        "",
        "Counts:",
        f"- returned: {payload['counts']['returned']}",
        f"- total: {payload['counts']['total']}",
        f"- high: {payload['counts']['high']}",
        f"- partial: {payload['counts']['partial']}",
        f"- stale: {payload['counts']['stale']}",
        f"- blocked: {payload['counts']['blocked']}",
        f"- pending_approval: {payload['counts']['pending_approval']}",
        f"- truncated: {payload['counts']['truncated']}",
        "",
        "Diagnostics:",
    ]
    for row in payload["diagnostics"]:
        reasons = ",".join(row.get("reason_codes") or []) or "-"
        lines.append(
            f"- [{row['confidence_level']}] {row['subject_type']}:{row['subject_id']} "
            f"status={row['status']} reasons={reasons}"
        )
    lines.extend(
        [
            "",
            "Contract:",
            f"- read_only: {payload['diagnostic_contract']['read_only']}",
            f"- mutations_performed: {payload['diagnostic_contract']['mutations_performed']}",
            f"- external_fetch_performed: {payload['diagnostic_contract']['external_fetch_performed']}",
            "",
            "Privacy:",
            f"- message_content_exposed: {payload['privacy']['message_content_exposed']}",
            f"- tool_payload_values_exposed: {payload['privacy']['tool_payload_values_exposed']}",
            f"- raw_transcript_exposed: {payload['privacy']['raw_transcript_exposed']}",
        ]
    )
    return "\n".join(lines)


def build_forward_wake_readiness_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    from ensemble_forward_bridge import build_operator_wake_readiness_payload

    payload = build_operator_wake_readiness_payload(
        workspace,
        task_id=task_id,
        run_id=run_id,
        room_id=room_id,
        limit=limit,
    )
    return {
        "kind": "forward_wake_readiness",
        "workspace_root": ".",
        **payload,
    }


def render_forward_wake_readiness_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward Wake Readiness",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Workspace: {payload['workspace_root']}",
        (
            f"Scope: task={payload['scope']['task_id'] or '*'} "
            f"run={payload['scope']['run_id'] or '*'} "
            f"room={payload['scope']['room_id'] or '*'} "
            f"limit={payload['scope']['limit']}"
        ),
        "",
        "Counts:",
        f"- returned: {payload['counts']['returned']}",
        f"- ready: {payload['counts']['ready']}",
        f"- needs_review: {payload['counts']['needs_review']}",
        f"- attention: {payload['counts']['attention']}",
        f"- hold: {payload['counts']['hold']}",
        f"- wait_for_runtime: {payload['counts']['wait_for_runtime']}",
        f"- needs_context: {payload['counts']['needs_context']}",
        f"- truncated: {payload['counts']['truncated']}",
        "",
        "Candidates:",
    ]
    for row in payload["candidates"]:
        blockers = ",".join(row.get("blockers") or []) or "-"
        runtime = row.get("preferred_agent_runtime") or "-"
        lines.append(
            f"- [{row['readiness']}] {row['subject_type']}:{row['subject_id']} "
            f"confidence={row['confidence_level']} runtime={runtime} blockers={blockers}"
        )
    sources = payload["source_projections"]
    lines.extend(
        [
            "",
            "Source Projections:",
            (
                "- status_confidence: "
                f"{sources['status_confidence']['returned']}/{sources['status_confidence']['total']}"
            ),
            (
                "- turn_records: "
                f"{sources['turn_records']['returned']}/{sources['turn_records']['total']}"
            ),
            f"- runtime_roster preferred: {sources['runtime_roster']['preferred_agent_runtime'] or '-'}",
            "",
            "Contract:",
            f"- read_only: {payload['wake_contract']['read_only']}",
            f"- scheduler_started: {payload['wake_contract']['scheduler_started']}",
            f"- wake_messages_sent: {payload['wake_contract']['wake_messages_sent']}",
            f"- task_status_mutated: {payload['wake_contract']['task_status_mutated']}",
            "",
            "Privacy:",
            f"- message_content_exposed: {payload['privacy']['message_content_exposed']}",
            f"- tool_payload_values_exposed: {payload['privacy']['tool_payload_values_exposed']}",
            f"- raw_transcript_exposed: {payload['privacy']['raw_transcript_exposed']}",
        ]
    )
    return "\n".join(lines)


def _assert_workspace_child(path: Path, workspace_root: Path) -> None:
    resolved_workspace = workspace_root.resolve()
    resolved_path = path.resolve()
    try:
        resolved_path.relative_to(resolved_workspace)
    except ValueError as exc:
        raise ValueError(f"Refusing to write forward doctor evidence outside workspace: {path}") from exc


def write_forward_doctor_evidence_artifact(workspace: str | Path, payload: dict[str, Any]) -> dict[str, Any]:
    from ensemble_artifacts import append_artifact_manifest

    workspace_root = Path(workspace)
    artifact_dir = workspace_root / FORWARD_DOCTOR_ARTIFACT_DIR
    artifact_dir.mkdir(parents=True, exist_ok=True)
    _assert_workspace_child(artifact_dir, workspace_root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = artifact_dir / f"forward-doctor-evidence-{stamp}.json"
    markdown_path = artifact_dir / f"forward-doctor-evidence-{stamp}.md"
    _assert_workspace_child(json_path, workspace_root)
    _assert_workspace_child(markdown_path, workspace_root)
    artifact = {
        "json_path": _safe_path_label(json_path, workspace_root),
        "markdown_path": _safe_path_label(markdown_path, workspace_root),
    }
    payload_with_artifact = {**payload, "artifact": artifact}
    manifest_record = append_artifact_manifest(
        workspace_root,
        artifact_type="forward_doctor_evidence",
        path=artifact["json_path"],
        actor="CLI",
        producer="ensemble forward doctor-evidence",
        metadata={
            "status": payload["status"],
            "markdown_path": artifact["markdown_path"],
            "privacy": payload["privacy"],
        },
    )
    payload_with_manifest = {
        **payload_with_artifact,
        "artifact_manifest": {
            "artifact_id": manifest_record["artifact_id"],
            "path": manifest_record["path"],
            "artifact_type": manifest_record["artifact_type"],
        },
    }
    json_path.write_text(json.dumps(payload_with_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_forward_doctor_evidence_text(payload_with_manifest) + "\n", encoding="utf-8")
    return payload_with_manifest


def _safe_input_label(path: str | Path, workspace: str | Path) -> str:
    return _safe_path_label(path, workspace)


def _read_pr_ci_evidence_input(input_path: str | Path | None) -> list[dict[str, Any]]:
    if not input_path:
        raise ValueError("append-pr-ci-evidence requires --input <json-file>")
    path = Path(input_path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid PR/CI evidence JSON: {exc}") from exc
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict) and "items" in raw:
        items = raw["items"]
    elif isinstance(raw, dict):
        items = [raw]
    else:
        raise ValueError("PR/CI evidence input must be an object, an items object, or a list")
    if not isinstance(items, list) or not items:
        raise ValueError("PR/CI evidence input must include at least one item")
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"PR/CI evidence item {index} must be an object")
    return items


def _required_text(item: dict[str, Any], field: str, *, max_length: int = 180) -> str:
    value = item.get(field)
    if value is None:
        raise ValueError(f"PR/CI evidence item missing required field: {field}")
    text = str(value).strip()
    if not text:
        raise ValueError(f"PR/CI evidence item missing required field: {field}")
    return text[:max_length]


def _optional_text(item: dict[str, Any], field: str, *, max_length: int = 180) -> str | None:
    value = item.get(field)
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def _safe_evidence_url(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    parsed = urlsplit(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("PR/CI evidence url must be an http(s) URL")
    netloc = parsed.hostname or ""
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))


def _evidence_refs(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("PR/CI evidence field evidence_refs must be a list")
    refs: list[str] = []
    for ref in value:
        if isinstance(ref, str) and ref.strip():
            refs.append(ref.strip()[:180])
    return refs[:6]


def _pr_ci_event_type(item: dict[str, Any]) -> str:
    event_type = _optional_text(item, "event_type", max_length=80)
    if event_type in {"pr.evidence_observed", "ci.evidence_observed"}:
        return event_type
    kind = (_optional_text(item, "kind", max_length=40) or "").lower()
    if kind in {"pr", "pull_request", "pull-request"}:
        return "pr.evidence_observed"
    if kind in {"ci", "check", "workflow"}:
        return "ci.evidence_observed"
    raise ValueError("PR/CI evidence item requires kind pull_request|ci or a supported event_type")


def _read_json_object(input_path: str | Path | None, *, action: str) -> Any:
    if not input_path:
        raise ValueError(f"{action} requires --input <json-file>")
    path = Path(input_path)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON input for {action}: {exc}") from exc


def _dict_value(item: dict[str, Any], key: str) -> dict[str, Any] | None:
    value = item.get(key)
    return value if isinstance(value, dict) else None


def _list_value(item: dict[str, Any], key: str) -> list[Any]:
    value = item.get(key)
    return value if isinstance(value, list) else []


def _first_text_from(item: dict[str, Any], *keys: str, max_length: int = 180) -> str | None:
    for key in keys:
        value = item.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text[:max_length]
    return None


def _repository_from_export(item: dict[str, Any], fallback: str | None = None) -> str | None:
    if fallback:
        return fallback[:180]
    direct = _first_text_from(item, "repository", "repo", "full_name", max_length=180)
    if direct:
        return direct
    repository = _dict_value(item, "repository")
    if repository:
        return _first_text_from(repository, "full_name", "nameWithOwner", "name", max_length=180)
    for key in ("head", "base"):
        ref = _dict_value(item, key)
        repo = _dict_value(ref, "repo") if ref else None
        value = _first_text_from(repo, "full_name", "nameWithOwner", "name", max_length=180) if repo else None
        if value:
            return value
    return None


def _extract_export_objects(raw: Any) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if not isinstance(raw, dict):
        raise ValueError("PR/CI export input must be a JSON object or list")

    for key in ("pull_request", "pullRequest", "pr"):
        value = raw.get(key)
        if isinstance(value, dict):
            objects.append(value)
    for key in ("pull_requests", "pullRequests", "prs", "workflow_runs", "workflowRuns", "runs", "check_runs", "checkRuns", "items"):
        for item in _list_value(raw, key):
            if isinstance(item, dict):
                objects.append(item)
    if not objects:
        objects.append(raw)
    return objects


def _looks_like_pr_export(item: dict[str, Any]) -> bool:
    kind = _first_text_from(item, "kind", "event_type", max_length=80)
    if kind in {"pull_request", "pull-request", "pr", "pr.evidence_observed"}:
        return True
    if "pr_number" in item or "pull_request" in item or "pullRequest" in item:
        return True
    return "number" in item and ("head" in item or "base" in item or "merged_at" in item or "html_url" in item)


def _looks_like_ci_export(item: dict[str, Any]) -> bool:
    kind = _first_text_from(item, "kind", "event_type", max_length=80)
    if kind in {"ci", "check", "workflow", "ci.evidence_observed"}:
        return True
    ci_keys = {
        "workflow",
        "workflowName",
        "workflow_name",
        "workflow_runs",
        "check_runs",
        "databaseId",
        "run_number",
        "headBranch",
        "head_sha",
        "headSha",
        "conclusion",
    }
    return bool(ci_keys & set(item))


def _github_pr_export_to_evidence(
    item: dict[str, Any],
    *,
    task_id: str,
    run_id: str | None,
    repository: str | None,
) -> dict[str, Any]:
    head = _dict_value(item, "head") or {}
    number = item.get("pr_number", item.get("number"))
    merged = bool(item.get("merged") or item.get("merged_at") or item.get("mergedAt"))
    status = _first_text_from(item, "status", "state", max_length=80) or ("merged" if merged else "unknown")
    if merged:
        status = "merged"
    evidence_ref = f"github:pr:{number}" if number is not None else "github:pr"
    return {
        "kind": "pull_request",
        "provider": "github",
        "repository": _repository_from_export(item, repository),
        "pr_number": number if isinstance(number, (int, str)) else None,
        "pr_id": _first_text_from(item, "pr_id", "id", "node_id", max_length=120),
        "title": _first_text_from(item, "title", "displayTitle", max_length=180)
        or (f"PR #{number}" if number is not None else "Pull request evidence"),
        "status": status,
        "conclusion": "merged" if merged else _first_text_from(item, "conclusion", max_length=80),
        "url": _safe_evidence_url(item.get("url") or item.get("html_url") or item.get("permalink")),
        "branch": _first_text_from(item, "branch", "headRefName", "head_branch", max_length=120)
        or _first_text_from(head, "ref", "label", max_length=120),
        "base_branch": _first_text_from(item, "baseRefName", "base_branch", max_length=120),
        "commit_sha": _first_text_from(item, "commit_sha", "headRefOid", "headSha", max_length=80)
        or _first_text_from(head, "sha", max_length=80),
        "task_id": task_id,
        "run_id": run_id,
        "observed_at": _first_text_from(item, "updated_at", "updatedAt", "created_at", "createdAt", max_length=80)
        or _utc_iso(),
        "summary": f"Imported GitHub PR metadata for {evidence_ref}.",
        "evidence_refs": [evidence_ref],
    }


def _github_ci_export_to_evidence(
    item: dict[str, Any],
    *,
    task_id: str,
    run_id: str | None,
    repository: str | None,
) -> dict[str, Any]:
    ci_run_id = _first_text_from(
        item,
        "ci_run_id",
        "databaseId",
        "id",
        "run_number",
        "check_run_id",
        "check_suite_id",
        max_length=120,
    )
    evidence_ref = f"github:actions:{ci_run_id}" if ci_run_id else "github:actions"
    workflow = _first_text_from(item, "workflow", "workflowName", "workflow_name", "name", max_length=180)
    title = _first_text_from(item, "display_title", "displayTitle", "title", max_length=180)
    return {
        "kind": "ci",
        "provider": "github-actions",
        "repository": _repository_from_export(item, repository),
        "workflow": workflow or title or "GitHub Actions",
        "job": _first_text_from(item, "job", "job_name", max_length=180),
        "ci_run_id": ci_run_id,
        "status": _first_text_from(item, "status", max_length=80) or "unknown",
        "conclusion": _first_text_from(item, "conclusion", max_length=80),
        "url": _safe_evidence_url(item.get("url") or item.get("html_url")),
        "branch": _first_text_from(item, "branch", "headBranch", "head_branch", max_length=120),
        "commit_sha": _first_text_from(item, "commit_sha", "headSha", "head_sha", max_length=80),
        "task_id": task_id,
        "run_id": run_id,
        "observed_at": _first_text_from(
            item,
            "updated_at",
            "updatedAt",
            "run_started_at",
            "created_at",
            "createdAt",
            max_length=80,
        )
        or _utc_iso(),
        "summary": f"Imported GitHub CI metadata for {evidence_ref}.",
        "evidence_refs": [evidence_ref],
    }


def _import_pr_ci_evidence_items(
    workspace: str | Path,
    *,
    input_path: str | Path | None,
    task_id: str | None,
    run_id: str | None = None,
    repository: str | None = None,
) -> tuple[list[dict[str, Any]], list[str], bool]:
    if not task_id or not str(task_id).strip():
        raise ValueError("import-pr-ci-evidence requires --task-id <operator-task-id>")
    task_id = str(task_id).strip()
    repo = LoopStateRepository(workspace)
    task = repo.get_operator_task(task_id)
    if task is None:
        raise ValueError(f"Operator task not found for PR/CI import: {task_id}")
    linked_run_id = task.get("linked_run_id") if isinstance(task.get("linked_run_id"), str) else None
    explicit_run_id = str(run_id).strip() if run_id else None
    if explicit_run_id and linked_run_id and explicit_run_id != linked_run_id:
        raise ValueError(
            f"PR/CI import run_id {explicit_run_id} does not match task {task_id} linked_run_id {linked_run_id}"
        )
    effective_run_id = explicit_run_id or linked_run_id
    raw = _read_json_object(input_path, action="import-pr-ci-evidence")
    objects = _extract_export_objects(raw)
    items: list[dict[str, Any]] = []
    skipped = 0
    raw_fields_ignored = False
    for source in objects:
        raw_fields_ignored = raw_fields_ignored or bool(
            {"body", "body_text", "comment", "comments", "logs", "log", "diff", "patch", "output", "text"} & set(source)
        )
        if _looks_like_pr_export(source):
            items.append(
                _github_pr_export_to_evidence(
                    source,
                    task_id=task_id,
                    run_id=effective_run_id,
                    repository=repository,
                )
            )
        elif _looks_like_ci_export(source):
            items.append(
                _github_ci_export_to_evidence(
                    source,
                    task_id=task_id,
                    run_id=effective_run_id,
                    repository=repository,
                )
            )
        else:
            skipped += 1
    if not items:
        raise ValueError("No supported PR/CI records found in local export")
    _normalize_pr_ci_evidence_items(workspace, items)
    warnings = []
    if skipped:
        warnings.append(f"skipped {skipped} unsupported export record(s)")
    if raw_fields_ignored:
        warnings.append("ignored raw external-content fields from the source export")
    return items, warnings, raw_fields_ignored


def import_forward_pr_ci_evidence(
    workspace: str | Path,
    *,
    input_path: str | Path | None,
    task_id: str | None,
    run_id: str | None = None,
    repository: str | None = None,
) -> dict[str, Any]:
    workspace_root = Path(workspace)
    items, warnings, raw_fields_ignored = _import_pr_ci_evidence_items(
        workspace_root,
        input_path=input_path,
        task_id=task_id,
        run_id=run_id,
        repository=repository,
    )
    redacted_items, redaction_rules = _redact_reviewed_metadata(items)
    effective_run_id = next(
        (
            item.get("run_id")
            for item in redacted_items
            if isinstance(item, dict) and isinstance(item.get("run_id"), str) and item.get("run_id")
        ),
        run_id,
    )
    return {
        "kind": "forward_pr_ci_evidence_import",
        "generated_at": _utc_iso(),
        "workspace_root": ".",
        "status": "ok" if not warnings else "warning",
        "input": _safe_input_label(input_path or "", workspace_root),
        "task_id": task_id,
        "run_id": effective_run_id,
        "counts": {
            "total": len(redacted_items),
            "pull_requests": sum(1 for item in redacted_items if item["kind"] == "pull_request"),
            "ci_runs": sum(1 for item in redacted_items if item["kind"] == "ci"),
        },
        "items": redacted_items,
        "warnings": warnings,
        "privacy": {
            "external_fetch_performed": False,
            "auth_commands_executed": False,
            "auth_tokens_exposed": False,
            "raw_export_fields_ignored": raw_fields_ignored,
            "raw_external_content_retained": False,
            "url_query_fragments_retained": False,
            "metadata_redaction_applied": bool(redaction_rules),
            "metadata_redaction_rules": redaction_rules,
            "append_performed": False,
        },
    }


def render_forward_pr_ci_import_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward PR/CI Evidence Import",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Input: {payload['input']}",
        f"Prepared: {payload['counts']['total']}",
        "",
        "Prepared items:",
    ]
    for item in payload["items"]:
        label = item.get("title") or item.get("workflow") or item.get("job") or item["kind"]
        lines.append(f"- {item['kind']}: task={item['task_id']} status={item['status']} label={label}")
    if payload["warnings"]:
        lines.extend(["", "Warnings:"])
        lines.extend(f"- {warning}" for warning in payload["warnings"])
    lines.extend(
        [
            "",
            "Privacy:",
            f"- external_fetch_performed: {payload['privacy']['external_fetch_performed']}",
            f"- auth_commands_executed: {payload['privacy']['auth_commands_executed']}",
            f"- append_performed: {payload['privacy']['append_performed']}",
        ]
    )
    return "\n".join(lines)


def _normalize_pr_ci_evidence_items(workspace: str | Path, input_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from ensemble_events import external_evidence_forbidden_payload_fields

    repository = LoopStateRepository(workspace)
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(input_items):
        forbidden = external_evidence_forbidden_payload_fields(item)
        if forbidden:
            raise ValueError(f"PR/CI evidence item {index} forbids raw external content fields: {', '.join(forbidden)}")
        unknown = sorted(str(key) for key in item if str(key) not in PR_CI_EVIDENCE_INPUT_ALLOWED_FIELDS)
        if unknown:
            raise ValueError(f"PR/CI evidence item {index} has unsupported fields: {', '.join(unknown)}")

        event_type = _pr_ci_event_type(item)
        task_id = _required_text(item, "task_id", max_length=120)
        task = repository.get_operator_task(task_id)
        if task is None:
            raise ValueError(f"Operator task not found for PR/CI evidence: {task_id}")
        explicit_run_id = _optional_text(item, "run_id", max_length=120) or _optional_text(
            item, "conitens_run_id", max_length=120
        )
        linked_run_id = task.get("linked_run_id") if isinstance(task.get("linked_run_id"), str) else None
        if explicit_run_id and linked_run_id and explicit_run_id != linked_run_id:
            raise ValueError(
                f"PR/CI evidence run_id {explicit_run_id} does not match task {task_id} linked_run_id {linked_run_id}"
            )
        run_id = explicit_run_id or linked_run_id
        iteration_id = _optional_text(item, "iteration_id", max_length=120) or (
            task.get("linked_iteration_id") if isinstance(task.get("linked_iteration_id"), str) else None
        )
        agent_id = _optional_text(item, "agent_id", max_length=120)

        base_payload = {
            "provider": _required_text(item, "provider", max_length=80),
            "repository": _optional_text(item, "repository", max_length=180),
            "status": _required_text(item, "status", max_length=80),
            "conclusion": _optional_text(item, "conclusion", max_length=80),
            "url": _safe_evidence_url(item.get("url")),
            "branch": _optional_text(item, "branch", max_length=120)
            or _optional_text(item, "head_branch", max_length=120),
            "commit_sha": _optional_text(item, "commit_sha", max_length=80),
            "run_id": run_id,
            "task_id": task_id,
            "observed_at": _optional_text(item, "observed_at", max_length=80) or _utc_iso(),
            "summary": _optional_text(item, "summary", max_length=260),
            "evidence_refs": _evidence_refs(item.get("evidence_refs")),
        }
        if event_type == "pr.evidence_observed":
            pr_number = item.get("pr_number")
            payload = {
                **base_payload,
                "pr_number": pr_number if isinstance(pr_number, (int, str)) else None,
                "pr_id": _optional_text(item, "pr_id", max_length=120),
                "title": _optional_text(item, "title", max_length=180)
                or (f"PR #{pr_number}" if pr_number is not None else "Pull request evidence"),
            }
        else:
            payload = {
                **base_payload,
                "workflow": _optional_text(item, "workflow", max_length=180)
                or _optional_text(item, "title", max_length=180),
                "job": _optional_text(item, "job", max_length=180),
                "ci_run_id": _optional_text(item, "ci_run_id", max_length=120)
                or _optional_text(item, "check_run_id", max_length=120)
                or _optional_text(item, "check_suite_id", max_length=120),
            }

        scope = {"task_id": task_id}
        if run_id:
            scope["run_id"] = run_id
        if iteration_id:
            scope["iteration_id"] = iteration_id
        if agent_id:
            scope["agent_id"] = agent_id
        normalized.append({"event_type": event_type, "payload": payload, "scope": scope})
    return normalized


def append_forward_pr_ci_evidence(
    workspace: str | Path,
    *,
    input_path: str | Path | None,
    reviewer: str | None = None,
) -> dict[str, Any]:
    from ensemble_events import append_event

    workspace_root = Path(workspace)
    input_items = _read_pr_ci_evidence_input(input_path)
    normalized_items = _normalize_pr_ci_evidence_items(workspace_root, input_items)
    actor_name = (reviewer or "CLI").strip()[:120] or "CLI"
    events = []
    redaction_rules: set[str] = set()
    for item in normalized_items:
        event = append_event(
            workspace_root,
            event_type=item["event_type"],
            severity="info",
            actor={"type": "operator", "name": actor_name},
            scope=item["scope"],
            payload=item["payload"],
        )
        event_payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        for rule in event.get("redaction", {}).get("rules", []):
            if isinstance(rule, str):
                redaction_rules.add(rule)
        events.append(
            {
                "event_id": event["event_id"],
                "event_type": event["type"],
                "task_id": event_payload.get("task_id") or item["payload"]["task_id"],
                "run_id": event_payload.get("run_id"),
                "title": event_payload.get("title") or event_payload.get("workflow") or event_payload.get("job"),
                "status": event_payload.get("status") or item["payload"]["status"],
                "conclusion": event_payload.get("conclusion"),
                "evidence_ref": f"event:{event['type']}:{event['event_id']}",
            }
        )
    return {
        "kind": "forward_pr_ci_evidence_append",
        "generated_at": _utc_iso(),
        "workspace_root": ".",
        "status": "ok",
        "input": _safe_input_label(input_path or "", workspace_root),
        "counts": {
            "total": len(events),
            "pull_requests": sum(1 for event in events if event["event_type"] == "pr.evidence_observed"),
            "ci_runs": sum(1 for event in events if event["event_type"] == "ci.evidence_observed"),
        },
        "events": events,
        "privacy": {
            "external_fetch_performed": False,
            "auth_commands_executed": False,
            "auth_tokens_exposed": False,
            "raw_external_content_accepted": False,
            "url_query_fragments_retained": False,
            "metadata_redaction_applied": bool(redaction_rules),
            "metadata_redaction_rules": sorted(redaction_rules),
        },
    }


def render_forward_pr_ci_evidence_text(payload: dict[str, Any]) -> str:
    lines = [
        "Forward PR/CI Evidence Append",
        "",
        f"Status: {payload['status']}",
        f"Generated: {payload['generated_at']}",
        f"Input: {payload['input']}",
        f"Appended: {payload['counts']['total']}",
        "",
        "Events:",
    ]
    for event in payload["events"]:
        conclusion = f" / {event['conclusion']}" if event.get("conclusion") else ""
        lines.append(
            f"- {event['event_type']} {event['event_id']}: task={event['task_id']} status={event['status']}{conclusion}"
        )
    lines.extend(
        [
            "",
            "Privacy:",
            f"- external_fetch_performed: {payload['privacy']['external_fetch_performed']}",
            f"- auth_commands_executed: {payload['privacy']['auth_commands_executed']}",
            f"- raw_external_content_accepted: {payload['privacy']['raw_external_content_accepted']}",
        ]
    )
    return "\n".join(lines)


def _serialize_forward_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=True, indent=2)


def run_forward_action(
    workspace: str | Path,
    *,
    action: str,
    output_format: str = "text",
    write_artifact: bool = False,
    probe_versions: bool = True,
    limit: int | None = None,
    input_path: str | Path | None = None,
    reviewer: str | None = None,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    workflow_ref: str | None = None,
    runtime_id: str | None = None,
    runtime_category: str | None = None,
    repository: str | None = None,
) -> str:
    if action == "status":
        payload = _sanitize_forward_status_payload(
            build_forward_status(workspace),
            workspace,
        )
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_status_text(payload)
    if action == "context-latest":
        payload = build_context_latest_payload(workspace)
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_context_latest_text(payload)
    if action == "doctor-evidence":
        payload = build_forward_doctor_evidence_payload(workspace)
        if write_artifact:
            payload = write_forward_doctor_evidence_artifact(workspace, payload)
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_doctor_evidence_text(payload)
    if action == "runtime-roster":
        payload = build_forward_runtime_roster_payload(
            workspace,
            probe_versions=probe_versions,
            runtime_id=runtime_id,
            runtime_category=runtime_category,
        )
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_runtime_roster_text(payload)
    if action == "turn-records":
        payload = build_forward_turn_records_payload(workspace, run_id=run_id, room_id=room_id, limit=limit)
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_turn_records_text(payload)
    if action == "workflow-contracts":
        payload = build_forward_workflow_contracts_payload(workspace, workflow_ref=workflow_ref)
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_workflow_contracts_text(payload)
    if action == "status-confidence":
        payload = build_forward_status_confidence_payload(
            workspace,
            task_id=task_id,
            run_id=run_id,
            room_id=room_id,
            limit=limit,
        )
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_status_confidence_text(payload)
    if action == "wake-readiness":
        payload = build_forward_wake_readiness_payload(
            workspace,
            task_id=task_id,
            run_id=run_id,
            room_id=room_id,
            limit=limit,
        )
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_wake_readiness_text(payload)
    if action == "import-pr-ci-evidence":
        payload = import_forward_pr_ci_evidence(
            workspace,
            input_path=input_path,
            task_id=task_id,
            run_id=run_id,
            repository=repository,
        )
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_pr_ci_import_text(payload)
    if action == "append-pr-ci-evidence":
        payload = append_forward_pr_ci_evidence(workspace, input_path=input_path, reviewer=reviewer)
        if output_format == "json":
            return _serialize_forward_json(payload)
        return render_forward_pr_ci_evidence_text(payload)
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
    parser.add_argument("--write-artifact", action="store_true", help="Write doctor evidence JSON and Markdown artifacts.")
    parser.add_argument("--no-version-probe", action="store_true", help="Skip runtime version probes for runtime-roster.")
    parser.add_argument("--runtime", dest="runtime_id", help="Optional runtime id for runtime-roster.")
    parser.add_argument(
        "--category",
        dest="runtime_category",
        choices=["agent_runtime", "toolchain"],
        help="Optional runtime category filter for runtime-roster.",
    )
    parser.add_argument(
        "--agent-runtimes-only",
        action="store_true",
        help="Shortcut for --category agent_runtime on runtime-roster.",
    )
    parser.add_argument("--input", dest="input_path", help="Read local PR/CI JSON for import or append actions.")
    parser.add_argument("--task-id", dest="task_id", help="Canonical operator task id for scoped forward actions.")
    parser.add_argument("--run-id", dest="run_id", help="Optional run id for scoped forward actions.")
    parser.add_argument("--room-id", dest="room_id", help="Optional room id for scoped forward projections.")
    parser.add_argument("--workflow", dest="workflow_ref", help="Optional workflow slug or file stem for workflow-contracts.")
    parser.add_argument("--limit", type=int, help="Optional row limit for bounded forward projections.")
    parser.add_argument("--repository", help="Optional repository override for PR/CI evidence import.")
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
    runtime_category = args.runtime_category
    if args.agent_runtimes_only:
        if runtime_category and runtime_category != "agent_runtime":
            parser.error("--agent-runtimes-only cannot be combined with --category toolchain")
        runtime_category = "agent_runtime"
    print(
        run_forward_action(
            args.workspace,
            action=args.action,
            output_format=args.format,
            write_artifact=args.write_artifact,
            probe_versions=not args.no_version_probe,
            limit=args.limit,
            input_path=args.input_path,
            reviewer=args.reviewer,
            task_id=args.task_id,
            run_id=args.run_id,
            room_id=args.room_id,
            workflow_ref=args.workflow_ref,
            runtime_id=args.runtime_id,
            runtime_category=runtime_category,
            repository=args.repository,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
