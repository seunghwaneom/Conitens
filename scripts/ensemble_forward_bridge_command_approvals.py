#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_approval import APPROVAL_STATUSES, ApprovalInterruptAdapter
from ensemble_forward_bridge_command_support import CommandBadRequest, JsonPayload, validate_api_identifier
from ensemble_forward_bridge_public_projection import public_approval_record
from ensemble_loop_repository import LoopStateRepository
from ensemble_orchestration import LocalOrchestrationRuntime


def decide_approval(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, request_id: str
) -> JsonPayload:
    status = str(payload.get("status") or "").strip()
    if status not in APPROVAL_STATUSES - {"pending"}:
        raise CommandBadRequest(f"Unsupported approval status: {status}")
    edited = payload.get("edited_payload")
    decided = ApprovalInterruptAdapter(workspace).decide(
        request_id=validate_api_identifier(request_id, field_name="request_id"),
        status=status,
        reviewer=reviewer_identity,
        reviewer_note=str(payload.get("reviewer_note") or "").strip(),
        edited_payload=edited if isinstance(edited, dict) else None,
    )
    return {"approval": public_approval_record(decided)}


def resume_approval(
    *, payload: JsonPayload, workspace: str | Path, reviewer_identity: str, request_id: str
) -> JsonPayload:
    _ = payload, reviewer_identity
    safe_id = validate_api_identifier(request_id, field_name="request_id")
    request = build_approval_detail(workspace, safe_id)["approval"]
    runtime = LocalOrchestrationRuntime(workspace)
    state = runtime.resume(str(request["run_id"]), "build")
    if state is None or state.pending_approval_request_id != safe_id:
        raise CommandBadRequest("Approval request is not the active pending approval for this run")
    resumed = runtime.resume_after_approval(str(request["run_id"]), graph_kind="build")
    return {"approval": request, "state": _public_state(resumed)}


def build_approval_detail(workspace: str | Path, request_id: str) -> JsonPayload:
    approval = LoopStateRepository(workspace).get_approval_request(request_id)
    if approval is None:
        raise FileNotFoundError(f"Approval request not found: {request_id}")
    return {"approval": public_approval_record(approval)}


def _public_state(state: Any) -> JsonPayload:
    return {
        "run_id": state.run_id,
        "current_step": state.current_step,
        "stop_reason": state.stop_reason,
        "approval_pending": state.approval_pending,
    }
