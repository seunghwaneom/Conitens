#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Callable


STALE_RUN_AGE_HOURS = 6
TURN_RECORD_DEFAULT_LIMIT = 50
TURN_RECORD_MAX_LIMIT = 200
WORKFLOW_CONTRACT_MESSAGE_LIMIT = 8
STATUS_CONFIDENCE_DEFAULT_LIMIT = 80
STATUS_CONFIDENCE_MAX_LIMIT = 240
WAKE_READINESS_DEFAULT_LIMIT = 40
WAKE_READINESS_MAX_LIMIT = 120
PUBLIC_CONVERSATION_ITEM_LIMIT = 100
RUNTIME_ROSTER_AGENT_RUNTIME_IDS = ("codex", "claude", "gemini", "opencode", "gjc")
RUNTIME_ROSTER_TOOLCHAIN_IDS = ("python", "node", "pnpm", "git")
RUNTIME_ROSTER_CATEGORIES = {"agent_runtime", "toolchain"}
PROVIDER_CALL_EVENT_TYPE = "provider.call_recorded"
PR_EVIDENCE_EVENT_TYPE = "pr.evidence_observed"
CI_EVIDENCE_EVENT_TYPE = "ci.evidence_observed"
HARNESS_EVIDENCE_EVENT_TYPE = "harness.evidence_observed"
PR_CI_EVIDENCE_EVENT_TYPES = {PR_EVIDENCE_EVENT_TYPE, CI_EVIDENCE_EVENT_TYPE}
PROVIDER_CALL_FORBIDDEN_PAYLOAD_FIELDS = {
    "prompt", "completion", "content", "messages", "request", "response",
    "raw_prompt", "raw_completion", "raw_request", "raw_response",
}
PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS = {
    "raw_log", "raw_logs", "log", "logs", "trace", "raw_trace", "diff", "patch",
    "content", "body", "comment", "comments", "review_body", "token", "auth_token", "secret",
}
HARNESS_RUNTIME_ALIASES = {
    "gjc": "gjc", "gajae": "gjc", "gajaecode": "gjc", "gajae-code": "gjc",
}
HARNESS_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS = PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS | {
    "prompt", "completion", "request", "response", "stdout", "stderr", "output",
    "terminal_output", "transcript", "raw_transcript", "command",
}

RuntimeChecksBuilder = Callable[..., list[dict[str, Any]]]


class QueryValidationError(ValueError):
    pass


def _safe_text(value: Any, *, max_length: int = 180) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return text[:max_length]


def _looks_like_absolute_path(text: str) -> bool:
    return (
        Path(text).is_absolute()
        or text.startswith(("/", "\\\\"))
        or (len(text) >= 3 and text[1] == ":" and text[2] in {"/", "\\"})
    )


def _payload_key_variants(key: Any) -> tuple[str, str]:
    normalized = str(key).strip().lower()
    compact = "".join(char for char in normalized if char.isalnum())
    return normalized, compact


def _status_from_counts(*, danger: int = 0, warning: int = 0) -> str:
    if danger > 0:
        return "danger"
    if warning > 0:
        return "warning"
    return "ok"


def _parse_utc_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None

__all__ = [
    "HARNESS_EVIDENCE_EVENT_TYPE",
    "HARNESS_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS",
    "HARNESS_RUNTIME_ALIASES",
    "PROVIDER_CALL_EVENT_TYPE",
    "PROVIDER_CALL_FORBIDDEN_PAYLOAD_FIELDS",
    "PR_CI_EVIDENCE_EVENT_TYPES",
    "PR_CI_EVIDENCE_FORBIDDEN_PAYLOAD_FIELDS",
    "PR_EVIDENCE_EVENT_TYPE",
    "PUBLIC_CONVERSATION_ITEM_LIMIT",
    "QueryValidationError",
    "RUNTIME_ROSTER_AGENT_RUNTIME_IDS",
    "RUNTIME_ROSTER_CATEGORIES",
    "RUNTIME_ROSTER_TOOLCHAIN_IDS",
    "RuntimeChecksBuilder",
    "STALE_RUN_AGE_HOURS",
    "STATUS_CONFIDENCE_DEFAULT_LIMIT",
    "STATUS_CONFIDENCE_MAX_LIMIT",
    "TURN_RECORD_DEFAULT_LIMIT",
    "TURN_RECORD_MAX_LIMIT",
    "WAKE_READINESS_DEFAULT_LIMIT",
    "WAKE_READINESS_MAX_LIMIT",
    "WORKFLOW_CONTRACT_MESSAGE_LIMIT",
    "_looks_like_absolute_path",
    "_parse_utc_iso_timestamp",
    "_payload_key_variants",
    "_safe_text",
    "_status_from_counts",
]
