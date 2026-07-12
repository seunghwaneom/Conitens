#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_events import append_event


HARNESS_EVIDENCE_EVENT_TYPE = "harness.evidence_observed"
DEFAULT_HARNESS = "gajae-code"
DEFAULT_RUNTIME = "gjc"
DEFAULT_ACTOR_NAME = "gjc-adapter"

ALLOWED_INPUT_FIELDS = frozenset(
    {
        "harness",
        "runtime",
        "status",
        "harness_version",
        "run_id",
        "iteration_id",
        "task_id",
        "observed_at",
        "redaction_status",
        "transcript_ref",
        "summary",
        "evidence_refs",
    }
)
ALLOWED_STATUSES = frozenset({"queued", "running", "completed", "failed", "cancelled", "unknown"})
ALLOWED_REDACTION_STATUSES = frozenset({"metadata_only", "redacted", "unknown"})
SYMBOLIC_REF_PREFIXES = ("artifact:", "event:", "gjc:", "pr:", "ci:")
SYMBOLIC_REF_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
RAW_FIELD_COMPACTS = frozenset(
    {
        "prompt",
        "completion",
        "request",
        "response",
        "stdout",
        "stderr",
        "output",
        "terminaloutput",
        "transcript",
        "rawtranscript",
        "log",
        "content",
        "body",
        "diff",
        "patch",
        "comment",
        "command",
        "token",
        "secret",
    }
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def compact_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def find_raw_harness_fields(value: Any, *, path: str = "") -> list[str]:
    fields: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            child_path = f"{path}.{key_text}" if path else key_text
            if compact_key(key_text) in RAW_FIELD_COMPACTS:
                fields.append(child_path)
            fields.extend(find_raw_harness_fields(child, path=child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            fields.extend(find_raw_harness_fields(child, path=f"{path}[{index}]"))
    return fields


def optional_text(
    raw: dict[str, Any],
    field: str,
    *,
    default: str | None = None,
    max_length: int = 256,
) -> str | None:
    value = raw.get(field, default)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    text = value.strip()
    if not text:
        return None
    if len(text) > max_length:
        raise ValueError(f"{field} exceeds {max_length} characters")
    return text


def normalize_ref(ref: Any) -> str:
    if not isinstance(ref, str):
        raise ValueError("unsafe evidence ref: expected string")
    text = ref.strip()
    if not text:
        raise ValueError("unsafe evidence ref: empty")
    if any(ord(char) < 32 for char in text):
        raise ValueError("unsafe evidence ref: control character")
    if text.startswith("artifact:"):
        return "artifact:" + normalize_relative_artifact_ref(text.removeprefix("artifact:"))
    for prefix in SYMBOLIC_REF_PREFIXES:
        if prefix != "artifact:" and text.startswith(prefix):
            return prefix + normalize_symbolic_ref_id(text.removeprefix(prefix))
    return "artifact:" + normalize_relative_artifact_ref(text)


def normalize_symbolic_ref_id(ref_id: str) -> str:
    normalized = ref_id.strip().replace("\\", "/")
    if (
        not SYMBOLIC_REF_ID_RE.fullmatch(normalized)
        or "/" in normalized
        or ".." in normalized
        or re.match(r"^[A-Za-z]:", normalized)
    ):
        raise ValueError("unsafe evidence ref: symbolic id")
    return normalized


def normalize_relative_artifact_ref(ref: str) -> str:
    normalized = ref.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError("unsafe evidence ref: absolute path")
    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("unsafe evidence ref: traversal")
    return "/".join(parts)


def normalize_refs(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("evidence_refs must be a list")
    refs: list[str] = []
    for ref in value:
        normalized = normalize_ref(ref)
        if normalized not in refs:
            refs.append(normalized)
    return refs


def load_metadata_file(input_path: str | Path) -> dict[str, Any]:
    path = Path(input_path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid GJC metadata JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("GJC metadata must be a JSON object")
    return raw


def normalize_gjc_run_payload(raw: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    raw_fields = find_raw_harness_fields(raw)
    if raw_fields:
        raise ValueError("raw harness content fields are not importable: " + ", ".join(sorted(raw_fields)))

    unknown_fields = sorted(str(key) for key in raw if str(key) not in ALLOWED_INPUT_FIELDS)
    if unknown_fields:
        raise ValueError("unknown GJC metadata fields: " + ", ".join(unknown_fields))

    harness = optional_text(raw, "harness", default=DEFAULT_HARNESS) or DEFAULT_HARNESS
    runtime = optional_text(raw, "runtime", default=DEFAULT_RUNTIME) or DEFAULT_RUNTIME
    status = optional_text(raw, "status", default="unknown") or "unknown"
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"status must be one of: {', '.join(sorted(ALLOWED_STATUSES))}")
    redaction_status = optional_text(raw, "redaction_status", default="metadata_only") or "metadata_only"
    if redaction_status not in ALLOWED_REDACTION_STATUSES:
        raise ValueError(
            "redaction_status must be one of: " + ", ".join(sorted(ALLOWED_REDACTION_STATUSES))
        )

    run_id = optional_text(raw, "run_id", max_length=128)
    iteration_id = optional_text(raw, "iteration_id", max_length=128)
    task_id = optional_text(raw, "task_id", max_length=128)
    scope = {
        key: value
        for key, value in {
            "run_id": run_id,
            "iteration_id": iteration_id,
            "task_id": task_id,
        }.items()
        if value
    }

    transcript_ref_value = optional_text(raw, "transcript_ref", max_length=512)
    payload = {
        "harness": harness,
        "runtime": runtime,
        "status": status,
        "harness_version": optional_text(raw, "harness_version", max_length=64),
        "run_id": run_id,
        "iteration_id": iteration_id,
        "task_id": task_id,
        "observed_at": optional_text(raw, "observed_at", default=utc_now_iso(), max_length=64),
        "redaction_status": redaction_status,
        "transcript_ref": normalize_ref(transcript_ref_value) if transcript_ref_value else None,
        "summary": optional_text(raw, "summary", max_length=512),
        "evidence_refs": normalize_refs(raw.get("evidence_refs")),
    }
    return payload, scope


def import_gjc_run_metadata(
    workspace: str | Path,
    metadata: dict[str, Any],
    *,
    actor_name: str = DEFAULT_ACTOR_NAME,
) -> dict[str, Any]:
    payload, scope = normalize_gjc_run_payload(metadata)
    return append_event(
        workspace,
        event_type=HARNESS_EVIDENCE_EVENT_TYPE,
        actor={"type": "system", "name": actor_name},
        scope=scope,
        payload=payload,
    )


def import_gjc_run_file(
    workspace: str | Path,
    input_path: str | Path,
    *,
    actor_name: str = DEFAULT_ACTOR_NAME,
) -> dict[str, Any]:
    return import_gjc_run_metadata(workspace, load_metadata_file(input_path), actor_name=actor_name)


def event_response(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": event["type"],
        "event_id": event["event_id"],
        "scope": event.get("scope", {}),
        "payload": event.get("payload", {}),
        "redaction": event.get("redaction", {}),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import metadata-only Gajae-Code harness evidence")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser("import-run", help="Import one redacted GJC run metadata file")
    import_parser.add_argument("--input", required=True, help="Path to a redacted GJC run metadata JSON file")
    import_parser.add_argument("--actor-name", default=DEFAULT_ACTOR_NAME)
    import_parser.add_argument("--format", choices=("json",), default="json")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "import-run":
            event = import_gjc_run_file(args.workspace, args.input, actor_name=args.actor_name)
            print(json.dumps(event_response(event), ensure_ascii=False, indent=2))
            return 0
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
