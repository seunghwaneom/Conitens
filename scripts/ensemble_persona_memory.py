#!/usr/bin/env python3
"""
Persona contracts, namespaced long-term memory, and review-only policy patches.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_contracts import parse_simple_yaml
from ensemble_loop_paths import candidate_patches_root, memory_record_schema_path, personas_root
from ensemble_loop_repository import LoopStateRepository


PERSONA_REQUIRED_FIELDS = (
    "id",
    "display_name",
    "role",
    "public_persona",
    "private_policy",
    "expertise_tags",
    "default_skill_refs",
    "memory_namespace",
    "handoff",
    "self_improvement",
)
MEMORY_KINDS = ("identity", "procedural", "episodic", "reflection")
AUTO_WRITABLE_KINDS = {"procedural", "episodic", "reflection"}


def utc_iso(ts: datetime | None = None) -> str:
    current = ts or datetime.now(timezone.utc)
    return current.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def write_memory_record_schema(workspace: str | Path) -> Path:
    path = memory_record_schema_path(workspace)
    payload = {
        "record_id": "string",
        "agent_id": "string",
        "namespace": "string",
        "kind": list(MEMORY_KINDS),
        "summary": "string",
        "tags": ["string"],
        "evidence_refs": ["string"],
        "confidence": "float",
        "salience": "float",
        "ttl_days": "integer|null",
        "approved": "boolean",
        "source_type": "string",
        "source_ref": "string",
        "created_at": "iso8601",
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def candidate_patch_root(workspace: str | Path) -> Path:
    return candidate_patches_root(workspace)


def validate_persona(persona: dict[str, Any]) -> None:
    missing = [field for field in PERSONA_REQUIRED_FIELDS if field not in persona]
    if missing:
        raise ValueError(f"Persona is missing required fields: {', '.join(missing)}")
    if not isinstance(persona["expertise_tags"], list):
        raise ValueError("expertise_tags must be a list")
    if not isinstance(persona["default_skill_refs"], list):
        raise ValueError("default_skill_refs must be a list")
    if not isinstance(persona["private_policy"], dict):
        raise ValueError("private_policy must be a mapping")
    if not isinstance(persona["handoff"], dict):
        raise ValueError("handoff must be a mapping")
    if not isinstance(persona["self_improvement"], dict):
        raise ValueError("self_improvement must be a mapping")


def load_persona(persona_file: str | Path) -> dict[str, Any]:
    path = Path(persona_file)
    persona = parse_simple_yaml(path.read_text(encoding="utf-8"))
    validate_persona(persona)
    persona["_path"] = str(path)
    return persona


class PersonaLoader:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)

    def load(self, persona_id: str) -> dict[str, Any]:
        for candidate in sorted(personas_root(self.workspace).glob("*.yaml")) + sorted(personas_root(self.workspace).glob("*.yml")):
            persona = load_persona(candidate)
            if persona["id"] == persona_id:
                return persona
        raise ValueError(f"Persona not found: {persona_id}")

    def load_all(self) -> list[dict[str, Any]]:
        return [
            load_persona(path)
            for path in sorted(personas_root(self.workspace).glob("*.yaml")) + sorted(personas_root(self.workspace).glob("*.yml"))
        ]


class PersonaSchemaValidator:
    def validate(self, payload: dict[str, Any]) -> None:
        validate_persona(payload)


class MemoryRepository:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        write_memory_record_schema(self.workspace)

    def write_record(
        self,
        *,
        agent_id: str,
        namespace: str,
        kind: str,
        summary: str,
        tags: list[str] | None = None,
        evidence_refs: list[str] | None = None,
        confidence: float = 0.5,
        salience: float = 0.5,
        ttl_days: int | None = None,
        approved: bool = True,
        source_type: str,
        source_ref: str,
        auto: bool = False,
    ) -> dict[str, Any]:
        if kind not in MEMORY_KINDS:
            raise ValueError(f"Unsupported memory kind: {kind}")
        if auto and kind not in AUTO_WRITABLE_KINDS:
            raise PermissionError("Identity memory is not auto-editable")
        return self.repository.append_memory_record(
            record_id=f"mem-{uuid.uuid4().hex}",
            agent_id=agent_id,
            namespace=namespace,
            kind=kind,
            summary=summary,
            tags=tags or [],
            evidence_refs=evidence_refs or [],
            confidence=confidence,
            salience=salience,
            ttl_days=ttl_days,
            approved=approved,
            source_type=source_type,
            source_ref=source_ref,
            created_at=utc_iso(),
        )

    def list_records(self, *, agent_id: str | None = None, namespace: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_memory_records(
            agent_id=agent_id,
            namespace=namespace,
        )


class MemoryRetriever:
    def __init__(self, repository: MemoryRepository):
        self.repository = repository

    def retrieve(
        self,
        *,
        agent_id: str | None = None,
        namespace: str,
        include_identity: bool = False,
        include_unapproved: bool = False,
    ) -> list[dict[str, Any]]:
        records = self.repository.list_records(agent_id=agent_id, namespace=namespace)
        result = []
        for record in records:
            if not include_identity and record["kind"] == "identity":
                continue
            if not include_unapproved and not record["approved"]:
                continue
            result.append(record)
        return result


class CandidatePatchWriter:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        candidate_patches_root(self.workspace)

    def write_patch(
        self,
        *,
        agent_id: str,
        namespace: str,
        patch_text: str,
        source_ref: str,
        target_persona_id: str | None = None,
        summary: str | None = None,
    ) -> dict[str, Any]:
        patch_id = f"patch-{uuid.uuid4().hex}"
        created_at = utc_iso()
        file_name = f"{agent_id}-{created_at.replace(':', '').replace('.', '')}.yaml"
        file_path = candidate_patches_root(self.workspace) / file_name
        target_persona = target_persona_id or agent_id
        patch_summary = summary or "candidate policy patch"
        file_path.write_text(
            "\n".join(
                [
                    f"patch_id: {patch_id}",
                    f"agent_id: {agent_id}",
                    f"namespace: {namespace}",
                    f"target_persona_id: {target_persona}",
                    "approved: false",
                    f"summary: {patch_summary}",
                    f"source_type: review_patch",
                    f"source_ref: {source_ref}",
                    f"created_at: {created_at}",
                    "patch_text: |",
                    *[f"  {line}" for line in patch_text.splitlines()],
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return self.repository.append_candidate_policy_patch(
            patch_id=patch_id,
            agent_id=agent_id,
            namespace=namespace,
            target_persona_id=target_persona,
            patch_path=str(file_path),
            summary=patch_summary,
            approved=False,
            source_type="review_patch",
            source_ref=source_ref,
            created_at=created_at,
        )

    def list_patches(
        self,
        *,
        agent_id: str | None = None,
        namespace: str | None = None,
        include_unapproved: bool = False,
    ) -> list[dict[str, Any]]:
        rows = self.repository.list_candidate_policy_patches(
            agent_id=agent_id,
            namespace=namespace,
            approved_only=not include_unapproved,
        )
        for item in rows:
            item["file_path"] = item.get("patch_path")
        return rows


__all__ = [
    "AUTO_WRITABLE_KINDS",
    "CandidatePatchWriter",
    "MEMORY_KINDS",
    "MemoryRepository",
    "MemoryRetriever",
    "PERSONA_REQUIRED_FIELDS",
    "PersonaLoader",
    "PersonaSchemaValidator",
    "candidate_patch_root",
    "candidate_patches_root",
    "load_persona",
    "personas_root",
    "write_memory_record_schema",
]
