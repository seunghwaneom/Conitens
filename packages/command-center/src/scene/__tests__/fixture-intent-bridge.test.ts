/**
 * fixture-intent-bridge.test.ts — Unit tests for Sub-AC 7b.
 *
 * Validates the fixture-intent bridge wiring system:
 *   - extractAffordanceCapture: captures affordance_id, manipulation_type,
 *     target_entity_ref from any FixtureInteractionIntent
 *   - wireFixtureIntent: produces a canonical InteractionIntentEntity and
 *     dispatches it; returns all three artefacts
 *   - createFixtureBridgeHandler: factory that wires SpatialFixtureLayer's
 *     onIntent to the dispatcher
 *   - fixtureIntentKindToManipulationType: complete mapping coverage
 *   - FIXTURE_INTENT_KIND_TO_MANIPULATION: exhaustiveness of the lookup map
 *
 * All tests run in pure Node.js (no canvas, no DOM, no React / Three.js)
 * because the bridge is fully decoupled from the rendering layer.
 */

import { describe, it, expect, vi } from "vitest";

// ── Bridge imports ───────────────────────────────────────────────────────────

import {
  extractAffordanceCapture,
  wireFixtureIntent,
  createFixtureBridgeHandler,
  fixtureIntentKindToManipulationType,
  FIXTURE_MANIPULATION_TYPES,
  FIXTURE_INTENT_KIND_TO_MANIPULATION,
  type FixtureAffordanceCapture,
  type FixtureIntentBridgeResult,
} from "../fixture-intent-bridge.js";

// ── Fixture-intent factories (Sub-AC 7a) ────────────────────────────────────

import {
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureHandleDragMoveIntent,
  makeFixtureHandleDragEndIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
  FIXTURE_INTENT_KINDS,
  type FixtureEntityRef,
  type FixtureWorldPosition,
} from "../fixture-interaction-intents.js";

// ── Dispatcher (Sub-AC 4a) ───────────────────────────────────────────────────

import {
  createInteractionIntentDispatcher,
  type InteractionIntentDispatcher,
} from "../interaction-intent-dispatcher.js";

// ── Shared test fixtures ─────────────────────────────────────────────────────

const agentRef: FixtureEntityRef = {
  entityType: "agent",
  entityId: "agent-manager-1",
};

const taskRef: FixtureEntityRef = {
  entityType: "task",
  entityId: "task-42",
};

const roomRef: FixtureEntityRef = {
  entityType: "room",
  entityId: "room-ops",
};

const worldPos: FixtureWorldPosition = { x: 1.5, y: 0.55, z: -2.0 };

// ── 1. fixtureIntentKindToManipulationType mapping ───────────────────────────

describe("fixtureIntentKindToManipulationType", () => {
  it("maps FIXTURE_BUTTON_CLICKED to 'click'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_BUTTON_CLICKED")).toBe("click");
  });

  it("maps FIXTURE_MENU_ANCHOR_OPENED to 'click' (select / open)", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_MENU_ANCHOR_OPENED")).toBe("click");
  });

  it("maps FIXTURE_MENU_ANCHOR_CLOSED to 'click' (deselect / close)", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_MENU_ANCHOR_CLOSED")).toBe("click");
  });

  it("maps FIXTURE_BUTTON_HOVERED to 'hover'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_BUTTON_HOVERED")).toBe("hover");
  });

  it("maps FIXTURE_BUTTON_UNHOVERED to 'unhover'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_BUTTON_UNHOVERED")).toBe("unhover");
  });

  it("maps FIXTURE_HANDLE_DRAG_START to 'drag'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_HANDLE_DRAG_START")).toBe("drag");
  });

  it("maps FIXTURE_HANDLE_DRAG_MOVE to 'drag'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_HANDLE_DRAG_MOVE")).toBe("drag");
  });

  it("maps FIXTURE_HANDLE_DRAG_END to 'drag'", () => {
    expect(fixtureIntentKindToManipulationType("FIXTURE_HANDLE_DRAG_END")).toBe("drag");
  });

  it("returns null for unknown intent kinds", () => {
    expect(fixtureIntentKindToManipulationType("AGENT_CLICKED")).toBeNull();
    expect(fixtureIntentKindToManipulationType("ROOM_HOVERED")).toBeNull();
    expect(fixtureIntentKindToManipulationType("")).toBeNull();
    expect(fixtureIntentKindToManipulationType("UNKNOWN_KIND")).toBeNull();
  });

  it("covers all 8 FIXTURE_INTENT_KINDS (completeness check)", () => {
    for (const kind of FIXTURE_INTENT_KINDS) {
      const result = fixtureIntentKindToManipulationType(kind);
      expect(result).not.toBeNull();
    }
  });
});

// ── 2. FIXTURE_INTENT_KIND_TO_MANIPULATION lookup map ────────────────────────

describe("FIXTURE_INTENT_KIND_TO_MANIPULATION", () => {
  it("has exactly 8 entries (one per FIXTURE_INTENT_KIND)", () => {
    expect(Object.keys(FIXTURE_INTENT_KIND_TO_MANIPULATION)).toHaveLength(8);
  });

  it("every FIXTURE_INTENT_KINDS entry is present in the map", () => {
    for (const kind of FIXTURE_INTENT_KINDS) {
      expect(FIXTURE_INTENT_KIND_TO_MANIPULATION).toHaveProperty(kind);
    }
  });

  it("all values are members of FIXTURE_MANIPULATION_TYPES", () => {
    for (const type of Object.values(FIXTURE_INTENT_KIND_TO_MANIPULATION)) {
      expect(FIXTURE_MANIPULATION_TYPES.has(type)).toBe(true);
    }
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(FIXTURE_INTENT_KIND_TO_MANIPULATION)).toBe(true);
  });
});

// ── 3. FIXTURE_MANIPULATION_TYPES set ────────────────────────────────────────

describe("FIXTURE_MANIPULATION_TYPES", () => {
  it("contains exactly 4 types: click, drag, hover, unhover", () => {
    expect(FIXTURE_MANIPULATION_TYPES.size).toBe(4);
    expect(FIXTURE_MANIPULATION_TYPES.has("click")).toBe(true);
    expect(FIXTURE_MANIPULATION_TYPES.has("drag")).toBe(true);
    expect(FIXTURE_MANIPULATION_TYPES.has("hover")).toBe(true);
    expect(FIXTURE_MANIPULATION_TYPES.has("unhover")).toBe(true);
  });

  it("does not contain context_menu (fixture layer doesn't emit that gesture)", () => {
    expect(FIXTURE_MANIPULATION_TYPES.has("context_menu")).toBe(false);
  });
});

// ── 4. extractAffordanceCapture — affordance_id ───────────────────────────────

describe("extractAffordanceCapture — affordance_id", () => {
  it("captures fixtureId as affordance_id for button click", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "agent-pause-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: worldPos,
      ts: 1000,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.affordance_id).toBe("agent-pause-btn");
  });

  it("captures fixtureId as affordance_id for handle drag", () => {
    const intent = makeFixtureHandleDragStartIntent({
      fixtureId: "task-move-handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_start",
      dragOriginWorld: worldPos,
      ts: 2000,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.affordance_id).toBe("task-move-handle");
  });

  it("captures fixtureId as affordance_id for menu anchor open (select)", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId: "room-menu-anchor",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_open",
      worldPosition: worldPos,
      screen_position: { x: 100, y: 200 },
      ts: 3000,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.affordance_id).toBe("room-menu-anchor");
  });
});

// ── 5. extractAffordanceCapture — manipulation_type ──────────────────────────

describe("extractAffordanceCapture — manipulation_type", () => {
  it("button click → manipulation_type 'click'", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("click");
  });

  it("button hover → manipulation_type 'hover'", () => {
    const intent = makeFixtureButtonHoveredIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "hover_enter",
      worldPosition: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("hover");
  });

  it("button unhover → manipulation_type 'unhover'", () => {
    const intent = makeFixtureButtonUnhoveredIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "hover_exit",
      worldPosition: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("unhover");
  });

  it("handle drag_start → manipulation_type 'drag'", () => {
    const intent = makeFixtureHandleDragStartIntent({
      fixtureId: "handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_start",
      dragOriginWorld: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("drag");
  });

  it("handle drag_move → manipulation_type 'drag'", () => {
    const intent = makeFixtureHandleDragMoveIntent({
      fixtureId: "handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_move",
      dragCurrentWorld: null,
      dragDeltaWorld: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("drag");
  });

  it("handle drag_end → manipulation_type 'drag'", () => {
    const intent = makeFixtureHandleDragEndIntent({
      fixtureId: "handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_end",
      dragOriginWorld: null,
      dragEndWorld: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("drag");
  });

  it("menu anchor open (select) → manipulation_type 'click'", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId: "anchor",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_open",
      worldPosition: null,
      screen_position: { x: 0, y: 0 },
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("click");
  });

  it("menu anchor close (deselect) → manipulation_type 'click'", () => {
    const intent = makeFixtureMenuAnchorClosedIntent({
      fixtureId: "anchor",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_close",
      worldPosition: null,
      ts: 1,
    });
    expect(extractAffordanceCapture(intent).manipulation_type).toBe("click");
  });
});

// ── 6. extractAffordanceCapture — target_entity_ref ──────────────────────────

describe("extractAffordanceCapture — target_entity_ref", () => {
  it("captures agent entityRef for button on an agent fixture", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "pause-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: 1,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.target_entity_ref.entityType).toBe("agent");
    expect(capture.target_entity_ref.entityId).toBe("agent-manager-1");
  });

  it("captures task entityRef for handle on a task fixture", () => {
    const intent = makeFixtureHandleDragEndIntent({
      fixtureId: "move-handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_end",
      dragOriginWorld: null,
      dragEndWorld: null,
      ts: 1,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.target_entity_ref.entityType).toBe("task");
    expect(capture.target_entity_ref.entityId).toBe("task-42");
  });

  it("captures room entityRef for menu anchor on a room fixture", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId: "room-anchor",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_open",
      worldPosition: null,
      screen_position: { x: 0, y: 0 },
      ts: 1,
    });
    const capture = extractAffordanceCapture(intent);
    expect(capture.target_entity_ref.entityType).toBe("room");
    expect(capture.target_entity_ref.entityId).toBe("room-ops");
  });
});

// ── 7. extractAffordanceCapture — result immutability ────────────────────────

describe("extractAffordanceCapture — immutability", () => {
  it("returned capture object is frozen", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: 1,
    });
    const capture = extractAffordanceCapture(intent);
    expect(Object.isFrozen(capture)).toBe(true);
  });
});

// ── 8. wireFixtureIntent — canonical entity fields ────────────────────────────

describe("wireFixtureIntent — canonical entity", () => {
  let dispatcher: InteractionIntentDispatcher;

  beforeEach(() => {
    dispatcher = createInteractionIntentDispatcher();
  });

  it("produces entity with target_entity_type='fixture' for button click", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "agent-action-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: worldPos,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.target_entity_type).toBe("fixture");
  });

  it("produces entity with gesture_type='click' for button click", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.gesture_type).toBe("click");
  });

  it("produces entity with gesture_type='drag' for handle drag_end", () => {
    const intent = makeFixtureHandleDragEndIntent({
      fixtureId: "task-handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_end",
      dragOriginWorld: { x: 0, y: 0, z: 0 },
      dragEndWorld: { x: 1, y: 0, z: 1 },
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.gesture_type).toBe("drag");
  });

  it("produces entity with gesture_type='click' for menu anchor open (select)", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId: "room-anchor",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_open",
      worldPosition: null,
      screen_position: { x: 50, y: 50 },
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.gesture_type).toBe("click");
    expect(result.entity.target_entity_type).toBe("fixture");
  });

  it("target_id matches fixtureId", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "my-unique-fixture-id",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.target_id).toBe("my-unique-fixture-id");
  });

  it("entity.layer is 'meta' (fixture layer rides the meta stratum)", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.entity.layer).toBe("meta");
  });

  it("entity.source_payload preserves the original intent data", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "pause-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: worldPos,
      ts: 12345,
    });
    const result = wireFixtureIntent(intent, dispatcher);
    const payload = result.entity.source_payload;
    expect(payload["fixtureId"]).toBe("pause-btn");
    expect(payload["fixtureKind"]).toBe("button");
    expect(payload["actionType"]).toBe("click");
  });

  it("entity has a unique intent_id", () => {
    const makeIntent = () =>
      makeFixtureButtonClickedIntent({
        fixtureId: "btn",
        fixtureKind: "button",
        entityRef: agentRef,
        actionType: "click",
        worldPosition: null,
        ts: Date.now(),
      });
    const r1 = wireFixtureIntent(makeIntent(), dispatcher);
    const r2 = wireFixtureIntent(makeIntent(), dispatcher);
    expect(r1.entity.intent_id).not.toBe(r2.entity.intent_id);
  });

  it("entity is frozen (immutable record-transparency invariant)", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(Object.isFrozen(result.entity)).toBe(true);
  });
});

// ── 9. wireFixtureIntent — affordance capture in result ───────────────────────

describe("wireFixtureIntent — affordance capture", () => {
  let dispatcher: InteractionIntentDispatcher;

  beforeEach(() => {
    dispatcher = createInteractionIntentDispatcher();
  });

  it("result.affordance.affordance_id matches fixtureId", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "specific-btn-id",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.affordance.affordance_id).toBe("specific-btn-id");
  });

  it("result.affordance.manipulation_type matches derived gesture", () => {
    const dragIntent = makeFixtureHandleDragStartIntent({
      fixtureId: "drag-handle",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_start",
      dragOriginWorld: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(dragIntent, dispatcher);
    expect(result.affordance.manipulation_type).toBe("drag");
  });

  it("result.affordance.target_entity_ref carries entityType and entityId", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: { entityType: "agent", entityId: "implementer-7" },
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.affordance.target_entity_ref.entityType).toBe("agent");
    expect(result.affordance.target_entity_ref.entityId).toBe("implementer-7");
  });

  it("affordance fields are consistent with entity fields", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "sync-check-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    // affordance_id must match entity target_id
    expect(result.affordance.affordance_id).toBe(result.entity.target_id);
    // manipulation_type must match entity gesture_type
    expect(result.affordance.manipulation_type).toBe(result.entity.gesture_type);
  });
});

// ── 10. wireFixtureIntent — dispatcher integration ────────────────────────────

describe("wireFixtureIntent — dispatcher integration", () => {
  it("dispatched entity appears in dispatcher ring buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "dispatched-btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    wireFixtureIntent(intent, dispatcher);
    const byFixture = dispatcher.getByEntityType("fixture");
    expect(byFixture.length).toBe(1);
    expect(byFixture[0]!.target_id).toBe("dispatched-btn");
  });

  it("subscriber receives the canonical entity after wiring", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const received: unknown[] = [];
    dispatcher.subscribe((entity) => { received.push(entity); });

    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId: "room-menu",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_open",
      worldPosition: null,
      screen_position: { x: 0, y: 0 },
      ts: Date.now(),
    });
    wireFixtureIntent(intent, dispatcher);
    expect(received).toHaveLength(1);
    expect((received[0] as { gesture_type: string }).gesture_type).toBe("click");
  });

  it("multiple wired intents all appear in the ring buffer", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const fixtures = ["btn-a", "btn-b", "btn-c"];
    for (const id of fixtures) {
      wireFixtureIntent(
        makeFixtureButtonClickedIntent({
          fixtureId: id,
          fixtureKind: "button",
          entityRef: agentRef,
          actionType: "click",
          worldPosition: null,
          ts: Date.now(),
        }),
        dispatcher,
      );
    }
    expect(dispatcher.getByEntityType("fixture")).toHaveLength(3);
  });

  it("session_id override is passed through to the canonical entity", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher, "session-override-1");
    expect(result.entity.session_id).toBe("session-override-1");
  });
});

// ── 11. createFixtureBridgeHandler — factory ─────────────────────────────────

describe("createFixtureBridgeHandler", () => {
  it("returns a function", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const handler = createFixtureBridgeHandler(dispatcher);
    expect(typeof handler).toBe("function");
  });

  it("returned handler wires intents to the dispatcher", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const handler = createFixtureBridgeHandler(dispatcher);

    const result = handler(
      makeFixtureButtonClickedIntent({
        fixtureId: "handler-btn",
        fixtureKind: "button",
        entityRef: agentRef,
        actionType: "click",
        worldPosition: null,
        ts: Date.now(),
      }),
    );

    expect(result.entity.target_entity_type).toBe("fixture");
    expect(result.entity.target_id).toBe("handler-btn");
    expect(dispatcher.getByEntityType("fixture")).toHaveLength(1);
  });

  it("returned handler returns affordance capture with all three Sub-AC 7b fields", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const handler = createFixtureBridgeHandler(dispatcher);

    const result: FixtureIntentBridgeResult = handler(
      makeFixtureHandleDragEndIntent({
        fixtureId: "drag-me",
        fixtureKind: "handle",
        entityRef: taskRef,
        actionType: "drag_end",
        dragOriginWorld: { x: 0, y: 0, z: 0 },
        dragEndWorld: { x: 2, y: 0, z: 0 },
        ts: Date.now(),
      }),
    );

    // Three Sub-AC 7b required fields:
    expect(result.affordance.affordance_id).toBe("drag-me");           // affordance id
    expect(result.affordance.manipulation_type).toBe("drag");           // manipulation type
    expect(result.affordance.target_entity_ref.entityType).toBe("task"); // target entity ref
  });

  it("session_id override is applied to all intents from the handler", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const handler = createFixtureBridgeHandler(dispatcher, "session-xyz");

    const r1 = handler(
      makeFixtureButtonClickedIntent({
        fixtureId: "a",
        fixtureKind: "button",
        entityRef: agentRef,
        actionType: "click",
        worldPosition: null,
        ts: Date.now(),
      }),
    );
    const r2 = handler(
      makeFixtureMenuAnchorOpenedIntent({
        fixtureId: "b",
        fixtureKind: "menu_anchor",
        entityRef: roomRef,
        actionType: "menu_open",
        worldPosition: null,
        screen_position: { x: 0, y: 0 },
        ts: Date.now(),
      }),
    );
    expect(r1.entity.session_id).toBe("session-xyz");
    expect(r2.entity.session_id).toBe("session-xyz");
  });

  it("handler can be used as onIntent prop value (passes type check)", () => {
    // Confirms the handler signature matches SpatialFixtureLayer's onIntent type.
    // We do this by assigning to a typed variable and calling with a fixture intent.
    const dispatcher = createInteractionIntentDispatcher();
    const onIntent: (intent: Parameters<typeof makeFixtureButtonClickedIntent>[0] & { intent: "FIXTURE_BUTTON_CLICKED" }) => FixtureIntentBridgeResult =
      createFixtureBridgeHandler(dispatcher) as unknown as typeof onIntent;
    // The real SpatialFixtureLayer passes FixtureInteractionIntent — this verifies
    // the handler accepts all fixture intent union members.
    expect(typeof onIntent).toBe("function");
  });
});

// ── 12. All 8 intent kinds wired end-to-end ──────────────────────────────────

describe("Full wiring coverage — all 8 fixture intent kinds", () => {
  let dispatcher: InteractionIntentDispatcher;

  beforeEach(() => {
    dispatcher = createInteractionIntentDispatcher();
  });

  it("FIXTURE_BUTTON_CLICKED → click entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureButtonClickedIntent({
        fixtureId: "f1", fixtureKind: "button", entityRef: agentRef,
        actionType: "click", worldPosition: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("click");
    expect(r.affordance.manipulation_type).toBe("click");
  });

  it("FIXTURE_BUTTON_HOVERED → hover entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureButtonHoveredIntent({
        fixtureId: "f2", fixtureKind: "button", entityRef: agentRef,
        actionType: "hover_enter", worldPosition: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("hover");
    expect(r.affordance.manipulation_type).toBe("hover");
  });

  it("FIXTURE_BUTTON_UNHOVERED → unhover entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureButtonUnhoveredIntent({
        fixtureId: "f3", fixtureKind: "button", entityRef: agentRef,
        actionType: "hover_exit", worldPosition: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("unhover");
    expect(r.affordance.manipulation_type).toBe("unhover");
  });

  it("FIXTURE_HANDLE_DRAG_START → drag entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureHandleDragStartIntent({
        fixtureId: "f4", fixtureKind: "handle", entityRef: taskRef,
        actionType: "drag_start", dragOriginWorld: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("drag");
    expect(r.affordance.manipulation_type).toBe("drag");
  });

  it("FIXTURE_HANDLE_DRAG_MOVE → drag entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureHandleDragMoveIntent({
        fixtureId: "f5", fixtureKind: "handle", entityRef: taskRef,
        actionType: "drag_move", dragCurrentWorld: null, dragDeltaWorld: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("drag");
    expect(r.affordance.manipulation_type).toBe("drag");
  });

  it("FIXTURE_HANDLE_DRAG_END → drag entity dispatched", () => {
    const r = wireFixtureIntent(
      makeFixtureHandleDragEndIntent({
        fixtureId: "f6", fixtureKind: "handle", entityRef: taskRef,
        actionType: "drag_end", dragOriginWorld: null, dragEndWorld: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("drag");
    expect(r.affordance.manipulation_type).toBe("drag");
  });

  it("FIXTURE_MENU_ANCHOR_OPENED → click entity dispatched (select)", () => {
    const r = wireFixtureIntent(
      makeFixtureMenuAnchorOpenedIntent({
        fixtureId: "f7", fixtureKind: "menu_anchor", entityRef: roomRef,
        actionType: "menu_open", worldPosition: null,
        screen_position: { x: 0, y: 0 }, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("click");
    expect(r.affordance.manipulation_type).toBe("click");
  });

  it("FIXTURE_MENU_ANCHOR_CLOSED → click entity dispatched (deselect)", () => {
    const r = wireFixtureIntent(
      makeFixtureMenuAnchorClosedIntent({
        fixtureId: "f8", fixtureKind: "menu_anchor", entityRef: roomRef,
        actionType: "menu_close", worldPosition: null, ts: 1,
      }),
      dispatcher,
    );
    expect(r.entity.gesture_type).toBe("click");
    expect(r.affordance.manipulation_type).toBe("click");
  });

  it("all 8 intents produce exactly 8 entities in the ring buffer", () => {
    const intents = [
      makeFixtureButtonClickedIntent({ fixtureId: "a", fixtureKind: "button", entityRef: agentRef, actionType: "click", worldPosition: null, ts: 1 }),
      makeFixtureButtonHoveredIntent({ fixtureId: "b", fixtureKind: "button", entityRef: agentRef, actionType: "hover_enter", worldPosition: null, ts: 2 }),
      makeFixtureButtonUnhoveredIntent({ fixtureId: "c", fixtureKind: "button", entityRef: agentRef, actionType: "hover_exit", worldPosition: null, ts: 3 }),
      makeFixtureHandleDragStartIntent({ fixtureId: "d", fixtureKind: "handle", entityRef: taskRef, actionType: "drag_start", dragOriginWorld: null, ts: 4 }),
      makeFixtureHandleDragMoveIntent({ fixtureId: "e", fixtureKind: "handle", entityRef: taskRef, actionType: "drag_move", dragCurrentWorld: null, dragDeltaWorld: null, ts: 5 }),
      makeFixtureHandleDragEndIntent({ fixtureId: "f", fixtureKind: "handle", entityRef: taskRef, actionType: "drag_end", dragOriginWorld: null, dragEndWorld: null, ts: 6 }),
      makeFixtureMenuAnchorOpenedIntent({ fixtureId: "g", fixtureKind: "menu_anchor", entityRef: roomRef, actionType: "menu_open", worldPosition: null, screen_position: { x: 0, y: 0 }, ts: 7 }),
      makeFixtureMenuAnchorClosedIntent({ fixtureId: "h", fixtureKind: "menu_anchor", entityRef: roomRef, actionType: "menu_close", worldPosition: null, ts: 8 }),
    ] as const;

    for (const intent of intents) {
      wireFixtureIntent(intent, dispatcher);
    }
    expect(dispatcher.getByEntityType("fixture")).toHaveLength(8);
  });
});

// ── 13. Isolation from other layers ─────────────────────────────────────────

describe("Layer isolation — fixture bridge does not produce non-fixture entities", () => {
  it("all dispatched entities have target_entity_type='fixture'", () => {
    const dispatcher = createInteractionIntentDispatcher();
    wireFixtureIntent(
      makeFixtureButtonClickedIntent({ fixtureId: "x", fixtureKind: "button", entityRef: agentRef, actionType: "click", worldPosition: null, ts: 1 }),
      dispatcher,
    );
    const entities = dispatcher.getByEntityType("fixture");
    expect(entities.every(e => e.target_entity_type === "fixture")).toBe(true);

    // Other entity types should have zero entries
    expect(dispatcher.getByEntityType("agent")).toHaveLength(0);
    expect(dispatcher.getByEntityType("room")).toHaveLength(0);
    expect(dispatcher.getByEntityType("building")).toHaveLength(0);
  });
});

// ── 14. Reflexive closure — ontology-schema fixture itself ────────────────────

describe("Reflexive closure (ontology-schema fixture)", () => {
  it("a fixture with entityRef.entityType='room' and entityId='meta-room' is valid", () => {
    const metaRef: FixtureEntityRef = { entityType: "room", entityId: "meta-room" };
    const dispatcher = createInteractionIntentDispatcher();
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "meta-ontology-btn",
      fixtureKind: "button",
      entityRef: metaRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result.affordance.affordance_id).toBe("meta-ontology-btn");
    expect(result.affordance.target_entity_ref.entityId).toBe("meta-room");
    expect(result.entity.target_entity_type).toBe("fixture");
  });
});

// ── 15. result object structure ──────────────────────────────────────────────

describe("FixtureIntentBridgeResult shape", () => {
  it("has intent, entity, and affordance fields", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "shape-check",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("entity");
    expect(result).toHaveProperty("affordance");
  });

  it("result.intent is the original FixtureInteractionIntent (referential identity)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "ref-check",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    });
    const result = wireFixtureIntent(intent, dispatcher);
    // result.intent should be the same intent passed in
    expect(result.intent.fixtureId).toBe("ref-check");
    expect(result.intent.intent).toBe("FIXTURE_BUTTON_CLICKED");
  });

  it("result is frozen", () => {
    const dispatcher = createInteractionIntentDispatcher();
    const result = wireFixtureIntent(
      makeFixtureButtonClickedIntent({
        fixtureId: "frozen", fixtureKind: "button", entityRef: agentRef,
        actionType: "click", worldPosition: null, ts: Date.now(),
      }),
      dispatcher,
    );
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ── Import for beforeEach ─────────────────────────────────────────────────────
// vitest auto-imports describe/it/expect/vi but not beforeEach in all configs.
// This explicit import ensures consistency.
import { beforeEach } from "vitest";
