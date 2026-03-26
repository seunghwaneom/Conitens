/**
 * use-runtime-room-override.test.ts — Unit tests for Sub-AC 12b.
 *
 * Tests the runtime room mapping override logic:
 *
 *   12b-1   Module exports expected symbols
 *   12b-2   RuntimeOverrideAPI.set stores an override in the room-mapping store
 *   12b-3   Override is reflected immediately (store runtimeOverrides map updated)
 *   12b-4   Setting an override emits a mapping.runtime_override_set event
 *   12b-5   Setting an override for an already-overridden entity replaces it
 *   12b-6   RuntimeOverrideAPI.clear removes the override (mapping.runtime_override_cleared)
 *   12b-7   Clearing a non-existent override is a no-op (no event recorded)
 *   12b-8   RuntimeOverrideAPI.clearAll removes all overrides (mapping.runtime_overrides_cleared)
 *   12b-9   clearAll on empty overrides is a no-op
 *   12b-10  getRuntimeOverridesAsRecord returns flat entityId→roomId map
 *   12b-11  flattenRuntimeOverrides pure function converts map to plain record
 *   12b-12  applyRuntimeOverride pure function returns false for unknown agent
 *   12b-13  applyRuntimeOverride pure function calls moveAgent when agent exists
 *   12b-14  applyRuntimeOverride is a no-op when agent is already in target room
 *   12b-15  revertToResolvedRoom returns null for unknown agent
 *   12b-16  revertToResolvedRoom calls moveAgent when resolved room differs
 *   12b-17  applyMappingToAgents respects runtime overrides (highest priority)
 *   12b-18  applyMappingToAgents with empty overrides falls through to role mapping
 *   12b-19  RuntimeOverrideAPI.get returns the current override entry
 *   12b-20  RuntimeOverrideAPI.has returns correct boolean
 *   12b-21  Runtime overrides are volatile (not included in persistence layer)
 *   12b-22  Source field is stored on the override entry
 *   12b-23  appliedAt timestamp is set when override is stored
 *   12b-24  Multiple overrides can coexist simultaneously
 *   12b-25  resetToDefaults does NOT clear runtime overrides
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── 1. Module exports ────────────────────────────────────────────────────────

describe("12b-1: use-runtime-room-override module shape", () => {
  it("exports expected symbols", async () => {
    const mod = await import("../use-runtime-room-override.js");
    expect(typeof mod.useRuntimeRoomOverride).toBe("function");
    expect(typeof mod.RuntimeRoomOverrideBridge).toBe("function");
    expect(typeof mod.RuntimeOverrideAPI).toBe("object");
    expect(typeof mod.applyRuntimeOverride).toBe("function");
    expect(typeof mod.revertToResolvedRoom).toBe("function");
    expect(typeof mod.flattenRuntimeOverrides).toBe("function");
  });

  it("RuntimeOverrideAPI exposes set, clear, clearAll, get, has, getAll", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    expect(typeof RuntimeOverrideAPI.set).toBe("function");
    expect(typeof RuntimeOverrideAPI.clear).toBe("function");
    expect(typeof RuntimeOverrideAPI.clearAll).toBe("function");
    expect(typeof RuntimeOverrideAPI.get).toBe("function");
    expect(typeof RuntimeOverrideAPI.has).toBe("function");
    expect(typeof RuntimeOverrideAPI.getAll).toBe("function");
  });
});

// ── 2. Store integration via RuntimeOverrideAPI.set ─────────────────────────

describe("12b-2: RuntimeOverrideAPI.set stores override in room-mapping store", () => {
  beforeEach(async () => {
    // Clear all overrides before each test to ensure isolation
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    RuntimeOverrideAPI.clearAll("Test cleanup");
  });

  it("stores a new override entry in runtimeOverrides", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.set("researcher-1", "ops-control", "Test override", "test");

    const state = useRoomMappingStore.getState();
    expect(state.runtimeOverrides["researcher-1"]).toBeDefined();
    expect(state.runtimeOverrides["researcher-1"].roomId).toBe("ops-control");
    expect(state.runtimeOverrides["researcher-1"].reason).toBe("Test override");
    expect(state.runtimeOverrides["researcher-1"].source).toBe("test");

    // Cleanup
    RuntimeOverrideAPI.clear("researcher-1");
  });
});

// ── 3. Immediate store reflection ────────────────────────────────────────────

describe("12b-3: Override is reflected immediately in store state", () => {
  it("runtimeOverrides map is updated synchronously", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll();

    // Before
    expect(useRoomMappingStore.getState().runtimeOverrides["implementer-1"]).toBeUndefined();

    // Set
    RuntimeOverrideAPI.set("implementer-1", "research-lab");

    // After — synchronous
    expect(useRoomMappingStore.getState().runtimeOverrides["implementer-1"]).toBeDefined();
    expect(useRoomMappingStore.getState().runtimeOverrides["implementer-1"].roomId).toBe("research-lab");

    RuntimeOverrideAPI.clear("implementer-1");
  });
});

// ── 4. Event emission on set ─────────────────────────────────────────────────

describe("12b-4: Setting an override emits mapping.runtime_override_set event", () => {
  it("records mapping.runtime_override_set in the events log", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    const eventsBefore = useRoomMappingStore.getState().events.length;
    RuntimeOverrideAPI.set("researcher-2", "ops-control", "Event emission test", "test");

    const eventsAfter = useRoomMappingStore.getState().events;
    expect(eventsAfter.length).toBe(eventsBefore + 1);

    const lastEvent = eventsAfter[eventsAfter.length - 1];
    expect(lastEvent.type).toBe("mapping.runtime_override_set");
    expect(lastEvent.payload.entity_id).toBe("researcher-2");
    expect(lastEvent.payload.to_room).toBe("ops-control");
    expect(lastEvent.payload.source).toBe("test");

    RuntimeOverrideAPI.clear("researcher-2");
  });
});

// ── 5. Idempotent replace ─────────────────────────────────────────────────────

describe("12b-5: Setting override for already-overridden entity replaces it", () => {
  it("replaces the existing entry and records a new event", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.set("agent-x", "room-a", "First override", "test");
    const countAfterFirst = useRoomMappingStore.getState().events.length;

    RuntimeOverrideAPI.set("agent-x", "room-b", "Second override replaces", "test");

    const state = useRoomMappingStore.getState();
    expect(state.runtimeOverrides["agent-x"].roomId).toBe("room-b");
    expect(state.events.length).toBe(countAfterFirst + 1);

    const lastEvent = state.events[state.events.length - 1];
    expect(lastEvent.type).toBe("mapping.runtime_override_set");
    expect(lastEvent.payload.to_room).toBe("room-b");
    expect(lastEvent.payload.from_room).toBe("room-a");

    RuntimeOverrideAPI.clear("agent-x");
  });
});

// ── 6. Clear emits event ─────────────────────────────────────────────────────

describe("12b-6: clear removes the override and emits mapping.runtime_override_cleared", () => {
  it("removes entry from runtimeOverrides and records cleared event", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.set("validator-1", "review-office", "Pre-clear", "test");
    expect(useRoomMappingStore.getState().runtimeOverrides["validator-1"]).toBeDefined();

    const eventsBeforeClear = useRoomMappingStore.getState().events.length;
    RuntimeOverrideAPI.clear("validator-1", "Clear after test");

    const stateAfter = useRoomMappingStore.getState();
    expect(stateAfter.runtimeOverrides["validator-1"]).toBeUndefined();
    expect(stateAfter.events.length).toBe(eventsBeforeClear + 1);

    const lastEvent = stateAfter.events[stateAfter.events.length - 1];
    expect(lastEvent.type).toBe("mapping.runtime_override_cleared");
    expect(lastEvent.payload.entity_id).toBe("validator-1");
    expect(lastEvent.payload.was_room).toBe("review-office");
  });
});

// ── 7. Clear no-op ───────────────────────────────────────────────────────────

describe("12b-7: Clearing a non-existent override is a no-op", () => {
  it("does not record an event when no override exists", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    // Ensure no override exists for this entity
    RuntimeOverrideAPI.clear("nonexistent-agent");

    const countBefore = useRoomMappingStore.getState().events.length;
    RuntimeOverrideAPI.clear("nonexistent-agent", "Should be no-op");

    const countAfter = useRoomMappingStore.getState().events.length;
    expect(countAfter).toBe(countBefore);  // No new event
  });
});

// ── 8. clearAll removes all and emits one event ──────────────────────────────

describe("12b-8: clearAll removes all overrides and emits mapping.runtime_overrides_cleared", () => {
  it("removes all entries and records a single batch event", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.set("agent-a", "room-1", "batch-a", "test");
    RuntimeOverrideAPI.set("agent-b", "room-2", "batch-b", "test");
    RuntimeOverrideAPI.set("agent-c", "room-3", "batch-c", "test");

    expect(Object.keys(useRoomMappingStore.getState().runtimeOverrides).length).toBeGreaterThanOrEqual(3);

    const eventsBeforeClearAll = useRoomMappingStore.getState().events.length;
    RuntimeOverrideAPI.clearAll("Test clearAll");

    const stateAfter = useRoomMappingStore.getState();
    expect(stateAfter.runtimeOverrides["agent-a"]).toBeUndefined();
    expect(stateAfter.runtimeOverrides["agent-b"]).toBeUndefined();
    expect(stateAfter.runtimeOverrides["agent-c"]).toBeUndefined();

    // Only ONE event for the entire batch
    expect(stateAfter.events.length).toBe(eventsBeforeClearAll + 1);
    const lastEvent = stateAfter.events[stateAfter.events.length - 1];
    expect(lastEvent.type).toBe("mapping.runtime_overrides_cleared");
    expect(lastEvent.payload.cleared_count).toBeGreaterThanOrEqual(3);
  });
});

// ── 9. clearAll no-op when empty ─────────────────────────────────────────────

describe("12b-9: clearAll on empty overrides is a no-op", () => {
  it("does not emit an event when there are no overrides to clear", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll(); // Ensure empty
    const countBefore = useRoomMappingStore.getState().events.length;

    RuntimeOverrideAPI.clearAll("No-op clearAll");
    expect(useRoomMappingStore.getState().events.length).toBe(countBefore);
  });
});

// ── 10. getRuntimeOverridesAsRecord ──────────────────────────────────────────

describe("12b-10: getRuntimeOverridesAsRecord returns flat entityId→roomId map", () => {
  it("returns a plain Record<string, string> of entity→room", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll();
    RuntimeOverrideAPI.set("researcher-x", "impl-office", "test", "test");
    RuntimeOverrideAPI.set("planner-y", "research-lab", "test", "test");

    const record = useRoomMappingStore.getState().getRuntimeOverridesAsRecord();
    expect(record["researcher-x"]).toBe("impl-office");
    expect(record["planner-y"]).toBe("research-lab");

    // Values should be plain strings (not objects)
    expect(typeof record["researcher-x"]).toBe("string");

    RuntimeOverrideAPI.clearAll();
  });
});

// ── 11. flattenRuntimeOverrides pure function ─────────────────────────────────

describe("12b-11: flattenRuntimeOverrides pure function", () => {
  it("converts RuntimeOverridesMap to plain Record<string, string>", async () => {
    const { flattenRuntimeOverrides } = await import("../use-runtime-room-override.js");

    const overridesMap = {
      "agent-1": { roomId: "room-a", reason: "Test", source: "test", appliedAt: 1000 },
      "agent-2": { roomId: "room-b", reason: "Test", source: "test", appliedAt: 2000 },
    };

    const flat = flattenRuntimeOverrides(overridesMap);
    expect(flat).toEqual({ "agent-1": "room-a", "agent-2": "room-b" });
  });

  it("returns empty object for empty map", async () => {
    const { flattenRuntimeOverrides } = await import("../use-runtime-room-override.js");
    expect(flattenRuntimeOverrides({})).toEqual({});
  });
});

// ── 12. applyRuntimeOverride: unknown agent ───────────────────────────────────

describe("12b-12: applyRuntimeOverride returns false for unknown agent", () => {
  it("does not call moveAgent and returns false", async () => {
    const { applyRuntimeOverride } = await import("../use-runtime-room-override.js");

    const moveAgent = vi.fn();
    const agents = {}; // Empty — no agents registered

    const result = applyRuntimeOverride("ghost-agent", "room-x", agents, moveAgent);

    expect(result).toBe(false);
    expect(moveAgent).not.toHaveBeenCalled();
  });
});

// ── 13. applyRuntimeOverride: moves known agent ───────────────────────────────

describe("12b-13: applyRuntimeOverride calls moveAgent when agent exists", () => {
  it("calls moveAgent and returns true", async () => {
    const { applyRuntimeOverride } = await import("../use-runtime-room-override.js");

    const moveAgent = vi.fn();
    const agents = {
      "researcher-1": {
        def: { agentId: "researcher-1", role: "researcher", capabilities: [] },
        roomId: "research-lab",
        status: "inactive",
        lifecycleState: "ready",
        isDynamic: false,
        localPosition: { x: 0, y: 0, z: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        spawnTs: 0,
        spawnIndex: 0,
      },
    };

    const result = applyRuntimeOverride(
      "researcher-1",
      "ops-control",
      agents as never,
      moveAgent,
    );

    expect(result).toBe(true);
    expect(moveAgent).toHaveBeenCalledWith("researcher-1", "ops-control");
  });
});

// ── 14. applyRuntimeOverride: no-op if already in target room ─────────────────

describe("12b-14: applyRuntimeOverride is no-op if agent already in target room", () => {
  it("does not call moveAgent and returns false", async () => {
    const { applyRuntimeOverride } = await import("../use-runtime-room-override.js");

    const moveAgent = vi.fn();
    const agents = {
      "researcher-1": {
        def: { agentId: "researcher-1", role: "researcher", capabilities: [] },
        roomId: "research-lab", // Already in the target room
        status: "inactive",
        lifecycleState: "ready",
        isDynamic: false,
        localPosition: { x: 0, y: 0, z: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        spawnTs: 0,
        spawnIndex: 0,
      },
    };

    // Agent is already in "research-lab" — override targets the same room
    const result = applyRuntimeOverride(
      "researcher-1",
      "research-lab",
      agents as never,
      moveAgent,
    );

    expect(result).toBe(false);
    expect(moveAgent).not.toHaveBeenCalled();
  });
});

// ── 15. revertToResolvedRoom: unknown agent ───────────────────────────────────

describe("12b-15: revertToResolvedRoom returns null for unknown agent", () => {
  it("does not call moveAgent and returns null", async () => {
    const { revertToResolvedRoom } = await import("../use-runtime-room-override.js");
    const { DEFAULT_ROOM_MAPPING } = await import("../../data/room-mapping-resolver.js");

    const moveAgent = vi.fn();
    const result = revertToResolvedRoom(
      "nonexistent-agent",
      {},
      DEFAULT_ROOM_MAPPING,
      {},
      moveAgent,
    );

    expect(result).toBeNull();
    expect(moveAgent).not.toHaveBeenCalled();
  });
});

// ── 16. revertToResolvedRoom: moves agent to resolved room ────────────────────

describe("12b-16: revertToResolvedRoom calls moveAgent when resolved room differs", () => {
  it("resolves via role mapping and calls moveAgent", async () => {
    const { revertToResolvedRoom } = await import("../use-runtime-room-override.js");
    const { DEFAULT_ROOM_MAPPING } = await import("../../data/room-mapping-resolver.js");

    const moveAgent = vi.fn();

    // Agent is currently in the wrong room (was overridden to ops-control)
    const agents = {
      "researcher-1": {
        def: { agentId: "researcher-1", role: "researcher", capabilities: [] },
        roomId: "ops-control",  // Was overridden here
        status: "inactive",
        lifecycleState: "ready",
        isDynamic: false,
        localPosition: { x: 0, y: 0, z: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        spawnTs: 0,
        spawnIndex: 0,
      },
    };

    // No remaining overrides — should resolve to role-based room (research-lab)
    const resolvedRoom = revertToResolvedRoom(
      "researcher-1",
      agents as never,
      DEFAULT_ROOM_MAPPING,
      {},
      moveAgent,
    );

    // researcher role maps to "research-lab" in DEFAULT_ROOM_MAPPING
    expect(resolvedRoom).toBe("research-lab");
    expect(moveAgent).toHaveBeenCalledWith("researcher-1", "research-lab");
  });
});

// ── 17. applyMappingToAgents respects runtime overrides ──────────────────────

describe("12b-17: applyMappingToAgents respects runtime overrides (highest priority)", () => {
  it("moves agent to override room even when role-based room differs", async () => {
    const { applyMappingToAgents } = await import("../use-room-mapping-hot-reload.js");
    const { DEFAULT_ROOM_MAPPING } = await import("../../data/room-mapping-resolver.js");

    const moveAgent = vi.fn();

    // Researcher's role room is "research-lab" but we override to "ops-control"
    const agents = {
      "researcher-1": {
        def: { agentId: "researcher-1", role: "researcher", capabilities: [] },
        roomId: "research-lab",  // Currently in role-based room
        status: "inactive",
        lifecycleState: "ready",
        isDynamic: false,
        localPosition: { x: 0, y: 0, z: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        spawnTs: 0,
        spawnIndex: 0,
      },
    };

    const runtimeOverrides = { "researcher-1": "ops-control" };

    const moved = applyMappingToAgents(
      DEFAULT_ROOM_MAPPING,
      agents as never,
      moveAgent,
      runtimeOverrides,
    );

    expect(moved).toBe(1);
    expect(moveAgent).toHaveBeenCalledWith("researcher-1", "ops-control");
  });
});

// ── 18. applyMappingToAgents without overrides uses role mapping ─────────────

describe("12b-18: applyMappingToAgents with empty overrides falls through to role", () => {
  it("uses role-based mapping when no overrides are provided", async () => {
    const { applyMappingToAgents } = await import("../use-room-mapping-hot-reload.js");
    const { DEFAULT_ROOM_MAPPING } = await import("../../data/room-mapping-resolver.js");

    const moveAgent = vi.fn();

    // Orchestrator is in wrong room — should be moved to ops-control
    const agents = {
      "orchestrator-1": {
        def: { agentId: "orchestrator-1", role: "orchestrator", capabilities: [] },
        roomId: "research-lab",  // Wrong room
        status: "inactive",
        lifecycleState: "ready",
        isDynamic: false,
        localPosition: { x: 0, y: 0, z: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        spawnTs: 0,
        spawnIndex: 0,
      },
    };

    const moved = applyMappingToAgents(
      DEFAULT_ROOM_MAPPING,
      agents as never,
      moveAgent,
      {},  // Empty overrides
    );

    expect(moved).toBe(1);
    // Orchestrator role maps to "ops-control"
    expect(moveAgent).toHaveBeenCalledWith("orchestrator-1", "ops-control");
  });
});

// ── 19. RuntimeOverrideAPI.get ───────────────────────────────────────────────

describe("12b-19: RuntimeOverrideAPI.get returns the current override entry", () => {
  it("returns the entry when set, undefined when not set", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    RuntimeOverrideAPI.clearAll();

    expect(RuntimeOverrideAPI.get("no-override")).toBeUndefined();

    RuntimeOverrideAPI.set("check-agent", "lab", "Get test", "test");
    const entry = RuntimeOverrideAPI.get("check-agent");

    expect(entry).toBeDefined();
    expect(entry!.roomId).toBe("lab");
    expect(entry!.reason).toBe("Get test");
    expect(entry!.source).toBe("test");

    RuntimeOverrideAPI.clear("check-agent");
  });
});

// ── 20. RuntimeOverrideAPI.has ───────────────────────────────────────────────

describe("12b-20: RuntimeOverrideAPI.has returns correct boolean", () => {
  it("returns false when no override and true when override exists", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    RuntimeOverrideAPI.clearAll();

    expect(RuntimeOverrideAPI.has("test-has-agent")).toBe(false);

    RuntimeOverrideAPI.set("test-has-agent", "archive", "Has test", "test");
    expect(RuntimeOverrideAPI.has("test-has-agent")).toBe(true);

    RuntimeOverrideAPI.clear("test-has-agent");
    expect(RuntimeOverrideAPI.has("test-has-agent")).toBe(false);
  });
});

// ── 21. Runtime overrides are volatile ───────────────────────────────────────

describe("12b-21: Runtime overrides are volatile (not in persistence layer)", () => {
  it("runtimeOverrides is not saved to localStorage", async () => {
    const { saveRoomMapping } = await import("../../store/room-mapping-persistence.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    RuntimeOverrideAPI.set("volatile-test", "room-x", "Volatile test", "test");

    // The persistence functions should not throw and should handle only RoomMappingConfig
    // (not runtime overrides). We verify by checking saveRoomMapping is only called
    // with the config (not with runtimeOverrides).
    const config = useRoomMappingStore.getState().config;

    // saveRoomMapping should work without errors on the config (sans overrides)
    expect(() => saveRoomMapping(config)).not.toThrow();

    // runtimeOverrides are present in the store but NOT in the config
    expect("runtimeOverrides" in config).toBe(false);

    RuntimeOverrideAPI.clear("volatile-test");
  });
});

// ── 22. Source field is stored ────────────────────────────────────────────────

describe("12b-22: Source field is stored on the override entry", () => {
  it("preserves the source string in the entry", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    RuntimeOverrideAPI.set("src-test", "room-a", "Source test", "command-file");
    const entry = RuntimeOverrideAPI.get("src-test");

    expect(entry!.source).toBe("command-file");

    RuntimeOverrideAPI.clear("src-test");
  });

  it("defaults source to 'programmatic' when not specified", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    RuntimeOverrideAPI.set("src-default", "room-a");
    const entry = RuntimeOverrideAPI.get("src-default");

    expect(entry!.source).toBe("programmatic");

    RuntimeOverrideAPI.clear("src-default");
  });
});

// ── 23. appliedAt timestamp ──────────────────────────────────────────────────

describe("12b-23: appliedAt timestamp is set when override is stored", () => {
  it("appliedAt is a positive number (epoch ms) close to Date.now()", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");

    const before = Date.now();
    RuntimeOverrideAPI.set("ts-test", "room-a", "Timestamp test", "test");
    const after = Date.now();

    const entry = RuntimeOverrideAPI.get("ts-test");
    expect(entry!.appliedAt).toBeGreaterThanOrEqual(before);
    expect(entry!.appliedAt).toBeLessThanOrEqual(after);

    RuntimeOverrideAPI.clear("ts-test");
  });
});

// ── 24. Multiple coexisting overrides ────────────────────────────────────────

describe("12b-24: Multiple overrides can coexist simultaneously", () => {
  it("all overrides are stored independently", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll();

    RuntimeOverrideAPI.set("multi-a", "room-1", "Multi A", "test");
    RuntimeOverrideAPI.set("multi-b", "room-2", "Multi B", "test");
    RuntimeOverrideAPI.set("multi-c", "room-3", "Multi C", "test");

    const overrides = useRoomMappingStore.getState().runtimeOverrides;
    expect(overrides["multi-a"].roomId).toBe("room-1");
    expect(overrides["multi-b"].roomId).toBe("room-2");
    expect(overrides["multi-c"].roomId).toBe("room-3");

    // Clearing one should not affect others
    RuntimeOverrideAPI.clear("multi-a");
    const after = useRoomMappingStore.getState().runtimeOverrides;
    expect(after["multi-a"]).toBeUndefined();
    expect(after["multi-b"].roomId).toBe("room-2");
    expect(after["multi-c"].roomId).toBe("room-3");

    RuntimeOverrideAPI.clearAll();
  });
});

// ── 25. resetToDefaults does NOT clear runtime overrides ─────────────────────

describe("12b-25: resetToDefaults does NOT clear runtime overrides", () => {
  it("config is reset but runtimeOverrides remain", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll();
    RuntimeOverrideAPI.set("persist-thru-reset", "special-room", "Should persist", "test");

    // Apply a role mapping change (creates a deviation)
    const store = useRoomMappingStore.getState();
    store.updateRoleMapping("researcher", "ops-control", "Test deviation");

    // Now reset
    useRoomMappingStore.getState().resetToDefaults();

    // Config is reset
    const stateAfter = useRoomMappingStore.getState();
    expect(stateAfter.config.roleDefaults.researcher.roomId).toBe("research-lab");

    // But runtime overrides are NOT cleared by resetToDefaults
    expect(stateAfter.runtimeOverrides["persist-thru-reset"]).toBeDefined();
    expect(stateAfter.runtimeOverrides["persist-thru-reset"].roomId).toBe("special-room");

    // Cleanup
    RuntimeOverrideAPI.clear("persist-thru-reset");
  });
});

// ── 26. Event payload includes from_room for replace scenario ────────────────

describe("12b-26: Override replace event records from_room correctly", () => {
  it("payload.from_room contains previous override room when replacing", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.set("replace-test", "room-alpha", "First", "test");
    RuntimeOverrideAPI.set("replace-test", "room-beta", "Second", "test");

    const events = useRoomMappingStore.getState().events;
    // Find the second set event
    const setEvents = events.filter(
      (e) => e.type === "mapping.runtime_override_set" && e.payload.entity_id === "replace-test",
    );
    const replaceEvent = setEvents[setEvents.length - 1];
    expect(replaceEvent.payload.from_room).toBe("room-alpha");
    expect(replaceEvent.payload.to_room).toBe("room-beta");

    RuntimeOverrideAPI.clear("replace-test");
  });
});

// ── 27. clearAll event records cleared entities list ─────────────────────────

describe("12b-27: clearAll event records cleared_entities array", () => {
  it("payload.cleared_entities contains all cleared entity ids", async () => {
    const { RuntimeOverrideAPI } = await import("../use-runtime-room-override.js");
    const { useRoomMappingStore } = await import("../../store/room-mapping-store.js");

    RuntimeOverrideAPI.clearAll();
    RuntimeOverrideAPI.set("entity-alpha", "r1", "test", "test");
    RuntimeOverrideAPI.set("entity-beta", "r2", "test", "test");

    RuntimeOverrideAPI.clearAll("Batch clear test");

    const events = useRoomMappingStore.getState().events;
    const clearAllEvent = events
      .filter((e) => e.type === "mapping.runtime_overrides_cleared")
      .slice(-1)[0];

    expect(clearAllEvent).toBeDefined();
    const entities = clearAllEvent.payload.cleared_entities as string[];
    expect(entities).toContain("entity-alpha");
    expect(entities).toContain("entity-beta");
  });
});
