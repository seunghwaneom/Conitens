#!/usr/bin/env python3
from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from ensemble_agent_revisions import (
    AgentRevisionError,
    replay_agent_skill_revision,
    workspace_lock,
)
from ensemble_episode_artifacts import json_hash, render_closure_digest
from ensemble_episode_model import ARTIFACT_KIND, EpisodeClosureError, JsonObject
from ensemble_events import append_event, load_events
from ensemble_improvement_candidate_model import (
    ImprovementCandidateError,
    validate_bounded_public_text,
    validate_bounded_public_token,
)
from ensemble_improvement_candidates import show_improvement_candidate
from ensemble_improvement_effect_model import (
    ClosureRecord,
    EffectObservationError,
    EffectObservationRequest,
    EVENT_ENVELOPE_KEYS,
    RevisionState,
    actor_fingerprint,
    as_dict,
    build_observation_id,
    classification,
    comparison_key,
    effect_envelope_matches,
    event_id as require_event_id,
    metrics,
    metric_deltas,
    payload as event_payload,
    strict_json_equal,
    text,
    unknown_reasons,
    valid_event_id,
    valid_utc_timestamp,
    validate_request,
)

EFFECT_EVENT = "improvement.effect_observed"
REVISION_PROPOSED = "improvement.revision_proposed"
REVISION_APPLIED = "improvement.revision_applied"
CLOSURE_PAYLOAD_KEYS = frozenset(
    {
        "artifact_kind",
        "artifact_id",
        "episode_id",
        "source_episode_ref",
        "status",
        "risk",
        "summary",
        "digest_path",
        "evidence_path",
        "projection_path",
        "artifact_sha256",
        "digest_sha256",
        "source_event_ids",
        "projection",
        "closure_bundle",
        "index_record",
    }
)
BUNDLE_KEYS = frozenset(
    {
        "artifact_kind",
        "episode_id",
        "status",
        "created_at",
        "episode_summary",
        "scorecard",
        "raw_access_audit",
        "next_workflow_recommendation",
        "source_event_ids",
    }
)
INDEX_KEYS = frozenset(
    {
        "artifact_id",
        "artifact_kind",
        "episode_id",
        "status",
        "risk",
        "summary",
        "digest_path",
        "evidence_path",
        "created_at",
        "promotion_available",
    }
)
EPISODE_SUMMARY_KEYS = frozenset({"goal", "outcome", "summary", "key_actions", "key_findings"})
SCORECARD_KEYS = frozenset(
    {
        "goal_satisfied",
        "validation_passed",
        "validation_source",
        "closure_allowed",
        "confidence",
        "risk",
        "risks_remaining",
        "blocking_reasons",
        "review_reasons",
    }
)
RAW_ACCESS_KEYS = frozenset({"raw_access_used", "grants"})
NEXT_WORKFLOW_KEYS = frozenset({"recommendation", "reason"})

def observe_improvement_effect(workspace: str | Path, request: EffectObservationRequest) -> JsonObject:
    validate_request(request)
    with workspace_lock(workspace):
        workspace_root = Path(workspace)
        events = load_events(workspace_root)
        payload = _build_payload(workspace_root, events, request)
        existing = _find_effects(events, str(payload["observation_id"]))
        if existing:
            current = _replay_effect(workspace_root, events, str(payload["observation_id"]))
            if current == payload:
                return payload
            raise EffectObservationError("effect observation history is conflicting")
        append_event(
            workspace_root,
            event_type=EFFECT_EVENT,
            actor={"type": "agent", "name": request.actor},
            scope={
                "surface": "agent-improvement",
                "revision_id": request.revision_id,
                "observation_id": str(payload["observation_id"]),
            },
            payload=payload,
        )
        return payload


def show_improvement_effect(workspace: str | Path, observation_id: str) -> JsonObject:
    _validate_token(observation_id, "observation id", 128)
    events = load_events(workspace)
    return _replay_effect(Path(workspace), events, observation_id)


def list_improvement_effects(
    workspace: str | Path,
    revision_id: str | None = None,
    limit: int = 20,
) -> list[JsonObject]:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise EffectObservationError("effect list limit must be between 1 and 100")
    if revision_id is not None:
        _validate_token(revision_id, "revision id", 128)
    events = load_events(workspace)
    rows: list[JsonObject] = []
    seen: set[str] = set()
    for event in events:
        if event.get("type") != EFFECT_EVENT:
            continue
        effect_payload = event_payload(event)
        observation_id = text(effect_payload.get("observation_id"))
        if not observation_id:
            raise EffectObservationError("effect observation identity is malformed")
        if observation_id in seen:
            continue
        current = _replay_effect(Path(workspace), events, observation_id)
        seen.add(observation_id)
        if revision_id is None or current.get("revision_id") == revision_id:
            rows.append(current)
    return rows[-limit:]


def _build_payload(workspace: Path, events: list[JsonObject], request: EffectObservationRequest) -> JsonObject:
    validate_request(request)
    revision = _revision_state(workspace, events, request.revision_id)
    candidate = _candidate(workspace, revision.payload)
    source = _source_closure(events, candidate)
    observed = _closure(events, request.observed_closure_artifact_id)
    _validate_order(events, source, observed, candidate, revision)
    if source.comparison_key != observed.comparison_key:
        raise EffectObservationError("comparison key mismatch")
    comparison = {
        "comparison_key": source.comparison_key,
        "source_closure_artifact_id": source.artifact_id,
        "source_closure_event_id": source.event_id,
        "observed_closure_artifact_id": observed.artifact_id,
        "observed_closure_event_id": observed.event_id,
    }
    observation_id = build_observation_id(revision, source, observed)
    source_metrics = metrics(events, source)
    observed_metrics = metrics(events, observed)
    metric_rows = {
        "source": source_metrics,
        "observed": observed_metrics,
        "delta": metric_deltas(source_metrics, observed_metrics),
    }
    return {
        "artifact_kind": "improvement_effect_observation",
        "schema_v": 1,
        "observation_id": observation_id,
        "revision_id": request.revision_id,
        "candidate_id": revision.payload["candidate_id"],
        "candidate_version": revision.payload["candidate_version"],
        "candidate_proposal_sha256": revision.payload["candidate_proposal_sha256"],
        "target_ref": revision.payload["target_ref"],
        "applied_event_id": revision.applied_event_id,
        "comparison_identity": comparison,
        "metrics": metric_rows,
        "observation": {
            "classification": classification(metric_rows),
            "causal_attribution": "not_claimed",
            "unknown_reason_codes": unknown_reasons(metric_rows),
            "observer_actor_sha256": actor_fingerprint(request.actor),
        },
        "reason_code": request.reason_code,
    }


def _candidate(workspace: Path, revision: JsonObject) -> JsonObject:
    try:
        candidate = show_improvement_candidate(workspace, str(revision["candidate_id"]))
    except ImprovementCandidateError as exc:
        raise EffectObservationError("candidate is not valid") from exc
    if (
        candidate.get("status") != "approved"
        or candidate.get("candidate_version") != revision.get("candidate_version")
        or candidate.get("proposal_sha256") != revision.get("candidate_proposal_sha256")
        or candidate.get("target_ref") != revision.get("target_ref")
    ):
        raise EffectObservationError("candidate linkage is malformed")
    return candidate


def _revision_state(workspace: Path, events: list[JsonObject], revision_id: str) -> RevisionState:
    try:
        public_revision = replay_agent_skill_revision(workspace, revision_id, events)
    except AgentRevisionError as exc:
        message = str(exc).casefold()
        if "applied without owner grant" in message or (
            "apply" in message and any(word in message for word in ("grant", "request", "approval"))
        ):
            raise EffectObservationError("revision apply approval history is malformed") from exc
        raise EffectObservationError("revision replay is malformed") from exc
    status = public_revision.get("status")
    if status == "rolled_back":
        raise EffectObservationError("revision has been rolled back")
    if status != "applied":
        raise EffectObservationError("revision must be applied")
    proposed = [
        (index, event)
        for index, event in enumerate(events)
        if event_payload(event).get("revision_id") == revision_id and event.get("type") == REVISION_PROPOSED
    ]
    if len(proposed) != 1:
        raise EffectObservationError("revision proposal is malformed")
    proposed_index, proposed_event = proposed[0]
    revision_payload = event_payload(proposed_event)
    if any(public_revision.get(key) != revision_payload.get(key) for key in public_revision if key not in {"status", "apply_requested"}):
        raise EffectObservationError("revision replay is malformed")
    applied = [
        (index, event)
        for index, event in enumerate(events)
        if event.get("type") == REVISION_APPLIED and event_payload(event).get("revision_id") == revision_id
    ]
    if len(applied) != 1:
        raise EffectObservationError("revision must be applied")
    applied_index, applied_event = applied[0]
    if applied_index <= proposed_index:
        raise EffectObservationError("revision applied before proposal")
    applied_event_id = require_event_id(applied_event)
    applied_actor = as_dict(applied_event.get("actor"))
    if (
        set(applied_event) != EVENT_ENVELOPE_KEYS
        or type(applied_event.get("event_v")) is not int
        or applied_event.get("event_v") != 1
        or not valid_event_id(applied_event_id)
        or not valid_utc_timestamp(applied_event.get("ts_utc"))
        or applied_event.get("severity") != "info"
        or not strict_json_equal(
            applied_event.get("scope"),
            {"surface": "agent-improvement", "revision_id": revision_id},
        )
        or set(applied_actor) != {"type", "name"}
        or applied_actor.get("type") != "owner"
        or not isinstance(applied_actor.get("name"), str)
        or not strict_json_equal(applied_event.get("redaction"), {"applied": False, "rules": []})
    ):
        raise EffectObservationError("revision applied event envelope is malformed")
    _validate_token(str(applied_actor["name"]), "revision applied actor", 128)
    return RevisionState(
        payload=public_revision,
        proposed_index=proposed_index,
        applied_index=applied_index,
        applied_event_id=applied_event_id,
    )


def _source_closure(events: list[JsonObject], candidate: JsonObject) -> ClosureRecord:
    provenance = as_dict(candidate.get("provenance"))
    artifact_id = text(provenance.get("source_artifact_id"))
    source_event_id = text(provenance.get("source_closure_event_id"))
    if not artifact_id or not source_event_id:
        raise EffectObservationError("candidate source closure is malformed")
    closure = _closure(events, artifact_id, event_id=source_event_id)
    provenance_source_ids = provenance.get("source_event_ids")
    if (
        not isinstance(provenance_source_ids, list)
        or any(not isinstance(item, str) or not item for item in provenance_source_ids)
        or list(closure.source_event_ids[:50]) != provenance_source_ids
    ):
        raise EffectObservationError("candidate source closure is malformed")
    return closure


def _closure(events: list[JsonObject], artifact_id: str, *, event_id: str | None = None) -> ClosureRecord:
    matches: list[tuple[int, JsonObject]] = []
    for index, event in enumerate(events):
        closure_payload = event_payload(event)
        if event.get("type") == "task.artifact_added" and closure_payload.get("artifact_kind") == ARTIFACT_KIND and closure_payload.get("artifact_id") == artifact_id:
            if event_id is None or require_event_id(event) == event_id:
                matches.append((index, event))
    if len(matches) != 1:
        raise EffectObservationError("closure artifact is malformed")
    index, event = matches[0]
    if (
        set(event) != EVENT_ENVELOPE_KEYS
        or not valid_event_id(event.get("event_id"))
        or not valid_utc_timestamp(event.get("ts_utc"))
    ):
        raise EffectObservationError("closure event envelope is malformed")
    closure_payload = event_payload(event)
    bundle = as_dict(closure_payload.get("closure_bundle"))
    index_record = as_dict(closure_payload.get("index_record"))
    key = comparison_key(closure_payload.get("comparison_key"))
    expected_payload_keys = CLOSURE_PAYLOAD_KEYS | {"comparison_key"}
    if set(closure_payload) != expected_payload_keys:
        raise EffectObservationError("closure artifact is malformed")
    if set(bundle) != BUNDLE_KEYS | {"comparison_key"} or set(index_record) != INDEX_KEYS | {"comparison_key"}:
        raise EffectObservationError("closure artifact is malformed")
    if bundle.get("comparison_key") != key or index_record.get("comparison_key") != key:
        raise EffectObservationError("comparison key is malformed")
    _validate_closure_public_content(closure_payload, bundle, index_record)
    source_ids_value = closure_payload.get("source_event_ids")
    if (
        not isinstance(source_ids_value, list)
        or not source_ids_value
        or any(not valid_event_id(item) for item in source_ids_value)
        or len(source_ids_value) != len(set(source_ids_value))
        or bundle.get("source_event_ids") != source_ids_value
    ):
        raise EffectObservationError("closure source events are malformed")
    source_event_ids = list(source_ids_value)
    for source_event_id in source_event_ids:
        source_matches = [source_index for source_index, source_event in enumerate(events) if source_event.get("event_id") == source_event_id]
        if len(source_matches) != 1 or source_matches[0] >= index:
            raise EffectObservationError("closure source events are malformed")
    status = closure_payload.get("status")
    expected_severity = "info" if status == "closed" else "warn"
    actor = as_dict(event.get("actor"))
    if (
        bundle.get("artifact_kind") != ARTIFACT_KIND
        or closure_payload.get("artifact_kind") != ARTIFACT_KIND
        or index_record.get("artifact_kind") != ARTIFACT_KIND
        or closure_payload.get("artifact_id") != artifact_id
        or index_record.get("artifact_id") != artifact_id
        or status not in {"closed", "blocked", "needs_review"}
        or status != bundle.get("status")
        or status != index_record.get("status")
        or closure_payload.get("episode_id") != bundle.get("episode_id")
        or closure_payload.get("episode_id") != index_record.get("episode_id")
        or closure_payload.get("risk") != index_record.get("risk")
        or closure_payload.get("summary") != index_record.get("summary")
        or closure_payload.get("digest_path") != index_record.get("digest_path")
        or closure_payload.get("evidence_path") != index_record.get("evidence_path")
        or bundle.get("created_at") != index_record.get("created_at")
        or not valid_utc_timestamp(bundle.get("created_at"))
        or type(index_record.get("promotion_available")) is not bool
        or index_record.get("promotion_available") is not (status in {"blocked", "needs_review"})
        or closure_payload.get("projection") != "derived_read_model"
        or type(event.get("event_v")) is not int
        or event.get("event_v") != 1
        or not strict_json_equal(event.get("scope"), {"surface": "agent-improvement"})
        or event.get("severity") != expected_severity
        or set(actor) != {"type", "name"}
        or actor.get("type") != "agent"
        or not isinstance(actor.get("name"), str)
        or not strict_json_equal(event.get("redaction"), {"applied": False, "rules": []})
    ):
        raise EffectObservationError("closure artifact is malformed")
    _validate_token(str(actor["name"]), "closure actor", 128)
    if closure_payload.get("artifact_sha256") != json_hash(bundle):
        raise EffectObservationError("closure artifact hash is malformed")
    try:
        digest_text = render_closure_digest(bundle)
    except (EpisodeClosureError, KeyError, TypeError, ValueError) as exc:
        raise EffectObservationError("closure digest is malformed") from exc
    if closure_payload.get("digest_sha256") != sha256(digest_text.encode("utf-8")).hexdigest():
        raise EffectObservationError("closure digest hash is malformed")
    return ClosureRecord(
        index=index,
        event_id=require_event_id(event),
        artifact_id=artifact_id,
        comparison_key=key,
        source_event_ids=tuple(source_event_ids),
        status=str(status),
    )


def _validate_closure_public_content(
    closure_payload: JsonObject,
    bundle: JsonObject,
    index_record: JsonObject,
) -> None:
    episode_summary = as_dict(bundle.get("episode_summary"))
    scorecard = as_dict(bundle.get("scorecard"))
    raw_access = as_dict(bundle.get("raw_access_audit"))
    next_workflow = as_dict(bundle.get("next_workflow_recommendation"))
    if (
        set(episode_summary) != EPISODE_SUMMARY_KEYS
        or set(scorecard) != SCORECARD_KEYS
        or set(raw_access) != RAW_ACCESS_KEYS
        or set(next_workflow) != NEXT_WORKFLOW_KEYS
    ):
        raise EffectObservationError("closure public content is malformed")
    for key in ("goal", "outcome", "summary"):
        _validate_public_text(episode_summary.get(key), f"closure {key}", 2000)
    for key in ("key_actions", "key_findings"):
        _validated_public_text_list(episode_summary.get(key), f"closure {key}", 50)
    for key in ("goal_satisfied", "validation_passed", "closure_allowed"):
        if type(scorecard.get(key)) is not bool:
            raise EffectObservationError("closure scorecard is malformed")
    if scorecard.get("confidence") not in {"low", "medium", "high"}:
        raise EffectObservationError("closure scorecard is malformed")
    if scorecard.get("risk") not in {"low", "medium", "high"}:
        raise EffectObservationError("closure scorecard is malformed")
    _validate_public_token(scorecard.get("validation_source"), "closure validation source", 200)
    for key in ("risks_remaining", "blocking_reasons", "review_reasons"):
        _validated_public_text_list(scorecard.get(key), f"closure {key}", 50)
    if raw_access != {"raw_access_used": False, "grants": []}:
        raise EffectObservationError("closure raw access audit is malformed")
    _validate_public_token(next_workflow.get("recommendation"), "closure recommendation", 500)
    _validate_public_text(next_workflow.get("reason"), "closure recommendation reason", 2000)
    status = closure_payload.get("status")
    if (
        scorecard.get("closure_allowed") is not (status == "closed")
        or scorecard.get("risk") != closure_payload.get("risk")
        or episode_summary.get("summary") != closure_payload.get("summary")
        or episode_summary.get("summary") != index_record.get("summary")
    ):
        raise EffectObservationError("closure public content is malformed")
    for key, limit in (
        ("artifact_id", 200),
        ("episode_id", 200),
        ("source_episode_ref", 200),
        ("digest_path", 500),
        ("evidence_path", 500),
        ("projection_path", 500),
    ):
        _validate_public_token(closure_payload.get(key), f"closure {key}", limit)
    expected_prefix = ".notes/artifacts/agent-improvement/"
    if any(
        not str(closure_payload[key]).startswith(expected_prefix)
        for key in ("digest_path", "evidence_path", "projection_path")
    ):
        raise EffectObservationError("closure artifact path is malformed")


def _validate_public_text(value: object, label: str, limit: int) -> str:
    if not isinstance(value, str) or len(value) > limit:
        raise EffectObservationError(f"{label} is malformed")
    try:
        validate_bounded_public_text(value, label, limit)
    except ImprovementCandidateError as exc:
        raise EffectObservationError(f"{label} is malformed") from exc
    return value


def _validate_public_token(value: object, label: str, limit: int) -> str:
    if not isinstance(value, str) or len(value) > limit:
        raise EffectObservationError(f"{label} is malformed")
    try:
        validate_bounded_public_token(value, label, limit)
    except ImprovementCandidateError as exc:
        raise EffectObservationError(f"{label} is malformed") from exc
    return value


def _validated_public_text_list(value: object, label: str, limit: int) -> list[str]:
    if not isinstance(value, list) or len(value) > limit or any(not isinstance(item, str) for item in value):
        raise EffectObservationError(f"{label} is malformed")
    return [_validate_public_text(item, label, 2000) for item in value]


def _validate_order(
    events: list[JsonObject],
    source: ClosureRecord,
    observed: ClosureRecord,
    candidate: JsonObject,
    revision: RevisionState,
) -> None:
    candidate_index = _event_index(events, "improvement.candidate_proposed", "candidate_id", str(candidate["candidate_id"]))
    if not source.index < candidate_index < revision.proposed_index < revision.applied_index < observed.index:
        raise EffectObservationError("effect observation order is invalid")
    if source.artifact_id == observed.artifact_id:
        raise EffectObservationError("observed closure must be distinct")
    source_ids = set(observed.source_event_ids)
    for index, event in enumerate(events):
        if require_event_id(event) in source_ids and index <= revision.applied_index:
            raise EffectObservationError("observed closure source events precede apply")


def _find_effects(events: list[JsonObject], observation_id: str) -> list[tuple[int, JsonObject]]:
    return [
        (index, event)
        for index, event in enumerate(events)
        if event.get("type") == EFFECT_EVENT and event_payload(event).get("observation_id") == observation_id
    ]


def _replay_effect(workspace: Path, events: list[JsonObject], observation_id: str) -> JsonObject:
    matches = _find_effects(events, observation_id)
    if not matches:
        raise EffectObservationError("effect observation history is malformed")
    first_index, first_event = matches[0]
    first_payload = event_payload(first_event)
    actor = as_dict(first_event.get("actor"))
    request = EffectObservationRequest(
        revision_id=text(first_payload.get("revision_id")),
        observed_closure_artifact_id=text(
            as_dict(first_payload.get("comparison_identity")).get("observed_closure_artifact_id")
        ),
        actor=text(actor.get("name")),
        reason_code=text(first_payload.get("reason_code")),
    )
    expected = _build_payload(workspace, events[:first_index], request)
    if any(
        not strict_json_equal(event_payload(event), expected)
        or not effect_envelope_matches(event, expected)
        for _, event in matches
    ):
        raise EffectObservationError("effect observation replay is malformed")
    revision_id = text(expected.get("revision_id"))
    try:
        current_revision = replay_agent_skill_revision(workspace, revision_id, events)
    except AgentRevisionError as exc:
        raise EffectObservationError("effect revision history is malformed") from exc
    if current_revision.get("status") not in {"applied", "rolled_back"}:
        raise EffectObservationError("effect revision history is malformed")
    if current_revision.get("status") == "rolled_back":
        rollback_indexes = [
            index
            for index, event in enumerate(events)
            if event.get("type") == "improvement.revision_rolled_back"
            and event_payload(event).get("revision_id") == revision_id
        ]
        if len(rollback_indexes) != 1 or any(index > rollback_indexes[0] for index, _ in matches):
            raise EffectObservationError("effect observation follows revision rollback")
    return expected


def _validate_token(value: str, label: str, limit: int) -> None:
    try:
        validate_bounded_public_token(value, label, limit)
    except ImprovementCandidateError as exc:
        raise EffectObservationError(f"{label} is malformed") from exc


def _event_index(events: list[JsonObject], event_type: str, payload_key: str, value: str) -> int:
    matches = [
        index
        for index, event in enumerate(events)
        if event.get("type") == event_type and event_payload(event).get(payload_key) == value
    ]
    if len(matches) != 1:
        raise EffectObservationError("effect source history is malformed")
    return matches[0]
