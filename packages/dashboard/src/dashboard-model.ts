import type { AgentState, EventRecord, TaskState } from "./store/event-store.js";

export type DashboardTab = "overview" | "kanban" | "timeline" | "office";
export type DashboardPanelTab = Exclude<DashboardTab, "overview">;

export const DASHBOARD_TABS: DashboardTab[] = ["overview", "kanban", "timeline", "office"];
export const DASHBOARD_TAB_HOTKEYS: Record<DashboardTab, string> = {
  overview: "1",
  kanban: "2",
  timeline: "3",
  office: "4",
};
export const DASHBOARD_PANEL_COPY: Record<
  DashboardPanelTab,
  { title: string; subtitle: string }
> = {
  kanban: {
    title: "Task Board",
    subtitle: "Move tasks across the control-plane lifecycle.",
  },
  timeline: {
    title: "Append-Only Timeline",
    subtitle: "Recent event flow grouped as an operator log.",
  },
  office: {
    title: "Office Map",
    subtitle: "Live agent placement and assigned task context.",
  },
};

export interface DashboardDataInput {
  tasks: TaskState[];
  agents: AgentState[];
  events: EventRecord[];
}

export interface DashboardFallbackData extends DashboardDataInput {}

export interface DashboardMetrics {
  activeAgents: number;
  blockedTasks: number;
  reviewQueue: number;
  approvalSignals: number;
  handoffSignals: number;
}

const ACTIVE_TASK_STATES = new Set(["active", "assigned", "blocked", "review"]);

export function resolveDashboardData(
  store: DashboardDataInput,
  fallback: DashboardFallbackData,
) {
  const hasLiveWorkspace = store.tasks.length > 0 || store.agents.length > 0;
  const events = hasLiveWorkspace
    ? store.events.length > 0
      ? store.events
      : fallback.events
    : store.events.length > 0
      ? [...fallback.events, ...store.events]
      : fallback.events;

  return {
    tasks: hasLiveWorkspace ? store.tasks : fallback.tasks,
    agents: hasLiveWorkspace ? store.agents : fallback.agents,
    events,
    isDemo: !hasLiveWorkspace,
  };
}

export function deriveDashboardMetrics(
  agents: AgentState[],
  tasks: TaskState[],
  events: EventRecord[],
): DashboardMetrics {
  return {
    activeAgents: agents.filter((agent) => agent.status === "running").length,
    blockedTasks: tasks.filter((task) => task.state === "blocked").length,
    reviewQueue: tasks.filter((task) => task.state === "review").length,
    approvalSignals: events.filter(
      (event) => event.type.includes("approval") || event.type.includes("question"),
    ).length,
    handoffSignals: events.filter((event) => event.type.startsWith("handoff.")).length,
  };
}

export function getRecentEvents(events: EventRecord[], limit: number = 6) {
  return [...events].slice(-limit).reverse();
}

export function getQueuedTasks(tasks: TaskState[], limit: number = 6) {
  return [...tasks].slice(0, limit);
}

export function getActiveTaskCount(tasks: TaskState[]) {
  return tasks.filter((task) => ACTIVE_TASK_STATES.has(task.state)).length;
}

export function getTabBadges(
  tasks: TaskState[],
  events: EventRecord[],
): Record<DashboardTab, number | null> {
  return {
    overview: null,
    kanban: getActiveTaskCount(tasks),
    timeline: events.length,
    office: null,
  };
}

export function getConnectionPresentation(isDemo: boolean, status: string) {
  if (isDemo && status !== "open") {
    return {
      tone: "demo",
      label: "[DEMO] preview snapshot",
    };
  }

  return {
    tone: status,
    label: `[${status.toUpperCase()}] event bus ${status}`,
  };
}
