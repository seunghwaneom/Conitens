import {
  OFFICE_AGENT_PROFILES,
  type AgentOfficeProfile,
  type AgentOfficeRole,
} from "./agent-profiles.ts";
import type { OfficeHandoffSnapshot } from "./dashboard-model.ts";
import type { OfficeResidentPresence } from "./office-presence-model.ts";
import type { OfficeAvatarFacing, OfficeAvatarPose } from "./office-avatar-sprites.ts";
import {
  GENERATED_AGENT_SPRITE_MANIFEST,
  type AgentMotionProfile,
} from "./agent-sprite-manifest.generated.ts";
import { getAgentWorkState } from "./spatial-lens/model/focusedHandoffModel.ts";
import {
  deriveFocusedNextAction,
  type FocusedNextActionCtaLabel,
  type FocusedNextActionHref,
  type FocusedNextActionKind,
} from "./spatial-lens/model/focusedNextAction.ts";
import type { TaskState } from "./store/event-store.js";

export const AGENT_ROLE_MOTION_PROFILES = {
  orchestrator: GENERATED_AGENT_SPRITE_MANIFEST.roles.orchestrator.motionProfile,
  implementer: GENERATED_AGENT_SPRITE_MANIFEST.roles.implementer.motionProfile,
  researcher: GENERATED_AGENT_SPRITE_MANIFEST.roles.researcher.motionProfile,
  reviewer: GENERATED_AGENT_SPRITE_MANIFEST.roles.reviewer.motionProfile,
  validator: GENERATED_AGENT_SPRITE_MANIFEST.roles.validator.motionProfile,
} as const satisfies Record<AgentOfficeRole, AgentMotionProfile>;

const AGENT_MOTION_LABELS = {
  "command-pulse": "Command pulse",
  "build-shift": "Build cadence",
  "research-orbit": "Evidence sweep",
  "review-scan": "Review scan",
  "verify-brace": "Verify brace",
} as const satisfies Record<AgentMotionProfile, string>;

export interface AgentCharacterCardModel {
  readonly agentId: string;
  readonly role: AgentOfficeRole;
  readonly profile: AgentOfficeProfile;
  readonly archetype: string;
  readonly accent: string;
  readonly selected: boolean;
  readonly workState: string;
  readonly taskCount: number;
  readonly taskLabel: string;
  readonly roomLabel: string;
  readonly motionProfile: AgentMotionProfile;
  readonly motionLabel: string;
  readonly spriteSource: "sprite-gen";
  readonly pose: OfficeAvatarPose;
  readonly facing: OfficeAvatarFacing;
  readonly signatureProp: string;
  readonly habitLabel: string;
}

export interface AgentCharacterStageModel {
  readonly handoffLabel: string;
  readonly blockedLabel: string;
  readonly nextActionLabel: string;
  readonly nextActionCtaLabel: FocusedNextActionCtaLabel;
  readonly nextActionHref: FocusedNextActionHref;
  readonly nextActionKind: FocusedNextActionKind;
  readonly nextActionDetail: string;
  readonly cards: readonly AgentCharacterCardModel[];
}

export function createAgentCharacterStageModel({
  residents,
  tasks,
  handoffs,
  selectedResidentId,
}: {
  residents: readonly OfficeResidentPresence[];
  tasks: readonly TaskState[];
  handoffs: readonly OfficeHandoffSnapshot[];
  selectedResidentId: string | null;
}): AgentCharacterStageModel {
  const activeHandoff = handoffs.find((handoff) => handoff.targetId === "sentinel") ?? handoffs[0];
  const blockedTask = tasks.find((task) => task.state === "blocked");
  const reviewTask = tasks.find((task) => task.taskId === "verify_append") ?? tasks.find((task) => task.state === "review");
  const ownerId = blockedTask?.assignee ?? "owner";
  const targetId = activeHandoff?.targetId ?? reviewTask?.assignee ?? "sentinel";
  const blockedTaskId = blockedTask?.taskId ?? reviewTask?.taskId ?? "no_blocked_task";
  const nextAction = deriveFocusedNextAction({
    blockedTask,
    reviewTask,
    blockedTaskId,
    ownerId,
    targetId,
  });
  const order = getCharacterOrder({ activeHandoff, blockedTask, selectedResidentId });
  const sortedResidents = [...residents].sort((left, right) => getOrderIndex(left.agentId, order) - getOrderIndex(right.agentId, order));

  return {
    handoffLabel: activeHandoff
      ? `${activeHandoff.taskId}: ${activeHandoff.actorId} -> ${activeHandoff.targetId}`
      : "No active handoff",
    blockedLabel: blockedTask ? `${blockedTask.taskId} blocked at ${blockedTask.assignee ?? "unassigned"}` : "No blocked task",
    nextActionLabel: nextAction.label,
    nextActionCtaLabel: nextAction.ctaLabel,
    nextActionHref: nextAction.href,
    nextActionKind: nextAction.kind,
    nextActionDetail: nextAction.detail,
    cards: sortedResidents.map((resident) => {
      const task = pickTaskForAgent(resident.agentId, tasks);
      const profile = getCharacterProfile(resident);
      const motionProfile = AGENT_ROLE_MOTION_PROFILES[profile.role];
      return {
        agentId: resident.agentId,
        role: profile.role,
        profile,
        archetype: profile.archetype,
        accent: profile.accent,
        selected: resident.agentId === selectedResidentId,
        workState: getAgentWorkState(resident.agentId, residents, tasks, handoffs),
        taskCount: resident.taskCount,
        taskLabel: task?.taskId ?? "standby",
        roomLabel: resident.roomLabel,
        motionProfile,
        motionLabel: AGENT_MOTION_LABELS[motionProfile],
        spriteSource: "sprite-gen",
        pose: getPoseForRole(profile.stance),
        facing: getFacingForRole(profile.role),
        signatureProp: formatAgentTrait(profile.signatureProp),
        habitLabel: formatAgentTrait(profile.habits[0] ?? "steady"),
      };
    }),
  };
}

function getCharacterProfile(resident: OfficeResidentPresence): AgentOfficeProfile {
  if (resident.agentId === "owner") {
    return {
      ...OFFICE_AGENT_PROFILES.reviewer,
      archetype: "Approval owner",
      signatureProp: "approval stamp",
      habits: ["gate-review", "check-evidence", "release-hold"],
    };
  }
  return resident.profile;
}

function getCharacterOrder({
  activeHandoff,
  blockedTask,
  selectedResidentId,
}: {
  activeHandoff: OfficeHandoffSnapshot | undefined;
  blockedTask: TaskState | undefined;
  selectedResidentId: string | null;
}): readonly string[] {
  return [
    selectedResidentId,
    activeHandoff?.actorId,
    activeHandoff?.targetId,
    blockedTask?.assignee,
  ].filter((agentId): agentId is string => agentId !== undefined && agentId !== null);
}

function getOrderIndex(agentId: string, order: readonly string[]): number {
  const index = order.indexOf(agentId);
  return index === -1 ? order.length + 1 : index;
}

function pickTaskForAgent(agentId: string, tasks: readonly TaskState[]): TaskState | undefined {
  return tasks.find((task) => task.assignee === agentId && task.state !== "done") ?? tasks.find((task) => task.assignee === agentId);
}

function formatAgentTrait(value: string): string {
  return value.replace(/-/g, " ");
}

function getPoseForRole(stance: OfficeResidentPresence["profile"]["stance"]): OfficeAvatarPose {
  if (stance === "lean") return "lean";
  if (stance === "desk") return "desk";
  if (stance === "inspect") return "inspect";
  if (stance === "guard") return "guard";
  return "stand";
}

function getFacingForRole(role: AgentOfficeRole): OfficeAvatarFacing {
  if (role === "implementer" || role === "researcher") return "left";
  if (role === "validator" || role === "reviewer") return "right";
  return "down";
}
