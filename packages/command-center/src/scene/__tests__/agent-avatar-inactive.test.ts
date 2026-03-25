/**
 * agent-avatar-inactive.test.ts — Unit tests for Sub-AC 2b: Low-poly 3D avatar
 * mesh geometry with distinct inactive visual styling.
 *
 * Validates the pure-logic aspects of AgentAvatar.tsx that define the
 * "inactive" and other status visual styles:
 *
 *   1. AVATAR_DIMENSIONS constants — geometry sizes are well-defined
 *   2. STATUS_CONFIG values — per-status opacity, emissive, animate, desatFactor
 *   3. desaturateHexColor() — correct RGB desaturation math
 *   4. Inactive-state contract — desatFactor is significant (≥ 0.5)
 *   5. Active-state contract — desatFactor = 0 (full role color)
 *   6. Terminated-state contract — near-fully desaturated (≥ 0.85)
 *   7. Color desaturation → grey convergence for factor = 1.0
 *   8. Color desaturation → passthrough for factor = 0.0
 *   9. Short hex (#rgb) normalization
 *  10. Invalid hex passthrough (no crash)
 *  11. STATUS_CONFIG completeness — all AgentStatus values covered
 *  12. STATUS_CONFIG ordering — inactive < idle < active < busy opacity ladder
 *
 * NOTE: Three.js and R3F hooks (useFrame, Html) cannot run headless.
 *       These tests target only the exported constants and pure utility functions.
 *
 * Test ID scheme:
 *   2b-N : Sub-AC 2b avatar inactive styling
 */

import { describe, it, expect } from "vitest";
import {
  AVATAR_DIMENSIONS,
  STATUS_CONFIG,
  desaturateHexColor,
} from "../AgentAvatar.js";

// ── 1. AVATAR_DIMENSIONS ───────────────────────────────────────────────────────

describe("AVATAR_DIMENSIONS constants (2b-1)", () => {
  it("BODY_HEIGHT is a positive number", () => {
    expect(AVATAR_DIMENSIONS.BODY_HEIGHT).toBeGreaterThan(0);
  });

  it("BODY_RADIUS is a positive number", () => {
    expect(AVATAR_DIMENSIONS.BODY_RADIUS).toBeGreaterThan(0);
  });

  it("HEAD_RADIUS is a positive number", () => {
    expect(AVATAR_DIMENSIONS.HEAD_RADIUS).toBeGreaterThan(0);
  });

  it("TOTAL_HEIGHT equals BODY_HEIGHT + HEAD_RADIUS*2 + 0.05", () => {
    const expected =
      AVATAR_DIMENSIONS.BODY_HEIGHT +
      AVATAR_DIMENSIONS.HEAD_RADIUS * 2 +
      0.05;
    expect(AVATAR_DIMENSIONS.TOTAL_HEIGHT).toBeCloseTo(expected, 10);
  });

  it("TOTAL_HEIGHT > BODY_HEIGHT (head protrudes above body)", () => {
    expect(AVATAR_DIMENSIONS.TOTAL_HEIGHT).toBeGreaterThan(
      AVATAR_DIMENSIONS.BODY_HEIGHT,
    );
  });

  it("HEAD_RADIUS < BODY_RADIUS (head is narrower than body)", () => {
    expect(AVATAR_DIMENSIONS.HEAD_RADIUS).toBeLessThan(
      AVATAR_DIMENSIONS.BODY_RADIUS,
    );
  });

  it("BODY_HEIGHT documented value is 0.55", () => {
    expect(AVATAR_DIMENSIONS.BODY_HEIGHT).toBe(0.55);
  });

  it("BODY_RADIUS documented value is 0.12", () => {
    expect(AVATAR_DIMENSIONS.BODY_RADIUS).toBe(0.12);
  });

  it("HEAD_RADIUS documented value is 0.1", () => {
    expect(AVATAR_DIMENSIONS.HEAD_RADIUS).toBe(0.1);
  });
});

// ── 2. STATUS_CONFIG values ───────────────────────────────────────────────────

describe("STATUS_CONFIG shape (2b-2)", () => {
  const statuses = ["inactive", "idle", "active", "busy", "error", "terminated"] as const;

  it("contains all expected status keys", () => {
    for (const s of statuses) {
      expect(STATUS_CONFIG).toHaveProperty(s);
    }
  });

  it("each status has opacity, emissiveMul, animate, desatFactor fields", () => {
    for (const s of statuses) {
      const cfg = STATUS_CONFIG[s];
      expect(cfg).toHaveProperty("opacity");
      expect(cfg).toHaveProperty("emissiveMul");
      expect(cfg).toHaveProperty("animate");
      expect(cfg).toHaveProperty("desatFactor");
    }
  });

  it("all opacity values are between 0 and 1 inclusive", () => {
    for (const s of statuses) {
      expect(STATUS_CONFIG[s].opacity).toBeGreaterThanOrEqual(0);
      expect(STATUS_CONFIG[s].opacity).toBeLessThanOrEqual(1);
    }
  });

  it("all emissiveMul values are between 0 and 1 inclusive", () => {
    for (const s of statuses) {
      expect(STATUS_CONFIG[s].emissiveMul).toBeGreaterThanOrEqual(0);
      expect(STATUS_CONFIG[s].emissiveMul).toBeLessThanOrEqual(1);
    }
  });

  it("all desatFactor values are between 0 and 1 inclusive", () => {
    for (const s of statuses) {
      expect(STATUS_CONFIG[s].desatFactor).toBeGreaterThanOrEqual(0);
      expect(STATUS_CONFIG[s].desatFactor).toBeLessThanOrEqual(1);
    }
  });
});

// ── 3. desaturateHexColor math ────────────────────────────────────────────────

describe("desaturateHexColor utility (2b-3)", () => {
  it("returns a string starting with #", () => {
    expect(desaturateHexColor("#ff0000", 0.5)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns a 6-character hex string (lowercase or uppercase)", () => {
    const result = desaturateHexColor("#00ff88", 0.5);
    expect(result).toHaveLength(7); // # + 6 chars
    expect(result[0]).toBe("#");
  });
});

// ── 4. Inactive-state contract ────────────────────────────────────────────────

describe("Inactive status visual contract (2b-4)", () => {
  it("inactive desatFactor is ≥ 0.5 (significant desaturation)", () => {
    expect(STATUS_CONFIG.inactive.desatFactor).toBeGreaterThanOrEqual(0.5);
  });

  it("inactive opacity is < 0.6 (clearly dimmer than idle)", () => {
    expect(STATUS_CONFIG.inactive.opacity).toBeLessThan(0.6);
  });

  it("inactive emissiveMul is < 0.3 (near-dark emissive)", () => {
    expect(STATUS_CONFIG.inactive.emissiveMul).toBeLessThan(0.3);
  });

  it("inactive animate is false (no motion animation)", () => {
    expect(STATUS_CONFIG.inactive.animate).toBe(false);
  });

  it("inactive desatFactor (0.72) moves pure-red toward grey", () => {
    // #ff0000 at factor 0.72 should produce a pinkish grey, not pure red
    const result = desaturateHexColor("#ff0000", STATUS_CONFIG.inactive.desatFactor);
    // Parse result channels
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    // Red channel should be significantly reduced from 255
    expect(r).toBeLessThan(255);
    // Green and blue channels should have risen from 0
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    // The color should be "neutralized" — all channels should be relatively close
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    // At 72% desaturation, spread should be much less than full saturation (255)
    expect(spread).toBeLessThan(120);
  });

  it("inactive role-colored agent appears as muted grey-ish hue", () => {
    // Simulate manager agent color (#6ec6ff - light blue)
    const result = desaturateHexColor("#6ec6ff", STATUS_CONFIG.inactive.desatFactor);
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    // All channels should be closer to grey (within 40 of each other for 72% desat)
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    expect(maxCh - minCh).toBeLessThan(50);
  });
});

// ── 5. Active-state contract ──────────────────────────────────────────────────

describe("Active status visual contract (2b-5)", () => {
  it("active desatFactor is 0 (full role color retained)", () => {
    expect(STATUS_CONFIG.active.desatFactor).toBe(0);
  });

  it("busy desatFactor is 0 (full role color retained)", () => {
    expect(STATUS_CONFIG.busy.desatFactor).toBe(0);
  });

  it("idle desatFactor is 0 (full role color retained)", () => {
    expect(STATUS_CONFIG.idle.desatFactor).toBe(0);
  });

  it("error desatFactor is 0 (color retained — red error tint drives the visual)", () => {
    expect(STATUS_CONFIG.error.desatFactor).toBe(0);
  });

  it("active emissiveMul is ≥ 0.5 (bright glow)", () => {
    expect(STATUS_CONFIG.active.emissiveMul).toBeGreaterThanOrEqual(0.5);
  });

  it("busy emissiveMul is ≥ active emissiveMul (busiest → brightest)", () => {
    expect(STATUS_CONFIG.busy.emissiveMul).toBeGreaterThanOrEqual(
      STATUS_CONFIG.active.emissiveMul,
    );
  });

  it("active and busy animate is true", () => {
    expect(STATUS_CONFIG.active.animate).toBe(true);
    expect(STATUS_CONFIG.busy.animate).toBe(true);
  });
});

// ── 6. Terminated-state contract ──────────────────────────────────────────────

describe("Terminated status visual contract (2b-6)", () => {
  it("terminated desatFactor is ≥ 0.85 (near-monochrome 'dead' look)", () => {
    expect(STATUS_CONFIG.terminated.desatFactor).toBeGreaterThanOrEqual(0.85);
  });

  it("terminated opacity is ≤ 0.25 (ghost-like transparency)", () => {
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThanOrEqual(0.25);
  });

  it("terminated emissiveMul is ≤ 0.1 (almost no glow)", () => {
    expect(STATUS_CONFIG.terminated.emissiveMul).toBeLessThanOrEqual(0.1);
  });

  it("terminated animate is false", () => {
    expect(STATUS_CONFIG.terminated.animate).toBe(false);
  });

  it("terminated is dimmer than inactive (terminated < inactive opacity)", () => {
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThan(
      STATUS_CONFIG.inactive.opacity,
    );
  });
});

// ── 7. desatFactor = 1.0 → grey convergence ──────────────────────────────────

describe("desaturateHexColor with factor = 1.0 (2b-7)", () => {
  it("pure red #ff0000 → luminance grey (all channels equal)", () => {
    const result = desaturateHexColor("#ff0000", 1.0);
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    // All channels should converge (within ±1 due to rounding)
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
    expect(Math.abs(r - b)).toBeLessThanOrEqual(1);
  });

  it("pure green #00ff00 → luminance grey (all channels ≈ 182)", () => {
    // Rec 709 lum of pure green: 0.7152 × 1 ≈ 0.7152 → 182.3
    const result = desaturateHexColor("#00ff00", 1.0);
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
    // Green's luminance weight is 71.52%, so grey should be brighter than red's
    expect(r).toBeGreaterThan(50);
  });

  it("grey input #808080 → remains same grey", () => {
    const result = desaturateHexColor("#808080", 1.0);
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    // Should stay close to 128 (0x80)
    expect(r).toBeCloseTo(128, -1);
    expect(g).toBeCloseTo(128, -1);
    expect(b).toBeCloseTo(128, -1);
  });
});

// ── 8. desatFactor = 0.0 → passthrough ───────────────────────────────────────

describe("desaturateHexColor with factor = 0.0 (2b-8)", () => {
  it("pure red #ff0000 → unchanged", () => {
    expect(desaturateHexColor("#ff0000", 0.0)).toBe("#ff0000");
  });

  it("pure blue #0000ff → unchanged", () => {
    expect(desaturateHexColor("#0000ff", 0.0)).toBe("#0000ff");
  });

  it("arbitrary color #6ec6ff → unchanged", () => {
    expect(desaturateHexColor("#6ec6ff", 0.0)).toBe("#6ec6ff");
  });

  it("white #ffffff → unchanged", () => {
    expect(desaturateHexColor("#ffffff", 0.0)).toBe("#ffffff");
  });

  it("black #000000 → unchanged", () => {
    expect(desaturateHexColor("#000000", 0.0)).toBe("#000000");
  });
});

// ── 9. Short hex normalization ────────────────────────────────────────────────

describe("desaturateHexColor short hex normalization (2b-9)", () => {
  it("#f00 is treated the same as #ff0000", () => {
    const shortResult = desaturateHexColor("#f00", 0.5);
    const longResult  = desaturateHexColor("#ff0000", 0.5);
    expect(shortResult).toBe(longResult);
  });

  it("#0f0 is treated the same as #00ff00", () => {
    const shortResult = desaturateHexColor("#0f0", 0.5);
    const longResult  = desaturateHexColor("#00ff00", 0.5);
    expect(shortResult).toBe(longResult);
  });

  it("#08f is treated the same as #0088ff", () => {
    const shortResult = desaturateHexColor("#08f", 0.5);
    const longResult  = desaturateHexColor("#0088ff", 0.5);
    expect(shortResult).toBe(longResult);
  });
});

// ── 10. Invalid hex passthrough ───────────────────────────────────────────────

describe("desaturateHexColor invalid input (2b-10)", () => {
  it("returns the original string for invalid hex", () => {
    expect(desaturateHexColor("not-a-color", 0.5)).toBe("not-a-color");
  });

  it("returns the original string for empty string", () => {
    expect(desaturateHexColor("", 0.5)).toBe("");
  });

  it("returns the original string for rgb() notation", () => {
    const rgb = "rgb(255, 0, 0)";
    expect(desaturateHexColor(rgb, 0.5)).toBe(rgb);
  });

  it("does not throw on malformed input", () => {
    expect(() => desaturateHexColor("#xyz", 0.5)).not.toThrow();
    expect(() => desaturateHexColor("###", 0.5)).not.toThrow();
    expect(() => desaturateHexColor("#1234567", 0.5)).not.toThrow();
  });
});

// ── 11. STATUS_CONFIG completeness ────────────────────────────────────────────

describe("STATUS_CONFIG completeness (2b-11)", () => {
  /** All AgentStatus values from agents.ts */
  const ALL_AGENT_STATUSES = [
    "inactive",
    "idle",
    "active",
    "busy",
    "error",
    "terminated",
  ] as const;

  it("has exactly the set of AgentStatus values", () => {
    const configKeys = Object.keys(STATUS_CONFIG).sort();
    const expectedKeys = [...ALL_AGENT_STATUSES].sort();
    expect(configKeys).toEqual(expectedKeys);
  });

  it("does not contain unknown keys", () => {
    for (const key of Object.keys(STATUS_CONFIG)) {
      expect(ALL_AGENT_STATUSES).toContain(key);
    }
  });
});

// ── 12. STATUS_CONFIG opacity ladder ─────────────────────────────────────────

describe("STATUS_CONFIG opacity ladder (2b-12)", () => {
  it("inactive opacity < idle opacity", () => {
    expect(STATUS_CONFIG.inactive.opacity).toBeLessThan(STATUS_CONFIG.idle.opacity);
  });

  it("idle opacity < active opacity", () => {
    expect(STATUS_CONFIG.idle.opacity).toBeLessThan(STATUS_CONFIG.active.opacity);
  });

  it("active opacity ≤ busy opacity", () => {
    expect(STATUS_CONFIG.active.opacity).toBeLessThanOrEqual(STATUS_CONFIG.busy.opacity);
  });

  it("terminated opacity < inactive opacity (most transparent)", () => {
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThan(
      STATUS_CONFIG.inactive.opacity,
    );
  });

  it("emissive ladder: inactive < idle < active ≤ busy", () => {
    expect(STATUS_CONFIG.inactive.emissiveMul).toBeLessThan(
      STATUS_CONFIG.idle.emissiveMul,
    );
    expect(STATUS_CONFIG.idle.emissiveMul).toBeLessThan(
      STATUS_CONFIG.active.emissiveMul,
    );
    expect(STATUS_CONFIG.active.emissiveMul).toBeLessThanOrEqual(
      STATUS_CONFIG.busy.emissiveMul,
    );
  });
});

// ── 13. desaturateHexColor monotonicity ───────────────────────────────────────

describe("desaturateHexColor monotonicity (2b-13)", () => {
  it("higher factor → larger channel spread reduction on a saturated color", () => {
    const input = "#ff0066"; // vibrant pink
    const spreadAt = (factor: number) => {
      const result = desaturateHexColor(input, factor);
      const r = parseInt(result.slice(1, 3), 16);
      const g = parseInt(result.slice(3, 5), 16);
      const b = parseInt(result.slice(5, 7), 16);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    // Increasing factor should monotonically reduce saturation (spread)
    expect(spreadAt(0.0)).toBeGreaterThan(spreadAt(0.5));
    expect(spreadAt(0.5)).toBeGreaterThan(spreadAt(0.9));
    expect(spreadAt(1.0)).toBeLessThanOrEqual(1); // fully grey (rounding)
  });

  it("blue tones desaturate to a lighter grey (lower luminance weight for blue)", () => {
    const deepBlue = "#0000ff";
    const desat = desaturateHexColor(deepBlue, 1.0);
    const r = parseInt(desat.slice(1, 3), 16);
    // Rec 709: blue luminance = 0.0722, so grey value ≈ 18
    expect(r).toBeLessThan(30);
  });
});
