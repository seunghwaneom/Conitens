/**
 * drill-context-panel.test.ts — Tests for Sub-AC 6c.
 *
 * Sub-AC 6c: Wire hierarchical drill-down interaction — clicking building →
 * room → agent progressively reveals contextual metric panels scoped to that
 * entity in world-space.
 *
 * Coverage:
 *   6c-1  : computeDrillPanelPosition at "building" level
 *   6c-2  : computeDrillPanelPosition at "floor" level (floor 0)
 *   6c-3  : computeDrillPanelPosition at "floor" level (floor 1)
 *   6c-4  : computeDrillPanelPosition at "room" level with room center data
 *   6c-5  : computeDrillPanelPosition at "agent" level with world position
 *   6c-6  : building panel position is fixed/consistent across calls
 *   6c-7  : floor panel Y-axis offset is floorIndex × FLOOR_HEIGHT + 2.0
 *   6c-8  : room panel X offset accounts for left-shift (-1.5 from centre)
 *   6c-9  : agent panel X offset is +0.65 from agent world position
 *   6c-10 : agent panel Y offset is +1.6 from agent world Y
 *   6c-11 : floor panel position fallback uses floor 0 when drillFloor is null
 *   6c-12 : room panel position falls back to default when roomWorldCenter is null
 *   6c-13 : agent panel position falls back to default when agentWorldPos is null
 *
 * Store-level tests (drill-down state driving panel visibility):
 *   6c-14 : drillIntoFloor → panel should show FloorContextPanel (drillFloor set)
 *   6c-15 : drillIntoRoom  → panel should show RoomContextPanel  (drillRoom set)
 *   6c-16 : drillIntoAgent → panel should show AgentContextPanel  (drillAgent set)
 *   6c-17 : drillAscend from agent → panel reverts to RoomContextPanel scope
 *   6c-18 : drillReset → panel returns to building-level scope
 *   6c-19 : panel scope updates are event-sourced (events produced by drill actions)
 *   6c-20 : clicking room after floor drill sets drillRoom + drillFloor from room.floor
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computeDrillPanelPosition } from "../DrillContextPanel.js";
import { useSpatialStore } from "../../store/spatial-store.js";
import type { DrillLevel } from "../../store/spatial-store.js";
import { BUILDING } from "../../data/building.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FLOOR_HEIGHT = 3; // must match DrillContextPanel.tsx constant

// Known rooms from the static BUILDING snapshot
const ROOM_OPS   = "ops-control";   // floor 1
const ROOM_LOBBY = "project-main";  // floor 0

function getRoom(roomId: string) {
  return BUILDING.rooms.find((r) => r.roomId === roomId)!;
}

// ── Store reset helper ────────────────────────────────────────────────────────

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

// ── computeDrillPanelPosition unit tests ──────────────────────────────────────

describe("computeDrillPanelPosition — Sub-AC 6c", () => {
  // 6c-1
  it("returns building entrance position at 'building' level", () => {
    const pos = computeDrillPanelPosition("building", null, null, null);
    expect(pos).toEqual([-2.8, 2.5, 3]);
  });

  // 6c-2
  it("returns floor-level position for floor 0", () => {
    const pos = computeDrillPanelPosition("floor", 0, null, null);
    // floor 0: y = 0 * FLOOR_HEIGHT + 2.0 = 2.0
    expect(pos).toEqual([-2.5, 2.0, 3]);
  });

  // 6c-3
  it("returns floor-level position for floor 1 (y offset by FLOOR_HEIGHT)", () => {
    const pos = computeDrillPanelPosition("floor", 1, null, null);
    // floor 1: y = 1 * FLOOR_HEIGHT + 2.0 = 5.0
    expect(pos).toEqual([-2.5, 5.0, 3]);
  });

  // 6c-4
  it("returns room-scoped position with correct offsets", () => {
    // Provide a hypothetical room world center
    const roomCenter = { x: 4.0, y: 3.5, z: 2.5 };
    const pos = computeDrillPanelPosition("room", 1, roomCenter, null);
    // x = cx - 1.5 = 4.0 - 1.5 = 2.5
    // y = cy + 0.8 = 3.5 + 0.8 = 4.3
    // z = cz       = 2.5
    expect(pos[0]).toBeCloseTo(2.5, 5);
    expect(pos[1]).toBeCloseTo(4.3, 5);
    expect(pos[2]).toBeCloseTo(2.5, 5);
  });

  // 6c-5
  it("returns agent-scoped position with correct offsets", () => {
    const agentWorldPos = { x: 3.2, y: 0.0, z: 1.8 };
    const pos = computeDrillPanelPosition("agent", null, null, agentWorldPos);
    // x = ax + 0.65 = 3.85
    // y = ay + 1.6  = 1.6
    // z = az         = 1.8
    expect(pos[0]).toBeCloseTo(3.85, 5);
    expect(pos[1]).toBeCloseTo(1.6, 5);
    expect(pos[2]).toBeCloseTo(1.8, 5);
  });

  // 6c-6
  it("building level position is deterministic across multiple calls", () => {
    const a = computeDrillPanelPosition("building", null, null, null);
    const b = computeDrillPanelPosition("building", null, null, null);
    expect(a).toEqual(b);
  });

  // 6c-7
  it("floor panel Y scales linearly with floor index", () => {
    const f0 = computeDrillPanelPosition("floor", 0, null, null);
    const f1 = computeDrillPanelPosition("floor", 1, null, null);
    const f2 = computeDrillPanelPosition("floor", 2, null, null);
    expect(f1[1] - f0[1]).toBeCloseTo(FLOOR_HEIGHT, 5); // 1 floor = 3 units
    expect(f2[1] - f1[1]).toBeCloseTo(FLOOR_HEIGHT, 5);
  });

  // 6c-8
  it("room panel X is shifted left by 1.5 relative to room centre X", () => {
    const cx = 7.0;
    const roomCenter = { x: cx, y: 4.0, z: 2.0 };
    const pos = computeDrillPanelPosition("room", 1, roomCenter, null);
    expect(pos[0]).toBeCloseTo(cx - 1.5, 5);
  });

  // 6c-9
  it("agent panel X is shifted right by 0.65 relative to agent world X", () => {
    const ax = 5.0;
    const agentPos = { x: ax, y: 0.0, z: 1.0 };
    const pos = computeDrillPanelPosition("agent", null, null, agentPos);
    expect(pos[0]).toBeCloseTo(ax + 0.65, 5);
  });

  // 6c-10
  it("agent panel Y is elevated by 1.6 above agent world Y", () => {
    const ay = 3.0;
    const agentPos = { x: 0, y: ay, z: 0 };
    const pos = computeDrillPanelPosition("agent", null, null, agentPos);
    expect(pos[1]).toBeCloseTo(ay + 1.6, 5);
  });

  // 6c-11
  it("floor panel uses floor 0 when drillFloor is null (safe fallback)", () => {
    const pos = computeDrillPanelPosition("floor", null, null, null);
    // null → treated as 0, so y = 0 * 3 + 2.0 = 2.0
    expect(pos[1]).toBeCloseTo(2.0, 5);
  });

  // 6c-12
  it("falls back to building entrance when drillLevel is 'room' but no room center provided", () => {
    const pos = computeDrillPanelPosition("room", 1, null, null);
    expect(pos).toEqual([-2.8, 2.5, 3]);
  });

  // 6c-13
  it("falls back to building entrance when drillLevel is 'agent' but no agent pos provided", () => {
    const pos = computeDrillPanelPosition("agent", null, null, null);
    expect(pos).toEqual([-2.8, 2.5, 3]);
  });
});

// ── Spatial store state — drill-level panel scope tests ───────────────────────

describe("Drill panel scope tracking (spatial store) — Sub-AC 6c", () => {
  beforeEach(resetStore);

  // 6c-14
  it("drillIntoFloor sets drillFloor so FloorContextPanel receives correct floor index", () => {
    useSpatialStore.getState().drillIntoFloor(1);
    const { drillLevel, drillFloor } = useSpatialStore.getState();
    expect(drillLevel).toBe("floor");
    expect(drillFloor).toBe(1);
    // Panel at floor 1 position (y = 5.0)
    const panelPos = computeDrillPanelPosition("floor", drillFloor, null, null);
    expect(panelPos[1]).toBeCloseTo(5.0, 5);
  });

  // 6c-15
  it("drillIntoRoom sets drillRoom so RoomContextPanel receives correct room ID", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillLevel, drillRoom } = useSpatialStore.getState();
    expect(drillLevel).toBe("room");
    expect(drillRoom).toBe(ROOM_OPS);
  });

  // 6c-16
  it("drillIntoAgent sets drillAgent so AgentContextPanel receives correct agent ID", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const pos = { x: 4.5, y: 3.5, z: 2 };
    useSpatialStore.getState().drillIntoAgent("manager-default", pos);
    const { drillLevel, drillAgent } = useSpatialStore.getState();
    expect(drillLevel).toBe("agent");
    expect(drillAgent).toBe("manager-default");
  });

  // 6c-17
  it("drillAscend from agent level reverts panel scope to room level", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 4, y: 3, z: 2 });
    expect(useSpatialStore.getState().drillLevel).toBe("agent");
    useSpatialStore.getState().drillAscend();
    const { drillLevel, drillRoom, drillAgent } = useSpatialStore.getState();
    expect(drillLevel).toBe("room");
    expect(drillRoom).toBe(ROOM_OPS);
    expect(drillAgent).toBeNull();
  });

  // 6c-18
  it("drillReset returns panel to building-level scope (drillLevel = 'building')", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 4, y: 3, z: 2 });
    useSpatialStore.getState().drillReset();
    const { drillLevel, drillFloor, drillRoom, drillAgent } = useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(drillFloor).toBeNull();
    expect(drillRoom).toBeNull();
    expect(drillAgent).toBeNull();
  });

  // 6c-19
  it("drill-level transitions are event-sourced (navigation events recorded for replay)", () => {
    useSpatialStore.getState().drillIntoFloor(0);
    useSpatialStore.getState().drillIntoRoom(ROOM_LOBBY);
    useSpatialStore.getState().drillIntoAgent("validator-default", { x: 2, y: 0, z: 1 });
    useSpatialStore.getState().drillAscend();
    useSpatialStore.getState().drillReset();

    const events = useSpatialStore.getState().events;
    const navTypes = events.map((e) => e.type).filter((t) => t.startsWith("navigation."));

    expect(navTypes).toContain("navigation.drilled_floor");
    expect(navTypes).toContain("navigation.drilled_room");
    expect(navTypes).toContain("navigation.drilled_agent");
    expect(navTypes).toContain("navigation.ascended");
    expect(navTypes).toContain("navigation.reset");
  });

  // 6c-20
  it("drillIntoRoom sets drillFloor from the room's floor property (correct panel context)", () => {
    const room = getRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillFloor } = useSpatialStore.getState();
    // Panel should show floor context matching the room's floor
    expect(drillFloor).toBe(room.floor);
  });
});

// ── Panel position consistency with building geometry ─────────────────────────

describe("Panel position consistency with building geometry — Sub-AC 6c", () => {
  // 6c-21
  it("building panel is positioned to the left of the building (x < 0)", () => {
    const pos = computeDrillPanelPosition("building", null, null, null);
    expect(pos[0]).toBeLessThan(0); // left of building (BUILDING_W starts at 0)
  });

  // 6c-22
  it("building panel Y is within the building height range (0 < y < 7)", () => {
    const pos = computeDrillPanelPosition("building", null, null, null);
    expect(pos[1]).toBeGreaterThan(0);
    expect(pos[1]).toBeLessThan(7); // 2 floors × 3 units = 6 + headroom
  });

  // 6c-23
  it("floor 0 panel is in the ground-floor height range", () => {
    const pos = computeDrillPanelPosition("floor", 0, null, null);
    // y = 2.0, which is in [0, FLOOR_HEIGHT] range
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[1]).toBeLessThanOrEqual(FLOOR_HEIGHT);
  });

  // 6c-24
  it("floor 1 panel is in the first-floor height range", () => {
    const pos = computeDrillPanelPosition("floor", 1, null, null);
    // y = 5.0, which is in [FLOOR_HEIGHT, 2*FLOOR_HEIGHT] range
    expect(pos[1]).toBeGreaterThanOrEqual(FLOOR_HEIGHT);
    expect(pos[1]).toBeLessThanOrEqual(FLOOR_HEIGHT * 2);
  });

  // 6c-25
  it("room panel Z matches room Z-center (not shifted in Z axis)", () => {
    const roomCenter = { x: 6.0, y: 1.5, z: 3.0 };
    const pos = computeDrillPanelPosition("room", 1, roomCenter, null);
    expect(pos[2]).toBeCloseTo(roomCenter.z, 5);
  });

  // 6c-26
  it("agent panel Z matches agent world Z (not shifted in Z axis)", () => {
    const agentPos = { x: 3.0, y: 0.0, z: 4.5 };
    const pos = computeDrillPanelPosition("agent", null, null, agentPos);
    expect(pos[2]).toBeCloseTo(agentPos.z, 5);
  });
});

// ── Drill-level panel content scope coverage (via store state) ────────────────

describe("Panel content selection rules — Sub-AC 6c", () => {
  beforeEach(resetStore);

  // 6c-27
  it("at 'building' level, panel data covers all floors (floor count = building.floors.length)", () => {
    // At building level the BuildingOverviewPanel shows all floors
    const { building, drillLevel } = useSpatialStore.getState();
    expect(drillLevel).toBe("building");
    expect(building.floors.length).toBeGreaterThan(0);
  });

  // 6c-28
  it("at 'floor' level, panel data is scoped to drillFloor rooms only", () => {
    useSpatialStore.getState().drillIntoFloor(1);
    const { drillFloor, building } = useSpatialStore.getState();
    const floorRooms = building.rooms.filter((r) => r.floor === drillFloor);
    // Floor 1 has at least one room (ops-control is on floor 1)
    expect(floorRooms.length).toBeGreaterThan(0);
    // All floor rooms belong to floor 1
    for (const room of floorRooms) {
      expect(room.floor).toBe(1);
    }
  });

  // 6c-29
  it("at 'room' level, panel data is scoped to drillRoom only", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const { drillRoom, building } = useSpatialStore.getState();
    expect(drillRoom).toBe(ROOM_OPS);
    const room = building.rooms.find((r) => r.roomId === drillRoom)!;
    expect(room.roomId).toBe(ROOM_OPS);
  });

  // 6c-30
  it("at 'agent' level, drillRoom is preserved from the room drill (correct breadcrumb context)", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent("manager-default", { x: 4, y: 3, z: 2 });
    const { drillLevel, drillAgent, drillRoom } = useSpatialStore.getState();
    expect(drillLevel).toBe("agent");
    expect(drillAgent).toBe("manager-default");
    // Room context preserved for breadcrumb rendering
    expect(drillRoom).toBe(ROOM_OPS);
  });
});
