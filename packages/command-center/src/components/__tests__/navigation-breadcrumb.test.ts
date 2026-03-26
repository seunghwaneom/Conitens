/**
 * navigation-breadcrumb.test.ts — Sub-AC 3.3
 *
 * "Create a breadcrumb/navigation HUD overlay that reflects the current
 * drill-down depth (Building → Floor → Room → Agent) and supports
 * click-to-navigate-up to any ancestor level."
 *
 * Coverage matrix
 * ───────────────
 * 3.3-seg  deriveNavigationSegments — pure function derivation tests
 * 3.3-nav  Click-to-navigate-up actions verified via spatial store
 * 3.3-evt  Event-sourcing compliance for each breadcrumb click path
 * 3.3-vis  Visibility conditions (hidden at building, shown below)
 * 3.3-acc  Accessibility attributes (aria, data-testid)
 *
 * NOTE: React components cannot be rendered without a DOM.  All tests that
 * exercise component rendering use the exported `deriveNavigationSegments`
 * pure function + the spatial-store state machine (no DOM, no Three.js).
 *
 * Test ID scheme:
 *   3.3-seg-N  : segment derivation
 *   3.3-nav-N  : click-to-navigate store actions
 *   3.3-evt-N  : event-sourcing compliance
 *   3.3-vis-N  : visibility / render conditions
 *   3.3-acc-N  : accessibility contract
 */

import { describe, it, expect, beforeEach } from "vitest";
import { deriveNavigationSegments, type BreadcrumbSegment } from "../NavigationBreadcrumb.js";
import { useSpatialStore, type DrillLevel } from "../../store/spatial-store.js";
import { BUILDING } from "../../data/building.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset the spatial store to a deterministic building-level state */
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

/** Convenience: last event in the spatial event log */
function lastEvent() {
  const { events } = useSpatialStore.getState();
  return events[events.length - 1];
}

/** Convenience: all event types in order */
function eventTypes() {
  return useSpatialStore.getState().events.map((e) => e.type);
}

// ── Known test fixtures (from static BUILDING) ───────────────────────────────

const FLOOR_0 = 0;
const FLOOR_1 = 1;
const ROOM_OPS   = "ops-control";      // floor 1, control type
const ROOM_IMPL  = "impl-office";      // floor 1, office type
const AGENT_ID   = "manager-default";

// ── Default params for deriveNavigationSegments ───────────────────────────────

const BASE_PARAMS = {
  buildingName: "Conitens HQ",
  floorName: "F1 Operations",
  roomName: "Ops Control",
  roomColor: "#ff4488",
  roomIcon: "◈",
  agentName: "Manager",
  agentColor: "#00ffaa",
  agentIcon: "◆",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3.3-seg — deriveNavigationSegments pure function
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.3-seg — deriveNavigationSegments at building level", () => {
  // 3.3-seg-1
  it("returns exactly one segment (building) at building level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "building",
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].key).toBe("building");
  });

  // 3.3-seg-2
  it("building segment at building level is the leaf (isLeaf=true, action=null)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "building",
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[0].isLeaf).toBe(true);
    expect(segs[0].action).toBeNull();
  });

  // 3.3-seg-3
  it("building label uses buildingName param", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      buildingName: "CUSTOM_HQ",
      drillLevel: "building",
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[0].label).toBe("CUSTOM_HQ");
  });

  // 3.3-seg-4
  it("falls back to 'HQ' when buildingName is empty string", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      buildingName: "",
      drillLevel: "building",
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[0].label).toBe("HQ");
  });
});

describe("Sub-AC 3.3-seg — deriveNavigationSegments at floor level", () => {
  // 3.3-seg-5
  it("returns 2 segments (building + floor) at floor level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "floor",
      drillFloor: 1,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs).toHaveLength(2);
    expect(segs[0].key).toBe("building");
    expect(segs[1].key).toBe("floor-1");
  });

  // 3.3-seg-6
  it("floor segment is the leaf at floor level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "floor",
      drillFloor: 1,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[1].isLeaf).toBe(true);
    expect(segs[1].action).toBeNull();
  });

  // 3.3-seg-7
  it("building segment has a reset action at floor level (click-to-navigate)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "floor",
      drillFloor: 1,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[0].isLeaf).toBe(false);
    expect(segs[0].action).toEqual({ type: "reset" });
  });

  // 3.3-seg-8
  it("floor segment label uses floorName param", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      floorName: "F2 Top Floor",
      drillLevel: "floor",
      drillFloor: 2,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[1].label).toBe("F2 Top Floor");
  });

  // 3.3-seg-9
  it("floor segment falls back to 'FLOOR N' when floorName is null", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      floorName: null,
      drillLevel: "floor",
      drillFloor: 3,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs[1].label).toBe("FLOOR 3");
  });
});

describe("Sub-AC 3.3-seg — deriveNavigationSegments at room level", () => {
  // 3.3-seg-10
  it("returns 3 segments (building + floor + room) at room level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    expect(segs).toHaveLength(3);
  });

  // 3.3-seg-11
  it("room segment is the leaf at room level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const roomSeg = segs.find((s) => s.key.startsWith("room-"))!;
    expect(roomSeg.isLeaf).toBe(true);
    expect(roomSeg.action).toBeNull();
  });

  // 3.3-seg-12
  it("floor segment has floor action at room level (click-to-navigate)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const floorSeg = segs.find((s) => s.key.startsWith("floor-"))!;
    expect(floorSeg.action).toEqual({ type: "floor", floorIndex: 1 });
  });

  // 3.3-seg-13
  it("room segment label uses roomName param", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      roomName: "My Custom Room",
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const roomSeg = segs.find((s) => s.key.startsWith("room-"))!;
    expect(roomSeg.label).toBe("My Custom Room");
  });

  // 3.3-seg-14
  it("room segment falls back to roomId when roomName is null", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      roomName: null,
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const roomSeg = segs.find((s) => s.key.startsWith("room-"))!;
    expect(roomSeg.label).toBe("ops-control");
  });

  // 3.3-seg-15
  it("room segment uses roomColor and roomIcon from params", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      roomColor: "#ff0000",
      roomIcon: "★",
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const roomSeg = segs.find((s) => s.key.startsWith("room-"))!;
    expect(roomSeg.color).toBe("#ff0000");
    expect(roomSeg.icon).toBe("★");
  });
});

describe("Sub-AC 3.3-seg — deriveNavigationSegments at agent level", () => {
  // 3.3-seg-16
  it("returns 4 segments (building + floor + room + agent) at agent level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    expect(segs).toHaveLength(4);
  });

  // 3.3-seg-17
  it("agent segment is the leaf at agent level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const agentSeg = segs.find((s) => s.key.startsWith("agent-"))!;
    expect(agentSeg.isLeaf).toBe(true);
    expect(agentSeg.action).toBeNull();
  });

  // 3.3-seg-18
  it("room segment has room action at agent level (click-to-navigate to room)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const roomSeg = segs.find((s) => s.key.startsWith("room-"))!;
    expect(roomSeg.action).toEqual({ type: "room", roomId: "ops-control" });
  });

  // 3.3-seg-19
  it("floor segment has floor action at agent level (click-to-navigate to floor)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const floorSeg = segs.find((s) => s.key.startsWith("floor-"))!;
    expect(floorSeg.action).toEqual({ type: "floor", floorIndex: 1 });
  });

  // 3.3-seg-20
  it("building segment has reset action at agent level", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const buildingSeg = segs[0];
    expect(buildingSeg.action).toEqual({ type: "reset" });
  });

  // 3.3-seg-21
  it("agent segment uses agentName, agentColor, agentIcon from params", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      agentName: "Alpha Agent",
      agentColor: "#ccff00",
      agentIcon: "⚙",
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const agentSeg = segs.find((s) => s.key.startsWith("agent-"))!;
    expect(agentSeg.label).toBe("Alpha Agent");
    expect(agentSeg.color).toBe("#ccff00");
    expect(agentSeg.icon).toBe("⚙");
  });

  // 3.3-seg-22
  it("agent segment falls back to agentId when agentName is null", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      agentName: null,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const agentSeg = segs.find((s) => s.key.startsWith("agent-"))!;
    expect(agentSeg.label).toBe("manager-default");
  });

  // 3.3-seg-23
  it("segments are in ascending depth order: building < floor < room < agent", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    expect(segs[0].key).toBe("building");
    expect(segs[1].key).toMatch(/^floor-/);
    expect(segs[2].key).toMatch(/^room-/);
    expect(segs[3].key).toMatch(/^agent-/);
  });

  // 3.3-seg-24
  it("exactly one segment is a leaf (the last one)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const leafSegs = segs.filter((s) => s.isLeaf);
    const nonLeafSegs = segs.filter((s) => !s.isLeaf);
    expect(leafSegs).toHaveLength(1);
    expect(leafSegs[0]).toBe(segs[segs.length - 1]);
    expect(nonLeafSegs).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3.3-nav — Click-to-navigate-up store integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.3-nav — Click-to-navigate-up from floor level", () => {
  beforeEach(resetStore);

  // 3.3-nav-1
  it("clicking building segment (reset) from floor level returns to building", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(useSpatialStore.getState().drillLevel).toBe("floor");

    // Simulate clicking the building breadcrumb segment → drillReset()
    useSpatialStore.getState().drillReset();

    expect(useSpatialStore.getState().drillLevel).toBe("building");
    expect(useSpatialStore.getState().drillFloor).toBeNull();
  });

  // 3.3-nav-2
  it("clicking building resets emits navigation.reset event", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    useSpatialStore.getState().drillReset();
    expect(lastEvent().type).toBe("navigation.reset");
    expect(lastEvent().payload.from).toBe("floor");
  });
});

describe("Sub-AC 3.3-nav — Click-to-navigate-up from room level", () => {
  beforeEach(resetStore);

  // 3.3-nav-3
  it("clicking floor segment from room level jumps directly to floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS); // room is floor 1
    expect(useSpatialStore.getState().drillLevel).toBe("room");

    // Simulate clicking floor breadcrumb segment → drillIntoFloor()
    const { drillFloor } = useSpatialStore.getState();
    useSpatialStore.getState().drillIntoFloor(drillFloor!);

    const state = useSpatialStore.getState();
    expect(state.drillLevel).toBe("floor");
    expect(state.drillFloor).toBe(FLOOR_1);
    expect(state.drillRoom).toBeNull();
    expect(state.selectedRoomId).toBeNull();
  });

  // 3.3-nav-4
  it("clicking floor from room emits navigation.drilled_floor event", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillFloor } = useSpatialStore.getState();
    useSpatialStore.getState().drillIntoFloor(drillFloor!);
    expect(lastEvent().type).toBe("navigation.drilled_floor");
    expect(lastEvent().payload.floorIndex).toBe(FLOOR_1);
  });

  // 3.3-nav-5
  it("clicking building segment from room level returns to building", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_IMPL);
    useSpatialStore.getState().drillReset();
    const state = useSpatialStore.getState();
    expect(state.drillLevel).toBe("building");
    expect(state.drillRoom).toBeNull();
    expect(state.selectedRoomId).toBeNull();
  });

  // 3.3-nav-6
  it("clicking building from room emits navigation.reset event", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    expect(lastEvent().type).toBe("navigation.reset");
    expect(lastEvent().payload.from).toBe("room");
  });
});

describe("Sub-AC 3.3-nav — Click-to-navigate-up from agent level", () => {
  beforeEach(resetStore);

  // 3.3-nav-7
  it("clicking room segment from agent level navigates directly to room", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 6, y: 3.5, z: 2 });
    expect(useSpatialStore.getState().drillLevel).toBe("agent");

    // Simulate clicking room breadcrumb → drillIntoRoom (direct jump)
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);

    const state = useSpatialStore.getState();
    expect(state.drillLevel).toBe("room");
    expect(state.drillRoom).toBe(ROOM_OPS);
    expect(state.drillAgent).toBeNull();
    expect(state.selectedRoomId).toBe(ROOM_OPS);
  });

  // 3.3-nav-8
  it("clicking room from agent emits navigation.drilled_room event", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    // drillIntoRoom emits navigation.drilled_room + room.selected + room.focused
    // so check the events log rather than only lastEvent()
    const navEvent = useSpatialStore.getState().events
      .filter((e) => e.type === "navigation.drilled_room")
      .pop();
    expect(navEvent).toBeDefined();
    expect(navEvent!.type).toBe("navigation.drilled_room");
    expect(navEvent!.payload.roomId).toBe(ROOM_OPS);
    // 'from' should indicate the level before this drill
    expect(navEvent!.payload.from).toBe("agent");
  });

  // 3.3-nav-9
  it("clicking floor segment from agent level navigates directly to floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 6, y: 3.5, z: 2 });
    expect(useSpatialStore.getState().drillLevel).toBe("agent");

    // Simulate clicking floor breadcrumb → drillIntoFloor (direct jump)
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);

    const state = useSpatialStore.getState();
    expect(state.drillLevel).toBe("floor");
    expect(state.drillFloor).toBe(FLOOR_1);
    expect(state.drillRoom).toBeNull();
    expect(state.drillAgent).toBeNull();
  });

  // 3.3-nav-10
  it("clicking floor from agent emits navigation.drilled_floor event", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(lastEvent().type).toBe("navigation.drilled_floor");
    expect(lastEvent().payload.from).toBe("agent");
  });

  // 3.3-nav-11
  it("clicking building segment from agent level resets to building", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const state = useSpatialStore.getState();
    expect(state.drillLevel).toBe("building");
    expect(state.drillFloor).toBeNull();
    expect(state.drillRoom).toBeNull();
    expect(state.drillAgent).toBeNull();
  });

  // 3.3-nav-12
  it("clicking building from agent emits navigation.reset event", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    expect(lastEvent().type).toBe("navigation.reset");
    expect(lastEvent().payload.from).toBe("agent");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3.3-evt — Event-sourcing compliance
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.3-evt — Every breadcrumb navigation fires correct events", () => {
  beforeEach(resetStore);

  // 3.3-evt-1
  it("drillReset always emits a navigation.reset event regardless of depth", () => {
    for (const setup of [
      () => useSpatialStore.getState().drillIntoFloor(FLOOR_1),
      () => useSpatialStore.getState().drillIntoRoom(ROOM_OPS),
      () => {
        useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
        useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
      },
    ]) {
      resetStore();
      setup();
      useSpatialStore.getState().drillReset();
      expect(lastEvent().type).toBe("navigation.reset");
    }
  });

  // 3.3-evt-2
  it("navigation.reset payload contains the level that was active before reset", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const evt = lastEvent();
    expect(evt.payload.from).toBe("agent");
  });

  // 3.3-evt-3
  it("drillIntoFloor fired from room breadcrumb emits navigation.drilled_floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS); // drillLevel=room, drillFloor=1
    useSpatialStore.getState().drillIntoFloor(FLOOR_1); // click floor segment
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.drilled_floor");
    expect(evt.payload.floorIndex).toBe(FLOOR_1);
    expect(evt.payload.from).toBe("room");
  });

  // 3.3-evt-4
  it("drillIntoRoom fired from agent breadcrumb emits navigation.drilled_room with from=agent", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS); // click room segment
    const evt = useSpatialStore.getState().events.filter(
      (e) => e.type === "navigation.drilled_room",
    );
    // The last drilled_room event should have from="agent"
    const last = evt[evt.length - 1];
    expect(last.payload.from).toBe("agent");
  });

  // 3.3-evt-5
  it("drillAscend from agent emits navigation.ascended {from:agent, to:room}", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("agent");
    expect(evt.payload.to).toBe("room");
  });

  // 3.3-evt-6
  it("drillAscend from floor emits navigation.ascended {from:floor, to:building}", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("floor");
    expect(evt.payload.to).toBe("building");
  });

  // 3.3-evt-7
  it("all navigation events have a non-null id and positive ts", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const navEvents = useSpatialStore
      .getState()
      .events.filter((e) => e.type.startsWith("navigation."));
    for (const evt of navEvents) {
      expect(evt.id).toBeTruthy();
      expect(evt.ts).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3.3-vis — Visibility conditions
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.3-vis — NavigationBreadcrumb visibility conditions", () => {
  beforeEach(resetStore);

  // 3.3-vis-1
  it("breadcrumb should NOT render at building level (segments[0] is leaf)", () => {
    // Component logic: if drillLevel === 'building' return null.
    // We test this via the pure segment fn: at building, building seg is leaf.
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "building",
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
    });
    // At building level, there is only 1 segment and it is the leaf
    expect(segs).toHaveLength(1);
    expect(segs[0].isLeaf).toBe(true);
    // The component uses drillLevel === 'building' as the visibility guard
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });

  // 3.3-vis-2
  it("breadcrumb SHOULD render at floor level (drillLevel !== 'building')", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(useSpatialStore.getState().drillLevel).not.toBe("building");
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: useSpatialStore.getState().drillLevel,
      drillFloor: useSpatialStore.getState().drillFloor,
      drillRoom: null,
      drillAgent: null,
    });
    expect(segs.length).toBeGreaterThan(1); // more than root segment
  });

  // 3.3-vis-3
  it("breadcrumb SHOULD render at room level", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillLevel).toBe("room");
    const state = useSpatialStore.getState();
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: state.drillLevel,
      drillFloor: state.drillFloor,
      drillRoom: state.drillRoom,
      drillAgent: null,
    });
    expect(segs).toHaveLength(3);
  });

  // 3.3-vis-4
  it("breadcrumb SHOULD render at agent level", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 6, y: 3.5, z: 2 });
    expect(useSpatialStore.getState().drillLevel).toBe("agent");
    const state = useSpatialStore.getState();
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: state.drillLevel,
      drillFloor: state.drillFloor,
      drillRoom: state.drillRoom,
      drillAgent: state.drillAgent,
    });
    expect(segs).toHaveLength(4);
  });

  // 3.3-vis-5
  it("after drillReset from agent level, returns to building (breadcrumb hides)", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    // Component would now return null (drillLevel === 'building')
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3.3-acc — Accessibility contract
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.3-acc — Breadcrumb accessibility contract", () => {
  // 3.3-acc-1
  it("leaf segment has isLeaf=true (maps to aria-current='location' in component)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "room",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: null,
    });
    const leaf = segs[segs.length - 1];
    expect(leaf.isLeaf).toBe(true);
    // Component renders aria-current="location" when isLeaf
  });

  // 3.3-acc-2
  it("non-leaf segments have isLeaf=false (maps to cursor:pointer + no aria-current)", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const ancestors = segs.slice(0, -1);
    for (const seg of ancestors) {
      expect(seg.isLeaf).toBe(false);
    }
  });

  // 3.3-acc-3
  it("each segment has a unique key", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    const keys = segs.map((s) => s.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // 3.3-acc-4
  it("segment labels are non-empty strings", () => {
    for (const level of ["floor", "room", "agent"] as DrillLevel[]) {
      const segs = deriveNavigationSegments({
        ...BASE_PARAMS,
        drillLevel: level,
        drillFloor: 1,
        drillRoom: "ops-control",
        drillAgent: level === "agent" ? "manager-default" : null,
      });
      for (const seg of segs) {
        expect(typeof seg.label).toBe("string");
        expect(seg.label.length).toBeGreaterThan(0);
      }
    }
  });

  // 3.3-acc-5
  it("segment icons are non-empty strings", () => {
    const segs = deriveNavigationSegments({
      ...BASE_PARAMS,
      drillLevel: "agent",
      drillFloor: 1,
      drillRoom: "ops-control",
      drillAgent: "manager-default",
    });
    for (const seg of segs) {
      expect(typeof seg.icon).toBe("string");
      expect(seg.icon.length).toBeGreaterThan(0);
    }
  });
});
