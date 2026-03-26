/**
 * use-task-fixture-control-plane.ts — Sub-AC 7c
 *
 * Bridges FixtureInteractionIntents emitted by spatial fixture controls
 * ON task entities (task orbs in 3D) to the task management control plane.
 *
 * Intent routing
 * ──────────────
 * Fixture IDs follow the pattern `{taskId}:{fixtureSuffix}`:
 *   `{taskId}:cancel`   — FixtureButton click → openCancelTask()
 *   `{taskId}:reprio`   — FixtureButton click → openReprioritizeTask()
 *   `{taskId}:menu`     — FixtureMenuAnchor open → openContextMenu with task actions
 *
 * Each of these routes through `useTaskManagementStore` (panel state) which
 * in turn dispatches `orchestration_commands` via `useActionDispatcher` when
 * the panel form is submitted.
 *
 * 3D visual representation
 * ────────────────────────
 * `buildTaskOrbFixtures(task)` returns `SpatialFixtureDescriptor[]` for a
 * task orb — colour-coded by priority and status.  The 3D representation
 * updates to reflect current status and priority because it derives from the
 * Zustand task-store which is event-sourced and updates on every mutation.
 *
 * Record transparency
 * ────────────────────
 * Every panel open triggered by a fixture click records a `panelEvents`
 * entry via `useTaskManagementStore.recordPanelEvent()`.  Orchestration
 * commands are written by `useActionDispatcher` when the panel is submitted.
 */

import { useCallback } from "react";
import { useTaskStore }           from "../store/task-store.js";
import { useTaskManagementStore } from "./use-task-management.js";
import type {
  FixtureInteractionIntent,
} from "../scene/fixture-interaction-intents.js";
import type { SpatialFixtureDescriptor } from "../scene/SpatialUiFixture.js";
import type { TaskRecord, TaskPriority, TaskStatus } from "../data/task-types.js";
import {
  TERMINAL_TASK_STATES,
  TASK_PRIORITY_COLOR,
  TASK_PRIORITY_LABEL,
} from "../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture ID helpers — encode task + action in the fixtureId string
// ─────────────────────────────────────────────────────────────────────────────

/** Separator used in fixtureId encoding. */
export const FIXTURE_ID_SEP = ":" as const;

/** Fixture suffixes for the three task control actions. */
export const TASK_FIXTURE_CANCEL_SUFFIX = "cancel" as const;
export const TASK_FIXTURE_REPRIO_SUFFIX  = "reprio" as const;
export const TASK_FIXTURE_MENU_SUFFIX    = "menu"   as const;

/** Build the canonical fixtureId for a task cancel button. */
export function taskCancelFixtureId(taskId: string): string {
  return `${taskId}${FIXTURE_ID_SEP}${TASK_FIXTURE_CANCEL_SUFFIX}`;
}

/** Build the canonical fixtureId for a task reprioritize button. */
export function taskReprioFixtureId(taskId: string): string {
  return `${taskId}${FIXTURE_ID_SEP}${TASK_FIXTURE_REPRIO_SUFFIX}`;
}

/** Build the canonical fixtureId for a task context-menu anchor. */
export function taskMenuFixtureId(taskId: string): string {
  return `${taskId}${FIXTURE_ID_SEP}${TASK_FIXTURE_MENU_SUFFIX}`;
}

/**
 * Parse a fixtureId back into `{ taskId, suffix }`.
 * Returns null if the fixtureId is not in the expected pattern.
 */
export function parseTaskFixtureId(
  fixtureId: string,
): { taskId: string; suffix: string } | null {
  const sepIdx = fixtureId.lastIndexOf(FIXTURE_ID_SEP);
  if (sepIdx === -1) return null;
  const taskId = fixtureId.slice(0, sepIdx);
  const suffix = fixtureId.slice(sepIdx + 1);
  if (!taskId || !suffix) return null;
  return { taskId, suffix };
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual config — maps task priority to Three.js numeric hex color
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a CSS hex color string (#rrggbb) to a Three.js numeric hex color.
 * Falls back to 0x40c4ff (cyan) for any unrecognised format.
 */
export function cssHexToThreeHex(css: string): number {
  const hex    = css.replace("#", "");
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0x40c4ff : parsed;
}

/** Get the Three.js hex color for the reprioritize fixture button. */
export function getTaskReprioFixtureColor(priority: TaskPriority): number {
  return cssHexToThreeHex(TASK_PRIORITY_COLOR[priority]);
}

/** Hex color for cancel fixture button (danger red). */
export const TASK_CANCEL_FIXTURE_COLOR   = 0xff3d00;
/** Hex color for menu anchor fixture (magenta menu accent). */
export const TASK_MENU_FIXTURE_COLOR     = 0xe040fb;
/** Hex color for disabled (terminal-task) fixtures. */
export const TASK_FIXTURE_DISABLED_COLOR = 0x444444;

// ─────────────────────────────────────────────────────────────────────────────
// buildTaskOrbFixtures — pure factory (no hooks, fully testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the `SpatialFixtureDescriptor[]` for a single task orb.
 *
 * Returns three fixtures:
 *   [0] cancel button    — FixtureButton, red,            disabled for terminal tasks
 *   [1] reprioritize btn — FixtureButton, priority colour, disabled for terminal tasks
 *   [2] menu anchor      — FixtureMenuAnchor, magenta,    disabled only in replay mode
 *
 * Local offsets are calibrated to float just above the orb centre
 * (ORB_FLOAT_Y = 1.65 + 0.17 headroom = 1.82) with horizontal spread.
 *
 * @param task    The task record to build fixtures for.
 * @param visible If false, all fixtures are disabled (e.g. replay mode).
 */
export function buildTaskOrbFixtures(
  task: TaskRecord,
  visible = true,
): SpatialFixtureDescriptor[] {
  const isTerminal = TERMINAL_TASK_STATES.has(task.status as TaskStatus);
  const btnDisabled = !visible || isTerminal;

  return [
    // Fixture 0: Cancel button (left of orb)
    {
      fixtureId:   taskCancelFixtureId(task.taskId),
      kind:        "button" as const,
      color:       btnDisabled ? TASK_FIXTURE_DISABLED_COLOR : TASK_CANCEL_FIXTURE_COLOR,
      disabled:    btnDisabled,
      localOffset: { x: -0.22, y: 1.82, z: 0 },
    },
    // Fixture 1: Reprioritize button (right of orb)
    {
      fixtureId:   taskReprioFixtureId(task.taskId),
      kind:        "button" as const,
      color:       btnDisabled
        ? TASK_FIXTURE_DISABLED_COLOR
        : getTaskReprioFixtureColor(task.priority),
      disabled:    btnDisabled,
      localOffset: { x: 0.22, y: 1.82, z: 0 },
    },
    // Fixture 2: Menu anchor (above the orb)
    {
      fixtureId:   taskMenuFixtureId(task.taskId),
      kind:        "menu_anchor" as const,
      color:       TASK_MENU_FIXTURE_COLOR,
      disabled:    !visible,   // menu stays enabled even for terminal tasks
      localOffset: { x: 0, y: 2.05, z: 0 },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildTaskOrbMenuEntries — pure factory for context menu content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of each entry in the task-orb context menu.
 * Passed to `contextMenuStore.openMenu()` when the menu anchor is clicked.
 */
export interface TaskOrbMenuEntry {
  label:     string;
  icon:      string;
  /** Item identifying the target entity and action. */
  item:      { entityType: "task"; entityId: string; action: string };
  variant?:  "normal" | "destructive" | "warning" | "disabled";
  separator?: boolean;
  /** Optional direct handler — bypasses ActionDispatcher when present. */
  onSelect?: () => void;
}

/**
 * Build the context menu entries for a task orb menu anchor.
 *
 * The menu provides:
 *   • View task       (select — local UI only)
 *   • Cancel task     (opens cancel panel → emits task.cancel command on confirm)
 *   • Priority submenu: Critical / High / Normal / Low
 *     (opens reprioritize panel → emits task.update_spec command on confirm)
 *
 * `onSelect` callbacks route through `useTaskManagementStore` so the correct
 * modal panel opens, and the panel's submit handler dispatches the command.
 */
export function buildTaskOrbMenuEntries(task: TaskRecord): TaskOrbMenuEntry[] {
  const isTerminal = TERMINAL_TASK_STATES.has(task.status as TaskStatus);
  const taskMgmt   = useTaskManagementStore.getState();

  return [
    {
      label:   "View task",
      icon:    "◎",
      item:    { entityType: "task", entityId: task.taskId, action: "select" },
      variant: "normal",
    },
    {
      label:    "Cancel task",
      icon:     "⊗",
      item:     { entityType: "task", entityId: task.taskId, action: "cancel" },
      variant:  isTerminal ? "disabled" : "destructive",
      separator: true,
      onSelect: isTerminal
        ? undefined
        : () => taskMgmt.openCancelTask(task.taskId, task.title, task.status),
    },
    // Priority separator header (disabled — not selectable)
    {
      label:    "── Priority ──",
      icon:     "",
      item:     { entityType: "task", entityId: task.taskId, action: "select" },
      variant:  "disabled",
      separator: true,
    },
    // Four priority options — current priority shows "← current" and is disabled
    ...( ["critical", "high", "normal", "low"] as TaskPriority[] ).map(
      (p): TaskOrbMenuEntry => ({
        label:    p === task.priority
          ? `${TASK_PRIORITY_LABEL[p]} ← current`
          : TASK_PRIORITY_LABEL[p],
        icon:     "◈",
        item:     { entityType: "task", entityId: task.taskId, action: "update_spec" },
        variant:  p === task.priority ? "disabled" : "normal",
        onSelect: p === task.priority
          ? undefined
          : () => taskMgmt.openReprioritizeTask(
              task.taskId,
              task.title,
              task.priority,  // ← current priority highlighted in the panel
            ),
      }),
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useTaskFixtureControlPlane
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return value of `useTaskFixtureControlPlane`.
 *
 * `handleFixtureIntent` — route a FixtureInteractionIntent from a task orb
 *   fixture to the task management panel. The panel then emits
 *   orchestration_commands via `useActionDispatcher`.
 *
 * `getFixturesForTask` — build the SpatialFixtureDescriptor list for a task.
 *
 * `menuEntriesForTask` — build the context menu entries for a task.
 */
export interface TaskFixtureControlPlane {
  /**
   * Route a FixtureInteractionIntent from a task-entity fixture.
   *
   * Routing table:
   *   FIXTURE_BUTTON_CLICKED + suffix="cancel"  → openCancelTask()
   *   FIXTURE_BUTTON_CLICKED + suffix="reprio"  → openReprioritizeTask()
   *   FIXTURE_MENU_ANCHOR_OPENED               → invoke `onMenuOpen` callback
   *   All other intents                        → no-op
   *
   * Opened panel actions subsequently dispatch orchestration_commands when
   * the user submits the modal form.
   */
  handleFixtureIntent: (
    intent: FixtureInteractionIntent,
    onMenuOpen?: (entries: TaskOrbMenuEntry[], x: number, y: number) => void,
  ) => void;

  /**
   * Build SpatialFixtureDescriptor[] for a given task.
   * Delegates to `buildTaskOrbFixtures(task, visible)`.
   */
  getFixturesForTask: (task: TaskRecord, visible?: boolean) => SpatialFixtureDescriptor[];

  /**
   * Build the context menu entries for a task.
   * Delegates to `buildTaskOrbMenuEntries(task)`.
   */
  menuEntriesForTask: (task: TaskRecord) => TaskOrbMenuEntry[];
}

/**
 * `useTaskFixtureControlPlane` — Sub-AC 7c hook.
 *
 * Bridges 3D fixture interaction intents on task orbs to the task management
 * command layer.  Must be called inside a React tree that has access to
 * `useTaskManagementStore` and `useTaskStore`.
 *
 * Intentionally side-effect free: only reads store state and registers
 * stable `useCallback` handlers — no subscriptions or effects created.
 */
export function useTaskFixtureControlPlane(): TaskFixtureControlPlane {
  const openCancelTask       = useTaskManagementStore((s) => s.openCancelTask);
  const openReprioritizeTask = useTaskManagementStore((s) => s.openReprioritizeTask);
  const getTask              = useTaskStore((s) => s.getTask);

  const handleFixtureIntent = useCallback(
    (
      intent: FixtureInteractionIntent,
      onMenuOpen?: (entries: TaskOrbMenuEntry[], x: number, y: number) => void,
    ): void => {
      // Only FIXTURE_BUTTON_CLICKED and FIXTURE_MENU_ANCHOR_OPENED are actionable.
      // Hover, drag, and menu-close events are silently ignored.
      if (
        intent.intent !== "FIXTURE_BUTTON_CLICKED" &&
        intent.intent !== "FIXTURE_MENU_ANCHOR_OPENED"
      ) {
        return;
      }

      const parsed = parseTaskFixtureId(intent.fixtureId);
      if (!parsed) return;

      const { taskId, suffix } = parsed;

      // ── FIXTURE_BUTTON_CLICKED routing ──────────────────────────────────

      if (intent.intent === "FIXTURE_BUTTON_CLICKED") {
        const task = getTask(taskId);
        if (!task) return;

        // Terminal-task guard: do not re-open panels for done/cancelled tasks
        if (TERMINAL_TASK_STATES.has(task.status)) return;

        if (suffix === TASK_FIXTURE_CANCEL_SUFFIX) {
          openCancelTask(taskId, task.title, task.status);
          return;
        }

        if (suffix === TASK_FIXTURE_REPRIO_SUFFIX) {
          openReprioritizeTask(taskId, task.title, task.priority);
          return;
        }
      }

      // ── FIXTURE_MENU_ANCHOR_OPENED routing ──────────────────────────────

      if (intent.intent === "FIXTURE_MENU_ANCHOR_OPENED") {
        const task = getTask(taskId);
        if (!task) return;

        const screenPos = intent.screen_position;
        if (!screenPos) return;

        const entries = buildTaskOrbMenuEntries(task);

        // Delegate actual menu opening to the caller via onMenuOpen callback.
        // This avoids a direct dependency on useContextMenuStore from this hook
        // (which would require importing from a component file), keeping the
        // hook independently testable.
        onMenuOpen?.(entries, screenPos.x, screenPos.y);
      }
    },
    [openCancelTask, openReprioritizeTask, getTask],
  );

  const getFixturesForTask = useCallback(
    (task: TaskRecord, visible = true): SpatialFixtureDescriptor[] =>
      buildTaskOrbFixtures(task, visible),
    [],
  );

  const menuEntriesForTask = useCallback(
    (task: TaskRecord): TaskOrbMenuEntry[] => buildTaskOrbMenuEntries(task),
    [],
  );

  return { handleFixtureIntent, getFixturesForTask, menuEntriesForTask };
}
