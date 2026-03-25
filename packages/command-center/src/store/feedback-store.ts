/**
 * feedback-store.ts — Zustand store for Orchestrator command feedback.
 *
 * Sub-AC 8d: End-to-end feedback loop.
 *
 * Stores command processing results returned by the Orchestrator after it
 * ingests command files from the watch directory.  The polling hook
 * (use-orchestrator-feedback.ts) populates this store; React components
 * subscribe to it to update the 3D scene and show toast notifications.
 *
 * Design principles:
 *   - Write-only ingest: results flow FROM orchestrator INTO the GUI; the GUI
 *     never writes back through this store (command dispatch is handled by
 *     use-command-file-writer.ts and use-action-dispatcher.ts).
 *   - Event-sourced results: every CommandResult appended to resultLog for
 *     full audit trail + 3D replay correlation.
 *   - Graceful degradation: if the results API is unavailable the store stays
 *     empty; polling resumes automatically when the server comes back.
 *   - Bounded ring-buffer: resultLog capped at MAX_RESULT_LOG to prevent
 *     unbounded memory growth in long-running sessions.
 *
 * Toast lifecycle:
 *   1. A result arrives → addToast() with auto-assigned id and expiry.
 *   2. ToastNotificationLayer renders all live toasts.
 *   3. After toast.expiresAt, dismissToast() removes it.
 *   4. User can dismiss early via dismissToast(id).
 */

import { create } from "zustand";

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum command results to keep in the ring-buffer. */
export const MAX_RESULT_LOG = 200;

/** Default auto-dismiss duration for toasts (ms). */
export const DEFAULT_TOAST_DURATION_MS = 5_000;

/** Duration for error toasts — longer so the operator can read them. */
export const ERROR_TOAST_DURATION_MS = 10_000;

// ── Result Schema ──────────────────────────────────────────────────────────

/**
 * Processing status returned by the Orchestrator after it ingests a command.
 *
 *   "processed" — command was validated, persisted, and executed
 *   "error"     — command was ingested but execution failed
 *   "rejected"  — command failed schema validation before execution
 *   "pending"   — command is queued, not yet processed (transitional)
 */
export type CommandResultStatus = "processed" | "error" | "rejected" | "pending";

/**
 * Per-agent status snapshot embedded in a command result.
 * Only present when the result relates to an agent operation.
 */
export interface CommandResultAgentUpdate {
  agent_id: string;
  /** Updated operational status after the command was processed. */
  status?: "inactive" | "idle" | "active" | "busy" | "error" | "terminated";
  /** Updated lifecycle state after the command (optional). */
  lifecycle_state?: string;
  /** Room the agent was moved to (for agent.assign / agent.spawn commands). */
  room_id?: string;
}

/**
 * Per-task update embedded in a command result.
 * Only present when the result relates to a task operation.
 */
export interface CommandResultTaskUpdate {
  task_id: string;
  /** Updated task status after the command was processed. */
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** Agent now assigned to the task (for task.assign commands). */
  assigned_agent_id?: string;
}

/**
 * A structured error returned by the Orchestrator when processing fails.
 */
export interface CommandResultError {
  code: string;
  message: string;
  detail?: string;
}

/**
 * The canonical shape of a command result written by the Orchestrator to
 * `.conitens/results/` and exposed via `GET /api/commands/results`.
 *
 * The GUI polls this endpoint and ingests each result into the feedback store.
 * Fields mirror the CommandFile envelope to allow correlation by command_id.
 */
export interface CommandResult {
  /** Correlates to the CommandFile.command_id that triggered this result. */
  command_id: string;
  /** The original command type (e.g. "agent.spawn", "task.create"). */
  command_type: string;
  /** Processing outcome. */
  status: CommandResultStatus;
  /** ISO-8601 timestamp when the Orchestrator processed the command. */
  ts: string;
  /** Human-readable result message for display in toasts / HUD. */
  message?: string;
  /** Agent state update (if applicable). */
  agent_update?: CommandResultAgentUpdate;
  /** Task state update (if applicable). */
  task_update?: CommandResultTaskUpdate;
  /** Error details (populated when status === "error" | "rejected"). */
  error?: CommandResultError;
}

// ── Toast Model ─────────────────────────────────────────────────────────────

export type ToastLevel = "info" | "success" | "warning" | "error";

export interface ToastNotification {
  /** Unique id assigned by the store on creation. */
  id: string;
  level: ToastLevel;
  /** Short title line shown in bold. */
  title: string;
  /** Optional detail body (1-2 sentences). */
  body?: string;
  /** Unix timestamp (ms) when the toast was created. */
  createdAt: number;
  /** Unix timestamp (ms) after which the toast should be auto-dismissed. */
  expiresAt: number;
  /** Correlating command_id, if this toast was triggered by a command result. */
  command_id?: string;
  /** Correlating agent_id, if this toast is about a specific agent. */
  agent_id?: string;
  /** Correlating task_id, if this toast is about a specific task. */
  task_id?: string;
}

// ── Connection Status for the Feedback Poll ──────────────────────────────────

/**
 * Polling status for the results endpoint.
 *
 *   "polling"       — actively fetching results on schedule
 *   "idle"          — results endpoint returned no new data; waiting for next poll
 *   "error"         — last poll failed (network error or non-2xx response)
 *   "disconnected"  — max retries exhausted; no longer polling
 */
export type FeedbackPollStatus = "polling" | "idle" | "error" | "disconnected";

// ── Highlighted Entities ──────────────────────────────────────────────────────

/**
 * Error highlight applied to a specific entity (agent or room).
 * The 3D scene reads these to show pulsing red indicators on problem entities.
 */
export interface EntityErrorHighlight {
  kind: "agent" | "room" | "task";
  id: string;
  message: string;
  since: number;    // Unix ms
  /** Auto-clears after clearAfterMs (optional; permanent if absent). */
  clearAfterMs?: number;
}

// ── Store Shape ───────────────────────────────────────────────────────────────

export interface FeedbackStoreState {
  // ── Result log ────────────────────────────────────────────────────────────
  /** Append-only ring-buffer of all received command results (newest last). */
  resultLog: CommandResult[];

  /** Set of command_ids already processed (de-duplication). */
  processedIds: Set<string>;

  /** Timestamp of the most-recently ingested result (for since= polling). */
  lastResultTs: string | null;

  // ── Toast notifications ────────────────────────────────────────────────────
  /** Active (not-yet-dismissed) toast notifications. */
  toasts: ToastNotification[];

  // ── Error highlights (3D scene indicators) ────────────────────────────────
  /** Per-entity error highlights driving 3D pulse animations. */
  errorHighlights: EntityErrorHighlight[];

  // ── Polling status ────────────────────────────────────────────────────────
  pollStatus: FeedbackPollStatus;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Ingest a batch of CommandResult objects returned by the polling endpoint.
   * Skips already-processed command_ids; appends new ones to resultLog.
   * Auto-generates toast notifications for each result.
   */
  ingestResults: (results: CommandResult[]) => void;

  /**
   * Explicitly add a toast notification (e.g. from optimistic error handling
   * in use-action-dispatcher, independent of an Orchestrator round-trip).
   */
  addToast: (
    level: ToastLevel,
    title: string,
    opts?: {
      body?: string;
      durationMs?: number;
      command_id?: string;
      agent_id?: string;
      task_id?: string;
    },
  ) => void;

  /** Remove a toast by id (user-initiated or auto-dismiss). */
  dismissToast: (id: string) => void;

  /** Remove all expired toasts (called by the polling loop). */
  pruneExpiredToasts: () => void;

  /** Set (or add) an error highlight for an entity. */
  setErrorHighlight: (highlight: EntityErrorHighlight) => void;

  /** Clear error highlight for a specific entity. */
  clearErrorHighlight: (kind: EntityErrorHighlight["kind"], id: string) => void;

  /** Clear all error highlights (e.g. on scene reset). */
  clearAllErrorHighlights: () => void;

  /** Update the polling connection status. */
  setPollStatus: (status: FeedbackPollStatus) => void;

  // ── Selectors ─────────────────────────────────────────────────────────────

  /** Get the most recent result for a given command_id (or undefined). */
  getResultByCommandId: (command_id: string) => CommandResult | undefined;

  /** Get error highlight for a specific entity (or undefined). */
  getErrorHighlight: (
    kind: EntityErrorHighlight["kind"],
    id: string,
  ) => EntityErrorHighlight | undefined;

  /** True when any agent has an active error highlight. */
  hasAgentErrors: () => boolean;
}

// ── ID generators ─────────────────────────────────────────────────────────────

let _toastCounter = 0;
function nextToastId(): string {
  return `toast-${Date.now()}-${++_toastCounter}`;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useFeedbackStore = create<FeedbackStoreState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  resultLog:        [],
  processedIds:     new Set<string>(),
  lastResultTs:     null,
  toasts:           [],
  errorHighlights:  [],
  pollStatus:       "idle",

  // ── ingestResults ──────────────────────────────────────────────────────────

  ingestResults: (results: CommandResult[]) => {
    if (results.length === 0) return;

    const { processedIds, resultLog } = get();
    const newResults: CommandResult[] = [];

    for (const result of results) {
      if (processedIds.has(result.command_id)) continue;
      newResults.push(result);
    }

    if (newResults.length === 0) return;

    // Update processed ids set (clone to trigger immer-free Zustand diff)
    const newProcessedIds = new Set(processedIds);
    for (const r of newResults) {
      newProcessedIds.add(r.command_id);
    }

    // Append to ring-buffer (trim to MAX_RESULT_LOG)
    const combined = [...resultLog, ...newResults];
    const trimmed =
      combined.length > MAX_RESULT_LOG
        ? combined.slice(combined.length - MAX_RESULT_LOG)
        : combined;

    // Track the most recent ts for since= query param
    const latest = newResults.reduce<string | null>((acc, r) => {
      if (!acc) return r.ts;
      return r.ts > acc ? r.ts : acc;
    }, null);

    set({
      resultLog:    trimmed,
      processedIds: newProcessedIds,
      lastResultTs: latest ?? get().lastResultTs,
    });

    // Auto-generate toasts and error highlights
    for (const result of newResults) {
      processResultSideEffects(result);
    }
  },

  // ── addToast ───────────────────────────────────────────────────────────────

  addToast: (level, title, opts = {}) => {
    const now = Date.now();
    const duration =
      opts.durationMs ??
      (level === "error" ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);

    const toast: ToastNotification = {
      id:         nextToastId(),
      level,
      title,
      body:       opts.body,
      createdAt:  now,
      expiresAt:  now + duration,
      command_id: opts.command_id,
      agent_id:   opts.agent_id,
      task_id:    opts.task_id,
    };

    set((s) => ({ toasts: [...s.toasts, toast] }));
  },

  // ── dismissToast ──────────────────────────────────────────────────────────

  dismissToast: (id: string) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── pruneExpiredToasts ────────────────────────────────────────────────────

  pruneExpiredToasts: () => {
    const now = Date.now();
    set((s) => ({
      toasts: s.toasts.filter((t) => t.expiresAt > now),
    }));
  },

  // ── setErrorHighlight ─────────────────────────────────────────────────────

  setErrorHighlight: (highlight: EntityErrorHighlight) => {
    set((s) => {
      const filtered = s.errorHighlights.filter(
        (h) => !(h.kind === highlight.kind && h.id === highlight.id),
      );
      return { errorHighlights: [...filtered, highlight] };
    });
  },

  // ── clearErrorHighlight ───────────────────────────────────────────────────

  clearErrorHighlight: (kind, id) => {
    set((s) => ({
      errorHighlights: s.errorHighlights.filter(
        (h) => !(h.kind === kind && h.id === id),
      ),
    }));
  },

  // ── clearAllErrorHighlights ───────────────────────────────────────────────

  clearAllErrorHighlights: () => {
    set({ errorHighlights: [] });
  },

  // ── setPollStatus ─────────────────────────────────────────────────────────

  setPollStatus: (status: FeedbackPollStatus) => {
    set({ pollStatus: status });
  },

  // ── getResultByCommandId ──────────────────────────────────────────────────

  getResultByCommandId: (command_id: string) => {
    return get().resultLog.find((r) => r.command_id === command_id);
  },

  // ── getErrorHighlight ─────────────────────────────────────────────────────

  getErrorHighlight: (kind, id) => {
    return get().errorHighlights.find((h) => h.kind === kind && h.id === id);
  },

  // ── hasAgentErrors ────────────────────────────────────────────────────────

  hasAgentErrors: () => {
    return get().errorHighlights.some((h) => h.kind === "agent");
  },

}));

// ── Post-creation: wire internal side-effect processor ───────────────────────
//
// We extend the store state with the private _processResultSideEffects method
// after creation so it has access to the fully-initialised store instance
// (needed to call get().addToast, get().setErrorHighlight, etc.).
//
// We use a module-level lazy function rather than a closure to avoid
// capturing stale references.

function processResultSideEffects(result: CommandResult): void {
  const store = useFeedbackStore.getState();

  switch (result.status) {
    case "processed": {
      // Success toast
      const agentLabel = result.agent_update
        ? ` · Agent: ${result.agent_update.agent_id}`
        : "";
      const taskLabel = result.task_update
        ? ` · Task: ${result.task_update.task_id}`
        : "";

      store.addToast(
        "success",
        `✔ ${result.command_type}${agentLabel}${taskLabel}`,
        {
          body:       result.message,
          command_id: result.command_id,
          agent_id:   result.agent_update?.agent_id,
          task_id:    result.task_update?.task_id,
        },
      );

      // Clear any lingering error highlight for the affected agent
      if (result.agent_update?.agent_id) {
        store.clearErrorHighlight("agent", result.agent_update.agent_id);
      }
      if (result.task_update?.task_id) {
        store.clearErrorHighlight("task", result.task_update.task_id);
      }
      break;
    }

    case "error": {
      const errorMsg =
        result.error?.message ?? result.message ?? "Unknown error";
      const agentId = result.agent_update?.agent_id;
      const taskId  = result.task_update?.task_id;

      store.addToast(
        "error",
        `✖ ${result.command_type} failed`,
        {
          body:       errorMsg,
          command_id: result.command_id,
          agent_id:   agentId,
          task_id:    taskId,
          durationMs: ERROR_TOAST_DURATION_MS,
        },
      );

      // Add 3D error highlights
      if (agentId) {
        store.setErrorHighlight({
          kind:         "agent",
          id:           agentId,
          message:      errorMsg,
          since:        Date.now(),
          clearAfterMs: 30_000,
        });
      }
      if (taskId) {
        store.setErrorHighlight({
          kind:         "task",
          id:           taskId,
          message:      errorMsg,
          since:        Date.now(),
          clearAfterMs: 30_000,
        });
      }
      break;
    }

    case "rejected": {
      const reason =
        result.error?.message ?? result.message ?? "Validation rejected";

      store.addToast(
        "warning",
        `⚠ ${result.command_type} rejected`,
        {
          body:       reason,
          command_id: result.command_id,
          durationMs: ERROR_TOAST_DURATION_MS,
        },
      );
      break;
    }

    case "pending":
      // Informational — no toast for pending results; they resolve quickly.
      break;
  }

  // Apply agent status update to agent-store
  if (result.agent_update?.status) {
    try {
      // Lazy import to avoid circular deps — same pattern as metrics-store.ts
      import("./agent-store.js").then(({ useAgentStore }) => {
        const agentUpdate = result.agent_update!;
        if (!agentUpdate.agent_id) return;
        const agent = useAgentStore.getState().getAgent(agentUpdate.agent_id);
        if (!agent) return;
        // Only update if status actually changed (avoid spurious events)
        if (agent.status !== agentUpdate.status && agentUpdate.status) {
          useAgentStore.getState().changeAgentStatus(
            agentUpdate.agent_id,
            agentUpdate.status,
            `feedback:${result.command_type}`,
          );
        }
      }).catch(() => {
        // Silent — non-fatal if agent store import fails
      });
    } catch {
      // Non-fatal
    }
  }

  // Apply task status update to task-store
  if (result.task_update?.task_id && result.task_update.status) {
    try {
      import("./task-store.js").then(({ useTaskStore }) => {
        const taskUpdate = result.task_update!;
        if (!taskUpdate.task_id || !taskUpdate.status) return;
        const task = useTaskStore.getState().getTask(taskUpdate.task_id);
        if (!task) return;
        // Map Orchestrator task statuses to store-level transitions
        if (taskUpdate.status === "completed") {
          useTaskStore.getState().transitionTask(taskUpdate.task_id, "done");
        } else if (taskUpdate.status === "failed") {
          useTaskStore.getState().transitionTask(taskUpdate.task_id, "failed");
        } else if (taskUpdate.status === "cancelled") {
          useTaskStore.getState().transitionTask(taskUpdate.task_id, "cancelled");
        }
        // "running" and "pending" don't need explicit transitions
      }).catch(() => {
        // Silent — non-fatal
      });
    } catch {
      // Non-fatal
    }
  }
}

// processResultSideEffects is called directly from ingestResults above.
// No store patching required.
