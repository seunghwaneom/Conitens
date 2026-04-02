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
