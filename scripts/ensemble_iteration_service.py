#!/usr/bin/env python3
"""
Iteration lifecycle helpers for SQLite-backed loop state.
"""

from __future__ import annotations

from typing import Any

from ensemble_loop_repository import LoopStateRepository, utc_iso


class IterationService:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def append_iteration(
        self,
        run_id: str,
        objective: str,
        *,
        status: str = "active",
        summary: str | None = None,
    ) -> dict[str, Any]:
        current = self.repository.list_iterations(run_id)
        seq_no = len(current) + 1
        iteration_id = f"{run_id}-iter-{seq_no:04d}"
        return self.repository.create_iteration(
            iteration_id=iteration_id,
            run_id=run_id,
            seq_no=seq_no,
            started_at=utc_iso(),
            status=status,
            objective=objective,
            summary=summary,
        )

    def mark_iteration_complete(self, iteration_id: str, *, summary: str | None = None) -> dict[str, Any]:
        return self.repository.update_iteration(
            iteration_id=iteration_id,
            status="completed",
            ended_at=utc_iso(),
            summary=summary,
        )

    def mark_iteration_incomplete(self, iteration_id: str, *, summary: str | None = None) -> dict[str, Any]:
        return self.repository.update_iteration(
            iteration_id=iteration_id,
            status="incomplete",
            ended_at=utc_iso(),
            summary=summary,
        )

    def get_iteration(self, iteration_id: str) -> dict[str, Any]:
        return self.repository.get_iteration(iteration_id)

    def list_iterations(self, run_id: str) -> list[dict[str, Any]]:
        return self.repository.list_iterations(run_id)

    def record_validator_result(
        self,
        run_id: str,
        iteration_id: str,
        *,
        passed: bool,
        issues: list[dict[str, Any]] | list[str] | None = None,
        feedback_text: str = "",
    ) -> dict[str, Any]:
        return self.repository.record_validator_result(
            run_id=run_id,
            iteration_id=iteration_id,
            passed=passed,
            issues=issues or [],
            feedback_text=feedback_text,
        )


__all__ = ["IterationService"]
