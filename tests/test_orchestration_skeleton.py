from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_orchestration import BuildGraph, PlannerGraph, SQLiteCheckpointer
from ensemble_loop_repository import LoopStateRepository
from ensemble_persona_memory import write_memory_record_schema


class OrchestrationSkeletonTests(unittest.TestCase):
    def prepare_workspace(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".conitens" / "personas" / "sample-agent.yaml").write_text(
            "\n".join(
                [
                    "id: sample-agent",
                    "display_name: Sample Agent",
                    "role: builder",
                    "public_persona: calm and direct",
                    "private_policy:",
                    "  identity_core_locked: true",
                    "expertise_tags:",
                    "  - runtime",
                    "default_skill_refs:",
                    "  - conitens-core",
                    "memory_namespace: sample-namespace",
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
        return root

    def test_planner_graph_initializes_task_plan(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)

        state = planner.run("Plan a single iteration task", owner="sample-agent")
        repo = LoopStateRepository(root)
        plan = repo.get_task_plan(state.run_id)

        self.assertIsNotNone(plan)
        self.assertEqual(plan["objective"], "Plan a single iteration task")

    def test_build_graph_loads_current_step(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Build the current step", owner="sample-agent")
        build = BuildGraph(root)

        current_step = build.load_current_step(state.run_id)

        self.assertEqual(current_step, "Build the current step")

    def test_one_task_per_iteration_rule_is_enforced(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Only one task", owner="sample-agent")
        repo = LoopStateRepository(root)
        plan = repo.get_task_plan(state.run_id)
        plan["steps_json"] = [
            {"title": "First active task", "status": "pending"},
            {"title": "Second active task", "status": "pending"},
        ]
        repo.upsert_task_plan(
            run_id=state.run_id,
            current_plan=plan["current_plan"],
            objective=plan["objective"],
            steps=plan["steps_json"],
            acceptance_criteria=plan["acceptance_json"],
            owner=plan["owner"],
        )

        build = BuildGraph(root)
        with self.assertRaises(ValueError):
            build.load_current_step(state.run_id)

    def test_checkpoint_resume_works(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Checkpoint me", owner="sample-agent")
        checkpointer = SQLiteCheckpointer(LoopStateRepository(root))

        restored = checkpointer.load(run_id=state.run_id, graph_kind="planner")

        self.assertIsNotNone(restored)
        assert restored is not None
        self.assertEqual(restored.objective, "Checkpoint me")

    def test_retry_count_persists(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Retry flow", owner="sample-agent")
        build = BuildGraph(root)
        build.run(state.run_id, agent_id="sample-agent")
        retried = build.record_retry(state.run_id, reason="validator failed")
        resumed = build.resume(state.run_id)

        self.assertEqual(retried.retry_count, 1)
        assert resumed is not None
        self.assertEqual(resumed.retry_count, 1)


if __name__ == "__main__":
    unittest.main()
