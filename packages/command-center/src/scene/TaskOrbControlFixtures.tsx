/**
 * TaskOrbControlFixtures.tsx — Sub-AC 7c
 *
 * 3D layer that attaches interactive ui_fixture controls (cancel button,
 * reprioritize button, context-menu anchor) to each active task orb in the
 * scene.  When a fixture is clicked, it routes through the task management
 * control plane to produce an orchestration_command.
 *
 * Control plane wiring
 * ────────────────────
 *   FixtureButton (cancel)    → useTaskManagementStore.openCancelTask()
 *                             ↓ TaskManagementPanel (user confirms)
 *                             ↓ useActionDispatcher.handleTaskAction("cancel")
 *                             ↓ cmdWriter.cancelTask()
 *                             ↓ orchestration_command written to watch dir
 *
 *   FixtureButton (reprio)    → useTaskManagementStore.openReprioritizeTask()
 *                             ↓ TaskManagementPanel (user picks priority)
 *                             ↓ useActionDispatcher.handleTaskAction("update_spec")
 *                             ↓ cmdWriter.writeCommand("task.update_spec")
 *                             ↓ orchestration_command written to watch dir
 *
 *   FixtureMenuAnchor (menu)  → useContextMenuStore.openMenu(taskOrbEntries)
 *                             ↓ ContextMenuPortal (user selects item)
 *                             ↓ onSelect() → openCancelTask / openReprioritizeTask
 *                             ↓ (same path as above)
 *
 * 3D visual update contract
 * ─────────────────────────
 * The fixture colors update reactively because `buildTaskOrbFixtures()` is
 * called on every render pass and reads current task.priority and task.status
 * from the Zustand task-store.  Zustand store mutations (from optimistic UI
 * updates or WebSocket task events) trigger re-renders automatically.
 *
 *   priority changed  → reprioritize fixture button color updates immediately
 *   task cancelled    → both action buttons become disabled (grey, no hover)
 *   task done         → same as cancelled
 *
 * Visibility gating
 * ─────────────────
 * Only tasks with VISIBLE_STATUSES (assigned / active / blocked / review) get
 * a fixture set rendered.  Terminal tasks (done / cancelled) and tasks in
 * draft / planned / failed status are excluded.  This matches the gating in
 * TaskConnectors.tsx so the fixture controls only appear on visible orbs.
 *
 * Integration
 * ───────────
 * Mount `<TaskOrbControlFixturesLayer>` inside the R3F Canvas, sibling to
 * `<TaskConnectorsLayer>`.  It has no Three.js geometry itself — it delegates
 * all rendering to `SpatialFixtureLayer` from SpatialUiFixture.tsx.
 */

import { memo, useCallback, useMemo } from "react";
import { useTaskStore }           from "../store/task-store.js";
import { useAgentStore }          from "../store/agent-store.js";
import { useContextMenuStore }    from "../components/ContextMenuDispatcher.js";
import {
  SpatialFixtureLayer,
  type SpatialFixtureEntityEntry,
} from "./SpatialUiFixture.js";
import {
  useTaskFixtureControlPlane,
  buildTaskOrbFixtures,
  type TaskOrbMenuEntry,
} from "../hooks/use-task-fixture-control-plane.js";
import type { FixtureInteractionIntent } from "./fixture-interaction-intents.js";
import type { TaskRecord } from "../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task statuses for which orb fixture controls are shown.
 * Mirrors VISIBLE_STATUSES in TaskConnectors.tsx.
 */
export const TASK_ORB_FIXTURE_VISIBLE_STATUSES = new Set([
  "assigned", "active", "blocked", "review",
]);

/**
 * Y offset for the orb floating above the agent's world-position.
 * Matches ORB_FLOAT_Y in TaskConnectors.tsx.
 */
export const TASK_ORB_FIXTURE_FLOAT_Y = 1.65;

/**
 * Radial spread radius for multiple orbs on the same agent.
 * Matches ORB_SPREAD_RADIUS in TaskConnectors.tsx.
 */
export const TASK_ORB_FIXTURE_SPREAD_RADIUS = 0.40;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — no React/Three.js required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the world position of a task orb.
 *
 * Multiple tasks on the same agent are spread in a circle around the agent's
 * foot position with orbIndex determining the angle offset.
 *
 * @param agentPos   Agent world position (foot, Y = floor level).
 * @param orbIndex   0-based index among all tasks assigned to this agent.
 * @param totalOrbs  Total number of orbs for this agent (for spread angle).
 */
export function computeTaskOrbWorldPos(
  agentPos: { x: number; y: number; z: number },
  orbIndex: number,
  totalOrbs: number,
): { x: number; y: number; z: number } {
  if (totalOrbs <= 1) {
    return { x: agentPos.x, y: agentPos.y + TASK_ORB_FIXTURE_FLOAT_Y, z: agentPos.z };
  }
  const angle = (orbIndex / totalOrbs) * Math.PI * 2;
  return {
    x: agentPos.x + Math.cos(angle) * TASK_ORB_FIXTURE_SPREAD_RADIUS,
    y: agentPos.y + TASK_ORB_FIXTURE_FLOAT_Y,
    z: agentPos.z + Math.sin(angle) * TASK_ORB_FIXTURE_SPREAD_RADIUS,
  };
}

/**
 * Build `SpatialFixtureEntityEntry[]` for all active task orbs.
 *
 * @param tasks       All task records (pre-filtered to visible statuses).
 * @param agentPositions  Map of agentId → world position.
 * @param visible     Whether fixtures are interactive (false = replay mode).
 */
export function buildTaskOrbEntries(
  tasks: TaskRecord[],
  agentPositions: Map<string, { x: number; y: number; z: number }>,
  visible = true,
): SpatialFixtureEntityEntry[] {
  // Group tasks by agent
  const byAgent = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    if (!task.assignedAgentId) continue;
    const arr = byAgent.get(task.assignedAgentId) ?? [];
    arr.push(task);
    byAgent.set(task.assignedAgentId, arr);
  }

  const entries: SpatialFixtureEntityEntry[] = [];

  for (const [agentId, agentTasks] of byAgent.entries()) {
    const agentPos = agentPositions.get(agentId);
    if (!agentPos) continue;

    agentTasks.forEach((task, idx) => {
      const orbPos = computeTaskOrbWorldPos(agentPos, idx, agentTasks.length);
      entries.push({
        entityRef:           { entityType: "task", entityId: task.taskId },
        entityWorldPosition: orbPos,
        fixtures:            buildTaskOrbFixtures(task, visible),
      });
    });
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskOrbControlFixturesLayer — 3D scene component
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskOrbControlFixturesLayerProps {
  /**
   * Whether the fixture layer is visible (interactive).
   * Pass `false` during replay mode to disable interaction.
   * Default: true.
   */
  visible?: boolean;
}

/**
 * `TaskOrbControlFixturesLayer` — Sub-AC 7c top-level component.
 *
 * Renders interactive fixture controls (cancel, reprioritize, menu-anchor)
 * on each active task orb.  Wires all fixture intents to the task management
 * control plane, producing orchestration_commands on user confirmation.
 *
 * Mount once inside the R3F Canvas, as a sibling to `<TaskConnectorsLayer>`.
 *
 * @example
 * ```tsx
 * <TaskConnectorsLayer />
 * <TaskOrbControlFixturesLayer />
 * ```
 */
export const TaskOrbControlFixturesLayer = memo(
  function TaskOrbControlFixturesLayer({
    visible = true,
  }: TaskOrbControlFixturesLayerProps) {
    const controlPlane = useTaskFixtureControlPlane();
    const openMenu     = useContextMenuStore((s) => s.openMenu);

    // ── Read active tasks from task-store ──────────────────────────────────

    const tasks = useTaskStore((s) => {
      const all = Object.values(s.tasks) as TaskRecord[];
      return all.filter(
        (t) => t.assignedAgentId && TASK_ORB_FIXTURE_VISIBLE_STATUSES.has(t.status),
      );
    });

    // ── Read agent world positions from agent-store ──────────────────────

    const agentPositions = useAgentStore((s) => {
      const map = new Map<string, { x: number; y: number; z: number }>();
      for (const entry of Object.values(s.agents)) {
        if (entry.worldPosition) {
          map.set(entry.def.agentId, entry.worldPosition);
        }
      }
      return map;
    });

    // ── Build fixture entity entries ────────────────────────────────────

    const fixtureEntries = useMemo(
      () => buildTaskOrbEntries(tasks, agentPositions, visible),
      [tasks, agentPositions, visible],
    );

    // ── Handle fixture intents → task management control plane ──────────

    const handleIntent = useCallback(
      (intent: FixtureInteractionIntent) => {
        controlPlane.handleFixtureIntent(
          intent,
          // Provide the menu-open callback so the context menu store is updated
          (entries: TaskOrbMenuEntry[], x: number, y: number) => {
            openMenu(entries as never[], x, y);
          },
        );
      },
      [controlPlane, openMenu],
    );

    return (
      <SpatialFixtureLayer
        entities={fixtureEntries}
        onIntent={handleIntent}
        visible={visible}
      />
    );
  },
);
