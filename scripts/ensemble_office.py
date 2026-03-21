#!/usr/bin/env python3
"""
Static office report generator for Conitens operational state.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ensemble_agents import list_agent_runtimes, list_rooms
from ensemble_artifacts import append_artifact_manifest, load_artifact_manifest
from ensemble_contracts import parse_simple_yaml, split_frontmatter
from ensemble_events import load_events, replay_event_summary
from ensemble_gate import list_gate_records
from ensemble_handoff import list_handoffs
from ensemble_meeting import list_meetings
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir
from ensemble_registry import registry_summary


DEFAULT_STALE_HOURS = 24


def notes_dir(workspace: str | Path) -> Path:
    return Path(workspace) / ".notes"


def office_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "office")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        if text.endswith("Z"):
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def is_stale(timestamp: str | None, hours: int = DEFAULT_STALE_HOURS) -> bool:
    parsed = parse_timestamp(timestamp)
    if parsed is None:
        return False
    return parsed < now_utc() - timedelta(hours=hours)


def timestamp_from_mtime(path: Path) -> str | None:
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")


def question_ttl_hours(workspace: str | Path) -> int:
    policy_file = notes_dir(workspace) / "WORKSPACE_POLICY.json"
    if not policy_file.exists():
        return DEFAULT_STALE_HOURS
    try:
        data = json.loads(policy_file.read_text(encoding="utf-8"))
        return int(data.get("question_queue", {}).get("ttl_hours", DEFAULT_STALE_HOURS))
    except Exception:
        return DEFAULT_STALE_HOURS


def context_file(workspace: str | Path) -> Path:
    preferred = notes_dir(workspace) / "context" / "LATEST_CONTEXT.md"
    legacy = notes_dir(workspace) / "LATEST_CONTEXT.md"
    return preferred if preferred.exists() or preferred.parent.exists() else legacy


def read_task_header(task_file: Path) -> tuple[dict[str, Any], str]:
    text = task_file.read_text(encoding="utf-8", errors="replace")
    frontmatter, _ = split_frontmatter(text)
    return (parse_simple_yaml(frontmatter) if frontmatter else {}), text


def task_title(task_file: Path, header: dict[str, Any], content: str) -> str:
    if header.get("title"):
        return str(header["title"])
    for line in content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return task_file.stem


def extract_verify_failures(content: str) -> list[str]:
    match = re.search(r"\*\*Failures\*\*:\n((?:- .+\n?)*)", content)
    if not match:
        return []
    return [line[2:].strip() for line in match.group(1).splitlines() if line.startswith("- ")]


def collect_tasks(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    status_dirs = {
        "INBOX": notes_dir(workspace) / "INBOX",
        "ACTIVE": notes_dir(workspace) / "ACTIVE",
        "COMPLETED": notes_dir(workspace) / "COMPLETED",
        "HALTED": notes_dir(workspace) / "HALTED",
        "DUMPED": notes_dir(workspace) / "DUMPED",
    }
    for status, folder in status_dirs.items():
        if not folder.exists():
            continue
        for task_file in sorted(folder.glob("TASK-*.md")):
            header, content = read_task_header(task_file)
            rows.append(
                {
                    "task_id": header.get("task_id", task_file.stem),
                    "status": header.get("status", status),
                    "title": task_title(task_file, header, content),
                    "verify_status": header.get("verify_status", "NOT_RUN"),
                    "verify_failures": extract_verify_failures(content),
                    "owner": header.get("owner"),
                    "next_expected": header.get("next_expected"),
                    "updated_at": header.get("updated_at"),
                    "created_at": header.get("created_at"),
                    "reason": header.get("reason"),
                    "resume_condition": header.get("resume_condition"),
                    "path": str(task_file),
                    "stale": is_stale(header.get("updated_at")),
                }
            )
    return rows


def collect_locks(workspace: str | Path) -> dict[str, Any]:
    lock_file = notes_dir(workspace) / "ACTIVE" / "_locks.json"
    if not lock_file.exists():
        return {"locks": {}}
    try:
        return json.loads(lock_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"locks": {}, "error": "Invalid JSON"}


def collect_questions(workspace: str | Path) -> list[dict[str, Any]]:
    question_file = notes_dir(workspace) / "ACTIVE" / "_pending_questions.json"
    if not question_file.exists():
        return []
    ttl_hours = question_ttl_hours(workspace)
    try:
        questions = json.loads(question_file.read_text(encoding="utf-8")).get("questions", [])
    except json.JSONDecodeError:
        return []

    for question in questions:
        question["stale"] = is_stale(question.get("created_at"), ttl_hours)
        if question.get("status") in {"pending", "auto_selected_waiting_confirm"}:
            question["action_needed"] = "owner approval"
    return questions


def collect_context(workspace: str | Path) -> dict[str, Any]:
    file_path = context_file(workspace)
    content = file_path.read_text(encoding="utf-8", errors="replace") if file_path.exists() else None
    updated_at = timestamp_from_mtime(file_path) if file_path.exists() else None
    return {
        "path": str(file_path),
        "content": content,
        "updated_at": updated_at,
        "stale": is_stale(updated_at),
    }


def collect_workflow_runs(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_runs: set[str] = set()
    for runs_dir in candidate_notes_dirs(workspace, "workflows"):
        if not runs_dir.exists():
            continue
        for run_file in sorted(runs_dir.glob("run-*.json")):
            try:
                data = json.loads(run_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            run_id = data.get("run_id", run_file.stem)
            if run_id in seen_runs:
                continue
            seen_runs.add(run_id)
            last_step = None
            if data.get("steps"):
                step = data["steps"][-1]
                last_step = {
                    "id": step.get("id"),
                    "status": step.get("status"),
                    "stderr": step.get("stderr"),
                }
            rows.append(
                {
                    "run_id": run_id,
                    "correlation_id": data.get("correlation_id"),
                    "workflow_id": data.get("workflow_id"),
                    "status": data.get("status"),
                    "actor": data.get("actor"),
                    "started_at": data.get("started_at"),
                    "finished_at": data.get("finished_at"),
                    "waiting_on": data.get("waiting_on"),
                    "last_step": last_step,
                    "validation_errors": data.get("validation_errors", []),
                }
            )
    rows.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return rows


def collect_handoffs(workspace: str | Path) -> list[dict[str, Any]]:
    return list_handoffs(workspace)


def collect_gates(workspace: str | Path) -> list[dict[str, Any]]:
    return list_gate_records(workspace)


def collect_approval_events(workspace: str | Path) -> list[dict[str, Any]]:
    return [
        event
        for event in load_events(workspace, limit=200)
        if event.get("type") in {"QUESTION_CREATED", "AUTO_SELECTED", "QUESTION_ANSWERED", "APPROVED", "APPROVE_DENIED", "EXECUTED"}
    ]


def collect_blocked_items(
    tasks: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    workflow_runs: list[dict[str, Any]],
    meetings: list[dict[str, Any]],
    context_status: dict[str, Any],
    handoffs: list[dict[str, Any]],
    gates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocked: list[dict[str, Any]] = []

    for task in tasks:
        if task["status"] == "HALTED":
            blocked.append(
                {
                    "kind": "task",
                    "label": task["task_id"],
                    "detail": task.get("reason") or "HALTED",
                    "last_actor": task.get("owner"),
                    "action_needed": task.get("resume_condition") or "resume condition needed",
                }
            )
        elif task.get("verify_status") == "FAIL":
            blocked.append(
                {
                    "kind": "verify",
                    "label": task["task_id"],
                    "detail": "; ".join(task.get("verify_failures", [])[:2]) or "verify failed",
                    "last_actor": task.get("owner"),
                    "action_needed": "fix verify failures and rerun verify",
                }
            )

    for question in questions:
        if question.get("status") in {"pending", "auto_selected_waiting_confirm"}:
            blocked.append(
                {
                    "kind": "approval",
                    "label": question.get("question_id"),
                    "detail": question.get("prompt"),
                    "last_actor": question.get("answered_by"),
                    "action_needed": question.get("action_needed", "owner approval"),
                }
            )

    for gate in gates[:10]:
        if gate.get("status") in {"pending", "approved"}:
            blocked.append(
                {
                    "kind": "gate",
                    "label": gate.get("gate_id"),
                    "detail": gate.get("prompt"),
                    "last_actor": gate.get("requested_by"),
                    "action_needed": f"decision={gate.get('decision') or 'pending'} resume_token={gate.get('resume_token')}",
                }
            )

    for run in workflow_runs[:5]:
        if run.get("status") == "waiting-approval":
            blocked.append(
                {
                    "kind": "workflow-approval",
                    "label": run.get("run_id"),
                    "detail": f"waiting for {((run.get('waiting_on') or {}).get('question_id') or 'approval')}",
                    "last_actor": run.get("actor"),
                    "action_needed": "run ensemble approve, then ensemble workflow resume",
                }
            )
        if run.get("status") == "failed":
            detail = "; ".join(run.get("validation_errors", [])[:1]) or (
                (run.get("last_step") or {}).get("stderr") or "workflow failed"
            )
            blocked.append(
                {
                    "kind": "workflow",
                    "label": run.get("run_id"),
                    "detail": detail,
                    "last_actor": run.get("actor"),
                    "action_needed": "inspect workflow run result",
                }
            )

    for handoff in handoffs[:10]:
        if handoff.get("status") == "blocked":
            blocked.append(
                {
                    "kind": "handoff",
                    "label": handoff.get("handoff_id"),
                    "detail": handoff.get("summary") or "delegated work blocked",
                    "last_actor": handoff.get("to"),
                    "action_needed": "inspect delegated step result",
                }
            )

    for meeting in meetings:
        if meeting.get("status") == "active" and is_stale(meeting.get("last_message_at")):
            blocked.append(
                {
                    "kind": "meeting",
                    "label": meeting.get("meeting_id"),
                    "detail": "active meeting appears stale",
                    "last_actor": max(meeting.get("sender_counts", {}), key=meeting.get("sender_counts", {}).get)
                    if meeting.get("sender_counts")
                    else None,
                    "action_needed": "resume or end meeting",
                }
            )

    if context_status.get("stale"):
        blocked.append(
            {
                "kind": "context",
                "label": "LATEST_CONTEXT.md",
                "detail": "context snapshot is stale",
                "last_actor": None,
                "action_needed": "run ensemble context update",
            }
        )

    return blocked


def collect_office_snapshot(workspace: str | Path) -> dict[str, Any]:
    tasks = collect_tasks(workspace)
    questions = collect_questions(workspace)
    meetings = list_meetings(workspace)
    agents = list_agent_runtimes(workspace)
    rooms = list_rooms(workspace)
    workflow_runs = collect_workflow_runs(workspace)
    handoffs = collect_handoffs(workspace)
    gates = collect_gates(workspace)
    event_summary = replay_event_summary(workspace)
    context_status = collect_context(workspace)
    locks = collect_locks(workspace)
    approval_events = collect_approval_events(workspace)
    registry = registry_summary(workspace)
    artifacts = load_artifact_manifest(workspace, limit=50)

    status_counts: dict[str, int] = {}
    verify_counts = {"PASS": 0, "FAIL": 0, "NOT_RUN": 0}
    for task in tasks:
        status_counts[task["status"]] = status_counts.get(task["status"], 0) + 1
        verify_counts[task["verify_status"]] = verify_counts.get(task["verify_status"], 0) + 1

    active_meetings = [meeting for meeting in meetings if meeting.get("status") == "active"]
    stale_meetings = [meeting for meeting in meetings if meeting.get("status") == "active" and is_stale(meeting.get("last_message_at"))]
    pending_questions = [q for q in questions if q.get("status") in {"pending", "auto_selected_waiting_confirm"}]
    stale_tasks = [task for task in tasks if task.get("stale")]
    verify_failures = [task for task in tasks if task.get("verify_status") == "FAIL"]
    blocked_items = collect_blocked_items(tasks, questions, workflow_runs, meetings, context_status, handoffs, gates)

    return {
        "generated_at": now_utc().isoformat().replace("+00:00", "Z"),
        "status_counts": status_counts,
        "verify_counts": verify_counts,
        "tasks": tasks,
        "locks": locks,
        "questions": questions,
        "approval_events": approval_events,
        "verify_failures": verify_failures,
        "meetings": meetings,
        "agents": agents,
        "rooms": rooms,
        "workflow_runs": workflow_runs,
        "handoffs": handoffs,
        "gates": gates,
        "events": event_summary,
        "registry": registry,
        "artifacts": artifacts,
        "context": context_status,
        "blocked_items": blocked_items,
        "metrics": {
            "task_total": len(tasks),
            "meeting_total": len(meetings),
            "agent_total": len(agents),
            "room_total": len(rooms),
            "active_meetings": len(active_meetings),
            "pending_approvals": len(pending_questions),
            "lock_total": len(locks.get("locks", {})),
            "verify_pass": verify_counts.get("PASS", 0),
            "verify_fail": verify_counts.get("FAIL", 0),
            "verify_not_run": verify_counts.get("NOT_RUN", 0),
            "stale_tasks": len(stale_tasks),
            "stale_meetings": len(stale_meetings),
            "stale_context": 1 if context_status.get("stale") else 0,
            "workflow_runs": len(workflow_runs),
            "handoffs": len(handoffs),
            "gates": len(gates),
            "registry_errors": len(registry.get("errors", [])),
        },
    }


def render_office_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        "# Conitens Office Report",
        "",
        f"- Generated At: {snapshot['generated_at']}",
        f"- Tasks: {snapshot['metrics']['task_total']}",
        f"- Active Meetings: {snapshot['metrics']['active_meetings']}",
        f"- Pending Approvals: {snapshot['metrics']['pending_approvals']}",
        f"- Workflow Runs: {snapshot['metrics']['workflow_runs']}",
        f"- Handoffs: {snapshot['metrics']['handoffs']}",
        f"- Gates: {snapshot['metrics']['gates']}",
        f"- Agents: {snapshot['metrics']['agent_total']}",
        f"- Rooms: {snapshot['metrics']['room_total']}",
        "",
        "## Metrics",
        "",
        f"- Verify PASS: {snapshot['metrics']['verify_pass']}",
        f"- Verify FAIL: {snapshot['metrics']['verify_fail']}",
        f"- Verify NOT_RUN: {snapshot['metrics']['verify_not_run']}",
        f"- Stale Tasks: {snapshot['metrics']['stale_tasks']}",
        f"- Stale Meetings: {snapshot['metrics']['stale_meetings']}",
        f"- Stale Context: {snapshot['metrics']['stale_context']}",
        f"- Agents: {snapshot['metrics']['agent_total']}",
        f"- Rooms: {snapshot['metrics']['room_total']}",
        f"- Registry Errors: {snapshot['metrics']['registry_errors']}",
        "",
        "## Status",
        "",
    ]
    for status, count in sorted(snapshot["status_counts"].items()):
        lines.append(f"- {status}: {count}")

    lines.extend(["", "## Approvals", ""])
    pending_questions = [q for q in snapshot["questions"] if q.get("status") in {"pending", "auto_selected_waiting_confirm"}]
    if pending_questions:
        for question in pending_questions[:10]:
            stale_marker = " [STALE]" if question.get("stale") else ""
            lines.append(
                f"- {question.get('question_id')}{stale_marker}: {question.get('kind')} "
                f"-> {question.get('action_needed', 'owner approval')}"
            )
    else:
        lines.append("- No pending approvals.")
    if snapshot["approval_events"]:
        lines.append("")
        lines.append("Recent approval events:")
        for event in snapshot["approval_events"][-5:]:
            lines.append(f"- {event['type']}: {event.get('payload', {})}")

    lines.extend(["", "## Verify", ""])
    if snapshot["verify_failures"]:
        for task in snapshot["verify_failures"][:10]:
            reason = "; ".join(task.get("verify_failures", [])[:2]) or "verify failed"
            lines.append(f"- {task['task_id']}: {reason}")
    else:
        lines.append("- No verify failures recorded.")

    lines.extend(["", "## Meetings", ""])
    if snapshot["meetings"]:
        for meeting in snapshot["meetings"][:10]:
            sender_summary = ", ".join(f"{name}:{count}" for name, count in sorted(meeting.get("sender_counts", {}).items()))
            stale_marker = " [STALE]" if meeting.get("status") == "active" and is_stale(meeting.get("last_message_at")) else ""
            lines.append(
                f"- {meeting['meeting_id']}: {meeting.get('topic') or 'Untitled'} "
                f"({meeting.get('status')}){stale_marker} | last={meeting.get('last_message_at')} "
                f"| senders={sender_summary or 'none'}"
            )
    else:
        lines.append("- No meetings recorded.")

    lines.extend(["", "## Agents", ""])
    if snapshot["agents"]:
        for agent in snapshot["agents"][:10]:
            lines.append(
                f"- {agent.get('agent_id')}: {agent.get('status')} | provider={agent.get('provider_id')} "
                f"| workspace={(agent.get('workspace') or {}).get('path')}"
            )
    else:
        lines.append("- No hired agents.")

    lines.extend(["", "## Rooms", ""])
    if snapshot["rooms"]:
        for room in snapshot["rooms"][:10]:
            lines.append(
                f"- {room.get('room_id')}: {room.get('status')} | messages={room.get('message_count')} "
                f"| members={', '.join(room.get('members', [])) or 'none'}"
            )
    else:
        lines.append("- No rooms recorded.")

    lines.extend(["", "## Workflow Runs", ""])
    if snapshot["workflow_runs"]:
        for run in snapshot["workflow_runs"][:10]:
            last_step = run.get("last_step") or {}
            lines.append(
                f"- {run.get('run_id')}: {run.get('status')} | workflow={run.get('workflow_id')} "
                f"| last_step={last_step.get('id')}:{last_step.get('status')}"
            )
            if run.get("waiting_on"):
                lines.append(f"  waiting_on: {(run.get('waiting_on') or {}).get('question_id')}")
            if run.get("validation_errors"):
                lines.append(f"  validation: {run['validation_errors'][0]}")
    else:
        lines.append("- No workflow runs recorded.")

    lines.extend(["", "## Gates", ""])
    if snapshot["gates"]:
        for gate in snapshot["gates"][:10]:
            lines.append(
                f"- {gate.get('gate_id')}: {gate.get('status')} | action={gate.get('action_class')} | run={gate.get('run_id')}"
            )
    else:
        lines.append("- No gate records.")

    lines.extend(["", "## Handoffs", ""])
    if snapshot["handoffs"]:
        for handoff in snapshot["handoffs"][:10]:
            lines.append(
                f"- {handoff.get('handoff_id')}: {handoff.get('status')} | "
                f"{handoff.get('from')} -> {handoff.get('to')} | run={handoff.get('run_id')}"
            )
    else:
        lines.append("- No typed handoffs recorded.")

    lines.extend(["", "## Control Plane", ""])
    lines.append(
        f"- Agents: {snapshot['registry']['metrics']['agent_count']} | "
        f"Skills: {snapshot['registry']['metrics']['skill_count']} | "
        f"Providers: {snapshot['registry']['metrics'].get('provider_count', 0)} | "
        f"Workspaces: {snapshot['registry']['metrics'].get('workspace_count', 0)} | "
        f"Rooms: {snapshot['registry']['metrics'].get('room_count', 0)} | "
        f"Workflows: {snapshot['registry']['metrics']['workflow_count']} | "
        f"Gate Actions: {snapshot['registry']['metrics']['gate_action_count']}"
    )
    if snapshot["registry"].get("errors"):
        lines.append("- Registry Errors:")
        for error in snapshot["registry"]["errors"][:10]:
            lines.append(f"  - {error}")
    else:
        lines.append("- Registry validation clean.")

    lines.extend(["", "## Context Freshness", ""])
    lines.append(f"- Path: {snapshot['context'].get('path')}")
    lines.append(f"- Updated At: {snapshot['context'].get('updated_at') or 'unknown'}")
    lines.append(f"- Stale: {'yes' if snapshot['context'].get('stale') else 'no'}")

    lines.extend(["", "## Why Blocked", ""])
    if snapshot["blocked_items"]:
        for item in snapshot["blocked_items"][:15]:
            lines.append(
                f"- [{item['kind']}] {item['label']}: {item['detail']} "
                f"| last_actor={item.get('last_actor') or 'unknown'} "
                f"| action={item.get('action_needed')}"
            )
    else:
        lines.append("- No obvious blocked items.")

    lines.extend(["", "## Locks", ""])
    locks = snapshot["locks"].get("locks", {})
    if locks:
        for path, info in locks.items():
            lines.append(f"- {path}: {info.get('agent', 'UNKNOWN')}")
    else:
        lines.append("- No active locks.")

    lines.extend(["", "## Event Totals", ""])
    lines.append(f"- Event Count: {snapshot['events']['total']}")
    for event_type, count in sorted(snapshot["events"]["by_type"].items()):
        lines.append(f"- {event_type}: {count}")
    return "\n".join(lines) + "\n"


def render_office_html(snapshot: dict[str, Any]) -> str:
    def list_items(items: list[str], empty: str) -> str:
        if not items:
            return f"<li>{empty}</li>"
        return "".join(f"<li>{item}</li>" for item in items)

    status_items = [f"{status}: {count}" for status, count in sorted(snapshot["status_counts"].items())]
    approval_items = [
        f"{q.get('question_id')}: {q.get('kind')} -> {q.get('action_needed', 'owner approval')}"
        for q in snapshot["questions"]
        if q.get("status") in {"pending", "auto_selected_waiting_confirm"}
    ]
    verify_items = [
        f"{task['task_id']}: {'; '.join(task.get('verify_failures', [])[:2]) or 'verify failed'}"
        for task in snapshot["verify_failures"]
    ]
    meeting_items = [
        f"{meeting['meeting_id']}: {meeting.get('topic') or 'Untitled'} ({meeting.get('status')})"
        for meeting in snapshot["meetings"]
    ]
    agent_items = [
        f"{agent.get('agent_id')}: {agent.get('status')} ({agent.get('provider_id')})"
        for agent in snapshot["agents"][:10]
    ]
    room_items = [
        f"{room.get('room_id')}: {room.get('status')} ({room.get('message_count')} messages)"
        for room in snapshot["rooms"][:10]
    ]
    workflow_items = [
        f"{run.get('run_id')}: {run.get('status')} ({run.get('workflow_id')})"
        for run in snapshot["workflow_runs"][:10]
    ]
    handoff_items = [
        f"{handoff.get('handoff_id')}: {handoff.get('status')} ({handoff.get('from')} -> {handoff.get('to')})"
        for handoff in snapshot["handoffs"][:10]
    ]
    gate_items = [
        f"{gate.get('gate_id')}: {gate.get('status')} ({gate.get('action_class')})"
        for gate in snapshot["gates"][:10]
    ]
    blocked_items = [
        f"[{item['kind']}] {item['label']}: {item['detail']} -> {item.get('action_needed')}"
        for item in snapshot["blocked_items"][:15]
    ]
    registry_items = [
        f"Agents: {snapshot['registry']['metrics']['agent_count']}",
        f"Skills: {snapshot['registry']['metrics']['skill_count']}",
        f"Providers: {snapshot['registry']['metrics'].get('provider_count', 0)}",
        f"Workspaces: {snapshot['registry']['metrics'].get('workspace_count', 0)}",
        f"Rooms: {snapshot['registry']['metrics'].get('room_count', 0)}",
        f"Workflows: {snapshot['registry']['metrics']['workflow_count']}",
        f"Gate Actions: {snapshot['registry']['metrics']['gate_action_count']}",
    ] + snapshot["registry"].get("errors", [])[:5]
    metric_items = [
        f"Verify PASS: {snapshot['metrics']['verify_pass']}",
        f"Verify FAIL: {snapshot['metrics']['verify_fail']}",
        f"Verify NOT_RUN: {snapshot['metrics']['verify_not_run']}",
        f"Pending Approvals: {snapshot['metrics']['pending_approvals']}",
        f"Stale Tasks: {snapshot['metrics']['stale_tasks']}",
        f"Stale Meetings: {snapshot['metrics']['stale_meetings']}",
        f"Workflow Runs: {snapshot['metrics']['workflow_runs']}",
        f"Handoffs: {snapshot['metrics']['handoffs']}",
        f"Gates: {snapshot['metrics']['gates']}",
        f"Agents: {snapshot['metrics']['agent_total']}",
        f"Rooms: {snapshot['metrics']['room_total']}",
        f"Registry Errors: {snapshot['metrics']['registry_errors']}",
    ]
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Conitens Office Report</title>
  <style>
    :root {{
      --bg: #f5efe6;
      --fg: #1f2933;
      --accent: #b35c1e;
      --panel: #fff9f0;
      --line: #d7c2ad;
    }}
    body {{
      background: radial-gradient(circle at top, #fff8ef, var(--bg));
      color: var(--fg);
      font-family: Georgia, "Times New Roman", serif;
      margin: 0;
      padding: 2rem;
    }}
    main {{
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }}
    section {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem 1.25rem;
    }}
    section.hero {{
      grid-column: 1 / -1;
    }}
    h1, h2 {{
      color: var(--accent);
    }}
    ul {{
      margin: 0;
      padding-left: 1.25rem;
    }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Conitens Office Report</h1>
      <p>Generated at {snapshot['generated_at']}</p>
      <p>Context stale: {'yes' if snapshot['context'].get('stale') else 'no'}</p>
    </section>
    <section><h2>Metrics</h2><ul>{list_items(metric_items, 'No metrics.')}</ul></section>
    <section><h2>Status</h2><ul>{list_items(status_items, 'No task state found.')}</ul></section>
    <section><h2>Approvals</h2><ul>{list_items(approval_items, 'No pending approvals.')}</ul></section>
    <section><h2>Verify</h2><ul>{list_items(verify_items, 'No verify failures.')}</ul></section>
    <section><h2>Meetings</h2><ul>{list_items(meeting_items, 'No meetings recorded.')}</ul></section>
    <section><h2>Agents</h2><ul>{list_items(agent_items, 'No hired agents.')}</ul></section>
    <section><h2>Rooms</h2><ul>{list_items(room_items, 'No rooms recorded.')}</ul></section>
    <section><h2>Workflow Runs</h2><ul>{list_items(workflow_items, 'No workflow runs recorded.')}</ul></section>
    <section><h2>Gates</h2><ul>{list_items(gate_items, 'No gate records.')}</ul></section>
    <section><h2>Handoffs</h2><ul>{list_items(handoff_items, 'No typed handoffs recorded.')}</ul></section>
    <section><h2>Control Plane</h2><ul>{list_items(registry_items, 'No registry data.')}</ul></section>
    <section><h2>Why Blocked</h2><ul>{list_items(blocked_items, 'No obvious blocked items.')}</ul></section>
  </main>
</body>
</html>
"""


def generate_report(workspace: str | Path, fmt: str = "md") -> Path:
    snapshot = collect_office_snapshot(workspace)
    output_dir = office_dir(workspace)
    if fmt == "html":
        target = output_dir / "office-report.html"
        target.write_text(render_office_html(snapshot), encoding="utf-8")
    else:
        target = output_dir / "office-report.md"
        target.write_text(render_office_markdown(snapshot), encoding="utf-8")
    legacy_output_dir = candidate_notes_dirs(workspace, "office", include_missing=True)[-1]
    if legacy_output_dir != output_dir:
        legacy_output_dir.mkdir(parents=True, exist_ok=True)
        legacy_target = legacy_output_dir / target.name
        legacy_target.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
    append_artifact_manifest(
        workspace,
        artifact_type="office_report",
        path=str(target),
        actor="OFFICE",
        metadata={"format": fmt},
    )
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens office static report")
    parser.add_argument("--workspace", default=os.getcwd())
    parser.add_argument("--format", choices=["md", "html"], default="md")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    report = generate_report(args.workspace, args.format)
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
