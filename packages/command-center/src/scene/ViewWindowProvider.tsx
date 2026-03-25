/**
 * ViewWindowProvider — Canvas-resident component for camera-frustum culling.
 *
 * Sub-AC 15b: Mounts use-view-window inside the Three.js Canvas so the hook
 * has access to useFrame/useThree.  The hook writes computed snapshots to the
 * view-window-store; HUD and scene-layer components outside the Canvas read
 * from there.
 *
 * ── Placement in CommandCenterScene.tsx ──────────────────────────────────────
 *   Must be placed INSIDE <ScenePerformanceMonitor><Suspense> so it
 *   participates in the adaptive FPS regulator.  Renders no geometry (null).
 *
 *   Recommended placement alongside SpatialIndexProvider:
 *
 *     <ScenePerformanceMonitor>
 *       <Suspense fallback={null}>
 *         <SpatialIndexProvider windowSize={12} />
 *         <ViewWindowProvider margin={1.5} />
 *         ...
 *       </Suspense>
 *     </ScenePerformanceMonitor>
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *   margin          — Frustum expansion margin (world units, default 1.5)
 *   proximityRadius — Proximity sphere radius (world units, default 8)
 *   maxDistance     — Hard cull distance (world units, default 80)
 *   enabled         — Pause computation (e.g., during replay loading)
 */

import { useViewWindow } from "../hooks/use-view-window.js";
import type { UseViewWindowOptions } from "../hooks/use-view-window.js";

/** Props mirror UseViewWindowOptions for transparent configurability. */
export type ViewWindowProviderProps = UseViewWindowOptions;

/**
 * ViewWindowProvider — Canvas-resident component.
 *
 * Renders nothing; its sole purpose is to run useViewWindow each frame
 * inside the Three.js render loop.  Place once in CommandCenterScene.tsx.
 *
 * @example
 *   // In CommandCenterScene.tsx, inside <ScenePerformanceMonitor><Suspense>:
 *   <ViewWindowProvider margin={1.5} proximityRadius={8} />
 */
export function ViewWindowProvider(props: ViewWindowProviderProps): null {
  useViewWindow(props);
  return null;
}
