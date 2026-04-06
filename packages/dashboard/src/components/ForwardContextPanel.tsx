import type { ForwardContextLatestResponse } from "../forward-bridge.js";

export function ForwardContextPanel({
  contextLatest,
  state,
  error,
}: {
  contextLatest: ForwardContextLatestResponse | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
}) {
  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Context</p>
          <h3>Runtime vs repo digests</h3>
        </div>
        <span className={`forward-state state-${state}`}>{state}</span>
      </div>
      {state === "loading" ? <p className="forward-empty">Loading digests...</p> : null}
      {state === "error" ? <p className="forward-error">{error}</p> : null}
      {state === "ready" && contextLatest ? (
        <div className="forward-digest-grid">
          <article className="forward-doc-card">
            <div className="forward-doc-header">
              <strong>runtime_latest</strong>
              <span>{contextLatest.runtime_latest.path}</span>
            </div>
            <pre>{contextLatest.runtime_latest.content || "_missing_"}</pre>
          </article>
          <article className="forward-doc-card">
            <div className="forward-doc-header">
              <strong>repo_latest</strong>
              <span>{contextLatest.repo_latest?.path || "_missing_"}</span>
            </div>
            <pre>{contextLatest.repo_latest?.content || "_missing_"}</pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}
