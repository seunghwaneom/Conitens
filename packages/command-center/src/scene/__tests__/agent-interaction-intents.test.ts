/**
 * agent-interaction-intents.test.ts — Unit tests for Sub-AC 4c.
 *
 * Tests the pure typed intent system for the Agent layer:
 *   - Factory functions (makeAgentClickedIntent, etc.)
 *   - Type guards (isAgentClickedIntent, etc.)
 *   - Discriminated union narrowing
 *   - Cross-layer isolation (agent intents don't match room/building guards)
 *   - JSON round-trip fidelity (record transparency)
 *
 * Coverage tags:
 *   4c-AI1  AGENT_CLICKED factory produces correct intent field
 *   4c-AI2  AGENT_HOVERED factory produces correct intent field
 *   4c-AI3  AGENT_UNHOVERED factory produces correct intent field
 *   4c-AI4  AGENT_CONTEXT_MENU factory produces correct intent field
 *   4c-AI5  makeAgentClickedIntent carries all payload fields
 *   4c-AI6  makeAgentHoveredIntent carries all payload fields
 *   4c-AI7  makeAgentUnhoveredIntent carries all payload fields
 *   4c-AI8  makeAgentContextMenuIntent carries screen_position
 *   4c-AI9  isAgentClickedIntent accepts valid AGENT_CLICKED
 *   4c-AI10 isAgentClickedIntent rejects wrong intent field
 *   4c-AI11 isAgentHoveredIntent accepts valid AGENT_HOVERED
 *   4c-AI12 isAgentHoveredIntent rejects wrong intent field
 *   4c-AI13 isAgentUnhoveredIntent accepts valid AGENT_UNHOVERED
 *   4c-AI14 isAgentContextMenuIntent accepts valid AGENT_CONTEXT_MENU
 *   4c-AI15 isAgentContextMenuIntent rejects missing screen_position
 *   4c-AI16 isAgentInteractionIntent accepts all four variants
 *   4c-AI17 isAgentInteractionIntent rejects non-agent objects
 *   4c-AI18 AGENT_INTENT_KINDS set contains all four kinds
 *   4c-AI19 isAgentInteractionIntentKind accepts valid kinds
 *   4c-AI20 isAgentInteractionIntentKind rejects room/building kinds
 *   4c-AI21 AGENT_INTENT_GUARDS map has correct guards for each kind
 *   4c-AI22 All four intents survive JSON round-trip
 *   4c-AI23 Agent intents do not match building-layer intent fields
 *   4c-AI24 Agent intents do not match room-layer intent fields
 *   4c-AI25 Modifiers field is optional and correctly passed through
 *   4c-AI26 worldPosition can be null (synthesised event)
 *   4c-AI27 screenPosition is optional on click and hover intents
 *   4c-AI28 wasSelected and isDrillTarget are required on AGENT_CLICKED
 */

import { describe, it, expect } from "vitest";
import {
  // Factories
  makeAgentClickedIntent,
  makeAgentHoveredIntent,
  makeAgentUnhoveredIntent,
  makeAgentContextMenuIntent,
  // Guards
  isAgentClickedIntent,
  isAgentHoveredIntent,
  isAgentUnhoveredIntent,
  isAgentContextMenuIntent,
  isAgentInteractionIntent,
  isAgentInteractionIntentKind,
  // Constants
  AGENT_INTENT_KINDS,
  AGENT_INTENT_GUARDS,
  // Types (checked via assignments in tests)
  type AgentClickedIntent,
  type AgentInteractionIntent,
} from "../agent-interaction-intents.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_TS = 1_700_000_000_000;
const DEFAULT_AGENT_ID = "implementer-42";
const DEFAULT_ROOM_ID  = "lab-room-01";
const DEFAULT_WORLD_POS = { x: 1.5, y: 0.5, z: -2.0 };
const DEFAULT_SCREEN_POS = { x: 640, y: 360 };

function makeClickedPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId:       DEFAULT_AGENT_ID,
    agentName:     "Implementer 42",
    agentRole:     "implementer",
    agentStatus:   "active",
    roomId:        DEFAULT_ROOM_ID,
    worldPosition: DEFAULT_WORLD_POS,
    wasSelected:   false,
    isDrillTarget: false,
    ts:            BASE_TS,
    ...overrides,
  } as Parameters<typeof makeAgentClickedIntent>[0];
}

function makeHoveredPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId:       DEFAULT_AGENT_ID,
    agentName:     "Implementer 42",
    agentRole:     "implementer",
    agentStatus:   "active",
    roomId:        DEFAULT_ROOM_ID,
    worldPosition: DEFAULT_WORLD_POS,
    ts:            BASE_TS + 100,
    ...overrides,
  } as Parameters<typeof makeAgentHoveredIntent>[0];
}

function makeUnhoveredPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId:     DEFAULT_AGENT_ID,
    agentRole:   "implementer",
    agentStatus: "active",
    roomId:      DEFAULT_ROOM_ID,
    ts:          BASE_TS + 200,
    ...overrides,
  } as Parameters<typeof makeAgentUnhoveredIntent>[0];
}

function makeContextMenuPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId:         DEFAULT_AGENT_ID,
    agentName:       "Implementer 42",
    agentRole:       "implementer",
    agentStatus:     "active",
    roomId:          DEFAULT_ROOM_ID,
    worldPosition:   DEFAULT_WORLD_POS,
    screen_position: DEFAULT_SCREEN_POS,
    wasSelected:     false,
    ts:              BASE_TS + 300,
    ...overrides,
  } as Parameters<typeof makeAgentContextMenuIntent>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agent-interaction-intents — Sub-AC 4c", () => {

  // ── 4c-AI1: AGENT_CLICKED factory ─────────────────────────────────────────

  it("4c-AI1: makeAgentClickedIntent sets intent='AGENT_CLICKED'", () => {
    const intent = makeAgentClickedIntent(makeClickedPayload());
    expect(intent.intent).toBe("AGENT_CLICKED");
  });

  // ── 4c-AI2: AGENT_HOVERED factory ─────────────────────────────────────────

  it("4c-AI2: makeAgentHoveredIntent sets intent='AGENT_HOVERED'", () => {
    const intent = makeAgentHoveredIntent(makeHoveredPayload());
    expect(intent.intent).toBe("AGENT_HOVERED");
  });

  // ── 4c-AI3: AGENT_UNHOVERED factory ───────────────────────────────────────

  it("4c-AI3: makeAgentUnhoveredIntent sets intent='AGENT_UNHOVERED'", () => {
    const intent = makeAgentUnhoveredIntent(makeUnhoveredPayload());
    expect(intent.intent).toBe("AGENT_UNHOVERED");
  });

  // ── 4c-AI4: AGENT_CONTEXT_MENU factory ────────────────────────────────────

  it("4c-AI4: makeAgentContextMenuIntent sets intent='AGENT_CONTEXT_MENU'", () => {
    const intent = makeAgentContextMenuIntent(makeContextMenuPayload());
    expect(intent.intent).toBe("AGENT_CONTEXT_MENU");
  });

  // ── 4c-AI5: AGENT_CLICKED payload fields ──────────────────────────────────

  it("4c-AI5: makeAgentClickedIntent preserves all payload fields", () => {
    const intent = makeAgentClickedIntent(makeClickedPayload({
      wasSelected:   true,
      isDrillTarget: false,
      agentStatus:   "busy",
      modifiers:     { ctrl: true, shift: false, alt: false },
      screenPosition: { x: 400, y: 300 },
    }));

    expect(intent.agentId).toBe(DEFAULT_AGENT_ID);
    expect(intent.agentName).toBe("Implementer 42");
    expect(intent.agentRole).toBe("implementer");
    expect(intent.agentStatus).toBe("busy");
    expect(intent.roomId).toBe(DEFAULT_ROOM_ID);
    expect(intent.worldPosition).toEqual(DEFAULT_WORLD_POS);
    expect(intent.wasSelected).toBe(true);
    expect(intent.isDrillTarget).toBe(false);
    expect(intent.ts).toBe(BASE_TS);
    expect(intent.modifiers).toEqual({ ctrl: true, shift: false, alt: false });
    expect(intent.screenPosition).toEqual({ x: 400, y: 300 });
  });

  // ── 4c-AI6: AGENT_HOVERED payload fields ──────────────────────────────────

  it("4c-AI6: makeAgentHoveredIntent preserves all payload fields", () => {
    const intent = makeAgentHoveredIntent(makeHoveredPayload({
      agentStatus:    "idle",
      screenPosition: { x: 500, y: 200 },
      session_id:     "session-xyz",
    }));

    expect(intent.agentId).toBe(DEFAULT_AGENT_ID);
    expect(intent.agentRole).toBe("implementer");
    expect(intent.agentStatus).toBe("idle");
    expect(intent.worldPosition).toEqual(DEFAULT_WORLD_POS);
    expect(intent.screenPosition).toEqual({ x: 500, y: 200 });
    expect(intent.session_id).toBe("session-xyz");
  });

  // ── 4c-AI7: AGENT_UNHOVERED payload fields ────────────────────────────────

  it("4c-AI7: makeAgentUnhoveredIntent preserves all payload fields", () => {
    const intent = makeAgentUnhoveredIntent(makeUnhoveredPayload({
      screenPosition: { x: 505, y: 205 },
      session_id:     "session-abc",
    }));

    expect(intent.agentId).toBe(DEFAULT_AGENT_ID);
    expect(intent.agentRole).toBe("implementer");
    expect(intent.agentStatus).toBe("active");
    expect(intent.screenPosition).toEqual({ x: 505, y: 205 });
    expect(intent.session_id).toBe("session-abc");
  });

  // ── 4c-AI8: AGENT_CONTEXT_MENU carries screen_position ───────────────────

  it("4c-AI8: makeAgentContextMenuIntent carries screen_position", () => {
    const intent = makeAgentContextMenuIntent(makeContextMenuPayload({
      screen_position: { x: 800, y: 450 },
    }));

    expect(intent.screen_position).toEqual({ x: 800, y: 450 });
  });

  // ── 4c-AI9: isAgentClickedIntent — valid ──────────────────────────────────

  it("4c-AI9: isAgentClickedIntent accepts a valid AGENT_CLICKED intent", () => {
    const intent = makeAgentClickedIntent(makeClickedPayload());
    expect(isAgentClickedIntent(intent)).toBe(true);
  });

  // ── 4c-AI10: isAgentClickedIntent — wrong intent ──────────────────────────

  it("4c-AI10: isAgentClickedIntent rejects wrong intent discriminator", () => {
    expect(isAgentClickedIntent({ intent: "AGENT_HOVERED", agentId: "a", ts: 1 })).toBe(false);
    expect(isAgentClickedIntent({ intent: "ROOM_CLICKED",  room_id: "r", ts: 1 })).toBe(false);
    expect(isAgentClickedIntent(null)).toBe(false);
    expect(isAgentClickedIntent(42)).toBe(false);
    expect(isAgentClickedIntent({})).toBe(false);
  });

  // ── 4c-AI11: isAgentHoveredIntent — valid ────────────────────────────────

  it("4c-AI11: isAgentHoveredIntent accepts a valid AGENT_HOVERED intent", () => {
    const intent = makeAgentHoveredIntent(makeHoveredPayload());
    expect(isAgentHoveredIntent(intent)).toBe(true);
  });

  // ── 4c-AI12: isAgentHoveredIntent — wrong intent ─────────────────────────

  it("4c-AI12: isAgentHoveredIntent rejects wrong discriminator or missing fields", () => {
    expect(isAgentHoveredIntent({ intent: "AGENT_CLICKED",  agentId: "a", ts: 1 })).toBe(false);
    expect(isAgentHoveredIntent({ intent: "AGENT_HOVERED", ts: 1 })).toBe(false); // missing agentId
    expect(isAgentHoveredIntent(undefined)).toBe(false);
  });

  // ── 4c-AI13: isAgentUnhoveredIntent — valid ───────────────────────────────

  it("4c-AI13: isAgentUnhoveredIntent accepts a valid AGENT_UNHOVERED intent", () => {
    const intent = makeAgentUnhoveredIntent(makeUnhoveredPayload());
    expect(isAgentUnhoveredIntent(intent)).toBe(true);
  });

  // ── 4c-AI14: isAgentContextMenuIntent — valid ─────────────────────────────

  it("4c-AI14: isAgentContextMenuIntent accepts a valid AGENT_CONTEXT_MENU intent", () => {
    const intent = makeAgentContextMenuIntent(makeContextMenuPayload());
    expect(isAgentContextMenuIntent(intent)).toBe(true);
  });

  // ── 4c-AI15: isAgentContextMenuIntent — missing screen_position ───────────

  it("4c-AI15: isAgentContextMenuIntent rejects intent missing screen_position", () => {
    const bad = {
      intent:  "AGENT_CONTEXT_MENU",
      agentId: DEFAULT_AGENT_ID,
      ts:      BASE_TS,
      // screen_position deliberately omitted
    };
    expect(isAgentContextMenuIntent(bad)).toBe(false);
  });

  // ── 4c-AI16: isAgentInteractionIntent — all four variants ─────────────────

  it("4c-AI16: isAgentInteractionIntent accepts all four agent intent variants", () => {
    const intents: AgentInteractionIntent[] = [
      makeAgentClickedIntent(makeClickedPayload()),
      makeAgentHoveredIntent(makeHoveredPayload()),
      makeAgentUnhoveredIntent(makeUnhoveredPayload()),
      makeAgentContextMenuIntent(makeContextMenuPayload()),
    ];
    for (const intent of intents) {
      expect(isAgentInteractionIntent(intent)).toBe(true);
    }
  });

  // ── 4c-AI17: isAgentInteractionIntent — non-agent objects ─────────────────

  it("4c-AI17: isAgentInteractionIntent rejects non-agent intent objects", () => {
    expect(isAgentInteractionIntent({ intent: "BUILDING_CLICKED", building_id: "b", ts: 1 })).toBe(false);
    expect(isAgentInteractionIntent({ intent: "ROOM_CLICKED",      room_id: "r", ts: 1 })).toBe(false);
    expect(isAgentInteractionIntent(null)).toBe(false);
    expect(isAgentInteractionIntent("AGENT_CLICKED")).toBe(false);
    expect(isAgentInteractionIntent({})).toBe(false);
  });

  // ── 4c-AI18: AGENT_INTENT_KINDS set ───────────────────────────────────────

  it("4c-AI18: AGENT_INTENT_KINDS contains all four agent intent kinds", () => {
    expect(AGENT_INTENT_KINDS.has("AGENT_CLICKED")).toBe(true);
    expect(AGENT_INTENT_KINDS.has("AGENT_HOVERED")).toBe(true);
    expect(AGENT_INTENT_KINDS.has("AGENT_UNHOVERED")).toBe(true);
    expect(AGENT_INTENT_KINDS.has("AGENT_CONTEXT_MENU")).toBe(true);
    expect(AGENT_INTENT_KINDS.size).toBe(4);
  });

  // ── 4c-AI19: isAgentInteractionIntentKind — valid ─────────────────────────

  it("4c-AI19: isAgentInteractionIntentKind accepts all four valid kind strings", () => {
    expect(isAgentInteractionIntentKind("AGENT_CLICKED")).toBe(true);
    expect(isAgentInteractionIntentKind("AGENT_HOVERED")).toBe(true);
    expect(isAgentInteractionIntentKind("AGENT_UNHOVERED")).toBe(true);
    expect(isAgentInteractionIntentKind("AGENT_CONTEXT_MENU")).toBe(true);
  });

  // ── 4c-AI20: isAgentInteractionIntentKind — rejects other layers ──────────

  it("4c-AI20: isAgentInteractionIntentKind rejects room and building kind strings", () => {
    expect(isAgentInteractionIntentKind("ROOM_CLICKED")).toBe(false);
    expect(isAgentInteractionIntentKind("ROOM_HOVERED")).toBe(false);
    expect(isAgentInteractionIntentKind("BUILDING_CLICKED")).toBe(false);
    expect(isAgentInteractionIntentKind("BUILDING_CONTEXT_MENU")).toBe(false);
    expect(isAgentInteractionIntentKind("click")).toBe(false); // store-layer kind
    expect(isAgentInteractionIntentKind("hover_enter")).toBe(false);
    expect(isAgentInteractionIntentKind("")).toBe(false);
  });

  // ── 4c-AI21: AGENT_INTENT_GUARDS map ─────────────────────────────────────

  it("4c-AI21: AGENT_INTENT_GUARDS map has the correct guard for each kind", () => {
    const clicked = makeAgentClickedIntent(makeClickedPayload());
    expect(AGENT_INTENT_GUARDS["AGENT_CLICKED"](clicked)).toBe(true);
    expect(AGENT_INTENT_GUARDS["AGENT_HOVERED"](clicked)).toBe(false);

    const hovered = makeAgentHoveredIntent(makeHoveredPayload());
    expect(AGENT_INTENT_GUARDS["AGENT_HOVERED"](hovered)).toBe(true);
    expect(AGENT_INTENT_GUARDS["AGENT_CLICKED"](hovered)).toBe(false);

    const unhovered = makeAgentUnhoveredIntent(makeUnhoveredPayload());
    expect(AGENT_INTENT_GUARDS["AGENT_UNHOVERED"](unhovered)).toBe(true);

    const ctxMenu = makeAgentContextMenuIntent(makeContextMenuPayload());
    expect(AGENT_INTENT_GUARDS["AGENT_CONTEXT_MENU"](ctxMenu)).toBe(true);
  });

  // ── 4c-AI22: JSON round-trip (record transparency) ────────────────────────

  it("4c-AI22: all four agent intent variants survive JSON round-trip", () => {
    const intents: AgentInteractionIntent[] = [
      makeAgentClickedIntent(makeClickedPayload()),
      makeAgentHoveredIntent(makeHoveredPayload()),
      makeAgentUnhoveredIntent(makeUnhoveredPayload()),
      makeAgentContextMenuIntent(makeContextMenuPayload()),
    ];

    for (const intent of intents) {
      const serialised = JSON.stringify(intent);
      const parsed = JSON.parse(serialised) as unknown;
      expect(isAgentInteractionIntent(parsed)).toBe(true);
      // The intent field must survive
      expect((parsed as { intent: string }).intent).toBe(intent.intent);
      // The agentId must survive
      expect((parsed as { agentId: string }).agentId).toBe(DEFAULT_AGENT_ID);
    }
  });

  // ── 4c-AI23: cross-layer isolation — building layer ───────────────────────

  it("4c-AI23: agent intents do not match building-layer intent patterns", () => {
    const intent = makeAgentClickedIntent(makeClickedPayload());

    // Building intents discriminate on `intent: "BUILDING_*"` and require `building_id`
    expect((intent as unknown as Record<string, unknown>)["building_id"]).toBeUndefined();
    expect((intent as unknown as Record<string, unknown>)["floor_count"]).toBeUndefined();
    expect(intent.intent).not.toMatch(/^BUILDING_/);
  });

  // ── 4c-AI24: cross-layer isolation — room layer ───────────────────────────

  it("4c-AI24: agent intents do not match room-layer intent patterns", () => {
    const intents: AgentInteractionIntent[] = [
      makeAgentClickedIntent(makeClickedPayload()),
      makeAgentHoveredIntent(makeHoveredPayload()),
      makeAgentUnhoveredIntent(makeUnhoveredPayload()),
      makeAgentContextMenuIntent(makeContextMenuPayload()),
    ];

    for (const intent of intents) {
      // Room intents discriminate on `intent: "ROOM_*"` and require `room_id`
      // Note: agent intents have `roomId` (camelCase), not `room_id` (snake_case)
      expect((intent as unknown as Record<string, unknown>)["room_id"]).toBeUndefined();
      expect((intent as unknown as Record<string, unknown>)["room_type"]).toBeUndefined();
      expect(intent.intent).not.toMatch(/^ROOM_/);
    }
  });

  // ── 4c-AI25: optional modifiers field ────────────────────────────────────

  it("4c-AI25: modifiers field is optional and round-trips correctly", () => {
    const withMods = makeAgentClickedIntent(makeClickedPayload({
      modifiers: { ctrl: false, shift: true, alt: false },
    }));
    expect(withMods.modifiers).toEqual({ ctrl: false, shift: true, alt: false });

    const withoutMods = makeAgentClickedIntent(makeClickedPayload());
    expect(withoutMods.modifiers).toBeUndefined();
  });

  // ── 4c-AI26: null worldPosition (synthesised event) ─────────────────────

  it("4c-AI26: worldPosition can be null for synthesised (non-pointer) events", () => {
    const intent = makeAgentClickedIntent(makeClickedPayload({ worldPosition: null }));
    expect(intent.worldPosition).toBeNull();
    // Guard should still accept null world position
    expect(isAgentClickedIntent(intent)).toBe(true);
  });

  // ── 4c-AI27: optional screenPosition ─────────────────────────────────────

  it("4c-AI27: screenPosition is optional on AGENT_CLICKED and AGENT_HOVERED", () => {
    const clickNoScreen = makeAgentClickedIntent(makeClickedPayload());
    expect(clickNoScreen.screenPosition).toBeUndefined();
    expect(isAgentClickedIntent(clickNoScreen)).toBe(true);

    const hoverNoScreen = makeAgentHoveredIntent(makeHoveredPayload());
    expect(hoverNoScreen.screenPosition).toBeUndefined();
    expect(isAgentHoveredIntent(hoverNoScreen)).toBe(true);
  });

  // ── 4c-AI28: wasSelected and isDrillTarget on AGENT_CLICKED ──────────────

  it("4c-AI28: wasSelected and isDrillTarget are required on AGENT_CLICKED payload", () => {
    const selected = makeAgentClickedIntent(makeClickedPayload({ wasSelected: true, isDrillTarget: true }));
    expect(selected.wasSelected).toBe(true);
    expect(selected.isDrillTarget).toBe(true);

    const fresh = makeAgentClickedIntent(makeClickedPayload({ wasSelected: false, isDrillTarget: false }));
    expect(fresh.wasSelected).toBe(false);
    expect(fresh.isDrillTarget).toBe(false);
  });

  // ── Type narrowing (compile-time verification) ────────────────────────────

  it("4c-AI29: switch on intent field provides correct TypeScript type narrowing", () => {
    const intent: AgentInteractionIntent = makeAgentClickedIntent(makeClickedPayload());

    // This will compile and run — verifies the discriminated union narrows properly
    let narrowedCorrectly = false;
    switch (intent.intent) {
      case "AGENT_CLICKED":
        // TypeScript knows intent is AgentClickedIntent here
        narrowedCorrectly = typeof intent.wasSelected === "boolean";
        break;
      case "AGENT_HOVERED":
      case "AGENT_UNHOVERED":
      case "AGENT_CONTEXT_MENU":
        narrowedCorrectly = false;
        break;
    }
    expect(narrowedCorrectly).toBe(true);
  });

  // ── No command pipeline dependency ────────────────────────────────────────

  it("4c-AI30: all factory functions are synchronous and have no async/IO operations", () => {
    // Verify synchronous execution — returns plain object immediately
    const start = Date.now();

    const click   = makeAgentClickedIntent(makeClickedPayload());
    const hover   = makeAgentHoveredIntent(makeHoveredPayload());
    const unhover = makeAgentUnhoveredIntent(makeUnhoveredPayload());
    const ctxMenu = makeAgentContextMenuIntent(makeContextMenuPayload());

    const elapsed = Date.now() - start;

    // All synchronous — should complete in < 10ms
    expect(elapsed).toBeLessThan(10);

    // All return plain objects (not Promises, not thunks)
    expect(click instanceof Promise).toBe(false);
    expect(hover instanceof Promise).toBe(false);
    expect(unhover instanceof Promise).toBe(false);
    expect(ctxMenu instanceof Promise).toBe(false);

    // All are plain objects
    expect(typeof click).toBe("object");
    expect(typeof hover).toBe("object");
    expect(typeof unhover).toBe("object");
    expect(typeof ctxMenu).toBe("object");
  });

  // ── Type assignment validation ────────────────────────────────────────────

  it("4c-AI31: factory output is correctly typed as AgentClickedIntent", () => {
    // TypeScript-level test: if this compiles, the type is correct
    const intent: AgentClickedIntent = makeAgentClickedIntent(makeClickedPayload());
    expect(intent.intent).toBe("AGENT_CLICKED");
  });
});
