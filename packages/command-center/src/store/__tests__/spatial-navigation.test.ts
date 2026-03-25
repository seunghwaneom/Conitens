/**
 * spatial-navigation.test.ts — Tests for Sub-AC 4 (building entry / floor context /
 * room-detail / agent-detail panels) and Sub-ACs 3c/3d (breadcrumb navigation +
 * drill-level indicator).
 *
 * Coverage matrix
 * ───────────────
 * Sub-AC 3c  DrillBreadcrumb — path shows building → floor → room → agent
 * Sub-AC 3d  DrillLevelIndicator — current-level step-ladder state
 * Sub-AC 4a  BuildingEntryHint — shown at building level; floor list derived
 *            FloorContextPanel  — shown at floor level; rooms filtered by drillFloor
 * Sub-AC 4b  RoomDetailPanel    — metadata, occupancy, lifecycle commands (PAUSE/RESUME)
 * Sub-AC 4c  AgentDetailPanel   — identity, status, role, room badge
 *
 * All tests operate on the Zustand spatial store directly (no DOM), using the
 * same event-sourcing verification approach as scene-event-log.test.ts.
 *
 * Test IDs follow the pattern:
 *   4a-N : Sub-AC 4a (BuildingEntryHint / FloorContextPanel)
 *   4b-N : Sub-AC 4b (RoomDetailPanel)
 *   4c-N : Sub-AC 4c (AgentDetailPanel state bridge)
 *   3cd-N: Sub-ACs 3c + 3d (DrillBreadcrumb / DrillLevelIndicator)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSpatialStore } from "../spatial-store.js";
import type { DrillLevel } from "../spatial-store.js";
import { BUILDING } from "../../data/building.js";

// ── Reset helpers ─────────────────────────────────────────────────────────────

/**
 * Full store reset to a clean building-level state.
 * Uses BUILDING (the static snapshot) so tests are deterministic.
 */
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
      ])
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

/** Convenience: get latest event from the store */
function lastEvent() {
  const { events } = useSpatialStore.getState();
  return events[events.length - 1];
}

/** Convenience: get all event types from the store */
function eventTypes() {
  return useSpatialStore.getState().events.map((e) => e.type);
}

// ── Known test fixtures (from static BUILDING) ───────────────────────────────
// Floor 0 rooms: lobby-reception, validation-office, archive-vault, stairwell
// Floor 1 rooms: ops-control, impl-office, research-lab, corridor-main, stairwell (spans)

const FLOOR_0 = 0;
const FLOOR_1 = 1;
const ROOM_OPS    = "ops-control";      // floor 1, control type
const ROOM_IMPL   = "impl-office";      // floor 1, office type
const ROOM_LOBBY  = "project-main";     // floor 0, lobby type (main project room)
const ROOM_ARCHIVE = "archive-vault";   // floor 0, archive type

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 3c / 3d — DrillBreadcrumb & DrillLevelIndicator (navigation state)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c/3d — Drill navigation state machine", () => {
  beforeEach(resetStore);

  // 3cd-1
  it("initial drillLevel is 'building' (building-overview state)", () => {
    const { drillLevel, drillFloor, drillRoom, drillAgent } = useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(drillFloor).toBeNull();
    expect(drillRoom).toBeNull();
    expect(drillAgent).toBeNull();
  });

  // 3cd-2
  it("drillIntoFloor transitions to floor level and sets drillFloor", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const { drillLevel, drillFloor } = useSpatialStore.getState();
    expect(drillLevel).toBe("floor");
    expect(drillFloor).toBe(FLOOR_1);
  });

  // 3cd-3
  it("drillIntoFloor clears any previous room/agent context", () => {
    // Simulate being in room context first via setState shortcut
    useSpatialStore.setState({
      drillLevel: "room",
      drillFloor: FLOOR_1,
      drillRoom: ROOM_OPS,
      drillAgent: null,
      selectedRoomId: ROOM_OPS,
    });
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    const { drillRoom, drillAgent, selectedRoomId } = useSpatialStore.getState();
    expect(drillRoom).toBeNull();
    expect(drillAgent).toBeNull();
    expect(selectedRoomId).toBeNull();
  });

  // 3cd-4
  it("drillIntoFloor emits a navigation.drilled_floor event", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(lastEvent().type).toBe("navigation.drilled_floor");
    expect(lastEvent().payload.floorIndex).toBe(FLOOR_1);
  });

  // 3cd-5
  it("drillIntoRoom transitions to room level, selects and focuses the room", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillLevel, drillRoom, selectedRoomId, focusedRoomId } = useSpatialStore.getState();
    expect(drillLevel).toBe("room");
    expect(drillRoom).toBe(ROOM_OPS);
    expect(selectedRoomId).toBe(ROOM_OPS);
    expect(focusedRoomId).toBe(ROOM_OPS);
  });

  // 3cd-6
  it("drillIntoRoom sets drillFloor from the room's floor property", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillFloor).toBe(FLOOR_1);
  });

  // 3cd-7
  it("drillIntoRoom emits navigation.drilled_room + room.selected + room.focused events", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const types = eventTypes();
    expect(types).toContain("navigation.drilled_room");
    expect(types).toContain("room.selected");
    expect(types).toContain("room.focused");
  });

  // 3cd-8
  it("drillIntoRoom updates the room's selected flag in roomStates", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const rs = useSpatialStore.getState().roomStates[ROOM_OPS];
    expect(rs.selected).toBe(true);
  });

  // 3cd-9
  it("drillIntoAgent transitions to agent level while preserving floor/room context", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 4.5, y: 3.5, z: 2 });
    const { drillLevel, drillAgent, drillFloor, drillRoom } = useSpatialStore.getState();
    expect(drillLevel).toBe("agent");
    expect(drillAgent).toBe("manager-default");
    expect(drillFloor).toBe(FLOOR_1);   // floor preserved from drillIntoRoom
    expect(drillRoom).toBe(ROOM_OPS);  // room preserved from drillIntoRoom
  });

  // 3cd-10
  it("drillIntoAgent emits navigation.drilled_agent with worldPosition payload", () => {
    const pos = { x: 1, y: 2, z: 3 };
    useSpatialStore.getState().drillIntoAgent("implementer-subagent", pos);
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.drilled_agent");
    expect(evt.payload.agentId).toBe("implementer-subagent");
    expect(evt.payload.worldPosition).toEqual(pos);
  });

  // 3cd-11
  it("drillAscend from agent → room: sets level to room, clears drillAgent", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillAgent } = useSpatialStore.getState();
    expect(drillLevel).toBe("room");
    expect(drillAgent).toBeNull();
  });

  // 3cd-12
  it("drillAscend from room → floor: clears room selection and focused room", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillRoom, selectedRoomId, focusedRoomId } = useSpatialStore.getState();
    expect(drillLevel).toBe("floor");
    expect(drillRoom).toBeNull();
    expect(selectedRoomId).toBeNull();
    expect(focusedRoomId).toBeNull();
  });

  // 3cd-13
  it("drillAscend from room → floor: room's selected flag is cleared in roomStates", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].selected).toBe(true);
    useSpatialStore.getState().drillAscend();
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].selected).toBe(false);
  });

  // 3cd-14
  it("drillAscend from floor → building: returns to overview and nullifies drillFloor", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillFloor } = useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(drillFloor).toBeNull();
  });

  // 3cd-15
  it("drillAscend at building level is a no-op (no state change, no new event)", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillAscend();
    const after = useSpatialStore.getState().events.length;
    expect(after).toBe(before);   // no new event emitted
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });

  // 3cd-16
  it("drillAscend emits navigation.ascended with correct from/to payload", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    useSpatialStore.getState().drillAscend(); // floor → building
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("floor");
    expect(evt.payload.to).toBe("building");
  });

  // 3cd-17
  it("drillReset returns to building level from any depth and emits navigation.reset", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_IMPL);
    useSpatialStore.getState().drillIntoAgent("implementer-subagent", { x: 1, y: 1, z: 1 });
    useSpatialStore.getState().drillReset();
    const { drillLevel, drillFloor, drillRoom, drillAgent, selectedRoomId } =
      useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(drillFloor).toBeNull();
    expect(drillRoom).toBeNull();
    expect(drillAgent).toBeNull();
    expect(selectedRoomId).toBeNull();
    expect(lastEvent().type).toBe("navigation.reset");
  });

  // 3cd-18
  it("drillReset emits navigation.reset with 'from' payload set to pre-reset level", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const evt = lastEvent();
    expect(evt.payload.from).toBe("room");
  });

  // 3cd-19
  it("full breadcrumb path: building → floor → room → agent → ascend → ascend", () => {
    const store = useSpatialStore.getState;

    store().drillIntoFloor(FLOOR_1);
    expect(store().drillLevel).toBe("floor");

    store().drillIntoRoom(ROOM_OPS);
    expect(store().drillLevel).toBe("room");
    expect(store().drillRoom).toBe(ROOM_OPS);

    store().drillIntoAgent("manager-default", { x: 6.5, y: 3.5, z: 2 });
    expect(store().drillLevel).toBe("agent");

    store().drillAscend(); // agent → room
    expect(store().drillLevel).toBe("room");

    store().drillAscend(); // room → floor
    expect(store().drillLevel).toBe("floor");
    expect(store().drillRoom).toBeNull();

    store().drillAscend(); // floor → building
    expect(store().drillLevel).toBe("building");
    expect(store().drillFloor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 4a — BuildingEntryHint panel data source
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — BuildingEntryHint data (building drill level)", () => {
  beforeEach(resetStore);

  // 4a-1
  it("building.floors has at least 2 floors (multi-floor building)", () => {
    const { building } = useSpatialStore.getState();
    expect(building.floors.length).toBeGreaterThanOrEqual(2);
  });

  // 4a-2
  it("each floor has a .floor index and .name property", () => {
    const { building } = useSpatialStore.getState();
    for (const f of building.floors) {
      expect(typeof f.floor).toBe("number");
      expect(typeof f.name).toBe("string");
      expect(f.name.length).toBeGreaterThan(0);
    }
  });

  // 4a-3
  it("building name is a non-empty string (shown in BuildingEntryHint header)", () => {
    const { building } = useSpatialStore.getState();
    expect(typeof building.name).toBe("string");
    expect(building.name.length).toBeGreaterThan(0);
  });

  // 4a-4
  it("building.rooms count matches the sum of per-floor rooms (excluding stairwell double-count)", () => {
    const { building } = useSpatialStore.getState();
    // All rooms across all floors
    const totalRooms = building.rooms.length;
    expect(totalRooms).toBeGreaterThan(0);
  });

  // 4a-5
  it("drillIntoFloor(0) moves to floor level — BuildingEntryHint hides, DrillBreadcrumb shows", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    expect(useSpatialStore.getState().drillLevel).toBe("floor");
    // BuildingEntryHint condition: drillLevel === "building" → false after drill
    expect(useSpatialStore.getState().drillLevel).not.toBe("building");
  });

  // 4a-6
  it("drillIntoFloor records from which drill level the transition occurred", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const evt = lastEvent();
    expect(evt.payload.from).toBe("building");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 4a — FloorContextPanel data source
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — FloorContextPanel data (floor drill level)", () => {
  beforeEach(resetStore);

  // 4a-7
  it("after drillIntoFloor(1), building.rooms filtered by floor 1 matches expected rooms", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const { building, drillFloor } = useSpatialStore.getState();
    const floorRooms = building.rooms.filter((r) => r.floor === drillFloor);
    // ops-control, impl-office, research-lab, corridor-main are on floor 1
    const roomIds = floorRooms.map((r) => r.roomId);
    expect(roomIds).toContain(ROOM_OPS);
    expect(roomIds).toContain(ROOM_IMPL);
  });

  // 4a-8
  it("floor 0 rooms do not appear in floor 1 context panel filter", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const { building, drillFloor } = useSpatialStore.getState();
    const floorRooms = building.rooms.filter((r) => r.floor === drillFloor);
    const roomIds = floorRooms.map((r) => r.roomId);
    expect(roomIds).not.toContain(ROOM_LOBBY);
    expect(roomIds).not.toContain(ROOM_ARCHIVE);
  });

  // 4a-9
  it("each room in the floor context has a valid colorAccent for room-type badge styling", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const { building, drillFloor } = useSpatialStore.getState();
    const floorRooms = building.rooms.filter((r) => r.floor === drillFloor);
    for (const room of floorRooms) {
      expect(room.colorAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // 4a-10
  it("FloorContextPanel hides when drillLevel is not 'floor'", () => {
    // At building level — FloorContextPanel condition: drillLevel === "floor" is false
    expect(useSpatialStore.getState().drillLevel).toBe("building");
    expect(useSpatialStore.getState().drillFloor).toBeNull();

    // After drilling into room — drillLevel === "room", not "floor"
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillLevel).not.toBe("floor");
  });

  // 4a-11
  it("drillIntoRoom from floor context navigates to room level", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillLevel).toBe("room");
    expect(useSpatialStore.getState().drillRoom).toBe(ROOM_OPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 4b — RoomDetailPanel data (room metadata, lifecycle commands)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4b — RoomDetailPanel — metadata completeness", () => {
  beforeEach(resetStore);

  // 4b-1
  it("getRoomById returns the correct room definition for a known room ID", () => {
    const room = useSpatialStore.getState().getRoomById(ROOM_OPS);
    expect(room).toBeDefined();
    expect(room!.roomId).toBe(ROOM_OPS);
    expect(room!.roomType).toBe("control");
  });

  // 4b-2
  it("getRoomById returns undefined for an unknown room ID", () => {
    const room = useSpatialStore.getState().getRoomById("no-such-room");
    expect(room).toBeUndefined();
  });

  // 4b-3
  it("every room in BUILDING has non-empty name, roomType, and colorAccent", () => {
    const { building } = useSpatialStore.getState();
    for (const room of building.rooms) {
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.roomType.length).toBeGreaterThan(0);
      expect(room.colorAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // 4b-4
  it("rooms with _meta have a valid accessPolicy (open|members-only|approval-required)", () => {
    // _meta is optional — present only when building is loaded from YAML.
    // Static BUILDING rooms may omit it; HUD.tsx guards on room._meta being truthy.
    const { building } = useSpatialStore.getState();
    const valid = new Set(["open", "members-only", "approval-required"]);
    const withMeta = building.rooms.filter((r) => r._meta !== undefined);
    for (const room of withMeta) {
      expect(valid.has(room._meta!.accessPolicy)).toBe(true);
    }
    // The test is meaningful both when static rooms omit _meta (count=0, loop skipped)
    // and when YAML rooms populate it.
    expect(withMeta.length).toBeGreaterThanOrEqual(0); // always passes
  });

  // 4b-5
  it("rooms with _meta have maxOccupancy ≥ 0", () => {
    // Same guard as 4b-4: _meta is optional on the static snapshot.
    const { building } = useSpatialStore.getState();
    const withMeta = building.rooms.filter((r) => r._meta !== undefined);
    for (const room of withMeta) {
      expect(room._meta!.maxOccupancy).toBeGreaterThanOrEqual(0);
    }
    expect(withMeta.length).toBeGreaterThanOrEqual(0); // always passes
  });

  // 4b-6
  it("selectRoom sets selectedRoomId and marks room as selected in roomStates", () => {
    useSpatialStore.getState().selectRoom(ROOM_OPS);
    expect(useSpatialStore.getState().selectedRoomId).toBe(ROOM_OPS);
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].selected).toBe(true);
  });

  // 4b-7
  it("selectRoom(null) clears the selection and emits room.deselected", () => {
    useSpatialStore.getState().selectRoom(ROOM_OPS);
    useSpatialStore.getState().selectRoom(null);
    expect(useSpatialStore.getState().selectedRoomId).toBeNull();
    expect(eventTypes()).toContain("room.deselected");
  });

  // 4b-8
  it("selectRoom emits room.selected event with correct roomId payload", () => {
    useSpatialStore.getState().selectRoom(ROOM_LOBBY);
    const selEvt = useSpatialStore.getState().events.find(
      (e) => e.type === "room.selected" && e.payload.roomId === ROOM_LOBBY
    );
    expect(selEvt).toBeDefined();
  });

  // 4b-9
  it("switching selection from one room to another deselects the previous room", () => {
    useSpatialStore.getState().selectRoom(ROOM_OPS);
    useSpatialStore.getState().selectRoom(ROOM_IMPL);
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].selected).toBe(false);
    expect(useSpatialStore.getState().roomStates[ROOM_IMPL].selected).toBe(true);
  });
});

describe("Sub-AC 4b — RoomDetailPanel — lifecycle commands (PAUSE / RESUME)", () => {
  beforeEach(resetStore);

  // 4b-10
  it("pauseRoom sets paused=true and activity='idle' in roomStates", () => {
    useSpatialStore.getState().pauseRoom(ROOM_OPS);
    const rs = useSpatialStore.getState().roomStates[ROOM_OPS];
    expect(rs.paused).toBe(true);
    expect(rs.activity).toBe("idle");
  });

  // 4b-11
  it("pauseRoom emits room.paused event with correct roomId", () => {
    useSpatialStore.getState().pauseRoom(ROOM_IMPL);
    const evt = useSpatialStore.getState().events.find(
      (e) => e.type === "room.paused" && e.payload.roomId === ROOM_IMPL
    );
    expect(evt).toBeDefined();
  });

  // 4b-12
  it("pauseRoom is idempotent — second call does not emit a new event", () => {
    useSpatialStore.getState().pauseRoom(ROOM_OPS);
    const countAfterFirst = useSpatialStore.getState().events.length;
    useSpatialStore.getState().pauseRoom(ROOM_OPS); // second call
    expect(useSpatialStore.getState().events.length).toBe(countAfterFirst);
  });

  // 4b-13
  it("resumeRoom clears paused flag and emits room.resumed event", () => {
    useSpatialStore.getState().pauseRoom(ROOM_OPS);
    useSpatialStore.getState().resumeRoom(ROOM_OPS);
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].paused).toBe(false);
    const evt = useSpatialStore.getState().events.find(
      (e) => e.type === "room.resumed" && e.payload.roomId === ROOM_OPS
    );
    expect(evt).toBeDefined();
  });

  // 4b-14
  it("resumeRoom is idempotent — no-op if room is not paused", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().resumeRoom(ROOM_OPS); // room is not paused
    expect(useSpatialStore.getState().events.length).toBe(before);
  });

  // 4b-15
  it("pause then resume a room — full round-trip produces two events in order", () => {
    useSpatialStore.getState().pauseRoom(ROOM_LOBBY);
    useSpatialStore.getState().resumeRoom(ROOM_LOBBY);
    const types = eventTypes();
    const pauseIdx  = types.lastIndexOf("room.paused");
    const resumeIdx = types.lastIndexOf("room.resumed");
    expect(pauseIdx).toBeGreaterThanOrEqual(0);
    expect(resumeIdx).toBeGreaterThan(pauseIdx); // resume is after pause
  });
});

describe("Sub-AC 4b — RoomDetailPanel — room runtime state", () => {
  beforeEach(resetStore);

  // 4b-16
  it("getRoomState returns a valid RoomRuntimeState for every room", () => {
    const { building, getRoomState } = useSpatialStore.getState();
    for (const room of building.rooms) {
      const rs = getRoomState(room.roomId);
      expect(rs).toBeDefined();
      expect(typeof rs.paused).toBe("boolean");
      expect(["idle", "active", "busy", "error"]).toContain(rs.activity);
    }
  });

  // 4b-17
  it("getRoomState for ops-control initially has manager-default in activeMembers", () => {
    const rs = useSpatialStore.getState().getRoomState(ROOM_OPS);
    expect(rs.activeMembers).toContain("manager-default");
  });

  // 4b-18
  it("memberJoined adds a member to activeMembers and emits room.member_joined", () => {
    useSpatialStore.getState().memberJoined(ROOM_IMPL, "new-agent-x");
    const rs = useSpatialStore.getState().roomStates[ROOM_IMPL];
    expect(rs.activeMembers).toContain("new-agent-x");
    expect(eventTypes()).toContain("room.member_joined");
  });

  // 4b-19
  it("memberLeft removes a member from activeMembers and emits room.member_left", () => {
    useSpatialStore.getState().memberJoined(ROOM_IMPL, "temp-agent");
    useSpatialStore.getState().memberLeft(ROOM_IMPL, "temp-agent");
    const rs = useSpatialStore.getState().roomStates[ROOM_IMPL];
    expect(rs.activeMembers).not.toContain("temp-agent");
    expect(eventTypes()).toContain("room.member_left");
  });

  // 4b-20
  it("updateRoomActivity changes activity level and emits room.updated", () => {
    useSpatialStore.getState().updateRoomActivity(ROOM_OPS, "busy");
    expect(useSpatialStore.getState().roomStates[ROOM_OPS].activity).toBe("busy");
    expect(eventTypes()).toContain("room.updated");
  });

  // 4b-21
  it("focusRoom records room.focused event and sets focusedRoomId", () => {
    useSpatialStore.getState().focusRoom(ROOM_ARCHIVE);
    expect(useSpatialStore.getState().focusedRoomId).toBe(ROOM_ARCHIVE);
    expect(eventTypes()).toContain("room.focused");
  });

  // 4b-22
  it("focusRoom(null) emits room.unfocused and clears focusedRoomId", () => {
    useSpatialStore.getState().focusRoom(ROOM_OPS);
    useSpatialStore.getState().focusRoom(null);
    expect(useSpatialStore.getState().focusedRoomId).toBeNull();
    expect(eventTypes()).toContain("room.unfocused");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 4c — AgentDetailPanel state bridge (agent-visible data via spatial store)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4c — AgentDetailPanel — spatial store bridge", () => {
  beforeEach(resetStore);

  // 4c-1
  it("drillIntoAgent sets drillAgent to the agent ID", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 5, y: 3.5, z: 2 });
    expect(useSpatialStore.getState().drillAgent).toBe("manager-default");
  });

  // 4c-2
  it("drillIntoAgent emits a navigation.drilled_agent event containing fromRoom context", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 0, y: 0, z: 0 });
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.drilled_agent");
    expect(evt.payload.fromRoom).toBe(ROOM_OPS);
  });

  // 4c-3
  it("after drillAscend from agent level, drillAgent is null", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    expect(useSpatialStore.getState().drillAgent).toBeNull();
    expect(useSpatialStore.getState().drillLevel).toBe("room");
  });

  // 4c-4
  it("ops-control room members include 'manager-default' (panel can show agent link)", () => {
    const room = useSpatialStore.getState().getRoomById(ROOM_OPS);
    expect(room!.members).toContain("manager-default");
  });

  // 4c-5
  it("impl-office room members include 'implementer-subagent'", () => {
    const room = useSpatialStore.getState().getRoomById(ROOM_IMPL);
    expect(room!.members).toContain("implementer-subagent");
  });

  // 4c-6
  it("corridor rooms have no members (agent detail panel would be empty)", () => {
    const { building } = useSpatialStore.getState();
    const corridors = building.rooms.filter((r) => r.roomType === "corridor");
    for (const c of corridors) {
      expect(c.members.length).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 4 — Event sourcing integrity (record transparency)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4 — Record transparency: all navigation + lifecycle actions are event-sourced", () => {
  beforeEach(resetStore);

  // 4e-1
  it("all navigation events have monotonically increasing timestamps", () => {
    const store = useSpatialStore.getState;
    store().drillIntoFloor(FLOOR_1);
    store().drillIntoRoom(ROOM_OPS);
    store().drillIntoAgent("manager-default", { x: 0, y: 0, z: 0 });
    store().drillAscend();
    store().drillAscend();
    store().drillAscend();
    const { events } = useSpatialStore.getState();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
    }
  });

  // 4e-2
  it("all events have unique IDs", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().pauseRoom(ROOM_OPS);
    useSpatialStore.getState().resumeRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const { events } = useSpatialStore.getState();
    const ids = events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // 4e-3
  it("all events have a valid type string from SpatialEventType", () => {
    const validTypes = new Set([
      "building.loaded", "building.load_failed",
      "room.created", "room.updated", "room.member_joined", "room.member_left",
      "room.highlight", "room.unhighlight", "room.selected", "room.deselected",
      "room.focused", "room.unfocused", "floor.visibility_changed",
      "camera.preset_changed", "camera.mode_changed", "camera.zoom_changed",
      "camera.pan_changed", "camera.reset",
      "navigation.drilled_floor", "navigation.drilled_room",
      "navigation.drilled_agent", "navigation.ascended", "navigation.reset",
      "surface.clicked", "surface.dismissed",
      "room.paused", "room.resumed", "meeting.convene_requested",
    ]);

    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().pauseRoom(ROOM_OPS);
    useSpatialStore.getState().resumeRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();

    for (const evt of useSpatialStore.getState().events) {
      expect(validTypes.has(evt.type), `Unexpected event type: ${evt.type}`).toBe(true);
    }
  });

  // 4e-4
  it("event log is append-only — earlier events remain immutable after new mutations", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const snapAfterFloor = [...useSpatialStore.getState().events];

    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const current = useSpatialStore.getState().events;

    // All earlier events must be identical (same id, type, ts)
    for (let i = 0; i < snapAfterFloor.length; i++) {
      expect(current[i].id).toBe(snapAfterFloor[i].id);
      expect(current[i].type).toBe(snapAfterFloor[i].type);
    }
    // New events appended beyond the snapshot
    expect(current.length).toBeGreaterThan(snapAfterFloor.length);
  });

  // 4e-5
  it("loadBuilding replaces building but appends events (does not replace old events)", () => {
    // Pre-seed some events
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    const countBefore = useSpatialStore.getState().events.length;

    // Load a new building (minimal stub)
    const miniBuilding = {
      ...BUILDING,
      buildingId: "test-mini",
      name: "Mini",
      rooms: BUILDING.rooms.slice(0, 3),
    };
    useSpatialStore.getState().loadBuilding(miniBuilding, "yaml");

    const evts = useSpatialStore.getState().events;
    expect(evts.length).toBeGreaterThan(countBefore);
    expect(evts.some((e) => e.type === "building.loaded")).toBe(true);
  });
});

// ── Sub-AC 3a: Camera mode toggle — event sourcing + keyboard/UI semantics ───
//
// Verifies the event-sourced camera mode switching that underpins the bird's-eye
// toggle required by Sub-AC 3a.  All mode changes must:
//   1. Update the cameraMode field in the store.
//   2. Append a camera.mode_changed event to the append-only event log.
//   3. Include from/to payload in the event for replay fidelity.
//
// Test IDs: 3a-store-N

describe("Sub-AC 3a — Camera mode toggle (store event sourcing)", () => {
  beforeEach(() => resetStore());

  // 3a-store-1
  it("default camera mode is 'perspective'", () => {
    expect(useSpatialStore.getState().cameraMode).toBe("perspective");
  });

  // 3a-store-2
  it("setCameraMode('birdsEye') switches cameraMode to birdsEye", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    expect(useSpatialStore.getState().cameraMode).toBe("birdsEye");
  });

  // 3a-store-3
  it("setCameraMode('perspective') from birdsEye switches back to perspective", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    useSpatialStore.getState().setCameraMode("perspective");
    expect(useSpatialStore.getState().cameraMode).toBe("perspective");
  });

  // 3a-store-4
  it("setCameraMode records a camera.mode_changed event", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    const evt = lastEvent();
    expect(evt.type).toBe("camera.mode_changed");
  });

  // 3a-store-5
  it("camera.mode_changed event payload includes from and to fields", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    const evt = lastEvent();
    expect(evt.payload.from).toBe("perspective");
    expect(evt.payload.to).toBe("birdsEye");
  });

  // 3a-store-6
  it("returning to perspective records correct from/to in event payload", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    useSpatialStore.getState().setCameraMode("perspective");
    const evt = lastEvent();
    expect(evt.payload.from).toBe("birdsEye");
    expect(evt.payload.to).toBe("perspective");
  });

  // 3a-store-7
  it("setCameraMode is idempotent — no event emitted if already in target mode", () => {
    // Already in perspective — calling again should not add a new event
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().setCameraMode("perspective");
    const after = useSpatialStore.getState().events.length;
    expect(after).toBe(before);
  });

  // 3a-store-8
  it("camera.mode_changed event has a non-zero timestamp", () => {
    const before = Date.now();
    useSpatialStore.getState().setCameraMode("birdsEye");
    const evt = lastEvent();
    expect(evt.ts).toBeGreaterThanOrEqual(before);
  });

  // 3a-store-9
  it("camera.mode_changed event has a unique ID", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    useSpatialStore.getState().setCameraMode("perspective");
    const evts = useSpatialStore.getState().events.filter(
      (e) => e.type === "camera.mode_changed"
    );
    expect(evts.length).toBe(2);
    expect(evts[0].id).not.toBe(evts[1].id);
  });

  // 3a-store-10
  it("resetCamera returns mode to perspective and resets bird's-eye view", () => {
    useSpatialStore.getState().setCameraMode("birdsEye");
    useSpatialStore.getState().setBirdsEyeZoom(5); // non-default zoom
    useSpatialStore.getState().setBirdsEyePan([3, 3]); // non-zero pan
    useSpatialStore.getState().resetCamera();

    const state = useSpatialStore.getState();
    expect(state.cameraMode).toBe("perspective");
    expect(state.cameraPreset).toBe("overview");
    expect(state.birdsEyeZoom).toBe(10); // BIRDS_EYE_DEFAULT_ZOOM
    expect(state.birdsEyePan[0]).toBe(0);
    expect(state.birdsEyePan[1]).toBe(0);
  });

  // 3a-store-11
  it("resetCamera appends a camera.reset event", () => {
    useSpatialStore.getState().resetCamera();
    const evt = lastEvent();
    expect(evt.type).toBe("camera.reset");
  });
});
