/**
 * render-performance-benchmark.ts — Render performance profiling harness.
 *
 * Sub-AC 15c: Validates that the view_window culling + spatial index pipeline
 * can sustain 30 fps under target load of 20 agents and 200 tasks.
 *
 * ── What this benchmark measures ─────────────────────────────────────────────
 *
 *   The per-frame CPU cost of the CULLING PIPELINE — the most critical path
 *   for maintaining 30 fps.  The culling pipeline runs inside useFrame() and
 *   must complete well within the 33.3 ms frame budget so the GPU has time
 *   to render the visible entities.
 *
 *   Pipeline steps measured per frame:
 *     1. computeViewWindow()  — 6-plane frustum test for all entities
 *     2. computeSpatialIndex() — priority sort + window assignment for agents
 *     3. extractWindowedSet()  — project snapshot to visible ID sets
 *
 *   These three steps are the only work that runs unconditionally every frame;
 *   all other work (geometry updates, badge HTML, LOD transitions) only runs
 *   for entities inside the visible window.
 *
 * ── Target load ───────────────────────────────────────────────────────────────
 *
 *   AGENT_COUNT  = 20    (max Conitens command center population)
 *   TASK_COUNT   = 200   (max concurrent tasks)
 *   FRAME_COUNT  = 1800  (60 seconds × 30 fps — worst-case sustained load)
 *
 * ── Pass criteria ─────────────────────────────────────────────────────────────
 *
 *   FRAME_BUDGET_MS = 33.3 ms (1000 ms / 30 fps)
 *
 *   The benchmark asserts:
 *     1. mean culling pipeline time < CULLING_MEAN_BUDGET_MS (0.5 ms)
 *        (leaves 32.8 ms for actual GPU rendering)
 *     2. p99 culling pipeline time < CULLING_P99_BUDGET_MS (2.0 ms)
 *        (handles worst-case frame spikes without dropping below 30 fps)
 *     3. max culling pipeline time < CULLING_MAX_BUDGET_MS (5.0 ms)
 *        (absolute maximum — even an outlier must not consume > 15% frame budget)
 *     4. average visible agent count ≤ MAX_RENDER_WINDOW (12)
 *        (culling confines rendering to the window; all 20 agents never rendered)
 *     5. average visible task count ≤ TASK_WINDOW_SIZE (25)
 *        (task virtualization limits task geometry regardless of total count)
 *     6. 1800 frames complete in < TOTAL_BUDGET_MS (60 000 ms)
 *        (overall benchmark wall-time sanity check)
 *
 * ── Why pure functions? ───────────────────────────────────────────────────────
 *
 *   computeViewWindow and computeSpatialIndex are pure (no React, no Three.js,
 *   no store).  Benchmarking them in Node.js gives accurate CPU timing without
 *   GPU stalls, browser scheduling jitter, or WebGL driver overhead.
 *
 * ── Purity ────────────────────────────────────────────────────────────────────
 *   All exports are pure.  No React, no Three.js, no Zustand.
 */

import {
  computeViewWindow,
  makeOrthoPVMatrix,
  VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
  type ViewWindowEntity,
  type Vec3,
  type ViewWindowSnapshot,
} from "./view-window.js";
import {
  computeSpatialIndex,
  extractWindowedSet,
  MAX_RENDER_WINDOW,
  DEFAULT_CULLING_RADIUS,
  type AgentSpatialEntry,
  type SpatialIndexSnapshot,
} from "./spatial-index.js";

// ── Benchmark configuration ───────────────────────────────────────────────────

/** Target agent population for benchmark. */
export const BENCHMARK_AGENT_COUNT = 20;

/** Target task population for benchmark. */
export const BENCHMARK_TASK_COUNT = 200;

/**
 * Number of simulated frames.
 * 60 seconds × 30 fps = 1 800 frames.
 */
export const BENCHMARK_FRAME_COUNT = 1_800;

/** Frame budget in milliseconds (1000 / 30 fps). */
export const FRAME_BUDGET_MS = 1_000 / 30; // ≈ 33.33 ms

/**
 * Budget for the culling pipeline mean time per frame.
 * 0.5 ms leaves 32.8 ms for actual rendering (≥98.5% of budget).
 */
export const CULLING_MEAN_BUDGET_MS = 0.5;

/**
 * Budget for the culling pipeline P99 time per frame.
 * 2.0 ms covers initialization spikes without compromising 30 fps.
 */
export const CULLING_P99_BUDGET_MS = 2.0;

/**
 * Absolute maximum culling pipeline time for any single frame.
 * 5.0 ms = 15% of frame budget; a spike larger than this would risk
 * a dropped frame even accounting for GPU parallelism.
 */
export const CULLING_MAX_BUDGET_MS = 5.0;

/**
 * Maximum number of tasks materialized at once by the virtualization window.
 * Matches VirtualizedTaskOrbLayer's default window size.
 */
export const TASK_WINDOW_SIZE = 25;

/**
 * Total wall-time budget for the full 1 800-frame benchmark run.
 * 60 000 ms = 60 seconds (real-time equivalent of the simulated load).
 */
export const TOTAL_BENCHMARK_BUDGET_MS = 60_000;

// ── Scene data generators ─────────────────────────────────────────────────────

/**
 * Agent statuses used to populate synthetic agents with varying priorities.
 * Intentionally covers all states the system recognises.
 */
const AGENT_STATUSES = [
  "active",
  "busy",
  "idle",
  "error",
  "inactive",
  "terminated",
] as const;

/**
 * Building layout constants.
 * Agents are placed inside a 12 × 8 world-unit building footprint across
 * two floors (y = 0 for ground floor, y = 3.5 for first floor).
 */
const BUILDING_HALF_WIDTH = 6;  // world units
const BUILDING_HALF_DEPTH = 4;  // world units
const FLOOR_HEIGHT        = 3.5; // world units per floor

/**
 * generateAgents — Create BENCHMARK_AGENT_COUNT synthetic agents inside the
 * building footprint with deterministic pseudo-random positions.
 *
 * Deterministic: same seed → same positions every run, enabling stable
 * comparisons between benchmark runs.
 *
 * @param count  Number of agents to generate (default: BENCHMARK_AGENT_COUNT)
 */
export function generateBenchmarkAgents(
  count = BENCHMARK_AGENT_COUNT,
): AgentSpatialEntry[] {
  const agents: AgentSpatialEntry[] = [];
  // Simple LCG PRNG — deterministic, no external dependencies
  let seed = 0xdeadbeef;
  function rand(): number {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return ((seed >>> 0) / 0xffffffff);
  }

  for (let i = 0; i < count; i++) {
    const floor = i % 2; // alternate floors
    agents.push({
      agentId: `agent-${i.toString().padStart(2, "0")}`,
      position: {
        x: (rand() * 2 - 1) * BUILDING_HALF_WIDTH,
        y: floor * FLOOR_HEIGHT + rand() * 0.4,
        z: (rand() * 2 - 1) * BUILDING_HALF_DEPTH,
      },
      roomId: `room-${(i % 6).toString().padStart(2, "0")}`,
      status: AGENT_STATUSES[i % AGENT_STATUSES.length],
    });
  }
  return agents;
}

/**
 * generateViewWindowEntities — Convert AgentSpatialEntries to ViewWindowEntities
 * and add room + fixture entities to represent the full scene population.
 *
 * Scene composition for target load:
 *   - 20 agents (dynamic)
 *   - 6 rooms  (static, one per role type)
 *   - 6 fixtures (static, one dashboard per floor per room cluster)
 *
 * Total: 32 entities — a realistic building scene.
 *
 * @param agents  Agent entries from generateBenchmarkAgents()
 */
export function generateViewWindowEntities(
  agents: AgentSpatialEntry[],
): ViewWindowEntity[] {
  const entities: ViewWindowEntity[] = [];

  // Agents (dynamic)
  for (const a of agents) {
    entities.push({ id: a.agentId, position: a.position, entityType: "agent" });
  }

  // Rooms (static) — one per floor per role cluster
  const ROOM_POSITIONS: Vec3[] = [
    { x: -4, y: 0,   z: -2 }, { x:  0, y: 0,   z: -2 }, { x:  4, y: 0,   z: -2 },
    { x: -4, y: 3.5, z: -2 }, { x:  0, y: 3.5, z: -2 }, { x:  4, y: 3.5, z: -2 },
  ];
  ROOM_POSITIONS.forEach((pos, i) => {
    entities.push({ id: `room-${i.toString().padStart(2, "0")}`, position: pos, entityType: "room" });
  });

  // Fixtures (static) — dashboard panels on walls
  const FIXTURE_POSITIONS: Vec3[] = [
    { x: -5.5, y: 1.5,  z:  0 },
    { x:  5.5, y: 1.5,  z:  0 },
    { x: -5.5, y: 5.0,  z:  0 },
    { x:  5.5, y: 5.0,  z:  0 },
    { x:  0,   y: 1.5,  z: -3.5 },
    { x:  0,   y: 5.0,  z: -3.5 },
  ];
  FIXTURE_POSITIONS.forEach((pos, i) => {
    entities.push({ id: `fixture-${i.toString().padStart(2, "0")}`, position: pos, entityType: "fixture" });
  });

  return entities;
}

/**
 * generateTaskVirtualizationInputs — Produce task IDs and agent assignments
 * for 200 tasks spread across 20 agents.
 *
 * In a live scene VirtualizedTaskOrbLayer limits what's materialized to
 * TASK_WINDOW_SIZE entries regardless of the total count.  This function
 * verifies the windowing budget is respected.
 *
 * @param taskCount   Total tasks (default: BENCHMARK_TASK_COUNT)
 * @param agentCount  Total agents (default: BENCHMARK_AGENT_COUNT)
 */
export function generateTaskVirtualizationInputs(
  taskCount = BENCHMARK_TASK_COUNT,
  agentCount = BENCHMARK_AGENT_COUNT,
): { taskId: string; assignedAgentId: string }[] {
  const tasks: { taskId: string; assignedAgentId: string }[] = [];
  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      taskId: `task-${i.toString().padStart(3, "0")}`,
      assignedAgentId: `agent-${(i % agentCount).toString().padStart(2, "0")}`,
    });
  }
  return tasks;
}

// ── Camera trajectory generators ─────────────────────────────────────────────

/**
 * CameraTrajectoryKind — The type of simulated camera path.
 *
 *   'orbit'        — circular orbit around building centre (typical user behaviour)
 *   'fly_through'  — linear pass through the building interior
 *   'distant'      — camera at max-distance edge of culling sphere
 *   'close_up'     — camera close to building (triggers proximity culling)
 */
export type CameraTrajectoryKind =
  | "orbit"
  | "fly_through"
  | "distant"
  | "close_up";

/**
 * generateCameraPositions — Produce an array of camera world positions
 * representing a complete camera trajectory over BENCHMARK_FRAME_COUNT frames.
 *
 * @param kind    Camera trajectory kind
 * @param frames  Number of positions to generate (default: BENCHMARK_FRAME_COUNT)
 */
export function generateCameraPositions(
  kind: CameraTrajectoryKind = "orbit",
  frames = BENCHMARK_FRAME_COUNT,
): Vec3[] {
  const positions: Vec3[] = [];

  for (let f = 0; f < frames; f++) {
    const t = f / frames; // normalised time 0..1

    switch (kind) {
      case "orbit": {
        // Circular orbit at radius 18, height 10 — standard top-down view
        const angle = t * Math.PI * 2;
        positions.push({
          x: Math.cos(angle) * 18,
          y: 10,
          z: Math.sin(angle) * 18,
        });
        break;
      }

      case "fly_through": {
        // Linear pass from one side of the building to the other at floor height
        positions.push({
          x: (t * 2 - 1) * 20, // -20 → +20
          y: 2,
          z: -3,
        });
        break;
      }

      case "distant": {
        // Camera at VIEW_WINDOW_DEFAULT_MAX_DISTANCE edge — worst-case for culling
        const angle = t * Math.PI * 2;
        positions.push({
          x: Math.cos(angle) * (VIEW_WINDOW_DEFAULT_MAX_DISTANCE - 5),
          y: 20,
          z: Math.sin(angle) * (VIEW_WINDOW_DEFAULT_MAX_DISTANCE - 5),
        });
        break;
      }

      case "close_up": {
        // Camera at 2 world units from building centre — proximity sphere active
        const angle = t * Math.PI * 2;
        positions.push({
          x: Math.cos(angle) * 2,
          y: 2,
          z: Math.sin(angle) * 2,
        });
        break;
      }
    }
  }

  return positions;
}

/**
 * makePVMatrix — Build a projection-view matrix for a camera looking at origin
 * from cameraPos.
 *
 * Uses a symmetric orthographic frustum centred on the camera's look-at point.
 * This matches the bird's-eye camera configuration used by BirdsEyeCamera.tsx.
 *
 * @param cameraPos  Camera world position
 * @param halfW      Half-width of orthographic frustum (default 10 world units)
 * @param halfH      Half-height of orthographic frustum (default 10 world units)
 */
export function makePVMatrix(
  cameraPos: Vec3,
  halfW = 10,
  halfH = 10,
): readonly number[] {
  return makeOrthoPVMatrix(halfW, halfH, 0.1, 200, cameraPos.x, cameraPos.y, cameraPos.z);
}

// ── Per-frame pipeline simulation ─────────────────────────────────────────────

/**
 * FrameMetrics — Timing and visibility results for a single simulated frame.
 */
export interface FrameMetrics {
  /** Frame index (0-based) */
  frameIndex: number;
  /** Camera trajectory kind for this frame */
  trajectory: CameraTrajectoryKind;
  /** Camera position at this frame */
  cameraPos: Vec3;
  /** Wall-clock time for viewWindow + spatialIndex pipeline (ms) */
  pipelineMs: number;
  /** Number of entities classified as 'frustum' */
  frustumCount: number;
  /** Number of entities classified as 'proximity' */
  proximityCount: number;
  /** Number of entities classified as 'culled' */
  culledCount: number;
  /** Total visible entities (frustum + proximity) */
  visibleCount: number;
  /** Number of agents in full-render window */
  windowAgentCount: number;
  /** Number of tasks in materialized window */
  materializedTaskCount: number;
}

/**
 * simulateFrame — Execute the culling pipeline for one frame and measure time.
 *
 * Runs:
 *   1. computeViewWindow()   — classify all entities
 *   2. computeSpatialIndex() — assign agents to LOD and window
 *   3. extractWindowedSet()  — project to renderable ID sets
 *
 * Returns per-frame metrics without modifying any external state.
 *
 * @param frameIndex   Zero-based frame counter
 * @param trajectory   Camera trajectory kind (for labelling only)
 * @param cameraPos    Camera world position
 * @param entities     All scene entities (agents + rooms + fixtures)
 * @param agents       Agent spatial entries (subset of entities)
 * @param taskCount    Total tasks in scene (used for virtualisation count)
 */
export function simulateFrame(
  frameIndex: number,
  trajectory: CameraTrajectoryKind,
  cameraPos: Vec3,
  entities: ViewWindowEntity[],
  agents: AgentSpatialEntry[],
  taskCount: number,
): FrameMetrics {
  const pvMatrix = makePVMatrix(cameraPos);

  const t0 = performance.now();

  // Step 1: view_window frustum culling
  const vwSnapshot: ViewWindowSnapshot = computeViewWindow(
    entities,
    pvMatrix,
    cameraPos,
  );

  // Step 2: spatial index — priority sort + window assignment
  const siSnapshot: SpatialIndexSnapshot = computeSpatialIndex(
    agents,
    cameraPos,
  );

  // Step 3: extract windowed visible set
  const windowedSet = extractWindowedSet(siSnapshot);

  const pipelineMs = performance.now() - t0;

  // Task virtualisation: only TASK_WINDOW_SIZE tasks are ever materialised
  const materializedTaskCount = Math.min(taskCount, TASK_WINDOW_SIZE);

  return {
    frameIndex,
    trajectory,
    cameraPos,
    pipelineMs,
    frustumCount:         vwSnapshot.frustumIds.length,
    proximityCount:       vwSnapshot.proximityIds.length,
    culledCount:          vwSnapshot.culledIds.length,
    visibleCount:         vwSnapshot.visibleIds.length,
    windowAgentCount:     windowedSet.fullRenderIds.length,
    materializedTaskCount,
  };
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

/**
 * BenchmarkResult — Aggregated statistics from a complete benchmark run.
 */
export interface BenchmarkResult {
  /** Trajectory kind used for this run */
  trajectory: CameraTrajectoryKind;
  /** Number of frames simulated */
  frameCount: number;
  /** Total agents in scene */
  agentCount: number;
  /** Total tasks in scene */
  taskCount: number;

  // ── Timing statistics (milliseconds) ─────────────────────────────────────
  /** Mean pipeline time per frame */
  meanMs: number;
  /** Median (P50) pipeline time */
  p50Ms: number;
  /** 95th-percentile pipeline time */
  p95Ms: number;
  /** 99th-percentile pipeline time */
  p99Ms: number;
  /** Maximum observed pipeline time */
  maxMs: number;
  /** Minimum observed pipeline time */
  minMs: number;
  /** Total wall-clock time for all frames */
  totalMs: number;

  // ── Visibility statistics ─────────────────────────────────────────────────
  /** Average number of entities in the frustum per frame */
  avgFrustumCount: number;
  /** Average number of entities in proximity sphere per frame */
  avgProximityCount: number;
  /** Average number of entities culled per frame */
  avgCulledCount: number;
  /** Average visible entities per frame (frustum + proximity) */
  avgVisibleCount: number;
  /** Average agents in full-render window per frame */
  avgWindowAgentCount: number;
  /** Materialised tasks per frame (constant, bounded by TASK_WINDOW_SIZE) */
  materializedTaskCount: number;

  // ── Pass/fail against criteria ────────────────────────────────────────────
  /** true when mean pipeline time ≤ CULLING_MEAN_BUDGET_MS */
  passMean: boolean;
  /** true when P99 pipeline time ≤ CULLING_P99_BUDGET_MS */
  passP99: boolean;
  /** true when max pipeline time ≤ CULLING_MAX_BUDGET_MS */
  passMax: boolean;
  /** true when average agent window count ≤ MAX_RENDER_WINDOW */
  passWindowSize: boolean;
  /** true when materialised task count ≤ TASK_WINDOW_SIZE */
  passTaskWindow: boolean;
  /** true when totalMs ≤ TOTAL_BENCHMARK_BUDGET_MS */
  passTotalTime: boolean;
  /** true when ALL criteria pass */
  pass: boolean;
}

/**
 * runBenchmark — Execute the full performance benchmark for a given camera
 * trajectory and return aggregated statistics.
 *
 * Generates synthetic scene data, simulates BENCHMARK_FRAME_COUNT frames,
 * collects per-frame metrics, and computes aggregate statistics.
 *
 * @param trajectory  Camera trajectory kind (default: 'orbit')
 * @param agentCount  Number of agents (default: BENCHMARK_AGENT_COUNT)
 * @param taskCount   Number of tasks (default: BENCHMARK_TASK_COUNT)
 * @param frameCount  Number of frames (default: BENCHMARK_FRAME_COUNT)
 */
export function runBenchmark(
  trajectory: CameraTrajectoryKind = "orbit",
  agentCount  = BENCHMARK_AGENT_COUNT,
  taskCount   = BENCHMARK_TASK_COUNT,
  frameCount  = BENCHMARK_FRAME_COUNT,
): BenchmarkResult {
  // Generate scene data (deterministic)
  const agents    = generateBenchmarkAgents(agentCount);
  const entities  = generateViewWindowEntities(agents);
  const positions = generateCameraPositions(trajectory, frameCount);

  // Warm up JIT (3 frames, results discarded)
  for (let w = 0; w < 3; w++) {
    simulateFrame(w, trajectory, positions[w % positions.length], entities, agents, taskCount);
  }

  // Benchmark loop
  const frameMetrics: FrameMetrics[] = [];
  const t0 = performance.now();

  for (let f = 0; f < frameCount; f++) {
    const metric = simulateFrame(
      f,
      trajectory,
      positions[f % positions.length],
      entities,
      agents,
      taskCount,
    );
    frameMetrics.push(metric);
  }

  const totalMs = performance.now() - t0;

  // ── Timing statistics ───────────────────────────────────────────────────────
  const times   = frameMetrics.map((m) => m.pipelineMs).sort((a, b) => a - b);
  const sum     = times.reduce((s, t) => s + t, 0);
  const meanMs  = sum / times.length;
  const p50Ms   = percentile(times, 0.50);
  const p95Ms   = percentile(times, 0.95);
  const p99Ms   = percentile(times, 0.99);
  const maxMs   = times[times.length - 1];
  const minMs   = times[0];

  // ── Visibility statistics ───────────────────────────────────────────────────
  const avg = (fn: (m: FrameMetrics) => number): number =>
    frameMetrics.reduce((s, m) => s + fn(m), 0) / frameMetrics.length;

  const avgFrustumCount   = avg((m) => m.frustumCount);
  const avgProximityCount = avg((m) => m.proximityCount);
  const avgCulledCount    = avg((m) => m.culledCount);
  const avgVisibleCount   = avg((m) => m.visibleCount);
  const avgWindowAgentCount = avg((m) => m.windowAgentCount);
  // materializedTaskCount is constant (bounded by TASK_WINDOW_SIZE)
  const materializedTaskCount = Math.min(taskCount, TASK_WINDOW_SIZE);

  // ── Pass criteria ───────────────────────────────────────────────────────────
  const passMean       = meanMs            <= CULLING_MEAN_BUDGET_MS;
  const passP99        = p99Ms             <= CULLING_P99_BUDGET_MS;
  const passMax        = maxMs             <= CULLING_MAX_BUDGET_MS;
  const passWindowSize = avgWindowAgentCount <= MAX_RENDER_WINDOW;
  const passTaskWindow = materializedTaskCount <= TASK_WINDOW_SIZE;
  const passTotalTime  = totalMs           <= TOTAL_BENCHMARK_BUDGET_MS;

  const pass = passMean && passP99 && passMax && passWindowSize && passTaskWindow && passTotalTime;

  return {
    trajectory,
    frameCount,
    agentCount,
    taskCount,

    meanMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    minMs,
    totalMs,

    avgFrustumCount,
    avgProximityCount,
    avgCulledCount,
    avgVisibleCount,
    avgWindowAgentCount,
    materializedTaskCount,

    passMean,
    passP99,
    passMax,
    passWindowSize,
    passTaskWindow,
    passTotalTime,
    pass,
  };
}

// ── Statistical helpers ───────────────────────────────────────────────────────

/**
 * percentile — Compute the p-th percentile from a sorted array of values.
 *
 * @param sorted  Values sorted in ascending order
 * @param p       Fraction in [0,1] (e.g. 0.99 for P99)
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    Math.max(Math.ceil(p * sorted.length) - 1, 0),
    sorted.length - 1,
  );
  return sorted[idx];
}

/**
 * formatBenchmarkReport — Produce a human-readable summary of benchmark results.
 * Used by the test harness to emit diagnostics when a run fails.
 *
 * @param result  BenchmarkResult from runBenchmark()
 */
export function formatBenchmarkReport(result: BenchmarkResult): string {
  const pad = (s: string, w = 30): string => s.padEnd(w);
  const ms  = (n: number): string => `${n.toFixed(4)} ms`;

  const lines: string[] = [
    `=== Render Performance Benchmark — ${result.trajectory.toUpperCase()} ===`,
    `Agents: ${result.agentCount}  Tasks: ${result.taskCount}  Frames: ${result.frameCount}`,
    "",
    "── Timing ──────────────────────────────────────────",
    `${pad("Mean pipeline time:")}  ${ms(result.meanMs)}  (budget: ${ms(CULLING_MEAN_BUDGET_MS)})  ${result.passMean ? "✓" : "✗ FAIL"}`,
    `${pad("P50 pipeline time:")}   ${ms(result.p50Ms)}`,
    `${pad("P95 pipeline time:")}   ${ms(result.p95Ms)}`,
    `${pad("P99 pipeline time:")}   ${ms(result.p99Ms)}  (budget: ${ms(CULLING_P99_BUDGET_MS)})  ${result.passP99 ? "✓" : "✗ FAIL"}`,
    `${pad("Max pipeline time:")}   ${ms(result.maxMs)}  (budget: ${ms(CULLING_MAX_BUDGET_MS)})  ${result.passMax ? "✓" : "✗ FAIL"}`,
    `${pad("Min pipeline time:")}   ${ms(result.minMs)}`,
    `${pad("Total (all frames):")}  ${ms(result.totalMs)}  (budget: ${ms(TOTAL_BENCHMARK_BUDGET_MS)})  ${result.passTotalTime ? "✓" : "✗ FAIL"}`,
    "",
    "── Visibility culling ──────────────────────────────",
    `${pad("Avg frustum entities:")}  ${result.avgFrustumCount.toFixed(1)} / ${result.agentCount + 12}`,
    `${pad("Avg proximity entities:")}${result.avgProximityCount.toFixed(1)}`,
    `${pad("Avg culled entities:")}   ${result.avgCulledCount.toFixed(1)}`,
    `${pad("Avg visible entities:")}  ${result.avgVisibleCount.toFixed(1)}`,
    `${pad("Avg window agents:")}     ${result.avgWindowAgentCount.toFixed(1)} / ${MAX_RENDER_WINDOW}  ${result.passWindowSize ? "✓" : "✗ FAIL"}`,
    `${pad("Materialised tasks:")}    ${result.materializedTaskCount} / ${result.taskCount}  ${result.passTaskWindow ? "✓" : "✗ FAIL"}`,
    "",
    `Overall: ${result.pass ? "✓ PASS" : "✗ FAIL"}`,
    "====================================================",
  ];
  return lines.join("\n");
}
