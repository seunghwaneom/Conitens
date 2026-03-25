/**
 * use-pipeline-command.ts — React hook for pipeline command dispatch.
 *
 * Sub-AC 7.2: Pipeline command interface.
 *
 * Provides three core actions:
 *   triggerPipeline  — start a single named pipeline in a room context
 *   chainPipelines   — trigger an ordered sequence of pipelines as a chain
 *   cancelPipeline   — cancel an active pipeline run
 *
 * Architecture
 * ────────────
 * User action → optimistic pipeline-store update → writeCommand() → POST /api/commands
 *                                                 ↓ on HTTP error
 *                                         revert optimistic update + show error
 *
 * Every pipeline operation is event-sourced through:
 *   1. The pipeline-store (optimistic + WS-confirmed state)
 *   2. The command-lifecycle-store (pending → processing → completed/failed)
 *   3. The full EventLog (via orchestrator WS events: pipeline.started etc.)
 *
 * Record transparency
 * ────────────────────
 * All three actions call useCommandFileWriter.writeCommand() so the orchestrator
 * receives a properly-formatted command file and appends the appropriate
 * ConitensEvent to the event log.
 *
 * Pending state
 * ─────────────
 * `pendingTriggers` is a Set<pipeline_name> — components use this to show
 * loading states on pipeline trigger buttons while the HTTP round-trip is in-flight.
 *
 * `pendingCancels` is a Set<pipeline_id> — same pattern for cancel buttons.
 */

import { useState, useCallback } from "react";
import { useCommandFileWriter } from "./use-command-file-writer.js";
import { usePipelineStore } from "../store/pipeline-store.js";
import type { PipelineRunStatus } from "../store/pipeline-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Local ID generators (no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function genPipelineId(): string {
  return `pip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePipelineCommandReturn {
  /**
   * Trigger a single named pipeline.
   *
   * @param pipeline_name  - name of the pipeline definition to execute
   * @param options        - optional room / agent / params context
   * @returns The local pipeline_id assigned to this run (for UI correlation)
   */
  triggerPipeline(
    pipeline_name: string,
    options?: {
      room_id?: string;
      agent_ids?: string[];
      params?: Record<string, unknown>;
      label?: string;
    },
  ): Promise<string | null>;

  /**
   * Trigger an ordered sequence of pipelines as a chain.
   *
   * Reads the current chain builder state from the pipeline store and dispatches
   * a pipeline.chain command.  Clears the chain builder after dispatch.
   *
   * @param options  - optional room / continue_on_error override
   * @returns The local chain_id assigned to the chain run
   */
  triggerChain(options?: {
    room_id?: string;
    continue_on_error?: boolean;
    label?: string;
  }): Promise<string | null>;

  /**
   * Cancel an active pipeline run.
   *
   * @param pipeline_id - the run to cancel
   * @param reason      - optional human-readable reason for the audit trail
   */
  cancelPipeline(pipeline_id: string, reason?: string): Promise<void>;

  /** Set of pipeline_names currently awaiting dispatch confirmation. */
  pendingTriggers: Set<string>;

  /** Set of pipeline_ids currently awaiting cancel confirmation. */
  pendingCancels: Set<string>;

  /** Most recent error message (reset on each new call). */
  lastError: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePipelineCommand(): UsePipelineCommandReturn {
  const cmdWriter = useCommandFileWriter();
  const addLocalRun = usePipelineStore((s) => s.addLocalRun);
  const cancelRun = usePipelineStore((s) => s.cancelRun);
  const revertCancelRun = usePipelineStore((s) => s.revertCancelRun);
  const closeChainBuilder = usePipelineStore((s) => s.closeChainBuilder);
  const chainBuilder = usePipelineStore((s) => s.chainBuilder);

  const [pendingTriggers, setPendingTriggers] = useState<Set<string>>(new Set());
  const [pendingCancels, setPendingCancels] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);

  // ── triggerPipeline ────────────────────────────────────────────────────────

  const triggerPipeline = useCallback(
    async (
      pipeline_name: string,
      options?: {
        room_id?: string;
        agent_ids?: string[];
        params?: Record<string, unknown>;
        label?: string;
      },
    ): Promise<string | null> => {
      setLastError(null);

      // Mark as pending
      setPendingTriggers((prev) => new Set([...prev, pipeline_name]));

      const pipeline_id = genPipelineId();

      // Optimistic run entry — shown in the 3D panel immediately
      addLocalRun({
        pipeline_id,
        pipeline_name,
        status: "pending",
        room_id: options?.room_id,
        agent_ids: options?.agent_ids,
        initiated_at_ms: Date.now(),
      });

      try {
        await cmdWriter.writeCommand("pipeline.trigger", {
          pipeline_name,
          room_id: options?.room_id,
          agent_ids: options?.agent_ids,
          params: options?.params,
          label: options?.label,
        });
        return pipeline_id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastError(`Failed to trigger pipeline "${pipeline_name}": ${msg}`);
        return null;
      } finally {
        setPendingTriggers((prev) => {
          const next = new Set(prev);
          next.delete(pipeline_name);
          return next;
        });
      }
    },
    [cmdWriter, addLocalRun],
  );

  // ── triggerChain ───────────────────────────────────────────────────────────

  const triggerChain = useCallback(
    async (options?: {
      room_id?: string;
      continue_on_error?: boolean;
      label?: string;
    }): Promise<string | null> => {
      setLastError(null);

      const { entries, room_id: builderRoomId, continue_on_error, label } = chainBuilder;

      if (entries.length === 0) {
        setLastError("Chain builder is empty — add at least one pipeline before triggering.");
        return null;
      }

      const effectiveRoomId = options?.room_id ?? builderRoomId;
      const effectiveContinue = options?.continue_on_error ?? continue_on_error;
      const effectiveLabel = options?.label ?? (label || entries.map((e) => e.pipeline_name).join(" → "));

      // Mark all pipeline_names in the chain as pending
      const pipelineNames = entries.map((e) => e.pipeline_name);
      setPendingTriggers((prev) => new Set([...prev, ...pipelineNames]));

      // Create individual optimistic runs for each chain entry
      const chainEntries = entries.map((e) => ({
        pipeline_name: e.pipeline_name,
        params: e.params,
      }));

      const chainId = genPipelineId();

      // Optimistic runs — one per chain entry
      for (const entry of entries) {
        addLocalRun({
          pipeline_id: genPipelineId(),
          pipeline_name: entry.pipeline_name,
          status: "pending",
          room_id: effectiveRoomId,
          chain_id: chainId,
          initiated_at_ms: Date.now(),
        });
      }

      // Close the chain builder UI optimistically
      closeChainBuilder();

      try {
        await cmdWriter.writeCommand("pipeline.chain", {
          chain: chainEntries,
          room_id: effectiveRoomId,
          continue_on_error: effectiveContinue,
          label: effectiveLabel,
        });
        return chainId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastError(`Failed to trigger pipeline chain: ${msg}`);
        return null;
      } finally {
        setPendingTriggers((prev) => {
          const next = new Set(prev);
          pipelineNames.forEach((n) => next.delete(n));
          return next;
        });
      }
    },
    [cmdWriter, addLocalRun, closeChainBuilder, chainBuilder],
  );

  // ── cancelPipeline ─────────────────────────────────────────────────────────

  const cancelPipeline = useCallback(
    async (pipeline_id: string, reason?: string): Promise<void> => {
      setLastError(null);

      // Capture prior status for rollback
      const prevStatus: PipelineRunStatus =
        (usePipelineStore.getState().runs.get(pipeline_id)?.status) ?? "running";

      // Optimistic cancellation
      cancelRun(pipeline_id, reason);
      setPendingCancels((prev) => new Set([...prev, pipeline_id]));

      try {
        await cmdWriter.writeCommand("pipeline.cancel", {
          pipeline_id,
          reason: reason ?? "user_requested",
        });
      } catch (err) {
        // Rollback optimistic cancel
        revertCancelRun(pipeline_id, prevStatus);
        const msg = err instanceof Error ? err.message : String(err);
        setLastError(`Failed to cancel pipeline "${pipeline_id}": ${msg}`);
      } finally {
        setPendingCancels((prev) => {
          const next = new Set(prev);
          next.delete(pipeline_id);
          return next;
        });
      }
    },
    [cmdWriter, cancelRun, revertCancelRun],
  );

  return {
    triggerPipeline,
    triggerChain,
    cancelPipeline,
    pendingTriggers,
    pendingCancels,
    lastError,
  };
}
