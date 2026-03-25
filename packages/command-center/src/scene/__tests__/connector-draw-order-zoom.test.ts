/**
 * connector-draw-order-zoom.test.ts — Tests for Sub-AC 5c.
 *
 * Sub-AC 5c: Verify connector draw order (connectors appear after agents in
 * render/scene order) and connector presence at multiple zoom levels.
 *
 * ── What this verifies ────────────────────────────────────────────────────────
 *
 * Draw-order contract:
 *   Three.js renders objects in renderOrder-ascending sequence when
 *   depthTest is disabled (as all connector materials are).  A higher
 *   renderOrder value means the mesh is drawn LATER (on top of / after)
 *   previously-drawn geometry.
 *
 *   Agents use the default renderOrder (0).  BirdsEyeLODLayer's agent-marker
 *   level uses renderOrder 4.  All connector elements must use values strictly
 *   greater than both, ensuring connectors are composited on top of every agent
 *   mesh in the framebuffer.
 *
 *   The JSX ordering in CommandCenterScene.tsx further enforces the contract
 *   at the React scene-graph level: TaskConnectorsLayer is added to the scene
 *   after both HierarchySceneGraph and AgentAvatarsLayer; BirdsEyeConnectorLayer
 *   is added after BirdsEyeLODLayer.
 *
 * Zoom-level presence contract:
 *   Connectors must remain visible and provide non-zero geometry data across
 *   the full supported zoom/distance range:
 *     - Perspective CLOSE / MID / FAR tiers (0–∞ world-unit camera distances)
 *     - Bird's-eye MIN (3) / DEFAULT (10) / MAX (25) orthographic zoom levels
 *
 *   "Present" is defined as:
 *     - curveSegments ≥ 3          (arc has at least 3 line pairs — visible curvature)
 *     - lineOpacityFloor > 0       (not fully transparent — lines are visible)
 *     - lineOpacityFloor ≤ 0.70    (within design range — not overdriven)
 *     - orbScale ≥ ORB_MIN_SCALE   (orb not culled / degenerate)
 *     - orbScale ≤ ORB_MAX_SCALE   (orb not covering the entire screen)
 *
 * Coverage matrix
 * ───────────────
 * 5c-1   RENDER_ORDER_BEAM > 0 (drawn after default-renderOrder agents)
 * 5c-2   RENDER_ORDER_ORB  > 0 (drawn after default-renderOrder agents)
 * 5c-3   RENDER_ORDER_SCAN > 0 (drawn after default-renderOrder agents)
 * 5c-4   All connector renderOrder values > maximum room-volume renderOrder (0)
 * 5c-5   BIRDS_EYE_CONNECTOR_RENDER_ORDER > BirdsEyeLODLayer agent-marker order (4)
 * 5c-6   BIRDS_EYE_CONNECTOR_RENDER_ORDER > all BirdsEyeLODLayer levels (1–4)
 * 5c-7   Scene source: TaskConnectorsLayer JSX line > HierarchySceneGraph JSX line
 * 5c-8   Scene source: TaskConnectorsLayer JSX line > AgentAvatarsLayer JSX line
 * 5c-9   Scene source: BirdsEyeConnectorLayer JSX line > BirdsEyeLODLayer JSX line
 * 5c-10  BatchedConnectorLines default renderOrder prop = RENDER_ORDER_BEAM (997)
 * 5c-11  Perspective CLOSE: curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-12  Perspective MID:   curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-13  Perspective FAR:   curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-14  Bird's-eye MIN zoom: curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-15  Bird's-eye DEFAULT zoom: curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-16  Bird's-eye MAX zoom: curveSegments ≥ 3, lineOpacityFloor > 0, orbScale valid
 * 5c-17  lineOpacityFloor stays within design range [0.35, 0.70] at all zoom levels
 * 5c-18  lineOpacityFloor is monotonically non-decreasing as distance increases (perspective)
 * 5c-19  lineOpacityFloor is monotonically non-decreasing as birdsEyeZoom increases
 * 5c-20  computeBirdsEyeZoomScale always returns value in [ORB_MIN_SCALE, ORB_MAX_SCALE]
 * 5c-21  computeBirdsEyeZoomScale returns > 0 at extreme zoom values (no zero/negative)
 * 5c-22  Connector curveSegments monotonically non-increasing as perspective distance grows
 * 5c-23  Scene source: BirdsEyeConnectorLayer JSX line > TaskConnectorsLayer JSX line
 * 5c-24  No connector renderOrder value falls within agent-render range [0, 4]
 * 5c-25  orbScale is monotonically non-decreasing with birdsEyeZoom (compensates zoom-out)
 *
 * NOTE: Components requiring a WebGL context (rendered JSX, React hooks using
 *       useFrame/useThree) cannot run headlessly in Vitest.  These tests validate
 *       pure constants, pure functions, and raw source text — the same approach
 *       used in Sub-AC 5a and 5b tests.
 *
 * Test ID scheme:
 *   5c-N : Sub-AC 5c (draw order + zoom-level presence)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RENDER_ORDER_BEAM,
  RENDER_ORDER_ORB,
  RENDER_ORDER_SCAN,
  CONNECTOR_LOD_ORB_MIN_SCALE,
  CONNECTOR_LOD_ORB_MAX_SCALE,
  CONNECTOR_LOD_SEGMENTS_CLOSE,
  CONNECTOR_LOD_SEGMENTS_MID,
  CONNECTOR_LOD_SEGMENTS_FAR,
  CONNECTOR_LOD_CLOSE_DIST,
  CONNECTOR_LOD_MID_DIST,
  computeConnectorLOD,
  type ConnectorLODParams,
} from "../TaskConnectors.js";
import {
  BIRDS_EYE_CONNECTOR_RENDER_ORDER,
  computeBirdsEyeZoomScale,
} from "../BirdsEyeConnectorLayer.js";
import {
  DEFAULT_CURVE_SEGMENTS as BATCHED_DEFAULT_CURVE_SEGMENTS,
} from "../BatchedConnectorLines.js";
import {
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
} from "../BirdsEyeCamera.js";

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Maximum renderOrder used by BirdsEyeLODLayer for any layer.
 * Source: BirdsEyeLODLayer.tsx documents four levels (1–4).
 * Level 4 = Agent markers (the highest).
 */
const BIRDS_EYE_LOD_AGENT_MARKER_ORDER = 4;

/**
 * Default renderOrder for Three.js objects (used by all non-connector scene
 * geometry including AgentAvatar meshes that declare no explicit renderOrder).
 */
const DEFAULT_RENDER_ORDER = 0;

/**
 * Maximum renderOrder used by RoomVolume geometry.
 * Source: RoomVolume.tsx uses renderOrder -2, -1, and 0.
 */
const ROOM_VOLUME_MAX_RENDER_ORDER = 0;

/**
 * Presence check: asserts that a computeConnectorLOD result meets the
 * minimum requirements for connectors to be visible at a given zoom level.
 */
function assertConnectorPresence(
  cfg: { curveSegments: number; lineOpacityFloor: number; orbScale: number },
  label: string,
): void {
  expect(cfg.curveSegments, `${label}: curveSegments must be ≥ 3`).toBeGreaterThanOrEqual(3);
  expect(cfg.lineOpacityFloor, `${label}: lineOpacityFloor must be > 0`).toBeGreaterThan(0);
  expect(cfg.lineOpacityFloor, `${label}: lineOpacityFloor must be ≤ 0.70`).toBeLessThanOrEqual(0.70);
  expect(cfg.orbScale, `${label}: orbScale must be ≥ ORB_MIN_SCALE`).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  expect(cfg.orbScale, `${label}: orbScale must be ≤ ORB_MAX_SCALE`).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5c-1,2,3 · All connector renderOrder values > default agent renderOrder (0)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-1,2,3: Connector renderOrder values exceed default agent renderOrder", () => {
  it("5c-1: RENDER_ORDER_BEAM (997) > 0 — drawn after default-renderOrder agent meshes", () => {
    expect(RENDER_ORDER_BEAM).toBeGreaterThan(DEFAULT_RENDER_ORDER);
  });

  it("5c-2: RENDER_ORDER_ORB (998) > 0 — drawn after default-renderOrder agent meshes", () => {
    expect(RENDER_ORDER_ORB).toBeGreaterThan(DEFAULT_RENDER_ORDER);
  });

  it("5c-3: RENDER_ORDER_SCAN (999) > 0 — drawn after default-renderOrder agent meshes", () => {
    expect(RENDER_ORDER_SCAN).toBeGreaterThan(DEFAULT_RENDER_ORDER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-4 · Connector renderOrders > room-volume renderOrders
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-4: All connector renderOrder values exceed room-volume max (0)", () => {
  it("RENDER_ORDER_BEAM > ROOM_VOLUME_MAX_RENDER_ORDER", () => {
    expect(RENDER_ORDER_BEAM).toBeGreaterThan(ROOM_VOLUME_MAX_RENDER_ORDER);
  });

  it("RENDER_ORDER_ORB > ROOM_VOLUME_MAX_RENDER_ORDER", () => {
    expect(RENDER_ORDER_ORB).toBeGreaterThan(ROOM_VOLUME_MAX_RENDER_ORDER);
  });

  it("RENDER_ORDER_SCAN > ROOM_VOLUME_MAX_RENDER_ORDER", () => {
    expect(RENDER_ORDER_SCAN).toBeGreaterThan(ROOM_VOLUME_MAX_RENDER_ORDER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-5,6 · BIRDS_EYE_CONNECTOR_RENDER_ORDER > BirdsEyeLODLayer levels
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-5,6: BIRDS_EYE_CONNECTOR_RENDER_ORDER exceeds all BirdsEyeLODLayer levels", () => {
  it("5c-5: BIRDS_EYE_CONNECTOR_RENDER_ORDER > BirdsEyeLODLayer agent-marker level (4)", () => {
    expect(BIRDS_EYE_CONNECTOR_RENDER_ORDER).toBeGreaterThan(BIRDS_EYE_LOD_AGENT_MARKER_ORDER);
  });

  it("5c-6: BIRDS_EYE_CONNECTOR_RENDER_ORDER > all BirdsEyeLODLayer levels (1, 2, 3, 4)", () => {
    for (const lodLevel of [1, 2, 3, 4]) {
      expect(BIRDS_EYE_CONNECTOR_RENDER_ORDER).toBeGreaterThan(lodLevel);
    }
  });

  it("5c-6b: BIRDS_EYE_CONNECTOR_RENDER_ORDER is the expected value (5)", () => {
    expect(BIRDS_EYE_CONNECTOR_RENDER_ORDER).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-24 · No connector renderOrder falls in agent-render range [0, 4]
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-24: No connector renderOrder falls in the agent-render range [0, 4]", () => {
  const connectorRenderOrders = [
    { name: "RENDER_ORDER_BEAM", value: RENDER_ORDER_BEAM },
    { name: "RENDER_ORDER_ORB",  value: RENDER_ORDER_ORB },
    { name: "RENDER_ORDER_SCAN", value: RENDER_ORDER_SCAN },
    { name: "BIRDS_EYE_CONNECTOR_RENDER_ORDER", value: BIRDS_EYE_CONNECTOR_RENDER_ORDER },
  ];

  it("all connector renderOrder values are outside the [0, 4] agent range", () => {
    for (const { name, value } of connectorRenderOrders) {
      // Must be either < 0 (unlikely for connectors) or > 4 (after agents)
      const outsideAgentRange = value > BIRDS_EYE_LOD_AGENT_MARKER_ORDER || value < 0;
      expect(outsideAgentRange, `${name}=${value} should be outside [0, 4]`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-7,8,9,23 · Scene source ordering (JSX line position in CommandCenterScene.tsx)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-7,8,9,23: CommandCenterScene.tsx JSX ordering — connectors after agents", () => {
  // Read the scene source once for all ordering checks.
  // Using node: imports avoids a Three.js dependency in the test process.
  let source: string = "";
  let lines: string[] = [];

  const findFirstLine = (token: string): number =>
    lines.findIndex((l) => l.includes(token));

  // Async setup — run before each test in this block
  beforeEach(async () => {
    if (source) return; // already loaded
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const scenePath = join(thisDir, "..", "CommandCenterScene.tsx");
    source = readFileSync(scenePath, "utf8");
    lines = source.split("\n");
  });

  it("5c-7: TaskConnectorsLayer appears after HierarchySceneGraph in JSX", () => {
    const hierarchyLine  = findFirstLine("<HierarchySceneGraph");
    const connectorLine  = findFirstLine("<TaskConnectorsLayer");
    expect(hierarchyLine, "HierarchySceneGraph not found").toBeGreaterThan(-1);
    expect(connectorLine, "TaskConnectorsLayer not found").toBeGreaterThan(-1);
    expect(connectorLine, "TaskConnectorsLayer must come after HierarchySceneGraph")
      .toBeGreaterThan(hierarchyLine);
  });

  it("5c-8: TaskConnectorsLayer appears after AgentAvatarsLayer in JSX", () => {
    const agentLine     = findFirstLine("<AgentAvatarsLayer");
    const connectorLine = findFirstLine("<TaskConnectorsLayer");
    expect(agentLine,     "AgentAvatarsLayer not found").toBeGreaterThan(-1);
    expect(connectorLine, "TaskConnectorsLayer not found").toBeGreaterThan(-1);
    expect(connectorLine, "TaskConnectorsLayer must come after AgentAvatarsLayer")
      .toBeGreaterThan(agentLine);
  });

  it("5c-9: BirdsEyeConnectorLayer appears after BirdsEyeLODLayer in JSX", () => {
    const lodLine       = findFirstLine("<BirdsEyeLODLayer");
    const connectorLine = findFirstLine("<BirdsEyeConnectorLayer");
    expect(lodLine,       "BirdsEyeLODLayer not found").toBeGreaterThan(-1);
    expect(connectorLine, "BirdsEyeConnectorLayer not found").toBeGreaterThan(-1);
    expect(connectorLine, "BirdsEyeConnectorLayer must come after BirdsEyeLODLayer")
      .toBeGreaterThan(lodLine);
  });

  it("5c-23: BirdsEyeConnectorLayer appears after TaskConnectorsLayer in JSX", () => {
    const taskConnLine  = findFirstLine("<TaskConnectorsLayer");
    const beConnLine    = findFirstLine("<BirdsEyeConnectorLayer");
    expect(taskConnLine, "TaskConnectorsLayer not found").toBeGreaterThan(-1);
    expect(beConnLine,   "BirdsEyeConnectorLayer not found").toBeGreaterThan(-1);
    expect(beConnLine, "BirdsEyeConnectorLayer must come after TaskConnectorsLayer")
      .toBeGreaterThan(taskConnLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-10 · BatchedConnectorLines default renderOrder = RENDER_ORDER_BEAM
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-10: BatchedConnectorLines default renderOrder matches RENDER_ORDER_BEAM", () => {
  it("BatchedConnectorLines source documents default renderOrder as 997", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const batchedPath = join(thisDir, "..", "BatchedConnectorLines.tsx");
    const src = readFileSync(batchedPath, "utf8");

    // The function signature declares: renderOrder = 997
    // (or in JSDoc: "default 997")
    // This ensures the batch renderer's default is in sync with RENDER_ORDER_BEAM.
    expect(src).toMatch(/renderOrder\s*=\s*997/);
    expect(RENDER_ORDER_BEAM).toBe(997);
  });

  it("RENDER_ORDER_BEAM equals 997 (canonical connector-beam draw order)", () => {
    expect(RENDER_ORDER_BEAM).toBe(997);
  });

  it("DEFAULT_CURVE_SEGMENTS matches the expected default (12 segments)", () => {
    // This also validates the export surface without a WebGL context.
    expect(BATCHED_DEFAULT_CURVE_SEGMENTS).toBeGreaterThanOrEqual(3);
    expect(BATCHED_DEFAULT_CURVE_SEGMENTS).toBe(CONNECTOR_LOD_SEGMENTS_CLOSE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-11 · Perspective CLOSE tier presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-11: Connectors present at perspective CLOSE zoom level (dist < 10)", () => {
  const closeParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 5,
    cameraMode: "perspective",
  };

  it("curveSegments ≥ 3 at close range (arc has visible geometry)", () => {
    const cfg = computeConnectorLOD(closeParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at close range (connector lines are visible)", () => {
    const cfg = computeConnectorLOD(closeParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("full connector presence check at close range", () => {
    assertConnectorPresence(computeConnectorLOD(closeParams), "CLOSE(5)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-12 · Perspective MID tier presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-12: Connectors present at perspective MID zoom level (10 ≤ dist < 22)", () => {
  const midParams: ConnectorLODParams = {
    cameraDistanceFromCenter: (CONNECTOR_LOD_CLOSE_DIST + CONNECTOR_LOD_MID_DIST) / 2,
    cameraMode: "perspective",
  };

  it("curveSegments ≥ 3 at mid range", () => {
    const cfg = computeConnectorLOD(midParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at mid range (connector lines remain visible)", () => {
    const cfg = computeConnectorLOD(midParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("full connector presence check at mid range", () => {
    assertConnectorPresence(computeConnectorLOD(midParams), "MID(16)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-13 · Perspective FAR tier presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-13: Connectors present at perspective FAR zoom level (dist ≥ 22)", () => {
  const farParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 30,
    cameraMode: "perspective",
  };

  it("curveSegments ≥ 3 at far range (minimal but non-zero arc geometry)", () => {
    const cfg = computeConnectorLOD(farParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at far range (visibility boost ensures connectors visible)", () => {
    const cfg = computeConnectorLOD(farParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("full connector presence check at far range", () => {
    assertConnectorPresence(computeConnectorLOD(farParams), "FAR(30)");
  });

  it("FAR curveSegments = CONNECTOR_LOD_SEGMENTS_FAR (minimal geometry)", () => {
    const cfg = computeConnectorLOD(farParams);
    expect(cfg.curveSegments).toBe(CONNECTOR_LOD_SEGMENTS_FAR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-14 · Bird's-eye MIN zoom presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-14: Connectors present at bird's-eye MIN zoom (3)", () => {
  const minZoomParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 0, // ignored in birdsEye mode
    cameraMode: "birdsEye",
    birdsEyeZoom: BIRDS_EYE_MIN_ZOOM, // 3
  };

  it("curveSegments ≥ 3 at MIN zoom (overhead view still has arc geometry)", () => {
    const cfg = computeConnectorLOD(minZoomParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at MIN zoom (connectors visible when zoomed in)", () => {
    const cfg = computeConnectorLOD(minZoomParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("full connector presence check at MIN zoom", () => {
    assertConnectorPresence(computeConnectorLOD(minZoomParams), `birdsEye(MIN=${BIRDS_EYE_MIN_ZOOM})`);
  });

  it("computeBirdsEyeZoomScale at MIN zoom returns ≥ ORB_MIN_SCALE (orb not degenerate)", () => {
    const scale = computeBirdsEyeZoomScale(BIRDS_EYE_MIN_ZOOM);
    expect(scale).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-15 · Bird's-eye DEFAULT zoom presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-15: Connectors present at bird's-eye DEFAULT zoom (10)", () => {
  const defaultZoomParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 0,
    cameraMode: "birdsEye",
    birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM, // 10
  };

  it("curveSegments ≥ 3 at DEFAULT zoom", () => {
    const cfg = computeConnectorLOD(defaultZoomParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at DEFAULT zoom", () => {
    const cfg = computeConnectorLOD(defaultZoomParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("computeBirdsEyeZoomScale at DEFAULT zoom returns exactly 1.0", () => {
    // At reference zoom the scale should be exactly 1.0 (no compensation needed).
    const scale = computeBirdsEyeZoomScale(BIRDS_EYE_DEFAULT_ZOOM);
    expect(scale).toBeCloseTo(1.0, 5);
  });

  it("full connector presence check at DEFAULT zoom", () => {
    assertConnectorPresence(computeConnectorLOD(defaultZoomParams), `birdsEye(DEFAULT=${BIRDS_EYE_DEFAULT_ZOOM})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-16 · Bird's-eye MAX zoom presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-16: Connectors present at bird's-eye MAX zoom (25)", () => {
  const maxZoomParams: ConnectorLODParams = {
    cameraDistanceFromCenter: 0,
    cameraMode: "birdsEye",
    birdsEyeZoom: BIRDS_EYE_MAX_ZOOM, // 25
  };

  it("curveSegments ≥ 3 at MAX zoom", () => {
    const cfg = computeConnectorLOD(maxZoomParams);
    expect(cfg.curveSegments).toBeGreaterThanOrEqual(3);
  });

  it("lineOpacityFloor > 0 at MAX zoom (opacity boosted for far view)", () => {
    const cfg = computeConnectorLOD(maxZoomParams);
    expect(cfg.lineOpacityFloor).toBeGreaterThan(0);
  });

  it("computeBirdsEyeZoomScale at MAX zoom returns ≤ ORB_MAX_SCALE (orb not oversize)", () => {
    const scale = computeBirdsEyeZoomScale(BIRDS_EYE_MAX_ZOOM);
    expect(scale).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
  });

  it("full connector presence check at MAX zoom", () => {
    assertConnectorPresence(computeConnectorLOD(maxZoomParams), `birdsEye(MAX=${BIRDS_EYE_MAX_ZOOM})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-17 · lineOpacityFloor stays within [0.35, 0.70] at all zoom levels
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-17: lineOpacityFloor within design range [0.35, 0.70] at all zoom levels", () => {
  const allParams: Array<{ label: string; params: ConnectorLODParams }> = [
    { label: "perspective CLOSE (5)",     params: { cameraDistanceFromCenter: 5,  cameraMode: "perspective" } },
    { label: "perspective CLOSE boundary", params: { cameraDistanceFromCenter: CONNECTOR_LOD_CLOSE_DIST, cameraMode: "perspective" } },
    { label: "perspective MID (16)",      params: { cameraDistanceFromCenter: 16, cameraMode: "perspective" } },
    { label: "perspective FAR (30)",      params: { cameraDistanceFromCenter: 30, cameraMode: "perspective" } },
    { label: "perspective FAR (50)",      params: { cameraDistanceFromCenter: 50, cameraMode: "perspective" } },
    { label: `birdsEye MIN (${BIRDS_EYE_MIN_ZOOM})`,     params: { cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_MIN_ZOOM } },
    { label: `birdsEye DEFAULT (${BIRDS_EYE_DEFAULT_ZOOM})`, params: { cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM } },
    { label: `birdsEye MAX (${BIRDS_EYE_MAX_ZOOM})`,     params: { cameraDistanceFromCenter: 0, cameraMode: "birdsEye", birdsEyeZoom: BIRDS_EYE_MAX_ZOOM } },
  ];

  for (const { label, params } of allParams) {
    it(`lineOpacityFloor in [0.35, 0.70] at ${label}`, () => {
      const cfg = computeConnectorLOD(params);
      expect(cfg.lineOpacityFloor, `${label}: floor must be ≥ 0.35`).toBeGreaterThanOrEqual(0.35);
      expect(cfg.lineOpacityFloor, `${label}: floor must be ≤ 0.70`).toBeLessThanOrEqual(0.70);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-18 · lineOpacityFloor non-decreasing as perspective distance increases
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-18: lineOpacityFloor is non-decreasing as perspective distance grows", () => {
  const distances = [3, 7, 10, 14, 18, 22, 28, 35, 50];

  it("lineOpacityFloor at each sampled distance is ≥ the value at the previous distance", () => {
    let prev = -Infinity;
    for (const dist of distances) {
      const cfg = computeConnectorLOD({
        cameraDistanceFromCenter: dist,
        cameraMode: "perspective",
      });
      expect(
        cfg.lineOpacityFloor,
        `At dist=${dist}, lineOpacityFloor (${cfg.lineOpacityFloor.toFixed(3)}) must be ≥ prev (${prev.toFixed(3)})`,
      ).toBeGreaterThanOrEqual(prev - 1e-9); // small epsilon for floating-point rounding
      prev = cfg.lineOpacityFloor;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-19 · lineOpacityFloor non-decreasing as birdsEyeZoom increases
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-19: lineOpacityFloor is non-decreasing as birdsEyeZoom increases", () => {
  const zoomLevels = [BIRDS_EYE_MIN_ZOOM, 5, BIRDS_EYE_DEFAULT_ZOOM, 15, 20, BIRDS_EYE_MAX_ZOOM];

  it("lineOpacityFloor at each zoom level is ≥ the value at the previous level", () => {
    let prev = -Infinity;
    for (const zoom of zoomLevels) {
      const cfg = computeConnectorLOD({
        cameraDistanceFromCenter: 0,
        cameraMode: "birdsEye",
        birdsEyeZoom: zoom,
      });
      expect(
        cfg.lineOpacityFloor,
        `At zoom=${zoom}, lineOpacityFloor (${cfg.lineOpacityFloor.toFixed(3)}) must be ≥ prev (${prev.toFixed(3)})`,
      ).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cfg.lineOpacityFloor;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-20,21 · computeBirdsEyeZoomScale within bounds at all zoom values
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-20,21: computeBirdsEyeZoomScale always within [ORB_MIN, ORB_MAX] and > 0", () => {
  const zoomLevels = [
    BIRDS_EYE_MIN_ZOOM,
    BIRDS_EYE_DEFAULT_ZOOM,
    BIRDS_EYE_MAX_ZOOM,
    // Edge cases beyond the supported range
    0.1,  // extremely zoomed in
    100,  // extremely zoomed out
  ];

  for (const zoom of zoomLevels) {
    it(`5c-20: computeBirdsEyeZoomScale(${zoom}) ∈ [ORB_MIN_SCALE, ORB_MAX_SCALE]`, () => {
      const scale = computeBirdsEyeZoomScale(zoom);
      expect(scale).toBeGreaterThanOrEqual(CONNECTOR_LOD_ORB_MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(CONNECTOR_LOD_ORB_MAX_SCALE);
    });

    it(`5c-21: computeBirdsEyeZoomScale(${zoom}) > 0 (never zero or negative)`, () => {
      const scale = computeBirdsEyeZoomScale(zoom);
      expect(scale).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-22 · curveSegments non-increasing as perspective distance grows
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-22: curveSegments is non-increasing as perspective distance grows", () => {
  it("CLOSE distance uses more segments than FAR distance", () => {
    const closeCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 5,
      cameraMode: "perspective",
    });
    const farCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 30,
      cameraMode: "perspective",
    });
    expect(closeCfg.curveSegments).toBeGreaterThanOrEqual(farCfg.curveSegments);
  });

  it("MID distance uses ≤ segments than CLOSE distance", () => {
    const closeCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 5,
      cameraMode: "perspective",
    });
    const midCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 16,
      cameraMode: "perspective",
    });
    expect(closeCfg.curveSegments).toBeGreaterThanOrEqual(midCfg.curveSegments);
  });

  it("Tier constant ordering: SEGMENTS_CLOSE ≥ SEGMENTS_MID ≥ SEGMENTS_FAR", () => {
    expect(CONNECTOR_LOD_SEGMENTS_CLOSE).toBeGreaterThanOrEqual(CONNECTOR_LOD_SEGMENTS_MID);
    expect(CONNECTOR_LOD_SEGMENTS_MID).toBeGreaterThanOrEqual(CONNECTOR_LOD_SEGMENTS_FAR);
  });

  it("all tier segment counts are ≥ 3 (minimum arc visibility threshold)", () => {
    expect(CONNECTOR_LOD_SEGMENTS_CLOSE).toBeGreaterThanOrEqual(3);
    expect(CONNECTOR_LOD_SEGMENTS_MID).toBeGreaterThanOrEqual(3);
    expect(CONNECTOR_LOD_SEGMENTS_FAR).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5c-25 · orbScale non-decreasing as birdsEyeZoom increases
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5c-25: orbScale non-decreasing as birdsEyeZoom increases (compensates zoom-out)", () => {
  const zoomLevels = [BIRDS_EYE_MIN_ZOOM, 5, BIRDS_EYE_DEFAULT_ZOOM, 15, 20, BIRDS_EYE_MAX_ZOOM];

  it("orbScale at each zoom level is ≥ the value at the previous level", () => {
    let prev = -Infinity;
    for (const zoom of zoomLevels) {
      const cfg = computeConnectorLOD({
        cameraDistanceFromCenter: 0,
        cameraMode: "birdsEye",
        birdsEyeZoom: zoom,
      });
      expect(
        cfg.orbScale,
        `At zoom=${zoom}, orbScale (${cfg.orbScale.toFixed(3)}) must be ≥ prev (${prev.toFixed(3)})`,
      ).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cfg.orbScale;
    }
  });

  it("orbScale at MAX zoom > orbScale at DEFAULT zoom (zoom-out compensation active)", () => {
    const defaultCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM,
    });
    const maxCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_MAX_ZOOM,
    });
    expect(maxCfg.orbScale).toBeGreaterThan(defaultCfg.orbScale);
  });

  it("orbScale at MIN zoom ≤ orbScale at DEFAULT zoom (clamped at lower end)", () => {
    const minCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_MIN_ZOOM,
    });
    const defaultCfg = computeConnectorLOD({
      cameraDistanceFromCenter: 0,
      cameraMode: "birdsEye",
      birdsEyeZoom: BIRDS_EYE_DEFAULT_ZOOM,
    });
    expect(minCfg.orbScale).toBeLessThanOrEqual(defaultCfg.orbScale);
  });
});
