import type { OperatorWakeReadinessViewModel } from "../operator-wake-readiness-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorWakeReadinessPanelProps {
  readiness: OperatorWakeReadinessViewModel | null;
  state: PanelState;
  error: string | null;
}

function stateClass(posture: OperatorWakeReadinessViewModel["posture"]): string {
  if (posture === "danger") {
    return "state-error";
  }
  if (posture === "warning") {
    return "state-loading";
  }
  return "state-ready";
}

export function OperatorWakeReadinessPanel({
  readiness,
  state,
  error,
}: OperatorWakeReadinessPanelProps) {
  if (state === "idle") {
    return null;
  }
  if (state === "loading") {
    return (
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Wake readiness</p>
            <h3>Loading read-only wake posture</h3>
          </div>
        </div>
        <p className="forward-empty">Combining status, turn, and runtime projections...</p>
      </section>
    );
  }
  if (state === "error") {
    return (
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Wake readiness</p>
            <h3>Projection unavailable</h3>
          </div>
        </div>
        <p className="forward-error">{error}</p>
      </section>
    );
  }
  if (!readiness) {
    return null;
  }

  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Wake readiness</p>
          <h3>Read-only wake candidates</h3>
        </div>
        <span className={`forward-state ${stateClass(readiness.posture)}`}>
          {readiness.posture}
        </span>
      </div>
      <p className="forward-help">{readiness.summary}</p>
      <div className="forward-stats">
        {readiness.metrics.map((metric) => (
          <div key={metric.id}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </div>
      {readiness.candidates.length === 0 ? (
        <p className="forward-empty">No task, run, or room subjects are currently projected as wake candidates.</p>
      ) : (
        <ul className="forward-timeline">
          {readiness.candidates.slice(0, 8).map((candidate) => (
            <li key={candidate.id}>
              <div className="forward-timeline-topline">
                <strong>{candidate.subjectLabel}</strong>
                <span>{candidate.readiness}</span>
              </div>
              <p>{candidate.confidenceLabel} | {candidate.runtimeLabel} | {candidate.turnLabel}</p>
              <p>{candidate.blockersLabel}</p>
              <p>{candidate.actionLabel}</p>
              <a className="forward-chip-button" href={candidate.targetHash}>
                Open evidence
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="forward-help">
        {readiness.contractLabel} | {readiness.sourceLabel}
      </p>
      <p className="forward-help">{readiness.privacyLabel}</p>
    </section>
  );
}
