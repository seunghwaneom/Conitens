#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any

from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository, utc_iso
from ensemble_forward_bridge_query_core import _public_operator_workspace, _relative_display_path
from ensemble_forward_bridge_query_harness_evidence import (
    _harness_evidence_event_rows,
    _summarize_harness_evidence_rows,
    _summarize_provider_metric_rows,
)
from ensemble_forward_bridge_query_pr_ci_evidence import build_operator_pr_ci_evidence_payload
from ensemble_forward_bridge_query_provider_metrics import _provider_call_event_metric_rows, _walk_dicts
from ensemble_forward_bridge_query_shared import (
    _status_from_counts,
)

def _derive_workspace_task_ids(repository: LoopStateRepository, workspace_id: str) -> list[str]:
    return sorted(
        task["task_id"]
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    )


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
    return {"task": task, "pr_ci_evidence": build_operator_pr_ci_evidence_payload(workspace, task)}


def build_operator_workspaces_payload(
    workspace: str | Path,
    *,
    status: str | None = None,
    owner_agent_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    workspace_root = Path(workspace)
    workspaces = [
        _public_operator_workspace(
            {
                **row,
                "task_ids_json": _derive_workspace_task_ids(repository, str(row["workspace_id"])),
            },
            workspace_root,
        )
        for row in repository.list_operator_workspaces(status=status, owner_agent_id=owner_agent_id)
    ]
    return {"workspaces": workspaces, "count": len(workspaces)}


def build_operator_workspace_detail_payload(workspace: str | Path, workspace_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    workspace_root = Path(workspace)
    operator_workspace = repository.get_operator_workspace(workspace_id)
    if operator_workspace is None:
        raise FileNotFoundError(f"Operator workspace not found: {workspace_id}")
    return {
        "workspace": _public_operator_workspace(
            {
                **operator_workspace,
                "task_ids_json": _derive_workspace_task_ids(repository, workspace_id),
            },
            workspace_root,
        ),
    }


def build_operator_evidence_summary_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    checkpoints = repository.list_orchestration_checkpoints()
    retry_decisions = [
        decision
        for run in repository.list_runs()
        for decision in repository.list_retry_decisions(run_id=str(run["run_id"]))
    ]

    checkpoint_metric_rows: list[dict[str, Any]] = []
    checkpoint_evidence_refs: list[str] = []
    for checkpoint in checkpoints:
        metrics = checkpoint.get("loop_cost_metrics_json")
        if not isinstance(metrics, dict) or not metrics:
            continue
        checkpoint_metric_rows.extend(_walk_dicts(metrics))
        checkpoint_evidence_refs.append(
            f"orchestration_checkpoint:{checkpoint['run_id']}:{checkpoint['graph_kind']}:{checkpoint['id']}"
        )

    event_metric_rows, event_evidence_refs = _provider_call_event_metric_rows(workspace)
    harness_rows, harness_evidence_refs = _harness_evidence_event_rows(workspace)
    if event_metric_rows:
        source = "event_log"
        metric_rows = event_metric_rows
        evidence_refs = event_evidence_refs + checkpoint_evidence_refs + harness_evidence_refs
    else:
        source = "checkpoint"
        metric_rows = checkpoint_metric_rows
        evidence_refs = checkpoint_evidence_refs + harness_evidence_refs

    provider_summary = _summarize_provider_metric_rows(metric_rows)
    harness_summary = _summarize_harness_evidence_rows(harness_rows)

    pending_checkpoint_count = sum(1 for checkpoint in checkpoints if checkpoint.get("approval_pending"))

    return {
        "generated_at": utc_iso(),
        "provider_calls": {
            "observed": provider_summary["observed"],
            "source": source,
            "checkpoint_fallback_available": bool(checkpoint_metric_rows),
            "with_cost": provider_summary["with_cost"],
            "with_tokens": provider_summary["with_tokens"],
            "with_latency": provider_summary["with_latency"],
            "estimated_cost": provider_summary["estimated_cost"],
            "total_tokens": provider_summary["total_tokens"],
            "tool_calls_count": provider_summary["tool_calls_count"],
            "latest_provider": provider_summary["latest_provider"],
            "latest_model": provider_summary["latest_model"],
        },
        "budget": {
            "sources": len(evidence_refs),
            "event_log_sources": len(event_evidence_refs),
            "checkpoint_sources": len(checkpoint_evidence_refs),
            "harness_sources": len(harness_evidence_refs),
            "retry_decisions": len(retry_decisions),
            "approval_pending": pending_checkpoint_count,
        },
        "harness": harness_summary,
        "sensitivity": {
            "pii_findings": provider_summary["pii_findings"],
            "raw_content_exposed": False,
            "redaction": "forward projection omits raw prompt, completion, request, response, transcript, and terminal output content",
        },
        "evidence_refs": evidence_refs[:12],
    }


def build_operator_doctor_evidence_payload(workspace: str | Path) -> dict[str, Any]:
    workspace_root = Path(workspace)
    repository = LoopStateRepository(workspace_root)
    db_path = repository.db_path
    checks: list[dict[str, Any]] = []

    def add_check(check_id: str, label: str, status: str, detail: str, evidence_ref: str) -> None:
        checks.append(
            {
                "id": check_id,
                "label": label,
                "status": status,
                "detail": detail,
                "evidence_ref": evidence_ref,
            }
        )

    add_check(
        "loop-state",
        "Loop state repository",
        "ok" if db_path.exists() else "warning",
        "SQLite loop state is available." if db_path.exists() else "SQLite loop state will be created on first forward write.",
        _relative_display_path(db_path, workspace_root),
    )
    add_check(
        "active-runtime-contract",
        "Active runtime contract",
        "ok",
        "Forward bridge remains a sidecar; current runtime truth stays scripts/ensemble.py plus .notes and .agent.",
        "CONITENS.md",
    )
    add_check(
        "python",
        "Python runtime",
        "ok" if Path(sys.executable).exists() else "warning",
        Path(sys.executable).name,
        _relative_display_path(Path(sys.executable), workspace_root),
    )
    add_check(
        "node",
        "Node runtime",
        "ok" if shutil.which("node") else "warning",
        "node is available on PATH" if shutil.which("node") else "node was not found on PATH",
        "PATH:node",
    )
    add_check(
        "dashboard-package",
        "Dashboard package",
        "ok" if (workspace_root / "packages" / "dashboard" / "package.json").exists() else "warning",
        "Dashboard package manifest is present." if (workspace_root / "packages" / "dashboard" / "package.json").exists() else "Dashboard package manifest is missing.",
        "packages/dashboard/package.json",
    )
    add_check(
        "bridge-auth",
        "Bridge auth boundary",
        "ok",
        "Read and write routes require loopback plus bearer authorization; this evidence payload does not include the bearer token.",
        "scripts/ensemble_forward_bridge.py",
    )
    add_check(
        "events-projection",
        "Event projection",
        "ok" if (workspace_root / ".notes" / "EVENTS" / "events.jsonl").exists() else "warning",
        "Append-only events projection is present." if (workspace_root / ".notes" / "EVENTS" / "events.jsonl").exists() else "No events projection found in this workspace.",
        ".notes/EVENTS/events.jsonl",
    )

    status = _status_from_counts(
        danger=sum(1 for check in checks if check["status"] == "danger"),
        warning=sum(1 for check in checks if check["status"] == "warning"),
    )
    return {
        "generated_at": utc_iso(),
        "status": status,
        "checks": checks,
    }


__all__ = [
    "build_operator_doctor_evidence_payload",
    "build_operator_evidence_summary_payload",
    "build_operator_task_detail_payload",
    "build_operator_tasks_payload",
    "build_operator_workspace_detail_payload",
    "build_operator_workspaces_payload",
]
