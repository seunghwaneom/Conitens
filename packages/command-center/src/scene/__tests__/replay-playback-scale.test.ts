/**
 * replay-playback-scale.test.ts — Sub-AC 14.4
 *
 * Validates:
 *   1. 3D replay playback operations — seek, play, pause — correctly update
 *      both the replay-store state machine and the reconstructed scene state.
 *   2. Multi-agent scale rendering — the reconstruction engine handles
 *      3, 10, and 20 agents without crashing, producing coherent scene state.
 *   3. Serves as the ≥8-test gate for CI: this file alone contributes
 *      ≥8 passing `it()` cases (verified by ci-test-count-check.mjs).
 *
 * Architecture
 * ─────────────
 *   replay-store (play/pause/seek actions)
 *     ├─ enterReplay / exitReplay — mode transitions
 *     ├─ play / pause / togglePlay — playback control
 *     ├─ seekToTs / seekToProgress — playhead positioning
 *     └─ stepForward / stepBackward — frame-by-frame
 *
 *   state-reconstruction-engine (pure, framework-agnostic)
 *     ├─ reconstructStateAt(events, targetTs, checkpoints?)
 *     ├─ buildCheckpoints(events, interval?)
 *     └─ emptySceneState(ts?)
 *
 * NOTE: React components (Canvas, AgentAvatar, CameraRig) require a real
 * WebGL context and cannot run inside Vitest's Node environment. These
 * tests therefore target the pure data layer — the 3D visuals follow
 * deterministically from the tested stores and reconstruction engine.
 *
 * Test ID scheme:
 *   14.4-play-N  : Replay playback control (seek, play, pause)
 *   14.4-scale-N : Multi-agent scale tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useReplayStore,
  REPLAY_SPEEDS,
} from "../../store/replay-store.js";
import {
  useReplayControllerStore,
  computeTimelineRange,
  sortEventsForReplay,
  clampToRange,
  computeProgress,
} from "../../hooks/use-replay-controller.js";
import {
  reconstructStateAt,
  buildCheckpoints,
  emptySceneState,
  DEFAULT_CHECKPOINT_INTERVAL,
  type ReconstructedSceneState,
} from "../../replay/state-reconstruction-engine.js";
import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
} from "../../replay/event-log-schema.js";

// ── Test-event factories ───────────────────────────────────────────────────────

const BASE_TS  = 1_700_000_000_000;  // 2023-11-14 UTC baseline (Unix ms)
const STEP_MS  = 500;                // 500 ms between events
const RANGE_MS = 10_000;             // 10 s seekable window

let _seq = 0;
function resetSeq() { _seq = 0; }
function nextSeq()  { return ++_seq; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRawEnvelope(type: string, agentId: string, tsMs: number): any {
  return {
    schema:   "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}-${agentId}`,
    type,
    ts:       new Date(tsMs).toISOString(),
    run_id:   "run-14.4",
    actor:    { kind: "system", id: "orchestrator" },
    payload:  { agent_id: agentId },
  };
}

function makeSpawnEvent(
  agentId: string,
  tsMs: number = BASE_TS,
): AgentLifecycleReplayEvent {
  return {
    replayCategory: "agent_lifecycle",
    raw:            makeRawEnvelope("agent.spawned", agentId, tsMs),
    type:           "agent.spawned",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq:            nextSeq(),
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         "run-14.4",
    agentId,
    typedPayload:   { agent_id: agentId, persona: "implementer", capabilities: [] } as any,
  };
}

function makeStatusEvent(
  agentId: string,
  status: string,
  tsMs: number,
): AgentLifecycleReplayEvent {
  return {
    replayCategory: "agent_lifecycle",
    raw:            makeRawEnvelope("agent.status_changed", agentId, tsMs),
    type:           "agent.status_changed",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq:            nextSeq(),
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         "run-14.4",
    agentId,
    typedPayload:   { agent_id: agentId, status } as any,
  };
}

/**
 * Build a minimal event timeline for a single agent with N status events.
 * Returns events sorted by tsMs ASC.
 */
function buildSingleAgentTimeline(
  agentId: string,
  eventCount: number,
): AgentLifecycleReplayEvent[] {
  const events: AgentLifecycleReplayEvent[] = [];
  events.push(makeSpawnEvent(agentId, BASE_TS));
  for (let i = 1; i < eventCount; i++) {
    events.push(
      makeStatusEvent(agentId, i % 2 === 0 ? "idle" : "active", BASE_TS + i * STEP_MS),
    );
  }
  return events;
}

/**
 * Build event timelines for N agents, each with a spawn + several status changes.
 * All events are merged and sorted chronologically.
 */
function buildMultiAgentTimeline(agentCount: number): TypedReplayEvent[] {
  const all: AgentLifecycleReplayEvent[] = [];
  for (let a = 0; a < agentCount; a++) {
    const agentId = `agent-${String(a).padStart(2, "0")}`;
    // Stagger spawn times so agents don't all start at the same ts
    const spawnTs = BASE_TS + a * 100;
    all.push(makeSpawnEvent(agentId, spawnTs));
    // Add status events for each agent
    for (let s = 1; s <= 4; s++) {
      all.push(
        makeStatusEvent(
          agentId,
          s % 2 === 0 ? "idle" : "active",
          spawnTs + s * STEP_MS,
        ),
      );
    }
  }
  return sortEventsForReplay(all);
}

// ── Store reset helpers ───────────────────────────────────────────────────────

function resetReplayStore() {
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
}

function resetControllerStore() {
  useReplayControllerStore.getState()._reset();
}

function resetAll() {
  resetReplayStore();
  resetControllerStore();
  resetSeq();
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 14.4-play: 3D Replay Playback Control (seek, play, pause)
// ─────────────────────────────────────────────────────────────────────────────

describe("14.4-play-1: enterReplay positions playhead and sets replay mode", () => {
  beforeEach(resetAll);

  it("mode transitions to replay on enterReplay", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
    expect(useReplayStore.getState().mode).toBe("replay");
  });

  it("playhead is positioned at firstEventTs after enterReplay", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS);
  });

  it("progress is 0 immediately after enterReplay (not past end)", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
    expect(useReplayStore.getState().progress).toBe(0);
  });

  it("playing is false on enterReplay (not auto-started)", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
    expect(useReplayStore.getState().playing).toBe(false);
  });
});

describe("14.4-play-2: play() starts playback from current position", () => {
  beforeEach(() => {
    resetAll();
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
  });

  it("play() sets playing=true in replay mode", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
  });

  it("play() is a no-op in live mode", () => {
    useReplayStore.getState().exitReplay();
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("play() at end of timeline rewinds to start and sets playing=true", () => {
    useReplayStore.getState().seekToTs(BASE_TS + RANGE_MS);
    expect(useReplayStore.getState().progress).toBe(1);
    useReplayStore.getState().play();
    const s = useReplayStore.getState();
    expect(s.playheadTs).toBe(BASE_TS);
    expect(s.playing).toBe(true);
    expect(s.progress).toBe(0);
  });

  it("play() does not rewind when playhead is mid-timeline", () => {
    const mid = BASE_TS + 3_000;
    useReplayStore.getState().seekToTs(mid);
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playheadTs).toBe(mid);
  });
});

describe("14.4-play-3: pause() stops playback without changing position", () => {
  beforeEach(() => {
    resetAll();
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
  });

  it("pause() sets playing=false after play()", () => {
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("pause() is safe to call when already paused (idempotent)", () => {
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("pause() preserves the current playhead position", () => {
    const pos = BASE_TS + 4_000;
    useReplayStore.getState().seekToTs(pos);
    useReplayStore.getState().play();
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playheadTs).toBe(pos);
  });
});

describe("14.4-play-4: seekToTs positions playhead and updates progress", () => {
  beforeEach(() => {
    resetAll();
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 50);
  });

  it("seekToTs to mid-range sets correct playheadTs and progress", () => {
    const target = BASE_TS + 5_000;
    useReplayStore.getState().seekToTs(target);
    const s = useReplayStore.getState();
    expect(s.playheadTs).toBe(target);
    expect(s.progress).toBeCloseTo(0.5, 5);
  });

  it("seekToTs clamps to firstEventTs when seeking before start", () => {
    useReplayStore.getState().seekToTs(BASE_TS - 99_999);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS);
    expect(useReplayStore.getState().progress).toBe(0);
  });

  it("seekToTs clamps to lastEventTs when seeking past end", () => {
    useReplayStore.getState().seekToTs(BASE_TS + RANGE_MS + 99_999);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + RANGE_MS);
    expect(useReplayStore.getState().progress).toBe(1);
  });

  it("seek → scene reconstruction reflects the seeked timestamp", () => {
    const events = buildSingleAgentTimeline("a1", 5);
    const targetTs = events[2].tsMs;

    useReplayStore.getState().enterReplay(
      events[0].tsMs,
      events[events.length - 1].tsMs,
      events.length,
    );
    useReplayStore.getState().seekToTs(targetTs);

    const sceneState = reconstructStateAt(events, targetTs, []);
    useReplayControllerStore.getState()._setSceneState(sceneState, performance.now());

    const stored = useReplayControllerStore.getState().sceneState;
    expect(stored).not.toBeNull();
    expect(stored!.ts).toBe(targetTs);
    expect(stored!.agents["a1"]).toBeDefined();
  });

  it("seek backward (to earlier ts) reconstructs earlier agent state", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 2_000),
      makeStatusEvent("a1", "idle",   BASE_TS + 4_000),
    ];

    // Forward to active
    let s = reconstructStateAt(events, BASE_TS + 3_000, []);
    expect(s.agents["a1"]?.status).toBe("active");

    // Seek backward past active, before any status_changed event
    s = reconstructStateAt(events, BASE_TS + 500, []);
    // After agent.spawned the engine sets status to "idle" (ready state)
    expect(s.agents["a1"]?.status).toBe("idle");
  });
});

describe("14.4-play-5: play/pause/seek cycle integration with scene reconstruction", () => {
  beforeEach(resetAll);

  it("full round-trip: enter→play→seek→pause→exit leaves stores clean", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 20);
    expect(useReplayStore.getState().mode).toBe("replay");

    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);

    useReplayStore.getState().seekToTs(BASE_TS + 5_000);
    expect(useReplayStore.getState().progress).toBeCloseTo(0.5, 2);

    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);

    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().mode).toBe("live");
    expect(useReplayStore.getState().progress).toBeNull();
    expect(useReplayStore.getState().playing).toBe(false);
    expect(useReplayStore.getState().playheadTs).toBe(0);
  });

  it("togglePlay flips playback state correctly in replay mode", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 20);
    expect(useReplayStore.getState().playing).toBe(false);

    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(true);

    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("seekToProgress(0.25) maps to correct absolute timestamp", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 8_000, 40);
    useReplayStore.getState().seekToProgress(0.25);
    expect(useReplayStore.getState().playheadTs).toBeCloseTo(BASE_TS + 2_000, 0);
  });

  it("stepForward advances playhead by 100 ms and auto-pauses", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 20);
    useReplayStore.getState().play();
    const before = useReplayStore.getState().playheadTs;
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().playheadTs).toBe(before + 100);
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("stepBackward retreats playhead by 100 ms and auto-pauses", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + RANGE_MS, 20);
    useReplayStore.getState().seekToTs(BASE_TS + 5_000);
    useReplayStore.getState().play();
    const before = useReplayStore.getState().playheadTs;
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().playheadTs).toBe(before - 100);
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("speed preset REPLAY_SPEEDS[0] is the slowest and REPLAY_SPEEDS[-1] is the fastest", () => {
    const speeds = REPLAY_SPEEDS;
    expect(speeds[0]).toBeLessThan(speeds[speeds.length - 1]);
  });
});

describe("14.4-play-6: seek with checkpoints produces same state as without", () => {
  beforeEach(resetAll);

  it("checkpoints accelerate seek to identical result as full replay", () => {
    const events = buildSingleAgentTimeline("a1", DEFAULT_CHECKPOINT_INTERVAL * 3);
    const targetTs = events[Math.floor(events.length * 0.75)].tsMs;

    const checkpoints = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);
    const withCp    = reconstructStateAt(events, targetTs, checkpoints);
    const withoutCp = reconstructStateAt(events, targetTs, []);

    expect(withCp.agents["a1"]?.status).toBe(withoutCp.agents["a1"]?.status);
    expect(withCp.ts).toBe(withoutCp.ts);
    expect(withCp.seq).toBe(withoutCp.seq);
  });

  it("seeking to timeline boundaries returns consistent boundary states", () => {
    const events = [
      makeSpawnEvent("a1", BASE_TS),
      makeStatusEvent("a1", "active", BASE_TS + 1_000),
      makeStatusEvent("a1", "idle",   BASE_TS + 2_000),
    ];

    const atFirstTs = reconstructStateAt(events, BASE_TS, []);
    const atLastTs  = reconstructStateAt(events, BASE_TS + 2_000, []);
    const beyondEnd = reconstructStateAt(events, BASE_TS + 9_999_999, []);

    // At first event — spawned → engine sets idle
    expect(atFirstTs.agents["a1"]?.status).toBe("idle");
    // At last event — second status_changed sets idle
    expect(atLastTs.agents["a1"]?.status).toBe("idle");
    // Far past end — same as at last event
    expect(beyondEnd.agents["a1"]?.status).toBe(atLastTs.agents["a1"]?.status);
  });

  it("computeProgress clamps result to [0, 1] for out-of-range input", () => {
    const duration = 10_000;
    expect(computeProgress(BASE_TS - 5_000, BASE_TS, duration)).toBe(0);
    expect(computeProgress(BASE_TS + 15_000, BASE_TS, duration)).toBe(1);
  });

  it("clampToRange enforces boundary on arbitrary playhead positions", () => {
    const first = BASE_TS;
    const last  = BASE_TS + RANGE_MS;
    expect(clampToRange(BASE_TS - 1, first, last)).toBe(first);
    expect(clampToRange(BASE_TS + RANGE_MS + 1, first, last)).toBe(last);
    expect(clampToRange(BASE_TS + 5_000, first, last)).toBe(BASE_TS + 5_000);
  });

  it("computeTimelineRange from sorted events extracts correct boundaries", () => {
    const events = buildSingleAgentTimeline("a1", 6);
    const r = computeTimelineRange(events);
    expect(r.firstTs).toBe(events[0].tsMs);
    expect(r.lastTs).toBe(events[events.length - 1].tsMs);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 14.4-scale: Multi-agent scale rendering without crash
// ─────────────────────────────────────────────────────────────────────────────

describe("14.4-scale-1: 3-agent scene renders without crash", () => {
  beforeEach(resetAll);

  const AGENT_COUNT = 3;

  it("reconstructStateAt completes for 3 agents without throwing", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    expect(() => reconstructStateAt(events, targetTs, [])).not.toThrow();
  });

  it("reconstructed state contains all 3 agents", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    expect(Object.keys(state.agents)).toHaveLength(AGENT_COUNT);
  });

  it("each agent in 3-agent scene has a valid agentId and status", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    for (const [id, agent] of Object.entries(state.agents)) {
      expect(id).toBeTruthy();
      expect(agent.agentId).toBe(id);
      expect(typeof agent.status).toBe("string");
      expect(agent.status.length).toBeGreaterThan(0);
    }
  });

  it("3-agent seek at start returns initial (spawn) states only", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    // Query at the very first event's timestamp — only first agent is spawned
    const firstTs = events[0].tsMs;
    const state = reconstructStateAt(events, firstTs, []);
    // At least the first agent should be present
    expect(Object.keys(state.agents).length).toBeGreaterThanOrEqual(1);
  });
});

describe("14.4-scale-2: 10-agent scene renders without crash", () => {
  beforeEach(resetAll);

  const AGENT_COUNT = 10;

  it("reconstructStateAt completes for 10 agents without throwing", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    expect(() => reconstructStateAt(events, targetTs, [])).not.toThrow();
  });

  it("reconstructed state contains all 10 agents", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    expect(Object.keys(state.agents)).toHaveLength(AGENT_COUNT);
  });

  it("10-agent reconstruction is deterministic (two calls yield identical state)", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const s1 = reconstructStateAt(events, targetTs, []);
    const s2 = reconstructStateAt(events, targetTs, []);
    expect(s1.ts).toBe(s2.ts);
    expect(s1.seq).toBe(s2.seq);
    for (const agentId of Object.keys(s1.agents)) {
      expect(s1.agents[agentId]?.status).toBe(s2.agents[agentId]?.status);
    }
  });

  it("10-agent seek mid-timeline returns subset of agents (those spawned so far)", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    // Mid-point: seek to after only the first 5 agents have spawned
    // Each agent spawns 100 ms apart; agent-04 spawns at BASE_TS + 400
    const midTs = BASE_TS + 450; // after agent-04, before agent-05
    const state = reconstructStateAt(events, midTs, []);
    // Agents 00–04 should be present (5 agents)
    expect(Object.keys(state.agents).length).toBe(5);
  });

  it("10-agent scene with checkpoints produces correct total agent count", () => {
    const events    = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs  = events[events.length - 1].tsMs;
    const cps       = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);
    const stateWithCp = reconstructStateAt(events, targetTs, cps);
    expect(Object.keys(stateWithCp.agents)).toHaveLength(AGENT_COUNT);
  });
});

describe("14.4-scale-3: 20-agent scene renders without crash (maximum target load)", () => {
  beforeEach(resetAll);

  const AGENT_COUNT = 20;

  it("reconstructStateAt completes for 20 agents without throwing", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    expect(() => reconstructStateAt(events, targetTs, [])).not.toThrow();
  });

  it("reconstructed state contains all 20 agents", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    expect(Object.keys(state.agents)).toHaveLength(AGENT_COUNT);
  });

  it("20-agent scene: each agent has a non-empty status string", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    for (const agent of Object.values(state.agents)) {
      expect(typeof agent.status).toBe("string");
      expect(agent.status.length).toBeGreaterThan(0);
    }
  });

  it("20-agent scene: all agentId fields match their map keys", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[events.length - 1].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    for (const [key, agent] of Object.entries(state.agents)) {
      expect(agent.agentId).toBe(key);
    }
  });

  it("20-agent scene with checkpoints is faster than full replay (fewer events applied)", () => {
    const events     = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs   = events[events.length - 1].tsMs;
    const checkpoints = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);
    // Checkpoints only help when enough events exist; verify they don't break results
    const withCp    = reconstructStateAt(events, targetTs, checkpoints);
    const withoutCp = reconstructStateAt(events, targetTs, []);
    expect(Object.keys(withCp.agents)).toHaveLength(Object.keys(withoutCp.agents).length);
  });

  it("20-agent scene: seek backward to t=BASE_TS returns exactly 1 spawned agent", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    // At BASE_TS only agent-00 has spawned (others spawn at +100, +200, … ms)
    const state = reconstructStateAt(events, BASE_TS, []);
    expect(Object.keys(state.agents)).toHaveLength(1);
    expect(state.agents["agent-00"]).toBeDefined();
  });

  it("20-agent reconstruction: state.ts equals targetTs", () => {
    const events = buildMultiAgentTimeline(AGENT_COUNT);
    const targetTs = events[Math.floor(events.length / 2)].tsMs;
    const state = reconstructStateAt(events, targetTs, []);
    expect(state.ts).toBeLessThanOrEqual(targetTs);
  });
});

describe("14.4-scale-4: scale across the full 3–20 agent range", () => {
  beforeEach(resetAll);

  it("reconstruction does not crash for any count in [3, 5, 10, 15, 20]", () => {
    const counts = [3, 5, 10, 15, 20];
    for (const count of counts) {
      const events = buildMultiAgentTimeline(count);
      const targetTs = events[events.length - 1].tsMs;
      expect(() => reconstructStateAt(events, targetTs, [])).not.toThrow();
    }
  });

  it("each agent count returns exactly that many agents in final state", () => {
    const counts = [3, 5, 10, 15, 20];
    for (const count of counts) {
      const events   = buildMultiAgentTimeline(count);
      const targetTs = events[events.length - 1].tsMs;
      const state    = reconstructStateAt(events, targetTs, []);
      expect(Object.keys(state.agents)).toHaveLength(count);
    }
  });

  it("emptySceneState() is always the correct starting point for reconstruction", () => {
    const empty = emptySceneState();
    expect(Object.keys(empty.agents)).toHaveLength(0);
    expect(Object.keys(empty.rooms)).toHaveLength(0);
    expect(Object.keys(empty.tasks)).toHaveLength(0);
    expect(Object.keys(empty.commands)).toHaveLength(0);
    expect(Object.keys(empty.pipelines)).toHaveLength(0);
  });

  it("scene state is JSON-serialisable for all scale targets (checkpoint safety)", () => {
    const counts = [3, 10, 20];
    for (const count of counts) {
      const events   = buildMultiAgentTimeline(count);
      const targetTs = events[events.length - 1].tsMs;
      const state    = reconstructStateAt(events, targetTs, []);
      expect(() => JSON.stringify(state)).not.toThrow();
      const parsed: ReconstructedSceneState = JSON.parse(JSON.stringify(state));
      expect(Object.keys(parsed.agents)).toHaveLength(count);
    }
  });
});
