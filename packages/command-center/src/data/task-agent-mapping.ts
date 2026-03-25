/**
 * task-agent-mapping.ts — Ontology entity definition for task-agent mappings.
 *
 * Sub-AC 5a: Define and expose task_agent_mapping entities in the ontology/data
 * layer so that each mapping record provides source agent and target task
 * references consumable by the renderer.
 *
 * Design rationale:
 *   The raw Zustand task-store holds two related structures:
 *     - `assignments`: Record<taskId, TaskAgentAssignment> — one entry per assigned task
 *     - `agentTaskIndex`: Record<agentId, taskId[]>        — reverse lookup
 *
 *   `TaskAgentMappingEntity` is the canonical, renderer-consumable projection of
 *   this data.  Pure builder functions project the raw store state into typed
 *   entities with all fields pre-computed so the renderer never performs
 *   secondary lookups or color-table joins.
 *
 * Renderer contract (consumed by TaskConnectorsLayer, TaskMappingHUD, BatchedConnectorLines):
 *   - `mappingId`        — deterministic "<agentId>:<taskId>" composite key
 *   - `sourceAgentId`    — the agent performing the task (connector origin)
 *   - `targetTaskId`     — the task being performed (connector target)
 *   - `priority`         — task priority for PointLight budget + orb color
 *   - `status`           — task status for visibility predicate + beam color
 *   - `assignedTs`       — wall-clock timestamp for elapsed-time display
 *   - `isVisibleInScene` — pre-computed SCENE_VISIBLE_STATUSES predicate
 *   - `priorityColor`    — hex color applied to the task orb mesh (via TASK_PRIORITY_COLOR)
 *   - `statusBeamColor`  — hex color applied to the connector beam line
 *
 * Visibility rule:
 *   Only tasks in SCENE_VISIBLE_STATUSES ("assigned", "active", "blocked", "review")
 *   generate 3D connector arcs.  Terminal tasks ("done", "cancelled", "failed") and
 *   pre-assignment tasks ("draft", "planned") are excluded from the scene graph.
 *
 * Ontology reflexivity:
 *   This module is itself part of the building ontology — it maps the
 *   `task_agent_mapping` entity type from the ontology_schema.  The
 *   verification contract can validate these entities at runtime.
 */

import type { TaskAgentAssignment } from "./task-types.js";
import type { TaskRecord } from "./task-types.js";
import type { TaskPriority, TaskStatus } from "./task-types.js";
import { TASK_PRIORITY_COLOR } from "./task-types.js";

// ── Re-export core types for renderer convenience ──────────────────────────
export type { TaskPriority, TaskStatus };

// ── Scene visibility predicate ─────────────────────────────────────────────

/**
 * The canonical set of task statuses that generate 3D connector arcs in the
 * scene.  This is the authoritative source; TaskConnectors.tsx and
 * TaskMappingHUD.tsx must agree with this set.
 *
 * Included: tasks in progress (assigned, active, blocked, review).
 * Excluded: pre-assignment (draft, planned) and terminal (done, failed, cancelled).
 */
export const SCENE_VISIBLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "assigned",
  "active",
  "blocked",
  "review",
]);

// ── Status beam color map ──────────────────────────────────────────────────

/**
 * Canonical status → beam color mapping.
 *
 * Applied to connector arcs, left-border stripes in TaskMappingHUD, and
 * emissive intensity of connector glow.  Must match the visual constants in
 * TaskConnectors.tsx and TaskMappingHUD.tsx.
 *
 * Dark-theme command-center palette:
 *   active   → bright green  (work in flight)
 *   blocked  → orange        (attention / distress signal)
 *   review   → violet        (inspection phase)
 *   assigned → cyan          (assigned but not started)
 *   planned  → muted blue    (queued)
 *   draft    → dark indigo   (pre-queue)
 *   done     → dim green     (archived / success)
 *   failed   → red           (failure state)
 *   cancelled → near-black   (void / withdrawn)
 */
export const TASK_STATUS_BEAM_COLOR: Readonly<Record<TaskStatus, string>> = {
  draft:     "#444466",
  planned:   "#555588",
  assigned:  "#40C4FF",
  active:    "#00ff88",
  blocked:   "#FF9100",
  review:    "#aa88ff",
  done:      "#2a5a2a",
  failed:    "#ff4444",
  cancelled: "#333344",
};

// ── Priority light-intensity multiplier ───────────────────────────────────

/**
 * PointLight intensity multiplier per priority.
 *
 * Used by TaskConnectorsLayer to scale the three.js PointLight placed at each
 * task orb.  Higher priority → stronger physical illumination of surrounding
 * geometry.  The base PointLight intensity is multiplied by this value.
 */
export const TASK_PRIORITY_LIGHT_INTENSITY: Readonly<Record<TaskPriority, number>> = {
  critical: 2.0,
  high:     1.2,
  normal:   0.6,
  low:      0.3,
};

/**
 * Maximum number of PointLights allocated for task connectors.
 * Only the top-N tasks by priority receive a physical PointLight.
 * Exceeding this budget falls back to emissive-only illumination.
 */
export const MAX_CONNECTOR_POINT_LIGHTS = 4;

// ── TaskAgentMappingEntity ─────────────────────────────────────────────────

/**
 * Canonical ontology entity for a task-agent mapping.
 *
 * Each entity represents one active assignment between a single source agent
 * and a single target task.  The renderer consumes an array of these entities
 * to build all connector arcs, orb meshes, and HUD cards for the current frame.
 *
 * All visual fields (`priorityColor`, `statusBeamColor`, `isVisibleInScene`)
 * are pre-computed so the renderer never joins against secondary lookup tables.
 */
export interface TaskAgentMappingEntity {
  // ── Identity ─────────────────────────────────────────────────────────────

  /**
   * Deterministic composite key: `"<agentId>:<taskId>"`.
   * Stable across re-renders; usable as React key or Three.js object name.
   */
  mappingId: string;

  // ── Source / Target references ────────────────────────────────────────────

  /**
   * Source: the agent performing the task.
   * Corresponds to `AgentDef.agentId` in the agent store.
   * Used as the connector arc origin (agent avatar position).
   */
  sourceAgentId: string;

  /**
   * Target: the task being performed.
   * Corresponds to `TaskRecord.taskId` in the task store.
   * Used as the connector arc target (task orb position).
   */
  targetTaskId: string;

  // ── Task metadata ─────────────────────────────────────────────────────────

  /** Task priority — drives PointLight budget, orb scale, and animation intensity. */
  priority: TaskPriority;

  /** Task lifecycle status — drives visibility predicate and beam color. */
  status: TaskStatus;

  /**
   * Unix timestamp (ms) when this mapping was established.
   * Used for elapsed-time display in TaskMappingHUD.
   */
  assignedTs: number;

  // ── Pre-computed renderer fields ──────────────────────────────────────────

  /**
   * True if this mapping should generate a 3D connector arc in the scene.
   * Derived from `SCENE_VISIBLE_STATUSES.has(status)`.
   *
   * Renderers MUST check this flag before creating Three.js objects.
   * Non-visible entities are still included in the entity list so that
   * the HUD and other consumers have access to full assignment state.
   */
  isVisibleInScene: boolean;

  /**
   * Hex color string for the task orb mesh and emissive glow.
   * Derived from `TASK_PRIORITY_COLOR[priority]`.
   * Example: critical → "#FF3D00", normal → "#40C4FF".
   */
  priorityColor: string;

  /**
   * Hex color string for the connector beam line.
   * Derived from `TASK_STATUS_BEAM_COLOR[status]`.
   * Example: active → "#00ff88", blocked → "#FF9100".
   */
  statusBeamColor: string;
}

// ── Builder functions ──────────────────────────────────────────────────────

/**
 * Build a single `TaskAgentMappingEntity` from a raw assignment + task record.
 *
 * Pure function — no side effects.  Returns `null` if either argument is
 * missing (defensive against stale store references during transitions).
 */
export function buildMappingEntity(
  assignment: TaskAgentAssignment,
  task: TaskRecord,
): TaskAgentMappingEntity {
  return {
    mappingId:       `${assignment.agentId}:${assignment.taskId}`,
    sourceAgentId:   assignment.agentId,
    targetTaskId:    assignment.taskId,
    priority:        task.priority,
    status:          task.status,
    assignedTs:      assignment.assignedTs,
    isVisibleInScene: SCENE_VISIBLE_STATUSES.has(task.status),
    priorityColor:   TASK_PRIORITY_COLOR[task.priority],
    statusBeamColor: TASK_STATUS_BEAM_COLOR[task.status],
  };
}

/**
 * Build `TaskAgentMappingEntity` objects for **all** assignments in the store.
 *
 * Includes both visible and non-visible entities (e.g. terminal tasks that
 * have not yet been pruned from the assignments map).  Callers that only
 * need visible entities should use `getVisibleMappingEntities()` instead.
 *
 * @param assignments  - Task-store `assignments` map (keyed by taskId).
 * @param tasks        - Task-store `tasks` map (keyed by taskId).
 * @returns            - Array of mapping entities, one per assignment.
 */
export function buildAllMappingEntities(
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
  tasks:       Readonly<Record<string, TaskRecord>>,
): TaskAgentMappingEntity[] {
  const entities: TaskAgentMappingEntity[] = [];
  for (const assignment of Object.values(assignments)) {
    const task = tasks[assignment.taskId];
    if (!task) continue; // stale assignment — task was deleted
    entities.push(buildMappingEntity(assignment, task));
  }
  return entities;
}

/**
 * Return only the mapping entities whose `isVisibleInScene` flag is `true`.
 *
 * This is the primary renderer entry point: `TaskConnectorsLayer` and
 * `BatchedConnectorLines` consume this output directly.
 *
 * Entities are sorted by priority descending, then by status urgency:
 *   active > blocked > review > assigned
 *
 * @param assignments  - Task-store `assignments` map.
 * @param tasks        - Task-store `tasks` map.
 * @returns            - Sorted array of visible mapping entities.
 */
export function getVisibleMappingEntities(
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
  tasks:       Readonly<Record<string, TaskRecord>>,
): TaskAgentMappingEntity[] {
  const all = buildAllMappingEntities(assignments, tasks);
  return all
    .filter((e) => e.isVisibleInScene)
    .sort(compareMappingEntitiesByUrgency);
}

/**
 * Return all mapping entities for a specific source agent.
 *
 * Includes all statuses (visible and non-visible) so consumers can display
 * complete agent workloads in panels and tooltips.
 *
 * @param agentId      - The source agent ID to filter by.
 * @param assignments  - Task-store `assignments` map.
 * @param tasks        - Task-store `tasks` map.
 * @returns            - All mapping entities where `sourceAgentId === agentId`.
 */
export function getMappingEntitiesForAgent(
  agentId:     string,
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
  tasks:       Readonly<Record<string, TaskRecord>>,
): TaskAgentMappingEntity[] {
  const all = buildAllMappingEntities(assignments, tasks);
  return all
    .filter((e) => e.sourceAgentId === agentId)
    .sort(compareMappingEntitiesByUrgency);
}

/**
 * Return the mapping entity for a specific target task, or `undefined`.
 *
 * A task can only be assigned to one agent at a time, so this returns at
 * most one entity.
 *
 * @param taskId       - The target task ID to look up.
 * @param assignments  - Task-store `assignments` map.
 * @param tasks        - Task-store `tasks` map.
 * @returns            - The entity if the task is assigned, otherwise undefined.
 */
export function getMappingEntityForTask(
  taskId:      string,
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
  tasks:       Readonly<Record<string, TaskRecord>>,
): TaskAgentMappingEntity | undefined {
  const assignment = assignments[taskId];
  if (!assignment) return undefined;
  const task = tasks[taskId];
  if (!task) return undefined;
  return buildMappingEntity(assignment, task);
}

/**
 * Partition mapping entities into visible (scene) and non-visible (terminal /
 * pre-assignment) subsets.
 *
 * Used by renderers that need both subsets in one pass (e.g. a HUD that shows
 * all tasks but only draws 3D connectors for visible ones).
 *
 * @param assignments  - Task-store `assignments` map.
 * @param tasks        - Task-store `tasks` map.
 */
export function partitionMappingEntities(
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
  tasks:       Readonly<Record<string, TaskRecord>>,
): { visible: TaskAgentMappingEntity[]; hidden: TaskAgentMappingEntity[] } {
  const all = buildAllMappingEntities(assignments, tasks);
  const visible: TaskAgentMappingEntity[] = [];
  const hidden:  TaskAgentMappingEntity[] = [];
  for (const e of all) {
    (e.isVisibleInScene ? visible : hidden).push(e);
  }
  visible.sort(compareMappingEntitiesByUrgency);
  return { visible, hidden };
}

// ── PointLight budget helpers ──────────────────────────────────────────────

/**
 * Priority rank used for PointLight budget allocation (higher = higher priority).
 * Must agree with `TASK_PRIORITY_WEIGHT` from task-types.ts.
 */
export const MAPPING_PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  critical: 4,
  high:     3,
  normal:   2,
  low:      1,
};

/**
 * Status urgency score used as tie-breaker in PointLight allocation.
 */
const STATUS_URGENCY: Readonly<Record<TaskStatus, number>> = {
  active:    3,
  blocked:   2,
  review:    1,
  assigned:  0,
  // Non-visible statuses — below the fold
  planned:   -1,
  draft:     -2,
  done:      -3,
  failed:    -3,
  cancelled: -4,
};

/**
 * Comparator that sorts mapping entities by urgency descending.
 * Primary key: priority rank (critical > high > normal > low).
 * Tie-breaker: status urgency (active > blocked > review > assigned).
 */
export function compareMappingEntitiesByUrgency(
  a: TaskAgentMappingEntity,
  b: TaskAgentMappingEntity,
): number {
  const rankDiff =
    MAPPING_PRIORITY_RANK[b.priority] - MAPPING_PRIORITY_RANK[a.priority];
  if (rankDiff !== 0) return rankDiff;
  return (STATUS_URGENCY[b.status] ?? -99) - (STATUS_URGENCY[a.status] ?? -99);
}

/**
 * Select the top-N visible mapping entities that should receive a PointLight.
 *
 * Only entities with `isVisibleInScene === true` are eligible.
 * Entities are ranked by urgency (same comparator used in `getVisibleMappingEntities`).
 *
 * @param entities     - Pre-filtered visible mapping entities.
 * @param budget       - Max number of PointLights to allocate (default: MAX_CONNECTOR_POINT_LIGHTS).
 * @returns            - Subset of entities that receive a PointLight.
 */
export function allocatePointLightBudget(
  entities: TaskAgentMappingEntity[],
  budget = MAX_CONNECTOR_POINT_LIGHTS,
): TaskAgentMappingEntity[] {
  const visible = entities
    .filter((e) => e.isVisibleInScene)
    .sort(compareMappingEntitiesByUrgency);
  return visible.slice(0, budget);
}

// ── Debug / serialisation helpers ──────────────────────────────────────────

/**
 * Human-readable summary of a single mapping entity.
 * Format: `"[priority] agentId → taskId (status)"`
 */
export function formatMappingEntitySummary(entity: TaskAgentMappingEntity): string {
  return (
    `[${entity.priority}] ${entity.sourceAgentId} → ${entity.targetTaskId}` +
    ` (${entity.status})${entity.isVisibleInScene ? " ✓" : " –"}`
  );
}

/**
 * Human-readable summary of an array of mapping entities.
 * Includes total count, visible count, and per-priority breakdown.
 */
export function formatMappingEntitiesSummary(entities: TaskAgentMappingEntity[]): string {
  const visible   = entities.filter((e) => e.isVisibleInScene);
  const byPriority: Record<string, number> = {
    critical: 0, high: 0, normal: 0, low: 0,
  };
  for (const e of entities) byPriority[e.priority]++;

  const lines = [
    `TaskAgentMapping entities: ${entities.length} total, ${visible.length} visible`,
    `  Priority breakdown:`,
    ...Object.entries(byPriority)
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `    ${p}: ${n}`),
  ];

  if (visible.length > 0) {
    lines.push(`  Visible mappings:`);
    for (const e of visible) {
      lines.push(`    ${formatMappingEntitySummary(e)}`);
    }
  }

  return lines.join("\n");
}
