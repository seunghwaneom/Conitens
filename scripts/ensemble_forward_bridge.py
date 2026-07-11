#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ensemble_agent_registry import agent_list, agent_show
from ensemble_forward import build_runtime_cli_checks
import ensemble_forward_bridge_http as _http
import ensemble_forward_bridge_query as _query
from ensemble_forward_bridge_commands import CommandResult, dispatch_command
from ensemble_forward_bridge_stream import _stream_snapshot_payload, serialize_sse_event


class ForwardBridgeFacadePayloadError(TypeError):
    pass


build_approval_detail_payload = _query.build_approval_detail_payload
build_operator_task_detail_payload = _query.build_operator_task_detail_payload
build_operator_tasks_payload = _query.build_operator_tasks_payload
build_operator_workspace_detail_payload = _query.build_operator_workspace_detail_payload
build_operator_workspaces_payload = _query.build_operator_workspaces_payload
build_operator_doctor_evidence_payload = _query.build_operator_doctor_evidence_payload
build_operator_evidence_summary_payload = _query.build_operator_evidence_summary_payload
build_operator_inbox_payload = _query.build_operator_inbox_payload
build_operator_agents_payload = _query.build_operator_agents_payload
build_operator_status_confidence_payload = _query.build_operator_status_confidence_payload
build_operator_turn_records_payload = _query.build_operator_turn_records_payload
build_operator_workflow_contracts_payload = _query.build_operator_workflow_contracts_payload
build_operator_pr_ci_evidence_payload = _query.build_operator_pr_ci_evidence_payload
build_operator_task_reconcile_preview_payload = _query.build_operator_task_reconcile_preview_payload
build_approvals_payload = _query.build_approvals_payload
build_run_context_latest_payload = _query.build_run_context_latest_payload
build_run_detail_payload = _query.build_run_detail_payload
build_run_state_docs_payload = _query.build_run_state_docs_payload
build_runs_payload = _query.build_runs_payload
build_threads_payload = _query.build_threads_payload
build_thread_search_payload = _query.build_thread_search_payload
build_thread_detail_payload = _query.build_thread_detail_payload
build_room_timeline_payload = _query.build_room_timeline_payload


def build_operator_runtime_roster_payload(
    workspace: str | Path,
    *,
    probe_versions: bool = True,
    runtime_id: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    return _query.build_operator_runtime_roster_payload(
        workspace,
        probe_versions=probe_versions,
        runtime_id=runtime_id,
        category=category,
        runtime_checks_builder=build_runtime_cli_checks,
    )


def build_operator_wake_readiness_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    return _query.build_operator_wake_readiness_payload(
        workspace,
        task_id=task_id,
        run_id=run_id,
        room_id=room_id,
        limit=limit,
        runtime_checks_builder=build_runtime_cli_checks,
    )


def build_operator_summary_payload(workspace: str | Path) -> dict[str, Any]:
    return _query.build_operator_summary_payload(
        workspace,
        runtime_checks_builder=build_runtime_cli_checks,
    )


def _command_payload(result: CommandResult | None) -> dict[str, Any]:
    if result is None:
        raise LookupError("Forward Bridge command adapter did not match a route.")
    payload = result.payload
    if 200 <= result.status < 300:
        if isinstance(payload, dict):
            return payload
        raise ForwardBridgeFacadePayloadError(
            f"Forward Bridge command returned {type(payload).__name__}, expected a mapping."
        )

    message = str(payload.get("error") or "Forward Bridge command failed.") if isinstance(payload, dict) else str(payload)
    if result.status == 404 or "not found" in message.casefold():
        raise FileNotFoundError(message)
    if result.status == 409:
        raise RuntimeError(message)
    raise ValueError(message)


def delete_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    result = dispatch_command(
        "DELETE",
        f"/api/operator/tasks/{quote(task_id, safe='')}",
        {},
        workspace=workspace,
        reviewer_identity="forward-bridge-facade",
    )
    return _command_payload(result)


def detach_operator_task_workspace_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    result = dispatch_command(
        "POST",
        f"/api/operator/tasks/{quote(task_id, safe='')}/detach-workspace",
        {},
        workspace=workspace,
        reviewer_identity="forward-bridge-facade",
    )
    return _command_payload(result)


def archive_operator_task_payload(
    workspace: str | Path,
    task_id: str,
    *,
    actor: str,
    archive_note: str,
) -> dict[str, Any]:
    result = dispatch_command(
        "POST",
        f"/api/operator/tasks/{quote(task_id, safe='')}/archive",
        {"archive_note": archive_note},
        workspace=workspace,
        reviewer_identity=actor,
    )
    return _command_payload(result)


def restore_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    result = dispatch_command(
        "POST",
        f"/api/operator/tasks/{quote(task_id, safe='')}/restore",
        {},
        workspace=workspace,
        reviewer_identity="forward-bridge-facade",
    )
    return _command_payload(result)


def request_operator_task_approval(
    workspace: str | Path,
    *,
    task_id: str,
    actor: str,
    rationale: str | None = None,
    requested_changes: list[str] | None = None,
    draft_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = dispatch_command(
        "POST",
        f"/api/operator/tasks/{quote(task_id, safe='')}/request-approval",
        {
            "rationale": rationale,
            "requested_changes": requested_changes or [],
            "draft_snapshot": draft_snapshot or {},
        },
        workspace=workspace,
        reviewer_identity=actor,
    )
    approval = _command_payload(result).get("approval")
    if not isinstance(approval, dict):
        raise ForwardBridgeFacadePayloadError(
            f"Forward Bridge approval command returned {type(approval).__name__}, expected a mapping."
        )
    return approval


def launch_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    reviewer_identity: str | None = None,
) -> dict[str, Any]:
    return _http.launch_forward_bridge(
        workspace,
        host=host,
        port=port,
        reviewer_identity=reviewer_identity,
        bindings=lambda: sys.modules[__name__],
    )


def run_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    once: bool = False,
    reviewer_identity: str | None = None,
) -> dict[str, Any]:
    return _http.run_forward_bridge(
        workspace,
        host=host,
        port=port,
        once=once,
        reviewer_identity=reviewer_identity,
        bindings=lambda: sys.modules[__name__],
    )


__all__ = [
    "_stream_snapshot_payload",
    "archive_operator_task_payload",
    "build_approval_detail_payload",
    "build_approvals_payload",
    "build_operator_agents_payload",
    "build_operator_doctor_evidence_payload",
    "build_operator_evidence_summary_payload",
    "build_operator_inbox_payload",
    "build_operator_pr_ci_evidence_payload",
    "build_operator_runtime_roster_payload",
    "build_operator_status_confidence_payload",
    "build_operator_summary_payload",
    "build_operator_task_detail_payload",
    "build_operator_task_reconcile_preview_payload",
    "build_operator_tasks_payload",
    "build_operator_turn_records_payload",
    "build_operator_wake_readiness_payload",
    "build_operator_workflow_contracts_payload",
    "build_operator_workspace_detail_payload",
    "build_operator_workspaces_payload",
    "build_room_timeline_payload",
    "build_run_context_latest_payload",
    "build_run_detail_payload",
    "build_run_state_docs_payload",
    "build_runs_payload",
    "build_thread_detail_payload",
    "build_thread_search_payload",
    "build_threads_payload",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "launch_forward_bridge",
    "request_operator_task_approval",
    "restore_operator_task_payload",
    "run_forward_bridge",
    "serialize_sse_event",
]
