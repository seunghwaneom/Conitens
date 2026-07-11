import type { ForwardOperatorSummaryResponse } from "./forward-bridge.js";

export interface OperatorSummaryMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface OperatorSummaryAttentionItem {
  id: string;
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
}

export interface OperatorEvidenceSummaryViewModel {
  posture: "ok" | "warning" | "danger";
  metrics: OperatorSummaryMetric[];
  notes: OperatorSummaryAttentionItem[];
}

export interface OperatorDoctorEvidenceViewModel {
  posture: "ok" | "warning" | "danger";
  generatedAt: string;
  checks: Array<{
    id: string;
    label: string;
    status: "ok" | "warning" | "danger";
    detail: string;
    evidenceRef: string;
  }>;
}

export interface OperatorRuntimeRosterViewModel {
  posture: "ok" | "warning" | "danger";
  metrics: OperatorSummaryMetric[];
  runtimes: Array<{
    id: string;
    label: string;
    category: "agent_runtime" | "toolchain";
    availability: "ok" | "warning" | "danger";
    session: "observed" | "available_not_observed" | "not_found";
    detail: string;
    version: string | null;
    latestRunId: string | null;
    evidenceCount: number;
    sessionLabel: string;
  }>;
  privacyNote: string;
}

export interface OperatorSummaryViewModel {
  postureLabel: string;
  latestRunLabel: string;
  metrics: OperatorSummaryMetric[];
  attention: OperatorSummaryAttentionItem[];
  evidence: OperatorEvidenceSummaryViewModel | null;
  doctor: OperatorDoctorEvidenceViewModel | null;
  runtimeRoster: OperatorRuntimeRosterViewModel | null;
}

export function toOperatorSummaryViewModel(
  summary: ForwardOperatorSummaryResponse,
): OperatorSummaryViewModel {
  const metrics: OperatorSummaryMetric[] = [
    {
      id: "runs-active",
      label: "Active runs",
      value: String(summary.runs.active),
      detail: `${summary.runs.total} total tracked runs`,
    },
    {
      id: "approvals-pending",
      label: "Pending approvals",
      value: String(summary.approvals.pending),
      detail: `${summary.runs.awaiting_approval} runs waiting on approval`,
    },
    {
      id: "validation-failures",
      label: "Failing runs",
      value: String(summary.validation.failing_runs),
      detail: `${summary.runs.with_failures} runs have latest validator failure`,
    },
    {
      id: "rooms-active",
      label: "Active rooms",
      value: String(summary.rooms.active),
      detail: `${summary.rooms.review} review rooms currently tracked`,
    },
    {
      id: "handoffs-open",
      label: "Open handoffs",
      value: String(summary.handoffs.open),
      detail: `${summary.handoffs.blocked} blocked handoffs`,
    },
  ];

  const attention: OperatorSummaryAttentionItem[] = [];
  if (summary.approvals.pending > 0) {
    attention.push({
      id: "attention-approvals",
      tone: "warning",
      title: "Pending approvals require operator review",
      detail: `${summary.approvals.pending} approval items are open across ${summary.runs.awaiting_approval} runs.`,
    });
  }
  if (summary.validation.failing_runs > 0) {
    attention.push({
      id: "attention-validation",
      tone: "danger",
      title: "Validator failures are blocking completion",
      detail: summary.validation.latest_failure_reason ?? "Review the latest failing run and validator history.",
    });
  }
  if (summary.handoffs.blocked > 0) {
    attention.push({
      id: "attention-handoffs",
      tone: "warning",
      title: "Blocked handoffs need routing attention",
      detail: `${summary.handoffs.blocked} handoff packets are currently blocked.`,
    });
  }

  const evidence = summary.evidence
    ? {
        posture:
          summary.evidence.sensitivity.raw_content_exposed ||
          summary.evidence.harness.raw_transcript_exposed ||
          summary.evidence.sensitivity.pii_findings > 0
            ? "danger" as const
            : summary.evidence.provider_calls.observed === 0 && summary.evidence.harness.observed === 0
              ? "warning" as const
              : "ok" as const,
        metrics: [
          {
            id: "provider-observed",
            label: "Telemetry records",
            value: String(summary.evidence.provider_calls.observed),
            detail: `${summary.evidence.budget.sources} checkpoint source${summary.evidence.budget.sources === 1 ? "" : "s"}`,
          },
          {
            id: "provider-tokens",
            label: "Tokens",
            value: summary.evidence.provider_calls.total_tokens == null
              ? "n/a"
              : String(summary.evidence.provider_calls.total_tokens),
            detail: `${summary.evidence.provider_calls.with_tokens} source${summary.evidence.provider_calls.with_tokens === 1 ? "" : "s"} include token counts`,
          },
          {
            id: "provider-cost",
            label: "Cost",
            value: summary.evidence.provider_calls.estimated_cost == null
              ? "n/a"
              : `$${summary.evidence.provider_calls.estimated_cost.toFixed(4)}`,
            detail: `${summary.evidence.provider_calls.with_cost} source${summary.evidence.provider_calls.with_cost === 1 ? "" : "s"} include cost`,
          },
          {
            id: "provider-pii",
            label: "PII findings",
            value: String(summary.evidence.sensitivity.pii_findings),
            detail: summary.evidence.sensitivity.redaction,
          },
          {
            id: "harness-observed",
            label: "Harness evidence",
            value: String(summary.evidence.harness.observed),
            detail: `${summary.evidence.budget.harness_sources} metadata-only source${summary.evidence.budget.harness_sources === 1 ? "" : "s"}`,
          },
        ],
        notes: [
          {
            id: "evidence-provider",
            tone: summary.evidence.provider_calls.observed === 0 ? "warning" as const : "info" as const,
            title: summary.evidence.provider_calls.observed === 0
              ? "Provider-call telemetry is not populated yet"
              : "Provider-call telemetry is projected from loop evidence",
            detail: summary.evidence.provider_calls.latest_provider || summary.evidence.provider_calls.latest_model
              ? [summary.evidence.provider_calls.latest_provider, summary.evidence.provider_calls.latest_model].filter(Boolean).join(" | ")
              : "This first slice stays projection-only and does not introduce a provider proxy.",
          },
          {
            id: "evidence-harness",
            tone: summary.evidence.harness.raw_transcript_exposed
              ? "danger" as const
              : summary.evidence.harness.observed === 0
                ? "warning" as const
                : "info" as const,
            title: summary.evidence.harness.observed === 0
              ? "No terminal harness evidence observed yet"
              : "GJC harness evidence is metadata-only",
            detail: summary.evidence.harness.latest_summary
              ?? summary.evidence.harness.latest_runtime
              ?? "GJC transcripts stay outside the control-plane state model.",
          },
        ],
      }
    : null;
  const doctor = summary.doctor
    ? {
        posture: summary.doctor.status,
        generatedAt: summary.doctor.generated_at,
        checks: summary.doctor.checks.map((check) => ({
          id: check.id,
          label: check.label,
          status: check.status,
          detail: check.detail,
          evidenceRef: check.evidence_ref,
        })),
      }
    : null;
  const runtimeRoster = summary.runtime_roster
    ? {
        posture: summary.runtime_roster.status,
        metrics: [
          {
            id: "runtime-agent-count",
            label: "Agent runtimes",
            value: String(summary.runtime_roster.counts.agent_runtimes),
            detail: `${summary.runtime_roster.counts.missing_agent_runtimes} missing from PATH`,
          },
          {
            id: "runtime-available",
            label: "Available",
            value: String(summary.runtime_roster.counts.available),
            detail: `${summary.runtime_roster.counts.total} total runtime/tool entries`,
          },
          {
            id: "runtime-observed",
            label: "Observed",
            value: String(summary.runtime_roster.counts.observed),
            detail: "Provider evidence seen in orchestration checkpoints",
          },
        ],
        runtimes: summary.runtime_roster.runtimes.map((runtime) => ({
          id: runtime.id,
          label: runtime.label,
          category: runtime.category,
          availability: runtime.availability_status,
          session: runtime.session_status,
          detail: runtime.detail,
          version: runtime.version,
          latestRunId: runtime.latest_run_id,
          evidenceCount: runtime.evidence_refs.length,
          sessionLabel:
            runtime.session_status === "observed"
              ? "checkpoint evidence"
              : runtime.session_status === "available_not_observed"
                ? "available, no evidence"
                : "not found",
        })),
        privacyNote: summary.runtime_roster.privacy.detail,
      }
    : null;

  if (doctor && doctor.posture !== "ok") {
    attention.push({
      id: "attention-doctor",
      tone: doctor.posture === "danger" ? "danger" : "warning",
      title: "Doctor evidence needs review",
      detail: "Install/runtime checks are not fully green; inspect the doctor evidence section before treating the shell as healthy.",
    });
  }
  if (runtimeRoster && runtimeRoster.posture !== "ok") {
    attention.push({
      id: "attention-runtime-roster",
      tone: runtimeRoster.posture === "danger" ? "danger" : "warning",
      title: "Runtime roster has availability gaps",
      detail: "One or more external runtimes are missing or only available without checkpoint evidence.",
    });
  }
  if (attention.length === 0) {
    attention.push({
      id: "attention-clear",
      tone: "info",
      title: "No immediate operator blockers detected",
      detail: "Use runs and replay to inspect execution traces in more detail.",
    });
  }

  const workflowAttention =
    summary.approvals.pending > 0 || summary.validation.failing_runs > 0 || summary.handoffs.blocked > 0;
  const runtimeAttention =
    (doctor?.posture && doctor.posture !== "ok") || (runtimeRoster?.posture && runtimeRoster.posture !== "ok");

  return {
    postureLabel:
      workflowAttention
        ? "attention required"
        : runtimeAttention
          ? "runtime attention"
        : "stable",
    latestRunLabel:
      summary.runs.latest_run_id && summary.runs.latest_status
        ? `${summary.runs.latest_run_id} | ${summary.runs.latest_status}`
        : "No runs recorded yet",
    metrics,
    attention,
    evidence,
    doctor,
    runtimeRoster,
  };
}
