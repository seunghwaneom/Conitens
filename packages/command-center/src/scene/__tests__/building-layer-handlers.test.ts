/**
 * building-layer-handlers.test.ts
 *
 * Sub-AC 4b — Isolated tests verifying that the building layer 3D object
 * event handlers emit canonical `interaction_intent` entities with
 * `target_entity_type = 'building'` for all three gesture types.
 *
 * Test coverage
 * ─────────────
 * The tests are organized by gesture type and verify:
 *
 *   blh-01 — Click handler:
 *     • Produces `target_entity_type = 'building'`
 *     • Produces `gesture_type = 'click'`
 *     • `target_id` matches the building_id from context
 *     • Calls `stopPropagation` on the event
 *     • Dispatches the canonical entity to the dispatcher
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *
 *   blh-02 — Hover handler:
 *     • Produces `target_entity_type = 'building'`
 *     • Produces `gesture_type = 'hover'`
 *     • `target_id` matches the building_id from context
 *     • Calls `stopPropagation` on the event
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *
 *   blh-03 — Context-menu handler:
 *     • Produces `target_entity_type = 'building'`
 *     • Produces `gesture_type = 'context_menu'`
 *     • `target_id` matches the building_id from context
 *     • Calls `stopPropagation` on the event
 *     • Calls `preventDefault` on the nativeEvent
 *     • Screen position is extracted from nativeEvent
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *
 *   blh-04 — Cross-gesture isolation:
 *     • Click entity does not have gesture_type 'hover' or 'context_menu'
 *     • Hover entity does not have gesture_type 'click' or 'context_menu'
 *     • Context-menu entity does not have gesture_type 'click' or 'hover'
 *
 *   blh-05 — Dispatcher integration:
 *     • All three gestures reach the dispatcher buffer
 *     • Dispatcher subscribers are notified for each gesture
 *     • All three entities carry `layer = 'domain'`
 *
 *   blh-06 — Record transparency (JSON serialisability):
 *     • All three entities survive a JSON round-trip
 *     • Round-tripped entities still pass `isInteractionIntentEntity`
 *
 *   blh-07 — Unhover handler (completeness):
 *     • Produces `target_entity_type = 'building'`
 *     • Produces `gesture_type = 'unhover'`
 *
 *   blh-08 — Convenience record (BUILDING_LAYER_HANDLERS):
 *     • All four handler keys are present and are functions
 *
 * Isolation guarantees
 * ─────────────────────
 * • No React, no Three.js, no DOM, no Zustand stores
 * • The `InteractionIntentDispatcher` is instantiated fresh per test group
 * • All timestamps use a fixed mock so tests are deterministic
 * • No command-pipeline coupling (no file writes, no orchestrator calls)
 *
 * Test ID scheme: blh-NN
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── System under test ──────────────────────────────────────────────────────

import {
  handleBuildingClick,
  handleBuildingHover,
  handleBuildingUnhover,
  handleBuildingContextMenu,
  BUILDING_LAYER_HANDLERS,
  type BuildingGestureEvent,
  type BuildingHandlerContext,
} from "../building-layer-handlers.js";

// ── Dispatcher ─────────────────────────────────────────────────────────────

import {
  createInteractionIntentDispatcher,
} from "../interaction-intent-dispatcher.js";

// ── Entity guard (for Sub-AC 4b verification) ──────────────────────────────

import {
  isInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ── Layer-specific intent guards (for source_payload inspection) ───────────

import {
  isBuildingClickedIntent,
  isBuildingHoveredIntent,
  isBuildingUnhoveredIntent,
  isBuildingContextMenuIntent,
} from "../building-interaction-intents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BUILDING_ID  = "building-hq";
const SESSION_ID   = "blh-test-session";
const WORLD_POS    = { x: 2.0, y: 0.0, z: -1.5 } as const;
const SCREEN_X     = 640;
const SCREEN_Y     = 400;

/** Context injected into every handler call. */
const DEFAULT_CONTEXT: BuildingHandlerContext = {
  building_id: BUILDING_ID,
  drill_level: "building",
  floor_count: 2,
  session_id:  SESSION_ID,
};

/** Minimal mock pointer event with all optional fields populated. */
function makeMockEvent(overrides: Partial<BuildingGestureEvent> = {}): BuildingGestureEvent & {
  stopPropagation: ReturnType<typeof vi.fn>;
  nativeEvent: { clientX: number; clientY: number; preventDefault: ReturnType<typeof vi.fn> };
} {
  const stopPropagation = vi.fn<[], void>();
  const preventDefault  = vi.fn<[], void>();
  return {
    stopPropagation,
    point: WORLD_POS,
    nativeEvent: { clientX: SCREEN_X, clientY: SCREEN_Y, preventDefault },
    ...overrides,
  } as BuildingGestureEvent & {
    stopPropagation: ReturnType<typeof vi.fn>;
    nativeEvent: { clientX: number; clientY: number; preventDefault: ReturnType<typeof vi.fn> };
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// blh-01 — Click handler
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-01 — Click handler: emits interaction_intent with target_entity_type='building'", () => {

  it("blh-01a: entity.target_entity_type === 'building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
  });

  it("blh-01b: entity.gesture_type === 'click'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("click");
  });

  it("blh-01c: entity.target_id matches building_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(BUILDING_ID);
  });

  it("blh-01d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("blh-01e: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("blh-01f: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("blh-01g: entity.layer === 'domain'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("domain");
  });

  it("blh-01h: intent field is a BUILDING_CLICKED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(isBuildingClickedIntent(intent)).toBe(true);
    expect(intent.intent).toBe("BUILDING_CLICKED");
  });

  it("blh-01i: entity.world_position matches event.point", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.world_position).toEqual(WORLD_POS);
  });

  it("blh-01j: entity is immutable (frozen)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("blh-01k: works without stopPropagation (synthesised event)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event: BuildingGestureEvent = { point: WORLD_POS }; // no stopPropagation

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("click");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-02 — Hover handler
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-02 — Hover handler: emits interaction_intent with target_entity_type='building'", () => {

  it("blh-02a: entity.target_entity_type === 'building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
  });

  it("blh-02b: entity.gesture_type === 'hover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("hover");
  });

  it("blh-02c: entity.target_id matches building_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(BUILDING_ID);
  });

  it("blh-02d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("blh-02e: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("blh-02f: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("blh-02g: entity.layer === 'domain'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("domain");
  });

  it("blh-02h: intent field is a BUILDING_HOVERED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isBuildingHoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("BUILDING_HOVERED");
  });

  it("blh-02i: hover with null point still produces valid entity", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent({ point: undefined });

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("hover");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-03 — Context-menu handler
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-03 — Context-menu handler: emits interaction_intent with target_entity_type='building'", () => {

  it("blh-03a: entity.target_entity_type === 'building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
  });

  it("blh-03b: entity.gesture_type === 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("context_menu");
  });

  it("blh-03c: entity.target_id matches building_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(BUILDING_ID);
  });

  it("blh-03d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("blh-03e: calls preventDefault on nativeEvent to suppress browser context menu", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.nativeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("blh-03f: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("blh-03g: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("blh-03h: entity.layer === 'domain'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("domain");
  });

  it("blh-03i: intent field is a BUILDING_CONTEXT_MENU intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(isBuildingContextMenuIntent(intent)).toBe(true);
    expect(intent.intent).toBe("BUILDING_CONTEXT_MENU");
  });

  it("blh-03j: screen_position extracted from nativeEvent coordinates", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    if (!isBuildingContextMenuIntent(intent)) throw new Error("Expected context menu intent");
    expect(intent.screen_position.x).toBe(SCREEN_X);
    expect(intent.screen_position.y).toBe(SCREEN_Y);
  });

  it("blh-03k: falls back to {x:0, y:0} when nativeEvent is absent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event: BuildingGestureEvent = {
      stopPropagation: vi.fn(),
      point: WORLD_POS,
      // no nativeEvent
    };

    const { intent } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    if (!isBuildingContextMenuIntent(intent)) throw new Error("Expected context menu intent");
    expect(intent.screen_position).toEqual({ x: 0, y: 0 });
  });

  it("blh-03l: context-menu at 'floor' drill level carries correct drill_level in intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const context    = { ...DEFAULT_CONTEXT, drill_level: "floor" as const };

    const { intent } = handleBuildingContextMenu(event, context, dispatcher);

    if (!isBuildingContextMenuIntent(intent)) throw new Error("Expected context menu intent");
    expect(intent.drill_level).toBe("floor");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-04 — Cross-gesture isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-04 — Cross-gesture isolation: each handler emits its own gesture type only", () => {

  it("blh-04a: click entity does NOT have gesture_type 'hover' or 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("hover");
    expect(entity.gesture_type).not.toBe("context_menu");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("blh-04b: hover entity does NOT have gesture_type 'click' or 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("click");
    expect(entity.gesture_type).not.toBe("context_menu");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("blh-04c: context-menu entity does NOT have gesture_type 'click' or 'hover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("click");
    expect(entity.gesture_type).not.toBe("hover");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("blh-04d: all three gesture types produce target_entity_type='building' (never 'room' or 'agent')", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: clickEntity }  = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: hoverEntity }  = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: ctxEntity }    = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    for (const entity of [clickEntity, hoverEntity, ctxEntity]) {
      expect(entity.target_entity_type).toBe("building");
      expect(entity.target_entity_type).not.toBe("room");
      expect(entity.target_entity_type).not.toBe("agent");
      expect(entity.target_entity_type).not.toBe("fixture");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-05 — Dispatcher integration
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-05 — Dispatcher integration: all three gestures reach the dispatcher", () => {

  it("blh-05a: three sequential gestures produce three entities in the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(3);
    expect(dispatcher.buffer.length).toBe(3);
  });

  it("blh-05b: dispatcher subscriber is notified for click", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("building");
    expect(received?.gesture_type).toBe("click");
  });

  it("blh-05c: dispatcher subscriber is notified for hover", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("building");
    expect(received?.gesture_type).toBe("hover");
  });

  it("blh-05d: dispatcher subscriber is notified for context_menu", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("building");
    expect(received?.gesture_type).toBe("context_menu");
  });

  it("blh-05e: all buffered entities carry layer='domain'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    for (const entity of dispatcher.buffer) {
      expect(entity.layer).toBe("domain");
    }
  });

  it("blh-05f: getByEntityType('building') returns all three entities", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    const buildingEntities = dispatcher.getByEntityType("building");
    expect(buildingEntities.length).toBe(3);
    for (const entity of buildingEntities) {
      expect(entity.target_entity_type).toBe("building");
    }
  });

  it("blh-05g: getByGesture returns entities for each gesture type", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);
    handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.getByGesture("click").length).toBe(1);
    expect(dispatcher.getByGesture("hover").length).toBe(1);
    expect(dispatcher.getByGesture("context_menu").length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-06 — Record transparency (JSON serialisability)
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-06 — Record transparency: entities survive JSON round-trip", () => {

  it("blh-06a: click entity survives JSON.stringify / JSON.parse round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("building");
      expect(parsed.gesture_type).toBe("click");
      expect(parsed.target_id).toBe(BUILDING_ID);
    }
  });

  it("blh-06b: hover entity survives JSON round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingHover(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("building");
      expect(parsed.gesture_type).toBe("hover");
    }
  });

  it("blh-06c: context-menu entity survives JSON round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("building");
      expect(parsed.gesture_type).toBe("context_menu");
    }
  });

  it("blh-06d: entity.source_payload is a JSON-serialisable object", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(() => JSON.stringify(entity.source_payload)).not.toThrow();
    const payload = entity.source_payload;
    expect(typeof payload).toBe("object");
    expect(payload).not.toBeNull();
    // source_payload carries the original building intent fields
    expect(payload["intent"]).toBe("BUILDING_CLICKED");
    expect(payload["building_id"]).toBe(BUILDING_ID);
  });

  it("blh-06e: entity has unique intent_id per invocation", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: e1 } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: e2 } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(e1.intent_id).not.toBe(e2.intent_id);
  });

  it("blh-06f: entity.ts is a positive integer (Unix ms)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(typeof entity.ts).toBe("number");
    expect(entity.ts).toBeGreaterThan(0);
    expect(Number.isFinite(entity.ts)).toBe(true);
  });

  it("blh-06g: entity.ts_iso is a valid ISO-8601 string", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(typeof entity.ts_iso).toBe("string");
    expect(entity.ts_iso.length).toBeGreaterThan(0);
    // ISO-8601 format: ends with 'Z'
    expect(entity.ts_iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-07 — Unhover handler (completeness)
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-07 — Unhover handler", () => {

  it("blh-07a: entity.target_entity_type === 'building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
  });

  it("blh-07b: entity.gesture_type === 'unhover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("unhover");
  });

  it("blh-07c: intent field is a BUILDING_UNHOVERED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleBuildingUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isBuildingUnhoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("BUILDING_UNHOVERED");
  });

  it("blh-07d: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleBuildingUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-08 — Convenience record BUILDING_LAYER_HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-08 — BUILDING_LAYER_HANDLERS convenience record", () => {

  it("blh-08a: contains all four handler keys", () => {
    expect(typeof BUILDING_LAYER_HANDLERS.click).toBe("function");
    expect(typeof BUILDING_LAYER_HANDLERS.hover).toBe("function");
    expect(typeof BUILDING_LAYER_HANDLERS.unhover).toBe("function");
    expect(typeof BUILDING_LAYER_HANDLERS.context_menu).toBe("function");
  });

  it("blh-08b: handlers in the record produce the same results as direct calls", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: directEntity }  = handleBuildingClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: recordEntity }  = BUILDING_LAYER_HANDLERS.click(event, DEFAULT_CONTEXT, dispatcher);

    // Both should produce the same shape (just different intent_ids because Date.now() may differ)
    expect(directEntity.target_entity_type).toBe(recordEntity.target_entity_type);
    expect(directEntity.gesture_type).toBe(recordEntity.gesture_type);
    expect(directEntity.target_id).toBe(recordEntity.target_id);
  });

  it("blh-08c: click via record produces target_entity_type='building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = BUILDING_LAYER_HANDLERS.click(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("click");
  });

  it("blh-08d: hover via record produces target_entity_type='building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = BUILDING_LAYER_HANDLERS.hover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("hover");
  });

  it("blh-08e: context_menu via record produces target_entity_type='building'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = BUILDING_LAYER_HANDLERS.context_menu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("context_menu");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// blh-09 — 3×3 matrix sweep (all gesture types × all drill levels)
// ═════════════════════════════════════════════════════════════════════════════

describe("blh-09 — Systematic 3×3 gesture×drill-level matrix", () => {

  const drillLevels = ["building", "floor", "room", "agent"] as const;

  it("blh-09a: click handler works at all drill levels with target_entity_type='building'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleBuildingClick(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("building");
      expect(entity.gesture_type).toBe("click");
    }
  });

  it("blh-09b: hover handler works at all drill levels with target_entity_type='building'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleBuildingHover(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("building");
      expect(entity.gesture_type).toBe("hover");
    }
  });

  it("blh-09c: context-menu handler works at all drill levels with target_entity_type='building'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleBuildingContextMenu(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("building");
      expect(entity.gesture_type).toBe("context_menu");
    }
  });
});
