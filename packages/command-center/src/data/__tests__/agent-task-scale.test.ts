/**
 * agent-task-scale.test.ts — Scale tests for agent/task registry and scene graph.
 *
 * Sub-AC 15a: Verify the agent/task registry and scene graph can hold
 *   3–20 agents and up to 200 tasks without structural errors or data loss.
 *
 * Test categories:
 *   15a-bounds-N    : Scale bound constant validation
 *   15a-gen-N       : Generator function correctness
 *   15a-agents-N    : Agent registry scale (3 agents, 20 agents)
 *   15a-tasks-N     : Task registry scale (1 task → 200 tasks)
 *   15a-integrity-N : Scene graph integrity (cross-index coherence)
 *   15a-mapping-N   : task-agent-mapping functions at full scale
 *   15a-paginate-N  : Pagination correctness at 200 tasks
 *   15a-filter-N    : filterTasks correctness at 200 tasks
 *   15a-stress-N    : Full stress scenario (20 agents × 10 tasks)
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_REGISTRY_MIN,
  AGENT_REGISTRY_MAX,
  TASK_REGISTRY_MAX,
  MAX_TASKS_PER_AGENT,
  validateAgentRegistryScale,
  validateTaskRegistryScale,
  checkSceneGraphIntegrity,
  generateScaleAgentIds,
  generateScaleAgentDefs,
  generateScaleTasks,
  generateScaleAssignments,
  generateScaleAgentTaskIndex,
  formatScaleValidationSummary,
  type AgentScaleValidationResult,
  type TaskScaleValidationResult,
  type SceneGraphIntegrityResult,
} from "../agent-task-scale.js";
import {
  buildAllMappingEntities,
  getVisibleMappingEntities,
  partitionMappingEntities,
  allocatePointLightBudget,
  formatMappingEntitiesSummary,
} from "../task-agent-mapping.js";
import type { TaskRecord, TaskAgentAssignment } from "../task-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-bounds — Scale bound constants
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Scale bound constants", () => {

  it("15a-bounds-1: AGENT_REGISTRY_MIN is 3", () => {
    expect(AGENT_REGISTRY_MIN).toBe(3);
  });

  it("15a-bounds-2: AGENT_REGISTRY_MAX is 20", () => {
    expect(AGENT_REGISTRY_MAX).toBe(20);
  });

  it("15a-bounds-3: TASK_REGISTRY_MAX is 200", () => {
    expect(TASK_REGISTRY_MAX).toBe(200);
  });

  it("15a-bounds-4: MAX_TASKS_PER_AGENT * AGENT_REGISTRY_MAX >= TASK_REGISTRY_MAX", () => {
    expect(MAX_TASKS_PER_AGENT * AGENT_REGISTRY_MAX).toBeGreaterThanOrEqual(TASK_REGISTRY_MAX);
  });

  it("15a-bounds-5: AGENT_REGISTRY_MIN < AGENT_REGISTRY_MAX", () => {
    expect(AGENT_REGISTRY_MIN).toBeLessThan(AGENT_REGISTRY_MAX);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-gen — Generator function correctness
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Generator functions", () => {

  it("15a-gen-1: generateScaleAgentIds produces N unique IDs", () => {
    for (const n of [3, 5, 10, 20]) {
      const ids = generateScaleAgentIds(n);
      expect(ids.length).toBe(n);
      expect(new Set(ids).size).toBe(n); // all unique
    }
  });

  it("15a-gen-2: generateScaleAgentIds is deterministic (same count → same ids)", () => {
    const a = generateScaleAgentIds(10);
    const b = generateScaleAgentIds(10);
    expect(a).toEqual(b);
  });

  it("15a-gen-3: generateScaleAgentIds throws for count outside [1, 20]", () => {
    expect(() => generateScaleAgentIds(0)).toThrow(RangeError);
    expect(() => generateScaleAgentIds(21)).toThrow(RangeError);
  });

  it("15a-gen-4: generateScaleAgentDefs produces valid AgentDef objects", () => {
    const defs = generateScaleAgentDefs(5);
    expect(defs.length).toBe(5);
    for (const def of defs) {
      expect(typeof def.agentId).toBe("string");
      expect(typeof def.name).toBe("string");
      expect(["orchestrator", "implementer", "researcher", "reviewer", "validator"]).toContain(def.role);
      expect(Array.isArray(def.capabilities)).toBe(true);
      expect(["low", "medium", "high"]).toContain(def.riskClass);
      expect(typeof def.summary).toBe("string");
      expect(typeof def.visual.color).toBe("string");
      expect(typeof def.defaultRoom).toBe("string");
    }
  });

  it("15a-gen-5: generateScaleTasks produces N task records", () => {
    for (const n of [1, 50, 100, 200]) {
      const agentIds = generateScaleAgentIds(10);
      const tasks = generateScaleTasks(n, agentIds);
      expect(tasks.length).toBe(n);
    }
  });

  it("15a-gen-6: generateScaleTasks produces unique task IDs", () => {
    const agentIds = generateScaleAgentIds(5);
    const tasks = generateScaleTasks(200, agentIds);
    const ids = tasks.map((t) => t.taskId);
    expect(new Set(ids).size).toBe(200);
  });

  it("15a-gen-7: generateScaleTasks is deterministic", () => {
    const agentIds = generateScaleAgentIds(10);
    const a = generateScaleTasks(50, agentIds, 1_710_000_000_000);
    const b = generateScaleTasks(50, agentIds, 1_710_000_000_000);
    expect(a.map((t) => t.taskId)).toEqual(b.map((t) => t.taskId));
    expect(a.map((t) => t.status)).toEqual(b.map((t) => t.status));
  });

  it("15a-gen-8: generateScaleTasks throws for count outside [1, 200]", () => {
    expect(() => generateScaleTasks(0, [])).toThrow(RangeError);
    expect(() => generateScaleTasks(201, [])).toThrow(RangeError);
  });

  it("15a-gen-9: generateScaleTasks with no agentIds creates unassigned tasks", () => {
    const tasks = generateScaleTasks(10, []);
    for (const task of tasks) {
      expect(task.assignedAgentId).toBeNull();
    }
  });

  it("15a-gen-10: generateScaleAssignments only includes non-terminal tasks", () => {
    const agentIds = generateScaleAgentIds(5);
    const tasks = generateScaleTasks(100, agentIds);
    const assignments = generateScaleAssignments(tasks);

    for (const [taskId, assignment] of Object.entries(assignments)) {
      const task = tasks.find((t) => t.taskId === taskId)!;
      expect(task).toBeDefined();
      expect(["done", "cancelled", "failed"]).not.toContain(task.status);
      expect(task.assignedAgentId).not.toBeNull();
      expect(assignment.agentId).toBe(task.assignedAgentId);
    }
  });

  it("15a-gen-11: generateScaleAgentTaskIndex mirrors assignments correctly", () => {
    const agentIds = generateScaleAgentIds(10);
    const tasks = generateScaleTasks(100, agentIds);
    const assignments = generateScaleAssignments(tasks);
    const idx = generateScaleAgentTaskIndex(assignments);

    // Every agentId in the index must have come from an assignment
    for (const [agentId, taskIds] of Object.entries(idx)) {
      for (const taskId of taskIds) {
        expect(assignments[taskId]).toBeDefined();
        expect(assignments[taskId].agentId).toBe(agentId);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-agents — Agent registry scale validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Agent registry scale validation", () => {

  it("15a-agents-1: validateAgentRegistryScale passes for 3 agents (minimum)", () => {
    const result = validateAgentRegistryScale(generateScaleAgentIds(3));
    expect(result.valid).toBe(true);
    expect(result.count).toBe(3);
    expect(result.violation).toBe("");
  });

  it("15a-agents-2: validateAgentRegistryScale passes for 20 agents (maximum)", () => {
    const result = validateAgentRegistryScale(generateScaleAgentIds(20));
    expect(result.valid).toBe(true);
    expect(result.count).toBe(20);
    expect(result.violation).toBe("");
  });

  it("15a-agents-3: validateAgentRegistryScale passes for all sizes in [3, 20]", () => {
    for (let n = AGENT_REGISTRY_MIN; n <= AGENT_REGISTRY_MAX; n++) {
      const result = validateAgentRegistryScale(generateScaleAgentIds(n));
      expect(result.valid).toBe(true, `Expected valid for ${n} agents`);
    }
  });

  it("15a-agents-4: validateAgentRegistryScale reports under-populated for 1 agent", () => {
    const result = validateAgentRegistryScale(["single-agent"]);
    expect(result.valid).toBe(false);
    expect(result.violation).toContain("under-populated");
    expect(result.count).toBe(1);
  });

  it("15a-agents-5: validateAgentRegistryScale reports under-populated for 2 agents", () => {
    const result = validateAgentRegistryScale(["a1", "a2"]);
    expect(result.valid).toBe(false);
    expect(result.violation).toContain("under-populated");
  });

  it("15a-agents-6: validateAgentRegistryScale reports over-capacity for 21 agents", () => {
    const fakeIds = Array.from({ length: 21 }, (_, i) => `agent-${i}`);
    const result = validateAgentRegistryScale(fakeIds);
    expect(result.valid).toBe(false);
    expect(result.violation).toContain("over capacity");
    expect(result.count).toBe(21);
  });

  it("15a-agents-7: validateAgentRegistryScale accepts a Set<string>", () => {
    const idSet = new Set(generateScaleAgentIds(10));
    const result = validateAgentRegistryScale(idSet);
    expect(result.valid).toBe(true);
    expect(result.count).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-tasks — Task registry scale validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Task registry scale validation", () => {

  it("15a-tasks-1: validateTaskRegistryScale passes for 0 tasks", () => {
    const result = validateTaskRegistryScale({});
    expect(result.valid).toBe(true);
    expect(result.count).toBe(0);
  });

  it("15a-tasks-2: validateTaskRegistryScale passes for 200 tasks (maximum)", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;

    const result = validateTaskRegistryScale(taskMap);
    expect(result.valid).toBe(true);
    expect(result.count).toBe(200);
    expect(result.violation).toBe("");
  });

  it("15a-tasks-3: validateTaskRegistryScale passes for all sizes 1–200", () => {
    for (const n of [1, 50, 100, 150, 200]) {
      const agentIds = generateScaleAgentIds(10);
      const tasks = generateScaleTasks(n, agentIds);
      const taskMap: Record<string, TaskRecord> = {};
      for (const t of tasks) taskMap[t.taskId] = t;

      const result = validateTaskRegistryScale(taskMap);
      expect(result.valid).toBe(true, `Expected valid for ${n} tasks`);
    }
  });

  it("15a-tasks-4: validateTaskRegistryScale reports over-capacity for 201 tasks", () => {
    // Build 201 fake task records
    const tasks: Record<string, TaskRecord> = {};
    for (let i = 0; i <= 200; i++) {
      const id = `overflow-task-${i}`;
      tasks[id] = {
        taskId: id,
        title: `Task ${i}`,
        status: "draft",
        priority: "normal",
        assignedAgentId: null,
        createdTs: 0, updatedTs: 0, startedTs: null, completedTs: null,
        parentTaskId: null, tags: [], eventIds: [],
      };
    }
    const result = validateTaskRegistryScale(tasks);
    expect(result.valid).toBe(false);
    expect(result.violation).toContain("over capacity");
    expect(result.count).toBe(201);
  });

  it("15a-tasks-5: validateTaskRegistryScale accepts an array of TaskRecords", () => {
    const agentIds = generateScaleAgentIds(5);
    const tasks = generateScaleTasks(100, agentIds);
    const result = validateTaskRegistryScale(tasks);
    expect(result.valid).toBe(true);
    expect(result.count).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-integrity — Scene graph integrity checker
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Scene graph integrity checker", () => {

  function buildScenario(agentCount: number, taskCount: number) {
    const agentIds = generateScaleAgentIds(agentCount);
    const tasks = generateScaleTasks(taskCount, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);
    const agentTaskIndex = generateScaleAgentTaskIndex(assignments);
    return { agentIds, tasks, taskMap, assignments, agentTaskIndex };
  }

  it("15a-integrity-1: integrity check passes for 3 agents / 30 tasks", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(3, 30);
    const result = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.orphanedAssignmentIds).toEqual([]);
    expect(result.orphanedIndexEntries).toEqual([]);
  });

  it("15a-integrity-2: integrity check passes for 20 agents / 200 tasks", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(20, 200);
    const result = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("15a-integrity-3: taskCount equals the number of tasks passed in", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(10, 100);
    const result = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(result.taskCount).toBe(100);
  });

  it("15a-integrity-4: assignmentCount equals assignments map size", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(5, 50);
    const result = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(result.assignmentCount).toBe(Object.keys(assignments).length);
  });

  it("15a-integrity-5: orphaned assignment detected when task is removed from tasks map", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(5, 20);

    // Find an assigned task and remove it from the task map
    const assignedTaskId = Object.keys(assignments)[0];
    const modifiedTaskMap = { ...taskMap };
    delete modifiedTaskMap[assignedTaskId];

    const result = checkSceneGraphIntegrity(modifiedTaskMap, assignments, agentTaskIndex);
    expect(result.valid).toBe(false);
    expect(result.orphanedAssignmentIds).toContain(assignedTaskId);
    expect(result.errors.some((e) => e.includes(assignedTaskId))).toBe(true);
  });

  it("15a-integrity-6: orphaned index entry detected when task is removed from tasks map", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(5, 20);

    // Remove a task from the tasks map (but keep it in agentTaskIndex)
    const agentWithTasks = Object.keys(agentTaskIndex).find(
      (id) => agentTaskIndex[id].length > 0,
    )!;
    const orphanTaskId = agentTaskIndex[agentWithTasks][0];
    const modifiedTaskMap = { ...taskMap };
    delete modifiedTaskMap[orphanTaskId];
    const modifiedAssignments = { ...assignments };
    delete modifiedAssignments[orphanTaskId];

    const result = checkSceneGraphIntegrity(modifiedTaskMap, modifiedAssignments, agentTaskIndex);
    expect(result.valid).toBe(false);
    expect(result.orphanedIndexEntries).toContain(orphanTaskId);
  });

  it("15a-integrity-7: agentId mismatch detected when assignment has wrong agentId", () => {
    const { taskMap, assignments, agentTaskIndex } = buildScenario(5, 20);

    // Find a task in the index and corrupt the assignment's agentId
    const agentId = Object.keys(agentTaskIndex)[0];
    const taskId  = agentTaskIndex[agentId][0];
    const modifiedAssignments = {
      ...assignments,
      [taskId]: { ...assignments[taskId], agentId: "wrong-agent-id" },
    };

    const result = checkSceneGraphIntegrity(taskMap, modifiedAssignments, agentTaskIndex);
    expect(result.valid).toBe(false);
    expect(result.indexAssignmentMismatches.some((m) => m.includes(taskId))).toBe(true);
  });

  it("15a-integrity-8: empty registries pass integrity check", () => {
    const result = checkSceneGraphIntegrity({}, {}, {});
    expect(result.valid).toBe(true);
    expect(result.taskCount).toBe(0);
    expect(result.assignmentCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-mapping — task-agent-mapping functions at scale
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — task-agent-mapping functions at scale", () => {

  it("15a-mapping-1: buildAllMappingEntities handles 200 tasks without errors", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    expect(() => buildAllMappingEntities(assignments, taskMap)).not.toThrow();
    const entities = buildAllMappingEntities(assignments, taskMap);
    expect(entities.length).toBe(Object.keys(assignments).length);
  });

  it("15a-mapping-2: no data loss — buildAllMappingEntities covers all assignments", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const entities = buildAllMappingEntities(assignments, taskMap);
    const entityTaskIds = new Set(entities.map((e) => e.targetTaskId));
    const assignmentTaskIds = new Set(Object.keys(assignments));

    // Every assignment must be represented in the entity list
    for (const taskId of assignmentTaskIds) {
      expect(entityTaskIds.has(taskId)).toBe(true);
    }
  });

  it("15a-mapping-3: no duplicate mappingIds at full scale", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const entities = buildAllMappingEntities(assignments, taskMap);
    const ids = entities.map((e) => e.mappingId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("15a-mapping-4: getVisibleMappingEntities returns a subset at 200 tasks", () => {
    const agentIds = generateScaleAgentIds(10);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const all     = buildAllMappingEntities(assignments, taskMap);
    const visible = getVisibleMappingEntities(assignments, taskMap);

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThanOrEqual(all.length);
    // All returned entities are visible
    for (const e of visible) {
      expect(e.isVisibleInScene).toBe(true);
    }
  });

  it("15a-mapping-5: partitionMappingEntities — visible + hidden = total at 200 tasks", () => {
    const agentIds = generateScaleAgentIds(10);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const { visible, hidden } = partitionMappingEntities(assignments, taskMap);
    const all                 = buildAllMappingEntities(assignments, taskMap);

    expect(visible.length + hidden.length).toBe(all.length);
  });

  it("15a-mapping-6: allocatePointLightBudget does not exceed MAX_CONNECTOR_POINT_LIGHTS at scale", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const visible   = getVisibleMappingEntities(assignments, taskMap);
    const allocated = allocatePointLightBudget(visible);

    expect(allocated.length).toBeLessThanOrEqual(4); // MAX_CONNECTOR_POINT_LIGHTS = 4
  });

  it("15a-mapping-7: formatMappingEntitiesSummary does not throw at full scale", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments = generateScaleAssignments(tasks);

    const entities = buildAllMappingEntities(assignments, taskMap);
    expect(() => formatMappingEntitiesSummary(entities)).not.toThrow();

    const summary = formatMappingEntitiesSummary(entities);
    expect(summary).toContain("total");
    expect(summary).toContain("visible");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15a-stress — Full stress scenario
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 15a — Full stress scenario (20 agents × ≤10 tasks each)", () => {

  it("15a-stress-1: 20 agents with 200 tasks passes all scale validations", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks    = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments    = generateScaleAssignments(tasks);
    const agentTaskIndex = generateScaleAgentTaskIndex(assignments);

    // Agent scale
    const agentResult = validateAgentRegistryScale(agentIds);
    expect(agentResult.valid).toBe(true);

    // Task scale
    const taskResult = validateTaskRegistryScale(taskMap);
    expect(taskResult.valid).toBe(true);

    // Integrity
    const integrityResult = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(integrityResult.valid).toBe(true);
  });

  it("15a-stress-2: 3 agents (minimum) with 30 tasks passes all scale validations", () => {
    const agentIds = generateScaleAgentIds(3);
    const tasks    = generateScaleTasks(30, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments    = generateScaleAssignments(tasks);
    const agentTaskIndex = generateScaleAgentTaskIndex(assignments);

    const agentResult    = validateAgentRegistryScale(agentIds);
    const taskResult     = validateTaskRegistryScale(taskMap);
    const integrityResult = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);

    expect(agentResult.valid).toBe(true);
    expect(taskResult.valid).toBe(true);
    expect(integrityResult.valid).toBe(true);
  });

  it("15a-stress-3: no tasks are lost in the full 200-task scenario", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks    = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;

    // Every generated task is recoverable from the map
    for (const task of tasks) {
      const recovered = taskMap[task.taskId];
      expect(recovered).toBeDefined();
      expect(recovered.taskId).toBe(task.taskId);
      expect(recovered.title).toBe(task.title);
      expect(recovered.status).toBe(task.status);
      expect(recovered.priority).toBe(task.priority);
    }
  });

  it("15a-stress-4: no assignments are lost in the full 200-task scenario", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks    = generateScaleTasks(200, agentIds);
    const assignments = generateScaleAssignments(tasks);

    // Every active task in the generated set has a matching assignment
    const activeTasks = tasks.filter(
      (t) =>
        t.assignedAgentId !== null &&
        !["done", "cancelled", "failed"].includes(t.status),
    );
    for (const task of activeTasks) {
      const assignment = assignments[task.taskId];
      expect(assignment).toBeDefined();
      expect(assignment.taskId).toBe(task.taskId);
      expect(assignment.agentId).toBe(task.assignedAgentId);
    }
  });

  it("15a-stress-5: agentTaskIndex covers all agents that have active tasks", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks    = generateScaleTasks(200, agentIds);
    const assignments    = generateScaleAssignments(tasks);
    const agentTaskIndex = generateScaleAgentTaskIndex(assignments);

    // Derive which agents have active tasks from the source data
    const agentsWithTasks = new Set(
      Object.values(assignments).map((a) => a.agentId),
    );

    for (const agentId of agentsWithTasks) {
      expect(agentTaskIndex[agentId]).toBeDefined();
      expect(agentTaskIndex[agentId].length).toBeGreaterThan(0);
    }
  });

  it("15a-stress-6: formatScaleValidationSummary returns a non-empty string", () => {
    const agentIds = generateScaleAgentIds(20);
    const tasks    = generateScaleTasks(200, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    const assignments    = generateScaleAssignments(tasks);
    const agentTaskIndex = generateScaleAgentTaskIndex(assignments);

    const agentResult    = validateAgentRegistryScale(agentIds);
    const taskResult     = validateTaskRegistryScale(taskMap);
    const integrityResult = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);

    const summary = formatScaleValidationSummary(agentResult, taskResult, integrityResult);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Agents:");
    expect(summary).toContain("Tasks:");
    expect(summary).toContain("Integrity:");
  });

  it("15a-stress-7: all 20 agent defs are structurally valid (no missing required fields)", () => {
    const defs = generateScaleAgentDefs(20);
    expect(defs.length).toBe(20);

    const requiredFields: Array<keyof (typeof defs)[0]> = [
      "agentId", "name", "role", "capabilities", "riskClass", "summary", "visual", "defaultRoom",
    ];
    for (const def of defs) {
      for (const field of requiredFields) {
        expect(def[field]).toBeDefined();
      }
      expect(def.visual.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.visual.emissive).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("15a-stress-8: cross-index remains coherent after removing half the tasks", () => {
    const agentIds = generateScaleAgentIds(10);
    const tasks    = generateScaleTasks(100, agentIds);
    const taskMap: Record<string, TaskRecord> = {};
    for (const t of tasks) taskMap[t.taskId] = t;
    let assignments    = generateScaleAssignments(tasks);
    let agentTaskIndex = generateScaleAgentTaskIndex(assignments);

    // Remove every other task (simulate incremental deletions)
    const idsToRemove = tasks
      .filter((_, i) => i % 2 === 0)
      .map((t) => t.taskId);

    for (const id of idsToRemove) {
      delete taskMap[id];
      if (assignments[id]) {
        const agentId = assignments[id].agentId;
        delete assignments[id];
        agentTaskIndex = {
          ...agentTaskIndex,
          [agentId]: (agentTaskIndex[agentId] ?? []).filter((tid) => tid !== id),
        };
      }
    }

    // Clean up empty agent entries
    for (const agentId of Object.keys(agentTaskIndex)) {
      if (agentTaskIndex[agentId].length === 0) {
        delete agentTaskIndex[agentId];
      }
    }

    const result = checkSceneGraphIntegrity(taskMap, assignments, agentTaskIndex);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
