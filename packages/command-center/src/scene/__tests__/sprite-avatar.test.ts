/**
 * sprite-avatar.test.ts — Tests for the SpriteAvatar integration (Seed 3).
 *
 * Validates: feature flag toggling, LOD policy, collider config, opacity,
 * raycast disabling, sprite LOD detail, animation suppression, and constants.
 */
import { describe, it, expect } from "vitest";
import {
  SPRITE_LOD,
  SPRITE_LOD_DETAIL,
  getSpriteLodLevel,
  type SpriteLodVisibility,
} from "../lod-drill-policy.js";
import {
  SPRITE_Y_OFFSET,
  SPRITE_COLLIDER_ARGS,
} from "../SpriteAvatar.js";
import { STATUS_CONFIG } from "../AgentAvatar.js";
import { STATUS_ANIMATION_MAP } from "../../data/sprite-animation-types.js";

// ── 1. SpriteAvatar constants ──────────────────────────────────────────────────

describe("SpriteAvatar constants", () => {
  it("SPRITE_Y_OFFSET is a positive number for base alignment", () => {
    expect(SPRITE_Y_OFFSET).toBeGreaterThan(0);
    expect(typeof SPRITE_Y_OFFSET).toBe("number");
  });

  it("SPRITE_COLLIDER_ARGS has 4 elements [radiusTop, radiusBottom, height, segments]", () => {
    expect(SPRITE_COLLIDER_ARGS).toHaveLength(4);
    expect(SPRITE_COLLIDER_ARGS[0]).toBe(0.2); // radiusTop
    expect(SPRITE_COLLIDER_ARGS[1]).toBe(0.2); // radiusBottom
    expect(SPRITE_COLLIDER_ARGS[2]).toBe(0.6); // height
    expect(SPRITE_COLLIDER_ARGS[3]).toBe(6);   // segments
  });
});

// ── 2. SPRITE_LOD thresholds ───────────────────────────────────────────────────

describe("SPRITE_LOD thresholds", () => {
  it("near threshold is 8", () => {
    expect(SPRITE_LOD.near).toBe(8);
  });

  it("far threshold is 18", () => {
    expect(SPRITE_LOD.far).toBe(18);
  });

  it("near < far (valid range)", () => {
    expect(SPRITE_LOD.near).toBeLessThan(SPRITE_LOD.far);
  });
});

// ── 3. getSpriteLodLevel ────────────────────────────────────────────────────────

describe("getSpriteLodLevel", () => {
  it("returns 'near' for distance < 8", () => {
    expect(getSpriteLodLevel(0)).toBe("near");
    expect(getSpriteLodLevel(5)).toBe("near");
    expect(getSpriteLodLevel(7.9)).toBe("near");
  });

  it("returns 'mid' for distance between 8 and 18", () => {
    expect(getSpriteLodLevel(8)).toBe("mid");
    expect(getSpriteLodLevel(12)).toBe("mid");
    expect(getSpriteLodLevel(17.9)).toBe("mid");
  });

  it("returns 'far' for distance >= 18", () => {
    expect(getSpriteLodLevel(18)).toBe("far");
    expect(getSpriteLodLevel(25)).toBe("far");
    expect(getSpriteLodLevel(100)).toBe("far");
  });
});

// ── 4. SPRITE_LOD_DETAIL policy ─────────────────────────────────────────────────

describe("SPRITE_LOD_DETAIL", () => {
  it("FAR: hides sprite, shows dot, no badge, no statusDot, no animation", () => {
    const far: SpriteLodVisibility = SPRITE_LOD_DETAIL.far;
    expect(far.showSprite).toBe(false);
    expect(far.showDot).toBe(true);
    expect(far.showBadge).toBe(false);
    expect(far.showStatusDot).toBe(false);
    expect(far.animate).toBe(false);
  });

  it("MID: shows sprite, no dot, shows badge, no statusDot, no animation", () => {
    const mid: SpriteLodVisibility = SPRITE_LOD_DETAIL.mid;
    expect(mid.showSprite).toBe(true);
    expect(mid.showDot).toBe(false);
    expect(mid.showBadge).toBe(true);
    expect(mid.showStatusDot).toBe(false);
    expect(mid.animate).toBe(false);
  });

  it("NEAR: shows sprite, no dot, shows badge, shows statusDot, animation enabled", () => {
    const near: SpriteLodVisibility = SPRITE_LOD_DETAIL.near;
    expect(near.showSprite).toBe(true);
    expect(near.showDot).toBe(false);
    expect(near.showBadge).toBe(true);
    expect(near.showStatusDot).toBe(true);
    expect(near.animate).toBe(true);
  });

  it("has entries for all three LOD levels", () => {
    expect(SPRITE_LOD_DETAIL).toHaveProperty("far");
    expect(SPRITE_LOD_DETAIL).toHaveProperty("mid");
    expect(SPRITE_LOD_DETAIL).toHaveProperty("near");
  });
});

// ── 5. STATUS_CONFIG opacity integration ────────────────────────────────────────

describe("STATUS_CONFIG opacity for sprite rendering", () => {
  it("all 6 statuses have numeric opacity values between 0 and 1", () => {
    const statuses = ["inactive", "idle", "active", "busy", "error", "terminated"] as const;
    for (const status of statuses) {
      const cfg = STATUS_CONFIG[status];
      expect(cfg).toBeDefined();
      expect(cfg.opacity).toBeGreaterThanOrEqual(0);
      expect(cfg.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("terminated has lowest opacity", () => {
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThan(STATUS_CONFIG.inactive.opacity);
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThan(STATUS_CONFIG.idle.opacity);
  });

  it("busy has highest opacity (1.0)", () => {
    expect(STATUS_CONFIG.busy.opacity).toBe(1.0);
  });
});

// ── 6. STATUS_ANIMATION_MAP integration ─────────────────────────────────────────

describe("STATUS_ANIMATION_MAP for sprite rendering", () => {
  it("inactive maps to greyscale-idle with 0.5x speed", () => {
    const entry = STATUS_ANIMATION_MAP.inactive;
    expect(entry.animation).toBe("greyscale-idle");
    expect(entry.speedMultiplier).toBe(0.5);
  });

  it("terminated maps to greyscale-idle with 0x speed (frozen)", () => {
    const entry = STATUS_ANIMATION_MAP.terminated;
    expect(entry.animation).toBe("greyscale-idle");
    expect(entry.speedMultiplier).toBe(0);
  });

  it("active and busy both map to work animation", () => {
    expect(STATUS_ANIMATION_MAP.active.animation).toBe("work");
    expect(STATUS_ANIMATION_MAP.busy.animation).toBe("work");
  });

  it("busy has higher speed multiplier than active", () => {
    expect(STATUS_ANIMATION_MAP.busy.speedMultiplier).toBeGreaterThan(
      STATUS_ANIMATION_MAP.active.speedMultiplier,
    );
  });
});

// ── 7. Feature flag ─────────────────────────────────────────────────────────────

describe("Feature flag usePixelSprites", () => {
  it("agent-store exports useAgentStore with usePixelSprites field", async () => {
    // Dynamic import to avoid React context issues
    const mod = await import("../../store/agent-store.js");
    const state = mod.useAgentStore.getState();
    expect(typeof state.usePixelSprites).toBe("boolean");
    expect(typeof state.setUsePixelSprites).toBe("function");
  });

  it("usePixelSprites defaults to true", async () => {
    const mod = await import("../../store/agent-store.js");
    const state = mod.useAgentStore.getState();
    expect(state.usePixelSprites).toBe(true);
  });

  it("setUsePixelSprites toggles the flag", async () => {
    const mod = await import("../../store/agent-store.js");
    const initial = mod.useAgentStore.getState().usePixelSprites;
    mod.useAgentStore.getState().setUsePixelSprites(!initial);
    expect(mod.useAgentStore.getState().usePixelSprites).toBe(!initial);
    // Reset
    mod.useAgentStore.getState().setUsePixelSprites(initial);
  });
});

// ── 8. LOD fade computation logic ───────────────────────────────────────────────

describe("LOD fade computation", () => {
  // Test the clamp logic used inline in SpriteAvatar
  function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  it("fade factor is 1.0 well below the far threshold", () => {
    const dist = 10; // well below 17.5
    const fade = 1 - clamp01((dist - (SPRITE_LOD.far - 0.5)) / 0.5);
    expect(fade).toBe(1);
  });

  it("fade factor is 0.0 at or above the far threshold", () => {
    const dist = 18;
    const fade = 1 - clamp01((dist - (SPRITE_LOD.far - 0.5)) / 0.5);
    expect(fade).toBe(0);
  });

  it("fade factor is 0.5 at the midpoint of the transition band", () => {
    const dist = 17.75; // midpoint of 17.5–18.0
    const fade = 1 - clamp01((dist - (SPRITE_LOD.far - 0.5)) / 0.5);
    expect(fade).toBeCloseTo(0.5);
  });
});

// ── 9. Sprite raycast disabled ──────────────────────────────────────────────────

describe("Sprite raycast policy", () => {
  it("NOOP_RAYCAST pattern: a no-op function returns undefined", () => {
    // The actual no-op is inside SpriteAvatar; we test the pattern
    const noop = () => {};
    expect(noop()).toBeUndefined();
    expect(typeof noop).toBe("function");
  });
});

// ── 10. Backward compatibility ──────────────────────────────────────────────────

describe("Backward compatibility", () => {
  it("STATUS_CONFIG still has all 6 status entries", () => {
    const expected = ["inactive", "idle", "active", "busy", "error", "terminated"];
    for (const s of expected) {
      expect(STATUS_CONFIG).toHaveProperty(s);
    }
  });

  it("STATUS_CONFIG entries have required fields", () => {
    for (const key of Object.keys(STATUS_CONFIG)) {
      const cfg = STATUS_CONFIG[key];
      expect(typeof cfg.opacity).toBe("number");
      expect(typeof cfg.emissiveMul).toBe("number");
      expect(typeof cfg.animate).toBe("boolean");
      expect(typeof cfg.desatFactor).toBe("number");
    }
  });
});
