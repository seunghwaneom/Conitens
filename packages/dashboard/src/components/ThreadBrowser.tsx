import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import styles from "./ThreadBrowser.module.css";

interface ThreadSummary {
  id: string;
  kind: string;
  workspace: string;
  status: string;
  participants: string;
  created_at: string;
  updated_at: string;
}

interface ThreadBrowserProps {
  apiBase: string;
  token: string;
}

const KIND_LABELS: Record<string, string> = {
  user_agent: "User \u2194 Agent",
  agent_agent: "Agent \u2194 Agent",
  agent_agent_user: "Agent \u2194 Agent \u2194 User",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  open: styles.statusOpen,
  closed: styles.statusClosed,
  archived: styles.statusArchived,
};

export function ThreadBrowser({ apiBase, token }: ThreadBrowserProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/threads`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setThreads(data.threads ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiBase]);

  const filtered = filter
    ? threads.filter(
        (t) =>
          t.id.includes(filter) ||
          t.workspace.includes(filter) ||
          t.kind.includes(filter),
      )
    : threads;

  if (loading) return <LoadingState message="Loading threads..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>
        Threads ({threads.length})
      </h2>
      <input
        type="text"
        placeholder="Filter by id, workspace, kind..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className={styles.filterInput}
      />
      {filtered.length === 0 ? (
        <EmptyState message="No threads found" />
      ) : (
        <div className={styles.threadList}>
          {filtered.map((t) => (
            <a
              key={t.id}
              href={buildForwardRoute({ screen: "thread-detail", threadId: t.id, runId: null, taskId: null, workspaceId: null, agentId: null })}
              className={styles.threadLink}
            >
              <span
                className={`${styles.statusDot} ${STATUS_DOT_CLASS[t.status] ?? styles.statusClosed}`}
              />
              <div className={styles.threadInfo}>
                <div className={styles.threadId}>
                  {t.id}
                </div>
                <div className={styles.threadMeta}>
                  {KIND_LABELS[t.kind] ?? t.kind} &middot; {t.workspace}
                </div>
              </div>
              <span className={styles.threadDate}>
                {t.created_at?.slice(0, 10)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
