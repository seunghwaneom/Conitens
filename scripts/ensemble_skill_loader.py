#!/usr/bin/env python3
"""
OpenHands-compatible local skill loader for .agents/skills/*/SKILL.md.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ensemble_contracts import parse_simple_yaml, split_frontmatter
from ensemble_persona_memory import PersonaLoader


SKILL_REQUIRED_FIELDS = {"name", "description"}
SKILL_ALLOWED_FIELDS = {
    "schema_v",
    "skill_id",
    "name",
    "description",
    "triggers",
    "tools",
    "expected_capabilities",
    "references",
}


@dataclass
class SkillSummary:
    skill_id: str
    name: str
    description: str
    path: str
    triggers: list[str]
    tools: list[dict[str, Any]]


class SkillValidationError(ValueError):
    pass


def skills_root(workspace: str | Path) -> Path:
    return Path(workspace) / ".agents" / "skills"


def discover_skill_paths(workspace: str | Path) -> list[Path]:
    root = skills_root(workspace)
    if not root.exists():
        return []
    return sorted(path for path in root.glob("*/SKILL.md") if path.is_file())


def _read_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    frontmatter_text, body = split_frontmatter(text)
    if not frontmatter_text:
        raise SkillValidationError(f"{path.name}: missing markdown frontmatter")
    warnings: list[str] = []
    frontmatter = parse_simple_yaml(frontmatter_text, warnings)
    if warnings:
        raise SkillValidationError(f"{path.name}: invalid frontmatter ({'; '.join(warnings)})")
    return frontmatter, body


def validate_skill_frontmatter(frontmatter: dict[str, Any], *, source: str) -> dict[str, Any]:
    missing = [field for field in SKILL_REQUIRED_FIELDS if frontmatter.get(field) in (None, "", [])]
    if missing:
        raise SkillValidationError(f"{source}: missing required field(s): {', '.join(sorted(missing))}")
    unknown = [field for field in frontmatter.keys() if field not in SKILL_ALLOWED_FIELDS]
    if unknown:
        raise SkillValidationError(f"{source}: unknown field(s): {', '.join(sorted(unknown))}")
    if frontmatter.get("triggers") is not None and not isinstance(frontmatter["triggers"], list):
        raise SkillValidationError(f"{source}: triggers must be a list")
    if frontmatter.get("tools") is not None and not isinstance(frontmatter["tools"], list):
        raise SkillValidationError(f"{source}: tools must be a list")
    if frontmatter.get("expected_capabilities") is not None and not isinstance(frontmatter["expected_capabilities"], list):
        raise SkillValidationError(f"{source}: expected_capabilities must be a list")
    skill_id = str(frontmatter.get("skill_id") or frontmatter["name"]).strip()
    data = dict(frontmatter)
    data["skill_id"] = skill_id
    return data


def load_skill_metadata(skill_path: str | Path) -> SkillSummary:
    path = Path(skill_path)
    frontmatter, _body = _read_frontmatter(path)
    validated = validate_skill_frontmatter(frontmatter, source=str(path))
    return SkillSummary(
        skill_id=validated["skill_id"],
        name=str(validated["name"]),
        description=str(validated["description"]),
        path=str(path),
        triggers=list(validated.get("triggers") or []),
        tools=list(validated.get("tools") or []),
    )


def load_skill_content(skill_path: str | Path) -> dict[str, Any]:
    path = Path(skill_path)
    frontmatter, body = _read_frontmatter(path)
    validated = validate_skill_frontmatter(frontmatter, source=str(path))
    return {
        "skill_id": validated["skill_id"],
        "name": validated["name"],
        "description": validated["description"],
        "path": str(path),
        "frontmatter": validated,
        "body": body,
    }


def list_available_skills(workspace: str | Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in discover_skill_paths(workspace):
        try:
            summary = load_skill_metadata(path)
        except SkillValidationError:
            continue
        items.append(
            {
                "skill_id": summary.skill_id,
                "name": summary.name,
                "description": summary.description,
                "path": summary.path,
                "triggers": summary.triggers,
                "tools": summary.tools,
            }
        )
    return items


def resolve_persona_default_skills(workspace: str | Path, persona_id: str) -> list[dict[str, Any]]:
    persona = PersonaLoader(workspace).load(persona_id)
    available = {item["skill_id"]: item for item in list_available_skills(workspace)}
    resolved = []
    missing = []
    for skill_ref in persona.get("default_skill_refs", []):
        skill = available.get(skill_ref)
        if skill is None:
            missing.append(skill_ref)
            continue
        resolved.append(skill)
    if missing:
        raise SkillValidationError(
            f"Persona '{persona_id}' references missing default skill(s): {', '.join(missing)}"
        )
    return resolved


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Discover and load .agents/skills SKILL.md documents")
    parser.add_argument("--workspace", default=".")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--skill")
    args = parser.parse_args()
    workspace = Path(args.workspace).resolve()
    if args.list:
        print(json.dumps(list_available_skills(workspace), ensure_ascii=False, indent=2))
        return 0
    if args.skill:
        for path in discover_skill_paths(workspace):
            summary = load_skill_metadata(path)
            if summary.skill_id == args.skill or summary.name == args.skill:
                print(json.dumps(load_skill_content(path), ensure_ascii=False, indent=2))
                return 0
        raise SystemExit(f"Unknown skill: {args.skill}")
    parser.error("Use --list or --skill <name>")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
