import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";

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

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading thread...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;
  if (!thread) return <div style={{ padding: 24, color: "#f85149" }}>Thread not found</div>;

  const participants = Array.isArray(thread.participants)
    ? thread.participants
    : typeof thread.participants === "string"
      ? thread.participants.split(",").map((s) => s.trim())
      : [];

  return (
    <div style={{ padding: 24 }}>
      <a
        href={buildForwardRoute({ screen: "threads", threadId: null, runId: null, taskId: null, workspaceId: null, agentId: null })}
        style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none", marginBottom: 12, display: "inline-block" }}
      >
        &larr; Back to threads
      </a>
      <h2 style={{ margin: "8px 0 4px", fontSize: 18, color: "#e6edf3" }}>{thread.id}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{
          padding: "2px 8px", borderRadius: 12, fontSize: 12,
          background: thread.status === "open" ? "#0d1f0d" : "#1c1c1c",
          color: thread.status === "open" ? "#3fb950" : "#8b949e",
          border: `1px solid ${thread.status === "open" ? "#238636" : "#30363d"}`,
        }}>
          {thread.status}
        </span>
        <span style={{
          padding: "2px 8px", borderRadius: 12, fontSize: 12,
          background: "#0d1117", color: "#8b949e", border: "1px solid #30363d",
        }}>
          {thread.kind}
        </span>
        <span style={{
          padding: "2px 8px", borderRadius: 12, fontSize: 12,
          background: "#0d1117", color: "#8b949e", border: "1px solid #30363d",
        }}>
          {thread.workspace}
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Participants</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {participants.map((p) => (
            <span
              key={p}
              style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 12,
                background: "#161b22", color: "#e6edf3", border: "1px solid #30363d",
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: "#8b949e" }}>
        Created: {thread.created_at} &middot; Updated: {thread.updated_at}
      </div>

      <h3 style={{ margin: "20px 0 8px", fontSize: 15, color: "#e6edf3" }}>
        Messages ({thread.messages.length})
      </h3>
      {thread.messages.length === 0 ? (
        <div style={{ color: "#8b949e", padding: 8, fontSize: 13 }}>No messages yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {thread.messages.map((m, i) => (
            <div
              key={i}
              style={{
                padding: "8px 12px",
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 6,
                fontSize: 13,
                color: "#e6edf3",
                lineHeight: 1.5,
              }}
            >
              {m.raw}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
