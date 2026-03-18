#!/usr/bin/env python3
"""
Approval-gate helpers shared by workflow and MCP extensions.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir


QUESTION_SCHEMA_V = 1
GATE_SCHEMA_V = 1


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def get_questions_file(workspace: str | Path) -> Path:
    path = Path(workspace) / ".notes" / "ACTIVE" / "_pending_questions.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_gates_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "gates")


def legacy_gates_dir(workspace: str | Path) -> Path:
    return candidate_notes_dirs(workspace, "gates", include_missing=True)[-1]


def gate_path(workspace: str | Path, gate_id: str) -> Path:
    return get_gates_dir(workspace) / f"{gate_id}.json"


def legacy_gate_path(workspace: str | Path, gate_id: str) -> Path:
    path = legacy_gates_dir(workspace)
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{gate_id}.json"


def next_gate_id() -> str:
    return f"G-{uuid.uuid4().hex[:10]}"


def write_gate_record(workspace: str | Path, record: dict[str, Any]) -> Path:
    path = gate_path(workspace, record["gate_id"])
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    legacy_path = legacy_gate_path(workspace, record["gate_id"])
    if legacy_path != path:
        legacy_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def read_gate_record(workspace: str | Path, gate_id: str) -> dict[str, Any] | None:
    for directory in candidate_notes_dirs(workspace, "gates"):
        path = directory / f"{gate_id}.json"
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None
    return None


def list_gate_records(workspace: str | Path, limit: int | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for directory in candidate_notes_dirs(workspace, "gates"):
        for path in sorted(directory.glob("G-*.json")):
            try:
                row = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            gate_id = str(row.get("gate_id") or path.stem)
            if gate_id in seen_ids:
                continue
            seen_ids.add(gate_id)
            rows.append(row)
    rows.sort(key=lambda item: item.get("updated_at") or item.get("created_at") or "", reverse=True)
    if limit is not None:
        return rows[:limit]
    return rows


def create_gate_record(
    workspace: str | Path,
    *,
    run_id: str,
    workflow_id: str,
    step_id: str,
    requested_by: str,
    action_class: str,
    question: str,
    task_id: str | None = None,
    correlation_id: str | None = None,
    subject_ref: str | None = None,
    resume_token: str | None = None,
) -> dict[str, Any]:
    ts = utc_iso()
    record = {
        "gate_v": GATE_SCHEMA_V,
        "gate_id": next_gate_id(),
        "run_id": run_id,
        "workflow_id": workflow_id,
        "step_id": step_id,
        "correlation_id": correlation_id or run_id,
        "action_class": action_class,
        "subject_ref": subject_ref or task_id or run_id,
        "requested_by": requested_by,
        "decision": None,
        "status": "pending",
        "evidence_refs": [],
        "resume_token": resume_token or f"resume:{run_id}:{step_id}",
        "prompt": question,
        "task_id": task_id,
        "created_at": ts,
        "updated_at": ts,
    }
    path = write_gate_record(workspace, record)
    append_artifact_manifest(
        workspace,
        artifact_type="gate_record",
        path=str(path),
        actor=requested_by,
        run_id=run_id,
        task_id=task_id,
        correlation_id=record["correlation_id"],
        subject_ref=record["subject_ref"],
        metadata={"gate_id": record["gate_id"], "status": record["status"], "action_class": action_class},
    )
    return record


def update_gate_record(
    workspace: str | Path,
    *,
    gate_id: str,
    status: str,
    decision: str | None = None,
    evidence_ref: str | None = None,
    actor: str | None = None,
) -> dict[str, Any]:
    record = read_gate_record(workspace, gate_id)
    if record is None:
        raise FileNotFoundError(f"Gate record not found: {gate_id}")
    record["status"] = status
    record["decision"] = decision or record.get("decision")
    record["updated_at"] = utc_iso()
    if evidence_ref:
        record.setdefault("evidence_refs", []).append(evidence_ref)
    path = write_gate_record(workspace, record)
    append_artifact_manifest(
        workspace,
        artifact_type="gate_record",
        path=str(path),
        actor=actor or "GATE",
        run_id=record.get("run_id"),
        task_id=record.get("task_id"),
        correlation_id=record.get("correlation_id"),
        subject_ref=record.get("subject_ref"),
        metadata={"gate_id": record["gate_id"], "status": record["status"], "decision": record.get("decision")},
    )
    return record


def read_questions(workspace: str | Path) -> dict[str, Any]:
    question_file = get_questions_file(workspace)
    if not question_file.exists():
        return {"questions": [], "last_updated": None}
    try:
        return json.loads(question_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"questions": [], "last_updated": None}


def write_questions(workspace: str | Path, data: dict[str, Any]) -> None:
    data["last_updated"] = utc_iso()
    get_questions_file(workspace).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def next_question_id(workspace: str | Path) -> str:
    data = read_questions(workspace)
    date_token = datetime.now().strftime("%Y%m%d")
    max_num = 0
    prefix = f"Q-{date_token}-"
    for question in data.get("questions", []):
        question_id = str(question.get("question_id", ""))
        if not question_id.startswith(prefix):
            continue
        try:
            max_num = max(max_num, int(question_id.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefix}{max_num + 1:03d}"


def default_choices(action_class: str) -> list[dict[str, Any]]:
    return [
        {
            "title": "Approve resume",
            "action": f"resume:{action_class}",
            "risk": "medium",
            "evidence": "owner confirmation required",
        },
        {
            "title": "Reject",
            "action": f"reject:{action_class}",
            "risk": "low",
            "evidence": "workflow remains paused",
        },
    ]


def create_workflow_approval(
    workspace: str | Path,
    *,
    run_id: str,
    workflow_id: str,
    step_id: str,
    actor: str,
    question: str,
    action_class: str = "workflow.approval",
    task_id: str | None = None,
    correlation_id: str | None = None,
    default_choice: int = 1,
    choices: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    data = read_questions(workspace)
    question_id = next_question_id(workspace)
    gate_record = create_gate_record(
        workspace,
        run_id=run_id,
        workflow_id=workflow_id,
        step_id=step_id,
        requested_by=actor,
        action_class=action_class,
        question=question,
        task_id=task_id,
        correlation_id=correlation_id or run_id,
    )
    question_record = {
        "question_v": QUESTION_SCHEMA_V,
        "question_id": question_id,
        "kind": "WORKFLOW_APPROVAL_CONFIRM",
        "prompt": question,
        "default_choice": default_choice,
        "choices": choices or default_choices(action_class),
        "context": {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "step_id": step_id,
            "task_id": task_id,
            "action_class": action_class,
            "correlation_id": correlation_id or run_id,
            "gate_id": gate_record["gate_id"],
        },
        "created_at": utc_iso(),
        "status": "auto_selected_waiting_confirm",
        "selected_choice": default_choice,
        "answered_at": None,
        "answered_by": None,
        "executed_at": None,
        "executed_by": None,
        "auto_selected": True,
    }
    data.setdefault("questions", []).append(question_record)
    write_questions(workspace, data)

    scope = {
        "workflow_id": workflow_id,
        "run_id": run_id,
        "step_id": step_id,
        "task_id": task_id,
        "question_id": question_id,
        "correlation_id": correlation_id or run_id,
    }
    append_event(
        workspace,
        event_type="QUESTION_CREATED",
        actor={"type": "agent", "name": actor},
        scope=scope,
        payload={"kind": question_record["kind"], "prompt": question, "action_class": action_class},
    )
    append_event(
        workspace,
        event_type="APPROVAL_REQUESTED",
        actor={"type": "agent", "name": actor},
        scope=scope,
        payload={"question_id": question_id, "selected_choice": default_choice},
    )
    append_event(
        workspace,
        event_type="AUTO_SELECTED",
        actor={"type": "agent", "name": actor},
        scope=scope,
        payload={"question_id": question_id, "selected_choice": default_choice},
    )
    return question_record


def get_question(workspace: str | Path, question_id: str) -> dict[str, Any] | None:
    data = read_questions(workspace)
    for question in data.get("questions", []):
        if question.get("question_id") == question_id:
            return question
    return None


def question_is_approved(workspace: str | Path, question_id: str) -> bool:
    question = get_question(workspace, question_id)
    if question is None:
        return False
    return question.get("status") == "executed"


__all__ = [
    "create_workflow_approval",
    "create_gate_record",
    "default_choices",
    "get_question",
    "list_gate_records",
    "question_is_approved",
    "read_gate_record",
    "read_questions",
    "update_gate_record",
]
