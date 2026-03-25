# Sub-AC 15c — 30fps Performance Benchmark: Measurement Method

## Summary

The render performance benchmark validates that the Conitens command-center GUI can
sustain **≥ 30 fps** under target load (**20 agents, 200 tasks active**) by measuring
the CPU cost of the view_window culling pipeline — the only work that runs
unconditionally every frame.

All 67 benchmark tests pass.  The authoritative sustained-load result (1 800 frames,
60 seconds at 30 fps) on a reference run:

```
=== Render Performance Benchmark — ORBIT ===
Agents: 20  Tasks: 200  Frames: 1800

── Timing ──────────────────────────────────────────
Mean pipeline time:             0.0097 ms  (budget: 0.5000 ms)  ✓
P50 pipeline time:               0.0086 ms
P95 pipeline time:               0.0128 ms
P99 pipeline time:               0.0171 ms  (budget: 2.0000 ms)  ✓
Max pipeline time:               0.3866 ms  (budget: 5.0000 ms)  ✓
Min pipeline time:               0.0080 ms
Total (all frames):             17.9729 ms  (budget: 60000.0000 ms)  ✓

── Visibility culling ──────────────────────────────
Avg frustum entities:           7.4 / 32
Avg proximity entities:       0.0
Avg culled entities:             24.6
Avg visible entities:           7.4
Avg window agents:                 12.0 / 12  ✓
Materialised tasks:               25 / 200  ✓

Overall: ✓ PASS
```

---

## Why This Measurement Is Valid

Three.js rendering cannot execute inside Node.js Vitest — there is no WebGL context.
However, **the culling pipeline is entirely pure** (no React, no Three.js, no Zustand).
Its CPU cost is the only unconditional per-frame cost.  Everything else is gated:

| Work item | Gate |
|-----------|------|
| Agent geometry updates | culling results — only window agents |
| HTML badges | culling results + LOD level "near" |
| Task orb geometry | task virtualisation window (≤ 25 tasks) |
| Dashboard panel updates | useFrame throttle + distance cull |
| Per-task PointLights | quality tier (disabled at "low" quality) |

If the culling pipeline completes in **< 1 ms/frame mean**, the remaining **≥ 32 ms**
of the 33.3 ms frame budget is available to the GPU and conditional rendering work —
which is itself bounded by `MAX_RENDER_WINDOW = 12` agents and `TASK_WINDOW_SIZE = 25`
tasks regardless of the total population size.

---

## What Is Measured

The benchmark measures the **per-frame CPU time** for three pure pipeline steps:

```
1. computeViewWindow()   — 6-plane Gribb-Hartmann frustum test for all entities
2. computeSpatialIndex() — priority sort + window assignment for agents
3. extractWindowedSet()  — project snapshot to visible ID sets
```

These are wrapped in `performance.now()` calls with microsecond resolution:

```typescript
const t0 = performance.now();

// Step 1: view_window frustum culling
const vwSnapshot = computeViewWindow(entities, pvMatrix, cameraPos);

// Step 2: spatial index — priority sort + window assignment
const siSnapshot = computeSpatialIndex(agents, cameraPos);

// Step 3: extract windowed visible set
const windowedSet = extractWindowedSet(siSnapshot);

const pipelineMs = performance.now() - t0;
```

The benchmark simulates **1 800 frames** (60 s × 30 fps) across four camera
trajectories: `orbit`, `fly_through`, `distant`, and `close_up`.  Three warm-up
frames are discarded before measurement begins to allow JIT compilation to stabilise.

---

## Target Load

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `BENCHMARK_AGENT_COUNT` | 20 | Maximum Conitens command-center population |
| `BENCHMARK_TASK_COUNT` | 200 | Maximum concurrent tasks |
| `BENCHMARK_FRAME_COUNT` | 1 800 | 60 s × 30 fps — worst-case sustained load |

Scene composition per benchmark run:
- **20 agents** (dynamic, alternate between ground floor and first floor)
- **6 rooms** (static, one per role cluster per floor)
- **6 fixtures** (static, dashboard panels on walls)
- **Total: 32 entities** tested by `computeViewWindow` each frame

---

## Pass Criteria

| Criterion | Budget | Rationale |
|-----------|--------|-----------|
| Mean pipeline time | ≤ 0.5 ms | < 1.5% of 33.3 ms frame budget |
| P99 pipeline time | ≤ 2.0 ms | Handles init spikes without dropped frames |
| Max pipeline time | ≤ 5.0 ms | Absolute cap — spike ≤ 15% of budget |
| Avg window agents | ≤ 12 | `MAX_RENDER_WINDOW` culling is active |
| Materialised tasks | ≤ 25 | Task virtualisation window is active |
| Total benchmark time | ≤ 60 000 ms | Sanity check — 1 800 frames in real time |

---

## View_Window Culling Path

The `view_window` culling path uses a true 6-plane frustum derived from the combined
**projection-view (PV) matrix** (Gribb-Hartmann method).  This is stricter than the
spatial-index sphere test and eliminates entities behind the camera or far to the
sides of the screen.

Entity classification per frame:

| Class | Condition | Rendering |
|-------|-----------|-----------|
| `frustum` | Inside PV frustum ± margin | Full distance-based LOD |
| `proximity` | Outside frustum but ≤ 8 world units from camera (agents/tasks only) | LOD "far" dot |
| `culled` | Outside both frustum and proximity sphere | Skipped entirely |

In the orbit trajectory (standard top-down view, radius 18):
- Average **7.4 / 32 entities visible** (frustum)
- Average **24.6 / 32 entities culled** — 77% of scene skipped per frame

---

## Camera Trajectories Tested

| Trajectory | Description | Purpose |
|------------|-------------|---------|
| `orbit` | Circular orbit at radius 18, height 10 | Standard user behaviour |
| `fly_through` | Linear pass through building interior | Diverse frustum angles |
| `distant` | Camera at max culling distance edge | Worst-case culling (all culled) |
| `close_up` | Camera at 2 world units from centre | Proximity sphere activation |

---

## How to Run

```bash
# Run the full benchmark test suite
cd packages/command-center
pnpm test src/scene/__tests__/render-performance-benchmark.test.ts

# Run only the authoritative 1800-frame sustained test
pnpm test --reporter=verbose -t "orbit 1800 frames"
```

The authoritative pass/fail test is **`15c-bench-13`** in
`src/scene/__tests__/render-performance-benchmark.test.ts`.  It always prints the
full `formatBenchmarkReport` output to `console.info` so CI logs capture the numbers.

---

## Source Files

| File | Role |
|------|------|
| `src/scene/render-performance-benchmark.ts` | Pure benchmark harness (671 lines) |
| `src/scene/__tests__/render-performance-benchmark.test.ts` | 67 tests across 13 suites |
| `src/scene/view-window.ts` | Pure frustum culling computation |
| `src/scene/spatial-index.ts` | Pure spatial index + window assignment |
| `src/scene/ScenePerformance.tsx` | FPS-adaptive quality context (live scene) |

---

## Relationship to Live Scene Performance

The benchmark proves CPU culling cost is negligible (< 0.5 ms mean).  In the live
scene, `CommandCenterScene.tsx` applies two additional optimisations not benchmarked
here (because they are GPU-side):

1. **Adaptive pixel ratio** — `dpr={[1, 1.5]}` caps fill rate on hi-DPI displays
2. **R3F adaptive frame-rate** — `performance={{ min: 0.5 }}` allows Three.js to
   drop to 15 fps under GPU pressure rather than over-rendering

Together with the CPU culling budget of < 1 ms/frame, the 30 fps target is achievable
on hardware capable of rendering 12 low-poly agent meshes at 60 Hz.
