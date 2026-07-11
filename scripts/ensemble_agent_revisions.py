#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from ensemble_contracts import parse_simple_yaml
from ensemble_episode_model import JsonObject
from ensemble_events import append_event, load_events
from ensemble_improvement_candidate_model import (
    ImprovementCandidateError,
    validate_bounded_token,
    validate_reason_code,
)
from ensemble_improvement_candidates import show_improvement_candidate
from ensemble_owner_auth import OwnerAuthorizationError, require_project_owner
from ensemble_registry import SKILL_ALLOWED_FIELDS, SKILL_REQUIRED_FIELDS
from ensemble_workspace_lock import workspace_lock

REVISION_PROPOSED = "improvement.revision_proposed"
REVISION_APPLIED = "improvement.revision_applied"
REVISION_ROLLED_BACK = "improvement.revision_rolled_back"
APPROVAL_REQUESTED = "approval.requested"
APPROVAL_GRANTED = "approval.granted"
FIELD_ORDER = (
    "schema_v",
    "skill_id",
    "family",
    "summary",
    "triggers",
    "inputs",
    "outputs",
    "approval_class",
    "default_workflow",
    "compatible_runtimes",
)
LIST_FIELDS = frozenset({"triggers", "inputs", "outputs", "compatible_runtimes"})
TOKEN_FIELDS = frozenset({"skill_id", "family", "approval_class", "default_workflow"})
CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
HEX_SHA_RE = re.compile(r"^[a-f0-9]{64}$")
TEXT_RE = re.compile(r"^[A-Za-z0-9_.,:/() \-]+$")
TOKEN_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,119}$")
PRIVATE_MARKERS = ("raw transcript", "provider prompt", "provider completion", "stdout", "stderr", "scratchpad")
SECRET_RE = re.compile(r"(?i)(token\s*=|api[_-]?key\s*=|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+|ghp_[a-z0-9]+)")
PATH_RE = re.compile(r"(?i)([a-z]:(?:\\+|/+)[^\s]+|\\\\[^\\\s]+\\[^\s]+|(^|\s)/(?!/)[^\s]+)")
REVISION_PAYLOAD_KEYS = frozenset(
    {
        "artifact_kind",
        "schema_v",
        "revision_id",
        "candidate_id",
        "candidate_version",
        "candidate_proposal_sha256",
        "target_ref",
        "base_source_sha256",
        "base_canonical_sha256",
        "next_canonical_sha256",
        "approval_request_id",
        "status",
        "base_manifest",
        "next_manifest",
    }
)
APPROVAL_PAYLOAD_KEYS = frozenset(
    {
        "request_id",
        "revision_id",
        "candidate_id",
        "candidate_version",
        "candidate_proposal_sha256",
        "action_type",
        "target_ref",
        "base_source_sha256",
        "base_canonical_sha256",
        "next_canonical_sha256",
    }
)
GRANT_PAYLOAD_KEYS = APPROVAL_PAYLOAD_KEYS | frozenset({"decision", "decision_reason_code"})
TERMINAL_PAYLOAD_KEYS = APPROVAL_PAYLOAD_KEYS | frozenset({"decision_reason_code"})


class AgentRevisionError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Target:
    ref: str
    skill_id: str
    path: Path


@dataclass(frozen=True, slots=True)
class RevisionRecord:
    index: int
    event: JsonObject
    payload: JsonObject


def serialize_skill_manifest(manifest: dict[str, Any]) -> str:
    parsed = _parse_manifest(manifest)
    return _serialize_manifest(parsed)


def _serialize_manifest(parsed: JsonObject) -> str:
    lines: list[str] = []
    for field in FIELD_ORDER:
        if field not in parsed:
            continue
        value = parsed[field]
        if isinstance(value, list):
            lines.append(f"{field}: [{', '.join(str(item) for item in value)}]")
        elif field == "summary":
            lines.append(f'{field}: "{value}"')
        else:
            lines.append(f"{field}: {value}")
    return "\n".join(lines) + "\n"


def propose_agent_skill_revision(
    workspace: str | Path,
    candidate_id: str,
    next_manifest: dict[str, Any],
    *,
    actor: str = "supervisor",
) -> JsonObject:
    validate_bounded_token(actor, "actor", 128)
    with workspace_lock(workspace):
        workspace_root = Path(workspace)
        candidate = _approved_skill_candidate(workspace_root, candidate_id)
        target = _target_for_candidate(workspace_root, candidate)
        next_parsed = _parse_manifest(next_manifest)
        if next_parsed["skill_id"] != target.skill_id:
            raise AgentRevisionError("revision target does not match manifest")
        base_source = _read_existing_target(target)
        try:
            warnings: list[str] = []
            base_manifest = _parse_manifest(parse_simple_yaml(base_source.decode("utf-8"), warnings))
        except UnicodeDecodeError as exc:
            raise AgentRevisionError("target skill manifest is not valid utf-8") from exc
        if warnings:
            raise AgentRevisionError("target skill manifest is malformed")
        if base_manifest["skill_id"] != target.skill_id:
            raise AgentRevisionError("target manifest does not match candidate")
        base_source_sha = _sha_bytes(base_source)
        base_canonical_sha = _manifest_sha(base_manifest)
        next_canonical_sha = _manifest_sha(next_parsed)
        if base_canonical_sha == next_canonical_sha:
            raise AgentRevisionError("revision is unchanged")
        payload = _revision_payload(candidate, target, base_manifest, next_parsed, base_source_sha)
        events = load_events(workspace_root)
        for record in _revision_records(events):
            if record.payload == payload:
                _ensure_apply_request(workspace_root, payload, actor, events)
                return show_agent_skill_revision(workspace_root, str(payload["revision_id"]))
        append_event(
            workspace_root,
            event_type=REVISION_PROPOSED,
            actor={"type": "agent", "name": actor},
            scope={"surface": "agent-improvement", "revision_id": str(payload["revision_id"])},
            payload=payload,
        )
        _append_action_request(
            workspace_root,
            payload,
            "apply_agent_revision",
            actor=actor,
        )
        return show_agent_skill_revision(workspace_root, str(payload["revision_id"]))


def show_agent_skill_revision(workspace: str | Path, revision_id: str) -> JsonObject:
    events = load_events(workspace)
    return replay_agent_skill_revision(workspace, revision_id, events)


def replay_agent_skill_revision(
    workspace: str | Path,
    revision_id: str,
    events: list[JsonObject],
) -> JsonObject:
    validate_bounded_token(revision_id, "revision id", 128)
    workspace_root = Path(workspace)
    record = _find_revision(events, revision_id)
    return _public_revision(_hydrate_revision(workspace_root, record, events))


def apply_agent_skill_revision(
    workspace: str | Path,
    revision_id: str,
    *,
    reason_code: str,
) -> JsonObject:
    if revision_id.startswith("candidate-"):
        raise AgentRevisionError("candidate metadata is not materializable")
    validate_reason_code(reason_code)
    with workspace_lock(workspace):
        workspace_root = Path(workspace)
        events = load_events(workspace_root)
        _find_revision(events, revision_id)
        revisions, _ = _replay_revision_targets(workspace_root, events)
        revision = revisions[revision_id]
        phase = str(revision["phase"])
        if phase == "applied":
            _materialize_revision(workspace_root, revision, "next_manifest")
            return _public_revision(revision)
        if phase not in {"apply_requested", "apply_granted"}:
            raise AgentRevisionError("revision is not pending apply")
        try:
            require_project_owner(workspace_root)
        except OwnerAuthorizationError as exc:
            raise AgentRevisionError("project owner authorization failed") from exc
        target = _target_from_revision(workspace_root, revision)
        if _sha_bytes(_read_existing_target(target)) != revision["base_source_sha256"]:
            raise AgentRevisionError("target source hash is stale")
        _ensure_apply_grant(workspace_root, revision, reason_code, events)
        append_event(
            workspace_root,
            event_type=REVISION_APPLIED,
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": revision_id},
            payload=_terminal_payload(revision, "apply_agent_revision", reason_code),
        )
        _atomic_write(target, serialize_skill_manifest(_manifest(revision, "next_manifest")))
        return show_agent_skill_revision(workspace_root, revision_id)


def rollback_agent_skill_revision(
    workspace: str | Path,
    revision_id: str,
    *,
    reason_code: str,
) -> JsonObject:
    validate_reason_code(reason_code)
    with workspace_lock(workspace):
        workspace_root = Path(workspace)
        events = load_events(workspace_root)
        _find_revision(events, revision_id)
        revisions, targets = _replay_revision_targets(workspace_root, events)
        revision = revisions[revision_id]
        phase = str(revision["phase"])
        if phase == "rolled_back":
            _materialize_revision(workspace_root, revision, "base_manifest")
            return _public_revision(revision)
        target_state = targets.get(str(revision["target_ref"]))
        active_ids = target_state.get("active_revision_ids", []) if target_state else []
        if phase not in {"applied", "rollback_requested", "rollback_granted"} or not active_ids or active_ids[-1] != revision_id:
            raise AgentRevisionError("revision is not active")
        try:
            require_project_owner(workspace_root)
        except OwnerAuthorizationError as exc:
            raise AgentRevisionError("project owner authorization failed") from exc
        target = _target_from_revision(workspace_root, revision)
        if _sha_bytes(_read_existing_target(target)) != revision["next_canonical_sha256"]:
            raise AgentRevisionError("target source hash is stale")
        _ensure_action_request(workspace_root, revision, "rollback_agent_revision", actor="rollback", events=events)
        _ensure_action_grant(workspace_root, revision, "rollback_agent_revision", reason_code, events)
        append_event(
            workspace_root,
            event_type=REVISION_ROLLED_BACK,
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": revision_id},
            payload=_terminal_payload(revision, "rollback_agent_revision", reason_code),
        )
        _atomic_write(target, serialize_skill_manifest(_manifest(revision, "base_manifest")))
        return show_agent_skill_revision(workspace_root, revision_id)


def rebuild_agent_skill_revisions(workspace: str | Path) -> JsonObject:
    with workspace_lock(workspace):
        workspace_root = Path(workspace)
        try:
            require_project_owner(workspace_root)
        except OwnerAuthorizationError as exc:
            raise AgentRevisionError("project owner authorization failed") from exc
        events = load_events(workspace_root)
        _, target_states = _replay_revision_targets(workspace_root, events)
        targets = [
            (
                _target_from_ref(workspace_root, target_ref, require_existing=False),
                _manifest(state, "manifest"),
            )
            for target_ref, state in sorted(target_states.items())
        ]
        for target, _ in targets:
            _ensure_safe_projection_path(target)
        rebuilt: list[JsonObject] = []
        for target, manifest in targets:
            _atomic_write(target, serialize_skill_manifest(manifest))
            rebuilt.append({"target_ref": target.ref, "sha256": _manifest_sha(manifest)})
        return {"rebuilt": rebuilt}


def _approved_skill_candidate(workspace: Path, candidate_id: str) -> JsonObject:
    try:
        candidate = show_improvement_candidate(workspace, candidate_id)
    except ImprovementCandidateError as exc:
        raise AgentRevisionError("candidate is not valid") from exc
    if candidate.get("status") != "approved" or candidate.get("kind") != "skill_patch":
        raise AgentRevisionError("candidate is not an approved skill patch")
    return candidate


def _revision_payload(
    candidate: JsonObject,
    target: Target,
    base_manifest: JsonObject,
    next_manifest: JsonObject,
    base_source_sha: str,
) -> JsonObject:
    candidate_id = str(candidate["candidate_id"])
    candidate_version = candidate["candidate_version"]
    candidate_proposal_sha = str(candidate["proposal_sha256"])
    next_sha = _manifest_sha(next_manifest)
    revision_key = _sha_text(
        f"{candidate_id}|{candidate_version}|{candidate_proposal_sha}|{target.ref}|{base_source_sha}|{next_sha}"
    )[:20]
    revision_id = f"revision-{revision_key}"
    return {
        "artifact_kind": "agent_skill_revision",
        "schema_v": 1,
        "revision_id": revision_id,
        "candidate_id": candidate_id,
        "candidate_version": candidate_version,
        "candidate_proposal_sha256": candidate_proposal_sha,
        "target_ref": target.ref,
        "base_source_sha256": base_source_sha,
        "base_canonical_sha256": _manifest_sha(base_manifest),
        "next_canonical_sha256": next_sha,
        "approval_request_id": f"approval-{revision_id}",
        "status": "pending_apply",
        "base_manifest": base_manifest,
        "next_manifest": next_manifest,
    }


def _hydrate_revision(
    workspace: Path,
    record: RevisionRecord,
    events: list[JsonObject],
    *,
    validate_candidate: bool = True,
) -> JsonObject:
    _validate_revision_proposal_event(record.event, record.payload)
    payload = _validate_revision_payload(workspace, record.payload, validate_candidate=validate_candidate)
    if validate_candidate:
        _validate_candidate_precedes_revision(events, record, payload)
    status = "pending_apply"
    apply_requested = False
    apply_granted_reason: str | None = None
    rollback_requested = False
    rollback_granted_reason: str | None = None
    applied = False
    applied_index: int | None = None
    rolled_back_index: int | None = None
    for event_index, event in enumerate(events):
        if event_index == record.index or not _is_revision_authority_event(event, payload):
            continue
        if event_index < record.index:
            raise AgentRevisionError("revision authority event precedes proposal")
        if not _event_scope_matches(event, payload):
            raise AgentRevisionError("revision authority event scope is malformed")
        event_type = event.get("type")
        body = _payload(event)
        if status == "rolled_back":
            raise AgentRevisionError("revision received events after rollback")
        match event_type:
            case "improvement.revision_proposed":
                raise AgentRevisionError("duplicate revision proposal")
            case "approval.requested":
                action = _request_action(event, body, payload)
                if action == "apply_agent_revision":
                    if apply_requested:
                        raise AgentRevisionError("duplicate revision apply request")
                    if applied:
                        raise AgentRevisionError("revision apply request after apply")
                    apply_requested = True
                elif action == "rollback_agent_revision":
                    if not applied:
                        raise AgentRevisionError("revision rollback request before apply")
                    if rollback_requested:
                        raise AgentRevisionError("duplicate revision rollback request")
                    rollback_requested = True
            case "approval.granted":
                action, reason_code = _grant_action(event, body, payload)
                if action == "apply_agent_revision":
                    if not apply_requested:
                        raise AgentRevisionError("revision apply grant before request")
                    if apply_granted_reason is not None:
                        raise AgentRevisionError("duplicate revision apply grant")
                    apply_granted_reason = reason_code
                elif action == "rollback_agent_revision":
                    if not applied or not rollback_requested:
                        raise AgentRevisionError("revision rollback grant before request")
                    if rollback_granted_reason is not None:
                        raise AgentRevisionError("duplicate revision rollback grant")
                    rollback_granted_reason = reason_code
            case "improvement.revision_applied":
                _validate_terminal_event(
                    event,
                    body,
                    payload,
                    "apply_agent_revision",
                    expected_reason_code=apply_granted_reason,
                )
                if apply_granted_reason is None:
                    raise AgentRevisionError("revision applied without owner grant")
                if applied:
                    raise AgentRevisionError("duplicate revision applied event")
                applied = True
                applied_index = event_index
                status = "applied"
            case "improvement.revision_rolled_back":
                _validate_terminal_event(
                    event,
                    body,
                    payload,
                    "rollback_agent_revision",
                    expected_reason_code=rollback_granted_reason,
                )
                if rollback_granted_reason is None:
                    raise AgentRevisionError("revision rolled back without owner grant")
                if status != "applied":
                    raise AgentRevisionError("revision rolled back before apply")
                rolled_back_index = event_index
                status = "rolled_back"
            case _:
                continue
    revision = dict(payload)
    revision["status"] = status
    revision["apply_requested"] = apply_requested
    revision["phase"] = _revision_phase(
        status=status,
        apply_requested=apply_requested,
        apply_granted=apply_granted_reason is not None,
        rollback_requested=rollback_requested,
        rollback_granted=rollback_granted_reason is not None,
    )
    revision["applied_event_index"] = applied_index
    revision["rolled_back_event_index"] = rolled_back_index
    return revision


def _revision_phase(
    *,
    status: str,
    apply_requested: bool,
    apply_granted: bool,
    rollback_requested: bool,
    rollback_granted: bool,
) -> str:
    if status == "rolled_back":
        return "rolled_back"
    if rollback_granted:
        return "rollback_granted"
    if rollback_requested:
        return "rollback_requested"
    if status == "applied":
        return "applied"
    if apply_granted:
        return "apply_granted"
    if apply_requested:
        return "apply_requested"
    return "proposed"


def _is_revision_authority_event(event: JsonObject, revision: JsonObject) -> bool:
    if event.get("type") not in {
        REVISION_PROPOSED,
        REVISION_APPLIED,
        REVISION_ROLLED_BACK,
        APPROVAL_REQUESTED,
        APPROVAL_GRANTED,
    }:
        return False
    revision_id = revision.get("revision_id")
    scope = event.get("scope")
    scope_revision_id = scope.get("revision_id") if isinstance(scope, dict) else None
    return _payload(event).get("revision_id") == revision_id or scope_revision_id == revision_id


def _validate_candidate_precedes_revision(
    events: list[JsonObject],
    record: RevisionRecord,
    revision: JsonObject,
) -> None:
    candidate_id = str(revision["candidate_id"])
    proposal_sha = str(revision["candidate_proposal_sha256"])
    candidate_records = [
        (index, event)
        for index, event in enumerate(events)
        if event.get("type") == "improvement.candidate_proposed"
        and _payload(event).get("candidate_id") == candidate_id
    ]
    if len(candidate_records) != 1:
        raise AgentRevisionError("revision candidate history is malformed")
    candidate_index, candidate_event = candidate_records[0]
    candidate_payload = _payload(candidate_event)
    if (
        candidate_index >= record.index
        or candidate_event.get("actor", {}).get("type") != "agent"
        or candidate_event.get("scope")
        != {"surface": "agent-improvement", "candidate_id": candidate_id}
        or candidate_payload.get("candidate_version") != revision["candidate_version"]
        or candidate_payload.get("target_ref") != revision["target_ref"]
        or candidate_payload.get("proposal_sha256") != proposal_sha
    ):
        raise AgentRevisionError("revision candidate history is malformed")
    expected_request_id = f"approval-{candidate_id}"
    approved_before_revision = any(
        index < record.index
        and event.get("type") == APPROVAL_GRANTED
        and event.get("actor", {}).get("type") == "reviewer"
        and event.get("scope")
        == {"surface": "agent-improvement", "candidate_id": candidate_id}
        and _payload(event).get("request_id") == expected_request_id
        and _payload(event).get("candidate_id") == candidate_id
        and _payload(event).get("candidate_version") == revision["candidate_version"]
        and _payload(event).get("action_type") == "review_improvement_candidate"
        and _payload(event).get("decision") == "approved"
        for index, event in enumerate(events)
    )
    if not approved_before_revision:
        raise AgentRevisionError("revision candidate was not approved before proposal")


def _replay_revision_targets(
    workspace: Path,
    events: list[JsonObject],
) -> tuple[dict[str, JsonObject], dict[str, JsonObject]]:
    records = _revision_records(events)
    revisions: dict[str, JsonObject] = {}
    for record in records:
        revision_id = record.payload.get("revision_id")
        if not isinstance(revision_id, str):
            raise AgentRevisionError("revision proposal identity is malformed")
        if revision_id in revisions:
            raise AgentRevisionError("duplicate revision proposal")
        revisions[revision_id] = _hydrate_revision(workspace, record, events)

    terminal_events: list[tuple[int, str, JsonObject]] = []
    for revision in revisions.values():
        applied_index = revision.get("applied_event_index")
        rolled_back_index = revision.get("rolled_back_event_index")
        if isinstance(applied_index, int) and not isinstance(applied_index, bool):
            terminal_events.append((applied_index, "apply", revision))
        if isinstance(rolled_back_index, int) and not isinstance(rolled_back_index, bool):
            terminal_events.append((rolled_back_index, "rollback", revision))

    target_states: dict[str, JsonObject] = {}
    for _, action, revision in sorted(terminal_events, key=lambda item: item[0]):
        target_ref = str(revision["target_ref"])
        revision_id = str(revision["revision_id"])
        state = target_states.get(target_ref)
        if action == "apply":
            if state is not None:
                current_manifest = _manifest(state, "manifest")
                if revision["base_source_sha256"] != _manifest_sha(current_manifest):
                    raise AgentRevisionError("revision apply chain is stale")
                active_ids = list(state.get("active_revision_ids", []))
            else:
                active_ids = []
            active_ids.append(revision_id)
            target_states[target_ref] = {
                "manifest": _manifest(revision, "next_manifest"),
                "active_revision_ids": active_ids,
            }
            continue

        if state is None:
            raise AgentRevisionError("revision rollback chain is malformed")
        active_ids = list(state.get("active_revision_ids", []))
        if not active_ids or active_ids[-1] != revision_id:
            raise AgentRevisionError("revision rollback is not the active revision")
        if _manifest_sha(_manifest(state, "manifest")) != revision["next_canonical_sha256"]:
            raise AgentRevisionError("revision rollback chain is stale")
        active_ids.pop()
        target_states[target_ref] = {
            "manifest": _manifest(revision, "base_manifest"),
            "active_revision_ids": active_ids,
        }
    return revisions, target_states


def _validate_revision_payload(workspace: Path, payload: JsonObject, *, validate_candidate: bool) -> JsonObject:
    if set(payload) != REVISION_PAYLOAD_KEYS:
        raise AgentRevisionError("revision payload is malformed")
    if payload.get("artifact_kind") != "agent_skill_revision" or payload.get("schema_v") != 1:
        raise AgentRevisionError("revision identity is malformed")
    for key in (
        "revision_id",
        "candidate_id",
        "candidate_proposal_sha256",
        "target_ref",
        "base_source_sha256",
        "base_canonical_sha256",
        "next_canonical_sha256",
        "approval_request_id",
    ):
        if not isinstance(payload.get(key), str):
            raise AgentRevisionError("revision identity is malformed")
    for key in ("candidate_proposal_sha256", "base_source_sha256", "base_canonical_sha256", "next_canonical_sha256"):
        if not HEX_SHA_RE.fullmatch(str(payload[key])):
            raise AgentRevisionError("revision hash is malformed")
    if not isinstance(payload.get("candidate_version"), int) or isinstance(payload.get("candidate_version"), bool):
        raise AgentRevisionError("revision candidate linkage is malformed")
    if payload.get("status") != "pending_apply":
        raise AgentRevisionError("revision status is malformed")
    base_manifest = _manifest(payload, "base_manifest")
    next_manifest = _manifest(payload, "next_manifest")
    target = _target_from_ref(workspace, str(payload.get("target_ref", "")), require_existing=False)
    if base_manifest["skill_id"] != target.skill_id or next_manifest["skill_id"] != target.skill_id:
        raise AgentRevisionError("revision target is malformed")
    if payload.get("base_canonical_sha256") != _manifest_sha(base_manifest):
        raise AgentRevisionError("revision base hash is malformed")
    if payload.get("next_canonical_sha256") != _manifest_sha(next_manifest):
        raise AgentRevisionError("revision next hash is malformed")
    candidate_id = str(payload.get("candidate_id", ""))
    candidate_version = payload.get("candidate_version")
    candidate_proposal_sha = str(payload.get("candidate_proposal_sha256", ""))
    expected_id = _revision_payload(
        {
            "candidate_id": candidate_id,
            "candidate_version": candidate_version,
            "proposal_sha256": candidate_proposal_sha,
        },
        target,
        base_manifest,
        next_manifest,
        str(payload.get("base_source_sha256", "")),
    )["revision_id"]
    if payload.get("revision_id") != expected_id or payload.get("approval_request_id") != f"approval-{expected_id}":
        raise AgentRevisionError("revision identity is malformed")
    if validate_candidate:
        candidate = _approved_skill_candidate(workspace, candidate_id)
        if (
            candidate.get("candidate_version") != candidate_version
            or candidate.get("target_ref") != target.ref
            or candidate.get("proposal_sha256") != candidate_proposal_sha
        ):
            raise AgentRevisionError("revision candidate linkage is malformed")
    return payload


def _parse_manifest(manifest: dict[str, Any]) -> JsonObject:
    if set(manifest) - SKILL_ALLOWED_FIELDS:
        raise AgentRevisionError("skill manifest has unknown fields")
    if any(field not in manifest for field in SKILL_REQUIRED_FIELDS):
        raise AgentRevisionError("skill manifest is missing required fields")
    if isinstance(manifest.get("schema_v"), bool) or manifest.get("schema_v") != 1:
        raise AgentRevisionError("skill manifest schema is unsupported")
    parsed: JsonObject = {"schema_v": 1}
    for field in FIELD_ORDER[1:]:
        if field not in manifest:
            continue
        value = manifest[field]
        if field in LIST_FIELDS:
            if not isinstance(value, list):
                raise AgentRevisionError("skill manifest field is malformed")
            if len(value) > 50:
                raise AgentRevisionError("skill manifest list is over limit")
            parsed[field] = [_clean_token(item, field, 120) for item in value]
        elif field in TOKEN_FIELDS:
            parsed[field] = _clean_token(value, field, 120)
        elif field == "summary":
            parsed[field] = _clean_text(value, field, 500)
        else:
            raise AgentRevisionError("skill manifest field is malformed")
    skill_id = str(parsed.get("skill_id", ""))
    if not CODE_RE.fullmatch(skill_id):
        raise AgentRevisionError("skill id is malformed")
    if len(_serialize_manifest(parsed).encode("utf-8")) > 8192:
        raise AgentRevisionError("skill manifest is over limit")
    return parsed


def _clean_text(value: Any, label: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise AgentRevisionError(f"{label} is malformed")
    if any(ord(char) < 32 for char in value):
        raise AgentRevisionError(f"{label} contains control characters")
    lowered = value.casefold()
    if any(marker in lowered for marker in PRIVATE_MARKERS) or SECRET_RE.search(value) or PATH_RE.search(value):
        raise AgentRevisionError(f"{label} contains unsafe content")
    if ".." in value.replace("\\", "/").split("/") or ":" in value:
        raise AgentRevisionError(f"{label} is serializer ambiguous")
    if not TEXT_RE.fullmatch(value):
        raise AgentRevisionError(f"{label} is serializer ambiguous")
    return value


def _clean_token(value: Any, label: str, limit: int) -> str:
    text = _clean_text(value, label, limit)
    if not TOKEN_RE.fullmatch(text):
        raise AgentRevisionError(f"{label} is malformed")
    return text


def _target_for_candidate(workspace: Path, candidate: JsonObject) -> Target:
    return _target_from_ref(workspace, str(candidate.get("target_ref", "")), require_existing=True)


def _target_from_revision(workspace: Path, revision: JsonObject) -> Target:
    return _target_from_ref(workspace, str(revision.get("target_ref", "")), require_existing=True)


def _target_from_ref(workspace: Path, target_ref: str, *, require_existing: bool) -> Target:
    validate_bounded_token(target_ref, "target ref", 200)
    parts = target_ref.split("/")
    if len(parts) != 2 or parts[0] != "skills" or not CODE_RE.fullmatch(parts[1]):
        raise AgentRevisionError("target ref is unsupported")
    target = Target(ref=target_ref, skill_id=parts[1], path=workspace / ".agent" / "skills" / f"{parts[1]}.yaml")
    if require_existing:
        _read_existing_target(target)
    return target


def _read_existing_target(target: Target) -> bytes:
    _ensure_safe_projection_path(target)
    if not target.path.exists() or not target.path.is_file():
        raise AgentRevisionError("target skill manifest is missing")
    try:
        return target.path.read_bytes()
    except OSError as exc:
        raise AgentRevisionError("target skill manifest is unreadable") from exc


def _ensure_safe_projection_path(target: Target) -> None:
    workspace_root = target.path.parents[2]
    agent_root = workspace_root / ".agent"
    skills_root = agent_root / "skills"
    if not workspace_root.exists() or not workspace_root.is_dir():
        raise AgentRevisionError("target skill manifest is unsafe")
    if any(_is_link_like(path) for path in (agent_root, skills_root, target.path)):
        raise AgentRevisionError("target skill manifest is unsafe")
    if agent_root.exists() and not agent_root.is_dir():
        raise AgentRevisionError("target skill manifest is unsafe")
    if skills_root.exists() and not skills_root.is_dir():
        raise AgentRevisionError("target skill manifest is unsafe")
    if target.path.exists() and not target.path.is_file():
        raise AgentRevisionError("target skill manifest is unsafe")
    try:
        resolved_workspace = workspace_root.resolve(strict=True)
        expected_agent = resolved_workspace / ".agent"
        expected_skills = expected_agent / "skills"
        if agent_root.resolve(strict=False) != expected_agent:
            raise AgentRevisionError("target skill manifest is unsafe")
        if skills_root.resolve(strict=False) != expected_skills:
            raise AgentRevisionError("target skill manifest is unsafe")
        if target.path.resolve(strict=False) != expected_skills / target.path.name:
            raise AgentRevisionError("target skill manifest is unsafe")
    except OSError as exc:
        raise AgentRevisionError("target skill manifest is unsafe") from exc


def _is_link_like(path: Path) -> bool:
    try:
        if path.is_symlink():
            return True
        is_junction = getattr(path, "is_junction", None)
        return bool(is_junction()) if callable(is_junction) else False
    except OSError as exc:
        raise AgentRevisionError("target skill manifest is unsafe") from exc


def _public_revision(revision: JsonObject) -> JsonObject:
    return {
        "artifact_kind": revision["artifact_kind"],
        "schema_v": revision["schema_v"],
        "revision_id": revision["revision_id"],
        "candidate_id": revision["candidate_id"],
        "candidate_version": revision["candidate_version"],
        "candidate_proposal_sha256": revision["candidate_proposal_sha256"],
        "target_ref": revision["target_ref"],
        "base_source_sha256": revision["base_source_sha256"],
        "base_canonical_sha256": revision["base_canonical_sha256"],
        "next_canonical_sha256": revision["next_canonical_sha256"],
        "approval_request_id": revision["approval_request_id"],
        "status": revision["status"],
        "apply_requested": revision["apply_requested"],
    }


def _revision_records(events: list[JsonObject]) -> list[RevisionRecord]:
    return [
        RevisionRecord(index, event, _payload(event))
        for index, event in enumerate(events)
        if event.get("type") == REVISION_PROPOSED
    ]


def _find_revision(events: list[JsonObject], revision_id: str) -> RevisionRecord:
    matches: list[RevisionRecord] = []
    for record in _revision_records(events):
        if record.payload.get("revision_id") == revision_id:
            matches.append(record)
    if len(matches) > 1:
        raise AgentRevisionError("duplicate revision proposal")
    if matches:
        return matches[0]
    raise AgentRevisionError("revision not found")


def _ensure_apply_request(workspace: Path, revision: JsonObject, actor: str, events: list[JsonObject]) -> None:
    _ensure_action_request(workspace, revision, "apply_agent_revision", actor=actor, events=events)


def _ensure_apply_grant(workspace: Path, revision: JsonObject, reason_code: str, events: list[JsonObject]) -> None:
    _ensure_action_grant(workspace, revision, "apply_agent_revision", reason_code, events)


def _approval_payload(revision: JsonObject, action: str) -> JsonObject:
    request_id = revision["approval_request_id"]
    if action == "rollback_agent_revision":
        request_id = f"approval-rollback-{revision['revision_id']}"
    return {
        "request_id": request_id,
        "revision_id": revision["revision_id"],
        "candidate_id": revision["candidate_id"],
        "candidate_version": revision["candidate_version"],
        "candidate_proposal_sha256": revision["candidate_proposal_sha256"],
        "action_type": action,
        "target_ref": revision["target_ref"],
        "base_source_sha256": revision["base_source_sha256"],
        "base_canonical_sha256": revision["base_canonical_sha256"],
        "next_canonical_sha256": revision["next_canonical_sha256"],
    }


def _terminal_payload(revision: JsonObject, action: str, reason_code: str) -> JsonObject:
    body = _approval_payload(revision, action)
    body["decision_reason_code"] = reason_code
    return body


def _ensure_action_request(
    workspace: Path,
    revision: JsonObject,
    action: Literal["apply_agent_revision", "rollback_agent_revision"],
    *,
    actor: str,
    events: list[JsonObject],
) -> None:
    if any(_is_exact_request(event, revision, action) for event in events):
        return
    _append_action_request(workspace, revision, action, actor=actor)


def _ensure_action_grant(
    workspace: Path,
    revision: JsonObject,
    action: Literal["apply_agent_revision", "rollback_agent_revision"],
    reason_code: str,
    events: list[JsonObject],
) -> None:
    if any(_is_exact_grant(event, revision, action, reason_code) for event in events):
        return
    if any(_is_action_grant(event, revision, action) for event in events):
        raise AgentRevisionError(f"revision {action} grant reason mismatch")
    _append_action_grant(workspace, revision, action, reason_code)


def _append_action_request(
    workspace: Path,
    revision: JsonObject,
    action: Literal["apply_agent_revision", "rollback_agent_revision"],
    *,
    actor: str,
) -> None:
    append_event(
        workspace,
        event_type=APPROVAL_REQUESTED,
        actor={"type": "agent", "name": actor},
        scope={"surface": "agent-improvement", "revision_id": str(revision["revision_id"])},
        payload=_approval_payload(revision, action),
    )


def _append_action_grant(
    workspace: Path,
    revision: JsonObject,
    action: Literal["apply_agent_revision", "rollback_agent_revision"],
    reason_code: str,
) -> None:
    body = _approval_payload(revision, action)
    body["decision"] = "approved"
    body["decision_reason_code"] = reason_code
    append_event(
        workspace,
        event_type=APPROVAL_GRANTED,
        actor={"type": "owner", "name": "local-owner"},
        scope={"surface": "agent-improvement", "revision_id": str(revision["revision_id"])},
        payload=body,
    )


def _event_scope_matches(event: JsonObject, revision: JsonObject) -> bool:
    scope = event.get("scope")
    return isinstance(scope, dict) and scope == {
        "surface": "agent-improvement",
        "revision_id": revision.get("revision_id"),
    }


def _request_action(event: JsonObject, body: JsonObject, revision: JsonObject) -> str | None:
    if event.get("actor", {}).get("type") != "agent" or set(body) != APPROVAL_PAYLOAD_KEYS:
        raise AgentRevisionError("revision request is malformed")
    action = body.get("action_type")
    if action not in {"apply_agent_revision", "rollback_agent_revision"}:
        raise AgentRevisionError("revision request action is malformed")
    if body != _approval_payload(revision, str(action)):
        raise AgentRevisionError("revision request payload is malformed")
    return str(action)


def _grant_action(event: JsonObject, body: JsonObject, revision: JsonObject) -> tuple[str, str]:
    if event.get("actor", {}).get("type") != "owner" or set(body) != GRANT_PAYLOAD_KEYS:
        raise AgentRevisionError("revision grant is malformed")
    action = body.get("action_type")
    if action not in {"apply_agent_revision", "rollback_agent_revision"}:
        raise AgentRevisionError("revision grant action is malformed")
    expected = _approval_payload(revision, str(action))
    expected["decision"] = "approved"
    if any(body.get(key) != value for key, value in expected.items()):
        raise AgentRevisionError("revision grant payload is malformed")
    if not isinstance(body.get("decision_reason_code"), str):
        raise AgentRevisionError("revision grant reason is malformed")
    reason_code = str(body["decision_reason_code"])
    validate_reason_code(reason_code)
    return str(action), reason_code


def _validate_revision_proposal_event(event: JsonObject, payload: JsonObject) -> None:
    if event.get("type") != REVISION_PROPOSED:
        raise AgentRevisionError("revision proposal event is malformed")
    if event.get("actor", {}).get("type") != "agent":
        raise AgentRevisionError("revision proposal actor is malformed")
    if not _event_scope_matches(event, payload):
        raise AgentRevisionError("revision proposal scope is malformed")


def _validate_terminal_event(
    event: JsonObject,
    body: JsonObject,
    revision: JsonObject,
    action: Literal["apply_agent_revision", "rollback_agent_revision"],
    *,
    expected_reason_code: str | None,
) -> None:
    if event.get("actor", {}).get("type") != "owner" or set(body) != TERMINAL_PAYLOAD_KEYS:
        raise AgentRevisionError("revision terminal event is malformed")
    if not isinstance(body.get("decision_reason_code"), str):
        raise AgentRevisionError("revision terminal reason is malformed")
    reason_code = str(body["decision_reason_code"])
    if expected_reason_code is not None and reason_code != expected_reason_code:
        raise AgentRevisionError("revision terminal reason does not match grant")
    if body != _terminal_payload(revision, action, reason_code):
        raise AgentRevisionError("revision terminal payload is malformed")
    validate_reason_code(reason_code)


def _is_exact_grant(event: JsonObject, revision: JsonObject, action: str, reason_code: str) -> bool:
    body = _payload(event)
    expected = _approval_payload(revision, action)
    expected["decision"] = "approved"
    expected["decision_reason_code"] = reason_code
    return (
        event.get("type") == APPROVAL_GRANTED
        and event.get("actor", {}).get("type") == "owner"
        and _event_scope_matches(event, revision)
        and body == expected
    )


def _is_exact_request(event: JsonObject, revision: JsonObject, action: str) -> bool:
    return (
        event.get("type") == APPROVAL_REQUESTED
        and event.get("actor", {}).get("type") == "agent"
        and _event_scope_matches(event, revision)
        and _payload(event) == _approval_payload(revision, action)
    )


def _is_action_grant(event: JsonObject, revision: JsonObject, action: str) -> bool:
    body = _payload(event)
    expected = _approval_payload(revision, action)
    return (
        event.get("type") == APPROVAL_GRANTED
        and event.get("actor", {}).get("type") == "owner"
        and _event_scope_matches(event, revision)
        and all(body.get(key) == value for key, value in expected.items())
        and body.get("decision") == "approved"
        and isinstance(body.get("decision_reason_code"), str)
    )


def _manifest(value: JsonObject, key: str) -> JsonObject:
    manifest = value.get(key)
    if not isinstance(manifest, dict):
        raise AgentRevisionError("revision manifest is malformed")
    return _parse_manifest(manifest)


def _materialize_revision(
    workspace: Path,
    revision: JsonObject,
    manifest_key: Literal["base_manifest", "next_manifest"],
) -> None:
    target = _target_from_revision(workspace, revision)
    desired = serialize_skill_manifest(_manifest(revision, manifest_key))
    current = _read_existing_target(target)
    desired_bytes = desired.encode("utf-8")
    if current == desired_bytes:
        return
    prior_hash = (
        str(revision["base_source_sha256"])
        if manifest_key == "next_manifest"
        else str(revision["next_canonical_sha256"])
    )
    if _sha_bytes(current) != prior_hash:
        raise AgentRevisionError("target skill manifest drifted after terminal event")
    _atomic_write(target, desired)


def _payload(event: JsonObject) -> JsonObject:
    payload = event.get("payload")
    return payload if isinstance(payload, dict) else {}


def _manifest_sha(manifest: JsonObject) -> str:
    return _sha_text(serialize_skill_manifest(manifest))


def _sha_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _atomic_write(target: Target, text: str) -> None:
    path = target.path
    temp_path: Path | None = None
    try:
        _ensure_safe_projection_path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        _ensure_safe_projection_path(target)
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=str(path.parent),
        )
        temp_path = Path(temp_name)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        _ensure_safe_projection_path(target)
        os.replace(temp_path, path)
        _ensure_safe_projection_path(target)
        if path.read_bytes() != text.encode("utf-8"):
            raise AgentRevisionError("revision post-write verification failed")
    except AgentRevisionError:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise
    except OSError as exc:
        try:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise AgentRevisionError("revision materialization failed") from exc
