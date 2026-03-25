/**
 * lod-connector-stability.test.ts — Tests for Sub-AC 5b.
 *
 * Sub-AC 5b: LOD-aware / screen-space-stable connector geometry that ensures
 * task-agent mapping connectors remain visible and correctly scaled at all
 * zoom levels.
 *
 * Coverage matrix
 * ───────────────
 * 5b-1   computeConnectorLOD: exports are importable (all constants + functions)
 * 5b-2   computeConnectorLOD: perspective CLOSE tier (dist < 10) returns full quality
 * 5b-3   computeConnectorLOD: perspective MID tier (10 ≤ dist < 22) returns medium quality
 * 5b-4   computeConnectorLOD: perspective FAR tier (dist ≥ 22) returns minimal quality
 * 5b-5   computeConnectorLOD: orbScale = 1.0 at close distance (no enlargement needed)
 * 5b-6   computeConnectorLOD: orbScale > 1.0 at far distance (enlarges for visibility)
 * 5b-7   computeConnectorLOD: birdsEye at default zoom → orbScale = 1.0
 * 5b-8   computeConnectorLOD: birdsEye at max zoom → orbScale > 1.0 (compensates zoom-out)
 * 5b-9   computeConnectorLOD: birdsEye at min zoom → orbScale clamped to ≥ ORB_MIN_SCALE
 * 5b-10  computeConnectorLOD: perspective FAR → curveSegments = CONNECTOR_LOD_SEGMENTS_FAR
 * 5b-11  computeConnectorLOD: perspective CLOSE → curveSegments = CONNECTOR_LOD_SEGMENTS_CLOSE
 * 5b-12  computeConnectorLOD: birdsEye → curveSegments = CONNECTOR_LOD_SEGMENTS_FAR
 * 5b-13  computeConnectorLOD: lineOpacityFloor increases with camera distance (perspective)
 * 5b-14  computeConnectorLOD: lineOpacityFloor increases with birdsEyeZoom (birdsEye)
 * 5b-15  computeConnectorLOD: arcLift unchanged in birdsEye (overhead projection)
 * 5b-16  computeConnectorLOD: arcLift increases with perspective distance (mid/far tiers)
 * 5b-17  getConnectorLODTier: correct tier classification at tier boundaries
 * 5b-18  getConnectorLODTier: tier 0 for dist < CLOSE_DIST
 * 5b-19  getConnectorLODTier: tier 1 for dist in [CLOSE_DIST, MID_DIST)
 * 5b-20  getConnectorLODTier: tier 2 for dist ≥ MID_DIST
 * 5b-21  Tier constants: SEGMENTS_CLOSE > SEGMENTS_MID > SEGMENTS_FAR (higher = more)
 * 5b-22  Tier constants: all segment counts are positive integers ≥ 3
 * 5b-23  OrbScale clamp: orbScale never below CONNECTOR_LOD_ORB_MIN_SCALE
 * 5b-24  OrbScale clamp: orbScale never above CONNECTOR_LOD_ORB_MAX_SCALE
 * 5b-25  computeBirdsEyeZoomScale: returns 1.0 at reference zoom
 * 5b-26  computeBirdsEyeZoomScale: scales proportionally with zoom
 * 5b-27  computeBirdsEyeZoomScale: clamped to [ORB_MIN, ORB_MAX]
 * 5b-28  computeConnectionAngle: correct angle for horizontal/vertical/diagonal vectors
 * 5b-29  computeConnectionLength: correct Euclidean XZ length
 * 5b-30  BatchedConnectorLines: DEFAULT_CURVE_SEGMENTS and DEFAULT_ARC_LIFT are exported
 * 5b-31  BatchedConnectorLines: DEFAULT_CURVE_SEGMENTS = 12 (matches CURVE_SEGMENTS constant)
 * 5b-32  BatchedConnectorLines: DEFAULT_LINE_OPACITY_FLOOR = 0.35
 * 5b-33  BirdsEyeConnectorLayer: component is importable and callable
 * 5b-34  BirdsEyeConnectorLayer: BIRDS_EYE_CONNECTOR_FLOOR_Y > 0 (above ground)
 * 5b-35  BirdsEyeConnectorLayer: BIRDS_EYE_CONNECTOR_SCALE_REF = BIRDS_EYE_DEFAULT_ZOOM
 *
 * NOTE: Components requiring a WebGL context (BirdsEyeConnectorLayer JSX, React hooks)
 * cannot run headlessly in Vitest.  These tests validate the pure data/constant/function
 * layer and the module exports — the same pattern as task-connector-scene-position.test.ts.
 *
 * Test ID scheme:
 *   5b-N : Sub-AC 5b (LOD-aware / screen-space-stable connector geometry)
 */

import { describe, it, expect } from "vitest";
import {
  // LOD params and config types (types only — runtime values tested below)
  // Constants
  CONNECTOR_LOD_CLOSE_DIST,
  CONNECTOR_LOD_MID_DIST,
  CONNECTOR_LOD_REFERENCE_DIST,
  CONNECTOR_LOD_REFERENCE_ZOOM,
  CONNECTOR_LOD_ORB_MIN_SCALE,
  CONNECTOR_LOD_ORB_MAX_SCALE,
  CONNECTOR_LOD_SEGMENTS_CLOSE,
  CONNECTOR_LOD_SEGMENTS_MID,
  CONNECTOR_LOD_SEGMENTS_FAR,
  // Pure functions
  computeConnectorLOD,
  getConnectorLODTier,
  type ConnectorLODParams,
  type ConnectorLODConfig,
} from "../TaskConnectors.js";
import {
  DEFAULT_CURVE_SEGMENTS,
  DEFAULT_ARC_LIFT,
  DEFAULT_LINE_OPACITY_FLOOR,
} from "../BatchedConnectorLines.js";
import {
  BIRDS_EYE_CONNECTOR_FLOOR_Y,
  BIRDS_EYE_CONNECTOR_SCALE_REF,
  BIRDS_EYE_CONNECTOR_LINE_WIDTH,
  BIRDS_EYE_AGENT_RING_INNER,
  BIRDS_EYE_AGENT_RING_OUTER,
  BIRDS_EYE_TASK_DISC_RADIUS,
  BIRDS_EYE_CONNECTOR_RENDER_ORDER,
  BirdsEyeConnectorLayer,
  computeBirdsEyeZoomScale,
  computeConnectionAngle,
  computeConnectionLength,
} from "../BirdsEyeConnectorLayer.js";
import { BIRDS_EYE_DEFAULT_ZOOM, BIRDS_EYE_MAX_ZOOM, BIRDS_EYE_MIN_ZOOM } from "../BirdsEyeCamera.js";

// ─────────────────────────────────────────────────────────────────────────────
// 5b-1 · Export surface
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-1: TaskConnectors LOD exports are importable", () => {
  it("all LOD constants are defined", () => {
    expect(CONNECTOR_LOD_CLOSE_DIST).toBeDefined();
    expect(CONNECTOR_LOD_MID_DIST).toBeDefined();
    expect(CONNECTOR_LOD_REFERENCE_DIST).toBeDefined();
    expect(CONNECTOR_LOD_REFERENCE_ZOOM).toBeDefined();
    expect(CONNECTOR_LOD_ORB_MIN_SCALE).toBeDefined();
    expect(CONNECTOR_LOD_ORB_MAX_SCALE).toBeDefined();
    expect(CONNECTOR_LOD_SEGMENTS_CLOSE).toBeDefined();
    expect(CONNECTOR_LOD_SEGMENTS_MID).toBeDefined();
    expect(CONNECTOR_LOD_SEGMENTS_FAR).toBeDefined();
  });

  it("pure functions are importable and callable", () => {
    expect(typeof computeConnectorLOD).toBe("function");
    expect(typeof getConnectorLODTier).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-2 · Perspective CLOSE tier
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-2: computeConnectorLOD — perspective CLOSE tier returns full quality", () => {
  const closeParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 5, // well below CLOSE_DIST (10)
    cameraMode: "perspective",
  };

  it("close tier uses CONNECTOR_LOD_SEGMENTS_CLOSE curve segments", () => {
    const cfg = computeConnectorLOD(closeParams);
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_CLOSE);
  });

  it("close tier uses DEFAULT_ARC_LIFT", () => {
    const cfg = computeConnectorLOD(closeParams);
    expect(cfg.arcLift).toBeCloseTo(DEFAULT_ARC_LIFT, 5);
  });

  it("close tier orbScale = 1.0 (no zoom compensation at close range)", () => {
    const cfg = computeConnectorLOD(closeParams);
    expect(cfg.orbScale).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-3 · Perspective MID tier
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-3: computeConnectorLOD — perspective MID tier returns medium quality", () => {
  // Mid-point of the mid tier
  const midParams: ConnectorLODParams = {
    cameraDistanceFromCenter: (CONNECTOR_LOD_CLOSE_DIST + CONNECTOR_LOD_MID_DIST) / 2,
    cameraMode: "perspective",
  };

  it("mid tier uses CONNECTOR_LOD_SEGMENTS_MID curve segments", () => {
    const cfg = computeConnectorLOD(midParams);
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_MID);
  });

  it("mid tier orbScale > 1.0 (camera is backing up, orbs start to shrink)", () => {
    const cfg = computeConnectorLOD(midParams);
    expect(cfg.orbScale).toBeGreaterThan(1.0);
  });

  it("mid tier arcLift > DEFAULT_ARC_LIFT (slightly taller arcs at distance)", () => {
    const cfg = computeConnectorLOD(midParams);
    expect(cfg.arcLift).toBeGreaterThan(DEFAULT_ARC_LIFT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-4 · Perspective FAR tier
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-4: computeConnectorLOD — perspective FAR tier returns minimal quality", () => {
  const farParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 35, // well above MID_DIST (22)
    cameraMode: "perspective",
  };

  it("far tier uses CONNECTOR_LOD_SEGMENTS_FAR curve segments", () => {
    const cfg = computeConnectorLOD(farParams);
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_FAR);
  });

  it("far tier orbScale > 1.0 (large distance requires scale compensation)", () => {
    const cfg = computeConnectorLOD(farParams);
    expect(cfg.orbScale).toBeGreaterThan(1.0);
  });

  it("far tier arcLift > mid tier arcLift (more pronounced at far range)", () => {
    const midCfg = computeConnectorLOD({ cameraDistanceFromCenter: 16, cameraMode: "perspective" });
    const farCfg = computeConnectorLOD(farParams);
    expect(farCfg.arcLift).toBeGreaterThanOrEqual(midCfg.arcLift);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-5 · orbScale = 1.0 at close distance
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-5: computeConnectorLOD — orbScale = 1.0 at close perspective", () => {
  it("orbScale is exactly 1.0 at the closest distance (0 units)", () => {
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: 0, cameraMode: "perspective" });
    expect(cfg.orbScale).toBeCloseTo(1.0, 5);
  });

  it("orbScale is exactly 1.0 just inside the close tier boundary", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: CONNECTOR_LOD_CLOSE_DIST - 0.1,
      cameraMode: "perspective",
    });
    expect(cfg.orbScale).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-6 · orbScale > 1.0 at far distance
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-6: computeConnectorLOD — orbScale > 1.0 at far perspective", () => {
  it("orbScale proportional to distance in far tier: dist/REFERENCE_DIST", () => {
    const dist = 30;
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: dist, cameraMode: "perspective" });
    const expected = Math.min(CONNECTOR_LOD_ORB_MAX_SCALE, dist / CONNECTOR_LOD_REFERENCE_DIST);
    expect(cfg.orbScale).toBeCloseTo(expected, 5);
  });

  it("orbScale is clamped to CONNECTOR_LOD_ORB_MAX_SCALE at extreme distance", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 1000,
      cameraMode: "perspective",
    });
    expect(cfg.orbScale).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-7 · Bird's-eye at default zoom → orbScale = 1.0
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-7: computeConnectorLOD — birdsEye at default zoom → orbScale = 1.0", () => {
  it("orbScale = 1.0 when birdsEyeZoom = BIRDS_EYE_DEFAULT_ZOOM", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM,
    });
    expect(cfg.orbScale).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-8 · Bird's-eye at max zoom → orbScale > 1.0
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-8: computeConnectorLOD — birdsEye at max zoom → orbScale > 1.0", () => {
  it("orbScale > 1.0 at max zoom-out (frustum is larger → objects appear smaller)", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_MAX_ZOOM,
    });
    expect(cfg.orbScale).toBeGreaterThan(1.0);
  });

  it("orbScale = birdsEyeZoom / referenceZoom at max zoom (within clamp range)", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_MAX_ZOOM,
    });
    const expected = Math.min(
      CONNECTOR_LOD_ORB_MAX_SCALE,
      BIRDS_EYE_MAX_ZOOM / CONNECTOR_LOD_REFERENCE_ZOOM,
    );
    expect(cfg.orbScale).toBeCloseTo(expected, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-9 · Bird's-eye at min zoom → orbScale clamped to ≥ ORB_MIN_SCALE
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-9: computeConnectorLOD — birdsEye at min zoom → orbScale ≥ ORB_MIN_SCALE", () => {
  it("orbScale is at least CONNECTOR_LOD_ORB_MIN_SCALE at minimum bird's-eye zoom", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_MIN_ZOOM, // 3 → raw scale = 0.3, clamped to 0.5
    });
    expect(cfg.orbScale).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-10 · Perspective FAR → CONNECTOR_LOD_SEGMENTS_FAR
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-10: computeConnectorLOD — perspective FAR uses FAR segment count", () => {
  it("curveSegments = CONNECTOR_LOD_SEGMENTS_FAR at far perspective", () => {
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: 50, cameraMode: "perspective" });
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_FAR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-11 · Perspective CLOSE → CONNECTOR_LOD_SEGMENTS_CLOSE
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-11: computeConnectorLOD — perspective CLOSE uses CLOSE segment count", () => {
  it("curveSegments = CONNECTOR_LOD_SEGMENTS_CLOSE at close perspective", () => {
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: 3, cameraMode: "perspective" });
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_CLOSE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-12 · Bird's-eye → CONNECTOR_LOD_SEGMENTS_FAR
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-12: computeConnectorLOD — birdsEye uses FAR segment count", () => {
  it("overhead view doesn't need smooth arcs — uses CONNECTOR_LOD_SEGMENTS_FAR", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM,
    });
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_FAR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-13 · lineOpacityFloor increases with camera distance (perspective)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-13: computeConnectorLOD — lineOpacityFloor increases with distance (perspective)", () => {
  it("far lineOpacityFloor > close lineOpacityFloor", () => {
    const close = computeConnectorLOD({ cameraDistanceFromCenter: 5,  cameraMode: "perspective" });
    const far   = computeConnectorLOD({ cameraDistanceFromCenter: 40, cameraMode: "perspective" });
    expect(far.lineOpacityFloor).toBeGreaterThan(close.lineOpacityFloor);
  });

  it("lineOpacityFloor is within [0.35, 1.0] for all perspective distances", () => {
    for (const dist of [0, 5, 10, 15, 22, 30, 50]) {
      const cfg = computeConnectorLOD({ cameraDistanceFromCenter: dist, cameraMode: "perspective" });
      expect(cfg.lineOpacityFloor).toBeGreaterThanOrEqual(0.35);
      expect(cfg.lineOpacityFloor).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-14 · lineOpacityFloor increases with birdsEyeZoom
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-14: computeConnectorLOD — lineOpacityFloor increases with birdsEyeZoom", () => {
  it("max-zoom-out lineOpacityFloor > default-zoom lineOpacityFloor", () => {
    const defaultZoom = computeConnectorLOD({
      cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM,
    });
    const maxZoom = computeConnectorLOD({
      cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_MAX_ZOOM,
    });
    expect(maxZoom.lineOpacityFloor).toBeGreaterThan(defaultZoom.lineOpacityFloor);
  });

  it("lineOpacityFloor is within [0.35, 1.0] for all birdsEyeZoom values", () => {
    for (const zoom of [BIRDS_EYE_MIN_ZOOM, BIRDS_EYE_DEFAULT_ZOOM, BIRDS_EYE_MAX_ZOOM]) {
      const cfg = computeConnectorLOD({
        cameraDistanceFromCenter: 0,
        cameraMode: "birdsEye",
        birdsEyeZoom: zoom,
      });
      expect(cfg.lineOpacityFloor).toBeGreaterThanOrEqual(0.35);
      expect(cfg.lineOpacityFloor).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-15 · arcLift unchanged in birdsEye (overhead projection)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-15: computeConnectorLOD — arcLift = DEFAULT_ARC_LIFT in birdsEye mode", () => {
  it("overhead projection: arc lift does not affect XZ appearance → keep default", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_MAX_ZOOM,
    });
    expect(cfg.arcLift).toBeCloseTo(DEFAULT_ARC_LIFT, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-16 · arcLift increases with perspective distance
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-16: computeConnectorLOD — arcLift increases from close to far (perspective)", () => {
  it("far arcLift > close arcLift (taller arcs are more visible from elevated angles)", () => {
    const close = computeConnectorLOD({ cameraDistanceFromCenter: 3, cameraMode: "perspective" });
    const far   = computeConnectorLOD({ cameraDistanceFromCenter: 40, cameraMode: "perspective" });
    expect(far.arcLift).toBeGreaterThan(close.arcLift);
  });

  it("arcLift is always positive", () => {
    for (const dist of [0, 5, 15, 30, 50]) {
      const cfg = computeConnectorLOD({ cameraDistanceFromCenter: dist, cameraMode: "perspective" });
      expect(cfg.arcLift).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-17 · getConnectorLODTier: boundary behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-17: getConnectorLODTier — correct tier at exact boundaries", () => {
  it("exactly at CLOSE_DIST boundary → tier 1 (not tier 0)", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_CLOSE_DIST)).toBe(1);
  });

  it("exactly at MID_DIST boundary → tier 2 (not tier 1)", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_MID_DIST)).toBe(2);
  });

  it("just below CLOSE_DIST → tier 0", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_CLOSE_DIST - 0.001)).toBe(0);
  });

  it("just below MID_DIST → tier 1", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_MID_DIST - 0.001)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-18/19/20 · getConnectorLODTier: tier classification
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-18: getConnectorLODTier — tier 0 for close distances", () => {
  it("returns 0 for dist = 0", () => {
    expect(getConnectorLODTier(0)).toBe(0);
  });
  it("returns 0 for dist = 5 (below close threshold)", () => {
    expect(getConnectorLODTier(5)).toBe(0);
  });
});

describe("Sub-AC 5b-19: getConnectorLODTier — tier 1 for mid distances", () => {
  it("returns 1 for dist = CLOSE_DIST", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_CLOSE_DIST)).toBe(1);
  });
  it("returns 1 for dist midway between CLOSE and MID thresholds", () => {
    const mid = (CONNECTOR_LOD_CLOSE_DIST + CONNECTOR_LOD_MID_DIST) / 2;
    expect(getConnectorLODTier(mid)).toBe(1);
  });
});

describe("Sub-AC 5b-20: getConnectorLODTier — tier 2 for far distances", () => {
  it("returns 2 for dist = MID_DIST", () => {
    expect(getConnectorLODTier(CONNECTOR_LOD_MID_DIST)).toBe(2);
  });
  it("returns 2 for dist = 100 (extreme far)", () => {
    expect(getConnectorLODTier(100)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-21 · Segment count ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-21: Tier constants — SEGMENTS_CLOSE > SEGMENTS_MID > SEGMENTS_FAR", () => {
  it("CONNECTOR_LOD_SEGMENTS_CLOSE > CONNECTOR_LOD_SEGMENTS_MID", () => {
    expect(CONNECTOR_LOD_SEGMENTS_CLOSE).toBeGreaterThan(CONNECTOR_LOD_SEGMENTS_MID);
  });
  it("CONNECTOR_LOD_SEGMENTS_MID > CONNECTOR_LOD_SEGMENTS_FAR", () => {
    expect(CONNECTOR_LOD_SEGMENTS_MID).toBeGreaterThan(CONNECTOR_LOD_SEGMENTS_FAR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-22 · All segment counts ≥ 3
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-22: All segment counts are positive integers ≥ 3", () => {
  it("CONNECTOR_LOD_SEGMENTS_CLOSE ≥ 3", () => {
    expect(CONNECTOR_LOD_SEGMENTS_CLOSE).toBeGreaterThanOrEqual(3);
    expect(Number.isInteger(CONNECTOR_LOD_SEGMENTS_CLOSE)).toBe(true);
  });
  it("CONNECTOR_LOD_SEGMENTS_MID ≥ 3", () => {
    expect(CONNECTOR_LOD_SEGMENTS_MID).toBeGreaterThanOrEqual(3);
    expect(Number.isInteger(CONNECTOR_LOD_SEGMENTS_MID)).toBe(true);
  });
  it("CONNECTOR_LOD_SEGMENTS_FAR ≥ 3", () => {
    expect(CONNECTOR_LOD_SEGMENTS_FAR).toBeGreaterThanOrEqual(3);
    expect(Number.isInteger(CONNECTOR_LOD_SEGMENTS_FAR)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-23/24 · OrbScale clamping
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-23: orbScale never below CONNECTOR_LOD_ORB_MIN_SCALE", () => {
  it("perspective close: orbScale ≥ ORB_MIN_SCALE", () => {
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: 0, cameraMode: "perspective" });
    expect(cfg.orbScale).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  });
  it("birdsEye min zoom: orbScale ≥ ORB_MIN_SCALE", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: 1,
    });
    expect(cfg.orbScale).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  });
});

describe("Sub-AC 5b-24: orbScale never above CONNECTOR_LOD_ORB_MAX_SCALE", () => {
  it("perspective extreme far: orbScale ≤ ORB_MAX_SCALE", () => {
    const cfg = computeConnectorLOD({ cameraDistanceFromCenter: 9999, cameraMode: "perspective" });
    expect(cfg.orbScale).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
  });
  it("birdsEye extreme zoom: orbScale ≤ ORB_MAX_SCALE", () => {
    const cfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: 9999,
    });
    expect(cfg.orbScale).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-25/26/27 · computeBirdsEyeZoomScale
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-25: computeBirdsEyeZoomScale — returns 1.0 at reference zoom", () => {
  it("zoomScale = 1.0 when birdsEyeZoom = BIRDS_EYE_CONNECTOR_SCALE_REF", () => {
    expect(computeBirdsEyeZoomScale(BIRDS_EYE_CONNECTOR_SCALE_REF)).toBeCloseTo(1.0, 5);
  });
});

describe("Sub-AC 5b-26: computeBirdsEyeZoomScale — scales proportionally with zoom", () => {
  it("double the reference zoom → zoomScale = 2.0 (within clamp)", () => {
    const zoom = BIRDS_EYE_CONNECTOR_SCALE_REF * 2;
    const expected = Math.min(CONNECTOR_LOD_ORB_MAX_SCALE, zoom / BIRDS_EYE_CONNECTOR_SCALE_REF);
    expect(computeBirdsEyeZoomScale(zoom)).toBeCloseTo(expected, 5);
  });
  it("zoomScale increases monotonically with birdsEyeZoom in unclamped range", () => {
    const s1 = computeBirdsEyeZoomScale(5);
    const s2 = computeBirdsEyeZoomScale(10);
    const s3 = computeBirdsEyeZoomScale(15);
    // s1 may be clamped to MIN, but s2 < s3 should hold in the normal range
    expect(s3).toBeGreaterThanOrEqual(s2);
    expect(s2).toBeGreaterThanOrEqual(s1);
  });
});

describe("Sub-AC 5b-27: computeBirdsEyeZoomScale — clamped to [ORB_MIN, ORB_MAX]", () => {
  it("extreme low zoom → clamped to CONNECTOR_LOD_ORB_MIN_SCALE", () => {
    expect(computeBirdsEyeZoomScale(0.1)).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  });
  it("extreme high zoom → clamped to CONNECTOR_LOD_ORB_MAX_SCALE", () => {
    expect(computeBirdsEyeZoomScale(9999)).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-28 · computeConnectionAngle
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-28: computeConnectionAngle — correct angle for basic directions", () => {
  it("positive X direction: (0,0) → (1,0) = angle 0", () => {
    expect(computeConnectionAngle(0, 0, 1, 0)).toBeCloseTo(0, 5);
  });
  it("positive Z direction: (0,0) → (0,1) = angle π/2", () => {
    expect(computeConnectionAngle(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 5);
  });
  it("negative X direction: (0,0) → (-1,0) = angle π", () => {
    expect(Math.abs(computeConnectionAngle(0, 0, -1, 0))).toBeCloseTo(Math.PI, 5);
  });
  it("diagonal (1,1): angle = π/4", () => {
    expect(computeConnectionAngle(0, 0, 1, 1)).toBeCloseTo(Math.PI / 4, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-29 · computeConnectionLength
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-29: computeConnectionLength — correct XZ Euclidean length", () => {
  it("horizontal unit: (0,0) → (1,0) = 1.0", () => {
    expect(computeConnectionLength(0, 0, 1, 0)).toBeCloseTo(1.0, 5);
  });
  it("vertical unit: (0,0) → (0,1) = 1.0", () => {
    expect(computeConnectionLength(0, 0, 0, 1)).toBeCloseTo(1.0, 5);
  });
  it("3-4-5 triangle: (0,0) → (3,4) = 5.0", () => {
    expect(computeConnectionLength(0, 0, 3, 4)).toBeCloseTo(5.0, 5);
  });
  it("same point → length 0", () => {
    expect(computeConnectionLength(3, 4, 3, 4)).toBeCloseTo(0.0, 5);
  });
  it("displaced start: (2,3) → (5,7) = 5.0", () => {
    expect(computeConnectionLength(2, 3, 5, 7)).toBeCloseTo(5.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-30/31/32 · BatchedConnectorLines default exports
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-30: BatchedConnectorLines — default LOD exports are present", () => {
  it("DEFAULT_CURVE_SEGMENTS is defined", () => {
    expect(DEFAULT_CURVE_SEGMENTS).toBeDefined();
  });
  it("DEFAULT_ARC_LIFT is defined", () => {
    expect(DEFAULT_ARC_LIFT).toBeDefined();
  });
  it("DEFAULT_LINE_OPACITY_FLOOR is defined", () => {
    expect(DEFAULT_LINE_OPACITY_FLOOR).toBeDefined();
  });
});

describe("Sub-AC 5b-31: BatchedConnectorLines — DEFAULT_CURVE_SEGMENTS = 12", () => {
  it("DEFAULT_CURVE_SEGMENTS is 12 (matching the CURVE_SEGMENTS constant)", () => {
    expect(DEFAULT_CURVE_SEGMENTS).toBe(12);
  });
});

describe("Sub-AC 5b-32: BatchedConnectorLines — DEFAULT_LINE_OPACITY_FLOOR = 0.35", () => {
  it("DEFAULT_LINE_OPACITY_FLOOR = 0.35", () => {
    expect(DEFAULT_LINE_OPACITY_FLOOR).toBeCloseTo(0.35, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b-33/34/35 · BirdsEyeConnectorLayer exports
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5b-33: BirdsEyeConnectorLayer — component is importable", () => {
  it("BirdsEyeConnectorLayer is a function (React component)", () => {
    expect(typeof BirdsEyeConnectorLayer).toBe("function");
  });
});

describe("Sub-AC 5b-34: BirdsEyeConnectorLayer — BIRDS_EYE_CONNECTOR_FLOOR_Y > 0", () => {
  it("floor Y is above ground level (> 0)", () => {
    expect(BIRDS_EYE_CONNECTOR_FLOOR_Y).toBeGreaterThan(0);
  });
  it("floor Y is below 1 (stays on ground floor)", () => {
    expect(BIRDS_EYE_CONNECTOR_FLOOR_Y).toBeLessThan(1.0);
  });
});

describe("Sub-AC 5b-35: BirdsEyeConnectorLayer — BIRDS_EYE_CONNECTOR_SCALE_REF = BIRDS_EYE_DEFAULT_ZOOM", () => {
  it("scale reference equals BIRDS_EYE_DEFAULT_ZOOM (10)", () => {
    expect(BIRDS_EYE_CONNECTOR_SCALE_REF).toBe(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("all BirdsEyeConnectorLayer constants are positive numbers", () => {
    for (const [name, val] of [
      ["FLOOR_Y", BIRDS_EYE_CONNECTOR_FLOOR_Y],
      ["SCALE_REF", BIRDS_EYE_CONNECTOR_SCALE_REF],
      ["LINE_WIDTH", BIRDS_EYE_CONNECTOR_LINE_WIDTH],
      ["AGENT_RING_INNER", BIRDS_EYE_AGENT_RING_INNER],
      ["AGENT_RING_OUTER", BIRDS_EYE_AGENT_RING_OUTER],
      ["TASK_DISC_RADIUS", BIRDS_EYE_TASK_DISC_RADIUS],
      ["RENDER_ORDER", BIRDS_EYE_CONNECTOR_RENDER_ORDER],
    ] as [string, number][]) {
      expect(val, `${name} should be > 0`).toBeGreaterThan(0);
    }
  });

  it("BIRDS_EYE_AGENT_RING_OUTER > BIRDS_EYE_AGENT_RING_INNER (ring is valid)", () => {
    expect(BIRDS_EYE_AGENT_RING_OUTER).toBeGreaterThan(BIRDS_EYE_AGENT_RING_INNER);
  });

  it("BirdsEyeConnectorLayer renderOrder > BirdsEyeLODLayer max renderOrder (4)", () => {
    expect(BIRDS_EYE_CONNECTOR_RENDER_ORDER).toBeGreaterThan(4);
  });
});
