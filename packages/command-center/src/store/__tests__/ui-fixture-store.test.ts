/**
 * ui-fixture-store.test.ts — Tests for Sub-AC 6a (Sub-AC 1).
 *
 * Validates that:
 *  1.  initFixtures() seeds all DEFAULT_UI_FIXTURES into the entity store
 *  2.  Every fixture has fixture_type, transform (position/rotation/scale), and metadata
 *  3.  At least one dashboard_panel fixture is registered on init
 *  4.  ops-dashboard-main is registered with correct spatial transform data
 *  5.  initFixtures() is idempotent (double-call does not duplicate entities)
 *  6.  fixture.placed events are emitted for each fixture on init
 *  7.  fixture.initialized is emitted after all placements
 *  8.  registerFixture() adds a new fixture and emits fixture.placed
 *  9.  registerFixture() updates an existing fixture and emits fixture.updated
 * 10.  removeFixture() removes a fixture and emits fixture.removed
 * 11.  removeFixture() is a no-op for non-existent fixtures
 * 12.  selectFixture() sets selectedFixtureId and emits fixture.panel_toggled
 * 13.  selectFixture(null) clears selection
 * 14.  validateFixtures() returns empty errors for valid default fixtures
 * 15.  getFixturesForRoom() returns only fixtures in the specified room
 * 16.  getFixturesByType() returns only fixtures of the specified type
 * 17.  getDashboardPanels() returns all dashboard_panel fixtures
 * 18.  getFixtureCount() returns the correct entity count
 * 19.  All required ontology_schema metadata fields are present per fixture
 * 20.  Event seq numbers are monotonically increasing
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useUiFixtureStore,
  type UiFixtureDef,
  type UiFixtureStoreEvent,
} from "../ui-fixture-store.js";
import { DEFAULT_UI_FIXTURES } from "../../data/ui-fixture-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore(): void {
  useUiFixtureStore.setState({
    fixtures: {},
    fixtureIds: [],
    initialized: false,
    selectedFixtureId: null,
    selectedAt: null,
    events: [],
    seq: 0,
    validationErrors: [],
  });
}

/** Minimal valid dashboard_panel fixture for test use. */
function makeDashboardPanel(overrides: Partial<UiFixtureDef> = {}): UiFixtureDef {
  return {
    fixture_id: "test-panel-1",
    fixture_name: "Test Dashboard Panel",
    fixture_type: "dashboard_panel",
    room_id: "ops-control",
    transform: {
      position: { x: 2.5, y: 1.5, z: 3.85 },
      rotation: { x: 0, y: Math.PI, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      facing: "north",
      mountType: "wall",
    },
    visual: {
      width: 1.6,
      height: 0.9,
      bezelColor: "#1a1a2a",
      screenColor: "#0a0a14",
      accentColor: "#FF7043",
      emissiveIntensity: 0.4,
      scanLines: true,
      scanLineOpacity: 0.06,
    },
    content_type: "agent_status",
    behavioral_contract: {
      actions: ["display agent status", "emit fixture.panel_toggled on click"],
      reads: ["agent-store"],
      emits: ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale: "Test panel for unit testing.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1–3. initFixtures — seeding
// ---------------------------------------------------------------------------

describe("useUiFixtureStore.initFixtures", () => {
  beforeEach(resetStore);

  it("seeds all DEFAULT_UI_FIXTURES into the entity store", () => {
    useUiFixtureStore.getState().initFixtures();
    const count = useUiFixtureStore.getState().getFixtureCount();
    expect(count).toBe(DEFAULT_UI_FIXTURES.length);
  });

  it("sets initialized = true after seeding", () => {
    useUiFixtureStore.getState().initFixtures();
    expect(useUiFixtureStore.getState().initialized).toBe(true);
  });

  it("registers at least one dashboard_panel fixture", () => {
    useUiFixtureStore.getState().initFixtures();
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    expect(panels.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Spatial transform data for ops-dashboard-main
// ---------------------------------------------------------------------------

describe("ops-dashboard-main fixture spatial transform", () => {
  beforeEach(resetStore);

  it("registers ops-dashboard-main with correct position", () => {
    useUiFixtureStore.getState().initFixtures();
    const fixture = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(fixture).toBeDefined();
    expect(fixture!.transform.position.x).toBeCloseTo(2.5);
    expect(fixture!.transform.position.y).toBeCloseTo(1.5);
    expect(fixture!.transform.position.z).toBeCloseTo(3.85);
  });

  it("registers ops-dashboard-main with north-facing rotation (Math.PI on Y)", () => {
    useUiFixtureStore.getState().initFixtures();
    const fixture = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(fixture!.transform.rotation.y).toBeCloseTo(Math.PI);
    expect(fixture!.transform.facing).toBe("north");
  });

  it("registers ops-dashboard-main with wall mountType", () => {
    useUiFixtureStore.getState().initFixtures();
    const fixture = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(fixture!.transform.mountType).toBe("wall");
  });

  it("registers ops-dashboard-main with scale {1,1,1}", () => {
    useUiFixtureStore.getState().initFixtures();
    const fixture = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(fixture!.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
  });
});

// ---------------------------------------------------------------------------
// 5. Idempotency
// ---------------------------------------------------------------------------

describe("initFixtures idempotency", () => {
  beforeEach(resetStore);

  it("double-calling initFixtures does not duplicate entities", () => {
    useUiFixtureStore.getState().initFixtures();
    const countAfterFirst = useUiFixtureStore.getState().getFixtureCount();
    useUiFixtureStore.getState().initFixtures();
    const countAfterSecond = useUiFixtureStore.getState().getFixtureCount();
    expect(countAfterFirst).toBe(countAfterSecond);
  });

  it("double-calling initFixtures does not duplicate events", () => {
    useUiFixtureStore.getState().initFixtures();
    const eventsAfterFirst = useUiFixtureStore.getState().events.length;
    useUiFixtureStore.getState().initFixtures();
    const eventsAfterSecond = useUiFixtureStore.getState().events.length;
    expect(eventsAfterFirst).toBe(eventsAfterSecond);
  });
});

// ---------------------------------------------------------------------------
// 6–7. Event sourcing on init
// ---------------------------------------------------------------------------

describe("fixture.placed events on initFixtures", () => {
  beforeEach(resetStore);

  it("emits fixture.placed for each seeded fixture", () => {
    useUiFixtureStore.getState().initFixtures();
    const placedEvents = useUiFixtureStore
      .getState()
      .events.filter((e) => e.type === "fixture.placed");
    expect(placedEvents.length).toBe(DEFAULT_UI_FIXTURES.length);
  });

  it("fixture.placed events carry fixtureId matching the seeded fixture", () => {
    useUiFixtureStore.getState().initFixtures();
    const placedEvents = useUiFixtureStore
      .getState()
      .events.filter((e) => e.type === "fixture.placed");
    const placedIds = new Set(placedEvents.map((e) => e.fixtureId));
    for (const f of DEFAULT_UI_FIXTURES) {
      expect(placedIds.has(f.fixture_id)).toBe(true);
    }
  });

  it("fixture.placed event meta contains fixture_type, room_id, position, facing", () => {
    useUiFixtureStore.getState().initFixtures();
    const mainEvent = useUiFixtureStore
      .getState()
      .events.find(
        (e) => e.type === "fixture.placed" && e.fixtureId === "ops-dashboard-main",
      );
    expect(mainEvent).toBeDefined();
    expect(mainEvent!.meta?.fixture_type).toBe("dashboard_panel");
    expect(mainEvent!.meta?.room_id).toBe("ops-control");
    expect(mainEvent!.meta?.facing).toBe("north");
    expect((mainEvent!.meta?.position as { x: number }).x).toBeCloseTo(2.5);
  });

  it("emits fixture.initialized after all placements", () => {
    useUiFixtureStore.getState().initFixtures();
    const events = useUiFixtureStore.getState().events;
    const initEvent = events.find((e) => e.type === "fixture.initialized");
    expect(initEvent).toBeDefined();
    expect(initEvent!.fixtureId).toBe("registry");
    // fixture.initialized must be the last event
    expect(events[events.length - 1].type).toBe("fixture.initialized");
  });

  it("fixture.initialized meta contains count of registered fixtures", () => {
    useUiFixtureStore.getState().initFixtures();
    const initEvent = useUiFixtureStore
      .getState()
      .events.find((e) => e.type === "fixture.initialized");
    expect(initEvent!.meta?.count).toBe(DEFAULT_UI_FIXTURES.length);
  });
});

// ---------------------------------------------------------------------------
// 8–9. registerFixture
// ---------------------------------------------------------------------------

describe("useUiFixtureStore.registerFixture", () => {
  beforeEach(resetStore);

  it("adds a new fixture and emits fixture.placed", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    expect(useUiFixtureStore.getState().fixtures["test-panel-1"]).toEqual(panel);
    const lastEvent = useUiFixtureStore.getState().events.at(-1)!;
    expect(lastEvent.type).toBe("fixture.placed");
    expect(lastEvent.fixtureId).toBe("test-panel-1");
  });

  it("increments fixtureIds on new registration", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    expect(useUiFixtureStore.getState().fixtureIds).toContain("test-panel-1");
  });

  it("updates an existing fixture and emits fixture.updated", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    // Re-register with updated name
    const updated = { ...panel, fixture_name: "Updated Panel" };
    useUiFixtureStore.getState().registerFixture(updated);
    const stored = useUiFixtureStore.getState().getFixture("test-panel-1");
    expect(stored!.fixture_name).toBe("Updated Panel");
    const lastEvent = useUiFixtureStore.getState().events.at(-1)!;
    expect(lastEvent.type).toBe("fixture.updated");
  });

  it("does not duplicate fixtureIds on update", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    useUiFixtureStore.getState().registerFixture({ ...panel, fixture_name: "Updated" });
    const ids = useUiFixtureStore.getState().fixtureIds;
    expect(ids.filter((id) => id === "test-panel-1").length).toBe(1);
  });

  it("registered fixture retains all required metadata fields", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    const stored = useUiFixtureStore.getState().getFixture("test-panel-1")!;
    expect(stored.fixture_id).toBe("test-panel-1");
    expect(stored.fixture_name).toBeTruthy();
    expect(stored.fixture_type).toBe("dashboard_panel");
    expect(stored.room_id).toBeTruthy();
    expect(stored.transform).toBeDefined();
    expect(stored.transform.position).toBeDefined();
    expect(stored.transform.rotation).toBeDefined();
    expect(stored.transform.scale).toBeDefined();
    expect(stored.transform.facing).toBeTruthy();
    expect(stored.transform.mountType).toBeTruthy();
    expect(stored.visual).toBeDefined();
    expect(stored.content_type).toBeTruthy();
    expect(stored.behavioral_contract.actions.length).toBeGreaterThan(0);
    expect(stored.ontology_level).toBe("domain");
    expect(stored.rationale).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 10–11. removeFixture
// ---------------------------------------------------------------------------

describe("useUiFixtureStore.removeFixture", () => {
  beforeEach(resetStore);

  it("removes a registered fixture and emits fixture.removed", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    useUiFixtureStore.getState().removeFixture("test-panel-1");
    expect(useUiFixtureStore.getState().fixtures["test-panel-1"]).toBeUndefined();
    const lastEvent = useUiFixtureStore.getState().events.at(-1)!;
    expect(lastEvent.type).toBe("fixture.removed");
    expect(lastEvent.fixtureId).toBe("test-panel-1");
  });

  it("removes fixture_id from fixtureIds list", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    useUiFixtureStore.getState().removeFixture("test-panel-1");
    expect(useUiFixtureStore.getState().fixtureIds).not.toContain("test-panel-1");
  });

  it("is a no-op for non-existent fixture_id (no event emitted)", () => {
    const eventsBefore = useUiFixtureStore.getState().events.length;
    useUiFixtureStore.getState().removeFixture("nonexistent-fixture");
    const eventsAfter = useUiFixtureStore.getState().events.length;
    expect(eventsAfter).toBe(eventsBefore);
  });

  it("clears selectedFixtureId when the selected fixture is removed", () => {
    const panel = makeDashboardPanel();
    useUiFixtureStore.getState().registerFixture(panel);
    useUiFixtureStore.getState().selectFixture("test-panel-1");
    useUiFixtureStore.getState().removeFixture("test-panel-1");
    expect(useUiFixtureStore.getState().selectedFixtureId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12–13. selectFixture
// ---------------------------------------------------------------------------

describe("useUiFixtureStore.selectFixture", () => {
  beforeEach(resetStore);

  it("sets selectedFixtureId and emits fixture.panel_toggled", () => {
    useUiFixtureStore.getState().selectFixture("ops-dashboard-main");
    expect(useUiFixtureStore.getState().selectedFixtureId).toBe("ops-dashboard-main");
    const lastEvent = useUiFixtureStore.getState().events.at(-1)!;
    expect(lastEvent.type).toBe("fixture.panel_toggled");
    expect(lastEvent.meta?.next).toBe("ops-dashboard-main");
  });

  it("sets selectedAt timestamp on selection", () => {
    const before = Date.now();
    useUiFixtureStore.getState().selectFixture("ops-dashboard-main");
    const after = Date.now();
    const ts = useUiFixtureStore.getState().selectedAt;
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });

  it("selectFixture(null) clears selection and sets selectedAt to null", () => {
    useUiFixtureStore.getState().selectFixture("ops-dashboard-main");
    useUiFixtureStore.getState().selectFixture(null);
    expect(useUiFixtureStore.getState().selectedFixtureId).toBeNull();
    expect(useUiFixtureStore.getState().selectedAt).toBeNull();
  });

  it("panel_toggled meta records prev and next selection ids", () => {
    useUiFixtureStore.getState().selectFixture("panel-a");
    useUiFixtureStore.getState().selectFixture("panel-b");
    const lastEvent = useUiFixtureStore.getState().events.at(-1)!;
    expect(lastEvent.meta?.prev).toBe("panel-a");
    expect(lastEvent.meta?.next).toBe("panel-b");
  });
});

// ---------------------------------------------------------------------------
// 14. validateFixtures
// ---------------------------------------------------------------------------

describe("useUiFixtureStore.validateFixtures", () => {
  beforeEach(resetStore);

  it("returns empty errors for valid default fixtures", () => {
    useUiFixtureStore.getState().initFixtures();
    const errors = useUiFixtureStore.getState().validateFixtures();
    expect(errors).toHaveLength(0);
  });

  it("stores validation errors in validationErrors field", () => {
    // Register a fixture with no behavioral_contract.actions (invalid)
    const invalid = makeDashboardPanel({
      fixture_id: "invalid-panel",
      behavioral_contract: { actions: [] },
    });
    useUiFixtureStore.getState().registerFixture(invalid);
    useUiFixtureStore.getState().validateFixtures();
    expect(useUiFixtureStore.getState().validationErrors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 15–18. Selector coverage
// ---------------------------------------------------------------------------

describe("useUiFixtureStore selectors", () => {
  beforeEach(() => {
    resetStore();
    useUiFixtureStore.getState().initFixtures();
  });

  it("getFixturesForRoom returns only fixtures in the specified room", () => {
    const opsFixtures = useUiFixtureStore.getState().getFixturesForRoom("ops-control");
    for (const f of opsFixtures) {
      expect(f.room_id).toBe("ops-control");
    }
    // There should be at least 1 ops fixture (ops-dashboard-main, ops-dashboard-secondary)
    expect(opsFixtures.length).toBeGreaterThanOrEqual(1);
  });

  it("getFixturesByType returns only fixtures of the specified type", () => {
    const panels = useUiFixtureStore.getState().getFixturesByType("dashboard_panel");
    for (const f of panels) {
      expect(f.fixture_type).toBe("dashboard_panel");
    }
    expect(panels.length).toBeGreaterThanOrEqual(1);
  });

  it("getDashboardPanels returns all dashboard_panel fixtures", () => {
    const panels = useUiFixtureStore.getState().getDashboardPanels();
    const allPanelCount = DEFAULT_UI_FIXTURES.filter(
      (f) => f.fixture_type === "dashboard_panel",
    ).length;
    expect(panels.length).toBe(allPanelCount);
  });

  it("getFixtureCount returns the total registered fixture count", () => {
    expect(useUiFixtureStore.getState().getFixtureCount()).toBe(DEFAULT_UI_FIXTURES.length);
  });

  it("getFixture returns undefined for non-existent fixture_id", () => {
    expect(useUiFixtureStore.getState().getFixture("does-not-exist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 19. Ontology_schema metadata completeness per fixture
// ---------------------------------------------------------------------------

describe("Ontology schema metadata completeness", () => {
  beforeEach(() => {
    resetStore();
    useUiFixtureStore.getState().initFixtures();
  });

  it("every registered fixture has all required ontology_schema fields", () => {
    const fixtures = Object.values(useUiFixtureStore.getState().fixtures);
    for (const f of fixtures) {
      // Identity
      expect(f.fixture_id).toBeTruthy();
      expect(f.fixture_name).toBeTruthy();
      expect(f.fixture_type).toBeTruthy();
      // Room assignment
      expect(f.room_id).toBeTruthy();
      // Spatial transform — position
      expect(typeof f.transform.position.x).toBe("number");
      expect(typeof f.transform.position.y).toBe("number");
      expect(typeof f.transform.position.z).toBe("number");
      // Spatial transform — rotation
      expect(typeof f.transform.rotation.x).toBe("number");
      expect(typeof f.transform.rotation.y).toBe("number");
      expect(typeof f.transform.rotation.z).toBe("number");
      // Spatial transform — scale
      expect(typeof f.transform.scale.x).toBe("number");
      expect(typeof f.transform.scale.y).toBe("number");
      expect(typeof f.transform.scale.z).toBe("number");
      // Spatial transform — semantic
      expect(["north","south","east","west","up"]).toContain(f.transform.facing);
      expect(["wall","desk","floor","ceiling"]).toContain(f.transform.mountType);
      // Visual config
      expect(f.visual).toBeDefined();
      // Content type
      expect(f.content_type).toBeTruthy();
      // Behavioral contract
      expect(f.behavioral_contract.actions.length).toBeGreaterThan(0);
      // Ontology level
      expect(f.ontology_level).toBe("domain");
      // Rationale (audit field)
      expect(f.rationale).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Seq numbers monotonically increasing
// ---------------------------------------------------------------------------

describe("Seq number monotonicity", () => {
  beforeEach(resetStore);

  it("seq numbers are strictly increasing across all events", () => {
    useUiFixtureStore.getState().initFixtures();
    useUiFixtureStore.getState().selectFixture("ops-dashboard-main");
    useUiFixtureStore.getState().selectFixture(null);

    const events = useUiFixtureStore.getState().events;
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
  });

  it("each registerFixture call increments seq by 1", () => {
    const before = useUiFixtureStore.getState().seq;
    useUiFixtureStore.getState().registerFixture(makeDashboardPanel());
    const after = useUiFixtureStore.getState().seq;
    expect(after).toBe(before + 1);
  });
});
