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
      {summary.evidence ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Evidence health</p>
              <h3>Provider telemetry projection</h3>
            </div>
            <span className={`forward-state ${summary.evidence.posture === "danger" ? "state-error" : summary.evidence.posture === "warning" ? "state-loading" : "state-ready"}`}>
              {summary.evidence.posture}
            </span>
          </div>
          <div className="forward-stats">
            {summary.evidence.metrics.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
          <ul className="forward-timeline">
            {summary.evidence.notes.map((item) => (
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
      ) : null}
      {summary.doctor ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Doctor evidence</p>
              <h3>Install and runtime posture</h3>
            </div>
            <span className={`forward-state ${summary.doctor.posture === "danger" ? "state-error" : summary.doctor.posture === "warning" ? "state-loading" : "state-ready"}`}>
              {summary.doctor.posture}
            </span>
          </div>
          <ul className="forward-timeline">
            {summary.doctor.checks.slice(0, 5).map((check) => (
              <li key={check.id}>
                <div className="forward-timeline-topline">
                  <strong>{check.label}</strong>
                  <span>{check.status}</span>
                </div>
                <p>{check.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {summary.runtimeRoster ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Runtime roster</p>
              <h3>External CLI availability</h3>
            </div>
            <span className={`forward-state ${summary.runtimeRoster.posture === "danger" ? "state-error" : summary.runtimeRoster.posture === "warning" ? "state-loading" : "state-ready"}`}>
              {summary.runtimeRoster.posture}
            </span>
          </div>
          <div className="forward-stats">
            {summary.runtimeRoster.metrics.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
          <ul className="forward-timeline">
            {summary.runtimeRoster.runtimes.slice(0, 6).map((runtime) => (
              <li key={runtime.id}>
                <div className="forward-timeline-topline">
                  <strong>{runtime.label}</strong>
                  <span>{runtime.sessionLabel}</span>
                </div>
                <p>
                  {runtime.detail}
                  {runtime.version ? ` | ${runtime.version}` : ""}
                  {runtime.latestRunId ? ` | latest ${runtime.latestRunId}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <p className="forward-help">{summary.runtimeRoster.privacyNote}</p>
        </section>
      ) : null}
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
