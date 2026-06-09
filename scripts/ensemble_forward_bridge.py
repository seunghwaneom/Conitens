#!/usr/bin/env python3
"""
Read-only HTTP bridge for the explicit forward `.conitens` runtime surface.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import sys
import threading
import time
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse, urlsplit, urlunsplit

from ensemble_approval import APPROVAL_STATUSES, ApprovalInterruptAdapter
from ensemble_context_markdown import (
    FindingsAppendService,
    LatestContextSkeletonGenerator,
    ProgressAppendOnlyService,
    TaskPlanWriterReader,
)
from ensemble_events import load_events
from ensemble_forward import _read_optional_text, _repo_latest_context_path, build_runtime_cli_checks, sanitize_runtime_label
from ensemble_loop_paths import findings_path, latest_context_path, progress_path, task_plan_path
from ensemble_loop_repository import (
    LoopStateRepository,
    OPERATOR_WORKSPACE_KINDS,
    OPERATOR_WORKSPACE_STATUSES,
    utc_iso,
)
from ensemble_operator_reconciler import reconcile_operator_task
from ensemble_orchestration import LocalOrchestrationRuntime
from ensemble_replay_service import ReplayService
from ensemble_agent_registry import agent_list, agent_show
from ensemble_comms import thread_list, thread_show, thread_search
from ensemble_room import validate_room_id
from ensemble_ui import _host_is_loopback, _request_is_loopback, _validate_api_identifier

MAX_REQUEST_BODY_BYTES = 1_000_000
STALE_RUN_AGE_HOURS = 6
TURN_RECORD_DEFAULT_LIMIT = 50
TURN_RECORD_MAX_LIMIT = 200
WORKFLOW_CONTRACT_MESSAGE_LIMIT = 8
STATUS_CONFIDENCE_DEFAULT_LIMIT = 80
STATUS_CONFIDENCE_MAX_LIMIT = 240
WAKE_READINESS_DEFAULT_LIMIT = 40
WAKE_READINESS_MAX_LIMIT = 120
RUNTIME_ROSTER_AGENT_RUNTIME_IDS = ("codex", "claude", "gemini", "opencode")
RUNTIME_ROSTER_TOOLCHAIN_IDS = ("python", "node", "pnpm", "git")
RUNTIME_ROSTER_CATEGORIES = {"agent_runtime", "toolchain"}
OPERATOR_TASK_STATUSES = {"backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"}
OPERATOR_TASK_PRIORITIES = {"low", "medium", "high", "critical"}
OPERATOR_WORKSPACE_KINDS_SET = set(OPERATOR_WORKSPACE_KINDS)
OPERATOR_WORKSPACE_STATUSES_SET = set(OPERATOR_WORKSPACE_STATUSES)
PROVIDER_CALL_EVENT_TYPE = "provider.call_recorded"
PR_EVIDENCE_EVENT_TYPE = "pr.evidence_observed"
CI_EVIDENCE_EVENT_TYPE = "ci.evidence_observed"
PR_CI_EVIDENCE_EVENT_TYPES = {PR_EVIDENCE_EVENT_TYPE, CI_EVIDENCE_EVENT_TYPE}
PROVIDER_CALL_FORBIDDEN_PAYLOAD_FIELDS = {
    "prompt",
    "completion",
    "content",
    "messages",
    "request",
    "response",
    "raw_prompt",
    "raw_completion",
    "raw_request",
    "raw_response",
}
PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS = {
    "raw_log",
    "raw_logs",
    "log",
    "logs",
    "trace",
    "raw_trace",
    "diff",
    "patch",
    "content",
    "body",
    "comment",
    "comments",
    "review_body",
    "token",
    "auth_token",
    "secret",
}


def _bridge_root_html() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conitens Forward Bridge</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0d1117;
      color: #e6edf3;
      font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 32px;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 12px; color: #9fb0c3; }
    ul { margin: 16px 0 0; padding-left: 20px; }
    code { color: #7ee787; }
  </style>
</head>
<body>
  <h1>Conitens Forward Bridge</h1>
  <p>This bridge is read-only and forward-runtime scoped.</p>
  <p>Use the bearer token returned by the launch command to access <code>/api/*</code>.</p>
  <ul>
    <li><code>GET /api/agents</code></li>
    <li><code>GET /api/agents/&lt;agent_id&gt;</code></li>
    <li><code>GET /api/threads</code></li>
    <li><code>GET /api/threads/search?q=keyword</code></li>
    <li><code>GET /api/threads/&lt;thread_id&gt;</code></li>
    <li><code>GET /api/runs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/replay</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/state-docs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/context-latest</code></li>
    <li><code>GET /api/operator/wake-readiness</code></li>
    <li><code>GET /api/rooms/&lt;room_id&gt;/timeline</code></li>
  </ul>
</body>
</html>
"""


def _sanitize_reviewer_identity(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    if not text:
        return "forward-bridge"
    return text[:120]


def _resolve_reviewer_identity(explicit_identity: str | None = None) -> str:
    if explicit_identity:
        return _sanitize_reviewer_identity(explicit_identity)
    env_identity = os.environ.get("CONITENS_FORWARD_REVIEWER")
    if env_identity:
        return _sanitize_reviewer_identity(env_identity)
    return _sanitize_reviewer_identity(f"local/{getpass.getuser()}")


def _internal_bridge_error(
    handler: BaseHTTPRequestHandler,
    exc: Exception,
    *,
    message: str = "Internal forward bridge error.",
) -> None:
    handler.log_error("Forward bridge internal error: %s", exc)
    _forward_json_response(handler, {"error": message}, status=500)


def _loopback_origin(handler: BaseHTTPRequestHandler) -> str | None:
    origin = handler.headers.get("Origin")
    if not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.hostname or not _host_is_loopback(parsed.hostname):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _forward_extra_headers(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    origin = _loopback_origin(handler)
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Max-Age": "300",
        "Vary": "Origin",
    }


def _forward_json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in _forward_extra_headers(handler).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _forward_text_response(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    *,
    extra_headers: dict[str, str] | None = None,
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    merged_headers = {**_forward_extra_headers(handler), **(extra_headers or {})}
    for key, value in merged_headers.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _require_bridge_read_access(
    handler: BaseHTTPRequestHandler,
    auth_token: str,
) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _require_bridge_write_access(handler: BaseHTTPRequestHandler, auth_token: str) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge writes are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0") or "0"
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise ValueError("Invalid Content-Length") from exc
    if length > MAX_REQUEST_BODY_BYTES:
        raise OverflowError("Request body too large")
    body = handler.rfile.read(length).decode("utf-8") if length else "{}"
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Malformed JSON body") from exc
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def _relative_display_path(path: Path, workspace_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace_root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path.name)


def _ensure_run_exists(repository: LoopStateRepository, run_id: str) -> dict[str, Any]:
    try:
        return repository.get_run(run_id)
    except ValueError as exc:
        if str(exc).startswith("Unknown run_id:"):
            raise FileNotFoundError(str(exc)) from exc
        raise


def _walk_dicts(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        rows = [value]
        for nested in value.values():
            rows.extend(_walk_dicts(nested))
        return rows
    if isinstance(value, list):
        rows: list[dict[str, Any]] = []
        for item in value:
            rows.extend(_walk_dicts(item))
        return rows
    return []


def _metric_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _first_text_metric(row: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _sum_numeric_metrics(row: dict[str, Any], keys: tuple[str, ...]) -> float:
    total = 0.0
    for key in keys:
        number = _metric_number(row.get(key))
        if number is not None:
            total += number
    return total


def _provider_metric_token_total(row: dict[str, Any]) -> float:
    explicit_total = _metric_number(row.get("total_tokens"))
    if explicit_total is not None:
        return explicit_total
    generic_total = _metric_number(row.get("tokens"))
    if generic_total is not None:
        return generic_total
    return _sum_numeric_metrics(row, ("input_tokens", "output_tokens", "prompt_tokens", "completion_tokens"))


def _provider_metric_pii_count(row: dict[str, Any]) -> int:
    value = row.get("pii_findings")
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        return len(value)
    if isinstance(value, str) and value.strip():
        return 1
    pii = _metric_number(value)
    if pii is not None:
        return int(pii)
    return int(_sum_numeric_metrics(row, ("pii_count", "redaction_count")))


def _provider_call_event_metric_rows(workspace: str | Path) -> tuple[list[dict[str, Any]], list[str]]:
    metric_rows: list[dict[str, Any]] = []
    evidence_refs: list[str] = []
    for event in load_events(workspace):
        if event.get("type") != PROVIDER_CALL_EVENT_TYPE:
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        row: dict[str, Any] = {}
        for key, value in payload.items():
            normalized_key = str(key).lower()
            if normalized_key in PROVIDER_CALL_FORBIDDEN_PAYLOAD_FIELDS or normalized_key.endswith("_content"):
                continue
            row[str(key)] = value
        scope = event.get("scope") if isinstance(event.get("scope"), dict) else {}
        if not row.get("run_id") and isinstance(scope.get("run_id"), str):
            row["run_id"] = scope["run_id"]
        if not row.get("iteration_id") and isinstance(scope.get("iteration_id"), str):
            row["iteration_id"] = scope["iteration_id"]
        metric_rows.append(row)
        event_id = str(event.get("event_id") or "unknown")
        evidence_refs.append(f"event:{PROVIDER_CALL_EVENT_TYPE}:{event_id}")
    return metric_rows, evidence_refs


def _summarize_provider_metric_rows(metric_rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest_provider: str | None = None
    latest_model: str | None = None
    total_cost = 0.0
    total_tokens = 0
    tool_calls_count = 0
    with_cost = 0
    with_tokens = 0
    with_latency = 0
    pii_findings = 0

    for row in metric_rows:
        provider = sanitize_runtime_label(_first_text_metric(row, ("provider", "provider_id", "runtime", "adapter")))
        model = sanitize_runtime_label(_first_text_metric(row, ("model", "model_id", "model_name")))
        if provider:
            latest_provider = provider
        if model:
            latest_model = model

        cost = _sum_numeric_metrics(row, ("cost", "estimated_cost", "cost_usd", "usd"))
        if cost:
            total_cost += cost
            with_cost += 1

        tokens = _provider_metric_token_total(row)
        if tokens:
            total_tokens += int(tokens)
            with_tokens += 1

        latency = _sum_numeric_metrics(row, ("latency_ms", "duration_ms", "elapsed_ms"))
        if latency:
            with_latency += 1

        pii_findings += _provider_metric_pii_count(row)
        tool_calls_count += int(_sum_numeric_metrics(row, ("tool_calls_count", "tool_count")))

    return {
        "observed": len(metric_rows),
        "with_cost": with_cost,
        "with_tokens": with_tokens,
        "with_latency": with_latency,
        "estimated_cost": round(total_cost, 6) if with_cost else None,
        "total_tokens": total_tokens if with_tokens else None,
        "tool_calls_count": tool_calls_count,
        "latest_provider": latest_provider,
        "latest_model": latest_model,
        "pii_findings": pii_findings,
    }


def _safe_text(value: Any, *, max_length: int = 180) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return text[:max_length]


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


def _payload_key_variants(key: Any) -> tuple[str, str]:
    normalized = str(key).strip().lower()
    compact = "".join(char for char in normalized if char.isalnum())
    return normalized, compact


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


def _status_from_counts(*, danger: int = 0, warning: int = 0) -> str:
    if danger > 0:
        return "danger"
    if warning > 0:
        return "warning"
    return "ok"


def _next_operator_task_id() -> str:
    return f"otask-{secrets.token_hex(8)}"


def _next_operator_workspace_id() -> str:
    return f"owork-{secrets.token_hex(8)}"


def _parse_operator_task_payload(payload: dict[str, Any]) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    objective = str(payload.get("objective") or "").strip()
    status = str(payload.get("status") or "todo").strip()
    priority = str(payload.get("priority") or "medium").strip()
    if status not in OPERATOR_TASK_STATUSES:
        raise ValueError(f"Unsupported operator task status: {status}")
    if priority not in OPERATOR_TASK_PRIORITIES:
        raise ValueError(f"Unsupported operator task priority: {priority}")

    owner_agent_id = payload.get("owner_agent_id")
    safe_owner = (
        _validate_api_identifier(str(owner_agent_id), field_name="owner_agent_id")
        if isinstance(owner_agent_id, str) and owner_agent_id.strip()
        else None
    )
    linked_run_id = payload.get("linked_run_id")
    safe_run = (
        _validate_api_identifier(str(linked_run_id), field_name="linked_run_id")
        if isinstance(linked_run_id, str) and linked_run_id.strip()
        else None
    )
    linked_iteration_id = payload.get("linked_iteration_id")
    safe_iteration = (
        _validate_api_identifier(str(linked_iteration_id), field_name="linked_iteration_id")
        if isinstance(linked_iteration_id, str) and linked_iteration_id.strip()
        else None
    )
    linked_room_ids_value = payload.get("linked_room_ids")
    linked_room_ids = [
        validate_room_id(str(item))
        for item in linked_room_ids_value
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(linked_room_ids_value, list) else []
    acceptance_value = payload.get("acceptance_json")
    acceptance = [str(item) for item in acceptance_value if isinstance(item, str)] if isinstance(acceptance_value, list) else []
    workspace_ref = str(payload.get("workspace_ref") or "").strip() or None

    return {
        "title": title,
        "objective": objective,
        "status": status,
        "priority": priority,
        "owner_agent_id": safe_owner,
        "linked_run_id": safe_run,
        "linked_iteration_id": safe_iteration,
        "linked_room_ids": linked_room_ids,
        "blocked_reason": str(payload.get("blocked_reason") or "").strip() or None,
        "acceptance": acceptance,
        "workspace_ref": workspace_ref,
    }


def _parse_operator_workspace_payload(payload: dict[str, Any]) -> dict[str, Any]:
    label = str(payload.get("label") or "").strip()
    path = str(payload.get("path") or "").strip()
    kind = str(payload.get("kind") or "repo").strip()
    status = str(payload.get("status") or "active").strip()
    if kind not in OPERATOR_WORKSPACE_KINDS_SET:
        raise ValueError(f"Unsupported operator workspace kind: {kind}")
    if status not in OPERATOR_WORKSPACE_STATUSES_SET:
        raise ValueError(f"Unsupported operator workspace status: {status}")
    owner_agent_id = payload.get("owner_agent_id")
    safe_owner = (
        _validate_api_identifier(str(owner_agent_id), field_name="owner_agent_id")
        if isinstance(owner_agent_id, str) and owner_agent_id.strip()
        else None
    )
    linked_run_id = payload.get("linked_run_id")
    safe_run = (
        _validate_api_identifier(str(linked_run_id), field_name="linked_run_id")
        if isinstance(linked_run_id, str) and linked_run_id.strip()
        else None
    )
    linked_iteration_id = payload.get("linked_iteration_id")
    safe_iteration = (
        _validate_api_identifier(str(linked_iteration_id), field_name="linked_iteration_id")
        if isinstance(linked_iteration_id, str) and linked_iteration_id.strip()
        else None
    )
    task_ids_value = payload.get("task_ids_json")
    task_ids = [
        _validate_api_identifier(str(item), field_name="task_id")
        for item in task_ids_value
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(task_ids_value, list) else []
    return {
        "label": label,
        "path": path,
        "kind": kind,
        "status": status,
        "owner_agent_id": safe_owner,
        "linked_run_id": safe_run,
        "linked_iteration_id": safe_iteration,
        "task_ids": task_ids,
        "notes": str(payload.get("notes") or "").strip() or None,
        "archive_note": str(payload.get("archive_note") or "").strip() or None,
    }


def _derive_workspace_task_ids(repository: LoopStateRepository, workspace_id: str) -> list[str]:
    return sorted(
        task["task_id"]
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    )


def _refresh_operator_workspace_membership(repository: LoopStateRepository, workspace_id: str | None) -> None:
    if not isinstance(workspace_id, str) or not workspace_id:
        return
    operator_workspace = repository.get_operator_workspace(workspace_id)
    if operator_workspace is None:
        return
    derived_task_ids = _derive_workspace_task_ids(repository, workspace_id)
    if list(operator_workspace.get("task_ids_json") or []) == derived_task_ids:
        return
    repository.update_operator_workspace(workspace_id=workspace_id, task_ids=derived_task_ids)


def _workspace_linked_tasks(repository: LoopStateRepository, workspace_id: str) -> list[dict[str, Any]]:
    return [
        task
        for task in repository.list_operator_tasks(include_archived=True)
        if task.get("workspace_ref") == workspace_id
    ]


def _ensure_operator_task_workspace_reference_allowed(
    repository: LoopStateRepository,
    *,
    current_task: dict[str, Any] | None,
    next_fields: dict[str, Any],
) -> None:
    workspace_ref = next_fields.get("workspace_ref")
    if not isinstance(workspace_ref, str) or not workspace_ref:
        return
    existing_workspace = repository.get_operator_workspace(workspace_ref)
    if existing_workspace is not None:
        if (
            existing_workspace.get("status") == "archived"
            and (current_task is None or workspace_ref != current_task.get("workspace_ref"))
        ):
            raise ValueError(f"Archived operator workspace cannot accept new task links: {workspace_ref}")
        return
    if current_task is not None and workspace_ref == current_task.get("workspace_ref"):
        return
    raise ValueError(f"Operator workspace not found: {workspace_ref}")


def _ensure_operator_workspace_update_allowed(
    repository: LoopStateRepository,
    *,
    current_workspace: dict[str, Any],
    next_fields: dict[str, Any],
) -> None:
    current_status = str(current_workspace.get("status") or "")
    next_status = str(next_fields.get("status") or current_status)
    changed_fields: list[str] = []
    if next_fields["label"] != current_workspace["label"]:
        changed_fields.append("label")
    if next_fields["path"] != current_workspace["path"]:
        changed_fields.append("path")
    if next_fields["kind"] != current_workspace["kind"]:
        changed_fields.append("kind")
    if next_status != current_status:
        changed_fields.append("status")
    if next_fields["owner_agent_id"] != current_workspace["owner_agent_id"]:
        changed_fields.append("owner_agent_id")
    if next_fields["linked_run_id"] != current_workspace["linked_run_id"]:
        changed_fields.append("linked_run_id")
    if next_fields["linked_iteration_id"] != current_workspace["linked_iteration_id"]:
        changed_fields.append("linked_iteration_id")
    if next_fields["notes"] != current_workspace["notes"]:
        changed_fields.append("notes")

    if current_status == "archived":
        if next_status == "archived":
            raise RuntimeError("Archived operator workspaces are read-only until reactivated.")
        non_status_changes = [field for field in changed_fields if field != "status"]
        if non_status_changes:
            raise RuntimeError("Archived operator workspaces are read-only until reactivated.")

    if current_status != "archived" and next_status == "archived":
        if not next_fields.get("archive_note"):
            raise ValueError("Workspace archive rationale is required.")
        active_linked_tasks = [
            task["task_id"]
            for task in _workspace_linked_tasks(repository, str(current_workspace["workspace_id"]))
            if not task.get("archived_at")
        ]
        if active_linked_tasks:
            raise RuntimeError(
                "Workspace archiving requires detaching or archiving linked active tasks: "
                + ", ".join(active_linked_tasks)
            )


def _ensure_operator_task_update_allowed(
    repository: LoopStateRepository,
    *,
    current_task: dict[str, Any],
    next_fields: dict[str, Any],
) -> None:
    if current_task.get("archived_at"):
        raise RuntimeError("Archived operator tasks are read-only until restored.")
    next_run_id = next_fields.get("linked_run_id") or current_task.get("linked_run_id")
    if not isinstance(next_run_id, str) or not next_run_id:
        return
    pending_approvals = repository.list_approval_requests(run_id=next_run_id, status="pending")
    if not pending_approvals:
        return

    changed_fields: list[str] = []
    if next_fields["status"] != current_task["status"]:
        changed_fields.append("status")
    if next_fields["owner_agent_id"] != current_task["owner_agent_id"]:
        changed_fields.append("owner_agent_id")
    if next_fields["linked_run_id"] != current_task["linked_run_id"]:
        changed_fields.append("linked_run_id")
    if next_fields["linked_iteration_id"] != current_task["linked_iteration_id"]:
        changed_fields.append("linked_iteration_id")
    if list(next_fields["linked_room_ids"]) != list(current_task["linked_room_ids_json"]):
        changed_fields.append("linked_room_ids")
    if next_fields["workspace_ref"] != current_task["workspace_ref"]:
        changed_fields.append("workspace_ref")

    if changed_fields:
        raise RuntimeError(
            "Operator task mutation is blocked while the linked run has a pending approval: "
            + ", ".join(changed_fields)
        )


def _operator_task_approval_blockers(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
) -> list[str]:
    blocking_reasons: list[str] = []
    pending_task_approvals = repository.list_approval_requests(task_id=str(task["task_id"]), status="pending")
    if pending_task_approvals:
        blocking_reasons.append("task has pending approval requests")

    linked_run_id = task.get("linked_run_id")
    if isinstance(linked_run_id, str) and linked_run_id:
        pending_run_approvals = repository.list_approval_requests(run_id=linked_run_id, status="pending")
        other_run_approvals = [
            approval
            for approval in pending_run_approvals
            if approval.get("task_id") != task["task_id"]
        ]
        if other_run_approvals:
            blocking_reasons.append(f"linked run {linked_run_id} has pending approvals")
    return blocking_reasons


def _ensure_operator_task_archive_allowed(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
    action_name: str,
) -> None:
    blocking_reasons = _operator_task_approval_blockers(repository, task=task)
    if blocking_reasons:
        raise RuntimeError(
            f"Operator task {action_name} is blocked while approvals are pending: " + "; ".join(blocking_reasons)
        )


def _ensure_operator_task_approval_request_allowed(task: dict[str, Any]) -> None:
    if task.get("archived_at"):
        raise RuntimeError("Archived operator tasks cannot request approval until restored.")


def _parse_archive_note(payload: dict[str, Any]) -> str:
    archive_note = str(payload.get("archive_note") or "").strip()
    if not archive_note:
        raise ValueError("Archive rationale is required.")
    return archive_note


def _ensure_operator_task_delete_allowed(
    repository: LoopStateRepository,
    *,
    task: dict[str, Any],
) -> None:
    if not task.get("archived_at"):
        raise RuntimeError("Operator task deletion requires archiving the task first.")
    blocking_reasons = _operator_task_approval_blockers(repository, task=task)
    if blocking_reasons:
        raise RuntimeError("Operator task deletion is blocked while approvals are pending: " + "; ".join(blocking_reasons))


def _run_counts(repository: LoopStateRepository, run_id: str) -> dict[str, int]:
    return {
        "iterations": len(repository.list_iterations(run_id)),
        "validator_results": len(repository.list_validator_results(run_id)),
        "approvals": len(repository.list_approval_requests(run_id=run_id)),
        "rooms": len(repository.list_room_records(run_id=run_id)),
        "messages": len(repository.list_room_messages(run_id=run_id)),
        "tool_events": len(repository.list_tool_events(run_id=run_id)),
        "insights": len(repository.list_insights(run_id=run_id)),
        "handoff_packets": len(repository.list_handoff_packets(run_id=run_id)),
    }


def build_runs_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = []
    for run in repository.list_runs():
        iterations = repository.list_iterations(run["run_id"])
        latest_iteration = iterations[-1] if iterations else None
        runs.append(
            {
                **run,
                "latest_iteration_id": latest_iteration["iteration_id"] if latest_iteration else None,
                "latest_iteration_status": latest_iteration["status"] if latest_iteration else None,
                "counts": _run_counts(repository, run["run_id"]),
            }
        )
    return {"runs": runs, "count": len(runs)}


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
    workspaces = [
        {
            **row,
            "task_ids_json": _derive_workspace_task_ids(repository, str(row["workspace_id"])),
        }
        for row in repository.list_operator_workspaces(status=status, owner_agent_id=owner_agent_id)
    ]
    return {"workspaces": workspaces, "count": len(workspaces)}


def build_operator_workspace_detail_payload(workspace: str | Path, workspace_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    operator_workspace = repository.get_operator_workspace(workspace_id)
    if operator_workspace is None:
        raise FileNotFoundError(f"Operator workspace not found: {workspace_id}")
    return {
        "workspace": {
            **operator_workspace,
            "task_ids_json": _derive_workspace_task_ids(repository, workspace_id),
        },
    }


def delete_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_delete_allowed(repository, task=task)
    deleted = repository.delete_operator_task(task_id)
    return {"deleted_task_id": str(deleted["task_id"])}


def detach_operator_task_workspace_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    next_fields = {
        "title": task["title"],
        "objective": task["objective"],
        "status": task["status"],
        "priority": task["priority"],
        "owner_agent_id": task["owner_agent_id"],
        "linked_run_id": task["linked_run_id"],
        "linked_iteration_id": task["linked_iteration_id"],
        "linked_room_ids": list(task["linked_room_ids_json"]),
        "blocked_reason": task["blocked_reason"],
        "acceptance": list(task["acceptance_json"]),
        "workspace_ref": None,
    }
    _ensure_operator_task_update_allowed(repository, current_task=task, next_fields=next_fields)
    detached = repository.detach_operator_task_workspace(task_id)
    _refresh_operator_workspace_membership(repository, task.get("workspace_ref"))
    return {"task": detached}


def archive_operator_task_payload(
    workspace: str | Path,
    task_id: str,
    *,
    actor: str,
    archive_note: str,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_archive_allowed(repository, task=task, action_name="archive")
    archived = repository.archive_operator_task(task_id, archived_by=actor, archive_note=archive_note)
    return {"task": archived}


def restore_operator_task_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_archive_allowed(repository, task=task, action_name="restore")
    restored = repository.restore_operator_task(task_id)
    return {"task": restored}


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
    if event_metric_rows:
        source = "event_log"
        metric_rows = event_metric_rows
        evidence_refs = event_evidence_refs + checkpoint_evidence_refs
    else:
        source = "checkpoint"
        metric_rows = checkpoint_metric_rows
        evidence_refs = checkpoint_evidence_refs

    provider_summary = _summarize_provider_metric_rows(metric_rows)

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
            "retry_decisions": len(retry_decisions),
            "approval_pending": pending_checkpoint_count,
        },
        "sensitivity": {
            "pii_findings": provider_summary["pii_findings"],
            "raw_content_exposed": False,
            "redaction": "forward projection omits raw prompt, completion, request, and response content",
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


def _validate_runtime_roster_category(category: str | None) -> str | None:
    if category is None:
        return None
    safe_category = category.strip()
    if not safe_category:
        return None
    if safe_category not in RUNTIME_ROSTER_CATEGORIES:
        raise ValueError(f"Unsupported runtime roster category: {safe_category}")
    return safe_category


def _validate_runtime_roster_runtime_id(runtime_id: str | None) -> str | None:
    if runtime_id is None:
        return None
    safe_runtime_id = runtime_id.strip().lower()
    if not safe_runtime_id:
        return None
    allowed = set(RUNTIME_ROSTER_AGENT_RUNTIME_IDS + RUNTIME_ROSTER_TOOLCHAIN_IDS)
    if safe_runtime_id not in allowed:
        raise ValueError(f"Unsupported runtime id: {safe_runtime_id}")
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


def build_operator_runtime_roster_payload(
    workspace: str | Path,
    *,
    probe_versions: bool = True,
    runtime_id: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    safe_runtime_id = _validate_runtime_roster_runtime_id(runtime_id)
    safe_category = _validate_runtime_roster_category(category)
    runtime_checks = {check["id"]: check for check in build_runtime_cli_checks(probe_versions=probe_versions)}
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


def _bounded_turn_record_limit(limit: int | None) -> int:
    if limit is None:
        return TURN_RECORD_DEFAULT_LIMIT
    return max(1, min(int(limit), TURN_RECORD_MAX_LIMIT))


def _metadata_keys(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return []
    return sorted(str(key) for key in value)[:20]


def _evidence_refs(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item)[:180] for item in value if isinstance(item, (str, int, float))][:8]


def build_operator_turn_records_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    safe_limit = _bounded_turn_record_limit(limit)
    messages = repository.list_room_messages(run_id=run_id, room_id=room_id)
    tool_events = repository.list_tool_events(run_id=run_id, room_id=room_id)
    records: list[dict[str, Any]] = []

    for message in messages:
        content = str(message.get("content") or "")
        records.append(
            {
                "id": f"message:{message['id']}",
                "record_type": "message",
                "created_at": message["created_at"],
                "room_id": message.get("room_id"),
                "run_id": message.get("run_id"),
                "iteration_id": message.get("iteration_id"),
                "actor": str(message.get("sender") or "")[:120],
                "actor_kind": str(message.get("sender_kind") or "")[:60],
                "message_type": str(message.get("message_type") or "")[:80],
                "content_length": len(content),
                "content_redacted": True,
                "metadata_keys": _metadata_keys(message.get("metadata_json")),
                "evidence_refs": _evidence_refs(message.get("evidence_refs_json")),
            }
        )

    for event in tool_events:
        payload = event.get("payload_json") if isinstance(event.get("payload_json"), dict) else {}
        records.append(
            {
                "id": f"tool_event:{event['id']}",
                "record_type": "tool_event",
                "created_at": event["created_at"],
                "room_id": event.get("room_id"),
                "run_id": event.get("run_id"),
                "iteration_id": event.get("iteration_id"),
                "actor": str(event.get("actor") or "")[:120],
                "actor_kind": "agent",
                "tool_name": str(event.get("tool_name") or "")[:120],
                "payload_keys": _metadata_keys(payload),
                "payload_redacted": True,
                "evidence_refs": [],
            }
        )

    records.sort(key=lambda row: (str(row.get("created_at") or ""), str(row.get("id") or "")))
    total_records = len(records)
    if total_records > safe_limit:
        records = records[-safe_limit:]

    return {
        "generated_at": utc_iso(),
        "status": "ok",
        "scope": {
            "run_id": run_id,
            "room_id": room_id,
            "limit": safe_limit,
        },
        "records": records,
        "counts": {
            "returned": len(records),
            "total": total_records,
            "messages": len(messages),
            "tool_events": len(tool_events),
            "agent_messages": sum(1 for message in messages if str(message.get("sender_kind")) == "agent"),
            "truncated": total_records > safe_limit,
        },
        "wake_sources": [
            {
                "id": "room_messages",
                "status": "present" if messages else "empty",
                "record_count": len(messages),
                "detail": "Persisted room message metadata is available without transcript content.",
            },
            {
                "id": "tool_events",
                "status": "present" if tool_events else "empty",
                "record_count": len(tool_events),
                "detail": "Persisted tool-event metadata is available without payload values.",
            },
        ],
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_values_exposed": False,
            "metadata_values_exposed": False,
            "raw_transcript_exposed": False,
            "detail": "Turn records expose metadata, lengths, keys, and evidence refs only; message content and tool payload values are omitted.",
        },
    }


def _workflow_contract_inputs(workflow: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    inputs = workflow.get("inputs")
    if not isinstance(inputs, dict):
        return [], {}

    rows: list[dict[str, Any]] = []
    sample_inputs: dict[str, str] = {}
    for raw_name in sorted(str(name) for name in inputs):
        spec = inputs.get(raw_name)
        spec_dict = spec if isinstance(spec, dict) else {}
        required = bool(spec_dict.get("required", False))
        row = {
            "name": raw_name,
            "required": required,
            "type": str(spec_dict.get("type") or "string")[:80],
            "has_default": spec_dict.get("default") not in (None, ""),
        }
        if spec_dict.get("description") not in (None, ""):
            row["description"] = str(spec_dict.get("description"))[:180]
        rows.append(row)
        sample_inputs[raw_name] = f"<{raw_name}>"
    return rows, sample_inputs


def _workflow_contract_step_summary(workflow: dict[str, Any], validation: dict[str, Any]) -> list[dict[str, Any]]:
    raw_steps = workflow.get("steps") if isinstance(workflow.get("steps"), list) else []
    rows: list[dict[str, Any]] = []
    for preview in validation.get("steps", []):
        if not isinstance(preview, dict):
            continue
        index = int(preview.get("index") or 0)
        raw_step = raw_steps[index] if 0 <= index < len(raw_steps) and isinstance(raw_steps[index], dict) else {}
        kind = str(preview.get("kind") or "")
        row: dict[str, Any] = {
            "index": index,
            "id": str(preview.get("id") or f"step-{index + 1}")[:120],
            "kind": kind[:80],
            "on_fail": str(preview.get("on_fail") or "")[:80],
            "template_vars": [str(name)[:80] for name in preview.get("template_vars", [])[:20]],
            "requires_approval": kind == "approval",
            "emits_event": kind == "emit_event",
        }
        if raw_step.get("agent_id") not in (None, ""):
            row["agent_id"] = str(raw_step.get("agent_id"))[:120]
        if raw_step.get("event_type") not in (None, ""):
            row["event_type"] = str(raw_step.get("event_type"))[:120]
        branches = raw_step.get("branches")
        if isinstance(branches, list):
            row["branch_count"] = len(branches)
        depends_on = raw_step.get("depends_on")
        if isinstance(depends_on, list):
            row["depends_on_count"] = len(depends_on)
        elif depends_on not in (None, ""):
            row["depends_on_count"] = 1
        rows.append(row)
    return rows


def _workflow_contract_row(
    workspace_root: Path,
    workflow: dict[str, Any],
    load_warnings: list[str],
    workflow_path: Path,
) -> dict[str, Any]:
    from ensemble_workflow import validate_workflow

    inputs, sample_inputs = _workflow_contract_inputs(workflow)
    validation = validate_workflow(workflow, workflow_path, sample_inputs)
    warnings = (load_warnings + validation.get("warnings", []))[:WORKFLOW_CONTRACT_MESSAGE_LIMIT]
    errors = validation.get("errors", [])[:WORKFLOW_CONTRACT_MESSAGE_LIMIT]
    steps = _workflow_contract_step_summary(workflow, validation)
    step_kinds = sorted({row["kind"] for row in steps if row.get("kind")})
    required_inputs = [row["name"] for row in inputs if row["required"]]
    optional_inputs = [row["name"] for row in inputs if not row["required"]]

    return {
        "id": str(workflow.get("slug") or workflow_path.stem)[:120],
        "slug": str(workflow.get("slug") or workflow_path.stem)[:120],
        "name": str(workflow.get("name") or workflow_path.stem)[:180],
        "description": str(workflow.get("description") or "")[:240],
        "path": _relative_display_path(workflow_path, workspace_root),
        "schema_v": workflow.get("schema_v"),
        "execution_support": str(workflow.get("execution_support") or "unspecified")[:80],
        "ready": not errors,
        "warnings": warnings,
        "errors": errors,
        "input_requirements": inputs,
        "required_inputs": required_inputs,
        "optional_inputs": optional_inputs,
        "step_count": len(steps),
        "step_kinds": step_kinds,
        "steps": steps,
        "requires_approval": any(row["requires_approval"] for row in steps),
        "supports_parallel": any(row.get("kind") in {"parallel", "join"} for row in steps),
        "emits_events": any(row["emits_event"] for row in steps),
    }


def _validate_workflow_contract_ref(workflow_ref: str | None) -> str | None:
    if workflow_ref is None:
        return None
    safe_ref = workflow_ref.strip()
    if not safe_ref:
        return None
    if any(separator in safe_ref for separator in ("/", "\\", ":")) or safe_ref in {".", ".."}:
        raise ValueError("workflow filter must be a workflow slug or file stem")
    return safe_ref


def build_operator_workflow_contracts_payload(
    workspace: str | Path,
    *,
    workflow_ref: str | None = None,
) -> dict[str, Any]:
    from ensemble_workflow import get_agent_workflows_dir, load_workflow

    workspace_root = Path(workspace)
    safe_ref = _validate_workflow_contract_ref(workflow_ref)
    workflows_dir = get_agent_workflows_dir(workspace_root)
    if not workflows_dir.exists():
        return {
            "generated_at": utc_iso(),
            "status": "warning",
            "source": {
                "path": _relative_display_path(workflows_dir, workspace_root),
                "exists": False,
            },
            "contracts": [],
            "counts": {
                "total": 0,
                "ready": 0,
                "with_errors": 0,
                "requiring_approval": 0,
                "supporting_parallel": 0,
                "feature_flagged": 0,
            },
            "router_contract": {
                "read_only": True,
                "execution_performed": False,
                "workflow_runs_created": False,
                "approval_bypassed": False,
                "source": ".agent/workflows",
            },
            "privacy": {
                "raw_workflow_body_exposed": False,
                "rendered_command_values_exposed": False,
                "rendered_payload_values_exposed": False,
                "detail": "Workflow contracts expose metadata, input names, step kinds, and template variable names only.",
            },
        }

    contracts: list[dict[str, Any]] = []
    for workflow_path in sorted(workflows_dir.glob("*.md")):
        try:
            workflow, load_warnings, loaded_path = load_workflow(workspace_root, str(workflow_path))
            contract = _workflow_contract_row(workspace_root, workflow, load_warnings, loaded_path)
        except Exception as exc:  # Keep discovery resilient; execution is not attempted here.
            contract = {
                "id": workflow_path.stem,
                "slug": workflow_path.stem,
                "name": workflow_path.stem,
                "description": "",
                "path": _relative_display_path(workflow_path, workspace_root),
                "schema_v": None,
                "execution_support": "unknown",
                "ready": False,
                "warnings": [],
                "errors": [str(exc)[:240]],
                "input_requirements": [],
                "required_inputs": [],
                "optional_inputs": [],
                "step_count": 0,
                "step_kinds": [],
                "steps": [],
                "requires_approval": False,
                "supports_parallel": False,
                "emits_events": False,
            }
        if safe_ref and safe_ref not in {contract["id"], contract["slug"], workflow_path.stem, contract["name"]}:
            continue
        contracts.append(contract)

    if safe_ref and not contracts:
        raise FileNotFoundError(f"Workflow contract not found: {safe_ref}")

    with_errors = sum(1 for contract in contracts if contract["errors"])
    requiring_approval = sum(1 for contract in contracts if contract["requires_approval"])
    supporting_parallel = sum(1 for contract in contracts if contract["supports_parallel"])
    feature_flagged = sum(1 for contract in contracts if contract["execution_support"] == "feature-flagged")
    status = _status_from_counts(danger=with_errors, warning=0 if contracts else 1)
    return {
        "generated_at": utc_iso(),
        "status": status,
        "source": {
            "path": _relative_display_path(workflows_dir, workspace_root),
            "exists": True,
            "filter": safe_ref,
        },
        "contracts": contracts,
        "counts": {
            "total": len(contracts),
            "ready": sum(1 for contract in contracts if contract["ready"]),
            "with_errors": with_errors,
            "requiring_approval": requiring_approval,
            "supporting_parallel": supporting_parallel,
            "feature_flagged": feature_flagged,
        },
        "router_contract": {
            "read_only": True,
            "execution_performed": False,
            "workflow_runs_created": False,
            "approval_bypassed": False,
            "source": ".agent/workflows",
        },
        "privacy": {
            "raw_workflow_body_exposed": False,
            "rendered_command_values_exposed": False,
            "rendered_payload_values_exposed": False,
            "detail": "Workflow contracts expose metadata, input names, step kinds, and template variable names only.",
        },
    }


def _bounded_status_confidence_limit(limit: int | None) -> int:
    if limit is None:
        return STATUS_CONFIDENCE_DEFAULT_LIMIT
    return max(1, min(int(limit), STATUS_CONFIDENCE_MAX_LIMIT))


def _status_confidence_age_hours(value: str | None, now: datetime) -> float | None:
    parsed = _parse_utc_iso_timestamp(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return round(max(0.0, (now - parsed).total_seconds() / 3600), 2)


def _status_confidence_level(reason_codes: list[str]) -> str:
    if any(code.endswith("_stale") or code == "stale_active_run" for code in reason_codes):
        return "stale"
    partial_tokens = (
        "missing",
        "pending",
        "blocked",
        "failed",
        "no_activity",
        "no_iteration",
        "unverified",
        "unknown",
    )
    if any(any(token in code for token in partial_tokens) for code in reason_codes):
        return "partial"
    return "high"


def _status_confidence_score(level: str) -> float:
    return {"high": 0.92, "partial": 0.58, "stale": 0.34}.get(level, 0.5)


def _status_confidence_attention(reason_codes: list[str]) -> list[str]:
    flags: list[str] = []
    if any("pending" in code for code in reason_codes):
        flags.append("pending_approval")
    if any("blocked" in code for code in reason_codes):
        flags.append("blocked")
    if any("failed" in code or "unverified" in code for code in reason_codes):
        flags.append("needs_validation")
    if any("stale" in code for code in reason_codes):
        flags.append("stale")
    return flags


def _status_confidence_latest_at(values: list[str | None]) -> str | None:
    parsed: list[tuple[datetime, str]] = []
    for value in values:
        timestamp = _parse_utc_iso_timestamp(value)
        if timestamp is None or value is None:
            continue
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        parsed.append((timestamp, value))
    if not parsed:
        return None
    parsed.sort(key=lambda item: item[0])
    return parsed[-1][1]


def _status_confidence_task_row(
    repository: LoopStateRepository,
    task: dict[str, Any],
    runs_by_id: dict[str, dict[str, Any]],
    rooms_by_id: dict[str, dict[str, Any]],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    task_id = str(task["task_id"])
    linked_run_id = task.get("linked_run_id")
    linked_room_ids = [str(item) for item in (task.get("linked_room_ids_json") or []) if isinstance(item, str)]
    linked_rooms = [rooms_by_id[room_id] for room_id in linked_room_ids if room_id in rooms_by_id]
    linked_run = runs_by_id.get(str(linked_run_id)) if linked_run_id else None
    pending_approvals = repository.list_approval_requests(task_id=task_id, status="pending")
    validator_history: list[dict[str, Any]] = []
    blocked_handoffs: list[dict[str, Any]] = []
    run_pending_approvals: list[dict[str, Any]] = []
    room_message_count = 0
    room_tool_event_count = 0

    if linked_run:
        validator_history = repository.list_validator_results(str(linked_run["run_id"]))
        blocked_handoffs = repository.list_handoff_packets(run_id=str(linked_run["run_id"]), status="blocked")
        run_pending_approvals = [
            row
            for row in repository.list_approval_requests(run_id=str(linked_run["run_id"]), status="pending")
            if row.get("task_id") != task_id
        ]
    for room in linked_rooms:
        room_message_count += len(repository.list_room_messages(room_id=str(room["room_id"])))
        room_tool_event_count += len(repository.list_tool_events(room_id=str(room["room_id"])))

    latest_validator = validator_history[-1] if validator_history else None
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"operator_task:{task_id}"]

    status = str(task.get("status") or "")
    if task.get("archived_at"):
        reason_codes.append("task_archived")
        reasons.append("Task is archived; status is historical.")
    if status == "blocked" or task.get("blocked_reason"):
        reason_codes.append("task_blocked")
        reasons.append("Task is explicitly blocked.")
    if status in {"in_progress", "in_review", "done"} and not linked_run_id:
        reason_codes.append("missing_linked_run")
        reasons.append("Task status expects run evidence but no linked run is recorded.")
    if linked_run_id and linked_run is None:
        reason_codes.append("missing_linked_run_record")
        reasons.append("Task references a linked run that is not present in SQLite state.")
    if linked_run:
        evidence_refs.append(f"run:{linked_run['run_id']}")
        run_age = _status_confidence_age_hours(str(linked_run.get("updated_at") or ""), now)
        if str(linked_run.get("status")) in {"active", "running"} and run_age is not None and run_age > stale_age_hours:
            reason_codes.append("linked_run_stale")
            reasons.append("Linked active run has not updated within the stale-age window.")
    if pending_approvals or run_pending_approvals:
        reason_codes.append("pending_approval")
        reasons.append("A pending approval is associated with this task or linked run.")
        evidence_refs.extend([f"approval:{row['request_id']}" for row in (pending_approvals + run_pending_approvals)[:4]])
    if blocked_handoffs:
        reason_codes.append("blocked_handoff")
        reasons.append("A blocked handoff is associated with the linked run.")
        evidence_refs.extend([f"handoff:{row['handoff_id']}" for row in blocked_handoffs[:4]])
    if latest_validator is not None:
        evidence_refs.append(f"validator_result:{latest_validator['id']}")
        if not latest_validator["passed"]:
            reason_codes.append("latest_validator_failed")
            reasons.append("Latest validator result for the linked run failed.")
    elif status in {"in_review", "done"}:
        reason_codes.append("unverified_task_status")
        reasons.append("Task is in review or done without validator evidence.")
    if linked_run and not validator_history and not pending_approvals and not blocked_handoffs and not linked_rooms:
        reason_codes.append("no_activity_evidence")
        reasons.append("Linked run exists, but no validation, approval, handoff, or linked room evidence is attached.")
    if not reason_codes:
        reason_codes.append("status_supported")
        reasons.append("Task status has matching linked evidence and no attention flags.")

    level = _status_confidence_level(reason_codes)
    updated_at = str(task.get("updated_at") or "")
    return {
        "id": f"task:{task_id}",
        "subject_type": "task",
        "subject_id": task_id,
        "status": status,
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": updated_at,
        "age_hours": _status_confidence_age_hours(updated_at, now),
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "run_id": linked_run_id,
            "iteration_id": task.get("linked_iteration_id"),
            "room_ids": linked_room_ids[:8],
        },
        "signals": {
            "pending_approvals": len(pending_approvals) + len(run_pending_approvals),
            "validator_results": len(validator_history),
            "latest_validator_passed": latest_validator["passed"] if latest_validator else None,
            "blocked_handoffs": len(blocked_handoffs),
            "linked_rooms": len(linked_rooms),
            "room_messages": room_message_count,
            "room_tool_events": room_tool_event_count,
            "acceptance_items": len(task.get("acceptance_json") or []),
        },
    }


def _status_confidence_run_row(
    repository: LoopStateRepository,
    run: dict[str, Any],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    run_id = str(run["run_id"])
    iterations = repository.list_iterations(run_id)
    validators = repository.list_validator_results(run_id)
    pending_approvals = repository.list_approval_requests(run_id=run_id, status="pending")
    blocked_handoffs = repository.list_handoff_packets(run_id=run_id, status="blocked")
    rooms = repository.list_room_records(run_id=run_id)
    messages = repository.list_room_messages(run_id=run_id)
    tool_events = repository.list_tool_events(run_id=run_id)
    tasks = repository.list_operator_tasks(linked_run_id=run_id, include_archived=True)
    latest_validator = validators[-1] if validators else None
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"run:{run_id}"]

    age_hours = _status_confidence_age_hours(str(run.get("updated_at") or ""), now)
    if str(run.get("status")) in {"active", "running"} and age_hours is not None and age_hours > stale_age_hours:
        reason_codes.append("stale_active_run")
        reasons.append("Active run has not updated within the stale-age window.")
    if not iterations:
        reason_codes.append("no_iteration_evidence")
        reasons.append("Run has no recorded iterations.")
    if pending_approvals:
        reason_codes.append("pending_approval")
        reasons.append("Run has pending approval requests.")
        evidence_refs.extend([f"approval:{row['request_id']}" for row in pending_approvals[:4]])
    if blocked_handoffs:
        reason_codes.append("blocked_handoff")
        reasons.append("Run has blocked handoff packets.")
        evidence_refs.extend([f"handoff:{row['handoff_id']}" for row in blocked_handoffs[:4]])
    if latest_validator is not None:
        evidence_refs.append(f"validator_result:{latest_validator['id']}")
        if latest_validator["passed"]:
            reason_codes.append("validator_passed")
            reasons.append("Latest validator result passed.")
        else:
            reason_codes.append("latest_validator_failed")
            reasons.append("Latest validator result failed.")
    elif str(run.get("status")) in {"stopped", "done", "complete", "completed"}:
        reason_codes.append("unverified_terminal_run")
        reasons.append("Terminal-looking run status has no validator evidence.")
    if not rooms and not messages and not tool_events:
        reason_codes.append("no_room_activity")
        reasons.append("Run has no room, message, or tool-event activity.")
    if not reason_codes:
        reason_codes.append("run_status_supported")
        reasons.append("Run status has recent activity and no attention flags.")

    level = _status_confidence_level(reason_codes)
    return {
        "id": f"run:{run_id}",
        "subject_type": "run",
        "subject_id": run_id,
        "status": str(run.get("status") or ""),
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": str(run.get("updated_at") or ""),
        "age_hours": age_hours,
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "latest_iteration_id": iterations[-1]["iteration_id"] if iterations else None,
            "room_ids": [str(room["room_id"]) for room in rooms[:8]],
            "task_ids": [str(task["task_id"]) for task in tasks[:8]],
        },
        "signals": {
            "iterations": len(iterations),
            "validator_results": len(validators),
            "latest_validator_passed": latest_validator["passed"] if latest_validator else None,
            "pending_approvals": len(pending_approvals),
            "blocked_handoffs": len(blocked_handoffs),
            "rooms": len(rooms),
            "messages": len(messages),
            "tool_events": len(tool_events),
            "linked_tasks": len(tasks),
        },
    }


def _status_confidence_room_row(
    repository: LoopStateRepository,
    room: dict[str, Any],
    runs_by_id: dict[str, dict[str, Any]],
    *,
    now: datetime,
    stale_age_hours: int,
) -> dict[str, Any]:
    room_id = str(room["room_id"])
    run_id = room.get("run_id")
    linked_run = runs_by_id.get(str(run_id)) if run_id else None
    messages = repository.list_room_messages(room_id=room_id)
    tool_events = repository.list_tool_events(room_id=room_id)
    latest_activity = _status_confidence_latest_at(
        [str(room.get("updated_at") or "")]
        + [str(row.get("created_at") or "") for row in messages]
        + [str(row.get("created_at") or "") for row in tool_events]
    )
    reason_codes: list[str] = []
    reasons: list[str] = []
    evidence_refs = [f"room:{room_id}"]

    if not messages and not tool_events:
        reason_codes.append("no_activity_evidence")
        reasons.append("Room has no persisted messages or tool events.")
    if run_id and linked_run is None:
        reason_codes.append("missing_linked_run_record")
        reasons.append("Room references a run that is not present in SQLite state.")
    if linked_run:
        evidence_refs.append(f"run:{linked_run['run_id']}")
        run_age = _status_confidence_age_hours(str(linked_run.get("updated_at") or ""), now)
        if str(linked_run.get("status")) in {"active", "running"} and run_age is not None and run_age > stale_age_hours:
            reason_codes.append("linked_run_stale")
            reasons.append("Room is attached to a stale active run.")
    activity_age = _status_confidence_age_hours(latest_activity, now)
    if str(room.get("status")) == "active" and activity_age is not None and activity_age > stale_age_hours:
        reason_codes.append("room_activity_stale")
        reasons.append("Active room has no recent persisted activity.")
    if not reason_codes:
        reason_codes.append("room_status_supported")
        reasons.append("Room has persisted activity and no attention flags.")

    level = _status_confidence_level(reason_codes)
    return {
        "id": f"room:{room_id}",
        "subject_type": "room",
        "subject_id": room_id,
        "status": str(room.get("status") or ""),
        "confidence_level": level,
        "confidence_score": _status_confidence_score(level),
        "attention_flags": _status_confidence_attention(reason_codes),
        "updated_at": str(room.get("updated_at") or ""),
        "age_hours": _status_confidence_age_hours(str(room.get("updated_at") or ""), now),
        "reason_codes": reason_codes,
        "reasons": reasons[:6],
        "evidence_refs": evidence_refs[:10],
        "linked_refs": {
            "run_id": run_id,
            "iteration_id": room.get("iteration_id"),
            "task_id": room.get("task_id"),
        },
        "signals": {
            "participants": len(room.get("participants_json") or []),
            "messages": len(messages),
            "tool_events": len(tool_events),
            "latest_activity_at": latest_activity,
            "latest_activity_age_hours": activity_age,
        },
    }


def _sort_status_confidence_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rank = {"stale": 0, "partial": 1, "high": 2}

    def sort_key(row: dict[str, Any]) -> tuple[int, float, str]:
        updated = _parse_utc_iso_timestamp(str(row.get("updated_at") or "")) or datetime.fromtimestamp(0, timezone.utc)
        return (rank.get(str(row.get("confidence_level")), 9), -updated.timestamp(), str(row.get("id") or ""))

    return sorted(rows, key=sort_key)


def build_operator_status_confidence_payload(
    workspace: str | Path,
    *,
    task_id: str | None = None,
    run_id: str | None = None,
    room_id: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    safe_limit = _bounded_status_confidence_limit(limit)
    now = datetime.now(timezone.utc)
    runs_by_id = {str(row["run_id"]): row for row in repository.list_runs()}
    all_rooms = repository.list_room_records()
    rooms_by_id = {str(row["room_id"]): row for row in all_rooms}

    selected_tasks: list[dict[str, Any]]
    selected_runs: list[dict[str, Any]]
    selected_rooms: list[dict[str, Any]]

    if task_id:
        task = repository.get_operator_task(task_id)
        if task is None:
            raise FileNotFoundError(f"Operator task not found: {task_id}")
        selected_tasks = [task]
        linked_run_id = str(task.get("linked_run_id") or "")
        selected_runs = [runs_by_id[linked_run_id]] if linked_run_id in runs_by_id else []
        linked_room_ids = {str(item) for item in (task.get("linked_room_ids_json") or []) if isinstance(item, str)}
        selected_rooms = [
            room
            for room in all_rooms
            if str(room["room_id"]) in linked_room_ids or str(room.get("task_id") or "") == task_id
        ]
    elif run_id:
        if run_id not in runs_by_id:
            raise FileNotFoundError(f"Run not found: {run_id}")
        selected_runs = [runs_by_id[run_id]]
        selected_tasks = repository.list_operator_tasks(linked_run_id=run_id, include_archived=True)
        selected_rooms = repository.list_room_records(run_id=run_id)
    elif room_id:
        room = rooms_by_id.get(room_id)
        if room is None:
            raise FileNotFoundError(f"Room not found: {room_id}")
        selected_rooms = [room]
        linked_run_id = str(room.get("run_id") or "")
        selected_runs = [runs_by_id[linked_run_id]] if linked_run_id in runs_by_id else []
        selected_tasks = [
            task
            for task in repository.list_operator_tasks(include_archived=True)
            if str(task.get("task_id") or "") == str(room.get("task_id") or "")
            or room_id in [str(item) for item in (task.get("linked_room_ids_json") or [])]
        ]
    else:
        selected_tasks = repository.list_operator_tasks()
        selected_runs = list(runs_by_id.values())
        selected_rooms = all_rooms

    rows: list[dict[str, Any]] = []
    for task in selected_tasks:
        rows.append(
            _status_confidence_task_row(
                repository,
                task,
                runs_by_id,
                rooms_by_id,
                now=now,
                stale_age_hours=STALE_RUN_AGE_HOURS,
            )
        )
    for run in selected_runs:
        rows.append(_status_confidence_run_row(repository, run, now=now, stale_age_hours=STALE_RUN_AGE_HOURS))
    for room in selected_rooms:
        rows.append(
            _status_confidence_room_row(
                repository,
                room,
                runs_by_id,
                now=now,
                stale_age_hours=STALE_RUN_AGE_HOURS,
            )
        )

    sorted_rows = _sort_status_confidence_rows(rows)
    total_rows = len(sorted_rows)
    returned_rows = sorted_rows[:safe_limit]
    warning_count = sum(1 for row in rows if row["confidence_level"] in {"partial", "stale"})
    return {
        "generated_at": utc_iso(),
        "status": _status_from_counts(danger=0, warning=warning_count),
        "scope": {
            "task_id": task_id,
            "run_id": run_id,
            "room_id": room_id,
            "limit": safe_limit,
            "stale_age_hours": STALE_RUN_AGE_HOURS,
        },
        "diagnostics": returned_rows,
        "counts": {
            "returned": len(returned_rows),
            "total": total_rows,
            "tasks": sum(1 for row in rows if row["subject_type"] == "task"),
            "runs": sum(1 for row in rows if row["subject_type"] == "run"),
            "rooms": sum(1 for row in rows if row["subject_type"] == "room"),
            "high": sum(1 for row in rows if row["confidence_level"] == "high"),
            "partial": sum(1 for row in rows if row["confidence_level"] == "partial"),
            "stale": sum(1 for row in rows if row["confidence_level"] == "stale"),
            "blocked": sum(1 for row in rows if "blocked" in row.get("attention_flags", [])),
            "pending_approval": sum(1 for row in rows if "pending_approval" in row.get("attention_flags", [])),
            "truncated": total_rows > safe_limit,
        },
        "diagnostic_contract": {
            "read_only": True,
            "mutations_performed": False,
            "external_fetch_performed": False,
            "task_status_mutated": False,
            "run_status_mutated": False,
            "room_status_mutated": False,
        },
        "privacy": {
            "message_content_exposed": False,
            "tool_payload_values_exposed": False,
            "approval_payload_values_exposed": False,
            "raw_transcript_exposed": False,
            "detail": "Status-confidence diagnostics expose ids, statuses, counts, reason codes, and evidence refs only.",
        },
    }


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


def build_operator_summary_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = repository.list_runs()
    pending_approvals = repository.list_approval_requests(status="pending")
    rooms = repository.list_room_records()
    handoffs = repository.list_handoff_packets()
    latest_run = repository.get_most_recent_run()

    awaiting_approval_run_ids = {
        row["run_id"]
        for row in pending_approvals
        if isinstance(row.get("run_id"), str) and row.get("run_id")
    }

    failing_runs = 0
    latest_failure_reason: str | None = None
    latest_failure_at: str | None = None
    for run in runs:
        validator_results = repository.list_validator_results(run["run_id"])
        if not validator_results:
            continue
        latest_for_run = validator_results[-1]
        if not latest_for_run["passed"]:
            failing_runs += 1
        for row in validator_results:
            if row["passed"]:
                continue
            created_at = str(row["created_at"])
            if latest_failure_at is None or created_at > latest_failure_at:
                latest_failure_at = created_at
                latest_failure_reason = str(row.get("feedback_text") or "validation failed")

    return {
        "generated_at": utc_iso(),
        "runs": {
            "total": len(runs),
            "active": sum(1 for row in runs if str(row.get("status")) in {"active", "running"}),
            "awaiting_approval": len(awaiting_approval_run_ids),
            "with_failures": failing_runs,
            "latest_run_id": latest_run["run_id"] if latest_run else None,
            "latest_status": latest_run["status"] if latest_run else None,
        },
        "approvals": {
            "pending": len(pending_approvals),
        },
        "rooms": {
            "active": sum(1 for row in rooms if str(row.get("status")) == "active"),
            "review": sum(1 for row in rooms if str(row.get("room_type")) == "review"),
        },
        "validation": {
            "failing_runs": failing_runs,
            "latest_failure_reason": latest_failure_reason,
        },
        "handoffs": {
            "open": sum(1 for row in handoffs if str(row.get("status")) != "completed"),
            "blocked": sum(1 for row in handoffs if str(row.get("status")) == "blocked"),
        },
        "evidence": build_operator_evidence_summary_payload(workspace),
        "doctor": build_operator_doctor_evidence_payload(workspace),
        "runtime_roster": build_operator_runtime_roster_payload(workspace, probe_versions=False),
    }


def _parse_utc_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _sort_attention_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    severity_rank = {"danger": 0, "warning": 1, "info": 2}

    def sort_key(item: dict[str, Any]) -> tuple[int, float, str]:
        severity = severity_rank.get(str(item.get("severity")), 9)
        created_at = _parse_utc_iso_timestamp(str(item.get("created_at") or "")) or datetime.fromtimestamp(0, timezone.utc)
        return (severity, -created_at.timestamp(), str(item.get("id") or ""))

    return sorted(items, key=sort_key)


def _guess_agent_role(agent_id: str) -> str:
    normalized = agent_id.strip().lower()
    if any(token in normalized for token in ("validator", "sentinel", "gate")):
        return "validator"
    if any(token in normalized for token in ("review", "auditor", "critic")):
        return "reviewer"
    if any(token in normalized for token in ("research", "scout", "analyst")):
        return "researcher"
    if any(token in normalized for token in ("owner", "architect", "planner", "orchestr")):
        return "orchestrator"
    return "implementer"


def _role_archetype(role: str) -> str:
    return {
        "orchestrator": "Floor lead",
        "implementer": "Builder",
        "researcher": "Explorer",
        "reviewer": "Inspector",
        "validator": "Gatekeeper",
    }.get(role, "Operator")


def _derive_agent_status(*, latest_run_status: str | None, last_active: datetime | None) -> str:
    if latest_run_status in {"active", "running"}:
        return "running"
    if last_active is None:
        return "dormant"
    if datetime.now(timezone.utc) - last_active > timedelta(hours=24):
        return "dormant"
    return "idle"


def build_operator_inbox_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    items: list[dict[str, Any]] = []

    for request in repository.list_approval_requests(status="pending"):
        items.append(
            {
                "id": f"approval:{request['request_id']}",
                "kind": "approval",
                "severity": "warning",
                "title": f"Approval required for {request['action_type']}",
                "summary": f"{request['actor']} requested {request['action_type']}",
                "run_id": request.get("run_id"),
                "iteration_id": request.get("iteration_id"),
                "room_id": None,
                "created_at": request["updated_at"],
                "action_label": "Review approval",
            }
        )

    for run in repository.list_runs():
        validator_results = repository.list_validator_results(run["run_id"])
        if validator_results:
            latest_validator = validator_results[-1]
            if not latest_validator["passed"]:
                items.append(
                    {
                        "id": f"validator:{run['run_id']}:{latest_validator['id']}",
                        "kind": "validator_failure",
                        "severity": "danger",
                        "title": f"Validator failed for {run['run_id']}",
                        "summary": latest_validator.get("feedback_text") or "validation failed",
                        "run_id": run["run_id"],
                        "iteration_id": latest_validator.get("iteration_id"),
                        "room_id": None,
                        "created_at": latest_validator["created_at"],
                        "action_label": "Inspect run",
                    }
                )

        updated_at = _parse_utc_iso_timestamp(str(run.get("updated_at") or ""))
        if updated_at and str(run.get("status")) in {"active", "running"}:
            if datetime.now(timezone.utc) - updated_at > timedelta(hours=STALE_RUN_AGE_HOURS):
                items.append(
                    {
                        "id": f"stale-run:{run['run_id']}",
                        "kind": "stale_run",
                        "severity": "warning",
                        "title": f"Run {run['run_id']} looks stale",
                        "summary": f"Last updated at {run['updated_at']}",
                        "run_id": run["run_id"],
                        "iteration_id": None,
                        "room_id": None,
                        "created_at": run["updated_at"],
                        "action_label": "Inspect run",
                    }
                )

    for handoff in repository.list_handoff_packets(status="blocked"):
        packet = handoff.get("packet_json") if isinstance(handoff.get("packet_json"), dict) else {}
        items.append(
            {
                "id": f"handoff:{handoff['handoff_id']}",
                "kind": "handoff_attention",
                "severity": "warning",
                "title": f"Blocked handoff {handoff['handoff_id']}",
                "summary": str(packet.get("blocked_reason") or handoff.get("summary") or "handoff is blocked"),
                "run_id": handoff.get("run_id"),
                "iteration_id": handoff.get("iteration_id"),
                "room_id": None,
                "created_at": handoff["updated_at"],
                "action_label": "Inspect run",
            }
        )

    return {
        "items": _sort_attention_items(items),
        "count": len(items),
    }


def build_operator_task_reconcile_preview_payload(workspace: str | Path, task_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")

    linked_run = None
    approvals = repository.list_approval_requests(task_id=task_id, status="pending")
    validator_history: list[dict[str, Any]] = []
    handoffs: list[dict[str, Any]] = []
    linked_run_id = task.get("linked_run_id")
    if isinstance(linked_run_id, str) and linked_run_id:
        linked_run = _ensure_run_exists(repository, linked_run_id)
        approvals.extend(
            [
                row
                for row in repository.list_approval_requests(run_id=linked_run_id, status="pending")
                if row.get("task_id") != task_id
            ]
        )
        validator_history = repository.list_validator_results(linked_run_id)
        handoffs = repository.list_handoff_packets(run_id=linked_run_id, status="blocked")

    return reconcile_operator_task(
        task,
        linked_run=linked_run,
        approvals=approvals,
        validator_history=validator_history,
        handoffs=handoffs,
        stale_age_hours=STALE_RUN_AGE_HOURS,
    )


def build_operator_agents_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = repository.list_runs()
    approvals = repository.list_approval_requests()
    rooms = repository.list_room_records()
    memory_records = repository.list_memory_records()
    handoffs = repository.list_handoff_packets()

    known_ids: set[str] = set()

    def ingest(value: str | None) -> None:
        if not value:
            return
        normalized = value.strip()
        if not normalized:
            return
        if normalized.lower() in {"user", "human", "cli", "system", "tool"}:
            return
        known_ids.add(normalized)

    for approval in approvals:
        ingest(str(approval.get("actor") or ""))
        ingest(str(approval.get("reviewer") or ""))
    for room in rooms:
        ingest(str(room.get("created_by") or ""))
        for participant in room.get("participants_json") or []:
            if isinstance(participant, str):
                ingest(participant)
    for row in memory_records:
        ingest(str(row.get("agent_id") or ""))
    for handoff in handoffs:
        ingest(str(handoff.get("from_actor") or ""))
        ingest(str(handoff.get("to_actor") or ""))
    for run in runs:
        plan = repository.get_task_plan(run["run_id"])
        ingest(str((plan or {}).get("owner") or ""))
        build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
        if build_checkpoint:
            ingest(str((build_checkpoint.get("state_json") or {}).get("agent_id") or ""))
        planner_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="planner")
        if planner_checkpoint:
            ingest(str((planner_checkpoint.get("state_json") or {}).get("agent_id") or ""))

    agent_rows: list[dict[str, Any]] = []
    for agent_id in sorted(known_ids):
        role = _guess_agent_role(agent_id)
        related_runs: list[dict[str, Any]] = []
        latest_blocker: tuple[str | None, str | None] = (None, None)
        for run in runs:
            plan = repository.get_task_plan(run["run_id"])
            owner = str((plan or {}).get("owner") or "")
            build_checkpoint = repository.get_latest_orchestration_checkpoint(run_id=run["run_id"], graph_kind="build")
            checkpoint_agent = str(((build_checkpoint or {}).get("state_json") or {}).get("agent_id") or "")
            if agent_id not in {owner, checkpoint_agent}:
                continue
            related_runs.append(run)

            for validator in repository.list_validator_results(run["run_id"]):
                if validator["passed"]:
                    continue
                created_at = str(validator["created_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, str(validator.get("feedback_text") or "validation failed"))
            for approval in approvals:
                if approval.get("status") != "pending":
                    continue
                if approval.get("run_id") != run["run_id"] and approval.get("actor") != agent_id:
                    continue
                created_at = str(approval["updated_at"])
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, f"approval pending: {approval['action_type']}")
            for handoff in handoffs:
                if handoff.get("status") != "blocked":
                    continue
                if handoff.get("run_id") != run["run_id"] and agent_id not in {handoff.get("from_actor"), handoff.get("to_actor")}:
                    continue
                created_at = str(handoff["updated_at"])
                blocked_reason = ""
                if isinstance(handoff.get("packet_json"), dict):
                    blocked_reason = str(handoff["packet_json"].get("blocked_reason") or "")
                if latest_blocker[0] is None or created_at > latest_blocker[0]:
                    latest_blocker = (created_at, blocked_reason or str(handoff.get("summary") or "handoff blocked"))

        latest_run = None
        if related_runs:
            latest_run = max(related_runs, key=lambda row: str(row.get("updated_at") or ""))

        related_rooms = [
            room
            for room in rooms
            if agent_id == str(room.get("created_by") or "")
            or agent_id in {p for p in (room.get("participants_json") or []) if isinstance(p, str)}
        ]
        latest_room = max(related_rooms, key=lambda row: str(row.get("updated_at") or ""), default=None)

        memory_count = sum(1 for row in memory_records if str(row.get("agent_id") or "") == agent_id)
        pending_approvals = sum(
            1
            for row in approvals
            if row.get("status") == "pending" and (row.get("actor") == agent_id or row.get("run_id") in {r["run_id"] for r in related_runs})
        )

        validator_failures = 0
        for run in related_runs:
            validator_results = repository.list_validator_results(run["run_id"])
            if validator_results and not validator_results[-1]["passed"]:
                validator_failures += 1
        error_rate = (validator_failures / len(related_runs)) if related_runs else 0.0

        activity_candidates = [
            _parse_utc_iso_timestamp(str(item))
            for item in [
                latest_run["updated_at"] if latest_run else None,
                latest_room["updated_at"] if latest_room else None,
                max(
                    (
                        str(row.get("created_at") or "")
                        for row in memory_records
                        if str(row.get("agent_id") or "") == agent_id
                    ),
                    default="",
                ),
            ]
        ]
        last_active_dt = max((item for item in activity_candidates if item is not None), default=None)
        last_active = (last_active_dt or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        agent_rows.append(
            {
                "agent_id": agent_id,
                "name": agent_id,
                "role": role,
                "archetype": _role_archetype(role),
                "status": _derive_agent_status(
                    latest_run_status=str(latest_run.get("status")) if latest_run else None,
                    last_active=last_active_dt,
                ),
                "room_id": str((latest_room or {}).get("room_id") or "unassigned"),
                "task_count": len(related_runs),
                "last_active": last_active,
                "memory_count": memory_count,
                "error_rate": round(error_rate, 4),
                "latest_run_id": str(latest_run.get("run_id")) if latest_run else None,
                "latest_run_status": str(latest_run.get("status")) if latest_run else None,
                "latest_blocker": latest_blocker[1],
                "pending_approvals": pending_approvals,
                "workspace_ref": None,
            }
        )

    return {
        "agents": sorted(agent_rows, key=lambda row: (row["role"], row["name"])),
        "count": len(agent_rows),
    }

    failing_runs = 0
    latest_failure_reason: str | None = None
    latest_failure_at: str | None = None
    for run in runs:
        validator_results = repository.list_validator_results(run["run_id"])
        if not validator_results:
            continue
        latest_for_run = validator_results[-1]
        if not latest_for_run["passed"]:
            failing_runs += 1
        for row in validator_results:
            if row["passed"]:
                continue
            created_at = str(row["created_at"])
            if latest_failure_at is None or created_at > latest_failure_at:
                latest_failure_at = created_at
                latest_failure_reason = str(row.get("feedback_text") or "validation failed")

    return {
        "generated_at": utc_iso(),
        "runs": {
            "total": len(runs),
            "active": sum(1 for row in runs if str(row.get("status")) in {"active", "running"}),
            "awaiting_approval": len(awaiting_approval_run_ids),
            "with_failures": failing_runs,
            "latest_run_id": latest_run["run_id"] if latest_run else None,
            "latest_status": latest_run["status"] if latest_run else None,
        },
        "approvals": {
            "pending": len(pending_approvals),
        },
        "rooms": {
            "active": sum(1 for row in rooms if str(row.get("status")) == "active"),
            "review": sum(1 for row in rooms if str(row.get("room_type")) == "review"),
        },
        "validation": {
            "failing_runs": failing_runs,
            "latest_failure_reason": latest_failure_reason,
        },
        "handoffs": {
            "open": sum(1 for row in handoffs if str(row.get("status")) != "completed"),
            "blocked": sum(1 for row in handoffs if str(row.get("status")) == "blocked"),
        },
    }


def build_run_detail_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    run = _ensure_run_exists(repository, run_id)
    iterations = repository.list_iterations(run_id)
    latest_iteration = iterations[-1] if iterations else None
    return {
        "run": run,
        "iterations": iterations,
        "latest_iteration": latest_iteration,
        "task_plan": repository.get_task_plan(run_id),
        "counts": _run_counts(repository, run_id),
    }


def build_run_state_docs_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    task_plan = TaskPlanWriterReader(repository).read(run_id)
    findings_service = FindingsAppendService(repository)
    progress_service = ProgressAppendOnlyService(repository)
    latest_context = LatestContextSkeletonGenerator(repository)
    return {
        "run_id": run_id,
        "documents": {
            "task_plan": {
                "path": _relative_display_path(task_plan_path(workspace_root), workspace_root),
                "content": task_plan["markdown"] if task_plan else "# task_plan.md\n\n_No active plan._\n",
            },
            "findings": {
                "path": _relative_display_path(findings_path(workspace_root), workspace_root),
                "content": findings_service.render(run_id),
            },
            "progress": {
                "path": _relative_display_path(progress_path(workspace_root), workspace_root),
                "content": progress_service.render_entries(repository.list_progress_entries(run_id), run_id=run_id),
            },
            "latest_context": {
                "path": _relative_display_path(latest_context_path(workspace_root), workspace_root),
                "content": latest_context.render(run_id),
            },
        },
    }


def build_run_context_latest_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    latest_context = LatestContextSkeletonGenerator(repository)
    runtime_path = latest_context_path(workspace_root)
    repo_path = _repo_latest_context_path(workspace_root)
    return {
        "run_id": run_id,
        "runtime_latest": {
            "path": _relative_display_path(runtime_path, workspace_root),
            "content": latest_context.render(run_id),
        },
        "repo_latest": (
            {
                "path": _relative_display_path(repo_path, workspace_root),
                "content": _read_optional_text(repo_path),
            }
            if repo_path.exists()
            else None
        ),
    }


def build_approvals_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    iteration_id: str | None = None,
    task_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    return {
        "approvals": repository.list_approval_requests(run_id=run_id, iteration_id=iteration_id, task_id=task_id, status=status),
    }


def build_approval_detail_payload(workspace: str | Path, request_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    approval = repository.get_approval_request(request_id)
    if approval is None:
        raise FileNotFoundError(f"Approval request not found: {request_id}")
    return {"approval": approval}


def request_operator_task_approval(
    workspace: str | Path,
    *,
    task_id: str,
    actor: str,
    rationale: str | None = None,
    requested_changes: list[str] | None = None,
    draft_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    task = repository.get_operator_task(task_id)
    if task is None:
        raise FileNotFoundError(f"Operator task not found: {task_id}")
    _ensure_operator_task_approval_request_allowed(task)
    if not task.get("linked_run_id") or not task.get("linked_iteration_id"):
        raise ValueError("Operator task approval requests currently require linked run and iteration ids.")

    existing_pending = repository.list_approval_requests(task_id=task_id, status="pending")
    if existing_pending:
        return existing_pending[0]

    adapter = ApprovalInterruptAdapter(workspace)
    payload = {
        "task": task,
        "rationale": rationale,
        "requested_changes": requested_changes or [],
        "draft_snapshot": draft_snapshot or {},
    }
    return adapter.enqueue_request(
        run_id=str(task["linked_run_id"]),
        iteration_id=str(task["linked_iteration_id"]),
        task_id=task_id,
        actor=actor,
        action_type="operator_task_update",
        action_payload=payload,
    )


def _ensure_active_resume_request(runtime: LocalOrchestrationRuntime, *, run_id: str, request_id: str) -> None:
    state = runtime.resume(run_id, "build")
    if state is None or state.pending_approval_request_id != request_id:
        raise ValueError("Approval request is not the active pending approval for this run")


def _stream_snapshot_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    replay = ReplayService(workspace)
    payload: dict[str, Any] = {
        "generated_at": time.time(),
        "run_id": run_id,
        "room_id": room_id,
        "pending_approvals": repository.list_approval_requests(run_id=run_id, status="pending"),
    }
    if run_id:
        timeline = replay.run_timeline(run_id)
        payload["latest_run_event"] = timeline["timeline"][-1] if timeline["timeline"] else None
    if room_id:
        room_timeline = replay.room_timeline(room_id)
        payload["latest_room_event"] = room_timeline["timeline"][-1] if room_timeline["timeline"] else None
    return payload


def serialize_sse_event(*, event: str, data: dict[str, Any], event_id: str | None = None) -> bytes:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, ensure_ascii=False)
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _build_handler(
    workspace: str | Path,
    auth_token: str,
    reviewer_identity: str,
) -> type[BaseHTTPRequestHandler]:
    workspace_root = Path(workspace)
    replay = ReplayService(workspace_root)
    approvals = ApprovalInterruptAdapter(workspace_root)
    runtime = LocalOrchestrationRuntime(workspace_root)

    class ForwardBridgeHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            if not _request_is_loopback(self):
                _forward_json_response(self, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
                return
            if _loopback_origin(self) is None:
                _forward_json_response(self, {"error": "Missing or invalid loopback origin."}, status=403)
                return
            _forward_text_response(self, "", status=204, content_type="text/plain; charset=utf-8")

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query or "", keep_blank_values=False)
            if path.startswith("/api/") and not _require_bridge_read_access(self, auth_token):
                return
            if path in {"/", "/index.html"}:
                _forward_text_response(self, _bridge_root_html())
                return
            if path == "/api/events/stream":
                run_id = query.get("run_id", [None])[0]
                room_id = query.get("room_id", [None])[0]
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id") if run_id else None
                    safe_room_id = validate_room_id(room_id) if room_id else None
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                    return
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Connection", "keep-alive")
                    for key, value in _forward_extra_headers(self).items():
                        self.send_header(key, value)
                    self.end_headers()
                    event_id = 0
                    snapshot = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                    last_payload_key = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
                    self.wfile.write(serialize_sse_event(event="snapshot", data=snapshot, event_id=str(event_id)))
                    self.wfile.flush()
                    while True:
                        time.sleep(1)
                        current = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                        current_key = json.dumps(current, ensure_ascii=False, sort_keys=True)
                        event_id += 1
                        if current_key != last_payload_key:
                            self.wfile.write(serialize_sse_event(event="snapshot", data=current, event_id=str(event_id)))
                            last_payload_key = current_key
                        else:
                            self.wfile.write(
                                serialize_sse_event(
                                    event="heartbeat",
                                    data={"ts": time.time(), "run_id": safe_run_id, "room_id": safe_room_id},
                                    event_id=str(event_id),
                                )
                            )
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, FileNotFoundError, ValueError, OSError):
                    return
                except Exception as exc:
                    self.log_error("Forward stream unexpected error: %s", exc)
                    return
                return
            if path == "/api/runs":
                _forward_json_response(self, build_runs_payload(workspace_root))
                return
            if path == "/api/operator/summary":
                _forward_json_response(self, build_operator_summary_payload(workspace_root))
                return
            if path == "/api/operator/evidence-summary":
                _forward_json_response(self, build_operator_evidence_summary_payload(workspace_root))
                return
            if path == "/api/operator/doctor-evidence":
                _forward_json_response(self, build_operator_doctor_evidence_payload(workspace_root))
                return
            if path == "/api/operator/runtime-roster":
                try:
                    runtime_id = query.get("runtime", [None])[0]
                    category = query.get("category", [None])[0]
                    raw_probe_versions = str(query.get("probe_versions", ["1"])[0]).strip().lower()
                    probe_versions = raw_probe_versions not in {"0", "false", "no", "off"}
                    _forward_json_response(
                        self,
                        build_operator_runtime_roster_payload(
                            workspace_root,
                            probe_versions=probe_versions,
                            runtime_id=runtime_id,
                            category=category,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/status-confidence":
                try:
                    raw_task_id = query.get("task_id", [None])[0]
                    raw_run_id = query.get("run_id", [None])[0]
                    raw_room_id = query.get("room_id", [None])[0]
                    safe_task_id = _validate_api_identifier(raw_task_id, field_name="task_id") if raw_task_id else None
                    safe_run_id = _validate_api_identifier(raw_run_id, field_name="run_id") if raw_run_id else None
                    safe_room_id = validate_room_id(raw_room_id) if raw_room_id else None
                    raw_limit = int(query.get("limit", [str(STATUS_CONFIDENCE_DEFAULT_LIMIT)])[0])
                    _forward_json_response(
                        self,
                        build_operator_status_confidence_payload(
                            workspace_root,
                            task_id=safe_task_id,
                            run_id=safe_run_id,
                            room_id=safe_room_id,
                            limit=raw_limit,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path == "/api/operator/wake-readiness":
                try:
                    raw_task_id = query.get("task_id", [None])[0]
                    raw_run_id = query.get("run_id", [None])[0]
                    raw_room_id = query.get("room_id", [None])[0]
                    safe_task_id = _validate_api_identifier(raw_task_id, field_name="task_id") if raw_task_id else None
                    safe_run_id = _validate_api_identifier(raw_run_id, field_name="run_id") if raw_run_id else None
                    safe_room_id = validate_room_id(raw_room_id) if raw_room_id else None
                    raw_limit = int(query.get("limit", [str(WAKE_READINESS_DEFAULT_LIMIT)])[0])
                    _forward_json_response(
                        self,
                        build_operator_wake_readiness_payload(
                            workspace_root,
                            task_id=safe_task_id,
                            run_id=safe_run_id,
                            room_id=safe_room_id,
                            limit=raw_limit,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path == "/api/operator/workflow-contracts":
                try:
                    workflow_ref = query.get("workflow", [None])[0]
                    _forward_json_response(
                        self,
                        build_operator_workflow_contracts_payload(workspace_root, workflow_ref=workflow_ref),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path == "/api/operator/turn-records":
                try:
                    raw_run_id = query.get("run_id", [None])[0]
                    raw_room_id = query.get("room_id", [None])[0]
                    safe_run_id = _validate_api_identifier(raw_run_id, field_name="run_id") if raw_run_id else None
                    safe_room_id = validate_room_id(raw_room_id) if raw_room_id else None
                    raw_limit = int(query.get("limit", [str(TURN_RECORD_DEFAULT_LIMIT)])[0])
                    _forward_json_response(
                        self,
                        build_operator_turn_records_payload(
                            workspace_root,
                            run_id=safe_run_id,
                            room_id=safe_room_id,
                            limit=raw_limit,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/inbox":
                _forward_json_response(self, build_operator_inbox_payload(workspace_root))
                return
            if path == "/api/operator/agents":
                _forward_json_response(self, build_operator_agents_payload(workspace_root))
                return
            if path == "/api/operator/tasks":
                try:
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in OPERATOR_TASK_STATUSES:
                        raise ValueError(f"Unsupported operator task status: {safe_status}")
                    safe_owner = query.get("owner_agent_id", [None])[0]
                    if safe_owner:
                        safe_owner = _validate_api_identifier(safe_owner, field_name="owner_agent_id")
                    safe_workspace_ref = query.get("workspace_ref", [None])[0]
                    if safe_workspace_ref:
                        safe_workspace_ref = _validate_api_identifier(safe_workspace_ref, field_name="workspace_ref")
                    raw_include_archived = str(query.get("include_archived", ["0"])[0]).strip().lower()
                    include_archived = raw_include_archived in {"1", "true", "yes", "on"}
                    _forward_json_response(
                        self,
                        build_operator_tasks_payload(
                            workspace_root,
                            status=safe_status,
                            owner_agent_id=safe_owner,
                            workspace_ref=safe_workspace_ref,
                            include_archived=include_archived,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/workspaces":
                try:
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in OPERATOR_WORKSPACE_STATUSES_SET:
                        raise ValueError(f"Unsupported operator workspace status: {safe_status}")
                    safe_owner = query.get("owner_agent_id", [None])[0]
                    if safe_owner:
                        safe_owner = _validate_api_identifier(safe_owner, field_name="owner_agent_id")
                    _forward_json_response(
                        self,
                        build_operator_workspaces_payload(workspace_root, status=safe_status, owner_agent_id=safe_owner),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/reconcile-preview"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/reconcile-preview"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, build_operator_task_reconcile_preview_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, build_operator_task_detail_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            if path.startswith("/api/operator/workspaces/"):
                workspace_id = unquote(path.removeprefix("/api/operator/workspaces/"))
                try:
                    safe_workspace_id = _validate_api_identifier(workspace_id, field_name="workspace_id")
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                return
            # --- Persistent Agent Registry (ADR-0002, Batch 1) ---
            if path == "/api/agents":
                try:
                    agents = agent_list()
                    summaries = [
                        {
                            "id": a.get("id", ""),
                            "role": a.get("role", ""),
                            "status": a.get("status", "active"),
                            "public_persona": a.get("public_persona", ""),
                            "skills_count": len(a.get("skills", [])),
                        }
                        for a in agents
                    ]
                    _forward_json_response(self, {"agents": summaries, "total": len(summaries)})
                except Exception as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=500)
                return
            if path.startswith("/api/agents/"):
                agent_id = unquote(path.removeprefix("/api/agents/"))
                if not agent_id:
                    _forward_json_response(self, {"error": "agent_id required"}, status=400)
                    return
                try:
                    detail = agent_show(agent_id)
                    skills = detail.get("skills", [])
                    if isinstance(skills, str):
                        skills = [s.strip() for s in skills.split(",") if s.strip()]
                    result = {
                        "id": detail.get("id", detail.get("agent_id", agent_id)),
                        "role": detail.get("role", ""),
                        "status": detail.get("status", "active"),
                        "public_persona": detail.get("public_persona", detail.get("summary", "")),
                        "skills": skills,
                        "memory_namespace": detail.get("memory_namespace", ""),
                        "hermes_profile": detail.get("hermes_profile", ""),
                        "pending_patches": detail.get("pending_patches", []),
                    }
                    _forward_json_response(self, {"agent": result})
                except FileNotFoundError:
                    _forward_json_response(self, {"error": f"Agent {agent_id} not found"}, status=404)
                except Exception as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=500)
                return
            # --- Communication Ledger (ADR-0002, Batch 2) ---
            if path == "/api/threads":
                try:
                    ws = query.get("workspace", [None])[0]
                    st = query.get("status", [None])[0]
                    threads = thread_list(workspace=ws, status=st)
                    _forward_json_response(self, {"threads": threads, "total": len(threads)})
                except Exception as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=500)
                return
            if path == "/api/threads/search":
                try:
                    q = query.get("q", [""])[0]
                    if not q:
                        _forward_json_response(self, {"error": "q parameter required"}, status=400)
                        return
                    raw_limit = int(query.get("limit", ["20"])[0])
                    safe_limit = max(1, min(raw_limit, 100))
                    results = thread_search(q, limit=safe_limit)
                    _forward_json_response(self, {"results": results, "total": len(results)})
                except Exception as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=500)
                return
            if path.startswith("/api/threads/"):
                thread_id = unquote(path.removeprefix("/api/threads/"))
                if not thread_id:
                    _forward_json_response(self, {"error": "thread_id required"}, status=400)
                    return
                try:
                    detail = thread_show(thread_id)
                    if detail is None:
                        _forward_json_response(self, {"error": f"Thread {thread_id} not found"}, status=404)
                    else:
                        _forward_json_response(self, {"thread": detail})
                except Exception as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=500)
                return
            if path == "/api/approvals":
                try:
                    safe_run_id = _validate_api_identifier(query.get("run_id", [None])[0], field_name="run_id") if query.get("run_id", [None])[0] else None
                    safe_iteration_id = _validate_api_identifier(query.get("iteration_id", [None])[0], field_name="iteration_id") if query.get("iteration_id", [None])[0] else None
                    safe_task_id = _validate_api_identifier(query.get("task_id", [None])[0], field_name="task_id") if query.get("task_id", [None])[0] else None
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in APPROVAL_STATUSES:
                        raise ValueError(f"Unsupported approval status: {safe_status}")
                    _forward_json_response(
                        self,
                        build_approvals_payload(
                            workspace_root,
                            run_id=safe_run_id,
                            iteration_id=safe_iteration_id,
                            task_id=safe_task_id,
                            status=safe_status,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/"):
                request_id = unquote(path.removeprefix("/api/approvals/"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    _forward_json_response(self, build_approval_detail_payload(workspace_root, safe_request_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/replay"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/replay"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _ensure_run_exists(replay.repository, safe_run_id)
                    _forward_json_response(self, replay.run_timeline(safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/state-docs"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/state-docs"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_state_docs_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/context-latest"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/context-latest"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_context_latest_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/"):
                run_id = unquote(path.removeprefix("/api/runs/"))
                try:
                    _forward_json_response(self, build_run_detail_payload(workspace_root, _validate_api_identifier(run_id, field_name="run_id")))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/rooms/") and path.endswith("/timeline"):
                room_id = unquote(path.removeprefix("/api/rooms/").removesuffix("/timeline"))
                try:
                    _forward_json_response(self, replay.room_timeline(validate_room_id(room_id)))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            try:
                payload = _read_json_body(self)
            except OverflowError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=413)
                return
            except ValueError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/tasks":
                try:
                    task_fields = _parse_operator_task_payload(payload)
                    title = task_fields["title"]
                    objective = task_fields["objective"]
                    if not title:
                        raise ValueError("Operator task title is required.")
                    if not objective:
                        raise ValueError("Operator task objective is required.")
                    task_id = payload.get("task_id")
                    safe_task_id = (
                        _validate_api_identifier(str(task_id), field_name="task_id")
                        if isinstance(task_id, str) and task_id.strip()
                        else _next_operator_task_id()
                    )
                    repository = LoopStateRepository(workspace_root)
                    _ensure_operator_task_workspace_reference_allowed(
                        repository,
                        current_task=None,
                        next_fields=task_fields,
                    )
                    task = repository.create_operator_task(
                        task_id=safe_task_id,
                        title=title,
                        objective=objective,
                        status=task_fields["status"],
                        priority=task_fields["priority"],
                        owner_agent_id=task_fields["owner_agent_id"],
                        linked_run_id=task_fields["linked_run_id"],
                        linked_iteration_id=task_fields["linked_iteration_id"],
                        linked_room_ids=task_fields["linked_room_ids"],
                        blocked_reason=task_fields["blocked_reason"],
                        acceptance=task_fields["acceptance"],
                        workspace_ref=task_fields["workspace_ref"],
                    )
                    _refresh_operator_workspace_membership(repository, task_fields["workspace_ref"])
                    _forward_json_response(self, {"task": task}, status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path == "/api/operator/workspaces":
                try:
                    workspace_fields = _parse_operator_workspace_payload(payload)
                    if not workspace_fields["label"]:
                        raise ValueError("Operator workspace label is required.")
                    if not workspace_fields["path"]:
                        raise ValueError("Operator workspace path is required.")
                    if workspace_fields["status"] == "archived" and not workspace_fields["archive_note"]:
                        raise ValueError("Workspace archive rationale is required.")
                    workspace_id = payload.get("workspace_id")
                    safe_workspace_id = (
                        _validate_api_identifier(str(workspace_id), field_name="workspace_id")
                        if isinstance(workspace_id, str) and workspace_id.strip()
                        else _next_operator_workspace_id()
                    )
                    repository = LoopStateRepository(workspace_root)
                    repository.create_operator_workspace(
                        workspace_id=safe_workspace_id,
                        label=workspace_fields["label"],
                        path=workspace_fields["path"],
                        kind=workspace_fields["kind"],
                        status=workspace_fields["status"],
                        owner_agent_id=workspace_fields["owner_agent_id"],
                        linked_run_id=workspace_fields["linked_run_id"],
                        linked_iteration_id=workspace_fields["linked_iteration_id"],
                        task_ids=workspace_fields["task_ids"],
                        notes=workspace_fields["notes"],
                        archived_at=utc_iso() if workspace_fields["status"] == "archived" else None,
                        archived_by=reviewer_identity if workspace_fields["status"] == "archived" else None,
                        archive_note=workspace_fields["archive_note"] if workspace_fields["status"] == "archived" else None,
                    )
                    _refresh_operator_workspace_membership(repository, safe_workspace_id)
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id), status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/") and path.endswith("/decision"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/decision"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    status = str(payload.get("status") or "").strip()
                    reviewer_note = str(payload.get("reviewer_note") or "").strip()
                    if status not in APPROVAL_STATUSES - {"pending"}:
                        raise ValueError(f"Unsupported approval status: {status}")
                    decided = approvals.decide(
                        request_id=safe_request_id,
                        status=status,
                        reviewer=reviewer_identity,
                        reviewer_note=reviewer_note,
                        edited_payload=payload.get("edited_payload") if isinstance(payload.get("edited_payload"), dict) else None,
                    )
                    _forward_json_response(self, {"approval": decided})
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/approvals/") and path.endswith("/resume"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/resume"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    request = build_approval_detail_payload(workspace_root, safe_request_id)["approval"]
                    _ensure_active_resume_request(runtime, run_id=request["run_id"], request_id=safe_request_id)
                    state = runtime.resume_after_approval(request["run_id"], graph_kind="build")
                    _forward_json_response(
                        self,
                        {
                            "approval": request,
                            "state": {
                                "run_id": state.run_id,
                                "current_step": state.current_step,
                                "stop_reason": state.stop_reason,
                                "approval_pending": state.approval_pending,
                            },
                        },
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/request-approval"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/request-approval"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    requested = request_operator_task_approval(
                        workspace_root,
                        task_id=safe_task_id,
                        actor=reviewer_identity,
                        rationale=str(payload.get("rationale") or "").strip() or None,
                        requested_changes=[
                            str(item)
                            for item in (payload.get("requested_changes") or [])
                            if isinstance(item, str)
                        ],
                        draft_snapshot=payload.get("draft_snapshot") if isinstance(payload.get("draft_snapshot"), dict) else None,
                    )
                    _forward_json_response(self, {"approval": requested}, status=201)
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/detach-workspace"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/detach-workspace"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, detach_operator_task_workspace_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/archive"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/archive"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(
                        self,
                        archive_operator_task_payload(
                            workspace_root,
                            safe_task_id,
                            actor=reviewer_identity,
                            archive_note=_parse_archive_note(payload),
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/tasks/") and path.endswith("/restore"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/").removesuffix("/restore"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    _forward_json_response(self, restore_operator_task_payload(workspace_root, safe_task_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_PATCH(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            try:
                payload = _read_json_body(self)
            except OverflowError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=413)
                return
            except ValueError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    repository = LoopStateRepository(workspace_root)
                    current_task = repository.get_operator_task(safe_task_id)
                    if current_task is None:
                        raise ValueError(f"Operator task not found: {safe_task_id}")
                    task_fields = _parse_operator_task_payload(payload)
                    if not task_fields["title"]:
                        raise ValueError("Operator task title is required.")
                    if not task_fields["objective"]:
                        raise ValueError("Operator task objective is required.")
                    _ensure_operator_task_workspace_reference_allowed(
                        repository,
                        current_task=current_task,
                        next_fields=task_fields,
                    )
                    _ensure_operator_task_update_allowed(
                        repository,
                        current_task=current_task,
                        next_fields=task_fields,
                    )
                    task = repository.update_operator_task(
                        task_id=safe_task_id,
                        title=task_fields["title"],
                        objective=task_fields["objective"],
                        status=task_fields["status"],
                        priority=task_fields["priority"],
                        owner_agent_id=task_fields["owner_agent_id"],
                        linked_run_id=task_fields["linked_run_id"],
                        linked_iteration_id=task_fields["linked_iteration_id"],
                        linked_room_ids=task_fields["linked_room_ids"],
                        blocked_reason=task_fields["blocked_reason"],
                        acceptance=task_fields["acceptance"],
                        workspace_ref=task_fields["workspace_ref"],
                    )
                    _refresh_operator_workspace_membership(repository, current_task.get("workspace_ref"))
                    _refresh_operator_workspace_membership(repository, task_fields["workspace_ref"])
                    _forward_json_response(self, {"task": task})
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            if path.startswith("/api/operator/workspaces/"):
                workspace_id = unquote(path.removeprefix("/api/operator/workspaces/"))
                try:
                    safe_workspace_id = _validate_api_identifier(workspace_id, field_name="workspace_id")
                    repository = LoopStateRepository(workspace_root)
                    current_workspace = repository.get_operator_workspace(safe_workspace_id)
                    if current_workspace is None:
                        raise ValueError(f"Operator workspace not found: {safe_workspace_id}")
                    workspace_fields = _parse_operator_workspace_payload(payload)
                    if not workspace_fields["label"]:
                        raise ValueError("Operator workspace label is required.")
                    if not workspace_fields["path"]:
                        raise ValueError("Operator workspace path is required.")
                    _ensure_operator_workspace_update_allowed(
                        repository,
                        current_workspace=current_workspace,
                        next_fields=workspace_fields,
                    )
                    archiving_workspace = current_workspace.get("status") != "archived" and workspace_fields["status"] == "archived"
                    repository.update_operator_workspace(
                        workspace_id=safe_workspace_id,
                        label=workspace_fields["label"],
                        path=workspace_fields["path"],
                        kind=workspace_fields["kind"],
                        status=workspace_fields["status"],
                        owner_agent_id=workspace_fields["owner_agent_id"],
                        linked_run_id=workspace_fields["linked_run_id"],
                        linked_iteration_id=workspace_fields["linked_iteration_id"],
                        task_ids=workspace_fields["task_ids"],
                        notes=workspace_fields["notes"],
                        archived_by=reviewer_identity if archiving_workspace else None,
                        archive_note=workspace_fields["archive_note"] if workspace_fields["status"] == "archived" else None,
                    )
                    _refresh_operator_workspace_membership(repository, safe_workspace_id)
                    _forward_json_response(self, build_operator_workspace_detail_payload(workspace_root, safe_workspace_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_DELETE(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            if path.startswith("/api/operator/tasks/"):
                task_id = unquote(path.removeprefix("/api/operator/tasks/"))
                try:
                    safe_task_id = _validate_api_identifier(task_id, field_name="task_id")
                    repository = LoopStateRepository(workspace_root)
                    current_task = repository.get_operator_task(safe_task_id)
                    _forward_json_response(self, delete_operator_task_payload(workspace_root, safe_task_id))
                    if current_task is not None:
                        _refresh_operator_workspace_membership(repository, current_task.get("workspace_ref"))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except RuntimeError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=409)
                return
            # --- Patch Approval shortcuts (ADR-0002, Batch 5) ---
            if path.startswith("/api/approvals/") and path.endswith("/approve"):
                patch_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/approve"))
                try:
                    from ensemble_agent_registry import agent_apply_patch
                    result = agent_apply_patch(patch_id)
                    _forward_json_response(self, {"approval": result})
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/approvals/") and path.endswith("/reject"):
                patch_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/reject"))
                try:
                    reason = str(payload.get("reason", "")).strip()
                    _forward_json_response(self, {"patch_id": patch_id, "status": "rejected", "reason": reason})
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

    return ForwardBridgeHandler


def launch_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    if not _host_is_loopback(host):
        raise ValueError("Forward bridge host must be loopback-only (127.0.0.1, ::1, or localhost).")
    auth_token = secrets.token_urlsafe(24)
    resolved_reviewer_identity = _resolve_reviewer_identity(reviewer_identity)
    handler = _build_handler(workspace, auth_token, resolved_reviewer_identity)
    server = ThreadingHTTPServer((host, port), handler)
    actual_host, actual_port = server.server_address[0], server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    original_shutdown = server.shutdown

    def shutdown_and_close() -> None:
        original_shutdown()
        server.server_close()

    server.shutdown = shutdown_and_close  # type: ignore[assignment]
    return {
        "url": f"http://{actual_host}:{actual_port}/",
        "api_root": f"http://{actual_host}:{actual_port}/api",
        "token": auth_token,
        "reviewer_identity": resolved_reviewer_identity,
        "server": server,
        "thread": thread,
    }


def run_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    once: bool = False,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    launched = launch_forward_bridge(workspace, host=host, port=port, reviewer_identity=reviewer_identity)
    if once:
        return launched
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        launched["server"].shutdown()
        return launched


__all__ = [
    "build_approval_detail_payload",
    "archive_operator_task_payload",
    "request_operator_task_approval",
    "build_operator_task_detail_payload",
    "build_operator_tasks_payload",
    "build_operator_workspace_detail_payload",
    "build_operator_workspaces_payload",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "restore_operator_task_payload",
    "build_operator_doctor_evidence_payload",
    "build_operator_evidence_summary_payload",
    "build_operator_inbox_payload",
    "build_operator_agents_payload",
    "build_operator_runtime_roster_payload",
    "build_operator_status_confidence_payload",
    "build_operator_turn_records_payload",
    "build_operator_wake_readiness_payload",
    "build_operator_workflow_contracts_payload",
    "build_operator_summary_payload",
    "build_operator_pr_ci_evidence_payload",
    "build_operator_task_reconcile_preview_payload",
    "build_approvals_payload",
    "build_run_context_latest_payload",
    "build_run_detail_payload",
    "build_run_state_docs_payload",
    "build_runs_payload",
    "launch_forward_bridge",
    "run_forward_bridge",
    "serialize_sse_event",
]
