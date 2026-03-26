/**
 * birds-eye-lod-layer.test.ts — Unit tests for Sub-AC 3b: BirdsEyeLODLayer.
 *
 * Tests the pure-logic exports of BirdsEyeLODLayer.tsx:
 *
 *   1. Layout constants: BLDG_FOOTPRINT_COLOR, BLDG_FOOTPRINT_OPACITY
 *   2. Zone constants: ZONE_FILL_OPACITY, ZONE_FILL_COLORS palette
 *   3. Room cell constants: ROOM_CELL_FILL_OPACITY, ROOM_CELL_OUTLINE_OPACITY
 *   4. Agent marker constants: AGENT_MARKER_BASE_RADIUS, AGENT_MARKER_ACTIVE_SCALE,
 *      AGENT_MARKER_OPACITY
 *   5. computeZoneFillColor: deterministic, wrap-safe, distinct across floors
 *   6. computeAgentMarkerRadius: active/busy agents get enlarged marker
 *
 * NOTE: BirdsEyeLODLayer uses React hooks (useMemo) and Three.js geometry —
 * both require a WebGL context.  These tests only validate the exported pure-
 * logic symbols that drive visual design decisions, consistent with the existing
 * test pattern for BirdsEyeOverlay (birds-eye-overlay.test.ts).
 *
 * Test ID scheme:
 *   3b-N : Sub-AC 3b bird's-eye LOD layer
 */

import { describe, it, expect } from "vitest";
import {
  // Level-1 constants
  BLDG_FOOTPRINT_COLOR,
  BLDG_FOOTPRINT_OPACITY,
  // Level-2 constants
  ZONE_FILL_OPACITY,
  ZONE_FILL_COLORS,
  // Level-3 constants
  ROOM_CELL_FILL_OPACITY,
  ROOM_CELL_OUTLINE_OPACITY,
  // Level-4 constants
  AGENT_MARKER_BASE_RADIUS,
  AGENT_MARKER_ACTIVE_SCALE,
  AGENT_MARKER_OPACITY,
  // Pure helper functions
  computeZoneFillColor,
  computeAgentMarkerRadius,
} from "../BirdsEyeLODLayer.js";

// ── 1. Level-1 building footprint constants (3b-1) ────────────────────────────

describe("Level-1 building footprint constants (3b-1)", () => {
  it("BLDG_FOOTPRINT_COLOR is a valid hex color string", () => {
    expect(typeof BLDG_FOOTPRINT_COLOR).toBe("string");
    expect(BLDG_FOOTPRINT_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("BLDG_FOOTPRINT_OPACITY is a finite number in (0, 1]", () => {
    expect(Number.isFinite(BLDG_FOOTPRINT_OPACITY)).toBe(true);
    expect(BLDG_FOOTPRINT_OPACITY).toBeGreaterThan(0);
    expect(BLDG_FOOTPRINT_OPACITY).toBeLessThanOrEqual(1);
  });

  it("BLDG_FOOTPRINT_OPACITY is prominently visible (> 0.5)", () => {
    // The footprint outline must be clearly visible from bird's-eye altitude.
    expect(BLDG_FOOTPRINT_OPACITY).toBeGreaterThan(0.5);
  });
});

// ── 2. Level-2 office zone constants (3b-2) ───────────────────────────────────

describe("Level-2 office zone constants (3b-2)", () => {
  it("ZONE_FILL_OPACITY is a finite number in (0, 1)", () => {
    expect(Number.isFinite(ZONE_FILL_OPACITY)).toBe(true);
    expect(ZONE_FILL_OPACITY).toBeGreaterThan(0);
    expect(ZONE_FILL_OPACITY).toBeLessThan(1);
  });

  it("ZONE_FILL_OPACITY is subtle (≤ 0.25) to avoid obscuring room cells below", () => {
    expect(ZONE_FILL_OPACITY).toBeLessThanOrEqual(0.25);
  });

  it("ZONE_FILL_COLORS defines at least 2 distinct floor colors", () => {
    expect(ZONE_FILL_COLORS.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(ZONE_FILL_COLORS);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("every ZONE_FILL_COLORS entry is a valid hex color string", () => {
    for (const color of ZONE_FILL_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("floor 0 and floor 1 have distinct zone fill colors", () => {
    expect(ZONE_FILL_COLORS[0]).not.toBe(ZONE_FILL_COLORS[1]);
  });
});

// ── 3. Level-3 room cell constants (3b-3) ─────────────────────────────────────

describe("Level-3 room cell constants (3b-3)", () => {
  it("ROOM_CELL_FILL_OPACITY is a finite number in (0, 1)", () => {
    expect(Number.isFinite(ROOM_CELL_FILL_OPACITY)).toBe(true);
    expect(ROOM_CELL_FILL_OPACITY).toBeGreaterThan(0);
    expect(ROOM_CELL_FILL_OPACITY).toBeLessThan(1);
  });

  it("ROOM_CELL_FILL_OPACITY is more prominent than BirdsEyeOverlay ceiling tile opacity (0.07)", () => {
    // The room cell fill must be visually distinguishable from the faint ceiling tiles.
    expect(ROOM_CELL_FILL_OPACITY).toBeGreaterThan(0.07);
  });

  it("ROOM_CELL_OUTLINE_OPACITY is a finite number in (0, 1]", () => {
    expect(Number.isFinite(ROOM_CELL_OUTLINE_OPACITY)).toBe(true);
    expect(ROOM_CELL_OUTLINE_OPACITY).toBeGreaterThan(0);
    expect(ROOM_CELL_OUTLINE_OPACITY).toBeLessThanOrEqual(1);
  });

  it("ROOM_CELL_OUTLINE_OPACITY is clearly visible (> 0.4)", () => {
    // Room outlines must be crisp enough to delineate room boundaries at altitude.
    expect(ROOM_CELL_OUTLINE_OPACITY).toBeGreaterThan(0.4);
  });

  it("outline opacity exceeds fill opacity (edges more prominent than fill)", () => {
    expect(ROOM_CELL_OUTLINE_OPACITY).toBeGreaterThan(ROOM_CELL_FILL_OPACITY);
  });
});

// ── 4. Level-4 agent marker constants (3b-4) ──────────────────────────────────

describe("Level-4 agent marker constants (3b-4)", () => {
  it("AGENT_MARKER_BASE_RADIUS is a positive finite number", () => {
    expect(Number.isFinite(AGENT_MARKER_BASE_RADIUS)).toBe(true);
    expect(AGENT_MARKER_BASE_RADIUS).toBeGreaterThan(0);
  });

  it("AGENT_MARKER_BASE_RADIUS fits within a room (< 0.5 world units)", () => {
    // Marker should be a small disc that fits within any room cell.
    expect(AGENT_MARKER_BASE_RADIUS).toBeLessThan(0.5);
  });

  it("AGENT_MARKER_ACTIVE_SCALE is > 1.0 (active agents are larger)", () => {
    expect(AGENT_MARKER_ACTIVE_SCALE).toBeGreaterThan(1.0);
  });

  it("AGENT_MARKER_ACTIVE_SCALE is not excessively large (< 3.0)", () => {
    expect(AGENT_MARKER_ACTIVE_SCALE).toBeLessThan(3.0);
  });

  it("AGENT_MARKER_OPACITY is a finite number in (0, 1]", () => {
    expect(Number.isFinite(AGENT_MARKER_OPACITY)).toBe(true);
    expect(AGENT_MARKER_OPACITY).toBeGreaterThan(0);
    expect(AGENT_MARKER_OPACITY).toBeLessThanOrEqual(1);
  });

  it("AGENT_MARKER_OPACITY is clearly visible (> 0.5)", () => {
    expect(AGENT_MARKER_OPACITY).toBeGreaterThan(0.5);
  });
});

// ── 5. computeZoneFillColor (3b-5) ───────────────────────────────────────────

describe("computeZoneFillColor (3b-5)", () => {
  it("returns a valid hex color string for floor 0", () => {
    const color = computeZoneFillColor(0);
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("returns a valid hex color string for floor 1", () => {
    const color = computeZoneFillColor(1);
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("floor 0 and floor 1 return distinct colors", () => {
    expect(computeZoneFillColor(0)).not.toBe(computeZoneFillColor(1));
  });

  it("is deterministic: same floor always returns same color", () => {
    expect(computeZoneFillColor(0)).toBe(computeZoneFillColor(0));
    expect(computeZoneFillColor(1)).toBe(computeZoneFillColor(1));
    expect(computeZoneFillColor(3)).toBe(computeZoneFillColor(3));
  });

  it("wraps correctly for floor index equal to palette length", () => {
    const len = ZONE_FILL_COLORS.length;
    expect(computeZoneFillColor(len)).toBe(computeZoneFillColor(0));
  });

  it("wraps correctly for floor index double the palette length", () => {
    const len = ZONE_FILL_COLORS.length;
    expect(computeZoneFillColor(len * 2)).toBe(computeZoneFillColor(0));
  });

  it("wraps correctly for large floor indices (buildings with many floors)", () => {
    const color = computeZoneFillColor(100);
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

// ── 6. computeAgentMarkerRadius (3b-6) ───────────────────────────────────────

describe("computeAgentMarkerRadius (3b-6)", () => {
  it("returns AGENT_MARKER_BASE_RADIUS for inactive status", () => {
    expect(computeAgentMarkerRadius("inactive")).toBe(AGENT_MARKER_BASE_RADIUS);
  });

  it("returns AGENT_MARKER_BASE_RADIUS for idle status", () => {
    expect(computeAgentMarkerRadius("idle")).toBe(AGENT_MARKER_BASE_RADIUS);
  });

  it("returns AGENT_MARKER_BASE_RADIUS for error status", () => {
    expect(computeAgentMarkerRadius("error")).toBe(AGENT_MARKER_BASE_RADIUS);
  });

  it("returns AGENT_MARKER_BASE_RADIUS for terminated status", () => {
    expect(computeAgentMarkerRadius("terminated")).toBe(AGENT_MARKER_BASE_RADIUS);
  });

  it("returns enlarged radius for active status", () => {
    const radius = computeAgentMarkerRadius("active");
    expect(radius).toBeGreaterThan(AGENT_MARKER_BASE_RADIUS);
    expect(radius).toBeCloseTo(AGENT_MARKER_BASE_RADIUS * AGENT_MARKER_ACTIVE_SCALE, 5);
  });

  it("returns enlarged radius for busy status", () => {
    const radius = computeAgentMarkerRadius("busy");
    expect(radius).toBeGreaterThan(AGENT_MARKER_BASE_RADIUS);
    expect(radius).toBeCloseTo(AGENT_MARKER_BASE_RADIUS * AGENT_MARKER_ACTIVE_SCALE, 5);
  });

  it("active and busy return the same enlarged radius", () => {
    expect(computeAgentMarkerRadius("active")).toBe(computeAgentMarkerRadius("busy"));
  });

  it("active radius is larger than inactive radius by the expected scale factor", () => {
    const activeR   = computeAgentMarkerRadius("active");
    const inactiveR = computeAgentMarkerRadius("inactive");
    expect(activeR / inactiveR).toBeCloseTo(AGENT_MARKER_ACTIVE_SCALE, 5);
  });

  it("handles unknown status strings gracefully (returns base radius)", () => {
    const radius = computeAgentMarkerRadius("unknown_status_xyz");
    expect(radius).toBe(AGENT_MARKER_BASE_RADIUS);
  });

  it("returns a positive finite number for all statuses", () => {
    const statuses = ["inactive", "idle", "active", "busy", "error", "terminated"];
    for (const s of statuses) {
      const r = computeAgentMarkerRadius(s);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });
});

// ── 7. Hierarchy contract: opacity ordering (3b-7) ────────────────────────────

describe("Hierarchy visual contract: opacity ordering (3b-7)", () => {
  it("room cells are more prominent than zone fills (L3 fill > L2 fill)", () => {
    expect(ROOM_CELL_FILL_OPACITY).toBeGreaterThan(ZONE_FILL_OPACITY);
  });

  it("building footprint is highly visible (L1 > L3 outline)", () => {
    expect(BLDG_FOOTPRINT_OPACITY).toBeGreaterThan(ROOM_CELL_FILL_OPACITY);
  });

  it("agent markers are clearly visible (L4 > L2 fill)", () => {
    expect(AGENT_MARKER_OPACITY).toBeGreaterThan(ZONE_FILL_OPACITY);
  });
});
