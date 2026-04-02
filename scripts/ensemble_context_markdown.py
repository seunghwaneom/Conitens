#!/usr/bin/env python3
"""
Batch 2 markdown runtime artifacts backed by persisted state.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from ensemble_loop_repository import FINDING_CATEGORIES, LoopStateRepository


CONTEXT_DIRNAME = ".conitens/context"
TASK_PLAN_FILENAME = "task_plan.md"
FINDINGS_FILENAME = "findings.md"
PROGRESS_FILENAME = "progress.md"
LATEST_CONTEXT_FILENAME = "LATEST_CONTEXT.md"


MANUAL_NOTES_HEADING = "## Manual Notes"
CATEGORY_HEADINGS = {
    "discovery": "## Discoveries",
    "constraint": "## Constraints",
    "failed_hypothesis": "## Failed Hypotheses",
    "validation_issue": "## Validation Issues",
    "dependency_note": "## Dependency Notes",
}
TERMINAL_STEP_STATUSES = {"completed", "done", "cancelled", "skipped"}
BLOCKER_CATEGORIES = {"constraint", "failed_hypothesis", "validation_issue", "dependency_note"}
DECISION_CATEGORIES = {"discovery", "failed_hypothesis"}


def context_root(workspace: str | Path) -> Path:
    path = Path(workspace) / CONTEXT_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def task_plan_path(workspace: str | Path) -> Path:
    return context_root(workspace) / TASK_PLAN_FILENAME


def findings_path(workspace: str | Path) -> Path:
    return context_root(workspace) / FINDINGS_FILENAME


def progress_path(workspace: str | Path) -> Path:
    return context_root(workspace) / PROGRESS_FILENAME


def latest_context_path(workspace: str | Path) -> Path:
    return context_root(workspace) / LATEST_CONTEXT_FILENAME


def _extract_manual_notes(path: Path) -> str | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    marker = f"\n{MANUAL_NOTES_HEADING}\n"
    if marker in text:
        return text.split(marker, 1)[1].rstrip()
    if text.startswith(f"{MANUAL_NOTES_HEADING}\n"):
        return text[len(MANUAL_NOTES_HEADING) + 1 :].rstrip()
    return None


def _render_manual_notes(notes: str | None) -> str:
    if not notes:
        return ""
    return f"\n\n{MANUAL_NOTES_HEADING}\n\n{notes.strip()}\n"


class TaskPlanWriterReader:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def update_from_structured_input(
        self,
        *,
        run_id: str,
        current_plan: str,
        objective: str,
        steps: list[dict[str, Any]],
        acceptance_criteria: list[str] | None = None,
        owner: str | None = None,
    ) -> dict[str, Any]:
        record = self.repository.upsert_task_plan(
            run_id=run_id,
            current_plan=current_plan,
            objective=objective,
            steps=steps,
            acceptance_criteria=acceptance_criteria or [],
            owner=owner,
        )
        self.write(run_id)
        return record

    def read(self, run_id: str | None = None) -> dict[str, Any] | None:
        target_run_id = self._resolve_run_id(run_id)
        if target_run_id is None:
            return None
        record = self.repository.get_task_plan(target_run_id)
        if record is None:
            return None
        return {
            "path": str(task_plan_path(self.repository.workspace)),
            "state": record,
            "markdown": task_plan_path(self.repository.workspace).read_text(encoding="utf-8")
            if task_plan_path(self.repository.workspace).exists()
            else "",
        }

    def write(self, run_id: str | None = None) -> Path:
        target_run_id = self._resolve_run_id(run_id)
        path = task_plan_path(self.repository.workspace)
        if target_run_id is None:
            path.write_text("# task_plan.md\n\n_No active plan._\n", encoding="utf-8")
            return path
        record = self.repository.get_task_plan(target_run_id)
        if record is None:
            path.write_text("# task_plan.md\n\n_No active plan._\n", encoding="utf-8")
            return path
        manual_notes = _extract_manual_notes(path)
        path.write_text(self.render(record, manual_notes=manual_notes), encoding="utf-8")
        return path

    def render(self, record: dict[str, Any], *, manual_notes: str | None = None) -> str:
        steps = list(record.get("steps_json", []))
        acceptance = list(record.get("acceptance_json", []))
        lines = [
            "# task_plan.md",
            "",
            "## Current Plan",
            "",
            f"- Run: `{record['run_id']}`",
            f"- Plan: {record['current_plan']}",
            f"- Objective: {record['objective']}",
            f"- Owner: `{record['owner']}`" if record.get("owner") else "- Owner: _unassigned_",
            f"- Updated: `{record['updated_at']}`",
            "",
            "## Steps",
            "",
        ]
        if not steps:
            lines.append("_No steps defined._")
        else:
            for index, step in enumerate(steps, start=1):
                status = step.get("status", "pending")
                title = step.get("title", "").strip() or f"Step {index}"
                lines.append(f"{index}. [{status}] {title}")
                if step.get("owner"):
                    lines.append(f"Owner: `{step['owner']}`")
                step_acceptance = step.get("acceptance_criteria") or step.get("acceptance") or []
                if step_acceptance:
                    lines.append("Acceptance:")
                    for item in step_acceptance:
                        lines.append(f"- {item}")
                if step.get("notes"):
                    lines.append(f"Notes: {step['notes']}")
                lines.append("")
        lines.extend(["## Acceptance Criteria", ""])
        if acceptance:
            lines.extend(f"- {item}" for item in acceptance)
        else:
            lines.append("_None recorded._")
        return "\n".join(lines).rstrip() + _render_manual_notes(manual_notes)

    def _resolve_run_id(self, run_id: str | None) -> str | None:
        if run_id:
            return run_id
        active = self.repository.get_latest_active_run()
        if active:
            return active["run_id"]
        recent = self.repository.get_most_recent_run()
        return recent["run_id"] if recent else None


class FindingsAppendService:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def append_entry(
        self,
        *,
        run_id: str,
        iteration_id: str | None,
        category: str,
        actor: str | None,
        summary: str,
        details: str | None = None,
    ) -> dict[str, Any]:
        entry = self.repository.append_finding(
            run_id=run_id,
            iteration_id=iteration_id,
            category=category,
            actor=actor,
            summary=summary,
            details=details,
        )
        self.write(run_id)
        return entry

    def list_entries(self, run_id: str) -> list[dict[str, Any]]:
        return self.repository.list_findings(run_id)

    def write(self, run_id: str | None = None) -> Path:
        target_run_id = self._resolve_run_id(run_id)
        path = findings_path(self.repository.workspace)
        manual_notes = _extract_manual_notes(path)
        if target_run_id is None:
            path.write_text("# findings.md\n\n_No findings recorded._\n", encoding="utf-8")
            return path
        path.write_text(self.render(target_run_id, manual_notes=manual_notes), encoding="utf-8")
        return path

    def render(self, run_id: str, *, manual_notes: str | None = None) -> str:
        entries = self.repository.list_findings(run_id)
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for entry in entries:
            grouped[entry["category"]].append(entry)
        lines = ["# findings.md", "", f"## Run", "", f"- `{run_id}`", ""]
        if not entries:
            lines.append("_No findings recorded._")
        else:
            for category in FINDING_CATEGORIES:
                lines.extend([CATEGORY_HEADINGS[category], ""])
                category_entries = grouped.get(category, [])
                if not category_entries:
                    lines.append("_None recorded._")
                    lines.append("")
                    continue
                for entry in category_entries:
                    lines.append(f"### `{entry['created_at']}`")
                    lines.append(f"- Iteration: `{entry['iteration_id']}`" if entry["iteration_id"] else "- Iteration: _n/a_")
                    lines.append(f"- Actor: `{entry['actor']}`" if entry["actor"] else "- Actor: _unknown_")
                    lines.append(f"- Summary: {entry['summary']}")
                    if entry.get("details"):
                        lines.append(f"- Details: {entry['details']}")
                    lines.append("")
        return "\n".join(lines).rstrip() + _render_manual_notes(manual_notes)

    def _resolve_run_id(self, run_id: str | None) -> str | None:
        if run_id:
            return run_id
        active = self.repository.get_latest_active_run()
        if active:
            return active["run_id"]
        recent = self.repository.get_most_recent_run()
        return recent["run_id"] if recent else None


class ProgressAppendOnlyService:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def append_entry(
        self,
        *,
        run_id: str,
        iteration_id: str,
        actor: str,
        summary: str,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        path = progress_path(self.repository.workspace)
        existing_entries = self.repository.list_progress_entries(run_id)
        expected_prefix = self.render_entries(existing_entries, run_id=run_id)
        if path.exists():
            current = path.read_text(encoding="utf-8")
            if current != expected_prefix:
                raise ValueError("progress.md has been modified outside append-only rules; regenerate before appending")
        entry = self.repository.append_progress_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor=actor,
            summary=summary,
            created_at=created_at,
        )
        entry_block = self._render_entry(entry)
        if path.exists() and path.read_text(encoding="utf-8"):
            with path.open("a", encoding="utf-8") as handle:
                handle.write(entry_block)
        else:
            path.write_text(self.render_entries([entry], run_id=run_id), encoding="utf-8")
        return entry

    def list_entries(self, run_id: str) -> list[dict[str, Any]]:
        return self.repository.list_progress_entries(run_id)

    def regenerate(self, run_id: str | None = None) -> Path:
        target_run_id = self._resolve_run_id(run_id)
        path = progress_path(self.repository.workspace)
        if target_run_id is None:
            path.write_text("# progress.md\n\n_No progress entries recorded._\n", encoding="utf-8")
            return path
        entries = self.repository.list_progress_entries(target_run_id)
        path.write_text(self.render_entries(entries, run_id=target_run_id), encoding="utf-8")
        return path

    def render_entries(self, entries: list[dict[str, Any]], *, run_id: str) -> str:
        lines = ["# progress.md", "", "## Append-Only Log", "", f"- Run: `{run_id}`", ""]
        if not entries:
            lines.append("_No progress entries recorded._")
            return "\n".join(lines).rstrip() + "\n"
        lines.append("---")
        for entry in entries:
            lines.append("")
            lines.extend(self._render_entry(entry).rstrip().splitlines())
        return "\n".join(lines).rstrip() + "\n"

    def _render_entry(self, entry: dict[str, Any]) -> str:
        lines = [
            f"### `{entry['created_at']}`",
            f"- Run: `{entry['run_id']}`",
            f"- Iteration: `{entry['iteration_id']}`",
            f"- Actor: `{entry['actor']}`",
            f"- Summary: {entry['summary']}",
            "",
        ]
        return "\n".join(lines)

    def _resolve_run_id(self, run_id: str | None) -> str | None:
        if run_id:
            return run_id
        active = self.repository.get_latest_active_run()
        if active:
            return active["run_id"]
        recent = self.repository.get_most_recent_run()
        return recent["run_id"] if recent else None


class LatestContextSkeletonGenerator:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def write(self, run_id: str | None = None) -> Path:
        target_run_id = self._resolve_run_id(run_id)
        path = latest_context_path(self.repository.workspace)
        manual_notes = _extract_manual_notes(path)
        path.write_text(self.render(target_run_id, manual_notes=manual_notes), encoding="utf-8")
        return path

    def render(self, run_id: str | None, *, manual_notes: str | None = None) -> str:
        if run_id is None:
            return "# LATEST_CONTEXT.md\n\n_No active runtime context._\n"
        snapshot = self.repository.load_run_snapshot(run_id)
        plan = snapshot.get("task_plan")
        findings = snapshot.get("findings", [])
        progress_entries = snapshot.get("progress_entries", [])
        objective = plan["objective"] if plan else snapshot["run"]["user_request"]
        active_step = self._derive_active_step(plan)
        blockers = self._derive_blockers(findings)
        latest_decisions = self._derive_latest_decisions(findings, progress_entries)
        next_actions = self._derive_next_actions(plan)
        lines = [
            "# LATEST_CONTEXT.md",
            "",
            "Read this file before substantial work.",
            "",
            "## Current Objective",
            "",
            f"- {objective}",
            "",
            "## Active Step",
            "",
            f"- {active_step if active_step else '_No active step_'}",
            "",
            "## Current Blockers",
            "",
        ]
        if blockers:
            lines.extend(f"- {item}" for item in blockers)
        else:
            lines.append("- _No blockers recorded_")
        lines.extend(["", "## Latest Decisions", ""])
        if latest_decisions:
            lines.extend(f"- {item}" for item in latest_decisions)
        else:
            lines.append("- _No decisions recorded_")
        lines.extend(["", "## Next Actions", ""])
        if next_actions:
            lines.extend(f"- {item}" for item in next_actions)
        else:
            lines.append("- _No next actions recorded_")
        return "\n".join(lines).rstrip() + _render_manual_notes(manual_notes)

    def _derive_active_step(self, plan: dict[str, Any] | None) -> str | None:
        if not plan:
            return None
        for step in plan.get("steps_json", []):
            status = str(step.get("status", "pending")).lower()
            if status not in TERMINAL_STEP_STATUSES:
                return step.get("title") or None
        return None

    def _derive_blockers(self, findings: list[dict[str, Any]]) -> list[str]:
        blockers = [
            entry["summary"]
            for entry in findings
            if entry["category"] in BLOCKER_CATEGORIES
        ]
        return blockers[-3:]

    def _derive_latest_decisions(
        self,
        findings: list[dict[str, Any]],
        progress_entries: list[dict[str, Any]],
    ) -> list[str]:
        decisions = [
            entry["summary"]
            for entry in findings
            if entry["category"] in DECISION_CATEGORIES
        ]
        if decisions:
            return decisions[-3:]
        return [entry["summary"] for entry in progress_entries[-2:]]

    def _derive_next_actions(self, plan: dict[str, Any] | None) -> list[str]:
        if not plan:
            return []
        items = []
        for step in plan.get("steps_json", []):
            status = str(step.get("status", "pending")).lower()
            if status not in TERMINAL_STEP_STATUSES:
                items.append(step.get("title", ""))
        return [item for item in items[:3] if item]

    def _resolve_run_id(self, run_id: str | None) -> str | None:
        if run_id:
            return run_id
        active = self.repository.get_latest_active_run()
        if active:
            return active["run_id"]
        recent = self.repository.get_most_recent_run()
        return recent["run_id"] if recent else None


class ContextRegenerator:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository
        self.task_plan = TaskPlanWriterReader(repository)
        self.findings = FindingsAppendService(repository)
        self.progress = ProgressAppendOnlyService(repository)
        self.latest_context = LatestContextSkeletonGenerator(repository)

    def regenerate_all(self, run_id: str | None = None) -> dict[str, str]:
        task_path = self.task_plan.write(run_id)
        findings_path_value = self.findings.write(run_id)
        progress_path_value = self.progress.regenerate(run_id)
        latest_context_path_value = self.latest_context.write(run_id)
        return {
            "task_plan": str(task_path),
            "findings": str(findings_path_value),
            "progress": str(progress_path_value),
            "latest_context": str(latest_context_path_value),
        }


__all__ = [
    "ContextRegenerator",
    "FindingsAppendService",
    "LatestContextSkeletonGenerator",
    "ProgressAppendOnlyService",
    "TaskPlanWriterReader",
]
