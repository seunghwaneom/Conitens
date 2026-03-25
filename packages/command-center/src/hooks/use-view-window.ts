/**
 * use-view-window.ts — Canvas-resident hook for camera-frustum entity culling.
 *
 * Sub-AC 15b: Runs inside the Three.js render loop (useFrame) to extract the
 * camera's projection-view matrix each frame, call computeViewWindow (pure),
 * and write the resulting snapshot to view-window-store.
 *
 * Only triggers a React re-render (Zustand store update) when the visible
 * entity set changes — preventing unnecessary renders on frames where the
 * camera moves without any entity crossing a frustum or proximity boundary.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   Three.js render loop
 *     └─ useFrame()                   ← this hook
 *          ├─ read camera matrices (projectionMatrix × matrixWorldInverse)
 *          ├─ read agent worldPositions from agent-store
 *          ├─ read room positions from building data
 *          ├─ call computeViewWindow() (pure, O(n))
 *          └─ write to view-window-store (only on visible-set change)
 *
 *   Outside Canvas (HUD, store consumers)
 *     └─ useViewWindowStore() ← reads snapshot, visibleIds, telemetry
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   This hook MUST be mounted inside the R3F <Canvas>.  The canonical mount
 *   point is ViewWindowProvider, placed inside <ScenePerformanceMonitor>.
 *
 * ── Options ───────────────────────────────────────────────────────────────────
 *
 *   margin          — Frustum expansion margin (default VIEW_WINDOW_DEFAULT_MARGIN)
 *   proximityRadius — Proximity sphere radius (default VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS)
 *   maxDistance     — Hard cull distance (default VIEW_WINDOW_DEFAULT_MAX_DISTANCE)
 *   enabled         — Skip computation when false (default true)
 */

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useAgentStore }      from "../store/agent-store.js";
import { useTaskStore }       from "../store/task-store.js";
import { useViewWindowStore } from "../store/view-window-store.js";
import {
  computeViewWindow,
  VIEW_WINDOW_DEFAULT_MARGIN,
  VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
  VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
  type ViewWindowEntity,
  type Vec3,
} from "../scene/view-window.js";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseViewWindowOptions {
  /**
   * World-space margin applied to frustum planes.
   * Expands the frustum outward to prevent geometry pop-in.
   * Default: VIEW_WINDOW_DEFAULT_MARGIN
   */
  margin?: number;
  /**
   * Proximity sphere radius in world units.
   * Agents within this radius of the camera are classified "proximity"
   * even if outside the frustum.
   * Default: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS
   */
  proximityRadius?: number;
  /**
   * Hard cull distance in world units.
   * Entities beyond this are always culled.
   * Default: VIEW_WINDOW_DEFAULT_MAX_DISTANCE
   */
  maxDistance?: number;
  /**
   * Enable/disable the hook.
   * When false, the hook is a no-op — useful during replay loading or
   * when the building is not yet initialized.
   * Default: true
   */
  enabled?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useViewWindow — Per-frame camera-frustum entity culling hook.
 *
 * Reads the camera's combined projection-view matrix and agent positions
 * each frame, calls computeViewWindow (pure), and writes to the
 * view-window-store ONLY when the visible set changes.
 *
 * @param options  Hook configuration (all fields optional)
 */
export function useViewWindow(options: UseViewWindowOptions = {}): void {
  const {
    margin          = VIEW_WINDOW_DEFAULT_MARGIN,
    proximityRadius = VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
    maxDistance     = VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
    enabled         = true,
  } = options;

  // Three.js camera (stable ref from useThree)
  const camera = useThree((s) => s.camera);

  // Reusable Matrix4 for PV computation (avoids per-frame allocation)
  const pvMatrixRef = useRef<THREE.Matrix4>(new THREE.Matrix4());

  // Agent store reader — getState() inside useFrame to avoid stale closures
  const getAgents = useAgentStore.getState;

  // Task store reader — getState() inside useFrame to avoid stale closures
  const getTasks = useTaskStore.getState;

  // View window store writer
  const setSnapshot = useViewWindowStore((s) => s.setSnapshot);

  // Dedup: previous visible-set key to avoid writes on no-change frames
  const prevVisibleKeyRef = useRef<string>("");

  useFrame(() => {
    if (!enabled) return;

    // ── 1. Compute projection-view matrix ─────────────────────────────────
    // PV = projectionMatrix × matrixWorldInverse
    // camera.matrixWorldInverse is the view matrix (inverse of world transform)
    pvMatrixRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    const pvElements = pvMatrixRef.current.elements as unknown as readonly number[];

    // ── 2. Camera world position ──────────────────────────────────────────
    const cameraPos: Vec3 = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };

    // ── 3. Assemble entity list from agent store ───────────────────────────
    const { agents } = getAgents();
    const agentEntities: ViewWindowEntity[] = Object.values(agents).map(
      (agent) => {
        const wp = agent.worldPosition as { x: number; y: number; z: number };
        return {
          id:         agent.def.agentId,
          position:   { x: wp.x, y: wp.y, z: wp.z } satisfies Vec3,
          entityType: "agent" as const,
        };
      },
    );

    // ── 4. Assemble task entities (co-located with assigned agent) ─────────
    // Task orbs float above the assigned agent; they share the agent's XZ
    // position with a small Y offset.  We use the agent's worldPosition
    // rather than replicating a separate position store.
    const TASK_ORB_Y_OFFSET = 1.5; // world units above agent avatar
    const { tasks } = getTasks();
    const agentLookup = Object.fromEntries(
      Object.values(agents).map((a) => [
        a.def.agentId,
        a.worldPosition as { x: number; y: number; z: number },
      ]),
    );
    const taskEntities: ViewWindowEntity[] = Object.values(tasks)
      .filter((task) => task.assignedAgentId !== null)
      .map((task) => {
        const agentWp = agentLookup[task.assignedAgentId!];
        // Fall back to origin if agent position is not yet available
        const pos: Vec3 = agentWp
          ? { x: agentWp.x, y: agentWp.y + TASK_ORB_Y_OFFSET, z: agentWp.z }
          : { x: 0, y: TASK_ORB_Y_OFFSET, z: 0 };
        return {
          id:         task.taskId,
          position:   pos,
          entityType: "task" as const,
        };
      });

    // ── 5. Combine agent + task entities ──────────────────────────────────
    const entities: ViewWindowEntity[] = [...agentEntities, ...taskEntities];

    // ── 6. Compute view window (pure, O(n)) ───────────────────────────────
    const snapshot = computeViewWindow(entities, pvElements, cameraPos, {
      margin,
      proximityRadius,
      maxDistance,
    });

    // ── 7. Dedup: only write when visible set changes ─────────────────────
    const visibleKey = snapshot.visibleIds.slice().sort().join(",");
    if (visibleKey !== prevVisibleKeyRef.current) {
      prevVisibleKeyRef.current = visibleKey;
      setSnapshot(snapshot);
    }
  });
}
