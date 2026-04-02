import type { InsightCardViewModel } from "../forward-view-model.js";

export function ForwardInsightsPanel({
  insights,
  findingsSummary,
  validatorCorrelations,
}: {
  insights: InsightCardViewModel[];
  findingsSummary: string;
  validatorCorrelations: string[];
}) {
  const hasFindings = findingsSummary.trim().length > 0;
  const hasCorrelations = validatorCorrelations.length > 0;

  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Insights</p>
          <h3>Post-run insight view</h3>
        </div>
      </div>
      {insights.length === 0 && !hasFindings && !hasCorrelations ? (
        <p className="forward-empty">No insight records or finding summaries available yet.</p>
      ) : null}
      {insights.length > 0 ? (
        <div className="forward-insight-grid">
          {insights.map((item) => (
            <article key={item.id} className="forward-insight-card">
              <div className="forward-insight-header">
                <strong>{item.kind}</strong>
                <span>{item.scope}</span>
              </div>
              <p className="forward-insight-summary">{item.summary}</p>
              <div className="forward-approval-meta">
                <span>{item.timestamp}</span>
                <span>{item.evidenceCount} evidence ref(s)</span>
              </div>
              <details>
                <summary>Raw record</summary>
                <pre>{item.rawJson}</pre>
              </details>
            </article>
          ))}
        </div>
      ) : null}
      {hasFindings ? (
        <article className="forward-doc-card">
          <div className="forward-doc-header">
            <strong>findings summary</strong>
            <span>state-docs.findings</span>
          </div>
          <pre>{findingsSummary}</pre>
        </article>
      ) : null}
      {hasCorrelations ? (
        <article className="forward-doc-card">
          <div className="forward-doc-header">
            <strong>validator correlation</strong>
            <span>recent validator feedback</span>
          </div>
          <ul className="forward-graph-summary">
            {validatorCorrelations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
