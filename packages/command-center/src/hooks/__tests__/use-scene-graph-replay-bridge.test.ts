/**
 * use-scene-graph-replay-bridge.test.ts — Sub-AC 9d
 *
 * Tests for the scene-graph replay bridge that wires useReplayControllerStore
 * to the 3D scene objects (agent-store, spatial-store).
 *
 * Coverage:
 *   - mapReconstructedStatus: protocol status → AgentStatus enum
 *   - mapReconstructedLifecycle: protocol lifecycle → AgentLifecycleState
 *   - roomCentreWorldPos: roomId → world-space centre
 *   - mapReconstructedAgentToRuntime: full agent state mapping
 *   - mapReconstructedRoomToRuntime: full room state mapping
 *   - applyAgentDiff: merge reconstruction into live agent map
 *   - applyRoomDiff: merge reconstruction into live room map
 *   - Store integration: bridge applies diffs to agent-store + spatial-store
 *
 * Test ID scheme:
 *   9d-N : Sub-AC 9d scene-graph replay bridge
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  mapReconstructedStatus,
  mapReconstructedLifecycle,
  roomCentreWorldPos,
  mapReconstructedAgentToRuntime,
  mapReconstructedRoomToRuntime,
  applyAgentDiff,
  applyRoomDiff,
} from "../use-scene-graph-replay-bridge.js";
import { useAgentStore } from "../../store/agent-store.js";
import { useSpatialStore } from "../../store/spatial-store.js";
import { useReplayStore } from "../../store/replay-store.js";
import { useReplayControllerStore } from "../use-replay-controller.js";
import type {
  ReconstructedAgentState,
  ReconstructedRoomState,
  ReconstructedSceneState,
} from "../../replay/state-reconstruction-engine.js";
import type { AgentRuntimeState } from "../../store/agent-store.js";
import type { RoomRuntimeState } from "../../store/spatial-store.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000;

function makeReconstructedAgent(
  agentId: string,
  overrides: Partial<ReconstructedAgentState> = {},
): ReconstructedAgentState {
  return {
    agentId,
    status:        "idle",
    roomId:        "control-room",
    currentTaskId: null,
    lifecycleState: "ready",
    errorCount:    0,
    lastEventTs:   BASE_TS,
    lastEventSeq:  1,
    ...overrides,
  };
}

function makeReconstructedRoom(
  roomId: string,
  overrides: Partial<ReconstructedRoomState> = {},
): ReconstructedRoomState {
  return {
    roomId,
    activeMembers: [],
    activity:      "idle",
    meetingId:     null,
    lastEventTs:   BASE_TS,
    ...overrides,
  };
}

function makeLiveAgent(agentId: string, roomId = "lobby"): AgentRuntimeState {
  return {
    def: {
      agentId,
      name: `Agent ${agentId}`,
      role: "implementer",
      defaultRoom: roomId,
      capabilities: [],
      riskClass: "low",
      summary: "test agent",
      visual: { label: agentId, color: "#4a6aff", icon: "◆" },
    },
    status: "inactive",
    lifecycleState: "initializing",
    isDynamic: false,
    roomId,
    localPosition: { x: 0.3, y: 0, z: 0.5 },
    worldPosition: { x: 1.5, y: 0, z: 2.0 },
    currentTaskId: null,
    currentTaskTitle: null,
    lastStatusChangeTs: 0,
    lastLifecycleChangeTs: 0,
    hovered: false,
    spawnTs: BASE_TS,
    spawnIndex: 0,
  };
}

function makeLiveRoomState(roomId: string): RoomRuntimeState {
  return {
    activeMembers: ["agent-a"],
    activity:     "active",
    highlighted:  true,
    selected:     true,
    lastEventTs:  BASE_TS - 1000,
    paused:       false,
  };
}

function makeEmptySceneState(): ReconstructedSceneState {
  return {
    ts: BASE_TS,
    seq: 0,
    eventsApplied: 0,
    agents: {},
    rooms: {},
    tasks: {},
    commands: {},
    pipelines: {},
  };
}

// ── mapReconstructedStatus ────────────────────────────────────────────────────

describe("mapReconstructedStatus (9d-1)", () => {
  it("maps 'spawned' to 'idle'", () => {
    expect(mapReconstructedStatus("spawned")).toBe("idle");
  });

  it("maps 'idle' to 'idle'", () => {
    expect(mapReconstructedStatus("idle")).toBe("idle");
  });

  it("maps 'ready' to 'idle'", () => {
    expect(mapReconstructedStatus("ready")).toBe("idle");
  });

  it("maps 'active' to 'active'", () => {
    expect(mapReconstructedStatus("active")).toBe("active");
  });

  it("maps 'busy' to 'active'", () => {
    expect(mapReconstructedStatus("busy")).toBe("active");
  });

  it("maps 'error' to 'error'", () => {
    expect(mapReconstructedStatus("error")).toBe("error");
  });

  it("maps 'crashed' to 'error'", () => {
    expect(mapReconstructedStatus("crashed")).toBe("error");
  });

  it("maps 'terminated' to 'terminated'", () => {
    expect(mapReconstructedStatus("terminated")).toBe("terminated");
  });

  it("maps 'despawned' to 'terminated'", () => {
    expect(mapReconstructedStatus("despawned")).toBe("terminated");
  });

  it("maps 'paused' to 'idle'", () => {
    expect(mapReconstructedStatus("paused")).toBe("idle");
  });

  it("maps unknown value to 'idle'", () => {
    expect(mapReconstructedStatus("unknown_xyz")).toBe("idle");
  });
});

// ── mapReconstructedLifecycle ─────────────────────────────────────────────────

describe("mapReconstructedLifecycle (9d-2)", () => {
  it("passes through 'ready' unchanged", () => {
    expect(mapReconstructedLifecycle("ready")).toBe("ready");
  });

  it("passes through 'active' unchanged", () => {
    expect(mapReconstructedLifecycle("active")).toBe("active");
  });

  it("passes through 'paused' unchanged", () => {
    expect(mapReconstructedLifecycle("paused")).toBe("paused");
  });

  it("passes through 'terminated' unchanged", () => {
    expect(mapReconstructedLifecycle("terminated")).toBe("terminated");
  });

  it("passes through 'crashed' unchanged", () => {
    expect(mapReconstructedLifecycle("crashed")).toBe("crashed");
  });

  it("maps 'pending' to 'initializing'", () => {
    expect(mapReconstructedLifecycle("pending")).toBe("initializing");
  });

  it("maps 'running' to 'active'", () => {
    expect(mapReconstructedLifecycle("running")).toBe("active");
  });

  it("maps 'stopped' to 'terminated'", () => {
    expect(mapReconstructedLifecycle("stopped")).toBe("terminated");
  });

  it("maps 'error' to 'crashed'", () => {
    expect(mapReconstructedLifecycle("error")).toBe("crashed");
  });

  it("maps unknown value to 'ready'", () => {
    expect(mapReconstructedLifecycle("nonexistent_state")).toBe("ready");
  });
});

// ── roomCentreWorldPos ────────────────────────────────────────────────────────

describe("roomCentreWorldPos (9d-3)", () => {
  it("returns origin for unknown roomId", () => {
    const pos = roomCentreWorldPos("nonexistent-room-xyz");
    expect(pos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("returns a valid object with x, y, z keys", () => {
    // Use a room that may or may not exist — just check structure
    const pos = roomCentreWorldPos("lobby");
    expect(pos).toHaveProperty("x");
    expect(pos).toHaveProperty("y");
    expect(pos).toHaveProperty("z");
  });

  it("returns numeric coordinates", () => {
    const pos = roomCentreWorldPos("lobby");
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
    expect(typeof pos.z).toBe("number");
  });
});

// ── mapReconstructedAgentToRuntime ────────────────────────────────────────────

describe("mapReconstructedAgentToRuntime (9d-4)", () => {
  it("maps status correctly", () => {
    const rec = makeReconstructedAgent("agent-1", { status: "active" });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.status).toBe("active");
  });

  it("maps lifecycleState correctly", () => {
    const rec = makeReconstructedAgent("agent-1", { lifecycleState: "paused" });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.lifecycleState).toBe("paused");
  });

  it("uses roomId from reconstruction", () => {
    const rec = makeReconstructedAgent("agent-1", { roomId: "archive" });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.roomId).toBe("archive");
  });

  it("falls back to 'lobby' when roomId is null and no live agent", () => {
    const rec = makeReconstructedAgent("agent-1", { roomId: null });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.roomId).toBe("lobby");
  });

  it("preserves live agent def when available", () => {
    const rec  = makeReconstructedAgent("agent-1");
    const live = makeLiveAgent("agent-1");
    const result = mapReconstructedAgentToRuntime(rec, live);
    expect(result.def).toBe(live.def);
  });

  it("uses live agent worldPosition when room hasn't changed", () => {
    const live = makeLiveAgent("agent-1", "lobby");
    const rec  = makeReconstructedAgent("agent-1", { roomId: "lobby" });
    const result = mapReconstructedAgentToRuntime(rec, live);
    expect(result.worldPosition).toEqual(live.worldPosition);
  });

  it("recomputes worldPosition when agent moved to new room", () => {
    const live = makeLiveAgent("agent-1", "lobby");
    const rec  = makeReconstructedAgent("agent-1", { roomId: "archive" });
    const result = mapReconstructedAgentToRuntime(rec, live);
    // Should NOT be the same as the live position (different room)
    // (exact value depends on building data, but it shouldn't equal lobby pos)
    expect(result.worldPosition).not.toEqual(live.worldPosition);
  });

  it("maps currentTaskId from reconstruction", () => {
    const rec = makeReconstructedAgent("agent-1", { currentTaskId: "task-42" });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.currentTaskId).toBe("task-42");
  });

  it("sets lastStatusChangeTs from reconstruction lastEventTs", () => {
    const rec = makeReconstructedAgent("agent-1", { lastEventTs: BASE_TS + 999 });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.lastStatusChangeTs).toBe(BASE_TS + 999);
  });

  it("sets hovered to false (no hover state in replay)", () => {
    const rec = makeReconstructedAgent("agent-1");
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.hovered).toBe(false);
  });

  it("preserves live spawnTs and spawnIndex", () => {
    const live = { ...makeLiveAgent("agent-1"), spawnTs: BASE_TS + 5000, spawnIndex: 3 };
    const rec  = makeReconstructedAgent("agent-1");
    const result = mapReconstructedAgentToRuntime(rec, live);
    expect(result.spawnTs).toBe(BASE_TS + 5000);
    expect(result.spawnIndex).toBe(3);
  });

  it("creates a synthetic def when live agent is null", () => {
    const rec = makeReconstructedAgent("new-agent-xyz", { roomId: "office" });
    const result = mapReconstructedAgentToRuntime(rec, null);
    expect(result.def.agentId).toBe("new-agent-xyz");
    expect(result.def.role).toBe("implementer");
  });
});

// ── mapReconstructedRoomToRuntime ─────────────────────────────────────────────

describe("mapReconstructedRoomToRuntime (9d-5)", () => {
  it("maps activeMembers correctly", () => {
    const rec = makeReconstructedRoom("room-1", { activeMembers: ["a", "b"] });
    const result = mapReconstructedRoomToRuntime(rec);
    expect(result.activeMembers).toEqual(["a", "b"]);
  });

  it("returns a fresh copy of activeMembers (not same reference)", () => {
    const members = ["x", "y"];
    const rec = makeReconstructedRoom("room-1", { activeMembers: members });
    const result = mapReconstructedRoomToRuntime(rec);
    expect(result.activeMembers).not.toBe(members);
  });

  it("maps 'active' activity", () => {
    const rec = makeReconstructedRoom("room-1", { activity: "active" });
    expect(mapReconstructedRoomToRuntime(rec).activity).toBe("active");
  });

  it("maps 'meeting' activity", () => {
    const rec = makeReconstructedRoom("room-1", { activity: "meeting" });
    expect(mapReconstructedRoomToRuntime(rec).activity).toBe("meeting");
  });

  it("maps 'offline' activity", () => {
    const rec = makeReconstructedRoom("room-1", { activity: "offline" });
    expect(mapReconstructedRoomToRuntime(rec).activity).toBe("offline");
  });

  it("maps unknown activity to 'idle'", () => {
    const rec = makeReconstructedRoom("room-1", { activity: "unknown_activity" });
    expect(mapReconstructedRoomToRuntime(rec).activity).toBe("idle");
  });

  it("sets highlighted and selected to false (no UI state in replay)", () => {
    const rec = makeReconstructedRoom("room-1");
    const result = mapReconstructedRoomToRuntime(rec);
    expect(result.highlighted).toBe(false);
    expect(result.selected).toBe(false);
  });

  it("sets paused to false in replay", () => {
    const rec = makeReconstructedRoom("room-1");
    expect(mapReconstructedRoomToRuntime(rec).paused).toBe(false);
  });

  it("maps lastEventTs from reconstruction", () => {
    const rec = makeReconstructedRoom("room-1", { lastEventTs: BASE_TS + 2000 });
    expect(mapReconstructedRoomToRuntime(rec).lastEventTs).toBe(BASE_TS + 2000);
  });
});

// ── applyAgentDiff ────────────────────────────────────────────────────────────

describe("applyAgentDiff (9d-6)", () => {
  it("returns baseline live agents when scene state has no agents", () => {
    const live = { "a1": makeLiveAgent("a1") };
    const scene = makeEmptySceneState();
    const result = applyAgentDiff(scene, live);
    expect(result["a1"]).toBeDefined();
  });

  it("overrides live agent with reconstructed state", () => {
    const live  = { "a1": makeLiveAgent("a1", "lobby") };
    const scene = {
      ...makeEmptySceneState(),
      agents: { "a1": makeReconstructedAgent("a1", { status: "active", roomId: "office" }) },
    };
    const result = applyAgentDiff(scene, live);
    expect(result["a1"].status).toBe("active");
    expect(result["a1"].roomId).toBe("office");
  });

  it("preserves agents not in reconstruction (absent from event window)", () => {
    const live = {
      "a1": makeLiveAgent("a1"),
      "a2": makeLiveAgent("a2"),  // a2 has no events in this replay window
    };
    const scene = {
      ...makeEmptySceneState(),
      agents: { "a1": makeReconstructedAgent("a1", { status: "error" }) },
    };
    const result = applyAgentDiff(scene, live);
    expect(result["a2"]).toBe(live["a2"]);
  });

  it("adds new agents present in reconstruction but not in live store", () => {
    const live  = {};
    const scene = {
      ...makeEmptySceneState(),
      agents: { "new-agent": makeReconstructedAgent("new-agent") },
    };
    const result = applyAgentDiff(scene, live);
    expect(result["new-agent"]).toBeDefined();
    expect(result["new-agent"].def.agentId).toBe("new-agent");
  });

  it("does not mutate the input live agents map", () => {
    const live  = { "a1": makeLiveAgent("a1") };
    const scene = {
      ...makeEmptySceneState(),
      agents: { "a1": makeReconstructedAgent("a1", { status: "terminated" }) },
    };
    applyAgentDiff(scene, live);
    // Original live agent should be unchanged
    expect(live["a1"].status).toBe("inactive");
  });
});

// ── applyRoomDiff ─────────────────────────────────────────────────────────────

describe("applyRoomDiff (9d-7)", () => {
  it("returns baseline live rooms when scene state has no rooms", () => {
    const live  = { "room-1": makeLiveRoomState("room-1") };
    const scene = makeEmptySceneState();
    const result = applyRoomDiff(scene, live);
    expect(result["room-1"]).toBeDefined();
  });

  it("overrides live room with reconstructed state", () => {
    const live  = { "room-1": makeLiveRoomState("room-1") };
    const scene = {
      ...makeEmptySceneState(),
      rooms: { "room-1": makeReconstructedRoom("room-1", { activity: "meeting", activeMembers: ["agent-x"] }) },
    };
    const result = applyRoomDiff(scene, live);
    expect(result["room-1"].activity).toBe("meeting");
    expect(result["room-1"].activeMembers).toEqual(["agent-x"]);
  });

  it("clears highlighted/selected state from reconstructed rooms", () => {
    const live  = { "room-1": makeLiveRoomState("room-1") };
    const scene = {
      ...makeEmptySceneState(),
      rooms: { "room-1": makeReconstructedRoom("room-1") },
    };
    const result = applyRoomDiff(scene, live);
    expect(result["room-1"].highlighted).toBe(false);
    expect(result["room-1"].selected).toBe(false);
  });

  it("preserves live rooms absent from reconstruction", () => {
    const live  = {
      "room-1": makeLiveRoomState("room-1"),
      "room-2": makeLiveRoomState("room-2"),
    };
    const scene = {
      ...makeEmptySceneState(),
      rooms: { "room-1": makeReconstructedRoom("room-1") },
    };
    const result = applyRoomDiff(scene, live);
    expect(result["room-2"]).toBe(live["room-2"]);
  });

  it("does not mutate the input live rooms map", () => {
    const live  = { "room-1": makeLiveRoomState("room-1") };
    const origActivity = live["room-1"].activity;
    const scene = {
      ...makeEmptySceneState(),
      rooms: { "room-1": makeReconstructedRoom("room-1", { activity: "offline" }) },
    };
    applyRoomDiff(scene, live);
    expect(live["room-1"].activity).toBe(origActivity);
  });
});

// ── Store integration ─────────────────────────────────────────────────────────

describe("Store integration via controller store (9d-8)", () => {
  beforeEach(() => {
    // Reset replay store to known live mode
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

    // Reset controller store
    useReplayControllerStore.getState()._reset();
  });

  it("controller store initialises with null sceneState", () => {
    const { sceneState } = useReplayControllerStore.getState();
    expect(sceneState).toBeNull();
  });

  it("controller store _setSceneState updates sceneState", () => {
    const state = makeEmptySceneState();
    useReplayControllerStore.getState()._setSceneState(state, performance.now());
    expect(useReplayControllerStore.getState().sceneState).toBe(state);
  });

  it("controller store _setReady marks controller as ready", () => {
    useReplayControllerStore.getState()._setReady(100, 2);
    const { isReady, eventsLoaded, checkpointCount } = useReplayControllerStore.getState();
    expect(isReady).toBe(true);
    expect(eventsLoaded).toBe(100);
    expect(checkpointCount).toBe(2);
  });

  it("controller store _setLoading marks controller as not ready", () => {
    useReplayControllerStore.getState()._setReady(100, 2);
    useReplayControllerStore.getState()._setLoading();
    expect(useReplayControllerStore.getState().isReady).toBe(false);
  });

  it("controller store _reset clears all state", () => {
    useReplayControllerStore.getState()._setReady(50, 1);
    useReplayControllerStore.getState()._reset();
    const { isReady, sceneState, eventsLoaded, reconstructionCount } =
      useReplayControllerStore.getState();
    expect(isReady).toBe(false);
    expect(sceneState).toBeNull();
    expect(eventsLoaded).toBe(0);
    expect(reconstructionCount).toBe(0);
  });

  it("reconstructionCount increments on each _setSceneState call", () => {
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(0);
    useReplayControllerStore.getState()._setSceneState(makeEmptySceneState(), performance.now());
    useReplayControllerStore.getState()._setSceneState(makeEmptySceneState(), performance.now());
    expect(useReplayControllerStore.getState().reconstructionCount).toBe(2);
  });
});

// ── Agent store replay integration ───────────────────────────────────────────

describe("Agent store replay mode integration (9d-9)", () => {
  beforeEach(() => {
    // Ensure agents are initialized before testing
    if (!useAgentStore.getState().initialized) {
      useAgentStore.getState().initializeAgents();
    }
    // Reset any lingering replay state
    useAgentStore.getState()._exitReplayMode();
  });

  it("_savedLiveAgents is null before enterReplayMode", () => {
    expect(useAgentStore.getState()._savedLiveAgents).toBeNull();
  });

  it("_enterReplayMode saves agent state", () => {
    const agentCount = Object.keys(useAgentStore.getState().agents).length;
    useAgentStore.getState()._enterReplayMode();
    const saved = useAgentStore.getState()._savedLiveAgents;
    expect(saved).not.toBeNull();
    expect(Object.keys(saved!).length).toBe(agentCount);
    // Cleanup
    useAgentStore.getState()._exitReplayMode();
  });

  it("_applyReplayAgents changes agents silently", () => {
    useAgentStore.getState()._enterReplayMode();
    const originalAgents = useAgentStore.getState().agents;
    const eventsBefore = useAgentStore.getState().events.length;

    // Apply replay state that changes first agent to 'error'
    const firstId = Object.keys(originalAgents)[0];
    if (firstId) {
      const replayMap = {
        ...originalAgents,
        [firstId]: { ...originalAgents[firstId], status: "error" as const },
      };
      useAgentStore.getState()._applyReplayAgents(replayMap);
      expect(useAgentStore.getState().agents[firstId].status).toBe("error");
      // No new events should have been emitted
      expect(useAgentStore.getState().events.length).toBe(eventsBefore);
    }

    // Cleanup
    useAgentStore.getState()._exitReplayMode();
  });

  it("_exitReplayMode restores original agent state", () => {
    const originalAgents = { ...useAgentStore.getState().agents };
    useAgentStore.getState()._enterReplayMode();

    // Modify
    const firstId = Object.keys(originalAgents)[0];
    if (firstId) {
      useAgentStore.getState()._applyReplayAgents({
        [firstId]: { ...originalAgents[firstId], status: "error" as const },
      });
    }

    // Restore
    useAgentStore.getState()._exitReplayMode();
    expect(useAgentStore.getState()._savedLiveAgents).toBeNull();
    if (firstId) {
      expect(useAgentStore.getState().agents[firstId].status).toBe(
        originalAgents[firstId].status,
      );
    }
  });
});

// ── Spatial store replay integration ─────────────────────────────────────────

describe("Spatial store replay mode integration (9d-10)", () => {
  beforeEach(() => {
    // Exit any lingering replay mode
    useSpatialStore.getState()._exitReplayMode();
  });

  it("_savedLiveRoomStates is null before enterReplayMode", () => {
    expect(useSpatialStore.getState()._savedLiveRoomStates).toBeNull();
  });

  it("_enterReplayMode saves room states", () => {
    useSpatialStore.getState()._enterReplayMode();
    expect(useSpatialStore.getState()._savedLiveRoomStates).not.toBeNull();
    useSpatialStore.getState()._exitReplayMode();
  });

  it("_applyReplayRoomStates changes room states silently", () => {
    useSpatialStore.getState()._enterReplayMode();

    const replayRooms: Record<string, RoomRuntimeState> = {
      "test-room": {
        activeMembers: ["agent-test"],
        activity:     "meeting",
        highlighted:  false,
        selected:     false,
        lastEventTs:  BASE_TS,
        paused:       false,
      },
    };

    useSpatialStore.getState()._applyReplayRoomStates(replayRooms);
    expect(useSpatialStore.getState().roomStates["test-room"]).toBeDefined();
    expect(useSpatialStore.getState().roomStates["test-room"].activity).toBe("meeting");

    useSpatialStore.getState()._exitReplayMode();
  });

  it("_exitReplayMode restores saved room states", () => {
    const originalRooms = { ...useSpatialStore.getState().roomStates };
    useSpatialStore.getState()._enterReplayMode();

    // Apply modified state
    useSpatialStore.getState()._applyReplayRoomStates({
      "injected-room": {
        activeMembers: [],
        activity: "offline",
        highlighted: false,
        selected: false,
        lastEventTs: BASE_TS,
        paused: false,
      },
    });

    useSpatialStore.getState()._exitReplayMode();
    expect(useSpatialStore.getState()._savedLiveRoomStates).toBeNull();
    // The injected room should be gone (restored to original)
    expect(useSpatialStore.getState().roomStates["injected-room"]).toEqual(
      originalRooms["injected-room"],
    );
  });
});
