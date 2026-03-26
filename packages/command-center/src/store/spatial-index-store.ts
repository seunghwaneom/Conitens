/**
 * spatial-index-store.ts — Zustand store for the spatial index entity.
 *
 * Sub-AC 1 (AC 15): Bridges the per-frame spatial index computation (which
 * runs inside the Three.js render loop via use-spatial-index.ts) to the
 * React/HUD layer which needs the window result OUTSIDE the Canvas.
 *
 * ── Ontology level ──────────────────────────────────────────────────────────
 *   INFRASTRUCTURE — how the system manages geometry allocation.
 *
 * ── Event sourcing ───────────────────────────────────────────────────────────
 *   Each spatial index update emits a typed SpatialIndexEvent appended to
 *   an in-memory log.  This satisfies the record_transparency principle:
 *   every frame that changed the render window is traceable in the log.
 *   The log is NOT persisted to disk (high-frequency, ephemeral data) but
 *   IS available for session-level replay analysis.
 *
 *   Separately, the store exposes a telemetry summary (windowSizeHistory,
 *   cullCount) that is stored apart from the event log as required by the
 *   constraint "Telemetry stored separately from EventLog".
 *
 * ── Consumption ──────────────────────────────────────────────────────────────
 *   Inside Canvas:  use-spatial-index.ts calls setSnapshot() each frame.
 *   Outside Canvas: HUD components subscribe to windowedSet and snapshot.
 *   Replay:         The coordinator may inspect events[] for session analysis.
 */

import { create } from "zustand";
import {
  makeEmptySnapshot,
  extractWindowedSet,
  type SpatialIndexSnapshot,
  type WindowedAgentSet,
  type Vec3,
} from "../scene/spatial-index.js";

// ── Event types ───────────────────────────────────────────────────────────────

export type SpatialIndexEventType =
  | "index.initialized"    // Store and first snapshot created
  | "index.window_changed" // Full-render window membership changed
  | "index.culled"         // One or more agents culled this frame
  | "index.reset";         // Index cleared (e.g., building reload)

export interface SpatialIndexEvent {
  id:   string;
  type: SpatialIndexEventType;
  ts:   number;
  /** Agent IDs in the new full-render window (undefined for reset/init) */
  windowIds?:  string[];
  /** Agent IDs newly culled this frame */
  culledIds?:  string[];
  /** Camera world position at event time */
  cameraPos?:  Vec3;
  /** Payload freeform for extensibility */
  payload: Record<string, unknown>;
}

// ── Telemetry (stored separately from EventLog per design constraint) ────────

export interface SpatialIndexTelemetry {
  /** Rolling window of window-size samples (last 60 frames) */
  windowSizeHistory: number[];
  /** Total agents culled since last reset */
  cullCountTotal: number;
  /** Maximum window size observed this session */
  maxWindowSeen: number;
  /** Minimum window size observed this session */
  minWindowSeen: number;
  /** Average window fill ratio (windowCount / totalCount) over last 60 frames */
  avgFillRatio: number;
}

// ── Store state ───────────────────────────────────────────────────────────────

export interface SpatialIndexStoreState {
  // ── Current spatial index state ──────────────────────────────────────────
  /** Latest spatial index snapshot (or empty on init) */
  snapshot:    SpatialIndexSnapshot;
  /** Latest windowed agent set derived from snapshot */
  windowedSet: WindowedAgentSet;

  // ── Append-only event log ─────────────────────────────────────────────────
  /** Spatial index events (append-only; in-memory only) */
  events: SpatialIndexEvent[];

  // ── Telemetry (separate from event log) ──────────────────────────────────
  telemetry: SpatialIndexTelemetry;

  // ── Behavioral contract methods ───────────────────────────────────────────

  /**
   * setSnapshot — Called by use-spatial-index.ts each frame (when the window
   * changes).  Updates snapshot and windowedSet, records an event.
   */
  setSnapshot: (snapshot: SpatialIndexSnapshot) => void;

  /**
   * reset — Clears the spatial index and appends an "index.reset" event.
   * Called on building reload or agent registry wipe.
   */
  reset: () => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

let _eventSeq = 0;
function nextEventId(): string {
  return `si-evt-${Date.now()}-${(++_eventSeq).toString().padStart(4, "0")}`;
}

const TELEMETRY_WINDOW = 60; // rolling sample count

function updateTelemetry(
  prev: SpatialIndexTelemetry,
  windowCount: number,
  totalCount: number,
  culledCount: number,
): SpatialIndexTelemetry {
  const history = [...prev.windowSizeHistory, windowCount].slice(-TELEMETRY_WINDOW);
  const fillRatio = totalCount > 0 ? windowCount / totalCount : 1;
  const fillHistory = history.map((w) => (totalCount > 0 ? w / totalCount : 1));
  const avgFillRatio =
    fillHistory.reduce((s, r) => s + r, 0) / Math.max(1, fillHistory.length);

  return {
    windowSizeHistory: history,
    cullCountTotal:    prev.cullCountTotal + culledCount,
    maxWindowSeen:     Math.max(prev.maxWindowSeen, windowCount),
    minWindowSeen:     history.length < 2 ? windowCount : Math.min(prev.minWindowSeen, windowCount),
    avgFillRatio:      Math.round(avgFillRatio * 100) / 100,
  };
}

function emptyTelemetry(): SpatialIndexTelemetry {
  return {
    windowSizeHistory: [],
    cullCountTotal:    0,
    maxWindowSeen:     0,
    minWindowSeen:     Infinity,
    avgFillRatio:      1,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _emptySnapshot = makeEmptySnapshot();
const _emptyWindowedSet: WindowedAgentSet = {
  fullRenderIds: [],
  deferredIds:   [],
  culledIds:     [],
  lodMap:        {},
};

export const useSpatialIndexStore = create<SpatialIndexStoreState>((set, get) => ({
  snapshot:    _emptySnapshot,
  windowedSet: _emptyWindowedSet,
  events:      [],
  telemetry:   emptyTelemetry(),

  setSnapshot(newSnapshot: SpatialIndexSnapshot) {
    const newWindowedSet = extractWindowedSet(newSnapshot);
    const { events, telemetry, snapshot: prevSnapshot } = get();

    // Build events to emit
    const newEvents: SpatialIndexEvent[] = [];

    // Emit "index.window_changed" if window membership changed
    const prevIds = prevSnapshot.windowAgents.map((r) => r.agentId).sort().join(",");
    const nextIds = newSnapshot.windowAgents.map((r) => r.agentId).sort().join(",");
    if (prevIds !== nextIds) {
      newEvents.push({
        id:        nextEventId(),
        type:      "index.window_changed",
        ts:        newSnapshot.ts,
        windowIds: newWindowedSet.fullRenderIds,
        cameraPos: newSnapshot.cameraPos,
        payload:   {
          windowCount:  newSnapshot.windowCount,
          totalCount:   newSnapshot.totalCount,
          visibleCount: newSnapshot.visibleCount,
        },
      });
    }

    // Emit "index.culled" if any agents were culled
    const culledIds = newWindowedSet.culledIds;
    if (culledIds.length > 0) {
      newEvents.push({
        id:        nextEventId(),
        type:      "index.culled",
        ts:        newSnapshot.ts,
        culledIds,
        cameraPos: newSnapshot.cameraPos,
        payload:   { culledCount: culledIds.length },
      });
    }

    // Update telemetry
    const newTelemetry = updateTelemetry(
      telemetry,
      newSnapshot.windowCount,
      newSnapshot.totalCount,
      culledIds.length,
    );

    set({
      snapshot:    newSnapshot,
      windowedSet: newWindowedSet,
      events:      newEvents.length > 0 ? [...events, ...newEvents] : events,
      telemetry:   newTelemetry,
    });
  },

  reset() {
    const empty = makeEmptySnapshot();
    const resetEvent: SpatialIndexEvent = {
      id:      nextEventId(),
      type:    "index.reset",
      ts:      Date.now(),
      payload: {},
    };
    set({
      snapshot:    empty,
      windowedSet: _emptyWindowedSet,
      events:      [...get().events, resetEvent],
      telemetry:   emptyTelemetry(),
    });
  },
}));
