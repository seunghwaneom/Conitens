/**
 * use-metrics-binding.ts — Data binding layer for diegetic metric display objects.
 *
 * Sub-AC 6b: Implement data binding layer that pipes live agent/system metrics
 * (status, throughput, error rates, uptime) into the diegetic display objects
 * with reactive updates.
 *
 * ─── Responsibility ───────────────────────────────────────────────────────────
 *
 * This hook is the **single stable interface** between the raw metrics-store /
 * agent-store data sources and every diegetic display object in the scene.
 *
 * Display objects should consume `useMetricsBinding()` instead of reading
 * multiple stores directly, so that:
 *   - Derived metrics (error rate, uptime, health label) are computed once
 *   - Reactive update batching keeps re-renders minimal
 *   - New metrics can be added here without touching display components
 *
 * ─── Metrics provided ─────────────────────────────────────────────────────────
 *
 *   AGENT STATUS      — live agent counts per status category (active, busy, …)
 *   THROUGHPUT        — events/tick from metrics-store (live WS or Brownian sim)
 *   ERROR RATE        — (errorAgents / totalAgents) × 100, 0-100 %
 *   LATENCY           — P95 task latency in ms (live measured or Brownian sim)
 *   UPTIME            — wall-clock seconds since the hook was first mounted
 *   SYSTEM HEALTH     — derived health label ("healthy" / "degraded" / "error" / "idle")
 *   CPU / MEMORY      — 0-100 % system utilisation
 *   TASK QUEUE        — pending task count
 *   CONNECTION STATUS — data-source mode ("connected", "disconnected", …)
 *   IS LIVE           — true if data originates from the live orchestrator WS
 *
 * ─── Per-entity overrides ─────────────────────────────────────────────────────
 *
 * An optional `entityId` + `entityType` ("agent" | "room") parameter causes the
 * hook to also compute entity-scoped metrics (using the agent-store for agents,
 * spatial-store for rooms).  When provided, `entityHealth` and `entityQueue` are
 * populated; otherwise they mirror the system-level values.
 *
 * ─── Reactivity model ─────────────────────────────────────────────────────────
 *
 * The hook subscribes to two Zustand slices:
 *   1. useMetricsStore(s => s.snapshot)   — refreshed every TICK_MS (2 s)
 *   2. useMetricsStore(s => s.connectionStatus)
 *
 * For uptime, a setInterval ticks every UPTIME_TICK_MS (5 s) — coarse enough
 * to avoid excess re-renders, fine enough for a visible uptime counter.
 *
 * Write-only principle: this hook never writes to any store. It only reads.
 */

import { useState, useEffect, useMemo } from "react";
import { useMetricsStore }  from "../store/metrics-store.js";
import { useAgentStore }    from "../store/agent-store.js";
import { useSpatialStore }  from "../store/spatial-store.js";
import type { DataSourceMode } from "../data/data-source-config.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** How often the uptime counter re-renders (ms). Coarse to limit re-render cost. */
export const UPTIME_TICK_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Normalised health category shared by system and entity scopes. */
export type MetricHealth = "healthy" | "degraded" | "error" | "idle" | "unknown";

/** Snapshot of agent counts across all status categories. */
export interface AgentStatusSnapshot {
  active:     number;
  busy:       number;
  idle:       number;
  inactive:   number;
  error:      number;
  terminated: number;
  total:      number;
}

/**
 * Complete reactive metrics binding for diegetic display objects.
 *
 * All numeric metrics are normalised to sensible display ranges — no
 * consumer needs to apply additional clamping or conversion.
 */
export interface MetricsBinding {
  // ── Agent status ──────────────────────────────────────────────────────
  /** Live count snapshot for all agent status categories. */
  agentStatus:        AgentStatusSnapshot;

  // ── System metrics ────────────────────────────────────────────────────
  /** CPU utilisation, 0–100 %. */
  cpu:                number;
  /** Memory utilisation, 0–100 %. */
  memory:             number;

  // ── Throughput ────────────────────────────────────────────────────────
  /**
   * Raw events-per-tick count from the metrics snapshot.
   * Mapped from Brownian simulation or live WS event counts.
   */
  throughputRaw:      number;
  /**
   * Throughput normalised to 0–100 for visual gauge display.
   * Scale: 20 events/tick = 100 %.
   */
  throughputPct:      number;

  // ── Error rate ────────────────────────────────────────────────────────
  /**
   * Agent error rate: (errorAgents / totalAgents) × 100.
   * Returns 0 when totalAgents === 0.
   * Range: 0–100 %.
   */
  errorRate:          number;

  // ── Latency ───────────────────────────────────────────────────────────
  /**
   * P95 task latency in milliseconds.
   * When live WS data is available: average measured ms from task.created
   * to task.completed/failed within the last tick window.
   * When disconnected: Brownian-noise simulation (50–500 ms range).
   */
  latencyMs:          number;
  /**
   * Latency normalised to 0–100 for visual gauge display.
   * Scale: LATENCY_SCALE ms = 100 %.  Values above LATENCY_SCALE are clamped.
   */
  latencyPct:         number;

  // ── Task queue ────────────────────────────────────────────────────────
  /** Current task queue depth (raw count, not normalised). */
  taskQueueDepth:     number;
  /**
   * Task queue normalised to 0–100 for gauges.
   * Scale: 20 tasks = 100 %.
   */
  taskQueuePct:       number;

  // ── Uptime ────────────────────────────────────────────────────────────
  /** Wall-clock seconds since the hook was first mounted. */
  uptimeSeconds:      number;
  /**
   * Human-readable uptime string, e.g. "2h 34m" or "45s".
   * Updated every UPTIME_TICK_MS (5 s).
   */
  uptimeLabel:        string;

  // ── System health ─────────────────────────────────────────────────────
  /** Aggregate system health derived from errors, CPU, memory, active agents. */
  systemHealth:       MetricHealth;

  // ── Data-source info ──────────────────────────────────────────────────
  /** Current WebSocket / data-source connection mode. */
  connectionStatus:   DataSourceMode;
  /**
   * true when data originates from the live orchestrator WS bus.
   * false during Brownian-noise simulation (WS offline).
   */
  isLive:             boolean;

  // ── Per-entity metrics (populated when entityId/entityType provided) ──
  /** Entity-scoped health (falls back to systemHealth if no entity given). */
  entityHealth:       MetricHealth;
  /**
   * Entity-scoped task queue count.
   * For agents: 1 if active/busy, 0 otherwise.
   * For rooms: same as taskQueueDepth.
   * Falls back to taskQueueDepth if no entity given.
   */
  entityQueue:        number;
  /**
   * Entity-scoped active agent count.
   * For rooms: number of agents currently assigned to the room.
   * For agents: always 1.
   * Falls back to agentStatus.active + agentStatus.busy if no entity given.
   */
  entityAgentCount:   number;
}

// ── Public hook options ───────────────────────────────────────────────────────

export interface MetricsBindingOptions {
  /**
   * Optional entity ID (agent ID or room ID).
   * When provided, entity-scoped metrics are populated.
   */
  entityId?:   string;
  /** Entity type — required when entityId is provided. */
  entityType?: "agent" | "room";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Derive the aggregate system health label from metrics.
 * Priority order: error > degraded > healthy > idle.
 */
export function deriveSystemHealth(
  errorCount:  number,
  cpu:         number,
  memory:      number,
  activeCount: number,
  busyCount:   number,
): MetricHealth {
  if (errorCount > 0)                    return "error";
  if (cpu > 80 || memory > 80)           return "degraded";
  if (activeCount + busyCount > 0)       return "healthy";
  return "idle";
}

/**
 * Compute error rate from agent status counts.
 * Returns a 0-100 value representing error agents as a percentage of total.
 */
export function computeErrorRate(
  errorCount: number,
  total:      number,
): number {
  if (total === 0) return 0;
  return Math.min(100, (errorCount / total) * 100);
}

/**
 * Normalise throughput to a 0-100 gauge value.
 * Scale: THROUGHPUT_SCALE events/tick maps to 100 %.
 */
export const THROUGHPUT_SCALE = 20; // events/tick = 100 %

export function normaliseThroughput(raw: number): number {
  return Math.min(100, Math.max(0, (raw / THROUGHPUT_SCALE) * 100));
}

/**
 * Normalise task queue depth to a 0-100 gauge value.
 * Scale: TASK_QUEUE_SCALE tasks = 100 %.
 */
export const TASK_QUEUE_SCALE = 20; // tasks = 100 %

export function normaliseTaskQueue(depth: number): number {
  return Math.min(100, Math.max(0, (depth / TASK_QUEUE_SCALE) * 100));
}

/**
 * Normalise task latency (ms) to a 0-100 gauge value.
 * Scale: LATENCY_SCALE ms maps to 100 %.
 *
 * Threshold selection rationale:
 *   Sub-second latency (< 200 ms) → minimal gauge fill
 *   1 second (1 000 ms)           → ~50 % fill — noticeable but not alarming
 *   2 seconds (2 000 ms = 100 %)  → fully filled, operator attention warranted
 */
export const LATENCY_SCALE = 2_000; // 2 000 ms = 100 %

export function normaliseLatency(ms: number): number {
  return Math.min(100, Math.max(0, (ms / LATENCY_SCALE) * 100));
}

/**
 * Format an uptime duration in seconds to a human-readable string.
 * Examples: "12s", "3m 04s", "2h 34m", "1d 03h"
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  const mins  = Math.floor(seconds / 60);
  const secs  = Math.floor(seconds % 60);
  if (mins < 60) {
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
  }
  const hours = Math.floor(mins / 60);
  const remM  = mins % 60;
  if (hours < 24) {
    return `${hours}h ${String(remM).padStart(2, "0")}m`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${String(remH).padStart(2, "0")}h`;
}

// ── Entity-scoped helpers ─────────────────────────────────────────────────────

/**
 * Derive per-agent health from agent status string.
 */
export function agentStatusToHealth(status: string): MetricHealth {
  switch (status) {
    case "active":
    case "busy":
      return "healthy";
    case "idle":
      return "idle";
    case "error":
      return "error";
    case "inactive":
    case "terminated":
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * Derive per-room health from room activity + CPU heuristic.
 */
export function roomActivityToHealth(
  activity: string,
  cpu: number,
): MetricHealth {
  switch (activity) {
    case "error":  return "error";
    case "busy":   return cpu > 75 ? "degraded" : "healthy";
    case "active": return "healthy";
    case "idle":   return "idle";
    default:       return "unknown";
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useMetricsBinding — data binding layer for diegetic metric display objects.
 *
 * Returns a stable `MetricsBinding` object updated reactively when the
 * metrics-store ticks or the connection status changes.
 *
 * @param options  Optional entity scope (agentId / roomId for per-entity metrics).
 *
 * @returns MetricsBinding snapshot reflecting current system and entity state.
 *
 * @example
 *   // System-level binding (for HolographicPanel, StatusPillar, etc.)
 *   const binding = useMetricsBinding();
 *
 * @example
 *   // Entity-scoped binding (for AgentAvatar, RoomGeometry overlays)
 *   const binding = useMetricsBinding({ entityId: agentId, entityType: "agent" });
 */
export function useMetricsBinding(options: MetricsBindingOptions = {}): MetricsBinding {
  const { entityId, entityType } = options;

  // ── Store subscriptions (reactive) ───────────────────────────────────

  const snapshot          = useMetricsStore((s) => s.snapshot);
  const connectionStatus  = useMetricsStore((s) => s.connectionStatus);

  // Per-entity store reads (only when entity is specified)
  const agentState = useAgentStore((s) =>
    entityId && entityType === "agent" ? s.agents[entityId] ?? null : null,
  );

  const roomState = useSpatialStore((s) =>
    entityId && entityType === "room" ? s.getRoomState(entityId) : null,
  );

  const roomAgentCount = useAgentStore((s) => {
    if (!entityId || entityType !== "room") return 0;
    return Object.values(s.agents).filter((a) => a.roomId === entityId).length;
  });

  // ── Uptime counter ────────────────────────────────────────────────────

  // mountTs is stable across re-renders — captured in state once on mount.
  const [mountTs]     = useState<number>(() => Date.now());
  const [uptimeSecs, setUptimeSecs] = useState<number>(0);

  useEffect(() => {
    // Initial value
    setUptimeSecs((Date.now() - mountTs) / 1_000);

    const id = setInterval(() => {
      setUptimeSecs((Date.now() - mountTs) / 1_000);
    }, UPTIME_TICK_MS);

    return () => clearInterval(id);
  }, [mountTs]);

  // ── Derived system metrics ────────────────────────────────────────────

  const { agentCounts, system, taskQueue } = snapshot;
  const cpu      = system.cpu;
  const memory   = system.memory;
  const thruRaw  = system.eventsPerTick;
  const latency  = system.latencyMs;

  const errorRate     = useMemo(() => computeErrorRate(agentCounts.error, agentCounts.total), [agentCounts]);
  const throughputPct = useMemo(() => normaliseThroughput(thruRaw), [thruRaw]);
  const taskQueuePct  = useMemo(() => normaliseTaskQueue(taskQueue), [taskQueue]);
  const latencyPct    = useMemo(() => normaliseLatency(latency), [latency]);
  const systemHealth  = useMemo(
    () => deriveSystemHealth(agentCounts.error, cpu, memory, agentCounts.active, agentCounts.busy),
    [agentCounts, cpu, memory],
  );

  const uptimeLabel = useMemo(() => formatUptime(uptimeSecs), [uptimeSecs]);
  const isLive      = connectionStatus === "connected" || connectionStatus === "degraded";

  // ── Entity-scoped metrics ─────────────────────────────────────────────

  const entityHealth = useMemo<MetricHealth>(() => {
    if (entityId && entityType === "agent" && agentState) {
      return agentStatusToHealth(agentState.status);
    }
    if (entityId && entityType === "room" && roomState) {
      return roomActivityToHealth(roomState.activity, cpu);
    }
    return systemHealth;
  }, [entityId, entityType, agentState, roomState, cpu, systemHealth]);

  const entityQueue = useMemo<number>(() => {
    if (entityId && entityType === "agent" && agentState) {
      return agentState.status === "active" || agentState.status === "busy" ? 1 : 0;
    }
    if (entityId && entityType === "room") {
      return taskQueue;
    }
    return taskQueue;
  }, [entityId, entityType, agentState, taskQueue]);

  const entityAgentCount = useMemo<number>(() => {
    if (entityId && entityType === "agent") return 1;
    if (entityId && entityType === "room") return roomAgentCount;
    return agentCounts.active + agentCounts.busy;
  }, [entityId, entityType, roomAgentCount, agentCounts]);

  // ── Assemble binding ──────────────────────────────────────────────────

  return useMemo<MetricsBinding>(
    () => ({
      agentStatus: {
        active:     agentCounts.active,
        busy:       agentCounts.busy,
        idle:       agentCounts.idle,
        inactive:   agentCounts.inactive,
        error:      agentCounts.error,
        terminated: agentCounts.terminated,
        total:      agentCounts.total,
      },
      cpu,
      memory,
      throughputRaw:    thruRaw,
      throughputPct,
      errorRate,
      latencyMs:        latency,
      latencyPct,
      taskQueueDepth:   taskQueue,
      taskQueuePct,
      uptimeSeconds:    uptimeSecs,
      uptimeLabel,
      systemHealth,
      connectionStatus,
      isLive,
      entityHealth,
      entityQueue,
      entityAgentCount,
    }),
    // Rebuild only when any of these values change — Zustand selectors ensure
    // these are new references only when the underlying data actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      agentCounts, cpu, memory, thruRaw, throughputPct,
      errorRate, latency, latencyPct,
      taskQueue, taskQueuePct,
      uptimeSecs, uptimeLabel,
      systemHealth, connectionStatus, isLive,
      entityHealth, entityQueue, entityAgentCount,
    ],
  );
}

// ── Selector helpers for non-React contexts ───────────────────────────────────

/**
 * getMetricsBindingSnapshot — synchronous read of current metrics binding
 * state without React hooks.  Useful for canvas-chart draw functions and
 * imperative code paths.
 *
 * Does NOT track uptime (returns 0) — use `useMetricsBinding()` in React
 * components for live uptime.
 *
 * @returns a MetricsBinding-compatible object from the current store state.
 */
export function getMetricsBindingSnapshot(): Omit<MetricsBinding, "uptimeSeconds" | "uptimeLabel"> & {
  uptimeSeconds: 0;
  uptimeLabel: string;
} {
  const { snapshot, connectionStatus } = useMetricsStore.getState();
  const { agentCounts, system, taskQueue } = snapshot;
  const cpu      = system.cpu;
  const memory   = system.memory;
  const thruRaw  = system.eventsPerTick;
  const latency  = system.latencyMs;

  const errorRate     = computeErrorRate(agentCounts.error, agentCounts.total);
  const throughputPct = normaliseThroughput(thruRaw);
  const taskQueuePct  = normaliseTaskQueue(taskQueue);
  const latencyPct    = normaliseLatency(latency);
  const systemHealth  = deriveSystemHealth(
    agentCounts.error, cpu, memory, agentCounts.active, agentCounts.busy,
  );
  const isLive = connectionStatus === "connected" || connectionStatus === "degraded";

  return {
    agentStatus: {
      active:     agentCounts.active,
      busy:       agentCounts.busy,
      idle:       agentCounts.idle,
      inactive:   agentCounts.inactive,
      error:      agentCounts.error,
      terminated: agentCounts.terminated,
      total:      agentCounts.total,
    },
    cpu,
    memory,
    throughputRaw:    thruRaw,
    throughputPct,
    errorRate,
    latencyMs:        latency,
    latencyPct,
    taskQueueDepth:   taskQueue,
    taskQueuePct,
    uptimeSeconds:    0,
    uptimeLabel:      "—",
    systemHealth,
    connectionStatus,
    isLive,
    entityHealth:     systemHealth,
    entityQueue:      taskQueue,
    entityAgentCount: agentCounts.active + agentCounts.busy,
  };
}
