from __future__ import annotations

from collections.abc import Callable, Mapping
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from ensemble_approval import APPROVAL_STATUSES
from ensemble_forward_bridge_http_payloads import (
    agent_detail_payload,
    agent_summaries,
    build_run_replay_payload,
    room_timeline_payload,
)
from ensemble_forward_bridge_http_protocol import (
    BridgeRequestError,
    binding_call,
    json_response,
    optional_binding,
    validate_identifier,
)
from ensemble_room import validate_room_id


def _handle_agents(
    handler: BaseHTTPRequestHandler,
    path: str,
    bindings: Any,
) -> bool:
    if path == "/api/agents":
        json_response(handler, agent_summaries(binding_call(bindings, "agent_list")))
        return True
    if not path.startswith("/api/agents/"):
        return False
    raw_agent_id = unquote(path.removeprefix("/api/agents/"))
    if not raw_agent_id:
        raise BridgeRequestError("agent_id required")
    agent_id = validate_identifier(raw_agent_id, field_name="agent_id")
    json_response(handler, agent_detail_payload(agent_id, binding_call(bindings, "agent_show", agent_id)))
    return True


def _handle_threads(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    if path == "/api/threads":
        payload = binding_call(
            bindings,
            "build_threads_payload",
            workspace,
            workspace_ref=query.get("workspace", [None])[0],
            status=query.get("status", [None])[0],
            limit=int(query.get("limit", ["50"])[0]),
        )
    elif path == "/api/threads/search":
        term = query.get("q", [""])[0]
        if not term:
            raise BridgeRequestError("q parameter required")
        payload = binding_call(
            bindings,
            "build_thread_search_payload",
            workspace,
            term,
            limit=int(query.get("limit", ["20"])[0]),
        )
    elif path.startswith("/api/threads/"):
        raw_thread_id = unquote(path.removeprefix("/api/threads/"))
        if not raw_thread_id:
            raise BridgeRequestError("thread_id required")
        thread_id = validate_identifier(raw_thread_id, field_name="thread_id")
        payload = {"thread": binding_call(bindings, "build_thread_detail_payload", workspace, thread_id)}
    else:
        return False
    json_response(handler, payload)
    return True


def _handle_approvals(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    if path == "/api/approvals":
        status = query.get("status", [None])[0]
        if status is not None and status not in APPROVAL_STATUSES:
            raise BridgeRequestError(f"Unsupported approval status: {status}")
        payload = binding_call(
            bindings,
            "build_approvals_payload",
            workspace,
            run_id=_optional_id(query, "run_id"),
            iteration_id=_optional_id(query, "iteration_id"),
            task_id=_optional_id(query, "task_id"),
            status=status,
        )
    elif path.startswith("/api/approvals/"):
        request_id = validate_identifier(unquote(path.removeprefix("/api/approvals/")), field_name="request_id")
        payload = binding_call(bindings, "build_approval_detail_payload", workspace, request_id)
    else:
        return False
    json_response(handler, payload)
    return True


def _optional_id(query: dict[str, list[str]], name: str) -> str | None:
    value = query.get(name, [None])[0]
    return validate_identifier(value, field_name=name) if value else None


def _fallback(bindings: Any, name: str, fallback: Callable[..., Any]) -> Callable[..., Any]:
    return optional_binding(bindings, name, fallback)


def _handle_runs(
    handler: BaseHTTPRequestHandler,
    path: str,
    workspace: Path,
    bindings: Any,
) -> bool:
    if path == "/api/runs":
        json_response(handler, binding_call(bindings, "build_runs_payload", workspace))
        return True
    if not path.startswith("/api/runs/"):
        return False
    suffixes = {
        "/replay": ("build_run_replay_payload", build_run_replay_payload),
        "/state-docs": ("build_run_state_docs_payload", None),
        "/context-latest": ("build_run_context_latest_payload", None),
    }
    for suffix, (binding_name, fallback) in suffixes.items():
        if path.endswith(suffix):
            run_id = validate_identifier(
                unquote(path.removeprefix("/api/runs/").removesuffix(suffix)),
                field_name="run_id",
            )
            function = _fallback(bindings, binding_name, fallback) if fallback is not None else None
            payload = function(workspace, run_id) if function is not None else binding_call(bindings, binding_name, workspace, run_id)
            json_response(handler, payload)
            return True
    run_id = validate_identifier(unquote(path.removeprefix("/api/runs/")), field_name="run_id")
    json_response(handler, binding_call(bindings, "build_run_detail_payload", workspace, run_id))
    return True


def handle_resource_route(
    handler: BaseHTTPRequestHandler,
    path: str,
    query: dict[str, list[str]],
    workspace: Path,
    bindings: Any,
) -> bool:
    if _handle_agents(handler, path, bindings):
        return True
    if _handle_threads(handler, path, query, workspace, bindings):
        return True
    if _handle_approvals(handler, path, query, workspace, bindings):
        return True
    if _handle_runs(handler, path, workspace, bindings):
        return True
    if path.startswith("/api/rooms/") and path.endswith("/timeline"):
        room_id = validate_room_id(unquote(path.removeprefix("/api/rooms/").removesuffix("/timeline")))
        function = _fallback(bindings, "build_room_timeline_payload", room_timeline_payload)
        json_response(handler, function(workspace, room_id))
        return True
    return False
