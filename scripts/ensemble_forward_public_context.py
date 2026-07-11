from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Final, TypedDict

from ensemble_loop_paths import findings_path, latest_context_path, progress_path, task_plan_path
from ensemble_loop_repository import ReadOnlyLoopStateRepository as LoopStateRepository


PUBLIC_ITEM_LIMIT: Final = 6
PUBLIC_TEXT_CHAR_LIMIT: Final = 180
PUBLIC_CODE_CHAR_LIMIT: Final = 40
BLOCKER_CATEGORIES: Final = frozenset({"validation_issue", "blocker", "risk"})
SAFE_STATUS_VALUES: Final = frozenset(
    {
        "pending",
        "planned",
        "in_progress",
        "running",
        "review",
        "blocked",
        "complete",
        "completed",
        "done",
        "failed",
    }
)
PUBLIC_PLACEHOLDER: Final = "[redacted]"

UNSAFE_PATTERNS: Final = (
    re.compile(r"\b(raw[_ -]?(body|prompt|transcript|request|response|stdout|stderr|log|diff|patch|comment))\b", re.I),
    re.compile(r"\b(prompt|transcript|stdout|stderr|request|response|body|token|secret|password|api[_-]?key)\s*[:=]", re.I),
    re.compile(r"\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b"),
    re.compile(r"[A-Za-z]:\\(?:Users\\|[^\s`\"']+\\)[^\s`\"']*", re.I),
    re.compile(r"[A-Za-z]:/(?:Users/|[^\s`\"']+/)[^\s`\"']*", re.I),
    re.compile(
        r"(?:^|[\s`\"'])/(?:home|Users|var|tmp|etc|mnt|Volumes|opt|srv|root|data|workspace|workspaces|project|projects|usr|bin|sbin|lib|lib64|boot|dev|proc|sys|run|media)/[^\s`\"']+",
        re.I,
    ),
    re.compile(r"\b[A-Za-z][A-Za-z0-9+.-]*://[^/\s:@]+:[^@\s/]+@", re.I),
    re.compile(r"(?:^|[\s`\"'])/(?!/)[^\s`\"']+", re.I),
    re.compile(r"(?:^|[\s`\"'])(?:\\\\|//)[^\s`\"']+", re.I),
    re.compile(r"\bauthorization\s*:\s*bearer\s+\S+", re.I),
    re.compile(r"\baws_(?:access_key_id|secret_access_key|session_token)\s*[:=]\s*\S+", re.I),
)


class PublicEnvelope(TypedDict):
    path: str
    content: str | None


class PublicStateDocsPayload(TypedDict):
    run_id: str
    documents: dict[str, PublicEnvelope]


class PublicContextLatestPayload(TypedDict):
    run_id: str
    runtime_latest: PublicEnvelope
    repo_latest: None


class PublicWorkspaceContextLatestPayload(TypedDict):
    mode: str
    runtime_latest: PublicEnvelope
    repo_latest: None


def build_public_state_docs_payload(workspace: str | Path, run_id: str) -> PublicStateDocsPayload:
    repository = LoopStateRepository(workspace)
    repository.get_run(run_id)
    workspace_root = Path(workspace)
    return {
        "run_id": run_id,
        "documents": {
            "task_plan": _envelope(task_plan_path(workspace_root), workspace_root, _render_task_plan(repository, run_id)),
            "findings": _envelope(findings_path(workspace_root), workspace_root, _render_findings(repository, run_id)),
            "progress": _envelope(progress_path(workspace_root), workspace_root, _render_progress(repository, run_id)),
            "latest_context": _envelope(
                latest_context_path(workspace_root),
                workspace_root,
                _render_latest_context(repository, run_id),
            ),
        },
    }


def build_public_context_latest_payload(workspace: str | Path, run_id: str) -> PublicContextLatestPayload:
    repository = LoopStateRepository(workspace)
    repository.get_run(run_id)
    workspace_root = Path(workspace)
    return {
        "run_id": run_id,
        "runtime_latest": _envelope(
            latest_context_path(workspace_root),
            workspace_root,
            _render_latest_context(repository, run_id),
        ),
        "repo_latest": None,
    }


def build_public_workspace_context_latest_payload(
    workspace: str | Path,
) -> PublicWorkspaceContextLatestPayload:
    repository = LoopStateRepository(workspace)
    run = repository.get_latest_active_run() or repository.get_most_recent_run()
    workspace_root = Path(workspace)
    if run is None:
        runtime_latest = _envelope(
            latest_context_path(workspace_root),
            workspace_root,
            "# LATEST_CONTEXT.md\n\n_No active public run._\n",
        )
    else:
        run_payload = build_public_context_latest_payload(workspace_root, str(run["run_id"]))
        runtime_latest = run_payload["runtime_latest"]
    return {
        "mode": "forward",
        "runtime_latest": runtime_latest,
        "repo_latest": None,
    }


def _envelope(path: Path, workspace_root: Path, content: str | None) -> PublicEnvelope:
    return {"path": _relative_display_path(path, workspace_root), "content": content}


def _relative_display_path(path: Path, workspace_root: Path) -> str:
    try:
        return path.resolve().relative_to(workspace_root.resolve()).as_posix()
    except ValueError:
        return path.name


def _render_task_plan(repository: LoopStateRepository, run_id: str) -> str:
    plan = repository.get_task_plan(run_id)
    if plan is None:
        return "# task_plan.md\n\n_No active public plan._\n"
    objective = _public_text(plan.get("objective"))
    lines = ["# task_plan.md", "", "## Public Objective", "", objective, "", "## Steps", ""]
    steps = _public_steps(plan.get("steps_json"))
    if not steps:
        lines.append("_No public steps recorded._")
    else:
        for index, step in enumerate(steps, start=1):
            lines.append(f"{index}. [{step['status']}] {step['title']}")
    return "\n".join(lines).rstrip() + "\n"


def _render_findings(repository: LoopStateRepository, run_id: str) -> str:
    items = _public_items(repository.list_findings(run_id), include_category=True)
    lines = ["# findings.md", "", "## Public Findings", ""]
    if not items:
        lines.append("_No public findings recorded._")
    else:
        for item in items:
            lines.append(f"- [{item['category']}] {item['summary']} ({item['created_at']})")
    return "\n".join(lines).rstrip() + "\n"


def _render_progress(repository: LoopStateRepository, run_id: str) -> str:
    items = _public_items(repository.list_progress_entries(run_id), include_category=False)
    lines = ["# progress.md", "", "## Public Progress", ""]
    if not items:
        lines.append("_No public progress recorded._")
    else:
        for item in items:
            lines.append(f"- {item['summary']} ({item['created_at']})")
    return "\n".join(lines).rstrip() + "\n"


def _render_latest_context(repository: LoopStateRepository, run_id: str) -> str:
    plan = repository.get_task_plan(run_id)
    objective = _public_text(plan.get("objective") if plan else None)
    steps = _public_steps(plan.get("steps_json") if plan else None)
    active_step = _active_step(steps)
    findings = _public_items(repository.list_findings(run_id), include_category=True)
    progress = _public_items(repository.list_progress_entries(run_id), include_category=False)
    blockers = [item for item in findings if item["category"] in BLOCKER_CATEGORIES][:PUBLIC_ITEM_LIMIT]
    decisions = [item for item in findings if item["category"] not in BLOCKER_CATEGORIES][:PUBLIC_ITEM_LIMIT]
    next_actions = [step for step in steps if step["status"] in {"pending", "planned", "in_progress", "running"}][
        :PUBLIC_ITEM_LIMIT
    ]

    lines = ["# LATEST_CONTEXT.md", "", "## Public Objective", "", objective, "", "## Active Step", ""]
    lines.append(f"- [{active_step['status']}] {active_step['title']}" if active_step else "_No active public step._")
    lines.extend(["", "## Blockers", ""])
    _append_summary_lines(lines, blockers, empty="_No public blockers recorded._")
    lines.extend(["", "## Latest Decisions", ""])
    _append_summary_lines(lines, decisions, empty="_No public decisions recorded._")
    lines.extend(["", "## Next Actions", ""])
    if not next_actions:
        lines.append("_No public next actions recorded._")
    else:
        for step in next_actions:
            lines.append(f"- [{step['status']}] {step['title']}")
    if progress:
        lines.extend(["", "## Recent Progress", ""])
        _append_summary_lines(lines, progress, empty="_No public progress recorded._")
    return "\n".join(lines).rstrip() + "\n"


def _public_steps(raw_steps: Any) -> list[dict[str, str]]:
    if not isinstance(raw_steps, list):
        return []
    steps: list[dict[str, str]] = []
    for index, raw_step in enumerate(raw_steps, start=1):
        if not isinstance(raw_step, dict):
            continue
        title = _public_text(raw_step.get("title"), fallback=f"Step {index}")
        status = _public_status(raw_step.get("status"))
        steps.append({"title": title, "status": status})
    return steps


def _active_step(steps: list[dict[str, str]]) -> dict[str, str] | None:
    for step in steps:
        if step["status"] in {"in_progress", "running", "review", "blocked"}:
            return step
    return steps[0] if steps else None


def _public_items(rows: list[dict[str, Any]], *, include_category: bool) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for row in rows:
        summary = _public_text(row.get("summary"), fallback="")
        if not summary:
            continue
        item = {
            "summary": summary,
            "created_at": _public_text(row.get("created_at"), fallback="unknown")[:PUBLIC_CODE_CHAR_LIMIT],
        }
        if include_category:
            item["category"] = _public_text(row.get("category"), fallback="general")[:PUBLIC_CODE_CHAR_LIMIT]
        items.append(item)
    return items[-PUBLIC_ITEM_LIMIT:]


def _append_summary_lines(lines: list[str], items: list[dict[str, str]], *, empty: str) -> None:
    if not items:
        lines.append(empty)
        return
    for item in items:
        label = f"[{item['category']}] " if "category" in item else ""
        lines.append(f"- {label}{item['summary']} ({item['created_at']})")


def _public_status(raw_value: Any) -> str:
    value = _public_text(raw_value, fallback="pending").strip().lower()
    return value if value in SAFE_STATUS_VALUES else "pending"


def _public_text(raw_value: Any, *, fallback: str = PUBLIC_PLACEHOLDER) -> str:
    if not isinstance(raw_value, str):
        return fallback
    value = " ".join(raw_value.split())
    if not value:
        return fallback
    if _is_unsafe_public_text(value):
        return fallback
    if len(value) > PUBLIC_TEXT_CHAR_LIMIT:
        return value[: PUBLIC_TEXT_CHAR_LIMIT - 1].rstrip() + "…"
    return value


def sanitize_public_text(raw_value: Any, *, fallback: str = PUBLIC_PLACEHOLDER) -> str:
    return _public_text(raw_value, fallback=fallback)


def public_steps(raw_steps: Any) -> list[dict[str, str]]:
    return _public_steps(raw_steps)


def _is_unsafe_public_text(value: str) -> bool:
    home_name = Path.home().name
    if home_name and re.search(rf"\b{re.escape(home_name)}\b", value, re.I):
        return True
    return any(pattern.search(value) for pattern in UNSAFE_PATTERNS)


__all__ = [
    "build_public_context_latest_payload",
    "build_public_state_docs_payload",
    "build_public_workspace_context_latest_payload",
    "public_steps",
    "sanitize_public_text",
]
