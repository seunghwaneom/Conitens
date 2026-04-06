import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";

interface AgentSummary {
  id: string;
  role: string;
  status: string;
  public_persona: string;
  skills_count: number;
}

interface AgentStudioProps {
  apiBase: string;
}

const ROLE_COLORS: Record<string, string> = {
  supervisor: "#d2a8ff",
  recorder: "#79c0ff",
  improver: "#7ee787",
  worker: "#e6edf3",
};

export function AgentStudio({ apiBase }: AgentStudioProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/agents`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setAgents(data.agents ?? []); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load agents"); setLoading(false); });
  }, [apiBase]);

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading agents...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, color: "#e6edf3" }}>Agents ({agents.length})</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {agents.map((a) => (
          <a
            key={a.id}
            href={buildForwardRoute({ screen: "agent-detail", agentId: a.id, runId: null, taskId: null, workspaceId: null, threadId: null })}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              background: "#161b22", border: "1px solid #30363d", borderRadius: 8,
              textDecoration: "none", color: "#e6edf3",
            }}
          >
            <span style={{
              padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: "#0d1117", color: ROLE_COLORS[a.role] ?? "#8b949e",
              border: `1px solid ${ROLE_COLORS[a.role] ?? "#30363d"}40`,
            }}>
              {a.role}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a.id}</div>
              <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>{a.public_persona?.slice(0, 80)}</div>
            </div>
            <span style={{ fontSize: 12, color: "#8b949e" }}>{a.skills_count} skills</span>
            <span style={{
              padding: "2px 8px", borderRadius: 12, fontSize: 11,
              background: a.status === "active" ? "#0d1f0d" : "#1c1c1c",
              color: a.status === "active" ? "#3fb950" : "#8b949e",
            }}>
              {a.status}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
