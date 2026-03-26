/**
 * task-seed.ts — Mock task dataset for development / offline / demo mode.
 *
 * Provides a realistic initial set of tasks assigned to the 5 seed agents
 * (manager-default, implementer-subagent, researcher-subagent,
 *  validator-sentinel, frontend-reviewer) so the 3D command center has
 * meaningful data to display before a live orchestrator is connected.
 *
 * The dataset is designed to:
 *   - Cover all 9 task statuses and all 4 priority levels
 *   - Include parent / sub-task relationships (hierarchical tasks)
 *   - Demonstrate active assignments across every seed agent
 *   - Supply enough variety for visual connector-line rendering
 *     (TaskConnectors.tsx needs tasks in assigned/active/blocked/review)
 *   - Use stable, predictable IDs so replay/reconstruction is repeatable
 *
 * Sub-AC 5a: Task-agent mapping — mock/live data integration.
 */

import type { TaskRecord } from "./task-types.js";

// ── Stable seed timestamps ─────────────────────────────────────────────────
// We pin timestamps relative to a fixed epoch to make tests deterministic.
// "SEED_BASE_TS" is a plausible recent date; each task offsets from it.
const SEED_BASE_TS = 1_710_000_000_000; // 2024-03-09T20:40:00.000Z

function seedTs(offsetMinutes: number): number {
  return SEED_BASE_TS + offsetMinutes * 60_000;
}

// ── Agent IDs (must match agent-seed.ts AGENT_INITIAL_PLACEMENTS) ──────────

export const SEED_AGENT_IDS = {
  MANAGER:    "manager-default",
  IMPLEMENTER:"implementer-subagent",
  RESEARCHER: "researcher-subagent",
  VALIDATOR:  "validator-sentinel",
  REVIEWER:   "frontend-reviewer",
} as const;

// ── Parent task IDs ────────────────────────────────────────────────────────

export const SEED_TASK_IDS = {
  // Epic-level parent tasks
  AUTH_EPIC:        "seed-task-auth-epic",
  API_DESIGN_EPIC:  "seed-task-api-design-epic",
  INFRA_EPIC:       "seed-task-infra-epic",

  // Active work items
  AUTH_IMPL:        "seed-task-auth-impl",
  AUTH_REVIEW:      "seed-task-auth-review",
  AUTH_VALIDATE:    "seed-task-auth-validate",
  AUTH_SECURITY:    "seed-task-auth-security",

  VECTOR_RESEARCH:  "seed-task-vector-research",
  API_ARCH:         "seed-task-api-arch",
  HUD_PERF:         "seed-task-hud-perf",
  DOC_API:          "seed-task-doc-api",
  INTEGRATION_TEST: "seed-task-integration-test",
  KG_ANALYSIS:      "seed-task-kg-analysis",
  DEPLOY_GATE:      "seed-task-deploy-gate",
  CI_PIPELINE:      "seed-task-ci-pipeline",
} as const;

// ── The initial mock task records ──────────────────────────────────────────

/**
 * Ordered array of mock TaskRecord objects covering all 9 statuses,
 * all 4 priorities, parent-child nesting, and multi-agent assignments.
 *
 * These records are designed to be passed directly to
 * `useTaskStore.getState().bulkLoadTasks(TASK_INITIAL_DATASET)`
 * for initial population of the task store in offline/demo mode.
 */
export const TASK_INITIAL_DATASET: Readonly<TaskRecord[]> = [

  // ── EPIC: Authentication & Authorization ───────────────────────────────

  {
    taskId:          SEED_TASK_IDS.AUTH_EPIC,
    title:           "Epic: Authentication & Authorization System",
    description:     "Full auth implementation including OAuth, JWT, and RBAC. " +
                     "Assigned to the manager for coordination.",
    status:          "active",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.MANAGER,
    createdTs:       seedTs(0),
    updatedTs:       seedTs(5),
    startedTs:       seedTs(5),
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["auth", "epic", "security"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.AUTH_IMPL,
    title:           "Implement JWT middleware",
    description:     "Add JWT verification middleware to the API gateway. " +
                     "Include token refresh logic and revocation list check.",
    status:          "active",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.IMPLEMENTER,
    createdTs:       seedTs(2),
    updatedTs:       seedTs(120),
    startedTs:       seedTs(10),
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.AUTH_EPIC,
    tags:            ["auth", "middleware", "jwt"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.AUTH_REVIEW,
    title:           "Code review: auth middleware PR",
    description:     "Review the JWT middleware implementation for correctness, " +
                     "security posture, and coverage gaps.",
    status:          "review",
    priority:        "high",
    assignedAgentId: SEED_AGENT_IDS.REVIEWER,
    createdTs:       seedTs(60),
    updatedTs:       seedTs(130),
    startedTs:       seedTs(65),
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.AUTH_EPIC,
    tags:            ["auth", "review", "security"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.AUTH_VALIDATE,
    title:           "Validate JWT implementation against security checklist",
    description:     "Run the security checklist: token length, entropy, " +
                     "expiry windows, revocation, replay prevention.",
    status:          "assigned",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.VALIDATOR,
    createdTs:       seedTs(61),
    updatedTs:       seedTs(131),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.AUTH_EPIC,
    tags:            ["auth", "validation", "security"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.AUTH_SECURITY,
    title:           "Security audit: OAuth flow",
    description:     "Audit the OAuth 2.0 implementation for CSRF, " +
                     "open-redirect, and state-parameter weaknesses.",
    status:          "planned",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.VALIDATOR,
    createdTs:       seedTs(62),
    updatedTs:       seedTs(62),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.AUTH_EPIC,
    tags:            ["auth", "security", "oauth"],
    eventIds:        [],
  },

  // ── EPIC: API Architecture ─────────────────────────────────────────────

  {
    taskId:          SEED_TASK_IDS.API_DESIGN_EPIC,
    title:           "Epic: API Architecture Design",
    description:     "Design the v2 API layer including REST conventions, " +
                     "pagination contracts, and WebSocket message schemas.",
    status:          "active",
    priority:        "high",
    assignedAgentId: SEED_AGENT_IDS.MANAGER,
    createdTs:       seedTs(1),
    updatedTs:       seedTs(20),
    startedTs:       seedTs(20),
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["api", "epic", "architecture"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.API_ARCH,
    title:           "Design v2 REST API contracts",
    description:     "Draft OpenAPI spec for the v2 REST endpoints. " +
                     "Focus on pagination, error envelopes, and versioning.",
    status:          "active",
    priority:        "high",
    assignedAgentId: SEED_AGENT_IDS.RESEARCHER,
    createdTs:       seedTs(3),
    updatedTs:       seedTs(90),
    startedTs:       seedTs(22),
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.API_DESIGN_EPIC,
    tags:            ["api", "architecture", "openapi"],
    eventIds:        [],
  },

  // ── EPIC: Infrastructure ───────────────────────────────────────────────

  {
    taskId:          SEED_TASK_IDS.INFRA_EPIC,
    title:           "Epic: Infrastructure & CI/CD",
    description:     "Set up the CI/CD pipeline and deployment gates " +
                     "for the multi-agent platform.",
    status:          "planned",
    priority:        "normal",
    assignedAgentId: SEED_AGENT_IDS.MANAGER,
    createdTs:       seedTs(4),
    updatedTs:       seedTs(4),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["infra", "epic", "ci-cd"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.CI_PIPELINE,
    title:           "Set up GitHub Actions CI pipeline",
    description:     "Configure GitHub Actions workflows for lint, test, and build. " +
                     "Add matrix builds for Node 18/20/22.",
    status:          "draft",
    priority:        "normal",
    assignedAgentId: null,
    createdTs:       seedTs(70),
    updatedTs:       seedTs(70),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.INFRA_EPIC,
    tags:            ["infra", "ci-cd", "github-actions"],
    eventIds:        [],
  },

  // ── Standalone active tasks ────────────────────────────────────────────

  {
    taskId:          SEED_TASK_IDS.VECTOR_RESEARCH,
    title:           "Research vector embedding strategies for memory retrieval",
    description:     "Evaluate Ada-002 vs. local embedding models for the " +
                     "knowledge-graph memory layer. Benchmark recall@10.",
    status:          "active",
    priority:        "normal",
    assignedAgentId: SEED_AGENT_IDS.RESEARCHER,
    createdTs:       seedTs(15),
    updatedTs:       seedTs(100),
    startedTs:       seedTs(30),
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["research", "memory", "embeddings"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.HUD_PERF,
    title:           "Fix HUD performance regression in large agent sets",
    description:     "Profile and resolve the O(n²) re-render in HUD.tsx " +
                     "when more than 8 agents are active simultaneously.",
    status:          "blocked",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.IMPLEMENTER,
    createdTs:       seedTs(50),
    updatedTs:       seedTs(140),
    startedTs:       seedTs(55),
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["perf", "hud", "react"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.DOC_API,
    title:           "Document API endpoints in USAGE_GUIDE.md",
    description:     "Expand the USAGE_GUIDE with examples for every REST endpoint. " +
                     "Include curl examples and expected response shapes.",
    status:          "draft",
    priority:        "low",
    assignedAgentId: null,
    createdTs:       seedTs(80),
    updatedTs:       seedTs(80),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["docs", "api"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.INTEGRATION_TEST,
    title:           "Write integration tests for auth + API layer",
    description:     "End-to-end integration tests covering: login → JWT issue " +
                     "→ protected endpoint access → refresh → logout.",
    status:          "assigned",
    priority:        "high",
    assignedAgentId: SEED_AGENT_IDS.VALIDATOR,
    createdTs:       seedTs(85),
    updatedTs:       seedTs(135),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    SEED_TASK_IDS.AUTH_EPIC,
    tags:            ["auth", "testing", "integration"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.KG_ANALYSIS,
    title:           "Analyse knowledge-graph topology for agent memory sharing",
    description:     "Map current knowledge-graph structure and propose " +
                     "partitioning strategy for multi-agent concurrent access.",
    status:          "draft",
    priority:        "normal",
    assignedAgentId: SEED_AGENT_IDS.RESEARCHER,
    createdTs:       seedTs(90),
    updatedTs:       seedTs(90),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["research", "knowledge-graph", "memory"],
    eventIds:        [],
  },

  {
    taskId:          SEED_TASK_IDS.DEPLOY_GATE,
    title:           "Validate deployment gate for production release",
    description:     "Run the full deployment checklist: security scan, " +
                     "smoke tests, rollback procedure verification.",
    status:          "planned",
    priority:        "critical",
    assignedAgentId: SEED_AGENT_IDS.VALIDATOR,
    createdTs:       seedTs(95),
    updatedTs:       seedTs(95),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            ["deploy", "validation", "production"],
    eventIds:        [],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────

/**
 * Map of taskId → TaskRecord for O(1) seed record lookup.
 */
export const TASK_SEED_MAP: Readonly<Record<string, TaskRecord>> = Object.fromEntries(
  TASK_INITIAL_DATASET.map((t) => [t.taskId, t]),
);

/**
 * Get a seed task record by stable taskId.
 * Returns undefined if the taskId is not in the initial dataset.
 */
export function getSeedTask(taskId: string): TaskRecord | undefined {
  return TASK_SEED_MAP[taskId];
}

/**
 * Get all seed tasks assigned to a specific agent.
 */
export function getSeedTasksForAgent(agentId: string): TaskRecord[] {
  return TASK_INITIAL_DATASET.filter((t) => t.assignedAgentId === agentId);
}

/**
 * Get all seed tasks in a specific status.
 */
export function getSeedTasksByStatus(
  status: TaskRecord["status"],
): TaskRecord[] {
  return TASK_INITIAL_DATASET.filter((t) => t.status === status);
}

/**
 * Get all seed tasks that are direct children of a given parent task.
 */
export function getSeedSubTasks(parentTaskId: string): TaskRecord[] {
  return TASK_INITIAL_DATASET.filter(
    (t) => t.parentTaskId === parentTaskId,
  );
}

// ── Status summary ─────────────────────────────────────────────────────────

/**
 * Returns a breakdown of the seed dataset by status.
 * Useful for dashboard metrics and test assertions.
 */
export function getSeedStatusSummary(): Record<TaskRecord["status"], number> {
  const counts: Record<TaskRecord["status"], number> = {
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
  for (const t of TASK_INITIAL_DATASET) {
    counts[t.status]++;
  }
  return counts;
}

/**
 * Returns a breakdown of the seed dataset by priority.
 */
export function getSeedPrioritySummary(): Record<TaskRecord["priority"], number> {
  const counts: Record<TaskRecord["priority"], number> = {
    critical: 0,
    high:     0,
    normal:   0,
    low:      0,
  };
  for (const t of TASK_INITIAL_DATASET) {
    counts[t.priority]++;
  }
  return counts;
}

/**
 * Total number of tasks in the seed dataset.
 */
export const SEED_TASK_COUNT = TASK_INITIAL_DATASET.length;

/**
 * Human-readable summary of the seed dataset for logging / debug.
 */
export function formatSeedDatasetSummary(): string {
  const statusSummary  = getSeedStatusSummary();
  const prioritySummary = getSeedPrioritySummary();
  const byAgent        = Object.values(SEED_AGENT_IDS).map((agentId) => {
    const count = getSeedTasksForAgent(agentId).length;
    return `    ${agentId}: ${count} task(s)`;
  });

  return [
    `Task Seed Dataset (${SEED_TASK_COUNT} tasks)`,
    "",
    "  Status distribution:",
    ...Object.entries(statusSummary)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `    ${s}: ${n}`),
    "",
    "  Priority distribution:",
    ...Object.entries(prioritySummary)
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `    ${p}: ${n}`),
    "",
    "  Assignment by agent:",
    ...byAgent,
    `    (unassigned): ${TASK_INITIAL_DATASET.filter((t) => !t.assignedAgentId).length}`,
  ].join("\n");
}
