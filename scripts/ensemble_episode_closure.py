#!/usr/bin/env python3
from __future__ import annotations

import uuid
import re
from dataclasses import replace
from hashlib import sha256
from pathlib import Path

from ensemble_episode_artifacts import (
    closure_artifact_paths,
    find_improvement,
    json_hash,
    list_improvements,
    opaque_episode_slug,
    render_closure_digest,
    show_improvement_digest,
    write_projection_from_event,
)
from ensemble_episode_model import (
    ARTIFACT_KIND,
    ClosureRequest,
    ClosureResult,
    ClosureStatus,
    EpisodeClosureError,
    EpisodeNotFoundError,
    JsonObject,
    JsonValue,
    JSON_SCALAR_TYPES,
)
from ensemble_events import append_event, load_events, redact_text, utc_iso
from ensemble_improvement_candidate_model import (
    ImprovementCandidateError,
    validate_bounded_public_text,
    validate_bounded_public_token,
)

PRIVATE_TEXT_MARKERS = ("raw transcript", "provider prompt", "provider completion", "agent scratchpad", "chain-of-thought", "private raw", "begin transcript", "begin raw")
PRIVATE_TEXT_MARKER_KEYS = frozenset("".join(char for char in marker if char.isalnum()) for marker in PRIVATE_TEXT_MARKERS)
WINDOWS_USER_PATH_TEXT_RE = re.compile(r"[A-Za-z]:(?:\\\\|\\)Users(?:\\\\|\\)[^\s]+", re.IGNORECASE)
COMPARISON_KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")


def _event_dict_value(event: JsonObject, section: str, key: str) -> str:
    value = event.get(section)
    if not isinstance(value, dict):
        return ""
    item = value.get(key)
    return str(item) if isinstance(item, JSON_SCALAR_TYPES) and item is not None else ""


def _event_matches_episode(event: JsonObject, episode_id: str) -> bool:
    for section in ("scope", "payload"):
        for key in ("episode_id", "task_id", "run_id"):
            if _event_dict_value(event, section, key) == episode_id:
                return True
    return False


def _source_event_ids(events: list[JsonObject], episode_id: str) -> list[JsonValue]:
    ids: list[JsonValue] = []
    for event in events:
        if not _event_matches_episode(event, episode_id):
            continue
        event_id = event.get("event_id")
        if isinstance(event_id, str) and event_id:
            ids.append(event_id)
    return ids


def episode_exists(workspace: str | Path, episode_id: str) -> bool:
    return any(_event_matches_episode(event, episode_id) for event in load_events(workspace))


def _derive_validation_passed(events: list[JsonObject], episode_id: str) -> tuple[bool, str]:
    for event in reversed(events):
        if not _event_matches_episode(event, episode_id):
            continue
        event_type = event.get("type")
        if event_type == "validation.passed":
            return True, "event:validation.passed"
        if event_type == "validation.failed":
            return False, "event:validation.failed"
    return False, "missing:validation.passed"


def _public_text(value: str | None, label: str, max_len: int = 2000) -> str | None:
    if value is None:
        return None
    lowered = value.casefold()
    if any(marker in lowered for marker in PRIVATE_TEXT_MARKERS):
        raise EpisodeClosureError(f"{label} cannot contain private raw transcript content")
    redacted = WINDOWS_USER_PATH_TEXT_RE.sub("[REDACTED]", value)
    redacted, _rules = redact_text(redacted)
    if redacted.strip():
        try:
            validate_bounded_public_text(redacted, label, max_len)
        except ImprovementCandidateError as exc:
            raise EpisodeClosureError(f"{label} is malformed") from exc
    return redacted


def _public_text_tuple(values: tuple[str, ...], label: str) -> tuple[str, ...]:
    redacted: list[str] = []
    for value in values:
        text = _public_text(value, label)
        if text and text.strip():
            redacted.append(text)
    return tuple(redacted)


def _comparison_key(value: str | None) -> str | None:
    if value is None:
        return None
    if not COMPARISON_KEY_RE.fullmatch(value):
        raise EpisodeClosureError("comparison key is malformed")
    try:
        validate_bounded_public_token(value, "comparison key", 120)
    except ImprovementCandidateError as exc:
        raise EpisodeClosureError("comparison key is malformed") from exc
    compact = "".join(char for char in value.casefold() if char.isalnum())
    if any(marker in compact for marker in PRIVATE_TEXT_MARKER_KEYS):
        raise EpisodeClosureError("comparison key is malformed")
    if _public_text(value, "comparison key") != value:
        raise EpisodeClosureError("comparison key is malformed")
    if "/" in value or "\\" in value or ".." in value:
        raise EpisodeClosureError("comparison key is malformed")
    return value


def _public_actor(value: str) -> str:
    try:
        validate_bounded_public_token(value, "closure actor", 128)
    except ImprovementCandidateError as exc:
        raise EpisodeClosureError("closure actor is malformed") from exc
    return value


def _sanitize_request(request: ClosureRequest) -> ClosureRequest:
    return replace(
        request,
        actor=_public_actor(request.actor),
        summary=_public_text(request.summary, "summary"),
        goal=_public_text(request.goal, "goal"),
        outcome=_public_text(request.outcome, "outcome") or request.outcome,
        risks_remaining=_public_text_tuple(request.risks_remaining, "remaining risk"),
        blocking_reasons=_public_text_tuple(request.blocking_reasons, "blocking reason"),
        review_reasons=_public_text_tuple(request.review_reasons, "review reason"),
        next_recommendation=_public_text(request.next_recommendation, "next recommendation", 500),
        next_reason=_public_text(request.next_reason, "next reason"),
        comparison_key=_comparison_key(request.comparison_key),
    )


def _public_episode_id(episode_id: str) -> str:
    opaque_id = f"episode-sha256:{opaque_episode_slug(episode_id)}"
    try:
        public_id = _public_text(episode_id, "episode id", 200)
    except EpisodeClosureError:
        return opaque_id
    return public_id if public_id == episode_id else opaque_id


def _score_request(request: ClosureRequest, events: list[JsonObject]) -> tuple[ClosureStatus, JsonObject, JsonObject]:
    validation_passed, validation_source = _derive_validation_passed(events, request.episode_id)
    blocking = list(request.blocking_reasons)
    review = list(request.review_reasons)
    risks_remaining = [risk for risk in request.risks_remaining if risk.strip()]
    if not request.summary:
        blocking.append("episode summary missing")
    if not request.goal:
        blocking.append("episode goal missing")
    if not validation_passed:
        blocking.append("validation.passed event missing")
    if not request.goal_satisfied:
        blocking.append("goal not satisfied")
    if request.risk == "high":
        blocking.append("unresolved high-risk risk remains")
    if request.confidence == "low":
        review.append("Supervisor confidence is low")
    if request.risk == "medium":
        review.append("Medium residual risk requires review")
    closure_allowed = not blocking and not review
    status: ClosureStatus = "closed" if closure_allowed else "blocked" if blocking else "needs_review"
    scorecard: JsonObject = {
        "goal_satisfied": request.goal_satisfied,
        "validation_passed": validation_passed,
        "validation_source": validation_source,
        "closure_allowed": closure_allowed,
        "confidence": request.confidence,
        "risk": request.risk,
        "risks_remaining": risks_remaining,
        "blocking_reasons": blocking,
        "review_reasons": review,
    }
    return status, scorecard, _recommend_next_workflow(status, scorecard, request)


def _recommend_next_workflow(
    status: ClosureStatus,
    scorecard: JsonObject,
    request: ClosureRequest,
) -> JsonObject:
    blocking_reasons = _text_list(scorecard.get("blocking_reasons"))
    review_reasons = _text_list(scorecard.get("review_reasons"))
    if request.next_recommendation:
        return {"recommendation": request.next_recommendation, "reason": request.next_reason or "Provided by closure request"}
    if status == "closed":
        return {"recommendation": "none", "reason": "No follow-up required"}
    if blocking_reasons:
        return {"recommendation": "run_verification_then_retry_closure", "reason": "; ".join(blocking_reasons)}
    return {
        "recommendation": "request_supervisor_or_user_review",
        "reason": "; ".join(review_reasons) or "Automatic closure requires review",
    }


def _text_list(value: JsonValue | None) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def build_closure_bundle(
    request: ClosureRequest,
    *,
    created_at: str,
    source_event_ids: list[JsonValue],
    events: list[JsonObject],
) -> tuple[ClosureStatus, JsonObject]:
    status, scorecard, next_workflow = _score_request(request, events)
    public_episode_id = _public_episode_id(request.episode_id)
    bundle: JsonObject = {
        "artifact_kind": ARTIFACT_KIND,
        "episode_id": public_episode_id,
        "status": status,
        "created_at": created_at,
        "episode_summary": {
            "goal": request.goal or f"Close episode {public_episode_id}",
            "outcome": request.outcome,
            "summary": request.summary or f"Episode {public_episode_id} closure attempt.",
            "key_actions": [],
            "key_findings": [],
        },
        "scorecard": scorecard,
        "raw_access_audit": {"raw_access_used": False, "grants": []},
        "next_workflow_recommendation": next_workflow,
        "source_event_ids": source_event_ids,
    }
    if request.comparison_key is not None:
        bundle["comparison_key"] = request.comparison_key
    return status, bundle


def close_episode(workspace: str | Path, request: ClosureRequest) -> ClosureResult:
    workspace_root = Path(workspace)
    request = _sanitize_request(request)
    if not request.episode_id.strip():
        raise EpisodeClosureError("Episode id is required")
    events = load_events(workspace_root)
    if not any(_event_matches_episode(event, request.episode_id) for event in events):
        raise EpisodeNotFoundError(f"Episode not found in event log: {request.episode_id}")
    created_at = utc_iso()
    episode_slug = opaque_episode_slug(request.episode_id)
    public_episode_id = _public_episode_id(request.episode_id)
    artifact_id = f"closure-{episode_slug}-{uuid.uuid4().hex[:8]}"
    status, bundle = build_closure_bundle(
        request,
        created_at=created_at,
        source_event_ids=_source_event_ids(events, request.episode_id),
        events=events,
    )
    paths = closure_artifact_paths(workspace_root, artifact_id, episode_slug)
    digest_text = render_closure_digest(bundle)
    episode_summary = bundle.get("episode_summary")
    summary = episode_summary.get("summary") if isinstance(episode_summary, dict) else ""
    index_record: JsonObject = {
        "artifact_id": artifact_id,
        "artifact_kind": ARTIFACT_KIND,
        "episode_id": public_episode_id,
        "status": status,
        "risk": request.risk,
        "summary": str(summary or ""),
        "digest_path": paths.digest_rel,
        "evidence_path": paths.evidence_rel,
        "created_at": created_at,
        "promotion_available": status in ("blocked", "needs_review"),
    }
    if request.comparison_key is not None:
        index_record["comparison_key"] = request.comparison_key
    event_payload: JsonObject = {
        "artifact_kind": ARTIFACT_KIND,
        "artifact_id": artifact_id,
        "episode_id": public_episode_id,
        "source_episode_ref": f"episode-sha256:{episode_slug}",
        "status": status,
        "risk": request.risk,
        "summary": index_record["summary"],
        "digest_path": paths.digest_rel,
        "evidence_path": paths.evidence_rel,
        "projection_path": paths.projection_rel,
        "artifact_sha256": json_hash(bundle),
        "digest_sha256": sha256(digest_text.encode("utf-8")).hexdigest(),
        "source_event_ids": bundle["source_event_ids"],
        "projection": "derived_read_model",
        "closure_bundle": bundle,
        "index_record": index_record,
    }
    if request.comparison_key is not None:
        event_payload["comparison_key"] = request.comparison_key
    event = append_event(
        workspace_root,
        event_type="task.artifact_added",
        actor={"type": "agent", "name": request.actor},
        scope={"surface": "agent-improvement"},
        severity="warn" if status != "closed" else "info",
        payload=event_payload,
    )
    return write_projection_from_event(workspace_root, event)


__all__ = [
    "ARTIFACT_KIND",
    "ClosureRequest",
    "ClosureResult",
    "EpisodeClosureError",
    "EpisodeNotFoundError",
    "build_closure_bundle",
    "close_episode",
    "episode_exists",
    "find_improvement",
    "list_improvements",
    "render_closure_digest",
    "show_improvement_digest",
]
