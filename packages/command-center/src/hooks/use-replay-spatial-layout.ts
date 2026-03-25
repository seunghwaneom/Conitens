/**
 * use-replay-spatial-layout.ts — Sub-AC 9c
 *
 * Integrates the replay cursor with the 3D renderer by reading
 * spatial_layout from replay_state at each cursor position.
 *
 * Architecture
 * ─────────────
 *   useReplayStore (mode, playheadTs)
 *     │
 *     ▼
 *   reconstructSpatialLayoutAt(events, playheadTs)
 *     │
 *     ▼
 *   useReplaySpatialLayoutStore.spatialLayout  ← ReconstructedSpatialLayout
 *     │
 *     ▼
 *   3D renderer reads room/agent/fixture positions from layout
 *
 * The spatial layout reconstruction is separate from (and complementary to)
 * the full scene state reconstruction in use-replay-controller.ts:
 *
 *   - state-reconstruction-engine → agents (status, task, room membership)
 *   - spatial-layout-reconstruction → agents/rooms/fixtures (3D positions)
 *
 * Both run in parallel. The bridge layer (use-scene-graph-replay-bridge.ts)
 * can read from useReplaySpatialLayoutStore to obtain exact 3D positions
 * that override the static room-centre fallback used by roomCentreWorldPos().
 *
 * Design principles
 * ──────────────────
 *  - Record transparency: every position traces to a layout.* event in the log.
 *  - Determinism: same (events, playheadTs) always produces identical layout.
 *  - Zero contamination: reads events; never writes to the event log.
 *  - Live-mode guard: in live mode, spatialLayout is null and zero work is done.
 *  - Performance: layout reconstruction is O(n) from the nearest layout.init;
 *    checkpoints are not needed because layout events are infrequent compared
 *    to the full event volume.
 *
 * Usage (in App.tsx)
 * ──────────────────
 *   import { ReplaySpatialLayoutMount } from "./hooks/use-replay-spatial-layout.js";
 *   // alongside <ReplayControllerMount events={...} /> and <SceneGraphReplayBridge />
 *   <ReplaySpatialLayoutMount events={parsedEvents} />
 *
 * Reading spatial positions in renderer components (without prop-drilling):
 *   const layout = useReplaySpatialLayoutStore(s => s.spatialLayout);
 *   const roomPos = layout?.rooms["lobby"]?.position;
 */

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useReplayStore } from "../store/replay-store.js";
import { getCursorEvents } from "../store/replay-cursor-store.js";
import {
  reconstructSpatialLayoutAt,
  emptySpatialLayout,
  type ReconstructedSpatialLayout,
} from "../replay/spatial-layout-reconstruction.js";
import type { TypedReplayEvent } from "../replay/event-log-schema.js";

// ── Store schema version ─────────────────────────────────────────────────────

/**
 * Schema version for ReplaySpatialLayoutStoreState.
 * Increment when the store shape changes in a backward-incompatible way.
 */
export const REPLAY_SPATIAL_LAYOUT_STORE_VERSION = "spatial-layout@1.0.0" as const;

// ── Store state shape ────────────────────────────────────────────────────────

export interface ReplaySpatialLayoutStoreState {
  /**
   * The most recently reconstructed spatial layout.
   *
   * null  → not in replay mode, or no layout.init event found in the
   *          event window (hasAnchor === false on the empty layout).
   * value → ReconstructedSpatialLayout at the current playhead position.
   */
  spatialLayout: ReconstructedSpatialLayout | null;

  /**
   * Timestamp of the last reconstruction (Unix ms from replay playhead).
   * 0 before the first reconstruction.
   */
  lastLayoutTs: number;

  /**
   * Number of layout reconstructions performed since the last events load.
   * Useful for debugging and telemetry.
   */
  reconstructionCount: number;

  /**
   * Whether the hook is actively tracking a non-empty event set.
   * false → no events loaded, or mode is "live".
   */
  isActive: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Called by the hook after each reconstructSpatialLayoutAt() call.
   * Updates the spatial layout and metrics.
   */
  _setLayout: (layout: ReconstructedSpatialLayout, ts: number) => void;

  /**
   * Called when entering replay mode to mark the store as active.
   */
  _setActive: (active: boolean) => void;

  /**
   * Reset to initial state (called when exiting replay or on unmount).
   */
  _reset: () => void;
}

const INITIAL_STATE: Omit<
  ReplaySpatialLayoutStoreState,
  "_setLayout" | "_setActive" | "_reset"
> = {
  spatialLayout:       null,
  lastLayoutTs:        0,
  reconstructionCount: 0,
  isActive:            false,
};

export const useReplaySpatialLayoutStore = create<ReplaySpatialLayoutStoreState>(
  (set) => ({
    ...INITIAL_STATE,

    _setLayout: (layout, ts) =>
      set((prev) => ({
        spatialLayout:       layout,
        lastLayoutTs:        ts,
        reconstructionCount: prev.reconstructionCount + 1,
      })),

    _setActive: (active) =>
      set({ isActive: active }),

    _reset: () =>
      set({ ...INITIAL_STATE }),
  }),
);

// ── Options type ─────────────────────────────────────────────────────────────

export interface ReplaySpatialLayoutOptions {
  /**
   * TypedReplayEvent array to reconstruct spatial layout from.
   * Should be the same sorted events array passed to useReplayController.
   *
   * If omitted, the hook reads from getCursorEvents() (replay-cursor-store).
   * Provide this explicitly when the hook is mounted outside the cursor store
   * lifecycle (e.g., in standalone tests).
   */
  events?: readonly TypedReplayEvent[];
}

// ── Main hook ────────────────────────────────────────────────────────────────

/**
 * useReplaySpatialLayout — Reconstructs spatial_layout at each cursor position.
 *
 * Subscribes to the replay store for mode/playheadTs and calls
 * reconstructSpatialLayoutAt() on every playhead update while in replay mode.
 *
 * The result is written to useReplaySpatialLayoutStore for renderer access.
 *
 * @param options  Optional configuration; see ReplaySpatialLayoutOptions.
 * @returns        The current ReconstructedSpatialLayout, or null in live mode.
 */
export function useReplaySpatialLayout(
  options?: ReplaySpatialLayoutOptions,
): ReconstructedSpatialLayout | null {
  const mode       = useReplayStore((s) => s.mode);
  const playheadTs = useReplayStore((s) => s.playheadTs);

  // Track whether we've already activated the store for this session
  const activatedRef = useRef(false);

  // Resolve events: explicit prop > cursor store fallback
  const eventsRef = useRef<readonly TypedReplayEvent[]>(
    options?.events ?? getCursorEvents(),
  );

  // Keep eventsRef up to date when prop changes
  useEffect(() => {
    if (options?.events !== undefined) {
      eventsRef.current = options.events;
    }
  }, [options?.events]);

  // ── Enter / exit replay mode ─────────────────────────────────────────────
  useEffect(() => {
    if (mode === "replay") {
      if (!activatedRef.current) {
        useReplaySpatialLayoutStore.getState()._setActive(true);
        activatedRef.current = true;
      }
    } else {
      if (activatedRef.current) {
        useReplaySpatialLayoutStore.getState()._reset();
        activatedRef.current = false;
      }
    }
  }, [mode]);

  // ── Reconstruct at each playhead position ────────────────────────────────
  useEffect(() => {
    if (mode !== "replay") return;

    // Get the most current events (cursor store may have loaded them after prop)
    const events = options?.events ?? getCursorEvents();
    eventsRef.current = events;

    if (events.length === 0) {
      // No events: write empty layout with hasAnchor = false
      const empty = emptySpatialLayout(playheadTs);
      useReplaySpatialLayoutStore.getState()._setLayout(empty, playheadTs);
      return;
    }

    // Reconstruct spatial layout at the current playhead timestamp
    const layout = reconstructSpatialLayoutAt(events, playheadTs);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, playheadTs);
  }, [mode, playheadTs, options?.events]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (activatedRef.current) {
        useReplaySpatialLayoutStore.getState()._reset();
        activatedRef.current = false;
      }
    };
  }, []);

  return useReplaySpatialLayoutStore.getState().spatialLayout;
}

// ── Convenience headless component ───────────────────────────────────────────

interface ReplaySpatialLayoutMountProps {
  /**
   * Sorted TypedReplayEvent array to reconstruct spatial layout from.
   * Pass the same array used by ReplayControllerMount.
   */
  events?: readonly TypedReplayEvent[];
}

/**
 * ReplaySpatialLayoutMount — Headless component that activates the spatial
 * layout reconstruction at each replay cursor position.
 *
 * Renders null. Place alongside <ReplayControllerMount> and
 * <SceneGraphReplayBridge> in App.tsx.
 *
 * Example (App.tsx):
 *   import { ReplaySpatialLayoutMount } from "./hooks/use-replay-spatial-layout.js";
 *   <ReplayControllerMount events={parsedEvents} />
 *   <SceneGraphReplayBridge />
 *   <ReplaySpatialLayoutMount events={parsedEvents} />
 *
 * Deep scene components can read positions:
 *   const layout = useReplaySpatialLayoutStore(s => s.spatialLayout);
 *   const pos = layout?.rooms["lobby"]?.position ?? { x: 0, y: 0, z: 0 };
 */
export function ReplaySpatialLayoutMount(
  props: ReplaySpatialLayoutMountProps,
): null {
  useReplaySpatialLayout(props);
  return null;
}

// ── Convenience accessor for spatial positions ────────────────────────────────

/**
 * Get the world position of a room from the current spatial layout.
 *
 * Falls back to null when:
 *   - Not in replay mode (spatialLayout is null)
 *   - No layout.init event found (hasAnchor = false)
 *   - The room is not present in the spatial layout
 *
 * Renderers should use roomCentreWorldPos() as the fallback when this returns
 * null, preserving the static building-definition-based positions.
 *
 * @param roomId  Room identifier to look up.
 * @returns       Vec3 position or null if not available from spatial layout.
 */
export function getReplayRoomPosition(
  roomId: string,
): { x: number; y: number; z: number } | null {
  const store = useReplaySpatialLayoutStore.getState();
  if (!store.isActive || !store.spatialLayout) return null;
  const node = store.spatialLayout.rooms[roomId];
  if (!node) return null;
  return node.position;
}

/**
 * Get the world position of an agent from the current spatial layout.
 *
 * Falls back to null when:
 *   - Not in replay mode
 *   - No layout events have placed this agent explicitly
 *
 * Renderers should use room-centre-based positions as the fallback.
 *
 * @param agentId  Agent identifier to look up.
 * @returns        Vec3 position or null if not available from spatial layout.
 */
export function getReplayAgentPosition(
  agentId: string,
): { x: number; y: number; z: number } | null {
  const store = useReplaySpatialLayoutStore.getState();
  if (!store.isActive || !store.spatialLayout) return null;
  const node = store.spatialLayout.agents[agentId];
  if (!node) return null;
  return node.position;
}
