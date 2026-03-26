/**
 * task-group-store.ts — Zustand store for the task_group entity.
 *
 * Sub-AC 2 (AC 15): Windowed/paginated access to tasks, supporting
 * tens to hundreds of tasks with virtualized rendering so only the
 * visible task window is materialized in the 3D scene.
 *
 * ── Design Intent ─────────────────────────────────────────────────────────
 *
 * The task_group entity is an INFRASTRUCTURE-layer entity: it sits between
 * the task-store (domain data) and the 3D scene renderer (presentation).
 * Its sole responsibility is to project a windowed slice of the task-store
 * onto the 3D scene so the renderer never has to materialize more than
 * `windowSize` task orbs at once.
 *
 * Without task_group, a 200-task workload would create 200 Three.js meshes,
 * 200 point lights, and 200 animated materials — well beyond the 60 fps budget.
 * With task_group, only the 10 (or 20, configurable) visible tasks create
 * geometry.  The rest exist in the store but have NO 3D representation.
 *
 * ── Record Transparency (supreme design principle) ─────────────────────────
 *
 * Every state change appends an event to `events`.  The complete sequence of
 * task_group.* events fully reconstructs the group's pagination history:
 *   - Which filter was active at each moment
 *   - Which page the user navigated to and when
 *   - Which window size was used
 *
 * This enables 3D replay to re-materialize the exact set of task orbs that
 * were visible at any historical timestamp.
 *
 * ── Integration with task-store ────────────────────────────────────────────
 *
 * task-group-store holds NO task data.  It holds only the group configuration
 * (filter, currentPage, windowSize).  When getGroupWindow() is called it
 * delegates to useTaskStore.getState().getTasksPaginated() for the actual
 * task records.  This avoids data duplication and ensures the group always
 * reflects the latest task-store state.
 *
 * ── Sub-AC 2 compliance notes ─────────────────────────────────────────────
 *
 * ✓ task_group entity defined with behavioral contract (in task-group-types.ts)
 * ✓ Windowed access: getGroupWindow() returns TaskGroupWindow with visibleTasks[]
 * ✓ Pagination: nextPage / prevPage / gotoPage / scrollToTask
 * ✓ Virtualized: visibleTasks.length ≤ windowSize (≤ 25 by default)
 * ✓ Scale: supports hundreds of tasks (delegates filtering to task-store)
 * ✓ Event sourcing: every mutation appends to events[]
 */

import { create } from "zustand";
import {
  type TaskGroup,
  type TaskGroupWindow,
  type TaskGroupEvent,
  type TaskGroupEventType,
  type CreateTaskGroupInput,
  computeWindowLabel,
  clampPage,
  pageForItemIndex,
} from "../data/task-group-types.js";
import type { TaskFilter } from "../data/task-types.js";

// Re-export types so consumers only need one import
export type {
  TaskGroup,
  TaskGroupWindow,
  TaskGroupEvent,
  TaskGroupEventType,
  CreateTaskGroupInput,
};
export { computeWindowLabel, clampPage, pageForItemIndex };

// ── ID generators ────────────────────────────────────────────────────────────

let _groupCounter = 0;
let _eventCounter = 0;

function nextGroupId(): string {
  return `tg-${Date.now()}-${++_groupCounter}`;
}

function nextGroupEventId(): string {
  return `tge-${Date.now()}-${++_eventCounter}`;
}

// ── Task-store shim ──────────────────────────────────────────────────────────

/**
 * Minimal interface of the task-store we need.
 * Typed loosely to avoid circular ES-module imports.
 */
interface TaskStoreShim {
  getTasksPaginated: (
    filter: TaskFilter,
    page: number,
    pageSize?: number,
  ) => {
    tasks: import("../data/task-types.js").TaskRecord[];
    totalCount: number;
    filteredCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filterTasks: (filter: TaskFilter) => import("../data/task-types.js").TaskRecord[];
}

let _taskStoreRef: (() => TaskStoreShim) | null = null;

/**
 * Inject the task-store getter after both stores are initialised.
 * Called from App.tsx (or store wiring module) once both stores exist.
 *
 * The injection decouples the two stores at module-load time — the
 * task-group-store module can be imported without pulling in task-store,
 * which is important for avoiding circular dependency issues in the bundle.
 */
export function injectTaskStoreRefForGroups(
  getState: () => TaskStoreShim,
): void {
  _taskStoreRef = getState;
}

function getTaskStore(): TaskStoreShim | null {
  return _taskStoreRef?.() ?? null;
}

// ── Store shape ──────────────────────────────────────────────────────────────

export interface TaskGroupStoreState {
  /**
   * All task groups keyed by groupId.
   * Infrastructure-layer entities — they configure the view, not the data.
   */
  groups: Record<string, TaskGroup>;

  /**
   * Append-only event log — every state-changing action appends here.
   * Enables full replay of pagination history and self-improvement analysis.
   */
  events: TaskGroupEvent[];

  // ── Actions (Behavioral Contract) ────────────────────────────────────────

  /**
   * Create a new task_group with the given configuration.
   * Returns the generated groupId.
   * Emits: task_group.created
   */
  createTaskGroup(input: CreateTaskGroupInput): string;

  /**
   * Delete a task group.
   * The underlying tasks in task-store are NOT affected.
   * Emits: task_group.deleted
   */
  deleteTaskGroup(groupId: string): void;

  /**
   * Advance the window to the next page.
   * No-op if already on the last page.
   * Emits: task_group.page_changed
   */
  nextPage(groupId: string): void;

  /**
   * Retreat the window to the previous page.
   * No-op if already on page 0.
   * Emits: task_group.page_changed
   */
  prevPage(groupId: string): void;

  /**
   * Jump to a specific page index.
   * Page is clamped to the valid range [0, totalPages - 1].
   * Emits: task_group.page_changed
   */
  gotoPage(groupId: string, page: number): void;

  /**
   * Replace the active filter for a group.
   * Resets the window to page 0.
   * Emits: task_group.filter_changed
   */
  setFilter(groupId: string, filter: TaskFilter): void;

  /**
   * Change the number of tasks materialized per page.
   * Resets the window to page 0.
   * Emits: task_group.window_resized
   */
  setWindowSize(groupId: string, windowSize: number): void;

  /**
   * Move the window to the page containing the given taskId.
   *
   * Scans the group's filtered task list to find the item index,
   * then computes and jumps to the appropriate page.
   * No-op if the taskId is not in the group's filtered set.
   * Emits: task_group.page_changed (if the page changes)
   */
  scrollToTask(groupId: string, taskId: string): void;

  /**
   * Reset the window to page 0 without changing the filter.
   * Emits: task_group.page_changed
   */
  resetWindow(groupId: string): void;

  /**
   * Update the 3D spatial pin for a group.
   * Emits: task_group.pin_changed
   */
  setPinTarget(
    groupId: string,
    pin: { agentId?: string; roomId?: string },
  ): void;

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Get a group by ID (undefined if not found). */
  getGroup(groupId: string): TaskGroup | undefined;

  /**
   * Get the current visible window for a task group.
   *
   * This is the VIRTUALIZATION POINT: the returned TaskGroupWindow.visibleTasks
   * contains only windowSize tasks — these are the ONLY tasks that should
   * become 3D scene nodes.  All other tasks in the group's filtered set
   * are intentionally absent from the returned array.
   *
   * Requires task-store ref to be injected.  Returns an empty window if the
   * ref has not been set (safe for SSR / unit tests without task-store).
   */
  getGroupWindow(groupId: string): TaskGroupWindow;

  /** Get all group IDs. */
  getAllGroupIds(): string[];

  /**
   * Get groups pinned to a specific agent.
   * Used by the agent avatar panel to show relevant task groups in 3D.
   */
  getGroupsForAgent(agentId: string): TaskGroup[];

  /**
   * Get groups pinned to a specific room.
   * Used by the room volume panel to show relevant task groups in 3D.
   */
  getGroupsForRoom(roomId: string): TaskGroup[];
}

// ── Helper: build a group event ───────────────────────────────────────────────

function makeGroupEvent(
  type: TaskGroupEventType,
  groupId: string,
  payload: Record<string, unknown>,
): TaskGroupEvent {
  return {
    id:      nextGroupEventId(),
    type,
    ts:      Date.now(),
    groupId,
    payload,
  };
}

// ── Helper: build a TaskGroup from CreateTaskGroupInput ───────────────────────

function buildTaskGroup(
  input: CreateTaskGroupInput,
  groupId: string,
  now: number,
): TaskGroup {
  return {
    groupId,
    name:          input.name,
    description:   input.description,
    filter:        input.filter ?? {},
    windowSize:    Math.max(1, input.windowSize ?? 10),
    currentPage:   0,
    createdTs:     now,
    updatedTs:     now,
    eventIds:      [],
    pinnedAgentId: input.pinnedAgentId,
    pinnedRoomId:  input.pinnedRoomId,
  };
}

// ── Empty window sentinel ────────────────────────────────────────────────────

function emptyWindow(groupId: string, groupName: string): TaskGroupWindow {
  return {
    groupId,
    groupName,
    visibleTasks:    [],
    totalStoreCount: 0,
    filteredCount:   0,
    currentPage:     0,
    windowSize:      10,
    totalPages:      1,
    hasPrev:         false,
    hasNext:         false,
    windowLabel:     "0 tasks",
  };
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useTaskGroupStore = create<TaskGroupStoreState>((set, get) => ({
  groups: {},
  events: [],

  // ── Actions ────────────────────────────────────────────────────────────────

  createTaskGroup(input) {
    const now     = Date.now();
    const groupId = nextGroupId();
    const group   = buildTaskGroup(input, groupId, now);
    const event   = makeGroupEvent("task_group.created", groupId, {
      name:          group.name,
      filter:        group.filter,
      windowSize:    group.windowSize,
      pinnedAgentId: group.pinnedAgentId ?? null,
      pinnedRoomId:  group.pinnedRoomId  ?? null,
    });

    set((s) => ({
      groups: { ...s.groups, [groupId]: { ...group, eventIds: [event.id] } },
      events: [...s.events, event],
    }));

    return groupId;
  },

  deleteTaskGroup(groupId) {
    const group = get().groups[groupId];
    if (!group) return;

    const event = makeGroupEvent("task_group.deleted", groupId, {
      name: group.name,
    });

    set((s) => {
      const { [groupId]: _removed, ...rest } = s.groups;
      return {
        groups: rest,
        events: [...s.events, event],
      };
    });
  },

  nextPage(groupId) {
    const group = get().groups[groupId];
    if (!group) return;

    const taskStore = getTaskStore();
    if (!taskStore) return;

    // Compute total pages to check boundary
    const { totalPages } = taskStore.getTasksPaginated(
      group.filter, 0, group.windowSize,
    );

    const maxPage   = Math.max(0, totalPages - 1);
    const prevPage  = group.currentPage;
    const nextPageN = Math.min(prevPage + 1, maxPage);

    if (nextPageN === prevPage) return; // already on last page

    const event = makeGroupEvent("task_group.page_changed", groupId, {
      from: prevPage,
      to:   nextPageN,
      via:  "nextPage",
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          currentPage: nextPageN,
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  prevPage(groupId) {
    const group = get().groups[groupId];
    if (!group) return;

    const prevPageN = group.currentPage;
    if (prevPageN === 0) return; // already on first page

    const newPage = prevPageN - 1;
    const event   = makeGroupEvent("task_group.page_changed", groupId, {
      from: prevPageN,
      to:   newPage,
      via:  "prevPage",
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          currentPage: newPage,
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  gotoPage(groupId, page) {
    const group = get().groups[groupId];
    if (!group) return;

    const taskStore = getTaskStore();
    if (!taskStore) return;

    const { totalPages } = taskStore.getTasksPaginated(
      group.filter, 0, group.windowSize,
    );

    const clamped = clampPage(page, totalPages);
    if (clamped === group.currentPage) return; // no-op

    const event = makeGroupEvent("task_group.page_changed", groupId, {
      from:    group.currentPage,
      to:      clamped,
      via:     "gotoPage",
      requested: page,
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          currentPage: clamped,
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  setFilter(groupId, filter) {
    const group = get().groups[groupId];
    if (!group) return;

    const event = makeGroupEvent("task_group.filter_changed", groupId, {
      prevFilter: group.filter,
      nextFilter: filter,
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          filter:      filter,
          currentPage: 0, // reset to page 0 on filter change
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  setWindowSize(groupId, windowSize) {
    const group = get().groups[groupId];
    if (!group) return;

    const safeSize = Math.max(1, windowSize);
    if (safeSize === group.windowSize) return;

    const event = makeGroupEvent("task_group.window_resized", groupId, {
      prevWindowSize: group.windowSize,
      nextWindowSize: safeSize,
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          windowSize:  safeSize,
          currentPage: 0, // reset to page 0 on resize
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  scrollToTask(groupId, taskId) {
    const group = get().groups[groupId];
    if (!group) return;

    const taskStore = getTaskStore();
    if (!taskStore) return;

    // Find the item index of the task in the full filtered list
    const allFiltered = taskStore.filterTasks(group.filter);
    const itemIndex   = allFiltered.findIndex((t) => t.taskId === taskId);

    if (itemIndex === -1) return; // task not in this group's filter

    const targetPage = pageForItemIndex(itemIndex, group.windowSize);
    if (targetPage === group.currentPage) return; // already visible

    const event = makeGroupEvent("task_group.page_changed", groupId, {
      from:      group.currentPage,
      to:        targetPage,
      via:       "scrollToTask",
      taskId,
      itemIndex,
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          currentPage: targetPage,
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  resetWindow(groupId) {
    const group = get().groups[groupId];
    if (!group) return;
    if (group.currentPage === 0) return; // already reset

    const event = makeGroupEvent("task_group.page_changed", groupId, {
      from: group.currentPage,
      to:   0,
      via:  "resetWindow",
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          currentPage: 0,
          updatedTs:   event.ts,
          eventIds:    [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  setPinTarget(groupId, { agentId, roomId }) {
    const group = get().groups[groupId];
    if (!group) return;

    const event = makeGroupEvent("task_group.pin_changed", groupId, {
      prevAgentId: group.pinnedAgentId ?? null,
      prevRoomId:  group.pinnedRoomId  ?? null,
      nextAgentId: agentId ?? null,
      nextRoomId:  roomId  ?? null,
    });

    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...group,
          pinnedAgentId: agentId,
          pinnedRoomId:  roomId,
          updatedTs:     event.ts,
          eventIds:      [...group.eventIds, event.id],
        },
      },
      events: [...s.events, event],
    }));
  },

  // ── Queries ────────────────────────────────────────────────────────────────

  getGroup(groupId) {
    return get().groups[groupId];
  },

  getGroupWindow(groupId) {
    const group = get().groups[groupId];
    if (!group) return emptyWindow(groupId, "unknown");

    const taskStore = getTaskStore();
    if (!taskStore) {
      // No task-store ref yet (SSR / cold start / unit test without injection).
      // Return a safe empty window rather than throwing.
      return emptyWindow(groupId, group.name);
    }

    const page = taskStore.getTasksPaginated(
      group.filter,
      group.currentPage,
      group.windowSize,
    );

    const hasPrev = page.page > 0;
    const hasNext = page.page < page.totalPages - 1;

    return {
      groupId:         group.groupId,
      groupName:       group.name,
      visibleTasks:    page.tasks,   // ← ONLY these tasks become 3D geometry
      totalStoreCount: page.totalCount,
      filteredCount:   page.filteredCount,
      currentPage:     page.page,
      windowSize:      page.pageSize,
      totalPages:      page.totalPages,
      hasPrev,
      hasNext,
      windowLabel:     computeWindowLabel(
        page.filteredCount,
        page.page,
        page.pageSize,
      ),
    };
  },

  getAllGroupIds() {
    return Object.keys(get().groups);
  },

  getGroupsForAgent(agentId) {
    return Object.values(get().groups).filter(
      (g) => g.pinnedAgentId === agentId,
    );
  },

  getGroupsForRoom(roomId) {
    return Object.values(get().groups).filter(
      (g) => g.pinnedRoomId === roomId,
    );
  },
}));
