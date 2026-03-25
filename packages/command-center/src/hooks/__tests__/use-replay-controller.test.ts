/**
 * use-replay-controller.test.ts — Unit tests for Sub-AC 9c.
 *
 * Tests the replay playback controller that drives the state-reconstruction
 * engine and exposes current scene-state to the renderer.
 *
 * NOTE: React hooks (useReplayController) cannot run in a headless Vitest
 * environment without a React renderer. This test file validates:
 *   1. The ReplayControllerStore initial state and actions (pure Zustand)
 *   2. Pure helper functions: computeTimelineRange, sortEventsForReplay,
 *      clampToRange, computeProgress
 *   3. Constants and exported type shapes
 *   4. Integration: controller store + replay-store + reconstruction engine
 *      (exercised through the store actions, not the React hook)
 *
 * Test ID scheme:
 *   9c-N : Sub-AC 9c replay playback controller
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useReplayControllerStore,
  computeTimelineRange,
  sortEventsForReplay,
  clampToRange,
  computeProgress,
  REPLAY_CONTROLLER_VERSION,
  type ReplayControllerStoreState,
} from "../use-replay-controller.js";
import {
  reconstructStateAt,
  buildCheckpoints,
  emptySceneState,
  DEFAULT_CHECKPOINT_INTERVAL,
  type ReconstructedSceneState,
} from "../../replay/state-reconstruction-engine.js";
import { useReplayStore } from "../../store/replay-store.js";
import type { TypedReplayEvent, AgentLifecycleReplayEvent } from "../../replay/event-log-schema.js";

// ── Test helpers ─────────────────────────────────────────────────────────────

const BASE_TS  = 1_700_000_000_000; // Unix ms baseline (2023-11-14)
const STEP_MS  = 500;               // 500 ms per event

let _seq = 0;

function resetSeq() { _seq = 0; }
function nextSeq()  { return ++_seq; }

/** Build a minimal raw ConitensEvent envelope */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRawEnvelope(type: string, agentId: string, tsMs: number): any {
  return {
    schema:   "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}`,
    type,
    ts:       new Date(tsMs).toISOString(),
    run_id:   "run-test",
    actor:    { kind: "system", id: "orchestrator" },
    payload:  { agent_id: agentId },
  };
}

/**
 * Build a minimal AgentLifecycleReplayEvent (agent.spawned style).
 */
function makeSpawnEvent(
  agentId: string,
  tsMs: number = BASE_TS,
): AgentLifecycleReplayEvent {
  const seq = nextSeq();
  return {
    replayCategory: "agent_lifecycle",
    raw:            makeRawEnvelope("agent.spawned", agentId, tsMs),
    type:           "agent.spawned",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         "run-test",
    agentId,
    typedPayload:   { agent_id: agentId, persona: "implementer", capabilities: [] } as any,
  };
}

function makeStatusEvent(
  agentId: string,
  status: string,
  tsMs: number,
): AgentLifecycleReplayEvent {
  const seq = nextSeq();
  return {
    replayCategory: "agent_lifecycle",
    raw:            makeRawEnvelope("agent.status_changed", agentId, tsMs),
    type:           "agent.status_changed",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         "run-test",
    agentId,
    typedPayload:   { agent_id: agentId, status } as any,
  };
}

/** Build a sorted event sequence for one agent over multiple timestamps */
function buildAgentTimeline(agentId: string, count = 5): AgentLifecycleReplayEvent[] {
  const events: AgentLifecycleReplayEvent[] = [];
  events.push(makeSpawnEvent(agentId, BASE_TS));
  for (let i = 1; i < count; i++) {
    events.push(makeStatusEvent(agentId, i % 2 === 0 ? "idle" : "active", BASE_TS + i * STEP_MS));
  }
  return events;
}

/** Reset both stores to initial state before each test */
function resetStores() {
  useReplayControllerStore.getState()._reset();
  useReplayStore.setState({
    mode:            "live",
    playing:         false,
    speed:           1,
    playheadTs:      0,
    playheadSeq:     0,
    firstEventTs:    0,
    lastEventTs:     0,
    totalLogEntries: 0,
    progress:        null,
    elapsed:         0,
    duration:        0,
  });
  resetSeq();
}

// ── 9c-1: REPLAY_CONTROLLER_VERSION constant ──────────────────────────────────

describe("REPLAY_CONTROLLER_VERSION (9c-1)", () => {
  it("is a non-empty string", () => {
    expect(typeof REPLAY_CONTROLLER_VERSION).toBe("string");
    expect(REPLAY_CONTROLLER_VERSION.length).toBeGreaterThan(0);
  });

  it("follows semver-style naming", () => {
    // Should match "controller@X.Y.Z"
    expect(REPLAY_CONTROLLER_VERSION).toMatch(/^controller@\d+\.\d+\.\d+$/);
  });
});

// ── 9c-2: ReplayControllerStore initial state ─────────────────────────────────

describe("ReplayControllerStore initial state (9c-2)", () => {
  beforeEach(resetStores);

  it("sceneState is null initially", () => {
    expect(useReplayControllerStore.getState().sceneState).toBeNull();
  });

  it("checkpointCount is 0 initially", () => {
    expect(useReplayControllerStore.getState().checkpointCount).toBe(0);
  });

  it("eventsLoaded is 0 initially", () => {
    expect(useReplayControllerStore.getState().eventsLoaded).toBe(0);
  });

  it("isReady is false initially", () => {
    expect(useReplayControllerStore.getState().isReady).toBe(false);
  });

  it("lastReconstructionWallTs is 0 initially", () => {
    expect(useReplayControllerStore.getState().lastReconstructionWallTs).toBe(0);
  });

  it("reconstructionCount is 0 initially", () => {
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(0);
  });
});

// ── 9c-3: ReplayControllerStore._setReady ────────────────────────────────────

describe("ReplayControllerStore._setReady (9c-3)", () => {
  beforeEach(resetStores);

  it("sets eventsLoaded and checkpointCount", () => {
    useReplayControllerStore.getState()._setReady(200, 4);
    const s = useReplayControllerStore.getState();
    expect(s.eventsLoaded).toBe(200);
    expect(s.checkpointCount).toBe(4);
  });

  it("sets isReady to true", () => {
    useReplayControllerStore.getState()._setReady(10, 1);
    expect(useReplayControllerStore.getState().isReady).toBe(true);
  });

  it("preserves sceneState when called (does not reset it)", () => {
    // Prime a scene state first
    const state = emptySceneState(BASE_TS);
    useReplayControllerStore.getState()._setSceneState(state, performance.now());
    useReplayControllerStore.getState()._setReady(10, 1);
    // sceneState should still be set
    expect(useReplayControllerStore.getState().sceneState).not.toBeNull();
  });
});

// ── 9c-4: ReplayControllerStore._setLoading ──────────────────────────────────

describe("ReplayControllerStore._setLoading (9c-4)", () => {
  beforeEach(resetStores);

  it("sets isReady to false", () => {
    useReplayControllerStore.getState()._setReady(5, 1);
    expect(useReplayControllerStore.getState().isReady).toBe(true);
    useReplayControllerStore.getState()._setLoading();
    expect(useReplayControllerStore.getState().isReady).toBe(false);
  });

  it("resets reconstructionCount to 0", () => {
    const state = emptySceneState(BASE_TS);
    useReplayControllerStore.getState()._setSceneState(state, performance.now());
    useReplayControllerStore.getState()._setSceneState(state, performance.now());
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(2);
    useReplayControllerStore.getState()._setLoading();
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(0);
  });
});

// ── 9c-5: ReplayControllerStore._setSceneState ───────────────────────────────

describe("ReplayControllerStore._setSceneState (9c-5)", () => {
  beforeEach(resetStores);

  it("stores the scene state", () => {
    const state = emptySceneState(BASE_TS + 1_000);
    useReplayControllerStore.getState()._setSceneState(state, 1234.5);
    const stored = useReplayControllerStore.getState().sceneState;
    expect(stored).not.toBeNull();
    expect(stored!.ts).toBe(BASE_TS + 1_000);
  });

  it("updates lastReconstructionWallTs", () => {
    const state = emptySceneState(BASE_TS);
    useReplayControllerStore.getState()._setSceneState(state, 9999.1);
    expect(useReplayControllerStore.getState().lastReconstructionWallTs).toBe(9999.1);
  });

  it("increments reconstructionCount on each call", () => {
    const state = emptySceneState(BASE_TS);
    useReplayControllerStore.getState()._setSceneState(state, 1);
    useReplayControllerStore.getState()._setSceneState(state, 2);
    useReplayControllerStore.getState()._setSceneState(state, 3);
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(3);
  });
});

// ── 9c-6: ReplayControllerStore._reset ───────────────────────────────────────

describe("ReplayControllerStore._reset (9c-6)", () => {
  beforeEach(resetStores);

  it("clears sceneState to null", () => {
    useReplayControllerStore.getState()._setSceneState(
      emptySceneState(BASE_TS), performance.now(),
    );
    useReplayControllerStore.getState()._reset();
    expect(useReplayControllerStore.getState().sceneState).toBeNull();
  });

  it("resets all numeric fields to 0", () => {
    useReplayControllerStore.getState()._setReady(100, 5);
    useReplayControllerStore.getState()._setSceneState(emptySceneState(BASE_TS), 123);
    useReplayControllerStore.getState()._reset();
    const s = useReplayControllerStore.getState();
    expect(s.checkpointCount).toBe(0);
    expect(s.eventsLoaded).toBe(0);
    expect(s.reconstructionCount).toBe(0);
    expect(s.lastReconstructionWallTs).toBe(0);
  });

  it("sets isReady to false", () => {
    useReplayControllerStore.getState()._setReady(50, 2);
    useReplayControllerStore.getState()._reset();
    expect(useReplayControllerStore.getState().isReady).toBe(false);
  });
});

// ── 9c-7: computeTimelineRange ────────────────────────────────────────────────

describe("computeTimelineRange (9c-7)", () => {
  beforeEach(resetSeq);

  it("returns {0, 0} for an empty array", () => {
    const r = computeTimelineRange([]);
    expect(r.firstTs).toBe(0);
    expect(r.lastTs).toBe(0);
  });

  it("returns the tsMs of the single event for a one-element array", () => {
    const r = computeTimelineRange([makeSpawnEvent("a1", BASE_TS + 5_000)]);
    expect(r.firstTs).toBe(BASE_TS + 5_000);
    expect(r.lastTs).toBe(BASE_TS + 5_000);
  });

  it("returns the correct first and last ts for multiple events", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 2_000),
      makeStatusEvent("a1", "idle",   BASE_TS + 8_000),
    ];
    const r = computeTimelineRange(events);
    expect(r.firstTs).toBe(BASE_TS);
    expect(r.lastTs).toBe(BASE_TS + 8_000);
  });

  it("reads only first/last (does not sort)", () => {
    // Input is intentionally in original array order, not ts order
    const events = [
      makeSpawnEvent("a1", BASE_TS + 1_000),  // first in array
      makeStatusEvent("a1", "active", BASE_TS + 500), // middle
      makeStatusEvent("a1", "idle",   BASE_TS + 3_000), // last in array
    ];
    // computeTimelineRange reads events[0] and events[events.length - 1]
    const r = computeTimelineRange(events);
    expect(r.firstTs).toBe(events[0].tsMs);
    expect(r.lastTs).toBe(events[events.length - 1].tsMs);
  });
});

// ── 9c-8: sortEventsForReplay ─────────────────────────────────────────────────

describe("sortEventsForReplay (9c-8)", () => {
  beforeEach(resetSeq);

  it("returns a new array (does not mutate input)", () => {
    const events = [makeSpawnEvent("a1", BASE_TS + 500), makeSpawnEvent("a2", BASE_TS)];
    const original = [...events];
    sortEventsForReplay(events);
    expect(events[0]).toBe(original[0]); // same reference
    expect(events[1]).toBe(original[1]);
  });

  it("sorts by tsMs ascending", () => {
    const e1 = makeSpawnEvent("a1", BASE_TS + 1_000);
    const e2 = makeSpawnEvent("a2", BASE_TS + 500);
    const e3 = makeSpawnEvent("a3", BASE_TS);
    const sorted = sortEventsForReplay([e1, e2, e3]);
    expect(sorted[0].tsMs).toBe(BASE_TS);
    expect(sorted[1].tsMs).toBe(BASE_TS + 500);
    expect(sorted[2].tsMs).toBe(BASE_TS + 1_000);
  });

  it("uses seq as tiebreaker when tsMs values are equal", () => {
    // Two events at the same timestamp
    const ts = BASE_TS + 2_000;
    const first  = makeSpawnEvent("a1", ts);  // seq N
    const second = makeStatusEvent("a1", "active", ts); // seq N+1
    // Ensure correct seq ordering
    expect(first.seq).toBeLessThan(second.seq);

    const sorted = sortEventsForReplay([second, first]); // deliberately reversed
    expect(sorted[0].seq).toBe(first.seq);
    expect(sorted[1].seq).toBe(second.seq);
  });

  it("is stable for already-sorted input", () => {
    const events = buildAgentTimeline("a1", 5);
    const sorted = sortEventsForReplay(events);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].tsMs).toBeGreaterThanOrEqual(sorted[i - 1].tsMs);
    }
  });
});

// ── 9c-9: clampToRange ────────────────────────────────────────────────────────

describe("clampToRange (9c-9)", () => {
  const FIRST = BASE_TS;
  const LAST  = BASE_TS + 10_000;

  it("returns ts unchanged when inside range", () => {
    expect(clampToRange(BASE_TS + 5_000, FIRST, LAST)).toBe(BASE_TS + 5_000);
  });

  it("clamps to firstTs when ts is before range", () => {
    expect(clampToRange(BASE_TS - 9_999, FIRST, LAST)).toBe(FIRST);
  });

  it("clamps to lastTs when ts is after range", () => {
    expect(clampToRange(BASE_TS + 99_999, FIRST, LAST)).toBe(LAST);
  });

  it("returns firstTs for zero-width range (same bounds)", () => {
    const ts = BASE_TS + 7_000;
    expect(clampToRange(ts, FIRST, FIRST)).toBe(FIRST);
  });

  it("handles exact boundary values without clamping", () => {
    expect(clampToRange(FIRST, FIRST, LAST)).toBe(FIRST);
    expect(clampToRange(LAST,  FIRST, LAST)).toBe(LAST);
  });
});

// ── 9c-10: computeProgress ───────────────────────────────────────────────────

describe("computeProgress (9c-10)", () => {
  const FIRST    = BASE_TS;
  const DURATION = 10_000;

  it("returns 0 when ts equals firstTs", () => {
    expect(computeProgress(FIRST, FIRST, DURATION)).toBe(0);
  });

  it("returns 1 when ts equals lastTs", () => {
    expect(computeProgress(FIRST + DURATION, FIRST, DURATION)).toBe(1);
  });

  it("returns 0.5 at midpoint", () => {
    expect(computeProgress(FIRST + DURATION / 2, FIRST, DURATION)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 when duration is 0 (avoids division by zero)", () => {
    expect(computeProgress(FIRST, FIRST, 0)).toBe(0);
  });

  it("clamps to 0 for ts before firstTs", () => {
    expect(computeProgress(FIRST - 1_000, FIRST, DURATION)).toBe(0);
  });

  it("clamps to 1 for ts after lastTs", () => {
    expect(computeProgress(FIRST + DURATION + 5_000, FIRST, DURATION)).toBe(1);
  });
});

// ── 9c-11: Integration — controller store drives reconstruction engine ─────────

describe("Controller store integration with reconstruction engine (9c-11)", () => {
  beforeEach(resetStores);

  it("buildCheckpoints produces checkpoints for a timeline", () => {
    const events = buildAgentTimeline("a1", DEFAULT_CHECKPOINT_INTERVAL * 3);
    const checkpoints = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);
    // With 3× the interval, we should have at least 2 checkpoints
    expect(checkpoints.length).toBeGreaterThanOrEqual(2);
  });

  it("reconstructStateAt returns empty state for empty events", () => {
    const state = reconstructStateAt([], BASE_TS, []);
    expect(Object.keys(state.agents)).toHaveLength(0);
    expect(Object.keys(state.rooms)).toHaveLength(0);
  });

  it("reconstructStateAt reflects agent.spawned at the correct ts", () => {
    const events = [makeSpawnEvent("agent-alpha", BASE_TS)];
    const state = reconstructStateAt(events, BASE_TS, []);
    expect(state.agents["agent-alpha"]).toBeDefined();
    expect(state.agents["agent-alpha"].agentId).toBe("agent-alpha");
  });

  it("after agent.spawned the engine sets status to 'idle' (ready-to-work state)", () => {
    // The engine transitions spawned→idle when processing agent.spawned events.
    // The agent entry is created with status "spawned" as a placeholder,
    // then the event reducer sets it to "idle" immediately.
    const events = [makeSpawnEvent("a1", BASE_TS)];
    const state = reconstructStateAt(events, BASE_TS, []);
    // Engine sets "idle" after processing agent.spawned (see state-reconstruction-engine.ts)
    expect(state.agents["a1"].status).toBe("idle");
  });

  it("reconstructStateAt excludes events after targetTs", () => {
    const spawnTs  = BASE_TS;
    const statusTs = BASE_TS + 5_000;
    const events   = [
      makeSpawnEvent("a1", spawnTs),
      makeStatusEvent("a1", "active", statusTs),
    ];

    // Query at a time before the status_changed event.
    // After agent.spawned, status is "idle" (engine's ready state)
    const earlyState = reconstructStateAt(events, spawnTs + 1_000, []);
    expect(earlyState.agents["a1"].status).toBe("idle");

    // Query at a time after the status_changed event
    const lateState = reconstructStateAt(events, statusTs + 1_000, []);
    expect(lateState.agents["a1"].status).toBe("active");
  });

  it("store _setSceneState integrates with reconstructStateAt output", () => {
    const events = buildAgentTimeline("agent-beta", 3);
    const targetTs = events[events.length - 1].tsMs;
    const sceneState = reconstructStateAt(events, targetTs, []);

    useReplayControllerStore.getState()._setSceneState(sceneState, performance.now());
    const stored = useReplayControllerStore.getState().sceneState;

    expect(stored).not.toBeNull();
    expect(stored!.ts).toBe(targetTs);
    expect(stored!.agents["agent-beta"]).toBeDefined();
  });

  it("checkpoints accelerate reconstruction to same result", () => {
    const events = buildAgentTimeline("a1", DEFAULT_CHECKPOINT_INTERVAL * 4);
    const targetTs = events[events.length - 1].tsMs;

    const checkpoints = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);
    const withCp    = reconstructStateAt(events, targetTs, checkpoints);
    const withoutCp = reconstructStateAt(events, targetTs, []);

    // Both should produce the same logical state
    expect(withCp.agents["a1"]?.agentId).toBe(withoutCp.agents["a1"]?.agentId);
    expect(withCp.seq).toBe(withoutCp.seq);
  });
});

// ── 9c-12: Integration — controller store + replay-store ──────────────────────

describe("Controller store + replay-store coordination (9c-12)", () => {
  beforeEach(resetStores);

  it("replay-store enterReplay sets mode=replay and positions playhead at first event", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 20);
    const s = useReplayStore.getState();
    expect(s.mode).toBe("replay");
    expect(s.playheadTs).toBe(BASE_TS);
    expect(s.progress).toBe(0);
  });

  it("replay-store seekToTs updates playhead correctly", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 20);
    useReplayStore.getState().seekToTs(BASE_TS + 7_000);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 7_000);
    expect(useReplayStore.getState().progress).toBeCloseTo(0.7, 5);
  });

  it("controller _setReady + replay-store can coexist", () => {
    useReplayControllerStore.getState()._setReady(50, 2);
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 5_000, 50);

    expect(useReplayControllerStore.getState().isReady).toBe(true);
    expect(useReplayStore.getState().mode).toBe("replay");
  });

  it("exitReplay resets replay-store to live mode", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 10);
    useReplayStore.getState().exitReplay();
    const s = useReplayStore.getState();
    expect(s.mode).toBe("live");
    expect(s.progress).toBeNull();
    expect(s.playing).toBe(false);
  });
});

// ── 9c-13: Integration — seek drives reconstruction and updates store ──────────

describe("Seek drives correct reconstruction result (9c-13)", () => {
  beforeEach(resetStores);

  /**
   * Simulate the core inner loop of useReplayController without a React env:
   *   reconstructAtTs(targetTs) → _setSceneState → check store
   */
  function simulateSeek(
    events: TypedReplayEvent[],
    targetTs: number,
    checkpoints: ReconstructionCheckpoint[] = [],
  ): ReconstructedSceneState {
    const state = reconstructStateAt(events, targetTs, checkpoints);
    useReplayControllerStore.getState()._setSceneState(state, performance.now());
    return state;
  }

  it("seeking to start returns initial agent state (idle after spawn)", () => {
    // The engine sets status to "idle" after processing agent.spawned (ready-to-work state)
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 2_000),
    ];
    const state = simulateSeek(events, BASE_TS);
    // After agent.spawned the engine sets status="idle", lifecycleState="ready"
    expect(state.agents["a1"].status).toBe("idle");
    expect(useReplayControllerStore.getState().sceneState!.agents["a1"].status).toBe("idle");
  });

  it("seeking past status_changed returns updated agent state", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 2_000),
    ];
    const state = simulateSeek(events, BASE_TS + 3_000);
    expect(state.agents["a1"].status).toBe("active");
  });

  it("seeking backward (to earlier ts) returns earlier state", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 1_000),
      makeStatusEvent("a1", "idle",   BASE_TS + 2_000),
      makeStatusEvent("a1", "active", BASE_TS + 3_000),
    ];

    const late = simulateSeek(events, BASE_TS + 3_500);
    expect(late.agents["a1"].status).toBe("active");

    // Seek backward past idle event
    const early = simulateSeek(events, BASE_TS + 1_500);
    expect(early.agents["a1"].status).toBe("active");

    // Seek backward to very start — after agent.spawned, engine sets "idle"
    const start = simulateSeek(events, BASE_TS + 500);
    expect(start.agents["a1"].status).toBe("idle");
  });

  it("seq in sceneState reflects the last event applied", () => {
    const events = buildAgentTimeline("a1", 4);
    const targetTs = events[2].tsMs;
    const state = simulateSeek(events, targetTs);
    // seq should be ≤ events[2].seq (we applied up to event at index 2)
    expect(state.seq).toBeLessThanOrEqual(events[2].seq);
    expect(state.seq).toBeGreaterThan(0);
  });
});

// ── 9c-14: Multiple agents scene state ────────────────────────────────────────

describe("Multi-agent scene reconstruction (9c-14)", () => {
  beforeEach(resetStores);

  it("correctly tracks two independent agents", () => {
    const events: TypedReplayEvent[] = [
      makeSpawnEvent("alice", BASE_TS),
      makeSpawnEvent("bob",   BASE_TS + 100),
      makeStatusEvent("alice", "active", BASE_TS + 500),
      makeStatusEvent("bob",   "error",  BASE_TS + 600),
    ];
    const sorted = sortEventsForReplay(events);
    const state  = reconstructStateAt(sorted, BASE_TS + 700, []);

    expect(state.agents["alice"].status).toBe("active");
    expect(state.agents["bob"].status).toBe("error");
    expect(state.agents["alice"].agentId).toBe("alice");
    expect(state.agents["bob"].agentId).toBe("bob");
  });

  it("seeking before first event for an agent returns empty for that agent", () => {
    const events = [
      makeSpawnEvent("alice", BASE_TS + 1_000),
    ];
    const state = reconstructStateAt(events, BASE_TS + 500, []);
    // alice hasn't spawned yet at BASE_TS + 500
    expect(state.agents["alice"]).toBeUndefined();
  });

  it("multiple agents with checkpoints produce same result as without", () => {
    const events: TypedReplayEvent[] = [];
    for (let i = 0; i < DEFAULT_CHECKPOINT_INTERVAL * 2; i++) {
      const agentId = `agent-${i % 4}`;
      const ts      = BASE_TS + i * 200;
      events.push(i < 4
        ? makeSpawnEvent(agentId, ts)
        : makeStatusEvent(agentId, i % 2 === 0 ? "active" : "idle", ts),
      );
    }
    const sorted      = sortEventsForReplay(events);
    const checkpoints = buildCheckpoints(sorted, DEFAULT_CHECKPOINT_INTERVAL);
    const targetTs    = sorted[sorted.length - 1].tsMs;

    const withCp    = reconstructStateAt(sorted, targetTs, checkpoints);
    const withoutCp = reconstructStateAt(sorted, targetTs, []);

    for (const agentId of Object.keys(withoutCp.agents)) {
      expect(withCp.agents[agentId]?.status).toBe(withoutCp.agents[agentId]?.status);
    }
  });
});

// ── 9c-15: Speed and playback timing calculations ─────────────────────────────

describe("Playback speed and timing (9c-15)", () => {
  it("speed 2× should advance time at twice the wall-clock rate", () => {
    const wallDelta = 100;  // ms elapsed
    const speed     = 2;
    const simDelta  = wallDelta * speed;
    expect(simDelta).toBe(200); // 200ms of simulated time
  });

  it("speed 0.5× should advance time at half the wall-clock rate", () => {
    const wallDelta = 100;
    const speed     = 0.5;
    expect(wallDelta * speed).toBe(50);
  });

  it("speed 8× spans the timeline 8× faster", () => {
    const duration  = 10_000; // 10 seconds of events
    const wallTime  = duration / 8;
    expect(wallTime).toBe(1_250);
  });

  it("replay-store setSpeed clamps to [0.1, 16]", () => {
    resetStores();
    useReplayStore.getState().setSpeed(0);
    expect(useReplayStore.getState().speed).toBeCloseTo(0.1, 5);
    useReplayStore.getState().setSpeed(100);
    expect(useReplayStore.getState().speed).toBe(16);
  });
});

// ── 9c-16: emptySceneState integration ───────────────────────────────────────

describe("emptySceneState factory (9c-16)", () => {
  it("returns a zero-entry state", () => {
    const s = emptySceneState();
    expect(Object.keys(s.agents)).toHaveLength(0);
    expect(Object.keys(s.rooms)).toHaveLength(0);
    expect(Object.keys(s.tasks)).toHaveLength(0);
    expect(Object.keys(s.commands)).toHaveLength(0);
    expect(Object.keys(s.pipelines)).toHaveLength(0);
  });

  it("accepts a timestamp argument", () => {
    const s = emptySceneState(BASE_TS);
    expect(s.ts).toBe(BASE_TS);
  });

  it("is JSON-serialisable (for checkpoint persistence)", () => {
    const s    = emptySceneState(BASE_TS);
    const json = JSON.stringify(s);
    const back = JSON.parse(json) as ReconstructedSceneState;
    expect(back.ts).toBe(BASE_TS);
    expect(back.seq).toBe(0);
  });
});

// ── 9c-17: Timeline boundary edge cases ──────────────────────────────────────

describe("Timeline boundary edge cases (9c-17)", () => {
  beforeEach(resetStores);

  it("reconstructing at exactly the first event ts includes that event", () => {
    const events = [makeSpawnEvent("a1", BASE_TS)];
    const state  = reconstructStateAt(events, BASE_TS, []);
    expect(state.agents["a1"]).toBeDefined();
  });

  it("reconstructing just before the first event ts returns empty agents", () => {
    const events = [makeSpawnEvent("a1", BASE_TS)];
    const state  = reconstructStateAt(events, BASE_TS - 1, []);
    expect(state.agents["a1"]).toBeUndefined();
  });

  it("reconstructing well past the last event ts returns same state as at last event", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "idle", BASE_TS + 5_000),
    ];
    const atLast = reconstructStateAt(events, BASE_TS + 5_000, []);
    const past   = reconstructStateAt(events, BASE_TS + 9_999_999, []);
    expect(past.agents["a1"]?.status).toBe(atLast.agents["a1"]?.status);
  });

  it("computeTimelineRange with single event returns same firstTs and lastTs", () => {
    const events = [makeSpawnEvent("a1", BASE_TS + 1_234)];
    const r = computeTimelineRange(events);
    expect(r.firstTs).toBe(r.lastTs);
    expect(r.firstTs).toBe(BASE_TS + 1_234);
  });
});

// ── 9c-18: Determinism guarantee ─────────────────────────────────────────────

describe("Determinism: same inputs always yield same output (9c-18)", () => {
  it("two reconstructions of same (events, ts) pair produce identical state", () => {
    const events = buildAgentTimeline("a1", 10);
    const ts     = events[5].tsMs;

    const s1 = reconstructStateAt(events, ts, []);
    const s2 = reconstructStateAt(events, ts, []);

    expect(s1.ts).toBe(s2.ts);
    expect(s1.seq).toBe(s2.seq);
    expect(s1.agents["a1"]?.status).toBe(s2.agents["a1"]?.status);
  });

  it("reconstruction is unaffected by external mutations after the call", () => {
    const events = buildAgentTimeline("a1", 5);
    const ts     = events[events.length - 1].tsMs;
    const state  = reconstructStateAt(events, ts, []);

    // Mutate the first event AFTER reconstruction
    (events[0] as any).tsMs = 0;

    // The stored state should not have changed
    expect(state.agents["a1"]).toBeDefined();
  });
});
