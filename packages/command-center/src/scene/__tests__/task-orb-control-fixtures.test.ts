/**
 * task-orb-control-fixtures.test.ts — Sub-AC 7c unit tests
 *
 * Tests the TaskOrbControlFixtures layer pure helpers:
 *   - computeTaskOrbWorldPos: orb positioning above agent
 *   - buildTaskOrbEntries: entry list construction from task + agent data
 *   - Visual fixture update: status/priority changes reflected in fixture descriptors
 *   - Integration: orchestration_command data flow through store mutations
 *
 * Pure logic tests — no React/Three.js render required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeTaskOrbWorldPos,
  buildTaskOrbEntries,
  TASK_ORB_FIXTURE_FLOAT_Y,
  TASK_ORB_FIXTURE_SPREAD_RADIUS,
  TASK_ORB_FIXTURE_VISIBLE_STATUSES,
} from "../TaskOrbControlFixtures.js";
import {
  buildTaskOrbFixtures,
  taskCancelFixtureId,
  taskReprioFixtureId,
  taskMenuFixtureId,
  getTaskReprioFixtureColor,
  TASK_CANCEL_FIXTURE_COLOR,
  TASK_FIXTURE_DISABLED_COLOR,
} from "../../hooks/use-task-fixture-control-plane.js";
import { useTaskManagementStore } from "../../hooks/use-task-management.js";
import { useTaskStore }           from "../../store/task-store.js";
import type { TaskRecord } from "../../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId:          "task-orb-001",
    title:           "Orb test task",
    description:     undefined,
    status:          "active",
    priority:        "normal",
    assignedAgentId: "agent-impl-1",
    createdTs:       1_000_000,
    updatedTs:       1_000_000,
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            [],
    eventIds:        [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset stores between tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useTaskManagementStore.getState().close();
  useTaskManagementStore.setState({ panelEvents: [] });
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeTaskOrbWorldPos
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTaskOrbWorldPos()", () => {
  const agentPos = { x: 2, y: 0, z: 3 };

  it("single orb floats directly above agent at TASK_ORB_FIXTURE_FLOAT_Y", () => {
    const pos = computeTaskOrbWorldPos(agentPos, 0, 1);
    expect(pos.x).toBe(agentPos.x);
    expect(pos.y).toBe(agentPos.y + TASK_ORB_FIXTURE_FLOAT_Y);
    expect(pos.z).toBe(agentPos.z);
  });

  it("multiple orbs have Y = agentPos.y + TASK_ORB_FIXTURE_FLOAT_Y", () => {
    for (let i = 0; i < 4; i++) {
      const pos = computeTaskOrbWorldPos(agentPos, i, 4);
      expect(pos.y).toBeCloseTo(agentPos.y + TASK_ORB_FIXTURE_FLOAT_Y, 5);
    }
  });

  it("two orbs are spread apart (different x/z)", () => {
    const pos0 = computeTaskOrbWorldPos(agentPos, 0, 2);
    const pos1 = computeTaskOrbWorldPos(agentPos, 1, 2);
    // They should NOT be at the same x,z position
    const samePos = pos0.x === pos1.x && pos0.z === pos1.z;
    expect(samePos).toBe(false);
  });

  it("spread orbs are within TASK_ORB_FIXTURE_SPREAD_RADIUS of agent", () => {
    for (let i = 0; i < 6; i++) {
      const pos = computeTaskOrbWorldPos(agentPos, i, 6);
      const dx  = pos.x - agentPos.x;
      const dz  = pos.z - agentPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeCloseTo(TASK_ORB_FIXTURE_SPREAD_RADIUS, 5);
    }
  });

  it("single orb (totalOrbs=1): no spread applied", () => {
    const pos = computeTaskOrbWorldPos({ x: 0, y: 0, z: 0 }, 0, 1);
    expect(pos.x).toBe(0);
    expect(pos.z).toBe(0);
  });

  it("orbs at index 0 and index totalOrbs/2 are on opposite sides", () => {
    // For 4 orbs, index 0 and index 2 should be ~180° apart
    const pos0 = computeTaskOrbWorldPos(agentPos, 0, 4);
    const pos2 = computeTaskOrbWorldPos(agentPos, 2, 4);
    // Their X/Z displacement from agent should be opposite in sign
    const dx0 = pos0.x - agentPos.x;
    const dx2 = pos2.x - agentPos.x;
    // They should have opposite signs (with some floating point tolerance)
    expect(Math.sign(Math.round(dx0 * 100)) !== 0).toBe(true);
    expect(Math.round(dx0 * 100) + Math.round(dx2 * 100)).toBeCloseTo(0, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildTaskOrbEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTaskOrbEntries()", () => {
  it("returns empty array when no tasks provided", () => {
    const entries = buildTaskOrbEntries([], new Map());
    expect(entries).toHaveLength(0);
  });

  it("returns empty array when agent positions map is empty", () => {
    const tasks = [makeTask()];
    const entries = buildTaskOrbEntries(tasks, new Map());
    expect(entries).toHaveLength(0);
  });

  it("returns one entry per task with a known agent position", () => {
    const task1 = makeTask({ taskId: "t1", assignedAgentId: "agent-a" });
    const task2 = makeTask({ taskId: "t2", assignedAgentId: "agent-a" });
    const positions = new Map([
      ["agent-a", { x: 0, y: 0, z: 0 }],
    ]);
    const entries = buildTaskOrbEntries([task1, task2], positions);
    expect(entries).toHaveLength(2);
  });

  it("skips tasks with no assignedAgentId", () => {
    const unassigned = makeTask({ assignedAgentId: null });
    const positions  = new Map([["agent-a", { x: 0, y: 0, z: 0 }]]);
    const entries    = buildTaskOrbEntries([unassigned], positions);
    expect(entries).toHaveLength(0);
  });

  it("each entry has entityRef with entityType='task'", () => {
    const task      = makeTask({ taskId: "t-check", assignedAgentId: "agent-a" });
    const positions = new Map([["agent-a", { x: 1, y: 0, z: 2 }]]);
    const [entry]   = buildTaskOrbEntries([task], positions);
    expect(entry.entityRef.entityType).toBe("task");
    expect(entry.entityRef.entityId).toBe("t-check");
  });

  it("each entry's entityWorldPosition.y = agentY + TASK_ORB_FIXTURE_FLOAT_Y (single task)", () => {
    const agentY    = 0;
    const task      = makeTask({ assignedAgentId: "agent-a" });
    const positions = new Map([["agent-a", { x: 0, y: agentY, z: 0 }]]);
    const [entry]   = buildTaskOrbEntries([task], positions);
    expect(entry.entityWorldPosition.y).toBeCloseTo(
      agentY + TASK_ORB_FIXTURE_FLOAT_Y,
      5,
    );
  });

  it("each entry has 3 fixtures (cancel, reprio, menu)", () => {
    const task      = makeTask({ assignedAgentId: "agent-a" });
    const positions = new Map([["agent-a", { x: 0, y: 0, z: 0 }]]);
    const [entry]   = buildTaskOrbEntries([task], positions);
    expect(entry.fixtures).toHaveLength(3);
  });

  it("visible=false: all fixture entries have disabled=true", () => {
    const task      = makeTask({ status: "active", assignedAgentId: "agent-a" });
    const positions = new Map([["agent-a", { x: 0, y: 0, z: 0 }]]);
    const [entry]   = buildTaskOrbEntries([task], positions, false);
    for (const f of entry.fixtures) {
      expect(f.disabled).toBe(true);
    }
  });

  it("tasks on different agents produce separate entries", () => {
    const task1 = makeTask({ taskId: "t1", assignedAgentId: "agent-a" });
    const task2 = makeTask({ taskId: "t2", assignedAgentId: "agent-b" });
    const positions = new Map([
      ["agent-a", { x: 1, y: 0, z: 0 }],
      ["agent-b", { x: 5, y: 0, z: 0 }],
    ]);
    const entries = buildTaskOrbEntries([task1, task2], positions);
    expect(entries).toHaveLength(2);
    // Verify they're at different positions
    expect(entries[0].entityWorldPosition.x).not.toBe(entries[1].entityWorldPosition.x);
  });

  it("two tasks on same agent are spread apart", () => {
    const task1 = makeTask({ taskId: "t1", assignedAgentId: "agent-a" });
    const task2 = makeTask({ taskId: "t2", assignedAgentId: "agent-a" });
    const positions = new Map([["agent-a", { x: 0, y: 0, z: 0 }]]);
    const entries   = buildTaskOrbEntries([task1, task2], positions);
    expect(entries).toHaveLength(2);
    const same =
      entries[0].entityWorldPosition.x === entries[1].entityWorldPosition.x &&
      entries[0].entityWorldPosition.z === entries[1].entityWorldPosition.z;
    expect(same).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TASK_ORB_FIXTURE_VISIBLE_STATUSES
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK_ORB_FIXTURE_VISIBLE_STATUSES", () => {
  it("includes 'assigned', 'active', 'blocked', 'review'", () => {
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("assigned")).toBe(true);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("active")).toBe(true);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("blocked")).toBe(true);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("review")).toBe(true);
  });

  it("excludes terminal and pre-active statuses", () => {
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("done")).toBe(false);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("cancelled")).toBe(false);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("draft")).toBe(false);
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.has("planned")).toBe(false);
  });

  it("has exactly 4 entries", () => {
    expect(TASK_ORB_FIXTURE_VISIBLE_STATUSES.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 3D visual update contract — fixtures reflect current status/priority
// ─────────────────────────────────────────────────────────────────────────────

describe("3D visual update: fixtures reflect task status and priority", () => {
  it("priority change: reprio fixture color updates to new priority color", () => {
    const lowTask      = makeTask({ status: "active", priority: "low" });
    const criticalTask = makeTask({ status: "active", priority: "critical" });

    const [, reprioLow]      = buildTaskOrbFixtures(lowTask);
    const [, reprioCritical] = buildTaskOrbFixtures(criticalTask);

    expect(reprioLow.color).toBe(getTaskReprioFixtureColor("low"));
    expect(reprioCritical.color).toBe(getTaskReprioFixtureColor("critical"));
    expect(reprioLow.color).not.toBe(reprioCritical.color);
  });

  it("status change to 'cancelled': cancel button becomes disabled", () => {
    const activeTask    = makeTask({ status: "active" });
    const cancelledTask = makeTask({ status: "cancelled" });

    const [cancelActive]    = buildTaskOrbFixtures(activeTask);
    const [cancelCancelled] = buildTaskOrbFixtures(cancelledTask);

    expect(cancelActive.disabled).toBeFalsy();
    expect(cancelCancelled.disabled).toBe(true);
  });

  it("status change to 'active': cancel button becomes enabled (red)", () => {
    const activeTask = makeTask({ status: "active" });
    const [cancel]   = buildTaskOrbFixtures(activeTask);
    expect(cancel.disabled).toBeFalsy();
    expect(cancel.color).toBe(TASK_CANCEL_FIXTURE_COLOR);
  });

  it("status change to 'done': reprio button becomes grey (disabled)", () => {
    const doneTask = makeTask({ status: "done", priority: "critical" });
    const [, reprio] = buildTaskOrbFixtures(doneTask);
    expect(reprio.disabled).toBe(true);
    expect(reprio.color).toBe(TASK_FIXTURE_DISABLED_COLOR);
    // Should NOT be critical color even though priority is critical
    expect(reprio.color).not.toBe(getTaskReprioFixtureColor("critical"));
  });

  it("all four priority levels produce distinct reprio fixture colors", () => {
    const priorities = ["critical", "high", "normal", "low"] as const;
    const colors = priorities.map((p) => {
      const task = makeTask({ status: "active", priority: p });
      const [, reprio] = buildTaskOrbFixtures(task);
      return reprio.color;
    });
    const unique = new Set(colors);
    expect(unique.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Orchestration command data-flow integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Orchestration command data flow (Sub-AC 7c integration)", () => {
  it("cancel fixture click → openCancelTask → correct panel state for command dispatch", () => {
    // Step 1: Simulate fixture intent routing (what handleFixtureIntent does)
    const task = makeTask({
      taskId:  "task-orch-test",
      title:   "Orchestration test task",
      status:  "active",
      priority: "high",
    });
    useTaskStore.setState({ tasks: { [task.taskId]: task } });

    // Step 2: Route through management store (what cancel fixture click does)
    useTaskManagementStore.getState().openCancelTask(
      task.taskId,
      task.title,
      task.status,
    );

    // Step 3: Verify panel state is ready for orchestration command
    const state = useTaskManagementStore.getState();
    expect(state.mode).toBe("cancel");
    expect(state.targetTaskId).toBe("task-orch-test");
    expect(state.targetTaskStatus).toBe("active"); // needed for command dispatch
  });

  it("reprio fixture click → openReprioritizeTask → correct panel state", () => {
    const task = makeTask({
      taskId:   "task-reprio-orch",
      title:    "Reprio orch task",
      status:   "assigned",
      priority: "normal",
    });
    useTaskStore.setState({ tasks: { [task.taskId]: task } });

    useTaskManagementStore.getState().openReprioritizeTask(
      task.taskId,
      task.title,
      task.priority,
    );

    const state = useTaskManagementStore.getState();
    expect(state.mode).toBe("reprioritize");
    expect(state.targetTaskId).toBe("task-reprio-orch");
    expect(state.targetTaskPriority).toBe("normal");
  });

  it("task creation from room context → panel state ready for command", () => {
    // Sub-AC 7c also covers creation from room context via fixture menu
    useTaskManagementStore.getState().openCreateTask("room", "room-ops-lab");

    const state = useTaskManagementStore.getState();
    expect(state.mode).toBe("create");
    expect(state.originType).toBe("room");
    expect(state.originId).toBe("room-ops-lab");
  });

  it("task creation from agent context → panel pre-fills agentId", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "agent-impl-1");

    const state = useTaskManagementStore.getState();
    expect(state.mode).toBe("create");
    expect(state.originType).toBe("agent");
    expect(state.originId).toBe("agent-impl-1");
  });

  it("panel event sequence: fixture click → panel events audit trail", () => {
    // Verify the panel event log records the sequence for record transparency
    const task = makeTask({ taskId: "t-audit", status: "active" });
    useTaskStore.setState({ tasks: { [task.taskId]: task } });

    // Simulate the full sequence: open → record submit → close
    const mgmt = useTaskManagementStore.getState();
    mgmt.openCancelTask(task.taskId, task.title, task.status);

    // Record a submission event (as TaskManagementPanel.tsx does)
    mgmt.recordPanelEvent("panel.submitted_cancel", {
      taskId: task.taskId,
      reason: "test_cancel",
    });
    mgmt.close();

    const events = useTaskManagementStore.getState().panelEvents;
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("panel.opened_cancel");
    expect(eventTypes).toContain("panel.submitted_cancel");
    expect(eventTypes).toContain("panel.closed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Fixture IDs are task-scoped (no collisions between tasks)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fixture ID scoping — no cross-task collisions", () => {
  it("cancel fixture IDs for different tasks do not collide", () => {
    const id1 = taskCancelFixtureId("task-a");
    const id2 = taskCancelFixtureId("task-b");
    expect(id1).not.toBe(id2);
  });

  it("cancel and reprio fixture IDs for same task do not collide", () => {
    const cancelId = taskCancelFixtureId("task-x");
    const reprioId = taskReprioFixtureId("task-x");
    const menuId   = taskMenuFixtureId("task-x");
    expect(cancelId).not.toBe(reprioId);
    expect(cancelId).not.toBe(menuId);
    expect(reprioId).not.toBe(menuId);
  });

  it("buildTaskOrbEntries produces unique fixtureIds for all task+action combos", () => {
    const tasks = [
      makeTask({ taskId: "task-1", assignedAgentId: "agent-a" }),
      makeTask({ taskId: "task-2", assignedAgentId: "agent-a" }),
      makeTask({ taskId: "task-3", assignedAgentId: "agent-b" }),
    ];
    const positions = new Map([
      ["agent-a", { x: 0, y: 0, z: 0 }],
      ["agent-b", { x: 3, y: 0, z: 0 }],
    ]);
    const entries    = buildTaskOrbEntries(tasks, positions);
    const allIds     = entries.flatMap((e) => e.fixtures.map((f) => f.fixtureId));
    const uniqueIds  = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length); // no duplicates
    expect(allIds.length).toBe(3 * 3); // 3 tasks × 3 fixtures each
  });
});
