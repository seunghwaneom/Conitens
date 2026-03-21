#!/usr/bin/env python3
"""
Minimal workflow engine for Conitens markdown frontmatter contracts.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_agents import hire_agent
from ensemble_contracts import collect_unknown_fields, parse_contract_file
from ensemble_events import append_event
from ensemble_gate import create_workflow_approval, get_question, question_is_approved, update_gate_record
from ensemble_handoff import create_handoff, transition_handoff
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir
from ensemble_registry import find_agent_manifest


WORKFLOW_SCHEMA_V = 1
WORKFLOW_ALLOWED_FIELDS = {"schema_v", "name", "slug", "description", "inputs", "steps", "resume_key", "execution_support"}
STEP_ALLOWED_FIELDS = {
    "id",
    "kind",
    "cmd",
    "on_fail",
    "description",
    "agent_id",
    "summary",
    "owner_transfer",
    "worktree_id",
    "workspace_id",
    "lease_paths",
    "room_id",
    "provider_id",
    "task_prompt",
    "persona",
    "skills",
    "workflows",
    "question",
    "choices",
    "default_choice",
    "action_class",
    "event_type",
    "severity",
    "payload",
    "branches",
    "depends_on",
    "files",
    "artifact_type",
}
REQUIRED_WORKFLOW_FIELDS = {"schema_v", "name", "slug", "steps"}
SUPPORTED_STEP_KINDS = {"cli", "agent", "approval", "verify", "emit_event", "parallel", "join"}
SUPPORTED_ON_FAIL = {"stop", "continue"}
TEMPLATE_VAR_PATTERN = re.compile(r"\{\{\s*([^}]+)\s*\}\}")


def get_agent_dir(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent"


def get_agent_rules_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "rules"


def get_agent_workflows_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "workflows"


def require_agent_registration(workspace: str | Path) -> None:
    missing: list[str] = []
    if not get_agent_dir(workspace).is_dir():
        missing.append(".agent/")
    else:
        if not get_agent_rules_dir(workspace).is_dir():
            missing.append(".agent/rules/")
        if not get_agent_workflows_dir(workspace).is_dir():
            missing.append(".agent/workflows/")
    if missing:
        raise RuntimeError(f"Workflow execution blocked; missing registration paths: {', '.join(missing)}")


def get_workflow_runs_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "workflows")


def legacy_workflow_runs_dir(workspace: str | Path) -> Path:
    return candidate_notes_dirs(workspace, "workflows", include_missing=True)[-1]


def resolve_run_record_path(workspace: str | Path, run_id: str) -> Path:
    for directory in candidate_notes_dirs(workspace, "workflows"):
        candidate = directory / f"{run_id}.json"
        if candidate.exists():
            return candidate
    return get_workflow_runs_dir(workspace) / f"{run_id}.json"


def resolve_workflow_path(workspace: str | Path, workflow_ref: str) -> Path:
    ref_path = Path(workflow_ref)
    if ref_path.exists():
        return ref_path

    candidate = get_agent_workflows_dir(workspace) / workflow_ref
    if candidate.exists():
        return candidate
    if candidate.with_suffix(".md").exists():
        return candidate.with_suffix(".md")

    for path in get_agent_workflows_dir(workspace).glob("*.md"):
        document = parse_contract_file(path)
        if document.frontmatter.get("slug") == workflow_ref:
            return path
    raise FileNotFoundError(f"Workflow not found: {workflow_ref}")


def load_workflow(workspace: str | Path, workflow_ref: str) -> tuple[dict[str, Any], list[str], Path]:
    path = resolve_workflow_path(workspace, workflow_ref)
    document = parse_contract_file(path)
    warnings = list(document.warnings)
    warnings.extend(collect_unknown_fields(document.frontmatter, WORKFLOW_ALLOWED_FIELDS, label=path.name))

    workflow = dict(document.frontmatter)
    if not isinstance(workflow.get("steps"), list):
        workflow["steps"] = []
    return workflow, warnings, path


def render_command(template: str, variables: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        value = variables.get(key)
        if value is None:
            return ""
        if isinstance(value, list):
            return ",".join(str(item) for item in value)
        return str(value)

    rendered = TEMPLATE_VAR_PATTERN.sub(replace, template)
    return " ".join(rendered.split())


def render_value(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return render_command(value, variables)
    if isinstance(value, list):
        return [render_value(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: render_value(item, variables) for key, item in value.items()}
    return value


def create_run_id(slug: str) -> str:
    now = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe_slug = re.sub(r"[^a-z0-9-]+", "-", slug.lower()).strip("-") or "workflow"
    return f"run-{now}-{safe_slug}"


def create_correlation_id(run_id: str) -> str:
    return f"{run_id}-corr"


def parallel_feature_enabled(variables: dict[str, Any] | None = None) -> bool:
    env_enabled = os.environ.get("CONITENS_ENABLE_PARALLEL_WORKCELL", "").lower() in {"1", "true", "yes"}
    input_enabled = str((variables or {}).get("parallel_feature_flag", "")).lower() in {"1", "true", "yes", "enabled", "on"}
    return env_enabled or input_enabled


def extract_template_vars(text: str) -> list[str]:
    return sorted({match.group(1).strip() for match in TEMPLATE_VAR_PATTERN.finditer(text or "")})


def extract_template_vars_from_value(value: Any) -> list[str]:
    found: set[str] = set()
    if isinstance(value, str):
        found.update(extract_template_vars(value))
    elif isinstance(value, list):
        for item in value:
            found.update(extract_template_vars_from_value(item))
    elif isinstance(value, dict):
        for item in value.values():
            found.update(extract_template_vars_from_value(item))
    return sorted(found)


def _required_fields_for_step(step_kind: str | None, step: dict[str, Any]) -> set[str]:
    required = {"id", "kind", "on_fail"}
    if step_kind == "cli":
        required.add("cmd")
    elif step_kind == "agent":
        required.add("agent_id")
    elif step_kind == "emit_event":
        required.add("event_type")
    elif step_kind == "parallel":
        required.add("branches")
    elif step_kind == "join":
        required.add("depends_on")
    elif step_kind == "verify" and step.get("cmd") in (None, "") and step.get("files") in (None, "", []):
        required.add("files")
    return required


def _validate_parallel_branches(
    workflow_path: Path,
    step_id: str,
    step: dict[str, Any],
    inputs_spec: dict[str, Any],
    supplied: dict[str, Any],
) -> tuple[list[str], list[str], list[dict[str, Any]]]:
    warnings: list[str] = []
    errors: list[str] = []
    previews: list[dict[str, Any]] = []
    branches = step.get("branches", [])
    if not isinstance(branches, list) or not branches:
        errors.append(f"{workflow_path.name}::{step_id}: 'branches' must be a non-empty list.")
        return warnings, errors, previews

    for index, branch in enumerate(branches, start=1):
        if not isinstance(branch, dict):
            errors.append(f"{workflow_path.name}::{step_id}: branch #{index} must be an object.")
            continue
        branch_id = branch.get("id") or f"branch-{index}"
        if branch.get("cmd") in (None, ""):
            errors.append(f"{workflow_path.name}::{step_id}: branch '{branch_id}' missing required field 'cmd'.")
        template_vars = extract_template_vars_from_value(branch)
        undefined_vars = [name for name in template_vars if name not in inputs_spec]
        if undefined_vars:
            errors.append(
                f"{workflow_path.name}::{step_id}:{branch_id}: template variable(s) not defined in inputs: "
                f"{', '.join(undefined_vars)}."
            )
        for name in template_vars:
            if name not in inputs_spec:
                continue
            if supplied.get(name) not in (None, ""):
                continue
            if bool(inputs_spec.get(name, {}).get("required", False)):
                errors.append(f"{workflow_path.name}::{step_id}:{branch_id}: missing required input value '{name}'.")
            else:
                warnings.append(
                    f"{workflow_path.name}::{step_id}:{branch_id}: optional input '{name}' omitted and will render empty."
                )
        previews.append(render_value(branch, supplied))
    return warnings, errors, previews


def validate_workflow(
    workflow: dict[str, Any],
    workflow_path: Path,
    provided_inputs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []
    warnings.extend(collect_unknown_fields(workflow, WORKFLOW_ALLOWED_FIELDS, label=workflow_path.name))

    for field in REQUIRED_WORKFLOW_FIELDS:
        if field not in workflow or workflow.get(field) in (None, "", []):
            errors.append(f"{workflow_path.name}: missing required workflow field '{field}'.")

    steps = workflow.get("steps", [])
    if not isinstance(steps, list):
        errors.append(f"{workflow_path.name}: 'steps' must be a list.")
        steps = []
    elif not steps:
        errors.append(f"{workflow_path.name}: workflow must define at least one step.")

    inputs_spec = workflow.get("inputs", {})
    if inputs_spec in (None, ""):
        inputs_spec = {}
    if not isinstance(inputs_spec, dict):
        errors.append(f"{workflow_path.name}: 'inputs' must be an object when provided.")
        inputs_spec = {}

    step_previews: list[dict[str, Any]] = []
    supplied = provided_inputs or {}

    for index, step in enumerate(steps, start=1):
        step_label = f"{workflow_path.name} step {index}"
        if not isinstance(step, dict):
            errors.append(f"{step_label}: step must be an object.")
            continue

        warnings.extend(collect_unknown_fields(step, STEP_ALLOWED_FIELDS, label=step_label))
        step_id = step.get("id") or f"step-{index}"
        step_kind = step.get("kind")
        on_fail = step.get("on_fail")
        required_fields = _required_fields_for_step(step_kind, step)
        missing_step_fields = [field for field in sorted(required_fields) if step.get(field) in (None, "", [])]
        if missing_step_fields:
            errors.append(f"{step_label}: missing required step field(s): {', '.join(missing_step_fields)}.")

        if step_kind and step_kind not in SUPPORTED_STEP_KINDS:
            errors.append(
                f"{workflow_path.name}::{step_id}: unsupported kind '{step_kind}'. "
                f"Supported kinds: {', '.join(sorted(SUPPORTED_STEP_KINDS))}."
            )
        if on_fail and on_fail not in SUPPORTED_ON_FAIL:
            errors.append(
                f"{workflow_path.name}::{step_id}: unsupported on_fail '{on_fail}'. "
                f"Supported values: {', '.join(sorted(SUPPORTED_ON_FAIL))}."
            )

        template_vars = extract_template_vars_from_value(
            {
                "cmd": step.get("cmd"),
                "summary": step.get("summary"),
                "question": step.get("question"),
                "event_type": step.get("event_type"),
                "payload": step.get("payload"),
                "files": step.get("files"),
                "workspace_id": step.get("workspace_id"),
                "room_id": step.get("room_id"),
                "provider_id": step.get("provider_id"),
                "task_prompt": step.get("task_prompt"),
                "persona": step.get("persona"),
                "skills": step.get("skills"),
                "workflows": step.get("workflows"),
                "depends_on": step.get("depends_on"),
            }
        )
        undefined_vars = [name for name in template_vars if name not in inputs_spec]
        if undefined_vars:
            errors.append(
                f"{workflow_path.name}::{step_id}: template variable(s) not defined in inputs: "
                f"{', '.join(undefined_vars)}."
            )

        for name in template_vars:
            if name not in inputs_spec:
                continue
            value = supplied.get(name)
            if value not in (None, ""):
                continue
            if bool(inputs_spec.get(name, {}).get("required", False)):
                errors.append(f"{workflow_path.name}::{step_id}: missing required input value '{name}'.")
            else:
                warnings.append(
                    f"{workflow_path.name}::{step_id}: optional input '{name}' omitted and will render empty."
                )

        preview = {
            "index": index - 1,
            "id": step_id,
            "kind": step_kind,
            "on_fail": on_fail,
            "template_vars": template_vars,
        }
        if step.get("cmd"):
            preview["rendered_cmd"] = render_command(step.get("cmd", ""), supplied)
        if step.get("summary"):
            preview["rendered_summary"] = render_value(step.get("summary"), supplied)
        if step.get("question"):
            preview["rendered_question"] = render_value(step.get("question"), supplied)
        if step.get("payload") not in (None, {}):
            preview["rendered_payload"] = render_value(step.get("payload"), supplied)
        if step.get("files") not in (None, "", []):
            preview["rendered_files"] = render_value(step.get("files"), supplied)
        if step.get("workspace_id") not in (None, "", []):
            preview["rendered_workspace_id"] = render_value(step.get("workspace_id"), supplied)
        if step.get("room_id") not in (None, "", []):
            preview["rendered_room_id"] = render_value(step.get("room_id"), supplied)
        if step.get("provider_id") not in (None, "", []):
            preview["rendered_provider_id"] = render_value(step.get("provider_id"), supplied)
        if step.get("task_prompt") not in (None, "", []):
            preview["rendered_task_prompt"] = render_value(step.get("task_prompt"), supplied)
        if step.get("persona") not in (None, "", []):
            preview["rendered_persona"] = render_value(step.get("persona"), supplied)
        if step.get("skills") not in (None, "", []):
            preview["rendered_skills"] = render_value(step.get("skills"), supplied)
        if step.get("workflows") not in (None, "", []):
            preview["rendered_workflows"] = render_value(step.get("workflows"), supplied)
        if step.get("depends_on") not in (None, "", []):
            preview["rendered_depends_on"] = render_value(step.get("depends_on"), supplied)
        if step_kind == "parallel":
            branch_warnings, branch_errors, rendered_branches = _validate_parallel_branches(
                workflow_path, step_id, step, inputs_spec, supplied
            )
            warnings.extend(branch_warnings)
            errors.extend(branch_errors)
            preview["rendered_branches"] = rendered_branches
        step_previews.append(preview)

    return {
        "warnings": warnings,
        "errors": errors,
        "inputs": inputs_spec,
        "steps": step_previews,
    }


def explain_workflow(
    workspace: str | Path,
    workflow_ref: str,
    inputs: dict[str, Any] | None = None,
    *,
    actor: str = "CLI",
) -> dict[str, Any]:
    require_agent_registration(workspace)
    workflow, load_warnings, workflow_path = load_workflow(workspace, workflow_ref)
    validation = validate_workflow(workflow, workflow_path, inputs)
    warnings = load_warnings + validation["warnings"]
    return {
        "workflow_path": str(workflow_path),
        "workflow_id": workflow.get("slug", workflow_path.stem),
        "actor": actor,
        "inputs": inputs or {},
        "warnings": warnings,
        "errors": validation["errors"],
        "steps": validation["steps"],
        "ready": not validation["errors"],
    }


def run_cli_command(workspace: str | Path, rendered_cmd: str) -> subprocess.CompletedProcess[str]:
    stripped = rendered_cmd.strip()
    env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }
    if stripped.startswith("ensemble ") or stripped == "ensemble":
        parts = stripped.split()
        return subprocess.run(
            [sys.executable, str(Path(__file__).with_name("ensemble.py")), "--workspace", str(workspace), *parts[1:]],
            cwd=workspace,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            env=env,
        )
    if stripped.startswith("conitens ") or stripped == "conitens":
        parts = stripped.split()
        return subprocess.run(
            [sys.executable, str(Path(__file__).with_name("ensemble.py")), "--workspace", str(workspace), *parts[1:]],
            cwd=workspace,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            env=env,
        )
    return subprocess.run(
        stripped,
        cwd=workspace,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        shell=True,
        env=env,
    )


def _write_record(record_path: Path, record: dict[str, Any]) -> None:
    record_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    legacy_dir = legacy_workflow_runs_dir(record_path.parents[2])
    legacy_dir.mkdir(parents=True, exist_ok=True)
    legacy_path = legacy_dir / record_path.name
    if legacy_path != record_path:
        legacy_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")


def _append_run_artifact(workspace: str | Path, record: dict[str, Any], actor: str, phase: str) -> None:
    append_artifact_manifest(
        workspace,
        artifact_type="workflow_run",
        path=str(get_workflow_runs_dir(workspace) / f"{record['run_id']}.json"),
        actor=actor,
        run_id=record["run_id"],
        task_id=record.get("task_id"),
        correlation_id=record.get("correlation_id"),
        metadata={"workflow_id": record["workflow_id"], "status": record["status"], "phase": phase},
    )


def _step_result_base(step_preview: dict[str, Any], step: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": step_preview["id"],
        "kind": step_preview.get("kind"),
        "cmd": step_preview.get("rendered_cmd", ""),
        "on_fail": step_preview.get("on_fail"),
        "status": "skipped",
        "description": step.get("description"),
    }


def _find_step_result(record: dict[str, Any], step_id: str) -> dict[str, Any] | None:
    for step in record.get("steps", []):
        if step.get("id") == step_id:
            return step
    return None


def _synthesized_verify_command(step: dict[str, Any], variables: dict[str, Any]) -> str:
    files_value = render_value(step.get("files"), variables)
    if isinstance(files_value, list):
        files = ",".join(str(item) for item in files_value)
    else:
        files = str(files_value or "")
    task_id = str(variables.get("task_id", "") or "").strip()
    parts = ["ensemble", "verify"]
    if task_id:
        parts.extend(["--task", task_id])
    if files:
        parts.extend(["--files", files])
    return " ".join(parts)


def _execute_command_step(
    workspace: str | Path,
    *,
    step_preview: dict[str, Any],
    step: dict[str, Any],
    step_result: dict[str, Any],
    variables: dict[str, Any],
) -> dict[str, Any]:
    rendered_cmd = step_preview.get("rendered_cmd", "")
    if step_preview.get("kind") == "verify" and not rendered_cmd:
        rendered_cmd = _synthesized_verify_command(step, variables)
        step_result["cmd"] = rendered_cmd
    completed = run_cli_command(workspace, rendered_cmd)
    step_result["returncode"] = completed.returncode
    step_result["stdout"] = completed.stdout[-4000:]
    step_result["stderr"] = completed.stderr[-4000:]
    step_result["status"] = "passed" if completed.returncode == 0 else "failed"
    return step_result


def _default_approval_prompt(workflow_id: str, step_id: str) -> str:
    return f"Approve workflow {workflow_id} to continue past step {step_id}."


def _execute_approval_step(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    actor: str,
    step_preview: dict[str, Any],
    step: dict[str, Any],
    step_result: dict[str, Any],
) -> dict[str, Any]:
    question_text = step_preview.get("rendered_question") or _default_approval_prompt(record["workflow_id"], step_preview["id"])
    question_record = create_workflow_approval(
        workspace,
        run_id=record["run_id"],
        workflow_id=record["workflow_id"],
        step_id=step_preview["id"],
        actor=actor,
        question=question_text,
        action_class=str(step.get("action_class") or "workflow.approval"),
        task_id=record.get("task_id"),
        correlation_id=record.get("correlation_id"),
        default_choice=int(step.get("default_choice") or 1),
        choices=step.get("choices") if isinstance(step.get("choices"), list) else None,
    )
    step_result["status"] = "waiting-approval"
    step_result["question_id"] = question_record["question_id"]
    step_result["gate_id"] = ((question_record.get("context") or {}).get("gate_id"))
    step_result["prompt"] = question_text
    return step_result


def _execute_emit_event_step(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    actor: str,
    step_preview: dict[str, Any],
    step: dict[str, Any],
    step_result: dict[str, Any],
) -> dict[str, Any]:
    event_type = render_value(step.get("event_type"), record["inputs"])
    payload = render_value(step.get("payload") or {}, record["inputs"])
    append_event(
        workspace,
        event_type=str(event_type),
        actor={"type": "agent", "name": actor},
        scope={
            "workflow_id": record["workflow_id"],
            "run_id": record["run_id"],
            "task_id": record.get("task_id"),
            "correlation_id": record.get("correlation_id"),
        },
        severity=str(step.get("severity") or "info"),
        payload=payload if isinstance(payload, dict) else {"value": payload},
    )
    step_result["event_type"] = event_type
    step_result["payload"] = payload
    step_result["status"] = "passed"
    return step_result


def _execute_agent_step(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    actor: str,
    step_preview: dict[str, Any],
    step: dict[str, Any],
    step_result: dict[str, Any],
) -> dict[str, Any]:
    def as_list(value: Any) -> list[str]:
        if value in (None, "", []):
            return []
        if isinstance(value, list):
            return [str(item) for item in value if str(item)]
        return [str(value)]

    target_agent = str(step.get("agent_id") or "SUBAGENT")
    agent_manifest = find_agent_manifest(workspace, target_agent)
    manifest_data = agent_manifest.get("data", {}) if agent_manifest else {}
    summary = str(step_preview.get("rendered_summary") or step_preview.get("rendered_cmd") or f"Delegated step {step_preview['id']}")
    files = render_value(step.get("files") or [], record["inputs"])
    files_list = files if isinstance(files, list) else [files] if files else []
    step_result["agent_id"] = target_agent
    step_result["summary"] = summary
    owner_transfer = bool(step.get("owner_transfer", False))
    step_result["owner_transfer"] = owner_transfer
    handoff = None
    if owner_transfer:
        lease_paths = render_value(step.get("lease_paths") or [], record["inputs"])
        lease_list = lease_paths if isinstance(lease_paths, list) else [lease_paths] if lease_paths else []
        handoff = create_handoff(
            workspace,
            from_actor=actor,
            to_actor=target_agent,
            summary=summary,
            run_id=record["run_id"],
            task_id=record.get("task_id"),
            correlation_id=record.get("correlation_id"),
            artifact_type=str(step.get("artifact_type") or "subagent"),
            files=[str(item) for item in files_list],
            owner_transfer=True,
            worktree_id=(str(render_value(step.get("worktree_id"), record["inputs"])) if step.get("worktree_id") else None),
            lease_paths=[str(item) for item in lease_list],
        )
        transition_handoff(
            workspace,
            handoff_id=handoff["handoff_id"],
            state="started",
            actor=target_agent,
            detail=f"Started delegated step {step_preview['id']}",
        )
        step_result["handoff_id"] = handoff["handoff_id"]
    provider_id = str(step_preview.get("rendered_provider_id") or manifest_data.get("provider_id") or "").strip()
    workspace_id = str(step_preview.get("rendered_workspace_id") or manifest_data.get("workspace_id") or "root").strip()
    room_id = str(step_preview.get("rendered_room_id") or manifest_data.get("room_id") or "").strip() or None
    task_prompt = str(step_preview.get("rendered_task_prompt") or summary).strip()
    persona = str(step_preview.get("rendered_persona") or manifest_data.get("persona") or "").strip() or None
    skills = as_list(step_preview.get("rendered_skills") or manifest_data.get("skills") or [])
    workflows = as_list(step_preview.get("rendered_workflows") or manifest_data.get("workflows") or [])
    if provider_id:
        runtime = hire_agent(
            workspace,
            agent_id=target_agent,
            provider_id=provider_id,
            task_prompt=task_prompt,
            actor=actor,
            task_id=record.get("task_id"),
            room_id=room_id,
            workspace_id=workspace_id or "root",
            persona=persona,
            skills=skills,
            workflows=workflows,
            shared_files=[str(item) for item in files_list],
            spawn_process=True,
        )
        step_result["provider_id"] = provider_id
        step_result["workspace_id"] = workspace_id
        step_result["room_id"] = room_id
        step_result["runtime_status"] = runtime.get("status")
        step_result["runtime_pid"] = runtime.get("pid")
        step_result["prompt_file"] = runtime.get("prompt_file")
        if runtime.get("status") == "blocked" and runtime.get("question_id"):
            step_result["status"] = "waiting-approval"
            step_result["question_id"] = runtime.get("question_id")
            step_result["gate_id"] = runtime.get("gate_id")
            step_result["stderr"] = str(runtime.get("reason") or runtime.get("status"))
            if handoff:
                transition_handoff(
                    workspace,
                    handoff_id=handoff["handoff_id"],
                    state="blocked",
                    actor=target_agent,
                    detail=f"Delegated provider '{provider_id}' is waiting for approval",
                    result={"question_id": runtime.get("question_id"), "gate_id": runtime.get("gate_id")},
                )
            return step_result
        if runtime.get("status") in {"running", "planned", "completed"}:
            step_result["status"] = "passed"
            if handoff:
                transition_handoff(
                    workspace,
                    handoff_id=handoff["handoff_id"],
                    state="completed",
                    actor=target_agent,
                    detail=f"Delegated provider '{provider_id}' launched",
                    result={"status": runtime.get("status"), "pid": runtime.get("pid")},
                )
        else:
            step_result["status"] = "failed"
            step_result["stderr"] = str(runtime.get("last_error") or runtime.get("status"))
            if handoff:
                transition_handoff(
                    workspace,
                    handoff_id=handoff["handoff_id"],
                    state="blocked",
                    actor=target_agent,
                    detail=f"Delegated provider '{provider_id}' failed to launch",
                    result={"status": runtime.get("status"), "error": runtime.get("last_error")},
                )
        return step_result
    rendered_cmd = step_preview.get("rendered_cmd", "")
    if rendered_cmd:
        completed = run_cli_command(workspace, rendered_cmd)
        step_result["cmd"] = rendered_cmd
        step_result["returncode"] = completed.returncode
        step_result["stdout"] = completed.stdout[-4000:]
        step_result["stderr"] = completed.stderr[-4000:]
        if completed.returncode == 0:
            step_result["status"] = "passed"
            if handoff:
                transition_handoff(
                    workspace,
                    handoff_id=handoff["handoff_id"],
                    state="completed",
                    actor=target_agent,
                    detail="Delegated step completed",
                    result={"returncode": completed.returncode},
                )
        else:
            step_result["status"] = "failed"
            if handoff:
                transition_handoff(
                    workspace,
                    handoff_id=handoff["handoff_id"],
                    state="blocked",
                    actor=target_agent,
                    detail="Delegated step failed",
                    result={"returncode": completed.returncode, "stderr": completed.stderr[-1000:]},
                )
    else:
        step_result["status"] = "passed"
        if handoff:
            transition_handoff(
                workspace,
                handoff_id=handoff["handoff_id"],
                state="completed",
                actor=target_agent,
                detail="Delegated step recorded without command",
            )
    return step_result


def _execute_parallel_step(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    actor: str,
    step_preview: dict[str, Any],
    step_result: dict[str, Any],
) -> dict[str, Any]:
    if not parallel_feature_enabled(record.get("inputs")):
        step_result["status"] = "reserved"
        step_result["stderr"] = "parallel_workcell is reserved until the feature flag is enabled."
        return step_result
    branches = step_preview.get("rendered_branches", [])
    lease_conflicts: list[dict[str, str]] = []
    claimed_paths: dict[str, str] = {}
    for branch in branches:
        lease_paths = branch.get("lease_paths") or []
        lease_list = lease_paths if isinstance(lease_paths, list) else [lease_paths] if lease_paths else []
        for lease in [str(item) for item in lease_list]:
            owner = claimed_paths.get(lease)
            if owner and owner != branch.get("id"):
                lease_conflicts.append({"path": lease, "first": owner, "second": str(branch.get("id"))})
            else:
                claimed_paths[lease] = str(branch.get("id"))
    if lease_conflicts:
        step_result["status"] = "failed"
        step_result["lease_conflicts"] = lease_conflicts
        step_result["stderr"] = "parallel_workcell lease path conflicts detected."
        return step_result

    branch_results: list[dict[str, Any]] = []
    overall_ok = True
    for branch in branches:
        branch_result = {
            "id": branch.get("id"),
            "cmd": branch.get("cmd", ""),
            "agent_id": branch.get("agent_id"),
            "owner_transfer": bool(branch.get("owner_transfer", False)),
            "lease_paths": branch.get("lease_paths", []),
            "worktree_id": branch.get("worktree_id"),
            "status": "skipped",
        }
        handoff = None
        if branch.get("agent_id") and branch_result["owner_transfer"]:
            lease_paths = branch.get("lease_paths") or []
            lease_list = lease_paths if isinstance(lease_paths, list) else [lease_paths] if lease_paths else []
            handoff = create_handoff(
                workspace,
                from_actor=actor,
                to_actor=str(branch["agent_id"]),
                summary=str(branch.get("summary") or branch.get("cmd") or branch["id"]),
                run_id=record["run_id"],
                task_id=record.get("task_id"),
                correlation_id=record.get("correlation_id"),
                artifact_type="parallel-branch",
                owner_transfer=True,
                worktree_id=str(branch.get("worktree_id")) if branch.get("worktree_id") else None,
                lease_paths=[str(item) for item in lease_list],
            )
            transition_handoff(workspace, handoff_id=handoff["handoff_id"], state="started", actor=str(branch["agent_id"]), detail=f"Branch {branch['id']} started")
            completed = run_cli_command(workspace, branch.get("cmd", ""))
            branch_result["handoff_id"] = handoff["handoff_id"]
            branch_result["returncode"] = completed.returncode
            branch_result["stdout"] = completed.stdout[-2000:]
            branch_result["stderr"] = completed.stderr[-2000:]
            branch_result["status"] = "passed" if completed.returncode == 0 else "failed"
            transition_handoff(
                workspace,
                handoff_id=handoff["handoff_id"],
                state="completed" if completed.returncode == 0 else "blocked",
                actor=str(branch["agent_id"]),
                detail=f"Branch {branch['id']} finished",
                result={"returncode": completed.returncode},
            )
        else:
            completed = run_cli_command(workspace, branch.get("cmd", ""))
            branch_result["returncode"] = completed.returncode
            branch_result["stdout"] = completed.stdout[-2000:]
            branch_result["stderr"] = completed.stderr[-2000:]
            branch_result["status"] = "passed" if completed.returncode == 0 else "failed"
        if branch_result["status"] != "passed":
            overall_ok = False
        branch_results.append(branch_result)

    step_result["branches"] = branch_results
    step_result["status"] = "passed" if overall_ok else "failed"
    return step_result


def _execute_join_step(
    *,
    record: dict[str, Any],
    step_preview: dict[str, Any],
    step_result: dict[str, Any],
) -> dict[str, Any]:
    if not parallel_feature_enabled(record.get("inputs")):
        step_result["status"] = "reserved"
        step_result["stderr"] = "join is reserved until the parallel_workcell feature flag is enabled."
        return step_result
    depends_on = step_preview.get("rendered_depends_on") or []
    if not isinstance(depends_on, list):
        depends_on = [depends_on]
    unresolved: list[str] = []
    failed: list[str] = []
    for dependency in depends_on:
        prior = _find_step_result(record, str(dependency))
        if prior is None:
            unresolved.append(str(dependency))
            continue
        if prior.get("status") != "passed":
            failed.append(str(dependency))
    step_result["depends_on"] = depends_on
    if unresolved or failed:
        step_result["status"] = "failed"
        step_result["unresolved"] = unresolved
        step_result["failed_dependencies"] = failed
    else:
        step_result["status"] = "passed"
    return step_result


def _execute_step(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    actor: str,
    step_preview: dict[str, Any],
    step: dict[str, Any],
) -> dict[str, Any]:
    step_result = _step_result_base(step_preview, step)
    kind = step_preview.get("kind")
    if kind in {"cli", "verify"}:
        return _execute_command_step(workspace, step_preview=step_preview, step=step, step_result=step_result, variables=record["inputs"])
    if kind == "approval":
        return _execute_approval_step(workspace, record=record, actor=actor, step_preview=step_preview, step=step, step_result=step_result)
    if kind == "emit_event":
        return _execute_emit_event_step(workspace, record=record, actor=actor, step_preview=step_preview, step=step, step_result=step_result)
    if kind == "agent":
        return _execute_agent_step(workspace, record=record, actor=actor, step_preview=step_preview, step=step, step_result=step_result)
    if kind == "parallel":
        return _execute_parallel_step(workspace, record=record, actor=actor, step_preview=step_preview, step_result=step_result)
    if kind == "join":
        return _execute_join_step(record=record, step_preview=step_preview, step_result=step_result)
    step_result["status"] = "failed"
    step_result["stderr"] = f"Unsupported step kind at execution time: {kind}"
    return step_result


def _append_step_event(
    workspace: str | Path,
    *,
    event_type: str,
    actor: str,
    record: dict[str, Any],
    step_id: str,
    payload: dict[str, Any],
    severity: str = "info",
) -> None:
    append_event(
        workspace,
        event_type=event_type,
        actor={"type": "agent", "name": actor},
        scope={
            "workflow_id": record["workflow_id"],
            "run_id": record["run_id"],
            "step_id": step_id,
            "task_id": record.get("task_id"),
            "correlation_id": record.get("correlation_id"),
        },
        severity=severity,
        payload=payload,
    )


def _continue_workflow(
    workspace: str | Path,
    *,
    record: dict[str, Any],
    record_path: Path,
    workflow: dict[str, Any],
    explanation: dict[str, Any],
    actor: str,
    start_index: int,
) -> dict[str, Any]:
    overall_status = "PASS"
    steps = workflow.get("steps", [])
    previews = explanation["steps"]

    for index in range(start_index, len(previews)):
        step_preview = previews[index]
        step = steps[index]
        record["current_step_index"] = index
        record["status"] = "running"
        _write_record(record_path, record)

        _append_step_event(
            workspace,
            event_type="WORKFLOW_STEP_STARTED",
            actor=actor,
            record=record,
            step_id=step_preview["id"],
            payload={"kind": step_preview.get("kind"), "cmd": step_preview.get("rendered_cmd")},
        )

        step_result = _execute_step(workspace, record=record, actor=actor, step_preview=step_preview, step=step)
        record["steps"].append(step_result)

        severity = "error" if step_result["status"] in {"failed", "blocked"} else "info"
        _append_step_event(
            workspace,
            event_type="WORKFLOW_STEP_RESULT",
            actor=actor,
            record=record,
            step_id=step_preview["id"],
            payload={
                "status": step_result["status"],
                "returncode": step_result.get("returncode"),
                "question_id": step_result.get("question_id"),
                "handoff_id": step_result.get("handoff_id"),
            },
            severity=severity,
        )

        if step_result["status"] == "waiting-approval":
            record["status"] = "waiting-approval"
            record["waiting_on"] = {
                "kind": "approval",
                "question_id": step_result.get("question_id"),
                "gate_id": step_result.get("gate_id"),
                "step_id": step_preview["id"],
            }
            record["next_step_index"] = index + 1
            _write_record(record_path, record)
            _append_run_artifact(workspace, record, actor, "pause")
            return record

        if step_result["status"] != "passed":
            overall_status = "FAIL"

        record["waiting_on"] = None
        record["next_step_index"] = index + 1
        _write_record(record_path, record)

        if step_result["status"] != "passed" and step.get("on_fail", "stop") != "continue":
            break

    record["finished_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    record["status"] = "passed" if overall_status == "PASS" else "failed"
    record["current_step_index"] = None
    record["next_step_index"] = None
    _write_record(record_path, record)
    _append_run_artifact(workspace, record, actor, "finish")
    append_event(
        workspace,
        event_type="WORKFLOW_RUN_FINISHED",
        actor={"type": "agent", "name": actor},
        scope={
            "workflow_id": record["workflow_id"],
            "run_id": record["run_id"],
            "task_id": record.get("task_id"),
            "correlation_id": record.get("correlation_id"),
        },
        severity="error" if record["status"] != "passed" else "info",
        payload={"status": record["status"], "record_path": str(record_path)},
    )
    return record


def run_workflow(
    workspace: str | Path,
    workflow_ref: str,
    inputs: dict[str, Any] | None = None,
    *,
    actor: str = "CLI",
    dry_run: bool = False,
) -> dict[str, Any]:
    explanation = explain_workflow(workspace, workflow_ref, inputs, actor=actor)
    workflow_path = Path(explanation["workflow_path"])
    run_id = create_run_id(explanation["workflow_id"])
    correlation_id = create_correlation_id(run_id)
    record_path = get_workflow_runs_dir(workspace) / f"{run_id}.json"

    record: dict[str, Any] = {
        "run_id": run_id,
        "correlation_id": correlation_id,
        "workflow_path": explanation["workflow_path"],
        "workflow_id": explanation["workflow_id"],
        "schema_v": WORKFLOW_SCHEMA_V,
        "started_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "finished_at": None,
        "actor": actor,
        "inputs": inputs or {},
        "task_id": (inputs or {}).get("task_id"),
        "warnings": explanation["warnings"],
        "validation_errors": explanation["errors"],
        "steps": [],
        "status": "dry-run" if dry_run else "running",
        "waiting_on": None,
        "current_step_index": 0 if explanation["steps"] else None,
        "next_step_index": 0 if explanation["steps"] else None,
    }
    _write_record(record_path, record)
    _append_run_artifact(workspace, record, actor, "start")

    append_event(
        workspace,
        event_type="WORKFLOW_RUN_STARTED",
        actor={"type": "agent", "name": actor},
        scope={
            "workflow_id": explanation["workflow_id"],
            "run_id": run_id,
            "task_id": record.get("task_id"),
            "correlation_id": correlation_id,
        },
        payload={"workflow_path": str(workflow_path), "warnings": explanation["warnings"]},
    )

    if explanation["errors"]:
        record["status"] = "failed"
        record["finished_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        record["steps"] = explanation["steps"]
        _write_record(record_path, record)
        _append_run_artifact(workspace, record, actor, "validation-failed")
        append_event(
            workspace,
            event_type="WORKFLOW_RUN_FINISHED",
            actor={"type": "agent", "name": actor},
            scope={
                "workflow_id": explanation["workflow_id"],
                "run_id": run_id,
                "task_id": record.get("task_id"),
                "correlation_id": correlation_id,
            },
            severity="error",
            payload={"status": "failed", "record_path": str(record_path), "validation_errors": explanation["errors"]},
        )
        return record

    if dry_run:
        record["status"] = "dry-run"
        record["finished_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        record["steps"] = explanation["steps"]
        _write_record(record_path, record)
        _append_run_artifact(workspace, record, actor, "dry-run")
        append_event(
            workspace,
            event_type="WORKFLOW_RUN_FINISHED",
            actor={"type": "agent", "name": actor},
            scope={
                "workflow_id": explanation["workflow_id"],
                "run_id": run_id,
                "task_id": record.get("task_id"),
                "correlation_id": correlation_id,
            },
            payload={"status": "dry-run", "record_path": str(record_path)},
        )
        return record

    workflow, _, _ = load_workflow(workspace, workflow_ref)
    return _continue_workflow(
        workspace,
        record=record,
        record_path=record_path,
        workflow=workflow,
        explanation=explanation,
        actor=actor,
        start_index=0,
    )


def resume_workflow(workspace: str | Path, run_id: str, *, actor: str = "CLI") -> dict[str, Any]:
    record_path = resolve_run_record_path(workspace, run_id)
    if not record_path.exists():
        raise FileNotFoundError(f"Workflow run not found: {run_id}")

    record = json.loads(record_path.read_text(encoding="utf-8"))
    if record.get("status") != "waiting-approval":
        return {
            **record,
            "message": f"Workflow run {run_id} is not waiting for approval (status: {record.get('status')}).",
        }

    waiting_on = record.get("waiting_on") or {}
    question_id = waiting_on.get("question_id")
    gate_id = waiting_on.get("gate_id")
    if not question_id or not question_is_approved(workspace, question_id):
        question = get_question(workspace, question_id) if question_id else None
        record["message"] = (
            f"Workflow run {run_id} is still waiting for approval: {question_id} "
            f"(status: {(question or {}).get('status', 'missing')})."
        )
        _write_record(record_path, record)
        return record

    approval_step_id = waiting_on.get("step_id")
    prior_step = _find_step_result(record, str(approval_step_id))
    if prior_step:
        prior_step["status"] = "approved"
        prior_step["approved_question_id"] = question_id
        if gate_id:
            prior_step["gate_id"] = gate_id

    if gate_id:
        try:
            update_gate_record(
                workspace,
                gate_id=str(gate_id),
                status="resumed",
                decision="approved",
                evidence_ref=question_id,
                actor=actor,
            )
        except FileNotFoundError:
            pass

    record["waiting_on"] = None
    record["status"] = "running"
    record["resumed_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _write_record(record_path, record)

    workflow, _, workflow_path = load_workflow(workspace, record["workflow_path"])
    explanation = explain_workflow(workspace, str(workflow_path), record.get("inputs"), actor=actor)

    append_event(
        workspace,
        event_type="WORKFLOW_RUN_RESUMED",
        actor={"type": "agent", "name": actor},
        scope={
            "workflow_id": record["workflow_id"],
            "run_id": record["run_id"],
            "task_id": record.get("task_id"),
            "correlation_id": record.get("correlation_id"),
        },
        payload={"approved_question_id": question_id},
    )

    return _continue_workflow(
        workspace,
        record=record,
        record_path=record_path,
        workflow=workflow,
        explanation=explanation,
        actor=actor,
        start_index=int(record.get("next_step_index") or 0),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens workflow engine")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--workflow", required=True)
    run_parser.add_argument("--actor", default="CLI")
    run_parser.add_argument("--set", action="append", default=[], help="Workflow input key=value")
    run_parser.add_argument("--dry-run", action="store_true", help="Validate and render steps without executing.")

    explain_parser = subparsers.add_parser("explain")
    explain_parser.add_argument("--workflow", required=True)
    explain_parser.add_argument("--actor", default="CLI")
    explain_parser.add_argument("--set", action="append", default=[], help="Workflow input key=value")

    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("--run", required=True)

    resume_parser = subparsers.add_parser("resume")
    resume_parser.add_argument("--run", required=True)
    resume_parser.add_argument("--actor", default="CLI")
    return parser


def _parse_kv(values: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in values:
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "run":
        result = run_workflow(args.workspace, args.workflow, _parse_kv(args.set), actor=args.actor, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["status"] == "waiting-approval":
            return 2
        return 0 if result["status"] in {"passed", "dry-run"} else 1

    if args.command == "resume":
        result = resume_workflow(args.workspace, args.run, actor=args.actor)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["status"] == "waiting-approval":
            return 2
        return 0 if result["status"] == "passed" else 1

    if args.command == "explain":
        print(json.dumps(explain_workflow(args.workspace, args.workflow, _parse_kv(args.set), actor=args.actor), ensure_ascii=False, indent=2))
        return 0

    if args.command == "show":
        record_path = resolve_run_record_path(args.workspace, args.run)
        if not record_path.exists():
            parser.error(f"Run not found: {args.run}")
        print(record_path.read_text(encoding="utf-8"))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
