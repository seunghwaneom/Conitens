import test from "node:test";
import assert from "node:assert/strict";
import {
  PIXEL_STATUS_TOKENS,
  PIXEL_STATUS_TONES,
  PIXEL_THEME_TOKEN_NAMES,
  normalizePixelStatusTone,
} from "../src/spatial-lens/tokens.ts";

test("spatial lens pixel tokens expose the limited status palette", () => {
  assert.deepEqual([...PIXEL_STATUS_TONES], [
    "live",
    "active",
    "review",
    "blocked",
    "idle",
    "success",
  ]);

  assert.equal(PIXEL_STATUS_TOKENS.live.cssVar, "--spatial-accent-live");
  assert.equal(PIXEL_STATUS_TOKENS.blocked.borderVar, "--spatial-accent-blocked-border");
  assert.ok(PIXEL_THEME_TOKEN_NAMES.includes("--spatial-bg-shell"));
  assert.ok(PIXEL_THEME_TOKEN_NAMES.includes("--spatial-accent-review"));
});

test("spatial lens status tone normalization keeps UI states predictable", () => {
  assert.equal(normalizePixelStatusTone("running"), "live");
  assert.equal(normalizePixelStatusTone("active"), "active");
  assert.equal(normalizePixelStatusTone("assigned"), "review");
  assert.equal(normalizePixelStatusTone("blocked"), "blocked");
  assert.equal(normalizePixelStatusTone("done"), "success");
  assert.equal(normalizePixelStatusTone("quiet"), "idle");
  assert.equal(normalizePixelStatusTone("unknown-state"), "idle");
  assert.equal(normalizePixelStatusTone(null), "idle");
});
