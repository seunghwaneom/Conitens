from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_operator_reconciler import reconcile_operator_task


class OperatorReconcilerTests(unittest.TestCase):
    def test_pending_approval_validator_and_handoff_block_task(self) -> None:
        now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
        task = {
            "task_id": "otask-1",
            "status": "todo",
            "linked_run_id": "run-1",
        }
        linked_run = {
            "run_id": "run-1",
            "status": "active",
            "updated_at": (now - timedelta(minutes=20)).isoformat().replace("+00:00", "Z"),
        }
        approvals = [
            {"request_id": "approval-task", "task_id": "otask-1", "run_id": "run-1", "status": "pending"},
            {"request_id": "approval-run", "task_id": None, "run_id": "run-1", "status": "pending"},
        ]
        validator_history = [{"id": 7, "passed": False, "feedback_text": "validator failed"}]
        handoffs = [{"handoff_id": "handoff-1", "status": "blocked"}]

        result = reconcile_operator_task(
            task,
            linked_run=linked_run,
            approvals=approvals,
            validator_history=validator_history,
            handoffs=handoffs,
            now=now,
        )
        repeated = reconcile_operator_task(
            task,
            linked_run=linked_run,
            approvals=approvals,
            validator_history=validator_history,
            handoffs=handoffs,
            now=now + timedelta(minutes=1),
        )

        self.assertEqual(result["recommended_status"], "blocked")
        self.assertEqual(result["confidence"], "high")
        self.assertTrue(result["requires_approval"])
        self.assertIn("task has pending approval requests", result["blockers"])
        self.assertIn("linked run run-1 has pending approvals", result["blockers"])
        self.assertIn("validator failed", result["blockers"])
        self.assertIn("1 linked handoff packet(s) are blocked", result["blockers"])
        self.assertIn("approval:approval-task", result["evidence_refs"])
        self.assertIn("approval:approval-run", result["evidence_refs"])
        self.assertIn("validator:run-1:7", result["evidence_refs"])
        self.assertIn("handoff:handoff-1", result["evidence_refs"])
        self.assertTrue(str(result["decision_id"]).startswith("reconcile-"))
        self.assertEqual(result["decision_id"], repeated["decision_id"])

    def test_archived_task_stays_read_only(self) -> None:
        result = reconcile_operator_task(
            {
                "task_id": "otask-archived",
                "status": "blocked",
                "archived_at": "2026-06-07T00:00:00Z",
            },
            approvals=[{"request_id": "approval-ignored", "task_id": "otask-archived", "status": "pending"}],
            now=datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(result["recommended_status"], "blocked")
        self.assertEqual(result["confidence"], "high")
        self.assertFalse(result["requires_approval"])
        self.assertEqual(result["blockers"], ["task is archived"])
        self.assertEqual(result["evidence_refs"], ["operator_task:otask-archived"])

    def test_unlinked_task_has_low_confidence_link_run_suggestion(self) -> None:
        result = reconcile_operator_task(
            {"task_id": "otask-unlinked", "status": "todo"},
            now=datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(result["recommended_status"], "todo")
        self.assertEqual(result["confidence"], "low")
        self.assertFalse(result["requires_approval"])
        self.assertEqual(result["blockers"], [])
        self.assertEqual(result["suggested_actions"], ["link a run when this task moves into execution"])

    def test_stale_active_run_blocks_without_mutation(self) -> None:
        now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
        result = reconcile_operator_task(
            {"task_id": "otask-stale", "status": "in_progress", "linked_run_id": "run-stale"},
            linked_run={
                "run_id": "run-stale",
                "status": "active",
                "updated_at": (now - timedelta(hours=7)).isoformat().replace("+00:00", "Z"),
            },
            stale_age_hours=6,
            now=now,
        )

        self.assertEqual(result["recommended_status"], "blocked")
        self.assertTrue(any("linked run has not updated" in blocker for blocker in result["blockers"]))
        self.assertFalse(result["requires_approval"])


if __name__ == "__main__":
    unittest.main()
