#!/usr/bin/env python3

from __future__ import annotations

import getpass
import os
import secrets
import threading
import time
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from ensemble_forward_bridge_commands import dispatch_command
from ensemble_forward_bridge_http_payloads import (
    agent_detail_payload as _agent_detail_payload,
    build_run_replay_payload as _build_run_replay_payload,
    room_timeline_payload as _build_room_timeline_payload,
)
from ensemble_forward_bridge_http_protocol import (
    BridgeBodyTooLargeError,
    BridgeRequestError,
    command_response as _forward_command_result,
    internal_error as _internal_bridge_error,
    json_response as _forward_json_response,
    loopback_origin as _loopback_origin,
    read_json_body as _read_json_body,
    require_access,
    resolve_bindings,
    sanitize_reviewer_identity as _sanitize_reviewer_identity,
    text_response as _forward_text_response,
)
from ensemble_forward_bridge_http_routes import bridge_root_html as _bridge_root_html, handle_get_route
from ensemble_ui import _host_is_loopback, _request_is_loopback


class ForwardBridgeServer(ThreadingHTTPServer):
    def shutdown(self) -> None:
        super().shutdown()
        self.server_close()


def _resolve_reviewer_identity(explicit_identity: str | None = None) -> str:
    if explicit_identity:
        return _sanitize_reviewer_identity(explicit_identity)
    env_identity = os.environ.get("CONITENS_FORWARD_REVIEWER")
    if env_identity:
        return _sanitize_reviewer_identity(env_identity)
    return _sanitize_reviewer_identity(f"local/{getpass.getuser()}")


def _handle_write_request(
    handler: BaseHTTPRequestHandler,
    method: str,
    workspace: Path,
    auth_token: str,
    reviewer_identity: str,
) -> None:
    if not require_access(handler, auth_token, operation="writes"):
        return
    try:
        payload = _read_json_body(handler)
    except BridgeBodyTooLargeError as exc:
        _forward_json_response(handler, {"error": str(exc)}, status=413)
        return
    except BridgeRequestError as exc:
        _forward_json_response(handler, {"error": str(exc)}, status=400)
        return
    try:
        result = dispatch_command(
            method,
            urlparse(handler.path).path,
            payload,
            workspace=workspace,
            reviewer_identity=reviewer_identity,
        )
    except Exception as exc:  # noqa: BROAD_EXCEPT_OK
        _internal_bridge_error(handler, exc)
        return
    if result is None:
        _forward_text_response(handler, "Not found", status=404, content_type="text/plain; charset=utf-8")
        return
    _forward_command_result(handler, result)


def _build_handler(
    workspace: str | Path,
    auth_token: str,
    reviewer_identity: str,
    *,
    bindings: Any | Callable[[], Any] | None,
) -> type[BaseHTTPRequestHandler]:
    workspace_root = Path(workspace)

    class ForwardBridgeHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            if not _request_is_loopback(self):
                _forward_json_response(
                    self,
                    {"error": "Forward bridge reads are only available from loopback clients."},
                    status=403,
                )
                return
            if _loopback_origin(self) is None:
                _forward_json_response(self, {"error": "Missing or invalid loopback origin."}, status=403)
                return
            _forward_text_response(self, "", status=204, content_type="text/plain; charset=utf-8")

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/") and not require_access(self, auth_token, operation="reads"):
                return
            try:
                handle_get_route(
                    self,
                    parsed.path,
                    parse_qs(parsed.query or "", keep_blank_values=False),
                    workspace_root,
                    resolve_bindings(bindings),
                )
            except (BridgeRequestError, ValueError) as exc:
                _forward_json_response(self, {"error": str(exc)}, status=400)
            except FileNotFoundError as exc:
                _forward_json_response(self, {"error": str(exc)}, status=404)
            except Exception as exc:  # noqa: BROAD_EXCEPT_OK
                _internal_bridge_error(self, exc)

        def do_POST(self) -> None:  # noqa: N802
            _handle_write_request(self, "POST", workspace_root, auth_token, reviewer_identity)

        def do_PATCH(self) -> None:  # noqa: N802
            _handle_write_request(self, "PATCH", workspace_root, auth_token, reviewer_identity)

        def do_DELETE(self) -> None:  # noqa: N802
            _handle_write_request(self, "DELETE", workspace_root, auth_token, reviewer_identity)

    return ForwardBridgeHandler


def launch_forward_bridge(
    workspace: str | Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8785,
    reviewer_identity: str | None = None,
    bindings: Any | Callable[[], Any] | None = None,
) -> dict[str, Any]:
    if not _host_is_loopback(host):
        raise BridgeRequestError("Forward bridge host must be loopback-only (127.0.0.1, ::1, or localhost).")
    auth_token = secrets.token_urlsafe(24)
    resolved_identity = _resolve_reviewer_identity(reviewer_identity)
    server = ForwardBridgeServer((host, port), _build_handler(workspace, auth_token, resolved_identity, bindings=bindings))
    actual_host, actual_port = server.server_address[0], server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return {
        "url": f"http://{actual_host}:{actual_port}/",
        "api_root": f"http://{actual_host}:{actual_port}/api",
        "token": auth_token,
        "reviewer_identity": resolved_identity,
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
    bindings: Any | Callable[[], Any] | None = None,
) -> dict[str, Any]:
    launched = launch_forward_bridge(
        workspace,
        host=host,
        port=port,
        reviewer_identity=reviewer_identity,
        bindings=bindings,
    )
    if once:
        return launched
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        launched["server"].shutdown()
        return launched


__all__ = ["_build_handler", "launch_forward_bridge", "run_forward_bridge"]
