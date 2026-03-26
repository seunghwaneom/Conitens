/**
 * use-sprite-animator.ts — R3F hook for sprite sheet frame animation.
 *
 * Drives per-frame UV offset updates for a sprite sheet texture.
 * Accepts a SpriteSheetConfig, animation name, and optional speed multiplier.
 * Uses useFrame for timing; mutates Vector2 refs in-place to avoid GC pressure.
 *
 * Constraints:
 *   - Never throws inside useFrame (falls back to "idle" on invalid animation)
 *   - Frame advance clamped to max 1 per useFrame call
 *   - speedMultiplier 0 freezes animation (no frame advance)
 *   - Texture loaded via drei useTexture with NearestFilter on both mag/min
 */
import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { NearestFilter, Vector2, type Texture } from "three";
import type {
  SpriteSheetConfig,
  SpriteAnimationClip,
} from "../data/sprite-sheet-config.js";
import { computeSpriteFrame } from "../data/compute-sprite-frame.js";

// ── Return type ─────────────────────────────────────────────────────────────

/** Values returned by the useSpriteAnimator hook. */
export interface SpriteAnimatorResult {
  /** The loaded sprite sheet texture (NearestFilter applied). */
  readonly texture: Texture;
  /** UV offset into the sprite sheet for the current frame. Mutated in-place. */
  readonly offset: Vector2;
  /** UV repeat (tile size) for a single frame. Mutated in-place. */
  readonly repeat: Vector2;
  /** Current zero-based frame index within the active clip. */
  readonly currentFrame: number;
  /** True when a non-looping animation has reached its last frame. */
  readonly finished: boolean;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Animates a sprite sheet texture by advancing UV offsets each frame.
 *
 * @param config          - Sprite sheet layout and animation clip definitions.
 * @param animationName   - Key into `config.animations` (falls back to "idle").
 * @param speedMultiplier - Playback rate factor. 0 = frozen, 1 = normal. Default 1.
 * @returns Texture, UV offset/repeat vectors, current frame index, and finished flag.
 */
export function useSpriteAnimator(
  config: SpriteSheetConfig,
  animationName: string,
  speedMultiplier: number = 1,
): SpriteAnimatorResult {
  // ── Texture loading (drei useTexture + NearestFilter) ───────────────────
  const texture = useTexture(config.sheetPath) as Texture;
  useEffect(() => {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.needsUpdate = true;
  }, [texture]);

  // ── Resolve clip (fallback to idle on invalid name) ─────────────────────
  const clip: SpriteAnimationClip = useMemo(() => {
    const resolved = config.animations[animationName];
    if (resolved) return resolved;

    // Warn in development builds so authors catch typos early
    if (import.meta.env.DEV) {
      console.warn(
        `[useSpriteAnimator] Unknown animation "${animationName}". Falling back to "idle".`,
      );
    }

    // Fallback: idle if it exists, otherwise first animation in the map
    const fallback =
      config.animations["idle"] ??
      Object.values(config.animations)[0];
    return fallback;
  }, [config.animations, animationName]);

  // ── UV repeat (tile size for one frame) ─────────────────────────────────
  const repeat = useRef(new Vector2(1 / config.columns, 1 / config.rows));
  useMemo(() => {
    repeat.current.set(1 / config.columns, 1 / config.rows);
  }, [config.columns, config.rows]);

  // ── Animation state refs (mutated in useFrame) ──────────────────────────
  const offset = useRef(new Vector2(0, 0));
  const frameRef = useRef(0);
  const finishedRef = useRef(false);
  const elapsedRef = useRef(0);
  const prevClipRef = useRef<SpriteAnimationClip | null>(null);

  // ── Reset state when clip changes ───────────────────────────────────────
  if (prevClipRef.current !== clip) {
    prevClipRef.current = clip;
    frameRef.current = 0;
    finishedRef.current = false;
    elapsedRef.current = 0;
  }

  // ── Per-frame animation tick ────────────────────────────────────────────
  useFrame((_state, delta) => {
    // Safety: if clip is somehow undefined, bail silently
    if (!clip || clip.frameCount <= 0) return;

    // Frozen when speed is 0 or animation already finished (non-loop)
    if (speedMultiplier === 0 || finishedRef.current) {
      updateOffset(clip);
      return;
    }

    // Accumulate time
    const effectiveFps = clip.fps * Math.abs(speedMultiplier);
    if (effectiveFps <= 0) {
      updateOffset(clip);
      return;
    }

    const frameDuration = 1 / effectiveFps;
    elapsedRef.current += delta;

    // Clamp to at most 1 frame advance per useFrame call
    if (elapsedRef.current >= frameDuration) {
      elapsedRef.current -= frameDuration;
      // Clamp leftover so we never skip multiple frames
      if (elapsedRef.current >= frameDuration) {
        elapsedRef.current = 0;
      }

      const nextFrame = frameRef.current + 1;

      if (nextFrame >= clip.frameCount) {
        if (clip.loop) {
          frameRef.current = 0;
        } else {
          frameRef.current = clip.frameCount - 1;
          finishedRef.current = true;
        }
      } else {
        frameRef.current = nextFrame;
      }
    }

    updateOffset(clip);
  });

  /** Compute UV offset from current frame index and clip row/column. */
  function updateOffset(c: SpriteAnimationClip): void {
    computeSpriteFrame(
      { columns: config.columns, rows: config.rows },
      c,
      frameRef.current,
      offset.current,
      repeat.current,
    );
  }

  // Initial offset computation (for first render before useFrame fires)
  useMemo(() => {
    computeSpriteFrame(
      { columns: config.columns, rows: config.rows },
      clip,
      0,
      offset.current,
      repeat.current,
    );
  }, [clip, config.columns, config.rows]);

  return {
    texture,
    offset: offset.current,
    repeat: repeat.current,
    currentFrame: frameRef.current,
    finished: finishedRef.current,
  };
}
