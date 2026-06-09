import type {
  ForwardOperatorWakeReadinessCandidate,
  ForwardOperatorWakeReadinessResponse,
  ForwardOperatorWakeReadinessValue,
} from "./forward-bridge.js";
import { buildForwardRoute } from "./forward-route.ts";

export interface OperatorWakeReadinessMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface OperatorWakeReadinessCandidateViewModel {
  id: string;
  subjectLabel: string;
  readiness: ForwardOperatorWakeReadinessValue;
  tone: "info" | "warning" | "danger";
  confidenceLabel: string;
  runtimeLabel: string;
  turnLabel: string;
  blockersLabel: string;
  actionLabel: string;
  targetHash: string;
}

export interface OperatorWakeReadinessViewModel {
  generatedAt: string;
  posture: "ok" | "warning" | "danger";
  summary: string;
  metrics: OperatorWakeReadinessMetric[];
  candidates: OperatorWakeReadinessCandidateViewModel[];
  sourceLabel: string;
  contractLabel: string;
  privacyLabel: string;
}

function readinessTone(readiness: ForwardOperatorWakeReadinessValue): OperatorWakeReadinessCandidateViewModel["tone"] {
  if (readiness === "hold") {
    return "danger";
  }
  if (readiness === "ready") {
    return "info";
  }
  return "warning";
}

function targetHash(candidate: ForwardOperatorWakeReadinessCandidate): string {
  if (candidate.subject_type === "task") {
    return buildForwardRoute({
      screen: "task-detail",
      taskId: candidate.subject_id,
      runId: null,
      workspaceId: null,
      threadId: null,
      agentId: null,
    });
  }
  if (candidate.subject_type === "run") {
    return buildForwardRoute({
      screen: "run-detail",
      runId: candidate.subject_id,
      taskId: null,
      workspaceId: null,
      threadId: null,
      agentId: null,
    });
  }
  const linkedRunId = typeof candidate.linked_refs.run_id === "string" ? candidate.linked_refs.run_id : null;
  return linkedRunId
    ? buildForwardRoute({
        screen: "run-detail",
        runId: linkedRunId,
        taskId: null,
        workspaceId: null,
        threadId: null,
        agentId: null,
      })
    : buildForwardRoute({
        screen: "overview",
        runId: null,
        taskId: null,
        workspaceId: null,
        threadId: null,
        agentId: null,
      });
}

function candidateView(candidate: ForwardOperatorWakeReadinessCandidate): OperatorWakeReadinessCandidateViewModel {
  const blockers = candidate.blockers.length > 0 ? candidate.blockers.join(" | ") : "No blockers projected";
  const action =
    candidate.suggested_actions.length > 0
      ? candidate.suggested_actions[0]
      : "No operator action suggested by this read-only projection.";
  return {
    id: candidate.decision_id,
    subjectLabel: `${candidate.subject_type}:${candidate.subject_id}`,
    readiness: candidate.readiness,
    tone: readinessTone(candidate.readiness),
    confidenceLabel: `${candidate.confidence_level} confidence`,
    runtimeLabel: candidate.preferred_agent_runtime ?? "no preferred runtime",
    turnLabel: `${candidate.turn_summary.records} turn records, ${candidate.evidence_refs.length} refs`,
    blockersLabel: blockers,
    actionLabel: action,
    targetHash: targetHash(candidate),
  };
}

export function toOperatorWakeReadinessViewModel(
  payload: ForwardOperatorWakeReadinessResponse,
): OperatorWakeReadinessViewModel {
  const cautionCount =
    payload.counts.needs_review +
    payload.counts.attention +
    payload.counts.wait_for_runtime +
    payload.counts.needs_context;
  const posture = payload.counts.hold > 0 ? "danger" : cautionCount > 0 ? "warning" : "ok";
  const runtime = payload.source_projections.runtime_roster.preferred_agent_runtime ?? "no preferred runtime";
  const contractIntact =
    payload.wake_contract.read_only &&
    !payload.wake_contract.scheduler_started &&
    !payload.wake_contract.wake_messages_sent &&
    !payload.wake_contract.task_status_mutated &&
    !payload.wake_contract.run_status_mutated &&
    !payload.wake_contract.room_status_mutated &&
    !payload.wake_contract.provider_auth_commands_executed &&
    !payload.wake_contract.external_fetch_performed;
  return {
    generatedAt: payload.generated_at,
    posture,
    summary:
      payload.counts.returned === 0
        ? "No wake candidates are currently projected."
        : `${payload.counts.ready} ready, ${payload.counts.hold} held, ${cautionCount} needing review.`,
    metrics: [
      {
        id: "wake-ready",
        label: "Ready",
        value: String(payload.counts.ready),
        detail: `${payload.counts.returned} returned from ${payload.counts.total} status subjects`,
      },
      {
        id: "wake-review",
        label: "Review",
        value: String(cautionCount),
        detail: "Needs review, stale, runtime wait, or missing context",
      },
      {
        id: "wake-hold",
        label: "Hold",
        value: String(payload.counts.hold),
        detail: "Pending approval or blocked evidence",
      },
      {
        id: "wake-runtime",
        label: "Runtime",
        value: runtime,
        detail: `${payload.source_projections.runtime_roster.observed_agent_runtimes.length} observed agent runtime${payload.source_projections.runtime_roster.observed_agent_runtimes.length === 1 ? "" : "s"}`,
      },
    ],
    candidates: payload.candidates.map(candidateView),
    sourceLabel: `status ${payload.source_projections.status_confidence.returned}/${payload.source_projections.status_confidence.total} | turns ${payload.source_projections.turn_records.returned}/${payload.source_projections.turn_records.total}`,
    contractLabel: contractIntact ? "read-only contract intact" : "contract needs review",
    privacyLabel: payload.privacy.detail,
  };
}
