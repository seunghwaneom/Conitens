import test from "node:test";
import assert from "node:assert/strict";
import { demoAgents, demoEvents, demoTasks } from "../src/demo-data.ts";
import { createOfficePresenceModel } from "../src/office-presence-model.ts";
import {
  createFloorViewportModel,
  getFloorSurfaceForRoom,
  getFurnitureAssetId,
} from "../src/spatial-lens/model/floorGeometry.ts";
import { resolveSpatialLensAsset } from "../src/spatial-lens/assets/assetRegistry.ts";
import {
  getRoomHandoffPort,
} from "../src/spatial-lens/viewport/roomDressing.ts";
import {
  CORRIDOR_WIDTH_PERCENT,
  FLOOR_CORRIDOR_SEGMENTS,
  isPointInsideCorridor,
} from "../src/spatial-lens/viewport/corridorGraph.ts";

test("spatial lens floor viewport model maps office rooms into static geometry", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFloorViewportModel({
    rooms: office.rooms,
    selectedRoomId: "validation-office",
  });

  assert.equal(model.rooms.length, 6);
  assert.equal(model.selectedRoomId, "validation-office");
  assert.equal(model.corridors.filter((lane) => lane.kind === "corridor").length, 1);
  assert.equal(model.corridors.filter((lane) => lane.kind === "stub").length, 6);
  assert.equal(model.corridors.filter((lane) => lane.kind === "hub").length, 1);
  assert.equal(model.corridors[0].rect.w, CORRIDOR_WIDTH_PERCENT);
  assert.equal(model.layout.floorplateZones.length, 6);
  assert.ok(model.handoffRoutes.length >= 1);
  assert.ok(model.blockedLaneMarkers.length >= 1);
  assert.ok(model.totalFixtureCount > 70);

  const ops = model.rooms.find((room) => room.id === "ops-control");
  assert.deepEqual(ops?.rect, { x: 3, y: 3, w: 30, h: 18 });
  assert.equal(ops?.floorAssetId, "floor.control");
  assert.deepEqual(ops?.wallAssetIds, [
    "wall.north",
    "wall.east",
    "wall.south",
    "wall.west",
  ]);
});

test("spatial lens floor viewport exposes visible handoff and blocked lane overlays", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFloorViewportModel({
    rooms: office.rooms,
    handoffs: [],
  });

  assert.deepEqual(
    model.handoffRoutes.map((route) => [route.fromRoomId, route.toRoomId, route.isFallback]),
    [["ops-control", "validation-office", true]],
  );
  assert.ok(model.handoffRoutes[0].points.length >= 4);
  assert.equal(model.blockedLaneMarkers[0].isFallback, false);
  assert.equal(model.blockedLaneMarkers[0].roomId, "ops-control");

  const opsRoom = model.rooms.find((room) => room.id === "ops-control");
  const validationRoom = model.rooms.find((room) => room.id === "validation-office");
  assert.deepEqual(model.handoffRoutes[0].points[0], opsRoom?.handoffOutPoint);
  assert.deepEqual(
    model.handoffRoutes[0].points[model.handoffRoutes[0].points.length - 1],
    validationRoom?.handoffInPoint,
  );

  const opsTemplatePort = getRoomHandoffPort("ops-control", "out");
  assert.equal(opsTemplatePort?.role, "out");
  assert.equal(
    isPointInsideCorridor(model.blockedLaneMarkers[0].point),
    true,
    "blocked lane should be a physical obstruction in the corridor",
  );
  for (const point of model.handoffRoutes[0].points.slice(1, -1)) {
    assert.equal(
      isPointInsideCorridor(point, FLOOR_CORRIDOR_SEGMENTS) ||
        point.left === opsRoom?.rect.x + opsRoom?.rect.w ||
        point.left === validationRoom?.rect.x,
      true,
      `handoff point should use a door, route hub, or corridor tile: ${JSON.stringify(point)}`,
    );
  }
});

test("spatial lens floor viewport model chooses stable floor surfaces", () => {
  assert.equal(getFloorSurfaceForRoom({ kind: "control" }), "control");
  assert.equal(getFloorSurfaceForRoom({ kind: "workspace" }), "workspace");
  assert.equal(getFloorSurfaceForRoom({ kind: "review" }), "workspace");
  assert.equal(getFloorSurfaceForRoom({ kind: "validation" }), "lab");
  assert.equal(getFloorSurfaceForRoom({ kind: "lobby" }), "lobby");
});

test("spatial lens floor viewport fixtures resolve through the asset registry", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFloorViewportModel({ rooms: office.rooms });

  for (const fixture of [
    ...model.corridorFixtures,
    ...model.rooms.flatMap((room) => room.fixtures),
  ]) {
    const asset = resolveSpatialLensAsset(fixture.assetId);
    assert.equal(asset?.kind, "furniture", `${fixture.id} should resolve`);
  }

  assert.equal(getFurnitureAssetId("desk"), "furniture.desk");
  assert.equal(getFurnitureAssetId("unknown-fixture"), "furniture.placeholder");
});

test("spatial lens floor viewport falls back to the first room when selection is stale", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFloorViewportModel({
    rooms: office.rooms,
    selectedRoomId: "missing-room",
  });

  assert.equal(model.selectedRoomId, "ops-control");
});
