#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path
from typing import Literal, TypedDict, assert_never

from ensemble_agent_registry import agent_apply_patch

Decision = Literal["approve", "reject"]
JsonValue = str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]

PATCH_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class RejectedPatchResult(TypedDict):
    patch_id: str
    status: Literal["rejected"]
    durable: Literal[False]
    compatibility: Literal["non_durable"]


class PatchDecisionError(ValueError):
    pass


class PatchIdentifierError(ValueError):
    pass


def decide_agent_patch(
    workspace: str | Path,
    patch_id: str,
    *,
    decision: Decision,
    reason: str | None = None,
    actor: str = "operator",
) -> dict[str, JsonValue] | RejectedPatchResult:
    safe_patch_id = _parse_patch_id(patch_id)
    if decision not in {"approve", "reject"}:
        raise PatchDecisionError("decision must be approve or reject")
    match decision:
        case "approve":
            return agent_apply_patch(
                safe_patch_id,
                workspace=workspace,
                actor=actor,
                reason=reason,
            )
        case "reject":
            return {
                "patch_id": safe_patch_id,
                "status": "rejected",
                "durable": False,
                "compatibility": "non_durable",
            }
        case unreachable:
            assert_never(unreachable)


def _parse_patch_id(patch_id: str) -> str:
    if not PATCH_ID_RE.fullmatch(patch_id) or ".." in patch_id:
        raise PatchIdentifierError("patch_id is malformed")
    return patch_id
