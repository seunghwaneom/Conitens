#!/usr/bin/env python3
"""
Ensemble Dashboard Server v5.0.0
=================================
Real-time monitoring dashboard for multi-agent workspace

Features:
- Web-based dashboard UI
- Real-time WebSocket updates
- Agent status monitoring
- Lock visualization
- Task progress tracking
- Partition overview

Usage:
    python ensemble_dashboard.py serve --port 8080
    python ensemble_dashboard.py --help
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime, timezone
import threading
import webbrowser

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_HTTP_PORT = 8080
DEFAULT_WS_PORT = 9999
WORKSPACE = os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd())

# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD HTML
# ═══════════════════════════════════════════════════════════════════════════════

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ensemble Dashboard v5.0</title>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --text-primary: #c9d1d9;
            --text-secondary: #8b949e;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-yellow: #d29922;
            --accent-red: #f85149;
            --accent-purple: #a371f7;
            --border-color: #30363d;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.5;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
        }

        .logo {
            font-size: 24px;
            font-weight: 600;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
        }

        .status-badge.connected {
            background: rgba(63, 185, 80, 0.2);
            color: var(--accent-green);
        }

        .status-badge.disconnected {
            background: rgba(248, 81, 73, 0.2);
            color: var(--accent-red);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .card-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .card-count {
            background: var(--bg-tertiary);
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 14px;
            color: var(--text-secondary);
        }

        .agent-list, .lock-list, .event-list {
            list-style: none;
        }

        .agent-item, .lock-item, .event-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            margin-bottom: 8px;
        }

        .agent-icon {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 600;
        }

        .agent-icon.claude {
            background: linear-gradient(135deg, #d97706, #f59e0b);
        }

        .agent-icon.codex {
            background: linear-gradient(135deg, #059669, #10b981);
        }

        .agent-icon.gemini {
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
        }

        .agent-info {
            flex: 1;
        }

        .agent-name {
            font-weight: 600;
            color: var(--text-primary);
        }

        .agent-partition {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .lock-icon {
            color: var(--accent-yellow);
        }

        .lock-info {
            flex: 1;
        }

        .lock-file {
            font-family: monospace;
            font-size: 13px;
            color: var(--text-primary);
        }

        .lock-agent {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .event-time {
            font-size: 12px;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .event-type {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
        }

        .event-type.agent { background: rgba(88, 166, 255, 0.2); color: var(--accent-blue); }
        .event-type.file { background: rgba(163, 113, 247, 0.2); color: var(--accent-purple); }
        .event-type.lock { background: rgba(210, 153, 34, 0.2); color: var(--accent-yellow); }
        .event-type.task { background: rgba(63, 185, 80, 0.2); color: var(--accent-green); }

        .event-message {
            flex: 1;
            font-size: 13px;
            color: var(--text-primary);
        }

        .progress-section {
            margin-top: 20px;
        }

        .progress-bar {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-blue), var(--accent-green));
            transition: width 0.3s ease;
        }

        .stats-row {
            display: flex;
            gap: 20px;
            margin-top: 12px;
        }

        .stat {
            text-align: center;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 600;
        }

        .stat-label {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .connecting .status-dot {
            animation: pulse 1.5s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">Ensemble Dashboard</div>
            <div id="connection-status" class="status-badge disconnected">
                <span class="status-dot"></span>
                <span id="status-text">Disconnected</span>
            </div>
        </header>

        <div class="grid">
            <!-- Agents Card -->
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Active Agents</span>
                    <span class="card-count" id="agent-count">0</span>
                </div>
                <ul class="agent-list" id="agent-list">
                    <li class="empty-state">
                        <div class="empty-state-icon">🤖</div>
                        <div>No agents connected</div>
                    </li>
                </ul>
            </div>

            <!-- Locks Card -->
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Active Locks</span>
                    <span class="card-count" id="lock-count">0</span>
                </div>
                <ul class="lock-list" id="lock-list">
                    <li class="empty-state">
                        <div class="empty-state-icon">🔓</div>
                        <div>No active locks</div>
                    </li>
                </ul>
            </div>

            <!-- Events Card -->
            <div class="card" style="grid-column: span 2;">
                <div class="card-header">
                    <span class="card-title">Recent Events</span>
                    <span class="card-count" id="event-count">0</span>
                </div>
                <ul class="event-list" id="event-list">
                    <li class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div>No events yet</div>
                    </li>
                </ul>
            </div>

            <!-- Progress Card -->
            <div class="card" style="grid-column: span 2;">
                <div class="card-header">
                    <span class="card-title">Task Progress</span>
                </div>
                <div id="task-info">
                    <div style="color: var(--text-secondary);">Task: <span id="task-id">None</span></div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="stats-row">
                        <div class="stat">
                            <div class="stat-value" id="stat-completed">0</div>
                            <div class="stat-label">Completed</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value" id="stat-inprogress">0</div>
                            <div class="stat-label">In Progress</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value" id="stat-pending">0</div>
                            <div class="stat-label">Pending</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value" id="stat-files">0</div>
                            <div class="stat-label">Files Changed</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const WS_PORT = {{WS_PORT}};
        let ws = null;
        let reconnectAttempts = 0;
        let events = [];
        let context = {};

        function connect() {
            const statusBadge = document.getElementById('connection-status');
            const statusText = document.getElementById('status-text');

            statusBadge.className = 'status-badge connecting';
            statusText.textContent = 'Connecting...';

            ws = new WebSocket(`ws://localhost:${WS_PORT}`);

            ws.onopen = () => {
                statusBadge.className = 'status-badge connected';
                statusText.textContent = 'Connected';
                reconnectAttempts = 0;

                // Register as dashboard
                ws.send(JSON.stringify({
                    type: 'agent:register',
                    agent_type: 'DASHBOARD',
                    instance_id: 'web-' + Date.now()
                }));

                // Request context
                ws.send(JSON.stringify({ type: 'context:get' }));

                addEvent('system', 'Connected to server');
            };

            ws.onclose = () => {
                statusBadge.className = 'status-badge disconnected';
                statusText.textContent = 'Disconnected';
                addEvent('system', 'Disconnected from server');

                // Reconnect
                reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                setTimeout(connect, delay);
            };

            ws.onerror = (err) => {
                console.error('WebSocket error:', err);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (e) {
                    console.error('Parse error:', e);
                }
            };
        }

        function handleMessage(data) {
            const type = data.type || '';

            if (type === 'context:sync') {
                context = data.context || {};
                updateUI();
            } else if (type === 'agent:joined') {
                addEvent('agent', `${data.agent_id} joined`);
                requestContext();
            } else if (type === 'agent:left') {
                addEvent('agent', `${data.agent_id} left`);
                requestContext();
            } else if (type.startsWith('file:')) {
                addEvent('file', `${type.split(':')[1]}: ${data.file_path || data.path}`);
            } else if (type.startsWith('lock:')) {
                addEvent('lock', `${type.split(':')[1]}: ${data.file_path} (${data.agent_id})`);
                requestContext();
            } else if (type.startsWith('task:')) {
                addEvent('task', `${type.split(':')[1]}: ${data.task_id || ''}`);
            } else if (type.startsWith('code:') || type.startsWith('review:')) {
                addEvent('task', `${type}: ${data.file || data.files?.join(', ') || ''}`);
            }
        }

        function requestContext() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'context:get' }));
            }
        }

        function updateUI() {
            // Update agents
            const agentList = document.getElementById('agent-list');
            const agents = context.active_agents || [];
            document.getElementById('agent-count').textContent = agents.length;

            if (agents.length === 0) {
                agentList.innerHTML = `
                    <li class="empty-state">
                        <div class="empty-state-icon">🤖</div>
                        <div>No agents connected</div>
                    </li>`;
            } else {
                agentList.innerHTML = agents.map(agent => {
                    const type = (agent.agent_type || 'unknown').toLowerCase();
                    return `
                        <li class="agent-item">
                            <div class="agent-icon ${type}">${type[0].toUpperCase()}</div>
                            <div class="agent-info">
                                <div class="agent-name">${agent.agent_id}</div>
                                <div class="agent-partition">${agent.partition || 'No partition'}</div>
                            </div>
                        </li>`;
                }).join('');
            }

            // Update locks
            const lockList = document.getElementById('lock-list');
            const locks = Object.entries(context.locks || {});
            document.getElementById('lock-count').textContent = locks.length;

            if (locks.length === 0) {
                lockList.innerHTML = `
                    <li class="empty-state">
                        <div class="empty-state-icon">🔓</div>
                        <div>No active locks</div>
                    </li>`;
            } else {
                lockList.innerHTML = locks.map(([path, lock]) => `
                    <li class="lock-item">
                        <span class="lock-icon">🔒</span>
                        <div class="lock-info">
                            <div class="lock-file">${path}</div>
                            <div class="lock-agent">${lock.agent_id} (${lock.lock_type})</div>
                        </div>
                    </li>`).join('');
            }

            // Update task info
            document.getElementById('task-id').textContent = context.task_id || 'None';

            // Update stats
            const changes = context.recent_changes || [];
            document.getElementById('stat-files').textContent = changes.length;
        }

        function addEvent(category, message) {
            const now = new Date();
            const time = now.toLocaleTimeString();

            events.unshift({ time, category, message });
            if (events.length > 50) events.pop();

            const eventList = document.getElementById('event-list');
            document.getElementById('event-count').textContent = events.length;

            eventList.innerHTML = events.map(e => `
                <li class="event-item">
                    <span class="event-time">${e.time}</span>
                    <span class="event-type ${e.category}">${e.category}</span>
                    <span class="event-message">${e.message}</span>
                </li>`).join('');
        }

        // Start connection
        connect();

        // Periodic context refresh
        setInterval(requestContext, 5000);
    </script>
</body>
</html>
"""

# ═══════════════════════════════════════════════════════════════════════════════
# HTTP SERVER
# ═══════════════════════════════════════════════════════════════════════════════

class DashboardHandler(SimpleHTTPRequestHandler):
    """HTTP handler for dashboard"""

    def __init__(self, *args, ws_port=DEFAULT_WS_PORT, **kwargs):
        self.ws_port = ws_port
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            html = DASHBOARD_HTML.replace('{{WS_PORT}}', str(self.ws_port))
            self.wfile.write(html.encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        pass  # Suppress logging


def start_dashboard_server(http_port: int, ws_port: int, open_browser: bool = True):
    """Start the dashboard HTTP server"""
    handler = lambda *args, **kwargs: DashboardHandler(*args, ws_port=ws_port, **kwargs)
    server = HTTPServer(('localhost', http_port), handler)

    print(f"Dashboard server starting on http://localhost:{http_port}")
    print(f"Connecting to WebSocket server on ws://localhost:{ws_port}")
    print("Press Ctrl+C to stop")

    if open_browser:
        webbrowser.open(f'http://localhost:{http_port}')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped")
        server.shutdown()


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensemble Dashboard Server v5.0",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # serve
    p_serve = subparsers.add_parser("serve", help="Start dashboard server")
    p_serve.add_argument("--port", "-p", type=int, default=DEFAULT_HTTP_PORT,
                        help=f"HTTP port (default: {DEFAULT_HTTP_PORT})")
    p_serve.add_argument("--ws-port", "-w", type=int, default=DEFAULT_WS_PORT,
                        help=f"WebSocket port (default: {DEFAULT_WS_PORT})")
    p_serve.add_argument("--no-browser", action="store_true",
                        help="Don't open browser automatically")

    args = parser.parse_args()

    if args.command == "serve":
        start_dashboard_server(
            args.port,
            args.ws_port,
            not args.no_browser
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
