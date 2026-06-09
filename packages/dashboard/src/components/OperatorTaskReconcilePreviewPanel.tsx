import type { OperatorTaskReconcilePreviewViewModel } from "../operator-reconciler-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorTaskReconcilePreviewPanelProps {
  preview: OperatorTaskReconcilePreviewViewModel | null;
  state: PanelState;
  error: string | null;
}

export function OperatorTaskReconcilePreviewPanel({
  preview,
  state,
  error,
}: OperatorTaskReconcilePreviewPanelProps) {
  if (state === "loading") {
    return <p className="forward-empty">Loading reconcile preview...</p>;
  }
  if (state === "error") {
    return <p className="forward-error">{error}</p>;
  }
  if (!preview) {
    return null;
  }
  const stateClass =
    preview.tone === "danger" ? "state-error" : preview.tone === "warning" ? "state-loading" : "state-ready";

  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Reconciler preview</p>
          <h3>Evidence-based task posture</h3>
        </div>
        <span className={`forward-state ${stateClass}`}>
          {preview.confidence} confidence
        </span>
      </div>
      <div className="forward-stats">
        <div>
          <span>Current</span>
          <strong>{preview.currentStatus}</strong>
        </div>
        <div>
          <span>Recommended</span>
          <strong>{preview.recommendedStatus}</strong>
        </div>
        <div>
          <span>Approval</span>
          <strong>{preview.requiresApproval ? "required" : "clear"}</strong>
        </div>
        <div>
          <span>Evidence refs</span>
          <strong>{preview.evidenceRefs.length}</strong>
        </div>
      </div>
      <p className="forward-help">{preview.summary}</p>
      <ul className="forward-timeline">
        <li>
          <div className="forward-timeline-topline">
            <strong>Blockers</strong>
            <span>{preview.blockers.length}</span>
          </div>
          <p>{preview.blockers.length > 0 ? preview.blockers.join(" | ") : "No blocking linked evidence detected."}</p>
        </li>
        <li>
          <div className="forward-timeline-topline">
            <strong>Suggested actions</strong>
            <span>{preview.suggestedActions.length}</span>
          </div>
          <p>{preview.suggestedActions.length > 0 ? preview.suggestedActions.join(" | ") : "No operator action suggested."}</p>
        </li>
      </ul>
    </section>
  );
}
