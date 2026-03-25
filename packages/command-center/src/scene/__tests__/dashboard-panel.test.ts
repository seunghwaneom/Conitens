/**
 * dashboard-panel.test.ts — Unit tests for Sub-AC 6a:
 * DashboardPanel ui_fixture entity — registration, placement, geometry.
 *
 * Tests the pure-logic aspects of the ui_fixture registry and the
 * DashboardPanel geometry helpers:
 *
 *   1. UiFixtureType registration — all types are valid
 *   2. DEFAULT_UI_FIXTURES — all entries are valid (validateUiFixtureRegistry)
 *   3. dashboard_panel instances — at least one placed in a room
 *   4. 3D spatial transforms — position, rotation, scale are well-formed
 *   5. Room assignment — each fixture references a valid room
 *   6. Visual config — dimensions, colors, emissive settings
 *   7. Registry lookup helpers — getUiFixture, getFixturesForRoom, getDashboardPanels
 *   8. Geometry helpers — computeScreenDimensions, computeBezelThickness, facingToRotY
 *   9. Behavioral contracts — each fixture has at least one action
 *  10. Ontology level — all ui_fixture entries are "domain" level
 *
 * NOTE: React components (DashboardPanelMesh, DashboardPanel, DashboardPanelLayer)
 *       require a WebGL canvas and cannot run in a headless Vitest environment.
 *       Only pure-logic helpers and data structures are tested here — consistent
 *       with the pattern in display-surfaces.test.ts and birds-eye-camera.test.ts.
 *
 * Test ID scheme:
 *   6a-dp-N : Sub-AC 6a dashboard_panel
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Types
  UI_FIXTURE_TYPES,
  UI_FIXTURE_TYPE_SET,
  // Registry
  DEFAULT_UI_FIXTURES,
  UI_FIXTURE_MAP,
  // Lookup helpers
  getUiFixture,
  getFixturesForRoom,
  getFixturesByType,
  getDashboardPanels,
  // Validation
  validateUiFixtureRegistry,
  isUiFixtureType,
  // Geometry helpers
  facingToRotY,
  computeBezelThickness,
  computeScreenDimensions,
  computeFixtureWorldPosition,
  computeFixtureWorldRotation,
  defaultDashboardPanelVisual,
  // Constants
  type UiFixtureDef,
  type UiFixtureType,
  type UiFixtureTransform,
} from "../../data/ui-fixture-registry.js";

// ── 1. UiFixtureType registration ─────────────────────────────────────────────

describe("6a-dp-1: UiFixtureType registration", () => {
  it("6a-dp-1a: UI_FIXTURE_TYPES tuple is non-empty", () => {
    expect(UI_FIXTURE_TYPES.length).toBeGreaterThan(0);
  });

  it("6a-dp-1b: dashboard_panel is a registered type", () => {
    expect(UI_FIXTURE_TYPES).toContain("dashboard_panel");
  });

  it("6a-dp-1c: UI_FIXTURE_TYPE_SET matches UI_FIXTURE_TYPES", () => {
    for (const t of UI_FIXTURE_TYPES) {
      expect(UI_FIXTURE_TYPE_SET.has(t)).toBe(true);
    }
    expect(UI_FIXTURE_TYPE_SET.size).toBe(UI_FIXTURE_TYPES.length);
  });

  it("6a-dp-1d: isUiFixtureType narrows correctly", () => {
    expect(isUiFixtureType("dashboard_panel")).toBe(true);
    expect(isUiFixtureType("control_panel")).toBe(true);
    expect(isUiFixtureType("unknown_type")).toBe(false);
    expect(isUiFixtureType("")).toBe(false);
  });
});

// ── 2. DEFAULT_UI_FIXTURES validation ─────────────────────────────────────────

describe("6a-dp-2: DEFAULT_UI_FIXTURES registry", () => {
  it("6a-dp-2a: registry passes full validation with no errors", () => {
    const errors = validateUiFixtureRegistry();
    expect(errors).toHaveLength(0);
  });

  it("6a-dp-2b: registry is non-empty", () => {
    expect(DEFAULT_UI_FIXTURES.length).toBeGreaterThan(0);
  });

  it("6a-dp-2c: all fixture_ids are unique", () => {
    const ids = DEFAULT_UI_FIXTURES.map((f) => f.fixture_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("6a-dp-2d: all fixture_types are registered", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(isUiFixtureType(f.fixture_type)).toBe(true);
    }
  });

  it("6a-dp-2e: all entries have non-empty room_id", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(typeof f.room_id).toBe("string");
      expect(f.room_id.length).toBeGreaterThan(0);
    }
  });
});

// ── 3. dashboard_panel instances ──────────────────────────────────────────────

describe("6a-dp-3: dashboard_panel instances", () => {
  let panels: readonly UiFixtureDef[];

  beforeEach(() => {
    panels = getDashboardPanels();
  });

  it("6a-dp-3a: at least one dashboard_panel is registered", () => {
    expect(panels.length).toBeGreaterThan(0);
  });

  it("6a-dp-3b: all getDashboardPanels() entries have fixture_type=dashboard_panel", () => {
    for (const p of panels) {
      expect(p.fixture_type).toBe("dashboard_panel");
    }
  });

  it("6a-dp-3c: ops-dashboard-main panel is registered", () => {
    const main = panels.find((p) => p.fixture_id === "ops-dashboard-main");
    expect(main).toBeDefined();
  });

  it("6a-dp-3d: ops-dashboard-main is placed in ops-control room", () => {
    const main = panels.find((p) => p.fixture_id === "ops-dashboard-main");
    expect(main?.room_id).toBe("ops-control");
  });

  it("6a-dp-3e: lobby-status-panel is placed in project-main room", () => {
    const lobby = panels.find((p) => p.fixture_id === "lobby-status-panel");
    expect(lobby?.room_id).toBe("project-main");
  });

  it("6a-dp-3f: at least one panel in ops-control", () => {
    const opsFixtures = panels.filter((p) => p.room_id === "ops-control");
    expect(opsFixtures.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 4. 3D spatial transforms ──────────────────────────────────────────────────

describe("6a-dp-4: 3D spatial transforms", () => {
  it("6a-dp-4a: all transforms have valid position (finite numbers)", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      const { x, y, z } = f.transform.position;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it("6a-dp-4b: all transforms have valid rotation (finite numbers)", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      const { x, y, z } = f.transform.rotation;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it("6a-dp-4c: all transforms have valid scale (positive)", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      const { x, y, z } = f.transform.scale;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(z).toBeGreaterThan(0);
    }
  });

  it("6a-dp-4d: dashboard_panel transforms have positive y (above floor)", () => {
    for (const f of getDashboardPanels()) {
      expect(f.transform.position.y).toBeGreaterThan(0);
    }
  });

  it("6a-dp-4e: wall-mounted panels have facing north/south/east/west", () => {
    for (const f of getDashboardPanels()) {
      if (f.transform.mountType === "wall") {
        expect(["north", "south", "east", "west"]).toContain(f.transform.facing);
      }
    }
  });

  it("6a-dp-4f: rotation.y matches facingToRotY(facing) for all panels", () => {
    for (const f of getDashboardPanels()) {
      const expectedRotY = facingToRotY(f.transform.facing);
      expect(f.transform.rotation.y).toBeCloseTo(expectedRotY, 5);
    }
  });
});

// ── 5. Room assignment ────────────────────────────────────────────────────────

describe("6a-dp-5: room assignment", () => {
  const VALID_ROOM_IDS = new Set([
    "project-main",
    "archive-vault",
    "stairwell",
    "ops-control",
    "impl-office",
    "research-lab",
    "validation-office",
    "review-office",
    "corridor-main",
  ]);

  it("6a-dp-5a: all fixture room_ids are valid building rooms", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(VALID_ROOM_IDS.has(f.room_id)).toBe(true);
    }
  });

  it("6a-dp-5b: getFixturesForRoom returns correct subset", () => {
    const opsFixtures = getFixturesForRoom("ops-control");
    expect(opsFixtures.length).toBeGreaterThanOrEqual(1);
    for (const f of opsFixtures) {
      expect(f.room_id).toBe("ops-control");
    }
  });

  it("6a-dp-5c: getFixturesForRoom returns empty array for unknown room", () => {
    const fixtures = getFixturesForRoom("nonexistent-room-xyz");
    expect(fixtures).toHaveLength(0);
  });
});

// ── 6. Visual configuration ───────────────────────────────────────────────────

describe("6a-dp-6: visual configuration", () => {
  it("6a-dp-6a: all dashboard_panels have positive width and height", () => {
    for (const f of getDashboardPanels()) {
      expect(f.visual.width).toBeGreaterThan(0);
      expect(f.visual.height).toBeGreaterThan(0);
    }
  });

  it("6a-dp-6b: all dashboard_panels have valid hex accentColor", () => {
    for (const f of getDashboardPanels()) {
      expect(f.visual.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("6a-dp-6c: all dashboard_panels have non-negative emissiveIntensity", () => {
    for (const f of getDashboardPanels()) {
      expect(f.visual.emissiveIntensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("6a-dp-6d: defaultDashboardPanelVisual produces valid config", () => {
    const config = defaultDashboardPanelVisual("#FF7043");
    expect(config.width).toBeGreaterThan(0);
    expect(config.height).toBeGreaterThan(0);
    expect(config.accentColor).toBe("#FF7043");
    expect(config.emissiveIntensity).toBeGreaterThanOrEqual(0);
    expect(typeof config.bezelColor).toBe("string");
    expect(typeof config.screenColor).toBe("string");
    expect(typeof config.scanLines).toBe("boolean");
    expect(config.scanLineOpacity).toBeGreaterThanOrEqual(0);
  });

  it("6a-dp-6e: defaultDashboardPanelVisual respects opts overrides", () => {
    const config = defaultDashboardPanelVisual("#4FC3F7", { width: 2.5, height: 1.5 });
    expect(config.width).toBe(2.5);
    expect(config.height).toBe(1.5);
    expect(config.accentColor).toBe("#4FC3F7");
  });
});

// ── 7. Registry lookup helpers ────────────────────────────────────────────────

describe("6a-dp-7: registry lookup helpers", () => {
  it("6a-dp-7a: getUiFixture returns correct entry by id", () => {
    const f = getUiFixture("ops-dashboard-main");
    expect(f).toBeDefined();
    expect(f?.fixture_id).toBe("ops-dashboard-main");
  });

  it("6a-dp-7b: getUiFixture returns undefined for unknown id", () => {
    expect(getUiFixture("does-not-exist")).toBeUndefined();
  });

  it("6a-dp-7c: UI_FIXTURE_MAP contains all DEFAULT_UI_FIXTURES", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(UI_FIXTURE_MAP.has(f.fixture_id)).toBe(true);
    }
    expect(UI_FIXTURE_MAP.size).toBe(DEFAULT_UI_FIXTURES.length);
  });

  it("6a-dp-7d: getFixturesByType('dashboard_panel') matches getDashboardPanels()", () => {
    const a = getFixturesByType("dashboard_panel");
    const b = getDashboardPanels();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].fixture_id).toBe(b[i].fixture_id);
    }
  });
});

// ── 8. Geometry helpers ───────────────────────────────────────────────────────

describe("6a-dp-8: geometry helpers", () => {
  describe("facingToRotY", () => {
    it("6a-dp-8a: north → π", () => {
      expect(facingToRotY("north")).toBeCloseTo(Math.PI, 8);
    });
    it("6a-dp-8b: south → 0", () => {
      expect(facingToRotY("south")).toBe(0);
    });
    it("6a-dp-8c: east → π/2", () => {
      expect(facingToRotY("east")).toBeCloseTo(Math.PI / 2, 8);
    });
    it("6a-dp-8d: west → −π/2", () => {
      expect(facingToRotY("west")).toBeCloseTo(-Math.PI / 2, 8);
    });
    it("6a-dp-8e: up → 0 (floor-standing)", () => {
      expect(facingToRotY("up")).toBe(0);
    });
  });

  describe("computeBezelThickness", () => {
    it("6a-dp-8f: bezel is 8% of smaller dimension", () => {
      expect(computeBezelThickness(2.0, 1.0)).toBeCloseTo(0.08, 5);
      expect(computeBezelThickness(1.0, 2.0)).toBeCloseTo(0.08, 5);
    });

    it("6a-dp-8g: bezel is positive for all registered panels", () => {
      for (const f of getDashboardPanels()) {
        const b = computeBezelThickness(f.visual.width, f.visual.height);
        expect(b).toBeGreaterThan(0);
      }
    });
  });

  describe("computeScreenDimensions", () => {
    it("6a-dp-8h: screen is smaller than bezel on each axis", () => {
      const { screenW, screenH } = computeScreenDimensions(1.6, 0.9);
      expect(screenW).toBeLessThan(1.6);
      expect(screenH).toBeLessThan(0.9);
      expect(screenW).toBeGreaterThan(0);
      expect(screenH).toBeGreaterThan(0);
    });

    it("6a-dp-8i: screen dimensions are symmetric (same bezel on all sides)", () => {
      const w = 1.6;
      const h = 0.9;
      const bezel = computeBezelThickness(w, h);
      const { screenW, screenH } = computeScreenDimensions(w, h);
      expect(screenW).toBeCloseTo(w - bezel * 2, 8);
      expect(screenH).toBeCloseTo(h - bezel * 2, 8);
    });

    it("6a-dp-8j: screen dimensions positive for all registered panels", () => {
      for (const f of getDashboardPanels()) {
        const { screenW, screenH } = computeScreenDimensions(
          f.visual.width,
          f.visual.height,
        );
        expect(screenW).toBeGreaterThan(0);
        expect(screenH).toBeGreaterThan(0);
      }
    });
  });

  describe("computeFixtureWorldPosition", () => {
    it("6a-dp-8k: world position = room origin + local position", () => {
      const roomOrigin = { x: 4, y: 3, z: 0 };
      const transform: UiFixtureTransform = {
        position:  { x: 2.5, y: 1.5, z: 3.85 },
        rotation:  { x: 0, y: Math.PI, z: 0 },
        scale:     { x: 1, y: 1, z: 1 },
        facing:    "north",
        mountType: "wall",
      };
      const world = computeFixtureWorldPosition(roomOrigin, transform);
      expect(world.x).toBeCloseTo(6.5, 8);
      expect(world.y).toBeCloseTo(4.5, 8);
      expect(world.z).toBeCloseTo(3.85, 8);
    });
  });

  describe("computeFixtureWorldRotation", () => {
    it("6a-dp-8l: adds roomRotationY to local rotation.y", () => {
      const local = { x: 0, y: Math.PI, z: 0 };
      const world = computeFixtureWorldRotation(local, Math.PI / 4);
      expect(world.y).toBeCloseTo(Math.PI + Math.PI / 4, 8);
      expect(world.x).toBe(0);
      expect(world.z).toBe(0);
    });

    it("6a-dp-8m: zero roomRotationY leaves rotation unchanged", () => {
      const local = { x: 0, y: Math.PI, z: 0 };
      const world = computeFixtureWorldRotation(local, 0);
      expect(world.y).toBeCloseTo(Math.PI, 8);
    });

    it("6a-dp-8n: defaults to roomRotationY=0 when omitted", () => {
      const local = { x: 0.1, y: Math.PI / 2, z: 0.2 };
      const world = computeFixtureWorldRotation(local);
      expect(world.x).toBeCloseTo(0.1, 8);
      expect(world.y).toBeCloseTo(Math.PI / 2, 8);
      expect(world.z).toBeCloseTo(0.2, 8);
    });
  });
});

// ── 9. Behavioral contracts ───────────────────────────────────────────────────

describe("6a-dp-9: behavioral contracts", () => {
  it("6a-dp-9a: all fixtures have at least one action", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(f.behavioral_contract.actions.length).toBeGreaterThan(0);
    }
  });

  it("6a-dp-9b: all actions are non-empty strings", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      for (const action of f.behavioral_contract.actions) {
        expect(typeof action).toBe("string");
        expect(action.length).toBeGreaterThan(0);
      }
    }
  });

  it("6a-dp-9c: dashboard_panel actions include display or render verb", () => {
    for (const f of getDashboardPanels()) {
      const actionText = f.behavioral_contract.actions.join(" ");
      expect(actionText).toMatch(/display|render|show|emit/i);
    }
  });
});

// ── 10. Ontology level ────────────────────────────────────────────────────────

describe("6a-dp-10: ontology level", () => {
  it("6a-dp-10a: all ui_fixture entries have ontology_level = 'domain'", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(f.ontology_level).toBe("domain");
    }
  });

  it("6a-dp-10b: all entries have a non-empty rationale", () => {
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(typeof f.rationale).toBe("string");
      expect(f.rationale.length).toBeGreaterThan(0);
    }
  });

  it("6a-dp-10c: all entries have a non-empty content_type", () => {
    for (const f of getDashboardPanels()) {
      expect(typeof f.content_type).toBe("string");
      expect(f.content_type.length).toBeGreaterThan(0);
    }
  });
});

// ── Additional: validateUiFixtureRegistry edge cases ─────────────────────────

describe("6a-dp-11: validateUiFixtureRegistry edge cases", () => {
  it("6a-dp-11a: detects duplicate fixture_ids", () => {
    const bad = [
      ...DEFAULT_UI_FIXTURES,
      { ...DEFAULT_UI_FIXTURES[0] },   // duplicate first entry
    ];
    const errors = validateUiFixtureRegistry(bad as UiFixtureDef[]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("6a-dp-11b: detects empty behavioral_contract.actions", () => {
    const bad: UiFixtureDef[] = [
      {
        ...DEFAULT_UI_FIXTURES[0],
        fixture_id:          "test-empty-contract",
        behavioral_contract: { actions: [] },
      },
    ];
    const errors = validateUiFixtureRegistry(bad);
    expect(errors.some((e) => e.includes("behavioral_contract"))).toBe(true);
  });

  it("6a-dp-11c: detects unknown fixture_type", () => {
    const bad = [
      {
        ...DEFAULT_UI_FIXTURES[0],
        fixture_id:   "test-unknown-type",
        fixture_type: "nonexistent_type" as UiFixtureType,
      },
    ];
    const errors = validateUiFixtureRegistry(bad as UiFixtureDef[]);
    expect(errors.some((e) => e.includes("fixture_type"))).toBe(true);
  });

  it("6a-dp-11d: empty array is valid (no errors)", () => {
    expect(validateUiFixtureRegistry([])).toHaveLength(0);
  });
});
