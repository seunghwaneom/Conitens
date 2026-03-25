/**
 * @module command-file
 * RFC-1.0.1 §10 Extension — GUI-triggered command-file schema.
 *
 * Defines the complete set of command types that the 3D command-center GUI
 * can write as JSON command files for ingestion by the Orchestrator pipeline.
 *
 * Architecture
 * ────────────
 * The GUI never mutates shared state directly. Instead it writes a command
 * file (JSON) into the `.conitens/commands/` inbox directory. The Orchestrator
 * watches that directory, reads each file, validates the payload, appends the
 * corresponding ConitensEvent to the event-log, runs reducers, and deletes
 * the file. This ensures:
 *
 *  • All GUI-triggered state changes are event-sourced (record transparency).
 *  • The GUI and Orchestrator share one authoritative type contract (this file).
 *  • The command inbox is write-only from the GUI's perspective.
 *
 * Command categories
 * ──────────────────
 *  A. Agent lifecycle  — spawn / terminate / restart / pause / resume / assign
 *  B. Task operations  — create / assign / cancel / update_spec
 *  C. Meeting convene  — start a multi-agent collaboration session
 *  D. Navigation       — drill-down / camera-preset (spatial store only, no
 *                        orchestrator side-effect; written for replay fidelity)
 *  E. Config changes   — room-mapping / agent-persona / building-layout
 *
 * File format
 * ───────────
 * Each command file is a single UTF-8 JSON object that satisfies
 * `CommandFile<T>`. The filename is irrelevant; the Orchestrator processes
 * all *.json files in the commands inbox directory.
 *
 * Example (spawn agent):
 * ```json
 * {
 *   "schema": "1.0.1",
 *   "command_id": "cmd_01J3...",
 *   "type": "agent.spawn",
 *   "ts": "2026-03-24T12:00:00.000Z",
 *   "run_id": "gui-session-abc",
 *   "actor": { "kind": "user", "id": "gui" },
 *   "payload": {
 *     "agent_id": "researcher-2",
 *     "persona": "researcher",
 *     "room_id": "research-lab",
 *     "display_name": "Researcher-2"
 *   }
 * }
 * ```
 */

import { SCHEMA_VERSION, type SchemaVersion } from "./schema-version.js";

// ─────────────────────────────────────────────────────────────────────────────
// Command lifecycle status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a command record.
 *
 * Transitions (GUI-side → Orchestrator-side):
 *   pending    — written by the GUI, not yet picked up by the Orchestrator
 *   processing — Orchestrator has read and is executing the command
 *   completed  — Orchestrator successfully processed the command
 *   failed     — Orchestrator attempted processing but encountered an error
 *   rejected   — Orchestrator rejected the command before execution
 *                (schema / auth / policy / dedupe violation)
 *
 * The GUI always writes `"pending"`.  The Orchestrator updates status via
 * the event log (command.issued, command.completed, command.failed,
 * command.rejected events) — it does NOT rewrite the command file.
 */
export type CommandFileStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "rejected";

/**
 * The initial status assigned to every command file written by the GUI.
 * The Orchestrator reads the file, transitions state via events, and deletes
 * the file from the inbox.
 */
export const COMMAND_FILE_INITIAL_STATUS: CommandFileStatus = "pending";

// ─────────────────────────────────────────────────────────────────────────────
// Command type registry
// ─────────────────────────────────────────────────────────────────────────────

/** All command types that the GUI can emit. */
export const GUI_COMMAND_TYPES = [
  // A. Agent lifecycle
  "agent.spawn",
  "agent.terminate",
  "agent.restart",
  "agent.pause",
  "agent.resume",
  "agent.assign",
  "agent.send_command",

  // B. Task operations
  "task.create",
  "task.assign",
  "task.cancel",
  "task.update_spec",

  // C. Meeting
  "meeting.convene",

  // D. Navigation (spatial-state only, no orchestrator effect beyond recording)
  "nav.drill_down",
  "nav.drill_up",
  "nav.camera_preset",
  "nav.focus_entity",

  // E. Config changes
  "config.room_mapping",
  "config.agent_persona",
  "config.building_layout",

  // F. Pipeline operations (Sub-AC 7.2)
  "pipeline.trigger",
  "pipeline.chain",
  "pipeline.cancel",
] as const;

export type GuiCommandType = (typeof GUI_COMMAND_TYPES)[number];

/** Runtime set for O(1) membership test. */
export const GUI_COMMAND_TYPE_SET: ReadonlySet<string> = new Set(
  GUI_COMMAND_TYPES,
);

export function isGuiCommandType(s: string): s is GuiCommandType {
  return GUI_COMMAND_TYPE_SET.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command envelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base envelope shared by every command file written by the GUI.
 *
 * @template T  The typed payload interface for the specific command.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CommandFile<T = Record<string, unknown>> {
  /** Protocol schema version — must match SCHEMA_VERSION constant. */
  schema: SchemaVersion;

  /** ULID-based unique command identifier (`cmd_<ulid>`). */
  command_id: string;

  /** Discriminant — one of the GUI_COMMAND_TYPES values. */
  type: GuiCommandType;

  /** ISO 8601 timestamp of when the command was created. */
  ts: string;

  /** Orchestrator run context identifier. */
  run_id: string;

  /** Optional task context. */
  task_id?: string;

  /** Identity of the actor that issued the command. */
  actor: CommandActor;

  /** Command-specific payload. */
  payload: T;

  /**
   * Lifecycle status of this command record.
   *
   * The GUI MUST set this to `"pending"` when writing the file.
   * The Orchestrator uses event-log events (command.issued / command.completed /
   * command.failed / command.rejected) to record state transitions — it does
   * NOT rewrite this field in the file.
   *
   * Defaults to `"pending"` if absent (backward-compatible with files produced
   * before this field was added to the schema).
   */
  status?: CommandFileStatus;

  /**
   * Wall-clock timestamp (Unix ms) when the command was created by the GUI.
   * Complements `ts` (ISO 8601 string) for numeric comparisons and sorting.
   */
  created_at_ms?: number;

  /**
   * Optional idempotency key for deduplication (§14).
   * The Orchestrator will ignore a command with a key it has already processed.
   */
  idempotency_key?: string;

  /** Causation chain — event_id of the triggering UI event (optional). */
  causation_id?: string;
}

/** Actor identity for GUI-originated commands. */
export interface CommandActor {
  kind: "user" | "agent" | "system";
  /** Stable identifier — e.g. "gui", "user:alice", "agent:manager-1". */
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Agent lifecycle payloads
// ─────────────────────────────────────────────────────────────────────────────

/** agent.spawn — instantiate a new agent process. */
export interface AgentSpawnCommandPayload {
  /** Desired agent identifier (must be unique in the run). */
  agent_id: string;
  /**
   * Persona key referencing a YAML definition in `.agent/agents/<persona>.yaml`.
   * Examples: "manager", "implementer", "researcher", "validator".
   */
  persona: string;
  /** Target room to place the avatar in after spawn. */
  room_id: string;
  /** Human-readable label shown on the 3D avatar. */
  display_name?: string;
  /** Optional tmux session name override. */
  session_name?: string;
  /** Additional environment variables to inject into the agent process. */
  env?: Record<string, string>;
}

/** agent.terminate — gracefully stop a running agent. */
export interface AgentTerminateCommandPayload {
  agent_id: string;
  /**
   * Termination reason stored in the event log.
   * Defaults to "user_requested" if omitted.
   */
  reason?: AgentTerminationReasonCode;
  /** If true, forcefully kill the process without graceful shutdown. */
  force?: boolean;
}

export type AgentTerminationReasonCode =
  | "user_requested"
  | "task_completed"
  | "error"
  | "scaling_down"
  | "config_change";

/** agent.restart — restart a stopped, crashed, or paused agent. */
export interface AgentRestartCommandPayload {
  agent_id: string;
  /** If true, wipe the agent's ephemeral context before restarting. */
  clear_context?: boolean;
}

/** agent.pause — suspend an active agent (preserves context). */
export interface AgentPauseCommandPayload {
  agent_id: string;
  /** Optional reason for audit trail. */
  reason?: string;
}

/** agent.resume — un-suspend a paused agent. */
export interface AgentResumeCommandPayload {
  agent_id: string;
}

/**
 * agent.assign — re-assign an agent to a different room.
 * Triggers a diegetic avatar move in the 3D scene.
 */
export interface AgentAssignCommandPayload {
  agent_id: string;
  /** Target room id. */
  room_id: string;
  /** New role label (optional — keeps current role if omitted). */
  role?: string;
}

/** agent.send_command — forward a freeform instruction to an agent's stdin. */
export interface AgentSendCommandPayload {
  agent_id: string;
  /** The text instruction to send. */
  instruction: string;
  /** Optional task context for tracking. */
  task_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Task operation payloads
// ─────────────────────────────────────────────────────────────────────────────

/** task.create — define a new task and optionally assign it immediately. */
export interface TaskCreateCommandPayload {
  /** Desired task id (orchestrator may suffix for uniqueness). */
  task_id: string;
  title: string;
  description?: string;
  /** Agent to assign on creation (optional). */
  assigned_to?: string;
  /** Priority: 1 = critical, 5 = low. Default 3. */
  priority?: 1 | 2 | 3 | 4 | 5;
  /** ISO 8601 deadline. */
  due_by?: string;
  /** Arbitrary structured metadata. */
  metadata?: Record<string, unknown>;
}

/** task.assign — assign an existing task to an agent. */
export interface TaskAssignCommandPayload {
  task_id: string;
  agent_id: string;
  /** If true, unassign from current agent first. Default true. */
  reassign?: boolean;
}

/** task.cancel — mark a task as cancelled. */
export interface TaskCancelCommandPayload {
  task_id: string;
  reason?: string;
}

/** task.update_spec — mutate task description / metadata. */
export interface TaskUpdateSpecCommandPayload {
  task_id: string;
  title?: string;
  description?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  due_by?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Meeting convene payload
// ─────────────────────────────────────────────────────────────────────────────

/** meeting.convene — launch a multi-agent collaboration session. */
export interface MeetingConveneCommandPayload {
  /** Room where the meeting takes place (maps to 3D room). */
  room_id: string;
  topic: string;
  agenda?: string[];
  /** Agent ids that must join. */
  participant_ids: string[];
  /** Expected wall-clock duration in milliseconds. */
  scheduled_duration_ms?: number;
  /** GUI session user who initiated the meeting. */
  requested_by: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Navigation payloads (spatial-state-only — no orchestrator side-effect)
// ─────────────────────────────────────────────────────────────────────────────

export type DrillTargetLevel = "building" | "floor" | "room" | "agent";

/** nav.drill_down — navigate into a floor, room, or agent. */
export interface NavDrillDownCommandPayload {
  level: DrillTargetLevel;
  /** The entity id to drill into (floor index, room id, or agent id). */
  target_id: string | number;
}

/** nav.drill_up — navigate back up one or more levels. */
export interface NavDrillUpCommandPayload {
  /** How many levels to pop. Default 1. */
  steps?: number;
}

/** nav.camera_preset — switch to a predefined camera position. */
export interface NavCameraPresetCommandPayload {
  preset: "overview" | "overhead" | "cutaway" | "groundFloor" | "opsFloor";
}

/** nav.focus_entity — smoothly move camera to focus on a named entity. */
export interface NavFocusEntityCommandPayload {
  entity_type: "building" | "room" | "agent" | "task";
  entity_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// E. Config change payloads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * config.room_mapping — update the role-to-room assignment configuration.
 * Overwrites the `.agent/rooms/_room-mapping.yaml` file via the Orchestrator.
 */
export interface ConfigRoomMappingCommandPayload {
  /** Partial or full mapping update (shallow-merged by the Orchestrator). */
  mappings: Array<{
    role: string;
    room_id: string;
    /** Optional display override. */
    label?: string;
  }>;
  /** If true, replace the entire mapping rather than merging. Default false. */
  replace?: boolean;
}

/**
 * config.agent_persona — update a persona YAML definition.
 * Orchestrator writes the result to `.agent/agents/<persona>.yaml`.
 */
export interface ConfigAgentPersonaCommandPayload {
  persona: string;
  /** Partial persona fields to patch. */
  patch: Record<string, unknown>;
}

/**
 * config.building_layout — update room geometry/position overrides.
 * Persisted by the Orchestrator as a layout event and layout YAML.
 */
export interface ConfigBuildingLayoutCommandPayload {
  /** Layout snapshot — arbitrary geometry overrides. */
  layout: Record<string, unknown>;
  /** Human-readable label for this layout revision. */
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// F. Pipeline operation payloads (Sub-AC 7.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pipeline.trigger — start a named pipeline run, optionally scoped to a room.
 *
 * The Orchestrator resolves the pipeline definition by `pipeline_name`,
 * constructs the step list, emits pipeline.started, then executes each step.
 */
export interface PipelineTriggerCommandPayload {
  /** Name of the pipeline definition to execute (e.g. "agent-bootstrap"). */
  pipeline_name: string;
  /** Room context where the pipeline is being triggered from (optional). */
  room_id?: string;
  /** Agent IDs to scope the pipeline to (optional — resolved by Orchestrator if absent). */
  agent_ids?: string[];
  /** Arbitrary pipeline input parameters forwarded to step handlers. */
  params?: Record<string, unknown>;
  /** Human-readable label for this pipeline run (for display purposes). */
  label?: string;
}

/**
 * pipeline.chain — trigger multiple pipelines in sequence.
 *
 * The Orchestrator executes each entry in `chain` in order; a failure in any
 * step aborts the chain unless `continue_on_error` is set.
 */
export interface PipelineChainCommandPayload {
  /** Ordered list of pipeline entries to execute sequentially. */
  chain: Array<{
    pipeline_name: string;
    params?: Record<string, unknown>;
  }>;
  /** Room context for the entire chain (optional). */
  room_id?: string;
  /** If true, the chain continues even if one pipeline fails. Default false. */
  continue_on_error?: boolean;
  /** Human-readable label for this chain run. */
  label?: string;
}

/**
 * pipeline.cancel — cancel one or all active pipeline runs.
 *
 * The Orchestrator marks the run as cancelled and emits pipeline.failed with
 * error_code = "USER_CANCELLED" for each step that was pending or running.
 */
export interface PipelineCancelCommandPayload {
  /** pipeline_id to cancel. Use "*" to cancel all active pipelines in the room. */
  pipeline_id: string;
  /** Optional reason for audit trail. */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union: GuiCommandPayloadMap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps each `GuiCommandType` to its typed payload interface.
 * Used by the `CommandFile<T>` generic to produce fully-typed command objects.
 */
export interface GuiCommandPayloadMap {
  // Agent lifecycle
  "agent.spawn":        AgentSpawnCommandPayload;
  "agent.terminate":    AgentTerminateCommandPayload;
  "agent.restart":      AgentRestartCommandPayload;
  "agent.pause":        AgentPauseCommandPayload;
  "agent.resume":       AgentResumeCommandPayload;
  "agent.assign":       AgentAssignCommandPayload;
  "agent.send_command": AgentSendCommandPayload;

  // Task operations
  "task.create":        TaskCreateCommandPayload;
  "task.assign":        TaskAssignCommandPayload;
  "task.cancel":        TaskCancelCommandPayload;
  "task.update_spec":   TaskUpdateSpecCommandPayload;

  // Meeting
  "meeting.convene":    MeetingConveneCommandPayload;

  // Navigation
  "nav.drill_down":     NavDrillDownCommandPayload;
  "nav.drill_up":       NavDrillUpCommandPayload;
  "nav.camera_preset":  NavCameraPresetCommandPayload;
  "nav.focus_entity":   NavFocusEntityCommandPayload;

  // Config
  "config.room_mapping":    ConfigRoomMappingCommandPayload;
  "config.agent_persona":   ConfigAgentPersonaCommandPayload;
  "config.building_layout": ConfigBuildingLayoutCommandPayload;

  // Pipeline operations (Sub-AC 7.2)
  "pipeline.trigger": PipelineTriggerCommandPayload;
  "pipeline.chain":   PipelineChainCommandPayload;
  "pipeline.cancel":  PipelineCancelCommandPayload;
}

/** Fully typed command file for a known command type. */
export type TypedCommandFile<T extends GuiCommandType> = Omit<CommandFile, "payload" | "type"> & {
  type: T;
  payload: GuiCommandPayloadMap[T];
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default actor used when the GUI writes command files on behalf of the user.
 * Can be overridden per-call via the `actor` property.
 */
export const DEFAULT_GUI_ACTOR: CommandActor = {
  kind: "user",
  id:   "gui",
};

/**
 * Sub-directory inside the Conitens data directory where the GUI drops
 * command files.  The Orchestrator watches this inbox.
 */
export const COMMAND_INBOX_DIR = "commands";

/**
 * File name prefix for all GUI-originated command files.
 * Full name: `gui_cmd_<ulid>.json`
 */
export const COMMAND_FILE_PREFIX = "gui_cmd_";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — schema validation
// ─────────────────────────────────────────────────────────────────────────────

/** Narrowing guard — checks that an object is a valid CommandFile envelope. */
export function isCommandFile(
  value: unknown,
): value is CommandFile<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["command_id"] === "string" &&
    isGuiCommandType(v["type"] as string) &&
    typeof v["ts"] === "string" &&
    typeof v["run_id"] === "string" &&
    typeof v["actor"] === "object" &&
    v["actor"] !== null &&
    typeof (v["actor"] as Record<string, unknown>)["id"] === "string" &&
    typeof v["payload"] === "object" &&
    v["payload"] !== null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — command-to-event-type mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps each GUI command type to the canonical ConitensEvent type that the
 * Orchestrator should produce after processing the command.
 *
 * Navigation commands produce "layout.changed" events so they appear in the
 * replay timeline.  Config commands produce "system.reconciliation" events.
 */
export const COMMAND_TO_EVENT_TYPE: Readonly<Record<GuiCommandType, string>> =
  {
    // Agent lifecycle → core agent events
    "agent.spawn":        "agent.spawned",
    "agent.terminate":    "agent.terminated",
    "agent.restart":      "agent.lifecycle.changed",
    "agent.pause":        "agent.lifecycle.changed",
    "agent.resume":       "agent.lifecycle.changed",
    "agent.assign":       "agent.assigned",
    "agent.send_command": "message.sent",

    // Task operations → task events
    "task.create":       "task.created",
    "task.assign":       "task.assigned",
    "task.cancel":       "task.cancelled",
    "task.update_spec":  "task.spec_updated",

    // Meeting → meeting events
    "meeting.convene": "meeting.started",

    // Navigation → layout events (recorded for replay)
    "nav.drill_down":    "layout.changed",
    "nav.drill_up":      "layout.changed",
    "nav.camera_preset": "layout.changed",
    "nav.focus_entity":  "layout.changed",

    // Config → system reconciliation events
    "config.room_mapping":    "system.reconciliation",
    "config.agent_persona":   "system.reconciliation",
    "config.building_layout": "layout.updated",

    // Pipeline operations → pipeline events (Sub-AC 7.2)
    "pipeline.trigger": "pipeline.started",
    "pipeline.chain":   "pipeline.started",
    "pipeline.cancel":  "pipeline.failed",
  };

/**
 * Subset of GUI command types that the Orchestrator processes with real
 * side-effects (agent process management, task state, meeting sessions).
 * Navigation commands are in the OTHER subset — they are recorded but require
 * no server-side processing.
 */
export const ORCHESTRATOR_COMMAND_TYPES: ReadonlySet<GuiCommandType> = new Set<GuiCommandType>([
  "agent.spawn",
  "agent.terminate",
  "agent.restart",
  "agent.pause",
  "agent.resume",
  "agent.assign",
  "agent.send_command",
  "task.create",
  "task.assign",
  "task.cancel",
  "task.update_spec",
  "meeting.convene",
  "config.room_mapping",
  "config.agent_persona",
  "config.building_layout",
  // Pipeline operations (Sub-AC 7.2)
  "pipeline.trigger",
  "pipeline.chain",
  "pipeline.cancel",
]);

/** Navigation-only commands — spatial store update, no orchestrator effect. */
export const NAVIGATION_COMMAND_TYPES: ReadonlySet<GuiCommandType> = new Set<GuiCommandType>([
  "nav.drill_down",
  "nav.drill_up",
  "nav.camera_preset",
  "nav.focus_entity",
]);
