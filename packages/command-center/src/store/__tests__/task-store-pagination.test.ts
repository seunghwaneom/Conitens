/**
 * task-store-pagination.test.ts — Unit tests for Sub-AC 15b.
 *
 * Validates scalable task storage and management:
 *  1. tagIndex is built correctly on createTask
 *  2. tagIndex is updated on setTaskTags (remove old, add new)
 *  3. tagIndex is cleaned up on deleteTask
 *  4. tagIndex is rebuilt on bulkLoadTasks
 *  5. getTasksByTag returns correct tasks via tagIndex
 *  6. getAllTags returns all unique tags sorted
 *  7. filterTasks — status filter (single + multi)
 *  8. filterTasks — priority filter
 *  9. filterTasks — agentId filter (including __unassigned__)
 * 10. filterTasks — tag filter (AND semantics)
 * 11. filterTasks — searchText (title + description)
 * 12. filterTasks — includeTerminal flag
 * 13. filterTasks — parentTaskId filter
 * 14. filterTasks — combined multi-criteria filter
 * 15. getTasksPaginated — basic pagination (page 0, page 1)
 * 16. getTasksPaginated — page clamping (page out of range)
 * 17. getTasksPaginated — custom pageSize
 * 18. getTasksPaginated — accurate totalCount / filteredCount / totalPages
 * 19. getTasksPaginated — works with 100 tasks at expected performance
 * 20. filterTasks — sorts by priority desc then createdTs asc
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "../task-store.js";
import type { TaskStatus, TaskPriority, TaskRecord } from "../../data/task-types.js";

// ── Reset helper ────────────────────────────────────────────────────────────

function resetStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
}

// ── Bulk creation helper ─────────────────────────────────────────────────────

function createNTasks(
  n: number,
  overrides: Partial<{
    priority: TaskPriority;
    status: TaskStatus;
    agentId: string | null;
    tags: string[];
    prefix: string;
  }> = {},
): string[] {
  const ids: string[] = [];
  const store = useTaskStore.getState();
  for (let i = 0; i < n; i++) {
    const id = store.createTask({
      title:          `${overrides.prefix ?? "Task"} ${i + 1}`,
      priority:       overrides.priority ?? "normal",
      initialStatus:  overrides.status ?? "draft",
      assignedAgentId: overrides.agentId ?? null,
      tags:           overrides.tags ?? [],
    });
    ids.push(id);
  }
  return ids;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("task-store-pagination — Sub-AC 15b", () => {
  beforeEach(resetStore);

  // ── 1. tagIndex on createTask ─────────────────────────────────────────────

  describe("tagIndex — createTask", () => {
    it("adds taskId to each tag's entry on createTask", () => {
      const store = useTaskStore.getState();
      const id = store.createTask({ title: "Tagged", tags: ["frontend", "perf"] });

      const { tagIndex } = useTaskStore.getState();
      expect(tagIndex["frontend"]).toContain(id);
      expect(tagIndex["perf"]).toContain(id);
    });

    it("does not add empty tags to tagIndex", () => {
      const id = useTaskStore.getState().createTask({ title: "No tags" });
      const { tagIndex } = useTaskStore.getState();
      // tagIndex should remain empty for this task
      expect(Object.keys(tagIndex)).toHaveLength(0);
      expect(id).toMatch(/^task-/); // just check id was returned
    });

    it("handles multiple tasks sharing a tag", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "T1", tags: ["shared"] });
      const id2 = store.createTask({ title: "T2", tags: ["shared"] });

      const { tagIndex } = useTaskStore.getState();
      expect(tagIndex["shared"]).toContain(id1);
      expect(tagIndex["shared"]).toContain(id2);
      expect(tagIndex["shared"]).toHaveLength(2);
    });
  });

  // ── 2. tagIndex on setTaskTags ────────────────────────────────────────────

  describe("tagIndex — setTaskTags", () => {
    it("removes old tags and adds new tags", () => {
      const id = useTaskStore.getState().createTask({
        title: "Retag",
        tags:  ["alpha", "beta"],
      });

      useTaskStore.getState().setTaskTags(id, ["beta", "gamma"]);
      const { tagIndex } = useTaskStore.getState();

      expect(tagIndex["alpha"]).toBeUndefined(); // alpha removed and pruned
      expect(tagIndex["beta"]).toContain(id);    // beta retained
      expect(tagIndex["gamma"]).toContain(id);   // gamma added
    });

    it("prunes empty tag entries after removing all tasks from a tag", () => {
      const id = useTaskStore.getState().createTask({
        title: "Prune me",
        tags:  ["solo"],
      });

      useTaskStore.getState().setTaskTags(id, []);
      const { tagIndex } = useTaskStore.getState();
      expect(tagIndex["solo"]).toBeUndefined(); // key should be deleted
    });
  });

  // ── 3. tagIndex on deleteTask ─────────────────────────────────────────────

  describe("tagIndex — deleteTask", () => {
    it("removes taskId from all tag entries when task is deleted", () => {
      const id = useTaskStore.getState().createTask({
        title: "Delete tagged",
        tags:  ["x", "y"],
      });

      useTaskStore.getState().deleteTask(id);
      const { tagIndex } = useTaskStore.getState();

      expect(tagIndex["x"]).toBeUndefined();
      expect(tagIndex["y"]).toBeUndefined();
    });

    it("does not affect other tasks sharing a tag", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "T1", tags: ["shared"] });
      const id2 = store.createTask({ title: "T2", tags: ["shared"] });

      useTaskStore.getState().deleteTask(id1);
      const { tagIndex } = useTaskStore.getState();

      expect(tagIndex["shared"]).toContain(id2);
      expect(tagIndex["shared"]).not.toContain(id1);
    });
  });

  // ── 4. tagIndex on bulkLoadTasks ──────────────────────────────────────────

  describe("tagIndex — bulkLoadTasks", () => {
    it("rebuilds tagIndex from all loaded tasks", () => {
      const now = Date.now();
      useTaskStore.getState().bulkLoadTasks([
        {
          taskId: "b1", title: "Bulk 1", status: "draft", priority: "normal",
          assignedAgentId: null, createdTs: now, updatedTs: now,
          startedTs: null, completedTs: null, parentTaskId: null,
          tags: ["bulk", "frontend"], eventIds: [],
        },
        {
          taskId: "b2", title: "Bulk 2", status: "draft", priority: "high",
          assignedAgentId: null, createdTs: now, updatedTs: now,
          startedTs: null, completedTs: null, parentTaskId: null,
          tags: ["bulk", "backend"], eventIds: [],
        },
      ]);

      const { tagIndex } = useTaskStore.getState();
      expect(tagIndex["bulk"]).toContain("b1");
      expect(tagIndex["bulk"]).toContain("b2");
      expect(tagIndex["frontend"]).toContain("b1");
      expect(tagIndex["backend"]).toContain("b2");
    });
  });

  // ── 5. getTasksByTag ──────────────────────────────────────────────────────

  describe("getTasksByTag", () => {
    it("returns tasks with a given tag using the tagIndex", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "A", tags: ["foo"] });
      const id2 = store.createTask({ title: "B", tags: ["foo", "bar"] });
      store.createTask({ title: "C", tags: ["bar"] }); // not in "foo"

      const result = useTaskStore.getState().getTasksByTag("foo");
      const resultIds = result.map((t) => t.taskId);
      expect(resultIds).toContain(id1);
      expect(resultIds).toContain(id2);
      expect(result).toHaveLength(2);
    });

    it("returns empty array for unknown tag", () => {
      expect(useTaskStore.getState().getTasksByTag("nonexistent")).toHaveLength(0);
    });
  });

  // ── 6. getAllTags ─────────────────────────────────────────────────────────

  describe("getAllTags", () => {
    it("returns all unique tags sorted alphabetically", () => {
      const store = useTaskStore.getState();
      store.createTask({ title: "T1", tags: ["zebra", "alpha"] });
      store.createTask({ title: "T2", tags: ["alpha", "beta"] });

      const tags = useTaskStore.getState().getAllTags();
      expect(tags).toEqual(["alpha", "beta", "zebra"]);
    });

    it("returns empty array when no tasks have tags", () => {
      useTaskStore.getState().createTask({ title: "No tags" });
      expect(useTaskStore.getState().getAllTags()).toHaveLength(0);
    });
  });

  // ── 7. filterTasks — status filter ────────────────────────────────────────

  describe("filterTasks — status filter", () => {
    it("filters to a single status", () => {
      createNTasks(3, { status: "draft" });
      createNTasks(2, { status: "active" });

      const result = useTaskStore.getState().filterTasks({ statuses: ["active"] });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.status === "active")).toBe(true);
    });

    it("filters to multiple statuses (OR semantics)", () => {
      createNTasks(2, { status: "draft" });
      createNTasks(2, { status: "active" });
      createNTasks(2, { status: "blocked" });

      const result = useTaskStore.getState().filterTasks({
        statuses: ["active", "blocked"],
      });
      expect(result).toHaveLength(4);
    });

    it("excludes terminal tasks by default (includeTerminal=false)", () => {
      createNTasks(3, { status: "draft" });
      createNTasks(2, { status: "done" });
      createNTasks(1, { status: "cancelled" });

      const result = useTaskStore.getState().filterTasks({});
      // done + cancelled tasks should be excluded
      expect(result.every((t) => t.status !== "done" && t.status !== "cancelled")).toBe(true);
      expect(result).toHaveLength(3);
    });

    it("includes terminal tasks when includeTerminal=true", () => {
      createNTasks(2, { status: "done" });
      createNTasks(1, { status: "cancelled" });

      const result = useTaskStore.getState().filterTasks({ includeTerminal: true });
      expect(result).toHaveLength(3);
    });
  });

  // ── 8. filterTasks — priority filter ─────────────────────────────────────

  describe("filterTasks — priority filter", () => {
    it("filters to a single priority", () => {
      createNTasks(2, { priority: "critical" });
      createNTasks(3, { priority: "normal" });

      const result = useTaskStore.getState().filterTasks({
        priorities: ["critical"],
      });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.priority === "critical")).toBe(true);
    });

    it("filters to multiple priorities (OR)", () => {
      createNTasks(2, { priority: "critical" });
      createNTasks(2, { priority: "high" });
      createNTasks(3, { priority: "normal" });

      const result = useTaskStore.getState().filterTasks({
        priorities: ["critical", "high"],
      });
      expect(result).toHaveLength(4);
    });
  });

  // ── 9. filterTasks — agentId filter ──────────────────────────────────────

  describe("filterTasks — agentId filter", () => {
    it("filters by assigned agentId", () => {
      createNTasks(2, { agentId: "agent-alice", status: "active" });
      createNTasks(3, { agentId: "agent-bob", status: "active" });

      const result = useTaskStore.getState().filterTasks({
        agentIds: ["agent-alice"],
        includeTerminal: false,
      });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.assignedAgentId === "agent-alice")).toBe(true);
    });

    it("filters multiple agents (OR)", () => {
      createNTasks(2, { agentId: "agent-alice", status: "active" });
      createNTasks(3, { agentId: "agent-bob", status: "active" });

      const result = useTaskStore.getState().filterTasks({
        agentIds: ["agent-alice", "agent-bob"],
      });
      expect(result).toHaveLength(5);
    });

    it("supports __unassigned__ sentinel for unassigned tasks", () => {
      createNTasks(2, { agentId: null });
      createNTasks(3, { agentId: "agent-x" });

      const result = useTaskStore.getState().filterTasks({
        agentIds: ["__unassigned__"],
      });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.assignedAgentId === null)).toBe(true);
    });
  });

  // ── 10. filterTasks — tag filter (AND semantics) ──────────────────────────

  describe("filterTasks — tag filter", () => {
    it("filters tasks that have ALL specified tags (AND)", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "Both tags",   tags: ["A", "B"] });
      const id2 = store.createTask({ title: "Only A",      tags: ["A"] });
      store.createTask({ title: "Only B",      tags: ["B"] });
      store.createTask({ title: "Neither",     tags: [] });

      const result = useTaskStore.getState().filterTasks({ tags: ["A", "B"] });
      const ids = result.map((t) => t.taskId);
      expect(ids).toContain(id1);
      expect(ids).not.toContain(id2);
      expect(result).toHaveLength(1);
    });

    it("filters tasks with a single tag", () => {
      const store = useTaskStore.getState();
      const id1 = store.createTask({ title: "Has X", tags: ["X"] });
      store.createTask({ title: "No X", tags: ["Y"] });

      const result = useTaskStore.getState().filterTasks({ tags: ["X"] });
      expect(result.map((t) => t.taskId)).toContain(id1);
      expect(result).toHaveLength(1);
    });
  });

  // ── 11. filterTasks — searchText ─────────────────────────────────────────

  describe("filterTasks — searchText", () => {
    it("matches tasks by title substring (case-insensitive)", () => {
      const store = useTaskStore.getState();
      store.createTask({ title: "Deploy frontend service" });
      store.createTask({ title: "Review backend code" });
      store.createTask({ title: "Update deployment scripts" });

      const result = useTaskStore.getState().filterTasks({ searchText: "deploy" });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.title.toLowerCase().includes("deploy"))).toBe(true);
    });

    it("matches tasks by description substring", () => {
      const store = useTaskStore.getState();
      store.createTask({
        title:       "Generic title",
        description: "Contains the keyword perf-critical",
      });
      store.createTask({ title: "Another task" });

      const result = useTaskStore.getState().filterTasks({ searchText: "perf-critical" });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Generic title");
    });

    it("returns empty array when no matches", () => {
      useTaskStore.getState().createTask({ title: "Nothing here" });
      const result = useTaskStore.getState().filterTasks({ searchText: "xyz123" });
      expect(result).toHaveLength(0);
    });
  });

  // ── 12. filterTasks — includeTerminal flag ───────────────────────────────

  describe("filterTasks — includeTerminal", () => {
    it("excludes done and cancelled by default", () => {
      createNTasks(2, { status: "done" });
      createNTasks(1, { status: "cancelled" });
      createNTasks(2, { status: "draft" });

      const result = useTaskStore.getState().filterTasks({});
      expect(result).toHaveLength(2); // only non-terminal
    });

    it("includes done and cancelled when includeTerminal=true", () => {
      createNTasks(2, { status: "done" });
      createNTasks(1, { status: "cancelled" });
      createNTasks(2, { status: "draft" });

      const result = useTaskStore.getState().filterTasks({ includeTerminal: true });
      expect(result).toHaveLength(5);
    });
  });

  // ── 13. filterTasks — parentTaskId ───────────────────────────────────────

  describe("filterTasks — parentTaskId", () => {
    it("filters to sub-tasks of a given parent", () => {
      const store = useTaskStore.getState();
      const parentId = store.createTask({ title: "Parent" });
      const childId1 = store.createTask({ title: "Child 1", parentTaskId: parentId });
      const childId2 = store.createTask({ title: "Child 2", parentTaskId: parentId });
      store.createTask({ title: "Unrelated top-level" });

      const result = useTaskStore.getState().filterTasks({ parentTaskId: parentId });
      const ids = result.map((t) => t.taskId);
      expect(ids).toContain(childId1);
      expect(ids).toContain(childId2);
      expect(result).toHaveLength(2);
    });

    it("filters to top-level tasks when parentTaskId=null", () => {
      const store = useTaskStore.getState();
      const parentId = store.createTask({ title: "Parent" });
      store.createTask({ title: "Child", parentTaskId: parentId });
      store.createTask({ title: "Top-level 2" });

      const result = useTaskStore.getState().filterTasks({ parentTaskId: null });
      expect(result.every((t) => t.parentTaskId === null)).toBe(true);
      expect(result).toHaveLength(2); // "Parent" + "Top-level 2"
    });
  });

  // ── 14. filterTasks — combined multi-criteria ─────────────────────────────

  describe("filterTasks — combined multi-criteria filter", () => {
    it("applies all criteria together (AND)", () => {
      const store = useTaskStore.getState();
      // Match: critical, active, agent-x, tag "important"
      const matchId = store.createTask({
        title:           "Match",
        priority:        "critical",
        initialStatus:   "active",
        assignedAgentId: "agent-x",
        tags:            ["important"],
      });
      // Miss: wrong priority
      store.createTask({
        title:           "Miss priority",
        priority:        "normal",
        initialStatus:   "active",
        assignedAgentId: "agent-x",
        tags:            ["important"],
      });
      // Miss: wrong agent
      store.createTask({
        title:           "Miss agent",
        priority:        "critical",
        initialStatus:   "active",
        assignedAgentId: "agent-y",
        tags:            ["important"],
      });
      // Miss: missing tag
      store.createTask({
        title:           "Miss tag",
        priority:        "critical",
        initialStatus:   "active",
        assignedAgentId: "agent-x",
        tags:            [],
      });

      const result = useTaskStore.getState().filterTasks({
        priorities: ["critical"],
        statuses:   ["active"],
        agentIds:   ["agent-x"],
        tags:       ["important"],
      });

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe(matchId);
    });
  });

  // ── 15. getTasksPaginated — basic pagination ──────────────────────────────

  describe("getTasksPaginated — basic pagination", () => {
    it("returns page 0 with first pageSize tasks", () => {
      createNTasks(30);

      const page0 = useTaskStore.getState().getTasksPaginated({}, 0, 10);
      expect(page0.tasks).toHaveLength(10);
      expect(page0.page).toBe(0);
      expect(page0.pageSize).toBe(10);
      expect(page0.filteredCount).toBe(30);
      expect(page0.totalPages).toBe(3);
    });

    it("returns page 1 with next pageSize tasks", () => {
      createNTasks(30);

      const page1 = useTaskStore.getState().getTasksPaginated({}, 1, 10);
      expect(page1.tasks).toHaveLength(10);
      expect(page1.page).toBe(1);
    });

    it("returns partial last page correctly", () => {
      createNTasks(25);

      const page2 = useTaskStore.getState().getTasksPaginated({}, 2, 10);
      expect(page2.tasks).toHaveLength(5); // 25 - 2*10 = 5
      expect(page2.page).toBe(2);
      expect(page2.totalPages).toBe(3);
    });

    it("pages do not overlap (tasks on p0 not in p1)", () => {
      createNTasks(20);

      const page0 = useTaskStore.getState().getTasksPaginated({}, 0, 10);
      const page1 = useTaskStore.getState().getTasksPaginated({}, 1, 10);

      const ids0 = new Set(page0.tasks.map((t) => t.taskId));
      const ids1 = page1.tasks.map((t) => t.taskId);
      for (const id of ids1) {
        expect(ids0.has(id)).toBe(false);
      }
    });
  });

  // ── 16. getTasksPaginated — page clamping ─────────────────────────────────

  describe("getTasksPaginated — page clamping", () => {
    it("clamps page above totalPages to last valid page", () => {
      createNTasks(5);

      const result = useTaskStore.getState().getTasksPaginated({}, 999, 10);
      expect(result.page).toBe(0); // only 1 page
      expect(result.tasks).toHaveLength(5);
    });

    it("clamps negative page to 0", () => {
      createNTasks(5);

      const result = useTaskStore.getState().getTasksPaginated({}, -1, 10);
      expect(result.page).toBe(0);
    });

    it("returns empty tasks array when store is empty", () => {
      const result = useTaskStore.getState().getTasksPaginated({}, 0, 10);
      expect(result.tasks).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.filteredCount).toBe(0);
      expect(result.totalPages).toBe(1);
    });
  });

  // ── 17. getTasksPaginated — custom pageSize ────────────────────────────────

  describe("getTasksPaginated — custom pageSize", () => {
    it("uses PAGE_SIZE default of 25 when not specified", () => {
      createNTasks(30);

      const result = useTaskStore.getState().getTasksPaginated({}, 0);
      expect(result.pageSize).toBe(25);
      expect(result.tasks).toHaveLength(25);
    });

    it("respects custom pageSize of 5", () => {
      createNTasks(12);

      const result = useTaskStore.getState().getTasksPaginated({}, 0, 5);
      expect(result.pageSize).toBe(5);
      expect(result.tasks).toHaveLength(5);
      expect(result.totalPages).toBe(3); // ceil(12 / 5) = 3... but wait 12/5 = 2.4, ceil = 3
    });

    it("returns all tasks in 1 page when pageSize >= filteredCount", () => {
      createNTasks(10);

      const result = useTaskStore.getState().getTasksPaginated({}, 0, 100);
      expect(result.tasks).toHaveLength(10);
      expect(result.totalPages).toBe(1);
    });
  });

  // ── 18. getTasksPaginated — counts ────────────────────────────────────────

  describe("getTasksPaginated — counts", () => {
    it("reports accurate totalCount vs filteredCount", () => {
      createNTasks(10, { status: "draft" });
      createNTasks(5, { status: "active" });

      const result = useTaskStore.getState().getTasksPaginated(
        { statuses: ["active"] },
        0,
        25,
      );

      expect(result.totalCount).toBe(15);        // all tasks
      expect(result.filteredCount).toBe(5);       // only active
      expect(result.tasks).toHaveLength(5);
    });

    it("totalCount includes terminal tasks not matching filter", () => {
      createNTasks(3, { status: "done" });
      createNTasks(2, { status: "draft" });

      const result = useTaskStore.getState().getTasksPaginated({}, 0, 25);
      expect(result.totalCount).toBe(5);    // 3 done + 2 draft in store
      expect(result.filteredCount).toBe(2); // only draft (terminal excluded)
    });
  });

  // ── 19. Performance — 100 tasks ────────────────────────────────────────────

  describe("getTasksPaginated — 100-task scale", () => {
    it("handles 100 tasks without error and returns correct counts", () => {
      // Create 100 tasks: 25 each priority
      createNTasks(25, { priority: "critical", status: "active" });
      createNTasks(25, { priority: "high",     status: "active" });
      createNTasks(25, { priority: "normal",   status: "draft" });
      createNTasks(25, { priority: "low",      status: "draft" });

      const state = useTaskStore.getState();
      expect(Object.keys(state.tasks)).toHaveLength(100);

      const page = state.getTasksPaginated({ statuses: ["active"] }, 0, 25);
      expect(page.filteredCount).toBe(50);
      expect(page.totalPages).toBe(2);
      expect(page.tasks).toHaveLength(25);
    });

    it("critical tasks appear on page 0 before normal tasks (priority sort)", () => {
      createNTasks(10, { priority: "normal", status: "active", prefix: "Normal" });
      createNTasks(10, { priority: "critical", status: "active", prefix: "Critical" });

      const page = useTaskStore.getState().getTasksPaginated(
        { statuses: ["active"] },
        0,
        10,
      );

      // First page should be all critical tasks (higher priority weight)
      expect(page.tasks.every((t) => t.priority === "critical")).toBe(true);
    });

    it("handles 200 tasks with tag filtering", () => {
      createNTasks(100, { tags: ["infra"],    status: "draft" });
      createNTasks(100, { tags: ["frontend"], status: "draft" });

      const result = useTaskStore.getState().filterTasks({ tags: ["infra"] });
      expect(result).toHaveLength(100);
    });
  });

  // ── 20. filterTasks — sort order ─────────────────────────────────────────

  describe("filterTasks — sort order", () => {
    it("sorts by priority descending then createdTs ascending", () => {
      const store = useTaskStore.getState();
      // Create in deliberately "wrong" order
      const lowId  = store.createTask({ title: "Low task",      priority: "low"      });
      const critId = store.createTask({ title: "Critical task", priority: "critical" });
      const highId = store.createTask({ title: "High task",     priority: "high"     });
      const normId = store.createTask({ title: "Normal task",   priority: "normal"   });

      const result = useTaskStore.getState().filterTasks({});
      expect(result.map((t) => t.taskId)).toEqual([critId, highId, normId, lowId]);
    });

    it("breaks priority ties by createdTs ascending (older first)", () => {
      const store = useTaskStore.getState();
      // Create two tasks with same priority at different times
      const oldId = store.createTask({ title: "Older high", priority: "high" });
      const newId = store.createTask({ title: "Newer high", priority: "high" });

      // Verify createdTs ordering (oldId < newId since created first)
      const { tasks } = useTaskStore.getState();
      expect(tasks[oldId].createdTs).toBeLessThanOrEqual(tasks[newId].createdTs);

      const result = useTaskStore.getState().filterTasks({});
      const ids = result.map((t) => t.taskId);
      expect(ids.indexOf(oldId)).toBeLessThan(ids.indexOf(newId));
    });
  });
});
