from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_forward_bridge_commands import CommandResult, dispatch_command
from ensemble_forward_bridge_command_approvals import public_approval_record
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_run_service import RunService


class ForwardBridgeCommandDispatcherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.workspace, ignore_errors=True))
        self.repository = LoopStateRepository(self.workspace)

    def _create_linked_run(self) -> tuple[str, str]:
        run_id = RunService(self.repository).create_run("command dispatcher run")["run_id"]
        iteration_id = IterationService(self.repository).append_iteration(run_id, "command dispatcher iteration")[
            "iteration_id"
        ]
        return run_id, iteration_id

    def _create_task(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "task_id": "otask-command-001",
            "title": "Command-owned task",
            "objective": "Exercise the command dispatcher boundary",
            "status": "todo",
            "priority": "medium",
            "acceptance_json": ["task exists"],
        }
        payload.update(overrides)
        result = dispatch_command(
            "POST",
            "/api/operator/tasks",
            payload,
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )
        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 201)
        return result.payload["task"]  # type: ignore[index]

    def test_create_task_returns_created_status_and_public_task_payload(self) -> None:
        result = dispatch_command(
            "POST",
            "/api/operator/tasks",
            {
                "task_id": "otask-create-001",
                "title": "Create through dispatcher",
                "objective": "Create operator task through common commands",
                "status": "todo",
                "priority": "high",
                "acceptance_json": ["created"],
            },
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 201)
        self.assertEqual(result.payload["task"]["task_id"], "otask-create-001")  # type: ignore[index]
        self.assertEqual(result.payload["task"]["status"], "todo")  # type: ignore[index]

    def test_update_task_preserves_current_conflict_status_shape_when_approval_is_pending(self) -> None:
        run_id, iteration_id = self._create_linked_run()
        task = self._create_task(linked_run_id=run_id, linked_iteration_id=iteration_id)
        ApprovalInterruptAdapter(self.workspace).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="shell_execution",
            action_payload={"command": "echo risky"},
        )

        result = dispatch_command(
            "PATCH",
            f"/api/operator/tasks/{task['task_id']}",
            {
                "title": task["title"],
                "objective": task["objective"],
                "status": "in_progress",
                "priority": task["priority"],
                "linked_run_id": run_id,
                "linked_iteration_id": iteration_id,
                "acceptance_json": ["created"],
            },
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 409)
        self.assertIn("pending approval", result.payload["error"])  # type: ignore[index]

    def test_update_task_returns_ok_status_and_public_task_payload(self) -> None:
        task = self._create_task(task_id="otask-update-001")

        result = dispatch_command(
            "PATCH",
            f"/api/operator/tasks/{task['task_id']}",
            {
                "title": "Updated through dispatcher",
                "objective": task["objective"],
                "status": "in_progress",
                "priority": "high",
                "acceptance_json": ["updated"],
            },
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 200)
        self.assertEqual(result.payload["task"]["title"], "Updated through dispatcher")  # type: ignore[index]
        self.assertEqual(result.payload["task"]["status"], "in_progress")  # type: ignore[index]

    def test_delete_task_requires_archive_gate_before_projection_is_removed(self) -> None:
        task = self._create_task(task_id="otask-delete-gated")

        result = dispatch_command(
            "DELETE",
            f"/api/operator/tasks/{task['task_id']}",
            {},
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 409)
        self.assertIn("requires archiving", result.payload["error"])  # type: ignore[index]
        self.assertIsNotNone(self.repository.get_operator_task(str(task["task_id"])))

    def test_delete_task_returns_deleted_identifier_after_archive_gate(self) -> None:
        task = self._create_task(task_id="otask-delete-001")
        archived = dispatch_command(
            "POST",
            f"/api/operator/tasks/{task['task_id']}/archive",
            {"archive_note": "No longer active."},
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )
        self.assertIsInstance(archived, CommandResult)
        assert archived is not None
        self.assertEqual(archived.status, 200)

        result = dispatch_command(
            "DELETE",
            f"/api/operator/tasks/{task['task_id']}",
            {},
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 200)
        self.assertEqual(result.payload, {"deleted_task_id": "otask-delete-001"})
        self.assertIsNone(self.repository.get_operator_task("otask-delete-001"))

    def test_patch_approve_uses_common_patch_service_and_preserves_approval_envelope(self) -> None:
        service_result = {"patch_id": "patch-001", "status": "applied"}

        with mock.patch("ensemble_forward_bridge_commands.decide_agent_patch", return_value=service_result) as decide:
            result = dispatch_command(
                "DELETE",
                "/api/approvals/patch-001/approve",
                {},
                workspace=self.workspace,
                reviewer_identity="operator@example.test",
            )

        decide.assert_called_once_with(
            self.workspace,
            "patch-001",
            decision="approve",
            reason=None,
            actor="operator@example.test",
        )
        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 200)
        self.assertEqual(result.payload, {"approval": service_result})

    def test_patch_reject_uses_common_patch_service_without_echoing_unsafe_reason(self) -> None:
        service_result = {
            "patch_id": "patch-002",
            "status": "rejected",
            "durable": False,
            "compatibility": "non_durable",
        }
        unsafe_reason = "Do not ship token sk-test-123 from C:/Users/example/.ssh/id_rsa"

        with mock.patch("ensemble_forward_bridge_commands.decide_agent_patch", return_value=service_result) as decide:
            result = dispatch_command(
                "DELETE",
                "/api/approvals/patch-002/reject",
                {"reason": unsafe_reason},
                workspace=self.workspace,
                reviewer_identity="operator@example.test",
            )

        decide.assert_called_once_with(
            self.workspace,
            "patch-002",
            decision="reject",
            reason=unsafe_reason,
            actor="operator@example.test",
        )
        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 200)
        self.assertEqual(result.payload["status"], "rejected")  # type: ignore[index]
        self.assertNotIn("sk-test-123", repr(result.payload))
        self.assertNotIn("C:/Users/example", repr(result.payload))

    def test_command_approval_projection_redacts_secret_shaped_actor_labels(self) -> None:
        record = public_approval_record(
            {
                "request_id": "approval-public-label",
                "run_id": "run-public-label",
                "iteration_id": "iteration-public-label",
                "actor": "sk-commandactor123456789",
                "action_type": "shell_execution",
                "risk_level": "high",
                "status": "approved",
                "reviewer": r"C:\Users\private-reviewer\identity.txt",
                "created_at": "2026-07-11T00:00:00Z",
                "updated_at": "2026-07-11T00:00:01Z",
            }
        )

        self.assertEqual(record["actor"], "agent")
        self.assertIsNone(record["reviewer"])

    def test_workspace_command_projection_redacts_secret_shaped_owner_label(self) -> None:
        secret_owner = "sk-workspaceowner123456789"

        result = dispatch_command(
            "POST",
            "/api/operator/workspaces",
            {
                "workspace_id": "owork-public-owner",
                "label": "Public workspace",
                "path": ".",
                "kind": "repo",
                "status": "active",
                "owner_agent_id": secret_owner,
            },
            workspace=self.workspace,
            reviewer_identity="operator@example.test",
        )

        self.assertIsInstance(result, CommandResult)
        assert result is not None
        self.assertEqual(result.status, 201)
        self.assertIsInstance(result.payload, dict)
        assert isinstance(result.payload, dict)
        projected_workspace = result.payload.get("workspace")
        self.assertIsInstance(projected_workspace, dict)
        assert isinstance(projected_workspace, dict)
        self.assertIsNone(projected_workspace.get("owner_agent_id"))
        self.assertNotIn(secret_owner, repr(result.payload))


if __name__ == "__main__":
    unittest.main()
