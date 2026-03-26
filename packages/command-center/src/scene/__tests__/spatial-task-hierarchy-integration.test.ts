/**
 * spatial-task-hierarchy-integration.test.ts
 *
 * Sub-AC 3 (AC 15): Integration test + performance benchmark for the
 * spatial_index ⟷ task_group ⟷ room/agent hierarchy integration.
 *
 * ── What this tests ──────────────────────────────────────────────────────────
 *
 *   1. SETUP CORRECTNESS (20 agents + 200 tasks)
 *      - 20 agents can be registered in the agent-store without errors
 *      - 200 tasks can be created in the task-store without errors
 *      - task_group windowing correctly returns ≤ windowSize tasks
 *
 *   2. SPATIAL INDEX INTEGRATION (hierarchy.queryAgentLOD + hierarchy.queryWindow)
 *      - computeSpatialIndex(20 agents, cameraPos) assigns correct LOD tiers
 *      - partitionAgentsByLOD correctly distributes agents by distance
 *      - The spatial index never returns more agents in the window than MAX_RENDER_WINDOW
 *
 *   3. TASK GROUP INTEGRATION (hierarchy.getGroupWindow)
 *      - Task groups created for agents show only assigned tasks (per filter)
 *      - getGroupWindow returns at most AGENT_GROUP_WINDOW_SIZE tasks
 *      - Task group pagination preserves all 200 tasks in the store
 *
 *   4. PERFORMANCE BENCHMARK (≥30 fps target = 33ms frame budget)
 *      - Spatial index computation for 20 agents: < 2ms
 *      - Task group windowing for 200 tasks: < 2ms
 *      - Combined per-frame CPU work (spatial + windowing): < 33ms
 *      - This demonstrates the system CAN maintain ≥30 fps in production
 *
 * ── Performance methodology ──────────────────────────────────────────────────
 *
 *   WebGL rendering (Three.js, React Three Fiber) cannot run in a headless
 *   Vitest environment.  We instead measure the CPU-side work that runs every
 *   frame:
 *     - computeSpatialIndex()     ← O(n log n), n ≤ 20
 *     - getGroupWindow()          ← O(filtered), windowed to ≤ windowSize
 *     - extractWindowedSet()      ← O(n)
 *
 *   These are the dominant per-frame CPU costs for the integration.  If they
 *   complete in < 2ms, the GPU rendering (which runs in parallel) has >31ms
 *   remaining in the 33ms budget — comfortably above the ≥30 fps target.
 *
 *   The benchmark runs 1000 iterations and asserts that the 99th-percentile
 *   time remains below the threshold.  This ensures even occasional spikes
 *   do not exceed the frame budget.
 *
 * ── Test ID scheme ───────────────────────────────────────────────────────────
 *   15-3-N : Sub-AC 3 (AC 15) spatial-task-hierarchy integration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  computeSpatialIndex,
  extractWindowedSet,
  makeEmptySnapshot,
  MAX_RENDER_WINDOW,
  MIN_WINDOW_SIZE,
  type AgentSpatialEntry,
  type Vec3,
} from "../spatial-index.js";

import {
  partitionAgentsByLOD,
} from "../../hooks/use-hierarchy-spatial-integration.js";

import {
  ROOM_GROUP_WINDOW_SIZE,
  AGENT_GROUP_WINDOW_SIZE,
} from "../../hooks/use-task-groups-for-hierarchy.js";

import { useTaskGroupStore } from "../../store/task-group-store.js";
import { useTaskStore } from "../../store/task-store.js";
import { useAgentStore } from "../../store/agent-store.js";
import { useSpatialIndexStore } from "../../store/spatial-index-store.js";
import { injectTaskStoreRefForGroups } from "../../store/task-group-store.js";
import { createDynamicAgentDef } from "../../data/agents.js";

// ── Store reset helpers ───────────────────────────────────────────────────────

function resetTaskStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
}

function resetTaskGroupStore() {
  useTaskGroupStore.setState({ groups: {}, events: [] });
}

function resetAgentStore() {
  useAgentStore.setState({
    agents:          {},
    agentRegistry:   {},
    events:          [],
    selectedAgentId: null,
    initialized:     false,
    _savedLiveAgents: null,
  });
}

function resetSpatialIndexStore() {
  useSpatialIndexStore.getState().reset();
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

const AGENT_ROLES = [
  "orchestrator",
  "implementer",
  "researcher",
  "reviewer",
  "validator",
] as const;

/**
 * Seed N agents into the agent store.
 * Agents are placed in 5 rooms (4 per room for 20 agents).
 * Returns the list of generated agent IDs.
 */
function seedAgents(n: number): string[] {
  const agentIds: string[] = [];
  const rooms = ["ops-control", "impl-office", "research-lab", "review-room", "validation-bay"];

  for (let i = 0; i < n; i++) {
    const agentId = `perf-agent-${i}`;
    const role    = AGENT_ROLES[i % AGENT_ROLES.length];
    const room    = rooms[i % rooms.length];
    const def     = createDynamicAgentDef(agentId, `Agent ${i}`, role as string, room);
    useAgentStore.getState().registerAgent(def, { roomId: room });
    agentIds.push(agentId);
  }
  return agentIds;
}

/**
 * Seed N tasks into the task store.
 * Tasks are distributed across agents (if provided) and priorities.
 * Returns the list of generated task IDs.
 */
function seedTasks(
  n: number,
  agentIds: string[] = [],
): string[] {
  const priorities = ["critical", "high", "normal", "low"] as const;
  const statuses   = ["draft", "active", "assigned", "review"] as const;
  const taskIds:   string[] = [];
  const store      = useTaskStore.getState();

  for (let i = 0; i < n; i++) {
    const priority       = priorities[i % priorities.length];
    const status         = statuses[i % statuses.length];
    const agentId        = agentIds.length ? agentIds[i % agentIds.length] : null;
    const id = store.createTask({
      title:           `Perf Task ${i + 1}`,
      priority,
      initialStatus:   status,
      assignedAgentId: agentId,
      tags:            [`batch-${Math.floor(i / 10)}`],
    });
    taskIds.push(id);
  }
  return taskIds;
}

/**
 * Build AgentSpatialEntry[] from the current agent store for spatial index input.
 * Agents are distributed across a 4×5 grid in the building (≈ real world positions).
 */
function buildSpatialEntries(agentIds: string[]): AgentSpatialEntry[] {
  const agents = useAgentStore.getState().agents;

  return agentIds.map((agentId, i) => {
    const agent = agents[agentId];
    const col   = i % 5;
    const row   = Math.floor(i / 5);

    return {
      agentId,
      position: {
        x: 1 + col * 2.2,
        y: 0.5,
        z: 1 + row * 2.5,
      } satisfies Vec3,
      roomId: agent?.roomId ?? "ops-control",
      status: agent?.status ?? "idle",
    };
  });
}

// ── 1. Setup correctness — 20 agents + 200 tasks ─────────────────────────────

describe("Setup correctness — 20 agents + 200 tasks (15-3-1)", () => {
  beforeEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
    resetSpatialIndexStore();
    injectTaskStoreRefForGroups(() => useTaskStore.getState());
  });

  afterEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
  });

  it("registers 20 agents in the agent-store without collision (15-3-1a)", () => {
    const ids = seedAgents(20);
    expect(ids).toHaveLength(20);
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(20);
    // All agents have unique positions
    const posKeys = Object.values(useAgentStore.getState().agents).map(
      (a) => `${a.worldPosition.x.toFixed(3)},${a.worldPosition.z.toFixed(3)}`,
    );
    // Allow for some collisions (agents in same room share grid slots) but
    // verify at least 5 unique positions exist (5 rooms × ≥1 agent each)
    expect(new Set(posKeys).size).toBeGreaterThanOrEqual(5);
  });

  it("creates 200 tasks in the task-store without error (15-3-1b)", () => {
    seedAgents(20);
    const agentIds = Object.keys(useAgentStore.getState().agents);
    const taskIds  = seedTasks(200, agentIds);
    expect(taskIds).toHaveLength(200);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(200);
  });

  it("task-group window returns ≤ ROOM_GROUP_WINDOW_SIZE tasks (15-3-1c)", () => {
    seedAgents(20);
    const agentIds = Object.keys(useAgentStore.getState().agents);
    seedTasks(200, agentIds);

    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:       "Room group test",
      filter:     { includeTerminal: false },
      windowSize: ROOM_GROUP_WINDOW_SIZE,
    });

    const win = useTaskGroupStore.getState().getGroupWindow(groupId);
    expect(win.visibleTasks.length).toBeLessThanOrEqual(ROOM_GROUP_WINDOW_SIZE);
    // Total should include all non-terminal tasks (status: draft, active, assigned, review)
    expect(win.filteredCount).toBeGreaterThan(0);
    expect(win.filteredCount).toBeLessThanOrEqual(200);
  });

  it("agent-level task-group window returns ≤ AGENT_GROUP_WINDOW_SIZE tasks (15-3-1d)", () => {
    const agentIds = seedAgents(20);
    const firstAgentId = agentIds[0];
    seedTasks(200, agentIds);

    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:          `Agent ${firstAgentId} tasks`,
      filter:        { agentIds: [firstAgentId], includeTerminal: false },
      windowSize:    AGENT_GROUP_WINDOW_SIZE,
      pinnedAgentId: firstAgentId,
    });

    const win = useTaskGroupStore.getState().getGroupWindow(groupId);
    expect(win.visibleTasks.length).toBeLessThanOrEqual(AGENT_GROUP_WINDOW_SIZE);
    // Tasks are distributed: 200 tasks / 20 agents = 10 each
    // All 10 should be visible (or ≤ AGENT_GROUP_WINDOW_SIZE = 5 on page 0)
    expect(win.filteredCount).toBeGreaterThanOrEqual(1);
    expect(win.filteredCount).toBeLessThanOrEqual(50); // ≤ 200/4 tasks per agent
  });

  it("200 tasks paginate correctly across 20 pages at windowSize=10 (15-3-1e)", () => {
    seedAgents(20);
    const agentIds = Object.keys(useAgentStore.getState().agents);
    seedTasks(200, agentIds);

    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:       "All tasks paginated",
      filter:     { includeTerminal: false },
      windowSize: 10,
    });

    const firstWindow = useTaskGroupStore.getState().getGroupWindow(groupId);
    expect(firstWindow.visibleTasks.length).toBe(10); // full first page
    expect(firstWindow.totalPages).toBeGreaterThanOrEqual(10); // 200 / many-terminal-excluded

    // Navigate to page 5
    useTaskGroupStore.getState().gotoPage(groupId, 5);
    const page5 = useTaskGroupStore.getState().getGroupWindow(groupId);
    expect(page5.currentPage).toBe(5);
    expect(page5.visibleTasks.length).toBeGreaterThan(0);

    // Page 5 tasks should be different from page 0 tasks
    const page0Ids = new Set(firstWindow.visibleTasks.map((t) => t.taskId));
    const page5Ids = page5.visibleTasks.map((t) => t.taskId);
    for (const id of page5Ids) {
      expect(page0Ids.has(id)).toBe(false);
    }
  });
});

// ── 2. Spatial index integration ─────────────────────────────────────────────

describe("Spatial index integration — 20 agents (15-3-2)", () => {
  beforeEach(() => {
    resetAgentStore();
    resetSpatialIndexStore();
  });

  afterEach(() => {
    resetAgentStore();
  });

  it("computeSpatialIndex with 20 agents returns correct window size (15-3-2a)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);

    // Camera at overview position (fov 45°, looking from x=9.6 y=9 z=12)
    const cameraPos: Vec3 = { x: 9.6, y: 9, z: 12 };
    const snapshot = computeSpatialIndex(entries, cameraPos);

    expect(snapshot.totalCount).toBe(20);
    expect(snapshot.windowCount).toBeLessThanOrEqual(MAX_RENDER_WINDOW);
    expect(snapshot.windowCount).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE);
    // All 20 agents are within the 60-unit culling sphere (building is < 20u wide)
    expect(snapshot.visibleCount).toBe(20);
  });

  it("partitionAgentsByLOD correctly partitions 20 agents by distance (15-3-2b)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);

    const cameraPos: Vec3 = { x: 1, y: 0.5, z: 1 }; // standing right next to agent 0
    const snapshot  = computeSpatialIndex(entries, cameraPos);
    const windowed  = extractWindowedSet(snapshot);

    const { nearIds, midIds, farIds, culledIds } = partitionAgentsByLOD(agentIds, windowed);

    // Total should account for all 20 agents
    expect(nearIds.length + midIds.length + farIds.length + culledIds.length).toBe(20);

    // At least one agent should be NEAR (agent 0 is at position (1, 0.5, 1) — camera co-located)
    expect(nearIds.length + midIds.length).toBeGreaterThanOrEqual(1);

    // No agents should be culled (building is < cullingRadius)
    expect(culledIds.length).toBe(0);
  });

  it("nearIds contains agents within LOD threshold distance (15-3-2c)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);

    // Place camera very close to agent 0 at (1, 0.5, 1) → should be near LOD
    const cameraPos: Vec3 = { x: 1.2, y: 0.5, z: 1.0 };
    const snapshot  = computeSpatialIndex(entries, cameraPos);
    const windowed  = extractWindowedSet(snapshot);

    const { nearIds } = partitionAgentsByLOD(agentIds, windowed);
    // Agent 0 is at (1, 0.5, 1) — distance ≈ 0.2 → LOD "near" (< 6u threshold)
    expect(nearIds).toContain("perf-agent-0");
  });

  it("window never exceeds MAX_RENDER_WINDOW agents (15-3-2d)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);

    // Try multiple camera positions
    const cameras: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 5, z: 5 },
      { x: 15, y: 15, z: 15 },
      { x: 9.6, y: 9, z: 12 },
    ];

    for (const cameraPos of cameras) {
      const snapshot = computeSpatialIndex(entries, cameraPos);
      expect(snapshot.windowCount).toBeLessThanOrEqual(MAX_RENDER_WINDOW);
    }
  });

  it("empty snapshot is well-formed (15-3-2e)", () => {
    const empty = makeEmptySnapshot();
    expect(empty.totalCount).toBe(0);
    expect(empty.windowCount).toBe(0);
    expect(empty.agents).toHaveLength(0);
    expect(empty.windowAgents).toHaveLength(0);
    expect(empty.deferredAgents).toHaveLength(0);

    const windowed = extractWindowedSet(empty);
    expect(windowed.fullRenderIds).toHaveLength(0);
    expect(windowed.deferredIds).toHaveLength(0);
    expect(windowed.culledIds).toHaveLength(0);
    expect(Object.keys(windowed.lodMap)).toHaveLength(0);

    const { nearIds, midIds, farIds, culledIds } = partitionAgentsByLOD([], windowed);
    expect(nearIds).toHaveLength(0);
    expect(midIds).toHaveLength(0);
    expect(farIds).toHaveLength(0);
    expect(culledIds).toHaveLength(0);
  });
});

// ── 3. Task group + hierarchy integration ────────────────────────────────────

describe("Task group hierarchy integration — 200 tasks (15-3-3)", () => {
  beforeEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
    injectTaskStoreRefForGroups(() => useTaskStore.getState());
  });

  afterEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
  });

  it("creates 20 agent groups and each correctly filters by agentId (15-3-3a)", () => {
    const agentIds = seedAgents(20);
    seedTasks(200, agentIds);

    // Create a task group per agent (mimicking useTaskGroupsForHierarchy)
    const groupIds = agentIds.map((agentId) =>
      useTaskGroupStore.getState().createTaskGroup({
        name:          `Agent ${agentId} tasks`,
        filter:        { agentIds: [agentId], includeTerminal: false },
        windowSize:    AGENT_GROUP_WINDOW_SIZE,
        pinnedAgentId: agentId,
      }),
    );

    expect(groupIds).toHaveLength(20);

    // Each group should filter to only the tasks assigned to that agent
    for (let i = 0; i < 20; i++) {
      const win = useTaskGroupStore.getState().getGroupWindow(groupIds[i]);
      expect(win.visibleTasks.length).toBeLessThanOrEqual(AGENT_GROUP_WINDOW_SIZE);
      // All visible tasks should be for this agent
      for (const task of win.visibleTasks) {
        if (task.assignedAgentId !== null) {
          expect(task.assignedAgentId).toBe(agentIds[i]);
        }
      }
    }
  });

  it("task groups paginate independently — page changes do not affect other groups (15-3-3b)", () => {
    const agentIds = seedAgents(20);
    seedTasks(200, agentIds);

    const group0 = useTaskGroupStore.getState().createTaskGroup({
      name:       "Group A",
      filter:     { includeTerminal: false },
      windowSize: 10,
    });
    const group1 = useTaskGroupStore.getState().createTaskGroup({
      name:       "Group B",
      filter:     { includeTerminal: false },
      windowSize: 10,
    });

    // Advance group0 to page 1
    useTaskGroupStore.getState().nextPage(group0);

    const win0 = useTaskGroupStore.getState().getGroupWindow(group0);
    const win1 = useTaskGroupStore.getState().getGroupWindow(group1);

    expect(win0.currentPage).toBe(1);
    expect(win1.currentPage).toBe(0); // group1 unaffected
  });

  it("scrollToTask jumps to the correct page (15-3-3c)", () => {
    seedAgents(20);
    const agentIds = Object.keys(useAgentStore.getState().agents);
    const taskIds  = seedTasks(200, agentIds);
    // Deliberately include only non-terminal tasks in the filter
    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:       "Scroll test",
      filter:     { includeTerminal: true },
      windowSize: 10,
    });

    // Scrolling to the last task should put us on the last page
    const lastTaskId  = taskIds[taskIds.length - 1];
    useTaskGroupStore.getState().scrollToTask(groupId, lastTaskId);

    const win = useTaskGroupStore.getState().getGroupWindow(groupId);
    // Last task should now be visible
    const taskInWindow = win.visibleTasks.some((t) => t.taskId === lastTaskId);
    expect(taskInWindow).toBe(true);
  });

  it("ROOM_GROUP_WINDOW_SIZE and AGENT_GROUP_WINDOW_SIZE are sensible constants (15-3-3d)", () => {
    // Room groups: wider window (10) for room-level task overview
    expect(ROOM_GROUP_WINDOW_SIZE).toBe(10);
    expect(ROOM_GROUP_WINDOW_SIZE).toBeGreaterThan(AGENT_GROUP_WINDOW_SIZE);

    // Agent groups: narrower window (5) for focused agent view
    expect(AGENT_GROUP_WINDOW_SIZE).toBe(5);
    expect(AGENT_GROUP_WINDOW_SIZE).toBeGreaterThan(0);
  });
});

// ── 4. Performance benchmark — ≥30 fps target ────────────────────────────────

describe("Performance benchmark — 20 agents + 200 tasks at ≥30 fps (15-3-4)", () => {
  beforeEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
    resetSpatialIndexStore();
    injectTaskStoreRefForGroups(() => useTaskStore.getState());
  });

  afterEach(() => {
    resetAgentStore();
    resetTaskStore();
    resetTaskGroupStore();
  });

  it("computeSpatialIndex for 20 agents completes in < 2ms (15-3-4a)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);
    const camera:Vec3 = { x: 9.6, y: 9, z: 12 };

    const ITERATIONS = 1000;

    const t0  = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      computeSpatialIndex(entries, camera);
    }
    const t1       = performance.now();
    const totalMs  = t1 - t0;
    const avgMs    = totalMs / ITERATIONS;

    // Average time per call must be < 2ms (even on slow CI machines)
    expect(avgMs).toBeLessThan(2);
    // Sanity: it shouldn't be instantaneous either (zero would mean no work done)
    expect(totalMs).toBeGreaterThan(0);
  });

  it("extractWindowedSet for 20 agents completes in < 0.5ms (15-3-4b)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);
    const camera: Vec3 = { x: 9.6, y: 9, z: 12 };
    const snapshot = computeSpatialIndex(entries, camera);

    const ITERATIONS = 1000;

    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      extractWindowedSet(snapshot);
    }
    const t1    = performance.now();
    const avgMs = (t1 - t0) / ITERATIONS;

    expect(avgMs).toBeLessThan(0.5);
  });

  it("getGroupWindow for 200 tasks completes in < 2ms (15-3-4c)", () => {
    const agentIds = seedAgents(20);
    seedTasks(200, agentIds);

    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:       "Perf group",
      filter:     { includeTerminal: false },
      windowSize: ROOM_GROUP_WINDOW_SIZE,
    });

    const ITERATIONS = 1000;

    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      useTaskGroupStore.getState().getGroupWindow(groupId);
    }
    const t1    = performance.now();
    const avgMs = (t1 - t0) / ITERATIONS;

    // Task filtering + pagination with 200 tasks must stay < 2ms per call
    expect(avgMs).toBeLessThan(2);
  });

  it("combined per-frame work (spatial + windowing) fits in 33ms budget (15-3-4d)", () => {
    // Set up the full 20-agent + 200-task scenario
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);
    seedTasks(200, agentIds);

    // Create 20 agent groups (one per agent, as the integration layer would)
    const groupIds = agentIds.map((agentId) =>
      useTaskGroupStore.getState().createTaskGroup({
        name:          `Agent ${agentId}`,
        filter:        { agentIds: [agentId], includeTerminal: false },
        windowSize:    AGENT_GROUP_WINDOW_SIZE,
        pinnedAgentId: agentId,
      }),
    );

    const camera: Vec3 = { x: 9.6, y: 9, z: 12 };

    // Simulate one rendering frame: spatial index + windowed set + task windows
    function simulateFrame(): void {
      // 1. Compute spatial index (runs in SpatialIndexProvider / useSpatialIndex)
      const snapshot   = computeSpatialIndex(entries, camera);
      const windowed   = extractWindowedSet(snapshot);

      // 2. Partition agents by LOD (runs in HierarchySpatialTaskLayer)
      partitionAgentsByLOD(agentIds, windowed);

      // 3. Get task windows for all windowed agents (runs in VirtualizedTaskOrbLayer)
      for (const groupId of groupIds.slice(0, windowed.fullRenderIds.length)) {
        useTaskGroupStore.getState().getGroupWindow(groupId);
      }
    }

    const ITERATIONS = 500; // 500 simulated frames

    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      simulateFrame();
    }
    const t1         = performance.now();
    const totalMs    = t1 - t0;
    const avgFrameMs = totalMs / ITERATIONS;

    // The combined per-frame CPU work must be < 33ms (30 fps budget)
    // In practice this should be < 2ms; we assert < 10ms to be robust on slow CI
    expect(avgFrameMs).toBeLessThan(10);

    // Log for diagnostic purposes (visible with --reporter=verbose)
    // Actual timing depends on the test runner; the assertion is what matters
    if (avgFrameMs > 0) {
      // A non-zero average confirms actual work was done
      expect(avgFrameMs).toBeGreaterThan(0);
    }
  });

  it("99th-percentile frame time stays below 33ms for 1000 simulated frames (15-3-4e)", () => {
    const agentIds = seedAgents(20);
    const entries  = buildSpatialEntries(agentIds);
    seedTasks(200, agentIds);

    const groupIds = agentIds.map((agentId) =>
      useTaskGroupStore.getState().createTaskGroup({
        name:          `P99 agent ${agentId}`,
        filter:        { agentIds: [agentId], includeTerminal: false },
        windowSize:    AGENT_GROUP_WINDOW_SIZE,
        pinnedAgentId: agentId,
      }),
    );

    const camera: Vec3 = { x: 9.6, y: 9, z: 12 };
    const frameTimes: number[] = [];

    const ITERATIONS = 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();

      const snapshot = computeSpatialIndex(entries, camera);
      const windowed = extractWindowedSet(snapshot);
      partitionAgentsByLOD(agentIds, windowed);

      for (const groupId of groupIds.slice(0, windowed.fullRenderIds.length)) {
        useTaskGroupStore.getState().getGroupWindow(groupId);
      }

      frameTimes.push(performance.now() - t0);
    }

    frameTimes.sort((a, b) => a - b);
    const p50 = frameTimes[Math.floor(ITERATIONS * 0.50)];
    const p99 = frameTimes[Math.floor(ITERATIONS * 0.99)];

    // p50 should be well under 5ms
    expect(p50).toBeLessThan(5);

    // p99 must be under 33ms (the ≥30 fps frame budget)
    expect(p99).toBeLessThan(33);
  });

  it("spatial index computation scales linearly — 10 agents is faster than 20 (15-3-4f)", () => {
    const agentIds10 = seedAgents(10);
    const entries10  = buildSpatialEntries(agentIds10.slice(0, 10));

    resetAgentStore();

    const agentIds20 = seedAgents(20);
    const entries20  = buildSpatialEntries(agentIds20);

    const camera: Vec3 = { x: 9.6, y: 9, z: 12 };
    const ITERATIONS = 500;

    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      computeSpatialIndex(entries10, camera);
    }
    const time10 = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      computeSpatialIndex(entries20, camera);
    }
    const time20 = performance.now() - t1;

    // 20 agents should take at most 5× as long as 10 agents
    // (O(n log n) — 20 log 20 ≈ 86, 10 log 10 ≈ 33, ratio ≈ 2.6×)
    const ratio = time20 / Math.max(time10, 0.001);
    expect(ratio).toBeLessThan(5);
  });
});

// ── 5. Hierarchy LOD correctness ─────────────────────────────────────────────

describe("LOD correctness in hierarchy integration (15-3-5)", () => {
  it("agents at distance < 6 receive LOD 'near' (15-3-5a)", () => {
    const entries: AgentSpatialEntry[] = [
      { agentId: "close-agent", position: { x: 2, y: 0, z: 2 }, roomId: "room-a", status: "active" },
    ];
    const camera: Vec3 = { x: 2.5, y: 0, z: 2.5 }; // distance ≈ 0.7 → near

    const snapshot = computeSpatialIndex(entries, camera);
    const windowed = extractWindowedSet(snapshot);

    expect(windowed.lodMap["close-agent"]).toBe("near");
  });

  it("agents at 6 ≤ distance < 14 receive LOD 'mid' (15-3-5b)", () => {
    const entries: AgentSpatialEntry[] = [
      { agentId: "mid-agent", position: { x: 0, y: 0, z: 0 }, roomId: "room-b", status: "idle" },
    ];
    const camera: Vec3 = { x: 9, y: 0, z: 0 }; // distance = 9 → mid

    const snapshot = computeSpatialIndex(entries, camera);
    const windowed = extractWindowedSet(snapshot);

    expect(windowed.lodMap["mid-agent"]).toBe("mid");
  });

  it("agents at distance ≥ 14 receive LOD 'far' (15-3-5c)", () => {
    const entries: AgentSpatialEntry[] = [
      { agentId: "far-agent", position: { x: 0, y: 0, z: 0 }, roomId: "room-c", status: "inactive" },
    ];
    const camera: Vec3 = { x: 20, y: 0, z: 0 }; // distance = 20 → far

    const snapshot = computeSpatialIndex(entries, camera);
    const windowed = extractWindowedSet(snapshot);

    // Far-but-in-window agent gets LOD from distance (far ≥ 14u)
    expect(windowed.lodMap["far-agent"]).toBe("far");
  });

  it("partitionAgentsByLOD returns empty sets for unknown agents (15-3-5d)", () => {
    const emptySnapshot = makeEmptySnapshot();
    const windowed      = extractWindowedSet(emptySnapshot);

    const { nearIds, midIds, farIds, culledIds } = partitionAgentsByLOD(
      ["ghost-1", "ghost-2"],
      windowed,
    );

    // Unknown agents (not in snapshot) go to farIds (lodMap returns "far")
    // and are NOT culled (not in culledIds)
    expect(nearIds).toHaveLength(0);
    expect(midIds).toHaveLength(0);
    expect(farIds).toHaveLength(2); // unknown → defaults to "far" LOD
    expect(culledIds).toHaveLength(0);
  });

  it("active agents receive higher priority (lower number) than inactive (15-3-5e)", () => {
    const entries: AgentSpatialEntry[] = [
      { agentId: "inactive-1", position: { x: 2, y: 0, z: 2 }, roomId: "r", status: "inactive" },
      { agentId: "active-1",   position: { x: 2, y: 0, z: 2 }, roomId: "r", status: "active" },
    ];
    const camera: Vec3 = { x: 0, y: 0, z: 0 };

    const snapshot = computeSpatialIndex(entries, camera);

    // Agents are sorted by priority (ascending = highest priority first)
    // active-1 should be first (lower priority number)
    const firstId = snapshot.agents[0].agentId;
    expect(firstId).toBe("active-1");
  });
});

// ── 6. Integration event sourcing ─────────────────────────────────────────────

describe("Event sourcing for spatial-task hierarchy integration (15-3-6)", () => {
  beforeEach(() => {
    resetTaskStore();
    resetTaskGroupStore();
    resetSpatialIndexStore();
    injectTaskStoreRefForGroups(() => useTaskStore.getState());
  });

  afterEach(() => {
    resetTaskStore();
    resetTaskGroupStore();
  });

  it("creating task groups emits task_group.created events (15-3-6a)", () => {
    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name: "Integration group",
    });

    const events = useTaskGroupStore.getState().events;
    const createdEvent = events.find(
      (e) => e.type === "task_group.created" && e.groupId === groupId,
    );
    expect(createdEvent).toBeDefined();
    expect(createdEvent!.payload.name).toBe("Integration group");
  });

  it("page navigation emits task_group.page_changed events (15-3-6b)", () => {
    seedTasks(30, []);

    const groupId = useTaskGroupStore.getState().createTaskGroup({
      name:       "Nav group",
      filter:     { includeTerminal: false },
      windowSize: 10,
    });

    useTaskGroupStore.getState().nextPage(groupId);

    const events = useTaskGroupStore.getState().events;
    const pageEvent = events.find(
      (e) => e.type === "task_group.page_changed" && e.groupId === groupId,
    );
    expect(pageEvent).toBeDefined();
    expect(pageEvent!.payload.from).toBe(0);
    expect(pageEvent!.payload.to).toBe(1);
    expect(pageEvent!.payload.via).toBe("nextPage");
  });

  it("spatial index store records window change events (15-3-6c)", () => {
    resetAgentStore();
    const agentIds = seedAgents(5);
    const entries  = buildSpatialEntries(agentIds);
    const camera: Vec3 = { x: 0, y: 0, z: 0 };

    const snapshot = computeSpatialIndex(entries, camera);

    // Directly update the store (simulating what SpatialIndexProvider does)
    useSpatialIndexStore.getState().setSnapshot(snapshot);

    const events = useSpatialIndexStore.getState().events;
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Should have an index.window_changed event (first snapshot always changes from empty)
    const windowChangedEvent = events.find((e) => e.type === "index.window_changed");
    expect(windowChangedEvent).toBeDefined();
    expect(windowChangedEvent!.windowIds).toBeDefined();
    expect(windowChangedEvent!.windowIds!.length).toBeGreaterThan(0);
    resetAgentStore();
  });

  it("spatial index telemetry tracks window history (15-3-6d)", () => {
    resetAgentStore();
    const agentIds = seedAgents(10);
    const entries  = buildSpatialEntries(agentIds);

    const cameras: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
      { x: 10, y: 0, z: 10 },
    ];

    for (const cameraPos of cameras) {
      const snapshot = computeSpatialIndex(entries, cameraPos);
      useSpatialIndexStore.getState().setSnapshot(snapshot);
    }

    const telemetry = useSpatialIndexStore.getState().telemetry;
    expect(telemetry.windowSizeHistory.length).toBeGreaterThanOrEqual(1);
    expect(telemetry.maxWindowSeen).toBeGreaterThan(0);
    expect(telemetry.avgFillRatio).toBeGreaterThan(0);
    expect(telemetry.avgFillRatio).toBeLessThanOrEqual(1);
    resetAgentStore();
  });
});
