/**
 * @module interaction-intent-harness
 * Sub-AC 4d — Test harness for all nine interaction_intents (3 layers × 3 event
 * types).
 *
 * Provides typed trigger functions and assertion helpers for the complete 3×3
 * intent matrix.  The harness operates **independently of the command pipeline**
 * — it has no dependency on CommandFile ingestion, EventLog append, or the
 * orchestrator module.  It can be used in any test environment without additional
 * infrastructure.
 *
 * Ontology stratification
 * ───────────────────────
 * The three interaction layers map directly onto the system's ontology levels:
 *
 *   domain         layer  →  Building interactions
 *                             (BUILDING_CLICKED, BUILDING_HOVERED,
 *                              BUILDING_CONTEXT_MENU)
 *   infrastructure layer  →  Room interactions
 *                             (ROOM_CLICKED, ROOM_HOVERED,
 *                              ROOM_CONTEXT_MENU)
 *   meta           layer  →  Agent interactions
 *                             (click, hover_enter, context_menu via
 *                              AgentInteractionIntentPayload)
 *
 * The three canonical event types (columns in the matrix):
 *   click        → primary pointer button (left-click / tap)
 *   hover        → pointer-enter (maps to hover_enter for the meta/agent layer)
 *   context_menu → secondary pointer / right-click
 *
 * The 3×3 matrix expands to exactly nine distinct intents.
 *
 * Design notes
 * ────────────
 * • Record transparency — every trigger function returns a `HarnessResult`
 *   that captures the emitted intent object together with its layer, event
 *   type, and wall-clock emission timestamp.  The harness never mutates the
 *   produced intent; consumers see the same immutable shape that would reach
 *   the event log in production.
 * • No command-pipeline coupling — the harness has zero imports from
 *   command-file.ts, command-pipeline.ts, EventLog, or the orchestrator.
 *   This keeps assertion outcomes stable regardless of whether the pipeline
 *   is running.
 * • Self-contained defaults — all trigger functions supply sensible defaults
 *   (stable IDs, a fixed baseline timestamp, a default session).  Callers
 *   can override any field via `TriggerConfig`.
 * • Assertion helpers — `assertIntentShape`, `assertLayerMetadata`, and
 *   `assertCrossLayerIsolation` use the existing type-guard functions from
 *   the intent modules, which are the same guards used in production.
 *
 * Quick-start
 * ───────────
 * ```ts
 * import {
 *   triggerIntent, assertIntentShape,
 *   INTENT_LAYERS, INTENT_EVENT_TYPES, INTENT_TRIGGER_MATRIX,
 * } from "../../testing/interaction-intent-harness.js";
 *
 * // Generic (layer × event type):
 * const result = triggerIntent("domain", "click");
 * assertIntentShape(result);
 *
 * // Specific typed trigger:
 * const buildingClick = triggerDomainClick({ sessionId: "my-session" });
 * expect(buildingClick.intent.intent).toBe("BUILDING_CLICKED");
 *
 * // Full 9-case matrix sweep:
 * for (const layer of INTENT_LAYERS) {
 *   for (const et of INTENT_EVENT_TYPES) {
 *     const r = INTENT_TRIGGER_MATRIX[layer][et]();
 *     assertIntentShape(r);
 *   }
 * }
 * ```
 */

// ── Domain-layer imports (building intents) ─────────────────────────────────
import {
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingContextMenuIntent,
  isBuildingClickedIntent,
  isBuildingHoveredIntent,
  isBuildingContextMenuIntent,
  BUILDING_INTENT_KINDS,
  type BuildingClickedIntent,
  type BuildingHoveredIntent,
  type BuildingContextMenuIntent,
} from "../scene/building-interaction-intents.js";

// ── Infrastructure-layer imports (room intents) ─────────────────────────────
import {
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomContextMenuIntent,
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomContextMenuIntent,
  ROOM_INTENT_KINDS,
  type RoomClickedIntent,
  type RoomHoveredIntent,
  type RoomContextMenuIntent,
} from "../scene/room-interaction-intents.js";

// ── Meta-layer imports (agent intents) ──────────────────────────────────────
// buildAgentInteractionIntent is the only dependency — no React, no R3F, no DOM.
import {
  buildAgentInteractionIntent,
  type AgentInteractionIntentPayload,
} from "../store/interaction-intent-store.js";

// ── Layer / event-type constants ─────────────────────────────────────────────

/** The three ontology layers tested by this harness. */
export const INTENT_LAYERS = ["domain", "infrastructure", "meta"] as const;
export type IntentLayer = (typeof INTENT_LAYERS)[number];

/** The three canonical pointer event types tested by this harness. */
export const INTENT_EVENT_TYPES = ["click", "hover", "context_menu"] as const;
export type IntentEventType = (typeof INTENT_EVENT_TYPES)[number];

/** O(1) membership sets for guard checks. */
export const INTENT_LAYER_SET: ReadonlySet<string> = new Set<IntentLayer>(INTENT_LAYERS);
export const INTENT_EVENT_TYPE_SET: ReadonlySet<string> = new Set<IntentEventType>(
  INTENT_EVENT_TYPES,
);

// ── Trigger configuration ────────────────────────────────────────────────────

/**
 * Optional overrides passed to any trigger function.
 *
 * All fields have sensible defaults so tests can remain terse.  Fields that
 * are not relevant to the target layer / event type are silently ignored.
 */
export interface TriggerConfig {
  /** Operator session ID injected into the emitted intent. */
  sessionId?: string;
  /**
   * Wall-clock timestamp (Unix ms) to use as the intent's `ts` field.
   * Defaults to a stable baseline value so tests are deterministic.
   */
  ts?: number;
  /**
   * Building identifier for domain-layer triggers.
   * @default "building-hq"
   */
  buildingId?: string;
  /**
   * Room identifier for infrastructure-layer triggers.
   * @default "control-room-01"
   */
  roomId?: string;
  /**
   * Agent identifier for meta-layer triggers.
   * @default "agent-test-01"
   */
  agentId?: string;
  /**
   * Drill level at time of interaction (domain / infrastructure layers).
   * @default "building" for domain, "floor" for infrastructure
   */
  drillLevel?: "building" | "floor" | "room" | "agent";
  /**
   * Screen-space pointer coordinates used by context-menu intents.
   * @default { x: 640, y: 400 }
   */
  screenPosition?: { x: number; y: number };
  /**
   * World-space pointer coordinates (Y-up, right-handed).
   * @default { x: 0, y: 0, z: 0 }
   */
  worldPosition?: { x: number; y: number; z: number };
}

// ── Harness result ───────────────────────────────────────────────────────────

/**
 * The result returned by every trigger function.
 *
 * `intent` is the raw, immutable intent object exactly as it would enter the
 * event log in production.  The surrounding metadata (`layer`, `eventType`,
 * `emittedAt`, `isValid`) is produced by the harness for test convenience and
 * is **not** present in the production intent object.
 */
export interface HarnessResult<T = unknown> {
  /** The emitted interaction intent object. */
  readonly intent: T;
  /** Ontology layer that produced this intent. */
  readonly layer: IntentLayer;
  /** Canonical event type that was triggered. */
  readonly eventType: IntentEventType;
  /** Wall-clock Unix ms timestamp recorded by the harness at trigger time. */
  readonly emittedAt: number;
  /**
   * Whether the intent passes its own production type guard.
   * Always `true` for intents produced by the harness — exposed so tests can
   * assert on it explicitly rather than relying on TypeScript narrowing alone.
   */
  readonly isValid: boolean;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Stable baseline timestamp for deterministic tests. */
const DEFAULT_TS = 1_700_000_000_000;
const DEFAULT_SESSION = "harness-session-001";
const DEFAULT_BUILDING_ID = "building-hq";
const DEFAULT_ROOM_ID = "control-room-01";
const DEFAULT_AGENT_ID = "agent-test-01";
const DEFAULT_SCREEN_POS = { x: 640, y: 400 };
const DEFAULT_WORLD_POS = { x: 0, y: 0, z: 0 };

// ── Domain-layer triggers ────────────────────────────────────────────────────

/**
 * Trigger a `BUILDING_CLICKED` intent (domain layer × click event type).
 */
export function triggerDomainClick(
  config: TriggerConfig = {},
): HarnessResult<BuildingClickedIntent> {
  const ts = config.ts ?? DEFAULT_TS;
  const intent = makeBuildingClickedIntent({
    building_id:  config.buildingId ?? DEFAULT_BUILDING_ID,
    drill_level:  config.drillLevel ?? "building",
    world_position: config.worldPosition ?? DEFAULT_WORLD_POS,
    floor_count:  1,
    ts,
    session_id:   config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "domain",
    eventType: "click",
    emittedAt: ts,
    isValid:   isBuildingClickedIntent(intent),
  };
}

/**
 * Trigger a `BUILDING_HOVERED` intent (domain layer × hover event type).
 */
export function triggerDomainHover(
  config: TriggerConfig = {},
): HarnessResult<BuildingHoveredIntent> {
  const ts = config.ts ?? DEFAULT_TS + 100;
  const intent = makeBuildingHoveredIntent({
    building_id:    config.buildingId ?? DEFAULT_BUILDING_ID,
    world_position: config.worldPosition ?? DEFAULT_WORLD_POS,
    ts,
    session_id:     config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "domain",
    eventType: "hover",
    emittedAt: ts,
    isValid:   isBuildingHoveredIntent(intent),
  };
}

/**
 * Trigger a `BUILDING_CONTEXT_MENU` intent (domain layer × context_menu event
 * type).
 */
export function triggerDomainContextMenu(
  config: TriggerConfig = {},
): HarnessResult<BuildingContextMenuIntent> {
  const ts = config.ts ?? DEFAULT_TS + 200;
  const intent = makeBuildingContextMenuIntent({
    building_id:     config.buildingId ?? DEFAULT_BUILDING_ID,
    world_position:  config.worldPosition ?? DEFAULT_WORLD_POS,
    screen_position: config.screenPosition ?? DEFAULT_SCREEN_POS,
    drill_level:     config.drillLevel ?? "building",
    ts,
    session_id:      config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "domain",
    eventType: "context_menu",
    emittedAt: ts,
    isValid:   isBuildingContextMenuIntent(intent),
  };
}

// ── Infrastructure-layer triggers ────────────────────────────────────────────

/**
 * Trigger a `ROOM_CLICKED` intent (infrastructure layer × click event type).
 */
export function triggerInfrastructureClick(
  config: TriggerConfig = {},
): HarnessResult<RoomClickedIntent> {
  const ts = config.ts ?? DEFAULT_TS + 300;
  const intent = makeRoomClickedIntent({
    room_id:        config.roomId ?? DEFAULT_ROOM_ID,
    room_type:      "control",
    floor:          0,
    drill_level:    config.drillLevel ?? "floor",
    world_position: config.worldPosition ?? DEFAULT_WORLD_POS,
    agent_count:    0,
    ts,
    session_id:     config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "infrastructure",
    eventType: "click",
    emittedAt: ts,
    isValid:   isRoomClickedIntent(intent),
  };
}

/**
 * Trigger a `ROOM_HOVERED` intent (infrastructure layer × hover event type).
 */
export function triggerInfrastructureHover(
  config: TriggerConfig = {},
): HarnessResult<RoomHoveredIntent> {
  const ts = config.ts ?? DEFAULT_TS + 400;
  const intent = makeRoomHoveredIntent({
    room_id:        config.roomId ?? DEFAULT_ROOM_ID,
    room_type:      "control",
    floor:          0,
    world_position: config.worldPosition ?? DEFAULT_WORLD_POS,
    ts,
    session_id:     config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "infrastructure",
    eventType: "hover",
    emittedAt: ts,
    isValid:   isRoomHoveredIntent(intent),
  };
}

/**
 * Trigger a `ROOM_CONTEXT_MENU` intent (infrastructure layer × context_menu
 * event type).
 */
export function triggerInfrastructureContextMenu(
  config: TriggerConfig = {},
): HarnessResult<RoomContextMenuIntent> {
  const ts = config.ts ?? DEFAULT_TS + 500;
  const intent = makeRoomContextMenuIntent({
    room_id:         config.roomId ?? DEFAULT_ROOM_ID,
    room_type:       "control",
    floor:           0,
    world_position:  config.worldPosition ?? DEFAULT_WORLD_POS,
    screen_position: config.screenPosition ?? DEFAULT_SCREEN_POS,
    drill_level:     config.drillLevel ?? "floor",
    ts,
    session_id:      config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "infrastructure",
    eventType: "context_menu",
    emittedAt: ts,
    isValid:   isRoomContextMenuIntent(intent),
  };
}

// ── Meta-layer triggers ──────────────────────────────────────────────────────

/**
 * Trigger a meta-layer `click` intent for an agent
 * (meta layer × click event type).
 */
export function triggerMetaClick(
  config: TriggerConfig = {},
): HarnessResult<AgentInteractionIntentPayload> {
  const intent = buildAgentInteractionIntent({
    kind:          "click",
    agentId:       config.agentId ?? DEFAULT_AGENT_ID,
    agentName:     "Harness Agent",
    agentRole:     "implementer",
    agentStatus:   "idle",
    roomId:        config.roomId ?? DEFAULT_ROOM_ID,
    worldPosition: config.worldPosition ?? DEFAULT_WORLD_POS,
    wasSelected:   false,
    isDrillTarget: false,
    sessionId:     config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "meta",
    eventType: "click",
    emittedAt: intent.ts,
    isValid:   typeof intent.intentId === "string" && intent.kind === "click",
  };
}

/**
 * Trigger a meta-layer `hover_enter` intent for an agent
 * (meta layer × hover event type).
 *
 * Note: the meta/agent layer uses `hover_enter` as the canonical name for the
 * pointer-enter gesture.  The harness maps the generic `"hover"` event type to
 * this agent-specific kind.
 */
export function triggerMetaHover(
  config: TriggerConfig = {},
): HarnessResult<AgentInteractionIntentPayload> {
  const intent = buildAgentInteractionIntent({
    kind:          "hover_enter",
    agentId:       config.agentId ?? DEFAULT_AGENT_ID,
    agentName:     "Harness Agent",
    agentRole:     "implementer",
    agentStatus:   "idle",
    roomId:        config.roomId ?? DEFAULT_ROOM_ID,
    worldPosition: config.worldPosition ?? DEFAULT_WORLD_POS,
    wasSelected:   false,
    isDrillTarget: false,
    sessionId:     config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "meta",
    eventType: "hover",
    emittedAt: intent.ts,
    isValid:   typeof intent.intentId === "string" && intent.kind === "hover_enter",
  };
}

/**
 * Trigger a meta-layer `context_menu` intent for an agent
 * (meta layer × context_menu event type).
 */
export function triggerMetaContextMenu(
  config: TriggerConfig = {},
): HarnessResult<AgentInteractionIntentPayload> {
  const intent = buildAgentInteractionIntent({
    kind:           "context_menu",
    agentId:        config.agentId ?? DEFAULT_AGENT_ID,
    agentName:      "Harness Agent",
    agentRole:      "implementer",
    agentStatus:    "idle",
    roomId:         config.roomId ?? DEFAULT_ROOM_ID,
    worldPosition:  config.worldPosition ?? DEFAULT_WORLD_POS,
    screenPosition: config.screenPosition ?? DEFAULT_SCREEN_POS,
    wasSelected:    false,
    isDrillTarget:  false,
    sessionId:      config.sessionId ?? DEFAULT_SESSION,
  });
  return {
    intent,
    layer:     "meta",
    eventType: "context_menu",
    emittedAt: intent.ts,
    isValid:   typeof intent.intentId === "string" && intent.kind === "context_menu",
  };
}

// ── Generic trigger ──────────────────────────────────────────────────────────

/** Map from layer + event-type to the specific trigger function. */
const TRIGGER_FN_MAP: Record<
  IntentLayer,
  Record<IntentEventType, (cfg?: TriggerConfig) => HarnessResult<unknown>>
> = {
  domain: {
    click:        triggerDomainClick,
    hover:        triggerDomainHover,
    context_menu: triggerDomainContextMenu,
  },
  infrastructure: {
    click:        triggerInfrastructureClick,
    hover:        triggerInfrastructureHover,
    context_menu: triggerInfrastructureContextMenu,
  },
  meta: {
    click:        triggerMetaClick,
    hover:        triggerMetaHover,
    context_menu: triggerMetaContextMenu,
  },
};

/**
 * Generic trigger: emits the intent at the specified layer and event type.
 *
 * The return type is `HarnessResult<unknown>` — use the specific typed triggers
 * (`triggerDomainClick`, `triggerRoomHovered`, etc.) for full type narrowing.
 *
 * @example
 * ```ts
 * const result = triggerIntent("infrastructure", "context_menu");
 * expect(result.layer).toBe("infrastructure");
 * expect(result.eventType).toBe("context_menu");
 * assertIntentShape(result);
 * ```
 */
export function triggerIntent(
  layer: IntentLayer,
  eventType: IntentEventType,
  config: TriggerConfig = {},
): HarnessResult<unknown> {
  return TRIGGER_FN_MAP[layer][eventType](config);
}

// ── Intent trigger matrix (3×3) ──────────────────────────────────────────────

/**
 * The complete 3×3 trigger matrix.
 *
 * Each entry is a function `(cfg?: TriggerConfig) => HarnessResult<unknown>`.
 * Iterate with `INTENT_LAYERS` and `INTENT_EVENT_TYPES` to exercise all nine
 * intents systematically.
 *
 * @example
 * ```ts
 * for (const layer of INTENT_LAYERS) {
 *   for (const et of INTENT_EVENT_TYPES) {
 *     const result = INTENT_TRIGGER_MATRIX[layer][et]();
 *     assertIntentShape(result);
 *   }
 * }
 * ```
 */
export const INTENT_TRIGGER_MATRIX: Readonly<
  Record<IntentLayer, Readonly<Record<IntentEventType, (cfg?: TriggerConfig) => HarnessResult<unknown>>>>
> = TRIGGER_FN_MAP;

// ── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert that a `HarnessResult` carries a structurally valid intent.
 *
 * Checks:
 *  • `result.isValid` is `true` (the production type guard passed)
 *  • `result.intent` is a non-null, non-array object
 *  • `result.emittedAt` is a positive number
 *
 * Throws a descriptive `Error` on failure; returns `void` on success so it
 * can be used as a vitest side-effect call.
 */
export function assertIntentShape(result: HarnessResult<unknown>): void {
  if (!result.isValid) {
    throw new Error(
      `[harness] assertIntentShape: intent is NOT valid for layer="${result.layer}" ` +
      `eventType="${result.eventType}". Type guard returned false.`,
    );
  }
  if (
    typeof result.intent !== "object" ||
    result.intent === null ||
    Array.isArray(result.intent)
  ) {
    throw new Error(
      `[harness] assertIntentShape: intent must be a plain object but got ` +
      `${Array.isArray(result.intent) ? "array" : typeof result.intent} ` +
      `for layer="${result.layer}" eventType="${result.eventType}".`,
    );
  }
  if (typeof result.emittedAt !== "number" || result.emittedAt <= 0) {
    throw new Error(
      `[harness] assertIntentShape: emittedAt must be a positive number but got ` +
      `${String(result.emittedAt)} for layer="${result.layer}" eventType="${result.eventType}".`,
    );
  }
}

/**
 * Assert that the harness result has correctly populated layer metadata.
 *
 * Checks:
 *  • `result.layer` is one of the three canonical layer values
 *  • `result.eventType` is one of the three canonical event types
 *  • `result.emittedAt` is a finite positive number
 */
export function assertLayerMetadata(result: HarnessResult<unknown>): void {
  if (!INTENT_LAYER_SET.has(result.layer)) {
    throw new Error(
      `[harness] assertLayerMetadata: unknown layer "${result.layer}". ` +
      `Valid layers: ${INTENT_LAYERS.join(", ")}.`,
    );
  }
  if (!INTENT_EVENT_TYPE_SET.has(result.eventType)) {
    throw new Error(
      `[harness] assertLayerMetadata: unknown eventType "${result.eventType}". ` +
      `Valid types: ${INTENT_EVENT_TYPES.join(", ")}.`,
    );
  }
  if (!Number.isFinite(result.emittedAt) || result.emittedAt <= 0) {
    throw new Error(
      `[harness] assertLayerMetadata: emittedAt must be a finite positive ` +
      `number but got ${String(result.emittedAt)}.`,
    );
  }
}

/**
 * Assert that a domain-layer intent does NOT validate as infrastructure or
 * meta intent, and vice-versa.
 *
 * Concretely:
 *  • domain intents do NOT pass room or agent intent checks
 *  • infrastructure intents do NOT pass building or agent intent checks
 *  • meta intents do NOT pass building or room intent checks
 *
 * This verifies the propagation-isolation invariant from the intent module
 * documentation.
 */
export function assertCrossLayerIsolation(result: HarnessResult<unknown>): void {
  const intent = result.intent;

  if (result.layer === "domain") {
    // Domain intents must not be accepted by room guards
    if (isRoomClickedIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: domain intent was incorrectly ` +
        `accepted by isRoomClickedIntent.`,
      );
    }
    if (isRoomHoveredIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: domain intent was incorrectly ` +
        `accepted by isRoomHoveredIntent.`,
      );
    }
    if (isRoomContextMenuIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: domain intent was incorrectly ` +
        `accepted by isRoomContextMenuIntent.`,
      );
    }
    // Domain intents must not look like agent payloads
    if (
      typeof (intent as Record<string, unknown>)["intentId"] === "string"
    ) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: domain intent carries "intentId" ` +
        `field which is reserved for meta/agent intents.`,
      );
    }
  }

  if (result.layer === "infrastructure") {
    // Infrastructure intents must not be accepted by building guards
    if (isBuildingClickedIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: infrastructure intent was ` +
        `incorrectly accepted by isBuildingClickedIntent.`,
      );
    }
    if (isBuildingHoveredIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: infrastructure intent was ` +
        `incorrectly accepted by isBuildingHoveredIntent.`,
      );
    }
    if (isBuildingContextMenuIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: infrastructure intent was ` +
        `incorrectly accepted by isBuildingContextMenuIntent.`,
      );
    }
    // Infrastructure intents must not look like agent payloads
    if (
      typeof (intent as Record<string, unknown>)["intentId"] === "string"
    ) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: infrastructure intent carries ` +
        `"intentId" field which is reserved for meta/agent intents.`,
      );
    }
  }

  if (result.layer === "meta") {
    // Meta/agent intents must not be accepted by building guards
    if (isBuildingClickedIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isBuildingClickedIntent.`,
      );
    }
    if (isBuildingHoveredIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isBuildingHoveredIntent.`,
      );
    }
    if (isBuildingContextMenuIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isBuildingContextMenuIntent.`,
      );
    }
    // Must not be accepted by room guards
    if (isRoomClickedIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isRoomClickedIntent.`,
      );
    }
    if (isRoomHoveredIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isRoomHoveredIntent.`,
      );
    }
    if (isRoomContextMenuIntent(intent)) {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent was incorrectly ` +
        `accepted by isRoomContextMenuIntent.`,
      );
    }
    // Meta intents MUST carry intentId (they are agent-scoped)
    if (typeof (intent as Record<string, unknown>)["intentId"] !== "string") {
      throw new Error(
        `[harness] assertCrossLayerIsolation: meta intent is missing "intentId" ` +
        `string field.`,
      );
    }
  }
}

/**
 * Assert that the intent is JSON-serialisable (record transparency invariant).
 *
 * Production code appends intents to the append-only event log, which requires
 * full JSON round-trip fidelity.  The harness re-validates the guard after
 * serialisation to confirm no information is lost.
 */
export function assertJsonRoundTrip(result: HarnessResult<unknown>): void {
  let serialised: string;
  try {
    serialised = JSON.stringify(result.intent);
  } catch (err) {
    throw new Error(
      `[harness] assertJsonRoundTrip: JSON.stringify threw for layer="` +
      `${result.layer}" eventType="${result.eventType}": ${String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialised) as unknown;
  } catch (err) {
    throw new Error(
      `[harness] assertJsonRoundTrip: JSON.parse threw for layer="` +
      `${result.layer}" eventType="${result.eventType}": ${String(err)}`,
    );
  }

  // Re-check layer-specific guard on the parsed value
  if (result.layer === "domain" && result.eventType === "click") {
    if (!isBuildingClickedIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: BUILDING_CLICKED did not survive ` +
        `JSON round-trip — type guard rejected the parsed value.`,
      );
    }
  } else if (result.layer === "domain" && result.eventType === "hover") {
    if (!isBuildingHoveredIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: BUILDING_HOVERED did not survive JSON round-trip.`,
      );
    }
  } else if (result.layer === "domain" && result.eventType === "context_menu") {
    if (!isBuildingContextMenuIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: BUILDING_CONTEXT_MENU did not survive JSON round-trip.`,
      );
    }
  } else if (result.layer === "infrastructure" && result.eventType === "click") {
    if (!isRoomClickedIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: ROOM_CLICKED did not survive JSON round-trip.`,
      );
    }
  } else if (result.layer === "infrastructure" && result.eventType === "hover") {
    if (!isRoomHoveredIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: ROOM_HOVERED did not survive JSON round-trip.`,
      );
    }
  } else if (result.layer === "infrastructure" && result.eventType === "context_menu") {
    if (!isRoomContextMenuIntent(parsed)) {
      throw new Error(
        `[harness] assertJsonRoundTrip: ROOM_CONTEXT_MENU did not survive JSON round-trip.`,
      );
    }
  } else if (result.layer === "meta") {
    // Agent intents must have intentId + kind after round-trip
    const p = parsed as Record<string, unknown>;
    if (typeof p["intentId"] !== "string" || typeof p["kind"] !== "string") {
      throw new Error(
        `[harness] assertJsonRoundTrip: meta/agent intent did not survive ` +
        `JSON round-trip — intentId or kind missing from parsed value.`,
      );
    }
  }
}

// ── Composite assertion (all four checks at once) ─────────────────────────────

/**
 * Run all four assertion helpers against a single `HarnessResult`.
 *
 * Equivalent to calling `assertIntentShape` + `assertLayerMetadata` +
 * `assertCrossLayerIsolation` + `assertJsonRoundTrip` in sequence.
 *
 * @example
 * ```ts
 * const result = triggerIntent("meta", "click");
 * assertAll(result);  // passes if all four invariants hold
 * ```
 */
export function assertAll(result: HarnessResult<unknown>): void {
  assertIntentShape(result);
  assertLayerMetadata(result);
  assertCrossLayerIsolation(result);
  assertJsonRoundTrip(result);
}

// ── Layer-specific typed helpers (convenience re-exports) ─────────────────────

/**
 * The set of building intent kind strings (from the domain-layer module).
 * Re-exported for test convenience — avoids an additional import in test files.
 */
export { BUILDING_INTENT_KINDS, ROOM_INTENT_KINDS };
