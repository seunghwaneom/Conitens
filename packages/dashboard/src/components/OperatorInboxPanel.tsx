import type { OperatorInboxItemViewModel } from "../operator-inbox-model.js";
import { EmptyState, ErrorDisplay, LoadingState, Badge } from "../ds/index.js";
import styles from "./OperatorInboxPanel.module.css";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorInboxPanelProps {
  items: OperatorInboxItemViewModel[];
  state: PanelState;
  error: string | null;
}

const TONE_STYLE: Record<string, string> = {
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
  neutral: styles.toneNeutral,
};

export function OperatorInboxPanel({ items, state, error }: OperatorInboxPanelProps) {
  if (state === "loading") {
    return <LoadingState message="Loading operator inbox..." />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} />;
  }
  if (state === "idle") {
    return (
      <div className={styles.placeholder}>
        <h3>Operator inbox placeholder</h3>
        <p>Connect to a live bridge to load actionable operator attention items.</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className={styles.placeholder}>
        <h3>Inbox is clear</h3>
        <p>No approvals, validator failures, blocked handoffs, or stale runs are currently projected.</p>
      </div>
    );
  }

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>Operator inbox</p>
          <h3>Action queue</h3>
          <p>{items.length} projected attention item{items.length === 1 ? "" : "s"}</p>
        </div>
        <Badge variant="warning">attention</Badge>
      </div>
      <div className={styles.runList}>
        {items.map((item) => {
          const toneClass = TONE_STYLE[item.tone] ?? styles.toneNeutral;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.runItem} ${styles.runItemActive} ${toneClass}`}
              onClick={() => {
                window.location.hash = item.targetHash;
              }}
            >
              <div className={styles.runTopline}>
                <strong>{item.title}</strong>
                <span>{item.tone}</span>
              </div>
              <p>{item.detail}</p>
              <div className={styles.metricRow}>
                <span>{item.meta}</span>
                <span>{item.actionLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
