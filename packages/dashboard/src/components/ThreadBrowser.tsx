import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import { createForwardAuthHeaders } from "../forward-bridge.js";
import styles from "./ThreadBrowser.module.css";
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

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
  const locale = useUiStore((state) => state.locale);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const hasToken = token.trim().length > 0;

  useEffect(() => {
    if (!hasToken) {
      setThreads([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/threads`, { headers: createForwardAuthHeaders(token) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        setThreads(data.threads ?? []);
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
  }, [apiBase, hasToken, token]);

  const filtered = filter
    ? threads.filter(
        (t) =>
          t.id.includes(filter) ||
          t.workspace.includes(filter) ||
          t.kind.includes(filter),
      )
    : threads;

  if (!hasToken) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Communication ledger</p>
            <h2 className={styles.heading}>{pickText(locale, { ko: "스레드", en: "Threads" })}</h2>
          </div>
          <span className={styles.stateBadge}>{pickText(locale, { ko: "데모 샘플", en: "demo sample" })}</span>
        </div>
        <p className={styles.helperText}>
          {pickText(locale, {
            ko: "thread history를 보려면 라이브 브리지를 연결하세요. 이 route는 정적 transcript fixture를 제공하지 않습니다.",
            en: "Connect to a live bridge to inspect thread history. This route does not ship a static transcript fixture.",
          })}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Communication ledger</p>
            <h2 className={styles.heading}>{pickText(locale, { ko: "스레드", en: "Threads" })}</h2>
          </div>
          <span className={styles.stateBadge}>{pickText(locale, { ko: "라이브", en: "live" })}</span>
        </div>
        <LoadingState message={pickText(locale, { ko: "스레드 로딩 중…", en: "Loading threads…" })} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Communication ledger</p>
            <h2 className={styles.heading}>{pickText(locale, { ko: "스레드", en: "Threads" })}</h2>
          </div>
          <span className={styles.stateBadge}>{pickText(locale, { ko: "라이브 오류", en: "live error" })}</span>
        </div>
        <ErrorDisplay message={`Error: ${error}`} />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communication ledger</p>
          <h2 className={styles.heading}>{pickText(locale, { ko: `스레드 (${threads.length})`, en: `Threads (${threads.length})` })}</h2>
        </div>
        <span className={styles.stateBadge}>{pickText(locale, { ko: "라이브", en: "live" })}</span>
      </div>
      <p className={styles.helperText}>
        {pickText(locale, {
          ko: "control plane를 벗어나지 않고 operator와 agent 대화를 확인합니다.",
          en: "Inspect operator and agent conversations without leaving the control plane.",
        })}
      </p>
      <label className={styles.filterField} htmlFor="thread-browser-filter">
        <span className={styles.filterLabel}>{pickText(locale, { ko: "스레드 필터", en: "Filter threads" })}</span>
        <input
          id="thread-browser-filter"
          name="thread-filter"
          aria-label={pickText(locale, { ko: "스레드 필터", en: "Filter threads" })}
          autoComplete="off"
          spellCheck={false}
          type="search"
          placeholder={pickText(locale, { ko: "ID, 워크스페이스, kind로 필터…", en: "Filter by ID, workspace, or kind…" })}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={styles.filterInput}
        />
      </label>
      {filtered.length === 0 ? (
        <EmptyState message={pickText(locale, { ko: "스레드를 찾을 수 없습니다", en: "No threads found" })} />
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
                {localizeStatus(locale, t.status)} · {t.created_at?.slice(0, 10)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
