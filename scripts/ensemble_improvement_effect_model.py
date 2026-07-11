#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime

from ensemble_episode_model import JsonObject, JsonValue
from ensemble_improvement_candidate_model import (
    ImprovementCandidateError,
    validate_bounded_public_token,
    validate_reason_code,
)

KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")
EVENT_ID_RE = re.compile(r"^E-\d{8}-\d{6}-[0-9a-f]{6}$")
UTC_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
EVENT_ENVELOPE_KEYS = frozenset(
    {"event_v", "event_id", "ts_utc", "actor", "scope", "type", "severity", "payload", "redaction"}
)


class EffectObservationError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class EffectObservationRequest:
    revision_id: str
    observed_closure_artifact_id: str
    actor: str = "supervisor"
    reason_code: str = "post_apply_observation"


@dataclass(frozen=True, slots=True)
class ClosureRecord:
    index: int
    event_id: str
    artifact_id: str
    comparison_key: str
    source_event_ids: tuple[str, ...]
    status: str


@dataclass(frozen=True, slots=True)
class RevisionState:
    payload: JsonObject
    proposed_index: int
    applied_index: int
    applied_event_id: str


def validate_request(request: EffectObservationRequest) -> None:
    try:
        validate_bounded_public_token(request.revision_id, "revision id", 128)
        validate_bounded_public_token(request.observed_closure_artifact_id, "observed closure artifact id", 200)
        validate_bounded_public_token(request.actor, "actor", 128)
        validate_reason_code(request.reason_code)
        validate_bounded_public_token(request.reason_code, "reason code", 80)
    except ImprovementCandidateError as exc:
        raise EffectObservationError("effect observation request is malformed") from exc


def build_observation_id(revision: RevisionState, source: ClosureRecord, observed: ClosureRecord) -> str:
    body = "|".join(
        [
            str(revision.payload["revision_id"]),
            revision.applied_event_id,
            source.event_id,
            observed.event_id,
            source.comparison_key,
        ]
    )
    return "effect-" + hashlib.sha256(body.encode("utf-8")).hexdigest()[:20]


def metrics(events: list[JsonObject], closure: ClosureRecord) -> JsonObject:
    source_ids = set(closure.source_event_ids)
    selected = [event for event in events if event_id(event) in source_ids]
    validation_passed = sum(1 for event in selected if event.get("type") == "validation.passed")
    validation_failed = sum(1 for event in selected if event.get("type") == "validation.failed")
    providers = [payload(event) for event in selected if event.get("type") == "provider.call_recorded"]
    token_values = [int_value(item.get("total_tokens")) for item in providers]
    latency_values = [int_value(item.get("latency_ms")) for item in providers]
    approvals = [event for event in selected if event.get("type") in {"approval.requested", "approval.granted", "approval.denied"}]
    human_actor_events = [
        event
        for event in selected
        if as_dict(event.get("actor")).get("type") in {"user", "operator", "owner", "reviewer"}
        and text(as_dict(event.get("actor")).get("name"))
    ]
    return {
        "closure_status": closure.status,
        "success": closure.status == "closed",
        "validation_passed_count": validation_passed,
        "validation_failed_count": validation_failed,
        "latest_validation_result": latest_validation(selected),
        "provider_call_count": len(providers),
        "provider_total_tokens": _known_sum(token_values),
        "provider_latency_ms": _known_sum(latency_values),
        "approval_requested_count": sum(1 for event in approvals if event.get("type") == "approval.requested"),
        "approval_granted_count": sum(1 for event in approvals if event.get("type") == "approval.granted"),
        "approval_denied_count": sum(1 for event in approvals if event.get("type") == "approval.denied"),
        "explicit_human_actor_count": len(human_actor_events),
        "source_event_count": len(source_ids),
    }


def metric_deltas(source: JsonObject, observed: JsonObject) -> JsonObject:
    delta: JsonObject = {
        "closure_success": _numeric_delta(source.get("success"), observed.get("success"), allow_bool=True),
    }
    for key in (
        "validation_passed_count",
        "validation_failed_count",
        "provider_call_count",
        "provider_total_tokens",
        "provider_latency_ms",
        "approval_requested_count",
        "approval_granted_count",
        "approval_denied_count",
        "explicit_human_actor_count",
        "source_event_count",
    ):
        delta[key] = _numeric_delta(source.get(key), observed.get(key))
    return delta


def classification(metric_rows: JsonObject) -> str:
    source = as_dict(metric_rows.get("source"))
    observed = as_dict(metric_rows.get("observed"))
    favorable = 0
    unfavorable = 0
    if source.get("success") is False and observed.get("success") is True:
        favorable += 1
    if source.get("success") is True and observed.get("success") is False:
        unfavorable += 1
    for key in (
        "validation_failed_count",
        "provider_call_count",
        "provider_total_tokens",
        "provider_latency_ms",
        "approval_requested_count",
        "approval_denied_count",
        "explicit_human_actor_count",
    ):
        left = source.get(key)
        right = observed.get(key)
        if isinstance(left, int) and isinstance(right, int):
            favorable += int(right < left)
            unfavorable += int(right > left)
    if favorable and unfavorable:
        return "mixed"
    if favorable:
        return "improved"
    if unfavorable:
        return "regressed"
    return "unknown" if unknown_reasons(metric_rows) else "no_observable_change"


def unknown_reasons(metric_rows: JsonObject) -> list[str]:
    reasons: list[str] = []
    for side in ("source", "observed"):
        row = as_dict(metric_rows.get(side))
        if row.get("provider_total_tokens") is None:
            reasons.append(f"{side}:provider_total_tokens_unknown")
        if row.get("provider_latency_ms") is None:
            reasons.append(f"{side}:provider_latency_ms_unknown")
    return reasons


def actor_fingerprint(actor: str) -> str:
    return hashlib.sha256(f"agent:{actor}".encode("utf-8")).hexdigest()


def strict_json_equal(left: object, right: object) -> bool:
    if type(left) is not type(right):
        return False
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            strict_json_equal(left[key], right[key]) for key in left
        )
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            strict_json_equal(left_item, right_item)
            for left_item, right_item in zip(left, right)
        )
    return left == right


def effect_envelope_matches(event: JsonObject, event_payload: JsonObject) -> bool:
    actor = as_dict(event.get("actor"))
    observation = as_dict(event_payload.get("observation"))
    return (
        set(event) == EVENT_ENVELOPE_KEYS
        and type(event.get("event_v")) is int
        and event.get("event_v") == 1
        and valid_event_id(event.get("event_id"))
        and valid_utc_timestamp(event.get("ts_utc"))
        and event.get("type") == "improvement.effect_observed"
        and event.get("severity") == "info"
        and set(actor) == {"type", "name"}
        and actor.get("type") == "agent"
        and isinstance(actor.get("name"), str)
        and actor_fingerprint(str(actor["name"])) == observation.get("observer_actor_sha256")
        and strict_json_equal(
            event.get("scope"),
            {
                "surface": "agent-improvement",
                "revision_id": event_payload.get("revision_id"),
                "observation_id": event_payload.get("observation_id"),
            },
        )
        and strict_json_equal(event.get("redaction"), {"applied": False, "rules": []})
    )


def valid_event_id(value: object) -> bool:
    return isinstance(value, str) and EVENT_ID_RE.fullmatch(value) is not None


def valid_utc_timestamp(value: object) -> bool:
    if not isinstance(value, str) or UTC_TIMESTAMP_RE.fullmatch(value) is None:
        return False
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return False
    return True


def comparison_key(value: JsonValue | None) -> str:
    if not isinstance(value, str) or not KEY_RE.fullmatch(value):
        raise EffectObservationError("comparison key is malformed")
    if "/" in value or "\\" in value or ".." in value:
        raise EffectObservationError("comparison key is malformed")
    try:
        validate_bounded_public_token(value, "comparison key", 120)
    except ImprovementCandidateError as exc:
        raise EffectObservationError("comparison key is malformed") from exc
    return value


def event_id(event: JsonObject) -> str:
    value = text(event.get("event_id"))
    if not value:
        raise EffectObservationError("event id is malformed")
    return value


def payload(event: JsonObject) -> JsonObject:
    return as_dict(event.get("payload"))


def as_dict(value: JsonValue | None) -> JsonObject:
    return value if isinstance(value, dict) else {}


def text(value: JsonValue | None) -> str:
    return value if isinstance(value, str) else ""


def string_list(value: JsonValue | None) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def int_value(value: JsonValue | None) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def latest_validation(events: list[JsonObject]) -> str | None:
    for event in reversed(events):
        match event.get("type"):
            case "validation.passed":
                return "passed"
            case "validation.failed":
                return "failed"
            case _:
                continue
    return None


def _known_sum(values: list[int | None]) -> int | None:
    if not values or any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def _numeric_delta(source: JsonValue | None, observed: JsonValue | None, *, allow_bool: bool = False) -> int | None:
    if allow_bool:
        if not isinstance(source, bool) or not isinstance(observed, bool):
            return None
        return int(observed) - int(source)
    if (
        isinstance(source, bool)
        or isinstance(observed, bool)
        or not isinstance(source, int)
        or not isinstance(observed, int)
    ):
        return None
    return observed - source
