#!/usr/bin/env python3
"""
Batch 7 context assembler for minimal execution packets.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from ensemble_context_markdown import TaskPlanWriterReader
from ensemble_handoff import list_handoffs
from ensemble_persona_memory import MemoryRetriever, PersonaLoader, MemoryRepository
from ensemble_loop_paths import latest_context_path, packet_snapshots_root
from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService
from ensemble_skill_loader import resolve_persona_default_skills


DEFAULT_TOKEN_BUDGET = 4000
DEFAULT_EPISODIC_TOP_K = 3
MAX_EPISODIC_TOP_K = 3
DEFAULT_MESSAGE_LIMIT = 3
MAX_MESSAGE_LIMIT = 3
DEFAULT_MESSAGE_CHAR_LIMIT = 80
ROOM_SUMMARY_LIMIT = 2
ROOM_SUMMARY_MESSAGES = 2
ROOM_SUMMARY_CHAR_LIMIT = DEFAULT_MESSAGE_CHAR_LIMIT
RELEVANT_FINDING_CATEGORIES = (
    "constraint",
    "failed_hypothesis",
    "validation_issue",
    "dependency_note",
    "discovery",
)
ALLOWED_PACKET_MEMORY_KINDS = ("episodic", "reflection")
EXCLUDED_PACKET_MEMORY_KINDS = ("identity", "procedural")
PACKET_FIELD_SOURCES = {
    "persona_core": "persona shell public fields only",
    "objective": "current persisted task plan objective, else run user_request",
    "current_step": "first non-terminal step from persisted task plan",
    "relevant_findings": "bounded persisted findings filtered by execution relevance",
    "latest_runtime_digest": ".conitens/context/LATEST_CONTEXT.md",
    "latest_repo_digest": ".vibe/context/LATEST_CONTEXT.md",
    "episodic_memory_top_k": "approved namespaced episodic/reflection memory only",
    "recent_message_slice": "latest handoff summary, else bounded room episode summaries",
    "tool_whitelist": "persona default-skill metadata tools only",
    "token_budget": "requested packet budget",
    "done_when": "persisted task plan acceptance criteria",
    "validator_failure_reason": "latest failed validator feedback, bounded to one reason",
}


@dataclass
class TaskContextPacket:
    agent_id: str
    persona_core: dict[str, Any]
    objective: str
    current_step: str | None
    relevant_findings: list[dict[str, Any]]
    latest_runtime_digest: str
    latest_repo_digest: str
    episodic_memory_top_k: list[dict[str, Any]]
    recent_message_slice: list[dict[str, Any]]
    tool_whitelist: list[str]
    token_budget: int
    done_when: list[str]
    validator_failure_reason: str | None = None


class ContextAssembler:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.personas = PersonaLoader(self.workspace)
        self.memory_repository = MemoryRepository(self.workspace)
        self.memory_retriever = MemoryRetriever(self.memory_repository)
        self.task_plan_reader = TaskPlanWriterReader(self.repository)
        self.rooms = RoomService(self.workspace)

    def assemble(
        self,
        *,
        agent_id: str,
        run_id: str | None = None,
        token_budget: int = DEFAULT_TOKEN_BUDGET,
        episodic_top_k: int = DEFAULT_EPISODIC_TOP_K,
        message_limit: int = DEFAULT_MESSAGE_LIMIT,
    ) -> dict[str, Any]:
        bounded_memory_top_k = max(0, min(int(episodic_top_k), MAX_EPISODIC_TOP_K))
        bounded_message_limit = max(0, min(int(message_limit), MAX_MESSAGE_LIMIT))
        persona = self.personas.load(agent_id)
        target_run_id = run_id or self._resolve_run_id()
        if target_run_id is None:
            raise ValueError("No run available for packet assembly")
        snapshot = self.repository.load_run_snapshot(target_run_id)
        task_plan_document = self.task_plan_reader.read(target_run_id)
        plan_state = snapshot.get("task_plan") or (task_plan_document["state"] if task_plan_document else None)
        objective = plan_state["objective"] if plan_state else snapshot["run"]["user_request"]
        current_step = self._current_step(plan_state)
        done_when = list(plan_state.get("acceptance_json", [])) if plan_state else []
        relevant_findings = self._relevant_findings(snapshot.get("findings", []), limit=6)
        validator_failure_reason = self._validator_failure_reason(snapshot)
        persona_core = self._persona_core(persona)
        tool_whitelist = self._tool_whitelist(agent_id)
        memory_rows = self._episodic_memory(persona["memory_namespace"], agent_id=agent_id, top_k=bounded_memory_top_k)
        recent_messages = self._recent_message_slice(target_run_id, limit=bounded_message_limit)
        packet = TaskContextPacket(
            agent_id=agent_id,
            persona_core=persona_core,
            objective=objective,
            current_step=current_step,
            relevant_findings=relevant_findings,
            latest_runtime_digest=self._read_digest(latest_context_path(self.workspace)),
            latest_repo_digest=self._read_repo_digest(),
            episodic_memory_top_k=memory_rows,
            recent_message_slice=recent_messages,
            tool_whitelist=tool_whitelist,
            token_budget=token_budget,
            done_when=done_when,
            validator_failure_reason=validator_failure_reason,
        )
        packet_dict = asdict(packet)
        metrics = self._packet_metrics(packet_dict, token_budget=token_budget)
        return {"packet": packet_dict, "metrics": metrics}

    def write_packet_snapshot(
        self,
        *,
        agent_id: str,
        run_id: str | None = None,
        token_budget: int = DEFAULT_TOKEN_BUDGET,
    ) -> Path:
        assembled = self.assemble(agent_id=agent_id, run_id=run_id, token_budget=token_budget)
        target_run = run_id or self._resolve_run_id() or "no-run"
        target_iteration = assembled["packet"].get("current_step") or "no-step"
        safe_step = str(target_iteration).replace(" ", "-").replace("/", "-")
        path = packet_snapshots_root(self.workspace) / f"{agent_id}-{target_run}-{safe_step}.json"
        path.write_text(json.dumps(assembled, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    def _resolve_run_id(self) -> str | None:
        active = self.repository.get_latest_active_run()
        if active:
            return active["run_id"]
        recent = self.repository.get_most_recent_run()
        return recent["run_id"] if recent else None

    def _persona_core(self, persona: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": persona["id"],
            "display_name": persona["display_name"],
            "role": persona["role"],
            "public_persona": persona["public_persona"],
            "expertise_tags": list(persona.get("expertise_tags", [])),
            "default_skill_refs": list(persona.get("default_skill_refs", [])),
            "handoff": persona.get("handoff", {}),
        }

    def _tool_whitelist(self, agent_id: str) -> list[str]:
        try:
            skills = resolve_persona_default_skills(self.workspace, agent_id)
        except Exception:
            return []
        tool_ids: list[str] = []
        for skill in skills:
            for tool in skill.get("tools", []) or []:
                tool_id = tool.get("id")
                if tool_id and tool_id not in tool_ids:
                    tool_ids.append(tool_id)
        return tool_ids

    def _episodic_memory(self, namespace: str, *, agent_id: str, top_k: int) -> list[dict[str, Any]]:
        rows = self.memory_retriever.retrieve(
            agent_id=agent_id,
            namespace=namespace,
            include_identity=False,
            include_unapproved=False,
        )
        filtered = [row for row in rows if row["kind"] in ALLOWED_PACKET_MEMORY_KINDS]
        return [
            {
                "record_id": row["record_id"],
                "kind": row["kind"],
                "summary": row["summary"],
                "evidence_refs_json": row["evidence_refs_json"],
                "salience": row["salience"],
                "confidence": row["confidence"],
            }
            for row in filtered[:top_k]
        ]

    def _validator_failure_reason(self, snapshot: dict[str, Any]) -> str | None:
        results = snapshot.get("validator_results", [])
        if not results:
            return None
        failed = [row for row in results if not row["passed"]]
        if not failed:
            return None
        latest = failed[-1]
        return latest.get("feedback_text") or None

    def _current_step(self, plan_state: dict[str, Any] | None) -> str | None:
        if not plan_state:
            return None
        for step in plan_state.get("steps_json", []):
            status = str(step.get("status", "pending")).lower()
            if status not in {"completed", "done", "cancelled", "skipped"}:
                return step.get("title")
        return None

    def _relevant_findings(self, findings: list[dict[str, Any]], *, limit: int) -> list[dict[str, Any]]:
        return [
            {
                "category": item["category"],
                "summary": item["summary"],
                "details": item.get("details"),
                "iteration_id": item.get("iteration_id"),
                "created_at": item["created_at"],
            }
            for item in findings
            if item["category"] in RELEVANT_FINDING_CATEGORIES
        ][-limit:]

    def _recent_message_slice(self, run_id: str, *, limit: int) -> list[dict[str, Any]]:
        handoffs = [
            row
            for row in list_handoffs(self.workspace, limit=10)
            if row.get("run_id") == run_id or row.get("task_id") == run_id
        ]
        if handoffs:
            latest = handoffs[0]
            return [
                {
                    "kind": "handoff_summary",
                    "from": latest.get("from"),
                    "to": latest.get("to"),
                    "summary": latest.get("summary"),
                    "updated_at": latest.get("updated_at"),
                }
            ]
        return self.rooms.bounded_context_for_run(
            run_id,
            room_limit=max(1, min(limit or 1, ROOM_SUMMARY_LIMIT)),
            per_room_messages=ROOM_SUMMARY_MESSAGES,
            message_char_limit=ROOM_SUMMARY_CHAR_LIMIT,
        )

    def _read_digest(self, path: Path) -> str:
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8").strip()

    def _read_repo_digest(self) -> str:
        repo_digest = self.workspace / ".vibe" / "context" / "LATEST_CONTEXT.md"
        return self._read_digest(repo_digest)

    def _packet_metrics(self, packet: dict[str, Any], *, token_budget: int) -> dict[str, Any]:
        text = json.dumps(packet, ensure_ascii=False, sort_keys=True)
        chars = len(text)
        approx_tokens = math.ceil(chars / 4)
        return {
            "characters": chars,
            "approx_tokens": approx_tokens,
            "token_budget": token_budget,
            "within_budget": approx_tokens <= token_budget,
            "section_sizes": {
                key: len(json.dumps(value, ensure_ascii=False))
                for key, value in packet.items()
            },
            "field_sources": dict(PACKET_FIELD_SOURCES),
            "exclusion_rules": {
                "room_transcript_default": "deny",
                "unapproved_patches": "deny",
                "identity_memory": "deny",
                "procedural_memory": "deny",
                "recent_messages_source_order": ["handoff_summary", "room_episode_summary"],
            },
            "source_counts": {
                "relevant_findings": len(packet["relevant_findings"]),
                "episodic_memory_top_k": len(packet["episodic_memory_top_k"]),
                "recent_message_slice": len(packet["recent_message_slice"]),
            },
        }


__all__ = [
    "ALLOWED_PACKET_MEMORY_KINDS",
    "ContextAssembler",
    "DEFAULT_TOKEN_BUDGET",
    "EXCLUDED_PACKET_MEMORY_KINDS",
    "PACKET_FIELD_SOURCES",
    "RELEVANT_FINDING_CATEGORIES",
    "TaskContextPacket",
]
