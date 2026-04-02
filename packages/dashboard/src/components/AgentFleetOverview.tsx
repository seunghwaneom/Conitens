import React from "react";
import type { AgentProfile, AgentLifecycleStatus } from "../agent-fleet-model.js";

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
  const totalCount = agents.length;
  const activeCount = agents.filter(a => a.status === "running" || a.status === "assigned" || a.status === "idle").length;
  const pausedCount = agents.filter(a => a.status === "paused").length;
  const retiredCount = agents.filter(a => a.status === "retired").length;

  return (
    <div className="agent-fleet-overview">
      <div className="agent-fleet-metrics">
        <div className="agent-metric-item">
          <span className="agent-metric-label">Total</span>
          <strong className="agent-metric-value">{totalCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Active</span>
          <strong className="agent-metric-value agent-metric-active">{activeCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Paused</span>
          <strong className="agent-metric-value agent-metric-paused">{pausedCount}</strong>
        </div>
        <div className="agent-metric-item">
          <span className="agent-metric-label">Retired</span>
          <strong className="agent-metric-value agent-metric-retired">{retiredCount}</strong>
        </div>
      </div>

      <div className="agent-fleet-grid">
        {agents.map(agent => (
          <button
            key={agent.id}
            className={`agent-card${selectedAgentId === agent.id ? " active" : ""}`}
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
            </div>
            <p className="agent-card-last-active">{timeAgo(agent.lastActive)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
