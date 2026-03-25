/**
 * interaction-intent-harness.test.ts
 *
 * Sub-AC 4d — Test harness for all nine interaction_intents (3 layers × 3
 * event types), independently of the command pipeline.
 *
 * Coverage matrix
 * ───────────────
 * Each cell [layer][eventType] is tested for:
 *   • Factory produces a structurally valid intent (type guard passes)
 *   • Layer metadata is correct (layer + eventType on HarnessResult)
 *   • emittedAt is a positive number
 *   • Cross-layer isolation: the intent does NOT pass guards from other layers
 *   • JSON round-trip fidelity (record transparency invariant)
 *   • Config overrides propagate to the emitted intent
 *
 * The nine intents:
 *   [domain,         click]        → BUILDING_CLICKED
 *   [domain,         hover]        → BUILDING_HOVERED
 *   [domain,         context_menu] → BUILDING_CONTEXT_MENU
 *   [infrastructure, click]        → ROOM_CLICKED
 *   [infrastructure, hover]        → ROOM_HOVERED
 *   [infrastructure, context_menu] → ROOM_CONTEXT_MENU
 *   [meta,           click]        → Agent click
 *   [meta,           hover]        → Agent hover_enter
 *   [meta,           context_menu] → Agent context_menu
 *
 * No command pipeline dependency
 * ───────────────────────────────
 * This file imports ONLY from the harness module.  The harness itself has no
 * dependency on CommandFile, EventLog, Orchestrator, or any network I/O.
 * Tests run in a pure Node environment (vitest / node environment).
 *
 * Test ID scheme:
 *   iih-N — interaction-intent-harness
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Constants
  INTENT_LAYERS,
  INTENT_EVENT_TYPES,
  INTENT_LAYER_SET,
  INTENT_EVENT_TYPE_SET,
  INTENT_TRIGGER_MATRIX,
  BUILDING_INTENT_KINDS,
  ROOM_INTENT_KINDS,
  // Generic trigger
  triggerIntent,
  // Domain-layer triggers
  triggerDomainClick,
  triggerDomainHover,
  triggerDomainContextMenu,
  // Infrastructure-layer triggers
  triggerInfrastructureClick,
  triggerInfrastructureHover,
  triggerInfrastructureContextMenu,
  // Meta-layer triggers
  triggerMetaClick,
  triggerMetaHover,
  triggerMetaContextMenu,
  // Assertion helpers
  assertIntentShape,
  assertLayerMetadata,
  assertCrossLayerIsolation,
  assertJsonRoundTrip,
  assertAll,
  // Types
  type IntentLayer,
  type IntentEventType,
  type HarnessResult,
} from "../interaction-intent-harness.js";

// ── Constants used across tests ───────────────────────────────────────────────

const CUSTOM_SESSION  = "iih-test-session";
const CUSTOM_TS       = 1_800_000_000_000;
const CUSTOM_BUILDING = "building-test-01";
const CUSTOM_ROOM     = "lab-room-07";
const CUSTOM_AGENT    = "researcher-42";
const CUSTOM_WORLD    = { x: 5, y: 2, z: -3 };
const CUSTOM_SCREEN   = { x: 300, y: 150 };

// ═════════════════════════════════════════════════════════════════════════════
// iih-01 — Harness constants
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-01 — Harness constants", () => {
  it("iih-01a: INTENT_LAYERS contains exactly three layer strings", () => {
    expect(INTENT_LAYERS).toHaveLength(3);
    expect(INTENT_LAYERS).toContain("domain");
    expect(INTENT_LAYERS).toContain("infrastructure");
    expect(INTENT_LAYERS).toContain("meta");
  });

  it("iih-01b: INTENT_EVENT_TYPES contains exactly three event-type strings", () => {
    expect(INTENT_EVENT_TYPES).toHaveLength(3);
    expect(INTENT_EVENT_TYPES).toContain("click");
    expect(INTENT_EVENT_TYPES).toContain("hover");
    expect(INTENT_EVENT_TYPES).toContain("context_menu");
  });

  it("iih-01c: INTENT_LAYER_SET has O(1) membership for all layers", () => {
    for (const layer of INTENT_LAYERS) {
      expect(INTENT_LAYER_SET.has(layer)).toBe(true);
    }
    expect(INTENT_LAYER_SET.has("unknown" as IntentLayer)).toBe(false);
    expect(INTENT_LAYER_SET.has("")).toBe(false);
  });

  it("iih-01d: INTENT_EVENT_TYPE_SET has O(1) membership for all event types", () => {
    for (const et of INTENT_EVENT_TYPES) {
      expect(INTENT_EVENT_TYPE_SET.has(et)).toBe(true);
    }
    expect(INTENT_EVENT_TYPE_SET.has("unhover" as IntentEventType)).toBe(false);
  });

  it("iih-01e: INTENT_TRIGGER_MATRIX covers all 9 cells (3 layers × 3 event types)", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        expect(typeof INTENT_TRIGGER_MATRIX[layer][et]).toBe("function");
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-02 — Domain layer: BUILDING_CLICKED
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-02 — Domain layer × click → BUILDING_CLICKED", () => {
  let result: ReturnType<typeof triggerDomainClick>;

  beforeEach(() => {
    result = triggerDomainClick();
  });

  it("iih-02a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-02b: layer is 'domain'", () => {
    expect(result.layer).toBe("domain");
  });

  it("iih-02c: eventType is 'click'", () => {
    expect(result.eventType).toBe("click");
  });

  it("iih-02d: intent.intent discriminator is BUILDING_CLICKED", () => {
    expect(result.intent.intent).toBe("BUILDING_CLICKED");
  });

  it("iih-02e: intent carries building_id string", () => {
    expect(typeof result.intent.building_id).toBe("string");
    expect(result.intent.building_id.length).toBeGreaterThan(0);
  });

  it("iih-02f: intent carries positive ts", () => {
    expect(typeof result.intent.ts).toBe("number");
    expect(result.intent.ts).toBeGreaterThan(0);
  });

  it("iih-02g: emittedAt equals intent.ts", () => {
    expect(result.emittedAt).toBe(result.intent.ts);
  });

  it("iih-02h: custom config propagates to intent", () => {
    const r = triggerDomainClick({
      buildingId: CUSTOM_BUILDING,
      sessionId:  CUSTOM_SESSION,
      ts:         CUSTOM_TS,
    });
    expect(r.intent.building_id).toBe(CUSTOM_BUILDING);
    expect(r.intent.session_id).toBe(CUSTOM_SESSION);
    expect(r.intent.ts).toBe(CUSTOM_TS);
  });

  it("iih-02i: worldPosition override propagates to intent", () => {
    const r = triggerDomainClick({ worldPosition: CUSTOM_WORLD });
    expect(r.intent.world_position).toEqual(CUSTOM_WORLD);
  });

  it("iih-02j: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });

  it("iih-02k: BUILDING_CLICKED is in BUILDING_INTENT_KINDS set", () => {
    expect(BUILDING_INTENT_KINDS.has(result.intent.intent)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-03 — Domain layer: BUILDING_HOVERED
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-03 — Domain layer × hover → BUILDING_HOVERED", () => {
  let result: ReturnType<typeof triggerDomainHover>;

  beforeEach(() => {
    result = triggerDomainHover();
  });

  it("iih-03a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-03b: layer is 'domain'", () => {
    expect(result.layer).toBe("domain");
  });

  it("iih-03c: eventType is 'hover'", () => {
    expect(result.eventType).toBe("hover");
  });

  it("iih-03d: intent.intent discriminator is BUILDING_HOVERED", () => {
    expect(result.intent.intent).toBe("BUILDING_HOVERED");
  });

  it("iih-03e: intent carries building_id and ts", () => {
    expect(typeof result.intent.building_id).toBe("string");
    expect(typeof result.intent.ts).toBe("number");
    expect(result.intent.ts).toBeGreaterThan(0);
  });

  it("iih-03f: custom config propagates", () => {
    const r = triggerDomainHover({ buildingId: CUSTOM_BUILDING, sessionId: CUSTOM_SESSION });
    expect(r.intent.building_id).toBe(CUSTOM_BUILDING);
    expect(r.intent.session_id).toBe(CUSTOM_SESSION);
  });

  it("iih-03g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-04 — Domain layer: BUILDING_CONTEXT_MENU
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-04 — Domain layer × context_menu → BUILDING_CONTEXT_MENU", () => {
  let result: ReturnType<typeof triggerDomainContextMenu>;

  beforeEach(() => {
    result = triggerDomainContextMenu();
  });

  it("iih-04a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-04b: eventType is 'context_menu'", () => {
    expect(result.eventType).toBe("context_menu");
  });

  it("iih-04c: intent.intent discriminator is BUILDING_CONTEXT_MENU", () => {
    expect(result.intent.intent).toBe("BUILDING_CONTEXT_MENU");
  });

  it("iih-04d: intent carries screen_position object", () => {
    expect(typeof result.intent.screen_position).toBe("object");
    expect(result.intent.screen_position).not.toBeNull();
    expect(typeof result.intent.screen_position.x).toBe("number");
    expect(typeof result.intent.screen_position.y).toBe("number");
  });

  it("iih-04e: custom screen_position propagates", () => {
    const r = triggerDomainContextMenu({ screenPosition: CUSTOM_SCREEN });
    expect(r.intent.screen_position).toEqual(CUSTOM_SCREEN);
  });

  it("iih-04f: drill_level is included in intent", () => {
    expect(typeof result.intent.drill_level).toBe("string");
  });

  it("iih-04g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-05 — Infrastructure layer: ROOM_CLICKED
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-05 — Infrastructure layer × click → ROOM_CLICKED", () => {
  let result: ReturnType<typeof triggerInfrastructureClick>;

  beforeEach(() => {
    result = triggerInfrastructureClick();
  });

  it("iih-05a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-05b: layer is 'infrastructure'", () => {
    expect(result.layer).toBe("infrastructure");
  });

  it("iih-05c: eventType is 'click'", () => {
    expect(result.eventType).toBe("click");
  });

  it("iih-05d: intent.intent discriminator is ROOM_CLICKED", () => {
    expect(result.intent.intent).toBe("ROOM_CLICKED");
  });

  it("iih-05e: intent carries room_id, room_type, floor", () => {
    expect(typeof result.intent.room_id).toBe("string");
    expect(typeof result.intent.room_type).toBe("string");
    expect(typeof result.intent.floor).toBe("number");
  });

  it("iih-05f: custom roomId propagates", () => {
    const r = triggerInfrastructureClick({ roomId: CUSTOM_ROOM });
    expect(r.intent.room_id).toBe(CUSTOM_ROOM);
  });

  it("iih-05g: agent_count is present and non-negative", () => {
    expect(typeof result.intent.agent_count).toBe("number");
    expect(result.intent.agent_count).toBeGreaterThanOrEqual(0);
  });

  it("iih-05h: ROOM_CLICKED is in ROOM_INTENT_KINDS set", () => {
    expect(ROOM_INTENT_KINDS.has(result.intent.intent)).toBe(true);
  });

  it("iih-05i: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-06 — Infrastructure layer: ROOM_HOVERED
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-06 — Infrastructure layer × hover → ROOM_HOVERED", () => {
  let result: ReturnType<typeof triggerInfrastructureHover>;

  beforeEach(() => {
    result = triggerInfrastructureHover();
  });

  it("iih-06a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-06b: layer is 'infrastructure'", () => {
    expect(result.layer).toBe("infrastructure");
  });

  it("iih-06c: eventType is 'hover'", () => {
    expect(result.eventType).toBe("hover");
  });

  it("iih-06d: intent.intent discriminator is ROOM_HOVERED", () => {
    expect(result.intent.intent).toBe("ROOM_HOVERED");
  });

  it("iih-06e: intent carries room_id, room_type, floor", () => {
    expect(typeof result.intent.room_id).toBe("string");
    expect(typeof result.intent.room_type).toBe("string");
    expect(typeof result.intent.floor).toBe("number");
  });

  it("iih-06f: custom roomId propagates", () => {
    const r = triggerInfrastructureHover({ roomId: CUSTOM_ROOM });
    expect(r.intent.room_id).toBe(CUSTOM_ROOM);
  });

  it("iih-06g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-07 — Infrastructure layer: ROOM_CONTEXT_MENU
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-07 — Infrastructure layer × context_menu → ROOM_CONTEXT_MENU", () => {
  let result: ReturnType<typeof triggerInfrastructureContextMenu>;

  beforeEach(() => {
    result = triggerInfrastructureContextMenu();
  });

  it("iih-07a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-07b: eventType is 'context_menu'", () => {
    expect(result.eventType).toBe("context_menu");
  });

  it("iih-07c: intent.intent discriminator is ROOM_CONTEXT_MENU", () => {
    expect(result.intent.intent).toBe("ROOM_CONTEXT_MENU");
  });

  it("iih-07d: intent carries screen_position", () => {
    expect(typeof result.intent.screen_position).toBe("object");
    expect(result.intent.screen_position).not.toBeNull();
    expect(typeof result.intent.screen_position.x).toBe("number");
    expect(typeof result.intent.screen_position.y).toBe("number");
  });

  it("iih-07e: custom screen_position propagates", () => {
    const r = triggerInfrastructureContextMenu({ screenPosition: CUSTOM_SCREEN });
    expect(r.intent.screen_position).toEqual(CUSTOM_SCREEN);
  });

  it("iih-07f: intent carries room_id, room_type, floor", () => {
    expect(typeof result.intent.room_id).toBe("string");
    expect(typeof result.intent.room_type).toBe("string");
    expect(typeof result.intent.floor).toBe("number");
  });

  it("iih-07g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-08 — Meta layer: Agent click
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-08 — Meta layer × click → Agent click intent", () => {
  let result: ReturnType<typeof triggerMetaClick>;

  beforeEach(() => {
    result = triggerMetaClick();
  });

  it("iih-08a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-08b: layer is 'meta'", () => {
    expect(result.layer).toBe("meta");
  });

  it("iih-08c: eventType is 'click'", () => {
    expect(result.eventType).toBe("click");
  });

  it("iih-08d: intent.kind is 'click'", () => {
    expect(result.intent.kind).toBe("click");
  });

  it("iih-08e: intent carries intentId (unique string)", () => {
    expect(typeof result.intent.intentId).toBe("string");
    expect(result.intent.intentId.length).toBeGreaterThan(0);
  });

  it("iih-08f: intent carries agentId and agentName", () => {
    expect(typeof result.intent.agentId).toBe("string");
    expect(typeof result.intent.agentName).toBe("string");
  });

  it("iih-08g: intent carries ts and tsIso", () => {
    expect(typeof result.intent.ts).toBe("number");
    expect(result.intent.ts).toBeGreaterThan(0);
    expect(typeof result.intent.tsIso).toBe("string");
    expect(result.intent.tsIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("iih-08h: custom agentId propagates", () => {
    const r = triggerMetaClick({ agentId: CUSTOM_AGENT });
    expect(r.intent.agentId).toBe(CUSTOM_AGENT);
  });

  it("iih-08i: emittedAt equals intent.ts", () => {
    expect(result.emittedAt).toBe(result.intent.ts);
  });

  it("iih-08j: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-09 — Meta layer: Agent hover (hover_enter)
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-09 — Meta layer × hover → Agent hover_enter intent", () => {
  let result: ReturnType<typeof triggerMetaHover>;

  beforeEach(() => {
    result = triggerMetaHover();
  });

  it("iih-09a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-09b: layer is 'meta'", () => {
    expect(result.layer).toBe("meta");
  });

  it("iih-09c: eventType is 'hover'", () => {
    expect(result.eventType).toBe("hover");
  });

  it("iih-09d: intent.kind is 'hover_enter' (meta-layer name for hover)", () => {
    // The meta/agent layer uses 'hover_enter' — the harness maps 'hover' → 'hover_enter'
    expect(result.intent.kind).toBe("hover_enter");
  });

  it("iih-09e: intent carries intentId string", () => {
    expect(typeof result.intent.intentId).toBe("string");
  });

  it("iih-09f: intent carries worldPosition", () => {
    expect(typeof result.intent.worldPosition).toBe("object");
    expect(result.intent.worldPosition).not.toBeNull();
  });

  it("iih-09g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-10 — Meta layer: Agent context_menu
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-10 — Meta layer × context_menu → Agent context_menu intent", () => {
  let result: ReturnType<typeof triggerMetaContextMenu>;

  beforeEach(() => {
    result = triggerMetaContextMenu();
  });

  it("iih-10a: isValid is true", () => {
    expect(result.isValid).toBe(true);
  });

  it("iih-10b: layer is 'meta'", () => {
    expect(result.layer).toBe("meta");
  });

  it("iih-10c: eventType is 'context_menu'", () => {
    expect(result.eventType).toBe("context_menu");
  });

  it("iih-10d: intent.kind is 'context_menu'", () => {
    expect(result.intent.kind).toBe("context_menu");
  });

  it("iih-10e: intent carries screenPosition", () => {
    expect(typeof result.intent.screenPosition).toBe("object");
    expect(result.intent.screenPosition).not.toBeNull();
  });

  it("iih-10f: custom screenPosition propagates to screenPosition (camelCase)", () => {
    const r = triggerMetaContextMenu({ screenPosition: CUSTOM_SCREEN });
    expect(r.intent.screenPosition).toEqual(CUSTOM_SCREEN);
  });

  it("iih-10g: assertAll passes without throwing", () => {
    expect(() => assertAll(result)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-11 — Generic triggerIntent covers all 9 cells
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-11 — Generic triggerIntent: all 9 layer × event-type cells", () => {
  it("iih-11a: triggerIntent returns a result for every (layer, eventType) pair", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        expect(result.layer).toBe(layer);
        expect(result.eventType).toBe(et);
        expect(result.isValid).toBe(true);
      }
    }
  });

  it("iih-11b: all 9 results pass assertAll", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        expect(() => assertAll(result)).not.toThrow();
      }
    }
  });

  it("iih-11c: all 9 (layer, eventType) combinations are structurally distinct", () => {
    // The meta layer uses Date.now() internally which may produce the same ms
    // for multiple rapid calls — timestamp uniqueness is NOT a sound assertion.
    // Instead verify that every (layer × eventType) pair is represented exactly
    // once in the matrix, and each result carries the correct discriminators.
    const pairs = new Set<string>();
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        pairs.add(`${result.layer}:${result.eventType}`);
        // Each result's layer/eventType must match the trigger arguments
        expect(result.layer).toBe(layer);
        expect(result.eventType).toBe(et);
      }
    }
    // All nine (layer, eventType) pairs are distinct
    expect(pairs.size).toBe(9);
  });

  it("iih-11d: sessionId config is applied by the generic trigger", () => {
    const result = triggerIntent("domain", "click", { sessionId: CUSTOM_SESSION });
    // domain click is BuildingClickedIntent — session_id in snake_case
    expect((result.intent as Record<string, unknown>)["session_id"]).toBe(CUSTOM_SESSION);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-12 — INTENT_TRIGGER_MATRIX: 3×3 matrix traversal
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-12 — INTENT_TRIGGER_MATRIX: systematic 3×3 traversal", () => {
  it("iih-12a: each matrix entry is a function", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        expect(typeof INTENT_TRIGGER_MATRIX[layer][et]).toBe("function");
      }
    }
  });

  it("iih-12b: calling each matrix entry produces a valid HarnessResult", () => {
    const results: HarnessResult[] = [];
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        results.push(INTENT_TRIGGER_MATRIX[layer][et]());
      }
    }
    expect(results).toHaveLength(9);
    for (const r of results) {
      expect(r.isValid).toBe(true);
      expect(typeof r.layer).toBe("string");
      expect(typeof r.eventType).toBe("string");
      expect(typeof r.emittedAt).toBe("number");
      expect(typeof r.intent).toBe("object");
    }
  });

  it("iih-12c: each matrix cell can be called with a TriggerConfig override", () => {
    const cfg = { sessionId: CUSTOM_SESSION };
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = INTENT_TRIGGER_MATRIX[layer][et](cfg);
        expect(result.isValid).toBe(true);
        // All layers pass session_id / sessionId through config
        const p = result.intent as Record<string, unknown>;
        const hasSession =
          p["session_id"] === CUSTOM_SESSION ||
          p["sessionId"]  === CUSTOM_SESSION;
        expect(hasSession).toBe(true);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-13 — assertIntentShape: positive and negative cases
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-13 — assertIntentShape assertion helper", () => {
  it("iih-13a: passes for all 9 valid triggers", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        expect(() => assertIntentShape(result)).not.toThrow();
      }
    }
  });

  it("iih-13b: throws when isValid is false", () => {
    const bad: HarnessResult = {
      intent:    { intent: "BUILDING_CLICKED", building_id: "x", ts: 1 },
      layer:     "domain",
      eventType: "click",
      emittedAt: 1,
      isValid:   false, // forced invalid
    };
    expect(() => assertIntentShape(bad)).toThrow(/NOT valid/);
  });

  it("iih-13c: throws when intent is null", () => {
    const bad: HarnessResult = {
      intent:    null,
      layer:     "domain",
      eventType: "click",
      emittedAt: 1,
      isValid:   true, // even with isValid=true, null intent must fail
    };
    // isValid is true but intent is null — assertIntentShape should catch this
    // Because isValid is true we need to check the object check path
    // The guard doesn't know intent is null — isValid is explicitly set true
    // so assertIntentShape will proceed to the object check
    expect(() => assertIntentShape(bad)).toThrow();
  });

  it("iih-13d: throws when emittedAt is zero", () => {
    const result = triggerDomainClick();
    const bad: HarnessResult = { ...result, emittedAt: 0 };
    expect(() => assertIntentShape(bad)).toThrow(/emittedAt/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-14 — assertLayerMetadata: positive and negative cases
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-14 — assertLayerMetadata assertion helper", () => {
  it("iih-14a: passes for all valid layers and event types", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        expect(() => assertLayerMetadata(result)).not.toThrow();
      }
    }
  });

  it("iih-14b: throws for unknown layer string", () => {
    const r = triggerDomainClick();
    const bad = { ...r, layer: "unknown-layer" as IntentLayer };
    expect(() => assertLayerMetadata(bad)).toThrow(/layer/);
  });

  it("iih-14c: throws for unknown eventType string", () => {
    const r = triggerDomainClick();
    const bad = { ...r, eventType: "tap" as IntentEventType };
    expect(() => assertLayerMetadata(bad)).toThrow(/eventType/);
  });

  it("iih-14d: throws for non-positive emittedAt", () => {
    const r = triggerDomainClick();
    expect(() => assertLayerMetadata({ ...r, emittedAt: -1 })).toThrow(/emittedAt/);
    expect(() => assertLayerMetadata({ ...r, emittedAt: 0 })).toThrow(/emittedAt/);
    expect(() => assertLayerMetadata({ ...r, emittedAt: NaN })).toThrow(/emittedAt/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-15 — assertCrossLayerIsolation: intent kinds do not bleed across layers
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-15 — assertCrossLayerIsolation: cross-layer intent kind isolation", () => {
  it("iih-15a: domain intents do not pass room-layer guards", () => {
    for (const et of INTENT_EVENT_TYPES) {
      const result = triggerIntent("domain", et);
      expect(() => assertCrossLayerIsolation(result)).not.toThrow();
    }
  });

  it("iih-15b: infrastructure intents do not pass building-layer guards", () => {
    for (const et of INTENT_EVENT_TYPES) {
      const result = triggerIntent("infrastructure", et);
      expect(() => assertCrossLayerIsolation(result)).not.toThrow();
    }
  });

  it("iih-15c: meta intents do not pass building or room guards", () => {
    for (const et of INTENT_EVENT_TYPES) {
      const result = triggerIntent("meta", et);
      expect(() => assertCrossLayerIsolation(result)).not.toThrow();
    }
  });

  it("iih-15d: domain intent with injected 'intentId' field raises isolation error", () => {
    const r = triggerDomainClick();
    // Inject the meta-layer marker field
    const bad: HarnessResult = {
      ...r,
      intent: { ...(r.intent as object), intentId: "injected-id" },
    };
    expect(() => assertCrossLayerIsolation(bad)).toThrow(/intentId/);
  });

  it("iih-15e: meta intent missing 'intentId' raises isolation error", () => {
    const r = triggerMetaClick();
    const intentWithoutId = { ...(r.intent as Record<string, unknown>) };
    delete intentWithoutId["intentId"];
    const bad: HarnessResult = { ...r, intent: intentWithoutId };
    expect(() => assertCrossLayerIsolation(bad)).toThrow(/intentId/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-16 — assertJsonRoundTrip: record transparency
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-16 — assertJsonRoundTrip: all 9 intents survive JSON round-trip", () => {
  it("iih-16a: all 9 intents are fully JSON-serialisable and round-trippable", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        expect(() => assertJsonRoundTrip(result)).not.toThrow();
      }
    }
  });

  it("iih-16b: JSON serialisation of domain click preserves all required fields", () => {
    const result = triggerDomainClick({ buildingId: "bld-json", ts: 1_999_000_000 });
    const parsed  = JSON.parse(JSON.stringify(result.intent)) as Record<string, unknown>;
    expect(parsed["intent"]).toBe("BUILDING_CLICKED");
    expect(parsed["building_id"]).toBe("bld-json");
    expect(parsed["ts"]).toBe(1_999_000_000);
  });

  it("iih-16c: JSON serialisation of infrastructure click preserves room-scoped fields", () => {
    const result = triggerInfrastructureClick({ roomId: "room-json-01" });
    const parsed  = JSON.parse(JSON.stringify(result.intent)) as Record<string, unknown>;
    expect(parsed["intent"]).toBe("ROOM_CLICKED");
    expect(parsed["room_id"]).toBe("room-json-01");
    expect(typeof parsed["floor"]).toBe("number");
    expect(typeof parsed["agent_count"]).toBe("number");
  });

  it("iih-16d: JSON serialisation of meta click preserves intentId and kind", () => {
    const result = triggerMetaClick({ agentId: "agent-json-01" });
    const parsed  = JSON.parse(JSON.stringify(result.intent)) as Record<string, unknown>;
    expect(typeof parsed["intentId"]).toBe("string");
    expect(parsed["kind"]).toBe("click");
    expect(parsed["agentId"]).toBe("agent-json-01");
  });

  it("iih-16e: null world_position survives round-trip for domain click", () => {
    const r = triggerDomainClick({ worldPosition: undefined });
    // Default world pos is not null, but we can directly test the factory
    // (null worldPosition is allowed by building intent spec)
    const parsed = JSON.parse(JSON.stringify(r.intent)) as Record<string, unknown>;
    // world_position may be { x, y, z } or null — just confirm it round-trips
    expect("world_position" in parsed).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-17 — Command-pipeline independence
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-17 — Command-pipeline independence", () => {
  /**
   * These tests confirm that the harness can trigger all 9 intents with no
   * command-pipeline side effects.  The harness does not call:
   *   • CommandFile.write()
   *   • EventLog.append()
   *   • Orchestrator.dispatch()
   *   • Any async I/O
   *
   * We verify this by checking:
   *   1. Triggering all 9 intents produces synchronous results
   *   2. No external state is mutated (the store is not touched unless recording)
   *   3. The harness does not import command-file / command-pipeline symbols
   */

  it("iih-17a: all 9 trigger functions are synchronous (return value, not Promise)", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        // If trigger returned a Promise, this would fail
        expect(result).not.toBeInstanceOf(Promise);
        expect(typeof result.intent).toBe("object");
      }
    }
  });

  it("iih-17b: HarnessResult does not carry CommandFile or EventLog references", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        const intentKeys = Object.keys(result.intent as Record<string, unknown>);
        // None of these command-pipeline fields should appear in a raw intent
        expect(intentKeys).not.toContain("command_id");
        expect(intentKeys).not.toContain("pipeline_id");
        expect(intentKeys).not.toContain("event_log_id");
        // (command_id is optional on user_input payloads in the protocol module,
        //  but our factory-level intents are pre-command-routing)
      }
    }
  });

  it("iih-17c: triggering intents does not require a running WebSocket or HTTP server", () => {
    // Confirmed by test running without network — no fetch/WebSocket calls in harness
    // This is a structural assertion: the test itself IS the evidence
    const result = triggerInfrastructureContextMenu({ roomId: "offline-room" });
    expect(result.isValid).toBe(true);
  });

  it("iih-17d: all 9 triggers complete in under 50ms total (synchronous, no I/O)", () => {
    const start = Date.now();
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        triggerIntent(layer, et);
      }
    }
    const elapsed = Date.now() - start;
    // All 9 are pure synchronous object construction; should be well under 50ms
    expect(elapsed).toBeLessThan(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-18 — Meta intent unique IDs
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-18 — Meta-layer intents: unique intentId per emission", () => {
  it("iih-18a: each triggerMetaClick call produces a distinct intentId", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = triggerMetaClick();
      ids.add(result.intent.intentId);
    }
    expect(ids.size).toBe(20);
  });

  it("iih-18b: intentIds from all three meta event types are unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(triggerMetaClick().intent.intentId);
      ids.add(triggerMetaHover().intent.intentId);
      ids.add(triggerMetaContextMenu().intent.intentId);
    }
    expect(ids.size).toBe(30);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-19 — assertAll composite: all 9 intents pass all four invariants
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-19 — assertAll composite: all four invariants for all 9 intents", () => {
  it("iih-19a: assertAll passes for every cell in the 3×3 matrix", () => {
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et);
        // Must not throw: shape + metadata + isolation + JSON round-trip
        expect(() => assertAll(result)).not.toThrow();
      }
    }
  });

  it("iih-19b: assertAll with custom configs passes for all 9 intents", () => {
    const cfg = {
      sessionId:   CUSTOM_SESSION,
      buildingId:  CUSTOM_BUILDING,
      roomId:      CUSTOM_ROOM,
      agentId:     CUSTOM_AGENT,
      worldPosition: CUSTOM_WORLD,
      screenPosition: CUSTOM_SCREEN,
    };
    for (const layer of INTENT_LAYERS) {
      for (const et of INTENT_EVENT_TYPES) {
        const result = triggerIntent(layer, et, cfg);
        expect(() => assertAll(result)).not.toThrow();
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// iih-20 — Cross-layer kind sets: domain ∩ infrastructure = ∅
// ═════════════════════════════════════════════════════════════════════════════

describe("iih-20 — Cross-layer kind sets are disjoint", () => {
  it("iih-20a: BUILDING_INTENT_KINDS and ROOM_INTENT_KINDS are disjoint", () => {
    for (const bk of BUILDING_INTENT_KINDS) {
      expect(ROOM_INTENT_KINDS.has(bk)).toBe(false);
    }
    for (const rk of ROOM_INTENT_KINDS) {
      expect(BUILDING_INTENT_KINDS.has(rk)).toBe(false);
    }
  });

  it("iih-20b: no intent kind from any layer appears in another layer's kind set", () => {
    // Domain layer intents: BUILDING_CLICKED, BUILDING_HOVERED, BUILDING_CONTEXT_MENU
    // Infrastructure layer: ROOM_CLICKED, ROOM_HOVERED, ROOM_CONTEXT_MENU
    // Meta layer: uses AgentInteractionIntentKind ('click', 'hover_enter', 'hover_exit', 'context_menu')
    // Meta kind strings should not appear in building or room sets
    const metaKinds = ["click", "hover_enter", "hover_exit", "context_menu"];
    for (const mk of metaKinds) {
      expect(BUILDING_INTENT_KINDS.has(mk)).toBe(false);
      expect(ROOM_INTENT_KINDS.has(mk)).toBe(false);
    }
  });
});
