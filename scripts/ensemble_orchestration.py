#!/usr/bin/env python3
"""
Batch 8 orchestration skeleton with a LangGraph-compatible boundary.
"""

from __future__ import annotations

import importlib.util
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol

from ensemble_context_assembler import ContextAssembler
from ensemble_context_markdown import TaskPlanWriterReader
from ensemble_approval import ApprovalInterruptAdapter
from ensemble_iteration_service import IterationService
from ensemble_execution_loop import IterativeExecutionLoop
from ensemble_loop_repository import LoopStateRepository
from ensemble_run_service import RunService


LANGGRAPH_AVAILABLE = importlib.util.find_spec("langgraph") is not None


class OrchestrationRuntime(Protocol):
    def run_planner(self, request: str, *, run_id: str | None = None, owner: str = "planner") -> "OrchestrationState": ...
    def run_build(self, run_id: str, *, agent_id: str) -> "OrchestrationState": ...
    def resume(self, run_id: str, graph_kind: str) -> "OrchestrationState | None": ...
LANGGRAPH_BLOCKER_REASON = (
    "LangGraph is not installed and the repo has no declared Python dependency-management "
    "surface for introducing it reproducibly in this batch."
)
LANGGRAPH_INTEGRATION_MODE = "local-fallback"


class LangGraphBlockedError(RuntimeError):
    pass


def assert_langgraph_available() -> None:
    if not LANGGRAPH_AVAILABLE:
        raise LangGraphBlockedError(LANGGRAPH_BLOCKER_REASON)


@dataclass
class OrchestrationState:
    run_id: str
    graph_kind: str
    agent_id: str | None
    objective: str
    current_step: str | None
    current_task: str | None = None
    done_when: list[str] = field(default_factory=list)
    retry_count: int = 0
    validator_issues: list[dict[str, Any]] = field(default_factory=list)
    retry_decisions: list[dict[str, Any]] = field(default_factory=list)
    approval_pending: bool = False
    pending_approval_request_id: str | None = None
    stop_reason: str | None = None
    cost_metrics: dict[str, Any] = field(default_factory=dict)
    tool_whitelist: list[str] = field(default_factory=list)
    last_artifact: dict[str, Any] | None = None


class SQLiteCheckpointer:
    def __init__(self, repository: LoopStateRepository):
        self.repository = repository

    def save(self, state: OrchestrationState, *, step_name: str) -> dict[str, Any]:
        return self.repository.append_orchestration_checkpoint(
            run_id=state.run_id,
            graph_kind=state.graph_kind,
            step_name=step_name,
            state=asdict(state),
            retry_count=state.retry_count,
            validator_issues=state.validator_issues,
            approval_pending=state.approval_pending,
            stop_reason=state.stop_reason,
            loop_cost_metrics=state.cost_metrics,
        )

    def load(self, *, run_id: str, graph_kind: str) -> OrchestrationState | None:
        row = self.repository.get_latest_orchestration_checkpoint(run_id=run_id, graph_kind=graph_kind)
        if row is None:
            return None
        return OrchestrationState(**row["state_json"])


class PlannerGraph:
    graph_kind = "planner"

    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.checkpointer = SQLiteCheckpointer(self.repository)
        self.run_service = RunService(self.repository)
        self.task_plan = TaskPlanWriterReader(self.repository)

    def initialize(self, request: str, *, run_id: str | None = None, owner: str = "planner") -> OrchestrationState:
        run = self.run_service.create_run(request) if run_id is None else self.run_service.get_run(run_id)
        state = OrchestrationState(
            run_id=run["run_id"],
            graph_kind=self.graph_kind,
            agent_id=owner,
            objective=request.strip(),
            current_step="scope_splitter",
            current_task=request.strip(),
        )
        self.checkpointer.save(state, step_name="initialize")
        return state

    def run(
        self,
        request: str,
        *,
        run_id: str | None = None,
        owner: str = "planner",
    ) -> OrchestrationState:
        state = self.initialize(request, run_id=run_id, owner=owner)
        state = self.scope_splitter(state)
        state = self.acceptance_builder(state)
        state = self.task_plan_writer(state)
        return state

    def resume(self, run_id: str) -> OrchestrationState | None:
        return self.checkpointer.load(run_id=run_id, graph_kind=self.graph_kind)

    def scope_splitter(self, state: OrchestrationState) -> OrchestrationState:
        state.current_step = "acceptance_builder"
        self.checkpointer.save(state, step_name="scope_splitter")
        return state

    def acceptance_builder(self, state: OrchestrationState) -> OrchestrationState:
        state.done_when = [f"Task plan exists for: {state.objective}"]
        state.current_step = "task_plan_writer"
        self.checkpointer.save(state, step_name="acceptance_builder")
        return state

    def task_plan_writer(self, state: OrchestrationState) -> OrchestrationState:
        self.task_plan.update_from_structured_input(
            run_id=state.run_id,
            current_plan=state.objective,
            objective=state.objective,
            steps=[{"title": state.objective, "status": "pending", "owner": state.agent_id}],
            acceptance_criteria=state.done_when,
            owner=state.agent_id,
        )
        state.current_step = state.objective
        self.checkpointer.save(state, step_name="task_plan_writer")
        return state


class BuildGraph:
    graph_kind = "build"

    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.checkpointer = SQLiteCheckpointer(self.repository)
        self.task_plan = TaskPlanWriterReader(self.repository)
        self.iterations = IterationService(self.repository)
        self.assembler = ContextAssembler(self.workspace)
        self.execution_loop = IterativeExecutionLoop(self.workspace)
        self.approvals = ApprovalInterruptAdapter(self.workspace)

    def initialize(self, run_id: str, *, agent_id: str) -> OrchestrationState:
        run = self.repository.get_run(run_id)
        plan = self.repository.get_task_plan(run_id)
        if plan is None:
            raise ValueError(f"No task plan for run: {run_id}")
        current_step = self._current_step(plan)
        state = OrchestrationState(
            run_id=run_id,
            graph_kind=self.graph_kind,
            agent_id=agent_id,
            objective=plan["objective"],
            current_step=current_step,
            current_task=current_step,
            done_when=list(plan.get("acceptance_json", [])),
        )
        if not self.repository.list_iterations(run_id):
            self.iterations.append_iteration(run_id, current_step or plan["objective"])
        self.checkpointer.save(state, step_name="initialize")
        return state

    def run(self, run_id: str, *, agent_id: str) -> OrchestrationState:
        existing = self.resume(run_id)
        if existing is not None:
            if existing.approval_pending:
                return existing
            if existing.current_step in {"completed", "rejected", "human_escalation"}:
                return existing
            state = existing
        else:
            state = self.initialize(run_id, agent_id=agent_id)
        state = self.context_builder(state)
        state = self.specialist_router(state)
        state = self.worker_stub(state)
        state = self.execution_loop.run(run_id, agent_id=agent_id, state=state)
        self.checkpointer.save(state, step_name=state.current_step or "build")
        return state

    def load_current_step(self, run_id: str) -> str | None:
        plan = self.repository.get_task_plan(run_id)
        if plan is None:
            return None
        return self._current_step(plan)

    def context_builder(self, state: OrchestrationState) -> OrchestrationState:
        packet = self.assembler.assemble(agent_id=state.agent_id or "", run_id=state.run_id)
        state.cost_metrics = packet["metrics"]
        state.cost_metrics["packet"] = packet["packet"]
        state.tool_whitelist = list(packet["packet"]["tool_whitelist"])
        state.current_step = "specialist_router"
        self.checkpointer.save(state, step_name="context_builder")
        return state

    def specialist_router(self, state: OrchestrationState) -> OrchestrationState:
        state.current_step = "worker_stub"
        self.checkpointer.save(state, step_name="specialist_router")
        return state

    def worker_stub(self, state: OrchestrationState) -> OrchestrationState:
        state.current_step = "validator_stub"
        self.checkpointer.save(state, step_name="worker_stub")
        return state

    def record_retry(self, run_id: str, *, reason: str) -> OrchestrationState:
        state = self.checkpointer.load(run_id=run_id, graph_kind=self.graph_kind)
        if state is None:
            raise ValueError(f"No checkpoint for run: {run_id}")
        state.retry_count += 1
        state.validator_issues = [{"reason": reason}]
        self.repository.append_retry_decision(
            run_id=run_id,
            graph_kind=self.graph_kind,
            retry_index=state.retry_count,
            decision="manual_retry",
            reason=reason,
        )
        self.checkpointer.save(state, step_name="retry")
        return state

    def resume(self, run_id: str) -> OrchestrationState | None:
        return self.checkpointer.load(run_id=run_id, graph_kind=self.graph_kind)

    def resume_after_approval(self, run_id: str) -> OrchestrationState:
        state = self.checkpointer.load(run_id=run_id, graph_kind=self.graph_kind)
        if state is None:
            raise ValueError(f"No checkpoint for run: {run_id}")
        if not state.approval_pending or not state.pending_approval_request_id:
            raise ValueError(f"No approval is pending for run: {run_id}")
        request = self.repository.get_approval_request(state.pending_approval_request_id)
        if request is None:
            raise ValueError(f"No approval request found for run: {run_id}")
        if request["status"] == "pending":
            return state
        state.approval_pending = False
        if request["status"] == "rejected":
            rejection_reason = request.get("reviewer_note") or request["action_type"]
            state.pending_approval_request_id = None
            state.approval_pending = False
            state.current_step = "rejected"
            state.stop_reason = "rejected"
            state.validator_issues = [{"message": f"Approval rejected: {rejection_reason}"}]
            self.approvals.reinject_rejection_feedback(request)
            self.checkpointer.save(state, step_name="rejected")
            return state
        state.pending_approval_request_id = None
        state.approval_pending = False
        state.current_step = "validator_stub"
        state = self.execution_loop.run(
            run_id,
            agent_id=state.agent_id or "",
            state=state,
            approved_request=request,
        )
        self.checkpointer.save(state, step_name=state.current_step or "build")
        return state

    def _current_step(self, plan: dict[str, Any]) -> str | None:
        active_steps: list[str] = []
        for step in plan.get("steps_json", []):
            status = str(step.get("status", "pending")).lower()
            if status not in {"completed", "done", "cancelled", "skipped"}:
                title = step.get("title")
                if title:
                    active_steps.append(title)
        if len(active_steps) > 1:
            raise ValueError("one-task-per-iteration violated: multiple active steps found")
        return active_steps[0] if active_steps else None

    def _current_iteration_id(self, run_id: str) -> str:
        iterations = self.repository.list_iterations(run_id)
        if not iterations:
            raise ValueError(f"No iterations available for run: {run_id}")
        return iterations[-1]["iteration_id"]


def orchestration_blocker_summary() -> dict[str, Any]:
    if LANGGRAPH_AVAILABLE:
        return {"langgraph_available": True, "integration_mode": "direct", "reason": None}
    return {
        "langgraph_available": False,
        "integration_mode": LANGGRAPH_INTEGRATION_MODE,
        "reason": LANGGRAPH_BLOCKER_REASON,
    }


class LocalOrchestrationRuntime:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.planner = PlannerGraph(self.workspace)
        self.build = BuildGraph(self.workspace)

    def run_planner(self, request: str, *, run_id: str | None = None, owner: str = "planner") -> OrchestrationState:
        return self.planner.run(request, run_id=run_id, owner=owner)

    def run_build(self, run_id: str, *, agent_id: str) -> OrchestrationState:
        return self.build.run(run_id, agent_id=agent_id)

    def resume(self, run_id: str, graph_kind: str) -> OrchestrationState | None:
        if graph_kind == PlannerGraph.graph_kind:
            return self.planner.resume(run_id)
        if graph_kind == BuildGraph.graph_kind:
            return self.build.resume(run_id)
        raise ValueError(f"Unsupported graph_kind: {graph_kind}")

    def resume_after_approval(self, run_id: str, graph_kind: str = "build") -> OrchestrationState:
        if graph_kind != BuildGraph.graph_kind:
            raise ValueError(f"Unsupported graph_kind for approval resume: {graph_kind}")
        return self.build.resume_after_approval(run_id)


__all__ = [
    "BuildGraph",
    "LANGGRAPH_AVAILABLE",
    "LANGGRAPH_BLOCKER_REASON",
    "LANGGRAPH_INTEGRATION_MODE",
    "LangGraphBlockedError",
    "LocalOrchestrationRuntime",
    "OrchestrationRuntime",
    "OrchestrationState",
    "PlannerGraph",
    "SQLiteCheckpointer",
    "assert_langgraph_available",
    "orchestration_blocker_summary",
]
