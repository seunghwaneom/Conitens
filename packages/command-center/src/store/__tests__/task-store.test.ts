/**
 * task-store.test.ts — Unit tests for Sub-AC 5.1: task-agent mapping data model.
 *
 * Validates that:
 *  1. createTask generates a unique taskId and emits task.created event
 *  2. assignTask maps a task to an agent and builds the agentTaskIndex
 *  3. unassignTask removes the assignment and updates indexes
 *  4. transitionTask follows valid state machine transitions only
 *  5. Invalid transitions are rejected (returns false)
 *  6. setTaskPriority updates priority and emits event
 *  7. getTasksForAgent returns tasks sorted by priority desc then createdTs asc
 *  8. getTaskStatusCounts returns correct counts per status
 *  9. bulkLoadTasks replaces/adds tasks and rebuilds indexes
 * 10. deleteTask removes task and cleans up assignment index
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "../task-store.js";
import type { TaskStatus } from "../../data/task-types.js";

// ── Reset helper ───────────────────────────────────────────────────────────

function resetStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    events:         [],
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("task-store — Sub-AC 5.1", () => {
  beforeEach(resetStore);

  // ── 1. createTask ────────────────────────────────────────────────────────

  describe("createTask", () => {
    it("generates a unique taskId and stores the task", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "Task A" });
      const id2 = store.createTask({ title: "Task B" });
      expect(id1).toMatch(/^task-/);
      expect(id2).toMatch(/^task-/);
      expect(id1).not.toBe(id2);

      const { tasks } = useTaskStore.getState();
      expect(tasks[id1]).toBeDefined();
      expect(tasks[id1].title).toBe("Task A");
      expect(tasks[id2]).toBeDefined();
    });

    it("defaults to status=draft, priority=normal, assignedAgentId=null", () => {
      const id = useTaskStore.getState().createTask({ title: "Default task" });
      const task = useTaskStore.getState().tasks[id];
      expect(task.status).toBe("draft");
      expect(task.priority).toBe("normal");
      expect(task.assignedAgentId).toBeNull();
    });

    it("accepts an explicit initialStatus", () => {
      const id = useTaskStore.getState().createTask({
        title: "Planned task",
        initialStatus: "planned",
      });
      expect(useTaskStore.getState().tasks[id].status).toBe("planned");
    });

    it("emits a task.created event", () => {
      const id = useTaskStore.getState().createTask({ title: "Evt task" });
      const { events } = useTaskStore.getState();
      const created = events.find((e) => e.type === "task.created" && e.taskId === id);
      expect(created).toBeDefined();
      expect(created?.payload.title).toBe("Evt task");
    });

    it("also emits task.assigned when created with an agent", () => {
      const id = useTaskStore.getState().createTask({
        title: "Pre-assigned",
        assignedAgentId: "agent-1",
      });
      const { events } = useTaskStore.getState();
      const assigned = events.find(
        (e) => e.type === "task.assigned" && e.taskId === id,
      );
      expect(assigned).toBeDefined();
      expect(assigned?.payload.agent_id).toBe("agent-1");
    });
  });

  // ── 2. assignTask ────────────────────────────────────────────────────────

  describe("assignTask", () => {
    it("creates an assignment record and updates agentTaskIndex", () => {
      const store = useTaskStore.getState();
      const id = store.createTask({ title: "Assign me" });
      store.assignTask(id, "agent-42");

      const state = useTaskStore.getState();
      expect(state.assignments[id]).toBeDefined();
      expect(state.assignments[id].agentId).toBe("agent-42");
      expect(state.agentTaskIndex["agent-42"]).toContain(id);
    });

    it("reassigns from old agent to new agent, cleaning up old index entry", () => {
      const id = useTaskStore.getState().createTask({
        title: "Reassign",
        assignedAgentId: "agent-old",
      });
      useTaskStore.getState().assignTask(id, "agent-new");

      const state = useTaskStore.getState();
      expect(state.assignments[id].agentId).toBe("agent-new");
      expect(state.agentTaskIndex["agent-old"] ?? []).not.toContain(id);
      expect(state.agentTaskIndex["agent-new"]).toContain(id);
    });

    it("emits task.assigned event", () => {
      const id = useTaskStore.getState().createTask({ title: "Evt assign" });
      useTaskStore.getState().assignTask(id, "agent-x");
      const events = useTaskStore.getState().events;
      const ev = events.find(
        (e) => e.type === "task.assigned" && e.agentId === "agent-x",
      );
      expect(ev).toBeDefined();
    });
  });

  // ── 3. unassignTask ──────────────────────────────────────────────────────

  describe("unassignTask", () => {
    it("removes the assignment and clears agentTaskIndex entry", () => {
      const id = useTaskStore.getState().createTask({
        title: "Unassign me",
        assignedAgentId: "agent-a",
      });
      useTaskStore.getState().unassignTask(id);

      const state = useTaskStore.getState();
      expect(state.tasks[id].assignedAgentId).toBeNull();
      expect(state.assignments[id]).toBeUndefined();
      expect(state.agentTaskIndex["agent-a"] ?? []).not.toContain(id);
    });

    it("emits task.unassigned event", () => {
      const id = useTaskStore.getState().createTask({
        title: "Unassign evt",
        assignedAgentId: "agent-b",
      });
      useTaskStore.getState().unassignTask(id);
      const ev = useTaskStore
        .getState()
        .events.find((e) => e.type === "task.unassigned" && e.taskId === id);
      expect(ev).toBeDefined();
    });
  });

  // ── 4. transitionTask (valid transitions) ────────────────────────────────

  describe("transitionTask — valid", () => {
    it("transitions draft → planned → assigned → active", () => {
      const id = useTaskStore.getState().createTask({ title: "Pipeline" });
      expect(useTaskStore.getState().transitionTask(id, "planned")).toBe(true);
      expect(useTaskStore.getState().tasks[id].status).toBe("planned");

      expect(useTaskStore.getState().transitionTask(id, "assigned")).toBe(true);
      expect(useTaskStore.getState().tasks[id].status).toBe("assigned");

      expect(useTaskStore.getState().transitionTask(id, "active")).toBe(true);
      const task = useTaskStore.getState().tasks[id];
      expect(task.status).toBe("active");
      expect(task.startedTs).not.toBeNull();
    });

    it("sets completedTs when reaching a terminal state", () => {
      const id = useTaskStore.getState().createTask({ title: "To done", initialStatus: "review" });
      expect(useTaskStore.getState().transitionTask(id, "done")).toBe(true);
      expect(useTaskStore.getState().tasks[id].completedTs).not.toBeNull();
    });

    it("emits task.status_changed event on each transition", () => {
      const id = useTaskStore.getState().createTask({ title: "Evt trans" });
      useTaskStore.getState().transitionTask(id, "planned");
      const ev = useTaskStore
        .getState()
        .events.find(
          (e) =>
            e.type === "task.status_changed" &&
            e.taskId === id &&
            e.payload.prev_status === "draft" &&
            e.payload.status === "planned",
        );
      expect(ev).toBeDefined();
    });
  });

  // ── 5. transitionTask (invalid transitions) ──────────────────────────────

  describe("transitionTask — invalid", () => {
    it("rejects invalid transitions and returns false", () => {
      const id = useTaskStore.getState().createTask({ title: "Guard" });
      // draft → active is not a valid transition
      expect(useTaskStore.getState().transitionTask(id, "active")).toBe(false);
      expect(useTaskStore.getState().tasks[id].status).toBe("draft");
    });

    it("returns false for unknown task IDs", () => {
      expect(useTaskStore.getState().transitionTask("nonexistent-id", "planned")).toBe(false);
    });
  });

  // ── 6. setTaskPriority ───────────────────────────────────────────────────

  describe("setTaskPriority", () => {
    it("updates the priority on the task record", () => {
      const id = useTaskStore.getState().createTask({ title: "Prio task" });
      useTaskStore.getState().setTaskPriority(id, "critical");
      expect(useTaskStore.getState().tasks[id].priority).toBe("critical");
    });

    it("updates the cached priority in the assignment record", () => {
      const id = useTaskStore.getState().createTask({
        title: "Prio assign",
        assignedAgentId: "agent-p",
      });
      useTaskStore.getState().setTaskPriority(id, "high");
      expect(useTaskStore.getState().assignments[id].priority).toBe("high");
    });

    it("emits task.priority_changed event", () => {
      const id = useTaskStore.getState().createTask({ title: "Prio evt" });
      useTaskStore.getState().setTaskPriority(id, "low");
      const ev = useTaskStore
        .getState()
        .events.find((e) => e.type === "task.priority_changed" && e.taskId === id);
      expect(ev).toBeDefined();
      expect(ev?.payload.priority).toBe("low");
    });
  });

  // ── 7. getTasksForAgent ──────────────────────────────────────────────────

  describe("getTasksForAgent", () => {
    it("returns tasks sorted by priority desc then createdTs asc", () => {
      const { createTask, assignTask, getTasksForAgent } = useTaskStore.getState();
      const lowId    = createTask({ title: "Low",    priority: "low" });
      const highId   = createTask({ title: "High",   priority: "high" });
      const critId   = createTask({ title: "Crit",   priority: "critical" });
      const normalId = createTask({ title: "Normal", priority: "normal" });

      for (const id of [lowId, highId, critId, normalId]) {
        useTaskStore.getState().assignTask(id, "agent-sort");
      }

      const sorted = useTaskStore.getState().getTasksForAgent("agent-sort");
      expect(sorted.map((t) => t.priority)).toEqual([
        "critical", "high", "normal", "low",
      ]);
    });

    it("returns empty array for unknown agent", () => {
      expect(useTaskStore.getState().getTasksForAgent("ghost-agent")).toEqual([]);
    });
  });

  // ── 8. getTaskStatusCounts ───────────────────────────────────────────────

  describe("getTaskStatusCounts", () => {
    it("returns accurate counts per status", () => {
      const { createTask, transitionTask } = useTaskStore.getState();
      createTask({ title: "D1" }); // draft
      createTask({ title: "D2" }); // draft

      const p1 = createTask({ title: "P1" });
      useTaskStore.getState().transitionTask(p1, "planned");

      const counts = useTaskStore.getState().getTaskStatusCounts();
      expect(counts.draft).toBe(2);
      expect(counts.planned).toBe(1);
    });
  });

  // ── 9. bulkLoadTasks ─────────────────────────────────────────────────────

  describe("bulkLoadTasks", () => {
    it("loads tasks and rebuilds assignment indexes", () => {
      const now = Date.now();
      useTaskStore.getState().bulkLoadTasks([
        {
          taskId:         "bulk-1",
          title:          "Bulk task 1",
          status:         "active",
          priority:       "high",
          assignedAgentId: "agent-bulk",
          createdTs:      now,
          updatedTs:      now,
          startedTs:      now,
          completedTs:    null,
          parentTaskId:   null,
          tags:           [],
          eventIds:       [],
        },
        {
          taskId:         "bulk-2",
          title:          "Bulk task 2",
          status:         "draft",
          priority:       "normal",
          assignedAgentId: null,
          createdTs:      now,
          updatedTs:      now,
          startedTs:      null,
          completedTs:    null,
          parentTaskId:   null,
          tags:           [],
          eventIds:       [],
        },
      ]);

      const state = useTaskStore.getState();
      expect(state.tasks["bulk-1"]).toBeDefined();
      expect(state.tasks["bulk-2"]).toBeDefined();
      expect(state.assignments["bulk-1"].agentId).toBe("agent-bulk");
      expect(state.agentTaskIndex["agent-bulk"]).toContain("bulk-1");
      // bulk-2 is draft + unassigned — should not be in assignments
      expect(state.assignments["bulk-2"]).toBeUndefined();
    });

    it("emits tasks.bulk_loaded event", () => {
      useTaskStore.getState().bulkLoadTasks([
        {
          taskId: "bulk-ev", title: "Evt", status: "draft", priority: "normal",
          assignedAgentId: null, createdTs: 0, updatedTs: 0,
          startedTs: null, completedTs: null, parentTaskId: null,
          tags: [], eventIds: [],
        },
      ]);
      const ev = useTaskStore
        .getState()
        .events.find((e) => e.type === "tasks.bulk_loaded");
      expect(ev).toBeDefined();
      expect(ev?.payload.count).toBe(1);
    });
  });

  // ── 10. deleteTask ────────────────────────────────────────────────────────

  describe("deleteTask", () => {
    it("removes the task record and cleans up assignment index", () => {
      const id = useTaskStore.getState().createTask({
        title: "Delete me",
        assignedAgentId: "agent-del",
      });

      useTaskStore.getState().deleteTask(id);

      const state = useTaskStore.getState();
      expect(state.tasks[id]).toBeUndefined();
      expect(state.assignments[id]).toBeUndefined();
      expect(state.agentTaskIndex["agent-del"] ?? []).not.toContain(id);
    });

    it("emits task.deleted event", () => {
      const id = useTaskStore.getState().createTask({ title: "Del evt" });
      useTaskStore.getState().deleteTask(id);
      const ev = useTaskStore
        .getState()
        .events.find((e) => e.type === "task.deleted" && e.taskId === id);
      expect(ev).toBeDefined();
    });
  });
});
