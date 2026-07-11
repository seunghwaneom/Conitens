#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ensemble_episode_model import ARTIFACT_KIND, JsonObject, JsonValue
from ensemble_events import append_event, load_events
from ensemble_improvement_candidate_model import (
    CandidateProposal,
    ImprovementCandidateError,
    validate_bounded_token,
    validate_decision,
    validate_public_token,
    validate_reason_code,
)
from ensemble_workspace_lock import workspace_lock

CANDIDATE_EVENT = "improvement.candidate_proposed"
APPROVAL_REQUESTED = "approval.requested"
APPROVAL_GRANTED = "approval.granted"
APPROVAL_DENIED = "approval.denied"
APPROVAL_EVENTS = frozenset({APPROVAL_REQUESTED, APPROVAL_GRANTED, APPROVAL_DENIED})


@dataclass(frozen=True, slots=True)
class ClosureLink:
    artifact_id: str
    event_id: str
    source_episode_ref: str
    source_event_ids: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    linked_refs: JsonObject


@dataclass(frozen=True, slots=True)
class CandidateRecord:
    event_index: int
    payload: JsonObject


def propose_improvement_candidate(workspace: str | Path, proposal: CandidateProposal) -> JsonObject:
    workspace_root = Path(workspace)
    events = load_events(workspace_root)
    closure = _find_closure(events, proposal.closure_artifact_id)
    existing = _candidate_records(events)
    proposal_sha = proposal.proposal_sha256()
    candidate_key = proposal.candidate_key()

    for record in existing:
        payload = record.payload
        if payload.get("candidate_key") == candidate_key and payload.get("proposal_sha256") == proposal_sha:
            candidate = _hydrate_candidate(payload, events, record.event_index)
            if not bool(candidate.get("review_requested")):
                _append_approval_request(workspace_root, payload, proposal.actor)
                candidate = show_improvement_candidate(workspace_root, str(payload["candidate_id"]))
            return candidate

    version = _next_version(existing, candidate_key, events)
    payload = _build_candidate_payload(proposal, closure, version)
    append_event(
        workspace_root,
        event_type=CANDIDATE_EVENT,
        actor={"type": "agent", "name": proposal.actor},
        scope={"surface": "agent-improvement", "candidate_id": str(payload["candidate_id"])},
        payload=payload,
    )
    _append_approval_request(workspace_root, payload, proposal.actor)
    return show_improvement_candidate(workspace_root, str(payload["candidate_id"]))


def list_improvement_candidates(workspace: str | Path, limit: int = 20) -> list[JsonObject]:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ImprovementCandidateError("candidate list limit must be between 1 and 100")
    events = load_events(workspace)
    rows = [
        row
        for record in _candidate_records(events)
        for row in [_listed_candidate(record, events)]
        if row is not None
    ]
    return list(reversed(rows))[:limit]


def show_improvement_candidate(workspace: str | Path, candidate_id: str) -> JsonObject:
    validate_bounded_token(candidate_id, "candidate id", 128)
    events = load_events(workspace)
    for record in reversed(_candidate_records(events)):
        payload = record.payload
        if payload.get("candidate_id") == candidate_id:
            return _public_l2(_hydrate_candidate(payload, events, record.event_index))
    raise ImprovementCandidateError(f"candidate not found: {candidate_id}")


def decide_improvement_candidate(
    workspace: str | Path,
    candidate_id: str,
    *,
    decision: str,
    reviewer: str,
    reason_code: str,
) -> JsonObject:
    decision_value = validate_decision(decision)
    validate_public_token(candidate_id, "candidate id")
    validate_bounded_token(reviewer, "reviewer", 128)
    validate_reason_code(reason_code)
    with workspace_lock(workspace):
        candidate = show_improvement_candidate(workspace, candidate_id)
        if candidate.get("status") != "pending_review":
            raise ImprovementCandidateError("candidate already decided")
        if not bool(candidate.get("review_requested")):
            raise ImprovementCandidateError("candidate approval request is missing")

        append_event(
            workspace,
            event_type=APPROVAL_GRANTED if decision_value == "approved" else APPROVAL_DENIED,
            actor={"type": "reviewer", "name": reviewer},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                "request_id": candidate["approval_request_id"],
                "candidate_id": candidate_id,
                "candidate_version": candidate["candidate_version"],
                "action_type": "review_improvement_candidate",
                "decision": decision_value,
                "decision_reason_code": reason_code,
            },
        )
    return show_improvement_candidate(workspace, candidate_id)


def _build_candidate_payload(proposal: CandidateProposal, closure: ClosureLink, version: int) -> JsonObject:
    candidate_key = proposal.candidate_key()
    candidate_id = f"candidate-{candidate_key}-v{version}"
    approval_request_id = f"approval-{candidate_id}"
    risk = proposal.risk()
    return {
        "artifact_kind": "improvement_candidate",
        "schema_v": 1,
        "candidate_id": candidate_id,
        "candidate_key": candidate_key,
        "candidate_version": version,
        "kind": proposal.kind,
        "target_ref": proposal.target_ref,
        "summary": proposal.summary,
        "change_summary": list(proposal.change_summary),
        "impact_areas": list(proposal.impact_areas),
        "proposal_sha256": proposal.proposal_sha256(),
        "risk": risk.public(),
        "status": "pending_review",
        "approval_request_id": approval_request_id,
        "provenance": _closure_provenance(closure),
        "raw_access": {"available": False},
    }


def _append_approval_request(workspace: Path, candidate: JsonObject, actor: str) -> None:
    append_event(
        workspace,
        event_type=APPROVAL_REQUESTED,
        actor={"type": "agent", "name": actor},
        scope={"surface": "agent-improvement", "candidate_id": str(candidate["candidate_id"])},
        payload={
            "request_id": candidate["approval_request_id"],
            "candidate_id": candidate["candidate_id"],
            "candidate_version": candidate["candidate_version"],
            "kind": candidate["kind"],
            "risk_level": _risk_level(candidate),
            "action_type": "review_improvement_candidate",
            "source_artifact_id": _source_artifact_id(candidate),
        },
    )


def _find_closure(
    events: list[JsonObject],
    artifact_id: str,
    *,
    closure_event_id: str | None = None,
) -> ClosureLink:
    for event in reversed(events):
        payload = _payload(event)
        if event.get("type") != "task.artifact_added":
            continue
        if payload.get("artifact_kind") != ARTIFACT_KIND or payload.get("artifact_id") != artifact_id:
            continue
        event_id = _text(event.get("event_id"))
        if closure_event_id is not None and event_id != closure_event_id:
            continue
        validate_bounded_token(artifact_id, "source artifact id", 200)
        validate_bounded_token(event_id, "source closure event id", 200)
        source_episode_ref = _text(payload.get("source_episode_ref"))
        validate_bounded_token(source_episode_ref, "source episode ref", 200)
        source_event_ids = tuple(_text(item) for item in _list(payload.get("source_event_ids")) if _text(item))
        for source_event_id in source_event_ids:
            validate_bounded_token(source_event_id, "source event id", 200)
        evidence_refs = tuple(
            item
            for item in (_text(payload.get("digest_sha256")), _text(payload.get("artifact_sha256")))
            if item
        )
        for evidence_ref in evidence_refs:
            validate_bounded_token(evidence_ref, "evidence ref", 200)
        return ClosureLink(
            artifact_id=artifact_id,
            event_id=event_id,
            source_episode_ref=source_episode_ref,
            source_event_ids=source_event_ids[:50],
            evidence_refs=evidence_refs,
            linked_refs=_linked_refs(events, source_event_ids),
        )
    raise ImprovementCandidateError(f"closure artifact not found: {artifact_id}")


def _closure_provenance(closure: ClosureLink) -> JsonObject:
    return {
        "source_artifact_id": closure.artifact_id,
        "source_episode_ref": closure.source_episode_ref,
        "source_closure_event_id": closure.event_id,
        "source_event_ids": list(closure.source_event_ids),
        "linked_refs": closure.linked_refs,
        "evidence_refs": list(closure.evidence_refs),
    }


def _linked_refs(events: list[JsonObject], source_event_ids: tuple[str, ...]) -> JsonObject:
    source_ids = set(source_event_ids)
    refs: dict[str, list[str]] = {"run_ids": [], "iteration_ids": [], "room_ids": [], "handoff_ids": []}
    for event in events:
        if _text(event.get("event_id")) not in source_ids:
            continue
        for section_name in ("scope", "payload"):
            section = event.get(section_name)
            if not isinstance(section, dict):
                continue
            _append_unique(refs["run_ids"], _text(section.get("run_id")))
            _append_unique(refs["iteration_ids"], _text(section.get("iteration_id")))
            _append_unique(refs["room_ids"], _text(section.get("room_id")))
            _append_unique(refs["handoff_ids"], _text(section.get("handoff_id")))
    return {key: values[:20] for key, values in refs.items()}


def _append_unique(items: list[str], value: str) -> None:
    if not value or value in items:
        return
    try:
        validate_public_token(value, "linked ref")
    except ImprovementCandidateError:
        return
    else:
        items.append(value)


def _candidate_records(events: list[JsonObject]) -> list[CandidateRecord]:
    records: list[CandidateRecord] = []
    for event_index, event in enumerate(events):
        if event.get("type") == CANDIDATE_EVENT:
            records.append(CandidateRecord(event_index=event_index, payload=_payload(event)))
    return records


def _listed_candidate(record: CandidateRecord, events: list[JsonObject]) -> JsonObject | None:
    try:
        return _public_l0(_hydrate_candidate(record.payload, events, record.event_index))
    except ImprovementCandidateError:
        return None


def _next_version(records: list[CandidateRecord], candidate_key: str, events: list[JsonObject]) -> int:
    versions: list[int] = []
    for record in records:
        payload = record.payload
        if payload.get("candidate_key") != candidate_key:
            continue
        try:
            _validate_candidate_identity(payload)
            _validate_candidate_provenance(payload, events)
        except ImprovementCandidateError:
            continue
        versions.append(int(payload["candidate_version"]))
    return max(versions, default=0) + 1


def _hydrate_candidate(payload: JsonObject, events: list[JsonObject], candidate_event_index: int) -> JsonObject:
    _validate_candidate_identity(payload)
    _validate_candidate_provenance(payload, events)
    candidate_id = _text(payload.get("candidate_id"))
    request_id = _text(payload.get("approval_request_id"))
    version = payload.get("candidate_version")
    review_requested = False
    status = "pending_review"
    terminal_status: str | None = None
    for event in events[candidate_event_index + 1 :]:
        event_type = event.get("type")
        if event_type not in APPROVAL_EVENTS:
            continue
        if not _has_valid_approval_actor(event, str(event_type)):
            continue
        approval_payload = _payload(event)
        if not _event_matches_candidate(event, approval_payload, candidate_id, request_id, version):
            continue
        match event_type:
            case "approval.requested":
                if not _is_valid_approval_request(payload, approval_payload):
                    continue
                review_requested = True
            case "approval.granted":
                if not review_requested:
                    continue
                if not _is_valid_terminal_decision(APPROVAL_GRANTED, approval_payload):
                    continue
                if terminal_status is not None:
                    raise ImprovementCandidateError("multiple or conflicting terminal decisions")
                terminal_status = "approved"
            case "approval.denied":
                if not review_requested:
                    continue
                if not _is_valid_terminal_decision(APPROVAL_DENIED, approval_payload):
                    continue
                if terminal_status is not None:
                    raise ImprovementCandidateError("multiple or conflicting terminal decisions")
                terminal_status = "rejected"
    candidate = dict(payload)
    candidate["status"] = terminal_status or status
    candidate["review_requested"] = review_requested
    return candidate


def _event_matches_candidate(
    event: JsonObject,
    payload: JsonObject,
    candidate_id: str,
    request_id: str,
    version: JsonValue | None,
) -> bool:
    scope = event.get("scope")
    if not isinstance(scope, dict):
        return False
    if scope.get("surface") != "agent-improvement" or scope.get("candidate_id") != candidate_id:
        return False
    if payload.get("candidate_id") != candidate_id or payload.get("request_id") != request_id:
        return False
    if payload.get("action_type") != "review_improvement_candidate":
        return False
    payload_version = payload.get("candidate_version")
    return payload_version == version


def _is_valid_approval_request(candidate: JsonObject, payload: JsonObject) -> bool:
    expected = {
        "request_id": candidate.get("approval_request_id"),
        "candidate_id": candidate.get("candidate_id"),
        "candidate_version": candidate.get("candidate_version"),
        "kind": candidate.get("kind"),
        "risk_level": _risk_level(candidate),
        "action_type": "review_improvement_candidate",
        "source_artifact_id": _source_artifact_id(candidate),
    }
    return payload == expected


def _has_valid_approval_actor(event: JsonObject, event_type: str) -> bool:
    actor = event.get("actor")
    if not isinstance(actor, dict):
        return False
    expected_type = "agent" if event_type == APPROVAL_REQUESTED else "reviewer"
    if actor.get("type") != expected_type:
        return False
    try:
        validate_bounded_token(_text(actor.get("name")), "approval actor", 128)
    except ImprovementCandidateError:
        return False
    return True


def _public_l0(candidate: JsonObject) -> JsonObject:
    _validate_candidate_public_fields(candidate)
    return {
        "artifact_kind": candidate["artifact_kind"],
        "schema_v": candidate["schema_v"],
        "candidate_id": candidate["candidate_id"],
        "candidate_version": candidate["candidate_version"],
        "kind": candidate["kind"],
        "target_ref": candidate["target_ref"],
        "summary": candidate["summary"],
        "risk": _public_risk(candidate),
        "status": candidate["status"],
        "review_requested": candidate["review_requested"],
        "approval_request_id": candidate["approval_request_id"],
    }


def _public_l2(candidate: JsonObject) -> JsonObject:
    detail = _public_l0(candidate)
    detail["change_summary"] = _public_text_list(candidate.get("change_summary"), "change summary", 20, 300)
    detail["impact_areas"] = _public_text_list(candidate.get("impact_areas"), "impact area", 20, 80)
    detail["proposal_sha256"] = candidate["proposal_sha256"]
    detail["provenance"] = _public_provenance(candidate)
    return detail


def _validate_candidate_public_fields(candidate: JsonObject) -> None:
    _validate_candidate_identity(candidate, require_pending=False)
    validate_public_token(_text(candidate.get("candidate_id")), "candidate id")
    validate_bounded_token(_text(candidate.get("target_ref")), "target ref", 200)
    validate_bounded_token(_text(candidate.get("summary")), "summary", 500)
    kind = _text(candidate.get("kind"))
    if kind not in {"skill_patch", "workflow_revision", "agent_topology_revision"}:
        raise ImprovementCandidateError("candidate kind is unsupported")
    expected_risk = CandidateProposal(
        closure_artifact_id=_source_artifact_id(candidate),
        kind=kind,
        target_ref=_text(candidate.get("target_ref")),
        summary=_text(candidate.get("summary")),
        change_summary=tuple(_public_text_list(candidate.get("change_summary"), "change summary", 20, 300)),
        impact_areas=tuple(_public_text_list(candidate.get("impact_areas"), "impact area", 20, 80)),
    ).risk().public()
    if _public_risk(candidate) != expected_risk:
        raise ImprovementCandidateError("candidate risk is malformed")


def _validate_candidate_identity(candidate: JsonObject, *, require_pending: bool = True) -> None:
    if candidate.get("artifact_kind") != "improvement_candidate" or candidate.get("schema_v") != 1:
        raise ImprovementCandidateError("candidate identity is malformed")
    version = candidate.get("candidate_version")
    if not isinstance(version, int) or version < 1:
        raise ImprovementCandidateError("candidate identity is malformed")
    kind = _text(candidate.get("kind"))
    proposal = CandidateProposal(
        closure_artifact_id=_source_artifact_id(candidate),
        kind=kind,
        target_ref=_text(candidate.get("target_ref")),
        summary=_text(candidate.get("summary")),
        change_summary=tuple(_public_text_list(candidate.get("change_summary"), "change summary", 20, 300)),
        impact_areas=tuple(_public_text_list(candidate.get("impact_areas"), "impact area", 20, 80)),
    )
    key = proposal.candidate_key()
    candidate_id = f"candidate-{key}-v{version}"
    if candidate.get("candidate_key") != key:
        raise ImprovementCandidateError("candidate identity is malformed")
    if candidate.get("candidate_id") != candidate_id:
        raise ImprovementCandidateError("candidate identity is malformed")
    if candidate.get("approval_request_id") != f"approval-{candidate_id}":
        raise ImprovementCandidateError("candidate identity is malformed")
    if candidate.get("proposal_sha256") != proposal.proposal_sha256():
        raise ImprovementCandidateError("candidate digest is malformed")
    if require_pending and candidate.get("status") != "pending_review":
        raise ImprovementCandidateError("candidate status is malformed")
    if not require_pending and candidate.get("status") not in {"pending_review", "approved", "rejected"}:
        raise ImprovementCandidateError("candidate status is malformed")
    if _public_risk(candidate) != proposal.risk().public():
        raise ImprovementCandidateError("candidate risk is malformed")


def _validate_candidate_provenance(candidate: JsonObject, events: list[JsonObject]) -> None:
    provenance = _public_provenance(candidate)
    closure = _find_closure(
        events,
        str(provenance["source_artifact_id"]),
        closure_event_id=str(provenance["source_closure_event_id"]),
    )
    if provenance != _closure_provenance(closure):
        raise ImprovementCandidateError("candidate provenance is malformed")


def _is_valid_terminal_decision(event_type: str, payload: JsonObject) -> bool:
    if set(payload) != {
        "request_id",
        "candidate_id",
        "candidate_version",
        "action_type",
        "decision",
        "decision_reason_code",
    }:
        return False
    decision = _text(payload.get("decision"))
    if event_type == APPROVAL_GRANTED and decision != "approved":
        return False
    if event_type == APPROVAL_DENIED and decision != "rejected":
        return False
    try:
        validate_reason_code(_text(payload.get("decision_reason_code")))
    except ImprovementCandidateError:
        return False
    return True


def _public_text_list(value: JsonValue | None, label: str, max_count: int, max_len: int) -> list[str]:
    items = _list(value)
    if len(items) > max_count:
        raise ImprovementCandidateError(f"{label} is over limit")
    texts: list[str] = []
    for item in items:
        text = _text(item)
        validate_bounded_token(text, label, max_len)
        texts.append(text)
    return texts


def _payload(event: JsonObject) -> JsonObject:
    payload = event.get("payload")
    return payload if isinstance(payload, dict) else {}


def _list(value: JsonValue | None) -> list[JsonValue]:
    return value if isinstance(value, list) else []


def _text(value: JsonValue | None) -> str:
    return value if isinstance(value, str) else ""


def _risk_level(candidate: JsonObject) -> str:
    risk = candidate.get("risk")
    return _text(risk.get("level")) if isinstance(risk, dict) else ""


def _source_artifact_id(candidate: JsonObject) -> str:
    provenance = candidate.get("provenance")
    return _text(provenance.get("source_artifact_id")) if isinstance(provenance, dict) else ""


def _public_risk(candidate: JsonObject) -> JsonObject:
    risk = candidate.get("risk")
    if not isinstance(risk, dict):
        raise ImprovementCandidateError("candidate risk is malformed")
    reason_codes = _public_text_list(risk.get("reason_codes"), "risk reason code", 20, 200)
    level = _text(risk.get("level"))
    if level not in {"low", "medium", "high"}:
        raise ImprovementCandidateError("candidate risk is malformed")
    if risk.get("requires_owner_approval") is not True:
        raise ImprovementCandidateError("candidate risk is malformed")
    return {
        "level": level,
        "reason_codes": reason_codes,
        "requires_owner_approval": True,
    }


def _public_provenance(candidate: JsonObject) -> JsonObject:
    provenance = candidate.get("provenance")
    source = provenance if isinstance(provenance, dict) else {}
    linked = source.get("linked_refs")
    linked_refs = linked if isinstance(linked, dict) else {}
    return {
        "source_artifact_id": _safe_required_ref(source.get("source_artifact_id"), "source artifact id"),
        "source_episode_ref": _safe_required_ref(source.get("source_episode_ref"), "source episode ref"),
        "source_closure_event_id": _safe_required_ref(source.get("source_closure_event_id"), "source closure event id"),
        "source_event_ids": _safe_ref_list(source.get("source_event_ids"), "source event id", 50),
        "linked_refs": {
            "run_ids": [_safe_public_ref(item) for item in _list(linked_refs.get("run_ids")) if _safe_public_ref(item)][:20],
            "iteration_ids": [
                _safe_public_ref(item) for item in _list(linked_refs.get("iteration_ids")) if _safe_public_ref(item)
            ][:20],
            "room_ids": [_safe_public_ref(item) for item in _list(linked_refs.get("room_ids")) if _safe_public_ref(item)][:20],
            "handoff_ids": [
                _safe_public_ref(item) for item in _list(linked_refs.get("handoff_ids")) if _safe_public_ref(item)
            ][:20],
        },
        "evidence_refs": _safe_ref_list(source.get("evidence_refs"), "evidence ref", 20),
    }


def _safe_public_ref(value: JsonValue) -> str:
    if not isinstance(value, str):
        raise ImprovementCandidateError("linked ref must be text")
    validate_public_token(value, "linked ref")
    return value


def _safe_required_ref(value: JsonValue | None, label: str) -> str:
    text = _text(value)
    validate_bounded_token(text, label, 200)
    return text


def _safe_ref_list(value: JsonValue | None, label: str, max_count: int) -> list[str]:
    items = _list(value)
    if len(items) > max_count:
        raise ImprovementCandidateError(f"{label} is over limit")
    refs: list[str] = []
    for item in items:
        text = _text(item)
        validate_bounded_token(text, label, 200)
        refs.append(text)
    return refs
