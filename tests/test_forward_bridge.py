from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_context_markdown import ContextRegenerator, TaskPlanWriterReader
from ensemble_forward_bridge import launch_forward_bridge
from ensemble_insight_extractor import InsightExtractor
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService
from ensemble_run_service import RunService


class ForwardBridgeTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, str, str]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST_CONTEXT\n\nrepo digest\n", encoding="utf-8")
        repo = LoopStateRepository(root)
        run_id = RunService(repo).create_run("BE-1a bridge test")["run_id"]
        iteration_id = IterationService(repo).append_iteration(run_id, "Bridge iteration")["iteration_id"]
        TaskPlanWriterReader(repo).update_from_structured_input(
            run_id=run_id,
            current_plan="Forward bridge plan",
            objective="Expose read-only bridge routes",
            steps=[{"title": "Bridge step", "status": "in_progress", "owner": "sample-agent"}],
            acceptance_criteria=["bridge route returns json"],
            owner="sample-agent",
        )
        repo.record_validator_result(
            run_id=run_id,
            iteration_id=iteration_id,
            passed=False,
            issues=[{"message": "validator history visible"}],
            feedback_text="validator history visible",
        )
        approval = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="shell_execution",
            action_payload={"command": "echo hi"},
        )
        ApprovalInterruptAdapter(root).decide(
            request_id=approval["request_id"],
            status="approved",
            reviewer="owner",
            reviewer_note="ok",
        )
        room = RoomService(root).create_room(
            name="review-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        RoomService(root).append_message(
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="DECISION: bridge stays read-only",
            run_id=run_id,
            iteration_id=iteration_id,
        )
        InsightExtractor(root).extract_from_room(room["room_id"])
        ContextRegenerator(repo).regenerate_all(run_id)
        return root, repo, run_id, iteration_id

    def test_runs_endpoint_requires_auth_and_returns_run_list(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8882)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8882/api/runs", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8882/api/runs",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["runs"][0]["run_id"], run_id)
        self.assertIn("counts", payload["runs"][0])

    def test_run_detail_and_replay_endpoints_return_forward_data(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8883)
        try:
            detail_request = Request(
                f"http://127.0.0.1:8883/api/runs/{run_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            replay_request = Request(
                f"http://127.0.0.1:8883/api/runs/{run_id}/replay",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail_payload = json.loads(response.read().decode("utf-8"))
            with urlopen(replay_request, timeout=10) as response:
                replay_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(detail_payload["run"]["run_id"], run_id)
        self.assertTrue(detail_payload["iterations"])
        self.assertTrue(replay_payload["timeline"])
        self.assertTrue(replay_payload["validator_history"])
        self.assertTrue(replay_payload["approvals"])

    def test_operator_summary_endpoint_returns_projection_shape(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8887)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8887/api/operator/summary", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8887/api/operator/summary",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["runs"]["total"], 1)
        self.assertEqual(payload["approvals"]["pending"], 1)
        self.assertEqual(payload["runs"]["awaiting_approval"], 1)
        self.assertEqual(payload["validation"]["failing_runs"], 1)
        self.assertEqual(payload["runs"]["latest_run_id"], run_id)

    def test_operator_inbox_endpoint_returns_projection_shape(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        pending = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        repo.upsert_handoff_packet(
            handoff_id="handoff-1",
            run_id=run_id,
            iteration_id=iteration_id,
            from_actor="sample-agent",
            to_actor="reviewer",
            status="blocked",
            summary="Need reviewer attention",
            packet={"blocked_reason": "Need reviewer attention"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8888)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8888/api/operator/inbox", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8888/api/operator/inbox",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertGreaterEqual(payload["count"], 3)
        kinds = {item["kind"] for item in payload["items"]}
        self.assertIn("approval", kinds)
        self.assertIn("validator_failure", kinds)
        self.assertIn("handoff_attention", kinds)
        approval_item = next(item for item in payload["items"] if item["id"] == f"approval:{pending['request_id']}")
        self.assertEqual(approval_item["action_label"], "Review approval")

    def test_operator_agents_endpoint_returns_projection_shape(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8889)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8889/api/operator/agents", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8889/api/operator/agents",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertGreaterEqual(payload["count"], 1)
        sample_agent = next(item for item in payload["agents"] if item["agent_id"] == "sample-agent")
        self.assertEqual(sample_agent["role"], "implementer")
        self.assertEqual(sample_agent["latest_run_id"], run_id)
        self.assertGreaterEqual(sample_agent["pending_approvals"], 1)

    def test_operator_tasks_endpoints_create_list_detail_update_archive_restore_and_delete(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8890)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8890/api/operator/tasks", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            create_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Introduce canonical operator task",
                        "objective": "Create the first owned operator API slice",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": ["R-20260404-001"],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            task_id = created["task"]["task_id"]
            list_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(list_request, timeout=10) as response:
                listed = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": "Updated operator task",
                        "objective": "Updated objective",
                        "status": "blocked",
                        "priority": "critical",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": ["R-20260404-001"],
                        "blocked_reason": "Waiting for approval",
                        "acceptance_json": ["updated"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(patch_request, timeout=10) as response:
                updated = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "archive_note": "Completed and removed from the active queue.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(archive_request, timeout=10) as response:
                archived = json.loads(response.read().decode("utf-8"))

            with urlopen(list_request, timeout=10) as response:
                listed_after_archive = json.loads(response.read().decode("utf-8"))

            archived_list_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks?include_archived=1",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(archived_list_request, timeout=10) as response:
                listed_with_archived = json.loads(response.read().decode("utf-8"))

            restore_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}/restore",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=b"{}",
            )
            with urlopen(restore_request, timeout=10) as response:
                restored = json.loads(response.read().decode("utf-8"))

            with self.assertRaises(HTTPError) as active_delete_exc:
                urlopen(delete_request := Request(
                    f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {launched['token']}"},
                    method="DELETE",
                ), timeout=10)
            self.assertEqual(active_delete_exc.exception.code, 409)
            active_delete_body = json.loads(active_delete_exc.exception.read().decode("utf-8"))

            with urlopen(archive_request, timeout=10) as response:
                archived_again = json.loads(response.read().decode("utf-8"))

            delete_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
                method="DELETE",
            )
            with urlopen(delete_request, timeout=10) as response:
                deleted = json.loads(response.read().decode("utf-8"))

            with urlopen(list_request, timeout=10) as response:
                listed_after_delete = json.loads(response.read().decode("utf-8"))

            with self.assertRaises(HTTPError) as missing_exc:
                urlopen(detail_request, timeout=10)
            self.assertEqual(missing_exc.exception.code, 404)
            missing_exc.exception.close()
        finally:
            launched["server"].shutdown()

        self.assertEqual(created["task"]["owner_agent_id"], "sample-agent")
        self.assertEqual(created["task"]["linked_run_id"], run_id)
        self.assertEqual(listed["count"], 1)
        self.assertEqual(detail["task"]["task_id"], task_id)
        self.assertEqual(detail["task"]["acceptance_json"], ["task exists"])
        self.assertEqual(updated["task"]["title"], "Updated operator task")
        self.assertEqual(updated["task"]["status"], "blocked")
        self.assertIsNotNone(archived["task"]["archived_at"])
        self.assertTrue(archived["task"]["archived_by"])
        self.assertEqual(archived["task"]["archive_note"], "Completed and removed from the active queue.")
        self.assertEqual(listed_after_archive["count"], 0)
        self.assertEqual(listed_with_archived["count"], 1)
        self.assertIsNone(restored["task"]["archived_at"])
        self.assertIsNone(restored["task"]["archived_by"])
        self.assertIsNone(restored["task"]["archive_note"])
        self.assertIn("requires archiving", active_delete_body["error"])
        self.assertIsNotNone(archived_again["task"]["archived_at"])
        self.assertEqual(deleted["deleted_task_id"], task_id)
        self.assertEqual(listed_after_delete["count"], 0)

    def test_operator_workspaces_endpoints_create_list_detail_and_update(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8896)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8896/api/operator/workspaces", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            create_request = Request(
                "http://127.0.0.1:8896/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "task_ids_json": ["otask-1"],
                        "notes": "Primary frontend workspace.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            workspace_id = created["workspace"]["workspace_id"]
            list_request = Request(
                "http://127.0.0.1:8896/api/operator/workspaces",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(list_request, timeout=10) as response:
                listed = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                f"http://127.0.0.1:8896/api/operator/workspaces/{workspace_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8896/api/operator/workspaces/{workspace_id}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "blocked",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "task_ids_json": ["otask-1", "otask-2"],
                        "notes": "Blocked on review.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(patch_request, timeout=10) as response:
                updated = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(created["workspace"]["path"], "packages/dashboard")
        self.assertEqual(listed["count"], 1)
        self.assertEqual(detail["workspace"]["workspace_id"], workspace_id)
        self.assertEqual(updated["workspace"]["status"], "blocked")
        self.assertEqual(updated["workspace"]["task_ids_json"], [])

    def test_operator_workspace_archive_metadata_is_returned(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8901)
        try:
            create_request = Request(
                "http://127.0.0.1:8901/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze the workspace after delivery.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            reactivate_request = Request(
                "http://127.0.0.1:8901/api/operator/workspaces/owork-archived",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(reactivate_request, timeout=10) as response:
                restored = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNotNone(created["workspace"]["archived_at"])
        self.assertTrue(created["workspace"]["archived_by"])
        self.assertEqual(created["workspace"]["archive_note"], "Freeze the workspace after delivery.")
        self.assertIsNone(restored["workspace"]["archived_at"])
        self.assertIsNone(restored["workspace"]["archived_by"])
        self.assertIsNone(restored["workspace"]["archive_note"])

    def test_operator_workspace_patch_is_blocked_while_archived(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8903)
        try:
            create_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze the workspace after delivery.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10):
                pass

            patch_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces/owork-archived",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Rewritten archive note.",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces/owork-archived",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("read-only until reactivated", body["error"])
        self.assertEqual(detail["workspace"]["archive_note"], "Freeze the workspace after delivery.")

    def test_operator_task_workspace_ref_requires_existing_workspace(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8897)
        try:
            create_request = Request(
                "http://127.0.0.1:8897/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-linked task",
                        "objective": "Reject unknown canonical workspace refs",
                        "status": "todo",
                        "priority": "medium",
                        "workspace_ref": "owork-missing",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(create_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Operator workspace not found", body["error"])

    def test_operator_workspace_detail_derives_linked_task_refs_from_tasks(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8898)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8898/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10) as response:
                workspace_payload = json.loads(response.read().decode("utf-8"))

            create_task = Request(
                "http://127.0.0.1:8898/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-derived task",
                        "objective": "Link task to canonical workspace",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10) as response:
                task_payload = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8898/api/operator/workspaces/owork-dashboard",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(workspace_payload["workspace"]["workspace_id"], "owork-dashboard")
        self.assertEqual(task_payload["task"]["workspace_ref"], "owork-dashboard")
        self.assertEqual(detail["workspace"]["task_ids_json"], [task_payload["task"]["task_id"]])

    def test_operator_task_detach_workspace_updates_workspace_membership(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8902)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8902/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8902/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-detached task",
                        "objective": "Detach from workspace through bridge",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10) as response:
                task_payload = json.loads(response.read().decode("utf-8"))

            detach_task = Request(
                f"http://127.0.0.1:8902/api/operator/tasks/{task_payload['task']['task_id']}/detach-workspace",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=b"{}",
            )
            with urlopen(detach_task, timeout=10) as response:
                detached = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8902/api/operator/workspaces/owork-dashboard",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNone(detached["task"]["workspace_ref"])
        self.assertEqual(detail["workspace"]["task_ids_json"], [])

    def test_operator_task_cannot_attach_new_archived_workspace(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8899)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8899/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Archived workspace fixture.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8899/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archived workspace task",
                        "objective": "Do not attach to archived workspace",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-archived",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(create_task, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Archived operator workspace cannot accept new task links", body["error"])

    def test_operator_workspace_archive_is_blocked_when_active_tasks_are_linked(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8900)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8900/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8900/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-blocking task",
                        "objective": "Keep workspace active while task is attached",
                        "status": "todo",
                        "priority": "medium",
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10):
                pass

            patch_workspace = Request(
                "http://127.0.0.1:8900/api/operator/workspaces/owork-dashboard",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze this workspace after task cleanup.",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_workspace, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Workspace archiving requires detaching or archiving linked active tasks", body["error"])

    def test_operator_task_patch_is_blocked_when_linked_run_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        pending = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8891)
        try:
            create_request = Request(
                "http://127.0.0.1:8891/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Approval-sensitive task",
                        "objective": "Do not allow execution-sensitive mutation while approval is pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8891/api/operator/tasks/{created['task']['task_id']}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": created["task"]["title"],
                        "objective": created["task"]["objective"],
                        "status": "in_progress",
                        "priority": created["task"]["priority"],
                        "owner_agent_id": created["task"]["owner_agent_id"],
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": [],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(pending["status"], "pending")
        self.assertIn("pending approval", body["error"])

    def test_operator_task_request_approval_creates_task_linked_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8892)
        try:
            create_request = Request(
                "http://127.0.0.1:8892/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Approval-requested task",
                        "objective": "Request task-scoped approval",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            request_approval = Request(
                f"http://127.0.0.1:8892/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "rationale": "Need explicit review",
                        "requested_changes": ["status", "owner_agent_id"],
                        "draft_snapshot": {
                            "status": "blocked",
                            "owner_agent_id": "sample-agent",
                        },
                    }
                ).encode("utf-8"),
            )
            with urlopen(request_approval, timeout=10) as response:
                approval = json.loads(response.read().decode("utf-8"))

            approvals_request = Request(
                f"http://127.0.0.1:8892/api/approvals?task_id={created['task']['task_id']}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(approval["approval"]["task_id"], created["task"]["task_id"])
        self.assertEqual(approval["approval"]["action_type"], "operator_task_update")
        self.assertEqual(approval["approval"]["action_payload"]["rationale"], "Need explicit review")
        self.assertEqual(approval["approval"]["action_payload"]["requested_changes"], ["status", "owner_agent_id"])
        self.assertEqual(approvals["approvals"][0]["task_id"], created["task"]["task_id"])

    def test_operator_task_archive_is_blocked_when_task_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8893)
        try:
            create_request = Request(
                "http://127.0.0.1:8893/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Delete-guarded task",
                        "objective": "Do not delete while a task approval is pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            request_approval = Request(
                f"http://127.0.0.1:8893/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"rationale": "Need review before deleting"}).encode("utf-8"),
            )
            with urlopen(request_approval, timeout=10) as response:
                approval = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8893/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Queue it for cleanup after review."}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(archive_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(approval["approval"]["status"], "pending")
        self.assertIn("task has pending approval requests", body["error"])

    def test_operator_task_archive_is_blocked_when_linked_run_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8894)
        try:
            create_request = Request(
                "http://127.0.0.1:8894/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archive-guarded task",
                        "objective": "Do not archive while linked run approvals are pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8894/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Hide it from the active queue."}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(archive_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("linked run", body["error"])

    def test_archived_operator_task_patch_and_approval_request_are_blocked(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8895)
        try:
            create_request = Request(
                "http://127.0.0.1:8895/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archived read-only task",
                        "objective": "Archived tasks should not accept edits or approval requests",
                        "status": "todo",
                        "priority": "medium",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Freeze further mutation."}).encode("utf-8"),
            )
            with urlopen(archive_request, timeout=10) as response:
                archived = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": "Archived task edited",
                        "objective": created["task"]["objective"],
                        "status": "todo",
                        "priority": created["task"]["priority"],
                        "owner_agent_id": created["task"]["owner_agent_id"],
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": [],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as patch_exc:
                urlopen(patch_request, timeout=10)
            self.assertEqual(patch_exc.exception.code, 409)
            patch_body = json.loads(patch_exc.exception.read().decode("utf-8"))

            approval_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"rationale": "Try approval from archived task"}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as approval_exc:
                urlopen(approval_request, timeout=10)
            self.assertEqual(approval_exc.exception.code, 409)
            approval_body = json.loads(approval_exc.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNotNone(archived["task"]["archived_at"])
        self.assertIn("read-only", patch_body["error"])
        self.assertIn("cannot request approval", approval_body["error"])

    def test_state_docs_and_context_latest_routes_keep_digest_boundary(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8884)
        try:
            state_docs_request = Request(
                f"http://127.0.0.1:8884/api/runs/{run_id}/state-docs",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            context_request = Request(
                f"http://127.0.0.1:8884/api/runs/{run_id}/context-latest",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(state_docs_request, timeout=10) as response:
                state_docs = json.loads(response.read().decode("utf-8"))
            with urlopen(context_request, timeout=10) as response:
                context_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("task_plan", state_docs["documents"])
        self.assertIn("findings", state_docs["documents"])
        self.assertIn("progress", state_docs["documents"])
        self.assertIn("latest_context", state_docs["documents"])
        self.assertIn("Expose read-only bridge routes", state_docs["documents"]["task_plan"]["content"])
        self.assertIsNotNone(context_payload["repo_latest"])
        self.assertIn("repo digest", context_payload["repo_latest"]["content"])
        self.assertIn("Bridge step", context_payload["runtime_latest"]["content"])

    def test_room_timeline_route_returns_settled_room_mapping(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
        room = repo.list_room_records(run_id=run_id)[0]
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8885)
        try:
            request = Request(
                f"http://127.0.0.1:8885/api/rooms/{room['room_id']}/timeline",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["room"]["run_id"], run_id)
        self.assertTrue(payload["messages"])
        self.assertTrue(payload["insights"])

    def test_invalid_run_identifier_is_rejected(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8886)
        try:
            request = Request(
                "http://127.0.0.1:8886/api/runs/..%2F..%2Fevil",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()


if __name__ == "__main__":
    unittest.main()
