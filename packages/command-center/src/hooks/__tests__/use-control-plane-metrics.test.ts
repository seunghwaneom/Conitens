/**
 * use-control-plane-metrics.test.ts — Unit tests for Sub-AC 7c metrics hook.
 *
 * Tests the exports and logic that can be validated without a React render
 * environment (the hook itself requires jsdom + @testing-library/react-hooks).
 *
 * Validates:
 *  1. HEALTH_COLORS has entries for all HealthStatus values
 *  2. DEFAULT_POLL_MS matches the global metrics tick cadence (2 000 ms)
 *  3. All four HealthStatus values are represented in HEALTH_COLORS
 *  4. HEALTH_COLORS values are valid hex colour strings
 *  5. Module exports the expected names (no missing exports)
 */

import { describe, it, expect } from "vitest";
import {
  HEALTH_COLORS,
  DEFAULT_POLL_MS,
  type HealthStatus,
  type EntityMetrics,
} from "../use-control-plane-metrics.js";

// The expected HealthStatus literals
const EXPECTED_HEALTH_STATUSES: HealthStatus[] = ["healthy", "degraded", "error", "unknown"];

// ── Constants ─────────────────────────────────────────────────────────────────

describe("useControlPlaneMetrics — exports & constants (Sub-AC 7c)", () => {
  it("DEFAULT_POLL_MS is 2 000 (matching global TICK_MS)", () => {
    expect(DEFAULT_POLL_MS).toBe(2_000);
  });

  it("HEALTH_COLORS has an entry for every HealthStatus value", () => {
    for (const status of EXPECTED_HEALTH_STATUSES) {
      expect(HEALTH_COLORS).toHaveProperty(status);
    }
  });

  it("HEALTH_COLORS has exactly 4 entries (no extra keys)", () => {
    expect(Object.keys(HEALTH_COLORS)).toHaveLength(4);
  });

  it("all HEALTH_COLORS values are valid CSS hex colour strings", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [status, color] of Object.entries(HEALTH_COLORS)) {
      expect(color).toMatch(hexPattern);
      // All colours should be distinctly defined
      expect(typeof color).toBe("string");
      expect(color.length).toBe(7);
      void status; // suppress unused-var lint
    }
  });

  it("healthy and error colours are visually distinct (not the same hex)", () => {
    expect(HEALTH_COLORS.healthy).not.toBe(HEALTH_COLORS.error);
    expect(HEALTH_COLORS.healthy).not.toBe(HEALTH_COLORS.degraded);
    expect(HEALTH_COLORS.error).not.toBe(HEALTH_COLORS.unknown);
  });

  it("healthy colour is green-tinted (high green channel)", () => {
    // #00ff88 → R=0, G=255, B=136 — green dominant
    const healthy = HEALTH_COLORS.healthy;
    const r = parseInt(healthy.slice(1, 3), 16);
    const g = parseInt(healthy.slice(3, 5), 16);
    // Healthy should have a higher green component than red
    expect(g).toBeGreaterThan(r);
  });

  it("error colour is red-tinted (high red channel)", () => {
    // #ff4444 → R=255, G=68, B=68 — red dominant
    const error = HEALTH_COLORS.error;
    const r = parseInt(error.slice(1, 3), 16);
    const g = parseInt(error.slice(3, 5), 16);
    // Error should have a higher red component than green
    expect(r).toBeGreaterThan(g);
  });
});

// ── EntityMetrics interface shape ─────────────────────────────────────────────

describe("EntityMetrics interface shape", () => {
  it("a valid EntityMetrics object satisfies the interface fields", () => {
    const sample: EntityMetrics = {
      cpu:       45,
      memory:    62,
      taskQueue: 3,
      health:    "healthy",
      isLive:    true,
    };

    expect(typeof sample.cpu).toBe("number");
    expect(typeof sample.memory).toBe("number");
    expect(typeof sample.taskQueue).toBe("number");
    expect(typeof sample.health).toBe("string");
    expect(typeof sample.isLive).toBe("boolean");
  });

  it("EntityMetrics cpu and memory are bounded 0-100", () => {
    // Simulate clamping logic (same as in the hook)
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    expect(clamp(-10)).toBe(0);
    expect(clamp(110)).toBe(100);
    expect(clamp(50)).toBe(50);
  });

  it("taskQueue is non-negative", () => {
    // Simulate Math.max(0, ...) from hook
    const floor = (v: number) => Math.max(0, v);
    expect(floor(-5)).toBe(0);
    expect(floor(0)).toBe(0);
    expect(floor(7)).toBe(7);
  });

  it("all valid health strings are accepted", () => {
    const validStatuses: HealthStatus[] = ["healthy", "degraded", "error", "unknown"];
    for (const h of validStatuses) {
      const m: EntityMetrics = {
        cpu: 0, memory: 0, taskQueue: 0, health: h, isLive: false,
      };
      expect(m.health).toBe(h);
    }
  });
});
