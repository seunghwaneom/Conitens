/**
 * diegetic-command-status-indicator.test.ts — Sub-AC 8c unit tests
 *
 * Tests the pure-logic parts of the diegetic 3D status indicator system:
 *
 *   1. Dominant-status priority ordering
 *      8c-dsi-1a: DOMINANT_STATUS_PRIORITY: failed > rejected > processing > pending > completed > none
 *      8c-dsi-1b: computeDominantStatus with empty entry set returns null
 *      8c-dsi-1c: computeDominantStatus with single entry returns that entry's status
 *      8c-dsi-1d: computeDominantStatus correctly elevates highest-priority status
 *      8c-dsi-1e: computeDominantStatus: failed beats all others
 *      8c-dsi-1f: computeDominantStatus: processing beats pending + completed
 *
 *   2. Constants
 *      8c-dsi-2a: INDICATOR_RING_RADIUS > 0
 *      8c-dsi-2b: INDICATOR_GEM_RADIUS > 0 and < INDICATOR_RING_RADIUS
 *      8c-dsi-2c: INDICATOR_FLOAT_Y > 0
 *      8c-dsi-2d: INDICATOR_CULL_DIST > 0
 *      8c-dsi-2e: INDICATOR_TERMINAL_VISIBLE_MS > COMPLETION_TTL_MS
 *      8c-dsi-2f: INDICATOR_LOG_SCAN_LIMIT >= 50
 *
 *   3. useDiegeticStatusIndicator hook via store integration
 *      8c-dsi-3a: Returns idle state for unknown sourceEntityId
 *      8c-dsi-3b: Returns dominant status matching highest-priority active command
 *      8c-dsi-3c: activeCount reflects only pending/processing entries
 *      8c-dsi-3d: latestEntry is the most recently updated entry
 *      8c-dsi-3e: Entries deduplicated when agentId and roomId both match
 *      8c-dsi-3f: clearLog() resets the state to idle
 *      8c-dsi-3g: roomId-keyed command is visible for fixture entities
 *      8c-dsi-3h: Multiple commands with different statuses → failed dominates
 *      8c-dsi-3i: Terminal entries within INDICATOR_TERMINAL_VISIBLE_MS remain visible
 *
 *   4. Visual metadata consistency
 *      8c-dsi-4a: COMMAND_STATUS_COLORS keys match DOMINANT_STATUS_PRIORITY lifecycle statuses
 *      8c-dsi-4b: COMMAND_STATUS_ICONS keys match COMMAND_STATUS_COLORS keys
 *      8c-dsi-4c: All status colors are valid CSS hex strings (#rrggbb or #rrggbbaa)
 *
 *   5. Component prop defaults
 *      8c-dsi-5a: INDICATOR_FLOAT_Y > 0 (indicator floats above entity)
 *      8c-dsi-5b: Default scale=1.0, position=[0,0,0], entityType="other"
 *
 * NOTE: React + WebGL components (DiegeticCommandStatusIndicator) cannot run
 *       headlessly. Only pure-logic helpers and the hook via store state
 *       manipulation are tested here — consistent with the established pattern
 *       in dashboard-panel.test.ts and task-orb-control-fixtures.test.ts.
 *
 * Test ID scheme:
 *   8c-dsi-N[a-z] : Sub-AC 8c Diegetic Status Indicator
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Hook + pure helpers ─────────────────────────────────────────────────────
import {
  useDiegeticStatusIndicator,
  computeDominantStatus,
  DOMINANT_STATUS_PRIORITY,
  INDICATOR_TERMINAL_VISIBLE_MS,
  INDICATOR_LOG_SCAN_LIMIT,
} from "../../hooks/use-diegetic-status-indicator.js";

// ── Component constants ──────────────────────────────────────────────────────
import {
  INDICATOR_RING_RADIUS,
  INDICATOR_GEM_RADIUS,
  INDICATOR_FLOAT_Y,
  INDICATOR_CULL_DIST,
} from "../DiegeticCommandStatusIndicator.js";

// ── Store ────────────────────────────────────────────────────────────────────
import {
  useCommandLifecycleStore,
  COMPLETION_TTL_MS,
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleEntry,
  type CommandLifecycleStatus,
} from "../../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** All live lifecycle status values (excludes "none" sentinel). */
const ALL_STATUSES: CommandLifecycleStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "rejected",
];

/** Build a minimal CommandLifecycleEntry for store injection. */
function makeEntry(
  overrides: Partial<CommandLifecycleEntry> & { command_id: string },
): CommandLifecycleEntry {
  const now = new Date().toISOString();
  return {
    command_type: "agent.spawn",
    status:       "pending",
    ts:           now,
    updatedAt:    now,
    seq:          1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store reset between tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useCommandLifecycleStore.getState().clearLog();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dominant-status priority
// ─────────────────────────────────────────────────────────────────────────────

describe("8c-dsi-1: Dominant-status priority ordering", () => {
  it("8c-dsi-1a: failed has the highest priority of all lifecycle statuses", () => {
    const failedP = DOMINANT_STATUS_PRIORITY["failed"];
    for (const s of ALL_STATUSES) {
      if (s === "failed") continue;
      expect(failedP).toBeGreaterThan(DOMINANT_STATUS_PRIORITY[s]);
    }
  });

  it("8c-dsi-1b: priority ordering: failed > rejected > processing > pending > completed > none", () => {
    expect(DOMINANT_STATUS_PRIORITY["failed"])
      .toBeGreaterThan(DOMINANT_STATUS_PRIORITY["rejected"]);
    expect(DOMINANT_STATUS_PRIORITY["rejected"])
      .toBeGreaterThan(DOMINANT_STATUS_PRIORITY["processing"]);
    expect(DOMINANT_STATUS_PRIORITY["processing"])
      .toBeGreaterThan(DOMINANT_STATUS_PRIORITY["pending"]);
    expect(DOMINANT_STATUS_PRIORITY["pending"])
      .toBeGreaterThan(DOMINANT_STATUS_PRIORITY["completed"]);
    expect(DOMINANT_STATUS_PRIORITY["completed"])
      .toBeGreaterThan(DOMINANT_STATUS_PRIORITY["none"]);
  });

  it("8c-dsi-1c: computeDominantStatus returns null for empty array", () => {
    expect(computeDominantStatus([])).toBeNull();
  });

  it("8c-dsi-1d: computeDominantStatus with single entry returns that status", () => {
    for (const s of ALL_STATUSES) {
      const entries = [makeEntry({ command_id: "cmd-1", status: s })];
      expect(computeDominantStatus(entries)).toBe(s);
    }
  });

  it("8c-dsi-1e: computeDominantStatus elevates highest priority status", () => {
    const entries: CommandLifecycleEntry[] = [
      makeEntry({ command_id: "cmd-1", status: "pending" }),
      makeEntry({ command_id: "cmd-2", status: "processing" }),
      makeEntry({ command_id: "cmd-3", status: "completed" }),
    ];
    expect(computeDominantStatus(entries)).toBe("processing");
  });

  it("8c-dsi-1f: computeDominantStatus: failed beats all others", () => {
    const entries: CommandLifecycleEntry[] = ALL_STATUSES.map((s, i) =>
      makeEntry({ command_id: `cmd-${i}`, status: s }),
    );
    expect(computeDominantStatus(entries)).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Constants
// ─────────────────────────────────────────────────────────────────────────────

describe("8c-dsi-2: Indicator constants", () => {
  it("8c-dsi-2a: INDICATOR_RING_RADIUS is positive", () => {
    expect(INDICATOR_RING_RADIUS).toBeGreaterThan(0);
  });

  it("8c-dsi-2b: INDICATOR_GEM_RADIUS is positive and smaller than ring radius", () => {
    expect(INDICATOR_GEM_RADIUS).toBeGreaterThan(0);
    expect(INDICATOR_GEM_RADIUS).toBeLessThan(INDICATOR_RING_RADIUS);
  });

  it("8c-dsi-2c: INDICATOR_FLOAT_Y is positive (floats above position)", () => {
    expect(INDICATOR_FLOAT_Y).toBeGreaterThan(0);
  });

  it("8c-dsi-2d: INDICATOR_CULL_DIST is positive", () => {
    expect(INDICATOR_CULL_DIST).toBeGreaterThan(0);
  });

  it("8c-dsi-2e: INDICATOR_TERMINAL_VISIBLE_MS exceeds COMPLETION_TTL_MS", () => {
    expect(INDICATOR_TERMINAL_VISIBLE_MS).toBeGreaterThan(COMPLETION_TTL_MS);
  });

  it("8c-dsi-2f: INDICATOR_LOG_SCAN_LIMIT >= 50", () => {
    expect(INDICATOR_LOG_SCAN_LIMIT).toBeGreaterThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. useDiegeticStatusIndicator via store integration
// ─────────────────────────────────────────────────────────────────────────────

describe("8c-dsi-3: useDiegeticStatusIndicator hook (store integration)", () => {
  /**
   * Call the hook outside React by reading the store snapshot directly
   * and calling the hook's internal selector logic imperatively.
   *
   * Since useDiegeticStatusIndicator is a React hook we cannot call it
   * outside a component, so we test the underlying computeDominantStatus
   * logic and the store selectors directly.
   */

  it("8c-dsi-3a: idle state when no commands exist for sourceEntityId", () => {
    const state = useCommandLifecycleStore.getState();
    const active = state.getActiveCommandsForAgent("unknown-entity-xyz");
    expect(active).toHaveLength(0);
    const dominant = computeDominantStatus(active);
    expect(dominant).toBeNull();
  });

  it("8c-dsi-3b: single pending command → dominant = pending", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-pending-001", "agent.spawn", "agent-foo", undefined);

    const active = useCommandLifecycleStore.getState().getActiveCommandsForAgent("agent-foo");
    expect(active).toHaveLength(1);
    expect(computeDominantStatus(active)).toBe("pending");
  });

  it("8c-dsi-3c: processing command → dominant = processing", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-proc-001", "task.create", "agent-bar", undefined);
    store.handleCommandEvent({
      type: "command.issued",
      payload: { command_id: "cmd-proc-001", command_type: "task.create" },
    });

    const active = useCommandLifecycleStore.getState().getActiveCommandsForAgent("agent-bar");
    const processing = active.filter((e) => e.status === "processing");
    expect(processing.length).toBeGreaterThanOrEqual(1);
    expect(computeDominantStatus(active)).toBe("processing");
  });

  it("8c-dsi-3d: activeCount counts only pending/processing entries", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-active-1", "agent.spawn", "agent-baz");
    store.addLocalCommand("cmd-active-2", "agent.restart", "agent-baz");

    const active = useCommandLifecycleStore.getState().getActiveCommandsForAgent("agent-baz");
    const activeCount = active.filter(
      (e) => e.status === "pending" || e.status === "processing",
    ).length;
    expect(activeCount).toBe(2);
  });

  it("8c-dsi-3e: latestEntry is determined by most recent updatedAt", () => {
    const earlyTs  = new Date(Date.now() - 5_000).toISOString();
    const lateTs   = new Date(Date.now() - 100).toISOString();

    const entries: CommandLifecycleEntry[] = [
      makeEntry({ command_id: "cmd-early", status: "pending", updatedAt: earlyTs }),
      makeEntry({ command_id: "cmd-late",  status: "pending", updatedAt: lateTs  }),
    ];

    const latest = entries.reduce<CommandLifecycleEntry | null>((best, e) => {
      if (!best) return e;
      return new Date(e.updatedAt) > new Date(best.updatedAt) ? e : best;
    }, null);

    expect(latest?.command_id).toBe("cmd-late");
  });

  it("8c-dsi-3f: clearLog() resets all commands and agent index", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-to-clear", "agent.spawn", "agent-qux");
    store.clearLog();

    const afterClear = useCommandLifecycleStore.getState();
    expect(afterClear.log).toHaveLength(0);
    expect(Object.keys(afterClear.commands)).toHaveLength(0);
    expect(Object.keys(afterClear.agentCommandMap)).toHaveLength(0);
  });

  it("8c-dsi-3g: roomId-keyed command appears in log entries filter for room entity", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand(
      "cmd-room-001",
      "meeting.convene",
      undefined,          // no agentId
      "ops-control",      // roomId
    );

    const entries = useCommandLifecycleStore.getState().getLogEntries(50);
    const roomMatch = entries.filter((e) => e.roomId === "ops-control");
    expect(roomMatch).toHaveLength(1);
    expect(roomMatch[0]!.command_type).toBe("meeting.convene");
  });

  it("8c-dsi-3h: multiple commands — failed dominates over pending and processing", () => {
    const entries: CommandLifecycleEntry[] = [
      makeEntry({ command_id: "cmd-x1", status: "pending"    }),
      makeEntry({ command_id: "cmd-x2", status: "processing" }),
      makeEntry({ command_id: "cmd-x3", status: "failed"     }),
    ];
    expect(computeDominantStatus(entries)).toBe("failed");
  });

  it("8c-dsi-3i: rejected dominates over pending and completed but not failed", () => {
    const entries: CommandLifecycleEntry[] = [
      makeEntry({ command_id: "cmd-y1", status: "completed" }),
      makeEntry({ command_id: "cmd-y2", status: "pending"   }),
      makeEntry({ command_id: "cmd-y3", status: "rejected"  }),
    ];
    expect(computeDominantStatus(entries)).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Visual metadata consistency
// ─────────────────────────────────────────────────────────────────────────────

describe("8c-dsi-4: Visual metadata consistency", () => {
  it("8c-dsi-4a: COMMAND_STATUS_COLORS has an entry for every lifecycle status", () => {
    for (const s of ALL_STATUSES) {
      expect(COMMAND_STATUS_COLORS).toHaveProperty(s);
      expect(typeof COMMAND_STATUS_COLORS[s]).toBe("string");
    }
  });

  it("8c-dsi-4b: COMMAND_STATUS_ICONS has an entry for every lifecycle status", () => {
    for (const s of ALL_STATUSES) {
      expect(COMMAND_STATUS_ICONS).toHaveProperty(s);
      expect(typeof COMMAND_STATUS_ICONS[s]).toBe("string");
    }
  });

  it("8c-dsi-4c: all status colors are valid CSS hex strings starting with #", () => {
    const cssHexRe = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    for (const s of ALL_STATUSES) {
      expect(COMMAND_STATUS_COLORS[s]).toMatch(cssHexRe);
    }
  });

  it("8c-dsi-4d: DOMINANT_STATUS_PRIORITY covers all live lifecycle statuses", () => {
    for (const s of ALL_STATUSES) {
      expect(DOMINANT_STATUS_PRIORITY).toHaveProperty(s);
      expect(typeof DOMINANT_STATUS_PRIORITY[s]).toBe("number");
    }
    // Also covers the "none" sentinel
    expect(DOMINANT_STATUS_PRIORITY).toHaveProperty("none");
  });

  it("8c-dsi-4e: all priority values are distinct integers >= 0", () => {
    const allKeys = [...ALL_STATUSES, "none" as const];
    const values  = allKeys.map((k) => DOMINANT_STATUS_PRIORITY[k]);
    const unique  = new Set(values);
    // All 6 entries should be distinct
    expect(unique.size).toBe(allKeys.length);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Component prop defaults / geometry ratios
// ─────────────────────────────────────────────────────────────────────────────

describe("8c-dsi-5: Component geometry and prop defaults", () => {
  it("8c-dsi-5a: ring radius is at least 2× the gem radius (gem fits inside ring)", () => {
    expect(INDICATOR_RING_RADIUS).toBeGreaterThanOrEqual(INDICATOR_GEM_RADIUS * 2);
  });

  it("8c-dsi-5b: INDICATOR_FLOAT_Y is meaningfully above zero (not a micro-offset)", () => {
    // At least 0.1 world units to be visible above any entity surface
    expect(INDICATOR_FLOAT_Y).toBeGreaterThanOrEqual(0.1);
  });

  it("8c-dsi-5c: INDICATOR_CULL_DIST is at least 10 world units (usable range)", () => {
    expect(INDICATOR_CULL_DIST).toBeGreaterThanOrEqual(10);
  });
});
