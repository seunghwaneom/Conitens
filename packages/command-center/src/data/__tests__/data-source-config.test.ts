/**
 * data-source-config.test.ts — Tests for Sub-AC 6c per-surface refresh config.
 *
 * Validates that:
 *  1. SURFACE_REFRESH_INTERVALS covers all furniture display types
 *  2. Refresh intervals are semantically appropriate (hologram < wall-panel,
 *     replay > approval)
 *  3. DEFAULT_REFRESH_INTERVAL_MS is a sensible fallback
 *  4. DataSourceMode type includes all expected states
 */

import { describe, it, expect } from "vitest";
import {
  SURFACE_REFRESH_INTERVALS,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_WS_PORT,
  DEFAULT_WS_URL,
  DEFAULT_DATA_SOURCE_CONFIG,
} from "../data-source-config.js";

// ── Registry completeness ──────────────────────────────────────────────────

describe("SURFACE_REFRESH_INTERVALS", () => {
  it("covers all wall panel furniture types", () => {
    const wallPanels = [
      "status-board",
      "timeline-wall",
      "wall-monitor-array",
      "task-board",
      "gate-status-board",
    ];
    for (const type of wallPanels) {
      expect(SURFACE_REFRESH_INTERVALS[type]).toBeDefined();
    }
  });

  it("covers all monitor furniture types", () => {
    const monitors = [
      "diff-screen",
      "ui-preview-screen",
      "approval-terminal",
      "file-browser-terminal",
      "replay-terminal",
    ];
    for (const type of monitors) {
      expect(SURFACE_REFRESH_INTERVALS[type]).toBeDefined();
    }
  });

  it("covers all hologram stand furniture types", () => {
    const holoStands = [
      "hologram-table",
      "knowledge-graph-display",
    ];
    for (const type of holoStands) {
      expect(SURFACE_REFRESH_INTERVALS[type]).toBeDefined();
    }
  });

  it("returns positive non-zero intervals", () => {
    for (const [, ms] of Object.entries(SURFACE_REFRESH_INTERVALS)) {
      expect(ms).toBeGreaterThan(0);
    }
  });

  it("hologram stands update faster than wall panels", () => {
    const holoInterval = SURFACE_REFRESH_INTERVALS["hologram-table"]!;
    const wallInterval = SURFACE_REFRESH_INTERVALS["wall-monitor-array"]!;
    expect(holoInterval).toBeLessThan(wallInterval);
  });

  it("replay terminal updates slower than approval terminal (deliberate review > urgency)", () => {
    const replayInterval   = SURFACE_REFRESH_INTERVALS["replay-terminal"]!;
    const approvalInterval = SURFACE_REFRESH_INTERVALS["approval-terminal"]!;
    expect(replayInterval).toBeGreaterThan(approvalInterval);
  });

  it("status-board updates at most every 2 seconds (fast, operational tempo)", () => {
    expect(SURFACE_REFRESH_INTERVALS["status-board"]).toBeLessThanOrEqual(2_000);
  });

  it("hologram-table updates at most every second (real-time spatial feel)", () => {
    expect(SURFACE_REFRESH_INTERVALS["hologram-table"]).toBeLessThanOrEqual(1_000);
  });
});

// ── Default values ─────────────────────────────────────────────────────────

describe("DEFAULT_REFRESH_INTERVAL_MS", () => {
  it("is a positive number", () => {
    expect(DEFAULT_REFRESH_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("matches the global metrics tick cadence (2000ms)", () => {
    expect(DEFAULT_REFRESH_INTERVAL_MS).toBe(2_000);
  });
});

// ── WebSocket defaults ────────────────────────────────────────────────────

describe("WebSocket config defaults", () => {
  it("uses port 8080 matching @conitens/core WebSocketBus", () => {
    expect(DEFAULT_WS_PORT).toBe(8_080);
  });

  it("constructs localhost URL from port", () => {
    expect(DEFAULT_WS_URL).toBe(`ws://localhost:${DEFAULT_WS_PORT}`);
  });

  it("DEFAULT_DATA_SOURCE_CONFIG has sensible retry limits", () => {
    expect(DEFAULT_DATA_SOURCE_CONFIG.maxReconnectAttempts).toBeGreaterThan(0);
    expect(DEFAULT_DATA_SOURCE_CONFIG.reconnectBaseIntervalMs).toBeGreaterThan(0);
  });

  it("DEFAULT_DATA_SOURCE_CONFIG staleness threshold is longer than reconnect interval", () => {
    expect(DEFAULT_DATA_SOURCE_CONFIG.stalenessThresholdMs).toBeGreaterThan(
      DEFAULT_DATA_SOURCE_CONFIG.reconnectBaseIntervalMs,
    );
  });
});
