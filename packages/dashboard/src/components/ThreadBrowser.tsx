import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";

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

const STATUS_COLORS: Record<string, string> = {
  open: "#3fb950",
  closed: "#8b949e",
  archived: "#6e7681",
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

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading threads...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, color: "#e6edf3" }}>
        Threads ({threads.length})
      </h2>
      <input
        type="text"
        placeholder="Filter by id, workspace, kind..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "8px 12px",
          marginBottom: 16,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 6,
          color: "#e6edf3",
          fontSize: 14,
        }}
      />
      {filtered.length === 0 ? (
        <div style={{ color: "#8b949e", padding: 16 }}>No threads found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((t) => (
            <a
              key={t.id}
              href={buildForwardRoute({ screen: "thread-detail", threadId: t.id, runId: null, taskId: null, workspaceId: null, agentId: null })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
                textDecoration: "none",
                color: "#e6edf3",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: STATUS_COLORS[t.status] ?? "#8b949e",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.id}
                </div>
                <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
                  {KIND_LABELS[t.kind] ?? t.kind} &middot; {t.workspace}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "#8b949e", flexShrink: 0 }}>
                {t.created_at?.slice(0, 10)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
