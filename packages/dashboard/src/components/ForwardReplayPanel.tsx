import type { ForwardReplayResponse } from "../forward-bridge.js";
import { EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./ForwardReplayPanel.module.css";

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
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Replay</p>
          <h3 className={styles.title}>Replay ledger</h3>
        </div>
        <span className={styles.stateTag}>{state}</span>
      </div>
      {state === "loading" ? <LoadingState message="Loading replay…" /> : null}
      {state === "error" && error ? <ErrorDisplay message={error} /> : null}
      {state === "ready" && replay && replay.timeline.length === 0 ? (
        <EmptyState message="No replay events recorded." />
      ) : null}
      {state === "ready" && replay && replay.timeline.length > 0 ? (
        <ol className={styles.timeline}>
          {replay.timeline.map((item, index) => (
            <li key={`${item.timestamp}-${item.kind}-${index}`} className={styles.timelineItem}>
              <div className={styles.timelineTopline}>
                <strong>{item.kind}</strong>
                <span>{item.timestamp}</span>
              </div>
              <p className={styles.timelineSummary}>{item.summary}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
