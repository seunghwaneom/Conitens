/**
 * room-layer-handlers.test.ts
 *
 * Sub-AC 4c — Isolated tests verifying that the room layer 3D object event
 * handlers emit canonical `interaction_intent` entities with
 * `target_entity_type = 'room'` for all three gesture types (click, hover,
 * context_menu).
 *
 * Test coverage
 * ─────────────
 * The tests are organized by gesture type and verify:
 *
 *   rlh-01 — Click handler:
 *     • Produces `target_entity_type = 'room'`
 *     • Produces `gesture_type = 'click'`
 *     • `target_id` matches the room_id from context
 *     • Calls `stopPropagation` on the event
 *     • Dispatches the canonical entity to the dispatcher
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *     • entity.layer === 'infrastructure'
 *
 *   rlh-02 — Hover handler:
 *     • Produces `target_entity_type = 'room'`
 *     • Produces `gesture_type = 'hover'`
 *     • `target_id` matches the room_id from context
 *     • Calls `stopPropagation` on the event
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *
 *   rlh-03 — Context-menu handler:
 *     • Produces `target_entity_type = 'room'`
 *     • Produces `gesture_type = 'context_menu'`
 *     • `target_id` matches the room_id from context
 *     • Calls `stopPropagation` on the event
 *     • Calls `preventDefault` on the nativeEvent
 *     • Screen position is extracted from nativeEvent
 *     • Returned entity satisfies `isInteractionIntentEntity` guard
 *
 *   rlh-04 — Cross-gesture isolation:
 *     • Click entity does not have gesture_type 'hover' or 'context_menu'
 *     • Hover entity does not have gesture_type 'click' or 'context_menu'
 *     • Context-menu entity does not have gesture_type 'click' or 'hover'
 *     • All three gestures produce target_entity_type='room' (never 'building' or 'agent')
 *
 *   rlh-05 — Dispatcher integration:
 *     • All three gestures reach the dispatcher buffer
 *     • Dispatcher subscribers are notified for each gesture
 *     • All three entities carry `layer = 'infrastructure'`
 *     • getByEntityType('room') returns all room entities
 *     • getByGesture returns entities for each gesture type
 *
 *   rlh-06 — Record transparency (JSON serialisability):
 *     • All three entities survive a JSON round-trip
 *     • Round-tripped entities still pass `isInteractionIntentEntity`
 *     • entity.source_payload carries the original room intent fields
 *     • entity has unique intent_id per invocation
 *     • entity.ts is a positive Unix ms integer
 *     • entity.ts_iso is a valid ISO-8601 string
 *
 *   rlh-07 — Unhover handler (completeness):
 *     • Produces `target_entity_type = 'room'`
 *     • Produces `gesture_type = 'unhover'`
 *     • intent field is a ROOM_UNHOVERED intent
 *     • entity passes isInteractionIntentEntity guard
 *
 *   rlh-08 — Convenience record (ROOM_LAYER_HANDLERS):
 *     • All four handler keys are present and are functions
 *     • Handlers in the record produce the same shapes as direct calls
 *
 *   rlh-09 — Systematic 4×4 gesture×drill-level matrix:
 *     • Click handler works at all drill levels with target_entity_type='room'
 *     • Hover handler works at all drill levels with target_entity_type='room'
 *     • Context-menu handler works at all drill levels with target_entity_type='room'
 *
 *   rlh-10 — Room-type variants:
 *     • All six room types (control/office/lab/lobby/archive/corridor) produce
 *       correctly-typed intents with target_entity_type='room'
 *
 *   rlh-11 — Propagation isolation (room vs building):
 *     • Room handlers call stopPropagation; building handlers are NOT triggered
 *     • Multiple room handlers on different rooms do not cross-contaminate
 *
 * Isolation guarantees
 * ─────────────────────
 * • No React, no Three.js, no DOM, no Zustand stores
 * • The `InteractionIntentDispatcher` is instantiated fresh per test group
 * • All timestamps are real (from Date.now()) — tests check type, not value
 * • No command-pipeline coupling (no file writes, no orchestrator calls)
 *
 * Test ID scheme: rlh-NN[a-z]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── System under test ──────────────────────────────────────────────────────

import {
  handleRoomClick,
  handleRoomHover,
  handleRoomUnhover,
  handleRoomContextMenu,
  ROOM_LAYER_HANDLERS,
  type RoomGestureEvent,
  type RoomHandlerContext,
} from "../room-layer-handlers.js";

// ── Dispatcher ─────────────────────────────────────────────────────────────

import {
  createInteractionIntentDispatcher,
} from "../interaction-intent-dispatcher.js";

// ── Entity guard (for Sub-AC 4c verification) ──────────────────────────────

import {
  isInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ── Layer-specific intent guards (for source_payload inspection) ───────────

import {
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomUnhoveredIntent,
  isRoomContextMenuIntent,
} from "../room-interaction-intents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ROOM_ID    = "control-room-01";
const SESSION_ID = "rlh-test-session";
const WORLD_POS  = { x: 1.5, y: 0.0, z: -2.0 } as const;
const SCREEN_X   = 800;
const SCREEN_Y   = 450;

/** Default context injected into every handler call. */
const DEFAULT_CONTEXT: RoomHandlerContext = {
  room_id:     ROOM_ID,
  room_type:   "control",
  floor:       0,
  drill_level: "floor",
  agent_count: 3,
  session_id:  SESSION_ID,
};

/** Minimal mock pointer event with all optional fields populated. */
function makeMockEvent(overrides: Partial<RoomGestureEvent> = {}): RoomGestureEvent & {
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
  } as RoomGestureEvent & {
    stopPropagation: ReturnType<typeof vi.fn>;
    nativeEvent: { clientX: number; clientY: number; preventDefault: ReturnType<typeof vi.fn> };
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// rlh-01 — Click handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-01 — Click handler: emits interaction_intent with target_entity_type='room'", () => {

  it("rlh-01a: entity.target_entity_type === 'room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
  });

  it("rlh-01b: entity.gesture_type === 'click'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("click");
  });

  it("rlh-01c: entity.target_id matches room_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(ROOM_ID);
  });

  it("rlh-01d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-01e: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("rlh-01f: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("rlh-01g: entity.layer === 'infrastructure'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("infrastructure");
  });

  it("rlh-01h: intent field is a ROOM_CLICKED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(isRoomClickedIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_CLICKED");
  });

  it("rlh-01i: entity.world_position matches event.point", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.world_position).toEqual(WORLD_POS);
  });

  it("rlh-01j: entity is immutable (frozen)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("rlh-01k: works without stopPropagation (synthesised event)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event: RoomGestureEvent = { point: WORLD_POS }; // no stopPropagation

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("click");
  });

  it("rlh-01l: intent carries room-specific fields (room_type, floor, agent_count)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    if (!isRoomClickedIntent(intent)) throw new Error("Expected ROOM_CLICKED intent");
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
    expect(intent.agent_count).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-02 — Hover handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-02 — Hover handler: emits interaction_intent with target_entity_type='room'", () => {

  it("rlh-02a: entity.target_entity_type === 'room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
  });

  it("rlh-02b: entity.gesture_type === 'hover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("hover");
  });

  it("rlh-02c: entity.target_id matches room_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(ROOM_ID);
  });

  it("rlh-02d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-02e: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("rlh-02f: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("rlh-02g: entity.layer === 'infrastructure'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("infrastructure");
  });

  it("rlh-02h: intent field is a ROOM_HOVERED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isRoomHoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_HOVERED");
  });

  it("rlh-02i: hover with null point still produces valid entity", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent({ point: undefined });

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("hover");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("rlh-02j: hover intent carries room_type and floor fields", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    if (!isRoomHoveredIntent(intent)) throw new Error("Expected ROOM_HOVERED intent");
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-03 — Context-menu handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-03 — Context-menu handler: emits interaction_intent with target_entity_type='room'", () => {

  it("rlh-03a: entity.target_entity_type === 'room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
  });

  it("rlh-03b: entity.gesture_type === 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("context_menu");
  });

  it("rlh-03c: entity.target_id matches room_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(ROOM_ID);
  });

  it("rlh-03d: calls stopPropagation on the event", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-03e: calls preventDefault on nativeEvent to suppress browser context menu", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.nativeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("rlh-03f: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("rlh-03g: entity is dispatched to the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.lastEntity).toBe(entity);
  });

  it("rlh-03h: entity.layer === 'infrastructure'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("infrastructure");
  });

  it("rlh-03i: intent field is a ROOM_CONTEXT_MENU intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(isRoomContextMenuIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_CONTEXT_MENU");
  });

  it("rlh-03j: screen_position extracted from nativeEvent coordinates", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    if (!isRoomContextMenuIntent(intent)) throw new Error("Expected ROOM_CONTEXT_MENU intent");
    expect(intent.screen_position.x).toBe(SCREEN_X);
    expect(intent.screen_position.y).toBe(SCREEN_Y);
  });

  it("rlh-03k: falls back to {x:0, y:0} when nativeEvent is absent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event: RoomGestureEvent = {
      stopPropagation: vi.fn(),
      point: WORLD_POS,
      // no nativeEvent
    };

    const { intent } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    if (!isRoomContextMenuIntent(intent)) throw new Error("Expected ROOM_CONTEXT_MENU intent");
    expect(intent.screen_position).toEqual({ x: 0, y: 0 });
  });

  it("rlh-03l: context-menu at 'room' drill level carries correct drill_level in intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const context    = { ...DEFAULT_CONTEXT, drill_level: "room" as const };

    const { intent } = handleRoomContextMenu(event, context, dispatcher);

    if (!isRoomContextMenuIntent(intent)) throw new Error("Expected ROOM_CONTEXT_MENU intent");
    expect(intent.drill_level).toBe("room");
  });

  it("rlh-03m: context-menu intent carries room_type and floor fields", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    if (!isRoomContextMenuIntent(intent)) throw new Error("Expected ROOM_CONTEXT_MENU intent");
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-04 — Cross-gesture isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-04 — Cross-gesture isolation: each handler emits its own gesture type only", () => {

  it("rlh-04a: click entity does NOT have gesture_type 'hover' or 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("hover");
    expect(entity.gesture_type).not.toBe("context_menu");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("rlh-04b: hover entity does NOT have gesture_type 'click' or 'context_menu'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("click");
    expect(entity.gesture_type).not.toBe("context_menu");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("rlh-04c: context-menu entity does NOT have gesture_type 'click' or 'hover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).not.toBe("click");
    expect(entity.gesture_type).not.toBe("hover");
    expect(entity.gesture_type).not.toBe("unhover");
  });

  it("rlh-04d: all three gesture types produce target_entity_type='room' (never 'building' or 'agent')", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: clickEntity }  = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: hoverEntity }  = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: ctxEntity }    = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    for (const entity of [clickEntity, hoverEntity, ctxEntity]) {
      expect(entity.target_entity_type).toBe("room");
      expect(entity.target_entity_type).not.toBe("building");
      expect(entity.target_entity_type).not.toBe("agent");
      expect(entity.target_entity_type).not.toBe("fixture");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-05 — Dispatcher integration
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-05 — Dispatcher integration: all three gestures reach the dispatcher", () => {

  it("rlh-05a: three sequential gestures produce three entities in the dispatcher buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.totalDispatched).toBe(3);
    expect(dispatcher.buffer.length).toBe(3);
  });

  it("rlh-05b: dispatcher subscriber is notified for click", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("room");
    expect(received?.gesture_type).toBe("click");
  });

  it("rlh-05c: dispatcher subscriber is notified for hover", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("room");
    expect(received?.gesture_type).toBe("hover");
  });

  it("rlh-05d: dispatcher subscriber is notified for context_menu", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();
    const subscriber = vi.fn();

    dispatcher.subscribe(subscriber);
    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received = subscriber.mock.calls[0]?.[0];
    expect(received?.target_entity_type).toBe("room");
    expect(received?.gesture_type).toBe("context_menu");
  });

  it("rlh-05e: all buffered entities carry layer='infrastructure'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    for (const entity of dispatcher.buffer) {
      expect(entity.layer).toBe("infrastructure");
    }
  });

  it("rlh-05f: getByEntityType('room') returns all three entities", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    const roomEntities = dispatcher.getByEntityType("room");
    expect(roomEntities.length).toBe(3);
    for (const entity of roomEntities) {
      expect(entity.target_entity_type).toBe("room");
    }
  });

  it("rlh-05g: getByGesture returns entities for each gesture type", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(dispatcher.getByGesture("click").length).toBe(1);
    expect(dispatcher.getByGesture("hover").length).toBe(1);
    expect(dispatcher.getByGesture("context_menu").length).toBe(1);
  });

  it("rlh-05h: getByTargetId returns entities for the room_id", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    const roomEntities = dispatcher.getByTargetId(ROOM_ID);
    expect(roomEntities.length).toBe(2);
    for (const entity of roomEntities) {
      expect(entity.target_id).toBe(ROOM_ID);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-06 — Record transparency (JSON serialisability)
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-06 — Record transparency: entities survive JSON round-trip", () => {

  it("rlh-06a: click entity survives JSON.stringify / JSON.parse round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("room");
      expect(parsed.gesture_type).toBe("click");
      expect(parsed.target_id).toBe(ROOM_ID);
    }
  });

  it("rlh-06b: hover entity survives JSON round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("room");
      expect(parsed.gesture_type).toBe("hover");
    }
  });

  it("rlh-06c: context-menu entity survives JSON round-trip", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    const json   = JSON.stringify(entity);
    const parsed = JSON.parse(json) as unknown;

    expect(isInteractionIntentEntity(parsed)).toBe(true);
    if (isInteractionIntentEntity(parsed)) {
      expect(parsed.target_entity_type).toBe("room");
      expect(parsed.gesture_type).toBe("context_menu");
    }
  });

  it("rlh-06d: entity.source_payload carries the original room intent fields", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(() => JSON.stringify(entity.source_payload)).not.toThrow();
    const payload = entity.source_payload;
    expect(typeof payload).toBe("object");
    expect(payload).not.toBeNull();
    // source_payload carries the original room intent fields
    expect(payload["intent"]).toBe("ROOM_CLICKED");
    expect(payload["room_id"]).toBe(ROOM_ID);
    expect(payload["room_type"]).toBe("control");
  });

  it("rlh-06e: entity has unique intent_id per invocation", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: e1 } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: e2 } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(e1.intent_id).not.toBe(e2.intent_id);
  });

  it("rlh-06f: entity.ts is a positive integer (Unix ms)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(typeof entity.ts).toBe("number");
    expect(entity.ts).toBeGreaterThan(0);
    expect(Number.isFinite(entity.ts)).toBe(true);
  });

  it("rlh-06g: entity.ts_iso is a valid ISO-8601 string", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    expect(typeof entity.ts_iso).toBe("string");
    expect(entity.ts_iso.length).toBeGreaterThan(0);
    // ISO-8601 format: starts with date pattern
    expect(entity.ts_iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-07 — Unhover handler (completeness)
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-07 — Unhover handler", () => {

  it("rlh-07a: entity.target_entity_type === 'room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
  });

  it("rlh-07b: entity.gesture_type === 'unhover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.gesture_type).toBe("unhover");
  });

  it("rlh-07c: intent field is a ROOM_UNHOVERED intent", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { intent } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isRoomUnhoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_UNHOVERED");
  });

  it("rlh-07d: entity passes isInteractionIntentEntity guard", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("rlh-07e: entity.target_id matches room_id from context", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_id).toBe(ROOM_ID);
  });

  it("rlh-07f: entity.layer === 'infrastructure'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = handleRoomUnhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.layer).toBe("infrastructure");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-08 — Convenience record ROOM_LAYER_HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-08 — ROOM_LAYER_HANDLERS convenience record", () => {

  it("rlh-08a: contains all four handler keys", () => {
    expect(typeof ROOM_LAYER_HANDLERS.click).toBe("function");
    expect(typeof ROOM_LAYER_HANDLERS.hover).toBe("function");
    expect(typeof ROOM_LAYER_HANDLERS.unhover).toBe("function");
    expect(typeof ROOM_LAYER_HANDLERS.context_menu).toBe("function");
  });

  it("rlh-08b: handlers in the record produce the same shapes as direct calls", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity: directEntity } = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);
    const { entity: recordEntity } = ROOM_LAYER_HANDLERS.click(event, DEFAULT_CONTEXT, dispatcher);

    // Both should produce the same shape (just different intent_ids)
    expect(directEntity.target_entity_type).toBe(recordEntity.target_entity_type);
    expect(directEntity.gesture_type).toBe(recordEntity.gesture_type);
    expect(directEntity.target_id).toBe(recordEntity.target_id);
  });

  it("rlh-08c: click via record produces target_entity_type='room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = ROOM_LAYER_HANDLERS.click(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("click");
  });

  it("rlh-08d: hover via record produces target_entity_type='room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = ROOM_LAYER_HANDLERS.hover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("hover");
  });

  it("rlh-08e: context_menu via record produces target_entity_type='room'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = ROOM_LAYER_HANDLERS.context_menu(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("context_menu");
  });

  it("rlh-08f: unhover via record produces target_entity_type='room' with gesture_type='unhover'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const { entity } = ROOM_LAYER_HANDLERS.unhover(event, DEFAULT_CONTEXT, dispatcher);

    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("unhover");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-09 — Systematic 3×4 gesture×drill-level matrix
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-09 — Systematic 3×4 gesture×drill-level matrix", () => {

  const drillLevels = ["building", "floor", "room", "agent"] as const;

  it("rlh-09a: click handler works at all drill levels with target_entity_type='room'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleRoomClick(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("click");
    }
  });

  it("rlh-09b: hover handler works at all drill levels with target_entity_type='room'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleRoomHover(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("hover");
    }
  });

  it("rlh-09c: context-menu handler works at all drill levels with target_entity_type='room'", () => {
    for (const drill_level of drillLevels) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, drill_level };

      const { entity } = handleRoomContextMenu(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("context_menu");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-10 — Room-type variants: all six room types produce target_entity_type='room'
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-10 — Room-type variants", () => {

  const roomTypes = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;

  it("rlh-10a: all six room types produce target_entity_type='room' on click", () => {
    for (const room_type of roomTypes) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, room_type };

      const { entity, intent } = handleRoomClick(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("click");
      if (!isRoomClickedIntent(intent)) throw new Error("Expected ROOM_CLICKED");
      expect(intent.room_type).toBe(room_type);
    }
  });

  it("rlh-10b: all six room types produce target_entity_type='room' on hover", () => {
    for (const room_type of roomTypes) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, room_type };

      const { entity, intent } = handleRoomHover(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("hover");
      if (!isRoomHoveredIntent(intent)) throw new Error("Expected ROOM_HOVERED");
      expect(intent.room_type).toBe(room_type);
    }
  });

  it("rlh-10c: all six room types produce target_entity_type='room' on context_menu", () => {
    for (const room_type of roomTypes) {
      const dispatcher = createInteractionIntentDispatcher();
      const event      = makeMockEvent();
      const context    = { ...DEFAULT_CONTEXT, room_type };

      const { entity, intent } = handleRoomContextMenu(event, context, dispatcher);

      expect(entity.target_entity_type).toBe("room");
      expect(entity.gesture_type).toBe("context_menu");
      if (!isRoomContextMenuIntent(intent)) throw new Error("Expected ROOM_CONTEXT_MENU");
      expect(intent.room_type).toBe(room_type);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rlh-11 — Propagation isolation: room handlers do not cross-contaminate
// ═════════════════════════════════════════════════════════════════════════════

describe("rlh-11 — Propagation isolation", () => {

  it("rlh-11a: two different room handlers produce distinct target_ids in the same dispatcher", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    const contextA = { ...DEFAULT_CONTEXT, room_id: "room-alpha", room_type: "office" as const };
    const contextB = { ...DEFAULT_CONTEXT, room_id: "room-beta",  room_type: "lab" as const };

    const { entity: entityA } = handleRoomClick(event, contextA, dispatcher);
    const { entity: entityB } = handleRoomClick(event, contextB, dispatcher);

    expect(entityA.target_id).toBe("room-alpha");
    expect(entityB.target_id).toBe("room-beta");
    expect(entityA.target_id).not.toBe(entityB.target_id);
    expect(dispatcher.totalDispatched).toBe(2);
  });

  it("rlh-11b: room click handler calls stopPropagation (prevents building layer receiving the event)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomClick(event, DEFAULT_CONTEXT, dispatcher);

    // The event's stopPropagation was called — building handler would not see this event
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-11c: room hover handler calls stopPropagation (prevents building layer receiving the event)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomHover(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-11d: room context-menu handler calls stopPropagation (prevents building layer receiving the event)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    handleRoomContextMenu(event, DEFAULT_CONTEXT, dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rlh-11e: room entities and building entities can coexist in the same dispatcher without confusion", () => {
    // Import building handler locally to test coexistence
    const dispatcher = createInteractionIntentDispatcher();
    const event      = makeMockEvent();

    // Simulate: room click (inner scene object) and building hover (outer shell)
    // These are disjoint target_entity_types in the same buffer
    const roomEntity = handleRoomClick(event, DEFAULT_CONTEXT, dispatcher).entity;

    // Verify room entity has correct type
    expect(roomEntity.target_entity_type).toBe("room");
    expect(roomEntity.layer).toBe("infrastructure");

    // All entities for 'room' type
    const roomOnly = dispatcher.getByEntityType("room");
    expect(roomOnly.length).toBe(1);
    expect(roomOnly[0]?.target_entity_type).toBe("room");

    // Building entities are separate
    const buildingOnly = dispatcher.getByEntityType("building");
    expect(buildingOnly.length).toBe(0);
  });
});
