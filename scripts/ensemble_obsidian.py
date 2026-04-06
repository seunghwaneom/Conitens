#!/usr/bin/env python3
"""
Obsidian projection layer for Conitens (ADR-0002, Batch 2).

SINGLE WRITER for .notes/40_Comms/, .notes/10_Agents/, .notes/70_Reviews/ (I-7).
All projections are derived from events — rebuild_all() regenerates everything (I-2).
Projection is SYNCHRONOUS within CLI commands (read-after-write consistency).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
NOTES_DIR = REPO_ROOT / ".notes"
INDEX_DIR = NOTES_DIR / ".index"
COMMS_DB = INDEX_DIR / "comms.sqlite3"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# SQLite FTS index
# ---------------------------------------------------------------------------

def _get_db() -> sqlite3.Connection:
    _ensure_dir(INDEX_DIR)
    conn = sqlite3.connect(str(COMMS_DB))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            kind TEXT,
            workspace TEXT,
            run TEXT,
            status TEXT DEFAULT 'open',
            participants TEXT,
            summary_text TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS threads_fts
        USING fts5(id, summary_text, participants, content=threads, content_rowid=rowid)
    """)
    conn.commit()
    return conn


def _index_thread(conn: sqlite3.Connection, thread: dict[str, Any]) -> None:
    participants = ", ".join(thread.get("participants", []))
    conn.execute(
        """INSERT OR REPLACE INTO threads (id, kind, workspace, run, status, participants, summary_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            thread["id"], thread.get("kind", ""), thread.get("workspace", ""),
            thread.get("run", ""), thread.get("status", "open"),
            participants, thread.get("summary_text", ""),
            thread.get("created_at", ""), thread.get("updated_at", _utc_now()),
        ),
    )
    conn.execute(
        "INSERT OR REPLACE INTO threads_fts(rowid, id, summary_text, participants) "
        "SELECT rowid, id, summary_text, participants FROM threads WHERE id = ?",
        (thread["id"],),
    )
    conn.commit()


def _sanitize_fts_query(query: str) -> str:
    """Sanitize user input for FTS5 MATCH to prevent operator injection."""
    # Strip FTS5 operators and wrap as phrase search
    sanitized = query.replace('"', " ").replace("*", " ").replace("(", " ").replace(")", " ")
    sanitized = sanitized.replace("OR", " ").replace("AND", " ").replace("NOT", " ")
    sanitized = sanitized.replace(":", " ").strip()
    if not sanitized:
        return '""'
    return f'"{sanitized}"'


def search_threads(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Full-text search across threads."""
    safe_query = _sanitize_fts_query(query)
    safe_limit = max(1, min(limit, 100))
    conn = _get_db()
    rows = conn.execute(
        """SELECT t.id, t.kind, t.workspace, t.status, t.summary_text, t.created_at,
                  rank
           FROM threads_fts f
           JOIN threads t ON t.id = f.id
           WHERE threads_fts MATCH ?
           ORDER BY rank
           LIMIT ?""",
        (safe_query, safe_limit),
    ).fetchall()
    conn.close()
    return [
        {"thread_id": r[0], "kind": r[1], "workspace": r[2], "status": r[3],
         "snippet": r[4][:200], "score": r[5], "matched_at": r[6]}
        for r in rows
    ]


def rebuild_index() -> int:
    """Rebuild the FTS index from projected thread files."""
    conn = _get_db()
    with conn:  # Transaction: commits on success, rolls back on exception
        conn.execute("DELETE FROM threads")
        conn.execute("DELETE FROM threads_fts")
        count = 0
        comms_dir = NOTES_DIR / "40_Comms"
        if comms_dir.exists():
            for md_file in comms_dir.rglob("*.md"):
                if md_file.name.startswith("_"):
                    continue
                meta = _parse_frontmatter(md_file)
                if meta.get("id"):
                    body = md_file.read_text(encoding="utf-8")
                    end_fm = body.index("---", 3) + 3 if "---" in body[3:] else 0
                    body_text = body[end_fm:].strip()
                    meta["summary_text"] = body_text[:500]
                    _index_thread(conn, meta)
                    count += 1
    conn.close()
    return count


# ---------------------------------------------------------------------------
# Frontmatter parsing
# ---------------------------------------------------------------------------

def _parse_frontmatter(path: Path) -> dict[str, Any]:
    """Parse YAML frontmatter from a Markdown file."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    end = text.index("---", 3)
    fm_text = text[3:end].strip()
    data: dict[str, Any] = {}
    for line in fm_text.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().strip('"')
        if val.startswith("[") and val.endswith("]"):
            data[key] = [s.strip().strip('"') for s in val[1:-1].split(",") if s.strip()]
        else:
            data[key] = val
    return data


# ---------------------------------------------------------------------------
# Thread projection
# ---------------------------------------------------------------------------

def project_thread(
    thread_id: str,
    kind: str,
    workspace: str,
    participants: list[str],
    *,
    run: str = "",
    status: str = "open",
    messages: list[dict[str, str]] | None = None,
    decisions: list[dict[str, str]] | None = None,
    summary: str = "",
    created_at: str = "",
) -> Path:
    """Project a thread to .notes/40_Comms/ as Obsidian-compatible Markdown."""
    now = _utc_now()
    created = created_at or now
    date_parts = created[:10].split("-")  # YYYY-MM-DD
    thread_dir = NOTES_DIR / "40_Comms" / date_parts[0] / date_parts[1] / date_parts[2]
    _ensure_dir(thread_dir)

    path = thread_dir / f"{thread_id}.md"
    messages = messages or []
    decisions = decisions or []

    lines = [
        "---",
        f"id: {thread_id}",
        f"kind: {kind}",
        f"workspace: {workspace}",
        f"run: {run}",
        f"participants: [{', '.join(participants)}]",
        f"status: {status}",
        f"visibility: internal",
        f"created_at: {created}",
        f"updated_at: {now}",
        f"tags: [thread, {kind}]",
        "---",
        "",
        f"# {thread_id}",
        "",
    ]

    if summary:
        lines.extend(["## Summary", "", summary, ""])

    if decisions:
        lines.append("## Decisions")
        lines.append("")
        for d in decisions:
            lines.append(f"- {d.get('decision', '')} — {d.get('rationale', '')}")
        lines.append("")

    if messages:
        lines.append("## Messages")
        lines.append("")
        for m in messages:
            ts = m.get("ts", "")
            sender = m.get("sender", "unknown")
            text = m.get("message", "")
            lines.append(f"- {ts} **{sender}**: {text}")
        lines.append("")

    lines.extend([
        "## Links",
        "",
        f"- Workspace: [[20_Workspaces/{workspace}]]" if workspace else "",
        f"- Run: [[30_Runs/{run}]]" if run else "",
        "",
    ])

    path.write_text("\n".join(line for line in lines if line is not None), encoding="utf-8")

    # Update search index
    conn = _get_db()
    _index_thread(conn, {
        "id": thread_id, "kind": kind, "workspace": workspace,
        "run": run, "status": status, "participants": participants,
        "summary_text": summary or " ".join(m.get("message", "") for m in messages[:5]),
        "created_at": created, "updated_at": now,
    })
    conn.close()

    return path


def append_to_thread(thread_id: str, sender: str, message: str) -> Path | None:
    """Append a message to an existing projected thread."""
    comms_dir = NOTES_DIR / "40_Comms"
    matches = list(comms_dir.rglob(f"{thread_id}.md"))
    if not matches:
        return None
    path = matches[0]
    now = _utc_now()
    content = path.read_text(encoding="utf-8")

    # Insert message before ## Links
    new_msg = f"- {now} **{sender}**: {message}"
    if "## Messages" in content:
        content = content.replace("## Links", f"{new_msg}\n\n## Links")
    else:
        content = content.replace("## Links", f"## Messages\n\n{new_msg}\n\n## Links")

    # Update frontmatter updated_at
    content = content.replace(
        f"updated_at: {_parse_frontmatter(path).get('updated_at', '')}",
        f"updated_at: {now}",
    )
    path.write_text(content, encoding="utf-8")
    return path


def close_thread(thread_id: str, summary: str) -> Path | None:
    """Close a thread with a summary."""
    comms_dir = NOTES_DIR / "40_Comms"
    matches = list(comms_dir.rglob(f"{thread_id}.md"))
    if not matches:
        return None
    path = matches[0]
    content = path.read_text(encoding="utf-8")
    content = content.replace("status: open", "status: closed")
    now = _utc_now()

    if "## Summary" in content:
        # Replace existing summary
        idx = content.index("## Summary")
        next_section = content.index("\n## ", idx + 10)
        content = content[:idx] + f"## Summary\n\n{summary}\n" + content[next_section:]
    else:
        content = content.replace("## Messages", f"## Summary\n\n{summary}\n\n## Messages")

    path.write_text(content, encoding="utf-8")

    # Update index
    conn = _get_db()
    conn.execute("UPDATE threads SET status='closed', summary_text=?, updated_at=? WHERE id=?",
                 (summary, now, thread_id))
    conn.commit()
    conn.close()
    return path


def project_decision(thread_id: str, decision: str, rationale: str, evidence_refs: list[str]) -> Path:
    """Project a decision note to .notes/50_Decisions/."""
    dec_dir = NOTES_DIR / "50_Decisions"
    _ensure_dir(dec_dir)
    slug = f"dec-{thread_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    path = dec_dir / f"{slug}.md"

    lines = [
        "---",
        f"id: {slug}",
        f"thread_id: {thread_id}",
        f"status: accepted",
        f"created_at: {_utc_now()}",
        f"tags: [decision]",
        "---",
        "",
        f"# {decision}",
        "",
        f"**Rationale**: {rationale}",
        "",
        "## Evidence",
        "",
    ]
    for ref in evidence_refs:
        lines.append(f"- [[{ref}]]")
    lines.extend(["", f"## Source Thread", "", f"- [[40_Comms/{thread_id}]]", ""])
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def validate_note(path: Path) -> list[str]:
    """Validate an Obsidian note for frontmatter, wikilinks, tags."""
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        errors.append("Missing frontmatter delimiter")
        return errors
    try:
        end = text.index("---", 3)
    except ValueError:
        errors.append("Unclosed frontmatter")
        return errors

    fm = _parse_frontmatter(path)
    if not fm.get("id"):
        errors.append("Missing 'id' in frontmatter")
    if not fm.get("created_at") and not fm.get("date"):
        errors.append("Missing timestamp in frontmatter")
    if "tags" not in fm:
        errors.append("Missing 'tags' in frontmatter")
    return errors


def rebuild_all(events_dir: Path | None = None) -> dict[str, int]:
    """Rebuild all .notes/ projections from events (I-2 verification)."""
    if events_dir is None:
        events_dir = NOTES_DIR / "EVENTS"

    counts = {"threads": 0, "decisions": 0, "errors": 0}
    threads: dict[str, dict[str, Any]] = {}

    # Scan all event files
    for jsonl_file in sorted(events_dir.rglob("*.jsonl")):
        for line in jsonl_file.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                counts["errors"] += 1
                continue

            etype = event.get("type", "")
            payload = event.get("payload", {})

            if etype == "thread.created":
                tid = payload.get("thread_id", "")
                if tid:
                    threads[tid] = {
                        "kind": payload.get("kind", "user_agent"),
                        "workspace": payload.get("workspace", ""),
                        "run": payload.get("run", ""),
                        "participants": payload.get("participants", []),
                        "messages": [],
                        "decisions": [],
                        "status": "open",
                        "summary": "",
                        "created_at": event.get("ts_utc", ""),
                    }
            elif etype == "thread.message_appended":
                tid = payload.get("thread_id", "")
                if tid in threads:
                    threads[tid]["messages"].append({
                        "ts": event.get("ts_utc", ""),
                        "sender": payload.get("sender", ""),
                        "message": payload.get("message", ""),
                    })
            elif etype == "thread.closed":
                tid = payload.get("thread_id", "")
                if tid in threads:
                    threads[tid]["status"] = "closed"
                    threads[tid]["summary"] = payload.get("summary", "")
            elif etype == "thread.decision_recorded":
                tid = payload.get("thread_id", "")
                if tid in threads:
                    threads[tid]["decisions"].append({
                        "decision": payload.get("decision", ""),
                        "rationale": payload.get("rationale", ""),
                    })

    # Project all threads
    for tid, data in threads.items():
        project_thread(
            tid, data["kind"], data["workspace"], data["participants"],
            run=data["run"], status=data["status"],
            messages=data["messages"], decisions=data["decisions"],
            summary=data["summary"], created_at=data["created_at"],
        )
        counts["threads"] += 1

    return counts
