#!/usr/bin/env python3
"""
Append-only meeting recorder for Conitens.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ensemble_events import append_event, redact_data
from ensemble_paths import candidate_notes_dirs, ensure_notes_dir


MSG_SCHEMA_V = 1
DEFAULT_MEETING_ROOM_ID = "ops-control"
ACTIVE_MEETING_FILE = "_active_meeting.json"


def get_meetings_dir(workspace: str | Path) -> Path:
    return ensure_notes_dir(workspace, "meetings")


def get_legacy_meetings_dir(workspace: str | Path) -> Path:
    return candidate_notes_dirs(workspace, "meetings", include_missing=True)[-1]


def get_meeting_summaries_dir(workspace: str | Path) -> Path:
    return get_meetings_dir(workspace) / "summaries"


def get_legacy_meeting_summaries_dir(workspace: str | Path) -> Path:
    return get_legacy_meetings_dir(workspace) / "summaries"


def get_active_meeting_file(workspace: str | Path) -> Path:
    return get_meetings_dir(workspace) / ACTIVE_MEETING_FILE


def get_legacy_active_meeting_file(workspace: str | Path) -> Path:
    return get_legacy_meetings_dir(workspace) / ACTIVE_MEETING_FILE


def ensure_meeting_dirs(workspace: str | Path) -> None:
    get_meeting_summaries_dir(workspace).mkdir(parents=True, exist_ok=True)
    get_legacy_meeting_summaries_dir(workspace).mkdir(parents=True, exist_ok=True)


def utc_iso(ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_message_id(meeting_id: str) -> str:
    return f"msg:{meeting_id}:{uuid.uuid4().hex[:12]}"


def _content_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _transcript_ref(meeting_id: str) -> str:
    return f"meetings/{meeting_id}.jsonl"


def _merge_rules(*rule_groups: list[str]) -> list[str]:
    merged: list[str] = []
    for rules in rule_groups:
        for rule in rules:
            if rule not in merged:
                merged.append(rule)
    return merged


def generate_meeting_id(workspace: str | Path) -> str:
    ensure_meeting_dirs(workspace)
    today = datetime.now().strftime("%Y%m%d")
    existing_ids: set[str] = set()
    for directory in candidate_notes_dirs(workspace, "meetings"):
        for path in sorted(directory.glob(f"MTG-{today}-*.jsonl")):
            existing_ids.add(path.stem)
    return f"MTG-{today}-{len(existing_ids) + 1:03d}"


def meeting_path(workspace: str | Path, meeting_id: str) -> Path:
    return get_meetings_dir(workspace) / f"{meeting_id}.jsonl"


def summary_path(workspace: str | Path, meeting_id: str) -> Path:
    return get_meeting_summaries_dir(workspace) / f"{meeting_id}.md"


def read_active_meeting(workspace: str | Path) -> dict[str, Any] | None:
    for active_file in (get_active_meeting_file(workspace), get_legacy_active_meeting_file(workspace)):
        if not active_file.exists():
            continue
        try:
            return json.loads(active_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
    return None


def write_active_meeting(workspace: str | Path, record: dict[str, Any] | None) -> None:
    active_file = get_active_meeting_file(workspace)
    legacy_file = get_legacy_active_meeting_file(workspace)
    if record is None:
        if active_file.exists():
            active_file.unlink()
        if legacy_file.exists() and legacy_file != active_file:
            legacy_file.unlink()
        return
    active_file.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    if legacy_file != active_file:
        legacy_file.parent.mkdir(parents=True, exist_ok=True)
        legacy_file.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")


def append_meeting_record(workspace: str | Path, meeting_id: str, record: dict[str, Any]) -> dict[str, Any]:
    ensure_meeting_dirs(workspace)
    transcript = meeting_path(workspace, meeting_id)
    with transcript.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    legacy_transcript = get_legacy_meetings_dir(workspace) / f"{meeting_id}.jsonl"
    if legacy_transcript != transcript:
        with legacy_transcript.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def load_transcript(workspace: str | Path, meeting_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for directory in candidate_notes_dirs(workspace, "meetings"):
        transcript_file = directory / f"{meeting_id}.jsonl"
        if not transcript_file.exists():
            continue
        with transcript_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        if rows:
            break
    return rows


def _require_meeting_transcript(workspace: str | Path, meeting_id: str) -> list[dict[str, Any]]:
    transcript = load_transcript(workspace, meeting_id)
    if not transcript:
        raise FileNotFoundError(f"Meeting not found: {meeting_id}")
    return transcript


def extract_meeting_metadata(transcript: list[dict[str, Any]]) -> dict[str, Any]:
    metadata = {
        "meeting_id": None,
        "topic": None,
        "started_at": None,
        "ended_at": None,
        "messages": len(transcript),
        "status": "unknown",
        "last_message_at": None,
        "sender_counts": {},
    }
    if not transcript:
        return metadata

    metadata["meeting_id"] = transcript[0].get("meeting_id")
    for row in transcript:
        content = row.get("content", {})
        text = content.get("text", "")
        metadata["last_message_at"] = row.get("ts_utc")
        if row.get("sender") == "SYSTEM" and text.startswith("Meeting started: "):
            metadata["topic"] = text.replace("Meeting started: ", "", 1)
            metadata["started_at"] = row.get("ts_utc")
            metadata["status"] = "active"
        if row.get("sender") == "SYSTEM" and text.startswith("Meeting ended"):
            metadata["ended_at"] = row.get("ts_utc")
            metadata["status"] = "ended"
        if row.get("sender") and row.get("sender") != "SYSTEM":
            sender = row["sender"]
            metadata["sender_counts"][sender] = metadata["sender_counts"].get(sender, 0) + 1
    return metadata


def start_meeting(
    workspace: str | Path,
    *,
    topic: str,
    actor: str = "CLI",
    task_id: str | None = None,
    room_id: str = DEFAULT_MEETING_ROOM_ID,
) -> dict[str, Any]:
    meeting_id = generate_meeting_id(workspace)
    masked_topic, rules = redact_data(topic)
    start_text = f"Meeting started: {masked_topic}"
    message_id = _next_message_id(meeting_id)
    event = append_event(
        workspace,
        event_type="meeting.started",
        actor={"type": "agent", "name": actor},
        scope={"meeting_id": meeting_id, "task_id": task_id},
        payload={
            "meeting_id": meeting_id,
            "room_id": room_id,
            "initiated_by": actor,
            "participant_ids": [actor],
            "title": masked_topic,
            "topic": masked_topic,
            "message_id": message_id,
            "content_sha256": _content_sha256(start_text),
            "transcript_ref": _transcript_ref(meeting_id),
        },
    )
    event_payload = event.get("payload", {})
    event_redaction = event.get("redaction", {})
    event_rules = event_redaction.get("rules", []) if isinstance(event_redaction, dict) else []
    record = {
        "msg_v": MSG_SCHEMA_V,
        "ts_utc": event.get("ts_utc") or utc_iso(),
        "meeting_id": meeting_id,
        "message_id": event_payload.get("message_id", message_id),
        "content_sha256": event_payload.get("content_sha256", _content_sha256(start_text)),
        "event_id": event.get("event_id"),
        "sender": "SYSTEM",
        "channel": "cli",
        "content": {"type": "decision", "text": start_text},
        "refs": {"task_id": task_id, "files": []},
        "redaction": {"applied": bool(rules or event_rules), "rules": _merge_rules(rules, event_rules)},
    }
    append_meeting_record(workspace, meeting_id, record)
    write_active_meeting(
        workspace,
        {
            "meeting_id": meeting_id,
            "topic": event_payload.get("topic", masked_topic),
            "started_at": record["ts_utc"],
            "opened_by": actor,
            "task_id": task_id,
            "room_id": event_payload.get("room_id", room_id),
        },
    )
    return {"meeting_id": meeting_id, "topic": event_payload.get("topic", masked_topic), "record": record}


def say(
    workspace: str | Path,
    *,
    sender: str,
    text: str,
    meeting_id: str | None = None,
    channel: str = "cli",
    content_type: str = "text",
    task_id: str | None = None,
    files: list[str] | None = None,
) -> dict[str, Any]:
    active = read_active_meeting(workspace)
    meeting_id = meeting_id or (active or {}).get("meeting_id")
    if not meeting_id:
        raise ValueError("No active meeting. Start a meeting or specify --meeting.")
    _require_meeting_transcript(workspace, meeting_id)

    masked_text, rules = redact_data(text)
    masked_files, file_rules = redact_data(files or [])
    room_id = str((active or {}).get("room_id") or DEFAULT_MEETING_ROOM_ID)
    message_id = _next_message_id(meeting_id)
    content_sha256 = _content_sha256(masked_text)
    event = append_event(
        workspace,
        event_type="meeting.deliberation",
        actor={"type": "agent", "name": sender},
        scope={"meeting_id": meeting_id, "task_id": task_id or (active or {}).get("task_id")},
        payload={
            "meeting_id": meeting_id,
            "room_id": room_id,
            "initiated_by": sender,
            "channel": channel,
            "content_type": content_type,
            "message_id": message_id,
            "content_sha256": content_sha256,
            "transcript_ref": _transcript_ref(meeting_id),
            "refs": {"task_id": task_id or (active or {}).get("task_id"), "files": masked_files},
        },
    )
    event_payload = event.get("payload", {})
    event_redaction = event.get("redaction", {})
    event_rules = event_redaction.get("rules", []) if isinstance(event_redaction, dict) else []
    record = {
        "msg_v": MSG_SCHEMA_V,
        "ts_utc": event.get("ts_utc") or utc_iso(),
        "meeting_id": meeting_id,
        "message_id": event_payload.get("message_id", message_id),
        "content_sha256": event_payload.get("content_sha256", content_sha256),
        "event_id": event.get("event_id"),
        "sender": sender,
        "channel": channel,
        "content": {"type": content_type, "text": masked_text},
        "refs": event_payload.get("refs", {"task_id": task_id or (active or {}).get("task_id"), "files": masked_files}),
        "redaction": {
            "applied": bool(rules or file_rules or event_rules),
            "rules": _merge_rules(rules, file_rules, event_rules),
        },
    }
    append_meeting_record(workspace, meeting_id, record)
    return record


def _derive_summary_lines(transcript: list[dict[str, Any]], summary_mode: str) -> list[str]:
    decisions: list[str] = []
    actions: list[str] = []
    timeline: list[str] = []
    for row in transcript:
        sender = row.get("sender", "UNKNOWN")
        content = row.get("content", {})
        text = content.get("text", "")
        content_type = content.get("type", "text")
        if sender != "SYSTEM":
            timeline.append(f"- {sender}: {text}")
        upper = text.upper()
        if content_type == "decision" or upper.startswith("DECISION:"):
            decisions.append(f"- {text.removeprefix('DECISION:').strip() or text}")
        if content_type == "action_item" or upper.startswith("ACTION:"):
            actions.append(f"- {text.removeprefix('ACTION:').strip() or text}")

    if summary_mode == "decisions":
        return decisions or ["- No explicit decisions captured."]
    if summary_mode == "action_items":
        return actions or ["- No action items captured."]
    return timeline[-10:] or ["- No transcript messages captured."]


def end_meeting(
    workspace: str | Path,
    *,
    meeting_id: str | None = None,
    actor: str = "CLI",
    summary_mode: str = "decisions",
) -> dict[str, Any]:
    active = read_active_meeting(workspace)
    meeting_id = meeting_id or (active or {}).get("meeting_id")
    if not meeting_id:
        raise ValueError("No active meeting. Start a meeting or specify --meeting.")

    metadata = extract_meeting_metadata(_require_meeting_transcript(workspace, meeting_id))
    room_id = str((active or {}).get("room_id") or DEFAULT_MEETING_ROOM_ID)
    end_text = f"Meeting ended ({summary_mode})"
    message_id = _next_message_id(meeting_id)
    content_sha256 = _content_sha256(end_text)
    event = append_event(
        workspace,
        event_type="meeting.ended",
        actor={"type": "agent", "name": actor},
        scope={"meeting_id": meeting_id, "task_id": (active or {}).get("task_id")},
        payload={
            "meeting_id": meeting_id,
            "room_id": room_id,
            "ended_by": actor,
            "summary_mode": summary_mode,
            "summary_file": f"meetings/summaries/{meeting_id}.md",
            "message_id": message_id,
            "content_sha256": content_sha256,
            "transcript_ref": _transcript_ref(meeting_id),
        },
    )
    event_payload = event.get("payload", {})
    event_redaction = event.get("redaction", {})
    event_rules = event_redaction.get("rules", []) if isinstance(event_redaction, dict) else []
    record = {
        "msg_v": MSG_SCHEMA_V,
        "ts_utc": event.get("ts_utc") or utc_iso(),
        "meeting_id": meeting_id,
        "message_id": event_payload.get("message_id", message_id),
        "content_sha256": event_payload.get("content_sha256", content_sha256),
        "event_id": event.get("event_id"),
        "sender": "SYSTEM",
        "channel": "cli",
        "content": {"type": "decision", "text": end_text},
        "refs": {"task_id": (active or {}).get("task_id"), "files": []},
        "redaction": {"applied": bool(event_rules), "rules": event_rules},
    }
    append_meeting_record(workspace, meeting_id, record)
    transcript = load_transcript(workspace, meeting_id)
    summary = "\n".join(
        [
            f"# {meeting_id}",
            "",
            f"- Topic: {metadata.get('topic') or (active or {}).get('topic') or 'Untitled meeting'}",
            f"- Summary Mode: {summary_mode}",
            f"- Messages: {len(transcript)}",
            "",
            "## Summary",
            *_derive_summary_lines(transcript, summary_mode),
            "",
            "## Replay Note",
            "This file is derived from the append-only transcript and may be regenerated.",
        ]
    )
    summary_file = summary_path(workspace, meeting_id)
    summary_file.write_text(summary, encoding="utf-8")
    legacy_summary_file = get_legacy_meeting_summaries_dir(workspace) / f"{meeting_id}.md"
    if legacy_summary_file != summary_file:
        legacy_summary_file.write_text(summary, encoding="utf-8")
    if active and active.get("meeting_id") == meeting_id:
        write_active_meeting(workspace, None)

    return {"meeting_id": meeting_id, "summary_file": str(summary_file)}


def list_meetings(workspace: str | Path) -> list[dict[str, Any]]:
    ensure_meeting_dirs(workspace)
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for directory in candidate_notes_dirs(workspace, "meetings"):
        for transcript_file in sorted(directory.glob("MTG-*.jsonl")):
            meeting_id = transcript_file.stem
            if meeting_id in seen_ids:
                continue
            seen_ids.add(meeting_id)
            transcript = load_transcript(workspace, meeting_id)
            metadata = extract_meeting_metadata(transcript)
            metadata["summary_exists"] = summary_path(workspace, meeting_id).exists() or (
                get_legacy_meeting_summaries_dir(workspace) / f"{meeting_id}.md"
            ).exists()
            rows.append(metadata)
    rows.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return rows


def show_meeting(workspace: str | Path, meeting_id: str) -> dict[str, Any]:
    transcript = load_transcript(workspace, meeting_id)
    metadata = extract_meeting_metadata(transcript)
    summary_file = summary_path(workspace, meeting_id)
    if summary_file.exists():
        summary = summary_file.read_text(encoding="utf-8")
    else:
        legacy_summary_file = get_legacy_meeting_summaries_dir(workspace) / f"{meeting_id}.md"
        summary = legacy_summary_file.read_text(encoding="utf-8") if legacy_summary_file.exists() else None
    return {"metadata": metadata, "transcript": transcript, "summary": summary}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens meeting recorder")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    start_parser = subparsers.add_parser("start")
    start_parser.add_argument("--topic", required=True)
    start_parser.add_argument("--actor", default="CLI")
    start_parser.add_argument("--task")
    start_parser.add_argument("--room", default=DEFAULT_MEETING_ROOM_ID)

    say_parser = subparsers.add_parser("say")
    say_parser.add_argument("--meeting")
    say_parser.add_argument("--sender", required=True)
    say_parser.add_argument("--text", required=True)
    say_parser.add_argument("--channel", default="cli")
    say_parser.add_argument("--kind", default="text", choices=["text", "markdown", "code", "decision", "action_item"])
    say_parser.add_argument("--task")
    say_parser.add_argument("--files", default="")

    end_parser = subparsers.add_parser("end")
    end_parser.add_argument("--meeting")
    end_parser.add_argument("--actor", default="CLI")
    end_parser.add_argument("--summary-mode", default="decisions", choices=["decisions", "action_items", "timeline"])

    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("--meeting", required=True)

    subparsers.add_parser("list")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "start":
        print(
            json.dumps(
                start_meeting(
                    args.workspace,
                    topic=args.topic,
                    actor=args.actor,
                    task_id=args.task,
                    room_id=args.room,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.command == "say":
        print(
            json.dumps(
                say(
                    args.workspace,
                    meeting_id=args.meeting,
                    sender=args.sender,
                    text=args.text,
                    channel=args.channel,
                    content_type=args.kind,
                    task_id=args.task,
                    files=[item.strip() for item in args.files.split(",") if item.strip()],
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.command == "end":
        print(
            json.dumps(
                end_meeting(args.workspace, meeting_id=args.meeting, actor=args.actor, summary_mode=args.summary_mode),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.command == "show":
        print(json.dumps(show_meeting(args.workspace, args.meeting), ensure_ascii=False, indent=2))
        return 0
    if args.command == "list":
        print(json.dumps(list_meetings(args.workspace), ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
