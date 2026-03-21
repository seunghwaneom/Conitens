#!/usr/bin/env python3
"""
Persistent persona and memory helpers for Conitens-hired agents.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_paths import ensure_notes_dir


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(value: str) -> str:
    text = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    while "--" in text:
        text = text.replace("--", "-")
    return text.strip("-") or "agent"


def agent_memory_key(provider_id: str, agent_id: str) -> str:
    return f"{slugify(provider_id)}--{slugify(agent_id)}"


def personas_dir(workspace: str | Path) -> Path:
    path = Path(workspace) / ".agent" / "personas"
    path.mkdir(parents=True, exist_ok=True)
    return path


def shared_memory_file(workspace: str | Path) -> Path:
    path = Path(workspace) / ".agent" / "shared-memory.md"
    if not path.exists():
        path.write_text("# Shared Memory\n\n", encoding="utf-8")
    return path


def agent_persona_file(workspace: str | Path, provider_id: str, agent_id: str) -> Path:
    path = personas_dir(workspace) / f"{agent_memory_key(provider_id, agent_id)}.md"
    if not path.exists():
        path.write_text(
            "\n".join(
                [
                    f"# Persona: {agent_id}",
                    "",
                    f"- Provider: {provider_id}",
                    "- Voice:",
                    "- Strengths:",
                    "- Constraints:",
                    "- Preferred workflows:",
                    "- Lessons:",
                    "",
                ]
            ),
            encoding="utf-8",
        )
    return path


def memories_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "memories")


def long_term_memory_file(workspace: str | Path, provider_id: str, agent_id: str) -> Path:
    return memories_dir(workspace) / f"{agent_memory_key(provider_id, agent_id)}.jsonl"


def initialize_agent_memory(workspace: str | Path, provider_id: str, agent_id: str) -> dict[str, str]:
    persona = agent_persona_file(workspace, provider_id, agent_id)
    shared = shared_memory_file(workspace)
    long_term = long_term_memory_file(workspace, provider_id, agent_id)
    if not long_term.exists():
        long_term.write_text("", encoding="utf-8")
    return {
        "agent_key": agent_memory_key(provider_id, agent_id),
        "persona_file": str(persona),
        "shared_memory_file": str(shared),
        "long_term_memory_file": str(long_term),
    }


def append_long_term_memory(
    workspace: str | Path,
    *,
    provider_id: str,
    agent_id: str,
    author: str,
    text: str,
    tags: list[str] | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    paths = initialize_agent_memory(workspace, provider_id, agent_id)
    record = {
        "ts_utc": utc_iso(),
        "provider_id": provider_id,
        "agent_id": agent_id,
        "agent_key": paths["agent_key"],
        "author": author,
        "text": text,
        "tags": tags or [],
        "task_id": task_id,
    }
    target = Path(paths["long_term_memory_file"])
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    append_event(
        workspace,
        event_type="MEMORY_APPENDED",
        actor={"type": "agent", "name": author},
        scope={"task_id": task_id, "correlation_id": task_id, "agent_key": paths["agent_key"]},
        payload={"kind": "longterm", "provider_id": provider_id, "agent_id": agent_id, "tags": tags or []},
    )
    append_artifact_manifest(
        workspace,
        artifact_type="agent_memory",
        path=str(target),
        actor=author,
        task_id=task_id,
        correlation_id=task_id,
        subject_ref=paths["agent_key"],
        metadata={"kind": "longterm", "provider_id": provider_id, "agent_id": agent_id},
    )
    return record


def append_shared_memory(
    workspace: str | Path,
    *,
    author: str,
    text: str,
    task_id: str | None = None,
) -> dict[str, Any]:
    target = shared_memory_file(workspace)
    entry = f"- [{utc_iso()}] {author}: {text}\n"
    with target.open("a", encoding="utf-8") as handle:
        handle.write(entry)
    append_event(
        workspace,
        event_type="MEMORY_APPENDED",
        actor={"type": "agent", "name": author},
        scope={"task_id": task_id, "correlation_id": task_id, "subject_ref": "shared-memory"},
        payload={"kind": "shared", "text": text},
    )
    append_artifact_manifest(
        workspace,
        artifact_type="shared_memory",
        path=str(target),
        actor=author,
        task_id=task_id,
        correlation_id=task_id,
        subject_ref="shared-memory",
        metadata={"kind": "shared"},
    )
    return {"path": str(target), "entry": entry.rstrip("\n")}


def show_memory(
    workspace: str | Path,
    *,
    kind: str,
    provider_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    if kind == "shared":
        target = shared_memory_file(workspace)
        return {"kind": kind, "path": str(target), "content": target.read_text(encoding="utf-8")}
    if not provider_id or not agent_id:
        raise ValueError("provider_id and agent_id are required for persona/longterm memory views.")
    if kind == "persona":
        target = agent_persona_file(workspace, provider_id, agent_id)
        return {"kind": kind, "path": str(target), "content": target.read_text(encoding="utf-8")}
    if kind == "longterm":
        target = long_term_memory_file(workspace, provider_id, agent_id)
        rows = []
        if target.exists():
            for line in target.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                rows.append(json.loads(line))
        return {"kind": kind, "path": str(target), "entries": rows}
    raise ValueError(f"Unsupported memory kind: {kind}")

