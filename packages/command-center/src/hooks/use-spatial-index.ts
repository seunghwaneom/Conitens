/**
 * use-spatial-index.ts — React hook connecting the spatial index to the
 * Three.js camera state.
 *
 * Sub-AC 1 (AC 15): Runs inside the Three.js render loop (useFrame) to
 * sample the camera position each frame, feed it into computeSpatialIndex,
 * and write the resulting snapshot to the spatial-index-store.  Only
 * triggers a React re-render when the full-render window membership changes.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   Three.js render loop
 *     └─ useFrame()          ← this hook
 *          ├─ read camera position
 *          ├─ read agent worldPositions from agent-store
 *          ├─ call computeSpatialIndex() (pure, O(n log n))
 *          └─ write to spatial-index-store (only on window change)
 *
 *   Outside Canvas (HUD, store consumers)
 *     └─ useSpatialIndexStore()   ← reads windowedSet, snapshot, telemetry
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   This hook MUST be mounted inside the R3F <Canvas> because it calls
 *   useFrame and useThree.  The canonical mount point is inside
 *   SpatialIndexProvider (a thin Canvas-only component), which is rendered
 *   inside <ScenePerformanceMonitor><Suspense> in CommandCenterScene.tsx.
 *
 *   The hook is intentionally NOT mounted directly in AgentAvatar or
 *   SceneHierarchy to avoid redundant computation across multiple components.
 *
 * ── Options ──────────────────────────────────────────────────────────────────
 *
 *   windowSize    — Max fully-rendered agents (default MAX_RENDER_WINDOW = 12)
 *   cullingRadius — Sphere cull radius in world units (default 60)
 *   enabled       — Skip computation when false (e.g., during replay loading)
 *
 * ── Return value ─────────────────────────────────────────────────────────────
 *
 *   snapshot     — Latest SpatialIndexSnapshot (may be null until first frame)
 *   windowedSet  — Compact ID sets + LOD map (null until first frame)
 *   isActive     — Whether the hook is currently computing (enabled && running)
 */

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialIndexStore } from "../store/spatial-index-store.js";
import {
  computeSpatialIndex,
  MAX_RENDER_WINDOW,
  DEFAULT_CULLING_RADIUS,
  type AgentSpatialEntry,
  type Vec3,
} from "../scene/spatial-index.js";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseSpatialIndexOptions {
  /** Max agents in the full-render window (default MAX_RENDER_WINDOW) */
  windowSize?:    number;
  /** Culling sphere radius in world units (default DEFAULT_CULLING_RADIUS) */
  cullingRadius?: number;
  /**
   * Enable/disable the hook.
   * When false the hook is a no-op — useful during replay loading or when
   * the building is not yet initialized.
   */
  enabled?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useSpatialIndex — Per-frame spatial index computation hook.
 *
 * Reads agent world positions + camera state each frame, calls
 * computeSpatialIndex (pure, O(n log n)), and writes the result to the
 * spatial-index-store ONLY when the window membership changes.
 *
 * This dedup step prevents unnecessary Zustand updates on frames where
 * the camera moves but no agents cross a window or cull boundary.
 *
 * @param options  useSpatialIndex configuration (all optional)
 */
export function useSpatialIndex(options: UseSpatialIndexOptions = {}): void {
  const {
    windowSize    = MAX_RENDER_WINDOW,
    cullingRadius = DEFAULT_CULLING_RADIUS,
    enabled       = true,
  } = options;

  // Three.js camera
  const camera = useThree((s) => s.camera);

  // Agent store — read once per frame (no selector subscription needed here;
  // we call getState() inside useFrame to avoid stale closures)
  const getAgents = useAgentStore.getState;

  // Spatial index store writer
  const setSnapshot = useSpatialIndexStore((s) => s.setSnapshot);

  // Dedup: previous window key to avoid writes on no-change frames
  const prevWindowKeyRef = useRef<string>("");

  useFrame(() => {
    if (!enabled) return;

    // Build AgentSpatialEntry[] from current agent store state.
    // getState() is safe inside useFrame (not a hook call; no closure staleness).
    const { agents } = getAgents();

    const entries: AgentSpatialEntry[] = Object.values(agents).map((agent) => {
      const wp = agent.worldPosition as { x: number; y: number; z: number };
      return {
        agentId:  agent.def.agentId,
        position: { x: wp.x, y: wp.y, z: wp.z } satisfies Vec3,
        roomId:   agent.roomId,
        status:   agent.status,
      };
    });

    // Read camera position
    const cameraPos: Vec3 = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };

    // Compute spatial index (pure, O(n log n), n ≤ 20)
    const snapshot = computeSpatialIndex(entries, cameraPos, windowSize, cullingRadius);

    // Dedup: only write to the store when the window membership changes.
    // This avoids a Zustand update + React re-render on every frame when the
    // camera pans without agents crossing window/cull boundaries.
    const windowKey = snapshot.windowAgents.map((r) => r.agentId).sort().join(",");
    if (windowKey !== prevWindowKeyRef.current) {
      prevWindowKeyRef.current = windowKey;
      setSnapshot(snapshot);
    }
  });
}
