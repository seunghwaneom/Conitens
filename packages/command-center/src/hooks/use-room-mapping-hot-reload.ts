/**
 * use-room-mapping-hot-reload.ts — Hot-reload bridge between the room-mapping
 * store and the 3D scene's agent positions.
 *
 * Sub-AC 12c: When the user modifies any role→room, capability→room,
 * special-entity, or fallback assignment via the RoomMappingPanel, this
 * hook automatically resolves every live agent's new room and calls
 * `moveAgent` for any agents that need to relocate — providing a seamless
 * hot-reload of the 3D scene without a full page restart.
 *
 * Sub-AC 12b (runtime overrides): When programmatic runtime overrides change
 * (via `setRuntimeOverride` / `clearRuntimeOverride` / `clearAllRuntimeOverrides`),
 * this hook also re-applies the full resolution cascade so affected agents
 * move immediately in the 3D scene.  Runtime overrides take HIGHEST priority
 * in the resolution cascade — they override role, capability, special, and
 * fallback assignments.
 *
 * Also handles the startup case: if a persisted mapping snapshot is loaded
 * from localStorage on mount, `applyMappingToAgents` is called once the
 * agent store is initialized, ensuring agents land in the correct rooms
 * even when the persisted config overrides the compiled-in defaults.
 *
 * Design decisions:
 *   - The core relocation logic (`applyMappingToAgents`) is exported as a
 *     pure function so it can be unit-tested independently of React.
 *   - The hook uses `useEffect` with `config` and `runtimeOverrides` as
 *     dependencies; the agent store is accessed via `.getState()` to avoid
 *     creating a reactive subscription that would cause double-runs.
 *   - `RoomMappingHotReloadBridge` is a headless React component (returns
 *     null) — mount it once in App.tsx alongside SceneRecorder et al.
 *   - Skips re-resolution on the very first render (config reference is
 *     stored in a ref; skipped when ref === config to prevent spurious
 *     moves before agents are initialized).
 *   - Event-sourced: every agent relocation uses `moveAgent`, which
 *     appends an `agent.moved` event to the agent event log.
 *
 * Integration:
 *   - Room config changes → useRoomMappingStore mutation → config ref changes
 *     → useEffect fires → applyMappingToAgents → agent.moved events
 *   - Runtime override changes → runtimeOverrides ref changes → same flow
 *   - All moves are reflected in the 3D scene because AgentAvatar reads
 *     worldPosition from the agent-store, which is recomputed by moveAgent.
 */

import { useEffect, useRef } from "react";
import { useRoomMappingStore } from "../store/room-mapping-store.js";
import type { RuntimeOverridesMap } from "../store/room-mapping-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { AgentRuntimeState } from "../store/agent-store.js";
import {
  resolveAgentRoom,
  type RoomMappingConfig,
  type AgentDescriptor,
} from "../data/room-mapping-resolver.js";
// flattenRuntimeOverrides lives in use-runtime-room-override to avoid circular deps
// (use-runtime-room-override → this file is fine; reverse direction would be circular)
import { flattenRuntimeOverrides } from "./use-runtime-room-override.js";

// ── Pure logic (exported for unit tests) ───────────────────────────────────

/**
 * Resolve every agent's room under the given mapping config (and optional
 * runtime overrides) and call `moveAgent` for any that need to relocate.
 *
 * Runtime overrides take HIGHEST priority — they shadow the role/capability/
 * special/fallback resolution cascade completely for matched entityIds.
 *
 * @param config          The new (or initial) room mapping config to apply.
 * @param agents          The current per-agent runtime state map.
 * @param moveAgent       Agent store action to relocate an agent.
 * @param runtimeOverrides Optional per-entity room overrides (entityId → roomId).
 *                         Passed directly to `resolveAgentRoom` as the `overrides`
 *                         argument, where they are checked FIRST in the cascade.
 * @returns               Number of agents that were actually moved.
 */
export function applyMappingToAgents(
  config: RoomMappingConfig,
  agents: Record<string, AgentRuntimeState>,
  moveAgent: (agentId: string, roomId: string) => void,
  runtimeOverrides: Record<string, string> = {},
): number {
  let moved = 0;

  for (const agentState of Object.values(agents)) {
    const descriptor: AgentDescriptor = {
      agentId: agentState.def.agentId,
      role: agentState.def.role,
      capabilities: agentState.def.capabilities,
    };

    // Pass runtimeOverrides as explicit overrides — they are checked FIRST
    // in resolveAgentRoom's cascade before role/capability/special/fallback.
    const resolution = resolveAgentRoom(descriptor, runtimeOverrides, config);

    if (resolution.roomId !== agentState.roomId) {
      moveAgent(agentState.def.agentId, resolution.roomId);
      moved++;
    }
  }

  return moved;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to room-mapping config AND runtime override changes, then
 * propagate them to the 3D scene.
 *
 * Call once from a headless component mounted in App.tsx.
 * The hook is idempotent — multiple mounts are safe (each instance
 * maintains its own refs).
 */
export function useRoomMappingHotReload(): void {
  const config = useRoomMappingStore((s) => s.config);
  const runtimeOverrides = useRoomMappingStore((s) => s.runtimeOverrides);

  // Track previous refs so we can skip the initial render and avoid
  // moving agents before the agent store is populated.
  const prevConfigRef = useRef<RoomMappingConfig | null>(null);
  const prevOverridesRef = useRef<RuntimeOverridesMap | null>(null);

  useEffect(() => {
    // Skip if neither config nor runtimeOverrides have changed
    const configChanged    = prevConfigRef.current !== config;
    const overridesChanged = prevOverridesRef.current !== runtimeOverrides;

    if (!configChanged && !overridesChanged) return;

    prevConfigRef.current    = config;
    prevOverridesRef.current = runtimeOverrides;

    // Read agent state imperatively to avoid adding agent-store subscriptions
    // that would cause this effect to re-run on every agent update.
    const { agents, initialized, moveAgent } = useAgentStore.getState();

    // Don't attempt to relocate before agents are initialized: the first
    // time initializeAgents() runs, it places agents using the mapping
    // config directly — so an earlier hot-reload would conflict.
    if (!initialized) return;

    const overridesRecord = flattenRuntimeOverrides(runtimeOverrides);
    const moved = applyMappingToAgents(config, agents, moveAgent, overridesRecord);

    if (moved > 0) {
      // Log for visibility in the browser devtools.  (Not an error — just
      // informational so operators can confirm the hot-reload fired.)
      const trigger = configChanged ? "config" : "runtime-overrides";
      console.info(
        `[room-mapping-hot-reload] Applied ${trigger} change: ${moved} agent(s) relocated.`,
      );
    }
  }, [config, runtimeOverrides]);
}

// ── Headless bridge component ───────────────────────────────────────────────

/**
 * Headless component that activates the hot-reload hook.
 *
 * Mount once in App.tsx (alongside SceneRecorder, ReplayEngine, etc.):
 *
 * ```tsx
 * <RoomMappingHotReloadBridge />
 * ```
 *
 * Returns null — renders nothing, only subscribes to stores.
 */
export function RoomMappingHotReloadBridge(): null {
  useRoomMappingHotReload();
  return null;
}
