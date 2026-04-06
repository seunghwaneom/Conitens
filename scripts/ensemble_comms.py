#!/usr/bin/env python3
"""
Communication ledger for Conitens (ADR-0002, Batch 2).

Event-first: all mutations emit events via append_event(), then
ensemble_obsidian.py projects to .notes/40_Comms/ synchronously.

CLI usage:
    python scripts/ensemble_comms.py create --kind user_agent --workspace ws-main --participants user,supervisor-core
    python scripts/ensemble_comms.py append <thread_id> --sender user --message "text"
    python scripts/ensemble_comms.py close <thread_id> --summary "resolved"
    python scripts/ensemble_comms.py list [--workspace ws-main] [--status open]
    python scripts/ensemble_comms.py show <thread_id>
    python scripts/ensemble_comms.py search <query>
    python scripts/ensemble_comms.py decision <thread_id> --decision "text" --rationale "why"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_obsidian import (
    append_to_thread,
    close_thread,
    project_decision,
    project_thread,
    search_threads,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
NOTES_DIR = REPO_ROOT / ".notes"
COMMS_DIR = NOTES_DIR / "40_Comms"

VALID_KINDS = ("user_agent", "agent_agent", "agent_agent_user")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _generate_thread_id(kind: str, workspace: str) -> str:
    short = uuid.uuid4().hex[:8]
    return f"thread-{workspace}-{kind[:2]}-{short}"


def thread_create(
    kind: str,
    workspace: str,
    participants: list[str],
    *,
    run: str = "",
) -> dict[str, Any]:
    """Create a new communication thread."""
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid kind: {kind}. Must be one of {VALID_KINDS}")

    thread_id = _generate_thread_id(kind, workspace)
    created_at = _utc_now()

    # Event-first (I-1)
    append_event(
        str(NOTES_DIR),
        event_type="thread.created",
        actor={"type": "system", "name": "comms"},
        payload={
            "thread_id": thread_id,
            "kind": kind,
            "workspace": workspace,
            "run": run,
            "participants": participants,
        },
    )

    # Synchronous projection
    path = project_thread(
        thread_id, kind, workspace, participants,
        run=run, created_at=created_at,
    )

    return {
        "thread_id": thread_id,
        "kind": kind,
        "workspace": workspace,
        "participants": participants,
        "status": "open",
        "path": str(path),
        "created_at": created_at,
    }


def thread_append(thread_id: str, sender: str, message: str) -> dict[str, Any]:
    """Append a message to a thread."""
    # Event-first (I-1)
    append_event(
        str(NOTES_DIR),
        event_type="thread.message_appended",
        actor={"type": "agent" if sender != "user" else "user", "name": sender},
        payload={
            "thread_id": thread_id,
            "sender": sender,
            "message": message,
        },
    )

    # Synchronous projection
    path = append_to_thread(thread_id, sender, message)
    if path is None:
        return {"error": f"Thread {thread_id} not found", "thread_id": thread_id}

    return {"thread_id": thread_id, "sender": sender, "appended": True}


def thread_close(thread_id: str, summary: str) -> dict[str, Any]:
    """Close a thread with a summary."""
    # Event-first (I-1)
    append_event(
        str(NOTES_DIR),
        event_type="thread.closed",
        actor={"type": "system", "name": "comms"},
        payload={
            "thread_id": thread_id,
            "summary": summary,
        },
    )

    # Synchronous projection
    path = close_thread(thread_id, summary)
    if path is None:
        return {"error": f"Thread {thread_id} not found", "thread_id": thread_id}

    return {"thread_id": thread_id, "status": "closed", "summary": summary}


def decision_create(
    thread_id: str,
    decision: str,
    rationale: str,
    evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """Record a decision within a thread."""
    evidence_refs = evidence_refs or []

    # Event-first (I-1)
    append_event(
        str(NOTES_DIR),
        event_type="thread.decision_recorded",
        actor={"type": "system", "name": "comms"},
        payload={
            "thread_id": thread_id,
            "decision": decision,
            "rationale": rationale,
            "evidence_refs": evidence_refs,
        },
    )

    # Synchronous projection
    path = project_decision(thread_id, decision, rationale, evidence_refs)

    return {
        "thread_id": thread_id,
        "decision": decision,
        "path": str(path),
    }


def thread_list(
    workspace: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List threads from projected .notes/40_Comms/."""
    threads: list[dict[str, Any]] = []
    if not COMMS_DIR.exists():
        return threads

    for md_file in sorted(COMMS_DIR.rglob("*.md"), reverse=True):
        if md_file.name.startswith("_"):
            continue
        text = md_file.read_text(encoding="utf-8")
        if not text.startswith("---"):
            continue
        meta = _parse_simple_frontmatter(text)
        if workspace and meta.get("workspace") != workspace:
            continue
        if status and meta.get("status") != status:
            continue
        threads.append({
            "id": meta.get("id", md_file.stem),
            "kind": meta.get("kind", ""),
            "workspace": meta.get("workspace", ""),
            "status": meta.get("status", "open"),
            "participants": meta.get("participants", ""),
            "created_at": meta.get("created_at", ""),
            "updated_at": meta.get("updated_at", ""),
        })
        if len(threads) >= limit:
            break

    return threads


def thread_show(thread_id: str) -> dict[str, Any] | None:
    """Show full thread content."""
    if not COMMS_DIR.exists():
        return None
    matches = list(COMMS_DIR.rglob(f"{thread_id}.md"))
    if not matches:
        return None

    path = matches[0]
    text = path.read_text(encoding="utf-8")
    meta = _parse_simple_frontmatter(text)

    # Extract messages section
    messages: list[dict[str, str]] = []
    in_messages = False
    for line in text.splitlines():
        if line.strip() == "## Messages":
            in_messages = True
            continue
        if line.startswith("## ") and in_messages:
            break
        if in_messages and line.startswith("- "):
            messages.append({"raw": line[2:]})

    return {
        **meta,
        "messages": messages,
        "path": str(path),
    }


def thread_search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search threads using FTS index."""
    return search_threads(query, limit)


def thread_refresh_summary(thread_id: str) -> dict[str, Any]:
    """Refresh L0/L1 summary for a thread, storing in event payload for idempotent rebuild."""
    from ensemble_token_budget import compress_to_l0, compress_to_l1, estimate_tokens

    data = thread_show(thread_id)
    if data is None:
        return {"error": f"Thread {thread_id} not found"}

    summary_l0 = compress_to_l0(data)
    summary_l1 = compress_to_l1(data)
    tokens_est = estimate_tokens(summary_l1)
    original_tokens = estimate_tokens(
        "\n".join(m.get("raw", "") for m in data.get("messages", []))
    ) or 1
    compression_ratio = round(tokens_est / original_tokens, 2) if original_tokens else 0.0

    # Event-first: summary text stored in event payload for rebuild_all() idempotency
    append_event(
        str(NOTES_DIR),
        event_type="thread.summary_updated",
        actor={"type": "system", "name": "comms"},
        payload={
            "thread_id": thread_id,
            "summary_l0": summary_l0,
            "summary_l1": summary_l1,
            "prompt_tokens_est": tokens_est,
            "compression_ratio": compression_ratio,
        },
    )

    # Update frontmatter in projected note
    if not COMMS_DIR.exists():
        return {"error": "Comms dir not found"}
    matches = list(COMMS_DIR.rglob(f"{thread_id}.md"))
    if matches:
        path = matches[0]
        content = path.read_text(encoding="utf-8")
        # Add/update token telemetry in frontmatter
        if "prompt_tokens_est:" in content:
            import re
            content = re.sub(r"prompt_tokens_est: \d+", f"prompt_tokens_est: {tokens_est}", content)
            content = re.sub(r"compression_ratio: [\d.]+", f"compression_ratio: {compression_ratio}", content)
        else:
            content = content.replace(
                "---\n\n#",
                f"prompt_tokens_est: {tokens_est}\ncompression_ratio: {compression_ratio}\n---\n\n#",
            )
        path.write_text(content, encoding="utf-8")

    return {
        "thread_id": thread_id,
        "summary_l0": summary_l0,
        "prompt_tokens_est": tokens_est,
        "compression_ratio": compression_ratio,
    }


def _parse_simple_frontmatter(text: str) -> dict[str, Any]:
    """Quick frontmatter parser."""
    if not text.startswith("---"):
        return {}
    try:
        end = text.index("---", 3)
    except ValueError:
        return {}
    data: dict[str, Any] = {}
    for line in text[3:end].strip().splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        val = val.strip().strip('"')
        if val.startswith("[") and val.endswith("]"):
            data[key.strip()] = [s.strip() for s in val[1:-1].split(",") if s.strip()]
        else:
            data[key.strip()] = val
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Conitens Communication Ledger")
    sub = parser.add_subparsers(dest="command")

    c = sub.add_parser("create")
    c.add_argument("--kind", required=True, choices=VALID_KINDS)
    c.add_argument("--workspace", required=True)
    c.add_argument("--participants", required=True, help="Comma-separated")
    c.add_argument("--run", default="")

    a = sub.add_parser("append")
    a.add_argument("thread_id")
    a.add_argument("--sender", required=True)
    a.add_argument("--message", required=True)

    cl = sub.add_parser("close")
    cl.add_argument("thread_id")
    cl.add_argument("--summary", required=True)

    ls = sub.add_parser("list")
    ls.add_argument("--workspace", default=None)
    ls.add_argument("--status", default=None)

    s = sub.add_parser("show")
    s.add_argument("thread_id")

    sr = sub.add_parser("search")
    sr.add_argument("query")

    d = sub.add_parser("decision")
    d.add_argument("thread_id")
    d.add_argument("--decision", required=True)
    d.add_argument("--rationale", required=True)
    d.add_argument("--evidence", default="", help="Comma-separated refs")

    args = parser.parse_args()

    if args.command == "create":
        participants = [p.strip() for p in args.participants.split(",")]
        result = thread_create(args.kind, args.workspace, participants, run=args.run)
        print(json.dumps(result, indent=2))
    elif args.command == "append":
        result = thread_append(args.thread_id, args.sender, args.message)
        print(json.dumps(result, indent=2))
    elif args.command == "close":
        result = thread_close(args.thread_id, args.summary)
        print(json.dumps(result, indent=2))
    elif args.command == "list":
        threads = thread_list(
            workspace=getattr(args, "workspace", None),
            status=getattr(args, "status", None),
        )
        for t in threads:
            print(f"  {t['id']:45s} {t['kind']:20s} {t['status']:8s} {t.get('created_at', '')}")
    elif args.command == "show":
        result = thread_show(args.thread_id)
        if result:
            print(json.dumps(result, indent=2))
        else:
            print(f"Thread {args.thread_id} not found", file=sys.stderr)
            return 1
    elif args.command == "search":
        results = thread_search(args.query)
        for r in results:
            print(f"  {r['thread_id']:45s} {r.get('snippet', '')[:60]}")
    elif args.command == "decision":
        evidence = [e.strip() for e in args.evidence.split(",") if e.strip()] if args.evidence else []
        result = decision_create(args.thread_id, args.decision, args.rationale, evidence)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
