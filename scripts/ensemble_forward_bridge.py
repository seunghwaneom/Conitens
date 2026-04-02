#!/usr/bin/env python3
"""
Read-only HTTP bridge for the explicit forward `.conitens` runtime surface.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from ensemble_approval import APPROVAL_STATUSES, ApprovalInterruptAdapter
from ensemble_context_markdown import (
    FindingsAppendService,
    LatestContextSkeletonGenerator,
    ProgressAppendOnlyService,
    TaskPlanWriterReader,
)
from ensemble_forward import _read_optional_text, _repo_latest_context_path
from ensemble_loop_paths import findings_path, latest_context_path, progress_path, task_plan_path
from ensemble_loop_repository import LoopStateRepository
from ensemble_orchestration import LocalOrchestrationRuntime
from ensemble_replay_service import ReplayService
from ensemble_room import validate_room_id
from ensemble_ui import _host_is_loopback, _request_is_loopback, _validate_api_identifier

MAX_REQUEST_BODY_BYTES = 1_000_000


def _bridge_root_html() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conitens Forward Bridge</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0d1117;
      color: #e6edf3;
      font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 32px;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 12px; color: #9fb0c3; }
    ul { margin: 16px 0 0; padding-left: 20px; }
    code { color: #7ee787; }
  </style>
</head>
<body>
  <h1>Conitens Forward Bridge</h1>
  <p>This bridge is read-only and forward-runtime scoped.</p>
  <p>Use the bearer token returned by the launch command to access <code>/api/*</code>.</p>
  <ul>
    <li><code>GET /api/runs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/replay</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/state-docs</code></li>
    <li><code>GET /api/runs/&lt;run_id&gt;/context-latest</code></li>
    <li><code>GET /api/rooms/&lt;room_id&gt;/timeline</code></li>
  </ul>
</body>
</html>
"""


def _sanitize_reviewer_identity(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    if not text:
        return "forward-bridge"
    return text[:120]


def _resolve_reviewer_identity(explicit_identity: str | None = None) -> str:
    if explicit_identity:
        return _sanitize_reviewer_identity(explicit_identity)
    env_identity = os.environ.get("CONITENS_FORWARD_REVIEWER")
    if env_identity:
        return _sanitize_reviewer_identity(env_identity)
    return _sanitize_reviewer_identity(f"local/{getpass.getuser()}")


def _internal_bridge_error(
    handler: BaseHTTPRequestHandler,
    exc: Exception,
    *,
    message: str = "Internal forward bridge error.",
) -> None:
    handler.log_error("Forward bridge internal error: %s", exc)
    _forward_json_response(handler, {"error": message}, status=500)


def _loopback_origin(handler: BaseHTTPRequestHandler) -> str | None:
    origin = handler.headers.get("Origin")
    if not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.hostname or not _host_is_loopback(parsed.hostname):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _forward_extra_headers(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    origin = _loopback_origin(handler)
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "300",
        "Vary": "Origin",
    }


def _forward_json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in _forward_extra_headers(handler).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _forward_text_response(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    *,
    extra_headers: dict[str, str] | None = None,
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    merged_headers = {**_forward_extra_headers(handler), **(extra_headers or {})}
    for key, value in merged_headers.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _require_bridge_read_access(
    handler: BaseHTTPRequestHandler,
    auth_token: str,
) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _require_bridge_write_access(handler: BaseHTTPRequestHandler, auth_token: str) -> bool:
    if not _request_is_loopback(handler):
        _forward_json_response(handler, {"error": "Forward bridge writes are only available from loopback clients."}, status=403)
        return False
    if handler.headers.get("Authorization") == f"Bearer {auth_token}":
        return True
    _forward_json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0") or "0"
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise ValueError("Invalid Content-Length") from exc
    if length > MAX_REQUEST_BODY_BYTES:
        raise OverflowError("Request body too large")
    body = handler.rfile.read(length).decode("utf-8") if length else "{}"
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Malformed JSON body") from exc
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def _relative_display_path(path: Path, workspace_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace_root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path.name)


def _ensure_run_exists(repository: LoopStateRepository, run_id: str) -> dict[str, Any]:
    try:
        return repository.get_run(run_id)
    except ValueError as exc:
        if str(exc).startswith("Unknown run_id:"):
            raise FileNotFoundError(str(exc)) from exc
        raise


def _run_counts(repository: LoopStateRepository, run_id: str) -> dict[str, int]:
    return {
        "iterations": len(repository.list_iterations(run_id)),
        "validator_results": len(repository.list_validator_results(run_id)),
        "approvals": len(repository.list_approval_requests(run_id=run_id)),
        "rooms": len(repository.list_room_records(run_id=run_id)),
        "messages": len(repository.list_room_messages(run_id=run_id)),
        "tool_events": len(repository.list_tool_events(run_id=run_id)),
        "insights": len(repository.list_insights(run_id=run_id)),
        "handoff_packets": len(repository.list_handoff_packets(run_id=run_id)),
    }


def build_runs_payload(workspace: str | Path) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    runs = []
    for run in repository.list_runs():
        iterations = repository.list_iterations(run["run_id"])
        latest_iteration = iterations[-1] if iterations else None
        runs.append(
            {
                **run,
                "latest_iteration_id": latest_iteration["iteration_id"] if latest_iteration else None,
                "latest_iteration_status": latest_iteration["status"] if latest_iteration else None,
                "counts": _run_counts(repository, run["run_id"]),
            }
        )
    return {"runs": runs, "count": len(runs)}


def build_run_detail_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    run = _ensure_run_exists(repository, run_id)
    iterations = repository.list_iterations(run_id)
    latest_iteration = iterations[-1] if iterations else None
    return {
        "run": run,
        "iterations": iterations,
        "latest_iteration": latest_iteration,
        "task_plan": repository.get_task_plan(run_id),
        "counts": _run_counts(repository, run_id),
    }


def build_run_state_docs_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    task_plan = TaskPlanWriterReader(repository).read(run_id)
    findings_service = FindingsAppendService(repository)
    progress_service = ProgressAppendOnlyService(repository)
    latest_context = LatestContextSkeletonGenerator(repository)
    return {
        "run_id": run_id,
        "documents": {
            "task_plan": {
                "path": _relative_display_path(task_plan_path(workspace_root), workspace_root),
                "content": task_plan["markdown"] if task_plan else "# task_plan.md\n\n_No active plan._\n",
            },
            "findings": {
                "path": _relative_display_path(findings_path(workspace_root), workspace_root),
                "content": findings_service.render(run_id),
            },
            "progress": {
                "path": _relative_display_path(progress_path(workspace_root), workspace_root),
                "content": progress_service.render_entries(repository.list_progress_entries(run_id), run_id=run_id),
            },
            "latest_context": {
                "path": _relative_display_path(latest_context_path(workspace_root), workspace_root),
                "content": latest_context.render(run_id),
            },
        },
    }


def build_run_context_latest_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    _ensure_run_exists(repository, run_id)
    workspace_root = Path(workspace)
    latest_context = LatestContextSkeletonGenerator(repository)
    runtime_path = latest_context_path(workspace_root)
    repo_path = _repo_latest_context_path(workspace_root)
    return {
        "run_id": run_id,
        "runtime_latest": {
            "path": _relative_display_path(runtime_path, workspace_root),
            "content": latest_context.render(run_id),
        },
        "repo_latest": (
            {
                "path": _relative_display_path(repo_path, workspace_root),
                "content": _read_optional_text(repo_path),
            }
            if repo_path.exists()
            else None
        ),
    }


def build_approvals_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    iteration_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    return {
        "approvals": repository.list_approval_requests(run_id=run_id, iteration_id=iteration_id, status=status),
    }


def build_approval_detail_payload(workspace: str | Path, request_id: str) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    approval = repository.get_approval_request(request_id)
    if approval is None:
        raise FileNotFoundError(f"Approval request not found: {request_id}")
    return {"approval": approval}


def _ensure_active_resume_request(runtime: LocalOrchestrationRuntime, *, run_id: str, request_id: str) -> None:
    state = runtime.resume(run_id, "build")
    if state is None or state.pending_approval_request_id != request_id:
        raise ValueError("Approval request is not the active pending approval for this run")


def _stream_snapshot_payload(
    workspace: str | Path,
    *,
    run_id: str | None = None,
    room_id: str | None = None,
) -> dict[str, Any]:
    repository = LoopStateRepository(workspace)
    replay = ReplayService(workspace)
    payload: dict[str, Any] = {
        "generated_at": time.time(),
        "run_id": run_id,
        "room_id": room_id,
        "pending_approvals": repository.list_approval_requests(run_id=run_id, status="pending"),
    }
    if run_id:
        timeline = replay.run_timeline(run_id)
        payload["latest_run_event"] = timeline["timeline"][-1] if timeline["timeline"] else None
    if room_id:
        room_timeline = replay.room_timeline(room_id)
        payload["latest_room_event"] = room_timeline["timeline"][-1] if room_timeline["timeline"] else None
    return payload


def serialize_sse_event(*, event: str, data: dict[str, Any], event_id: str | None = None) -> bytes:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, ensure_ascii=False)
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _build_handler(
    workspace: str | Path,
    auth_token: str,
    reviewer_identity: str,
) -> type[BaseHTTPRequestHandler]:
    workspace_root = Path(workspace)
    replay = ReplayService(workspace_root)
    approvals = ApprovalInterruptAdapter(workspace_root)
    runtime = LocalOrchestrationRuntime(workspace_root)

    class ForwardBridgeHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            if not _request_is_loopback(self):
                _forward_json_response(self, {"error": "Forward bridge reads are only available from loopback clients."}, status=403)
                return
            if _loopback_origin(self) is None:
                _forward_json_response(self, {"error": "Missing or invalid loopback origin."}, status=403)
                return
            _forward_text_response(self, "", status=204, content_type="text/plain; charset=utf-8")

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query or "", keep_blank_values=False)
            if path.startswith("/api/") and not _require_bridge_read_access(self, auth_token):
                return
            if path in {"/", "/index.html"}:
                _forward_text_response(self, _bridge_root_html())
                return
            if path == "/api/events/stream":
                run_id = query.get("run_id", [None])[0]
                room_id = query.get("room_id", [None])[0]
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id") if run_id else None
                    safe_room_id = validate_room_id(room_id) if room_id else None
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                    return
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Connection", "keep-alive")
                    for key, value in _forward_extra_headers(self).items():
                        self.send_header(key, value)
                    self.end_headers()
                    event_id = 0
                    snapshot = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                    last_payload_key = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
                    self.wfile.write(serialize_sse_event(event="snapshot", data=snapshot, event_id=str(event_id)))
                    self.wfile.flush()
                    while True:
                        time.sleep(1)
                        current = _stream_snapshot_payload(workspace_root, run_id=safe_run_id, room_id=safe_room_id)
                        current_key = json.dumps(current, ensure_ascii=False, sort_keys=True)
                        event_id += 1
                        if current_key != last_payload_key:
                            self.wfile.write(serialize_sse_event(event="snapshot", data=current, event_id=str(event_id)))
                            last_payload_key = current_key
                        else:
                            self.wfile.write(
                                serialize_sse_event(
                                    event="heartbeat",
                                    data={"ts": time.time(), "run_id": safe_run_id, "room_id": safe_room_id},
                                    event_id=str(event_id),
                                )
                            )
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, FileNotFoundError, ValueError, OSError):
                    return
                except Exception as exc:
                    self.log_error("Forward stream unexpected error: %s", exc)
                    return
                return
            if path == "/api/runs":
                _forward_json_response(self, build_runs_payload(workspace_root))
                return
            if path == "/api/approvals":
                try:
                    safe_run_id = _validate_api_identifier(query.get("run_id", [None])[0], field_name="run_id") if query.get("run_id", [None])[0] else None
                    safe_iteration_id = _validate_api_identifier(query.get("iteration_id", [None])[0], field_name="iteration_id") if query.get("iteration_id", [None])[0] else None
                    safe_status = query.get("status", [None])[0]
                    if safe_status is not None and safe_status not in APPROVAL_STATUSES:
                        raise ValueError(f"Unsupported approval status: {safe_status}")
                    _forward_json_response(
                        self,
                        build_approvals_payload(
                            workspace_root,
                            run_id=safe_run_id,
                            iteration_id=safe_iteration_id,
                            status=safe_status,
                        ),
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/"):
                request_id = unquote(path.removeprefix("/api/approvals/"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    _forward_json_response(self, build_approval_detail_payload(workspace_root, safe_request_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/replay"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/replay"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _ensure_run_exists(replay.repository, safe_run_id)
                    _forward_json_response(self, replay.run_timeline(safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/state-docs"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/state-docs"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_state_docs_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/") and path.endswith("/context-latest"):
                run_id = unquote(path.removeprefix("/api/runs/").removesuffix("/context-latest"))
                try:
                    safe_run_id = _validate_api_identifier(run_id, field_name="run_id")
                    _forward_json_response(self, build_run_context_latest_payload(workspace_root, safe_run_id))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/runs/"):
                run_id = unquote(path.removeprefix("/api/runs/"))
                try:
                    _forward_json_response(self, build_run_detail_payload(workspace_root, _validate_api_identifier(run_id, field_name="run_id")))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/rooms/") and path.endswith("/timeline"):
                room_id = unquote(path.removeprefix("/api/rooms/").removesuffix("/timeline"))
                try:
                    _forward_json_response(self, replay.room_timeline(validate_room_id(room_id)))
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if not _require_bridge_write_access(self, auth_token):
                return
            try:
                payload = _read_json_body(self)
            except OverflowError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=413)
                return
            except ValueError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
                return
            if path.startswith("/api/approvals/") and path.endswith("/decision"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/decision"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    status = str(payload.get("status") or "").strip()
                    reviewer_note = str(payload.get("reviewer_note") or "").strip()
                    if status not in APPROVAL_STATUSES - {"pending"}:
                        raise ValueError(f"Unsupported approval status: {status}")
                    decided = approvals.decide(
                        request_id=safe_request_id,
                        status=status,
                        reviewer=reviewer_identity,
                        reviewer_note=reviewer_note,
                        edited_payload=payload.get("edited_payload") if isinstance(payload.get("edited_payload"), dict) else None,
                    )
                    _forward_json_response(self, {"approval": decided})
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            if path.startswith("/api/approvals/") and path.endswith("/resume"):
                request_id = unquote(path.removeprefix("/api/approvals/").removesuffix("/resume"))
                try:
                    safe_request_id = _validate_api_identifier(request_id, field_name="request_id")
                    request = build_approval_detail_payload(workspace_root, safe_request_id)["approval"]
                    _ensure_active_resume_request(runtime, run_id=request["run_id"], request_id=safe_request_id)
                    state = runtime.resume_after_approval(request["run_id"], graph_kind="build")
                    _forward_json_response(
                        self,
                        {
                            "approval": request,
                            "state": {
                                "run_id": state.run_id,
                                "current_step": state.current_step,
                                "stop_reason": state.stop_reason,
                                "approval_pending": state.approval_pending,
                            },
                        },
                    )
                except ValueError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=400)
                except FileNotFoundError as exc:
                    _forward_json_response(self, {"error": str(exc)}, status=404)
                except Exception as exc:
                    _internal_bridge_error(self, exc)
                return
            _forward_text_response(self, "Not found", status=404, content_type="text/plain; charset=utf-8")

    return ForwardBridgeHandler


def launch_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    if not _host_is_loopback(host):
        raise ValueError("Forward bridge host must be loopback-only (127.0.0.1, ::1, or localhost).")
    auth_token = secrets.token_urlsafe(24)
    resolved_reviewer_identity = _resolve_reviewer_identity(reviewer_identity)
    handler = _build_handler(workspace, auth_token, resolved_reviewer_identity)
    server = ThreadingHTTPServer((host, port), handler)
    actual_host, actual_port = server.server_address[0], server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    original_shutdown = server.shutdown

    def shutdown_and_close() -> None:
        original_shutdown()
        server.server_close()

    server.shutdown = shutdown_and_close  # type: ignore[assignment]
    return {
        "url": f"http://{actual_host}:{actual_port}/",
        "api_root": f"http://{actual_host}:{actual_port}/api",
        "token": auth_token,
        "reviewer_identity": resolved_reviewer_identity,
        "server": server,
        "thread": thread,
    }


def run_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    once: bool = False,
    reviewer_identity: str | None = None,
) -> dict[str, object]:
    launched = launch_forward_bridge(workspace, host=host, port=port, reviewer_identity=reviewer_identity)
    if once:
        return launched
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        launched["server"].shutdown()
        return launched


__all__ = [
    "build_approval_detail_payload",
    "build_approvals_payload",
    "build_run_context_latest_payload",
    "build_run_detail_payload",
    "build_run_state_docs_payload",
    "build_runs_payload",
    "launch_forward_bridge",
    "run_forward_bridge",
    "serialize_sse_event",
]
