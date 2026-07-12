from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

from ensemble_forward_bridge_http_operator import handle_operator_route
from ensemble_forward_bridge_http_protocol import extra_headers, json_response, text_response, validate_identifier
from ensemble_forward_bridge_http_resources import handle_resource_route
from ensemble_forward_bridge_stream import serialize_sse_event, stream_snapshot_events
from ensemble_room import validate_room_id


def bridge_root_html() -> str:
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />"
        "<title>Conitens Forward Bridge</title><style>"
        ":root{color-scheme:dark}body{margin:0;background:#0d1117;color:#e6edf3;"
        "font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:32px}"
        "h1{margin:0 0 12px;font-size:24px}p{margin:0 0 12px;color:#9fb0c3}"
        "ul{margin:16px 0 0;padding-left:20px}code{color:#7ee787}</style></head><body>"
        "<h1>Conitens Forward Bridge</h1>"
        "<p>This bridge exposes query/read-model routes and bounded authenticated operator commands "
        "for the quarantined forward sidecar.</p>"
        "<p>Use the bearer token returned by the launch command to access <code>/api/*</code>.</p>"
        "<ul><li><code>GET /api/agents</code></li><li><code>GET /api/agents/&lt;agent_id&gt;</code></li>"
        "<li><code>GET /api/threads</code></li><li><code>GET /api/threads/search?q=keyword</code></li>"
        "<li><code>GET /api/threads/&lt;thread_id&gt;</code></li><li><code>GET /api/runs</code></li>"
        "<li><code>GET /api/runs/&lt;run_id&gt;</code></li>"
        "<li><code>GET /api/runs/&lt;run_id&gt;/replay</code></li>"
        "<li><code>GET /api/runs/&lt;run_id&gt;/state-docs</code></li>"
        "<li><code>GET /api/runs/&lt;run_id&gt;/context-latest</code></li>"
        "<li><code>GET /api/operator/wake-readiness</code></li>"
        "<li><code>GET /api/rooms/&lt;room_id&gt;/timeline</code></li>"
        "<li><code>POST /api/operator/tasks</code></li>"
        "<li><code>PATCH /api/operator/tasks/&lt;task_id&gt;</code></li>"
        "<li><code>DELETE /api/operator/tasks/&lt;task_id&gt;</code></li>"
        "<li><code>POST /api/operator/tasks/&lt;task_id&gt;/archive</code></li>"
        "<li><code>POST /api/operator/tasks/&lt;task_id&gt;/restore</code></li>"
        "<li><code>POST /api/operator/tasks/&lt;task_id&gt;/detach-workspace</code></li>"
        "<li><code>POST /api/operator/tasks/&lt;task_id&gt;/request-approval</code></li>"
        "<li><code>POST /api/operator/workspaces</code></li>"
        "<li><code>PATCH /api/operator/workspaces/&lt;workspace_id&gt;</code></li>"
        "<li><code>POST /api/approvals/&lt;request_id&gt;/decision</code></li>"
        "<li><code>POST /api/approvals/&lt;request_id&gt;/resume</code></li>"
        "<li><code>DELETE /api/approvals/&lt;patch_id&gt;/approve</code></li>"
        "<li><code>DELETE /api/approvals/&lt;patch_id&gt;/reject</code></li></ul></body></html>"
    )


def _stream_events(
    handler: BaseHTTPRequestHandler,
    workspace: Path,
    query: dict[str, list[str]],
) -> None:
    run_id = query.get("run_id", [None])[0]
    room_id = query.get("room_id", [None])[0]
    safe_run_id = validate_identifier(run_id, field_name="run_id") if run_id else None
    safe_room_id = validate_room_id(room_id) if room_id else None
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "keep-alive")
    for key, value in extra_headers(handler).items():
        handler.send_header(key, value)
    handler.end_headers()
    try:
        for event in stream_snapshot_events(workspace, run_id=safe_run_id, room_id=safe_room_id):
            handler.wfile.write(serialize_sse_event(event=event.event, data=event.data, event_id=event.event_id))
            handler.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, FileNotFoundError, ValueError, OSError):
        return


def handle_get_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> None:
    if path in {"/", "/index.html"}:
        text_response(handler, bridge_root_html())
        return
    if path == "/api/events/stream":
        _stream_events(handler, workspace, query)
        return
    if handle_operator_route(handler, path, query, workspace, bindings):
        return
    if handle_resource_route(handler, path, query, workspace, bindings):
        return
    text_response(handler, "Not found", status=404, content_type="text/plain; charset=utf-8")
