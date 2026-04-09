import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { Badge, LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import { createForwardAuthHeaders } from "../forward-bridge.js";
import styles from "./ThreadDetail.module.css";
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

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
  const locale = useUiStore((state) => state.locale);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasToken = token.trim().length > 0;

  useEffect(() => {
    if (!hasToken) {
      setThread(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/threads/${encodeURIComponent(threadId)}`, { headers: createForwardAuthHeaders(token) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        setThread(data.thread ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, hasToken, threadId, token]);

  if (!hasToken) {
    return (
      <div className={styles.panel}>
        <a
          href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
          className={styles.backLink}
        >
          &larr; {pickText(locale, { ko: "스레드로 돌아가기", en: "Back to threads" })}
        </a>
        <EmptyState message={pickText(locale, { ko: "thread detail을 보려면 라이브 브리지를 연결하세요.", en: "Connect to a live bridge to inspect thread detail." })} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <a
          href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
          className={styles.backLink}
        >
          &larr; {pickText(locale, { ko: "스레드로 돌아가기", en: "Back to threads" })}
        </a>
        <LoadingState message={pickText(locale, { ko: "스레드 로딩 중…", en: "Loading thread…" })} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <a
          href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
          className={styles.backLink}
        >
          &larr; {pickText(locale, { ko: "스레드로 돌아가기", en: "Back to threads" })}
        </a>
        <ErrorDisplay message={`Error: ${error}`} />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className={styles.panel}>
        <a
          href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
          className={styles.backLink}
        >
          &larr; {pickText(locale, { ko: "스레드로 돌아가기", en: "Back to threads" })}
        </a>
        <ErrorDisplay message={pickText(locale, { ko: "스레드를 찾을 수 없습니다", en: "Thread not found" })} />
      </div>
    );
  }

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
        &larr; {pickText(locale, { ko: "스레드로 돌아가기", en: "Back to threads" })}
      </a>
      <h2 className={styles.heading}>{thread.id}</h2>
      <div className={styles.badgeRow}>
        <Badge variant={thread.status === "open" ? "success" : "neutral"}>{localizeStatus(locale, thread.status)}</Badge>
        <Badge>{thread.kind}</Badge>
        <Badge>{thread.workspace}</Badge>
      </div>

      <div className={styles.metaSection}>
        <div className={styles.participantsLabel}>{pickText(locale, { ko: "참여자", en: "Participants" })}</div>
        <div className={styles.participantRow}>
          {participants.map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
        </div>
      </div>

      <div className={styles.timestamps}>
        {pickText(locale, { ko: "생성", en: "Created" })}: {thread.created_at} &middot; {pickText(locale, { ko: "업데이트", en: "Updated" })}: {thread.updated_at}
      </div>

      <h3 className={styles.messagesHeading}>
        {pickText(locale, { ko: `메시지 (${thread.messages.length})`, en: `Messages (${thread.messages.length})` })}
      </h3>
      {thread.messages.length === 0 ? (
        <EmptyState message={pickText(locale, { ko: "메시지가 없습니다", en: "No messages yet" })} />
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
