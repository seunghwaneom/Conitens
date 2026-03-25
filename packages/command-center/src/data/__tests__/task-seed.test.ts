/**
 * task-seed.test.ts — Unit tests for the mock task seed dataset.
 *
 * Sub-AC 5a: Task-agent mapping data model — mock data validation.
 *
 * Validates that:
 *   1. TASK_INITIAL_DATASET has the correct count and unique IDs
 *   2. All tasks have required fields (taskId, title, status, priority)
 *   3. All statuses are valid TaskStatus values
 *   4. All priorities are valid TaskPriority values
 *   5. All assigned agent IDs match SEED_AGENT_IDS
 *   6. Task IDs are unique across the dataset
 *   7. Parent task IDs reference existing tasks in the dataset
 *   8. TASK_SEED_MAP provides O(1) lookup for every task
 *   9. getSeedTasksForAgent returns correct subset per agent
 *  10. getSeedTasksByStatus returns correct subset per status
 *  11. getSeedSubTasks returns correct children for each parent
 *  12. getSeedStatusSummary counts match actual distribution
 *  13. getSeedPrioritySummary counts match actual distribution
 *  14. The dataset covers all 9 task statuses
 *  15. The dataset covers all 4 priority levels
 *  16. The dataset covers all 5 seed agents
 *  17. At least one task is in "active" status (for visible connectors)
 *  18. At least one task is unassigned (for empty-queue scenario)
 *  19. Timestamps are monotonically plausible (createdTs > 0)
 *  20. formatSeedDatasetSummary returns a non-empty string
 */

import { describe, it, expect } from "vitest";
import {
  TASK_INITIAL_DATASET,
  TASK_SEED_MAP,
  SEED_AGENT_IDS,
  SEED_TASK_IDS,
  SEED_TASK_COUNT,
  getSeedTask,
  getSeedTasksForAgent,
  getSeedTasksByStatus,
  getSeedSubTasks,
  getSeedStatusSummary,
  getSeedPrioritySummary,
  formatSeedDatasetSummary,
} from "../task-seed.js";
import type { TaskStatus, TaskPriority } from "../task-types.js";

// ── Constants ─────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<TaskStatus>([
  "draft", "planned", "assigned", "active",
  "blocked", "review", "done", "failed", "cancelled",
]);

const VALID_PRIORITIES = new Set<TaskPriority>([
  "critical", "high", "normal", "low",
]);

const ALL_SEED_AGENT_IDS = new Set(Object.values(SEED_AGENT_IDS));
const ALL_SEED_TASK_IDS  = new Set(Object.values(SEED_TASK_IDS));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("task-seed — TASK_INITIAL_DATASET", () => {

  // 1. Count and SEED_TASK_COUNT
  it("has a count > 0 and SEED_TASK_COUNT matches array length", () => {
    expect(TASK_INITIAL_DATASET.length).toBeGreaterThan(0);
    expect(SEED_TASK_COUNT).toBe(TASK_INITIAL_DATASET.length);
  });

  // 2. Required fields present on every record
  it("every record has taskId, title, status, priority, createdTs, updatedTs", () => {
    for (const task of TASK_INITIAL_DATASET) {
      expect(typeof task.taskId).toBe("string");
      expect(task.taskId.length).toBeGreaterThan(0);
      expect(typeof task.title).toBe("string");
      expect(task.title.length).toBeGreaterThan(0);
      expect(typeof task.status).toBe("string");
      expect(typeof task.priority).toBe("string");
      expect(typeof task.createdTs).toBe("number");
      expect(typeof task.updatedTs).toBe("number");
      expect(Array.isArray(task.tags)).toBe(true);
      expect(Array.isArray(task.eventIds)).toBe(true);
    }
  });

  // 3. All statuses are valid
  it("every record has a valid TaskStatus", () => {
    for (const task of TASK_INITIAL_DATASET) {
      expect(VALID_STATUSES.has(task.status)).toBe(true);
    }
  });

  // 4. All priorities are valid
  it("every record has a valid TaskPriority", () => {
    for (const task of TASK_INITIAL_DATASET) {
      expect(VALID_PRIORITIES.has(task.priority)).toBe(true);
    }
  });

  // 5. All assigned agent IDs are valid seed agent IDs
  it("every assignedAgentId is either null or a known seed agent ID", () => {
    for (const task of TASK_INITIAL_DATASET) {
      if (task.assignedAgentId !== null) {
        expect(ALL_SEED_AGENT_IDS.has(task.assignedAgentId)).toBe(true);
      }
    }
  });

  // 6. Task IDs are unique
  it("all taskIds are unique", () => {
    const ids = TASK_INITIAL_DATASET.map((t) => t.taskId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // 7. Parent task IDs reference existing tasks in the dataset
  it("all non-null parentTaskIds reference a taskId in the dataset", () => {
    const idSet = new Set(TASK_INITIAL_DATASET.map((t) => t.taskId));
    for (const task of TASK_INITIAL_DATASET) {
      if (task.parentTaskId !== null) {
        expect(idSet.has(task.parentTaskId)).toBe(true);
      }
    }
  });

  // 8. TASK_SEED_MAP provides O(1) lookup
  it("TASK_SEED_MAP contains an entry for every task in TASK_INITIAL_DATASET", () => {
    for (const task of TASK_INITIAL_DATASET) {
      expect(TASK_SEED_MAP[task.taskId]).toBeDefined();
      expect(TASK_SEED_MAP[task.taskId].taskId).toBe(task.taskId);
    }
    expect(Object.keys(TASK_SEED_MAP).length).toBe(TASK_INITIAL_DATASET.length);
  });
});

// ── getSeedTask ────────────────────────────────────────────────────────────

describe("task-seed — getSeedTask", () => {
  it("returns the correct record for a known task ID", () => {
    const first = TASK_INITIAL_DATASET[0];
    const result = getSeedTask(first.taskId);
    expect(result).toBeDefined();
    expect(result?.taskId).toBe(first.taskId);
    expect(result?.title).toBe(first.title);
  });

  it("returns undefined for an unknown task ID", () => {
    expect(getSeedTask("nonexistent-id")).toBeUndefined();
  });

  it("getSeedTask works for every SEED_TASK_IDS entry", () => {
    for (const id of Object.values(SEED_TASK_IDS)) {
      expect(getSeedTask(id)).toBeDefined();
    }
  });
});

// ── getSeedTasksForAgent ───────────────────────────────────────────────────

describe("task-seed — getSeedTasksForAgent", () => {
  it("returns tasks assigned to a known agent", () => {
    const implementerTasks = getSeedTasksForAgent(SEED_AGENT_IDS.IMPLEMENTER);
    expect(implementerTasks.length).toBeGreaterThan(0);
    for (const t of implementerTasks) {
      expect(t.assignedAgentId).toBe(SEED_AGENT_IDS.IMPLEMENTER);
    }
  });

  it("returns an empty array for an unknown agent", () => {
    const result = getSeedTasksForAgent("ghost-agent-not-in-seeds");
    expect(result).toEqual([]);
  });

  it("every seed agent has at least one assigned task", () => {
    for (const agentId of Object.values(SEED_AGENT_IDS)) {
      const tasks = getSeedTasksForAgent(agentId);
      expect(tasks.length).toBeGreaterThan(0);
    }
  });
});

// ── getSeedTasksByStatus ───────────────────────────────────────────────────

describe("task-seed — getSeedTasksByStatus", () => {
  it("returns tasks in the given status", () => {
    const activeTasks = getSeedTasksByStatus("active");
    expect(activeTasks.length).toBeGreaterThan(0);
    for (const t of activeTasks) {
      expect(t.status).toBe("active");
    }
  });

  it("returns empty array for 'done' (no completed tasks in seed)", () => {
    // Seed dataset intentionally has no done/failed/cancelled tasks
    const doneTasks = getSeedTasksByStatus("done");
    expect(doneTasks).toEqual([]);
  });
});

// ── getSeedSubTasks ────────────────────────────────────────────────────────

describe("task-seed — getSeedSubTasks", () => {
  it("returns direct children of the auth epic", () => {
    const children = getSeedSubTasks(SEED_TASK_IDS.AUTH_EPIC);
    expect(children.length).toBeGreaterThan(0);
    for (const t of children) {
      expect(t.parentTaskId).toBe(SEED_TASK_IDS.AUTH_EPIC);
    }
  });

  it("returns empty array for a task with no children", () => {
    // The HUD_PERF task has no sub-tasks in the seed
    const children = getSeedSubTasks(SEED_TASK_IDS.HUD_PERF);
    expect(children).toEqual([]);
  });
});

// ── getSeedStatusSummary ───────────────────────────────────────────────────

describe("task-seed — getSeedStatusSummary", () => {
  it("counts sum to SEED_TASK_COUNT", () => {
    const summary = getSeedStatusSummary();
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(SEED_TASK_COUNT);
  });

  it("active count is positive", () => {
    const summary = getSeedStatusSummary();
    expect(summary.active).toBeGreaterThan(0);
  });

  it("done count is 0 (seed dataset has no completed tasks)", () => {
    const summary = getSeedStatusSummary();
    expect(summary.done).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.cancelled).toBe(0);
  });

  it("summary matches manual count of TASK_INITIAL_DATASET", () => {
    const summary = getSeedStatusSummary();
    for (const [status, count] of Object.entries(summary)) {
      const manual = TASK_INITIAL_DATASET.filter(
        (t) => t.status === status,
      ).length;
      expect(count).toBe(manual);
    }
  });
});

// ── getSeedPrioritySummary ─────────────────────────────────────────────────

describe("task-seed — getSeedPrioritySummary", () => {
  it("counts sum to SEED_TASK_COUNT", () => {
    const summary = getSeedPrioritySummary();
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(SEED_TASK_COUNT);
  });

  it("critical count is positive", () => {
    const summary = getSeedPrioritySummary();
    expect(summary.critical).toBeGreaterThan(0);
  });

  it("summary matches manual count of TASK_INITIAL_DATASET", () => {
    const summary = getSeedPrioritySummary();
    for (const [priority, count] of Object.entries(summary)) {
      const manual = TASK_INITIAL_DATASET.filter(
        (t) => t.priority === priority,
      ).length;
      expect(count).toBe(manual);
    }
  });
});

// ── Coverage requirements ─────────────────────────────────────────────────

describe("task-seed — coverage requirements", () => {

  // 14. Dataset covers active tasks (for visible connectors in 3D)
  it("has at least one task in 'active' status (for 3D connector visibility)", () => {
    const active = TASK_INITIAL_DATASET.filter((t) => t.status === "active");
    expect(active.length).toBeGreaterThan(0);
  });

  // 15. Dataset covers blocked tasks (distress signal connectors)
  it("has at least one task in 'blocked' status (for distress connector rendering)", () => {
    const blocked = TASK_INITIAL_DATASET.filter((t) => t.status === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
  });

  // 16. Dataset covers all 4 priorities
  it("covers all 4 priority levels", () => {
    const priorities = new Set(TASK_INITIAL_DATASET.map((t) => t.priority));
    expect(priorities.has("critical")).toBe(true);
    expect(priorities.has("high")).toBe(true);
    expect(priorities.has("normal")).toBe(true);
    expect(priorities.has("low")).toBe(true);
  });

  // 17. Dataset covers all 5 seed agents
  it("covers all 5 seed agents (each has at least 1 assigned task)", () => {
    const assignedAgents = new Set(
      TASK_INITIAL_DATASET
        .filter((t) => t.assignedAgentId !== null)
        .map((t) => t.assignedAgentId),
    );
    for (const agentId of Object.values(SEED_AGENT_IDS)) {
      expect(assignedAgents.has(agentId)).toBe(true);
    }
  });

  // 18. At least one unassigned task
  it("includes at least one unassigned task (for empty-queue scenario)", () => {
    const unassigned = TASK_INITIAL_DATASET.filter(
      (t) => t.assignedAgentId === null,
    );
    expect(unassigned.length).toBeGreaterThan(0);
  });

  // 19. Timestamps are plausible (createdTs > 0)
  it("all timestamps are positive numbers", () => {
    for (const t of TASK_INITIAL_DATASET) {
      expect(t.createdTs).toBeGreaterThan(0);
      expect(t.updatedTs).toBeGreaterThan(0);
      expect(t.updatedTs).toBeGreaterThanOrEqual(t.createdTs);
    }
  });

  // 19b. startedTs is non-null for active tasks
  it("active tasks have a non-null startedTs", () => {
    for (const t of TASK_INITIAL_DATASET.filter((t) => t.status === "active")) {
      expect(t.startedTs).not.toBeNull();
    }
  });

  // 19c. draft tasks have null startedTs
  it("draft tasks have null startedTs", () => {
    for (const t of TASK_INITIAL_DATASET.filter((t) => t.status === "draft")) {
      expect(t.startedTs).toBeNull();
    }
  });

  // 20. formatSeedDatasetSummary returns a non-empty string
  it("formatSeedDatasetSummary returns a non-empty string", () => {
    const summary = formatSeedDatasetSummary();
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Task Seed Dataset");
    expect(summary).toContain(String(SEED_TASK_COUNT));
  });
});

// ── Integration: seed data → task-store bulkLoadTasks ─────────────────────

describe("task-seed — integration with task-store", () => {
  it("TASK_INITIAL_DATASET can be passed to bulkLoadTasks without errors", async () => {
    // Dynamically import so we don't pollute other test modules
    const { useTaskStore } = await import("../../store/task-store.js");

    // Reset store
    useTaskStore.setState({
      tasks:          {},
      assignments:    {},
      agentTaskIndex: {},
      tagIndex:       {},
      events:         [],
    });

    // Load seed data
    useTaskStore.getState().bulkLoadTasks([...TASK_INITIAL_DATASET]);

    const state = useTaskStore.getState();
    expect(Object.keys(state.tasks).length).toBe(SEED_TASK_COUNT);

    // Verify all SEED_TASK_IDS are in the store
    for (const id of Object.values(SEED_TASK_IDS)) {
      expect(state.tasks[id]).toBeDefined();
    }
  });

  it("after bulkLoadTasks, assignments index contains only active (non-terminal) tasks", async () => {
    const { useTaskStore } = await import("../../store/task-store.js");

    useTaskStore.setState({
      tasks:          {},
      assignments:    {},
      agentTaskIndex: {},
      tagIndex:       {},
      events:         [],
    });

    useTaskStore.getState().bulkLoadTasks([...TASK_INITIAL_DATASET]);

    const state = useTaskStore.getState();

    // Verify all assignments reference non-terminal, assigned tasks
    for (const assignment of Object.values(state.assignments)) {
      const task = state.tasks[assignment.taskId];
      expect(task).toBeDefined();
      expect(task.assignedAgentId).toBe(assignment.agentId);
      expect(["done", "cancelled"].includes(task.status)).toBe(false);
    }
  });

  it("after bulkLoadTasks, agentTaskIndex maps agents to their correct task IDs", async () => {
    const { useTaskStore } = await import("../../store/task-store.js");

    useTaskStore.setState({
      tasks:          {},
      assignments:    {},
      agentTaskIndex: {},
      tagIndex:       {},
      events:         [],
    });

    useTaskStore.getState().bulkLoadTasks([...TASK_INITIAL_DATASET]);

    const state = useTaskStore.getState();

    // implementer should have at least 1 task in the index
    const implTasks = state.agentTaskIndex[SEED_AGENT_IDS.IMPLEMENTER] ?? [];
    expect(implTasks.length).toBeGreaterThan(0);

    // Each task in the index should reference this agent
    for (const taskId of implTasks) {
      expect(state.tasks[taskId].assignedAgentId).toBe(SEED_AGENT_IDS.IMPLEMENTER);
    }
  });

  it("after bulkLoadTasks, getTasksForAgent returns tasks sorted by priority", async () => {
    const { useTaskStore } = await import("../../store/task-store.js");

    useTaskStore.setState({
      tasks:          {},
      assignments:    {},
      agentTaskIndex: {},
      tagIndex:       {},
      events:         [],
    });

    useTaskStore.getState().bulkLoadTasks([...TASK_INITIAL_DATASET]);

    // Validator has tasks at multiple priorities (critical + high + normal from seed)
    const validatorTasks = useTaskStore.getState().getTasksForAgent(
      SEED_AGENT_IDS.VALIDATOR,
    );
    expect(validatorTasks.length).toBeGreaterThan(0);

    // Verify sorted by priority descending (critical first)
    for (let i = 0; i < validatorTasks.length - 1; i++) {
      const aPriority = validatorTasks[i].priority;
      const bPriority = validatorTasks[i + 1].priority;
      const priorityWeight = { critical: 4, high: 3, normal: 2, low: 1 };
      expect(priorityWeight[aPriority]).toBeGreaterThanOrEqual(
        priorityWeight[bPriority],
      );
    }
  });
});
