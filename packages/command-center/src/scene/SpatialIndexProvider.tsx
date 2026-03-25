/**
 * SpatialIndexProvider — Thin Canvas-resident component that activates the
 * spatial index per-frame computation.
 *
 * Sub-AC 1 (AC 15): Mounts use-spatial-index inside the Three.js Canvas so
 * the hook has access to useFrame/useThree.  The hook writes computed
 * snapshots to the spatial-index-store; HUD components and stores outside
 * the Canvas read from there.
 *
 * ── Placement in CommandCenterScene.tsx ──────────────────────────────────────
 *   Must be placed INSIDE <ScenePerformanceMonitor><Suspense> so it participates
 *   in the adaptive FPS regulator.  It renders no geometry (returns null).
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *   windowSize    — Override max fully-rendered agents (default 12)
 *   cullingRadius — Override culling sphere radius (default 60 world units)
 *   enabled       — Pause computation during replay loading etc. (default true)
 */

import { useSpatialIndex } from "../hooks/use-spatial-index.js";
import type { UseSpatialIndexOptions } from "../hooks/use-spatial-index.js";

// Props mirror UseSpatialIndexOptions for transparency
export type SpatialIndexProviderProps = UseSpatialIndexOptions;

/**
 * SpatialIndexProvider — Canvas-resident component.
 *
 * Renders nothing; its only purpose is to run useSpatialIndex each frame
 * inside the Three.js render loop.  Place once in CommandCenterScene.tsx
 * inside <ScenePerformanceMonitor><Suspense>.
 *
 * @example
 *   // In CommandCenterScene.tsx, inside <Suspense>:
 *   <SpatialIndexProvider windowSize={12} />
 */
export function SpatialIndexProvider(props: SpatialIndexProviderProps): null {
  useSpatialIndex(props);
  return null;
}
