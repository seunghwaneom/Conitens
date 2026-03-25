/**
 * fixture-intent-bridge.ts — Wiring layer for Sub-AC 7b.
 *
 * Sub-AC 7b: Implement interaction_intent production — wire affordance
 * manipulation events (click, drag, select) so each ui_fixture generates a
 * corresponding interaction_intent entity capturing the affordance id,
 * manipulation type, and target entity reference.
 *
 * ## Design
 *
 * This module is the **bridge** between:
 *   • Raw `FixtureInteractionIntent` objects emitted by SpatialUiFixture
 *     components (FixtureButton, FixtureHandle, FixtureMenuAnchor) — Sub-AC 7a
 *   • Canonical `InteractionIntentEntity` objects produced by the
 *     `InteractionIntentDispatcher` — Sub-AC 4a
 *
 * Each ui_fixture affordance manipulation (click, drag, select/menu) is wired
 * so that it produces a canonical entity capturing:
 *
 *   • `affordance_id`     — the stable fixtureId of the manipulated fixture
 *   • `manipulation_type` — the canonical gesture (click, drag, hover, unhover)
 *   • `target_entity_ref` — the parent entity (entityType + entityId) that
 *                           owns the fixture (agent, task, or room)
 *
 * ## Affordance manipulation coverage
 *
 * | Fixture kind    | Manipulation          | gesture_type |
 * |────────────────|──────────────────────|────────────|
 * | button          | click (primary click) | "click"     |
 * | button          | hover enter           | "hover"     |
 * | button          | hover exit            | "unhover"   |
 * | handle          | drag start            | "drag"      |
 * | handle          | drag move             | "drag"      |
 * | handle          | drag end              | "drag"      |
 * | menu_anchor     | menu open (select)    | "click"     |
 * | menu_anchor     | menu close (deselect) | "click"     |
 *
 * ## Two-step pattern
 *
 * Step 1 — Layer-specific intent:
 *   The SpatialUiFixture component creates a `FixtureInteractionIntent` via
 *   the factory functions (makeFixtureButtonClickedIntent, etc.) and passes
 *   it to the `onIntent` callback.
 *
 * Step 2 — Canonical normalization & dispatch:
 *   `wireFixtureIntent` receives the raw intent, calls `normalizeFixtureIntent`
 *   to extract the three canonical discriminants, and dispatches the resulting
 *   `InteractionIntentEntity` through the shared `InteractionIntentDispatcher`.
 *
 * ## Record transparency
 *
 * Every bridge result is:
 *   • Immutable (entity is frozen by makeInteractionIntentEntity)
 *   • JSON-serialisable
 *   • Traceable via intent_id in the dispatcher ring buffer
 *   • Contains affordance capture for downstream routing
 *
 * ## No React / Three.js dependencies
 *
 * This module is pure TypeScript.  It can be imported and tested in Node.js
 * without any browser context, matching the Sub-AC 4a/4b/4c/4d pattern.
 *
 * ## Usage
 *
 * ```tsx
 * // In a scene provider:
 * const dispatcher = createInteractionIntentDispatcher();
 * const handleFixtureIntent = createFixtureBridgeHandler(dispatcher);
 *
 * // In JSX (SpatialFixtureLayer):
 * <SpatialFixtureLayer entities={entries} onIntent={handleFixtureIntent} />
 *
 * // Result — every affordance manipulation produces a canonical entity:
 * // entity.target_entity_type === "fixture"
 * // entity.gesture_type       === "click" | "drag" | "hover" | "unhover"
 * // entity.target_id          === fixtureId
 * // entity.source_payload.entityRef === { entityType, entityId }
 * ```
 */

import type {
  FixtureInteractionIntent,
  FixtureEntityRef,
} from "./fixture-interaction-intents.js";

import {
  normalizeFixtureIntent,
  type InteractionIntentDispatcher,
} from "./interaction-intent-dispatcher.js";

import type {
  InteractionIntentEntity,
  InteractionGestureType,
} from "./interaction-intent-entity.js";

// ---------------------------------------------------------------------------
// FixtureAffordanceCapture — the three required fields from the task spec
// ---------------------------------------------------------------------------

/**
 * The three fields captured per affordance manipulation event, as required
 * by Sub-AC 7b:
 *
 *   • `affordance_id`     — stable fixtureId of the manipulated fixture
 *                           (e.g. "agent-pause-btn", "task-cancel-handle")
 *   • `manipulation_type` — canonical gesture type (click, drag, hover, unhover)
 *                           Derived from the fixture intent discriminator.
 *   • `target_entity_ref` — the parent entity that owns the fixture:
 *                           `{ entityType: "agent" | "task" | "room",
 *                              entityId: string }`
 */
export interface FixtureAffordanceCapture {
  /**
   * Stable fixture component ID — identifies the specific affordance that
   * was manipulated (button ID, handle ID, or menu-anchor ID).
   *
   * Sourced from `FixtureInteractionIntent.fixtureId`.
   */
  readonly affordance_id: string;

  /**
   * Canonical manipulation type — the normalised gesture performed on this
   * affordance.
   *
   * Mapping:
   *   FIXTURE_BUTTON_CLICKED        → "click"
   *   FIXTURE_MENU_ANCHOR_OPENED    → "click"    (select / open)
   *   FIXTURE_MENU_ANCHOR_CLOSED    → "click"    (deselect / close)
   *   FIXTURE_BUTTON_HOVERED        → "hover"
   *   FIXTURE_BUTTON_UNHOVERED      → "unhover"
   *   FIXTURE_HANDLE_DRAG_START     → "drag"
   *   FIXTURE_HANDLE_DRAG_MOVE      → "drag"
   *   FIXTURE_HANDLE_DRAG_END       → "drag"
   */
  readonly manipulation_type: InteractionGestureType;

  /**
   * Reference to the parent entity this fixture is attached to.
   * Consumers use this to act on the correct agent, task, or room without
   * needing an additional store lookup.
   *
   * Sourced from `FixtureInteractionIntent.entityRef`.
   */
  readonly target_entity_ref: FixtureEntityRef;
}

// ---------------------------------------------------------------------------
// Intent-kind → manipulation_type mapping
// ---------------------------------------------------------------------------

/**
 * Map a FixtureInteractionIntent kind to its canonical manipulation_type.
 * Returns null for unrecognised kinds (defensive — should never happen).
 *
 * This is a pure, exported function to enable testing the mapping in
 * isolation without constructing full intent objects.
 */
export function fixtureIntentKindToManipulationType(
  intentKind: string,
): InteractionGestureType | null {
  switch (intentKind) {
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
// extractAffordanceCapture — pure helper (no dispatcher required)
// ---------------------------------------------------------------------------

/**
 * Extract a `FixtureAffordanceCapture` from any `FixtureInteractionIntent`.
 *
 * This pure helper produces the three Sub-AC 7b required fields:
 *   • `affordance_id`     — fixtureId
 *   • `manipulation_type` — derived from intent discriminator
 *   • `target_entity_ref` — entityRef { entityType, entityId }
 *
 * It does NOT dispatch to the store or dispatcher — it is a data-extraction
 * utility suitable for use in tests and in non-dispatching consumers.
 *
 * @throws {Error} if the intent kind is not a recognised fixture intent.
 *
 * @example
 * ```ts
 * const capture = extractAffordanceCapture(clickedIntent);
 * capture.affordance_id     // "agent-pause-btn"
 * capture.manipulation_type // "click"
 * capture.target_entity_ref // { entityType: "agent", entityId: "mgr-1" }
 * ```
 */
export function extractAffordanceCapture(
  intent: FixtureInteractionIntent,
): FixtureAffordanceCapture {
  const manipulationType = fixtureIntentKindToManipulationType(intent.intent);

  if (manipulationType === null) {
    throw new Error(
      `[fixture-intent-bridge] extractAffordanceCapture: ` +
        `Unknown intent kind "${intent.intent}". ` +
        `Expected one of the FIXTURE_* intent discriminators.`,
    );
  }

  return Object.freeze({
    affordance_id: intent.fixtureId,
    manipulation_type: manipulationType,
    target_entity_ref: intent.entityRef,
  });
}

// ---------------------------------------------------------------------------
// FixtureIntentBridgeResult — result type returned by the wiring functions
// ---------------------------------------------------------------------------

/**
 * Result returned by `wireFixtureIntent` and `createFixtureBridgeHandler`.
 *
 * Carries three artefacts:
 *   1. `intent`     — the original layer-specific FixtureInteractionIntent
 *   2. `entity`     — the canonical InteractionIntentEntity (dispatched)
 *   3. `affordance` — the three Sub-AC 7b required capture fields
 */
export interface FixtureIntentBridgeResult {
  /**
   * The original, fully-typed FixtureInteractionIntent from the fixture
   * component.  Retained for downstream consumers that need fixture-specific
   * fields (e.g., dragDeltaWorld, screen_position) beyond what the canonical
   * entity carries.
   */
  readonly intent: FixtureInteractionIntent;

  /**
   * The canonical `InteractionIntentEntity` produced by normalization and
   * dispatched to the `InteractionIntentDispatcher`.
   *
   * Guaranteed invariants:
   *   • `entity.target_entity_type === "fixture"`
   *   • `entity.gesture_type` ∈ { "click", "drag", "hover", "unhover" }
   *   • `entity.target_id === intent.fixtureId`
   *   • `entity.layer === "meta"`
   *   • `entity.source_payload.entityRef` carries the target entity reference
   */
  readonly entity: InteractionIntentEntity;

  /**
   * The three Sub-AC 7b affordance capture fields extracted from the intent.
   * Convenience re-export so callers don't need to call extractAffordanceCapture
   * separately after wireFixtureIntent.
   */
  readonly affordance: FixtureAffordanceCapture;
}

// ---------------------------------------------------------------------------
// wireFixtureIntent — single-intent bridge (primary wiring function)
// ---------------------------------------------------------------------------

/**
 * Wire a single `FixtureInteractionIntent` affordance event to the canonical
 * interaction_intent entity system.
 *
 * This is the primary function of Sub-AC 7b — it:
 *   1. Extracts the affordance capture (affordance_id, manipulation_type,
 *      target_entity_ref) from the raw intent.
 *   2. Normalizes the raw intent to a canonical `InteractionIntentEntity`
 *      via `normalizeFixtureIntent`.
 *   3. Dispatches the canonical entity through the provided dispatcher,
 *      appending it to the ring buffer and notifying all subscribers.
 *   4. Returns all three artefacts (intent, entity, affordance) as a
 *      `FixtureIntentBridgeResult`.
 *
 * @param intent      — Raw intent from a SpatialUiFixture component
 * @param dispatcher  — Shared InteractionIntentDispatcher instance
 * @param session_id  — Optional operator session override
 * @returns           — Bridge result with intent, entity, and affordance capture
 *
 * @throws {Error} if the intent kind is unrecognised (defensive)
 *
 * @example
 * ```ts
 * // In a R3F scene provider:
 * const result = wireFixtureIntent(clickedIntent, dispatcher);
 * result.entity.target_entity_type // "fixture"
 * result.entity.gesture_type       // "click"
 * result.entity.target_id          // "agent-pause-btn"
 * result.affordance.affordance_id  // "agent-pause-btn"
 * result.affordance.manipulation_type // "click"
 * result.affordance.target_entity_ref // { entityType: "agent", entityId: "mgr-1" }
 * ```
 */
export function wireFixtureIntent(
  intent: FixtureInteractionIntent,
  dispatcher: InteractionIntentDispatcher,
  session_id?: string,
): FixtureIntentBridgeResult {
  // Step 1: Extract affordance capture (affordance_id, manipulation_type,
  //         target_entity_ref) — throws if intent kind is unrecognised.
  const affordance = extractAffordanceCapture(intent);

  // Step 2: Normalize to canonical entity.
  const entity = normalizeFixtureIntent(intent, session_id);

  // Step 3: Dispatch canonical entity through the shared dispatcher.
  //         The dispatcher appends to its ring buffer and notifies subscribers.
  dispatcher.dispatchEntity(entity);

  // Step 4: Return all three artefacts.
  return Object.freeze({ intent, entity, affordance });
}

// ---------------------------------------------------------------------------
// createFixtureBridgeHandler — factory for the onIntent callback
// ---------------------------------------------------------------------------

/**
 * Create a reusable `onIntent` callback suitable for use as the `onIntent`
 * prop on `SpatialFixtureLayer` (or any `EntityFixtureSet`).
 *
 * The returned handler:
 *   • Closes over the provided `dispatcher` and optional `session_id`
 *   • Calls `wireFixtureIntent` on each received intent
 *   • Returns the `FixtureIntentBridgeResult` (useful for direct callers)
 *   • Has no other side effects
 *
 * @param dispatcher  — Shared InteractionIntentDispatcher instance
 * @param session_id  — Optional operator session for all intents from this
 *                      fixture layer (e.g., current user/session identifier)
 * @returns           — Callback `(intent) => FixtureIntentBridgeResult`
 *
 * @example
 * ```tsx
 * const dispatcher = createInteractionIntentDispatcher();
 * const handleFixtureIntent = createFixtureBridgeHandler(dispatcher, "session-1");
 *
 * // Wire all fixture affordance events:
 * <SpatialFixtureLayer entities={entries} onIntent={handleFixtureIntent} />
 *
 * // Or for a single entity:
 * <EntityFixtureSet entityRef={ref} fixtures={fixtures} onIntent={handleFixtureIntent} />
 * ```
 */
export function createFixtureBridgeHandler(
  dispatcher: InteractionIntentDispatcher,
  session_id?: string,
): (intent: FixtureInteractionIntent) => FixtureIntentBridgeResult {
  return function handleFixtureAffordanceIntent(
    intent: FixtureInteractionIntent,
  ): FixtureIntentBridgeResult {
    return wireFixtureIntent(intent, dispatcher, session_id);
  };
}

// ---------------------------------------------------------------------------
// FIXTURE_MANIPULATION_TYPES — O(1) set of all recognised manipulation types
// ---------------------------------------------------------------------------

/**
 * Set of all canonical manipulation types produced by the fixture bridge.
 * Useful for guard checks and test assertions.
 */
export const FIXTURE_MANIPULATION_TYPES: ReadonlySet<InteractionGestureType> =
  new Set<InteractionGestureType>(["click", "drag", "hover", "unhover"]);

// ---------------------------------------------------------------------------
// FIXTURE_INTENT_KIND_TO_MANIPULATION — lookup map for all 8 intent kinds
// ---------------------------------------------------------------------------

/**
 * Read-only lookup map: fixture intent discriminator → canonical manipulation type.
 *
 * Exported for:
 *   • Exhaustiveness checking in tests (all 8 fixture intent kinds covered)
 *   • Documentation of the complete mapping
 */
export const FIXTURE_INTENT_KIND_TO_MANIPULATION: Readonly<
  Record<string, InteractionGestureType>
> = Object.freeze({
  FIXTURE_BUTTON_CLICKED:     "click",
  FIXTURE_BUTTON_HOVERED:     "hover",
  FIXTURE_BUTTON_UNHOVERED:   "unhover",
  FIXTURE_HANDLE_DRAG_START:  "drag",
  FIXTURE_HANDLE_DRAG_MOVE:   "drag",
  FIXTURE_HANDLE_DRAG_END:    "drag",
  FIXTURE_MENU_ANCHOR_OPENED: "click",
  FIXTURE_MENU_ANCHOR_CLOSED: "click",
});
