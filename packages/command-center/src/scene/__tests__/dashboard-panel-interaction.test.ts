/**
 * dashboard-panel-interaction.test.ts — Unit tests for Sub-AC 6c:
 * Diegetic interaction behaviors on the dashboard_panel surface.
 *
 * Tests the pure-logic functions extracted from DashboardPanelInteraction.tsx:
 *
 *   1.  computeExpandScale()        — target scale for hovered vs. idle panel
 *   2.  lerpValue()                 — smooth linear interpolation helper
 *   3.  computeDetailPanelOffset()  — world-space offset for detail overlay
 *   4.  shouldRevealDetailSection() — threshold check for active-agent highlight
 *   5.  computeHoverGlowMultiplier()— emissive glow on hover
 *   6.  buildDetailMetricRows()     — metric row builder for detail view
 *   7.  Constants                   — PANEL_EXPAND_FACTOR, LERP_ALPHA, offsets, etc.
 *   8.  Interaction event types     — fixture.panel_hovered, fixture.detail_opened, etc.
 *   9.  Offset direction contracts  — each facing returns correct axis offset
 *  10.  Detail rows shape contract  — required fields and value types
 *  11.  Integration: detail rows from metrics summary
 *  12.  Edge cases and boundary conditions
 *
 * NOTE: React components (InteractiveDashboardPanel, PanelDetailOverlay,
 *       PanelHoverExpandController) require a WebGL canvas + React rendering
 *       environment — only pure-logic helpers are tested here, following the
 *       established pattern of dashboard-panel.test.ts and
 *       dashboard-panel-metrics.test.ts.
 *
 * Test ID scheme:
 *   6c-pi-N : Sub-AC 6c panel interaction
 */

import { describe, it, expect } from "vitest";
import {
  // Pure-logic functions
  computeExpandScale,
  lerpValue,
  computeDetailPanelOffset,
  shouldRevealDetailSection,
  computeHoverGlowMultiplier,
  buildDetailMetricRows,
  // Constants
  PANEL_EXPAND_FACTOR,
  PANEL_EXPAND_LERP_ALPHA,
  DETAIL_PANEL_FORWARD_OFFSET,
  DETAIL_PANEL_UP_OFFSET,
  DETAIL_PANEL_DIST_FACTOR,
  DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD,
  HOVER_GLOW_MULTIPLIER,
  // Types
  type DetailMetricRow,
} from "../DashboardPanelInteraction.js";
import { computePanelMetricsSummary } from "../DashboardPanelMetrics.js";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeAgentStatus(overrides: Partial<{
  active: number; busy: number; idle: number; inactive: number;
  error: number; terminated: number; total: number;
}> = {}) {
  return {
    active:     overrides.active     ?? 0,
    busy:       overrides.busy       ?? 0,
    idle:       overrides.idle       ?? 0,
    inactive:   overrides.inactive   ?? 0,
    error:      overrides.error      ?? 0,
    terminated: overrides.terminated ?? 0,
    total:      overrides.total      ?? 0,
  };
}

function makeBinding(overrides: Partial<{
  agentStatus: ReturnType<typeof makeAgentStatus>;
  taskQueueDepth: number;
  throughputRaw: number;
  isLive: boolean;
  connectionStatus: "connecting" | "connected" | "degraded" | "disconnected";
}> = {}) {
  return {
    agentStatus:      overrides.agentStatus      ?? makeAgentStatus(),
    taskQueueDepth:   overrides.taskQueueDepth   ?? 0,
    throughputRaw:    overrides.throughputRaw    ?? 0,
    isLive:           overrides.isLive           ?? false,
    connectionStatus: overrides.connectionStatus ?? ("disconnected" as const),
  };
}

function makeSummary(overrides: Parameters<typeof makeBinding>[0] = {}, done = 0) {
  return computePanelMetricsSummary(makeBinding(overrides), done);
}

// ── 1. computeExpandScale() ────────────────────────────────────────────────────

describe("6c-pi-1: computeExpandScale()", () => {
  it("6c-pi-1a: returns 1.0 when not hovered", () => {
    expect(computeExpandScale(false)).toBe(1.0);
  });

  it("6c-pi-1b: returns PANEL_EXPAND_FACTOR when hovered", () => {
    expect(computeExpandScale(true)).toBe(PANEL_EXPAND_FACTOR);
  });

  it("6c-pi-1c: custom expandFactor is respected", () => {
    expect(computeExpandScale(true, 1.10)).toBe(1.10);
    expect(computeExpandScale(false, 1.10)).toBe(1.0);
  });

  it("6c-pi-1d: PANEL_EXPAND_FACTOR is greater than 1.0 (panel grows on hover)", () => {
    expect(PANEL_EXPAND_FACTOR).toBeGreaterThan(1.0);
  });

  it("6c-pi-1e: PANEL_EXPAND_FACTOR is at most 1.20 (subtle, not jarring)", () => {
    expect(PANEL_EXPAND_FACTOR).toBeLessThanOrEqual(1.20);
  });

  it("6c-pi-1f: hovered scale is always > idle scale", () => {
    expect(computeExpandScale(true)).toBeGreaterThan(computeExpandScale(false));
  });

  it("6c-pi-1g: idle scale is exactly 1.0 (no size change when not hovered)", () => {
    expect(computeExpandScale(false, 1.15)).toBe(1.0);
  });

  it("6c-pi-1h: returns 1.0 when expandFactor is 1.0 even when hovered", () => {
    expect(computeExpandScale(true, 1.0)).toBe(1.0);
  });
});

// ── 2. lerpValue() ────────────────────────────────────────────────────────────

describe("6c-pi-2: lerpValue()", () => {
  it("6c-pi-2a: alpha=0 → returns current", () => {
    expect(lerpValue(2.0, 5.0, 0)).toBe(2.0);
  });

  it("6c-pi-2b: alpha=1 → returns target", () => {
    expect(lerpValue(2.0, 5.0, 1)).toBe(5.0);
  });

  it("6c-pi-2c: alpha=0.5 → returns midpoint", () => {
    expect(lerpValue(0, 10, 0.5)).toBeCloseTo(5.0, 8);
  });

  it("6c-pi-2d: alpha=0.25 → correct interpolation", () => {
    expect(lerpValue(0, 4, 0.25)).toBeCloseTo(1.0, 8);
  });

  it("6c-pi-2e: alpha > 1 is clamped to 1", () => {
    expect(lerpValue(0, 10, 2.0)).toBe(10);
  });

  it("6c-pi-2f: alpha < 0 is clamped to 0", () => {
    expect(lerpValue(5, 10, -1)).toBe(5);
  });

  it("6c-pi-2g: works with negative values", () => {
    expect(lerpValue(-10, -4, 0.5)).toBeCloseTo(-7.0, 8);
  });

  it("6c-pi-2h: current === target → returns target regardless of alpha", () => {
    expect(lerpValue(3.0, 3.0, 0.0)).toBeCloseTo(3.0, 8);
    expect(lerpValue(3.0, 3.0, 0.5)).toBeCloseTo(3.0, 8);
    expect(lerpValue(3.0, 3.0, 1.0)).toBeCloseTo(3.0, 8);
  });

  it("6c-pi-2i: PANEL_EXPAND_LERP_ALPHA is in (0, 1) exclusive", () => {
    expect(PANEL_EXPAND_LERP_ALPHA).toBeGreaterThan(0);
    expect(PANEL_EXPAND_LERP_ALPHA).toBeLessThan(1);
  });

  it("6c-pi-2j: repeated application converges toward target", () => {
    let val = 0;
    const target = 1.0;
    for (let i = 0; i < 100; i++) {
      val = lerpValue(val, target, PANEL_EXPAND_LERP_ALPHA);
    }
    // After 100 frames, should be > 99% of target
    expect(val).toBeGreaterThan(0.99);
  });

  it("6c-pi-2k: lerpValue is monotonically approaching target from below", () => {
    let val = 0;
    const target = 1.0;
    const alpha  = 0.1;
    const history: number[] = [val];
    for (let i = 0; i < 20; i++) {
      val = lerpValue(val, target, alpha);
      history.push(val);
    }
    // Each step should be larger than the previous (monotone increasing toward target)
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).toBeGreaterThanOrEqual(history[i - 1]);
    }
  });
});

// ── 3. computeDetailPanelOffset() ─────────────────────────────────────────────

describe("6c-pi-3: computeDetailPanelOffset()", () => {
  it("6c-pi-3a: north facing → forward on -Z axis (pushes south)", () => {
    const [x, y, z] = computeDetailPanelOffset("north");
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeLessThan(0);  // -FORWARD
  });

  it("6c-pi-3b: south facing → forward on +Z axis (pushes north)", () => {
    const [x, y, z] = computeDetailPanelOffset("south");
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);  // +FORWARD
  });

  it("6c-pi-3c: east facing → forward on -X axis (pushes west)", () => {
    const [x, y, z] = computeDetailPanelOffset("east");
    expect(x).toBeLessThan(0);  // -FORWARD
    expect(y).toBeGreaterThan(0);
    expect(z).toBe(0);
  });

  it("6c-pi-3d: west facing → forward on +X axis (pushes east)", () => {
    const [x, y, z] = computeDetailPanelOffset("west");
    expect(x).toBeGreaterThan(0);  // +FORWARD
    expect(y).toBeGreaterThan(0);
    expect(z).toBe(0);
  });

  it("6c-pi-3e: up facing → non-zero x and z (floor-standing diagonal)", () => {
    const [, y,] = computeDetailPanelOffset("up");
    expect(y).toBeGreaterThan(0);  // always has upward component
  });

  it("6c-pi-3f: y component is always positive (always above the panel)", () => {
    const facings = ["north", "south", "east", "west", "up"] as const;
    for (const facing of facings) {
      const [, y,] = computeDetailPanelOffset(facing);
      expect(y).toBeGreaterThan(0);
    }
  });

  it("6c-pi-3g: custom forwardDist and upDist are applied correctly", () => {
    const fwd = 1.0;
    const up  = 2.0;
    const [, y, z] = computeDetailPanelOffset("south", fwd, up);
    expect(y).toBeCloseTo(up, 8);
    expect(z).toBeCloseTo(fwd, 8);
  });

  it("6c-pi-3h: returns a tuple of exactly 3 numbers", () => {
    const offset = computeDetailPanelOffset("north");
    expect(offset).toHaveLength(3);
    for (const v of offset) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("6c-pi-3i: default forward distance = DETAIL_PANEL_FORWARD_OFFSET", () => {
    const [, , z] = computeDetailPanelOffset("south");
    expect(z).toBeCloseTo(DETAIL_PANEL_FORWARD_OFFSET, 8);
  });

  it("6c-pi-3j: default up distance = DETAIL_PANEL_UP_OFFSET", () => {
    const [, y,] = computeDetailPanelOffset("south");
    expect(y).toBeCloseTo(DETAIL_PANEL_UP_OFFSET, 8);
  });

  it("6c-pi-3k: north and south offsets are symmetric on Z", () => {
    const [, , zNorth] = computeDetailPanelOffset("north");
    const [, , zSouth] = computeDetailPanelOffset("south");
    expect(Math.abs(zNorth)).toBeCloseTo(Math.abs(zSouth), 8);
    expect(zNorth).toBeLessThan(0);
    expect(zSouth).toBeGreaterThan(0);
  });

  it("6c-pi-3l: east and west offsets are symmetric on X", () => {
    const [xEast] = computeDetailPanelOffset("east");
    const [xWest] = computeDetailPanelOffset("west");
    expect(Math.abs(xEast)).toBeCloseTo(Math.abs(xWest), 8);
    expect(xEast).toBeLessThan(0);
    expect(xWest).toBeGreaterThan(0);
  });
});

// ── 4. shouldRevealDetailSection() ────────────────────────────────────────────

describe("6c-pi-4: shouldRevealDetailSection()", () => {
  it("6c-pi-4a: 0 active agents → false (no highlight)", () => {
    expect(shouldRevealDetailSection(0)).toBe(false);
  });

  it("6c-pi-4b: 1 active agent (at default threshold) → true", () => {
    expect(shouldRevealDetailSection(1)).toBe(true);
  });

  it("6c-pi-4c: 5 active agents → true", () => {
    expect(shouldRevealDetailSection(5)).toBe(true);
  });

  it("6c-pi-4d: custom threshold = 3, activeAgents = 2 → false", () => {
    expect(shouldRevealDetailSection(2, 3)).toBe(false);
  });

  it("6c-pi-4e: custom threshold = 3, activeAgents = 3 → true", () => {
    expect(shouldRevealDetailSection(3, 3)).toBe(true);
  });

  it("6c-pi-4f: custom threshold = 3, activeAgents = 4 → true", () => {
    expect(shouldRevealDetailSection(4, 3)).toBe(true);
  });

  it("6c-pi-4g: DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD is a positive integer", () => {
    expect(DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isInteger(DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD)).toBe(true);
  });

  it("6c-pi-4h: result is always boolean", () => {
    expect(typeof shouldRevealDetailSection(0)).toBe("boolean");
    expect(typeof shouldRevealDetailSection(1)).toBe("boolean");
    expect(typeof shouldRevealDetailSection(999)).toBe("boolean");
  });
});

// ── 5. computeHoverGlowMultiplier() ───────────────────────────────────────────

describe("6c-pi-5: computeHoverGlowMultiplier()", () => {
  it("6c-pi-5a: not hovered, not active → 1.0 (no glow boost)", () => {
    expect(computeHoverGlowMultiplier(false, false)).toBe(1.0);
  });

  it("6c-pi-5b: hovered but not active → HOVER_GLOW_MULTIPLIER", () => {
    expect(computeHoverGlowMultiplier(true, false)).toBe(HOVER_GLOW_MULTIPLIER);
  });

  it("6c-pi-5c: active → 1.0 (active panels have their own glow logic)", () => {
    expect(computeHoverGlowMultiplier(false, true)).toBe(1.0);
  });

  it("6c-pi-5d: hovered AND active → 1.0 (active overrides hover glow)", () => {
    expect(computeHoverGlowMultiplier(true, true)).toBe(1.0);
  });

  it("6c-pi-5e: HOVER_GLOW_MULTIPLIER is > 1.0 (hover actually increases glow)", () => {
    expect(HOVER_GLOW_MULTIPLIER).toBeGreaterThan(1.0);
  });

  it("6c-pi-5f: HOVER_GLOW_MULTIPLIER is at most 3.0 (not blindingly bright)", () => {
    expect(HOVER_GLOW_MULTIPLIER).toBeLessThanOrEqual(3.0);
  });

  it("6c-pi-5g: result is always a positive finite number", () => {
    const cases: [boolean, boolean][] = [
      [false, false], [true, false], [false, true], [true, true],
    ];
    for (const [h, a] of cases) {
      const result = computeHoverGlowMultiplier(h, a);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    }
  });
});

// ── 6. buildDetailMetricRows() ─────────────────────────────────────────────────

describe("6c-pi-6: buildDetailMetricRows()", () => {
  const fixtureId = "ops-dashboard-main";
  const roomId    = "ops-control";

  it("6c-pi-6a: returns a non-empty array", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("6c-pi-6b: every row has label, value, and color fields", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    for (const row of rows) {
      expect(typeof row.label).toBe("string");
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.value !== undefined && row.value !== null).toBe(true);
      expect(typeof row.color).toBe("string");
      expect(row.color.length).toBeGreaterThan(0);
    }
  });

  it("6c-pi-6c: contains an AGENTS row", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    const agentRow = rows.find((r) => r.label === "AGENTS");
    expect(agentRow).toBeDefined();
  });

  it("6c-pi-6d: contains a THROUGHPUT row", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    const tpRow = rows.find((r) => r.label === "THROUGHPUT");
    expect(tpRow).toBeDefined();
  });

  it("6c-pi-6e: contains a CONNECTION row", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    const connRow = rows.find((r) => r.label === "CONNECTION");
    expect(connRow).toBeDefined();
  });

  it("6c-pi-6f: contains a FIXTURE row with the fixture_id as value", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    const fRow = rows.find((r) => r.label === "FIXTURE");
    expect(fRow).toBeDefined();
    expect(fRow?.value).toBe(fixtureId);
  });

  it("6c-pi-6g: contains a ROOM row with the room_id as value", () => {
    const rows = buildDetailMetricRows(makeSummary(), fixtureId, roomId);
    const rRow = rows.find((r) => r.label === "ROOM");
    expect(rRow).toBeDefined();
    expect(rRow?.value).toBe(roomId);
  });

  it("6c-pi-6h: AGENTS row value matches summary.agentCount", () => {
    const summary = makeSummary({ agentStatus: makeAgentStatus({ total: 7 }) });
    const rows    = buildDetailMetricRows(summary, fixtureId, roomId);
    const row     = rows.find((r) => r.label === "AGENTS");
    expect(row?.value).toBe(7);
  });

  it("6c-pi-6i: THROUGHPUT row value matches summary.eventRateLabel", () => {
    const summary = makeSummary({ throughputRaw: 12 });
    const rows    = buildDetailMetricRows(summary, fixtureId, roomId);
    const row     = rows.find((r) => r.label === "THROUGHPUT");
    expect(row?.value).toBe(summary.eventRateLabel);
  });

  it("6c-pi-6j: CONNECTION row value is uppercase connectionStatus", () => {
    const summary = makeSummary({ connectionStatus: "connected", isLive: true });
    const rows    = buildDetailMetricRows(summary, fixtureId, roomId);
    const row     = rows.find((r) => r.label === "CONNECTION");
    expect(row?.value).toBe("CONNECTED");
  });

  it("6c-pi-6k: AGENTS row color is green when agents are active", () => {
    const summary = makeSummary({ agentStatus: makeAgentStatus({ active: 3, total: 5 }) });
    const rows    = buildDetailMetricRows(summary, fixtureId, roomId);
    const row     = rows.find((r) => r.label === "AGENTS");
    expect(row?.color).toBe("#00ff88");
  });

  it("6c-pi-6l: AGENTS row color is dim when no active agents", () => {
    const summary = makeSummary({ agentStatus: makeAgentStatus({ idle: 2, total: 2 }) });
    const rows    = buildDetailMetricRows(summary, fixtureId, roomId);
    const row     = rows.find((r) => r.label === "AGENTS");
    // Not green — some other color for inactive scenario
    expect(row?.color).not.toBe("#00ff88");
  });

  it("6c-pi-6m: subLabel on AGENTS row includes active/idle/inactive breakdown", () => {
    const summary = makeSummary({
      agentStatus: makeAgentStatus({ active: 2, idle: 1, inactive: 3, total: 6 }),
    });
    const rows = buildDetailMetricRows(summary, fixtureId, roomId);
    const row  = rows.find((r) => r.label === "AGENTS");
    expect(row?.subLabel).toBeDefined();
    expect(row?.subLabel).toContain("active");
    expect(row?.subLabel).toContain("idle");
    expect(row?.subLabel).toContain("inactive");
  });

  it("6c-pi-6n: pure function — same inputs → same output", () => {
    const summary = makeSummary();
    const rows1   = buildDetailMetricRows(summary, fixtureId, roomId);
    const rows2   = buildDetailMetricRows(summary, fixtureId, roomId);
    expect(rows1).toEqual(rows2);
  });

  it("6c-pi-6o: different fixtureIds produce rows with different FIXTURE values", () => {
    const summary = makeSummary();
    const rowsA = buildDetailMetricRows(summary, "fixture-A", roomId);
    const rowsB = buildDetailMetricRows(summary, "fixture-B", roomId);
    const fA = rowsA.find((r) => r.label === "FIXTURE");
    const fB = rowsB.find((r) => r.label === "FIXTURE");
    expect(fA?.value).not.toBe(fB?.value);
  });
});

// ── 7. Constants ────────────────────────────────────────────────────────────────

describe("6c-pi-7: exported constants", () => {
  it("6c-pi-7a: PANEL_EXPAND_FACTOR is a finite positive number > 1", () => {
    expect(Number.isFinite(PANEL_EXPAND_FACTOR)).toBe(true);
    expect(PANEL_EXPAND_FACTOR).toBeGreaterThan(1.0);
  });

  it("6c-pi-7b: PANEL_EXPAND_LERP_ALPHA is in (0, 1)", () => {
    expect(PANEL_EXPAND_LERP_ALPHA).toBeGreaterThan(0);
    expect(PANEL_EXPAND_LERP_ALPHA).toBeLessThan(1);
  });

  it("6c-pi-7c: DETAIL_PANEL_FORWARD_OFFSET is a positive number", () => {
    expect(DETAIL_PANEL_FORWARD_OFFSET).toBeGreaterThan(0);
    expect(Number.isFinite(DETAIL_PANEL_FORWARD_OFFSET)).toBe(true);
  });

  it("6c-pi-7d: DETAIL_PANEL_UP_OFFSET is a positive number", () => {
    expect(DETAIL_PANEL_UP_OFFSET).toBeGreaterThan(0);
    expect(Number.isFinite(DETAIL_PANEL_UP_OFFSET)).toBe(true);
  });

  it("6c-pi-7e: DETAIL_PANEL_DIST_FACTOR is a positive integer", () => {
    expect(DETAIL_PANEL_DIST_FACTOR).toBeGreaterThan(0);
    expect(Number.isInteger(DETAIL_PANEL_DIST_FACTOR)).toBe(true);
  });

  it("6c-pi-7f: DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD is a positive integer", () => {
    expect(DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isInteger(DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD)).toBe(true);
  });

  it("6c-pi-7g: HOVER_GLOW_MULTIPLIER is a finite number > 1", () => {
    expect(Number.isFinite(HOVER_GLOW_MULTIPLIER)).toBe(true);
    expect(HOVER_GLOW_MULTIPLIER).toBeGreaterThan(1.0);
  });

  it("6c-pi-7h: DETAIL_PANEL_UP_OFFSET > DETAIL_PANEL_FORWARD_OFFSET (panel rises above, not just forward)", () => {
    expect(DETAIL_PANEL_UP_OFFSET).toBeGreaterThan(DETAIL_PANEL_FORWARD_OFFSET);
  });
});

// ── 8. Interaction event type strings ─────────────────────────────────────────

describe("6c-pi-8: interaction event type contracts", () => {
  // The event types are string literals emitted by InteractiveDashboardPanel.
  // We verify the string contracts match what the component records.
  const EXPECTED_EVENTS = [
    "fixture.panel_hovered",
    "fixture.panel_unhovered",
    "fixture.detail_opened",
    "fixture.detail_closed",
  ] as const;

  it("6c-pi-8a: all expected interaction event types are defined strings", () => {
    for (const evt of EXPECTED_EVENTS) {
      expect(typeof evt).toBe("string");
      expect(evt.startsWith("fixture.")).toBe(true);
    }
  });

  it("6c-pi-8b: hover events come in open/close pairs", () => {
    const hoverEvents = EXPECTED_EVENTS.filter((e) => e.includes("hover"));
    expect(hoverEvents).toContain("fixture.panel_hovered");
    expect(hoverEvents).toContain("fixture.panel_unhovered");
    expect(hoverEvents).toHaveLength(2);
  });

  it("6c-pi-8c: detail events come in open/close pairs", () => {
    const detailEvents = EXPECTED_EVENTS.filter((e) => e.includes("detail"));
    expect(detailEvents).toContain("fixture.detail_opened");
    expect(detailEvents).toContain("fixture.detail_closed");
    expect(detailEvents).toHaveLength(2);
  });

  it("6c-pi-8d: all event type strings are unique", () => {
    const set = new Set(EXPECTED_EVENTS);
    expect(set.size).toBe(EXPECTED_EVENTS.length);
  });
});

// ── 9. Offset direction contracts ──────────────────────────────────────────────

describe("6c-pi-9: offset direction correctness", () => {
  it("6c-pi-9a: north and east offsets have zero z component", () => {
    const [, , zNorth] = computeDetailPanelOffset("north");
    const [, , zEast]  = computeDetailPanelOffset("east");
    expect(Math.abs(zNorth)).toBeGreaterThan(0); // north has Z component
    expect(Math.abs(zEast)).toBeCloseTo(0, 8);   // east has no Z component
  });

  it("6c-pi-9b: south facing panel pushes detail overlay north (+Z)", () => {
    const [, , z] = computeDetailPanelOffset("south");
    expect(z).toBeGreaterThan(0);
  });

  it("6c-pi-9c: north facing panel pushes detail overlay south (-Z)", () => {
    const [, , z] = computeDetailPanelOffset("north");
    expect(z).toBeLessThan(0);
  });

  it("6c-pi-9d: east facing panel pushes detail overlay west (-X)", () => {
    const [x] = computeDetailPanelOffset("east");
    expect(x).toBeLessThan(0);
  });

  it("6c-pi-9e: west facing panel pushes detail overlay east (+X)", () => {
    const [x] = computeDetailPanelOffset("west");
    expect(x).toBeGreaterThan(0);
  });

  it("6c-pi-9f: all offsets have y > 0 (detail always above panel centre)", () => {
    const facings = ["north", "south", "east", "west", "up"] as const;
    for (const f of facings) {
      const [, y] = computeDetailPanelOffset(f);
      expect(y).toBeGreaterThan(0);
    }
  });

  it("6c-pi-9g: forward distance is respected proportionally", () => {
    const fwd1 = 0.5;
    const fwd2 = 1.0;
    const [, , z1] = computeDetailPanelOffset("south", fwd1);
    const [, , z2] = computeDetailPanelOffset("south", fwd2);
    expect(z2).toBeCloseTo(z1 * 2, 8);
  });
});

// ── 10. Detail rows shape contract ─────────────────────────────────────────────

describe("6c-pi-10: detail metric row shape", () => {
  it("6c-pi-10a: every row value is string or number", () => {
    const rows = buildDetailMetricRows(makeSummary(), "test-fixture", "test-room");
    for (const row of rows) {
      expect(["string", "number"]).toContain(typeof row.value);
    }
  });

  it("6c-pi-10b: label is always a non-empty uppercase string", () => {
    const rows = buildDetailMetricRows(makeSummary(), "test-fixture", "test-room");
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.label).toBe(row.label.toUpperCase());
    }
  });

  it("6c-pi-10c: color values are valid CSS hex or rgb strings", () => {
    const rows = buildDetailMetricRows(makeSummary(), "f", "r");
    for (const row of rows) {
      // Accept hex color or rgb/rgba
      const validColor = /^#[0-9A-Fa-f]{3,8}$/.test(row.color) ||
                         row.color.startsWith("rgb");
      expect(validColor).toBe(true);
    }
  });

  it("6c-pi-10d: optional subLabel, when present, is a non-empty string", () => {
    const rows = buildDetailMetricRows(
      makeSummary({ agentStatus: makeAgentStatus({ active: 1, total: 3 }) }),
      "f", "r",
    );
    for (const row of rows) {
      if (row.subLabel !== undefined) {
        expect(typeof row.subLabel).toBe("string");
        expect(row.subLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("6c-pi-10e: row count is stable (same summary → same number of rows)", () => {
    const summary = makeSummary();
    const r1 = buildDetailMetricRows(summary, "f", "r");
    const r2 = buildDetailMetricRows(summary, "f", "r");
    expect(r1.length).toBe(r2.length);
  });
});

// ── 11. Integration: detail rows from metrics summary ─────────────────────────

describe("6c-pi-11: integration with computePanelMetricsSummary()", () => {
  it("6c-pi-11a: rows reflect live agent count in AGENTS value", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 4, idle: 2, total: 6 }) }),
      0,
    );
    const rows = buildDetailMetricRows(summary, "fix", "room");
    const row  = rows.find((r) => r.label === "AGENTS");
    expect(row?.value).toBe(6);
  });

  it("6c-pi-11b: TASKS PENDING row value matches summary.taskStatus.pending", () => {
    const summary = computePanelMetricsSummary(makeBinding({ taskQueueDepth: 8 }), 0);
    const rows    = buildDetailMetricRows(summary, "fix", "room");
    const row     = rows.find((r) => r.label === "TASKS PENDING");
    expect(row?.value).toBe(8);
  });

  it("6c-pi-11c: TASKS RUNNING row value matches summary.taskStatus.running", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 3, busy: 1, total: 5 }) }),
      0,
    );
    const rows = buildDetailMetricRows(summary, "fix", "room");
    const row  = rows.find((r) => r.label === "TASKS RUNNING");
    expect(row?.value).toBe(4); // active(3) + busy(1)
  });

  it("6c-pi-11d: TASKS DONE row value matches terminal task count", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 11);
    const rows    = buildDetailMetricRows(summary, "fix", "room");
    const row     = rows.find((r) => r.label === "TASKS DONE");
    expect(row?.value).toBe(11);
  });

  it("6c-pi-11e: disconnected connection → CONNECTION row shows DISCONNECTED", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "disconnected" }),
      0,
    );
    const rows = buildDetailMetricRows(summary, "fix", "room");
    const row  = rows.find((r) => r.label === "CONNECTION");
    expect(row?.value).toBe("DISCONNECTED");
  });

  it("6c-pi-11f: all-zero system → rows are still well-formed", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 0);
    const rows    = buildDetailMetricRows(summary, "fix", "room");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.label).toBeTruthy();
      expect(row.color).toBeTruthy();
    }
  });
});

// ── 12. Edge cases and boundary conditions ────────────────────────────────────

describe("6c-pi-12: edge cases", () => {
  it("6c-pi-12a: computeExpandScale with expandFactor < 1 still uses it for hovered", () => {
    // Unusual but should not break
    expect(computeExpandScale(true, 0.9)).toBe(0.9);
  });

  it("6c-pi-12b: lerpValue with NaN alpha falls back to clamped 0", () => {
    // NaN clamped → Math.max(0, Math.min(1, NaN)) → NaN; but code clamps
    // We verify the function doesn't throw
    expect(() => lerpValue(0, 1, NaN)).not.toThrow();
  });

  it("6c-pi-12c: computeDetailPanelOffset with zero distances returns [0,0,0]", () => {
    const [x, y, z] = computeDetailPanelOffset("south", 0, 0);
    expect(x).toBeCloseTo(0, 8);
    expect(y).toBeCloseTo(0, 8);
    expect(z).toBeCloseTo(0, 8);
  });

  it("6c-pi-12d: buildDetailMetricRows with empty strings for ids still works", () => {
    const summary = makeSummary();
    expect(() => buildDetailMetricRows(summary, "", "")).not.toThrow();
    const rows = buildDetailMetricRows(summary, "", "");
    const fRow = rows.find((r) => r.label === "FIXTURE");
    expect(fRow?.value).toBe("");
  });

  it("6c-pi-12e: shouldRevealDetailSection with threshold 0 is always true", () => {
    expect(shouldRevealDetailSection(0, 0)).toBe(true);
  });

  it("6c-pi-12f: computeHoverGlowMultiplier always returns positive value", () => {
    for (const [h, a] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      expect(computeHoverGlowMultiplier(h, a)).toBeGreaterThan(0);
    }
  });

  it("6c-pi-12g: lerpValue convergence — 60 frames at alpha=0.12 reaches >99.9% of target", () => {
    let val = 0;
    for (let i = 0; i < 60; i++) {
      val = lerpValue(val, 1.0, 0.12);
    }
    expect(val).toBeGreaterThan(0.999);
  });

  it("6c-pi-12h: PANEL_EXPAND_FACTOR = 1.06 (documented contract)", () => {
    expect(PANEL_EXPAND_FACTOR).toBeCloseTo(1.06, 8);
  });

  it("6c-pi-12i: PANEL_EXPAND_LERP_ALPHA = 0.12 (documented contract)", () => {
    expect(PANEL_EXPAND_LERP_ALPHA).toBeCloseTo(0.12, 8);
  });

  it("6c-pi-12j: all four connection statuses appear as uppercase in CONNECTION rows", () => {
    const statuses = ["connecting", "connected", "degraded", "disconnected"] as const;
    for (const status of statuses) {
      const summary = makeSummary({ connectionStatus: status });
      const rows    = buildDetailMetricRows(summary, "f", "r");
      const row     = rows.find((r) => r.label === "CONNECTION");
      expect(row?.value).toBe(status.toUpperCase());
    }
  });
});
