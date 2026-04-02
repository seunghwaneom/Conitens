#!/usr/bin/env python3
"""
Batch 9 iterative execution loop components.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Protocol

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_context_assembler import ContextAssembler
from ensemble_context_markdown import ContextRegenerator, FindingsAppendService, ProgressAppendOnlyService
from ensemble_events import append_event
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_persona_memory import CandidatePatchWriter, MemoryRepository, PersonaLoader
from ensemble_skill_loader import resolve_persona_default_skills


@dataclass
class WorkerArtifact:
    artifact_id: str
    run_id: str
    iteration_id: str
    agent_id: str
    task: str
    summary: str
    content: str
    skill_ids: list[str]
    path: str
    satisfies_acceptance: bool = True
    force_fail: bool = False
    failure_reason: str | None = None
    risky_action_request: dict[str, Any] | None = None


@dataclass
class ValidationResult:
    passed: bool
    issues: list[dict[str, Any]]
    failure_reason: str | None


@dataclass
class RetryDecision:
    retry_index: int
    decision: str
    reason: str


@dataclass
class ReflectionResult:
    repeated_failure_pattern: str | None
    good_tool_choice: list[str]
    bad_tool_choice: list[str]
    memory_miss: bool
    candidate_procedural_patch: str | None
    candidate_episodic_summary: str | None
    candidate_patch_record: dict[str, Any] | None = None


class TaskDelegationAdapter:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)

    def prepare(self, *, packet: dict[str, Any]) -> dict[str, Any]:
        skill_summaries = resolve_persona_default_skills(self.workspace, packet["agent_id"])
        return {
            "packet": packet,
            "skill_refs": [skill["skill_id"] for skill in skill_summaries],
            "narrow_task": packet["current_step"] or packet["objective"],
        }


TaskToolSetAdapter = TaskDelegationAdapter


class SpecialistWorker(Protocol):
    def execute(self, packet: dict[str, Any], assignment: dict[str, Any], *, run_id: str, iteration_id: str) -> WorkerArtifact:
        ...


class DefaultSpecialistWorker:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.progress = ProgressAppendOnlyService(self.repository)

    def execute(self, packet: dict[str, Any], assignment: dict[str, Any], *, run_id: str, iteration_id: str) -> WorkerArtifact:
        artifact_id = f"artifact-{run_id}-{iteration_id}"
        artifact_dir = self.workspace / ".conitens" / "runtime" / "worker_artifacts"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "artifact_id": artifact_id,
            "run_id": run_id,
            "iteration_id": iteration_id,
            "agent_id": packet["agent_id"],
            "task": assignment["narrow_task"],
            "summary": f"Executed narrow task: {assignment['narrow_task']}",
            "content": f"task={assignment['narrow_task']}\nobjective={packet['objective']}\nskills={','.join(assignment['skill_refs'])}",
            "skill_ids": assignment["skill_refs"],
            "satisfies_acceptance": True,
        }
        target = artifact_dir / f"{artifact_id}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.progress.regenerate(run_id)
        self.progress.append_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="worker",
            summary=payload["summary"],
        )
        append_event(
            self.workspace,
            event_type="WORKER_EXECUTED",
            actor={"type": "agent", "name": packet["agent_id"]},
            scope={"run_id": run_id, "task_id": run_id, "correlation_id": run_id},
            payload={"artifact_id": artifact_id, "task": assignment["narrow_task"], "skills": assignment["skill_refs"]},
        )
        return WorkerArtifact(path=str(target), **payload)


class Validator:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        repository = LoopStateRepository(self.workspace)
        self.iterations = IterationService(repository)
        self.findings = FindingsAppendService(repository)
        self.progress = ProgressAppendOnlyService(repository)

    def evaluate(self, artifact: WorkerArtifact, done_when: list[str], *, run_id: str, iteration_id: str) -> ValidationResult:
        issues: list[dict[str, Any]] = []
        if artifact.force_fail:
            issues.append({"message": artifact.failure_reason or "forced failure"})
        for criterion in done_when:
            if criterion.startswith("artifact_contains:"):
                expected = criterion.split(":", 1)[1]
                if expected not in artifact.content:
                    issues.append({"message": f"artifact missing required content: {expected}"})
        passed = not issues and artifact.satisfies_acceptance
        failure_reason = issues[0]["message"] if issues else None
        self.progress.regenerate(run_id)
        if passed:
            self.iterations.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=True,
                issues=[],
                feedback_text="passed",
            )
            self.progress.append_entry(
                run_id=run_id,
                iteration_id=iteration_id,
                actor="validator",
                summary="Validator accepted the artifact",
            )
            append_event(
                self.workspace,
                event_type="VALIDATOR_PASSED",
                actor={"type": "agent", "name": "validator"},
                scope={"run_id": run_id, "task_id": run_id, "correlation_id": run_id},
                payload={"artifact_id": artifact.artifact_id},
            )
        else:
            self.iterations.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=False,
                issues=issues,
                feedback_text=failure_reason or "validation failed",
            )
            self.findings.append_entry(
                run_id=run_id,
                iteration_id=iteration_id,
                category="validation_issue",
                actor="validator",
                summary=failure_reason or "validation failed",
                details=json.dumps(issues, ensure_ascii=False),
            )
            self.progress.regenerate(run_id)
            self.progress.append_entry(
                run_id=run_id,
                iteration_id=iteration_id,
                actor="validator",
                summary=f"Validator failed: {failure_reason}",
            )
            append_event(
                self.workspace,
                event_type="VALIDATOR_FAILED",
                actor={"type": "agent", "name": "validator"},
                severity="error",
                scope={"run_id": run_id, "task_id": run_id, "correlation_id": run_id},
                payload={"artifact_id": artifact.artifact_id, "issues": issues},
            )
        return ValidationResult(passed=passed, issues=issues, failure_reason=failure_reason)


class RetryController:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)

    def decide(self, *, run_id: str, graph_kind: str, retry_count: int, validation: ValidationResult) -> RetryDecision:
        next_retry = retry_count + 1
        if next_retry == 1:
            decision = "same_worker_retry"
        elif next_retry == 2:
            decision = "planner_revise"
        elif next_retry == 3:
            decision = "specialist_swap"
        else:
            decision = "human_escalation"
        reason = validation.failure_reason or "validator failed"
        self.repository.append_retry_decision(
            run_id=run_id,
            graph_kind=graph_kind,
            retry_index=next_retry,
            decision=decision,
            reason=reason,
        )
        return RetryDecision(retry_index=next_retry, decision=decision, reason=reason)


class Reflector:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.memory = MemoryRepository(self.workspace)
        self.patch_writer = CandidatePatchWriter(self.workspace)
        self.progress = ProgressAppendOnlyService(LoopStateRepository(self.workspace))
        self.personas = PersonaLoader(self.workspace)

    def reflect(
        self,
        *,
        packet: dict[str, Any],
        artifact: WorkerArtifact,
        validation: ValidationResult,
        retry_decision: RetryDecision | None,
        run_id: str,
        iteration_id: str,
    ) -> ReflectionResult:
        failed = not validation.passed
        namespace = self.personas.load(packet["agent_id"])["memory_namespace"]
        self.memory.write_record(
            agent_id=packet["agent_id"],
            namespace=namespace,
            kind="reflection",
            summary=validation.failure_reason or artifact.summary,
            evidence_refs=[artifact.path],
            source_type="reflector",
            source_ref=run_id,
            auto=True,
        )
        self.memory.write_record(
            agent_id=packet["agent_id"],
            namespace=namespace,
            kind="episodic",
            summary=f"Worker artifact for {artifact.task}",
            evidence_refs=[artifact.path],
            source_type="worker",
            source_ref=run_id,
            auto=True,
        )
        patch_record = None
        patch_text = None
        if failed:
            patch_text = (
                "procedural_guidance:\n"
                f"  retry_decision: {retry_decision.decision if retry_decision else 'none'}\n"
                f"  validator_focus: {validation.failure_reason or 'validator failed'}\n"
            )
            patch_record = self.patch_writer.write_patch(
                agent_id=packet["agent_id"],
                namespace=namespace,
                patch_text=patch_text,
                source_ref=run_id,
                summary="candidate procedural patch",
            )
        self.progress.regenerate(run_id)
        self.progress.append_entry(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="reflector",
            summary=f"Reflection recorded for {retry_decision.decision if retry_decision else 'pass'}",
        )
        append_event(
            self.workspace,
            event_type="REFLECTION_RECORDED",
            actor={"type": "agent", "name": "reflector"},
            scope={"run_id": run_id, "task_id": run_id, "correlation_id": run_id},
            payload={"candidate_patch": bool(patch_record), "memory_miss": not bool(packet.get("episodic_memory_top_k"))},
        )
        return ReflectionResult(
            repeated_failure_pattern=validation.failure_reason if retry_decision and retry_decision.retry_index > 1 else None,
            good_tool_choice=artifact.skill_ids if validation.passed else [],
            bad_tool_choice=artifact.skill_ids if failed else [],
            memory_miss=not bool(packet.get("episodic_memory_top_k")),
            candidate_procedural_patch=patch_text,
            candidate_episodic_summary=f"Worker artifact for {artifact.task}",
            candidate_patch_record=patch_record,
        )


class IterativeBuildLoop:
    def __init__(
        self,
        workspace: str | Path,
        *,
        worker: SpecialistWorker | None = None,
        validator: Validator | None = None,
        retry_controller: RetryController | None = None,
        reflector: Reflector | None = None,
        delegation_adapter: TaskDelegationAdapter | None = None,
    ):
        self.workspace = Path(workspace)
        self.repository = LoopStateRepository(self.workspace)
        self.delegation = delegation_adapter or TaskDelegationAdapter(self.workspace)
        self.worker = worker or DefaultSpecialistWorker(self.workspace)
        self.validator = validator or Validator(self.workspace)
        self.retry_controller = retry_controller or RetryController(self.workspace)
        self.reflector = reflector or Reflector(self.workspace)
        self.progress = ProgressAppendOnlyService(self.repository)
        self.approvals = ApprovalInterruptAdapter(self.workspace)

    def run(
        self,
        run_id: str,
        *,
        agent_id: str,
        state=None,
        approved_request: dict[str, Any] | None = None,
    ) -> Any:
        if state is None:
            plan = self.repository.get_task_plan(run_id)
            if plan is None:
                raise ValueError(f"No task plan for run: {run_id}")
            iterations = self.repository.list_iterations(run_id)
            if not iterations:
                raise ValueError(f"No iteration found for run: {run_id}")
            active_task = None
            for step in plan.get("steps_json", []):
                status = str(step.get("status", "pending")).lower()
                if status not in {"completed", "done", "cancelled", "skipped"}:
                    active_task = step.get("title")
                    break
            state = SimpleNamespace(
                run_id=run_id,
                graph_kind="build",
                agent_id=agent_id,
                objective=plan["objective"],
                current_step=active_task,
                current_task=active_task,
                done_when=list(plan.get("acceptance_json", [])),
                retry_count=0,
                validator_issues=[],
                retry_decisions=[],
                approval_pending=False,
                pending_approval_request_id=None,
                stop_reason=None,
                cost_metrics={},
                tool_whitelist=[],
                last_artifact=None,
            )
            packet_bundle = ContextAssembler(self.workspace).assemble(agent_id=agent_id, run_id=run_id)
            state.cost_metrics["packet"] = packet_bundle["packet"]
        if not hasattr(state, "pending_approval_request_id"):
            state.pending_approval_request_id = None
        next_approved_request = approved_request
        while True:
            result = self.run_once(
                packet=state.cost_metrics["packet"],
                run_id=state.run_id,
                iteration_id=self._iteration_id(state.run_id),
                graph_kind=state.graph_kind,
                current_retry_count=state.retry_count,
                approved_request=next_approved_request,
            )
            next_approved_request = None
            artifact = result["artifact"]
            if artifact is not None:
                state.last_artifact = asdict(artifact)
            approval_request = result.get("approval_request")
            if approval_request is not None:
                state.approval_pending = True
                state.pending_approval_request_id = approval_request["request_id"]
                state.current_step = "approval_pending"
                return state
            validation = result["validation"]
            decision = result["retry_decision"]
            reflection = result["reflection"]
            state.validator_issues = list(validation.issues)
            if validation.passed:
                state.validator_issues = []
                state.approval_pending = False
                state.pending_approval_request_id = None
                state.stop_reason = "verified"
                state.current_step = "completed"
                self._capture_reflection_metrics(state, reflection)
                ContextRegenerator(self.repository).regenerate_all(state.run_id)
                return state
            if decision is None:
                raise ValueError("retry decision missing on failed validation")
            self.progress.regenerate(state.run_id)
            self.progress.append_entry(
                run_id=state.run_id,
                iteration_id=self._iteration_id(state.run_id),
                actor="retry-controller",
                summary=f"Retry decision: {decision.decision}",
            )
            state.retry_count = decision.retry_index
            state.retry_decisions.append({"retry_index": decision.retry_index, "action": decision.decision, "reason": decision.reason})
            if decision.decision == "same_worker_retry":
                if decision.retry_index != 1:
                    raise ValueError("same_worker_retry is only valid for the first retry")
                continue
            self._capture_reflection_metrics(state, reflection)
            if decision.decision == "planner_revise":
                state.current_step = "planner_revise"
                state.approval_pending = False
                state.pending_approval_request_id = None
                state.stop_reason = None
            elif decision.decision == "specialist_swap":
                state.current_step = "specialist_swap"
                state.approval_pending = False
                state.pending_approval_request_id = None
                state.stop_reason = None
            else:
                state.current_step = "human_escalation"
                state.approval_pending = False
                state.pending_approval_request_id = None
                state.stop_reason = "escalated"
            ContextRegenerator(self.repository).regenerate_all(state.run_id)
            return state

    def run_once(
        self,
        *,
        packet: dict[str, Any],
        run_id: str,
        iteration_id: str,
        graph_kind: str = "build",
        current_retry_count: int = 0,
        approved_request: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        assignment = self.delegation.prepare(packet=packet)
        artifact = self._execute_worker(
            packet,
            assignment,
            run_id=run_id,
            iteration_id=iteration_id,
            approved_request=approved_request,
        )
        if artifact.risky_action_request:
            action_type = artifact.risky_action_request["action_type"]
            action_payload = artifact.risky_action_request.get("action_payload", {})
            if approved_request is not None:
                raise ValueError(f"Worker requested approval again after approval for action: {action_type}")
            classification = self.approvals.classify(action_type, action_payload)
            if not classification["requires_approval"]:
                auto_request = {
                    "request_id": None,
                    "run_id": run_id,
                    "iteration_id": iteration_id,
                    "actor": packet["agent_id"],
                    "action_type": action_type,
                    "action_payload": classification["action_payload"],
                    "risk_level": classification["risk_level"],
                    "status": "approved",
                    "reviewer": "policy",
                    "reviewer_note": "approval not required by policy",
                }
                artifact = self._execute_worker(
                    packet,
                    assignment,
                    run_id=run_id,
                    iteration_id=iteration_id,
                    approved_request=auto_request,
                )
                if artifact.risky_action_request:
                    raise ValueError(f"Worker did not honor auto-approved action: {action_type}")
            else:
                request = self.approvals.enqueue_request(
                    run_id=run_id,
                    iteration_id=iteration_id,
                    actor=packet["agent_id"],
                    action_type=action_type,
                    action_payload=action_payload,
                )
                return {
                    "artifact": artifact,
                    "validation": None,
                    "retry_decision": None,
                    "reflection": None,
                    "approval_request": request,
                }
        validation = self.validator.evaluate(
            artifact,
            packet.get("done_when", []),
            run_id=run_id,
            iteration_id=iteration_id,
        )
        if validation.passed:
            reflection = self.reflector.reflect(
                packet=packet,
                artifact=artifact,
                validation=validation,
                retry_decision=None,
                run_id=run_id,
                iteration_id=iteration_id,
            )
            return {
                "artifact": artifact,
                "validation": validation,
                "retry_decision": None,
                "reflection": reflection,
            }
        decision = self.retry_controller.decide(
            run_id=run_id,
            graph_kind=graph_kind,
            retry_count=current_retry_count,
            validation=validation,
        )
        reflection = self.reflector.reflect(
            packet=packet,
            artifact=artifact,
            validation=validation,
            retry_decision=decision,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        return {
            "artifact": artifact,
            "validation": validation,
            "retry_decision": decision,
            "reflection": reflection,
            "approval_request": None,
        }

    def _execute_worker(
        self,
        packet: dict[str, Any],
        assignment: dict[str, Any],
        *,
        run_id: str,
        iteration_id: str,
        approved_request: dict[str, Any] | None = None,
    ) -> WorkerArtifact:
        packet_payload = dict(packet)
        assignment_payload = dict(assignment)
        if approved_request is not None:
            normalized_request = dict(approved_request)
            if "action_payload" not in normalized_request and "action_payload_json" in normalized_request:
                normalized_request["action_payload"] = normalized_request["action_payload_json"]
            packet_payload["approved_action"] = normalized_request
            assignment_payload["approved_action"] = normalized_request
        try:
            artifact = self.worker.execute(
                packet_payload,
                assignment_payload,
                run_id=run_id,
                iteration_id=iteration_id,
                approved_request=approved_request,
            )
        except TypeError as exc:
            if not self._is_signature_mismatch(exc):
                raise
            try:
                artifact = self.worker.execute(
                    packet_payload,
                    assignment_payload,
                    run_id=run_id,
                    iteration_id=iteration_id,
                )
            except TypeError as fallback_exc:
                if not self._is_signature_mismatch(fallback_exc):
                    raise
                artifact = self.worker.execute(packet_payload, assignment_payload)
        if isinstance(artifact, WorkerArtifact):
            return artifact
        payload = dict(artifact)
        payload.setdefault("artifact_id", f"artifact-{run_id}-{iteration_id}")
        payload.setdefault("run_id", run_id)
        payload.setdefault("iteration_id", iteration_id)
        payload.setdefault("agent_id", packet_payload["agent_id"])
        payload.setdefault("task", assignment_payload["narrow_task"])
        payload.setdefault("summary", f"Executed narrow task: {assignment_payload['narrow_task']}")
        payload.setdefault("content", payload.get("summary", ""))
        payload.setdefault("skill_ids", assignment_payload["skill_refs"])
        payload.setdefault("path", "")
        payload.setdefault("risky_action_request", None)
        return WorkerArtifact(**payload)

    def _is_signature_mismatch(self, exc: TypeError) -> bool:
        message = str(exc)
        markers = (
            "unexpected keyword argument",
            "positional argument",
            "required positional argument",
            "got multiple values for argument",
        )
        return any(marker in message for marker in markers)

    def _iteration_id(self, run_id: str) -> str:
        snapshot = self.repository.load_run_snapshot(run_id)
        latest = snapshot.get("latest_iteration")
        if latest is None:
            raise ValueError(f"No iteration found for run: {run_id}")
        return latest["iteration_id"]

    def _capture_reflection_metrics(self, state: Any, reflection: ReflectionResult | None) -> None:
        if reflection is None:
            return
        state.cost_metrics["reflection"] = {
            "memory_miss": reflection.memory_miss,
            "candidate_patch": bool(reflection.candidate_patch_record),
        }


IterativeExecutionLoop = IterativeBuildLoop


__all__ = [
    "DefaultSpecialistWorker",
    "IterativeBuildLoop",
    "IterativeExecutionLoop",
    "Reflector",
    "RetryController",
    "SpecialistWorker",
    "TaskDelegationAdapter",
    "TaskToolSetAdapter",
    "Validator",
    "ValidationResult",
    "WorkerArtifact",
]
