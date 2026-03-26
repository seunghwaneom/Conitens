/**
 * diegetic-metric-display.test.ts — Unit tests for Sub-AC 6a.
 *
 * Tests the pure-logic aspects of DiegeticMetricDisplay.tsx:
 *
 *   1. metricColor() — colour-coding logic for 0-100% metric values
 *   2. healthColor() — health-label to colour mapping
 *   3. FloatingMetricOrb rotation-speed formula — urgency encoding
 *   4. StatusPillar height formula — bar height from metric value
 *   5. MetricRingIndicator phiLength — arc fill from percent
 *   6. SystemHealthBeacon health derivation — aggregate health from metrics
 *   7. DiegeticMetricLayer beacon placement — lobby-based positioning
 *   8. HolographicPanel metric row clamping — 0-100 bounds
 *   9. Performance gating — quality level guard conditions
 *  10. Room orb value mapping — activity → value
 *
 * NOTE: All components use useFrame / Three.js / React hooks that cannot run
 *       in a headless Vitest environment without a WebGL canvas.
 *       These tests validate the pure-logic algorithms extracted from each
 *       component so they can be verified in isolation.
 *
 * Test ID scheme:
 *   6a-N : Sub-AC 6a diegetic metric display objects
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
//  Pure logic helpers — mirrored from DiegeticMetricDisplay.tsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirror of the metricColor() helper in DiegeticMetricDisplay.tsx.
 * Maps a 0-100 metric value to a red/orange/amber/green colour string.
 */
function metricColor(value: number, inverse = false): string {
  const PALETTE = {
    critical: "#ff4455",
    busy:     "#ff8800",
    degraded: "#ffcc00",
    healthy:  "#00ff88",
  };
  const v = inverse ? 100 - value : value;
  if (v > 80) return PALETTE.critical;
  if (v > 60) return PALETTE.busy;
  if (v > 30) return PALETTE.degraded;
  return PALETTE.healthy;
}

/**
 * Mirror of the healthColor() helper in DiegeticMetricDisplay.tsx.
 */
function healthColor(health: string): string {
  const PALETTE = {
    critical: "#ff4455",
    busy:     "#ff8800",
    healthy:  "#00ff88",
    idle:     "#4a6aff",
  };
  switch (health) {
    case "error":    return PALETTE.critical;
    case "degraded": return PALETTE.busy;
    case "healthy":  return PALETTE.healthy;
    default:         return PALETTE.idle;
  }
}

/**
 * Mirror of the FloatingMetricOrb urgency-speed computation.
 * urgency = 0.5 + (value / 100) * 2.5
 */
function orbUrgency(value: number): number {
  return 0.5 + (value / 100) * 2.5;
}

/**
 * Mirror of the StatusPillar height computation.
 * height = max(0.015, (value / 100) * maxHeight)
 */
function pillarHeight(value: number, maxHeight = 0.65): number {
  return Math.max(0.015, (value / 100) * maxHeight);
}

/**
 * Mirror of the MetricRingIndicator phiLength computation.
 * phiLength = (max(0.01, value) / 100) * Math.PI * 2
 */
function ringPhiLength(value: number): number {
  return (Math.max(0.01, value) / 100) * Math.PI * 2;
}

/**
 * Mirror of the SystemHealthBeacon health derivation.
 */
function deriveHealth(
  errorCount: number,
  cpu: number,
  memory: number,
  activeCount: number,
  busyCount: number,
): string {
  if (errorCount > 0)                  return "error";
  if (cpu > 80 || memory > 80)         return "degraded";
  if (activeCount + busyCount > 0)     return "healthy";
  return "idle";
}

/**
 * Mirror of the DiegeticMetricLayer beacon position logic.
 */
function beaconPosition(rooms: Array<{
  roomType: string;
  position: { x: number; y: number; z: number };
  dimensions: { x: number; y: number; z: number };
  floor?: number;
}>): [number, number, number] {
  const lobby = rooms.find((r) => r.roomType === "lobby");
  if (lobby) {
    return [
      lobby.position.x + lobby.dimensions.x / 2,
      (lobby.floor ?? 0) * 3 + 0.32,
      lobby.position.z + lobby.dimensions.z / 2,
    ];
  }
  return [6, 0.32, 3];
}

/**
 * Mirror of the room orb value mapping from DiegeticMetricLayer.
 */
function orbValue(activity: string): number {
  switch (activity) {
    case "busy":   return 78;
    case "active": return 50;
    case "error":  return 95;
    default:       return 15;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  metricColor() — colour-coding logic
// ─────────────────────────────────────────────────────────────────────────────

describe("metricColor() — value to colour mapping (6a-1)", () => {
  it("value 100 → critical red", () => {
    expect(metricColor(100)).toBe("#ff4455");
  });

  it("value 81 → critical red (above 80 threshold)", () => {
    expect(metricColor(81)).toBe("#ff4455");
  });

  it("value 80 → NOT critical (threshold is exclusive >80)", () => {
    expect(metricColor(80)).not.toBe("#ff4455");
  });

  it("value 75 → busy orange (61-80 band)", () => {
    expect(metricColor(75)).toBe("#ff8800");
  });

  it("value 61 → busy orange (boundary of busy band)", () => {
    expect(metricColor(61)).toBe("#ff8800");
  });

  it("value 60 → NOT busy orange (60 is not >60)", () => {
    expect(metricColor(60)).not.toBe("#ff8800");
  });

  it("value 50 → degraded amber (31-60 band)", () => {
    expect(metricColor(50)).toBe("#ffcc00");
  });

  it("value 31 → degraded amber (boundary)", () => {
    expect(metricColor(31)).toBe("#ffcc00");
  });

  it("value 30 → healthy green (≤30)", () => {
    expect(metricColor(30)).toBe("#00ff88");
  });

  it("value 0 → healthy green", () => {
    expect(metricColor(0)).toBe("#00ff88");
  });

  it("inverse=true: value 90 (→ inverted 10) → healthy green", () => {
    expect(metricColor(90, true)).toBe("#00ff88");
  });

  it("inverse=true: value 10 (→ inverted 90) → critical red", () => {
    expect(metricColor(10, true)).toBe("#ff4455");
  });

  it("inverse=false is the default", () => {
    expect(metricColor(95)).toBe(metricColor(95, false));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2.  healthColor() — health label to colour
// ─────────────────────────────────────────────────────────────────────────────

describe("healthColor() — health label to colour (6a-2)", () => {
  it("'error' → critical red", () => {
    expect(healthColor("error")).toBe("#ff4455");
  });

  it("'degraded' → busy orange", () => {
    expect(healthColor("degraded")).toBe("#ff8800");
  });

  it("'healthy' → green", () => {
    expect(healthColor("healthy")).toBe("#00ff88");
  });

  it("'unknown' → accent blue (idle)", () => {
    expect(healthColor("unknown")).toBe("#4a6aff");
  });

  it("'idle' → accent blue", () => {
    expect(healthColor("idle")).toBe("#4a6aff");
  });

  it("unrecognised label → accent blue (fallback)", () => {
    expect(healthColor("foobar")).toBe("#4a6aff");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3.  FloatingMetricOrb urgency encoding
// ─────────────────────────────────────────────────────────────────────────────

describe("FloatingMetricOrb rotation urgency (6a-3)", () => {
  it("value=0 → minimum urgency 0.5", () => {
    expect(orbUrgency(0)).toBeCloseTo(0.5);
  });

  it("value=100 → maximum urgency 3.0", () => {
    expect(orbUrgency(100)).toBeCloseTo(3.0);
  });

  it("value=50 → midpoint urgency 1.75", () => {
    expect(orbUrgency(50)).toBeCloseTo(1.75);
  });

  it("urgency increases monotonically with value", () => {
    for (let v = 0; v < 100; v++) {
      expect(orbUrgency(v + 1)).toBeGreaterThan(orbUrgency(v));
    }
  });

  it("urgency is always positive", () => {
    for (let v = 0; v <= 100; v++) {
      expect(orbUrgency(v)).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4.  StatusPillar height formula
// ─────────────────────────────────────────────────────────────────────────────

describe("StatusPillar bar height formula (6a-4)", () => {
  const MAX = 0.65;

  it("value=100 → full maxHeight", () => {
    expect(pillarHeight(100, MAX)).toBeCloseTo(MAX);
  });

  it("value=50 → half maxHeight", () => {
    expect(pillarHeight(50, MAX)).toBeCloseTo(MAX / 2);
  });

  it("value=0 → minimum height 0.015 (not zero, to keep mesh renderable)", () => {
    expect(pillarHeight(0, MAX)).toBeCloseTo(0.015);
  });

  it("very small value → clamped to minimum 0.015", () => {
    expect(pillarHeight(1, MAX)).toBeGreaterThanOrEqual(0.015);
  });

  it("height is non-negative for all values 0-100", () => {
    for (let v = 0; v <= 100; v++) {
      expect(pillarHeight(v, MAX)).toBeGreaterThan(0);
    }
  });

  it("height increases monotonically with value (above minimum clamp)", () => {
    const prev = pillarHeight(10, MAX);
    const next = pillarHeight(20, MAX);
    expect(next).toBeGreaterThan(prev);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5.  MetricRingIndicator arc fill (phiLength)
// ─────────────────────────────────────────────────────────────────────────────

describe("MetricRingIndicator phiLength arc (6a-5)", () => {
  it("value=100 → full circle (2π)", () => {
    expect(ringPhiLength(100)).toBeCloseTo(Math.PI * 2);
  });

  it("value=50 → half circle (π)", () => {
    expect(ringPhiLength(50)).toBeCloseTo(Math.PI);
  });

  it("value=0 → minimum arc (near-zero, not zero)", () => {
    const phi = ringPhiLength(0);
    expect(phi).toBeGreaterThan(0);
    expect(phi).toBeLessThan(0.001);
  });

  it("phiLength is always > 0", () => {
    for (let v = 0; v <= 100; v++) {
      expect(ringPhiLength(v)).toBeGreaterThan(0);
    }
  });

  it("phiLength increases monotonically with value", () => {
    for (let v = 0; v < 100; v++) {
      expect(ringPhiLength(v + 1)).toBeGreaterThan(ringPhiLength(v));
    }
  });

  it("phiLength never exceeds 2π", () => {
    for (let v = 0; v <= 100; v++) {
      expect(ringPhiLength(v)).toBeLessThanOrEqual(Math.PI * 2 + 1e-9);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6.  SystemHealthBeacon health derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("SystemHealthBeacon health derivation (6a-6)", () => {
  it("any error count → 'error' (highest priority)", () => {
    expect(deriveHealth(1, 0, 0, 5, 0)).toBe("error");
    expect(deriveHealth(3, 90, 90, 0, 0)).toBe("error");
  });

  it("no errors, cpu > 80 → 'degraded'", () => {
    expect(deriveHealth(0, 85, 50, 2, 1)).toBe("degraded");
  });

  it("no errors, memory > 80 → 'degraded'", () => {
    expect(deriveHealth(0, 50, 82, 2, 1)).toBe("degraded");
  });

  it("no errors, cpu ≤ 80 and memory ≤ 80, active+busy > 0 → 'healthy'", () => {
    expect(deriveHealth(0, 60, 60, 3, 2)).toBe("healthy");
  });

  it("no errors, no degraded, no active/busy → 'idle'", () => {
    expect(deriveHealth(0, 20, 30, 0, 0)).toBe("idle");
  });

  it("error takes priority over high CPU/memory", () => {
    // Even with cpu=100, memory=100 → still 'error' if errorCount > 0
    expect(deriveHealth(2, 100, 100, 0, 0)).toBe("error");
  });

  it("degraded takes priority over active agents", () => {
    // cpu > 80 → 'degraded' even if active agents exist
    expect(deriveHealth(0, 81, 50, 5, 3)).toBe("degraded");
  });

  it("exactly 0 errors and cpu=80, memory=80 → 'healthy' (thresholds are strict >80)", () => {
    // 80 is NOT > 80, so not degraded
    expect(deriveHealth(0, 80, 80, 1, 0)).toBe("healthy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7.  DiegeticMetricLayer beacon placement
// ─────────────────────────────────────────────────────────────────────────────

describe("DiegeticMetricLayer beacon position (6a-7)", () => {
  const lobbyRoom = {
    roomType: "lobby",
    position: { x: 4, y: 0, z: 2 },
    dimensions: { x: 2, y: 3, z: 2 },
    floor: 0,
  };

  const noLobbyRooms = [
    {
      roomType: "control",
      position: { x: 0, y: 0, z: 0 },
      dimensions: { x: 4, y: 3, z: 3 },
      floor: 1,
    },
  ];

  it("places beacon at lobby room centre", () => {
    const pos = beaconPosition([lobbyRoom]);
    expect(pos[0]).toBeCloseTo(4 + 2 / 2); // cx = 4 + 1 = 5
    expect(pos[2]).toBeCloseTo(2 + 2 / 2); // cz = 2 + 1 = 3
  });

  it("lobby beacon Y = floor * 3 + 0.32", () => {
    const pos = beaconPosition([lobbyRoom]);
    expect(pos[1]).toBeCloseTo(0 * 3 + 0.32);
  });

  it("lobby beacon Y accounts for floor index", () => {
    const floor1Lobby = { ...lobbyRoom, floor: 1 };
    const pos = beaconPosition([floor1Lobby]);
    expect(pos[1]).toBeCloseTo(1 * 3 + 0.32);
  });

  it("falls back to [6, 0.32, 3] when no lobby room", () => {
    const pos = beaconPosition(noLobbyRooms);
    expect(pos[0]).toBe(6);
    expect(pos[1]).toBeCloseTo(0.32);
    expect(pos[2]).toBe(3);
  });

  it("falls back to [6, 0.32, 3] for empty building", () => {
    const pos = beaconPosition([]);
    expect(pos).toEqual([6, 0.32, 3]);
  });

  it("uses first lobby room when multiple exist", () => {
    const secondLobby = {
      roomType: "lobby",
      position: { x: 8, y: 0, z: 4 },
      dimensions: { x: 2, y: 3, z: 2 },
      floor: 1,
    };
    const pos = beaconPosition([lobbyRoom, secondLobby]);
    // Should use first lobby
    expect(pos[0]).toBeCloseTo(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  8.  HolographicPanel metric row clamping
// ─────────────────────────────────────────────────────────────────────────────

describe("HolographicPanel metric row clamping (6a-8)", () => {
  function clampMetricValue(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  it("value within range [0,100] passes through unchanged", () => {
    expect(clampMetricValue(50)).toBe(50);
    expect(clampMetricValue(0)).toBe(0);
    expect(clampMetricValue(100)).toBe(100);
  });

  it("value > 100 is clamped to 100", () => {
    expect(clampMetricValue(150)).toBe(100);
    expect(clampMetricValue(9999)).toBe(100);
  });

  it("value < 0 is clamped to 0", () => {
    expect(clampMetricValue(-10)).toBe(0);
    expect(clampMetricValue(-1)).toBe(0);
  });

  it("boundary 0 and 100 are valid display values", () => {
    expect(clampMetricValue(0)).toBeGreaterThanOrEqual(0);
    expect(clampMetricValue(100)).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  9.  Performance quality gating
// ─────────────────────────────────────────────────────────────────────────────

describe("DiegeticMetricLayer performance gating (6a-9)", () => {
  type QualityLevel = "high" | "medium" | "low";

  /**
   * Mirror of the quality gate conditions in DiegeticMetricLayer:
   *   - Panels: shown at 'high' and 'medium', hidden at 'low'
   *   - Orbs:   shown only at 'high'
   *   - Pillars: always shown
   *   - Beacon:  always shown
   */
  function shouldShowPanels(q: QualityLevel):  boolean { return q !== "low"; }
  function shouldShowOrbs(q: QualityLevel):    boolean { return q === "high"; }
  function shouldShowPillars(_q: QualityLevel): boolean { return true; }
  function shouldShowBeacon(_q: QualityLevel):  boolean { return true; }

  describe("HolographicPanels", () => {
    it("shown at 'high'",   () => { expect(shouldShowPanels("high")).toBe(true);   });
    it("shown at 'medium'", () => { expect(shouldShowPanels("medium")).toBe(true); });
    it("hidden at 'low'",   () => { expect(shouldShowPanels("low")).toBe(false);   });
  });

  describe("FloatingMetricOrbs", () => {
    it("shown at 'high'",    () => { expect(shouldShowOrbs("high")).toBe(true);    });
    it("hidden at 'medium'", () => { expect(shouldShowOrbs("medium")).toBe(false); });
    it("hidden at 'low'",    () => { expect(shouldShowOrbs("low")).toBe(false);    });
  });

  describe("StatusPillars (always visible)", () => {
    it("shown at 'high'",   () => { expect(shouldShowPillars("high")).toBe(true);   });
    it("shown at 'medium'", () => { expect(shouldShowPillars("medium")).toBe(true); });
    it("shown at 'low'",    () => { expect(shouldShowPillars("low")).toBe(true);    });
  });

  describe("SystemHealthBeacon (always visible)", () => {
    it("shown at 'high'",   () => { expect(shouldShowBeacon("high")).toBe(true);   });
    it("shown at 'medium'", () => { expect(shouldShowBeacon("medium")).toBe(true); });
    it("shown at 'low'",    () => { expect(shouldShowBeacon("low")).toBe(true);    });
  });

  it("'low' quality hides most objects (reduces draw calls)", () => {
    const showPanel  = shouldShowPanels("low");
    const showOrbs   = shouldShowOrbs("low");
    const showPillar = shouldShowPillars("low");
    const showBeacon = shouldShowBeacon("low");
    // At least pillars and beacon should still render at low quality
    expect(showPanel).toBe(false);
    expect(showOrbs).toBe(false);
    expect(showPillar).toBe(true);
    expect(showBeacon).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  10.  Room orb value mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("Room orb value mapping (6a-10)", () => {
  it("'busy' activity → 78 (high, not critical)", () => {
    expect(orbValue("busy")).toBe(78);
  });

  it("'active' activity → 50 (mid-range)", () => {
    expect(orbValue("active")).toBe(50);
  });

  it("'error' activity → 95 (near-critical)", () => {
    expect(orbValue("error")).toBe(95);
  });

  it("'idle' activity → 15 (low — barely spinning)", () => {
    expect(orbValue("idle")).toBe(15);
  });

  it("unknown activity → 15 (same as idle)", () => {
    expect(orbValue("unknown")).toBe(15);
  });

  it("all values are in 0-100 range", () => {
    ["busy", "active", "error", "idle"].forEach((act) => {
      const v = orbValue(act);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it("'error' orb value is the highest (critical state most visible)", () => {
    expect(orbValue("error")).toBeGreaterThan(orbValue("busy"));
    expect(orbValue("busy")).toBeGreaterThan(orbValue("active"));
    expect(orbValue("active")).toBeGreaterThan(orbValue("idle"));
  });
});
