#!/usr/bin/env python3
"""
Background CLI runtime for Conitens (ADR-0002, Batch 3).

Adapter pattern: SubprocessAdapter (Windows primary), TmuxAdapter (Linux/macOS).
Session lifecycle emits background.* events.

CLI usage:
    python scripts/ensemble_background.py up <workspace> [--agent <agent>] [--cmd <command>]
    python scripts/ensemble_background.py ps
    python scripts/ensemble_background.py logs <workspace> <agent> [--tail N]
    python scripts/ensemble_background.py stop <workspace> <agent>
    python scripts/ensemble_background.py kill <workspace> [--all]
    python scripts/ensemble_background.py ingest <workspace> <agent>
"""

from __future__ import annotations

import abc
import argparse
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Command safety: only allow alphanumeric, spaces, dots, dashes, slashes, underscores, equals
_SAFE_CMD_RE = re.compile(r"^[a-zA-Z0-9 _./:=\-]+$")

from ensemble_events import append_event

REPO_ROOT = Path(__file__).resolve().parent.parent
NOTES_DIR = REPO_ROOT / ".notes"
LOGS_DIR = REPO_ROOT / ".omc" / "logs"
SESSIONS_FILE = REPO_ROOT / ".omc" / "state" / "bg-sessions.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _session_name(workspace: str, agent: str) -> str:
    return f"cns::{workspace}::{agent}"


def _load_sessions() -> dict[str, Any]:
    if SESSIONS_FILE.exists():
        return json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    return {}


def _save_sessions(sessions: dict[str, Any]) -> None:
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSIONS_FILE.write_text(json.dumps(sessions, indent=2), encoding="utf-8")


def _log_dir(workspace: str, agent: str) -> Path:
    d = LOGS_DIR / workspace / agent
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# Adapter ABC
# ---------------------------------------------------------------------------

class BackgroundAdapter(abc.ABC):
    @abc.abstractmethod
    def start(self, name: str, command: str, log_path: Path) -> int:
        """Start a detached process. Return PID."""

    @abc.abstractmethod
    def is_running(self, pid: int) -> bool:
        """Check if process is still alive."""

    @abc.abstractmethod
    def stop(self, pid: int) -> bool:
        """Gracefully stop a process. Return True if stopped."""

    @abc.abstractmethod
    def kill(self, pid: int) -> bool:
        """Force kill a process."""

    @abc.abstractmethod
    def available(self) -> bool:
        """Check if this adapter is available on the current platform."""


# ---------------------------------------------------------------------------
# SubprocessAdapter — Windows primary, cross-platform fallback
# ---------------------------------------------------------------------------

class SubprocessAdapter(BackgroundAdapter):
    def available(self) -> bool:
        return True  # Always available

    def start(self, name: str, command: str, log_path: Path) -> int:
        # Validate command to prevent injection
        if not _SAFE_CMD_RE.match(command):
            raise ValueError(f"Unsafe command rejected: {command!r}")

        stdout_f = open(log_path / "stdout.log", "a", encoding="utf-8")
        stderr_f = open(log_path / "stderr.log", "a", encoding="utf-8")
        try:
            kwargs: dict[str, Any] = {
                "stdout": stdout_f,
                "stderr": stderr_f,
                "stdin": subprocess.DEVNULL,
            }
            if sys.platform == "win32":
                kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            else:
                kwargs["start_new_session"] = True

            cmd_list = shlex.split(command) if sys.platform != "win32" else command.split()
            proc = subprocess.Popen(cmd_list, shell=False, **kwargs)
            return proc.pid
        except Exception:
            stdout_f.close()
            stderr_f.close()
            raise

    def is_running(self, pid: int) -> bool:
        try:
            if sys.platform == "win32":
                result = subprocess.run(
                    ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                    capture_output=True, text=True, timeout=5,
                )
                return str(pid) in result.stdout
            else:
                os.kill(pid, 0)
                return True
        except (OSError, subprocess.TimeoutExpired):
            return False

    def stop(self, pid: int) -> bool:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(pid)], capture_output=True, timeout=10)
            else:
                os.kill(pid, signal.SIGTERM)
            return True
        except (OSError, subprocess.TimeoutExpired):
            return False

    def kill(self, pid: int) -> bool:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, timeout=10)
            else:
                os.kill(pid, signal.SIGKILL)
            return True
        except (OSError, subprocess.TimeoutExpired):
            return False


# ---------------------------------------------------------------------------
# TmuxAdapter — Linux/macOS when tmux is available
# ---------------------------------------------------------------------------

class TmuxAdapter(BackgroundAdapter):
    def available(self) -> bool:
        return shutil.which("tmux") is not None

    def start(self, name: str, command: str, log_path: Path) -> int:
        safe_name = name.replace("::", "-")
        log_file = str(log_path / "stdout.log")
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", safe_name, f"{command} 2>&1 | tee -a {log_file}"],
            check=True, capture_output=True,
        )
        result = subprocess.run(
            ["tmux", "list-panes", "-t", safe_name, "-F", "#{pane_pid}"],
            capture_output=True, text=True,
        )
        return int(result.stdout.strip()) if result.stdout.strip() else 0

    def is_running(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def stop(self, pid: int) -> bool:
        try:
            os.kill(pid, signal.SIGTERM)
            return True
        except OSError:
            return False

    def kill(self, pid: int) -> bool:
        try:
            os.kill(pid, signal.SIGKILL)
            return True
        except OSError:
            return False


def _get_adapter() -> BackgroundAdapter:
    tmux = TmuxAdapter()
    if tmux.available() and sys.platform != "win32":
        return tmux
    return SubprocessAdapter()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def bg_up(workspace: str, agent: str = "worker", command: str = "") -> dict[str, Any]:
    """Start a background agent session."""
    if not command:
        command = f"echo 'Conitens background session: {_session_name(workspace, agent)}' && sleep 3600"

    name = _session_name(workspace, agent)
    log_path = _log_dir(workspace, agent)
    adapter = _get_adapter()

    pid = adapter.start(name, command, log_path)

    # Event-first
    append_event(
        str(NOTES_DIR),
        event_type="background.session_started",
        actor={"type": "system", "name": "background"},
        payload={"workspace": workspace, "agent": agent, "pid": pid, "command": command},
    )

    sessions = _load_sessions()
    sessions[name] = {
        "pid": pid,
        "workspace": workspace,
        "agent": agent,
        "command": command,
        "started_at": _utc_now(),
        "log_dir": str(log_path),
        "adapter": adapter.__class__.__name__,
    }
    _save_sessions(sessions)

    return {"session": name, "pid": pid, "log_dir": str(log_path), "started_at": sessions[name]["started_at"]}


def bg_ps() -> list[dict[str, Any]]:
    """List active background sessions."""
    sessions = _load_sessions()
    adapter = _get_adapter()
    result = []
    for name, info in sessions.items():
        pid = info.get("pid", 0)
        running = adapter.is_running(pid) if pid else False
        result.append({
            "session": name,
            "pid": pid,
            "workspace": info.get("workspace", ""),
            "agent": info.get("agent", ""),
            "status": "running" if running else "stopped",
            "started_at": info.get("started_at", ""),
        })
    return result


def bg_logs(workspace: str, agent: str, tail: int = 100) -> str:
    """Read stdout/stderr from session logs."""
    log_path = _log_dir(workspace, agent)
    stdout_file = log_path / "stdout.log"
    stderr_file = log_path / "stderr.log"

    output_parts: list[str] = []
    for label, fpath in [("STDOUT", stdout_file), ("STDERR", stderr_file)]:
        if fpath.exists():
            lines = fpath.read_text(encoding="utf-8", errors="replace").splitlines()
            last_n = lines[-tail:] if len(lines) > tail else lines
            if last_n:
                output_parts.append(f"=== {label} (last {len(last_n)} lines) ===")
                output_parts.extend(last_n)

    return "\n".join(output_parts) if output_parts else "(no logs yet)"


def bg_stop(workspace: str, agent: str) -> dict[str, Any]:
    """Gracefully stop a session."""
    name = _session_name(workspace, agent)
    sessions = _load_sessions()
    info = sessions.get(name)
    if not info:
        return {"error": f"Session {name} not found"}

    adapter = _get_adapter()
    pid = info.get("pid", 0)
    stopped = adapter.stop(pid) if pid else False

    append_event(
        str(NOTES_DIR),
        event_type="background.session_stopped",
        actor={"type": "system", "name": "background"},
        payload={"workspace": workspace, "agent": agent, "pid": pid},
    )

    del sessions[name]
    _save_sessions(sessions)

    return {"session": name, "stopped": stopped, "pid": pid}


def bg_kill(workspace: str, kill_all: bool = False) -> list[dict[str, Any]]:
    """Force kill sessions."""
    sessions = _load_sessions()
    adapter = _get_adapter()
    killed = []

    for name, info in list(sessions.items()):
        if kill_all or info.get("workspace") == workspace:
            pid = info.get("pid", 0)
            adapter.kill(pid) if pid else None
            killed.append({"session": name, "pid": pid})
            del sessions[name]

    _save_sessions(sessions)
    return killed


def bg_ingest(workspace: str, agent: str) -> dict[str, Any]:
    """Ingest session logs into communication ledger as a thread note."""
    log_content = bg_logs(workspace, agent, tail=200)
    if log_content == "(no logs yet)":
        return {"error": "No logs to ingest"}

    append_event(
        str(NOTES_DIR),
        event_type="background.log_ingested",
        actor={"type": "system", "name": "background"},
        payload={"workspace": workspace, "agent": agent, "lines": len(log_content.splitlines())},
    )

    # Project to thread via obsidian
    from ensemble_obsidian import project_thread
    thread_id = f"bg-{workspace}-{agent}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    path = project_thread(
        thread_id,
        kind="agent_agent",
        workspace=workspace,
        participants=["background-runtime", agent],
        messages=[{"ts": _utc_now(), "sender": agent, "message": log_content[:2000]}],
    )

    return {"thread_id": thread_id, "path": str(path), "lines_ingested": len(log_content.splitlines())}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Conitens Background CLI Runtime")
    sub = parser.add_subparsers(dest="command")

    u = sub.add_parser("up")
    u.add_argument("workspace")
    u.add_argument("--agent", default="worker")
    u.add_argument("--cmd", default="", help="Command to run")

    sub.add_parser("ps")

    lg = sub.add_parser("logs")
    lg.add_argument("workspace")
    lg.add_argument("agent")
    lg.add_argument("--tail", type=int, default=100)

    st = sub.add_parser("stop")
    st.add_argument("workspace")
    st.add_argument("agent")

    k = sub.add_parser("kill")
    k.add_argument("workspace")
    k.add_argument("--all", action="store_true")

    ig = sub.add_parser("ingest")
    ig.add_argument("workspace")
    ig.add_argument("agent")

    args = parser.parse_args()

    if args.command == "up":
        result = bg_up(args.workspace, args.agent, args.cmd)
        print(json.dumps(result, indent=2))
    elif args.command == "ps":
        sessions = bg_ps()
        if not sessions:
            print("  (no active sessions)")
        for s in sessions:
            print(f"  {s['session']:40s} PID:{s['pid']:<8d} {s['status']:10s} {s['started_at']}")
    elif args.command == "logs":
        print(bg_logs(args.workspace, args.agent, args.tail))
    elif args.command == "stop":
        result = bg_stop(args.workspace, args.agent)
        print(json.dumps(result, indent=2))
    elif args.command == "kill":
        killed = bg_kill(args.workspace, args.all)
        for k_item in killed:
            print(f"  Killed: {k_item['session']} (PID {k_item['pid']})")
    elif args.command == "ingest":
        result = bg_ingest(args.workspace, args.agent)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
