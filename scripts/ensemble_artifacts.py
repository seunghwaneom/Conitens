#!/usr/bin/env python3
"""
Artifact manifest helpers for Conitens extension layers.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_paths import candidate_notes_dirs, ensure_notes_dir

ARTIFACT_SCHEMA_V = 1


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def get_artifacts_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "artifacts")


def get_artifact_manifest_file(workspace: str | Path) -> Path:
    return get_artifacts_dir(workspace) / "manifest.jsonl"


def legacy_artifact_manifest_file(workspace: str | Path) -> Path:
    legacy_dir = candidate_notes_dirs(workspace, "artifacts", include_missing=True)[-1]
    return legacy_dir / "manifest.jsonl"


def next_artifact_id() -> str:
    return f"A-{uuid.uuid4().hex[:10]}"


def append_artifact_manifest(
    workspace: str | Path,
    *,
    artifact_type: str,
    path: str,
    actor: str = "CLI",
    run_id: str | None = None,
    task_id: str | None = None,
    correlation_id: str | None = None,
    subject_ref: str | None = None,
    producer: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = {
        "artifact_v": ARTIFACT_SCHEMA_V,
        "artifact_id": next_artifact_id(),
        "ts_utc": utc_iso(),
        "artifact_type": artifact_type,
        "path": path,
        "producer": producer or actor,
        "actor": actor,
        "run_id": run_id,
        "task_id": task_id,
        "correlation_id": correlation_id or run_id,
        "subject_ref": subject_ref or task_id or run_id,
        "metadata": metadata or {},
    }
    manifest_file = get_artifact_manifest_file(workspace)
    with manifest_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    legacy_file = legacy_artifact_manifest_file(workspace)
    if legacy_file != manifest_file:
        legacy_file.parent.mkdir(parents=True, exist_ok=True)
        with legacy_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def load_artifact_manifest(workspace: str | Path, limit: int | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for directory in candidate_notes_dirs(workspace, "artifacts"):
        manifest_file = directory / "manifest.jsonl"
        if not manifest_file.exists():
            continue
        with manifest_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                artifact_id = str(row.get("artifact_id") or "")
                if artifact_id and artifact_id in seen_ids:
                    continue
                if artifact_id:
                    seen_ids.add(artifact_id)
                rows.append(row)

    if limit is not None:
        return rows[-limit:]
    return rows


__all__ = [
    "append_artifact_manifest",
    "get_artifact_manifest_file",
    "get_artifacts_dir",
    "load_artifact_manifest",
]
