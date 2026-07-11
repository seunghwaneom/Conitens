import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICE_FIXTURE_REGISTRY } from "../src/office-fixture-registry.ts";

const DASHBOARD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PUBLIC_ROOT = path.join(DASHBOARD_ROOT, "public");
const FIXTURE_SHEET_PATH = path.join(PUBLIC_ROOT, "office-fixtures.png");
const FIXTURE_META_PATH = path.join(PUBLIC_ROOT, "office-fixtures.meta.json");

const FIXTURE_KINDS = Object.keys(OFFICE_FIXTURE_REGISTRY);

test("office fixture atlas is a sprite-gen generated 24px contract", () => {
  const meta = JSON.parse(readFileSync(FIXTURE_META_PATH, "utf8"));
  const dimensions = readPngDimensions(FIXTURE_SHEET_PATH);

  assert.equal(meta.generator, "sprite-gen");
  assert.equal(meta.generatorRepo, "https://github.com/aldegad/sprite-gen");
  assert.match(meta.generatorVersion, /^1\./);
  assert.equal(meta.sheet, "office-fixtures.png");
  assert.equal(meta.cellSize, 24);
  assert.equal(meta.columns, FIXTURE_KINDS.length);
  assert.equal(dimensions.width, meta.cellSize * FIXTURE_KINDS.length);
  assert.equal(dimensions.height, meta.cellSize);
  assert.deepEqual(
    meta.sprites.map((sprite) => sprite.kind),
    FIXTURE_KINDS,
  );

  for (const [index, sprite] of meta.sprites.entries()) {
    assert.equal(sprite.index, index);
    assert.deepEqual(sprite.sourceRect, {
      x: index * meta.cellSize,
      y: 0,
      w: meta.cellSize,
      h: meta.cellSize,
    });
  }
});

function readPngDimensions(filePath) {
  const png = readFileSync(filePath);
  assert.equal(png.toString("ascii", 1, 4), "PNG");

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
