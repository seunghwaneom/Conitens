/**
 * room-mapping-persistence.ts — localStorage persistence for room mapping config.
 *
 * Provides a simple, versioned read/write layer so user-modified room mappings
 * survive page reloads. On startup the store calls `loadRoomMapping()` first;
 * if a valid snapshot is found it overrides the compiled-in defaults.
 *
 * Design notes:
 *   - Write-only event log philosophy: the event log stays in-memory (session
 *     scoped), but the current *config snapshot* is persisted to localStorage.
 *   - Schema versioning: SCHEMA_VERSION is stored alongside the snapshot so
 *     future migrations can be detected and handled gracefully.
 *   - Failure isolation: any parse / quota error is caught silently and the
 *     caller falls back to defaults. Never throws.
 *   - The stored value is a plain JSON object — no Proxy / class instances.
 */

import type { RoomMappingConfig } from "../data/room-mapping-resolver.js";

// ── Constants ──────────────────────────────────────────────────────────────

/** localStorage key used for the persisted snapshot. */
export const STORAGE_KEY = "conitens:room-mapping:v1";

/**
 * Internal schema version embedded in the stored payload.
 * Increment this when the RoomMappingConfig shape changes in a
 * backwards-incompatible way; the load function will discard stale snapshots.
 */
const SCHEMA_VERSION = 1;

// ── Stored payload shape ───────────────────────────────────────────────────

interface StoredPayload {
  schemaVersion: number;
  savedAt: number;        // Unix ms timestamp
  config: RoomMappingConfig;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Persist the current room mapping config to localStorage.
 *
 * Silently swallows any storage errors (e.g. private-browsing quota, SSR).
 */
export function saveRoomMapping(config: RoomMappingConfig): void {
  try {
    const payload: StoredPayload = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      config,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded, private browsing, or SSR — degrade gracefully.
    console.warn("[room-mapping-persistence] Could not save to localStorage.");
  }
}

/**
 * Load a previously persisted room mapping config from localStorage.
 *
 * Returns `null` when:
 *   - No snapshot is found (first run, cleared storage, or private browsing)
 *   - The stored schema version doesn't match the current one (stale snapshot)
 *   - JSON parsing or structural validation fails
 *
 * On `null`, callers should fall back to `DEFAULT_ROOM_MAPPING`.
 */
export function loadRoomMapping(): RoomMappingConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as Partial<StoredPayload>;

    // Schema version guard — discard if outdated
    if (payload.schemaVersion !== SCHEMA_VERSION) {
      console.info(
        `[room-mapping-persistence] Discarding stale snapshot (stored v${payload.schemaVersion}, expected v${SCHEMA_VERSION}).`,
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const config = payload.config;
    if (!config || typeof config !== "object") return null;

    // Structural sanity check — must have the required top-level keys
    if (
      !config.roleDefaults ||
      !Array.isArray(config.capabilityFallbacks) ||
      typeof config.fallbackRoom !== "string" ||
      !config.special
    ) {
      console.warn("[room-mapping-persistence] Stored config is malformed; discarding.");
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    console.info(
      `[room-mapping-persistence] Loaded persisted mapping (saved ${new Date(payload.savedAt ?? 0).toLocaleString()}).`,
    );
    return config;
  } catch (err) {
    console.warn("[room-mapping-persistence] Failed to load from localStorage:", err);
    return null;
  }
}

/**
 * Remove the persisted room mapping snapshot from localStorage.
 *
 * Called by `resetToDefaults` so that the next page load starts clean.
 */
export function clearRoomMapping(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing critical if clear fails.
  }
}

/**
 * Returns `true` if a persisted snapshot exists and passes the version check.
 *
 * Useful for rendering a "loaded from storage" indicator in the UI without
 * fully deserialising the config.
 */
export function hasPersistedMapping(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw) as Partial<StoredPayload>;
    return payload.schemaVersion === SCHEMA_VERSION && !!payload.config;
  } catch {
    return false;
  }
}

/**
 * Return the ISO timestamp of the last save, or `null` if no snapshot exists.
 */
export function getLastSavedAt(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<StoredPayload>;
    if (!payload.savedAt) return null;
    return new Date(payload.savedAt).toISOString();
  } catch {
    return null;
  }
}
