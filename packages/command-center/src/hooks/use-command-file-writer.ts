/**
 * use-command-file-writer.ts — React hook for writing GUI command files.
 *
 * Sub-AC 8a: Command-file schema + shared constants/types module.
 *
 * The 3D command-center GUI must NEVER mutate orchestrator state directly.
 * Instead it writes a validated JSON command file into the command inbox
 * directory (`.conitens/commands/`).  The Orchestrator file-watcher picks
 * it up, validates it, appends the resulting ConitensEvent to the event log,
 * runs reducers, and deletes the file.
 *
 * This hook provides:
 *  1. `writeCommand<T>(type, payload, opts?)` — typed command dispatch.
 *  2. `writeAgentSpawn / writeAgentTerminate / ...` — convenience wrappers.
 *  3. `commandHistory` — local ring-buffer of recently dispatched commands
 *     (write-only source; never read back from the Orchestrator).
 *  4. `status` — "idle" | "writing" | "error"
 *
 * Transport layer
 * ───────────────
 * In the browser / Electron renderer, the hook POSTs the command JSON to
 * `POST http://localhost:<port>/api/commands` (the command-file ingestion
 * endpoint on the Orchestrator HTTP server).  The server writes the file
 * atomically to the inbox directory and returns 202 Accepted.
 *
 * Fallback: if `VITE_COMMANDS_API_URL` is not set, the hook uses the
 * default base URL `http://localhost:8080`.
 *
 * Security / compliance
 * ──────────────────────
 * • Localhost-only transport (project constraint).
 * • No credentials are stored or transmitted.
 * • Every command is assigned a ULID command_id for idempotency.
 * • Navigation commands (nav.*) are handled locally via the spatial-store
 *   and also written to the command API so they appear in the event log
 *   for 3D replay fidelity.
 */

import { useState, useCallback, useRef } from "react";
import {
  SCHEMA_VERSION,
  type GuiCommandType,
  type CommandFile,
  type GuiCommandPayloadMap,
  type CommandActor,
  type TypedCommandFile,
  type AgentSpawnCommandPayload,
  type AgentTerminateCommandPayload,
  type AgentRestartCommandPayload,
  type AgentPauseCommandPayload,
  type AgentResumeCommandPayload,
  type AgentAssignCommandPayload,
  type AgentSendCommandPayload,
  type TaskCreateCommandPayload,
  type TaskAssignCommandPayload,
  type TaskCancelCommandPayload,
  type MeetingConveneCommandPayload,
  type NavDrillDownCommandPayload,
  type NavDrillUpCommandPayload,
  type NavCameraPresetCommandPayload,
  type NavFocusEntityCommandPayload,
  type ConfigRoomMappingCommandPayload,
  DEFAULT_GUI_ACTOR,
  COMMAND_FILE_PREFIX,
  COMMAND_FILE_INITIAL_STATUS,
  NAVIGATION_COMMAND_TYPES,
} from "@conitens/protocol";
import { useSpatialStore } from "../store/spatial-store.js";
import { useCommandLifecycleStore } from "../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Command API base URL.
 * Must be VITE_-prefixed so Vite inlines the value at build time.
 * Falls back to the default orchestrator HTTP port.
 */
const COMMANDS_API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta.env as Record<string, unknown>)
      ?.VITE_COMMANDS_API_URL) as string || "http://localhost:8080";

const COMMANDS_ENDPOINT = `${COMMANDS_API_BASE}/api/commands`;

/** Maximum commands kept in the local history ring-buffer. */
const MAX_HISTORY = 100;

/** Default run_id for GUI-originated commands (overridable per call). */
const GUI_RUN_ID = "gui-session";

// ─────────────────────────────────────────────────────────────────────────────
// ULID-compatible nano-ID generator (no external dep)
// ─────────────────────────────────────────────────────────────────────────────

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32

function generateCommandId(): string {
  const now = Date.now();
  const chars: string[] = [];
  // 10 time characters
  let t = now;
  for (let i = 9; i >= 0; i--) {
    chars[i] = ENCODING[t % 32]!;
    t = Math.floor(t / 32);
  }
  // 16 random characters
  for (let i = 10; i < 26; i++) {
    chars[i] = ENCODING[Math.floor(Math.random() * 32)]!;
  }
  return `${COMMAND_FILE_PREFIX}${chars.join("")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CommandWriterStatus = "idle" | "writing" | "error";

/** A command record stored in the local history. */
export interface CommandHistoryEntry {
  command_id: string;
  type: GuiCommandType;
  ts: string;
  status: "pending" | "accepted" | "error";
  error?: string;
}

/** Options accepted by `writeCommand`. */
export interface WriteCommandOptions {
  /** Override the run_id (default: "gui-session"). */
  run_id?: string;
  /** Override the actor (default: DEFAULT_GUI_ACTOR). */
  actor?: CommandActor;
  /** Explicit task context. */
  task_id?: string;
  /**
   * Explicit idempotency key.
   * If omitted, the command_id is used as the key.
   */
  idempotency_key?: string;
  /** Causation event id for audit chaining. */
  causation_id?: string;
}

/** Return type of the `useCommandFileWriter` hook. */
export interface CommandFileWriter {
  /** Current write-operation status. */
  status: CommandWriterStatus;

  /** Ring-buffer of recently dispatched commands (newest first). */
  commandHistory: CommandHistoryEntry[];

  /** Last error message, if any. */
  lastError: string | null;

  /** Clear the error state. */
  clearError: () => void;

  // ── Generic dispatcher ──────────────────────────────────────────────────

  /**
   * Write a typed command file and POST it to the command ingestion API.
   *
   * @param type    The command type (one of GUI_COMMAND_TYPES).
   * @param payload The typed payload for the command.
   * @param opts    Optional overrides.
   * @returns       The generated command envelope (before network round-trip).
   */
  writeCommand: <T extends GuiCommandType>(
    type: T,
    payload: GuiCommandPayloadMap[T],
    opts?: WriteCommandOptions,
  ) => Promise<TypedCommandFile<T>>;

  // ── Agent lifecycle shortcuts ───────────────────────────────────────────

  spawnAgent:      (payload: AgentSpawnCommandPayload,      opts?: WriteCommandOptions) => Promise<void>;
  terminateAgent:  (payload: AgentTerminateCommandPayload,  opts?: WriteCommandOptions) => Promise<void>;
  restartAgent:    (payload: AgentRestartCommandPayload,    opts?: WriteCommandOptions) => Promise<void>;
  pauseAgent:      (payload: AgentPauseCommandPayload,      opts?: WriteCommandOptions) => Promise<void>;
  resumeAgent:     (payload: AgentResumeCommandPayload,     opts?: WriteCommandOptions) => Promise<void>;
  assignAgent:     (payload: AgentAssignCommandPayload,     opts?: WriteCommandOptions) => Promise<void>;
  sendAgentCommand:(payload: AgentSendCommandPayload,       opts?: WriteCommandOptions) => Promise<void>;

  // ── Task operation shortcuts ────────────────────────────────────────────

  createTask: (payload: TaskCreateCommandPayload,  opts?: WriteCommandOptions) => Promise<void>;
  assignTask: (payload: TaskAssignCommandPayload,  opts?: WriteCommandOptions) => Promise<void>;
  cancelTask: (payload: TaskCancelCommandPayload,  opts?: WriteCommandOptions) => Promise<void>;

  // ── Meeting shortcut ────────────────────────────────────────────────────

  conveneMeeting: (payload: MeetingConveneCommandPayload, opts?: WriteCommandOptions) => Promise<void>;

  // ── Navigation shortcuts (also apply to spatial-store immediately) ──────

  drillDown:     (payload: NavDrillDownCommandPayload,   opts?: WriteCommandOptions) => Promise<void>;
  drillUp:       (payload: NavDrillUpCommandPayload,     opts?: WriteCommandOptions) => Promise<void>;
  setCameraPreset:(payload: NavCameraPresetCommandPayload, opts?: WriteCommandOptions) => Promise<void>;
  focusEntity:   (payload: NavFocusEntityCommandPayload, opts?: WriteCommandOptions) => Promise<void>;

  // ── Config shortcuts ────────────────────────────────────────────────────

  updateRoomMapping: (payload: ConfigRoomMappingCommandPayload, opts?: WriteCommandOptions) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `useCommandFileWriter` — React hook for GUI → Orchestrator command dispatch.
 *
 * Mount once (e.g. in App.tsx) and distribute via context, or call directly
 * from any component that needs to issue commands.
 *
 * @example
 * ```tsx
 * const { spawnAgent, status } = useCommandFileWriter();
 * // ...
 * await spawnAgent({ agent_id: "researcher-3", persona: "researcher", room_id: "lab" });
 * ```
 */
export function useCommandFileWriter(): CommandFileWriter {
  const [status, setStatus] = useState<CommandWriterStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const historyRef = useRef<CommandHistoryEntry[]>([]);

  // Spatial store for immediate navigation side-effects (nav.* commands).
  const spatialStore = useSpatialStore.getState();

  // ── Core dispatch ──────────────────────────────────────────────────────────

  const writeCommand = useCallback(
    async <T extends GuiCommandType>(
      type: T,
      payload: GuiCommandPayloadMap[T],
      opts: WriteCommandOptions = {},
    ): Promise<TypedCommandFile<T>> => {
      const command_id = generateCommandId();
      const created_at_ms = Date.now();
      const ts = new Date(created_at_ms).toISOString();

      const commandFile: TypedCommandFile<T> = {
        schema: SCHEMA_VERSION,
        command_id,
        type,
        ts,
        run_id: opts.run_id ?? GUI_RUN_ID,
        task_id: opts.task_id,
        actor: opts.actor ?? DEFAULT_GUI_ACTOR,
        payload,
        // Sub-AC 8a: every serialized Command record carries status=pending and
        // explicit timestamps so the Orchestrator and replay engine can track
        // command lifecycle from the moment of user interaction.
        status: COMMAND_FILE_INITIAL_STATUS,
        created_at_ms,
        idempotency_key: opts.idempotency_key ?? command_id,
        causation_id: opts.causation_id,
      };

      // Track in history ring-buffer (newest first)
      const entry: CommandHistoryEntry = {
        command_id,
        type,
        ts,
        status: "pending",
      };
      historyRef.current = [entry, ...historyRef.current].slice(0, MAX_HISTORY);

      // Sub-AC 8c: Register the command in the lifecycle store so CommandStatusBadge
      // and CommandLogPanel can show it as "pending" from the moment of dispatch.
      {
        // Derive agentId from the payload if this is an agent-targeted command
        const p = payload as Record<string, unknown>;
        const agentId: string | undefined =
          typeof p["agent_id"] === "string" ? p["agent_id"] : undefined;
        const roomId: string | undefined =
          typeof p["room_id"] === "string" ? p["room_id"] : undefined;
        useCommandLifecycleStore.getState().addLocalCommand(
          command_id, type, agentId, roomId, ts,
        );
      }

      // ── Navigation commands: apply side-effect to spatial store first ──────
      if (NAVIGATION_COMMAND_TYPES.has(type)) {
        try {
          applyNavigationSideEffect(type, payload, spatialStore);
        } catch {
          // Non-fatal — the command is still sent for recording
        }
      }

      // ── POST to command API ────────────────────────────────────────────────
      setStatus("writing");
      try {
        const response = await fetch(COMMANDS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commandFile),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "(no body)");
          throw new Error(`Command API returned ${response.status}: ${text}`);
        }

        // Mark as accepted in history
        entry.status = "accepted";
        setStatus("idle");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        entry.status = "error";
        entry.error = msg;
        setLastError(msg);
        setStatus("error");
        console.warn("[useCommandFileWriter] Command dispatch failed:", msg, commandFile);
        // Rethrow so callers can handle if needed
        throw err;
      }

      return commandFile;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const clearError = useCallback(() => {
    setLastError(null);
    setStatus("idle");
  }, []);

  // ── Convenience wrappers ───────────────────────────────────────────────────

  const spawnAgent = useCallback(
    (p: AgentSpawnCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.spawn", p, o).then(() => undefined),
    [writeCommand],
  );

  const terminateAgent = useCallback(
    (p: AgentTerminateCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.terminate", p, o).then(() => undefined),
    [writeCommand],
  );

  const restartAgent = useCallback(
    (p: AgentRestartCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.restart", p, o).then(() => undefined),
    [writeCommand],
  );

  const pauseAgent = useCallback(
    (p: AgentPauseCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.pause", p, o).then(() => undefined),
    [writeCommand],
  );

  const resumeAgent = useCallback(
    (p: AgentResumeCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.resume", p, o).then(() => undefined),
    [writeCommand],
  );

  const assignAgent = useCallback(
    (p: AgentAssignCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.assign", p, o).then(() => undefined),
    [writeCommand],
  );

  const sendAgentCommand = useCallback(
    (p: AgentSendCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("agent.send_command", p, o).then(() => undefined),
    [writeCommand],
  );

  const createTask = useCallback(
    (p: TaskCreateCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("task.create", p, o).then(() => undefined),
    [writeCommand],
  );

  const assignTask = useCallback(
    (p: TaskAssignCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("task.assign", p, o).then(() => undefined),
    [writeCommand],
  );

  const cancelTask = useCallback(
    (p: TaskCancelCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("task.cancel", p, o).then(() => undefined),
    [writeCommand],
  );

  const conveneMeeting = useCallback(
    (p: MeetingConveneCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("meeting.convene", p, o).then(() => undefined),
    [writeCommand],
  );

  const drillDown = useCallback(
    (p: NavDrillDownCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("nav.drill_down", p, o).then(() => undefined),
    [writeCommand],
  );

  const drillUp = useCallback(
    (p: NavDrillUpCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("nav.drill_up", p, o).then(() => undefined),
    [writeCommand],
  );

  const setCameraPreset = useCallback(
    (p: NavCameraPresetCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("nav.camera_preset", p, o).then(() => undefined),
    [writeCommand],
  );

  const focusEntity = useCallback(
    (p: NavFocusEntityCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("nav.focus_entity", p, o).then(() => undefined),
    [writeCommand],
  );

  const updateRoomMapping = useCallback(
    (p: ConfigRoomMappingCommandPayload, o?: WriteCommandOptions) =>
      writeCommand("config.room_mapping", p, o).then(() => undefined),
    [writeCommand],
  );

  return {
    status,
    commandHistory: historyRef.current,
    lastError,
    clearError,
    writeCommand,
    spawnAgent,
    terminateAgent,
    restartAgent,
    pauseAgent,
    resumeAgent,
    assignAgent,
    sendAgentCommand,
    createTask,
    assignTask,
    cancelTask,
    conveneMeeting,
    drillDown,
    drillUp,
    setCameraPreset,
    focusEntity,
    updateRoomMapping,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply immediate local side-effects for navigation commands.
 * These mirror the store actions so the camera responds instantly without
 * waiting for the Orchestrator round-trip.
 *
 * @param type    The nav.* command type.
 * @param payload The raw payload (untyped at call site).
 * @param store   Current spatial store state snapshot.
 */
function applyNavigationSideEffect(
  type: GuiCommandType,
  payload: unknown,
  store: ReturnType<typeof useSpatialStore.getState>,
): void {
  switch (type) {
    case "nav.drill_down": {
      const p = payload as NavDrillDownCommandPayload;
      if (p.level === "floor") {
        store.drillIntoFloor(Number(p.target_id));
      } else if (p.level === "room") {
        store.drillIntoRoom(String(p.target_id));
      } else if (p.level === "agent") {
        // drillIntoAgent needs a world position; pass a zero vector as a
        // default when called from a pure-command context.
        store.drillIntoAgent(String(p.target_id), { x: 0, y: 0, z: 0 });
      }
      break;
    }
    case "nav.drill_up": {
      const p = payload as NavDrillUpCommandPayload;
      const steps = p.steps ?? 1;
      for (let i = 0; i < steps; i++) {
        store.drillAscend();
      }
      break;
    }
    case "nav.camera_preset": {
      const p = payload as NavCameraPresetCommandPayload;
      store.setCameraPreset(p.preset);
      break;
    }
    default:
      break;
  }
}
