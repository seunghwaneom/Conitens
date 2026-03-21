#!/usr/bin/env python3
"""
Shared provider launch template helpers.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


DOUBLE_BRACE_PATTERN = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")
SINGLE_BRACE_PATTERN = re.compile(r"(?<!\{)\{([a-zA-Z0-9_]+)\}(?!\})")


def build_provider_render_values(
    *,
    workspace_root: str | Path | None = None,
    workspace_path: str | Path | None = None,
    task_id: str | None = None,
    agent_id: str | None = None,
    room_id: str | None = None,
    spawn_id: str | None = None,
    memory_file: str | Path | None = None,
    persona_file: str | Path | None = None,
    shared_memory_file: str | Path | None = None,
    task_prompt: str | None = None,
    task_prompt_file: str | Path | None = None,
) -> dict[str, str]:
    workspace_root_value = str(workspace_root or workspace_path or "")
    workspace_path_value = str(workspace_path or workspace_root_value)
    return {
        "workspace_root": workspace_root_value,
        "workspace_path": workspace_path_value,
        "task_id": str(task_id or ""),
        "agent_id": str(agent_id or ""),
        "room_id": str(room_id or ""),
        "spawn_id": str(spawn_id or ""),
        "memory_file": str(memory_file or ""),
        "persona_file": str(persona_file or ""),
        "shared_memory_file": str(shared_memory_file or ""),
        "task_prompt": str(task_prompt or ""),
        "task_prompt_file": str(task_prompt_file or ""),
    }


def interpolate_provider_template(template: str, values: dict[str, Any]) -> str:
    safe_values = {key: "" if value is None else str(value) for key, value in values.items()}
    deferred_values: dict[str, str] = {}

    def replace_double(match: re.Match[str]) -> str:
        token = f"__CONITENS_DBL_{len(deferred_values)}__"
        deferred_values[token] = safe_values.get(match.group(1).strip(), "")
        return token

    rendered = DOUBLE_BRACE_PATTERN.sub(replace_double, template)
    rendered = SINGLE_BRACE_PATTERN.sub(lambda match: safe_values.get(match.group(1).strip(), ""), rendered)
    for token, value in deferred_values.items():
        rendered = rendered.replace(token, value)
    return rendered


def build_provider_command(provider: dict[str, Any], values: dict[str, Any]) -> list[str]:
    command = interpolate_provider_template(str(provider.get("command") or ""), values)
    args = [interpolate_provider_template(str(item), values) for item in (provider.get("args") or [])]
    if not command:
        raise ValueError(f"Provider {provider.get('provider_id')} is missing a command.")
    return [command, *args]


__all__ = [
    "build_provider_command",
    "build_provider_render_values",
    "interpolate_provider_template",
]
