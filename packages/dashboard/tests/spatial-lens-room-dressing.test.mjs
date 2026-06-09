import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOperationalPropSpecs,
  getRoomTemplateCounts,
  getRoomTemplatePropSpecs,
  getWallPropSpecs,
  getWorkstationPropSpecs,
} from "../src/spatial-lens/viewport/roomDressing.ts";
import {
  getRoomKitSpriteCounts,
  getRoomKitSpriteSpecs,
} from "../src/spatial-lens/viewport/roomKit.ts";
import {
  REQUIRED_PIXEL_PROP_KINDS,
  ROOM_TEMPLATES,
  ROOM_TEMPLATE_IDS,
  ROOM_TEMPLATE_PROP_MINIMUMS,
} from "../src/spatial-lens/viewport/roomTemplates.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SPATIAL_LENS_ROOT = path.resolve(TEST_DIR, "../src/spatial-lens");

test("spatial lens room dressing templates cover every office room", () => {
  assert.deepEqual(Object.keys(ROOM_TEMPLATES).sort(), [...ROOM_TEMPLATE_IDS].sort());

  const themes = new Set(ROOM_TEMPLATE_IDS.map((roomId) => ROOM_TEMPLATES[roomId].theme));
  assert.deepEqual(
    [...themes].sort(),
    ["commons", "impl", "ops", "research", "review", "validation"],
  );
});

test("spatial lens room dressing satisfies room-level density requirements", () => {
  const counts = getRoomTemplateCounts();

  for (const roomId of ROOM_TEMPLATE_IDS) {
    assert.ok(
      counts[roomId].total >= ROOM_TEMPLATE_PROP_MINIMUMS[roomId],
      `${roomId} should meet prop minimum`,
    );
    assert.ok(getWallPropSpecs(roomId).length >= 3, `${roomId} should have wall detail`);
    assert.ok(
      getWorkstationPropSpecs(roomId).length >= 2,
      `${roomId} should have workstation/task detail`,
    );
  }

  const totalPixelProps = Object.values(counts).reduce((sum, count) => sum + count.total, 0);
  assert.ok(totalPixelProps >= 100, "VIEWPORT dressing should render at least 100 PixelProps");
});

test("spatial lens room dressing implements every required prop kind", () => {
  const propKinds = new Set(
    ROOM_TEMPLATE_IDS.flatMap((roomId) =>
      getRoomTemplatePropSpecs(roomId).map((prop) => prop.kind),
    ),
  );

  for (const requiredKind of REQUIRED_PIXEL_PROP_KINDS) {
    assert.ok(propKinds.has(requiredKind), `missing prop kind ${requiredKind}`);
  }
});

test("spatial lens room depth layer gives rooms authored pixel depth", () => {
  const roomZoneSource = readSpatialLensSource("components/RoomZone.tsx");
  const depthLayerSource = readSpatialLensSource("viewport/RoomDepthLayer.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(roomZoneSource, /RoomDepthLayer/);
  assert.match(depthLayerSource, /data-room-depth-layer/);
  assert.match(depthLayerSource, /data-room-depth-theme/);
  assert.match(depthLayerSource, /"back-wall-shadow"/);
  assert.match(depthLayerSource, /"baseboard"/);
  assert.match(depthLayerSource, /"work-mat"/);
  assert.match(depthLayerSource, /"foreground-lip"/);
  assert.match(cssSource, /\.room-depth-layer/);
  assert.match(cssSource, /data-room-depth-theme="ops"/);
  assert.match(cssSource, /data-room-depth-theme="validation"/);
});

test("spatial lens room kit layer uses generated signature sprites", () => {
  const roomZoneSource = readSpatialLensSource("components/RoomZone.tsx");
  const kitLayerSource = readSpatialLensSource("viewport/RoomKitLayer.tsx");
  const kitSource = readSpatialLensSource("viewport/roomKit.ts");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");
  const counts = getRoomKitSpriteCounts();
  const kitSprites = ROOM_TEMPLATE_IDS.flatMap((roomId) =>
    getRoomKitSpriteSpecs(roomId).map((sprite) => sprite.sprite),
  );

  for (const roomId of ROOM_TEMPLATE_IDS) {
    assert.ok(counts[roomId] >= 2, `${roomId} should have room-kit sprites`);
  }

  assert.match(roomZoneSource, /RoomKitLayer/);
  assert.match(kitLayerSource, /data-room-kit-layer/);
  assert.match(kitLayerSource, /data-room-kit-sprite/);
  assert.match(kitLayerSource, /data-room-kit-role/);
  assert.match(cssSource, /\.room-kit-layer/);
  assert.match(cssSource, /\.room-kit-sprite/);
  assert.ok(kitSprites.includes("prop.archiveBox"));
  assert.ok(kitSprites.includes("prop.reagentBottleCluster"));
  assert.ok(kitSprites.includes("prop.greenStatusLight"));
  assert.ok(kitSprites.includes("prop.redStatusLight"));
  assert.match(kitSource, /"ops-control"/);
  assert.match(kitSource, /"validation-office"/);
});

test("spatial lens generated room backdrops are focused-only room material", () => {
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");
  const roomZoneSource = readSpatialLensSource("components/RoomZone.tsx");
  const targetEdgeSource = readSpatialLensSource(
    "components/FocusedRouteTargetEdge.tsx",
  );
  const backdropLayerSource = readSpatialLensSource(
    "viewport/GeneratedRoomBackdropLayer.tsx",
  );
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(viewportSource, /showGeneratedBackdrops={isFocusedMode}/);
  assert.match(roomZoneSource, /GeneratedRoomBackdropLayer/);
  assert.match(targetEdgeSource, /usage="target-edge"/);
  assert.match(backdropLayerSource, /data-generated-room-backdrop=/);
  assert.match(backdropLayerSource, /data-generated-room-backdrop-usage=/);
  assert.match(cssSource, /\.generated-room-backdrop-layer/);
  assert.match(cssSource, /\.focused-target-floor > \.generated-room-backdrop-layer/);
});

test("spatial lens room dressing anchors operational affordances to props", () => {
  const validationOperationalProps = getOperationalPropSpecs("validation-office");
  assert.ok(
    validationOperationalProps.some(
      (prop) => prop.kind === "routePort" && prop.id.includes("route-in"),
    ),
    "validation office should expose a receiving route port",
  );
  assert.ok(
    validationOperationalProps.some((prop) => prop.kind === "barrier"),
    "validation office should expose a blocked-lane barrier",
  );
  assert.ok(
    getOperationalPropSpecs("ops-control").some((prop) => prop.kind === "routePort"),
    "ops control should expose an outgoing route port",
  );
  assert.ok(
    getRoomTemplatePropSpecs("project-main").some((prop) => prop.kind === "inboxTray") &&
      getRoomTemplatePropSpecs("project-main").some((prop) => prop.kind === "outboxTray"),
    "central commons should expose shared pickup trays",
  );
});

function readSpatialLensSource(relativePath) {
  return readFileSync(path.join(SPATIAL_LENS_ROOT, relativePath), "utf8");
}
