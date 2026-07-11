#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote

from ensemble_agent_patch_service import decide_agent_patch
from ensemble_forward_bridge_command_approvals import (
    decide_approval as _decide_approval,
    resume_approval as _resume_approval,
)
from ensemble_forward_bridge_command_support import (
    CommandBadRequest,
    CommandConflict,
    CommandResult,
    JsonPayload,
)
from ensemble_forward_bridge_command_tasks import (
    archive_task as _archive_task,
    create_operator_task as _create_operator_task,
    delete_task as _delete_task,
    detach_task_workspace as _detach_task_workspace,
    request_task_approval as _request_task_approval,
    restore_task as _restore_task,
    update_operator_task as _update_operator_task,
)
from ensemble_forward_bridge_command_workspaces import (
    create_operator_workspace as _create_operator_workspace,
    update_operator_workspace as _update_operator_workspace,
)

def dispatch_command(
    method: str,
    path: str,
    payload: JsonPayload,
    *,
    workspace: str | Path,
    reviewer_identity: str,
) -> CommandResult | None:
    safe_method = method.upper()
    if safe_method == "POST":
        return _dispatch_post(path, payload, workspace=workspace, reviewer_identity=reviewer_identity)
    if safe_method == "PATCH":
        return _dispatch_patch(path, payload, workspace=workspace, reviewer_identity=reviewer_identity)
    if safe_method == "DELETE":
        return _dispatch_delete(path, payload, workspace=workspace, reviewer_identity=reviewer_identity)
    return None


def _dispatch_post(path: str, payload: JsonPayload, *, workspace: str | Path, reviewer_identity: str) -> CommandResult | None:
    if path == "/api/operator/tasks":
        return _run_json(_create_operator_task, payload, workspace=workspace, reviewer_identity=reviewer_identity, created=True)
    if path == "/api/operator/workspaces":
        return _run_json(_create_operator_workspace, payload, workspace=workspace, reviewer_identity=reviewer_identity, created=True)
    if path.startswith("/api/approvals/") and path.endswith("/decision"):
        request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/decision"))
        return _run_json(_decide_approval, payload, workspace=workspace, reviewer_identity=reviewer_identity, request_id=request_id)
    if path.startswith("/api/approvals/") and path.endswith("/resume"):
        request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/resume"))
        return _run_json(_resume_approval, payload, workspace=workspace, reviewer_identity=reviewer_identity, request_id=request_id)
    if path.startswith("/api/operator/tasks/") and path.endswith("/request-approval"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/request-approval"))
        return _run_json(_request_task_approval, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id, created=True)
    if path.startswith("/api/operator/tasks/") and path.endswith("/detach-workspace"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/detach-workspace"))
        return _run_json(_detach_task_workspace, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id)
    if path.startswith("/api/operator/tasks/") and path.endswith("/archive"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/archive"))
        return _run_json(_archive_task, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id)
    if path.startswith("/api/operator/tasks/") and path.endswith("/restore"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/restore"))
        return _run_json(_restore_task, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id)
    return None


def _dispatch_patch(path: str, payload: JsonPayload, *, workspace: str | Path, reviewer_identity: str) -> CommandResult | None:
    if path.startswith("/api/operator/tasks/"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/"))
        return _run_json(_update_operator_task, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id)
    if path.startswith("/api/operator/workspaces/"):
        workspace_id = unquote(path.removeprefix("/api/operator/workspaces/"))
        return _run_json(_update_operator_workspace, payload, workspace=workspace, reviewer_identity=reviewer_identity, workspace_id=workspace_id)
    return None


def _dispatch_delete(path: str, payload: JsonPayload, *, workspace: str | Path, reviewer_identity: str) -> CommandResult | None:
    if path.startswith("/api/operator/tasks/"):
        task_id = unquote(path.removeprefix("/api/operator/tasks/"))
        return _run_json(_delete_task, payload, workspace=workspace, reviewer_identity=reviewer_identity, task_id=task_id)
    if path.startswith("/api/approvals/") and path.endswith("/approve"):
        patch_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/approve"))
        return _run_json(_decide_patch, payload, workspace=workspace, reviewer_identity=reviewer_identity, patch_id=patch_id, decision="approve")
    if path.startswith("/api/approvals/") and path.endswith("/reject"):
        patch_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/reject"))
        return _run_json(_decide_patch, payload, workspace=workspace, reviewer_identity=reviewer_identity, patch_id=patch_id, decision="reject")
    return None


def _run_json(command, payload: JsonPayload, *, created: bool = False, **kwargs) -> CommandResult:
    try:
        return CommandResult(status=201 if created else 200, payload=command(payload=payload, **kwargs))
    except ValueError as exc:
        return CommandResult(status=400, payload={"error": str(exc)})
    except FileNotFoundError as exc:
        return CommandResult(status=404, payload={"error": str(exc)})
    except CommandConflict as exc:
        return CommandResult(status=409, payload={"error": str(exc)})


def _decide_patch(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, patch_id: str, decision: str) -> JsonPayload:
    reason = str(payload.get("reason") or "").strip() or None
    result = decide_agent_patch(workspace, patch_id, decision=decision, reason=reason, actor=reviewer_identity)
    return {"approval": result} if decision == "approve" else result


__all__ = ["CommandBadRequest", "CommandConflict", "CommandResult", "dispatch_command"]
