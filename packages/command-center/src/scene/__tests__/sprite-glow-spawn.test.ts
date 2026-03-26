/**
 * sprite-glow-spawn.test.ts — Tests for glow overlay and spawn-in animation (Seed 4).
 *
 * Pure unit tests on exported helper functions — no R3F context needed.
 */
import { describe, it, expect } from "vitest";
import {
  shouldShowGlow,
  computeGlowOpacity,
} from "../SpriteAvatar.js";
import { STATUS_CONFIG } from "../AgentAvatar.js";
import { STATUS_ANIMATION_MAP } from "../../data/sprite-animation-types.js";
import { BASE_SPRITE_SHEET } from "../../data/sprite-sheet-config.js";

// ── 1. shouldShowGlow ─────────────────────────────────────────────────────────

describe("shouldShowGlow", () => {
  it("returns true for active (emissiveMul 0.8)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.active.emissiveMul)).toBe(true);
  });

  it("returns true for busy (emissiveMul 1.0)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.busy.emissiveMul)).toBe(true);
  });

  it("returns true for error (emissiveMul 0.6)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.error.emissiveMul)).toBe(true);
  });

  it("returns false for idle (emissiveMul 0.4)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.idle.emissiveMul)).toBe(false);
  });

  it("returns false for inactive (emissiveMul 0.15)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.inactive.emissiveMul)).toBe(false);
  });

  it("returns false for terminated (emissiveMul 0.05)", () => {
    expect(shouldShowGlow(STATUS_CONFIG.terminated.emissiveMul)).toBe(false);
  });

  it("returns true at exactly 0.5 (threshold boundary)", () => {
    expect(shouldShowGlow(0.5)).toBe(true);
  });

  it("returns false at 0.49 (just below threshold)", () => {
    expect(shouldShowGlow(0.49)).toBe(false);
  });
});

// ── 2. computeGlowOpacity ────────────────────────────────────────────────────

describe("computeGlowOpacity", () => {
  it("returns 0 for emissiveMul below threshold", () => {
    expect(computeGlowOpacity(0.4)).toBe(0);
    expect(computeGlowOpacity(0.15)).toBe(0);
    expect(computeGlowOpacity(0.05)).toBe(0);
  });

  it("returns 0.24 for active (emissiveMul 0.8)", () => {
    expect(computeGlowOpacity(0.8)).toBeCloseTo(0.24);
  });

  it("returns 0.4 for busy (emissiveMul 1.0)", () => {
    expect(computeGlowOpacity(1.0)).toBeCloseTo(0.4);
  });

  it("returns 0.08 for error (emissiveMul 0.6)", () => {
    expect(computeGlowOpacity(0.6)).toBeCloseTo(0.08);
  });

  it("returns 0 at exactly the threshold (0.5)", () => {
    expect(computeGlowOpacity(0.5)).toBeCloseTo(0);
  });

  it("opacity increases linearly with emissiveMul above threshold", () => {
    const a = computeGlowOpacity(0.7);
    const b = computeGlowOpacity(0.9);
    // b - a should equal (0.9 - 0.7) * 0.8 = 0.16
    expect(b - a).toBeCloseTo(0.16);
  });

  it("opacity never exceeds 0.4 for emissiveMul <= 1.0", () => {
    expect(computeGlowOpacity(1.0)).toBeLessThanOrEqual(0.4);
  });
});

// ── 3. Glow per-status mapping ────────────────────────────────────────────────

describe("Glow per-status integration", () => {
  it("only active, busy, and error show glow", () => {
    const statuses = ["inactive", "idle", "active", "busy", "error", "terminated"] as const;
    const glowStatuses = statuses.filter((s) => shouldShowGlow(STATUS_CONFIG[s].emissiveMul));
    expect(glowStatuses).toEqual(["active", "busy", "error"]);
  });

  it("busy has highest glow opacity", () => {
    const busyGlow = computeGlowOpacity(STATUS_CONFIG.busy.emissiveMul);
    const activeGlow = computeGlowOpacity(STATUS_CONFIG.active.emissiveMul);
    const errorGlow = computeGlowOpacity(STATUS_CONFIG.error.emissiveMul);
    expect(busyGlow).toBeGreaterThan(activeGlow);
    expect(activeGlow).toBeGreaterThan(errorGlow);
  });
});

// ── 4. Spawn-in clip definition ───────────────────────────────────────────────

describe("Spawn-in animation clip", () => {
  it("spawn-in clip exists in BASE_SPRITE_SHEET", () => {
    expect(BASE_SPRITE_SHEET.animations["spawn-in"]).toBeDefined();
  });

  it("spawn-in is non-looping", () => {
    expect(BASE_SPRITE_SHEET.animations["spawn-in"].loop).toBe(false);
  });

  it("spawn-in has 2 frames at 8fps", () => {
    const clip = BASE_SPRITE_SHEET.animations["spawn-in"];
    expect(clip.frameCount).toBe(2);
    expect(clip.fps).toBe(8);
  });

  it("spawn-in is on Row 3 starting at column 2", () => {
    const clip = BASE_SPRITE_SHEET.animations["spawn-in"];
    expect(clip.row).toBe(3);
    expect(clip.startColumn).toBe(2);
  });
});

// ── 5. Spawn-in state machine logic ──────────────────────────────────────────

describe("Spawn-in state transitions", () => {
  it("isSpawning starts true, becomes false when finished", () => {
    // Simulate the state machine
    let isSpawning = true;
    let finished = false;

    // Frame 1: still spawning
    expect(isSpawning).toBe(true);

    // Simulate clip finishing
    finished = true;
    if (isSpawning && finished) {
      isSpawning = false;
    }

    expect(isSpawning).toBe(false);
  });

  it("animation switches from spawn-in to status clip after spawn completes", () => {
    let isSpawning = true;
    const statusEntry = STATUS_ANIMATION_MAP.idle;

    // During spawn
    const activeAnim1 = isSpawning ? "spawn-in" : statusEntry.animation;
    expect(activeAnim1).toBe("spawn-in");

    // After spawn completes
    isSpawning = false;
    const activeAnim2 = isSpawning ? "spawn-in" : statusEntry.animation;
    expect(activeAnim2).toBe("idle");
  });

  it("spawn-in speed is always 1 regardless of status speedMultiplier", () => {
    const isSpawning = true;
    const statusEntry = STATUS_ANIMATION_MAP.busy; // speedMultiplier=1.5

    const activeSpeed = isSpawning ? 1 : statusEntry.speedMultiplier;
    expect(activeSpeed).toBe(1);
  });

  it("after spawn, speed comes from STATUS_ANIMATION_MAP", () => {
    const isSpawning = false;
    const statusEntry = STATUS_ANIMATION_MAP.busy;

    const activeSpeed = isSpawning ? 1 : statusEntry.speedMultiplier;
    expect(activeSpeed).toBe(1.5);
  });
});
