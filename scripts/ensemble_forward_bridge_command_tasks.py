#!/usr/bin/env python3
from __future__ import annotations

import secrets
from pathlib import Path

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_forward_bridge_command_approvals import public_approval_record
from ensemble_forward_bridge_command_support import (
    CommandBadRequest,
    CommandConflict,
    JsonPayload,
    require,
    validate_api_identifier,
    validate_optional_identifier,
)
from ensemble_forward_bridge_command_workspaces import refresh_workspace_membership
from ensemble_loop_repository import LoopStateRepository
from ensemble_room import validate_room_id

TASK_STATUSES = {"backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"}
TASK_PRIORITIES = {"low", "medium", "high", "critical"}


def create_operator_task(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str) -> JsonPayload:
    _ = reviewer_identity
    fields = _parse_payload(payload)
    require(fields["title"], "Operator task title is required.")
    require(fields["objective"], "Operator task objective is required.")
    task_id = validate_optional_identifier(payload.get("task_id"), "task_id") or f"otask-{secrets.token_hex(8)}"
    repository = LoopStateRepository(workspace)
    _ensure_workspace_reference(repository, current=None, next_fields=fields)
    task = repository.create_operator_task(task_id=task_id, **fields)
    refresh_workspace_membership(repository, fields["workspace_ref"])
    return {"task": task}


def update_operator_task(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str
) -> JsonPayload:
    _ = reviewer_identity
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    repository = LoopStateRepository(workspace)
    current = repository.get_operator_task(safe_id)
    if current is None:
        raise CommandBadRequest(f"Operator task not found: {safe_id}")
    fields = _parse_payload(payload)
    require(fields["title"], "Operator task title is required.")
    require(fields["objective"], "Operator task objective is required.")
    _ensure_workspace_reference(repository, current=current, next_fields=fields)
    _ensure_update_allowed(repository, current=current, next_fields=fields)
    task = repository.update_operator_task(task_id=safe_id, **fields)
    refresh_workspace_membership(repository, current.get("workspace_ref"))
    refresh_workspace_membership(repository, fields["workspace_ref"])
    return {"task": task}


def request_task_approval(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str
) -> JsonPayload:
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    repository = LoopStateRepository(workspace)
    task = _require_task(repository, safe_id)
    if task.get("archived_at"):
        raise CommandConflict("Archived operator tasks cannot request approval until restored.")
    if not task.get("linked_run_id") or not task.get("linked_iteration_id"):
        raise CommandBadRequest("Operator task approval requests currently require linked run and iteration ids.")
    pending = repository.list_approval_requests(task_id=safe_id, status="pending")
    if pending:
        return {"approval": public_approval_record(pending[0])}
    changes = payload.get("requested_changes") or []
    requested = ApprovalInterruptAdapter(workspace).enqueue_request(
        run_id=str(task["linked_run_id"]),
        iteration_id=str(task["linked_iteration_id"]),
        task_id=safe_id,
        actor=reviewer_identity,
        action_type="operator_task_update",
        action_payload={
            "task": task,
            "rationale": str(payload.get("rationale") or "").strip() or None,
            "requested_changes": [str(item) for item in changes if isinstance(item, str)],
            "draft_snapshot": payload.get("draft_snapshot") if isinstance(payload.get("draft_snapshot"), dict) else {},
        },
    )
    return {"approval": public_approval_record(requested)}


def detach_task_workspace(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str
) -> JsonPayload:
    _ = payload, reviewer_identity
    repository = LoopStateRepository(workspace)
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    task = _require_task(repository, safe_id)
    fields = _task_fields(task, workspace_ref=None)
    _ensure_update_allowed(repository, current=task, next_fields=fields)
    detached = repository.detach_operator_task_workspace(safe_id)
    refresh_workspace_membership(repository, task.get("workspace_ref"))
    return {"task": detached}


def archive_task(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str) -> JsonPayload:
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    repository = LoopStateRepository(workspace)
    task = _require_task(repository, safe_id)
    _ensure_archive_allowed(repository, task=task, action="archive")
    note = str(payload.get("archive_note") or "").strip()
    require(note, "Archive rationale is required.")
    return {"task": repository.archive_operator_task(safe_id, archived_by=reviewer_identity, archive_note=note)}


def restore_task(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str) -> JsonPayload:
    _ = payload, reviewer_identity
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    repository = LoopStateRepository(workspace)
    _ensure_archive_allowed(repository, task=_require_task(repository, safe_id), action="restore")
    return {"task": repository.restore_operator_task(safe_id)}


def delete_task(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, task_id: str) -> JsonPayload:
    _ = payload, reviewer_identity
    safe_id = validate_api_identifier(task_id, field_name="task_id")
    repository = LoopStateRepository(workspace)
    task = _require_task(repository, safe_id)
    if not task.get("archived_at"):
        raise CommandConflict("Operator task deletion requires archiving the task first.")
    blockers = _approval_blockers(repository, task)
    if blockers:
        raise CommandConflict("Operator task deletion is blocked while approvals are pending: " + "; ".join(blockers))
    deleted = repository.delete_operator_task(safe_id)
    refresh_workspace_membership(repository, task.get("workspace_ref"))
    return {"deleted_task_id": str(deleted["task_id"])}


def _parse_payload(payload: JsonPayload) -> JsonPayload:
    status = str(payload.get("status") or "todo").strip()
    priority = str(payload.get("priority") or "medium").strip()
    if status not in TASK_STATUSES:
        raise CommandBadRequest(f"Unsupported operator task status: {status}")
    if priority not in TASK_PRIORITIES:
        raise CommandBadRequest(f"Unsupported operator task priority: {priority}")
    room_ids = payload.get("linked_room_ids")
    acceptance = payload.get("acceptance_json")
    return {
        "title": str(payload.get("title") or "").strip(),
        "objective": str(payload.get("objective") or "").strip(),
        "status": status,
        "priority": priority,
        "owner_agent_id": validate_optional_identifier(payload.get("owner_agent_id"), "owner_agent_id"),
        "linked_run_id": validate_optional_identifier(payload.get("linked_run_id"), "linked_run_id"),
        "linked_iteration_id": validate_optional_identifier(payload.get("linked_iteration_id"), "linked_iteration_id"),
        "linked_room_ids": [validate_room_id(str(item)) for item in room_ids if isinstance(item, str) and item.strip()]
        if isinstance(room_ids, list)
        else [],
        "blocked_reason": str(payload.get("blocked_reason") or "").strip() or None,
        "acceptance": [str(item) for item in acceptance if isinstance(item, str)] if isinstance(acceptance, list) else [],
        "workspace_ref": str(payload.get("workspace_ref") or "").strip() or None,
    }


def _ensure_workspace_reference(repository: LoopStateRepository, *, current: JsonPayload | None, next_fields: JsonPayload) -> None:
    workspace_ref = next_fields.get("workspace_ref")
    if not isinstance(workspace_ref, str) or not workspace_ref:
        return
    row = repository.get_operator_workspace(workspace_ref)
    if row is not None:
        if row.get("status") == "archived" and (current is None or workspace_ref != current.get("workspace_ref")):
            raise CommandBadRequest(f"Archived operator workspace cannot accept new task links: {workspace_ref}")
        return
    if current is None or workspace_ref != current.get("workspace_ref"):
        raise CommandBadRequest(f"Operator workspace not found: {workspace_ref}")


def _ensure_update_allowed(repository: LoopStateRepository, *, current: JsonPayload, next_fields: JsonPayload) -> None:
    if current.get("archived_at"):
        raise CommandConflict("Archived operator tasks are read-only until restored.")
    run_id = next_fields.get("linked_run_id") or current.get("linked_run_id")
    if not isinstance(run_id, str) or not run_id or not repository.list_approval_requests(run_id=run_id, status="pending"):
        return
    checks = (
        ("status", current["status"]),
        ("owner_agent_id", current["owner_agent_id"]),
        ("linked_run_id", current["linked_run_id"]),
        ("linked_iteration_id", current["linked_iteration_id"]),
        ("linked_room_ids", list(current["linked_room_ids_json"])),
        ("workspace_ref", current["workspace_ref"]),
    )
    changed = [field for field, old in checks if next_fields[field] != old]
    if changed:
        raise CommandConflict("Operator task mutation is blocked while the linked run has a pending approval: " + ", ".join(changed))


def _ensure_archive_allowed(repository: LoopStateRepository, *, task: JsonPayload, action: str) -> None:
    blockers = _approval_blockers(repository, task)
    if blockers:
        raise CommandConflict(f"Operator task {action} is blocked while approvals are pending: " + "; ".join(blockers))


def _approval_blockers(repository: LoopStateRepository, task: JsonPayload) -> list[str]:
    blockers = ["task has pending approval requests"] if repository.list_approval_requests(task_id=str(task["task_id"]), status="pending") else []
    run_id = task.get("linked_run_id")
    if isinstance(run_id, str) and run_id:
        others = [row for row in repository.list_approval_requests(run_id=run_id, status="pending") if row.get("task_id") != task["task_id"]]
        if others:
            blockers.append(f"linked run {run_id} has pending approvals")
    return blockers


def _task_fields(task: JsonPayload, *, workspace_ref: str | None) -> JsonPayload:
    return {
        "title": task["title"], "objective": task["objective"], "status": task["status"], "priority": task["priority"],
        "owner_agent_id": task["owner_agent_id"], "linked_run_id": task["linked_run_id"],
        "linked_iteration_id": task["linked_iteration_id"], "linked_room_ids": list(task["linked_room_ids_json"]),
        "blocked_reason": task["blocked_reason"], "acceptance": list(task["acceptance_json"]), "workspace_ref": workspace_ref,
    }


def _require_task(repository: LoopStateRepository, task_id: str) -> JsonPayload:
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    return task
