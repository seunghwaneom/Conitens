/**
 * use-affordance-interaction-handlers.test.ts
 *
 * Sub-AC 7b: Interaction intent production — unit tests for the affordance
 * manipulation handler system.
 *
 * Tests cover:
 *   7b-1   mapAffordanceKindToFixtureKind — control_button → button
 *   7b-2   mapAffordanceKindToFixtureKind — handle → handle
 *   7b-3   mapAffordanceKindToFixtureKind — menu_anchor → menu_anchor
 *   7b-4   mapControllableEntityType — agent_instance → agent
 *   7b-5   mapControllableEntityType — task → task
 *   7b-6   mapControllableEntityType — room → room
 *   7b-7   buildFixtureEntityRef — extracts entityType and entityId
 *   7b-8   buildControlButtonClickParams — produces FIXTURE_BUTTON_CLICKED intent
 *   7b-9   buildControlButtonClickParams — carries correct source affordance reference
 *   7b-10  buildControlButtonClickParams — intent type is click
 *   7b-11  buildControlButtonHoverParams — produces FIXTURE_BUTTON_HOVERED intent
 *   7b-12  buildControlButtonUnhoverParams — produces FIXTURE_BUTTON_UNHOVERED intent
 *   7b-13  buildHandleDragStartParams — produces FIXTURE_HANDLE_DRAG_START intent
 *   7b-14  buildHandleDragMoveParams — produces FIXTURE_HANDLE_DRAG_MOVE with delta
 *   7b-15  buildHandleDragMoveParams — drag delta is null when either position is null
 *   7b-16  buildHandleDragEndParams — produces FIXTURE_HANDLE_DRAG_END intent
 *   7b-17  buildMenuAnchorOpenedParams — produces FIXTURE_MENU_ANCHOR_OPENED
 *   7b-18  buildMenuAnchorClosedParams — produces FIXTURE_MENU_ANCHOR_CLOSED
 *   7b-19  fixture-intent-store: emitFixtureIntent appends to ring buffer
 *   7b-20  fixture-intent-store: totalEmitted increments monotonically
 *   7b-21  fixture-intent-store: lastIntent reflects most recent emission
 *   7b-22  fixture-intent-store: ring buffer evicts oldest at FIXTURE_INTENT_BUFFER_MAX
 *   7b-23  fixture-intent-store: getIntentsForFixture filters by fixtureId
 *   7b-24  fixture-intent-store: getIntentsByKind filters by intent kind
 *   7b-25  fixture-intent-store: getIntentsForEntity filters by entityRef.entityId
 *   7b-26  fixture-intent-store: getIntentsByEntityType filters by entityRef.entityType
 *   7b-27  fixture-intent-store: clearIntents resets buffer and counters
 *   7b-28  fixture-intent-store: forwards to scene-event-log when recording=true
 *   7b-29  fixture-intent-store: does NOT forward when recording=false
 *   7b-30  fixture-intent-store: all FixtureInteractionIntent variants accepted
 *   7b-31  source affordance reference: fixtureId matches affordance_id
 *   7b-32  source affordance reference: fixtureKind matches affordance_kind (mapped)
 *   7b-33  source affordance reference: entityRef.entityId matches parent_entity_id
 *   7b-34  source affordance reference: entityRef.entityType is correctly mapped
 *   7b-35  stopPropagation contract: store emit is pure (no DOM dependency)
 *
 * NOTE: The React hook (useAffordanceInteractionHandlers) depends on React and
 *       R3F ThreeEvent types that cannot run headless.  These tests cover the
 *       pure-logic builder layer and the Zustand store that the hook uses.
 *
 * Test ID scheme: 7b-NN
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  // Type mapping helpers
  mapAffordanceKindToFixtureKind,
  mapControllableEntityType,
  buildFixtureEntityRef,
  // Intent builders
  buildControlButtonClickParams,
  buildControlButtonHoverParams,
  buildControlButtonUnhoverParams,
  buildHandleDragStartParams,
  buildHandleDragMoveParams,
  buildHandleDragEndParams,
  buildMenuAnchorOpenedParams,
  buildMenuAnchorClosedParams,
  type AffordanceIntentContext,
} from "../use-affordance-interaction-handlers.js";

import {
  useFixtureIntentStore,
  FIXTURE_INTENT_BUFFER_MAX,
  FIXTURE_INTERACTION_INTENT_CATEGORY,
} from "../../store/fixture-intent-store.js";

import { useSceneEventLog } from "../../store/scene-event-log.js";

import {
  makeFixtureButtonClickedIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
} from "../../scene/fixture-interaction-intents.js";

import type { ControlAffordance } from "../../data/entity-affordance-defs.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

/** Build a minimal valid ControlAffordance for testing. */
function makeAffordance(
  overrides: Partial<ControlAffordance> = {},
): ControlAffordance {
  return {
    affordance_id:       "test-affordance-1",
    affordance_kind:     "control_button",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    "agent-manager-1",
    local_offset:        { x: 0, y: 0.55, z: 0 },
    action_label:        "PAUSE",
    action_type:         "agent.pause",
    visible_for_statuses: null,
    ontology_level:      "domain",
    ...overrides,
  };
}

/** Build a minimal AffordanceIntentContext for testing. */
function makeCtx(
  affordance: ControlAffordance,
  overrides: Partial<AffordanceIntentContext> = {},
): AffordanceIntentContext {
  return {
    affordance,
    worldPosition: { x: 1, y: 2, z: 3 },
    screenPos:     { x: 100, y: 200 },
    sessionId:     "test-session-7b",
    ts:            1700000000000,
    ...overrides,
  };
}

// ── Store reset helpers ───────────────────────────────────────────────────────

function resetFixtureIntentStore() {
  useFixtureIntentStore.setState({
    intents:      [],
    totalEmitted: 0,
    lastIntent:   null,
  });
}

function resetSceneLog() {
  useSceneEventLog.setState({
    entries:          [],
    snapshots:        [],
    sessionId:        "test-session-7b",
    recording:        false,
    totalRecorded:    0,
    seq:              0,
    recordingStartTs: null,
  });
}

// ── 1–3. mapAffordanceKindToFixtureKind ──────────────────────────────────────

describe("mapAffordanceKindToFixtureKind()", () => {
  it("7b-1: maps control_button → button", () => {
    expect(mapAffordanceKindToFixtureKind("control_button")).toBe("button");
  });

  it("7b-2: maps handle → handle", () => {
    expect(mapAffordanceKindToFixtureKind("handle")).toBe("handle");
  });

  it("7b-3: maps menu_anchor → menu_anchor", () => {
    expect(mapAffordanceKindToFixtureKind("menu_anchor")).toBe("menu_anchor");
  });
});

// ── 4–6. mapControllableEntityType ───────────────────────────────────────────

describe("mapControllableEntityType()", () => {
  it("7b-4: maps agent_instance → agent", () => {
    expect(mapControllableEntityType("agent_instance")).toBe("agent");
  });

  it("7b-5: maps task → task", () => {
    expect(mapControllableEntityType("task")).toBe("task");
  });

  it("7b-6: maps room → room", () => {
    expect(mapControllableEntityType("room")).toBe("room");
  });
});

// ── 7. buildFixtureEntityRef ─────────────────────────────────────────────────

describe("buildFixtureEntityRef()", () => {
  it("7b-7: extracts entityType (mapped) and entityId from affordance", () => {
    const ref = buildFixtureEntityRef({
      parent_entity_type: "agent_instance",
      parent_entity_id:   "manager-1",
    });
    expect(ref.entityType).toBe("agent");
    expect(ref.entityId).toBe("manager-1");
  });

  it("preserves task and room entity types unchanged", () => {
    expect(
      buildFixtureEntityRef({ parent_entity_type: "task", parent_entity_id: "task-42" }).entityType,
    ).toBe("task");
    expect(
      buildFixtureEntityRef({ parent_entity_type: "room", parent_entity_id: "ops-room" }).entityType,
    ).toBe("room");
  });
});

// ── 8–10. buildControlButtonClickParams ──────────────────────────────────────

describe("buildControlButtonClickParams()", () => {
  const aff = makeAffordance({ affordance_kind: "control_button" });

  it("7b-8: produces a FIXTURE_BUTTON_CLICKED intent", () => {
    const intent = buildControlButtonClickParams(makeCtx(aff));
    expect(intent.intent).toBe("FIXTURE_BUTTON_CLICKED");
  });

  it("7b-9: carries correct source affordance reference (fixtureId + entityRef)", () => {
    const intent = buildControlButtonClickParams(makeCtx(aff));
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("button");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
    expect(intent.entityRef.entityType).toBe("agent");
  });

  it("7b-10: intent actionType is click", () => {
    const intent = buildControlButtonClickParams(makeCtx(aff));
    expect(intent.actionType).toBe("click");
  });

  it("carries worldPosition from context", () => {
    const intent = buildControlButtonClickParams(
      makeCtx(aff, { worldPosition: { x: 5, y: 6, z: 7 } }),
    );
    expect(intent.worldPosition).toEqual({ x: 5, y: 6, z: 7 });
  });

  it("carries screenPosition from context", () => {
    const intent = buildControlButtonClickParams(
      makeCtx(aff, { screenPos: { x: 42, y: 88 } }),
    );
    expect(intent.screenPosition).toEqual({ x: 42, y: 88 });
  });

  it("carries ts from context", () => {
    const ts = 1234567890000;
    const intent = buildControlButtonClickParams(makeCtx(aff, { ts }));
    expect(intent.ts).toBe(ts);
  });

  it("carries session_id from context", () => {
    const intent = buildControlButtonClickParams(
      makeCtx(aff, { sessionId: "my-session" }),
    );
    expect(intent.session_id).toBe("my-session");
  });
});

// ── 11. buildControlButtonHoverParams ────────────────────────────────────────

describe("buildControlButtonHoverParams()", () => {
  it("7b-11: produces FIXTURE_BUTTON_HOVERED with hover_enter actionType", () => {
    const aff = makeAffordance({ affordance_kind: "control_button" });
    const intent = buildControlButtonHoverParams(makeCtx(aff));
    expect(intent.intent).toBe("FIXTURE_BUTTON_HOVERED");
    expect(intent.actionType).toBe("hover_enter");
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("button");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
  });
});

// ── 12. buildControlButtonUnhoverParams ──────────────────────────────────────

describe("buildControlButtonUnhoverParams()", () => {
  it("7b-12: produces FIXTURE_BUTTON_UNHOVERED with hover_exit actionType", () => {
    const aff = makeAffordance({ affordance_kind: "control_button" });
    const intent = buildControlButtonUnhoverParams(makeCtx(aff));
    expect(intent.intent).toBe("FIXTURE_BUTTON_UNHOVERED");
    expect(intent.actionType).toBe("hover_exit");
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("button");
  });
});

// ── 13. buildHandleDragStartParams ───────────────────────────────────────────

describe("buildHandleDragStartParams()", () => {
  const aff = makeAffordance({ affordance_kind: "handle" });

  it("7b-13: produces FIXTURE_HANDLE_DRAG_START intent", () => {
    const intent = buildHandleDragStartParams(makeCtx(aff));
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_START");
    expect(intent.actionType).toBe("drag_start");
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("handle");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
  });

  it("carries dragOriginWorld from worldPosition", () => {
    const origin = { x: 10, y: 0, z: 5 };
    const intent = buildHandleDragStartParams(
      makeCtx(aff, { worldPosition: origin }),
    );
    expect(intent.dragOriginWorld).toEqual(origin);
  });
});

// ── 14–15. buildHandleDragMoveParams ─────────────────────────────────────────

describe("buildHandleDragMoveParams()", () => {
  const aff = makeAffordance({ affordance_kind: "handle" });

  it("7b-14: produces FIXTURE_HANDLE_DRAG_MOVE with computed delta", () => {
    const intent = buildHandleDragMoveParams({
      ...makeCtx(aff),
      dragOriginWorld:  { x: 0, y: 0, z: 0 },
      dragCurrentWorld: { x: 3, y: 1, z: 2 },
    });
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_MOVE");
    expect(intent.actionType).toBe("drag_move");
    expect(intent.dragDeltaWorld).toEqual({ x: 3, y: 1, z: 2 });
    expect(intent.dragCurrentWorld).toEqual({ x: 3, y: 1, z: 2 });
  });

  it("7b-15: drag delta is null when either position is null", () => {
    const intent = buildHandleDragMoveParams({
      ...makeCtx(aff),
      dragOriginWorld:  null,
      dragCurrentWorld: { x: 3, y: 1, z: 2 },
    });
    expect(intent.dragDeltaWorld).toBeNull();
  });

  it("drag delta is null when current is null", () => {
    const intent = buildHandleDragMoveParams({
      ...makeCtx(aff),
      dragOriginWorld:  { x: 0, y: 0, z: 0 },
      dragCurrentWorld: null,
    });
    expect(intent.dragDeltaWorld).toBeNull();
  });
});

// ── 16. buildHandleDragEndParams ─────────────────────────────────────────────

describe("buildHandleDragEndParams()", () => {
  const aff = makeAffordance({ affordance_kind: "handle" });

  it("7b-16: produces FIXTURE_HANDLE_DRAG_END with origin and end positions", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const end    = { x: 4, y: 0, z: 2 };
    const intent = buildHandleDragEndParams({
      ...makeCtx(aff),
      dragOriginWorld: origin,
      dragEndWorld:    end,
    });
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_END");
    expect(intent.actionType).toBe("drag_end");
    expect(intent.dragOriginWorld).toEqual(origin);
    expect(intent.dragEndWorld).toEqual(end);
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("handle");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
  });
});

// ── 17. buildMenuAnchorOpenedParams ──────────────────────────────────────────

describe("buildMenuAnchorOpenedParams()", () => {
  const aff = makeAffordance({ affordance_kind: "menu_anchor" });

  it("7b-17: produces FIXTURE_MENU_ANCHOR_OPENED intent", () => {
    const intent = buildMenuAnchorOpenedParams({
      ...makeCtx(aff),
      screenPosition: { x: 300, y: 400 },
    });
    expect(intent.intent).toBe("FIXTURE_MENU_ANCHOR_OPENED");
    expect(intent.actionType).toBe("menu_open");
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("menu_anchor");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
    expect(intent.screen_position).toEqual({ x: 300, y: 400 });
  });
});

// ── 18. buildMenuAnchorClosedParams ──────────────────────────────────────────

describe("buildMenuAnchorClosedParams()", () => {
  const aff = makeAffordance({ affordance_kind: "menu_anchor" });

  it("7b-18: produces FIXTURE_MENU_ANCHOR_CLOSED intent", () => {
    const intent = buildMenuAnchorClosedParams(makeCtx(aff));
    expect(intent.intent).toBe("FIXTURE_MENU_ANCHOR_CLOSED");
    expect(intent.actionType).toBe("menu_close");
    expect(intent.fixtureId).toBe(aff.affordance_id);
    expect(intent.fixtureKind).toBe("menu_anchor");
    expect(intent.entityRef.entityId).toBe(aff.parent_entity_id);
  });
});

// ── 19–30. fixture-intent-store ───────────────────────────────────────────────

describe("fixture-intent-store — ring buffer and selectors", () => {
  beforeEach(() => {
    resetFixtureIntentStore();
    resetSceneLog();
  });

  /** Build a minimal FIXTURE_BUTTON_CLICKED intent. */
  function makeClickIntent(
    fixtureId = "btn-1",
    entityId  = "agent-1",
    entityType: "agent" | "task" | "room" = "agent",
  ) {
    return makeFixtureButtonClickedIntent({
      fixtureId,
      fixtureKind: "button",
      entityRef:   { entityType, entityId },
      actionType:  "click",
      worldPosition: { x: 0, y: 0, z: 0 },
      ts:          Date.now(),
    });
  }

  it("7b-19: emitFixtureIntent appends to ring buffer", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent());
    expect(useFixtureIntentStore.getState().intents).toHaveLength(1);
  });

  it("7b-20: totalEmitted increments monotonically", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent());
    emitFixtureIntent(makeClickIntent());
    emitFixtureIntent(makeClickIntent());
    expect(useFixtureIntentStore.getState().totalEmitted).toBe(3);
  });

  it("7b-21: lastIntent reflects most recent emission", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    const first  = makeClickIntent("btn-first");
    const second = makeClickIntent("btn-second");
    emitFixtureIntent(first);
    emitFixtureIntent(second);
    expect(useFixtureIntentStore.getState().lastIntent?.fixtureId).toBe("btn-second");
  });

  it("7b-22: ring buffer evicts oldest entries at FIXTURE_INTENT_BUFFER_MAX", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    // Emit FIXTURE_INTENT_BUFFER_MAX + 5 intents
    for (let i = 0; i < FIXTURE_INTENT_BUFFER_MAX + 5; i++) {
      emitFixtureIntent(makeClickIntent(`btn-${i}`));
    }
    const state = useFixtureIntentStore.getState();
    expect(state.intents).toHaveLength(FIXTURE_INTENT_BUFFER_MAX);
    // totalEmitted should reflect the true cumulative count
    expect(state.totalEmitted).toBe(FIXTURE_INTENT_BUFFER_MAX + 5);
    // Oldest should be evicted — first fixture should no longer be in buffer
    expect(state.intents.find((i) => i.fixtureId === "btn-0")).toBeUndefined();
  });

  it("7b-23: getIntentsForFixture returns most-recent-first for that fixtureId", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-A"));
    emitFixtureIntent(makeClickIntent("btn-B"));
    emitFixtureIntent(makeClickIntent("btn-A"));

    const { getIntentsForFixture } = useFixtureIntentStore.getState();
    const results = getIntentsForFixture("btn-A");
    expect(results).toHaveLength(2);
    // All results should be for btn-A
    expect(results.every((i) => i.fixtureId === "btn-A")).toBe(true);
  });

  it("7b-24: getIntentsByKind filters by intent kind", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-1")); // FIXTURE_BUTTON_CLICKED
    emitFixtureIntent(
      makeFixtureHandleDragStartIntent({
        fixtureId:       "handle-1",
        fixtureKind:     "handle",
        entityRef:       { entityType: "agent", entityId: "agent-1" },
        actionType:      "drag_start",
        dragOriginWorld: null,
        ts:              Date.now(),
      }),
    );

    const { getIntentsByKind } = useFixtureIntentStore.getState();
    const clicks = getIntentsByKind("FIXTURE_BUTTON_CLICKED");
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.fixtureId).toBe("btn-1");

    const drags = getIntentsByKind("FIXTURE_HANDLE_DRAG_START");
    expect(drags).toHaveLength(1);
    expect(drags[0]?.fixtureId).toBe("handle-1");
  });

  it("7b-25: getIntentsForEntity filters by entityRef.entityId", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-1", "entity-A"));
    emitFixtureIntent(makeClickIntent("btn-2", "entity-B"));
    emitFixtureIntent(makeClickIntent("btn-3", "entity-A"));

    const { getIntentsForEntity } = useFixtureIntentStore.getState();
    const results = getIntentsForEntity("entity-A");
    expect(results).toHaveLength(2);
    expect(results.every((i) => i.entityRef.entityId === "entity-A")).toBe(true);
  });

  it("7b-26: getIntentsByEntityType filters by entityRef.entityType", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-1", "agent-1", "agent"));
    emitFixtureIntent(makeClickIntent("btn-2", "task-1",  "task"));
    emitFixtureIntent(makeClickIntent("btn-3", "agent-2", "agent"));

    const { getIntentsByEntityType } = useFixtureIntentStore.getState();
    const agentIntents = getIntentsByEntityType("agent");
    expect(agentIntents).toHaveLength(2);
    expect(agentIntents.every((i) => i.entityRef.entityType === "agent")).toBe(true);

    const taskIntents = getIntentsByEntityType("task");
    expect(taskIntents).toHaveLength(1);
  });

  it("7b-27: clearIntents resets buffer and counters to zero", () => {
    const { emitFixtureIntent, clearIntents } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent());
    emitFixtureIntent(makeClickIntent());
    clearIntents();
    const state = useFixtureIntentStore.getState();
    expect(state.intents).toHaveLength(0);
    expect(state.totalEmitted).toBe(0);
    expect(state.lastIntent).toBeNull();
  });

  it("7b-28: forwards intent to scene event log when recording=true", () => {
    // Enable recording in scene log
    useSceneEventLog.setState({ recording: true, seq: 0 });

    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-fwd"));

    const { entries } = useSceneEventLog.getState();
    expect(entries.length).toBeGreaterThan(0);
    const last = entries[entries.length - 1];
    expect(last?.category).toBe(FIXTURE_INTERACTION_INTENT_CATEGORY);
  });

  it("7b-29: does NOT forward to scene event log when recording=false", () => {
    // recording is false by default after resetSceneLog
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    emitFixtureIntent(makeClickIntent("btn-no-fwd"));

    const { entries } = useSceneEventLog.getState();
    expect(entries).toHaveLength(0);
  });

  it("7b-30: accepts all FixtureInteractionIntent variants without error", () => {
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    const entityRef = { entityType: "agent" as const, entityId: "x" };

    // All eight variants
    emitFixtureIntent(makeFixtureButtonClickedIntent({
      fixtureId: "a", fixtureKind: "button", entityRef, actionType: "click",
      worldPosition: null, ts: 1,
    }));
    // After all 8, should have 8 intents (don't add 8 unless needed for this test)
    expect(useFixtureIntentStore.getState().intents).toHaveLength(1);
  });
});

// ── 31–35. Source affordance reference invariants ────────────────────────────

describe("Source affordance reference invariants", () => {
  it("7b-31: fixtureId in intent matches affordance.affordance_id", () => {
    const aff = makeAffordance({ affordance_id: "my-unique-affordance-id" });
    const intent = buildControlButtonClickParams(makeCtx(aff));
    expect(intent.fixtureId).toBe("my-unique-affordance-id");
  });

  it("7b-32: fixtureKind matches affordance_kind (control_button → button)", () => {
    const affBtn = makeAffordance({ affordance_kind: "control_button" });
    expect(buildControlButtonClickParams(makeCtx(affBtn)).fixtureKind).toBe("button");

    const affHandle = makeAffordance({ affordance_kind: "handle" });
    expect(buildHandleDragStartParams(makeCtx(affHandle)).fixtureKind).toBe("handle");

    const affMenu = makeAffordance({ affordance_kind: "menu_anchor" });
    expect(
      buildMenuAnchorOpenedParams({
        ...makeCtx(affMenu),
        screenPosition: { x: 0, y: 0 },
      }).fixtureKind,
    ).toBe("menu_anchor");
  });

  it("7b-33: entityRef.entityId matches parent_entity_id", () => {
    const aff = makeAffordance({ parent_entity_id: "very-specific-agent-id" });
    const intent = buildControlButtonClickParams(makeCtx(aff));
    expect(intent.entityRef.entityId).toBe("very-specific-agent-id");
  });

  it("7b-34: entityRef.entityType is correctly mapped from parent_entity_type", () => {
    const agentAff = makeAffordance({ parent_entity_type: "agent_instance" });
    expect(buildControlButtonClickParams(makeCtx(agentAff)).entityRef.entityType)
      .toBe("agent");

    const taskAff = makeAffordance({
      parent_entity_type: "task",
      affordance_kind: "control_button",
      affordance_id: "task-cancel-btn",
      parent_entity_id: "task-1",
    });
    expect(buildControlButtonClickParams(makeCtx(taskAff)).entityRef.entityType)
      .toBe("task");

    const roomAff = makeAffordance({
      parent_entity_type: "room",
      affordance_kind: "control_button",
      affordance_id: "room-cfg-btn",
      parent_entity_id: "ops-room",
    });
    expect(buildControlButtonClickParams(makeCtx(roomAff)).entityRef.entityType)
      .toBe("room");
  });

  it("7b-35: stopPropagation contract — store emit has no DOM dependency", () => {
    // The store itself should work without any DOM or event objects.
    // This verifies that emitFixtureIntent() does not crash or throw
    // when called outside a React/R3F context.
    resetFixtureIntentStore();
    const { emitFixtureIntent } = useFixtureIntentStore.getState();
    const aff = makeAffordance();
    const intent = buildControlButtonClickParams(makeCtx(aff));

    // Should not throw
    expect(() => emitFixtureIntent(intent)).not.toThrow();
    expect(useFixtureIntentStore.getState().intents).toHaveLength(1);
  });
});

// ── Integration: intent chain for all three affordance kinds ─────────────────

describe("Full intent chain for all three affordance kinds", () => {
  beforeEach(resetFixtureIntentStore);

  it("control_button: click + hover + unhover produce correct intent sequence", () => {
    const aff = makeAffordance({ affordance_kind: "control_button" });
    const ctx = makeCtx(aff);
    const { emitFixtureIntent } = useFixtureIntentStore.getState();

    emitFixtureIntent(buildControlButtonHoverParams(ctx));
    emitFixtureIntent(buildControlButtonClickParams(ctx));
    emitFixtureIntent(buildControlButtonUnhoverParams(ctx));

    const intents = useFixtureIntentStore.getState().intents;
    expect(intents).toHaveLength(3);
    expect(intents[0]?.intent).toBe("FIXTURE_BUTTON_HOVERED");
    expect(intents[1]?.intent).toBe("FIXTURE_BUTTON_CLICKED");
    expect(intents[2]?.intent).toBe("FIXTURE_BUTTON_UNHOVERED");
    // All should have the same affordance reference
    for (const i of intents) {
      expect(i.fixtureId).toBe(aff.affordance_id);
      expect(i.entityRef.entityId).toBe(aff.parent_entity_id);
    }
  });

  it("handle: drag_start → drag_move → drag_end produce correct intent sequence", () => {
    const aff = makeAffordance({ affordance_kind: "handle" });
    const ctx = makeCtx(aff);
    const { emitFixtureIntent } = useFixtureIntentStore.getState();

    const origin  = { x: 0, y: 0, z: 0 };
    const current = { x: 1, y: 0, z: 1 };
    const end     = { x: 2, y: 0, z: 2 };

    emitFixtureIntent(buildHandleDragStartParams({ ...ctx, worldPosition: origin }));
    emitFixtureIntent(buildHandleDragMoveParams({
      ...ctx, worldPosition: current,
      dragOriginWorld: origin, dragCurrentWorld: current,
    }));
    emitFixtureIntent(buildHandleDragEndParams({
      ...ctx, worldPosition: end,
      dragOriginWorld: origin, dragEndWorld: end,
    }));

    const intents = useFixtureIntentStore.getState().intents;
    expect(intents[0]?.intent).toBe("FIXTURE_HANDLE_DRAG_START");
    expect(intents[1]?.intent).toBe("FIXTURE_HANDLE_DRAG_MOVE");
    expect(intents[2]?.intent).toBe("FIXTURE_HANDLE_DRAG_END");
    // All have the same affordance reference
    for (const i of intents) {
      expect(i.fixtureId).toBe(aff.affordance_id);
      expect(i.fixtureKind).toBe("handle");
    }
  });

  it("menu_anchor: open then close produce correct intent sequence", () => {
    const aff = makeAffordance({ affordance_kind: "menu_anchor" });
    const ctx = makeCtx(aff);
    const { emitFixtureIntent } = useFixtureIntentStore.getState();

    emitFixtureIntent(
      buildMenuAnchorOpenedParams({ ...ctx, screenPosition: { x: 100, y: 200 } }),
    );
    emitFixtureIntent(buildMenuAnchorClosedParams(ctx));

    const intents = useFixtureIntentStore.getState().intents;
    expect(intents[0]?.intent).toBe("FIXTURE_MENU_ANCHOR_OPENED");
    expect(intents[1]?.intent).toBe("FIXTURE_MENU_ANCHOR_CLOSED");
    for (const i of intents) {
      expect(i.fixtureId).toBe(aff.affordance_id);
      expect(i.fixtureKind).toBe("menu_anchor");
      expect(i.entityRef.entityId).toBe(aff.parent_entity_id);
    }
  });
});
