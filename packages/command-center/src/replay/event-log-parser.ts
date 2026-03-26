/**
 * event-log-parser.ts — Reads, validates, and structures raw JSONL log entries.
 *
 * Sub-AC 9a: Converts raw JSONL lines from .conitens/events/*.jsonl into
 * fully-typed TypedReplayEvent objects for consumption by the 3D replay
 * engine and system analysis tools.
 *
 * Parsing pipeline (per JSONL line):
 *   1. JSON.parse()        — syntax validation
 *   2. Envelope validation — schema version, event_id, type (alias resolution),
 *                            ts (ISO 8601), actor shape, payload object check
 *   3. Classification      — determine ReplayEventCategory from the event type
 *   4. Payload validation  — run the appropriate typed guard from @conitens/protocol
 *   5. Structuring         — build a TypedReplayEvent with convenience fields
 *
 * Design principles:
 *  - Parse errors are non-fatal: each line is parsed independently; failures
 *    are captured as ParseError values rather than thrown exceptions.
 *  - Write-only semantics: the parser is a pure read/transform layer.
 *    It never writes to any store or file.
 *  - Alias resolution: obsolete event type aliases (e.g. "task.updated") are
 *    silently resolved to their canonical counterparts before classification.
 *  - Forward compatibility: unknown (future) event types are accepted as
 *    "state_change" events with unvalidated payloads rather than rejected.
 *    Schema version mismatches are always hard errors (envelope-level).
 *  - Self-contained: the parser has no side effects and no external state.
 *    It can be used in both Node.js (for .conitens/ ingestion) and the
 *    browser (for in-memory event log analysis).
 */
import {
  SCHEMA_VERSION,
  isValidEventType,
  resolveAlias,
  isAgentEventType,
  isValidAgentPayload,
  isCommandEventType,
  isPipelineEventType,
  isValidCommandPayload,
  isValidPipelinePayload,
} from "@conitens/protocol";
import type {
  ConitensEvent,
  EventType,
  Actor,
  AgentEventType,
  CommandEventType,
  PipelineEventType,
} from "@conitens/protocol";
import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
  CommandReplayEvent,
  StateChangeReplayEvent,
  ParseResult,
  ParseError,
  ParseErrorCode,
  ParseBatchResult,
  ReplayEventCategory,
} from "./event-log-schema.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true if value is a plain, non-null, non-array object. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Build a ParseError from components.
 *
 * @param code    - Canonical error code
 * @param message - Human-readable explanation
 * @param lineOffset - Zero-based line index (-1 if unknown)
 * @param rawLine - Original string content of the line
 */
function makeError(
  code: ParseErrorCode,
  message: string,
  lineOffset: number,
  rawLine: string,
): ParseError {
  return { code, message, lineOffset, rawLine };
}

/**
 * Extract the domain prefix from an event type string.
 *
 * Examples:
 *   "task.created"          → "task"
 *   "layout.node.moved"     → "layout"
 *   "system.started"        → "system"
 *   "meeting.started"       → "meeting"
 */
function extractDomain(type: string): string {
  return type.split(".")[0] ?? type;
}

/**
 * Classify an event type into a ReplayEventCategory.
 *
 * Priority order:
 *   1. agent_lifecycle — isAgentEventType()
 *   2. command         — isCommandEventType() || isPipelineEventType()
 *   3. state_change    — everything else
 *
 * This function accepts any string (not just EventType) to gracefully
 * handle future event types added after this parser was compiled.
 */
function classifyEventType(type: string): ReplayEventCategory {
  if (isAgentEventType(type)) return "agent_lifecycle";
  if (isCommandEventType(type) || isPipelineEventType(type)) return "command";
  return "state_change";
}

/**
 * Validate the actor field from a raw event envelope.
 *
 * Required shape:
 *   { kind: "user" | "agent" | "system" | "channel", id: string }
 */
const VALID_ACTOR_KINDS = new Set(["user", "agent", "system", "channel"]);

function isValidActor(v: unknown): v is Actor {
  if (!isPlainObject(v)) return false;
  return (
    typeof v["kind"] === "string" &&
    VALID_ACTOR_KINDS.has(v["kind"]) &&
    typeof v["id"] === "string" &&
    v["id"].length > 0
  );
}

/**
 * Extract agent_id from an agent event payload.
 *
 * All agent payload types include `agent_id` as a required string field.
 * If for any reason it is missing (malformed payload that passed the guard),
 * falls back to the event's actor.id.
 */
function extractAgentId(payload: Record<string, unknown>, fallback: string): string {
  const id = payload["agent_id"];
  return typeof id === "string" && id.length > 0 ? id : fallback;
}

/**
 * Extract command_id from a command event payload.
 * Optional — returns undefined if not present.
 */
function extractCommandId(payload: Record<string, unknown>): string | undefined {
  const id = payload["command_id"];
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Extract pipeline_id from a pipeline event payload.
 * Optional — returns undefined if not present.
 */
function extractPipelineId(payload: Record<string, unknown>): string | undefined {
  const id = payload["pipeline_id"];
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

// ---------------------------------------------------------------------------
// EventLogParser
// ---------------------------------------------------------------------------

/**
 * EventLogParser — converts raw JSONL log lines into typed replay events.
 *
 * This is the primary entry point for Sub-AC 9a. It implements the complete
 * parsing pipeline: JSON decode → envelope validation → classification →
 * payload validation → TypedReplayEvent construction.
 *
 * The parser is stateless. Create one instance and reuse it across multiple
 * parsing calls, or use the static helper `parseLines()`.
 *
 * @example
 * ```ts
 * const parser = new EventLogParser();
 *
 * // Parse a single line
 * const result = parser.parseLine('{"schema":"conitens.event.v1",...}');
 * if (result.ok) {
 *   const ev = result.event;
 *   // ev.replayCategory === "agent_lifecycle" | "command" | "state_change"
 * }
 *
 * // Parse a full JSONL file
 * const batch = parser.parseJsonlText(fileContents);
 * console.log(`Parsed ${batch.parsedCount}/${batch.totalLines} events`);
 * for (const ev of batch.events) { ... }
 * ```
 */
export class EventLogParser {
  /**
   * Running sequence counter. Incremented for each successfully parsed event
   * within a `parseLines` / `parseJsonlText` call. Reset between batch calls.
   */
  private _seq = 0;

  // ── parseLine ─────────────────────────────────────────────────────────────

  /**
   * Parse and validate a single JSONL line.
   *
   * Returns `{ ok: true, event }` on success or `{ ok: false, error }` on
   * failure. Never throws.
   *
   * The `lineOffset` parameter is the zero-based index of this line within
   * its source file — used to populate `ParseError.lineOffset` for debugging.
   * Omit or pass `-1` if the position is unknown.
   *
   * @param line       - A single line of JSONL text (must not contain newlines)
   * @param lineOffset - Zero-based position in the source file (-1 if unknown)
   */
  parseLine(line: string, lineOffset = -1): ParseResult {
    const rawLine = line;

    // ── Step 1: JSON syntax ──────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return {
        ok: false,
        error: makeError(
          "JSON_PARSE_FAILED",
          `JSON parse error on line: ${line.slice(0, 120)}`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 2: Must be a plain object ───────────────────────────────────
    if (!isPlainObject(parsed)) {
      return {
        ok: false,
        error: makeError(
          "NOT_AN_OBJECT",
          `Expected a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 3: schema field ─────────────────────────────────────────────
    if (typeof parsed["schema"] !== "string") {
      return {
        ok: false,
        error: makeError(
          "MISSING_SCHEMA",
          `Missing or non-string "schema" field`,
          lineOffset,
          rawLine,
        ),
      };
    }
    if (parsed["schema"] !== SCHEMA_VERSION) {
      return {
        ok: false,
        error: makeError(
          "SCHEMA_VERSION_MISMATCH",
          `Schema version mismatch: expected "${SCHEMA_VERSION}", got "${parsed["schema"] as string}"`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 4: event_id field ───────────────────────────────────────────
    if (typeof parsed["event_id"] !== "string") {
      return {
        ok: false,
        error: makeError(
          "MISSING_EVENT_ID",
          `Missing or non-string "event_id" field`,
          lineOffset,
          rawLine,
        ),
      };
    }
    if ((parsed["event_id"] as string).length === 0) {
      return {
        ok: false,
        error: makeError(
          "INVALID_EVENT_ID",
          `"event_id" must be a non-empty string`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 5: type field (with alias resolution) ───────────────────────
    if (typeof parsed["type"] !== "string") {
      return {
        ok: false,
        error: makeError(
          "MISSING_TYPE",
          `Missing or non-string "type" field`,
          lineOffset,
          rawLine,
        ),
      };
    }

    const rawType = parsed["type"] as string;
    // Attempt canonical lookup first, then alias resolution
    let canonicalType: EventType | null = isValidEventType(rawType)
      ? rawType
      : resolveAlias(rawType);

    if (canonicalType === null) {
      return {
        ok: false,
        error: makeError(
          "UNKNOWN_EVENT_TYPE",
          `Unknown event type "${rawType}" (not in EVENT_TYPES and no alias registered)`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 6: ts field (ISO 8601 string) ───────────────────────────────
    if (typeof parsed["ts"] !== "string") {
      return {
        ok: false,
        error: makeError(
          "MISSING_TIMESTAMP",
          `Missing or non-string "ts" field`,
          lineOffset,
          rawLine,
        ),
      };
    }

    const tsString = parsed["ts"] as string;
    const tsMs = Date.parse(tsString);
    if (Number.isNaN(tsMs)) {
      return {
        ok: false,
        error: makeError(
          "INVALID_TIMESTAMP",
          `"ts" field "${tsString}" is not a valid ISO 8601 timestamp`,
          lineOffset,
          rawLine,
        ),
      };
    }

    // ── Step 7: actor field ──────────────────────────────────────────────
    if (!isValidActor(parsed["actor"])) {
      return {
        ok: false,
        error: makeError(
          "MISSING_ACTOR",
          `"actor" field must be { kind: "user"|"agent"|"system"|"channel", id: string }`,
          lineOffset,
          rawLine,
        ),
      };
    }
    const actor = parsed["actor"] as Actor;

    // ── Step 8: payload field ────────────────────────────────────────────
    if (!isPlainObject(parsed["payload"])) {
      return {
        ok: false,
        error: makeError(
          "MISSING_PAYLOAD",
          `"payload" field must be a plain object, got ${typeof parsed["payload"]}`,
          lineOffset,
          rawLine,
        ),
      };
    }
    const payload = parsed["payload"] as Record<string, unknown>;

    // ── Assemble raw ConitensEvent ────────────────────────────────────────
    // The envelope fields have all been validated above. Cast via `unknown`
    // because `parsed` is still typed as `Record<string, unknown>` at this point.
    const rawEvent: ConitensEvent = parsed as unknown as ConitensEvent;

    // ── Step 9: Classify and validate payload ────────────────────────────
    const category = classifyEventType(canonicalType);
    const seq = ++this._seq;

    const base = {
      raw: rawEvent,
      type: canonicalType,
      ts: tsString,
      tsMs,
      actor,
      run_id: typeof rawEvent.run_id === "string" ? rawEvent.run_id : "",
      seq,
    } as const;

    switch (category) {
      case "agent_lifecycle": {
        const agentType = canonicalType as AgentEventType;
        if (!isValidAgentPayload(agentType, payload)) {
          return {
            ok: false,
            error: makeError(
              "INVALID_PAYLOAD",
              `Payload for "${agentType}" failed type validation`,
              lineOffset,
              rawLine,
            ),
          };
        }
        // TypeScript cannot narrow the indexed type from a union `agentType`
        // at compile time. The type guard above has confirmed runtime safety,
        // so the cast to the union of all agent payload types is sound.
        const ev: AgentLifecycleReplayEvent = {
          ...base,
          replayCategory: "agent_lifecycle",
          type: agentType,
          typedPayload: payload as AgentLifecycleReplayEvent["typedPayload"],
          agentId: extractAgentId(payload, actor.id),
        };
        return { ok: true, event: ev };
      }

      case "command": {
        let commandOrPipelinePayloadValid = false;
        if (isCommandEventType(canonicalType)) {
          commandOrPipelinePayloadValid = isValidCommandPayload(
            canonicalType as CommandEventType,
            payload,
          );
        } else if (isPipelineEventType(canonicalType)) {
          commandOrPipelinePayloadValid = isValidPipelinePayload(
            canonicalType as PipelineEventType,
            payload,
          );
        }

        if (!commandOrPipelinePayloadValid) {
          return {
            ok: false,
            error: makeError(
              "INVALID_PAYLOAD",
              `Payload for "${canonicalType}" failed type validation`,
              lineOffset,
              rawLine,
            ),
          };
        }

        const ev: CommandReplayEvent = {
          ...base,
          replayCategory: "command",
          type: canonicalType as CommandReplayEvent["type"],
          typedPayload: payload as unknown as CommandReplayEvent["typedPayload"],
          commandId: extractCommandId(payload),
          pipelineId: extractPipelineId(payload),
        };
        return { ok: true, event: ev };
      }

      case "state_change": {
        const ev: StateChangeReplayEvent = {
          ...base,
          replayCategory: "state_change",
          type: canonicalType as StateChangeReplayEvent["type"],
          typedPayload: payload,
          domain: extractDomain(canonicalType),
          taskId:
            typeof rawEvent.task_id === "string" && rawEvent.task_id.length > 0
              ? rawEvent.task_id
              : undefined,
        };
        return { ok: true, event: ev };
      }

      default: {
        // Exhaustiveness guard — this branch is unreachable at runtime
        const _unreachable: never = category;
        return {
          ok: false,
          error: makeError(
            "UNKNOWN_ERROR",
            `Unhandled replay category: ${String(_unreachable)}`,
            lineOffset,
            rawLine,
          ),
        };
      }
    }
  }

  // ── parseLines ────────────────────────────────────────────────────────────

  /**
   * Parse an ordered array of JSONL line strings.
   *
   * Empty lines (including lines containing only whitespace) are silently
   * skipped — they are normal in JSONL files and do not produce errors.
   *
   * The internal sequence counter is reset to 0 before processing, so each
   * `parseLines` call produces its own 1-based seq namespace.
   *
   * @param lines - Ordered array of JSONL line strings
   * @returns ParseBatchResult with events, errors, and summary statistics
   */
  parseLines(lines: string[]): ParseBatchResult {
    this._seq = 0;

    const events: TypedReplayEvent[] = [];
    const errors: ParseError[] = [];
    let firstEventTsMs = Infinity;
    let lastEventTsMs = -Infinity;
    const categoryCounts: Record<ReplayEventCategory, number> = {
      agent_lifecycle: 0,
      command: 0,
      state_change: 0,
    };

    let nonEmptyLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      // Skip empty lines
      if (line.trim() === "") continue;

      nonEmptyLines++;
      const result = this.parseLine(line, i);

      if (result.ok) {
        events.push(result.event);
        categoryCounts[result.event.replayCategory]++;
        if (result.event.tsMs < firstEventTsMs) firstEventTsMs = result.event.tsMs;
        if (result.event.tsMs > lastEventTsMs) lastEventTsMs = result.event.tsMs;
      } else {
        errors.push(result.error);
      }
    }

    return {
      events,
      errors,
      totalLines: nonEmptyLines,
      parsedCount: events.length,
      errorCount: errors.length,
      firstEventTsMs,
      lastEventTsMs,
      categoryCounts,
    };
  }

  // ── parseJsonlText ────────────────────────────────────────────────────────

  /**
   * Parse the full text content of a JSONL file.
   *
   * Splits on newlines (supports both LF and CRLF) before delegating to
   * `parseLines`. Suitable for parsing the contents of a .conitens/events/
   * YYYY-MM-DD.jsonl file read into memory.
   *
   * @param jsonlText - Full text content of a JSONL file
   * @returns ParseBatchResult with events, errors, and summary statistics
   */
  parseJsonlText(jsonlText: string): ParseBatchResult {
    // Split on LF, normalising CRLF → LF first
    const lines = jsonlText.replace(/\r\n/g, "\n").split("\n");
    return this.parseLines(lines);
  }

  // ── reset ─────────────────────────────────────────────────────────────────

  /**
   * Reset the internal sequence counter to 0.
   *
   * Call this before reusing a parser instance across logically separate
   * parsing sessions where seq numbering should restart from 1.
   */
  reset(): void {
    this._seq = 0;
  }
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/**
 * Singleton EventLogParser instance for convenience use.
 *
 * Note: The sequence counter is shared across all calls on this instance.
 * For isolated seq namespaces (e.g. per-session replay), create a new
 * `EventLogParser()` instance.
 */
export const defaultParser = new EventLogParser();

/**
 * Classify an event type string into a ReplayEventCategory.
 *
 * Exported for use in components and hooks that need to categorise events
 * without running the full parsing pipeline.
 *
 * @param type - Any string (EventType or unknown future type)
 * @returns "agent_lifecycle" | "command" | "state_change"
 */
export function classifyReplayEventType(type: string): ReplayEventCategory {
  if (isAgentEventType(type)) return "agent_lifecycle";
  if (isCommandEventType(type) || isPipelineEventType(type)) return "command";
  return "state_change";
}

/**
 * Extract the domain prefix from an event type string.
 *
 * Exported for use in filtering and display logic.
 *
 * @example
 * ```ts
 * extractEventDomain("task.created")      // → "task"
 * extractEventDomain("layout.node.moved") // → "layout"
 * extractEventDomain("system.started")    // → "system"
 * ```
 */
export function extractEventDomain(type: string): string {
  return type.split(".")[0] ?? type;
}
