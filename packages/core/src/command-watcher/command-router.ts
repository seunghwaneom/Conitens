/**
 * @module command-router
 * Sub-AC 8c — Routes validated CommandFile objects to the correct pipeline stage.
 *
 * Pipeline stages
 * ───────────────
 *  orchestrator  — Full pipeline: validate → dedupe → redact → append event
 *                  → run reducers → archive. Covers agent lifecycle, task
 *                  operations, meeting convene, and config changes.
 *
 *  navigation    — Spatial-state-only: append a `layout.changed` event for
 *                  replay fidelity, but trigger no server-side side-effects
 *                  (no AgentSpawner call, no TaskReducer mutation).
 *
 *  reject        — Command failed envelope / payload validation; write a
 *                  `command.rejected` event and archive the file.
 *
 * The router also enriches the payload with cross-cutting metadata
 * (`_command_id`, `_command_type`, `_causation_id`, `_gui_ts`) so that the
 * downstream event record carries the full provenance chain without the
 * reducer needing to re-parse the original file.
 */

import {
  COMMAND_TO_EVENT_TYPE,
  NAVIGATION_COMMAND_TYPES,
  ORCHESTRATOR_COMMAND_TYPES,
  type CommandFile,
  type GuiCommandType,
} from "@conitens/protocol";
import type { CommandData } from "../orchestrator/orchestrator.js";
import type { CommandValidationError } from "./command-validator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline stage types
// ─────────────────────────────────────────────────────────────────────────────

export type CommandPipelineStage =
  | "orchestrator"   // agent/task/meeting/config — full processing
  | "navigation"     // nav.* — record-only, no server side-effects
  | "reject";        // validation failure

export interface OrchestratorRoutedCommand {
  stage: "orchestrator" | "navigation";
  commandData: CommandData;
  guiCommandType: GuiCommandType;
  commandId: string;
}

export interface RejectedRoutedCommand {
  stage: "reject";
  errors: CommandValidationError[];
  commandId: string | undefined;
  filename: string;
}

export type RoutedCommand =
  | OrchestratorRoutedCommand
  | RejectedRoutedCommand;

// ─────────────────────────────────────────────────────────────────────────────
// Main router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a validated `CommandFile` to its pipeline stage and produce the
 * `CommandData` object that the Orchestrator can ingest.
 *
 * @param command   A `CommandFile` that has already passed `validateCommandFile`.
 * @returns         A routed command descriptor.
 */
export function routeCommandFile(command: CommandFile): OrchestratorRoutedCommand {
  const guiType = command.type as GuiCommandType;

  // Determine pipeline stage.
  let stage: "orchestrator" | "navigation";
  if (NAVIGATION_COMMAND_TYPES.has(guiType)) {
    stage = "navigation";
  } else {
    // Everything else (agent.*, task.*, meeting.*, config.*) → full orchestrator.
    stage = "orchestrator";
  }

  // Translate GUI command type → canonical event type.
  const eventType = COMMAND_TO_EVENT_TYPE[guiType];

  // Build the CommandData that the Orchestrator.processCommandData() will consume.
  // We embed command provenance fields inside the payload so that the event log
  // record carries the full traceability chain.
  const enrichedPayload: Record<string, unknown> = {
    ...(command.payload as Record<string, unknown>),
    _command_id:   command.command_id,
    _command_type: guiType,
    _gui_ts:       command.ts,
  };
  if (command.causation_id) {
    enrichedPayload["_causation_id"] = command.causation_id;
  }

  const commandData: CommandData = {
    type: eventType as CommandData["type"],
    run_id: command.run_id,
    actor: command.actor as CommandData["actor"],
    payload: enrichedPayload,
    // Use command_id as idempotency key when no explicit key is set.
    idempotency_key: command.idempotency_key ?? command.command_id,
  };

  if (command.task_id) {
    commandData.task_id = command.task_id;
  }

  return {
    stage,
    commandData,
    guiCommandType: guiType,
    commandId: command.command_id,
  };
}

/**
 * Build a rejection descriptor for a command that failed validation.
 * The caller is responsible for appending a `command.rejected` event.
 */
export function makeRejectedRoute(
  errors: CommandValidationError[],
  filename: string,
  rawCommandId?: unknown,
): RejectedRoutedCommand {
  return {
    stage: "reject",
    errors,
    commandId: typeof rawCommandId === "string" ? rawCommandId : undefined,
    filename,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route classification helpers (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given GuiCommandType produces real Orchestrator
 * side-effects (agent process management, task state, meeting sessions,
 * config file mutations).
 */
export function isOrchestratorCommand(type: GuiCommandType): boolean {
  return ORCHESTRATOR_COMMAND_TYPES.has(type);
}

/**
 * Returns true if the command is navigation-only (spatial store update, no
 * Orchestrator side-effect beyond recording a layout.changed event).
 */
export function isNavigationCommand(type: GuiCommandType): boolean {
  return NAVIGATION_COMMAND_TYPES.has(type);
}
