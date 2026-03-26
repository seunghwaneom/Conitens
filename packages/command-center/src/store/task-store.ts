/**
 * task-store.ts — Zustand store for task-agent mapping.
 *
 * Tracks which tasks are assigned to which agents, including full task
 * metadata (status, priority, timestamps, parent/child relationships).
 *
 * All mutations are event-sourced: every state change appends an event to
 * the append-only `events` log. This enables:
 *   - Full audit trail for every task assignment change
 *   - 3D replay of the task queue over time
 *   - Self-improvement analysis by the GUI improvement agent
 *
 * Cross-store integration (optional):
 *   The store exposes `injectAgentStoreRef()` so App.tsx can wire in
 *   the agent store. When the ref is present, task lifecycle transitions
 *   automatically drive the matching agent-store actions
 *   (startAgentTask / completeAgentTask / changeAgentStatus).
 *   The injection uses the same lazy .getState() pattern as agent-store
 *   to avoid circular ES-module dependencies.
 *
 * Sub-AC 5.1: Task-agent mapping data model.
 */
import { create } from "zustand";
import type {
  TaskRecord,
  TaskAgentAssignment,
  TaskStoreEvent,
  TaskStoreEventType,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  TaskFilter,
  TaskPage,
} from "../data/task-types.js";
import {
  canTaskTransition,
  isTaskTerminal,
  TASK_PRIORITY_WEIGHT,
  TERMINAL_TASK_STATES,
} from "../data/task-types.js";

// Re-export for convenience so consumers only need one import
export type {
  TaskRecord,
  TaskAgentAssignment,
  TaskStoreEvent,
  TaskStoreEventType,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  TaskFilter,
  TaskPage,
};

// ── Cross-store ref ────────────────────────────────────────────────────────

/**
 * Minimal interface of the agent-store actions we need to call.
 * Typed loosely so we don't import the full agent-store module (avoids
 * potential circular dependencies when other stores are added later).
 */
interface AgentStoreShim {
  startAgentTask: (agentId: string, taskId: string, taskTitle?: string) => void;
  completeAgentTask: (agentId: string, outcome: "success" | "failure" | "cancelled") => void;
  changeAgentStatus: (agentId: string, status: "idle" | "active" | "busy" | "error" | "inactive" | "terminated", reason?: string) => void;
  agents: Record<string, { currentTaskId: string | null }>;
}

let _agentStoreRef: (() => AgentStoreShim) | null = null;

/**
 * Inject the agent-store getter after both stores are created.
 * Called from App.tsx once both stores are initialized.
 * Enables automatic agent-status mirroring on task transitions.
 */
export function injectAgentStoreRefForTasks(
  getState: () => AgentStoreShim,
): void {
  _agentStoreRef = getState;
}

function getAgentStore(): AgentStoreShim | null {
  return _agentStoreRef?.() ?? null;
}

// ── ID generators ──────────────────────────────────────────────────────────

let _taskCounter   = 0;
let _eventCounter  = 0;

function nextTaskId(): string {
  return `task-${Date.now()}-${++_taskCounter}`;
}

function nextEventId(): string {
  return `te-${Date.now()}-${++_eventCounter}`;
}

// ── Store shape ────────────────────────────────────────────────────────────

export interface TaskStoreState {
  /**
   * All tasks keyed by taskId.
   * Authoritative source of truth for task metadata.
   */
  tasks: Record<string, TaskRecord>;

  /**
   * Task-agent assignment index, keyed by taskId.
   * Only contains entries for tasks that have an assigned agent.
   * Removed when a task is unassigned or reaches a terminal state.
   */
  assignments: Record<string, TaskAgentAssignment>;

  /**
   * Reverse index: agentId → array of taskIds currently assigned to that agent.
   * Kept in sync with `assignments`.
   * Used for O(1) lookups of "which tasks does agent X own?".
   */
  agentTaskIndex: Record<string, string[]>;

  /**
   * Tag → [taskId, ...] index for O(1) tag-based lookups.
   * Updated on createTask / setTaskTags / deleteTask / bulkLoadTasks.
   * Enables efficient filtering by tag without scanning all tasks.
   */
  tagIndex: Record<string, string[]>;

  /**
   * Append-only event log — every state-changing action appends here.
   * Enables full replay and self-improvement analysis.
   */
  events: TaskStoreEvent[];

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Create a new task.
   * Returns the generated taskId.
   * Emits: task.created (+ task.assigned if assignedAgentId is provided).
   */
  createTask: (input: CreateTaskInput) => string;

  /**
   * Assign a task to an agent.
   * If the task is already assigned to another agent, the previous
   * assignment is removed first (emits task.unassigned).
   * Emits: task.assigned.
   * If the agent-store ref is present and the task status is "active",
   * also calls agent-store.startAgentTask().
   */
  assignTask: (taskId: string, agentId: string) => void;

  /**
   * Remove the agent assignment from a task.
   * Emits: task.unassigned.
   */
  unassignTask: (taskId: string) => void;

  /**
   * Transition a task's status using the valid state machine transitions.
   * Returns true if the transition was applied; false if it was invalid
   * (wrong from-state or task not found).
   * Emits: task.status_changed.
   * Side effects via agent-store ref:
   *   - assigned → active: startAgentTask()
   *   - active/review → done: completeAgentTask("success")
   *   - any → failed: completeAgentTask("failure")
   *   - any → cancelled: completeAgentTask("cancelled") + unassignTask()
   */
  transitionTask: (taskId: string, toStatus: TaskStatus) => boolean;

  /**
   * Update a task's priority.
   * Emits: task.priority_changed.
   */
  setTaskPriority: (taskId: string, priority: TaskPriority) => void;

  /**
   * Update a task's title and/or description.
   * Emits: task.title_updated.
   */
  updateTaskTitle: (taskId: string, title: string, description?: string) => void;

  /**
   * Replace (overwrite) the tags on a task.
   * Emits: task.tagged.
   */
  setTaskTags: (taskId: string, tags: string[]) => void;

  /**
   * Remove a task from the store entirely.
   * Also removes any active assignment.
   * Emits: task.deleted.
   */
  deleteTask: (taskId: string) => void;

  /**
   * Bulk-load a set of task records (e.g. from a WebSocket snapshot).
   * Existing tasks with the same ID are replaced.
   * Emits: tasks.bulk_loaded.
   */
  bulkLoadTasks: (tasks: TaskRecord[]) => void;

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Get a task record by ID (undefined if not found). */
  getTask: (taskId: string) => TaskRecord | undefined;

  /** Get the agent ID assigned to a task (null if unassigned). */
  getAgentForTask: (taskId: string) => string | null;

  /** Get all task records assigned to a given agent (ordered by priority desc). */
  getTasksForAgent: (agentId: string) => TaskRecord[];

  /** Get all tasks in a given status. */
  getTasksByStatus: (status: TaskStatus) => TaskRecord[];

  /** Get all tasks at a given priority. */
  getTasksByPriority: (priority: TaskPriority) => TaskRecord[];

  /**
   * Get tasks sorted by priority (critical first) then by createdTs.
   * Optionally filter to a subset of statuses.
   */
  getTasksSorted: (statuses?: TaskStatus[]) => TaskRecord[];

  /** Get all unassigned tasks (assignedAgentId === null). */
  getUnassignedTasks: () => TaskRecord[];

  /** Get all tasks as an array (unsorted). */
  getAllTasks: () => TaskRecord[];

  /** Get total task count by status (for dashboard metrics). */
  getTaskStatusCounts: () => Record<TaskStatus, number>;

  // ── Sub-AC 15b: Scalable queries ──────────────────────────────────────────

  /**
   * Get all tasks that have a specific tag.
   * Uses the tagIndex for O(1) set lookup + O(k) record retrieval
   * where k is the number of tasks with that tag.
   */
  getTasksByTag: (tag: string) => TaskRecord[];

  /**
   * Get all unique tags currently in use across all tasks.
   * Derived from the tagIndex keys.
   */
  getAllTags: () => string[];

  /**
   * Apply a TaskFilter to all tasks and return matching records sorted by
   * priority (critical first) then createdTs (oldest first).
   *
   * This is the core filtering primitive used by pagination and UI components.
   * Operates in O(n) time over matching tasks.
   */
  filterTasks: (filter: TaskFilter) => TaskRecord[];

  /**
   * Return a paginated page of tasks matching the given filter.
   *
   * @param filter  - Multi-criteria filter (see TaskFilter).
   * @param page    - Zero-based page index.
   * @param pageSize - Max tasks per page (default 25).
   *
   * Returns a TaskPage with the tasks for that page plus total/filtered counts
   * for pagination controls.
   */
  getTasksPaginated: (filter: TaskFilter, page: number, pageSize?: number) => TaskPage;
}

// ── Helper: build an event ─────────────────────────────────────────────────

function makeEvent(
  type: TaskStoreEventType,
  payload: Record<string, unknown>,
  taskId?: string,
  agentId?: string,
): TaskStoreEvent {
  return {
    id: nextEventId(),
    type,
    ts: Date.now(),
    taskId,
    agentId,
    payload,
  };
}

// ── Helper: build TaskRecord from CreateTaskInput ──────────────────────────

function buildTaskRecord(
  input: CreateTaskInput,
  taskId: string,
  now: number,
): TaskRecord {
  return {
    taskId,
    title: input.title,
    description: input.description,
    status: input.initialStatus ?? "draft",
    priority: input.priority ?? "normal",
    assignedAgentId: input.assignedAgentId ?? null,
    createdTs: now,
    updatedTs: now,
    startedTs: null,
    completedTs: null,
    parentTaskId: input.parentTaskId ?? null,
    tags: input.tags ?? [],
    eventIds: [],
  };
}

// ── Helper: rebuild agentTaskIndex from assignments ───────────────────────

function buildAgentTaskIndex(
  assignments: Record<string, TaskAgentAssignment>,
): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const assignment of Object.values(assignments)) {
    if (!idx[assignment.agentId]) idx[assignment.agentId] = [];
    idx[assignment.agentId].push(assignment.taskId);
  }
  return idx;
}

// ── Helper: sort tasks by priority then createdTs ─────────────────────────

function sortByPriorityThenTs(a: TaskRecord, b: TaskRecord): number {
  const pw = TASK_PRIORITY_WEIGHT[b.priority] - TASK_PRIORITY_WEIGHT[a.priority];
  if (pw !== 0) return pw;
  return a.createdTs - b.createdTs; // older tasks first within same priority
}

// ── Helper: build tagIndex from all tasks ─────────────────────────────────

function buildTagIndex(tasks: Record<string, TaskRecord>): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const task of Object.values(tasks)) {
    for (const tag of task.tags) {
      if (!idx[tag]) idx[tag] = [];
      idx[tag].push(task.taskId);
    }
  }
  return idx;
}

/**
 * Add a taskId to the tag index for the given tags.
 * Mutates the index in place — call with a shallow copy.
 */
function addToTagIndex(
  idx: Record<string, string[]>,
  taskId: string,
  tags: string[],
): void {
  for (const tag of tags) {
    if (!idx[tag]) idx[tag] = [];
    if (!idx[tag].includes(taskId)) {
      idx[tag] = [...idx[tag], taskId];
    }
  }
}

/**
 * Remove a taskId from the tag index for the given tags.
 * Mutates the index in place — call with a shallow copy.
 */
function removeFromTagIndex(
  idx: Record<string, string[]>,
  taskId: string,
  tags: string[],
): void {
  for (const tag of tags) {
    if (idx[tag]) {
      const next = idx[tag].filter((id) => id !== taskId);
      if (next.length === 0) {
        delete idx[tag]; // prune empty tag entries to keep index clean
      } else {
        idx[tag] = next;
      }
    }
  }
}

// ── Helper: apply TaskFilter to an array of tasks ─────────────────────────

function applyFilter(tasks: TaskRecord[], filter: TaskFilter): TaskRecord[] {
  const {
    statuses,
    priorities,
    agentIds,
    tags,
    searchText,
    includeTerminal = false,
    parentTaskId,
  } = filter;

  const statusSet    = statuses   && statuses.length > 0   ? new Set(statuses)   : null;
  const prioritySet  = priorities && priorities.length > 0 ? new Set(priorities) : null;
  const agentSet     = agentIds   && agentIds.length > 0   ? new Set(agentIds)   : null;
  const tagSet       = tags       && tags.length > 0       ? new Set(tags)       : null;
  const lowerSearch  = searchText?.toLowerCase().trim() ?? "";

  return tasks.filter((task) => {
    // Terminal filter (exclude done/cancelled by default)
    if (!includeTerminal && TERMINAL_TASK_STATES.has(task.status)) return false;

    // Status filter
    if (statusSet && !statusSet.has(task.status)) return false;

    // Priority filter
    if (prioritySet && !prioritySet.has(task.priority)) return false;

    // Agent filter — special sentinel "__unassigned__" for unassigned tasks
    if (agentSet) {
      if (agentSet.has("__unassigned__")) {
        if (task.assignedAgentId !== null) return false;
      } else {
        if (!task.assignedAgentId || !agentSet.has(task.assignedAgentId)) return false;
      }
    }

    // Tag filter — task must have ALL requested tags (AND semantics)
    if (tagSet) {
      for (const tag of tagSet) {
        if (!task.tags.includes(tag)) return false;
      }
    }

    // Parent task filter
    if (parentTaskId !== undefined) {
      if (task.parentTaskId !== parentTaskId) return false;
    }

    // Text search — title OR description contains searchText
    if (lowerSearch) {
      const titleMatch = task.title.toLowerCase().includes(lowerSearch);
      const descMatch  = task.description?.toLowerCase().includes(lowerSearch) ?? false;
      if (!titleMatch && !descMatch) return false;
    }

    return true;
  });
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  tasks: {},
  assignments: {},
  agentTaskIndex: {},
  tagIndex: {},
  events: [],

  // ── createTask ─────────────────────────────────────────────────────────

  createTask: (input: CreateTaskInput): string => {
    const taskId = nextTaskId();
    const now    = Date.now();
    const record = buildTaskRecord(input, taskId, now);

    const events: TaskStoreEvent[] = [];
    const createdEvent = makeEvent(
      "task.created",
      {
        task_id:          taskId,
        title:            record.title,
        status:           record.status,
        priority:         record.priority,
        assigned_agent:   record.assignedAgentId,
        parent_task_id:   record.parentTaskId,
        tags:             record.tags,
      },
      taskId,
      record.assignedAgentId ?? undefined,
    );
    events.push(createdEvent);
    record.eventIds.push(createdEvent.id);

    const newAssignments  = { ...get().assignments };
    const newAgentTaskIdx = { ...get().agentTaskIndex };

    // If created with an agent already assigned, create the assignment record
    if (record.assignedAgentId) {
      const assignment: TaskAgentAssignment = {
        taskId,
        agentId: record.assignedAgentId,
        assignedTs: now,
        priority: record.priority,
        status: record.status,
      };
      newAssignments[taskId] = assignment;

      // Update agent task index
      const agentTasks = newAgentTaskIdx[record.assignedAgentId] ?? [];
      newAgentTaskIdx[record.assignedAgentId] = [...agentTasks, taskId];

      const assignEvent = makeEvent(
        "task.assigned",
        {
          task_id:   taskId,
          agent_id:  record.assignedAgentId,
          priority:  record.priority,
          status:    record.status,
          source:    "create",
        },
        taskId,
        record.assignedAgentId,
      );
      events.push(assignEvent);
      record.eventIds.push(assignEvent.id);
    }

    // Update tagIndex for the new task's tags
    const newTagIndex = { ...get().tagIndex };
    if (record.tags.length > 0) {
      addToTagIndex(newTagIndex, taskId, record.tags);
    }

    set((state) => ({
      tasks:          { ...state.tasks, [taskId]: record },
      assignments:    newAssignments,
      agentTaskIndex: newAgentTaskIdx,
      tagIndex:       newTagIndex,
      events:         [...state.events, ...events],
    }));

    return taskId;
  },

  // ── assignTask ─────────────────────────────────────────────────────────

  assignTask: (taskId: string, agentId: string): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;

      const now    = Date.now();
      const events: TaskStoreEvent[] = [];
      let newAssignments  = { ...state.assignments };
      let newAgentTaskIdx = { ...state.agentTaskIndex };

      // Remove previous assignment if any
      const prevAssignment = newAssignments[taskId];
      if (prevAssignment && prevAssignment.agentId !== agentId) {
        const unassignEvent = makeEvent(
          "task.unassigned",
          {
            task_id:       taskId,
            prev_agent_id: prevAssignment.agentId,
            reason:        "reassigned",
          },
          taskId,
          prevAssignment.agentId,
        );
        events.push(unassignEvent);

        // Remove from old agent's index
        const oldAgentTasks = newAgentTaskIdx[prevAssignment.agentId] ?? [];
        newAgentTaskIdx[prevAssignment.agentId] = oldAgentTasks.filter(
          (id) => id !== taskId,
        );
        delete newAssignments[taskId];
      }

      // Create new assignment
      const assignment: TaskAgentAssignment = {
        taskId,
        agentId,
        assignedTs: now,
        priority:   task.priority,
        status:     task.status,
      };
      newAssignments[taskId] = assignment;

      // Update new agent's index
      const newAgentTasks = newAgentTaskIdx[agentId] ?? [];
      if (!newAgentTasks.includes(taskId)) {
        newAgentTaskIdx[agentId] = [...newAgentTasks, taskId];
      }

      const assignEvent = makeEvent(
        "task.assigned",
        {
          task_id:   taskId,
          agent_id:  agentId,
          priority:  task.priority,
          status:    task.status,
        },
        taskId,
        agentId,
      );
      events.push(assignEvent);

      // Update task record
      const updatedTask: TaskRecord = {
        ...task,
        assignedAgentId: agentId,
        updatedTs: now,
        eventIds:  [...task.eventIds, ...events.map((e) => e.id)],
      };

      // Mirror to agent store if status is "active"
      if (task.status === "active") {
        const agentStore = getAgentStore();
        if (agentStore?.agents[agentId]) {
          try {
            agentStore.startAgentTask(agentId, taskId, task.title);
          } catch {
            // Non-fatal — agent store may not be ready
          }
        }
      }

      return {
        tasks:          { ...state.tasks, [taskId]: updatedTask },
        assignments:    newAssignments,
        agentTaskIndex: newAgentTaskIdx,
        events:         [...state.events, ...events],
      };
    });
  },

  // ── unassignTask ───────────────────────────────────────────────────────

  unassignTask: (taskId: string): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task || !task.assignedAgentId) return state;

      const prevAgentId   = task.assignedAgentId;
      const now           = Date.now();
      const newAssignments = { ...state.assignments };
      delete newAssignments[taskId];

      const newAgentTaskIdx = { ...state.agentTaskIndex };
      const agentTasks = newAgentTaskIdx[prevAgentId] ?? [];
      newAgentTaskIdx[prevAgentId] = agentTasks.filter((id) => id !== taskId);

      const unassignEvent = makeEvent(
        "task.unassigned",
        {
          task_id:       taskId,
          prev_agent_id: prevAgentId,
          reason:        "manual_unassign",
        },
        taskId,
        prevAgentId,
      );

      const updatedTask: TaskRecord = {
        ...task,
        assignedAgentId: null,
        updatedTs:       now,
        eventIds:        [...task.eventIds, unassignEvent.id],
      };

      return {
        tasks:          { ...state.tasks, [taskId]: updatedTask },
        assignments:    newAssignments,
        agentTaskIndex: newAgentTaskIdx,
        events:         [...state.events, unassignEvent],
      };
    });
  },

  // ── transitionTask ─────────────────────────────────────────────────────

  transitionTask: (taskId: string, toStatus: TaskStatus): boolean => {
    const task = get().tasks[taskId];
    if (!task) return false;
    if (!canTaskTransition(task.status, toStatus)) return false;

    const now = Date.now();
    const prevStatus = task.status;

    let startedTs   = task.startedTs;
    let completedTs = task.completedTs;

    if (toStatus === "active" && !startedTs) {
      startedTs = now;
    }
    if (isTaskTerminal(toStatus)) {
      completedTs = now;
    }

    const statusEvent = makeEvent(
      "task.status_changed",
      {
        task_id:     taskId,
        prev_status: prevStatus,
        status:      toStatus,
        agent_id:    task.assignedAgentId,
      },
      taskId,
      task.assignedAgentId ?? undefined,
    );

    const updatedTask: TaskRecord = {
      ...task,
      status:      toStatus,
      startedTs,
      completedTs,
      updatedTs:   now,
      eventIds:    [...task.eventIds, statusEvent.id],
    };

    // Update assignment status cache
    const newAssignments = { ...get().assignments };
    if (newAssignments[taskId]) {
      newAssignments[taskId] = {
        ...newAssignments[taskId],
        status: toStatus,
      };
    }

    set((state) => ({
      tasks:       { ...state.tasks, [taskId]: updatedTask },
      assignments: newAssignments,
      events:      [...state.events, statusEvent],
    }));

    // ── Agent-store side effects ────────────────────────────────────────
    // These are called AFTER set() to ensure store is updated first.
    if (task.assignedAgentId) {
      const agentStore = getAgentStore();
      if (agentStore?.agents[task.assignedAgentId]) {
        try {
          if (toStatus === "active") {
            // Task became active → mirror to agent-store as "active"
            agentStore.startAgentTask(
              task.assignedAgentId,
              taskId,
              task.title,
            );
          } else if (toStatus === "done") {
            agentStore.completeAgentTask(task.assignedAgentId, "success");
          } else if (toStatus === "failed") {
            agentStore.completeAgentTask(task.assignedAgentId, "failure");
          } else if (toStatus === "cancelled") {
            agentStore.completeAgentTask(task.assignedAgentId, "cancelled");
          } else if (toStatus === "blocked") {
            // Blocked task: mark agent as idle (waiting)
            agentStore.changeAgentStatus(task.assignedAgentId, "idle", "task_blocked");
          } else if (toStatus === "review") {
            // Task under review: agent can work on something else
            agentStore.changeAgentStatus(task.assignedAgentId, "idle", "task_in_review");
          }
        } catch {
          // Non-fatal — agent store bridge is optional
        }
      }
    }

    // Cancelled tasks should be unassigned
    if (toStatus === "cancelled" && task.assignedAgentId) {
      get().unassignTask(taskId);
    }

    return true;
  },

  // ── setTaskPriority ────────────────────────────────────────────────────

  setTaskPriority: (taskId: string, priority: TaskPriority): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task || task.priority === priority) return state;

      const now = Date.now();
      const priorityEvent = makeEvent(
        "task.priority_changed",
        {
          task_id:       taskId,
          prev_priority: task.priority,
          priority,
          agent_id:      task.assignedAgentId,
        },
        taskId,
        task.assignedAgentId ?? undefined,
      );

      const updatedTask: TaskRecord = {
        ...task,
        priority,
        updatedTs: now,
        eventIds:  [...task.eventIds, priorityEvent.id],
      };

      // Sync assignment cache
      const newAssignments = { ...state.assignments };
      if (newAssignments[taskId]) {
        newAssignments[taskId] = { ...newAssignments[taskId], priority };
      }

      return {
        tasks:       { ...state.tasks, [taskId]: updatedTask },
        assignments: newAssignments,
        events:      [...state.events, priorityEvent],
      };
    });
  },

  // ── updateTaskTitle ────────────────────────────────────────────────────

  updateTaskTitle: (taskId: string, title: string, description?: string): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;

      const now = Date.now();
      const titleEvent = makeEvent(
        "task.title_updated",
        {
          task_id:      taskId,
          prev_title:   task.title,
          title,
          description:  description ?? task.description,
        },
        taskId,
      );

      const updatedTask: TaskRecord = {
        ...task,
        title,
        description: description !== undefined ? description : task.description,
        updatedTs:   now,
        eventIds:    [...task.eventIds, titleEvent.id],
      };

      return {
        tasks:  { ...state.tasks, [taskId]: updatedTask },
        events: [...state.events, titleEvent],
      };
    });
  },

  // ── setTaskTags ────────────────────────────────────────────────────────

  setTaskTags: (taskId: string, tags: string[]): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;

      const now = Date.now();
      const tagEvent = makeEvent(
        "task.tagged",
        {
          task_id:   taskId,
          prev_tags: task.tags,
          tags,
        },
        taskId,
      );

      const updatedTask: TaskRecord = {
        ...task,
        tags,
        updatedTs: now,
        eventIds:  [...task.eventIds, tagEvent.id],
      };

      // Update tagIndex: remove from old tags, add to new tags
      const newTagIndex = { ...state.tagIndex };
      removeFromTagIndex(newTagIndex, taskId, task.tags);
      addToTagIndex(newTagIndex, taskId, tags);

      return {
        tasks:    { ...state.tasks, [taskId]: updatedTask },
        tagIndex: newTagIndex,
        events:   [...state.events, tagEvent],
      };
    });
  },

  // ── deleteTask ─────────────────────────────────────────────────────────

  deleteTask: (taskId: string): void => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;

      const deleteEvent = makeEvent(
        "task.deleted",
        {
          task_id:  taskId,
          agent_id: task.assignedAgentId,
          status:   task.status,
        },
        taskId,
        task.assignedAgentId ?? undefined,
      );

      const newTasks = { ...state.tasks };
      delete newTasks[taskId];

      const newAssignments = { ...state.assignments };
      delete newAssignments[taskId];

      const newAgentTaskIdx = { ...state.agentTaskIndex };
      if (task.assignedAgentId) {
        const agentTasks = newAgentTaskIdx[task.assignedAgentId] ?? [];
        newAgentTaskIdx[task.assignedAgentId] = agentTasks.filter(
          (id) => id !== taskId,
        );
      }

      // Remove task from tagIndex
      const newTagIndex = { ...state.tagIndex };
      removeFromTagIndex(newTagIndex, taskId, task.tags);

      return {
        tasks:          newTasks,
        assignments:    newAssignments,
        agentTaskIndex: newAgentTaskIdx,
        tagIndex:       newTagIndex,
        events:         [...state.events, deleteEvent],
      };
    });
  },

  // ── bulkLoadTasks ──────────────────────────────────────────────────────

  bulkLoadTasks: (tasks: TaskRecord[]): void => {
    if (tasks.length === 0) return;

    const now = Date.now();
    const newTasks = { ...get().tasks };

    for (const t of tasks) {
      newTasks[t.taskId] = { ...t };
    }

    // Rebuild assignment indexes from scratch
    const newAssignments: Record<string, TaskAgentAssignment> = {};
    for (const t of Object.values(newTasks)) {
      if (t.assignedAgentId && !isTaskTerminal(t.status)) {
        newAssignments[t.taskId] = {
          taskId:     t.taskId,
          agentId:    t.assignedAgentId,
          assignedTs: t.updatedTs,
          priority:   t.priority,
          status:     t.status,
        };
      }
    }

    const newAgentTaskIdx = buildAgentTaskIndex(newAssignments);
    // Rebuild tagIndex from full task set (includes pre-existing + new tasks)
    const newTagIndex = buildTagIndex(newTasks);

    const bulkEvent = makeEvent(
      "tasks.bulk_loaded",
      {
        count:    tasks.length,
        task_ids: tasks.map((t) => t.taskId),
        ts:       now,
      },
    );

    set((state) => ({
      tasks:          newTasks,
      assignments:    newAssignments,
      agentTaskIndex: newAgentTaskIdx,
      tagIndex:       newTagIndex,
      events:         [...state.events, bulkEvent],
    }));
  },

  // ── Queries ────────────────────────────────────────────────────────────

  getTask: (taskId: string): TaskRecord | undefined =>
    get().tasks[taskId],

  getAgentForTask: (taskId: string): string | null =>
    get().tasks[taskId]?.assignedAgentId ?? null,

  getTasksForAgent: (agentId: string): TaskRecord[] => {
    const { tasks, agentTaskIndex } = get();
    const ids = agentTaskIndex[agentId] ?? [];
    return ids
      .map((id) => tasks[id])
      .filter(Boolean)
      .sort(sortByPriorityThenTs);
  },

  getTasksByStatus: (status: TaskStatus): TaskRecord[] =>
    Object.values(get().tasks).filter((t) => t.status === status),

  getTasksByPriority: (priority: TaskPriority): TaskRecord[] =>
    Object.values(get().tasks).filter((t) => t.priority === priority),

  getTasksSorted: (statuses?: TaskStatus[]): TaskRecord[] => {
    let all = Object.values(get().tasks);
    if (statuses && statuses.length > 0) {
      const statusSet = new Set(statuses);
      all = all.filter((t) => statusSet.has(t.status));
    }
    return all.sort(sortByPriorityThenTs);
  },

  getUnassignedTasks: (): TaskRecord[] =>
    Object.values(get().tasks).filter(
      (t) => t.assignedAgentId === null && !isTaskTerminal(t.status),
    ),

  getAllTasks: (): TaskRecord[] => Object.values(get().tasks),

  getTaskStatusCounts: (): Record<TaskStatus, number> => {
    const counts: Record<TaskStatus, number> = {
      draft:     0,
      planned:   0,
      assigned:  0,
      active:    0,
      blocked:   0,
      review:    0,
      done:      0,
      failed:    0,
      cancelled: 0,
    };
    for (const task of Object.values(get().tasks)) {
      counts[task.status]++;
    }
    return counts;
  },

  // ── Sub-AC 15b: Scalable queries ──────────────────────────────────────────

  getTasksByTag: (tag: string): TaskRecord[] => {
    const { tasks, tagIndex } = get();
    const ids = tagIndex[tag] ?? [];
    return ids.map((id) => tasks[id]).filter(Boolean as unknown as (t: TaskRecord | undefined) => t is TaskRecord);
  },

  getAllTags: (): string[] => Object.keys(get().tagIndex).sort(),

  filterTasks: (filter: TaskFilter): TaskRecord[] => {
    const allTasks = Object.values(get().tasks);
    return applyFilter(allTasks, filter).sort(sortByPriorityThenTs);
  },

  getTasksPaginated: (filter: TaskFilter, page: number, pageSize = 25): TaskPage => {
    const { tasks } = get();
    const allTasks      = Object.values(tasks);
    const totalCount    = allTasks.length;
    const filtered      = applyFilter(allTasks, filter).sort(sortByPriorityThenTs);
    const filteredCount = filtered.length;
    const totalPages    = Math.max(1, Math.ceil(filteredCount / pageSize));
    // Clamp page to valid range
    const safePage      = Math.max(0, Math.min(page, totalPages - 1));
    const start         = safePage * pageSize;
    const pageTasks     = filtered.slice(start, start + pageSize);

    return {
      tasks:         pageTasks,
      totalCount,
      filteredCount,
      page:          safePage,
      pageSize,
      totalPages,
    };
  },
}));
