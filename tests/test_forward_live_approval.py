from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import ContextRegenerator
from ensemble_forward_bridge import launch_forward_bridge, serialize_sse_event
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_orchestration import BuildGraph, PlannerGraph
from ensemble_persona_memory import write_memory_record_schema


class PendingRiskyWorker:
    def __init__(self, action_type: str = "shell_execution", action_payload: dict | None = None):
        self.action_type = action_type
        self.action_payload = action_payload or {"command": "echo risky"}

    def execute(self, packet, assignment, *, run_id=None, iteration_id=None, approved_request=None):
        approved = approved_request or assignment.get("approved_action") or packet.get("approved_action")
        if approved and approved.get("action_type") == self.action_type:
            payload = approved.get("action_payload") or approved.get("action_payload_json") or self.action_payload
            return {
                "artifact_id": f"artifact-{run_id}-{iteration_id}",
                "run_id": run_id,
                "iteration_id": iteration_id,
                "agent_id": packet["agent_id"],
                "task": assignment["narrow_task"],
                "summary": f"Executed approved risky task: {payload.get('command', self.action_type)}",
                "content": f"required-token::{payload.get('command', self.action_type)}",
                "skill_ids": assignment["skill_refs"],
                "path": "",
                "risky_action_request": None,
            }
        return {
            "artifact_id": f"artifact-{run_id}-{iteration_id}",
            "run_id": run_id,
            "iteration_id": iteration_id,
            "agent_id": packet["agent_id"],
            "task": assignment["narrow_task"],
            "summary": "Executed risky task",
            "content": "required-token",
            "skill_ids": assignment["skill_refs"],
            "path": "",
            "risky_action_request": {
                "action_type": self.action_type,
                "action_payload": self.action_payload,
            },
        }


class ForwardLiveApprovalTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, str]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".conitens" / "personas" / "conitens-architect.yaml").write_text(
            "\n".join(
                [
                    "id: conitens-architect",
                    "display_name: Conitens Architect",
                    "role: architect",
                    "public_persona: Direct and concise",
                    "private_policy:",
                    "  identity_core_locked: true",
                    "expertise_tags:",
                    "  - orchestration",
                    "default_skill_refs:",
                    "  - conitens-core",
                    "memory_namespace: conitens-architect",
                    "handoff:",
                    "  preferred_format: checklist",
                    "self_improvement:",
                    "  allow_candidate_patches: true",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        (root / ".agents" / "skills" / "conitens-core").mkdir(parents=True, exist_ok=True)
        (root / ".agents" / "skills" / "conitens-core" / "SKILL.md").write_text(
            "---\nschema_v: 1\nskill_id: conitens-core\nname: conitens-core\ndescription: core\ntools:\n  - id: task.create\n    mode: write\n---\n\n# core\n",
            encoding="utf-8",
        )
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST_CONTEXT\n\nrepo digest\n", encoding="utf-8")
        (root / ".agent" / "policies").mkdir(parents=True, exist_ok=True)
        (root / ".agent" / "policies" / "approval_actions.yaml").write_text(
            "\n".join(
                [
                    "schema_v: 1",
                    "actions:",
                    "  - action_type: shell_execution",
                    "    risk_level: high",
                    "    approval_required: true",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        write_memory_record_schema(root)
        repo = LoopStateRepository(root)
        planner = PlannerGraph(root)
        state = planner.run("Perform risky task", owner="conitens-architect")
        plan = repo.get_task_plan(state.run_id)
        repo.upsert_task_plan(
            run_id=state.run_id,
            current_plan=plan["current_plan"],
            objective=plan["objective"],
            steps=plan["steps_json"],
            acceptance_criteria=["artifact_contains:required-token"],
            owner=plan["owner"],
        )
        IterationService(repo).append_iteration(state.run_id, "Risky iteration")
        ContextRegenerator(repo).regenerate_all(state.run_id)
        build = BuildGraph(root)
        build.execution_loop.worker = PendingRiskyWorker()
        state = build.run(state.run_id, agent_id="conitens-architect")
        self.assertTrue(state.approval_pending)
        return root, repo, state.run_id

    def test_sse_serializer_round_trip_shape(self) -> None:
        payload = serialize_sse_event(event="snapshot", data={"ok": True}, event_id="7").decode("utf-8")
        self.assertIn("id: 7", payload)
        self.assertIn("event: snapshot", payload)
        self.assertIn('data: {"ok": true}', payload)

    def test_approval_list_and_detail_routes(self) -> None:
        root, _repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            approvals_request = Request(
                f"{launched['api_root']}/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]
            detail_request = Request(
                f"{launched['api_root']}/approvals/{request_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(len(approvals_payload["approvals"]), 1)
        self.assertEqual(detail_payload["approval"]["status"], "pending")

    def test_approval_decision_and_resume_round_trip(self) -> None:
        root, repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0, reviewer_identity="local-operator")
        try:
            approvals_request = Request(
                f"{launched['api_root']}/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]

            decision_request = Request(
                f"{launched['api_root']}/approvals/{request_id}/decision",
                data=json.dumps(
                    {
                        "status": "approved",
                        "reviewer": "spoofed-user",
                        "reviewer_note": "approved",
                    }
                ).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with urlopen(decision_request, timeout=10) as response:
                decision_payload = json.loads(response.read().decode("utf-8"))

            resume_request = Request(
                f"{launched['api_root']}/approvals/{request_id}/resume",
                data=b"{}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with urlopen(resume_request, timeout=20) as response:
                resume_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(decision_payload["approval"]["status"], "approved")
        self.assertEqual(decision_payload["approval"]["reviewer"], "local-operator")
        self.assertNotEqual(resume_payload["state"]["current_step"], "approval_pending")
        self.assertFalse(resume_payload["state"]["approval_pending"])
        self.assertEqual(repo.list_approval_requests(run_id=run_id)[0]["status"], "approved")

    def test_rejection_resume_records_rejected_state(self) -> None:
        root, repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            approvals_request = Request(
                f"{launched['api_root']}/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]

            decision_request = Request(
                f"{launched['api_root']}/approvals/{request_id}/decision",
                data=json.dumps(
                    {
                        "status": "rejected",
                        "reviewer": "owner",
                        "reviewer_note": "too risky",
                    }
                ).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            urlopen(decision_request, timeout=10).close()

            resume_request = Request(
                f"{launched['api_root']}/approvals/{request_id}/resume",
                data=b"{}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with urlopen(resume_request, timeout=10) as response:
                resume_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(resume_payload["state"]["current_step"], "rejected")
        self.assertEqual(repo.list_validator_results(run_id)[-1]["passed"], False)

    def test_stream_endpoint_emits_snapshot_event(self) -> None:
        root, _repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            request = Request(
                f"{launched['api_root']}/events/stream?run_id={run_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            response = urlopen(request, timeout=10)
            try:
                chunk = response.read(256).decode("utf-8")
            finally:
                response.close()
        finally:
            launched["server"].shutdown()

        self.assertIn("event: snapshot", chunk)
        self.assertIn("data:", chunk)

    def test_options_preflight_allows_loopback_origin(self) -> None:
        root, _repo, _run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            request = Request(
                f"{launched['api_root']}/runs",
                headers={
                    "Origin": "http://127.0.0.1:4291",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization",
                },
                method="OPTIONS",
            )
            with urlopen(request, timeout=10) as response:
                allow_origin = response.headers.get("Access-Control-Allow-Origin")
                allow_headers = response.headers.get("Access-Control-Allow-Headers")
                status = response.status
        finally:
            launched["server"].shutdown()

        self.assertEqual(status, 204)
        self.assertEqual(allow_origin, "http://127.0.0.1:4291")
        normalized_allow_headers = (allow_headers or "").lower()
        self.assertIn("authorization", normalized_allow_headers)
        self.assertIn("x-conitens-forward-token", normalized_allow_headers)

    def test_malformed_json_on_approval_decision_returns_400(self) -> None:
        root, _repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            approvals_request = Request(
                f"{launched['api_root']}/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]
            request = Request(
                f"{launched['api_root']}/approvals/{request_id}/decision",
                data=b"{bad json",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()

    def test_oversized_post_body_returns_413(self) -> None:
        root, _repo, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
        try:
            approvals_request = Request(
                f"{launched['api_root']}/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]
            request = Request(
                f"{launched['api_root']}/approvals/{request_id}/decision",
                data=("x" * 1_100_000).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 413)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()

    def test_internal_errors_are_sanitized(self) -> None:
        root, _repo, run_id = self.prepare_workspace()
        with patch("ensemble_forward_bridge.build_run_detail_payload", side_effect=RuntimeError("secret-runtime-detail")):
            launched = launch_forward_bridge(root, host="127.0.0.1", port=0)
            try:
                request = Request(
                    f"{launched['api_root']}/runs/{run_id}",
                    headers={"Authorization": f"Bearer {launched['token']}"},
                )
                with self.assertRaises(HTTPError) as exc_info:
                    urlopen(request, timeout=10)
                body = exc_info.exception.read().decode("utf-8")
                payload = json.loads(body)
                self.assertEqual(exc_info.exception.code, 500)
                self.assertEqual(payload["error"], "Internal forward bridge error.")
                self.assertNotIn("secret-runtime-detail", body)
                exc_info.exception.close()
            finally:
                launched["server"].shutdown()


if __name__ == "__main__":
    unittest.main()
