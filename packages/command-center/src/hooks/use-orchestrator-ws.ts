/**
 * use-orchestrator-ws.ts — WebSocket client for the @conitens/core event bus.
 *
 * Sub-AC 6c: Bind diegetic display surfaces to live agent-orchestration data.
 *
 * This hook connects to the WebSocketBus server (ws://localhost:8080 by default)
 * and feeds incoming ConitensEvents into the metrics store via ingestLiveEvent().
 * The metrics store in turn drives the canvas-texture pipeline that renders live
 * data onto the diegetic display surfaces in the 3D world.
 *
 * Connection lifecycle:
 *   1. On mount → attempt WebSocket connection, set status "connecting"
 *   2. On open  → set status "connected", reset reconnect counter
 *   3. On message → parse JSON, call ingestLiveEvent(), track last-event-ts
 *   4. On error / close → set status "disconnected", schedule reconnect
 *   5. Exponential back-off: baseInterval × 2^attempt (capped at 30 s)
 *   6. After maxReconnectAttempts failures → stop retrying, stay "disconnected"
 *   7. Staleness watchdog → if no events for stalenessThresholdMs, set "degraded"
 *
 * When disconnected, the metrics store continues running on simulated data
 * (Brownian noise) so the display surfaces always show something plausible.
 *
 * Security: connection is localhost-only per project constraints.
 * Events are write-only (we send nothing back to the server).
 *
 * Usage (mount once in App.tsx):
 *
 *   import { OrchestratorWSBridge } from "./hooks/use-orchestrator-ws.js";
 *   // inside JSX:
 *   <OrchestratorWSBridge />
 *
 * Or with custom config:
 *   <OrchestratorWSBridge wsUrl="ws://localhost:9000" authToken="my-token" />
 */

import { useEffect, useRef, useCallback } from "react";
import { useMetricsStore } from "../store/metrics-store.js";
import { useMeetingStore } from "../store/meeting-store.js";
import { useCommandLifecycleStore } from "../store/command-lifecycle-store.js";
import {
  DEFAULT_DATA_SOURCE_CONFIG,
  type DataSourceConfig,
  type DataSourceMode,
} from "../data/data-source-config.js";
import {
  TASK_WS_EVENT_TYPES,
  dispatchTaskWSEvent,
} from "./use-task-ws-bridge.js";

/** Set of meeting event type strings that the meeting store handles. */
const MEETING_EVENT_TYPES = new Set([
  "meeting.started",
  "meeting.ended",
  "meeting.participant.joined",
  "meeting.participant.left",
  // Sub-AC 10c: transcript messages from the orchestrator
  "meeting.message",
]);

/**
 * Sub-AC 8c: Set of command lifecycle event types forwarded to the
 * command-lifecycle-store for 3D badge and CommandLogPanel visualization.
 */
const COMMAND_LIFECYCLE_EVENT_TYPES = new Set([
  "command.issued",
  "command.completed",
  "command.failed",
  "command.rejected",
]);

// ── Types ──────────────────────────────────────────────────────────────────

/** Subset of DataSourceConfig exposed as props on the bridge component. */
export interface OrchestratorWSBridgeProps {
  /** Override the WebSocket URL (default: ws://localhost:8080). */
  wsUrl?: string;
  /** Optional auth token appended as ?token=<value>. */
  authToken?: string;
  /** Override the full config object. */
  config?: Partial<DataSourceConfig>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * useOrchestratorWS — manages a WebSocket connection to the orchestrator bus.
 *
 * @returns The current connection status for display in the HUD.
 */
export function useOrchestratorWS(
  props: OrchestratorWSBridgeProps = {},
): { connectionStatus: DataSourceMode } {
  const { wsUrl, authToken, config: configOverride } = props;

  // Merge config with defaults
  const cfg: DataSourceConfig = {
    ...DEFAULT_DATA_SOURCE_CONFIG,
    ...configOverride,
    ...(wsUrl ? { wsUrl } : {}),
    ...(authToken !== undefined ? { authToken } : {}),
  };

  // Store actions (stable refs via Zustand)
  const setConnectionStatus = useMetricsStore((s) => s.setConnectionStatus);
  const ingestLiveEvent     = useMetricsStore((s) => s.ingestLiveEvent);
  const connectionStatus    = useMetricsStore((s) => s.connectionStatus);

  // Mutable refs — live across re-renders without triggering effects
  const wsRef              = useRef<WebSocket | null>(null);
  const reconnectCountRef  = useRef(0);
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stalenessTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventTsRef     = useRef<number>(0);
  const mountedRef         = useRef(true);
  /** Stable refs to store actions so connect() callback is stable */
  const setStatusRef       = useRef(setConnectionStatus);
  const ingestRef          = useRef(ingestLiveEvent);
  setStatusRef.current     = setConnectionStatus;
  ingestRef.current        = ingestLiveEvent;

  // ── Staleness watchdog ────────────────────────────────────────────────

  const resetStalenessWatchdog = useCallback(() => {
    if (stalenessTimerRef.current !== null) {
      clearTimeout(stalenessTimerRef.current);
    }
    stalenessTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const sinceLastEvent = Date.now() - lastEventTsRef.current;
      if (sinceLastEvent >= cfg.stalenessThresholdMs) {
        setStatusRef.current("degraded");
      }
    }, cfg.stalenessThresholdMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.stalenessThresholdMs]);

  // ── Connect ───────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    // Build URL with optional auth token
    let url = cfg.wsUrl;
    if (cfg.authToken) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}token=${encodeURIComponent(cfg.authToken)}`;
    }

    setStatusRef.current("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      // URL is malformed — don't retry
      console.warn("[OrchestratorWSBridge] Invalid WebSocket URL:", url, err);
      setStatusRef.current("disconnected");
      return;
    }

    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (!mountedRef.current) return;
      reconnectCountRef.current = 0;
      lastEventTsRef.current = Date.now();
      setStatusRef.current("connected");
      resetStalenessWatchdog();
      console.info("[OrchestratorWSBridge] Connected to orchestrator bus:", url);
    });

    ws.addEventListener("message", (ev) => {
      if (!mountedRef.current) return;
      lastEventTsRef.current = Date.now();
      // Recover connection status if it degraded
      setStatusRef.current("connected");
      resetStalenessWatchdog();

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        // Non-JSON messages are ignored (e.g., ping frames)
        return;
      }

      // Minimal validation — must have a `type` field
      if (typeof event.type !== "string") return;

      // Ingest into the metrics store
      ingestRef.current({
        type:    event.type,
        payload: (event.payload as Record<string, unknown>) ?? {},
        ts:      event.ts as string | undefined,
        task_id: event.task_id as string | undefined,
        actor:   event.actor as { kind: string; id: string } | undefined,
      });

      // Sub-AC 10b: forward meeting.* events to the meeting store so live
      // collaboration sessions are reflected in ActiveSessionsPanel.
      if (MEETING_EVENT_TYPES.has(event.type)) {
        useMeetingStore.getState().handleLiveMeetingEvent({
          type:    event.type,
          payload: (event.payload as Record<string, unknown>) ?? {},
          ts:      event.ts as string | undefined,
        });
      }

      // Sub-AC 8c: forward command.* events to the command-lifecycle-store for
      // 3D badge visualization (CommandStatusBadge) and CommandLogPanel.
      if (COMMAND_LIFECYCLE_EVENT_TYPES.has(event.type)) {
        useCommandLifecycleStore.getState().handleCommandEvent({
          type:    event.type,
          payload: (event.payload as Record<string, unknown>) ?? {},
          ts:      event.ts as string | undefined,
          actor:   event.actor as { kind: string; id: string } | undefined,
        });
      }

      // Sub-AC 5a: forward task.* events to the task store so task-agent
      // assignments, status transitions, and bulk snapshots from the
      // orchestrator are reflected in the 3D command center in real time.
      if (TASK_WS_EVENT_TYPES.has(event.type)) {
        dispatchTaskWSEvent({
          type:    event.type,
          payload: (event.payload as Record<string, unknown>) ?? {},
          ts:      event.ts as string | undefined,
          task_id: event.task_id as string | undefined,
          actor:   event.actor as { kind: string; id: string } | undefined,
        });
      }
    });

    ws.addEventListener("close", (ev) => {
      if (!mountedRef.current) return;
      wsRef.current = null;

      if (stalenessTimerRef.current !== null) {
        clearTimeout(stalenessTimerRef.current);
        stalenessTimerRef.current = null;
      }

      setStatusRef.current("disconnected");
      console.info(
        `[OrchestratorWSBridge] Disconnected (code=${ev.code}). ` +
        `Attempt ${reconnectCountRef.current + 1}/${cfg.maxReconnectAttempts}`,
      );

      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // The "close" event always follows "error" — handle reconnect there
      if (!mountedRef.current) return;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.wsUrl, cfg.authToken, cfg.stalenessThresholdMs, resetStalenessWatchdog]);

  // ── Reconnect scheduling ──────────────────────────────────────────────

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectCountRef.current >= cfg.maxReconnectAttempts) {
      console.warn(
        `[OrchestratorWSBridge] Max reconnect attempts (${cfg.maxReconnectAttempts}) reached. ` +
        "Running on simulated data.",
      );
      return;
    }

    // Exponential backoff: base × 2^attempt, capped at 30 s
    const delay = Math.min(
      cfg.reconnectBaseIntervalMs * Math.pow(2, reconnectCountRef.current),
      30_000,
    );
    reconnectCountRef.current += 1;

    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.maxReconnectAttempts, cfg.reconnectBaseIntervalMs, connect]);

  // ── Mount / unmount lifecycle ─────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    // Attempt initial connection
    connect();

    return () => {
      mountedRef.current = false;

      // Clean up timers
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (stalenessTimerRef.current !== null) {
        clearTimeout(stalenessTimerRef.current);
        stalenessTimerRef.current = null;
      }

      // Close WebSocket gracefully
      const ws = wsRef.current;
      if (ws) {
        ws.close(1000, "Component unmounted");
        wsRef.current = null;
      }

      setStatusRef.current("disconnected");
    };
  // We intentionally only want this to run on mount/unmount.
  // connect() is stable due to useCallback deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionStatus };
}

// ── OrchestratorWSBridge — zero-render component ──────────────────────────

/**
 * OrchestratorWSBridge — mounts the WebSocket connection to the orchestrator.
 *
 * Renders nothing; purely manages the WebSocket lifecycle as a side effect.
 * Mount once in App.tsx alongside MetricsTicker.
 *
 * When the orchestrator WS server is unavailable (e.g. in pure-frontend mode),
 * the bridge silently falls back to simulated data after maxReconnectAttempts.
 *
 * @example
 *   // In App.tsx:
 *   <OrchestratorWSBridge />
 *   // Or with custom endpoint:
 *   <OrchestratorWSBridge wsUrl="ws://localhost:9000" authToken="secret" />
 */
export function OrchestratorWSBridge(props: OrchestratorWSBridgeProps = {}): null {
  useOrchestratorWS(props);
  return null;
}
