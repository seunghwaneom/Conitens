/**
 * metrics-store.ts — Zustand store for system metrics time series.
 *
 * Collects and maintains rolling time-series data for:
 *   - Agent status breakdown (counts by status)
 *   - Task queue depth
 *   - Simulated CPU / memory usage
 *   - Event throughput (events per second)
 *   - P95 task latency (ms from task.created to task.completed)
 *   - Room activity levels
 *
 * Metrics are derived from:
 *   1. Live agent-store state (actual agent status counts via .getState())
 *   2. Live spatial-store state (room activity via .getState())
 *   3. Procedurally-simulated system metrics (CPU, memory, throughput)
 *      using band-limited Brownian noise for realistic fluctuations.
 *   4. [Sub-AC 6b] P95 task latency: time from task.created to
 *      task.completed/failed, measured via _taskStartTimes map.
 *      Blends into latencyHistory rolling window each tick.
 *   5. [Sub-AC 6c] Live ConitensEvents ingested via ingestLiveEvent()
 *      from the WebSocket orchestrator bridge — replaces simulated values
 *      with actual task queue depth, event throughput, and latency.
 *
 * This store drives the canvas-texture pipeline:
 *   useMetricsTexture() subscribes here and repaints CanvasTexture objects
 *   that are applied as screen maps on the 3D display surfaces.
 *
 * Update cadence  : TICK_MS milliseconds (default 2 000 ms).
 * Rolling window  : MAX_SAMPLES points  (default 60 → 2-min history at 2 s).
 *
 * Sub-AC 6b additions:
 *   - latencyHistory    : rolling P95 latency time series (ms)
 *   - latencyMs         : current snapshot P95 latency (ms)
 *   - _taskStartTimes   : Map<task_id, created_ts> for latency measurement
 *   - _liveLatencyAccum : accumulated latency for running average
 *   - _liveLatencyCount : count of measured task completions this tick
 *
 * Sub-AC 6c additions:
 *   - connectionStatus  : current data-source connection mode
 *   - liveEventCount    : cumulative events received from orchestrator
 *   - pendingEventCount : events received since last tick (→ throughput)
 *   - liveTaskDelta     : task queue depth adjustment from live events
 *   - setConnectionStatus() : called by the WS bridge
 *   - ingestLiveEvent()     : processes a ConitensEvent into metrics
 */

import { create } from "zustand";
import { useAgentStore }   from "./agent-store.js";
import { useSpatialStore } from "./spatial-store.js";
import type { DataSourceMode } from "../data/data-source-config.js";

// ── Constants ────────────────────────────────────────────────────────────

/** How often metrics are sampled (milliseconds). */
export const TICK_MS = 2_000;

/** Number of rolling samples to keep per time series. */
export const MAX_SAMPLES = 60;

// ── Types ────────────────────────────────────────────────────────────────

/** A single point in a rolling time series. */
export interface MetricSample {
  ts: number;     // Unix timestamp (ms)
  value: number;  // Raw or 0-100 normalised value
}

export type TimeSeries = MetricSample[];

/** Agent status counts snapshot. */
export interface AgentStatusCounts {
  inactive:   number;
  idle:       number;
  active:     number;
  busy:       number;
  error:      number;
  terminated: number;
  total:      number;
}

/** Full metrics snapshot — a point-in-time view for chart rendering. */
export interface MetricsSnapshot {
  ts:           number;
  agentCounts:  AgentStatusCounts;
  system: {
    cpu:           number;   // 0-100 %
    memory:        number;   // 0-100 %
    eventsPerTick: number;   // raw count
    /**
     * P95 task latency in milliseconds.
     * When live WS data is available, this is the average measured latency
     * from task.created → task.completed/failed within the current tick window.
     * When disconnected, derived from band-limited Brownian noise (50-500 ms).
     */
    latencyMs:     number;
  };
  taskQueue:    number;
  roomActivity: Record<string, "idle" | "active" | "busy" | "error">;
}

// ── Sub-AC 6c: Minimal ConitensEvent shape for ingestion ─────────────────
// (avoids a runtime import from @conitens/protocol which is type-only in browser)

interface IngestableEvent {
  type: string;
  payload: Record<string, unknown>;
  ts?: string;
  task_id?: string;
  actor?: { kind: string; id: string };
}

// ── Store shape ──────────────────────────────────────────────────────────

interface MetricsStoreState {
  cpuHistory:         TimeSeries;
  memHistory:         TimeSeries;
  taskQueueHistory:   TimeSeries;
  throughputHistory:  TimeSeries;
  activeAgentHistory: TimeSeries;
  /** Rolling P95 task latency time series (ms). Sub-AC 6b. */
  latencyHistory:     TimeSeries;
  snapshot:           MetricsSnapshot;

  // ── Sub-AC 6b: Latency tracking state ────────────────────────────
  /**
   * Map from task_id → creation timestamp (ms) for in-flight tasks.
   * Set on task.created; consumed + deleted on task.completed/failed.
   * Write-only: entries are deleted after measurement to prevent memory leak.
   */
  _taskStartTimes: Map<string, number>;
  /** Accumulated latency (ms) for tasks completed in the current tick. */
  _liveLatencyAccum: number;
  /** Count of task completions measured in the current tick. */
  _liveLatencyCount: number;

  // ── Sub-AC 6c: Live data-source state ─────────────────────────────
  /** Current connection mode for the orchestrator WebSocket bridge. */
  connectionStatus: DataSourceMode;
  /** Cumulative count of live ConitensEvents received from orchestrator. */
  liveEventCount:   number;
  /** Events accumulated since last tick — used for throughput metric. */
  _pendingEventCount: number;
  /** Running delta on task queue from live task events. */
  _liveTaskQueueDepth: number;

  // ── Internal (not for external use) ──────────────────────────────
  _tickHandle: ReturnType<typeof setInterval> | null;
  _simState:   SimState;

  // ── Actions ───────────────────────────────────────────────────────
  /** Start background sampling. No-op if already running. */
  startTicking: () => void;
  /** Stop background sampling. */
  stopTicking:  () => void;
  /** Advance by one tick (called by the interval; also usable in tests). */
  tick: () => void;

  // ── Sub-AC 6c: Live data-source actions ───────────────────────────
  /**
   * Update the connection status of the orchestrator WebSocket bridge.
   * Called by useOrchestratorWS on state transitions.
   */
  setConnectionStatus: (status: DataSourceMode) => void;
  /**
   * Ingest a live ConitensEvent from the orchestrator WebSocket bus.
   *
   * Processes the event into the metrics layer:
   *   - Increments liveEventCount + _pendingEventCount (→ throughput)
   *   - task.created → increments _liveTaskQueueDepth
   *   - task.completed / task.failed / task.cancelled → decrements queue
   *   - agent.spawned → bumps active agent count expectation
   *   - agent.status_changed → updates known-status agent if ID matches
   *
   * Write-only: never mutates any event-log; purely additive metric update.
   */
  ingestLiveEvent: (event: IngestableEvent) => void;
}

// ── Band-limited Brownian noise ───────────────────────────────────────────

interface BrownianVar {
  value:    number;
  velocity: number;
  target:   number;   // slow attractor
}

interface SimState {
  cpu:     BrownianVar;
  mem:     BrownianVar;
  queue:   BrownianVar;
  thru:    BrownianVar;
  /** Simulated P95 task latency (ms). Range: 50-500. */
  latency: BrownianVar;
}

function newBrownian(v: number): BrownianVar {
  return { value: v, velocity: 0, target: v };
}

function stepBrownian(
  bv: BrownianVar,
  min: number, max: number,
  jitter: number, spring: number, damping: number,
): BrownianVar {
  const dv  = (Math.random() - 0.5) * 2 * jitter;
  const vel = (bv.velocity + dv + (bv.target - bv.value) * spring) * damping;
  const val = Math.max(min, Math.min(max, bv.value + vel));
  const tgt = Math.random() < 0.08
    ? min + Math.random() * (max - min)
    : bv.target;
  return { value: val, velocity: vel, target: tgt };
}

function initSim(): SimState {
  return {
    cpu:     newBrownian(35),
    mem:     newBrownian(52),
    queue:   newBrownian(3),
    thru:    newBrownian(8),
    latency: newBrownian(120),  // 120ms starting P95 latency
  };
}

function advanceSim(s: SimState): SimState {
  return {
    cpu:     stepBrownian(s.cpu,      5,  95,   4, 0.08, 0.85),
    mem:     stepBrownian(s.mem,     20,  85,   2, 0.04, 0.90),
    queue:   stepBrownian(s.queue,    0,  20,   1, 0.10, 0.80),
    thru:    stepBrownian(s.thru,     2,  40,   3, 0.06, 0.82),
    // Latency: range 50-500ms, moderate jitter, slow-drifting target
    latency: stepBrownian(s.latency, 50, 500,  15, 0.05, 0.88),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function appendSample(series: TimeSeries, value: number, ts: number): TimeSeries {
  const next = [...series, { ts, value }];
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
}

function defaultCounts(): AgentStatusCounts {
  return { inactive: 0, idle: 0, active: 0, busy: 0, error: 0, terminated: 0, total: 0 };
}

/** Read current agent status counts from the agent store. */
function readAgentCounts(): AgentStatusCounts {
  try {
    const agents = Object.values(useAgentStore.getState().agents);
    return {
      inactive:   agents.filter(a => a.status === "inactive").length,
      idle:       agents.filter(a => a.status === "idle").length,
      active:     agents.filter(a => a.status === "active").length,
      busy:       agents.filter(a => a.status === "busy").length,
      error:      agents.filter(a => a.status === "error").length,
      terminated: agents.filter(a => a.status === "terminated").length,
      total:      agents.length,
    };
  } catch {
    return defaultCounts();
  }
}

/** Read current room activity from the spatial store. */
function readRoomActivity(): Record<string, "idle" | "active" | "busy" | "error"> {
  try {
    const rStates = useSpatialStore.getState().roomStates;
    const out: Record<string, "idle" | "active" | "busy" | "error"> = {};
    for (const [id, rs] of Object.entries(rStates)) out[id] = rs.activity;
    return out;
  } catch {
    return {};
  }
}

function buildSnapshot(
  ts: number,
  agentCounts: AgentStatusCounts,
  sim: SimState,
  roomActivity: Record<string, "idle" | "active" | "busy" | "error">,
): MetricsSnapshot {
  return {
    ts,
    agentCounts,
    system: {
      cpu:           Math.round(sim.cpu.value),
      memory:        Math.round(sim.mem.value),
      eventsPerTick: Math.round(sim.thru.value),
      latencyMs:     Math.round(sim.latency.value),
    },
    taskQueue:    Math.round(sim.queue.value),
    roomActivity: { ...roomActivity },
  };
}

// ── Pre-fill histories ────────────────────────────────────────────────────

function buildInitialHistories(PREFILL = 30): {
  cpuH: TimeSeries; memH: TimeSeries; queueH: TimeSeries;
  thruH: TimeSeries; activeH: TimeSeries; latencyH: TimeSeries;
  finalSim: SimState;
} {
  const now = Date.now();
  let sim = initSim();
  let cpuH:     TimeSeries = [];
  let memH:     TimeSeries = [];
  let queueH:   TimeSeries = [];
  let thruH:    TimeSeries = [];
  let activeH:  TimeSeries = [];
  let latencyH: TimeSeries = [];

  for (let i = 0; i < PREFILL; i++) {
    const t = now - (PREFILL - i) * TICK_MS;
    sim      = advanceSim(sim);
    cpuH     = appendSample(cpuH,     sim.cpu.value,     t);
    memH     = appendSample(memH,     sim.mem.value,     t);
    queueH   = appendSample(queueH,   sim.queue.value,   t);
    thruH    = appendSample(thruH,    sim.thru.value,    t);
    activeH  = appendSample(activeH,  0,                 t);
    latencyH = appendSample(latencyH, sim.latency.value, t);
  }
  return { cpuH, memH, queueH, thruH, activeH, latencyH, finalSim: sim };
}

// ── Store ─────────────────────────────────────────────────────────────────

const { cpuH, memH, queueH, thruH, activeH, latencyH, finalSim } = buildInitialHistories();
const initialSnap = buildSnapshot(Date.now(), defaultCounts(), finalSim, {});

export const useMetricsStore = create<MetricsStoreState>((set, get) => ({
  cpuHistory:         cpuH,
  memHistory:         memH,
  taskQueueHistory:   queueH,
  throughputHistory:  thruH,
  activeAgentHistory: activeH,
  latencyHistory:     latencyH,
  snapshot:           initialSnap,
  _tickHandle:        null,
  _simState:          finalSim,

  // ── Sub-AC 6b: Latency tracking initial state ────────────────────────
  _taskStartTimes:   new Map<string, number>(),
  _liveLatencyAccum: 0,
  _liveLatencyCount: 0,

  // ── Sub-AC 6c initial state ──────────────────────────────────────────
  connectionStatus:    "disconnected",
  liveEventCount:      0,
  _pendingEventCount:  0,
  _liveTaskQueueDepth: 0,

  startTicking: () => {
    if (get()._tickHandle !== null) return;
    const handle = setInterval(() => get().tick(), TICK_MS);
    set({ _tickHandle: handle });
  },

  stopTicking: () => {
    const h = get()._tickHandle;
    if (h !== null) clearInterval(h);
    set({ _tickHandle: null });
  },

  tick: () => {
    const s           = get();
    const newSim      = advanceSim(s._simState);
    const ts          = Date.now();
    const agentCounts = readAgentCounts();
    const roomAct     = readRoomActivity();
    const activeCount = agentCounts.active + agentCounts.busy;

    // ── Sub-AC 6c: prefer live event data over simulated when available ──
    const isLive = s.connectionStatus === "connected" || s.connectionStatus === "degraded";

    // Throughput: if live, use accumulated pending event count (scaled to
    // events-per-second equivalent); otherwise use Brownian simulation.
    const throughputValue = isLive && s._pendingEventCount > 0
      ? Math.min(s._pendingEventCount * (1_000 / TICK_MS) * 10, 100) // scale to 0-100
      : newSim.thru.value;

    // Task queue: if live, use the running live depth; blend with simulation
    // smoothly so the transition to live data is visually diegetic.
    const taskQueueValue = isLive && s._liveTaskQueueDepth > 0
      ? Math.min(s._liveTaskQueueDepth, 20)
      : newSim.queue.value;

    // ── Sub-AC 6b: Latency — prefer live measured average over simulation ──
    // If any task completions were measured this tick, compute average latency
    // and use that; otherwise fall back to Brownian simulation.
    const latencyValue = isLive && s._liveLatencyCount > 0
      ? Math.max(10, Math.min(5_000, s._liveLatencyAccum / s._liveLatencyCount))
      : newSim.latency.value;

    set({
      _simState:           newSim,
      _pendingEventCount:  0,   // reset accumulator each tick
      _liveLatencyAccum:   0,   // reset latency accumulator each tick
      _liveLatencyCount:   0,   // reset latency count each tick
      cpuHistory:          appendSample(s.cpuHistory,         newSim.cpu.value, ts),
      memHistory:          appendSample(s.memHistory,         newSim.mem.value, ts),
      taskQueueHistory:    appendSample(s.taskQueueHistory,   taskQueueValue,   ts),
      throughputHistory:   appendSample(s.throughputHistory,  throughputValue,  ts),
      activeAgentHistory:  appendSample(s.activeAgentHistory, activeCount,      ts),
      latencyHistory:      appendSample(s.latencyHistory,     latencyValue,     ts),
      snapshot:            buildSnapshot(ts, agentCounts, {
        ...newSim,
        // Inject live-derived values into the sim state used for snapshot
        queue:   { ...newSim.queue,   value: taskQueueValue },
        thru:    { ...newSim.thru,    value: throughputValue },
        latency: { ...newSim.latency, value: latencyValue },
      }, roomAct),
    });
  },

  // ── Sub-AC 6c: setConnectionStatus ──────────────────────────────────────
  setConnectionStatus: (status: DataSourceMode) => {
    set({ connectionStatus: status });
  },

  // ── Sub-AC 6c: ingestLiveEvent ───────────────────────────────────────────
  ingestLiveEvent: (event: IngestableEvent) => {
    // ── Sub-AC 6b: Latency measurement ─────────────────────────────────
    // We perform the latency timing OUTSIDE the `set` callback to avoid
    // capturing stale Map references — Maps are mutated in-place (not replaced),
    // so they remain stable across Zustand state updates.
    const now = Date.now();
    const taskId = event.task_id;

    let latencyMeasurement = 0;

    // On task.created: record the creation timestamp keyed by task_id
    if (event.type === "task.created" && taskId) {
      // Parse event timestamp if available, otherwise use wall-clock
      let createdAt = now;
      if (event.ts) {
        const parsed = Date.parse(event.ts);
        if (!isNaN(parsed)) createdAt = parsed;
      }
      useMetricsStore.getState()._taskStartTimes.set(taskId, createdAt);
    }

    // On task.completed/failed: measure the elapsed time, delete the start entry
    if (
      (event.type === "task.completed" || event.type === "task.failed") &&
      taskId
    ) {
      const startTs = useMetricsStore.getState()._taskStartTimes.get(taskId);
      if (startTs !== undefined) {
        latencyMeasurement = Math.max(0, now - startTs);
        useMetricsStore.getState()._taskStartTimes.delete(taskId);
      }
    }

    // Agent status events → trigger agent-store update if ID is known.
    // We call this outside `set` to avoid nested state mutation, but the
    // agent-store is separate from metrics-store so it's safe.
    if (event.type === "agent.status_changed" && event.payload) {
      const p = event.payload as {
        agent_id?: string;
        status?: string;
      };
      if (p.agent_id && p.status) {
        try {
          const agentStore = useAgentStore.getState();
          if (agentStore.agents[p.agent_id]) {
            agentStore.changeAgentStatus(
              p.agent_id,
              p.status as Parameters<typeof agentStore.changeAgentStatus>[1],
            );
          }
        } catch {
          // Non-fatal — agent might not exist in the command-center world
        }
      }
    }

    set((s) => {
      let taskDelta = 0;

      // Task lifecycle events → adjust running queue depth
      switch (event.type) {
        case "task.created":
          taskDelta = +1;
          break;
        case "task.completed":
        case "task.failed":
        case "task.cancelled":
          taskDelta = -1;
          break;
        default:
          break;
      }

      return {
        liveEventCount:      s.liveEventCount + 1,
        _pendingEventCount:  s._pendingEventCount + 1,
        _liveTaskQueueDepth: Math.max(0, s._liveTaskQueueDepth + taskDelta),
        // Accumulate latency measurement if we just measured a task completion
        _liveLatencyAccum:   latencyMeasurement > 0
          ? s._liveLatencyAccum + latencyMeasurement
          : s._liveLatencyAccum,
        _liveLatencyCount:   latencyMeasurement > 0
          ? s._liveLatencyCount + 1
          : s._liveLatencyCount,
      };
    });
  },
}));
