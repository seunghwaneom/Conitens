import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { Badge, LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import styles from "./ThreadDetail.module.css";

interface ThreadMessage {
  raw: string;
}

interface ThreadData {
  id: string;
  kind: string;
  workspace: string;
  status: string;
  participants: string | string[];
  created_at: string;
  updated_at: string;
  messages: ThreadMessage[];
  path: string;
}

interface ThreadDetailProps {
  apiBase: string;
  threadId: string;
  token: string;
}

export function ThreadDetail({ apiBase, threadId, token }: ThreadDetailProps) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/threads/${encodeURIComponent(threadId)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setThread(data.thread ?? null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiBase, threadId]);

  if (loading) return <LoadingState message="Loading thread..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;
  if (!thread) return <ErrorDisplay message="Thread not found" />;

  const participants = Array.isArray(thread.participants)
    ? thread.participants
    : typeof thread.participants === "string"
      ? thread.participants.split(",").map((s) => s.trim())
      : [];

  return (
    <div className={styles.panel}>
      <a
        href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
        className={styles.backLink}
      >
        &larr; Back to threads
      </a>
      <h2 className={styles.heading}>{thread.id}</h2>
      <div className={styles.badgeRow}>
        <Badge variant={thread.status === "open" ? "success" : "neutral"}>{thread.status}</Badge>
        <Badge>{thread.kind}</Badge>
        <Badge>{thread.workspace}</Badge>
      </div>

      <div className={styles.metaSection}>
        <div className={styles.participantsLabel}>Participants</div>
        <div className={styles.participantRow}>
          {participants.map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
        </div>
      </div>

      <div className={styles.timestamps}>
        Created: {thread.created_at} &middot; Updated: {thread.updated_at}
      </div>

      <h3 className={styles.messagesHeading}>
        Messages ({thread.messages.length})
      </h3>
      {thread.messages.length === 0 ? (
        <EmptyState message="No messages yet" />
      ) : (
        <div className={styles.messageList}>
          {thread.messages.map((m, i) => (
            <div key={i} className={styles.messageItem}>
              {m.raw}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
