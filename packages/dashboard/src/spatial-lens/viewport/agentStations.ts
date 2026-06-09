import { ROOM_TEMPLATES, ROOM_TEMPLATE_IDS, type RoomTemplateId } from "./roomTemplates.ts";

export type AgentVisualRole =
  | "architect"
  | "sentinel"
  | "owner"
  | "worker"
  | "researcher"
  | "reviewer"
  | "unknown";

export type AgentFacing = "north" | "east" | "south" | "west";

export interface AgentStationSpec {
  readonly id: string;
  readonly roomId: RoomTemplateId;
  readonly slotId: string;
  readonly x: number;
  readonly y: number;
  readonly facing: AgentFacing;
  readonly roleHint: AgentVisualRole;
  readonly sourceRole: string;
  readonly priority: number;
  readonly workstationId?: string;
}

export const AGENT_STATIONS: readonly AgentStationSpec[] = ROOM_TEMPLATE_IDS.flatMap(
  (roomId) => {
    const template = ROOM_TEMPLATES[roomId];
    return template.agentSlots.map<AgentStationSpec>((slot, index) => {
      const workstation = findNearestWorkstation(template.workstations, slot.x, slot.y);
      return {
        id: `${roomId}.${slot.id}`,
        roomId,
        slotId: slot.id,
        x: slot.x,
        y: slot.y,
        facing: workstation?.facing ?? inferFacingFromPosition(slot.x),
        roleHint: mapStationRoleHint(slot.role),
        sourceRole: slot.role,
        priority: index,
        workstationId: workstation?.id,
      };
    });
  },
);

export function getAgentStationsForRoom(roomId: string): readonly AgentStationSpec[] {
  return AGENT_STATIONS.filter((station) => station.roomId === roomId);
}

export function mapStationRoleHint(role: string): AgentVisualRole {
  const normalized = role.toLowerCase();
  if (
    normalized.includes("architect") ||
    normalized.includes("dispatch") ||
    normalized.includes("handoff")
  ) {
    return "architect";
  }
  if (
    normalized.includes("lead") ||
    normalized.includes("owner") ||
    normalized.includes("advisor")
  ) {
    return "owner";
  }
  if (
    normalized.includes("validator") ||
    normalized.includes("reviewer") ||
    normalized.includes("gate")
  ) {
    return "sentinel";
  }
  if (normalized.includes("research") || normalized.includes("analyst")) {
    return "researcher";
  }
  if (normalized.includes("review")) {
    return "reviewer";
  }
  if (
    normalized.includes("builder") ||
    normalized.includes("release") ||
    normalized.includes("worker")
  ) {
    return "worker";
  }
  return "unknown";
}

function inferFacingFromPosition(x: number): AgentFacing {
  if (x > 68) return "west";
  if (x < 18) return "east";
  return "south";
}

function findNearestWorkstation(
  workstations: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly facing: AgentFacing;
  }[],
  x: number,
  y: number,
) {
  return workstations
    .slice()
    .sort((left, right) => {
      const leftDistance = squaredDistance(left.x, left.y, x, y);
      const rightDistance = squaredDistance(right.x, right.y, x, y);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left.id.localeCompare(right.id);
    })[0];
}

function squaredDistance(leftX: number, leftY: number, rightX: number, rightY: number) {
  return (leftX - rightX) ** 2 + (leftY - rightY) ** 2;
}
