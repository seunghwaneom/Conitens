import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { TaskState } from "../../store/event-store.js";
import type { AgentStationSpec, AgentVisualRole } from "./agentStations.js";

export type AgentVisualState =
  | "idle"
  | "walking"
  | "working"
  | "reviewing"
  | "blocked"
  | "waiting_for_input"
  | "handoff_sending"
  | "handoff_receiving"
  | "unknown";

export type AgentActivityCueKind =
  | "active"
  | "review"
  | "blocked"
  | "assigned"
  | "handoff_send"
  | "handoff_receive"
  | "idle";

export type AgentActivityCueTone =
  | "live"
  | "review"
  | "danger"
  | "assigned"
  | "handoff"
  | "idle";

export interface AgentVisualInput {
  readonly agentId: string;
  readonly status?: string;
  readonly roomId?: string;
  readonly profile?: {
    readonly role?: string;
  };
  readonly taskCount?: number;
  readonly roleTaskCount?: number;
}

export interface AgentActivityCue {
  readonly kind: AgentActivityCueKind;
  readonly tone: AgentActivityCueTone;
  readonly label: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly priority: number;
}

export interface AgentStationMatchOptions {
  readonly visualRole?: AgentVisualRole;
  readonly excludedStationIds?: ReadonlySet<string>;
}

const ACTIVE_STATES = new Set(["active", "running", "in_progress"]);
const REVIEW_STATES = new Set(["review", "validating", "approval"]);

export function mapAgentToVisualRole(agent: AgentVisualInput): AgentVisualRole {
  const normalizedAgentId = agent.agentId.toLowerCase();
  const normalizedProfileRole = agent.profile?.role?.toLowerCase() ?? "";

  if (
    normalizedAgentId.includes("sentinel") ||
    normalizedAgentId.includes("validator") ||
    normalizedProfileRole === "validator"
  ) {
    return "sentinel";
  }
  if (
    normalizedAgentId.includes("owner") ||
    normalizedAgentId.includes("manager") ||
    normalizedAgentId.includes("floor-lead")
  ) {
    return "owner";
  }
  if (
    normalizedAgentId.includes("architect") ||
    normalizedAgentId.includes("orchestrator") ||
    normalizedAgentId.includes("ops") ||
    normalizedProfileRole === "orchestrator"
  ) {
    return "architect";
  }
  if (normalizedProfileRole === "reviewer" || normalizedAgentId.includes("review")) {
    return "reviewer";
  }
  if (
    normalizedProfileRole === "researcher" ||
    normalizedAgentId.includes("research") ||
    normalizedAgentId.includes("analyst")
  ) {
    return "researcher";
  }
  if (
    normalizedProfileRole === "implementer" ||
    normalizedAgentId.includes("worker") ||
    normalizedAgentId.includes("builder") ||
    normalizedAgentId.includes("implement")
  ) {
    return "worker";
  }
  return "unknown";
}

export function mapAgentToVisualState(
  agent: AgentVisualInput,
  tasks: readonly TaskState[] = [],
  handoffs: readonly OfficeHandoffSnapshot[] = [],
): AgentVisualState {
  const agentTasks = tasks.filter((task) => task.assignee === agent.agentId);
  const visualRole = mapAgentToVisualRole(agent);
  const receivesHandoff = handoffs.some((handoff) => handoff.targetId === agent.agentId);
  const sendsHandoff = handoffs.some((handoff) => handoff.actorId === agent.agentId);

  if (agent.status === "error" || agentTasks.some((task) => task.state === "blocked")) {
    return "blocked";
  }
  if (agentTasks.some((task) => REVIEW_STATES.has(task.state))) {
    return "reviewing";
  }
  if (receivesHandoff && (visualRole === "sentinel" || visualRole === "reviewer")) {
    return "reviewing";
  }
  if (agentTasks.some((task) => ACTIVE_STATES.has(task.state)) || agent.status === "running") {
    return "working";
  }
  if (receivesHandoff) {
    return "handoff_receiving";
  }
  if (sendsHandoff) {
    return "handoff_sending";
  }
  if (agentTasks.some((task) => task.state === "assigned")) {
    return "waiting_for_input";
  }
  if (agent.status === "terminated") {
    return "unknown";
  }
  return "idle";
}

export function mapAgentToStation(
  agent: AgentVisualInput,
  stations: readonly AgentStationSpec[],
  options: AgentStationMatchOptions = {},
): AgentStationSpec | null {
  const visualRole = options.visualRole ?? mapAgentToVisualRole(agent);
  const roomStations = stations.filter((station) => {
    if (agent.roomId && station.roomId !== agent.roomId) return false;
    return !options.excludedStationIds?.has(station.id);
  });
  const candidates = roomStations.length > 0
    ? roomStations
    : stations.filter((station) => !options.excludedStationIds?.has(station.id));

  return candidates
    .slice()
    .sort((left, right) => {
      const leftScore = scoreStationRole(left.roleHint, visualRole);
      const rightScore = scoreStationRole(right.roleHint, visualRole);
      if (leftScore !== rightScore) return leftScore - rightScore;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.id.localeCompare(right.id);
    })[0] ?? null;
}

export function mapTaskToActivityCue(task: TaskState): AgentActivityCue | null {
  if (task.state === "blocked") {
    return {
      kind: "blocked",
      tone: "danger",
      label: "Blocked",
      taskId: task.taskId,
      priority: 0,
    };
  }
  if (REVIEW_STATES.has(task.state)) {
    return {
      kind: "review",
      tone: "review",
      label: "Review",
      taskId: task.taskId,
      priority: 1,
    };
  }
  if (ACTIVE_STATES.has(task.state)) {
    return {
      kind: "active",
      tone: "live",
      label: "Active",
      taskId: task.taskId,
      priority: 2,
    };
  }
  if (task.state === "assigned") {
    return {
      kind: "assigned",
      tone: "assigned",
      label: "Assigned",
      taskId: task.taskId,
      priority: 3,
    };
  }
  return null;
}

export function mapHandoffToActivityCue(
  handoff: OfficeHandoffSnapshot,
  agent?: AgentVisualInput,
): AgentActivityCue {
  const direction = agent?.agentId === handoff.actorId
    ? "handoff_send"
    : agent?.agentId === handoff.targetId
      ? "handoff_receive"
      : "handoff_receive";
  return {
    kind: direction,
    tone: "handoff",
    label: direction === "handoff_send" ? "Sending handoff" : "Receiving handoff",
    taskId: handoff.taskId,
    handoffId: handoff.id,
    priority: direction === "handoff_receive" ? 1 : 2,
  };
}

export function chooseAgentActivityCue(
  agent: AgentVisualInput,
  tasks: readonly TaskState[] = [],
  handoffs: readonly OfficeHandoffSnapshot[] = [],
): AgentActivityCue {
  const taskCue = tasks
    .filter((task) => task.assignee === agent.agentId)
    .map(mapTaskToActivityCue)
    .filter((cue): cue is AgentActivityCue => cue !== null)
    .sort(compareActivityCue)[0];
  const handoffCue = handoffs
    .filter((handoff) => handoff.actorId === agent.agentId || handoff.targetId === agent.agentId)
    .map((handoff) => mapHandoffToActivityCue(handoff, agent))
    .sort(compareActivityCue)[0];

  return [taskCue, handoffCue]
    .filter((cue): cue is AgentActivityCue => cue !== undefined)
    .sort(compareActivityCue)[0] ?? {
      kind: "idle",
      tone: "idle",
      label: "Idle",
      priority: 9,
    };
}

export function shouldRenderAgentInOperatorFocusMap(
  agent: AgentVisualInput,
  state: AgentVisualState,
  cue: AgentActivityCue,
): boolean {
  if (agent.status === "running") return true;
  if (
    state === "working" ||
    state === "reviewing" ||
    state === "handoff_sending" ||
    state === "handoff_receiving"
  ) {
    return true;
  }
  return (
    cue.kind === "active" ||
    cue.kind === "review" ||
    cue.kind === "handoff_send" ||
    cue.kind === "handoff_receive"
  );
}

function scoreStationRole(stationRole: AgentVisualRole, visualRole: AgentVisualRole): number {
  if (stationRole === visualRole) return 0;
  if (visualRole === "reviewer" && stationRole === "sentinel") return 1;
  if (visualRole === "researcher" && stationRole === "worker") return 2;
  if (visualRole === "unknown") return 4;
  return 3;
}

function compareActivityCue(left: AgentActivityCue, right: AgentActivityCue): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  return left.label.localeCompare(right.label);
}
