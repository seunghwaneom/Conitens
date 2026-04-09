import type { ForwardContextLatestResponse } from "../forward-bridge.js";
import { EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./ForwardContextPanel.module.css";

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
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Context</p>
          <h3 className={styles.title}>Runtime vs repo digests</h3>
        </div>
        <span className={styles.stateTag}>{state}</span>
      </div>
      {state === "loading" ? <LoadingState message="Loading digests..." /> : null}
      {state === "error" && error ? <ErrorDisplay message={error} /> : null}
      {state === "ready" && !contextLatest ? (
        <EmptyState message="No context digest available." />
      ) : null}
      {state === "ready" && contextLatest ? (
        <div className={styles.digestGrid}>
          <article className={styles.docCard}>
            <div className={styles.docHeader}>
              <strong>runtime_latest</strong>
              <span>{contextLatest.runtime_latest.path}</span>
            </div>
            <pre>{contextLatest.runtime_latest.content || "_missing_"}</pre>
          </article>
          <article className={styles.docCard}>
            <div className={styles.docHeader}>
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
