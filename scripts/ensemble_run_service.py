#!/usr/bin/env python3
"""
Run lifecycle helpers for SQLite-backed loop state.
"""

from __future__ import annotations

import uuid
from typing import Any

from ensemble_loop_repository import LoopStateRepository


TERMINAL_STOP_REASONS = {"verified", "max_iterations", "max_tokens", "max_cost", "stuck", "escalated", "aborted"}


class RunService:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def create_run(self, user_request: str, *, status: str = "active", run_id: str | None = None) -> dict[str, Any]:
        target_run_id = run_id or f"run-{uuid.uuid4().hex[:16]}"
        return self.repository.create_run(
            run_id=target_run_id,
            user_request=user_request,
            status=status,
        )

    def get_run(self, run_id: str) -> dict[str, Any]:
        return self.repository.get_run(run_id)

    def list_runs(self) -> list[dict[str, Any]]:
        return self.repository.list_runs()

    def persist_stop_reason(
        self,
        run_id: str,
        stop_reason: str,
        *,
        iteration_id: str | None = None,
        value: Any | None = None,
        final_status: str | None = None,
    ) -> dict[str, Any]:
        self.repository.record_stop_condition(
            run_id=run_id,
            iteration_id=iteration_id,
            kind=stop_reason,
            value=value or {"stop_reason": stop_reason},
        )
        next_status = final_status or ("stopped" if stop_reason in TERMINAL_STOP_REASONS else "active")
        return self.repository.update_run(
            run_id=run_id,
            status=next_status,
            stop_reason=stop_reason,
        )


__all__ = ["RunService"]
