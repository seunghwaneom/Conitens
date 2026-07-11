#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_forward import build_runtime_cli_checks
from ensemble_loop_repository import utc_iso
from ensemble_forward_bridge_query_runtime_roster import build_operator_runtime_roster_payload
from ensemble_forward_bridge_query_shared import (
    RuntimeChecksBuilder,
    WAKE_READINESS_DEFAULT_LIMIT,
    WAKE_READINESS_MAX_LIMIT,
    _status_from_counts,
)
from ensemble_forward_bridge_query_status_rooms import build_operator_status_confidence_payload
from ensemble_forward_bridge_query_turn_records import build_operator_turn_records_payload

def _bounded_wake_readiness_limit(limit: int | None) -> int:
    if limit is None:
        return WAKE_READINESS_DEFAULT_LIMIT
    return max(1, min(int(limit), WAKE_READINESS_MAX_LIMIT))


def _wake_turn_record_matches(row: dict[str, Any], record: dict[str, Any]) -> bool:
    subject_type = str(row.get("subject_type") or "")
    subject_id = str(row.get("subject_id") or "")
    linked_refs = row.get("linked_refs") if isinstance(row.get("linked_refs"), dict) else {}
    if subject_type == "run":
        return str(record.get("run_id") or "") == subject_id
    if subject_type == "room":
        return str(record.get("room_id") or "") == subject_id
    if subject_type == "task":
        linked_run_id = str(linked_refs.get("run_id") or "")
        linked_room_ids = {str(item) for item in linked_refs.get("room_ids", []) if isinstance(item, str)}
        return bool(
            (linked_run_id and str(record.get("run_id") or "") == linked_run_id)
            or (str(record.get("room_id") or "") in linked_room_ids)
        )
    return False


def _wake_turn_summary(row: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    matched = [record for record in records if _wake_turn_record_matches(row, record)]
    signals = row.get("signals") if isinstance(row.get("signals"), dict) else {}
    fallback_messages = int(signals.get("messages") or signals.get("room_messages") or 0)
    fallback_tool_events = int(signals.get("tool_events") or signals.get("room_tool_events") or 0)
    messages = sum(1 for record in matched if record.get("record_type") == "message") or fallback_messages
    tool_events = sum(1 for record in matched if record.get("record_type") == "tool_event") or fallback_tool_events
    return {
        "records": len(matched) or messages + tool_events,
        "messages": messages,
        "tool_events": tool_events,
        "agent_messages": sum(1 for record in matched if record.get("record_type") == "message" and record.get("actor_kind") == "agent"),
        "evidence_refs": [str(ref) for record in matched for ref in record.get("evidence_refs", [])][:8],
    }


def _wake_readiness_for_row(
    row: dict[str, Any],
    *,
    preferred_runtime: str | None,
    runtime_available: bool,
    turn_summary: dict[str, Any],
) -> tuple[str, list[str], list[str]]:
    flags = set(str(flag) for flag in row.get("attention_flags", []))
    confidence_level = str(row.get("confidence_level") or "")
    blockers: list[str] = []
    suggested_actions: list[str] = []

    if "pending_approval" in flags:
        blockers.append("pending_approval")
        suggested_actions.append("Review the pending approval before waking or resuming work.")
    if "blocked" in flags:
        blockers.append("blocked_handoff_or_status")
        suggested_actions.append("Inspect blocked task or handoff evidence before resuming.")
    if blockers:
        suggested_actions.append("Use status-confidence for the exact reason codes and evidence refs.")
        return "hold", blockers[:5], suggested_actions[:5]

    if not preferred_runtime and not runtime_available:
        blockers.append("no_agent_runtime_ready")
        suggested_actions.append("Install or configure an agent runtime before considering wake scheduling.")
        return "wait_for_runtime", blockers, suggested_actions

    if confidence_level == "stale":
        blockers.append("stale_status_evidence")
        suggested_actions.append("Inspect the stale run, room, or task before waking it.")
        return "attention", blockers, suggested_actions

    if confidence_level == "partial":
        suggested_actions.append("Review missing or unverified evidence before handing work back to an agent.")
        return "needs_review", blockers, suggested_actions

    if int(turn_summary.get("records") or 0) > 0 or row.get("evidence_refs"):
        suggested_actions.append(
            f"Ready for operator-reviewed wake planning with {preferred_runtime or 'an approved runtime'}."
        )
        return "ready", blockers, suggested_actions

    blockers.append("missing_context")
    suggested_actions.append("Attach run, room, or validator evidence before wake planning.")
    return "needs_context", blockers, suggested_actions


def _wake_candidate(row: dict[str, Any], runtime_summary: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    preferred_runtime = runtime_summary.get("preferred_agent_runtime")
    runtime_available = bool(
        runtime_summary.get("observed_agent_runtimes")
        or runtime_summary.get("available_agent_runtimes")
        or runtime_summary.get("available_unobserved_agent_runtimes")
    )
    turn_summary = _wake_turn_summary(row, records)
    readiness, blockers, suggested_actions = _wake_readiness_for_row(
        row,
        preferred_runtime=preferred_runtime if isinstance(preferred_runtime, str) else None,
        runtime_available=runtime_available,
        turn_summary=turn_summary,
    )
    subject_type = str(row.get("subject_type") or "")
    subject_id = str(row.get("subject_id") or "")
    return {
        "decision_id": f"wake:{subject_type}:{subject_id}:{readiness}:{row.get('confidence_level')}",
        "subject_type": subject_type,
        "subject_id": subject_id,
        "current_status": row.get("status"),
        "readiness": readiness,
        "confidence_level": row.get("confidence_level"),
        "confidence_score": row.get("confidence_score"),
        "attention_flags": row.get("attention_flags") or [],
        "reason_codes": row.get("reason_codes") or [],
        "blockers": blockers,
        "suggested_actions": suggested_actions,
        "requires_approval": readiness == "hold" or "pending_approval" in (row.get("attention_flags") or []),
        "preferred_agent_runtime": preferred_runtime,
        "linked_refs": row.get("linked_refs") or {},
        "turn_summary": turn_summary,
        "signal_counts": row.get("signals") or {},
        "evidence_refs": list(dict.fromkeys((row.get("evidence_refs") or []) + turn_summary.get("evidence_refs", [])))[:12],
    }


def build_operator_wake_readiness_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
    runtime_checks_builder: RuntimeChecksBuilder = build_runtime_cli_checks,
) -> dict[str, Any]:
    safe_limit = _bounded_wake_readiness_limit(limit)
    status_payload = build_operator_status_confidence_payload(
        workspace,
        task_id=task_id,
        run_id=run_id,
        room_id=room_id,
        limit=safe_limit,
    )
    turn_payload = build_operator_turn_records_payload(workspace, run_id=run_id, room_id=room_id, limit=safe_limit)
    runtime_payload = build_operator_runtime_roster_payload(
        workspace,
        probe_versions=False,
        category="agent_runtime",
        runtime_checks_builder=runtime_checks_builder,
    )
    runtime_summary = runtime_payload.get("ux_summary") if isinstance(runtime_payload.get("ux_summary"), dict) else {}
    records = turn_payload.get("records") if isinstance(turn_payload.get("records"), list) else []
    candidates = [
        _wake_candidate(row, runtime_summary, records)
        for row in status_payload.get("diagnostics", [])
        if isinstance(row, dict)
    ]
    readiness_counts = {
        "ready": sum(1 for row in candidates if row["readiness"] == "ready"),
        "needs_review": sum(1 for row in candidates if row["readiness"] == "needs_review"),
        "attention": sum(1 for row in candidates if row["readiness"] == "attention"),
        "hold": sum(1 for row in candidates if row["readiness"] == "hold"),
        "wait_for_runtime": sum(1 for row in candidates if row["readiness"] == "wait_for_runtime"),
        "needs_context": sum(1 for row in candidates if row["readiness"] == "needs_context"),
    }
    warning_count = (
        readiness_counts["needs_review"]
        + readiness_counts["attention"]
        + readiness_counts["hold"]
        + readiness_counts["wait_for_runtime"]
        + readiness_counts["needs_context"]
    )
    return {
        "generated_at": utc_iso(),
        "status": _status_from_counts(danger=0, warning=warning_count),
        "scope": {
            "task_id": task_id,
            "run_id": run_id,
            "room_id": room_id,
            "limit": safe_limit,
        },
        "candidates": candidates,
        "counts": {
            "returned": len(candidates),
            "total": status_payload.get("counts", {}).get("total", len(candidates)),
            **readiness_counts,
            "truncated": bool(status_payload.get("counts", {}).get("truncated")),
        },
        "source_projections": {
            "status_confidence": {
                "status": status_payload.get("status"),
                "returned": status_payload.get("counts", {}).get("returned"),
                "total": status_payload.get("counts", {}).get("total"),
            },
            "turn_records": {
                "status": turn_payload.get("status"),
                "returned": turn_payload.get("counts", {}).get("returned"),
                "total": turn_payload.get("counts", {}).get("total"),
            },
            "runtime_roster": {
                "status": runtime_payload.get("status"),
                "preferred_agent_runtime": runtime_summary.get("preferred_agent_runtime"),
                "observed_agent_runtimes": runtime_summary.get("observed_agent_runtimes") or [],
                "available_unobserved_agent_runtimes": runtime_summary.get("available_unobserved_agent_runtimes") or [],
                "missing_agent_runtimes": runtime_summary.get("missing_agent_runtimes") or [],
            },
        },
        "wake_contract": {
            "read_only": True,
            "scheduler_started": False,
            "wake_messages_sent": False,
            "task_status_mutated": False,
            "run_status_mutated": False,
            "room_status_mutated": False,
            "provider_auth_commands_executed": False,
            "external_fetch_performed": False,
        },
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_values_exposed": False,
            "approval_payload_values_exposed": False,
            "validator_issue_details_exposed": False,
            "raw_transcript_exposed": False,
            "detail": "Wake readiness combines metadata-only projections and does not schedule, resume, mutate, or expose raw content.",
        },
    }


__all__ = ["build_operator_wake_readiness_payload"]
