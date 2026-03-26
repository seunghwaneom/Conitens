/**
 * compute-sprite-frame.ts — Pure UV coordinate calculator for sprite sheets.
 *
 * Given a sprite sheet layout (columns, rows) and a clip's row/startColumn
 * plus the current frame index, computes the Three.js UV offset and repeat
 * vectors needed to display the correct frame.
 *
 * UV coordinate system in Three.js:
 *   - Origin at bottom-left of the texture
 *   - U increases left→right, V increases bottom→top
 *   - Row 0 of the sheet is at the TOP of the image (highest V)
 *
 * This module is intentionally free of React/R3F dependencies so it can be
 * unit-tested without mocking.
 */

import { Vector2 } from "three";

// ── Input / Output types ───────────────────────────────────────────────────

/**
 * Minimal layout slice needed for UV calculation.
 * Matches the relevant fields from SpriteSheetConfig.
 */
export interface SpriteSheetLayout {
  /** Number of columns in the sprite sheet grid. */
  readonly columns: number;
  /** Number of rows in the sprite sheet grid. */
  readonly rows: number;
}

/**
 * Minimal clip slice needed for UV calculation.
 * Matches the relevant fields from SpriteAnimationClip.
 */
export interface SpriteClipSlice {
  /** Zero-based row index in the sprite sheet (top row = 0). */
  readonly row: number;
  /** Zero-based column where this clip's first frame begins. */
  readonly startColumn: number;
  /** Number of consecutive frames in this animation clip. */
  readonly frameCount: number;
  /** If true the animation loops; if false it stops on the last frame. */
  readonly loop: boolean;
}

/**
 * Result of a sprite frame UV computation.
 *
 * `offset` and `repeat` are Vector2 instances intended to be mutated in-place
 * via the overload that accepts pre-allocated target vectors, avoiding GC
 * pressure on the render hot path.
 */
export interface SpriteFrameResult {
  /** UV offset into the sprite sheet for the current frame. */
  readonly offset: Vector2;
  /** UV repeat (tile size) for a single frame. */
  readonly repeat: Vector2;
  /** True when a non-looping animation has reached its last frame. */
  readonly finished: boolean;
}

// ── Pure computation ───────────────────────────────────────────────────────

/**
 * Computes UV offset and repeat for a specific frame of a sprite animation clip.
 *
 * @param layout       - Sheet grid dimensions (columns × rows).
 * @param clip         - Animation clip metadata.
 * @param frameIndex   - Current zero-based frame index within the clip.
 * @param targetOffset - Optional pre-allocated Vector2 to mutate in-place (avoids allocation).
 * @param targetRepeat - Optional pre-allocated Vector2 to mutate in-place (avoids allocation).
 * @returns `{ offset, repeat, finished }` — the target vectors (mutated) and whether the clip has ended.
 */
export function computeSpriteFrame(
  layout: SpriteSheetLayout,
  clip: SpriteClipSlice,
  frameIndex: number,
  targetOffset?: Vector2,
  targetRepeat?: Vector2,
): SpriteFrameResult {
  const { columns, rows } = layout;

  // Guard against degenerate layouts
  const safeCols = columns > 0 ? columns : 1;
  const safeRows = rows > 0 ? rows : 1;

  // Clamp frameIndex to valid range
  const maxFrame = Math.max(clip.frameCount - 1, 0);
  const clampedFrame = Math.max(0, Math.min(frameIndex, maxFrame));

  // ── Repeat (tile size) ────────────────────────────────────────────────
  const repeatX = 1 / safeCols;
  const repeatY = 1 / safeRows;

  const repeat = targetRepeat ?? new Vector2();
  repeat.set(repeatX, repeatY);

  // ── Offset ────────────────────────────────────────────────────────────
  // Column index within the full sheet
  const col = clip.startColumn + clampedFrame;

  // U: fraction from left edge
  const u = col / safeCols;

  // V: Three.js UV origin is bottom-left; row 0 is the top of the image,
  // so row 0 maps to V = 1 - (1/rows), row (rows-1) maps to V = 0.
  const v = 1 - (clip.row + 1) / safeRows;

  const offset = targetOffset ?? new Vector2();
  offset.set(u, v);

  // ── Finished flag ─────────────────────────────────────────────────────
  const finished = !clip.loop && clampedFrame >= maxFrame && clip.frameCount > 0;

  return { offset, repeat, finished };
}
