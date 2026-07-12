#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_loop_repository import utc_iso
from ensemble_forward_bridge_query_core import _relative_display_path
from ensemble_forward_bridge_query_shared import (
    QueryValidationError,
    WORKFLOW_CONTRACT_MESSAGE_LIMIT,
    _status_from_counts,
)

def _workflow_contract_inputs(workflow: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    inputs = workflow.get("inputs")
    if not isinstance(inputs, dict):
        return [], {}

    rows: list[dict[str, Any]] = []
    sample_inputs: dict[str, str] = {}
    for raw_name in sorted(str(name) for name in inputs):
        spec = inputs.get(raw_name)
        spec_dict = spec if isinstance(spec, dict) else {}
        required = bool(spec_dict.get("required", False))
        row = {
            "name": raw_name,
            "required": required,
            "type": str(spec_dict.get("type") or "string")[:80],
            "has_default": spec_dict.get("default") not in (None, ""),
        }
        if spec_dict.get("description") not in (None, ""):
            row["description"] = str(spec_dict.get("description"))[:180]
        rows.append(row)
        sample_inputs[raw_name] = f"<{raw_name}>"
    return rows, sample_inputs


def _workflow_contract_step_summary(workflow: dict[str, Any], validation: dict[str, Any]) -> list[dict[str, Any]]:
    raw_steps = workflow.get("steps") if isinstance(workflow.get("steps"), list) else []
    rows: list[dict[str, Any]] = []
    for preview in validation.get("steps", []):
        if not isinstance(preview, dict):
            continue
        index = int(preview.get("index") or 0)
        raw_step = raw_steps[index] if 0 <= index < len(raw_steps) and isinstance(raw_steps[index], dict) else {}
        kind = str(preview.get("kind") or "")
        row: dict[str, Any] = {
            "index": index,
            "id": str(preview.get("id") or f"step-{index + 1}")[:120],
            "kind": kind[:80],
            "on_fail": str(preview.get("on_fail") or "")[:80],
            "template_vars": [str(name)[:80] for name in preview.get("template_vars", [])[:20]],
            "requires_approval": kind == "approval",
            "emits_event": kind == "emit_event",
        }
        if raw_step.get("agent_id") not in (None, ""):
            row["agent_id"] = str(raw_step.get("agent_id"))[:120]
        if raw_step.get("event_type") not in (None, ""):
            row["event_type"] = str(raw_step.get("event_type"))[:120]
        branches = raw_step.get("branches")
        if isinstance(branches, list):
            row["branch_count"] = len(branches)
        depends_on = raw_step.get("depends_on")
        if isinstance(depends_on, list):
            row["depends_on_count"] = len(depends_on)
        elif depends_on not in (None, ""):
            row["depends_on_count"] = 1
        rows.append(row)
    return rows


def _workflow_contract_row(
    workspace_root: Path,
    workflow: dict[str, Any],
    load_warnings: list[str],
    workflow_path: Path,
) -> dict[str, Any]:
    from ensemble_workflow import validate_workflow

    inputs, sample_inputs = _workflow_contract_inputs(workflow)
    validation = validate_workflow(workflow, workflow_path, sample_inputs)
    warnings = (load_warnings + validation.get("warnings", []))[:WORKFLOW_CONTRACT_MESSAGE_LIMIT]
    errors = validation.get("errors", [])[:WORKFLOW_CONTRACT_MESSAGE_LIMIT]
    steps = _workflow_contract_step_summary(workflow, validation)
    step_kinds = sorted({row["kind"] for row in steps if row.get("kind")})
    required_inputs = [row["name"] for row in inputs if row["required"]]
    optional_inputs = [row["name"] for row in inputs if not row["required"]]

    return {
        "id": str(workflow.get("slug") or workflow_path.stem)[:120],
        "slug": str(workflow.get("slug") or workflow_path.stem)[:120],
        "name": str(workflow.get("name") or workflow_path.stem)[:180],
        "description": str(workflow.get("description") or "")[:240],
        "path": _relative_display_path(workflow_path, workspace_root),
        "schema_v": workflow.get("schema_v"),
        "execution_support": str(workflow.get("execution_support") or "unspecified")[:80],
        "ready": not errors,
        "warnings": warnings,
        "errors": errors,
        "input_requirements": inputs,
        "required_inputs": required_inputs,
        "optional_inputs": optional_inputs,
        "step_count": len(steps),
        "step_kinds": step_kinds,
        "steps": steps,
        "requires_approval": any(row["requires_approval"] for row in steps),
        "supports_parallel": any(row.get("kind") in {"parallel", "join"} for row in steps),
        "emits_events": any(row["emits_event"] for row in steps),
    }


def _validate_workflow_contract_ref(workflow_ref: str | None) -> str | None:
    if workflow_ref is None:
        return None
    safe_ref = workflow_ref.strip()
    if not safe_ref:
        return None
    if any(separator in safe_ref for separator in ("/", "\\", ":")) or safe_ref in {".", ".."}:
        raise QueryValidationError("workflow filter must be a workflow slug or file stem")
    return safe_ref


def build_operator_workflow_contracts_payload(
    workspace: str | Path,
    *,
    workflow_ref: str | None = None,
) -> dict[str, Any]:
    from ensemble_workflow import get_agent_workflows_dir, load_workflow

    workspace_root = Path(workspace)
    safe_ref = _validate_workflow_contract_ref(workflow_ref)
    workflows_dir = get_agent_workflows_dir(workspace_root)
    if not workflows_dir.exists():
        return {
            "generated_at": utc_iso(),
            "status": "warning",
            "source": {
                "path": _relative_display_path(workflows_dir, workspace_root),
                "exists": False,
            },
            "contracts": [],
            "counts": {
                "total": 0,
                "ready": 0,
                "with_errors": 0,
                "requiring_approval": 0,
                "supporting_parallel": 0,
                "feature_flagged": 0,
            },
            "router_contract": {
                "read_only": True,
                "execution_performed": False,
                "workflow_runs_created": False,
                "approval_bypassed": False,
                "source": ".agent/workflows",
            },
            "privacy": {
                "raw_workflow_body_exposed": False,
                "rendered_command_values_exposed": False,
                "rendered_payload_values_exposed": False,
                "detail": "Workflow contracts expose metadata, input names, step kinds, and template variable names only.",
            },
        }

    contracts: list[dict[str, Any]] = []
    for workflow_path in sorted(workflows_dir.glob("*.md")):
        try:
            workflow, load_warnings, loaded_path = load_workflow(workspace_root, str(workflow_path))
            contract = _workflow_contract_row(workspace_root, workflow, load_warnings, loaded_path)
        except (OSError, UnicodeError, TypeError, ValueError) as exc:
            contract = {
                "id": workflow_path.stem,
                "slug": workflow_path.stem,
                "name": workflow_path.stem,
                "description": "",
                "path": _relative_display_path(workflow_path, workspace_root),
                "schema_v": None,
                "execution_support": "unknown",
                "ready": False,
                "warnings": [],
                "errors": [str(exc)[:240]],
                "input_requirements": [],
                "required_inputs": [],
                "optional_inputs": [],
                "step_count": 0,
                "step_kinds": [],
                "steps": [],
                "requires_approval": False,
                "supports_parallel": False,
                "emits_events": False,
            }
        if safe_ref and safe_ref not in {contract["id"], contract["slug"], workflow_path.stem, contract["name"]}:
            continue
        contracts.append(contract)

    if safe_ref and not contracts:
        raise FileNotFoundError(f"Workflow contract not found: {safe_ref}")

    with_errors = sum(1 for contract in contracts if contract["errors"])
    requiring_approval = sum(1 for contract in contracts if contract["requires_approval"])
    supporting_parallel = sum(1 for contract in contracts if contract["supports_parallel"])
    feature_flagged = sum(1 for contract in contracts if contract["execution_support"] == "feature-flagged")
    status = _status_from_counts(danger=with_errors, warning=0 if contracts else 1)
    return {
        "generated_at": utc_iso(),
        "status": status,
        "source": {
            "path": _relative_display_path(workflows_dir, workspace_root),
            "exists": True,
            "filter": safe_ref,
        },
        "contracts": contracts,
        "counts": {
            "total": len(contracts),
            "ready": sum(1 for contract in contracts if contract["ready"]),
            "with_errors": with_errors,
            "requiring_approval": requiring_approval,
            "supporting_parallel": supporting_parallel,
            "feature_flagged": feature_flagged,
        },
        "router_contract": {
            "read_only": True,
            "execution_performed": False,
            "workflow_runs_created": False,
            "approval_bypassed": False,
            "source": ".agent/workflows",
        },
        "privacy": {
            "raw_workflow_body_exposed": False,
            "rendered_command_values_exposed": False,
            "rendered_payload_values_exposed": False,
            "detail": "Workflow contracts expose metadata, input names, step kinds, and template variable names only.",
        },
    }


__all__ = ["build_operator_workflow_contracts_payload"]
