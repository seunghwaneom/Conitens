from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_iteration_service import IterationService
from ensemble_loop_debug import rebuild_loop_state_json
from ensemble_loop_repository import LoopStateRepository, SCHEMA_VERSION
from ensemble_loop_paths import loop_state_db_path, loop_state_debug_path
from ensemble_run_service import RunService
from ensemble_state_restore import StateRestoreService


class LoopStateTests(unittest.TestCase):
    def test_create_run_bootstraps_sqlite_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_service = RunService(repository)

            created = run_service.create_run("Create the first disk-backed loop run")

            self.assertTrue(loop_state_db_path(workspace).exists())
            self.assertEqual(created["status"], "active")
            self.assertEqual(created["current_iteration"], 0)
            self.assertEqual(repository.schema_version(), SCHEMA_VERSION)

    def test_append_iterations_and_mark_complete_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_service = RunService(repository)
            iteration_service = IterationService(repository)

            run = run_service.create_run("Append iterations to one run")
            iteration_one = iteration_service.append_iteration(run["run_id"], "Plan the first iteration")
            iteration_two = iteration_service.append_iteration(run["run_id"], "Plan the second iteration")
            completed = iteration_service.mark_iteration_complete(
                iteration_one["iteration_id"],
                summary="Iteration one complete",
            )
            incomplete = iteration_service.mark_iteration_incomplete(
                iteration_two["iteration_id"],
                summary="Iteration two needs follow-up",
            )

            iterations = iteration_service.list_iterations(run["run_id"])
            refreshed_run = run_service.get_run(run["run_id"])

            self.assertEqual(iteration_one["seq_no"], 1)
            self.assertEqual(iteration_two["seq_no"], 2)
            self.assertEqual(completed["status"], "completed")
            self.assertEqual(incomplete["status"], "incomplete")
            self.assertEqual(refreshed_run["current_iteration"], 2)
            self.assertEqual([item["seq_no"] for item in iterations], [1, 2])

    def test_restore_latest_active_run_after_simulated_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)

            repository_a = LoopStateRepository(workspace)
            run_service_a = RunService(repository_a)
            iteration_service_a = IterationService(repository_a)

            older_run = run_service_a.create_run("Older run that will stop")
            iteration_service_a.append_iteration(older_run["run_id"], "Older iteration")
            run_service_a.persist_stop_reason(older_run["run_id"], "verified")

            active_run = run_service_a.create_run("Active run that should restore")
            active_iteration = iteration_service_a.append_iteration(
                active_run["run_id"],
                "Active iteration that survives restart",
            )

            repository_b = LoopStateRepository(workspace)
            restore_service = StateRestoreService(repository_b)

            restored = restore_service.restore_latest_active_run()

            self.assertIsNotNone(restored)
            assert restored is not None
            self.assertEqual(restored["run"]["run_id"], active_run["run_id"])
            self.assertEqual(restored["latest_iteration"]["iteration_id"], active_iteration["iteration_id"])
            self.assertEqual(restored["latest_iteration"]["seq_no"], 1)

    def test_persist_stop_reason_records_row_and_updates_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_service = RunService(repository)
            iteration_service = IterationService(repository)

            run = run_service.create_run("Stop the run after one iteration")
            iteration = iteration_service.append_iteration(run["run_id"], "Only iteration")
            stopped = run_service.persist_stop_reason(
                run["run_id"],
                "verified",
                iteration_id=iteration["iteration_id"],
            )
            conditions = repository.list_stop_conditions(run["run_id"])

            self.assertEqual(stopped["status"], "stopped")
            self.assertEqual(stopped["stop_reason"], "verified")
            self.assertEqual(len(conditions), 1)
            self.assertEqual(conditions[0]["kind"], "verified")
            self.assertEqual(conditions[0]["value_json"]["stop_reason"], "verified")

    def test_regenerate_loop_state_json_from_db(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_service = RunService(repository)
            iteration_service = IterationService(repository)

            run = run_service.create_run("Generate debug mirror")
            iteration = iteration_service.append_iteration(run["run_id"], "Generate one iteration")
            iteration_service.mark_iteration_complete(iteration["iteration_id"], summary="Done")
            iteration_service.record_validator_result(
                run["run_id"],
                iteration["iteration_id"],
                passed=True,
                issues=[],
                feedback_text="smoke ok",
            )
            run_service.persist_stop_reason(run["run_id"], "verified", iteration_id=iteration["iteration_id"])

            result = rebuild_loop_state_json(repository)
            written = json.loads(loop_state_debug_path(workspace).read_text(encoding="utf-8"))

            self.assertEqual(result["schema_version"], SCHEMA_VERSION)
            self.assertEqual(written["schema_version"], SCHEMA_VERSION)
            self.assertEqual(written["runs"][0]["run"]["run_id"], run["run_id"])
            self.assertEqual(written["runs"][0]["iterations"][0]["seq_no"], 1)
            self.assertTrue(written["runs"][0]["validator_results"][0]["passed"])
            self.assertEqual(written["runs"][0]["stop_conditions"][0]["kind"], "verified")

    def test_restore_snapshot_includes_extended_batch11_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_service = RunService(repository)
            iteration_service = IterationService(repository)

            run = run_service.create_run("Extended restore coverage")
            iteration = iteration_service.append_iteration(run["run_id"], "Extended iteration")
            repository.upsert_task_plan(
                run_id=run["run_id"],
                current_plan="Extended plan",
                objective="Recover all batch 11 state",
                steps=[{"title": "extended", "status": "in_progress"}],
                acceptance_criteria=["snapshot is complete"],
                owner="CLI",
            )
            repository.append_finding(
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                category="discovery",
                actor="CLI",
                summary="snapshot should include forward state",
            )
            repository.append_progress_entry(
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="CLI",
                summary="progress entry",
            )
            repository.append_orchestration_checkpoint(
                run_id=run["run_id"],
                graph_kind="build",
                step_name="checkpoint",
                state={"run_id": run["run_id"], "approval_pending": False},
                retry_count=0,
                validator_issues=[],
                approval_pending=False,
                stop_reason=None,
                loop_cost_metrics={},
            )
            repository.append_retry_decision(
                run_id=run["run_id"],
                graph_kind="build",
                retry_index=1,
                decision="same_worker_retry",
                reason="validator failed",
            )
            repository.append_approval_request(
                request_id="approval-1",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="worker",
                action_type="shell_execution",
                action_payload={"command": "echo test"},
                risk_level="high",
                status="pending",
                reviewer=None,
                reviewer_note=None,
                created_at="2026-04-01T00:00:00.000000Z",
                updated_at="2026-04-01T00:00:00.000000Z",
            )
            repository.upsert_room(
                room_id="room-1",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                task_id=run["run_id"],
                room_type="decision",
                name="Decision Room",
                status="active",
                created_by="CLI",
                participants=["user", "agent"],
                session_boundary={"backend": "local-fallback"},
                created_at="2026-04-01T00:00:01.000000Z",
                updated_at="2026-04-01T00:00:01.000000Z",
            )
            repository.append_room_message(
                room_id="room-1",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                sender="user",
                sender_kind="user",
                message_type="text",
                content="decision message",
                evidence_refs=["room:1"],
                metadata={"kind": "decision"},
                created_at="2026-04-01T00:00:02.000000Z",
            )
            repository.append_tool_event(
                room_id="room-1",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="agent",
                tool_name="validator",
                payload={"status": "checked"},
                created_at="2026-04-01T00:00:03.000000Z",
            )
            repository.append_insight(
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                room_id="room-1",
                kind="decision",
                summary="ship replay first",
                evidence_refs=["room:room-1:message:1"],
                details={"source": "room"},
                created_at="2026-04-01T00:00:04.000000Z",
            )
            repository.upsert_handoff_packet(
                handoff_id="handoff-1",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                from_actor="agent-a",
                to_actor="agent-b",
                status="requested",
                summary="handoff",
                packet={"summary": "handoff"},
                created_at="2026-04-01T00:00:05.000000Z",
                updated_at="2026-04-01T00:00:05.000000Z",
            )
            repository.create_operator_task(
                task_id="otask-1",
                title="Operator task",
                objective="Own the next product slice",
                status="todo",
                priority="high",
                owner_agent_id="agent-a",
                linked_run_id=run["run_id"],
                linked_iteration_id=iteration["iteration_id"],
                linked_room_ids=["room-1"],
                acceptance=["ship tests"],
            )
            repository.append_memory_record(
                record_id="mem-1",
                agent_id="agent-a",
                namespace="agent-a/ns",
                kind="episodic",
                summary="remember this run",
                tags=[],
                evidence_refs=[],
                confidence=0.5,
                salience=0.5,
                ttl_days=None,
                approved=True,
                source_type="worker",
                source_ref=run["run_id"],
                created_at="2026-04-01T00:00:06.000000Z",
            )
            repository.append_candidate_policy_patch(
                patch_id="patch-1",
                agent_id="agent-a",
                namespace="agent-a/ns",
                target_persona_id="agent-a",
                patch_path=str(workspace / "candidate.yaml"),
                summary="candidate patch",
                approved=False,
                source_type="review_patch",
                source_ref=run["run_id"],
                created_at="2026-04-01T00:00:07.000000Z",
            )

            restored = StateRestoreService(repository).restore_run_from_disk(run["run_id"])

            self.assertEqual(restored["run"]["run_id"], run["run_id"])
            self.assertEqual(restored["source_of_truth"]["run_state"]["owner"], "sqlite:runs")
            self.assertTrue(restored["source_of_truth"]["immutable_progress_log"]["append_only"])
            self.assertEqual(len(restored["orchestration_checkpoints"]), 1)
            self.assertEqual(len(restored["retry_decisions"]), 1)
            self.assertEqual(len(restored["approval_requests"]), 1)
            self.assertEqual(len(restored["rooms"]), 1)
            self.assertEqual(len(restored["messages"]), 1)
            self.assertEqual(len(restored["tool_events"]), 1)
            self.assertEqual(len(restored["insights"]), 1)
            self.assertEqual(len(restored["handoff_packets"]), 1)
            self.assertEqual(len(restored["operator_tasks"]), 1)
            self.assertEqual(len(restored["memory_records"]), 1)
            self.assertEqual(len(restored["candidate_policy_patches"]), 1)

    def test_debug_snapshot_reports_authoritative_owners_and_extended_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run = RunService(repository).create_run("Debug snapshot state")
            iteration = IterationService(repository).append_iteration(run["run_id"], "Debug iteration")
            repository.append_progress_entry(
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="CLI",
                summary="append-only progress",
            )
            repository.append_approval_request(
                request_id="approval-2",
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="worker",
                action_type="shell_execution",
                action_payload={"command": "echo test"},
                risk_level="high",
                status="pending",
                reviewer=None,
                reviewer_note=None,
                created_at="2026-04-01T00:00:00.000000Z",
                updated_at="2026-04-01T00:00:00.000000Z",
            )

            rebuild_loop_state_json(repository)
            written = json.loads(loop_state_debug_path(workspace).read_text(encoding="utf-8"))

            self.assertEqual(written["source_of_truth"]["approval_decision"]["owner"], "sqlite:approval_requests")
            self.assertEqual(written["source_of_truth"]["room_event_log"]["owner"], "sqlite:messages")
            self.assertEqual(written["source_of_truth"]["operator_task"]["owner"], "sqlite:operator_tasks")
            self.assertEqual(written["runs"][0]["approval_requests"][0]["request_id"], "approval-2")
            self.assertEqual(written["runs"][0]["progress_entries"][0]["summary"], "append-only progress")

    def test_create_and_list_operator_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run = RunService(repository).create_run("Operator task registry")
            iteration = IterationService(repository).append_iteration(run["run_id"], "Registry iteration")

            created = repository.create_operator_task(
                task_id="otask-1",
                title="Create operator task registry",
                objective="Introduce the first owned operator API slice",
                status="todo",
                priority="high",
                owner_agent_id="architect",
                linked_run_id=run["run_id"],
                linked_iteration_id=iteration["iteration_id"],
                linked_room_ids=["room-1"],
                blocked_reason=None,
                acceptance=["api exists"],
                workspace_ref="workspace-a",
            )

            listed = repository.list_operator_tasks(owner_agent_id="architect")

            self.assertEqual(created["task_id"], "otask-1")
            self.assertEqual(created["linked_room_ids_json"], ["room-1"])
            self.assertEqual(created["acceptance_json"], ["api exists"])
            self.assertEqual(listed[0]["workspace_ref"], "workspace-a")

    def test_update_operator_task(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run = RunService(repository).create_run("Operator task update")
            iteration = IterationService(repository).append_iteration(run["run_id"], "Update iteration")
            repository.create_operator_task(
                task_id="otask-1",
                title="Initial title",
                objective="Initial objective",
                status="todo",
                priority="medium",
                owner_agent_id="architect",
                linked_run_id=run["run_id"],
                linked_iteration_id=iteration["iteration_id"],
                linked_room_ids=[],
                acceptance=["initial"],
            )

            updated = repository.update_operator_task(
                task_id="otask-1",
                title="Updated title",
                objective="Updated objective",
                status="blocked",
                priority="high",
                blocked_reason="Needs operator decision",
                acceptance=["updated"],
            )

            self.assertEqual(updated["title"], "Updated title")
            self.assertEqual(updated["status"], "blocked")
            self.assertEqual(updated["blocked_reason"], "Needs operator decision")
            self.assertEqual(updated["acceptance_json"], ["updated"])

    def test_invalid_operator_task_status_transition_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_task(
                task_id="otask-1",
                title="Initial title",
                objective="Initial objective",
                status="todo",
                priority="medium",
            )

            with self.assertRaises(ValueError) as exc_info:
                repository.update_operator_task(
                    task_id="otask-1",
                    status="done",
                )

            self.assertIn("Invalid operator task status transition", str(exc_info.exception))

    def test_delete_operator_task(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_task(
                task_id="otask-1",
                title="Initial title",
                objective="Initial objective",
                status="todo",
                priority="medium",
            )

            deleted = repository.delete_operator_task("otask-1")

            self.assertEqual(deleted["task_id"], "otask-1")
            self.assertIsNone(repository.get_operator_task("otask-1"))
            self.assertEqual(repository.list_operator_tasks(), [])

    def test_archive_and_restore_operator_task(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_task(
                task_id="otask-1",
                title="Initial title",
                objective="Initial objective",
                status="todo",
                priority="medium",
            )

            archived = repository.archive_operator_task(
                "otask-1",
                archived_by="operator-1",
                archive_note="Shipped and removed from the active queue.",
            )
            visible_after_archive = repository.list_operator_tasks()
            visible_with_archived = repository.list_operator_tasks(include_archived=True)
            restored = repository.restore_operator_task("otask-1")

            self.assertIsNotNone(archived["archived_at"])
            self.assertEqual(archived["archived_by"], "operator-1")
            self.assertEqual(archived["archive_note"], "Shipped and removed from the active queue.")
            self.assertEqual(visible_after_archive, [])
            self.assertEqual(len(visible_with_archived), 1)
            self.assertIsNone(restored["archived_at"])
            self.assertIsNone(restored["archived_by"])
            self.assertIsNone(restored["archive_note"])
            self.assertEqual(len(repository.list_operator_tasks()), 1)

    def test_create_and_update_operator_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run = RunService(repository).create_run("Operator workspace registry")
            iteration = IterationService(repository).append_iteration(run["run_id"], "Workspace iteration")

            created = repository.create_operator_workspace(
                workspace_id="owork-1",
                label="Dashboard repo",
                path="packages/dashboard",
                kind="repo",
                status="active",
                owner_agent_id="architect",
                linked_run_id=run["run_id"],
                linked_iteration_id=iteration["iteration_id"],
                task_ids=["otask-1"],
                notes="Primary frontend workspace.",
            )

            updated = repository.update_operator_workspace(
                workspace_id="owork-1",
                status="blocked",
                task_ids=["otask-1", "otask-2"],
                notes="Blocked on validator pass.",
            )

            listed = repository.list_operator_workspaces(owner_agent_id="architect")

            self.assertEqual(created["workspace_id"], "owork-1")
            self.assertEqual(created["task_ids_json"], ["otask-1"])
            self.assertEqual(updated["status"], "blocked")
            self.assertEqual(updated["task_ids_json"], ["otask-1", "otask-2"])
            self.assertEqual(listed[0]["notes"], "Blocked on validator pass.")

    def test_invalid_operator_workspace_status_transition_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_workspace(
                workspace_id="owork-1",
                label="Dashboard repo",
                path="packages/dashboard",
                kind="repo",
                status="archived",
            )

            with self.assertRaises(ValueError) as exc_info:
                repository.update_operator_workspace(
                    workspace_id="owork-1",
                    status="blocked",
                )

            self.assertIn("Invalid operator workspace status transition", str(exc_info.exception))

    def test_workspace_archive_metadata_is_recorded_and_cleared(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_workspace(
                workspace_id="owork-1",
                label="Dashboard repo",
                path="packages/dashboard",
                kind="repo",
                status="active",
            )

            archived = repository.update_operator_workspace(
                workspace_id="owork-1",
                status="archived",
                archived_by="operator-1",
                archive_note="Freeze the workspace after delivery.",
            )
            restored = repository.update_operator_workspace(
                workspace_id="owork-1",
                status="active",
            )

            self.assertIsNotNone(archived["archived_at"])
            self.assertEqual(archived["archived_by"], "operator-1")
            self.assertEqual(archived["archive_note"], "Freeze the workspace after delivery.")
            self.assertIsNone(restored["archived_at"])
            self.assertIsNone(restored["archived_by"])
            self.assertIsNone(restored["archive_note"])

    def test_detach_operator_task_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            repository.create_operator_task(
                task_id="otask-1",
                title="Initial title",
                objective="Initial objective",
                status="todo",
                priority="medium",
                workspace_ref="owork-1",
            )

            detached = repository.detach_operator_task_workspace("otask-1")

            self.assertIsNone(detached["workspace_ref"])


if __name__ == "__main__":
    unittest.main()
