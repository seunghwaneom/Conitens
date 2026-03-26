/**
 * @module command-validator
 * Sub-AC 8c — Schema validation for command files entering the ingestion pipeline.
 *
 * Performs two tiers of validation:
 *
 * 1. **Envelope validation** — checks the `CommandFile<T>` envelope fields:
 *    schema, command_id, type, ts (ISO 8601), run_id, actor, payload.
 *
 * 2. **Payload validation** — lightweight structural checks for each of the
 *    20 GUI command types (agent lifecycle, task, meeting, nav, config).
 *    These checks are intentionally non-exhaustive: they catch obviously
 *    malformed commands early without duplicating full JSON-Schema validation.
 *
 * Validation errors are returned as typed `CommandValidationError` objects
 * rather than thrown, so the caller (CommandRouter / Orchestrator) can decide
 * whether to reject or attempt recovery.
 */

import {
  isCommandFile,
  isGuiCommandType,
  SCHEMA_VERSION,
  type CommandFile,
  type GuiCommandType,
} from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export type CommandValidationResult =
  | { valid: true; command: CommandFile }
  | { valid: false; errors: CommandValidationError[] };

export interface CommandValidationError {
  field: string;
  code: ValidationErrorCode;
  message: string;
}

export type ValidationErrorCode =
  | "MISSING_FIELD"
  | "INVALID_TYPE"
  | "SCHEMA_MISMATCH"
  | "INVALID_ISO8601"
  | "INVALID_COMMAND_TYPE"
  | "INVALID_ACTOR"
  | "PAYLOAD_MISSING_FIELD"
  | "PARSE_ERROR";

// ─────────────────────────────────────────────────────────────────────────────
// Main validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a raw parsed object against the `CommandFile` schema.
 *
 * @param raw     The parsed JSON object (already deserialized).
 * @param filename  Original filename for diagnostic messages.
 */
export function validateCommandFile(
  raw: unknown,
  filename: string,
): CommandValidationResult {
  const errors: CommandValidationError[] = [];

  // ── Tier 0: type check ─────────────────────────────────────────────────────
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push({
      field: "<root>",
      code: "INVALID_TYPE",
      message: `${filename}: expected a JSON object, got ${Array.isArray(raw) ? "array" : typeof raw}`,
    });
    return { valid: false, errors };
  }

  const obj = raw as Record<string, unknown>;

  // ── Tier 1: envelope fields ────────────────────────────────────────────────

  // schema
  if (obj["schema"] !== undefined && obj["schema"] !== SCHEMA_VERSION) {
    errors.push({
      field: "schema",
      code: "SCHEMA_MISMATCH",
      message: `${filename}: schema "${obj["schema"]}" does not match expected "${SCHEMA_VERSION}"`,
    });
  }

  // command_id
  if (typeof obj["command_id"] !== "string" || obj["command_id"].trim() === "") {
    errors.push({
      field: "command_id",
      code: "MISSING_FIELD",
      message: `${filename}: "command_id" must be a non-empty string`,
    });
  }

  // type
  if (typeof obj["type"] !== "string") {
    errors.push({
      field: "type",
      code: "MISSING_FIELD",
      message: `${filename}: "type" field is required and must be a string`,
    });
  } else if (!isGuiCommandType(obj["type"])) {
    errors.push({
      field: "type",
      code: "INVALID_COMMAND_TYPE",
      message: `${filename}: unknown command type "${obj["type"]}"`,
    });
  }

  // ts — must be a parseable ISO 8601 date
  if (typeof obj["ts"] !== "string") {
    errors.push({
      field: "ts",
      code: "MISSING_FIELD",
      message: `${filename}: "ts" must be an ISO 8601 timestamp string`,
    });
  } else if (Number.isNaN(Date.parse(obj["ts"]))) {
    errors.push({
      field: "ts",
      code: "INVALID_ISO8601",
      message: `${filename}: "ts" value "${obj["ts"]}" is not a valid ISO 8601 date`,
    });
  }

  // run_id
  if (typeof obj["run_id"] !== "string" || obj["run_id"].trim() === "") {
    errors.push({
      field: "run_id",
      code: "MISSING_FIELD",
      message: `${filename}: "run_id" must be a non-empty string`,
    });
  }

  // actor
  const actor = obj["actor"];
  if (typeof actor !== "object" || actor === null || Array.isArray(actor)) {
    errors.push({
      field: "actor",
      code: "INVALID_ACTOR",
      message: `${filename}: "actor" must be an object with "kind" and "id"`,
    });
  } else {
    const a = actor as Record<string, unknown>;
    if (!["user", "agent", "system"].includes(a["kind"] as string)) {
      errors.push({
        field: "actor.kind",
        code: "INVALID_ACTOR",
        message: `${filename}: "actor.kind" must be "user", "agent", or "system"`,
      });
    }
    if (typeof a["id"] !== "string" || a["id"].trim() === "") {
      errors.push({
        field: "actor.id",
        code: "INVALID_ACTOR",
        message: `${filename}: "actor.id" must be a non-empty string`,
      });
    }
  }

  // payload
  if (typeof obj["payload"] !== "object" || obj["payload"] === null || Array.isArray(obj["payload"])) {
    errors.push({
      field: "payload",
      code: "MISSING_FIELD",
      message: `${filename}: "payload" must be a non-null object`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // ── Tier 2: payload-level validation (best-effort) ─────────────────────────
  const commandType = obj["type"] as GuiCommandType;
  const payloadErrors = validatePayload(
    commandType,
    obj["payload"] as Record<string, unknown>,
    filename,
  );
  if (payloadErrors.length > 0) {
    return { valid: false, errors: payloadErrors };
  }

  // ── All tiers passed — use isCommandFile as final narrowing guard ──────────
  if (!isCommandFile(raw)) {
    return {
      valid: false,
      errors: [
        {
          field: "<root>",
          code: "INVALID_TYPE",
          message: `${filename}: failed final isCommandFile() guard`,
        },
      ],
    };
  }

  return { valid: true, command: raw };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload-level validators (one per command category)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the `payload` object for known structural requirements per command type.
 * Returns an empty array if the payload is structurally acceptable.
 */
export function validatePayload(
  type: GuiCommandType,
  payload: Record<string, unknown>,
  filename: string,
): CommandValidationError[] {
  const errors: CommandValidationError[] = [];

  const req = (field: string, expectedType: "string" | "number" | "boolean") => {
    if (typeof payload[field] !== expectedType) {
      errors.push({
        field: `payload.${field}`,
        code: "PAYLOAD_MISSING_FIELD",
        message: `${filename}: payload.${field} must be a ${expectedType} for ${type}`,
      });
    }
  };
  const opt = (field: string, expectedType: "string" | "number" | "boolean") => {
    if (payload[field] !== undefined && typeof payload[field] !== expectedType) {
      errors.push({
        field: `payload.${field}`,
        code: "INVALID_TYPE",
        message: `${filename}: optional payload.${field} must be a ${expectedType} for ${type}`,
      });
    }
  };

  switch (type) {
    // ── A. Agent lifecycle ────────────────────────────────────────────────────
    case "agent.spawn":
      req("agent_id", "string");
      req("persona", "string");
      req("room_id", "string");
      break;
    case "agent.terminate":
      req("agent_id", "string");
      break;
    case "agent.restart":
      req("agent_id", "string");
      break;
    case "agent.pause":
      req("agent_id", "string");
      break;
    case "agent.resume":
      req("agent_id", "string");
      break;
    case "agent.assign":
      req("agent_id", "string");
      req("room_id", "string");
      break;
    case "agent.send_command":
      req("agent_id", "string");
      req("instruction", "string");
      break;

    // ── B. Task operations ────────────────────────────────────────────────────
    case "task.create":
      req("task_id", "string");
      req("title", "string");
      break;
    case "task.assign":
      req("task_id", "string");
      req("agent_id", "string");
      break;
    case "task.cancel":
      req("task_id", "string");
      break;
    case "task.update_spec":
      req("task_id", "string");
      break;

    // ── C. Meeting ────────────────────────────────────────────────────────────
    case "meeting.convene":
      req("room_id", "string");
      req("topic", "string");
      req("requested_by", "string");
      if (!Array.isArray(payload["participant_ids"]) || payload["participant_ids"].length === 0) {
        errors.push({
          field: "payload.participant_ids",
          code: "PAYLOAD_MISSING_FIELD",
          message: `${filename}: payload.participant_ids must be a non-empty array for meeting.convene`,
        });
      }
      break;

    // ── D. Navigation (spatial-only, lenient validation) ─────────────────────
    case "nav.drill_down":
      req("level", "string");
      if (
        payload["target_id"] === undefined ||
        (typeof payload["target_id"] !== "string" &&
          typeof payload["target_id"] !== "number")
      ) {
        errors.push({
          field: "payload.target_id",
          code: "PAYLOAD_MISSING_FIELD",
          message: `${filename}: payload.target_id must be a string or number for nav.drill_down`,
        });
      }
      break;
    case "nav.drill_up":
      // steps is optional
      opt("steps", "number");
      break;
    case "nav.camera_preset":
      req("preset", "string");
      break;
    case "nav.focus_entity":
      req("entity_type", "string");
      req("entity_id", "string");
      break;

    // ── E. Config ─────────────────────────────────────────────────────────────
    case "config.room_mapping":
      if (!Array.isArray(payload["mappings"])) {
        errors.push({
          field: "payload.mappings",
          code: "PAYLOAD_MISSING_FIELD",
          message: `${filename}: payload.mappings must be an array for config.room_mapping`,
        });
      }
      break;
    case "config.agent_persona":
      req("persona", "string");
      if (typeof payload["patch"] !== "object" || payload["patch"] === null) {
        errors.push({
          field: "payload.patch",
          code: "PAYLOAD_MISSING_FIELD",
          message: `${filename}: payload.patch must be an object for config.agent_persona`,
        });
      }
      break;
    case "config.building_layout":
      if (typeof payload["layout"] !== "object" || payload["layout"] === null) {
        errors.push({
          field: "payload.layout",
          code: "PAYLOAD_MISSING_FIELD",
          message: `${filename}: payload.layout must be an object for config.building_layout`,
        });
      }
      break;

    default:
      // Exhaustiveness guard — all 20 command types must be handled above.
      // This branch should never be reached at runtime.
      break;
  }

  return errors;
}
