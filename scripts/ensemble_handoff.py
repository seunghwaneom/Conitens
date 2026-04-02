#!/usr/bin/env python3
"""
Typed handoff artifacts for Conitens workflow and subagent tracking.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_loop_repository import LoopStateRepository
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir


HANDOFF_SCHEMA_V = 1
HANDOFF_STATES = {"requested", "started", "blocked", "completed", "rejected"}


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def get_handoffs_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "handoffs")


def legacy_handoffs_dir(workspace: str | Path) -> Path:
    return candidate_notes_dirs(workspace, "handoffs", include_missing=True)[-1]


def next_handoff_id(workspace: str | Path) -> str:
    date_token = datetime.now().strftime("%Y%m%d")
    prefix = f"H-{date_token}-"
    max_num = 0
    for path in get_handoffs_dir(workspace).glob(f"{prefix}*.json"):
        try:
            max_num = max(max_num, int(path.stem.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefix}{max_num + 1:03d}"


def handoff_path(workspace: str | Path, handoff_id: str) -> Path:
    return get_handoffs_dir(workspace) / f"{handoff_id}.json"


def legacy_handoff_path(workspace: str | Path, handoff_id: str) -> Path:
    path = legacy_handoffs_dir(workspace)
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{handoff_id}.json"


def read_handoff(workspace: str | Path, handoff_id: str) -> dict[str, Any]:
    for directory in candidate_notes_dirs(workspace, "handoffs"):
        path = directory / f"{handoff_id}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(handoff_path(workspace, handoff_id).read_text(encoding="utf-8"))


def _write_handoff(path: Path, record: dict[str, Any]) -> None:
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")


def create_handoff(
    workspace: str | Path,
    *,
    from_actor: str,
    to_actor: str,
    summary: str,
    run_id: str | None = None,
    task_id: str | None = None,
    correlation_id: str | None = None,
    artifact_type: str = "subagent",
    files: list[str] | None = None,
    owner_transfer: bool = False,
    worktree_id: str | None = None,
    lease_paths: list[str] | None = None,
    iteration_id: str | None = None,
) -> dict[str, Any]:
    handoff_id = next_handoff_id(workspace)
    ts = utc_iso()
    record = {
        "handoff_v": HANDOFF_SCHEMA_V,
        "handoff_id": handoff_id,
        "status": "requested",
        "artifact_type": artifact_type,
        "summary": summary,
        "from": from_actor,
        "to": to_actor,
        "run_id": run_id,
        "iteration_id": iteration_id,
        "task_id": task_id,
        "correlation_id": correlation_id or run_id,
        "files": files or [],
        "owner_transfer": owner_transfer,
        "worktree_id": worktree_id,
        "lease_paths": lease_paths or [],
        "blocked_reason": None,
        "created_at": ts,
        "updated_at": ts,
        "history": [
            {
                "state": "requested",
                "ts_utc": ts,
                "actor": from_actor,
                "detail": summary,
            }
        ],
    }
    path = handoff_path(workspace, handoff_id)
    _write_handoff(path, record)
    legacy_path = legacy_handoff_path(workspace, handoff_id)
    if legacy_path != path:
        _write_handoff(legacy_path, record)
    LoopStateRepository(workspace).upsert_handoff_packet(
        handoff_id=handoff_id,
        run_id=run_id,
        iteration_id=iteration_id,
        from_actor=from_actor,
        to_actor=to_actor,
        status="requested",
        summary=summary,
        packet=record,
        created_at=ts,
        updated_at=ts,
    )
    append_event(
        workspace,
        event_type="HANDOFF_REQUESTED",
        actor={"type": "agent", "name": from_actor},
        scope={
            "handoff_id": handoff_id,
            "run_id": run_id,
            "task_id": task_id,
            "correlation_id": correlation_id or run_id,
        },
        payload={"to": to_actor, "summary": summary, "artifact_type": artifact_type},
    )
    append_artifact_manifest(
        workspace,
        artifact_type="handoff",
        path=str(path),
        actor=from_actor,
        run_id=run_id,
        task_id=task_id,
        correlation_id=correlation_id or run_id,
        subject_ref=task_id or run_id,
        metadata={
            "handoff_id": handoff_id,
            "status": "requested",
            "to": to_actor,
            "owner_transfer": owner_transfer,
            "worktree_id": worktree_id,
            "lease_paths": lease_paths or [],
        },
    )
    return record


def transition_handoff(
    workspace: str | Path,
    *,
    handoff_id: str,
    state: str,
    actor: str,
    detail: str | None = None,
    result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if state not in HANDOFF_STATES:
        raise ValueError(f"Unsupported handoff state: {state}")
    record = read_handoff(workspace, handoff_id)
    ts = utc_iso()
    record["status"] = state
    record["updated_at"] = ts
    history = record.setdefault("history", [])
    history.append(
        {
            "state": state,
            "ts_utc": ts,
            "actor": actor,
            "detail": detail,
            "result": result or {},
        }
    )
    if result:
        record["latest_result"] = result
    if state in {"blocked", "rejected"}:
        record["blocked_reason"] = detail or record.get("blocked_reason")
    path = handoff_path(workspace, handoff_id)
    _write_handoff(path, record)
    legacy_path = legacy_handoff_path(workspace, handoff_id)
    if legacy_path != path:
        _write_handoff(legacy_path, record)
    LoopStateRepository(workspace).upsert_handoff_packet(
        handoff_id=handoff_id,
        run_id=record.get("run_id"),
        iteration_id=record.get("iteration_id"),
        from_actor=record.get("from") or "",
        to_actor=record.get("to") or "",
        status=state,
        summary=record.get("summary") or "",
        packet=record,
        created_at=record.get("created_at"),
        updated_at=ts,
    )
    append_event(
        workspace,
        event_type=f"HANDOFF_{state.upper()}",
        actor={"type": "agent", "name": actor},
        scope={
            "handoff_id": handoff_id,
            "run_id": record.get("run_id"),
            "task_id": record.get("task_id"),
            "correlation_id": record.get("correlation_id"),
        },
        payload={"detail": detail, "to": record.get("to"), "result": result or {}},
        severity="error" if state in {"blocked", "rejected"} else "info",
    )
    append_artifact_manifest(
        workspace,
        artifact_type="handoff",
        path=str(path),
        actor=actor,
        run_id=record.get("run_id"),
        task_id=record.get("task_id"),
        correlation_id=record.get("correlation_id"),
        subject_ref=record.get("task_id") or record.get("run_id"),
        metadata={
            "handoff_id": handoff_id,
            "status": state,
            "to": record.get("to"),
            "owner_transfer": record.get("owner_transfer"),
            "worktree_id": record.get("worktree_id"),
            "lease_paths": record.get("lease_paths", []),
            "blocked_reason": record.get("blocked_reason"),
        },
    )
    return record


def list_handoffs(workspace: str | Path, limit: int | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for directory in candidate_notes_dirs(workspace, "handoffs"):
        for path in sorted(directory.glob("H-*.json")):
            try:
                row = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            handoff_id = str(row.get("handoff_id") or path.stem)
            if handoff_id in seen_ids:
                continue
            seen_ids.add(handoff_id)
            rows.append(row)
    rows.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    if limit is not None:
        return rows[:limit]
    return rows


__all__ = [
    "create_handoff",
    "handoff_path",
    "list_handoffs",
    "read_handoff",
    "transition_handoff",
]
