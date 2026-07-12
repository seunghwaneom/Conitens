#!/usr/bin/env python3
from __future__ import annotations

import getpass
from typing import Any

from ensemble_forward_public_context import sanitize_public_text


def public_actor_label(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    local_username = getpass.getuser().strip().casefold()
    if text.casefold().startswith("local/") or text.casefold() == local_username:
        return "local-operator"
    public_label = sanitize_public_text(text, fallback="")
    return public_label or None


def public_approval_record(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "request_id": str(row.get("request_id") or ""),
        "run_id": str(row.get("run_id") or ""),
        "iteration_id": str(row.get("iteration_id") or ""),
        "task_id": row.get("task_id"),
        "actor": public_actor_label(row.get("actor")) or "agent",
        "action_type": str(row.get("action_type") or ""),
        "action_payload": {},
        "risk_level": str(row.get("risk_level") or ""),
        "status": str(row.get("status") or "pending"),
        "reviewer": public_actor_label(row.get("reviewer")),
        "reviewer_note": None,
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def public_handoff_record(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "handoff_id": str(row.get("handoff_id") or ""),
        "run_id": row.get("run_id"),
        "iteration_id": row.get("iteration_id"),
        "from_actor": public_actor_label(row.get("from_actor")) or "agent",
        "to_actor": public_actor_label(row.get("to_actor")) or "agent",
        "status": str(row.get("status") or ""),
        "summary": sanitize_public_text(row.get("summary"), fallback="handoff blocked"),
        "packet_json": {},
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


__all__ = ["public_actor_label", "public_approval_record", "public_handoff_record"]
