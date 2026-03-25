/**
 * BatchedConnectorLines — single-draw-call renderer for all task connector arcs.
 *
 * Sub-AC 15c: replaces N individual THREE.Line objects (one per task) with a
 * single THREE.LineSegments draw call, reducing connector-line draw calls from
 * O(tasks) to O(1).
 *
 * Architecture
 * ────────────
 * Each connector arc is a QuadraticBézier curve sampled at CURVE_SEGMENTS+1
 * points.  The curve is expanded into CURVE_SEGMENTS line-segment pairs:
 *
 *   points  [p0, p1, p2, …, p(n-1)]          n = CURVE_SEGMENTS+1
 *   pairs   [p0,p1], [p1,p2], …, [p(n-2),p(n-1)]  n-1 = CURVE_SEGMENTS pairs
 *
 * All curves are flattened into one BufferGeometry with:
 *   - position attribute (Float32Array)
 *   - color   attribute  (Float32Array, per-vertex color carries status color)
 *
 * One THREE.LineSegments with vertexColors renders every arc in the scene.
 *
 * Buffer re-use
 * ─────────────
 * On each connections-change, the geometry buffer is updated in-place when
 * the vertex count matches; otherwise it is reallocated.  This avoids GC
 * pressure during steady-state operation (connections rarely change count).
 *
 * Opacity animation
 * ─────────────────
 * A gentle global opacity pulse is applied in useFrame.  Per-arc animations
 * (active flicker, blocked flicker) are preserved on individual TaskConnectorBeam
 * components rendered for the closest / most active beams by TaskConnectorsLayer.
 *
 * Usage
 * ─────
 *   <BatchedConnectorLines connections={lineDescriptors} renderOrder={997} />
 */

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TaskStatus } from "../store/task-store.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Number of intervals to sample per Bézier arc.
 * 12 gives a smooth arc at normal zoom while keeping vertex count low.
 * (Compare to the original 24 used in individual TaskConnectorBeam —
 * half the samples at 1/N-th the draw calls = large net win.)
 */
const CURVE_SEGMENTS = 12;

/** Arc lift applied to the Bézier control point (must match ARC_LIFT in TaskConnectors.tsx). */
const ARC_LIFT = 0.38;

// ── Sub-AC 5b: Exported defaults (consumed by computeConnectorLOD in TaskConnectors) ──
/**
 * Default curve-segment count — exported so LOD code and tests can reference
 * this without re-declaring the value.
 */
export const DEFAULT_CURVE_SEGMENTS = CURVE_SEGMENTS;
/**
 * Default arc-lift value — exported so LOD code and tests can reference
 * this without re-declaring the value.
 */
export const DEFAULT_ARC_LIFT = ARC_LIFT;
/** Minimum connector-line opacity when no LOD boost is applied. */
export const DEFAULT_LINE_OPACITY_FLOOR = 0.35;

/** Status → beam colour (mirrors STATUS_BEAM_COLOR in TaskConnectors.tsx). */
const STATUS_BEAM_COLOR: Readonly<Record<TaskStatus, string>> = {
  draft:     "#444466",
  planned:   "#555588",
  assigned:  "#40C4FF",
  active:    "#00ff88",
  blocked:   "#FF9100",
  review:    "#aa88ff",
  done:      "#2a5a2a",
  failed:    "#ff4444",
  cancelled: "#333344",
};

// ── Types ─────────────────────────────────────────────────────────────────────

/** Descriptor for one connector arc to be included in the batch. */
export interface ConnectorLineDescriptor {
  /** Unique stable key (e.g. taskId). */
  key: string;
  fromX: number; fromY: number; fromZ: number;
  toX:   number; toY:   number; toZ:   number;
  /** Task status drives the per-arc vertex colour. */
  status: TaskStatus;
}

// ── BatchedConnectorLines ─────────────────────────────────────────────────────

/**
 * Renders all connector arcs as a single THREE.LineSegments draw call.
 *
 * Sub-AC 5b: LOD override props allow the caller to adapt geometry quality
 * to the current camera distance / zoom level without rebuilding the component.
 * When omitted the defaults (DEFAULT_CURVE_SEGMENTS, DEFAULT_ARC_LIFT,
 * DEFAULT_LINE_OPACITY_FLOOR) are used — identical to the pre-5b behaviour.
 *
 * @param connections      - Arc descriptors; update triggers buffer rebuild.
 * @param renderOrder      - Z-sort order for depth-test-disabled rendering (default 997).
 * @param lodCurveSegments - Override Bézier sample count (fewer = coarser but cheaper).
 * @param lodArcLift       - Override Y-lift of Bézier control point.
 * @param lodOpacityFloor  - Minimum opacity floor; higher values boost visibility at far zoom.
 */
export function BatchedConnectorLines({
  connections,
  renderOrder = 997,
  lodCurveSegments,
  lodArcLift,
  lodOpacityFloor,
}: {
  connections: ConnectorLineDescriptor[];
  renderOrder?: number;
  /** Sub-AC 5b: LOD Bézier sample-count override (default: DEFAULT_CURVE_SEGMENTS = 12). */
  lodCurveSegments?: number;
  /** Sub-AC 5b: LOD arc-lift override (default: DEFAULT_ARC_LIFT = 0.38). */
  lodArcLift?: number;
  /** Sub-AC 5b: Minimum line opacity — boosted at far zoom for visibility (default: 0.35). */
  lodOpacityFloor?: number;
}) {
  const geoRef  = useRef<THREE.BufferGeometry>(null);
  const lineRef = useRef<THREE.LineSegments>(null);

  // ── Buffer build / update ─────────────────────────────────────────────────
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;

    const n = connections.length;
    if (n === 0) {
      geo.setDrawRange(0, 0);
      return;
    }

    // Sub-AC 5b: Use LOD overrides when provided; fallback to defaults otherwise.
    const curveSegs  = lodCurveSegments ?? CURVE_SEGMENTS;
    const arcLiftVal = lodArcLift       ?? ARC_LIFT;

    // Each curve: curveSegs pairs × 2 vertices = 2*curveSegs verts
    const vertsPerCurve = 2 * curveSegs;
    const totalVerts    = n * vertsPerCurve;

    const positions = new Float32Array(totalVerts * 3);
    const colors    = new Float32Array(totalVerts * 3);

    const colorTmp = new THREE.Color();
    let vIdx = 0;

    for (const conn of connections) {
      const from = new THREE.Vector3(conn.fromX, conn.fromY, conn.fromZ);
      const to   = new THREE.Vector3(conn.toX,   conn.toY,   conn.toZ);
      const mid  = new THREE.Vector3(
        (conn.fromX + conn.toX) * 0.5,
        Math.max(conn.fromY, conn.toY) + arcLiftVal,
        (conn.fromZ + conn.toZ) * 0.5,
      );

      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      // Returns curveSegs+1 points
      const pts = curve.getPoints(curveSegs);

      colorTmp.setStyle(STATUS_BEAM_COLOR[conn.status] ?? "#444466");
      const { r, g, b } = colorTmp;

      for (let i = 0; i < curveSegs; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];

        // Segment start
        positions[vIdx * 3]     = p0.x;
        positions[vIdx * 3 + 1] = p0.y;
        positions[vIdx * 3 + 2] = p0.z;
        colors[vIdx * 3]     = r;
        colors[vIdx * 3 + 1] = g;
        colors[vIdx * 3 + 2] = b;
        vIdx++;

        // Segment end
        positions[vIdx * 3]     = p1.x;
        positions[vIdx * 3 + 1] = p1.y;
        positions[vIdx * 3 + 2] = p1.z;
        colors[vIdx * 3]     = r;
        colors[vIdx * 3 + 1] = g;
        colors[vIdx * 3 + 2] = b;
        vIdx++;
      }
    }

    // Reuse existing buffers if size matches — avoids GC in steady state
    const existingPos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (existingPos && existingPos.array.length === positions.length) {
      (existingPos.array as Float32Array).set(positions);
      existingPos.needsUpdate = true;
    } else {
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    }

    const existingCol = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (existingCol && existingCol.array.length === colors.length) {
      (existingCol.array as Float32Array).set(colors);
      existingCol.needsUpdate = true;
    } else {
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    geo.setDrawRange(0, vIdx);
    geo.computeBoundingSphere();
  // Sub-AC 5b: lodCurveSegments and lodArcLift changes require buffer rebuild
  // (vertex count may change when curveSegs changes → reallocation path fires automatically).
  }, [connections, lodCurveSegments, lodArcLift]);

  // ── Gentle global opacity pulse ───────────────────────────────────────────
  // Sub-AC 5b: lodOpacityFloor raises the minimum opacity at far/zoomed-out
  // distances, ensuring connectors remain visible when the camera is far back
  // (lines are still 1 px in WebGL but appear bolder at higher opacity).
  useFrame(({ clock }) => {
    const line = lineRef.current;
    if (!line) return;
    const mat = line.material as THREE.LineBasicMaterial;
    const opacityFloor     = lodOpacityFloor ?? DEFAULT_LINE_OPACITY_FLOOR;
    const opacityAmplitude = 0.12; // amplitude kept small so max stays ≤ floor + 0.12
    mat.opacity = opacityFloor + Math.sin(clock.getElapsedTime() * 1.8) * opacityAmplitude;
  });

  return (
    <lineSegments
      ref={lineRef}
      renderOrder={renderOrder}
    >
      <bufferGeometry ref={geoRef} />
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.45}
        depthTest={false}
        depthWrite={false}
      />
    </lineSegments>
  );
}
