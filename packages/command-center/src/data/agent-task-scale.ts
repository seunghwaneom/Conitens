/**
 * agent-task-scale.ts — Data-model scale support for the agent/task registry.
 *
 * Sub-AC 15a: Ensure the agent/task registry and scene graph can hold
 *   3–20 agents and up to 200 tasks without structural errors or data loss.
 *
 * PURPOSE
 * ───────
 * Provides:
 *   1. Authoritative scale-bound constants (AGENT_REGISTRY_MIN/MAX, TASK_REGISTRY_MAX).
 *   2. Pure validation functions that check registry sizes against those bounds.
 *   3. Deterministic stress-test generators for headless testing at full scale.
 *   4. An integrity checker that verifies the agent↔task cross-indexes are
 *      consistent with no data loss or orphaned references.
 *
 * These utilities are consumed by:
 *   - Scale tests (agent-task-scale.test.ts) that exercise the full 20-agent /
 *     200-task surface.
 *   - The task-store's bulkLoadTasks path (optional gate check).
 *   - The scene initializer to warn when registries exceed scale bounds.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * - Pure functions only — no Zustand store imports, no side effects.
 * - Deterministic generators: given the same seed count, always produce the
 *   same agent IDs, task IDs, and assignment maps.
 * - Validation returns structured result objects (never throws) so callers
 *   can decide how to react (warn vs gate).
 * - Scene graph integrity check validates structural consistency of the
 *   cross-indexes (agentTaskIndex ↔ assignments ↔ tasks) — the three-way
 *   coherence that must be maintained at all scales.
 *
 * AC TRACEABILITY
 * ───────────────
 * Sub-AC 15a (AC 15): "Implement data-model scale support — ensure the
 *   agent/task registry and scene graph can hold 3–20 agents and up to
 *   200 tasks without structural errors or data loss."
 */

import type { TaskRecord, TaskAgentAssignment, TaskPriority, TaskStatus } from "./task-types.js";
import type { AgentDef } from "./agents.js";

// ── Scale bounds constants ─────────────────────────────────────────────────

/**
 * Minimum number of agents the registry must be able to hold.
 * Below this number the scene graph is considered under-populated
 * and may not exercise multi-room routing or connector LOD.
 */
export const AGENT_REGISTRY_MIN = 3;

/**
 * Maximum number of agents the registry must be able to hold without
 * structural errors or performance degradation.
 * Maps to the physical room capacity of the single-building world.
 */
export const AGENT_REGISTRY_MAX = 20;

/**
 * Maximum number of tasks the registry must be able to hold.
 * At 200 tasks, the scene graph's connector layer, pagination, and
 * tag/priority indexes must remain structurally coherent.
 */
export const TASK_REGISTRY_MAX = 200;

/**
 * Maximum number of tasks that may be assigned to a single agent
 * without causing visual or structural overload.
 * 10 tasks per agent × 20 agents = 200 tasks total (TASK_REGISTRY_MAX).
 */
export const MAX_TASKS_PER_AGENT = 10;

// ── Validation result types ────────────────────────────────────────────────

/** Result of an agent registry scale validation. */
export interface AgentScaleValidationResult {
  /** True if count is within [AGENT_REGISTRY_MIN, AGENT_REGISTRY_MAX]. */
  valid: boolean;
  /** Actual number of agents checked. */
  count: number;
  /** Minimum required agents. */
  min: number;
  /** Maximum allowed agents. */
  max: number;
  /** Human-readable violation message (empty string if valid). */
  violation: string;
}

/** Result of a task registry scale validation. */
export interface TaskScaleValidationResult {
  /** True if count is within [0, TASK_REGISTRY_MAX]. */
  valid: boolean;
  /** Actual number of tasks checked. */
  count: number;
  /** Maximum allowed tasks. */
  max: number;
  /** Human-readable violation message (empty string if valid). */
  violation: string;
}

/** Result of a scene graph integrity check. */
export interface SceneGraphIntegrityResult {
  /** True when all three-way cross-index checks pass. */
  valid: boolean;
  /** Number of tasks in the registry. */
  taskCount: number;
  /** Number of agents in the registry. */
  agentCount: number;
  /** Number of active assignments. */
  assignmentCount: number;
  /**
   * Task IDs that appear in `assignments` but not in `tasks`.
   * Indicates stale assignment records (data loss risk).
   */
  orphanedAssignmentIds: string[];
  /**
   * Task IDs in `agentTaskIndex` (flattened) that are missing from `tasks`.
   * Indicates the reverse index is out of sync.
   */
  orphanedIndexEntries: string[];
  /**
   * Agents in `agentTaskIndex` whose task lists include tasks NOT in `assignments`.
   * Indicates the agent→task index has diverged from the primary index.
   */
  indexAssignmentMismatches: string[];
  /**
   * All validation errors collected (one per issue found).
   * Empty when `valid === true`.
   */
  errors: string[];
}

// ── Validation functions ───────────────────────────────────────────────────

/**
 * validateAgentRegistryScale — Check that the number of agent IDs is within
 * the supported scale bounds [AGENT_REGISTRY_MIN, AGENT_REGISTRY_MAX].
 *
 * Pure function — no side effects.
 *
 * @param agentIds - Array or set of agent IDs currently in the registry.
 * @returns AgentScaleValidationResult with valid flag and optional violation message.
 */
export function validateAgentRegistryScale(
  agentIds: readonly string[] | ReadonlySet<string>,
): AgentScaleValidationResult {
  const count = agentIds instanceof Set
    ? agentIds.size
    : (agentIds as readonly string[]).length;

  let violation = "";
  if (count < AGENT_REGISTRY_MIN) {
    violation =
      `Agent registry under-populated: ${count} agents < minimum ${AGENT_REGISTRY_MIN}`;
  } else if (count > AGENT_REGISTRY_MAX) {
    violation =
      `Agent registry over capacity: ${count} agents > maximum ${AGENT_REGISTRY_MAX}`;
  }

  return {
    valid: violation === "",
    count,
    min: AGENT_REGISTRY_MIN,
    max: AGENT_REGISTRY_MAX,
    violation,
  };
}

/**
 * validateTaskRegistryScale — Check that the number of tasks in the registry
 * is within the supported scale bound [0, TASK_REGISTRY_MAX].
 *
 * Pure function — no side effects.
 *
 * @param tasks - Record or array of TaskRecord entries.
 * @returns TaskScaleValidationResult with valid flag and optional violation message.
 */
export function validateTaskRegistryScale(
  tasks: Readonly<Record<string, TaskRecord>> | readonly TaskRecord[],
): TaskScaleValidationResult {
  const count = Array.isArray(tasks)
    ? (tasks as readonly TaskRecord[]).length
    : Object.keys(tasks as Record<string, TaskRecord>).length;

  const violation = count > TASK_REGISTRY_MAX
    ? `Task registry over capacity: ${count} tasks > maximum ${TASK_REGISTRY_MAX}`
    : "";

  return {
    valid: violation === "",
    count,
    max: TASK_REGISTRY_MAX,
    violation,
  };
}

// ── Stress-test generators ─────────────────────────────────────────────────

/**
 * generateScaleAgentIds — Produce a deterministic list of N agent ID strings.
 *
 * IDs follow the pattern "scale-agent-00", "scale-agent-01", etc.
 * Alphabetical order matches the ontology iteration order used in
 * iterateOntologyAgents(), which sorts IDs alphabetically.
 *
 * @param count - Number of agent IDs to generate (1–20).
 * @returns Array of `count` unique agent IDs, alphabetically sorted.
 */
export function generateScaleAgentIds(count: number): string[] {
  if (count < 1 || count > AGENT_REGISTRY_MAX) {
    throw new RangeError(
      `generateScaleAgentIds: count ${count} is outside [1, ${AGENT_REGISTRY_MAX}]`,
    );
  }
  return Array.from({ length: count }, (_, i) =>
    `scale-agent-${String(i).padStart(2, "0")}`,
  ).sort();
}

/**
 * generateScaleAgentDefs — Produce N minimal AgentDef objects for scale testing.
 *
 * Each def has a unique agentId and a deterministic role cycling through
 * the five valid AgentRole values: orchestrator, implementer, researcher,
 * reviewer, validator.
 *
 * @param count - Number of agents (1–20).
 * @returns Array of minimal AgentDef objects conforming to the AgentDef interface.
 */
export function generateScaleAgentDefs(count: number): AgentDef[] {
  const roles: AgentDef["role"][] = [
    "orchestrator", "implementer", "researcher", "reviewer", "validator",
  ];
  const ROLE_COLORS: Record<AgentDef["role"], { color: string; emissive: string; icon: string; label: string }> = {
    orchestrator: { color: "#FF7043", emissive: "#FF4500", icon: "♛", label: "MGR" },
    implementer:  { color: "#66BB6A", emissive: "#33AA33", icon: "⚙", label: "IMP" },
    researcher:   { color: "#AB47BC", emissive: "#9933CC", icon: "🔬", label: "RES" },
    reviewer:     { color: "#42A5F5", emissive: "#2196F3", icon: "👁", label: "REV" },
    validator:    { color: "#EF5350", emissive: "#F44336", icon: "🛡", label: "VAL" },
  };
  return generateScaleAgentIds(count).map((agentId, i) => {
    const role = roles[i % roles.length];
    return {
      agentId,
      name:         `Scale Agent ${i}`,
      role,
      capabilities: ["scale-test"],
      riskClass:    "low" as const,
      summary:      `Stress-test agent ${i} generated by generateScaleAgentDefs`,
      visual:       ROLE_COLORS[role],
      defaultRoom:  `room-scale-${String(i % 5).padStart(2, "0")}`,
    };
  });
}

/**
 * generateScaleTasks — Produce N TaskRecord objects for scale testing.
 *
 * Tasks are distributed across `agentIds` in round-robin order.
 * Statuses cycle through all valid statuses including terminal ones to
 * exercise the full filter/visibility surface.
 *
 * The spread of statuses is:
 *   - 40% active (visible, workload simulation)
 *   - 20% blocked / review (visible, attention states)
 *   - 20% assigned (visible, queued)
 *   - 10% done (hidden, terminal)
 *   - 10% draft (hidden, pre-queue)
 *
 * @param count     - Number of tasks (1–200).
 * @param agentIds  - Agent IDs to assign tasks to (round-robin). If empty,
 *                    all tasks are created unassigned.
 * @param baseTs    - Base timestamp for deterministic createdTs values.
 * @returns Array of TaskRecord objects, one per requested task.
 */
export function generateScaleTasks(
  count: number,
  agentIds: readonly string[],
  baseTs = 1_710_000_000_000,
): TaskRecord[] {
  if (count < 1 || count > TASK_REGISTRY_MAX) {
    throw new RangeError(
      `generateScaleTasks: count ${count} is outside [1, ${TASK_REGISTRY_MAX}]`,
    );
  }

  const priorities: TaskPriority[] = ["critical", "high", "normal", "low"];

  // Status distribution: 40% active, 20% blocked, 10% review, 20% assigned, 5% done, 5% draft
  const statusWheel: TaskStatus[] = [
    "active",   "active",   "active",   "active",
    "blocked",  "blocked",
    "review",
    "assigned", "assigned",
    "done",
    "draft",
    // Pad to 12 for cleaner modulo
    "active",
  ];

  return Array.from({ length: count }, (_, i) => {
    const agentId = agentIds.length > 0
      ? agentIds[i % agentIds.length]
      : null;
    const priority: TaskPriority = priorities[i % priorities.length];
    const status: TaskStatus     = statusWheel[i % statusWheel.length];
    const isActive = ["assigned", "active", "blocked", "review"].includes(status);
    const ts = baseTs + i * 1000;

    return {
      taskId:          `scale-task-${String(i).padStart(3, "0")}`,
      title:           `Scale Task ${i} [${priority}]`,
      description:     `Generated scale task ${i} for stress testing`,
      status,
      priority,
      assignedAgentId: isActive ? agentId : null,
      createdTs:       ts,
      updatedTs:       ts + 500,
      startedTs:       status === "active" ? ts + 100 : null,
      completedTs:     status === "done"   ? ts + 900 : null,
      parentTaskId:    null,
      tags:            [`scale`, `agent-${String(i % agentIds.length).padStart(2, "0")}`],
      eventIds:        [`te-scale-${i}`],
    };
  });
}

/**
 * generateScaleAssignments — Build an assignment map from an array of TaskRecords.
 *
 * Only non-terminal tasks with a non-null assignedAgentId are included.
 * This mirrors the logic in task-store.bulkLoadTasks().
 *
 * @param tasks - Array of TaskRecord objects.
 * @returns Record<taskId, TaskAgentAssignment> — one entry per active assignment.
 */
export function generateScaleAssignments(
  tasks: readonly TaskRecord[],
): Record<string, TaskAgentAssignment> {
  const assignments: Record<string, TaskAgentAssignment> = {};
  for (const task of tasks) {
    if (
      task.assignedAgentId !== null &&
      !["done", "cancelled", "failed"].includes(task.status)
    ) {
      assignments[task.taskId] = {
        taskId:     task.taskId,
        agentId:    task.assignedAgentId,
        assignedTs: task.updatedTs,
        priority:   task.priority,
        status:     task.status,
      };
    }
  }
  return assignments;
}

/**
 * generateScaleAgentTaskIndex — Build an agentTaskIndex from an assignment map.
 *
 * Mirrors the buildAgentTaskIndex helper in task-store.ts.
 *
 * @param assignments - Record<taskId, TaskAgentAssignment>.
 * @returns Record<agentId, taskId[]>.
 */
export function generateScaleAgentTaskIndex(
  assignments: Readonly<Record<string, TaskAgentAssignment>>,
): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const assignment of Object.values(assignments)) {
    if (!idx[assignment.agentId]) idx[assignment.agentId] = [];
    idx[assignment.agentId].push(assignment.taskId);
  }
  return idx;
}

// ── Scene graph integrity checker ─────────────────────────────────────────

/**
 * checkSceneGraphIntegrity — Validate the three-way coherence of the
 * agent/task registry's cross-indexes at any scale.
 *
 * Checks:
 *   A. Every assignment's taskId exists in `tasks` (no orphaned assignments).
 *   B. Every agentTaskIndex entry's taskId exists in `tasks` (no orphaned index entries).
 *   C. Every agentTaskIndex entry's taskId also exists in `assignments`
 *      (agent index agrees with the primary assignment map).
 *   D. No duplicate task IDs exist in any agent's task list.
 *   E. Task count is within TASK_REGISTRY_MAX.
 *
 * Pure function — no side effects.
 *
 * @param tasks          - Task registry (keyed by taskId).
 * @param assignments    - Active assignment map (keyed by taskId).
 * @param agentTaskIndex - Reverse index (keyed by agentId, values are taskId arrays).
 * @returns SceneGraphIntegrityResult with valid flag and structured error list.
 */
export function checkSceneGraphIntegrity(
  tasks:          Readonly<Record<string, TaskRecord>>,
  assignments:    Readonly<Record<string, TaskAgentAssignment>>,
  agentTaskIndex: Readonly<Record<string, string[]>>,
): SceneGraphIntegrityResult {
  const errors: string[] = [];
  const taskIds  = new Set(Object.keys(tasks));
  const assignmentIds = new Set(Object.keys(assignments));

  // ── Check A: orphaned assignment records ──────────────────────────────
  const orphanedAssignmentIds: string[] = [];
  for (const taskId of assignmentIds) {
    if (!taskIds.has(taskId)) {
      orphanedAssignmentIds.push(taskId);
      errors.push(`Assignment for taskId '${taskId}' has no corresponding task record`);
    }
  }

  // ── Check B: orphaned agentTaskIndex entries ──────────────────────────
  const orphanedIndexEntries: string[] = [];
  for (const [agentId, taskList] of Object.entries(agentTaskIndex)) {
    for (const taskId of taskList) {
      if (!taskIds.has(taskId)) {
        orphanedIndexEntries.push(taskId);
        errors.push(
          `agentTaskIndex[${agentId}] references taskId '${taskId}' which has no task record`,
        );
      }
    }
  }

  // ── Check C: agentTaskIndex ↔ assignments coherence ───────────────────
  const indexAssignmentMismatches: string[] = [];
  for (const [agentId, taskList] of Object.entries(agentTaskIndex)) {
    for (const taskId of taskList) {
      const assignment = assignments[taskId];
      if (!assignment) {
        indexAssignmentMismatches.push(`${agentId}:${taskId}`);
        errors.push(
          `agentTaskIndex[${agentId}] has taskId '${taskId}' but no assignment record exists`,
        );
      } else if (assignment.agentId !== agentId) {
        indexAssignmentMismatches.push(`${agentId}:${taskId}`);
        errors.push(
          `agentTaskIndex[${agentId}] has taskId '${taskId}' but assignment.agentId is '${assignment.agentId}'`,
        );
      }
    }
  }

  // ── Check D: no duplicate taskIds within any agent's list ─────────────
  for (const [agentId, taskList] of Object.entries(agentTaskIndex)) {
    const seen = new Set<string>();
    for (const taskId of taskList) {
      if (seen.has(taskId)) {
        errors.push(
          `agentTaskIndex[${agentId}] contains duplicate taskId '${taskId}'`,
        );
      }
      seen.add(taskId);
    }
  }

  // ── Check E: task count within TASK_REGISTRY_MAX ─────────────────────
  const taskCount = taskIds.size;
  if (taskCount > TASK_REGISTRY_MAX) {
    errors.push(
      `Task registry over capacity: ${taskCount} tasks > maximum ${TASK_REGISTRY_MAX}`,
    );
  }

  return {
    valid:                    errors.length === 0,
    taskCount,
    agentCount:               Object.keys(agentTaskIndex).length,
    assignmentCount:          assignmentIds.size,
    orphanedAssignmentIds,
    orphanedIndexEntries,
    indexAssignmentMismatches,
    errors,
  };
}

// ── Summary helpers ────────────────────────────────────────────────────────

/**
 * formatScaleValidationSummary — Human-readable summary of all three
 * scale validation results.
 *
 * Used for test assertion messages and debug logging.
 */
export function formatScaleValidationSummary(
  agentResult:     AgentScaleValidationResult,
  taskResult:      TaskScaleValidationResult,
  integrityResult: SceneGraphIntegrityResult,
): string {
  const lines: string[] = [
    `Scale Validation Summary:`,
    `  Agents: ${agentResult.count} (valid=${agentResult.valid})${agentResult.violation ? " — " + agentResult.violation : ""}`,
    `  Tasks:  ${taskResult.count} (valid=${taskResult.valid})${taskResult.violation ? " — " + taskResult.violation : ""}`,
    `  Graph:  tasks=${integrityResult.taskCount}, agents=${integrityResult.agentCount}, assignments=${integrityResult.assignmentCount}`,
    `  Integrity: ${integrityResult.valid ? "✓ PASS" : `✗ FAIL (${integrityResult.errors.length} errors)`}`,
  ];

  if (integrityResult.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const err of integrityResult.errors) {
      lines.push(`    - ${err}`);
    }
  }

  return lines.join("\n");
}
