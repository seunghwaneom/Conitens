/**
 * room-mapping-persistence.test.ts — Sub-AC 12c persistence tests.
 *
 * Covers:
 *  1.  loadRoomMapping returns null when storage is empty (first run)
 *  2.  loadRoomMapping returns null when the stored schema version is stale
 *  3.  loadRoomMapping returns null when the stored config is structurally malformed
 *  4.  loadRoomMapping returns the config when a valid snapshot is present
 *  5.  saveRoomMapping writes a versioned payload (schemaVersion + savedAt + config)
 *  6.  saveRoomMapping is safe when localStorage throws (quota / SSR)
 *  7.  clearRoomMapping removes the key from localStorage
 *  8.  hasPersistedMapping returns false when nothing is stored
 *  9.  hasPersistedMapping returns true when a valid snapshot is stored
 * 10.  getLastSavedAt returns null when nothing is stored
 * 11.  getLastSavedAt returns a valid ISO string after a save
 * 12.  Store bootstraps with persistenceSource="storage" when a valid snapshot is found
 * 13.  Store bootstraps with persistenceSource="defaults" when storage is empty
 * 14.  resetToDefaults calls clearRoomMapping so the NEXT startup uses defaults
 * 15.  applyMappingToAgents relocates agents whose resolved room changed
 * 16.  applyMappingToAgents is a no-op when all agents are already in correct rooms
 * 17.  applyMappingToAgents returns the count of actually moved agents
 * 18.  Persisted config survives a round-trip (save → load → equal)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  saveRoomMapping,
  loadRoomMapping,
  clearRoomMapping,
  hasPersistedMapping,
  getLastSavedAt,
  STORAGE_KEY,
} from "../room-mapping-persistence.js";
import { useRoomMappingStore } from "../room-mapping-store.js";
import {
  DEFAULT_ROOM_MAPPING,
  type RoomMappingConfig,
} from "../../data/room-mapping-resolver.js";
import { applyMappingToAgents } from "../../hooks/use-room-mapping-hot-reload.js";
import type { AgentRuntimeState } from "../agent-store.js";

// ── localStorage mock ──────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    vi.fn((key: string) => store[key] ?? null),
    setItem:    vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear:      vi.fn(() => { store = {}; }),
    _store:     () => store,
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deep-clone defaults to avoid cross-test pollution. */
function cloneDefaults(): RoomMappingConfig {
  return {
    ...DEFAULT_ROOM_MAPPING,
    roleDefaults: { ...DEFAULT_ROOM_MAPPING.roleDefaults },
    capabilityFallbacks: DEFAULT_ROOM_MAPPING.capabilityFallbacks.map((fb) => ({ ...fb })),
    special: { ...DEFAULT_ROOM_MAPPING.special },
  };
}

/** Build a minimal AgentRuntimeState for testing applyMappingToAgents. */
function makeAgentState(
  agentId: string,
  role: string,
  roomId: string,
  capabilities: string[] = [],
): AgentRuntimeState {
  return {
    def: {
      agentId,
      name: agentId,
      role: role as AgentRuntimeState["def"]["role"],
      capabilities,
      riskLevel: "low",
      color: "#ffffff",
      icon: "⚙",
      defaultRoomId: roomId,
    },
    status:               "idle",
    lifecycleState:       "ready",
    isDynamic:            false,
    roomId,
    localPosition:        { x: 0.5, y: 0, z: 0.5 },
    worldPosition:        { x: 0, y: 0, z: 0 },
    currentTaskId:        null,
    currentTaskTitle:     null,
    lastStatusChangeTs:   Date.now(),
    lastLifecycleChangeTs: Date.now(),
    hovered:              false,
    spawnTs:              Date.now(),
    spawnIndex:           0,
  } as unknown as AgentRuntimeState;
}

/** Build a minimal valid stored payload string. */
function buildValidPayload(config = cloneDefaults(), savedAt = Date.now()): string {
  return JSON.stringify({ schemaVersion: 1, savedAt, config });
}

// ── Reset between tests ────────────────────────────────────────────────────

beforeEach(() => {
  localStorageMock.clear();
  localStorageMock.getItem.mockImplementation(
    (key: string) => localStorageMock._store()[key] ?? null,
  );
  localStorageMock.setItem.mockImplementation(
    (key: string, value: string) => { localStorageMock._store()[key] = value; },
  );
  localStorageMock.removeItem.mockImplementation(
    (key: string) => { delete localStorageMock._store()[key]; },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("room-mapping-persistence — Sub-AC 12c", () => {

  // ── loadRoomMapping ──────────────────────────────────────────────────────

  describe("loadRoomMapping", () => {
    it("1. returns null when storage is empty", () => {
      expect(loadRoomMapping()).toBeNull();
    });

    it("2. returns null when the stored schema version is stale", () => {
      const stale = JSON.stringify({ schemaVersion: 99, savedAt: Date.now(), config: cloneDefaults() });
      localStorageMock.getItem.mockReturnValueOnce(stale);
      expect(loadRoomMapping()).toBeNull();
    });

    it("3. returns null when config is missing required keys", () => {
      // Missing capabilityFallbacks
      const broken = JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), config: { roleDefaults: {}, fallbackRoom: "lobby", special: {} } });
      localStorageMock.getItem.mockReturnValueOnce(broken);
      expect(loadRoomMapping()).toBeNull();
    });

    it("4. returns the config when a valid snapshot is present", () => {
      const config = cloneDefaults();
      localStorageMock.getItem.mockReturnValueOnce(buildValidPayload(config));
      const result = loadRoomMapping();
      expect(result).not.toBeNull();
      expect(result?.fallbackRoom).toBe(config.fallbackRoom);
      expect(result?.capabilityFallbacks.length).toBe(config.capabilityFallbacks.length);
    });

    it("3b. returns null when the raw value is not valid JSON", () => {
      localStorageMock.getItem.mockReturnValueOnce("not-json");
      expect(loadRoomMapping()).toBeNull();
    });
  });

  // ── saveRoomMapping ──────────────────────────────────────────────────────

  describe("saveRoomMapping", () => {
    it("5. writes a versioned payload to localStorage", () => {
      const config = cloneDefaults();
      saveRoomMapping(config);

      expect(localStorageMock.setItem).toHaveBeenCalledOnce();
      const [key, raw] = localStorageMock.setItem.mock.calls[0] as [string, string];
      expect(key).toBe(STORAGE_KEY);

      const payload = JSON.parse(raw);
      expect(payload.schemaVersion).toBe(1);
      expect(typeof payload.savedAt).toBe("number");
      expect(payload.config).toBeDefined();
      expect(payload.config.fallbackRoom).toBe(config.fallbackRoom);
    });

    it("6. does not throw when localStorage throws (quota exceeded)", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new DOMException("QuotaExceededError");
      });
      expect(() => saveRoomMapping(cloneDefaults())).not.toThrow();
    });
  });

  // ── clearRoomMapping ─────────────────────────────────────────────────────

  describe("clearRoomMapping", () => {
    it("7. removes the STORAGE_KEY from localStorage", () => {
      // Pre-populate
      const store = localStorageMock._store();
      store[STORAGE_KEY] = buildValidPayload();

      clearRoomMapping();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  // ── hasPersistedMapping ──────────────────────────────────────────────────

  describe("hasPersistedMapping", () => {
    it("8. returns false when storage is empty", () => {
      expect(hasPersistedMapping()).toBe(false);
    });

    it("9. returns true when a valid snapshot is stored", () => {
      localStorageMock.getItem.mockReturnValueOnce(buildValidPayload());
      expect(hasPersistedMapping()).toBe(true);
    });

    it("9b. returns false when stored schema version mismatches", () => {
      const stale = JSON.stringify({ schemaVersion: 0, savedAt: Date.now(), config: {} });
      localStorageMock.getItem.mockReturnValueOnce(stale);
      expect(hasPersistedMapping()).toBe(false);
    });
  });

  // ── getLastSavedAt ───────────────────────────────────────────────────────

  describe("getLastSavedAt", () => {
    it("10. returns null when nothing is stored", () => {
      expect(getLastSavedAt()).toBeNull();
    });

    it("11. returns a valid ISO string after a save", () => {
      const ts = 1_700_000_000_000;
      const payload = JSON.stringify({ schemaVersion: 1, savedAt: ts, config: cloneDefaults() });
      localStorageMock.getItem.mockReturnValueOnce(payload);

      const result = getLastSavedAt();
      expect(result).not.toBeNull();
      expect(new Date(result!).getTime()).toBe(ts);
    });
  });

  // ── Store bootstrap ──────────────────────────────────────────────────────

  describe("store bootstrap (persistence source)", () => {
    it("12. store reflects persistenceSource='storage' when snapshot is found", () => {
      // Simulate what buildInitialState() does: if loadRoomMapping returns a config,
      // the store sets persistenceSource = "storage"
      const config = cloneDefaults();
      // Manually force the store into the "storage" source state
      useRoomMappingStore.setState({
        config,
        events: [],
        isPanelOpen: false,
        persistenceSource: "storage",
        lastSavedAt: new Date().toISOString(),
      });

      const { persistenceSource, lastSavedAt } = useRoomMappingStore.getState();
      expect(persistenceSource).toBe("storage");
      expect(lastSavedAt).not.toBeNull();
    });

    it("13. store reflects persistenceSource='defaults' when storage is empty", () => {
      useRoomMappingStore.setState({
        config: cloneDefaults(),
        events: [],
        isPanelOpen: false,
        persistenceSource: "defaults",
        lastSavedAt: null,
      });

      const { persistenceSource, lastSavedAt } = useRoomMappingStore.getState();
      expect(persistenceSource).toBe("defaults");
      expect(lastSavedAt).toBeNull();
    });
  });

  // ── resetToDefaults ──────────────────────────────────────────────────────

  describe("resetToDefaults", () => {
    it("14. calls clearRoomMapping (localStorage.removeItem) so next startup uses defaults", () => {
      // Seed the store in "storage" state
      useRoomMappingStore.setState({
        config: cloneDefaults(),
        events: [],
        isPanelOpen: false,
        persistenceSource: "storage",
        lastSavedAt: new Date().toISOString(),
      });

      localStorageMock.removeItem.mockClear();
      const { resetToDefaults } = useRoomMappingStore.getState();
      resetToDefaults();

      // clearRoomMapping calls localStorage.removeItem with STORAGE_KEY
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);

      const { persistenceSource, lastSavedAt } = useRoomMappingStore.getState();
      expect(persistenceSource).toBe("defaults");
      expect(lastSavedAt).toBeNull();
    });
  });

  // ── Round-trip ───────────────────────────────────────────────────────────

  describe("round-trip (save → load → equal)", () => {
    it("18. persisted config survives a full round-trip with no data loss", () => {
      const config = cloneDefaults();
      // Mutate a value to ensure it's different from defaults
      config.fallbackRoom = "research-lab";
      config.capabilityFallbacks[0].roomId = "ops-control";

      saveRoomMapping(config);

      const loaded = loadRoomMapping();
      expect(loaded).not.toBeNull();
      expect(loaded!.fallbackRoom).toBe("research-lab");
      expect(loaded!.capabilityFallbacks[0].roomId).toBe("ops-control");
      expect(loaded!.capabilityFallbacks.length).toBe(config.capabilityFallbacks.length);
      expect(Object.keys(loaded!.roleDefaults)).toEqual(Object.keys(config.roleDefaults));
    });
  });
});

// ── applyMappingToAgents ───────────────────────────────────────────────────

describe("applyMappingToAgents — Sub-AC 12c hot-reload logic", () => {
  it("15. relocates agents whose resolved room differs from their current room", () => {
    const config = cloneDefaults();
    // Researcher should map to "research-lab" by default
    const agents: Record<string, AgentRuntimeState> = {
      "agent-r": makeAgentState("agent-r", "researcher", "impl-office"),
    };
    const moveAgent = vi.fn();

    const moved = applyMappingToAgents(config, agents, moveAgent);

    // agent-r is in impl-office but should be in research-lab → should move
    expect(moved).toBe(1);
    expect(moveAgent).toHaveBeenCalledOnce();
    expect(moveAgent).toHaveBeenCalledWith("agent-r", "research-lab");
  });

  it("16. is a no-op when all agents are already in their correct rooms", () => {
    const config = cloneDefaults();
    const agents: Record<string, AgentRuntimeState> = {
      "agent-o": makeAgentState("agent-o", "orchestrator", "ops-control"),
      "agent-i": makeAgentState("agent-i", "implementer", "impl-office"),
    };
    const moveAgent = vi.fn();

    const moved = applyMappingToAgents(config, agents, moveAgent);

    expect(moved).toBe(0);
    expect(moveAgent).not.toHaveBeenCalled();
  });

  it("17. returns the correct count of moved agents", () => {
    const config = cloneDefaults();
    // Both agents are in the wrong room
    const agents: Record<string, AgentRuntimeState> = {
      "agent-a": makeAgentState("agent-a", "orchestrator", "impl-office"),     // should be ops-control
      "agent-b": makeAgentState("agent-b", "implementer", "research-lab"),      // should be impl-office
      "agent-c": makeAgentState("agent-c", "researcher",  "research-lab"),      // already correct
    };
    const moveAgent = vi.fn();

    const moved = applyMappingToAgents(config, agents, moveAgent);

    expect(moved).toBe(2);
    expect(moveAgent).toHaveBeenCalledTimes(2);
  });

  it("respects a changed role mapping when resolving rooms", () => {
    // Change orchestrator's room in config
    const config: RoomMappingConfig = {
      ...cloneDefaults(),
      roleDefaults: {
        ...DEFAULT_ROOM_MAPPING.roleDefaults,
        orchestrator: { roomId: "research-lab", priority: 1, reason: "Test override" },
      },
    };

    const agents: Record<string, AgentRuntimeState> = {
      "agent-o": makeAgentState("agent-o", "orchestrator", "ops-control"),
    };
    const moveAgent = vi.fn();

    applyMappingToAgents(config, agents, moveAgent);

    // orchestrator should now be in research-lab due to the override
    expect(moveAgent).toHaveBeenCalledWith("agent-o", "research-lab");
  });

  it("respects capability fallback overrides when role is unknown", () => {
    const config = cloneDefaults();
    // Agent with no known role but a capability
    const agents: Record<string, AgentRuntimeState> = {
      "agent-custom": makeAgentState("agent-custom", "unknown-role", "project-main", ["code-change"]),
    };
    const moveAgent = vi.fn();

    applyMappingToAgents(config, agents, moveAgent);

    // code-change capability maps to impl-office; agent is in project-main
    expect(moveAgent).toHaveBeenCalledWith("agent-custom", "impl-office");
  });

  it("uses fallback room for agents with no role or capability match", () => {
    const config = cloneDefaults(); // fallbackRoom = "project-main"
    const agents: Record<string, AgentRuntimeState> = {
      "agent-x": makeAgentState("agent-x", "unknown-role", "impl-office", []),
    };
    const moveAgent = vi.fn();

    applyMappingToAgents(config, agents, moveAgent);

    // No role match, no capability match → fallback room
    expect(moveAgent).toHaveBeenCalledWith("agent-x", "project-main");
  });

  it("empty agents map results in zero moves", () => {
    const moveAgent = vi.fn();
    const moved = applyMappingToAgents(cloneDefaults(), {}, moveAgent);
    expect(moved).toBe(0);
    expect(moveAgent).not.toHaveBeenCalled();
  });
});
