/**
 * agent-lifecycle-dispatch.test.ts — Sub-AC 7a: Lifecycle control → command dispatch
 *
 * Verifies the contract between the 3D lifecycle panel/context menu and the
 * orchestration command dispatch pipeline.  Tests cover:
 *
 *   1. LIFECYCLE_ACTION_TO_COMMAND_TYPE mapping — the exported constant that
 *      defines which orchestration_command type each UI action emits.
 *   2. buildAgentMenuEntries status-awareness — correct lifecycle entries are
 *      generated based on the agent's current operational status.
 *   3. REASSIGN (agent.assign) entry appears when availableRooms is provided.
 *   4. START entry appears for inactive/terminated agents (and not for live agents).
 *   5. PAUSE entry appears only for running (active/busy) agents.
 *   6. Command type uniqueness — no two lifecycle actions map to the same command.
 *
 * Design principle: all tests are pure function calls — no React rendering,
 * no Three.js, no async I/O.  This keeps the test suite fast and headless-safe.
 *
 * Test ID scheme:
 *   7a-dispatch-N : Sub-AC 7a command dispatch contract
 */

import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_ACTION_TO_COMMAND_TYPE,
  type LifecycleCommandType,
} from "../AgentLifecyclePanel.js";
import { buildAgentMenuEntries } from "../../components/ContextMenuDispatcher.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LIFECYCLE_ACTION_TO_COMMAND_TYPE — action → command mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7a — LIFECYCLE_ACTION_TO_COMMAND_TYPE: action → command contract", () => {

  // 7a-dispatch-1
  it("start action maps to agent.spawn command (activates dormant agent)", () => {
    expect(LIFECYCLE_ACTION_TO_COMMAND_TYPE.start).toBe("agent.spawn");
  });

  // 7a-dispatch-2
  it("stop action maps to agent.terminate command (destructive lifecycle end)", () => {
    expect(LIFECYCLE_ACTION_TO_COMMAND_TYPE.stop).toBe("agent.terminate");
  });

  // 7a-dispatch-3
  it("restart action maps to agent.restart command (reset without deregistering)", () => {
    expect(LIFECYCLE_ACTION_TO_COMMAND_TYPE.restart).toBe("agent.restart");
  });

  // 7a-dispatch-4
  it("pause action maps to agent.pause command (suspend work, preserve task)", () => {
    expect(LIFECYCLE_ACTION_TO_COMMAND_TYPE.pause).toBe("agent.pause");
  });

  // 7a-dispatch-5
  it("reassign action maps to agent.assign command (room reassignment)", () => {
    expect(LIFECYCLE_ACTION_TO_COMMAND_TYPE.reassign).toBe("agent.assign");
  });

  // 7a-dispatch-6
  it("all 5 lifecycle actions are present in the mapping (no missing actions)", () => {
    const keys = Object.keys(LIFECYCLE_ACTION_TO_COMMAND_TYPE);
    expect(keys).toContain("start");
    expect(keys).toContain("stop");
    expect(keys).toContain("restart");
    expect(keys).toContain("pause");
    expect(keys).toContain("reassign");
    expect(keys).toHaveLength(5);
  });

  // 7a-dispatch-7
  it("all command types in the mapping are unique (no action shares a command)", () => {
    const values = Object.values(LIFECYCLE_ACTION_TO_COMMAND_TYPE) as LifecycleCommandType[];
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  // 7a-dispatch-8
  it("all mapped command types match the protocol-defined agent command types", () => {
    // These are the canonical command types from @conitens/protocol command-file.ts
    const validCommandTypes = new Set([
      "agent.spawn",
      "agent.terminate",
      "agent.restart",
      "agent.pause",
      "agent.resume",
      "agent.assign",
      "agent.send_command",
    ]);
    for (const [action, commandType] of Object.entries(LIFECYCLE_ACTION_TO_COMMAND_TYPE)) {
      expect(
        validCommandTypes.has(commandType),
        `Action "${action}" maps to "${commandType}" which is not a valid protocol command type`,
      ).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. buildAgentMenuEntries — status-aware context menu entries (Sub-AC 7a)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7a — buildAgentMenuEntries: status-aware lifecycle menu entries", () => {

  // ── Helper to extract item actions from built entries ──────────────────────
  function actionSet(agentId: string, status: string, extra?: {
    availableRooms?: Array<{ roomId: string; name: string }>;
  }): Set<string> {
    const entries = buildAgentMenuEntries(agentId, {
      agentStatus:    status,
      availableRooms: extra?.availableRooms,
    });
    return new Set(entries.map((e) => e.item.action));
  }

  // 7a-dispatch-9
  it("inactive agent context menu contains 'spawn' (START) entry", () => {
    const actions = actionSet("agent-1", "inactive");
    expect(actions.has("spawn")).toBe(true);
  });

  // 7a-dispatch-10
  it("terminated agent context menu contains 'spawn' (START) entry", () => {
    const actions = actionSet("agent-1", "terminated");
    expect(actions.has("spawn")).toBe(true);
  });

  // 7a-dispatch-11
  it("inactive/terminated agents do NOT get terminate entry (already inactive)", () => {
    for (const status of ["inactive", "terminated"]) {
      const actions = actionSet("agent-1", status);
      expect(actions.has("terminate"),
        `Terminate should NOT be in context menu for status=${status}`)
        .toBe(false);
    }
  });

  // 7a-dispatch-12
  it("inactive/terminated agents do NOT get pause entry (nothing to pause)", () => {
    for (const status of ["inactive", "terminated"]) {
      const actions = actionSet("agent-1", status);
      expect(actions.has("pause"),
        `Pause should NOT be in context menu for status=${status}`)
        .toBe(false);
    }
  });

  // 7a-dispatch-13
  it("active agent context menu contains 'pause' action", () => {
    const actions = actionSet("agent-1", "active");
    expect(actions.has("pause")).toBe(true);
  });

  // 7a-dispatch-14
  it("busy agent context menu contains 'pause' action", () => {
    const actions = actionSet("agent-1", "busy");
    expect(actions.has("pause")).toBe(true);
  });

  // 7a-dispatch-15
  it("idle agent context menu does NOT contain 'pause' (nothing running to pause)", () => {
    const actions = actionSet("agent-1", "idle");
    expect(actions.has("pause")).toBe(false);
  });

  // 7a-dispatch-16
  it("idle agent context menu contains 'resume' (can be resumed from idle)", () => {
    const actions = actionSet("agent-1", "idle");
    expect(actions.has("resume")).toBe(true);
  });

  // 7a-dispatch-17
  it("active agent context menu does NOT show 'spawn' (already active)", () => {
    for (const status of ["active", "busy", "idle", "error"]) {
      const actions = actionSet("agent-1", status);
      expect(actions.has("spawn"),
        `Spawn should NOT be in context menu for status=${status}`)
        .toBe(false);
    }
  });

  // 7a-dispatch-18
  it("active agent context menu always contains 'restart' and 'terminate'", () => {
    for (const status of ["active", "busy", "idle", "error"]) {
      const actions = actionSet("agent-1", status);
      expect(actions.has("restart"),
        `Restart should be in context menu for status=${status}`)
        .toBe(true);
      expect(actions.has("terminate"),
        `Terminate should be in context menu for status=${status}`)
        .toBe(true);
    }
  });

  // 7a-dispatch-19
  it("every context menu includes 'drill_into' as the first navigation entry", () => {
    for (const status of ["inactive", "idle", "active", "busy", "error", "terminated"]) {
      const entries = buildAgentMenuEntries("agent-nav", { agentStatus: status });
      const firstAction = entries[0]?.item.action;
      expect(firstAction,
        `First context menu entry for status=${status} should be drill_into`)
        .toBe("drill_into");
    }
  });

  // 7a-dispatch-20
  it("every context menu includes 'send_command' entry (always available)", () => {
    for (const status of ["inactive", "idle", "active", "busy", "terminated"]) {
      const actions = actionSet("agent-1", status);
      expect(actions.has("send_command"),
        `send_command should be in context menu for status=${status}`)
        .toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REASSIGN (agent.assign) — room sub-list in context menu
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7a — buildAgentMenuEntries: REASSIGN room sub-list", () => {

  const mockRooms = [
    { roomId: "ops-control", name: "Ops Control" },
    { roomId: "impl-office", name: "Impl Office" },
    { roomId: "research-lab", name: "Research Lab" },
  ];

  // 7a-dispatch-21
  it("'assign' entries appear when availableRooms are provided", () => {
    const entries = buildAgentMenuEntries("agent-1", {
      agentStatus:    "idle",
      availableRooms: mockRooms,
    });
    const assignEntries = entries.filter((e) => e.item.action === "assign");
    expect(assignEntries).toHaveLength(mockRooms.length);
  });

  // 7a-dispatch-22
  it("each 'assign' entry carries the correct room_id in meta", () => {
    const entries = buildAgentMenuEntries("agent-1", {
      agentStatus:    "active",
      availableRooms: mockRooms,
    });
    const assignEntries = entries.filter((e) => e.item.action === "assign");
    for (let i = 0; i < mockRooms.length; i++) {
      expect((assignEntries[i]!.item.meta as Record<string, unknown>)?.room_id)
        .toBe(mockRooms[i]!.roomId);
    }
  });

  // 7a-dispatch-23
  it("no 'assign' entries appear when availableRooms is empty", () => {
    const entries = buildAgentMenuEntries("agent-1", {
      agentStatus:    "idle",
      availableRooms: [],
    });
    const assignEntries = entries.filter((e) => e.item.action === "assign");
    expect(assignEntries).toHaveLength(0);
  });

  // 7a-dispatch-24
  it("no 'assign' entries appear when availableRooms is not provided", () => {
    const entries = buildAgentMenuEntries("agent-1", { agentStatus: "idle" });
    const assignEntries = entries.filter((e) => e.item.action === "assign");
    expect(assignEntries).toHaveLength(0);
  });

  // 7a-dispatch-25
  it("room assign entries are capped at 6 max (panel compactness guard)", () => {
    const manyRooms = Array.from({ length: 10 }, (_, i) => ({
      roomId: `room-${i}`,
      name:   `Room ${i}`,
    }));
    const entries = buildAgentMenuEntries("agent-1", {
      agentStatus:    "active",
      availableRooms: manyRooms,
    });
    const assignEntries = entries.filter((e) => e.item.action === "assign");
    expect(assignEntries.length).toBeLessThanOrEqual(6);
  });

  // 7a-dispatch-26
  it("assign entries appear for all agent statuses (room reassign is status-agnostic)", () => {
    for (const status of ["inactive", "idle", "active", "busy", "error", "terminated"]) {
      const entries = buildAgentMenuEntries("agent-1", {
        agentStatus:    status,
        availableRooms: [{ roomId: "room-x", name: "Room X" }],
      });
      const assignEntries = entries.filter((e) => e.item.action === "assign");
      expect(assignEntries.length,
        `Assign entry should appear for status=${status}`)
        .toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Entity type consistency — all entries must have correct entityType
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7a — buildAgentMenuEntries: entity type integrity", () => {

  // 7a-dispatch-27
  it("all generated entries have entityType='agent'", () => {
    const entries = buildAgentMenuEntries("agent-xyz", {
      agentStatus:    "active",
      availableRooms: [{ roomId: "r1", name: "Room 1" }],
    });
    for (const entry of entries) {
      // disabled/separator entries may have action='select' but still entityType='agent'
      if (entry.variant !== "disabled") {
        expect(entry.item.entityType,
          `Entry "${entry.label}" must have entityType=agent`)
          .toBe("agent");
      }
    }
  });

  // 7a-dispatch-28
  it("all generated entries carry the correct agentId", () => {
    const myAgentId = "researcher-99";
    const entries = buildAgentMenuEntries(myAgentId, {
      agentStatus:    "idle",
      availableRooms: [{ roomId: "r1", name: "R1" }],
    });
    for (const entry of entries) {
      if (entry.variant !== "disabled") {
        expect(entry.item.entityId,
          `Entry "${entry.label}" must carry entityId="${myAgentId}"`)
          .toBe(myAgentId);
      }
    }
  });
});
