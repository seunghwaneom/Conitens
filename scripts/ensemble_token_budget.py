#!/usr/bin/env python3
"""
Token budget enforcement for Conitens (ADR-0002, Batch 4).

"Record richly, prompt sparingly." L0/L1/L2 compression tiers with budget limits.

Budget limits:
  AGENTS.md:        ≤4000 chars
  workspace_brief:  ≤800 tokens
  thread_summary:   ≤400 tokens
  handoff_packet:   ≤250 tokens
  approval_request: ≤150 tokens
  daily_digest:     ≤600 tokens

CLI usage:
    python scripts/ensemble_token_budget.py validate --file <path> [--type thread_summary]
    python scripts/ensemble_token_budget.py compress --file <path> --level l0|l1
    python scripts/ensemble_token_budget.py estimate --text "some text"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BUDGET_LIMITS: dict[str, int] = {
    "agents_md": 4000,         # chars, not tokens
    "workspace_brief": 800,    # tokens
    "thread_summary": 400,     # tokens
    "handoff_packet": 250,     # tokens
    "approval_request": 150,   # tokens
    "daily_digest": 600,       # tokens
}

# Token estimation: ~1.3 tokens per word for English, ~2.0 for Korean mixed
TOKEN_PER_WORD = 1.5


def estimate_tokens(text: str) -> int:
    """Estimate token count from text using word-count heuristic."""
    words = len(text.split())
    return max(1, int(words * TOKEN_PER_WORD))


def validate_budget(artifact_type: str, text: str) -> dict[str, Any]:
    """Validate text against budget limit for a given artifact type."""
    limit = BUDGET_LIMITS.get(artifact_type)
    if limit is None:
        return {"status": "UNKNOWN_TYPE", "type": artifact_type, "available_types": list(BUDGET_LIMITS.keys())}

    if artifact_type == "agents_md":
        count = len(text)
        unit = "chars"
    else:
        count = estimate_tokens(text)
        unit = "tokens"

    passed = count <= limit
    return {
        "status": "PASS" if passed else "FAIL",
        "type": artifact_type,
        "count": count,
        "limit": limit,
        "unit": unit,
        "over_by": max(0, count - limit),
    }


def compress_to_l0(thread_data: dict[str, Any]) -> str:
    """L0 — Signal Card: 1-3 sentences. "Why does this thread exist?"

    Used for: inbox, notification, handoff header.
    """
    thread_id = thread_data.get("id", thread_data.get("thread_id", "unknown"))
    kind = thread_data.get("kind", "unknown")
    workspace = thread_data.get("workspace", "")
    status = thread_data.get("status", "open")
    participants = thread_data.get("participants", [])
    if isinstance(participants, str):
        participants = [p.strip() for p in participants.split(",")]

    messages = thread_data.get("messages", [])
    summary = thread_data.get("summary", "")

    if summary:
        core = summary[:150]
    elif messages:
        first_msg = messages[0].get("message", messages[0].get("raw", ""))[:100]
        core = first_msg
    else:
        core = f"{kind} thread in {workspace}"

    return f"[{status.upper()}] {thread_id}: {core} ({len(participants)} participants, {len(messages)} msgs)"


def compress_to_l1(thread_data: dict[str, Any]) -> str:
    """L1 — Thread Summary: 5-15 bullets, ≤400 tokens.

    "What decisions were made and what's next?"
    Used for: Supervisor↔Worker handoff, user report.
    """
    lines: list[str] = []
    thread_id = thread_data.get("id", thread_data.get("thread_id", ""))
    workspace = thread_data.get("workspace", "")
    status = thread_data.get("status", "open")
    kind = thread_data.get("kind", "")

    lines.append(f"- Thread: {thread_id} ({kind}, {status})")
    if workspace:
        lines.append(f"- Workspace: {workspace}")

    participants = thread_data.get("participants", [])
    if isinstance(participants, str):
        participants = [p.strip() for p in participants.split(",")]
    if participants:
        lines.append(f"- Participants: {', '.join(participants[:5])}")

    summary = thread_data.get("summary", "")
    if summary:
        lines.append(f"- Summary: {summary[:200]}")

    decisions = thread_data.get("decisions", [])
    if decisions:
        lines.append("- Decisions:")
        for d in decisions[:3]:
            dec_text = d.get("decision", d.get("raw", ""))[:80]
            lines.append(f"  - {dec_text}")

    messages = thread_data.get("messages", [])
    if messages:
        lines.append(f"- Messages: {len(messages)} total")
        # Last 3 messages as context
        for m in messages[-3:]:
            sender = m.get("sender", "")
            text = m.get("message", m.get("raw", ""))[:80]
            lines.append(f"  - {sender}: {text}")

    # Trim to budget
    result = "\n".join(lines)
    while estimate_tokens(result) > 400 and len(lines) > 5:
        lines.pop(-2)  # Remove from middle
        result = "\n".join(lines)

    return result


def generate_workspace_brief(workspace: str, threads: list[dict[str, Any]]) -> str:
    """Generate workspace brief ≤800 tokens."""
    lines = [f"# Workspace: {workspace}", ""]

    open_threads = [t for t in threads if t.get("status") == "open"]
    closed_threads = [t for t in threads if t.get("status") == "closed"]

    lines.append(f"- Open threads: {len(open_threads)}")
    lines.append(f"- Closed threads: {len(closed_threads)}")
    lines.append("")

    if open_threads:
        lines.append("## Active")
        for t in open_threads[:5]:
            l0 = compress_to_l0(t)
            lines.append(f"- {l0}")

    result = "\n".join(lines)
    budget = validate_budget("workspace_brief", result)
    if budget["status"] == "FAIL":
        # Truncate
        while estimate_tokens(result) > 800 and len(lines) > 4:
            lines.pop()
            result = "\n".join(lines)

    return result


def generate_handoff_packet(
    thread_data: dict[str, Any],
    decisions: list[dict[str, str]] | None = None,
) -> str:
    """Generate handoff packet ≤250 tokens."""
    parts = [
        f"objective: {thread_data.get('summary', 'Continue thread')}",
        f"thread: {thread_data.get('id', thread_data.get('thread_id', ''))}",
        f"status: {thread_data.get('status', 'open')}",
    ]

    if decisions:
        dec_summary = "; ".join(d.get("decision", "")[:40] for d in decisions[:3])
        parts.append(f"decisions: {dec_summary}")

    messages = thread_data.get("messages", [])
    if messages:
        last = messages[-1]
        parts.append(f"last_msg: {last.get('sender', '')}: {last.get('message', last.get('raw', ''))[:60]}")

    parts.append("next_actions: [review and respond]")

    result = "\n".join(parts)
    # Enforce budget
    while estimate_tokens(result) > 250 and len(parts) > 3:
        parts.pop(-2)
        result = "\n".join(parts)

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Conitens Token Budget")
    sub = parser.add_subparsers(dest="command")

    v = sub.add_parser("validate")
    v.add_argument("--file", required=True)
    v.add_argument("--type", default="thread_summary", choices=list(BUDGET_LIMITS.keys()))

    c = sub.add_parser("compress")
    c.add_argument("--file", required=True)
    c.add_argument("--level", required=True, choices=["l0", "l1"])

    e = sub.add_parser("estimate")
    e.add_argument("--text", required=True)

    args = parser.parse_args()

    if args.command == "validate":
        text = Path(args.file).read_text(encoding="utf-8")
        result = validate_budget(args.type, text)
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "PASS" else 1
    elif args.command == "compress":
        text = Path(args.file).read_text(encoding="utf-8")
        # Simple: treat file as a pseudo-thread for compression
        thread_data = {"id": Path(args.file).stem, "messages": [{"raw": text[:1000]}], "status": "open"}
        if args.level == "l0":
            print(compress_to_l0(thread_data))
        else:
            print(compress_to_l1(thread_data))
    elif args.command == "estimate":
        tokens = estimate_tokens(args.text)
        print(json.dumps({"text_length": len(args.text), "estimated_tokens": tokens}))
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
