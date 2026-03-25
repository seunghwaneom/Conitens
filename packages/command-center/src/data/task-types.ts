/**
 * task-types.ts — Data model for task-agent mapping.
 *
 * Defines the types used by the task-store to track which tasks are assigned
 * to which agents, including status, priority, and full task metadata.
 *
 * Task state machine is shared with @conitens/protocol (task-state.ts):
 *   draft → planned → assigned → active → blocked / review → done / failed / cancelled
 *
 * Sub-AC 5.1: Task-agent mapping data model.
 */

// ── Task Priority ──────────────────────────────────────────────────────────

/**
 * Task priority levels — ordered from highest to lowest urgency.
 * Used to sort task queues and drive visual urgency cues in the 3D UI.
 */
export type TaskPriority = "critical" | "high" | "normal" | "low";

/** Numeric weight for sorting (higher = more urgent). */
export const TASK_PRIORITY_WEIGHT: Readonly<Record<TaskPriority, number>> = {
  critical: 4,
  high:     3,
  normal:   2,
  low:      1,
};

/** Human-readable label for each priority. */
export const TASK_PRIORITY_LABEL: Readonly<Record<TaskPriority, string>> = {
  critical: "Critical",
  high:     "High",
  normal:   "Normal",
  low:      "Low",
};

/** Color accent for each priority (dark-theme command-center palette). */
export const TASK_PRIORITY_COLOR: Readonly<Record<TaskPriority, string>> = {
  critical: "#FF3D00",
  high:     "#FF9100",
  normal:   "#40C4FF",
  low:      "#B2DFDB",
};

// ── Task State ─────────────────────────────────────────────────────────────
// Mirror of @conitens/protocol task-state.ts — re-defined here so the
// command-center data layer can be used without a hard runtime dependency on
// the protocol package (browser bundle is type-only for that package).

export const TASK_STATES = [
  "draft", "planned", "assigned", "active",
  "blocked", "review", "done", "failed", "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATES)[number];

export const TERMINAL_TASK_STATES: ReadonlySet<TaskStatus> = new Set([
  "done", "cancelled",
] as TaskStatus[]);

export const ACTIVE_TASK_STATES: ReadonlySet<TaskStatus> = new Set([
  "assigned", "active", "blocked", "review",
] as TaskStatus[]);

export const VALID_TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  draft:     ["planned", "cancelled"],
  planned:   ["assigned", "cancelled"],
  assigned:  ["active", "cancelled"],
  active:    ["blocked", "review", "failed", "cancelled"],
  blocked:   ["active", "failed", "cancelled"],
  review:    ["done", "active", "failed", "cancelled"],
  done:      [],
  failed:    ["assigned"],
  cancelled: [],
};

/**
 * Returns true if transitioning from `from` → `to` is a valid move.
 * Mirrors the protocol-level `canTransition` function.
 */
export function canTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[from].includes(to);
}

export function isTaskTerminal(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATES.has(status);
}

export function isTaskActive(status: TaskStatus): boolean {
  return ACTIVE_TASK_STATES.has(status);
}

// ── Task Record ────────────────────────────────────────────────────────────

/**
 * Full task record — the canonical unit stored in task-store.
 *
 * Every field that changes over the task lifecycle is tracked here.
 * Historical mutations are captured in the task-store event log (event sourced).
 */
export interface TaskRecord {
  /** Unique task ID (e.g. "task-abc123"). */
  taskId: string;

  /** Short human-readable title. */
  title: string;

  /** Optional longer description / goal statement. */
  description?: string;

  /** Current lifecycle status. */
  status: TaskStatus;

  /** Task priority. */
  priority: TaskPriority;

  /** Agent ID currently assigned to this task (null if unassigned). */
  assignedAgentId: string | null;

  /** Creation timestamp (ms since epoch). */
  createdTs: number;

  /** Last mutation timestamp (ms since epoch). */
  updatedTs: number;

  /** Timestamp when the task was first transitioned to "active" (null until then). */
  startedTs: number | null;

  /** Timestamp when the task reached a terminal state (null until then). */
  completedTs: number | null;

  /**
   * Parent task ID for sub-task relationships.
   * Null for top-level tasks.
   */
  parentTaskId: string | null;

  /**
   * Arbitrary tags for filtering / grouping.
   * Examples: ["frontend", "ac-5", "perf"].
   */
  tags: string[];

  /**
   * IDs of task-store events that have modified this task.
   * Append-only — enables per-task event replay.
   */
  eventIds: string[];
}

// ── Task-Agent Assignment ──────────────────────────────────────────────────

/**
 * Lightweight assignment record — maps one task to one agent.
 *
 * This mirrors the task's `assignedAgentId` field but is kept as a separate
 * index entry so consumers can efficiently query:
 *   - "which agent owns this task?"  → assignments[taskId]
 *   - "which tasks does this agent own?" → agentTaskIndex[agentId]
 *
 * The assignment is considered "live" as long as
 * `isTaskActive(status)` is true (the task is not yet in a terminal state).
 */
export interface TaskAgentAssignment {
  /** The task being assigned. */
  taskId: string;

  /** The agent receiving the assignment. */
  agentId: string;

  /** When the assignment was created (ms since epoch). */
  assignedTs: number;

  /** Cached priority from the task record for quick comparisons. */
  priority: TaskPriority;

  /** Cached status from the task record for quick status checks. */
  status: TaskStatus;
}

// ── Input / Builder helpers ────────────────────────────────────────────────

/**
 * Input shape for creating a new task via `task-store.createTask()`.
 */
export interface CreateTaskInput {
  /** Required: human-readable title. */
  title: string;

  /** Optional description. */
  description?: string;

  /** Priority (defaults to "normal"). */
  priority?: TaskPriority;

  /** Immediately assign to an agent (defaults to null — unassigned). */
  assignedAgentId?: string | null;

  /** Parent task reference. */
  parentTaskId?: string | null;

  /** Initial tags. */
  tags?: string[];

  /** Explicit initial status (defaults to "draft"). */
  initialStatus?: TaskStatus;
}

// ── Filtering & Pagination ─────────────────────────────────────────────────

/**
 * Multi-criteria filter for task queries.
 *
 * All criteria are ANDed together. Omitted fields are not filtered on.
 * Arrays (statuses, priorities, agentIds, tags) use OR within the array:
 *   e.g. statuses: ["active", "blocked"] matches tasks in either state.
 */
export interface TaskFilter {
  /** Only include tasks in these statuses (OR). */
  statuses?: TaskStatus[];

  /** Only include tasks at these priorities (OR). */
  priorities?: TaskPriority[];

  /** Only include tasks assigned to these agents (OR). Use ["__unassigned__"] to filter for unassigned tasks. */
  agentIds?: string[];

  /** Only include tasks that have ALL of these tags (AND). */
  tags?: string[];

  /**
   * Case-insensitive substring search against task title and description.
   * Matches if the search text appears in either field.
   */
  searchText?: string;

  /**
   * Include tasks in terminal states (done, cancelled)?
   * Defaults to false — terminal tasks are hidden by default.
   */
  includeTerminal?: boolean;

  /**
   * Filter to sub-tasks of a specific parent.
   * Set to null to filter only top-level tasks.
   * Omit (undefined) to not filter on parentTaskId.
   */
  parentTaskId?: string | null;
}

/**
 * A paginated result of task records.
 *
 * Returned by `getTasksPaginated()`.
 */
export interface TaskPage {
  /** The task records for this page. */
  tasks: TaskRecord[];

  /** Total tasks in the store (before filtering). */
  totalCount: number;

  /** Tasks matching the current filter (before pagination). */
  filteredCount: number;

  /** Zero-based page index. */
  page: number;

  /** Number of tasks per page. */
  pageSize: number;

  /** Total number of pages given filteredCount and pageSize. */
  totalPages: number;
}

// ── Store Event Types ──────────────────────────────────────────────────────

/**
 * Append-only event types for the task-store event log.
 * Each action that changes store state emits one of these.
 */
export type TaskStoreEventType =
  | "task.created"        // New task created
  | "task.assigned"       // Agent assigned to task
  | "task.unassigned"     // Agent removed from task
  | "task.status_changed" // Task state machine transition
  | "task.priority_changed" // Priority updated
  | "task.title_updated"  // Title / description changed
  | "task.tagged"         // Tags updated
  | "task.deleted"        // Task removed from store
  | "tasks.bulk_loaded";  // Multiple tasks loaded at once (e.g. from WS snapshot)

export interface TaskStoreEvent {
  /** Unique event ID. */
  id: string;

  /** Event type. */
  type: TaskStoreEventType;

  /** Unix timestamp (ms). */
  ts: number;

  /** The affected task ID (undefined for bulk events). */
  taskId?: string;

  /** The affected agent ID (for assignment events). */
  agentId?: string;

  /** Arbitrary payload carrying before/after values. */
  payload: Record<string, unknown>;
}
