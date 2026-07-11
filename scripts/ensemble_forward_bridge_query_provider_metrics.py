#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_events import load_events
from ensemble_forward_bridge_query_shared import (
    PROVIDER_CALL_EVENT_TYPE,
    PROVIDER_CALL_FORBIDDEN_PAYLOAD_FIELDS,
)

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


__all__ = [
    "_first_text_metric",
    "_provider_call_event_metric_rows",
    "_provider_metric_pii_count",
    "_provider_metric_token_total",
    "_sum_numeric_metrics",
    "_walk_dicts",
]
