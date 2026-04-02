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

function statusColor(status: AgentLifecycleStatus): string {
  switch (status) {
    case "running": return "#4fb062";
    case "assigned":
    case "idle": return "#4fb062";
    case "paused": return "#c98b12";
    case "dormant": return "rgba(177, 205, 255, 0.3)";
    case "retired": return "rgba(177, 205, 255, 0.3)";
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

interface AgentProfilePanelProps {
  agent: AgentProfile | null;
}

export function AgentProfilePanel({ agent }: AgentProfilePanelProps) {
  if (!agent) {
    return (
      <div className="agent-profile agent-profile-empty">
        <div className="forward-placeholder">
          <h3>No agent selected</h3>
          <p>Select an agent to view profile</p>
        </div>
      </div>
    );
  }

  const canPause = agent.status === "running" || agent.status === "idle" || agent.status === "assigned";
  const canResume = agent.status === "paused";
  const errorPct = agent.errorRate * 100;

  return (
    <div className="agent-profile">
      <div className="agent-profile-section">
        <p className="forward-panel-label">Identity</p>
        <h3 className="agent-profile-name">{agent.name}</h3>
        <div className="agent-profile-meta">
          <span className={roleToneClass(agent.role)}>{agent.role}</span>
          <span className="agent-archetype-label">{agent.archetype}</span>
        </div>
      </div>

      <div className="agent-profile-section">
        <p className="forward-panel-label">Health</p>
        <div className="agent-health-row">
          <span
            className="agent-status-dot"
            style={{ backgroundColor: statusColor(agent.status) }}
          />
          <span className="agent-health-status">{agent.status}</span>
        </div>
        <p className="agent-health-active">Last active: {timeAgo(agent.lastActive)}</p>
        <div className="agent-error-bar-wrap">
          <div className="agent-error-bar-label">
            <span>Error rate</span>
            <span>{errorPct.toFixed(1)}%</span>
          </div>
          <div className="agent-error-bar-track">
            <div
              className="agent-error-bar-fill"
              style={{ width: `${Math.min(errorPct * 5, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="agent-profile-section">
        <p className="forward-panel-label">Stats</p>
        <div className="agent-stats-grid">
          <div className="agent-stat-item">
            <span>Tasks</span>
            <strong>{agent.taskCount}</strong>
          </div>
          <div className="agent-stat-item">
            <span>Memories</span>
            <strong>{agent.memoryCount}</strong>
          </div>
          <div className="agent-stat-item">
            <span>Room</span>
            <strong className="agent-stat-room">{agent.roomId}</strong>
          </div>
        </div>
      </div>

      <div className="agent-profile-section">
        <p className="forward-panel-label">Actions</p>
        <div className="agent-action-bar">
          {canPause && (
            <button className="forward-chip agent-action-btn" disabled title="Lifecycle control — coming soon">
              Pause
            </button>
          )}
          {canResume && (
            <button className="forward-chip agent-action-btn" disabled title="Lifecycle control — coming soon">
              Resume
            </button>
          )}
          <button className="forward-chip agent-action-btn" disabled title="Lifecycle control — coming soon">
            Retire
          </button>
        </div>
      </div>
    </div>
  );
}
