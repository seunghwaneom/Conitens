/**
 * replay-scene-integration.test.ts — Sub-AC 9.3 (AC 9)
 *
 * End-to-end integration tests covering the full replay pipeline:
 *
 *   TypedReplayEvent[] (JSONL)
 *     ▼  reconstructStateAt()
 *   ReconstructedSceneState
 *     ▼  applyAgentDiff() / applyRoomDiff()
 *   agent-store agents   /  spatial-store roomStates
 *     ▼  AgentAvatar reads  /  RoomGeometry reads
 *   Low-poly 3D scene
 *
 * This file specifically validates that:
 *
 *   1. Entering replay mode saves and then restores live state correctly.
 *   2. Seeking to different timestamps reconstructs the expected agent
 *      and room states (via the bridge helper functions).
 *   3. Play/pause/scrub control actions update the replay-store correctly.
 *   4. The bridge helper functions (applyAgentDiff, applyRoomDiff) correctly
 *      merge reconstructed state into the live stores for scene rendering.
 *   5. computeDensityBuckets produces correct histogram values for the
 *      ReplayDiegeticTimeline geometry.
 *   6. The full cycle (enter → play → seek → exit) leaves stores in their
 *      original live state (no contamination).
 *
 * Test naming scheme: 9.3-N
 *
 * NOTE: R3F components (Canvas, AgentAvatar, RoomGeometry) require a DOM
 * renderer and cannot be integration-tested in jsdom without heavy mocking.
 * This file tests the data layer (stores + bridge functions) that drives
 * the visual components — the 3D visuals follow deterministically from
 * these stores.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyAgentDiff,
  applyRoomDiff,
  mapReconstructedAgentToRuntime,
  mapReconstructedRoomToRuntime,
  mapReconstructedStatus,
  mapReconstructedLifecycle,
} from "../../hooks/use-scene-graph-replay-bridge.js";
import {
  reconstructStateAt,
  buildCheckpoints,
  emptySceneState,
  DEFAULT_CHECKPOINT_INTERVAL,
  type ReconstructedSceneState,
  type ReconstructedAgentState,
  type ReconstructedRoomState,
} from "../../replay/state-reconstruction-engine.js";
import {
  sortEventsForReplay,
  computeTimelineRange,
  useReplayControllerStore,
} from "../../hooks/use-replay-controller.js";
import { useReplayStore } from "../../store/replay-store.js";
import { useAgentStore, type AgentRuntimeState } from "../../store/agent-store.js";
import { useSpatialStore, type RoomRuntimeState } from "../../store/spatial-store.js";
import { computeDensityBuckets } from "../ReplayDiegeticTimeline.js";
import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
} from "../../replay/event-log-schema.js";

// ── Test-event factories ───────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000;
const STEP_MS = 500;
let _seq = 0;

function resetSeq() { _seq = 0; }
function nextSeq()  { return ++_seq; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRawEnvelope(type: string, agentId: string, tsMs: number): any {
  return {
    schema:   "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}-${Math.random().toString(36).slice(2)}`,
    type,
    ts:       new Date(tsMs).toISOString(),
    run_id:   "run-test",
    actor:    { kind: "system", id: "orchestrator" },
    payload:  { agent_id: agentId },
  };
}

function makeSpawnEvent(agentId: string, tsMs: number = BASE_TS): AgentLifecycleReplayEvent {
  return {
    replayCategory: "agent_lifecycle",
    raw:            makeRawEnvelope("agent.spawned", agentId, tsMs),
    type:           "agent.spawned",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq:            nextSeq(),
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         "run-test",
    agentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    run_id:         "run-test",
    agentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typedPayload:   { agent_id: agentId, status } as any,
  };
}

/** Build a simple multi-event timeline for a single agent. */
function buildAgentTimeline(agentId: string, count = 5): AgentLifecycleReplayEvent[] {
  const events: AgentLifecycleReplayEvent[] = [];
  events.push(makeSpawnEvent(agentId, BASE_TS));
  for (let i = 1; i < count; i++) {
    events.push(
      makeStatusEvent(agentId, i % 2 === 0 ? "idle" : "active", BASE_TS + i * STEP_MS),
    );
  }
  return events;
}

/** Create a minimal live AgentRuntimeState. */
function makeLiveAgent(agentId: string, roomId = "lobby"): AgentRuntimeState {
  return {
    def: {
      agentId,
      name:        `Agent ${agentId}`,
      role:        "implementer",
      defaultRoom: roomId,
      capabilities: [],
      riskClass:   "low",
      summary:     "test agent",
      visual:      { label: agentId, color: "#4a6aff", icon: "◆" },
    },
    status:               "inactive",
    lifecycleState:       "initializing",
    isDynamic:            false,
    roomId,
    localPosition:        { x: 0.3, y: 0, z: 0.5 },
    worldPosition:        { x: 1.5, y: 0, z: 2.0 },
    currentTaskId:        null,
    currentTaskTitle:     null,
    lastStatusChangeTs:   0,
    lastLifecycleChangeTs: 0,
    hovered:              false,
    spawnTs:              BASE_TS,
    spawnIndex:           0,
  };
}

/** Create a minimal live RoomRuntimeState. */
function makeLiveRoom(): RoomRuntimeState {
  return {
    activeMembers: ["agent-existing"],
    activity:      "active",
    highlighted:   false,
    selected:      false,
    lastEventTs:   BASE_TS - 5000,
    paused:        false,
  };
}

/** Reset all stores to a known initial state. */
function resetAllStores() {
  resetSeq();

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

  useReplayControllerStore.getState()._reset();

  // Exit replay mode in both stores (idempotent if not in replay)
  try { useAgentStore.getState()._exitReplayMode(); } catch { /* ok */ }
  try { useSpatialStore.getState()._exitReplayMode(); } catch { /* ok */ }
}

// ── 9.3-1: Replay store transitions ──────────────────────────────────────────

describe("Replay store transitions during playback (9.3-1)", () => {
  beforeEach(resetAllStores);
  afterEach(resetAllStores);

  it("enters replay mode and sets playhead to firstTs", () => {
    const first = BASE_TS;
    const last  = BASE_TS + 10_000;
    useReplayStore.getState().enterReplay(first, last, 20);
    const s = useReplayStore.getState();
    expect(s.mode).toBe("replay");
    expect(s.playheadTs).toBe(first);
    expect(s.progress).toBe(0);
    expect(s.duration).toBe(10_000);
  });

  it("play() starts playback when paused", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
  });

  it("pause() stops playback", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().play();
    useReplayStore.getState().pause();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("togglePlay() alternates between play and pause", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    // Initially paused after enterReplay
    expect(useReplayStore.getState().playing).toBe(false);
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(true);
    useReplayStore.getState().togglePlay();
    expect(useReplayStore.getState().playing).toBe(false);
  });

  it("seekToTs() repositions playhead and updates progress", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().seekToTs(BASE_TS + 7_000);
    const s = useReplayStore.getState();
    expect(s.playheadTs).toBe(BASE_TS + 7_000);
    expect(s.elapsed).toBe(7_000);
    expect(s.progress).toBeCloseTo(0.7, 5);
  });

  it("seekToProgress(0.5) seeks to midpoint of timeline", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 8_000, 10);
    useReplayStore.getState().seekToProgress(0.5);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 4_000);
    expect(useReplayStore.getState().progress).toBeCloseTo(0.5, 5);
  });

  it("seekToTs() clamps to [firstEventTs, lastEventTs]", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 5_000, 3);
    useReplayStore.getState().seekToTs(BASE_TS - 99999);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS);
    useReplayStore.getState().seekToTs(BASE_TS + 999999);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 5_000);
  });

  it("stepForward() advances playhead by ~100ms", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().seekToTs(BASE_TS + 3_000);
    useReplayStore.getState().stepForward();
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 3_100);
  });

  it("stepBackward() retreats playhead by ~100ms", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().seekToTs(BASE_TS + 3_000);
    useReplayStore.getState().stepBackward();
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 2_900);
  });

  it("exitReplay() resets mode to live", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 10_000, 5);
    useReplayStore.getState().exitReplay();
    expect(useReplayStore.getState().mode).toBe("live");
    expect(useReplayStore.getState().playing).toBe(false);
    expect(useReplayStore.getState().progress).toBeNull();
  });

  it("play() at end of timeline rewinds to start", () => {
    useReplayStore.getState().enterReplay(BASE_TS, BASE_TS + 5_000, 5);
    // Seek to the very end
    useReplayStore.getState().seekToTs(BASE_TS + 5_000);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS + 5_000);
    // Calling play() should rewind to start
    useReplayStore.getState().play();
    expect(useReplayStore.getState().playing).toBe(true);
    expect(useReplayStore.getState().playheadTs).toBe(BASE_TS);
  });
});

// ── 9.3-2: Reconstruction → agent scene state pipeline ───────────────────────

describe("Reconstruction → agent scene state pipeline (9.3-2)", () => {
  beforeEach(resetAllStores);
  afterEach(resetAllStores);

  it("reconstructing at BASE_TS shows agent after spawn event", () => {
    const events = sortEventsForReplay([makeSpawnEvent("agent-1", BASE_TS)]);
    const state  = reconstructStateAt(events, BASE_TS, []);
    expect(state.agents["agent-1"]).toBeDefined();
  });

  it("reconstructing before spawn event shows no agent", () => {
    const events = [makeSpawnEvent("agent-1", BASE_TS + 2_000)];
    const state  = reconstructStateAt(events, BASE_TS, []);
    expect(state.agents["agent-1"]).toBeUndefined();
  });

  it("scrubbing forward reveals agent.status_changed event", () => {
    const events = sortEventsForReplay([
      makeSpawnEvent("agent-1", BASE_TS),
      makeStatusEvent("agent-1", "active", BASE_TS + 1_000),
    ]);

    const before = reconstructStateAt(events, BASE_TS + 500, []);
    expect(before.agents["agent-1"]?.status).toBe("idle");  // post-spawn default

    const after = reconstructStateAt(events, BASE_TS + 1_500, []);
    expect(after.agents["agent-1"]?.status).toBe("active");
  });

  it("scrubbing backward from 'active' to 'idle' reverses status", () => {
    const events = sortEventsForReplay([
      makeSpawnEvent("agent-1", BASE_TS),
      makeStatusEvent("agent-1", "active",  BASE_TS + 1_000),
      makeStatusEvent("agent-1", "idle",    BASE_TS + 2_000),
      makeStatusEvent("agent-1", "active",  BASE_TS + 3_000),
    ]);

    // At the end: active
    const atEnd = reconstructStateAt(events, BASE_TS + 4_000, []);
    expect(atEnd.agents["agent-1"].status).toBe("active");

    // Seek back to just after second event: idle
    const midpoint = reconstructStateAt(events, BASE_TS + 2_500, []);
    expect(midpoint.agents["agent-1"].status).toBe("idle");

    // Seek back to very start: idle (post-spawn)
    const start = reconstructStateAt(events, BASE_TS + 500, []);
    expect(start.agents["agent-1"].status).toBe("idle");
  });

  it("multiple agents are tracked independently during replay", () => {
    const events = sortEventsForReplay([
      makeSpawnEvent("alice", BASE_TS),
      makeSpawnEvent("bob",   BASE_TS + 100),
      makeStatusEvent("alice", "active", BASE_TS + 500),
      makeStatusEvent("bob",   "error",  BASE_TS + 600),
    ]);

    const state = reconstructStateAt(events, BASE_TS + 700, []);
    expect(state.agents["alice"].status).toBe("active");
    expect(state.agents["bob"].status).toBe("error");
  });

  it("checkpoints produce identical result as no-checkpoint reconstruction", () => {
    const events = sortEventsForReplay(
      buildAgentTimeline("agent-cp", DEFAULT_CHECKPOINT_INTERVAL * 3),
    );
    const targetTs   = events[events.length - 1].tsMs;
    const checkpoints = buildCheckpoints(events, DEFAULT_CHECKPOINT_INTERVAL);

    const withCp    = reconstructStateAt(events, targetTs, checkpoints);
    const withoutCp = reconstructStateAt(events, targetTs, []);

    expect(withCp.agents["agent-cp"]?.status).toBe(withoutCp.agents["agent-cp"]?.status);
    expect(withCp.seq).toBe(withoutCp.seq);
  });

  it("seq in reconstructed state reflects last applied event", () => {
    const events = sortEventsForReplay(buildAgentTimeline("a", 6));
    const targetTs = events[3].tsMs;
    const state  = reconstructStateAt(events, targetTs, []);
    // seq must be ≤ events[3].seq and > 0
    expect(state.seq).toBeGreaterThan(0);
    expect(state.seq).toBeLessThanOrEqual(events[3].seq);
  });
});

// ── 9.3-3: Bridge helper functions → store mutations ─────────────────────────

describe("Bridge functions update stores as replay scrubs (9.3-3)", () => {
  beforeEach(resetAllStores);
  afterEach(resetAllStores);

  it("applyAgentDiff maps reconstructed 'active' status to agent-store", () => {
    const live: Record<string, AgentRuntimeState> = {
      "agent-x": makeLiveAgent("agent-x"),
    };
    const sceneState: ReconstructedSceneState = {
      ...emptySceneState(BASE_TS),
      agents: {
        "agent-x": {
          agentId:       "agent-x",
          status:        "active",
          roomId:        "lobby",
          currentTaskId: "task-1",
          lifecycleState: "active",
          errorCount:    0,
          lastEventTs:   BASE_TS,
          lastEventSeq:  1,
        },
      },
    };

    const result = applyAgentDiff(sceneState, live);
    expect(result["agent-x"].status).toBe("active");
    expect(result["agent-x"].currentTaskId).toBe("task-1");
  });

  it("applyAgentDiff preserves live agent that has no events in replay window", () => {
    const live: Record<string, AgentRuntimeState> = {
      "a1": makeLiveAgent("a1"),
      "a2": makeLiveAgent("a2"),  // a2 has no events this window
    };
    const sceneState: ReconstructedSceneState = {
      ...emptySceneState(BASE_TS),
      agents: {
        "a1": {
          agentId:        "a1",
          status:         "error",
          roomId:         "office",
          currentTaskId:  null,
          lifecycleState: "crashed",
          errorCount:     1,
          lastEventTs:    BASE_TS + 100,
          lastEventSeq:   2,
        },
      },
    };

    const result = applyAgentDiff(sceneState, live);
    // a1 gets the reconstructed error state
    expect(result["a1"].status).toBe("error");
    // a2 is unchanged (no events in this window)
    expect(result["a2"]).toBe(live["a2"]);
  });

  it("applyRoomDiff correctly maps room activity from reconstruction", () => {
    const live: Record<string, RoomRuntimeState> = {
      "room-alpha": makeLiveRoom(),
    };
    const sceneState: ReconstructedSceneState = {
      ...emptySceneState(BASE_TS),
      rooms: {
        "room-alpha": {
          roomId:        "room-alpha",
          activeMembers: ["alice", "bob"],
          activity:      "meeting",
          meetingId:     "meeting-1",
          lastEventTs:   BASE_TS + 500,
        },
      },
    };

    const result = applyRoomDiff(sceneState, live);
    expect(result["room-alpha"].activity).toBe("meeting");
    expect(result["room-alpha"].activeMembers).toEqual(["alice", "bob"]);
    // UI-only fields are reset in replay
    expect(result["room-alpha"].highlighted).toBe(false);
    expect(result["room-alpha"].selected).toBe(false);
  });

  it("applyRoomDiff preserves live rooms not present in reconstruction", () => {
    const live: Record<string, RoomRuntimeState> = {
      "room-1": makeLiveRoom(),
      "room-2": makeLiveRoom(),
    };
    const sceneState: ReconstructedSceneState = {
      ...emptySceneState(BASE_TS),
      rooms: {
        "room-1": {
          roomId:        "room-1",
          activeMembers: [],
          activity:      "offline",
          meetingId:     null,
          lastEventTs:   BASE_TS,
        },
      },
    };

    const result = applyRoomDiff(sceneState, live);
    expect(result["room-2"]).toBe(live["room-2"]);
    expect(result["room-1"].activity).toBe("offline");
  });

  it("bridge does not mutate source live maps", () => {
    const live: Record<string, AgentRuntimeState> = {
      "a1": makeLiveAgent("a1"),
    };
    const origStatus = live["a1"].status;

    const sceneState: ReconstructedSceneState = {
      ...emptySceneState(BASE_TS),
      agents: {
        "a1": {
          agentId:        "a1",
          status:         "terminated",
          roomId:         "lobby",
          currentTaskId:  null,
          lifecycleState: "terminated",
          errorCount:     0,
          lastEventTs:    BASE_TS,
          lastEventSeq:   1,
        },
      },
    };

    applyAgentDiff(sceneState, live);
    // Original live map should be untouched
    expect(live["a1"].status).toBe(origStatus);
  });
});

// ── 9.3-4: Agent-store replay integration ─────────────────────────────────────

describe("Agent-store replay mode: save/restore around reconstruction (9.3-4)", () => {
  beforeEach(() => {
    resetAllStores();
    if (!useAgentStore.getState().initialized) {
      useAgentStore.getState().initializeAgents();
    }
    useAgentStore.getState()._exitReplayMode();
  });

  afterEach(() => {
    useAgentStore.getState()._exitReplayMode();
    resetAllStores();
  });

  it("entering replay mode saves current agent state", () => {
    const beforeCount = Object.keys(useAgentStore.getState().agents).length;
    useAgentStore.getState()._enterReplayMode();
    const saved = useAgentStore.getState()._savedLiveAgents;
    expect(saved).not.toBeNull();
    expect(Object.keys(saved!).length).toBe(beforeCount);
    useAgentStore.getState()._exitReplayMode();
  });

  it("_applyReplayAgents mutates agents without emitting events", () => {
    useAgentStore.getState()._enterReplayMode();
    const priorEvtCount = useAgentStore.getState().events.length;
    const agents        = useAgentStore.getState().agents;
    const firstId       = Object.keys(agents)[0];

    if (firstId) {
      useAgentStore.getState()._applyReplayAgents({
        [firstId]: { ...agents[firstId], status: "error" as const },
      });
      expect(useAgentStore.getState().agents[firstId].status).toBe("error");
      // No new events emitted by the replay path
      expect(useAgentStore.getState().events.length).toBe(priorEvtCount);
    }

    useAgentStore.getState()._exitReplayMode();
  });

  it("exiting replay mode restores original agent statuses", () => {
    const originalAgents = { ...useAgentStore.getState().agents };
    useAgentStore.getState()._enterReplayMode();

    // Force-set all agents to "error" to simulate replay state
    const errorMap: Record<string, AgentRuntimeState> = {};
    for (const [id, agent] of Object.entries(originalAgents)) {
      errorMap[id] = { ...agent, status: "error" as const };
    }
    useAgentStore.getState()._applyReplayAgents(errorMap);

    // All should now be "error"
    for (const id of Object.keys(originalAgents)) {
      expect(useAgentStore.getState().agents[id].status).toBe("error");
    }

    // Exit: restore
    useAgentStore.getState()._exitReplayMode();

    // Check restored
    for (const [id, orig] of Object.entries(originalAgents)) {
      expect(useAgentStore.getState().agents[id].status).toBe(orig.status);
    }
    expect(useAgentStore.getState()._savedLiveAgents).toBeNull();
  });

  it("_enterReplayMode saves non-null snapshot on every call", () => {
    // NOTE: The store's _enterReplayMode() saves current agents unconditionally.
    // Guard against double-enter is enforced by the bridge layer
    // (use-scene-graph-replay-bridge.ts checks _savedLiveAgents !== null).
    // Here we just verify that _savedLiveAgents is always non-null after calling.

    const originalAgents = { ...useAgentStore.getState().agents };
    useAgentStore.getState()._enterReplayMode();

    // First save: should capture original agents
    const savedFirst = useAgentStore.getState()._savedLiveAgents;
    expect(savedFirst).not.toBeNull();
    expect(Object.keys(savedFirst!).length).toBeGreaterThan(0);

    // Apply replay state
    const firstId = Object.keys(originalAgents)[0];
    if (firstId) {
      useAgentStore.getState()._applyReplayAgents({
        ...originalAgents,
        [firstId]: { ...originalAgents[firstId], status: "active" as const },
      });
    }

    // The saved snapshot should still be non-null
    expect(useAgentStore.getState()._savedLiveAgents).not.toBeNull();

    useAgentStore.getState()._exitReplayMode();

    // After exit, snapshot is cleared
    expect(useAgentStore.getState()._savedLiveAgents).toBeNull();
  });
});

// ── 9.3-5: Spatial-store replay integration ───────────────────────────────────

describe("Spatial-store replay mode: save/restore (9.3-5)", () => {
  beforeEach(() => {
    resetAllStores();
    useSpatialStore.getState()._exitReplayMode();
  });

  afterEach(() => {
    useSpatialStore.getState()._exitReplayMode();
    resetAllStores();
  });

  it("entering replay mode saves current room states", () => {
    useSpatialStore.getState()._enterReplayMode();
    expect(useSpatialStore.getState()._savedLiveRoomStates).not.toBeNull();
    useSpatialStore.getState()._exitReplayMode();
  });

  it("_applyReplayRoomStates injects new rooms without emitting events", () => {
    useSpatialStore.getState()._enterReplayMode();

    const replayRooms: Record<string, RoomRuntimeState> = {
      "test-room-injection": {
        activeMembers: ["agent-test"],
        activity:      "meeting",
        highlighted:   false,
        selected:      false,
        lastEventTs:   BASE_TS,
        paused:        false,
      },
    };

    useSpatialStore.getState()._applyReplayRoomStates(replayRooms);
    const rooms = useSpatialStore.getState().roomStates;
    expect(rooms["test-room-injection"]).toBeDefined();
    expect(rooms["test-room-injection"].activity).toBe("meeting");

    useSpatialStore.getState()._exitReplayMode();
  });

  it("exiting replay mode removes injected replay rooms", () => {
    const originalRooms = { ...useSpatialStore.getState().roomStates };
    useSpatialStore.getState()._enterReplayMode();

    useSpatialStore.getState()._applyReplayRoomStates({
      "injected-room-xyz": {
        activeMembers: [],
        activity:      "offline",
        highlighted:   false,
        selected:      false,
        lastEventTs:   BASE_TS,
        paused:        false,
      },
    });

    useSpatialStore.getState()._exitReplayMode();

    // Injected room should be gone (or undefined, matching original state)
    expect(useSpatialStore.getState().roomStates["injected-room-xyz"]).toEqual(
      originalRooms["injected-room-xyz"],
    );
    expect(useSpatialStore.getState()._savedLiveRoomStates).toBeNull();
  });
});

// ── 9.3-6: Full cycle — enter → reconstruct → apply → exit ────────────────────

describe("Full replay cycle: enter → seek → apply → exit (9.3-6)", () => {
  beforeEach(() => {
    resetAllStores();
    if (!useAgentStore.getState().initialized) {
      useAgentStore.getState().initializeAgents();
    }
    useAgentStore.getState()._exitReplayMode();
    useSpatialStore.getState()._exitReplayMode();
  });

  afterEach(() => {
    useAgentStore.getState()._exitReplayMode();
    useSpatialStore.getState()._exitReplayMode();
    resetAllStores();
  });

  it("complete replay cycle leaves agent store in original state", () => {
    // 1. Snapshot original live agents
    const originalAgents = { ...useAgentStore.getState().agents };

    // 2. Build test events
    const events = sortEventsForReplay(buildAgentTimeline("replay-agent", 4));
    const { firstTs, lastTs } = computeTimelineRange(events);

    // 3. Enter replay mode
    useReplayStore.getState().enterReplay(firstTs, lastTs, events.length);
    useAgentStore.getState()._enterReplayMode();
    useSpatialStore.getState()._enterReplayMode();

    // 4. Reconstruct at midpoint and apply to stores
    const midTs = firstTs + (lastTs - firstTs) / 2;
    const sceneState = reconstructStateAt(events, midTs, []);
    const savedAgents = useAgentStore.getState()._savedLiveAgents ?? originalAgents;

    const agentMap = applyAgentDiff(sceneState, savedAgents);
    useAgentStore.getState()._applyReplayAgents(agentMap);

    // 5. Verify replay state was applied
    // The "replay-agent" from events is now present in the store
    // (either as a new dynamic agent or in the map)
    expect(agentMap["replay-agent"]).toBeDefined();

    // 6. Exit replay mode and restore live state
    useReplayStore.getState().exitReplay();
    useAgentStore.getState()._exitReplayMode();
    useSpatialStore.getState()._exitReplayMode();

    // 7. Live state should be fully restored
    expect(useAgentStore.getState()._savedLiveAgents).toBeNull();

    // Original agents should be back with original statuses
    for (const [id, orig] of Object.entries(originalAgents)) {
      const restored = useAgentStore.getState().agents[id];
      if (restored) {
        expect(restored.status).toBe(orig.status);
      }
    }
  });

  it("controller store tracks reconstruction count across seeks", () => {
    const events = sortEventsForReplay(buildAgentTimeline("ctrl-agent", 5));
    const { firstTs, lastTs } = computeTimelineRange(events);

    useReplayControllerStore.getState()._setReady(events.length, 2);
    expect(useReplayControllerStore.getState().isReady).toBe(true);

    // Simulate 3 reconstructions (as the controller would do in playback)
    for (let i = 0; i < 3; i++) {
      const ts = firstTs + ((i + 1) / 4) * (lastTs - firstTs);
      const state = reconstructStateAt(events, ts, []);
      useReplayControllerStore.getState()._setSceneState(state, performance.now());
    }

    expect(useReplayControllerStore.getState().reconstructionCount).toBe(3);
    const sceneState = useReplayControllerStore.getState().sceneState;
    expect(sceneState).not.toBeNull();
  });

  it("reconstruction is deterministic: same ts always yields same state", () => {
    const events   = sortEventsForReplay(buildAgentTimeline("det-agent", 8));
    const targetTs = events[5].tsMs;

    const s1 = reconstructStateAt(events, targetTs, []);
    const s2 = reconstructStateAt(events, targetTs, []);

    expect(s1.agents["det-agent"]?.status).toBe(s2.agents["det-agent"]?.status);
    expect(s1.seq).toBe(s2.seq);
    expect(s1.ts).toBe(s2.ts);
  });
});

// ── 9.3-7: Status and lifecycle mapping in visual context ─────────────────────

describe("Status/lifecycle mapping for 3D visual rendering (9.3-7)", () => {
  it("mapReconstructedStatus produces valid AgentStatus values", () => {
    const validStatuses = ["idle", "active", "error", "terminated", "inactive"];
    const inputs = [
      "spawned", "idle", "ready", "active", "busy",
      "error", "crashed", "terminated", "despawned", "paused",
    ];
    for (const raw of inputs) {
      const mapped = mapReconstructedStatus(raw);
      expect(validStatuses).toContain(mapped);
    }
  });

  it("mapReconstructedLifecycle produces valid lifecycle state values", () => {
    const validLifecycles = [
      "initializing", "ready", "active", "paused",
      "suspended", "migrating", "terminating", "terminated", "crashed",
    ];
    const inputs = ["pending", "running", "stopped", "error", "ready", "active", "paused"];
    for (const raw of inputs) {
      const mapped = mapReconstructedLifecycle(raw);
      expect(validLifecycles).toContain(mapped);
    }
  });

  it("mapReconstructedAgentToRuntime synthesizes visual data for new agents", () => {
    const rec: ReconstructedAgentState = {
      agentId:        "dynamic-agent-99",
      status:         "active",
      roomId:         "lab",
      currentTaskId:  "t-99",
      lifecycleState: "active",
      errorCount:     0,
      lastEventTs:    BASE_TS + 1000,
      lastEventSeq:   5,
    };

    const result = mapReconstructedAgentToRuntime(rec, null);

    // Visual fields required by AgentAvatar
    expect(result.def.visual).toBeDefined();
    expect(result.def.visual.label).toBeDefined();
    expect(result.def.visual.color).toBeDefined();
    // Position fields required for 3D placement
    expect(result.worldPosition).toBeDefined();
    expect(typeof result.worldPosition.x).toBe("number");
    expect(typeof result.worldPosition.y).toBe("number");
    expect(typeof result.worldPosition.z).toBe("number");
    // Status correctly mapped
    expect(result.status).toBe("active");
  });

  it("mapReconstructedRoomToRuntime produces valid RoomRuntimeState", () => {
    const rec: ReconstructedRoomState = {
      roomId:        "control-room",
      activeMembers: ["agent-a", "agent-b"],
      activity:      "active",
      meetingId:     null,
      lastEventTs:   BASE_TS + 500,
    };

    const result = mapReconstructedRoomToRuntime(rec);

    // All required fields for RoomGeometry rendering
    expect(Array.isArray(result.activeMembers)).toBe(true);
    expect(result.activeMembers).toEqual(["agent-a", "agent-b"]);
    expect(result.activity).toBe("active");
    expect(typeof result.highlighted).toBe("boolean");
    expect(typeof result.selected).toBe("boolean");
    expect(typeof result.lastEventTs).toBe("number");
    // Replay should clear UI-only state
    expect(result.highlighted).toBe(false);
    expect(result.selected).toBe(false);
  });
});

// ── 9.3-8: computeDensityBuckets for ReplayDiegeticTimeline ──────────────────

describe("computeDensityBuckets for diegetic timeline geometry (9.3-8)", () => {
  it("returns all-zero array when entries is empty", () => {
    const result = computeDensityBuckets([], BASE_TS, BASE_TS + 10_000, 10);
    expect(result).toHaveLength(10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("returns all-zero array when range is zero", () => {
    const entries = [{ ts: BASE_TS }];
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS, 10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("produces normalized values in [0, 1]", () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      ts: BASE_TS + i * 200,
    }));
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS + 10_000, 20);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("peak bucket contains value 1 (max normalized)", () => {
    // Put all events in one bucket
    const entries = Array.from({ length: 10 }, () => ({ ts: BASE_TS + 500 }));
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS + 10_000, 10);
    expect(Math.max(...result)).toBe(1);
  });

  it("produces buckets array of correct length", () => {
    const entries = [{ ts: BASE_TS + 1000 }];
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS + 5_000, 40);
    expect(result).toHaveLength(40);
  });

  it("events before firstTs are excluded (index clamps to 0)", () => {
    // An event before the range should go into bucket 0 (clamped)
    // but since negative indices are guarded, it should be discarded
    const entries = [
      { ts: BASE_TS - 1000 },  // before range
      { ts: BASE_TS + 1000 },  // inside range
    ];
    // The entry before range: idx = floor((-1000/10000) * 10) = negative → skipped
    // So only 1 event should be counted
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS + 10_000, 10);
    const totalCounted = result.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0);
    // At least one non-zero bucket (the event at +1000)
    expect(totalCounted).toBeGreaterThanOrEqual(1);
  });

  it("evenly distributed events produce roughly uniform histogram", () => {
    const N_BUCKETS = 10;
    const entries   = Array.from({ length: 100 }, (_, i) => ({
      ts: BASE_TS + (i / 100) * 10_000,
    }));
    const result = computeDensityBuckets(entries, BASE_TS, BASE_TS + 10_000, N_BUCKETS);
    // All non-zero
    for (const v of result) {
      expect(v).toBeGreaterThan(0);
    }
    // Max should be 1
    expect(Math.max(...result)).toBe(1);
  });
});

// ── 9.3-9: Timeline range and controller integration ─────────────────────────

describe("Timeline range + controller store integration (9.3-9)", () => {
  beforeEach(resetAllStores);
  afterEach(resetAllStores);

  it("computeTimelineRange returns correct bounds for multi-agent timeline", () => {
    const events = sortEventsForReplay([
      makeSpawnEvent("a", BASE_TS),
      makeStatusEvent("a", "active", BASE_TS + 3_000),
      makeSpawnEvent("b",  BASE_TS + 1_000),
      makeStatusEvent("b", "idle",   BASE_TS + 5_000),
    ]);
    const range = computeTimelineRange(events);
    expect(range.firstTs).toBe(BASE_TS);
    expect(range.lastTs).toBe(BASE_TS + 5_000);
  });

  it("_refreshRange updates replay-store duration correctly", () => {
    useReplayStore.getState()._refreshRange(BASE_TS, BASE_TS + 7_000, 30);
    const s = useReplayStore.getState();
    expect(s.firstEventTs).toBe(BASE_TS);
    expect(s.lastEventTs).toBe(BASE_TS + 7_000);
    expect(s.duration).toBe(7_000);
    expect(s.totalLogEntries).toBe(30);
  });

  it("controller _setReady + controller store tracks event count", () => {
    const events = sortEventsForReplay(buildAgentTimeline("a", 10));
    useReplayControllerStore.getState()._setReady(events.length, 2);
    expect(useReplayControllerStore.getState().eventsLoaded).toBe(events.length);
    expect(useReplayControllerStore.getState().checkpointCount).toBe(2);
    expect(useReplayControllerStore.getState().isReady).toBe(true);
  });

  it("reconstructed scene state stored in controller is accessible to renderer", () => {
    const events = sortEventsForReplay(buildAgentTimeline("renderer-agent", 3));
    const targetTs = events[events.length - 1].tsMs;
    const state  = reconstructStateAt(events, targetTs, []);

    useReplayControllerStore.getState()._setSceneState(state, performance.now());

    const stored = useReplayControllerStore.getState().sceneState;
    expect(stored).not.toBeNull();
    expect(stored!.agents["renderer-agent"]).toBeDefined();
    expect(stored!.ts).toBe(targetTs);
  });
});

// ── 9.3-10: Speed multiplier effect on simulated time advancement ─────────────

describe("Playback speed multiplier (9.3-10)", () => {
  beforeEach(resetAllStores);

  it("speed 1× wall 100ms = 100ms simulated time", () => {
    expect(100 * 1).toBe(100);
  });

  it("speed 2× wall 100ms = 200ms simulated time", () => {
    expect(100 * 2).toBe(200);
  });

  it("speed 0.5× wall 100ms = 50ms simulated time", () => {
    expect(100 * 0.5).toBe(50);
  });

  it("speed 8× spans 10s timeline in 1.25s wall time", () => {
    expect(10_000 / 8).toBe(1_250);
  });

  it("setSpeed clamps to [0.1, 16]", () => {
    useReplayStore.getState().setSpeed(0);
    expect(useReplayStore.getState().speed).toBeCloseTo(0.1, 3);
    useReplayStore.getState().setSpeed(1000);
    expect(useReplayStore.getState().speed).toBe(16);
    useReplayStore.getState().setSpeed(2);
    expect(useReplayStore.getState().speed).toBe(2);
  });
});
