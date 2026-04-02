from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_markdown import (
    ContextRegenerator,
    FindingsAppendService,
    LatestContextSkeletonGenerator,
    ProgressAppendOnlyService,
    TaskPlanWriterReader,
)
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_run_service import RunService


def task_plan_path(workspace: Path) -> Path:
    return workspace / ".conitens" / "context" / "task_plan.md"


def findings_path(workspace: Path) -> Path:
    return workspace / ".conitens" / "context" / "findings.md"


def progress_path(workspace: Path) -> Path:
    return workspace / ".conitens" / "context" / "progress.md"


def latest_context_path(workspace: Path) -> Path:
    return workspace / ".conitens" / "context" / "LATEST_CONTEXT.md"


class ContextMarkdownTests(unittest.TestCase):
    def prepare_runtime(self) -> tuple[Path, LoopStateRepository, RunService, IterationService]:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        workspace = Path(temp_dir.name)
        repository = LoopStateRepository(workspace)
        runs = RunService(repository)
        iterations = IterationService(repository)
        return workspace, repository, runs, iterations

    def test_deterministic_task_plan_generation(self) -> None:
        workspace, repository, runs, _iterations = self.prepare_runtime()
        run = runs.create_run(user_request="Batch 2 task plan")
        service = TaskPlanWriterReader(repository)
        structured = {
            "run_id": run["run_id"],
            "current_plan": "Batch 2 markdown runtime artifacts",
            "objective": "Make context markdown files first-class runtime state",
            "owner": "CLI",
            "acceptance_criteria": ["markdown writers exist", "progress remains append-only"],
            "steps": [
                {"title": "Map persisted state to markdown", "status": "completed"},
                {"title": "Implement deterministic renderers", "status": "in_progress"},
            ],
        }

        service.update_from_structured_input(**structured)
        first = task_plan_path(workspace).read_text(encoding="utf-8")
        service.update_from_structured_input(**structured)
        second = task_plan_path(workspace).read_text(encoding="utf-8")

        self.assertEqual(first, second)
        self.assertIn("Batch 2 markdown runtime artifacts", first)
        self.assertIn("[in_progress] Implement deterministic renderers", first)

    def test_findings_append_and_grouped_render(self) -> None:
        workspace, repository, runs, iterations = self.prepare_runtime()
        run = runs.create_run(user_request="Batch 2 findings")
        iteration = iterations.append_iteration(run_id=run["run_id"], objective="Inspect context state")
        service = FindingsAppendService(repository)

        service.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            category="constraint",
            actor="CLI",
            summary="Progress must remain append-only",
        )
        service.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            category="discovery",
            actor="CLI",
            summary="LATEST_CONTEXT can be derived from persisted state",
        )

        content = findings_path(workspace).read_text(encoding="utf-8")
        self.assertIn("## Constraints", content)
        self.assertIn("## Discoveries", content)
        self.assertIn("Progress must remain append-only", content)

    def test_progress_append_only_rejects_overwrite(self) -> None:
        workspace, repository, runs, iterations = self.prepare_runtime()
        run = runs.create_run(user_request="Batch 2 progress")
        iteration = iterations.append_iteration(run_id=run["run_id"], objective="Append progress once")
        progress = ProgressAppendOnlyService(repository)

        progress.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            actor="CLI",
            summary="Started markdown runtime layer",
        )
        file_path = progress_path(workspace)
        file_path.write_text("# progress.md\n\ncorrupted\n", encoding="utf-8")

        with self.assertRaises(ValueError):
            progress.append_entry(
                run_id=run["run_id"],
                iteration_id=iteration["iteration_id"],
                actor="CLI",
                summary="This should fail",
            )

    def test_regenerate_latest_context_from_persisted_state(self) -> None:
        workspace, repository, runs, iterations = self.prepare_runtime()
        run = runs.create_run(user_request="Batch 2 latest context")
        iteration = iterations.append_iteration(run_id=run["run_id"], objective="Generate digest")
        plan = TaskPlanWriterReader(repository)
        findings = FindingsAppendService(repository)
        progress = ProgressAppendOnlyService(repository)
        latest = LatestContextSkeletonGenerator(repository)

        plan.update_from_structured_input(
            run_id=run["run_id"],
            current_plan="Generate context digest",
            objective="Summarize current objective and next actions",
            steps=[
                {"title": "Write markdown services", "status": "completed"},
                {"title": "Regenerate LATEST_CONTEXT", "status": "in_progress"},
            ],
            acceptance_criteria=["LATEST_CONTEXT is compact"],
            owner="CLI",
        )
        findings.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            category="constraint",
            actor="CLI",
            summary="Do not pull in .vibe intelligence yet",
        )
        findings.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            category="discovery",
            actor="CLI",
            summary="Decision: derive active step from the first non-terminal step",
        )
        progress.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            actor="CLI",
            summary="Implemented the compact digest skeleton",
        )

        latest.write(run["run_id"])
        content = latest_context_path(workspace).read_text(encoding="utf-8")

        self.assertIn("## Current Objective", content)
        self.assertIn("Regenerate LATEST_CONTEXT", content)
        self.assertIn("Do not pull in .vibe intelligence yet", content)
        self.assertIn("Decision: derive active step", content)

    def test_repeated_regeneration_is_consistent(self) -> None:
        workspace, repository, runs, iterations = self.prepare_runtime()
        run = runs.create_run(user_request="Batch 2 repeat regenerate")
        iteration = iterations.append_iteration(run_id=run["run_id"], objective="Repeat regeneration")
        plan = TaskPlanWriterReader(repository)
        findings = FindingsAppendService(repository)
        progress = ProgressAppendOnlyService(repository)
        regenerator = ContextRegenerator(repository)

        plan.update_from_structured_input(
            run_id=run["run_id"],
            current_plan="Repeatable markdown rendering",
            objective="Prove repeated regenerate is stable",
            steps=[{"title": "Run regenerate twice", "status": "in_progress"}],
            acceptance_criteria=["Outputs match between runs"],
            owner="CLI",
        )
        findings.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            category="dependency_note",
            actor="CLI",
            summary="Context files depend on persisted run state",
        )
        progress.append_entry(
            run_id=run["run_id"],
            iteration_id=iteration["iteration_id"],
            actor="CLI",
            summary="First regeneration completed",
        )

        regenerator.regenerate_all(run["run_id"])
        first = {
            "task": task_plan_path(workspace).read_text(encoding="utf-8"),
            "findings": findings_path(workspace).read_text(encoding="utf-8"),
            "progress": progress_path(workspace).read_text(encoding="utf-8"),
            "latest": latest_context_path(workspace).read_text(encoding="utf-8"),
        }
        regenerator.regenerate_all(run["run_id"])
        second = {
            "task": task_plan_path(workspace).read_text(encoding="utf-8"),
            "findings": findings_path(workspace).read_text(encoding="utf-8"),
            "progress": progress_path(workspace).read_text(encoding="utf-8"),
            "latest": latest_context_path(workspace).read_text(encoding="utf-8"),
        }

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
