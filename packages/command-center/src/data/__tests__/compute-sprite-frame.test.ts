/**
 * compute-sprite-frame.test.ts — Unit tests for the pure UV calculation utility.
 *
 * Validates:
 *  1. Repeat vector equals (1/columns, 1/rows)
 *  2. Offset U is (startColumn + frameIndex) / columns
 *  3. Offset V accounts for Three.js bottom-left UV origin (row 0 = top)
 *  4. Clamping of out-of-range frameIndex
 *  5. finished=true only for non-looping clips at last frame
 *  6. In-place mutation of pre-allocated target Vector2s
 *  7. Degenerate layout guards (zero columns/rows)
 */
import { describe, it, expect } from "vitest";
import { Vector2 } from "three";
import {
  computeSpriteFrame,
  type SpriteSheetLayout,
  type SpriteClipSlice,
} from "../compute-sprite-frame.js";

// ── Test fixtures ──────────────────────────────────────────────────────────

const LAYOUT_8x5: SpriteSheetLayout = { columns: 8, rows: 5 };

const IDLE_CLIP: SpriteClipSlice = {
  row: 0,
  startColumn: 0,
  frameCount: 4,
  loop: true,
};

const SUCCESS_CLIP: SpriteClipSlice = {
  row: 3,
  startColumn: 0,
  frameCount: 3,
  loop: false,
};

const OFFSET_CLIP: SpriteClipSlice = {
  row: 3,
  startColumn: 2,
  frameCount: 2,
  loop: false,
};

// ── Repeat vector ──────────────────────────────────────────────────────────

describe("computeSpriteFrame — repeat", () => {
  it("equals (1/columns, 1/rows) for 8x5 layout", () => {
    const { repeat } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    expect(repeat.x).toBeCloseTo(1 / 8);
    expect(repeat.y).toBeCloseTo(1 / 5);
  });

  it("equals (1/4, 1/4) for a 4x4 layout", () => {
    const { repeat } = computeSpriteFrame(
      { columns: 4, rows: 4 },
      IDLE_CLIP,
      0,
    );
    expect(repeat.x).toBeCloseTo(0.25);
    expect(repeat.y).toBeCloseTo(0.25);
  });

  it("returns a Vector2 instance", () => {
    const { repeat } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    expect(repeat).toBeInstanceOf(Vector2);
  });
});

// ── Offset vector ──────────────────────────────────────────────────────────

describe("computeSpriteFrame — offset", () => {
  it("U = 0 for frame 0 at startColumn 0", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    expect(offset.x).toBeCloseTo(0);
  });

  it("U = (startColumn + frameIndex) / columns", () => {
    // frame 2 of idle (startColumn 0): col = 2, U = 2/8 = 0.25
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 2);
    expect(offset.x).toBeCloseTo(2 / 8);
  });

  it("handles non-zero startColumn", () => {
    // OFFSET_CLIP: startColumn 2, frame 1 → col = 3, U = 3/8
    const { offset } = computeSpriteFrame(LAYOUT_8x5, OFFSET_CLIP, 1);
    expect(offset.x).toBeCloseTo(3 / 8);
  });

  it("V for row 0 = 1 - 1/rows (top of image, high V)", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    // row 0: V = 1 - (0+1)/5 = 1 - 0.2 = 0.8
    expect(offset.y).toBeCloseTo(0.8);
  });

  it("V for row 3 = 1 - 4/rows", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, 0);
    // row 3: V = 1 - (3+1)/5 = 1 - 0.8 = 0.2
    expect(offset.y).toBeCloseTo(0.2);
  });

  it("V for bottom row (row 4) = 0", () => {
    const bottomClip: SpriteClipSlice = {
      row: 4,
      startColumn: 0,
      frameCount: 2,
      loop: true,
    };
    const { offset } = computeSpriteFrame(LAYOUT_8x5, bottomClip, 0);
    // row 4: V = 1 - 5/5 = 0
    expect(offset.y).toBeCloseTo(0);
  });

  it("returns a Vector2 instance", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    expect(offset).toBeInstanceOf(Vector2);
  });
});

// ── Frame index clamping ───────────────────────────────────────────────────

describe("computeSpriteFrame — frame clamping", () => {
  it("clamps negative frameIndex to 0", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, -5);
    // Should behave like frame 0
    const { offset: frame0 } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    expect(offset.x).toBeCloseTo(frame0.x);
    expect(offset.y).toBeCloseTo(frame0.y);
  });

  it("clamps frameIndex exceeding frameCount to last frame", () => {
    const { offset } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 100);
    // Should clamp to frame 3 (frameCount - 1), col = 0+3 = 3, U = 3/8
    expect(offset.x).toBeCloseTo(3 / 8);
  });
});

// ── Finished flag ──────────────────────────────────────────────────────────

describe("computeSpriteFrame — finished flag", () => {
  it("is false for a looping clip at any frame", () => {
    for (let i = 0; i < IDLE_CLIP.frameCount; i++) {
      const { finished } = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, i);
      expect(finished).toBe(false);
    }
  });

  it("is false for non-looping clip before last frame", () => {
    const { finished } = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, 0);
    expect(finished).toBe(false);
  });

  it("is true for non-looping clip at last frame", () => {
    const { finished } = computeSpriteFrame(
      LAYOUT_8x5,
      SUCCESS_CLIP,
      SUCCESS_CLIP.frameCount - 1,
    );
    expect(finished).toBe(true);
  });

  it("is true for non-looping clip past last frame (clamped)", () => {
    const { finished } = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, 99);
    expect(finished).toBe(true);
  });

  it("non-looping clip freezes offset at last frame regardless of frameIndex overshoot", () => {
    // SUCCESS_CLIP: startColumn=0, frameCount=3, last frame index=2
    const atLast = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, 2);
    const pastLast = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, 50);

    // Both should produce the same offset (clamped to last frame)
    expect(pastLast.offset.x).toBeCloseTo(atLast.offset.x);
    expect(pastLast.offset.y).toBeCloseTo(atLast.offset.y);
    // Both should be finished
    expect(atLast.finished).toBe(true);
    expect(pastLast.finished).toBe(true);
  });

  it("non-looping clip at intermediate frames is not finished", () => {
    // Test every frame before the last
    for (let i = 0; i < SUCCESS_CLIP.frameCount - 1; i++) {
      const { finished } = computeSpriteFrame(LAYOUT_8x5, SUCCESS_CLIP, i);
      expect(finished).toBe(false);
    }
  });
});

// ── In-place mutation (GC-friendly) ────────────────────────────────────────

describe("computeSpriteFrame — in-place mutation", () => {
  it("mutates targetOffset in-place and returns same reference", () => {
    const target = new Vector2(999, 999);
    const { offset } = computeSpriteFrame(
      LAYOUT_8x5,
      IDLE_CLIP,
      2,
      target,
      undefined,
    );
    expect(offset).toBe(target);
    expect(target.x).toBeCloseTo(2 / 8);
  });

  it("mutates targetRepeat in-place and returns same reference", () => {
    const target = new Vector2(999, 999);
    const { repeat } = computeSpriteFrame(
      LAYOUT_8x5,
      IDLE_CLIP,
      0,
      undefined,
      target,
    );
    expect(repeat).toBe(target);
    expect(target.x).toBeCloseTo(1 / 8);
    expect(target.y).toBeCloseTo(1 / 5);
  });

  it("allocates new Vector2s when no targets provided", () => {
    const r1 = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    const r2 = computeSpriteFrame(LAYOUT_8x5, IDLE_CLIP, 0);
    // Different instances
    expect(r1.offset).not.toBe(r2.offset);
    expect(r1.repeat).not.toBe(r2.repeat);
  });
});

// ── Degenerate layout guards ───────────────────────────────────────────────

describe("computeSpriteFrame — degenerate layouts", () => {
  it("treats zero columns as 1 (no division by zero)", () => {
    const { repeat, offset } = computeSpriteFrame(
      { columns: 0, rows: 5 },
      IDLE_CLIP,
      0,
    );
    expect(repeat.x).toBeCloseTo(1); // 1/1
    expect(Number.isFinite(offset.x)).toBe(true);
  });

  it("treats zero rows as 1 (no division by zero)", () => {
    const { repeat, offset } = computeSpriteFrame(
      { columns: 8, rows: 0 },
      IDLE_CLIP,
      0,
    );
    expect(repeat.y).toBeCloseTo(1); // 1/1
    expect(Number.isFinite(offset.y)).toBe(true);
  });
});
