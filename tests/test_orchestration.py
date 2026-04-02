from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import ContextRegenerator
from ensemble_orchestration import BuildGraph, LANGGRAPH_AVAILABLE, LocalOrchestrationRuntime, PlannerGraph
from ensemble_persona_memory import MemoryRepository


class OrchestrationTests(unittest.TestCase):
    def prepare_workspace(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST_CONTEXT\n\nrepo digest\n", encoding="utf-8")
        (root / ".agents" / "skills" / "conitens-core").mkdir(parents=True, exist_ok=True)
        (root / ".agents" / "skills" / "conitens-core" / "SKILL.md").write_text(
            "---\nschema_v: 1\nskill_id: conitens-core\nname: conitens-core\ndescription: \"core\"\ntools:\n  - id: task.create\n    mode: write\n---\n\n# core\n",
            encoding="utf-8",
        )
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
        MemoryRepository(root)  # ensure schema pieces needed by the assembler exist
        return root

    def test_planner_graph_initializes_task_plan(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Plan a single orchestration task")
        latest = planner.task_plan.read(state.run_id)
        self.assertIsNotNone(latest)
        assert latest is not None
        self.assertEqual(latest["state"]["objective"], "Plan a single orchestration task")

    def test_build_graph_loads_current_step(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Build one step only")
        build = BuildGraph(root)
        self.assertEqual(build.load_current_step(state.run_id), "Build one step only")

    def test_one_task_per_iteration_rule_is_enforced(self) -> None:
        root = self.prepare_workspace()
        planner = PlannerGraph(root)
        state = planner.run("Only one task should be active")
        latest = planner.task_plan.read(state.run_id)
        assert latest is not None
        self.assertEqual(len(latest["state"]["steps_json"]), 1)

    def test_checkpoint_resume_works(self) -> None:
        root = self.prepare_workspace()
        runtime = LocalOrchestrationRuntime(root)
        state = runtime.run_planner("Resume planner state")
        restored = runtime.resume(state.run_id, "planner")
        self.assertIsNotNone(restored)
        assert restored is not None
        self.assertEqual(restored.run_id, state.run_id)

    def test_retry_count_persists(self) -> None:
        root = self.prepare_workspace()
        runtime = LocalOrchestrationRuntime(root)
        planned = runtime.run_planner("Retry build step")
        ContextRegenerator(runtime.planner.repository).regenerate_all(planned.run_id)
        build = BuildGraph(root)
        build.run(planned.run_id, agent_id="conitens-architect")
        retried = build.record_retry(planned.run_id, reason="validator failure")
        restored = runtime.resume(planned.run_id, "build")
        assert restored is not None
        self.assertEqual(retried.retry_count, 1)
        self.assertEqual(restored.retry_count, 1)

    def test_langgraph_is_not_available_in_repo_surface(self) -> None:
        self.assertFalse(LANGGRAPH_AVAILABLE)


if __name__ == "__main__":
    unittest.main()
