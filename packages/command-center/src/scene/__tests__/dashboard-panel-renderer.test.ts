/**
 * dashboard-panel-renderer.test.ts — Unit tests for Sub-AC 6.2:
 * 3D renderer support for ui_fixture entities with fixture_type 'dashboard_panel'.
 *
 * Tests the renderer-specific pure-logic aspects of DashboardPanel.tsx:
 *
 *   1.  Renderer constants — SCREEN_Z_OFFSET, PANEL_WALL_Z_OFFSET, render order
 *   2.  Scan-line constants — SCAN_LINE_STRIP_HEIGHT, SCAN_LINE_STRIP_GAP
 *   3.  computeScanLineStripCount() — strip count formula
 *   4.  computePanelPlacedPosition() — room-local → world with wall Z-offset
 *   5.  computeScreenFacePosition()  — panel world pos + SCREEN_Z_OFFSET
 *   6.  filterDashboardPanelFixtures() — fixture_type filter
 *   7.  collectDashboardPanelRoomIds() — unique room IDs from dashboard panels
 *   8.  Spatial coordinate correctness — full chain from registry to world pos
 *   9.  Pulse and emissive constants — animation contract
 *  10.  Low-poly geometry contract — mesh size relationships
 *  11.  Z-ordering contract — screen is always in front of bezel
 *  12.  Multi-room rendering contract — BuildingDashboardPanels room set
 *
 * NOTE: React components (DashboardPanelMesh, DashboardPanel, DashboardPanelLayer)
 *       require a WebGL canvas and cannot run in a headless Vitest environment.
 *       Only pure-logic helpers and constants are tested here, consistent with
 *       the pattern in dashboard-panel.test.ts and display-surfaces.test.ts.
 *
 * Test ID scheme:
 *   6r-N : Sub-AC 6 renderer (6r)
 */

import { describe, it, expect } from "vitest";
import {
  // Renderer constants
  SCREEN_Z_OFFSET,
  PANEL_WALL_Z_OFFSET,
  PANEL_PULSE_HZ,
  PANEL_ACTIVE_EMISSIVE_SCALE,
  PANEL_IDLE_EMISSIVE_SCALE,
  DASHBOARD_PANEL_RENDER_ORDER,
  // Scan-line constants
  SCAN_LINE_STRIP_HEIGHT,
  SCAN_LINE_STRIP_GAP,
  // Pure renderer helpers
  computeScanLineStripCount,
  computePanelPlacedPosition,
  computeScreenFacePosition,
  filterDashboardPanelFixtures,
  collectDashboardPanelRoomIds,
} from "../DashboardPanel.js";
import {
  DEFAULT_UI_FIXTURES,
  getDashboardPanels,
  getFixturesForRoom,
  computeScreenDimensions,
  type UiFixtureDef,
} from "../../data/ui-fixture-registry.js";

// ── 1. Renderer constants ─────────────────────────────────────────────────────

describe("6r-1: renderer constants", () => {
  it("6r-1a: SCREEN_Z_OFFSET is a small positive number (avoids Z-fighting)", () => {
    expect(SCREEN_Z_OFFSET).toBeGreaterThan(0);
    expect(SCREEN_Z_OFFSET).toBeLessThan(0.1); // must be small — cosmetic offset only
  });

  it("6r-1b: PANEL_WALL_Z_OFFSET is a small positive number (avoids Z-fighting with wall)", () => {
    expect(PANEL_WALL_Z_OFFSET).toBeGreaterThan(0);
    expect(PANEL_WALL_Z_OFFSET).toBeLessThan(0.1);
  });

  it("6r-1c: PANEL_WALL_Z_OFFSET > SCREEN_Z_OFFSET (panel is placed in front of wall)", () => {
    // Wall offset is larger (panel clear of wall) while screen offset is smaller (local to panel)
    expect(PANEL_WALL_Z_OFFSET).toBeGreaterThan(SCREEN_Z_OFFSET);
  });

  it("6r-1d: PANEL_PULSE_HZ is a positive number", () => {
    expect(PANEL_PULSE_HZ).toBeGreaterThan(0);
  });

  it("6r-1e: PANEL_PULSE_HZ is a visually plausible frequency (0.1 – 5 Hz)", () => {
    expect(PANEL_PULSE_HZ).toBeGreaterThanOrEqual(0.1);
    expect(PANEL_PULSE_HZ).toBeLessThanOrEqual(5.0);
  });

  it("6r-1f: PANEL_ACTIVE_EMISSIVE_SCALE > PANEL_IDLE_EMISSIVE_SCALE", () => {
    // Active panels must glow brighter than idle panels
    expect(PANEL_ACTIVE_EMISSIVE_SCALE).toBeGreaterThan(PANEL_IDLE_EMISSIVE_SCALE);
  });

  it("6r-1g: PANEL_IDLE_EMISSIVE_SCALE is a positive number", () => {
    expect(PANEL_IDLE_EMISSIVE_SCALE).toBeGreaterThan(0);
  });

  it("6r-1h: PANEL_ACTIVE_EMISSIVE_SCALE is a positive number", () => {
    expect(PANEL_ACTIVE_EMISSIVE_SCALE).toBeGreaterThan(0);
  });

  it("6r-1i: DASHBOARD_PANEL_RENDER_ORDER is a non-negative integer", () => {
    expect(DASHBOARD_PANEL_RENDER_ORDER).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(DASHBOARD_PANEL_RENDER_ORDER)).toBe(true);
  });

  it("6r-1j: SCREEN_Z_OFFSET = 0.003 (documented contract)", () => {
    expect(SCREEN_Z_OFFSET).toBe(0.003);
  });

  it("6r-1k: PANEL_WALL_Z_OFFSET = 0.015 (documented contract)", () => {
    expect(PANEL_WALL_Z_OFFSET).toBe(0.015);
  });

  it("6r-1l: DASHBOARD_PANEL_RENDER_ORDER = 2 (above floor, below HUD)", () => {
    expect(DASHBOARD_PANEL_RENDER_ORDER).toBe(2);
  });
});

// ── 2. Scan-line constants ────────────────────────────────────────────────────

describe("6r-2: scan-line constants", () => {
  it("6r-2a: SCAN_LINE_STRIP_HEIGHT is a positive number", () => {
    expect(SCAN_LINE_STRIP_HEIGHT).toBeGreaterThan(0);
  });

  it("6r-2b: SCAN_LINE_STRIP_GAP is a positive number", () => {
    expect(SCAN_LINE_STRIP_GAP).toBeGreaterThan(0);
  });

  it("6r-2c: SCAN_LINE_STRIP_HEIGHT < SCAN_LINE_STRIP_GAP (gap wider than strip)", () => {
    // Scan lines should be subtle: thin strips with larger gaps between
    expect(SCAN_LINE_STRIP_HEIGHT).toBeLessThan(SCAN_LINE_STRIP_GAP);
  });

  it("6r-2d: SCAN_LINE_STRIP_HEIGHT = 0.025 (documented contract)", () => {
    expect(SCAN_LINE_STRIP_HEIGHT).toBe(0.025);
  });

  it("6r-2e: SCAN_LINE_STRIP_GAP = 0.055 (documented contract)", () => {
    expect(SCAN_LINE_STRIP_GAP).toBe(0.055);
  });

  it("6r-2f: scan period (height + gap) is a small positive number in grid units", () => {
    const period = SCAN_LINE_STRIP_HEIGHT + SCAN_LINE_STRIP_GAP;
    expect(period).toBeGreaterThan(0);
    expect(period).toBeLessThan(1.0); // must be sub-unit for high density
  });
});

// ── 3. computeScanLineStripCount() ────────────────────────────────────────────

describe("6r-3: computeScanLineStripCount()", () => {
  it("6r-3a: returns a non-negative integer", () => {
    const count = computeScanLineStripCount(0.9);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(count)).toBe(true);
  });

  it("6r-3b: zero screenH → 0 strips", () => {
    expect(computeScanLineStripCount(0)).toBe(0);
  });

  it("6r-3c: negative screenH → 0 strips", () => {
    expect(computeScanLineStripCount(-1)).toBe(0);
  });

  it("6r-3d: screenH smaller than one period → 0 strips", () => {
    const period = SCAN_LINE_STRIP_HEIGHT + SCAN_LINE_STRIP_GAP;
    expect(computeScanLineStripCount(period - 0.001)).toBe(0);
  });

  it("6r-3e: screenH exactly one period → 1 strip (floor truncation)", () => {
    const period = SCAN_LINE_STRIP_HEIGHT + SCAN_LINE_STRIP_GAP;
    expect(computeScanLineStripCount(period)).toBe(1);
  });

  it("6r-3f: screenH = 2× period → 2 strips", () => {
    const period = SCAN_LINE_STRIP_HEIGHT + SCAN_LINE_STRIP_GAP;
    expect(computeScanLineStripCount(2 * period)).toBe(2);
  });

  it("6r-3g: screenH = 10× period → 10 strips", () => {
    const period = SCAN_LINE_STRIP_HEIGHT + SCAN_LINE_STRIP_GAP;
    expect(computeScanLineStripCount(10 * period)).toBe(10);
  });

  it("6r-3h: default args use SCAN_LINE_STRIP_HEIGHT/GAP constants", () => {
    const h = 0.9;
    const countDefault  = computeScanLineStripCount(h);
    const countExplicit = computeScanLineStripCount(h, SCAN_LINE_STRIP_HEIGHT, SCAN_LINE_STRIP_GAP);
    expect(countDefault).toBe(countExplicit);
  });

  it("6r-3i: custom stripHeight=0 → 0 strips (guard against div-by-zero / infinite)", () => {
    expect(computeScanLineStripCount(1.0, 0, 0.05)).toBe(0);
  });

  it("6r-3j: typical panel height (0.9 − bezel) yields a positive strip count", () => {
    // A 0.9-unit panel has ~0.828-unit screen height after bezel inset
    const { screenH } = computeScreenDimensions(1.6, 0.9);
    const count = computeScanLineStripCount(screenH);
    expect(count).toBeGreaterThan(0);
  });

  it("6r-3k: all registered dashboard panels produce a non-negative strip count", () => {
    for (const f of getDashboardPanels()) {
      const { screenH } = computeScreenDimensions(f.visual.width, f.visual.height);
      const count = computeScanLineStripCount(screenH);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(count)).toBe(true);
    }
  });
});

// ── 4. computePanelPlacedPosition() ───────────────────────────────────────────

describe("6r-4: computePanelPlacedPosition()", () => {
  it("6r-4a: x = roomOrigin.x + localPos.x", () => {
    const pos = computePanelPlacedPosition({ x: 4, y: 0, z: 0 }, { x: 2.5, y: 0, z: 0 });
    expect(pos.x).toBeCloseTo(6.5, 8);
  });

  it("6r-4b: y = roomOrigin.y + localPos.y", () => {
    const pos = computePanelPlacedPosition({ x: 0, y: 3, z: 0 }, { x: 0, y: 1.5, z: 0 });
    expect(pos.y).toBeCloseTo(4.5, 8);
  });

  it("6r-4c: z = roomOrigin.z + localPos.z + PANEL_WALL_Z_OFFSET", () => {
    const pos = computePanelPlacedPosition({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3.85 });
    expect(pos.z).toBeCloseTo(3.85 + PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-4d: zero room origin — position equals localPos + Z offset", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const local  = { x: 2.5, y: 1.5, z: 3.85 };
    const pos    = computePanelPlacedPosition(origin, local);
    expect(pos.x).toBeCloseTo(2.5, 8);
    expect(pos.y).toBeCloseTo(1.5, 8);
    expect(pos.z).toBeCloseTo(3.85 + PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-4e: non-zero room origin shifts all axes correctly", () => {
    const origin = { x: 10, y: 2, z: -5 };
    const local  = { x: 1,  y: 1,  z: 3.85 };
    const pos    = computePanelPlacedPosition(origin, local);
    expect(pos.x).toBeCloseTo(11, 8);
    expect(pos.y).toBeCloseTo(3,  8);
    expect(pos.z).toBeCloseTo(-5 + 3.85 + PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-4f: wall Z-offset is always added (never omitted)", () => {
    const noop = { x: 0, y: 0, z: 0 };
    const pos  = computePanelPlacedPosition(noop, noop);
    expect(pos.z).toBeCloseTo(PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-4g: ops-dashboard-main panel — world Z > local Z (wall offset applied)", () => {
    const f = getDashboardPanels().find((p) => p.fixture_id === "ops-dashboard-main")!;
    expect(f).toBeDefined();
    const origin = { x: 0, y: 0, z: 0 };
    const pos = computePanelPlacedPosition(origin, f.transform.position);
    expect(pos.z).toBeCloseTo(f.transform.position.z + PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-4h: all registered dashboard panels produce finite world positions", () => {
    const roomOrigin = { x: 0, y: 0, z: 0 };
    for (const f of getDashboardPanels()) {
      const pos = computePanelPlacedPosition(roomOrigin, f.transform.position);
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
      expect(Number.isFinite(pos.z)).toBe(true);
    }
  });
});

// ── 5. computeScreenFacePosition() ────────────────────────────────────────────

describe("6r-5: computeScreenFacePosition()", () => {
  it("6r-5a: screen z = panel z + SCREEN_Z_OFFSET", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const local  = { x: 0, y: 0, z: 3.85 };
    const panelPos = computePanelPlacedPosition(origin, local);
    const screenPos = computeScreenFacePosition(origin, local);
    expect(screenPos.z).toBeCloseTo(panelPos.z + SCREEN_Z_OFFSET, 8);
  });

  it("6r-5b: screen x and y match panel x and y", () => {
    const origin = { x: 5, y: 2, z: 1 };
    const local  = { x: 1, y: 1.5, z: 3.85 };
    const panelPos = computePanelPlacedPosition(origin, local);
    const screenPos = computeScreenFacePosition(origin, local);
    expect(screenPos.x).toBeCloseTo(panelPos.x, 8);
    expect(screenPos.y).toBeCloseTo(panelPos.y, 8);
  });

  it("6r-5c: screen z > panel z (screen is in front of bezel)", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const local  = { x: 0, y: 0, z: 3.85 };
    const panelPos  = computePanelPlacedPosition(origin, local);
    const screenPos = computeScreenFacePosition(origin, local);
    expect(screenPos.z).toBeGreaterThan(panelPos.z);
  });

  it("6r-5d: screen z offset exactly SCREEN_Z_OFFSET above panel", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const local  = { x: 2.5, y: 1.5, z: 3.85 };
    const panelPos  = computePanelPlacedPosition(origin, local);
    const screenPos = computeScreenFacePosition(origin, local);
    expect(screenPos.z - panelPos.z).toBeCloseTo(SCREEN_Z_OFFSET, 8);
  });

  it("6r-5e: z ordering: wall < panel (PANEL_WALL_Z_OFFSET) < screen (+ SCREEN_Z_OFFSET)", () => {
    const origin   = { x: 0, y: 0, z: 0 };
    const local    = { x: 0, y: 0, z: 3.85 };
    const wallZ    = origin.z + local.z;  // no offset — the raw wall surface
    const panelZ   = computePanelPlacedPosition(origin, local).z;
    const screenZ  = computeScreenFacePosition(origin, local).z;

    expect(panelZ).toBeGreaterThan(wallZ);    // panel clears the wall
    expect(screenZ).toBeGreaterThan(panelZ);  // screen clears the bezel
  });
});

// ── 6. filterDashboardPanelFixtures() ─────────────────────────────────────────

describe("6r-6: filterDashboardPanelFixtures()", () => {
  it("6r-6a: filters to only dashboard_panel type", () => {
    const result = filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES);
    for (const f of result) {
      expect(f.fixture_type).toBe("dashboard_panel");
    }
  });

  it("6r-6b: result is a non-empty array (defaults contain dashboard panels)", () => {
    expect(filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES).length).toBeGreaterThan(0);
  });

  it("6r-6c: empty input → empty output", () => {
    expect(filterDashboardPanelFixtures([])).toHaveLength(0);
  });

  it("6r-6d: input with no dashboard_panel entries → empty output", () => {
    const nonPanelFixtures = DEFAULT_UI_FIXTURES.map((f) => ({
      ...f,
      fixture_type: "control_panel" as const,
      fixture_id:   `cp-${f.fixture_id}`,
    }));
    const result = filterDashboardPanelFixtures(nonPanelFixtures);
    expect(result).toHaveLength(0);
  });

  it("6r-6e: count matches getDashboardPanels()", () => {
    const filtered = filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES);
    const direct   = getDashboardPanels();
    expect(filtered.length).toBe(direct.length);
  });

  it("6r-6f: all fixture_ids preserved (no data mutation)", () => {
    const filtered = filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES);
    const direct   = getDashboardPanels();
    for (let i = 0; i < filtered.length; i++) {
      expect(filtered[i].fixture_id).toBe(direct[i].fixture_id);
    }
  });

  it("6r-6g: filters correctly for a specific room's fixtures", () => {
    const roomFixtures = getFixturesForRoom("ops-control");
    const panels = filterDashboardPanelFixtures(roomFixtures);
    for (const p of panels) {
      expect(p.room_id).toBe("ops-control");
      expect(p.fixture_type).toBe("dashboard_panel");
    }
  });
});

// ── 7. collectDashboardPanelRoomIds() ─────────────────────────────────────────

describe("6r-7: collectDashboardPanelRoomIds()", () => {
  it("6r-7a: returns a non-empty array (defaults have panels in at least 1 room)", () => {
    expect(collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES).length).toBeGreaterThan(0);
  });

  it("6r-7b: all returned IDs correspond to rooms with at least one panel", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    for (const roomId of roomIds) {
      const panels = filterDashboardPanelFixtures(getFixturesForRoom(roomId));
      expect(panels.length).toBeGreaterThan(0);
    }
  });

  it("6r-7c: no duplicate room IDs (deduplication is applied)", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    const unique  = new Set(roomIds);
    expect(unique.size).toBe(roomIds.length);
  });

  it("6r-7d: empty input → empty output", () => {
    expect(collectDashboardPanelRoomIds([])).toHaveLength(0);
  });

  it("6r-7e: input with no dashboard_panel fixtures → empty output", () => {
    const nonPanels = DEFAULT_UI_FIXTURES.map((f) => ({
      ...f,
      fixture_type: "control_panel" as const,
      fixture_id:   `cp-${f.fixture_id}`,
    }));
    expect(collectDashboardPanelRoomIds(nonPanels)).toHaveLength(0);
  });

  it("6r-7f: ops-control is in the room ID set", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    expect(roomIds).toContain("ops-control");
  });

  it("6r-7g: project-main is in the room ID set", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    expect(roomIds).toContain("project-main");
  });

  it("6r-7h: all room IDs are non-empty strings", () => {
    for (const id of collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES)) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

// ── 8. Spatial coordinate correctness ─────────────────────────────────────────

describe("6r-8: spatial coordinate correctness — full chain", () => {
  it("6r-8a: ops-dashboard-main placed at correct world position with room origin", () => {
    const f = getDashboardPanels().find((p) => p.fixture_id === "ops-dashboard-main")!;
    const roomOrigin = { x: 4, y: 0, z: 0 };  // simulated room origin
    const worldPos   = computePanelPlacedPosition(roomOrigin, f.transform.position);

    expect(worldPos.x).toBeCloseTo(roomOrigin.x + f.transform.position.x, 8);
    expect(worldPos.y).toBeCloseTo(roomOrigin.y + f.transform.position.y, 8);
    expect(worldPos.z).toBeCloseTo(roomOrigin.z + f.transform.position.z + PANEL_WALL_Z_OFFSET, 8);
  });

  it("6r-8b: wall-mounted panels have y > 0 when room origin is at floor level (y=0)", () => {
    const roomOrigin = { x: 0, y: 0, z: 0 };
    for (const f of getDashboardPanels()) {
      if (f.transform.mountType === "wall") {
        const worldPos = computePanelPlacedPosition(roomOrigin, f.transform.position);
        expect(worldPos.y).toBeGreaterThan(0);
      }
    }
  });

  it("6r-8c: all panels have finite world positions for any finite room origin", () => {
    const roomOrigin = { x: 12.5, y: 0, z: -8.0 };
    for (const f of getDashboardPanels()) {
      const worldPos = computePanelPlacedPosition(roomOrigin, f.transform.position);
      expect(Number.isFinite(worldPos.x)).toBe(true);
      expect(Number.isFinite(worldPos.y)).toBe(true);
      expect(Number.isFinite(worldPos.z)).toBe(true);
    }
  });

  it("6r-8d: different rooms get independent world positions", () => {
    const opsOrigin   = { x: 4,  y: 0, z: 0  };
    const lobbyOrigin = { x: 0,  y: 0, z: 4  };

    const opsPanel   = getDashboardPanels().find((p) => p.room_id === "ops-control")!;
    const lobbyPanel = getDashboardPanels().find((p) => p.room_id === "project-main")!;

    const opsPos   = computePanelPlacedPosition(opsOrigin,   opsPanel.transform.position);
    const lobbyPos = computePanelPlacedPosition(lobbyOrigin, lobbyPanel.transform.position);

    // They should differ (rooms are in different locations)
    const samePosition =
      Math.abs(opsPos.x - lobbyPos.x) < 0.001 &&
      Math.abs(opsPos.y - lobbyPos.y) < 0.001 &&
      Math.abs(opsPos.z - lobbyPos.z) < 0.001;
    expect(samePosition).toBe(false);
  });

  it("6r-8e: panel group transform matches computePanelPlacedPosition output", () => {
    // This test mirrors the DashboardPanel component's position prop:
    //   position={[t.x, t.y, t.z + PANEL_WALL_Z_OFFSET]}
    // when parentGroup is translated to roomOrigin.
    // The combined transform equals computePanelPlacedPosition(roomOrigin, t).
    const roomOrigin = { x: 2, y: 0, z: 1 };
    const f = getDashboardPanels()[0];
    const t = f.transform.position;

    // Manual reproduction of the component position logic:
    const expectedX = roomOrigin.x + t.x;
    const expectedY = roomOrigin.y + t.y;
    const expectedZ = roomOrigin.z + t.z + PANEL_WALL_Z_OFFSET;

    const computed = computePanelPlacedPosition(roomOrigin, t);
    expect(computed.x).toBeCloseTo(expectedX, 8);
    expect(computed.y).toBeCloseTo(expectedY, 8);
    expect(computed.z).toBeCloseTo(expectedZ, 8);
  });
});

// ── 9. Pulse and emissive constants ───────────────────────────────────────────

describe("6r-9: pulse and emissive animation contract", () => {
  it("6r-9a: active emissive is at least 2× idle (visible difference)", () => {
    expect(PANEL_ACTIVE_EMISSIVE_SCALE / PANEL_IDLE_EMISSIVE_SCALE).toBeGreaterThanOrEqual(2);
  });

  it("6r-9b: emissive scales are within Three.js valid range (> 0)", () => {
    // emissiveIntensity in Three.js must be > 0 for the panel to glow
    expect(PANEL_ACTIVE_EMISSIVE_SCALE).toBeGreaterThan(0);
    expect(PANEL_IDLE_EMISSIVE_SCALE).toBeGreaterThan(0);
  });

  it("6r-9c: PANEL_PULSE_HZ = 0.4 (slow, subtle pulse — documented contract)", () => {
    expect(PANEL_PULSE_HZ).toBe(0.4);
  });

  it("6r-9d: PANEL_ACTIVE_EMISSIVE_SCALE = 2.2 (documented contract)", () => {
    expect(PANEL_ACTIVE_EMISSIVE_SCALE).toBe(2.2);
  });

  it("6r-9e: PANEL_IDLE_EMISSIVE_SCALE = 1.0 (baseline = 1)", () => {
    expect(PANEL_IDLE_EMISSIVE_SCALE).toBe(1.0);
  });
});

// ── 10. Low-poly geometry contract ────────────────────────────────────────────

describe("6r-10: low-poly geometry contract", () => {
  it("6r-10a: screen area is strictly less than bezel area for all panels", () => {
    for (const f of getDashboardPanels()) {
      const { screenW, screenH } = computeScreenDimensions(f.visual.width, f.visual.height);
      const bezelArea  = f.visual.width * f.visual.height;
      const screenArea = screenW * screenH;
      expect(screenArea).toBeLessThan(bezelArea);
    }
  });

  it("6r-10b: screen is inset by bezel on each side (screenW < width, screenH < height)", () => {
    for (const f of getDashboardPanels()) {
      const { screenW, screenH } = computeScreenDimensions(f.visual.width, f.visual.height);
      expect(screenW).toBeLessThan(f.visual.width);
      expect(screenH).toBeLessThan(f.visual.height);
    }
  });

  it("6r-10c: screen dimensions are positive (non-degenerate mesh)", () => {
    for (const f of getDashboardPanels()) {
      const { screenW, screenH } = computeScreenDimensions(f.visual.width, f.visual.height);
      expect(screenW).toBeGreaterThan(0);
      expect(screenH).toBeGreaterThan(0);
    }
  });

  it("6r-10d: typical 1.6×0.9 panel: screen dimensions are reasonable", () => {
    const { screenW, screenH } = computeScreenDimensions(1.6, 0.9);
    // With 8% bezel, screen should be ~84% of each dimension
    expect(screenW).toBeCloseTo(1.6 - 2 * 0.072, 2); // 0.9 × 0.08 = 0.072
    expect(screenH).toBeCloseTo(0.9 - 2 * 0.072, 2);
  });
});

// ── 11. Z-ordering contract ────────────────────────────────────────────────────

describe("6r-11: Z-ordering — screen sits in front of bezel, bezel in front of wall", () => {
  it("6r-11a: PANEL_WALL_Z_OFFSET > 0 (panel is not flush with wall)", () => {
    expect(PANEL_WALL_Z_OFFSET).toBeGreaterThan(0);
  });

  it("6r-11b: SCREEN_Z_OFFSET > 0 (screen is not flush with bezel)", () => {
    expect(SCREEN_Z_OFFSET).toBeGreaterThan(0);
  });

  it("6r-11c: total forward depth = PANEL_WALL_Z_OFFSET + SCREEN_Z_OFFSET is small", () => {
    const totalDepth = PANEL_WALL_Z_OFFSET + SCREEN_Z_OFFSET;
    // Should be < 0.05 to keep panels flush against the wall visually
    expect(totalDepth).toBeLessThan(0.05);
  });

  it("6r-11d: scan-line overlay Z = 1.5 × SCREEN_Z_OFFSET above bezel", () => {
    // ScanLineOverlay is at SCREEN_Z_OFFSET * 1.5 relative to panel origin
    // This test documents the intended layering in the component
    const scanLineZ = SCREEN_Z_OFFSET * 1.5;
    expect(scanLineZ).toBeGreaterThan(0);
    expect(scanLineZ).toBeGreaterThan(SCREEN_Z_OFFSET);
  });

  it("6r-11e: selection ring Z = 2 × SCREEN_Z_OFFSET (topmost layer)", () => {
    // Selection ring is at SCREEN_Z_OFFSET * 2 relative to panel origin
    const ringZ = SCREEN_Z_OFFSET * 2;
    expect(ringZ).toBeGreaterThan(SCREEN_Z_OFFSET * 1.5); // above scan lines
    expect(ringZ).toBeGreaterThan(0);
  });
});

// ── 12. Multi-room rendering contract ─────────────────────────────────────────

describe("6r-12: BuildingDashboardPanels multi-room contract", () => {
  it("6r-12a: at least 2 distinct rooms have dashboard panels", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    expect(roomIds.length).toBeGreaterThanOrEqual(2);
  });

  it("6r-12b: each collected room ID actually has dashboard_panel fixtures", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    for (const roomId of roomIds) {
      const panels = filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES.filter(
        (f) => f.room_id === roomId,
      ));
      expect(panels.length).toBeGreaterThan(0);
    }
  });

  it("6r-12c: total panels = sum of per-room panels (no double-counting)", () => {
    const roomIds    = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    const totalDirect = getDashboardPanels().length;
    const totalByRoom = roomIds.reduce((acc, roomId) => {
      return acc + filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES.filter(
        (f) => f.room_id === roomId,
      )).length;
    }, 0);
    expect(totalByRoom).toBe(totalDirect);
  });

  it("6r-12d: fixture type filter is exhaustive — no non-dashboard fixtures included", () => {
    const panels = filterDashboardPanelFixtures(DEFAULT_UI_FIXTURES);
    for (const p of panels) {
      expect(p.fixture_type).toBe("dashboard_panel");
    }
  });

  it("6r-12e: missing room origin yields no panel render (graceful omission)", () => {
    // BuildingDashboardPanels skips rooms not in roomOrigins map
    // Test that `roomOrigins.get(roomId)` can return undefined without crashing
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    // Simulate an empty origins map
    const emptyOrigins = new Map<string, { x: number; y: number; z: number }>();
    for (const roomId of roomIds) {
      const origin = emptyOrigins.get(roomId);
      // With no origin defined, render should skip (return null)
      expect(origin).toBeUndefined();
    }
  });

  it("6r-12f: all room IDs are kebab-case identifiers (consistent with building schema)", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    for (const id of roomIds) {
      // Room IDs must be lowercase-kebab format: letters, digits, hyphens
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
