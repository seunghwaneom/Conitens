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

export interface OperatorSummaryViewModel {
  postureLabel: string;
  latestRunLabel: string;
  metrics: OperatorSummaryMetric[];
  attention: OperatorSummaryAttentionItem[];
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
  if (attention.length === 0) {
    attention.push({
      id: "attention-clear",
      tone: "info",
      title: "No immediate operator blockers detected",
      detail: "Use runs and replay to inspect execution traces in more detail.",
    });
  }

  return {
    postureLabel:
      summary.approvals.pending > 0 || summary.validation.failing_runs > 0 || summary.handoffs.blocked > 0
        ? "attention required"
        : "stable",
    latestRunLabel:
      summary.runs.latest_run_id && summary.runs.latest_status
        ? `${summary.runs.latest_run_id} | ${summary.runs.latest_status}`
        : "No runs recorded yet",
    metrics,
    attention,
  };
}
