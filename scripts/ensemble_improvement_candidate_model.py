#!/usr/bin/env python3
from __future__ import annotations

import re
import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Literal

from ensemble_episode_model import JsonObject

CandidateKind = Literal["skill_patch", "workflow_revision", "agent_topology_revision"]
Decision = Literal["approved", "rejected"]
RiskLevel = Literal["low", "medium", "high"]
ALLOWED_KINDS = frozenset({"skill_patch", "workflow_revision", "agent_topology_revision"})

PRIVATE_MARKERS = (
    "raw transcript",
    "provider prompt",
    "provider completion",
    "stdout",
    "stderr",
    "scratchpad",
    "chain-of-thought",
    "private raw",
)
PRIVATE_MARKER_KEYS = frozenset("".join(char for char in marker if char.isalnum()) for marker in PRIVATE_MARKERS)
PROTECTED_MARKERS = frozenset(
    {
        "approval",
        "eventauthority",
        "identity",
        "network",
        "permission",
        "persona",
        "personacore",
        "runtime",
        "runtimedefault",
        "secret",
        "shell",
        "tool",
    }
)
SECRET_RE = re.compile(
    r"(?i)(token\s*[=:]|api[_-]?key\s*[=:]|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+|ghp_[a-z0-9]+)"
)
PUBLIC_CREDENTIAL_RE = re.compile(
    r"(?i)(github_pat_[a-z0-9_]+|\b(?:akia|asia)[a-z0-9]{16}\b)"
)
CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
PUBLIC_TEXT_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
CODE_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")
WINDOWS_PATH_RE = re.compile(r"(?i)[a-z]:(?:\\+|/+)[^\s]+")
UNC_PATH_RE = re.compile(r"\\\\[^\\\s]+(?:\\+)[^\s]+")
POSIX_PATH_RE = re.compile(r"(^|\s)/(?!/)[^\s]+", re.IGNORECASE)


class ImprovementCandidateError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    level: RiskLevel
    reason_codes: tuple[str, ...]
    requires_owner_approval: bool = True

    def public(self) -> JsonObject:
        return {
            "level": self.level,
            "reason_codes": list(self.reason_codes),
            "requires_owner_approval": self.requires_owner_approval,
        }


@dataclass(frozen=True, slots=True)
class CandidateProposal:
    closure_artifact_id: str
    kind: CandidateKind
    target_ref: str
    summary: str
    change_summary: tuple[str, ...]
    impact_areas: tuple[str, ...]
    actor: str = "supervisor"

    def __post_init__(self) -> None:
        if not isinstance(self.kind, str) or self.kind not in ALLOWED_KINDS:
            raise ImprovementCandidateError("candidate kind is unsupported")
        if not isinstance(self.change_summary, tuple):
            raise ImprovementCandidateError("change summary must be a tuple")
        if not isinstance(self.impact_areas, tuple):
            raise ImprovementCandidateError("impact areas must be a tuple")
        _validate_text(self.closure_artifact_id, "closure artifact id")
        _validate_text(self.target_ref, "target ref")
        _validate_text(self.summary, "summary")
        _validate_text(self.actor, "actor")
        if len(self.summary) > 500:
            raise ImprovementCandidateError("summary must be 500 characters or fewer")
        if len(self.target_ref) > 200:
            raise ImprovementCandidateError("target ref must be 200 characters or fewer")
        if len(self.actor) > 128:
            raise ImprovementCandidateError("actor must be 128 characters or fewer")
        if len(self.change_summary) > 20:
            raise ImprovementCandidateError("change summary is limited to 20 items")
        if len(self.impact_areas) > 20:
            raise ImprovementCandidateError("impact areas are limited to 20 items")
        for item in self.change_summary:
            _validate_text(item, "change summary")
            if len(item) > 300:
                raise ImprovementCandidateError("change summary item must be 300 characters or fewer")
        for item in self.impact_areas:
            _validate_text(item, "impact area")
            if len(item) > 80:
                raise ImprovementCandidateError("impact area must be 80 characters or fewer")
        if not self.change_summary:
            raise ImprovementCandidateError("change summary is required")
        if not self.impact_areas:
            raise ImprovementCandidateError("impact area is required")

    def candidate_key(self) -> str:
        return sha256(_canonical_json([self.closure_artifact_id, self.kind, self.target_ref]).encode("utf-8")).hexdigest()[:16]

    def proposal_sha256(self) -> str:
        payload = {
            "change_summary": list(self.change_summary),
            "closure_artifact_id": self.closure_artifact_id,
            "impact_areas": list(self.impact_areas),
            "kind": self.kind,
            "summary": self.summary,
            "target_ref": self.target_ref,
        }
        return sha256(_canonical_json(payload).encode("utf-8")).hexdigest()

    def risk(self) -> RiskAssessment:
        reasons: list[str] = []
        level: RiskLevel = "low"
        match self.kind:
            case "agent_topology_revision":
                level = "high"
                reasons.append("kind:agent_topology_revision")
            case "workflow_revision":
                level = "medium"
                reasons.append("kind:workflow_revision")
            case "skill_patch":
                reasons.append("kind:skill_patch")
        protected = _protected_markers((*self.impact_areas, *self.change_summary, self.summary, self.target_ref))
        if protected:
            level = "high"
            reasons.append("protected_impact:" + ",".join(protected))
        return RiskAssessment(level=level, reason_codes=tuple(reasons))


def validate_public_token(value: str, label: str) -> None:
    _validate_text(value, label)


def validate_bounded_token(value: str, label: str, max_len: int) -> None:
    _validate_text(value, label)
    if len(value) > max_len:
        raise ImprovementCandidateError(f"{label} must be {max_len} characters or fewer")


def validate_bounded_public_token(value: str, label: str, max_len: int) -> None:
    validate_bounded_token(value, label, max_len)
    if CONTROL_CHAR_RE.search(value):
        raise ImprovementCandidateError(f"{label} cannot contain control characters")
    if PUBLIC_CREDENTIAL_RE.search(value):
        raise ImprovementCandidateError(f"{label} cannot contain credential-shaped content")


def validate_bounded_public_text(value: str, label: str, max_len: int) -> None:
    validate_bounded_token(value, label, max_len)
    if PUBLIC_TEXT_CONTROL_CHAR_RE.search(value):
        raise ImprovementCandidateError(f"{label} cannot contain control characters")
    if PUBLIC_CREDENTIAL_RE.search(value):
        raise ImprovementCandidateError(f"{label} cannot contain credential-shaped content")


def validate_reason_code(value: str) -> None:
    validate_bounded_token(value, "reason code", 80)
    if not CODE_RE.fullmatch(value):
        raise ImprovementCandidateError("reason code must be code-shaped")


def validate_decision(value: str) -> Decision:
    match value:
        case "approved":
            return "approved"
        case "rejected":
            return "rejected"
        case _:
            raise ImprovementCandidateError("decision must be approved or rejected")


def _validate_text(value: str, label: str) -> None:
    if not isinstance(value, str):
        raise ImprovementCandidateError(f"{label} must be text")
    text = value.strip()
    if not text:
        raise ImprovementCandidateError(f"{label} is required")
    lowered = text.casefold()
    compact = "".join(char for char in lowered if char.isalnum())
    if any(marker in lowered for marker in PRIVATE_MARKERS) or any(marker in compact for marker in PRIVATE_MARKER_KEYS):
        raise ImprovementCandidateError(f"{label} cannot contain private raw content")
    if SECRET_RE.search(text):
        raise ImprovementCandidateError(f"{label} cannot contain secret-shaped content")
    if WINDOWS_PATH_RE.search(text) or UNC_PATH_RE.search(text) or POSIX_PATH_RE.search(text):
        raise ImprovementCandidateError(f"{label} cannot contain private paths")
    if ".." in text.replace("\\", "/").split("/"):
        raise ImprovementCandidateError(f"{label} cannot contain path traversal")


def _protected_markers(values: tuple[str, ...]) -> tuple[str, ...]:
    found: list[str] = []
    for value in values:
        compact = "".join(char for char in value.casefold() if char.isalnum())
        for marker in PROTECTED_MARKERS:
            if marker in compact and marker not in found:
                found.append(marker)
    return tuple(sorted(found))


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
