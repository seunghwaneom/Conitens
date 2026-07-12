#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from ensemble_events import load_events
from ensemble_loop_repository import utc_iso
from ensemble_forward_bridge_query_shared import (
    PR_CI_EVIDENCE_EVENT_TYPES,
    PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS,
    PR_EVIDENCE_EVENT_TYPE,
    _payload_key_variants,
    _safe_text,
    _status_from_counts,
)

def _safe_url(value: Any) -> str | None:
    text = _safe_text(value, max_length=500)
    if not text:
        return None
    try:
        parsed = urlsplit(text)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    netloc = parsed.hostname or ""
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))


def _short_commit_sha(value: Any) -> str | None:
    text = _safe_text(value, max_length=80)
    if not text:
        return None
    if len(text) >= 12 and all(char in "0123456789abcdefABCDEF" for char in text):
        return text[:12]
    return text[:40]


def _pr_ci_event_scope_matches(
    event: dict[str, Any],
    payload: dict[str, Any],
    *,
    task_id: str,
    linked_run_id: str | None,
) -> bool:
    scope = event.get("scope") if isinstance(event.get("scope"), dict) else {}
    candidate_task_ids = {
        str(payload.get("task_id") or ""),
        str(scope.get("task_id") or ""),
    }
    if task_id in candidate_task_ids:
        return True
    if linked_run_id:
        candidate_run_ids = {
            str(payload.get("run_id") or ""),
            str(payload.get("conitens_run_id") or ""),
            str(scope.get("run_id") or ""),
            str(scope.get("conitens_run_id") or ""),
        }
        return linked_run_id in candidate_run_ids
    return False


def _pr_ci_forbidden_payload_fields(payload: dict[str, Any]) -> list[str]:
    fields: list[str] = []
    forbidden_compact = {"".join(char for char in key if char.isalnum()) for key in PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS}
    for key in payload:
        normalized, compact = _payload_key_variants(key)
        if (
            normalized in PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS
            or compact in forbidden_compact
            or normalized.endswith("_log")
            or normalized.endswith("_logs")
            or normalized.endswith("_content")
            or normalized.endswith("_body")
            or normalized.endswith("_diff")
            or normalized.endswith("_patch")
            or compact.endswith("log")
            or compact.endswith("logs")
            or compact.endswith("content")
            or compact.endswith("body")
            or compact.endswith("diff")
            or compact.endswith("patch")
        ):
            fields.append(str(key))
    return fields


def _build_pr_ci_evidence_item(event: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    event_type = str(event.get("type") or "")
    kind = "pull_request" if event_type == PR_EVIDENCE_EVENT_TYPE else "ci"
    observed_at = (
        _safe_text(payload.get("observed_at"), max_length=80)
        or _safe_text(event.get("ts_utc"), max_length=80)
        or utc_iso()
    )
    status = _safe_text(payload.get("status"), max_length=80) or "unknown"
    conclusion = _safe_text(payload.get("conclusion"), max_length=80)
    title = (
        _safe_text(payload.get("title"), max_length=180)
        or _safe_text(payload.get("workflow"), max_length=180)
        or _safe_text(payload.get("job"), max_length=180)
        or ("Pull request evidence" if kind == "pull_request" else "CI evidence")
    )
    summary = _safe_text(payload.get("summary"), max_length=260)
    evidence_refs = []
    payload_refs = payload.get("evidence_refs")
    if isinstance(payload_refs, list):
        evidence_refs.extend(str(item)[:180] for item in payload_refs if isinstance(item, str) and item.strip())
    evidence_refs.append(f"event:{event_type}:{event.get('event_id') or 'unknown'}")
    return {
        "kind": kind,
        "evidence_id": str(event.get("event_id") or f"{event_type}:unknown"),
        "provider": _safe_text(payload.get("provider"), max_length=80) or ("github" if kind == "pull_request" else "ci"),
        "repository": _safe_text(payload.get("repository"), max_length=180),
        "title": title,
        "status": status,
        "conclusion": conclusion,
        "url": _safe_url(payload.get("url")),
        "branch": _safe_text(payload.get("branch"), max_length=120),
        "commit_sha": _short_commit_sha(payload.get("commit_sha")),
        "observed_at": observed_at,
        "summary": summary,
        "evidence_refs": evidence_refs[:6],
    }


def _pr_ci_item_is_failing(item: dict[str, Any]) -> bool:
    values = {str(item.get("status") or "").lower(), str(item.get("conclusion") or "").lower()}
    return bool(values & {"failure", "failed", "error", "cancelled", "timed_out", "action_required"})


def _pr_ci_item_is_pending(item: dict[str, Any]) -> bool:
    values = {str(item.get("status") or "").lower(), str(item.get("conclusion") or "").lower()}
    return bool(values & {"pending", "queued", "running", "in_progress", "waiting"})


def _pr_ci_item_is_successful(item: dict[str, Any]) -> bool:
    values = {str(item.get("status") or "").lower(), str(item.get("conclusion") or "").lower()}
    return bool(values & {"success", "successful", "passed", "green"})


def _pr_ci_item_is_merged(item: dict[str, Any]) -> bool:
    values = {str(item.get("status") or "").lower(), str(item.get("conclusion") or "").lower()}
    return bool(values & {"merged"})


def build_operator_pr_ci_evidence_payload(workspace: str | Path, task: dict[str, Any]) -> dict[str, Any]:
    task_id = str(task.get("task_id") or "")
    linked_run_id = task.get("linked_run_id") if isinstance(task.get("linked_run_id"), str) else None
    items: list[dict[str, Any]] = []
    rejected_events = 0
    for event in load_events(workspace):
        event_type = str(event.get("type") or "")
        if event_type not in PR_CI_EVIDENCE_EVENT_TYPES:
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        if _pr_ci_forbidden_payload_fields(payload):
            rejected_events += 1
            continue
        if not _pr_ci_event_scope_matches(event, payload, task_id=task_id, linked_run_id=linked_run_id):
            continue
        items.append(_build_pr_ci_evidence_item(event, payload))

    items.sort(key=lambda item: str(item.get("observed_at") or ""), reverse=True)
    failing = sum(1 for item in items if _pr_ci_item_is_failing(item))
    pending = sum(1 for item in items if _pr_ci_item_is_pending(item))
    successful = sum(1 for item in items if _pr_ci_item_is_successful(item))
    merged = sum(1 for item in items if item["kind"] == "pull_request" and _pr_ci_item_is_merged(item))
    suggestions: list[str] = []
    if failing:
        suggestions.append("review failing PR/CI evidence before resuming this task")
    if pending:
        suggestions.append("wait for pending checks or attach their final result before closing the task")
    if merged and not failing:
        suggestions.append("review merged PR evidence before marking the task done")
    if not items:
        suggestions.append("attach PR/CI read evidence when this task enters a GitHub or CI workflow")

    return {
        "generated_at": utc_iso(),
        "status": _status_from_counts(danger=failing, warning=pending),
        "counts": {
            "total": len(items),
            "pull_requests": sum(1 for item in items if item["kind"] == "pull_request"),
            "ci_runs": sum(1 for item in items if item["kind"] == "ci"),
            "failing": failing,
            "pending": pending,
            "successful": successful,
            "merged": merged,
            "rejected": rejected_events,
        },
        "resume_suggestions": suggestions[:4],
        "items": items[:12],
        "privacy": {
            "external_fetch_performed": False,
            "auth_tokens_exposed": False,
            "raw_logs_exposed": False,
            "redaction": "task detail reads append-only PR/CI evidence events and omits raw logs, diffs, patches, comments, and URL query strings",
        },
    }


__all__ = ["build_operator_pr_ci_evidence_payload"]
