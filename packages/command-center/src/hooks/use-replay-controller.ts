/**
 * use-replay-controller.ts — Replay playback controller for 3D scene.
 *
 * Sub-AC 9c: Drives the pure state-reconstruction-engine with play/pause/seek/speed
 * controls from replay-store and exposes the current ReconstructedSceneState to the
 * React renderer.
 *
 * Architecture
 * ─────────────
 *   useReplayController(events, options?)
 *     1. Accepts TypedReplayEvent[] from the JSONL parser (see event-log-parser.ts)
 *     2. Pre-computes ReconstructionCheckpoints via buildCheckpoints() for O(N/interval) seek
 *     3. Subscribes to replay-store for playback commands (play/pause/seek/speed)
 *     4. Maintains a requestAnimationFrame loop that advances the playhead when playing
 *     5. On each tick (or user seek), calls reconstructStateAt() from the pure engine
 *     6. Writes the result to useReplayControllerStore for renderer access
 *     7. Returns the current ReconstructedSceneState to the calling component
 *
 * Renderer access
 * ───────────────
 *   Deep renderer components that need the current scene state without prop-drilling
 *   can subscribe to useReplayControllerStore:
 *
 *     const sceneState = useReplayControllerStore(s => s.sceneState);
 *     const agents     = sceneState?.agents ?? {};
 *
 * Design principles
 * ──────────────────
 *  - Record transparency: all reconstruction traces the event log deterministically
 *  - Determinism: same (events, targetTs) always produces identical scene state
 *  - Zero contamination: reconstruction never emits new events to the event log
 *  - Separation of concerns: pure engine (state-reconstruction-engine.ts) has no
 *    React/Zustand dependency; this hook is the only coupling point
 *  - Performance: checkpoints prevent O(n) full-replay on every seek
 *  - Live mode: the controller is idle and returns null sceneState; zero overhead
 *
 * Usage (in App.tsx or a parent component)
 * ─────────────────────────────────────────
 *   import { useReplayController, ReplayControllerMount } from "./hooks/use-replay-controller.js";
 *
 *   // Option A — Hook (when you also need the return value):
 *   const { sceneState, isReady } = useReplayController(parsedEvents);
 *
 *   // Option B — Headless mount component (just side-effects + store updates):
 *   <ReplayControllerMount events={parsedEvents} />
 *
 * Accessing scene state in deep renderer components:
 *   const sceneState = useReplayControllerStore(s => s.sceneState);
 */
import { useEffect, useRef, useCallback, useMemo } from "react";
import { create } from "zustand";
import { useReplayStore }          from "../store/replay-store.js";
import {
  reconstructStateAt,
  buildCheckpoints,
  emptySceneState,
  DEFAULT_CHECKPOINT_INTERVAL,
  type ReconstructedSceneState,
  type ReconstructionCheckpoint,
} from "../replay/state-reconstruction-engine.js";
import type { TypedReplayEvent } from "../replay/event-log-schema.js";

// ── Public re-exports for convenience ────────────────────────────────────────

export type { ReconstructedSceneState, ReconstructionCheckpoint };

// ── Controller store ─────────────────────────────────────────────────────────

/**
 * Version of the controller store schema.
 * Increment when the shape of ReplayControllerStoreState changes.
 */
export const REPLAY_CONTROLLER_VERSION = "controller@1.0.0" as const;

/**
 * Zustand store that holds the most recently reconstructed scene state.
 *
 * Updated on every playhead tick (RAF loop) and on every user seek while in
 * replay mode. In live mode the store retains its last value (or null if replay
 * was never entered).
 *
 * Renderer components subscribe here to avoid prop-drilling:
 *
 *   const sceneState = useReplayControllerStore(s => s.sceneState);
 */
export interface ReplayControllerStoreState {
  /**
   * The most recently reconstructed scene state.
   * null  → controller has not yet performed any reconstruction.
   * value → last output of reconstructStateAt() at the current playhead.
   */
  sceneState: ReconstructedSceneState | null;

  /**
   * Number of pre-computed checkpoints available for the current event set.
   * 0 → no checkpoints (either no events or engine not yet initialised).
   */
  checkpointCount: number;

  /**
   * Total TypedReplayEvents loaded into the controller.
   * 0 while no events have been provided.
   */
  eventsLoaded: number;

  /**
   * Whether the controller has finished building checkpoints and is ready
   * to service play/seek requests.
   *
   * true  → events loaded + checkpoints built + timeline range refreshed
   * false → initial state, or events prop changed but rebuild not yet complete
   */
  isReady: boolean;

  /**
   * Wall-clock timestamp of the last reconstruction (performance.now() ms).
   * Useful for debugging / telemetry; 0 before first reconstruction.
   */
  lastReconstructionWallTs: number;

  /**
   * Number of reconstructions performed since the controller was last initialised.
   * Resets to 0 when a new event set is loaded.
   */
  reconstructionCount: number;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Called by the hook after each reconstructStateAt() call.
   * Updates sceneState and metrics.
   */
  _setSceneState: (
    state: ReconstructedSceneState,
    wallTs: number,
  ) => void;

  /**
   * Called by the hook when events are loaded and checkpoints built.
   * Marks the controller as ready.
   */
  _setReady: (eventsLoaded: number, checkpointCount: number) => void;

  /**
   * Called by the hook when a new set of events is being loaded.
   * Marks the controller as not-ready and resets reconstruction count.
   */
  _setLoading: () => void;

  /**
   * Reset to initial state (called on unmount or explicit reset).
   */
  _reset: () => void;
}

const INITIAL_CONTROLLER_STATE: Omit<
  ReplayControllerStoreState,
  "_setSceneState" | "_setReady" | "_setLoading" | "_reset"
> = {
  sceneState:               null,
  checkpointCount:          0,
  eventsLoaded:             0,
  isReady:                  false,
  lastReconstructionWallTs: 0,
  reconstructionCount:      0,
};

export const useReplayControllerStore = create<ReplayControllerStoreState>(
  (set) => ({
    ...INITIAL_CONTROLLER_STATE,

    _setSceneState: (state, wallTs) =>
      set((prev) => ({
        sceneState:               state,
        lastReconstructionWallTs: wallTs,
        reconstructionCount:      prev.reconstructionCount + 1,
      })),

    _setReady: (eventsLoaded, checkpointCount) =>
      set({ eventsLoaded, checkpointCount, isReady: true }),

    _setLoading: () =>
      set({ isReady: false, reconstructionCount: 0 }),

    _reset: () =>
      set({ ...INITIAL_CONTROLLER_STATE }),
  }),
);

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the timeline range from a sorted TypedReplayEvent array.
 *
 * Returns `{ firstTs: 0, lastTs: 0 }` when the array is empty.
 * The input array must be sorted by tsMs (ascending); the function reads
 * only the first and last elements for O(1) performance.
 */
export function computeTimelineRange(events: TypedReplayEvent[]): {
  firstTs: number;
  lastTs:  number;
} {
  if (events.length === 0) return { firstTs: 0, lastTs: 0 };
  return {
    firstTs: events[0].tsMs,
    lastTs:  events[events.length - 1].tsMs,
  };
}

/**
 * Sort TypedReplayEvents into deterministic replay order.
 *
 * Primary:   tsMs  ascending
 * Secondary: seq   ascending (resolves same-millisecond ties)
 *
 * Returns a NEW array — the original is not mutated.
 */
export function sortEventsForReplay(
  events: TypedReplayEvent[],
): TypedReplayEvent[] {
  return [...events].sort((a, b) => {
    if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
    return a.seq - b.seq;
  });
}

/**
 * Clamp `ts` to [firstTs, lastTs].
 * If the range is zero-width (firstTs === lastTs), returns firstTs.
 */
export function clampToRange(ts: number, firstTs: number, lastTs: number): number {
  return Math.max(firstTs, Math.min(lastTs, ts));
}

/**
 * Compute normalised progress (0..1) from an absolute timestamp.
 * Returns 0 when duration is zero to avoid division by zero.
 */
export function computeProgress(ts: number, firstTs: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, (ts - firstTs) / duration));
}

// ── Options type ─────────────────────────────────────────────────────────────

/**
 * Configuration options for useReplayController.
 */
export interface ReplayControllerOptions {
  /**
   * Number of events between automatically generated checkpoints.
   *
   * Lower  → faster seek,  more memory usage.
   * Higher → slower seek, less memory usage.
   *
   * Default: DEFAULT_CHECKPOINT_INTERVAL (50)
   */
  checkpointInterval?: number;

  /**
   * Maximum RAF delta (ms) to apply in a single playback tick.
   * Prevents huge time jumps after browser tab switches.
   *
   * Default: 500 ms
   */
  maxDeltaMs?: number;
}

// ── Return type ───────────────────────────────────────────────────────────────

/**
 * Return value from useReplayController.
 *
 * All playback state mirrors what is in useReplayStore — the values are
 * read directly from that store so callers do not need to subscribe to
 * both hooks for the same data.
 */
export interface ReplayControllerResult {
  // ── Reconstruction output ────────────────────────────────────────────────
  /**
   * The most recently reconstructed scene state.
   * null in live mode or before the first reconstruction.
   */
  sceneState: ReconstructedSceneState | null;

  /**
   * Whether the controller has built checkpoints and is ready to play/seek.
   * false while building checkpoints on initial load or after events change.
   */
  isReady: boolean;

  /** Number of pre-computed checkpoints available. */
  checkpointCount: number;

  /** Total events loaded into the controller. */
  eventsLoaded: number;

  // ── Playback state (from replay-store) ───────────────────────────────────
  /** Current mode: "live" or "replay". */
  mode: "live" | "replay";
  /** Whether playback is actively advancing. */
  playing: boolean;
  /** Playback speed multiplier (e.g. 1, 2, 0.5). */
  speed: number;
  /** Normalised progress through the timeline (0..1). null in live mode. */
  progress: number | null;
  /** Elapsed ms from the first event to the current playhead. */
  elapsed: number;
  /** Total timeline duration (lastTs − firstTs) in ms. */
  duration: number;
  /** Current playhead Unix timestamp (ms). */
  playheadTs: number;
  /** First event timestamp in the loaded event set (ms). */
  firstEventTs: number;
  /** Last event timestamp in the loaded event set (ms). */
  lastEventTs: number;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useReplayController — Drives the state-reconstruction engine with playback controls.
 *
 * Mount this hook once near the top of the component tree (e.g. App.tsx).
 * The hook mounts headlessly — it manages side effects and writes to
 * useReplayControllerStore; renderer components subscribe to that store.
 *
 * @param events   Sorted TypedReplayEvent[] from the JSONL parser.
 *                 Passing an empty array puts the controller into an idle state
 *                 without error. The array is re-sorted internally on each change
 *                 so callers need not pre-sort.
 * @param options  Optional configuration overrides.
 * @returns        ReplayControllerResult exposing scene state and playback metadata.
 */
export function useReplayController(
  events: TypedReplayEvent[],
  options: ReplayControllerOptions = {},
): ReplayControllerResult {
  const {
    checkpointInterval = DEFAULT_CHECKPOINT_INTERVAL,
    maxDeltaMs         = 500,
  } = options;

  // ── Stable store accessors ───────────────────────────────────────────────
  const mode           = useReplayStore((s) => s.mode);
  const playing        = useReplayStore((s) => s.playing);
  const speed          = useReplayStore((s) => s.speed);
  const progress       = useReplayStore((s) => s.progress);
  const elapsed        = useReplayStore((s) => s.elapsed);
  const duration       = useReplayStore((s) => s.duration);
  const playheadTs     = useReplayStore((s) => s.playheadTs);
  const firstEventTs   = useReplayStore((s) => s.firstEventTs);
  const lastEventTs    = useReplayStore((s) => s.lastEventTs);

  const _updatePlayhead  = useReplayStore((s) => s._updatePlayhead);
  const _refreshRange    = useReplayStore((s) => s._refreshRange);

  // Controller store read (avoids causing re-renders on every reconstruction)
  const sceneState      = useReplayControllerStore((s) => s.sceneState);
  const isReady         = useReplayControllerStore((s) => s.isReady);
  const checkpointCount = useReplayControllerStore((s) => s.checkpointCount);
  const eventsLoaded    = useReplayControllerStore((s) => s.eventsLoaded);

  // Stable controller store actions (never change identity)
  const _setSceneState = useReplayControllerStore((s) => s._setSceneState);
  const _setReady      = useReplayControllerStore((s) => s._setReady);
  const _setLoading    = useReplayControllerStore((s) => s._setLoading);
  const _reset         = useReplayControllerStore((s) => s._reset);

  // ── Internal refs (survive re-renders, don't trigger them) ───────────────
  /** Sorted, deduplicated events (updated when events prop changes). */
  const sortedEventsRef   = useRef<TypedReplayEvent[]>([]);
  /** Pre-computed checkpoints for the current sorted events set. */
  const checkpointsRef    = useRef<ReconstructionCheckpoint[]>([]);
  /** RAF handle */
  const rafRef            = useRef<number>(0);
  /** Wall-clock time of the last RAF tick (for delta calculation). */
  const lastWallTimeRef   = useRef<number>(0);

  // ── Sorted events (recomputed when events array reference changes) ────────
  const sortedEvents = useMemo(
    () => sortEventsForReplay(events),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
  );

  // ── Rebuild checkpoints when events change ────────────────────────────────
  useEffect(() => {
    sortedEventsRef.current = sortedEvents;

    if (sortedEvents.length === 0) {
      checkpointsRef.current = [];
      _reset();
      return;
    }

    _setLoading();

    // Build checkpoints synchronously.
    // For very large event sets (>50k) this could take ~10-50ms.
    // A future enhancement could offload to a Web Worker but is not
    // required by AC 9c.
    const checkpoints = buildCheckpoints(sortedEvents, checkpointInterval);
    checkpointsRef.current = checkpoints;

    // Refresh the replay-store timeline range from the new event set
    const range = computeTimelineRange(sortedEvents);
    _refreshRange(range.firstTs, range.lastTs, sortedEvents.length);

    _setReady(sortedEvents.length, checkpoints.length);
  }, [sortedEvents, checkpointInterval, _setLoading, _setReady, _reset, _refreshRange]);

  // ── Core reconstruction function ──────────────────────────────────────────
  /**
   * Reconstruct scene state at `targetTs` and write it to the store.
   *
   * This is the single call-site for reconstructStateAt(). All playback paths
   * (RAF loop, user seek, enter-replay initial seek) flow through here.
   *
   * @param targetTs Target Unix timestamp (ms).
   */
  const reconstructAtTs = useCallback(
    (targetTs: number) => {
      const ev    = sortedEventsRef.current;
      const cps   = checkpointsRef.current;

      if (ev.length === 0) return;

      const wallStart = performance.now();

      // Reconstruct deterministic state at targetTs
      const state = reconstructStateAt(ev, targetTs, cps);

      // Write to the controller store for renderer access
      _setSceneState(state, wallStart);

      // Update replay-store playhead (seq from reconstruction result)
      _updatePlayhead(targetTs, state.seq);
    },
    [_setSceneState, _updatePlayhead],
  );

  // ── Enter / exit replay detection ─────────────────────────────────────────
  useEffect(() => {
    if (mode === "replay") {
      // On entering replay mode, perform an immediate reconstruction at the
      // current playhead so the renderer shows historical state at once.
      reconstructAtTs(useReplayStore.getState().playheadTs);
    } else {
      // Exiting replay: clear the scene state so the renderer knows to switch
      // back to live store data.
      useReplayControllerStore.getState()._setSceneState(
        emptySceneState(0),
        performance.now(),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── React to user seeks (playhead change while paused) ────────────────────
  useEffect(() => {
    const unsub = useReplayStore.subscribe((state, prev) => {
      if (state.mode !== "replay") return;
      // Only handle seek while not playing — playing seeks are handled by RAF
      if (!state.playing && state.playheadTs !== prev.playheadTs) {
        reconstructAtTs(state.playheadTs);
      }
    });
    return unsub;
  }, [reconstructAtTs]);

  // ── RAF playback loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || mode !== "replay") {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      lastWallTimeRef.current = 0;
      return;
    }

    let active = true;

    function tick(wallNow: number) {
      if (!active) return;

      const store = useReplayStore.getState();
      if (!store.playing || store.mode !== "replay") {
        lastWallTimeRef.current = 0;
        return;
      }

      const deltaWall = lastWallTimeRef.current > 0
        ? wallNow - lastWallTimeRef.current
        : 0;
      lastWallTimeRef.current = wallNow;

      if (deltaWall > 0 && deltaWall < maxDeltaMs) {
        // Advance simulated time by (wall-delta × speed)
        const newTs = store.playheadTs + deltaWall * store.speed;

        if (newTs >= store.lastEventTs) {
          // Reached end of timeline: reconstruct at end, stop playback
          reconstructAtTs(store.lastEventTs);
          useReplayStore.setState({
            playheadTs: store.lastEventTs,
            playing:    false,
            progress:   1,
            elapsed:    store.duration,
          });
          lastWallTimeRef.current = 0;
          return;
        }

        // Normal tick: reconstruct at new playhead
        reconstructAtTs(newTs);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    lastWallTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      lastWallTimeRef.current = 0;
    };
  }, [playing, mode, speed, reconstructAtTs, maxDeltaMs]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      _reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Return value ──────────────────────────────────────────────────────────
  return {
    sceneState,
    isReady,
    checkpointCount,
    eventsLoaded,
    mode,
    playing,
    speed,
    progress,
    elapsed,
    duration,
    playheadTs,
    firstEventTs,
    lastEventTs,
  };
}

// ── Convenience headless component ────────────────────────────────────────────

/**
 * ReplayControllerMount — Headless component that mounts the replay controller.
 *
 * Renders null. Include in the component tree to activate replay support for
 * a given TypedReplayEvent set.
 *
 * The controller writes reconstructed state to useReplayControllerStore, which
 * renderer components can subscribe to via:
 *   const sceneState = useReplayControllerStore(s => s.sceneState);
 *
 * Example (App.tsx):
 *   import { ReplayControllerMount } from "./hooks/use-replay-controller.js";
 *   // parsedEvents comes from useEventLogParser() or a static import
 *   <ReplayControllerMount events={parsedEvents} />
 */
export function ReplayControllerMount({
  events,
  options,
}: {
  events:   TypedReplayEvent[];
  options?: ReplayControllerOptions;
}): null {
  useReplayController(events, options);
  return null;
}
