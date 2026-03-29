import { getAgentOfficeProfile } from "./agent-profiles.ts";
import { OFFICE_STAGE_ROOMS } from "./office-stage-schema.ts";
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
    title: "Office Summary",
    subtitle: "Room occupancy, room pressure, and live handoff routes.",
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

export interface RuntimeLedgerEntry {
  label: string;
  value: string;
  tone?: string;
}

export interface OverviewAction {
  id: string;
  lane: "blocked" | "review" | "active" | "approval" | "handoff";
  tone: "danger" | "info" | "warning";
  target: string;
  summary: string;
  meta: string;
}

export interface OfficeRoomSnapshot {
  roomId: string;
  label: string;
  kind: string;
  teamId: string;
  teamLabel: string;
  agentCount: number;
  runningCount: number;
  taskCount: number;
  signalCount: number;
  latestFamily: string | null;
  residents: string[];
  tone: "neutral" | "info" | "warning" | "danger";
}

export interface OfficeHandoffSnapshot {
  id: string;
  fromRoomId: string;
  fromLabel: string;
  toRoomId: string;
  toLabel: string;
  taskId: string;
  actorId: string;
  targetId: string;
  timestamp: string;
}

export interface OfficeSnapshot {
  occupiedRooms: number;
  activeRooms: number;
  handoffCount: number;
  rooms: OfficeRoomSnapshot[];
  handoffs: OfficeHandoffSnapshot[];
}

const ACTIVE_TASK_STATES = new Set(["active", "assigned", "blocked", "review"]);
const PRIORITY_TASK_ORDER = new Map([
  ["blocked", 0],
  ["review", 1],
  ["active", 2],
]);
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

export function getPriorityTasks(tasks: TaskState[], limit: number = 4) {
  return [...tasks]
    .filter((task) => PRIORITY_TASK_ORDER.has(task.state))
    .sort(
      (left, right) =>
        (PRIORITY_TASK_ORDER.get(left.state) ?? Number.MAX_SAFE_INTEGER) -
        (PRIORITY_TASK_ORDER.get(right.state) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, limit);
}

export function getOverviewActions(
  tasks: TaskState[],
  events: EventRecord[],
  limit: number = 4,
): OverviewAction[] {
  const recentEvents = [...events].sort((left, right) => right.ts.localeCompare(left.ts));
  const approvalSignal = recentEvents.find(
    (event) => event.type.includes("approval") || event.type.includes("question"),
  );
  const handoffSignal = recentEvents.find((event) => event.type.startsWith("handoff."));
  const signalCount = [approvalSignal, handoffSignal].filter(Boolean).length;
  const taskBudget = Math.max(0, limit - signalCount);

  const taskActions = getPriorityTasks(tasks, taskBudget).map<OverviewAction>((task) => ({
    id: `task:${task.taskId}`,
    lane:
      task.state === "blocked" ? "blocked" : task.state === "review" ? "review" : "active",
    tone: task.state === "blocked" ? "danger" : "info",
    target: task.taskId,
    summary:
      task.state === "blocked"
        ? "Clear the blocker to resume flow."
        : task.state === "review"
          ? "Finish the review pass before close."
          : "Keep the active lane moving.",
    meta: task.assignee ?? "unassigned",
  }));

  const actions = [...taskActions];

  if (approvalSignal) {
    actions.push({
      id: `event:${approvalSignal.event_id}`,
      lane: "approval",
      tone: "warning",
      target: approvalSignal.task_id ?? approvalSignal.type,
      summary: approvalSignal.type.includes("question")
        ? "Respond to the open question gate."
        : "Resolve the pending approval gate.",
      meta: approvalSignal.actor.id,
    });
  }

  if (handoffSignal) {
    actions.push({
      id: `event:${handoffSignal.event_id}`,
      lane: "handoff",
      tone: "info",
      target: handoffSignal.task_id ?? handoffSignal.type,
      summary: "Confirm the next owner after handoff.",
      meta: handoffSignal.actor.id,
    });
  }

  return actions.slice(0, limit);
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

export function getRuntimeLedger({
  connectionStatus,
  latestEventType,
  runningAgents,
  totalAgents,
}: {
  connectionStatus: string;
  latestEventType?: string;
  runningAgents: number;
  totalAgents: number;
}): RuntimeLedgerEntry[] {
  return [
    {
      label: "socket",
      value: connectionStatus,
      tone: getSocketTone(connectionStatus),
    },
    {
      label: "running agents",
      value: `${runningAgents}/${totalAgents}`,
    },
    {
      label: "latest family",
      value: getEventFamily(latestEventType ?? "system"),
    },
  ];
}

export function getOfficeSnapshot({
  agents,
  tasks,
  events,
}: {
  agents: AgentState[];
  tasks: TaskState[];
  events: EventRecord[];
}): OfficeSnapshot {
  const rooms = OFFICE_STAGE_ROOMS.map((room) => ({
    roomId: room.roomId,
    label: room.label,
    kind: room.kind,
    teamId: room.teamId,
    teamLabel: room.teamLabel,
    agentCount: 0,
    runningCount: 0,
    taskCount: 0,
    signalCount: 0,
    latestFamily: null as string | null,
    residents: [] as string[],
    tone: "neutral" as OfficeRoomSnapshot["tone"],
  }));
  const roomMap = new Map(rooms.map((room) => [room.roomId, room]));
  const recentEvents = [...events].sort((left, right) => right.ts.localeCompare(left.ts));

  for (const agent of agents) {
    const room = roomMap.get(getAgentOfficeProfile(agent.agentId).homeRoomId);
    if (!room) continue;
    room.agentCount += 1;
    room.residents.push(agent.agentId);
    if (agent.status === "running") {
      room.runningCount += 1;
    }
  }

  for (const task of tasks) {
    if (!task.assignee) continue;
    const room = roomMap.get(getAgentOfficeProfile(task.assignee).homeRoomId);
    if (!room) continue;
    room.taskCount += 1;
    if (task.state === "blocked") {
      room.signalCount += 2;
    } else if (task.state === "review" || task.state === "active") {
      room.signalCount += 1;
    }
  }

  for (const event of recentEvents) {
    const room = roomMap.get(getAgentOfficeProfile(event.actor.id).homeRoomId);
    if (!room) continue;
    room.latestFamily ??= getEventFamily(event.type);
    if (
      event.type.includes("approval") ||
      event.type.includes("question") ||
      event.type.startsWith("handoff.")
    ) {
      room.signalCount += 1;
    }
  }

  for (const room of rooms) {
    room.tone =
      room.signalCount >= 2 ? "danger" : room.runningCount > 0 || room.signalCount > 0 ? "info" : room.agentCount > 0 ? "warning" : "neutral";
  }

  const handoffs = recentEvents
    .filter((event) => event.type.startsWith("handoff."))
    .slice(0, 4)
    .map<OfficeHandoffSnapshot>((event) => {
      const targetId =
        typeof event.payload.target === "string"
          ? event.payload.target
          : typeof event.payload.assignee === "string"
            ? event.payload.assignee
            : "unassigned";
      const fromRoomId = getAgentOfficeProfile(event.actor.id).homeRoomId;
      const toRoomId = getAgentOfficeProfile(targetId).homeRoomId;
      return {
        id: event.event_id,
        fromRoomId,
        fromLabel: getOfficeRoomLabel(fromRoomId),
        toRoomId,
        toLabel: getOfficeRoomLabel(toRoomId),
        taskId: event.task_id ?? "unknown-task",
        actorId: event.actor.id,
        targetId,
        timestamp: event.ts,
      };
    });

  return {
    occupiedRooms: rooms.filter((room) => room.agentCount > 0).length,
    activeRooms: rooms.filter((room) => room.runningCount > 0 || room.taskCount > 0).length,
    handoffCount: handoffs.length,
    rooms,
    handoffs,
  };
}

export function getEventFamily(type: string) {
  return type.split(".")[0] ?? "system";
}

function getOfficeRoomLabel(roomId: string) {
  return OFFICE_STAGE_ROOMS.find((room) => room.roomId === roomId)?.label ?? "Central Commons";
}

function getSocketTone(status: string) {
  switch (status) {
    case "open":
      return "live";
    case "connecting":
      return "warning";
    case "closed":
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}
