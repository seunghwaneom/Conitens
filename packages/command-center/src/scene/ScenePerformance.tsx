/**
 * ScenePerformance — adaptive rendering quality for the 3D command center.
 *
 * Sub-AC 15c: Optimises scene rendering performance at scale (3–20 agents,
 * 100+ tasks) using three complementary mechanisms:
 *
 *   1. FPS-aware quality context (high / medium / low)
 *      ─ ScenePerformanceMonitor measures frame-rate every second.
 *      ─ Quality degrades after 2 consecutive bad seconds; upgrades after 5 good.
 *      ─ Child components read the level via usePerformanceQuality().
 *
 *   2. Distance-based visibility culling
 *      ─ useDistanceCull(pos, maxDist) returns false when camera is beyond maxDist.
 *      ─ Only triggers a React re-render when the boundary is crossed.
 *      ─ Used to hide HTML badges, metrics billboards, and task orb labels.
 *
 *   3. Frame-skip throttle
 *      ─ useFrameThrottle(n) returns a fn that returns true only every n frames.
 *      ─ Used to reduce per-frame animation cost for distant / off-screen objects.
 *
 * Quality level effects (applied by individual scene components):
 *   'high'   (≥50 fps): full fidelity — TubeGeometry, HTML badges, all PointLights
 *   'medium' (28–49 fps): reduced — no tube geometry, badges within close range
 *   'low'    (<28 fps): minimal  — no HTML, no per-task PointLights, dots only
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── Quality level ──────────────────────────────────────────────────────────────

/**
 * Rendering quality tier.
 *   'high'   — full fidelity
 *   'medium' — reduced quality (tubes hidden, distant badges culled)
 *   'low'    — minimal quality (no HTML, no per-task lights)
 */
export type QualityLevel = "high" | "medium" | "low";

/** Context providing the current rendering quality tier to all scene children. */
export const PerformanceQualityContext = createContext<QualityLevel>("high");

/**
 * Read the current rendering quality tier from any component rendered inside
 * <ScenePerformanceMonitor>.  Defaults to 'high' when no monitor is present.
 */
export function usePerformanceQuality(): QualityLevel {
  return useContext(PerformanceQualityContext);
}

// ── FPS monitor ────────────────────────────────────────────────────────────────

/**
 * ScenePerformanceMonitor
 *
 * Must be rendered as a child of <Canvas> (requires useFrame).
 *
 * Measures FPS every second and adjusts the quality context with hysteresis:
 *   Downgrade: 2 consecutive samples below threshold → drop one quality tier
 *   Upgrade  : 5 consecutive samples above threshold → raise one quality tier
 *
 * Thresholds:
 *   ≥ 50 fps → 'high'
 *   28–49 fps → 'medium'
 *   < 28 fps → 'low'
 */
export function ScenePerformanceMonitor({ children }: { children: ReactNode }) {
  const frameCount = useRef(0);
  const lastSample = useRef(performance.now());
  const badCount   = useRef(0);
  const goodCount  = useRef(0);

  const qualityRef = useRef<QualityLevel>("high");
  const [quality, setQuality] = useState<QualityLevel>("high");

  useFrame(() => {
    frameCount.current++;
    const now     = performance.now();
    const elapsed = now - lastSample.current;

    if (elapsed < 1000) return; // sample once per second

    const fps = (frameCount.current * 1000) / elapsed;
    frameCount.current = 0;
    lastSample.current = now;

    const q = qualityRef.current;

    if (fps >= 50) {
      badCount.current = 0;
      goodCount.current++;

      // Upgrade after 5 consecutive good seconds
      if (q !== "high" && goodCount.current >= 5) {
        const next: QualityLevel = q === "low" ? "medium" : "high";
        qualityRef.current = next;
        goodCount.current  = 0;
        setQuality(next);
      }
    } else if (fps < 28) {
      goodCount.current = 0;
      badCount.current++;

      // Downgrade after 2 consecutive bad seconds
      if (q !== "low" && badCount.current >= 2) {
        const next: QualityLevel = q === "high" ? "medium" : "low";
        qualityRef.current = next;
        badCount.current   = 0;
        setQuality(next);
      }
    } else {
      // 28–49 fps: medium range
      goodCount.current = 0;
      badCount.current  = 0;
      if (q === "high") {
        qualityRef.current = "medium";
        setQuality("medium");
      }
    }
  });

  return (
    <PerformanceQualityContext.Provider value={quality}>
      {children}
    </PerformanceQualityContext.Provider>
  );
}

// ── Distance culling ───────────────────────────────────────────────────────────

/**
 * useDistanceCull — returns false when the camera is farther than maxDist.
 *
 * Only triggers a React re-render when the visible/invisible boundary is crossed,
 * keeping per-frame overhead to a single distance comparison.
 *
 * @param wx      World-space X of the object to cull
 * @param wy      World-space Y of the object to cull
 * @param wz      World-space Z of the object to cull
 * @param maxDist Maximum distance at which the object should be visible (world units)
 *
 * @returns true when the object is within range, false when beyond it
 */
export function useDistanceCull(
  wx: number,
  wy: number,
  wz: number,
  maxDist: number,
): boolean {
  const camera = useThree((s) => s.camera);

  // Stable Vector3 — recomputed only when world position changes
  const pos = useMemo(
    () => new THREE.Vector3(wx, wy, wz),
    [wx, wy, wz],
  );

  const visRef   = useRef(true);
  const [visible, setVisible] = useState(true);

  useFrame(() => {
    const next = camera.position.distanceTo(pos) <= maxDist;
    if (next !== visRef.current) {
      visRef.current = next;
      setVisible(next);
    }
  });

  return visible;
}

// ── Frame-skip throttle ────────────────────────────────────────────────────────

/**
 * useFrameThrottle — run per-frame logic only every N frames.
 *
 * Returns a stable function that returns `true` every `divisor` calls and
 * `false` in between.  Use it as a gate inside useFrame callbacks to
 * reduce the animation update frequency for distant or off-screen objects.
 *
 * @param divisor - Run every `divisor` frames (1 = every frame, 3 = every 3 frames)
 *
 * @example
 *   const tick = useFrameThrottle(3);
 *   useFrame(() => {
 *     if (!tick()) return;
 *     // expensive animation — only runs 20 fps at 60 fps display
 *   });
 */
export function useFrameThrottle(divisor: number): () => boolean {
  const counter = useRef(0);
  // Return a stable function (no deps, created once per mount)
  return useRef(() => {
    counter.current = (counter.current + 1) % divisor;
    return counter.current === 0;
  }).current;
}
