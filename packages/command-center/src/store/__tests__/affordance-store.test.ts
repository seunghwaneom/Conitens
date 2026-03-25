/**
 * affordance-store.test.ts — Unit tests for Sub-AC 7a.
 *
 * Validates the affordance entity persistence store:
 *   - initAffordances() seeds prototype affordances for all entity types
 *   - parent_entity_id is populated on every registered affordance (Sub-AC 7a)
 *   - All three controllable entity types have at least one control_button
 *   - Entity-type and parent lookups work correctly
 *   - Event sourcing: placed / updated / removed / initialized events emitted
 *   - hasFullEntityTypeCoverage() returns true after init
 *   - computeWorldPosition() applies local_offset correctly
 *
 * All tests run in pure Node.js (no canvas, no DOM, no Three.js context).
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  useAffordanceStore,
  ALL_PROTOTYPE_AFFORDANCES,
  type ControlAffordance,
} from "../affordance-store.js";

// ── Reset store between tests ────────────────────────────────────────────────

beforeEach(() => {
  useAffordanceStore.setState({
    affordances:          {},
    affordanceIds:        [],
    initialized:          false,
    selectedAffordanceId: null,
    events:               [],
    seq:                  0,
    validationErrors:     [],
  });
});

// ── 1. Initial state ─────────────────────────────────────────────────────────

describe("Initial state", () => {
  it("starts with empty affordances registry", () => {
    const state = useAffordanceStore.getState();
    expect(Object.keys(state.affordances)).toHaveLength(0);
    expect(state.affordanceIds).toHaveLength(0);
  });

  it("initialized flag starts false", () => {
    expect(useAffordanceStore.getState().initialized).toBe(false);
  });

  it("event log starts empty", () => {
    expect(useAffordanceStore.getState().events).toHaveLength(0);
  });

  it("seq starts at 0", () => {
    expect(useAffordanceStore.getState().seq).toBe(0);
  });
});

// ── 2. initAffordances — seeds all prototype affordances ─────────────────────

describe("initAffordances()", () => {
  it("registers all prototype affordances (count > 0)", () => {
    useAffordanceStore.getState().initAffordances();
    const state = useAffordanceStore.getState();
    expect(state.affordanceIds.length).toBeGreaterThan(0);
    expect(state.affordanceIds.length).toBe(ALL_PROTOTYPE_AFFORDANCES.length);
  });

  it("sets initialized flag to true", () => {
    useAffordanceStore.getState().initAffordances();
    expect(useAffordanceStore.getState().initialized).toBe(true);
  });

  it("is idempotent — calling twice does not duplicate entries", () => {
    const store = useAffordanceStore.getState();
    store.initAffordances();
    const countAfterFirst = useAffordanceStore.getState().affordanceIds.length;

    useAffordanceStore.getState().initAffordances(); // second call
    const countAfterSecond = useAffordanceStore.getState().affordanceIds.length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("emits affordance.placed for every prototype affordance", () => {
    useAffordanceStore.getState().initAffordances();
    const { events } = useAffordanceStore.getState();
    const placedEvents = events.filter((e) => e.type === "affordance.placed");
    expect(placedEvents.length).toBe(ALL_PROTOTYPE_AFFORDANCES.length);
  });

  it("emits affordance.initialized at the end", () => {
    useAffordanceStore.getState().initAffordances();
    const { events } = useAffordanceStore.getState();
    const initEvent = events.find((e) => e.type === "affordance.initialized");
    expect(initEvent).toBeDefined();
  });

  it("affordance.initialized event carries count breakdowns", () => {
    useAffordanceStore.getState().initAffordances();
    const { events } = useAffordanceStore.getState();
    const initEvent = events.find((e) => e.type === "affordance.initialized");
    expect(initEvent?.meta?.total_count).toBeGreaterThan(0);
    expect(initEvent?.meta?.agent_count).toBeGreaterThan(0);
    expect(initEvent?.meta?.task_count).toBeGreaterThan(0);
    expect(initEvent?.meta?.room_count).toBeGreaterThan(0);
  });
});

// ── 3. parent_entity_id — Sub-AC 7a core requirement ────────────────────────

describe("parent_entity_id validity (Sub-AC 7a)", () => {
  beforeEach(() => {
    useAffordanceStore.getState().initAffordances();
  });

  it("every registered affordance has a non-empty parent_entity_id", () => {
    const { affordances } = useAffordanceStore.getState();
    for (const a of Object.values(affordances)) {
      expect(a.parent_entity_id).toBeTruthy();
      expect(a.parent_entity_id.length).toBeGreaterThan(0);
    }
  });

  it("every placed event carries parent_entity_id", () => {
    const { events } = useAffordanceStore.getState();
    const placedEvents = events.filter((e) => e.type === "affordance.placed");
    for (const e of placedEvents) {
      expect(e.parentEntityId).toBeTruthy();
      expect(e.parentEntityId!.length).toBeGreaterThan(0);
    }
  });

  it("agent_instance affordances have the correct agentId as parent_entity_id", () => {
    const state = useAffordanceStore.getState();
    const agentAffordances = state.getAffordancesByEntityType("agent_instance");
    expect(agentAffordances.length).toBeGreaterThan(0);

    for (const a of agentAffordances) {
      expect(a.parent_entity_id).toBeTruthy();
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("task affordances have the correct taskId as parent_entity_id", () => {
    const state = useAffordanceStore.getState();
    const taskAffordances = state.getAffordancesByEntityType("task");
    expect(taskAffordances.length).toBeGreaterThan(0);

    for (const a of taskAffordances) {
      expect(a.parent_entity_id).toBeTruthy();
      expect(a.parent_entity_type).toBe("task");
    }
  });

  it("room affordances have the correct roomId as parent_entity_id", () => {
    const state = useAffordanceStore.getState();
    const roomAffordances = state.getAffordancesByEntityType("room");
    expect(roomAffordances.length).toBeGreaterThan(0);

    for (const a of roomAffordances) {
      expect(a.parent_entity_id).toBeTruthy();
      expect(a.parent_entity_type).toBe("room");
    }
  });
});

// ── 4. Full entity-type coverage — Sub-AC 7a coverage check ─────────────────

describe("hasFullEntityTypeCoverage() (Sub-AC 7a)", () => {
  it("returns false before init (no affordances registered)", () => {
    expect(useAffordanceStore.getState().hasFullEntityTypeCoverage()).toBe(false);
  });

  it("returns true after init — all three entity types have control_buttons", () => {
    useAffordanceStore.getState().initAffordances();
    expect(useAffordanceStore.getState().hasFullEntityTypeCoverage()).toBe(true);
  });

  it("returns false if only agent affordances are registered", () => {
    useAffordanceStore.getState().registerAgentAffordances("manager-1");
    expect(useAffordanceStore.getState().hasFullEntityTypeCoverage()).toBe(false);
  });

  it("returns false if only agent and task affordances are registered", () => {
    const store = useAffordanceStore.getState();
    store.registerAgentAffordances("manager-1");
    store.registerTaskAffordances("task-seed-0");
    expect(useAffordanceStore.getState().hasFullEntityTypeCoverage()).toBe(false);
  });

  it("returns true once all three entity types are registered", () => {
    const store = useAffordanceStore.getState();
    store.registerAgentAffordances("manager-1");
    store.registerTaskAffordances("task-seed-0");
    store.registerRoomAffordances("ops-control");
    expect(useAffordanceStore.getState().hasFullEntityTypeCoverage()).toBe(true);
  });
});

// ── 5. 3D spatial positioning — local_offset.y > 0 ──────────────────────────

describe("3D spatial positioning (Sub-AC 7a contract)", () => {
  beforeEach(() => {
    useAffordanceStore.getState().initAffordances();
  });

  it("every registered affordance has local_offset.y > 0 (floats above parent)", () => {
    const { affordances } = useAffordanceStore.getState();
    for (const a of Object.values(affordances)) {
      expect(a.local_offset.y).toBeGreaterThan(0);
    }
  });

  it("computeWorldPosition adds local_offset to parent world pos", () => {
    const { affordances, computeWorldPosition } = useAffordanceStore.getState();
    const someAffordance = Object.values(affordances)[0];
    const parentPos = { x: 2, y: 0, z: 3 };
    const worldPos  = computeWorldPosition(someAffordance.affordance_id, parentPos);

    expect(worldPos).not.toBeNull();
    expect(worldPos!.x).toBeCloseTo(parentPos.x + someAffordance.local_offset.x, 5);
    expect(worldPos!.y).toBeCloseTo(parentPos.y + someAffordance.local_offset.y, 5);
    expect(worldPos!.z).toBeCloseTo(parentPos.z + someAffordance.local_offset.z, 5);
  });

  it("computeWorldPosition returns null for unknown affordanceId", () => {
    const { computeWorldPosition } = useAffordanceStore.getState();
    const result = computeWorldPosition("non-existent-id", { x: 0, y: 0, z: 0 });
    expect(result).toBeNull();
  });

  it("affordance world position is above the parent (y > parent.y)", () => {
    const { affordances, computeWorldPosition } = useAffordanceStore.getState();
    const parentPos = { x: 0, y: 0, z: 0 };
    for (const a of Object.values(affordances)) {
      const worldPos = computeWorldPosition(a.affordance_id, parentPos);
      expect(worldPos!.y).toBeGreaterThan(parentPos.y);
    }
  });
});

// ── 6. registerAffordance — runtime registration ─────────────────────────────

describe("registerAffordance()", () => {
  const sampleAffordance: ControlAffordance = {
    affordance_id:       "test-agent-pause-ctrl-btn",
    affordance_kind:     "control_button",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    "test-agent-1",
    local_offset:        { x: 0, y: 0.55, z: 0 },
    action_label:        "PAUSE",
    action_type:         "agent.pause",
    visible_for_statuses: ["active", "busy"],
    ontology_level:      "domain",
  };

  it("registers a single affordance", () => {
    useAffordanceStore.getState().registerAffordance(sampleAffordance);
    const state = useAffordanceStore.getState();
    expect(state.affordances["test-agent-pause-ctrl-btn"]).toBeDefined();
    expect(state.affordanceIds).toContain("test-agent-pause-ctrl-btn");
  });

  it("emits affordance.placed event on first registration", () => {
    useAffordanceStore.getState().registerAffordance(sampleAffordance);
    const { events } = useAffordanceStore.getState();
    const placed = events.find(
      (e) => e.type === "affordance.placed" &&
             e.affordanceId === "test-agent-pause-ctrl-btn",
    );
    expect(placed).toBeDefined();
    expect(placed?.parentEntityId).toBe("test-agent-1");
    expect(placed?.parentEntityType).toBe("agent_instance");
    expect(placed?.affordanceKind).toBe("control_button");
  });

  it("emits affordance.updated on subsequent registration with same id", () => {
    const store = useAffordanceStore.getState();
    store.registerAffordance(sampleAffordance);
    store.registerAffordance({ ...sampleAffordance, action_label: "UPDATED" });

    const { events } = useAffordanceStore.getState();
    const updated = events.find((e) => e.type === "affordance.updated");
    expect(updated).toBeDefined();
  });

  it("does not add duplicate affordanceId on update", () => {
    const store = useAffordanceStore.getState();
    store.registerAffordance(sampleAffordance);
    store.registerAffordance(sampleAffordance);

    const { affordanceIds } = useAffordanceStore.getState();
    const count = affordanceIds.filter(
      (id) => id === "test-agent-pause-ctrl-btn",
    ).length;
    expect(count).toBe(1);
  });
});

// ── 7. Bulk registration convenience methods ─────────────────────────────────

describe("registerAgentAffordances()", () => {
  it("registers at least 3 affordances for an agent", () => {
    useAffordanceStore.getState().registerAgentAffordances("agent-xyz");
    const state = useAffordanceStore.getState();
    const agentAffordances = state.getAffordancesForEntity("agent-xyz", "agent_instance");
    expect(agentAffordances.length).toBeGreaterThanOrEqual(3);
  });

  it("all registered agent affordances have parent_entity_id = agentId", () => {
    useAffordanceStore.getState().registerAgentAffordances("agent-abc");
    const state = useAffordanceStore.getState();
    const agentAffordances = state.getAffordancesForEntity("agent-abc", "agent_instance");
    for (const a of agentAffordances) {
      expect(a.parent_entity_id).toBe("agent-abc");
    }
  });

  it("includes a control_button, handle, and menu_anchor", () => {
    useAffordanceStore.getState().registerAgentAffordances("agent-full");
    const state = useAffordanceStore.getState();
    const agentAffordances = state.getAffordancesForEntity("agent-full", "agent_instance");
    const kinds = new Set(agentAffordances.map((a) => a.affordance_kind));
    expect(kinds.has("control_button")).toBe(true);
    expect(kinds.has("handle")).toBe(true);
    expect(kinds.has("menu_anchor")).toBe(true);
  });
});

describe("registerTaskAffordances()", () => {
  it("registers at least 3 affordances for a task", () => {
    useAffordanceStore.getState().registerTaskAffordances("task-xyz");
    const state = useAffordanceStore.getState();
    const taskAffordances = state.getAffordancesForEntity("task-xyz", "task");
    expect(taskAffordances.length).toBeGreaterThanOrEqual(3);
  });

  it("all registered task affordances have parent_entity_id = taskId", () => {
    useAffordanceStore.getState().registerTaskAffordances("task-abc");
    const state = useAffordanceStore.getState();
    const taskAffordances = state.getAffordancesForEntity("task-abc", "task");
    for (const a of taskAffordances) {
      expect(a.parent_entity_id).toBe("task-abc");
    }
  });
});

describe("registerRoomAffordances()", () => {
  it("registers at least 2 affordances for a room", () => {
    useAffordanceStore.getState().registerRoomAffordances("ops-control");
    const state = useAffordanceStore.getState();
    const roomAffordances = state.getAffordancesForEntity("ops-control", "room");
    expect(roomAffordances.length).toBeGreaterThanOrEqual(2);
  });

  it("all registered room affordances have parent_entity_id = roomId", () => {
    useAffordanceStore.getState().registerRoomAffordances("research-lab");
    const state = useAffordanceStore.getState();
    const roomAffordances = state.getAffordancesForEntity("research-lab", "room");
    for (const a of roomAffordances) {
      expect(a.parent_entity_id).toBe("research-lab");
    }
  });

  it("room affordances include a control_button and menu_anchor", () => {
    useAffordanceStore.getState().registerRoomAffordances("validation-room");
    const state = useAffordanceStore.getState();
    const roomAffordances = state.getAffordancesForEntity("validation-room", "room");
    const kinds = new Set(roomAffordances.map((a) => a.affordance_kind));
    expect(kinds.has("control_button")).toBe(true);
    expect(kinds.has("menu_anchor")).toBe(true);
  });
});

// ── 8. removeAffordance ───────────────────────────────────────────────────────

describe("removeAffordance()", () => {
  it("removes a registered affordance", () => {
    const store = useAffordanceStore.getState();
    store.registerAgentAffordances("remove-test-agent");

    const { affordanceIds: idsBefore } = useAffordanceStore.getState();
    const idToRemove = idsBefore[0];

    useAffordanceStore.getState().removeAffordance(idToRemove);

    const { affordanceIds: idsAfter, affordances } = useAffordanceStore.getState();
    expect(idsAfter).not.toContain(idToRemove);
    expect(affordances[idToRemove]).toBeUndefined();
  });

  it("emits affordance.removed event", () => {
    useAffordanceStore.getState().registerAgentAffordances("remove-agent");
    const firstId = useAffordanceStore.getState().affordanceIds[0];
    useAffordanceStore.getState().removeAffordance(firstId);

    const { events } = useAffordanceStore.getState();
    expect(events.some((e) => e.type === "affordance.removed")).toBe(true);
  });

  it("is a no-op for unknown affordanceId", () => {
    const countBefore = useAffordanceStore.getState().affordanceIds.length;
    useAffordanceStore.getState().removeAffordance("non-existent");
    const countAfter = useAffordanceStore.getState().affordanceIds.length;
    expect(countAfter).toBe(countBefore);
  });
});

// ── 9. selectAffordance ───────────────────────────────────────────────────────

describe("selectAffordance()", () => {
  it("sets selectedAffordanceId", () => {
    useAffordanceStore.getState().registerAgentAffordances("select-agent");
    const firstId = useAffordanceStore.getState().affordanceIds[0];
    useAffordanceStore.getState().selectAffordance(firstId);
    expect(useAffordanceStore.getState().selectedAffordanceId).toBe(firstId);
  });

  it("emits affordance.toggled event", () => {
    useAffordanceStore.getState().registerAgentAffordances("toggle-agent");
    const firstId = useAffordanceStore.getState().affordanceIds[0];
    useAffordanceStore.getState().selectAffordance(firstId);

    const { events } = useAffordanceStore.getState();
    expect(events.some((e) => e.type === "affordance.toggled")).toBe(true);
  });

  it("deselects when called with null", () => {
    useAffordanceStore.getState().registerAgentAffordances("deselect-agent");
    const firstId = useAffordanceStore.getState().affordanceIds[0];
    useAffordanceStore.getState().selectAffordance(firstId);
    useAffordanceStore.getState().selectAffordance(null);
    expect(useAffordanceStore.getState().selectedAffordanceId).toBeNull();
  });
});

// ── 10. Selectors ──────────────────────────────────────────────────────────────

describe("getAffordancesForEntity()", () => {
  it("returns affordances for a specific parent entity", () => {
    useAffordanceStore.getState().registerAgentAffordances("agent-lookup");
    const state = useAffordanceStore.getState();
    const found = state.getAffordancesForEntity("agent-lookup");
    expect(found.length).toBeGreaterThan(0);
    for (const a of found) {
      expect(a.parent_entity_id).toBe("agent-lookup");
    }
  });

  it("filters by parent_entity_type when provided", () => {
    const store = useAffordanceStore.getState();
    // Register agent and room with same parent_entity_id (shouldn't happen in
    // practice, but tests type filter)
    store.registerAgentAffordances("entity-type-filter");

    const agentAffordances = store.getAffordancesForEntity(
      "entity-type-filter",
      "agent_instance",
    );
    for (const a of agentAffordances) {
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("returns empty array for unknown parentEntityId", () => {
    const found = useAffordanceStore
      .getState()
      .getAffordancesForEntity("non-existent-entity");
    expect(found).toHaveLength(0);
  });
});

describe("getAffordancesByEntityType()", () => {
  beforeEach(() => {
    useAffordanceStore.getState().initAffordances();
  });

  it("returns all agent_instance affordances", () => {
    const agentAff = useAffordanceStore
      .getState()
      .getAffordancesByEntityType("agent_instance");
    expect(agentAff.length).toBeGreaterThan(0);
    for (const a of agentAff) {
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("returns all task affordances", () => {
    const taskAff = useAffordanceStore
      .getState()
      .getAffordancesByEntityType("task");
    expect(taskAff.length).toBeGreaterThan(0);
    for (const a of taskAff) {
      expect(a.parent_entity_type).toBe("task");
    }
  });

  it("returns all room affordances", () => {
    const roomAff = useAffordanceStore
      .getState()
      .getAffordancesByEntityType("room");
    expect(roomAff.length).toBeGreaterThan(0);
    for (const a of roomAff) {
      expect(a.parent_entity_type).toBe("room");
    }
  });
});

describe("getAffordancesByKind()", () => {
  beforeEach(() => {
    useAffordanceStore.getState().initAffordances();
  });

  it("returns all control_button affordances", () => {
    const buttons = useAffordanceStore
      .getState()
      .getAffordancesByKind("control_button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const a of buttons) {
      expect(a.affordance_kind).toBe("control_button");
    }
  });

  it("returns all handle affordances", () => {
    const handles = useAffordanceStore.getState().getAffordancesByKind("handle");
    expect(handles.length).toBeGreaterThan(0);
    for (const a of handles) {
      expect(a.affordance_kind).toBe("handle");
    }
  });

  it("returns all menu_anchor affordances", () => {
    const anchors = useAffordanceStore
      .getState()
      .getAffordancesByKind("menu_anchor");
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a.affordance_kind).toBe("menu_anchor");
    }
  });
});

// ── 11. Event sourcing — append-only log ────────────────────────────────────

describe("Event log append-only contract", () => {
  it("event count monotonically increases with each operation", () => {
    const store = useAffordanceStore.getState();
    const c0 = store.events.length;

    store.initAffordances();
    const c1 = useAffordanceStore.getState().events.length;
    expect(c1).toBeGreaterThan(c0);

    useAffordanceStore.getState().registerAgentAffordances("seq-test-agent");
    const c2 = useAffordanceStore.getState().events.length;
    expect(c2).toBeGreaterThan(c1);
  });

  it("seq numbers are strictly monotonically increasing", () => {
    useAffordanceStore.getState().initAffordances();
    const { events } = useAffordanceStore.getState();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
  });

  it("every placed event has a ts timestamp", () => {
    useAffordanceStore.getState().initAffordances();
    const { events } = useAffordanceStore.getState();
    const placedEvents = events.filter((e) => e.type === "affordance.placed");
    for (const e of placedEvents) {
      expect(typeof e.ts).toBe("number");
      expect(e.ts).toBeGreaterThan(0);
    }
  });
});

// ── 12. Sub-AC 7a coverage sweep — structural validation ────────────────────

describe("Sub-AC 7a structural validation sweep", () => {
  beforeEach(() => {
    useAffordanceStore.getState().initAffordances();
  });

  it("for agent_instance: at least one control_button affordance exists", () => {
    const buttons = useAffordanceStore.getState().getAffordancesByKind("control_button");
    const agentButtons = buttons.filter((a) => a.parent_entity_type === "agent_instance");
    expect(agentButtons.length).toBeGreaterThanOrEqual(1);
    expect(agentButtons[0].parent_entity_id).toBeTruthy();
  });

  it("for task: at least one control_button affordance exists", () => {
    const buttons = useAffordanceStore.getState().getAffordancesByKind("control_button");
    const taskButtons = buttons.filter((a) => a.parent_entity_type === "task");
    expect(taskButtons.length).toBeGreaterThanOrEqual(1);
    expect(taskButtons[0].parent_entity_id).toBeTruthy();
  });

  it("for room: at least one control_button affordance exists", () => {
    const buttons = useAffordanceStore.getState().getAffordancesByKind("control_button");
    const roomButtons = buttons.filter((a) => a.parent_entity_type === "room");
    expect(roomButtons.length).toBeGreaterThanOrEqual(1);
    expect(roomButtons[0].parent_entity_id).toBeTruthy();
  });

  it("for agent_instance: at least one handle affordance exists", () => {
    const handles = useAffordanceStore.getState().getAffordancesByKind("handle");
    const agentHandles = handles.filter((a) => a.parent_entity_type === "agent_instance");
    expect(agentHandles.length).toBeGreaterThanOrEqual(1);
    expect(agentHandles[0].parent_entity_id).toBeTruthy();
  });

  it("for agent_instance: at least one menu_anchor affordance exists", () => {
    const anchors = useAffordanceStore.getState().getAffordancesByKind("menu_anchor");
    const agentAnchors = anchors.filter((a) => a.parent_entity_type === "agent_instance");
    expect(agentAnchors.length).toBeGreaterThanOrEqual(1);
    expect(agentAnchors[0].parent_entity_id).toBeTruthy();
  });

  it("for task: at least one menu_anchor affordance exists", () => {
    const anchors = useAffordanceStore.getState().getAffordancesByKind("menu_anchor");
    const taskAnchors = anchors.filter((a) => a.parent_entity_type === "task");
    expect(taskAnchors.length).toBeGreaterThanOrEqual(1);
    expect(taskAnchors[0].parent_entity_id).toBeTruthy();
  });

  it("for room: at least one menu_anchor affordance exists", () => {
    const anchors = useAffordanceStore.getState().getAffordancesByKind("menu_anchor");
    const roomAnchors = anchors.filter((a) => a.parent_entity_type === "room");
    expect(roomAnchors.length).toBeGreaterThanOrEqual(1);
    expect(roomAnchors[0].parent_entity_id).toBeTruthy();
  });

  it("all affordances have ontology_level = domain", () => {
    const { affordances } = useAffordanceStore.getState();
    for (const a of Object.values(affordances)) {
      expect(a.ontology_level).toBe("domain");
    }
  });

  it("all affordance_ids are unique (no collisions across prototypes)", () => {
    const { affordanceIds } = useAffordanceStore.getState();
    const uniqueIds = new Set(affordanceIds);
    expect(uniqueIds.size).toBe(affordanceIds.length);
  });
});
