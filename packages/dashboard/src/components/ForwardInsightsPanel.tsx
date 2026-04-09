import type { InsightCardViewModel } from "../forward-view-model.js";
import { EmptyState } from "../ds/index.js";
import styles from "./ForwardInsightsPanel.module.css";

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
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Insights</p>
          <h3 className={styles.title}>Evidence & insight view</h3>
        </div>
      </div>
      {insights.length === 0 && !hasFindings && !hasCorrelations ? (
        <EmptyState message="No insight records or finding summaries available yet." />
      ) : null}
      {insights.length > 0 ? (
        <div className={styles.insightGrid}>
          {insights.map((item) => (
            <article key={item.id} className={styles.insightCard}>
              <div className={styles.insightHeader}>
                <strong>{item.kind}</strong>
                <span>{item.scope}</span>
              </div>
              <p className={styles.insightSummary}>{item.summary}</p>
              <div className={styles.insightMeta}>
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
        <article className={styles.docCard}>
          <div className={styles.docHeader}>
            <strong>findings summary</strong>
            <span>state-docs.findings</span>
          </div>
          <pre>{findingsSummary}</pre>
        </article>
      ) : null}
      {hasCorrelations ? (
        <article className={styles.docCard}>
          <div className={styles.docHeader}>
            <strong>validator correlation</strong>
            <span>recent validator feedback</span>
          </div>
          <ul className={styles.correlationList}>
            {validatorCorrelations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
