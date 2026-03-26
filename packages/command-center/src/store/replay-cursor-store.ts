/**
 * replay-cursor-store.ts — Zustand store for event-entry cursor state.
 *
 * Sub-AC 9b: Wraps the pure replay-cursor functions in a Zustand store to
 * provide React components with reactive access to the cursor position,
 * current event, and traversal controls.
 *
 * Architecture
 * ────────────
 * The events array is held in a module-level closure variable (_events) rather
 * than in Zustand state. This prevents unnecessary re-renders when the events
 * array reference changes (e.g. on page reload) and avoids serialising a
 * potentially large array into Zustand's state snapshot machinery.
 *
 * The Zustand state holds only the lightweight ReplayCursorState value (a few
 * numbers + one object reference) and a "isReady" flag.
 *
 * Integration with replay-store
 * ──────────────────────────────
 * The cursor store is intentionally decoupled from useReplayStore. Callers
 * that want coordinated playback (seeking the replay-store playhead when the
 * cursor moves) should subscribe to `useReplayCursorStore` and call
 * `useReplayStore.getState().seekToTs(cursor.cursorTs)` themselves, or use
 * the provided `seekAndSync` helper which does both in one call.
 *
 * Design principles
 * ──────────────────
 *  - Record transparency: the store always exposes the full currentEvent at
 *    the cursor so renderer components can render any payload field.
 *  - Determinism: all cursor mutations are delegated to the pure functions in
 *    replay-cursor.ts; the store is a thin Zustand wrapper.
 *  - Write-only EventLog: cursor movements never emit events to the event log.
 *  - Separation of concerns: pure cursor logic lives in replay-cursor.ts;
 *    this file only handles Zustand state management.
 *
 * Usage
 * ─────
 *   // In a parent component (App.tsx or replay panel):
 *   const { loadCursorEvents } = useReplayCursorStore.getState();
 *   loadCursorEvents(sortedEvents);
 *
 *   // In any renderer component:
 *   const cursor    = useReplayCursorStore(s => s.cursor);
 *   const stepFwd   = useReplayCursorStore(s => s.stepForward);
 *   const stepBack  = useReplayCursorStore(s => s.stepBackward);
 *
 *   // Access current event:
 *   const evt = cursor.currentEvent;
 */

import { create } from "zustand";
import {
  emptyCursorState,
  cursorStepForward,
  cursorStepBackward,
  cursorAtTs,
  cursorSeekToIndex,
  cursorSeekToStart,
  cursorSeekToEnd,
  type ReplayCursorState,
} from "../replay/replay-cursor.js";
import type { TypedReplayEvent } from "../replay/event-log-schema.js";

// ── Module-level events cache ─────────────────────────────────────────────────
// Held outside Zustand state to avoid serialisation overhead and spurious
// re-renders. Replaced on every loadCursorEvents() call.

let _events: readonly TypedReplayEvent[] = [];

// ── Store schema version ───────────────────────────────────────────────────────

/**
 * Schema version for ReplayCursorStoreState.
 * Increment when the store shape changes in a backward-incompatible way.
 */
export const REPLAY_CURSOR_STORE_VERSION = "cursor-store@1.0.0" as const;

// ── Store state shape ─────────────────────────────────────────────────────────

export interface ReplayCursorStoreState {
  // ── Cursor state ────────────────────────────────────────────────────────
  /**
   * The current cursor position.
   *
   * Contains the cursor index (0-based), the event at that index
   * (`currentEvent`), the event's ts and seq, and derived booleans
   * (isAtStart, isAtEnd, isBeforeStart). See ReplayCursorState for details.
   */
  cursor: ReplayCursorState;

  /**
   * Whether events have been loaded and the cursor is ready to use.
   *
   * false → no events loaded yet (or after reset()).
   * true  → events loaded via loadCursorEvents().
   */
  isReady: boolean;

  /**
   * Total number of events currently loaded.
   * Mirrors cursor.totalEvents; provided here for convenient subscription.
   */
  totalEvents: number;

  // ── Actions ─────────────────────────────────────────────────────────────

  /**
   * Load a sorted TypedReplayEvent array and reset the cursor to the
   * before-start position (cursorIndex = -1).
   *
   * Call this whenever the underlying event data changes (e.g. after parsing
   * a new JSONL file or after a live event arrives).
   *
   * @param events  Sorted (tsMs ASC, seq ASC) TypedReplayEvent array.
   */
  loadCursorEvents: (events: readonly TypedReplayEvent[]) => void;

  /**
   * Advance the cursor by one event entry (forward step).
   *
   * No-op when not ready or at the end.
   * Auto-positions at index 0 when stepping from the before-start position.
   */
  stepForward: () => void;

  /**
   * Retreat the cursor by one event entry (backward step).
   *
   * When at index 0 (first event), retreats to -1 (before-start sentinel).
   * No-op when not ready or already at before-start.
   */
  stepBackward: () => void;

  /**
   * Seek to the last event at or before `targetTs` (Unix ms).
   *
   * Uses binary search (O(log n)). If `targetTs` is before all events,
   * the cursor is positioned at -1 (before-start).
   *
   * @param targetTs  Target Unix timestamp (ms).
   */
  seekToTs: (targetTs: number) => void;

  /**
   * Seek to a specific 0-based event index.
   *
   * Index is clamped to [-1, totalEvents - 1]. Pass -1 to reset to
   * the before-start sentinel.
   *
   * @param index  Target event index.
   */
  seekToIndex: (index: number) => void;

  /**
   * Seek to the first event (index 0).
   *
   * No-op when not ready.
   */
  seekToStart: () => void;

  /**
   * Seek to the last event (index totalEvents - 1).
   *
   * No-op when not ready.
   */
  seekToEnd: () => void;

  /**
   * Reset the cursor to before-start and clear the loaded events.
   *
   * After calling this, `isReady` is false and `cursor` is emptyCursorState().
   */
  reset: () => void;
}

// ── Store implementation ──────────────────────────────────────────────────────

const INITIAL_STATE: Pick<
  ReplayCursorStoreState,
  "cursor" | "isReady" | "totalEvents"
> = {
  cursor:      emptyCursorState(),
  isReady:     false,
  totalEvents: 0,
};

export const useReplayCursorStore = create<ReplayCursorStoreState>((set, get) => ({
  ...INITIAL_STATE,

  // ── loadCursorEvents ────────────────────────────────────────────────────
  loadCursorEvents: (events) => {
    _events = events;
    const cursor = emptyCursorState();
    set({
      cursor,
      isReady:     events.length > 0,
      totalEvents: events.length,
    });
  },

  // ── stepForward ─────────────────────────────────────────────────────────
  stepForward: () => {
    const { isReady, cursor } = get();
    if (!isReady) return;
    // If already at end and the cursor has reached the end, no-op.
    if (cursor.isAtEnd && cursor.cursorIndex >= 0) return;
    const next = cursorStepForward(_events, cursor);
    set({ cursor: next });
  },

  // ── stepBackward ────────────────────────────────────────────────────────
  stepBackward: () => {
    const { isReady, cursor } = get();
    if (!isReady) return;
    // If already before start, no-op.
    if (cursor.isBeforeStart) return;
    const prev = cursorStepBackward(_events, cursor);
    set({ cursor: prev });
  },

  // ── seekToTs ─────────────────────────────────────────────────────────────
  seekToTs: (targetTs) => {
    const { isReady } = get();
    if (!isReady) return;
    const cursor = cursorAtTs(_events, targetTs);
    set({ cursor });
  },

  // ── seekToIndex ──────────────────────────────────────────────────────────
  seekToIndex: (index) => {
    const { isReady } = get();
    if (!isReady) return;
    const cursor = cursorSeekToIndex(_events, index);
    set({ cursor });
  },

  // ── seekToStart ──────────────────────────────────────────────────────────
  seekToStart: () => {
    const { isReady } = get();
    if (!isReady) return;
    const cursor = cursorSeekToStart(_events);
    set({ cursor });
  },

  // ── seekToEnd ────────────────────────────────────────────────────────────
  seekToEnd: () => {
    const { isReady } = get();
    if (!isReady) return;
    const cursor = cursorSeekToEnd(_events);
    set({ cursor });
  },

  // ── reset ─────────────────────────────────────────────────────────────────
  reset: () => {
    _events = [];
    set({ ...INITIAL_STATE });
  },
}));

// ── Convenience accessor ──────────────────────────────────────────────────────

/**
 * Get the current events array loaded into the cursor store.
 *
 * This is useful for operations that need both the cursor state and the
 * underlying events without going through React state (e.g. in tests or
 * non-React callbacks).
 *
 * Returns a frozen empty array when no events are loaded.
 */
export function getCursorEvents(): readonly TypedReplayEvent[] {
  return _events;
}
