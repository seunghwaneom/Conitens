import test from "node:test";
import assert from "node:assert/strict";
import {
  CORRIDOR_HANDOFF_HUB_POINT,
  CORRIDOR_NODES,
  CORRIDOR_WIDTH_PERCENT,
  FLOOR_CORRIDOR_SEGMENTS,
  createDoorAlignedHandoffRoute,
  getBlockedLaneCorridorPoint,
  isPointInsideCorridor,
} from "../src/spatial-lens/viewport/corridorGraph.ts";
import {
  SPATIAL_LENS_BUILDING_LAYOUT,
} from "../src/spatial-lens/viewport/floorLayout.ts";
import {
  ROOM_DOOR_PLACEMENTS,
  getPrimaryRoomDoorPlacement,
  resolveRoomDoorPoint,
} from "../src/spatial-lens/viewport/roomPlacement.ts";

test("spatial lens building layout creates one connected floorplate", () => {
  assert.equal(SPATIAL_LENS_BUILDING_LAYOUT.floorplateZones.length, 6);
  assert.equal(SPATIAL_LENS_BUILDING_LAYOUT.wallSegments.length >= 12, true);
  assert.equal(SPATIAL_LENS_BUILDING_LAYOUT.columns.length >= 4, true);

  const floorplateBounds = unionBounds(
    SPATIAL_LENS_BUILDING_LAYOUT.floorplateZones.map((zone) => zone.rect),
  );
  assert.ok(floorplateBounds.x <= 1);
  assert.ok(floorplateBounds.y <= 1);
  assert.ok(floorplateBounds.x + floorplateBounds.w >= 93);
  assert.ok(floorplateBounds.y + floorplateBounds.h >= 97);
});

test("spatial lens corridor graph keeps overview corridor narrow and purposeful", () => {
  const central = FLOOR_CORRIDOR_SEGMENTS.find(
    (segment) => segment.id === "corridor.central-spine",
  );
  assert.equal(central?.rect.w, CORRIDOR_WIDTH_PERCENT);
  assert.ok(CORRIDOR_WIDTH_PERCENT >= 4.8);
  assert.ok(CORRIDOR_WIDTH_PERCENT <= 7.2);
  assert.equal(CORRIDOR_NODES.length, 9);
  assert.equal(FLOOR_CORRIDOR_SEGMENTS.filter((segment) => segment.kind === "stub").length, 6);
  assert.equal(
    isPointInsideCorridor(CORRIDOR_HANDOFF_HUB_POINT),
    true,
    "handoff hub should sit inside the corridor graph",
  );
});

test("spatial lens room placements provide door-aligned corridor connections", () => {
  const roomsWithDoors = new Set(ROOM_DOOR_PLACEMENTS.map((door) => door.roomId));
  assert.deepEqual([...roomsWithDoors].sort(), [
    "impl-office",
    "ops-control",
    "project-main",
    "research-lab",
    "review-office",
    "validation-office",
  ]);

  const opsDoor = getPrimaryRoomDoorPlacement("ops-control", "out");
  const validationDoor = getPrimaryRoomDoorPlacement("validation-office", "in");
  assert.equal(opsDoor?.side, "east");
  assert.equal(validationDoor?.side, "west");

  assert.deepEqual(
    resolveRoomDoorPoint({ x: 3, y: 3, w: 30, h: 18 }, opsDoor),
    { left: 33, top: 12 },
  );
  assert.deepEqual(
    resolveRoomDoorPoint({ x: 61, y: 23, w: 30, h: 18 }, validationDoor),
    { left: 61, top: 32.72 },
  );
});

test("spatial lens handoff route uses doors, corridor, hub, and inbox target", () => {
  const route = createDoorAlignedHandoffRoute({
    fromRoomId: "ops-control",
    toRoomId: "validation-office",
    fromRoomRect: { x: 3, y: 3, w: 30, h: 18 },
    toRoomRect: { x: 61, y: 23, w: 30, h: 18 },
    from: { left: 31.5, top: 12.9 },
    to: { left: 61, top: 32.72 },
  });

  assert.deepEqual(route[1], { left: 33, top: 12 });
  assert.deepEqual(route[3], CORRIDOR_HANDOFF_HUB_POINT);
  assert.deepEqual(route[5], { left: 61, top: 32.72 });
  assert.equal(isPointInsideCorridor(getBlockedLaneCorridorPoint("ops-control")), true);
});

function unionBounds(rects) {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
