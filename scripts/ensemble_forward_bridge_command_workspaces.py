#!/usr/bin/env python3
from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Any

from ensemble_forward import _sanitize_public_text
from ensemble_forward_bridge_command_support import (
    CommandBadRequest,
    CommandConflict,
    JsonPayload,
    require,
    validate_api_identifier,
    validate_optional_identifier,
)
from ensemble_forward_bridge_public_projection import public_actor_label
from ensemble_loop_repository import OPERATOR_WORKSPACE_KINDS, OPERATOR_WORKSPACE_STATUSES, LoopStateRepository, utc_iso


def create_operator_workspace(*, payload: JsonPayload, workspace: str | Path, reviewer_identity: str) -> JsonPayload:
    fields = _parse_payload(payload)
    require(fields["label"], "Operator workspace label is required.")
    require(fields["path"], "Operator workspace path is required.")
    if fields["status"] == "archived":
        require(fields["archive_note"], "Workspace archive rationale is required.")
    workspace_id = validate_optional_identifier(payload.get("workspace_id"), "workspace_id")
    if workspace_id is None:
        workspace_id = f"owork-{secrets.token_hex(8)}"
    repository = LoopStateRepository(workspace)
    repository.create_operator_workspace(
        workspace_id=workspace_id,
        archived_at=utc_iso() if fields["status"] == "archived" else None,
        archived_by=reviewer_identity if fields["status"] == "archived" else None,
        **fields,
    )
    refresh_workspace_membership(repository, workspace_id)
    return build_workspace_detail(workspace, workspace_id)


def update_operator_workspace(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, workspace_id: str
) -> JsonPayload:
    safe_id = validate_api_identifier(workspace_id, field_name="workspace_id")
    repository = LoopStateRepository(workspace)
    current = repository.get_operator_workspace(safe_id)
    if current is None:
        raise CommandBadRequest(f"Operator workspace not found: {safe_id}")
    fields = _parse_payload(payload)
    require(fields["label"], "Operator workspace label is required.")
    require(fields["path"], "Operator workspace path is required.")
    _ensure_update_allowed(repository, current=current, next_fields=fields)
    archiving = current.get("status") != "archived" and fields["status"] == "archived"
    repository.update_operator_workspace(
        workspace_id=safe_id,
        archived_by=reviewer_identity if archiving else None,
        **fields,
    )
    refresh_workspace_membership(repository, safe_id)
    return build_workspace_detail(workspace, safe_id)


def build_workspace_detail(workspace: str | Path, workspace_id: str) -> JsonPayload:
    repository = LoopStateRepository(workspace)
    row = repository.get_operator_workspace(workspace_id)
    if row is None:
        raise FileNotFoundError(f"Operator workspace not found: {workspace_id}")
    enriched = {**row, "task_ids_json": derive_workspace_task_ids(repository, workspace_id)}
    return {"workspace": _public_workspace(enriched, Path(workspace))}


def refresh_workspace_membership(repository: LoopStateRepository, workspace_id: str | None) -> None:
    if not isinstance(workspace_id, str) or not workspace_id:
        return
    row = repository.get_operator_workspace(workspace_id)
    if row is None:
        return
    task_ids = derive_workspace_task_ids(repository, workspace_id)
    if list(row.get("task_ids_json") or []) != task_ids:
        repository.update_operator_workspace(workspace_id=workspace_id, task_ids=task_ids)


def derive_workspace_task_ids(repository: LoopStateRepository, workspace_id: str) -> list[str]:
    return sorted(
        task["task_id"]
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    )


def _parse_payload(payload: JsonPayload) -> JsonPayload:
    kind = str(payload.get("kind") or "repo").strip()
    status = str(payload.get("status") or "active").strip()
    if kind not in set(OPERATOR_WORKSPACE_KINDS):
        raise CommandBadRequest(f"Unsupported operator workspace kind: {kind}")
    if status not in set(OPERATOR_WORKSPACE_STATUSES):
        raise CommandBadRequest(f"Unsupported operator workspace status: {status}")
    task_ids = payload.get("task_ids_json")
    return {
        "label": str(payload.get("label") or "").strip(),
        "path": str(payload.get("path") or "").strip(),
        "kind": kind,
        "status": status,
        "owner_agent_id": validate_optional_identifier(payload.get("owner_agent_id"), "owner_agent_id"),
        "linked_run_id": validate_optional_identifier(payload.get("linked_run_id"), "linked_run_id"),
        "linked_iteration_id": validate_optional_identifier(payload.get("linked_iteration_id"), "linked_iteration_id"),
        "task_ids": [
            validate_api_identifier(str(item), field_name="task_id")
            for item in task_ids
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(task_ids, list)
        else [],
        "notes": str(payload.get("notes") or "").strip() or None,
        "archive_note": str(payload.get("archive_note") or "").strip() or None,
    }


def _ensure_update_allowed(repository: LoopStateRepository, *, current: JsonPayload, next_fields: JsonPayload) -> None:
    current_status = str(current.get("status") or "")
    next_status = str(next_fields.get("status") or current_status)
    changed = _changed_fields(current, next_fields, next_status)
    if current_status == "archived" and (next_status == "archived" or [field for field in changed if field != "status"]):
        raise CommandConflict("Archived operator workspaces are read-only until reactivated.")
    if current_status == "archived" or next_status != "archived":
        return
    require(next_fields.get("archive_note"), "Workspace archive rationale is required.")
    active_ids = [
        str(task["task_id"])
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == current["workspace_id"] and not task.get("archived_at")
    ]
    if active_ids:
        raise CommandConflict("Workspace archiving requires detaching or archiving linked active tasks: " + ", ".join(active_ids))


def _changed_fields(current: JsonPayload, next_fields: JsonPayload, next_status: str) -> list[str]:
    fields = ("label", "path", "kind", "owner_agent_id", "linked_run_id", "linked_iteration_id", "notes")
    changed = [field for field in fields if next_fields[field] != current[field]]
    if next_status != str(current.get("status") or ""):
        changed.append("status")
    return changed


def _public_workspace(row: JsonPayload, root: Path) -> JsonPayload:
    return {
        "workspace_id": str(row.get("workspace_id") or ""),
        "label": _sanitize_public_text(str(row.get("label") or ""), root) or "",
        "path": _public_path(row.get("path"), root),
        "kind": str(row.get("kind") or "repo"),
        "status": str(row.get("status") or "active"),
        "owner_agent_id": public_actor_label(row.get("owner_agent_id")),
        "linked_run_id": row.get("linked_run_id"),
        "linked_iteration_id": row.get("linked_iteration_id"),
        "task_ids_json": [str(item) for item in (row.get("task_ids_json") or []) if isinstance(item, str)],
        "notes": _sanitize_public_text(row.get("notes"), root),
        "archived_at": row.get("archived_at"),
        "archived_by": None,
        "archive_note": _sanitize_public_text(row.get("archive_note"), root),
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def _public_path(value: Any, root: Path) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith(("/", "\\\\")) or re.match(r"^[A-Za-z]:[\\/]", text):
        try:
            return str(Path(text).resolve().relative_to(root.resolve())).replace("\\", "/") or "."
        except ValueError:
            return "[REDACTED]"
    parts = [part for part in text.replace("\\", "/").split("/") if part not in {"", "."}]
    return "[REDACTED]" if ".." in parts else "/".join(parts)
