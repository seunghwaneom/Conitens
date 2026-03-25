/**
 * replay-cursor.test.ts — Unit tests for Sub-AC 9b: replay_state cursor.
 *
 * Validates the pure cursor module (replay-cursor.ts) which implements
 * event-entry traversal controls and exposes the current cursor position
 * and associated event.
 *
 * Coverage:
 *   - REPLAY_CURSOR_VERSION constant
 *   - emptyCursorState(): sentinel state for no-events / before-start
 *   - findLastIndexAtOrBeforeTs(): binary search (O(log n))
 *   - findFirstIndexAtOrAfterTs(): binary search forward variant
 *   - cursorAtIndex(): position at explicit index
 *   - cursorAtTs(): seek by timestamp
 *   - cursorStepForward(): advance one entry
 *   - cursorStepBackward(): retreat one entry
 *   - cursorSeekToTs(): alias for cursorAtTs
 *   - cursorSeekToIndex(): seek to explicit index
 *   - cursorSeekToStart() / cursorSeekToEnd(): boundary seeks
 *   - cursorProgress(): normalised 0..1 position
 *   - cursorRemainingEvents() / cursorElapsedEvents(): count helpers
 *   - Immutability: input events never mutated, output is new object
 *   - Edge cases: empty array, single event, out-of-range indices
 *
 * Test ID scheme:
 *   9b-N : Sub-AC 9b replay cursor
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  REPLAY_CURSOR_VERSION,
  emptyCursorState,
  findLastIndexAtOrBeforeTs,
  findFirstIndexAtOrAfterTs,
  cursorAtIndex,
  cursorAtTs,
  cursorStepForward,
  cursorStepBackward,
  cursorSeekToTs,
  cursorSeekToIndex,
  cursorSeekToStart,
  cursorSeekToEnd,
  cursorProgress,
  cursorRemainingEvents,
  cursorElapsedEvents,
  type ReplayCursorState,
} from "../replay-cursor.js";
import type { TypedReplayEvent, AgentLifecycleReplayEvent } from "../event-log-schema.js";

// ── Test helpers ────────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000; // Unix ms baseline
const STEP_MS = 500;               // 500 ms per event

let _seq = 0;
function resetSeq() { _seq = 0; }
function nextSeq()  { return ++_seq; }

/**
 * Build a minimal AgentLifecycleReplayEvent for testing.
 */
function makeEvent(agentId: string, tsMs: number): AgentLifecycleReplayEvent {
  const seq = nextSeq();
  return {
    replayCategory: "agent_lifecycle",
    raw: {
      schema:   "conitens.event.v1",
      event_id: `evt-${agentId}-${tsMs}`,
      type:     "agent.spawned",
      ts:       new Date(tsMs).toISOString(),
      run_id:   "run-test",
      actor:    { kind: "system", id: "orch" },
      payload:  { agent_id: agentId },
    },
    type:         "agent.spawned",
    ts:           new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:        { kind: "system", id: "orch" },
    run_id:       "run-test",
    agentId,
    typedPayload: { agent_id: agentId, persona: "implementer", capabilities: [] } as any,
  };
}

/**
 * Build a sorted events array of `count` events spaced by STEP_MS.
 */
function buildEvents(count: number): AgentLifecycleReplayEvent[] {
  const events: AgentLifecycleReplayEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(makeEvent(`agent-${i}`, BASE_TS + i * STEP_MS));
  }
  return events;
}

// ── 9b-1: REPLAY_CURSOR_VERSION constant ──────────────────────────────────────

describe("REPLAY_CURSOR_VERSION (9b-1)", () => {
  beforeEach(resetSeq);

  it("is a non-empty string", () => {
    expect(typeof REPLAY_CURSOR_VERSION).toBe("string");
    expect(REPLAY_CURSOR_VERSION.length).toBeGreaterThan(0);
  });

  it("follows cursor@X.Y.Z naming", () => {
    expect(REPLAY_CURSOR_VERSION).toMatch(/^cursor@\d+\.\d+\.\d+$/);
  });
});

// ── 9b-2: emptyCursorState ────────────────────────────────────────────────────

describe("emptyCursorState (9b-2)", () => {
  it("returns cursorIndex -1 (before start)", () => {
    expect(emptyCursorState().cursorIndex).toBe(-1);
  });

  it("returns null currentEvent", () => {
    expect(emptyCursorState().currentEvent).toBeNull();
  });

  it("returns cursorSeq 0", () => {
    expect(emptyCursorState().cursorSeq).toBe(0);
  });

  it("returns cursorTs 0", () => {
    expect(emptyCursorState().cursorTs).toBe(0);
  });

  it("totalEvents is 0", () => {
    expect(emptyCursorState().totalEvents).toBe(0);
  });

  it("isAtStart and isAtEnd are both true", () => {
    const s = emptyCursorState();
    expect(s.isAtStart).toBe(true);
    expect(s.isAtEnd).toBe(true);
  });

  it("isBeforeStart is true", () => {
    expect(emptyCursorState().isBeforeStart).toBe(true);
  });
});

// ── 9b-3: findLastIndexAtOrBeforeTs ──────────────────────────────────────────

describe("findLastIndexAtOrBeforeTs (9b-3)", () => {
  beforeEach(resetSeq);

  it("returns -1 for empty array", () => {
    expect(findLastIndexAtOrBeforeTs([], BASE_TS)).toBe(-1);
  });

  it("returns -1 when targetTs is before all events", () => {
    const events = buildEvents(5);
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS - 1)).toBe(-1);
  });

  it("returns last index when targetTs is after all events", () => {
    const events = buildEvents(5); // indices 0..4
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS + 999_999)).toBe(4);
  });

  it("returns 0 for targetTs exactly at first event", () => {
    const events = buildEvents(3);
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS)).toBe(0);
  });

  it("returns last index for targetTs exactly at last event", () => {
    const events = buildEvents(3); // tsMs: BASE_TS, BASE_TS+500, BASE_TS+1000
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS + 1_000)).toBe(2);
  });

  it("returns correct index for targetTs between events", () => {
    const events = buildEvents(5);
    // Between index 1 (BASE_TS+500) and index 2 (BASE_TS+1000)
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS + 750)).toBe(1);
  });

  it("returns index of exact match when targetTs == event tsMs", () => {
    const events = buildEvents(5);
    const target = BASE_TS + 2 * STEP_MS; // exactly index 2
    expect(findLastIndexAtOrBeforeTs(events, target)).toBe(2);
  });

  it("handles single-element array: ts before event → -1", () => {
    const events = [makeEvent("a1", BASE_TS + 1_000)];
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS)).toBe(-1);
  });

  it("handles single-element array: ts at event → 0", () => {
    const events = [makeEvent("a1", BASE_TS + 1_000)];
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS + 1_000)).toBe(0);
  });

  it("handles single-element array: ts after event → 0", () => {
    const events = [makeEvent("a1", BASE_TS + 1_000)];
    expect(findLastIndexAtOrBeforeTs(events, BASE_TS + 9_999)).toBe(0);
  });

  it("handles large arrays (100 events)", () => {
    const events = buildEvents(100);
    const target = BASE_TS + 37 * STEP_MS; // exactly index 37
    expect(findLastIndexAtOrBeforeTs(events, target)).toBe(37);
  });

  it("handles targetTs between last two events of large array", () => {
    const events = buildEvents(100); // indices 0..99
    const target = BASE_TS + 98 * STEP_MS + 1; // between 98 and 99
    expect(findLastIndexAtOrBeforeTs(events, target)).toBe(98);
  });
});

// ── 9b-4: findFirstIndexAtOrAfterTs ──────────────────────────────────────────

describe("findFirstIndexAtOrAfterTs (9b-4)", () => {
  beforeEach(resetSeq);

  it("returns 0 for empty array", () => {
    expect(findFirstIndexAtOrAfterTs([], BASE_TS)).toBe(0);
  });

  it("returns 0 when targetTs is at or before first event", () => {
    const events = buildEvents(3);
    expect(findFirstIndexAtOrAfterTs(events, BASE_TS)).toBe(0);
    expect(findFirstIndexAtOrAfterTs(events, BASE_TS - 999)).toBe(0);
  });

  it("returns events.length (past end) when targetTs is after all events", () => {
    const events = buildEvents(3);
    expect(findFirstIndexAtOrAfterTs(events, BASE_TS + 9_999_999)).toBe(3);
  });

  it("returns correct index for targetTs exactly at an event", () => {
    const events = buildEvents(5);
    const target = BASE_TS + 2 * STEP_MS; // index 2
    expect(findFirstIndexAtOrAfterTs(events, target)).toBe(2);
  });

  it("returns the next index when targetTs is between events", () => {
    const events = buildEvents(5);
    // Between index 1 (BASE_TS+500) and 2 (BASE_TS+1000)
    expect(findFirstIndexAtOrAfterTs(events, BASE_TS + 750)).toBe(2);
  });
});

// ── 9b-5: cursorAtIndex ───────────────────────────────────────────────────────

describe("cursorAtIndex (9b-5)", () => {
  beforeEach(resetSeq);

  it("returns before-start for empty events, any index", () => {
    const c = cursorAtIndex([], 0);
    expect(c.cursorIndex).toBe(-1);
    expect(c.currentEvent).toBeNull();
    expect(c.totalEvents).toBe(0);
  });

  it("positions at index 0 by default", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events);
    expect(c.cursorIndex).toBe(0);
    expect(c.currentEvent).toBe(events[0]);
    expect(c.cursorTs).toBe(events[0].tsMs);
    expect(c.cursorSeq).toBe(events[0].seq);
  });

  it("positions at an explicit valid index", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 3);
    expect(c.cursorIndex).toBe(3);
    expect(c.currentEvent).toBe(events[3]);
  });

  it("clamps index below -1 to -1 (before-start)", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events, -5);
    expect(c.cursorIndex).toBe(-1);
    expect(c.currentEvent).toBeNull();
    expect(c.isBeforeStart).toBe(true);
  });

  it("clamps index above last to last index", () => {
    const events = buildEvents(3); // indices 0,1,2
    const c = cursorAtIndex(events, 999);
    expect(c.cursorIndex).toBe(2);
    expect(c.currentEvent).toBe(events[2]);
  });

  it("sets isAtStart=true for index 0", () => {
    const events = buildEvents(3);
    expect(cursorAtIndex(events, 0).isAtStart).toBe(true);
  });

  it("sets isAtEnd=true for last index", () => {
    const events = buildEvents(3);
    expect(cursorAtIndex(events, 2).isAtEnd).toBe(true);
  });

  it("sets isAtStart=false and isAtEnd=false for middle index", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 2);
    expect(c.isAtStart).toBe(false);
    expect(c.isAtEnd).toBe(false);
  });

  it("sets totalEvents correctly", () => {
    const events = buildEvents(7);
    const c = cursorAtIndex(events, 2);
    expect(c.totalEvents).toBe(7);
  });

  it("positions at -1 (before-start sentinel) when index=-1", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events, -1);
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
    expect(c.currentEvent).toBeNull();
  });
});

// ── 9b-6: cursorAtTs ──────────────────────────────────────────────────────────

describe("cursorAtTs (9b-6)", () => {
  beforeEach(resetSeq);

  it("returns before-start for empty events", () => {
    const c = cursorAtTs([], BASE_TS);
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
  });

  it("returns before-start when targetTs is before all events", () => {
    const events = buildEvents(3);
    const c = cursorAtTs(events, BASE_TS - 1);
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
    expect(c.currentEvent).toBeNull();
  });

  it("returns last event when targetTs is after all events", () => {
    const events = buildEvents(3);
    const c = cursorAtTs(events, BASE_TS + 9_999_999);
    expect(c.cursorIndex).toBe(2);
    expect(c.isAtEnd).toBe(true);
  });

  it("positions at the exact matching event", () => {
    const events = buildEvents(5);
    const target = BASE_TS + 2 * STEP_MS; // exact match at index 2
    const c = cursorAtTs(events, target);
    expect(c.cursorIndex).toBe(2);
    expect(c.cursorTs).toBe(target);
    expect(c.currentEvent).toBe(events[2]);
  });

  it("positions at the last event before targetTs when between events", () => {
    const events = buildEvents(5);
    const target = BASE_TS + 2 * STEP_MS + 1; // just after index 2, before index 3
    const c = cursorAtTs(events, target);
    expect(c.cursorIndex).toBe(2);
  });

  it("positions at index 0 for targetTs exactly at first event", () => {
    const events = buildEvents(3);
    const c = cursorAtTs(events, BASE_TS);
    expect(c.cursorIndex).toBe(0);
    expect(c.isAtStart).toBe(true);
  });
});

// ── 9b-7: cursorStepForward ───────────────────────────────────────────────────

describe("cursorStepForward (9b-7)", () => {
  beforeEach(resetSeq);

  it("advances from before-start (-1) to index 0", () => {
    const events = buildEvents(3);
    const initial = cursorAtIndex(events, -1);
    const next = cursorStepForward(events, initial);
    expect(next.cursorIndex).toBe(0);
    expect(next.currentEvent).toBe(events[0]);
  });

  it("advances from index 0 to index 1", () => {
    const events = buildEvents(3);
    const start = cursorAtIndex(events, 0);
    const next = cursorStepForward(events, start);
    expect(next.cursorIndex).toBe(1);
    expect(next.currentEvent).toBe(events[1]);
  });

  it("stays at end when already at last index", () => {
    const events = buildEvents(3); // last = index 2
    const end = cursorAtIndex(events, 2);
    const next = cursorStepForward(events, end);
    expect(next.cursorIndex).toBe(2);
    expect(next.isAtEnd).toBe(true);
  });

  it("returns empty cursor for empty events", () => {
    const next = cursorStepForward([], emptyCursorState());
    expect(next.cursorIndex).toBe(-1);
    expect(next.totalEvents).toBe(0);
  });

  it("does not mutate the input cursor state", () => {
    const events = buildEvents(3);
    const cursor = cursorAtIndex(events, 1);
    const indexBefore = cursor.cursorIndex;
    cursorStepForward(events, cursor);
    expect(cursor.cursorIndex).toBe(indexBefore); // unchanged
  });

  it("sequences through all events via repeated stepForward", () => {
    const events = buildEvents(4);
    let c = cursorAtIndex(events, -1); // before start
    for (let i = 0; i < events.length; i++) {
      c = cursorStepForward(events, c);
      expect(c.cursorIndex).toBe(i);
      expect(c.currentEvent).toBe(events[i]);
    }
    // One more step stays at end
    const extra = cursorStepForward(events, c);
    expect(extra.cursorIndex).toBe(events.length - 1);
  });
});

// ── 9b-8: cursorStepBackward ──────────────────────────────────────────────────

describe("cursorStepBackward (9b-8)", () => {
  beforeEach(resetSeq);

  it("retreats from last index to second-to-last", () => {
    const events = buildEvents(3);
    const end = cursorAtIndex(events, 2);
    const prev = cursorStepBackward(events, end);
    expect(prev.cursorIndex).toBe(1);
    expect(prev.currentEvent).toBe(events[1]);
  });

  it("retreats from index 0 to -1 (before-start sentinel)", () => {
    const events = buildEvents(3);
    const first = cursorAtIndex(events, 0);
    const prev = cursorStepBackward(events, first);
    expect(prev.cursorIndex).toBe(-1);
    expect(prev.isBeforeStart).toBe(true);
    expect(prev.currentEvent).toBeNull();
  });

  it("is a no-op from before-start (-1)", () => {
    const events = buildEvents(3);
    const before = cursorAtIndex(events, -1);
    const prev = cursorStepBackward(events, before);
    expect(prev.cursorIndex).toBe(-1);
  });

  it("returns empty cursor for empty events", () => {
    const prev = cursorStepBackward([], emptyCursorState());
    expect(prev.cursorIndex).toBe(-1);
    expect(prev.totalEvents).toBe(0);
  });

  it("does not mutate the input cursor state", () => {
    const events = buildEvents(3);
    const cursor = cursorAtIndex(events, 2);
    const indexBefore = cursor.cursorIndex;
    cursorStepBackward(events, cursor);
    expect(cursor.cursorIndex).toBe(indexBefore);
  });

  it("can round-trip forward then backward", () => {
    const events = buildEvents(4);
    let c = cursorAtIndex(events, 0);
    c = cursorStepForward(events, c); // → 1
    c = cursorStepForward(events, c); // → 2
    c = cursorStepBackward(events, c); // → 1
    c = cursorStepBackward(events, c); // → 0
    c = cursorStepBackward(events, c); // → -1
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
  });
});

// ── 9b-9: cursorSeekToTs (alias for cursorAtTs) ───────────────────────────────

describe("cursorSeekToTs (9b-9)", () => {
  beforeEach(resetSeq);

  it("seeks to the correct event entry", () => {
    const events = buildEvents(5);
    const c = cursorSeekToTs(events, BASE_TS + STEP_MS);
    expect(c.cursorIndex).toBe(1);
    expect(c.currentEvent).toBe(events[1]);
  });

  it("returns same result as cursorAtTs", () => {
    const events = buildEvents(5);
    const ts = BASE_TS + 3 * STEP_MS;
    const seekResult = cursorSeekToTs(events, ts);
    const atResult   = cursorAtTs(events, ts);
    expect(seekResult.cursorIndex).toBe(atResult.cursorIndex);
    expect(seekResult.currentEvent).toBe(atResult.currentEvent);
  });
});

// ── 9b-10: cursorSeekToIndex ──────────────────────────────────────────────────

describe("cursorSeekToIndex (9b-10)", () => {
  beforeEach(resetSeq);

  it("seeks to a valid index", () => {
    const events = buildEvents(5);
    const c = cursorSeekToIndex(events, 3);
    expect(c.cursorIndex).toBe(3);
    expect(c.currentEvent).toBe(events[3]);
  });

  it("clamps negative index (below -1) to -1", () => {
    const events = buildEvents(5);
    const c = cursorSeekToIndex(events, -10);
    expect(c.cursorIndex).toBe(-1);
  });

  it("clamps index above last to last", () => {
    const events = buildEvents(5); // last = 4
    const c = cursorSeekToIndex(events, 100);
    expect(c.cursorIndex).toBe(4);
  });

  it("allows seeking to -1 (before-start sentinel) explicitly", () => {
    const events = buildEvents(3);
    const c = cursorSeekToIndex(events, -1);
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
  });
});

// ── 9b-11: cursorSeekToStart / cursorSeekToEnd ────────────────────────────────

describe("cursorSeekToStart / cursorSeekToEnd (9b-11)", () => {
  beforeEach(resetSeq);

  it("seekToStart positions at index 0", () => {
    const events = buildEvents(5);
    const c = cursorSeekToStart(events);
    expect(c.cursorIndex).toBe(0);
    expect(c.isAtStart).toBe(true);
    expect(c.currentEvent).toBe(events[0]);
  });

  it("seekToEnd positions at last index", () => {
    const events = buildEvents(5);
    const c = cursorSeekToEnd(events);
    expect(c.cursorIndex).toBe(4);
    expect(c.isAtEnd).toBe(true);
    expect(c.currentEvent).toBe(events[4]);
  });

  it("seekToStart returns before-start for empty events", () => {
    const c = cursorSeekToStart([]);
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
  });

  it("seekToEnd returns before-start for empty events", () => {
    const c = cursorSeekToEnd([]);
    expect(c.cursorIndex).toBe(-1);
  });

  it("seekToStart and seekToEnd return same cursor for single-event array", () => {
    const events = buildEvents(1);
    const start = cursorSeekToStart(events);
    const end   = cursorSeekToEnd(events);
    expect(start.cursorIndex).toBe(0);
    expect(end.cursorIndex).toBe(0);
    expect(start.isAtStart).toBe(true);
    expect(start.isAtEnd).toBe(true);
    expect(end.isAtStart).toBe(true);
    expect(end.isAtEnd).toBe(true);
  });
});

// ── 9b-12: cursorProgress ─────────────────────────────────────────────────────

describe("cursorProgress (9b-12)", () => {
  beforeEach(resetSeq);

  it("returns 0 for emptyCursorState", () => {
    expect(cursorProgress(emptyCursorState())).toBe(0);
  });

  it("returns 0 when before start (cursorIndex < 0)", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, -1);
    expect(cursorProgress(c)).toBe(0);
  });

  it("returns 0 at index 0 (first event)", () => {
    const events = buildEvents(5);
    expect(cursorProgress(cursorAtIndex(events, 0))).toBe(0);
  });

  it("returns 1 at last index", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 4);
    expect(cursorProgress(c)).toBe(1);
  });

  it("returns 0.5 at middle of even-length array", () => {
    const events = buildEvents(5); // indices 0..4; midpoint = index 2
    const c = cursorAtIndex(events, 2);
    // Progress = 2 / (5 - 1) = 0.5
    expect(cursorProgress(c)).toBeCloseTo(0.5, 5);
  });

  it("is 0 for single-event array at index 0", () => {
    const events = buildEvents(1);
    // denominator = max(1-1, 1) = 1, numerator = 0 → 0
    expect(cursorProgress(cursorAtIndex(events, 0))).toBe(0);
  });
});

// ── 9b-13: cursorRemainingEvents / cursorElapsedEvents ───────────────────────

describe("cursorRemainingEvents / cursorElapsedEvents (9b-13)", () => {
  beforeEach(resetSeq);

  it("remaining = totalEvents when before start", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, -1);
    expect(cursorRemainingEvents(c)).toBe(5);
  });

  it("remaining = 0 when at last index", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 4);
    expect(cursorRemainingEvents(c)).toBe(0);
  });

  it("remaining = 0 for empty events", () => {
    expect(cursorRemainingEvents(emptyCursorState())).toBe(0);
  });

  it("remaining decreases by 1 per stepForward", () => {
    const events = buildEvents(4);
    const c0 = cursorAtIndex(events, 0);
    const c1 = cursorStepForward(events, c0);
    expect(cursorRemainingEvents(c1)).toBe(cursorRemainingEvents(c0) - 1);
  });

  it("elapsed = 0 when before start", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, -1);
    expect(cursorElapsedEvents(c)).toBe(0);
  });

  it("elapsed = 1 at index 0 (first event applied)", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 0);
    expect(cursorElapsedEvents(c)).toBe(1);
  });

  it("elapsed = totalEvents at last index", () => {
    const events = buildEvents(5);
    const c = cursorAtIndex(events, 4);
    expect(cursorElapsedEvents(c)).toBe(5);
  });

  it("elapsed + remaining = totalEvents (invariant)", () => {
    const events = buildEvents(7);
    for (let i = 0; i < events.length; i++) {
      const c = cursorAtIndex(events, i);
      expect(cursorElapsedEvents(c) + cursorRemainingEvents(c)).toBe(events.length);
    }
  });
});

// ── 9b-14: Immutability ────────────────────────────────────────────────────────

describe("Immutability guarantees (9b-14)", () => {
  beforeEach(resetSeq);

  it("cursorStepForward returns a new object", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events, 0);
    const next = cursorStepForward(events, c);
    expect(next).not.toBe(c);
  });

  it("cursorStepBackward returns a new object", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events, 2);
    const prev = cursorStepBackward(events, c);
    expect(prev).not.toBe(c);
  });

  it("cursorAtTs does not mutate events array", () => {
    const events = buildEvents(5);
    const snapshots = events.map((e) => ({ tsMs: e.tsMs, seq: e.seq }));
    cursorAtTs(events, BASE_TS + 3 * STEP_MS);
    for (let i = 0; i < events.length; i++) {
      expect(events[i].tsMs).toBe(snapshots[i].tsMs);
      expect(events[i].seq).toBe(snapshots[i].seq);
    }
  });

  it("cursor state fields are not linked — mutations do not propagate", () => {
    const events = buildEvents(3);
    const c1 = cursorAtIndex(events, 1);
    const c2 = cursorStepForward(events, c1);
    // Sanity: they should differ
    expect(c1.cursorIndex).toBe(1);
    expect(c2.cursorIndex).toBe(2);
  });
});

// ── 9b-15: Edge cases ─────────────────────────────────────────────────────────

describe("Edge cases (9b-15)", () => {
  beforeEach(resetSeq);

  it("single-event array: stepForward from -1 reaches 0", () => {
    const events = buildEvents(1);
    const c = cursorStepForward(events, cursorAtIndex(events, -1));
    expect(c.cursorIndex).toBe(0);
    expect(c.isAtStart).toBe(true);
    expect(c.isAtEnd).toBe(true);
  });

  it("single-event array: stepBackward from 0 reaches -1", () => {
    const events = buildEvents(1);
    const c = cursorStepBackward(events, cursorAtIndex(events, 0));
    expect(c.cursorIndex).toBe(-1);
    expect(c.isBeforeStart).toBe(true);
  });

  it("two events at identical tsMs are differentiated by index", () => {
    // Build two events with the same timestamp
    const ts = BASE_TS + 1_000;
    const e0 = makeEvent("a0", ts);
    const e1 = makeEvent("a1", ts);
    const events = [e0, e1];

    // cursorAtTs should return the LAST event at that ts
    const c = cursorAtTs(events, ts);
    expect(c.cursorIndex).toBe(1); // last index at or before ts

    // Individual index access still works
    const c0 = cursorAtIndex(events, 0);
    const c1 = cursorAtIndex(events, 1);
    expect(c0.currentEvent).toBe(e0);
    expect(c1.currentEvent).toBe(e1);
  });

  it("very large array: binary search finds exact match quickly", () => {
    const LARGE = 10_000;
    const events = buildEvents(LARGE);
    const targetIdx = 7_777;
    const targetTs = BASE_TS + targetIdx * STEP_MS;
    const c = cursorAtTs(events, targetTs);
    expect(c.cursorIndex).toBe(targetIdx);
    expect(c.currentEvent).toBe(events[targetIdx]);
  });

  it("cursorAtTs with targetTs = Number.MAX_SAFE_INTEGER returns last event", () => {
    const events = buildEvents(5);
    const c = cursorAtTs(events, Number.MAX_SAFE_INTEGER);
    expect(c.isAtEnd).toBe(true);
    expect(c.cursorIndex).toBe(4);
  });

  it("cursorAtTs with targetTs = 0 returns before-start for non-zero base", () => {
    const events = buildEvents(3); // all tsMs > 1.7 trillion
    const c = cursorAtTs(events, 0);
    expect(c.isBeforeStart).toBe(true);
    expect(c.cursorIndex).toBe(-1);
  });
});

// ── 9b-16: replay_state cursor traversal completeness ─────────────────────────
// This group validates the full traversal contract required by Sub-AC 9b.

describe("replay_state cursor traversal contract (9b-16)", () => {
  beforeEach(resetSeq);

  it("play simulation: cursor can advance through all entries in order", () => {
    const COUNT = 10;
    const events = buildEvents(COUNT);
    let c: ReplayCursorState = emptyCursorState();

    // Simulate loading events and playing through all of them
    c = cursorAtIndex(events, -1); // initial "loaded" state (before start)

    const visited: TypedReplayEvent[] = [];
    while (!c.isAtEnd || c.isBeforeStart) {
      c = cursorStepForward(events, c);
      if (c.currentEvent) visited.push(c.currentEvent);
      if (c.isAtEnd) break;
    }

    expect(visited.length).toBe(COUNT);
    for (let i = 0; i < COUNT; i++) {
      expect(visited[i]).toBe(events[i]);
    }
  });

  it("seek: cursor exposes the correct event at any position", () => {
    const events = buildEvents(20);

    for (let i = 0; i < events.length; i++) {
      const c = cursorAtIndex(events, i);
      expect(c.currentEvent).toBe(events[i]);
      expect(c.cursorTs).toBe(events[i].tsMs);
      expect(c.cursorSeq).toBe(events[i].seq);
    }
  });

  it("pause: stepForward/stepBackward work independent of a play loop", () => {
    const events = buildEvents(5);
    let c = cursorAtIndex(events, 2);

    // stepForward (advance)
    c = cursorStepForward(events, c);
    expect(c.cursorIndex).toBe(3);

    // stepBackward (retreat)
    c = cursorStepBackward(events, c);
    expect(c.cursorIndex).toBe(2);
  });

  it("seekToTs: cursor exposes event associated with that position", () => {
    const events = buildEvents(10);
    const targetTs = BASE_TS + 4 * STEP_MS;
    const c = cursorSeekToTs(events, targetTs);

    // cursor should be at index 4, with the correct event
    expect(c.cursorIndex).toBe(4);
    expect(c.currentEvent).toBe(events[4]);
    expect(c.cursorTs).toBe(targetTs);
  });

  it("cursor position is observable: cursorIndex, cursorTs, cursorSeq exposed", () => {
    const events = buildEvents(3);
    const c = cursorAtIndex(events, 1);

    expect(typeof c.cursorIndex).toBe("number");
    expect(typeof c.cursorTs).toBe("number");
    expect(typeof c.cursorSeq).toBe("number");
    expect(c.cursorIndex).toBe(1);
    expect(c.cursorTs).toBe(events[1].tsMs);
    expect(c.cursorSeq).toBe(events[1].seq);
  });
});
