/**
 * use-control-plane-metrics.ts — Per-entity live metrics polling hook.
 *
 * Sub-AC 7c: Real-time status & metrics overlay
 *
 * Polls the control-plane HTTP API for per-agent or per-room metrics.
 * Falls back gracefully to metrics-store global + agent-store derived data
 * when the API is unavailable (network error, 4xx/5xx, timeout).
 *
 * API contract (expected REST endpoints):
 *   GET /api/agents/{agentId}/metrics  → AgentMetricsPayload
 *   GET /api/rooms/{roomId}/metrics    → RoomMetricsPayload
 *
 * The base URL is resolved from the VITE_API_BASE_URL environment variable
 * (set in packages/command-center/.env). Falls back to http://localhost:8080
 * which collocates with the orchestrator WebSocket bus.
 *
 * Fallback derivation when API is offline:
 *   - cpu    : metrics-store snapshot.system.cpu
 *   - memory : metrics-store snapshot.system.memory
 *   - queue  : for agents — 1 when active/busy, 0 otherwise
 *              for rooms  — metrics-store snapshot.taskQueue (global)
 *   - health : for agents — derived from agent.status
 *              for rooms  — degraded when cpu > 80, else healthy
 *
 * Poll cadence: pollMs parameter (default 2 000 ms = TICK_MS).
 *
 * Write-only principle: this hook never sends data upstream. All API calls
 * are read-only (GET). Telemetry is kept separate from EventLog per design.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMetricsStore } from "../store/metrics-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Control-plane HTTP API base URL ──────────────────────────────────────────
//
// Resolved at Vite build time from VITE_API_BASE_URL.
// Must use VITE_- prefix so Vite inlines it — never use process.env here.
// The OR fallback is never reached at runtime but satisfies TypeScript and
// test environments that don't provide the Vite env shim.

const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta.env as Record<string, unknown>)?.VITE_API_BASE_URL) as string ||
  "http://localhost:8080";

/** Default poll cadence — matches global metrics TICK_MS. */
export const DEFAULT_POLL_MS = 2_000;

// ── Types ────────────────────────────────────────────────────────────────────

/** Normalised health category. */
export type HealthStatus = "healthy" | "degraded" | "error" | "unknown";

/** Visual colour for each health status — dark command-center palette. */
export const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy:  "#00ff88",
  degraded: "#ffaa00",
  error:    "#ff4444",
  unknown:  "#555577",
};

/** Live metrics for a single entity (agent or room). */
export interface EntityMetrics {
  /** CPU utilisation, 0-100 %. */
  cpu:       number;
  /** Memory utilisation, 0-100 %. */
  memory:    number;
  /** Pending task count for this entity. */
  taskQueue: number;
  /** Health category derived from status or API response. */
  health:    HealthStatus;
  /**
   * Whether these values came from the live control-plane API (true) or
   * were derived from metrics-store fallback data (false).
   */
  isLive:    boolean;
}

/** Placeholder used while first fetch is in flight. */
const LOADING_METRICS: EntityMetrics = {
  cpu: 0, memory: 0, taskQueue: 0, health: "unknown", isLive: false,
};

// ── Raw API response shapes ───────────────────────────────────────────────────

interface AgentMetricsPayload {
  cpu?:       number;
  memory?:    number;
  taskQueue?: number;
  health?:    string;
}

interface RoomMetricsPayload {
  cpu?:        number;
  memory?:     number;
  taskQueue?:  number;
  health?:     string;
  agentCount?: number;
}

// ── Helper: string → HealthStatus ────────────────────────────────────────────

function toHealth(raw: string | undefined): HealthStatus {
  switch (raw) {
    case "healthy":  return "healthy";
    case "degraded": return "degraded";
    case "error":    return "error";
    default:         return "unknown";
  }
}

/** Derive health from agent status when API is offline. */
function agentStatusToHealth(status: string): HealthStatus {
  switch (status) {
    case "active":
    case "idle":
    case "busy":
      return "healthy";
    case "error":
      return "error";
    case "inactive":
    case "terminated":
      return "unknown";
    default:
      return "unknown";
  }
}

// ── Main hook ────────────────────────────────────────────────────────────────

/**
 * useControlPlaneMetrics — polls the control-plane HTTP API for per-entity
 * live metrics and falls back to store-derived data when unavailable.
 *
 * @param entityId   - agent ID or room ID to fetch metrics for
 * @param entityType - "agent" | "room"
 * @param pollMs     - polling interval in ms (default 2 000)
 *
 * @returns EntityMetrics snapshot, updated at the poll cadence
 */
export function useControlPlaneMetrics(
  entityId: string,
  entityType: "agent" | "room",
  pollMs: number = DEFAULT_POLL_MS,
): EntityMetrics {
  const [metrics, setMetrics] = useState<EntityMetrics>(LOADING_METRICS);

  // Stable refs — no re-renders needed for internal bookkeeping
  const mountedRef   = useRef(true);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to relevant store slices (stable Zustand selectors)
  const snapshot = useMetricsStore((s) => s.snapshot);
  const agent    = useAgentStore((s) =>
    entityType === "agent" ? s.agents[entityId] : null,
  );

  // ── Build fallback metrics from store data ───────────────────────────────

  const buildFallback = useCallback((): EntityMetrics => {
    const cpu    = snapshot.system.cpu;
    const memory = snapshot.system.memory;

    if (entityType === "agent" && agent) {
      return {
        cpu,
        memory,
        taskQueue: (agent.status === "active" || agent.status === "busy") ? 1 : 0,
        health:    agentStatusToHealth(agent.status),
        isLive:    false,
      };
    }

    // Room fallback: use global metrics with rough health heuristic
    return {
      cpu,
      memory,
      taskQueue: snapshot.taskQueue,
      health:    cpu > 80 ? "degraded" : "healthy",
      isLive:    false,
    };
  }, [snapshot, agent, entityType]);

  // ── Fetch from control-plane API ─────────────────────────────────────────

  const fetchMetrics = useCallback(async (): Promise<void> => {
    const path = entityType === "agent"
      ? `/api/agents/${encodeURIComponent(entityId)}/metrics`
      : `/api/rooms/${encodeURIComponent(entityId)}/metrics`;

    const url = `${API_BASE}${path}`;

    let raw: AgentMetricsPayload | RoomMetricsPayload | null = null;

    try {
      // AbortSignal.timeout is safe in modern browsers; polyfill not needed
      // for a localhost dev tool. 3 s is conservative for local HTTP.
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
        headers: { Accept: "application/json" },
      });

      if (!resp.ok) {
        // Non-2xx — use fallback silently (endpoint may not be implemented yet)
        raw = null;
      } else {
        raw = (await resp.json()) as AgentMetricsPayload;
      }
    } catch {
      // Network error or timeout — fall back to store data
      raw = null;
    }

    if (!mountedRef.current) return;

    if (raw === null) {
      setMetrics(buildFallback());
      return;
    }

    setMetrics({
      cpu:       typeof raw.cpu      === "number" ? Math.min(100, Math.max(0, raw.cpu))      : snapshot.system.cpu,
      memory:    typeof raw.memory   === "number" ? Math.min(100, Math.max(0, raw.memory))   : snapshot.system.memory,
      taskQueue: typeof raw.taskQueue === "number" ? Math.max(0, raw.taskQueue)               : snapshot.taskQueue,
      health:    toHealth(raw.health),
      isLive:    true,
    });
  }, [entityId, entityType, snapshot, buildFallback]);

  // ── Polling lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    // Run immediately on mount for low-latency first paint
    void fetchMetrics();

    // Schedule recurring polls
    timerRef.current = setInterval(() => {
      void fetchMetrics();
    }, pollMs);

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // fetchMetrics changes when snapshot changes — that causes a re-poll on
    // every metrics tick, which is intentional (fresh fallback data each tick).
  }, [fetchMetrics, pollMs]);

  return metrics;
}
