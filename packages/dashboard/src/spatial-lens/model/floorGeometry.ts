import type { OfficeHandoffSnapshot } from "../../dashboard-model.ts";
import type { OfficeRoomPresence } from "../../office-presence-model.ts";
import {
  OFFICE_STAGE_CORRIDOR_FIXTURES,
  type OfficeStageRoomKind,
  type OfficeStageRoomSchema,
  type OfficeStageTaskAnchor,
} from "../../office-stage-schema.ts";
import {
  resolveSpatialLensAsset,
  type SpatialLensFloorSurface,
} from "../assets/assetRegistry.ts";
import { normalizePixelStatusTone, type PixelStatusTone } from "../tokens.ts";
import {
  getRoomHandoffPort,
} from "../viewport/roomDressing.ts";
import {
  createDoorAlignedHandoffRoute,
  FLOOR_CORRIDOR_SEGMENTS,
  getBlockedLaneCorridorPoint,
  type CorridorSegmentAxis,
  type CorridorSegmentKind,
} from "../viewport/corridorGraph.ts";
import {
  SPATIAL_LENS_BUILDING_LAYOUT,
  type SpatialLensBuildingLayout,
} from "../viewport/floorLayout.ts";

export interface FloorViewportRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FloorViewportPoint {
  readonly left: number;
  readonly top: number;
}

export interface FloorViewportCorridorLane {
  readonly id: string;
  readonly kind: CorridorSegmentKind;
  readonly rect: FloorViewportRect;
  readonly axis: CorridorSegmentAxis;
  readonly floorAssetId: string;
  readonly connectsRoomIds?: readonly string[];
}

export interface FloorViewportFixture {
  readonly id: string;
  readonly kind: string;
  readonly assetId: string;
  readonly left: number;
  readonly top: number;
  readonly clusterId?: string;
}

export interface FloorViewportHandoffRoute {
  readonly id: string;
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly taskId: string;
  readonly points: readonly FloorViewportPoint[];
  readonly label: string;
  readonly isFallback: boolean;
}

export interface FloorViewportBlockedLaneMarker {
  readonly id: string;
  readonly roomId: string;
  readonly taskId: string;
  readonly label: string;
  readonly point: FloorViewportPoint;
  readonly isFallback: boolean;
}

export interface FloorViewportRoom {
  readonly id: string;
  readonly label: string;
  readonly kind: OfficeStageRoomKind;
  readonly teamLabel: string;
  readonly priority: OfficeStageRoomSchema["priority"];
  readonly rect: FloorViewportRect;
  readonly floorSurface: SpatialLensFloorSurface;
  readonly floorAssetId: string;
  readonly wallAssetIds: readonly string[];
  readonly handoffPoint: FloorViewportPoint;
  readonly handoffInPoint: FloorViewportPoint;
  readonly handoffOutPoint: FloorViewportPoint;
  readonly statusTone: PixelStatusTone;
  readonly occupancyLabel: "live" | "occupied" | "quiet";
  readonly fixtures: readonly FloorViewportFixture[];
  readonly taskCount: number;
  readonly residentCount: number;
  readonly runningCount: number;
  readonly blockedTaskCount: number;
}

export interface FloorViewportModel {
  readonly layout: SpatialLensBuildingLayout;
  readonly rooms: readonly FloorViewportRoom[];
  readonly corridors: readonly FloorViewportCorridorLane[];
  readonly corridorFixtures: readonly FloorViewportFixture[];
  readonly handoffRoutes: readonly FloorViewportHandoffRoute[];
  readonly blockedLaneMarkers: readonly FloorViewportBlockedLaneMarker[];
  readonly selectedRoomId: string | null;
  readonly liveRoomCount: number;
  readonly totalFixtureCount: number;
}

export function createFloorViewportModel({
  rooms,
  handoffs = [],
  selectedRoomId = null,
}: {
  rooms: readonly OfficeRoomPresence[];
  handoffs?: readonly OfficeHandoffSnapshot[];
  selectedRoomId?: string | null;
}): FloorViewportModel {
  const validSelectedRoomId = rooms.some((room) => room.roomId === selectedRoomId)
    ? selectedRoomId
    : rooms[0]?.roomId ?? null;
  const viewportRooms = rooms.map(createFloorViewportRoom);
  const corridorFixtures = OFFICE_STAGE_CORRIDOR_FIXTURES.map((fixture, index) => ({
    id: `corridor-fixture.${fixture.kind}.${index}`,
    kind: fixture.kind,
    assetId: getFurnitureAssetId(fixture.kind),
    left: fixture.left,
    top: fixture.top,
  }));

  return {
    layout: SPATIAL_LENS_BUILDING_LAYOUT,
    rooms: viewportRooms,
    corridors: FLOOR_CORRIDOR_SEGMENTS,
    corridorFixtures,
    handoffRoutes: createFloorViewportHandoffRoutes(viewportRooms, handoffs),
    blockedLaneMarkers: createFloorViewportBlockedMarkers(rooms, viewportRooms),
    selectedRoomId: validSelectedRoomId,
    liveRoomCount: viewportRooms.filter((room) => room.occupancyLabel === "live").length,
    totalFixtureCount:
      corridorFixtures.length +
      viewportRooms.reduce((count, room) => count + room.fixtures.length, 0),
  };
}

export function createFloorViewportRoom(room: OfficeRoomPresence): FloorViewportRoom {
  const floorSurface = getFloorSurfaceForRoom(room.schema);
  const handoffOutPort = getRoomHandoffPort(room.roomId, "out");
  const handoffInPort = getRoomHandoffPort(room.roomId, "in");
  const handoffFallback = resolveRoomPoint(room.schema, room.schema.handoffAnchor);
  const fixtures = room.schema.fixtureClusters.flatMap((cluster) =>
    cluster.fixtures.map<FloorViewportFixture>((fixture, index) => ({
      id: `${room.roomId}.${cluster.id}.${fixture.kind}.${index}`,
      kind: fixture.kind,
      assetId: getFurnitureAssetId(fixture.kind),
      left: fixture.left,
      top: fixture.top,
      clusterId: cluster.id,
    })),
  );

  return {
    id: room.roomId,
    label: room.label,
    kind: room.kind,
    teamLabel: room.teamLabel,
    priority: room.schema.priority,
    rect: {
      x: room.schema.x,
      y: room.schema.y,
      w: room.schema.w,
      h: room.schema.h,
    },
    floorSurface,
    floorAssetId: getFloorAssetId(floorSurface),
    wallAssetIds: ["wall.north", "wall.east", "wall.south", "wall.west"],
    handoffPoint: handoffOutPort
      ? resolveTemplatePoint(room.schema, handoffOutPort)
      : handoffFallback,
    handoffInPoint: handoffInPort
      ? resolveTemplatePoint(room.schema, handoffInPort)
      : handoffFallback,
    handoffOutPoint: handoffOutPort
      ? resolveTemplatePoint(room.schema, handoffOutPort)
      : handoffFallback,
    statusTone: getRoomStatusTone(room),
    occupancyLabel: getRoomOccupancyLabel(room),
    fixtures,
    taskCount: room.snapshot.taskCount,
    residentCount: room.snapshot.agentCount,
    runningCount: room.snapshot.runningCount,
    blockedTaskCount: room.taskNodes.filter((task) => task.tone === "danger").length,
  };
}

export function createFloorViewportHandoffRoutes(
  rooms: readonly FloorViewportRoom[],
  handoffs: readonly OfficeHandoffSnapshot[] = [],
): FloorViewportHandoffRoute[] {
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const sourceHandoffs =
    handoffs.length > 0
      ? handoffs.slice(0, 2).map((handoff) => ({
          id: `handoff.${handoff.id}`,
          fromRoomId: handoff.fromRoomId,
          toRoomId: handoff.toRoomId,
          taskId: handoff.taskId,
          label: `${handoff.fromLabel} to ${handoff.toLabel}`,
          isFallback: false,
        }))
      : [
          {
            id: "handoff.fallback.ops-to-validation",
            fromRoomId: "ops-control",
            toRoomId: "validation-office",
            taskId: "verify_append",
            label: "Ops Control to Validation Office",
            isFallback: true,
          },
        ];

  return sourceHandoffs.flatMap((handoff) => {
    const fromRoom = roomMap.get(handoff.fromRoomId);
    const toRoom = roomMap.get(handoff.toRoomId);
    if (!fromRoom || !toRoom) {
      return [];
    }

    const points = createDoorAlignedHandoffRoute({
      fromRoomId: fromRoom.id,
      toRoomId: toRoom.id,
      fromRoomRect: fromRoom.rect,
      toRoomRect: toRoom.rect,
      from: fromRoom.handoffOutPoint,
      to: toRoom.handoffInPoint,
    });
    return [{ ...handoff, points }];
  });
}

export function createFloorViewportBlockedMarkers(
  rooms: readonly OfficeRoomPresence[],
  viewportRooms: readonly FloorViewportRoom[],
): FloorViewportBlockedLaneMarker[] {
  const viewportRoomMap = new Map(viewportRooms.map((room) => [room.id, room]));
  const markers = rooms.flatMap((room) => {
    const viewportRoom = viewportRoomMap.get(room.roomId);
    if (!viewportRoom) return [];
    return room.taskNodes
      .filter((task) => task.tone === "danger")
      .slice(0, 1)
      .map<FloorViewportBlockedLaneMarker>((task) => ({
        id: `blocked-lane.${task.taskId}`,
        roomId: room.roomId,
        taskId: task.taskId,
        label: `${room.label} blocked lane`,
        point: getBlockedLaneCorridorPoint(room.roomId),
        isFallback: false,
      }));
  });

  if (markers.length > 0) {
    return markers.slice(0, 2);
  }

  return [
    {
      id: "blocked-lane.fallback.central-corridor",
      roomId: "central-corridor",
      taskId: "blocked-lane",
      label: "Blocked lane",
      point: { left: 45, top: 72 },
      isFallback: true,
    },
  ];
}

export function getFloorSurfaceForRoom(
  room: Pick<OfficeStageRoomSchema, "kind" | "floorTone">,
): SpatialLensFloorSurface {
  const surface = room.floorTone ?? room.kind;
  if (surface === "validation") return "lab";
  if (surface === "review") return "workspace";
  if (surface === "control") return "control";
  if (surface === "workspace") return "workspace";
  if (surface === "lab") return "lab";
  if (surface === "lobby") return "lobby";
  return "stage";
}

export function getFloorAssetId(surface: SpatialLensFloorSurface): string {
  const assetId = `floor.${surface}`;
  return resolveSpatialLensAsset(assetId)?.kind === "floor"
    ? assetId
    : "floor.placeholder";
}

export function getFurnitureAssetId(kind: string): string {
  const assetId = `furniture.${kind}`;
  return resolveSpatialLensAsset(assetId)?.kind === "furniture"
    ? assetId
    : "furniture.placeholder";
}

export function getRoomStatusTone(room: OfficeRoomPresence): PixelStatusTone {
  if (room.snapshot.runningCount > 0) return "live";
  if (room.snapshot.tone === "danger") return "blocked";
  if (room.snapshot.tone === "warning") return "review";
  if (room.snapshot.agentCount > 0) return "active";
  return normalizePixelStatusTone(room.snapshot.tone);
}

export function getRoomOccupancyLabel(
  room: Pick<OfficeRoomPresence, "snapshot">,
): "live" | "occupied" | "quiet" {
  if (room.snapshot.runningCount > 0) return "live";
  if (room.snapshot.agentCount > 0) return "occupied";
  return "quiet";
}

function resolveRoomPoint(
  room: Pick<OfficeStageRoomSchema, "x" | "y" | "w" | "h">,
  point: Pick<OfficeStageTaskAnchor, "left" | "top">,
): FloorViewportPoint {
  return {
    left: room.x + (room.w * point.left) / 100,
    top: room.y + (room.h * point.top) / 100,
  };
}

function resolveTemplatePoint(
  room: Pick<OfficeStageRoomSchema, "x" | "y" | "w" | "h">,
  point: { readonly x: number; readonly y: number },
): FloorViewportPoint {
  return {
    left: room.x + (room.w * point.x) / 100,
    top: room.y + (room.h * point.y) / 100,
  };
}
