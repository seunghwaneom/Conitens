/**
 * use-task-management.ts — Zustand store + hook for task management panel.
 *
 * Sub-AC 7b: Task management controls (create / cancel / reprioritize)
 * accessible from 3D room or agent context.
 *
 * This store drives the TaskManagementPanel UI — a floating overlay that
 * appears when the user selects a task management action from a 3D context
 * menu on an agent capsule or room volume.
 *
 * Panel modes
 * ───────────
 *   "create"       — Show task creation form (title, description,
 *                    priority, optional assignee pre-populated from context).
 *   "cancel"       — Confirmation dialog before emitting task.cancel command.
 *   "reprioritize" — Priority picker; emits task.update_spec command with
 *                    new priority field.
 *   null           — Panel hidden (no-op renders).
 *
 * Context tracking
 * ────────────────
 * The panel remembers which 3D entity (agent or room) triggered it so the
 * creation form can pre-populate the assignee / room fields without requiring
 * the user to re-enter context they already have.
 *
 * Command transparency
 * ────────────────────
 * This store only manages local UI state (visibility, form context).
 * Actual orchestration_commands are written by TaskManagementPanel via
 * `useActionDispatcher().handleTaskAction()`, which calls the command-file
 * writer and appends events to the task-store's event log.
 */

import { create } from "zustand";
import type { TaskPriority, TaskStatus } from "../data/task-types.js";

// ── Types ──────────────────────────────────────────────────────────────────

/** Which operation the task management panel is performing. */
export type TaskManagementMode = "create" | "cancel" | "reprioritize" | null;

/** Which 3D entity type triggered the panel. */
export type TaskManagementOriginType = "agent" | "room" | "task" | null;

/** Persistent state for the task management panel. */
export interface TaskManagementState {
  // ── Panel visibility ──────────────────────────────────────────────────────

  /** Current operation mode; null means panel is closed. */
  mode: TaskManagementMode;

  // ── Context: which entity opened the panel ────────────────────────────────

  /** Type of 3D entity that triggered the panel. */
  originType: TaskManagementOriginType;

  /**
   * ID of the 3D entity that triggered the panel.
   * For "create" from agent context: the agentId to pre-fill as assignee.
   * For "create" from room context: the roomId used to look up available agents.
   */
  originId: string | null;

  // ── For cancel / reprioritize: target task metadata ───────────────────────

  /** Task ID being cancelled or reprioritized. Null in "create" mode. */
  targetTaskId: string | null;

  /** Human-readable task title shown in confirmation / picker header. */
  targetTaskTitle: string | null;

  /** Current task status (used to gate cancel availability). */
  targetTaskStatus: TaskStatus | null;

  /** Current priority of the task being reprioritized. */
  targetTaskPriority: TaskPriority | null;

  // ── Event log (append-only UI audit trail) ────────────────────────────────

  /**
   * Append-only log of panel open/close/submit events.
   * Enables GUI self-improvement agent to analyse which task management
   * actions users perform most frequently and optimize panel UX accordingly.
   */
  panelEvents: TaskManagementEvent[];

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Open the "create task" form.
   * @param originType  The entity type that triggered this (agent or room).
   * @param originId    The entity ID (agent_id or room_id) for context pre-fill.
   */
  openCreateTask: (originType: TaskManagementOriginType, originId: string) => void;

  /**
   * Open the "cancel task" confirmation dialog.
   * @param taskId     The task to cancel.
   * @param taskTitle  Shown in the confirmation header.
   * @param taskStatus Current status (guards non-cancellable terminal tasks).
   */
  openCancelTask: (
    taskId: string,
    taskTitle: string,
    taskStatus: TaskStatus,
  ) => void;

  /**
   * Open the "reprioritize task" priority picker.
   * @param taskId          Task to reprioritize.
   * @param taskTitle       Shown in the picker header.
   * @param currentPriority Pre-selects the current priority level.
   */
  openReprioritizeTask: (
    taskId: string,
    taskTitle: string,
    currentPriority: TaskPriority,
  ) => void;

  /** Close the panel without taking action. */
  close: () => void;

  /** Record a panel lifecycle event for the UI audit trail. */
  recordPanelEvent: (type: TaskManagementEventType, meta?: Record<string, unknown>) => void;
}

// ── Panel Event Types (UI audit trail) ────────────────────────────────────

export type TaskManagementEventType =
  | "panel.opened_create"
  | "panel.opened_cancel"
  | "panel.opened_reprioritize"
  | "panel.closed"
  | "panel.submitted_create"
  | "panel.submitted_cancel"
  | "panel.submitted_reprioritize"
  | "panel.cancelled_by_user";

export interface TaskManagementEvent {
  id: string;
  type: TaskManagementEventType;
  ts: number;
  meta?: Record<string, unknown>;
}

// ── ID generator ──────────────────────────────────────────────────────────

let _eventCounter = 0;
function nextEventId(): string {
  return `tme-${Date.now()}-${++_eventCounter}`;
}

// ── Max panel event log size ───────────────────────────────────────────────
const MAX_PANEL_EVENTS = 200;

// ── Store ──────────────────────────────────────────────────────────────────

export const useTaskManagementStore = create<TaskManagementState>((set, get) => ({
  mode:               null,
  originType:         null,
  originId:           null,
  targetTaskId:       null,
  targetTaskTitle:    null,
  targetTaskStatus:   null,
  targetTaskPriority: null,
  panelEvents:        [],

  // ── openCreateTask ─────────────────────────────────────────────────────

  openCreateTask: (originType, originId) => {
    set({
      mode:               "create",
      originType,
      originId,
      targetTaskId:       null,
      targetTaskTitle:    null,
      targetTaskStatus:   null,
      targetTaskPriority: null,
    });
    get().recordPanelEvent("panel.opened_create", { originType, originId });
  },

  // ── openCancelTask ─────────────────────────────────────────────────────

  openCancelTask: (taskId, taskTitle, taskStatus) => {
    set({
      mode:               "cancel",
      originType:         "task",
      originId:           taskId,
      targetTaskId:       taskId,
      targetTaskTitle:    taskTitle,
      targetTaskStatus:   taskStatus,
      targetTaskPriority: null,
    });
    get().recordPanelEvent("panel.opened_cancel", { taskId, taskTitle, taskStatus });
  },

  // ── openReprioritizeTask ───────────────────────────────────────────────

  openReprioritizeTask: (taskId, taskTitle, currentPriority) => {
    set({
      mode:               "reprioritize",
      originType:         "task",
      originId:           taskId,
      targetTaskId:       taskId,
      targetTaskTitle:    taskTitle,
      targetTaskStatus:   null,
      targetTaskPriority: currentPriority,
    });
    get().recordPanelEvent("panel.opened_reprioritize", {
      taskId,
      taskTitle,
      currentPriority,
    });
  },

  // ── close ──────────────────────────────────────────────────────────────

  close: () => {
    const prevMode = get().mode;
    set({
      mode:               null,
      originType:         null,
      originId:           null,
      targetTaskId:       null,
      targetTaskTitle:    null,
      targetTaskStatus:   null,
      targetTaskPriority: null,
    });
    if (prevMode !== null) {
      get().recordPanelEvent("panel.closed", { prevMode });
    }
  },

  // ── recordPanelEvent ───────────────────────────────────────────────────

  recordPanelEvent: (type, meta) => {
    const event: TaskManagementEvent = {
      id:   nextEventId(),
      type,
      ts:   Date.now(),
      meta,
    };
    set((state) => ({
      panelEvents: [...state.panelEvents, event].slice(-MAX_PANEL_EVENTS),
    }));
  },
}));

// ── Convenience selectors ─────────────────────────────────────────────────

/** Returns true if the task management panel is currently open. */
export function isTaskManagementPanelOpen(): boolean {
  return useTaskManagementStore.getState().mode !== null;
}

/**
 * `useTaskManagement` — convenience hook that returns all panel state and
 * actions. Equivalent to `useTaskManagementStore()` but with a semantic name.
 */
export function useTaskManagement(): TaskManagementState {
  return useTaskManagementStore();
}
