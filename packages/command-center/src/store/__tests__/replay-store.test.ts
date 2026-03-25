/**
 * replay-store.test.ts — Unit tests for AC 9.2: 3D scene replay store.
 *
 * Tests the Zustand replay-store state machine that drives scene playback.
 *
 * AC 9.2 coverage:
 *   - enterReplay: transitions to replay mode, sets timeline range, playhead at start
 *   - exitReplay: returns to live mode, resets playback state
 *   - play: starts playback; rewinds to start if at end; no-op in live mode
 *   - pause: stops playback
 *   - togglePlay: flip-flops between play/pause in replay mode
 *   - seekToTs: clamps to [firstEventTs, lastEventTs], updates elapsed + progress
 *   - seekToProgress: normalized seek (0..1) → seekToTs
 *   - setSpeed: clamps speed to [0.1, 16]
 *   - stepForward / stepBackward: advance/retreat by 100 ms, auto-pauses
 *   - _updatePlayhead: low-level update called by engine each frame
 *   - _refreshRange: updates timeline range, clamps playhead
 *   - REPLAY_SPEEDS: all are > 0 and monotonically increasing
 *
 * Test ID scheme:
 *   9r-N : AC 9.2 replay store
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useReplayStore,
  REPLAY_SPEEDS,
} from "../replay-store.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const FIRST_TS = 1_000_000;
const LAST_TS  = 1_010_000; // 10-second window

function resetStore() {
  useReplayStore.setState({
    mode: "live",
    playing: false,
    speed: 1,
    playheadTs: 0,
    playheadSeq: 0,
    firstEventTs: 0,
    lastEventTs: 0,
    totalLogEntries: 0,
    progress: null,
    elapsed: 0,
    duration: 0,
  });
}

function enterReplay() {
  useReplayStore.getState().enterReplay(FIRST_TS, LAST_TS, 50);
}

// ── REPLAY_SPEEDS constant ─────────────────────────────────────────────────────

describe("REPLAY_SPEEDS constant (9r-1)", () => {
  it("is a non-empty tuple", () => {
    expect(REPLAY_SPEEDS.length).toBeGreaterThan(0);
  });

  it("all speeds are positive numbers", () => {
    for (const s of REPLAY_SPEEDS) {
      expect(s).toBeGreaterThan(0);
    }
  });

  it("speeds are monotonically increasing", () => {
    for (let i = 1; i < REPLAY_SPEEDS.length; i++) {
      expect(REPLAY_SPEEDS[i]).toBeGreaterThan(REPLAY_SPEEDS[i - 1]);
    }
  });

  it("contains speed 1 (real-time)", () => {
    expect(REPLAY_SPEEDS).toContain(1);
  });
});

// ── Initial state ──────────────────────────────────────────────────────────────

describe("Initial replay store state (9r-2)", () => {
  beforeEach(resetStore);

  it("starts in live mode", () => {
    expect(useReplayStore.getState().mode).toBe("live");
  });

  it("starts not playing", () => {
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("starts with speed 1", () => {
    expect(useReplayStore.getState().speed).toBe(1);
  });

  it("progress is null in live mode", () => {
    expect(useReplayStore.getState().progress).toBeNull();
  });

  it("duration is 0 with no events", () => {
    expect(useReplayStore.getState().duration).toBe(0);
  });
});

// ── enterReplay ────────────────────────────────────────────────────────────────

describe("enterReplay (9r-3)", () => {
  beforeEach(resetStore);

  it("transitions mode to replay", () => {
    enterReplay();
    expect(useReplayStore.getState().mode).toBe("replay");
  });

  it("stores firstEventTs and lastEventTs", () => {
    enterReplay();
    const s = useReplayStore.getState();
    expect(s.firstEventTs).toBe(FIRST_TS);
    expect(s.lastEventTs).toBe(LAST_TS);
  });

  it("sets totalLogEntries", () => {
    enterReplay();
    expect(useReplayStore.getState().totalLogEntries).toBe(50);
  });

  it("positions playhead at firstEventTs", () => {
    enterReplay();
    expect(useReplayStore.getState().playheadTs).toBe(FIRST_TS);
  });

  it("sets progress to 0 (at start)", () => {
    enterReplay();
    expect(useReplayStore.getState().progress).toBe(0);
  });

  it("sets elapsed to 0", () => {
    enterReplay();
    expect(useReplayStore.getState().elapsed).toBe(0);
  });

  it("computes correct duration", () => {
    enterReplay();
    expect(useReplayStore.getState().duration).toBe(LAST_TS - FIRST_TS);
  });

  it("sets playing to false on enter", () => {
    // Should not auto-play on enter
    enterReplay();
    expect(useReplayStore.getState().playing).toBe(false);
  });
});

// ── exitReplay ─────────────────────────────────────────────────────────────────

describe("exitReplay (9r-4)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("transitions mode back to live", () => {
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().mode).toBe("live");
  });

  it("stops playback on exit", () => {
    useReplayStore.getState().play();
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("resets progress to null", () => {
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().progress).toBeNull();
  });

  it("resets elapsed to 0", () => {
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().elapsed).toBe(0);
  });

  it("resets playheadTs to 0", () => {
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().playheadTs).toBe(0);
  });
});

// ── play ───────────────────────────────────────────────────────────────────────

describe("play (9r-5)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("sets playing to true in replay mode", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
  });

  it("is a no-op in live mode", () => {
    useReplayStore.getState().exitReplay();
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("rewinds to start if playhead is at end", () => {
    // Seek to end
    useReplayStore.getState().seekToTs(LAST_TS);
    useReplayStore.getState().play();
    const s = useReplayStore.getState();
    expect(s.playheadTs).toBe(FIRST_TS);
    expect(s.playing).toBe(true);
    expect(s.progress).toBe(0);
    expect(s.elapsed).toBe(0);
  });

  it("does not rewind when playhead is in the middle", () => {
    const mid = FIRST_TS + 2_000;
    useReplayStore.getState().seekToTs(mid);
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playheadTs).toBe(mid);
  });
});

// ── pause ──────────────────────────────────────────────────────────────────────

describe("pause (9r-6)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("stops playback", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("is safe to call when already paused", () => {
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);
  });
});

// ── togglePlay ─────────────────────────────────────────────────────────────────

describe("togglePlay (9r-7)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("starts playing when paused", () => {
    expect(useReplayStore.getState().playing).toBe(false);
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(true);
  });

  it("pauses when playing", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("is a no-op in live mode", () => {
    useReplayStore.getState().exitReplay();
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(false);
  });
});

// ── seekToTs ───────────────────────────────────────────────────────────────────

describe("seekToTs (9r-8)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("sets playheadTs to the given timestamp", () => {
    const target = FIRST_TS + 3_000;
    useReplayStore.getState().seekToTs(target);
    expect(useReplayStore.getState().playheadTs).toBe(target);
  });

  it("clamps to firstEventTs when seeking before start", () => {
    useReplayStore.getState().seekToTs(FIRST_TS - 99_999);
    expect(useReplayStore.getState().playheadTs).toBe(FIRST_TS);
  });

  it("clamps to lastEventTs when seeking past end", () => {
    useReplayStore.getState().seekToTs(LAST_TS + 99_999);
    expect(useReplayStore.getState().playheadTs).toBe(LAST_TS);
  });

  it("computes correct elapsed from firstEventTs", () => {
    const target = FIRST_TS + 4_000;
    useReplayStore.getState().seekToTs(target);
    expect(useReplayStore.getState().elapsed).toBe(4_000);
  });

  it("computes correct progress (0..1)", () => {
    const midTs = FIRST_TS + (LAST_TS - FIRST_TS) / 2;
    useReplayStore.getState().seekToTs(midTs);
    const { progress } = useReplayStore.getState();
    expect(progress).toBeCloseTo(0.5, 5);
  });

  it("progress is 0 when at firstEventTs", () => {
    useReplayStore.getState().seekToTs(FIRST_TS);
    expect(useReplayStore.getState().progress).toBe(0);
  });

  it("progress is 1 when at lastEventTs", () => {
    useReplayStore.getState().seekToTs(LAST_TS);
    expect(useReplayStore.getState().progress).toBe(1);
  });
});

// ── seekToProgress ─────────────────────────────────────────────────────────────

describe("seekToProgress (9r-9)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("maps 0 to firstEventTs", () => {
    useReplayStore.getState().seekToProgress(0);
    expect(useReplayStore.getState().playheadTs).toBe(FIRST_TS);
  });

  it("maps 1 to lastEventTs", () => {
    useReplayStore.getState().seekToProgress(1);
    expect(useReplayStore.getState().playheadTs).toBe(LAST_TS);
  });

  it("maps 0.5 to midpoint", () => {
    useReplayStore.getState().seekToProgress(0.5);
    const expected = FIRST_TS + (LAST_TS - FIRST_TS) * 0.5;
    expect(useReplayStore.getState().playheadTs).toBeCloseTo(expected, 0);
  });

  it("clamps progress > 1 to 1", () => {
    useReplayStore.getState().seekToProgress(2.5);
    expect(useReplayStore.getState().playheadTs).toBe(LAST_TS);
  });

  it("clamps progress < 0 to 0", () => {
    useReplayStore.getState().seekToProgress(-0.5);
    expect(useReplayStore.getState().playheadTs).toBe(FIRST_TS);
  });
});

// ── setSpeed ───────────────────────────────────────────────────────────────────

describe("setSpeed (9r-10)", () => {
  beforeEach(resetStore);

  it("sets speed for a valid value (e.g., 2)", () => {
    useReplayStore.getState().setSpeed(2);
    expect(useReplayStore.getState().speed).toBe(2);
  });

  it("clamps speed below 0.1 to 0.1", () => {
    useReplayStore.getState().setSpeed(0);
    expect(useReplayStore.getState().speed).toBeCloseTo(0.1, 5);
  });

  it("clamps speed above 16 to 16", () => {
    useReplayStore.getState().setSpeed(100);
    expect(useReplayStore.getState().speed).toBe(16);
  });

  it("all REPLAY_SPEEDS are within [0.1, 16]", () => {
    for (const s of REPLAY_SPEEDS) {
      expect(s).toBeGreaterThanOrEqual(0.1);
      expect(s).toBeLessThanOrEqual(16);
    }
  });
});

// ── stepForward ────────────────────────────────────────────────────────────────

describe("stepForward (9r-11)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
    useReplayStore.getState().seekToTs(FIRST_TS + 1_000);
  });

  it("advances playhead by 100 ms", () => {
    const before = useReplayStore.getState().playheadTs;
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().playheadTs).toBe(before + 100);
  });

  it("auto-pauses playback", () => {
    useReplayStore.getState().play();
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("clamps at lastEventTs", () => {
    useReplayStore.getState().seekToTs(LAST_TS - 50);
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().playheadTs).toBe(LAST_TS);
  });

  it("updates progress after step", () => {
    useReplayStore.getState().seekToTs(FIRST_TS);
    useReplayStore.getState().stepForward();
    const { progress, duration } = useReplayStore.getState();
    expect(progress).toBeCloseTo(100 / duration, 5);
  });

  it("is a no-op in live mode (mode check)", () => {
    useReplayStore.getState().exitReplay();
    const before = useReplayStore.getState().playheadTs;
    useReplayStore.getState().stepForward();
    // playheadTs stays 0 in live mode
    expect(useReplayStore.getState().playheadTs).toBe(before);
  });
});

// ── stepBackward ───────────────────────────────────────────────────────────────

describe("stepBackward (9r-12)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
    useReplayStore.getState().seekToTs(FIRST_TS + 5_000);
  });

  it("retreats playhead by 100 ms", () => {
    const before = useReplayStore.getState().playheadTs;
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().playheadTs).toBe(before - 100);
  });

  it("auto-pauses playback", () => {
    useReplayStore.getState().play();
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("clamps at firstEventTs", () => {
    useReplayStore.getState().seekToTs(FIRST_TS + 50);
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().playheadTs).toBe(FIRST_TS);
  });
});

// ── _updatePlayhead ────────────────────────────────────────────────────────────

describe("_updatePlayhead (9r-13)", () => {
  beforeEach(() => {
    resetStore();
    enterReplay();
  });

  it("sets playheadTs and playheadSeq", () => {
    const ts = FIRST_TS + 7_000;
    useReplayStore.getState()._updatePlayhead(ts, 42);
    const s = useReplayStore.getState();
    expect(s.playheadTs).toBe(ts);
    expect(s.playheadSeq).toBe(42);
  });

  it("computes elapsed correctly", () => {
    useReplayStore.getState()._updatePlayhead(FIRST_TS + 2_500, 10);
    expect(useReplayStore.getState().elapsed).toBe(2_500);
  });

  it("computes progress correctly", () => {
    const halfTs = FIRST_TS + (LAST_TS - FIRST_TS) / 2;
    useReplayStore.getState()._updatePlayhead(halfTs, 25);
    expect(useReplayStore.getState().progress).toBeCloseTo(0.5, 5);
  });
});

// ── _refreshRange ──────────────────────────────────────────────────────────────

describe("_refreshRange (9r-14)", () => {
  beforeEach(resetStore);

  it("updates firstEventTs, lastEventTs, totalLogEntries", () => {
    useReplayStore.getState()._refreshRange(2_000_000, 2_005_000, 99);
    const s = useReplayStore.getState();
    expect(s.firstEventTs).toBe(2_000_000);
    expect(s.lastEventTs).toBe(2_005_000);
    expect(s.totalLogEntries).toBe(99);
  });

  it("computes duration from the new range", () => {
    useReplayStore.getState()._refreshRange(2_000_000, 2_005_000, 99);
    expect(useReplayStore.getState().duration).toBe(5_000);
  });

  it("clamps playhead into new range when playhead was before range", () => {
    // playheadTs starts at 0, below new range
    useReplayStore.getState()._refreshRange(2_000_000, 2_005_000, 99);
    expect(useReplayStore.getState().playheadTs).toBe(2_000_000);
  });

  it("clamps playhead when it was above the new range", () => {
    enterReplay(); // sets playheadTs = FIRST_TS = 1_000_000
    useReplayStore.getState().seekToTs(LAST_TS + 5_000); // will be clamped to LAST_TS
    // Now shrink range so current playhead is beyond it
    useReplayStore.getState()._refreshRange(FIRST_TS, FIRST_TS + 1_000, 10);
    expect(useReplayStore.getState().playheadTs).toBeLessThanOrEqual(FIRST_TS + 1_000);
  });

  it("duration is 0 for a zero-width range (same ts)", () => {
    useReplayStore.getState()._refreshRange(5_000, 5_000, 1);
    expect(useReplayStore.getState().duration).toBe(0);
  });
});

// ── Round-trip: enterReplay → seek → exitReplay ────────────────────────────────

describe("Replay round-trip (9r-15)", () => {
  it("round-trip enterReplay → play → seek → pause → exitReplay returns to live", () => {
    resetStore();
    const store = useReplayStore.getState;

    // Enter replay
    store().enterReplay(FIRST_TS, LAST_TS, 100);
    expect(store().mode).toBe("replay");

    // Start playing
    store().play();
    expect(store().playing).toBe(true);

    // Seek to mid
    store().seekToTs(FIRST_TS + 5_000);
    expect(store().progress).toBeCloseTo(0.5, 2);

    // Pause
    store().pause();
    expect(store().playing).toBe(false);

    // Exit replay
    store().exitReplay();
    expect(store().mode).toBe("live");
    expect(store().progress).toBeNull();
    expect(store().playing).toBe(false);
  });
});
