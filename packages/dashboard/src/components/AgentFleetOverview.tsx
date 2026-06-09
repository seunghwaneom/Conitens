import React from "react";
import { compareAgentAttention, getAgentAttentionLevel, type AgentProfile, type AgentLifecycleStatus } from "../agent-fleet-model.js";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function statusDotClass(status: AgentLifecycleStatus): string {
  switch (status) {
    case "running": return "agent-status-dot dot-running";
    case "assigned":
    case "idle": return "agent-status-dot dot-idle";
    case "paused": return "agent-status-dot dot-paused";
    case "dormant": return "agent-status-dot dot-dormant";
    case "retired": return "agent-status-dot dot-retired";
  }
}

function roleToneClass(role: AgentProfile["role"]): string {
  switch (role) {
    case "orchestrator": return "badge badge-orch";
    case "implementer": return "badge badge-impl";
    case "researcher": return "badge badge-rsch";
    case "reviewer": return "badge badge-revw";
    case "validator": return "badge badge-vald";
  }
}

interface AgentFleetOverviewProps {
  agents: AgentProfile[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

export function AgentFleetOverview({ agents, selectedAgentId, onSelectAgent }: AgentFleetOverviewProps) {
  const orderedAgents = agents.slice().sort(compareAgentAttention);
  const reviewCount = agents.filter(a => getAgentAttentionLevel(a) === "review").length;
  const runningCount = agents.filter(a => getAgentAttentionLevel(a) === "running").length;
  const blockedCount = agents.filter(a => getAgentAttentionLevel(a) === "blocked").length;
  const dormantCount = agents.filter(a => getAgentAttentionLevel(a) === "dormant").length;

  return (
    <div className="agent-fleet-overview">
      <div className="agent-fleet-metrics">
        <div className="agent-metric-item">
          <span className="agent-metric-label">Needs Review</span>
          <strong className="agent-metric-value agent-metric-review">{reviewCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Running</span>
          <strong className="agent-metric-value agent-metric-active">{runningCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Blocked</span>
          <strong className="agent-metric-value agent-metric-paused">{blockedCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Dormant</span>
          <strong className="agent-metric-value agent-metric-retired">{dormantCount}</strong>
        </div>
      </div>

      <div className="agent-fleet-grid">
        {orderedAgents.map(agent => {
          const attention = getAgentAttentionLevel(agent);
          return (
          <button
            key={agent.id}
            type="button"
            className={`agent-card attention-${attention}${selectedAgentId === agent.id ? " active" : ""}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div className="agent-card-header">
              <div className="agent-card-identity">
                <span className={statusDotClass(agent.status)} />
                <strong className="agent-card-name">{agent.name}</strong>
              </div>
              <span className={roleToneClass(agent.role)}>{agent.role}</span>
            </div>
            <p className="agent-card-archetype">{agent.archetype}</p>
            <div className="agent-card-stats">
              <span>{agent.taskCount} tasks</span>
              <span>{agent.memoryCount} mem</span>
              <span>{(agent.errorRate * 100).toFixed(0)}% err</span>
              {typeof agent.pendingApprovals === "number" ? <span>{agent.pendingApprovals} approvals</span> : null}
            </div>
            <p className="agent-card-last-active">{attention} / {timeAgo(agent.lastActive)}</p>
          </button>
          );
        })}
      </div>
    </div>
  );
}
