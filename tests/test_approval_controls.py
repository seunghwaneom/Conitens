from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import ContextRegenerator, FindingsAppendService
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_orchestration import BuildGraph, PlannerGraph
from ensemble_persona_memory import write_memory_record_schema


class RiskyWorker:
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


class ApprovalControlTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository]:
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
        return root, repo

    def create_run(self, root: Path, repo: LoopStateRepository) -> str:
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
        return state.run_id

    def test_risky_action_requires_approval(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()

        state = build.run(run_id, agent_id="conitens-architect")
        request = build.approvals.latest_request(run_id=run_id)

        self.assertTrue(state.approval_pending)
        self.assertEqual(state.current_step, "approval_pending")
        self.assertIsNotNone(request)
        self.assertEqual(request["status"], "pending")
        self.assertEqual(request["action_type"], "shell_execution")

    def test_execution_pauses_correctly(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()

        state = build.run(run_id, agent_id="conitens-architect")

        self.assertTrue(state.approval_pending)
        self.assertEqual(state.current_step, "approval_pending")
        self.assertIsNotNone(state.pending_approval_request_id)

    def test_approval_resumes_execution(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None

        build.approvals.decide(
            request_id=request_id,
            status="approved",
            reviewer="owner",
            reviewer_note="approved",
        )
        resumed = build.resume_after_approval(run_id)

        self.assertFalse(resumed.approval_pending)
        self.assertEqual(resumed.current_step, "completed")
        request = build.approvals.latest_request(run_id=run_id)
        self.assertEqual(request["status"], "approved")
        self.assertEqual(resumed.pending_approval_request_id, None)
        self.assertEqual(resumed.validator_issues, [])

    def test_rejection_records_feedback(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None

        build.approvals.decide(
            request_id=request_id,
            status="rejected",
            reviewer="owner",
            reviewer_note="too risky",
        )
        resumed = build.resume_after_approval(run_id)
        findings = FindingsAppendService(repo).list_entries(run_id)

        self.assertEqual(resumed.current_step, "rejected")
        self.assertEqual(resumed.stop_reason, "rejected")
        self.assertTrue(any("too risky" in item["summary"] for item in findings))
        latest_validator = repo.list_validator_results(run_id)[-1]
        self.assertFalse(latest_validator["passed"])
        self.assertIn("too risky", latest_validator["feedback_text"])

    def test_audit_trail_is_persisted(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None
        build.approvals.decide(
            request_id=request_id,
            status="rejected",
            reviewer="owner",
            reviewer_note="too risky",
        )
        request = build.approvals.latest_request(run_id=run_id)
        event_file = root / ".notes" / "events" / "events.jsonl"
        event_text = event_file.read_text(encoding="utf-8")

        self.assertEqual(request["reviewer"], "owner")
        self.assertEqual(request["status"], "rejected")
        self.assertIn("approval.requested", event_text)
        self.assertIn("approval.denied", event_text)

    def test_resume_uses_pending_request_id_not_latest_request(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None

        build.approvals.enqueue_request(
            run_id=run_id,
            iteration_id=repo.list_iterations(run_id)[-1]["iteration_id"],
            actor="conitens-architect",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        build.approvals.decide(
            request_id=request_id,
            status="approved",
            reviewer="owner",
            reviewer_note="approve original request only",
        )
        resumed = build.resume_after_approval(run_id)
        all_requests = repo.list_approval_requests(run_id=run_id)

        self.assertEqual(resumed.current_step, "completed")
        self.assertTrue(
            any(item["request_id"] == request_id and item["status"] == "approved" for item in all_requests)
        )
        self.assertTrue(
            any(item["action_type"] == "network_access" and item["status"] == "pending" for item in all_requests)
        )

    def test_policy_can_auto_allow_action(self) -> None:
        root, repo = self.prepare_workspace()
        policy_path = root / ".agent" / "policies" / "approval_actions.yaml"
        policy_path.write_text(
            "\n".join(
                [
                    "schema_v: 1",
                    "actions:",
                    "  - action_type: shell_execution",
                    "    risk_level: medium",
                    "    approval_required: false",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()

        state = build.run(run_id, agent_id="conitens-architect")

        self.assertFalse(state.approval_pending)
        self.assertEqual(state.current_step, "completed")
        self.assertEqual(build.approvals.latest_request(run_id=run_id), None)

    def test_edited_payload_is_used_on_resume(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None

        build.approvals.decide(
            request_id=request_id,
            status="edited",
            reviewer="owner",
            reviewer_note="use safer command",
            edited_payload={"command": "echo safer"},
        )
        resumed = build.resume_after_approval(run_id)

        self.assertEqual(resumed.current_step, "completed")
        self.assertIn("echo safer", resumed.last_artifact["summary"])

    def test_approval_decision_is_immutable_after_resolution(self) -> None:
        root, repo = self.prepare_workspace()
        run_id = self.create_run(root, repo)
        build = BuildGraph(root)
        build.execution_loop.worker = RiskyWorker()
        state = build.run(run_id, agent_id="conitens-architect")
        request_id = state.pending_approval_request_id
        assert request_id is not None

        build.approvals.decide(
            request_id=request_id,
            status="approved",
            reviewer="owner",
            reviewer_note="approved",
        )

        with self.assertRaises(ValueError):
            build.approvals.decide(
                request_id=request_id,
                status="rejected",
                reviewer="owner",
                reviewer_note="changed mind",
            )

    def test_unknown_action_uses_default_review_policy(self) -> None:
        root, repo = self.prepare_workspace()
        build = BuildGraph(root)
        classification = build.approvals.classify("unknown_action", {"value": "x"})

        self.assertTrue(classification["requires_approval"])
        self.assertEqual(classification["risk_level"], "low")


if __name__ == "__main__":
    unittest.main()
