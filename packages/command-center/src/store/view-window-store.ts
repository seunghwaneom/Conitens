/**
 * view-window-store.ts — Zustand store for the view_window entity.
 *
 * Sub-AC 15b: Bridges the per-frame camera-frustum computation (which runs
 * inside the Three.js render loop via use-view-window.ts) to the React/HUD
 * layer that needs the results OUTSIDE the Canvas.
 *
 * ── Ontology level ───────────────────────────────────────────────────────────
 *   INFRASTRUCTURE — governs which entities are allocated to the GPU.
 *
 * ── Event sourcing ────────────────────────────────────────────────────────────
 *   Each time the visible set changes, a ViewWindowEvent is appended to
 *   an in-memory log.  The log satisfies the record_transparency principle:
 *   every render-pass change is traceable.  The log is NOT persisted to disk
 *   (high-frequency ephemeral data) but is available for session-level replay.
 *
 *   Telemetry is stored separately from the event log per design constraint.
 *
 * ── Consumption ───────────────────────────────────────────────────────────────
 *   Inside Canvas:  use-view-window.ts calls setSnapshot() each frame
 *                   when the visible set changes.
 *   Outside Canvas: HUD and scene layer components subscribe to snapshot /
 *                   visibleIds for gating render decisions.
 *   Replay:         Coordinator may inspect events[] for session analysis.
 */

import { create } from "zustand";
import {
  makeEmptyViewWindowSnapshot,
  type ViewWindowSnapshot,
  type Vec3,
  type ViewWindowClass,
} from "../scene/view-window.js";

// ── Event types ───────────────────────────────────────────────────────────────

export type ViewWindowEventType =
  | "vw.initialized"     // Store created; initial snapshot set
  | "vw.visible_changed" // The frustum+proximity visible set changed
  | "vw.culled"          // One or more entities newly culled
  | "vw.reset";          // View window cleared (e.g., building reload)

/** Structured event appended to the in-memory event log. */
export interface ViewWindowEvent {
  id:   string;
  type: ViewWindowEventType;
  ts:   number;
  /** IDs now in the visible set (undefined for reset/init) */
  visibleIds?: string[];
  /** IDs newly culled this frame */
  culledIds?:  string[];
  /** Camera world position at event time */
  cameraPos?:  Vec3;
  /** Freeform payload for extensibility */
  payload: Record<string, unknown>;
}

// ── Telemetry (stored separately from event log per design constraint) ────────

/** Per-session telemetry summary for the view window. */
export interface ViewWindowTelemetry {
  /** Rolling sample of visible-set sizes (last 60 frames with changes) */
  visibleCountHistory: number[];
  /** Total entities culled since last reset */
  cullCountTotal: number;
  /** Maximum visible count observed this session */
  maxVisibleSeen: number;
  /** Minimum visible count observed this session */
  minVisibleSeen: number;
  /** Fraction of frames where any entity was in "proximity" (not frustum) */
  proximityRatio: number;
  /** Total frames processed */
  frameCount: number;
}

// ── Store state ───────────────────────────────────────────────────────────────

export interface ViewWindowStoreState {
  // ── Current view window state ────────────────────────────────────────────
  /** Latest ViewWindowSnapshot (empty until first frame) */
  snapshot: ViewWindowSnapshot;

  // ── Append-only event log (in-memory only) ────────────────────────────────
  events: ViewWindowEvent[];

  // ── Telemetry (separate from event log) ──────────────────────────────────
  telemetry: ViewWindowTelemetry;

  // ── Behavioral contract methods ───────────────────────────────────────────

  /**
   * setSnapshot — Called by use-view-window each frame when visible set changes.
   * Updates snapshot, records an event, and updates telemetry.
   */
  setSnapshot: (snapshot: ViewWindowSnapshot) => void;

  /**
   * reset — Clear the view window and record a "vw.reset" event.
   * Called on building reload or when the Canvas unmounts.
   */
  reset: () => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

let _eventSeq = 0;
function nextEventId(): string {
  return `vw-evt-${Date.now()}-${(++_eventSeq).toString().padStart(4, "0")}`;
}

const TELEMETRY_WINDOW = 60; // rolling sample count

function emptyTelemetry(): ViewWindowTelemetry {
  return {
    visibleCountHistory: [],
    cullCountTotal:      0,
    maxVisibleSeen:      0,
    minVisibleSeen:      Infinity,
    proximityRatio:      0,
    frameCount:          0,
  };
}

function updateTelemetry(
  prev: ViewWindowTelemetry,
  snap: ViewWindowSnapshot,
): ViewWindowTelemetry {
  const visibleCount  = snap.visibleIds.length;
  const culledCount   = snap.culledIds.length;
  const hasProximity  = snap.proximityIds.length > 0 ? 1 : 0;
  const frameCount    = prev.frameCount + 1;

  const history = [...prev.visibleCountHistory, visibleCount].slice(-TELEMETRY_WINDOW);

  // Rolling proximity ratio
  const proxRatioRaw  =
    (prev.proximityRatio * prev.frameCount + hasProximity) / frameCount;

  return {
    visibleCountHistory: history,
    cullCountTotal:      prev.cullCountTotal + culledCount,
    maxVisibleSeen:      Math.max(prev.maxVisibleSeen, visibleCount),
    minVisibleSeen:      history.length < 2 ? visibleCount : Math.min(prev.minVisibleSeen, visibleCount),
    proximityRatio:      Math.round(proxRatioRaw * 1000) / 1000,
    frameCount,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useViewWindowStore = create<ViewWindowStoreState>((set, get) => ({
  snapshot:  makeEmptyViewWindowSnapshot(),
  events:    [],
  telemetry: emptyTelemetry(),

  setSnapshot(newSnapshot: ViewWindowSnapshot) {
    const { snapshot: prevSnapshot, events, telemetry } = get();

    // Build events only when something changed
    const newEvents: ViewWindowEvent[] = [];

    // Check if visible set changed (frustumIds + proximityIds)
    const prevVisible = prevSnapshot.visibleIds.slice().sort().join(",");
    const nextVisible = newSnapshot.visibleIds.slice().sort().join(",");

    if (prevVisible !== nextVisible) {
      newEvents.push({
        id:         nextEventId(),
        type:       "vw.visible_changed",
        ts:         newSnapshot.ts,
        visibleIds: newSnapshot.visibleIds.slice(),
        cameraPos:  newSnapshot.cameraPos,
        payload:    {
          frustumCount:   newSnapshot.frustumIds.length,
          proximityCount: newSnapshot.proximityIds.length,
          culledCount:    newSnapshot.culledIds.length,
        },
      });
    }

    // Record culled entities (if any)
    if (newSnapshot.culledIds.length > 0) {
      newEvents.push({
        id:        nextEventId(),
        type:      "vw.culled",
        ts:        newSnapshot.ts,
        culledIds: newSnapshot.culledIds.slice(),
        cameraPos: newSnapshot.cameraPos,
        payload:   { culledCount: newSnapshot.culledIds.length },
      });
    }

    const newTelemetry = updateTelemetry(telemetry, newSnapshot);

    set({
      snapshot:  newSnapshot,
      events:    newEvents.length > 0 ? [...events, ...newEvents] : events,
      telemetry: newTelemetry,
    });
  },

  reset() {
    const empty = makeEmptyViewWindowSnapshot();
    const resetEvent: ViewWindowEvent = {
      id:      nextEventId(),
      type:    "vw.reset",
      ts:      Date.now(),
      payload: {},
    };
    set({
      snapshot:  empty,
      events:    [...get().events, resetEvent],
      telemetry: emptyTelemetry(),
    });
  },
}));

// ── Selector helpers ──────────────────────────────────────────────────────────

/**
 * selectVisibleIds — Zustand selector that returns the current visible ID set.
 *
 * Use inside scene components to gate rendering:
 *   const visibleIds = useViewWindowStore(selectVisibleIds);
 *   if (!visibleIds.has(agentId)) return null;
 */
export function selectVisibleIds(
  state: ViewWindowStoreState,
): ReadonlySet<string> {
  return new Set(state.snapshot.visibleIds);
}

/**
 * selectEntityClass — Return the ViewWindowClass for a specific entity ID.
 *
 * O(n) linear scan over entities — suitable for per-component use.
 * For bulk access, prefer selectVisibleIds.
 */
export function selectEntityClass(
  state: ViewWindowStoreState,
  id: string,
): ViewWindowClass {
  const entity = state.snapshot.entities.find((e) => e.id === id);
  return entity?.class ?? "culled";
}
