/**
 * replay-cursor.ts — Event-entry cursor for replay traversal.
 *
 * Sub-AC 9b: Implements the replay_state cursor concept — a pointer into a
 * sorted TypedReplayEvent array that exposes the current cursor position and
 * the associated event, and supports traversal controls (step, seek).
 *
 * Architecture
 * ────────────
 * This module is purely functional and has NO React, Zustand, or Node.js
 * dependencies. It is safe for use in workers, server-side rendering, and
 * headless test environments.
 *
 * The cursor is an immutable value object (ReplayCursorState). All operations
 * return a new cursor state; the input is never mutated.
 *
 * Design principles
 * ──────────────────
 *  - Record transparency: the cursor always exposes the full TypedReplayEvent
 *    it currently points at (or null before/after the range), ensuring that
 *    all traversal is traceable to a specific log entry.
 *  - Determinism: seekToTs uses a deterministic binary search that always
 *    selects the same event for a given (events, ts) pair.
 *  - Immutability: inputs (events arrays) are never mutated; cursor state
 *    objects are plain, serialisable values.
 *  - Forward-compatibility: unknown event types produce valid cursor states
 *    (they are not filtered) for full log fidelity.
 *
 * Usage
 * ─────
 *   import {
 *     emptyCursorState,
 *     cursorAtIndex,
 *     cursorAtTs,
 *     cursorStepForward,
 *     cursorStepBackward,
 *   } from "./replay-cursor.js";
 *
 *   // Initialise at first event
 *   const cursor = cursorAtIndex(events, 0);
 *
 *   // Step through entries
 *   const next = cursorStepForward(events, cursor);
 *
 *   // Seek to a timestamp
 *   const seeked = cursorAtTs(events, targetTsMs);
 *
 *   // Access current event
 *   if (cursor.currentEvent) {
 *     console.log(cursor.currentEvent.type);
 *   }
 */

import type { TypedReplayEvent } from "./event-log-schema.js";

// ── Schema version ────────────────────────────────────────────────────────────

/** Canonical schema version for replay-cursor outputs. */
export const REPLAY_CURSOR_VERSION = "cursor@1.0.0" as const;
export type ReplayCursorVersion = typeof REPLAY_CURSOR_VERSION;

// ── Cursor state ──────────────────────────────────────────────────────────────

/**
 * The immutable state of a replay cursor.
 *
 * A cursor is a pointer into a sorted TypedReplayEvent array. It exposes:
 *  - The 0-based index of the current event in the array (`cursorIndex`).
 *  - The event at that index (`currentEvent`), or null when out of range.
 *  - Convenience properties derived from the index and the events array.
 *
 * Sentinel: when the cursor is "before the start" (no events applied yet),
 * `cursorIndex` is -1 and `currentEvent` is null.
 *
 * The events array is NOT stored in the cursor state. It is passed to every
 * traversal function to keep the cursor a pure value type.
 */
export interface ReplayCursorState {
  /**
   * 0-based index into the sorted events array pointing to the current event.
   * -1 indicates the cursor is positioned before the first entry (before start).
   * Values ≥ totalEvents are clamped to totalEvents - 1.
   */
  cursorIndex: number;

  /**
   * The seq number of the event at `cursorIndex`.
   * 0 when cursorIndex is -1 or the events array is empty.
   */
  cursorSeq: number;

  /**
   * The Unix timestamp (ms) of the event at `cursorIndex`.
   * 0 when cursorIndex is -1 or the events array is empty.
   */
  cursorTs: number;

  /**
   * The event at `cursorIndex`, or null when the cursor is out of range
   * (before start, after end, or events array is empty).
   */
  currentEvent: TypedReplayEvent | null;

  /**
   * Total number of events in the events array this cursor was created from.
   * 0 when the array is empty.
   */
  totalEvents: number;

  /**
   * True when the cursor is at or before the first valid index (0).
   * Also true when events is empty.
   */
  isAtStart: boolean;

  /**
   * True when the cursor is at or past the last valid index (totalEvents - 1).
   * Also true when events is empty.
   */
  isAtEnd: boolean;

  /**
   * True when the cursor has not yet advanced past the pre-start sentinel
   * position (cursorIndex === -1).
   */
  isBeforeStart: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Clamp `index` to the valid range [-1, totalEvents - 1].
 * The lower bound is -1 (before-start sentinel).
 * The upper bound is totalEvents - 1 (or -1 when empty).
 *
 * @internal
 */
function clampIndex(index: number, totalEvents: number): number {
  if (totalEvents === 0) return -1;
  return Math.max(-1, Math.min(totalEvents - 1, index));
}

/**
 * Build a ReplayCursorState from a clamped index.
 *
 * @param events   Sorted events array (not stored in state).
 * @param index    0-based index into `events`, or -1 for before-start.
 * @internal
 */
function buildCursorState(
  events: readonly TypedReplayEvent[],
  index: number,
): ReplayCursorState {
  const totalEvents = events.length;
  const clamped = clampIndex(index, totalEvents);
  const event   = clamped >= 0 && clamped < totalEvents ? events[clamped] : null;

  return {
    cursorIndex:  clamped,
    cursorSeq:    event?.seq  ?? 0,
    cursorTs:     event?.tsMs ?? 0,
    currentEvent: event ?? null,
    totalEvents,
    isAtStart:    totalEvents === 0 || clamped <= 0,
    isAtEnd:      totalEvents === 0 || clamped >= totalEvents - 1,
    isBeforeStart: clamped < 0,
  };
}

// ── Binary search ─────────────────────────────────────────────────────────────

/**
 * Binary-search for the largest index `i` such that `events[i].tsMs ≤ targetTs`.
 *
 * Returns -1 (before-start) when:
 *  - `events` is empty, or
 *  - `targetTs` is strictly less than `events[0].tsMs`.
 *
 * Returns `events.length - 1` when `targetTs ≥ events[events.length - 1].tsMs`.
 *
 * Assumes the array is sorted ascending by (tsMs, seq). The search is O(log n).
 *
 * @param events   Sorted TypedReplayEvent array.
 * @param targetTs Target Unix timestamp (ms).
 */
export function findLastIndexAtOrBeforeTs(
  events: readonly TypedReplayEvent[],
  targetTs: number,
): number {
  const n = events.length;
  if (n === 0) return -1;
  if (targetTs < events[0].tsMs) return -1;
  if (targetTs >= events[n - 1].tsMs) return n - 1;

  let lo = 0;
  let hi = n - 1;

  while (lo < hi) {
    // Use unsigned right shift to avoid signed integer overflow.
    const mid = (lo + hi + 1) >>> 1;
    if (events[mid].tsMs <= targetTs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

/**
 * Binary-search for the smallest index `i` such that `events[i].tsMs ≥ targetTs`.
 *
 * Returns `events.length` (past end) when all events are before `targetTs`.
 * Returns 0 when `targetTs ≤ events[0].tsMs`.
 *
 * Assumes the array is sorted ascending by (tsMs, seq). The search is O(log n).
 *
 * @param events   Sorted TypedReplayEvent array.
 * @param targetTs Target Unix timestamp (ms).
 */
export function findFirstIndexAtOrAfterTs(
  events: readonly TypedReplayEvent[],
  targetTs: number,
): number {
  const n = events.length;
  if (n === 0) return 0;
  if (targetTs <= events[0].tsMs) return 0;
  if (targetTs > events[n - 1].tsMs) return n; // past end

  let lo = 0;
  let hi = n - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].tsMs < targetTs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

// ── Cursor factories ──────────────────────────────────────────────────────────

/**
 * Return the canonical empty cursor state for an empty or not-yet-loaded
 * event set. The cursor is positioned before the start (cursorIndex = -1).
 *
 * Useful as an initial value before events are loaded.
 */
export function emptyCursorState(): ReplayCursorState {
  return {
    cursorIndex:   -1,
    cursorSeq:      0,
    cursorTs:       0,
    currentEvent:   null,
    totalEvents:    0,
    isAtStart:      true,
    isAtEnd:        true,
    isBeforeStart:  true,
  };
}

/**
 * Position the cursor at an explicit 0-based `index` in `events`.
 *
 * - Index -1 → before-start sentinel (same as `emptyCursorState()` with events).
 * - Index out of range → clamped to [−1, totalEvents − 1].
 * - Empty events → always returns before-start state.
 *
 * @param events  Sorted TypedReplayEvent array.
 * @param index   0-based index to position at (default: 0 = first event).
 */
export function cursorAtIndex(
  events: readonly TypedReplayEvent[],
  index: number = 0,
): ReplayCursorState {
  return buildCursorState(events, index);
}

/**
 * Position the cursor at the last event with `tsMs ≤ targetTs`.
 *
 * This is the canonical "seek to timestamp" operation. It uses binary search
 * and is O(log n). The cursor will point to the latest event that has
 * occurred at or before `targetTs`.
 *
 * If `targetTs` is before all events, the cursor is positioned at -1
 * (before-start), matching the state where no events have been applied.
 *
 * @param events    Sorted TypedReplayEvent array.
 * @param targetTs  Target Unix timestamp (ms).
 */
export function cursorAtTs(
  events: readonly TypedReplayEvent[],
  targetTs: number,
): ReplayCursorState {
  const idx = findLastIndexAtOrBeforeTs(events, targetTs);
  return buildCursorState(events, idx);
}

// ── Traversal controls ────────────────────────────────────────────────────────

/**
 * Advance the cursor by one event entry (forward step).
 *
 * If already at the last event, the cursor stays at the end (isAtEnd = true).
 * If before start (cursorIndex = -1), advances to index 0.
 *
 * @param events  Sorted TypedReplayEvent array (must match the one used to
 *                create `state`).
 * @param state   Current cursor state.
 */
export function cursorStepForward(
  events: readonly TypedReplayEvent[],
  state: ReplayCursorState,
): ReplayCursorState {
  if (events.length === 0) return emptyCursorState();
  // Clamp: from -1 we go to 0; at end we stay at end
  const nextIndex = Math.min(state.cursorIndex + 1, events.length - 1);
  return buildCursorState(events, nextIndex);
}

/**
 * Retreat the cursor by one event entry (backward step).
 *
 * If already at the first event (index 0), steps back to index -1
 * (before-start sentinel). Stepping backward from -1 is a no-op.
 *
 * @param events  Sorted TypedReplayEvent array.
 * @param state   Current cursor state.
 */
export function cursorStepBackward(
  events: readonly TypedReplayEvent[],
  state: ReplayCursorState,
): ReplayCursorState {
  if (events.length === 0) return emptyCursorState();
  // Clamp to -1 (before-start); stepping back from -1 stays at -1
  const prevIndex = Math.max(-1, state.cursorIndex - 1);
  return buildCursorState(events, prevIndex);
}

/**
 * Seek to the last event at or before `targetTs` (absolute timestamp).
 *
 * Alias for `cursorAtTs` — provided under the "seek" naming convention for
 * symmetry with `stepForward` / `stepBackward`.
 *
 * @param events    Sorted TypedReplayEvent array.
 * @param targetTs  Target Unix timestamp (ms).
 */
export function cursorSeekToTs(
  events: readonly TypedReplayEvent[],
  targetTs: number,
): ReplayCursorState {
  return cursorAtTs(events, targetTs);
}

/**
 * Seek to a specific 0-based index.
 *
 * Index is clamped to [−1, totalEvents − 1]. Pass -1 explicitly to reset
 * to the before-start sentinel.
 *
 * @param events  Sorted TypedReplayEvent array.
 * @param index   Target 0-based index (or −1 for before-start).
 */
export function cursorSeekToIndex(
  events: readonly TypedReplayEvent[],
  index: number,
): ReplayCursorState {
  return buildCursorState(events, index);
}

/**
 * Seek to the very start of the event array (index 0).
 *
 * Returns before-start state when `events` is empty.
 *
 * @param events  Sorted TypedReplayEvent array.
 */
export function cursorSeekToStart(
  events: readonly TypedReplayEvent[],
): ReplayCursorState {
  return buildCursorState(events, 0);
}

/**
 * Seek to the very end of the event array (last index).
 *
 * Returns before-start state when `events` is empty.
 *
 * @param events  Sorted TypedReplayEvent array.
 */
export function cursorSeekToEnd(
  events: readonly TypedReplayEvent[],
): ReplayCursorState {
  return buildCursorState(events, events.length - 1);
}

// ── Cursor inspection helpers ─────────────────────────────────────────────────

/**
 * Normalised progress of the cursor through the event array (0..1).
 *
 * Returns 0 when:
 *  - The events array is empty.
 *  - The cursor is before start (cursorIndex < 0).
 *
 * Returns 1 when the cursor is at the last event.
 *
 * Formula: `cursorIndex / max(totalEvents - 1, 1)`
 *
 * @param state  Current cursor state.
 */
export function cursorProgress(state: ReplayCursorState): number {
  if (state.totalEvents === 0 || state.cursorIndex < 0) return 0;
  return state.cursorIndex / Math.max(state.totalEvents - 1, 1);
}

/**
 * Return the number of events remaining after the current cursor position.
 *
 * When the cursor is before start (-1), all events are "remaining".
 * When at the last event, 0 events remain.
 *
 * @param state  Current cursor state.
 */
export function cursorRemainingEvents(state: ReplayCursorState): number {
  if (state.totalEvents === 0) return 0;
  if (state.cursorIndex < 0) return state.totalEvents;
  return Math.max(0, state.totalEvents - 1 - state.cursorIndex);
}

/**
 * Return the number of events that have been traversed (including the current
 * event). 0 when before start or events is empty.
 *
 * @param state  Current cursor state.
 */
export function cursorElapsedEvents(state: ReplayCursorState): number {
  if (state.totalEvents === 0 || state.cursorIndex < 0) return 0;
  return state.cursorIndex + 1;
}
