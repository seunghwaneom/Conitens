#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

JsonScalar = str | int | float | bool | None
JsonValue = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject = dict[str, JsonValue]
JSON_SCALAR_TYPES = (str, int, float, bool, type(None))

ClosureStatus = Literal["closed", "blocked", "needs_review"]
RiskLevel = Literal["low", "medium", "high"]
ConfidenceLevel = Literal["low", "medium", "high"]

ARTIFACT_KIND = "episode_closure_bundle"
ARTIFACT_ROOT_LABEL = ".notes/artifacts/agent-improvement"


class EpisodeClosureError(RuntimeError):
    pass


class EpisodeNotFoundError(EpisodeClosureError):
    pass


@dataclass(frozen=True, slots=True)
class ClosureRequest:
    episode_id: str
    actor: str = "supervisor"
    summary: str | None = None
    goal: str | None = None
    outcome: str = "completed"
    goal_satisfied: bool = True
    confidence: ConfidenceLevel = "medium"
    risk: RiskLevel = "low"
    risks_remaining: tuple[str, ...] = ()
    blocking_reasons: tuple[str, ...] = ()
    review_reasons: tuple[str, ...] = ()
    next_recommendation: str | None = None
    next_reason: str | None = None


@dataclass(frozen=True, slots=True)
class ClosureResult:
    artifact_id: str
    episode_id: str
    status: ClosureStatus
    risk: RiskLevel
    summary: str
    evidence_path: str
    digest_path: str
    projection_path: str
    event_id: str
    bundle: JsonObject
