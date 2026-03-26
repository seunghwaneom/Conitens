/**
 * use-command-file-pipeline.ts — Sub-AC 8b: Command-file pipeline hook.
 *
 * Purpose
 * ───────
 * React hook that wires the `CommandFilePipelineWatcher` (pure data module) to:
 *   1. The global WebSocket event bus (`window.__conitensEventBus__`) for
 *      live command lifecycle events.
 *   2. The `command-lifecycle-store` (Sub-AC 8c) so that every pipeline
 *      state transition is persisted back to the command entity and reflected
 *      in the 3D scene badges and command log panel.
 *
 * Lifecycle bridge
 * ────────────────
 * Pipeline states (Sub-AC 8b)      →   Visual store states (Sub-AC 8c)
 * ──────────────────────────────────────────────────────────────────────
 * pending                          →   pending     (written by Sub-AC 8a)
 * accepted (command.issued/queued) →   processing  (orchestrator confirmed)
 * executing (ack/dispatched)       →   processing  (still processing)
 * completed                        →   completed
 * failed                           →   failed | rejected
 *
 * The mapping is intentionally lossy in the visual store — the 3D badges only
 * need a 3-state simplified view (pending / active / done).  Sub-AC 8b retains
 * full fidelity in `CommandFilePipelineWatcher` for replay and audit use.
 *
 * Architecture
 * ────────────
 * - One `CommandFilePipelineWatcher` instance per mounted hook (held in useRef).
 * - Event bus subscription set up in useEffect; cleaned up on unmount.
 * - `registerPipelineCommand(command_id, command_type)` exposed so Sub-AC 8a
 *   can register commands at dispatch time before any WS events arrive.
 * - `getEntity(command_id)` exposed for direct entity access (e.g. replay).
 *
 * Record transparency
 * ────────────────────
 * Every state transition is recorded in:
 *   1. The `CommandFilePipelineWatcher` transition log (write-only audit trail).
 *   2. The `command-lifecycle-store` entry (visual + persistence layer).
 *
 * Null-render component
 * ─────────────────────
 * `CommandFilePipelineBridge` is a headless React component (returns null) that
 * activates this hook.  Mount it in App.tsx following the bridge component
 * pattern established for `PipelineWSBridge` and `TaskWSBridge`.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  CommandFilePipelineWatcher,
  type CommandFilePipelineEntity,
  type CommandFilePipelineStatus,
  type CommandPipelineEvent,
} from "../data/command-file-pipeline.js";
import { useCommandLifecycleStore } from "../store/command-lifecycle-store.js";
import type { IncomingCommandEvent } from "../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global event bus types (mirrors use-pipeline-ws-bridge.ts)
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

/** Safely access the global event bus. Returns null if not yet initialized. */
function getEventBus(): ConitensEventBus | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__conitensEventBus__ ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline status → visual store status mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a `CommandFilePipelineStatus` (extended 5-state model) to the
 * `IncomingCommandEvent.type` that the visual `command-lifecycle-store`
 * understands.
 *
 * The visual store drives state via `handleCommandEvent()` which accepts:
 *   command.issued    → processing
 *   command.completed → completed
 *   command.failed    → failed
 *   command.rejected  → rejected
 *
 * We use this mapping to synthesise the appropriate event when the pipeline
 * entity transitions, regardless of which specific WS event triggered it.
 */
function pipelineStatusToVisualEventType(
  status: CommandFilePipelineStatus,
): string | null {
  switch (status) {
    case "accepted":
    case "executing":
      return "command.issued";   // visual store → processing
    case "completed":
      return "command.completed";
    case "failed":
      return "command.failed";
    case "pending":
      return null;               // pending is set by addLocalCommand; no update needed
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCommandFilePipelineResult {
  /**
   * Register a newly-dispatched command in `pending` state.
   * Call this immediately after writing a command file (Sub-AC 8a).
   *
   * @param command_id   Stable command identifier from CommandFile.command_id.
   * @param command_type GUI command type string.
   * @param ts           Optional ISO timestamp; defaults to current time.
   */
  registerPipelineCommand(
    command_id: string,
    command_type: string,
    ts?: string,
  ): CommandFilePipelineEntity;

  /**
   * Get the current pipeline entity for a command.
   * Returns `undefined` if the command_id is not known to the watcher.
   */
  getEntity(command_id: string): CommandFilePipelineEntity | undefined;

  /**
   * Return all pipeline entities with the given status.
   */
  getEntitiesByStatus(status: CommandFilePipelineStatus): CommandFilePipelineEntity[];

  /**
   * Return the watcher's full transition log (read-only audit trail).
   * Newest entries last.
   */
  getTransitionLog(limit?: number): ReturnType<CommandFilePipelineWatcher["getTransitionLog"]>;

  /** Total number of tracked commands. */
  entityCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useCommandFilePipeline — activates the command-file pipeline watcher and
 * wires it to the WebSocket event bus + command-lifecycle-store.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { registerPipelineCommand, getEntity } = useCommandFilePipeline();
 *
 *   // After writing a command file:
 *   registerPipelineCommand(cmd_id, "agent.spawn");
 *
 *   // Query entity state:
 *   const entity = getEntity(cmd_id);
 *   if (entity?.status === "completed") { ... }
 * }
 * ```
 */
export function useCommandFilePipeline(): UseCommandFilePipelineResult {
  // ── Stable watcher reference ────────────────────────────────────────────
  const watcherRef = useRef<CommandFilePipelineWatcher | null>(null);
  if (!watcherRef.current) {
    watcherRef.current = new CommandFilePipelineWatcher();
  }
  const watcher = watcherRef.current;

  // ── Visual store actions ─────────────────────────────────────────────────
  const handleCommandEvent = useCommandLifecycleStore(
    (s) => s.handleCommandEvent,
  );

  // ── Watcher → visual store bridge ─────────────────────────────────────────
  // Set up the transition callback once (watcher ref is stable).
  useEffect(() => {
    watcher.setOnTransition((entity, record) => {
      const visualEventType = pipelineStatusToVisualEventType(entity.status);
      if (!visualEventType) return;

      // Build the IncomingCommandEvent expected by handleCommandEvent
      const visualEvent: IncomingCommandEvent = {
        type: visualEventType,
        ts: record.ts,
        payload: {
          command_id:    entity.command_id,
          command_type:  entity.command_type,
          // Pass through error details for failed / rejected
          ...(entity.error
            ? {
                error_code:    entity.error.code,
                error_message: entity.error.message,
              }
            : {}),
          ...(entity.duration_ms !== undefined
            ? { duration_ms: entity.duration_ms }
            : {}),
        },
      };

      handleCommandEvent(visualEvent);
    });

    return () => {
      watcher.setOnTransition(null);
    };
  }, [watcher, handleCommandEvent]);

  // ── WebSocket event bus subscription ──────────────────────────────────────
  useEffect(() => {
    const bus = getEventBus();
    if (!bus) {
      // Bus not yet initialised — will be picked up on next render cycle
      return;
    }

    const unsubscribe = bus.subscribe((envelope: ConitensEventEnvelope) => {
      // Only process command.* events
      if (!envelope.type.startsWith("command.")) return;

      const payload = (
        typeof envelope.payload === "object" && envelope.payload !== null
          ? envelope.payload
          : {}
      ) as Record<string, unknown>;

      const event: CommandPipelineEvent = {
        type:    envelope.type,
        payload,
        ts:      envelope.ts,
      };

      watcher.applyEvent(event);
    });

    return unsubscribe;
  }, [watcher]);

  // ── Stable API callbacks ────────────────────────────────────────────────
  const registerPipelineCommand = useCallback(
    (command_id: string, command_type: string, ts?: string) => {
      return watcher.registerCommand(command_id, command_type, ts);
    },
    [watcher],
  );

  const getEntity = useCallback(
    (command_id: string) => watcher.getEntity(command_id),
    [watcher],
  );

  const getEntitiesByStatus = useCallback(
    (status: CommandFilePipelineStatus) => watcher.getEntitiesByStatus(status),
    [watcher],
  );

  const getTransitionLog = useCallback(
    (limit?: number) => watcher.getTransitionLog(limit),
    [watcher],
  );

  return {
    registerPipelineCommand,
    getEntity,
    getEntitiesByStatus,
    getTransitionLog,
    entityCount: watcher.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Headless bridge component (null-render)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CommandFilePipelineBridge — headless component that activates the pipeline
 * watcher and wires it to the WS bus + visual store.
 *
 * Mount in App.tsx following the null-render bridge pattern.
 * Do NOT add store subscriptions directly to App.tsx — use this bridge.
 *
 * Example:
 * ```tsx
 * // App.tsx
 * <CommandFilePipelineBridge />
 * ```
 */
export function CommandFilePipelineBridge(): null {
  useCommandFilePipeline();
  return null;
}
