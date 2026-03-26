/**
 * task-group-types.ts — Data model for the task_group entity.
 *
 * Sub-AC 2 (AC 15): Implements the task_group entity that provides
 * windowed/paginated access to tasks, supporting tens to hundreds of tasks
 * with virtualized list rendering so only the visible task window is
 * materialized in the 3D scene.
 *
 * ── Behavioral Contract (what a task_group CAN DO) ────────────────────────
 *
 * A task_group is NOT a passive data bucket — it is an active entity whose
 * behavioral contract includes:
 *
 *   NAVIGATE  — advance/retreat through task pages (prev/next/goto)
 *   FILTER    — apply a TaskFilter to scope visible tasks
 *   RESIZE    — change the window size (tasks per page)
 *   OBSERVE   — expose the current window as a TaskGroupWindow
 *   SCROLL    — smooth-scroll to a specific taskId within the group
 *   RESET     — return window to page 0
 *
 * This prevents noun-verb asymmetry: the entity declares capabilities
 * alongside its structural definition, ensuring the 3D scene and HUD
 * panels can reason about what the group can DO, not just what it IS.
 *
 * ── Ontology Classification ───────────────────────────────────────────────
 *
 * Layer:       INFRASTRUCTURE (how the system processes intent)
 * Invariant:   Does not regress domain-level task behavior
 * Reflexive:   Can represent itself (task_group groups can track other
 *              task_groups as meta-tasks if parentTaskId references are used)
 *
 * ── Record Transparency ───────────────────────────────────────────────────
 *
 * All mutations append to the event log (task_group.created,
 * task_group.page_changed, task_group.filter_changed, etc.).
 * The window position is fully reconstructable from the event stream.
 */

import type { TaskFilter } from "./task-types.js";

// ── Behavioral Contract ─────────────────────────────────────────────────────

/**
 * The behavioral contract for a task_group entity.
 * Declares all ACTIONS the entity can perform (not just its structure).
 *
 * Each method maps to a corresponding action in task-group-store.
 */
export interface TaskGroupBehavioralContract {
  /** Advance the window to the next page. No-op if already on the last page. */
  nextPage(groupId: string): void;

  /** Retreat the window to the previous page. No-op if already on page 0. */
  prevPage(groupId: string): void;

  /** Jump to a specific page index. Clamped to valid range. */
  gotoPage(groupId: string, page: number): void;

  /** Replace the active filter. Resets window to page 0. */
  setFilter(groupId: string, filter: TaskFilter): void;

  /** Change the number of tasks materialized per page. Resets to page 0. */
  setWindowSize(groupId: string, windowSize: number): void;

  /**
   * Focus the window on the page containing a specific taskId.
   * No-op if the taskId is not in the group's filtered set.
   */
  scrollToTask(groupId: string, taskId: string): void;

  /** Reset the window to page 0 without changing the filter. */
  resetWindow(groupId: string): void;
}

// ── TaskGroup Entity ─────────────────────────────────────────────────────────

/**
 * The task_group entity.
 *
 * A task_group is a named, filterable view over the task-store with an
 * active page window.  It does not own tasks — it projects a slice of the
 * task-store based on its filter configuration.
 *
 * Multiple task_groups can coexist (e.g. "Agent Alpha's tasks",
 * "Blocked tasks", "This sprint").  Each group maintains independent
 * pagination state so the 3D scene can materialize only one page's worth
 * of 3D orbs per group.
 */
export interface TaskGroup {
  /** Unique identifier for this group (e.g. "group-agent-alpha"). */
  groupId: string;

  /** Human-readable display name shown in the 3D scene panel. */
  name: string;

  /**
   * Optional short description of the group's purpose.
   * Displayed in the 3D diegetic panel when the group is selected.
   */
  description?: string;

  /**
   * The filter applied to the task-store to scope this group's tasks.
   * The group's window renders tasks matching this filter only.
   */
  filter: TaskFilter;

  /**
   * Number of tasks rendered per page (the virtual window size).
   *
   * This is the maximum number of 3D task orbs materialized at once.
   * Tasks outside this window exist in the store but have NO 3D geometry.
   *
   * Recommended values:
   *   - 5–10 for dense agent views (small room panels)
   *   - 10–20 for room-level overview panels
   *   - 20–25 for the global task list panel
   *
   * @default 10
   */
  windowSize: number;

  /**
   * Zero-based index of the currently visible page.
   * Changed by nextPage/prevPage/gotoPage actions.
   */
  currentPage: number;

  /** Unix timestamp when this group was created (ms). */
  createdTs: number;

  /** Unix timestamp of the last state change (ms). */
  updatedTs: number;

  /**
   * IDs of task-group events that have modified this group.
   * Append-only — enables per-group event replay.
   */
  eventIds: string[];

  /**
   * Optional: pin this group to a specific agent's room in 3D space.
   * When set, the group panel floats above the agent's position.
   */
  pinnedAgentId?: string;

  /**
   * Optional: pin this group to a specific room.
   * When set, the group panel floats in the room's 3D volume.
   */
  pinnedRoomId?: string;
}

// ── TaskGroupWindow ──────────────────────────────────────────────────────────

/**
 * The visible window of tasks for a task_group at a point in time.
 *
 * This is the ONLY data that should be materialized as 3D objects.
 * Tasks not in the window exist in the store but must not have 3D geometry.
 *
 * Returned by `getGroupWindow(groupId)` in the task-group-store.
 * Analogous to TaskPage but bound to a named group entity.
 */
export interface TaskGroupWindow {
  /** The group this window belongs to. */
  groupId: string;

  /** The group's display name (convenience copy). */
  groupName: string;

  /**
   * The task records visible in the current window.
   * Maximum length = group.windowSize.
   * These are the ONLY tasks that should become 3D scene nodes.
   */
  visibleTasks: import("./task-types.js").TaskRecord[];

  /** Total tasks in the store before any filtering. */
  totalStoreCount: number;

  /** Tasks matching the group's filter (before pagination). */
  filteredCount: number;

  /** Currently active page index (zero-based). */
  currentPage: number;

  /** Maximum tasks per page for this group. */
  windowSize: number;

  /** Total pages given filteredCount and windowSize. */
  totalPages: number;

  /** True if there is a page before the current one. */
  hasPrev: boolean;

  /** True if there is a page after the current one. */
  hasNext: boolean;

  /**
   * Window metadata for diegetic display.
   * Shows "3-12 of 47" style labels in the 3D panel.
   */
  windowLabel: string;
}

// ── Task Group Input ─────────────────────────────────────────────────────────

/**
 * Input shape for creating a new task_group via `createTaskGroup()`.
 */
export interface CreateTaskGroupInput {
  /** Required: human-readable name for the group. */
  name: string;

  /** Optional description. */
  description?: string;

  /** Filter to scope the group's tasks. Defaults to {} (all non-terminal tasks). */
  filter?: TaskFilter;

  /** Tasks per page. Defaults to 10. */
  windowSize?: number;

  /** Pin this group to a specific agent in the 3D scene. */
  pinnedAgentId?: string;

  /** Pin this group to a specific room in the 3D scene. */
  pinnedRoomId?: string;
}

// ── Event Sourcing ───────────────────────────────────────────────────────────

/**
 * Append-only event types for the task-group-store event log.
 * Every mutation to a task_group appends one of these events.
 */
export type TaskGroupEventType =
  | "task_group.created"        // New group created
  | "task_group.page_changed"   // currentPage updated (next/prev/goto)
  | "task_group.filter_changed" // filter replaced (resets to page 0)
  | "task_group.window_resized" // windowSize changed (resets to page 0)
  | "task_group.pin_changed"    // pinnedAgentId / pinnedRoomId updated
  | "task_group.deleted";       // Group removed

export interface TaskGroupEvent {
  /** Unique event ID. */
  id: string;

  /** Event type. */
  type: TaskGroupEventType;

  /** Unix timestamp (ms). */
  ts: number;

  /** The affected group ID. */
  groupId: string;

  /** Arbitrary payload carrying before/after values. */
  payload: Record<string, unknown>;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the window label string for a TaskGroupWindow.
 * Returns a string like "1-10 of 47" for display in the 3D panel.
 *
 * Pure function — no store dependency — fully testable.
 *
 * @param filteredCount  - Total tasks matching the filter.
 * @param currentPage    - Zero-based page index.
 * @param windowSize     - Tasks per page.
 */
export function computeWindowLabel(
  filteredCount: number,
  currentPage: number,
  windowSize: number,
): string {
  if (filteredCount === 0) return "0 tasks";
  const start = currentPage * windowSize + 1;
  const end   = Math.min(start + windowSize - 1, filteredCount);
  return `${start}–${end} of ${filteredCount}`;
}

/**
 * Clamp a requested page index to the valid range [0, totalPages - 1].
 *
 * @param requestedPage - The page index requested.
 * @param totalPages    - Total number of pages (>= 1).
 * @returns             The clamped page index.
 */
export function clampPage(requestedPage: number, totalPages: number): number {
  const maxPage = Math.max(0, totalPages - 1);
  return Math.max(0, Math.min(maxPage, requestedPage));
}

/**
 * Compute the page index that contains a specific item index.
 *
 * @param itemIndex  - Zero-based position of the item in the filtered list.
 * @param windowSize - Items per page.
 * @returns          The zero-based page index containing this item.
 */
export function pageForItemIndex(itemIndex: number, windowSize: number): number {
  if (windowSize <= 0) return 0;
  return Math.floor(itemIndex / windowSize);
}
