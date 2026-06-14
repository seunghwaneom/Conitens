import type { FloorLayoutPoint, FloorLayoutRect } from "./floorLayout.ts";
import {
  getPrimaryRoomDoorPlacement,
  resolveRoomDoorPoint,
} from "./roomPlacement.ts";

export type CorridorSegmentKind = "corridor" | "stub" | "hub";
export type CorridorSegmentAxis = "x" | "y" | "area";

export interface CorridorSegmentSpec {
  readonly id: string;
  readonly kind: CorridorSegmentKind;
  readonly rect: FloorLayoutRect;
  readonly axis: CorridorSegmentAxis;
  readonly floorAssetId: string;
  readonly connectsRoomIds?: readonly string[];
}

export type CorridorNodeKind = "threshold" | "route" | "hub" | "light";

export interface CorridorNodeSpec {
  readonly id: string;
  readonly kind: CorridorNodeKind;
  readonly point: FloorLayoutPoint;
  readonly label?: string;
}

export interface DoorAlignedRouteInput {
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly fromRoomRect: FloorLayoutRect;
  readonly toRoomRect: FloorLayoutRect;
  readonly from: FloorLayoutPoint;
  readonly to: FloorLayoutPoint;
}

export const CORRIDOR_SPINE_CENTER_X = 47.5;
export const CORRIDOR_WIDTH_PERCENT = 7;
export const CORRIDOR_HANDOFF_HUB_POINT = { left: 47.5, top: 45.5 } as const;

export const FLOOR_CORRIDOR_SEGMENTS = [
  {
    id: "corridor.central-spine",
    kind: "corridor",
    rect: { x: 44, y: 4, w: CORRIDOR_WIDTH_PERCENT, h: 88 },
    axis: "y",
    floorAssetId: "floor.corridor",
  },
  {
    id: "corridor.ops-stub",
    kind: "stub",
    rect: { x: 33, y: 10, w: 11, h: 5.8 },
    axis: "x",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["ops-control"],
  },
  {
    id: "corridor.impl-stub",
    kind: "stub",
    rect: { x: 33, y: 36, w: 11, h: 5.8 },
    axis: "x",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["impl-office"],
  },
  {
    id: "corridor.commons-threshold",
    kind: "stub",
    rect: { x: 47, y: 56, w: 7, h: 8 },
    axis: "y",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["project-main"],
  },
  {
    id: "corridor.research-stub",
    kind: "stub",
    rect: { x: 51, y: 66.5, w: 10, h: 5.8 },
    axis: "x",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["research-lab"],
  },
  {
    id: "corridor.validation-stub",
    kind: "stub",
    rect: { x: 51, y: 12, w: 10, h: 5.8 },
    axis: "x",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["validation-office"],
  },
  {
    id: "corridor.review-stub",
    kind: "stub",
    rect: { x: 51, y: 37.2, w: 10, h: 5.8 },
    axis: "x",
    floorAssetId: "floor.lane",
    connectsRoomIds: ["review-office"],
  },
  {
    id: "corridor.handoff-hub-pad",
    kind: "hub",
    rect: { x: 43.1, y: 41.2, w: 8.8, h: 9 },
    axis: "area",
    floorAssetId: "floor.lane",
  },
] as const satisfies readonly CorridorSegmentSpec[];

export const CORRIDOR_NODES = [
  { id: "node.ops-control", kind: "threshold", point: { left: 36.8, top: 12.9 }, label: "Ops door" },
  { id: "node.impl-office", kind: "threshold", point: { left: 36.8, top: 38.8 }, label: "Impl door" },
  { id: "node.commons", kind: "threshold", point: { left: 53.7, top: 60 }, label: "Commons door" },
  { id: "node.research-lab", kind: "threshold", point: { left: 58.5, top: 69.4 }, label: "Research door" },
  { id: "node.validation-office", kind: "threshold", point: { left: 58.5, top: 14.9 }, label: "Validation door" },
  { id: "node.review-office", kind: "threshold", point: { left: 58.5, top: 40 }, label: "Review door" },
  { id: "node.handoff-hub", kind: "hub", point: CORRIDOR_HANDOFF_HUB_POINT, label: "Handoff hub" },
  { id: "node.route-north", kind: "route", point: { left: CORRIDOR_SPINE_CENTER_X, top: 23.5 } },
  { id: "node.route-south", kind: "route", point: { left: CORRIDOR_SPINE_CENTER_X, top: 72 } },
] as const satisfies readonly CorridorNodeSpec[];

export function createDoorAlignedHandoffRoute({
  fromRoomId,
  toRoomId,
  fromRoomRect,
  toRoomRect,
  from,
  to,
}: DoorAlignedRouteInput): readonly FloorLayoutPoint[] {
  const fromDoor = getPrimaryRoomDoorPlacement(fromRoomId, "out");
  const toDoor = getPrimaryRoomDoorPlacement(toRoomId, "in");
  const fromDoorPoint = fromDoor
    ? resolveRoomDoorPoint(fromRoomRect, fromDoor)
    : from;
  const toDoorPoint = toDoor
    ? resolveRoomDoorPoint(toRoomRect, toDoor)
    : to;

  return [
    from,
    fromDoorPoint,
    { left: CORRIDOR_SPINE_CENTER_X, top: fromDoorPoint.top },
    CORRIDOR_HANDOFF_HUB_POINT,
    { left: CORRIDOR_SPINE_CENTER_X, top: toDoorPoint.top },
    toDoorPoint,
    to,
  ];
}

export function getBlockedLaneCorridorPoint(roomId: string): FloorLayoutPoint {
  if (roomId === "ops-control") {
    return { left: CORRIDOR_SPINE_CENTER_X, top: 24 };
  }
  if (roomId === "validation-office") {
    return { left: CORRIDOR_SPINE_CENTER_X, top: 22 };
  }
  return { left: CORRIDOR_SPINE_CENTER_X, top: 49 };
}

export function isPointInsideCorridor(
  point: FloorLayoutPoint,
  segments: readonly Pick<CorridorSegmentSpec, "rect">[] = FLOOR_CORRIDOR_SEGMENTS,
): boolean {
  return segments.some(({ rect }) =>
    point.left >= rect.x &&
    point.left <= rect.x + rect.w &&
    point.top >= rect.y &&
    point.top <= rect.y + rect.h,
  );
}
