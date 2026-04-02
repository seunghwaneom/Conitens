#!/usr/bin/env python3
"""
Path helpers for Batch 1/2 loop runtime artifacts.
"""

from __future__ import annotations

from pathlib import Path


CONITENS_DIRNAME = ".conitens"
CONTEXT_DIRNAME = "context"
RUNTIME_DIRNAME = "runtime"

LOOP_DB_FILENAME = "loop_state.sqlite3"
LOOP_DEBUG_FILENAME = "loop_state.json"

TASK_PLAN_FILENAME = "task_plan.md"
FINDINGS_FILENAME = "findings.md"
PROGRESS_FILENAME = "progress.md"
LATEST_CONTEXT_FILENAME = "LATEST_CONTEXT.md"
MEMORY_RECORD_SCHEMA_FILENAME = "memory_record.schema.json"
PACKET_SNAPSHOTS_DIRNAME = "packet_snapshots"


def conitens_root(workspace: str | Path) -> Path:
    return Path(workspace) / CONITENS_DIRNAME


def context_root(workspace: str | Path) -> Path:
    return conitens_root(workspace) / CONTEXT_DIRNAME


def runtime_root(workspace: str | Path) -> Path:
    return conitens_root(workspace) / RUNTIME_DIRNAME


def personas_root(workspace: str | Path) -> Path:
    return conitens_root(workspace) / "personas"


def ensure_context_root(workspace: str | Path) -> Path:
    path = context_root(workspace)
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_runtime_root(workspace: str | Path) -> Path:
    path = runtime_root(workspace)
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_personas_root(workspace: str | Path) -> Path:
    path = personas_root(workspace)
    path.mkdir(parents=True, exist_ok=True)
    return path


def loop_state_db_path(workspace: str | Path) -> Path:
    return ensure_runtime_root(workspace) / LOOP_DB_FILENAME


def loop_state_debug_path(workspace: str | Path) -> Path:
    return ensure_runtime_root(workspace) / LOOP_DEBUG_FILENAME


def task_plan_path(workspace: str | Path) -> Path:
    return ensure_context_root(workspace) / TASK_PLAN_FILENAME


def findings_path(workspace: str | Path) -> Path:
    return ensure_context_root(workspace) / FINDINGS_FILENAME


def progress_path(workspace: str | Path) -> Path:
    return ensure_context_root(workspace) / PROGRESS_FILENAME


def latest_context_path(workspace: str | Path) -> Path:
    return ensure_context_root(workspace) / LATEST_CONTEXT_FILENAME


def candidate_patches_root(workspace: str | Path) -> Path:
    path = ensure_personas_root(workspace) / "candidate_patches"
    path.mkdir(parents=True, exist_ok=True)
    return path


def memory_record_schema_path(workspace: str | Path) -> Path:
    return ensure_personas_root(workspace) / MEMORY_RECORD_SCHEMA_FILENAME


def packet_snapshots_root(workspace: str | Path) -> Path:
    path = ensure_runtime_root(workspace) / PACKET_SNAPSHOTS_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


__all__ = [
    "FINDINGS_FILENAME",
    "LATEST_CONTEXT_FILENAME",
    "LOOP_DB_FILENAME",
    "LOOP_DEBUG_FILENAME",
    "PROGRESS_FILENAME",
    "TASK_PLAN_FILENAME",
    "conitens_root",
    "context_root",
    "ensure_context_root",
    "ensure_runtime_root",
    "findings_path",
    "latest_context_path",
    "candidate_patches_root",
    "loop_state_db_path",
    "loop_state_debug_path",
    "memory_record_schema_path",
    "packet_snapshots_root",
    "personas_root",
    "progress_path",
    "runtime_root",
    "ensure_personas_root",
    "task_plan_path",
]
