#!/usr/bin/env python3
"""
Telegram bridge skeleton for Conitens ChatOps.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from ensemble_events import append_event
from ensemble_meeting import load_transcript


ENV_ENABLED = "CONITENS_TELEGRAM_ENABLED"
ENV_TOKEN = "CONITENS_TELEGRAM_BOT_TOKEN"
ENV_CHAT = "CONITENS_TELEGRAM_CHAT_ID"


def is_enabled() -> bool:
    return os.environ.get(ENV_ENABLED, "").lower() in {"1", "true", "yes"}


def config_status() -> dict[str, Any]:
    return {
        "enabled": is_enabled(),
        "has_token": bool(os.environ.get(ENV_TOKEN)),
        "has_chat_id": bool(os.environ.get(ENV_CHAT)),
    }


def send_message(text: str) -> dict[str, Any]:
    if not is_enabled():
        return {"status": "disabled", "message": "Telegram bridge is OFF by default."}

    token = os.environ.get(ENV_TOKEN)
    chat_id = os.environ.get(ENV_CHAT)
    if not token or not chat_id:
        return {"status": "misconfigured", "message": "Missing bot token or chat id."}

    payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def notify(workspace: str | Path, text: str, *, actor: str = "CLI") -> dict[str, Any]:
    result = send_message(text)
    append_event(
        workspace,
        event_type="TELEGRAM_NOTIFY",
        actor={"type": "agent", "name": actor},
        payload={"status": result.get("status", "sent"), "text": text},
    )
    return result


def approval_request(workspace: str | Path, text: str, *, actor: str = "CLI") -> dict[str, Any]:
    result = send_message(f"[Approval Request]\n{text}")
    append_event(
        workspace,
        event_type="TELEGRAM_APPROVAL_REQUEST",
        actor={"type": "agent", "name": actor},
        payload={"status": result.get("status", "sent"), "text": text},
    )
    return result


def mirror_meeting(workspace: str | Path, meeting_id: str, *, actor: str = "CLI") -> dict[str, Any]:
    transcript = load_transcript(workspace, meeting_id)
    lines = [f"{row.get('sender')}: {row.get('content', {}).get('text', '')}" for row in transcript[-10:]]
    result = send_message(f"[Meeting {meeting_id}]\n" + "\n".join(lines))
    append_event(
        workspace,
        event_type="TELEGRAM_MEETING_MIRROR",
        actor={"type": "agent", "name": actor},
        payload={"meeting_id": meeting_id, "status": result.get("status", "sent")},
    )
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conitens Telegram bridge skeleton")
    parser.add_argument("--workspace", default=os.getcwd())
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("status")

    notify_parser = subparsers.add_parser("notify")
    notify_parser.add_argument("--text", required=True)
    notify_parser.add_argument("--actor", default="CLI")

    approval_parser = subparsers.add_parser("approval-request")
    approval_parser.add_argument("--text", required=True)
    approval_parser.add_argument("--actor", default="CLI")

    mirror_parser = subparsers.add_parser("mirror-meeting")
    mirror_parser.add_argument("--meeting", required=True)
    mirror_parser.add_argument("--actor", default="CLI")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "status":
        print(json.dumps(config_status(), ensure_ascii=False, indent=2))
        return 0
    if args.command == "notify":
        print(json.dumps(notify(args.workspace, args.text, actor=args.actor), ensure_ascii=False, indent=2))
        return 0
    if args.command == "approval-request":
        print(json.dumps(approval_request(args.workspace, args.text, actor=args.actor), ensure_ascii=False, indent=2))
        return 0
    if args.command == "mirror-meeting":
        print(json.dumps(mirror_meeting(args.workspace, args.meeting, actor=args.actor), ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
