#!/usr/bin/env python3
"""
Ensemble Orchestrator v5.2.0
=============================
Real-time multi-model orchestration for heterogeneous agent collaboration

Features:
- GCC-RT (Real-Time) mode for Gemini + Claude + Codex
- Role-based event routing
- Automatic conflict resolution
- Merge engine for non-conflicting changes
- Cross-model communication protocol

Usage:
    python ensemble_orchestrator.py start --mode GCC-RT
    python ensemble_orchestrator.py status
    python ensemble_orchestrator.py resolve --conflict CONFLICT-001

Modes:
    GCC-RT  : Gemini (Plan) ↔ Claude (Implement) ↔ Codex (Review) Real-time
    PAR-RT  : All agents work in parallel with sync points
    SOLO-RT : Single agent with real-time monitoring
"""

import asyncio
import json
import os
import sys
import hashlib
import difflib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Set, Optional, Any, Tuple
from enum import Enum
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

WORKSPACE = os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd())
ORCHESTRATOR_STATE_FILE = ".ensemble_orchestrator.json"

# ═══════════════════════════════════════════════════════════════════════════════
# ENUMS AND CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

class AgentRole(str, Enum):
    PLANNER = "PLANNER"       # Gemini - Architecture, design, specs
    IMPLEMENTER = "IMPLEMENTER"  # Claude - Code writing
    REVIEWER = "REVIEWER"     # Codex - Security, review, validation
    OBSERVER = "OBSERVER"     # Dashboard, monitoring


class OrchestratorMode(str, Enum):
    GCC_RT = "GCC-RT"    # Gemini → Claude → Codex Real-time
    PAR_RT = "PAR-RT"    # Parallel with sync
    SOLO_RT = "SOLO-RT"  # Single agent


class WorkflowState(str, Enum):
    IDLE = "IDLE"
    PLANNING = "PLANNING"
    IMPLEMENTING = "IMPLEMENTING"
    REVIEWING = "REVIEWING"
    MERGING = "MERGING"
    COMPLETED = "COMPLETED"
    CONFLICT = "CONFLICT"


class EventPriority(int, Enum):
    CRITICAL = 0   # Conflicts, errors
    HIGH = 1       # Review results, plan changes
    NORMAL = 2     # Code updates, progress
    LOW = 3        # Status, info


# Role to Agent Type mapping
ROLE_AGENT_MAP = {
    AgentRole.PLANNER: "GEMINI",
    AgentRole.IMPLEMENTER: "CLAUDE",
    AgentRole.REVIEWER: "CODEX",
}

AGENT_ROLE_MAP = {v: k for k, v in ROLE_AGENT_MAP.items()}


# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Plan:
    """Feature plan from Planner (Gemini)"""
    id: str
    feature: str
    approach: str
    files: List[str]
    risks: List[str] = field(default_factory=list)
    status: str = "PROPOSED"  # PROPOSED, APPROVED, REJECTED, AMENDED
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_by: List[str] = field(default_factory=list)
    amendments: List[Dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ReviewResult:
    """Code review result from Reviewer (Codex)"""
    id: str
    files: List[str]
    status: str  # APPROVED, CHANGES_REQUESTED, BLOCKED
    findings: List[Dict] = field(default_factory=list)
    comments: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    reviewer_id: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Conflict:
    """Merge conflict"""
    id: str
    file_path: str
    conflict_type: str  # CONTENT, STRUCTURE, SEMANTIC
    agent_a: str
    agent_b: str
    content_a: str
    content_b: str
    base_content: Optional[str] = None
    resolved: bool = False
    resolution: Optional[str] = None
    resolved_by: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class OrchestratorEvent:
    """Event in the orchestration system"""
    id: str
    event_type: str
    source_agent: str
    source_role: str
    target_role: Optional[str] = None  # None = broadcast
    priority: int = EventPriority.NORMAL
    data: Dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    processed: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# MERGE ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

class MergeEngine:
    """
    Automatic merge engine for non-conflicting changes

    Handles:
    - Line-by-line diff and merge
    - Conflict detection
    - Auto-resolution for simple cases
    - Manual resolution workflow
    """

    def __init__(self):
        self.conflicts: Dict[str, Conflict] = {}
        self._conflict_counter = 0

    def merge_files(
        self,
        base_content: str,
        content_a: str,
        content_b: str,
        agent_a: str,
        agent_b: str,
        file_path: str
    ) -> Tuple[Optional[str], Optional[Conflict]]:
        """
        Attempt to merge two versions of a file

        Returns:
            (merged_content, conflict) - If conflict is None, merge succeeded
        """
        # Split into lines
        base_lines = base_content.splitlines(keepends=True)
        lines_a = content_a.splitlines(keepends=True)
        lines_b = content_b.splitlines(keepends=True)

        # Get diffs
        diff_a = list(difflib.unified_diff(base_lines, lines_a, lineterm=''))
        diff_b = list(difflib.unified_diff(base_lines, lines_b, lineterm=''))

        # Check for overlapping changes
        changes_a = self._extract_changed_lines(diff_a)
        changes_b = self._extract_changed_lines(diff_b)

        overlap = changes_a & changes_b
        if overlap:
            # Conflict detected
            conflict = self._create_conflict(
                file_path, agent_a, agent_b,
                content_a, content_b, base_content
            )
            return None, conflict

        # No overlap - merge changes
        merged = self._apply_both_changes(base_lines, lines_a, lines_b, changes_a, changes_b)
        return ''.join(merged), None

    def _extract_changed_lines(self, diff: List[str]) -> Set[int]:
        """Extract line numbers that were changed"""
        changed = set()
        current_line = 0

        for line in diff:
            if line.startswith('@@'):
                # Parse line numbers
                parts = line.split()
                if len(parts) >= 2:
                    new_range = parts[2] if parts[2].startswith('+') else parts[1]
                    start = int(new_range.split(',')[0].lstrip('+'))
                    current_line = start - 1
            elif line.startswith('+') and not line.startswith('+++'):
                current_line += 1
                changed.add(current_line)
            elif line.startswith('-') and not line.startswith('---'):
                changed.add(current_line)
            elif not line.startswith('-'):
                current_line += 1

        return changed

    def _apply_both_changes(
        self,
        base: List[str],
        version_a: List[str],
        version_b: List[str],
        changes_a: Set[int],
        changes_b: Set[int]
    ) -> List[str]:
        """Apply non-overlapping changes from both versions"""
        # Simple approach: prefer version_a for its changes, version_b for its changes
        result = list(base)

        # Apply changes from A
        for i, line in enumerate(version_a):
            if (i + 1) in changes_a:
                if i < len(result):
                    result[i] = line
                else:
                    result.append(line)

        # Apply changes from B (where A didn't change)
        for i, line in enumerate(version_b):
            if (i + 1) in changes_b and (i + 1) not in changes_a:
                if i < len(result):
                    result[i] = line
                else:
                    result.append(line)

        return result

    def _create_conflict(
        self,
        file_path: str,
        agent_a: str,
        agent_b: str,
        content_a: str,
        content_b: str,
        base_content: str
    ) -> Conflict:
        """Create a new conflict record"""
        self._conflict_counter += 1
        conflict_id = f"CONFLICT-{datetime.now().strftime('%Y%m%d')}-{self._conflict_counter:03d}"

        conflict = Conflict(
            id=conflict_id,
            file_path=file_path,
            conflict_type="CONTENT",
            agent_a=agent_a,
            agent_b=agent_b,
            content_a=content_a,
            content_b=content_b,
            base_content=base_content
        )

        self.conflicts[conflict_id] = conflict
        return conflict

    def resolve_conflict(
        self,
        conflict_id: str,
        resolution: str,
        resolved_by: str
    ) -> bool:
        """Manually resolve a conflict"""
        if conflict_id not in self.conflicts:
            return False

        conflict = self.conflicts[conflict_id]
        conflict.resolved = True
        conflict.resolution = resolution
        conflict.resolved_by = resolved_by

        return True

    def auto_resolve(self, conflict: Conflict) -> Optional[str]:
        """
        Attempt automatic conflict resolution

        Strategies:
        1. If one side is empty, use the other
        2. If changes are additive (no deletions), combine both
        3. If one is a subset of the other, use the superset
        """
        # Strategy 1: One side empty
        if not conflict.content_a.strip():
            return conflict.content_b
        if not conflict.content_b.strip():
            return conflict.content_a

        # Strategy 2: One is subset
        if conflict.content_a in conflict.content_b:
            return conflict.content_b
        if conflict.content_b in conflict.content_a:
            return conflict.content_a

        # Strategy 3: Additive changes (both add without removing)
        if conflict.base_content:
            base_set = set(conflict.base_content.splitlines())
            a_set = set(conflict.content_a.splitlines())
            b_set = set(conflict.content_b.splitlines())

            # Check if both only added lines
            if base_set <= a_set and base_set <= b_set:
                combined = a_set | b_set
                return '\n'.join(sorted(combined))

        return None  # Cannot auto-resolve


# ═══════════════════════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

class Orchestrator:
    """
    Real-time Multi-Model Orchestrator

    Coordinates:
    - Gemini (Planner): Architecture, design, specifications
    - Claude (Implementer): Code writing, implementation
    - Codex (Reviewer): Security review, validation

    Modes:
    - GCC-RT: Real-time collaboration with immediate feedback
    - PAR-RT: Parallel work with sync points
    - SOLO-RT: Single agent with monitoring
    """

    def __init__(self, workspace: str = None, mode: OrchestratorMode = OrchestratorMode.GCC_RT):
        self.workspace = os.path.abspath(workspace or WORKSPACE)
        self.mode = mode
        self.state = WorkflowState.IDLE

        # Components
        self.merge_engine = MergeEngine()

        # State
        self.active_plan: Optional[Plan] = None
        self.pending_reviews: Dict[str, ReviewResult] = {}
        self.event_queue: List[OrchestratorEvent] = []
        self.processed_events: List[OrchestratorEvent] = []

        # Agent tracking
        self.connected_agents: Dict[str, Dict] = {}  # agent_id -> info
        self.agent_roles: Dict[str, AgentRole] = {}  # agent_id -> role

        # File versions for merge
        self.file_versions: Dict[str, Dict[str, str]] = {}  # file -> {agent_id: content}
        self.base_versions: Dict[str, str] = {}  # file -> base content

        # Event counter
        self._event_counter = 0

        # Load state
        self._load_state()

    # ─────────────────────────────────────────────────────────────────────────
    # State Management
    # ─────────────────────────────────────────────────────────────────────────

    def _get_state_file(self) -> Path:
        return Path(self.workspace) / ".notes" / ORCHESTRATOR_STATE_FILE

    def _load_state(self):
        """Load orchestrator state from file"""
        state_file = self._get_state_file()
        if not state_file.exists():
            return

        try:
            with open(state_file, 'r') as f:
                data = json.load(f)

            self.mode = OrchestratorMode(data.get('mode', 'GCC-RT'))
            self.state = WorkflowState(data.get('state', 'IDLE'))

            if data.get('active_plan'):
                self.active_plan = Plan(**data['active_plan'])

            for rid, rdata in data.get('pending_reviews', {}).items():
                self.pending_reviews[rid] = ReviewResult(**rdata)

            for cid, cdata in data.get('conflicts', {}).items():
                self.merge_engine.conflicts[cid] = Conflict(**cdata)

        except Exception as e:
            print(f"Warning: Failed to load orchestrator state: {e}")

    def _save_state(self):
        """Save orchestrator state to file"""
        state_file = self._get_state_file()
        state_file.parent.mkdir(parents=True, exist_ok=True)

        data = {
            'mode': self.mode.value,
            'state': self.state.value,
            'active_plan': self.active_plan.to_dict() if self.active_plan else None,
            'pending_reviews': {k: v.to_dict() for k, v in self.pending_reviews.items()},
            'conflicts': {k: v.to_dict() for k, v in self.merge_engine.conflicts.items()},
            'connected_agents': self.connected_agents,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

        with open(state_file, 'w') as f:
            json.dump(data, f, indent=2)

    # ─────────────────────────────────────────────────────────────────────────
    # Agent Management
    # ─────────────────────────────────────────────────────────────────────────

    def register_agent(self, agent_id: str, agent_type: str, role: AgentRole = None):
        """Register an agent with a role"""
        if role is None:
            role = AGENT_ROLE_MAP.get(agent_type, AgentRole.OBSERVER)

        self.connected_agents[agent_id] = {
            'agent_type': agent_type,
            'role': role.value,
            'connected_at': datetime.now(timezone.utc).isoformat()
        }
        self.agent_roles[agent_id] = role
        self._save_state()

    def unregister_agent(self, agent_id: str):
        """Unregister an agent"""
        if agent_id in self.connected_agents:
            del self.connected_agents[agent_id]
        if agent_id in self.agent_roles:
            del self.agent_roles[agent_id]
        self._save_state()

    def get_agents_by_role(self, role: AgentRole) -> List[str]:
        """Get all agents with a specific role"""
        return [
            aid for aid, r in self.agent_roles.items()
            if r == role
        ]

    # ─────────────────────────────────────────────────────────────────────────
    # Event Processing
    # ─────────────────────────────────────────────────────────────────────────

    def create_event(
        self,
        event_type: str,
        source_agent: str,
        data: Dict = None,
        target_role: AgentRole = None,
        priority: EventPriority = EventPriority.NORMAL
    ) -> OrchestratorEvent:
        """Create a new orchestration event"""
        self._event_counter += 1
        event_id = f"EVT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{self._event_counter:04d}"

        source_role = self.agent_roles.get(source_agent, AgentRole.OBSERVER)

        event = OrchestratorEvent(
            id=event_id,
            event_type=event_type,
            source_agent=source_agent,
            source_role=source_role.value,
            target_role=target_role.value if target_role else None,
            priority=priority,
            data=data or {}
        )

        self.event_queue.append(event)
        self._save_state()

        return event

    def process_event(self, event: OrchestratorEvent) -> Dict:
        """Process an orchestration event"""
        event_type = event.event_type
        result = {"processed": True, "actions": []}

        # Plan events
        if event_type == "plan:proposed":
            result = self._handle_plan_proposed(event)
        elif event_type == "plan:approved":
            result = self._handle_plan_approved(event)
        elif event_type == "plan:amendment":
            result = self._handle_plan_amendment(event)

        # Code events
        elif event_type == "code:written":
            result = self._handle_code_written(event)
        elif event_type == "code:merged":
            result = self._handle_code_merged(event)

        # Review events
        elif event_type == "review:requested":
            result = self._handle_review_requested(event)
        elif event_type == "review:completed":
            result = self._handle_review_completed(event)

        # Fix events
        elif event_type == "fix:suggested":
            result = self._handle_fix_suggested(event)
        elif event_type == "fix:applied":
            result = self._handle_fix_applied(event)

        # Conflict events
        elif event_type == "conflict:detected":
            result = self._handle_conflict_detected(event)
        elif event_type == "conflict:resolved":
            result = self._handle_conflict_resolved(event)

        event.processed = True
        self.processed_events.append(event)
        self._save_state()

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Event Handlers
    # ─────────────────────────────────────────────────────────────────────────

    def _handle_plan_proposed(self, event: OrchestratorEvent) -> Dict:
        """Handle plan proposal from Planner"""
        data = event.data
        plan_id = f"PLAN-{datetime.now().strftime('%Y%m%d')}-{len(self.processed_events) + 1:03d}"

        self.active_plan = Plan(
            id=plan_id,
            feature=data.get('feature', ''),
            approach=data.get('approach', ''),
            files=data.get('files', []),
            risks=data.get('risks', [])
        )

        self.state = WorkflowState.PLANNING

        return {
            "processed": True,
            "plan_id": plan_id,
            "actions": [
                {"type": "notify", "target_role": "IMPLEMENTER", "message": f"New plan proposed: {plan_id}"},
                {"type": "notify", "target_role": "REVIEWER", "message": f"New plan for review: {plan_id}"}
            ]
        }

    def _handle_plan_approved(self, event: OrchestratorEvent) -> Dict:
        """Handle plan approval"""
        if not self.active_plan:
            return {"processed": False, "error": "No active plan"}

        approver = event.source_agent
        self.active_plan.approved_by.append(approver)

        # Check if all roles approved
        implementers = self.get_agents_by_role(AgentRole.IMPLEMENTER)
        reviewers = self.get_agents_by_role(AgentRole.REVIEWER)

        required = set(implementers + reviewers)
        approved = set(self.active_plan.approved_by)

        if required <= approved:
            self.active_plan.status = "APPROVED"
            self.state = WorkflowState.IMPLEMENTING

            return {
                "processed": True,
                "status": "FULLY_APPROVED",
                "actions": [
                    {"type": "notify", "target_role": "IMPLEMENTER",
                     "message": f"Plan approved. Begin implementation of: {self.active_plan.feature}"}
                ]
            }

        return {
            "processed": True,
            "status": "PARTIAL_APPROVAL",
            "approved_by": list(approved),
            "pending": list(required - approved)
        }

    def _handle_plan_amendment(self, event: OrchestratorEvent) -> Dict:
        """Handle plan amendment suggestion"""
        if not self.active_plan:
            return {"processed": False, "error": "No active plan"}

        amendment = {
            "suggested_by": event.source_agent,
            "suggestion": event.data.get('suggestion', ''),
            "reason": event.data.get('reason', ''),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        self.active_plan.amendments.append(amendment)

        return {
            "processed": True,
            "actions": [
                {"type": "notify", "target_role": "PLANNER",
                 "message": f"Amendment suggested: {amendment['suggestion'][:50]}..."}
            ]
        }

    def _handle_code_written(self, event: OrchestratorEvent) -> Dict:
        """Handle code written notification"""
        file_path = event.data.get('file')
        content = event.data.get('content')
        agent_id = event.source_agent

        if file_path and content:
            # Store version for potential merge
            if file_path not in self.file_versions:
                self.file_versions[file_path] = {}
                # Store base version if exists
                full_path = os.path.join(self.workspace, file_path)
                if os.path.exists(full_path):
                    with open(full_path, 'r') as f:
                        self.base_versions[file_path] = f.read()

            self.file_versions[file_path][agent_id] = content

            # Check for potential conflicts
            if len(self.file_versions[file_path]) > 1:
                return {
                    "processed": True,
                    "warning": "Multiple agents modified same file",
                    "actions": [
                        {"type": "check_merge", "file": file_path}
                    ]
                }

        return {
            "processed": True,
            "actions": [
                {"type": "notify", "target_role": "REVIEWER",
                 "message": f"Code update: {file_path}"}
            ]
        }

    def _handle_code_merged(self, event: OrchestratorEvent) -> Dict:
        """Handle successful code merge"""
        file_path = event.data.get('file')

        # Clear versions after successful merge
        if file_path in self.file_versions:
            del self.file_versions[file_path]
        if file_path in self.base_versions:
            del self.base_versions[file_path]

        return {"processed": True}

    def _handle_review_requested(self, event: OrchestratorEvent) -> Dict:
        """Handle review request"""
        files = event.data.get('files', [])
        description = event.data.get('description', '')

        self.state = WorkflowState.REVIEWING

        return {
            "processed": True,
            "actions": [
                {"type": "notify", "target_role": "REVIEWER",
                 "message": f"Review requested for {len(files)} files: {description[:50]}"}
            ]
        }

    def _handle_review_completed(self, event: OrchestratorEvent) -> Dict:
        """Handle completed review"""
        review_id = f"REV-{datetime.now().strftime('%Y%m%d%H%M%S')}"

        review = ReviewResult(
            id=review_id,
            files=event.data.get('files', []),
            status=event.data.get('status', 'APPROVED'),
            findings=event.data.get('findings', []),
            comments=event.data.get('comments', ''),
            reviewer_id=event.source_agent
        )

        self.pending_reviews[review_id] = review

        if review.status == "APPROVED":
            self.state = WorkflowState.COMPLETED
            return {
                "processed": True,
                "review_id": review_id,
                "status": "APPROVED",
                "actions": [
                    {"type": "notify", "target_role": "IMPLEMENTER",
                     "message": "Code approved! Ready to merge."}
                ]
            }
        else:
            return {
                "processed": True,
                "review_id": review_id,
                "status": review.status,
                "findings_count": len(review.findings),
                "actions": [
                    {"type": "notify", "target_role": "IMPLEMENTER",
                     "message": f"Changes requested: {len(review.findings)} findings"}
                ]
            }

    def _handle_fix_suggested(self, event: OrchestratorEvent) -> Dict:
        """Handle fix suggestion from reviewer"""
        return {
            "processed": True,
            "actions": [
                {"type": "notify", "target_role": "IMPLEMENTER",
                 "message": f"Fix suggested: {event.data.get('description', '')[:50]}"}
            ]
        }

    def _handle_fix_applied(self, event: OrchestratorEvent) -> Dict:
        """Handle fix applied by implementer"""
        return {
            "processed": True,
            "actions": [
                {"type": "notify", "target_role": "REVIEWER",
                 "message": "Fix applied, please re-review"}
            ]
        }

    def _handle_conflict_detected(self, event: OrchestratorEvent) -> Dict:
        """Handle detected conflict"""
        self.state = WorkflowState.CONFLICT

        conflict_data = event.data
        conflict = self.merge_engine._create_conflict(
            file_path=conflict_data.get('file'),
            agent_a=conflict_data.get('agent_a'),
            agent_b=conflict_data.get('agent_b'),
            content_a=conflict_data.get('content_a', ''),
            content_b=conflict_data.get('content_b', ''),
            base_content=conflict_data.get('base_content', '')
        )

        # Try auto-resolve
        auto_resolution = self.merge_engine.auto_resolve(conflict)
        if auto_resolution:
            conflict.resolved = True
            conflict.resolution = auto_resolution
            conflict.resolved_by = "AUTO"
            self.state = WorkflowState.MERGING

            return {
                "processed": True,
                "conflict_id": conflict.id,
                "auto_resolved": True,
                "actions": [
                    {"type": "apply_resolution", "file": conflict.file_path, "content": auto_resolution}
                ]
            }

        return {
            "processed": True,
            "conflict_id": conflict.id,
            "auto_resolved": False,
            "actions": [
                {"type": "notify", "target_role": "PLANNER",
                 "message": f"Conflict needs manual resolution: {conflict.file_path}"}
            ]
        }

    def _handle_conflict_resolved(self, event: OrchestratorEvent) -> Dict:
        """Handle resolved conflict"""
        conflict_id = event.data.get('conflict_id')
        resolution = event.data.get('resolution')

        if self.merge_engine.resolve_conflict(conflict_id, resolution, event.source_agent):
            self.state = WorkflowState.MERGING
            return {
                "processed": True,
                "actions": [
                    {"type": "apply_resolution",
                     "file": self.merge_engine.conflicts[conflict_id].file_path,
                     "content": resolution}
                ]
            }

        return {"processed": False, "error": "Conflict not found"}

    # ─────────────────────────────────────────────────────────────────────────
    # Merge Operations
    # ─────────────────────────────────────────────────────────────────────────

    def attempt_merge(self, file_path: str) -> Dict:
        """Attempt to merge all versions of a file"""
        if file_path not in self.file_versions:
            return {"success": False, "error": "No versions to merge"}

        versions = self.file_versions[file_path]
        if len(versions) < 2:
            return {"success": True, "message": "Only one version, no merge needed"}

        base = self.base_versions.get(file_path, '')
        agents = list(versions.keys())

        # Merge pairwise
        current = versions[agents[0]]
        for i in range(1, len(agents)):
            merged, conflict = self.merge_engine.merge_files(
                base, current, versions[agents[i]],
                agents[i-1], agents[i], file_path
            )

            if conflict:
                return {
                    "success": False,
                    "conflict_id": conflict.id,
                    "conflict": conflict.to_dict()
                }

            current = merged

        return {
            "success": True,
            "merged_content": current,
            "merged_from": agents
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Status and Info
    # ─────────────────────────────────────────────────────────────────────────

    def get_status(self) -> Dict:
        """Get current orchestrator status"""
        return {
            "mode": self.mode.value,
            "state": self.state.value,
            "workspace": self.workspace,
            "connected_agents": len(self.connected_agents),
            "agents": {
                aid: {
                    "type": info['agent_type'],
                    "role": info['role']
                }
                for aid, info in self.connected_agents.items()
            },
            "active_plan": self.active_plan.to_dict() if self.active_plan else None,
            "pending_reviews": len(self.pending_reviews),
            "unresolved_conflicts": len([c for c in self.merge_engine.conflicts.values() if not c.resolved]),
            "event_queue": len(self.event_queue),
            "processed_events": len(self.processed_events)
        }

    def get_workflow_summary(self) -> str:
        """Get human-readable workflow summary"""
        status = self.get_status()

        lines = [
            "=" * 60,
            "ORCHESTRATOR STATUS",
            "=" * 60,
            f"Mode: {status['mode']}",
            f"State: {status['state']}",
            f"Workspace: {status['workspace']}",
            "",
            f"Connected Agents ({status['connected_agents']}):",
        ]

        for aid, info in status['agents'].items():
            lines.append(f"  - {aid}: {info['type']} ({info['role']})")

        if status['active_plan']:
            lines.extend([
                "",
                "Active Plan:",
                f"  ID: {status['active_plan']['id']}",
                f"  Feature: {status['active_plan']['feature']}",
                f"  Status: {status['active_plan']['status']}"
            ])

        if status['unresolved_conflicts'] > 0:
            lines.extend([
                "",
                f"⚠️ Unresolved Conflicts: {status['unresolved_conflicts']}"
            ])

        lines.append("=" * 60)

        return '\n'.join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_start(args):
    """Start orchestrator"""
    mode = OrchestratorMode(args.mode)
    orch = Orchestrator(args.workspace, mode)

    print(f"Orchestrator started in {mode.value} mode")
    print(orch.get_workflow_summary())


def cmd_status(args):
    """Show orchestrator status"""
    orch = Orchestrator(args.workspace)
    print(orch.get_workflow_summary())


def cmd_resolve(args):
    """Resolve a conflict"""
    orch = Orchestrator(args.workspace)

    conflict_id = args.conflict
    if conflict_id not in orch.merge_engine.conflicts:
        print(f"Conflict not found: {conflict_id}")
        return

    conflict = orch.merge_engine.conflicts[conflict_id]

    print(f"Conflict: {conflict_id}")
    print(f"File: {conflict.file_path}")
    print(f"Between: {conflict.agent_a} and {conflict.agent_b}")
    print("")
    print("Version A:")
    print("-" * 40)
    print(conflict.content_a[:500])
    print("")
    print("Version B:")
    print("-" * 40)
    print(conflict.content_b[:500])

    if args.use_a:
        orch.merge_engine.resolve_conflict(conflict_id, conflict.content_a, "CLI")
        print("\n✅ Resolved using version A")
    elif args.use_b:
        orch.merge_engine.resolve_conflict(conflict_id, conflict.content_b, "CLI")
        print("\n✅ Resolved using version B")
    else:
        print("\nUse --use-a or --use-b to resolve")

    orch._save_state()


def cmd_conflicts(args):
    """List conflicts"""
    orch = Orchestrator(args.workspace)

    conflicts = orch.merge_engine.conflicts
    unresolved = [c for c in conflicts.values() if not c.resolved]
    resolved = [c for c in conflicts.values() if c.resolved]

    print("=" * 60)
    print("CONFLICTS")
    print("=" * 60)

    if unresolved:
        print(f"\nUnresolved ({len(unresolved)}):")
        for c in unresolved:
            print(f"  [{c.id}] {c.file_path}")
            print(f"    Between: {c.agent_a} and {c.agent_b}")

    if resolved:
        print(f"\nResolved ({len(resolved)}):")
        for c in resolved:
            print(f"  [{c.id}] {c.file_path} (by {c.resolved_by})")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensemble Orchestrator v5.2",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--workspace", "-w", default=WORKSPACE, help="Workspace directory")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # start
    p_start = subparsers.add_parser("start", help="Start orchestrator")
    p_start.add_argument("--mode", "-m", default="GCC-RT",
                        choices=["GCC-RT", "PAR-RT", "SOLO-RT"],
                        help="Orchestration mode")

    # status
    p_status = subparsers.add_parser("status", help="Show status")

    # resolve
    p_resolve = subparsers.add_parser("resolve", help="Resolve conflict")
    p_resolve.add_argument("--conflict", "-c", required=True, help="Conflict ID")
    p_resolve.add_argument("--use-a", action="store_true", help="Use version A")
    p_resolve.add_argument("--use-b", action="store_true", help="Use version B")

    # conflicts
    p_conflicts = subparsers.add_parser("conflicts", help="List conflicts")

    args = parser.parse_args()

    if args.command == "start":
        cmd_start(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "resolve":
        cmd_resolve(args)
    elif args.command == "conflicts":
        cmd_conflicts(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
