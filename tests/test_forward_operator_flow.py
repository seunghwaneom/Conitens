from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import ContextRegenerator
from ensemble_forward_bridge import launch_forward_bridge
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


class ForwardOperatorFlowSmokeTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, str]:
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
        return root, state.run_id

    def test_operator_flow_smoke(self) -> None:
        root, run_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8893, reviewer_identity="operator@loopback")
        try:
            runs_request = Request(
                "http://127.0.0.1:8893/api/runs",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(runs_request, timeout=10) as response:
                runs_payload = json.loads(response.read().decode("utf-8"))

            approvals_request = Request(
                f"http://127.0.0.1:8893/api/approvals?run_id={run_id}&status=pending",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals_payload = json.loads(response.read().decode("utf-8"))
            request_id = approvals_payload["approvals"][0]["request_id"]

            decision_request = Request(
                f"http://127.0.0.1:8893/api/approvals/{request_id}/decision",
                data=json.dumps(
                    {
                        "status": "approved",
                        "reviewer_note": "approved",
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
                f"http://127.0.0.1:8893/api/approvals/{request_id}/resume",
                data=b"{}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {launched['token']}",
                },
                method="POST",
            )
            with urlopen(resume_request, timeout=10) as response:
                resume_payload = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                f"http://127.0.0.1:8893/api/runs/{run_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(runs_payload["count"], 1)
        self.assertEqual(resume_payload["approval"]["status"], "approved")
        self.assertEqual(resume_payload["approval"]["reviewer"], "operator@loopback")
        self.assertNotEqual(resume_payload["state"]["current_step"], "approval_pending")
        self.assertEqual(detail_payload["run"]["run_id"], run_id)
