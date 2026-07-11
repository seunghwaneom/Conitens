#!/usr/bin/env python3
from __future__ import annotations

from typing import Any

from ensemble_forward_bridge_query_shared import (
    QueryValidationError,
    RUNTIME_ROSTER_AGENT_RUNTIME_IDS,
    RUNTIME_ROSTER_CATEGORIES,
    RUNTIME_ROSTER_TOOLCHAIN_IDS,
)

def _validate_runtime_roster_category(category: str | None) -> str | None:
    if category is None:
        return None
    safe_category = category.strip()
    if not safe_category:
        return None
    if safe_category not in RUNTIME_ROSTER_CATEGORIES:
        raise QueryValidationError(f"Unsupported runtime roster category: {safe_category}")
    return safe_category


def _validate_runtime_roster_runtime_id(runtime_id: str | None) -> str | None:
    if runtime_id is None:
        return None
    safe_runtime_id = runtime_id.strip().lower()
    if not safe_runtime_id:
        return None
    allowed = set(RUNTIME_ROSTER_AGENT_RUNTIME_IDS + RUNTIME_ROSTER_TOOLCHAIN_IDS)
    if safe_runtime_id not in allowed:
        raise QueryValidationError(f"Unsupported runtime id: {safe_runtime_id}")
    return safe_runtime_id


def _runtime_operator_hint(runtime: dict[str, Any]) -> dict[str, Any]:
    runtime_id = str(runtime.get("id") or "")
    category = str(runtime.get("category") or "")
    available = bool(runtime.get("available"))
    observed = runtime.get("session_status") == "observed"
    if category == "agent_runtime":
        if observed:
            hint = "Runtime has local CLI presence or prior checkpoint evidence and can be considered for routed work."
            readiness = "observed"
        elif available:
            hint = "Runtime CLI is available but has no provider checkpoint evidence in this workspace yet."
            readiness = "available_unobserved"
        else:
            hint = "Runtime CLI is not found on PATH; do not route work to it until installed or configured."
            readiness = "missing"
    else:
        if available:
            hint = "Toolchain command is available for local support operations."
            readiness = "available"
        else:
            hint = "Toolchain command is missing; related local operations may fail."
            readiness = "missing"
    return {
        "runtime_id": runtime_id,
        "category": category,
        "readiness": readiness,
        "hint": hint,
        "evidence_refs": runtime.get("evidence_refs") or [],
    }


def _runtime_roster_ux_summary(
    runtimes: list[dict[str, Any]],
    *,
    probe_versions: bool,
    runtime_id: str | None,
    category: str | None,
) -> dict[str, Any]:
    agent_runtimes = [runtime for runtime in runtimes if runtime["category"] == "agent_runtime"]
    observed_agent_ids = [runtime["id"] for runtime in agent_runtimes if runtime["session_status"] == "observed"]
    available_agent_ids = [runtime["id"] for runtime in agent_runtimes if runtime["available"]]
    missing_agent_ids = [runtime["id"] for runtime in agent_runtimes if not runtime["available"]]
    available_unobserved_ids = [
        runtime["id"]
        for runtime in agent_runtimes
        if runtime["available"] and runtime["session_status"] == "available_not_observed"
    ]
    preferred = observed_agent_ids[0] if observed_agent_ids else (available_agent_ids[0] if available_agent_ids else None)
    next_actions: list[str] = []
    if missing_agent_ids:
        next_actions.append("Install or configure only the missing agent runtimes you actually plan to route work to.")
    if available_unobserved_ids:
        next_actions.append("Use normal approved provider work to create checkpoint evidence before relying on routing.")
    if not agent_runtimes and category == "toolchain":
        next_actions.append("Remove the toolchain filter to compare agent CLI runtimes.")
    if not probe_versions:
        next_actions.append("Omit --no-version-probe when bounded first-line versions are useful.")
    if runtime_id:
        next_actions.append("Remove --runtime to compare the full roster.")
    if not next_actions:
        next_actions.append("Roster is ready for read-only operator review.")
    return {
        "filter_active": bool(runtime_id or category),
        "preferred_agent_runtime": preferred,
        "observed_agent_runtimes": observed_agent_ids,
        "available_agent_runtimes": available_agent_ids,
        "available_unobserved_agent_runtimes": available_unobserved_ids,
        "missing_agent_runtimes": missing_agent_ids,
        "next_actions": next_actions[:5],
    }


__all__ = [
    "_runtime_operator_hint",
    "_runtime_roster_ux_summary",
    "_validate_runtime_roster_category",
    "_validate_runtime_roster_runtime_id",
]
