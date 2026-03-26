/**
 * office-layer-interactivity.test.ts — Tests for Sub-AC 4a.
 *
 * Covers the office-layer interactivity requirements:
 *   - Clicking/selecting the building triggers BuildingContextPanel (buildingSelected state)
 *   - Building rename (updateBuildingName) — event-sourced, auditable
 *   - Floor rename (updateFloorName) — event-sourced, auditable
 *   - Office-level lifecycle controls:
 *       startAllAgentsInScope("building") — starts all inactive/terminated agents
 *       stopAllAgentsInScope("building")  — stops all non-terminated agents
 *       startAllAgentsInScope("floor", N) — floor-scoped start
 *       stopAllAgentsInScope("floor", N)  — floor-scoped stop
 *   - recordOfficeBulkLifecycle — spatial store audit event for bulk commands
 *
 * Sub-AC 4a: Office layer interactivity — clicking/selecting the building or
 * office-level nodes triggers context panels showing aggregate stats, allows
 * renaming, and exposes office-level lifecycle controls (start/stop all agents).
 *
 * Test ID scheme:
 *   4a-N : Sub-AC 4a office layer interactivity
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSpatialStore } from "../spatial-store.js";
import { useAgentStore, injectSpatialStoreRef } from "../agent-store.js";
import { createDynamicAgentDef } from "../../data/agents.js";
import type { BuildingDef } from "../../data/building.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Create a minimal BuildingDef for tests */
function makeBuilding(): BuildingDef {
  return {
    buildingId: "hq",
    name: "HQ",
    style: "low-poly",
    visual: {
      wallColor: "#1a1a2e",
      floorColor: "#12121c",
      ceilingColor: "#16162a",
      gridColor: "#1a1a30",
      gridVisible: true,
    },
    floors: [
      { floor: 0, name: "Ground Floor", gridW: 12, gridD: 6, roomIds: ["ops-control", "research-lab"] },
      { floor: 1, name: "Upper Floor",  gridW: 12, gridD: 6, roomIds: ["archive-vault"] },
    ],
    rooms: [
      {
        roomId: "ops-control",
        name: "Ops Control",
        roomType: "control",
        floor: 0,
        members: [],
        colorAccent: "#4a6aff",
        icon: "⬡",
        position: { x: 0, y: 0, z: 0 },
        dimensions: { x: 4, y: 3, z: 4 },
        positionHint: {
          position: { x: 0, y: 0, z: 0 },
          dimensions: { x: 4, y: 3, z: 4 },
          center: { x: 2, y: 1.5, z: 2 },
          cameraPreset: "overhead",
        },
        cameraPreset: "overhead",
        doors: [],
        windows: [],
        furniture: [],
      },
      {
        roomId: "research-lab",
        name: "Research Lab",
        roomType: "lab",
        floor: 0,
        members: [],
        colorAccent: "#aa44ff",
        icon: "◈",
        position: { x: 4, y: 0, z: 0 },
        dimensions: { x: 4, y: 3, z: 4 },
        positionHint: {
          position: { x: 4, y: 0, z: 0 },
          dimensions: { x: 4, y: 3, z: 4 },
          center: { x: 6, y: 1.5, z: 2 },
          cameraPreset: "overhead",
        },
        cameraPreset: "overhead",
        doors: [],
        windows: [],
        furniture: [],
      },
      {
        roomId: "archive-vault",
        name: "Archive Vault",
        roomType: "archive",
        floor: 1,
        members: [],
        colorAccent: "#44aaff",
        icon: "◉",
        position: { x: 0, y: 3, z: 0 },
        dimensions: { x: 6, y: 3, z: 4 },
        positionHint: {
          position: { x: 0, y: 3, z: 0 },
          dimensions: { x: 6, y: 3, z: 4 },
          center: { x: 3, y: 4.5, z: 2 },
          cameraPreset: "overhead",
        },
        cameraPreset: "overhead",
        doors: [],
        windows: [],
        furniture: [],
      },
    ],
  };
}

/** Reset both stores to a clean state */
function resetStores() {
  useSpatialStore.setState({
    building: makeBuilding() as BuildingDef,
    roomStates: {},
    events: [],
    dataSource: "static",
    loading: false,
    error: null,
    selectedRoomId: null,
    focusedRoomId: null,
    floorVisibility: { 0: true, 1: true },
    cameraMode: "perspective",
    cameraPreset: "overview",
    birdsEyeZoom: 10,
    birdsEyePan: [0, 0],
    roomCreationLog: [],
    drillLevel: "building",
    drillFloor: null,
    drillRoom: null,
    drillAgent: null,
    buildingSelected: false,
    activeSurfaceId: null,
    activeSurfaceRoomId: null,
    _savedLiveRoomStates: null,
    conveneDialogRoomId: null,
  });

  useAgentStore.setState({
    agents: {},
    agentRegistry: {},
    events: [],
    selectedAgentId: null,
    initialized: false,
    _savedLiveAgents: null,
  });
}

/** Register an agent and return its ID */
function registerAgent(id: string, room: string) {
  const def = createDynamicAgentDef(id, `Agent ${id}`, "implementer", room);
  useAgentStore.getState().registerAgent(def, { roomId: room });
  return id;
}

/** Transition agent to a given status via changeAgentStatus */
function setAgentStatus(id: string, status: string) {
  useAgentStore.getState().changeAgentStatus(id, status as never, "test");
}

/** Get the most recent spatial event */
function lastSpatialEvent() {
  const { events } = useSpatialStore.getState();
  return events[events.length - 1];
}

/** Get the most recent agent event */
function lastAgentEvent() {
  const { events } = useAgentStore.getState();
  return events[events.length - 1];
}

// ── Inject spatial store ref for floor-scope lookups ──────────────────────────
// (mirrors the App.tsx pattern used in production)
injectSpatialStoreRef(() => useSpatialStore.getState());

// ═════════════════════════════════════════════════════════════════════════════
// Building selection (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Building selection", () => {
  beforeEach(resetStores);

  it("4a-01: selectBuilding(true) sets buildingSelected and emits building.selected", () => {
    useSpatialStore.getState().selectBuilding(true);
    const { buildingSelected } = useSpatialStore.getState();
    expect(buildingSelected).toBe(true);
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("building.selected");
    expect(evt.payload.selected).toBe(true);
  });

  it("4a-02: selectBuilding(false) clears buildingSelected and emits building.deselected", () => {
    useSpatialStore.getState().selectBuilding(true);
    useSpatialStore.getState().selectBuilding(false);
    expect(useSpatialStore.getState().buildingSelected).toBe(false);
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("building.deselected");
    expect(evt.payload.selected).toBe(false);
  });

  it("4a-03: selectBuilding is idempotent — no-op if already in target state", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().selectBuilding(false); // starts false, calling with false → no-op
    expect(useSpatialStore.getState().events.length).toBe(before);
  });

  it("4a-04: selecting building does not change drill level", () => {
    useSpatialStore.getState().selectBuilding(true);
    expect(useSpatialStore.getState().drillLevel).toBe("building");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Building rename (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Building rename", () => {
  beforeEach(resetStores);

  it("4a-05: updateBuildingName updates building.name", () => {
    useSpatialStore.getState().updateBuildingName("Command Centre Alpha");
    expect(useSpatialStore.getState().building.name).toBe("Command Centre Alpha");
  });

  it("4a-06: updateBuildingName emits building.renamed event with from/to", () => {
    useSpatialStore.getState().updateBuildingName("New Name");
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("building.renamed");
    expect(evt.payload.from_name).toBe("HQ");
    expect(evt.payload.to_name).toBe("New Name");
    expect(evt.payload.building_id).toBe("hq");
  });

  it("4a-07: updateBuildingName is a no-op when name is unchanged", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().updateBuildingName("HQ"); // same as initial
    expect(useSpatialStore.getState().events.length).toBe(before);
  });

  it("4a-08: multiple renames are all recorded in event log", () => {
    useSpatialStore.getState().updateBuildingName("Alpha");
    useSpatialStore.getState().updateBuildingName("Beta");
    useSpatialStore.getState().updateBuildingName("Gamma");
    const renames = useSpatialStore.getState().events.filter((e) => e.type === "building.renamed");
    expect(renames).toHaveLength(3);
    expect(renames[2].payload.from_name).toBe("Beta");
    expect(renames[2].payload.to_name).toBe("Gamma");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Floor rename (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Floor rename", () => {
  beforeEach(resetStores);

  it("4a-09: updateFloorName updates building.floors[n].name for floor 0", () => {
    useSpatialStore.getState().updateFloorName(0, "Operations Deck");
    const floor = useSpatialStore.getState().building.floors.find((f) => f.floor === 0);
    expect(floor?.name).toBe("Operations Deck");
  });

  it("4a-10: updateFloorName updates building.floors[n].name for floor 1", () => {
    useSpatialStore.getState().updateFloorName(1, "Executive Suite");
    const floor = useSpatialStore.getState().building.floors.find((f) => f.floor === 1);
    expect(floor?.name).toBe("Executive Suite");
  });

  it("4a-11: updateFloorName emits floor.renamed event with from/to/floor", () => {
    useSpatialStore.getState().updateFloorName(0, "Operations Deck");
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("floor.renamed");
    expect(evt.payload.floor).toBe(0);
    expect(evt.payload.from_name).toBe("Ground Floor");
    expect(evt.payload.to_name).toBe("Operations Deck");
  });

  it("4a-12: updateFloorName is a no-op for non-existent floor", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().updateFloorName(99, "Ghost Floor");
    expect(useSpatialStore.getState().events.length).toBe(before);
  });

  it("4a-13: updateFloorName is a no-op when name is unchanged", () => {
    const before = useSpatialStore.getState().events.length;
    useSpatialStore.getState().updateFloorName(0, "Ground Floor"); // same as initial
    expect(useSpatialStore.getState().events.length).toBe(before);
  });

  it("4a-14: floor 0 rename does not affect floor 1 name", () => {
    useSpatialStore.getState().updateFloorName(0, "New Ground");
    const floor1 = useSpatialStore.getState().building.floors.find((f) => f.floor === 1);
    expect(floor1?.name).toBe("Upper Floor"); // unchanged
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Bulk lifecycle — building scope (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Bulk lifecycle: building scope", () => {
  beforeEach(() => {
    resetStores();
    // Place agents: ops-control (floor 0), archive-vault (floor 1)
    registerAgent("agent-a", "ops-control");
    registerAgent("agent-b", "research-lab");
    registerAgent("agent-c", "archive-vault");
    // Set varied statuses: agent-a → idle, agent-b → active, agent-c → inactive
    setAgentStatus("agent-a", "idle");
    setAgentStatus("agent-b", "active");
    // agent-c stays inactive
  });

  it("4a-15: startAllAgentsInScope(building) starts all inactive/terminated agents", () => {
    useAgentStore.getState().startAllAgentsInScope("building");
    const agents = useAgentStore.getState().agents;
    // agent-a was idle → not started (guard: only inactive/terminated)
    expect(agents["agent-a"]?.status).toBe("idle");
    // agent-b was active → not started
    expect(agents["agent-b"]?.status).toBe("active");
    // agent-c was inactive → started to idle
    expect(agents["agent-c"]?.status).toBe("idle");
  });

  it("4a-16: startAllAgentsInScope(building) emits agents.bulk_started event", () => {
    useAgentStore.getState().startAllAgentsInScope("building");
    const evt = lastAgentEvent();
    expect(evt.type).toBe("agents.bulk_started");
    expect(evt.payload.scope).toBe("building");
    expect(Array.isArray(evt.payload.started_ids)).toBe(true);
    expect((evt.payload.started_ids as string[]).length).toBeGreaterThan(0);
    expect((evt.payload.started_ids as string[])).toContain("agent-c");
  });

  it("4a-17: stopAllAgentsInScope(building) stops all non-terminated agents", () => {
    useAgentStore.getState().stopAllAgentsInScope("building");
    const agents = useAgentStore.getState().agents;
    expect(agents["agent-a"]?.status).toBe("terminated"); // was idle
    expect(agents["agent-b"]?.status).toBe("terminated"); // was active
    expect(agents["agent-c"]?.status).toBe("terminated"); // was inactive
  });

  it("4a-18: stopAllAgentsInScope(building) emits agents.bulk_stopped event", () => {
    useAgentStore.getState().stopAllAgentsInScope("building");
    const evt = lastAgentEvent();
    expect(evt.type).toBe("agents.bulk_stopped");
    expect(evt.payload.scope).toBe("building");
    const stoppedIds = evt.payload.stopped_ids as string[];
    expect(stoppedIds).toContain("agent-a");
    expect(stoppedIds).toContain("agent-b");
    expect(stoppedIds).toContain("agent-c");
  });

  it("4a-19: stopAllAgentsInScope(building) skips already-terminated agents", () => {
    setAgentStatus("agent-a", "terminated");
    const beforeCount = useAgentStore.getState().events.length;
    useAgentStore.getState().stopAllAgentsInScope("building");
    const evt = lastAgentEvent();
    // agent-a (already terminated) should NOT be in stopped_ids
    const stoppedIds = evt.payload.stopped_ids as string[];
    expect(stoppedIds).not.toContain("agent-a");
    expect(stoppedIds).toContain("agent-b");
  });

  it("4a-20: startAllAgentsInScope is a no-op when all agents are already active/idle", () => {
    setAgentStatus("agent-c", "idle"); // make agent-c idle too
    const beforeCount = useAgentStore.getState().events.length;
    useAgentStore.getState().startAllAgentsInScope("building");
    // No eligible agents → no event emitted
    expect(useAgentStore.getState().events.length).toBe(beforeCount);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Bulk lifecycle — floor scope (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Bulk lifecycle: floor scope", () => {
  beforeEach(() => {
    resetStores();
    // Load building into spatial store so _spatialStoreRef can find rooms
    useSpatialStore.getState().loadBuilding(makeBuilding(), "static");

    // Place agents across floors
    registerAgent("agent-floor0-a", "ops-control");      // floor 0
    registerAgent("agent-floor0-b", "research-lab");     // floor 0
    registerAgent("agent-floor1-a", "archive-vault");    // floor 1

    // All start as inactive; set some statuses
    setAgentStatus("agent-floor0-a", "idle");
    // agent-floor0-b remains inactive
    // agent-floor1-a remains inactive
  });

  it("4a-21: startAllAgentsInScope(floor, 0) only starts floor-0 inactive agents", () => {
    useAgentStore.getState().startAllAgentsInScope("floor", 0);
    const agents = useAgentStore.getState().agents;
    // floor 0 inactive agent-floor0-b → started
    expect(agents["agent-floor0-b"]?.status).toBe("idle");
    // floor 0 agent-floor0-a was idle → not started (guard)
    expect(agents["agent-floor0-a"]?.status).toBe("idle");
    // floor 1 agent-floor1-a → NOT started (different floor)
    expect(agents["agent-floor1-a"]?.status).toBe("inactive");
  });

  it("4a-22: startAllAgentsInScope(floor, 0) emits bulk event with floor_index=0", () => {
    useAgentStore.getState().startAllAgentsInScope("floor", 0);
    const evt = lastAgentEvent();
    expect(evt.type).toBe("agents.bulk_started");
    expect(evt.payload.scope).toBe("floor");
    expect(evt.payload.floor_index).toBe(0);
    const startedIds = evt.payload.started_ids as string[];
    expect(startedIds).toContain("agent-floor0-b");
    expect(startedIds).not.toContain("agent-floor1-a");
  });

  it("4a-23: stopAllAgentsInScope(floor, 1) only stops floor-1 agents", () => {
    setAgentStatus("agent-floor1-a", "idle");
    useAgentStore.getState().stopAllAgentsInScope("floor", 1);
    const agents = useAgentStore.getState().agents;
    expect(agents["agent-floor1-a"]?.status).toBe("terminated");
    // floor 0 agents unchanged
    expect(agents["agent-floor0-a"]?.status).toBe("idle");
  });

  it("4a-24: stopAllAgentsInScope(floor, 1) emits bulk event with floor_index=1", () => {
    setAgentStatus("agent-floor1-a", "idle");
    useAgentStore.getState().stopAllAgentsInScope("floor", 1);
    const evt = lastAgentEvent();
    expect(evt.type).toBe("agents.bulk_stopped");
    expect(evt.payload.scope).toBe("floor");
    expect(evt.payload.floor_index).toBe(1);
    const stoppedIds = evt.payload.stopped_ids as string[];
    expect(stoppedIds).toContain("agent-floor1-a");
    expect(stoppedIds).not.toContain("agent-floor0-a");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Spatial store bulk lifecycle audit event (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Spatial store bulk lifecycle audit", () => {
  beforeEach(resetStores);

  it("4a-25: recordOfficeBulkLifecycle(start_all, building) emits office.start_all", () => {
    useSpatialStore.getState().recordOfficeBulkLifecycle("office.start_all", "building");
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("office.start_all");
    expect(evt.payload.scope).toBe("building");
    expect(evt.payload.floor_index).toBeNull();
    expect(evt.payload.triggered_by).toBe("office_layer_control");
  });

  it("4a-26: recordOfficeBulkLifecycle(stop_all, floor, 0) emits office.stop_all with floor_index", () => {
    useSpatialStore.getState().recordOfficeBulkLifecycle("office.stop_all", "floor", 0);
    const evt = lastSpatialEvent();
    expect(evt.type).toBe("office.stop_all");
    expect(evt.payload.scope).toBe("floor");
    expect(evt.payload.floor_index).toBe(0);
  });

  it("4a-27: recordOfficeBulkLifecycle appends to the event log without replacing it", () => {
    useSpatialStore.getState().recordOfficeBulkLifecycle("office.start_all", "building");
    useSpatialStore.getState().recordOfficeBulkLifecycle("office.stop_all", "building");
    const bulkEvts = useSpatialStore.getState().events.filter(
      (e) => e.type === "office.start_all" || e.type === "office.stop_all",
    );
    expect(bulkEvts).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Event log record transparency (Sub-AC 4a)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 4a — Record transparency", () => {
  beforeEach(resetStores);

  it("4a-28: all Sub-AC 4a events have an id, type, ts, and payload", () => {
    useSpatialStore.getState().selectBuilding(true);
    useSpatialStore.getState().updateBuildingName("New HQ");
    useSpatialStore.getState().updateFloorName(0, "Ops");
    useSpatialStore.getState().recordOfficeBulkLifecycle("office.start_all", "building");

    const relevant4aEvents = useSpatialStore.getState().events.filter((e) =>
      ["building.selected", "building.renamed", "floor.renamed", "office.start_all"].includes(e.type),
    );

    expect(relevant4aEvents.length).toBe(4);
    for (const evt of relevant4aEvents) {
      expect(typeof evt.id).toBe("string");
      expect(evt.id.length).toBeGreaterThan(0);
      expect(typeof evt.type).toBe("string");
      expect(typeof evt.ts).toBe("number");
      expect(evt.ts).toBeGreaterThan(0);
      expect(typeof evt.payload).toBe("object");
    }
  });

  it("4a-29: bulk agent events include full audit payload", () => {
    registerAgent("a1", "ops-control");
    // agent-a1 starts inactive
    useAgentStore.getState().startAllAgentsInScope("building");
    const evt = lastAgentEvent();
    expect(evt.payload.started_ids).toBeDefined();
    expect(evt.payload.started_count).toBeDefined();
    expect(evt.payload.triggered_by).toBe("office_layer_control");
    expect(typeof evt.ts).toBe("number");
  });
});
