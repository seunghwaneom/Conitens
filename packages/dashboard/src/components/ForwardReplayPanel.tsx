import type { ForwardReplayResponse } from "../forward-bridge.js";

export function ForwardReplayPanel({
  replay,
  state,
  error,
}: {
  replay: ForwardReplayResponse | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
}) {
  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Replay</p>
          <h3>Replay ledger</h3>
        </div>
        <span className={`forward-state state-${state}`}>{state}</span>
      </div>
      {state === "loading" ? <p className="forward-empty">Loading replay...</p> : null}
      {state === "error" ? <p className="forward-error">{error}</p> : null}
      {state === "ready" && replay && replay.timeline.length === 0 ? (
        <p className="forward-empty">No replay events recorded.</p>
      ) : null}
      {state === "ready" && replay && replay.timeline.length > 0 ? (
        <ol className="forward-timeline">
          {replay.timeline.map((item, index) => (
            <li key={`${item.timestamp}-${item.kind}-${index}`} className={`timeline-${item.kind}`}>
              <div className="forward-timeline-topline">
                <strong>{item.kind}</strong>
                <span>{item.timestamp}</span>
              </div>
              <p>{item.summary}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
