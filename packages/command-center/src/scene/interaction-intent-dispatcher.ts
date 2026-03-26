/**
 * interaction-intent-dispatcher.ts — Cross-layer emitter/dispatcher for
 * canonical interaction_intent entities.
 *
 * Sub-AC 4a: The emitter/dispatcher used by all three interaction layers
 * (domain/building, infrastructure/room, meta/agent) to produce correctly-
 * shaped canonical `InteractionIntentEntity` objects.
 *
 * Design
 * ──────
 * Each layer has its own richly-typed, layer-specific intent system
 * (building-interaction-intents.ts / room-interaction-intents.ts /
 * agent-interaction-intents.ts).  Those layer-specific shapes are the
 * production representations used inside Three.js event handlers.
 *
 * The dispatcher provides:
 *
 *   1. **Per-layer normalizer functions** — pure functions that map a
 *      layer-specific intent to the canonical `InteractionIntentEntity` shape,
 *      extracting the three discriminant fields and preserving the source
 *      payload verbatim.
 *
 *   2. **Generic `dispatchIntent` function** — accepts any
 *      `NormalizableIntent` (union of all layer-specific types) and routes to
 *      the correct normalizer automatically.
 *
 *   3. **`InteractionIntentDispatcher` class** — a lightweight, stateful
 *      emitter with an append-only ring buffer.  Instances are shared by all
 *      three layers (dependency-injected into the scene providers).
 *
 * No React/Three.js/DOM dependencies
 * ────────────────────────────────────
 * This module is fully pure TypeScript.  It can be instantiated and tested in
 * any Node.js environment without a browser or Three.js context.  All event-
 * dispatching concerns (R3F event handlers, DOM event propagation) are handled
 * by the layer-specific hooks (use-building-interaction.ts, etc.); the
 * dispatcher only consumes already-constructed intent objects.
 *
 * No command-pipeline coupling
 * ─────────────────────────────
 * The dispatcher does NOT write command files, does NOT contact the
 * orchestrator, and does NOT trigger store mutations.  It is a pure
 * record-transparency emitter — it captures what happened and notifies
 * subscribers.  Effect execution is the responsibility of the downstream
 * command layer.
 *
 * Record transparency
 * ────────────────────
 * Every dispatched entity is:
 *   • Immutable (Object.freeze applied by the entity factory)
 *   • JSON-serialisable
 *   • Assigned a unique intent_id for cross-referencing in logs
 *
 * Usage
 * ─────
 * ```ts
 * // In a scene provider:
 * const dispatcher = new InteractionIntentDispatcher({ maxBuffer: 200 });
 *
 * // In a building interaction handler:
 * dispatcher.dispatch(makeBuildingClickedIntent({ ... }));
 *
 * // In a room interaction handler:
 * dispatcher.dispatch(makeRoomClickedIntent({ ... }));
 *
 * // In an agent interaction handler:
 * dispatcher.dispatch(makeAgentClickedIntent({ ... }));
 *
 * // Subscribe to canonical intents:
 * const unsubscribe = dispatcher.subscribe((entity) => {
 *   console.log(entity.target_entity_type, entity.gesture_type, entity.target_id);
 * });
 * ```
 */

import {
  makeInteractionIntentEntity,
  type InteractionIntentEntity,
  type InteractionGestureType,
} from "./interaction-intent-entity.js";

// ── Layer-specific intent types (imported for normalizer signatures) ──────────

import type {
  BuildingInteractionIntent,
} from "./building-interaction-intents.js";

import type {
  RoomInteractionIntent,
} from "./room-interaction-intents.js";

import type {
  AgentInteractionIntent,
} from "./agent-interaction-intents.js";

import type {
  FixtureInteractionIntent,
} from "./fixture-interaction-intents.js";

// ---------------------------------------------------------------------------
// Normalizable intent union — accepted by the generic dispatcher
// ---------------------------------------------------------------------------

/**
 * Union of all layer-specific intent types that `dispatchIntent` can accept.
 *
 * Each variant is tagged by its `intent` field (building/room/agent intents)
 * or by being a FixtureInteractionIntent.
 */
export type NormalizableIntent =
  | BuildingInteractionIntent
  | RoomInteractionIntent
  | AgentInteractionIntent
  | FixtureInteractionIntent;

// ---------------------------------------------------------------------------
// Gesture-type mapping helpers (internal pure lookups)
// ---------------------------------------------------------------------------

/**
 * Map a Building-layer intent discriminator to the canonical gesture type.
 * Returns null for unrecognised values (defensive — should never happen).
 */
function buildingKindToGesture(kind: string): InteractionGestureType | null {
  switch (kind) {
    case "BUILDING_CLICKED":      return "click";
    case "BUILDING_HOVERED":      return "hover";
    case "BUILDING_UNHOVERED":    return "unhover";
    case "BUILDING_CONTEXT_MENU": return "context_menu";
    default:                      return null;
  }
}

/**
 * Map a Room-layer intent discriminator to the canonical gesture type.
 */
function roomKindToGesture(kind: string): InteractionGestureType | null {
  switch (kind) {
    case "ROOM_CLICKED":      return "click";
    case "ROOM_HOVERED":      return "hover";
    case "ROOM_UNHOVERED":    return "unhover";
    case "ROOM_CONTEXT_MENU": return "context_menu";
    default:                  return null;
  }
}

/**
 * Map an Agent-layer intent discriminator to the canonical gesture type.
 */
function agentKindToGesture(kind: string): InteractionGestureType | null {
  switch (kind) {
    case "AGENT_CLICKED":      return "click";
    case "AGENT_HOVERED":      return "hover";
    case "AGENT_UNHOVERED":    return "unhover";
    case "AGENT_CONTEXT_MENU": return "context_menu";
    default:                   return null;
  }
}

/**
 * Map a Fixture-layer intent discriminator to the canonical gesture type.
 */
function fixtureKindToGesture(kind: string): InteractionGestureType | null {
  switch (kind) {
    case "FIXTURE_BUTTON_CLICKED":
    case "FIXTURE_MENU_ANCHOR_OPENED":
    case "FIXTURE_MENU_ANCHOR_CLOSED":
      return "click";
    case "FIXTURE_BUTTON_HOVERED":
      return "hover";
    case "FIXTURE_BUTTON_UNHOVERED":
      return "unhover";
    case "FIXTURE_HANDLE_DRAG_START":
    case "FIXTURE_HANDLE_DRAG_MOVE":
    case "FIXTURE_HANDLE_DRAG_END":
      return "drag";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Per-layer normalizer functions (exported — for direct use by each layer)
// ---------------------------------------------------------------------------

/**
 * Normalize a **building-layer** (domain layer) intent to the canonical entity.
 *
 * Extracts:
 *   • `target_entity_type` = "building"
 *   • `gesture_type`       = derived from `intent.intent` discriminator
 *   • `target_id`          = `intent.building_id`
 *
 * @throws {Error} if the intent discriminator is not a known building kind
 *
 * @example
 * ```ts
 * const entity = normalizeBuildingIntent(makeBuildingClickedIntent({ ... }));
 * entity.target_entity_type // → "building"
 * entity.gesture_type       // → "click"
 * entity.target_id          // → "building-hq"
 * ```
 */
export function normalizeBuildingIntent(
  intent: BuildingInteractionIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const payload = intent as unknown as Record<string, unknown>;
  const gestureType = buildingKindToGesture(intent.intent);
  if (gestureType === null) {
    throw new Error(
      `[interaction-intent-dispatcher] normalizeBuildingIntent: ` +
      `Unknown intent discriminator "${intent.intent}". ` +
      `Expected one of: BUILDING_CLICKED, BUILDING_HOVERED, BUILDING_UNHOVERED, ` +
      `BUILDING_CONTEXT_MENU.`,
    );
  }
  const targetId = (payload["building_id"] as string | undefined) ?? "";
  const worldPos = (payload["world_position"] as { x: number; y: number; z: number } | null | undefined) ?? undefined;

  return makeInteractionIntentEntity({
    target_entity_type: "building",
    gesture_type:       gestureType,
    target_id:          targetId,
    ts:                 (payload["ts"] as number) ?? Date.now(),
    layer:              "domain",
    session_id:         sessionOverride ?? (payload["session_id"] as string | undefined),
    world_position:     worldPos ?? undefined,
    source_payload:     payload,
  });
}

/**
 * Normalize a **room-layer** (infrastructure layer) intent to the canonical entity.
 *
 * Extracts:
 *   • `target_entity_type` = "room"
 *   • `gesture_type`       = derived from `intent.intent` discriminator
 *   • `target_id`          = `intent.room_id`
 *
 * @throws {Error} if the intent discriminator is not a known room kind
 *
 * @example
 * ```ts
 * const entity = normalizeRoomIntent(makeRoomClickedIntent({ ... }));
 * entity.target_entity_type // → "room"
 * entity.gesture_type       // → "click"
 * entity.target_id          // → "control-room-01"
 * ```
 */
export function normalizeRoomIntent(
  intent: RoomInteractionIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const payload = intent as unknown as Record<string, unknown>;
  const gestureType = roomKindToGesture(intent.intent);
  if (gestureType === null) {
    throw new Error(
      `[interaction-intent-dispatcher] normalizeRoomIntent: ` +
      `Unknown intent discriminator "${intent.intent}". ` +
      `Expected one of: ROOM_CLICKED, ROOM_HOVERED, ROOM_UNHOVERED, ROOM_CONTEXT_MENU.`,
    );
  }
  const targetId = (payload["room_id"] as string | undefined) ?? "";
  const worldPos = (payload["world_position"] as { x: number; y: number; z: number } | null | undefined) ?? undefined;

  return makeInteractionIntentEntity({
    target_entity_type: "room",
    gesture_type:       gestureType,
    target_id:          targetId,
    ts:                 (payload["ts"] as number) ?? Date.now(),
    layer:              "infrastructure",
    session_id:         sessionOverride ?? (payload["session_id"] as string | undefined),
    world_position:     worldPos ?? undefined,
    source_payload:     payload,
  });
}

/**
 * Normalize an **agent-layer** (meta layer) intent to the canonical entity.
 *
 * Extracts:
 *   • `target_entity_type` = "agent"
 *   • `gesture_type`       = derived from `intent.intent` discriminator
 *   • `target_id`          = `intent.agentId`
 *
 * @throws {Error} if the intent discriminator is not a known agent kind
 *
 * @example
 * ```ts
 * const entity = normalizeAgentIntent(makeAgentClickedIntent({ ... }));
 * entity.target_entity_type // → "agent"
 * entity.gesture_type       // → "click"
 * entity.target_id          // → "researcher-01"
 * ```
 */
export function normalizeAgentIntent(
  intent: AgentInteractionIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const payload = intent as unknown as Record<string, unknown>;
  const gestureType = agentKindToGesture(intent.intent);
  if (gestureType === null) {
    throw new Error(
      `[interaction-intent-dispatcher] normalizeAgentIntent: ` +
      `Unknown intent discriminator "${intent.intent}". ` +
      `Expected one of: AGENT_CLICKED, AGENT_HOVERED, AGENT_UNHOVERED, AGENT_CONTEXT_MENU.`,
    );
  }
  const targetId = (payload["agentId"] as string | undefined) ?? "";
  const worldPos = (payload["worldPosition"] as { x: number; y: number; z: number } | null | undefined) ?? undefined;

  return makeInteractionIntentEntity({
    target_entity_type: "agent",
    gesture_type:       gestureType,
    target_id:          targetId,
    ts:                 (payload["ts"] as number) ?? Date.now(),
    layer:              "meta",
    session_id:         sessionOverride ?? (payload["session_id"] as string | undefined),
    world_position:     worldPos ?? undefined,
    source_payload:     payload,
  });
}

/**
 * Normalize an **agent_instance-layer** intent to the canonical entity.
 *
 * Sub-AC 4d: Produces canonical entities with `target_entity_type = "agent_instance"`,
 * distinguishing this layer from the broader `"agent"` type.
 *
 * Extracts:
 *   • `target_entity_type` = "agent_instance"  ← sub-AC 4d discriminant
 *   • `gesture_type`       = derived from `intent.intent` discriminator
 *   • `target_id`          = `intent.agentId`
 *   • `layer`              = "meta"
 *
 * Uses the same `AgentInteractionIntent` factory shapes as `normalizeAgentIntent`
 * but stamps the canonical entity with the more specific `"agent_instance"` type.
 * This allows downstream consumers to route agent_instance interactions separately
 * from room-level agent-group interactions.
 *
 * @throws {Error} if the intent discriminator is not a known agent kind
 *
 * @example
 * ```ts
 * const entity = normalizeAgentInstanceIntent(makeAgentClickedIntent({ ... }));
 * entity.target_entity_type // → "agent_instance"
 * entity.gesture_type       // → "click"
 * entity.target_id          // → "implementer-42"
 * ```
 */
export function normalizeAgentInstanceIntent(
  intent: AgentInteractionIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const payload = intent as unknown as Record<string, unknown>;
  const gestureType = agentKindToGesture(intent.intent);
  if (gestureType === null) {
    throw new Error(
      `[interaction-intent-dispatcher] normalizeAgentInstanceIntent: ` +
      `Unknown intent discriminator "${intent.intent}". ` +
      `Expected one of: AGENT_CLICKED, AGENT_HOVERED, AGENT_UNHOVERED, AGENT_CONTEXT_MENU.`,
    );
  }
  const targetId = (payload["agentId"] as string | undefined) ?? "";
  const worldPos = (payload["worldPosition"] as { x: number; y: number; z: number } | null | undefined) ?? undefined;

  return makeInteractionIntentEntity({
    target_entity_type: "agent_instance",
    gesture_type:       gestureType,
    target_id:          targetId,
    ts:                 (payload["ts"] as number) ?? Date.now(),
    layer:              "meta",
    session_id:         sessionOverride ?? (payload["session_id"] as string | undefined),
    world_position:     worldPos ?? undefined,
    source_payload:     payload,
  });
}

/**
 * Normalize a **fixture-layer** intent to the canonical entity.
 *
 * Extracts:
 *   • `target_entity_type` = "fixture"
 *   • `gesture_type`       = derived from `intent.intent` discriminator
 *   • `target_id`          = `intent.fixtureId`
 *
 * @throws {Error} if the intent discriminator is not a known fixture kind
 */
export function normalizeFixtureIntent(
  intent: FixtureInteractionIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const payload = intent as unknown as Record<string, unknown>;
  const gestureType = fixtureKindToGesture(intent.intent);
  if (gestureType === null) {
    throw new Error(
      `[interaction-intent-dispatcher] normalizeFixtureIntent: ` +
      `Unknown intent discriminator "${intent.intent}".`,
    );
  }
  const targetId = (payload["fixtureId"] as string | undefined) ?? "";
  const worldPos = (payload["worldPosition"] as { x: number; y: number; z: number } | null | undefined) ?? undefined;

  return makeInteractionIntentEntity({
    target_entity_type: "fixture",
    gesture_type:       gestureType,
    target_id:          targetId,
    ts:                 (payload["ts"] as number) ?? Date.now(),
    layer:              "meta",   // fixture layer rides the meta stratum
    session_id:         sessionOverride ?? (payload["session_id"] as string | undefined),
    world_position:     worldPos ?? undefined,
    source_payload:     payload,
  });
}

// ---------------------------------------------------------------------------
// Generic dispatch function (auto-routes to the correct normalizer)
// ---------------------------------------------------------------------------

/** Prefix check for building intents. */
const BUILDING_INTENT_PREFIX_SET = new Set([
  "BUILDING_CLICKED",
  "BUILDING_HOVERED",
  "BUILDING_UNHOVERED",
  "BUILDING_CONTEXT_MENU",
]);

/** Prefix check for room intents. */
const ROOM_INTENT_PREFIX_SET = new Set([
  "ROOM_CLICKED",
  "ROOM_HOVERED",
  "ROOM_UNHOVERED",
  "ROOM_CONTEXT_MENU",
]);

/** Prefix check for agent intents. */
const AGENT_INTENT_PREFIX_SET = new Set([
  "AGENT_CLICKED",
  "AGENT_HOVERED",
  "AGENT_UNHOVERED",
  "AGENT_CONTEXT_MENU",
]);

/** Prefix check for fixture intents. */
const FIXTURE_INTENT_PREFIX_SET = new Set([
  "FIXTURE_BUTTON_CLICKED",
  "FIXTURE_BUTTON_HOVERED",
  "FIXTURE_BUTTON_UNHOVERED",
  "FIXTURE_HANDLE_DRAG_START",
  "FIXTURE_HANDLE_DRAG_MOVE",
  "FIXTURE_HANDLE_DRAG_END",
  "FIXTURE_MENU_ANCHOR_OPENED",
  "FIXTURE_MENU_ANCHOR_CLOSED",
]);

/**
 * Generic dispatch function: accepts any `NormalizableIntent` and routes it
 * to the correct per-layer normalizer, returning the canonical entity.
 *
 * Use this when the caller does not know the specific layer at compile time
 * (e.g., in event-bus subscribers that handle all layers).
 *
 * @throws {Error} if the intent discriminator is not recognized by any layer
 *
 * @example
 * ```ts
 * // Works for any of the three layers:
 * const entity = dispatchIntent(someLayerSpecificIntent);
 * console.log(entity.target_entity_type, entity.gesture_type);
 * ```
 */
export function dispatchIntent(
  intent: NormalizableIntent,
  sessionOverride?: string,
): InteractionIntentEntity {
  const kind = intent.intent;

  if (BUILDING_INTENT_PREFIX_SET.has(kind)) {
    return normalizeBuildingIntent(intent as BuildingInteractionIntent, sessionOverride);
  }
  if (ROOM_INTENT_PREFIX_SET.has(kind)) {
    return normalizeRoomIntent(intent as RoomInteractionIntent, sessionOverride);
  }
  if (AGENT_INTENT_PREFIX_SET.has(kind)) {
    return normalizeAgentIntent(intent as AgentInteractionIntent, sessionOverride);
  }
  if (FIXTURE_INTENT_PREFIX_SET.has(kind)) {
    return normalizeFixtureIntent(intent as FixtureInteractionIntent, sessionOverride);
  }

  throw new Error(
    `[interaction-intent-dispatcher] dispatchIntent: ` +
    `Unrecognized intent discriminator "${kind}". ` +
    `No normalizer registered for this intent type.`,
  );
}

// ---------------------------------------------------------------------------
// InteractionIntentDispatcher class
// ---------------------------------------------------------------------------

/** Options for the InteractionIntentDispatcher. */
export interface InteractionIntentDispatcherOptions {
  /**
   * Maximum number of canonical entities to retain in the local ring buffer.
   * Oldest entries are evicted once this limit is reached.
   * @default 200
   */
  maxBuffer?: number;
}

/** Subscriber callback type. */
export type IntentSubscriber = (entity: InteractionIntentEntity) => void;

/**
 * InteractionIntentDispatcher — shared emitter/dispatcher for all three
 * interaction layers.
 *
 * Responsibilities
 * ─────────────────
 *   1. Accept layer-specific intents via `dispatch()`.
 *   2. Normalise them to canonical `InteractionIntentEntity` objects.
 *   3. Maintain an append-only ring buffer of canonical entities.
 *   4. Notify synchronous subscribers immediately after each dispatch.
 *
 * Independence from React / Three.js
 * ────────────────────────────────────
 * This class has zero browser/React/Three.js dependencies and can be
 * instantiated in pure Node.js test environments.
 *
 * Independence from the command pipeline
 * ────────────────────────────────────────
 * The dispatcher does NOT write command files, does NOT contact the
 * orchestrator, and does NOT call any Zustand store.  It is a pure
 * record-transparency emitter.
 *
 * @example
 * ```ts
 * const dispatcher = new InteractionIntentDispatcher();
 *
 * const unsub = dispatcher.subscribe((entity) => {
 *   console.log(entity.gesture_type, "on", entity.target_id);
 * });
 *
 * dispatcher.dispatch(makeBuildingClickedIntent({ building_id: "hq", ... }));
 * // → subscriber fires with { gesture_type: "click", target_id: "hq", ... }
 *
 * unsub(); // stop listening
 * ```
 */
export class InteractionIntentDispatcher {
  /** Append-only ring buffer of canonical entities. */
  private readonly _buffer: InteractionIntentEntity[] = [];
  /** Maximum buffer size. */
  private readonly _maxBuffer: number;
  /** Synchronous subscriber set. */
  private readonly _subscribers: Set<IntentSubscriber> = new Set();
  /** Monotonic dispatch counter (survives ring eviction). */
  private _totalDispatched = 0;

  constructor(options: InteractionIntentDispatcherOptions = {}) {
    this._maxBuffer = options.maxBuffer ?? 200;
  }

  // ── Core dispatch ───────────────────────────────────────────────────────

  /**
   * Dispatch any layer-specific intent.
   *
   * Normalizes to canonical form, appends to buffer, notifies subscribers.
   * Returns the canonical entity for call-site convenience.
   *
   * @param intent         — Any of the four layer-specific intent types
   * @param sessionOverride — Optional session ID to inject (overrides the
   *                          session_id from the source intent)
   * @returns The canonical `InteractionIntentEntity` produced from the intent
   *
   * @throws if the intent's discriminator is not recognized
   */
  dispatch(
    intent: NormalizableIntent,
    sessionOverride?: string,
  ): InteractionIntentEntity {
    const entity = dispatchIntent(intent, sessionOverride);
    this._append(entity);
    this._notify(entity);
    return entity;
  }

  /**
   * Dispatch a pre-built canonical entity directly (no normalisation step).
   *
   * Use this when you have already called a per-layer normalizer and want to
   * record the result without a second normalisation pass.
   */
  dispatchEntity(entity: InteractionIntentEntity): void {
    this._append(entity);
    this._notify(entity);
  }

  // ── Subscribers ──────────────────────────────────────────────────────────

  /**
   * Register a synchronous subscriber.
   *
   * Called immediately (synchronously) after each `dispatch()` or
   * `dispatchEntity()` call, in registration order.
   *
   * @returns An unsubscribe function — call it to remove the subscriber.
   */
  subscribe(subscriber: IntentSubscriber): () => void {
    this._subscribers.add(subscriber);
    return () => {
      this._subscribers.delete(subscriber);
    };
  }

  // ── Buffer query ─────────────────────────────────────────────────────────

  /**
   * The current ring-buffer contents (most-recently dispatched last).
   * Returns a fresh copy so callers cannot mutate the internal array.
   */
  get buffer(): readonly InteractionIntentEntity[] {
    return [...this._buffer];
  }

  /** Total entities dispatched since this instance was created. */
  get totalDispatched(): number {
    return this._totalDispatched;
  }

  /** The most recently dispatched canonical entity, or null if empty. */
  get lastEntity(): InteractionIntentEntity | null {
    return this._buffer.length > 0
      ? (this._buffer[this._buffer.length - 1] ?? null)
      : null;
  }

  /**
   * Return all entities for a given `target_entity_type`.
   * Most-recently dispatched first.
   */
  getByEntityType(
    type: InteractionIntentEntity["target_entity_type"],
  ): readonly InteractionIntentEntity[] {
    return [...this._buffer]
      .filter((e) => e.target_entity_type === type)
      .reverse();
  }

  /**
   * Return all entities for a given `gesture_type`.
   * Most-recently dispatched first.
   */
  getByGesture(
    gesture: InteractionIntentEntity["gesture_type"],
  ): readonly InteractionIntentEntity[] {
    return [...this._buffer]
      .filter((e) => e.gesture_type === gesture)
      .reverse();
  }

  /**
   * Return all entities for a given `target_id`.
   * Most-recently dispatched first.
   */
  getByTargetId(targetId: string): readonly InteractionIntentEntity[] {
    return [...this._buffer]
      .filter((e) => e.target_id === targetId)
      .reverse();
  }

  /** Clear the ring buffer and reset the counter (e.g., on session reset). */
  clear(): void {
    this._buffer.length = 0;
    this._totalDispatched = 0;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _append(entity: InteractionIntentEntity): void {
    this._buffer.push(entity);
    if (this._buffer.length > this._maxBuffer) {
      this._buffer.shift();
    }
    this._totalDispatched++;
  }

  private _notify(entity: InteractionIntentEntity): void {
    for (const subscriber of this._subscribers) {
      try {
        subscriber(entity);
      } catch {
        // Subscribers must not throw; silently ignore to prevent one broken
        // subscriber from blocking the others.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory (optional convenience)
// ---------------------------------------------------------------------------

/**
 * Create a new `InteractionIntentDispatcher` with the given options.
 *
 * Each scene/provider typically creates its own instance; this factory avoids
 * `new` at the call site.
 *
 * @example
 * ```ts
 * const dispatcher = createInteractionIntentDispatcher({ maxBuffer: 500 });
 * ```
 */
export function createInteractionIntentDispatcher(
  options: InteractionIntentDispatcherOptions = {},
): InteractionIntentDispatcher {
  return new InteractionIntentDispatcher(options);
}
