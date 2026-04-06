import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";

interface AgentData {
  id: string;
  role: string;
  status: string;
  public_persona: string;
  skills: string[];
  memory_namespace: string;
  hermes_profile: string;
  pending_patches: Array<{ file: string; path: string }>;
}

interface AgentDetailProps {
  apiBase: string;
  agentId: string;
}

export function AgentDetail({ apiBase, agentId }: AgentDetailProps) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/agents/${encodeURIComponent(agentId)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setAgent(data.agent ?? null); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load agent"); setLoading(false); });
  }, [apiBase, agentId]);

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading agent...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;
  if (!agent) return <div style={{ padding: 24, color: "#f85149" }}>Agent not found</div>;

  return (
    <div style={{ padding: 24 }}>
      <a
        href={buildForwardRoute({ screen: "agents", agentId: null, runId: null, taskId: null, workspaceId: null, threadId: null })}
        style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none", marginBottom: 12, display: "inline-block" }}
      >
        &larr; Back to agents
      </a>
      <h2 style={{ margin: "8px 0 4px", fontSize: 18, color: "#e6edf3" }}>{agent.id}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, background: "#0d1117", color: "#d2a8ff", border: "1px solid #30363d" }}>{agent.role}</span>
        <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, background: agent.status === "active" ? "#0d1f0d" : "#1c1c1c", color: agent.status === "active" ? "#3fb950" : "#8b949e" }}>{agent.status}</span>
      </div>
      <p style={{ color: "#8b949e", fontSize: 14, margin: "0 0 16px" }}>{agent.public_persona}</p>

      <h3 style={{ fontSize: 15, color: "#e6edf3", margin: "16px 0 8px" }}>Skills</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(agent.skills ?? []).map((s) => (
          <span key={s} style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}>{s}</span>
        ))}
      </div>

      <h3 style={{ fontSize: 15, color: "#e6edf3", margin: "16px 0 8px" }}>Config</h3>
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        <div>Memory: {agent.memory_namespace}</div>
        <div>Hermes: {agent.hermes_profile}</div>
      </div>

      {agent.pending_patches.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, color: "#e6edf3", margin: "16px 0 8px" }}>Pending Patches ({agent.pending_patches.length})</h3>
          {agent.pending_patches.map((p) => (
            <div key={p.file} style={{ padding: "8px 12px", background: "#161b22", border: "1px solid #30363d", borderRadius: 6, marginBottom: 6, fontSize: 13, color: "#e6edf3" }}>
              {p.file}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
