#!/usr/bin/env python3
"""
Self-improvement loop for Conitens (ADR-0002, Batch 5).

The Improver agent mines failure patterns, generates candidate patches
for personas/skills/workflows, and produces weekly improvement reports.
All patches require approval before application (approval-gated).

CLI usage:
    python scripts/ensemble_improver.py mine [--since YYYY-MM-DD]
    python scripts/ensemble_improver.py patch <agent_id> --type persona|skill|workflow --rationale "reason"
    python scripts/ensemble_improver.py report [--since YYYY-MM-DD]
    python scripts/ensemble_improver.py waste [--since YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from ensemble_events import append_event

REPO_ROOT = Path(__file__).resolve().parent.parent
NOTES_DIR = REPO_ROOT / ".notes"
EVENTS_DIR = NOTES_DIR / "EVENTS"
REVIEWS_DIR = NOTES_DIR / "70_Reviews"
PATCHES_DIR = REPO_ROOT / ".conitens" / "personas" / "candidate_patches"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _read_events(since: str | None = None) -> list[dict[str, Any]]:
    """Read events from all JSONL files, optionally filtered by date."""
    events: list[dict[str, Any]] = []
    for jsonl_file in sorted(EVENTS_DIR.rglob("*.jsonl")):
        for line in jsonl_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
                if since:
                    ts = event.get("ts_utc", "")
                    if ts < since:
                        continue
                events.append(event)
            except json.JSONDecodeError:
                continue
    # Also check nested events dir (known path behavior)
    nested = NOTES_DIR / ".notes" / "events"
    if nested.exists():
        for jsonl_file in sorted(nested.rglob("*.jsonl")):
            for line in jsonl_file.read_text(encoding="utf-8", errors="replace").splitlines():
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                    if since and event.get("ts_utc", "") < since:
                        continue
                    events.append(event)
                except json.JSONDecodeError:
                    continue
    return events


def mine_failure_patterns(since: str | None = None) -> dict[str, Any]:
    """Mine recurring failure patterns from event history."""
    if not since:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00Z")

    events = _read_events(since)
    failures: dict[str, int] = {}
    error_events = [e for e in events if e.get("type", "").endswith(".failed") or e.get("type", "").endswith(".error") or e.get("severity") == "error"]

    for e in error_events:
        etype = e.get("type", "unknown")
        failures[etype] = failures.get(etype, 0) + 1

    patterns = [
        {"event_type": k, "count": v, "severity": "high" if v >= 3 else "medium"}
        for k, v in sorted(failures.items(), key=lambda x: -x[1])
    ]

    append_event(
        str(NOTES_DIR),
        event_type="improver.pattern_mined",
        actor={"type": "agent", "name": "improver-core"},
        payload={
            "since": since,
            "total_events": len(events),
            "failure_events": len(error_events),
            "patterns_found": len(patterns),
            "top_patterns": patterns[:5],
        },
    )

    return {
        "since": since,
        "total_events": len(events),
        "failure_events": len(error_events),
        "patterns": patterns,
    }


def generate_persona_patch(agent_id: str, rationale: str) -> dict[str, Any]:
    """Generate a candidate persona patch for an agent."""
    PATCHES_DIR.mkdir(parents=True, exist_ok=True)
    date = _date_str()
    seq = len(list(PATCHES_DIR.glob(f"{agent_id}-{date}-*.md"))) + 1
    patch_id = f"{agent_id}-{date}-{seq:03d}"
    patch_path = PATCHES_DIR / f"{patch_id}.md"

    append_event(
        str(NOTES_DIR),
        event_type="improver.patch_generated",
        actor={"type": "agent", "name": "improver-core"},
        payload={"agent_id": agent_id, "patch_id": patch_id, "type": "persona", "rationale": rationale},
    )

    patch_path.write_text("\n".join([
        "---",
        f"patch_id: {patch_id}",
        f"agent_id: {agent_id}",
        "type: persona",
        "status: proposed",
        f"rationale: \"{rationale}\"",
        f"created_at: {_utc_now()}",
        "---",
        "",
        "## Proposed Persona Changes",
        "",
        f"Rationale: {rationale}",
        "",
        "<!-- Fill in specific persona changes below -->",
        "",
    ]), encoding="utf-8")

    return {"patch_id": patch_id, "type": "persona", "agent_id": agent_id, "path": str(patch_path)}


def generate_skill_patch(skill_id: str, rationale: str) -> dict[str, Any]:
    """Generate a candidate skill patch."""
    PATCHES_DIR.mkdir(parents=True, exist_ok=True)
    date = _date_str()
    patch_id = f"skill-{skill_id}-{date}"
    patch_path = PATCHES_DIR / f"{patch_id}.md"

    append_event(
        str(NOTES_DIR),
        event_type="improver.patch_generated",
        actor={"type": "agent", "name": "improver-core"},
        payload={"skill_id": skill_id, "patch_id": patch_id, "type": "skill", "rationale": rationale},
    )

    patch_path.write_text("\n".join([
        "---",
        f"patch_id: {patch_id}",
        f"skill_id: {skill_id}",
        "type: skill",
        "status: proposed",
        f"rationale: \"{rationale}\"",
        f"created_at: {_utc_now()}",
        "---",
        "",
        "## Proposed Skill Changes",
        "",
        f"Rationale: {rationale}",
        "",
    ]), encoding="utf-8")

    return {"patch_id": patch_id, "type": "skill", "skill_id": skill_id, "path": str(patch_path)}


def generate_workflow_patch(workflow_id: str, rationale: str) -> dict[str, Any]:
    """Generate a candidate workflow patch."""
    PATCHES_DIR.mkdir(parents=True, exist_ok=True)
    date = _date_str()
    patch_id = f"wf-{workflow_id}-{date}"
    patch_path = PATCHES_DIR / f"{patch_id}.md"

    append_event(
        str(NOTES_DIR),
        event_type="improver.patch_generated",
        actor={"type": "agent", "name": "improver-core"},
        payload={"workflow_id": workflow_id, "patch_id": patch_id, "type": "workflow", "rationale": rationale},
    )

    patch_path.write_text("\n".join([
        "---",
        f"patch_id: {patch_id}",
        f"workflow_id: {workflow_id}",
        "type: workflow",
        "status: proposed",
        f"rationale: \"{rationale}\"",
        f"created_at: {_utc_now()}",
        "---",
        "",
        "## Proposed Workflow Changes",
        "",
        f"Rationale: {rationale}",
        "",
    ]), encoding="utf-8")

    return {"patch_id": patch_id, "type": "workflow", "workflow_id": workflow_id, "path": str(patch_path)}


def generate_token_waste_report(since: str | None = None) -> dict[str, Any]:
    """Generate token waste analysis from thread telemetry."""
    from ensemble_comms import thread_list
    from ensemble_token_budget import estimate_tokens

    threads = thread_list(limit=100)
    total_est = 0
    over_budget = []

    for t in threads:
        # Rough estimation from thread metadata
        est = estimate_tokens(json.dumps(t))
        total_est += est
        if est > 400:
            over_budget.append({"thread_id": t.get("id", ""), "tokens_est": est})

    return {
        "threads_analyzed": len(threads),
        "total_tokens_est": total_est,
        "over_budget_threads": len(over_budget),
        "details": over_budget[:10],
    }


def generate_weekly_report(since: str | None = None) -> dict[str, Any]:
    """Generate comprehensive weekly improvement report."""
    REVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    date = _date_str()

    patterns = mine_failure_patterns(since)
    waste = generate_token_waste_report(since)

    report_name = f"weekly-improvement-{date}.md"
    report_path = REVIEWS_DIR / report_name

    lines = [
        "---",
        f"id: report-{date}",
        "type: weekly_improvement",
        f"created_at: {_utc_now()}",
        "tags: [review, improvement, weekly]",
        "---",
        "",
        f"# Weekly Improvement Report ({date})",
        "",
        "## Failure Patterns",
        "",
        f"- Total events analyzed: {patterns['total_events']}",
        f"- Failure events: {patterns['failure_events']}",
        f"- Patterns found: {len(patterns['patterns'])}",
        "",
    ]

    if patterns["patterns"]:
        for p in patterns["patterns"][:5]:
            lines.append(f"- **{p['event_type']}**: {p['count']}x ({p['severity']})")
    else:
        lines.append("- No recurring failure patterns detected")

    lines.extend([
        "",
        "## Token Usage",
        "",
        f"- Threads analyzed: {waste['threads_analyzed']}",
        f"- Total estimated tokens: {waste['total_tokens_est']}",
        f"- Over-budget threads: {waste['over_budget_threads']}",
        "",
        "## Recommendations",
        "",
        "- Review over-budget threads and apply L1 compression",
        "- Address high-severity failure patterns with targeted patches",
        "",
    ])

    report_path.write_text("\n".join(lines), encoding="utf-8")

    append_event(
        str(NOTES_DIR),
        event_type="improver.report_generated",
        actor={"type": "agent", "name": "improver-core"},
        payload={
            "report_id": f"report-{date}",
            "path": str(report_path),
            "patterns_found": len(patterns["patterns"]),
            "over_budget_threads": waste["over_budget_threads"],
        },
    )

    return {
        "report_id": f"report-{date}",
        "path": str(report_path),
        "patterns": len(patterns["patterns"]),
        "over_budget": waste["over_budget_threads"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Conitens Self-Improvement Loop")
    sub = parser.add_subparsers(dest="command")

    m = sub.add_parser("mine")
    m.add_argument("--since", default=None)

    p = sub.add_parser("patch")
    p.add_argument("agent_id")
    p.add_argument("--type", required=True, choices=["persona", "skill", "workflow"])
    p.add_argument("--rationale", required=True)

    r = sub.add_parser("report")
    r.add_argument("--since", default=None)

    w = sub.add_parser("waste")
    w.add_argument("--since", default=None)

    args = parser.parse_args()

    if args.command == "mine":
        result = mine_failure_patterns(args.since)
        print(json.dumps(result, indent=2))
    elif args.command == "patch":
        if args.type == "persona":
            result = generate_persona_patch(args.agent_id, args.rationale)
        elif args.type == "skill":
            result = generate_skill_patch(args.agent_id, args.rationale)
        else:
            result = generate_workflow_patch(args.agent_id, args.rationale)
        print(json.dumps(result, indent=2))
    elif args.command == "report":
        result = generate_weekly_report(args.since)
        print(json.dumps(result, indent=2))
    elif args.command == "waste":
        result = generate_token_waste_report(args.since)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
