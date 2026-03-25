/**
 * room-mapping-editor.test.ts — Unit tests for Sub-AC 12b room mapping editor.
 *
 * Validates that:
 *  1. addCapabilityFallback appends a new entry and emits mapping.capability_added
 *  2. addCapabilityFallback is a no-op if the capability already exists
 *  3. removeCapabilityFallback removes the entry and emits mapping.capability_removed
 *  4. removeCapabilityFallback is a no-op if capability not found
 *  5. reorderCapabilityFallback moves an entry up correctly
 *  6. reorderCapabilityFallback moves an entry down correctly
 *  7. reorderCapabilityFallback is a no-op for out-of-bounds indices
 *  8. reorderCapabilityFallback is a no-op for fromIndex === toIndex
 *  9. addSpecialAssignment appends a new entry and emits mapping.special_added
 * 10. addSpecialAssignment is a no-op if entityId already exists
 * 11. removeSpecialAssignment removes the entry and emits mapping.special_removed
 * 12. removeSpecialAssignment is a no-op if entityId not found
 * 13. All edit actions persist to localStorage via saveRoomMapping
 * 14. Event log grows correctly with each operation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRoomMappingStore } from "../room-mapping-store.js";
import type { RoomMappingConfig } from "../../data/room-mapping-resolver.js";
import { DEFAULT_ROOM_MAPPING } from "../../data/room-mapping-resolver.js";

// ── Mock localStorage ──────────────────────────────────────────────────────

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

// ── Reset helper ───────────────────────────────────────────────────────────

function resetStore() {
  localStorageMock.clear();
  localStorageMock.getItem.mockReturnValue(null);

  // Deep-clone defaults to avoid cross-test pollution
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
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("room-mapping-store — Sub-AC 12b editor controls", () => {
  beforeEach(resetStore);

  // ── 1. addCapabilityFallback ───────────────────────────────────────────────

  describe("addCapabilityFallback", () => {
    it("appends a new capability entry to capabilityFallbacks", () => {
      const { addCapabilityFallback, config } = useRoomMappingStore.getState();
      const initialCount = config.capabilityFallbacks.length;

      addCapabilityFallback("custom-analysis", "research-lab", "Custom analysis goes to lab");

      const updated = useRoomMappingStore.getState();
      expect(updated.config.capabilityFallbacks).toHaveLength(initialCount + 1);
      expect(updated.config.capabilityFallbacks.at(-1)).toMatchObject({
        capability: "custom-analysis",
        roomId: "research-lab",
        reason: "Custom analysis goes to lab",
      });
    });

    it("emits a mapping.capability_added event", () => {
      const { addCapabilityFallback } = useRoomMappingStore.getState();
      addCapabilityFallback("test-cap", "impl-office");

      const { events } = useRoomMappingStore.getState();
      const evt = events.find((e) => e.type === "mapping.capability_added");
      expect(evt).toBeDefined();
      expect(evt?.payload).toMatchObject({
        capability: "test-cap",
        room_id: "impl-office",
      });
    });

    it("is a no-op if the capability already exists", () => {
      const { addCapabilityFallback, config } = useRoomMappingStore.getState();
      const existingCapability = config.capabilityFallbacks[0].capability;
      const countBefore = config.capabilityFallbacks.length;

      addCapabilityFallback(existingCapability, "research-lab");

      const after = useRoomMappingStore.getState();
      expect(after.config.capabilityFallbacks).toHaveLength(countBefore);
      // No new event for capability_added
      const addedEvents = after.events.filter((e) => e.type === "mapping.capability_added");
      expect(addedEvents).toHaveLength(0);
    });

    it("updates lastSavedAt after adding", () => {
      const { addCapabilityFallback } = useRoomMappingStore.getState();
      addCapabilityFallback("new-cap", "ops-control");
      const { lastSavedAt } = useRoomMappingStore.getState();
      expect(lastSavedAt).not.toBeNull();
    });
  });

  // ── 2. removeCapabilityFallback ───────────────────────────────────────────

  describe("removeCapabilityFallback", () => {
    it("removes an existing capability entry", () => {
      const { removeCapabilityFallback, config } = useRoomMappingStore.getState();
      const capToRemove = config.capabilityFallbacks[0].capability;
      const countBefore = config.capabilityFallbacks.length;

      removeCapabilityFallback(capToRemove);

      const after = useRoomMappingStore.getState();
      expect(after.config.capabilityFallbacks).toHaveLength(countBefore - 1);
      expect(
        after.config.capabilityFallbacks.find((fb) => fb.capability === capToRemove),
      ).toBeUndefined();
    });

    it("emits a mapping.capability_removed event", () => {
      const { removeCapabilityFallback, config } = useRoomMappingStore.getState();
      const capToRemove = config.capabilityFallbacks[0].capability;

      removeCapabilityFallback(capToRemove);

      const { events } = useRoomMappingStore.getState();
      const evt = events.find((e) => e.type === "mapping.capability_removed");
      expect(evt).toBeDefined();
      expect(evt?.payload.capability).toBe(capToRemove);
    });

    it("is a no-op if capability is not found", () => {
      const { removeCapabilityFallback, config } = useRoomMappingStore.getState();
      const countBefore = config.capabilityFallbacks.length;

      removeCapabilityFallback("non-existent-capability");

      const after = useRoomMappingStore.getState();
      expect(after.config.capabilityFallbacks).toHaveLength(countBefore);
      const removedEvents = after.events.filter((e) => e.type === "mapping.capability_removed");
      expect(removedEvents).toHaveLength(0);
    });
  });

  // ── 3. reorderCapabilityFallback ──────────────────────────────────────────

  describe("reorderCapabilityFallback", () => {
    it("moves an entry up (fromIndex > toIndex)", () => {
      const { reorderCapabilityFallback, config } = useRoomMappingStore.getState();
      const secondCap = config.capabilityFallbacks[1].capability;

      reorderCapabilityFallback(1, 0);

      const afterReorder = useRoomMappingStore.getState();
      expect(afterReorder.config.capabilityFallbacks[0].capability).toBe(secondCap);
    });

    it("moves an entry down (fromIndex < toIndex)", () => {
      const { reorderCapabilityFallback, config } = useRoomMappingStore.getState();
      const firstCap = config.capabilityFallbacks[0].capability;
      const secondCap = config.capabilityFallbacks[1].capability;

      reorderCapabilityFallback(0, 1);

      const afterReorder = useRoomMappingStore.getState();
      expect(afterReorder.config.capabilityFallbacks[0].capability).toBe(secondCap);
      expect(afterReorder.config.capabilityFallbacks[1].capability).toBe(firstCap);
    });

    it("emits a mapping.capability_reordered event", () => {
      const { reorderCapabilityFallback } = useRoomMappingStore.getState();
      reorderCapabilityFallback(0, 2);

      const { events } = useRoomMappingStore.getState();
      const evt = events.find((e) => e.type === "mapping.capability_reordered");
      expect(evt).toBeDefined();
      expect(evt?.payload).toMatchObject({ from_index: 0, to_index: 2 });
    });

    it("is a no-op for fromIndex === toIndex", () => {
      const { reorderCapabilityFallback, config } = useRoomMappingStore.getState();
      const capsBefore = config.capabilityFallbacks.map((fb) => fb.capability);

      reorderCapabilityFallback(2, 2);

      const { config: after } = useRoomMappingStore.getState();
      expect(after.capabilityFallbacks.map((fb) => fb.capability)).toEqual(capsBefore);
    });

    it("is a no-op for out-of-bounds fromIndex", () => {
      const { reorderCapabilityFallback, config } = useRoomMappingStore.getState();
      const capsBefore = config.capabilityFallbacks.map((fb) => fb.capability);

      reorderCapabilityFallback(-1, 0);
      reorderCapabilityFallback(999, 0);

      const { config: after } = useRoomMappingStore.getState();
      expect(after.capabilityFallbacks.map((fb) => fb.capability)).toEqual(capsBefore);
    });
  });

  // ── 4. addSpecialAssignment ───────────────────────────────────────────────

  describe("addSpecialAssignment", () => {
    it("adds a new special entity assignment", () => {
      const { addSpecialAssignment } = useRoomMappingStore.getState();
      addSpecialAssignment("CI_BOT", "impl-office", "CI bot spawns in impl office");

      const { config } = useRoomMappingStore.getState();
      expect(config.special["CI_BOT"]).toMatchObject({
        roomId: "impl-office",
        reason: "CI bot spawns in impl office",
      });
    });

    it("emits a mapping.special_added event", () => {
      const { addSpecialAssignment } = useRoomMappingStore.getState();
      addSpecialAssignment("QA_BOT", "validation-office");

      const { events } = useRoomMappingStore.getState();
      const evt = events.find((e) => e.type === "mapping.special_added");
      expect(evt).toBeDefined();
      expect(evt?.payload).toMatchObject({
        entity_id: "QA_BOT",
        room_id: "validation-office",
      });
    });

    it("is a no-op if entityId already exists", () => {
      const { addSpecialAssignment, config } = useRoomMappingStore.getState();
      const existingEntity = Object.keys(config.special)[0];
      const existingRoom = config.special[existingEntity].roomId;

      addSpecialAssignment(existingEntity, "research-lab");

      const after = useRoomMappingStore.getState();
      // Room should NOT have changed
      expect(after.config.special[existingEntity].roomId).toBe(existingRoom);
      const addedEvents = after.events.filter((e) => e.type === "mapping.special_added");
      expect(addedEvents).toHaveLength(0);
    });

    it("updates lastSavedAt after adding", () => {
      const { addSpecialAssignment } = useRoomMappingStore.getState();
      addSpecialAssignment("NEW_AGENT", "ops-control");
      const { lastSavedAt } = useRoomMappingStore.getState();
      expect(lastSavedAt).not.toBeNull();
    });
  });

  // ── 5. removeSpecialAssignment ────────────────────────────────────────────

  describe("removeSpecialAssignment", () => {
    it("removes an existing special entity assignment", () => {
      const { removeSpecialAssignment, config } = useRoomMappingStore.getState();
      const entityToRemove = Object.keys(config.special)[0];

      removeSpecialAssignment(entityToRemove);

      const { config: after } = useRoomMappingStore.getState();
      expect(after.special[entityToRemove]).toBeUndefined();
    });

    it("emits a mapping.special_removed event", () => {
      const { removeSpecialAssignment, config } = useRoomMappingStore.getState();
      const entityToRemove = Object.keys(config.special)[0];

      removeSpecialAssignment(entityToRemove);

      const { events } = useRoomMappingStore.getState();
      const evt = events.find((e) => e.type === "mapping.special_removed");
      expect(evt).toBeDefined();
      expect(evt?.payload.entity_id).toBe(entityToRemove);
    });

    it("is a no-op if entityId is not found", () => {
      const { removeSpecialAssignment, config } = useRoomMappingStore.getState();
      const specialBefore = { ...config.special };

      removeSpecialAssignment("NON_EXISTENT_ENTITY");

      const afterState = useRoomMappingStore.getState();
      expect(Object.keys(afterState.config.special)).toEqual(Object.keys(specialBefore));
      const removedEvents = afterState.events.filter((e) => e.type === "mapping.special_removed");
      expect(removedEvents).toHaveLength(0);
    });
  });

  // ── 6. Event log growth ───────────────────────────────────────────────────

  describe("event log accumulation", () => {
    it("event log grows with each operation", () => {
      const store = useRoomMappingStore.getState();

      store.addCapabilityFallback("cap-a", "impl-office");
      store.addCapabilityFallback("cap-b", "research-lab");
      store.removeCapabilityFallback("cap-a");
      store.reorderCapabilityFallback(0, 1);
      store.addSpecialAssignment("BOT_X", "ops-control");
      store.removeSpecialAssignment("BOT_X");

      const { events } = useRoomMappingStore.getState();
      expect(events).toHaveLength(6);

      const types = events.map((e) => e.type);
      expect(types).toContain("mapping.capability_added");
      expect(types).toContain("mapping.capability_removed");
      expect(types).toContain("mapping.capability_reordered");
      expect(types).toContain("mapping.special_added");
      expect(types).toContain("mapping.special_removed");
    });

    it("each event has a unique id, type, ts, and payload", () => {
      const { addCapabilityFallback } = useRoomMappingStore.getState();
      addCapabilityFallback("cap-1", "impl-office");
      addCapabilityFallback("cap-2", "research-lab");

      const { events } = useRoomMappingStore.getState();
      const ids = events.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique

      events.forEach((e) => {
        expect(e.id).toBeTruthy();
        expect(e.type).toBeTruthy();
        expect(e.ts).toBeGreaterThan(0);
        expect(e.payload).toBeDefined();
      });
    });
  });

  // ── 7. Persistence integration ────────────────────────────────────────────

  describe("persistence", () => {
    it("calls saveRoomMapping (localStorage.setItem) on addCapabilityFallback", () => {
      const { addCapabilityFallback } = useRoomMappingStore.getState();
      localStorageMock.setItem.mockClear();

      addCapabilityFallback("persisted-cap", "research-lab");

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it("calls saveRoomMapping on removeCapabilityFallback", () => {
      const { removeCapabilityFallback, config } = useRoomMappingStore.getState();
      const cap = config.capabilityFallbacks[0].capability;
      localStorageMock.setItem.mockClear();

      removeCapabilityFallback(cap);

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it("calls saveRoomMapping on addSpecialAssignment", () => {
      const { addSpecialAssignment } = useRoomMappingStore.getState();
      localStorageMock.setItem.mockClear();

      addSpecialAssignment("PERSIST_TEST", "ops-control");

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it("calls saveRoomMapping on removeSpecialAssignment", () => {
      const { removeSpecialAssignment, config } = useRoomMappingStore.getState();
      const entity = Object.keys(config.special)[0];
      localStorageMock.setItem.mockClear();

      removeSpecialAssignment(entity);

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });
});
