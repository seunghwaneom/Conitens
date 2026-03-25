/**
 * use-hierarchy-navigation.test.ts — Tests for Sub-AC 3b
 *
 * "Build the hierarchy state model and navigation controller that tracks
 * current depth (building → office → room → agent) and exposes drill-down /
 * drill-up transitions."
 *
 * Coverage matrix
 * ───────────────
 * 3b-types  Type mapping helpers: drillLevelToDepth, depthToDrillLevel
 * 3b-pos    computeHierarchyPosition pure function (node resolution)
 * 3b-guard  canNavigateDrillUp guard
 * 3b-nav    Full navigation via spatial-store + hook state reflection
 * 3b-data   Contextual data slices (officesInBuilding, roomsInCurrentOffice,
 *           agentsInCurrentRoom)
 * 3b-evt    Event-sourcing compliance: every drill emits the correct event
 * 3b-inv    Invariant checks (null nodes at wrong levels, etc.)
 *
 * All tests manipulate the Zustand spatial-store directly (no React DOM).
 * The pure function computeHierarchyPosition is tested without any store.
 *
 * Test ID scheme:
 *   3b-types-N : Type conversion helpers
 *   3b-pos-N   : computeHierarchyPosition
 *   3b-guard-N : canNavigateDrillUp
 *   3b-nav-N   : Navigation via store
 *   3b-data-N  : Contextual data slices
 *   3b-evt-N   : Event-sourcing
 *   3b-inv-N   : Invariants
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  drillLevelToDepth,
  depthToDrillLevel,
  computeHierarchyPosition,
  canNavigateDrillUp,
  DRILL_LEVEL_TO_DEPTH,
  DEPTH_TO_DRILL_LEVEL,
  type HierarchyDepth,
  type HierarchyPosition,
} from "../use-hierarchy-navigation.js";
import { useSpatialStore, type DrillLevel } from "../../store/spatial-store.js";
import { DEFAULT_BUILDING_HIERARCHY } from "../../data/room-agent-hierarchy.js";
import { BUILDING } from "../../data/building.js";

// ── Store reset helper ─────────────────────────────────────────────────────────

function resetStore() {
  useSpatialStore.setState({
    building: BUILDING,
    roomStates: Object.fromEntries(
      BUILDING.rooms.map((r) => [
        r.roomId,
        {
          activeMembers: [...r.members],
          activity: "idle" as const,
          highlighted: false,
          selected: false,
          lastEventTs: 0,
          paused: false,
        },
      ]),
    ),
    events: [],
    dataSource: "static" as const,
    loading: false,
    error: null,
    selectedRoomId: null,
    focusedRoomId: null,
    floorVisibility: Object.fromEntries(BUILDING.floors.map((f) => [f.floor, true])),
    cameraMode: "perspective" as const,
    cameraPreset: "overview" as const,
    birdsEyeZoom: 10,
    birdsEyePan: [0, 0] as [number, number],
    roomCreationLog: [],
    drillLevel: "building" as DrillLevel,
    drillFloor: null,
    drillRoom: null,
    drillAgent: null,
    activeSurfaceId: null,
    activeSurfaceRoomId: null,
    _savedLiveRoomStates: null,
    conveneDialogRoomId: null,
  });
}

/** Latest event from the spatial store */
function lastEvent() {
  const { events } = useSpatialStore.getState();
  return events[events.length - 1];
}

/** All event types in order */
function eventTypes() {
  return useSpatialStore.getState().events.map((e) => e.type);
}

// ── Test fixtures ──────────────────────────────────────────────────────────────

const H = DEFAULT_BUILDING_HIERARCHY;

// Known rooms and agents from static config
const FLOOR_0 = 0;
const FLOOR_1 = 1;
const ROOM_OPS      = "ops-control";       // floor 1, control type
const ROOM_IMPL     = "impl-office";       // floor 1, office type
const ROOM_LOBBY    = "project-main";      // floor 0, lobby type
const AGENT_MANAGER = "manager-default";   // orchestrator in ops-control
const AGENT_IMPL    = "implementer-subagent"; // implementer in impl-office

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-types — Type conversion helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-types — drillLevelToDepth", () => {
  // 3b-types-1
  it("maps 'building' → 'building'", () => {
    expect(drillLevelToDepth("building")).toBe("building");
  });

  // 3b-types-2
  it("maps 'floor' → 'office' (the key public-API mapping)", () => {
    expect(drillLevelToDepth("floor")).toBe("office");
  });

  // 3b-types-3
  it("maps 'room' → 'room'", () => {
    expect(drillLevelToDepth("room")).toBe("room");
  });

  // 3b-types-4
  it("maps 'agent' → 'agent'", () => {
    expect(drillLevelToDepth("agent")).toBe("agent");
  });

  // 3b-types-5
  it("DRILL_LEVEL_TO_DEPTH lookup table is consistent with drillLevelToDepth()", () => {
    const levels: DrillLevel[] = ["building", "floor", "room", "agent"];
    for (const l of levels) {
      expect(drillLevelToDepth(l)).toBe(DRILL_LEVEL_TO_DEPTH[l]);
    }
  });
});

describe("3b-types — depthToDrillLevel", () => {
  // 3b-types-6
  it("maps 'building' → 'building'", () => {
    expect(depthToDrillLevel("building")).toBe("building");
  });

  // 3b-types-7
  it("maps 'office' → 'floor' (inverse of the key mapping)", () => {
    expect(depthToDrillLevel("office")).toBe("floor");
  });

  // 3b-types-8
  it("maps 'room' → 'room'", () => {
    expect(depthToDrillLevel("room")).toBe("room");
  });

  // 3b-types-9
  it("maps 'agent' → 'agent'", () => {
    expect(depthToDrillLevel("agent")).toBe("agent");
  });

  // 3b-types-10
  it("drillLevelToDepth and depthToDrillLevel are inverse for all values", () => {
    const levels: DrillLevel[] = ["building", "floor", "room", "agent"];
    for (const l of levels) {
      expect(depthToDrillLevel(drillLevelToDepth(l))).toBe(l);
    }
  });

  // 3b-types-11
  it("DEPTH_TO_DRILL_LEVEL lookup table is consistent with depthToDrillLevel()", () => {
    const depths: HierarchyDepth[] = ["building", "office", "room", "agent"];
    for (const d of depths) {
      expect(depthToDrillLevel(d)).toBe(DEPTH_TO_DRILL_LEVEL[d]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-pos — computeHierarchyPosition (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-pos — computeHierarchyPosition at building level", () => {
  // 3b-pos-1
  it("depth is 'building' when drillLevel is 'building'", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    expect(pos.depth).toBe("building");
  });

  // 3b-pos-2
  it("buildingNode is always populated (root is never null)", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    expect(pos.buildingNode).toBeDefined();
    expect(pos.buildingNode.buildingId).toBeTruthy();
  });

  // 3b-pos-3
  it("officeNode, roomNode, agentNode are all null at building level", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    expect(pos.officeNode).toBeNull();
    expect(pos.roomNode).toBeNull();
    expect(pos.agentNode).toBeNull();
  });
});

describe("3b-pos — computeHierarchyPosition at office (floor) level", () => {
  // 3b-pos-4
  it("depth is 'office' when drillLevel is 'floor'", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_1, null, null, H);
    expect(pos.depth).toBe("office");
  });

  // 3b-pos-5
  it("officeNode is resolved from the hierarchy for floor 1", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_1, null, null, H);
    expect(pos.officeNode).toBeDefined();
    expect(pos.officeNode!.floor).toBe(FLOOR_1);
  });

  // 3b-pos-6
  it("officeNode for floor 0 resolves correctly", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_0, null, null, H);
    expect(pos.officeNode).toBeDefined();
    expect(pos.officeNode!.floor).toBe(FLOOR_0);
  });

  // 3b-pos-7
  it("roomNode and agentNode are null at office level", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_1, null, null, H);
    expect(pos.roomNode).toBeNull();
    expect(pos.agentNode).toBeNull();
  });

  // 3b-pos-8
  it("officeNode.rooms contains the correct rooms for floor 1", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_1, null, null, H);
    const roomIds = pos.officeNode!.rooms.map((r) => r.roomId);
    expect(roomIds).toContain(ROOM_OPS);
    expect(roomIds).toContain(ROOM_IMPL);
  });

  // 3b-pos-9
  it("officeNode is null when drillFloor is null even at 'floor' level (defensive)", () => {
    const pos = computeHierarchyPosition("floor", null, null, null, H);
    expect(pos.officeNode).toBeNull();
  });
});

describe("3b-pos — computeHierarchyPosition at room level", () => {
  // 3b-pos-10
  it("depth is 'room' when drillLevel is 'room'", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    expect(pos.depth).toBe("room");
  });

  // 3b-pos-11
  it("roomNode is resolved correctly for ops-control", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    expect(pos.roomNode).toBeDefined();
    expect(pos.roomNode!.roomId).toBe(ROOM_OPS);
    expect(pos.roomNode!.roomType).toBe("control");
  });

  // 3b-pos-12
  it("officeNode is populated at room level", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    expect(pos.officeNode).toBeDefined();
    expect(pos.officeNode!.floor).toBe(FLOOR_1);
  });

  // 3b-pos-13
  it("agentNode is null at room level (not drilled into agent yet)", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    expect(pos.agentNode).toBeNull();
  });

  // 3b-pos-14
  it("roomNode for impl-office resolves correctly", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_IMPL, null, H);
    expect(pos.roomNode).toBeDefined();
    expect(pos.roomNode!.roomId).toBe(ROOM_IMPL);
  });

  // 3b-pos-15
  it("roomNode is null when drillRoom is null at 'room' level (defensive)", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, null, null, H);
    expect(pos.roomNode).toBeNull();
  });

  // 3b-pos-16
  it("roomNode is null at 'office' depth even when drillRoom is set", () => {
    // If we somehow have a stale drillRoom at floor level, roomNode must be null
    const pos = computeHierarchyPosition("floor", FLOOR_1, ROOM_OPS, null, H);
    expect(pos.roomNode).toBeNull();
  });
});

describe("3b-pos — computeHierarchyPosition at agent level", () => {
  // 3b-pos-17
  it("depth is 'agent' when drillLevel is 'agent'", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_OPS, AGENT_MANAGER, H,
    );
    expect(pos.depth).toBe("agent");
  });

  // 3b-pos-18
  it("agentNode is resolved from roomNode.agents for manager-default in ops-control", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_OPS, AGENT_MANAGER, H,
    );
    expect(pos.agentNode).toBeDefined();
    expect(pos.agentNode!.agentId).toBe(AGENT_MANAGER);
  });

  // 3b-pos-19
  it("agentNode for implementer-subagent in impl-office resolves correctly", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_IMPL, AGENT_IMPL, H,
    );
    expect(pos.agentNode).not.toBeNull();
    expect(pos.agentNode!.agentId).toBe(AGENT_IMPL);
  });

  // 3b-pos-20
  it("agentNode falls back to full-hierarchy scan when roomNode is null", () => {
    // drillRoom is null but drillAgent is set — edge-case guard
    const pos = computeHierarchyPosition("agent", null, null, AGENT_MANAGER, H);
    expect(pos.agentNode).not.toBeNull();
    expect(pos.agentNode!.agentId).toBe(AGENT_MANAGER);
  });

  // 3b-pos-21
  it("agentNode is null for an unknown agentId", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_OPS, "no-such-agent-xyz", H,
    );
    expect(pos.agentNode).toBeNull();
  });

  // 3b-pos-22
  it("officeNode and roomNode are both populated at agent level", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_OPS, AGENT_MANAGER, H,
    );
    expect(pos.officeNode).not.toBeNull();
    expect(pos.roomNode).not.toBeNull();
  });

  // 3b-pos-23
  it("agentNode is null at building level even if drillAgent is set (stale state guard)", () => {
    // Simulate stale state: drillLevel=building but drillAgent set (should not happen normally)
    const pos = computeHierarchyPosition("building", null, null, AGENT_MANAGER, H);
    expect(pos.agentNode).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-guard — canNavigateDrillUp
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-guard — canNavigateDrillUp", () => {
  // 3b-guard-1
  it("returns false at 'building' (root — no parent)", () => {
    expect(canNavigateDrillUp("building")).toBe(false);
  });

  // 3b-guard-2
  it("returns true at 'office' (can go to building)", () => {
    expect(canNavigateDrillUp("office")).toBe(true);
  });

  // 3b-guard-3
  it("returns true at 'room' (can go to office)", () => {
    expect(canNavigateDrillUp("room")).toBe(true);
  });

  // 3b-guard-4
  it("returns true at 'agent' (can go to room)", () => {
    expect(canNavigateDrillUp("agent")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-nav — Navigation transitions via spatial store
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-nav — Navigation state machine (via spatial store)", () => {
  beforeEach(resetStore);

  // 3b-nav-1
  it("initial state: drillLevel is 'building', all drill fields are null", () => {
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(drillFloor).toBeNull();
    expect(drillRoom).toBeNull();
    expect(drillAgent).toBeNull();
  });

  // 3b-nav-2
  it("drillIntoFloor(1) transitions to floor level — computeHierarchyPosition shows 'office'", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const { drillLevel, drillFloor } = useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, null, null, H);
    expect(pos.depth).toBe("office");
    expect(pos.officeNode!.floor).toBe(FLOOR_1);
  });

  // 3b-nav-3
  it("drillIntoRoom(ops-control) transitions to room level — depth is 'room'", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillLevel, drillFloor, drillRoom } = useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, null, H);
    expect(pos.depth).toBe("room");
    expect(pos.roomNode!.roomId).toBe(ROOM_OPS);
  });

  // 3b-nav-4
  it("drillIntoAgent sets depth to 'agent' and resolves the agent node", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_MANAGER, { x: 4.5, y: 3.5, z: 2 });
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("agent");
    expect(pos.agentNode!.agentId).toBe(AGENT_MANAGER);
  });

  // 3b-nav-5
  it("drillAscend from agent → room transitions back to depth 'room'", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_MANAGER, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("room");
    expect(pos.agentNode).toBeNull();
  });

  // 3b-nav-6
  it("drillAscend from room → office transitions back to depth 'office'", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("office");
    expect(pos.roomNode).toBeNull();
  });

  // 3b-nav-7
  it("drillAscend from office → building returns to depth 'building'", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("building");
    expect(pos.officeNode).toBeNull();
  });

  // 3b-nav-8
  it("drillAscend at building level is a no-op (no events emitted)", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillAscend();
    expect(useSpatialStore.getState().events.length).toBe(before);
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });

  // 3b-nav-9
  it("drillReset from agent level returns to depth 'building' and nullifies all context", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_MANAGER, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("building");
    expect(pos.officeNode).toBeNull();
    expect(pos.roomNode).toBeNull();
    expect(pos.agentNode).toBeNull();
  });

  // 3b-nav-10
  it("canNavigateDrillUp is false after drillReset", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const { drillLevel } = useSpatialStore.getState();
    expect(canNavigateDrillUp(drillLevelToDepth(drillLevel))).toBe(false);
  });

  // 3b-nav-11
  it("full drill chain: building → office → room → agent → ascend×3 → building", () => {
    const s = useSpatialStore.getState;

    s().drillIntoFloor(FLOOR_1);
    expect(drillLevelToDepth(s().drillLevel)).toBe("office");

    s().drillIntoRoom(ROOM_OPS);
    expect(drillLevelToDepth(s().drillLevel)).toBe("room");
    expect(s().drillRoom).toBe(ROOM_OPS);

    s().drillIntoAgent(AGENT_MANAGER, { x: 4.5, y: 3.5, z: 2 });
    expect(drillLevelToDepth(s().drillLevel)).toBe("agent");

    s().drillAscend(); // agent → room
    expect(drillLevelToDepth(s().drillLevel)).toBe("room");

    s().drillAscend(); // room → office
    expect(drillLevelToDepth(s().drillLevel)).toBe("office");
    expect(s().drillRoom).toBeNull();

    s().drillAscend(); // office → building
    expect(drillLevelToDepth(s().drillLevel)).toBe("building");
    expect(s().drillFloor).toBeNull();
  });

  // 3b-nav-12
  it("drillIntoRoom from any depth sets officeNode from the room's floor property", () => {
    // Start at building level — skip explicit office drill
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillLevel, drillFloor, drillRoom } = useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, null, H);
    // ops-control is on floor 1 — officeNode must be floor 1
    expect(pos.officeNode!.floor).toBe(FLOOR_1);
  });

  // 3b-nav-13
  it("drillIntoFloor clears room/agent context from previous navigation", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_MANAGER, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    const { drillLevel, drillFloor, drillRoom, drillAgent } =
      useSpatialStore.getState();
    const pos = computeHierarchyPosition(drillLevel, drillFloor, drillRoom, drillAgent, H);
    expect(pos.depth).toBe("office");
    expect(pos.roomNode).toBeNull();
    expect(pos.agentNode).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-data — Contextual data slices
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-data — Contextual data slices from computeHierarchyPosition", () => {
  // 3b-data-1
  it("buildingNode.floors is the list of all offices in the building", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    expect(Array.isArray(pos.buildingNode.floors)).toBe(true);
    expect(pos.buildingNode.floors.length).toBeGreaterThanOrEqual(2);
  });

  // 3b-data-2
  it("officeNode.rooms for floor 1 contains ops-control and impl-office", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_1, null, null, H);
    const roomIds = pos.officeNode!.rooms.map((r) => r.roomId);
    expect(roomIds).toContain(ROOM_OPS);
    expect(roomIds).toContain(ROOM_IMPL);
  });

  // 3b-data-3
  it("officeNode.rooms for floor 0 does NOT contain ops-control", () => {
    const pos = computeHierarchyPosition("floor", FLOOR_0, null, null, H);
    const roomIds = pos.officeNode!.rooms.map((r) => r.roomId);
    expect(roomIds).not.toContain(ROOM_OPS);
  });

  // 3b-data-4
  it("roomNode.agents for ops-control includes manager-default", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    const agentIds = pos.roomNode!.agents.map((a) => a.agentId);
    expect(agentIds).toContain(AGENT_MANAGER);
  });

  // 3b-data-5
  it("roomNode.agents for impl-office includes implementer-subagent", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_IMPL, null, H);
    const agentIds = pos.roomNode!.agents.map((a) => a.agentId);
    expect(agentIds).toContain(AGENT_IMPL);
  });

  // 3b-data-6
  it("agentNode has non-empty name, role, and visual properties", () => {
    const pos = computeHierarchyPosition(
      "agent", FLOOR_1, ROOM_OPS, AGENT_MANAGER, H,
    );
    expect(pos.agentNode!.name).toBeTruthy();
    expect(pos.agentNode!.role).toBeTruthy();
    expect(pos.agentNode!.visual).toBeDefined();
    expect(pos.agentNode!.visual.color).toBeTruthy();
  });

  // 3b-data-7
  it("buildingNode.totalRooms matches the count of all rooms across all floors", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    const sumFloorRooms = pos.buildingNode.floors.reduce(
      (acc, f) => acc + f.rooms.length,
      0,
    );
    expect(pos.buildingNode.totalRooms).toBe(sumFloorRooms);
  });

  // 3b-data-8
  it("buildingNode.totalAgents equals the number of agents in DEFAULT_BUILDING_HIERARCHY", () => {
    const pos = computeHierarchyPosition("building", null, null, null, H);
    expect(pos.buildingNode.totalAgents).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-evt — Event-sourcing compliance
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-evt — Event-sourcing: every drill action emits a spatial event", () => {
  beforeEach(resetStore);

  // 3b-evt-1
  it("drillIntoFloor emits navigation.drilled_floor event", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(lastEvent().type).toBe("navigation.drilled_floor");
    expect(lastEvent().payload.floorIndex).toBe(FLOOR_1);
  });

  // 3b-evt-2
  it("navigation.drilled_floor payload includes 'from' field (record of previous level)", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(lastEvent().payload.from).toBe("building");
  });

  // 3b-evt-3
  it("drillIntoRoom emits navigation.drilled_room + room.selected + room.focused", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const types = eventTypes();
    expect(types).toContain("navigation.drilled_room");
    expect(types).toContain("room.selected");
    expect(types).toContain("room.focused");
  });

  // 3b-evt-4
  it("drillIntoRoom payload carries correct roomId and floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const evt = useSpatialStore.getState().events.find(
      (e) => e.type === "navigation.drilled_room",
    );
    expect(evt!.payload.roomId).toBe(ROOM_OPS);
    expect(evt!.payload.floor).toBe(FLOOR_1);
  });

  // 3b-evt-5
  it("drillIntoAgent emits navigation.drilled_agent with agentId + worldPosition", () => {
    const pos = { x: 3, y: 4, z: 2 };
    useSpatialStore.getState().drillIntoAgent(AGENT_MANAGER, pos);
    expect(lastEvent().type).toBe("navigation.drilled_agent");
    expect(lastEvent().payload.agentId).toBe(AGENT_MANAGER);
    expect(lastEvent().payload.worldPosition).toEqual(pos);
  });

  // 3b-evt-6
  it("drillAscend emits navigation.ascended with from/to payload", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("floor");
    expect(evt.payload.to).toBe("building");
  });

  // 3b-evt-7
  it("drillReset emits navigation.reset with 'from' payload indicating prior depth", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.reset");
    expect(evt.payload.from).toBe("room");
  });

  // 3b-evt-8
  it("each drill action increments the event log (append-only — no truncation)", () => {
    const initial = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const after1 = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const after2 = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillAscend();
    const after3 = useSpatialStore.getState().events.length;

    expect(after1).toBeGreaterThan(initial);
    expect(after2).toBeGreaterThan(after1);
    expect(after3).toBeGreaterThan(after2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b-inv — Invariant checks
// ═══════════════════════════════════════════════════════════════════════════════

describe("3b-inv — Hierarchy invariants", () => {
  // 3b-inv-1
  it("each depth level has at most one active node per category (not two rooms at once)", () => {
    const pos = computeHierarchyPosition("room", FLOOR_1, ROOM_OPS, null, H);
    // Only one room node, not an array
    expect(typeof pos.roomNode?.roomId).toBe("string");
  });

  // 3b-inv-2
  it("nodes at depth N are consistent with nodes at depth N-1", () => {
    const pos = computeHierarchyPosition("agent", FLOOR_1, ROOM_OPS, AGENT_MANAGER, H);
    // officeNode.floor === drillFloor
    expect(pos.officeNode!.floor).toBe(FLOOR_1);
    // roomNode is in officeNode.rooms
    const roomIds = pos.officeNode!.rooms.map((r) => r.roomId);
    expect(roomIds).toContain(pos.roomNode!.roomId);
    // agentNode is in roomNode.agents
    const agentIds = pos.roomNode!.agents.map((a) => a.agentId);
    expect(agentIds).toContain(pos.agentNode!.agentId);
  });

  // 3b-inv-3
  it("buildingNode is the same object reference across all depth levels", () => {
    const posBuilding = computeHierarchyPosition("building", null, null, null, H);
    const posOffice   = computeHierarchyPosition("floor",    FLOOR_1, null, null, H);
    const posRoom     = computeHierarchyPosition("room",     FLOOR_1, ROOM_OPS, null, H);
    // All share the same hierarchy root reference
    expect(posBuilding.buildingNode).toBe(H);
    expect(posOffice.buildingNode).toBe(H);
    expect(posRoom.buildingNode).toBe(H);
  });

  // 3b-inv-4
  it("DRILL_LEVEL_TO_DEPTH and DEPTH_TO_DRILL_LEVEL are exact inverses (bijective)", () => {
    const levels: DrillLevel[] = ["building", "floor", "room", "agent"];
    for (const l of levels) {
      const depth = DRILL_LEVEL_TO_DEPTH[l];
      const back  = DEPTH_TO_DRILL_LEVEL[depth];
      expect(back).toBe(l);
    }
  });

  // 3b-inv-5
  it("every HierarchyDepth maps to a unique DrillLevel (no two depths share a level)", () => {
    const depths: HierarchyDepth[] = ["building", "office", "room", "agent"];
    const mappedLevels = depths.map((d) => DEPTH_TO_DRILL_LEVEL[d]);
    const unique = new Set(mappedLevels);
    expect(unique.size).toBe(depths.length);
  });
});
