import type { ForwardOperatorTaskReconcilePreviewResponse } from "./forward-bridge.js";

export interface OperatorTaskReconcilePreviewViewModel {
  taskId: string;
  decisionId: string;
  generatedAt: string;
  currentStatus: string;
  recommendedStatus: string;
  confidence: "low" | "medium" | "high";
  tone: "info" | "warning" | "danger";
  summary: string;
  requiresApproval: boolean;
  blockers: string[];
  suggestedActions: string[];
  evidenceRefs: string[];
}

export function toOperatorTaskReconcilePreview(
  response: ForwardOperatorTaskReconcilePreviewResponse,
): OperatorTaskReconcilePreviewViewModel {
  const tone =
    response.blockers.length > 0
      ? "danger"
      : response.requires_approval
        ? "warning"
        : "info";
  return {
    taskId: response.task_id,
    decisionId: response.decision_id,
    generatedAt: response.generated_at,
    currentStatus: response.current_status.replaceAll("_", " "),
    recommendedStatus: response.recommended_status.replaceAll("_", " "),
    confidence: response.confidence,
    tone,
    summary: response.summary,
    requiresApproval: response.requires_approval,
    blockers: response.blockers,
    suggestedActions: response.suggested_actions,
    evidenceRefs: response.evidence_refs,
  };
}
