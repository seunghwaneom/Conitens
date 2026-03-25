/**
 * interaction-intent-entity.test.ts
 *
 * Sub-AC 4a — canonical interaction_intent entity schema + emitter/dispatcher.
 *
 * Tests cover:
 *   1. InteractionIntentEntity factory produces all three canonical fields
 *      (target_entity_type, gesture_type, target_id)
 *   2. Type guards correctly validate canonical entities
 *   3. All four target_entity_type values are accepted
 *   4. All five gesture_type values are accepted
 *   5. All three layer values are accepted
 *   6. Immutability: produced entities are frozen
 *   7. JSON round-trip fidelity (record transparency invariant)
 *   8. Per-layer normalizers produce correctly-shaped canonical entities:
 *      8a. normalizeBuildingIntent (domain layer → "building")
 *      8b. normalizeRoomIntent (infrastructure layer → "room")
 *      8c. normalizeAgentIntent (meta layer → "agent")
 *      8d. normalizeFixtureIntent (meta/fixture layer → "fixture")
 *   9. Generic dispatchIntent routes to the correct normalizer
 *  10. InteractionIntentDispatcher:
 *      10a. dispatch() returns canonical entity
 *      10b. buffer grows and evicts at maxBuffer
 *      10c. totalDispatched increments monotonically
 *      10d. lastEntity reflects most-recently dispatched
 *      10e. subscribe() notifies on each dispatch
 *      10f. unsubscribe() stops notifications
 *      10g. getByEntityType() filters correctly
 *      10h. getByGesture() filters correctly
 *      10i. getByTargetId() filters correctly
 *      10j. clear() resets buffer and counter
 *      10k. Broken subscriber does not block other subscribers
 *  11. No rendering/command-pipeline dependency (module imports only pure TS)
 *  12. extractCanonicalKey returns only the three discriminant fields
 *  13. normalizeBuildingIntent/normalizeRoomIntent/normalizeAgentIntent all throw
 *      on unknown discriminator
 *
 * Test ID scheme: iie-NN
 */

import { describe, it, expect, vi } from "vitest";
import {
  // Entity type helpers
  INTERACTION_TARGET_ENTITY_TYPES,
  INTERACTION_GESTURE_TYPES,
  INTERACTION_LAYERS,
  isInteractionTargetEntityType,
  isInteractionGestureType,
  isInteractionLayer,
  // Factory
  makeInteractionIntentEntity,
  // Guard
  isInteractionIntentEntity,
  // Canonical key
  extractCanonicalKey,
  // Types
  type InteractionIntentEntity,
  type InteractionTargetEntityType,
  type InteractionGestureType,
  type InteractionLayer,
} from "../interaction-intent-entity.js";

import {
  // Per-layer normalizers
  normalizeBuildingIntent,
  normalizeRoomIntent,
  normalizeAgentIntent,
  normalizeFixtureIntent,
  // Generic dispatcher
  dispatchIntent,
  // Dispatcher class
  InteractionIntentDispatcher,
  createInteractionIntentDispatcher,
} from "../interaction-intent-dispatcher.js";

// ── Layer-specific intent factories (for normalizer tests) ──────────────────
import {
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
} from "../building-interaction-intents.js";

import {
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomUnhoveredIntent,
  makeRoomContextMenuIntent,
} from "../room-interaction-intents.js";

import {
  makeAgentClickedIntent,
  makeAgentHoveredIntent,
  makeAgentUnhoveredIntent,
  makeAgentContextMenuIntent,
} from "../agent-interaction-intents.js";

import {
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureMenuAnchorOpenedIntent,
} from "../fixture-interaction-intents.js";

// ── Shared test constants ───────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000;
const SESSION = "test-session-iie";
const WORLD_POS = { x: 1, y: 0, z: 2 };
const SCREEN_POS = { x: 320, y: 240 };

/** Minimal valid entity input. */
function makeMinimalInput(
  overrides: Partial<Parameters<typeof makeInteractionIntentEntity>[0]> = {},
): Parameters<typeof makeInteractionIntentEntity>[0] {
  return {
    target_entity_type: "building",
    gesture_type:       "click",
    target_id:          "building-hq",
    ts:                 BASE_TS,
    layer:              "domain",
    source_payload:     { dummy: true },
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Three canonical discriminant fields
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-01 — three canonical discriminant fields", () => {
  it("iie-01a: factory produces target_entity_type", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({ target_entity_type: "room" }));
    expect(e.target_entity_type).toBe("room");
  });

  it("iie-01b: factory produces gesture_type", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({ gesture_type: "hover" }));
    expect(e.gesture_type).toBe("hover");
  });

  it("iie-01c: factory produces target_id", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({ target_id: "agent-researcher-01" }));
    expect(e.target_id).toBe("agent-researcher-01");
  });

  it("iie-01d: all three canonical fields are present on every entity", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput());
    expect(typeof e.target_entity_type).toBe("string");
    expect(typeof e.gesture_type).toBe("string");
    expect(typeof e.target_id).toBe("string");
    expect(e.target_id.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — Type guard
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-02 — isInteractionIntentEntity type guard", () => {
  it("iie-02a: accepts a valid entity from the factory", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput());
    expect(isInteractionIntentEntity(e)).toBe(true);
  });

  it("iie-02b: rejects null", () => {
    expect(isInteractionIntentEntity(null)).toBe(false);
  });

  it("iie-02c: rejects plain object missing required fields", () => {
    expect(isInteractionIntentEntity({})).toBe(false);
    expect(isInteractionIntentEntity({ target_entity_type: "room" })).toBe(false);
  });

  it("iie-02d: rejects object with invalid target_entity_type", () => {
    const bad = {
      target_entity_type: "spaceship", // not in set
      gesture_type: "click",
      target_id: "x",
      intent_id: "ii-1",
      ts: BASE_TS,
      ts_iso: new Date(BASE_TS).toISOString(),
      layer: "domain",
      source_payload: {},
    };
    expect(isInteractionIntentEntity(bad)).toBe(false);
  });

  it("iie-02e: rejects object with invalid gesture_type", () => {
    const bad = {
      target_entity_type: "building",
      gesture_type: "swipe", // not in set
      target_id: "hq",
      intent_id: "ii-1",
      ts: BASE_TS,
      ts_iso: new Date(BASE_TS).toISOString(),
      layer: "domain",
      source_payload: {},
    };
    expect(isInteractionIntentEntity(bad)).toBe(false);
  });

  it("iie-02f: rejects object with empty target_id", () => {
    const bad = {
      target_entity_type: "building",
      gesture_type: "click",
      target_id: "", // empty string
      intent_id: "ii-1",
      ts: BASE_TS,
      ts_iso: new Date(BASE_TS).toISOString(),
      layer: "domain",
      source_payload: {},
    };
    expect(isInteractionIntentEntity(bad)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — All target_entity_type values
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-03 — all target_entity_type values", () => {
  const allTypes: InteractionTargetEntityType[] = ["building", "room", "agent", "fixture"];

  it("iie-03a: INTERACTION_TARGET_ENTITY_TYPES set contains all four types", () => {
    for (const t of allTypes) {
      expect(INTERACTION_TARGET_ENTITY_TYPES.has(t)).toBe(true);
    }
  });

  it("iie-03b: isInteractionTargetEntityType narrows correctly", () => {
    for (const t of allTypes) {
      expect(isInteractionTargetEntityType(t)).toBe(true);
    }
    expect(isInteractionTargetEntityType("spaceship")).toBe(false);
    expect(isInteractionTargetEntityType("")).toBe(false);
  });

  it("iie-03c: factory accepts each target_entity_type", () => {
    for (const t of allTypes) {
      const e = makeInteractionIntentEntity(makeMinimalInput({ target_entity_type: t }));
      expect(e.target_entity_type).toBe(t);
      expect(isInteractionIntentEntity(e)).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — All gesture_type values
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-04 — all gesture_type values", () => {
  const allGestures: InteractionGestureType[] = [
    "click", "hover", "unhover", "context_menu", "drag",
  ];

  it("iie-04a: INTERACTION_GESTURE_TYPES set contains all five gesture types", () => {
    for (const g of allGestures) {
      expect(INTERACTION_GESTURE_TYPES.has(g)).toBe(true);
    }
  });

  it("iie-04b: isInteractionGestureType narrows correctly", () => {
    for (const g of allGestures) {
      expect(isInteractionGestureType(g)).toBe(true);
    }
    expect(isInteractionGestureType("swipe")).toBe(false);
    expect(isInteractionGestureType("")).toBe(false);
  });

  it("iie-04c: factory accepts each gesture_type", () => {
    for (const g of allGestures) {
      const e = makeInteractionIntentEntity(makeMinimalInput({ gesture_type: g }));
      expect(e.gesture_type).toBe(g);
      expect(isInteractionIntentEntity(e)).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — All layer values
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-05 — all layer values", () => {
  const allLayers: InteractionLayer[] = ["domain", "infrastructure", "meta"];

  it("iie-05a: INTERACTION_LAYERS set contains all three layers", () => {
    for (const l of allLayers) {
      expect(INTERACTION_LAYERS.has(l)).toBe(true);
    }
  });

  it("iie-05b: isInteractionLayer narrows correctly", () => {
    for (const l of allLayers) {
      expect(isInteractionLayer(l)).toBe(true);
    }
    expect(isInteractionLayer("physics")).toBe(false);
    expect(isInteractionLayer("")).toBe(false);
  });

  it("iie-05c: factory accepts each layer", () => {
    for (const l of allLayers) {
      const e = makeInteractionIntentEntity(makeMinimalInput({ layer: l }));
      expect(e.layer).toBe(l);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 — Immutability
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-06 — entity immutability", () => {
  it("iie-06a: produced entity is frozen (record transparency invariant)", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput());
    expect(Object.isFrozen(e)).toBe(true);
  });

  it("iie-06b: mutating a field on a frozen entity throws in strict mode", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput());
    expect(() => {
      // TypeScript prevents this at compile time; test runtime enforcement.
      (e as Record<string, unknown>)["target_id"] = "mutated";
    }).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 — JSON round-trip (record transparency)
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-07 — JSON round-trip fidelity", () => {
  it("iie-07a: entity survives JSON.stringify + JSON.parse and still validates", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({
      session_id:     SESSION,
      world_position: WORLD_POS,
    }));
    const json   = JSON.stringify(e);
    const parsed = JSON.parse(json) as unknown;
    expect(isInteractionIntentEntity(parsed)).toBe(true);
  });

  it("iie-07b: all three canonical fields survive the round-trip", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({
      target_entity_type: "agent",
      gesture_type:       "context_menu",
      target_id:          "researcher-01",
    }));
    const parsed = JSON.parse(JSON.stringify(e)) as InteractionIntentEntity;
    expect(parsed.target_entity_type).toBe("agent");
    expect(parsed.gesture_type).toBe("context_menu");
    expect(parsed.target_id).toBe("researcher-01");
  });

  it("iie-07c: source_payload survives round-trip intact", () => {
    const payload = { intent: "BUILDING_CLICKED", building_id: "hq", ts: BASE_TS };
    const e = makeInteractionIntentEntity(makeMinimalInput({ source_payload: payload }));
    const parsed = JSON.parse(JSON.stringify(e)) as InteractionIntentEntity;
    expect(parsed.source_payload).toEqual(payload);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 — Per-layer normalizers
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-08a — normalizeBuildingIntent (domain layer → building)", () => {
  it("iie-08a-1: BUILDING_CLICKED → target_entity_type=building, gesture_type=click", () => {
    const intent = makeBuildingClickedIntent({
      building_id:    "hq",
      drill_level:    "building",
      world_position: WORLD_POS,
      floor_count:    2,
      ts:             BASE_TS,
      session_id:     SESSION,
    });
    const entity = normalizeBuildingIntent(intent);
    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_id).toBe("hq");
    expect(entity.layer).toBe("domain");
    expect(entity.ts).toBe(BASE_TS);
    expect(entity.session_id).toBe(SESSION);
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("iie-08a-2: BUILDING_HOVERED → gesture_type=hover", () => {
    const intent = makeBuildingHoveredIntent({
      building_id:    "hq",
      world_position: WORLD_POS,
      ts:             BASE_TS,
    });
    const entity = normalizeBuildingIntent(intent);
    expect(entity.gesture_type).toBe("hover");
    expect(entity.target_entity_type).toBe("building");
  });

  it("iie-08a-3: BUILDING_UNHOVERED → gesture_type=unhover", () => {
    const intent = makeBuildingUnhoveredIntent({ building_id: "hq", ts: BASE_TS });
    const entity = normalizeBuildingIntent(intent);
    expect(entity.gesture_type).toBe("unhover");
  });

  it("iie-08a-4: BUILDING_CONTEXT_MENU → gesture_type=context_menu", () => {
    const intent = makeBuildingContextMenuIntent({
      building_id:     "hq",
      world_position:  WORLD_POS,
      screen_position: SCREEN_POS,
      drill_level:     "building",
      ts:              BASE_TS,
    });
    const entity = normalizeBuildingIntent(intent);
    expect(entity.gesture_type).toBe("context_menu");
  });

  it("iie-08a-5: source_payload is set to the original building intent", () => {
    const intent = makeBuildingClickedIntent({
      building_id:    "hq",
      drill_level:    "building",
      world_position: null,
      floor_count:    1,
      ts:             BASE_TS,
    });
    const entity = normalizeBuildingIntent(intent);
    expect(entity.source_payload).toMatchObject({ intent: "BUILDING_CLICKED", building_id: "hq" });
  });

  it("iie-08a-6: sessionOverride replaces source intent session_id", () => {
    const intent = makeBuildingClickedIntent({
      building_id:    "hq",
      drill_level:    "floor",
      world_position: null,
      floor_count:    1,
      ts:             BASE_TS,
      session_id:     "original-session",
    });
    const entity = normalizeBuildingIntent(intent, "override-session");
    expect(entity.session_id).toBe("override-session");
  });
});

describe("iie-08b — normalizeRoomIntent (infrastructure layer → room)", () => {
  it("iie-08b-1: ROOM_CLICKED → target_entity_type=room, gesture_type=click", () => {
    const intent = makeRoomClickedIntent({
      room_id:        "control-01",
      room_type:      "control",
      floor:          0,
      drill_level:    "floor",
      world_position: WORLD_POS,
      agent_count:    3,
      ts:             BASE_TS,
      session_id:     SESSION,
    });
    const entity = normalizeRoomIntent(intent);
    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_id).toBe("control-01");
    expect(entity.layer).toBe("infrastructure");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("iie-08b-2: ROOM_HOVERED → gesture_type=hover", () => {
    const intent = makeRoomHoveredIntent({
      room_id:        "ops",
      room_type:      "office",
      floor:          1,
      world_position: WORLD_POS,
      ts:             BASE_TS,
    });
    const entity = normalizeRoomIntent(intent);
    expect(entity.gesture_type).toBe("hover");
    expect(entity.target_entity_type).toBe("room");
  });

  it("iie-08b-3: ROOM_UNHOVERED → gesture_type=unhover", () => {
    const intent = makeRoomUnhoveredIntent({
      room_id:   "ops",
      room_type: "office",
      floor:     1,
      ts:        BASE_TS,
    });
    const entity = normalizeRoomIntent(intent);
    expect(entity.gesture_type).toBe("unhover");
  });

  it("iie-08b-4: ROOM_CONTEXT_MENU → gesture_type=context_menu", () => {
    const intent = makeRoomContextMenuIntent({
      room_id:         "ops",
      room_type:       "office",
      floor:           0,
      world_position:  WORLD_POS,
      screen_position: SCREEN_POS,
      drill_level:     "floor",
      ts:              BASE_TS,
    });
    const entity = normalizeRoomIntent(intent);
    expect(entity.gesture_type).toBe("context_menu");
  });

  it("iie-08b-5: source_payload retains original room intent", () => {
    const intent = makeRoomClickedIntent({
      room_id:        "lab-01",
      room_type:      "lab",
      floor:          2,
      drill_level:    "room",
      world_position: null,
      agent_count:    0,
      ts:             BASE_TS,
    });
    const entity = normalizeRoomIntent(intent);
    expect(entity.source_payload).toMatchObject({ intent: "ROOM_CLICKED", room_id: "lab-01" });
  });
});

describe("iie-08c — normalizeAgentIntent (meta layer → agent)", () => {
  it("iie-08c-1: AGENT_CLICKED → target_entity_type=agent, gesture_type=click", () => {
    const intent = makeAgentClickedIntent({
      agentId:       "researcher-01",
      agentName:     "Researcher",
      agentRole:     "researcher",
      agentStatus:   "idle",
      roomId:        "lab-01",
      worldPosition: WORLD_POS,
      wasSelected:   false,
      isDrillTarget: false,
      ts:            BASE_TS,
      session_id:    SESSION,
    });
    const entity = normalizeAgentIntent(intent);
    expect(entity.target_entity_type).toBe("agent");
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_id).toBe("researcher-01");
    expect(entity.layer).toBe("meta");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("iie-08c-2: AGENT_HOVERED → gesture_type=hover", () => {
    const intent = makeAgentHoveredIntent({
      agentId:       "manager-01",
      agentName:     "Manager",
      agentRole:     "manager",
      agentStatus:   "active",
      roomId:        "control-01",
      worldPosition: null,
      ts:            BASE_TS,
    });
    const entity = normalizeAgentIntent(intent);
    expect(entity.gesture_type).toBe("hover");
    expect(entity.target_entity_type).toBe("agent");
  });

  it("iie-08c-3: AGENT_UNHOVERED → gesture_type=unhover", () => {
    const intent = makeAgentUnhoveredIntent({
      agentId:     "manager-01",
      agentRole:   "manager",
      agentStatus: "active",
      roomId:      "control-01",
      ts:          BASE_TS,
    });
    const entity = normalizeAgentIntent(intent);
    expect(entity.gesture_type).toBe("unhover");
  });

  it("iie-08c-4: AGENT_CONTEXT_MENU → gesture_type=context_menu", () => {
    const intent = makeAgentContextMenuIntent({
      agentId:        "manager-01",
      agentName:      "Manager",
      agentRole:      "manager",
      agentStatus:    "idle",
      roomId:         "control-01",
      worldPosition:  null,
      screen_position: SCREEN_POS,
      wasSelected:    false,
      ts:             BASE_TS,
    });
    const entity = normalizeAgentIntent(intent);
    expect(entity.gesture_type).toBe("context_menu");
  });
});

describe("iie-08d — normalizeFixtureIntent (fixture layer → fixture)", () => {
  it("iie-08d-1: FIXTURE_BUTTON_CLICKED → target_entity_type=fixture, gesture_type=click", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId:     "btn-spawn-01",
      fixtureKind:   "button",
      entityRef:     { entityType: "agent", entityId: "researcher-01" },
      worldPosition: WORLD_POS,
      ts:            BASE_TS,
      session_id:    SESSION,
    });
    const entity = normalizeFixtureIntent(intent);
    expect(entity.target_entity_type).toBe("fixture");
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_id).toBe("btn-spawn-01");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("iie-08d-2: FIXTURE_BUTTON_HOVERED → gesture_type=hover", () => {
    const intent = makeFixtureButtonHoveredIntent({
      fixtureId:     "btn-01",
      fixtureKind:   "button",
      entityRef:     { entityType: "room", entityId: "lab-01" },
      worldPosition: WORLD_POS,
      ts:            BASE_TS,
    });
    const entity = normalizeFixtureIntent(intent);
    expect(entity.gesture_type).toBe("hover");
  });

  it("iie-08d-3: FIXTURE_BUTTON_UNHOVERED → gesture_type=unhover", () => {
    const intent = makeFixtureButtonUnhoveredIntent({
      fixtureId:   "btn-01",
      fixtureKind: "button",
      entityRef:   { entityType: "room", entityId: "lab-01" },
      ts:          BASE_TS,
    });
    const entity = normalizeFixtureIntent(intent);
    expect(entity.gesture_type).toBe("unhover");
  });

  it("iie-08d-4: FIXTURE_HANDLE_DRAG_START → gesture_type=drag", () => {
    const intent = makeFixtureHandleDragStartIntent({
      fixtureId:        "handle-01",
      fixtureKind:      "handle",
      entityRef:        { entityType: "task", entityId: "task-01" },
      worldPosition:    WORLD_POS,
      dragStartPosition: WORLD_POS,
      ts:               BASE_TS,
    });
    const entity = normalizeFixtureIntent(intent);
    expect(entity.gesture_type).toBe("drag");
  });

  it("iie-08d-5: FIXTURE_MENU_ANCHOR_OPENED → gesture_type=click", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent({
      fixtureId:     "menu-01",
      fixtureKind:   "menu_anchor",
      entityRef:     { entityType: "agent", entityId: "manager-01" },
      worldPosition: WORLD_POS,
      screen_position: SCREEN_POS,
      ts:            BASE_TS,
    });
    const entity = normalizeFixtureIntent(intent);
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_entity_type).toBe("fixture");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 — Generic dispatchIntent function
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-09 — generic dispatchIntent routes correctly", () => {
  it("iie-09a: routes BUILDING_* to building normalizer", () => {
    const intent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    });
    const entity = dispatchIntent(intent);
    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("click");
  });

  it("iie-09b: routes ROOM_* to room normalizer", () => {
    const intent = makeRoomHoveredIntent({
      room_id: "r01", room_type: "lab", floor: 0,
      world_position: null, ts: BASE_TS,
    });
    const entity = dispatchIntent(intent);
    expect(entity.target_entity_type).toBe("room");
    expect(entity.gesture_type).toBe("hover");
  });

  it("iie-09c: routes AGENT_* to agent normalizer", () => {
    const intent = makeAgentContextMenuIntent({
      agentId: "a01", agentName: "A", agentRole: "implementer",
      agentStatus: "idle", roomId: "r01", worldPosition: null,
      screen_position: SCREEN_POS, wasSelected: false, ts: BASE_TS,
    });
    const entity = dispatchIntent(intent);
    expect(entity.target_entity_type).toBe("agent");
    expect(entity.gesture_type).toBe("context_menu");
    expect(entity.target_id).toBe("a01");
  });

  it("iie-09d: routes FIXTURE_* to fixture normalizer", () => {
    const intent = makeFixtureButtonClickedIntent({
      fixtureId: "btn-01", fixtureKind: "button",
      entityRef: { entityType: "agent", entityId: "a01" },
      worldPosition: WORLD_POS, ts: BASE_TS,
    });
    const entity = dispatchIntent(intent);
    expect(entity.target_entity_type).toBe("fixture");
    expect(entity.gesture_type).toBe("click");
  });

  it("iie-09e: sessionOverride is forwarded to the normalizer", () => {
    const intent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS, session_id: "orig",
    });
    const entity = dispatchIntent(intent, "override");
    expect(entity.session_id).toBe("override");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 — InteractionIntentDispatcher class
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-10 — InteractionIntentDispatcher class", () => {
  it("iie-10a: dispatch() returns canonical entity with correct fields", () => {
    const dispatcher = new InteractionIntentDispatcher();
    const intent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    });
    const entity = dispatcher.dispatch(intent);
    expect(entity.target_entity_type).toBe("building");
    expect(entity.gesture_type).toBe("click");
    expect(entity.target_id).toBe("hq");
    expect(isInteractionIntentEntity(entity)).toBe(true);
  });

  it("iie-10b: buffer grows and evicts at maxBuffer", () => {
    const dispatcher = new InteractionIntentDispatcher({ maxBuffer: 3 });
    const makeIntent = () => makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    });
    dispatcher.dispatch(makeIntent()); // 1
    dispatcher.dispatch(makeIntent()); // 2
    dispatcher.dispatch(makeIntent()); // 3
    expect(dispatcher.buffer.length).toBe(3);
    dispatcher.dispatch(makeIntent()); // 4 — evicts #1
    expect(dispatcher.buffer.length).toBe(3);
  });

  it("iie-10c: totalDispatched increments monotonically (survives eviction)", () => {
    const dispatcher = new InteractionIntentDispatcher({ maxBuffer: 2 });
    const makeIntent = () => makeRoomClickedIntent({
      room_id: "r01", room_type: "lab", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS,
    });
    dispatcher.dispatch(makeIntent());
    dispatcher.dispatch(makeIntent());
    dispatcher.dispatch(makeIntent());
    expect(dispatcher.totalDispatched).toBe(3);
  });

  it("iie-10d: lastEntity reflects most-recently dispatched", () => {
    const dispatcher = new InteractionIntentDispatcher();
    const building = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    });
    const room = makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 1, ts: BASE_TS + 1,
    });
    dispatcher.dispatch(building);
    dispatcher.dispatch(room);
    expect(dispatcher.lastEntity?.target_entity_type).toBe("room");
    expect(dispatcher.lastEntity?.target_id).toBe("ops");
  });

  it("iie-10e: subscribe() notifies on each dispatch", () => {
    const dispatcher = new InteractionIntentDispatcher();
    const received: InteractionIntentEntity[] = [];
    dispatcher.subscribe((e) => received.push(e));

    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS + 1,
    }));

    expect(received).toHaveLength(2);
    expect(received[0]?.target_entity_type).toBe("building");
    expect(received[1]?.target_entity_type).toBe("room");
  });

  it("iie-10f: unsubscribe() stops notifications", () => {
    const dispatcher = new InteractionIntentDispatcher();
    const received: InteractionIntentEntity[] = [];
    const unsub = dispatcher.subscribe((e) => received.push(e));

    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    expect(received).toHaveLength(1);

    unsub();
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS + 1,
    }));
    expect(received).toHaveLength(1); // no new notifications after unsub
  });

  it("iie-10g: getByEntityType() filters correctly", () => {
    const dispatcher = new InteractionIntentDispatcher();
    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS + 1,
    }));
    dispatcher.dispatch(makeBuildingHoveredIntent({
      building_id: "hq", world_position: null, ts: BASE_TS + 2,
    }));

    const buildingEntities = dispatcher.getByEntityType("building");
    expect(buildingEntities.length).toBe(2);
    expect(buildingEntities.every((e) => e.target_entity_type === "building")).toBe(true);

    const roomEntities = dispatcher.getByEntityType("room");
    expect(roomEntities.length).toBe(1);
    expect(roomEntities[0]?.target_id).toBe("ops");
  });

  it("iie-10h: getByGesture() filters correctly", () => {
    const dispatcher = new InteractionIntentDispatcher();
    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    dispatcher.dispatch(makeBuildingHoveredIntent({
      building_id: "hq", world_position: null, ts: BASE_TS + 1,
    }));
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS + 2,
    }));

    const clickEntities = dispatcher.getByGesture("click");
    expect(clickEntities.length).toBe(2);
    expect(clickEntities.every((e) => e.gesture_type === "click")).toBe(true);

    const hoverEntities = dispatcher.getByGesture("hover");
    expect(hoverEntities.length).toBe(1);
  });

  it("iie-10i: getByTargetId() filters correctly", () => {
    const dispatcher = new InteractionIntentDispatcher();
    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    dispatcher.dispatch(makeBuildingHoveredIntent({
      building_id: "hq", world_position: null, ts: BASE_TS + 1,
    }));
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "ops", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 0, ts: BASE_TS + 2,
    }));

    const hqEntities = dispatcher.getByTargetId("hq");
    expect(hqEntities.length).toBe(2);
    expect(hqEntities.every((e) => e.target_id === "hq")).toBe(true);
  });

  it("iie-10j: clear() resets buffer and counter", () => {
    const dispatcher = new InteractionIntentDispatcher();
    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    }));
    expect(dispatcher.totalDispatched).toBe(1);
    expect(dispatcher.buffer.length).toBe(1);

    dispatcher.clear();
    expect(dispatcher.totalDispatched).toBe(0);
    expect(dispatcher.buffer.length).toBe(0);
    expect(dispatcher.lastEntity).toBeNull();
  });

  it("iie-10k: broken subscriber does not block other subscribers", () => {
    const dispatcher = new InteractionIntentDispatcher();
    const received: string[] = [];

    dispatcher.subscribe(() => { throw new Error("broken subscriber"); });
    dispatcher.subscribe((e) => received.push(e.target_entity_type));

    // Should not throw; the good subscriber should still run
    expect(() =>
      dispatcher.dispatch(makeBuildingClickedIntent({
        building_id: "hq", drill_level: "building",
        world_position: null, floor_count: 1, ts: BASE_TS,
      })),
    ).not.toThrow();
    expect(received).toEqual(["building"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11 — No rendering / command-pipeline dependency
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-11 — independence from rendering and command pipeline", () => {
  it("iie-11a: all operations complete in Node.js without React/Three.js", () => {
    // If this test file can be imported and run, the module has no browser deps.
    // Assert by exercising the full dispatch pipeline in isolation.
    const dispatcher = createInteractionIntentDispatcher();
    const results: InteractionIntentEntity[] = [];
    dispatcher.subscribe((e) => results.push(e));

    dispatcher.dispatch(makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: { x: 0, y: 0, z: 0 }, floor_count: 1, ts: BASE_TS,
    }));
    dispatcher.dispatch(makeRoomClickedIntent({
      room_id: "r01", room_type: "control", floor: 0,
      drill_level: "floor", world_position: null, agent_count: 2, ts: BASE_TS + 100,
    }));
    dispatcher.dispatch(makeAgentClickedIntent({
      agentId: "a01", agentName: "Alice", agentRole: "researcher",
      agentStatus: "active", roomId: "r01", worldPosition: null,
      wasSelected: false, isDrillTarget: false, ts: BASE_TS + 200,
    }));

    expect(results).toHaveLength(3);
    expect(results[0]?.target_entity_type).toBe("building");
    expect(results[1]?.target_entity_type).toBe("room");
    expect(results[2]?.target_entity_type).toBe("agent");

    // All entities are valid according to the type guard
    for (const entity of results) {
      expect(isInteractionIntentEntity(entity)).toBe(true);
    }
  });

  it("iie-11b: entities are JSON-serialisable (no non-serialisable fields)", () => {
    const dispatcher = createInteractionIntentDispatcher();
    dispatcher.dispatch(makeAgentClickedIntent({
      agentId: "a01", agentName: "Alice", agentRole: "researcher",
      agentStatus: "idle", roomId: "r01", worldPosition: WORLD_POS,
      wasSelected: false, isDrillTarget: false, ts: BASE_TS,
    }));
    const entity = dispatcher.lastEntity!;
    expect(() => JSON.stringify(entity)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(entity)) as unknown;
    expect(isInteractionIntentEntity(parsed)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12 — extractCanonicalKey
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-12 — extractCanonicalKey", () => {
  it("iie-12a: returns only the three discriminant fields", () => {
    const e = makeInteractionIntentEntity(makeMinimalInput({
      target_entity_type: "agent",
      gesture_type:       "hover",
      target_id:          "researcher-01",
    }));
    const key = extractCanonicalKey(e);
    expect(key.target_entity_type).toBe("agent");
    expect(key.gesture_type).toBe("hover");
    expect(key.target_id).toBe("researcher-01");
    // Should NOT include other fields
    expect("intent_id" in key).toBe(false);
    expect("ts" in key).toBe(false);
    expect("layer" in key).toBe(false);
    expect("source_payload" in key).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13 — Error handling in normalizers
// ═════════════════════════════════════════════════════════════════════════════

describe("iie-13 — normalizer error handling", () => {
  it("iie-13a: normalizeBuildingIntent throws on unknown discriminator", () => {
    const badIntent = { intent: "UNKNOWN_KIND", building_id: "hq", ts: BASE_TS } as never;
    expect(() => normalizeBuildingIntent(badIntent)).toThrow(
      /Unknown intent discriminator "UNKNOWN_KIND"/,
    );
  });

  it("iie-13b: normalizeRoomIntent throws on unknown discriminator", () => {
    const badIntent = { intent: "BOGUS", room_id: "r01", ts: BASE_TS } as never;
    expect(() => normalizeRoomIntent(badIntent)).toThrow(
      /Unknown intent discriminator "BOGUS"/,
    );
  });

  it("iie-13c: normalizeAgentIntent throws on unknown discriminator", () => {
    const badIntent = { intent: "ALIEN", agentId: "a01", ts: BASE_TS } as never;
    expect(() => normalizeAgentIntent(badIntent)).toThrow(
      /Unknown intent discriminator "ALIEN"/,
    );
  });

  it("iie-13d: dispatchIntent throws on completely unknown discriminator", () => {
    const badIntent = { intent: "TOTALLY_UNKNOWN" } as never;
    expect(() => dispatchIntent(badIntent)).toThrow(
      /Unrecognized intent discriminator "TOTALLY_UNKNOWN"/,
    );
  });
});
