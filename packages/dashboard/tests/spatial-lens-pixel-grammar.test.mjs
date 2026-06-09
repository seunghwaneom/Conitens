import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  comparePixelY,
  getPixelLayerIndex,
  PROP_ANCHOR_RULE,
  ROOM_TILE_COLUMNS,
  SHADOW_PX,
  snapPercentToRoomTile,
  SPRITE_SCALE,
} from "../src/spatial-lens/viewport/pixelSpriteGrammar.ts";
import {
  createFloorViewportCameraFrame,
  FLOOR_VIEWPORT_CAMERA_ZOOMS,
} from "../src/spatial-lens/viewport/viewportCamera.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SPATIAL_LENS_ROOT = path.resolve(TEST_DIR, "../src/spatial-lens");

test("spatial lens pixel grammar uses integer scale and hard shadow anchors", () => {
  assert.equal(Number.isInteger(SPRITE_SCALE), true);
  assert.equal(SPRITE_SCALE, 2);
  assert.equal(SHADOW_PX, 1);
  assert.equal(PROP_ANCHOR_RULE, "bottom-center");
});

test("spatial lens pixel grammar snaps props to the room tile field", () => {
  assert.equal(ROOM_TILE_COLUMNS, 24);
  assert.equal(snapPercentToRoomTile(50), 50);
  assert.equal(snapPercentToRoomTile(51), 50);
  assert.equal(snapPercentToRoomTile(53), 54.167);
  assert.equal(snapPercentToRoomTile(-3), 0);
  assert.equal(snapPercentToRoomTile(103), 100);
});

test("spatial lens pixel grammar y-sorts props deterministically", () => {
  const props = [
    { id: "b", y: 40, layer: "floor" },
    { id: "a", y: 40, layer: "floor" },
    { id: "wall", y: 80, layer: "wall" },
    { id: "op", y: 10, layer: "operational" },
  ];

  assert.deepEqual([...props].sort(comparePixelY).map((prop) => prop.id), [
    "op",
    "a",
    "b",
    "wall",
  ]);
  assert.ok(
    getPixelLayerIndex({ y: 80, layer: "wall" }) >
      getPixelLayerIndex({ y: 10, layer: "operational" }),
  );
});

test("spatial lens focused camera defaults to ops control and enlarges the floor", () => {
  const camera = createFloorViewportCameraFrame({
    focusedRoomId: null,
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
  });
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");

  assert.equal(camera.focusRoomId, "ops-control");
  assert.equal(camera.targetRoomId, null);
  assert.equal(Number.isInteger(camera.scale), true);
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.focused);
  assert.equal(camera.width, 100);
  assert.equal(camera.height, 100);
  assert.equal(camera.left, -4);
  assert.equal(camera.top, 6.5);
  assert.deepEqual(camera.sceneBounds, { x: 1.333, y: 0, w: 33.333, h: 31.167 });
  assert.match(viewportSource, /data-camera-stage="floor"/);
});

test("spatial lens focused camera biases toward a connected handoff target", () => {
  const camera = createFloorViewportCameraFrame({
    focusedRoomId: "ops-control",
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
    handoffRoutes: [
      {
        fromRoomId: "ops-control",
        toRoomId: "validation-office",
      },
    ],
  });

  assert.equal(camera.focusRoomId, "ops-control");
  assert.equal(camera.targetRoomId, "validation-office");
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.focused);
  assert.equal(camera.left, -47.5);
  assert.equal(camera.top, -5.5);
  assert.deepEqual(camera.sceneBounds, { x: 15.833, y: 1.833, w: 33.333, h: 33.333 });
  assert.ok(
    camera.sceneBounds.x + camera.sceneBounds.w >= 47.5,
    "focused route camera should include the central corridor edge",
  );
});

test("spatial lens floor overview camera keeps the full topology at 1x", () => {
  const camera = createFloorViewportCameraFrame({
    mode: "overview",
    focusedRoomId: "validation-office",
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
  });

  assert.equal(camera.mode, "overview");
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.overview);
  assert.equal(camera.targetRoomId, null);
  assert.equal(camera.left, 0);
  assert.equal(camera.top, 0);
  assert.equal(camera.width, 100);
  assert.equal(camera.height, 100);
  assert.deepEqual(camera.sceneBounds, { x: 0, y: 0, w: 100, h: 100 });
});

test("spatial lens handoff packet is an in-world object with a floor slot", () => {
  const overlaySource = readSpatialLensSource("components/HandoffOverlay.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(overlaySource, /data-handoff-packet-slot=/);
  assert.match(cssSource, /\.handoff-packet-slot/);
  assert.match(cssSource, /\.handoff-packet-slot::before/);
  assert.match(cssSource, /\.handoff-packet-slot > \.handoff-packet/);
  assert.equal(
    (overlaySource.match(/data-handoff-packet=/g) ?? []).length,
    1,
    "route overlay should render one packet sprite, inside the physical slot",
  );
});

test("spatial lens handoff route uses corridor guide tiles for storytelling", () => {
  const overlaySource = readSpatialLensSource("components/HandoffOverlay.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(overlaySource, /data-handoff-route-guide=/);
  assert.match(overlaySource, /routeToGuideTiles/);
  assert.match(overlaySource, /kind: "source"/);
  assert.doesNotMatch(overlaySource, /kind: "spine"/);
  assert.doesNotMatch(overlaySource, /kind: "target"/);
  assert.match(cssSource, /\.handoff-route-guide-tile/);
  assert.doesNotMatch(cssSource, /data-route-guide-kind="target"/);
});

test("spatial lens focused corridor continuity uses floor tiles, not extra route markers", () => {
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");
  const continuitySource = readSpatialLensSource(
    "components/FocusedCorridorContinuityLayer.tsx",
  );
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(viewportSource, /FocusedCorridorContinuityLayer/);
  assert.match(viewportSource, /isFocusedMode \? \(/);
  assert.match(continuitySource, /data-focused-corridor-continuity-layer="true"/);
  assert.match(continuitySource, /"source-apron"/);
  assert.match(continuitySource, /"spine-runner"/);
  assert.match(continuitySource, /"target-apron"/);
  assert.match(cssSource, /\.focused-corridor-continuity-tile/);
  assert.doesNotMatch(continuitySource, /data-handoff-route-guide/);
});

test("spatial lens route minimap stays visually secondary in focused mode", () => {
  const minimapSource = readSpatialLensSource("components/MinimapDock.tsx");
  const dockSource = readSpatialLensSource("components/SceneDockOverlay.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(minimapSource, /Route Minimap/);
  assert.doesNotMatch(minimapSource, /Route Dock/);
  assert.match(dockSource, /data-scene-dock-role/);
  assert.match(
    cssSource,
    /\.floor-viewport\[data-viewport-mode="focused"\] \.scene-dock-overlay\[data-scene-dock-role="route"\]/,
  );
  assert.match(cssSource, /width: 104px;/);
  assert.match(cssSource, /height: 64px;/);
});

test("spatial lens focused target edge exposes stable route and agent hooks", () => {
  const targetEdgeSource = readSpatialLensSource(
    "components/FocusedRouteTargetEdge.tsx",
  );

  assert.match(targetEdgeSource, /data-focused-route-target-edge="true"/);
  assert.match(targetEdgeSource, /data-focused-target-route-pixel=/);
  assert.match(targetEdgeSource, /data-focused-target-agent=/);
  assert.match(targetEdgeSource, /data-edge-continuity="corridor-connected"/);
});

test("spatial lens focused target edge reads as a validation checkpoint", () => {
  const targetEdgeSource = readSpatialLensSource(
    "components/FocusedRouteTargetEdge.tsx",
  );
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(targetEdgeSource, /data-focused-validation-checkpoint="true"/);
  assert.match(targetEdgeSource, /sprite="prop\.clipboardRack"/);
  assert.match(targetEdgeSource, /sprite="prop\.routePort"/);
  assert.match(targetEdgeSource, /sprite="furniture\.stampDesk"/);
  assert.match(targetEdgeSource, /sprite="prop\.documentStack"/);
  assert.match(targetEdgeSource, /sprite="prop\.greenStatusLight"/);
  assert.match(targetEdgeSource, /sprite="prop\.redStatusLight"/);
  assert.match(targetEdgeSource, /data-focused-validation-prop="stamp-desk"/);
  assert.match(cssSource, /\.focused-target-stamp-desk/);
  assert.match(cssSource, /\.focused-target-document-stack/);
  assert.match(cssSource, /\.focused-target-route-port/);
});

test("spatial lens offscreen agent awareness stays compact", () => {
  const agentLayerSource = readSpatialLensSource("viewport/AgentLayer.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(agentLayerSource, /data-agent-offscreen-treatment="compact-tab"/);
  assert.match(cssSource, /\.agent-offscreen-rail/);
  assert.match(cssSource, /width: 112px;/);
  assert.match(cssSource, /min-height: 26px;/);
  assert.match(cssSource, /background: transparent;/);
});

test("spatial lens CSS uses only integer scale transforms", () => {
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  for (const match of cssSource.matchAll(/scale\(([^)]+)\)/g)) {
    const value = match[1].trim();
    if (value.startsWith("var(")) continue;
    assert.ok(["1", "2", "3"].includes(value), `non-integer CSS scale: ${value}`);
  }
});

function readSpatialLensSource(relativePath) {
  return readFileSync(path.join(SPATIAL_LENS_ROOT, relativePath), "utf8");
}
