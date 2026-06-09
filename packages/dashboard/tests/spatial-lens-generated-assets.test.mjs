import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENERATED_SPATIAL_LENS_SOURCE_SPRITE_SHEET_SIZE,
  GENERATED_SPATIAL_LENS_SPRITE_SHEET,
  GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE,
  GENERATED_SPATIAL_LENS_SPRITES,
  getGeneratedSpatialLensSpriteForPixelProp,
  resolveGeneratedSpatialLensSprite,
  validateGeneratedSpatialLensSprites,
} from "../src/spatial-lens/assets/generatedAssetManifest.ts";
import {
  GENERATED_SPATIAL_LENS_ROOM_BACKDROPS,
  validateGeneratedSpatialLensRoomBackdrops,
} from "../src/spatial-lens/assets/generatedRoomBackdrops.ts";

const DASHBOARD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const REQUIRED_SPRITES = [
  "furniture.consoleDesk",
  "prop.monitor",
  "furniture.operatorChair",
  "prop.statusBoard",
  "prop.inboxTray",
  "prop.outboxTray",
  "prop.packet",
  "prop.barrier",
  "prop.cone",
  "character.architectIdle",
  "character.sentinelReviewing",
];

test("generated Spatial Lens sprite manifest is local and bounded", () => {
  assert.deepEqual(validateGeneratedSpatialLensSprites(), []);
  assert.equal(GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.w, 384);
  assert.equal(GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.h, 256);
  assert.equal(GENERATED_SPATIAL_LENS_SOURCE_SPRITE_SHEET_SIZE.downsample, 4);

  const sheetPath = path.join(
    DASHBOARD_ROOT,
    "public",
    GENERATED_SPATIAL_LENS_SPRITE_SHEET.slice(1),
  );
  assert.ok(existsSync(sheetPath), "generated 1x sprite sheet should exist");

  for (const asset of GENERATED_SPATIAL_LENS_SPRITES) {
    assert.equal(asset.src, GENERATED_SPATIAL_LENS_SPRITE_SHEET);
    assert.equal(Number.isInteger(asset.scale), true);
    assert.ok([1, 2, 3].includes(asset.scale));
    assert.ok(asset.x + asset.w <= GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.w);
    assert.ok(asset.y + asset.h <= GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.h);
  }
});

test("generated Spatial Lens manifest includes implementation-critical sprites", () => {
  for (const spriteId of REQUIRED_SPRITES) {
    assert.ok(resolveGeneratedSpatialLensSprite(spriteId), spriteId);
  }
});

test("generated Spatial Lens sprites back required PixelProp kinds", () => {
  const requests = [
    { id: "ops.lead-console.desk", kind: "desk", tone: "blue" },
    { id: "ops.lead-console.monitor", kind: "monitor", tone: "live" },
    { id: "validation.inbox", kind: "inboxTray", tone: "green" },
    { id: "ops.outbox", kind: "outboxTray", tone: "blue" },
    { id: "lane.blocked.barrier", kind: "barrier", tone: "danger" },
    { id: "lane.blocked.cone", kind: "cone", tone: "danger" },
  ];

  assert.equal(
    getGeneratedSpatialLensSpriteForPixelProp(requests[0])?.id,
    "furniture.consoleDesk",
  );
  assert.equal(
    getGeneratedSpatialLensSpriteForPixelProp(requests[1])?.id,
    "prop.doubleMonitor",
  );

  for (const request of requests) {
    assert.ok(
      getGeneratedSpatialLensSpriteForPixelProp(request),
      `${request.kind} should resolve to a generated sprite`,
    );
  }
});

test("generated Spatial Lens room backdrops are local and focused-use bounded", () => {
  assert.deepEqual(validateGeneratedSpatialLensRoomBackdrops(), []);

  const backdropIds = GENERATED_SPATIAL_LENS_ROOM_BACKDROPS.map(
    (backdrop) => backdrop.id,
  );
  assert.ok(backdropIds.includes("room.ops-control.generated-backdrop"));
  assert.ok(backdropIds.includes("room.validation-office.generated-backdrop"));
  assert.ok(backdropIds.includes("edge.validation-office.generated-backdrop"));

  for (const backdrop of GENERATED_SPATIAL_LENS_ROOM_BACKDROPS) {
    assert.ok(backdrop.src.startsWith("/assets/spatial-lens/generated/"));
    assert.ok(backdrop.opacity > 0 && backdrop.opacity <= 1);
    assert.ok(["room", "target-edge"].includes(backdrop.usage));

    const backdropPath = path.join(DASHBOARD_ROOT, "public", backdrop.src.slice(1));
    assert.ok(existsSync(backdropPath), `${backdrop.id} should exist in public assets`);
  }
});
