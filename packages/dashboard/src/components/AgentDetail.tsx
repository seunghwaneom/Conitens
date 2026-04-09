import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { Badge, LoadingState, ErrorDisplay } from "../ds/index.js";
import styles from "./AgentDetail.module.css";

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
  token: string;
}

export function AgentDetail({ apiBase, agentId, token }: AgentDetailProps) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/agents/${encodeURIComponent(agentId)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setAgent(data.agent ?? null); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load agent"); setLoading(false); });
  }, [apiBase, agentId]);

  if (loading) return <LoadingState message="Loading agent..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;
  if (!agent) return <ErrorDisplay message="Agent not found" />;

  return (
    <div className={styles.panel}>
      <a
        href={buildForwardRoute({ screen: "agents", agentId: null, runId: null, taskId: null, workspaceId: null, threadId: null })}
        className={styles.backLink}
      >
        &larr; Back to agents
      </a>
      <h2 className={styles.heading}>{agent.id}</h2>
      <div className={styles.badgeRow}>
        <Badge variant="info">{agent.role}</Badge>
        <Badge variant={agent.status === "active" ? "success" : "neutral"}>{agent.status}</Badge>
      </div>
      <p className={styles.persona}>{agent.public_persona}</p>

      <h3 className={styles.sectionHeading}>Skills</h3>
      <div className={styles.skillRow}>
        {(agent.skills ?? []).map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </div>

      <h3 className={styles.sectionHeading}>Config</h3>
      <div className={styles.configSection}>
        <div>Memory: {agent.memory_namespace}</div>
        <div>Hermes: {agent.hermes_profile}</div>
      </div>

      {agent.pending_patches.length > 0 && (
        <>
          <h3 className={styles.sectionHeading}>Pending Patches ({agent.pending_patches.length})</h3>
          {agent.pending_patches.map((p) => (
            <div key={p.file} className={styles.patchItem}>
              {p.file}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
