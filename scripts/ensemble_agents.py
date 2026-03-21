#!/usr/bin/env python3
"""
Provider-driven agent runtime, workspace, room, and memory helpers.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_events import append_event
from ensemble_hooks import check_action_policy, evaluate_critical_operation
from ensemble_paths import ensure_notes_dir
from ensemble_provider_render import build_provider_command, build_provider_render_values
from ensemble_registry import find_provider_manifest, find_room_manifest, find_workspace_manifest


AGENT_RUNTIME_SCHEMA_V = 1
ROOM_SCHEMA_V = 1
MEMORY_SCHEMA_V = 1
TEMPLATE_VAR_PATTERN = re.compile(r"\{\{\s*([^}]+)\s*\}\}")


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def _slugify(value: str, fallback: str = "item") -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-").lower()
    return slug or fallback


def _current_platform() -> str:
    if sys.platform.startswith("win"):
        return "win32"
    if sys.platform == "darwin":
        return "darwin"
    return "linux"


def _render_template(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return TEMPLATE_VAR_PATTERN.sub(lambda match: str(variables.get(match.group(1).strip(), "")), value)
    if isinstance(value, list):
        return [_render_template(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: _render_template(item, variables) for key, item in value.items()}
    return value


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def notes_agents_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "agents")


def notes_rooms_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "rooms")


def _shared_memory_dir(workspace: str | Path) -> Path:
    path = notes_agents_dir(workspace) / "_shared"
    path.mkdir(parents=True, exist_ok=True)
    return path


def agent_runtime_dir(workspace: str | Path, agent_id: str) -> Path:
    path = notes_agents_dir(workspace) / _slugify(agent_id, "agent")
    path.mkdir(parents=True, exist_ok=True)
    return path


def agent_runtime_path(workspace: str | Path, agent_id: str) -> Path:
    return agent_runtime_dir(workspace, agent_id) / "runtime.json"


def room_metadata_path(workspace: str | Path, room_id: str) -> Path:
    return notes_rooms_dir(workspace) / f"{_slugify(room_id, 'room')}.json"


def room_transcript_path(workspace: str | Path, room_id: str) -> Path:
    return notes_rooms_dir(workspace) / f"{_slugify(room_id, 'room')}.jsonl"


def room_summary_path(workspace: str | Path, room_id: str) -> Path:
    return notes_rooms_dir(workspace) / f"{_slugify(room_id, 'room')}.md"


def _memory_dir(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> Path:
    if shared:
        return _shared_memory_dir(workspace)
    if not agent_id:
        raise ValueError("agent_id is required for non-shared memory")
    return agent_runtime_dir(workspace, agent_id)


def _memory_proposals_jsonl(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> Path:
    return _memory_dir(workspace, agent_id, shared=shared) / "memory.proposed.jsonl"


def _memory_approved_jsonl(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> Path:
    return _memory_dir(workspace, agent_id, shared=shared) / "memory.approved.jsonl"


def _memory_proposed_md(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> Path:
    return _memory_dir(workspace, agent_id, shared=shared) / "memory.proposed.md"


def _memory_approved_md(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> Path:
    return _memory_dir(workspace, agent_id, shared=shared) / "memory.md"


def _persona_path(workspace: str | Path, agent_id: str) -> Path:
    return agent_runtime_dir(workspace, agent_id) / "persona.md"


def _launch_prompt_path(workspace: str | Path, agent_id: str) -> Path:
    return agent_runtime_dir(workspace, agent_id) / "launch.md"


def _log_path(workspace: str | Path, agent_id: str) -> Path:
    return agent_runtime_dir(workspace, agent_id) / "agent.log"


def _ensure_memory_files(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> None:
    target = _memory_dir(workspace, agent_id, shared=shared)
    target.mkdir(parents=True, exist_ok=True)
    proposed_md = _memory_proposed_md(workspace, agent_id, shared=shared)
    approved_md = _memory_approved_md(workspace, agent_id, shared=shared)
    if not proposed_md.exists():
        proposed_md.write_text("<!-- Proposed memory updates awaiting approval -->\n", encoding="utf-8")
    if not approved_md.exists():
        approved_md.write_text("<!-- Curated memory approved for continued reuse -->\n", encoding="utf-8")


def _load_runtime(workspace: str | Path, agent_id: str) -> dict[str, Any] | None:
    path = agent_runtime_path(workspace, agent_id)
    if not path.exists():
        return None
    return _load_json(path, None)


def _write_runtime(workspace: str | Path, agent_id: str, record: dict[str, Any]) -> Path:
    path = agent_runtime_path(workspace, agent_id)
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def _pid_running(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _sync_runtime_status(workspace: str | Path, record: dict[str, Any]) -> dict[str, Any]:
    if record.get("status") == "running" and not _pid_running(record.get("pid")):
        record["status"] = "completed"
        record["finished_at"] = record.get("finished_at") or utc_iso()
        _write_runtime(workspace, record["agent_id"], record)
    return record


def list_agent_runtimes(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for runtime_file in sorted(notes_agents_dir(workspace).glob("*/runtime.json")):
        record = _load_json(runtime_file, None)
        if not isinstance(record, dict):
            continue
        rows.append(_sync_runtime_status(workspace, record))
    try:
        from ensemble_spawn import list_spawn_records, refresh_spawn_record

        for spawn in list_spawn_records(workspace):
            refreshed = refresh_spawn_record(workspace, spawn["spawn_id"])
            rows.append(
                {
                    "agent_id": refreshed.get("agent_id"),
                    "provider_id": refreshed.get("provider_id"),
                    "status": refreshed.get("status"),
                    "workspace": refreshed.get("workspace") or {"path": refreshed.get("workspace_root")},
                    "spawn_id": refreshed.get("spawn_id"),
                    "room_id": refreshed.get("room_id"),
                    "started_at": refreshed.get("created_at"),
                    "finished_at": None if refreshed.get("status") == "running" else refreshed.get("updated_at"),
                }
            )
    except Exception:
        pass
    rows.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return rows


def _workspace_variables(project_workspace: str | Path, *, agent_id: str, task_id: str | None) -> dict[str, Any]:
    return {
        "workspace": str(Path(project_workspace).resolve()),
        "agent_id": agent_id,
        "task_id": task_id or "adhoc",
    }


def _git_repo_root(project_workspace: str | Path) -> Path | None:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=project_workspace,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip())


def _git_branch_exists(repo_root: Path, branch_name: str) -> bool:
    result = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"],
        cwd=repo_root,
        check=False,
        timeout=30,
    )
    return result.returncode == 0


def create_git_worktree(
    project_workspace: str | Path,
    *,
    agent_id: str,
    task_id: str,
    path_template: str,
    branch_prefix: str = "codex",
) -> dict[str, Any]:
    repo_root = _git_repo_root(project_workspace)
    if repo_root is None:
        raise RuntimeError("git worktree strategy requires a git repository")

    rendered_path = _render_template(path_template, _workspace_variables(project_workspace, agent_id=agent_id, task_id=task_id))
    target_path = Path(rendered_path)
    if not target_path.is_absolute():
        target_path = repo_root / target_path
    target_path = target_path.resolve()

    branch_name = f"{branch_prefix}/{_slugify(agent_id, 'agent')}/{_slugify(task_id, 'task')}"
    if target_path.exists():
        return {
            "workspace_id": "git-worktree",
            "strategy": "git-worktree",
            "path": str(target_path),
            "repo_root": str(repo_root),
            "branch": branch_name,
            "created": False,
        }

    target_path.parent.mkdir(parents=True, exist_ok=True)
    add_args = ["git", "worktree", "add"]
    if _git_branch_exists(repo_root, branch_name):
        add_args.extend([str(target_path), branch_name])
    else:
        add_args.extend(["-b", branch_name, str(target_path)])
    result = subprocess.run(
        add_args,
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git worktree add failed")
    return {
        "workspace_id": "git-worktree",
        "strategy": "git-worktree",
        "path": str(target_path),
        "repo_root": str(repo_root),
        "branch": branch_name,
        "created": True,
    }


def cleanup_git_worktree(workspace_info: dict[str, Any]) -> None:
    if workspace_info.get("strategy") != "git-worktree":
        return
    repo_root = Path(str(workspace_info.get("repo_root") or ""))
    target_path = Path(str(workspace_info.get("path") or ""))
    branch_name = str(workspace_info.get("branch") or "")
    if not repo_root.exists() or not target_path.exists():
        return
    subprocess.run(["git", "worktree", "remove", "--force", str(target_path)], cwd=repo_root, check=False, timeout=120)
    if branch_name:
        subprocess.run(["git", "branch", "-D", branch_name], cwd=repo_root, check=False, timeout=120)


def resolve_workspace_target(
    project_workspace: str | Path,
    *,
    workspace_id: str | None = None,
    path_override: str | None = None,
    agent_id: str,
    task_id: str | None,
) -> dict[str, Any]:
    if path_override:
        target_path = Path(path_override)
        if not target_path.is_absolute():
            target_path = Path(project_workspace) / target_path
        target_path.mkdir(parents=True, exist_ok=True)
        return {"workspace_id": "override", "strategy": "directory", "path": str(target_path.resolve()), "created": True}

    manifest_row = find_workspace_manifest(project_workspace, workspace_id or "root")
    if manifest_row is None:
        raise FileNotFoundError(f"Workspace manifest not found: {workspace_id or 'root'}")
    manifest = manifest_row["data"]
    strategy = str(manifest.get("strategy") or "inherit")
    branch_prefix = str(manifest.get("branch_prefix") or "codex")
    path_value = str(_render_template(manifest.get("path") or ".", _workspace_variables(project_workspace, agent_id=agent_id, task_id=task_id)))

    if strategy == "git-worktree":
        return create_git_worktree(
            project_workspace,
            agent_id=agent_id,
            task_id=task_id or "adhoc",
            path_template=path_value,
            branch_prefix=branch_prefix,
        )

    target_path = Path(path_value)
    if not target_path.is_absolute():
        target_path = Path(project_workspace) / target_path
    create_if_missing = bool(manifest.get("create_if_missing", False))
    if create_if_missing:
        target_path.mkdir(parents=True, exist_ok=True)
    return {
        "workspace_id": manifest.get("workspace_id"),
        "strategy": strategy,
        "path": str(target_path.resolve()),
        "created": create_if_missing,
    }


def _render_memory_markdown(target_label: str, approvals: list[dict[str, Any]]) -> str:
    lines = ["<!-- Curated memory approved for continued reuse -->", "", f"# Memory: {target_label}", ""]
    if not approvals:
        lines.append("- No approved memory entries yet.")
        lines.append("")
        return "\n".join(lines)
    for entry in approvals:
        lines.append(
            f"- **[{entry.get('approved_at', '')}]** {entry.get('text', '')} "
            f"_(source: {entry.get('source', 'manual')}, approved_by: {entry.get('approved_by', 'unknown')})_"
        )
    lines.append("")
    return "\n".join(lines)


def _render_proposed_memory_markdown(target_label: str, proposals: list[dict[str, Any]], approved_ids: set[str]) -> str:
    lines = ["<!-- Proposed memory updates awaiting approval -->", "", f"# Proposed Memory: {target_label}", ""]
    if not proposals:
        lines.append("- No pending proposals.")
        lines.append("")
        return "\n".join(lines)
    for entry in proposals:
        status = "approved" if entry.get("proposal_id") in approved_ids else "pending"
        lines.append(
            f"- **{entry.get('proposal_id')}** [{entry.get('ts_utc', '')}] ({status}) "
            f"{entry.get('text', '')} _(source: {entry.get('source', 'manual')}, actor: {entry.get('actor', 'unknown')})_"
        )
    lines.append("")
    return "\n".join(lines)


def _rewrite_memory_views(workspace: str | Path, agent_id: str | None = None, *, shared: bool = False) -> None:
    proposals = _read_jsonl(_memory_proposals_jsonl(workspace, agent_id, shared=shared))
    approvals = _read_jsonl(_memory_approved_jsonl(workspace, agent_id, shared=shared))
    approved_ids = {row.get("proposal_id", "") for row in approvals}
    target_label = "shared" if shared else str(agent_id)
    _memory_proposed_md(workspace, agent_id, shared=shared).write_text(
        _render_proposed_memory_markdown(target_label, proposals, approved_ids),
        encoding="utf-8",
    )
    _memory_approved_md(workspace, agent_id, shared=shared).write_text(
        _render_memory_markdown(target_label, approvals),
        encoding="utf-8",
    )


def memory_snapshot(workspace: str | Path, *, agent_id: str | None = None, shared: bool = False) -> dict[str, Any]:
    proposals = _read_jsonl(_memory_proposals_jsonl(workspace, agent_id, shared=shared))
    approvals = _read_jsonl(_memory_approved_jsonl(workspace, agent_id, shared=shared))
    approved_ids = {row.get("proposal_id", "") for row in approvals}
    pending = [row for row in proposals if row.get("proposal_id") not in approved_ids]
    return {
        "target": "shared" if shared else agent_id,
        "proposals": proposals,
        "approved": approvals,
        "pending": pending,
        "persona_path": None if shared else str(_persona_path(workspace, str(agent_id))),
    }


def propose_memory(
    workspace: str | Path,
    *,
    text: str,
    actor: str,
    source: str = "manual",
    agent_id: str | None = None,
    shared: bool = False,
) -> dict[str, Any]:
    _ensure_memory_files(workspace, agent_id, shared=shared)
    proposal = {
        "memory_v": MEMORY_SCHEMA_V,
        "proposal_id": f"MP-{uuid.uuid4().hex[:10]}",
        "ts_utc": utc_iso(),
        "actor": actor,
        "source": source,
        "text": text,
        "shared": shared,
        "agent_id": None if shared else agent_id,
    }
    _append_jsonl(_memory_proposals_jsonl(workspace, agent_id, shared=shared), proposal)
    _rewrite_memory_views(workspace, agent_id, shared=shared)
    append_event(
        workspace,
        event_type="MEMORY_PROPOSED",
        actor={"type": "agent" if not shared else "system", "name": actor},
        payload={"proposal_id": proposal["proposal_id"], "shared": shared, "agent_id": agent_id, "source": source},
    )
    return proposal


def approve_memory(
    workspace: str | Path,
    *,
    proposal_id: str,
    approved_by: str,
    agent_id: str | None = None,
    shared: bool = False,
) -> dict[str, Any]:
    _ensure_memory_files(workspace, agent_id, shared=shared)
    proposals = _read_jsonl(_memory_proposals_jsonl(workspace, agent_id, shared=shared))
    proposal = next((row for row in proposals if row.get("proposal_id") == proposal_id), None)
    if proposal is None:
        raise FileNotFoundError(f"Memory proposal not found: {proposal_id}")
    approvals = _read_jsonl(_memory_approved_jsonl(workspace, agent_id, shared=shared))
    if any(row.get("proposal_id") == proposal_id for row in approvals):
        return next(row for row in approvals if row.get("proposal_id") == proposal_id)
    approval = {
        "memory_v": MEMORY_SCHEMA_V,
        "proposal_id": proposal["proposal_id"],
        "approved_at": utc_iso(),
        "approved_by": approved_by,
        "source": proposal.get("source"),
        "text": proposal.get("text"),
        "shared": shared,
        "agent_id": None if shared else agent_id,
    }
    _append_jsonl(_memory_approved_jsonl(workspace, agent_id, shared=shared), approval)
    _rewrite_memory_views(workspace, agent_id, shared=shared)
    append_event(
        workspace,
        event_type="MEMORY_APPROVED",
        actor={"type": "system", "name": approved_by},
        payload={"proposal_id": proposal_id, "shared": shared, "agent_id": agent_id},
    )
    return approval


def create_room(
    workspace: str | Path,
    *,
    room_id: str,
    name: str | None = None,
    members: list[str] | None = None,
    shared_files: list[str] | None = None,
    summary_mode: str | None = None,
    actor: str = "CLI",
) -> dict[str, Any]:
    manifest_row = find_room_manifest(workspace, room_id)
    manifest = manifest_row["data"] if manifest_row else {}
    record = _load_json(room_metadata_path(workspace, room_id), None)
    if isinstance(record, dict):
        return record
    record = {
        "room_v": ROOM_SCHEMA_V,
        "room_id": room_id,
        "name": name or manifest.get("name") or room_id,
        "status": "open",
        "members": members or manifest.get("members") or [],
        "shared_files": shared_files or manifest.get("shared_files") or [],
        "summary_mode": summary_mode or manifest.get("summary_mode") or "concise",
        "created_at": utc_iso(),
        "updated_at": utc_iso(),
        "closed_at": None,
        "message_count": 0,
    }
    room_metadata_path(workspace, room_id).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    append_event(workspace, event_type="ROOM_CREATED", actor={"type": "agent", "name": actor}, payload={"room_id": room_id, "members": record["members"]})
    return record


def list_rooms(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(notes_rooms_dir(workspace).glob("*.json")):
        record = _load_json(path, None)
        if isinstance(record, dict) and record.get("room_id"):
            rows.append(record)
    rows.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return rows


def room_snapshot(workspace: str | Path, room_id: str, *, limit: int | None = None) -> dict[str, Any]:
    metadata = _load_json(room_metadata_path(workspace, room_id), None)
    if not isinstance(metadata, dict):
        raise FileNotFoundError(f"Room not found: {room_id}")
    messages = _read_jsonl(room_transcript_path(workspace, room_id))
    if limit is not None:
        messages = messages[-limit:]
    return {"metadata": metadata, "messages": messages}


def room_message(
    workspace: str | Path,
    *,
    room_id: str,
    sender: str,
    text: str,
    files: list[str] | None = None,
) -> dict[str, Any]:
    metadata = create_room(workspace, room_id=room_id)
    entry = {
        "message_id": f"RM-{uuid.uuid4().hex[:10]}",
        "ts_utc": utc_iso(),
        "sender": sender,
        "text": text,
        "files": files or [],
    }
    _append_jsonl(room_transcript_path(workspace, room_id), entry)
    metadata["updated_at"] = entry["ts_utc"]
    metadata["message_count"] = int(metadata.get("message_count", 0)) + 1
    if files:
        merged = set(metadata.get("shared_files", []))
        merged.update(files)
        metadata["shared_files"] = sorted(merged)
    room_metadata_path(workspace, room_id).write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    append_event(workspace, event_type="ROOM_MESSAGE", actor={"type": "agent", "name": sender}, payload={"room_id": room_id, "files": files or []})
    return entry


def close_room(workspace: str | Path, *, room_id: str, actor: str = "CLI") -> dict[str, Any]:
    snapshot = room_snapshot(workspace, room_id)
    metadata = snapshot["metadata"]
    messages = snapshot["messages"]
    sender_counts: dict[str, int] = {}
    for message in messages:
        sender = str(message.get("sender") or "unknown")
        sender_counts[sender] = sender_counts.get(sender, 0) + 1
    lines = [
        f"# Room Summary: {metadata.get('name')}",
        "",
        f"- Room ID: {room_id}",
        f"- Closed At: {utc_iso()}",
        f"- Messages: {len(messages)}",
        f"- Members: {', '.join(metadata.get('members', [])) or 'none'}",
        f"- Shared Files: {', '.join(metadata.get('shared_files', [])) or 'none'}",
        "",
        "## Senders",
        "",
    ]
    for sender, count in sorted(sender_counts.items()):
        lines.append(f"- {sender}: {count}")
    lines.extend(["", "## Recent Messages", ""])
    if messages:
        for message in messages[-10:]:
            lines.append(f"- [{message.get('ts_utc')}] {message.get('sender')}: {message.get('text')}")
    else:
        lines.append("- No messages recorded.")
    lines.append("")
    summary_path = room_summary_path(workspace, room_id)
    summary_path.write_text("\n".join(lines), encoding="utf-8")
    metadata["status"] = "closed"
    metadata["closed_at"] = utc_iso()
    metadata["updated_at"] = metadata["closed_at"]
    metadata["summary_path"] = str(summary_path)
    room_metadata_path(workspace, room_id).write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    append_artifact_manifest(workspace, artifact_type="room_summary", path=str(summary_path), actor=actor, metadata={"room_id": room_id})
    append_event(workspace, event_type="ROOM_CLOSED", actor={"type": "agent", "name": actor}, payload={"room_id": room_id, "summary_path": str(summary_path)})
    return metadata


def _build_launch_prompt(
    *,
    agent_id: str,
    provider_id: str,
    room_id: str | None,
    workspace_info: dict[str, Any],
    task_prompt: str,
    persona_path: Path,
    memory_path: Path,
    shared_memory_path: Path,
    skills: list[str],
    workflows: list[str],
    shared_files: list[str],
) -> str:
    lines = [
        f"# Launch: {agent_id}",
        "",
        f"- Provider: {provider_id}",
        f"- Workspace: {workspace_info.get('path')}",
        f"- Workspace Strategy: {workspace_info.get('strategy')}",
        f"- Room: {room_id or 'none'}",
        f"- Persona: {persona_path}",
        f"- Long-Term Memory: {memory_path}",
        f"- Shared Memory: {shared_memory_path}",
        f"- Skills: {', '.join(skills) or 'none'}",
        f"- Workflows: {', '.join(workflows) or 'none'}",
        f"- Shared Files: {', '.join(shared_files) or 'none'}",
        "",
        "## Task",
        "",
        task_prompt,
        "",
    ]
    return "\n".join(lines)


def _render_command(provider: dict[str, Any], variables: dict[str, Any]) -> list[str]:
    return build_provider_command(provider, variables)


def hire_agent(
    workspace: str | Path,
    *,
    agent_id: str,
    provider_id: str,
    task_prompt: str,
    actor: str = "CLI",
    task_id: str | None = None,
    room_id: str | None = None,
    workspace_id: str = "root",
    workspace_path: str | None = None,
    persona: str | None = None,
    skills: list[str] | None = None,
    workflows: list[str] | None = None,
    shared_files: list[str] | None = None,
    spawn_process: bool = True,
) -> dict[str, Any]:
    provider_row = find_provider_manifest(workspace, provider_id)
    if provider_row is None:
        raise FileNotFoundError(f"Provider manifest not found: {provider_id}")
    provider = provider_row["data"]
    supported_platforms = provider.get("supported_platforms") or []
    if supported_platforms and _current_platform() not in supported_platforms:
        raise RuntimeError(f"Provider '{provider_id}' does not support platform {_current_platform()}")

    gate = check_action_policy(
        workspace,
        action="spawn.start",
        actor=actor,
        task_id=task_id,
        subject_ref=task_id or provider_id,
    )
    if gate["status"] == "blocked":
        return gate

    _ensure_memory_files(workspace, agent_id)
    _ensure_memory_files(workspace, shared=True)
    if room_id:
        create_room(workspace, room_id=room_id, members=["USER", agent_id], shared_files=shared_files or [], actor=actor)

    workspace_info = resolve_workspace_target(
        workspace,
        workspace_id=workspace_id,
        path_override=workspace_path,
        agent_id=agent_id,
        task_id=task_id,
    )

    persona_file = _persona_path(workspace, agent_id)
    if persona and not persona_file.exists():
        persona_file.write_text(persona.strip() + "\n", encoding="utf-8")
    elif not persona_file.exists():
        persona_file.write_text("# Persona\n\n- TBD\n", encoding="utf-8")

    prompt_file = _launch_prompt_path(workspace, agent_id)
    prompt_file.write_text(
        _build_launch_prompt(
            agent_id=agent_id,
            provider_id=provider_id,
            room_id=room_id,
            workspace_info=workspace_info,
            task_prompt=task_prompt,
            persona_path=persona_file,
            memory_path=_memory_approved_md(workspace, agent_id),
            shared_memory_path=_memory_approved_md(workspace, shared=True),
            skills=skills or [],
            workflows=workflows or [],
            shared_files=shared_files or [],
        ),
        encoding="utf-8",
    )

    variables = build_provider_render_values(
        workspace_root=workspace_info["path"],
        workspace_path=workspace_info["path"],
        task_id=task_id or "adhoc",
        agent_id=agent_id,
        room_id=room_id,
        memory_file=_memory_approved_md(workspace, agent_id),
        persona_file=persona_file,
        shared_memory_file=_memory_approved_md(workspace, shared=True),
        task_prompt=task_prompt,
        task_prompt_file=prompt_file,
    )
    command = _render_command(provider, variables)
    critical_check = evaluate_critical_operation(workspace, command_tokens=command, touched_files=shared_files or [])

    record: dict[str, Any] = {
        "agent_runtime_v": AGENT_RUNTIME_SCHEMA_V,
        "agent_id": agent_id,
        "provider_id": provider_id,
        "status": "planned",
        "pid": None,
        "task_id": task_id,
        "room_id": room_id,
        "workspace_id": workspace_id,
        "workspace": workspace_info,
        "command": command,
        "started_at": utc_iso(),
        "finished_at": None,
        "skills": skills or [],
        "workflows": workflows or [],
        "shared_files": shared_files or [],
        "persona_path": str(persona_file),
        "prompt_file": str(prompt_file),
        "log_file": str(_log_path(workspace, agent_id)),
        "last_error": None,
    }

    if not critical_check["allowed"]:
        record["status"] = "blocked"
        record["finished_at"] = utc_iso()
        record["last_error"] = "; ".join(critical_check["violations"])
        _write_runtime(workspace, agent_id, record)
        append_event(
            workspace,
            event_type="HOOK_BLOCKED",
            actor={"type": "system", "name": actor},
            payload={"agent_id": agent_id, "provider_id": provider_id, "violations": critical_check["violations"]},
            severity="error",
        )
        return record

    if spawn_process:
        log_path = _log_path(workspace, agent_id)
        log_handle = log_path.open("a", encoding="utf-8")
        try:
            popen_kwargs: dict[str, Any] = {
                "cwd": workspace_info["path"],
                "stdout": log_handle,
                "stderr": subprocess.STDOUT,
                "stdin": subprocess.DEVNULL,
                "text": True,
            }
            if _current_platform() == "win32":
                popen_kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            else:
                popen_kwargs["start_new_session"] = True
            process = subprocess.Popen(command, **popen_kwargs)
            record["pid"] = process.pid
            record["status"] = "running"
        except FileNotFoundError as exc:
            record["status"] = "missing-binary"
            record["finished_at"] = utc_iso()
            record["last_error"] = str(exc)
        except Exception as exc:  # pragma: no cover
            record["status"] = "failed"
            record["finished_at"] = utc_iso()
            record["last_error"] = str(exc)
            if workspace_info.get("strategy") == "git-worktree" and workspace_info.get("created"):
                cleanup_git_worktree(workspace_info)
        finally:
            log_handle.close()
    else:
        record["status"] = "planned"

    runtime_path = _write_runtime(workspace, agent_id, record)
    append_artifact_manifest(
        workspace,
        artifact_type="agent_launch",
        path=str(prompt_file),
        actor=actor,
        metadata={"agent_id": agent_id, "provider_id": provider_id, "room_id": room_id, "workspace_path": workspace_info["path"]},
    )
    append_event(
        workspace,
        event_type="AGENT_HIRED",
        actor={"type": "agent", "name": actor},
        payload={"agent_id": agent_id, "provider_id": provider_id, "status": record["status"], "runtime_path": str(runtime_path)},
    )
    return record


def stop_agent(workspace: str | Path, *, agent_id: str, cleanup_workspace: bool = False, actor: str = "CLI") -> dict[str, Any]:
    record = _load_runtime(workspace, agent_id)
    if record is None:
        raise FileNotFoundError(f"Agent runtime not found: {agent_id}")
    pid = record.get("pid")
    if _pid_running(pid):
        if _current_platform() == "win32":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, timeout=60)
        else:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
    record["status"] = "stopped"
    record["finished_at"] = utc_iso()
    if cleanup_workspace:
        cleanup_git_worktree(record.get("workspace") or {})
    _write_runtime(workspace, agent_id, record)
    append_event(workspace, event_type="AGENT_STOPPED", actor={"type": "agent", "name": actor}, payload={"agent_id": agent_id, "cleanup_workspace": cleanup_workspace})
    return record


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens agent runtime helpers")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    hire_parser = subparsers.add_parser("hire")
    hire_parser.add_argument("--agent", required=True)
    hire_parser.add_argument("--provider", required=True)
    hire_parser.add_argument("--prompt", required=True)
    hire_parser.add_argument("--task")
    hire_parser.add_argument("--room")
    hire_parser.add_argument("--workspace-id", default="root")
    hire_parser.add_argument("--workspace-path")
    hire_parser.add_argument("--persona")
    hire_parser.add_argument("--skills", default="")
    hire_parser.add_argument("--workflows", default="")
    hire_parser.add_argument("--share-file", action="append", default=[])
    hire_parser.add_argument("--no-spawn", action="store_true")
    hire_parser.add_argument("--actor", default="CLI")

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--json", action="store_true")

    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("--agent", required=True)

    stop_parser = subparsers.add_parser("stop")
    stop_parser.add_argument("--agent", required=True)
    stop_parser.add_argument("--cleanup-workspace", action="store_true")
    stop_parser.add_argument("--actor", default="CLI")

    room_create = subparsers.add_parser("room-create")
    room_create.add_argument("--room", required=True)
    room_create.add_argument("--name")
    room_create.add_argument("--members", default="")
    room_create.add_argument("--share-file", action="append", default=[])
    room_create.add_argument("--summary-mode")
    room_create.add_argument("--actor", default="CLI")

    room_say = subparsers.add_parser("room-say")
    room_say.add_argument("--room", required=True)
    room_say.add_argument("--sender", required=True)
    room_say.add_argument("--text", required=True)
    room_say.add_argument("--share-file", action="append", default=[])

    room_show = subparsers.add_parser("room-show")
    room_show.add_argument("--room", required=True)
    room_show.add_argument("--limit", type=int, default=20)

    room_list = subparsers.add_parser("room-list")
    room_list.add_argument("--json", action="store_true")

    room_close = subparsers.add_parser("room-close")
    room_close.add_argument("--room", required=True)
    room_close.add_argument("--actor", default="CLI")

    mem_propose = subparsers.add_parser("memory-propose")
    mem_propose.add_argument("--text", required=True)
    mem_propose.add_argument("--agent")
    mem_propose.add_argument("--shared", action="store_true")
    mem_propose.add_argument("--actor", default="CLI")
    mem_propose.add_argument("--source", default="manual")

    mem_approve = subparsers.add_parser("memory-approve")
    mem_approve.add_argument("--proposal", required=True)
    mem_approve.add_argument("--agent")
    mem_approve.add_argument("--shared", action="store_true")
    mem_approve.add_argument("--actor", default="CLI")

    mem_show = subparsers.add_parser("memory-show")
    mem_show.add_argument("--agent")
    mem_show.add_argument("--shared", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "hire":
        result = hire_agent(
            args.workspace,
            agent_id=args.agent,
            provider_id=args.provider,
            task_prompt=args.prompt,
            actor=args.actor,
            task_id=args.task,
            room_id=args.room,
            workspace_id=args.workspace_id,
            workspace_path=args.workspace_path,
            persona=args.persona,
            skills=[item for item in args.skills.split(",") if item],
            workflows=[item for item in args.workflows.split(",") if item],
            shared_files=args.share_file,
            spawn_process=not args.no_spawn,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("status") not in {"failed", "blocked", "missing-binary"} else 1

    if args.command == "list":
        rows = list_agent_runtimes(args.workspace)
        if args.json:
            print(json.dumps(rows, ensure_ascii=False, indent=2))
        else:
            for row in rows:
                print(f"{row.get('agent_id')}\t{row.get('provider_id')}\t{row.get('status')}\t{row.get('workspace', {}).get('path')}")
        return 0

    if args.command == "show":
        record = _load_runtime(args.workspace, args.agent)
        if record is None:
            parser.error(f"Agent not found: {args.agent}")
        print(json.dumps(_sync_runtime_status(args.workspace, record), ensure_ascii=False, indent=2))
        return 0

    if args.command == "stop":
        print(json.dumps(stop_agent(args.workspace, agent_id=args.agent, cleanup_workspace=args.cleanup_workspace, actor=args.actor), ensure_ascii=False, indent=2))
        return 0

    if args.command == "room-create":
        members = [item.strip() for item in args.members.split(",") if item.strip()]
        print(json.dumps(create_room(args.workspace, room_id=args.room, name=args.name, members=members, shared_files=args.share_file, summary_mode=args.summary_mode, actor=args.actor), ensure_ascii=False, indent=2))
        return 0

    if args.command == "room-say":
        print(json.dumps(room_message(args.workspace, room_id=args.room, sender=args.sender, text=args.text, files=args.share_file), ensure_ascii=False, indent=2))
        return 0

    if args.command == "room-show":
        print(json.dumps(room_snapshot(args.workspace, args.room, limit=args.limit), ensure_ascii=False, indent=2))
        return 0

    if args.command == "room-list":
        rows = list_rooms(args.workspace)
        if args.json:
            print(json.dumps(rows, ensure_ascii=False, indent=2))
        else:
            for row in rows:
                print(f"{row.get('room_id')}\t{row.get('status')}\t{row.get('message_count')}")
        return 0

    if args.command == "room-close":
        print(json.dumps(close_room(args.workspace, room_id=args.room, actor=args.actor), ensure_ascii=False, indent=2))
        return 0

    if args.command == "memory-propose":
        if not args.shared and not args.agent:
            parser.error("--agent is required unless --shared is set")
        print(json.dumps(propose_memory(args.workspace, text=args.text, actor=args.actor, source=args.source, agent_id=args.agent, shared=args.shared), ensure_ascii=False, indent=2))
        return 0

    if args.command == "memory-approve":
        if not args.shared and not args.agent:
            parser.error("--agent is required unless --shared is set")
        print(json.dumps(approve_memory(args.workspace, proposal_id=args.proposal, approved_by=args.actor, agent_id=args.agent, shared=args.shared), ensure_ascii=False, indent=2))
        return 0

    if args.command == "memory-show":
        if not args.shared and not args.agent:
            parser.error("--agent is required unless --shared is set")
        print(json.dumps(memory_snapshot(args.workspace, agent_id=args.agent, shared=args.shared), ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


__all__ = [
    "approve_memory",
    "close_room",
    "create_room",
    "hire_agent",
    "list_agent_runtimes",
    "list_rooms",
    "memory_snapshot",
    "propose_memory",
    "resolve_workspace_target",
    "room_message",
    "room_snapshot",
    "stop_agent",
]


if __name__ == "__main__":
    raise SystemExit(main())
