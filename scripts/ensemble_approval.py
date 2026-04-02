#!/usr/bin/env python3
"""
Batch 10 approval policy, queue persistence, and pause/resume adapter.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_context_markdown import FindingsAppendService, ProgressAppendOnlyService
from ensemble_contracts import parse_simple_yaml
from ensemble_events import append_event
from ensemble_loop_repository import LoopStateRepository


APPROVAL_STATUSES = {"pending", "approved", "edited", "rejected"}
RISKY_ACTION_CATEGORIES = {
    "write_file",
    "delete_file",
    "shell_execution",
    "network_access",
    "secret_usage",
    "deploy_publish",
}


def utc_iso(ts: datetime | None = None) -> str:
    current = ts or datetime.now(timezone.utc)
    return current.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def approval_policy_path(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent" / "policies" / "approval_actions.yaml"


def load_approval_policy(workspace: str | Path) -> dict[str, Any]:
    path = approval_policy_path(workspace)
    if not path.exists():
        return {"schema_v": 1, "default_policy": "review", "actions": []}
    return parse_simple_yaml(path.read_text(encoding="utf-8"))


class ApprovalInterruptAdapter:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.findings = FindingsAppendService(self.repository)
        self.progress = ProgressAppendOnlyService(self.repository)

    def classify(self, action_type: str, action_payload: dict[str, Any]) -> dict[str, Any]:
        policy = load_approval_policy(self.workspace)
        default_policy = str(policy.get("default_policy", "review")).strip().lower()
        default_requires_approval = default_policy in {"require", "review", "deny"}
        for item in policy.get("actions", []):
            if item.get("action_type") == action_type:
                return {
                    "action_type": action_type,
                    "risk_level": item.get("risk_level", "medium"),
                    "requires_approval": bool(item.get("approval_required", True)),
                    "notes": item.get("notes"),
                    "action_payload": action_payload,
                }
        return {
            "action_type": action_type,
            "risk_level": "low",
            "requires_approval": default_requires_approval or action_type in RISKY_ACTION_CATEGORIES,
            "notes": None,
            "action_payload": action_payload,
        }

    def enqueue_request(
        self,
        *,
        run_id: str,
        iteration_id: str,
        actor: str,
        action_type: str,
        action_payload: dict[str, Any],
    ) -> dict[str, Any]:
        classification = self.classify(action_type, action_payload)
        request = self.repository.append_approval_request(
            request_id=f"approval-{uuid.uuid4().hex}",
            run_id=run_id,
            iteration_id=iteration_id,
            actor=actor,
            action_type=action_type,
            action_payload=classification["action_payload"],
            risk_level=classification["risk_level"],
            status="pending",
            reviewer=None,
            reviewer_note=classification.get("notes"),
            created_at=utc_iso(),
            updated_at=utc_iso(),
        )
        append_event(
            self.workspace,
            event_type="APPROVAL_REQUESTED",
            actor={"type": "agent", "name": actor},
            scope={"run_id": run_id, "task_id": run_id, "correlation_id": run_id},
            payload={"request_id": request["request_id"], "action_type": action_type, "risk_level": request["risk_level"]},
        )
        self.progress.regenerate(run_id)
        self.progress.append_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="approval",
            summary=f"Approval required for {action_type}",
        )
        return request

    def decide(
        self,
        *,
        request_id: str,
        status: str,
        reviewer: str,
        reviewer_note: str,
        edited_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if status not in APPROVAL_STATUSES - {"pending"}:
            raise ValueError(f"Unsupported approval status: {status}")
        current = self.repository.get_approval_request(request_id)
        if current is None:
            raise ValueError(f"Approval request not found: {request_id}")
        if current["status"] != "pending":
            raise ValueError(f"Approval request already decided: {request_id}")
        request = self.repository.update_approval_request(
            request_id=request_id,
            status=status,
            reviewer=reviewer,
            reviewer_note=reviewer_note,
            action_payload=edited_payload,
            updated_at=utc_iso(),
        )
        event_type = {
            "approved": "APPROVAL_APPROVED",
            "edited": "APPROVAL_EDITED",
            "rejected": "APPROVAL_REJECTED",
        }[status]
        append_event(
            self.workspace,
            event_type=event_type,
            actor={"type": "agent", "name": reviewer},
            scope={"run_id": request["run_id"], "task_id": request["run_id"], "correlation_id": request["run_id"]},
            payload={"request_id": request_id, "reviewer_note": reviewer_note},
            severity="error" if status == "rejected" else "info",
        )
        return request

    def latest_request(
        self,
        *,
        run_id: str,
        iteration_id: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        rows = self.repository.list_approval_requests(run_id=run_id, iteration_id=iteration_id, status=status)
        return rows[0] if rows else None

    def reinject_rejection_feedback(self, request: dict[str, Any]) -> None:
        summary = f"Approval rejected: {request.get('reviewer_note') or request['action_type']}"
        issues = [
            {
                "message": summary,
                "action_type": request["action_type"],
                "request_id": request["request_id"],
            }
        ]
        self.repository.record_validator_result(
            run_id=request["run_id"],
            iteration_id=request["iteration_id"],
            passed=False,
            issues=issues,
            feedback_text=summary,
        )
        self.findings.append_entry(
            run_id=request["run_id"],
            iteration_id=request["iteration_id"],
            category="validation_issue",
            actor=request.get("reviewer") or "reviewer",
            summary=summary,
            details=f"action_type={request['action_type']}",
        )
        self.progress.regenerate(request["run_id"])
        self.progress.append_entry(
            run_id=request["run_id"],
            iteration_id=request["iteration_id"],
            actor="approval",
            summary=summary,
        )


__all__ = [
    "APPROVAL_STATUSES",
    "ApprovalInterruptAdapter",
    "RISKY_ACTION_CATEGORIES",
    "approval_policy_path",
    "load_approval_policy",
]
