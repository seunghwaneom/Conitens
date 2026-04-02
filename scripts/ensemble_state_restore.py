#!/usr/bin/env python3
"""
Restore helpers for the latest active SQLite-backed loop state.
"""

from __future__ import annotations

from ensemble_loop_repository import LoopStateRepository


class StateRestoreService:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def restore_latest_active_run(self) -> dict[str, object] | None:
        run = self.repository.get_latest_active_run()
        if run is None:
            return None
        return self.repository.load_run_snapshot(run["run_id"])

    def restore_run(self, run_id: str) -> dict[str, object]:
        return self.repository.load_run_snapshot(run_id)

    def restore_latest_active_run_from_disk(self) -> dict[str, object] | None:
        return self.restore_latest_active_run()

    def restore_run_from_disk(self, run_id: str) -> dict[str, object]:
        return self.restore_run(run_id)


__all__ = ["StateRestoreService"]
