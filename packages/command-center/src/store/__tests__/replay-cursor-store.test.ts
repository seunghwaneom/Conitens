/**
 * replay-cursor-store.test.ts — Unit tests for Sub-AC 9b cursor store.
 *
 * Validates the Zustand replay-cursor-store which wraps the pure cursor
 * logic and provides reactive traversal controls to React components.
 *
 * Coverage:
 *   - REPLAY_CURSOR_STORE_VERSION constant
 *   - Initial state: cursor at before-start, isReady=false
 *   - loadCursorEvents(): loads events, resets cursor, sets isReady
 *   - stepForward(): advances cursor by one event entry
 *   - stepBackward(): retreats cursor by one event entry
 *   - seekToTs(): seeks by timestamp (binary search)
 *   - seekToIndex(): seeks to explicit index
 *   - seekToStart() / seekToEnd(): boundary seeks
 *   - reset(): clears events and returns to initial state
 *   - getCursorEvents(): returns loaded events array
 *   - No-ops in unready state
 *
 * Test ID scheme:
 *   9bs-N : Sub-AC 9b cursor store
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useReplayCursorStore,
  REPLAY_CURSOR_STORE_VERSION,
  getCursorEvents,
} from "../replay-cursor-store.js";
import type { AgentLifecycleReplayEvent } from "../../replay/event-log-schema.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000;
const STEP_MS = 500;

let _seq = 0;
function resetSeq() { _seq = 0; }
function nextSeq()  { return ++_seq; }

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

function buildEvents(count: number): AgentLifecycleReplayEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent(`agent-${i}`, BASE_TS + i * STEP_MS),
  );
}

function resetStore() {
  useReplayCursorStore.getState().reset();
  resetSeq();
}

// ── 9bs-1: REPLAY_CURSOR_STORE_VERSION ────────────────────────────────────────

describe("REPLAY_CURSOR_STORE_VERSION (9bs-1)", () => {
  it("is a non-empty string", () => {
    expect(typeof REPLAY_CURSOR_STORE_VERSION).toBe("string");
    expect(REPLAY_CURSOR_STORE_VERSION.length).toBeGreaterThan(0);
  });

  it("follows cursor-store@X.Y.Z format", () => {
    expect(REPLAY_CURSOR_STORE_VERSION).toMatch(/^cursor-store@\d+\.\d+\.\d+$/);
  });
});

// ── 9bs-2: Initial state ──────────────────────────────────────────────────────

describe("Initial state (9bs-2)", () => {
  beforeEach(resetStore);

  it("cursor is at before-start (-1)", () => {
    const s = useReplayCursorStore.getState();
    expect(s.cursor.cursorIndex).toBe(-1);
    expect(s.cursor.isBeforeStart).toBe(true);
  });

  it("currentEvent is null initially", () => {
    const s = useReplayCursorStore.getState();
    expect(s.cursor.currentEvent).toBeNull();
  });

  it("isReady is false initially", () => {
    expect(useReplayCursorStore.getState().isReady).toBe(false);
  });

  it("totalEvents is 0 initially", () => {
    expect(useReplayCursorStore.getState().totalEvents).toBe(0);
  });
});

// ── 9bs-3: loadCursorEvents ───────────────────────────────────────────────────

describe("loadCursorEvents (9bs-3)", () => {
  beforeEach(resetStore);

  it("sets isReady to true after loading events", () => {
    const events = buildEvents(5);
    useReplayCursorStore.getState().loadCursorEvents(events);
    expect(useReplayCursorStore.getState().isReady).toBe(true);
  });

  it("sets totalEvents to the array length", () => {
    const events = buildEvents(7);
    useReplayCursorStore.getState().loadCursorEvents(events);
    expect(useReplayCursorStore.getState().totalEvents).toBe(7);
  });

  it("resets cursor to before-start (-1) after load", () => {
    // First load and advance cursor
    const events1 = buildEvents(3);
    useReplayCursorStore.getState().loadCursorEvents(events1);
    useReplayCursorStore.getState().stepForward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(0);

    // Reload with new events — cursor should reset
    const events2 = buildEvents(5);
    useReplayCursorStore.getState().loadCursorEvents(events2);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });

  it("isReady is false when loading an empty array", () => {
    useReplayCursorStore.getState().loadCursorEvents([]);
    expect(useReplayCursorStore.getState().isReady).toBe(false);
    expect(useReplayCursorStore.getState().totalEvents).toBe(0);
  });

  it("getCursorEvents returns the loaded array", () => {
    const events = buildEvents(4);
    useReplayCursorStore.getState().loadCursorEvents(events);
    const loaded = getCursorEvents();
    expect(loaded).toBe(events); // same reference
  });
});

// ── 9bs-4: stepForward ───────────────────────────────────────────────────────

describe("stepForward (9bs-4)", () => {
  beforeEach(() => {
    resetStore();
    const events = buildEvents(5);
    useReplayCursorStore.getState().loadCursorEvents(events);
  });

  it("advances from before-start to index 0", () => {
    useReplayCursorStore.getState().stepForward();
    const s = useReplayCursorStore.getState();
    expect(s.cursor.cursorIndex).toBe(0);
    expect(s.cursor.isBeforeStart).toBe(false);
  });

  it("advances from index 0 to index 1", () => {
    useReplayCursorStore.getState().stepForward(); // → 0
    useReplayCursorStore.getState().stepForward(); // → 1
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(1);
  });

  it("cursor.currentEvent is set after step", () => {
    const events = getCursorEvents();
    useReplayCursorStore.getState().stepForward();
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.currentEvent).not.toBeNull();
    expect(cursor.currentEvent).toBe(events[0]);
  });

  it("stays at end when already at last event", () => {
    // Seek to end first
    useReplayCursorStore.getState().seekToEnd();
    const endIndex = useReplayCursorStore.getState().cursor.cursorIndex;
    useReplayCursorStore.getState().stepForward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(endIndex);
  });

  it("is a no-op when not ready", () => {
    useReplayCursorStore.getState().reset(); // clears events → not ready
    useReplayCursorStore.getState().stepForward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });
});

// ── 9bs-5: stepBackward ──────────────────────────────────────────────────────

describe("stepBackward (9bs-5)", () => {
  beforeEach(() => {
    resetStore();
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(5));
  });

  it("is a no-op when before start", () => {
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
    useReplayCursorStore.getState().stepBackward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });

  it("retreats from index 0 to before-start (-1)", () => {
    useReplayCursorStore.getState().stepForward(); // → 0
    useReplayCursorStore.getState().stepBackward(); // → -1
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.cursorIndex).toBe(-1);
    expect(cursor.isBeforeStart).toBe(true);
    expect(cursor.currentEvent).toBeNull();
  });

  it("retreats from last to second-to-last", () => {
    useReplayCursorStore.getState().seekToEnd();
    const endIdx = useReplayCursorStore.getState().cursor.cursorIndex; // 4
    useReplayCursorStore.getState().stepBackward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(endIdx - 1);
  });

  it("is a no-op when not ready", () => {
    useReplayCursorStore.getState().reset();
    useReplayCursorStore.getState().stepBackward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });
});

// ── 9bs-6: seekToTs ──────────────────────────────────────────────────────────

describe("seekToTs (9bs-6)", () => {
  beforeEach(() => {
    resetStore();
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(10));
  });

  it("seeks to the correct event entry by timestamp", () => {
    const target = BASE_TS + 3 * STEP_MS; // index 3
    useReplayCursorStore.getState().seekToTs(target);
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.cursorIndex).toBe(3);
    expect(cursor.cursorTs).toBe(target);
    expect(cursor.currentEvent).not.toBeNull();
    expect(cursor.currentEvent!.tsMs).toBe(target);
  });

  it("positions before-start when targetTs is before all events", () => {
    useReplayCursorStore.getState().seekToTs(0);
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.isBeforeStart).toBe(true);
    expect(cursor.currentEvent).toBeNull();
  });

  it("positions at end when targetTs is after all events", () => {
    useReplayCursorStore.getState().seekToTs(Number.MAX_SAFE_INTEGER);
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.isAtEnd).toBe(true);
  });

  it("is a no-op when not ready", () => {
    useReplayCursorStore.getState().reset();
    useReplayCursorStore.getState().seekToTs(BASE_TS + 1_000);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });
});

// ── 9bs-7: seekToIndex ───────────────────────────────────────────────────────

describe("seekToIndex (9bs-7)", () => {
  beforeEach(() => {
    resetStore();
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(5));
  });

  it("seeks to a valid index", () => {
    useReplayCursorStore.getState().seekToIndex(3);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(3);
  });

  it("clamps out-of-range index", () => {
    useReplayCursorStore.getState().seekToIndex(999);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(4); // last
  });

  it("allows seeking to -1 (before-start)", () => {
    useReplayCursorStore.getState().seekToIndex(3);
    useReplayCursorStore.getState().seekToIndex(-1);
    expect(useReplayCursorStore.getState().cursor.isBeforeStart).toBe(true);
  });

  it("is a no-op when not ready", () => {
    useReplayCursorStore.getState().reset();
    useReplayCursorStore.getState().seekToIndex(2);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });
});

// ── 9bs-8: seekToStart / seekToEnd ───────────────────────────────────────────

describe("seekToStart / seekToEnd (9bs-8)", () => {
  beforeEach(() => {
    resetStore();
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(5));
  });

  it("seekToStart positions at index 0", () => {
    useReplayCursorStore.getState().seekToIndex(3);
    useReplayCursorStore.getState().seekToStart();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(0);
    expect(useReplayCursorStore.getState().cursor.isAtStart).toBe(true);
  });

  it("seekToEnd positions at last index (4 for 5 events)", () => {
    useReplayCursorStore.getState().seekToEnd();
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.cursorIndex).toBe(4);
    expect(cursor.isAtEnd).toBe(true);
  });

  it("seekToStart is no-op when not ready", () => {
    useReplayCursorStore.getState().reset();
    useReplayCursorStore.getState().seekToStart();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });

  it("seekToEnd is no-op when not ready", () => {
    useReplayCursorStore.getState().reset();
    useReplayCursorStore.getState().seekToEnd();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(-1);
  });
});

// ── 9bs-9: reset ─────────────────────────────────────────────────────────────

describe("reset (9bs-9)", () => {
  beforeEach(resetStore);

  it("sets isReady to false", () => {
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(3));
    expect(useReplayCursorStore.getState().isReady).toBe(true);
    useReplayCursorStore.getState().reset();
    expect(useReplayCursorStore.getState().isReady).toBe(false);
  });

  it("sets totalEvents to 0", () => {
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(3));
    useReplayCursorStore.getState().reset();
    expect(useReplayCursorStore.getState().totalEvents).toBe(0);
  });

  it("returns cursor to before-start", () => {
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(3));
    useReplayCursorStore.getState().seekToEnd();
    useReplayCursorStore.getState().reset();
    const { cursor } = useReplayCursorStore.getState();
    expect(cursor.cursorIndex).toBe(-1);
    expect(cursor.currentEvent).toBeNull();
    expect(cursor.isBeforeStart).toBe(true);
  });

  it("getCursorEvents returns empty array after reset", () => {
    useReplayCursorStore.getState().loadCursorEvents(buildEvents(3));
    useReplayCursorStore.getState().reset();
    expect(getCursorEvents().length).toBe(0);
  });
});

// ── 9bs-10: Full traversal integration ───────────────────────────────────────

describe("Full traversal integration (9bs-10)", () => {
  beforeEach(resetStore);

  it("can traverse all events with stepForward", () => {
    const COUNT = 8;
    const events = buildEvents(COUNT);
    useReplayCursorStore.getState().loadCursorEvents(events);

    const visited: number[] = [];

    // Start before-start, step forward COUNT times
    for (let i = 0; i < COUNT; i++) {
      useReplayCursorStore.getState().stepForward();
      const { cursor } = useReplayCursorStore.getState();
      expect(cursor.currentEvent).not.toBeNull();
      visited.push(cursor.cursorIndex);
    }

    // After COUNT steps, cursor should be at last event (isAtEnd)
    expect(useReplayCursorStore.getState().cursor.isAtEnd).toBe(true);

    expect(visited.length).toBe(COUNT);
    for (let i = 0; i < COUNT; i++) {
      expect(visited[i]).toBe(i);
    }
  });

  it("seek → step → step round-trip", () => {
    const events = buildEvents(10);
    useReplayCursorStore.getState().loadCursorEvents(events);

    // Seek to middle
    useReplayCursorStore.getState().seekToIndex(5);
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(5);

    // Step forward
    useReplayCursorStore.getState().stepForward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(6);

    // Step backward
    useReplayCursorStore.getState().stepBackward();
    expect(useReplayCursorStore.getState().cursor.cursorIndex).toBe(5);
  });

  it("cursor.currentEvent matches the event at cursorIndex", () => {
    const events = buildEvents(5);
    useReplayCursorStore.getState().loadCursorEvents(events);

    for (let i = 0; i < events.length; i++) {
      useReplayCursorStore.getState().seekToIndex(i);
      const { cursor } = useReplayCursorStore.getState();
      expect(cursor.currentEvent).toBe(events[i]);
      expect(cursor.cursorTs).toBe(events[i].tsMs);
      expect(cursor.cursorSeq).toBe(events[i].seq);
    }
  });

  it("playback-style: cursor exposes current entry after each stepForward", () => {
    const events = buildEvents(4);
    useReplayCursorStore.getState().loadCursorEvents(events);

    const exposed: { index: number; ts: number; seq: number }[] = [];

    for (let i = 0; i < events.length; i++) {
      useReplayCursorStore.getState().stepForward();
      const { cursor } = useReplayCursorStore.getState();
      exposed.push({
        index: cursor.cursorIndex,
        ts:    cursor.cursorTs,
        seq:   cursor.cursorSeq,
      });
    }

    expect(exposed.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(exposed[i].index).toBe(i);
      expect(exposed[i].ts).toBe(events[i].tsMs);
      expect(exposed[i].seq).toBe(events[i].seq);
    }
  });
});
