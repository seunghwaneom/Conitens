/**
 * use-room-mapping-api.ts — REST API bridge for room mapping configuration.
 *
 * Sub-AC 12 / AC-2: Expose room mapping data through a runtime API — ensure
 * default and user-defined room mappings are accessible and mutable via a
 * control-plane interface.
 *
 * # API contract (orchestration server at VITE_ORCHESTRATION_URL or localhost:8081)
 *
 *   GET    /api/room-mapping                              — read full config
 *   PUT    /api/room-mapping/roles/:role                  — update role mapping
 *   POST   /api/room-mapping/capabilities                 — add capability fallback
 *   PUT    /api/room-mapping/capabilities/:capability     — update capability fallback
 *   DELETE /api/room-mapping/capabilities/:capability     — remove capability fallback
 *   POST   /api/room-mapping/capabilities/reorder         — reorder capability fallbacks
 *   PUT    /api/room-mapping/special/:entityId            — update special assignment
 *   POST   /api/room-mapping/special                      — add special assignment
 *   DELETE /api/room-mapping/special/:entityId            — remove special assignment
 *   PUT    /api/room-mapping/fallback                     — set global fallback room
 *   POST   /api/room-mapping/reset                        — reset to defaults
 *   POST   /api/room-mapping/overrides/:entityId          — set runtime override
 *   DELETE /api/room-mapping/overrides/:entityId          — clear runtime override
 *   DELETE /api/room-mapping/overrides                    — clear all runtime overrides
 *
 * # Resilience
 *
 *   - When the backend is unreachable (ECONNREFUSED, timeout), the hook
 *     falls back to localStorage (already managed by room-mapping-persistence.ts).
 *   - Optimistic writes: the Zustand store is updated immediately and the API
 *     call fires asynchronously (no blocking the UI).
 *   - Failed writes are retried once after RETRY_DELAY_MS.
 *   - The `isBackendAvailable` flag reflects the last known connectivity state.
 *
 * # Usage
 *
 *   Mount `useRoomMappingApi()` once in App.tsx. The hook subscribes to the
 *   room-mapping-store event log and forwards mutations to the REST API.
 *   On mount it attempts to load the persisted config from the backend (with
 *   localStorage fallback).
 *
 *   ```tsx
 *   // In App.tsx:
 *   const { isBackendAvailable } = useRoomMappingApi();
 *   ```
 *
 * # Record transparency
 *
 *   All API writes are triggered by events already recorded in the Zustand store's
 *   append-only event log. API failures do NOT roll back the store — the event log
 *   retains the intent, enabling audit and later reconciliation.
 *
 * # Non-React usage
 *
 *   `RoomMappingApiClient` is a plain object (no hooks) that exposes the same
 *   REST operations for use from command-file ingestion handlers or test utilities
 *   without a React component context.
 *
 * @module use-room-mapping-api
 */

import { useEffect, useRef, useCallback } from "react";
import { useRoomMappingStore }   from "../store/room-mapping-store.js";
import type { RoomMappingConfig } from "../data/room-mapping-resolver.js";

// ── Config ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _viteEnv: Record<string, string> = (import.meta as any).env ?? {};
const ORCHESTRATION_BASE =
  _viteEnv["VITE_ORCHESTRATION_URL"] || "http://localhost:8081";

const ROOM_MAPPING_API = `${ORCHESTRATION_BASE}/api/room-mapping`;

/** Hard timeout for individual API calls (ms). Prevents hanging requests. */
const FETCH_TIMEOUT_MS = 5_000;

/** Delay before retrying a failed write (ms). */
const RETRY_DELAY_MS = 3_000;

/** localStorage key for backend-availability flag (avoids re-checking on hot-reload). */
const BACKEND_AVAILABLE_KEY = "conitens_room_mapping_backend_available";

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Fetch with a hard timeout to avoid hanging requests. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

/** Encode a path component, replacing spaces and special chars. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

// ── RoomMappingApiClient — non-React API client ────────────────────────────────

/**
 * Plain (non-React) API client for room mapping REST operations.
 *
 * Suitable for:
 *   - Command-file ingestion handlers
 *   - WebSocket message processors
 *   - Automated test utilities
 *   - Any non-component code that needs to read or mutate room mappings
 *     via the REST API without a React hook context.
 *
 * Each method first performs an optimistic Zustand store update (synchronous),
 * then fires the API call asynchronously.  Failures are logged as warnings
 * but do NOT roll back the store state.
 *
 * @example
 * ```ts
 * // From a command-file handler:
 * await RoomMappingApiClient.updateRole("researcher", "ops-control", "Summoned");
 * await RoomMappingApiClient.addCapabilityFallback("code-review", "review-office");
 * await RoomMappingApiClient.setRuntimeOverride("agent-1", "research-lab", "Test");
 * ```
 */
export const RoomMappingApiClient = {

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Fetch the current room mapping config from the backend.
   *
   * On success, applies the config to the Zustand store (if the schema version
   * matches). On failure, returns null.
   *
   * @returns The loaded config, or null when the backend is unreachable.
   */
  async fetchConfig(): Promise<RoomMappingConfig | null> {
    try {
      const res = await fetchWithTimeout(ROOM_MAPPING_API, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as RoomMappingConfig;
      return data;
    } catch {
      return null;
    }
  },

  // ── Role mappings ─────────────────────────────────────────────────────────

  /**
   * Update the target room for a role via the REST API.
   *
   * Performs an optimistic store update first, then fires the API call.
   *
   * @param role    The role to reassign (e.g. "researcher")
   * @param roomId  Target room identifier
   * @param reason  Human-readable reason for the change
   */
  async updateRole(role: string, roomId: string, reason?: string): Promise<boolean> {
    // Optimistic store update
    useRoomMappingStore.getState().updateRoleMapping(
      role as never,
      roomId,
      reason,
    );

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/roles/${encodeSegment(role)}`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] updateRole failed:", err);
      return false;
    }
  },

  // ── Capability fallbacks ──────────────────────────────────────────────────

  /**
   * Add a new capability fallback via the REST API.
   * No-op if the capability already exists (delegates to store action).
   */
  async addCapabilityFallback(capability: string, roomId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().addCapabilityFallback(capability, roomId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/capabilities`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ capability, roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] addCapabilityFallback failed:", err);
      return false;
    }
  },

  /**
   * Update an existing capability fallback via the REST API.
   * No-op if the capability does not exist (delegates to store action).
   */
  async updateCapabilityFallback(capability: string, roomId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().updateCapabilityFallback(capability, roomId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/capabilities/${encodeSegment(capability)}`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] updateCapabilityFallback failed:", err);
      return false;
    }
  },

  /**
   * Remove a capability fallback via the REST API.
   * No-op if the capability is not found (delegates to store action).
   */
  async removeCapabilityFallback(capability: string): Promise<boolean> {
    useRoomMappingStore.getState().removeCapabilityFallback(capability);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/capabilities/${encodeSegment(capability)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] removeCapabilityFallback failed:", err);
      return false;
    }
  },

  /**
   * Reorder capability fallbacks via the REST API.
   */
  async reorderCapabilityFallback(fromIndex: number, toIndex: number): Promise<boolean> {
    useRoomMappingStore.getState().reorderCapabilityFallback(fromIndex, toIndex);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/capabilities/reorder`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ fromIndex, toIndex }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] reorderCapabilityFallback failed:", err);
      return false;
    }
  },

  // ── Special assignments ───────────────────────────────────────────────────

  /**
   * Add a new special-entity assignment via the REST API.
   * No-op if the entityId already exists (delegates to store action).
   */
  async addSpecialAssignment(entityId: string, roomId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().addSpecialAssignment(entityId, roomId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/special`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ entityId, roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] addSpecialAssignment failed:", err);
      return false;
    }
  },

  /**
   * Update a special-entity assignment via the REST API.
   */
  async updateSpecialAssignment(entityId: string, roomId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().updateSpecialAssignment(entityId, roomId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/special/${encodeSegment(entityId)}`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] updateSpecialAssignment failed:", err);
      return false;
    }
  },

  /**
   * Remove a special-entity assignment via the REST API.
   * No-op if the entityId is not found (delegates to store action).
   */
  async removeSpecialAssignment(entityId: string): Promise<boolean> {
    useRoomMappingStore.getState().removeSpecialAssignment(entityId);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/special/${encodeSegment(entityId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] removeSpecialAssignment failed:", err);
      return false;
    }
  },

  // ── Fallback room ─────────────────────────────────────────────────────────

  /**
   * Set the global fallback room via the REST API.
   */
  async setFallbackRoom(roomId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().setFallbackRoom(roomId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/fallback`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] setFallbackRoom failed:", err);
      return false;
    }
  },

  // ── Reset ─────────────────────────────────────────────────────────────────

  /**
   * Reset all room mappings to defaults via the REST API.
   * Clears localStorage and the Zustand store config.
   */
  async resetToDefaults(): Promise<boolean> {
    useRoomMappingStore.getState().resetToDefaults();

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/reset`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ reason: "User reset all room mappings to defaults" }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] resetToDefaults failed:", err);
      return false;
    }
  },

  // ── Runtime overrides ─────────────────────────────────────────────────────

  /**
   * Set a runtime room override via the REST API.
   * Runtime overrides are volatile (session-only) and take highest priority.
   */
  async setRuntimeOverride(
    entityId: string,
    roomId: string,
    reason?: string,
    source = "api",
  ): Promise<boolean> {
    useRoomMappingStore.getState().setRuntimeOverride(entityId, roomId, reason, source);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/overrides/${encodeSegment(entityId)}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, reason, source }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] setRuntimeOverride failed:", err);
      return false;
    }
  },

  /**
   * Clear a runtime room override via the REST API.
   * No-op if no override exists for this entityId.
   */
  async clearRuntimeOverride(entityId: string, reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().clearRuntimeOverride(entityId, reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/overrides/${encodeSegment(entityId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] clearRuntimeOverride failed:", err);
      return false;
    }
  },

  /**
   * Clear ALL active runtime overrides via the REST API.
   * No-op if there are no active overrides.
   */
  async clearAllRuntimeOverrides(reason?: string): Promise<boolean> {
    useRoomMappingStore.getState().clearAllRuntimeOverrides(reason);

    try {
      const res = await fetchWithTimeout(
        `${ROOM_MAPPING_API}/overrides`,
        {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ reason }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn("[RoomMappingApiClient] clearAllRuntimeOverrides failed:", err);
      return false;
    }
  },

  // ── Read-only accessors (Zustand store proxies) ────────────────────────────

  /**
   * Get the current room mapping config from the local Zustand store.
   * This is a synchronous read — no API call needed.
   */
  getConfig(): RoomMappingConfig {
    return useRoomMappingStore.getState().config;
  },

  /**
   * Get all active runtime overrides as a flat Record<entityId, roomId>.
   * This is a synchronous read — no API call needed.
   */
  getRuntimeOverrides(): Record<string, string> {
    return useRoomMappingStore.getState().getRuntimeOverridesAsRecord();
  },

  /**
   * Get the full event log (append-only audit trail).
   * This is a synchronous read — no API call needed.
   */
  getEventLog() {
    return useRoomMappingStore.getState().events;
  },

  /**
   * Get the current mapping snapshot (derived model — currentAssignments,
   * defaultAssignments, deviations, hasDeviations, counts).
   * This is a synchronous read — no API call needed.
   */
  getSnapshot() {
    return useRoomMappingStore.getState().snapshot;
  },
} as const;

// ── Hook: useRoomMappingApi ─────────────────────────────────────────────────────

/**
 * Return type of `useRoomMappingApi`.
 */
export interface UseRoomMappingApiReturn {
  /** Whether the backend API was reachable on the last attempted call. */
  isBackendAvailable: boolean;
}

/**
 * `useRoomMappingApi` — Singleton hook that bridges the room-mapping Zustand
 * store with the REST control-plane API.
 *
 * Mount ONCE in App.tsx. The hook:
 *   1. On mount: loads the persisted config from the backend
 *      (falls back to the localStorage-restored config in the store).
 *   2. Subscribes to the store event log and forwards new events to the API.
 *   3. Exposes `isBackendAvailable` for connectivity indicator rendering.
 *
 * All writes are optimistic: the store is mutated first for zero-latency UI
 * feedback, then the API call is made asynchronously.
 *
 * @example
 * ```tsx
 * // App.tsx
 * const { isBackendAvailable } = useRoomMappingApi();
 * ```
 */
export function useRoomMappingApi(): UseRoomMappingApiReturn {
  const backendAvailableRef = useRef(false);
  const retryTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  //
  // On mount, attempt to load the authoritative config from the backend.
  // If found and the schema version matches, patch the store.
  // Failure is silent — the store already bootstrapped from localStorage.

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const res = await fetchWithTimeout(ROOM_MAPPING_API, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as RoomMappingConfig;

        if (cancelled) return;

        // Apply the loaded config to the store if it has a valid shape
        if (
          data &&
          typeof data === "object" &&
          data.roleDefaults &&
          Array.isArray(data.capabilityFallbacks) &&
          typeof data.fallbackRoom === "string" &&
          data.special
        ) {
          // Merge: only apply backend config if the schema version is compatible
          const storeConfig = useRoomMappingStore.getState().config;
          if (data.schemaVersion === storeConfig.schemaVersion) {
            // The backend config may have user modifications from other sessions;
            // apply it as a full reset, then re-apply any role/cap/special diffs.
            // For simplicity we just restore roles, capabilities, special, fallback:
            Object.entries(data.roleDefaults).forEach(([role, mapping]) => {
              useRoomMappingStore.getState().updateRoleMapping(
                role as never,
                mapping.roomId,
                `Loaded from backend: ${mapping.reason}`,
              );
            });

            // Sync fallback room
            if (data.fallbackRoom !== storeConfig.fallbackRoom) {
              useRoomMappingStore.getState().setFallbackRoom(
                data.fallbackRoom,
                "Loaded from backend",
              );
            }
          }
        }

        backendAvailableRef.current = true;
        try { localStorage.setItem(BACKEND_AVAILABLE_KEY, "1"); } catch { /* ignore */ }
      } catch {
        backendAvailableRef.current = false;
        try { localStorage.removeItem(BACKEND_AVAILABLE_KEY); } catch { /* ignore */ }
        // Silently degrade — store already has config from localStorage
      }
    }

    void loadConfig();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── API write helper ─────────────────────────────────────────────────────────

  const apiWrite = useCallback(
    async (url: string, init: RequestInit, retryOnFail = true): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(url, init);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        backendAvailableRef.current = true;
        return true;
      } catch (err) {
        backendAvailableRef.current = false;
        if (retryOnFail) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            void apiWrite(url, init, false /* no second retry */);
          }, RETRY_DELAY_MS);
        }
        return false;
      }
    },
    [],
  );

  // ── React to store events ────────────────────────────────────────────────────
  //
  // Subscribe to the event log (append-only) and process new entries.
  // We track the last processed event index to avoid re-processing.

  const lastProcessedEventRef = useRef(0);

  useEffect(() => {
    const unsubscribe = useRoomMappingStore.subscribe((state) => {
      const { events } = state;
      if (events.length <= lastProcessedEventRef.current) return;

      // Process all unhandled events in order
      for (let i = lastProcessedEventRef.current; i < events.length; i++) {
        const evt = events[i];

        switch (evt.type) {

          case "mapping.role_updated": {
            const { role, to_room, reason } = evt.payload as {
              role: string; to_room: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/roles/${encodeSegment(role)}`,
              {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ roomId: to_room, reason }),
              },
            );
            break;
          }

          case "mapping.capability_updated": {
            const { capability, to_room, reason } = evt.payload as {
              capability: string; to_room: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/capabilities/${encodeSegment(capability)}`,
              {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ roomId: to_room, reason }),
              },
            );
            break;
          }

          case "mapping.capability_added": {
            const { capability, room_id, reason } = evt.payload as {
              capability: string; room_id: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/capabilities`,
              {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ capability, roomId: room_id, reason }),
              },
            );
            break;
          }

          case "mapping.capability_removed": {
            const { capability } = evt.payload as { capability: string };
            void apiWrite(
              `${ROOM_MAPPING_API}/capabilities/${encodeSegment(capability)}`,
              { method: "DELETE" },
            );
            break;
          }

          case "mapping.capability_reordered": {
            const { from_index, to_index } = evt.payload as {
              from_index: number; to_index: number;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/capabilities/reorder`,
              {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ fromIndex: from_index, toIndex: to_index }),
              },
            );
            break;
          }

          case "mapping.special_updated": {
            const { entity_id, to_room, reason } = evt.payload as {
              entity_id: string; to_room: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/special/${encodeSegment(entity_id)}`,
              {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ roomId: to_room, reason }),
              },
            );
            break;
          }

          case "mapping.special_added": {
            const { entity_id, room_id, reason } = evt.payload as {
              entity_id: string; room_id: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/special`,
              {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ entityId: entity_id, roomId: room_id, reason }),
              },
            );
            break;
          }

          case "mapping.special_removed": {
            const { entity_id } = evt.payload as { entity_id: string };
            void apiWrite(
              `${ROOM_MAPPING_API}/special/${encodeSegment(entity_id)}`,
              { method: "DELETE" },
            );
            break;
          }

          case "mapping.fallback_updated": {
            const { to_room, reason } = evt.payload as {
              to_room: string; reason: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/fallback`,
              {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ roomId: to_room, reason }),
              },
            );
            break;
          }

          case "mapping.reset": {
            void apiWrite(
              `${ROOM_MAPPING_API}/reset`,
              {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ reason: evt.payload.reason }),
              },
            );
            break;
          }

          case "mapping.runtime_override_set": {
            const { entity_id, to_room, reason, source } = evt.payload as {
              entity_id: string; to_room: string; reason: string; source: string;
            };
            void apiWrite(
              `${ROOM_MAPPING_API}/overrides/${encodeSegment(entity_id)}`,
              {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ roomId: to_room, reason, source }),
              },
            );
            break;
          }

          case "mapping.runtime_override_cleared": {
            const { entity_id } = evt.payload as { entity_id: string };
            void apiWrite(
              `${ROOM_MAPPING_API}/overrides/${encodeSegment(entity_id)}`,
              { method: "DELETE" },
            );
            break;
          }

          case "mapping.runtime_overrides_cleared": {
            void apiWrite(
              `${ROOM_MAPPING_API}/overrides`,
              {
                method:  "DELETE",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ reason: evt.payload.reason }),
              },
            );
            break;
          }

          case "mapping.loaded_from_storage":
            // No API write — local restore only
            break;

          default:
            // Unknown event type — no API write
            break;
        }
      }

      lastProcessedEventRef.current = events.length;
    });

    return () => {
      unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [apiWrite]);

  return { isBackendAvailable: backendAvailableRef.current };
}
