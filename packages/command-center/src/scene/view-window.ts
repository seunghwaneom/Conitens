/**
 * view-window.ts — Camera-frustum-driven entity subset selection.
 *
 * Sub-AC 15b: Computes which scene entities fall within the camera's true
 * view frustum (and/or a proximity sphere), so the renderer only processes
 * entities that can appear on screen during each render pass.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   This is a PURE module — no React, no Three.js, no Zustand.
 *   All functions are deterministic and unit-testable in Node.js.
 *
 *   The hook (use-view-window.ts) runs inside the Three.js Canvas,
 *   extracts the camera PV matrix each frame, and calls computeViewWindow.
 *   Results flow out to the view-window-store for consumption by HUD
 *   components and scene layers outside the Canvas.
 *
 * ── Why true frustum culling? ─────────────────────────────────────────────────
 *
 *   spatial-index.ts uses a simplified sphere test centred on the camera.
 *   This is efficient but over-inclusive: it keeps entities that are behind
 *   the camera or far to the sides.  view-window.ts uses the camera's actual
 *   6-plane frustum, derived from the projection-view (PV) matrix, to test
 *   whether each entity's position falls within the visual pyramid.
 *
 *   The "proximity sphere" supplements the frustum: entities just outside the
 *   frustum but within proximityRadius of the camera remain classified as
 *   visible (at LOD "far"), preventing geometry pop-in when the camera turns.
 *
 * ── Entity classification ─────────────────────────────────────────────────────
 *
 *   Each entity receives one of three classifications per render pass:
 *
 *   "frustum"    — inside the camera's view frustum (or inside expanded
 *                  frustum with margin).  Receives distance-based LOD.
 *   "proximity"  — outside the frustum but within the proximity sphere.
 *                  Always rendered at LOD "far" (dot/silhouette only).
 *   "culled"     — outside both frustum and proximity sphere.  Skipped
 *                  entirely in this render pass.
 *
 * ── Frustum plane extraction — Gribb-Hartmann method ─────────────────────────
 *
 *   Given the combined projection-view matrix M (column-major, THREE.js
 *   convention), the 6 frustum planes are derived from matrix rows:
 *
 *     Left   = row3 + row0
 *     Right  = row3 - row0
 *     Bottom = row3 + row1
 *     Top    = row3 - row1
 *     Near   = row3 + row2
 *     Far    = row3 - row2
 *
 *   Each plane is stored as (a, b, c, d) with len = √(a²+b²+c²).
 *   A point (x,y,z) is inside the frustum when, for all 6 planes:
 *     a·x + b·y + c·z + d + margin·len ≥ 0
 *
 *   Using the plane's len for margin ensures the margin is a true world-space
 *   distance regardless of the plane's unnormalized coefficients.
 *
 * ── Column-major matrix element layout (THREE.js) ────────────────────────────
 *
 *   elements[i] for a Matrix4 (i = 0..15):
 *     col 0: [0,1,2,3]    col 1: [4,5,6,7]
 *     col 2: [8,9,10,11]  col 3: [12,13,14,15]
 *
 *   Row j = [e[j], e[j+4], e[j+8], e[j+12]]  (j = 0..3)
 *
 * ── Purity ────────────────────────────────────────────────────────────────────
 *   All exports are pure (no React, no Three.js, no store).
 *   Test-only helpers are clearly labelled at the bottom of this file.
 */

// ── Lightweight 3D vector ─────────────────────────────────────────────────────

/**
 * Vec3 — Lightweight 3D vector, decoupled from Three.js.
 *
 * Consumers using Three.js should destructure { x, y, z } from their
 * THREE.Vector3 / camera.position rather than casting.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ── Frustum plane representation ──────────────────────────────────────────────

/**
 * FrustumPlane — One plane of the camera view frustum.
 *
 * Equation: a·x + b·y + c·z + d ≥ 0 for points on the visible side.
 * `len` = √(a²+b²+c²), pre-computed to enable world-space margin tests.
 */
export interface FrustumPlane {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Pre-computed plane normal length √(a²+b²+c²). */
  len: number;
}

/**
 * SixFrustumPlanes — The 6 planes defining a camera view frustum.
 * Order: [left, right, bottom, top, near, far].
 */
export type SixFrustumPlanes = readonly [
  FrustumPlane,
  FrustumPlane,
  FrustumPlane,
  FrustumPlane,
  FrustumPlane,
  FrustumPlane,
];

// ── Entity input type ─────────────────────────────────────────────────────────

/**
 * ViewWindowEntity — One entity submitted to the view window computation.
 *
 * Generic enough to cover agents, rooms, fixtures, and tasks.  The `entityType`
 * field influences how the result is interpreted by scene components.
 */
export interface ViewWindowEntity {
  /** Unique entity identifier */
  id: string;
  /** Current world-space position */
  position: Vec3;
  /**
   * Entity category — used by consumers to apply type-specific culling budgets.
   * 'agent'   — dynamic; receives full frustum + proximity test
   * 'task'    — dynamic; inherits position from assigned agent; receives
   *             frustum + proximity test (same rules as 'agent')
   * 'room'    — static; receives frustum test only (proximity ignored)
   * 'fixture' — static; treated like room
   */
  entityType: "agent" | "task" | "room" | "fixture";
}

// ── Entity classification ─────────────────────────────────────────────────────

/**
 * ViewWindowClass — Entity classification for one render pass.
 *
 *   'frustum'    — inside the camera frustum (optionally expanded by margin)
 *   'proximity'  — outside frustum but within the proximity sphere
 *   'culled'     — outside both; skip all rendering
 */
export type ViewWindowClass = "frustum" | "proximity" | "culled";

/** Per-entity result from a single view window computation. */
export interface EntityViewResult {
  /** Entity identifier (from ViewWindowEntity.id) */
  id: string;
  /** World position at snapshot time */
  position: Vec3;
  /** Camera-to-entity Euclidean distance (world units) */
  distance: number;
  /** Classification for this render pass */
  class: ViewWindowClass;
  /** true when the entity should receive any rendering this pass */
  shouldRender: boolean;
}

// ── Snapshot and configuration ────────────────────────────────────────────────

/**
 * ViewWindowConfig — Parameters controlling view window computation.
 */
export interface ViewWindowConfig {
  /**
   * World-space margin applied to each frustum plane (units).
   * Expands the frustum outward so entities just beyond the visual edge
   * are still classified as "frustum" rather than culled.
   * Default: VIEW_WINDOW_DEFAULT_MARGIN
   */
  margin: number;
  /**
   * Radius of the proximity sphere in world units.
   * Entities within this radius of the camera but outside the frustum
   * are classified "proximity" rather than "culled".
   * Default: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS
   */
  proximityRadius: number;
  /**
   * Hard cull distance in world units.
   * Entities farther than this from the camera are always "culled",
   * regardless of frustum or proximity tests.
   * Default: VIEW_WINDOW_DEFAULT_MAX_DISTANCE
   */
  maxDistance: number;
}

/**
 * ViewWindowSnapshot — Complete output of one view window computation.
 *
 * Immutable value produced by computeViewWindow and stored in the
 * view-window-store.  Event-sourced: the store appends each snapshot
 * to an in-memory log for replay analysis.
 */
export interface ViewWindowSnapshot {
  /** All entity results, sorted by distance (nearest first) */
  entities: EntityViewResult[];
  /** IDs of entities inside the camera frustum (or expanded frustum) */
  frustumIds: readonly string[];
  /** IDs of entities in the proximity sphere but outside frustum */
  proximityIds: readonly string[];
  /** IDs of entities beyond frustum and proximity sphere */
  culledIds: readonly string[];
  /** frustumIds + proximityIds (all entities that should be rendered) */
  visibleIds: readonly string[];
  /** Camera world position at snapshot time */
  cameraPos: Vec3;
  /** Configuration used for this snapshot */
  config: ViewWindowConfig;
  /** Monotonic timestamp (Date.now()) */
  ts: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * World-space frustum expansion margin.
 * 1.5 units provides comfortable pop-in prevention at building scale
 * (building is ~12 wide × 8 deep; agents are ~0.5 units in radius).
 */
export const VIEW_WINDOW_DEFAULT_MARGIN = 1.5;

/**
 * Proximity sphere radius.
 * Agents within 8 world units of the camera are always shown even when
 * the camera is angled so they fall just outside the frustum.
 */
export const VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS = 8;

/**
 * Hard cull distance.
 * Beyond 80 world units the building is fully out of frame for any
 * reasonable camera configuration; skip all rendering past this point.
 */
export const VIEW_WINDOW_DEFAULT_MAX_DISTANCE = 80;

/** Default configuration object. */
export const VIEW_WINDOW_DEFAULT_CONFIG: ViewWindowConfig = Object.freeze({
  margin:          VIEW_WINDOW_DEFAULT_MARGIN,
  proximityRadius: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
  maxDistance:     VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
});

// ── Euclidean distance helper ─────────────────────────────────────────────────

function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Core pure functions ───────────────────────────────────────────────────────

/**
 * extractFrustumPlanes — Derive 6 view frustum planes from a combined
 * projection-view (PV) matrix.
 *
 * Uses the Gribb-Hartmann method.  The PV matrix must be in column-major
 * order (THREE.js Matrix4.elements convention).
 *
 * The 16 elements represent:
 *   col 0 → elements [0..3]
 *   col 1 → elements [4..7]
 *   col 2 → elements [8..11]
 *   col 3 → elements [12..15]
 *
 * Row j (0-indexed) = [ e[j], e[j+4], e[j+8], e[j+12] ]
 *
 * @param elements  16-element column-major matrix (from camera.projectionMatrix
 *                  × camera.matrixWorldInverse)
 * @returns         SixFrustumPlanes [left, right, bottom, top, near, far]
 */
export function extractFrustumPlanes(elements: readonly number[]): SixFrustumPlanes {
  // Row extraction: row j = [e[j], e[j+4], e[j+8], e[j+12]]
  const r0a = elements[0],  r0b = elements[4],  r0c = elements[8],  r0d = elements[12];
  const r1a = elements[1],  r1b = elements[5],  r1c = elements[9],  r1d = elements[13];
  const r2a = elements[2],  r2b = elements[6],  r2c = elements[10], r2d = elements[14];
  const r3a = elements[3],  r3b = elements[7],  r3c = elements[11], r3d = elements[15];

  function mkPlane(a: number, b: number, c: number, d: number): FrustumPlane {
    return { a, b, c, d, len: Math.sqrt(a * a + b * b + c * c) };
  }

  return [
    mkPlane(r3a + r0a, r3b + r0b, r3c + r0c, r3d + r0d), // left
    mkPlane(r3a - r0a, r3b - r0b, r3c - r0c, r3d - r0d), // right
    mkPlane(r3a + r1a, r3b + r1b, r3c + r1c, r3d + r1d), // bottom
    mkPlane(r3a - r1a, r3b - r1b, r3c - r1c, r3d - r1d), // top
    mkPlane(r3a + r2a, r3b + r2b, r3c + r2c, r3d + r2d), // near
    mkPlane(r3a - r2a, r3b - r2b, r3c - r2c, r3d - r2d), // far
  ];
}

/**
 * testPointInFrustum — Check whether a world-space point is inside the
 * view frustum (with optional expansion margin).
 *
 * A point is inside when, for all 6 planes:
 *   a·x + b·y + c·z + d + margin·len ≥ 0
 *
 * The `margin·len` term converts the unnormalized plane offset into
 * a true world-space expansion distance.
 *
 * @param x, y, z  World-space coordinates of the point to test
 * @param planes   Six frustum planes from extractFrustumPlanes
 * @param margin   World-space expansion (default 0)
 * @returns        true if inside the (optionally expanded) frustum
 */
export function testPointInFrustum(
  x: number,
  y: number,
  z: number,
  planes: SixFrustumPlanes,
  margin = 0,
): boolean {
  for (const p of planes) {
    if (p.a * x + p.b * y + p.c * z + p.d + margin * p.len < 0) {
      return false;
    }
  }
  return true;
}

/**
 * computeViewWindow — Main entry point for camera-frustum subset selection.
 *
 * For each entity:
 *   1. If distance > maxDistance → "culled"
 *   2. Else if inside frustum (± margin) → "frustum"
 *   3. Else if distance ≤ proximityRadius → "proximity"
 *   4. Else → "culled"
 *
 * Returns an immutable ViewWindowSnapshot.
 *
 * @param entities         Entity list to test (agents, rooms, fixtures)
 * @param pvMatrixElements 16-element column-major PV matrix from the camera
 * @param cameraPos        Camera world position (for distance tests)
 * @param partialConfig    Override defaults (margin, proximityRadius, maxDistance)
 */
export function computeViewWindow(
  entities: ViewWindowEntity[],
  pvMatrixElements: readonly number[],
  cameraPos: Vec3,
  partialConfig?: Partial<ViewWindowConfig>,
): ViewWindowSnapshot {
  const config: ViewWindowConfig = {
    ...VIEW_WINDOW_DEFAULT_CONFIG,
    ...partialConfig,
  };
  const ts = Date.now();

  const planes = extractFrustumPlanes(pvMatrixElements);

  const results: EntityViewResult[] = [];
  const frustumIds:   string[] = [];
  const proximityIds: string[] = [];
  const culledIds:    string[] = [];

  for (const entity of entities) {
    const { x, y, z } = entity.position;
    const distance = dist3(entity.position, cameraPos);

    let cls: ViewWindowClass;

    if (distance > config.maxDistance) {
      // Hard cull: beyond max visible distance
      cls = "culled";
    } else if (testPointInFrustum(x, y, z, planes, config.margin)) {
      // Inside the camera frustum (± margin)
      cls = "frustum";
    } else if (
      (entity.entityType === "agent" || entity.entityType === "task") &&
      distance <= config.proximityRadius
    ) {
      // Close enough to the camera to be a proximity candidate
      // (agents and co-located task orbs both qualify)
      cls = "proximity";
    } else {
      cls = "culled";
    }

    const result: EntityViewResult = {
      id:           entity.id,
      position:     entity.position,
      distance,
      class:        cls,
      shouldRender: cls !== "culled",
    };

    results.push(result);

    if (cls === "frustum")        frustumIds.push(entity.id);
    else if (cls === "proximity") proximityIds.push(entity.id);
    else                          culledIds.push(entity.id);
  }

  // Sort by distance (nearest first) for deterministic ordering
  results.sort((a, b) => a.distance - b.distance);

  const visibleIds = [...frustumIds, ...proximityIds];

  return Object.freeze({
    entities:     results,
    frustumIds:   Object.freeze(frustumIds),
    proximityIds: Object.freeze(proximityIds),
    culledIds:    Object.freeze(culledIds),
    visibleIds:   Object.freeze(visibleIds),
    cameraPos,
    config,
    ts,
  });
}

/**
 * makeEmptyViewWindowSnapshot — Return an empty snapshot with zero entities.
 *
 * Used as the initial value in the view-window-store and returned when
 * the building has not yet loaded.
 */
export function makeEmptyViewWindowSnapshot(
  cameraPos: Vec3 = { x: 0, y: 0, z: 0 },
): ViewWindowSnapshot {
  return Object.freeze({
    entities:     [],
    frustumIds:   Object.freeze([]),
    proximityIds: Object.freeze([]),
    culledIds:    Object.freeze([]),
    visibleIds:   Object.freeze([]),
    cameraPos,
    config:       VIEW_WINDOW_DEFAULT_CONFIG,
    ts:           Date.now(),
  });
}

// ── Test helpers (exported for unit tests — NOT for production use) ───────────

/**
 * makeOrthoPVMatrix — TEST HELPER
 *
 * Build a column-major projection-view matrix for a symmetric orthographic
 * camera at world position (camX, camY, camZ) looking straight down -Z.
 *
 * The resulting view frustum in world space covers:
 *   X: [camX − halfW,   camX + halfW]
 *   Y: [camY − halfH,   camY + halfH]
 *   Z: [camZ − far,     camZ − near]
 *
 * This matches the camera orientation used by THREE.js OrthographicCamera
 * when looking toward negative Z with no rotation applied.
 *
 * @param halfW   Half-width of the frustum in world units
 * @param halfH   Half-height of the frustum in world units
 * @param near    Near clip distance (positive, e.g. 0.1)
 * @param far     Far clip distance (positive, e.g. 100)
 * @param camX    Camera world X position (default 0)
 * @param camY    Camera world Y position (default 0)
 * @param camZ    Camera world Z position (default 0)
 * @returns       16-element column-major PV matrix
 */
export function makeOrthoPVMatrix(
  halfW: number,
  halfH: number,
  near: number,
  far: number,
  camX = 0,
  camY = 0,
  camZ = 0,
): readonly number[] {
  const rMl = 2 * halfW; // r − l = 2·halfW  (l = −halfW, r = halfW)
  const tMb = 2 * halfH; // t − b = 2·halfH
  const fMn = far - near;

  const sx = 2 / rMl;   // scale X
  const sy = 2 / tMb;   // scale Y
  const sz = -2 / fMn;  // scale Z (negated for OpenGL -Z forward convention)

  // Combined P×V translation components:
  //   tx = −(2·camX + r + l) / (r−l)  = −camX / halfW   (symmetric frustum)
  //   ty = −(2·camY + t + b) / (t−b)  = −camY / halfH
  //   tz = (2·camZ − far − near) / (far−near)
  const tx = -(2 * camX) / rMl;
  const ty = -(2 * camY) / tMb;
  const tz = (2 * camZ - far - near) / fMn;

  // Column-major layout: 4 columns of 4 rows each
  return [
    sx, 0,  0,  0,   // column 0: [row0, row1, row2, row3]
    0,  sy, 0,  0,   // column 1
    0,  0,  sz, 0,   // column 2
    tx, ty, tz, 1,   // column 3
  ];
}

/**
 * multiplyMat4 — TEST HELPER
 *
 * Multiply two 4×4 column-major matrices (A × B) and return the result.
 * Useful for composing separate projection and view matrices in tests.
 *
 * @param a  16-element column-major matrix
 * @param b  16-element column-major matrix
 * @returns  16-element column-major result of A × B
 */
export function multiplyMat4(
  a: readonly number[],
  b: readonly number[],
): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        // a[row + k*4] = element at (row, k) in a
        // b[k + col*4] = element at (k, col) in b
        sum += a[row + k * 4] * b[k + col * 4];
      }
      out[row + col * 4] = sum;
    }
  }
  return out;
}
