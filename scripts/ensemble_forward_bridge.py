#!/usr/bin/env python3
"""
Read-only HTTP bridge for the explicit forward `.conitens` runtime surface.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from ensemble_approval import APPROVAL_STATUSES, ApprovalInterruptAdapter
from ensemble_context_markdown import (
    FindingsAppendService,
    LatestContextSkeletonGenerator,
    ProgressAppendOnlyService,
    TaskPlanWriterReader,
)
from ensemble_forward import _read_optional_text, _repo_latest_context_path
from ensemble_loop_paths import findings_path, latest_context_path, progress_path, task_plan_path
from ensemble_loop_repository import (
    LoopStateRepository,
    OPERATOR_WORKSPACE_KINDS,
    OPERATOR_WORKSPACE_STATUSES,
    utc_iso,
)
from ensemble_orchestration import LocalOrchestrationRuntime
from ensemble_replay_service import ReplayService
from ensemble_room import validate_room_id
from ensemble_ui import _host_is_loopback, _request_is_loopback, _validate_api_identifier

MAX_REQUEST_BODY_BYTES = 1_000_000
STALE_RUN_AGE_HOURS = 6
OPERATOR_TASK_STATUSES = {"backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"}
OPERATOR_TASK_PRIORITIES = {"low", "medium", "high", "critical"}
OPERATOR_WORKSPACE_KINDS_SET = set(OPERATOR_WORKSPACE_KINDS)
OPERATOR_WORKSPACE_STATUSES_SET = set(OPERATOR_WORKSPACE_STATUSES)


def _bridge_root_html() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conitens Forward Bridge</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0d1117;
      color: #e6edf3;
      font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 32px;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 12px; color: #9fb0c3; }
    ul { margin: 16px 0 0; padding-left: 20px; }
    code { color: #7ee787; }
  </style>
</head>
<body>
  <h1>Conitens Forward Bridge</h1>
  <p>This bridge is read-only and forward-runtime scoped.</p>
  <p>Use the bearer token returned by the launch command to access <code>/api/*</code>.</p>
  <ul>
    <li><code>GET /api/runs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/replay</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/state-docs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/context-latest</code></li>
    <li><code>GET /api/rooms/&lt;room_id&gt;/timeline</code></li>
  </ul>
</body>
</html>
"""


def _sanitize_reviewer_identity(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    if not text:
        return "forward-bridge"
    return text[:120]


def _resolve_reviewer_identity(explicit_identity: str | None = None) -> str:
    if explicit_identity:
        return _sanitize_reviewer_identity(explicit_identity)
    env_identity = os.environ.get("CONITENS_FORWARD_REVIEWER")
    if env_identity:
        return _sanitize_reviewer_identity(env_identity)
    return _sanitize_reviewer_identity(f"local/{getpass.getuser()}")


def _internal_bridge_error(
    handler: BaseHTTPRequestHandler,
    exc: Exception,
    *,
    message: str = "Internal forward bridge error.",
) -> None:
    handler.log_error("Forward bridge internal error: %s", exc)
    _forward_json_response(handler, {"error": message}, status=500)


def _loopback_origin(handler: BaseHTTPRequestHandler) -> str | None:
    origin = handler.headers.get("Origin")
    if not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.hostname or not _host_is_loopback(parsed.hostname):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _forward_extra_headers(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    origin = _loopback_origin(handler)
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Max-Age": "300",
        "Vary": "Origin",
    }


def _forward_json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in _forward_extra_headers(handler).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _forward_text_response(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    *,
    extra_headers: dict[str, str] | None = None,
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    merged_headers = {**_forward_extra_headers(handler), **(extra_headers or {})}
    for key, value in merged_headers.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _require_bridge_read_access(
    handler: BaseHTTPRequestHandler,
    auth_token: str,
) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _require_bridge_write_access(handler: BaseHTTPRequestHandler, auth_token: str) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge writes are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0") or "0"
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise ValueError("Invalid Content-Length") from exc
    if length > MAX_REQUEST_BODY_BYTES:
        raise OverflowError("Request body too large")
    body = handler.rfile.read(length).decode("utf-8") if length else "{}"
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Malformed JSON body") from exc
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def _relative_display_path(path: Path, workspace_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace_root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path.name)


def _ensure_run_exists(repository: LoopStateRepository, run_id: str) -> dict[str, Any]:
    try:
        return repository.get_run(run_id)
    except ValueError as exc:
        if str(exc).startswith("Unknown run_id:"):
            raise FileNotFoundError(str(exc)) from exc
        raise


def _next_operator_task_id() -> str:
    return f"otask-{secrets.token_hex(8)}"


def _next_operator_workspace_id() -> str:
    return f"owork-{secrets.token_hex(8)}"


def _parse_operator_task_payload(payload: dict[str, Any]) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    objective = str(payload.get("objective") or "").strip()
    status = str(payload.get("status") or "todo").strip()
    priority = str(payload.get("priority") or "medium").strip()
    if status not in OPERATOR_TASK_STATUSES:
        raise ValueError(f"Unsupported operator task status: {status}")
    if priority not in OPERATOR_TASK_PRIORITIES:
        raise ValueError(f"Unsupported operator task priority: {priority}")

    owner_agent_id = payload.get("owner_agent_id")
    safe_owner = (
        _validate_api_identifier(str(owner_agent_id), field_name="owner_agent_id")
        if isinstance(owner_agent_id, str) and owner_agent_id.strip()
        else None
    )
    linked_run_id = payload.get("linked_run_id")
    safe_run = (
        _validate_api_identifier(str(linked_run_id), field_name="linked_run_id")
        if isinstance(linked_run_id, str) and linked_run_id.strip()
        else None
    )
    linked_iteration_id = payload.get("linked_iteration_id")
    safe_iteration = (
        _validate_api_identifier(str(linked_iteration_id), field_name="linked_iteration_id")
        if isinstance(linked_iteration_id, str) and linked_iteration_id.strip()
        else None
    )
    linked_room_ids_value = payload.get("linked_room_ids")
    linked_room_ids = [
        validate_room_id(str(item))
        for item in linked_room_ids_value
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(linked_room_ids_value, list) else []
    acceptance_value = payload.get("acceptance_json")
    acceptance = [str(item) for item in acceptance_value if isinstance(item, str)] if isinstance(acceptance_value, list) else []
    workspace_ref = str(payload.get("workspace_ref") or "").strip() or None

    return {
        "title": title,
        "objective": objective,
        "status": status,
        "priority": priority,
        "owner_agent_id": safe_owner,
        "linked_run_id": safe_run,
        "linked_iteration_id": safe_iteration,
        "linked_room_ids": linked_room_ids,
        "blocked_reason": str(payload.get("blocked_reason") or "").strip() or None,
        "acceptance": acceptance,
        "workspace_ref": workspace_ref,
    }


def _parse_operator_workspace_payload(payload: dict[str, Any]) -> dict[str, Any]:
    label = str(payload.get("label") or "").strip()
    path = str(payload.get("path") or "").strip()
    kind = str(payload.get("kind") or "repo").strip()
    status = str(payload.get("status") or "active").strip()
    if kind not in OPERATOR_WORKSPACE_KINDS_SET:
        raise ValueError(f"Unsupported operator workspace kind: {kind}")
    if status not in OPERATOR_WORKSPACE_STATUSES_SET:
        raise ValueError(f"Unsupported operator workspace status: {status}")
    owner_agent_id = payload.get("owner_agent_id")
    safe_owner = (
        _validate_api_identifier(str(owner_agent_id), field_name="owner_agent_id")
        if isinstance(owner_agent_id, str) and owner_agent_id.strip()
        else None
    )
    linked_run_id = payload.get("linked_run_id")
    safe_run = (
        _validate_api_identifier(str(linked_run_id), field_name="linked_run_id")
        if isinstance(linked_run_id, str) and linked_run_id.strip()
        else None
    )
    linked_iteration_id = payload.get("linked_iteration_id")
    safe_iteration = (
        _validate_api_identifier(str(linked_iteration_id), field_name="linked_iteration_id")
        if isinstance(linked_iteration_id, str) and linked_iteration_id.strip()
        else None
    )
    task_ids_value = payload.get("task_ids_json")
    task_ids = [
        _validate_api_identifier(str(item), field_name="task_id")
        for item in task_ids_value
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(task_ids_value, list) else []
    return {
        "label": label,
        "path": path,
        "kind": kind,
        "status": status,
        "owner_agent_id": safe_owner,
        "linked_run_id": safe_run,
        "linked_iteration_id": safe_iteration,
        "task_ids": task_ids,
        "notes": str(payload.get("notes") or "").strip() or None,
        "archive_note": str(payload.get("archive_note") or "").strip() or None,
    }


def _derive_workspace_task_ids(repository: LoopStateRepository, workspace_id: str) -> list[str]:
    return sorted(
        task["task_id"]
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    )


def _refresh_operator_workspace_membership(repository: LoopStateRepository, workspace_id: str | None) -> None:
    if not isinstance(workspace_id, str) or not workspace_id:
        return
    operator_workspace = repository.get_operator_workspace(workspace_id)
    if operator_workspace is None:
        return
    derived_task_ids = _derive_workspace_task_ids(repository, workspace_id)
    if list(operator_workspace.get("task_ids_json") or []) == derived_task_ids:
        return
    repository.update_operator_workspace(workspace_id=workspace_id, task_ids=derived_task_ids)


def _workspace_linked_tasks(repository: LoopStateRepository, workspace_id: str) -> list[dict[str, Any]]:
    return [
        task
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    ]


def _ensure_operator_task_workspace_reference_allowed(
    repository: LoopStateRepository,
    *,
    current_task: dict[str, Any] | None,
    next_fields: dict[str, Any],
) -> None:
    workspace_ref = next_fields.get("workspace_ref")
    if not isinstance(workspace_ref, str) or not workspace_ref:
        return
    existing_workspace = repository.get_operator_workspace(workspace_ref)
    if existing_workspace is not None:
        if (
            existing_workspace.get("status") == "archived"
            and (current_task is None or workspace_ref != current_task.get("workspace_ref"))
        ):
            raise ValueError(f"Archived operator workspace cannot accept new task links: {workspace_ref}")
        return
    if current_task is not None and workspace_ref == current_task.get("workspace_ref"):
        return
    raise ValueError(f"Operator workspace not found: {workspace_ref}")


def _ensure_operator_workspace_update_allowed(
    repository: LoopStateRepository,
    *,
    current_workspace: dict[str, Any],
    next_fields: dict[str, Any],
) -> None:
    current_status = str(current_workspace.get("status") or "")
    next_status = str(next_fields.get("status") or current_status)
    changed_fields: list[str] = []
    if next_fields["label"] != current_workspace["label"]:
        changed_fields.append("label")
    if next_fields["path"] != current_workspace["path"]:
        changed_fields.append("path")
    if next_fields["kind"] != current_workspace["kind"]:
        changed_fields.append("kind")
    if next_status != current_status:
        changed_fields.append("status")
    if next_fields["owner_agent_id"] != current_workspace["owner_agent_id"]:
        changed_fields.append("owner_agent_id")
    if next_fields["linked_run_id"] != current_workspace["linked_run_id"]:
        changed_fields.append("linked_run_id")
    if next_fields["linked_iteration_id"] != current_workspace["linked_iteration_id"]:
        changed_fields.append("linked_iteration_id")
    if next_fields["notes"] != current_workspace["notes"]:
        changed_fields.append("notes")

    if current_status == "archived":
        if next_status == "archived":
            raise RuntimeError("Archived operator workspaces are read-only until reactivated.")
        non_status_changes = [field for field in changed_fields if field != "status"]
        if non_status_changes:
            raise RuntimeError("Archived operator workspaces are read-only until reactivated.")

    if current_status != "archived" and next_status == "archived":
        if not next_fields.get("archive_note"):
            raise ValueError("Workspace archive rationale is required.")
        active_linked_tasks = [
            task["task_id"]
            for task in _workspace_linked_tasks(repository, str(current_workspace["workspace_id"]))
            if not task.get("archived_at")
        ]
        if active_linked_tasks:
            raise RuntimeError(
                "Workspace archiving requires detaching or archiving linked active tasks: "
                + ", ".join(active_linked_tasks)
            )


def _ensure_operator_task_update_allowed(
    repository: LoopStateRepository,
    *,
    current_task: dict[str, Any],
    next_fields: dict[str, Any],
) -> None:
    if current_task.get("archived_at"):
        raise RuntimeError("Archived operator tasks are read-only until restored.")
    next_run_id = next_fields.get("linked_run_id") or current_task.get("linked_run_id")
    if not isinstance(next_run_id, str) or not next_run_id:
        return
    pending_approvals = repository.list_approval_requests(run_id=next_run_id, status="pending")
    if not pending_approvals:
        return

    changed_fields: list[str] = []
    if next_fields["status"] != current_task["status"]:
        changed_fields.append("status")
    if next_fields["owner_agent_id"] != current_task["owner_agent_id"]:
        changed_fields.append("owner_agent_id")
    if next_fields["linked_run_id"] != current_task["linked_run_id"]:
        changed_fields.append("linked_run_id")
    if next_fields["linked_iteration_id"] != current_task["linked_iteration_id"]:
        changed_fields.append("linked_iteration_id")
    if list(next_fields["linked_room_ids"]) != list(current_task["linked_room_ids_json"]):
        changed_fields.append("linked_room_ids")
    if next_fields["workspace_ref"] != current_task["workspace_ref"]:
        changed_fields.append("workspace_ref")

    if changed_fields:
        raise RuntimeError(
            "Operator task mutation is blocked while the linked run has a pending approval: "
            + ", ".join(changed_fields)
        )


def _operator_task_approval_blockers(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
) -> list[str]:
    blocking_reasons: list[str] = []
    pending_task_approvals = repository.list_approval_requests(task_id=str(task["task_id"]), status="pending")
    if pending_task_approvals:
        blocking_reasons.append("task has pending approval requests")

    linked_run_id = task.get("linked_run_id")
    if isinstance(linked_run_id, str) and linked_run_id:
        pending_run_approvals = repository.list_approval_requests(run_id=linked_run_id, status="pending")
        other_run_approvals = [
            approval
            for approval in pending_run_approvals
            if approval.get("task_id") != task["task_id"]
        ]
        if other_run_approvals:
            blocking_reasons.append(f"linked run {linked_run_id} has pending approvals")
    return blocking_reasons


def _ensure_operator_task_archive_allowed(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
    action_name: str,
) -> None:
    blocking_reasons = _operator_task_approval_blockers(repository, task=task)
    if blocking_reasons:
        raise RuntimeError(
            f"Operator task {action_name} is blocked while approvals are pending: " + "; ".join(blocking_reasons)
        )


def _ensure_operator_task_approval_request_allowed(task: dict[str, Any]) -> None:
    if task.get("archived_at"):
        raise RuntimeError("Archived operator tasks cannot request approval until restored.")


def _parse_archive_note(payload: dict[str, Any]) -> str:
    archive_note = str(payload.get("archive_note") or "").strip()
    if not archive_note:
        raise ValueError("Archive rationale is required.")
    return archive_note


def _ensure_operator_task_delete_allowed(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
) -> None:
    if not task.get("archived_at"):
        raise RuntimeError("Operator task deletion requires archiving the task first.")
    blocking_reasons = _operator_task_approval_blockers(repository, task=task)
    if blocking_reasons:
        raise RuntimeError("Operator task deletion is blocked while approvals are pending: " + "; ".join(blocking_reasons))


def _run_counts(repository: LoopStateRepository, run_id: str) -> dict[str, int]:
    return {
        "iterations": len(repository.list_iterations(run_id)),
        "validator_results": len(repository.list_validator_results(run_id)),
        "approvals": len(repository.list_approval_requests(run_id=run_id)),
        "rooms": len(repository.list_room_records(run_id=run_id)),
        "messages": len(repository.list_room_messages(run_id=run_id)),
        "tool_events": len(repository.list_tool_events(run_id=run_id)),
        "insights": len(repository.list_insights(run_id=run_id)),
        "handoff_packets": len(repository.list_handoff_packets(run_id=run_id)),
    }


def build_runs_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = []
    for run in repository.list_runs():
        iterations = repository.list_iterations(run["run_id"])
        latest_iteration = iterations[-1] if iterations else None
        runs.append(
            {
                **run,
                "latest_iteration_id": latest_iteration["iteration_id"] if latest_iteration else None,
                "latest_iteration_status": latest_iteration["status"] if latest_iteration else None,
                "counts": _run_counts(repository, run["run_id"]),
            }
        )
    return {"runs": runs, "count": len(runs)}


def build_operator_tasks_payload(
    workspace: str | Path,
    *,
    status: str | None = None,
    owner_agent_id: str | None = None,
    workspace_ref: str | None = None,
    include_archived: bool = False,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    tasks = repository.list_operator_tasks(
        status=status,
        owner_agent_id=owner_agent_id,
        workspace_ref=workspace_ref,
        include_archived=include_archived,
    )
    return {"tasks": tasks, "count": len(tasks)}


def build_operator_task_detail_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    return {"task": task}


def build_operator_workspaces_payload(
    workspace: str | Path,
    *,
    status: str | None = None,
    owner_agent_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    workspaces = [
        {
            **row,
            "task_ids_json": _derive_workspace_task_ids(repository, str(row["workspace_id"])),
        }
        for row in repository.list_operator_workspaces(status=status, owner_agent_id=owner_agent_id)
    ]
    return {"workspaces": workspaces, "count": len(workspaces)}


def build_operator_workspace_detail_payload(workspace: str | Path, workspace_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    operator_workspace = repository.get_operator_workspace(workspace_id)
    if operator_workspace is None:
        raise FileNotFoundError(f"Operator workspace not found: {workspace_id}")
    return {
        "workspace": {
            **operator_workspace,
            "task_ids_json": _derive_workspace_task_ids(repository, workspace_id),
        },
    }


def delete_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_delete_allowed(repository, task=task)
    deleted = repository.delete_operator_task(task_id)
    return {"deleted_task_id": str(deleted["task_id"])}


def detach_operator_task_workspace_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    next_fields = {
        "title": task["title"],
        "objective": task["objective"],
        "status": task["status"],
        "priority": task["priority"],
        "owner_agent_id": task["owner_agent_id"],
        "linked_run_id": task["linked_run_id"],
        "linked_iteration_id": task["linked_iteration_id"],
        "linked_room_ids": list(task["linked_room_ids_json"]),
        "blocked_reason": task["blocked_reason"],
        "acceptance": list(task["acceptance_json"]),
        "workspace_ref": None,
    }
    _ensure_operator_task_update_allowed(repository, current_task=task, next_fields=next_fields)
    detached = repository.detach_operator_task_workspace(task_id)
    _refresh_operator_workspace_membership(repository, task.get("workspace_ref"))
    return {"task": detached}


def archive_operator_task_payload(
    workspace: str | Path,
    task_id: str,
    *,
    actor: str,
    archive_note: str,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_archive_allowed(repository, task=task, action_name="archive")
    archived = repository.archive_operator_task(task_id, archived_by=actor, archive_note=archive_note)
    return {"task": archived}


def restore_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_archive_allowed(repository, task=task, action_name="restore")
    restored = repository.restore_operator_task(task_id)
    return {"task": restored}


def build_operator_summary_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = repository.list_runs()
    pending_approvals = repository.list_approval_requests(status="pending")
    rooms = repository.list_room_records()
    handoffs = repository.list_handoff_packets()
    latest_run = repository.get_most_recent_run()

    awaiting_approval_run_ids = {
        row["run_id"]
        for row in pending_approvals
        if isinstance(row.get("run_id"), str) and row.get("run_id")
    }

    failing_runs = 0
    latest_failure_reason: str | None = None
    latest_failure_at: str | None = None
    for run in runs:
        validator_results = repository.list_validator_results(run["run_id"])
        if not validator_results:
            continue
        latest_for_run = validator_results[-1]
        if not latest_for_run["passed"]:
            failing_runs += 1
        for row in validator_results:
            if row["passed"]:
                continue
            created_at = str(row["created_at"])
            if latest_failure_at is None or created_at > latest_failure_at:
                latest_failure_at = created_at
                latest_failure_reason = str(row.get("feedback_text") or "validation failed")

    return {
        "generated_at": utc_iso(),
        "runs": {
            "total": len(runs),
            "active": sum(1 for row in runs if str(row.get("status")) in {"active", "running"}),
            "awaiting_approval": len(awaiting_approval_run_ids),
            "with_failures": failing_runs,
            "latest_run_id": latest_run["run_id"] if latest_run else None,
            "latest_status": latest_run["status"] if latest_run else None,
        },
        "approvals": {
            "pending": len(pending_approvals),
        },
        "rooms": {
            "active": sum(1 for row in rooms if str(row.get("status")) == "active"),
            "review": sum(1 for row in rooms if str(row.get("room_type")) == "review"),
        },
        "validation": {
            "failing_runs": failing_runs,
            "latest_failure_reason": latest_failure_reason,
        },
        "handoffs": {
            "open": sum(1 for row in handoffs if str(row.get("status")) != "completed"),
            "blocked": sum(1 for row in handoffs if str(row.get("status")) == "blocked"),
        },
    }


def _parse_utc_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _sort_attention_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    severity_rank = {"danger": 0, "warning": 1, "info": 2}

    def sort_key(item: dict[str, Any]) -> tuple[int, float, str]:
        severity = severity_rank.get(str(item.get("severity")), 9)
        created_at = _parse_utc_iso_timestamp(str(item.get("created_at") or "")) or datetime.fromtimestamp(0, timezone.utc)
        return (severity, -created_at.timestamp(), str(item.get("id") or ""))

    return sorted(items, key=sort_key)


def _guess_agent_role(agent_id: str) -> str:
    normalized = agent_id.strip().lower()
    if any(token in normalized for token in ("validator", "sentinel", "gate")):
        return "validator"
    if any(token in normalized for token in ("review", "auditor", "critic")):
        return "reviewer"
    if any(token in normalized for token in ("research", "scout", "analyst")):
        return "researcher"
    if any(token in normalized for token in ("owner", "architect", "planner", "orchestr")):
        return "orchestrator"
    return "implementer"


def _role_archetype(role: str) -> str:
    return {
        "orchestrator": "Floor lead",
        "implementer": "Builder",
        "researcher": "Explorer",
        "reviewer": "Inspector",
        "validator": "Gatekeeper",
    }.get(role, "Operator")


def _derive_agent_status(*, latest_run_status: str | None, last_active: datetime | None) -> str:
    if latest_run_status in {"active", "running"}:
        return "running"
    if last_active is None:
        return "dormant"
    if datetime.now(timezone.utc) - last_active > timedelta(hours=24):
        return "dormant"
    return "idle"


def build_operator_inbox_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    items: list[dict[str, Any]] = []

    for request in repository.list_approval_requests(status="pending"):
        items.append(
            {
                "id": f"approval:{request['request_id']}",
                "kind": "approval",
                "severity": "warning",
                "title": f"Approval required for {request['action_type']}",
                "summary": f"{request['actor']} requested {request['action_type']}",
                "run_id": request.get("run_id"),
                "iteration_id": request.get("iteration_id"),
                "room_id": None,
                "created_at": request["updated_at"],
                "action_label": "Review approval",
            }
        )

    for run in repository.list_runs():
        validator_results = repository.list_validator_results(run["run_id"])
        if validator_results:
            latest_validator = validator_results[-1]
            if not latest_validator["passed"]:
                items.append(
                    {
                        "id": f"validator:{run['run_id']}:{latest_validator['id']}",
                        "kind": "validator_failure",
                        "severity": "danger",
                        "title": f"Validator failed for {run['run_id']}",
                        "summary": latest_validator.get("feedback_text") or "validation failed",
                        "run_id": run["run_id"],
                        "iteration_id": latest_validator.get("iteration_id"),
                        "room_id": None,
                        "created_at": latest_validator["created_at"],
                        "action_label": "Inspect run",
                    }
                )

        updated_at = _parse_utc_iso_timestamp(str(run.get("updated_at") or ""))
        if updated_at and str(run.get("status")) in {"active", "running"}:
            if datetime.now(timezone.utc) - updated_at > timedelta(hours=STALE_RUN_AGE_HOURS):
                items.append(
                    {
                        "id": f"stale-run:{run['run_id']}",
                        "kind": "stale_run",
                        "severity": "warning",
                        "title": f"Run {run['run_id']} looks stale",
                        "summary": f"Last updated at {run['updated_at']}",
                        "run_id": run["run_id"],
                        "iteration_id": None,
                        "room_id": None,
                        "created_at": run["updated_at"],
                        "action_label": "Inspect run",
                    }
                )

    for handoff in repository.list_handoff_packets(status="blocked"):
        packet = handoff.get("packet_json") if isinstance(handoff.get("packet_json"), dict) else {}
        items.append(
            {
                "id": f"handoff:{handoff['handoff_id']}",
                "kind": "handoff_attention",
                "severity": "warning",
                "title": f"Blocked handoff {handoff['handoff_id']}",
                "summary": str(packet.get("blocked_reason") or handoff.get("summary") or "handoff is blocked"),
                "run_id": handoff.get("run_id"),
                "iteration_id": handoff.get("iteration_id"),
                "room_id": None,
                "created_at": handoff["updated_at"],
                "action_label": "Inspect run",
            }
        )

    return {
        "items": _sort_attention_items(items),
        "count": len(items),
    }


def build_operator_agents_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = repository.list_runs()
    approvals = repository.list_approval_requests()
    rooms = repository.list_room_records()
    memory_records = repository.list_memory_records()
    handoffs = repository.list_handoff_packets()

    known_ids: set[str] = set()

    def ingest(value: str | None) -> None:
        if not value:
            return
        normalized = value.strip()
        if not normalized:
            return
        if normalized.lower() in {"user", "human", "cli", "system", "tool"}:
            return
        known_ids.add(normalized)

    for approval in approvals:
        ingest(str(approval.get("actor") or ""))
        ingest(str(approval.get("reviewer") or ""))
    for room in rooms:
        ingest(str(room.get("created_by") or ""))
        for participant in room.get("participants_json") or []:
            if isinstance(participant, str):
                ingest(participant)
    for row in memory_records:
        ingest(str(row.get("agent_id") or ""))
    for handoff in handoffs:
        ingest(str(handoff.get("from_actor") or ""))
        ingest(str(handoff.get("to_actor") or ""))
    for run in runs:
        plan = repository.get_task_plan(run["run_id"])
        ingest(str((plan or {}).get("owner") or ""))
        build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
        if build_checkpoint:
            ingest(str((build_checkpoint.get("state_json") or {}).get("agent_id") or ""))
        planner_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="planner")
        if planner_checkpoint:
            ingest(str((planner_checkpoint.get("state_json") or {}).get("agent_id") or ""))

    agent_rows: list[dict[str, Any]] = []
    for agent_id in sorted(known_ids):
        role = _guess_agent_role(agent_id)
        related_runs: list[dict[str, Any]] = []
        latest_blocker: tuple[str | None, str | None] = (None, None)
        for run in runs:
            plan = repository.get_task_plan(run["run_id"])
            owner = str((plan or {}).get("owner") or "")
            build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
            checkpoint_agent = str(((build_checkpoint or {}).get("state_json") or {}).get("agent_id") or "")
            if agent_id not in {owner, checkpoint_agent}:
                continue
            related_runs.append(run)

            for validator in repository.list_validator_results(run["run_id"]):
                if validator["passed"]:
                    continue
                created_at = str(validator["created_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, str(validator.get("feedback_text") or "validation failed"))
            for approval in approvals:
                if approval.get("status") != "pending":
                    continue
                if approval.get("run_id") != run["run_id"] and approval.get("actor") != agent_id:
                    continue
                created_at = str(approval["updated_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, f"approval pending: {approval['action_type']}")
            for handoff in handoffs:
                if handoff.get("status") != "blocked":
                    continue
                if handoff.get("run_id") != run["run_id"] and agent_id not in {handoff.get("from_actor"), handoff.get("to_actor")}:
                    continue
                created_at = str(handoff["updated_at"])
                blocked_reason = ""
                if isinstance(handoff.get("packet_json"), dict):
                    blocked_reason = str(handoff["packet_json"].get("blocked_reason") or "")
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, blocked_reason or str(handoff.get("summary") or "handoff blocked"))

        latest_run = None
        if related_runs:
            latest_run = max(related_runs, key=lambda row: str(row.get("updated_at") or ""))

        related_rooms = [
            room
            for room in rooms
            if agent_id == str(room.get("created_by") or "")
            or agent_id in {p for p in (room.get("participants_json") or []) if isinstance(p, str)}
        ]
        latest_room = max(related_rooms, key=lambda row: str(row.get("updated_at") or ""), default=None)

        memory_count = sum(1 for row in memory_records if str(row.get("agent_id") or "") == agent_id)
        pending_approvals = sum(
            1
            for row in approvals
            if row.get("status") == "pending" and (row.get("actor") == agent_id or row.get("run_id") in {r["run_id"] for r in related_runs})
        )

        validator_failures = 0
        for run in related_runs:
            validator_results = repository.list_validator_results(run["run_id"])
            if validator_results and not validator_results[-1]["passed"]:
                validator_failures += 1
        error_rate = (validator_failures / len(related_runs)) if related_runs else 0.0

        activity_candidates = [
            _parse_utc_iso_timestamp(str(item))
            for item in [
                latest_run["updated_at"] if latest_run else None,
                latest_room["updated_at"] if latest_room else None,
                max(
                    (
                        str(row.get("created_at") or "")
                        for row in memory_records
                        if str(row.get("agent_id") or "") == agent_id
                    ),
                    default="",
                ),
            ]
        ]
        last_active_dt = max((item for item in activity_candidates if item is not None), default=None)
        last_active = (last_active_dt or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        agent_rows.append(
            {
                "agent_id": agent_id,
                "name": agent_id,
                "role": role,
                "archetype": _role_archetype(role),
                "status": _derive_agent_status(
                    latest_run_status=str(latest_run.get("status")) if latest_run else None,
                    last_active=last_active_dt,
                ),
                "room_id": str((latest_room or {}).get("room_id") or "unassigned"),
                "task_count": len(related_runs),
                "last_active": last_active,
                "memory_count": memory_count,
                "error_rate": round(error_rate, 4),
                "latest_run_id": str(latest_run.get("run_id")) if latest_run else None,
                "latest_run_status": str(latest_run.get("status")) if latest_run else None,
                "latest_blocker": latest_blocker[1],
                "pending_approvals": pending_approvals,
                "workspace_ref": None,
            }
        )

    return {
        "agents": sorted(agent_rows, key=lambda row: (row["role"], row["name"])),
        "count": len(agent_rows),
    }

    failing_runs = 0
    latest_failure_reason: str | None = None
    latest_failure_at: str | None = None
    for run in runs:
        validator_results = repository.list_validator_results(run["run_id"])
        if not validator_results:
            continue
        latest_for_run = validator_results[-1]
        if not latest_for_run["passed"]:
            failing_runs += 1
        for row in validator_results:
            if row["passed"]:
                continue
            created_at = str(row["created_at"])
            if latest_failure_at is None or created_at > latest_failure_at:
                latest_failure_at = created_at
                latest_failure_reason = str(row.get("feedback_text") or "validation failed")

    return {
        "generated_at": utc_iso(),
        "runs": {
            "total": len(runs),
            "active": sum(1 for row in runs if str(row.get("status")) in {"active", "running"}),
            "awaiting_approval": len(awaiting_approval_run_ids),
            "with_failures": failing_runs,
            "latest_run_id": latest_run["run_id"] if latest_run else None,
            "latest_status": latest_run["status"] if latest_run else None,
        },
        "approvals": {
            "pending": len(pending_approvals),
        },
        "rooms": {
            "active": sum(1 for row in rooms if str(row.get("status")) == "active"),
            "review": sum(1 for row in rooms if str(row.get("room_type")) == "review"),
        },
        "validation": {
            "failing_runs": failing_runs,
            "latest_failure_reason": latest_failure_reason,
        },
        "handoffs": {
            "open": sum(1 for row in handoffs if str(row.get("status")) != "completed"),
            "blocked": sum(1 for row in handoffs if str(row.get("status")) == "blocked"),
        },
    }


def build_run_detail_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    run = _ensure_run_exists(repository, run_id)
    iterations = repository.list_iterations(run_id)
    latest_iteration = iterations[-1] if iterations else None
    return {
        "run": run,
        "iterations": iterations,
        "latest_iteration": latest_iteration,
        "task_plan": repository.get_task_plan(run_id),
        "counts": _run_counts(repository, run_id),
    }


def build_run_state_docs_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    task_plan = TaskPlanWriterReader(repository).read(run_id)
    findings_service = FindingsAppendService(repository)
    progress_service = ProgressAppendOnlyService(repository)
    latest_context = LatestContextSkeletonGenerator(repository)
    return {
        "run_id": run_id,
        "documents": {
            "task_plan": {
                "path": _relative_display_path(task_plan_path(workspace_root), workspace_root),
                "content": task_plan["markdown"] if task_plan else "# task_plan.md\n\n_No active plan._\n",
            },
            "findings": {
                "path": _relative_display_path(findings_path(workspace_root), workspace_root),
                "content": findings_service.render(run_id),
            },
            "progress": {
                "path": _relative_display_path(progress_path(workspace_root), workspace_root),
                "content": progress_service.render_entries(repository.list_progress_entries(run_id), run_id=run_id),
            },
            "latest_context": {
                "path": _relative_display_path(latest_context_path(workspace_root), workspace_root),
                "content": latest_context.render(run_id),
            },
        },
    }


def build_run_context_latest_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    latest_context = LatestContextSkeletonGenerator(repository)
    runtime_path = latest_context_path(workspace_root)
    repo_path = _repo_latest_context_path(workspace_root)
    return {
        "run_id": run_id,
        "runtime_latest": {
            "path": _relative_display_path(runtime_path, workspace_root),
            "content": latest_context.render(run_id),
        },
        "repo_latest": (
            {
                "path": _relative_display_path(repo_path, workspace_root),
                "content": _read_optional_text(repo_path),
            }
            if repo_path.exists()
            else None
        ),
    }


def build_approvals_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    iteration_id: str | None = None,
    task_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    return {
        "approvals": repository.list_approval_requests(run_id=run_id, iteration_id=iteration_id, task_id=task_id, status=status),
    }


def build_approval_detail_payload(workspace: str | Path, request_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    approval = repository.get_approval_request(request_id)
    if approval is None:
        raise FileNotFoundError(f"Approval request not found: {request_id}")
    return {"approval": approval}


def request_operator_task_approval(
    workspace: str | Path,
    *,
    task_id: str,
    actor: str,
    rationale: str | None = None,
    requested_changes: list[str] | None = None,
    draft_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_approval_request_allowed(task)
    if not task.get("linked_run_id") or not task.get("linked_iteration_id"):
        raise ValueError("Operator task approval requests currently require linked run and iteration ids.")

    existing_pending = repository.list_approval_requests(task_id=task_id, status="pending")
    if existing_pending:
        return existing_pending[0]

    adapter = ApprovalInterruptAdapter(workspace)
    payload = {
        "task": task,
        "rationale": rationale,
        "requested_changes": requested_changes or [],
        "draft_snapshot": draft_snapshot or {},
    }
    return adapter.enqueue_request(
        run_id=str(task["linked_run_id"]),
        iteration_id=str(task["linked_iteration_id"]),
        task_id=task_id,
        actor=actor,
        action_type="operator_task_update",
        action_payload=payload,
    )


def _ensure_active_resume_request(runtime: LocalOrchestrationRuntime, *, run_id: str, request_id: str) -> None:
    state = runtime.resume(run_id, "build")
    if state is None or state.pending_approval_request_id != request_id:
        raise ValueError("Approval request is not the active pending approval for this run")


def _stream_snapshot_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    replay = ReplayService(workspace)
    payload: dict[str, Any] = {
        "generated_at": time.time(),
        "run_id": run_id,
        "room_id": room_id,
        "pending_approvals": repository.list_approval_requests(run_id=run_id, status="pending"),
    }
    if run_id:
        timeline = replay.run_timeline(run_id)
        payload["latest_run_event"] = timeline["timeline"][-1] if timeline["timeline"] else None
    if room_id:
        room_timeline = replay.room_timeline(room_id)
        payload["latest_room_event"] = room_timeline["timeline"][-1] if room_timeline["timeline"] else None
    return payload


def serialize_sse_event(*, event: str, data: dict[str, Any], event_id: str | None = None) -> bytes:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, ensure_ascii=False)
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _build_handler(
    workspace: str | Path,
    auth_token: str,
    reviewer_identity: str,
) -> type[BaseHTTPRequestHandler]:
    workspace_root = Path(workspace)
    replay = ReplayService(workspace_root)
    approvals = ApprovalInterruptAdapter(workspace_root)
    runtime = LocalOrchestrationRuntime(workspace_root)

    class ForwardBridgeHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            if not _request_is_loopback(self):
                _forward_json_response(self, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
                return
            if _loopback_origin(self) is None:
                _forward_json_response(self, {"error": "Missing or invalid loopback origin."}, status=403)
                return
            _forward_text_response(self, "", status=204, content_type="text/plain; charset=utf-8")

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query or "", keep_blank_values=False)
            if path.startswith("/api/") and not _require_bridge_read_access(self, auth_token):
                return
            if path in {"/", "/index.html"}:
                _forward_text_response(self, _bridge_root_html())
                return
            if path == "/api/events/stream":
                run_id = query.get("run_id", [None])[0]
                room_id = query.get("room_id", [None])[0]
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id") if run_id else None
                    safe_room_id = validate_room_id(room_id) if room_id else None
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                    return
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Connection", "keep-alive")
                    for key, value in _forward_extra_headers(self).items():
                        self.send_header(key, value)
                    self.end_headers()
                    event_id = 0
                    snapshot = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                    last_payload_key = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
                    self.wfile.write(serialize_sse_event(event="snapshot", data=snapshot, event_id=str(event_id)))
                    self.wfile.flush()
                    while True:
                        time.sleep(1)
                        current = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                        current_key = json.dumps(current, ensure_ascii=False, sort_keys=True)
                        event_id += 1
                        if current_key != last_payload_key:
                            self.wfile.write(serialize_sse_event(event="snapshot", data=current, event_id=str(event_id)))
                            last_payload_key = current_key
                        else:
                            self.wfile.write(
                                serialize_sse_event(
                                    event="heartbeat",
                                    data={"ts": time.time(), "run_id": safe_run_id, "room_id": safe_room_id},
                                    event_id=str(event_id),
                                )
                            )
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, FileNotFoundError, ValueError, OSError):
                    return
                except Exception as exc:
                    self.log_error("Forward stream unexpected error: %s", exc)
                    return
                return
            if path == "/api/runs":
                _forward_json_response(self, build_runs_payload(workspace_root))
                return
            if path == "/api/operator/summary":
                _forward_json_response(self, build_operator_summary_payload(workspace_root))
                return
            if path == "/api/operator/inbox":
                _forward_json_response(self, build_operator_inbox_payload(workspace_root))
                return
            if path == "/api/operator/agents":
                _forward_json_response(self, build_operator_agents_payload(workspace_root))
                return
            if path == "/api/operator/tasks":
                try:
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in OPERATOR_TASK_STATUSES:
                        raise ValueError(f"Unsupported operator task status: {safe_status}")
                    safe_owner = query.get("owner_agent_id", [None])[0]
                    if safe_owner:
                        safe_owner = _validate_api_identifier(safe_owner, field_name="owner_agent_id")
                    safe_workspace_ref = query.get("workspace_ref", [None])[0]
                    if safe_workspace_ref:
                        safe_workspace_ref = _validate_api_identifier(safe_workspace_ref, field_name="workspace_ref")
                    raw_include_archived = str(query.get("include_archived", ["0"])[0]).strip().lower()
                    include_archived = raw_include_archived in {"1", "true", "yes", "on"}
                    _forward_json_response(
                        self,
                        build_operator_tasks_payload(
                            workspace_root,
                            status=safe_status,
                            owner_agent_id=safe_owner,
                            workspace_ref=safe_workspace_ref,
                            include_archived=include_archived,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/workspaces":
                try:
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in OPERATOR_WORKSPACE_STATUSES_SET:
                        raise ValueError(f"Unsupported operator workspace status: {safe_status}")
                    safe_owner = query.get("owner_agent_id", [None])[0]
                    if safe_owner:
                        safe_owner = _validate_api_identifier(safe_owner, field_name="owner_agent_id")
                    _forward_json_response(
                        self,
                        build_operator_workspaces_payload(workspace_root, status=safe_status, owner_agent_id=safe_owner),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, build_operator_task_detail_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path.startswith("/api/operator/workspaces/"):
                workspace_id = unquote(path.removeprefix("/api/operator/workspaces/"))
                try:
                    safe_workspace_id = _validate_api_identifier(workspace_id, field_name="workspace_id")
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path == "/api/approvals":
                try:
                    safe_run_id = _validate_api_identifier(query.get("run_id", [None])[0], field_name="run_id") if query.get("run_id", [None])[0] else None
                    safe_iteration_id = _validate_api_identifier(query.get("iteration_id", [None])[0], field_name="iteration_id") if query.get("iteration_id", [None])[0] else None
                    safe_task_id = _validate_api_identifier(query.get("task_id", [None])[0], field_name="task_id") if query.get("task_id", [None])[0] else None
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in APPROVAL_STATUSES:
                        raise ValueError(f"Unsupported approval status: {safe_status}")
                    _forward_json_response(
                        self,
                        build_approvals_payload(
                            workspace_root,
                            run_id=safe_run_id,
                            iteration_id=safe_iteration_id,
                            task_id=safe_task_id,
                            status=safe_status,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/"):
                request_id = unquote(path.removeprefix("/api/approvals/"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    _forward_json_response(self, build_approval_detail_payload(workspace_root, safe_request_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/replay"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/replay"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _ensure_run_exists(replay.repository, safe_run_id)
                    _forward_json_response(self, replay.run_timeline(safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/state-docs"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/state-docs"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_state_docs_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/context-latest"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/context-latest"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_context_latest_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/"):
                run_id = unquote(path.removeprefix("/api/runs/"))
                try:
                    _forward_json_response(self, build_run_detail_payload(workspace_root, _validate_api_identifier(run_id, field_name="run_id")))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/rooms/") and path.endswith("/timeline"):
                room_id = unquote(path.removeprefix("/api/rooms/").removesuffix("/timeline"))
                try:
                    _forward_json_response(self, replay.room_timeline(validate_room_id(room_id)))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            try:
                payload = _read_json_body(self)
            except OverflowError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=413)
                return
            except ValueError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/tasks":
                try:
                    task_fields = _parse_operator_task_payload(payload)
                    title = task_fields["title"]
                    objective = task_fields["objective"]
                    if not title:
                        raise ValueError("Operator task title is required.")
                    if not objective:
                        raise ValueError("Operator task objective is required.")
                    task_id = payload.get("task_id")
                    safe_task_id = (
                        _validate_api_identifier(str(task_id), field_name="task_id")
                        if isinstance(task_id, str) and task_id.strip()
                        else _next_operator_task_id()
                    )
                    repository = LoopStateRepository(workspace_root)
                    _ensure_operator_task_workspace_reference_allowed(
                        repository,
                        current_task=None,
                        next_fields=task_fields,
                    )
                    task = repository.create_operator_task(
                        task_id=safe_task_id,
                        title=title,
                        objective=objective,
                        status=task_fields["status"],
                        priority=task_fields["priority"],
                        owner_agent_id=task_fields["owner_agent_id"],
                        linked_run_id=task_fields["linked_run_id"],
                        linked_iteration_id=task_fields["linked_iteration_id"],
                        linked_room_ids=task_fields["linked_room_ids"],
                        blocked_reason=task_fields["blocked_reason"],
                        acceptance=task_fields["acceptance"],
                        workspace_ref=task_fields["workspace_ref"],
                    )
                    _refresh_operator_workspace_membership(repository, task_fields["workspace_ref"])
                    _forward_json_response(self, {"task": task}, status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/workspaces":
                try:
                    workspace_fields = _parse_operator_workspace_payload(payload)
                    if not workspace_fields["label"]:
                        raise ValueError("Operator workspace label is required.")
                    if not workspace_fields["path"]:
                        raise ValueError("Operator workspace path is required.")
                    if workspace_fields["status"] == "archived" and not workspace_fields["archive_note"]:
                        raise ValueError("Workspace archive rationale is required.")
                    workspace_id = payload.get("workspace_id")
                    safe_workspace_id = (
                        _validate_api_identifier(str(workspace_id), field_name="workspace_id")
                        if isinstance(workspace_id, str) and workspace_id.strip()
                        else _next_operator_workspace_id()
                    )
                    repository = LoopStateRepository(workspace_root)
                    repository.create_operator_workspace(
                        workspace_id=safe_workspace_id,
                        label=workspace_fields["label"],
                        path=workspace_fields["path"],
                        kind=workspace_fields["kind"],
                        status=workspace_fields["status"],
                        owner_agent_id=workspace_fields["owner_agent_id"],
                        linked_run_id=workspace_fields["linked_run_id"],
                        linked_iteration_id=workspace_fields["linked_iteration_id"],
                        task_ids=workspace_fields["task_ids"],
                        notes=workspace_fields["notes"],
                        archived_at=utc_iso() if workspace_fields["status"] == "archived" else None,
                        archived_by=reviewer_identity if workspace_fields["status"] == "archived" else None,
                        archive_note=workspace_fields["archive_note"] if workspace_fields["status"] == "archived" else None,
                    )
                    _refresh_operator_workspace_membership(repository, safe_workspace_id)
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id), status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/") and path.endswith("/decision"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/decision"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    status = str(payload.get("status") or "").strip()
                    reviewer_note = str(payload.get("reviewer_note") or "").strip()
                    if status not in APPROVAL_STATUSES - {"pending"}:
                        raise ValueError(f"Unsupported approval status: {status}")
                    decided = approvals.decide(
                        request_id=safe_request_id,
                        status=status,
                        reviewer=reviewer_identity,
                        reviewer_note=reviewer_note,
                        edited_payload=payload.get("edited_payload") if isinstance(payload.get("edited_payload"), dict) else None,
                    )
                    _forward_json_response(self, {"approval": decided})
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/approvals/") and path.endswith("/resume"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/resume"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    request = build_approval_detail_payload(workspace_root, safe_request_id)["approval"]
                    _ensure_active_resume_request(runtime, run_id=request["run_id"], request_id=safe_request_id)
                    state = runtime.resume_after_approval(request["run_id"], graph_kind="build")
                    _forward_json_response(
                        self,
                        {
                            "approval": request,
                            "state": {
                                "run_id": state.run_id,
                                "current_step": state.current_step,
                                "stop_reason": state.stop_reason,
                                "approval_pending": state.approval_pending,
                            },
                        },
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/request-approval"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/request-approval"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    requested = request_operator_task_approval(
                        workspace_root,
                        task_id=safe_task_id,
                        actor=reviewer_identity,
                        rationale=str(payload.get("rationale") or "").strip() or None,
                        requested_changes=[
                            str(item)
                            for item in (payload.get("requested_changes") or [])
                            if isinstance(item, str)
                        ],
                        draft_snapshot=payload.get("draft_snapshot") if isinstance(payload.get("draft_snapshot"), dict) else None,
                    )
                    _forward_json_response(self, {"approval": requested}, status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/detach-workspace"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/detach-workspace"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, detach_operator_task_workspace_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/archive"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/archive"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(
                        self,
                        archive_operator_task_payload(
                            workspace_root,
                            safe_task_id,
                            actor=reviewer_identity,
                            archive_note=_parse_archive_note(payload),
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/restore"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/restore"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, restore_operator_task_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_PATCH(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            try:
                payload = _read_json_body(self)
            except OverflowError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=413)
                return
            except ValueError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    repository = LoopStateRepository(workspace_root)
                    current_task = repository.get_operator_task(safe_task_id)
                    if current_task is None:
                        raise ValueError(f"Operator task not found: {safe_task_id}")
                    task_fields = _parse_operator_task_payload(payload)
                    if not task_fields["title"]:
                        raise ValueError("Operator task title is required.")
                    if not task_fields["objective"]:
                        raise ValueError("Operator task objective is required.")
                    _ensure_operator_task_workspace_reference_allowed(
                        repository,
                        current_task=current_task,
                        next_fields=task_fields,
                    )
                    _ensure_operator_task_update_allowed(
                        repository,
                        current_task=current_task,
                        next_fields=task_fields,
                    )
                    task = repository.update_operator_task(
                        task_id=safe_task_id,
                        title=task_fields["title"],
                        objective=task_fields["objective"],
                        status=task_fields["status"],
                        priority=task_fields["priority"],
                        owner_agent_id=task_fields["owner_agent_id"],
                        linked_run_id=task_fields["linked_run_id"],
                        linked_iteration_id=task_fields["linked_iteration_id"],
                        linked_room_ids=task_fields["linked_room_ids"],
                        blocked_reason=task_fields["blocked_reason"],
                        acceptance=task_fields["acceptance"],
                        workspace_ref=task_fields["workspace_ref"],
                    )
                    _refresh_operator_workspace_membership(repository, current_task.get("workspace_ref"))
                    _refresh_operator_workspace_membership(repository, task_fields["workspace_ref"])
                    _forward_json_response(self, {"task": task})
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/workspaces/"):
                workspace_id = unquote(path.removeprefix("/api/operator/workspaces/"))
                try:
                    safe_workspace_id = _validate_api_identifier(workspace_id, field_name="workspace_id")
                    repository = LoopStateRepository(workspace_root)
                    current_workspace = repository.get_operator_workspace(safe_workspace_id)
                    if current_workspace is None:
                        raise ValueError(f"Operator workspace not found: {safe_workspace_id}")
                    workspace_fields = _parse_operator_workspace_payload(payload)
                    if not workspace_fields["label"]:
                        raise ValueError("Operator workspace label is required.")
                    if not workspace_fields["path"]:
                        raise ValueError("Operator workspace path is required.")
                    _ensure_operator_workspace_update_allowed(
                        repository,
                        current_workspace=current_workspace,
                        next_fields=workspace_fields,
                    )
                    archiving_workspace = current_workspace.get("status") != "archived" and workspace_fields["status"] == "archived"
                    repository.update_operator_workspace(
                        workspace_id=safe_workspace_id,
                        label=workspace_fields["label"],
                        path=workspace_fields["path"],
                        kind=workspace_fields["kind"],
                        status=workspace_fields["status"],
                        owner_agent_id=workspace_fields["owner_agent_id"],
                        linked_run_id=workspace_fields["linked_run_id"],
                        linked_iteration_id=workspace_fields["linked_iteration_id"],
                        task_ids=workspace_fields["task_ids"],
                        notes=workspace_fields["notes"],
                        archived_by=reviewer_identity if archiving_workspace else None,
                        archive_note=workspace_fields["archive_note"] if workspace_fields["status"] == "archived" else None,
                    )
                    _refresh_operator_workspace_membership(repository, safe_workspace_id)
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_DELETE(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    repository = LoopStateRepository(workspace_root)
                    current_task = repository.get_operator_task(safe_task_id)
                    _forward_json_response(self, delete_operator_task_payload(workspace_root, safe_task_id))
                    if current_task is not None:
                        _refresh_operator_workspace_membership(repository, current_task.get("workspace_ref"))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

    return ForwardBridgeHandler


def launch_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    if not _host_is_loopback(host):
        raise ValueError("Forward bridge host must be loopback-only (127.0.0.1, ::1, or localhost).")
    auth_token = secrets.token_urlsafe(24)
    resolved_reviewer_identity = _resolve_reviewer_identity(reviewer_identity)
    handler = _build_handler(workspace, auth_token, resolved_reviewer_identity)
    server = ThreadingHTTPServer((host, port), handler)
    actual_host, actual_port = server.server_address[0], server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    original_shutdown = server.shutdown

    def shutdown_and_close() -> None:
        original_shutdown()
        server.server_close()

    server.shutdown = shutdown_and_close  # type: ignore[assignment]
    return {
        "url": f"http://{actual_host}:{actual_port}/",
        "api_root": f"http://{actual_host}:{actual_port}/api",
        "token": auth_token,
        "reviewer_identity": resolved_reviewer_identity,
        "server": server,
        "thread": thread,
    }


def run_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    once: bool = False,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    launched = launch_forward_bridge(workspace, host=host, port=port, reviewer_identity=reviewer_identity)
    if once:
        return launched
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        launched["server"].shutdown()
        return launched


__all__ = [
    "build_approval_detail_payload",
    "archive_operator_task_payload",
    "request_operator_task_approval",
    "build_operator_task_detail_payload",
    "build_operator_tasks_payload",
    "build_operator_workspace_detail_payload",
    "build_operator_workspaces_payload",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "restore_operator_task_payload",
    "build_operator_inbox_payload",
    "build_operator_agents_payload",
    "build_operator_summary_payload",
    "build_approvals_payload",
    "build_run_context_latest_payload",
    "build_run_detail_payload",
    "build_run_state_docs_payload",
    "build_runs_payload",
    "launch_forward_bridge",
    "run_forward_bridge",
    "serialize_sse_event",
]
