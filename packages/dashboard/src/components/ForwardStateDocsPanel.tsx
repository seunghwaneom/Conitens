import type { ForwardStateDocsResponse } from "../forward-bridge.js";
import { EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./ForwardStateDocsPanel.module.css";

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
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Runtime Docs</p>
          <h3 className={styles.title}>Projected state documents</h3>
        </div>
        <span className={styles.stateTag}>{state}</span>
      </div>
      {state === "loading" ? <LoadingState message="Loading state docs…" /> : null}
      {state === "error" && error ? <ErrorDisplay message={error} /> : null}
      {state === "ready" && stateDocs ? (
        <div className={styles.docGrid}>
          {Object.entries(stateDocs.documents).map(([key, doc]) => (
            <article key={key} className={styles.docCard}>
              <div className={styles.docHeader}>
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
