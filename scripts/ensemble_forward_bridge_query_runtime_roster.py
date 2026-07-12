#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_forward import build_runtime_cli_checks, sanitize_runtime_label
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository, utc_iso
from ensemble_forward_bridge_query_harness_evidence import _harness_evidence_event_rows
from ensemble_forward_bridge_query_provider_metrics import _first_text_metric, _walk_dicts
from ensemble_forward_bridge_query_runtime_helpers import (
    _runtime_operator_hint,
    _runtime_roster_ux_summary,
    _validate_runtime_roster_category,
    _validate_runtime_roster_runtime_id,
)
from ensemble_forward_bridge_query_shared import (
    RUNTIME_ROSTER_AGENT_RUNTIME_IDS,
    RUNTIME_ROSTER_TOOLCHAIN_IDS,
    RuntimeChecksBuilder,
    _status_from_counts,
)

def build_operator_runtime_roster_payload(
    workspace: str | Path,
    *,
    probe_versions: bool = True,
    runtime_id: str | None = None,
    category: str | None = None,
    runtime_checks_builder: RuntimeChecksBuilder = build_runtime_cli_checks,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    safe_runtime_id = _validate_runtime_roster_runtime_id(runtime_id)
    safe_category = _validate_runtime_roster_category(category)
    runtime_checks = {check["id"]: check for check in runtime_checks_builder(probe_versions=probe_versions)}
    checkpoints = repository.list_orchestration_checkpoints()
    provider_observations: dict[str, dict[str, Any]] = {}

    for checkpoint in checkpoints:
        metrics = checkpoint.get("loop_cost_metrics_json")
        if not isinstance(metrics, dict) or not metrics:
            continue
        for row in _walk_dicts(metrics):
            provider = sanitize_runtime_label(_first_text_metric(row, ("provider", "provider_id", "runtime", "adapter")))
            if not provider:
                continue
            provider_id = provider.lower()
            observation = provider_observations.setdefault(
                provider_id,
                {
                    "count": 0,
                    "latest_seen_at": None,
                    "latest_run_id": None,
                    "evidence_refs": [],
                },
            )
            observation["count"] += 1
            observation["latest_seen_at"] = checkpoint.get("created_at")
            observation["latest_run_id"] = checkpoint.get("run_id")
            if len(observation["evidence_refs"]) < 4:
                observation["evidence_refs"].append(
                    f"orchestration_checkpoint:{checkpoint['run_id']}:{checkpoint['graph_kind']}:{checkpoint['id']}"
                )

    harness_rows, _harness_evidence_refs = _harness_evidence_event_rows(workspace)
    for row in harness_rows:
        runtime = row.get("runtime")
        if not isinstance(runtime, str) or not runtime:
            continue
        observation = provider_observations.setdefault(
            runtime,
            {
                "count": 0,
                "latest_seen_at": None,
                "latest_run_id": None,
                "evidence_refs": [],
            },
        )
        observation["count"] += 1
        observation["latest_seen_at"] = row.get("observed_at")
        observation["latest_run_id"] = row.get("run_id")
        if len(observation["evidence_refs"]) < 4:
            observation["evidence_refs"].append(row["event_ref"])

    runtimes: list[dict[str, Any]] = []
    for current_runtime_id in (*RUNTIME_ROSTER_AGENT_RUNTIME_IDS, *RUNTIME_ROSTER_TOOLCHAIN_IDS):
        check = runtime_checks.get(current_runtime_id)
        if check is None:
            continue
        observation = provider_observations.get(current_runtime_id)
        if observation:
            session_status = "observed"
        elif check["available"]:
            session_status = "available_not_observed"
        else:
            session_status = "not_found"
        current_category = "agent_runtime" if current_runtime_id in RUNTIME_ROSTER_AGENT_RUNTIME_IDS else "toolchain"
        runtimes.append(
            {
                "id": current_runtime_id,
                "label": check["label"],
                "category": current_category,
                "availability_status": check["status"],
                "session_status": session_status,
                "command": check["command"],
                "available": check["available"],
                "version": check.get("version"),
                "detail": check["detail"],
                "latest_seen_at": observation["latest_seen_at"] if observation else None,
                "latest_run_id": observation["latest_run_id"] if observation else None,
                "observation_count": observation["count"] if observation else 0,
                "evidence_refs": observation["evidence_refs"] if observation else [],
            }
        )

    all_runtimes = list(runtimes)
    if safe_category:
        runtimes = [runtime for runtime in runtimes if runtime["category"] == safe_category]
    if safe_runtime_id:
        runtimes = [runtime for runtime in runtimes if runtime["id"] == safe_runtime_id]

    available_count = sum(1 for item in runtimes if item["available"])
    observed_count = sum(1 for item in runtimes if item["session_status"] == "observed")
    missing_agent_count = sum(
        1 for item in runtimes if item["category"] == "agent_runtime" and not item["available"]
    )
    warning_count = missing_agent_count + sum(1 for item in runtimes if item["availability_status"] == "warning")
    operator_hints = [_runtime_operator_hint(runtime) for runtime in runtimes]
    return {
        "generated_at": utc_iso(),
        "status": _status_from_counts(danger=0, warning=warning_count),
        "scope": {
            "runtime_id": safe_runtime_id,
            "category": safe_category,
            "probe_versions": probe_versions,
        },
        "runtimes": runtimes,
        "counts": {
            "total": len(runtimes),
            "agent_runtimes": sum(1 for item in runtimes if item["category"] == "agent_runtime"),
            "toolchains": sum(1 for item in runtimes if item["category"] == "toolchain"),
            "available": available_count,
            "observed": observed_count,
            "missing_agent_runtimes": missing_agent_count,
            "all_total": len(all_runtimes),
            "all_agent_runtimes": sum(1 for item in all_runtimes if item["category"] == "agent_runtime"),
        },
        "ux_summary": _runtime_roster_ux_summary(
            runtimes,
            probe_versions=probe_versions,
            runtime_id=safe_runtime_id,
            category=safe_category,
        ),
        "operator_hints": operator_hints,
        "privacy": {
            "environment_dumped": False,
            "auth_tokens_exposed": False,
            "provider_auth_commands_executed": False,
            "raw_session_content_exposed": False,
            "detail": (
                "Roster uses bounded command/version probes and orchestration checkpoint metadata only."
                if probe_versions
                else "Summary roster uses bounded command availability checks and orchestration checkpoint metadata only."
            ),
        },
    }


__all__ = ["build_operator_runtime_roster_payload"]
