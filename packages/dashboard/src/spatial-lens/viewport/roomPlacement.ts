import type { FloorLayoutPoint, FloorLayoutRect } from "./floorLayout.ts";
import type { RoomTemplateId } from "./roomTemplates.ts";

export type RoomDoorSide = "north" | "east" | "south" | "west";
export type RoomDoorRole = "in" | "out" | "both";

export interface RoomDoorPlacement {
  readonly id: string;
  readonly roomId: RoomTemplateId;
  readonly side: RoomDoorSide;
  readonly role: RoomDoorRole;
  readonly x: number;
  readonly y: number;
  readonly state: "open" | "closed";
  readonly corridorNodeId: string;
}

export const ROOM_DOOR_PLACEMENTS = [
  {
    id: "door.ops-control.east",
    roomId: "ops-control",
    side: "east",
    role: "out",
    x: 100,
    y: 50,
    state: "open",
    corridorNodeId: "node.ops-control",
  },
  {
    id: "door.impl-office.east",
    roomId: "impl-office",
    side: "east",
    role: "both",
    x: 100,
    y: 38,
    state: "open",
    corridorNodeId: "node.impl-office",
  },
  {
    id: "door.project-main.north",
    roomId: "project-main",
    side: "north",
    role: "both",
    x: 82,
    y: 0,
    state: "open",
    corridorNodeId: "node.commons",
  },
  {
    id: "door.research-lab.west",
    roomId: "research-lab",
    side: "west",
    role: "both",
    x: 0,
    y: 52,
    state: "open",
    corridorNodeId: "node.research-lab",
  },
  {
    id: "door.validation-office.west",
    roomId: "validation-office",
    side: "west",
    role: "in",
    x: 0,
    y: 54,
    state: "open",
    corridorNodeId: "node.validation-office",
  },
  {
    id: "door.review-office.west",
    roomId: "review-office",
    side: "west",
    role: "both",
    x: 0,
    y: 48,
    state: "open",
    corridorNodeId: "node.review-office",
  },
] as const satisfies readonly RoomDoorPlacement[];

export function getRoomDoorPlacements(roomId: string): readonly RoomDoorPlacement[] {
  return ROOM_DOOR_PLACEMENTS.filter((door) => door.roomId === roomId);
}

export function getPrimaryRoomDoorPlacement(
  roomId: string,
  role: RoomDoorRole | "any" = "any",
): RoomDoorPlacement | null {
  const doors = getRoomDoorPlacements(roomId);
  if (role === "any") return doors[0] ?? null;
  return (
    doors.find((door) => door.role === role || door.role === "both") ??
    doors[0] ??
    null
  );
}

export function resolveRoomDoorPoint(
  roomRect: FloorLayoutRect,
  door: Pick<RoomDoorPlacement, "x" | "y">,
): FloorLayoutPoint {
  return {
    left: roomRect.x + (roomRect.w * door.x) / 100,
    top: roomRect.y + (roomRect.h * door.y) / 100,
  };
}
