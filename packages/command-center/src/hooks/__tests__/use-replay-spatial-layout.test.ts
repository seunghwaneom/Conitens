/**
 * use-replay-spatial-layout.test.ts — Sub-AC 9c
 *
 * Tests that the replay cursor integrates with the 3D renderer by reading
 * spatial_layout from replay_state at each cursor position.
 *
 * Test ID scheme: 9sl-store-N
 *
 * Coverage:
 *   9sl-store-1  : Store initializes with null spatialLayout and isActive=false
 *   9sl-store-2  : _setActive(true) sets isActive
 *   9sl-store-3  : _setLayout writes layout and increments count
 *   9sl-store-4  : _reset clears all state
 *   9sl-store-5  : getReplayRoomPosition returns null when store is inactive
 *   9sl-store-6  : getReplayAgentPosition returns null when store is inactive
 *   9sl-store-7  : getReplayRoomPosition returns position when active + layout has room
 *   9sl-store-8  : getReplayAgentPosition returns position when active + layout has agent
 *   9sl-store-9  : Seeking replay to different ts changes the reconstructed spatial layout
 *   9sl-store-10 : In live mode, spatialLayout is null (zero overhead)
 *   9sl-store-11 : Spatial layout hasAnchor=false when no layout.init event exists
 *   9sl-store-12 : Spatial layout hasAnchor=true when layout.init event exists
 *   9sl-store-13 : Room node position matches layout.init payload
 *   9sl-store-14 : Room node position updated after layout.node.moved event
 *   9sl-store-15 : Multiple seeks produce monotonically correct spatial states
 *   9sl-store-16 : Reconstruction is deterministic: same ts → same layout
 *   9sl-store-17 : REPLAY_SPATIAL_LAYOUT_STORE_VERSION is a non-empty string
 *   9sl-store-18 : reconstructionCount increments on each _setLayout call
 *   9sl-store-19 : Layout with empty rooms record has no room nodes
 *   9sl-store-20 : Agent node in spatial layout reflects layout.init agent position
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useReplaySpatialLayoutStore,
  getReplayRoomPosition,
  getReplayAgentPosition,
  REPLAY_SPATIAL_LAYOUT_STORE_VERSION,
} from "../use-replay-spatial-layout.js";
import {
  reconstructSpatialLayoutAt,
  emptySpatialLayout,
  type ReconstructedSpatialLayout,
  type Vec3,
} from "../../replay/spatial-layout-reconstruction.js";
import { useReplayStore } from "../../store/replay-store.js";
import type { TypedReplayEvent, StateChangeReplayEvent } from "../../replay/event-log-schema.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const BASE_TS = 3_000_000_000;
let _seq = 0;

function resetSeq() { _seq = 0; }
function nextSeq() { return ++_seq; }

function makeLayoutInitEvent(
  layoutId: string,
  buildingId: string,
  rooms: Record<string, { position: Vec3; floor?: number }>,
  tsMs: number = BASE_TS,
): StateChangeReplayEvent {
  const roomPayloads = Object.entries(rooms).map(([roomId, data]) => ({
    room_id:  roomId,
    position: data.position,
    rotation: { x: 0, y: 0, z: 0 },
    scale:    { x: 1, y: 1, z: 1 },
    floor:    data.floor ?? 0,
  }));

  return {
    replayCategory: "state_change",
    raw: {
      schema:   "conitens.event.v1",
      event_id: `evt-layout-init-${tsMs}`,
      type:     "layout.init",
      ts:       new Date(tsMs).toISOString(),
      run_id:   "run-9sl",
      actor:    { kind: "system", id: "orchestrator" },
      payload: {
        layout_id:   layoutId,
        building_id: buildingId,
        rooms:       roomPayloads,
        agents:      [],
        fixtures:    [],
      },
    },
    type:     "layout.init",
    ts:       new Date(tsMs).toISOString(),
    tsMs,
    seq:      nextSeq(),
    actor:    { kind: "system", id: "orchestrator" },
    run_id:   "run-9sl",
    domain:   "layout",
    typedPayload: {
      layout_id:   layoutId,
      building_id: buildingId,
      rooms:       roomPayloads,
      agents:      [],
      fixtures:    [],
    } as unknown as StateChangeReplayEvent["typedPayload"],  // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

function makeLayoutNodeMovedEvent(
  nodeId: string,
  nodeType: string,
  toPosition: Vec3,
  tsMs: number,
): StateChangeReplayEvent {
  return {
    replayCategory: "state_change",
    raw: {
      schema:   "conitens.event.v1",
      event_id: `evt-layout-moved-${nodeId}-${tsMs}`,
      type:     "layout.node.moved",
      ts:       new Date(tsMs).toISOString(),
      run_id:   "run-9sl",
      actor:    { kind: "system", id: "orchestrator" },
      payload: {
        node_id:     nodeId,
        node_type:   nodeType,
        to_position: toPosition,
      },
    },
    type:     "layout.node.moved",
    ts:       new Date(tsMs).toISOString(),
    tsMs,
    seq:      nextSeq(),
    actor:    { kind: "system", id: "orchestrator" },
    run_id:   "run-9sl",
    domain:   "layout",
    typedPayload: {
      node_id:     nodeId,
      node_type:   nodeType,
      to_position: toPosition,
    } as unknown as StateChangeReplayEvent["typedPayload"],
  };
}

function makeLayoutInitWithAgentsEvent(
  layoutId: string,
  buildingId: string,
  agents: Record<string, { position: Vec3; roomId?: string }>,
  tsMs: number = BASE_TS,
): StateChangeReplayEvent {
  const agentPayloads = Object.entries(agents).map(([agentId, data]) => ({
    agent_id:  agentId,
    room_id:   data.roomId ?? null,
    position:  data.position,
    rotation:  { x: 0, y: 0, z: 0 },
  }));

  return {
    replayCategory: "state_change",
    raw: {
      schema:   "conitens.event.v1",
      event_id: `evt-layout-init-agents-${tsMs}`,
      type:     "layout.init",
      ts:       new Date(tsMs).toISOString(),
      run_id:   "run-9sl",
      actor:    { kind: "system", id: "orchestrator" },
      payload: {
        layout_id:   layoutId,
        building_id: buildingId,
        rooms:       [],
        agents:      agentPayloads,
        fixtures:    [],
      },
    },
    type:     "layout.init",
    ts:       new Date(tsMs).toISOString(),
    tsMs,
    seq:      nextSeq(),
    actor:    { kind: "system", id: "orchestrator" },
    run_id:   "run-9sl",
    domain:   "layout",
    typedPayload: {
      layout_id:   layoutId,
      building_id: buildingId,
      rooms:       [],
      agents:      agentPayloads,
      fixtures:    [],
    } as unknown as StateChangeReplayEvent["typedPayload"],
  };
}

function resetAllStores() {
  resetSeq();
  useReplaySpatialLayoutStore.getState()._reset();
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

// ─────────────────────────────────────────────────────────────────────────────
// ── 9sl-store-1..4: Store shape and lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("Store initialization and lifecycle (9sl-store-1..4)", () => {
  beforeEach(resetAllStores);

  it("9sl-store-1: initial state has null spatialLayout and isActive=false", () => {
    const s = useReplaySpatialLayoutStore.getState();
    expect(s.spatialLayout).toBeNull();
    expect(s.isActive).toBe(false);
    expect(s.lastLayoutTs).toBe(0);
    expect(s.reconstructionCount).toBe(0);
  });

  it("9sl-store-2: _setActive(true) marks the store active", () => {
    useReplaySpatialLayoutStore.getState()._setActive(true);
    expect(useReplaySpatialLayoutStore.getState().isActive).toBe(true);
  });

  it("9sl-store-3: _setLayout writes layout and increments reconstructionCount", () => {
    const layout = emptySpatialLayout(BASE_TS);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);
    const s = useReplaySpatialLayoutStore.getState();
    expect(s.spatialLayout).not.toBeNull();
    expect(s.lastLayoutTs).toBe(BASE_TS);
    expect(s.reconstructionCount).toBe(1);
  });

  it("9sl-store-4: _reset clears spatialLayout and resets counters", () => {
    const layout = emptySpatialLayout(BASE_TS);
    useReplaySpatialLayoutStore.getState()._setActive(true);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);
    useReplaySpatialLayoutStore.getState()._reset();
    const s = useReplaySpatialLayoutStore.getState();
    expect(s.spatialLayout).toBeNull();
    expect(s.isActive).toBe(false);
    expect(s.reconstructionCount).toBe(0);
    expect(s.lastLayoutTs).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 9sl-store-5..8: Accessor functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Position accessor functions (9sl-store-5..8)", () => {
  beforeEach(resetAllStores);

  it("9sl-store-5: getReplayRoomPosition returns null when store is inactive", () => {
    expect(getReplayRoomPosition("lobby")).toBeNull();
  });

  it("9sl-store-6: getReplayAgentPosition returns null when store is inactive", () => {
    expect(getReplayAgentPosition("agent-1")).toBeNull();
  });

  it("9sl-store-7: getReplayRoomPosition returns position when active + room in layout", () => {
    const layout = emptySpatialLayout(BASE_TS);
    layout.rooms["lobby"] = {
      roomId:       "lobby",
      position:     { x: 3.0, y: 0.0, z: 1.5 },
      rotation:     { x: 0, y: 0, z: 0 },
      scale:        { x: 1, y: 1, z: 1 },
      floor:        0,
      lastEventSeq: 1,
      lastEventTs:  BASE_TS,
    };
    useReplaySpatialLayoutStore.getState()._setActive(true);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);

    const pos = getReplayRoomPosition("lobby");
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(3.0);
    expect(pos!.y).toBeCloseTo(0.0);
    expect(pos!.z).toBeCloseTo(1.5);
  });

  it("9sl-store-8: getReplayAgentPosition returns position when active + agent in layout", () => {
    const layout = emptySpatialLayout(BASE_TS);
    layout.agents["agent-1"] = {
      agentId:      "agent-1",
      roomId:       "lobby",
      position:     { x: 1.0, y: 0.0, z: 2.0 },
      rotation:     { x: 0, y: 0, z: 0 },
      lastEventSeq: 1,
      lastEventTs:  BASE_TS,
    };
    useReplaySpatialLayoutStore.getState()._setActive(true);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);

    const pos = getReplayAgentPosition("agent-1");
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(1.0);
    expect(pos!.y).toBeCloseTo(0.0);
    expect(pos!.z).toBeCloseTo(2.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 9sl-store-9..16: Spatial layout reconstruction from events
// ─────────────────────────────────────────────────────────────────────────────

describe("Spatial layout reconstruction at cursor positions (9sl-store-9..16)", () => {
  beforeEach(resetAllStores);

  it("9sl-store-9: seeking to different timestamps changes the spatial layout content", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        lobby: { position: { x: 1.0, y: 0.0, z: 1.0 } },
      }, BASE_TS),
      makeLayoutNodeMovedEvent("lobby", "room", { x: 5.0, y: 0.0, z: 2.0 }, BASE_TS + 1000),
    ];

    // At BASE_TS — only layout.init applied
    const atInit = reconstructSpatialLayoutAt(events, BASE_TS);
    expect(atInit.rooms["lobby"]?.position.x).toBeCloseTo(1.0);

    // At BASE_TS + 1500 — layout.node.moved also applied
    const afterMove = reconstructSpatialLayoutAt(events, BASE_TS + 1500);
    expect(afterMove.rooms["lobby"]?.position.x).toBeCloseTo(5.0);
  });

  it("9sl-store-10: in live mode (mode='live'), spatialLayout in store stays null", () => {
    // Store starts in initial state (live mode)
    expect(useReplayStore.getState().mode).toBe("live");
    // Layout store should have null spatial layout (no reconstruction in live mode)
    expect(useReplaySpatialLayoutStore.getState().spatialLayout).toBeNull();
  });

  it("9sl-store-11: no layout.init event → hasAnchor=false in spatial layout", () => {
    const events: TypedReplayEvent[] = [
      // No layout.init — just some other events
    ];

    const layout = reconstructSpatialLayoutAt(events, BASE_TS);
    expect(layout.hasAnchor).toBe(false);
    expect(Object.keys(layout.rooms)).toHaveLength(0);
    expect(Object.keys(layout.agents)).toHaveLength(0);
  });

  it("9sl-store-12: layout.init event → hasAnchor=true in spatial layout", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        control: { position: { x: 2.0, y: 0.0, z: 3.0 } },
      }, BASE_TS),
    ];

    const layout = reconstructSpatialLayoutAt(events, BASE_TS);
    expect(layout.hasAnchor).toBe(true);
    expect(layout.buildingId).toBe("building-1");
    expect(layout.layoutId).toBe("layout-1");
  });

  it("9sl-store-13: room node position matches layout.init payload", () => {
    const roomPos: Vec3 = { x: 4.0, y: 0.5, z: 2.0 };
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        "control-room": { position: roomPos },
      }, BASE_TS),
    ];

    const layout = reconstructSpatialLayoutAt(events, BASE_TS);
    const node = layout.rooms["control-room"];
    expect(node).toBeDefined();
    expect(node!.position.x).toBeCloseTo(roomPos.x);
    expect(node!.position.y).toBeCloseTo(roomPos.y);
    expect(node!.position.z).toBeCloseTo(roomPos.z);
  });

  it("9sl-store-14: layout.node.moved updates room position after layout.init", () => {
    const initialPos: Vec3 = { x: 1.0, y: 0.0, z: 1.0 };
    const movedPos: Vec3   = { x: 7.0, y: 0.0, z: 3.0 };

    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        "ops-room": { position: initialPos },
      }, BASE_TS),
      makeLayoutNodeMovedEvent("ops-room", "room", movedPos, BASE_TS + 500),
    ];

    // At BASE_TS: only layout.init applied
    const before = reconstructSpatialLayoutAt(events, BASE_TS + 250);
    expect(before.rooms["ops-room"]?.position.x).toBeCloseTo(initialPos.x);

    // After the move event
    const after = reconstructSpatialLayoutAt(events, BASE_TS + 750);
    expect(after.rooms["ops-room"]?.position.x).toBeCloseTo(movedPos.x);
    expect(after.rooms["ops-room"]?.position.z).toBeCloseTo(movedPos.z);
  });

  it("9sl-store-15: multiple seeks produce consistently correct spatial states", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        lobby: { position: { x: 0.0, y: 0.0, z: 0.0 } },
        lab:   { position: { x: 5.0, y: 0.0, z: 5.0 } },
      }, BASE_TS),
      makeLayoutNodeMovedEvent("lobby", "room", { x: 1.0, y: 0.0, z: 1.0 }, BASE_TS + 1000),
      makeLayoutNodeMovedEvent("lab",   "room", { x: 6.0, y: 0.0, z: 6.0 }, BASE_TS + 2000),
    ];

    // At start — original positions
    const t0 = reconstructSpatialLayoutAt(events, BASE_TS);
    expect(t0.rooms["lobby"]?.position.x).toBeCloseTo(0.0);
    expect(t0.rooms["lab"]?.position.x).toBeCloseTo(5.0);

    // After first move — lobby moved
    const t1 = reconstructSpatialLayoutAt(events, BASE_TS + 1500);
    expect(t1.rooms["lobby"]?.position.x).toBeCloseTo(1.0);
    expect(t1.rooms["lab"]?.position.x).toBeCloseTo(5.0);

    // After both moves
    const t2 = reconstructSpatialLayoutAt(events, BASE_TS + 2500);
    expect(t2.rooms["lobby"]?.position.x).toBeCloseTo(1.0);
    expect(t2.rooms["lab"]?.position.x).toBeCloseTo(6.0);
  });

  it("9sl-store-16: determinism — same ts always produces identical spatial layout", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        room1: { position: { x: 1.0, y: 0.0, z: 1.0 } },
        room2: { position: { x: 2.0, y: 0.0, z: 2.0 } },
      }, BASE_TS),
      makeLayoutNodeMovedEvent("room1", "room", { x: 3.0, y: 0.0, z: 3.0 }, BASE_TS + 500),
    ];

    const targetTs = BASE_TS + 600;
    const layout1 = reconstructSpatialLayoutAt(events, targetTs);
    const layout2 = reconstructSpatialLayoutAt(events, targetTs);

    expect(layout1.rooms["room1"]?.position.x).toBe(layout2.rooms["room1"]?.position.x);
    expect(layout1.rooms["room2"]?.position.x).toBe(layout2.rooms["room2"]?.position.x);
    expect(layout1.ts).toBe(layout2.ts);
    expect(layout1.seq).toBe(layout2.seq);
    expect(layout1.anchorSeq).toBe(layout2.anchorSeq);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 9sl-store-17..20: Additional store and accessor tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Store version, count, and agent positions (9sl-store-17..20)", () => {
  beforeEach(resetAllStores);

  it("9sl-store-17: REPLAY_SPATIAL_LAYOUT_STORE_VERSION is a non-empty string", () => {
    expect(typeof REPLAY_SPATIAL_LAYOUT_STORE_VERSION).toBe("string");
    expect(REPLAY_SPATIAL_LAYOUT_STORE_VERSION.length).toBeGreaterThan(0);
    expect(REPLAY_SPATIAL_LAYOUT_STORE_VERSION).toContain("spatial-layout");
  });

  it("9sl-store-18: reconstructionCount increments on each _setLayout call", () => {
    const layout = emptySpatialLayout(BASE_TS);

    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);
    expect(useReplaySpatialLayoutStore.getState().reconstructionCount).toBe(1);

    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS + 100);
    expect(useReplaySpatialLayoutStore.getState().reconstructionCount).toBe(2);

    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS + 200);
    expect(useReplaySpatialLayoutStore.getState().reconstructionCount).toBe(3);
  });

  it("9sl-store-19: layout with no rooms has empty rooms record", () => {
    const layout = emptySpatialLayout(BASE_TS);
    useReplaySpatialLayoutStore.getState()._setActive(true);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);
    const stored = useReplaySpatialLayoutStore.getState().spatialLayout;
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!.rooms)).toHaveLength(0);
  });

  it("9sl-store-20: agent node in spatial layout reflects layout.init agent position", () => {
    const agentPos: Vec3 = { x: 2.5, y: 0.0, z: 3.5 };
    const events: TypedReplayEvent[] = [
      makeLayoutInitWithAgentsEvent("layout-1", "building-1", {
        "agent-alpha": { position: agentPos, roomId: "lobby" },
      }, BASE_TS),
    ];

    const layout = reconstructSpatialLayoutAt(events, BASE_TS);
    const agentNode = layout.agents["agent-alpha"];
    expect(agentNode).toBeDefined();
    expect(agentNode!.position.x).toBeCloseTo(agentPos.x);
    expect(agentNode!.position.y).toBeCloseTo(agentPos.y);
    expect(agentNode!.position.z).toBeCloseTo(agentPos.z);
    expect(agentNode!.roomId).toBe("lobby");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 9sl-store-21..24: Integration with replay store state
// ─────────────────────────────────────────────────────────────────────────────

describe("Replay store integration for cursor-driven reconstruction (9sl-store-21..24)", () => {
  beforeEach(resetAllStores);

  it("9sl-store-21: manually simulating seek: setLayout at different timestamps updates ts", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        room1: { position: { x: 1.0, y: 0.0, z: 1.0 } },
      }, BASE_TS),
    ];

    // Simulate cursor at BASE_TS
    const layout1 = reconstructSpatialLayoutAt(events, BASE_TS);
    useReplaySpatialLayoutStore.getState()._setLayout(layout1, BASE_TS);
    expect(useReplaySpatialLayoutStore.getState().lastLayoutTs).toBe(BASE_TS);

    // Simulate cursor at BASE_TS + 5000
    const layout2 = reconstructSpatialLayoutAt(events, BASE_TS + 5000);
    useReplaySpatialLayoutStore.getState()._setLayout(layout2, BASE_TS + 5000);
    expect(useReplaySpatialLayoutStore.getState().lastLayoutTs).toBe(BASE_TS + 5000);
  });

  it("9sl-store-22: cursor at ts before layout.init produces empty layout", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        room1: { position: { x: 1.0, y: 0.0, z: 1.0 } },
      }, BASE_TS + 1000), // layout.init at BASE_TS + 1000
    ];

    // Cursor at BASE_TS (before layout.init)
    const layout = reconstructSpatialLayoutAt(events, BASE_TS);
    expect(layout.hasAnchor).toBe(false);
    expect(Object.keys(layout.rooms)).toHaveLength(0);
  });

  it("9sl-store-23: cursor beyond last event uses final layout state", () => {
    const events: TypedReplayEvent[] = [
      makeLayoutInitEvent("layout-1", "building-1", {
        lobby: { position: { x: 1.0, y: 0.0, z: 1.0 } },
      }, BASE_TS),
      makeLayoutNodeMovedEvent("lobby", "room", { x: 9.0, y: 0.0, z: 9.0 }, BASE_TS + 3000),
    ];

    // Cursor far beyond last event
    const layout = reconstructSpatialLayoutAt(events, BASE_TS + 999_999);
    expect(layout.rooms["lobby"]?.position.x).toBeCloseTo(9.0);
    expect(layout.rooms["lobby"]?.position.z).toBeCloseTo(9.0);
  });

  it("9sl-store-24: getReplayRoomPosition returns null for unknown room even when active", () => {
    const layout = emptySpatialLayout(BASE_TS);
    // Add a different room
    layout.rooms["known-room"] = {
      roomId:       "known-room",
      position:     { x: 1.0, y: 0.0, z: 1.0 },
      rotation:     { x: 0, y: 0, z: 0 },
      scale:        { x: 1, y: 1, z: 1 },
      floor:        0,
      lastEventSeq: 1,
      lastEventTs:  BASE_TS,
    };
    useReplaySpatialLayoutStore.getState()._setActive(true);
    useReplaySpatialLayoutStore.getState()._setLayout(layout, BASE_TS);

    // Unknown room returns null
    expect(getReplayRoomPosition("unknown-room")).toBeNull();
    // Known room returns position
    expect(getReplayRoomPosition("known-room")).not.toBeNull();
  });
});
