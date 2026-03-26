/**
 * use-room-mapping-api.test.ts — Unit tests for Sub-AC 12 / AC-2.
 *
 * Validates that room mapping data is accessible and mutable via the
 * control-plane interface (REST API + reactive Zustand store).
 *
 * Coverage matrix
 * ───────────────
 *
 * Module shape
 *   api-1   Module exports expected symbols (useRoomMappingApi, RoomMappingApiClient)
 *   api-2   RoomMappingApiClient exposes all required methods
 *
 * Read access (synchronous store accessors — no HTTP required)
 *   api-3   RoomMappingApiClient.getConfig returns current RoomMappingConfig
 *   api-4   getConfig includes roleDefaults with at least the core roles
 *   api-5   getConfig includes capabilityFallbacks array
 *   api-6   getConfig includes fallbackRoom string
 *   api-7   getConfig includes special assignments map
 *   api-8   RoomMappingApiClient.getRuntimeOverrides returns flat Record<string, string>
 *   api-9   getRuntimeOverrides returns empty object when no overrides are active
 *   api-10  RoomMappingApiClient.getEventLog returns the append-only event array
 *   api-11  RoomMappingApiClient.getSnapshot returns snapshot with expected shape
 *
 * Optimistic store writes (no backend required — HTTP calls are async side-effects)
 *   api-12  updateRole performs optimistic store mutation (no HTTP)
 *   api-13  addCapabilityFallback performs optimistic store mutation
 *   api-14  updateCapabilityFallback performs optimistic store mutation
 *   api-15  removeCapabilityFallback performs optimistic store mutation
 *   api-16  reorderCapabilityFallback performs optimistic store mutation
 *   api-17  addSpecialAssignment performs optimistic store mutation
 *   api-18  updateSpecialAssignment performs optimistic store mutation
 *   api-19  removeSpecialAssignment performs optimistic store mutation
 *   api-20  setFallbackRoom performs optimistic store mutation
 *   api-21  resetToDefaults performs optimistic store reset
 *   api-22  setRuntimeOverride performs optimistic store mutation
 *   api-23  clearRuntimeOverride performs optimistic store mutation
 *   api-24  clearAllRuntimeOverrides performs optimistic store mutation
 *
 * Event sourcing
 *   api-25  Each write appends a corresponding event to the event log
 *   api-26  updateRole emits mapping.role_updated event
 *   api-27  addCapabilityFallback emits mapping.capability_added event
 *   api-28  removeCapabilityFallback emits mapping.capability_removed event
 *   api-29  setRuntimeOverride emits mapping.runtime_override_set event
 *   api-30  clearRuntimeOverride emits mapping.runtime_override_cleared event
 *
 * Defaults accessibility
 *   api-31  DEFAULT_ROOM_MAPPING is accessible via getConfig when no overrides applied
 *   api-32  All 8 AgentRole values are present in roleDefaults
 *
 * Mutation safety
 *   api-33  Multiple successive writes accumulate in the event log without data loss
 *   api-34  updateRole is a no-op when the roomId has not changed
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRoomMappingStore }     from "../../store/room-mapping-store.js";
import { DEFAULT_ROOM_MAPPING }   from "../../data/room-mapping-resolver.js";
import type { RoomMappingConfig } from "../../data/room-mapping-resolver.js";

// ── Mock fetch (prevent actual HTTP calls) ─────────────────────────────────────

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: false,                    // Backend "unavailable" by default
  status: 503,
  json: () => Promise.resolve({}),
}));

// ── Mock localStorage ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// ── Store reset helper ────────────────────────────────────────────────────────

function resetStore() {
  localStorageMock.clear();
  localStorageMock.getItem.mockReturnValue(null);

  const freshConfig: RoomMappingConfig = {
    ...DEFAULT_ROOM_MAPPING,
    roleDefaults: { ...DEFAULT_ROOM_MAPPING.roleDefaults },
    capabilityFallbacks: DEFAULT_ROOM_MAPPING.capabilityFallbacks.map((fb) => ({ ...fb })),
    special: { ...DEFAULT_ROOM_MAPPING.special },
  };

  useRoomMappingStore.setState({
    config: freshConfig,
    events: [],
    isPanelOpen: false,
    persistenceSource: "defaults",
    lastSavedAt: null,
    runtimeOverrides: {},
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// api-1: Module exports
// ══════════════════════════════════════════════════════════════════════════════

describe("api-1: Module exports expected symbols", () => {
  it("exports useRoomMappingApi as a function", async () => {
    const mod = await import("../use-room-mapping-api.js");
    expect(typeof mod.useRoomMappingApi).toBe("function");
  });

  it("exports RoomMappingApiClient as an object", async () => {
    const mod = await import("../use-room-mapping-api.js");
    expect(typeof mod.RoomMappingApiClient).toBe("object");
    expect(mod.RoomMappingApiClient).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-2: RoomMappingApiClient method shape
// ══════════════════════════════════════════════════════════════════════════════

describe("api-2: RoomMappingApiClient exposes required methods", () => {
  it("has all read accessors", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    expect(typeof RoomMappingApiClient.fetchConfig).toBe("function");
    expect(typeof RoomMappingApiClient.getConfig).toBe("function");
    expect(typeof RoomMappingApiClient.getRuntimeOverrides).toBe("function");
    expect(typeof RoomMappingApiClient.getEventLog).toBe("function");
    expect(typeof RoomMappingApiClient.getSnapshot).toBe("function");
  });

  it("has all write methods", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    expect(typeof RoomMappingApiClient.updateRole).toBe("function");
    expect(typeof RoomMappingApiClient.addCapabilityFallback).toBe("function");
    expect(typeof RoomMappingApiClient.updateCapabilityFallback).toBe("function");
    expect(typeof RoomMappingApiClient.removeCapabilityFallback).toBe("function");
    expect(typeof RoomMappingApiClient.reorderCapabilityFallback).toBe("function");
    expect(typeof RoomMappingApiClient.addSpecialAssignment).toBe("function");
    expect(typeof RoomMappingApiClient.updateSpecialAssignment).toBe("function");
    expect(typeof RoomMappingApiClient.removeSpecialAssignment).toBe("function");
    expect(typeof RoomMappingApiClient.setFallbackRoom).toBe("function");
    expect(typeof RoomMappingApiClient.resetToDefaults).toBe("function");
    expect(typeof RoomMappingApiClient.setRuntimeOverride).toBe("function");
    expect(typeof RoomMappingApiClient.clearRuntimeOverride).toBe("function");
    expect(typeof RoomMappingApiClient.clearAllRuntimeOverrides).toBe("function");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-3 to api-11: Read access (synchronous store accessors)
// ══════════════════════════════════════════════════════════════════════════════

describe("api-3: RoomMappingApiClient.getConfig returns current config", () => {
  beforeEach(resetStore);

  it("returns a valid RoomMappingConfig object", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
    expect(config.schemaVersion).toBeGreaterThan(0);
  });
});

describe("api-4: getConfig includes roleDefaults with core roles", () => {
  beforeEach(resetStore);

  it("roleDefaults contains at least orchestrator, implementer, researcher", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    expect(config.roleDefaults.orchestrator).toBeDefined();
    expect(config.roleDefaults.implementer).toBeDefined();
    expect(config.roleDefaults.researcher).toBeDefined();
    expect(config.roleDefaults.orchestrator.roomId).toBeTruthy();
  });
});

describe("api-5: getConfig includes capabilityFallbacks array", () => {
  beforeEach(resetStore);

  it("capabilityFallbacks is a non-empty array", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    expect(Array.isArray(config.capabilityFallbacks)).toBe(true);
    expect(config.capabilityFallbacks.length).toBeGreaterThan(0);

    // Each entry has the expected shape
    const first = config.capabilityFallbacks[0];
    expect(typeof first.capability).toBe("string");
    expect(typeof first.roomId).toBe("string");
    expect(typeof first.reason).toBe("string");
  });
});

describe("api-6: getConfig includes fallbackRoom string", () => {
  beforeEach(resetStore);

  it("fallbackRoom is a non-empty string", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    expect(typeof config.fallbackRoom).toBe("string");
    expect(config.fallbackRoom.length).toBeGreaterThan(0);
  });
});

describe("api-7: getConfig includes special assignments map", () => {
  beforeEach(resetStore);

  it("special is a non-null object", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    expect(config.special).toBeDefined();
    expect(typeof config.special).toBe("object");
  });
});

describe("api-8: getRuntimeOverrides returns flat Record<string, string>", () => {
  beforeEach(resetStore);

  it("returns a plain object with string values", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Set a couple of overrides
    useRoomMappingStore.getState().setRuntimeOverride("researcher-1", "ops-control", "Test", "test");
    useRoomMappingStore.getState().setRuntimeOverride("implementer-2", "research-lab", "Test", "test");

    const overrides = RoomMappingApiClient.getRuntimeOverrides();
    expect(overrides["researcher-1"]).toBe("ops-control");
    expect(overrides["implementer-2"]).toBe("research-lab");

    // Values should be plain strings
    expect(typeof overrides["researcher-1"]).toBe("string");
  });
});

describe("api-9: getRuntimeOverrides returns empty object when no overrides", () => {
  beforeEach(resetStore);

  it("returns empty object when runtimeOverrides is empty", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    useRoomMappingStore.getState().clearAllRuntimeOverrides();
    const overrides = RoomMappingApiClient.getRuntimeOverrides();
    expect(Object.keys(overrides).length).toBe(0);
  });
});

describe("api-10: RoomMappingApiClient.getEventLog returns event array", () => {
  beforeEach(resetStore);

  it("returns an array (may be empty on fresh store)", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const log = RoomMappingApiClient.getEventLog();
    expect(Array.isArray(log)).toBe(true);
  });

  it("event log grows after a mutation", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const before = RoomMappingApiClient.getEventLog().length;

    useRoomMappingStore.getState().updateRoleMapping("researcher", "ops-control");

    const after = RoomMappingApiClient.getEventLog().length;
    expect(after).toBe(before + 1);
  });
});

describe("api-11: RoomMappingApiClient.getSnapshot returns snapshot with expected shape", () => {
  beforeEach(resetStore);

  it("snapshot has currentAssignments, defaultAssignments, deviations, hasDeviations, counts", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const snap = RoomMappingApiClient.getSnapshot();

    expect(snap).toBeDefined();
    expect(snap.currentAssignments).toBeDefined();
    expect(snap.defaultAssignments).toBeDefined();
    expect(Array.isArray(snap.deviations)).toBe(true);
    expect(typeof snap.hasDeviations).toBe("boolean");
    expect(snap.counts).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-12 to api-24: Optimistic store writes
// ══════════════════════════════════════════════════════════════════════════════

describe("api-12: updateRole performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("changes the roleDefaults entry in the store immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    const before = useRoomMappingStore.getState().config.roleDefaults.researcher.roomId;
    expect(before).toBe("research-lab");

    // Fire and forget — the API call will fail (mock) but store should update
    void RoomMappingApiClient.updateRole("researcher", "ops-control", "Test");

    // Store is updated synchronously (optimistic)
    const after = useRoomMappingStore.getState().config.roleDefaults.researcher.roomId;
    expect(after).toBe("ops-control");
  });
});

describe("api-13: addCapabilityFallback performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("appends new capability to capabilityFallbacks", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    const before = useRoomMappingStore.getState().config.capabilityFallbacks.length;
    void RoomMappingApiClient.addCapabilityFallback("api-test-capability", "impl-office");
    const after = useRoomMappingStore.getState().config.capabilityFallbacks.length;

    expect(after).toBe(before + 1);
    const last = useRoomMappingStore.getState().config.capabilityFallbacks.at(-1);
    expect(last?.capability).toBe("api-test-capability");
    expect(last?.roomId).toBe("impl-office");
  });
});

describe("api-14: updateCapabilityFallback performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("updates existing capability room immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Use the first existing capability
    const existing = useRoomMappingStore.getState().config.capabilityFallbacks[0];
    const cap = existing.capability;

    void RoomMappingApiClient.updateCapabilityFallback(cap, "research-lab");

    const updated = useRoomMappingStore.getState().config.capabilityFallbacks.find(
      (fb) => fb.capability === cap,
    );
    expect(updated?.roomId).toBe("research-lab");
  });
});

describe("api-15: removeCapabilityFallback performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("removes capability from capabilityFallbacks immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Add one first
    useRoomMappingStore.getState().addCapabilityFallback("remove-test-cap", "impl-office");
    const before = useRoomMappingStore.getState().config.capabilityFallbacks.length;

    void RoomMappingApiClient.removeCapabilityFallback("remove-test-cap");

    const after = useRoomMappingStore.getState().config.capabilityFallbacks.length;
    expect(after).toBe(before - 1);
    expect(
      useRoomMappingStore.getState().config.capabilityFallbacks.find(
        (fb) => fb.capability === "remove-test-cap",
      ),
    ).toBeUndefined();
  });
});

describe("api-16: reorderCapabilityFallback performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("moves capability from index 0 to index 1", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    const firstBefore = useRoomMappingStore.getState().config.capabilityFallbacks[0].capability;
    const secondBefore = useRoomMappingStore.getState().config.capabilityFallbacks[1].capability;

    void RoomMappingApiClient.reorderCapabilityFallback(0, 1);

    const firstAfter = useRoomMappingStore.getState().config.capabilityFallbacks[0].capability;
    expect(firstAfter).toBe(secondBefore);
    const secondAfter = useRoomMappingStore.getState().config.capabilityFallbacks[1].capability;
    expect(secondAfter).toBe(firstBefore);
  });
});

describe("api-17: addSpecialAssignment performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("adds new special entity assignment immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    void RoomMappingApiClient.addSpecialAssignment("API_TEST_BOT", "research-lab", "API test");

    const special = useRoomMappingStore.getState().config.special["API_TEST_BOT"];
    expect(special).toBeDefined();
    expect(special.roomId).toBe("research-lab");
  });
});

describe("api-18: updateSpecialAssignment performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("updates special entity assignment immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Get the first existing special entity
    const existingEntity = Object.keys(useRoomMappingStore.getState().config.special)[0];

    void RoomMappingApiClient.updateSpecialAssignment(existingEntity, "research-lab", "Updated via API");

    const after = useRoomMappingStore.getState().config.special[existingEntity];
    expect(after.roomId).toBe("research-lab");
  });
});

describe("api-19: removeSpecialAssignment performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("removes special entity assignment immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Add one first
    useRoomMappingStore.getState().addSpecialAssignment("REMOVE_TEST_BOT", "impl-office");
    expect(useRoomMappingStore.getState().config.special["REMOVE_TEST_BOT"]).toBeDefined();

    void RoomMappingApiClient.removeSpecialAssignment("REMOVE_TEST_BOT");

    expect(useRoomMappingStore.getState().config.special["REMOVE_TEST_BOT"]).toBeUndefined();
  });
});

describe("api-20: setFallbackRoom performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("updates fallbackRoom immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    const before = useRoomMappingStore.getState().config.fallbackRoom;
    const newFallback = before === "project-main" ? "ops-control" : "project-main";

    void RoomMappingApiClient.setFallbackRoom(newFallback, "API test");

    expect(useRoomMappingStore.getState().config.fallbackRoom).toBe(newFallback);
  });
});

describe("api-21: resetToDefaults performs optimistic store reset", () => {
  beforeEach(resetStore);

  it("restores default role mappings immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Mutate first
    useRoomMappingStore.getState().updateRoleMapping("researcher", "ops-control", "Deviated");
    expect(useRoomMappingStore.getState().config.roleDefaults.researcher.roomId).toBe("ops-control");

    // Reset via API client
    void RoomMappingApiClient.resetToDefaults();

    // Store should be back to default synchronously
    expect(useRoomMappingStore.getState().config.roleDefaults.researcher.roomId).toBe("research-lab");
  });
});

describe("api-22: setRuntimeOverride performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("adds runtime override immediately with correct fields", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    void RoomMappingApiClient.setRuntimeOverride("agent-x", "lab-room", "Override test", "api");

    const override = useRoomMappingStore.getState().runtimeOverrides["agent-x"];
    expect(override).toBeDefined();
    expect(override.roomId).toBe("lab-room");
    expect(override.source).toBe("api");

    useRoomMappingStore.getState().clearRuntimeOverride("agent-x");
  });
});

describe("api-23: clearRuntimeOverride performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("removes runtime override immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    useRoomMappingStore.getState().setRuntimeOverride("agent-y", "lab-room", "Pre-clear", "test");
    expect(useRoomMappingStore.getState().runtimeOverrides["agent-y"]).toBeDefined();

    void RoomMappingApiClient.clearRuntimeOverride("agent-y");

    expect(useRoomMappingStore.getState().runtimeOverrides["agent-y"]).toBeUndefined();
  });
});

describe("api-24: clearAllRuntimeOverrides performs optimistic store mutation", () => {
  beforeEach(resetStore);

  it("removes all runtime overrides immediately", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    useRoomMappingStore.getState().setRuntimeOverride("agent-a", "room-1", "Test", "test");
    useRoomMappingStore.getState().setRuntimeOverride("agent-b", "room-2", "Test", "test");

    void RoomMappingApiClient.clearAllRuntimeOverrides("Clear all test");

    expect(Object.keys(useRoomMappingStore.getState().runtimeOverrides).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-25 to api-30: Event sourcing
// ══════════════════════════════════════════════════════════════════════════════

describe("api-25: Each write appends a corresponding event to the event log", () => {
  beforeEach(resetStore);

  it("event log grows after updateRole", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const before = useRoomMappingStore.getState().events.length;
    void RoomMappingApiClient.updateRole("researcher", "ops-control");
    expect(useRoomMappingStore.getState().events.length).toBe(before + 1);
  });

  it("event log grows after addCapabilityFallback", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const before = useRoomMappingStore.getState().events.length;
    void RoomMappingApiClient.addCapabilityFallback("event-log-test-cap", "impl-office");
    expect(useRoomMappingStore.getState().events.length).toBe(before + 1);
  });
});

describe("api-26: updateRole emits mapping.role_updated event", () => {
  beforeEach(resetStore);

  it("event type is mapping.role_updated with correct payload", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    void RoomMappingApiClient.updateRole("validator", "research-lab", "Moved for analysis");

    const events = useRoomMappingStore.getState().events;
    const evt = events.find((e) => e.type === "mapping.role_updated");
    expect(evt).toBeDefined();
    expect(evt?.payload.role).toBe("validator");
    expect(evt?.payload.to_room).toBe("research-lab");
    expect(evt?.payload.reason).toContain("Moved for analysis");
  });
});

describe("api-27: addCapabilityFallback emits mapping.capability_added event", () => {
  beforeEach(resetStore);

  it("event type is mapping.capability_added with correct payload", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    void RoomMappingApiClient.addCapabilityFallback("event-cap-test", "validation-office");

    const events = useRoomMappingStore.getState().events;
    const evt = events.find((e) => e.type === "mapping.capability_added");
    expect(evt).toBeDefined();
    expect(evt?.payload.capability).toBe("event-cap-test");
    expect(evt?.payload.room_id).toBe("validation-office");
  });
});

describe("api-28: removeCapabilityFallback emits mapping.capability_removed event", () => {
  beforeEach(resetStore);

  it("event type is mapping.capability_removed with correct payload", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    // Add then remove
    useRoomMappingStore.getState().addCapabilityFallback("remove-event-cap", "impl-office");
    const countBefore = useRoomMappingStore.getState().events.length;

    void RoomMappingApiClient.removeCapabilityFallback("remove-event-cap");

    const events = useRoomMappingStore.getState().events;
    expect(events.length).toBe(countBefore + 1);
    const evt = events.find((e) => e.type === "mapping.capability_removed");
    expect(evt).toBeDefined();
    expect(evt?.payload.capability).toBe("remove-event-cap");
  });
});

describe("api-29: setRuntimeOverride emits mapping.runtime_override_set event", () => {
  beforeEach(resetStore);

  it("event type is mapping.runtime_override_set with entity_id and to_room", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    void RoomMappingApiClient.setRuntimeOverride("event-test-agent", "ops-control", "Event test", "api");

    const events = useRoomMappingStore.getState().events;
    const evt = events.find(
      (e) => e.type === "mapping.runtime_override_set" &&
             e.payload.entity_id === "event-test-agent",
    );
    expect(evt).toBeDefined();
    expect(evt?.payload.to_room).toBe("ops-control");
    expect(evt?.payload.source).toBe("api");

    useRoomMappingStore.getState().clearRuntimeOverride("event-test-agent");
  });
});

describe("api-30: clearRuntimeOverride emits mapping.runtime_override_cleared event", () => {
  beforeEach(resetStore);

  it("event type is mapping.runtime_override_cleared with entity_id", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    useRoomMappingStore.getState().setRuntimeOverride("clear-event-agent", "lab-room", "Pre-clear", "test");
    const eventsBefore = useRoomMappingStore.getState().events.length;

    void RoomMappingApiClient.clearRuntimeOverride("clear-event-agent");

    const events = useRoomMappingStore.getState().events;
    expect(events.length).toBe(eventsBefore + 1);
    const evt = events[events.length - 1];
    expect(evt.type).toBe("mapping.runtime_override_cleared");
    expect(evt.payload.entity_id).toBe("clear-event-agent");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-31 to api-32: Defaults accessibility
// ══════════════════════════════════════════════════════════════════════════════

describe("api-31: DEFAULT_ROOM_MAPPING is accessible via getConfig when no overrides applied", () => {
  beforeEach(resetStore);

  it("getConfig matches DEFAULT_ROOM_MAPPING after reset", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();

    // Role defaults should match defaults
    expect(config.roleDefaults.orchestrator.roomId).toBe(
      DEFAULT_ROOM_MAPPING.roleDefaults.orchestrator.roomId,
    );
    expect(config.roleDefaults.implementer.roomId).toBe(
      DEFAULT_ROOM_MAPPING.roleDefaults.implementer.roomId,
    );
    expect(config.fallbackRoom).toBe(DEFAULT_ROOM_MAPPING.fallbackRoom);
  });
});

describe("api-32: All 8 AgentRole values present in roleDefaults", () => {
  beforeEach(resetStore);

  it("roleDefaults has entries for all 8 roles", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const config = RoomMappingApiClient.getConfig();
    const expectedRoles = [
      "orchestrator", "implementer", "researcher", "validator",
      "reviewer", "planner", "analyst", "tester",
    ];
    for (const role of expectedRoles) {
      expect(config.roleDefaults[role as never]).toBeDefined();
      expect(typeof config.roleDefaults[role as never].roomId).toBe("string");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// api-33 to api-34: Mutation safety
// ══════════════════════════════════════════════════════════════════════════════

describe("api-33: Multiple successive writes accumulate in event log without data loss", () => {
  beforeEach(resetStore);

  it("event log contains all events from multiple writes", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");
    const before = useRoomMappingStore.getState().events.length;

    void RoomMappingApiClient.updateRole("researcher", "ops-control");
    void RoomMappingApiClient.addCapabilityFallback("multi-write-cap", "impl-office");
    void RoomMappingApiClient.setRuntimeOverride("multi-agent", "lab-room", "Multi test", "test");

    const after = useRoomMappingStore.getState().events.length;
    expect(after).toBe(before + 3);

    const types = useRoomMappingStore.getState().events.map((e) => e.type);
    expect(types).toContain("mapping.role_updated");
    expect(types).toContain("mapping.capability_added");
    expect(types).toContain("mapping.runtime_override_set");

    useRoomMappingStore.getState().clearRuntimeOverride("multi-agent");
  });
});

describe("api-34: updateRole is a no-op when the roomId has not changed", () => {
  beforeEach(resetStore);

  it("does not emit a new event when calling updateRole with same roomId", async () => {
    const { RoomMappingApiClient } = await import("../use-room-mapping-api.js");

    const currentRoom = useRoomMappingStore.getState().config.roleDefaults.researcher.roomId;
    const before = useRoomMappingStore.getState().events.length;

    // Same roomId — should be a no-op
    void RoomMappingApiClient.updateRole("researcher", currentRoom);

    const after = useRoomMappingStore.getState().events.length;
    expect(after).toBe(before); // No new event
  });
});
