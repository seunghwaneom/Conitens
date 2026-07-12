from __future__ import annotations

import hmac
import json
from collections.abc import Callable, Mapping
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse

from ensemble_forward_bridge_commands import CommandResult
from ensemble_ui import _host_is_loopback, _request_is_loopback, _validate_api_identifier as _validate_ui_api_identifier

MAX_REQUEST_BODY_BYTES = 1_000_000
MAX_REJECT_DRAIN_BYTES = MAX_REQUEST_BODY_BYTES + 128_000


class BridgeRequestError(ValueError):
    pass


class BridgeBodyTooLargeError(OverflowError):
    pass


def sanitize_reviewer_identity(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    return text[:120] if text else "forward-bridge"


def loopback_origin(handler: BaseHTTPRequestHandler) -> str | None:
    origin = handler.headers.get("Origin")
    if not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not _host_is_loopback(parsed.hostname):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def extra_headers(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    origin = loopback_origin(handler)
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Max-Age": "300",
        "Vary": "Origin",
    }


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in extra_headers(handler).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def text_response(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    *,
    headers: dict[str, str] | None = None,
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    for key, value in {**extra_headers(handler), **(headers or {})}.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def command_response(handler: BaseHTTPRequestHandler, result: CommandResult) -> None:
    if result.content_type.startswith("application/json"):
        json_response(handler, result.payload, status=result.status)
        return
    text_response(handler, str(result.payload), status=result.status, content_type=result.content_type)


def require_access(handler: BaseHTTPRequestHandler, auth_token: str, *, operation: str) -> bool:
    if not _request_is_loopback(handler):
        json_response(
            handler,
            {"error": f"Forward bridge {operation} are only available from loopback clients."},
            status=403,
        )
        return False
    if hmac.compare_digest(handler.headers.get("Authorization", ""), f"Bearer {auth_token}"):
        return True
    json_response(handler, {"error": "Missing or invalid forward bridge token."}, status=403)
    return False


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0") or "0"
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise BridgeRequestError("Invalid Content-Length") from exc
    if length < 0:
        raise BridgeRequestError("Invalid Content-Length")
    if length > MAX_REQUEST_BODY_BYTES:
        if length <= MAX_REJECT_DRAIN_BYTES:
            handler.rfile.read(length)
        raise BridgeBodyTooLargeError("Request body too large")
    body = handler.rfile.read(length).decode("utf-8") if length else "{}"
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise BridgeRequestError("Malformed JSON body") from exc
    if not isinstance(payload, dict):
        raise BridgeRequestError("JSON body must be an object")
    return payload


def validate_identifier(value: str, *, field_name: str) -> str:
    try:
        return _validate_ui_api_identifier(value, field_name=field_name)
    except ValueError as exc:
        raise BridgeRequestError(f"Invalid {field_name}") from exc


def resolve_bindings(bindings: Any | Callable[[], Any] | None) -> Any:
    if bindings is None:
        import ensemble_forward_bridge as bridge_facade

        return bridge_facade
    return bindings() if callable(bindings) else bindings


def binding_attr(bindings: Any, name: str) -> Any:
    return bindings[name] if isinstance(bindings, Mapping) else getattr(bindings, name)


def binding_call(bindings: Any, name: str, *args: Any, **kwargs: Any) -> Any:
    return binding_attr(bindings, name)(*args, **kwargs)


def optional_binding(bindings: Any, name: str, fallback: Callable[..., Any]) -> Callable[..., Any]:
    if isinstance(bindings, Mapping) and name in bindings:
        return bindings[name]
    return getattr(bindings, name, fallback)


def internal_error(handler: BaseHTTPRequestHandler, exc: Exception) -> None:
    handler.log_error("Forward bridge internal error: %s", type(exc).__name__)
    json_response(handler, {"error": "Internal forward bridge error."}, status=500)
