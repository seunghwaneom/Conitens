/**
 * zoom-lod-policy.test.ts — Unit tests for Sub-AC 3b zoom-driven LOD policy.
 *
 * "Implement hierarchical scene LOD rendering — at bird's-eye zoom level
 *  render building-level overview, at mid-level render rooms/offices, at
 *  close level render individual agents; each level uses appropriate
 *  low-poly detail and labels."
 *
 * All tested functions are pure (no React, no Three.js, no store) so this
 * suite runs fully in Node.js without a browser or WebGL context.
 *
 * Coverage matrix
 * ───────────────
 * 3b-const  Exported constants (zoom range, thresholds)
 * 3b-level  computeZoomLODLevel — tier classification
 * 3b-opac   computeHierarchyZoomOpacities — per-tier opacity multipliers
 * 3b-lerp   Smooth opacity interpolation across threshold boundaries
 * 3b-label  computeZoomLabelVisibility — label flags per LOD tier
 * 3b-bstyle computeBuildingLabelStyle — building label style
 * 3b-tier   computeTierZoomOpacity — single-tier opacity
 * 3b-gate   shouldRenderZoomTier — render gate
 * 3b-inv    Design invariants (ordering, monotonicity)
 *
 * Test ID scheme:
 *   3b-const-N  : constant validation
 *   3b-level-N  : tier classification
 *   3b-opac-N   : opacity multiplier table
 *   3b-lerp-N   : smooth interpolation
 *   3b-label-N  : label visibility
 *   3b-bstyle-N : building label style
 *   3b-tier-N   : single-tier opacity
 *   3b-gate-N   : render gate
 *   3b-inv-N    : design invariants
 */

import { describe, it, expect } from "vitest";
import {
  // Constants
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_NEAR_THRESHOLD,
  ZOOM_MID_THRESHOLD,
  ZOOM_MID_POINT,
  ZOOM_LOD_THRESHOLDS,
  ZOOM_HIERARCHY_OPACITIES,
  ZOOM_LABEL_VISIBILITY,
  // Core functions
  computeZoomLODLevel,
  computeHierarchyZoomOpacities,
  computeZoomLabelVisibility,
  computeBuildingLabelStyle,
  computeTierZoomOpacity,
  shouldRenderZoomTier,
  // Types
  type ZoomLODLevel,
  type HierarchyZoomOpacities,
  type ZoomLabelVisibility,
  type ZoomBuildingLabelStyle,
} from "../zoom-lod-policy.js";

// ── 1. Constant validation (3b-const) ─────────────────────────────────────────

describe("Zoom range constants (3b-const)", () => {
  it("ZOOM_MIN is a positive finite number", () => {
    expect(Number.isFinite(ZOOM_MIN)).toBe(true);
    expect(ZOOM_MIN).toBeGreaterThan(0);
  });

  it("ZOOM_MAX is greater than ZOOM_MIN", () => {
    expect(ZOOM_MAX).toBeGreaterThan(ZOOM_MIN);
  });

  it("ZOOM_NEAR_THRESHOLD is between ZOOM_MIN and ZOOM_MID_THRESHOLD", () => {
    expect(ZOOM_NEAR_THRESHOLD).toBeGreaterThan(ZOOM_MIN);
    expect(ZOOM_NEAR_THRESHOLD).toBeLessThan(ZOOM_MID_THRESHOLD);
  });

  it("ZOOM_MID_THRESHOLD is between ZOOM_NEAR_THRESHOLD and ZOOM_MAX", () => {
    expect(ZOOM_MID_THRESHOLD).toBeGreaterThan(ZOOM_NEAR_THRESHOLD);
    expect(ZOOM_MID_THRESHOLD).toBeLessThan(ZOOM_MAX);
  });

  it("ZOOM_LOD_THRESHOLDS.near === ZOOM_NEAR_THRESHOLD", () => {
    expect(ZOOM_LOD_THRESHOLDS.near).toBe(ZOOM_NEAR_THRESHOLD);
  });

  it("ZOOM_LOD_THRESHOLDS.mid === ZOOM_MID_THRESHOLD", () => {
    expect(ZOOM_LOD_THRESHOLDS.mid).toBe(ZOOM_MID_THRESHOLD);
  });

  it("ZOOM_HIERARCHY_OPACITIES has entries for all three LOD tiers", () => {
    expect("far"  in ZOOM_HIERARCHY_OPACITIES).toBe(true);
    expect("mid"  in ZOOM_HIERARCHY_OPACITIES).toBe(true);
    expect("near" in ZOOM_HIERARCHY_OPACITIES).toBe(true);
  });

  it("ZOOM_LABEL_VISIBILITY has entries for all three LOD tiers", () => {
    expect("far"  in ZOOM_LABEL_VISIBILITY).toBe(true);
    expect("mid"  in ZOOM_LABEL_VISIBILITY).toBe(true);
    expect("near" in ZOOM_LABEL_VISIBILITY).toBe(true);
  });
});

// ── 2. computeZoomLODLevel (3b-level) ─────────────────────────────────────────

describe("computeZoomLODLevel (3b-level)", () => {
  it("returns 'near' at minimum zoom (ZOOM_MIN)", () => {
    expect(computeZoomLODLevel(ZOOM_MIN)).toBe("near");
  });

  it("returns 'near' when zoom <= ZOOM_NEAR_THRESHOLD", () => {
    expect(computeZoomLODLevel(ZOOM_NEAR_THRESHOLD)).toBe("near");
    expect(computeZoomLODLevel(ZOOM_NEAR_THRESHOLD - 1)).toBe("near");
    expect(computeZoomLODLevel(ZOOM_MIN + 0.01)).toBe("near");
  });

  it("returns 'mid' just above ZOOM_NEAR_THRESHOLD", () => {
    expect(computeZoomLODLevel(ZOOM_NEAR_THRESHOLD + 0.01)).toBe("mid");
  });

  it("returns 'mid' at ZOOM_MID_THRESHOLD", () => {
    expect(computeZoomLODLevel(ZOOM_MID_THRESHOLD)).toBe("mid");
  });

  it("returns 'mid' within the mid band", () => {
    const midPoint = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    expect(computeZoomLODLevel(midPoint)).toBe("mid");
  });

  it("returns 'far' just above ZOOM_MID_THRESHOLD", () => {
    expect(computeZoomLODLevel(ZOOM_MID_THRESHOLD + 0.01)).toBe("far");
  });

  it("returns 'far' at maximum zoom (ZOOM_MAX)", () => {
    expect(computeZoomLODLevel(ZOOM_MAX)).toBe("far");
  });

  it("returns 'far' for zoom values beyond ZOOM_MAX", () => {
    expect(computeZoomLODLevel(ZOOM_MAX + 10)).toBe("far");
  });

  it("returns 'near' for zoom values below ZOOM_MIN", () => {
    expect(computeZoomLODLevel(0)).toBe("near");
    expect(computeZoomLODLevel(-5)).toBe("near");
  });

  it("all return values are valid ZoomLODLevel strings", () => {
    const valid: ZoomLODLevel[] = ["near", "mid", "far"];
    for (const zoom of [ZOOM_MIN, 5, ZOOM_NEAR_THRESHOLD, 10, ZOOM_MID_THRESHOLD, 20, ZOOM_MAX]) {
      expect(valid).toContain(computeZoomLODLevel(zoom));
    }
  });
});

// ── 3. ZOOM_HIERARCHY_OPACITIES table (3b-opac) ───────────────────────────────

describe("ZOOM_HIERARCHY_OPACITIES table (3b-opac)", () => {
  const tiers = ["building", "floor", "room", "agent"] as const;

  it.each(["far", "mid", "near"] as ZoomLODLevel[])(
    "all opacity multipliers in '%s' tier are in [0, 1]",
    (level) => {
      const opacities = ZOOM_HIERARCHY_OPACITIES[level];
      for (const tier of tiers) {
        const val = opacities[tier];
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    },
  );

  it("FAR: building is the most prominent tier (highest opacity multiplier)", () => {
    const far = ZOOM_HIERARCHY_OPACITIES.far;
    expect(far.building).toBeGreaterThanOrEqual(far.floor);
    expect(far.building).toBeGreaterThanOrEqual(far.room);
    expect(far.building).toBeGreaterThan(far.agent);
  });

  it("FAR: agents are hidden (opacity = 0) — too small to be meaningful at far zoom", () => {
    expect(ZOOM_HIERARCHY_OPACITIES.far.agent).toBe(0);
  });

  it("MID: rooms are the most prominent tier at mid zoom", () => {
    const mid = ZOOM_HIERARCHY_OPACITIES.mid;
    expect(mid.room).toBeGreaterThanOrEqual(mid.building);
    expect(mid.room).toBeGreaterThanOrEqual(mid.floor);
    expect(mid.room).toBeGreaterThan(mid.agent);
  });

  it("MID: agents are visible but subdued (hint that agents exist)", () => {
    const mid = ZOOM_HIERARCHY_OPACITIES.mid;
    expect(mid.agent).toBeGreaterThan(0);
    expect(mid.agent).toBeLessThan(mid.room);
  });

  it("NEAR: agents are the most prominent tier at close zoom", () => {
    const near = ZOOM_HIERARCHY_OPACITIES.near;
    expect(near.agent).toBeGreaterThanOrEqual(near.room);
    expect(near.agent).toBeGreaterThan(near.floor);
    expect(near.agent).toBeGreaterThan(near.building);
  });

  it("NEAR: rooms are still visible for spatial orientation", () => {
    expect(ZOOM_HIERARCHY_OPACITIES.near.room).toBeGreaterThan(0);
  });

  it("NEAR: building recedes (lower than mid)", () => {
    expect(ZOOM_HIERARCHY_OPACITIES.near.building).toBeLessThanOrEqual(
      ZOOM_HIERARCHY_OPACITIES.mid.building,
    );
  });

  it("FAR: building is more prominent than at MID (recedes as you zoom in)", () => {
    expect(ZOOM_HIERARCHY_OPACITIES.far.building).toBeGreaterThanOrEqual(
      ZOOM_HIERARCHY_OPACITIES.mid.building,
    );
  });

  it("agents become more prominent as zoom decreases (far→near)", () => {
    expect(ZOOM_HIERARCHY_OPACITIES.near.agent).toBeGreaterThan(
      ZOOM_HIERARCHY_OPACITIES.mid.agent,
    );
    expect(ZOOM_HIERARCHY_OPACITIES.mid.agent).toBeGreaterThanOrEqual(
      ZOOM_HIERARCHY_OPACITIES.far.agent,
    );
  });
});

// ── 4. computeHierarchyZoomOpacities — smooth interpolation (3b-lerp) ─────────

describe("computeHierarchyZoomOpacities — smooth interpolation (3b-lerp)", () => {
  it("at ZOOM_MIN returns NEAR tier values", () => {
    const result = computeHierarchyZoomOpacities(ZOOM_MIN);
    const expected = ZOOM_HIERARCHY_OPACITIES.near;
    expect(result.building).toBeCloseTo(expected.building, 5);
    expect(result.agent).toBeCloseTo(expected.agent, 5);
  });

  it("at ZOOM_NEAR_THRESHOLD returns NEAR tier values (boundary is NEAR)", () => {
    const result = computeHierarchyZoomOpacities(ZOOM_NEAR_THRESHOLD);
    const expected = ZOOM_HIERARCHY_OPACITIES.near;
    expect(result.building).toBeCloseTo(expected.building, 5);
    expect(result.agent).toBeCloseTo(expected.agent, 5);
  });

  it("at ZOOM_MID_POINT returns exact MID tier values (peak of mid-zoom prominence)", () => {
    const result = computeHierarchyZoomOpacities(ZOOM_MID_POINT);
    const expected = ZOOM_HIERARCHY_OPACITIES.mid;
    expect(result.building).toBeCloseTo(expected.building, 5);
    expect(result.room).toBeCloseTo(expected.room, 5);
    expect(result.agent).toBeCloseTo(expected.agent, 5);
  });

  it("at ZOOM_MID_THRESHOLD returns FAR tier values (boundary is FAR)", () => {
    const result = computeHierarchyZoomOpacities(ZOOM_MID_THRESHOLD);
    const expected = ZOOM_HIERARCHY_OPACITIES.far;
    expect(result.building).toBeCloseTo(expected.building, 5);
    expect(result.agent).toBeCloseTo(expected.agent, 5);
  });

  it("at ZOOM_MAX returns FAR tier values", () => {
    const result = computeHierarchyZoomOpacities(ZOOM_MAX);
    const expected = ZOOM_HIERARCHY_OPACITIES.far;
    expect(result.building).toBeCloseTo(expected.building, 5);
    expect(result.agent).toBeCloseTo(expected.agent, 5);
  });

  it("at ZOOM_MID_POINT (midpoint of NEAR..MID_THRESHOLD range), values equal MID tier", () => {
    // ZOOM_MID_POINT is the peak of the MID tier: exactly at this value the
    // piecewise lerp produces the exact ZOOM_HIERARCHY_OPACITIES.mid values.
    const midZoom = ZOOM_MID_POINT; // = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2
    const result = computeHierarchyZoomOpacities(midZoom);
    const mid = ZOOM_HIERARCHY_OPACITIES.mid;

    expect(result.building).toBeCloseTo(mid.building, 3);
    expect(result.room).toBeCloseTo(mid.room, 3);
    expect(result.agent).toBeCloseTo(mid.agent, 3);
  });

  it("interpolated values are all in [0, 1]", () => {
    const testZooms = [3, 5, 7, 8, 10, 12, 14, 18, 25];
    for (const zoom of testZooms) {
      const opacities = computeHierarchyZoomOpacities(zoom);
      for (const key of ["building", "floor", "room", "agent"] as const) {
        expect(opacities[key]).toBeGreaterThanOrEqual(0);
        expect(opacities[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns all four tier keys in the result", () => {
    const result = computeHierarchyZoomOpacities(10);
    expect("building" in result).toBe(true);
    expect("floor"    in result).toBe(true);
    expect("room"     in result).toBe(true);
    expect("agent"    in result).toBe(true);
  });

  it("below ZOOM_MIN is clamped to NEAR values (no extrapolation)", () => {
    const atMin  = computeHierarchyZoomOpacities(ZOOM_MIN);
    const belowMin = computeHierarchyZoomOpacities(0);
    expect(belowMin.building).toBeCloseTo(atMin.building, 5);
    expect(belowMin.agent).toBeCloseTo(atMin.agent, 5);
  });

  it("above ZOOM_MAX is clamped to FAR values (no extrapolation)", () => {
    const atMax    = computeHierarchyZoomOpacities(ZOOM_MAX);
    const aboveMax = computeHierarchyZoomOpacities(ZOOM_MAX + 100);
    expect(aboveMax.building).toBeCloseTo(atMax.building, 5);
    expect(aboveMax.agent).toBeCloseTo(atMax.agent, 5);
  });
});

// ── 5. computeZoomLabelVisibility (3b-label) ──────────────────────────────────

describe("computeZoomLabelVisibility (3b-label)", () => {
  it("at FAR zoom: building label is shown", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MAX);
    expect(vis.showBuildingLabel).toBe(true);
  });

  it("at FAR zoom: room labels are hidden (too many to be useful at wide view)", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MAX);
    expect(vis.showRoomLabels).toBe(false);
  });

  it("at FAR zoom: agent labels are hidden", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MAX);
    expect(vis.showAgentLabels).toBe(false);
  });

  it("at MID zoom: room labels are shown", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    const vis = computeZoomLabelVisibility(midZoom);
    expect(vis.showRoomLabels).toBe(true);
  });

  it("at MID zoom: agent labels are hidden", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    const vis = computeZoomLabelVisibility(midZoom);
    expect(vis.showAgentLabels).toBe(false);
  });

  it("at MID zoom: building label is shown (context)", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    const vis = computeZoomLabelVisibility(midZoom);
    expect(vis.showBuildingLabel).toBe(true);
  });

  it("at NEAR zoom: agent labels are shown", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MIN);
    expect(vis.showAgentLabels).toBe(true);
  });

  it("at NEAR zoom: room labels are shown (spatial context for agents)", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MIN);
    expect(vis.showRoomLabels).toBe(true);
  });

  it("at NEAR zoom: building label is hidden", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MIN);
    expect(vis.showBuildingLabel).toBe(false);
  });

  it("returns all four label visibility keys", () => {
    const vis = computeZoomLabelVisibility(10);
    expect("showBuildingLabel" in vis).toBe(true);
    expect("showFloorLabels"   in vis).toBe(true);
    expect("showRoomLabels"    in vis).toBe(true);
    expect("showAgentLabels"   in vis).toBe(true);
  });

  it("FAR ZOOM_LABEL_VISIBILITY: building visible, rest hidden", () => {
    const far = ZOOM_LABEL_VISIBILITY.far;
    expect(far.showBuildingLabel).toBe(true);
    expect(far.showFloorLabels).toBe(false);
    expect(far.showRoomLabels).toBe(false);
    expect(far.showAgentLabels).toBe(false);
  });

  it("NEAR ZOOM_LABEL_VISIBILITY: agent + room labels shown, building hidden", () => {
    const near = ZOOM_LABEL_VISIBILITY.near;
    expect(near.showAgentLabels).toBe(true);
    expect(near.showRoomLabels).toBe(true);
    expect(near.showBuildingLabel).toBe(false);
  });
});

// ── 6. computeBuildingLabelStyle (3b-bstyle) ──────────────────────────────────

describe("computeBuildingLabelStyle (3b-bstyle)", () => {
  it("returns 'prominent' at FAR zoom (building overview is the primary focus)", () => {
    expect(computeBuildingLabelStyle(ZOOM_MAX)).toBe("prominent");
    expect(computeBuildingLabelStyle(ZOOM_MID_THRESHOLD + 1)).toBe("prominent");
  });

  it("returns 'subdued' at MID zoom (building is context while rooms are primary)", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    expect(computeBuildingLabelStyle(midZoom)).toBe("subdued");
    expect(computeBuildingLabelStyle(ZOOM_MID_THRESHOLD)).toBe("subdued");
  });

  it("returns 'hidden' at NEAR zoom (building not visible)", () => {
    expect(computeBuildingLabelStyle(ZOOM_MIN)).toBe("hidden");
    expect(computeBuildingLabelStyle(ZOOM_NEAR_THRESHOLD)).toBe("hidden");
  });

  it("all return values are valid ZoomBuildingLabelStyle strings", () => {
    const valid: ZoomBuildingLabelStyle[] = ["prominent", "subdued", "hidden"];
    for (const zoom of [ZOOM_MIN, 5, 10, 15, ZOOM_MAX]) {
      expect(valid).toContain(computeBuildingLabelStyle(zoom));
    }
  });
});

// ── 7. computeTierZoomOpacity (3b-tier) ───────────────────────────────────────

describe("computeTierZoomOpacity (3b-tier)", () => {
  it("returns 0 for agent tier at ZOOM_MAX (agents hidden at far)", () => {
    expect(computeTierZoomOpacity("agent", ZOOM_MAX)).toBe(0);
  });

  it("returns > 0 for agent tier at ZOOM_MIN (agents visible close-up)", () => {
    expect(computeTierZoomOpacity("agent", ZOOM_MIN)).toBeGreaterThan(0);
  });

  it("returns a value in [0, 1] for all tiers at all zoom levels", () => {
    const tiers = ["building", "floor", "room", "agent"] as const;
    const zooms = [ZOOM_MIN, 5, 10, 15, ZOOM_MAX];
    for (const tier of tiers) {
      for (const zoom of zooms) {
        const val = computeTierZoomOpacity(tier, zoom);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it("building tier is more prominent at far zoom than near zoom", () => {
    const farOpacity  = computeTierZoomOpacity("building", ZOOM_MAX);
    const nearOpacity = computeTierZoomOpacity("building", ZOOM_MIN);
    expect(farOpacity).toBeGreaterThan(nearOpacity);
  });

  it("agent tier is more prominent at near zoom than far zoom", () => {
    const farOpacity  = computeTierZoomOpacity("agent", ZOOM_MAX);
    const nearOpacity = computeTierZoomOpacity("agent", ZOOM_MIN);
    expect(nearOpacity).toBeGreaterThan(farOpacity);
  });
});

// ── 8. shouldRenderZoomTier (3b-gate) ─────────────────────────────────────────

describe("shouldRenderZoomTier (3b-gate)", () => {
  it("returns false for agent tier at ZOOM_MAX (agents hidden)", () => {
    expect(shouldRenderZoomTier("agent", ZOOM_MAX)).toBe(false);
  });

  it("returns true for agent tier at ZOOM_MIN (agents visible close-up)", () => {
    expect(shouldRenderZoomTier("agent", ZOOM_MIN)).toBe(true);
  });

  it("returns true for building tier at ZOOM_MAX (building always visible)", () => {
    expect(shouldRenderZoomTier("building", ZOOM_MAX)).toBe(true);
  });

  it("returns true for building tier at ZOOM_MIN", () => {
    expect(shouldRenderZoomTier("building", ZOOM_MIN)).toBe(true);
  });

  it("returns true for room tier at MID zoom", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    expect(shouldRenderZoomTier("room", midZoom)).toBe(true);
  });

  it("custom threshold: tier with opacity exactly at threshold is NOT rendered", () => {
    // ZOOM_MAX gives agent opacity = 0; with threshold = 0 it should return false
    expect(shouldRenderZoomTier("agent", ZOOM_MAX, 0)).toBe(false);
  });

  it("custom threshold = 0.5: building at near zoom (opacity < 0.5) is not rendered", () => {
    // NEAR building opacity = 0.20 < 0.5 threshold
    expect(shouldRenderZoomTier("building", ZOOM_MIN, 0.5)).toBe(false);
  });

  it("custom threshold = 0.5: rooms at ZOOM_MID_POINT (opacity = 1.0) are rendered", () => {
    // At ZOOM_MID_POINT the exact MID tier values are used: room opacity = 1.0 > 0.5 threshold.
    // (ZOOM_MID_THRESHOLD - 1 is in Zone 3 lerping toward FAR, so room opacity < 1.0 there.)
    expect(shouldRenderZoomTier("room", ZOOM_MID_POINT, 0.5)).toBe(true);
  });
});

// ── 9. Design invariants (3b-inv) ─────────────────────────────────────────────

describe("Design invariants (3b-inv)", () => {
  it("INV-1: agent opacity increases monotonically as zoom decreases (zooming in)", () => {
    // A sample of zoom values decreasing from far to near
    const zooms = [ZOOM_MAX, 20, ZOOM_MID_THRESHOLD, 10, ZOOM_NEAR_THRESHOLD, ZOOM_MIN];
    const opacities = zooms.map((z) => computeTierZoomOpacity("agent", z));

    // Each opacity should be >= the previous (non-decreasing)
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]!);
    }
  });

  it("INV-2: building opacity decreases monotonically as zoom decreases (zooming in)", () => {
    const zooms = [ZOOM_MIN, ZOOM_NEAR_THRESHOLD, 10, ZOOM_MID_THRESHOLD, 20, ZOOM_MAX];
    const opacities = zooms.map((z) => computeTierZoomOpacity("building", z));

    // Each opacity should be >= the previous (non-decreasing when listed far→near)
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]!);
    }
  });

  it("INV-3: room tier is prominent at mid-zoom (this is the primary room-detail level)", () => {
    const midZoom = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;
    const roomOp = computeTierZoomOpacity("room", midZoom);
    const buildingOp = computeTierZoomOpacity("building", midZoom);
    expect(roomOp).toBeGreaterThan(buildingOp);
  });

  it("INV-4: FAR zoom has at least building and floor as visible tiers", () => {
    expect(shouldRenderZoomTier("building", ZOOM_MAX)).toBe(true);
    expect(shouldRenderZoomTier("floor",    ZOOM_MAX)).toBe(true);
  });

  it("INV-5: NEAR zoom has at least agent and room as visible tiers", () => {
    expect(shouldRenderZoomTier("agent", ZOOM_MIN)).toBe(true);
    expect(shouldRenderZoomTier("room",  ZOOM_MIN)).toBe(true);
  });

  it("INV-6: label visibility at FAR satisfies building-level overview contract", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MAX);
    // FAR = building overview: building label must be shown
    expect(vis.showBuildingLabel).toBe(true);
  });

  it("INV-7: label visibility at MID satisfies room/office overview contract", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MID_THRESHOLD - 1);
    // MID = rooms primary: room labels must be shown
    expect(vis.showRoomLabels).toBe(true);
  });

  it("INV-8: label visibility at NEAR satisfies agent detail contract", () => {
    const vis = computeZoomLabelVisibility(ZOOM_MIN);
    // NEAR = agents primary: agent labels must be shown
    expect(vis.showAgentLabels).toBe(true);
  });

  it("INV-9: computeZoomLODLevel covers the full zoom range with no gaps", () => {
    // Test representative values across the full range
    const zooms = Array.from({ length: 23 }, (_, i) => i + 3); // 3..25
    for (const zoom of zooms) {
      const level = computeZoomLODLevel(zoom);
      expect(["near", "mid", "far"]).toContain(level);
    }
  });

  it("INV-10: zoom-based opacity multipliers form a valid color-mixing basis (values in [0,1])", () => {
    // All interpolated values at every integer zoom must be valid opacity multipliers
    const tiers = ["building", "floor", "room", "agent"] as const;
    for (let zoom = ZOOM_MIN; zoom <= ZOOM_MAX; zoom++) {
      const opacities = computeHierarchyZoomOpacities(zoom);
      for (const tier of tiers) {
        const val = opacities[tier];
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
        expect(Number.isFinite(val)).toBe(true);
        expect(Number.isNaN(val)).toBe(false);
      }
    }
  });
});
