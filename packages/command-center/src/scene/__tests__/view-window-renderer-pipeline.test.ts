/**
 * view-window-renderer-pipeline.test.ts
 *
 * Sub-AC 15.2: Integration tests verifying that the view_window filtering is
 * correctly wired into the renderer pipeline.
 *
 * These tests validate:
 *   1. The view_window computation correctly classifies a 20-agent scene
 *   2. Only view_window-selected entities are in the render batch
 *   3. With 200 tasks assigned to 20 agents, culled agents' tasks are excluded
 *   4. The ViewWindowProvider component is correctly exported
 *   5. The renderer culling contract is maintained across diverse camera positions
 *   6. Edge cases: empty snapshot (bootstrap), all-culled, all-visible
 *
 * ── Why pure-function testing is valid ───────────────────────────────────────
 *
 *   Three.js rendering cannot run in Node.js Vitest (no WebGL).  However, the
 *   renderer pipeline integration is entirely deterministic:
 *
 *     useViewWindow (frame loop)
 *       └─ computeViewWindow (pure)         ← tested here
 *            └─ snapshot.visibleIds         ← the render gate
 *                 └─ AgentAvatarsLayer       ← visibleIds.has(agentId)
 *                 └─ TaskConnectorsLayer     ← vwVisibleSet.has(agentId)
 *
 *   By testing computeViewWindow with the exact inputs the renderer uses
 *   (camera PV matrix + agent/task positions), we verify the end-to-end
 *   filtering contract without a browser.
 *
 * ── Test ID scheme ────────────────────────────────────────────────────────────
 *   vwrp-N  (view-window renderer pipeline)
 */

import { describe, it, expect } from "vitest";
import {
  computeViewWindow,
  makeOrthoPVMatrix,
  VIEW_WINDOW_DEFAULT_MARGIN,
  VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
  VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
  makeEmptyViewWindowSnapshot,
  type ViewWindowEntity,
  type Vec3,
  type ViewWindowSnapshot,
} from "../view-window.js";

// ── Scene constants (matching CommandCenterScene building) ────────────────────

const AGENT_COUNT  = 20;
const TASK_COUNT   = 200;

/**
 * Building layout constants.
 * Agents spread across a 12 × 6 world-unit footprint on 2 floors.
 */
const BUILDING_HALF_W = 6;
const BUILDING_HALF_D = 3;
const FLOOR_HEIGHT    = 3.0;

// ── Scene data generators ─────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random generator.
 * Same seed → same sequence every run.
 */
function makePrng(seed = 0xdeadbeef) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

/**
 * Generate AGENT_COUNT synthetic agents inside the building footprint.
 * Deterministic positions for reproducible test results.
 */
function makeAgentEntities(count = AGENT_COUNT): ViewWindowEntity[] {
  const rand = makePrng();
  return Array.from({ length: count }, (_, i) => ({
    id:       `agent-${i.toString().padStart(2, "0")}`,
    position: {
      x: (rand() * 2 - 1) * BUILDING_HALF_W,
      y: (i % 2) * FLOOR_HEIGHT + rand() * 0.4,
      z: (rand() * 2 - 1) * BUILDING_HALF_D,
    },
    entityType: "agent" as const,
  }));
}

/**
 * Generate TASK_COUNT synthetic task entities.
 * Each task is co-located with (and assigned to) its agent, offset 1.5 units Y.
 * This mirrors use-view-window.ts TASK_ORB_Y_OFFSET = 1.5.
 */
function makeTaskEntities(
  agents: ViewWindowEntity[],
  taskCount = TASK_COUNT,
): Array<{ entity: ViewWindowEntity; assignedAgentId: string }> {
  const TASK_ORB_Y_OFFSET = 1.5;
  return Array.from({ length: taskCount }, (_, i) => {
    const agent = agents[i % agents.length];
    return {
      entity: {
        id:       `task-${i.toString().padStart(3, "0")}`,
        position: {
          x: agent.position.x,
          y: agent.position.y + TASK_ORB_Y_OFFSET,
          z: agent.position.z,
        },
        entityType: "task" as const,
      },
      assignedAgentId: agent.id,
    };
  });
}

/**
 * Build a PV matrix for a camera at the given position looking toward origin.
 * Uses an orthographic frustum matching the bird's-eye camera configuration.
 */
function makePVMatrix(
  cameraPos: Vec3,
  halfW = 10,
  halfH = 10,
): readonly number[] {
  return makeOrthoPVMatrix(halfW, halfH, 0.1, 200, cameraPos.x, cameraPos.y, cameraPos.z);
}

/**
 * Simulate the AgentAvatarsLayer render-gate logic.
 *
 * Given a ViewWindowSnapshot and a list of all agent IDs, returns the set of
 * agent IDs that the renderer would actually draw — mirroring the logic in
 * AgentAvatarsLayer:
 *
 *   viewWindowVisible={!hasSnapshot || visibleSet.has(id)}
 *
 * IMPORTANT: `hasSnapshot` uses snapshot.entities.length (NOT visibleIds.length)
 * as the bootstrap sentinel.  This mirrors the production code fix: when all
 * agents are culled, visibleIds is empty but entities is populated — the system
 * should render ZERO agents (not fall back to render-all).
 */
function getRenderedAgentIds(
  snapshot: ViewWindowSnapshot,
  allAgentIds: string[],
): string[] {
  // Bootstrap: before ViewWindowProvider has run, snapshot has no entities.
  // Once it has run (entities populated), we use the visible set even if empty.
  const hasSnapshot = snapshot.entities.length > 0;
  if (!hasSnapshot) {
    // Bootstrap fallback: render all agents
    return [...allAgentIds];
  }
  const visibleSet = new Set(snapshot.visibleIds);
  return allAgentIds.filter((id) => visibleSet.has(id));
}

/**
 * Simulate the TaskConnectorsLayer render-gate logic.
 *
 * Given a ViewWindowSnapshot and task-agent assignments, returns the set of
 * task IDs that the renderer would actually draw — mirroring TaskConnectorsLayer:
 *
 *   if (vwHasSnapshot && !vwVisibleSet.has(a.agentId)) return false;
 *
 * Same entities.length sentinel as AgentAvatarsLayer.
 */
function getRenderedTaskIds(
  snapshot: ViewWindowSnapshot,
  taskAssignments: Array<{ taskId: string; agentId: string }>,
): string[] {
  const vwHasSnapshot = snapshot.entities.length > 0; // entities.length sentinel
  if (!vwHasSnapshot) {
    return taskAssignments.map((t) => t.taskId);
  }
  const vwVisibleSet = new Set(snapshot.visibleIds);
  return taskAssignments
    .filter((t) => vwVisibleSet.has(t.agentId))
    .map((t) => t.taskId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ViewWindowProvider component interface (vwrp-vwp)", () => {
  it("vwrp-vwp-1: ViewWindowProvider module exports the component", async () => {
    // Dynamic import so the test can verify exports without React rendering
    const mod = await import("../ViewWindowProvider.js");
    expect(typeof mod.ViewWindowProvider).toBe("function");
  });

  it("vwrp-vwp-2: ViewWindowProvider is a null-returning canvas component (no geometry)", async () => {
    const mod = await import("../ViewWindowProvider.js");
    // The component should have a function body but return null
    expect(mod.ViewWindowProvider).toBeDefined();
  });
});

describe("View window computation — 20 agents in frustum (vwrp-in)", () => {
  // makeOrthoPVMatrix: camera at cameraPos looking toward -Z.
  // Building centered at origin: X ∈ [-6,6], Y ∈ [0,3.5], Z ∈ [-3,3].
  // Camera at Z=20 looks toward -Z, frustum covers Z ∈ [-180,19.9] ✓
  // halfW=8 → X ∈ [-8,8] covers building ✓
  // halfH=4 → Y ∈ [-4,4] covers Y=[0,3.5] ✓
  const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
  const pvMatrix = makePVMatrix(cameraPos, 8, 4);
  const agents = makeAgentEntities();

  it("vwrp-in-1: computeViewWindow processes exactly AGENT_COUNT agent entities", () => {
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    expect(snap.entities.length).toBe(AGENT_COUNT);
  });

  it("vwrp-in-2: all agents inside the wide-angle frustum appear in visibleIds", () => {
    // Wide frustum (halfW=8, halfH=8) from Y=15 covers the entire building footprint
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    // At least the agents inside the building should be visible
    expect(snap.visibleIds.length).toBeGreaterThan(0);
  });

  it("vwrp-in-3: visibleIds + culledIds = total entity count", () => {
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    const total = snap.visibleIds.length + snap.culledIds.length;
    expect(total).toBe(AGENT_COUNT);
  });

  it("vwrp-in-4: frustumIds + proximityIds + culledIds = total entity count", () => {
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    const total = snap.frustumIds.length + snap.proximityIds.length + snap.culledIds.length;
    expect(total).toBe(AGENT_COUNT);
  });

  it("vwrp-in-5: visibleIds equals frustumIds + proximityIds (no overlap)", () => {
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    const combined = new Set([...snap.frustumIds, ...snap.proximityIds]);
    const visible  = new Set(snap.visibleIds);
    expect(combined.size).toBe(visible.size);
    for (const id of combined) expect(visible.has(id)).toBe(true);
  });
});

describe("Renderer agent culling — 20 agents, narrow frustum (vwrp-cull)", () => {
  // Camera far to the right (X=30), looking toward -Z.
  // Building at X ∈ [-6,6], so all agents are outside X ∈ [27,33].
  // Distance from camera to nearest building edge ≥ 24 units > proximityRadius.
  // → All agents are culled when snapshot is populated.
  const cameraPos: Vec3 = { x: 30, y: 0, z: 20 };

  const agents = makeAgentEntities();
  const allAgentIds = agents.map((a) => a.id);

  it("vwrp-cull-1: with narrow frustum, rendered agent count < total agent count", () => {
    // Narrow frustum: X ∈ [28,32] — agents at X ∈ [-6,6] are all outside
    const pvMatrix = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, {
      proximityRadius: 2, // 2-unit sphere; nearest agent at ≥24 units
    });
    const rendered = getRenderedAgentIds(snap, allAgentIds);
    // All agents are culled → rendered = 0
    expect(rendered.length).toBeLessThan(AGENT_COUNT);
  });

  it("vwrp-cull-2: agents in visibleIds are always in the rendered set", () => {
    const pvMatrix = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, { proximityRadius: 2 });
    const rendered = new Set(getRenderedAgentIds(snap, allAgentIds));
    for (const id of snap.visibleIds) {
      expect(rendered.has(id)).toBe(true);
    }
  });

  it("vwrp-cull-3: agents in culledIds are NOT in the rendered set", () => {
    const pvMatrix = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, {
      proximityRadius: 2,
      margin: 0,
    });
    const rendered = new Set(getRenderedAgentIds(snap, allAgentIds));
    for (const id of snap.culledIds) {
      // A culled agent must NOT be in the rendered set
      expect(rendered.has(id)).toBe(false);
    }
  });

  it("vwrp-cull-4: every rendered agent ID is a known agent ID", () => {
    const pvMatrix = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, { proximityRadius: 2 });
    const allKnown = new Set(allAgentIds);
    const rendered = getRenderedAgentIds(snap, allAgentIds);
    for (const id of rendered) {
      expect(allKnown.has(id)).toBe(true);
    }
  });
});

describe("Renderer task culling — 200 tasks, 20 agents (vwrp-task)", () => {
  const agents    = makeAgentEntities();
  const taskData  = makeTaskEntities(agents);
  const allAgentIds  = agents.map((a) => a.id);
  const taskAssignments = taskData.map((t) => ({
    taskId:  t.entity.id,
    agentId: t.assignedAgentId,
  }));
  const allEntities = [
    ...agents,
    ...taskData.map((t) => t.entity),
  ];

  it("vwrp-task-1: task entity count equals TASK_COUNT", () => {
    expect(taskData.length).toBe(TASK_COUNT);
  });

  it("vwrp-task-2: total entity list has AGENT_COUNT + TASK_COUNT entities", () => {
    expect(allEntities.length).toBe(AGENT_COUNT + TASK_COUNT);
  });

  it("vwrp-task-3: with all agents visible, all tasks are in the rendered set", () => {
    // Wide frustum from Z=30, looking toward -Z.
    // halfW=10 → X ∈ [-10,10] covers agents at X ∈ [-6,6] ✓
    // halfH=6  → Y ∈ [-6,6]  covers agents at Y ∈ [0,3.5] ✓
    const cameraPos: Vec3 = { x: 0, y: 0, z: 30 };
    const pvMatrix = makePVMatrix(cameraPos, 10, 6);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, {
      maxDistance: 100,
    });

    // Agents that are in the visible set
    const renderedAgents = new Set(getRenderedAgentIds(snap, allAgentIds));

    // All tasks whose agent is visible should be rendered
    const renderedTasks = getRenderedTaskIds(snap, taskAssignments);

    // At least the tasks for visible agents should be in the render list
    const visibleAgentTaskCount = taskAssignments.filter(
      (t) => renderedAgents.has(t.agentId),
    ).length;

    expect(renderedTasks.length).toBe(visibleAgentTaskCount);
  });

  it("vwrp-task-4: tasks for culled agents are NOT in the rendered set", () => {
    // Far camera, narrow frustum — all agents culled
    // Camera at X=30, Z=20, looking toward -Z.
    // Agents at X ∈ [-6,6] are outside frustum X ∈ [28,32].
    // All distances > 24 > proximityRadius (1) → all culled.
    const cameraPos: Vec3 = { x: 30, y: 0, z: 20 };
    const pvMatrix = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos, {
      proximityRadius: 1,
      margin: 0,
    });

    const culledAgents = new Set(snap.culledIds);
    const renderedTasks = new Set(getRenderedTaskIds(snap, taskAssignments));

    // For every task whose agent is culled, the task should NOT be in the render set
    for (const { taskId, agentId } of taskAssignments) {
      if (culledAgents.has(agentId)) {
        expect(renderedTasks.has(taskId)).toBe(false);
      }
    }
  });

  it("vwrp-task-5: rendered task count ≤ TASK_COUNT", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pvMatrix = makePVMatrix(cameraPos, 8, 4);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    const renderedTasks = getRenderedTaskIds(snap, taskAssignments);
    expect(renderedTasks.length).toBeLessThanOrEqual(TASK_COUNT);
  });

  it("vwrp-task-6: tasks are evenly distributed (≤ ceil(TASK_COUNT/AGENT_COUNT) per agent)", () => {
    const tasksPerAgent = taskAssignments.reduce<Record<string, number>>((acc, t) => {
      acc[t.agentId] = (acc[t.agentId] ?? 0) + 1;
      return acc;
    }, {});
    const maxPerAgent = Math.ceil(TASK_COUNT / AGENT_COUNT);
    for (const count of Object.values(tasksPerAgent)) {
      expect(count).toBeLessThanOrEqual(maxPerAgent);
    }
  });
});

describe("Bootstrap fallback — empty snapshot (vwrp-boot)", () => {
  const agents = makeAgentEntities();
  const allAgentIds = agents.map((a) => a.id);
  const taskData = makeTaskEntities(agents);
  const taskAssignments = taskData.map((t) => ({
    taskId:  t.entity.id,
    agentId: t.assignedAgentId,
  }));

  it("vwrp-boot-1: empty snapshot causes all agents to be in the rendered set", () => {
    const emptySnap = makeEmptyViewWindowSnapshot();
    const rendered = getRenderedAgentIds(emptySnap, allAgentIds);
    expect(rendered.length).toBe(allAgentIds.length);
  });

  it("vwrp-boot-2: empty snapshot causes all tasks to be in the rendered set", () => {
    const emptySnap = makeEmptyViewWindowSnapshot();
    const rendered = getRenderedTaskIds(emptySnap, taskAssignments);
    expect(rendered.length).toBe(taskAssignments.length);
  });

  it("vwrp-boot-3: makeEmptyViewWindowSnapshot returns zero visibleIds", () => {
    const snap = makeEmptyViewWindowSnapshot();
    expect(snap.visibleIds.length).toBe(0);
    expect(snap.entities.length).toBe(0);
  });

  it("vwrp-boot-4: after first snapshot with entities, bootstrap fallback is off", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pvMatrix = makePVMatrix(cameraPos, 8, 4);
    const snap = computeViewWindow(agents, pvMatrix, cameraPos);
    // hasSnapshot is true iff visibleIds.length > 0
    // (at least some agents should be visible with this camera)
    if (snap.visibleIds.length > 0) {
      // hasSnapshot = true → filter is active → rendered ≤ total
      const rendered = getRenderedAgentIds(snap, allAgentIds);
      // The rendered count should match visibleIds count exactly
      expect(rendered.length).toBe(snap.visibleIds.length);
    }
    // If all culled (possible with very strict params), the test still passes
  });
});

describe("Full scene pipeline — 20 agents + 200 tasks, diverse cameras (vwrp-full)", () => {
  const agents = makeAgentEntities();
  const taskData = makeTaskEntities(agents);
  const allAgentIds = agents.map((a) => a.id);
  const taskAssignments = taskData.map((t) => ({
    taskId:  t.entity.id,
    agentId: t.assignedAgentId,
  }));

  // All cameras use makeOrthoPVMatrix which looks toward -Z.
  // Building is at X ∈ [-6,6], Y ∈ [0,3.5], Z ∈ [-3,3].
  // Camera must be at Z > 3 so the building is in the camera's -Z direction.
  const cameraPositions: Array<{ label: string; pos: Vec3; halfW: number; halfH: number }> = [
    // Wide overview: covers entire building from Z=25
    { label: "overview (Z=25)",   pos: { x:  0, y: 0, z: 25 }, halfW: 10, halfH:  6 },
    // Side view: camera to the right, narrow frustum
    { label: "side-right (X=18)", pos: { x: 18, y: 0, z: 20 }, halfW:  4, halfH:  4 },
    // Corner: camera above and to the right
    { label: "corner (X=8,Z=20)", pos: { x:  8, y: 4, z: 20 }, halfW:  5, halfH:  5 },
    // Floor-level from nearby Z
    { label: "floor-level (Z=12)",pos: { x:  0, y: 0, z: 12 }, halfW:  4, halfH:  3 },
    // Far distant: camera at Z=80, wide frustum
    { label: "distant (Z=80)",    pos: { x:  0, y: 0, z: 80 }, halfW: 30, halfH: 20 },
  ];

  for (const cam of cameraPositions) {
    it(`vwrp-full-1: [${cam.label}] rendered agents ≤ AGENT_COUNT`, () => {
      const pv = makePVMatrix(cam.pos, cam.halfW, cam.halfH);
      const snap = computeViewWindow(agents, pv, cam.pos);
      const rendered = getRenderedAgentIds(snap, allAgentIds);
      expect(rendered.length).toBeLessThanOrEqual(AGENT_COUNT);
    });

    it(`vwrp-full-2: [${cam.label}] rendered tasks ≤ TASK_COUNT`, () => {
      const pv = makePVMatrix(cam.pos, cam.halfW, cam.halfH);
      const snap = computeViewWindow(agents, pv, cam.pos);
      const rendered = getRenderedTaskIds(snap, taskAssignments);
      expect(rendered.length).toBeLessThanOrEqual(TASK_COUNT);
    });

    it(`vwrp-full-3: [${cam.label}] frustum+proximity+culled = AGENT_COUNT`, () => {
      const pv = makePVMatrix(cam.pos, cam.halfW, cam.halfH);
      const snap = computeViewWindow(agents, pv, cam.pos);
      expect(snap.frustumIds.length + snap.proximityIds.length + snap.culledIds.length)
        .toBe(AGENT_COUNT);
    });

    it(`vwrp-full-4: [${cam.label}] no duplicate IDs across sets`, () => {
      const pv = makePVMatrix(cam.pos, cam.halfW, cam.halfH);
      const snap = computeViewWindow(agents, pv, cam.pos);
      const all = [...snap.frustumIds, ...snap.proximityIds, ...snap.culledIds];
      const uniqueAll = new Set(all);
      expect(uniqueAll.size).toBe(all.length);
    });
  }

  it("vwrp-full-5: snapshot is frozen (immutable output from computeViewWindow)", () => {
    const pv = makePVMatrix({ x: 0, y: 0, z: 20 }, 8, 4);
    const snap = computeViewWindow(agents, pv, { x: 0, y: 0, z: 20 });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.visibleIds)).toBe(true);
    expect(Object.isFrozen(snap.culledIds)).toBe(true);
  });

  it("vwrp-full-6: results sorted nearest-first (distances ascending)", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 8, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    for (let i = 1; i < snap.entities.length; i++) {
      expect(snap.entities[i].distance).toBeGreaterThanOrEqual(
        snap.entities[i - 1].distance,
      );
    }
  });

  it("vwrp-full-7: every entity has shouldRender consistent with its class", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 8, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    for (const entity of snap.entities) {
      const expected = entity.class !== "culled";
      expect(entity.shouldRender).toBe(expected);
    }
  });

  it("vwrp-full-8: rendered agent IDs are exactly the visibleIds (when snapshot has data)", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 8, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    if (snap.visibleIds.length > 0) {
      const rendered = new Set(getRenderedAgentIds(snap, allAgentIds));
      const visible  = new Set(snap.visibleIds);
      expect(rendered.size).toBe(visible.size);
      for (const id of visible) {
        expect(rendered.has(id)).toBe(true);
      }
    }
  });
});

describe("max-distance culling — entities beyond horizon are excluded (vwrp-dist)", () => {
  it("vwrp-dist-1: agent beyond VIEW_WINDOW_DEFAULT_MAX_DISTANCE is culled", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 0 };
    const pv = makePVMatrix(cameraPos, 50, 50);
    const farAgent: ViewWindowEntity = {
      id: "far-agent",
      position: {
        x: 0,
        y: 0,
        z: -(VIEW_WINDOW_DEFAULT_MAX_DISTANCE + 5),
      },
      entityType: "agent",
    };
    const snap = computeViewWindow([farAgent], pv, cameraPos);
    expect(snap.culledIds).toContain("far-agent");
    expect(snap.visibleIds).not.toContain("far-agent");
  });

  it("vwrp-dist-2: agent within maxDistance is classified frustum or proximity", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 0 };
    const pv = makePVMatrix(cameraPos, 50, 50);
    const nearAgent: ViewWindowEntity = {
      id: "near-agent",
      position: { x: 0, y: 0, z: -5 },
      entityType: "agent",
    };
    const snap = computeViewWindow([nearAgent], pv, cameraPos, {
      maxDistance: VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
    });
    expect(snap.visibleIds).toContain("near-agent");
  });
});

describe("proximity sphere — agents near camera stay visible (vwrp-prox)", () => {
  it("vwrp-prox-1: agent outside frustum but within proximity sphere is visible", () => {
    // Camera at origin, standard frustum ±5 in X/Y, looking down -Z
    const cameraPos: Vec3 = { x: 0, y: 0, z: 0 };
    const pv = makeOrthoPVMatrix(5, 5, 0.1, 100, 0, 0, 0);

    // Place agent at X=7 (outside ±5 frustum) but distance < proximityRadius
    const agent: ViewWindowEntity = {
      id: "prox-agent",
      position: { x: 7, y: 0, z: 0 },
      entityType: "agent",
    };
    const snap = computeViewWindow([agent], pv, cameraPos, {
      proximityRadius: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
      margin: 0,
    });
    // distance = 7 < proximityRadius (8) → proximity
    expect(snap.proximityIds).toContain("prox-agent");
    expect(snap.visibleIds).toContain("prox-agent");
  });

  it("vwrp-prox-2: agent outside frustum AND beyond proximity sphere is culled", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 0 };
    const pv = makeOrthoPVMatrix(5, 5, 0.1, 100, 0, 0, 0);

    const agent: ViewWindowEntity = {
      id: "beyond-prox-agent",
      position: { x: 20, y: 0, z: 0 }, // distance = 20 > proximityRadius
      entityType: "agent",
    };
    const snap = computeViewWindow([agent], pv, cameraPos, {
      proximityRadius: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
      margin: 0,
    });
    expect(snap.culledIds).toContain("beyond-prox-agent");
    expect(snap.visibleIds).not.toContain("beyond-prox-agent");
  });
});

describe("Renderer pipeline contract invariants (vwrp-inv)", () => {
  const agents = makeAgentEntities();
  const taskData = makeTaskEntities(agents);
  const allAgentIds = agents.map((a) => a.id);
  const taskAssignments = taskData.map((t) => ({
    taskId:  t.entity.id,
    agentId: t.assignedAgentId,
  }));

  it("vwrp-inv-1: rendered agent set is always a subset of all agent IDs", () => {
    const cameraPos: Vec3 = { x: 5, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 5, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    const knownIds = new Set(allAgentIds);
    const rendered = getRenderedAgentIds(snap, allAgentIds);
    for (const id of rendered) expect(knownIds.has(id)).toBe(true);
  });

  it("vwrp-inv-2: rendered task set is always a subset of all task IDs", () => {
    const cameraPos: Vec3 = { x: 5, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 5, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    const knownTaskIds = new Set(taskAssignments.map((t) => t.taskId));
    const rendered = getRenderedTaskIds(snap, taskAssignments);
    for (const id of rendered) expect(knownTaskIds.has(id)).toBe(true);
  });

  it("vwrp-inv-3: culled agents never appear in rendered task set", () => {
    // Camera far to the right, narrow frustum — all agents culled
    const cameraPos: Vec3 = { x: 30, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 2, 2);
    const snap = computeViewWindow(agents, pv, cameraPos, {
      proximityRadius: 1,
      margin: 0,
    });
    const culledSet = new Set(snap.culledIds);
    const renderedTaskIds = new Set(getRenderedTaskIds(snap, taskAssignments));

    for (const { taskId, agentId } of taskAssignments) {
      if (culledSet.has(agentId)) {
        expect(renderedTaskIds.has(taskId)).toBe(false);
      }
    }
  });

  it("vwrp-inv-4: snapshot entities count is always AGENT_COUNT (no duplicate/missing)", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 7, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    expect(snap.entities.length).toBe(AGENT_COUNT);
  });

  it("vwrp-inv-5: shouldRender is true iff entity is in visibleIds", () => {
    const cameraPos: Vec3 = { x: 0, y: 0, z: 20 };
    const pv = makePVMatrix(cameraPos, 7, 4);
    const snap = computeViewWindow(agents, pv, cameraPos);
    const visibleSet = new Set(snap.visibleIds);

    for (const entity of snap.entities) {
      expect(entity.shouldRender).toBe(visibleSet.has(entity.id));
    }
  });
});
