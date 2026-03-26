/**
 * task-group-store.test.ts — Unit tests for Sub-AC 2 (AC 15).
 *
 * Validates the task_group entity's windowed/paginated access and
 * virtualized rendering contract:
 *
 *  1.  createTaskGroup — stores group, emits task_group.created event
 *  2.  createTaskGroup — defaults (windowSize=10, page=0, filter={})
 *  3.  deleteTaskGroup — removes group, emits task_group.deleted event
 *  4.  nextPage        — advances page, emits task_group.page_changed
 *  5.  nextPage        — no-op on last page
 *  6.  prevPage        — retreats page, emits task_group.page_changed
 *  7.  prevPage        — no-op on page 0
 *  8.  gotoPage        — clamps to valid range
 *  9.  setFilter       — replaces filter, resets to page 0
 * 10.  setWindowSize   — changes windowSize, resets to page 0
 * 11.  scrollToTask    — moves window to page containing the task
 * 12.  scrollToTask    — no-op if task not in group's filter
 * 13.  resetWindow     — resets page to 0
 * 14.  getGroupWindow  — returns correct visibleTasks (virtualization core)
 * 15.  getGroupWindow  — visibleTasks.length ≤ windowSize at ALL times
 * 16.  getGroupWindow  — window label is correct ("3–10 of 47" format)
 * 17.  getGroupWindow  — hasPrev / hasNext flags
 * 18.  getGroupsForAgent — filters by pinnedAgentId
 * 19.  getGroupsForRoom  — filters by pinnedRoomId
 * 20.  setPinTarget    — updates pin, emits task_group.pin_changed
 * 21.  VIRTUALIZATION  — 100 tasks in store; getGroupWindow returns ≤ windowSize
 * 22.  REPLAY          — event log captures full navigation history
 * 23.  computeWindowLabel — edge cases (0 tasks, 1 task, page 0 / last page)
 * 24.  clampPage        — boundary conditions
 * 25.  pageForItemIndex — grid math
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskGroupStore } from "../task-group-store.js";
import { useTaskStore } from "../task-store.js";
import { injectTaskStoreRefForGroups } from "../task-group-store.js";
import {
  computeWindowLabel,
  clampPage,
  pageForItemIndex,
} from "../../data/task-group-types.js";
import type { TaskPriority } from "../../data/task-types.js";

// ── Store reset helpers ──────────────────────────────────────────────────────

function resetGroupStore() {
  useTaskGroupStore.setState({ groups: {}, events: [] });
}

function resetTaskStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
}

// Wire the task-store into the group-store (called once before tests)
injectTaskStoreRefForGroups(() => useTaskStore.getState() as Parameters<typeof injectTaskStoreRefForGroups>[0]);

// ── Bulk task creation helper ────────────────────────────────────────────────

function createNTasks(
  n: number,
  opts: { priority?: TaskPriority; status?: string; agentId?: string } = {},
): string[] {
  const store = useTaskStore.getState();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(store.createTask({
      title:           `Task ${i + 1}`,
      priority:        (opts.priority ?? "normal") as TaskPriority,
      initialStatus:   (opts.status ?? "draft") as import("../../data/task-types.js").TaskStatus,
      assignedAgentId: opts.agentId ?? null,
    }));
  }
  return ids;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("task-group-store — Sub-AC 2 (AC 15)", () => {
  beforeEach(() => {
    resetGroupStore();
    resetTaskStore();
  });

  // ── 1. createTaskGroup ─────────────────────────────────────────────────────

  describe("createTaskGroup", () => {
    it("stores the group and emits task_group.created", () => {
      const store = useTaskGroupStore.getState();
      const id    = store.createTaskGroup({ name: "My Group" });

      const { groups, events } = useTaskGroupStore.getState();
      expect(groups[id]).toBeDefined();
      expect(groups[id].name).toBe("My Group");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("task_group.created");
      expect(events[0].groupId).toBe(id);
    });

    it("returns a unique group ID prefixed with 'tg-'", () => {
      const store = useTaskGroupStore.getState();
      const id    = store.createTaskGroup({ name: "Test" });
      expect(id).toMatch(/^tg-/);
    });
  });

  // ── 2. createTaskGroup defaults ───────────────────────────────────────────

  describe("createTaskGroup — defaults", () => {
    it("defaults windowSize to 10", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.windowSize).toBe(10);
    });

    it("defaults currentPage to 0", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.currentPage).toBe(0);
    });

    it("defaults filter to {} (empty — all non-terminal tasks)", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.filter).toEqual({});
    });

    it("respects custom windowSize", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G", windowSize: 5 });
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.windowSize).toBe(5);
    });

    it("clamps windowSize minimum to 1", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G", windowSize: 0 });
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.windowSize).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. deleteTaskGroup ────────────────────────────────────────────────────

  describe("deleteTaskGroup", () => {
    it("removes the group and emits task_group.deleted", () => {
      const id = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      useTaskGroupStore.getState().deleteTaskGroup(id);

      const { groups, events } = useTaskGroupStore.getState();
      expect(groups[id]).toBeUndefined();

      const deleteEvent = events.find((e) => e.type === "task_group.deleted");
      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.groupId).toBe(id);
    });

    it("is a no-op for unknown group IDs", () => {
      const before = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().deleteTaskGroup("nonexistent");
      expect(useTaskGroupStore.getState().events.length).toBe(before);
    });
  });

  // ── 4. nextPage ───────────────────────────────────────────────────────────

  describe("nextPage", () => {
    it("advances currentPage and emits task_group.page_changed", () => {
      // Create 25 tasks so there are at least 2 pages (windowSize=10)
      createNTasks(25);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "Pages",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });

      useTaskGroupStore.getState().nextPage(id);
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.currentPage).toBe(1);

      const pageEvent = useTaskGroupStore
        .getState()
        .events.find((e) => e.type === "task_group.page_changed");
      expect(pageEvent).toBeDefined();
      expect(pageEvent!.payload.to).toBe(1);
      expect(pageEvent!.payload.via).toBe("nextPage");
    });
  });

  // ── 5. nextPage — no-op on last page ─────────────────────────────────────

  describe("nextPage — no-op on last page", () => {
    it("does not advance past the last page", () => {
      createNTasks(5);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "Small",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      // With 5 tasks and windowSize=10 there is only 1 page (page 0)
      const eventsBefore = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().nextPage(id);
      expect(useTaskGroupStore.getState().events.length).toBe(eventsBefore); // no new event
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(0);
    });
  });

  // ── 6. prevPage ───────────────────────────────────────────────────────────

  describe("prevPage", () => {
    it("retreats currentPage and emits task_group.page_changed", () => {
      createNTasks(25);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 2);  // move to page 2

      useTaskGroupStore.getState().prevPage(id);
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(1);
    });
  });

  // ── 7. prevPage — no-op on page 0 ────────────────────────────────────────

  describe("prevPage — no-op on page 0", () => {
    it("does not go below page 0", () => {
      const id = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      const eventsBefore = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().prevPage(id);
      expect(useTaskGroupStore.getState().events.length).toBe(eventsBefore);
    });
  });

  // ── 8. gotoPage — clamping ────────────────────────────────────────────────

  describe("gotoPage — clamping", () => {
    it("clamps large page requests to the last valid page", () => {
      createNTasks(15);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      // 15 tasks / 10 per page = 2 pages (0 and 1)
      useTaskGroupStore.getState().gotoPage(id, 999);
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(1);
    });

    it("clamps negative page to 0", () => {
      const id = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      useTaskGroupStore.getState().gotoPage(id, -5);
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(0);
    });
  });

  // ── 9. setFilter ──────────────────────────────────────────────────────────

  describe("setFilter", () => {
    it("replaces filter and resets to page 0", () => {
      createNTasks(25);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 1); // advance to page 1

      // Change filter — should reset to page 0
      useTaskGroupStore.getState().setFilter(id, { statuses: ["active"] });

      const group = useTaskGroupStore.getState().groups[id];
      expect(group.currentPage).toBe(0);
      expect(group.filter).toEqual({ statuses: ["active"] });

      const filterEvent = useTaskGroupStore.getState().events
        .find((e) => e.type === "task_group.filter_changed");
      expect(filterEvent).toBeDefined();
    });
  });

  // ── 10. setWindowSize ─────────────────────────────────────────────────────

  describe("setWindowSize", () => {
    it("changes windowSize and resets to page 0", () => {
      createNTasks(25);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 1);

      useTaskGroupStore.getState().setWindowSize(id, 5);
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.windowSize).toBe(5);
      expect(group.currentPage).toBe(0);

      const resizeEvent = useTaskGroupStore.getState().events
        .find((e) => e.type === "task_group.window_resized");
      expect(resizeEvent).toBeDefined();
    });

    it("ignores setWindowSize if size unchanged", () => {
      const id = useTaskGroupStore.getState().createTaskGroup({
        name: "G", windowSize: 10,
      });
      const eventsBefore = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().setWindowSize(id, 10);
      expect(useTaskGroupStore.getState().events.length).toBe(eventsBefore);
    });
  });

  // ── 11. scrollToTask ──────────────────────────────────────────────────────

  describe("scrollToTask", () => {
    it("moves window to the page containing the requested task", () => {
      // Create 25 tasks — the last ones should be on page 2 (windowSize=10)
      const ids = createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });

      // The 21st task (index 20) should be on page 2 (indices 20-24)
      const targetTaskId = ids[20];
      useTaskGroupStore.getState().scrollToTask(id, targetTaskId);
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(2);
    });
  });

  // ── 12. scrollToTask — no-op if task not in filter ────────────────────────

  describe("scrollToTask — out-of-filter no-op", () => {
    it("is a no-op when the taskId is not in the group's filter", () => {
      createNTasks(10, { status: "active" });
      // Create a separate task that won't match any status filter
      const otherId = useTaskStore.getState().createTask({
        title:         "Orphan",
        initialStatus: "done",
      });

      const id = useTaskGroupStore.getState().createTaskGroup({
        name:   "Active only",
        filter: { statuses: ["active"] },
      });

      const eventsBefore = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().scrollToTask(id, otherId);
      expect(useTaskGroupStore.getState().events.length).toBe(eventsBefore); // no new event
    });
  });

  // ── 13. resetWindow ───────────────────────────────────────────────────────

  describe("resetWindow", () => {
    it("resets currentPage to 0", () => {
      createNTasks(30);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 2);
      useTaskGroupStore.getState().resetWindow(id);
      expect(useTaskGroupStore.getState().groups[id].currentPage).toBe(0);
    });

    it("is a no-op if already on page 0", () => {
      const id           = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      const eventsBefore = useTaskGroupStore.getState().events.length;
      useTaskGroupStore.getState().resetWindow(id);
      expect(useTaskGroupStore.getState().events.length).toBe(eventsBefore);
    });
  });

  // ── 14. getGroupWindow — visibleTasks ─────────────────────────────────────

  describe("getGroupWindow — visibleTasks", () => {
    it("returns the tasks for the current page", () => {
      createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });

      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.visibleTasks).toHaveLength(10);
      expect(win.filteredCount).toBe(25);
    });

    it("returns a partial last page correctly", () => {
      createNTasks(13);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 1);

      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.visibleTasks).toHaveLength(3); // 13 - 10 = 3
    });
  });

  // ── 15. VIRTUALIZATION: visibleTasks.length ≤ windowSize ─────────────────

  describe("VIRTUALIZATION guarantee", () => {
    it("never returns more than windowSize tasks in visibleTasks", () => {
      createNTasks(200); // 200 tasks in store
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "Big Group",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });

      // Check every page
      const { totalPages } = useTaskGroupStore.getState().getGroupWindow(id);
      for (let p = 0; p < totalPages; p++) {
        useTaskGroupStore.getState().gotoPage(id, p);
        const win = useTaskGroupStore.getState().getGroupWindow(id);
        expect(win.visibleTasks.length).toBeLessThanOrEqual(10);
      }
    });

    it("visible tasks from page 0 and page 1 do not overlap", () => {
      createNTasks(30);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });

      const win0 = useTaskGroupStore.getState().getGroupWindow(id);
      useTaskGroupStore.getState().gotoPage(id, 1);
      const win1 = useTaskGroupStore.getState().getGroupWindow(id);

      const ids0 = new Set(win0.visibleTasks.map((t) => t.taskId));
      const ids1 = win1.visibleTasks.map((t) => t.taskId);
      for (const taskId of ids1) {
        expect(ids0.has(taskId)).toBe(false);
      }
    });

    it("200 tasks: getGroupWindow returns ≤ windowSize items", () => {
      createNTasks(200);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "Scale",
        windowSize: 25,
        filter:     { includeTerminal: true },
      });

      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.visibleTasks.length).toBeLessThanOrEqual(25);
      expect(win.filteredCount).toBe(200);
    });
  });

  // ── 16. getGroupWindow — window label ────────────────────────────────────

  describe("getGroupWindow — windowLabel", () => {
    it("produces '1–10 of 25' on page 0 of a 25-task group", () => {
      createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.windowLabel).toBe("1\u201310 of 25");
    });

    it("produces '21–25 of 25' on the last page", () => {
      createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 2);
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.windowLabel).toBe("21\u201325 of 25");
    });

    it("produces '0 tasks' when filter matches nothing", () => {
      createNTasks(5, { status: "draft" });
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:   "Active only",
        filter: { statuses: ["active"] },
      });
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.windowLabel).toBe("0 tasks");
    });
  });

  // ── 17. getGroupWindow — hasPrev / hasNext ────────────────────────────────

  describe("getGroupWindow — hasPrev / hasNext", () => {
    it("page 0 of multi-page group: hasPrev=false, hasNext=true", () => {
      createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.hasPrev).toBe(false);
      expect(win.hasNext).toBe(true);
    });

    it("middle page: hasPrev=true, hasNext=true", () => {
      createNTasks(30);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 1);
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.hasPrev).toBe(true);
      expect(win.hasNext).toBe(true);
    });

    it("last page: hasPrev=true, hasNext=false", () => {
      createNTasks(25);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().gotoPage(id, 2);
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.hasPrev).toBe(true);
      expect(win.hasNext).toBe(false);
    });

    it("single page: hasPrev=false, hasNext=false", () => {
      createNTasks(5);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "G",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.hasPrev).toBe(false);
      expect(win.hasNext).toBe(false);
    });
  });

  // ── 18. getGroupsForAgent ─────────────────────────────────────────────────

  describe("getGroupsForAgent", () => {
    it("returns groups pinned to the given agent", () => {
      const store = useTaskGroupStore.getState();
      const id1   = store.createTaskGroup({ name: "Alice", pinnedAgentId: "agent-alice" });
      const id2   = store.createTaskGroup({ name: "Alice2", pinnedAgentId: "agent-alice" });
      store.createTaskGroup({ name: "Bob",   pinnedAgentId: "agent-bob" });
      store.createTaskGroup({ name: "None"  });

      const groups = useTaskGroupStore.getState().getGroupsForAgent("agent-alice");
      const ids    = groups.map((g) => g.groupId);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toHaveLength(2);
    });
  });

  // ── 19. getGroupsForRoom ──────────────────────────────────────────────────

  describe("getGroupsForRoom", () => {
    it("returns groups pinned to the given room", () => {
      const store = useTaskGroupStore.getState();
      const id1   = store.createTaskGroup({ name: "R1", pinnedRoomId: "room-eng" });
      store.createTaskGroup({ name: "R2",   pinnedRoomId: "room-ops" });

      const groups = useTaskGroupStore.getState().getGroupsForRoom("room-eng");
      const ids    = groups.map((g) => g.groupId);
      expect(ids).toContain(id1);
      expect(ids).toHaveLength(1);
    });
  });

  // ── 20. setPinTarget ──────────────────────────────────────────────────────

  describe("setPinTarget", () => {
    it("updates pinnedAgentId and emits task_group.pin_changed", () => {
      const id    = useTaskGroupStore.getState().createTaskGroup({ name: "G" });
      useTaskGroupStore.getState().setPinTarget(id, { agentId: "agent-zeta" });

      const group = useTaskGroupStore.getState().groups[id];
      expect(group.pinnedAgentId).toBe("agent-zeta");

      const pinEvent = useTaskGroupStore.getState().events
        .find((e) => e.type === "task_group.pin_changed");
      expect(pinEvent).toBeDefined();
      expect(pinEvent!.payload.nextAgentId).toBe("agent-zeta");
    });
  });

  // ── 21. VIRTUALIZATION — 100 tasks ────────────────────────────────────────

  describe("VIRTUALIZATION — 100-task store", () => {
    it("getGroupWindow returns exactly windowSize tasks from 100-task store", () => {
      createNTasks(100);
      const id  = useTaskGroupStore.getState().createTaskGroup({
        name:       "Century",
        windowSize: 15,
        filter:     { includeTerminal: true },
      });

      const win = useTaskGroupStore.getState().getGroupWindow(id);
      expect(win.visibleTasks).toHaveLength(15);
      expect(win.filteredCount).toBe(100);
      expect(win.totalPages).toBe(7); // ceil(100/15) = 7
    });
  });

  // ── 22. REPLAY — event log ────────────────────────────────────────────────

  describe("REPLAY — event log captures navigation history", () => {
    it("records created + page_changed events in order", () => {
      createNTasks(30);
      const id = useTaskGroupStore.getState().createTaskGroup({
        name:       "Nav",
        windowSize: 10,
        filter:     { includeTerminal: true },
      });
      useTaskGroupStore.getState().nextPage(id);
      useTaskGroupStore.getState().nextPage(id);
      useTaskGroupStore.getState().prevPage(id);

      const events = useTaskGroupStore.getState().events
        .filter((e) => e.groupId === id);

      expect(events[0].type).toBe("task_group.created");
      expect(events[1].type).toBe("task_group.page_changed");
      expect(events[1].payload.to).toBe(1);
      expect(events[2].type).toBe("task_group.page_changed");
      expect(events[2].payload.to).toBe(2);
      expect(events[3].type).toBe("task_group.page_changed");
      expect(events[3].payload.to).toBe(1);

      // eventIds on the group record also track all events
      const group = useTaskGroupStore.getState().groups[id];
      expect(group.eventIds).toHaveLength(4);
    });
  });

  // ── 23. computeWindowLabel ────────────────────────────────────────────────

  describe("computeWindowLabel — pure function", () => {
    it("returns '0 tasks' for empty filter", () => {
      expect(computeWindowLabel(0, 0, 10)).toBe("0 tasks");
    });

    it("returns '1–1 of 1' for a single task", () => {
      expect(computeWindowLabel(1, 0, 10)).toBe("1\u20131 of 1");
    });

    it("returns '1–10 of 47' for page 0, windowSize=10, filteredCount=47", () => {
      expect(computeWindowLabel(47, 0, 10)).toBe("1\u201310 of 47");
    });

    it("returns '41–47 of 47' for last page of 47/10", () => {
      expect(computeWindowLabel(47, 4, 10)).toBe("41\u201347 of 47");
    });
  });

  // ── 24. clampPage ─────────────────────────────────────────────────────────

  describe("clampPage — pure function", () => {
    it("clamps 0 to 0 when totalPages=1", () => {
      expect(clampPage(0, 1)).toBe(0);
    });

    it("clamps 999 to maxPage", () => {
      expect(clampPage(999, 5)).toBe(4); // 0-based max = 4
    });

    it("clamps -1 to 0", () => {
      expect(clampPage(-1, 5)).toBe(0);
    });

    it("exact last page is not clamped", () => {
      expect(clampPage(4, 5)).toBe(4);
    });
  });

  // ── 25. pageForItemIndex ──────────────────────────────────────────────────

  describe("pageForItemIndex — pure function", () => {
    it("item 0 is on page 0", () => {
      expect(pageForItemIndex(0, 10)).toBe(0);
    });

    it("item 9 (last of first page) is on page 0", () => {
      expect(pageForItemIndex(9, 10)).toBe(0);
    });

    it("item 10 (first of second page) is on page 1", () => {
      expect(pageForItemIndex(10, 10)).toBe(1);
    });

    it("item 20 is on page 2 with windowSize=10", () => {
      expect(pageForItemIndex(20, 10)).toBe(2);
    });
  });
});
