#!/usr/bin/env python3
"""
Append-only event logging and redaction helpers for Conitens extensions.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_paths import candidate_notes_dirs, ensure_notes_dir

EVENT_SCHEMA_V = 1
DEFAULT_EVENT_FILE = "events.jsonl"

REDACTION_PATTERNS = {
    "path": [
        re.compile(r"/home/[^/\s]+/"),
        re.compile(r"/Users/[^/\s]+/"),
        re.compile(r"[A-Za-z]:\\\\Users\\\\[^\\\s]+\\\\"),
    ],
    "token": [
        re.compile(r"sk-[A-Za-z0-9]+", re.IGNORECASE),
        re.compile(r"ghp_[A-Za-z0-9]+", re.IGNORECASE),
        re.compile(r"\btoken[=:]\s*[A-Za-z0-9._-]+\b", re.IGNORECASE),
        re.compile(r"\bBearer\s+[A-Za-z0-9._-]+\b", re.IGNORECASE),
    ],
    "api_key": [
        re.compile(r"\bapi[_-]?key[=:]\s*[A-Za-z0-9._-]+\b", re.IGNORECASE),
    ],
}


def get_events_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "events")


def legacy_events_dir(workspace: str | Path) -> Path:
    return candidate_notes_dirs(workspace, "events", include_missing=True)[-1]


def get_events_file(workspace: str | Path, *, shard_date: str | None = None) -> Path:
    base_dir = get_events_dir(workspace)
    base_dir.mkdir(parents=True, exist_ok=True)
    if shard_date:
        return base_dir / f"events-{shard_date}.jsonl"
    return base_dir / DEFAULT_EVENT_FILE


def get_legacy_events_file(workspace: str | Path, *, shard_date: str | None = None) -> Path:
    base_dir = legacy_events_dir(workspace)
    base_dir.mkdir(parents=True, exist_ok=True)
    if shard_date:
        return base_dir / f"events-{shard_date}.jsonl"
    return base_dir / DEFAULT_EVENT_FILE


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or utc_now()
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_event_id(ts: datetime | None = None) -> str:
    ts = ts or utc_now()
    return f"E-{ts.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"


def redact_text(text: str, rules: list[str] | None = None) -> tuple[str, list[str]]:
    applied_rules: list[str] = []
    masked = text
    for rule in rules or ["path", "token", "api_key"]:
        for pattern in REDACTION_PATTERNS.get(rule, []):
            if pattern.search(masked):
                masked = pattern.sub("[REDACTED]", masked)
                if rule not in applied_rules:
                    applied_rules.append(rule)
    return masked, applied_rules


def redact_data(value: Any, rules: list[str] | None = None) -> tuple[Any, list[str]]:
    applied_rules: list[str] = []

    if isinstance(value, str):
        masked, local_rules = redact_text(value, rules)
        return masked, local_rules

    if isinstance(value, list):
        masked_items = []
        for item in value:
            masked, local_rules = redact_data(item, rules)
            masked_items.append(masked)
            for rule in local_rules:
                if rule not in applied_rules:
                    applied_rules.append(rule)
        return masked_items, applied_rules

    if isinstance(value, dict):
        masked_map = {}
        for key, item in value.items():
            masked, local_rules = redact_data(item, rules)
            masked_map[key] = masked
            for rule in local_rules:
                if rule not in applied_rules:
                    applied_rules.append(rule)
        return masked_map, applied_rules

    return value, applied_rules


def append_event(
    workspace: str | Path,
    *,
    event_type: str,
    actor: dict[str, str] | None = None,
    scope: dict[str, Any] | None = None,
    severity: str = "info",
    payload: dict[str, Any] | None = None,
    rules: list[str] | None = None,
    shard_by_date: bool = False,
) -> dict[str, Any]:
    # Validate event_type against protocol-synced allow-list (ADR-0002)
    try:
        from ensemble_allowed_events import resolve_event_type
        event_type = resolve_event_type(event_type)
    except ImportError:
        pass  # Graceful fallback if sync not yet run
    ts = utc_now()
    payload = payload or {}
    redacted_payload, applied_rules = redact_data(deepcopy(payload), rules)
    shard_date = ts.strftime("%Y-%m-%d") if shard_by_date else None
    event_path = get_events_file(workspace, shard_date=shard_date)

    event = {
        "event_v": EVENT_SCHEMA_V,
        "event_id": generate_event_id(ts),
        "ts_utc": utc_iso(ts),
        "actor": actor or {"type": "system", "name": "CLI"},
        "scope": scope or {},
        "type": event_type,
        "severity": severity,
        "payload": redacted_payload,
        "redaction": {
            "applied": bool(applied_rules),
            "rules": applied_rules,
        },
    }

    with event_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    legacy_event_path = get_legacy_events_file(workspace, shard_date=shard_date)
    if legacy_event_path != event_path:
        with legacy_event_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    return event


def load_events(workspace: str | Path, limit: int | None = None) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    event_files: list[Path] = []
    for directory in candidate_notes_dirs(workspace, "events"):
        event_files.extend(sorted(directory.glob("events*.jsonl")))

    for event_file in event_files:
        with event_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                event_id = str(event.get("event_id") or "")
                if event_id and event_id in seen_ids:
                    continue
                if event_id:
                    seen_ids.add(event_id)
                results.append(event)

    if limit is not None:
        return results[-limit:]
    return results


def replay_event_summary(workspace: str | Path) -> dict[str, Any]:
    summary = {
        "total": 0,
        "by_type": {},
        "latest": None,
    }
    for event in load_events(workspace):
        summary["total"] += 1
        summary["by_type"][event["type"]] = summary["by_type"].get(event["type"], 0) + 1
        summary["latest"] = event
    return summary


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens append-only event log helpers")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    append_parser = subparsers.add_parser("append", help="Append a single event")
    append_parser.add_argument("--type", required=True, dest="event_type")
    append_parser.add_argument("--severity", default="info")
    append_parser.add_argument("--actor-name", default="CLI")
    append_parser.add_argument("--actor-type", default="system")
    append_parser.add_argument("--payload", default="{}")

    list_parser = subparsers.add_parser("list", help="List events")
    list_parser.add_argument("--limit", type=int, default=20)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "append":
        try:
            payload = json.loads(args.payload)
        except json.JSONDecodeError as exc:
            parser.error(f"Invalid JSON payload: {exc}")
        event = append_event(
            args.workspace,
            event_type=args.event_type,
            severity=args.severity,
            actor={"type": args.actor_type, "name": args.actor_name},
            payload=payload,
        )
        print(json.dumps(event, ensure_ascii=False, indent=2))
        return 0

    if args.command == "list":
        for event in load_events(args.workspace, limit=args.limit):
            print(json.dumps(event, ensure_ascii=False))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
