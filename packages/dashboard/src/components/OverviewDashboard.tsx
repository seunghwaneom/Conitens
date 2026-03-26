import React from "react";
import type { DashboardMetrics } from "../dashboard-model.js";
import type { AgentState, EventRecord, TaskState } from "../store/event-store.js";
import { getEventFamily, getTaskTone } from "../utils.js";

const PRIORITY_STATES = new Set(["active", "blocked", "review"]);
const SHORTCUT_ITEMS = [
  { key: "1", label: "Overview" },
  { key: "2", label: "Board" },
  { key: "3", label: "Timeline" },
  { key: "4", label: "Office" },
  { key: "Esc", label: "Close task" },
];

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
      className="event-sparkline"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent-strong)"
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
  const priorityTasks = tasks.filter((task) => PRIORITY_STATES.has(task.state)).slice(0, 4);

  return (
    <div className="overview-layout">
      <aside className="panel command-rail">
        <div className="rail-section">
          <p className="panel-kicker">QUEUE_FOCUS</p>
          <div className="stack focus-list">
            <div className="focus-item">
              <span className="focus-label">Task</span>
              <strong className="focus-value">{focusTask?.taskId ?? "No queued task"}</strong>
              <div className="muted">{focusTask?.state ?? "Awaiting activity"}</div>
            </div>
            <div className="focus-item">
              <span className="focus-label">Latest signal</span>
              <strong className="focus-value">{latestEvent?.type ?? "No events"}</strong>
              <div className="muted">
                {latestEvent
                  ? `${latestEvent.actor.id}${latestEvent.task_id ? ` / ${latestEvent.task_id}` : ""}`
                  : "Connect live data to inspect activity"}
              </div>
            </div>
            <div className="focus-item">
              <span className="focus-label">Open gates</span>
              <strong className="focus-value">{metrics.approvalSignals}</strong>
              <div className="muted">
                {metrics.approvalSignals > 0
                  ? "Approval or question review required"
                  : "No approval pressure"}
              </div>
            </div>
          </div>
        </div>

        <div className="rail-section">
          <p className="panel-kicker">SHORTCUTS</p>
          <div className="stack shortcut-list">
            {SHORTCUT_ITEMS.map((item) => (
              <div key={item.key} className="shortcut-row">
                <span className="shortcut-key">{item.key}</span>
                <span className="shortcut-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rail-section rail-actions">
          <button className="primary-button" type="button" onClick={onOpenBoard}>
            Open Board
          </button>
          <button className="secondary-button" type="button" onClick={onOpenTimeline}>
            Open Timeline
          </button>
        </div>
      </aside>

      <main className="overview-main">
        <section className="panel overview-command-center">
          <div className="panel-body">
            <div className="overview-command-header">
              <div>
                <p className="panel-kicker">CONTROL_SUMMARY</p>
                <h1 className="panel-title">Status-first operator view</h1>
                <p className="panel-subtitle">
                  Track task flow, approvals, worker load, and recent signals without
                  leaving the control surface.
                </p>
              </div>
              <div className="event-cadence-card">
                <span className="sidecard-label">event cadence</span>
                <EventSparkline events={recentEvents} />
                <span className="muted">{recentEvents.length} recent signals in view</span>
              </div>
            </div>

            {/* P0-1: AttentionStrip — primary KPI strip */}
            <AttentionStrip
              blocked={metrics.blockedTasks}
              review={metrics.reviewQueue}
              approvals={metrics.approvalSignals}
            />

            <div className="summary-chip-row">
              <span className={`chip ${isDemo ? "demo" : "live"}`}>
                {isDemo ? "demo snapshot" : "live event bus"}
              </span>
              <span className="chip neutral">socket {connectionStatus}</span>
              <span className="chip info">handoffs {metrics.handoffSignals}</span>
              <span className="chip neutral">agents {runningAgents}/{agents.length}</span>
            </div>

            <div className="secondary-metrics">
              <MetricCard label="Active Agents" value={metrics.activeAgents.toString()} accent />
              <MetricCard label="Handoff Signals" value={metrics.handoffSignals.toString()} />
            </div>
          </div>
        </section>

        <section className="overview-grid">
          <div className="panel">
            <div className="panel-body">
              <div className="section-head">
                <p className="panel-kicker">TASK_QUEUE</p>
                <span className="section-meta">{queuedTasks.length} surfaced tasks</span>
              </div>
              <div className="stack">
                {queuedTasks.length === 0 ? (
                  <div className="empty-state compact">No queued tasks in view</div>
                ) : (
                  queuedTasks.map((task) => (
                    <div key={task.taskId} className="rich-list-row">
                      <div>
                        <strong>{task.taskId}</strong>
                        <div className="muted">{task.assignee ?? "unassigned"}</div>
                      </div>
                      <span className={`badge state ${getTaskTone(task.state)}`}>{task.state}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-body">
              <div className="section-head">
                <p className="panel-kicker">RECENT_SIGNALS</p>
                <span className="section-meta">latest {recentEvents.length} signals</span>
              </div>
              <div className="stack">
                {recentEvents.length === 0 ? (
                  <div className="empty-state compact">Connect live data to inspect event flow</div>
                ) : (
                  recentEvents.map((event) => (
                    <div key={event.event_id} className="event-stream-row">
                      <div className="event-stream-main">
                        <span className={`chip event ${getEventFamily(event.type)}`}>
                          {getEventFamily(event.type)}
                        </span>
                        <strong>{event.type}</strong>
                      </div>
                      <div className="muted">
                        {event.actor.id}
                        {event.task_id ? ` / ${event.task_id}` : ""}
                      </div>
                      <span className="event-time">{event.ts.slice(11, 19)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <aside className="overview-side">
        <section className="panel">
          <div className="panel-body">
            <div className="section-head">
              <p className="panel-kicker">RUNTIME_STATUS</p>
              <span className={`chip ${isDemo ? "demo" : "live"}`}>
                {isDemo ? "demo" : "live"}
              </span>
            </div>
            <div className="status-grid">
              <div className="status-card">
                <span className="status-card-label">socket</span>
                <strong>{connectionStatus}</strong>
              </div>
              <div className="status-card">
                <span className="status-card-label">tasks</span>
                <strong>{tasks.length}</strong>
              </div>
              <div className="status-card">
                <span className="status-card-label">events</span>
                <strong>{recentEvents.length}</strong>
              </div>
              <div className="status-card">
                <span className="status-card-label">running</span>
                <strong>{runningAgents}</strong>
              </div>
              <div className="status-card">
                <span className="status-card-label">latest family</span>
                <strong>{getEventFamily(latestEvent?.type ?? "system")}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-body">
            <div className="section-head">
              <p className="panel-kicker">ACTIVE_LANES</p>
              <span className="section-meta">{priorityTasks.length} need attention</span>
            </div>
            <div className="stack">
              {priorityTasks.length === 0 ? (
                <div className="empty-state compact">No active, blocked, or review tasks</div>
              ) : (
                priorityTasks.map((task) => (
                  <div key={task.taskId} className="rich-list-row">
                    <div>
                      <strong>{task.taskId}</strong>
                      <div className="muted">{task.assignee ?? "unassigned"}</div>
                    </div>
                    <span className={`badge state ${getTaskTone(task.state)}`}>{task.state}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-body">
            <div className="section-head">
              <p className="panel-kicker">AGENT_ROSTER</p>
              <span className="section-meta">{agents.length} connected</span>
            </div>
            <div className="stack">
              {agents.map((agent) => {
                const assignedCount = tasks.filter((task) => task.assignee === agent.agentId).length;
                return (
                  <div key={agent.agentId} className="agent-row">
                    <div className="agent-row-main">
                      <span className={`agent-dot ${agent.status}`}></span>
                      <div>
                        <strong>{agent.agentId}</strong>
                        <div className="muted">{assignedCount} assigned</div>
                      </div>
                    </div>
                    <span className={`badge state ${getTaskTone(agent.status)}`}>{agent.status}</span>
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

function MetricCard({
  label,
  value,
  accent = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value${accent ? " accent-text" : ""}`}>{value}</div>
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
    <div className={`attention-strip${hasAlert ? " has-alert" : ""}`}>
      {hasAlert ? (
        <>
          <span className="attention-label">{total} needs attention</span>
          {blocked > 0 && (
            <span className="attention-item danger">{blocked} blocked</span>
          )}
          {review > 0 && (
            <span className="attention-item info">{review} in review</span>
          )}
          {approvals > 0 && (
            <span className="attention-item warning">{approvals} approvals</span>
          )}
        </>
      ) : (
        <span className="attention-item clear">All clear — no action required</span>
      )}
    </div>
  );
}
