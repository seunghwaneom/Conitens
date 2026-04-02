import type { ForwardStateDocsResponse } from "../forward-bridge.js";

export function ForwardStateDocsPanel({
  stateDocs,
  state,
  error,
}: {
  stateDocs: ForwardStateDocsResponse | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
}) {
  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">State docs</p>
          <h3>Projected runtime documents</h3>
        </div>
        <span className={`forward-state state-${state}`}>{state}</span>
      </div>
      {state === "loading" ? <p className="forward-empty">Loading state docs...</p> : null}
      {state === "error" ? <p className="forward-error">{error}</p> : null}
      {state === "ready" && stateDocs ? (
        <div className="forward-doc-grid">
          {Object.entries(stateDocs.documents).map(([key, doc]) => (
            <article key={key} className="forward-doc-card">
              <div className="forward-doc-header">
                <strong>{key}</strong>
                <span>{doc.path}</span>
              </div>
              <pre>{doc.content}</pre>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
