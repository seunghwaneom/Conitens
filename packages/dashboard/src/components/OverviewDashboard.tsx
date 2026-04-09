import {
  getOverviewActions,
  getRuntimeLedger,
  type DashboardMetrics,
} from "../dashboard-model.js";
import type { AgentState, EventRecord, TaskState } from "../store/event-store.js";
import { getEventFamily, getTaskTone } from "../utils.js";
import styles from "./OverviewDashboard.module.css";

const TONE_MAP: Record<string, string> = {
  live: styles.toneLive,
  demo: styles.toneDemo,
  info: styles.toneInfo,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  success: styles.toneSuccess,
  neutral: styles.toneNeutral,
  agent: styles.toneAgent,
  handoff: styles.toneHandoff,
  system: styles.toneSystem,
  workflow: styles.toneWorkflow,
  artifact: styles.toneArtifact,
  approval: styles.toneApproval,
  task: styles.toneTask,
};

const ACTION_ROW_MAP: Record<string, string> = {
  danger: styles.actionRowDanger,
  warning: styles.actionRowWarning,
  info: styles.actionRowInfo,
};

const AGENT_DOT_MAP: Record<string, string> = {
  running: styles.agentDotRunning,
  idle: styles.agentDotIdle,
  error: styles.agentDotError,
};

function EventSparkline({ events }: { events: EventRecord[] }) {
  if (events.length < 2) return null;

  const bucketCount = 20;
  const buckets = new Array(bucketCount).fill(0);
  const step = Math.max(1, Math.ceil(events.length / bucketCount));
  for (let index = 0; index < events.length; index += 1) {
    const bucket = Math.min(Math.floor(index / step), bucketCount - 1);
    buckets[bucket] += 1;
  }

  const max = Math.max(...buckets, 1);
  const height = 50;
  const width = 100;
  const points = buckets
    .map((value, index) => {
      const x = (index / (bucketCount - 1)) * width;
      const y = height - (value / max) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.sparkline}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--co-color-accent-strong)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function OverviewDashboard({
  tasks,
  queuedTasks,
  agents,
  recentEvents,
  metrics,
  connectionStatus,
  isDemo,
  onOpenBoard,
  onOpenTimeline,
}: {
  tasks: TaskState[];
  queuedTasks: TaskState[];
  agents: AgentState[];
  recentEvents: EventRecord[];
  metrics: DashboardMetrics;
  connectionStatus: string;
  isDemo: boolean;
  onOpenBoard: () => void;
  onOpenTimeline: () => void;
}) {
  const latestEvent = recentEvents[0];
  const runningAgents = agents.filter((agent) => agent.status === "running").length;
  const focusTask = queuedTasks[0];
  const overviewActions = getOverviewActions(tasks, recentEvents);
  const attentionTotal = metrics.blockedTasks + metrics.reviewQueue + metrics.approvalSignals;
  const runtimeLedger = getRuntimeLedger({
    connectionStatus,
    latestEventType: latestEvent?.type,
    runningAgents,
    totalAgents: agents.length,
  });

  return (
    <div className={styles.layout}>
      <aside className={styles.commandRail}>
        <div className={styles.railSection}>
          <p className={styles.kicker}>QUEUE_FOCUS</p>
          <div className={`${styles.stack} ${styles.focusList}`}>
            <div className={styles.focusItem}>
              <span className={styles.focusLabel}>Task</span>
              <strong className={styles.focusValue}>{focusTask?.taskId ?? "No queued task"}</strong>
              <div className={styles.muted}>{focusTask?.state ?? "Awaiting activity"}</div>
            </div>
            <div className={styles.focusItem}>
              <span className={styles.focusLabel}>Latest signal</span>
              <strong className={styles.focusValue}>{latestEvent?.type ?? "No events"}</strong>
              <div className={styles.muted}>
                {latestEvent
                  ? `${latestEvent.actor.id}${latestEvent.task_id ? ` / ${latestEvent.task_id}` : ""}`
                  : "Connect live data to inspect activity"}
              </div>
            </div>
            <div className={styles.focusItem}>
              <span className={styles.focusLabel}>Open gates</span>
              <strong className={styles.focusValue}>{metrics.approvalSignals}</strong>
              <div className={styles.muted}>
                {metrics.approvalSignals > 0
                  ? "Approval or question review required"
                  : "No approval pressure"}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.railSection}>
          <div className={styles.railActions}>
            <button className={styles.primaryButton} type="button" onClick={onOpenBoard}>
              Open Board
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onOpenTimeline}>
              Open Timeline
            </button>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.commandCenter}>
          <div className={styles.panelBody}>
            <div className={styles.commandHeader}>
              <div>
                <p className={styles.kicker}>CONTROL_SUMMARY</p>
                <h1 className={styles.title}>Status-first operator view</h1>
                <p className={styles.subtitle}>
                  Track task flow, approvals, worker load, and recent signals without
                  leaving the control surface.
                </p>
              </div>
              <div className={styles.cadenceCard}>
                <span className={styles.cadenceLabel}>event cadence</span>
                <EventSparkline events={recentEvents} />
                <span className={styles.muted}>{recentEvents.length} recent signals in view</span>
              </div>
            </div>

            {/* P0-1: AttentionStrip — primary KPI strip */}
            <AttentionStrip
              blocked={metrics.blockedTasks}
              review={metrics.reviewQueue}
              approvals={metrics.approvalSignals}
            />

            <div className={styles.actionLedger}>
              <div className={styles.sectionHead}>
                <p className={styles.kicker}>IMMEDIATE_ACTIONS</p>
                <span className={styles.sectionMeta}>{overviewActions.length} surfaced lanes</span>
              </div>
              <div className={styles.stack}>
                {overviewActions.length === 0 ? (
                  <div className={styles.emptyCompact}>
                    No active actions surfaced from tasks or recent signals
                  </div>
                ) : (
                  overviewActions.map((action) => (
                    <div key={action.id} className={ACTION_ROW_MAP[action.tone] ?? styles.actionRow}>
                      <div className={styles.actionMain}>
                        <span className={`${styles.badge} ${TONE_MAP[action.tone] ?? ""}`}>{action.lane}</span>
                        <div>
                          <strong>{action.target}</strong>
                          <div className={styles.muted}>{action.summary}</div>
                        </div>
                      </div>
                      <span className={styles.actionMeta}>{action.meta}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </section>

        <section className={styles.overviewGrid}>
          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <div className={styles.sectionHead}>
                <p className={styles.kicker}>TASK_QUEUE</p>
                <span className={styles.sectionMeta}>{queuedTasks.length} surfaced tasks</span>
              </div>
              <div className={styles.stack}>
                {queuedTasks.length === 0 ? (
                  <div className={styles.emptyCompact}>No queued tasks in view</div>
                ) : (
                  queuedTasks.map((task) => (
                    <div key={task.taskId} className={styles.richListRow}>
                      <div>
                        <strong>{task.taskId}</strong>
                        <div className={styles.muted}>{task.assignee ?? "unassigned"}</div>
                      </div>
                      <span className={`${styles.badge} ${TONE_MAP[getTaskTone(task.state)] ?? ""}`}>{task.state}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <div className={styles.sectionHead}>
                <p className={styles.kicker}>RECENT_SIGNALS</p>
                <span className={styles.sectionMeta}>latest {recentEvents.length} signals</span>
              </div>
              <div className={styles.stack}>
                {recentEvents.length === 0 ? (
                  <div className={styles.emptyCompact}>Connect live data to inspect event flow</div>
                ) : (
                  recentEvents.map((event) => (
                    <div key={event.event_id} className={styles.eventRow}>
                      <div className={styles.eventMain}>
                        <span className={`${styles.chip} ${TONE_MAP[getEventFamily(event.type)] ?? ""}`}>
                          {getEventFamily(event.type)}
                        </span>
                        <strong>{event.type}</strong>
                      </div>
                      <div className={styles.muted}>
                        {event.actor.id}
                        {event.task_id ? ` / ${event.task_id}` : ""}
                      </div>
                      <span className={styles.eventTime}>{event.ts.slice(11, 19)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <aside className={styles.side}>
        <section className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>RUNTIME_LEDGER</p>
              <span className={`${styles.chip} ${isDemo ? styles.toneDemo : styles.toneLive}`}>
                {isDemo ? "demo" : "live"}
              </span>
            </div>
            <div className={styles.runtimeLedger}>
              {runtimeLedger.map((row) => (
                <div key={row.label} className={styles.runtimeRow}>
                  <span className={styles.runtimeRowLabel}>{row.label}</span>
                  <div className={styles.runtimeRowValue}>
                    {row.tone ? (
                      <span className={`${styles.chip} ${TONE_MAP[row.tone] ?? ""}`}>{row.value}</span>
                    ) : (
                      <strong>{row.value}</strong>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className={styles.runtimeSummary}>
              {attentionTotal > 0 ? (
                <>
                  <strong>{attentionTotal}</strong> operator signals remain open across blocked,
                  review, and approval lanes.
                </>
              ) : (
                "System pressure is low. No blocked, review, or approval backlog is visible."
              )}
            </p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>AGENT_ROSTER</p>
              <span className={styles.sectionMeta}>{agents.length} connected</span>
            </div>
            <div className={styles.stack}>
              {agents.map((agent) => {
                const assignedCount = tasks.filter((task) => task.assignee === agent.agentId).length;
                return (
                  <div key={agent.agentId} className={styles.agentRow}>
                    <div className={styles.agentRowMain}>
                      <span className={AGENT_DOT_MAP[agent.status] ?? styles.agentDot}></span>
                      <div>
                        <strong>{agent.agentId}</strong>
                        <div className={styles.muted}>{assignedCount} assigned</div>
                      </div>
                    </div>
                    <span className={`${styles.badge} ${TONE_MAP[getTaskTone(agent.status)] ?? ""}`}>{agent.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

function AttentionStrip({
  blocked,
  review,
  approvals,
}: {
  blocked: number;
  review: number;
  approvals: number;
}) {
  const hasAlert = blocked > 0 || review > 0 || approvals > 0;
  const total = blocked + review + approvals;

  return (
    <div className={hasAlert ? styles.attentionStripAlert : styles.attentionStrip}>
      {hasAlert ? (
        <>
          <span className={styles.attentionLabel}>{total} needs attention</span>
          {blocked > 0 && (
            <span className={styles.attentionDanger}>{blocked} blocked</span>
          )}
          {review > 0 && (
            <span className={styles.attentionInfo}>{review} in review</span>
          )}
          {approvals > 0 && (
            <span className={styles.attentionWarning}>{approvals} approvals</span>
          )}
        </>
      ) : (
        <span className={styles.attentionClear}>All clear — no action required</span>
      )}
    </div>
  );
}
