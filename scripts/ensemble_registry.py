#!/usr/bin/env python3
"""
Canonical control-plane registry loaders for agents, skills, and gate policies.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_contracts import collect_unknown_fields, parse_contract_file, parse_simple_yaml


AGENT_ALLOWED_FIELDS = {
    "schema_v",
    "agent_id",
    "role",
    "runtime",
    "model_policy",
    "capabilities",
    "tool_scopes",
    "handoff_policy",
    "risk_class",
    "summary",
}
AGENT_REQUIRED_FIELDS = {"schema_v", "agent_id", "role", "runtime"}

SKILL_ALLOWED_FIELDS = {
    "schema_v",
    "skill_id",
    "family",
    "summary",
    "triggers",
    "inputs",
    "outputs",
    "approval_class",
    "default_workflow",
    "compatible_runtimes",
}
SKILL_REQUIRED_FIELDS = {"schema_v", "skill_id", "family", "summary"}

GATE_ALLOWED_FIELDS = {"schema_v", "default_policy", "actions"}
GATE_ACTION_ALLOWED_FIELDS = {
    "action_class",
    "approval_required",
    "verify_required",
    "owner_scope",
    "remote_allowed",
    "notes",
}


def get_agent_dir(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent"


def get_agents_registry_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "agents"


def get_skills_registry_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "skills"


def get_policies_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "policies"


def get_gate_policy_file(workspace: str | Path) -> Path:
    return get_policies_dir(workspace) / "gates.yaml"


def _load_yaml_documents(directory: Path) -> list[tuple[Path, dict[str, Any]]]:
    rows: list[tuple[Path, dict[str, Any]]] = []
    if not directory.exists():
        return rows
    for path in sorted(directory.glob("*.yaml")) + sorted(directory.glob("*.yml")):
        rows.append((path, parse_simple_yaml(path.read_text(encoding="utf-8"))))
    return rows


def _validate_manifest(
    path: Path,
    data: dict[str, Any],
    *,
    allowed_fields: set[str],
    required_fields: set[str],
) -> dict[str, Any]:
    warnings = collect_unknown_fields(data, allowed_fields, label=path.name)
    errors = [f"{path.name}: missing required field '{field}'." for field in sorted(required_fields) if data.get(field) in (None, "", [])]
    return {"path": str(path), "data": data, "warnings": warnings, "errors": errors}


def load_agent_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    rows = []
    for path, data in _load_yaml_documents(get_agents_registry_dir(workspace)):
        rows.append(_validate_manifest(path, data, allowed_fields=AGENT_ALLOWED_FIELDS, required_fields=AGENT_REQUIRED_FIELDS))
    return rows


def load_skill_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    rows = []
    for path, data in _load_yaml_documents(get_skills_registry_dir(workspace)):
        rows.append(_validate_manifest(path, data, allowed_fields=SKILL_ALLOWED_FIELDS, required_fields=SKILL_REQUIRED_FIELDS))
    return rows


def load_gate_policy(workspace: str | Path) -> dict[str, Any]:
    path = get_gate_policy_file(workspace)
    if not path.exists():
        return {"path": str(path), "data": {}, "warnings": [], "errors": [f"{path.name}: gate policy file not found."]}

    data = parse_simple_yaml(path.read_text(encoding="utf-8"))
    warnings = collect_unknown_fields(data, GATE_ALLOWED_FIELDS, label=path.name)
    errors = []
    if data.get("schema_v") in (None, ""):
        errors.append(f"{path.name}: missing required field 'schema_v'.")
    actions = data.get("actions", [])
    if not isinstance(actions, list) or not actions:
        errors.append(f"{path.name}: 'actions' must be a non-empty list.")
        actions = []
    for index, action in enumerate(actions, start=1):
        if not isinstance(action, dict):
            errors.append(f"{path.name}: action #{index} must be an object.")
            continue
        warnings.extend(collect_unknown_fields(action, GATE_ACTION_ALLOWED_FIELDS, label=f"{path.name} action #{index}"))
        if action.get("action_class") in (None, ""):
            errors.append(f"{path.name}: action #{index} missing required field 'action_class'.")
    return {"path": str(path), "data": data, "warnings": warnings, "errors": errors}


def load_workflow_registry(workspace: str | Path) -> list[dict[str, Any]]:
    workflow_dir = get_agent_dir(workspace) / "workflows"
    rows = []
    if not workflow_dir.exists():
        return rows
    for path in sorted(workflow_dir.glob("*.md")):
        document = parse_contract_file(path)
        rows.append(
            {
                "path": str(path),
                "data": document.frontmatter,
                "warnings": document.warnings,
                "errors": [] if document.frontmatter.get("slug") else [f"{path.name}: missing workflow slug."],
            }
        )
    return rows


def registry_summary(workspace: str | Path) -> dict[str, Any]:
    agents = load_agent_manifests(workspace)
    skills = load_skill_manifests(workspace)
    gates = load_gate_policy(workspace)
    workflows = load_workflow_registry(workspace)
    return {
        "agents": agents,
        "skills": skills,
        "gate_policy": gates,
        "workflows": workflows,
        "metrics": {
            "agent_count": len(agents),
            "skill_count": len(skills),
            "workflow_count": len(workflows),
            "gate_action_count": len(gates.get("data", {}).get("actions", [])) if isinstance(gates.get("data", {}), dict) else 0,
        },
        "errors": [*gates.get("errors", []), *[error for row in agents + skills + workflows for error in row.get("errors", [])]],
        "warnings": [*gates.get("warnings", []), *[warning for row in agents + skills + workflows for warning in row.get("warnings", [])]],
    }


__all__ = [
    "get_gate_policy_file",
    "load_agent_manifests",
    "load_gate_policy",
    "load_skill_manifests",
    "load_workflow_registry",
    "registry_summary",
]
