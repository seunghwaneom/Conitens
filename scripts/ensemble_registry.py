#!/usr/bin/env python3
"""
Canonical control-plane registry loaders for agents, skills, providers,
workspaces, rooms, and gate policies.
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
    "provider_id",
    "workspace_id",
    "room_id",
    "model_policy",
    "capabilities",
    "tool_scopes",
    "handoff_policy",
    "risk_class",
    "summary",
    "skills",
    "workflows",
    "persona",
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

PROVIDER_ALLOWED_FIELDS = {
    "schema_v",
    "provider_id",
    "runtime",
    "display_name",
    "launch_mode",
    "command",
    "args",
    "supported_platforms",
    "capabilities",
    "notes",
}
PROVIDER_REQUIRED_FIELDS = {"schema_v", "provider_id", "runtime", "launch_mode", "command"}

WORKSPACE_ALLOWED_FIELDS = {
    "schema_v",
    "workspace_id",
    "path",
    "strategy",
    "create_if_missing",
    "branch_prefix",
    "shared_readonly_paths",
    "notes",
}
WORKSPACE_REQUIRED_FIELDS = {"schema_v", "workspace_id", "path", "strategy"}

ROOM_ALLOWED_FIELDS = {
    "schema_v",
    "room_id",
    "name",
    "members",
    "shared_files",
    "summary_mode",
    "notes",
}
ROOM_REQUIRED_FIELDS = {"schema_v", "room_id", "name"}

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


def get_providers_registry_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "providers"


def get_workspaces_registry_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "workspaces"


def get_rooms_registry_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "rooms"


def get_policies_dir(workspace: str | Path) -> Path:
    return get_agent_dir(workspace) / "policies"


def get_gate_policy_file(workspace: str | Path) -> Path:
    return get_policies_dir(workspace) / "gates.yaml"


def get_hook_policy_file(workspace: str | Path) -> Path:
    return get_policies_dir(workspace) / "hooks.yaml"


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


def load_provider_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    rows = []
    for path, data in _load_yaml_documents(get_providers_registry_dir(workspace)):
        rows.append(_validate_manifest(path, data, allowed_fields=PROVIDER_ALLOWED_FIELDS, required_fields=PROVIDER_REQUIRED_FIELDS))
    return rows


def load_workspace_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    rows = []
    for path, data in _load_yaml_documents(get_workspaces_registry_dir(workspace)):
        rows.append(_validate_manifest(path, data, allowed_fields=WORKSPACE_ALLOWED_FIELDS, required_fields=WORKSPACE_REQUIRED_FIELDS))
    return rows


def load_room_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    rows = []
    for path, data in _load_yaml_documents(get_rooms_registry_dir(workspace)):
        rows.append(_validate_manifest(path, data, allowed_fields=ROOM_ALLOWED_FIELDS, required_fields=ROOM_REQUIRED_FIELDS))
    return rows


def find_agent_manifest(workspace: str | Path, agent_id: str) -> dict[str, Any] | None:
    for row in load_agent_manifests(workspace):
        if row.get("data", {}).get("agent_id") == agent_id:
            return row
    return None


def find_provider_manifest(workspace: str | Path, provider_id: str) -> dict[str, Any] | None:
    for row in load_provider_manifests(workspace):
        if row.get("data", {}).get("provider_id") == provider_id:
            return row
    return None


def find_workspace_manifest(workspace: str | Path, workspace_id: str) -> dict[str, Any] | None:
    for row in load_workspace_manifests(workspace):
        if row.get("data", {}).get("workspace_id") == workspace_id:
            return row
    return None


def find_room_manifest(workspace: str | Path, room_id: str) -> dict[str, Any] | None:
    for row in load_room_manifests(workspace):
        if row.get("data", {}).get("room_id") == room_id:
            return row
    return None


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
    providers = load_provider_manifests(workspace)
    workspaces = load_workspace_manifests(workspace)
    rooms = load_room_manifests(workspace)
    gates = load_gate_policy(workspace)
    workflows = load_workflow_registry(workspace)
    return {
        "agents": agents,
        "skills": skills,
        "providers": providers,
        "workspaces": workspaces,
        "rooms": rooms,
        "gate_policy": gates,
        "workflows": workflows,
        "metrics": {
            "agent_count": len(agents),
            "skill_count": len(skills),
            "provider_count": len(providers),
            "workspace_count": len(workspaces),
            "room_count": len(rooms),
            "workflow_count": len(workflows),
            "gate_action_count": len(gates.get("data", {}).get("actions", [])) if isinstance(gates.get("data", {}), dict) else 0,
        },
        "errors": [*gates.get("errors", []), *[error for row in agents + skills + providers + workspaces + rooms + workflows for error in row.get("errors", [])]],
        "warnings": [*gates.get("warnings", []), *[warning for row in agents + skills + providers + workspaces + rooms + workflows for warning in row.get("warnings", [])]],
    }


__all__ = [
    "find_agent_manifest",
    "find_provider_manifest",
    "find_room_manifest",
    "find_workspace_manifest",
    "get_gate_policy_file",
    "get_hook_policy_file",
    "load_agent_manifests",
    "load_gate_policy",
    "load_provider_manifests",
    "load_room_manifests",
    "load_skill_manifests",
    "load_workspace_manifests",
    "load_workflow_registry",
    "registry_summary",
]
