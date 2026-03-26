/**
 * use-runtime-room-override.ts — Programmatic runtime room assignment API.
 *
 * Sub-AC 12b: Implements the ability to programmatically reassign entities
 * to different rooms at runtime, with the updated mapping reflected
 * immediately in the 3D scene.
 *
 * # What "programmatic" means
 *
 * Unlike the UI-driven `useRoomMapping3D` (drag-and-drop) or the config-driven
 * `updateRoleMapping` (changes a role's default room for ALL agents of that role),
 * runtime overrides are:
 *
 *   - ENTITY-SCOPED: target a single agent or special entity by id
 *   - VOLATILE:      NOT persisted to localStorage — cleared on page reload
 *   - HIGH-PRIORITY: shadow all other resolution paths (role, capability,
 *                    special-entity assignment, fallback)
 *   - IMMEDIATE:     the 3D scene updates synchronously on the next render frame
 *   - EVENT-SOURCED: every override set/clear is recorded in the mapping event log
 *
 * # Typical callers
 *
 *   - Test scenarios: deterministic agent placement for E2E / visual tests
 *   - Command-file ingestion: `room_override` command type routes an agent
 *   - Automated workflows: temporarily co-locate agents for a meeting / sprint
 *   - Debug tooling: quickly move an agent to inspect a room's state
 *
 * # How immediate 3D reflection works
 *
 *   1. Caller invokes `overrideEntityRoom(entityId, roomId)`
 *   2. Hook calls `room-mapping-store.setRuntimeOverride(entityId, roomId)`
 *   3. `runtimeOverrides` reference in the store changes → Zustand notifies subscribers
 *   4. `RoomMappingHotReloadBridge` (mounted in App.tsx) detects the change
 *   5. `applyMappingToAgents` is called with the new overrides → `moveAgent` for
 *      any agents whose resolved room changed
 *   6. AgentAvatar re-renders at the new worldPosition
 *
 *   The round-trip is synchronous within the same React render cycle (Zustand
 *   batches the set → re-render is scheduled immediately by React 18).
 *
 * # Exported symbols
 *
 *   `useRuntimeRoomOverride`   — React hook (use inside components / other hooks)
 *   `RuntimeRoomOverrideBridge` — Headless component (mount once in App.tsx)
 *   `applyRuntimeOverride`     — Pure function (use in tests / non-React code)
 *
 * @module use-runtime-room-override
 */

import { useCallback } from "react";
import { useRoomMappingStore }   from "../store/room-mapping-store.js";
import type { RuntimeOverrideEntry, RuntimeOverridesMap } from "../store/room-mapping-store.js";
import { useAgentStore }         from "../store/agent-store.js";
import type { AgentRuntimeState } from "../store/agent-store.js";
import {
  resolveAgentRoom,
  type RoomMappingConfig,
  type AgentDescriptor,
} from "../data/room-mapping-resolver.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of a single `overrideEntityRoom` call.
 * Provides feedback on whether the 3D scene was actually updated.
 */
export interface OverrideResult {
  /** The entity that was targeted */
  entityId: string;
  /** The room the entity was assigned to */
  roomId: string;
  /**
   * Whether the entity was found in the agent-store and its 3D position was
   * updated immediately.  Will be false for entities that are not currently
   * registered as agents (e.g. non-agent special entities).
   */
  movedIn3D: boolean;
  /**
   * Previous room ID before the override was applied.
   * Useful for callers that want to revert the change.
   */
  previousRoomId: string | null;
}

/**
 * Result of a `clearEntityOverride` call.
 */
export interface ClearResult {
  /** The entity whose override was cleared */
  entityId: string;
  /**
   * The room the entity was in while the override was active.
   * Null if no override was found (no-op).
   */
  clearedRoomId: string | null;
  /**
   * Whether the entity was moved in 3D after clearing the override
   * (i.e. the resolved room changed from the override room).
   */
  movedIn3D: boolean;
  /** True when no override existed (no action taken) */
  wasNoOp: boolean;
}

/**
 * The return type of `useRuntimeRoomOverride`.
 * All public API methods are stable (wrapped in useCallback).
 */
export interface UseRuntimeRoomOverrideReturn {
  /**
   * All currently active runtime overrides.
   * Subscribe in components to reactively display the override list.
   */
  runtimeOverrides: RuntimeOverridesMap;

  /**
   * Whether there are any active runtime overrides.
   * Derived from `runtimeOverrides`.
   */
  hasOverrides: boolean;

  /**
   * Programmatically assign an entity to a room at runtime.
   *
   * The override is applied immediately:
   *   1. Stored in the room-mapping store (`runtimeOverrides`)
   *   2. Agent 3D position updated via `moveAgent` (if entity is a known agent)
   *   3. `mapping.runtime_override_set` event recorded
   *
   * If the entity already has an override, it is replaced.
   * If the entity is not currently a registered agent, the override is still stored
   * (it will be applied if the agent registers later).
   *
   * @param entityId  Agent ID or special entity ID to override
   * @param roomId    Target room for this entity
   * @param reason    Human-readable reason (default: auto-generated)
   * @param source    Caller context for audit ("user", "command", "test", etc.)
   * @returns OverrideResult with before/after info and 3D update status
   */
  overrideEntityRoom: (
    entityId: string,
    roomId: string,
    reason?: string,
    source?: string,
  ) => OverrideResult;

  /**
   * Remove the runtime override for a specific entity.
   *
   * After clearing:
   *   1. Override removed from the room-mapping store
   *   2. Entity's room is re-resolved from role/capability/special/fallback
   *   3. Agent 3D position updated via `moveAgent` if the resolved room differs
   *   4. `mapping.runtime_override_cleared` event recorded
   *
   * No-op if no override is active for this entityId.
   *
   * @param entityId  Agent ID or special entity ID to unassign
   * @param reason    Human-readable reason for clearing
   * @returns ClearResult with override info and 3D update status
   */
  clearEntityOverride: (entityId: string, reason?: string) => ClearResult;

  /**
   * Remove ALL active runtime overrides.
   *
   * Each affected agent is re-resolved to its configured room and moved in 3D.
   * A single `mapping.runtime_overrides_cleared` event is recorded.
   *
   * @param reason  Human-readable reason for clearing all overrides
   * @returns Number of overrides that were cleared
   */
  clearAllOverrides: (reason?: string) => number;

  /**
   * Get the current override for a specific entity, if any.
   * Returns undefined when no override is active.
   */
  getOverride: (entityId: string) => RuntimeOverrideEntry | undefined;

  /**
   * Check whether a specific entity has an active runtime override.
   */
  hasOverrideFor: (entityId: string) => boolean;
}

// ── Pure helpers (exported for testing) ───────────────────────────────────

/**
 * Flatten a RuntimeOverridesMap to the plain `Record<string, string>` format
 * expected by `resolveAgentRoom`.
 *
 * Pure function — exported from this module for use in tests and the hot-reload bridge.
 */
export function flattenRuntimeOverrides(
  overrides: RuntimeOverridesMap,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [entityId, entry] of Object.entries(overrides)) {
    result[entityId] = entry.roomId;
  }
  return result;
}

/**
 * Apply a single runtime room override to an entity.
 *
 * Pure function — suitable for unit tests and non-React code paths.
 *
 * @param entityId   Entity to override
 * @param roomId     Target room
 * @param agents     Current agent runtime state map
 * @param moveAgent  Agent store action to relocate an agent
 * @returns Whether the agent was found and moved in 3D
 */
export function applyRuntimeOverride(
  entityId: string,
  roomId: string,
  agents: Record<string, AgentRuntimeState>,
  moveAgent: (agentId: string, roomId: string) => void,
): boolean {
  const agentState = agents[entityId];
  if (!agentState) return false;           // entity not a registered agent
  if (agentState.roomId === roomId) return false;  // already in target room

  moveAgent(entityId, roomId);
  return true;
}

/**
 * Revert a cleared override by re-resolving an entity's room from the config.
 *
 * Pure function — suitable for unit tests and non-React code paths.
 *
 * @param entityId   Entity whose override was cleared
 * @param agents     Current agent runtime state map
 * @param config     Current room mapping config (without the cleared override)
 * @param overrides  Remaining runtime overrides (after clearing this entity's entry)
 * @param moveAgent  Agent store action to relocate an agent
 * @returns The re-resolved roomId, or null if entity is not a registered agent
 */
export function revertToResolvedRoom(
  entityId: string,
  agents: Record<string, AgentRuntimeState>,
  config: RoomMappingConfig,
  overrides: Record<string, string>,
  moveAgent: (agentId: string, roomId: string) => void,
): string | null {
  const agentState = agents[entityId];
  if (!agentState) return null;  // entity not a registered agent

  const descriptor: AgentDescriptor = {
    agentId: agentState.def.agentId,
    role: agentState.def.role,
    capabilities: agentState.def.capabilities,
  };

  const resolution = resolveAgentRoom(descriptor, overrides, config);

  if (resolution.roomId !== agentState.roomId) {
    moveAgent(entityId, resolution.roomId);
  }

  return resolution.roomId;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * `useRuntimeRoomOverride` — Programmatic runtime room assignment hook.
 *
 * Provides stable callbacks for entity-level room overrides that take
 * effect immediately in the 3D scene.
 *
 * @example
 * ```tsx
 * const { overrideEntityRoom, clearEntityOverride, hasOverrides } =
 *   useRuntimeRoomOverride();
 *
 * // Move researcher-1 to the lab immediately:
 * overrideEntityRoom("researcher-1", "research-lab", "Sprint focus", "workflow");
 *
 * // Revert researcher-1 to their configured room:
 * clearEntityOverride("researcher-1");
 * ```
 */
export function useRuntimeRoomOverride(): UseRuntimeRoomOverrideReturn {
  // ── Store bindings ───────────────────────────────────────────────
  const runtimeOverrides        = useRoomMappingStore((s) => s.runtimeOverrides);
  const setRuntimeOverride      = useRoomMappingStore((s) => s.setRuntimeOverride);
  const clearRuntimeOverrideFn  = useRoomMappingStore((s) => s.clearRuntimeOverride);
  const clearAllRuntimeOverrides = useRoomMappingStore((s) => s.clearAllRuntimeOverrides);
  const getRuntimeOverridesAsRecord = useRoomMappingStore((s) => s.getRuntimeOverridesAsRecord);

  // Agent store — accessed via .getState() in callbacks to avoid stale closures
  const moveAgent = useAgentStore((s) => s.moveAgent);

  // ── overrideEntityRoom ────────────────────────────────────────────

  const overrideEntityRoom = useCallback(
    (
      entityId: string,
      roomId: string,
      reason?: string,
      source = "user",
    ): OverrideResult => {
      // Read current state imperatively (avoids stale closure + double-renders)
      const { agents } = useAgentStore.getState();
      const prevAgentState = agents[entityId];
      const previousRoomId = prevAgentState?.roomId ?? null;

      // 1. Record the override in the store (triggers hot-reload bridge if mounted)
      setRuntimeOverride(entityId, roomId, reason, source);

      // 2. Immediately move the agent in 3D (if it is a registered agent)
      //    The hot-reload bridge will also fire on the next render, but we move
      //    eagerly here for zero-latency feedback.
      const movedIn3D = applyRuntimeOverride(entityId, roomId, agents, moveAgent);

      return { entityId, roomId, movedIn3D, previousRoomId };
    },
    [setRuntimeOverride, moveAgent],
  );

  // ── clearEntityOverride ───────────────────────────────────────────

  const clearEntityOverride = useCallback(
    (entityId: string, reason?: string): ClearResult => {
      // Check if an override exists
      const { runtimeOverrides: currentOverrides } = useRoomMappingStore.getState();
      const existingOverride = currentOverrides[entityId];

      if (!existingOverride) {
        return {
          entityId,
          clearedRoomId: null,
          movedIn3D: false,
          wasNoOp: true,
        };
      }

      const clearedRoomId = existingOverride.roomId;

      // 1. Remove the override from the store
      clearRuntimeOverrideFn(entityId, reason);

      // 2. Re-resolve the agent's room from config (without the cleared override)
      const { agents } = useAgentStore.getState();
      const { config } = useRoomMappingStore.getState();

      // Build the remaining overrides record (without the cleared entry)
      const remainingOverrides = getRuntimeOverridesAsRecord();
      // Note: clearRuntimeOverrideFn has already removed the entry from the store,
      // so getRuntimeOverridesAsRecord() now returns the post-clear state.

      const resolvedRoom = revertToResolvedRoom(
        entityId,
        agents,
        config,
        remainingOverrides,
        moveAgent,
      );

      const movedIn3D = resolvedRoom !== null && resolvedRoom !== clearedRoomId;

      return {
        entityId,
        clearedRoomId,
        movedIn3D,
        wasNoOp: false,
      };
    },
    [clearRuntimeOverrideFn, getRuntimeOverridesAsRecord, moveAgent],
  );

  // ── clearAllOverrides ─────────────────────────────────────────────

  const clearAllOverrides = useCallback(
    (reason?: string): number => {
      const { runtimeOverrides: currentOverrides } = useRoomMappingStore.getState();
      const count = Object.keys(currentOverrides).length;
      if (count === 0) return 0;

      // 1. Clear all overrides in the store at once
      clearAllRuntimeOverrides(reason);

      // 2. The hot-reload bridge will re-resolve all affected agents.
      //    We also eagerly trigger moves here for zero-latency feedback:
      const { agents, moveAgent: move } = useAgentStore.getState();
      const { config } = useRoomMappingStore.getState();
      // Post-clear: no runtime overrides remain, so pass empty record
      for (const agentState of Object.values(agents)) {
        const descriptor: AgentDescriptor = {
          agentId: agentState.def.agentId,
          role: agentState.def.role,
          capabilities: agentState.def.capabilities,
        };
        const resolution = resolveAgentRoom(descriptor, {}, config);
        if (resolution.roomId !== agentState.roomId) {
          move(agentState.def.agentId, resolution.roomId);
        }
      }

      return count;
    },
    [clearAllRuntimeOverrides],
  );

  // ── Convenience accessors ─────────────────────────────────────────

  const getOverride = useCallback(
    (entityId: string): RuntimeOverrideEntry | undefined => {
      return runtimeOverrides[entityId];
    },
    [runtimeOverrides],
  );

  const hasOverrideFor = useCallback(
    (entityId: string): boolean => {
      return entityId in runtimeOverrides;
    },
    [runtimeOverrides],
  );

  return {
    runtimeOverrides,
    hasOverrides: Object.keys(runtimeOverrides).length > 0,
    overrideEntityRoom,
    clearEntityOverride,
    clearAllOverrides,
    getOverride,
    hasOverrideFor,
  };
}

// ── Headless bridge component ──────────────────────────────────────────────

/**
 * Headless component — activates the runtime room override hook.
 *
 * NOTE: The primary 3D-scene integration is handled by `RoomMappingHotReloadBridge`
 * (which subscribes to both config and runtimeOverrides changes). This component
 * is only needed if you want the `useRuntimeRoomOverride` hook's reactive state
 * (e.g. `hasOverrides`, `runtimeOverrides`) available via context without prop-drilling.
 *
 * In most cases, mounting `RoomMappingHotReloadBridge` in App.tsx is sufficient
 * for 3D scene synchronisation — the store actions can then be called directly
 * via `useRoomMappingStore.getState().setRuntimeOverride(...)` from non-React code.
 *
 * Returns null — renders nothing.
 */
export function RuntimeRoomOverrideBridge(): null {
  // Activating the hook ensures any reactive side-effects fire correctly
  // (future: could dispatch events to a monitoring layer here).
  useRuntimeRoomOverride();
  return null;
}

// ── Non-React programmatic API ─────────────────────────────────────────────

/**
 * Direct (non-React) API for programmatic room overrides.
 *
 * Use this from command-file ingestion handlers, WebSocket message processors,
 * automated test setup, or any non-component code that needs to override
 * room assignments without a React hook context.
 *
 * The 3D scene will update on the next render frame (via the hot-reload bridge).
 *
 * @example
 * ```ts
 * // From a command-file ingestion handler:
 * RuntimeOverrideAPI.set("researcher-1", "ops-control", "Summoned for review", "command");
 *
 * // From test setup:
 * RuntimeOverrideAPI.set("implementer-2", "impl-office", "Test placement", "test");
 *
 * // Revert after test:
 * RuntimeOverrideAPI.clear("implementer-2");
 *
 * // Clear all overrides after a workflow completes:
 * RuntimeOverrideAPI.clearAll("Workflow complete");
 * ```
 */
export const RuntimeOverrideAPI = {
  /**
   * Set a runtime room override for an entity.
   * The store update triggers the hot-reload bridge on the next render.
   */
  set(entityId: string, roomId: string, reason?: string, source = "programmatic"): void {
    useRoomMappingStore.getState().setRuntimeOverride(entityId, roomId, reason, source);
  },

  /**
   * Clear the runtime room override for an entity.
   */
  clear(entityId: string, reason?: string): void {
    useRoomMappingStore.getState().clearRuntimeOverride(entityId, reason);
  },

  /**
   * Clear ALL active runtime room overrides.
   */
  clearAll(reason?: string): void {
    useRoomMappingStore.getState().clearAllRuntimeOverrides(reason);
  },

  /**
   * Get the current runtime override for an entity, if any.
   */
  get(entityId: string): RuntimeOverrideEntry | undefined {
    return useRoomMappingStore.getState().runtimeOverrides[entityId];
  },

  /**
   * Check whether an entity has an active runtime override.
   */
  has(entityId: string): boolean {
    return entityId in useRoomMappingStore.getState().runtimeOverrides;
  },

  /**
   * Get all active overrides as a flat Record<entityId, roomId>.
   * Suitable for passing directly to `resolveAgentRoom` as the `overrides` arg.
   */
  getAll(): Record<string, string> {
    return useRoomMappingStore.getState().getRuntimeOverridesAsRecord();
  },
} as const;
