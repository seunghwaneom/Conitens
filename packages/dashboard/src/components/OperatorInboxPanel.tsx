import type { OperatorInboxItemViewModel } from "../operator-inbox-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorInboxPanelProps {
  items: OperatorInboxItemViewModel[];
  state: PanelState;
  error: string | null;
}

export function OperatorInboxPanel({ items, state, error }: OperatorInboxPanelProps) {
  if (state === "loading") {
    return <p className="forward-empty">Loading operator inbox...</p>;
  }
  if (state === "error") {
    return <p className="forward-error">{error}</p>;
  }
  if (state === "idle") {
    return (
      <div className="forward-placeholder">
        <h3>Operator inbox placeholder</h3>
        <p>Connect to a live bridge to load actionable operator attention items.</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="forward-placeholder">
        <h3>Inbox is clear</h3>
        <p>No approvals, validator failures, blocked handoffs, or stale runs are currently projected.</p>
      </div>
    );
  }

  return (
    <div className="forward-detail-body">
      <div className="forward-detail-hero">
        <div>
          <p className="forward-detail-label">Operator inbox</p>
          <h3>Action queue</h3>
          <p>{items.length} projected attention item{items.length === 1 ? "" : "s"}</p>
        </div>
        <span className="forward-status-pill">attention</span>
      </div>
      <div className="forward-run-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`forward-run-item active tone-${item.tone}`}
            onClick={() => {
              window.location.hash = item.targetHash;
            }}
          >
            <div className="forward-run-topline">
              <strong>{item.title}</strong>
              <span>{item.tone}</span>
            </div>
            <p>{item.detail}</p>
            <div className="forward-metric-row">
              <span>{item.meta}</span>
              <span>{item.actionLabel}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
