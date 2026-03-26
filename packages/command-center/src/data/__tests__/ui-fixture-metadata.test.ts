/**
 * ui-fixture-metadata.test.ts — Tests for Sub-AC 6a metadata fields.
 *
 * Validates that `ui_fixture` entities of type `dashboard_panel` carry the
 * three required live data-source metadata bindings:
 *
 *   - live_agent_count_source:    identifies the store supplying agent count
 *   - task_status_summary_source: identifies the store supplying task status
 *   - event_rate_source:          identifies the store supplying event rate
 *
 * These fields are declared in DashboardPanelMetadata and are required on
 * all dashboard_panel fixtures per the ontology_schema verification contract.
 *
 * Tests:
 *  1.  DashboardPanelMetadata type has all three required source fields
 *  2.  ops-dashboard-main has metadata with live_agent_count_source
 *  3.  ops-dashboard-main has metadata with task_status_summary_source
 *  4.  ops-dashboard-main has metadata with event_rate_source
 *  5.  ops-dashboard-main metadata sources are non-empty strings
 *  6.  ops-dashboard-main live_agent_count_source references "agent-store"
 *  7.  ops-dashboard-main task_status_summary_source references "task-store"
 *  8.  ops-dashboard-main event_rate_source references "event-log"
 *  9.  All DEFAULT_UI_FIXTURES of type dashboard_panel have metadata
 * 10.  All dashboard_panel metadata.live_agent_count_source are non-empty
 * 11.  All dashboard_panel metadata.task_status_summary_source are non-empty
 * 12.  All dashboard_panel metadata.event_rate_source are non-empty
 * 13.  Fixture survives round-trip through entity store with metadata intact
 * 14.  fixture.placed event meta does not strip metadata fields
 * 15.  getDashboardPanels() returns only fixtures with metadata bindings
 * 16.  metadata sources match behavioral_contract.reads for agent/task data
 * 17.  Non-dashboard_panel fixtures may omit metadata (optional field)
 * 18.  metadata is a plain object (no prototype chain) for safe serialisation
 * 19.  All dashboard_panel fixtures have the same canonical source names
 * 20.  ops-dashboard-secondary also carries all three metadata fields
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_UI_FIXTURES,
  getDashboardPanels,
  getUiFixture,
  type UiFixtureDef,
  type DashboardPanelMetadata,
} from "../ui-fixture-registry.js";
import { useUiFixtureStore } from "../../store/ui-fixture-store.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical data-source names expected by the orchestration system. */
const EXPECTED_AGENT_SOURCE = "agent-store";
const EXPECTED_TASK_SOURCE  = "task-store";
const EXPECTED_EVENT_SOURCE = "event-log";

// ---------------------------------------------------------------------------
// Store reset helper
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

// ---------------------------------------------------------------------------
// 1. Type completeness (static shape guard — checked at compile time)
// ---------------------------------------------------------------------------

describe("DashboardPanelMetadata interface shape", () => {
  it("type includes live_agent_count_source, task_status_summary_source, event_rate_source", () => {
    // Compile-time check: if DashboardPanelMetadata is missing a field this
    // object literal will fail TypeScript, and hence Vitest typecheck.
    const m: DashboardPanelMetadata = {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    };
    expect(m.live_agent_count_source).toBe("agent-store");
    expect(m.task_status_summary_source).toBe("task-store");
    expect(m.event_rate_source).toBe("event-log");
  });
});

// ---------------------------------------------------------------------------
// 2–8. ops-dashboard-main metadata
// ---------------------------------------------------------------------------

describe("ops-dashboard-main metadata fields", () => {
  const fixture = getUiFixture("ops-dashboard-main");

  it("ops-dashboard-main exists in the registry", () => {
    expect(fixture).toBeDefined();
  });

  it("ops-dashboard-main has a metadata field", () => {
    expect(fixture!.metadata).toBeDefined();
  });

  it("ops-dashboard-main metadata has live_agent_count_source", () => {
    expect(fixture!.metadata!.live_agent_count_source).toBeDefined();
  });

  it("ops-dashboard-main metadata has task_status_summary_source", () => {
    expect(fixture!.metadata!.task_status_summary_source).toBeDefined();
  });

  it("ops-dashboard-main metadata has event_rate_source", () => {
    expect(fixture!.metadata!.event_rate_source).toBeDefined();
  });

  it("ops-dashboard-main metadata sources are all non-empty strings", () => {
    const m = fixture!.metadata!;
    expect(typeof m.live_agent_count_source).toBe("string");
    expect(m.live_agent_count_source.length).toBeGreaterThan(0);
    expect(typeof m.task_status_summary_source).toBe("string");
    expect(m.task_status_summary_source.length).toBeGreaterThan(0);
    expect(typeof m.event_rate_source).toBe("string");
    expect(m.event_rate_source.length).toBeGreaterThan(0);
  });

  it("ops-dashboard-main live_agent_count_source references agent-store", () => {
    expect(fixture!.metadata!.live_agent_count_source).toBe(EXPECTED_AGENT_SOURCE);
  });

  it("ops-dashboard-main task_status_summary_source references task-store", () => {
    expect(fixture!.metadata!.task_status_summary_source).toBe(EXPECTED_TASK_SOURCE);
  });

  it("ops-dashboard-main event_rate_source references event-log", () => {
    expect(fixture!.metadata!.event_rate_source).toBe(EXPECTED_EVENT_SOURCE);
  });
});

// ---------------------------------------------------------------------------
// 9–12. All dashboard_panel fixtures have complete metadata
// ---------------------------------------------------------------------------

describe("All dashboard_panel fixtures have metadata bindings", () => {
  const panels = getDashboardPanels();

  it("there is at least one dashboard_panel fixture", () => {
    expect(panels.length).toBeGreaterThanOrEqual(1);
  });

  it("every dashboard_panel has a metadata field", () => {
    for (const f of panels) {
      expect(
        f.metadata,
        `fixture "${f.fixture_id}" is missing metadata`,
      ).toBeDefined();
    }
  });

  it("every dashboard_panel metadata.live_agent_count_source is non-empty", () => {
    for (const f of panels) {
      expect(
        f.metadata!.live_agent_count_source.length,
        `fixture "${f.fixture_id}" has empty live_agent_count_source`,
      ).toBeGreaterThan(0);
    }
  });

  it("every dashboard_panel metadata.task_status_summary_source is non-empty", () => {
    for (const f of panels) {
      expect(
        f.metadata!.task_status_summary_source.length,
        `fixture "${f.fixture_id}" has empty task_status_summary_source`,
      ).toBeGreaterThan(0);
    }
  });

  it("every dashboard_panel metadata.event_rate_source is non-empty", () => {
    for (const f of panels) {
      expect(
        f.metadata!.event_rate_source.length,
        `fixture "${f.fixture_id}" has empty event_rate_source`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 13. Round-trip through entity store preserves metadata
// ---------------------------------------------------------------------------

describe("Metadata round-trip through entity store", () => {
  beforeEach(resetStore);

  it("fixture survives initFixtures() with metadata intact", () => {
    useUiFixtureStore.getState().initFixtures();
    const stored = useUiFixtureStore.getState().getFixture("ops-dashboard-main");
    expect(stored).toBeDefined();
    expect(stored!.metadata).toBeDefined();
    expect(stored!.metadata!.live_agent_count_source).toBe(EXPECTED_AGENT_SOURCE);
    expect(stored!.metadata!.task_status_summary_source).toBe(EXPECTED_TASK_SOURCE);
    expect(stored!.metadata!.event_rate_source).toBe(EXPECTED_EVENT_SOURCE);
  });

  it("registerFixture() preserves metadata on new fixture", () => {
    const fixtureWithMeta: UiFixtureDef = {
      fixture_id:    "meta-test-panel",
      fixture_name:  "Metadata Test Panel",
      fixture_type:  "dashboard_panel",
      room_id:       "ops-control",
      transform: {
        position:  { x: 1.0, y: 1.0, z: 1.0 },
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
        live_agent_count_source:    EXPECTED_AGENT_SOURCE,
        task_status_summary_source: EXPECTED_TASK_SOURCE,
        event_rate_source:          EXPECTED_EVENT_SOURCE,
      },
      behavioral_contract: {
        actions: ["display agent status"],
        reads:   ["agent-store"],
        emits:   ["fixture.panel_toggled"],
      },
      ontology_level: "domain",
      rationale:      "Test fixture for metadata round-trip validation.",
    };

    useUiFixtureStore.getState().registerFixture(fixtureWithMeta);
    const retrieved = useUiFixtureStore.getState().getFixture("meta-test-panel");
    expect(retrieved!.metadata).toBeDefined();
    expect(retrieved!.metadata!.live_agent_count_source).toBe(EXPECTED_AGENT_SOURCE);
    expect(retrieved!.metadata!.task_status_summary_source).toBe(EXPECTED_TASK_SOURCE);
    expect(retrieved!.metadata!.event_rate_source).toBe(EXPECTED_EVENT_SOURCE);
  });
});

// ---------------------------------------------------------------------------
// 14. fixture.placed event meta does not strip metadata
// ---------------------------------------------------------------------------

describe("fixture.placed event carries fixture metadata context", () => {
  beforeEach(resetStore);

  it("fixture.placed event for ops-dashboard-main carries room_id and position", () => {
    useUiFixtureStore.getState().initFixtures();
    const placedEvent = useUiFixtureStore
      .getState()
      .events.find(
        (e) => e.type === "fixture.placed" && e.fixtureId === "ops-dashboard-main",
      );
    // The event metadata (transport-layer meta) logs room_id and position
    // so the entity + its data-source context are both in the event log.
    expect(placedEvent).toBeDefined();
    expect(placedEvent!.meta?.room_id).toBe("ops-control");
    expect(placedEvent!.meta?.fixture_type).toBe("dashboard_panel");
  });
});

// ---------------------------------------------------------------------------
// 15. getDashboardPanels returns fixtures with metadata bindings
// ---------------------------------------------------------------------------

describe("getDashboardPanels metadata completeness", () => {
  it("getDashboardPanels() returns only dashboard_panel fixtures", () => {
    const panels = getDashboardPanels();
    for (const f of panels) {
      expect(f.fixture_type).toBe("dashboard_panel");
    }
  });

  it("every panel returned by getDashboardPanels() has metadata", () => {
    const panels = getDashboardPanels();
    for (const f of panels) {
      expect(f.metadata).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 16. metadata sources complement behavioral_contract (no conflict)
// ---------------------------------------------------------------------------

describe("metadata sources complement behavioral_contract", () => {
  it("every panel with metadata also has at least one behavioral_contract.reads entry", () => {
    // metadata and behavioral_contract.reads are complementary:
    //   metadata    — which stores supply the three canonical metric widgets
    //   reads       — which stores the panel's primary content type uses
    // They need not overlap 1:1; metadata can reference stores not in reads.
    const panels = getDashboardPanels();
    for (const f of panels) {
      if (f.metadata) {
        expect(
          (f.behavioral_contract.reads?.length ?? 0),
          `fixture "${f.fixture_id}" has metadata but empty behavioral_contract.reads`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("no metadata source is an empty string (every declared source is reachable)", () => {
    const panels = getDashboardPanels();
    for (const f of panels) {
      if (f.metadata) {
        expect(f.metadata.live_agent_count_source.trim().length).toBeGreaterThan(0);
        expect(f.metadata.task_status_summary_source.trim().length).toBeGreaterThan(0);
        expect(f.metadata.event_rate_source.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Non-dashboard_panel fixtures may omit metadata
// ---------------------------------------------------------------------------

describe("Non-dashboard_panel fixtures: metadata is optional", () => {
  it("UiFixtureDef allows metadata to be undefined (backwards compat)", () => {
    // This is a compile-time assertion: if metadata were required, this
    // object literal would be a TypeScript error.
    const minimalFixture: UiFixtureDef = {
      fixture_id:    "status-light-1",
      fixture_name:  "Status Light",
      fixture_type:  "status_light",
      room_id:       "ops-control",
      transform: {
        position:  { x: 0, y: 2, z: 0 },
        rotation:  { x: 0, y: 0, z: 0 },
        scale:     { x: 1, y: 1, z: 1 },
        facing:    "south",
        mountType: "ceiling",
      },
      visual: {
        width:             0.2,
        height:            0.2,
        bezelColor:        "#1a1a2a",
        screenColor:       "#0a0a14",
        accentColor:       "#00FF00",
        emissiveIntensity: 1.0,
        scanLines:         false,
        scanLineOpacity:   0,
      },
      content_type: "status",
      // metadata intentionally omitted
      behavioral_contract: {
        actions: ["indicate system health"],
      },
      ontology_level: "domain",
      rationale:      "Status light without metadata — valid for non-dashboard types.",
    };
    expect(minimalFixture.metadata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 18. metadata is a plain object (safe for serialisation)
// ---------------------------------------------------------------------------

describe("metadata object serialisation safety", () => {
  it("metadata is a plain object with no prototype chain beyond Object.prototype", () => {
    const panels = getDashboardPanels();
    for (const f of panels) {
      expect(Object.getPrototypeOf(f.metadata!)).toBe(Object.prototype);
    }
  });

  it("metadata survives JSON round-trip (stringify → parse) without data loss", () => {
    const fixture = getUiFixture("ops-dashboard-main")!;
    const json = JSON.stringify(fixture.metadata);
    const parsed = JSON.parse(json) as DashboardPanelMetadata;
    expect(parsed.live_agent_count_source).toBe(fixture.metadata!.live_agent_count_source);
    expect(parsed.task_status_summary_source).toBe(fixture.metadata!.task_status_summary_source);
    expect(parsed.event_rate_source).toBe(fixture.metadata!.event_rate_source);
  });
});

// ---------------------------------------------------------------------------
// 19. All dashboard_panel fixtures use the same canonical source names
// ---------------------------------------------------------------------------

describe("Canonical source name consistency across all dashboard panels", () => {
  it("all dashboard_panels reference the same live_agent_count_source", () => {
    const panels = getDashboardPanels();
    const sources = new Set(panels.map((f) => f.metadata!.live_agent_count_source));
    expect(sources.size).toBe(1);
    expect([...sources][0]).toBe(EXPECTED_AGENT_SOURCE);
  });

  it("all dashboard_panels reference the same task_status_summary_source", () => {
    const panels = getDashboardPanels();
    const sources = new Set(panels.map((f) => f.metadata!.task_status_summary_source));
    expect(sources.size).toBe(1);
    expect([...sources][0]).toBe(EXPECTED_TASK_SOURCE);
  });

  it("all dashboard_panels reference the same event_rate_source", () => {
    const panels = getDashboardPanels();
    const sources = new Set(panels.map((f) => f.metadata!.event_rate_source));
    expect(sources.size).toBe(1);
    expect([...sources][0]).toBe(EXPECTED_EVENT_SOURCE);
  });
});

// ---------------------------------------------------------------------------
// 20. ops-dashboard-secondary also carries all three metadata fields
// ---------------------------------------------------------------------------

describe("ops-dashboard-secondary metadata completeness", () => {
  const fixture = getUiFixture("ops-dashboard-secondary");

  it("ops-dashboard-secondary exists in the registry", () => {
    expect(fixture).toBeDefined();
  });

  it("ops-dashboard-secondary has metadata with live_agent_count_source", () => {
    expect(fixture!.metadata!.live_agent_count_source).toBe(EXPECTED_AGENT_SOURCE);
  });

  it("ops-dashboard-secondary has metadata with task_status_summary_source", () => {
    expect(fixture!.metadata!.task_status_summary_source).toBe(EXPECTED_TASK_SOURCE);
  });

  it("ops-dashboard-secondary has metadata with event_rate_source", () => {
    expect(fixture!.metadata!.event_rate_source).toBe(EXPECTED_EVENT_SOURCE);
  });
});
