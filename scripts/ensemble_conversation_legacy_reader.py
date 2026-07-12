#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ensemble_room import validate_room_id

MAX_LEGACY_MESSAGES = 50
MAX_LEGACY_LINE_CHARS = 240
THREAD_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")


@dataclass(frozen=True, slots=True)
class LegacyConversationReadError(Exception):
    room_id: str
    reason: str

    def __str__(self) -> str:
        return f"legacy conversation read failed for {self.room_id}: {self.reason}"


class ThreadIdentifierError(ValueError):
    pass


class LegacyConversationReader:
    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace

    def room_snapshot(self, room_id: str) -> dict[str, Any]:
        safe_room_id = validate_room_id(room_id)
        meta_path = self.workspace / ".notes" / "rooms" / f"{safe_room_id}.json"
        log_path = self.workspace / ".notes" / "rooms" / f"{safe_room_id}.jsonl"
        try:
            room = json.loads(meta_path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise LegacyConversationReadError(safe_room_id, "room metadata missing") from exc
        except json.JSONDecodeError:
            return {
                "source": "legacy_compatibility",
                "degraded": True,
                "room": {"room_id": safe_room_id},
                "messages": [],
                "tool_events": [],
                "insights": [],
                "timeline": [],
            }
        if not isinstance(room, dict):
            raise LegacyConversationReadError(safe_room_id, "room metadata is not an object")
        messages = self._room_messages(log_path)
        return {
            "source": "legacy_compatibility",
            "room": room,
            "messages": messages,
            "tool_events": [],
            "insights": [],
            "timeline": [{"kind": "message", "created_at": item.get("ts_utc")} for item in messages],
        }

    def thread_show(self, thread_id: str) -> dict[str, Any] | None:
        safe_thread_id = validate_thread_id(thread_id)
        root = self.workspace / ".notes" / "40_Comms"
        matches = _safe_markdown_paths(root, f"{safe_thread_id}.md")
        if not matches:
            return None
        text = matches[0].read_text(encoding="utf-8")
        meta = _frontmatter(text)
        return {
            **meta,
            "id": str(meta.get("id") or safe_thread_id),
            "source": "legacy_compatibility",
            "messages": _markdown_messages(text),
        }

    def threads(self) -> dict[str, dict[str, Any]]:
        root = self.workspace / ".notes" / "40_Comms"
        threads: dict[str, dict[str, Any]] = {}
        for path in _safe_markdown_paths(root, "*.md"):
            text = path.read_text(encoding="utf-8")
            meta = _frontmatter(text)
            try:
                thread_id = validate_thread_id(str(meta.get("id") or path.stem))
            except ThreadIdentifierError:
                continue
            participants = [
                item.strip()
                for item in str(meta.get("participants") or "").strip().strip("[]").split(",")
                if item.strip()
            ]
            threads[thread_id] = {
                "id": thread_id,
                "kind": str(meta.get("kind") or ""),
                "workspace": str(meta.get("workspace") or ""),
                "status": str(meta.get("status") or "open"),
                "participants": participants,
                "created_at": str(meta.get("created_at") or ""),
                "updated_at": str(meta.get("updated_at") or ""),
                "messages": _markdown_messages(text),
            }
        return threads

    @staticmethod
    def _room_messages(path: Path) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        if not path.exists():
            return messages
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if len(messages) >= MAX_LEGACY_MESSAGES:
                    break
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    messages.append(item)
        return messages


def validate_thread_id(thread_id: str) -> str:
    value = str(thread_id or "").strip()
    if not THREAD_ID_PATTERN.fullmatch(value) or ".." in value:
        raise ThreadIdentifierError("Invalid thread_id")
    return value


def _safe_markdown_paths(root: Path, pattern: str) -> list[Path]:
    if not root.exists() or root.is_symlink():
        return []
    resolved_root = root.resolve()
    safe_paths: list[Path] = []
    for candidate in sorted(root.rglob(pattern)):
        cursor = root
        linked = False
        for part in candidate.relative_to(root).parts:
            cursor /= part
            if cursor.is_symlink():
                linked = True
                break
        if linked:
            continue
        try:
            candidate.resolve().relative_to(resolved_root)
        except ValueError:
            continue
        safe_paths.append(candidate)
    return safe_paths


def _frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    meta: dict[str, str] = {}
    for line in text[3:end].splitlines():
        key, separator, value = line.partition(":")
        if separator:
            meta[key.strip()] = value.strip()
    return meta


def _markdown_messages(text: str) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    in_messages = False
    for line in text.splitlines():
        if line.strip() == "## Messages":
            in_messages = True
            continue
        if in_messages and line.startswith("## "):
            break
        if in_messages and line.startswith("- ") and len(messages) < MAX_LEGACY_MESSAGES:
            messages.append({"raw": line[2:][:MAX_LEGACY_LINE_CHARS]})
    return messages
