import type { AgentProfile, AgentLifecycleStatus } from "../agent-fleet-model.js";
import type { EvolutionEntry, LearningMetric } from "../evolution-model.js";
import { Badge } from "../ds/index.js";
import styles from "./AgentProfilePanel.module.css";
import { pickText, localizeLabel, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

function timeAgo(iso: string, locale: "ko" | "en"): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return pickText(locale, { ko: "방금 전", en: "just now" });
  if (diffMin < 60) return pickText(locale, { ko: `${diffMin}분 전`, en: `${diffMin}m ago` });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return pickText(locale, { ko: `${diffH}시간 전`, en: `${diffH}h ago` });
  const diffD = Math.floor(diffH / 24);
  return pickText(locale, { ko: `${diffD}일 전`, en: `${diffD}d ago` });
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
  const locale = useUiStore((state) => state.locale);
  if (!agent) {
    return (
      <div className={styles.profileEmpty}>
        <div className={styles.placeholder}>
          <h3>{pickText(locale, { ko: "에이전트가 선택되지 않았습니다", en: "No agent selected" })}</h3>
          <p>{pickText(locale, { ko: "프로필을 보려면 에이전트를 선택하세요", en: "Select an agent to view profile" })}</p>
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
        <p className={styles.panelLabel}>{pickText(locale, { ko: "정체성", en: "Identity" })}</p>
        <h3 className={styles.profileName}>{agent.name}</h3>
        <div className={styles.meta}>
          <Badge variant="neutral" className={roleBadgeClass(agent.role)}>{localizeStatus(locale, agent.role)}</Badge>
          <span className={styles.archetypeLabel}>{agent.archetype}</span>
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.panelLabel}>{pickText(locale, { ko: "상태", en: "Health" })}</p>
        <div className={styles.healthRow}>
          <span
            className={styles.statusDot}
            ref={(el) => { if (el) el.style.setProperty('--status-color', statusColor(agent.status)); }}
          />
          <span className={styles.healthStatus}>{localizeStatus(locale, agent.status)}</span>
        </div>
        <p className={styles.healthActive}>{pickText(locale, { ko: "마지막 활동", en: "Last active" })}: {timeAgo(agent.lastActive, locale)}</p>
        <div className={styles.errorBarWrap}>
          <div className={styles.errorBarLabel}>
            <span>{pickText(locale, { ko: "오류율", en: "Error rate" })}</span>
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
        <p className={styles.panelLabel}>{pickText(locale, { ko: "통계", en: "Stats" })}</p>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span>{pickText(locale, { ko: "작업", en: "Tasks" })}</span>
            <strong>{agent.taskCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>{pickText(locale, { ko: "메모리", en: "Memories" })}</span>
            <strong>{agent.memoryCount}</strong>
          </div>
          <div className={styles.statItem}>
            <span>{pickText(locale, { ko: "룸", en: "Room" })}</span>
            <strong className={styles.statRoom}>{agent.roomId}</strong>
          </div>
          {agent.latestRunId ? (
            <div className={styles.statItem}>
              <span>{pickText(locale, { ko: "최신 런", en: "Latest run" })}</span>
              <strong className={styles.statRoom}>{agent.latestRunId}</strong>
            </div>
          ) : null}
          {typeof agent.pendingApprovals === "number" ? (
            <div className={styles.statItem}>
              <span>{pickText(locale, { ko: "승인", en: "Approvals" })}</span>
              <strong>{agent.pendingApprovals}</strong>
            </div>
          ) : null}
        </div>
        {agent.latestRunStatus ? (
          <p className={styles.healthActive}>{pickText(locale, { ko: "최신 런 상태", en: "Latest run status" })}: {localizeStatus(locale, agent.latestRunStatus)}</p>
        ) : null}
        {agent.latestBlocker ? (
          <p className={styles.healthActive}>{pickText(locale, { ko: "최신 blocker", en: "Latest blocker" })}: {agent.latestBlocker}</p>
        ) : null}
        {agent.workspaceRef ? (
          <p className={styles.healthActive}>{pickText(locale, { ko: "워크스페이스", en: "Workspace" })}: {agent.workspaceRef}</p>
        ) : null}
      </div>

      <div className={styles.section}>
        <p className={styles.panelLabel}>{pickText(locale, { ko: "액션", en: "Actions" })}</p>
        <div className={styles.actionBar}>
          {canPause && (
            <button className={styles.chip} disabled title={pickText(locale, { ko: "라이프사이클 제어 — 추후 제공", en: "Lifecycle control — coming soon" })}>
              {pickText(locale, { ko: "일시정지", en: "Pause" })}
            </button>
          )}
          {canResume && (
            <button className={styles.chip} disabled title={pickText(locale, { ko: "라이프사이클 제어 — 추후 제공", en: "Lifecycle control — coming soon" })}>
              {pickText(locale, { ko: "재개", en: "Resume" })}
            </button>
          )}
          <button className={styles.chip} disabled title={pickText(locale, { ko: "라이프사이클 제어 — 추후 제공", en: "Lifecycle control — coming soon" })}>
            {pickText(locale, { ko: "퇴역", en: "Retire" })}
          </button>
        </div>
      </div>

      {evolution.length > 0 && (
        <div className={styles.section}>
          <p className={styles.panelLabel}>{pickText(locale, { ko: "진화 타임라인", en: "Evolution Timeline" })}</p>
          <div className={styles.evolutionList}>
            {evolution.map(entry => (
              <div key={entry.id} className={styles.evolutionEntry}>
                <div className={styles.evolutionHeader}>
                  <Badge variant={outcomeVariant(entry.outcome)}>{localizeStatus(locale, entry.outcome)}</Badge>
                  <span className={styles.evolutionDate}>{timeAgo(entry.appliedAt, locale)}</span>
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
          <p className={styles.panelLabel}>{pickText(locale, { ko: "학습 지표", en: "Learning Metrics" })}</p>
          <div className={styles.memoryGrid}>
            {(["identity", "procedural", "episodic", "reflection"] as const).map(key => (
              <div key={key} className={styles.memoryStat}>
                <span className={styles.memoryLabel}>{localizeLabel(locale, key)}</span>
                <strong className={styles.memoryCount}>{metrics.memoryCounts[key]}</strong>
              </div>
            ))}
          </div>
          <div className={styles.proposalBarWrap}>
            <p className={styles.proposalBarLabel}>{pickText(locale, { ko: "제안", en: "Proposals" })}</p>
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
              <span className={styles.legendApproved}>{pickText(locale, { ko: `${metrics.proposalStats.approved} 승인`, en: `${metrics.proposalStats.approved} approved` })}</span>
              <span className={styles.legendRejected}>{pickText(locale, { ko: `${metrics.proposalStats.rejected} 거부`, en: `${metrics.proposalStats.rejected} rejected` })}</span>
              <span className={styles.legendPending}>{pickText(locale, { ko: `${metrics.proposalStats.pending} 대기`, en: `${metrics.proposalStats.pending} pending` })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
