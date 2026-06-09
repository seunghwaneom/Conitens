#!/usr/bin/env python3
"""Pure decision helpers for read-only operator task reconciliation previews."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any


DEFAULT_STALE_RUN_AGE_HOURS = 6


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_iso(ts: datetime | None = None) -> str:
    value = ts or _utc_now()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_utc_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _decision_id(snapshot: dict[str, Any]) -> str:
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str)
    return "reconcile-" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


def _pending_approvals_for_task(approvals: list[dict[str, Any]], task_id: str) -> list[dict[str, Any]]:
    return [
        row
        for row in approvals
        if str(row.get("status") or "pending") == "pending" and str(row.get("task_id") or "") == task_id
    ]


def _pending_approvals_for_run(
    approvals: list[dict[str, Any]],
    *,
    run_id: str,
    task_id: str,
) -> list[dict[str, Any]]:
    return [
        row
        for row in approvals
        if str(row.get("status") or "pending") == "pending"
        and str(row.get("run_id") or "") == run_id
        and str(row.get("task_id") or "") != task_id
    ]


def reconcile_operator_task(
    task: dict[str, Any],
    *,
    linked_run: dict[str, Any] | None = None,
    approvals: list[dict[str, Any]] | None = None,
    validator_history: list[dict[str, Any]] | None = None,
    handoffs: list[dict[str, Any]] | None = None,
    stale_age_hours: int = DEFAULT_STALE_RUN_AGE_HOURS,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return a read-only reconciliation recommendation for one operator task."""

    approvals = approvals or []
    validator_history = validator_history or []
    handoffs = handoffs or []
    now_value = now or _utc_now()
    if now_value.tzinfo is None:
        now_value = now_value.replace(tzinfo=timezone.utc)

    task_id = str(task.get("task_id") or "")
    current_status = str(task.get("status") or "todo")
    blockers: list[str] = []
    suggested_actions: list[str] = []
    evidence_refs: list[str] = [f"operator_task:{task_id}"]
    requires_approval = False
    recommended_status = current_status

    if task.get("archived_at"):
        blockers.append("task is archived")
        suggested_actions.append("restore the task before requesting new execution work")
        result = {
            "generated_at": _utc_iso(now_value),
            "task_id": task_id,
            "current_status": current_status,
            "recommended_status": recommended_status,
            "confidence": "high",
            "summary": "Archived tasks are intentionally read-only until restored.",
            "requires_approval": False,
            "blockers": blockers,
            "suggested_actions": suggested_actions,
            "evidence_refs": evidence_refs,
        }
        result["decision_id"] = _decision_id({key: value for key, value in result.items() if key != "generated_at"})
        return result

    pending_task_approvals = _pending_approvals_for_task(approvals, task_id)
    if pending_task_approvals:
        requires_approval = True
        recommended_status = "blocked"
        blockers.append("task has pending approval requests")
        suggested_actions.append("review the pending task approval before changing status")
        evidence_refs.extend([f"approval:{row['request_id']}" for row in pending_task_approvals[:4] if row.get("request_id")])

    linked_run_id = str(task.get("linked_run_id") or "")
    if linked_run_id:
        evidence_refs.append(f"run:{linked_run_id}")
        if linked_run is None:
            recommended_status = "blocked"
            blockers.append(f"linked run {linked_run_id} was not found")
            suggested_actions.append("repair or remove the stale linked run reference")
        else:
            pending_run_approvals = _pending_approvals_for_run(
                approvals,
                run_id=linked_run_id,
                task_id=task_id,
            )
            if pending_run_approvals:
                requires_approval = True
                recommended_status = "blocked"
                blockers.append(f"linked run {linked_run_id} has pending approvals")
                suggested_actions.append("clear linked run approvals before resuming this task")
                evidence_refs.extend(
                    [f"approval:{row['request_id']}" for row in pending_run_approvals[:4] if row.get("request_id")]
                )

            if validator_history:
                latest_validator = validator_history[-1]
                if latest_validator.get("id") is not None:
                    evidence_refs.append(f"validator:{linked_run_id}:{latest_validator['id']}")
                if not bool(latest_validator.get("passed")):
                    recommended_status = "blocked"
                    blockers.append(str(latest_validator.get("feedback_text") or "latest validator result failed"))
                    suggested_actions.append("inspect validator output and request a fix pass")
                elif recommended_status not in {"done", "cancelled"} and not blockers:
                    recommended_status = "in_review"
                    suggested_actions.append("review linked execution evidence before marking the task done")

            stale_at = _parse_utc_iso_timestamp(str(linked_run.get("updated_at") or ""))
            if stale_at and str(linked_run.get("status")) in {"active", "running"}:
                if now_value.astimezone(timezone.utc) - stale_at > timedelta(hours=stale_age_hours):
                    recommended_status = "blocked"
                    blockers.append(f"linked run has not updated since {linked_run['updated_at']}")
                    suggested_actions.append("inspect the linked run for stale execution state")

            blocked_handoffs = [row for row in handoffs if str(row.get("status") or "blocked") == "blocked"]
            if blocked_handoffs:
                recommended_status = "blocked"
                blockers.append(f"{len(blocked_handoffs)} linked handoff packet(s) are blocked")
                suggested_actions.append("resolve blocked handoff packets before closing the task")
                evidence_refs.extend([f"handoff:{row['handoff_id']}" for row in blocked_handoffs[:4] if row.get("handoff_id")])
    else:
        suggested_actions.append("link a run when this task moves into execution")

    confidence = "high" if blockers else ("medium" if linked_run_id else "low")
    summary = (
        "Reconciler recommends blocking the task until linked evidence is cleared."
        if blockers
        else "No blocking linked evidence was detected for this task."
    )
    result = {
        "generated_at": _utc_iso(now_value),
        "task_id": task_id,
        "current_status": current_status,
        "recommended_status": recommended_status,
        "confidence": confidence,
        "summary": summary,
        "requires_approval": requires_approval,
        "blockers": blockers,
        "suggested_actions": suggested_actions,
        "evidence_refs": evidence_refs[:12],
    }
    result["decision_id"] = _decision_id({key: value for key, value in result.items() if key != "generated_at"})
    return result


__all__ = [
    "DEFAULT_STALE_RUN_AGE_HOURS",
    "reconcile_operator_task",
]
