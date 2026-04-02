#!/usr/bin/env python3
"""
Human-friendly loop_state.json rebuild helper.
"""

from __future__ import annotations

import json
from pathlib import Path

from ensemble_loop_paths import loop_state_debug_path
from ensemble_loop_repository import LoopStateRepository, utc_iso


class LoopStateDebugWriter:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def build_snapshot(self) -> dict[str, object]:
        runs = [self.repository.load_run_snapshot(run["run_id"]) for run in self.repository.list_runs()]
        latest_active = self.repository.get_latest_active_run()
        return {
            "generated_at": utc_iso(),
            "schema_version": self.repository.schema_version(),
            "db_path": str(self.repository.db_path),
            "latest_active_run": latest_active["run_id"] if latest_active else None,
            "source_of_truth": self.repository.authoritative_state_owners(),
            "recovery_contract": {
                "source": "sqlite",
                "restore_service": "scripts/ensemble_state_restore.py",
                "debug_writer": "scripts/ensemble_loop_debug.py",
                "chat_history_authoritative": False,
            },
            "runs": runs,
        }

    def write(self) -> Path:
        path = loop_state_debug_path(self.repository.workspace)
        payload = self.build_snapshot()
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path


def rebuild_loop_state_json(repository: LoopStateRepository) -> dict[str, object]:
    writer = LoopStateDebugWriter(repository)
    path = writer.write()
    return {
        "path": str(path),
        "schema_version": writer.repository.schema_version(),
    }


__all__ = ["LoopStateDebugWriter", "rebuild_loop_state_json"]
