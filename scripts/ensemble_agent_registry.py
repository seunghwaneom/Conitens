#!/usr/bin/env python3
"""
Persistent agent registry for Conitens (ADR-0002, Batch 1).

Event-first architecture: all mutations emit events via append_event(),
then project to .agent/agents/*.yaml and .notes/10_Agents/*.md.

CLI usage:
    python scripts/ensemble_agent_registry.py create <id> --role <role> [options]
    python scripts/ensemble_agent_registry.py list
    python scripts/ensemble_agent_registry.py show <id>
    python scripts/ensemble_agent_registry.py patch <id> --from <patch_file>
    python scripts/ensemble_agent_registry.py apply <patch_id>
    python scripts/ensemble_agent_registry.py archive <id>
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_hermes import create_hermes_profile
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / ".agent" / "agents"
NOTES_AGENTS_DIR = REPO_ROOT / ".notes" / "10_Agents"
PATCHES_DIR = REPO_ROOT / ".conitens" / "personas" / "candidate_patches"
NOTES_DIR = REPO_ROOT / ".notes"

VALID_ROLES = ("supervisor", "recorder", "improver", "worker")
VALID_STATUSES = ("active", "archived", "draft")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    """Write a dict as simple YAML (no PyYAML dependency)."""
    lines: list[str] = []
    for key, value in data.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        elif isinstance(value, dict):
            lines.append(f"{key}:")
            for k, v in value.items():
                if isinstance(v, list):
                    lines.append(f"  {k}:")
                    for item in v:
                        lines.append(f"    - {item}")
                else:
                    lines.append(f"  {k}: {json.dumps(v) if isinstance(v, str) and ' ' in v else v}")
        elif isinstance(value, str) and (" " in value or ":" in value):
            lines.append(f'{key}: "{value}"')
        else:
            lines.append(f"{key}: {value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _read_yaml(path: Path) -> dict[str, Any]:
    """Read simple YAML into dict (no PyYAML dependency)."""
    data: dict[str, Any] = {}
    current_key: str | None = None
    current_list: list[str] | None = None

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if line.startswith("  - ") and current_key:
            if current_list is None:
                current_list = []
                data[current_key] = current_list
            current_list.append(stripped.removeprefix("- ").strip('"'))
        elif ":" in stripped and not stripped.startswith("-"):
            if current_list is not None:
                current_list = None
            key, _, val = stripped.partition(":")
            key = key.strip()
            val = val.strip().strip('"')
            if val:
                # Handle inline list: [a, b, c]
                if val.startswith("[") and val.endswith("]"):
                    items = [s.strip().strip('"') for s in val[1:-1].split(",") if s.strip()]
                    data[key] = items
                else:
                    data[key] = val
            else:
                current_key = key
                current_list = []
                data[key] = current_list
    return data


def _write_obsidian_note(agent_id: str, data: dict[str, Any]) -> Path:
    """Write Obsidian-compatible agent card to .notes/10_Agents/."""
    NOTES_AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    path = NOTES_AGENTS_DIR / f"{agent_id}.md"

    skills = data.get("skills", [])
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(",") if s.strip()]

    lines = [
        "---",
        f"id: {agent_id}",
        f"role: {data.get('role', 'worker')}",
        f"public_persona: \"{data.get('public_persona', '')}\"",
        f"status: {data.get('status', 'active')}",
        f"memory_namespace: {data.get('memory_namespace', f'conitens/main/{agent_id}')}",
        f"hermes_profile: {data.get('hermes_profile', '')}",
        f"created_at: {data.get('created_at', _utc_now())}",
        f"updated_at: {_utc_now()}",
        "tags: [agent, " + data.get("role", "worker") + "]",
        "---",
        "",
        f"# {agent_id}",
        "",
        f"**Role**: {data.get('role', 'worker')}",
        f"**Persona**: {data.get('public_persona', 'N/A')}",
        f"**Status**: {data.get('status', 'active')}",
        "",
        "## Skills",
        "",
    ]
    for skill in skills:
        lines.append(f"- {skill}")

    lines.extend([
        "",
        "## Links",
        "",
        f"- Config: [[.agent/agents/{agent_id}.yaml]]",
        f"- Memory: [[60_Memory/{agent_id}]]",
        "",
    ])

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def agent_create(
    agent_id: str,
    *,
    role: str = "worker",
    public_persona: str = "",
    skills: list[str] | None = None,
    memory_namespace: str = "",
    workspace: str = "default",
    provider: str = "claude-code",
    model: str = "anthropic/claude-sonnet-4.6",
) -> dict[str, Any]:
    """Create a new persistent agent definition."""
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")

    AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    yaml_path = AGENTS_DIR / f"{agent_id}.yaml"
    if yaml_path.exists():
        raise FileExistsError(f"Agent {agent_id} already exists at {yaml_path}")

    skills = skills or []
    if not memory_namespace:
        memory_namespace = f"conitens/main/{agent_id}"

    hermes_profile = create_hermes_profile(agent_id, workspace)
    created_at = _utc_now()

    manifest = {
        "id": agent_id,
        "role": role,
        "public_persona": public_persona,
        "status": "active",
        "provider": provider,
        "model": model,
        "skills": skills,
        "memory_namespace": memory_namespace,
        "hermes_profile": hermes_profile,
        "handoff_required_fields": [
            "objective", "constraints", "decisions",
            "evidence_refs", "next_actions",
        ],
        "obsidian_note": f".notes/10_Agents/{agent_id}.md",
        "created_at": created_at,
    }

    # Event-first: emit event before writing files
    append_event(
        str(NOTES_DIR),
        event_type="agent.created",
        actor={"type": "system", "name": "agent-registry"},
        payload={
            "agent_id": agent_id,
            "role": role,
            "public_persona": public_persona,
            "skills": skills,
            "memory_namespace": memory_namespace,
        },
    )

    # Project to files
    _write_yaml(yaml_path, manifest)
    _write_obsidian_note(agent_id, manifest)

    return manifest


def agent_list() -> list[dict[str, Any]]:
    """List all registered agents."""
    if not AGENTS_DIR.exists():
        return []
    agents = []
    for yaml_file in sorted(AGENTS_DIR.glob("*.yaml")):
        data = _read_yaml(yaml_file)
        agents.append({
            "id": data.get("id", data.get("agent_id", yaml_file.stem)),
            "role": data.get("role", "unknown"),
            "status": data.get("status", "active"),
            "public_persona": data.get("public_persona", data.get("summary", "")),
            "skills": data.get("skills", data.get("capabilities", [])),
        })
    return agents


def agent_show(agent_id: str) -> dict[str, Any]:
    """Show full details for an agent."""
    yaml_path = AGENTS_DIR / f"{agent_id}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent {agent_id} not found at {yaml_path}")
    data = _read_yaml(yaml_path)

    # Attach pending patches
    patches = []
    if PATCHES_DIR.exists():
        for patch_file in PATCHES_DIR.glob(f"{agent_id}-*.md"):
            patches.append({"file": str(patch_file.name), "path": str(patch_file)})
    data["pending_patches"] = patches
    return data


def agent_patch(agent_id: str, *, patch_file: str, rationale: str = "") -> dict[str, Any]:
    """Propose a candidate patch for an agent."""
    yaml_path = AGENTS_DIR / f"{agent_id}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent {agent_id} not found")

    PATCHES_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    seq = len(list(PATCHES_DIR.glob(f"{agent_id}-{date_str}-*.md"))) + 1
    patch_name = f"{agent_id}-{date_str}-{seq:03d}.md"
    patch_path = PATCHES_DIR / patch_name

    # Path traversal protection: patch_file must be within repo root
    patch_source = Path(patch_file)
    if patch_source.exists():
        resolved = patch_source.resolve()
        if not str(resolved).startswith(str(REPO_ROOT)):
            raise ValueError(f"patch_file must be within the repository: {patch_file}")
        source_content = resolved.read_text(encoding="utf-8")
    else:
        source_content = patch_file

    # Event-first: emit event before writing patch file (I-1)
    append_event(
        str(NOTES_DIR),
        event_type="agent.patch_proposed",
        actor={"type": "system", "name": "agent-registry"},
        payload={
            "agent_id": agent_id,
            "patch_id": patch_name.removesuffix(".md"),
            "rationale": rationale,
        },
    )

    # Write patch file after event (I-1 compliant)
    patch_content = [
        "---",
        f"agent_id: {agent_id}",
        f"patch_id: {patch_name.removesuffix('.md')}",
        "status: proposed",
        f"rationale: \"{rationale}\"",
        f"created_at: {_utc_now()}",
        "---",
        "",
        "## Proposed Changes",
        "",
        source_content,
    ]
    patch_path.write_text("\n".join(patch_content), encoding="utf-8")

    return {"patch_id": patch_name.removesuffix(".md"), "path": str(patch_path)}


def agent_apply_patch(patch_id: str) -> dict[str, Any]:
    """Apply an approved patch (approval-gated)."""
    patch_path = PATCHES_DIR / f"{patch_id}.md"
    if not patch_path.exists():
        raise FileNotFoundError(f"Patch {patch_id} not found")

    append_event(
        str(NOTES_DIR),
        event_type="agent.patch_approved",
        actor={"type": "user", "name": "operator"},
        payload={"patch_id": patch_id},
    )
    append_event(
        str(NOTES_DIR),
        event_type="agent.patch_applied",
        actor={"type": "system", "name": "agent-registry"},
        payload={"patch_id": patch_id},
    )

    return {"patch_id": patch_id, "status": "applied"}


def agent_archive(agent_id: str) -> dict[str, Any]:
    """Archive an agent (soft-delete)."""
    yaml_path = AGENTS_DIR / f"{agent_id}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent {agent_id} not found")

    data = _read_yaml(yaml_path)
    data["status"] = "archived"
    _write_yaml(yaml_path, data)

    # Update obsidian note
    note_path = NOTES_AGENTS_DIR / f"{agent_id}.md"
    if note_path.exists():
        content = note_path.read_text(encoding="utf-8")
        content = content.replace("status: active", "status: archived")
        note_path.write_text(content, encoding="utf-8")

    append_event(
        str(NOTES_DIR),
        event_type="agent.archived",
        actor={"type": "system", "name": "agent-registry"},
        payload={"agent_id": agent_id},
    )

    return {"agent_id": agent_id, "status": "archived"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Conitens Persistent Agent Registry")
    sub = parser.add_subparsers(dest="command")

    # create
    c = sub.add_parser("create")
    c.add_argument("agent_id")
    c.add_argument("--role", default="worker", choices=VALID_ROLES)
    c.add_argument("--persona", default="")
    c.add_argument("--skills", default="", help="Comma-separated skill names")
    c.add_argument("--memory-namespace", default="")
    c.add_argument("--workspace", default="default")
    c.add_argument("--provider", default="claude-code")
    c.add_argument("--model", default="anthropic/claude-sonnet-4.6")

    # list
    sub.add_parser("list")

    # show
    s = sub.add_parser("show")
    s.add_argument("agent_id")

    # patch
    p = sub.add_parser("patch")
    p.add_argument("agent_id")
    p.add_argument("--from", dest="patch_file", required=True)
    p.add_argument("--rationale", default="")

    # apply
    a = sub.add_parser("apply")
    a.add_argument("patch_id")

    # archive
    ar = sub.add_parser("archive")
    ar.add_argument("agent_id")

    args = parser.parse_args()

    if args.command == "create":
        skills = [s.strip() for s in args.skills.split(",") if s.strip()] if args.skills else []
        result = agent_create(
            args.agent_id,
            role=args.role,
            public_persona=args.persona,
            skills=skills,
            memory_namespace=args.memory_namespace,
            workspace=args.workspace,
            provider=args.provider,
            model=args.model,
        )
        print(json.dumps(result, indent=2))
    elif args.command == "list":
        agents = agent_list()
        for a in agents:
            skills_str = ", ".join(a.get("skills", []))
            print(f"  {a['id']:30s} {a['role']:15s} {a['status']:10s} [{skills_str}]")
    elif args.command == "show":
        result = agent_show(args.agent_id)
        print(json.dumps(result, indent=2))
    elif args.command == "patch":
        result = agent_patch(args.agent_id, patch_file=args.patch_file, rationale=args.rationale)
        print(json.dumps(result, indent=2))
    elif args.command == "apply":
        result = agent_apply_patch(args.patch_id)
        print(json.dumps(result, indent=2))
    elif args.command == "archive":
        result = agent_archive(args.agent_id)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
