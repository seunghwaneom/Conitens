import type { OperatorSummaryViewModel } from "../operator-summary-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorSummaryPanelProps {
  summary: OperatorSummaryViewModel | null;
  state: PanelState;
  error: string | null;
}

export function OperatorSummaryPanel({ summary, state, error }: OperatorSummaryPanelProps) {
  if (state === "loading") {
    return <p className="forward-empty">Loading operator summary...</p>;
  }
  if (state === "error") {
    return <p className="forward-error">{error}</p>;
  }
  if (state === "idle" || !summary) {
    return (
      <div className="forward-placeholder">
        <h3>Operator overview placeholder</h3>
        <p>Connect to a live bridge to load the current operator posture.</p>
      </div>
    );
  }

  return (
    <div className="forward-detail-body">
      <div className="forward-detail-hero">
        <div>
          <p className="forward-detail-label">Operator posture</p>
          <h3>Forward operator overview</h3>
          <p>{summary.latestRunLabel}</p>
        </div>
        <span className="forward-status-pill">{summary.postureLabel}</span>
      </div>
      <div className="forward-stats">
        {summary.metrics.map((item) => (
          <div key={item.id}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Attention</p>
            <h3>What needs action now</h3>
          </div>
        </div>
        <ul className="forward-timeline">
          {summary.attention.map((item) => (
            <li key={item.id}>
              <div className="forward-timeline-topline">
                <strong>{item.title}</strong>
                <span>{item.tone}</span>
              </div>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
