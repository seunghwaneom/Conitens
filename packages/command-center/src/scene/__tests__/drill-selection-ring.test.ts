/**
 * drill-selection-ring.test.ts — Sub-AC 3c
 *
 * "Implement drill-down click/select interaction that transitions the camera
 *  and scene focus from building → office → room → agent, including animated
 *  camera movement between levels."
 *
 * This file tests the DrillSelectionRing component's pure-function layer and
 * the full drill-down interaction chain from the perspective of Sub-AC 3c.
 *
 * Coverage matrix
 * ───────────────
 * 3c-cfg    RING_CONFIG constants — coherence and ranges
 * 3c-pls    computeRingPulse — pure wave function behaviour
 * 3c-nav    Full click-to-drill-to-camera chain via spatial store
 *           (building → floor → room → agent → ascend)
 * 3c-cam    Camera focus positions land inside correct LOD thresholds
 * 3c-evt    Every drill action emits the correct navigation event (record transparency)
 * 3c-sel    Selection state is correctly set/cleared at each transition
 * 3c-kbr    Keyboard-ascend (ESC key proxy via drillAscend)
 * 3c-rst    drillReset returns to building overview from any depth
 * 3c-brd    Breadcrumb state reflects current navigation path correctly
 *
 * NOTE: Three.js and @react-three/fiber cannot be imported in a Node
 * environment.  All tests use only:
 *   - Pure exported functions from DrillSelectionRing.tsx (RING_CONFIG, computeRingPulse)
 *   - The Zustand spatial-store state machine
 *   - The CameraRig pure focus-camera helpers
 *
 * Test ID scheme:
 *   3c-cfg-N : RING_CONFIG constant tests
 *   3c-pls-N : computeRingPulse tests
 *   3c-nav-N : navigation chain tests
 *   3c-cam-N : camera focus position tests
 *   3c-evt-N : event-sourcing compliance tests
 *   3c-sel-N : selection state tests
 *   3c-kbr-N : keyboard ascend tests
 *   3c-rst-N : drillReset tests
 *   3c-brd-N : breadcrumb state tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RING_CONFIG, computeRingPulse } from "../DrillSelectionRing.js";
import {
  computeFloorFocusCamera,
  computeRoomFocusCamera,
  computeAgentFocusCamera,
  CAMERA_PRESETS,
  CAMERA_TRANSITION_SPEED,
} from "../CameraRig.js";
import { useSpatialStore, type DrillLevel } from "../../store/spatial-store.js";
import { BUILDING } from "../../data/building.js";

// ── Store reset helper ─────────────────────────────────────────────────────

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
    buildingSelected: false,
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

/** Euclidean distance between two 3-tuples */
function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ── Test fixtures ──────────────────────────────────────────────────────────

const FLOOR_0 = 0;
const FLOOR_1 = 1;
// ops-control is on floor 1, impl-office is also on floor 1
const ROOM_OPS  = "ops-control";
const ROOM_IMPL = "impl-office";
const AGENT_ID  = "manager-default";

// LOD thresholds from SceneHierarchy.tsx (must stay in sync)
const LOD_FLOOR_NEAR   = 14;   // camera must be < 14 from floor centre after drillIntoFloor
const LOD_AGENT_NEAR   = 6;    // camera must be < 6 from agent centre after drillIntoAgent

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-cfg — RING_CONFIG constants
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-cfg — RING_CONFIG constants coherence", () => {
  // 3c-cfg-1
  it("FLOOR_PADDING is a positive number", () => {
    expect(typeof RING_CONFIG.FLOOR_PADDING).toBe("number");
    expect(RING_CONFIG.FLOOR_PADDING).toBeGreaterThan(0);
  });

  // 3c-cfg-2
  it("ROOM_PADDING is a positive number less than FLOOR_PADDING", () => {
    expect(RING_CONFIG.ROOM_PADDING).toBeGreaterThan(0);
    expect(RING_CONFIG.ROOM_PADDING).toBeLessThanOrEqual(RING_CONFIG.FLOOR_PADDING);
  });

  // 3c-cfg-3
  it("AGENT_RING_RADIUS is positive and small enough to fit under an agent", () => {
    expect(RING_CONFIG.AGENT_RING_RADIUS).toBeGreaterThan(0);
    expect(RING_CONFIG.AGENT_RING_RADIUS).toBeLessThan(1.0);
  });

  // 3c-cfg-4
  it("PULSE_SPEED is positive (needed for animation)", () => {
    expect(RING_CONFIG.PULSE_SPEED).toBeGreaterThan(0);
  });

  // 3c-cfg-5
  it("opacity range is coherent: MIN < MAX for both line and fill", () => {
    expect(RING_CONFIG.RING_LINE_OPACITY_MIN).toBeLessThan(RING_CONFIG.RING_LINE_OPACITY_MAX);
    expect(RING_CONFIG.FILL_OPACITY_MIN).toBeLessThan(RING_CONFIG.FILL_OPACITY_MAX);
  });

  // 3c-cfg-6
  it("all opacity values are in [0, 1]", () => {
    const values = [
      RING_CONFIG.RING_LINE_OPACITY_MIN,
      RING_CONFIG.RING_LINE_OPACITY_MAX,
      RING_CONFIG.FILL_OPACITY_MIN,
      RING_CONFIG.FILL_OPACITY_MAX,
    ];
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // 3c-cfg-7
  it("fill opacities are much lower than line opacities (subtle fill design)", () => {
    expect(RING_CONFIG.FILL_OPACITY_MAX).toBeLessThan(RING_CONFIG.RING_LINE_OPACITY_MIN);
  });

  // 3c-cfg-8
  it("FLOOR_Y_OFFSET is a small positive value (anti z-fighting)", () => {
    expect(RING_CONFIG.FLOOR_Y_OFFSET).toBeGreaterThan(0);
    expect(RING_CONFIG.FLOOR_Y_OFFSET).toBeLessThan(0.1);
  });

  // 3c-cfg-9
  it("FLOOR_HEIGHT is 3 world-units (consistent with building.ts)", () => {
    expect(RING_CONFIG.FLOOR_HEIGHT).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-pls — computeRingPulse
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-pls — computeRingPulse pure function", () => {
  // 3c-pls-1
  it("returns a value in [0, 1]", () => {
    for (const t of [0, 0.1, 1.0, Math.PI, 100]) {
      const v = computeRingPulse(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // 3c-pls-2
  it("returns 0.5 at t=0 (sine starts at 0; (0+1)/2 = 0.5)", () => {
    expect(computeRingPulse(0)).toBeCloseTo(0.5, 5);
  });

  // 3c-pls-3
  it("returns 1.0 at the positive peak (t = π/2 / PULSE_SPEED)", () => {
    const t = (Math.PI / 2) / RING_CONFIG.PULSE_SPEED;
    expect(computeRingPulse(t)).toBeCloseTo(1.0, 4);
  });

  // 3c-pls-4
  it("returns 0.0 at the trough (t = 3π/2 / PULSE_SPEED)", () => {
    const t = (3 * Math.PI / 2) / RING_CONFIG.PULSE_SPEED;
    expect(computeRingPulse(t)).toBeCloseTo(0.0, 4);
  });

  // 3c-pls-5
  it("phaseOffset shifts the wave", () => {
    const t = 0;
    const noOffset  = computeRingPulse(t, 0);
    const withOffset = computeRingPulse(t, Math.PI / 2);
    // Phase of π/2 → sin(π/2) = 1 → result = 1.0
    expect(withOffset).toBeCloseTo(1.0, 4);
    expect(noOffset).not.toBeCloseTo(withOffset, 2);
  });

  // 3c-pls-6
  it("is periodic with period 2π / PULSE_SPEED", () => {
    const period = (2 * Math.PI) / RING_CONFIG.PULSE_SPEED;
    const t = 1.234;
    expect(computeRingPulse(t)).toBeCloseTo(computeRingPulse(t + period), 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-nav — Full click-to-drill navigation chain
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-nav — Full drill-down interaction chain (building → floor → room → agent)", () => {
  beforeEach(resetStore);

  // 3c-nav-1
  it("initial state is at building level — no drill target active", () => {
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("building");
    expect(s.drillFloor).toBeNull();
    expect(s.drillRoom).toBeNull();
    expect(s.drillAgent).toBeNull();
  });

  // 3c-nav-2
  it("clicking building: drillIntoFloor(0) → moves to floor-level focus", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("floor");
    expect(s.drillFloor).toBe(FLOOR_0);
    expect(s.drillRoom).toBeNull();
    expect(s.drillAgent).toBeNull();
  });

  // 3c-nav-3
  it("clicking floor 1 from floor 0: drillIntoFloor(1) switches floor focus", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("floor");
    expect(s.drillFloor).toBe(FLOOR_1);
  });

  // 3c-nav-4
  it("clicking room from floor level: drillIntoRoom(ops-control) → room focus", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("room");
    expect(s.drillRoom).toBe(ROOM_OPS);
    expect(s.drillFloor).toBe(FLOOR_1); // floor auto-set from room
  });

  // 3c-nav-5
  it("clicking room from DIFFERENT floor: drillIntoRoom auto-corrects drillFloor", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0); // wrong floor for ops-control
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS); // ops-control is on floor 1
    const { drillFloor } = useSpatialStore.getState();
    expect(drillFloor).toBe(FLOOR_1); // corrected to match room's actual floor
  });

  // 3c-nav-6
  it("clicking agent: drillIntoAgent(manager-default) → agent focus", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 6.5, y: 3.5, z: 2 });
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("agent");
    expect(s.drillAgent).toBe(AGENT_ID);
    expect(s.drillRoom).toBe(ROOM_OPS);  // room context preserved
    expect(s.drillFloor).toBe(FLOOR_1); // floor context preserved
  });

  // 3c-nav-7
  it("complete drill chain: building → floor → room → agent traversal", () => {
    const store = useSpatialStore.getState();
    store.drillIntoFloor(FLOOR_1);
    expect(useSpatialStore.getState().drillLevel).toBe("floor");

    store.drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillLevel).toBe("room");

    store.drillIntoAgent(AGENT_ID, { x: 6.5, y: 3.5, z: 2 });
    expect(useSpatialStore.getState().drillLevel).toBe("agent");
    expect(useSpatialStore.getState().drillAgent).toBe(AGENT_ID);
  });

  // 3c-nav-8
  it("skip-level navigation: drillIntoRoom from building level works directly", () => {
    // No intermediate drillIntoFloor needed — rooms can be clicked anywhere
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("room");
    expect(s.drillRoom).toBe(ROOM_OPS);
    expect(s.drillFloor).toBe(FLOOR_1); // floor inferred from room
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-cam — Camera focus positions land in correct LOD thresholds
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-cam — Camera focus positions and LOD threshold compliance", () => {
  // 3c-cam-1
  it("CAMERA_TRANSITION_SPEED is positive and sensible (1–10)", () => {
    expect(CAMERA_TRANSITION_SPEED).toBeGreaterThanOrEqual(1);
    expect(CAMERA_TRANSITION_SPEED).toBeLessThanOrEqual(10);
  });

  // 3c-cam-2
  it("CAMERA_PRESETS.overview camera is positioned above building", () => {
    expect(CAMERA_PRESETS.overview.position[1]).toBeGreaterThan(0);
    expect(CAMERA_PRESETS.overview.target[1]).toBeGreaterThanOrEqual(0);
  });

  // 3c-cam-3
  it("computeFloorFocusCamera(0) positions camera < LOD_FLOOR_NEAR from floor centre", () => {
    const FLOOR_H = RING_CONFIG.FLOOR_HEIGHT;
    const floorCentreY = FLOOR_0 * FLOOR_H + FLOOR_H / 2;
    const { position } = computeFloorFocusCamera(FLOOR_0);
    const floorCentre: [number, number, number] = [6, floorCentreY, 3]; // building centre
    expect(dist3(position, floorCentre)).toBeLessThan(LOD_FLOOR_NEAR);
  });

  // 3c-cam-4
  it("computeFloorFocusCamera(1) positions camera < LOD_FLOOR_NEAR from floor 1 centre", () => {
    const FLOOR_H = RING_CONFIG.FLOOR_HEIGHT;
    const floorCentreY = FLOOR_1 * FLOOR_H + FLOOR_H / 2;
    const { position } = computeFloorFocusCamera(FLOOR_1);
    const floorCentre: [number, number, number] = [6, floorCentreY, 3];
    expect(dist3(position, floorCentre)).toBeLessThan(LOD_FLOOR_NEAR);
  });

  // 3c-cam-5
  it("computeAgentFocusCamera places camera < LOD_AGENT_NEAR from agent position", () => {
    const agentPos = { x: 6.5, y: 3.5, z: 2 };
    const { position } = computeAgentFocusCamera(agentPos);
    const agentCentre: [number, number, number] = [agentPos.x, agentPos.y, agentPos.z];
    expect(dist3(position, agentCentre)).toBeLessThan(LOD_AGENT_NEAR);
  });

  // 3c-cam-6
  it("computeRoomFocusCamera targets the room's geometric centre", () => {
    const room = BUILDING.rooms.find((r) => r.roomId === ROOM_OPS)!;
    expect(room).toBeDefined();
    const { target } = computeRoomFocusCamera(room);
    const expectedX = room.position.x + room.dimensions.x / 2;
    const expectedY = room.position.y + room.dimensions.y / 2;
    const expectedZ = room.position.z + room.dimensions.z / 2;
    expect(target[0]).toBeCloseTo(expectedX, 3);
    expect(target[1]).toBeCloseTo(expectedY, 3);
    expect(target[2]).toBeCloseTo(expectedZ, 3);
  });

  // 3c-cam-7
  it("all three focus cameras position the camera ABOVE their target (y > target.y)", () => {
    const floorCam = computeFloorFocusCamera(FLOOR_1);
    const room = BUILDING.rooms.find((r) => r.roomId === ROOM_OPS)!;
    const roomCam = computeRoomFocusCamera(room);
    const agentCam = computeAgentFocusCamera({ x: 6, y: 3, z: 2 });

    expect(floorCam.position[1]).toBeGreaterThan(floorCam.target[1]);
    expect(roomCam.position[1]).toBeGreaterThan(roomCam.target[1]);
    expect(agentCam.position[1]).toBeGreaterThan(agentCam.target[1]);
  });

  // 3c-cam-8
  it("floor 1 camera is higher than floor 0 camera (camera rises with floor level)", () => {
    const cam0 = computeFloorFocusCamera(FLOOR_0);
    const cam1 = computeFloorFocusCamera(FLOOR_1);
    expect(cam1.position[1]).toBeGreaterThan(cam0.position[1]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-evt — Event-sourcing compliance
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-evt — Every drill action emits the correct navigation event (record transparency)", () => {
  beforeEach(resetStore);

  // 3c-evt-1
  it("drillIntoFloor emits 'navigation.drilled_floor' with floorIndex + from", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.drilled_floor");
    expect(evt.payload.floorIndex).toBe(FLOOR_1);
    expect(evt.payload.from).toBe("building");
  });

  // 3c-evt-2
  it("drillIntoRoom emits 'navigation.drilled_room', 'room.selected', 'room.focused'", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const types = eventTypes();
    expect(types).toContain("navigation.drilled_room");
    expect(types).toContain("room.selected");
    expect(types).toContain("room.focused");
  });

  // 3c-evt-3
  it("navigation.drilled_room payload includes roomId and correct floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const evt = useSpatialStore.getState().events.find((e) => e.type === "navigation.drilled_room");
    expect(evt!.payload.roomId).toBe(ROOM_OPS);
    expect(evt!.payload.floor).toBe(FLOOR_1); // ops-control is on floor 1
  });

  // 3c-evt-4
  it("drillIntoAgent emits 'navigation.drilled_agent' with agentId + worldPosition", () => {
    const pos = { x: 6.5, y: 3.5, z: 2.0 };
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, pos);
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.drilled_agent");
    expect(evt.payload.agentId).toBe(AGENT_ID);
    expect(evt.payload.worldPosition).toEqual(pos);
  });

  // 3c-evt-5
  it("drillAscend from agent→room emits 'navigation.ascended' with from=agent, to=room", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("agent");
    expect(evt.payload.to).toBe("room");
  });

  // 3c-evt-6
  it("drillAscend from room→floor emits 'navigation.ascended' with from=room, to=floor", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("room");
    expect(evt.payload.to).toBe("floor");
  });

  // 3c-evt-7
  it("drillAscend from floor→building emits 'navigation.ascended' with from=floor, to=building", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_0);
    useSpatialStore.getState().drillAscend();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.ascended");
    expect(evt.payload.from).toBe("floor");
    expect(evt.payload.to).toBe("building");
  });

  // 3c-evt-8
  it("drillReset emits 'navigation.reset' with from field set to pre-reset level", () => {
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.reset");
    expect(evt.payload.from).toBe("agent");
  });

  // 3c-evt-9
  it("all events have unique IDs throughout the full drill chain", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 6, y: 3, z: 2 });
    useSpatialStore.getState().drillAscend();
    useSpatialStore.getState().drillReset();
    const ids = useSpatialStore.getState().events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  // 3c-evt-10
  it("timestamps are monotonically non-decreasing across the full drill chain", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    const tss = useSpatialStore.getState().events.map((e) => e.ts);
    for (let i = 1; i < tss.length; i++) {
      expect(tss[i]).toBeGreaterThanOrEqual(tss[i - 1]!);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-sel — Selection state correctness
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-sel — Selection and focus state at each drill transition", () => {
  beforeEach(resetStore);

  // 3c-sel-1
  it("drillIntoRoom sets selectedRoomId and focusedRoomId", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const s = useSpatialStore.getState();
    expect(s.selectedRoomId).toBe(ROOM_OPS);
    expect(s.focusedRoomId).toBe(ROOM_OPS);
  });

  // 3c-sel-2
  it("drillIntoRoom sets the room's selected flag in roomStates", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const rs = useSpatialStore.getState().roomStates[ROOM_OPS];
    expect(rs.selected).toBe(true);
  });

  // 3c-sel-3
  it("switching rooms via drillIntoRoom deselects the previous room", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoRoom(ROOM_IMPL);
    const prev = useSpatialStore.getState().roomStates[ROOM_OPS];
    const next = useSpatialStore.getState().roomStates[ROOM_IMPL];
    expect(prev.selected).toBe(false);
    expect(next.selected).toBe(true);
  });

  // 3c-sel-4
  it("drillAscend from room→floor clears selectedRoomId and focusedRoomId", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const s = useSpatialStore.getState();
    expect(s.selectedRoomId).toBeNull();
    expect(s.focusedRoomId).toBeNull();
  });

  // 3c-sel-5
  it("drillAscend from room→floor clears the room's selected flag in roomStates", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend();
    const rs = useSpatialStore.getState().roomStates[ROOM_OPS];
    expect(rs.selected).toBe(false);
  });

  // 3c-sel-6
  it("drillAscend from agent→room preserves room selection (still in room context)", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend();
    const s = useSpatialStore.getState();
    expect(s.drillRoom).toBe(ROOM_OPS);       // room still drilled
    expect(s.drillAgent).toBeNull();           // agent cleared
    expect(s.drillLevel).toBe("room");
  });

  // 3c-sel-7
  it("drillReset clears all selection and drill state from any depth", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("building");
    expect(s.drillFloor).toBeNull();
    expect(s.drillRoom).toBeNull();
    expect(s.drillAgent).toBeNull();
    expect(s.selectedRoomId).toBeNull();
    expect(s.focusedRoomId).toBeNull();
    expect(s.roomStates[ROOM_OPS].selected).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-kbr — Keyboard-ascend (ESC proxy)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-kbr — ESC keyboard navigation (drillAscend proxy)", () => {
  beforeEach(resetStore);

  // 3c-kbr-1
  it("drillAscend from agent → room (ESC from agent level)", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend(); // ESC
    expect(useSpatialStore.getState().drillLevel).toBe("room");
    expect(useSpatialStore.getState().drillAgent).toBeNull();
  });

  // 3c-kbr-2
  it("drillAscend from room → floor (ESC from room level)", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillAscend(); // ESC
    expect(useSpatialStore.getState().drillLevel).toBe("floor");
    expect(useSpatialStore.getState().drillRoom).toBeNull();
  });

  // 3c-kbr-3
  it("drillAscend from floor → building (ESC from floor level)", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillAscend(); // ESC
    expect(useSpatialStore.getState().drillLevel).toBe("building");
    expect(useSpatialStore.getState().drillFloor).toBeNull();
  });

  // 3c-kbr-4
  it("drillAscend at building level is a no-op (no event, no state change)", () => {
    const eventsBefore = useSpatialStore.getState().events.length;
    useSpatialStore.getState().drillAscend(); // ESC at root
    const eventsAfter = useSpatialStore.getState().events.length;
    expect(eventsAfter).toBe(eventsBefore); // no event emitted
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });

  // 3c-kbr-5
  it("multiple ESC presses walk all the way from agent → building", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });

    useSpatialStore.getState().drillAscend(); // agent → room
    expect(useSpatialStore.getState().drillLevel).toBe("room");

    useSpatialStore.getState().drillAscend(); // room → floor
    expect(useSpatialStore.getState().drillLevel).toBe("floor");

    useSpatialStore.getState().drillAscend(); // floor → building
    expect(useSpatialStore.getState().drillLevel).toBe("building");

    useSpatialStore.getState().drillAscend(); // building → building (no-op)
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-rst — drillReset
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-rst — drillReset returns to building overview from any depth", () => {
  beforeEach(resetStore);

  // 3c-rst-1
  it("drillReset from floor level returns to building", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    useSpatialStore.getState().drillReset();
    expect(useSpatialStore.getState().drillLevel).toBe("building");
    expect(useSpatialStore.getState().drillFloor).toBeNull();
  });

  // 3c-rst-2
  it("drillReset from room level returns to building and clears room", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("building");
    expect(s.drillRoom).toBeNull();
    expect(s.selectedRoomId).toBeNull();
  });

  // 3c-rst-3
  it("drillReset from agent level returns to building and clears all context", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillReset();
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("building");
    expect(s.drillFloor).toBeNull();
    expect(s.drillRoom).toBeNull();
    expect(s.drillAgent).toBeNull();
  });

  // 3c-rst-4
  it("drillReset emits navigation.reset with correct 'from' field", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillReset();
    const evt = lastEvent();
    expect(evt.type).toBe("navigation.reset");
    expect(evt.payload.from).toBe("room");
  });

  // 3c-rst-5
  it("drillReset from building level is a no-op (but may still record a reset event)", () => {
    // At building level, drillReset is valid but there's nothing to clear.
    // The store emits a navigation.reset event regardless.
    useSpatialStore.getState().drillReset();
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3c-brd — Breadcrumb state derivation from navigation state
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3c-brd — Breadcrumb state reflects current navigation path", () => {
  beforeEach(resetStore);

  // 3c-brd-1
  it("at building level: drillFloor, drillRoom, drillAgent are all null", () => {
    const s = useSpatialStore.getState();
    expect(s.drillLevel).toBe("building");
    expect(s.drillFloor).toBeNull();
    expect(s.drillRoom).toBeNull();
    expect(s.drillAgent).toBeNull();
  });

  // 3c-brd-2
  it("after drillIntoFloor: drillFloor is set (breadcrumb shows floor segment)", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(useSpatialStore.getState().drillFloor).toBe(FLOOR_1);
    expect(useSpatialStore.getState().drillRoom).toBeNull();
    expect(useSpatialStore.getState().drillAgent).toBeNull();
  });

  // 3c-brd-3
  it("after drillIntoRoom: drillRoom is set, drillFloor auto-populated", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillRoom).toBe(ROOM_OPS);
    expect(useSpatialStore.getState().drillFloor).toBe(FLOOR_1);
    expect(useSpatialStore.getState().drillAgent).toBeNull();
  });

  // 3c-brd-4
  it("after drillIntoAgent: drillAgent is set, floor and room preserved", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    const s = useSpatialStore.getState();
    expect(s.drillAgent).toBe(AGENT_ID);
    expect(s.drillRoom).toBe(ROOM_OPS);
    expect(s.drillFloor).toBe(FLOOR_1);
  });

  // 3c-brd-5
  it("breadcrumb path length = 1 at building, grows to 4 at agent level", () => {
    // building: just 1 segment (the building itself)
    expect(useSpatialStore.getState().drillLevel).toBe("building");
    const atBuilding = [
      !!useSpatialStore.getState().drillFloor,  // false
      !!useSpatialStore.getState().drillRoom,   // false
      !!useSpatialStore.getState().drillAgent,  // false
    ].filter(Boolean).length;
    expect(atBuilding).toBe(0); // all null at building level

    // floor: 1 context segment
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    expect(useSpatialStore.getState().drillFloor).not.toBeNull();
    expect(useSpatialStore.getState().drillRoom).toBeNull();

    // room: 2 context segments
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    expect(useSpatialStore.getState().drillFloor).not.toBeNull();
    expect(useSpatialStore.getState().drillRoom).not.toBeNull();
    expect(useSpatialStore.getState().drillAgent).toBeNull();

    // agent: 3 context segments
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    expect(useSpatialStore.getState().drillFloor).not.toBeNull();
    expect(useSpatialStore.getState().drillRoom).not.toBeNull();
    expect(useSpatialStore.getState().drillAgent).not.toBeNull();
  });

  // 3c-brd-6
  it("ascending clears the deepest breadcrumb segment only", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    useSpatialStore.getState().drillIntoAgent(AGENT_ID, { x: 0, y: 0, z: 0 });
    useSpatialStore.getState().drillAscend(); // agent → room
    const s = useSpatialStore.getState();
    expect(s.drillAgent).toBeNull();           // cleared
    expect(s.drillRoom).toBe(ROOM_OPS);        // preserved
    expect(s.drillFloor).toBe(FLOOR_1);        // preserved
  });

  // 3c-brd-7
  it("building name is accessible for breadcrumb root label", () => {
    const buildingName = useSpatialStore.getState().building.name;
    expect(typeof buildingName).toBe("string");
    expect(buildingName.length).toBeGreaterThan(0);
  });

  // 3c-brd-8
  it("floor name is accessible via floors array for breadcrumb floor segment", () => {
    useSpatialStore.getState().drillIntoFloor(FLOOR_1);
    const floorDef = useSpatialStore.getState().building.floors.find((f) => f.floor === FLOOR_1);
    expect(floorDef).toBeDefined();
    expect(typeof floorDef!.name).toBe("string");
  });

  // 3c-brd-9
  it("room name is accessible via building.rooms for breadcrumb room segment", () => {
    useSpatialStore.getState().drillIntoRoom(ROOM_OPS);
    const roomDef = useSpatialStore.getState().building.rooms.find((r) => r.roomId === ROOM_OPS);
    expect(roomDef).toBeDefined();
    expect(typeof roomDef!.name).toBe("string");
  });
});
