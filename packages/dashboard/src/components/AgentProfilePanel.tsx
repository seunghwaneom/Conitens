import React from "react";
import type { AgentProfile, AgentLifecycleStatus } from "../agent-fleet-model.js";
import type { EvolutionEntry, LearningMetric } from "../evolution-model.js";

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

function outcomeClass(outcome: EvolutionEntry["outcome"]): string {
  switch (outcome) {
    case "improved": return "badge badge-success";
    case "neutral": return "badge badge-neutral";
    case "regressed": return "badge badge-danger";
  }
}

function timeAgoFrom(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

interface AgentProfilePanelProps {
  agent: AgentProfile | null;
  evolution: EvolutionEntry[];
  metrics: LearningMetric | null;
}

export function AgentProfilePanel({ agent, evolution, metrics }: AgentProfilePanelProps) {
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
          {agent.latestRunId ? (
            <div className="agent-stat-item">
              <span>Latest run</span>
              <strong className="agent-stat-room">{agent.latestRunId}</strong>
            </div>
          ) : null}
          {typeof agent.pendingApprovals === "number" ? (
            <div className="agent-stat-item">
              <span>Approvals</span>
              <strong>{agent.pendingApprovals}</strong>
            </div>
          ) : null}
        </div>
        {agent.latestRunStatus ? (
          <p className="agent-health-active">Latest run status: {agent.latestRunStatus}</p>
        ) : null}
        {agent.latestBlocker ? (
          <p className="agent-health-active">Latest blocker: {agent.latestBlocker}</p>
        ) : null}
        {agent.workspaceRef ? (
          <p className="agent-health-active">Workspace: {agent.workspaceRef}</p>
        ) : null}
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

      {evolution.length > 0 && (
        <div className="agent-profile-section">
          <p className="forward-panel-label">Evolution Timeline</p>
          <div className="agent-evolution-list">
            {evolution.map(entry => (
              <div key={entry.id} className="agent-evolution-entry">
                <div className="agent-evolution-header">
                  <span className={outcomeClass(entry.outcome)}>{entry.outcome}</span>
                  <span className="agent-evolution-date">{timeAgoFrom(entry.appliedAt)}</span>
                </div>
                <p className="agent-evolution-title">{entry.title}</p>
                <span className="agent-evolution-delta">{entry.deltaMetric}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics && (
        <div className="agent-profile-section">
          <p className="forward-panel-label">Learning Metrics</p>
          <div className="agent-memory-grid">
            {(["identity", "procedural", "episodic", "reflection"] as const).map(key => (
              <div key={key} className="agent-memory-stat">
                <span className="agent-memory-label">{key}</span>
                <strong className="agent-memory-count">{metrics.memoryCounts[key]}</strong>
              </div>
            ))}
          </div>
          <div className="agent-proposal-bar-wrap">
            <p className="agent-proposal-bar-label">Proposals</p>
            <div className="agent-proposal-bar">
              {metrics.proposalStats.approved > 0 && (
                <div
                  className="agent-proposal-bar-seg agent-proposal-seg-approved"
                  style={{ flex: metrics.proposalStats.approved }}
                  title={`Approved: ${metrics.proposalStats.approved}`}
                />
              )}
              {metrics.proposalStats.rejected > 0 && (
                <div
                  className="agent-proposal-bar-seg agent-proposal-seg-rejected"
                  style={{ flex: metrics.proposalStats.rejected }}
                  title={`Rejected: ${metrics.proposalStats.rejected}`}
                />
              )}
              {metrics.proposalStats.pending > 0 && (
                <div
                  className="agent-proposal-bar-seg agent-proposal-seg-pending"
                  style={{ flex: metrics.proposalStats.pending }}
                  title={`Pending: ${metrics.proposalStats.pending}`}
                />
              )}
            </div>
            <div className="agent-proposal-bar-legend">
              <span className="agent-proposal-legend-approved">{metrics.proposalStats.approved} approved</span>
              <span className="agent-proposal-legend-rejected">{metrics.proposalStats.rejected} rejected</span>
              <span className="agent-proposal-legend-pending">{metrics.proposalStats.pending} pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
