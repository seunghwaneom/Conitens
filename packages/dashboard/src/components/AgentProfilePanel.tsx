import type { AgentProfile, AgentLifecycleStatus } from "../agent-fleet-model.js";
import type { EvolutionEntry, LearningMetric } from "../evolution-model.js";
import { Badge } from "../ds/index.js";
import styles from "./AgentProfilePanel.module.css";

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
    case "running": return "var(--co-color-status-success, #4fb062)";
    case "assigned":
    case "idle": return "var(--co-color-status-success, #4fb062)";
    case "paused": return "var(--co-color-status-warning, #c98b12)";
    case "dormant": return "var(--co-color-text-muted)";
    case "retired": return "var(--co-color-text-muted)";
  }
}

function roleBadgeClass(role: AgentProfile["role"]): string {
  switch (role) {
    case "orchestrator": return styles.badgeOrch;
    case "implementer": return styles.badgeImpl;
    case "researcher": return styles.badgeRsch;
    case "reviewer": return styles.badgeRevw;
    case "validator": return styles.badgeVald;
  }
}

function outcomeVariant(outcome: EvolutionEntry["outcome"]): "success" | "neutral" | "danger" {
  switch (outcome) {
    case "improved": return "success";
    case "neutral": return "neutral";
    case "regressed": return "danger";
  }
}

interface AgentProfilePanelProps {
  agent: AgentProfile | null;
  evolution: EvolutionEntry[];
  metrics: LearningMetric | null;
}

export function AgentProfilePanel({ agent, evolution, metrics }: AgentProfilePanelProps) {
  if (!agent) {
    return (
      <div className={styles.profileEmpty}>
        <div className={styles.placeholder}>
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
    <div className={styles.profile}>
      <div className={styles.section}>
        <p className={styles.panelLabel}>Identity</p>
        <h3 className={styles.profileName}>{agent.name}</h3>
        <div className={styles.meta}>
          <Badge variant="neutral" className={roleBadgeClass(agent.role)}>{agent.role}</Badge>
          <span className={styles.archetypeLabel}>{agent.archetype}</span>
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.panelLabel}>Health</p>
        <div className={styles.healthRow}>
          <span
            className={styles.statusDot}
            ref={(el) => { if (el) el.style.setProperty('--status-color', statusColor(agent.status)); }}
          />
          <span className={styles.healthStatus}>{agent.status}</span>
        </div>
        <p className={styles.healthActive}>Last active: {timeAgo(agent.lastActive)}</p>
        <div className={styles.errorBarWrap}>
          <div className={styles.errorBarLabel}>
            <span>Error rate</span>
            <span>{errorPct.toFixed(1)}%</span>
          </div>
          <div className={styles.errorBarTrack}>
            <div
              className={styles.errorBarFill}
              ref={(el) => { if (el) el.style.setProperty('--bar-width', `${Math.min(errorPct * 5, 100)}%`); }}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.panelLabel}>Stats</p>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span>Tasks</span>
            <strong>{agent.taskCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Memories</span>
            <strong>{agent.memoryCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>Room</span>
            <strong className={styles.statRoom}>{agent.roomId}</strong>
          </div>
          {agent.latestRunId ? (
            <div className={styles.statItem}>
              <span>Latest run</span>
              <strong className={styles.statRoom}>{agent.latestRunId}</strong>
            </div>
          ) : null}
          {typeof agent.pendingApprovals === "number" ? (
            <div className={styles.statItem}>
              <span>Approvals</span>
              <strong>{agent.pendingApprovals}</strong>
            </div>
          ) : null}
        </div>
        {agent.latestRunStatus ? (
          <p className={styles.healthActive}>Latest run status: {agent.latestRunStatus}</p>
        ) : null}
        {agent.latestBlocker ? (
          <p className={styles.healthActive}>Latest blocker: {agent.latestBlocker}</p>
        ) : null}
        {agent.workspaceRef ? (
          <p className={styles.healthActive}>Workspace: {agent.workspaceRef}</p>
        ) : null}
      </div>

      <div className={styles.section}>
        <p className={styles.panelLabel}>Actions</p>
        <div className={styles.actionBar}>
          {canPause && (
            <button className={styles.chip} disabled title="Lifecycle control — coming soon">
              Pause
            </button>
          )}
          {canResume && (
            <button className={styles.chip} disabled title="Lifecycle control — coming soon">
              Resume
            </button>
          )}
          <button className={styles.chip} disabled title="Lifecycle control — coming soon">
            Retire
          </button>
        </div>
      </div>

      {evolution.length > 0 && (
        <div className={styles.section}>
          <p className={styles.panelLabel}>Evolution Timeline</p>
          <div className={styles.evolutionList}>
            {evolution.map(entry => (
              <div key={entry.id} className={styles.evolutionEntry}>
                <div className={styles.evolutionHeader}>
                  <Badge variant={outcomeVariant(entry.outcome)}>{entry.outcome}</Badge>
                  <span className={styles.evolutionDate}>{timeAgo(entry.appliedAt)}</span>
                </div>
                <p className={styles.evolutionTitle}>{entry.title}</p>
                <span className={styles.evolutionDelta}>{entry.deltaMetric}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics && (
        <div className={styles.section}>
          <p className={styles.panelLabel}>Learning Metrics</p>
          <div className={styles.memoryGrid}>
            {(["identity", "procedural", "episodic", "reflection"] as const).map(key => (
              <div key={key} className={styles.memoryStat}>
                <span className={styles.memoryLabel}>{key}</span>
                <strong className={styles.memoryCount}>{metrics.memoryCounts[key]}</strong>
              </div>
            ))}
          </div>
          <div className={styles.proposalBarWrap}>
            <p className={styles.proposalBarLabel}>Proposals</p>
            <div className={styles.proposalBar}>
              {metrics.proposalStats.approved > 0 && (
                <div
                  className={styles.proposalSegApproved}
                  ref={(el) => { if (el) el.style.setProperty('--seg-flex', String(metrics.proposalStats.approved)); }}
                  title={`Approved: ${metrics.proposalStats.approved}`}
                />
              )}
              {metrics.proposalStats.rejected > 0 && (
                <div
                  className={styles.proposalSegRejected}
                  ref={(el) => { if (el) el.style.setProperty('--seg-flex', String(metrics.proposalStats.rejected)); }}
                  title={`Rejected: ${metrics.proposalStats.rejected}`}
                />
              )}
              {metrics.proposalStats.pending > 0 && (
                <div
                  className={styles.proposalSegPending}
                  ref={(el) => { if (el) el.style.setProperty('--seg-flex', String(metrics.proposalStats.pending)); }}
                  title={`Pending: ${metrics.proposalStats.pending}`}
                />
              )}
            </div>
            <div className={styles.proposalBarLegend}>
              <span className={styles.legendApproved}>{metrics.proposalStats.approved} approved</span>
              <span className={styles.legendRejected}>{metrics.proposalStats.rejected} rejected</span>
              <span className={styles.legendPending}>{metrics.proposalStats.pending} pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
