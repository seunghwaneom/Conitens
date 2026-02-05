#!/usr/bin/env python3
"""
ensemble_orchestration_ai.py - AI-Powered Orchestration for Multi-Agent Workspace
Ensemble v5.3.0 - Phase 4: Advanced Features

Provides intelligent work distribution, bottleneck detection,
and automatic rebalancing of tasks across agents.
"""

import json
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any
import random


class AgentCapability(Enum):
    """Agent capabilities for task matching."""
    PLANNING = "planning"
    CODING = "coding"
    REVIEW = "review"
    TESTING = "testing"
    DOCUMENTATION = "documentation"
    SECURITY = "security"
    PERFORMANCE = "performance"


class TaskPriority(Enum):
    """Task priority levels."""
    CRITICAL = 4
    HIGH = 3
    MEDIUM = 2
    LOW = 1


class TaskStatus(Enum):
    """Task execution status."""
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AgentProfile:
    """Profile of an agent's capabilities and performance."""
    agent_id: str
    agent_type: str  # "gemini", "claude", "codex"
    capabilities: List[str] = field(default_factory=list)
    current_load: float = 0.0  # 0.0 - 1.0
    tasks_completed: int = 0
    tasks_failed: int = 0
    avg_completion_time: float = 0.0  # seconds
    specializations: Dict[str, float] = field(default_factory=dict)  # capability -> proficiency
    is_available: bool = True
    last_task_at: Optional[str] = None

    @property
    def success_rate(self) -> float:
        total = self.tasks_completed + self.tasks_failed
        return self.tasks_completed / total if total > 0 else 1.0

    @property
    def efficiency_score(self) -> float:
        """Calculate overall efficiency score."""
        return (
            self.success_rate * 0.4 +
            (1 - self.current_load) * 0.3 +
            min(1.0, self.tasks_completed / 10) * 0.3
        )

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['success_rate'] = self.success_rate
        data['efficiency_score'] = self.efficiency_score
        return data


@dataclass
class WorkItem:
    """A unit of work to be assigned."""
    work_id: str
    title: str
    description: str
    required_capabilities: List[str]
    priority: TaskPriority
    estimated_time: float  # seconds
    dependencies: List[str] = field(default_factory=list)  # work_ids
    files: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    assigned_to: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    actual_time: Optional[float] = None
    partition_id: Optional[str] = None

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['priority'] = self.priority.name
        data['status'] = self.status.name
        return data


@dataclass
class BottleneckInfo:
    """Information about a detected bottleneck."""
    bottleneck_type: str
    severity: str  # "low", "medium", "high", "critical"
    affected_agents: List[str]
    affected_tasks: List[str]
    description: str
    recommendation: str
    detected_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict:
        return asdict(self)


class OrchestrationAI:
    """AI-powered orchestration for multi-agent coordination."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.agents: Dict[str, AgentProfile] = {}
        self.work_queue: Dict[str, WorkItem] = {}
        self.completed_work: List[WorkItem] = []
        self.bottlenecks: List[BottleneckInfo] = []
        self.state_file = os.path.join(workspace, '.notes', 'ACTIVE', '_orchestration_state.json')
        self._load_state()

        # Default capability mappings
        self.default_capabilities = {
            'gemini': [AgentCapability.PLANNING.value, AgentCapability.DOCUMENTATION.value],
            'claude': [AgentCapability.CODING.value, AgentCapability.REVIEW.value, AgentCapability.TESTING.value],
            'codex': [AgentCapability.REVIEW.value, AgentCapability.SECURITY.value, AgentCapability.PERFORMANCE.value]
        }

    def _load_state(self):
        """Load orchestration state from file."""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                for agent_data in data.get('agents', []):
                    self.agents[agent_data['agent_id']] = AgentProfile(**agent_data)

                for work_data in data.get('work_queue', []):
                    work_data['priority'] = TaskPriority[work_data['priority']]
                    work_data['status'] = TaskStatus[work_data['status']]
                    self.work_queue[work_data['work_id']] = WorkItem(**work_data)

            except Exception as e:
                print(f"Warning: Could not load state: {e}", file=sys.stderr)

    def _save_state(self):
        """Save orchestration state to file."""
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        data = {
            'updated_at': datetime.now().isoformat(),
            'agents': [a.to_dict() for a in self.agents.values()],
            'work_queue': [w.to_dict() for w in self.work_queue.values()],
            'bottlenecks': [b.to_dict() for b in self.bottlenecks[-10:]]  # Keep last 10
        }
        with open(self.state_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

    def register_agent(
        self,
        agent_id: str,
        agent_type: str,
        capabilities: List[str] = None,
        specializations: Dict[str, float] = None
    ) -> AgentProfile:
        """Register an agent with the orchestrator."""
        if capabilities is None:
            capabilities = self.default_capabilities.get(agent_type.lower(), [])

        profile = AgentProfile(
            agent_id=agent_id,
            agent_type=agent_type.lower(),
            capabilities=capabilities,
            specializations=specializations or {}
        )

        self.agents[agent_id] = profile
        self._save_state()
        return profile

    def update_agent_status(
        self,
        agent_id: str,
        load: float = None,
        is_available: bool = None,
        task_completed: bool = None,
        task_failed: bool = None,
        completion_time: float = None
    ):
        """Update an agent's status."""
        if agent_id not in self.agents:
            return

        agent = self.agents[agent_id]

        if load is not None:
            agent.current_load = max(0.0, min(1.0, load))

        if is_available is not None:
            agent.is_available = is_available

        if task_completed:
            agent.tasks_completed += 1
            agent.last_task_at = datetime.now().isoformat()

            if completion_time:
                # Update running average
                total = agent.tasks_completed
                agent.avg_completion_time = (
                    (agent.avg_completion_time * (total - 1) + completion_time) / total
                )

        if task_failed:
            agent.tasks_failed += 1

        self._save_state()

    def add_work(
        self,
        title: str,
        description: str,
        required_capabilities: List[str],
        priority: str = "MEDIUM",
        estimated_time: float = 300,
        dependencies: List[str] = None,
        files: List[str] = None,
        partition_id: str = None
    ) -> WorkItem:
        """Add a work item to the queue."""
        work_id = f"WORK-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(self.work_queue):03d}"

        work = WorkItem(
            work_id=work_id,
            title=title,
            description=description,
            required_capabilities=required_capabilities,
            priority=TaskPriority[priority.upper()],
            estimated_time=estimated_time,
            dependencies=dependencies or [],
            files=files or [],
            partition_id=partition_id
        )

        self.work_queue[work_id] = work
        self._save_state()
        return work

    def calculate_agent_score(self, agent: AgentProfile, work: WorkItem) -> float:
        """Calculate how suitable an agent is for a work item."""
        score = 0.0

        # Capability match (40%)
        matched = set(agent.capabilities) & set(work.required_capabilities)
        if work.required_capabilities:
            capability_score = len(matched) / len(work.required_capabilities)
        else:
            capability_score = 1.0
        score += capability_score * 0.4

        # Specialization bonus
        for cap in matched:
            if cap in agent.specializations:
                score += agent.specializations[cap] * 0.1

        # Load factor (30%) - prefer less loaded agents
        load_score = 1 - agent.current_load
        score += load_score * 0.3

        # Efficiency factor (20%)
        score += agent.efficiency_score * 0.2

        # Availability (10%)
        if agent.is_available:
            score += 0.1

        return min(1.0, score)

    def assign_work(self, work_id: str = None) -> Optional[Tuple[str, WorkItem]]:
        """
        Assign work to the best available agent.

        If work_id is provided, assign that specific work.
        Otherwise, assign the highest priority pending work.
        """
        # Find work to assign
        if work_id:
            if work_id not in self.work_queue:
                return None
            work = self.work_queue[work_id]
        else:
            # Find highest priority unassigned work with satisfied dependencies
            pending = [
                w for w in self.work_queue.values()
                if w.status == TaskStatus.PENDING
                and all(
                    self.work_queue.get(dep, WorkItem("", "", "", [], TaskPriority.LOW, 0)).status == TaskStatus.COMPLETED
                    for dep in w.dependencies
                )
            ]

            if not pending:
                return None

            # Sort by priority (descending) then by estimated time (ascending)
            work = sorted(pending, key=lambda w: (-w.priority.value, w.estimated_time))[0]

        # Find best agent
        available_agents = [a for a in self.agents.values() if a.is_available and a.current_load < 0.9]

        if not available_agents:
            work.status = TaskStatus.BLOCKED
            self._save_state()
            return None

        # Score each agent
        agent_scores = [
            (agent, self.calculate_agent_score(agent, work))
            for agent in available_agents
        ]

        # Select best agent (with some randomization for load balancing)
        agent_scores.sort(key=lambda x: x[1], reverse=True)
        top_agents = agent_scores[:3]  # Consider top 3

        if len(top_agents) > 1:
            # Weighted random selection among top agents
            weights = [s[1] for s in top_agents]
            total = sum(weights)
            if total > 0:
                r = random.random() * total
                cumulative = 0
                for agent, score in top_agents:
                    cumulative += score
                    if r <= cumulative:
                        selected = agent
                        break
                else:
                    selected = top_agents[0][0]
            else:
                selected = top_agents[0][0]
        else:
            selected = top_agents[0][0]

        # Assign work
        work.assigned_to = selected.agent_id
        work.status = TaskStatus.ASSIGNED
        work.started_at = datetime.now().isoformat()

        # Update agent load
        selected.current_load = min(1.0, selected.current_load + 0.2)

        self._save_state()
        return (selected.agent_id, work)

    def complete_work(self, work_id: str, success: bool = True, actual_time: float = None):
        """Mark work as completed."""
        if work_id not in self.work_queue:
            return

        work = self.work_queue[work_id]
        work.status = TaskStatus.COMPLETED if success else TaskStatus.FAILED
        work.completed_at = datetime.now().isoformat()
        work.actual_time = actual_time

        # Update agent stats
        if work.assigned_to and work.assigned_to in self.agents:
            self.update_agent_status(
                work.assigned_to,
                task_completed=success,
                task_failed=not success,
                completion_time=actual_time
            )
            # Reduce load
            agent = self.agents[work.assigned_to]
            agent.current_load = max(0.0, agent.current_load - 0.2)

        self.completed_work.append(work)
        self._save_state()

    def detect_bottlenecks(self) -> List[BottleneckInfo]:
        """Detect bottlenecks in the current workflow."""
        bottlenecks = []

        # 1. Agent overload detection
        overloaded = [a for a in self.agents.values() if a.current_load > 0.8]
        if overloaded:
            bottlenecks.append(BottleneckInfo(
                bottleneck_type="agent_overload",
                severity="high" if len(overloaded) > len(self.agents) * 0.5 else "medium",
                affected_agents=[a.agent_id for a in overloaded],
                affected_tasks=[
                    w.work_id for w in self.work_queue.values()
                    if w.assigned_to in [a.agent_id for a in overloaded]
                ],
                description=f"{len(overloaded)} agent(s) are overloaded (>80% capacity)",
                recommendation="Consider adding more agents or redistributing tasks"
            ))

        # 2. Blocked task detection
        blocked = [w for w in self.work_queue.values() if w.status == TaskStatus.BLOCKED]
        if blocked:
            # Find blocking dependencies
            blocking_deps = set()
            for w in blocked:
                for dep in w.dependencies:
                    if dep in self.work_queue and self.work_queue[dep].status != TaskStatus.COMPLETED:
                        blocking_deps.add(dep)

            bottlenecks.append(BottleneckInfo(
                bottleneck_type="blocked_tasks",
                severity="high" if len(blocked) > 3 else "medium",
                affected_agents=[],
                affected_tasks=[w.work_id for w in blocked] + list(blocking_deps),
                description=f"{len(blocked)} task(s) are blocked by dependencies",
                recommendation=f"Prioritize completing blocking tasks: {', '.join(blocking_deps)}"
            ))

        # 3. Capability gap detection
        pending = [w for w in self.work_queue.values() if w.status == TaskStatus.PENDING]
        for work in pending:
            matching_agents = [
                a for a in self.agents.values()
                if set(a.capabilities) & set(work.required_capabilities)
            ]
            if not matching_agents:
                bottlenecks.append(BottleneckInfo(
                    bottleneck_type="capability_gap",
                    severity="critical",
                    affected_agents=[],
                    affected_tasks=[work.work_id],
                    description=f"No agent has required capabilities: {work.required_capabilities}",
                    recommendation="Register an agent with the required capabilities"
                ))

        # 4. Long-running task detection
        now = datetime.now()
        for work in self.work_queue.values():
            if work.status == TaskStatus.IN_PROGRESS and work.started_at:
                started = datetime.fromisoformat(work.started_at)
                elapsed = (now - started).total_seconds()

                if elapsed > work.estimated_time * 2:
                    bottlenecks.append(BottleneckInfo(
                        bottleneck_type="long_running",
                        severity="medium",
                        affected_agents=[work.assigned_to] if work.assigned_to else [],
                        affected_tasks=[work.work_id],
                        description=f"Task {work.work_id} is taking 2x longer than estimated",
                        recommendation="Check if task is stuck or needs assistance"
                    ))

        # 5. Queue imbalance detection
        assigned_counts = defaultdict(int)
        for work in self.work_queue.values():
            if work.assigned_to and work.status in [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]:
                assigned_counts[work.assigned_to] += 1

        if assigned_counts:
            max_assigned = max(assigned_counts.values())
            min_assigned = min(assigned_counts.values()) if len(assigned_counts) > 1 else max_assigned

            if max_assigned > min_assigned * 3:
                bottlenecks.append(BottleneckInfo(
                    bottleneck_type="queue_imbalance",
                    severity="low",
                    affected_agents=list(assigned_counts.keys()),
                    affected_tasks=[],
                    description="Work is unevenly distributed among agents",
                    recommendation="Consider rebalancing task assignments"
                ))

        self.bottlenecks.extend(bottlenecks)
        self._save_state()
        return bottlenecks

    def rebalance_tasks(self) -> List[Dict]:
        """Redistribute tasks to balance load."""
        actions = []

        # Get current assignments
        in_progress = [
            w for w in self.work_queue.values()
            if w.status in [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]
        ]

        if not in_progress or len(self.agents) < 2:
            return actions

        # Calculate current load per agent
        agent_tasks: Dict[str, List[WorkItem]] = defaultdict(list)
        for work in in_progress:
            if work.assigned_to:
                agent_tasks[work.assigned_to].append(work)

        # Find overloaded and underloaded agents
        avg_tasks = len(in_progress) / len(self.agents)
        overloaded = [(a, tasks) for a, tasks in agent_tasks.items() if len(tasks) > avg_tasks * 1.5]
        underloaded = [a for a in self.agents.keys() if len(agent_tasks.get(a, [])) < avg_tasks * 0.5]

        # Reassign tasks from overloaded to underloaded
        for agent_id, tasks in overloaded:
            # Only reassign ASSIGNED (not IN_PROGRESS) tasks
            reassignable = [t for t in tasks if t.status == TaskStatus.ASSIGNED]

            for task in reassignable[:len(underloaded)]:
                if underloaded:
                    new_agent = underloaded.pop(0)

                    old_agent = task.assigned_to
                    task.assigned_to = new_agent
                    task.status = TaskStatus.ASSIGNED

                    actions.append({
                        'action': 'reassign',
                        'work_id': task.work_id,
                        'from_agent': old_agent,
                        'to_agent': new_agent,
                        'reason': 'load_balancing'
                    })

        self._save_state()
        return actions

    def estimate_completion(self, work_ids: List[str] = None) -> Dict:
        """Estimate completion time for work items."""
        if work_ids is None:
            work_ids = list(self.work_queue.keys())

        results = {
            'items': [],
            'total_estimated_time': 0,
            'critical_path_time': 0
        }

        # Build dependency graph
        for work_id in work_ids:
            if work_id not in self.work_queue:
                continue

            work = self.work_queue[work_id]

            # Calculate time based on status
            if work.status == TaskStatus.COMPLETED:
                remaining = 0
            elif work.status == TaskStatus.IN_PROGRESS and work.started_at:
                started = datetime.fromisoformat(work.started_at)
                elapsed = (datetime.now() - started).total_seconds()
                remaining = max(0, work.estimated_time - elapsed)
            else:
                remaining = work.estimated_time

                # Adjust based on agent performance
                if work.assigned_to and work.assigned_to in self.agents:
                    agent = self.agents[work.assigned_to]
                    if agent.avg_completion_time > 0:
                        ratio = agent.avg_completion_time / work.estimated_time
                        remaining *= ratio

            results['items'].append({
                'work_id': work_id,
                'status': work.status.name,
                'estimated_remaining': remaining,
                'assigned_to': work.assigned_to
            })

            results['total_estimated_time'] += remaining

        # Calculate critical path (simplified: longest dependency chain)
        def get_critical_path_time(wid: str, visited: Set[str] = None) -> float:
            if visited is None:
                visited = set()

            if wid in visited or wid not in self.work_queue:
                return 0

            visited.add(wid)
            work = self.work_queue[wid]

            dep_times = [get_critical_path_time(d, visited) for d in work.dependencies]
            max_dep_time = max(dep_times) if dep_times else 0

            return work.estimated_time + max_dep_time

        critical_times = [get_critical_path_time(wid) for wid in work_ids if wid in self.work_queue]
        results['critical_path_time'] = max(critical_times) if critical_times else 0

        return results

    def get_status(self) -> Dict:
        """Get current orchestration status."""
        status_counts = defaultdict(int)
        for work in self.work_queue.values():
            status_counts[work.status.name] += 1

        agent_status = []
        for agent in self.agents.values():
            assigned = len([w for w in self.work_queue.values() if w.assigned_to == agent.agent_id])
            agent_status.append({
                'agent_id': agent.agent_id,
                'type': agent.agent_type,
                'load': agent.current_load,
                'assigned_tasks': assigned,
                'efficiency': agent.efficiency_score,
                'available': agent.is_available
            })

        return {
            'total_work_items': len(self.work_queue),
            'status_breakdown': dict(status_counts),
            'agents': agent_status,
            'recent_bottlenecks': [b.to_dict() for b in self.bottlenecks[-5:]],
            'completion_estimate': self.estimate_completion()
        }


# CLI Interface
def cmd_status(args):
    """Show orchestration status."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_orchestration_ai.py status')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    orchestrator = OrchestrationAI(workspace)
    status = orchestrator.get_status()

    if parsed.json:
        print(json.dumps(status, indent=2))
        return 0

    print("\n🎯 Orchestration Status")
    print("=" * 50)

    print(f"\n📋 Work Items: {status['total_work_items']}")
    for s, count in status['status_breakdown'].items():
        print(f"   {s}: {count}")

    print(f"\n👥 Agents: {len(status['agents'])}")
    for agent in status['agents']:
        icon = "🟢" if agent['available'] else "🔴"
        print(f"   {icon} {agent['agent_id']} ({agent['type']})")
        print(f"      Load: {agent['load']:.0%}, Tasks: {agent['assigned_tasks']}, Efficiency: {agent['efficiency']:.2f}")

    if status['recent_bottlenecks']:
        print("\n⚠️ Recent Bottlenecks:")
        for b in status['recent_bottlenecks']:
            print(f"   [{b['severity'].upper()}] {b['description']}")

    print(f"\n⏱️ Completion Estimate:")
    print(f"   Total: {status['completion_estimate']['total_estimated_time']:.0f}s")
    print(f"   Critical Path: {status['completion_estimate']['critical_path_time']:.0f}s")

    return 0


def cmd_agent(args):
    """Manage agents."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_orchestration_ai.py agent')
    parser.add_argument('action', choices=['register', 'update', 'list'])
    parser.add_argument('--id', help='Agent ID')
    parser.add_argument('--type', help='Agent type (gemini/claude/codex)')
    parser.add_argument('--capabilities', help='Comma-separated capabilities')
    parser.add_argument('--load', type=float, help='Current load (0-1)')
    parser.add_argument('--available', type=bool, help='Is available')

    parsed = parser.parse_args(args)
    workspace = os.getcwd()
    orchestrator = OrchestrationAI(workspace)

    if parsed.action == 'register':
        if not parsed.id or not parsed.type:
            print("Error: --id and --type required for register", file=sys.stderr)
            return 1

        caps = parsed.capabilities.split(',') if parsed.capabilities else None
        profile = orchestrator.register_agent(parsed.id, parsed.type, caps)
        print(f"✅ Agent registered: {profile.agent_id}")

    elif parsed.action == 'update':
        if not parsed.id:
            print("Error: --id required for update", file=sys.stderr)
            return 1

        orchestrator.update_agent_status(
            parsed.id,
            load=parsed.load,
            is_available=parsed.available
        )
        print(f"✅ Agent updated: {parsed.id}")

    elif parsed.action == 'list':
        for agent in orchestrator.agents.values():
            print(f"\n{agent.agent_id} ({agent.agent_type})")
            print(f"  Capabilities: {', '.join(agent.capabilities)}")
            print(f"  Load: {agent.current_load:.0%}")
            print(f"  Completed: {agent.tasks_completed}, Failed: {agent.tasks_failed}")
            print(f"  Efficiency: {agent.efficiency_score:.2f}")

    return 0


def cmd_work(args):
    """Manage work items."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_orchestration_ai.py work')
    parser.add_argument('action', choices=['add', 'assign', 'complete', 'list'])
    parser.add_argument('--id', help='Work ID')
    parser.add_argument('--title', help='Work title')
    parser.add_argument('--description', help='Work description')
    parser.add_argument('--capabilities', help='Required capabilities (comma-separated)')
    parser.add_argument('--priority', default='MEDIUM', help='Priority (LOW/MEDIUM/HIGH/CRITICAL)')
    parser.add_argument('--time', type=float, default=300, help='Estimated time in seconds')
    parser.add_argument('--success', type=bool, default=True, help='Completed successfully')

    parsed = parser.parse_args(args)
    workspace = os.getcwd()
    orchestrator = OrchestrationAI(workspace)

    if parsed.action == 'add':
        if not parsed.title:
            print("Error: --title required", file=sys.stderr)
            return 1

        caps = parsed.capabilities.split(',') if parsed.capabilities else []
        work = orchestrator.add_work(
            title=parsed.title,
            description=parsed.description or "",
            required_capabilities=caps,
            priority=parsed.priority,
            estimated_time=parsed.time
        )
        print(f"✅ Work added: {work.work_id}")

    elif parsed.action == 'assign':
        result = orchestrator.assign_work(parsed.id)
        if result:
            agent_id, work = result
            print(f"✅ {work.work_id} assigned to {agent_id}")
        else:
            print("❌ Could not assign work (no available agents or work)")
            return 1

    elif parsed.action == 'complete':
        if not parsed.id:
            print("Error: --id required", file=sys.stderr)
            return 1
        orchestrator.complete_work(parsed.id, parsed.success)
        print(f"✅ Work completed: {parsed.id}")

    elif parsed.action == 'list':
        for work in orchestrator.work_queue.values():
            icon = {
                TaskStatus.PENDING: "⏳",
                TaskStatus.ASSIGNED: "📋",
                TaskStatus.IN_PROGRESS: "🔄",
                TaskStatus.BLOCKED: "🚫",
                TaskStatus.COMPLETED: "✅",
                TaskStatus.FAILED: "❌"
            }.get(work.status, "•")
            print(f"{icon} {work.work_id}: {work.title}")
            print(f"   Status: {work.status.name}, Priority: {work.priority.name}")
            if work.assigned_to:
                print(f"   Assigned to: {work.assigned_to}")

    return 0


def cmd_bottleneck(args):
    """Detect and show bottlenecks."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_orchestration_ai.py bottleneck')
    parser.add_argument('--json', action='store_true')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    orchestrator = OrchestrationAI(workspace)
    bottlenecks = orchestrator.detect_bottlenecks()

    if parsed.json:
        print(json.dumps([b.to_dict() for b in bottlenecks], indent=2))
        return 0

    if not bottlenecks:
        print("✅ No bottlenecks detected")
        return 0

    print("\n⚠️ Detected Bottlenecks")
    print("=" * 50)

    for b in bottlenecks:
        severity_icon = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        }.get(b.severity, '•')

        print(f"\n{severity_icon} [{b.severity.upper()}] {b.bottleneck_type}")
        print(f"   {b.description}")
        print(f"   💡 {b.recommendation}")
        if b.affected_agents:
            print(f"   Agents: {', '.join(b.affected_agents)}")
        if b.affected_tasks:
            print(f"   Tasks: {', '.join(b.affected_tasks)}")

    return 0


def cmd_rebalance(args):
    """Rebalance task assignments."""
    workspace = os.getcwd()
    orchestrator = OrchestrationAI(workspace)
    actions = orchestrator.rebalance_tasks()

    if not actions:
        print("✅ No rebalancing needed")
        return 0

    print("\n🔄 Rebalancing Actions")
    print("=" * 50)

    for action in actions:
        print(f"  {action['work_id']}: {action['from_agent']} → {action['to_agent']}")

    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: ensemble_orchestration_ai.py <command> [args]")
        print("\nCommands:")
        print("  status     - Show orchestration status")
        print("  agent      - Manage agents (register/update/list)")
        print("  work       - Manage work items (add/assign/complete/list)")
        print("  bottleneck - Detect bottlenecks")
        print("  rebalance  - Rebalance task assignments")
        return 1

    commands = {
        'status': cmd_status,
        'agent': cmd_agent,
        'work': cmd_work,
        'bottleneck': cmd_bottleneck,
        'rebalance': cmd_rebalance
    }

    cmd = sys.argv[1]
    if cmd not in commands:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        return 1

    return commands[cmd](sys.argv[2:])


if __name__ == '__main__':
    sys.exit(main())
