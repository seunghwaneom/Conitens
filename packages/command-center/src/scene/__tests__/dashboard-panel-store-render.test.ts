/**
 * dashboard-panel-store-render.test.ts — Unit tests for Sub-AC 6b:
 * 3D rendering of the dashboard_panel ui_fixture as a spatial object
 * retrievable and renderable from the entity store.
 *
 * Tests the pure-logic functions exported from StoreDrivenDashboardPanels.tsx:
 *
 *   1.  selectDashboardPanelFixtures()     — filter fixture registry to dashboard_panel
 *   2.  groupFixturesByRoom()              — partition fixtures by room_id
 *   3.  isDashboardPanelRenderable()       — renderable check (room origin present)
 *   4.  computeStoreRenderEntries()        — build render entry list from store + origins
 *   5.  computePanelGroupName()            — Three.js group name convention
 *   6.  computeFixtureRenderOrder()        — scene render order for fixture types
 *   7.  selectFixtureRegistrySlice()       — Zustand selector correctness
 *   8.  Entity store integration           — useUiFixtureStore → fixture retrieval
 *   9.  Spatial rendering contract         — all panels have valid 3D data
 *  10.  Multi-room rendering               — panels span multiple rooms correctly
 *  11.  Graceful omissions                 — missing origins skip silently
 *  12.  Fixture identity preservation      — store round-trip keeps all fields
 *
 * NOTE: React components (StoreDrivenDashboardPanelSet, StoreDrivenDashboardPanels)
 *       require a WebGL canvas + React rendering environment.  Only pure-logic
 *       helpers are tested here, following the established pattern from
 *       dashboard-panel.test.ts, dashboard-panel-renderer.test.ts, etc.
 *
 * Test ID scheme:
 *   6b-sr-N : Sub-AC 6b store-render
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Pure-logic helpers
  selectDashboardPanelFixtures,
  groupFixturesByRoom,
  isDashboardPanelRenderable,
  computeStoreRenderEntries,
  computePanelGroupName,
  computeFixtureRenderOrder,
  selectFixtureRegistrySlice,
  // Types
  type StorePanelRenderEntry,
} from "../StoreDrivenDashboardPanels.js";
import {
  useUiFixtureStore,
  type UiFixtureDef,
} from "../../store/ui-fixture-store.js";
import {
  DEFAULT_UI_FIXTURES,
  getDashboardPanels,
  validateUiFixtureRegistry,
} from "../../data/ui-fixture-registry.js";
import { DASHBOARD_PANEL_RENDER_ORDER } from "../DashboardPanel.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Reset the entity store to a clean empty state before each test.
 * Prevents test pollution across the Zustand singleton.
 */
function resetStore(): void {
  useUiFixtureStore.setState({
    fixtures:          {},
    fixtureIds:        [],
    initialized:       false,
    selectedFixtureId: null,
    selectedAt:        null,
    events:            [],
    seq:               0,
    validationErrors:  [],
  });
}

/**
 * Build a minimal valid dashboard_panel fixture for use in isolated tests.
 */
function makeDashboardPanel(
  overrides: Partial<UiFixtureDef> = {},
): UiFixtureDef {
  return {
    fixture_id:   "test-dp-1",
    fixture_name: "Test Dashboard Panel",
    fixture_type: "dashboard_panel",
    room_id:      "ops-control",
    transform: {
      position:  { x: 2.5, y: 1.5, z: 3.85 },
      rotation:  { x: 0, y: Math.PI, z: 0 },
      scale:     { x: 1, y: 1, z: 1 },
      facing:    "north",
      mountType: "wall",
    },
    visual: {
      width:             1.6,
      height:            0.9,
      bezelColor:        "#1a1a2a",
      screenColor:       "#0a0a14",
      accentColor:       "#FF7043",
      emissiveIntensity: 0.4,
      scanLines:         true,
      scanLineOpacity:   0.06,
    },
    content_type: "agent_status",
    metadata: {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    },
    behavioral_contract: {
      actions: ["display agent status", "emit fixture.panel_toggled on click"],
      reads:   ["agent-store"],
      emits:   ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale:      "Test fixture for store-driven rendering tests.",
    ...overrides,
  };
}

/**
 * Build a room-origins map covering the default building rooms.
 */
function makeDefaultRoomOrigins(): Map<string, { x: number; y: number; z: number }> {
  return new Map([
    ["ops-control",   { x: 0,  y: 0, z: 0   }],
    ["project-main",  { x: 8,  y: 0, z: 0   }],
    ["impl-office",   { x: 0,  y: 0, z: 8   }],
    ["research-lab",  { x: 8,  y: 0, z: 8   }],
    ["archive-vault", { x: 16, y: 0, z: 0   }],
    ["corridor-main", { x: 4,  y: 0, z: 16  }],
  ]);
}

// ── 1. selectDashboardPanelFixtures() ─────────────────────────────────────────

describe("6b-sr-1: selectDashboardPanelFixtures()", () => {
  it("6b-sr-1a: returns only dashboard_panel entries from a mixed registry", () => {
    const mixed: Record<string, UiFixtureDef> = {};
    // Two dashboard panels
    const dp1 = makeDashboardPanel({ fixture_id: "dp-1" });
    const dp2 = makeDashboardPanel({ fixture_id: "dp-2" });
    // One control_panel
    const cp1 = makeDashboardPanel({
      fixture_id:   "cp-1",
      fixture_type: "control_panel",
    });
    mixed["dp-1"] = dp1;
    mixed["dp-2"] = dp2;
    mixed["cp-1"] = cp1;

    const result = selectDashboardPanelFixtures(mixed);
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.fixture_type).toBe("dashboard_panel");
    }
  });

  it("6b-sr-1b: empty registry → empty array", () => {
    expect(selectDashboardPanelFixtures({})).toHaveLength(0);
  });

  it("6b-sr-1c: registry with only non-dashboard fixtures → empty array", () => {
    const record: Record<string, UiFixtureDef> = {
      "cp-1": makeDashboardPanel({ fixture_id: "cp-1", fixture_type: "status_light" }),
    };
    expect(selectDashboardPanelFixtures(record)).toHaveLength(0);
  });

  it("6b-sr-1d: all DEFAULT_UI_FIXTURES match getDashboardPanels() via selectDashboardPanelFixtures", () => {
    // Convert DEFAULT_UI_FIXTURES to a Record
    const record: Record<string, UiFixtureDef> = {};
    for (const f of DEFAULT_UI_FIXTURES) {
      record[f.fixture_id] = f;
    }
    const result = selectDashboardPanelFixtures(record);
    const expected = getDashboardPanels();
    expect(result.length).toBe(expected.length);
  });

  it("6b-sr-1e: returns independent array (mutations do not affect source)", () => {
    const record: Record<string, UiFixtureDef> = {
      "dp-1": makeDashboardPanel({ fixture_id: "dp-1" }),
    };
    const result = selectDashboardPanelFixtures(record);
    result.push(makeDashboardPanel({ fixture_id: "dp-extra" }));
    // Source record unchanged
    expect(Object.keys(record)).toHaveLength(1);
  });
});

// ── 2. groupFixturesByRoom() ──────────────────────────────────────────────────

describe("6b-sr-2: groupFixturesByRoom()", () => {
  it("6b-sr-2a: fixtures from same room are grouped together", () => {
    const f1 = makeDashboardPanel({ fixture_id: "dp-a", room_id: "ops-control" });
    const f2 = makeDashboardPanel({ fixture_id: "dp-b", room_id: "ops-control" });
    const f3 = makeDashboardPanel({ fixture_id: "dp-c", room_id: "project-main" });

    const map = groupFixturesByRoom([f1, f2, f3]);
    expect(map.size).toBe(2);
    expect(map.get("ops-control")).toHaveLength(2);
    expect(map.get("project-main")).toHaveLength(1);
  });

  it("6b-sr-2b: empty input → empty Map", () => {
    const map = groupFixturesByRoom([]);
    expect(map.size).toBe(0);
  });

  it("6b-sr-2c: single fixture → Map with one key", () => {
    const f = makeDashboardPanel();
    const map = groupFixturesByRoom([f]);
    expect(map.size).toBe(1);
    expect(map.has("ops-control")).toBe(true);
  });

  it("6b-sr-2d: all fixtures in different rooms → one key per fixture", () => {
    const fixtures = [
      makeDashboardPanel({ fixture_id: "f1", room_id: "room-1" }),
      makeDashboardPanel({ fixture_id: "f2", room_id: "room-2" }),
      makeDashboardPanel({ fixture_id: "f3", room_id: "room-3" }),
    ];
    const map = groupFixturesByRoom(fixtures);
    expect(map.size).toBe(3);
  });

  it("6b-sr-2e: DEFAULT_UI_FIXTURES grouped correctly — ops-control has 2 panels", () => {
    const panels = getDashboardPanels();
    const map = groupFixturesByRoom(panels);
    const opsGroup = map.get("ops-control");
    expect(opsGroup).toBeDefined();
    expect(opsGroup!.length).toBeGreaterThanOrEqual(2); // ops-dashboard-main + ops-dashboard-secondary
  });

  it("6b-sr-2f: fixture IDs are preserved (no data mutation)", () => {
    const fixtures = getDashboardPanels();
    const map = groupFixturesByRoom(fixtures);
    const allGrouped = [...map.values()].flat();
    expect(allGrouped.length).toBe(fixtures.length);
  });
});

// ── 3. isDashboardPanelRenderable() ───────────────────────────────────────────

describe("6b-sr-3: isDashboardPanelRenderable()", () => {
  const roomOrigins = makeDefaultRoomOrigins();

  it("6b-sr-3a: fixture with known room origin → true", () => {
    const f = makeDashboardPanel({ room_id: "ops-control" });
    expect(isDashboardPanelRenderable(f, roomOrigins)).toBe(true);
  });

  it("6b-sr-3b: fixture with unknown room origin → false", () => {
    const f = makeDashboardPanel({ room_id: "nonexistent-room" });
    expect(isDashboardPanelRenderable(f, roomOrigins)).toBe(false);
  });

  it("6b-sr-3c: empty roomOrigins map → no fixture is renderable", () => {
    const emptyOrigins = new Map<string, { x: number; y: number; z: number }>();
    for (const f of getDashboardPanels()) {
      expect(isDashboardPanelRenderable(f, emptyOrigins)).toBe(false);
    }
  });

  it("6b-sr-3d: origin with NaN coordinates → false", () => {
    const nanOrigins = new Map([["ops-control", { x: NaN, y: 0, z: 0 }]]);
    const f = makeDashboardPanel({ room_id: "ops-control" });
    expect(isDashboardPanelRenderable(f, nanOrigins)).toBe(false);
  });

  it("6b-sr-3e: origin with Infinity coordinates → false", () => {
    const infOrigins = new Map([["ops-control", { x: Infinity, y: 0, z: 0 }]]);
    const f = makeDashboardPanel({ room_id: "ops-control" });
    expect(isDashboardPanelRenderable(f, infOrigins)).toBe(false);
  });

  it("6b-sr-3f: all default panels are renderable with default room origins", () => {
    for (const f of getDashboardPanels()) {
      expect(isDashboardPanelRenderable(f, roomOrigins)).toBe(true);
    }
  });

  it("6b-sr-3g: zero-position room origin is still renderable", () => {
    const zeroOrigins = new Map([["ops-control", { x: 0, y: 0, z: 0 }]]);
    const f = makeDashboardPanel({ room_id: "ops-control" });
    expect(isDashboardPanelRenderable(f, zeroOrigins)).toBe(true);
  });
});

// ── 4. computeStoreRenderEntries() ───────────────────────────────────────────

describe("6b-sr-4: computeStoreRenderEntries()", () => {
  const roomOrigins = makeDefaultRoomOrigins();

  it("6b-sr-4a: returns one entry per renderable fixture", () => {
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    expect(entries.length).toBe(panels.length);
  });

  it("6b-sr-4b: each entry has a fixture and roomOrigin", () => {
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    for (const entry of entries) {
      expect(entry.fixture).toBeDefined();
      expect(entry.roomOrigin).toBeDefined();
      expect(typeof entry.roomOrigin.x).toBe("number");
      expect(typeof entry.roomOrigin.y).toBe("number");
      expect(typeof entry.roomOrigin.z).toBe("number");
    }
  });

  it("6b-sr-4c: entry roomOrigin matches the Map value for the fixture's room_id", () => {
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    for (const entry of entries) {
      const expected = roomOrigins.get(entry.fixture.room_id);
      expect(entry.roomOrigin).toEqual(expected);
    }
  });

  it("6b-sr-4d: fixtures without room origins are excluded", () => {
    const panels = [
      makeDashboardPanel({ fixture_id: "known", room_id: "ops-control" }),
      makeDashboardPanel({ fixture_id: "unknown", room_id: "nonexistent-xyz" }),
    ];
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    expect(entries).toHaveLength(1);
    expect(entries[0].fixture.fixture_id).toBe("known");
  });

  it("6b-sr-4e: empty roomOrigins → no entries", () => {
    const empty = new Map<string, { x: number; y: number; z: number }>();
    const entries = computeStoreRenderEntries(getDashboardPanels(), empty);
    expect(entries).toHaveLength(0);
  });

  it("6b-sr-4f: empty fixtures array → no entries", () => {
    const entries = computeStoreRenderEntries([], roomOrigins);
    expect(entries).toHaveLength(0);
  });

  it("6b-sr-4g: entry fixture.fixture_id is preserved (identity)", () => {
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    const entryIds = entries.map((e) => e.fixture.fixture_id);
    const panelIds = panels.map((p) => p.fixture_id);
    expect(entryIds.sort()).toEqual(panelIds.sort());
  });

  it("6b-sr-4h: all entries have finite room origin coordinates", () => {
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, roomOrigins);
    for (const { roomOrigin } of entries) {
      expect(Number.isFinite(roomOrigin.x)).toBe(true);
      expect(Number.isFinite(roomOrigin.y)).toBe(true);
      expect(Number.isFinite(roomOrigin.z)).toBe(true);
    }
  });
});

// ── 5. computePanelGroupName() ────────────────────────────────────────────────

describe("6b-sr-5: computePanelGroupName()", () => {
  it("6b-sr-5a: returns dashboard-panel-{fixtureId} convention", () => {
    expect(computePanelGroupName("ops-dashboard-main")).toBe("dashboard-panel-ops-dashboard-main");
  });

  it("6b-sr-5b: returns dashboard-panel-{fixtureId} for all default panels", () => {
    for (const f of getDashboardPanels()) {
      expect(computePanelGroupName(f.fixture_id)).toBe(`dashboard-panel-${f.fixture_id}`);
    }
  });

  it("6b-sr-5c: group name is a non-empty string", () => {
    expect(computePanelGroupName("test-id").length).toBeGreaterThan(0);
  });

  it("6b-sr-5d: group names are unique for distinct fixture_ids", () => {
    const panels = getDashboardPanels();
    const names = panels.map((f) => computePanelGroupName(f.fixture_id));
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("6b-sr-5e: group name matches DashboardPanel.tsx naming convention", () => {
    // DashboardPanel.tsx uses: name={`dashboard-panel-${fixture.fixture_id}`}
    const id = "lobby-status-panel";
    expect(computePanelGroupName(id)).toBe(`dashboard-panel-${id}`);
  });
});

// ── 6. computeFixtureRenderOrder() ───────────────────────────────────────────

describe("6b-sr-6: computeFixtureRenderOrder()", () => {
  it("6b-sr-6a: dashboard_panel → DASHBOARD_PANEL_RENDER_ORDER (2)", () => {
    const f = makeDashboardPanel();
    expect(computeFixtureRenderOrder(f)).toBe(DASHBOARD_PANEL_RENDER_ORDER);
  });

  it("6b-sr-6b: dashboard_panel render order = 2 (documented contract)", () => {
    const f = makeDashboardPanel();
    expect(computeFixtureRenderOrder(f)).toBe(2);
  });

  it("6b-sr-6c: non-dashboard_panel fixture → render order 1", () => {
    const f = makeDashboardPanel({ fixture_type: "status_light" });
    expect(computeFixtureRenderOrder(f)).toBe(1);
  });

  it("6b-sr-6d: all default dashboard panels return DASHBOARD_PANEL_RENDER_ORDER", () => {
    for (const f of getDashboardPanels()) {
      expect(computeFixtureRenderOrder(f)).toBe(DASHBOARD_PANEL_RENDER_ORDER);
    }
  });

  it("6b-sr-6e: render order is a non-negative integer", () => {
    const f = makeDashboardPanel();
    const order = computeFixtureRenderOrder(f);
    expect(order).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(order)).toBe(true);
  });
});

// ── 7. selectFixtureRegistrySlice() ──────────────────────────────────────────

describe("6b-sr-7: selectFixtureRegistrySlice()", () => {
  beforeEach(resetStore);

  it("6b-sr-7a: returns fixtures, initialized, selectedFixtureId from state", () => {
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect("fixtures" in slice).toBe(true);
    expect("initialized" in slice).toBe(true);
    expect("selectedFixtureId" in slice).toBe(true);
  });

  it("6b-sr-7b: initialized is false before initFixtures()", () => {
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect(slice.initialized).toBe(false);
  });

  it("6b-sr-7c: initialized is true after initFixtures()", () => {
    useUiFixtureStore.getState().initFixtures();
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect(slice.initialized).toBe(true);
  });

  it("6b-sr-7d: selectedFixtureId is null before any selection", () => {
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect(slice.selectedFixtureId).toBeNull();
  });

  it("6b-sr-7e: selectedFixtureId reflects store selection", () => {
    useUiFixtureStore.getState().initFixtures();
    useUiFixtureStore.getState().selectFixture("ops-dashboard-main");
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect(slice.selectedFixtureId).toBe("ops-dashboard-main");
  });

  it("6b-sr-7f: fixtures is empty before initFixtures()", () => {
    const state = useUiFixtureStore.getState();
    const slice = selectFixtureRegistrySlice(state);
    expect(Object.keys(slice.fixtures)).toHaveLength(0);
  });
});

// ── 8. Entity store integration ───────────────────────────────────────────────

describe("6b-sr-8: entity store integration — retrieve fixtures for rendering", () => {
  beforeEach(resetStore);

  it("6b-sr-8a: after initFixtures(), getDashboardPanels() is non-empty", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    expect(panels.length).toBeGreaterThan(0);
  });

  it("6b-sr-8b: ops-dashboard-main retrievable from store by fixture_id", () => {
    useUiFixtureStore.getState().initFixtures();
    const f = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(f).toBeDefined();
    expect(f?.fixture_id).toBe("ops-dashboard-main");
    expect(f?.fixture_type).toBe("dashboard_panel");
  });

  it("6b-sr-8c: store fixture count matches DEFAULT_UI_FIXTURES length after init", () => {
    useUiFixtureStore.getState().initFixtures();
    expect(useUiFixtureStore.getState().getFixtureCount()).toBe(DEFAULT_UI_FIXTURES.length);
  });

  it("6b-sr-8d: store fixtures pass registry validation after init", () => {
    useUiFixtureStore.getState().initFixtures();
    const errors = useUiFixtureStore.getState().validateFixtures();
    expect(errors).toHaveLength(0);
  });

  it("6b-sr-8e: dynamically registered fixture is retrievable from store", () => {
    useUiFixtureStore.getState().initFixtures();
    const extra = makeDashboardPanel({ fixture_id: "extra-panel-99", room_id: "ops-control" });
    useUiFixtureStore.getState().registerFixture(extra);
    const retrieved = useUiFixtureStore.getState().getFixture("extra-panel-99");
    expect(retrieved).toBeDefined();
    expect(retrieved?.fixture_type).toBe("dashboard_panel");
  });

  it("6b-sr-8f: selectDashboardPanelFixtures applied to store fixtures returns dashboard panels", () => {
    useUiFixtureStore.getState().initFixtures();
    const storeFixtures = useUiFixtureStore.getState().fixtures;
    const panels = selectDashboardPanelFixtures(storeFixtures);
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.fixture_type).toBe("dashboard_panel");
    }
  });

  it("6b-sr-8g: render entries computed from store fixtures match expected panel count", () => {
    useUiFixtureStore.getState().initFixtures();
    const storeFixtures = useUiFixtureStore.getState().fixtures;
    const panels = selectDashboardPanelFixtures(storeFixtures);
    const origins = makeDefaultRoomOrigins();
    const entries = computeStoreRenderEntries(panels, origins);
    expect(entries.length).toBe(panels.length);
  });
});

// ── 9. Spatial rendering contract ─────────────────────────────────────────────

describe("6b-sr-9: spatial rendering contract — all panels have valid 3D data", () => {
  beforeEach(resetStore);

  it("6b-sr-9a: all store dashboard panels have valid 3D position (finite numbers)", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    for (const f of panels) {
      const { x, y, z } = f.transform.position;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it("6b-sr-9b: all store dashboard panels have positive y (above room floor)", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    for (const f of panels) {
      expect(f.transform.position.y).toBeGreaterThan(0);
    }
  });

  it("6b-sr-9c: all store dashboard panels have valid rotation (finite Euler angles)", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    for (const f of panels) {
      const { x, y, z } = f.transform.rotation;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it("6b-sr-9d: all store dashboard panels have positive scale on all axes", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    for (const f of panels) {
      expect(f.transform.scale.x).toBeGreaterThan(0);
      expect(f.transform.scale.y).toBeGreaterThan(0);
      expect(f.transform.scale.z).toBeGreaterThan(0);
    }
  });

  it("6b-sr-9e: all store panels have positive visual dimensions (renderable mesh)", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    for (const f of panels) {
      expect(f.visual.width).toBeGreaterThan(0);
      expect(f.visual.height).toBeGreaterThan(0);
    }
  });

  it("6b-sr-9f: world position computed from store fixture + room origin is finite", () => {
    useUiFixtureStore.getState().initFixtures();
    const origins = makeDefaultRoomOrigins();
    const storeFixtures = useUiFixtureStore.getState().fixtures;
    const panels = selectDashboardPanelFixtures(storeFixtures);
    const entries = computeStoreRenderEntries(panels, origins);

    for (const { fixture, roomOrigin } of entries) {
      const worldX = roomOrigin.x + fixture.transform.position.x;
      const worldY = roomOrigin.y + fixture.transform.position.y;
      const worldZ = roomOrigin.z + fixture.transform.position.z;
      expect(Number.isFinite(worldX)).toBe(true);
      expect(Number.isFinite(worldY)).toBe(true);
      expect(Number.isFinite(worldZ)).toBe(true);
    }
  });

  it("6b-sr-9g: render entries from store have fixture_type = dashboard_panel", () => {
    useUiFixtureStore.getState().initFixtures();
    const origins = makeDefaultRoomOrigins();
    const storeFixtures = useUiFixtureStore.getState().fixtures;
    const panels = selectDashboardPanelFixtures(storeFixtures);
    const entries = computeStoreRenderEntries(panels, origins);

    for (const { fixture } of entries) {
      expect(fixture.fixture_type).toBe("dashboard_panel");
    }
  });
});

// ── 10. Multi-room rendering ───────────────────────────────────────────────────

describe("6b-sr-10: multi-room rendering — panels span multiple rooms", () => {
  beforeEach(resetStore);

  it("6b-sr-10a: store panels span at least 2 distinct rooms after init", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const rooms = new Set(panels.map((p) => p.room_id));
    expect(rooms.size).toBeGreaterThanOrEqual(2);
  });

  it("6b-sr-10b: groupFixturesByRoom applied to store panels produces ≥2 rooms", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const map = groupFixturesByRoom(panels);
    expect(map.size).toBeGreaterThanOrEqual(2);
  });

  it("6b-sr-10c: ops-control panels are grouped independently from project-main panels", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const map = groupFixturesByRoom(panels);
    const opsGroup   = map.get("ops-control");
    const lobbyGroup = map.get("project-main");
    expect(opsGroup).toBeDefined();
    expect(lobbyGroup).toBeDefined();
    // The groups must be different array references
    expect(opsGroup).not.toBe(lobbyGroup);
  });

  it("6b-sr-10d: total entries = sum of per-room groups (no double-counting)", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const map = groupFixturesByRoom(panels);
    const totalGrouped = [...map.values()].reduce((acc, g) => acc + g.length, 0);
    expect(totalGrouped).toBe(panels.length);
  });

  it("6b-sr-10e: room IDs in group map are non-empty strings", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const map = groupFixturesByRoom(panels);
    for (const roomId of map.keys()) {
      expect(typeof roomId).toBe("string");
      expect(roomId.length).toBeGreaterThan(0);
    }
  });
});

// ── 11. Graceful omissions ────────────────────────────────────────────────────

describe("6b-sr-11: graceful omissions — missing origins produce no render entry", () => {
  it("6b-sr-11a: partial roomOrigins map skips unresolvable fixtures", () => {
    const partialOrigins = new Map([
      ["ops-control", { x: 0, y: 0, z: 0 }],
      // project-main intentionally missing
    ]);
    const panels = getDashboardPanels();
    const entries = computeStoreRenderEntries(panels, partialOrigins);

    for (const { fixture } of entries) {
      expect(fixture.room_id).toBe("ops-control");
    }
  });

  it("6b-sr-11b: no entry is created for a fixture with an unknown room_id", () => {
    const fixtures = [
      makeDashboardPanel({ fixture_id: "dp-unknown", room_id: "ghost-room" }),
    ];
    const origins = makeDefaultRoomOrigins();
    const entries = computeStoreRenderEntries(fixtures, origins);
    expect(entries).toHaveLength(0);
  });

  it("6b-sr-11c: isDashboardPanelRenderable returns false for null-like room_ids", () => {
    const f = makeDashboardPanel({ room_id: "" });
    const origins = makeDefaultRoomOrigins();
    expect(isDashboardPanelRenderable(f, origins)).toBe(false);
  });

  it("6b-sr-11d: omission is silent — no error thrown for missing room origin", () => {
    const panels = getDashboardPanels();
    const emptyOrigins = new Map<string, { x: number; y: number; z: number }>();
    expect(() => computeStoreRenderEntries(panels, emptyOrigins)).not.toThrow();
  });
});

// ── 12. Fixture identity preservation ─────────────────────────────────────────

describe("6b-sr-12: fixture identity preservation — store round-trip keeps all fields", () => {
  beforeEach(resetStore);

  it("6b-sr-12a: fixture retrieved from store has same room_id as registered", () => {
    const f = makeDashboardPanel({ fixture_id: "test-rt-1", room_id: "ops-control" });
    useUiFixtureStore.getState().registerFixture(f);
    const retrieved = useUiFixtureStore.getState().getFixture("test-rt-1");
    expect(retrieved?.room_id).toBe("ops-control");
  });

  it("6b-sr-12b: fixture retrieved from store has same transform as registered", () => {
    const f = makeDashboardPanel({ fixture_id: "test-rt-2" });
    useUiFixtureStore.getState().registerFixture(f);
    const retrieved = useUiFixtureStore.getState().getFixture("test-rt-2");
    expect(retrieved?.transform.position).toEqual(f.transform.position);
    expect(retrieved?.transform.rotation).toEqual(f.transform.rotation);
    expect(retrieved?.transform.scale).toEqual(f.transform.scale);
  });

  it("6b-sr-12c: fixture retrieved from store has same visual config as registered", () => {
    const f = makeDashboardPanel({ fixture_id: "test-rt-3" });
    useUiFixtureStore.getState().registerFixture(f);
    const retrieved = useUiFixtureStore.getState().getFixture("test-rt-3");
    expect(retrieved?.visual).toEqual(f.visual);
  });

  it("6b-sr-12d: fixture retrieved from store has behavioral_contract preserved", () => {
    const f = makeDashboardPanel({ fixture_id: "test-rt-4" });
    useUiFixtureStore.getState().registerFixture(f);
    const retrieved = useUiFixtureStore.getState().getFixture("test-rt-4");
    expect(retrieved?.behavioral_contract.actions).toEqual(f.behavioral_contract.actions);
  });

  it("6b-sr-12e: all default fixtures survive initFixtures() round-trip", () => {
    useUiFixtureStore.getState().initFixtures();
    for (const expected of DEFAULT_UI_FIXTURES) {
      const retrieved = useUiFixtureStore.getState().getFixture(expected.fixture_id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.fixture_id).toBe(expected.fixture_id);
      expect(retrieved?.fixture_type).toBe(expected.fixture_type);
      expect(retrieved?.room_id).toBe(expected.room_id);
      expect(retrieved?.ontology_level).toBe("domain");
    }
  });

  it("6b-sr-12f: computeStoreRenderEntries preserves fixture reference identity from store", () => {
    useUiFixtureStore.getState().initFixtures();
    const storeFixtures = useUiFixtureStore.getState().fixtures;
    const panels = selectDashboardPanelFixtures(storeFixtures);
    const origins = makeDefaultRoomOrigins();
    const entries = computeStoreRenderEntries(panels, origins);

    for (const { fixture } of entries) {
      // The entry fixture must be the same object as in the store
      const storeVersion = storeFixtures[fixture.fixture_id];
      expect(fixture).toBe(storeVersion);
    }
  });
});
