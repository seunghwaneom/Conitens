/**
 * spatial-ui-fixture.test.ts — Unit tests for Sub-AC 7a.
 *
 * Validates the spatial UI fixture attachment system:
 *   - fixture-interaction-intents.ts: types, factories, guards, geometry helpers
 *   - SpatialUiFixture.tsx: pure helpers (no React / Three.js needed)
 *
 * All tests run in pure Node.js (no canvas, no DOM, no Three.js context)
 * because the tested helpers are fully decoupled from React rendering.
 */

import { describe, it, expect } from "vitest";

// ── fixture-interaction-intents imports ──────────────────────────────────────

import {
  // Discriminators
  FIXTURE_INTENT_KINDS,
  FIXTURE_INTENT_GUARDS,
  isFixtureInteractionIntentKind,
  // Entity ref helpers
  isSpatialFixtureKind,
  SPATIAL_FIXTURE_KIND_SET,
  SPATIAL_FIXTURE_KINDS,
  // Factories
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureHandleDragMoveIntent,
  makeFixtureHandleDragEndIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
  // Type guards
  isFixtureButtonClickedIntent,
  isFixtureButtonHoveredIntent,
  isFixtureButtonUnhoveredIntent,
  isFixtureHandleDragStartIntent,
  isFixtureHandleDragMoveIntent,
  isFixtureHandleDragEndIntent,
  isFixtureMenuAnchorOpenedIntent,
  isFixtureMenuAnchorClosedIntent,
  isFixtureInteractionIntent,
  // Geometry helpers
  computeFixtureWorldPos,
  computeFixtureButtonOffset,
  extractScreenPosition,
  type FixtureEntityRef,
  type FixtureWorldPosition,
  type FixtureButtonClickedPayload,
  type FixtureHandleDragEndPayload,
  type FixtureMenuAnchorOpenedPayload,
} from "../fixture-interaction-intents.js";

// ── SpatialUiFixture pure-helper imports ────────────────────────────────────

import {
  computeEntityButtonBaseY,
  computeFixtureLocalOffset,
  computeFixtureEmissiveIntensity,
  FIXTURE_BUTTON_SPACING,
  FIXTURE_IDLE_EMISSIVE,
  FIXTURE_HOVERED_EMISSIVE,
  FIXTURE_ACTIVE_EMISSIVE,
  SPATIAL_FIXTURE_RENDER_ORDER,
} from "../SpatialUiFixture.js";

// ── Fixtures (shared test data) ──────────────────────────────────────────────

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

const origin: FixtureWorldPosition = { x: 1, y: 0, z: 2 };

const buttonPayload: FixtureButtonClickedPayload = {
  fixtureId: "test-btn",
  fixtureKind: "button",
  entityRef: agentRef,
  actionType: "click",
  worldPosition: origin,
  ts: 1000,
};

const dragEndPayload: FixtureHandleDragEndPayload = {
  fixtureId: "test-handle",
  fixtureKind: "handle",
  entityRef: taskRef,
  actionType: "drag_end",
  dragOriginWorld: { x: 0, y: 0, z: 0 },
  dragEndWorld: { x: 1, y: 0, z: 1 },
  ts: 2000,
};

const menuPayload: FixtureMenuAnchorOpenedPayload = {
  fixtureId: "test-anchor",
  fixtureKind: "menu_anchor",
  entityRef: roomRef,
  actionType: "menu_open",
  worldPosition: { x: 3, y: 1, z: 0 },
  screen_position: { x: 200, y: 150 },
  ts: 3000,
};

// ── 1. Discriminator / membership tests ─────────────────────────────────────

describe("FIXTURE_INTENT_KINDS", () => {
  it("contains all 8 intent kinds", () => {
    expect(FIXTURE_INTENT_KINDS.size).toBe(8);
  });

  it("contains button intents", () => {
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_BUTTON_CLICKED")).toBe(true);
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_BUTTON_HOVERED")).toBe(true);
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_BUTTON_UNHOVERED")).toBe(true);
  });

  it("contains handle drag intents", () => {
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_HANDLE_DRAG_START")).toBe(true);
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_HANDLE_DRAG_MOVE")).toBe(true);
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_HANDLE_DRAG_END")).toBe(true);
  });

  it("contains menu anchor intents", () => {
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_MENU_ANCHOR_OPENED")).toBe(true);
    expect(FIXTURE_INTENT_KINDS.has("FIXTURE_MENU_ANCHOR_CLOSED")).toBe(true);
  });

  it("isFixtureInteractionIntentKind returns true for valid kinds", () => {
    expect(isFixtureInteractionIntentKind("FIXTURE_BUTTON_CLICKED")).toBe(true);
    expect(isFixtureInteractionIntentKind("FIXTURE_HANDLE_DRAG_END")).toBe(true);
    expect(isFixtureInteractionIntentKind("FIXTURE_MENU_ANCHOR_OPENED")).toBe(true);
  });

  it("isFixtureInteractionIntentKind returns false for unknown kinds", () => {
    expect(isFixtureInteractionIntentKind("ROOM_CLICKED")).toBe(false);
    expect(isFixtureInteractionIntentKind("")).toBe(false);
    expect(isFixtureInteractionIntentKind("BUILDING_HOVERED")).toBe(false);
  });
});

// ── 2. SpatialFixtureKind tests ──────────────────────────────────────────────

describe("SpatialFixtureKind", () => {
  it("SPATIAL_FIXTURE_KINDS has exactly 3 kinds", () => {
    expect(SPATIAL_FIXTURE_KINDS).toHaveLength(3);
  });

  it("SPATIAL_FIXTURE_KIND_SET contains button, handle, menu_anchor", () => {
    expect(SPATIAL_FIXTURE_KIND_SET.has("button")).toBe(true);
    expect(SPATIAL_FIXTURE_KIND_SET.has("handle")).toBe(true);
    expect(SPATIAL_FIXTURE_KIND_SET.has("menu_anchor")).toBe(true);
  });

  it("isSpatialFixtureKind returns true for valid kinds", () => {
    expect(isSpatialFixtureKind("button")).toBe(true);
    expect(isSpatialFixtureKind("handle")).toBe(true);
    expect(isSpatialFixtureKind("menu_anchor")).toBe(true);
  });

  it("isSpatialFixtureKind returns false for unknown kinds", () => {
    expect(isSpatialFixtureKind("slider")).toBe(false);
    expect(isSpatialFixtureKind("dashboard_panel")).toBe(false);
    expect(isSpatialFixtureKind("")).toBe(false);
  });
});

// ── 3. Factory function tests ─────────────────────────────────────────────────

describe("makeFixtureButtonClickedIntent", () => {
  it("produces a FIXTURE_BUTTON_CLICKED intent with correct fields", () => {
    const intent = makeFixtureButtonClickedIntent(buttonPayload);
    expect(intent.intent).toBe("FIXTURE_BUTTON_CLICKED");
    expect(intent.fixtureId).toBe("test-btn");
    expect(intent.fixtureKind).toBe("button");
    expect(intent.entityRef).toEqual(agentRef);
    expect(intent.actionType).toBe("click");
    expect(intent.worldPosition).toEqual(origin);
    expect(intent.ts).toBe(1000);
  });

  it("carries the entityRef for the parent agent", () => {
    const intent = makeFixtureButtonClickedIntent(buttonPayload);
    expect(intent.entityRef.entityType).toBe("agent");
    expect(intent.entityRef.entityId).toBe("agent-manager-1");
  });
});

describe("makeFixtureButtonHoveredIntent", () => {
  it("produces FIXTURE_BUTTON_HOVERED with actionType hover_enter", () => {
    const intent = makeFixtureButtonHoveredIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "hover_enter",
      worldPosition: origin,
      ts: 100,
    });
    expect(intent.intent).toBe("FIXTURE_BUTTON_HOVERED");
    expect(intent.actionType).toBe("hover_enter");
  });
});

describe("makeFixtureButtonUnhoveredIntent", () => {
  it("produces FIXTURE_BUTTON_UNHOVERED with actionType hover_exit", () => {
    const intent = makeFixtureButtonUnhoveredIntent({
      fixtureId: "btn",
      fixtureKind: "button",
      entityRef: agentRef,
      actionType: "hover_exit",
      worldPosition: origin,
      ts: 101,
    });
    expect(intent.intent).toBe("FIXTURE_BUTTON_UNHOVERED");
    expect(intent.actionType).toBe("hover_exit");
  });
});

describe("makeFixtureHandleDragStartIntent", () => {
  it("produces FIXTURE_HANDLE_DRAG_START with drag_start actionType", () => {
    const intent = makeFixtureHandleDragStartIntent({
      fixtureId: "handle-1",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_start",
      dragOriginWorld: { x: 0, y: 0, z: 0 },
      ts: 200,
    });
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_START");
    expect(intent.actionType).toBe("drag_start");
    expect(intent.entityRef.entityType).toBe("task");
  });
});

describe("makeFixtureHandleDragMoveIntent", () => {
  it("carries drag delta", () => {
    const intent = makeFixtureHandleDragMoveIntent({
      fixtureId: "handle-1",
      fixtureKind: "handle",
      entityRef: taskRef,
      actionType: "drag_move",
      dragCurrentWorld: { x: 0.5, y: 0, z: 0 },
      dragDeltaWorld: { x: 0.5, y: 0, z: 0 },
      ts: 210,
    });
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_MOVE");
    expect(intent.dragDeltaWorld?.x).toBe(0.5);
  });
});

describe("makeFixtureHandleDragEndIntent", () => {
  it("carries origin and end positions", () => {
    const intent = makeFixtureHandleDragEndIntent(dragEndPayload);
    expect(intent.intent).toBe("FIXTURE_HANDLE_DRAG_END");
    expect(intent.dragOriginWorld).toEqual({ x: 0, y: 0, z: 0 });
    expect(intent.dragEndWorld).toEqual({ x: 1, y: 0, z: 1 });
    expect(intent.entityRef.entityType).toBe("task");
  });
});

describe("makeFixtureMenuAnchorOpenedIntent", () => {
  it("carries screen_position for menu popup anchoring", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent(menuPayload);
    expect(intent.intent).toBe("FIXTURE_MENU_ANCHOR_OPENED");
    expect(intent.screen_position).toEqual({ x: 200, y: 150 });
    expect(intent.actionType).toBe("menu_open");
    expect(intent.entityRef.entityType).toBe("room");
  });
});

describe("makeFixtureMenuAnchorClosedIntent", () => {
  it("produces FIXTURE_MENU_ANCHOR_CLOSED with correct fields", () => {
    const intent = makeFixtureMenuAnchorClosedIntent({
      fixtureId: "anchor-1",
      fixtureKind: "menu_anchor",
      entityRef: roomRef,
      actionType: "menu_close",
      worldPosition: { x: 3, y: 1, z: 0 },
      ts: 4000,
    });
    expect(intent.intent).toBe("FIXTURE_MENU_ANCHOR_CLOSED");
    expect(intent.actionType).toBe("menu_close");
  });
});

// ── 4. Type guard tests ───────────────────────────────────────────────────────

describe("isFixtureButtonClickedIntent", () => {
  it("accepts valid FIXTURE_BUTTON_CLICKED objects", () => {
    const intent = makeFixtureButtonClickedIntent(buttonPayload);
    expect(isFixtureButtonClickedIntent(intent)).toBe(true);
  });

  it("rejects objects with wrong intent kind", () => {
    expect(isFixtureButtonClickedIntent({ intent: "FIXTURE_BUTTON_HOVERED", fixtureId: "x", ts: 1 })).toBe(false);
  });

  it("rejects objects missing fixtureId", () => {
    expect(isFixtureButtonClickedIntent({ intent: "FIXTURE_BUTTON_CLICKED", ts: 1 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isFixtureButtonClickedIntent(null)).toBe(false);
    expect(isFixtureButtonClickedIntent("string")).toBe(false);
    expect(isFixtureButtonClickedIntent(42)).toBe(false);
  });

  it("rejects objects with wrong fixtureKind", () => {
    expect(
      isFixtureButtonClickedIntent({
        intent: "FIXTURE_BUTTON_CLICKED",
        fixtureId: "x",
        fixtureKind: "handle",  // wrong kind
        entityRef: agentRef,
        actionType: "click",
        ts: 1,
      }),
    ).toBe(false);
  });

  it("rejects objects missing entityRef", () => {
    expect(
      isFixtureButtonClickedIntent({
        intent: "FIXTURE_BUTTON_CLICKED",
        fixtureId: "x",
        fixtureKind: "button",
        actionType: "click",
        ts: 1,
        // entityRef omitted
      }),
    ).toBe(false);
  });
});

describe("isFixtureHandleDragEndIntent", () => {
  it("accepts valid FIXTURE_HANDLE_DRAG_END objects", () => {
    const intent = makeFixtureHandleDragEndIntent(dragEndPayload);
    expect(isFixtureHandleDragEndIntent(intent)).toBe(true);
  });

  it("rejects button intents", () => {
    const btn = makeFixtureButtonClickedIntent(buttonPayload);
    expect(isFixtureHandleDragEndIntent(btn)).toBe(false);
  });
});

describe("isFixtureMenuAnchorOpenedIntent", () => {
  it("accepts valid FIXTURE_MENU_ANCHOR_OPENED objects", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent(menuPayload);
    expect(isFixtureMenuAnchorOpenedIntent(intent)).toBe(true);
  });

  it("rejects objects missing screen_position", () => {
    expect(
      isFixtureMenuAnchorOpenedIntent({
        intent: "FIXTURE_MENU_ANCHOR_OPENED",
        fixtureId: "a",
        fixtureKind: "menu_anchor",
        entityRef: roomRef,
        actionType: "menu_open",
        ts: 1,
        // screen_position omitted
      }),
    ).toBe(false);
  });
});

describe("isFixtureInteractionIntent (union guard)", () => {
  it("accepts any valid fixture intent variant", () => {
    expect(isFixtureInteractionIntent(makeFixtureButtonClickedIntent(buttonPayload))).toBe(true);
    expect(isFixtureInteractionIntent(makeFixtureHandleDragEndIntent(dragEndPayload))).toBe(true);
    expect(isFixtureInteractionIntent(makeFixtureMenuAnchorOpenedIntent(menuPayload))).toBe(true);
  });

  it("rejects non-fixture intents", () => {
    expect(isFixtureInteractionIntent({ intent: "AGENT_CLICKED", ts: 1 })).toBe(false);
    expect(isFixtureInteractionIntent({ intent: "ROOM_HOVERED", ts: 1 })).toBe(false);
    expect(isFixtureInteractionIntent(null)).toBe(false);
  });
});

// ── 5. FIXTURE_INTENT_GUARDS map tests ──────────────────────────────────────

describe("FIXTURE_INTENT_GUARDS", () => {
  it("guards map has all 8 entries", () => {
    expect(Object.keys(FIXTURE_INTENT_GUARDS)).toHaveLength(8);
  });

  it("each guard matches its corresponding factory output", () => {
    const btnIntent = makeFixtureButtonClickedIntent(buttonPayload);
    expect(FIXTURE_INTENT_GUARDS["FIXTURE_BUTTON_CLICKED"](btnIntent)).toBe(true);

    const dragIntent = makeFixtureHandleDragEndIntent(dragEndPayload);
    expect(FIXTURE_INTENT_GUARDS["FIXTURE_HANDLE_DRAG_END"](dragIntent)).toBe(true);

    const menuIntent = makeFixtureMenuAnchorOpenedIntent(menuPayload);
    expect(FIXTURE_INTENT_GUARDS["FIXTURE_MENU_ANCHOR_OPENED"](menuIntent)).toBe(true);
  });

  it("each guard rejects objects of a different intent kind", () => {
    const btnIntent = makeFixtureButtonClickedIntent(buttonPayload);
    // Button intent should fail all non-button guards
    expect(FIXTURE_INTENT_GUARDS["FIXTURE_HANDLE_DRAG_START"](btnIntent)).toBe(false);
    expect(FIXTURE_INTENT_GUARDS["FIXTURE_MENU_ANCHOR_OPENED"](btnIntent)).toBe(false);
  });
});

// ── 6. Geometry helpers: computeFixtureWorldPos ──────────────────────────────

describe("computeFixtureWorldPos", () => {
  it("adds local offset to parent world position", () => {
    const result = computeFixtureWorldPos(
      { x: 1, y: 0, z: 2 },
      { x: 0.25, y: 0.55, z: 0 },
    );
    expect(result.x).toBeCloseTo(1.25);
    expect(result.y).toBeCloseTo(0.55);
    expect(result.z).toBeCloseTo(2.0);
  });

  it("handles zero offset correctly", () => {
    const result = computeFixtureWorldPos({ x: 5, y: 3, z: 1 }, { x: 0, y: 0, z: 0 });
    expect(result).toEqual({ x: 5, y: 3, z: 1 });
  });

  it("handles negative parent positions", () => {
    const result = computeFixtureWorldPos(
      { x: -2, y: 0, z: -3 },
      { x: 0.5, y: 1.0, z: 0.5 },
    );
    expect(result.x).toBeCloseTo(-1.5);
    expect(result.y).toBeCloseTo(1.0);
    expect(result.z).toBeCloseTo(-2.5);
  });
});

// ── 7. Geometry helpers: computeFixtureButtonOffset ──────────────────────────

describe("computeFixtureButtonOffset", () => {
  it("index=0 gives x=0", () => {
    const offset = computeFixtureButtonOffset(0);
    expect(offset.x).toBe(0);
  });

  it("index=1 gives x=spacing (default 0.25)", () => {
    const offset = computeFixtureButtonOffset(1);
    expect(offset.x).toBeCloseTo(0.25);
  });

  it("index=3 gives x=3*spacing", () => {
    const offset = computeFixtureButtonOffset(3, 0.3);
    expect(offset.x).toBeCloseTo(0.9);
  });

  it("y component is 0.55 (raised above entity)", () => {
    const offset = computeFixtureButtonOffset(0);
    expect(offset.y).toBe(0.55);
  });

  it("z component is 0", () => {
    const offset = computeFixtureButtonOffset(0);
    expect(offset.z).toBe(0);
  });
});

// ── 8. extractScreenPosition ─────────────────────────────────────────────────

describe("extractScreenPosition", () => {
  it("extracts clientX/clientY from event-like object", () => {
    const result = extractScreenPosition({ clientX: 100, clientY: 200 });
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("returns undefined for null input", () => {
    expect(extractScreenPosition(null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(extractScreenPosition(undefined)).toBeUndefined();
  });
});

// ── 9. SpatialUiFixture pure helpers ─────────────────────────────────────────

describe("computeEntityButtonBaseY", () => {
  it("agent returns 0.55", () => {
    expect(computeEntityButtonBaseY("agent")).toBe(0.55);
  });

  it("task returns 0.75 (higher than agent)", () => {
    expect(computeEntityButtonBaseY("task")).toBeGreaterThan(0.55);
  });

  it("room returns 1.20 (highest)", () => {
    expect(computeEntityButtonBaseY("room")).toBeGreaterThan(0.75);
  });
});

describe("computeFixtureLocalOffset", () => {
  it("returns correct x offset for index=1 agent fixture", () => {
    const offset = computeFixtureLocalOffset(1, "agent");
    expect(offset.x).toBeCloseTo(FIXTURE_BUTTON_SPACING);
  });

  it("returns correct y for agent entity type", () => {
    const offset = computeFixtureLocalOffset(0, "agent");
    expect(offset.y).toBe(computeEntityButtonBaseY("agent"));
  });

  it("returns correct y for room entity type (higher than agent)", () => {
    const agentOffset = computeFixtureLocalOffset(0, "agent");
    const roomOffset = computeFixtureLocalOffset(0, "room");
    expect(roomOffset.y).toBeGreaterThan(agentOffset.y);
  });

  it("uses custom spacing correctly", () => {
    const offset = computeFixtureLocalOffset(2, "agent", 0.5);
    expect(offset.x).toBeCloseTo(1.0);
  });
});

describe("computeFixtureEmissiveIntensity", () => {
  it("at t=0 returns FIXTURE_IDLE_EMISSIVE", () => {
    expect(computeFixtureEmissiveIntensity(0, false)).toBeCloseTo(FIXTURE_IDLE_EMISSIVE);
  });

  it("at t=1 returns FIXTURE_HOVERED_EMISSIVE", () => {
    expect(computeFixtureEmissiveIntensity(1, false)).toBeCloseTo(FIXTURE_HOVERED_EMISSIVE);
  });

  it("when isActive=true always returns FIXTURE_ACTIVE_EMISSIVE", () => {
    expect(computeFixtureEmissiveIntensity(0, true)).toBe(FIXTURE_ACTIVE_EMISSIVE);
    expect(computeFixtureEmissiveIntensity(0.5, true)).toBe(FIXTURE_ACTIVE_EMISSIVE);
  });

  it("at t=0.5 returns midpoint between idle and hovered", () => {
    const midpoint = FIXTURE_IDLE_EMISSIVE + 0.5 * (FIXTURE_HOVERED_EMISSIVE - FIXTURE_IDLE_EMISSIVE);
    expect(computeFixtureEmissiveIntensity(0.5, false)).toBeCloseTo(midpoint);
  });

  it("idle < hovered < active", () => {
    expect(FIXTURE_IDLE_EMISSIVE).toBeLessThan(FIXTURE_HOVERED_EMISSIVE);
    expect(FIXTURE_HOVERED_EMISSIVE).toBeLessThan(FIXTURE_ACTIVE_EMISSIVE);
  });
});

// ── 10. Render order constant ─────────────────────────────────────────────────

describe("SPATIAL_FIXTURE_RENDER_ORDER", () => {
  it("is above task connector render orders (5 > typical beam/orb values)", () => {
    // Task connectors use RENDER_ORDER_ORB=3 and RENDER_ORDER_BEAM=2 per Sub-AC 5b
    expect(SPATIAL_FIXTURE_RENDER_ORDER).toBeGreaterThanOrEqual(5);
  });
});

// ── 11. Entity reference coverage ────────────────────────────────────────────

describe("FixtureEntityRef types", () => {
  it("agent entityRef is accepted by isFixtureButtonClickedIntent", () => {
    const intent = makeFixtureButtonClickedIntent({ ...buttonPayload, entityRef: agentRef });
    expect(isFixtureButtonClickedIntent(intent)).toBe(true);
    expect(intent.entityRef.entityType).toBe("agent");
  });

  it("task entityRef is accepted by isFixtureHandleDragEndIntent", () => {
    const intent = makeFixtureHandleDragEndIntent(dragEndPayload);
    expect(isFixtureHandleDragEndIntent(intent)).toBe(true);
    expect(intent.entityRef.entityType).toBe("task");
  });

  it("room entityRef is accepted by isFixtureMenuAnchorOpenedIntent", () => {
    const intent = makeFixtureMenuAnchorOpenedIntent(menuPayload);
    expect(isFixtureMenuAnchorOpenedIntent(intent)).toBe(true);
    expect(intent.entityRef.entityType).toBe("room");
  });
});

// ── 12. Cross-layer isolation — fixture intents don't match layer guards ──────

describe("Cross-layer intent isolation", () => {
  it("button clicked intent does not satisfy agent intent guard fields", () => {
    const intent = makeFixtureButtonClickedIntent(buttonPayload);
    // No 'agentId' field — agent guards would reject this
    expect((intent as Record<string, unknown>)["agentId"]).toBeUndefined();
  });

  it("fixture intent kinds don't overlap with agent/room/building kinds", () => {
    const fixtureKinds = [...FIXTURE_INTENT_KINDS];
    const agentKinds = ["AGENT_CLICKED", "AGENT_HOVERED", "AGENT_UNHOVERED", "AGENT_CONTEXT_MENU"];
    const roomKinds = ["ROOM_CLICKED", "ROOM_HOVERED", "ROOM_UNHOVERED", "ROOM_CONTEXT_MENU"];
    const buildingKinds = ["BUILDING_CLICKED", "BUILDING_HOVERED", "BUILDING_UNHOVERED", "BUILDING_CONTEXT_MENU"];

    for (const kind of fixtureKinds) {
      expect(agentKinds.includes(kind)).toBe(false);
      expect(roomKinds.includes(kind)).toBe(false);
      expect(buildingKinds.includes(kind)).toBe(false);
    }
  });
});

// ── 13. worldPosition tracking across multiple positions ─────────────────────

describe("worldPosition tracking in intents", () => {
  it("intent stores the exact worldPosition at time of emission", () => {
    const pos1: FixtureWorldPosition = { x: 0, y: 0, z: 0 };
    const intent1 = makeFixtureButtonClickedIntent({
      ...buttonPayload,
      worldPosition: pos1,
    });
    expect(intent1.worldPosition).toEqual(pos1);
  });

  it("subsequent emission with different position stores new position", () => {
    const pos2: FixtureWorldPosition = { x: 5, y: 0, z: 3 };
    const intent2 = makeFixtureButtonClickedIntent({
      ...buttonPayload,
      worldPosition: pos2,
    });
    expect(intent2.worldPosition).toEqual(pos2);
  });

  it("null worldPosition is allowed (synthesised events)", () => {
    const intent = makeFixtureButtonClickedIntent({
      ...buttonPayload,
      worldPosition: null,
    });
    expect(intent.worldPosition).toBeNull();
    // Guard still accepts it
    expect(isFixtureButtonClickedIntent(intent)).toBe(true);
  });
});

// ── 14. Stability check — guard set completeness ─────────────────────────────

describe("Guard completeness (stability check)", () => {
  it("every FIXTURE_INTENT_KINDS entry has a corresponding guard in FIXTURE_INTENT_GUARDS", () => {
    for (const kind of FIXTURE_INTENT_KINDS) {
      expect(FIXTURE_INTENT_GUARDS).toHaveProperty(kind);
      expect(typeof FIXTURE_INTENT_GUARDS[kind as keyof typeof FIXTURE_INTENT_GUARDS]).toBe("function");
    }
  });

  it("FIXTURE_INTENT_GUARDS has no extra entries beyond FIXTURE_INTENT_KINDS", () => {
    const guardKinds = Object.keys(FIXTURE_INTENT_GUARDS);
    expect(guardKinds).toHaveLength(FIXTURE_INTENT_KINDS.size);
    for (const kind of guardKinds) {
      expect(FIXTURE_INTENT_KINDS.has(kind)).toBe(true);
    }
  });
});
