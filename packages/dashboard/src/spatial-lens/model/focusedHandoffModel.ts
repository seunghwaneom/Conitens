import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import type { EventRecord, TaskState } from "../../store/event-store.js";
import { deriveFocusedNextAction, type FocusedNextActionCtaLabel, type FocusedNextActionHref, type FocusedNextActionKind } from "./focusedNextAction.ts";
import { deriveFocusedWorkbenchEventSummary, type FocusedWorkbenchEdge } from "./focusedWorkbenchEvents.ts";

export type FocusedWorkbenchStepId = "plan" | "blocked" | "validate" | "approve";
export type FocusedWorkbenchTone = "running" | "blocked" | "review" | "idle";
export type { FocusedNextActionKind } from "./focusedNextAction.ts";

export interface FocusedWorkbenchStep {
  readonly id: FocusedWorkbenchStepId;
  readonly label: string;
  readonly primary: string;
  readonly state: string;
  readonly meta: string;
  readonly detail: string;
  readonly tone: FocusedWorkbenchTone;
  readonly entityKind: "agent" | "task" | "gate";
}

export interface FocusedSpatialContext {
  readonly id: "ops-control" | "validation-office";
  readonly label: string;
  readonly meta: string;
  readonly state: string;
  readonly roomId: string;
  readonly sprite: string;
  readonly tone: FocusedWorkbenchTone;
}

export interface FocusedHandoffWorkbenchModel {
  readonly activeAgentId: string;
  readonly blockedTaskId: string;
  readonly nextOwnerId: string;
  readonly nextActionKind: FocusedNextActionKind;
  readonly nextActionLabel: string;
  readonly nextActionCtaLabel: FocusedNextActionCtaLabel;
  readonly nextActionHref: FocusedNextActionHref;
  readonly nextActionDetail: string;
  readonly headline: string;
  readonly handoffSummaryLabel: string;
  readonly routeLabel: string;
  readonly blockedAgeLabel: string;
  readonly latestEventLabel: string;
  readonly liveRoomCount: number;
  readonly blockedLaneCount: number;
  readonly handoffCount: number;
  readonly currentFocusLabel: string;
  readonly steps: readonly FocusedWorkbenchStep[];
  readonly edges: readonly FocusedWorkbenchEdge[];
  readonly spatialContexts: readonly FocusedSpatialContext[];
}

export function createFocusedHandoffWorkbenchModel({
  rooms,
  tasks,
  handoffs,
  events = [],
  selectedRoomId,
  selectedResidentId,
}: {
  rooms: readonly OfficeRoomPresence[];
  tasks: readonly TaskState[];
  handoffs: readonly OfficeHandoffSnapshot[];
  events?: readonly EventRecord[];
  selectedRoomId: string | null;
  selectedResidentId: string | null;
}): FocusedHandoffWorkbenchModel {
  const activeHandoff =
    handoffs.find((handoff) => handoff.actorId === "architect" && handoff.targetId === "sentinel") ??
    handoffs.find((handoff) => handoff.targetId === "sentinel") ??
    handoffs[0];
  const blockedTask =
    tasks.find((task) => task.taskId === "q_184_owner_gate" && task.state === "blocked") ??
    tasks.find((task) => task.state === "blocked");
  const reviewTask =
    tasks.find((task) => task.taskId === "verify_append") ??
    tasks.find((task) => task.state === "review");
  const activeTask =
    tasks.find(
      (task) =>
        task.assignee === activeHandoff?.actorId &&
        (task.state === "active" || task.state === "assigned"),
    ) ??
    tasks.find((task) => task.state === "active");

  const actorId = activeHandoff?.actorId ?? activeTask?.assignee ?? "architect";
  const targetId = activeHandoff?.targetId ?? reviewTask?.assignee ?? "sentinel";
  const ownerId = blockedTask?.assignee ?? "owner";
  const fallbackTask = reviewTask ?? activeTask ?? tasks[0];
  const blockedTaskId = blockedTask?.taskId ?? fallbackTask?.taskId ?? "no_blocked_task";
  const blockedTaskState = blockedTask?.state ?? "clear";
  const handoffTaskId = activeHandoff?.taskId ?? reviewTask?.taskId ?? "verify_append";
  const handoffSummaryLabel = `${handoffTaskId} handoff: ${actorId} -> ${targetId}`;
  const nextAction = deriveFocusedNextAction({
    blockedTask,
    reviewTask,
    blockedTaskId,
    ownerId,
    targetId,
  });
  const actorRoomLabel = getRoomLabel(rooms, activeHandoff?.fromRoomId ?? "ops-control", "Ops Control");
  const targetRoomLabel = getRoomLabel(
    rooms,
    activeHandoff?.toRoomId ?? "validation-office",
    "Validation Office",
  );
  const residents = rooms.flatMap((room) => room.residents);
  const actorState = getAgentWorkState(actorId, residents, tasks, handoffs);
  const targetState = getAgentWorkState(targetId, residents, tasks, handoffs);
  const ownerState = getAgentWorkState(ownerId, residents, tasks, handoffs);

  const headline = blockedTask
    ? `${blockedTaskId} blocked at owner gate`
    : "No blocked owner gate";

  const eventSummary = deriveFocusedWorkbenchEventSummary({
    blockedTaskId,
    hasBlockedTask: blockedTask !== undefined,
    events,
  });

  return {
    activeAgentId: actorId,
    blockedTaskId,
    nextOwnerId: ownerId,
    nextActionKind: nextAction.kind,
    nextActionLabel: nextAction.label,
    nextActionCtaLabel: nextAction.ctaLabel,
    nextActionHref: nextAction.href,
    nextActionDetail: nextAction.detail,
    headline,
    handoffSummaryLabel,
    routeLabel: `${actorId}->${targetId}->${ownerId}`,
    blockedAgeLabel: eventSummary.blockedAgeLabel,
    latestEventLabel: eventSummary.latestEventLabel,
    liveRoomCount: rooms.filter((room) => room.snapshot.runningCount > 0).length,
    blockedLaneCount: tasks.filter((task) => task.state === "blocked").length,
    handoffCount: handoffs.length,
    currentFocusLabel: getCurrentFocusLabel({ rooms, selectedRoomId, selectedResidentId }) ?? actorId,
    edges: eventSummary.edges,
    steps: [
      {
        id: "plan",
        label: "PLAN",
        primary: actorId,
        state: actorState,
        meta: actorRoomLabel,
        detail: activeTask ? `Current ${activeTask.taskId}` : "Run owner",
        tone: getToneForState(actorState),
        entityKind: "agent",
      },
      {
        id: "blocked",
        label: blockedTask ? "BLOCKED" : "CLEAR",
        primary: blockedTaskId,
        state: blockedTaskState.toUpperCase(),
        meta: blockedTask ? `waiting on ${ownerId}` : "owner gate clear",
        detail: handoffSummaryLabel,
        tone: blockedTask ? "blocked" : "idle",
        entityKind: "task",
      },
      {
        id: "validate",
        label: "VALIDATE",
        primary: targetId,
        state: targetState,
        meta: targetRoomLabel,
        detail: reviewTask ? `Review ${reviewTask.taskId}` : "Review lane",
        tone: getToneForState(targetState),
        entityKind: "agent",
      },
      {
        id: "approve",
        label: "APPROVE",
        primary: ownerId,
        state: ownerState,
        meta: "owner gate",
        detail: "gate opens after approval",
        tone: getToneForState(ownerState),
        entityKind: "gate",
      },
    ],
    spatialContexts: [
      {
        id: "ops-control",
        label: actorRoomLabel,
        meta: actorId,
        state: actorState,
        roomId: activeHandoff?.fromRoomId ?? "ops-control",
        sprite: "prop.packet",
        tone: getToneForState(actorState),
      },
      {
        id: "validation-office",
        label: targetRoomLabel,
        meta: targetId,
        state: targetState,
        roomId: activeHandoff?.toRoomId ?? "validation-office",
        sprite: "prop.checkScanner",
        tone: getToneForState(targetState),
      },
    ],
  };
}

function getCurrentFocusLabel({
  rooms,
  selectedRoomId,
  selectedResidentId,
}: {
  rooms: readonly OfficeRoomPresence[];
  selectedRoomId: string | null;
  selectedResidentId: string | null;
}): string | null {
  if (selectedResidentId) return selectedResidentId;
  if (selectedRoomId) {
    return rooms.find((room) => room.roomId === selectedRoomId)?.label ?? selectedRoomId;
  }
  return null;
}

export function getAgentWorkState(
  agentId: string,
  residents: readonly { agentId: string; status: string }[],
  tasks: readonly TaskState[],
  handoffs: readonly OfficeHandoffSnapshot[],
): string {
  const assigneeTasks = tasks.filter((task) => task.assignee === agentId);
  if (assigneeTasks.some((task) => task.state === "blocked")) return "BLOCKED";
  if (
    assigneeTasks.some((task) => task.state === "review") ||
    handoffs.some((handoff) => handoff.targetId === agentId)
  ) {
    return "REVIEW";
  }
  const resident = residents.find((entry) => entry.agentId === agentId);
  if (resident?.status === "running") return "RUNNING";
  if (assigneeTasks.some((task) => task.state === "active")) return "ACTIVE";
  if (resident) return resident.status.toUpperCase();
  const nonterminalTask = assigneeTasks.find((task) => task.state !== "done");
  return nonterminalTask?.state.toUpperCase() ?? "WAITING";
}

function getRoomLabel(
  rooms: readonly OfficeRoomPresence[],
  roomId: string | null | undefined,
  fallback: string,
): string {
  if (!roomId) return fallback;
  return rooms.find((room) => room.roomId === roomId)?.label ?? fallback;
}

function getToneForState(state: string): FocusedWorkbenchTone {
  const normalized = state.toLowerCase();
  if (normalized === "blocked") return "blocked";
  if (normalized === "review" || normalized === "reviewing") return "review";
  if (normalized === "running" || normalized === "active") return "running";
  return "idle";
}
