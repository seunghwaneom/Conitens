/**
 * interaction-intent-entity.ts — Canonical interaction_intent entity schema.
 *
 * Sub-AC 4a: Defines the unified, cross-layer interaction_intent entity with
 * the three canonical discriminant fields:
 *
 *   • target_entity_type  — domain type of the entity that was interacted with
 *   • gesture_type        — normalized gesture kind (click, hover, …)
 *   • target_id           — stable ID of the target entity
 *
 * Design
 * ──────
 * Each of the three interaction layers (building / room / agent) plus the
 * fixture layer produces layer-specific typed intents.  Those layer-specific
 * shapes carry rich, context-rich payloads (e.g., floor_count for buildings,
 * agent role/status for agents).  This module defines the **canonical
 * normalization** of all those shapes into a single serialisable entity that:
 *
 *   • Carries the three required discriminant fields.
 *   • Retains the original source_payload for full replay fidelity.
 *   • Is independent of React, Three.js, or any command pipeline.
 *   • Is JSON-serialisable (record transparency invariant).
 *
 * Layers map as follows:
 *   domain         layer  →  target_entity_type = "building"
 *   infrastructure layer  →  target_entity_type = "room"
 *   meta           layer  →  target_entity_type = "agent"
 *   fixture        layer  →  target_entity_type = "fixture"
 *
 * Gesture mapping:
 *   BUILDING_CLICKED / ROOM_CLICKED / AGENT_CLICKED / FIXTURE_BUTTON_CLICKED
 *                                                    → gesture_type = "click"
 *   BUILDING_HOVERED / ROOM_HOVERED / AGENT_HOVERED / FIXTURE_BUTTON_HOVERED
 *                                                    → gesture_type = "hover"
 *   BUILDING_UNHOVERED / ROOM_UNHOVERED / AGENT_UNHOVERED / FIXTURE_BUTTON_UNHOVERED
 *                                                    → gesture_type = "unhover"
 *   BUILDING_CONTEXT_MENU / ROOM_CONTEXT_MENU / AGENT_CONTEXT_MENU / FIXTURE_MENU_ANCHOR_*
 *                                                    → gesture_type = "context_menu"
 *   FIXTURE_HANDLE_DRAG_*                            → gesture_type = "drag"
 *
 * Usage
 * ─────
 * ```ts
 * import { makeInteractionIntentEntity, isInteractionIntentEntity } from
 *   "../scene/interaction-intent-entity.js";
 *
 * const entity = makeInteractionIntentEntity({
 *   target_entity_type: "room",
 *   gesture_type: "click",
 *   target_id: "room-ops-01",
 *   ts: Date.now(),
 *   layer: "infrastructure",
 *   source_payload: roomClickedIntent,
 * });
 * // entity satisfies InteractionIntentEntity
 * ```
 */

// ---------------------------------------------------------------------------
// Entity-type discriminants
// ---------------------------------------------------------------------------

/**
 * The five domain entity types that an interaction can target.
 *
 * - "building"       — the entire building shell (domain / overview layer)
 * - "room"           — a room volume within the building (infrastructure layer)
 * - "agent"          — an agent avatar at the agent layer (meta layer)
 * - "agent_instance" — a specific agent_instance 3D object (Sub-AC 4d: agent_instance layer)
 * - "fixture"        — a spatial UI fixture component (button / handle / menu_anchor)
 */
export type InteractionTargetEntityType =
  | "building"
  | "room"
  | "agent"
  | "agent_instance"
  | "fixture";

/** O(1) membership set for guard checks. */
export const INTERACTION_TARGET_ENTITY_TYPES: ReadonlySet<string> =
  new Set<InteractionTargetEntityType>([
    "building",
    "room",
    "agent",
    "agent_instance",
    "fixture",
  ]);

/** Type guard — narrows an unknown string to InteractionTargetEntityType. */
export function isInteractionTargetEntityType(
  s: string,
): s is InteractionTargetEntityType {
  return INTERACTION_TARGET_ENTITY_TYPES.has(s);
}

// ---------------------------------------------------------------------------
// Gesture-type discriminants
// ---------------------------------------------------------------------------

/**
 * The five canonical gesture types.
 *
 * These are the normalised cross-layer values; each layer may use different
 * internal names (e.g., "BUILDING_CLICKED" → "click").
 *
 * - "click"        — primary pointer button (left-click / tap)
 * - "hover"        — pointer entered the entity's bounding region
 * - "unhover"      — pointer left the entity's bounding region
 * - "context_menu" — secondary pointer button (right-click / long-press)
 * - "drag"         — drag-handle manipulation (fixture layer only)
 */
export type InteractionGestureType =
  | "click"
  | "hover"
  | "unhover"
  | "context_menu"
  | "drag";

/** O(1) membership set for guard checks. */
export const INTERACTION_GESTURE_TYPES: ReadonlySet<string> =
  new Set<InteractionGestureType>([
    "click",
    "hover",
    "unhover",
    "context_menu",
    "drag",
  ]);

/** Type guard — narrows an unknown string to InteractionGestureType. */
export function isInteractionGestureType(
  s: string,
): s is InteractionGestureType {
  return INTERACTION_GESTURE_TYPES.has(s);
}

// ---------------------------------------------------------------------------
// Layer discriminants
// ---------------------------------------------------------------------------

/**
 * The three ontology layers that emit interaction intents.
 *
 * - "domain"         — building-level interactions (high-level overview)
 * - "infrastructure" — room-level interactions (structural navigation)
 * - "meta"           — agent-level interactions (agent operations)
 */
export type InteractionLayer = "domain" | "infrastructure" | "meta";

/** O(1) membership set. */
export const INTERACTION_LAYERS: ReadonlySet<string> =
  new Set<InteractionLayer>(["domain", "infrastructure", "meta"]);

/** Type guard. */
export function isInteractionLayer(s: string): s is InteractionLayer {
  return INTERACTION_LAYERS.has(s);
}

// ---------------------------------------------------------------------------
// Canonical entity schema
// ---------------------------------------------------------------------------

/**
 * The canonical unified `interaction_intent` entity.
 *
 * This is the single normalised shape that ALL interaction layers produce after
 * their layer-specific typed intent has been created.  It is the ontology's
 * first-class interaction record.
 *
 * Required canonical fields (the three discriminants from Sub-AC 4a spec):
 *   • target_entity_type — the domain type of the target entity
 *   • gesture_type       — the normalised gesture kind
 *   • target_id          — the stable, layer-scoped ID of the target entity
 *
 * Additional context fields:
 *   • intent_id          — unique ID for cross-referencing in logs
 *   • ts                 — Unix ms wall-clock timestamp (monotonic)
 *   • ts_iso             — ISO-8601 string representation of ts
 *   • layer              — the ontology layer that emitted this intent
 *   • session_id         — optional operator session for grouping/analytics
 *   • world_position     — optional 3D intersection point (Y-up, right-handed)
 *   • source_payload     — the original layer-specific intent object, retained
 *                          for full replay fidelity (JSON-serialisable)
 *
 * Immutability
 * ─────────────
 * All fields are readonly.  The record-transparency constraint requires intents
 * to be immutable once emitted — they are written to the append-only event log
 * and must never be mutated.
 *
 * JSON serialisability
 * ────────────────────
 * Every field must survive a JSON round-trip (no Functions, Dates, Sets, or
 * circular references).  `source_payload` is typed as
 * `Readonly<Record<string, unknown>>` which enforces this at the call site.
 */
export interface InteractionIntentEntity {
  // ── Three canonical discriminant fields (Sub-AC 4a) ──────────────────
  /** Domain type of the entity that was interacted with. */
  readonly target_entity_type: InteractionTargetEntityType;
  /** Normalised gesture kind. */
  readonly gesture_type: InteractionGestureType;
  /** Stable, layer-scoped identifier of the target entity. */
  readonly target_id: string;

  // ── Identity & timing ─────────────────────────────────────────────────
  /** Unique intent ID (format: `ii-<ts>-<counter>`). */
  readonly intent_id: string;
  /** Unix ms wall-clock timestamp at which the gesture occurred. */
  readonly ts: number;
  /** ISO-8601 string representation of ts. */
  readonly ts_iso: string;

  // ── Provenance ────────────────────────────────────────────────────────
  /** Which ontology layer emitted this intent. */
  readonly layer: InteractionLayer;
  /** Optional operator session for grouping / analytics. */
  readonly session_id?: string;

  // ── Spatial context ────────────────────────────────────────────────────
  /**
   * World-space 3D intersection point (Y-up, right-handed coordinate system).
   * Null for synthesised events (keyboard / programmatic); absent for unhover
   * intents where the pointer has already left.
   */
  readonly world_position?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };

  // ── Source record ──────────────────────────────────────────────────────
  /**
   * The original layer-specific intent payload.
   *
   * Retained verbatim for full replay fidelity and audit trail.  Consumers
   * should prefer the canonical fields above for cross-layer logic; this
   * field is provided for layer-specific detail when needed.
   *
   * Must be JSON-serialisable (no Functions, Sets, circular refs).
   */
  readonly source_payload: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Input type for the factory function
// ---------------------------------------------------------------------------

/**
 * Input to `makeInteractionIntentEntity`.
 *
 * Omits `intent_id` and `ts_iso` (computed by the factory) while keeping all
 * other fields required.  `session_id` and `world_position` are optional.
 */
export type InteractionIntentEntityInput = Omit<
  InteractionIntentEntity,
  "intent_id" | "ts_iso"
>;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _entityCounter = 0;

/** Generate a unique intent ID. Not exported — use the factory instead. */
function nextEntityIntentId(): string {
  return `ii-${Date.now()}-${++_entityCounter}`;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a canonical `InteractionIntentEntity` from the provided input.
 *
 * Computes `intent_id` and `ts_iso` automatically; all other fields are taken
 * directly from `input`.  The returned object is frozen for immutability.
 *
 * This is the single factory used by ALL three layers.  Layer-specific
 * normalizers (in `interaction-intent-dispatcher.ts`) call this after mapping
 * their layer-specific intent to the canonical field set.
 *
 * @param input — All entity fields except `intent_id` and `ts_iso`
 * @returns     A frozen, JSON-serialisable InteractionIntentEntity
 *
 * @example
 * ```ts
 * const entity = makeInteractionIntentEntity({
 *   target_entity_type: "building",
 *   gesture_type: "click",
 *   target_id: "building-hq",
 *   ts: 1_700_000_000_000,
 *   layer: "domain",
 *   source_payload: { intent: "BUILDING_CLICKED", building_id: "building-hq", ... },
 * });
 * ```
 */
export function makeInteractionIntentEntity(
  input: InteractionIntentEntityInput,
): InteractionIntentEntity {
  return Object.freeze({
    intent_id:          nextEntityIntentId(),
    ts_iso:             new Date(input.ts).toISOString(),
    target_entity_type: input.target_entity_type,
    gesture_type:       input.gesture_type,
    target_id:          input.target_id,
    ts:                 input.ts,
    layer:              input.layer,
    session_id:         input.session_id,
    world_position:     input.world_position,
    source_payload:     input.source_payload,
  });
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Type guard — narrows `unknown` to `InteractionIntentEntity`.
 *
 * Checks the three canonical discriminant fields plus the required identity
 * fields.  The `source_payload` field is checked only for object-ness.
 *
 * @example
 * ```ts
 * const parsed = JSON.parse(json);
 * if (isInteractionIntentEntity(parsed)) {
 *   console.log(parsed.gesture_type, parsed.target_entity_type);
 * }
 * ```
 */
export function isInteractionIntentEntity(
  v: unknown,
): v is InteractionIntentEntity {
  if (!isObj(v)) return false;
  return (
    isInteractionTargetEntityType(v["target_entity_type"] as string) &&
    isInteractionGestureType(v["gesture_type"] as string) &&
    typeof v["target_id"] === "string" &&
    v["target_id"].length > 0 &&
    typeof v["intent_id"] === "string" &&
    typeof v["ts"] === "number" &&
    v["ts"] > 0 &&
    typeof v["ts_iso"] === "string" &&
    isInteractionLayer(v["layer"] as string) &&
    isObj(v["source_payload"])
  );
}

// ---------------------------------------------------------------------------
// Convenience: extract canonical fields only
// ---------------------------------------------------------------------------

/**
 * The three canonical discriminant fields as a plain object.
 *
 * Useful when callers only need to route on entity type / gesture type /
 * target ID without carrying the full entity through their pipeline.
 */
export interface CanonicalIntentKey {
  readonly target_entity_type: InteractionTargetEntityType;
  readonly gesture_type: InteractionGestureType;
  readonly target_id: string;
}

/**
 * Extract only the three canonical discriminant fields from an entity.
 *
 * @example
 * ```ts
 * const key = extractCanonicalKey(entity);
 * // key = { target_entity_type: "room", gesture_type: "click", target_id: "room-ops" }
 * ```
 */
export function extractCanonicalKey(
  entity: InteractionIntentEntity,
): CanonicalIntentKey {
  return {
    target_entity_type: entity.target_entity_type,
    gesture_type:       entity.gesture_type,
    target_id:          entity.target_id,
  };
}
