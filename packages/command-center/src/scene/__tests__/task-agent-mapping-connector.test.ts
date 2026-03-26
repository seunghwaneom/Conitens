/**
 * task-agent-mapping-connector.test.ts — Tests for Sub-AC 5.2
 *
 * Sub-AC 5.2: Connector rendering logic that reads task_agent_mapping entities
 * and draws visible connectors (lines/badges) between mapped tasks and agents
 * in the 3D scene.
 *
 * This test file validates that the connector rendering layer correctly bridges
 * the task_agent_mapping ontology entity layer (task-agent-mapping.ts) to the
 * 3D scene descriptor types (ConnectorLineDescriptor, ConnectorBadgeDescriptor).
 *
 * Coverage matrix
 * ───────────────
 * 5.2-1   buildOrbPositionsFromEntities: single visible entity → orb centred above agent
 * 5.2-2   buildOrbPositionsFromEntities: single entity → orb Y = agentY + ORB_FLOAT_Y
 * 5.2-3   buildOrbPositionsFromEntities: two visible entities same agent → ring spread
 * 5.2-4   buildOrbPositionsFromEntities: two visible entities → each at ORB_SPREAD_RADIUS
 * 5.2-5   buildOrbPositionsFromEntities: isVisibleInScene=false → task excluded from map
 * 5.2-6   buildOrbPositionsFromEntities: missing agentPos → task excluded from map
 * 5.2-7   buildOrbPositionsFromEntities: empty entity list → empty map
 * 5.2-8   buildOrbPositionsFromEntities: mixed visible/invisible → only visible get positions
 * 5.2-9   buildConnectorDescriptorsFromEntities: entity → descriptor key = targetTaskId
 * 5.2-10  buildConnectorDescriptorsFromEntities: to-Y = agentY + AGENT_HEAD_Y_OFFSET
 * 5.2-11  buildConnectorDescriptorsFromEntities: from-XYZ matches orbPos from entity
 * 5.2-12  buildConnectorDescriptorsFromEntities: to-XZ matches agent position
 * 5.2-13  buildConnectorDescriptorsFromEntities: isVisibleInScene=false → excluded
 * 5.2-14  buildConnectorDescriptorsFromEntities: empty entities → empty array
 * 5.2-15  buildConnectorDescriptorsFromEntities: status field passed through from entity
 * 5.2-16  buildConnectorDescriptorsFromEntities: missing orbPos → descriptor excluded
 * 5.2-17  buildBadgeDescriptorsFromEntities: badge.priorityColor = entity.priorityColor
 * 5.2-18  buildBadgeDescriptorsFromEntities: badge.statusBeamColor = entity.statusBeamColor
 * 5.2-19  buildBadgeDescriptorsFromEntities: badge.taskId = entity.targetTaskId
 * 5.2-20  buildBadgeDescriptorsFromEntities: badge.agentId = entity.sourceAgentId
 * 5.2-21  buildBadgeDescriptorsFromEntities: badge.assignedTs = entity.assignedTs
 * 5.2-22  buildBadgeDescriptorsFromEntities: isVisibleInScene=false → excluded
 * 5.2-23  buildBadgeDescriptorsFromEntities: empty entities → empty array
 * 5.2-24  ConnectorBadgeDescriptor interface fields are all present and typed
 * 5.2-25  Full pipeline: entities → orbPositions → connectorDescriptors chain is coherent
 *
 * NOTE: These tests exercise pure functions only (no React, no Three.js, no Zustand).
 * They validate the entity-to-renderer bridge layer without requiring a WebGL context.
 *
 * Test ID scheme:
 *   5.2-N : Sub-AC 5.2 (entity-based connector rendering bridge)
 */

import { describe, it, expect } from "vitest";
import {
  buildOrbPositionsFromEntities,
  buildConnectorDescriptorsFromEntities,
  buildBadgeDescriptorsFromEntities,
  AGENT_HEAD_Y_OFFSET,
  ORB_FLOAT_Y,
  ORB_SPREAD_RADIUS,
  CONNECTOR_BADGE_PRIORITY_LABEL,
  CONNECTOR_BADGE_STATUS_LABEL,
  type ConnectorBadgeDescriptor,
} from "../TaskConnectors.js";
import type { TaskAgentMappingEntity } from "../../data/task-agent-mapping.js";
import type { TaskPriority, TaskStatus } from "../../store/task-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal visible TaskAgentMappingEntity for testing. */
function makeEntity(
  agentId: string,
  taskId: string,
  opts: {
    priority?: TaskPriority;
    status?: TaskStatus;
    isVisibleInScene?: boolean;
    assignedTs?: number;
  } = {},
): TaskAgentMappingEntity {
  const priority: TaskPriority = opts.priority ?? "normal";
  const status: TaskStatus     = opts.status ?? "active";
  const PRIORITY_COLORS: Record<TaskPriority, string> = {
    critical: "#FF3D00",
    high:     "#FF9100",
    normal:   "#40C4FF",
    low:      "#B2DFDB",
  };
  const BEAM_COLORS: Record<TaskStatus, string> = {
    draft:     "#444466",
    planned:   "#555588",
    assigned:  "#40C4FF",
    active:    "#00ff88",
    blocked:   "#FF9100",
    review:    "#aa88ff",
    done:      "#2a5a2a",
    failed:    "#ff4444",
    cancelled: "#333344",
  };
  const VISIBLE: ReadonlySet<TaskStatus> = new Set(["assigned", "active", "blocked", "review"]);

  return {
    mappingId:       `${agentId}:${taskId}`,
    sourceAgentId:   agentId,
    targetTaskId:    taskId,
    priority,
    status,
    assignedTs:      opts.assignedTs ?? 1_700_000_000_000,
    isVisibleInScene: opts.isVisibleInScene ?? VISIBLE.has(status),
    priorityColor:   PRIORITY_COLORS[priority],
    statusBeamColor: BEAM_COLORS[status],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-1 & 5.2-2 · buildOrbPositionsFromEntities — single entity
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-1 & 5.2-2: buildOrbPositionsFromEntities — single entity", () => {
  it("5.2-1: single visible entity → orb XZ centred above agent (no spread)", () => {
    const entity = makeEntity("agA", "t1");
    const agentPositions = { agA: { x: 3.0, y: 0.0, z: 4.5 } };
    const positions = buildOrbPositionsFromEntities([entity], agentPositions);

    expect(positions["t1"]).toBeDefined();
    expect(positions["t1"][0]).toBeCloseTo(3.0, 5);
    expect(positions["t1"][2]).toBeCloseTo(4.5, 5);
  });

  it("5.2-2: single visible entity → orb Y = agentY + ORB_FLOAT_Y", () => {
    const entity = makeEntity("agA", "t1");
    const agentPositions = { agA: { x: 0, y: 1.5, z: 0 } };
    const positions = buildOrbPositionsFromEntities([entity], agentPositions);

    expect(positions["t1"][1]).toBeCloseTo(1.5 + ORB_FLOAT_Y, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-3 & 5.2-4 · buildOrbPositionsFromEntities — two entities same agent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-3 & 5.2-4: buildOrbPositionsFromEntities — ring spread for two entities", () => {
  it("5.2-3: two visible entities on same agent → distinct XZ positions", () => {
    const agentPositions = { agA: { x: 5.0, y: 0.0, z: 2.0 } };
    const entities = [
      makeEntity("agA", "t1"),
      makeEntity("agA", "t2"),
    ];
    const positions = buildOrbPositionsFromEntities(entities, agentPositions);

    const p1 = positions["t1"];
    const p2 = positions["t2"];
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const diffX = Math.abs(p1[0] - p2[0]);
    const diffZ = Math.abs(p1[2] - p2[2]);
    // They must differ in at least one axis
    expect(diffX + diffZ).toBeGreaterThan(0.01);
  });

  it("5.2-4: two visible entities → each at distance ORB_SPREAD_RADIUS from agent XZ", () => {
    const agentPositions = { agA: { x: 0.0, y: 0.0, z: 0.0 } };
    const entities = [
      makeEntity("agA", "t1"),
      makeEntity("agA", "t2"),
    ];
    const positions = buildOrbPositionsFromEntities(entities, agentPositions);

    for (const taskId of ["t1", "t2"]) {
      const [x, , z] = positions[taskId];
      const dist = Math.sqrt(x * x + z * z);
      expect(dist).toBeCloseTo(ORB_SPREAD_RADIUS, 5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-5 · buildOrbPositionsFromEntities — isVisibleInScene=false excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-5: buildOrbPositionsFromEntities — isVisibleInScene=false excluded", () => {
  it("5.2-5: entity with isVisibleInScene=false → no orb position created", () => {
    const entity = makeEntity("agA", "t1", {
      status: "done",
      isVisibleInScene: false,
    });
    const agentPositions = { agA: { x: 1, y: 0, z: 1 } };
    const positions = buildOrbPositionsFromEntities([entity], agentPositions);

    expect(positions["t1"]).toBeUndefined();
    expect(Object.keys(positions)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-6 · buildOrbPositionsFromEntities — missing agentPos excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-6: buildOrbPositionsFromEntities — missing agentPos excluded", () => {
  it("5.2-6: entity whose agentId has no position entry → excluded", () => {
    const entity = makeEntity("agA", "t1");
    // Intentionally empty agentPositions
    const positions = buildOrbPositionsFromEntities([entity], {});

    expect(positions["t1"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-7 · buildOrbPositionsFromEntities — empty input
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-7: buildOrbPositionsFromEntities — empty input", () => {
  it("5.2-7: empty entities array → empty position map", () => {
    const positions = buildOrbPositionsFromEntities([], {});
    expect(Object.keys(positions)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-8 · buildOrbPositionsFromEntities — mixed visible/invisible
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-8: buildOrbPositionsFromEntities — mixed visible/invisible entities", () => {
  it("5.2-8: only visible entities produce orb positions; invisible are excluded", () => {
    const agentPositions = { agA: { x: 2, y: 0, z: 3 } };
    const entities = [
      makeEntity("agA", "visible1", { status: "active" }),
      makeEntity("agA", "invisible1", { status: "done", isVisibleInScene: false }),
      makeEntity("agA", "visible2", { status: "blocked" }),
    ];
    const positions = buildOrbPositionsFromEntities(entities, agentPositions);

    expect(positions["visible1"]).toBeDefined();
    expect(positions["visible2"]).toBeDefined();
    expect(positions["invisible1"]).toBeUndefined();
    expect(Object.keys(positions)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-9 · buildConnectorDescriptorsFromEntities — descriptor key = targetTaskId
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-9: buildConnectorDescriptorsFromEntities — descriptor key = targetTaskId", () => {
  it("5.2-9: descriptor.key matches entity.targetTaskId", () => {
    const entity = makeEntity("agA", "task-xyz");
    const agentPositions = { agA: { x: 1, y: 0, z: 1 } };
    const orbPositions = buildOrbPositionsFromEntities([entity], agentPositions);
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].key).toBe("task-xyz");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-10 · buildConnectorDescriptorsFromEntities — to-Y = agentY + HEAD_OFFSET
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-10: buildConnectorDescriptorsFromEntities — to-Y = agentY + AGENT_HEAD_Y_OFFSET", () => {
  it("5.2-10: descriptor.toY equals agentY + AGENT_HEAD_Y_OFFSET", () => {
    const entity = makeEntity("agA", "t1");
    const agentPos = { x: 2, y: 0.5, z: 3 };
    const agentPositions = { agA: agentPos };
    const orbPositions = buildOrbPositionsFromEntities([entity], agentPositions);
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    expect(descriptors[0].toY).toBeCloseTo(agentPos.y + AGENT_HEAD_Y_OFFSET, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-11 & 5.2-12 · buildConnectorDescriptorsFromEntities — arc endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-11 & 5.2-12: buildConnectorDescriptorsFromEntities — arc endpoints", () => {
  it("5.2-11: descriptor from-XYZ matches pre-computed orb position", () => {
    const entity = makeEntity("agA", "t1");
    const agentPositions = { agA: { x: 4, y: 0, z: 2 } };
    const orbPositions = buildOrbPositionsFromEntities([entity], agentPositions);
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    const orbPos = orbPositions["t1"];
    expect(descriptors[0].fromX).toBeCloseTo(orbPos[0], 5);
    expect(descriptors[0].fromY).toBeCloseTo(orbPos[1], 5);
    expect(descriptors[0].fromZ).toBeCloseTo(orbPos[2], 5);
  });

  it("5.2-12: descriptor to-XZ matches agent world position", () => {
    const entity = makeEntity("agA", "t1");
    const agentPos = { x: 7, y: 0, z: 5 };
    const agentPositions = { agA: agentPos };
    const orbPositions = buildOrbPositionsFromEntities([entity], agentPositions);
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    expect(descriptors[0].toX).toBeCloseTo(agentPos.x, 5);
    expect(descriptors[0].toZ).toBeCloseTo(agentPos.z, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-13 · buildConnectorDescriptorsFromEntities — isVisibleInScene=false excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-13: buildConnectorDescriptorsFromEntities — isVisibleInScene=false excluded", () => {
  it("5.2-13: non-visible entity → no line descriptor produced", () => {
    const entity = makeEntity("agA", "t1", {
      status: "cancelled",
      isVisibleInScene: false,
    });
    const agentPositions = { agA: { x: 1, y: 0, z: 1 } };
    // Manually provide an orb position even though entity is invisible
    const orbPositions = { t1: [1, 1.65, 1] as const };
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    expect(descriptors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-14 · buildConnectorDescriptorsFromEntities — empty entities
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-14: buildConnectorDescriptorsFromEntities — empty entities", () => {
  it("5.2-14: empty entities array → empty descriptor array", () => {
    const descriptors = buildConnectorDescriptorsFromEntities([], {}, {});
    expect(descriptors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-15 · buildConnectorDescriptorsFromEntities — status passed through
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-15: buildConnectorDescriptorsFromEntities — entity status passed through", () => {
  const statuses: TaskStatus[] = ["assigned", "active", "blocked", "review"];

  it.each(statuses)("5.2-15: status=%s → descriptor.status matches entity.status", (status) => {
    const entity = makeEntity("agA", "t1", { status });
    const agentPositions = { agA: { x: 2, y: 0, z: 2 } };
    const orbPositions = buildOrbPositionsFromEntities([entity], agentPositions);
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, orbPositions);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].status).toBe(status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-16 · buildConnectorDescriptorsFromEntities — missing orbPos excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-16: buildConnectorDescriptorsFromEntities — missing orbPos excluded", () => {
  it("5.2-16: entity with no matching orb position → descriptor excluded", () => {
    const entity = makeEntity("agA", "t1");
    const agentPositions = { agA: { x: 1, y: 0, z: 1 } };
    // Intentionally empty orbPositions (no entry for "t1")
    const descriptors = buildConnectorDescriptorsFromEntities([entity], agentPositions, {});

    expect(descriptors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-17 & 5.2-18 · buildBadgeDescriptorsFromEntities — color fields
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-17 & 5.2-18: buildBadgeDescriptorsFromEntities — color fields from entity", () => {
  it("5.2-17: badge.priorityColor equals entity.priorityColor", () => {
    const entity = makeEntity("agA", "t1", { priority: "critical" });
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges).toHaveLength(1);
    expect(badges[0].priorityColor).toBe(entity.priorityColor);
  });

  it("5.2-18: badge.statusBeamColor equals entity.statusBeamColor", () => {
    const entity = makeEntity("agA", "t1", { status: "blocked" });
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges[0].statusBeamColor).toBe(entity.statusBeamColor);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-19 & 5.2-20 · buildBadgeDescriptorsFromEntities — identity fields
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-19 & 5.2-20: buildBadgeDescriptorsFromEntities — identity fields", () => {
  it("5.2-19: badge.taskId matches entity.targetTaskId", () => {
    const entity = makeEntity("agA", "unique-task-id");
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges[0].taskId).toBe("unique-task-id");
  });

  it("5.2-20: badge.agentId matches entity.sourceAgentId", () => {
    const entity = makeEntity("unique-agent-id", "t1");
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges[0].agentId).toBe("unique-agent-id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-21 · buildBadgeDescriptorsFromEntities — assignedTs preserved
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-21: buildBadgeDescriptorsFromEntities — assignedTs preserved", () => {
  it("5.2-21: badge.assignedTs equals entity.assignedTs", () => {
    const ts = 1_720_000_000_000;
    const entity = makeEntity("agA", "t1", { assignedTs: ts });
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges[0].assignedTs).toBe(ts);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-22 · buildBadgeDescriptorsFromEntities — isVisibleInScene=false excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-22: buildBadgeDescriptorsFromEntities — isVisibleInScene=false excluded", () => {
  it("5.2-22: entity with isVisibleInScene=false → no badge produced", () => {
    const entity = makeEntity("agA", "t1", {
      status: "done",
      isVisibleInScene: false,
    });
    const badges = buildBadgeDescriptorsFromEntities([entity]);

    expect(badges).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-23 · buildBadgeDescriptorsFromEntities — empty input
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-23: buildBadgeDescriptorsFromEntities — empty input", () => {
  it("5.2-23: empty entities array → empty badge array", () => {
    const badges = buildBadgeDescriptorsFromEntities([]);
    expect(badges).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-24 · ConnectorBadgeDescriptor interface fields
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-24: ConnectorBadgeDescriptor has all required fields", () => {
  it("5.2-24: a valid ConnectorBadgeDescriptor object has all required fields with correct types", () => {
    const badge: ConnectorBadgeDescriptor = {
      taskId:          "task-001",
      agentId:         "agent-002",
      priorityColor:   "#FF3D00",
      priorityLabel:   "C",
      statusBeamColor: "#00ff88",
      statusLabel:     "ACTV",
      assignedTs:      1_700_000_000_000,
    };

    expect(typeof badge.taskId).toBe("string");
    expect(typeof badge.agentId).toBe("string");
    expect(badge.priorityColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(badge.priorityLabel.length).toBe(1);
    expect(badge.statusBeamColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(badge.statusLabel.length).toBe(4);
    expect(typeof badge.assignedTs).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2-25 · Full pipeline coherence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2-25: Full entity-pipeline coherence", () => {
  it("5.2-25: entities → orbPositions → connectorDescriptors form a coherent chain", () => {
    // Two agents, three visible tasks total; one task is invisible (done)
    const agentPositions = {
      "agA": { x: 2.0, y: 0.0, z: 1.0 },
      "agB": { x: 6.0, y: 0.0, z: 4.0 },
    };

    const entities: TaskAgentMappingEntity[] = [
      makeEntity("agA", "task-1", { status: "active",   priority: "critical" }),
      makeEntity("agA", "task-2", { status: "blocked",  priority: "high" }),
      makeEntity("agB", "task-3", { status: "assigned", priority: "normal" }),
      makeEntity("agB", "task-4", { status: "done",     isVisibleInScene: false }),
    ];

    // Step 1: compute orb positions from entities
    const orbPositions = buildOrbPositionsFromEntities(entities, agentPositions);

    // Only visible entities get orb positions
    expect(orbPositions["task-1"]).toBeDefined();
    expect(orbPositions["task-2"]).toBeDefined();
    expect(orbPositions["task-3"]).toBeDefined();
    expect(orbPositions["task-4"]).toBeUndefined();

    // Step 2: build connector descriptors from entities + orb positions
    const descriptors = buildConnectorDescriptorsFromEntities(entities, agentPositions, orbPositions);

    // Only visible tasks get descriptors
    expect(descriptors).toHaveLength(3);
    const keys = descriptors.map((d) => d.key);
    expect(keys).toContain("task-1");
    expect(keys).toContain("task-2");
    expect(keys).toContain("task-3");
    expect(keys).not.toContain("task-4");

    // Step 3: build badge descriptors from entities
    const badges = buildBadgeDescriptorsFromEntities(entities);

    // Only visible tasks get badges
    expect(badges).toHaveLength(3);
    const badgeTaskIds = badges.map((b) => b.taskId);
    expect(badgeTaskIds).toContain("task-1");
    expect(badgeTaskIds).toContain("task-2");
    expect(badgeTaskIds).toContain("task-3");
    expect(badgeTaskIds).not.toContain("task-4");

    // Verify badge fields come from entity pre-computed fields
    const badge1 = badges.find((b) => b.taskId === "task-1")!;
    expect(badge1.priorityColor).toBe(entities[0].priorityColor);
    expect(badge1.statusBeamColor).toBe(entities[0].statusBeamColor);

    // Verify connector arc endpoints are coherent (from = above agent, to = agent head)
    const desc1 = descriptors.find((d) => d.key === "task-1")!;
    // agA has 2 visible tasks → ring spread → orb NOT centred on agent XZ
    const dx = desc1.fromX - agentPositions.agA.x;
    const dz = desc1.fromZ - agentPositions.agA.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeCloseTo(ORB_SPREAD_RADIUS, 5);
    expect(desc1.toX).toBeCloseTo(agentPositions.agA.x, 5);
    expect(desc1.toZ).toBeCloseTo(agentPositions.agA.z, 5);
    expect(desc1.toY).toBeCloseTo(agentPositions.agA.y + AGENT_HEAD_Y_OFFSET, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Label constants verification
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5.2: CONNECTOR_BADGE label constants", () => {
  it("CONNECTOR_BADGE_PRIORITY_LABEL covers all 4 priorities with single-char values", () => {
    const priorities: TaskPriority[] = ["critical", "high", "normal", "low"];
    for (const p of priorities) {
      expect(CONNECTOR_BADGE_PRIORITY_LABEL[p]).toBeDefined();
      expect(CONNECTOR_BADGE_PRIORITY_LABEL[p].length).toBe(1);
    }
  });

  it("CONNECTOR_BADGE_STATUS_LABEL covers all 9 statuses with 4-char values", () => {
    const statuses: TaskStatus[] = [
      "draft", "planned", "assigned", "active",
      "blocked", "review", "done", "failed", "cancelled",
    ];
    for (const s of statuses) {
      expect(CONNECTOR_BADGE_STATUS_LABEL[s]).toBeDefined();
      expect(CONNECTOR_BADGE_STATUS_LABEL[s].length).toBe(4);
    }
  });

  it("priority labels are visually distinct abbreviations (C/H/N/L)", () => {
    expect(CONNECTOR_BADGE_PRIORITY_LABEL.critical).toBe("C");
    expect(CONNECTOR_BADGE_PRIORITY_LABEL.high).toBe("H");
    expect(CONNECTOR_BADGE_PRIORITY_LABEL.normal).toBe("N");
    expect(CONNECTOR_BADGE_PRIORITY_LABEL.low).toBe("L");
  });

  it("active status badge label is ACTV", () => {
    expect(CONNECTOR_BADGE_STATUS_LABEL.active).toBe("ACTV");
  });

  it("blocked status badge label is BLKD", () => {
    expect(CONNECTOR_BADGE_STATUS_LABEL.blocked).toBe("BLKD");
  });
});
