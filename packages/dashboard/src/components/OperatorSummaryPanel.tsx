import type { OperatorSummaryViewModel } from "../operator-summary-model.js";
import { LoadingState, ErrorDisplay } from "../ds/index.js";
import styles from "./OperatorSummaryPanel.module.css";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorSummaryPanelProps {
  summary: OperatorSummaryViewModel | null;
  state: PanelState;
  error: string | null;
}

export function OperatorSummaryPanel({ summary, state, error }: OperatorSummaryPanelProps) {
  if (state === "loading") {
    return <LoadingState message="Loading operator summary..." className={styles.empty} />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} className={styles.error} />;
  }
  if (state === "idle" || !summary) {
    return (
      <div className={styles.placeholder}>
        <h3>Operator overview placeholder</h3>
        <p>Connect to a live bridge to load the current operator posture.</p>
      </div>
    );
  }

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>Operator posture</p>
          <h3>Forward operator overview</h3>
          <p>{summary.latestRunLabel}</p>
        </div>
        <span className={styles.statusPill}>{summary.postureLabel}</span>
      </div>
      <div className={styles.stats}>
        {summary.metrics.map((item) => (
          <div key={item.id}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.panelLabel}>Attention</p>
            <h3>What needs action now</h3>
          </div>
        </div>
        <ul className={styles.timeline}>
          {summary.attention.map((item) => (
            <li key={item.id}>
              <div className={styles.timelineTopline}>
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
