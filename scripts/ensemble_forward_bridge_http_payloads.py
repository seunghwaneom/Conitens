from __future__ import annotations

from pathlib import Path
from typing import Any

from ensemble_conversation_read_service import ConversationReadService
from ensemble_forward_bridge_query import build_room_timeline_payload, build_run_detail_payload
from ensemble_forward_public_context import sanitize_public_text
from ensemble_loop_repository import ReadOnlyLoopStateRepository


def build_run_replay_payload(workspace: str | Path, run_id: str) -> dict[str, Any]:
    detail = build_run_detail_payload(workspace, run_id)
    repository = ReadOnlyLoopStateRepository(workspace)
    conversations = ConversationReadService(workspace)
    validators = [
        {
            "id": row.get("id"),
            "iteration_id": str(row.get("iteration_id") or ""),
            "passed": bool(row.get("passed")),
            "issue_count": len(row.get("issues_json") or []),
            "has_feedback": bool(row.get("feedback_text")),
            "created_at": str(row.get("created_at") or ""),
        }
        for row in repository.list_validator_results(run_id)
    ]
    approvals = [
        {
            "request_id": str(row.get("request_id") or ""),
            "status": str(row.get("status") or "pending"),
            "action_type": str(row.get("action_type") or ""),
            "risk_level": str(row.get("risk_level") or ""),
            "created_at": str(row.get("created_at") or ""),
            "updated_at": str(row.get("updated_at") or ""),
        }
        for row in repository.list_approval_requests(run_id=run_id)
    ]
    insights = [
        {
            "id": row.get("id"),
            "kind": "insight",
            "created_at": str(row.get("created_at") or ""),
        }
        for row in conversations.insights(run_id=run_id)
    ]
    handoffs = [
        {
            "handoff_id": str(row.get("handoff_id") or ""),
            "status": str(row.get("status") or ""),
            "updated_at": str(row.get("updated_at") or ""),
        }
        for row in conversations.handoffs(run_id=run_id)
    ]
    timeline: list[dict[str, Any]] = []
    for room in conversations.rooms(run_id=run_id):
        room_id = str(room.get("room_id") or "")
        room_name = sanitize_public_text(room.get("name"), fallback=f"Room {room_id}")
        timeline.append(
            {
                "kind": "room",
                "timestamp": str(room.get("created_at") or ""),
                "summary": room_name,
                "payload": {"room_id": room_id, "name": room_name, "status": str(room.get("status") or "")},
            }
        )
    timeline.extend(
        {
            "kind": "message",
            "timestamp": str(row.get("created_at") or ""),
            "summary": "Room message recorded",
            "payload": {"id": row.get("id"), "content_exposed": False},
        }
        for row in conversations.messages(run_id=run_id)
    )
    timeline.extend(
        {
            "kind": "validator",
            "timestamp": row["created_at"],
            "summary": "Validation passed" if row["passed"] else "Validation requires attention",
            "payload": {
                "id": row["id"],
                "iteration_id": row["iteration_id"],
                "passed": row["passed"],
                "issue_count": row["issue_count"],
            },
        }
        for row in validators
    )
    timeline.sort(key=lambda row: (str(row.get("timestamp") or ""), str(row.get("kind") or "")))
    return {
        "run": detail["run"],
        "timeline": timeline,
        "validator_history": validators,
        "approvals": approvals,
        "insights": insights,
        "handoff_packets": handoffs,
    }


def agent_summaries(agents: list[dict[str, Any]]) -> dict[str, Any]:
    summaries = [
        {
            "id": item.get("id", ""),
            "role": sanitize_public_text(item.get("role"), fallback=""),
            "status": item.get("status", "active"),
            "public_persona": sanitize_public_text(item.get("public_persona"), fallback=""),
            "skills_count": len(item.get("skills", [])),
        }
        for item in agents
    ]
    return {"agents": summaries, "total": len(summaries)}


def agent_detail_payload(agent_id: str, detail: dict[str, Any]) -> dict[str, Any]:
    raw_skills = detail.get("skills", [])
    skills = raw_skills.split(",") if isinstance(raw_skills, str) else raw_skills
    safe_skills = [
        sanitize_public_text(item, fallback="")
        for item in skills
        if sanitize_public_text(item, fallback="")
    ]
    return {
        "agent": {
            "id": detail.get("id", detail.get("agent_id", agent_id)),
            "role": sanitize_public_text(detail.get("role"), fallback=""),
            "status": detail.get("status", "active"),
            "public_persona": sanitize_public_text(
                detail.get("public_persona", detail.get("summary", "")),
                fallback="",
            ),
            "skills": safe_skills,
            "pending_patches": [
                {
                    "patch_id": str(item.get("patch_id") or ""),
                    "agent_id": str(item.get("agent_id") or agent_id),
                    "file": Path(str(item.get("file") or "")).name,
                }
                for item in detail.get("pending_patches", [])
                if isinstance(item, dict)
            ],
        }
    }


def room_timeline_payload(workspace: str | Path, room_id: str) -> dict[str, Any]:
    return build_room_timeline_payload(workspace, room_id)
