/**
 * room-mapping-store.ts — Zustand store for live room mapping configuration.
 *
 * Manages the runtime role→room and capability→room mapping config.
 * All mutations are event-sourced for full replay and audit capability.
 *
 * The store exposes:
 *   - `config`            – current live RoomMappingConfig
 *   - `snapshot`          – computed in-memory mapping model (Sub-AC 12a)
 *                            includes currentAssignments, defaultAssignments,
 *                            deviations, hasDeviations, and counts
 *   - `events`            – append-only log of all mapping changes
 *   - `isPanelOpen`       – HUD panel visibility flag
 *   - `persistenceSource` – where the initial config was loaded from
 *   - `lastSavedAt`       – ISO timestamp of the most recent localStorage save
 *   - actions to update/reset mappings and toggle the panel
 *
 * Persistence (Sub-AC 3):
 *   - On init, `loadRoomMapping()` is called first.  If a valid persisted
 *     snapshot is found it overrides DEFAULT_ROOM_MAPPING, and a
 *     `mapping.loaded_from_storage` event is appended.
 *   - Every mutation calls `saveRoomMapping()` to keep localStorage in sync.
 *   - `resetToDefaults` calls `clearRoomMapping()` so the next page load
 *     starts clean from compiled defaults.
 *
 * Integration points:
 *   - RoomMappingPanel reads this store and calls its actions
 *   - Panel also calls agent-store.moveAgent when role mappings change
 *   - Panel calls spatial-store.highlightRoom on hover for 3D feedback
 */
import { create } from "zustand";
import {
  DEFAULT_ROOM_MAPPING,
  type RoomMappingConfig,
  type AgentRole,
} from "../data/room-mapping-resolver.js";
import {
  buildRoomMappingSnapshot,
  type RoomMappingSnapshot,
} from "../data/room-mapping-model.js";
// Re-export the snapshot type so consumers can import it from the store
export type { RoomMappingSnapshot };
import {
  loadRoomMapping,
  saveRoomMapping,
  clearRoomMapping,
  getLastSavedAt,
} from "./room-mapping-persistence.js";

// ── Event Types ────────────────────────────────────────────────────

export type RoomMappingEventType =
  | "mapping.loaded_from_storage"     // Config restored from localStorage on startup
  | "mapping.role_updated"            // A role's target room changed
  | "mapping.capability_updated"      // A capability fallback's room changed
  | "mapping.capability_added"        // A new capability fallback entry was added
  | "mapping.capability_removed"      // A capability fallback entry was removed
  | "mapping.capability_reordered"    // Capability fallbacks were reordered
  | "mapping.special_updated"         // A special-entity room changed
  | "mapping.special_added"           // A new special-entity assignment was added
  | "mapping.special_removed"         // A special-entity assignment was removed
  | "mapping.fallback_updated"        // The global fallback room changed
  | "mapping.reset"                   // All mappings reset to defaults
  // ── Sub-AC 12b: Runtime overrides ────────────────────────────────
  | "mapping.runtime_override_set"    // A per-entity runtime room override was applied
  | "mapping.runtime_override_cleared" // A per-entity runtime override was removed
  | "mapping.runtime_overrides_cleared"; // All runtime overrides were removed

// ── Runtime Override Types ──────────────────────────────────────────

/**
 * A single runtime room override for a specific entity (agent or special entity).
 * Runtime overrides take priority over all other resolution paths (role, capability,
 * special, fallback) and are NOT persisted to localStorage — they are volatile
 * session-only assignments designed for programmatic use-cases such as:
 *   - Test scenarios that need deterministic agent placement
 *   - Automated workflows that temporarily route agents to specific rooms
 *   - Command-file ingestion that overrides placement at runtime
 *
 * The `source` field records who/what applied the override for auditability.
 */
export interface RuntimeOverrideEntry {
  /** The room this entity has been assigned to at runtime */
  roomId: string;
  /** Human-readable reason for the override */
  reason: string;
  /** Who / what set this override ("user", "command", "test", etc.) */
  source: string;
  /** Epoch ms when this override was applied */
  appliedAt: number;
}

/**
 * Flat map of all active runtime overrides, keyed by entityId.
 * entityId may be an agentId ("researcher-1") or a special entity id ("USER").
 */
export type RuntimeOverridesMap = Record<string, RuntimeOverrideEntry>;

export interface RoomMappingEvent {
  id: string;
  type: RoomMappingEventType;
  ts: number;
  payload: Record<string, unknown>;
}

/** Where the initial config was sourced from. */
export type PersistenceSource = "defaults" | "storage";

// ── Store Shape ────────────────────────────────────────────────────

interface RoomMappingStoreState {
  /** Current live room mapping configuration */
  config: RoomMappingConfig;
  /**
   * Computed snapshot of the runtime mapping model.
   *
   * Recomputed on every mutation via `buildRoomMappingSnapshot(config)`.
   * Exposes:
   *   - `currentAssignments`  – flat map of all live role/cap/special/fallback → room
   *   - `defaultAssignments`  – flat map of the compiled-in DEFAULT_ROOM_MAPPING
   *   - `deviations`          – entries where current ≠ default
   *   - `hasDeviations`       – boolean flag for quick conditional rendering
   *   - `counts`              – summary counts for badge indicators
   */
  snapshot: RoomMappingSnapshot;
  /** Append-only audit log of all mapping mutations */
  events: RoomMappingEvent[];
  /** Whether the room mapping panel is open in the HUD */
  isPanelOpen: boolean;
  /**
   * Tracks where the initial config was loaded from on this session.
   *   "defaults"  – no persisted snapshot found; using DEFAULT_ROOM_MAPPING
   *   "storage"   – persisted snapshot found in localStorage and applied
   */
  persistenceSource: PersistenceSource;
  /** ISO timestamp of the most recent localStorage save, or null */
  lastSavedAt: string | null;

  // ── Sub-AC 12b: Runtime overrides (volatile, session-only) ────────

  /**
   * Per-entity runtime room overrides.
   *
   * These are the HIGHEST priority assignments — they override role defaults,
   * capability fallbacks, special assignments, and the global fallback.
   * Applied during room resolution via `resolveAgentRoom(agent, runtimeOverrides, config)`.
   *
   * Runtime overrides are:
   *   - Volatile: NOT persisted to localStorage (cleared on page reload)
   *   - Immediate: change takes effect synchronously when set
   *   - Auditable: every set/clear is recorded in the events log
   *
   * Key: entityId (agentId or special entity id)
   * Value: RuntimeOverrideEntry with roomId, reason, source, appliedAt
   */
  runtimeOverrides: RuntimeOverridesMap;

  // ── Actions ──────────────────────────────────────────────────────
  /** Change the target room for a role */
  updateRoleMapping: (role: AgentRole, roomId: string, reason?: string) => void;
  /** Change the target room for a capability fallback */
  updateCapabilityFallback: (capability: string, roomId: string, reason?: string) => void;
  /** Change the room for a special entity (USER, SYSTEM, etc.) */
  updateSpecialAssignment: (entityId: string, roomId: string, reason?: string) => void;
  /**
   * Add a new capability fallback entry.
   * No-op if the capability already exists.
   */
  addCapabilityFallback: (capability: string, roomId: string, reason?: string) => void;
  /**
   * Remove an existing capability fallback entry.
   * No-op if the capability is not found.
   */
  removeCapabilityFallback: (capability: string) => void;
  /**
   * Move a capability fallback from one index to another (reorder).
   * Used for drag-to-reorder and up/down arrow controls.
   */
  reorderCapabilityFallback: (fromIndex: number, toIndex: number) => void;
  /**
   * Add a new special-entity assignment.
   * No-op if the entityId already exists.
   */
  addSpecialAssignment: (entityId: string, roomId: string, reason?: string) => void;
  /**
   * Remove a special-entity assignment.
   * No-op if the entityId is not found.
   */
  removeSpecialAssignment: (entityId: string) => void;
  /** Change the global fallback room (for unmatched agents) */
  setFallbackRoom: (roomId: string, reason?: string) => void;
  /**
   * Reset all mappings back to DEFAULT_ROOM_MAPPING.
   * Also clears the persisted localStorage snapshot so the next startup
   * also starts from defaults.
   */
  resetToDefaults: () => void;
  /** Toggle the HUD panel open/closed */
  togglePanel: () => void;
  /** Open the HUD panel */
  openPanel: () => void;
  /** Close the HUD panel */
  closePanel: () => void;

  // ── Sub-AC 12b: Runtime override actions ──────────────────────────

  /**
   * Apply a runtime room override for an entity.
   *
   * This takes HIGHEST priority over role/capability/special/fallback resolution.
   * Emits a `mapping.runtime_override_set` event.
   * If the entity already has an override, it is replaced (idempotent update).
   *
   * @param entityId  Agent ID or special entity ID to override
   * @param roomId    Target room for this entity
   * @param reason    Human-readable reason (default: "Programmatic override")
   * @param source    Caller context for audit ("user", "command", "test", etc.)
   */
  setRuntimeOverride: (
    entityId: string,
    roomId: string,
    reason?: string,
    source?: string,
  ) => void;

  /**
   * Remove the runtime override for a specific entity.
   * After removal, the entity reverts to its role/capability/special/fallback
   * resolved room.
   * No-op if no override exists for this entityId.
   * Emits a `mapping.runtime_override_cleared` event.
   */
  clearRuntimeOverride: (entityId: string, reason?: string) => void;

  /**
   * Remove ALL active runtime overrides.
   * All entities revert to their configured (role/capability/fallback) rooms.
   * No-op if there are no active overrides.
   * Emits a single `mapping.runtime_overrides_cleared` event.
   */
  clearAllRuntimeOverrides: (reason?: string) => void;

  /**
   * Get the current runtime override for an entity, if any.
   * Returns undefined if no override is active for this entityId.
   */
  getRuntimeOverride: (entityId: string) => RuntimeOverrideEntry | undefined;

  /**
   * Return all active runtime overrides as a plain Record suitable for
   * passing directly to `resolveAgentRoom(agent, overrides, config)`.
   * Returns an empty object when no overrides are active.
   */
  getRuntimeOverridesAsRecord: () => Record<string, string>;
}

// ── Event ID factory ───────────────────────────────────────────────

let eventCounter = 0;
function nextEventId(): string {
  return `rme-${Date.now()}-${++eventCounter}`;
}

// ── Bootstrap: resolve initial state ──────────────────────────────
// Run once at module load.  Attempts to restore from localStorage; falls back
// to a deep-clone of DEFAULT_ROOM_MAPPING if nothing is found.

function buildInitialState(): Pick<
  RoomMappingStoreState,
  "config" | "snapshot" | "events" | "persistenceSource" | "lastSavedAt"
> {
  const persisted = loadRoomMapping();

  if (persisted) {
    const loadEvent: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.loaded_from_storage",
      ts: Date.now(),
      payload: {
        reason: "Room mapping config restored from localStorage",
        savedAt: getLastSavedAt(),
      },
    };
    return {
      config: persisted,
      snapshot: buildRoomMappingSnapshot(persisted),
      events: [loadEvent],
      persistenceSource: "storage",
      lastSavedAt: getLastSavedAt(),
    };
  }

  // No persisted snapshot — deep-clone defaults so mutations never touch
  // the original constant.
  const defaultConfig: RoomMappingConfig = {
    ...DEFAULT_ROOM_MAPPING,
    roleDefaults: { ...DEFAULT_ROOM_MAPPING.roleDefaults },
    capabilityFallbacks: [...DEFAULT_ROOM_MAPPING.capabilityFallbacks],
    special: { ...DEFAULT_ROOM_MAPPING.special },
  };

  return {
    config: defaultConfig,
    snapshot: buildRoomMappingSnapshot(defaultConfig),
    events: [],
    persistenceSource: "defaults",
    lastSavedAt: null,
  };
}

const INITIAL = buildInitialState();

// ── Store ──────────────────────────────────────────────────────────

export const useRoomMappingStore = create<RoomMappingStoreState>((set, get) => ({
  ...INITIAL,
  isPanelOpen: false,
  // Runtime overrides start empty — they are volatile and never loaded from storage
  runtimeOverrides: {},

  // ── Role mapping ──────────────────────────────────────────────────

  updateRoleMapping: (role, roomId, reason) => {
    const prev = get().config.roleDefaults[role];
    if (prev?.roomId === roomId) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.role_updated",
      ts: Date.now(),
      payload: {
        role,
        from_room: prev?.roomId ?? null,
        to_room: roomId,
        reason: reason ?? `Role '${role}' reassigned to '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        roleDefaults: {
          ...state.config.roleDefaults,
          [role]: {
            roomId,
            priority: prev?.priority ?? 1,
            reason: reason ?? prev?.reason ?? `Role '${role}' → '${roomId}'`,
          },
        },
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Capability fallback ───────────────────────────────────────────

  updateCapabilityFallback: (capability, roomId, reason) => {
    const existing = get().config.capabilityFallbacks.find(
      (fb) => fb.capability === capability,
    );
    if (existing?.roomId === roomId) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.capability_updated",
      ts: Date.now(),
      payload: {
        capability,
        from_room: existing?.roomId ?? null,
        to_room: roomId,
        reason: reason ?? `Capability '${capability}' reassigned to '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        capabilityFallbacks: state.config.capabilityFallbacks.map((fb) =>
          fb.capability === capability
            ? { ...fb, roomId, reason: reason ?? fb.reason }
            : fb,
        ),
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Special assignment ────────────────────────────────────────────

  updateSpecialAssignment: (entityId, roomId, reason) => {
    const prev = get().config.special[entityId];
    if (prev?.roomId === roomId) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.special_updated",
      ts: Date.now(),
      payload: {
        entity_id: entityId,
        from_room: prev?.roomId ?? null,
        to_room: roomId,
        reason: reason ?? `Special '${entityId}' reassigned to '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        special: {
          ...state.config.special,
          [entityId]: {
            roomId,
            reason: reason ?? prev?.reason ?? `${entityId} → ${roomId}`,
          },
        },
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Add capability fallback ───────────────────────────────────────

  addCapabilityFallback: (capability, roomId, reason) => {
    const existing = get().config.capabilityFallbacks.find(
      (fb) => fb.capability === capability,
    );
    if (existing) return; // no-op — already exists

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.capability_added",
      ts: Date.now(),
      payload: {
        capability,
        room_id: roomId,
        reason: reason ?? `Capability '${capability}' added → '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        capabilityFallbacks: [
          ...state.config.capabilityFallbacks,
          { capability, roomId, reason: reason ?? `Capability '${capability}' → '${roomId}'` },
        ],
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Remove capability fallback ────────────────────────────────────

  removeCapabilityFallback: (capability) => {
    const existing = get().config.capabilityFallbacks.find(
      (fb) => fb.capability === capability,
    );
    if (!existing) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.capability_removed",
      ts: Date.now(),
      payload: {
        capability,
        room_id: existing.roomId,
        reason: `Capability '${capability}' removed`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        capabilityFallbacks: state.config.capabilityFallbacks.filter(
          (fb) => fb.capability !== capability,
        ),
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Reorder capability fallback ───────────────────────────────────

  reorderCapabilityFallback: (fromIndex, toIndex) => {
    const fallbacks = get().config.capabilityFallbacks;
    if (
      fromIndex < 0 ||
      fromIndex >= fallbacks.length ||
      toIndex < 0 ||
      toIndex >= fallbacks.length ||
      fromIndex === toIndex
    ) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.capability_reordered",
      ts: Date.now(),
      payload: {
        capability: fallbacks[fromIndex]?.capability,
        from_index: fromIndex,
        to_index: toIndex,
        reason: `Capability '${fallbacks[fromIndex]?.capability}' moved from ${fromIndex} → ${toIndex}`,
      },
    };

    set((state) => {
      const arr = [...state.config.capabilityFallbacks];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      const newConfig: RoomMappingConfig = {
        ...state.config,
        capabilityFallbacks: arr,
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Add special assignment ────────────────────────────────────────

  addSpecialAssignment: (entityId, roomId, reason) => {
    const existing = get().config.special[entityId];
    if (existing) return; // no-op — already exists

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.special_added",
      ts: Date.now(),
      payload: {
        entity_id: entityId,
        room_id: roomId,
        reason: reason ?? `Special '${entityId}' added → '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        special: {
          ...state.config.special,
          [entityId]: {
            roomId,
            reason: reason ?? `${entityId} → ${roomId}`,
          },
        },
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Remove special assignment ─────────────────────────────────────

  removeSpecialAssignment: (entityId) => {
    const existing = get().config.special[entityId];
    if (!existing) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.special_removed",
      ts: Date.now(),
      payload: {
        entity_id: entityId,
        room_id: existing.roomId,
        reason: `Special '${entityId}' removed`,
      },
    };

    set((state) => {
      const { [entityId]: _removed, ...rest } = state.config.special;
      const newConfig: RoomMappingConfig = {
        ...state.config,
        special: rest,
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Fallback room ─────────────────────────────────────────────────

  setFallbackRoom: (roomId, reason) => {
    const prev = get().config.fallbackRoom;
    if (prev === roomId) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.fallback_updated",
      ts: Date.now(),
      payload: {
        from_room: prev,
        to_room: roomId,
        reason: reason ?? `Global fallback room changed to '${roomId}'`,
      },
    };

    set((state) => {
      const newConfig: RoomMappingConfig = {
        ...state.config,
        fallbackRoom: roomId,
        fallbackReason: reason ?? state.config.fallbackReason,
      };
      saveRoomMapping(newConfig);
      return {
        config: newConfig,
        snapshot: buildRoomMappingSnapshot(newConfig),
        events: [...state.events, event],
        lastSavedAt: new Date().toISOString(),
      };
    });
  },

  // ── Reset ─────────────────────────────────────────────────────────

  resetToDefaults: () => {
    // Clear localStorage so the *next* startup also starts from defaults.
    clearRoomMapping();

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.reset",
      ts: Date.now(),
      payload: { reason: "User reset all room mappings to defaults" },
    };

    const resetConfig: RoomMappingConfig = {
      ...DEFAULT_ROOM_MAPPING,
      roleDefaults: { ...DEFAULT_ROOM_MAPPING.roleDefaults },
      capabilityFallbacks: [...DEFAULT_ROOM_MAPPING.capabilityFallbacks],
      special: { ...DEFAULT_ROOM_MAPPING.special },
    };

    set((state) => ({
      config: resetConfig,
      snapshot: buildRoomMappingSnapshot(resetConfig),
      events: [...state.events, event],
      persistenceSource: "defaults" as PersistenceSource,
      lastSavedAt: null,
    }));
  },

  // ── Panel visibility ──────────────────────────────────────────────

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  openPanel:   () => set({ isPanelOpen: true }),
  closePanel:  () => set({ isPanelOpen: false }),

  // ── Sub-AC 12b: Runtime override actions ─────────────────────────

  setRuntimeOverride: (entityId, roomId, reason, source = "user") => {
    const existing = get().runtimeOverrides[entityId];
    // Allow idempotent same-room re-application (still records an event for transparency)
    const entry: RuntimeOverrideEntry = {
      roomId,
      reason: reason ?? `Programmatic override: ${entityId} → ${roomId}`,
      source,
      appliedAt: Date.now(),
    };

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.runtime_override_set",
      ts: Date.now(),
      payload: {
        entity_id: entityId,
        from_room: existing?.roomId ?? null,
        to_room: roomId,
        reason: entry.reason,
        source,
      },
    };

    set((state) => ({
      runtimeOverrides: {
        ...state.runtimeOverrides,
        [entityId]: entry,
      },
      events: [...state.events, event],
    }));
  },

  clearRuntimeOverride: (entityId, reason) => {
    const existing = get().runtimeOverrides[entityId];
    if (!existing) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.runtime_override_cleared",
      ts: Date.now(),
      payload: {
        entity_id: entityId,
        was_room: existing.roomId,
        reason: reason ?? `Runtime override cleared for ${entityId}`,
      },
    };

    set((state) => {
      const { [entityId]: _removed, ...rest } = state.runtimeOverrides;
      return {
        runtimeOverrides: rest,
        events: [...state.events, event],
      };
    });
  },

  clearAllRuntimeOverrides: (reason) => {
    const current = get().runtimeOverrides;
    const count = Object.keys(current).length;
    if (count === 0) return; // no-op

    const event: RoomMappingEvent = {
      id: nextEventId(),
      type: "mapping.runtime_overrides_cleared",
      ts: Date.now(),
      payload: {
        cleared_count: count,
        cleared_entities: Object.keys(current),
        reason: reason ?? `All ${count} runtime override(s) cleared`,
      },
    };

    set((state) => ({
      runtimeOverrides: {},
      events: [...state.events, event],
    }));
  },

  getRuntimeOverride: (entityId) => {
    return get().runtimeOverrides[entityId];
  },

  getRuntimeOverridesAsRecord: () => {
    const overrides = get().runtimeOverrides;
    const result: Record<string, string> = {};
    for (const [entityId, entry] of Object.entries(overrides)) {
      result[entityId] = entry.roomId;
    }
    return result;
  },
}));
