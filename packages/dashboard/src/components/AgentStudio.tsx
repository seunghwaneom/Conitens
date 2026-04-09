import React, { useEffect, useState } from "react";
import { buildForwardRoute } from "../forward-route.js";
import { LoadingState, ErrorDisplay } from "../ds/index.js";
import styles from "./AgentStudio.module.css";

interface AgentSummary {
  id: string;
  role: string;
  status: string;
  public_persona: string;
  skills_count: number;
}

interface AgentStudioProps {
  apiBase: string;
  token: string;
}

const ROLE_CLASS: Record<string, string> = {
  supervisor: styles.roleSupervisor,
  recorder: styles.roleRecorder,
  improver: styles.roleImprover,
  worker: styles.roleWorker,
};

export function AgentStudio({ apiBase, token }: AgentStudioProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/agents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setAgents(data.agents ?? []); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load agents"); setLoading(false); });
  }, [apiBase, token]);

  if (loading) return <LoadingState message="Loading agents..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Agents ({agents.length})</h2>
      <div className={styles.agentList}>
        {agents.map((a) => (
          <a
            key={a.id}
            href={buildForwardRoute({ screen: "agent-detail", agentId: a.id, runId: null, taskId: null, workspaceId: null, threadId: null })}
            className={styles.agentLink}
          >
            <span className={`${styles.roleBadge} ${ROLE_CLASS[a.role] ?? styles.roleWorker}`}>
              {a.role}
            </span>
            <div className={styles.agentInfo}>
              <div className={styles.agentId}>{a.id}</div>
              <div className={styles.agentPersona}>{a.public_persona?.slice(0, 80)}</div>
            </div>
            <span className={styles.skillsCount}>{a.skills_count} skills</span>
            <span className={`${styles.statusBadge} ${a.status === "active" ? styles.statusActive : styles.statusInactive}`}>
              {a.status}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
