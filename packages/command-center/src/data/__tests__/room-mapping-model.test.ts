/**
 * room-mapping-model.test.ts — Unit tests for Sub-AC 12a runtime mapping model.
 *
 * Covers:
 *   1.  computeAssignments flattens roles into the assignment map
 *   2.  computeAssignments flattens capability fallbacks (with correct index)
 *   3.  computeAssignments includes special entities
 *   4.  computeAssignments includes the global fallback entry
 *   5.  getDefaultAssignments returns the DEFAULT_ROOM_MAPPING flattened (memoized)
 *   6.  detectDeviations returns empty array when config matches defaults
 *   7.  detectDeviations detects a role deviation
 *   8.  detectDeviations detects a capability deviation
 *   9.  detectDeviations detects a special entity deviation
 *  10.  detectDeviations detects a fallback room deviation
 *  11.  detectDeviations does NOT report entries absent from current (structural removal)
 *  12.  buildRoomMappingSnapshot: hasDeviations is false for default config
 *  13.  buildRoomMappingSnapshot: hasDeviations is true after a role change
 *  14.  buildRoomMappingSnapshot: counts.deviatedRoles increments correctly
 *  15.  buildRoomMappingSnapshot: counts.fallbackDeviated is true when fallback changed
 *  16.  buildRoomMappingSnapshot: computedAt is an ISO string
 *  17.  buildRoomMappingSnapshot: configSchemaVersion matches input config
 *  18.  Store snapshot resets to zero deviations after resetToDefaults
 *  19.  Store snapshot detects deviation immediately after updateRoleMapping
 *  20.  getAssignmentsForRoom returns entries whose roomId matches
 *  21.  getDeviationsForRoom returns deviations involving the room
 *  22.  getRoleAssignments returns only role entries sorted by priority
 *  23.  getCapabilityAssignments returns capability entries sorted by index
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  computeAssignments,
  getDefaultAssignments,
  detectDeviations,
  buildRoomMappingSnapshot,
  getAssignmentsForRoom,
  getDeviationsForRoom,
  getRoleAssignments,
  getCapabilityAssignments,
} from "../room-mapping-model.js";
import {
  DEFAULT_ROOM_MAPPING,
  type RoomMappingConfig,
} from "../room-mapping-resolver.js";
import { useRoomMappingStore } from "../../store/room-mapping-store.js";

// ── localStorage mock (required by the store module) ──────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deep-clone DEFAULT_ROOM_MAPPING to avoid mutating the constant. */
function cloneDefaults(): RoomMappingConfig {
  return {
    ...DEFAULT_ROOM_MAPPING,
    roleDefaults: { ...DEFAULT_ROOM_MAPPING.roleDefaults },
    capabilityFallbacks: DEFAULT_ROOM_MAPPING.capabilityFallbacks.map((fb) => ({ ...fb })),
    special: { ...DEFAULT_ROOM_MAPPING.special },
  };
}

/** Reset store to pristine defaults before each test. */
function resetStore() {
  localStorageMock.clear();
  localStorageMock.getItem.mockReturnValue(null);
  useRoomMappingStore.setState({
    config: cloneDefaults(),
    snapshot: buildRoomMappingSnapshot(cloneDefaults()),
    events: [],
    isPanelOpen: false,
    persistenceSource: "defaults",
    lastSavedAt: null,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("room-mapping-model — computeAssignments", () => {
  it("1. includes all roles from roleDefaults", () => {
    const config = cloneDefaults();
    const assignments = computeAssignments(config);

    const roleKeys = Object.keys(config.roleDefaults);
    for (const role of roleKeys) {
      expect(assignments[role]).toBeDefined();
      expect(assignments[role].kind).toBe("role");
      expect(assignments[role].roomId).toBe(config.roleDefaults[role as keyof typeof config.roleDefaults].roomId);
    }
  });

  it("2. includes capability fallbacks with correct index", () => {
    const config = cloneDefaults();
    const assignments = computeAssignments(config);

    for (let i = 0; i < config.capabilityFallbacks.length; i++) {
      const fb = config.capabilityFallbacks[i];
      const key = `cap:${fb.capability}`;
      expect(assignments[key]).toBeDefined();
      expect(assignments[key].kind).toBe("capability");
      expect(assignments[key].roomId).toBe(fb.roomId);
      expect(assignments[key].capabilityIndex).toBe(i);
    }
  });

  it("3. includes special entity entries", () => {
    const config = cloneDefaults();
    const assignments = computeAssignments(config);

    for (const [entityId, special] of Object.entries(config.special)) {
      const key = `special:${entityId}`;
      expect(assignments[key]).toBeDefined();
      expect(assignments[key].kind).toBe("special");
      expect(assignments[key].roomId).toBe(special.roomId);
    }
  });

  it("4. includes the global fallback entry", () => {
    const config = cloneDefaults();
    const assignments = computeAssignments(config);

    expect(assignments["fallback"]).toBeDefined();
    expect(assignments["fallback"].kind).toBe("fallback");
    expect(assignments["fallback"].roomId).toBe(config.fallbackRoom);
  });
});

describe("room-mapping-model — getDefaultAssignments", () => {
  it("5. returns flat map of DEFAULT_ROOM_MAPPING (memoized)", () => {
    const defaults1 = getDefaultAssignments();
    const defaults2 = getDefaultAssignments();

    // Referential equality — memoized
    expect(defaults1).toBe(defaults2);

    // Content matches DEFAULT_ROOM_MAPPING
    for (const [role, mapping] of Object.entries(DEFAULT_ROOM_MAPPING.roleDefaults)) {
      expect(defaults1[role]?.roomId).toBe(mapping.roomId);
    }
    expect(defaults1["fallback"]?.roomId).toBe(DEFAULT_ROOM_MAPPING.fallbackRoom);
  });
});

describe("room-mapping-model — detectDeviations", () => {
  it("6. returns empty array when config matches defaults", () => {
    const config = cloneDefaults();
    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    expect(deviations).toHaveLength(0);
  });

  it("7. detects a role deviation", () => {
    const config = cloneDefaults();
    config.roleDefaults.orchestrator = {
      roomId: "research-lab", // changed from ops-control
      priority: 1,
      reason: "Test override",
    };

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    expect(deviations).toHaveLength(1);
    const dev = deviations[0];
    expect(dev.key).toBe("orchestrator");
    expect(dev.kind).toBe("role");
    expect(dev.defaultRoomId).toBe("ops-control");
    expect(dev.currentRoomId).toBe("research-lab");
    expect(dev.label).toBe("Role: orchestrator");
  });

  it("8. detects a capability deviation", () => {
    const config = cloneDefaults();
    // Change first capability's room
    const firstCap = config.capabilityFallbacks[0];
    const originalRoom = firstCap.roomId;
    firstCap.roomId = "ops-control"; // override

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    const capDeviation = deviations.find(
      (d) => d.key === `cap:${firstCap.capability}`,
    );
    expect(capDeviation).toBeDefined();
    expect(capDeviation!.kind).toBe("capability");
    expect(capDeviation!.defaultRoomId).toBe(originalRoom);
    expect(capDeviation!.currentRoomId).toBe("ops-control");
    expect(capDeviation!.label).toBe(`Capability: ${firstCap.capability}`);
  });

  it("9. detects a special entity deviation", () => {
    const config = cloneDefaults();
    config.special["USER"] = { roomId: "research-lab", reason: "Test" }; // changed from project-main

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    const specialDev = deviations.find((d) => d.key === "special:USER");
    expect(specialDev).toBeDefined();
    expect(specialDev!.kind).toBe("special");
    expect(specialDev!.defaultRoomId).toBe("project-main");
    expect(specialDev!.currentRoomId).toBe("research-lab");
    expect(specialDev!.label).toBe("Special: USER");
  });

  it("10. detects a fallback room deviation", () => {
    const config = cloneDefaults();
    config.fallbackRoom = "ops-control"; // changed from project-main

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    const fallbackDev = deviations.find((d) => d.key === "fallback");
    expect(fallbackDev).toBeDefined();
    expect(fallbackDev!.kind).toBe("fallback");
    expect(fallbackDev!.defaultRoomId).toBe("project-main");
    expect(fallbackDev!.currentRoomId).toBe("ops-control");
    expect(fallbackDev!.label).toBe("Global fallback room");
  });

  it("11. does NOT report entries absent from current (structural removal)", () => {
    const config = cloneDefaults();
    // Remove a capability from the current config (structural removal — not a deviation)
    config.capabilityFallbacks = config.capabilityFallbacks.slice(1);

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    // The removed entry should NOT appear in deviations
    // (It's a structural change, visible from assignments map directly)
    const removedCap = DEFAULT_ROOM_MAPPING.capabilityFallbacks[0].capability;
    const removedDev = deviations.find(
      (d) => d.key === `cap:${removedCap}`,
    );
    expect(removedDev).toBeUndefined();
  });
});

describe("room-mapping-model — buildRoomMappingSnapshot", () => {
  it("12. hasDeviations is false for default config", () => {
    const snapshot = buildRoomMappingSnapshot(cloneDefaults());
    expect(snapshot.hasDeviations).toBe(false);
    expect(snapshot.deviations).toHaveLength(0);
  });

  it("13. hasDeviations is true after a role change", () => {
    const config = cloneDefaults();
    config.roleDefaults.implementer = {
      roomId: "research-lab",
      priority: 1,
      reason: "Moved",
    };

    const snapshot = buildRoomMappingSnapshot(config);
    expect(snapshot.hasDeviations).toBe(true);
    expect(snapshot.deviations).toHaveLength(1);
  });

  it("14. counts.deviatedRoles increments for each deviated role", () => {
    const config = cloneDefaults();
    config.roleDefaults.orchestrator = { roomId: "research-lab", priority: 1, reason: "x" };
    config.roleDefaults.implementer  = { roomId: "ops-control",  priority: 1, reason: "y" };

    const snapshot = buildRoomMappingSnapshot(config);
    expect(snapshot.counts.deviatedRoles).toBe(2);
    expect(snapshot.counts.deviatedCapabilities).toBe(0);
    expect(snapshot.counts.deviatedSpecials).toBe(0);
    expect(snapshot.counts.fallbackDeviated).toBe(false);
  });

  it("15. counts.fallbackDeviated is true when fallback room changed", () => {
    const config = cloneDefaults();
    config.fallbackRoom = "ops-control";

    const snapshot = buildRoomMappingSnapshot(config);
    expect(snapshot.counts.fallbackDeviated).toBe(true);
  });

  it("16. computedAt is a valid ISO string", () => {
    const snapshot = buildRoomMappingSnapshot(cloneDefaults());
    expect(() => new Date(snapshot.computedAt)).not.toThrow();
    expect(new Date(snapshot.computedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it("17. configSchemaVersion matches the input config's schemaVersion", () => {
    const config = cloneDefaults();
    config.schemaVersion = 42; // arbitrary version
    const snapshot = buildRoomMappingSnapshot(config);
    expect(snapshot.configSchemaVersion).toBe(42);
  });

  it("counts.totalAssignments reflects roles + caps + specials + fallback", () => {
    const config = cloneDefaults();
    const assignments = computeAssignments(config);
    const snapshot = buildRoomMappingSnapshot(config);

    const expected = Object.keys(assignments).length;
    expect(snapshot.counts.totalAssignments).toBe(expected);
  });

  it("currentAssignments and defaultAssignments share the same key set for default config", () => {
    const snapshot = buildRoomMappingSnapshot(cloneDefaults());
    const currentKeys = Object.keys(snapshot.currentAssignments).sort();
    const defaultKeys = Object.keys(snapshot.defaultAssignments).sort();
    expect(currentKeys).toEqual(defaultKeys);
  });
});

describe("room-mapping-store — snapshot integration", () => {
  beforeEach(resetStore);

  it("18. store snapshot has zero deviations after resetToDefaults", () => {
    // First introduce a deviation
    const { updateRoleMapping, resetToDefaults } = useRoomMappingStore.getState();
    updateRoleMapping("orchestrator", "research-lab");

    let { snapshot } = useRoomMappingStore.getState();
    expect(snapshot.hasDeviations).toBe(true);

    // Now reset
    resetToDefaults();

    snapshot = useRoomMappingStore.getState().snapshot;
    expect(snapshot.hasDeviations).toBe(false);
    expect(snapshot.deviations).toHaveLength(0);
  });

  it("19. store snapshot detects deviation immediately after updateRoleMapping", () => {
    const { updateRoleMapping } = useRoomMappingStore.getState();

    updateRoleMapping("researcher", "ops-control", "test");

    const { snapshot } = useRoomMappingStore.getState();
    expect(snapshot.hasDeviations).toBe(true);

    const dev = snapshot.deviations.find((d) => d.key === "researcher");
    expect(dev).toBeDefined();
    expect(dev!.defaultRoomId).toBe("research-lab");
    expect(dev!.currentRoomId).toBe("ops-control");
  });

  it("snapshot is populated on initial store load (startup)", () => {
    const { snapshot } = useRoomMappingStore.getState();
    // Snapshot should be defined and have content
    expect(snapshot).toBeDefined();
    expect(snapshot.currentAssignments).toBeDefined();
    expect(snapshot.defaultAssignments).toBeDefined();
    expect(Object.keys(snapshot.currentAssignments).length).toBeGreaterThan(0);
  });

  it("snapshot updates when capability fallback changes", () => {
    const { updateCapabilityFallback } = useRoomMappingStore.getState();
    const firstCap = DEFAULT_ROOM_MAPPING.capabilityFallbacks[0];

    updateCapabilityFallback(firstCap.capability, "ops-control");

    const { snapshot } = useRoomMappingStore.getState();
    expect(snapshot.hasDeviations).toBe(true);
    expect(snapshot.counts.deviatedCapabilities).toBe(1);
  });

  it("snapshot updates when fallback room changes via setFallbackRoom", () => {
    const { setFallbackRoom } = useRoomMappingStore.getState();

    setFallbackRoom("impl-office");

    const { snapshot } = useRoomMappingStore.getState();
    expect(snapshot.counts.fallbackDeviated).toBe(true);
  });
});

describe("room-mapping-model — query helpers", () => {
  it("20. getAssignmentsForRoom returns entries whose roomId matches", () => {
    const assignments = computeAssignments(cloneDefaults());
    const opsEntries = getAssignmentsForRoom("ops-control", assignments);

    // ops-control should have orchestrator + planner roles, plus SYSTEM special,
    // plus several capability entries pointing there
    expect(opsEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of opsEntries) {
      expect(entry.roomId).toBe("ops-control");
    }
  });

  it("21. getDeviationsForRoom returns deviations involving the room", () => {
    const config = cloneDefaults();
    config.roleDefaults.orchestrator = { roomId: "research-lab", priority: 1, reason: "x" };

    const current = computeAssignments(config);
    const deviations = detectDeviations(current);

    // ops-control is the defaultRoomId for orchestrator (now deviated away)
    const opsDeviations = getDeviationsForRoom("ops-control", deviations);
    expect(opsDeviations.length).toBeGreaterThanOrEqual(1);
    expect(opsDeviations.some((d) => d.key === "orchestrator")).toBe(true);

    // research-lab is the currentRoomId (deviated target)
    const labDeviations = getDeviationsForRoom("research-lab", deviations);
    expect(labDeviations.some((d) => d.key === "orchestrator")).toBe(true);
  });

  it("22. getRoleAssignments returns only role entries sorted by priority", () => {
    const assignments = computeAssignments(cloneDefaults());
    const roles = getRoleAssignments(assignments);

    expect(roles.length).toBe(Object.keys(DEFAULT_ROOM_MAPPING.roleDefaults).length);
    roles.forEach((r) => expect(r.kind).toBe("role"));

    // Sorted by priority (ascending)
    for (let i = 1; i < roles.length; i++) {
      expect((roles[i].priority ?? 99)).toBeGreaterThanOrEqual((roles[i - 1].priority ?? 99));
    }
  });

  it("23. getCapabilityAssignments returns capability entries sorted by index", () => {
    const assignments = computeAssignments(cloneDefaults());
    const caps = getCapabilityAssignments(assignments);

    expect(caps.length).toBe(DEFAULT_ROOM_MAPPING.capabilityFallbacks.length);
    caps.forEach((c) => expect(c.kind).toBe("capability"));

    // Sorted by capabilityIndex (ascending)
    for (let i = 1; i < caps.length; i++) {
      expect((caps[i].capabilityIndex ?? 0)).toBeGreaterThanOrEqual(
        (caps[i - 1].capabilityIndex ?? 0),
      );
    }
  });
});
