import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SPATIAL_LENS_ASSET_KINDS,
  SPATIAL_LENS_ASSET_MANIFEST,
  SPATIAL_LENS_MANUAL_IMPORT_ROOT,
  getSpatialLensAssetIdsByKind,
  getSpatialLensAssetOrPlaceholder,
  getSpatialLensAssetsByKind,
  resolveSpatialLensAsset,
  validateSpatialLensAssetManifest,
} from "../src/spatial-lens/assets/assetRegistry.ts";

const DASHBOARD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("spatial lens asset registry covers the required manifest groups", () => {
  assert.deepEqual([...SPATIAL_LENS_ASSET_KINDS], [
    "floor",
    "wall",
    "furniture",
    "character",
  ]);

  for (const kind of SPATIAL_LENS_ASSET_KINDS) {
    assert.ok(
      getSpatialLensAssetsByKind(kind).length > 0,
      `expected ${kind} assets`,
    );
  }

  assert.ok(getSpatialLensAssetIdsByKind("floor").includes("floor.control"));
  assert.ok(getSpatialLensAssetIdsByKind("wall").includes("wall.north"));
  assert.ok(getSpatialLensAssetIdsByKind("furniture").includes("furniture.desk"));
  assert.ok(getSpatialLensAssetIdsByKind("character").includes("character.reviewer"));
});

test("spatial lens asset manifest stays local and structurally valid", () => {
  assert.deepEqual(validateSpatialLensAssetManifest(), []);

  for (const asset of SPATIAL_LENS_ASSET_MANIFEST) {
    assert.equal(typeof asset.id, "string");
    assert.ok(asset.id.includes("."));
    assert.ok(asset.tileSize.w > 0);
    assert.ok(asset.tileSize.h > 0);
    assert.equal(typeof asset.anchor.x, "number");
    assert.equal(typeof asset.anchor.y, "number");
    assert.ok(asset.rotationGroup.length > 0);
    assert.ok(asset.stateGroup.length > 0);
    assert.ok(asset.animationFrames.length > 0);
    assert.ok(!asset.src || !/^https?:\/\//i.test(asset.src));
  }
});

test("spatial lens registry references existing local asset files", () => {
  for (const asset of SPATIAL_LENS_ASSET_MANIFEST) {
    if (!asset.src) {
      continue;
    }

    const sourcePath = resolveLocalAssetPath(asset.src);
    assert.ok(sourcePath, `${asset.id} should use a local asset source`);
    assert.ok(existsSync(sourcePath), `${asset.id} source file should exist`);
  }
});

test("spatial lens registry resolves existing local assets and placeholders", () => {
  const floor = resolveSpatialLensAsset("floor.control");
  assert.equal(floor?.kind, "floor");
  assert.equal(floor?.src, "/office-floor-control.png");

  const desk = resolveSpatialLensAsset("furniture.desk");
  assert.equal(desk?.kind, "furniture");
  assert.equal(desk?.src, "/office-fixtures.png");
  assert.deepEqual(desk?.animationFrames[0]?.sourceRect, {
    x: 0,
    y: 0,
    w: 24,
    h: 24,
  });

  const missingWall = getSpatialLensAssetOrPlaceholder("wall", "wall.missing");
  assert.equal(missingWall.id, "wall.placeholder");
  assert.equal(missingWall.isPlaceholder, true);
  assert.equal(missingWall.src, null);

  assert.equal(resolveSpatialLensAsset("asset.missing"), null);
});

test("spatial lens manual-import root documents the future public asset slot", () => {
  assert.equal(
    SPATIAL_LENS_MANUAL_IMPORT_ROOT,
    "packages/dashboard/public/spatial-lens",
  );
});

function resolveLocalAssetPath(src) {
  if (src.startsWith("/")) {
    return path.join(DASHBOARD_ROOT, "public", src.slice(1));
  }
  if (src.startsWith("file:")) {
    return fileURLToPath(src);
  }
  return null;
}
