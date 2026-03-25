/**
 * task-connector-scene-position.test.ts — Tests for Sub-AC 5a.
 *
 * Sub-AC 5a: Connector rendering logic that draws visible lines/badges between
 * tasks and agents in the 3D scene, with connectors added to the scene graph
 * immediately after agent meshes are rendered.
 *
 * Coverage matrix
 * ───────────────
 * 5a-1  TaskConnectorsLayer exports are present (layer can be mounted)
 * 5a-2  RENDER_ORDER_BEAM < RENDER_ORDER_ORB < RENDER_ORDER_SCAN (stacking order)
 * 5a-3  renderOrder values all exceed 0 (drawn after default scene geometry)
 * 5a-4  VISIBLE_STATUSES filter: exactly assigned/active/blocked/review produce connectors
 * 5a-5  ORB_FLOAT_Y positions orb well above agent head (above AGENT_HEAD_Y_OFFSET)
 * 5a-6  computeOrbPositions: single task centred above agent (no spread)
 * 5a-7  computeOrbPositions: two tasks produce ring-spread positions (distinct XZ)
 * 5a-8  computeOrbPositions: N tasks for same agent produce N distinct XZ positions
 * 5a-9  computeLightBudget: returns empty set for empty connections
 * 5a-10 computeLightBudget: allocates lights up to MAX_POINT_LIGHTS
 * 5a-11 computeLightBudget: critical tasks receive lights before low-priority tasks
 * 5a-12 ARC_LIFT positive: bezier control point lifted above both endpoints
 * 5a-13 PRIORITY_COLOR map: all 4 priorities have valid hex values
 * 5a-14 STATUS_BEAM_COLOR map: all 9 statuses have valid hex values
 * 5a-15 ORB_SIZE in valid geometric range (>0, <1)
 * 5a-16 ORB_SPREAD_RADIUS in valid range (>0, <=1)
 * 5a-17 Badge layer exports: TaskMappingHUD component can be imported
 * 5a-18 BatchedConnectorLines: ConnectorLineDescriptor shape is well-defined
 * 5a-19 Scene graph position: TaskConnectorsLayer rendered before room/editor layers
 * 5a-20 computeOrbPositions: agents with 0 visible tasks produce no entries
 *
 * NOTE: Components that use useFrame/useThree/Canvas (TaskConnectorsLayer,
 *       TaskNodeOrb, TaskConnectorBeam) require a WebGL context and cannot
 *       run headlessly in Vitest. These tests validate the pure data/constant
 *       layer and pure functions exported from TaskConnectors.tsx that drive
 *       the rendering layer.
 *
 * Test ID scheme:
 *   5a-N : Sub-AC 5a (connector scene position + basic connector contract)
 */

import { describe, it, expect } from "vitest";
import {
  // Constants
  AGENT_HEAD_Y_OFFSET,
  ORB_FLOAT_Y,
  ORB_SPREAD_RADIUS,
  ORB_SIZE,
  ARC_LIFT,
  RENDER_ORDER_SCAN,
  RENDER_ORDER_ORB,
  RENDER_ORDER_BEAM,
  MAX_POINT_LIGHTS,
  PRIORITY_RANK,
  PRIORITY_COLOR,
  STATUS_BEAM_COLOR,
  VISIBLE_STATUSES,
  // Pure functions
  computeOrbPositions,
  computeLightBudget,
  type OrbConnectionInput,
} from "../TaskConnectors.js";
import type { ConnectorLineDescriptor } from "../BatchedConnectorLines.js";
import type { TaskStatus, TaskPriority } from "../../store/task-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// 5a-1 · Export surface
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-1: TaskConnectors exports are importable", () => {
  it("all required constants are non-null/undefined", () => {
    expect(AGENT_HEAD_Y_OFFSET).toBeDefined();
    expect(ORB_FLOAT_Y).toBeDefined();
    expect(ORB_SPREAD_RADIUS).toBeDefined();
    expect(ORB_SIZE).toBeDefined();
    expect(ARC_LIFT).toBeDefined();
    expect(RENDER_ORDER_SCAN).toBeDefined();
    expect(RENDER_ORDER_ORB).toBeDefined();
    expect(RENDER_ORDER_BEAM).toBeDefined();
    expect(MAX_POINT_LIGHTS).toBeDefined();
    expect(PRIORITY_RANK).toBeDefined();
    expect(PRIORITY_COLOR).toBeDefined();
    expect(STATUS_BEAM_COLOR).toBeDefined();
    expect(VISIBLE_STATUSES).toBeDefined();
  });

  it("pure functions are importable and callable", () => {
    expect(typeof computeOrbPositions).toBe("function");
    expect(typeof computeLightBudget).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-2 · renderOrder stacking
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-2: renderOrder stacking is BEAM < ORB < SCAN", () => {
  it("RENDER_ORDER_BEAM < RENDER_ORDER_ORB", () => {
    expect(RENDER_ORDER_BEAM).toBeLessThan(RENDER_ORDER_ORB);
  });

  it("RENDER_ORDER_ORB < RENDER_ORDER_SCAN", () => {
    expect(RENDER_ORDER_ORB).toBeLessThan(RENDER_ORDER_SCAN);
  });

  it("scan pulse (999) is topmost", () => {
    expect(RENDER_ORDER_SCAN).toBe(999);
  });

  it("orb mesh (998) is second from top", () => {
    expect(RENDER_ORDER_ORB).toBe(998);
  });

  it("beam line (997) is third from top", () => {
    expect(RENDER_ORDER_BEAM).toBe(997);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-3 · renderOrder exceeds default (0)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-3: All renderOrder values exceed 0 (drawn after scene geometry)", () => {
  it("RENDER_ORDER_BEAM > 0", () => {
    expect(RENDER_ORDER_BEAM).toBeGreaterThan(0);
  });

  it("RENDER_ORDER_ORB > 0", () => {
    expect(RENDER_ORDER_ORB).toBeGreaterThan(0);
  });

  it("RENDER_ORDER_SCAN > 0", () => {
    expect(RENDER_ORDER_SCAN).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-4 · VISIBLE_STATUSES filter
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-4: VISIBLE_STATUSES connector filter", () => {
  it("exactly 4 statuses produce visible connectors", () => {
    expect(VISIBLE_STATUSES.size).toBe(4);
  });

  it("all 4 connector-producing statuses are present", () => {
    const expected: TaskStatus[] = ["assigned", "active", "blocked", "review"];
    for (const s of expected) {
      expect(VISIBLE_STATUSES.has(s)).toBe(true);
    }
  });

  it("terminal statuses do NOT produce connectors", () => {
    const terminal: TaskStatus[] = ["done", "cancelled", "failed"];
    for (const s of terminal) {
      expect(VISIBLE_STATUSES.has(s)).toBe(false);
    }
  });

  it("pre-assignment statuses do NOT produce connectors", () => {
    const pre: TaskStatus[] = ["draft", "planned"];
    for (const s of pre) {
      expect(VISIBLE_STATUSES.has(s)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-5 · ORB_FLOAT_Y above agent head
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-5: ORB_FLOAT_Y positions orb above AGENT_HEAD_Y_OFFSET", () => {
  it("ORB_FLOAT_Y > AGENT_HEAD_Y_OFFSET (orb floats above the agent head)", () => {
    expect(ORB_FLOAT_Y).toBeGreaterThan(AGENT_HEAD_Y_OFFSET);
  });

  it("ORB_FLOAT_Y is in valid world-space range (>1, <5)", () => {
    expect(ORB_FLOAT_Y).toBeGreaterThan(1.0);
    expect(ORB_FLOAT_Y).toBeLessThan(5.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-6 · computeOrbPositions: single task centred above agent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-6: computeOrbPositions — single task is centred above agent", () => {
  it("single task on agent → orb XZ equals agent XZ (no radial spread)", () => {
    const conn: OrbConnectionInput = {
      taskId: "t1",
      agentId: "ag1",
      agentWorldPosition: { x: 3.0, y: 0.0, z: 4.5 },
    };
    const positions = computeOrbPositions([conn]);
    const orbPos = positions["t1"];
    expect(orbPos).toBeDefined();
    // Single task → ring spread radius = 0 → XZ matches agent
    expect(orbPos[0]).toBeCloseTo(3.0, 5);
    expect(orbPos[2]).toBeCloseTo(4.5, 5);
  });

  it("single task → orb Y = agentY + ORB_FLOAT_Y", () => {
    const conn: OrbConnectionInput = {
      taskId: "t1",
      agentId: "ag1",
      agentWorldPosition: { x: 0, y: 0, z: 0 },
    };
    const positions = computeOrbPositions([conn]);
    expect(positions["t1"][1]).toBeCloseTo(ORB_FLOAT_Y, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-7 · computeOrbPositions: two tasks get ring-spread (distinct XZ)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-7: computeOrbPositions — two tasks produce ring-spread positions", () => {
  it("two tasks on same agent → distinct XZ positions", () => {
    const agentPos = { x: 5.0, y: 0.0, z: 2.0 };
    const conns: OrbConnectionInput[] = [
      { taskId: "t1", agentId: "ag1", agentWorldPosition: agentPos },
      { taskId: "t2", agentId: "ag1", agentWorldPosition: agentPos },
    ];
    const positions = computeOrbPositions(conns);
    const p1 = positions["t1"];
    const p2 = positions["t2"];

    // Positions must differ in at least one of X or Z
    const diffX = Math.abs(p1[0] - p2[0]);
    const diffZ = Math.abs(p1[2] - p2[2]);
    expect(diffX + diffZ).toBeGreaterThan(0.01);
  });

  it("two tasks → each orb is at radius ORB_SPREAD_RADIUS from agent", () => {
    const agentPos = { x: 0.0, y: 0.0, z: 0.0 };
    const conns: OrbConnectionInput[] = [
      { taskId: "t1", agentId: "ag1", agentWorldPosition: agentPos },
      { taskId: "t2", agentId: "ag1", agentWorldPosition: agentPos },
    ];
    const positions = computeOrbPositions(conns);
    for (const taskId of ["t1", "t2"]) {
      const [x, , z] = positions[taskId];
      const dist = Math.sqrt(x * x + z * z);
      expect(dist).toBeCloseTo(ORB_SPREAD_RADIUS, 5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-8 · computeOrbPositions: N tasks for same agent → N distinct XZ positions
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-8: computeOrbPositions — N tasks produce N distinct XZ positions", () => {
  it("5 tasks on same agent → 5 distinct angle positions on ring", () => {
    const N = 5;
    const agentPos = { x: 4.0, y: 0.0, z: 3.0 };
    const conns: OrbConnectionInput[] = Array.from({ length: N }, (_, i) => ({
      taskId: `task-${i}`,
      agentId: "ag1",
      agentWorldPosition: agentPos,
    }));
    const positions = computeOrbPositions(conns);

    // Collect unique (X, Z) pairs rounded to 3dp
    const xzSet = new Set(
      conns.map(({ taskId }) => {
        const [x, , z] = positions[taskId];
        return `${x.toFixed(3)},${z.toFixed(3)}`;
      }),
    );
    expect(xzSet.size).toBe(N);
  });

  it("tasks split across 2 agents → agent positions are independent", () => {
    const connsA: OrbConnectionInput[] = [
      { taskId: "t1", agentId: "agA", agentWorldPosition: { x: 1, y: 0, z: 1 } },
      { taskId: "t2", agentId: "agA", agentWorldPosition: { x: 1, y: 0, z: 1 } },
    ];
    const connsB: OrbConnectionInput[] = [
      { taskId: "t3", agentId: "agB", agentWorldPosition: { x: 8, y: 0, z: 4 } },
    ];
    const positions = computeOrbPositions([...connsA, ...connsB]);

    // t3 (single task on agB) should be centred above agB
    expect(positions["t3"][0]).toBeCloseTo(8, 5);
    expect(positions["t3"][2]).toBeCloseTo(4, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-9 · computeLightBudget: empty input
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-9: computeLightBudget — empty connections returns empty set", () => {
  it("returns Set of size 0 for empty connections", () => {
    const result = computeLightBudget([]);
    expect(result.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-10 · computeLightBudget: caps at MAX_POINT_LIGHTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-10: computeLightBudget — allocates up to MAX_POINT_LIGHTS", () => {
  it("allocates exactly min(N, MAX_POINT_LIGHTS) lights for N connections", () => {
    const makeConn = (taskId: string, priority: TaskPriority, status: TaskStatus) => ({
      taskId, priority, status,
    });

    // 6 connections > MAX_POINT_LIGHTS (4)
    const connections = [
      makeConn("t1", "critical", "active"),
      makeConn("t2", "high",     "active"),
      makeConn("t3", "normal",   "active"),
      makeConn("t4", "low",      "active"),
      makeConn("t5", "low",      "assigned"),
      makeConn("t6", "low",      "assigned"),
    ];
    const budget = computeLightBudget(connections);
    expect(budget.size).toBe(MAX_POINT_LIGHTS);
  });

  it("when N < MAX_POINT_LIGHTS all N connections get lights", () => {
    const connections = [
      { taskId: "x1", priority: "high" as TaskPriority, status: "active" as TaskStatus },
      { taskId: "x2", priority: "normal" as TaskPriority, status: "active" as TaskStatus },
    ];
    const budget = computeLightBudget(connections);
    expect(budget.size).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-11 · computeLightBudget: critical tasks get lights before low
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-11: computeLightBudget — critical tasks prioritised over low", () => {
  it("critical active task is in the budget set when competing with low tasks", () => {
    // Fill budget beyond MAX_POINT_LIGHTS with low tasks + 1 critical
    const connections = [
      { taskId: "low1",  priority: "low"      as TaskPriority, status: "active" as TaskStatus },
      { taskId: "low2",  priority: "low"      as TaskPriority, status: "active" as TaskStatus },
      { taskId: "low3",  priority: "low"      as TaskPriority, status: "active" as TaskStatus },
      { taskId: "low4",  priority: "low"      as TaskPriority, status: "active" as TaskStatus },
      { taskId: "crit1", priority: "critical" as TaskPriority, status: "active" as TaskStatus },
    ];
    const budget = computeLightBudget(connections, MAX_POINT_LIGHTS);
    // Critical task must receive a light
    expect(budget.has("crit1")).toBe(true);
  });

  it("high-priority task receives light before low-priority when budget is tight", () => {
    const connections = [
      { taskId: "low1", priority: "low"  as TaskPriority, status: "active" as TaskStatus },
      { taskId: "low2", priority: "low"  as TaskPriority, status: "active" as TaskStatus },
      { taskId: "high", priority: "high" as TaskPriority, status: "active" as TaskStatus },
    ];
    // Limit to 2 lights
    const budget = computeLightBudget(connections, 2);
    expect(budget.has("high")).toBe(true);
    // Exactly one low task gets the second slot
    const lowCount = ["low1", "low2"].filter((id) => budget.has(id)).length;
    expect(lowCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-12 · ARC_LIFT
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-12: ARC_LIFT is positive and raises arc above endpoints", () => {
  it("ARC_LIFT > 0 (bezier control point is above midpoint)", () => {
    expect(ARC_LIFT).toBeGreaterThan(0);
  });

  it("ARC_LIFT < 2 (not an unreasonably large lift)", () => {
    expect(ARC_LIFT).toBeLessThan(2.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-13 · PRIORITY_COLOR map
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-13: PRIORITY_COLOR covers all 4 priorities with valid hex", () => {
  const priorities: TaskPriority[] = ["critical", "high", "normal", "low"];

  it("has entries for all 4 priorities", () => {
    for (const p of priorities) {
      expect(PRIORITY_COLOR[p]).toBeDefined();
    }
  });

  it("all priority colors are valid 6-digit hex strings", () => {
    for (const p of priorities) {
      expect(PRIORITY_COLOR[p]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("all priority colors are visually distinct (unique values)", () => {
    const values = priorities.map((p) => PRIORITY_COLOR[p].toLowerCase());
    const unique = new Set(values);
    expect(unique.size).toBe(priorities.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-14 · STATUS_BEAM_COLOR map
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-14: STATUS_BEAM_COLOR covers all 9 statuses with valid hex", () => {
  const statuses: TaskStatus[] = [
    "draft", "planned", "assigned", "active",
    "blocked", "review", "done", "failed", "cancelled",
  ];

  it("has entries for all 9 statuses", () => {
    for (const s of statuses) {
      expect(STATUS_BEAM_COLOR[s]).toBeDefined();
    }
  });

  it("all status beam colors are valid hex strings", () => {
    for (const s of statuses) {
      expect(STATUS_BEAM_COLOR[s]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("visible-status beam colors are all distinct from each other", () => {
    const visibleStatuses: TaskStatus[] = ["assigned", "active", "blocked", "review"];
    const visibleColors = visibleStatuses.map((s) => STATUS_BEAM_COLOR[s].toLowerCase());
    const unique = new Set(visibleColors);
    expect(unique.size).toBe(visibleColors.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-15 · ORB_SIZE
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-15: ORB_SIZE is in valid geometric range", () => {
  it("ORB_SIZE > 0 (mesh has positive extent)", () => {
    expect(ORB_SIZE).toBeGreaterThan(0);
  });

  it("ORB_SIZE < 1 (not larger than a room cell)", () => {
    expect(ORB_SIZE).toBeLessThan(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-16 · ORB_SPREAD_RADIUS
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-16: ORB_SPREAD_RADIUS is in valid range", () => {
  it("ORB_SPREAD_RADIUS > 0 (spread exists for multi-task agents)", () => {
    expect(ORB_SPREAD_RADIUS).toBeGreaterThan(0);
  });

  it("ORB_SPREAD_RADIUS <= 1 (spread stays within agent footprint)", () => {
    expect(ORB_SPREAD_RADIUS).toBeLessThanOrEqual(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-17 · TaskMappingHUD badge layer import
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-17: TaskMappingHUD badge layer is importable", () => {
  it("TaskMappingHUD can be imported from TaskMappingHUD.js", async () => {
    // Dynamic import to validate the module resolves without error
    const mod = await import("../TaskMappingHUD.js");
    expect(mod.TaskMappingHUD).toBeDefined();
    expect(typeof mod.TaskMappingHUD).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-18 · ConnectorLineDescriptor shape
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-18: ConnectorLineDescriptor has required shape fields", () => {
  it("a valid ConnectorLineDescriptor object has all required fields", () => {
    // Construct a valid descriptor to verify the shape contract
    const desc: ConnectorLineDescriptor = {
      key:   "task-001",
      fromX: 1.0, fromY: 1.5, fromZ: 2.0,
      toX:   3.5, toY:   0.8, toZ:   2.0,
      status: "active",
    };
    expect(desc.key).toBe("task-001");
    expect(typeof desc.fromX).toBe("number");
    expect(typeof desc.fromY).toBe("number");
    expect(typeof desc.fromZ).toBe("number");
    expect(typeof desc.toX).toBe("number");
    expect(typeof desc.toY).toBe("number");
    expect(typeof desc.toZ).toBe("number");
    expect(desc.status).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-19 · Scene graph position: TaskConnectorsLayer before room/editor layers
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-19: Scene graph position — TaskConnectorsLayer before room/editor layers", () => {
  it("CommandCenterScene.tsx source places TaskConnectorsLayer immediately after agent block", async () => {
    // Read the scene source and verify render order is correct.
    // We parse the raw source text to confirm JSX ordering rather than executing R3F.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");

    // Resolve path relative to this test file's directory
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const scenePath = join(thisDir, "..", "CommandCenterScene.tsx");
    const source = readFileSync(scenePath, "utf8");

    // Find line indices for the key layers
    const lines = source.split("\n");

    const findFirstLine = (token: string): number =>
      lines.findIndex((l) => l.includes(token));

    const hierarchyLine    = findFirstLine("<HierarchySceneGraph");
    const agentAvatarLine  = findFirstLine("<AgentAvatarsLayer");
    const connectorLine    = findFirstLine("<TaskConnectorsLayer");
    const roomsLine        = findFirstLine("<RoomsFromRegistry");
    const mappingLine      = findFirstLine("<RoomMappingEditor3DLayer");

    // All elements must be found
    expect(hierarchyLine,   "HierarchySceneGraph not found").toBeGreaterThan(-1);
    expect(agentAvatarLine, "AgentAvatarsLayer not found").toBeGreaterThan(-1);
    expect(connectorLine,   "TaskConnectorsLayer not found").toBeGreaterThan(-1);
    expect(roomsLine,       "RoomsFromRegistry not found").toBeGreaterThan(-1);
    expect(mappingLine,     "RoomMappingEditor3DLayer not found").toBeGreaterThan(-1);

    // TaskConnectorsLayer must appear AFTER both agent rendering paths
    // (both hierarchy and legacy paths define agents before the connector layer)
    expect(connectorLine, "TaskConnectorsLayer must come after HierarchySceneGraph")
      .toBeGreaterThan(hierarchyLine);

    expect(connectorLine, "TaskConnectorsLayer must come after AgentAvatarsLayer")
      .toBeGreaterThan(agentAvatarLine);

    // TaskConnectorsLayer must appear BEFORE RoomsFromRegistry (immediately after agents)
    expect(connectorLine, "TaskConnectorsLayer must come before RoomsFromRegistry")
      .toBeLessThan(roomsLine);

    // TaskConnectorsLayer must appear BEFORE RoomMappingEditor3DLayer
    expect(connectorLine, "TaskConnectorsLayer must come before RoomMappingEditor3DLayer")
      .toBeLessThan(mappingLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5a-20 · computeOrbPositions: empty input
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5a-20: computeOrbPositions — empty input produces empty map", () => {
  it("empty connections array returns empty position map", () => {
    const result = computeOrbPositions([]);
    expect(Object.keys(result).length).toBe(0);
  });

  it("connections for different agents are each computed independently", () => {
    const conns: OrbConnectionInput[] = [
      { taskId: "a1", agentId: "agent-A", agentWorldPosition: { x: 2, y: 0, z: 2 } },
      { taskId: "b1", agentId: "agent-B", agentWorldPosition: { x: 7, y: 0, z: 4 } },
      { taskId: "b2", agentId: "agent-B", agentWorldPosition: { x: 7, y: 0, z: 4 } },
    ];
    const positions = computeOrbPositions(conns);

    // a1 (single task) must be centred over agent-A
    expect(positions["a1"][0]).toBeCloseTo(2, 5);
    expect(positions["a1"][2]).toBeCloseTo(2, 5);

    // b1, b2 (two tasks) must both be at radius ORB_SPREAD_RADIUS from agent-B
    for (const tid of ["b1", "b2"]) {
      const dx = positions[tid][0] - 7;
      const dz = positions[tid][2] - 4;
      expect(Math.sqrt(dx * dx + dz * dz)).toBeCloseTo(ORB_SPREAD_RADIUS, 5);
    }
  });
});
