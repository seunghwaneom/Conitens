/**
 * agent-lifecycle-command-bridge.ts — Typed interaction_intent → command pipeline
 * for agent lifecycle affordances.
 *
 * Sub-AC 7c: Wire the agent_instance affordances so that start, stop, and reassign
 * manipulations each produce a distinct command entity (via interaction_intent →
 * command pipeline) and verify the command payload correctly targets the agent_instance.
 *
 * Design
 * ──────
 * This module is the glue layer between:
 *   - User interactions on agent avatars (AgentLifecyclePanel, context menu)
 *   - The command-file pipeline that writes to `.conitens/commands/`
 *
 * It defines three lifecycle intent types (START, STOP, REASSIGN) and provides a
 * pipeline function `buildAgentLifecycleCommand()` that maps each intent to a typed
 * CommandFile payload, with the `agent_id` field always targeting the specific
 * agent_instance that was manipulated.
 *
 * Three distinct command entities
 * ─────────────────────────────────
 *   AGENT_LIFECYCLE_START    → agent.spawn      payload (agent_id, persona, room_id, display_name)
 *   AGENT_LIFECYCLE_STOP     → agent.terminate  payload (agent_id, reason)
 *   AGENT_LIFECYCLE_REASSIGN → agent.assign     payload (agent_id, room_id)
 *
 * The intent carries all data required to build the command payload without
 * any additional store lookups, so it is fully serialisable for 3D replay.
 *
 * Record transparency
 * ───────────────────
 * Each mapped command carries:
 *   • `command_type` — identifies the distinct orchestration command
 *   • `agent_id`     — targets the specific agent_instance (not a wildcard)
 *   • `source_intent_id` — traces the command back to the originating intent
 *   • `initiated_at`     — epoch ms timestamp for audit ordering
 *
 * Relationship to AgentLifecyclePanel.tsx
 * ───────────────────────────────────────
 * AgentLifecyclePanel dispatches commands directly via useCommandFileWriter.
 * This bridge layer is the *pure* implementation that panel builds on, and
 * is independently testable without React or R3F.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Intent kind discriminators
// ─────────────────────────────────────────────────────────────────────────────

/** The three supported lifecycle manipulation kinds for Sub-AC 7c. */
export type AgentLifecycleIntentKind =
  | "AGENT_LIFECYCLE_START"
  | "AGENT_LIFECYCLE_STOP"
  | "AGENT_LIFECYCLE_REASSIGN";

/** O(1) membership check set. */
export const AGENT_LIFECYCLE_INTENT_KINDS: ReadonlySet<string> =
  new Set<AgentLifecycleIntentKind>([
    "AGENT_LIFECYCLE_START",
    "AGENT_LIFECYCLE_STOP",
    "AGENT_LIFECYCLE_REASSIGN",
  ]);

/** Type guard — narrows an unknown string to AgentLifecycleIntentKind. */
export function isAgentLifecycleIntentKind(s: string): s is AgentLifecycleIntentKind {
  return AGENT_LIFECYCLE_INTENT_KINDS.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent payload interfaces — the agent_instance context at manipulation time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared fields present on every lifecycle intent.
 * Includes agent_instance identity AND source-tracing fields.
 */
export interface AgentLifecycleIntentBase {
  /**
   * Unique intent ID (ULID-compatible or nanoid) assigned at creation time.
   * Forwarded to the command as `source_intent_id` for audit chaining.
   */
  intentId: string;
  /**
   * Stable agent identifier from AgentDef.agentId.
   * This is the PRIMARY KEY that targets the specific agent_instance in every
   * generated command payload — the agent_id in the command envelope.
   */
  agentId: string;
  /** Display name of the agent at manipulation time. */
  agentName: string;
  /** Role / persona of the agent (e.g. "implementer", "researcher"). */
  agentRole: string;
  /** Operational status of the agent at manipulation time. */
  agentStatus: string;
  /** Room the agent was occupying at manipulation time. */
  roomId: string;
  /** Unix ms timestamp at which the intent was created. */
  ts: number;
  /** ISO-8601 representation of ts for human-readable logs. */
  tsIso: string;
  /** Optional operator session for grouping interaction events. */
  sessionId?: string;
}

/**
 * AGENT_LIFECYCLE_START intent
 *
 * Produced when the operator clicks START in AgentLifecyclePanel or selects
 * "Start" from the agent context menu.
 *
 * Maps to → agent.spawn command with agent_id, persona, room_id, display_name.
 */
export interface AgentLifecycleStartPayload extends AgentLifecycleIntentBase {
  kind: "AGENT_LIFECYCLE_START";
  /** The agent's persona string forwarded to agent.spawn as `persona`. */
  persona: string;
  /** The target room for spawning (usually the agent's current room). */
  targetRoomId: string;
  /** Display name forwarded to agent.spawn as `display_name`. */
  displayName: string;
}

/**
 * AGENT_LIFECYCLE_STOP intent
 *
 * Produced when the operator confirms STOP in AgentLifecyclePanel (after the
 * inline confirmation dialog) or selects "Terminate" from the context menu.
 *
 * Maps to → agent.terminate command with agent_id and reason.
 */
export interface AgentLifecycleStopPayload extends AgentLifecycleIntentBase {
  kind: "AGENT_LIFECYCLE_STOP";
  /**
   * Reason for termination — forwarded to agent.terminate as `reason`.
   * Defaults to "user_requested" for GUI-initiated stops.
   */
  reason: string;
  /**
   * Whether the operator explicitly confirmed the destructive action.
   * The confirmation flow in AgentLifecyclePanel sets this to `true`;
   * programmatic stops (e.g. from replay) may set it to `false`.
   */
  confirmed: boolean;
}

/**
 * AGENT_LIFECYCLE_REASSIGN intent
 *
 * Produced when the operator selects a target room in the "REASSIGN ROOM"
 * picker inside AgentLifecyclePanel, or drags an agent to a new room, or
 * selects "Move to room X" from the context menu.
 *
 * Maps to → agent.assign command with agent_id and room_id.
 */
export interface AgentLifecycleReassignPayload extends AgentLifecycleIntentBase {
  kind: "AGENT_LIFECYCLE_REASSIGN";
  /** The room the agent is being moved FROM (for audit / rollback). */
  fromRoomId: string;
  /** The room the agent is being moved TO (forwarded to agent.assign as `room_id`). */
  toRoomId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export type AgentLifecycleStartIntent = {
  intent: "AGENT_LIFECYCLE_START";
} & AgentLifecycleStartPayload;

export type AgentLifecycleStopIntent = {
  intent: "AGENT_LIFECYCLE_STOP";
} & AgentLifecycleStopPayload;

export type AgentLifecycleReassignIntent = {
  intent: "AGENT_LIFECYCLE_REASSIGN";
} & AgentLifecycleReassignPayload;

/**
 * Discriminated union of all three lifecycle manipulation intents.
 * Narrow by `intent` field.
 *
 * @example
 * ```ts
 * const cmd = buildAgentLifecycleCommand(intent);
 * switch (cmd.command_type) {
 *   case "agent.spawn":     await cmdWriter.spawnAgent(cmd.payload);     break;
 *   case "agent.terminate": await cmdWriter.terminateAgent(cmd.payload); break;
 *   case "agent.assign":    await cmdWriter.assignAgent(cmd.payload);    break;
 * }
 * ```
 */
export type AgentLifecycleIntent =
  | AgentLifecycleStartIntent
  | AgentLifecycleStopIntent
  | AgentLifecycleReassignIntent;

// ─────────────────────────────────────────────────────────────────────────────
// Command entity types — the pipeline output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A distinct command entity produced by the intent → command pipeline.
 *
 * `T` is the command type string (e.g. "agent.spawn").
 * `P` is the typed payload for that command.
 *
 * The `source_intent_id` field chains this command back to the originating
 * interaction intent for audit transparency.
 */
export interface AgentLifecycleCommand<T extends string, P extends Record<string, unknown>> {
  /** The orchestration command type — always one of the three agent lifecycle types. */
  command_type: T;
  /**
   * The typed payload for this command.
   * Always contains `agent_id` targeting the specific agent_instance.
   */
  payload: P;
  /**
   * Traces this command back to the originating interaction intent.
   * Enables end-to-end auditability: intent → command → event log entry.
   */
  source_intent_id: string;
  /** Unix ms timestamp when the command was built (for ordering). */
  initiated_at: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command payload shapes — mirroring @conitens/protocol payload interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** Payload for agent.spawn — targets agent_instance by agent_id. */
export interface AgentSpawnCommandPayloadLocal {
  [key: string]: unknown;
  /** Primary key — targets the specific agent_instance to activate. */
  agent_id: string;
  /** Role / persona for the spawned agent process. */
  persona: string;
  /** Room the agent should occupy after spawning. */
  room_id: string;
  /** Human-readable display name for the 3D label. */
  display_name: string;
  /** Source intent ID for audit chaining. */
  source_intent_id: string;
}

/** Payload for agent.terminate — targets agent_instance by agent_id. */
export interface AgentTerminateCommandPayloadLocal {
  [key: string]: unknown;
  /** Primary key — targets the specific agent_instance to terminate. */
  agent_id: string;
  /** Reason for termination (forwarded to orchestrator for audit log). */
  reason: string;
  /** Source intent ID for audit chaining. */
  source_intent_id: string;
}

/** Payload for agent.assign — targets agent_instance by agent_id. */
export interface AgentAssignCommandPayloadLocal {
  [key: string]: unknown;
  /** Primary key — targets the specific agent_instance to reassign. */
  agent_id: string;
  /** The destination room for the reassignment. */
  room_id: string;
  /** Previous room (for audit trail / rollback). */
  previous_room_id: string;
  /** Source intent ID for audit chaining. */
  source_intent_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed command entity aliases — for ergonomic use in tests and callers
// ─────────────────────────────────────────────────────────────────────────────

export type AgentSpawnCommandEntity =
  AgentLifecycleCommand<"agent.spawn", AgentSpawnCommandPayloadLocal>;

export type AgentTerminateCommandEntity =
  AgentLifecycleCommand<"agent.terminate", AgentTerminateCommandPayloadLocal>;

export type AgentAssignCommandEntity =
  AgentLifecycleCommand<"agent.assign", AgentAssignCommandPayloadLocal>;

/** Union of all three produced command entities. */
export type AgentLifecycleCommandEntity =
  | AgentSpawnCommandEntity
  | AgentTerminateCommandEntity
  | AgentAssignCommandEntity;

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND_TYPE constants — for tests and switch dispatch
// ─────────────────────────────────────────────────────────────────────────────

/** Maps each lifecycle intent kind to the command type it produces. */
export const LIFECYCLE_INTENT_TO_COMMAND_TYPE = {
  AGENT_LIFECYCLE_START:    "agent.spawn",
  AGENT_LIFECYCLE_STOP:     "agent.terminate",
  AGENT_LIFECYCLE_REASSIGN: "agent.assign",
} as const satisfies Record<AgentLifecycleIntentKind, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions — create lifecycle intents from raw inputs
// ─────────────────────────────────────────────────────────────────────────────

/** Nano-ID generator for intent IDs (no external deps). */
function generateIntentId(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "lci_"; // lifecycle intent prefix
  for (let i = 0; i < 20; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Shared base builder. */
function buildBase(
  params: Omit<AgentLifecycleIntentBase, "intentId" | "ts" | "tsIso">,
): AgentLifecycleIntentBase {
  const ts = Date.now();
  return {
    intentId: generateIntentId(),
    ts,
    tsIso: new Date(ts).toISOString(),
    ...params,
  };
}

/**
 * Create an AGENT_LIFECYCLE_START intent.
 *
 * Use when the operator clicks START in the lifecycle panel or selects
 * "Activate" from the context menu.
 */
export function makeAgentLifecycleStartIntent(
  params: Omit<AgentLifecycleStartPayload, "intentId" | "ts" | "tsIso" | "kind">,
): AgentLifecycleStartIntent {
  return {
    intent: "AGENT_LIFECYCLE_START",
    kind:   "AGENT_LIFECYCLE_START",
    ...buildBase({
      agentId:   params.agentId,
      agentName: params.agentName,
      agentRole: params.agentRole,
      agentStatus: params.agentStatus,
      roomId:    params.roomId,
      sessionId: params.sessionId,
    }),
    persona:      params.persona,
    targetRoomId: params.targetRoomId,
    displayName:  params.displayName,
  };
}

/**
 * Create an AGENT_LIFECYCLE_STOP intent.
 *
 * Use when the operator confirms STOP (after the inline confirmation dialog).
 */
export function makeAgentLifecycleStopIntent(
  params: Omit<AgentLifecycleStopPayload, "intentId" | "ts" | "tsIso" | "kind">,
): AgentLifecycleStopIntent {
  return {
    intent:    "AGENT_LIFECYCLE_STOP",
    kind:      "AGENT_LIFECYCLE_STOP",
    ...buildBase({
      agentId:   params.agentId,
      agentName: params.agentName,
      agentRole: params.agentRole,
      agentStatus: params.agentStatus,
      roomId:    params.roomId,
      sessionId: params.sessionId,
    }),
    reason:    params.reason ?? "user_requested",
    confirmed: params.confirmed,
  };
}

/**
 * Create an AGENT_LIFECYCLE_REASSIGN intent.
 *
 * Use when the operator selects a target room in the reassign picker.
 */
export function makeAgentLifecycleReassignIntent(
  params: Omit<AgentLifecycleReassignPayload, "intentId" | "ts" | "tsIso" | "kind">,
): AgentLifecycleReassignIntent {
  return {
    intent:     "AGENT_LIFECYCLE_REASSIGN",
    kind:       "AGENT_LIFECYCLE_REASSIGN",
    ...buildBase({
      agentId:   params.agentId,
      agentName: params.agentName,
      agentRole: params.agentRole,
      agentStatus: params.agentStatus,
      roomId:    params.roomId,
      sessionId: params.sessionId,
    }),
    fromRoomId: params.fromRoomId,
    toRoomId:   params.toRoomId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline function — interaction_intent → command entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildAgentLifecycleCommand` — the interaction_intent → command pipeline.
 *
 * Maps an AgentLifecycleIntent to a distinct typed AgentLifecycleCommandEntity.
 *
 * Invariants enforced:
 *   • Every output has `payload.agent_id === intent.agentId` — command targets the
 *     specific agent_instance identified by the intent.
 *   • Every output has `source_intent_id === intent.intentId` — full audit chain.
 *   • START → agent.spawn, STOP → agent.terminate, REASSIGN → agent.assign —
 *     three distinct command types (never the same type for different intents).
 *
 * @param intent — A lifecycle manipulation intent (from makeAgentLifecycle*Intent)
 * @returns       — A typed command entity ready for dispatch to useCommandFileWriter
 *
 * @example
 * ```ts
 * const intent = makeAgentLifecycleStartIntent({
 *   agentId: "researcher-1", agentName: "Dr. Research", agentRole: "researcher",
 *   agentStatus: "inactive", roomId: "lab", persona: "researcher",
 *   targetRoomId: "lab", displayName: "Dr. Research",
 * });
 * const cmd = buildAgentLifecycleCommand(intent);
 * // cmd.command_type === "agent.spawn"
 * // cmd.payload.agent_id === "researcher-1"
 * await cmdWriter.spawnAgent(cmd.payload);
 * ```
 */
export function buildAgentLifecycleCommand(
  intent: AgentLifecycleIntent,
): AgentLifecycleCommandEntity {
  const initiated_at = Date.now();
  const source_intent_id = intent.intentId;

  switch (intent.intent) {
    case "AGENT_LIFECYCLE_START": {
      const payload: AgentSpawnCommandPayloadLocal = {
        agent_id:         intent.agentId,
        persona:          intent.persona,
        room_id:          intent.targetRoomId,
        display_name:     intent.displayName,
        source_intent_id,
      };
      return {
        command_type:     "agent.spawn",
        payload,
        source_intent_id,
        initiated_at,
      };
    }

    case "AGENT_LIFECYCLE_STOP": {
      const payload: AgentTerminateCommandPayloadLocal = {
        agent_id:         intent.agentId,
        reason:           intent.reason,
        source_intent_id,
      };
      return {
        command_type:     "agent.terminate",
        payload,
        source_intent_id,
        initiated_at,
      };
    }

    case "AGENT_LIFECYCLE_REASSIGN": {
      const payload: AgentAssignCommandPayloadLocal = {
        agent_id:         intent.agentId,
        room_id:          intent.toRoomId,
        previous_room_id: intent.fromRoomId,
        source_intent_id,
      };
      return {
        command_type:     "agent.assign",
        payload,
        source_intent_id,
        initiated_at,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guard for AGENT_LIFECYCLE_START intents. */
export function isAgentLifecycleStartIntent(v: unknown): v is AgentLifecycleStartIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_LIFECYCLE_START" &&
    typeof v["agentId"] === "string" &&
    typeof v["intentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for AGENT_LIFECYCLE_STOP intents. */
export function isAgentLifecycleStopIntent(v: unknown): v is AgentLifecycleStopIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_LIFECYCLE_STOP" &&
    typeof v["agentId"] === "string" &&
    typeof v["intentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for AGENT_LIFECYCLE_REASSIGN intents. */
export function isAgentLifecycleReassignIntent(v: unknown): v is AgentLifecycleReassignIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_LIFECYCLE_REASSIGN" &&
    typeof v["agentId"] === "string" &&
    typeof v["intentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for any AgentLifecycleIntent variant. */
export function isAgentLifecycleIntent(v: unknown): v is AgentLifecycleIntent {
  return (
    isAgentLifecycleStartIntent(v) ||
    isAgentLifecycleStopIntent(v) ||
    isAgentLifecycleReassignIntent(v)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline batch processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process an array of lifecycle intents through the command pipeline.
 *
 * Each intent produces exactly one distinct command entity.
 * The returned array is in the same order as the input intents.
 *
 * Useful for bulk replay or multi-agent batch operations.
 */
export function buildAgentLifecycleCommandBatch(
  intents: AgentLifecycleIntent[],
): AgentLifecycleCommandEntity[] {
  return intents.map(buildAgentLifecycleCommand);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload extractor helpers — used by tests to verify targeting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the `agent_id` from any lifecycle command entity payload.
 * Validates that the command correctly targets a specific agent_instance.
 */
export function extractAgentIdFromCommand(cmd: AgentLifecycleCommandEntity): string {
  return cmd.payload.agent_id;
}

/**
 * Validate that a command entity correctly targets the expected agent_instance.
 *
 * Returns `true` if `cmd.payload.agent_id === expectedAgentId`.
 * Throws if the command has no agent_id (schema violation).
 */
export function commandTargetsAgent(
  cmd: AgentLifecycleCommandEntity,
  expectedAgentId: string,
): boolean {
  if (typeof cmd.payload.agent_id !== "string") {
    throw new Error(
      `Command ${cmd.command_type} payload is missing agent_id field — cannot verify target`,
    );
  }
  return cmd.payload.agent_id === expectedAgentId;
}
