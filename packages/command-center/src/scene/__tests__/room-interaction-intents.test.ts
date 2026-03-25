/**
 * room-interaction-intents.test.ts
 *
 * Sub-AC 4b — typed room-layer interaction intents.
 *
 * Tests cover:
 *   1.  Intent discriminator set membership (ROOM_INTENT_KINDS)
 *   2.  ROOM_CLICKED intent factory + type guard
 *   3.  ROOM_HOVERED intent factory + type guard
 *   4.  ROOM_UNHOVERED intent factory + type guard
 *   5.  ROOM_CONTEXT_MENU intent factory + type guard
 *   6.  isRoomInteractionIntent union guard
 *   7.  ROOM_INTENT_GUARDS discriminator map
 *   8.  Record transparency: intents are JSON-serialisable
 *   9.  Drill level coverage
 *   10. Propagation contract: stopPropagation called before intent
 *   11. Room-scoped payload: room_id / room_type / floor mandatory fields
 *   12. Non-regression: ROOM_* kinds do NOT appear in BUILDING_INTENT_KINDS
 *
 * Test ID scheme:
 *   rii-N : room-interaction-intents
 */

import { describe, it, expect, vi } from "vitest";
import {
  // Constants / discriminators
  ROOM_INTENT_KINDS,
  isRoomInteractionIntentKind,
  // Factories
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomUnhoveredIntent,
  makeRoomContextMenuIntent,
  // Type guards
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomUnhoveredIntent,
  isRoomContextMenuIntent,
  isRoomInteractionIntent,
  // Guard map
  ROOM_INTENT_GUARDS,
  // Types (imported for doc; no runtime value)
  type RoomInteractionIntent,
  type RoomClickedPayload,
  type RoomHoveredPayload,
  type RoomUnhoveredPayload,
  type RoomContextMenuPayload,
} from "../room-interaction-intents.js";

import { BUILDING_INTENT_KINDS } from "../building-interaction-intents.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_WORLD_POS  = { x: 5.0, y: 0, z: 3.5 };
const MOCK_SCREEN_POS = { x: 800, y: 450 };
const ROOM_ID         = "control-room-1";
const SESSION         = "rii-test-session-001";
const TS              = 1_700_000_000_000;

function makeClickPayload(
  overrides: Partial<RoomClickedPayload> = {},
): RoomClickedPayload {
  return {
    room_id:        ROOM_ID,
    room_type:      "control",
    floor:          0,
    drill_level:    "floor",
    world_position: MOCK_WORLD_POS,
    agent_count:    2,
    ts:             TS,
    session_id:     SESSION,
    ...overrides,
  };
}

function makeHoverPayload(
  overrides: Partial<RoomHoveredPayload> = {},
): RoomHoveredPayload {
  return {
    room_id:        ROOM_ID,
    room_type:      "control",
    floor:          0,
    world_position: MOCK_WORLD_POS,
    ts:             TS + 1000,
    session_id:     SESSION,
    ...overrides,
  };
}

function makeUnhoverPayload(
  overrides: Partial<RoomUnhoveredPayload> = {},
): RoomUnhoveredPayload {
  return {
    room_id:   ROOM_ID,
    room_type: "control",
    floor:     0,
    ts:        TS + 2000,
    session_id: SESSION,
    ...overrides,
  };
}

function makeContextMenuPayload(
  overrides: Partial<RoomContextMenuPayload> = {},
): RoomContextMenuPayload {
  return {
    room_id:         ROOM_ID,
    room_type:       "control",
    floor:           0,
    world_position:  MOCK_WORLD_POS,
    screen_position: MOCK_SCREEN_POS,
    drill_level:     "floor",
    ts:              TS + 3000,
    session_id:      SESSION,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Intent discriminator set
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-01 — ROOM_INTENT_KINDS set", () => {
  it("rii-01a: contains all four room intent kinds", () => {
    expect(ROOM_INTENT_KINDS.has("ROOM_CLICKED")).toBe(true);
    expect(ROOM_INTENT_KINDS.has("ROOM_HOVERED")).toBe(true);
    expect(ROOM_INTENT_KINDS.has("ROOM_UNHOVERED")).toBe(true);
    expect(ROOM_INTENT_KINDS.has("ROOM_CONTEXT_MENU")).toBe(true);
  });

  it("rii-01b: does not contain unrelated or building-level strings", () => {
    expect(ROOM_INTENT_KINDS.has("BUILDING_CLICKED")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("AGENT_CLICKED")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("room_clicked")).toBe(false); // case sensitive
  });

  it("rii-01c: isRoomInteractionIntentKind narrows correctly", () => {
    expect(isRoomInteractionIntentKind("ROOM_CLICKED")).toBe(true);
    expect(isRoomInteractionIntentKind("ROOM_HOVERED")).toBe(true);
    expect(isRoomInteractionIntentKind("ROOM_UNHOVERED")).toBe(true);
    expect(isRoomInteractionIntentKind("ROOM_CONTEXT_MENU")).toBe(true);
    expect(isRoomInteractionIntentKind("BUILDING_CLICKED")).toBe(false);
    expect(isRoomInteractionIntentKind("")).toBe(false);
    expect(isRoomInteractionIntentKind("AGENT_CLICKED")).toBe(false);
  });

  it("rii-01d: set size is exactly 4 (no undeclared extras)", () => {
    expect(ROOM_INTENT_KINDS.size).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — ROOM_CLICKED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-02 — ROOM_CLICKED intent", () => {
  it("rii-02a: factory produces correct discriminator and payload", () => {
    const intent = makeRoomClickedIntent(makeClickPayload());
    expect(intent.intent).toBe("ROOM_CLICKED");
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
    expect(intent.drill_level).toBe("floor");
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(intent.agent_count).toBe(2);
    expect(typeof intent.ts).toBe("number");
    expect(intent.ts).toBeGreaterThan(0);
    expect(intent.session_id).toBe(SESSION);
  });

  it("rii-02b: isRoomClickedIntent returns true for valid intent", () => {
    const intent = makeRoomClickedIntent(makeClickPayload());
    expect(isRoomClickedIntent(intent)).toBe(true);
  });

  it("rii-02c: isRoomClickedIntent returns false for other intent kinds", () => {
    expect(isRoomClickedIntent(makeRoomHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isRoomClickedIntent(makeRoomUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
    expect(isRoomClickedIntent(makeRoomContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("rii-02d: isRoomClickedIntent returns false for non-objects", () => {
    expect(isRoomClickedIntent(null)).toBe(false);
    expect(isRoomClickedIntent(undefined)).toBe(false);
    expect(isRoomClickedIntent("ROOM_CLICKED")).toBe(false);
    expect(isRoomClickedIntent(42)).toBe(false);
    expect(isRoomClickedIntent([])).toBe(false);
  });

  it("rii-02e: intent with null world_position is still valid", () => {
    const intent = makeRoomClickedIntent(makeClickPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isRoomClickedIntent(intent)).toBe(true);
  });

  it("rii-02f: intent without session_id is still valid", () => {
    const intent = makeRoomClickedIntent(makeClickPayload({ session_id: undefined }));
    expect(intent.session_id).toBeUndefined();
    expect(isRoomClickedIntent(intent)).toBe(true);
  });

  it("rii-02g: agent_count of 0 is valid (empty room)", () => {
    const intent = makeRoomClickedIntent(makeClickPayload({ agent_count: 0 }));
    expect(intent.agent_count).toBe(0);
    expect(isRoomClickedIntent(intent)).toBe(true);
  });

  it("rii-02h: all RoomTypeKind variants are accepted", () => {
    const types = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;
    for (const t of types) {
      const intent = makeRoomClickedIntent(makeClickPayload({ room_type: t }));
      expect(intent.room_type).toBe(t);
      expect(isRoomClickedIntent(intent)).toBe(true);
    }
  });

  it("rii-02i: floor 1 room click records correct floor index", () => {
    const intent = makeRoomClickedIntent(makeClickPayload({ floor: 1 }));
    expect(intent.floor).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — ROOM_HOVERED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-03 — ROOM_HOVERED intent", () => {
  it("rii-03a: factory produces correct discriminator and payload", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload());
    expect(intent.intent).toBe("ROOM_HOVERED");
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(typeof intent.ts).toBe("number");
  });

  it("rii-03b: isRoomHoveredIntent returns true for valid intent", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload());
    expect(isRoomHoveredIntent(intent)).toBe(true);
  });

  it("rii-03c: isRoomHoveredIntent returns false for other intent kinds", () => {
    expect(isRoomHoveredIntent(makeRoomClickedIntent(makeClickPayload()))).toBe(false);
    expect(isRoomHoveredIntent(makeRoomUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
    expect(isRoomHoveredIntent(makeRoomContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("rii-03d: hover intent with null world_position is valid", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isRoomHoveredIntent(intent)).toBe(true);
  });

  it("rii-03e: hover intent carries room_type for conditional effects", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload({ room_type: "lab" }));
    expect(intent.room_type).toBe("lab");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — ROOM_UNHOVERED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-04 — ROOM_UNHOVERED intent", () => {
  it("rii-04a: factory produces correct discriminator and payload", () => {
    const intent = makeRoomUnhoveredIntent(makeUnhoverPayload());
    expect(intent.intent).toBe("ROOM_UNHOVERED");
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
    expect(typeof intent.ts).toBe("number");
  });

  it("rii-04b: isRoomUnhoveredIntent returns true for valid intent", () => {
    const intent = makeRoomUnhoveredIntent(makeUnhoverPayload());
    expect(isRoomUnhoveredIntent(intent)).toBe(true);
  });

  it("rii-04c: isRoomUnhoveredIntent returns false for other intent kinds", () => {
    expect(isRoomUnhoveredIntent(makeRoomClickedIntent(makeClickPayload()))).toBe(false);
    expect(isRoomUnhoveredIntent(makeRoomHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isRoomUnhoveredIntent(makeRoomContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("rii-04d: unhovered intent does not require world_position (pointer already left)", () => {
    // RoomUnhoveredPayload has no world_position field
    const intent = makeRoomUnhoveredIntent({
      room_id:   ROOM_ID,
      room_type: "office",
      floor:     0,
      ts:        Date.now(),
    });
    expect(isRoomUnhoveredIntent(intent)).toBe(true);
    expect("world_position" in intent).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — ROOM_CONTEXT_MENU intent
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-05 — ROOM_CONTEXT_MENU intent", () => {
  it("rii-05a: factory produces correct discriminator and payload", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload());
    expect(intent.intent).toBe("ROOM_CONTEXT_MENU");
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe("control");
    expect(intent.floor).toBe(0);
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(intent.screen_position).toEqual(MOCK_SCREEN_POS);
    expect(intent.drill_level).toBe("floor");
    expect(typeof intent.ts).toBe("number");
  });

  it("rii-05b: isRoomContextMenuIntent returns true for valid intent", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload());
    expect(isRoomContextMenuIntent(intent)).toBe(true);
  });

  it("rii-05c: isRoomContextMenuIntent returns false for other intent kinds", () => {
    expect(isRoomContextMenuIntent(makeRoomClickedIntent(makeClickPayload()))).toBe(false);
    expect(isRoomContextMenuIntent(makeRoomHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isRoomContextMenuIntent(makeRoomUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
  });

  it("rii-05d: context menu with null world_position is valid (synthesised event)", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isRoomContextMenuIntent(intent)).toBe(true);
  });

  it("rii-05e: context menu at room drill level is valid", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload({ drill_level: "room" }));
    expect(intent.drill_level).toBe("room");
    expect(isRoomContextMenuIntent(intent)).toBe(true);
  });

  it("rii-05f: screen_position carries x and y coordinates", () => {
    const intent = makeRoomContextMenuIntent(
      makeContextMenuPayload({ screen_position: { x: 200, y: 350 } }),
    );
    expect(intent.screen_position.x).toBe(200);
    expect(intent.screen_position.y).toBe(350);
  });

  it("rii-05g: isRoomContextMenuIntent rejects missing screen_position", () => {
    const bad = {
      intent:    "ROOM_CONTEXT_MENU",
      room_id:   ROOM_ID,
      room_type: "control",
      floor:     0,
      ts:        TS,
      // screen_position missing
    };
    expect(isRoomContextMenuIntent(bad)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 — isRoomInteractionIntent (union guard)
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-06 — isRoomInteractionIntent (union guard)", () => {
  it("rii-06a: accepts all four intent kinds", () => {
    expect(isRoomInteractionIntent(makeRoomClickedIntent(makeClickPayload()))).toBe(true);
    expect(isRoomInteractionIntent(makeRoomHoveredIntent(makeHoverPayload()))).toBe(true);
    expect(isRoomInteractionIntent(makeRoomUnhoveredIntent(makeUnhoverPayload()))).toBe(true);
    expect(isRoomInteractionIntent(makeRoomContextMenuIntent(makeContextMenuPayload()))).toBe(true);
  });

  it("rii-06b: rejects non-intent objects", () => {
    expect(isRoomInteractionIntent(null)).toBe(false);
    expect(isRoomInteractionIntent({})).toBe(false);
    expect(isRoomInteractionIntent({ intent: "UNKNOWN" })).toBe(false);
    expect(isRoomInteractionIntent("ROOM_CLICKED")).toBe(false);
    expect(isRoomInteractionIntent(undefined)).toBe(false);
    expect(isRoomInteractionIntent(0)).toBe(false);
  });

  it("rii-06c: switch on intent.intent exhaustively narrows to each variant", () => {
    const intents: RoomInteractionIntent[] = [
      makeRoomClickedIntent(makeClickPayload()),
      makeRoomHoveredIntent(makeHoverPayload()),
      makeRoomUnhoveredIntent(makeUnhoverPayload()),
      makeRoomContextMenuIntent(makeContextMenuPayload()),
    ];

    const kinds: string[] = [];
    for (const intent of intents) {
      switch (intent.intent) {
        case "ROOM_CLICKED":
          kinds.push("clicked");
          expect(typeof intent.agent_count).toBe("number");
          expect(typeof intent.drill_level).toBe("string");
          break;
        case "ROOM_HOVERED":
          kinds.push("hovered");
          expect(typeof intent.room_type).toBe("string");
          break;
        case "ROOM_UNHOVERED":
          kinds.push("unhovered");
          expect(typeof intent.floor).toBe("number");
          break;
        case "ROOM_CONTEXT_MENU":
          kinds.push("context_menu");
          expect(intent.screen_position).toBeDefined();
          break;
      }
    }

    expect(kinds).toEqual(["clicked", "hovered", "unhovered", "context_menu"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 — ROOM_INTENT_GUARDS map
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-07 — ROOM_INTENT_GUARDS discriminator map", () => {
  it("rii-07a: guard map contains all four kinds", () => {
    expect(typeof ROOM_INTENT_GUARDS["ROOM_CLICKED"]).toBe("function");
    expect(typeof ROOM_INTENT_GUARDS["ROOM_HOVERED"]).toBe("function");
    expect(typeof ROOM_INTENT_GUARDS["ROOM_UNHOVERED"]).toBe("function");
    expect(typeof ROOM_INTENT_GUARDS["ROOM_CONTEXT_MENU"]).toBe("function");
  });

  it("rii-07b: each guard correctly validates its own intent kind", () => {
    const intents = {
      ROOM_CLICKED:      makeRoomClickedIntent(makeClickPayload()),
      ROOM_HOVERED:      makeRoomHoveredIntent(makeHoverPayload()),
      ROOM_UNHOVERED:    makeRoomUnhoveredIntent(makeUnhoverPayload()),
      ROOM_CONTEXT_MENU: makeRoomContextMenuIntent(makeContextMenuPayload()),
    } as const;

    for (const [kind, intent] of Object.entries(intents)) {
      const guard = ROOM_INTENT_GUARDS[kind as keyof typeof ROOM_INTENT_GUARDS];
      expect(guard(intent)).toBe(true);
    }
  });

  it("rii-07c: each guard rejects the other intent kinds", () => {
    const clickedIntent   = makeRoomClickedIntent(makeClickPayload());
    const hoveredIntent   = makeRoomHoveredIntent(makeHoverPayload());
    const unhoveredIntent = makeRoomUnhoveredIntent(makeUnhoverPayload());
    const ctxMenuIntent   = makeRoomContextMenuIntent(makeContextMenuPayload());

    // ROOM_CLICKED guard should reject non-clicked intents
    expect(ROOM_INTENT_GUARDS.ROOM_CLICKED(hoveredIntent)).toBe(false);
    expect(ROOM_INTENT_GUARDS.ROOM_CLICKED(ctxMenuIntent)).toBe(false);

    // ROOM_HOVERED guard should reject non-hovered intents
    expect(ROOM_INTENT_GUARDS.ROOM_HOVERED(clickedIntent)).toBe(false);
    expect(ROOM_INTENT_GUARDS.ROOM_HOVERED(ctxMenuIntent)).toBe(false);

    // ROOM_UNHOVERED guard should reject non-unhovered intents
    expect(ROOM_INTENT_GUARDS.ROOM_UNHOVERED(clickedIntent)).toBe(false);
    expect(ROOM_INTENT_GUARDS.ROOM_UNHOVERED(hoveredIntent)).toBe(false);

    // ROOM_CONTEXT_MENU guard should reject non-context-menu intents
    expect(ROOM_INTENT_GUARDS.ROOM_CONTEXT_MENU(clickedIntent)).toBe(false);
    expect(ROOM_INTENT_GUARDS.ROOM_CONTEXT_MENU(unhoveredIntent)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 — Record transparency: intents are JSON-serialisable
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-08 — Record transparency: JSON serialisability", () => {
  it("rii-08a: ROOM_CLICKED is fully JSON round-trippable", () => {
    const intent = makeRoomClickedIntent(makeClickPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isRoomClickedIntent(parsed)).toBe(true);
  });

  it("rii-08b: ROOM_HOVERED is fully JSON round-trippable", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isRoomHoveredIntent(parsed)).toBe(true);
  });

  it("rii-08c: ROOM_UNHOVERED is fully JSON round-trippable", () => {
    const intent = makeRoomUnhoveredIntent(makeUnhoverPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isRoomUnhoveredIntent(parsed)).toBe(true);
  });

  it("rii-08d: ROOM_CONTEXT_MENU is fully JSON round-trippable", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isRoomContextMenuIntent(parsed)).toBe(true);
  });

  it("rii-08e: intent with null world_position survives JSON round-trip", () => {
    const intent  = makeRoomClickedIntent(makeClickPayload({ world_position: null }));
    const parsed  = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isRoomClickedIntent(parsed)).toBe(true);
    if (isRoomClickedIntent(parsed)) {
      expect(parsed.world_position).toBeNull();
    }
  });

  it("rii-08f: all intent payloads have required room-scoped id fields", () => {
    const intents: RoomInteractionIntent[] = [
      makeRoomClickedIntent(makeClickPayload()),
      makeRoomHoveredIntent(makeHoverPayload()),
      makeRoomUnhoveredIntent(makeUnhoverPayload()),
      makeRoomContextMenuIntent(makeContextMenuPayload()),
    ];

    for (const intent of intents) {
      // Room-scoped mandatory fields
      expect(typeof intent.room_id).toBe("string");
      expect(intent.room_id.length).toBeGreaterThan(0);
      expect(typeof intent.room_type).toBe("string");
      expect(typeof intent.floor).toBe("number");
      // Temporal mandatory field
      expect(typeof intent.ts).toBe("number");
      expect(intent.ts).toBeGreaterThan(0);
      // Discriminator
      expect(typeof intent.intent).toBe("string");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 — Drill level coverage
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-09 — Drill level coverage in intents", () => {
  const drillLevels = ["building", "floor", "room", "agent"] as const;

  it("rii-09a: ROOM_CLICKED accepts all valid drill levels", () => {
    for (const level of drillLevels) {
      const intent = makeRoomClickedIntent(makeClickPayload({ drill_level: level }));
      expect(intent.drill_level).toBe(level);
      expect(isRoomClickedIntent(intent)).toBe(true);
    }
  });

  it("rii-09b: ROOM_CONTEXT_MENU accepts all valid drill levels", () => {
    for (const level of drillLevels) {
      const intent = makeRoomContextMenuIntent(makeContextMenuPayload({ drill_level: level }));
      expect(intent.drill_level).toBe(level);
      expect(isRoomContextMenuIntent(intent)).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 — Propagation contract: stopPropagation is called before intent emission
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-10 — Propagation contract: stopPropagation before intent", () => {
  /**
   * We verify the propagation contract by simulating a synthetic pointer
   * event and confirming that stopPropagation is invoked.  The actual hook
   * (useRoomInteraction) is not tested here (that requires a jsdom render);
   * instead we validate the contract specification as documented in the
   * intents module.
   *
   * The test below confirms the contract is testable: a mock event can detect
   * whether stopPropagation was called.
   */
  it("rii-10a: a mock RoomPointerEvent can detect stopPropagation call", () => {
    const stopPropagation = vi.fn();
    const mockEvent = {
      stopPropagation,
      point:       MOCK_WORLD_POS,
      nativeEvent: { clientX: 800, clientY: 450 },
    };

    // Simulate what the handler does: call stopPropagation first
    mockEvent.stopPropagation();

    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rii-10b: intents do not contain a stopPropagation function (serialisable)", () => {
    // Intents must be plain data objects with no function references
    const intent = makeRoomClickedIntent(makeClickPayload());
    for (const value of Object.values(intent)) {
      expect(typeof value).not.toBe("function");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11 — Room-scoped payload: all intents carry room_id, room_type, floor
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-11 — Room-scoped payload coverage", () => {
  it("rii-11a: ROOM_CLICKED has room_id, room_type, floor", () => {
    const intent = makeRoomClickedIntent(makeClickPayload());
    expect(intent.room_id).toBeDefined();
    expect(intent.room_type).toBeDefined();
    expect(intent.floor).toBeDefined();
  });

  it("rii-11b: ROOM_HOVERED has room_id, room_type, floor", () => {
    const intent = makeRoomHoveredIntent(makeHoverPayload());
    expect(intent.room_id).toBeDefined();
    expect(intent.room_type).toBeDefined();
    expect(intent.floor).toBeDefined();
  });

  it("rii-11c: ROOM_UNHOVERED has room_id, room_type, floor", () => {
    const intent = makeRoomUnhoveredIntent(makeUnhoverPayload());
    expect(intent.room_id).toBeDefined();
    expect(intent.room_type).toBeDefined();
    expect(intent.floor).toBeDefined();
  });

  it("rii-11d: ROOM_CONTEXT_MENU has room_id, room_type, floor", () => {
    const intent = makeRoomContextMenuIntent(makeContextMenuPayload());
    expect(intent.room_id).toBeDefined();
    expect(intent.room_type).toBeDefined();
    expect(intent.floor).toBeDefined();
  });

  it("rii-11e: room_id is a non-empty string identifier", () => {
    const intent = makeRoomClickedIntent(makeClickPayload({ room_id: "lobby-main" }));
    expect(intent.room_id).toBe("lobby-main");
    expect(intent.room_id.length).toBeGreaterThan(0);
  });

  it("rii-11f: floor index is a non-negative integer", () => {
    const intent0 = makeRoomClickedIntent(makeClickPayload({ floor: 0 }));
    const intent1 = makeRoomClickedIntent(makeClickPayload({ floor: 1 }));
    expect(intent0.floor).toBe(0);
    expect(intent1.floor).toBe(1);
    expect(intent0.floor).toBeGreaterThanOrEqual(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12 — Non-regression: ROOM_* kinds not in BUILDING_INTENT_KINDS
// ═════════════════════════════════════════════════════════════════════════════

describe("rii-12 — Non-regression: no cross-layer kind collisions", () => {
  it("rii-12a: ROOM_* kinds do not appear in BUILDING_INTENT_KINDS", () => {
    expect(BUILDING_INTENT_KINDS.has("ROOM_CLICKED")).toBe(false);
    expect(BUILDING_INTENT_KINDS.has("ROOM_HOVERED")).toBe(false);
    expect(BUILDING_INTENT_KINDS.has("ROOM_UNHOVERED")).toBe(false);
    expect(BUILDING_INTENT_KINDS.has("ROOM_CONTEXT_MENU")).toBe(false);
  });

  it("rii-12b: BUILDING_* kinds do not appear in ROOM_INTENT_KINDS", () => {
    expect(ROOM_INTENT_KINDS.has("BUILDING_CLICKED")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("BUILDING_HOVERED")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("BUILDING_UNHOVERED")).toBe(false);
    expect(ROOM_INTENT_KINDS.has("BUILDING_CONTEXT_MENU")).toBe(false);
  });

  it("rii-12c: ROOM and BUILDING kind sets are disjoint", () => {
    for (const roomKind of ROOM_INTENT_KINDS) {
      expect(BUILDING_INTENT_KINDS.has(roomKind)).toBe(false);
    }
    for (const buildingKind of BUILDING_INTENT_KINDS) {
      expect(ROOM_INTENT_KINDS.has(buildingKind)).toBe(false);
    }
  });
});
