/**
 * agent-instance-layer-handlers.test.ts — Isolated unit tests for Sub-AC 4d.
 *
 * Verifies that the agent_instance layer 3D object event handlers emit
 * canonical `interaction_intent` entities with:
 *   • `target_entity_type = "agent_instance"` (the Sub-AC 4d invariant)
 *   • `gesture_type` matching the gesture that triggered the handler
 *   • `target_id` equal to `context.agent_instance_id`
 *
 * Test scope
 * ──────────
 * These tests operate purely in Node.js — no React, no Three.js, no DOM,
 * no R3F, and no command-file writes.  All Three.js / R3F pointer event
 * concerns are isolated by the minimal `AgentInstanceGestureEvent` interface.
 *
 * Three gesture types required by Sub-AC 4d
 * ──────────────────────────────────────────
 *   1. click       → gesture_type = "click",        target_entity_type = "agent_instance"
 *   2. hover       → gesture_type = "hover",        target_entity_type = "agent_instance"
 *   3. context_menu → gesture_type = "context_menu", target_entity_type = "agent_instance"
 *   (also tests unhover for completeness)
 *
 * Test ID scheme: ai4d-NN
 *
 * Coverage:
 *   ai4d-01  handleAgentInstanceClick → entity.target_entity_type === "agent_instance"
 *   ai4d-02  handleAgentInstanceClick → entity.gesture_type === "click"
 *   ai4d-03  handleAgentInstanceClick → entity.target_id === agent_instance_id
 *   ai4d-04  handleAgentInstanceHover → entity.target_entity_type === "agent_instance"
 *   ai4d-05  handleAgentInstanceHover → entity.gesture_type === "hover"
 *   ai4d-06  handleAgentInstanceHover → entity.target_id === agent_instance_id
 *   ai4d-07  handleAgentInstanceContextMenu → entity.target_entity_type === "agent_instance"
 *   ai4d-08  handleAgentInstanceContextMenu → entity.gesture_type === "context_menu"
 *   ai4d-09  handleAgentInstanceContextMenu → entity.target_id === agent_instance_id
 *   ai4d-10  handleAgentInstanceUnhover → entity.target_entity_type === "agent_instance"
 *   ai4d-11  handleAgentInstanceUnhover → entity.gesture_type === "unhover"
 *   ai4d-12  click handler calls stopPropagation before emitting
 *   ai4d-13  hover handler calls stopPropagation before emitting
 *   ai4d-14  context_menu handler calls stopPropagation and preventDefault
 *   ai4d-15  unhover handler does NOT call stopPropagation (pointer already left)
 *   ai4d-16  canonical entity has layer === "meta"
 *   ai4d-17  canonical entity has non-empty intent_id (unique per dispatch)
 *   ai4d-18  canonical entity has valid ts > 0
 *   ai4d-19  canonical entity has valid ts_iso (ISO-8601 string)
 *   ai4d-20  source_payload carries full AgentInteractionIntent data
 *   ai4d-21  dispatcher receives exactly one entity per handler call
 *   ai4d-22  all three gesture types are distinct canonical entities
 *   ai4d-23  world_position is propagated to canonical entity
 *   ai4d-24  world_position null is handled without error
 *   ai4d-25  session_id is forwarded to canonical entity
 *   ai4d-26  AGENT_INSTANCE_LAYER_HANDLERS record contains all four keys
 *   ai4d-27  JSON round-trip fidelity for canonical entities (record transparency)
 *   ai4d-28  cross-layer isolation: agent_instance entities do not match "agent" type
 *   ai4d-29  cross-layer isolation: agent_instance entities do not match "room" type
 *   ai4d-30  cross-layer isolation: agent_instance entities do not match "building" type
 */

import { describe, it, expect, vi } from "vitest";

import {
  handleAgentInstanceClick,
  handleAgentInstanceHover,
  handleAgentInstanceUnhover,
  handleAgentInstanceContextMenu,
  AGENT_INSTANCE_LAYER_HANDLERS,
  type AgentInstanceGestureEvent,
  type AgentInstanceHandlerContext,
} from "../agent-instance-layer-handlers.js";

import {
  createInteractionIntentDispatcher,
  type InteractionIntentDispatcher,
} from "../interaction-intent-dispatcher.js";

import {
  isInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORLD_POS  = { x: 3.5, y: 0.5, z: -2.0 };
const SCREEN_X   = 640;
const SCREEN_Y   = 360;

/** Minimal agent_instance context for all tests. */
function makeContext(overrides: Partial<AgentInstanceHandlerContext> = {}): AgentInstanceHandlerContext {
  return {
    agent_instance_id: "implementer-42",
    agent_name:        "Implementer 42",
    agent_role:        "implementer",
    agent_status:      "active",
    room_id:           "lab-room-01",
    was_selected:      false,
    is_drill_target:   false,
    session_id:        "test-session-4d",
    ...overrides,
  };
}

/** Minimal mock pointer event — satisfies AgentInstanceGestureEvent. */
function makeEvent(
  point: { x: number; y: number; z: number } | undefined = WORLD_POS,
  clientX = SCREEN_X,
  clientY = SCREEN_Y,
): AgentInstanceGestureEvent & {
  stopPropagation: ReturnType<typeof vi.fn>;
  nativeEvent: { preventDefault: ReturnType<typeof vi.fn>; clientX: number; clientY: number };
} {
  const stopPropagation = vi.fn<[], void>();
  const preventDefault  = vi.fn<[], void>();
  return {
    stopPropagation,
    point,
    nativeEvent: { clientX, clientY, preventDefault },
  };
}

/** Create a fresh dispatcher for each test (isolation). */
function makeDispatcher(): InteractionIntentDispatcher {
  return createInteractionIntentDispatcher({ maxBuffer: 100 });
}

// ---------------------------------------------------------------------------
// ai4d-01 → ai4d-03  Click handler
// ---------------------------------------------------------------------------

describe("ai4d — handleAgentInstanceClick: target_entity_type and gesture_type", () => {

  it("ai4d-01: click handler emits entity with target_entity_type='agent_instance'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).toBe("agent_instance");
  });

  it("ai4d-02: click handler emits entity with gesture_type='click'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    expect(entity.gesture_type).toBe("click");
  });

  it("ai4d-03: click handler emits entity with target_id === agent_instance_id", () => {
    const dispatcher = makeDispatcher();
    const context = makeContext({ agent_instance_id: "researcher-99" });
    const { entity } = handleAgentInstanceClick(makeEvent(), context, dispatcher);
    expect(entity.target_id).toBe("researcher-99");
  });
});

// ---------------------------------------------------------------------------
// ai4d-04 → ai4d-06  Hover handler
// ---------------------------------------------------------------------------

describe("ai4d — handleAgentInstanceHover: target_entity_type and gesture_type", () => {

  it("ai4d-04: hover handler emits entity with target_entity_type='agent_instance'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).toBe("agent_instance");
  });

  it("ai4d-05: hover handler emits entity with gesture_type='hover'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);
    expect(entity.gesture_type).toBe("hover");
  });

  it("ai4d-06: hover handler emits entity with target_id === agent_instance_id", () => {
    const dispatcher = makeDispatcher();
    const context = makeContext({ agent_instance_id: "manager-01" });
    const { entity } = handleAgentInstanceHover(makeEvent(), context, dispatcher);
    expect(entity.target_id).toBe("manager-01");
  });
});

// ---------------------------------------------------------------------------
// ai4d-07 → ai4d-09  Context-menu handler
// ---------------------------------------------------------------------------

describe("ai4d — handleAgentInstanceContextMenu: target_entity_type and gesture_type", () => {

  it("ai4d-07: context_menu handler emits entity with target_entity_type='agent_instance'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).toBe("agent_instance");
  });

  it("ai4d-08: context_menu handler emits entity with gesture_type='context_menu'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);
    expect(entity.gesture_type).toBe("context_menu");
  });

  it("ai4d-09: context_menu handler emits entity with target_id === agent_instance_id", () => {
    const dispatcher = makeDispatcher();
    const context = makeContext({ agent_instance_id: "validator-7" });
    const { entity } = handleAgentInstanceContextMenu(makeEvent(), context, dispatcher);
    expect(entity.target_id).toBe("validator-7");
  });
});

// ---------------------------------------------------------------------------
// ai4d-10 → ai4d-11  Unhover handler
// ---------------------------------------------------------------------------

describe("ai4d — handleAgentInstanceUnhover: target_entity_type and gesture_type", () => {

  it("ai4d-10: unhover handler emits entity with target_entity_type='agent_instance'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceUnhover(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).toBe("agent_instance");
  });

  it("ai4d-11: unhover handler emits entity with gesture_type='unhover'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceUnhover(makeEvent(), makeContext(), dispatcher);
    expect(entity.gesture_type).toBe("unhover");
  });
});

// ---------------------------------------------------------------------------
// ai4d-12 → ai4d-15  Propagation contract
// ---------------------------------------------------------------------------

describe("ai4d — propagation contract", () => {

  it("ai4d-12: click handler calls stopPropagation before emitting intent", () => {
    const dispatcher = makeDispatcher();
    const event = makeEvent();

    // Track dispatch order by recording calls
    const dispatchOrder: string[] = [];
    event.stopPropagation.mockImplementation(() => { dispatchOrder.push("stopPropagation"); });
    const originalDispatch = dispatcher.dispatchEntity.bind(dispatcher);
    vi.spyOn(dispatcher, "dispatchEntity").mockImplementation((entity) => {
      dispatchOrder.push("dispatch");
      originalDispatch(entity);
    });

    handleAgentInstanceClick(event, makeContext(), dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    // stopPropagation must have been called before dispatch
    expect(dispatchOrder[0]).toBe("stopPropagation");
    expect(dispatchOrder[1]).toBe("dispatch");
  });

  it("ai4d-13: hover handler calls stopPropagation before emitting intent", () => {
    const dispatcher = makeDispatcher();
    const event = makeEvent();

    const dispatchOrder: string[] = [];
    event.stopPropagation.mockImplementation(() => { dispatchOrder.push("stopPropagation"); });
    vi.spyOn(dispatcher, "dispatchEntity").mockImplementation(() => { dispatchOrder.push("dispatch"); });

    handleAgentInstanceHover(event, makeContext(), dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchOrder[0]).toBe("stopPropagation");
  });

  it("ai4d-14: context_menu handler calls stopPropagation and preventDefault", () => {
    const dispatcher = makeDispatcher();
    const event = makeEvent();

    handleAgentInstanceContextMenu(event, makeContext(), dispatcher);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.nativeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ai4d-15: unhover handler does NOT call stopPropagation", () => {
    const dispatcher = makeDispatcher();
    const event = makeEvent();

    handleAgentInstanceUnhover(event, makeContext(), dispatcher);

    // Unhover should NOT call stopPropagation — pointer already left
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ai4d-16 → ai4d-20  Canonical entity shape
// ---------------------------------------------------------------------------

describe("ai4d — canonical entity invariants", () => {

  it("ai4d-16: canonical entity has layer === 'meta'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    expect(entity.layer).toBe("meta");
  });

  it("ai4d-17: canonical entity has a non-empty intent_id (unique per dispatch)", () => {
    const dispatcher = makeDispatcher();
    const { entity: e1 } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    const { entity: e2 } = handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);

    expect(typeof e1.intent_id).toBe("string");
    expect(e1.intent_id.length).toBeGreaterThan(0);
    // Each dispatch produces a unique intent_id
    expect(e1.intent_id).not.toBe(e2.intent_id);
  });

  it("ai4d-18: canonical entity has ts > 0", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);
    expect(entity.ts).toBeGreaterThan(0);
  });

  it("ai4d-19: canonical entity has a valid ISO-8601 ts_iso string", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);
    expect(typeof entity.ts_iso).toBe("string");
    // Must parse as a valid Date
    const d = new Date(entity.ts_iso);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it("ai4d-20: source_payload carries the full AgentInteractionIntent data", () => {
    const dispatcher = makeDispatcher();
    const context = makeContext({ agent_instance_id: "impl-88", agent_role: "implementer" });
    const { entity, intent } = handleAgentInstanceClick(makeEvent(), context, dispatcher);

    // source_payload must be an object
    expect(typeof entity.source_payload).toBe("object");
    expect(entity.source_payload).not.toBeNull();

    // source_payload must include the layer-specific intent fields
    const sp = entity.source_payload as Record<string, unknown>;
    expect(sp["agentId"]).toBe("impl-88");
    expect(sp["agentRole"]).toBe("implementer");
    expect(sp["intent"]).toBe(intent.intent); // AGENT_CLICKED
  });
});

// ---------------------------------------------------------------------------
// ai4d-21 → ai4d-22  Dispatcher interaction
// ---------------------------------------------------------------------------

describe("ai4d — dispatcher integration", () => {

  it("ai4d-21: each handler call adds exactly one entity to the dispatcher buffer", () => {
    const dispatcher = makeDispatcher();

    handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    expect(dispatcher.buffer.length).toBe(1);

    handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);
    expect(dispatcher.buffer.length).toBe(2);

    handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);
    expect(dispatcher.buffer.length).toBe(3);

    handleAgentInstanceUnhover(makeEvent(), makeContext(), dispatcher);
    expect(dispatcher.buffer.length).toBe(4);
  });

  it("ai4d-22: all three required gesture types produce distinct canonical entities", () => {
    const dispatcher = makeDispatcher();
    const ctx = makeContext({ agent_instance_id: "distinct-agent" });

    const { entity: eClick   } = handleAgentInstanceClick(makeEvent(),       ctx, dispatcher);
    const { entity: eHover   } = handleAgentInstanceHover(makeEvent(),       ctx, dispatcher);
    const { entity: eCtxMenu } = handleAgentInstanceContextMenu(makeEvent(), ctx, dispatcher);

    // Same target entity type and target id — different gesture types
    expect(eClick.target_entity_type).toBe("agent_instance");
    expect(eHover.target_entity_type).toBe("agent_instance");
    expect(eCtxMenu.target_entity_type).toBe("agent_instance");

    expect(eClick.gesture_type).toBe("click");
    expect(eHover.gesture_type).toBe("hover");
    expect(eCtxMenu.gesture_type).toBe("context_menu");

    // All share the same target_id
    expect(eClick.target_id).toBe("distinct-agent");
    expect(eHover.target_id).toBe("distinct-agent");
    expect(eCtxMenu.target_id).toBe("distinct-agent");

    // But they all have unique intent_ids
    const ids = new Set([eClick.intent_id, eHover.intent_id, eCtxMenu.intent_id]);
    expect(ids.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ai4d-23 → ai4d-25  Contextual fields
// ---------------------------------------------------------------------------

describe("ai4d — contextual fields propagation", () => {

  it("ai4d-23: world_position from event.point is propagated to canonical entity", () => {
    const dispatcher = makeDispatcher();
    const point = { x: 5.0, y: 1.0, z: -3.0 };
    const { entity } = handleAgentInstanceClick(
      makeEvent(point),
      makeContext(),
      dispatcher,
    );

    expect(entity.world_position).toEqual(point);
  });

  it("ai4d-24: null/undefined world_position is handled without error", () => {
    const dispatcher = makeDispatcher();
    // event.point is undefined → worldPosition in layer-specific intent is null
    const event: AgentInstanceGestureEvent = {
      stopPropagation: vi.fn(),
      // point is intentionally absent
    };

    expect(() => {
      handleAgentInstanceClick(event, makeContext(), dispatcher);
    }).not.toThrow();

    const entity = dispatcher.buffer[0];
    expect(entity).toBeDefined();
    // world_position should be absent or null
    expect(entity!.world_position).toBeUndefined();
  });

  it("ai4d-25: session_id from context is forwarded to canonical entity", () => {
    const dispatcher = makeDispatcher();
    const context = makeContext({ session_id: "my-session-xyz" });
    const { entity } = handleAgentInstanceHover(makeEvent(), context, dispatcher);

    expect(entity.session_id).toBe("my-session-xyz");
  });
});

// ---------------------------------------------------------------------------
// ai4d-26  AGENT_INSTANCE_LAYER_HANDLERS record
// ---------------------------------------------------------------------------

describe("ai4d — AGENT_INSTANCE_LAYER_HANDLERS keyed record", () => {

  it("ai4d-26: AGENT_INSTANCE_LAYER_HANDLERS has all four handler keys", () => {
    expect(typeof AGENT_INSTANCE_LAYER_HANDLERS.click).toBe("function");
    expect(typeof AGENT_INSTANCE_LAYER_HANDLERS.hover).toBe("function");
    expect(typeof AGENT_INSTANCE_LAYER_HANDLERS.unhover).toBe("function");
    expect(typeof AGENT_INSTANCE_LAYER_HANDLERS.context_menu).toBe("function");

    // Verify they are the same functions as the named exports
    expect(AGENT_INSTANCE_LAYER_HANDLERS.click).toBe(handleAgentInstanceClick);
    expect(AGENT_INSTANCE_LAYER_HANDLERS.hover).toBe(handleAgentInstanceHover);
    expect(AGENT_INSTANCE_LAYER_HANDLERS.unhover).toBe(handleAgentInstanceUnhover);
    expect(AGENT_INSTANCE_LAYER_HANDLERS.context_menu).toBe(handleAgentInstanceContextMenu);
  });
});

// ---------------------------------------------------------------------------
// ai4d-27  JSON round-trip (record transparency)
// ---------------------------------------------------------------------------

describe("ai4d — JSON round-trip fidelity (record transparency)", () => {

  it("ai4d-27: canonical entities from all three gesture types survive JSON round-trip", () => {
    const dispatcher = makeDispatcher();
    const ctx = makeContext({ agent_instance_id: "round-trip-agent", session_id: "s-rt" });

    const { entity: eClick   } = handleAgentInstanceClick(makeEvent(),       ctx, dispatcher);
    const { entity: eHover   } = handleAgentInstanceHover(makeEvent(),       ctx, dispatcher);
    const { entity: eCtxMenu } = handleAgentInstanceContextMenu(makeEvent(), ctx, dispatcher);

    for (const entity of [eClick, eHover, eCtxMenu]) {
      const serialised = JSON.stringify(entity);
      const parsed = JSON.parse(serialised) as unknown;

      // Must be a valid InteractionIntentEntity after round-trip
      expect(isInteractionIntentEntity(parsed)).toBe(true);

      const p = parsed as typeof entity;
      expect(p.target_entity_type).toBe("agent_instance");
      expect(p.target_id).toBe("round-trip-agent");
      expect(p.layer).toBe("meta");
      expect(typeof p.intent_id).toBe("string");
      expect(p.ts).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ai4d-28 → ai4d-30  Cross-layer isolation
// ---------------------------------------------------------------------------

describe("ai4d — cross-layer isolation (agent_instance vs agent/room/building)", () => {

  it("ai4d-28: agent_instance entities have target_entity_type !== 'agent'", () => {
    const dispatcher = makeDispatcher();
    const { entity: eClick   } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    const { entity: eHover   } = handleAgentInstanceHover(makeEvent(), makeContext(), dispatcher);
    const { entity: eCtxMenu } = handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);

    for (const entity of [eClick, eHover, eCtxMenu]) {
      expect(entity.target_entity_type).not.toBe("agent");
    }
  });

  it("ai4d-29: agent_instance entities have target_entity_type !== 'room'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceClick(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).not.toBe("room");
  });

  it("ai4d-30: agent_instance entities have target_entity_type !== 'building'", () => {
    const dispatcher = makeDispatcher();
    const { entity } = handleAgentInstanceContextMenu(makeEvent(), makeContext(), dispatcher);
    expect(entity.target_entity_type).not.toBe("building");
  });
});
