#!/usr/bin/env python3
"""
Minimal read-only MCP-style stdio server for Conitens.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_gate import list_gate_records
from ensemble_handoff import list_handoffs
from ensemble_meeting import list_meetings
from ensemble_office import collect_context, collect_locks, collect_office_snapshot, collect_questions, collect_tasks, collect_workflow_runs
from ensemble_registry import registry_summary
from ensemble_workflow import explain_workflow


TOOLS = [
    {
        "name": "task.list",
        "description": "List tasks across .notes statuses.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "task.get",
        "description": "Get a specific task by task_id.",
        "inputSchema": {
            "type": "object",
            "required": ["task_id"],
            "properties": {"task_id": {"type": "string"}},
        },
    },
    {
        "name": "locks.list",
        "description": "List active file locks.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "questions.list",
        "description": "List pending or recently answered questions.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "context.get",
        "description": "Return the latest context document contents.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "meetings.list",
        "description": "List meetings and current status.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "workflow.runs",
        "description": "List workflow run records.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "handoffs.list",
        "description": "List typed handoff artifacts.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "registry.summary",
        "description": "Return control-plane registry validation summary.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "office.snapshot",
        "description": "Return the current office snapshot as JSON.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]

RESOURCES = [
    {"uri": "conitens://context/current", "name": "Current Context", "description": "Current context snapshot."},
    {"uri": "conitens://workflow/runs", "name": "Workflow Runs", "description": "Workflow run records."},
    {"uri": "conitens://workflow/definitions", "name": "Workflow Definitions", "description": "Workflow contract registry."},
    {"uri": "conitens://gates/pending", "name": "Pending Gates", "description": "Durable approval gate records."},
    {"uri": "conitens://office/snapshot", "name": "Office Snapshot", "description": "Current office operational snapshot."},
    {"uri": "conitens://registry/summary", "name": "Registry Summary", "description": "Agent/skill/workflow/gate registry validation summary."},
]

PROMPTS = [
    {
        "name": "workflow.explain",
        "description": "Render a human-readable explanation for a workflow and its inputs.",
        "inputSchema": {
            "type": "object",
            "required": ["workflow"],
            "properties": {
                "workflow": {"type": "string"},
                "inputs": {"type": "object"},
            },
        },
    },
    {
        "name": "workflow.blocked-summary",
        "description": "Summarize the currently blocked workflow and gate state.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "approval.prepare",
        "description": "Prepare an approval request summary for the latest pending gate.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "verify.checklist",
        "description": "Generate a verify checklist from files or the latest workflow run.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "files": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
]


def list_resources() -> list[dict[str, Any]]:
    return RESOURCES


def list_prompts() -> list[dict[str, Any]]:
    return PROMPTS


def read_resource(workspace: str | Path, uri: str) -> Any:
    if uri == "conitens://context/current":
        return collect_context(workspace)
    if uri == "conitens://workflow/runs":
        return collect_workflow_runs(workspace)
    if uri == "conitens://workflow/definitions":
        return registry_summary(workspace).get("workflows", [])
    if uri == "conitens://gates/pending":
        return [gate for gate in list_gate_records(workspace) if gate.get("status") in {"pending", "approved", "resumed"}]
    if uri == "conitens://office/snapshot":
        return collect_office_snapshot(workspace)
    if uri == "conitens://registry/summary":
        return registry_summary(workspace)
    raise KeyError(f"Unsupported resource: {uri}")


def render_prompt(workspace: str | Path, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    arguments = arguments or {}
    if name == "workflow.explain":
        workflow = str(arguments.get("workflow", ""))
        inputs = arguments.get("inputs", {}) if isinstance(arguments.get("inputs", {}), dict) else {}
        explanation = explain_workflow(workspace, workflow, inputs, actor="MCP")
        lines = [f"Workflow: {explanation['workflow_id']}"]
        for step in explanation.get("steps", []):
            lines.append(f"- {step.get('id')}: {step.get('kind')}")
        if explanation.get("errors"):
            lines.append("Errors:")
            lines.extend(f"- {error}" for error in explanation["errors"])
        return {"name": name, "text": "\n".join(lines)}
    if name == "workflow.blocked-summary":
        snapshot = collect_office_snapshot(workspace)
        blocked = snapshot.get("blocked_items", [])
        text = "\n".join(
            f"- [{item['kind']}] {item['label']}: {item['detail']} -> {item.get('action_needed')}"
            for item in blocked[:10]
        ) or "- No blocked items."
        return {"name": name, "text": text}
    if name == "approval.prepare":
        pending = [gate for gate in list_gate_records(workspace) if gate.get("status") == "pending"]
        if not pending:
            return {"name": name, "text": "No pending gate records."}
        gate = pending[0]
        return {
            "name": name,
            "text": (
                f"Approve gate {gate['gate_id']} for run {gate.get('run_id')}.\n"
                f"Action: {gate.get('action_class')}\n"
                f"Prompt: {gate.get('prompt')}"
            ),
        }
    if name == "verify.checklist":
        files = arguments.get("files") or []
        if not files:
            runs = collect_workflow_runs(workspace)
            if runs:
                latest = runs[0]
                files = [((latest.get("last_step") or {}).get("id") or "latest workflow step")]
        lines = ["Verify checklist:"]
        for item in files:
            lines.append(f"- verify target: {item}")
        lines.extend(["- confirm gate status", "- attach evidence artifact", "- keep verify-before-close intact"])
        return {"name": name, "text": "\n".join(lines)}
    raise KeyError(f"Unsupported prompt: {name}")


def call_tool(workspace: str | Path, name: str, arguments: dict[str, Any] | None = None) -> Any:
    arguments = arguments or {}
    if name == "task.list":
        return collect_tasks(workspace)
    if name == "task.get":
        task_id = arguments.get("task_id")
        for task in collect_tasks(workspace):
            if task["task_id"] == task_id:
                return task
        raise KeyError(f"Task not found: {task_id}")
    if name == "locks.list":
        return collect_locks(workspace)
    if name == "questions.list":
        return collect_questions(workspace)
    if name == "context.get":
        return {"content": collect_context(workspace)}
    if name == "meetings.list":
        return list_meetings(workspace)
    if name == "workflow.runs":
        return collect_workflow_runs(workspace)
    if name == "handoffs.list":
        return list_handoffs(workspace)
    if name == "registry.summary":
        return registry_summary(workspace)
    if name == "office.snapshot":
        return collect_office_snapshot(workspace)
    raise KeyError(f"Unsupported tool: {name}")


def handle_request(workspace: str | Path, request: dict[str, Any]) -> dict[str, Any]:
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params", {})

    try:
        if method == "initialize":
            result = {"server": "conitens-mcp-v0", "capabilities": {"tools": True, "resources": True, "prompts": True, "write": False}}
        elif method == "resources/list":
            result = {"resources": RESOURCES}
        elif method == "resources/read":
            uri = params.get("uri")
            result = {"contents": [{"uri": uri, "text": json.dumps(read_resource(workspace, uri), ensure_ascii=False, indent=2)}]}
        elif method == "prompts/list":
            result = {"prompts": PROMPTS}
        elif method == "prompts/get":
            prompt_name = params.get("name")
            prompt_arguments = params.get("arguments", {})
            rendered = render_prompt(workspace, prompt_name, prompt_arguments)
            result = {"prompt": rendered}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            tool_name = params.get("name")
            result = {"content": call_tool(workspace, tool_name, params.get("arguments", {}))}
            append_event(
                workspace,
                event_type="MCP_TOOL_CALLED",
                actor={"type": "system", "name": "MCP"},
                scope={"tool": tool_name},
                payload={"tool": tool_name},
            )
        else:
            raise KeyError(f"Unsupported method: {method}")

        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": str(exc)}}


def serve_stdio(workspace: str | Path) -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}
        else:
            response = handle_request(workspace, request)
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens MCP read-only server")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("serve")
    subparsers.add_parser("tools")
    call_parser = subparsers.add_parser("call")
    call_parser.add_argument("tool")
    call_parser.add_argument("--arguments", default="{}")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "serve":
        return serve_stdio(args.workspace)
    if args.command == "tools":
        print(json.dumps({"tools": TOOLS}, ensure_ascii=False, indent=2))
        return 0
    if args.command == "call":
        arguments = json.loads(args.arguments)
        result = call_tool(args.workspace, args.tool, arguments)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
