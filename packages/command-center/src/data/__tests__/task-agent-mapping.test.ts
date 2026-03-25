/**
 * task-agent-mapping.test.ts — Unit tests for task-agent mapping ontology entities.
 *
 * Sub-AC 5a: Validates that task_agent_mapping entities:
 *   1. Expose source agent (sourceAgentId) and target task (targetTaskId) references
 *   2. Pre-compute all renderer-consumable fields (priorityColor, statusBeamColor,
 *      isVisibleInScene) from raw store state
 *   3. Correctly apply the SCENE_VISIBLE_STATUSES visibility predicate
 *   4. Produce correct PointLight budget allocation
 *   5. Are enumerable via builder functions that take raw store state
 *
 * Test ID scheme:
 *   5a-1..N  : Core entity structure + source/target references
 *   5a-v-N   : Visibility predicate correctness
 *   5a-c-N   : Color mapping correctness
 *   5a-q-N   : Query function coverage (buildAll, getVisible, forAgent, forTask)
 *   5a-l-N   : PointLight budget allocation
 *   5a-s-N   : Sorting / urgency ordering
 */

import { describe, it, expect } from "vitest";
import type { TaskAgentAssignment, TaskRecord } from "../task-types.js";
import {
  SCENE_VISIBLE_STATUSES,
  TASK_STATUS_BEAM_COLOR,
  TASK_PRIORITY_LIGHT_INTENSITY,
  MAX_CONNECTOR_POINT_LIGHTS,
  MAPPING_PRIORITY_RANK,
  buildMappingEntity,
  buildAllMappingEntities,
  getVisibleMappingEntities,
  getMappingEntitiesForAgent,
  getMappingEntityForTask,
  partitionMappingEntities,
  allocatePointLightBudget,
  compareMappingEntitiesByUrgency,
  formatMappingEntitySummary,
  formatMappingEntitiesSummary,
  type TaskAgentMappingEntity,
} from "../task-agent-mapping.js";
import { TASK_PRIORITY_COLOR } from "../task-types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAssignment(
  taskId:     string,
  agentId:    string,
  priority:   TaskAgentAssignment["priority"] = "normal",
  status:     TaskAgentAssignment["status"]   = "active",
  assignedTs  = 1_710_000_000_000,
): TaskAgentAssignment {
  return { taskId, agentId, assignedTs, priority, status };
}

function makeTask(
  taskId:   string,
  status:   TaskRecord["status"]   = "active",
  priority: TaskRecord["priority"] = "normal",
  assignedAgentId: string | null = "agent-x",
): TaskRecord {
  const ts = 1_710_000_000_000;
  return {
    taskId,
    title:          `Task ${taskId}`,
    description:    undefined,
    status,
    priority,
    assignedAgentId,
    createdTs:      ts,
    updatedTs:      ts + 60_000,
    startedTs:      status === "active" ? ts + 30_000 : null,
    completedTs:    null,
    parentTaskId:   null,
    tags:           [],
    eventIds:       [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-1..N — Core entity structure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — TaskAgentMappingEntity structure", () => {

  // 5a-1: buildMappingEntity produces all required fields
  it("5a-1: buildMappingEntity produces all required fields", () => {
    const assignment = makeAssignment("task-abc", "agent-dev");
    const task       = makeTask("task-abc", "active", "critical");
    const entity     = buildMappingEntity(assignment, task);

    expect(entity).toMatchObject<Partial<TaskAgentMappingEntity>>({
      mappingId:       "agent-dev:task-abc",
      sourceAgentId:   "agent-dev",
      targetTaskId:    "task-abc",
      priority:        "critical",
      status:          "active",
      isVisibleInScene: true,
    });
    expect(typeof entity.assignedTs).toBe("number");
    expect(entity.priorityColor.startsWith("#")).toBe(true);
    expect(entity.statusBeamColor.startsWith("#")).toBe(true);
  });

  // 5a-2: mappingId is deterministic composite "<agentId>:<taskId>"
  it("5a-2: mappingId is deterministic composite key", () => {
    const a1 = buildMappingEntity(makeAssignment("t1", "agent-A"), makeTask("t1"));
    const a2 = buildMappingEntity(makeAssignment("t1", "agent-A"), makeTask("t1"));
    // Deterministic across multiple builds
    expect(a1.mappingId).toBe(a2.mappingId);
    expect(a1.mappingId).toBe("agent-A:t1");
  });

  // 5a-3: sourceAgentId is the agent from the assignment record
  it("5a-3: sourceAgentId matches assignment.agentId", () => {
    const entity = buildMappingEntity(
      makeAssignment("t-xyz", "agent-manager"),
      makeTask("t-xyz"),
    );
    expect(entity.sourceAgentId).toBe("agent-manager");
  });

  // 5a-4: targetTaskId is the task from the assignment record
  it("5a-4: targetTaskId matches assignment.taskId", () => {
    const entity = buildMappingEntity(
      makeAssignment("task-impl-42", "agent-impl"),
      makeTask("task-impl-42"),
    );
    expect(entity.targetTaskId).toBe("task-impl-42");
  });

  // 5a-5: priority is taken from the TaskRecord (canonical source)
  it("5a-5: priority is taken from the TaskRecord", () => {
    const assignment = makeAssignment("t1", "a1", "low"); // assignment has "low"
    const task       = makeTask("t1", "active", "critical"); // task has "critical"
    const entity     = buildMappingEntity(assignment, task);
    // TaskRecord is the canonical source of truth
    expect(entity.priority).toBe("critical");
  });

  // 5a-6: status is taken from the TaskRecord
  it("5a-6: status is taken from the TaskRecord", () => {
    const assignment = makeAssignment("t1", "a1", "normal", "assigned");
    const task       = makeTask("t1", "blocked"); // task is now blocked
    const entity     = buildMappingEntity(assignment, task);
    expect(entity.status).toBe("blocked");
  });

  // 5a-7: assignedTs is taken from the assignment (not the task)
  it("5a-7: assignedTs is taken from the assignment record", () => {
    const ASSIGNED_TS = 1_710_500_000_000;
    const assignment  = makeAssignment("t1", "a1", "normal", "active", ASSIGNED_TS);
    const task        = makeTask("t1");
    const entity      = buildMappingEntity(assignment, task);
    expect(entity.assignedTs).toBe(ASSIGNED_TS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-v-N — Visibility predicate
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — Visibility predicate (SCENE_VISIBLE_STATUSES)", () => {

  // 5a-v-1
  it("5a-v-1: SCENE_VISIBLE_STATUSES contains exactly 4 statuses", () => {
    expect(SCENE_VISIBLE_STATUSES.size).toBe(4);
    expect(SCENE_VISIBLE_STATUSES.has("assigned")).toBe(true);
    expect(SCENE_VISIBLE_STATUSES.has("active")).toBe(true);
    expect(SCENE_VISIBLE_STATUSES.has("blocked")).toBe(true);
    expect(SCENE_VISIBLE_STATUSES.has("review")).toBe(true);
  });

  // 5a-v-2
  it("5a-v-2: terminal statuses are excluded from SCENE_VISIBLE_STATUSES", () => {
    expect(SCENE_VISIBLE_STATUSES.has("done")).toBe(false);
    expect(SCENE_VISIBLE_STATUSES.has("cancelled")).toBe(false);
    expect(SCENE_VISIBLE_STATUSES.has("failed")).toBe(false);
  });

  // 5a-v-3
  it("5a-v-3: pre-assignment statuses are excluded", () => {
    expect(SCENE_VISIBLE_STATUSES.has("draft")).toBe(false);
    expect(SCENE_VISIBLE_STATUSES.has("planned")).toBe(false);
  });

  // 5a-v-4
  it("5a-v-4: isVisibleInScene is true for active task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "active"),
    );
    expect(entity.isVisibleInScene).toBe(true);
  });

  // 5a-v-5
  it("5a-v-5: isVisibleInScene is true for blocked task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "blocked"),
    );
    expect(entity.isVisibleInScene).toBe(true);
  });

  // 5a-v-6
  it("5a-v-6: isVisibleInScene is true for assigned task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "assigned"),
    );
    expect(entity.isVisibleInScene).toBe(true);
  });

  // 5a-v-7
  it("5a-v-7: isVisibleInScene is true for review task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "review"),
    );
    expect(entity.isVisibleInScene).toBe(true);
  });

  // 5a-v-8
  it("5a-v-8: isVisibleInScene is false for done task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "done"),
    );
    expect(entity.isVisibleInScene).toBe(false);
  });

  // 5a-v-9
  it("5a-v-9: isVisibleInScene is false for cancelled task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "cancelled"),
    );
    expect(entity.isVisibleInScene).toBe(false);
  });

  // 5a-v-10
  it("5a-v-10: isVisibleInScene is false for failed task", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "failed"),
    );
    expect(entity.isVisibleInScene).toBe(false);
  });

  // 5a-v-11
  it("5a-v-11: isVisibleInScene is false for draft task (no connector yet)", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1"),
      makeTask("t1", "draft"),
    );
    expect(entity.isVisibleInScene).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-c-N — Color mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — Color mapping (priorityColor + statusBeamColor)", () => {

  // 5a-c-1
  it("5a-c-1: TASK_STATUS_BEAM_COLOR covers all 9 statuses with valid hex values", () => {
    const statuses = [
      "draft", "planned", "assigned", "active", "blocked",
      "review", "done", "failed", "cancelled",
    ] as const;
    for (const s of statuses) {
      expect(TASK_STATUS_BEAM_COLOR[s]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // 5a-c-2
  it("5a-c-2: TASK_STATUS_BEAM_COLOR values are distinct for the 4 visible statuses", () => {
    const visible = ["assigned", "active", "blocked", "review"] as const;
    const colors  = visible.map((s) => TASK_STATUS_BEAM_COLOR[s].toLowerCase());
    const unique  = new Set(colors);
    expect(unique.size).toBe(4);
  });

  // 5a-c-3
  it("5a-c-3: entity.priorityColor matches TASK_PRIORITY_COLOR[entity.priority]", () => {
    const priorities = ["critical", "high", "normal", "low"] as const;
    for (const priority of priorities) {
      const entity = buildMappingEntity(
        makeAssignment("t1", "a1", priority),
        makeTask("t1", "active", priority),
      );
      expect(entity.priorityColor).toBe(TASK_PRIORITY_COLOR[priority]);
    }
  });

  // 5a-c-4
  it("5a-c-4: entity.statusBeamColor matches TASK_STATUS_BEAM_COLOR[entity.status]", () => {
    const statuses = [
      "active", "blocked", "review", "assigned",
      "draft", "planned", "done", "failed", "cancelled",
    ] as const;
    for (const status of statuses) {
      const entity = buildMappingEntity(
        makeAssignment("t1", "a1"),
        makeTask("t1", status),
      );
      expect(entity.statusBeamColor).toBe(TASK_STATUS_BEAM_COLOR[status]);
    }
  });

  // 5a-c-5
  it("5a-c-5: critical task has red priorityColor and unique beam color", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "a1", "critical"),
      makeTask("t1", "active", "critical"),
    );
    // Critical = #FF3D00 (red-orange)
    expect(entity.priorityColor).toMatch(/^#[Ff][Ff]/);
    // Active beam = #00ff88 (green)
    expect(entity.statusBeamColor.toLowerCase()).toBe("#00ff88");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-q-N — Query function coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — Query functions", () => {

  // Build standard fixtures
  const assignments: Record<string, TaskAgentAssignment> = {
    "t-active":   makeAssignment("t-active",   "agent-1", "critical", "active"),
    "t-blocked":  makeAssignment("t-blocked",  "agent-2", "high",     "blocked"),
    "t-review":   makeAssignment("t-review",   "agent-1", "normal",   "review"),
    "t-assigned": makeAssignment("t-assigned", "agent-3", "low",      "assigned"),
    "t-done":     makeAssignment("t-done",     "agent-2", "normal",   "done"),
    "t-draft":    makeAssignment("t-draft",    "agent-3", "low",      "draft"),
  };

  const tasks: Record<string, TaskRecord> = {
    "t-active":   makeTask("t-active",   "active",   "critical", "agent-1"),
    "t-blocked":  makeTask("t-blocked",  "blocked",  "high",     "agent-2"),
    "t-review":   makeTask("t-review",   "review",   "normal",   "agent-1"),
    "t-assigned": makeTask("t-assigned", "assigned", "low",      "agent-3"),
    "t-done":     makeTask("t-done",     "done",     "normal",   "agent-2"),
    "t-draft":    makeTask("t-draft",    "draft",    "low",      "agent-3"),
  };

  // 5a-q-1
  it("5a-q-1: buildAllMappingEntities returns one entity per assignment", () => {
    const entities = buildAllMappingEntities(assignments, tasks);
    expect(entities.length).toBe(6);
  });

  // 5a-q-2
  it("5a-q-2: buildAllMappingEntities skips entries where task is missing", () => {
    const missingTasks = { "t-active": tasks["t-active"] }; // only 1 task
    const entities = buildAllMappingEntities(assignments, missingTasks);
    // Only t-active has a task record
    expect(entities.length).toBe(1);
    expect(entities[0].targetTaskId).toBe("t-active");
  });

  // 5a-q-3
  it("5a-q-3: getVisibleMappingEntities returns only SCENE_VISIBLE_STATUSES entities", () => {
    const entities = getVisibleMappingEntities(assignments, tasks);
    // active, blocked, review, assigned = 4 visible; done, draft = 2 hidden
    expect(entities.length).toBe(4);
    for (const e of entities) {
      expect(e.isVisibleInScene).toBe(true);
      expect(SCENE_VISIBLE_STATUSES.has(e.status)).toBe(true);
    }
  });

  // 5a-q-4
  it("5a-q-4: getVisibleMappingEntities sorts by urgency (critical active first)", () => {
    const entities = getVisibleMappingEntities(assignments, tasks);
    // critical active should be first
    expect(entities[0].priority).toBe("critical");
    expect(entities[0].status).toBe("active");
  });

  // 5a-q-5
  it("5a-q-5: getMappingEntitiesForAgent returns only entities for that agent", () => {
    const agent1Entities = getMappingEntitiesForAgent("agent-1", assignments, tasks);
    // agent-1 has t-active + t-review
    expect(agent1Entities.length).toBe(2);
    for (const e of agent1Entities) {
      expect(e.sourceAgentId).toBe("agent-1");
    }
  });

  // 5a-q-6
  it("5a-q-6: getMappingEntitiesForAgent returns empty array for unknown agent", () => {
    const entities = getMappingEntitiesForAgent("agent-nonexistent", assignments, tasks);
    expect(entities).toEqual([]);
  });

  // 5a-q-7
  it("5a-q-7: getMappingEntityForTask returns the entity for a known task", () => {
    const entity = getMappingEntityForTask("t-active", assignments, tasks);
    expect(entity).toBeDefined();
    expect(entity!.targetTaskId).toBe("t-active");
    expect(entity!.sourceAgentId).toBe("agent-1");
  });

  // 5a-q-8
  it("5a-q-8: getMappingEntityForTask returns undefined for unassigned task", () => {
    const entity = getMappingEntityForTask("task-nonexistent", assignments, tasks);
    expect(entity).toBeUndefined();
  });

  // 5a-q-9
  it("5a-q-9: partitionMappingEntities correctly splits visible vs hidden", () => {
    const { visible, hidden } = partitionMappingEntities(assignments, tasks);
    expect(visible.length).toBe(4);
    expect(hidden.length).toBe(2);
    for (const e of visible) expect(e.isVisibleInScene).toBe(true);
    for (const e of hidden)  expect(e.isVisibleInScene).toBe(false);
  });

  // 5a-q-10
  it("5a-q-10: empty assignments produce empty entity arrays", () => {
    expect(buildAllMappingEntities({}, tasks)).toEqual([]);
    expect(getVisibleMappingEntities({}, tasks)).toEqual([]);
    expect(getMappingEntitiesForAgent("a1", {}, tasks)).toEqual([]);
    expect(getMappingEntityForTask("t1", {}, tasks)).toBeUndefined();
    const { visible, hidden } = partitionMappingEntities({}, tasks);
    expect(visible).toEqual([]);
    expect(hidden).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-l-N — PointLight budget allocation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — PointLight budget allocation", () => {

  // 5a-l-1
  it("5a-l-1: MAX_CONNECTOR_POINT_LIGHTS is 4", () => {
    expect(MAX_CONNECTOR_POINT_LIGHTS).toBe(4);
  });

  // 5a-l-2
  it("5a-l-2: TASK_PRIORITY_LIGHT_INTENSITY is strictly ordered critical > high > normal > low", () => {
    expect(TASK_PRIORITY_LIGHT_INTENSITY.critical)
      .toBeGreaterThan(TASK_PRIORITY_LIGHT_INTENSITY.high);
    expect(TASK_PRIORITY_LIGHT_INTENSITY.high)
      .toBeGreaterThan(TASK_PRIORITY_LIGHT_INTENSITY.normal);
    expect(TASK_PRIORITY_LIGHT_INTENSITY.normal)
      .toBeGreaterThan(TASK_PRIORITY_LIGHT_INTENSITY.low);
    expect(TASK_PRIORITY_LIGHT_INTENSITY.low).toBeGreaterThan(0);
  });

  // 5a-l-3
  it("5a-l-3: allocatePointLightBudget returns at most MAX_CONNECTOR_POINT_LIGHTS", () => {
    const entities: TaskAgentMappingEntity[] = [
      buildMappingEntity(makeAssignment("t1", "a", "low",      "active"), makeTask("t1", "active", "low")),
      buildMappingEntity(makeAssignment("t2", "a", "low",      "active"), makeTask("t2", "active", "low")),
      buildMappingEntity(makeAssignment("t3", "a", "normal",   "active"), makeTask("t3", "active", "normal")),
      buildMappingEntity(makeAssignment("t4", "a", "high",     "active"), makeTask("t4", "active", "high")),
      buildMappingEntity(makeAssignment("t5", "a", "critical", "active"), makeTask("t5", "active", "critical")),
    ];
    const allocated = allocatePointLightBudget(entities);
    expect(allocated.length).toBe(MAX_CONNECTOR_POINT_LIGHTS);
  });

  // 5a-l-4
  it("5a-l-4: critical task is always in the PointLight budget", () => {
    const entities: TaskAgentMappingEntity[] = [
      buildMappingEntity(makeAssignment("t1", "a", "low",      "active"), makeTask("t1", "active", "low")),
      buildMappingEntity(makeAssignment("t2", "a", "low",      "active"), makeTask("t2", "active", "low")),
      buildMappingEntity(makeAssignment("t3", "a", "critical", "active"), makeTask("t3", "active", "critical")),
    ];
    const allocated = allocatePointLightBudget(entities);
    const ids = allocated.map((e) => e.targetTaskId);
    expect(ids).toContain("t3");
  });

  // 5a-l-5
  it("5a-l-5: allocatePointLightBudget excludes non-visible entities", () => {
    const entities: TaskAgentMappingEntity[] = [
      buildMappingEntity(makeAssignment("t1", "a", "critical", "active"), makeTask("t1", "done",   "critical")),
      buildMappingEntity(makeAssignment("t2", "a", "normal",   "active"), makeTask("t2", "active", "normal")),
    ];
    const allocated = allocatePointLightBudget(entities);
    // Only t2 is visible (done task is excluded)
    expect(allocated.length).toBe(1);
    expect(allocated[0].targetTaskId).toBe("t2");
  });

  // 5a-l-6
  it("5a-l-6: allocatePointLightBudget respects custom budget", () => {
    const entities: TaskAgentMappingEntity[] = [
      buildMappingEntity(makeAssignment("t1", "a", "high",   "active"), makeTask("t1", "active", "high")),
      buildMappingEntity(makeAssignment("t2", "a", "normal", "active"), makeTask("t2", "active", "normal")),
      buildMappingEntity(makeAssignment("t3", "a", "low",    "active"), makeTask("t3", "active", "low")),
    ];
    const allocated = allocatePointLightBudget(entities, 2);
    expect(allocated.length).toBe(2);
    // high and normal should be in budget, low is out
    const ids = allocated.map((e) => e.targetTaskId);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).not.toContain("t3");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-s-N — Sorting / urgency ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — Urgency ordering (compareMappingEntitiesByUrgency)", () => {

  // 5a-s-1
  it("5a-s-1: MAPPING_PRIORITY_RANK is strictly ordered critical > high > normal > low", () => {
    expect(MAPPING_PRIORITY_RANK.critical).toBeGreaterThan(MAPPING_PRIORITY_RANK.high);
    expect(MAPPING_PRIORITY_RANK.high).toBeGreaterThan(MAPPING_PRIORITY_RANK.normal);
    expect(MAPPING_PRIORITY_RANK.normal).toBeGreaterThan(MAPPING_PRIORITY_RANK.low);
    expect(MAPPING_PRIORITY_RANK.low).toBeGreaterThan(0);
  });

  // 5a-s-2
  it("5a-s-2: critical entity sorts before high entity", () => {
    const crit = buildMappingEntity(
      makeAssignment("t1", "a", "critical"), makeTask("t1", "active", "critical"),
    );
    const high = buildMappingEntity(
      makeAssignment("t2", "a", "high"), makeTask("t2", "active", "high"),
    );
    expect(compareMappingEntitiesByUrgency(crit, high)).toBeLessThan(0);
    expect(compareMappingEntitiesByUrgency(high, crit)).toBeGreaterThan(0);
  });

  // 5a-s-3
  it("5a-s-3: same priority — active sorts before blocked", () => {
    const active  = buildMappingEntity(
      makeAssignment("t1", "a", "normal"), makeTask("t1", "active",  "normal"),
    );
    const blocked = buildMappingEntity(
      makeAssignment("t2", "a", "normal"), makeTask("t2", "blocked", "normal"),
    );
    expect(compareMappingEntitiesByUrgency(active, blocked)).toBeLessThan(0);
  });

  // 5a-s-4
  it("5a-s-4: same priority + same status — comparator returns 0", () => {
    const a = buildMappingEntity(makeAssignment("t1", "a"), makeTask("t1", "active"));
    const b = buildMappingEntity(makeAssignment("t2", "b"), makeTask("t2", "active"));
    expect(compareMappingEntitiesByUrgency(a, b)).toBe(0);
  });

  // 5a-s-5
  it("5a-s-5: getVisibleMappingEntities is sorted critical+active first", () => {
    const assignments: Record<string, TaskAgentAssignment> = {
      "t1": makeAssignment("t1", "a", "low",      "active"),
      "t2": makeAssignment("t2", "b", "critical", "active"),
      "t3": makeAssignment("t3", "c", "high",     "blocked"),
    };
    const tasks: Record<string, TaskRecord> = {
      "t1": makeTask("t1", "active",  "low"),
      "t2": makeTask("t2", "active",  "critical"),
      "t3": makeTask("t3", "blocked", "high"),
    };
    const visible = getVisibleMappingEntities(assignments, tasks);
    expect(visible[0].targetTaskId).toBe("t2"); // critical+active first
    expect(visible[1].targetTaskId).toBe("t3"); // high+blocked second
    expect(visible[2].targetTaskId).toBe("t1"); // low+active last
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5a-d-N — Debug/serialisation helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 5a — Debug/serialisation helpers", () => {

  // 5a-d-1
  it("5a-d-1: formatMappingEntitySummary returns a non-empty string", () => {
    const entity = buildMappingEntity(
      makeAssignment("t1", "agent-mgr", "critical"),
      makeTask("t1", "active", "critical"),
    );
    const summary = formatMappingEntitySummary(entity);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    // Should contain agent and task references
    expect(summary).toContain("agent-mgr");
    expect(summary).toContain("t1");
    expect(summary).toContain("active");
  });

  // 5a-d-2
  it("5a-d-2: formatMappingEntitySummary marks visible entities with ✓", () => {
    const visible = buildMappingEntity(makeAssignment("t1", "a"), makeTask("t1", "active"));
    const hidden  = buildMappingEntity(makeAssignment("t2", "b"), makeTask("t2", "done"));
    expect(formatMappingEntitySummary(visible)).toContain("✓");
    expect(formatMappingEntitySummary(hidden)).toContain("–");
  });

  // 5a-d-3
  it("5a-d-3: formatMappingEntitiesSummary returns a non-empty string for non-empty input", () => {
    const assignments: Record<string, TaskAgentAssignment> = {
      "t1": makeAssignment("t1", "a", "critical", "active"),
    };
    const tasks: Record<string, TaskRecord> = {
      "t1": makeTask("t1", "active", "critical"),
    };
    const all     = buildAllMappingEntities(assignments, tasks);
    const summary = formatMappingEntitiesSummary(all);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("1 total");
    expect(summary).toContain("1 visible");
  });

  // 5a-d-4
  it("5a-d-4: formatMappingEntitiesSummary handles empty array", () => {
    const summary = formatMappingEntitiesSummary([]);
    expect(summary).toContain("0 total");
    expect(summary).toContain("0 visible");
  });
});
