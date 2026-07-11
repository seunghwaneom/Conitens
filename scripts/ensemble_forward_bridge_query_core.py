#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_forward import _sanitize_public_text
from ensemble_forward_bridge_public_projection import public_actor_label as _public_actor_label
from ensemble_forward_public_context import public_steps, sanitize_public_text
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository
from ensemble_forward_bridge_query_shared import (
    _looks_like_absolute_path,
)

def _conversation_rooms(
    conversations: ConversationReadService,
    *,
    run_id: str | None = None,
) -> list[dict[str, Any]]:
    return conversations.rooms(run_id=run_id)


def _conversation_messages(
    conversations: ConversationReadService,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
) -> list[dict[str, Any]]:
    return conversations.messages(run_id=run_id, room_id=room_id)


def _run_counts(
    repository: LoopStateRepository,
    conversations: ConversationReadService,
    run_id: str,
) -> dict[str, int]:
    return {
        "iterations": len(repository.list_iterations(run_id)),
        "validator_results": len(repository.list_validator_results(run_id)),
        "approvals": len(repository.list_approval_requests(run_id=run_id)),
        "rooms": len(_conversation_rooms(conversations, run_id=run_id)),
        "messages": len(_conversation_messages(conversations, run_id=run_id)),
        "tool_events": len(conversations.tool_events(run_id=run_id)),
        "insights": len(conversations.insights(run_id=run_id)),
        "handoff_packets": len(conversations.handoffs(run_id=run_id)),
    }


def build_runs_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    runs = []
    for run in repository.list_runs():
        iterations = repository.list_iterations(run["run_id"])
        latest_iteration = iterations[-1] if iterations else None
        task_plan = repository.get_task_plan(run["run_id"])
        public_objective = sanitize_public_text(
            task_plan.get("objective") if task_plan else None,
            fallback=f"Run {run['run_id']}",
        )
        runs.append(
            {
                "run_id": str(run.get("run_id") or ""),
                "status": str(run.get("status") or "unknown"),
                "user_request": public_objective,
                "created_at": str(run.get("created_at") or ""),
                "updated_at": str(run.get("updated_at") or ""),
                "latest_iteration_id": latest_iteration["iteration_id"] if latest_iteration else None,
                "latest_iteration_status": latest_iteration["status"] if latest_iteration else None,
                "counts": _run_counts(repository, conversations, run["run_id"]),
            }
        )
    return {"runs": runs, "count": len(runs)}


def build_run_detail_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    run = _ensure_run_exists(repository, run_id)
    iterations = repository.list_iterations(run_id)
    task_plan = repository.get_task_plan(run_id)
    public_objective = sanitize_public_text(
        task_plan.get("objective") if task_plan else None,
        fallback=f"Run {run_id}",
    )
    public_iterations = [
        {
            "iteration_id": str(item.get("iteration_id") or ""),
            "run_id": run_id,
            "seq_no": int(item.get("seq_no") or 0),
            "started_at": str(item.get("started_at") or ""),
            "ended_at": item.get("ended_at"),
            "status": str(item.get("status") or "unknown"),
            "objective": f"Iteration {int(item.get('seq_no') or 0)}",
            "summary": None,
        }
        for item in iterations
    ]
    latest_iteration = public_iterations[-1] if public_iterations else None
    public_task_plan = None
    if task_plan is not None:
        public_task_plan = {
            "run_id": run_id,
            "current_plan": public_objective,
            "objective": public_objective,
            "owner": None,
            "acceptance_json": [],
            "steps_json": public_steps(task_plan.get("steps_json")),
            "updated_at": str(task_plan.get("updated_at") or ""),
        }
    return {
        "run": {
            "run_id": run_id,
            "status": str(run.get("status") or "unknown"),
            "user_request": public_objective,
            "created_at": str(run.get("created_at") or ""),
            "updated_at": str(run.get("updated_at") or ""),
            "current_iteration": int(run.get("current_iteration") or 0),
            "stop_reason": None,
        },
        "iterations": public_iterations,
        "latest_iteration": latest_iteration,
        "task_plan": public_task_plan,
        "counts": _run_counts(repository, conversations, run_id),
    }


def _relative_display_path(path: Path, workspace_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace_root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path.name)


def _public_workspace_path(value: Any, workspace_root: Path) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if _looks_like_absolute_path(text):
        try:
            relative = Path(text).resolve().relative_to(workspace_root.resolve())
        except ValueError:
            return "[REDACTED]"
        return str(relative).replace("\\", "/") or "."
    parts = [
        part
        for part in text.replace("\\", "/").split("/")
        if part not in {"", "."}
    ]
    if ".." in parts:
        return "[REDACTED]"
    return "/".join(parts)


def _public_operator_workspace(
    row: dict[str, Any],
    workspace_root: Path,
) -> dict[str, Any]:
    return {
        "workspace_id": str(row.get("workspace_id") or ""),
        "label": _sanitize_public_text(str(row.get("label") or ""), workspace_root) or "",
        "path": _public_workspace_path(row.get("path"), workspace_root),
        "kind": str(row.get("kind") or "repo"),
        "status": str(row.get("status") or "active"),
        "owner_agent_id": _public_actor_label(row.get("owner_agent_id")),
        "linked_run_id": row.get("linked_run_id"),
        "linked_iteration_id": row.get("linked_iteration_id"),
        "task_ids_json": [
            str(task_id)
            for task_id in (row.get("task_ids_json") or [])
            if isinstance(task_id, str)
        ],
        "notes": _sanitize_public_text(row.get("notes"), workspace_root),
        "archived_at": row.get("archived_at"),
        "archived_by": None,
        "archive_note": _sanitize_public_text(row.get("archive_note"), workspace_root),
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def _ensure_run_exists(repository: LoopStateRepository, run_id: str) -> dict[str, Any]:
    try:
        return repository.get_run(run_id)
    except ValueError as exc:
        if str(exc).startswith("Unknown run_id:"):
            raise FileNotFoundError(str(exc)) from exc
        raise


__all__ = [
    "_conversation_messages",
    "_conversation_rooms",
    "_ensure_run_exists",
    "_public_actor_label",
    "_public_operator_workspace",
    "_relative_display_path",
    "build_run_detail_payload",
    "build_runs_payload",
]
