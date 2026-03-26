/**
 * command-lifecycle-store.ts — Zustand store for command lifecycle visualization.
 *
 * Sub-AC 8c: Render command lifecycle state visually in the 3D scene.
 *
 * Tracks active and recent command state transitions for:
 *   1. Per-agent command status badges in the 3D scene (CommandStatusBadge)
 *   2. The global scrollable Command Log panel (CommandLogPanel)
 *
 * Data feeds:
 *   - Live WebSocket events (command.issued, command.completed, command.failed,
 *     command.rejected) forwarded by use-orchestrator-ws.ts via handleCommandEvent()
 *   - Local command dispatch from useCommandFileWriter via addLocalCommand()
 *
 * Design principles:
 *   - Append-only event log (max MAX_LOG_ENTRIES entries, oldest evicted)
 *   - Per-agent index: agentCommandMap[agentId] = string[] (active command_ids)
 *   - TTL eviction: completed/failed/rejected entries removed after COMPLETION_TTL_MS
 *   - Event-sourced: every mutation recorded in the internal eventLog
 *   - No direct store-to-store imports; use lazy .getState() pattern if needed
 *
 * Status semantics:
 *   pending    — written to command file locally, awaiting orchestrator confirmation
 *   processing — command.issued received — orchestrator accepted and is executing
 *   completed  — command.completed event received
 *   failed     — command.failed event received
 *   rejected   — command.rejected event received (pre-execution refusal)
 */

import { create } from "zustand";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum command log entries to keep in memory. */
const MAX_LOG_ENTRIES = 200;

/**
 * Time (ms) after which completed / failed / rejected entries are removed
 * from the per-agent active badge set (but kept in the log).
 */
export const COMPLETION_TTL_MS = 8_000;

/** Status colors — exported for use in 3D badge and log panel. */
export const COMMAND_STATUS_COLORS: Record<CommandLifecycleStatus, string> = {
  pending:    "#ffcc44",
  processing: "#44aaff",
  completed:  "#00ff88",
  failed:     "#ff4444",
  rejected:   "#ff8844",
};

/** Status icons for compact display. */
export const COMMAND_STATUS_ICONS: Record<CommandLifecycleStatus, string> = {
  pending:    "⋯",
  processing: "▷",
  completed:  "✓",
  failed:     "✗",
  rejected:   "⊘",
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a command as observed by the GUI.
 *
 * Transition graph:
 *   pending → processing → completed
 *           → processing → failed
 *   pending → rejected               (pre-execution rejection)
 */
export type CommandLifecycleStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "rejected";

/**
 * A single command entry in the lifecycle log.
 *
 * agentId may be absent for system/user-originated commands that are not
 * directly associated with a specific agent.
 */
export interface CommandLifecycleEntry {
  /** Stable correlation key across all lifecycle events for this command. */
  command_id: string;
  /** GUI command type string (e.g. "agent.spawn", "task.create"). */
  command_type: string;
  /** Current lifecycle status. */
  status: CommandLifecycleStatus;
  /** Agent ID this command targets, if determinable. */
  agentId?: string;
  /** Room ID context, if determinable. */
  roomId?: string;
  /** Source channel of the command. */
  source?: string;
  /** ISO timestamp when the command was first observed (issued or local). */
  ts: string;
  /** ISO timestamp of the most recent status update. */
  updatedAt: string;
  /**
   * Error information for failed / rejected commands.
   * Contains error_code + error_message or rejection_code + rejection_reason.
   */
  error?: { code: string; message: string };
  /**
   * Wall-clock execution duration in milliseconds, populated on completion/failure.
   */
  duration_ms?: number;
  /**
   * monotonic insertion index — used for stable ordering in the log
   * (timestamps can collide at high dispatch rates).
   */
  seq: number;
}

/**
 * Incoming event shape forwarded by use-orchestrator-ws.ts.
 * Mirrors a subset of ConitensEvent.
 */
export interface IncomingCommandEvent {
  /** One of: command.issued | command.completed | command.failed | command.rejected */
  type: string;
  /** Event payload (strongly typed at protocol level; loosely typed here). */
  payload: Record<string, unknown>;
  /** ISO timestamp of the event. */
  ts?: string;
  /** Actor who originated the command. */
  actor?: { kind: string; id: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store state & actions
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandLifecycleState {
  /**
   * All command entries keyed by command_id.
   * Entries are never removed from this map (bounded by MAX_LOG_ENTRIES eviction
   * of the ordered log; the map itself is cleaned when entries leave the log).
   */
  commands: Record<string, CommandLifecycleEntry>;

  /**
   * Ordered log of command entry keys (newest first).
   * Bounded to MAX_LOG_ENTRIES. Oldest entry evicted when cap is reached.
   */
  log: string[];

  /**
   * Per-agent index of *active* command IDs (pending or processing).
   * Entries are removed after COMPLETION_TTL_MS once a terminal state is reached.
   *
   * Used by CommandStatusBadge to show per-agent indicators in the 3D scene.
   */
  agentCommandMap: Record<string, string[]>;

  /** Monotonic sequence counter for stable ordering. */
  _seq: number;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Add a locally-dispatched command (before orchestrator round-trip).
   * Sets status = "pending". Idempotent if command_id already present.
   *
   * @param command_id   Stable ID for this command.
   * @param command_type GUI command type.
   * @param agentId      Target agent, if applicable.
   * @param roomId       Target room, if applicable.
   * @param ts           ISO timestamp of dispatch.
   */
  addLocalCommand(
    command_id: string,
    command_type: string,
    agentId?: string,
    roomId?: string,
    ts?: string,
  ): void;

  /**
   * Ingest a live command event from the WebSocket bus.
   *
   * Handles: command.issued | command.completed | command.failed | command.rejected
   *
   * @param event The raw event envelope from the orchestrator WebSocket bus.
   */
  handleCommandEvent(event: IncomingCommandEvent): void;

  /**
   * Return all active (pending/processing) command entries for a given agent.
   *
   * Used by CommandStatusBadge to decide which badges to show.
   */
  getActiveCommandsForAgent(agentId: string): CommandLifecycleEntry[];

  /**
   * Return ordered log entries (newest first), up to `limit`.
   */
  getLogEntries(limit?: number): CommandLifecycleEntry[];

  /**
   * Clear the command log and all agent maps.
   * For testing / replay reset purposes only.
   */
  clearLog(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract agentId from a command event.
 *
 * Heuristic chain:
 *   1. If actor.kind === "agent", use actor.id
 *   2. If payload.input.agent_id is a string, use that
 *   3. If payload.agent_id is a string, use that
 *
 * Returns undefined if no agent context can be found.
 */
function extractAgentId(
  actor: IncomingCommandEvent["actor"],
  payload: Record<string, unknown>,
): string | undefined {
  if (actor?.kind === "agent" && typeof actor.id === "string") return actor.id;
  const input = payload["input"];
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const agentId = (input as Record<string, unknown>)["agent_id"];
    if (typeof agentId === "string") return agentId;
  }
  if (typeof payload["agent_id"] === "string") return payload["agent_id"];
  return undefined;
}

/**
 * Remove a command_id from an agent's active set.
 * Returns a new agentCommandMap without mutating the original.
 */
function removeFromAgentMap(
  map: Record<string, string[]>,
  commandId: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [agentId, ids] of Object.entries(map)) {
    const filtered = ids.filter((id) => id !== commandId);
    if (filtered.length > 0) {
      result[agentId] = filtered;
    }
    // agents with empty lists are pruned automatically
  }
  return result;
}

/**
 * Add a command_id to an agent's active set.
 * Returns a new agentCommandMap without mutating the original.
 */
function addToAgentMap(
  map: Record<string, string[]>,
  agentId: string,
  commandId: string,
): Record<string, string[]> {
  const existing = map[agentId] ?? [];
  if (existing.includes(commandId)) return map;
  return { ...map, [agentId]: [...existing, commandId] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store creation
// ─────────────────────────────────────────────────────────────────────────────

export const useCommandLifecycleStore = create<CommandLifecycleState>()(
  (set, get) => ({
    commands: {},
    log: [],
    agentCommandMap: {},
    _seq: 0,

    // ── addLocalCommand ───────────────────────────────────────────────────

    addLocalCommand(command_id, command_type, agentId, roomId, ts) {
      if (get().commands[command_id]) return; // idempotent

      const now = ts ?? new Date().toISOString();
      const seq = get()._seq + 1;

      const entry: CommandLifecycleEntry = {
        command_id,
        command_type,
        status: "pending",
        agentId,
        roomId,
        source: "gui",
        ts: now,
        updatedAt: now,
        seq,
      };

      set((state) => {
        // Evict oldest entry if at capacity
        let { log, commands } = state;
        if (log.length >= MAX_LOG_ENTRIES) {
          const evicted = log[log.length - 1]!;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [evicted]: _dropped, ...rest } = commands;
          commands = rest;
          log = log.slice(0, log.length - 1);
        }

        // Add to per-agent map
        const agentCommandMap = agentId
          ? addToAgentMap(state.agentCommandMap, agentId, command_id)
          : state.agentCommandMap;

        return {
          commands: { ...commands, [command_id]: entry },
          log: [command_id, ...log],
          agentCommandMap,
          _seq: seq,
        };
      });
    },

    // ── handleCommandEvent ────────────────────────────────────────────────

    handleCommandEvent(event) {
      const { type, payload, ts: eventTs, actor } = event;
      const now = eventTs ?? new Date().toISOString();

      // ── command.issued ──────────────────────────────────────────────────
      if (type === "command.issued") {
        const command_id   = payload["command_id"]   as string | undefined;
        const command_type = payload["command_type"] as string | undefined;
        const source       = payload["source"]       as string | undefined;
        if (!command_id) return;

        const agentId = extractAgentId(actor, payload);
        const seq = get()._seq + 1;

        set((state) => {
          const existing = state.commands[command_id];
          let updatedEntry: CommandLifecycleEntry;

          if (existing) {
            // Upgrade local pending entry to processing
            updatedEntry = {
              ...existing,
              status: "processing",
              updatedAt: now,
              source: source ?? existing.source,
            };
          } else {
            // New entry not seen locally before
            updatedEntry = {
              command_id,
              command_type: command_type ?? "unknown",
              status: "processing",
              agentId,
              source: source ?? "system",
              ts: now,
              updatedAt: now,
              seq,
            };
          }

          // Evict oldest if needed
          let { log, commands } = state;
          if (!existing && log.length >= MAX_LOG_ENTRIES) {
            const evicted = log[log.length - 1]!;
            const { [evicted]: _dropped, ...rest } = commands;
            commands = rest;
            log = log.slice(0, log.length - 1);
          }

          // Update per-agent map
          const agentCommandMap = agentId
            ? addToAgentMap(
                existing ? state.agentCommandMap : state.agentCommandMap,
                agentId,
                command_id,
              )
            : state.agentCommandMap;

          // Ensure entry is in log (may already be present from local dispatch)
          const newLog = log.includes(command_id)
            ? log
            : [command_id, ...log];

          return {
            commands: { ...commands, [command_id]: updatedEntry },
            log: newLog,
            agentCommandMap,
            _seq: existing ? state._seq : seq,
          };
        });
        return;
      }

      // ── command.completed ───────────────────────────────────────────────
      if (type === "command.completed") {
        const command_id   = payload["command_id"]   as string | undefined;
        const command_type = payload["command_type"] as string | undefined;
        const duration_ms  = payload["duration_ms"]  as number | undefined;
        if (!command_id) return;

        set((state) => {
          const existing = state.commands[command_id];
          if (!existing) return {}; // ignore unknown command completions silently

          const updated: CommandLifecycleEntry = {
            ...existing,
            command_type: command_type ?? existing.command_type,
            status: "completed",
            updatedAt: now,
            duration_ms,
          };

          // Schedule removal from agentCommandMap after TTL
          if (updated.agentId) {
            const { agentId, command_id: cmdId } = updated;
            setTimeout(() => {
              useCommandLifecycleStore.setState((s) => ({
                agentCommandMap: removeFromAgentMap(s.agentCommandMap, cmdId),
              }));
            }, COMPLETION_TTL_MS);
          }

          return { commands: { ...state.commands, [command_id]: updated } };
        });
        return;
      }

      // ── command.failed ──────────────────────────────────────────────────
      if (type === "command.failed") {
        const command_id   = payload["command_id"]   as string | undefined;
        const command_type = payload["command_type"] as string | undefined;
        const error_code   = payload["error_code"]   as string | undefined;
        const error_msg    = payload["error_message"] as string | undefined;
        const duration_ms  = payload["duration_ms"]   as number | undefined;
        if (!command_id) return;

        set((state) => {
          const existing = state.commands[command_id];
          if (!existing) return {};

          const updated: CommandLifecycleEntry = {
            ...existing,
            command_type: command_type ?? existing.command_type,
            status: "failed",
            updatedAt: now,
            duration_ms,
            error: error_code
              ? { code: error_code, message: error_msg ?? error_code }
              : undefined,
          };

          if (updated.agentId) {
            const { agentId: _a, command_id: cmdId } = updated;
            setTimeout(() => {
              useCommandLifecycleStore.setState((s) => ({
                agentCommandMap: removeFromAgentMap(s.agentCommandMap, cmdId),
              }));
            }, COMPLETION_TTL_MS);
          }

          return { commands: { ...state.commands, [command_id]: updated } };
        });
        return;
      }

      // ── command.rejected ────────────────────────────────────────────────
      if (type === "command.rejected") {
        const command_id       = payload["command_id"]       as string | undefined;
        const command_type     = payload["command_type"]     as string | undefined;
        const rejection_code   = payload["rejection_code"]   as string | undefined;
        const rejection_reason = payload["rejection_reason"] as string | undefined;

        if (!command_id && !rejection_code) return;

        const effectiveId = command_id ?? `rejected-${Date.now()}`;
        const seq = get()._seq + 1;

        set((state) => {
          const existing = state.commands[effectiveId];
          let updated: CommandLifecycleEntry;

          if (existing) {
            updated = {
              ...existing,
              command_type: command_type ?? existing.command_type,
              status: "rejected",
              updatedAt: now,
              error: rejection_code
                ? { code: rejection_code, message: rejection_reason ?? rejection_code }
                : undefined,
            };
          } else {
            // Rejection without prior local entry
            updated = {
              command_id: effectiveId,
              command_type: command_type ?? "unknown",
              status: "rejected",
              agentId: extractAgentId(actor, payload),
              source: "system",
              ts: now,
              updatedAt: now,
              seq,
              error: rejection_code
                ? { code: rejection_code, message: rejection_reason ?? rejection_code }
                : undefined,
            };
          }

          let { log, commands } = state;
          if (!existing && log.length >= MAX_LOG_ENTRIES) {
            const evicted = log[log.length - 1]!;
            const { [evicted]: _dropped, ...rest } = commands;
            commands = rest;
            log = log.slice(0, log.length - 1);
          }

          // Rejection: remove from agentCommandMap after TTL
          if (updated.agentId) {
            const { command_id: cmdId } = updated;
            setTimeout(() => {
              useCommandLifecycleStore.setState((s) => ({
                agentCommandMap: removeFromAgentMap(s.agentCommandMap, cmdId),
              }));
            }, COMPLETION_TTL_MS);
          }

          const newLog = log.includes(effectiveId)
            ? log
            : [effectiveId, ...log];

          return {
            commands: { ...commands, [effectiveId]: updated },
            log: newLog,
            _seq: existing ? state._seq : seq,
          };
        });
        return;
      }

      // Unknown command event type — ignore silently
    },

    // ── getActiveCommandsForAgent ──────────────────────────────────────────

    getActiveCommandsForAgent(agentId) {
      const { agentCommandMap, commands } = get();
      const ids = agentCommandMap[agentId] ?? [];
      return ids
        .map((id) => commands[id])
        .filter((e): e is CommandLifecycleEntry => e != null);
    },

    // ── getLogEntries ──────────────────────────────────────────────────────

    getLogEntries(limit = MAX_LOG_ENTRIES) {
      const { log, commands } = get();
      return log
        .slice(0, limit)
        .map((id) => commands[id])
        .filter((e): e is CommandLifecycleEntry => e != null);
    },

    // ── clearLog ───────────────────────────────────────────────────────────

    clearLog() {
      set({ commands: {}, log: [], agentCommandMap: {}, _seq: 0 });
    },
  }),
);
