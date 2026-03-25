/**
 * entity-affordance-defs.test.ts — Unit tests for Sub-AC 7a.
 *
 * Validates the entity affordance definition layer:
 *   - AffordanceKind discriminator system
 *   - ControllableEntityType system
 *   - Per-entity-type builder functions (buildAgentAffordances,
 *     buildTaskAffordances, buildRoomAffordances)
 *   - parent_entity_id validity (Sub-AC 7a core requirement)
 *   - Spatial co-location contract (local_offset.y > 0)
 *   - Validation helpers
 *   - Prototype tables
 *   - computeAffordanceWorldPos geometry
 *
 * All tests run in pure Node.js (no canvas, no DOM, no Three.js context).
 */

import { describe, it, expect } from "vitest";

import {
  // Discriminator constants
  AFFORDANCE_KINDS,
  AFFORDANCE_KIND_SET,
  isAffordanceKind,
  // Entity type constants
  CONTROLLABLE_ENTITY_TYPES,
  CONTROLLABLE_ENTITY_TYPE_SET,
  isControllableEntityType,
  // Spatial constants
  AFFORDANCE_Y_BASE_BY_ENTITY_TYPE,
  AFFORDANCE_BUTTON_SPACING,
  // ID builders
  agentAffordanceId,
  agentMenuAnchorId,
  agentHandleId,
  taskAffordanceId,
  taskMenuAnchorId,
  roomAffordanceId,
  roomMenuAnchorId,
  // Builder functions (core Sub-AC 7a)
  buildAgentAffordances,
  buildTaskAffordances,
  buildRoomAffordances,
  resolveAgentPrimaryAction,
  // World-position geometry
  computeAffordanceWorldPos,
  // Validation
  validateControlAffordance,
  validateAffordanceList,
  // Prototypes
  AGENT_AFFORDANCE_PROTOTYPES,
  TASK_AFFORDANCE_PROTOTYPES,
  ROOM_AFFORDANCE_PROTOTYPES,
  ALL_PROTOTYPE_AFFORDANCES,
  getPrototypeAffordancesFor,
  getAffordancesForEntity,
  // Types
  type ControlAffordance,
  type AffordanceKind,
  type ControllableEntityType,
} from "../entity-affordance-defs.js";

// ── 1. AffordanceKind discriminator ─────────────────────────────────────────

describe("AffordanceKind", () => {
  it("AFFORDANCE_KINDS has exactly 3 kinds", () => {
    expect(AFFORDANCE_KINDS).toHaveLength(3);
  });

  it("contains control_button, handle, menu_anchor", () => {
    expect(AFFORDANCE_KIND_SET.has("control_button")).toBe(true);
    expect(AFFORDANCE_KIND_SET.has("handle")).toBe(true);
    expect(AFFORDANCE_KIND_SET.has("menu_anchor")).toBe(true);
  });

  it("isAffordanceKind returns true for valid kinds", () => {
    expect(isAffordanceKind("control_button")).toBe(true);
    expect(isAffordanceKind("handle")).toBe(true);
    expect(isAffordanceKind("menu_anchor")).toBe(true);
  });

  it("isAffordanceKind returns false for unknown kinds", () => {
    expect(isAffordanceKind("button")).toBe(false);       // old style
    expect(isAffordanceKind("dashboard_panel")).toBe(false);
    expect(isAffordanceKind("")).toBe(false);
    expect(isAffordanceKind("CONTROL_BUTTON")).toBe(false);
  });
});

// ── 2. ControllableEntityType ──────────────────────────────────────────────

describe("ControllableEntityType", () => {
  it("CONTROLLABLE_ENTITY_TYPES has exactly 3 types", () => {
    expect(CONTROLLABLE_ENTITY_TYPES).toHaveLength(3);
  });

  it("contains agent_instance, task, room", () => {
    expect(CONTROLLABLE_ENTITY_TYPE_SET.has("agent_instance")).toBe(true);
    expect(CONTROLLABLE_ENTITY_TYPE_SET.has("task")).toBe(true);
    expect(CONTROLLABLE_ENTITY_TYPE_SET.has("room")).toBe(true);
  });

  it("isControllableEntityType returns true for valid types", () => {
    expect(isControllableEntityType("agent_instance")).toBe(true);
    expect(isControllableEntityType("task")).toBe(true);
    expect(isControllableEntityType("room")).toBe(true);
  });

  it("isControllableEntityType returns false for unknown types", () => {
    expect(isControllableEntityType("agent")).toBe(false); // 'agent' not 'agent_instance'
    expect(isControllableEntityType("building")).toBe(false);
    expect(isControllableEntityType("")).toBe(false);
  });
});

// ── 3. Spatial baseline Y constants ────────────────────────────────────────

describe("AFFORDANCE_Y_BASE_BY_ENTITY_TYPE", () => {
  it("agent_instance baseline is 0.55", () => {
    expect(AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance).toBe(0.55);
  });

  it("task baseline is greater than agent_instance baseline", () => {
    expect(AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task).toBeGreaterThan(
      AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance,
    );
  });

  it("room baseline is greatest (rooms span full height)", () => {
    expect(AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.room).toBeGreaterThan(
      AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task,
    );
  });

  it("all baselines are positive (above parent entity origin)", () => {
    for (const y of Object.values(AFFORDANCE_Y_BASE_BY_ENTITY_TYPE)) {
      expect(y).toBeGreaterThan(0);
    }
  });
});

// ── 4. ID builder functions ────────────────────────────────────────────────

describe("agentAffordanceId", () => {
  it("follows agent-{agentId}-{action}-ctrl-btn convention", () => {
    expect(agentAffordanceId("manager-1", "pause")).toBe("agent-manager-1-pause-ctrl-btn");
  });

  it("includes the agentId correctly", () => {
    const id = agentAffordanceId("researcher-42", "start");
    expect(id).toContain("researcher-42");
    expect(id).toContain("start");
  });
});

describe("agentMenuAnchorId", () => {
  it("follows agent-{agentId}-menu-anchor convention", () => {
    expect(agentMenuAnchorId("manager-1")).toBe("agent-manager-1-menu-anchor");
  });
});

describe("agentHandleId", () => {
  it("follows agent-{agentId}-move-handle convention", () => {
    expect(agentHandleId("manager-1")).toBe("agent-manager-1-move-handle");
  });
});

describe("taskAffordanceId", () => {
  it("follows task-{taskId}-{action}-ctrl-btn convention", () => {
    expect(taskAffordanceId("task-42", "cancel")).toBe("task-task-42-cancel-ctrl-btn");
  });
});

describe("taskMenuAnchorId", () => {
  it("follows task-{taskId}-menu-anchor convention", () => {
    expect(taskMenuAnchorId("task-42")).toBe("task-task-42-menu-anchor");
  });
});

describe("roomAffordanceId", () => {
  it("follows room-{roomId}-{action}-ctrl-btn convention", () => {
    expect(roomAffordanceId("ops-control", "configure")).toBe(
      "room-ops-control-configure-ctrl-btn",
    );
  });
});

describe("roomMenuAnchorId", () => {
  it("follows room-{roomId}-menu-anchor convention", () => {
    expect(roomMenuAnchorId("ops-control")).toBe("room-ops-control-menu-anchor");
  });
});

// ── 5. buildAgentAffordances — Sub-AC 7a core ─────────────────────────────

describe("buildAgentAffordances", () => {
  const agentId = "manager-1";
  const affordances = buildAgentAffordances(agentId, "idle");

  it("returns at least one affordance", () => {
    expect(affordances.length).toBeGreaterThanOrEqual(1);
  });

  it("all affordances have parent_entity_id = agentId (Sub-AC 7a)", () => {
    for (const a of affordances) {
      expect(a.parent_entity_id).toBe(agentId);
    }
  });

  it("all affordances have parent_entity_type = agent_instance", () => {
    for (const a of affordances) {
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("includes at least one control_button", () => {
    const hasButton = affordances.some((a) => a.affordance_kind === "control_button");
    expect(hasButton).toBe(true);
  });

  it("includes a handle for drag-to-reassign", () => {
    const hasHandle = affordances.some((a) => a.affordance_kind === "handle");
    expect(hasHandle).toBe(true);
  });

  it("includes a menu_anchor", () => {
    const hasAnchor = affordances.some((a) => a.affordance_kind === "menu_anchor");
    expect(hasAnchor).toBe(true);
  });

  it("all local_offset.y values are positive (spatially co-located above parent)", () => {
    for (const a of affordances) {
      expect(a.local_offset.y).toBeGreaterThan(0);
    }
  });

  it("all affordance_ids are unique", () => {
    const ids = affordances.map((a) => a.affordance_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all affordances have domain ontology_level", () => {
    for (const a of affordances) {
      expect(a.ontology_level).toBe("domain");
    }
  });

  it("inactive agent gets START as primary action", () => {
    const inactive = buildAgentAffordances("x", "inactive");
    const btn = inactive.find((a) => a.affordance_kind === "control_button");
    expect(btn?.action_type).toBe("agent.start");
    expect(btn?.action_label).toBe("START");
  });

  it("idle agent gets STOP as primary action", () => {
    const idle = buildAgentAffordances("x", "idle");
    const btn = idle.find((a) => a.affordance_kind === "control_button");
    expect(btn?.action_type).toBe("agent.stop");
    expect(btn?.action_label).toBe("STOP");
  });

  it("active agent gets PAUSE as primary action", () => {
    const active = buildAgentAffordances("x", "active");
    const btn = active.find((a) => a.affordance_kind === "control_button");
    expect(btn?.action_type).toBe("agent.pause");
  });

  it("error agent gets RESTART as primary action", () => {
    const err = buildAgentAffordances("x", "error");
    const btn = err.find((a) => a.affordance_kind === "control_button");
    expect(btn?.action_type).toBe("agent.restart");
  });

  it("sibling buttons are horizontally separated by AFFORDANCE_BUTTON_SPACING", () => {
    const xs = affordances.map((a) => a.local_offset.x);
    // Sort and check adjacent gaps
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeCloseTo(AFFORDANCE_BUTTON_SPACING);
    }
  });
});

// ── 6. buildTaskAffordances — Sub-AC 7a core ──────────────────────────────

describe("buildTaskAffordances", () => {
  const taskId = "task-42";
  const affordances = buildTaskAffordances(taskId, "in_progress");

  it("returns at least one affordance", () => {
    expect(affordances.length).toBeGreaterThanOrEqual(1);
  });

  it("all affordances have parent_entity_id = taskId (Sub-AC 7a)", () => {
    for (const a of affordances) {
      expect(a.parent_entity_id).toBe(taskId);
    }
  });

  it("all affordances have parent_entity_type = task", () => {
    for (const a of affordances) {
      expect(a.parent_entity_type).toBe("task");
    }
  });

  it("includes a cancel control_button", () => {
    const cancel = affordances.find(
      (a) => a.affordance_kind === "control_button" && a.action_type === "task.cancel",
    );
    expect(cancel).toBeDefined();
    expect(cancel!.parent_entity_id).toBe(taskId);
  });

  it("includes a menu_anchor", () => {
    const anchor = affordances.find((a) => a.affordance_kind === "menu_anchor");
    expect(anchor).toBeDefined();
    expect(anchor!.parent_entity_id).toBe(taskId);
  });

  it("all local_offset.y values are positive (spatially above task orb)", () => {
    for (const a of affordances) {
      expect(a.local_offset.y).toBeGreaterThan(0);
    }
  });

  it("task y baseline is higher than agent baseline", () => {
    const taskY = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task;
    const agentY = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance;
    expect(taskY).toBeGreaterThan(agentY);
    // Verify it's used
    for (const a of affordances) {
      expect(a.local_offset.y).toBeGreaterThanOrEqual(taskY);
    }
  });

  it("all affordances have unique affordance_ids", () => {
    const ids = affordances.map((a) => a.affordance_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all affordances have domain ontology_level", () => {
    for (const a of affordances) {
      expect(a.ontology_level).toBe("domain");
    }
  });

  it("terminal task includes non-empty cancel-only affordance set", () => {
    const done = buildTaskAffordances("task-99", "done");
    // At least one affordance must exist even for terminal tasks (menu anchor)
    expect(done.length).toBeGreaterThanOrEqual(1);
    // cancel button for done task has restricted visible_for_statuses
    const cancel = done.find((a) => a.action_type === "task.cancel");
    expect(cancel?.visible_for_statuses).not.toBeNull();
  });
});

// ── 7. buildRoomAffordances — Sub-AC 7a core ──────────────────────────────

describe("buildRoomAffordances", () => {
  const roomId = "ops-control";
  const affordances = buildRoomAffordances(roomId);

  it("returns at least one affordance", () => {
    expect(affordances.length).toBeGreaterThanOrEqual(1);
  });

  it("all affordances have parent_entity_id = roomId (Sub-AC 7a)", () => {
    for (const a of affordances) {
      expect(a.parent_entity_id).toBe(roomId);
    }
  });

  it("all affordances have parent_entity_type = room", () => {
    for (const a of affordances) {
      expect(a.parent_entity_type).toBe("room");
    }
  });

  it("includes a configure control_button", () => {
    const configure = affordances.find(
      (a) => a.affordance_kind === "control_button" && a.action_type === "room.configure",
    );
    expect(configure).toBeDefined();
    expect(configure!.parent_entity_id).toBe(roomId);
  });

  it("includes a menu_anchor", () => {
    const anchor = affordances.find((a) => a.affordance_kind === "menu_anchor");
    expect(anchor).toBeDefined();
    expect(anchor!.parent_entity_id).toBe(roomId);
  });

  it("all local_offset.y values are positive (spatially above room floor)", () => {
    for (const a of affordances) {
      expect(a.local_offset.y).toBeGreaterThan(0);
    }
  });

  it("room y baseline is highest of all entity types", () => {
    const roomY  = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.room;
    const taskY  = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task;
    const agentY = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance;
    expect(roomY).toBeGreaterThan(taskY);
    expect(roomY).toBeGreaterThan(agentY);
  });

  it("all affordances have unique affordance_ids", () => {
    const ids = affordances.map((a) => a.affordance_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all affordances have domain ontology_level", () => {
    for (const a of affordances) {
      expect(a.ontology_level).toBe("domain");
    }
  });

  it("different rooms produce different affordance_ids", () => {
    const room1 = buildRoomAffordances("ops-control");
    const room2 = buildRoomAffordances("research-lab");
    const ids1 = new Set(room1.map((a) => a.affordance_id));
    const ids2 = new Set(room2.map((a) => a.affordance_id));
    // No overlap
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }
  });
});

// ── 8. resolveAgentPrimaryAction ──────────────────────────────────────────

describe("resolveAgentPrimaryAction", () => {
  it("inactive → start", () => {
    const { actionType, actionLabel } = resolveAgentPrimaryAction("inactive");
    expect(actionType).toBe("start");
    expect(actionLabel).toBe("START");
  });

  it("terminated → start", () => {
    const { actionType } = resolveAgentPrimaryAction("terminated");
    expect(actionType).toBe("start");
  });

  it("idle → stop", () => {
    const { actionType, actionLabel } = resolveAgentPrimaryAction("idle");
    expect(actionType).toBe("stop");
    expect(actionLabel).toBe("STOP");
  });

  it("active → pause", () => {
    const { actionType } = resolveAgentPrimaryAction("active");
    expect(actionType).toBe("pause");
  });

  it("busy → pause", () => {
    const { actionType } = resolveAgentPrimaryAction("busy");
    expect(actionType).toBe("pause");
  });

  it("error → restart", () => {
    const { actionType, actionLabel } = resolveAgentPrimaryAction("error");
    expect(actionType).toBe("restart");
    expect(actionLabel).toBe("RESTART");
  });

  it("unknown status falls back to start", () => {
    const { actionType } = resolveAgentPrimaryAction("unknown-status");
    expect(actionType).toBe("start");
  });
});

// ── 9. computeAffordanceWorldPos — spatial co-location geometry ───────────

describe("computeAffordanceWorldPos", () => {
  it("adds local_offset to parent world position", () => {
    const parent = { x: 1, y: 0, z: 2 };
    const affordance: Pick<ControlAffordance, "local_offset"> = {
      local_offset: { x: 0.25, y: 0.55, z: 0 },
    };
    const result = computeAffordanceWorldPos(parent, affordance);
    expect(result.x).toBeCloseTo(1.25);
    expect(result.y).toBeCloseTo(0.55);
    expect(result.z).toBeCloseTo(2.0);
  });

  it("handles zero offset (co-located at parent origin)", () => {
    const parent = { x: 5, y: 3, z: 1 };
    const affordance = { local_offset: { x: 0, y: 0.55, z: 0 } };
    const result = computeAffordanceWorldPos(parent, affordance);
    expect(result.x).toBe(5);
    expect(result.z).toBe(1);
    expect(result.y).toBeCloseTo(3.55);
  });

  it("handles negative parent positions", () => {
    const parent = { x: -2, y: 0, z: -3 };
    const affordance = { local_offset: { x: 0.5, y: 1.0, z: 0.5 } };
    const result = computeAffordanceWorldPos(parent, affordance);
    expect(result.x).toBeCloseTo(-1.5);
    expect(result.y).toBeCloseTo(1.0);
    expect(result.z).toBeCloseTo(-2.5);
  });

  it("affordance world pos y is always above parent origin", () => {
    const parent = { x: 0, y: 0, z: 0 };
    const agentAffs = buildAgentAffordances("test-agent");
    for (const a of agentAffs) {
      const worldPos = computeAffordanceWorldPos(parent, a);
      expect(worldPos.y).toBeGreaterThan(parent.y);
    }
  });
});

// ── 10. validateControlAffordance ─────────────────────────────────────────

describe("validateControlAffordance", () => {
  const validAffordance: ControlAffordance = {
    affordance_id:       "agent-mgr-pause-ctrl-btn",
    affordance_kind:     "control_button",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    "manager-1",
    local_offset:        { x: 0, y: 0.55, z: 0 },
    action_label:        "PAUSE",
    action_type:         "agent.pause",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  it("accepts a valid affordance with no errors", () => {
    expect(validateControlAffordance(validAffordance)).toHaveLength(0);
  });

  it("rejects missing affordance_id", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      affordance_id: "",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects unknown affordance_kind", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      affordance_kind: "slider" as AffordanceKind,
    });
    expect(errors.some((e) => e.includes("unknown affordance_kind"))).toBe(true);
  });

  it("rejects unknown parent_entity_type", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      parent_entity_type: "building" as ControllableEntityType,
    });
    expect(errors.some((e) => e.includes("unknown parent_entity_type"))).toBe(true);
  });

  it("rejects empty parent_entity_id (Sub-AC 7a: must point to owning entity)", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      parent_entity_id: "",
    });
    expect(errors.some((e) => e.includes("parent_entity_id"))).toBe(true);
  });

  it("rejects local_offset.y = 0 (must float above parent)", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      local_offset: { x: 0, y: 0, z: 0 },
    });
    expect(errors.some((e) => e.includes("local_offset.y"))).toBe(true);
  });

  it("rejects negative local_offset.y (must not sink below parent)", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      local_offset: { x: 0, y: -0.1, z: 0 },
    });
    expect(errors.some((e) => e.includes("local_offset.y"))).toBe(true);
  });

  it("rejects missing action_type", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      action_type: "",
    });
    expect(errors.some((e) => e.includes("action_type"))).toBe(true);
  });

  it("rejects wrong ontology_level", () => {
    const errors = validateControlAffordance({
      ...validAffordance,
      ontology_level: "meta" as "domain",
    });
    expect(errors.some((e) => e.includes("ontology_level"))).toBe(true);
  });
});

// ── 11. validateAffordanceList ────────────────────────────────────────────

describe("validateAffordanceList", () => {
  it("accepts a valid agent affordance list", () => {
    const aff = buildAgentAffordances("manager-1", "idle");
    const errors = validateAffordanceList(aff, "manager-1");
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid task affordance list", () => {
    const aff = buildTaskAffordances("task-42", "pending");
    const errors = validateAffordanceList(aff, "task-42");
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid room affordance list", () => {
    const aff = buildRoomAffordances("ops-control");
    const errors = validateAffordanceList(aff, "ops-control");
    expect(errors).toHaveLength(0);
  });

  it("rejects a list with mismatched parent_entity_id", () => {
    const aff = buildAgentAffordances("manager-1");
    // Corrupt one affordance's parent reference
    const corrupted = aff.map((a, i) =>
      i === 0 ? { ...a, parent_entity_id: "WRONG-ID" } : a,
    );
    const errors = validateAffordanceList(corrupted, "manager-1");
    expect(errors.some((e) => e.includes("parent_entity_id mismatch"))).toBe(true);
  });

  it("rejects a list with duplicate affordance_ids", () => {
    const aff = buildAgentAffordances("manager-1");
    // Duplicate the first affordance
    const duplicated = [...aff, aff[0]];
    const errors = validateAffordanceList(duplicated, "manager-1");
    expect(errors.some((e) => e.includes("Duplicate affordance_id"))).toBe(true);
  });

  it("rejects a list with no control_button", () => {
    const noButton: ControlAffordance[] = [
      {
        affordance_id:      "test-handle",
        affordance_kind:    "handle",
        parent_entity_type: "agent_instance",
        parent_entity_id:   "manager-1",
        local_offset:       { x: 0, y: 0.55, z: 0 },
        action_label:       "MOVE",
        action_type:        "agent.reassign",
        visible_for_statuses: null,
        ontology_level:     "domain",
      },
    ];
    const errors = validateAffordanceList(noButton, "manager-1");
    expect(errors.some((e) => e.includes("no control_button"))).toBe(true);
  });

  it("rejects a list with no handle or menu_anchor", () => {
    const buttonOnly: ControlAffordance[] = [
      {
        affordance_id:      "test-button",
        affordance_kind:    "control_button",
        parent_entity_type: "agent_instance",
        parent_entity_id:   "manager-1",
        local_offset:       { x: 0, y: 0.55, z: 0 },
        action_label:       "START",
        action_type:        "agent.start",
        visible_for_statuses: null,
        ontology_level:     "domain",
      },
    ];
    const errors = validateAffordanceList(buttonOnly, "manager-1");
    expect(errors.some((e) => e.includes("no handle or menu_anchor"))).toBe(true);
  });
});

// ── 12. Prototype tables ─────────────────────────────────────────────────

describe("AGENT_AFFORDANCE_PROTOTYPES", () => {
  it("contains affordances for known agent IDs", () => {
    const agentIds = new Set(
      AGENT_AFFORDANCE_PROTOTYPES.map((a) => a.parent_entity_id),
    );
    expect(agentIds.has("manager-1")).toBe(true);
    expect(agentIds.has("implementer-1")).toBe(true);
    expect(agentIds.has("researcher-1")).toBe(true);
    expect(agentIds.has("validator-1")).toBe(true);
    expect(agentIds.has("frontend-reviewer-1")).toBe(true);
  });

  it("all affordances have parent_entity_type = agent_instance", () => {
    for (const a of AGENT_AFFORDANCE_PROTOTYPES) {
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("no duplicate affordance_ids across all agents", () => {
    const ids = AGENT_AFFORDANCE_PROTOTYPES.map((a) => a.affordance_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("TASK_AFFORDANCE_PROTOTYPES", () => {
  it("contains affordances for seed task IDs", () => {
    const taskIds = new Set(
      TASK_AFFORDANCE_PROTOTYPES.map((a) => a.parent_entity_id),
    );
    expect(taskIds.has("task-seed-0")).toBe(true);
    expect(taskIds.has("task-seed-1")).toBe(true);
    expect(taskIds.has("task-seed-2")).toBe(true);
  });

  it("all affordances have parent_entity_type = task", () => {
    for (const a of TASK_AFFORDANCE_PROTOTYPES) {
      expect(a.parent_entity_type).toBe("task");
    }
  });
});

describe("ROOM_AFFORDANCE_PROTOTYPES", () => {
  it("contains affordances for known room IDs", () => {
    const roomIds = new Set(
      ROOM_AFFORDANCE_PROTOTYPES.map((a) => a.parent_entity_id),
    );
    expect(roomIds.has("ops-control")).toBe(true);
    expect(roomIds.has("impl-office")).toBe(true);
    expect(roomIds.has("research-lab")).toBe(true);
  });

  it("all affordances have parent_entity_type = room", () => {
    for (const a of ROOM_AFFORDANCE_PROTOTYPES) {
      expect(a.parent_entity_type).toBe("room");
    }
  });
});

// ── 13. ALL_PROTOTYPE_AFFORDANCES aggregate ─────────────────────────────

describe("ALL_PROTOTYPE_AFFORDANCES", () => {
  it("contains affordances from all three entity types", () => {
    const types = new Set(ALL_PROTOTYPE_AFFORDANCES.map((a) => a.parent_entity_type));
    expect(types.has("agent_instance")).toBe(true);
    expect(types.has("task")).toBe(true);
    expect(types.has("room")).toBe(true);
  });

  it("no duplicate affordance_ids across all entity types", () => {
    const ids = ALL_PROTOTYPE_AFFORDANCES.map((a) => a.affordance_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all affordances pass individual validation", () => {
    for (const a of ALL_PROTOTYPE_AFFORDANCES) {
      const errors = validateControlAffordance(a);
      if (errors.length > 0) {
        // Fail with informative message
        expect(errors).toHaveLength(0);
      }
    }
  });

  it("each controllable entity type has at least 3 prototype affordances", () => {
    for (const entityType of CONTROLLABLE_ENTITY_TYPES) {
      const count = ALL_PROTOTYPE_AFFORDANCES.filter(
        (a) => a.parent_entity_type === entityType,
      ).length;
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── 14. getPrototypeAffordancesFor ──────────────────────────────────────

describe("getPrototypeAffordancesFor", () => {
  it("returns only agent_instance affordances for agent_instance type", () => {
    const result = getPrototypeAffordancesFor("agent_instance");
    expect(result.length).toBeGreaterThan(0);
    for (const a of result) {
      expect(a.parent_entity_type).toBe("agent_instance");
    }
  });

  it("returns only task affordances for task type", () => {
    const result = getPrototypeAffordancesFor("task");
    for (const a of result) {
      expect(a.parent_entity_type).toBe("task");
    }
  });

  it("returns only room affordances for room type", () => {
    const result = getPrototypeAffordancesFor("room");
    for (const a of result) {
      expect(a.parent_entity_type).toBe("room");
    }
  });
});

// ── 15. getAffordancesForEntity ──────────────────────────────────────────

describe("getAffordancesForEntity", () => {
  it("returns affordances for manager-1", () => {
    const result = getAffordancesForEntity("manager-1");
    expect(result.length).toBeGreaterThan(0);
    for (const a of result) {
      expect(a.parent_entity_id).toBe("manager-1");
    }
  });

  it("returns affordances for ops-control room", () => {
    const result = getAffordancesForEntity("ops-control");
    expect(result.length).toBeGreaterThan(0);
    for (const a of result) {
      expect(a.parent_entity_id).toBe("ops-control");
    }
  });

  it("returns empty array for unknown entity ID", () => {
    const result = getAffordancesForEntity("non-existent-entity-xyz");
    expect(result).toHaveLength(0);
  });
});

// ── 16. Sub-AC 7a contract: each controllable entity type has affordances ─

describe("Sub-AC 7a contract: per-entity-type affordance coverage", () => {
  const testEntityTypes: Array<{ entityType: ControllableEntityType; entityId: string }> = [
    { entityType: "agent_instance", entityId: "manager-1" },
    { entityType: "task",           entityId: "task-seed-0" },
    { entityType: "room",           entityId: "ops-control" },
  ];

  for (const { entityType, entityId } of testEntityTypes) {
    it(`${entityType} "${entityId}" has at least one control_button affordance`, () => {
      const affordances = getAffordancesForEntity(entityId).filter(
        (a) => a.parent_entity_type === entityType,
      );
      const hasButton = affordances.some((a) => a.affordance_kind === "control_button");
      expect(hasButton).toBe(true);
    });

    it(`${entityType} "${entityId}" has at least one handle or menu_anchor affordance`, () => {
      const affordances = getAffordancesForEntity(entityId).filter(
        (a) => a.parent_entity_type === entityType,
      );
      const hasHandleOrAnchor = affordances.some(
        (a) => a.affordance_kind === "handle" || a.affordance_kind === "menu_anchor",
      );
      expect(hasHandleOrAnchor).toBe(true);
    });

    it(`${entityType} "${entityId}" all affordances have valid parent_entity_id`, () => {
      const affordances = getAffordancesForEntity(entityId).filter(
        (a) => a.parent_entity_type === entityType,
      );
      for (const a of affordances) {
        expect(a.parent_entity_id).toBe(entityId);
        expect(a.parent_entity_id).not.toBe("");
      }
    });

    it(`${entityType} "${entityId}" all affordances are spatially co-located (y > 0)`, () => {
      const affordances = getAffordancesForEntity(entityId).filter(
        (a) => a.parent_entity_type === entityType,
      );
      for (const a of affordances) {
        expect(a.local_offset.y).toBeGreaterThan(0);
      }
    });
  }
});

// ── 17. Cross-entity spatial isolation ───────────────────────────────────

describe("Cross-entity spatial isolation", () => {
  it("agent affordance y < room affordance y (agents don't occlude room controls)", () => {
    const agentAffs = buildAgentAffordances("manager-1");
    const roomAffs  = buildRoomAffordances("ops-control");

    const maxAgentY = Math.max(...agentAffs.map((a) => a.local_offset.y));
    const minRoomY  = Math.min(...roomAffs.map((a) => a.local_offset.y));

    expect(maxAgentY).toBeLessThanOrEqual(minRoomY);
  });

  it("task affordance y baseline is between agent and room baselines", () => {
    const agentY = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance;
    const taskY  = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task;
    const roomY  = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.room;
    expect(taskY).toBeGreaterThan(agentY);
    expect(taskY).toBeLessThan(roomY);
  });
});
