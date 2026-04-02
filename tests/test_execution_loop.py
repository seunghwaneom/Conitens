from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import ContextRegenerator
from ensemble_execution_loop import (
    DefaultSpecialistWorker,
    IterativeBuildLoop,
    TaskDelegationAdapter,
    ValidationResult,
    WorkerArtifact,
)
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_orchestration import BuildGraph, PlannerGraph
from ensemble_persona_memory import CandidatePatchWriter, MemoryRepository, write_memory_record_schema


class SequenceWorker(DefaultSpecialistWorker):
    def __init__(self, sequence):
        self.sequence = list(sequence)

    def execute(self, packet, assignment, *, run_id=None, iteration_id=None):
        payload = dict(self.sequence.pop(0))
        payload.setdefault("artifact_id", f"artifact-{run_id}-{iteration_id}")
        payload.setdefault("run_id", run_id)
        payload.setdefault("iteration_id", iteration_id)
        payload.setdefault("agent_id", packet["agent_id"])
        payload.setdefault("task", assignment["narrow_task"])
        payload.setdefault("summary", "sequence artifact")
        payload.setdefault("content", payload.get("summary", ""))
        payload.setdefault("skill_ids", assignment["skill_refs"])
        payload.setdefault("path", "")
        return payload


class ExecutionLoopTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, IterationService]:
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
        write_memory_record_schema(root)
        repo = LoopStateRepository(root)
        iterations = IterationService(repo)
        return root, repo, iterations

    def create_run_with_plan(self, root: Path, *, acceptance: list[str] | None = None) -> str:
        planner = PlannerGraph(root)
        state = planner.run("Implement one narrow task", owner="conitens-architect")
        repo = LoopStateRepository(root)
        plan = repo.get_task_plan(state.run_id)
        if acceptance is not None and plan is not None:
            repo.upsert_task_plan(
                run_id=state.run_id,
                current_plan=plan["current_plan"],
                objective=plan["objective"],
                steps=plan["steps_json"],
                acceptance_criteria=acceptance,
                owner=plan["owner"],
            )
        ContextRegenerator(repo).regenerate_all(state.run_id)
        return state.run_id

    def test_worker_executes_narrow_task(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root)
        iterations.append_iteration(run_id, "Initial build iteration")
        loop = IterativeBuildLoop(root)

        state = loop.run(run_id, agent_id="conitens-architect")

        self.assertEqual(state.current_step, "completed")
        self.assertIn("Executed narrow task", state.last_artifact["summary"])

    def test_validator_fail_triggers_retry_path(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root, acceptance=["artifact_contains:required-token"])
        iterations.append_iteration(run_id, "Retry iteration")
        worker = SequenceWorker([
            {"summary": "first try", "content": "missing token"},
            {"summary": "second try", "content": "required-token"},
        ])
        loop = IterativeBuildLoop(root, worker=worker)

        state = loop.run(run_id, agent_id="conitens-architect")

        self.assertEqual(state.retry_count, 1)
        self.assertEqual(state.current_step, "completed")
        self.assertEqual(repo.list_retry_decisions(run_id=run_id, graph_kind="build")[0]["decision"], "same_worker_retry")

    def test_retry_count_and_decision_persistence(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root, acceptance=["artifact_contains:required-token"])
        iterations.append_iteration(run_id, "Retry persistence")
        worker = SequenceWorker([
            {"summary": "first try", "content": "missing token"},
            {"summary": "second try", "content": "required-token"},
        ])
        build = BuildGraph(root)
        build.execution_loop = IterativeBuildLoop(root, worker=worker)

        state = build.run(run_id, agent_id="conitens-architect")
        checkpoint = repo.get_latest_orchestration_checkpoint(run_id=run_id, graph_kind="build")

        self.assertEqual(state.retry_count, 1)
        self.assertIsNotNone(checkpoint)
        self.assertEqual(checkpoint["retry_count"], 1)
        self.assertEqual(repo.list_retry_decisions(run_id=run_id, graph_kind="build")[0]["decision"], "same_worker_retry")

    def test_planner_revise_path_is_reachable(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root, acceptance=["artifact_contains:required-token"])
        iterations.append_iteration(run_id, "Planner revise path")
        worker = SequenceWorker([
            {"summary": "first try", "content": "missing token"},
            {"summary": "second try", "content": "still missing token"},
        ])
        loop = IterativeBuildLoop(root, worker=worker)

        state = loop.run(run_id, agent_id="conitens-architect")

        self.assertEqual(state.current_step, "planner_revise")
        self.assertEqual(repo.list_retry_decisions(run_id=run_id, graph_kind="build")[-1]["decision"], "planner_revise")

    def test_repeated_failures_escalate_without_setting_approval_pending(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root, acceptance=["artifact_contains:required-token"])
        iterations.append_iteration(run_id, "Escalation path")
        worker = SequenceWorker([
            {"summary": "first try", "content": "missing token"},
            {"summary": "second try", "content": "still missing token"},
            {"summary": "third try", "content": "again missing token"},
            {"summary": "fourth try", "content": "still failing token"},
        ])
        build = BuildGraph(root)
        build.execution_loop = IterativeBuildLoop(root, worker=worker)

        state_one = build.run(run_id, agent_id="conitens-architect")
        state_two = build.run(run_id, agent_id="conitens-architect")
        state_three = build.run(run_id, agent_id="conitens-architect")

        self.assertEqual(state_one.current_step, "planner_revise")
        self.assertEqual(state_one.retry_count, 2)
        self.assertEqual(state_two.current_step, "specialist_swap")
        self.assertEqual(state_two.retry_count, 3)
        self.assertEqual(state_three.current_step, "human_escalation")
        self.assertEqual(state_three.stop_reason, "escalated")
        self.assertFalse(state_three.approval_pending)
        decisions = [item["decision"] for item in repo.list_retry_decisions(run_id=run_id, graph_kind="build")]
        self.assertEqual(decisions, ["same_worker_retry", "planner_revise", "specialist_swap", "human_escalation"])

    def test_candidate_patch_creation_excludes_identity_edits(self) -> None:
        root, repo, iterations = self.prepare_workspace()
        run_id = self.create_run_with_plan(root, acceptance=["artifact_contains:required-token"])
        iterations.append_iteration(run_id, "Patch creation")
        worker = SequenceWorker([
            {"summary": "first try", "content": "missing token"},
            {"summary": "second try", "content": "still missing token"},
        ])
        loop = IterativeBuildLoop(root, worker=worker)

        state = loop.run(run_id, agent_id="conitens-architect")
        patches = CandidatePatchWriter(root).list_patches(agent_id="conitens-architect", namespace="conitens-architect", include_unapproved=True)

        self.assertEqual(state.current_step, "planner_revise")
        self.assertEqual(len(patches), 2)
        patch_text = Path(patches[-1]["file_path"]).read_text(encoding="utf-8")
        self.assertNotIn("public_persona", patch_text)
        self.assertNotIn("display_name", patch_text)
        self.assertNotIn("private_policy", patch_text)

    def test_task_delegation_uses_skill_metadata_only(self) -> None:
        root, _repo, _iterations = self.prepare_workspace()
        adapter = TaskDelegationAdapter(root)
        packet = {
            "agent_id": "conitens-architect",
            "objective": "Implement one narrow task",
            "current_step": "Current step",
        }

        with patch(
            "ensemble_execution_loop.resolve_persona_default_skills",
            return_value=[
                {
                    "skill_id": "conitens-core",
                    "name": "conitens-core",
                    "description": "core",
                    "tools": [{"id": "task.create", "mode": "write"}],
                }
            ],
        ):
            assignment = adapter.prepare(packet=packet)

        self.assertEqual(assignment["skill_refs"], ["conitens-core"])
        self.assertEqual(assignment["narrow_task"], "Current step")


if __name__ == "__main__":
    unittest.main()
