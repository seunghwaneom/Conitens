import type { AgentProfile, AgentLifecycleStatus } from "../agent-fleet-model.js";
import styles from "./AgentFleetOverview.module.css";
import { pickText, localizeStatus } from "../i18n.js";
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

function statusDotClass(status: AgentLifecycleStatus): string {
  switch (status) {
    case "running": return `${styles.statusDot} ${styles.dotRunning}`;
    case "assigned":
    case "idle": return `${styles.statusDot} ${styles.dotIdle}`;
    case "paused": return `${styles.statusDot} ${styles.dotPaused}`;
    case "dormant": return `${styles.statusDot} ${styles.dotDormant}`;
    case "retired": return `${styles.statusDot} ${styles.dotRetired}`;
  }
}

function roleBadgeClass(role: AgentProfile["role"]): string {
  switch (role) {
    case "orchestrator": return `${styles.badge} ${styles.badgeOrch}`;
    case "implementer": return `${styles.badge} ${styles.badgeImpl}`;
    case "researcher": return `${styles.badge} ${styles.badgeRsch}`;
    case "reviewer": return `${styles.badge} ${styles.badgeRevw}`;
    case "validator": return `${styles.badge} ${styles.badgeVald}`;
  }
}

interface AgentFleetOverviewProps {
  agents: AgentProfile[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

export function AgentFleetOverview({ agents, selectedAgentId, onSelectAgent }: AgentFleetOverviewProps) {
  const locale = useUiStore((state) => state.locale);
  const totalCount = agents.length;
  const activeCount = agents.filter(a => a.status === "running" || a.status === "assigned" || a.status === "idle").length;
  const pausedCount = agents.filter(a => a.status === "paused").length;
  const retiredCount = agents.filter(a => a.status === "retired").length;

  return (
    <div className={styles.fleetOverview}>
      <div className={styles.metrics}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{pickText(locale, { ko: "전체", en: "Total" })}</span>
          <strong className={styles.metricValue}>{totalCount}</strong>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{pickText(locale, { ko: "활성", en: "Active" })}</span>
          <strong className={`${styles.metricValue} ${styles.metricActive}`}>{activeCount}</strong>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{pickText(locale, { ko: "일시정지", en: "Paused" })}</span>
          <strong className={`${styles.metricValue} ${styles.metricPaused}`}>{pausedCount}</strong>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{pickText(locale, { ko: "퇴역", en: "Retired" })}</span>
          <strong className={`${styles.metricValue} ${styles.metricRetired}`}>{retiredCount}</strong>
        </div>
      </div>

      <div className={styles.grid}>
        {agents.map(agent => (
          <button
            key={agent.id}
            className={`${styles.agentCard}${selectedAgentId === agent.id ? ` ${styles.agentCardActive}` : ""}`}
            onClick={() => onSelectAgent(agent.id)}
          >
              <div className={styles.cardHeader}>
                <div className={styles.cardIdentity}>
                  <span className={statusDotClass(agent.status)} />
                  <strong className={styles.cardName}>{agent.name}</strong>
                </div>
              <span className={roleBadgeClass(agent.role)}>{localizeStatus(locale, agent.role)}</span>
              </div>
            <p className={styles.cardArchetype}>{agent.archetype}</p>
            <div className={styles.cardStats}>
              <span>{pickText(locale, { ko: `${agent.taskCount}개 작업`, en: `${agent.taskCount} tasks` })}</span>
              <span>{pickText(locale, { ko: `${agent.memoryCount}개 메모리`, en: `${agent.memoryCount} mem` })}</span>
              <span>{pickText(locale, { ko: `오류 ${(agent.errorRate * 100).toFixed(0)}%`, en: `${(agent.errorRate * 100).toFixed(0)}% err` })}</span>
              {typeof agent.pendingApprovals === "number" ? <span>{pickText(locale, { ko: `${agent.pendingApprovals}개 승인`, en: `${agent.pendingApprovals} approvals` })}</span> : null}
            </div>
            <p className={styles.cardLastActive}>{timeAgo(agent.lastActive, locale)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
