/**
 * building-interaction-intents.test.ts
 *
 * Sub-AC 4a — typed building-layer interaction intents.
 *
 * Tests cover:
 *   1. Intent factory functions produce correct payload shapes
 *   2. Type guards narrow unknown values correctly
 *   3. Discriminated union discriminators are correct
 *   4. Payload guard map covers all intent kinds
 *   5. isBuildingInteractionIntentKind membership check
 *   6. Edge-cases: null positions, missing optional fields
 *   7. Record transparency: intents are serialisable to JSON
 *
 * Test ID scheme:
 *   bii-N : building-interaction-intents
 */

import { describe, it, expect } from "vitest";
import {
  // Constants / discriminators
  BUILDING_INTENT_KINDS,
  isBuildingInteractionIntentKind,
  // Factories
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
  // Type guards
  isBuildingClickedIntent,
  isBuildingHoveredIntent,
  isBuildingUnhoveredIntent,
  isBuildingContextMenuIntent,
  isBuildingInteractionIntent,
  // Guard map
  BUILDING_INTENT_GUARDS,
  // Types (imported for doc; no runtime value)
  type BuildingInteractionIntent,
  type BuildingClickedPayload,
  type BuildingHoveredPayload,
  type BuildingUnhoveredPayload,
  type BuildingContextMenuPayload,
} from "../building-interaction-intents.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_WORLD_POS = { x: 3.5, y: 0, z: 2.5 };
const MOCK_SCREEN_POS = { x: 640, y: 400 };
const BUILDING_ID = "hq";
const SESSION = "test-session-001";

function makeClickPayload(
  overrides: Partial<BuildingClickedPayload> = {},
): BuildingClickedPayload {
  return {
    building_id: BUILDING_ID,
    drill_level: "building",
    world_position: MOCK_WORLD_POS,
    floor_count: 2,
    ts: 1_700_000_000_000,
    session_id: SESSION,
    ...overrides,
  };
}

function makeHoverPayload(
  overrides: Partial<BuildingHoveredPayload> = {},
): BuildingHoveredPayload {
  return {
    building_id: BUILDING_ID,
    world_position: MOCK_WORLD_POS,
    ts: 1_700_000_001_000,
    session_id: SESSION,
    ...overrides,
  };
}

function makeUnhoverPayload(
  overrides: Partial<BuildingUnhoveredPayload> = {},
): BuildingUnhoveredPayload {
  return {
    building_id: BUILDING_ID,
    ts: 1_700_000_002_000,
    session_id: SESSION,
    ...overrides,
  };
}

function makeContextMenuPayload(
  overrides: Partial<BuildingContextMenuPayload> = {},
): BuildingContextMenuPayload {
  return {
    building_id: BUILDING_ID,
    world_position: MOCK_WORLD_POS,
    screen_position: MOCK_SCREEN_POS,
    drill_level: "building",
    ts: 1_700_000_003_000,
    session_id: SESSION,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Intent discriminator set
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-01 — BUILDING_INTENT_KINDS set", () => {
  it("bii-01a: contains all four building intent kinds", () => {
    expect(BUILDING_INTENT_KINDS.has("BUILDING_CLICKED")).toBe(true);
    expect(BUILDING_INTENT_KINDS.has("BUILDING_HOVERED")).toBe(true);
    expect(BUILDING_INTENT_KINDS.has("BUILDING_UNHOVERED")).toBe(true);
    expect(BUILDING_INTENT_KINDS.has("BUILDING_CONTEXT_MENU")).toBe(true);
  });

  it("bii-01b: does not contain unrelated strings", () => {
    expect(BUILDING_INTENT_KINDS.has("ROOM_CLICKED")).toBe(false);
    expect(BUILDING_INTENT_KINDS.has("")).toBe(false);
    expect(BUILDING_INTENT_KINDS.has("building_clicked")).toBe(false); // case sensitive
  });

  it("bii-01c: isBuildingInteractionIntentKind narrows correctly", () => {
    expect(isBuildingInteractionIntentKind("BUILDING_CLICKED")).toBe(true);
    expect(isBuildingInteractionIntentKind("BUILDING_HOVERED")).toBe(true);
    expect(isBuildingInteractionIntentKind("BUILDING_UNHOVERED")).toBe(true);
    expect(isBuildingInteractionIntentKind("BUILDING_CONTEXT_MENU")).toBe(true);
    expect(isBuildingInteractionIntentKind("AGENT_CLICKED")).toBe(false);
    expect(isBuildingInteractionIntentKind("")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — BUILDING_CLICKED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-02 — BUILDING_CLICKED intent", () => {
  it("bii-02a: factory produces correct discriminator and payload", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload());
    expect(intent.intent).toBe("BUILDING_CLICKED");
    expect(intent.building_id).toBe(BUILDING_ID);
    expect(intent.drill_level).toBe("building");
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(intent.floor_count).toBe(2);
    expect(typeof intent.ts).toBe("number");
    expect(intent.ts).toBeGreaterThan(0);
    expect(intent.session_id).toBe(SESSION);
  });

  it("bii-02b: isBuildingClickedIntent returns true for valid intent", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload());
    expect(isBuildingClickedIntent(intent)).toBe(true);
  });

  it("bii-02c: isBuildingClickedIntent returns false for other intent kinds", () => {
    expect(isBuildingClickedIntent(makeBuildingHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isBuildingClickedIntent(makeBuildingUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
    expect(isBuildingClickedIntent(makeBuildingContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("bii-02d: isBuildingClickedIntent returns false for non-objects", () => {
    expect(isBuildingClickedIntent(null)).toBe(false);
    expect(isBuildingClickedIntent(undefined)).toBe(false);
    expect(isBuildingClickedIntent("BUILDING_CLICKED")).toBe(false);
    expect(isBuildingClickedIntent(42)).toBe(false);
  });

  it("bii-02e: intent with null world_position is still valid", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isBuildingClickedIntent(intent)).toBe(true);
  });

  it("bii-02f: intent without session_id is still valid", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload({ session_id: undefined }));
    expect(intent.session_id).toBeUndefined();
    expect(isBuildingClickedIntent(intent)).toBe(true);
  });

  it("bii-02g: click at floor drill level has correct drill_level", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload({ drill_level: "floor" }));
    expect(intent.drill_level).toBe("floor");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — BUILDING_HOVERED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-03 — BUILDING_HOVERED intent", () => {
  it("bii-03a: factory produces correct discriminator and payload", () => {
    const intent = makeBuildingHoveredIntent(makeHoverPayload());
    expect(intent.intent).toBe("BUILDING_HOVERED");
    expect(intent.building_id).toBe(BUILDING_ID);
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(typeof intent.ts).toBe("number");
  });

  it("bii-03b: isBuildingHoveredIntent returns true for valid intent", () => {
    const intent = makeBuildingHoveredIntent(makeHoverPayload());
    expect(isBuildingHoveredIntent(intent)).toBe(true);
  });

  it("bii-03c: isBuildingHoveredIntent returns false for other intent kinds", () => {
    expect(isBuildingHoveredIntent(makeBuildingClickedIntent(makeClickPayload()))).toBe(false);
    expect(isBuildingHoveredIntent(makeBuildingUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
    expect(isBuildingHoveredIntent(makeBuildingContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("bii-03d: hover intent with null world_position is valid", () => {
    const intent = makeBuildingHoveredIntent(makeHoverPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isBuildingHoveredIntent(intent)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — BUILDING_UNHOVERED intent
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-04 — BUILDING_UNHOVERED intent", () => {
  it("bii-04a: factory produces correct discriminator and payload", () => {
    const intent = makeBuildingUnhoveredIntent(makeUnhoverPayload());
    expect(intent.intent).toBe("BUILDING_UNHOVERED");
    expect(intent.building_id).toBe(BUILDING_ID);
    expect(typeof intent.ts).toBe("number");
  });

  it("bii-04b: isBuildingUnhoveredIntent returns true for valid intent", () => {
    const intent = makeBuildingUnhoveredIntent(makeUnhoverPayload());
    expect(isBuildingUnhoveredIntent(intent)).toBe(true);
  });

  it("bii-04c: isBuildingUnhoveredIntent returns false for other intent kinds", () => {
    expect(isBuildingUnhoveredIntent(makeBuildingClickedIntent(makeClickPayload()))).toBe(false);
    expect(isBuildingUnhoveredIntent(makeBuildingHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isBuildingUnhoveredIntent(makeBuildingContextMenuIntent(makeContextMenuPayload()))).toBe(false);
  });

  it("bii-04d: unhovered intent does not require world_position (pointer already left)", () => {
    const intent = makeBuildingUnhoveredIntent({ building_id: BUILDING_ID, ts: Date.now() });
    expect(isBuildingUnhoveredIntent(intent)).toBe(true);
    // No world_position field at all
    expect("world_position" in intent).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — BUILDING_CONTEXT_MENU intent
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-05 — BUILDING_CONTEXT_MENU intent", () => {
  it("bii-05a: factory produces correct discriminator and payload", () => {
    const intent = makeBuildingContextMenuIntent(makeContextMenuPayload());
    expect(intent.intent).toBe("BUILDING_CONTEXT_MENU");
    expect(intent.building_id).toBe(BUILDING_ID);
    expect(intent.world_position).toEqual(MOCK_WORLD_POS);
    expect(intent.screen_position).toEqual(MOCK_SCREEN_POS);
    expect(intent.drill_level).toBe("building");
    expect(typeof intent.ts).toBe("number");
  });

  it("bii-05b: isBuildingContextMenuIntent returns true for valid intent", () => {
    const intent = makeBuildingContextMenuIntent(makeContextMenuPayload());
    expect(isBuildingContextMenuIntent(intent)).toBe(true);
  });

  it("bii-05c: isBuildingContextMenuIntent returns false for other intent kinds", () => {
    expect(isBuildingContextMenuIntent(makeBuildingClickedIntent(makeClickPayload()))).toBe(false);
    expect(isBuildingContextMenuIntent(makeBuildingHoveredIntent(makeHoverPayload()))).toBe(false);
    expect(isBuildingContextMenuIntent(makeBuildingUnhoveredIntent(makeUnhoverPayload()))).toBe(false);
  });

  it("bii-05d: context menu with null world_position is valid (synthesised event)", () => {
    const intent = makeBuildingContextMenuIntent(makeContextMenuPayload({ world_position: null }));
    expect(intent.world_position).toBeNull();
    expect(isBuildingContextMenuIntent(intent)).toBe(true);
  });

  it("bii-05e: context menu at floor drill level has correct drill_level", () => {
    const intent = makeBuildingContextMenuIntent(makeContextMenuPayload({ drill_level: "floor" }));
    expect(intent.drill_level).toBe("floor");
  });

  it("bii-05f: screen_position carries x and y coordinates", () => {
    const intent = makeBuildingContextMenuIntent(
      makeContextMenuPayload({ screen_position: { x: 100, y: 200 } }),
    );
    expect(intent.screen_position.x).toBe(100);
    expect(intent.screen_position.y).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 — isBuildingInteractionIntent (union guard)
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-06 — isBuildingInteractionIntent (union guard)", () => {
  it("bii-06a: accepts all four intent kinds", () => {
    expect(isBuildingInteractionIntent(makeBuildingClickedIntent(makeClickPayload()))).toBe(true);
    expect(isBuildingInteractionIntent(makeBuildingHoveredIntent(makeHoverPayload()))).toBe(true);
    expect(isBuildingInteractionIntent(makeBuildingUnhoveredIntent(makeUnhoverPayload()))).toBe(true);
    expect(isBuildingInteractionIntent(makeBuildingContextMenuIntent(makeContextMenuPayload()))).toBe(true);
  });

  it("bii-06b: rejects non-intent objects", () => {
    expect(isBuildingInteractionIntent(null)).toBe(false);
    expect(isBuildingInteractionIntent({})).toBe(false);
    expect(isBuildingInteractionIntent({ intent: "UNKNOWN" })).toBe(false);
    expect(isBuildingInteractionIntent("BUILDING_CLICKED")).toBe(false);
  });

  it("bii-06c: switch on intent.intent exhaustively narrows to each variant", () => {
    const intents: BuildingInteractionIntent[] = [
      makeBuildingClickedIntent(makeClickPayload()),
      makeBuildingHoveredIntent(makeHoverPayload()),
      makeBuildingUnhoveredIntent(makeUnhoverPayload()),
      makeBuildingContextMenuIntent(makeContextMenuPayload()),
    ];

    const kinds: string[] = [];
    for (const intent of intents) {
      switch (intent.intent) {
        case "BUILDING_CLICKED":
          kinds.push("clicked");
          // TypeScript should narrow intent to BuildingClickedIntent here
          expect(intent.floor_count).toBeGreaterThanOrEqual(0);
          break;
        case "BUILDING_HOVERED":
          kinds.push("hovered");
          break;
        case "BUILDING_UNHOVERED":
          kinds.push("unhovered");
          break;
        case "BUILDING_CONTEXT_MENU":
          kinds.push("context_menu");
          expect(intent.screen_position).toBeDefined();
          break;
      }
    }

    expect(kinds).toEqual(["clicked", "hovered", "unhovered", "context_menu"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 — BUILDING_INTENT_GUARDS map
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-07 — BUILDING_INTENT_GUARDS discriminator map", () => {
  it("bii-07a: guard map contains all four kinds", () => {
    expect(typeof BUILDING_INTENT_GUARDS["BUILDING_CLICKED"]).toBe("function");
    expect(typeof BUILDING_INTENT_GUARDS["BUILDING_HOVERED"]).toBe("function");
    expect(typeof BUILDING_INTENT_GUARDS["BUILDING_UNHOVERED"]).toBe("function");
    expect(typeof BUILDING_INTENT_GUARDS["BUILDING_CONTEXT_MENU"]).toBe("function");
  });

  it("bii-07b: each guard correctly validates its own intent kind", () => {
    const intents = {
      BUILDING_CLICKED:      makeBuildingClickedIntent(makeClickPayload()),
      BUILDING_HOVERED:      makeBuildingHoveredIntent(makeHoverPayload()),
      BUILDING_UNHOVERED:    makeBuildingUnhoveredIntent(makeUnhoverPayload()),
      BUILDING_CONTEXT_MENU: makeBuildingContextMenuIntent(makeContextMenuPayload()),
    } as const;

    for (const [kind, intent] of Object.entries(intents)) {
      const guard = BUILDING_INTENT_GUARDS[kind as keyof typeof BUILDING_INTENT_GUARDS];
      expect(guard(intent)).toBe(true);
    }
  });

  it("bii-07c: each guard rejects the other intent kinds", () => {
    const clickedIntent   = makeBuildingClickedIntent(makeClickPayload());
    const hoveredIntent   = makeBuildingHoveredIntent(makeHoverPayload());
    const unhoveredIntent = makeBuildingUnhoveredIntent(makeUnhoverPayload());
    const ctxMenuIntent   = makeBuildingContextMenuIntent(makeContextMenuPayload());

    // BUILDING_CLICKED guard should reject non-clicked intents
    expect(BUILDING_INTENT_GUARDS.BUILDING_CLICKED(hoveredIntent)).toBe(false);
    expect(BUILDING_INTENT_GUARDS.BUILDING_CLICKED(ctxMenuIntent)).toBe(false);

    // BUILDING_HOVERED guard should reject non-hovered intents
    expect(BUILDING_INTENT_GUARDS.BUILDING_HOVERED(clickedIntent)).toBe(false);
    expect(BUILDING_INTENT_GUARDS.BUILDING_HOVERED(ctxMenuIntent)).toBe(false);

    // BUILDING_UNHOVERED guard should reject non-unhovered intents
    expect(BUILDING_INTENT_GUARDS.BUILDING_UNHOVERED(clickedIntent)).toBe(false);
    expect(BUILDING_INTENT_GUARDS.BUILDING_UNHOVERED(hoveredIntent)).toBe(false);

    // BUILDING_CONTEXT_MENU guard should reject non-context-menu intents
    expect(BUILDING_INTENT_GUARDS.BUILDING_CONTEXT_MENU(clickedIntent)).toBe(false);
    expect(BUILDING_INTENT_GUARDS.BUILDING_CONTEXT_MENU(unhoveredIntent)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 — Record transparency: intents are JSON-serialisable
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-08 — Record transparency: JSON serialisability", () => {
  it("bii-08a: BUILDING_CLICKED is fully JSON round-trippable", () => {
    const intent = makeBuildingClickedIntent(makeClickPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isBuildingClickedIntent(parsed)).toBe(true);
  });

  it("bii-08b: BUILDING_HOVERED is fully JSON round-trippable", () => {
    const intent = makeBuildingHoveredIntent(makeHoverPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isBuildingHoveredIntent(parsed)).toBe(true);
  });

  it("bii-08c: BUILDING_UNHOVERED is fully JSON round-trippable", () => {
    const intent = makeBuildingUnhoveredIntent(makeUnhoverPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isBuildingUnhoveredIntent(parsed)).toBe(true);
  });

  it("bii-08d: BUILDING_CONTEXT_MENU is fully JSON round-trippable", () => {
    const intent = makeBuildingContextMenuIntent(makeContextMenuPayload());
    const json   = JSON.stringify(intent);
    const parsed = JSON.parse(json) as unknown;
    expect(isBuildingContextMenuIntent(parsed)).toBe(true);
  });

  it("bii-08e: intent with null world_position survives JSON round-trip", () => {
    const intent  = makeBuildingClickedIntent(makeClickPayload({ world_position: null }));
    const parsed  = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isBuildingClickedIntent(parsed)).toBe(true);
    if (isBuildingClickedIntent(parsed)) {
      expect(parsed.world_position).toBeNull();
    }
  });

  it("bii-08f: all intent payloads have required id fields (building_id, ts)", () => {
    const intents: BuildingInteractionIntent[] = [
      makeBuildingClickedIntent(makeClickPayload()),
      makeBuildingHoveredIntent(makeHoverPayload()),
      makeBuildingUnhoveredIntent(makeUnhoverPayload()),
      makeBuildingContextMenuIntent(makeContextMenuPayload()),
    ];

    for (const intent of intents) {
      expect(typeof intent.building_id).toBe("string");
      expect(intent.building_id.length).toBeGreaterThan(0);
      expect(typeof intent.ts).toBe("number");
      expect(intent.ts).toBeGreaterThan(0);
      expect(typeof intent.intent).toBe("string");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 — Drill level coverage
// ═════════════════════════════════════════════════════════════════════════════

describe("bii-09 — Drill level coverage in intents", () => {
  const drillLevels = ["building", "floor", "room", "agent"] as const;

  it("bii-09a: BUILDING_CLICKED accepts all valid drill levels", () => {
    for (const level of drillLevels) {
      const intent = makeBuildingClickedIntent(makeClickPayload({ drill_level: level }));
      expect(intent.drill_level).toBe(level);
      expect(isBuildingClickedIntent(intent)).toBe(true);
    }
  });

  it("bii-09b: BUILDING_CONTEXT_MENU accepts all valid drill levels", () => {
    for (const level of drillLevels) {
      const intent = makeBuildingContextMenuIntent(makeContextMenuPayload({ drill_level: level }));
      expect(intent.drill_level).toBe(level);
      expect(isBuildingContextMenuIntent(intent)).toBe(true);
    }
  });
});
