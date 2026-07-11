#!/usr/bin/env python3
"""
Subagent spawning and per-task workspace routing.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
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


SAFE_SPAWN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
ARTIFACT_MANIFEST_WARNING = "Artifact manifest projection failed."
WORKSPACE_CLEANUP_WARNING = "Workspace cleanup failed."
SPAWN_OBSERVATION_GRACE_SECONDS = 0.25
COMMAND_COMPLETION_WARNING = "Stop command completion event failed."


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


def validate_spawn_id(spawn_id: str) -> str:
    candidate = str(spawn_id).strip()
    if not candidate:
        raise ValueError("spawn_id is required")
    if ".." in candidate or "/" in candidate or "\\" in candidate:
        raise ValueError(f"Invalid spawn_id: {spawn_id}")
    if not SAFE_SPAWN_ID_PATTERN.fullmatch(candidate):
        raise ValueError(f"Invalid spawn_id: {spawn_id}")
    return candidate


def spawn_record_path(workspace: str | Path, spawn_id: str, *, completed: bool = False) -> Path:
    base = subagent_completed_dir(workspace) if completed else subagent_active_dir(workspace)
    return base / f"{validate_spawn_id(spawn_id)}.json"


def list_spawn_records(workspace: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for directory in (subagent_active_dir(workspace), subagent_completed_dir(workspace)):
        for path in sorted(directory.glob("S-*.json")):
            rows.append(json.loads(path.read_text(encoding="utf-8")))
    rows.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return rows


def read_spawn_record(workspace: str | Path, spawn_id: str) -> dict[str, Any]:
    safe_spawn_id = validate_spawn_id(spawn_id)
    for directory in (subagent_active_dir(workspace), subagent_completed_dir(workspace)):
        path = directory / f"{safe_spawn_id}.json"
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


def _terminate_launched_process(process: subprocess.Popen[Any]) -> bool:
    try:
        if process.poll() is not None:
            return True
    except Exception:
        pass
    try:
        process.terminate()
        process.wait(timeout=5)
        return True
    except Exception:
        pass
    try:
        process.kill()
        process.wait(timeout=5)
        return True
    except Exception:
        return False


def _cleanup_failed_spawn_workspace(
    workspace_info: dict[str, Any] | None,
    primary_error: BaseException,
) -> None:
    if not isinstance(workspace_info, dict):
        return
    if workspace_info.get("strategy") != "git-worktree" or not workspace_info.get("created"):
        return
    try:
        cleanup_git_worktree(workspace_info)
    except Exception as cleanup_error:
        primary_error.add_note(f"Failed to clean spawned git worktree: {cleanup_error}")


def _project_terminal_workspace_cleanup(record: dict[str, Any]) -> None:
    workspace_info = record.get("workspace", {})
    if not isinstance(workspace_info, dict):
        return
    if workspace_info.get("strategy") != "git-worktree" or not workspace_info.get("created"):
        return
    try:
        cleanup_git_worktree(workspace_info)
        record["workspace_cleaned"] = True
    except Exception:
        record["workspace_cleanup_warning"] = WORKSPACE_CLEANUP_WARNING


def _record_spawn_failure(
    workspace: str | Path,
    *,
    actor: str,
    spawn_id: str,
    task_id: str | None,
    provider_id: str,
    agent_id: str,
    workspace_id: str,
    stage: str,
    handoff_id: str | None = None,
    primary_error: BaseException | None = None,
    recoverable: bool = True,
) -> dict[str, Any] | None:
    try:
        event = append_event(
            workspace,
            event_type="agent.error",
            actor={"type": "agent", "name": actor},
            scope={"task_id": task_id, "correlation_id": spawn_id, "spawn_id": spawn_id},
            payload={
                "agent_id": agent_id,
                "message": f"Subagent spawn failed during {stage}.",
                "error_code": f"SPAWN_{stage.upper()}",
                "severity": "error",
                "task_id": task_id,
                "recoverable": recoverable,
            },
            severity="error",
        )
    except Exception as cleanup_error:
        event = None
        if primary_error is not None:
            primary_error.add_note(f"Failed to append spawn failure event: {cleanup_error}")
    if handoff_id:
        try:
            transition_handoff(
                workspace,
                handoff_id=handoff_id,
                state="rejected",
                actor=actor,
                detail=f"Subagent spawn failed during {stage}.",
            )
        except Exception as cleanup_error:
            if primary_error is not None:
                primary_error.add_note(f"Failed to reject spawn handoff {handoff_id}: {cleanup_error}")
    return event


def _record_spawn_termination(
    workspace: str | Path,
    *,
    actor: str,
    spawn_id: str,
    task_id: str | None,
    agent_id: str,
    primary_error: BaseException,
) -> dict[str, Any] | None:
    try:
        return append_event(
            workspace,
            event_type="agent.terminated",
            actor={"type": "agent", "name": actor},
            scope={"task_id": task_id, "correlation_id": spawn_id, "spawn_id": spawn_id},
            payload={
                "agent_id": agent_id,
                "reason": "error",
                "final_task_id": task_id,
            },
            severity="error",
        )
    except Exception as cleanup_error:
        primary_error.add_note(f"Failed to append spawn termination event: {cleanup_error}")
        return None


def _record_stop_command_failure(
    workspace: str | Path,
    *,
    actor: str,
    spawn_id: str,
    task_id: str | None,
    primary_error: BaseException,
) -> None:
    try:
        append_event(
            workspace,
            event_type="command.failed",
            actor={"type": "agent", "name": actor},
            scope={"task_id": task_id, "correlation_id": spawn_id, "spawn_id": spawn_id},
            payload={
                "command_id": f"stop:{spawn_id}",
                "command_type": "agent.terminate",
                "error_code": "PROCESS_TERMINATION_FAILED",
                "error_message": "Failed to terminate subagent process.",
                "retryable": True,
            },
            severity="error",
        )
    except Exception as cleanup_error:
        primary_error.add_note(f"Failed to append stop command failure event: {cleanup_error}")


def _record_stop_completion_failure(
    workspace: str | Path,
    *,
    actor: str,
    spawn_id: str,
    task_id: str | None,
    primary_error: BaseException,
) -> dict[str, Any] | None:
    try:
        return append_event(
            workspace,
            event_type="command.failed",
            actor={"type": "agent", "name": actor},
            scope={"task_id": task_id, "correlation_id": spawn_id, "spawn_id": spawn_id},
            payload={
                "command_id": f"stop:{spawn_id}",
                "command_type": "agent.terminate",
                "error_code": "COMMAND_COMPLETION_EVENT_FAILED",
                "error_message": COMMAND_COMPLETION_WARNING,
                "retryable": True,
            },
            severity="error",
        )
    except Exception as cleanup_error:
        primary_error.add_note(f"Failed to append stop completion failure event: {cleanup_error}")
        return None


def refresh_spawn_record(workspace: str | Path, spawn_id: str) -> dict[str, Any]:
    record = read_spawn_record(workspace, spawn_id)
    if record.get("status") == "running" and not _pid_is_running(record.get("pid")):
        terminated_event = append_event(
            workspace,
            event_type="agent.terminated",
            actor={"type": "system", "name": "spawn-monitor"},
            scope={
                "task_id": record.get("task_id"),
                "correlation_id": spawn_id,
                "spawn_id": spawn_id,
            },
            payload={
                "agent_id": str(record.get("agent_id") or spawn_id),
                "reason": "task_completed",
                "final_task_id": record.get("task_id"),
            },
        )
        projected = {
            **record,
            "status": "completed",
            "updated_at": terminated_event["ts_utc"],
            "terminated_event_id": terminated_event["event_id"],
        }
        _project_terminal_workspace_cleanup(projected)
        _write_spawn_record(workspace, projected)
        return projected
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
    get_workspace_manifest(workspace, workspace_id)
    spawn_id = next_spawn_id(workspace)
    request_payload: dict[str, Any] = {
        "agent_id": agent_id,
        "persona": provider_id,
        "run_id": task_id or spawn_id,
        "request_id": spawn_id,
        "requested_by": actor,
    }
    if room_id:
        request_payload["room_id"] = room_id
    request_event = append_event(
        workspace,
        event_type="agent.spawn_requested",
        actor={"type": "agent", "name": actor},
        scope={
            "task_id": task_id,
            "room_id": room_id,
            "correlation_id": spawn_id,
            "spawn_id": spawn_id,
        },
        payload=request_payload,
    )

    workspace_info: dict[str, Any] | None = None
    try:
        workspace_info = resolve_workspace_target(
            workspace,
            workspace_id=workspace_id,
            agent_id=agent_id,
            task_id=task_id,
        )
        workspace_root = Path(str(workspace_info.get("path") or workspace)).resolve()
        workspace_root.mkdir(parents=True, exist_ok=True)
        memory_paths = initialize_agent_memory(workspace, provider_id, agent_id)
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
    except Exception as error:
        _cleanup_failed_spawn_workspace(workspace_info, error)
        _record_spawn_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=task_id,
            provider_id=provider_id,
            agent_id=agent_id,
            workspace_id=workspace_id,
            stage="preparation",
            primary_error=error,
        )
        raise

    try:
        handoff = create_handoff(
            workspace,
            from_actor=actor,
            to_actor=agent_id,
            summary=summary or f"Spawned {provider_id} agent {agent_id}",
            task_id=task_id,
            correlation_id=spawn_id,
            artifact_type="subagent",
            files=[f"subagents/logs/{spawn_id}.log"],
            owner_transfer=False,
            worktree_id=workspace_id,
            lease_paths=[f"workspace:{workspace_id}"],
        )
    except Exception as error:
        _cleanup_failed_spawn_workspace(workspace_info, error)
        _record_spawn_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=task_id,
            provider_id=provider_id,
            agent_id=agent_id,
            workspace_id=workspace_id,
            stage="handoff_request",
            primary_error=error,
        )
        raise

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
    process: subprocess.Popen[Any] | None = None
    immediate_completion = False
    try:
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
            exit_code = process.poll()
            if exit_code is None:
                try:
                    exit_code = process.wait(timeout=SPAWN_OBSERVATION_GRACE_SECONDS)
                except subprocess.TimeoutExpired:
                    exit_code = None
            if exit_code is not None:
                process.wait(timeout=0)
                if exit_code != 0:
                    raise RuntimeError(
                        f"Provider process exited before spawn observation (exit code {exit_code})."
                    )
                immediate_completion = True
    except Exception as error:
        if process is not None and not _terminate_launched_process(process):
            error.add_note("Failed to terminate provider process after launch error.")
        _cleanup_failed_spawn_workspace(workspace_info, error)
        _record_spawn_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=task_id,
            provider_id=provider_id,
            agent_id=agent_id,
            workspace_id=workspace_id,
            stage="process_launch",
            handoff_id=str(handoff["handoff_id"]),
            primary_error=error,
        )
        raise

    if process is None:
        raise RuntimeError("Provider process launch returned no process handle.")

    terminated_event: dict[str, Any] | None = None
    try:
        spawned_payload: dict[str, Any] = {
            "agent_id": agent_id,
            "persona": provider_id,
            "run_id": task_id or spawn_id,
            "parent_agent_id": actor,
        }
        if room_id:
            spawned_payload["room_id"] = room_id
        spawned_event = append_event(
            workspace,
            event_type="agent.spawned",
            actor={"type": "agent", "name": actor},
            scope={
                "task_id": task_id,
                "room_id": room_id,
                "correlation_id": spawn_id,
                "spawn_id": spawn_id,
            },
            payload=spawned_payload,
        )
        if immediate_completion:
            terminated_event = append_event(
                workspace,
                event_type="agent.terminated",
                actor={"type": "agent", "name": actor},
                scope={
                    "task_id": task_id,
                    "room_id": room_id,
                    "correlation_id": spawn_id,
                    "spawn_id": spawn_id,
                },
                payload={
                    "agent_id": agent_id,
                    "reason": "task_completed",
                    "final_task_id": task_id,
                },
            )
    except Exception as error:
        if not _terminate_launched_process(process):
            error.add_note("Failed to terminate provider process after spawn observation error.")
        _cleanup_failed_spawn_workspace(workspace_info, error)
        _record_spawn_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=task_id,
            provider_id=provider_id,
            agent_id=agent_id,
            workspace_id=workspace_id,
            stage="spawn_observation",
            handoff_id=str(handoff["handoff_id"]),
            primary_error=error,
        )
        raise

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
        "status": "completed" if immediate_completion else "running",
        "command": command,
        "log_file": str(log_file),
        "created_at": request_event["ts_utc"],
        "updated_at": spawned_event["ts_utc"],
        "handoff_id": handoff["handoff_id"],
        "memory": memory_paths,
        "request_event_id": request_event["event_id"],
        "spawned_event_id": spawned_event["event_id"],
    }
    if terminated_event is not None:
        record["updated_at"] = terminated_event["ts_utc"]
        record["terminated_event_id"] = terminated_event["event_id"]
    try:
        if immediate_completion:
            _project_terminal_workspace_cleanup(record)
        path = _write_spawn_record(workspace, record)
        transition_handoff(
            workspace,
            handoff_id=str(handoff["handoff_id"]),
            state="completed" if immediate_completion else "started",
            actor=actor,
            detail=(
                "Subagent process completed."
                if immediate_completion
                else "Subagent process launched."
            ),
        )
    except Exception as error:
        process_terminated = _terminate_launched_process(process)
        if process_terminated and terminated_event is None:
            terminated_event = _record_spawn_termination(
                workspace,
                actor=actor,
                spawn_id=spawn_id,
                task_id=task_id,
                agent_id=agent_id,
                primary_error=error,
            )
        elif not process_terminated:
            terminated_event = None
            error.add_note("Failed to terminate provider process after spawn projection error.")
        error_event = _record_spawn_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=task_id,
            provider_id=provider_id,
            agent_id=agent_id,
            workspace_id=workspace_id,
            stage="spawn_projection",
            handoff_id=str(handoff["handoff_id"]),
            primary_error=error,
            recoverable=False,
        )
        _cleanup_failed_spawn_workspace(workspace_info, error)
        failed_record = {
            **record,
            "status": "failed",
            "updated_at": (error_event or {}).get("ts_utc") or utc_iso(),
            "error_event_id": (error_event or {}).get("event_id"),
            "terminated_event_id": (terminated_event or {}).get("event_id"),
            "cleanup_errors": list(getattr(error, "__notes__", [])),
        }
        try:
            _write_spawn_record(workspace, failed_record)
        except Exception:
            pass
        raise
    try:
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
    except Exception:
        record["artifact_manifest_warning"] = ARTIFACT_MANIFEST_WARNING
        try:
            _write_spawn_record(workspace, record)
        except Exception:
            pass
    return record


def stop_spawn(workspace: str | Path, *, spawn_id: str, actor: str = "CLI") -> dict[str, Any]:
    record = read_spawn_record(workspace, spawn_id)
    pid = int(record.get("pid") or 0)
    request_event = append_event(
        workspace,
        event_type="command.issued",
        actor={"type": "agent", "name": actor},
        scope={"task_id": record.get("task_id"), "correlation_id": spawn_id, "spawn_id": spawn_id},
        payload={
            "command_id": f"stop:{spawn_id}",
            "command_type": "agent.terminate",
            "source": "cli",
            "input": {
                "agent_id": str(record.get("agent_id") or spawn_id),
                "reason": "user_requested",
                "force": False,
            },
        },
    )
    try:
        was_running = _pid_is_running(pid)
        if was_running:
            if os.name == "nt":
                result = subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise RuntimeError("Failed to terminate subagent process.")
            else:
                os.killpg(pid, signal.SIGTERM)
            if _pid_is_running(pid):
                raise RuntimeError("Failed to terminate subagent process.")
    except Exception as error:
        _record_stop_command_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=record.get("task_id"),
            primary_error=error,
        )
        raise
    terminated_event = append_event(
        workspace,
        event_type="agent.terminated",
        actor={"type": "agent", "name": actor},
        scope={"task_id": record.get("task_id"), "correlation_id": spawn_id, "spawn_id": spawn_id},
        payload={
            "agent_id": str(record.get("agent_id") or spawn_id),
            "reason": "user_requested",
            "final_task_id": record.get("task_id"),
        },
    )
    command_completed_event: dict[str, Any] | None = None
    command_failed_event: dict[str, Any] | None = None
    completion_error: BaseException | None = None
    try:
        command_completed_event = append_event(
            workspace,
            event_type="command.completed",
            actor={"type": "agent", "name": actor},
            scope={"task_id": record.get("task_id"), "correlation_id": spawn_id, "spawn_id": spawn_id},
            payload={
                "command_id": f"stop:{spawn_id}",
                "command_type": "agent.terminate",
                "result": {
                    "agent_id": str(record.get("agent_id") or spawn_id),
                    "status": "terminated",
                },
                "emitted_event_ids": [terminated_event["event_id"]],
            },
        )
    except Exception as error:
        completion_error = error
        command_failed_event = _record_stop_completion_failure(
            workspace,
            actor=actor,
            spawn_id=spawn_id,
            task_id=record.get("task_id"),
            primary_error=error,
        )
    projected = {
        **record,
        "status": "stopped",
        "updated_at": (command_completed_event or command_failed_event or terminated_event)["ts_utc"],
        "termination_request_event_id": request_event["event_id"],
        "terminated_event_id": terminated_event["event_id"],
    }
    if command_completed_event is not None:
        projected["command_completed_event_id"] = command_completed_event["event_id"]
    if completion_error is not None:
        projected["command_completion_warning"] = COMMAND_COMPLETION_WARNING
    if command_failed_event is not None:
        projected["command_failed_event_id"] = command_failed_event["event_id"]
    _project_terminal_workspace_cleanup(projected)
    _write_spawn_record(workspace, projected)
    transition_handoff(
        workspace,
        handoff_id=projected["handoff_id"],
        state="completed",
        actor=actor,
        detail="Subagent process stopped.",
    )
    return projected
