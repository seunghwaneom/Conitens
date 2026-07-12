#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_events import load_events
from ensemble_forward import sanitize_runtime_label
from ensemble_forward_bridge_query_provider_metrics import (
    _first_text_metric,
    _provider_metric_pii_count,
    _provider_metric_token_total,
    _sum_numeric_metrics,
)
from ensemble_forward_bridge_query_shared import (
    HARNESS_EVIDENCE_EVENT_TYPE,
    HARNESS_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS,
    HARNESS_RUNTIME_ALIASES,
    _looks_like_absolute_path,
    _payload_key_variants,
    _safe_text,
)

def _harness_forbidden_payload_key(key: Any) -> bool:
    normalized, compact = _payload_key_variants(key)
    forbidden_compact = {
        "".join(char for char in field if char.isalnum())
        for field in HARNESS_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS
    }
    return (
        normalized in HARNESS_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS
        or compact in forbidden_compact
        or normalized.endswith("_log")
        or normalized.endswith("_logs")
        or normalized.endswith("_content")
        or normalized.endswith("_body")
        or normalized.endswith("_diff")
        or normalized.endswith("_patch")
        or normalized.endswith("_transcript")
        or normalized.endswith("_output")
        or compact.endswith("log")
        or compact.endswith("logs")
        or compact.endswith("content")
        or compact.endswith("body")
        or compact.endswith("diff")
        or compact.endswith("patch")
        or compact.endswith("transcript")
        or compact.endswith("output")
    )


def _safe_harness_ref(value: Any) -> str | None:
    text = _safe_text(value, max_length=180)
    if not text or _looks_like_absolute_path(text):
        return None
    return text


def _safe_harness_refs(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    refs: list[str] = []
    for item in value:
        text = _safe_harness_ref(item)
        if text:
            refs.append(text)
    return refs[:8]


def _safe_harness_summary(value: Any) -> str | None:
    text = _safe_text(value, max_length=280)
    if not text or "/" in text or "\\" in text:
        return None
    return text


def _normalize_harness_runtime(value: str | None) -> str | None:
    label = sanitize_runtime_label(value)
    if not label:
        return None
    normalized = label.strip().lower()
    compact = "".join(char for char in normalized if char.isalnum())
    return HARNESS_RUNTIME_ALIASES.get(normalized) or HARNESS_RUNTIME_ALIASES.get(compact) or normalized


def _harness_evidence_event_rows(workspace: str | Path) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    evidence_refs: list[str] = []
    for event in load_events(workspace):
        if event.get("type") != HARNESS_EVIDENCE_EVENT_TYPE:
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        row: dict[str, Any] = {}
        for key, value in payload.items():
            if _harness_forbidden_payload_key(key):
                continue
            row[str(key)] = value
        scope = event.get("scope") if isinstance(event.get("scope"), dict) else {}
        if not row.get("run_id") and isinstance(scope.get("run_id"), str):
            row["run_id"] = scope["run_id"]
        if not row.get("iteration_id") and isinstance(scope.get("iteration_id"), str):
            row["iteration_id"] = scope["iteration_id"]
        row["runtime"] = _normalize_harness_runtime(
            _first_text_metric(row, ("runtime", "runtime_id", "harness", "adapter", "provider"))
        )
        row["status"] = sanitize_runtime_label(_first_text_metric(row, ("status", "outcome", "conclusion")))
        row["summary"] = _safe_harness_summary(row.get("summary"))
        row["observed_at"] = _safe_text(row.get("observed_at") or event.get("ts_utc"), max_length=40)
        row["transcript_ref"] = _safe_harness_ref(row.get("transcript_ref"))
        row["payload_evidence_refs"] = _safe_harness_refs(row.get("evidence_refs"))
        row["redaction_applied"] = bool(
            isinstance(event.get("redaction"), dict) and event["redaction"].get("applied")
        )
        event_id = str(event.get("event_id") or "unknown")
        row["event_ref"] = f"event:{HARNESS_EVIDENCE_EVENT_TYPE}:{event_id}"
        rows.append(row)
        evidence_refs.append(row["event_ref"])
    return rows, evidence_refs


def _summarize_harness_evidence_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest = rows[-1] if rows else {}
    latest_runtime = latest.get("runtime") if isinstance(latest.get("runtime"), str) else None
    latest_status = latest.get("status") if isinstance(latest.get("status"), str) else None
    latest_run_id = latest.get("run_id") if isinstance(latest.get("run_id"), str) else None
    latest_summary = latest.get("summary") if isinstance(latest.get("summary"), str) else None
    redacted_events = sum(1 for row in rows if row.get("redaction_applied"))
    evidence_count = sum(max(1, len(row.get("payload_evidence_refs") or [])) for row in rows)
    return {
        "observed": len(rows),
        "sources": len(rows),
        "evidence_count": evidence_count,
        "latest_runtime": latest_runtime,
        "latest_run_id": latest_run_id,
        "latest_status": latest_status,
        "latest_summary": latest_summary,
        "redacted_events": redacted_events,
        "metadata_only": True,
        "raw_transcript_exposed": False,
    }


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


__all__ = [
    "_harness_evidence_event_rows",
    "_summarize_harness_evidence_rows",
    "_summarize_provider_metric_rows",
]
