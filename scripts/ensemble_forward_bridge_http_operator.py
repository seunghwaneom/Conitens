from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from ensemble_forward_bridge_http_protocol import BridgeRequestError, binding_call, json_response, validate_identifier
from ensemble_room import validate_room_id

TASK_STATUSES = {"backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"}
WORKSPACE_STATUSES = {"active", "archived"}
SIMPLE_ROUTES = {
    "/api/operator/summary": "build_operator_summary_payload",
    "/api/operator/evidence-summary": "build_operator_evidence_summary_payload",
    "/api/operator/doctor-evidence": "build_operator_doctor_evidence_payload",
    "/api/operator/inbox": "build_operator_inbox_payload",
    "/api/operator/agents": "build_operator_agents_payload",
}


def _optional_identifier(query: dict[str, list[str]], name: str) -> str | None:
    value = query.get(name, [None])[0]
    return validate_identifier(value, field_name=name) if value else None


def _task_filters(query: dict[str, list[str]]) -> dict[str, Any]:
    status = query.get("status", [None])[0]
    if status is not None and status not in TASK_STATUSES:
        raise BridgeRequestError(f"Unsupported operator task status: {status}")
    return {
        "status": status,
        "owner_agent_id": _optional_identifier(query, "owner_agent_id"),
        "workspace_ref": _optional_identifier(query, "workspace_ref"),
        "include_archived": str(query.get("include_archived", ["0"])[0]).strip().lower()
        in {"1", "true", "yes", "on"},
    }


def _workspace_filters(query: dict[str, list[str]]) -> dict[str, Any]:
    status = query.get("status", [None])[0]
    if status is not None and status not in WORKSPACE_STATUSES:
        raise BridgeRequestError(f"Unsupported operator workspace status: {status}")
    return {"status": status, "owner_agent_id": _optional_identifier(query, "owner_agent_id")}


def _handle_status_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    names = {
        "/api/operator/status-confidence": ("build_operator_status_confidence_payload", "80"),
        "/api/operator/wake-readiness": ("build_operator_wake_readiness_payload", "40"),
    }
    selected = names.get(path)
    if selected is None:
        return False
    function_name, default_limit = selected
    json_response(
        handler,
        binding_call(
            bindings,
            function_name,
            workspace,
            task_id=_optional_identifier(query, "task_id"),
            run_id=_optional_identifier(query, "run_id"),
            room_id=validate_room_id(query["room_id"][0]) if query.get("room_id") else None,
            limit=int(query.get("limit", [default_limit])[0]),
        ),
    )
    return True


def _handle_collection_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    if path == "/api/operator/runtime-roster":
        probe = str(query.get("probe_versions", ["0"])[0]).strip().lower() not in {"0", "false", "no", "off"}
        payload = binding_call(
            bindings,
            "build_operator_runtime_roster_payload",
            workspace,
            probe_versions=probe,
            runtime_id=query.get("runtime", [None])[0],
            category=query.get("category", [None])[0],
        )
    elif path == "/api/operator/workflow-contracts":
        payload = binding_call(
            bindings,
            "build_operator_workflow_contracts_payload",
            workspace,
            workflow_ref=query.get("workflow", [None])[0],
        )
    elif path == "/api/operator/turn-records":
        payload = binding_call(
            bindings,
            "build_operator_turn_records_payload",
            workspace,
            run_id=_optional_identifier(query, "run_id"),
            room_id=validate_room_id(query["room_id"][0]) if query.get("room_id") else None,
            limit=int(query.get("limit", ["50"])[0]),
        )
    elif path == "/api/operator/tasks":
        payload = binding_call(bindings, "build_operator_tasks_payload", workspace, **_task_filters(query))
    elif path == "/api/operator/workspaces":
        payload = binding_call(bindings, "build_operator_workspaces_payload", workspace, **_workspace_filters(query))
    else:
        return False
    json_response(handler, payload)
    return True


def _handle_detail_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    workspace: Path,
    bindings: Any,
) -> bool:
    task_prefix = "/api/operator/tasks/"
    workspace_prefix = "/api/operator/workspaces/"
    if path.startswith(task_prefix) and path.endswith("/reconcile-preview"):
        task_id = unquote(path.removeprefix(task_prefix).removesuffix("/reconcile-preview"))
        payload = binding_call(
            bindings,
            "build_operator_task_reconcile_preview_payload",
            workspace,
            validate_identifier(task_id, field_name="task_id"),
        )
    elif path.startswith(task_prefix):
        task_id = validate_identifier(unquote(path.removeprefix(task_prefix)), field_name="task_id")
        payload = binding_call(bindings, "build_operator_task_detail_payload", workspace, task_id)
    elif path.startswith(workspace_prefix):
        workspace_id = validate_identifier(unquote(path.removeprefix(workspace_prefix)), field_name="workspace_id")
        payload = binding_call(bindings, "build_operator_workspace_detail_payload", workspace, workspace_id)
    else:
        return False
    json_response(handler, payload)
    return True


def handle_operator_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    simple_binding = SIMPLE_ROUTES.get(path)
    if simple_binding is not None:
        json_response(handler, binding_call(bindings, simple_binding, workspace))
        return True
    if _handle_status_route(handler, path, query, workspace, bindings):
        return True
    if _handle_collection_route(handler, path, query, workspace, bindings):
        return True
    return _handle_detail_route(handler, path, workspace, bindings)
