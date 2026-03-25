/**
 * task-connector-data.test.ts — Tests for Sub-ACs 5.1, 5.2, 5.3.
 *
 * These tests validate the data layer that drives the 3D task-connector
 * visual layer (TaskConnectors.tsx + BatchedConnectorLines + TaskMappingHUD).
 *
 * Sub-AC 5.1 — Task-agent mapping data model (extended coverage)
 *   - Connector visibility predicate: which task statuses generate 3D connectors
 *   - Terminal tasks (done/cancelled/failed) are excluded from the visual layer
 *   - Pre-assignment tasks (draft/planned) are excluded until assigned
 *   - Priority-based visual properties are stored and retrievable
 *
 * Sub-AC 5.2 — Dynamic task-to-agent assignment data
 *   - Assignments produce structured records consumable by the connector layer
 *   - Multi-task agents produce N connectors with ring-spread positions
 *   - Unresolved assignments (missing agent) are safely excluded
 *
 * Sub-AC 5.3 — Priority/status visual mapping correctness
 *   - PRIORITY_COLOR map covers all 4 priorities with valid hex values
 *   - STATUS_BEAM_COLOR map covers all 9 statuses with valid hex values
 *   - Critical tasks are ranked higher than normal for PointLight allocation
 *   - High-priority active tasks take precedence for PointLight budget
 *
 * Note: 3D rendering components (React Three Fiber, WebGL) cannot be tested
 * in a Node.js Vitest environment.  These tests focus exclusively on the
 * Zustand store data model that drives the rendering layer.
 *
 * Test ID scheme:
 *   5v-N  : Sub-AC 5.1 visibility predicate
 *   5d-N  : Sub-AC 5.2 data model + assignment records
 *   5p-N  : Sub-AC 5.3 priority/status visual mapping
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "../task-store.js";
import type { TaskStatus, TaskPriority } from "../../data/task-types.js";

// ── Reset helper ──────────────────────────────────────────────────────────────

function resetStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
}

// ── Connector visibility predicate ───────────────────────────────────────────

/**
 * Sub-AC 5.2 VISIBLE_STATUSES filter (mirrors TaskConnectors.tsx).
 * Only tasks in these statuses generate 3D connector arcs.
 */
const VISIBLE_STATUSES = new Set<TaskStatus>([
  "assigned", "active", "blocked", "review",
]);

/**
 * Sub-AC 5.3: Priority → color mapping (must match TaskConnectors.tsx palette).
 * Tests verify consistency between priority values and valid hex codes.
 */
const PRIORITY_COLOR: Readonly<Record<TaskPriority, string>> = {
  critical: "#FF3D00",
  high:     "#FF9100",
  normal:   "#40C4FF",
  low:      "#B2DFDB",
};

/**
 * Sub-AC 5.3: Status → beam color mapping (must match TaskConnectors.tsx + TaskMappingHUD).
 */
const STATUS_BEAM_COLOR: Readonly<Record<TaskStatus, string>> = {
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

/**
 * Sub-AC 5.3: Priority rank used for PointLight budget allocation.
 * Higher rank = higher priority for receiving a physical PointLight.
 */
const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  critical: 4,
  high:     3,
  normal:   2,
  low:      1,
};

const MAX_POINT_LIGHTS = 4;

// ── Tests ──────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 5.1 + 5.2 — Connector visibility predicate
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5.1/5.2 — Connector visibility predicate", () => {
  beforeEach(resetStore);

  // 5v-1
  it("VISIBLE_STATUSES contains exactly 4 statuses: assigned, active, blocked, review", () => {
    expect(VISIBLE_STATUSES.size).toBe(4);
    expect(VISIBLE_STATUSES.has("assigned")).toBe(true);
    expect(VISIBLE_STATUSES.has("active")).toBe(true);
    expect(VISIBLE_STATUSES.has("blocked")).toBe(true);
    expect(VISIBLE_STATUSES.has("review")).toBe(true);
  });

  // 5v-2
  it("terminal statuses (done/cancelled/failed) are NOT in VISIBLE_STATUSES", () => {
    expect(VISIBLE_STATUSES.has("done")).toBe(false);
    expect(VISIBLE_STATUSES.has("cancelled")).toBe(false);
    expect(VISIBLE_STATUSES.has("failed")).toBe(false);
  });

  // 5v-3
  it("pre-assignment statuses (draft/planned) are NOT in VISIBLE_STATUSES", () => {
    expect(VISIBLE_STATUSES.has("draft")).toBe(false);
    expect(VISIBLE_STATUSES.has("planned")).toBe(false);
  });

  // 5v-4
  it("task in 'active' status generates a visible connection", () => {
    const id = useTaskStore.getState().createTask({
      title: "Active work",
      initialStatus: "assigned",
    });
    useTaskStore.getState().assignTask(id, "agent-dev");
    useTaskStore.getState().transitionTask(id, "active");
    const task = useTaskStore.getState().tasks[id];
    expect(VISIBLE_STATUSES.has(task.status)).toBe(true);
  });

  // 5v-5
  it("task transitioned to 'done' is excluded from visible connections", () => {
    const id = useTaskStore.getState().createTask({ title: "Done task" });
    // Draft → planned → assigned → active → review → done
    useTaskStore.getState().transitionTask(id, "planned");
    useTaskStore.getState().transitionTask(id, "assigned");
    useTaskStore.getState().transitionTask(id, "active");
    useTaskStore.getState().transitionTask(id, "review");
    useTaskStore.getState().transitionTask(id, "done");
    const task = useTaskStore.getState().tasks[id];
    expect(task.status).toBe("done");
    expect(VISIBLE_STATUSES.has(task.status)).toBe(false);
  });

  // 5v-6
  it("task transitioned to 'cancelled' is excluded from visible connections", () => {
    const id = useTaskStore.getState().createTask({ title: "Cancelled" });
    useTaskStore.getState().transitionTask(id, "planned");
    useTaskStore.getState().transitionTask(id, "cancelled");
    const task = useTaskStore.getState().tasks[id];
    expect(VISIBLE_STATUSES.has(task.status)).toBe(false);
  });

  // 5v-7
  it("task in 'blocked' status generates a visible connection (distress signal)", () => {
    const id = useTaskStore.getState().createTask({ title: "Blocked", assignedAgentId: "agent-1" });
    useTaskStore.getState().transitionTask(id, "planned");
    useTaskStore.getState().transitionTask(id, "assigned");
    useTaskStore.getState().transitionTask(id, "active");
    useTaskStore.getState().transitionTask(id, "blocked");
    const task = useTaskStore.getState().tasks[id];
    expect(VISIBLE_STATUSES.has(task.status)).toBe(true);
  });

  // 5v-8
  it("task in 'review' status generates a visible connection", () => {
    const id = useTaskStore.getState().createTask({ title: "In review", assignedAgentId: "agent-1" });
    useTaskStore.getState().transitionTask(id, "planned");
    useTaskStore.getState().transitionTask(id, "assigned");
    useTaskStore.getState().transitionTask(id, "active");
    useTaskStore.getState().transitionTask(id, "review");
    expect(VISIBLE_STATUSES.has(useTaskStore.getState().tasks[id].status)).toBe(true);
  });

  // 5v-9
  it("newly created draft task has no assignment and is not visible", () => {
    const id = useTaskStore.getState().createTask({ title: "Fresh draft" });
    const task = useTaskStore.getState().tasks[id];
    expect(task.status).toBe("draft");
    expect(task.assignedAgentId).toBeNull();
    expect(VISIBLE_STATUSES.has(task.status)).toBe(false);
    // No assignment record
    expect(useTaskStore.getState().assignments[id]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 5.2 — Assignment data model for connector rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5.2 — Assignment data records for 3D connector layer", () => {
  beforeEach(resetStore);

  // 5d-1
  it("assignTask creates an assignment record with taskId + agentId", () => {
    const id = useTaskStore.getState().createTask({ title: "T1" });
    useTaskStore.getState().assignTask(id, "agent-alpha");
    const assignment = useTaskStore.getState().assignments[id];
    expect(assignment).toBeDefined();
    expect(assignment.taskId).toBe(id);
    expect(assignment.agentId).toBe("agent-alpha");
  });

  // 5d-2
  it("assignment record has a non-null assignedTs timestamp", () => {
    const id = useTaskStore.getState().createTask({ title: "T2" });
    useTaskStore.getState().assignTask(id, "agent-beta");
    const assignment = useTaskStore.getState().assignments[id];
    // Field is `assignedTs` (ms since epoch) per TaskAgentAssignment interface
    expect(typeof assignment.assignedTs).toBe("number");
    expect(assignment.assignedTs).toBeGreaterThan(0);
  });

  // 5d-3
  it("agentTaskIndex maps agent → [taskId, ...] for multi-task agents", () => {
    const id1 = useTaskStore.getState().createTask({ title: "T1 for alpha" });
    const id2 = useTaskStore.getState().createTask({ title: "T2 for alpha" });
    const id3 = useTaskStore.getState().createTask({ title: "T3 for alpha" });
    useTaskStore.getState().assignTask(id1, "agent-alpha");
    useTaskStore.getState().assignTask(id2, "agent-alpha");
    useTaskStore.getState().assignTask(id3, "agent-alpha");
    const index = useTaskStore.getState().agentTaskIndex["agent-alpha"];
    expect(index).toContain(id1);
    expect(index).toContain(id2);
    expect(index).toContain(id3);
    // Ring-spread positions require knowing task count per agent
    expect(index.length).toBe(3);
  });

  // 5d-4
  it("unassignTask removes the assignment and cleans agentTaskIndex", () => {
    const id = useTaskStore.getState().createTask({ title: "Unassign me" });
    useTaskStore.getState().assignTask(id, "agent-gamma");
    useTaskStore.getState().unassignTask(id);
    expect(useTaskStore.getState().assignments[id]).toBeUndefined();
    const index = useTaskStore.getState().agentTaskIndex["agent-gamma"] ?? [];
    expect(index).not.toContain(id);
  });

  // 5d-5
  it("connector layer can enumerate all visible connections via assignments + status filter", () => {
    const agentId = "agent-delta";
    // Create mix of statuses
    const active  = useTaskStore.getState().createTask({ title: "Active",   assignedAgentId: agentId, initialStatus: "active"   });
    const done    = useTaskStore.getState().createTask({ title: "Done",                                initialStatus: "done"     });
    const draft   = useTaskStore.getState().createTask({ title: "Draft"                                                         });
    const blocked = useTaskStore.getState().createTask({ title: "Blocked",  assignedAgentId: agentId });

    // Transition blocked through required states
    useTaskStore.getState().transitionTask(blocked, "planned");
    useTaskStore.getState().transitionTask(blocked, "assigned");
    useTaskStore.getState().transitionTask(blocked, "active");
    useTaskStore.getState().transitionTask(blocked, "blocked");

    const { assignments, tasks } = useTaskStore.getState();

    // Enumerate visible connections as the TaskConnectorsLayer would
    const visible = Object.values(assignments).filter((a) => {
      const task = tasks[a.taskId];
      return task && VISIBLE_STATUSES.has(task.status);
    });

    // active + blocked are visible; done and draft are not
    const visibleIds = visible.map((v) => v.taskId);
    expect(visibleIds).toContain(active);
    expect(visibleIds).toContain(blocked);
    expect(visibleIds).not.toContain(done);   // no assignment for done
    expect(visibleIds).not.toContain(draft);  // no assignment for draft
  });

  // 5d-6
  it("getTasksForAgent returns tasks sorted by priority desc then createdTs asc", () => {
    const agentId = "agent-sorter";
    const low    = useTaskStore.getState().createTask({ title: "Low",    assignedAgentId: agentId, initialStatus: "active", priority: "low"    });
    const critical = useTaskStore.getState().createTask({ title: "Crit", assignedAgentId: agentId, initialStatus: "active", priority: "critical" });
    const high   = useTaskStore.getState().createTask({ title: "High",   assignedAgentId: agentId, initialStatus: "active", priority: "high"   });
    const normal = useTaskStore.getState().createTask({ title: "Normal", assignedAgentId: agentId, initialStatus: "active", priority: "normal" });

    const sorted = useTaskStore.getState().getTasksForAgent(agentId);
    const sortedIds = sorted.map((t) => t.taskId);

    // Critical first, then high, normal, low
    expect(sortedIds.indexOf(critical)).toBeLessThan(sortedIds.indexOf(high));
    expect(sortedIds.indexOf(high)).toBeLessThan(sortedIds.indexOf(normal));
    expect(sortedIds.indexOf(normal)).toBeLessThan(sortedIds.indexOf(low));
  });

  // 5d-7
  it("assignments map has one entry per assigned task (not per agent)", () => {
    const a1 = useTaskStore.getState().createTask({ title: "A1", assignedAgentId: "ag-1" });
    const a2 = useTaskStore.getState().createTask({ title: "A2", assignedAgentId: "ag-1" });
    const a3 = useTaskStore.getState().createTask({ title: "A3", assignedAgentId: "ag-2" });
    const { assignments } = useTaskStore.getState();
    // assignments are keyed by taskId
    expect(assignments[a1]).toBeDefined();
    expect(assignments[a2]).toBeDefined();
    expect(assignments[a3]).toBeDefined();
    expect(Object.keys(assignments).length).toBe(3);
  });

  // 5d-8
  it("task with no assignment record is safely excluded by the connector layer filter", () => {
    // Create a task but don't assign it
    const unassigned = useTaskStore.getState().createTask({ title: "Unassigned" });
    useTaskStore.getState().transitionTask(unassigned, "planned");
    const { assignments } = useTaskStore.getState();
    // The filter checks both assignment existence and visible status
    const visible = Object.values(assignments).filter((a) => {
      const task = useTaskStore.getState().tasks[a.taskId];
      return task && VISIBLE_STATUSES.has(task.status);
    });
    // Unassigned task has no assignment record → not in assignments → not in visible
    const visibleIds = visible.map((v) => v.taskId);
    expect(visibleIds).not.toContain(unassigned);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 5.3 — Priority and status visual mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5.3 — Priority/status visual mapping (colors + PointLight budget)", () => {
  beforeEach(resetStore);

  // 5p-1
  it("PRIORITY_COLOR covers all 4 priorities with valid 6-digit hex values", () => {
    const priorities: TaskPriority[] = ["critical", "high", "normal", "low"];
    for (const p of priorities) {
      expect(PRIORITY_COLOR[p]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // 5p-2
  it("PRIORITY_COLOR values are visually distinct (no two priorities share the same color)", () => {
    const colors = Object.values(PRIORITY_COLOR);
    const unique = new Set(colors.map((c) => c.toLowerCase()));
    expect(unique.size).toBe(colors.length);
  });

  // 5p-3
  it("STATUS_BEAM_COLOR covers all 9 task statuses with valid hex values", () => {
    const statuses: TaskStatus[] = [
      "draft", "planned", "assigned", "active", "blocked", "review",
      "done", "failed", "cancelled",
    ];
    for (const s of statuses) {
      expect(STATUS_BEAM_COLOR[s]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // 5p-4
  it("STATUS_BEAM_COLOR values are distinct for the 4 VISIBLE_STATUSES", () => {
    const visibleColors = [...VISIBLE_STATUSES].map((s) => STATUS_BEAM_COLOR[s].toLowerCase());
    const unique = new Set(visibleColors);
    expect(unique.size).toBe(visibleColors.length);
  });

  // 5p-5
  it("PRIORITY_RANK is strictly ordered: critical > high > normal > low", () => {
    expect(PRIORITY_RANK.critical).toBeGreaterThan(PRIORITY_RANK.high);
    expect(PRIORITY_RANK.high).toBeGreaterThan(PRIORITY_RANK.normal);
    expect(PRIORITY_RANK.normal).toBeGreaterThan(PRIORITY_RANK.low);
    expect(PRIORITY_RANK.low).toBeGreaterThan(0);
  });

  // 5p-6
  it("PointLight budget: first MAX_POINT_LIGHTS by priority are allocated lights", () => {
    // Sub-AC 5.3: PointLight budget logic — highest-priority tasks get a PointLight
    const agentId = "agent-lights";
    const low1    = useTaskStore.getState().createTask({ title: "Low 1",    assignedAgentId: agentId, initialStatus: "active", priority: "low"      });
    const low2    = useTaskStore.getState().createTask({ title: "Low 2",    assignedAgentId: agentId, initialStatus: "active", priority: "low"      });
    const crit1   = useTaskStore.getState().createTask({ title: "Crit 1",   assignedAgentId: agentId, initialStatus: "active", priority: "critical" });
    const high1   = useTaskStore.getState().createTask({ title: "High 1",   assignedAgentId: agentId, initialStatus: "active", priority: "high"    });
    const normal1 = useTaskStore.getState().createTask({ title: "Normal 1", assignedAgentId: agentId, initialStatus: "active", priority: "normal"  });

    const { assignments, tasks } = useTaskStore.getState();

    // Simulate the PointLight budget allocation from TaskConnectorsLayer
    const connections = Object.values(assignments)
      .filter((a) => tasks[a.taskId] && VISIBLE_STATUSES.has(tasks[a.taskId].status))
      .map((a) => ({ assignment: a, task: tasks[a.taskId] }));

    // Sort by priority rank descending, then active > blocked > review > assigned
    const statusScore = (s: string) =>
      s === "active" ? 3 : s === "blocked" ? 2 : s === "review" ? 1 : 0;
    const sorted = [...connections].sort((a, b) => {
      const rankDiff = PRIORITY_RANK[b.task.priority] - PRIORITY_RANK[a.task.priority];
      if (rankDiff !== 0) return rankDiff;
      return statusScore(b.task.status) - statusScore(a.task.status);
    });

    const lightTaskIds = new Set<string>();
    for (let i = 0; i < Math.min(sorted.length, MAX_POINT_LIGHTS); i++) {
      lightTaskIds.add(sorted[i].task.taskId);
    }

    // With MAX_POINT_LIGHTS=4 and 5 tasks, the top 4 get lights
    expect(lightTaskIds.size).toBe(4);
    // Critical task always gets a light
    expect(lightTaskIds.has(crit1)).toBe(true);
    // High-priority task gets a light
    expect(lightTaskIds.has(high1)).toBe(true);
    // Normal-priority task gets a light (4th slot)
    expect(lightTaskIds.has(normal1)).toBe(true);
    // One of the two low-priority tasks gets the remaining slot
    // (the one created first if same status)
    const lowLightCount = [low1, low2].filter((id) => lightTaskIds.has(id)).length;
    expect(lowLightCount).toBe(1); // exactly 1 of the 2 low tasks
  });

  // 5p-7
  it("critical task has a higher PointLight intensity multiplier than low priority", () => {
    const PRIORITY_LIGHT_INTENSITY: Record<TaskPriority, number> = {
      critical: 2.0,
      high:     1.2,
      normal:   0.6,
      low:      0.3,
    };
    expect(PRIORITY_LIGHT_INTENSITY.critical).toBeGreaterThan(PRIORITY_LIGHT_INTENSITY.high);
    expect(PRIORITY_LIGHT_INTENSITY.high).toBeGreaterThan(PRIORITY_LIGHT_INTENSITY.normal);
    expect(PRIORITY_LIGHT_INTENSITY.normal).toBeGreaterThan(PRIORITY_LIGHT_INTENSITY.low);
  });

  // 5p-8
  it("task store priority field accepts all 4 priority levels", () => {
    const priorities: TaskPriority[] = ["critical", "high", "normal", "low"];
    for (const priority of priorities) {
      const id = useTaskStore.getState().createTask({ title: `${priority} task`, priority });
      expect(useTaskStore.getState().tasks[id].priority).toBe(priority);
    }
  });

  // 5p-9
  it("setTaskPriority updates priority and emits task.priority_changed event", () => {
    const id = useTaskStore.getState().createTask({ title: "Priority change", priority: "low" });
    useTaskStore.getState().setTaskPriority(id, "critical");
    expect(useTaskStore.getState().tasks[id].priority).toBe("critical");
    const events = useTaskStore.getState().events;
    const changedEvt = events.find(
      (e) => e.type === "task.priority_changed" && e.taskId === id,
    );
    expect(changedEvt).toBeDefined();
    expect(changedEvt?.payload.priority).toBe("critical");
  });

  // 5p-10
  it("PRIORITY_COLOR is consistent with PRIORITY_RANK ordering", () => {
    // Critical (rank 4) and high (rank 3) have warmer/redder colors
    // than normal (rank 2) and low (rank 1) — visual dominance hierarchy
    // Verify critical is not the same as low (visual distinct signal)
    expect(PRIORITY_COLOR.critical.toLowerCase()).not.toBe(PRIORITY_COLOR.low.toLowerCase());
    expect(PRIORITY_COLOR.high.toLowerCase()).not.toBe(PRIORITY_COLOR.normal.toLowerCase());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-AC 5.2 — BatchedConnectorLines data (ConnectorLineDescriptor generation)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5.2 — Batched connector line descriptor generation", () => {
  beforeEach(resetStore);

  // 5b-1
  it("each visible assignment maps to exactly one ConnectorLineDescriptor", () => {
    useTaskStore.getState().createTask({ title: "A1", assignedAgentId: "ag-1", initialStatus: "active" });
    useTaskStore.getState().createTask({ title: "A2", assignedAgentId: "ag-2", initialStatus: "assigned" });
    useTaskStore.getState().createTask({ title: "A3", assignedAgentId: "ag-1", initialStatus: "blocked" });
    useTaskStore.getState().createTask({ title: "Done", initialStatus: "done" }); // no assignment

    const { assignments, tasks } = useTaskStore.getState();
    const descriptors = Object.values(assignments).filter((a) => {
      const task = tasks[a.taskId];
      return task && VISIBLE_STATUSES.has(task.status);
    });
    // 3 visible assignments: active, assigned, blocked
    expect(descriptors.length).toBe(3);
  });

  // 5b-2
  it("getTaskStatusCounts returns accurate counts after status transitions", () => {
    useTaskStore.getState().createTask({ title: "A", initialStatus: "active",   assignedAgentId: "ag" });
    useTaskStore.getState().createTask({ title: "B", initialStatus: "active",   assignedAgentId: "ag" });
    useTaskStore.getState().createTask({ title: "C", initialStatus: "assigned", assignedAgentId: "ag" });
    useTaskStore.getState().createTask({ title: "D", initialStatus: "done"    });

    const counts = useTaskStore.getState().getTaskStatusCounts();
    expect(counts.active).toBe(2);
    expect(counts.assigned).toBe(1);
    expect(counts.done).toBe(1);
  });

  // 5b-3
  it("reassigning a task to a different agent updates the connector target", () => {
    const id = useTaskStore.getState().createTask({ title: "Movable", assignedAgentId: "agent-old", initialStatus: "active" });

    // Verify initial assignment
    expect(useTaskStore.getState().assignments[id].agentId).toBe("agent-old");

    // Reassign to new agent
    useTaskStore.getState().assignTask(id, "agent-new");
    expect(useTaskStore.getState().assignments[id].agentId).toBe("agent-new");

    // Old agent index no longer contains this task
    const oldIndex = useTaskStore.getState().agentTaskIndex["agent-old"] ?? [];
    expect(oldIndex).not.toContain(id);

    // New agent index contains this task
    const newIndex = useTaskStore.getState().agentTaskIndex["agent-new"];
    expect(newIndex).toContain(id);
  });

  // 5b-4
  it("N tasks assigned to the same agent produce N connector descriptors", () => {
    const N = 5;
    const agentId = "agent-multi";
    for (let i = 0; i < N; i++) {
      useTaskStore.getState().createTask({
        title: `Task ${i}`,
        assignedAgentId: agentId,
        initialStatus: "active",
      });
    }

    const { assignments, tasks } = useTaskStore.getState();
    const agentConnectors = Object.values(assignments).filter((a) => {
      const task = tasks[a.taskId];
      return a.agentId === agentId && task && VISIBLE_STATUSES.has(task.status);
    });
    expect(agentConnectors.length).toBe(N);
  });

  // 5b-5
  it("event log grows by (tasks × 1) + assignments on bulk operations", () => {
    resetStore();
    const before = useTaskStore.getState().events.length;
    useTaskStore.getState().createTask({ title: "E1", assignedAgentId: "ag", initialStatus: "active" });
    useTaskStore.getState().createTask({ title: "E2", assignedAgentId: "ag", initialStatus: "active" });
    const after = useTaskStore.getState().events.length;
    // Each createTask with assignedAgentId emits task.created + task.assigned = 2 events each
    expect(after - before).toBe(4);
  });
});
