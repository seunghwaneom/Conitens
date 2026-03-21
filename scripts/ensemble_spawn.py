#!/usr/bin/env python3
"""
Subagent spawning and per-task workspace routing.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_artifacts import append_artifact_manifest
from ensemble_agents import cleanup_git_worktree, resolve_workspace_target
from ensemble_contracts import parse_simple_yaml
from ensemble_events import append_event
from ensemble_handoff import create_handoff, transition_handoff
from ensemble_hooks import check_action_policy
from ensemble_memory import initialize_agent_memory
from ensemble_paths import ensure_notes_dir
from ensemble_provider_render import build_provider_command, build_provider_render_values


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def providers_dir(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent" / "providers"


def workspaces_dir(workspace: str | Path) -> Path:
    return Path(workspace) / ".agent" / "workspaces"


def subagents_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "subagents")


def subagent_active_dir(workspace: str | Path) -> Path:
    path = subagents_dir(workspace) / "ACTIVE"
    path.mkdir(parents=True, exist_ok=True)
    return path


def subagent_completed_dir(workspace: str | Path) -> Path:
    path = subagents_dir(workspace) / "COMPLETED"
    path.mkdir(parents=True, exist_ok=True)
    return path


def subagent_logs_dir(workspace: str | Path) -> Path:
    path = subagents_dir(workspace) / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_yaml_rows(directory: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not directory.exists():
        return rows
    for path in sorted(directory.glob("*.yaml")) + sorted(directory.glob("*.yml")):
        data = parse_simple_yaml(path.read_text(encoding="utf-8"))
        data["_path"] = str(path)
        rows.append(data)
    return rows


def load_provider_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    return _load_yaml_rows(providers_dir(workspace))


def load_workspace_manifests(workspace: str | Path) -> list[dict[str, Any]]:
    return _load_yaml_rows(workspaces_dir(workspace))


def get_provider_manifest(workspace: str | Path, provider_id: str) -> dict[str, Any]:
    for row in load_provider_manifests(workspace):
        if row.get("provider_id") == provider_id:
            return row
    raise FileNotFoundError(f"Provider manifest not found: {provider_id}")


def get_workspace_manifest(workspace: str | Path, workspace_id: str) -> dict[str, Any]:
    for row in load_workspace_manifests(workspace):
        if row.get("workspace_id") == workspace_id:
            return row
    raise FileNotFoundError(f"Workspace manifest not found: {workspace_id}")


def next_spawn_id(workspace: str | Path) -> str:
    prefix = datetime.now().strftime("S-%Y%m%d-")
    max_num = 0
    for path in subagent_active_dir(workspace).glob(f"{prefix}*.json"):
        try:
            max_num = max(max_num, int(path.stem.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    for path in subagent_completed_dir(workspace).glob(f"{prefix}*.json"):
        try:
            max_num = max(max_num, int(path.stem.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefix}{max_num + 1:03d}"


def spawn_record_path(workspace: str | Path, spawn_id: str, *, completed: bool = False) -> Path:
    base = subagent_completed_dir(workspace) if completed else subagent_active_dir(workspace)
    return base / f"{spawn_id}.json"


def list_spawn_records(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for directory in (subagent_active_dir(workspace), subagent_completed_dir(workspace)):
        for path in sorted(directory.glob("S-*.json")):
            rows.append(json.loads(path.read_text(encoding="utf-8")))
    rows.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return rows


def read_spawn_record(workspace: str | Path, spawn_id: str) -> dict[str, Any]:
    for directory in (subagent_active_dir(workspace), subagent_completed_dir(workspace)):
        path = directory / f"{spawn_id}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"Spawn record not found: {spawn_id}")


def _write_spawn_record(workspace: str | Path, record: dict[str, Any]) -> Path:
    completed = record.get("status") in {"completed", "failed", "stopped"}
    target = spawn_record_path(workspace, record["spawn_id"], completed=completed)
    target.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    sibling = spawn_record_path(workspace, record["spawn_id"], completed=not completed)
    if sibling.exists():
        sibling.unlink()
    return target


def _build_command(provider: dict[str, Any], values: dict[str, Any]) -> list[str]:
    return build_provider_command(provider, values)


def _pid_is_running(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return str(pid) in result.stdout
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def refresh_spawn_record(workspace: str | Path, spawn_id: str) -> dict[str, Any]:
    record = read_spawn_record(workspace, spawn_id)
    if record.get("status") == "running" and not _pid_is_running(record.get("pid")):
        record["status"] = "completed"
        record["updated_at"] = utc_iso()
        workspace_info = record.get("workspace", {})
        if isinstance(workspace_info, dict) and workspace_info.get("strategy") == "git-worktree" and workspace_info.get("created"):
            cleanup_git_worktree(workspace_info)
            record["workspace_cleaned"] = True
        _write_spawn_record(workspace, record)
    return record


def start_spawn(
    workspace: str | Path,
    *,
    provider_id: str,
    agent_id: str,
    workspace_id: str,
    actor: str = "CLI",
    task_id: str | None = None,
    room_id: str | None = None,
    summary: str | None = None,
) -> dict[str, Any]:
    gate = check_action_policy(
        workspace,
        action="spawn.start",
        actor=actor,
        task_id=task_id,
        subject_ref=task_id or provider_id,
    )
    if gate["status"] == "blocked":
        return gate

    provider = get_provider_manifest(workspace, provider_id)
    workspace_manifest = get_workspace_manifest(workspace, workspace_id)
    workspace_info = resolve_workspace_target(
        workspace,
        workspace_id=workspace_id,
        agent_id=agent_id,
        task_id=task_id,
    )
    workspace_root = Path(str(workspace_info.get("path") or workspace)).resolve()
    workspace_root.mkdir(parents=True, exist_ok=True)
    memory_paths = initialize_agent_memory(workspace, provider_id, agent_id)
    spawn_id = next_spawn_id(workspace)
    log_file = subagent_logs_dir(workspace) / f"{spawn_id}.log"
    render_values = build_provider_render_values(
        workspace_root=workspace_root,
        workspace_path=workspace_root,
        task_id=task_id,
        agent_id=agent_id,
        room_id=room_id,
        spawn_id=spawn_id,
        memory_file=memory_paths["long_term_memory_file"],
        persona_file=memory_paths["persona_file"],
        shared_memory_file=memory_paths["shared_memory_file"],
        task_prompt=summary,
    )
    command = _build_command(provider, render_values)
    executable = command[0]
    if shutil.which(executable) is None and not Path(executable).exists():
        raise FileNotFoundError(f"Provider command not found: {executable}")

    env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
        "CONITENS_SPAWN_ID": spawn_id,
        "CONITENS_TASK_ID": task_id or "",
        "CONITENS_ROOM_ID": room_id or "",
        "CONITENS_PROVIDER_ID": provider_id,
        "CONITENS_AGENT_ID": agent_id,
        "CONITENS_WORKSPACE_ROOT": str(workspace_root),
        "CONITENS_MEMORY_FILE": memory_paths["long_term_memory_file"],
        "CONITENS_PERSONA_FILE": memory_paths["persona_file"],
        "CONITENS_SHARED_MEMORY_FILE": memory_paths["shared_memory_file"],
    }
    with log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"$ {' '.join(command)}\n")
        process = subprocess.Popen(
            command,
            cwd=str(workspace_root),
            stdout=handle,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=(os.name != "nt"),
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            env=env,
        )
        time.sleep(0.05)
        if process.poll() is not None:
            process.wait(timeout=0)

    handoff = create_handoff(
        workspace,
        from_actor=actor,
        to_actor=agent_id,
        summary=summary or f"Spawned {provider_id} agent {agent_id}",
        task_id=task_id,
        correlation_id=spawn_id,
        artifact_type="subagent",
        files=[str(log_file)],
        owner_transfer=False,
        worktree_id=workspace_id,
        lease_paths=[f"workspace:{workspace_id}"],
    )
    transition_handoff(workspace, handoff_id=handoff["handoff_id"], state="started", actor=actor, detail="Subagent process launched.")
    record = {
        "schema_v": 1,
        "spawn_id": spawn_id,
        "provider_id": provider_id,
        "agent_id": agent_id,
        "workspace_id": workspace_id,
        "workspace_root": str(workspace_root),
        "workspace": workspace_info,
        "task_id": task_id,
        "room_id": room_id,
        "summary": summary or "",
        "pid": process.pid,
        "status": "running",
        "command": command,
        "log_file": str(log_file),
        "created_at": utc_iso(),
        "updated_at": utc_iso(),
        "handoff_id": handoff["handoff_id"],
        "memory": memory_paths,
    }
    path = _write_spawn_record(workspace, record)
    append_event(
        workspace,
        event_type="SUBAGENT_SPAWNED",
        actor={"type": "agent", "name": actor},
        scope={"task_id": task_id, "correlation_id": spawn_id, "spawn_id": spawn_id},
        payload={"provider_id": provider_id, "agent_id": agent_id, "workspace_id": workspace_id, "pid": process.pid},
    )
    append_artifact_manifest(
        workspace,
        artifact_type="subagent_spawn",
        path=str(path),
        actor=actor,
        task_id=task_id,
        correlation_id=spawn_id,
        subject_ref=spawn_id,
        metadata={"provider_id": provider_id, "agent_id": agent_id, "workspace_id": workspace_id, "pid": process.pid},
    )
    return record


def stop_spawn(workspace: str | Path, *, spawn_id: str, actor: str = "CLI") -> dict[str, Any]:
    record = read_spawn_record(workspace, spawn_id)
    pid = int(record.get("pid") or 0)
    if _pid_is_running(pid):
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True, text=True)
        else:
            os.killpg(pid, signal.SIGTERM)
    record["status"] = "stopped"
    record["updated_at"] = utc_iso()
    workspace_info = record.get("workspace", {})
    if isinstance(workspace_info, dict) and workspace_info.get("strategy") == "git-worktree" and workspace_info.get("created"):
        cleanup_git_worktree(workspace_info)
        record["workspace_cleaned"] = True
    _write_spawn_record(workspace, record)
    transition_handoff(workspace, handoff_id=record["handoff_id"], state="completed", actor=actor, detail="Subagent process stopped.")
    append_event(
        workspace,
        event_type="SUBAGENT_STOPPED",
        actor={"type": "agent", "name": actor},
        scope={"task_id": record.get("task_id"), "correlation_id": spawn_id, "spawn_id": spawn_id},
        payload={"pid": pid},
    )
    return record
