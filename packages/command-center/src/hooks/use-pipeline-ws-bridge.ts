/**
 * use-pipeline-ws-bridge.ts — Bridge from OrchestratorWS to pipeline-store.
 *
 * Sub-AC 7.2: Pipeline command interface — real-time pipeline event routing.
 *
 * This hook subscribes to the global ConitensEvent stream (via a shared
 * subscription callback) and routes pipeline.* events into the pipeline-store.
 *
 * Architecture
 * ────────────
 * OrchestratorWSBridge (App.tsx)
 *   → emits ConitensEvents to a shared event bus (window.__conitensEventBus__)
 *   → PipelineWSBridge subscribes to the bus
 *   → Dispatches to pipeline-store handlers:
 *       pipeline.started   → handlePipelineStarted()
 *       pipeline.step      → handlePipelineStep()
 *       pipeline.completed → handlePipelineCompleted()
 *       pipeline.failed    → handlePipelineFailed()
 *
 * Eviction
 * ────────
 * A 30-second interval runs evictExpiredRuns() to prune terminal pipeline runs
 * from the in-memory store (they remain in the append-only events log).
 *
 * Null-render component
 * ─────────────────────
 * `PipelineWSBridge` is a headless React component (returns null) that activates
 * this hook.  It MUST be mounted in App.tsx following the coordinator warning
 * pattern for bridge components.
 *
 * Record transparency
 * ────────────────────
 * Every WS-received event that reaches this bridge is handled by the pipeline-
 * store which appends to its append-only events log, satisfying the record
 * transparency design principle.
 */

import { useEffect } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";
import {
  isPipelineStartedPayload,
  isPipelineStepPayload,
  isPipelineCompletedPayload,
  isPipelineFailedPayload,
} from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Global event bus type (compatible with OrchestratorWSBridge)
// ─────────────────────────────────────────────────────────────────────────────

interface ConitensEventEnvelope {
  type: string;
  payload: unknown;
  ts?: string;
  task_id?: string;
}

type ConitensEventBusListener = (event: ConitensEventEnvelope) => void;

interface ConitensEventBus {
  subscribe: (listener: ConitensEventBusListener) => () => void;
  publish: (event: ConitensEventEnvelope) => void;
}

// Access the global event bus that OrchestratorWSBridge publishes to.
// Falls back to a no-op if the bus hasn't been initialised yet.
function getEventBus(): ConitensEventBus | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__conitensEventBus__ ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eviction interval (ms) — prune terminal runs older than COMPLETED_RUN_TTL_MS
// ─────────────────────────────────────────────────────────────────────────────

const EVICTION_INTERVAL_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePipelineWSBridge(): void {
  const handlePipelineStarted  = usePipelineStore((s) => s.handlePipelineStarted);
  const handlePipelineStep     = usePipelineStore((s) => s.handlePipelineStep);
  const handlePipelineCompleted = usePipelineStore((s) => s.handlePipelineCompleted);
  const handlePipelineFailed   = usePipelineStore((s) => s.handlePipelineFailed);
  const evictExpiredRuns       = usePipelineStore((s) => s.evictExpiredRuns);

  // ── Subscribe to the global event bus ─────────────────────────────────────
  useEffect(() => {
    const bus = getEventBus();
    if (!bus) {
      // Bus not yet initialised — retry on next render or rely on polling fallback
      return;
    }

    const unsubscribe = bus.subscribe((event: ConitensEventEnvelope) => {
      const { type, payload } = event;

      switch (type) {
        case "pipeline.started": {
          if (isPipelineStartedPayload(payload)) {
            handlePipelineStarted({
              pipeline_id:           payload.pipeline_id,
              pipeline_name:         payload.pipeline_name,
              steps:                 payload.steps,
              initiated_by_command:  payload.initiated_by_command,
              started_at_ms:         payload.started_at_ms,
            });
          }
          break;
        }
        case "pipeline.step": {
          if (isPipelineStepPayload(payload)) {
            handlePipelineStep({
              pipeline_id:   payload.pipeline_id,
              step_index:    payload.step_index,
              step_name:     payload.step_name,
              step_status:   payload.step_status,
              output:        payload.output,
              error_message: payload.error_message,
              error_code:    payload.error_code,
              duration_ms:   payload.duration_ms,
            });
          }
          break;
        }
        case "pipeline.completed": {
          if (isPipelineCompletedPayload(payload)) {
            handlePipelineCompleted({
              pipeline_id:     payload.pipeline_id,
              pipeline_name:   payload.pipeline_name,
              steps_total:     payload.steps_total,
              steps_completed: payload.steps_completed,
              duration_ms:     payload.duration_ms,
              artifacts:       payload.artifacts,
            });
          }
          break;
        }
        case "pipeline.failed": {
          if (isPipelineFailedPayload(payload)) {
            handlePipelineFailed({
              pipeline_id:        payload.pipeline_id,
              pipeline_name:      payload.pipeline_name,
              failed_step_index:  payload.failed_step_index,
              failed_step_name:   payload.failed_step_name,
              error_code:         payload.error_code,
              error_message:      payload.error_message,
              steps_completed:    payload.steps_completed,
              duration_ms:        payload.duration_ms,
            });
          }
          break;
        }
        default:
          // Non-pipeline events — ignore
          break;
      }
    });

    return unsubscribe;
  }, [handlePipelineStarted, handlePipelineStep, handlePipelineCompleted, handlePipelineFailed]);

  // ── Periodic eviction of stale terminal runs ──────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      evictExpiredRuns();
    }, EVICTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [evictExpiredRuns]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Headless bridge component (null-render)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PipelineWSBridge — headless component that activates the pipeline WS bridge.
 *
 * Mount in App.tsx following the null-render pattern per coordinator warnings.
 * Do NOT add Zustand store subscriptions directly to App.tsx — use this bridge.
 */
export function PipelineWSBridge(): null {
  usePipelineWSBridge();
  return null;
}
