import type {
  FloorViewportHandoffRoute,
  FloorViewportRoom,
} from "../model/floorGeometry.ts";

export type FloorViewportCameraMode = "focused" | "overview";

export interface CameraSceneBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FloorViewportCameraFrame {
  readonly focusRoomId: string | null;
  readonly targetRoomId: string | null;
  readonly mode: FloorViewportCameraMode;
  readonly scale: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly sceneBounds: CameraSceneBounds;
}

export type FocusedViewportFrame = FloorViewportCameraFrame & {
  readonly mode: "focused";
};

export type FocusedCamera = Pick<
  FocusedViewportFrame,
  "focusRoomId" | "targetRoomId" | "scale" | "left" | "top" | "sceneBounds"
>;

export const FLOOR_VIEWPORT_CAMERA_ZOOMS = {
  focused: 3,
  overview: 1,
} as const satisfies Record<FloorViewportCameraMode, 1 | 2 | 3>;

const FOCUSED_CAMERA_CORRIDOR_BIAS_PERCENT = 1.5;
const FOCUSED_CAMERA_ROUTE_PULL_PERCENT = 14.5;
const FOCUSED_CAMERA_VERTICAL_BIAS_PERCENT = 2.5;
const FOCUSED_CAMERA_ROUTE_VERTICAL_PULL_PERCENT = 6.5;
const FOCUSED_CAMERA_MAX_FRAME_INSET_PERCENT = 8;

export function createFloorViewportCameraFrame({
  rooms,
  handoffRoutes = [],
  focusedRoomId,
  mode = "focused",
  scale = FLOOR_VIEWPORT_CAMERA_ZOOMS[mode],
}: {
  rooms: readonly Pick<FloorViewportRoom, "id" | "rect">[];
  handoffRoutes?: readonly Pick<
    FloorViewportHandoffRoute,
    "fromRoomId" | "toRoomId"
  >[];
  focusedRoomId: string | null;
  mode?: FloorViewportCameraMode;
  scale?: 1 | 2 | 3;
}): FloorViewportCameraFrame {
  const fullSceneBounds = { x: 0, y: 0, w: 100, h: 100 };

  if (mode === "overview") {
    return {
      focusRoomId: focusedRoomId,
      targetRoomId: null,
      mode,
      scale: FLOOR_VIEWPORT_CAMERA_ZOOMS.overview,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      sceneBounds: fullSceneBounds,
    };
  }

  const focusRoom =
    rooms.find((room) => room.id === focusedRoomId) ??
    rooms.find((room) => room.id === "ops-control") ??
    rooms[0] ??
    null;

  if (!focusRoom) {
    return {
      focusRoomId: null,
      targetRoomId: null,
      mode,
      scale,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      sceneBounds: fullSceneBounds,
    };
  }

  const targetRoom = getFocusedCameraTargetRoom(focusRoom, rooms, handoffRoutes);
  const centerX = focusRoom.rect.x + focusRoom.rect.w / 2;
  const centerY = focusRoom.rect.y + focusRoom.rect.h / 2;
  const targetDirection = targetRoom
    ? Math.sign(targetRoom.rect.x + targetRoom.rect.w / 2 - centerX)
    : 0;
  const targetVerticalDirection = targetRoom
    ? Math.sign(targetRoom.rect.y + targetRoom.rect.h / 2 - centerY)
    : 0;
  const horizontalBias = targetRoom
    ? FOCUSED_CAMERA_ROUTE_PULL_PERCENT
    : FOCUSED_CAMERA_CORRIDOR_BIAS_PERCENT;
  const verticalBias = targetRoom
    ? targetVerticalDirection * FOCUSED_CAMERA_ROUTE_VERTICAL_PULL_PERCENT
    : FOCUSED_CAMERA_VERTICAL_BIAS_PERCENT;
  const cameraCenterX =
    centerX + targetDirection * horizontalBias;
  const cameraCenterY = centerY + verticalBias;
  const scaledWidth = 100 * scale;
  const scaledHeight = 100 * scale;
  const left = clampCameraOffset(
    50 - cameraCenterX * scale,
    scaledWidth,
    FOCUSED_CAMERA_MAX_FRAME_INSET_PERCENT,
  );
  const top = clampCameraOffset(
    50 - cameraCenterY * scale,
    scaledHeight,
    FOCUSED_CAMERA_MAX_FRAME_INSET_PERCENT,
  );

  return {
    focusRoomId: focusRoom.id,
    targetRoomId: targetRoom?.id ?? null,
    mode,
    scale,
    left,
    top,
    width: 100,
    height: 100,
    sceneBounds: createVisibleCameraSceneBounds({ left, top, scale }),
  };
}

function getFocusedCameraTargetRoom(
  focusRoom: Pick<FloorViewportRoom, "id" | "rect">,
  rooms: readonly Pick<FloorViewportRoom, "id" | "rect">[],
  handoffRoutes: readonly Pick<FloorViewportHandoffRoute, "fromRoomId" | "toRoomId">[],
) {
  const route = handoffRoutes.find(
    (handoff) =>
      handoff.fromRoomId === focusRoom.id || handoff.toRoomId === focusRoom.id,
  );
  const targetRoomId =
    route?.fromRoomId === focusRoom.id ? route.toRoomId : route?.fromRoomId;
  return rooms.find((room) => room.id === targetRoomId) ?? null;
}

function createVisibleCameraSceneBounds({
  left,
  top,
  scale,
}: Pick<FloorViewportCameraFrame, "left" | "top" | "scale">): CameraSceneBounds {
  const visibleLeft = clampWorldCoordinate(-left / scale);
  const visibleTop = clampWorldCoordinate(-top / scale);
  const visibleRight = clampWorldCoordinate((100 - left) / scale);
  const visibleBottom = clampWorldCoordinate((100 - top) / scale);
  return {
    x: roundCameraValue(visibleLeft),
    y: roundCameraValue(visibleTop),
    w: roundCameraValue(visibleRight - visibleLeft),
    h: roundCameraValue(visibleBottom - visibleTop),
  };
}

function clampCameraOffset(
  offset: number,
  scaledSize: number,
  leadingInset = 0,
): number {
  return Math.min(leadingInset, Math.max(100 - scaledSize, offset));
}

function clampWorldCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundCameraValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}
