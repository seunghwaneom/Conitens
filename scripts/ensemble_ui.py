#!/usr/bin/env python3
"""
Terminal and web UI helpers for the active Python control plane.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import secrets
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from ensemble_agents import list_agent_runtimes, list_rooms
from ensemble_context import update_context
from ensemble_events import load_events
from ensemble_memory import append_long_term_memory, append_shared_memory, show_memory
from ensemble_office import collect_office_snapshot, generate_report
from ensemble_room import create_room, post_room_message, show_room
from ensemble_spawn import start_spawn, stop_spawn


DASHBOARD_AUTH_COOKIE = "conitens_dashboard_auth"


def _host_is_loopback(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _request_is_loopback(handler: BaseHTTPRequestHandler) -> bool:
    try:
        return ipaddress.ip_address(handler.client_address[0]).is_loopback
    except ValueError:
        return False


def render_tui_snapshot(workspace: str | Path) -> str:
    snapshot = collect_office_snapshot(workspace)
    agents = list_agent_runtimes(workspace)
    rooms = list_rooms(workspace)
    lines = [
        "Conitens TUI",
        "",
        f"Generated: {snapshot.get('generated_at')}",
        f"Tasks: {sum(snapshot.get('status_counts', {}).values())}",
        f"Workflow Runs: {snapshot.get('metrics', {}).get('workflow_runs', 0)}",
        f"Handoffs: {snapshot.get('metrics', {}).get('handoffs', 0)}",
        f"Gates: {snapshot.get('metrics', {}).get('gates', 0)}",
        f"Agents: {len(agents)}",
        f"Rooms: {len(rooms)}",
        "",
        "Agents:",
    ]
    if agents:
        for agent in agents[:10]:
            lines.append(f"- {agent.get('agent_id')}: {agent.get('status')} ({agent.get('provider_id')})")
    else:
        lines.append("- No hired agents.")
    lines.extend(["", "Rooms:"])
    if rooms:
        for room in rooms[:10]:
            lines.append(f"- {room.get('room_id')}: {room.get('status')} ({room.get('message_count')} messages)")
    else:
        lines.append("- No rooms.")
    lines.extend(["", "Blocked:"])
    blocked_items = snapshot.get("blocked_items", [])
    if blocked_items:
        for item in blocked_items[:10]:
            lines.append(f"- [{item.get('kind')}] {item.get('label')}: {item.get('detail')}")
    else:
        lines.append("- No obvious blocked items.")
    lines.append("")
    return "\n".join(lines)


def _dashboard_payload(workspace: str | Path) -> dict[str, Any]:
    return {
        "snapshot": collect_office_snapshot(workspace),
        "recent_events": load_events(workspace, limit=80),
        "shared_memory": show_memory(workspace, kind="shared"),
    }


def _json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _text_response(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    extra_headers: dict[str, str] | None = None,
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    for key, value in (extra_headers or {}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _dashboard_auth_cookie_value(handler: BaseHTTPRequestHandler) -> str | None:
    raw_cookie = handler.headers.get("Cookie")
    if not raw_cookie:
        return None

    cookie = SimpleCookie()
    cookie.load(raw_cookie)
    auth_cookie = cookie.get(DASHBOARD_AUTH_COOKIE)
    return auth_cookie.value if auth_cookie else None


def _request_has_dashboard_auth(handler: BaseHTTPRequestHandler, auth_token: str) -> bool:
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    return _dashboard_auth_cookie_value(handler) == auth_token


def _safe_read_static(root: Path, request_path: str) -> tuple[bytes, str] | None:
    target = (root / request_path.lstrip("/")).resolve()
    if root.resolve() not in target.parents and target != root.resolve():
        return None
    if not target.exists() or not target.is_file():
        return None
    content_type = "text/plain; charset=utf-8"
    if target.suffix == ".css":
        content_type = "text/css; charset=utf-8"
    elif target.suffix == ".js":
        content_type = "application/javascript; charset=utf-8"
    elif target.suffix == ".json":
        content_type = "application/json; charset=utf-8"
    elif target.suffix == ".html":
        content_type = "text/html; charset=utf-8"
    return target.read_bytes(), content_type


def _run_approve_question(workspace: str | Path, question_id: str) -> dict[str, Any]:
    result = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ensemble.py")), "--workspace", str(workspace), "approve", "--question", question_id],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=120,
    )
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def _tail_text_file(path: str | Path, limit: int = 30) -> list[str]:
    target = Path(path)
    if not target.exists():
        return []
    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    return lines[-limit:]


def render_web_app_html() -> str:
    html = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conitens Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f1117;
      --surface-1: #1a1d27;
      --surface-2: #252833;
      --surface-3: #2d3140;
      --border: #2e3240;
      --text: #e2e4e9;
      --text-soft: #8b8fa3;
      --text-dim: #4b4f63;
      --active: #3b82f6;
      --idle: #6b7280;
      --done: #10b981;
      --blocked: #f59e0b;
      --failed: #ef4444;
      --inbox: #8b5cf6;
      --shadow: 0 1px 2px rgba(0,0,0,.3);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
    body { font-family: "Space Grotesk", sans-serif; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid var(--border); background: var(--surface-2); color: var(--text); padding: 8px 10px; border-radius: 10px; cursor: pointer; transition: transform .16s ease, background .16s ease, border-color .16s ease; }
    button:hover { transform: translateY(-1px); background: var(--surface-3); }
    button.primary { background: var(--active); border-color: var(--active); }
    button.warn { background: rgba(245, 158, 11, .14); border-color: rgba(245, 158, 11, .35); color: #ffd699; }
    button.danger { background: rgba(239, 68, 68, .14); border-color: rgba(239, 68, 68, .35); color: #ffc5c5; }
    input, select, textarea { width: 100%; background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; }
    .mono { font-family: "JetBrains Mono", monospace; }
    .app { display: flex; flex-direction: column; min-height: 100vh; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: rgba(26, 29, 39, .96); position: sticky; top: 0; z-index: 20; backdrop-filter: blur(12px); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; }
    .brand-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--done); box-shadow: 0 0 0 4px rgba(16,185,129,.14); }
    .metrics { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .metric { padding: 6px 10px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 12px; color: var(--text-soft); }
    .top-actions { display: flex; gap: 8px; align-items: center; }
    .layout { display: grid; grid-template-columns: 290px minmax(0, 1fr) 340px; gap: 16px; padding: 16px; min-height: calc(100vh - 66px); }
    .column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .panel { background: linear-gradient(180deg, rgba(37,40,51,.92), rgba(26,29,39,.98)); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }
    .panel-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-soft); }
    .panel-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid transparent; background: rgba(255,255,255,.015); border-radius: 12px; transition: background .16s ease, border-color .16s ease; }
    .row:hover, .row.active { background: rgba(59,130,246,.08); border-color: rgba(59,130,246,.24); }
    .dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 6px; flex: 0 0 auto; }
    .row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .row-title { font-size: 14px; font-weight: 500; }
    .row-meta { font-size: 12px; color: var(--text-soft); }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-width: 0; }
    .board { display: grid; grid-template-columns: repeat(6, minmax(180px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px; }
    .lane { background: rgba(15,17,23,.46); border: 1px solid rgba(255,255,255,.05); border-radius: 14px; min-height: 200px; display: flex; flex-direction: column; }
    .lane-title { padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-soft); border-bottom: 1px solid rgba(255,255,255,.04); }
    .lane-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
    .task-card { border-radius: 14px; background: var(--surface-2); border: 1px solid rgba(255,255,255,.05); border-left: 4px solid var(--active); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
    .task-card:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.14); }
    .task-title { font-weight: 600; font-size: 13px; }
    .task-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--text-soft); font-size: 11px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--text-soft); }
    .detail-grid { display: grid; gap: 12px; }
    .codebox { padding: 10px 12px; border-radius: 12px; background: rgba(15,17,23,.6); border: 1px solid rgba(255,255,255,.05); font-family: "JetBrains Mono", monospace; font-size: 12px; white-space: pre-wrap; color: var(--text-soft); }
    .timeline-item { display: grid; grid-template-columns: 64px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
    .timeline-time { font-family: "JetBrains Mono", monospace; color: var(--text-dim); font-size: 11px; }
    .timeline-body { min-width: 0; }
    .timeline-type { display: inline-flex; margin-bottom: 4px; }
    .memory-block { display: flex; flex-direction: column; gap: 8px; }
    .memory-entry { padding: 10px 12px; border-radius: 12px; background: rgba(15,17,23,.55); border: 1px solid rgba(255,255,255,.05); font-size: 13px; }
    .empty { color: var(--text-dim); font-size: 13px; }
    .flash { padding: 10px 12px; border-radius: 12px; font-size: 12px; }
    .flash.info { background: rgba(59,130,246,.12); color: #bfdbfe; border: 1px solid rgba(59,130,246,.28); }
    .flash.error { background: rgba(239,68,68,.12); color: #fecaca; border: 1px solid rgba(239,68,68,.28); }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media (max-width: 1280px) { .layout { grid-template-columns: 1fr; } .board { grid-template-columns: repeat(3, minmax(180px, 1fr)); } }
    @media (max-width: 840px) { .topbar { flex-direction: column; align-items: stretch; } .metrics { justify-content: flex-start; } .board { grid-template-columns: repeat(2, minmax(180px, 1fr)); } .field-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand"><div class="brand-dot"></div><div>Conitens Dashboard</div></div>
      <div class="metrics" id="metrics"></div>
      <div class="top-actions">
        <button id="refresh-button">Refresh</button>
        <button id="context-button" class="warn">Update Context</button>
        <span class="mono" id="clock"></span>
      </div>
    </div>
    <div class="layout">
      <div class="column">
        <section class="panel"><div class="panel-header"><span>Agents</span><span id="agent-count">0</span></div><div class="panel-body"><div id="agents-list" class="list"></div></div></section>
        <section class="panel"><div class="panel-header"><span>Rooms</span><span id="room-count">0</span></div><div class="panel-body"><div id="rooms-list" class="list"></div><div id="room-detail" class="codebox empty">Select a room to inspect its recent transcript.</div><form id="room-form" class="detail-grid"><input name="name" id="room-name" placeholder="new room name" /><input name="participants" id="room-participants" placeholder="participants comma-separated" /><textarea name="message" id="room-message" rows="2" placeholder="optional first message"></textarea><button type="submit">Create Room</button></form></div></section>
        <section class="panel"><div class="panel-header"><span>Pending Gates</span><span id="gate-count">0</span></div><div class="panel-body"><div class="toolbar"><button id="approve-all-button" class="warn">Approve All</button></div><div id="gates-list"></div></div></section>
        <section class="panel">
          <div class="panel-header"><span>Launch Agent</span><span>spawn.start</span></div>
          <div class="panel-body">
            <form id="spawn-form" class="detail-grid">
              <div class="field-grid"><select name="provider" id="spawn-provider"></select><select name="workspace" id="spawn-workspace"></select></div>
              <div class="field-grid"><input name="agentId" id="spawn-agent-id" placeholder="agent id" required /><input name="taskId" id="spawn-task-id" placeholder="task id (optional)" /></div>
              <input name="roomId" id="spawn-room-id" placeholder="room id (optional)" />
              <textarea name="summary" id="spawn-summary" rows="3" placeholder="summary / task prompt"></textarea>
              <button class="primary" type="submit">Start Spawn</button>
            </form>
          </div>
        </section>
      </div>
      <div class="column">
        <section class="panel"><div class="panel-header"><span>Task Board</span><span id="task-count">0</span></div><div class="panel-body"><div id="task-board" class="board"></div></div></section>
        <section class="panel"><div class="panel-header"><span>Detail</span><span id="detail-title">No selection</span></div><div class="panel-body" id="task-detail"></div></section>
      </div>
      <div class="column">
        <section class="panel"><div class="panel-header"><span>Timeline</span><span id="event-count">0</span></div><div class="panel-body"><select id="timeline-filter"><option value="all">all</option></select><div id="timeline-list"></div></div></section>
        <section class="panel"><div class="panel-header"><span>Memory</span><span id="memory-target">Shared</span></div><div class="panel-body"><div id="memory-panel"></div><form id="memory-form" class="detail-grid"><textarea name="text" id="memory-text" rows="2" placeholder="append memory entry"></textarea><input name="tags" id="memory-tags" placeholder="tags comma-separated" /><button type="submit">Add Memory</button></form></div></section>
      </div>
    </div>
    <div id="flash" style="padding:0 16px 16px;"></div>
  </div>
  <script>
    const STATUS_COLORS = {
      INBOX: 'var(--inbox)',
      ACTIVE: 'var(--active)',
      'DONE-AWAITING-USER': 'var(--blocked)',
      COMPLETED: 'var(--done)',
      HALTED: 'var(--blocked)',
      DUMPED: 'var(--failed)',
      running: 'var(--active)',
      completed: 'var(--done)',
      stopped: 'var(--idle)',
      blocked: 'var(--blocked)',
      failed: 'var(--failed)',
      'missing-binary': 'var(--failed)',
    };

    const state = {
      payload: null,
      selectedTaskId: null,
      selectedAgentId: null,
      selectedAgentLog: null,
      selectedRoomId: null,
      selectedRoom: null,
      selectedMemory: null,
      timelineFilter: 'all',
      flash: null,
    };

    function colorFor(status) {
      return STATUS_COLORS[status] || 'var(--idle)';
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    async function getJson(url, options) {
      const headers = {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      };
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin',
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error || text || response.statusText);
      }
      return data;
    }

    function setFlash(kind, text) {
      state.flash = { kind, text };
      renderFlash();
      if (text) {
        setTimeout(() => {
          if (state.flash && state.flash.text === text) {
            state.flash = null;
            renderFlash();
          }
        }, 4000);
      }
    }

    function renderFlash() {
      const root = document.getElementById('flash');
      if (!state.flash) {
        root.innerHTML = '';
        return;
      }
      root.innerHTML = '<div class="flash ' + escapeHtml(state.flash.kind) + '">' + escapeHtml(state.flash.text) + '</div>';
    }

    async function loadDashboard() {
      try {
        const payload = await getJson('/api/dashboard');
        state.payload = payload;
        const tasks = payload.snapshot.tasks || [];
        const agents = payload.snapshot.agents || [];
        const rooms = payload.snapshot.rooms || [];
        if (!state.selectedTaskId && tasks.length) state.selectedTaskId = tasks[0].task_id;
        if (!state.selectedAgentId && agents.length) state.selectedAgentId = agents[0].agent_id;
        if (!state.selectedRoomId && rooms.length) state.selectedRoomId = rooms[0].room_id;
        if (state.selectedAgentId) await loadAgentMemory(state.selectedAgentId);
        if (state.selectedRoomId) await loadRoomDetail(state.selectedRoomId);
        render();
      } catch (error) {
        setFlash('error', error.message);
      }
    }

    async function loadAgentMemory(agentId) {
      const agent = (state.payload?.snapshot?.agents || []).find((item) => item.agent_id === agentId);
      if (!agent || !agent.provider_id) {
        state.selectedMemory = null;
        state.selectedAgentLog = null;
        return;
      }
      try {
        state.selectedMemory = await getJson('/api/memory/' + encodeURIComponent(agent.provider_id) + '/' + encodeURIComponent(agent.agent_id));
        if (agent.spawn_id) {
          state.selectedAgentLog = await getJson('/api/spawns/' + encodeURIComponent(agent.spawn_id) + '/log');
        } else {
          state.selectedAgentLog = null;
        }
      } catch (error) {
        setFlash('error', error.message);
      }
    }

    async function loadRoomDetail(roomId) {
      try {
        state.selectedRoom = await getJson('/api/rooms/' + encodeURIComponent(roomId));
      } catch (error) {
        setFlash('error', error.message);
      }
    }

    function populateSpawnOptions(registry) {
      const providerSelect = document.getElementById('spawn-provider');
      const workspaceSelect = document.getElementById('spawn-workspace');
      const providers = registry.providers || [];
      const workspaces = registry.workspaces || [];
      providerSelect.innerHTML = providers.map((provider) => '<option value="' + escapeHtml(provider.data.provider_id) + '">' + escapeHtml(provider.data.display_name || provider.data.provider_id) + '</option>').join('');
      workspaceSelect.innerHTML = workspaces.map((workspace) => '<option value="' + escapeHtml(workspace.data.workspace_id) + '">' + escapeHtml(workspace.data.workspace_id) + '</option>').join('');
    }

    function render() {
      if (!state.payload) return;
      const snapshot = state.payload.snapshot;
      const metrics = snapshot.metrics || {};
      const tasks = snapshot.tasks || [];
      const agents = snapshot.agents || [];
      const rooms = snapshot.rooms || [];
      const questions = (snapshot.questions || []).filter((item) => ['pending', 'auto_selected_waiting_confirm'].includes(item.status));
      const recentEvents = state.payload.recent_events || [];
      const timelinePrefixes = ['all', ...new Set(recentEvents.map((event) => String(event.type || '').split('_')[0].toLowerCase()))];
      const filterSelect = document.getElementById('timeline-filter');
      filterSelect.innerHTML = timelinePrefixes.map((prefix) => '<option value="' + escapeHtml(prefix) + '"' + (prefix === state.timelineFilter ? ' selected' : '') + '>' + escapeHtml(prefix) + '</option>').join('');

      document.getElementById('clock').textContent = new Date().toLocaleTimeString();
      document.getElementById('agent-count').textContent = String(agents.length);
      document.getElementById('room-count').textContent = String(rooms.length);
      document.getElementById('gate-count').textContent = String(questions.length);
      document.getElementById('task-count').textContent = String(tasks.length);
      document.getElementById('event-count').textContent = String(recentEvents.length);

      document.getElementById('metrics').innerHTML = [
        ['active', metrics.workflow_runs || 0],
        ['blocked', snapshot.blocked_items?.length || 0],
        ['gates', metrics.gates || 0],
        ['agents', metrics.agent_total || 0],
        ['rooms', metrics.room_total || 0],
      ].map(([label, value]) => '<div class="metric mono">' + label + ': ' + value + '</div>').join('');

      document.getElementById('agents-list').innerHTML = agents.length
        ? agents.map((agent) => {
            const active = agent.agent_id === state.selectedAgentId ? ' active' : '';
            const statusColor = colorFor(agent.status);
            const stopButton = agent.spawn_id && agent.status === 'running'
              ? '<button class="danger" data-action="stop-spawn" data-spawn-id="' + escapeHtml(agent.spawn_id) + '">Stop</button>'
              : '';
            return '<div class="row' + active + '" data-agent-id="' + escapeHtml(agent.agent_id) + '">' +
              '<div class="dot" style="background:' + statusColor + '"></div>' +
              '<div class="row-main">' +
                '<div class="row-title">' + escapeHtml(agent.agent_id) + '</div>' +
                '<div class="row-meta mono">' + escapeHtml(agent.provider_id || 'unknown') + ' | ' + escapeHtml(agent.status || 'idle') + '</div>' +
                '<div class="row-meta mono">' + escapeHtml((agent.workspace || {}).path || '') + '</div>' +
              '</div>' +
              stopButton +
            '</div>';
          }).join('')
        : '<div class="empty">No hired agents yet.</div>';

      document.getElementById('rooms-list').innerHTML = rooms.length
        ? rooms.map((room) => {
            const active = room.room_id === state.selectedRoomId ? ' active' : '';
            return '<div class="row' + active + '" data-room-id="' + escapeHtml(room.room_id) + '">' +
              '<div class="dot" style="background:' + colorFor(room.status || 'idle') + '"></div>' +
              '<div class="row-main">' +
                '<div class="row-title">' + escapeHtml(room.room_id) + '</div>' +
                '<div class="row-meta">' + escapeHtml(room.name || room.room_id) + '</div>' +
                '<div class="row-meta mono">' + escapeHtml(String(room.message_count || 0)) + ' messages</div>' +
              '</div>' +
            '</div>';
          }).join('')
        : '<div class="empty">No rooms recorded.</div>';

      document.getElementById('room-detail').innerHTML = state.selectedRoom
        ? '<div class="detail-grid">' +
            (state.selectedRoom.messages || []).slice(-8).map((message) =>
              '<div class="memory-entry"><div class="row-meta mono">' + escapeHtml(message.ts_utc || '') + ' | ' + escapeHtml(message.sender || '') + '</div>' +
              '<div>' + escapeHtml(message.text || '') + '</div></div>'
            ).join('') +
          '</div>'
        : '<div class="empty">Select a room to inspect its recent transcript.</div>';

      document.getElementById('gates-list').innerHTML = questions.length
        ? questions.map((question) =>
            (() => {
              const relatedTask = tasks.find((task) => task.task_id === ((question.context || {}).task_id));
              return (
            '<div class="memory-entry">' +
              '<div class="row-title mono">' + escapeHtml(question.question_id) + '</div>' +
              '<div class="row-meta">' + escapeHtml(question.prompt || question.kind || '') + '</div>' +
              '<div class="row-meta mono">' + escapeHtml((relatedTask && relatedTask.task_id) || ((question.context || {}).task_id) || '') + (relatedTask ? ' | ' + escapeHtml(relatedTask.title || '') : '') + '</div>' +
              '<div class="toolbar"><button class="primary" data-action="approve-question" data-question-id="' + escapeHtml(question.question_id) + '">Approve</button></div>' +
            '</div>'
              );
            })()
          ).join('')
        : '<div class="empty">No pending gates.</div>';

      const lanes = ['INBOX', 'ACTIVE', 'DONE-AWAITING-USER', 'COMPLETED', 'HALTED', 'DUMPED'];
      document.getElementById('task-board').innerHTML = lanes.map((status) => {
        const laneTasks = tasks.filter((task) => task.status === status);
        return '<div class="lane"><div class="lane-title">' + escapeHtml(status) + ' | ' + laneTasks.length + '</div><div class="lane-body">' +
          (laneTasks.length
            ? laneTasks.map((task) => '<div class="task-card" data-task-id="' + escapeHtml(task.task_id) + '" style="border-left-color:' + colorFor(task.status) + '">' +
                '<div class="task-title mono">' + escapeHtml(task.task_id) + '</div>' +
                '<div>' + escapeHtml(task.title || task.task_id) + '</div>' +
                '<div class="task-meta"><span>' + escapeHtml(task.owner || task.agent || 'unassigned') + '</span><span>' + escapeHtml(task.verify_status || 'NOT_RUN') + '</span></div>' +
              '</div>').join('')
            : '<div class="empty">No tasks.</div>') +
          '</div></div>';
      }).join('');

      const selectedTask = tasks.find((task) => task.task_id === state.selectedTaskId);
      const relatedRuns = (snapshot.workflow_runs || []).filter((run) => run.task_id === state.selectedTaskId);
      const relatedHandoffs = (snapshot.handoffs || []).filter((handoff) => handoff.task_id === state.selectedTaskId);
      document.getElementById('detail-title').textContent = selectedTask ? selectedTask.task_id : 'No selection';
      document.getElementById('task-detail').innerHTML = selectedTask
        ? '<div class="detail-grid">' +
            '<div class="split">' +
              '<div class="memory-entry"><div class="row-title">Task</div><div class="row-meta mono">' + escapeHtml(selectedTask.task_id) + '</div><div>' + escapeHtml(selectedTask.title || '') + '</div></div>' +
              '<div class="memory-entry"><div class="row-title">State</div><div class="row-meta">Status: ' + escapeHtml(selectedTask.status || '') + ' | Verify: ' + escapeHtml(selectedTask.verify_status || '') + '</div><div class="row-meta mono">Owner: ' + escapeHtml(selectedTask.owner || 'unassigned') + '</div></div>' +
            '</div>' +
            '<div class="memory-entry"><div class="row-title">Workflow Runs</div>' +
              (relatedRuns.length ? relatedRuns.slice(0, 6).map((run) => '<div class="row-meta mono">' + escapeHtml(run.run_id || '') + ' | ' + escapeHtml(run.status || '') + '</div>').join('') : '<div class="empty">No workflow runs.</div>') +
            '</div>' +
            '<div class="memory-entry"><div class="row-title">Handoffs</div>' +
              (relatedHandoffs.length ? relatedHandoffs.slice(0, 6).map((handoff) => '<div class="row-meta mono">' + escapeHtml(handoff.handoff_id || '') + ' | ' + escapeHtml(handoff.status || '') + ' | ' + escapeHtml((handoff.from || '') + ' -> ' + (handoff.to || '')) + '</div>').join('') : '<div class="empty">No handoffs.</div>') +
            '</div>' +
          '</div>'
        : '<div class="empty">Select a task card to inspect workflow runs and handoffs.</div>';

      document.getElementById('timeline-list').innerHTML = recentEvents.length
        ? recentEvents.slice().reverse().filter((event) => state.timelineFilter === 'all' || String(event.type || '').split('_')[0].toLowerCase() === state.timelineFilter).map((event) =>
            '<div class="timeline-item">' +
              '<div class="timeline-time">' + escapeHtml((event.ts_utc || event.ts || '').slice(11, 19)) + '</div>' +
              '<div class="timeline-body">' +
                '<div class="timeline-type badge">' + escapeHtml(event.type || '') + '</div>' +
                '<div>' + escapeHtml((event.scope || {}).task_id || (event.payload || {}).task_id || (event.scope || {}).room_id || '') + '</div>' +
                '<div class="row-meta mono">' + escapeHtml(((event.actor || {}).name) || ((event.actor || {}).id) || '') + ' | ' + escapeHtml((event.severity || 'info')) + '</div>' +
              '</div>' +
            '</div>'
          ).join('')
        : '<div class="empty">No recent events.</div>';

      const memoryRoot = document.getElementById('memory-panel');
      document.getElementById('memory-target').textContent = state.selectedAgentId || 'Shared';
      if (state.selectedMemory) {
        const persona = state.selectedMemory.persona?.content || '';
        const longterm = state.selectedMemory.longterm?.entries || [];
        memoryRoot.innerHTML =
          '<div class="memory-block">' +
            '<div class="memory-entry"><div class="row-title">Persona</div><div class="codebox">' + escapeHtml(persona || 'No persona yet.') + '</div></div>' +
            '<div class="memory-entry"><div class="row-title">Long-Term Memory</div>' +
              (longterm.length ? longterm.slice().reverse().slice(0, 8).map((entry) => '<div class="row-meta mono">' + escapeHtml(entry.ts_utc || '') + ' | ' + escapeHtml(entry.text || '') + '</div>').join('') : '<div class="empty">No long-term memory entries.</div>') +
            '</div>' +
            '<div class="memory-entry"><div class="row-title">Shared Memory</div><div class="codebox">' + escapeHtml(state.payload.shared_memory?.content || '') + '</div></div>' +
            '<div class="memory-entry"><div class="row-title">Agent Log Tail</div><div class="codebox">' + escapeHtml((state.selectedAgentLog?.lines || []).join('\\n') || 'No agent log available.') + '</div></div>' +
          '</div>';
      } else {
        memoryRoot.innerHTML = '<div class="memory-entry"><div class="row-title">Shared Memory</div><div class="codebox">' + escapeHtml(state.payload.shared_memory?.content || '') + '</div></div>';
      }

      populateSpawnOptions(snapshot.registry || {});
      renderFlash();
    }

    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-task-id],[data-agent-id],[data-room-id],[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'approve-question') {
        try {
          const questionId = target.getAttribute('data-question-id');
          const result = await getJson('/api/actions/approve-question', { method: 'POST', body: JSON.stringify({ question_id: questionId }) });
          setFlash(result.ok ? 'info' : 'error', result.ok ? 'Question approved.' : (result.stderr || result.stdout || 'Approval failed.'));
          await loadDashboard();
        } catch (error) {
          setFlash('error', error.message);
        }
        return;
      }
      if (action === 'stop-spawn') {
        try {
          const spawnId = target.getAttribute('data-spawn-id');
          await getJson('/api/actions/spawn-stop', { method: 'POST', body: JSON.stringify({ spawn_id: spawnId }) });
          setFlash('info', 'Spawn stopped.');
          await loadDashboard();
        } catch (error) {
          setFlash('error', error.message);
        }
        return;
      }
      const taskId = target.getAttribute('data-task-id');
      if (taskId) {
        state.selectedTaskId = taskId;
        render();
        return;
      }
      const agentId = target.getAttribute('data-agent-id');
      if (agentId) {
        state.selectedAgentId = agentId;
        await loadAgentMemory(agentId);
        render();
        return;
      }
      const roomId = target.getAttribute('data-room-id');
      if (roomId) {
        state.selectedRoomId = roomId;
        await loadRoomDetail(roomId);
        render();
      }
    });

    document.getElementById('refresh-button').addEventListener('click', () => loadDashboard());
    document.getElementById('timeline-filter').addEventListener('change', (event) => {
      state.timelineFilter = event.target.value;
      render();
    });
    document.getElementById('context-button').addEventListener('click', async () => {
      try {
        await getJson('/api/actions/update-context', { method: 'POST', body: '{}' });
        setFlash('info', 'Context updated.');
        await loadDashboard();
      } catch (error) {
        setFlash('error', error.message);
      }
    });

    document.getElementById('approve-all-button').addEventListener('click', async () => {
      if (!state.payload) return;
      const questionIds = (state.payload.snapshot.questions || [])
        .filter((item) => ['pending', 'auto_selected_waiting_confirm'].includes(item.status))
        .map((item) => item.question_id);
      if (!questionIds.length) {
        setFlash('info', 'No pending gates to approve.');
        return;
      }
      try {
        const result = await getJson('/api/actions/approve-all', { method: 'POST', body: JSON.stringify({ question_ids: questionIds }) });
        setFlash(result.ok ? 'info' : 'error', result.ok ? 'Approved all pending gates.' : 'Some approvals failed.');
        await loadDashboard();
      } catch (error) {
        setFlash('error', error.message);
      }
    });

    document.getElementById('spawn-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const result = await getJson('/api/actions/spawn-start', {
          method: 'POST',
          body: JSON.stringify({
            provider_id: form.get('provider'),
            agent_id: form.get('agentId'),
            workspace_id: form.get('workspace'),
            task_id: form.get('taskId'),
            room_id: form.get('roomId'),
            summary: form.get('summary'),
          }),
        });
        setFlash(result.status === 'blocked' ? 'error' : 'info', result.status === 'blocked' ? 'Spawn requires approval.' : 'Spawn launched.');
        event.currentTarget.reset();
        await loadDashboard();
      } catch (error) {
        setFlash('error', error.message);
      }
    });

    document.getElementById('room-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get('name') || '').trim();
      const participants = String(form.get('participants') || '').split(',').map((item) => item.trim()).filter(Boolean);
      const message = String(form.get('message') || '').trim();
      try {
        const result = await getJson('/api/actions/room-create', {
          method: 'POST',
          body: JSON.stringify({ name: name || 'room', participants, message }),
        });
        state.selectedRoomId = result.room_id;
        setFlash('info', 'Room created.');
        event.currentTarget.reset();
        await loadDashboard();
      } catch (error) {
        setFlash('error', error.message);
      }
    });

    document.getElementById('memory-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const text = String(form.get('text') || '').trim();
      const tags = String(form.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean);
      if (!text) {
        setFlash('error', 'Memory text is required.');
        return;
      }
      try {
        const agent = (state.payload?.snapshot?.agents || []).find((item) => item.agent_id === state.selectedAgentId);
        await getJson('/api/actions/memory-append', {
          method: 'POST',
          body: JSON.stringify(agent && agent.provider_id
            ? { shared: false, provider_id: agent.provider_id, agent_id: agent.agent_id, text, tags }
            : { shared: true, text }),
        });
        setFlash('info', 'Memory added.');
        event.currentTarget.reset();
        await loadDashboard();
      } catch (error) {
        setFlash('error', error.message);
      }
    });

    setInterval(() => {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString();
    }, 1000);
    setInterval(loadDashboard, 4000);
    loadDashboard();
  </script>
</body>
</html>
"""
    return html


def _build_handler(workspace: str | Path, web_root: Path, auth_token: str) -> type[BaseHTTPRequestHandler]:
    workspace_root = Path(workspace)

    class DashboardHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/api/dashboard":
                _json_response(self, _dashboard_payload(workspace_root))
                return
            if path.startswith("/api/rooms/"):
                room_id = unquote(path.removeprefix("/api/rooms/"))
                try:
                    _json_response(self, show_room(workspace_root, room_id))
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=404)
                return
            if path.startswith("/api/memory/"):
                parts = [unquote(part) for part in path.split("/") if part][2:]
                if len(parts) == 2:
                    provider_id, agent_id = parts
                    try:
                        _json_response(
                            self,
                            {
                                "persona": show_memory(workspace_root, kind="persona", provider_id=provider_id, agent_id=agent_id),
                                "longterm": show_memory(workspace_root, kind="longterm", provider_id=provider_id, agent_id=agent_id),
                            },
                        )
                    except Exception as exc:
                        _json_response(self, {"error": str(exc)}, status=404)
                else:
                    _json_response(self, {"error": "Invalid memory path."}, status=400)
                return
            if path.startswith("/api/spawns/") and path.endswith("/log"):
                spawn_id = unquote(path.split("/")[3])
                subagents_dir = workspace_root / ".notes" / "subagents"
                active_record = subagents_dir / "ACTIVE" / f"{spawn_id}.json"
                completed_record = subagents_dir / "COMPLETED" / f"{spawn_id}.json"
                record_path = active_record if active_record.exists() else completed_record
                if not record_path.exists():
                    _json_response(self, {"error": f"Spawn not found: {spawn_id}"}, status=404)
                    return
                record = json.loads(record_path.read_text(encoding="utf-8"))
                _json_response(self, {"spawn_id": spawn_id, "log_file": record.get("log_file"), "lines": _tail_text_file(record.get("log_file") or "")})
                return
            if path in {"/", "/index.html"}:
                _text_response(
                    self,
                    render_web_app_html(),
                    extra_headers={
                        "Set-Cookie": f"{DASHBOARD_AUTH_COOKIE}={auth_token}; HttpOnly; Path=/; SameSite=Strict",
                    },
                )
                return
            if path == "/office-report.html":
                office_report = generate_report(workspace_root, "html")
                _text_response(self, office_report.read_text(encoding="utf-8"))
                return
            static_payload = _safe_read_static(web_root, path)
            if static_payload is None:
                _text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")
                return
            content, content_type = static_payload
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if not _request_is_loopback(self):
                _json_response(self, {"error": "Dashboard writes are only available from loopback clients."}, status=403)
                return
            if not _request_has_dashboard_auth(self, auth_token):
                _json_response(self, {"error": "Missing or invalid dashboard token."}, status=403)
                return
            length = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(length).decode("utf-8") if length else "{}"
            payload = json.loads(body or "{}")
            if parsed.path == "/api/actions/approve-question":
                result = _run_approve_question(workspace_root, str(payload.get("question_id") or ""))
                _json_response(self, result, status=200 if result.get("ok") else 400)
                return
            if parsed.path == "/api/actions/update-context":
                path = update_context(str(workspace_root))
                _json_response(self, {"ok": True, "path": str(path)})
                return
            if parsed.path == "/api/actions/spawn-start":
                try:
                    result = start_spawn(
                        workspace_root,
                        provider_id=str(payload.get("provider_id") or ""),
                        agent_id=str(payload.get("agent_id") or ""),
                        workspace_id=str(payload.get("workspace_id") or "default"),
                        task_id=str(payload.get("task_id") or "") or None,
                        room_id=str(payload.get("room_id") or "") or None,
                        summary=str(payload.get("summary") or "") or None,
                        actor="dashboard",
                    )
                    _json_response(self, result, status=200 if result.get("status") != "blocked" else 202)
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=400)
                return
            if parsed.path == "/api/actions/spawn-stop":
                try:
                    result = stop_spawn(workspace_root, spawn_id=str(payload.get("spawn_id") or ""), actor="dashboard")
                    _json_response(self, result)
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=400)
                return
            if parsed.path == "/api/actions/approve-all":
                question_ids = payload.get("question_ids") or []
                results = [_run_approve_question(workspace_root, str(question_id)) for question_id in question_ids]
                _json_response(self, {"results": results, "ok": all(item.get("ok") for item in results)})
                return
            if parsed.path == "/api/actions/room-create":
                try:
                    room = create_room(
                        workspace_root,
                        name=str(payload.get("name") or "room").strip() or "room",
                        participants=[str(item) for item in (payload.get("participants") or []) if str(item).strip()],
                        actor="dashboard",
                        task_id=str(payload.get("task_id") or "") or None,
                    )
                    message = str(payload.get("message") or "").strip()
                    if message:
                        post_room_message(workspace_root, room_id=room["room_id"], sender="dashboard", text=message, task_id=room.get("task_id"))
                    _json_response(self, room)
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=400)
                return
            if parsed.path == "/api/actions/room-post":
                try:
                    result = post_room_message(
                        workspace_root,
                        room_id=str(payload.get("room_id") or ""),
                        sender=str(payload.get("sender") or "dashboard"),
                        text=str(payload.get("text") or ""),
                        message_type=str(payload.get("message_type") or "text"),
                        task_id=str(payload.get("task_id") or "") or None,
                    )
                    _json_response(self, result)
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=400)
                return
            if parsed.path == "/api/actions/memory-append":
                try:
                    shared = bool(payload.get("shared"))
                    if shared:
                        result = append_shared_memory(workspace_root, author="dashboard", text=str(payload.get("text") or ""), task_id=str(payload.get("task_id") or "") or None)
                    else:
                        result = append_long_term_memory(
                            workspace_root,
                            provider_id=str(payload.get("provider_id") or ""),
                            agent_id=str(payload.get("agent_id") or ""),
                            author="dashboard",
                            text=str(payload.get("text") or ""),
                            tags=[str(item) for item in (payload.get("tags") or []) if str(item).strip()],
                            task_id=str(payload.get("task_id") or "") or None,
                        )
                    _json_response(self, result)
                except Exception as exc:
                    _json_response(self, {"error": str(exc)}, status=400)
                return
            _json_response(self, {"error": "Unsupported action."}, status=404)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

    return DashboardHandler


def run_terminal_ui(workspace: str | Path, *, watch: bool = False, interval: int = 5, once: bool = False) -> int:
    if once or not watch:
        print(render_tui_snapshot(workspace))
        return 0
    try:
        while True:
            print("\x1bc", end="")
            print(render_tui_snapshot(workspace))
            time.sleep(max(interval, 1))
    except KeyboardInterrupt:
        return 0


def watch_tui(workspace: str | Path, *, interval: float = 2.0, once: bool = False) -> None:
    run_terminal_ui(workspace, watch=not once, interval=max(int(interval), 1), once=once)


def launch_web_ui(workspace: str | Path, *, host: str = "127.0.0.1", port: int = 8765) -> dict[str, object]:
    if not _host_is_loopback(host):
        raise ValueError("Dashboard host must be loopback-only (127.0.0.1, ::1, or localhost).")
    office_dir = Path(generate_report(workspace, "html").parent)
    index_path = office_dir / "index.html"
    auth_token = secrets.token_urlsafe(24)
    index_path.write_text(render_web_app_html(), encoding="utf-8")
    handler = _build_handler(workspace, office_dir, auth_token)
    server = ThreadingHTTPServer((host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    original_shutdown = server.shutdown

    def shutdown_and_close() -> None:
        original_shutdown()
        server.server_close()

    server.shutdown = shutdown_and_close  # type: ignore[assignment]
    return {
        "url": f"http://{host}:{port}/index.html",
        "path": str(index_path),
        "server": server,
        "thread": thread,
        "token": auth_token,
    }


def run_web_ui(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8765,
    open_browser: bool = False,
    once: bool = False,
) -> int:
    launched = launch_web_ui(workspace, host=host, port=port)
    print(launched["url"])
    if once:
        return 0
    if open_browser:
        webbrowser.open(str(launched["url"]))
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        launched["server"].shutdown()
        return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens terminal/web UI helpers")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    tui_parser = subparsers.add_parser("terminal")
    tui_parser.add_argument("--watch", action="store_true")
    tui_parser.add_argument("--interval", type=int, default=5)
    tui_parser.add_argument("--once", action="store_true")

    web_parser = subparsers.add_parser("web")
    web_parser.add_argument("--host", default="127.0.0.1")
    web_parser.add_argument("--port", type=int, default=8765)
    web_parser.add_argument("--open-browser", action="store_true")
    web_parser.add_argument("--once", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "terminal":
        return run_terminal_ui(args.workspace, watch=args.watch, interval=args.interval, once=args.once)
    if args.command == "web":
        return run_web_ui(args.workspace, host=args.host, port=args.port, open_browser=args.open_browser, once=args.once)
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
