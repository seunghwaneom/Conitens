/**
 * use-scene-graph-replay-bridge.ts — Sub-AC 9d
 *
 * Wires the playback controller (useReplayControllerStore) to the 3D scene
 * graph by translating each reconstructed SceneState snapshot into concrete
 * mutations applied to agent-store and spatial-store — the same stores that
 * drive AgentAvatar, RoomGeometry, and all other 3D objects.
 *
 * Architecture
 * ─────────────
 *   useReplayControllerStore.sceneState (ReconstructedSceneState)
 *     │ mapReconstructedAgentToRuntime()
 *     ▼
 *   useAgentStore._applyReplayAgents(Record<string, AgentRuntimeState>)
 *     │
 *     ▼   ← AgentAvatar reads agents from useAgentStore
 *   3D scene  (positions, status colours, badges update in real time)
 *
 *   useReplayControllerStore.sceneState
 *     │ mapReconstructedRoomToRuntime()
 *     ▼
 *   useSpatialStore._applyReplayRoomStates(Record<string, RoomRuntimeState>)
 *     │
 *     ▼   ← RoomGeometry reads from useSpatialStore
 *   3D scene  (activity glow, member count update in real time)
 *
 *   Pipeline states are returned from the hook for direct consumption by
 *   ReplayPipelineLayer (no existing store — purely a read-path concern).
 *
 * Lifecycle
 * ─────────
 *   When the controller becomes ready (isReady) AND mode=replay:
 *     1. Call _enterReplayMode() on both agent-store and spatial-store once.
 *     2. On every sceneState update: map + apply diffs.
 *   When mode returns to live OR controller is unloaded:
 *     1. Call _exitReplayMode() to restore pre-replay snapshots.
 *
 * Isolation
 * ─────────
 *   - This bridge is guard-gated: it only activates when the controller has
 *     loaded events (isReady && eventsLoaded > 0). In live mode, or when no
 *     JSONL events have been loaded, the bridge is dormant and use-replay-engine
 *     (SceneEventLog-based) continues to work normally.
 *   - Scene recording is NOT paused here — that responsibility belongs to
 *     use-replay-engine which handles SceneEventLog isolation. This bridge
 *     only applies state silently via the existing _apply* methods.
 *
 * Usage (in App.tsx)
 * ──────────────────
 *   import { SceneGraphReplayBridge } from "./hooks/use-scene-graph-replay-bridge.js";
 *   // alongside <ReplayControllerMount events={...} />
 *   <SceneGraphReplayBridge />
 *
 * Deep renderer components can also call useSceneGraphReplayBridge() directly
 * to read the pipeline states for rendering (e.g. ReplayPipelineLayer).
 */
import { useEffect, useRef } from "react";
import { useAgentStore, type AgentRuntimeState } from "../store/agent-store.js";
import { useSpatialStore, type RoomRuntimeState } from "../store/spatial-store.js";
import { useReplayStore } from "../store/replay-store.js";
import {
  useReplayControllerStore,
  type ReconstructedSceneState,
} from "./use-replay-controller.js";
import type {
  ReconstructedAgentState,
  ReconstructedRoomState,
  ReconstructedPipelineState,
} from "../replay/state-reconstruction-engine.js";
import { BUILDING } from "../data/building.js";
import type { AgentStatus, AgentLifecycleState } from "../data/agents.js";
import {
  getReplayRoomPosition,
  getReplayAgentPosition,
} from "./use-replay-spatial-layout.js";

// ── Public re-exports ─────────────────────────────────────────────────────────

export type { ReconstructedPipelineState };

// ── Agent status mapping ──────────────────────────────────────────────────────

/**
 * Map a reconstructed agent status string to an AgentStatus enum value.
 *
 * The reconstruction engine uses protocol-level status strings which differ
 * slightly from the UI store's AgentStatus enum.
 *
 * @param raw  Raw status string from ReconstructedAgentState.
 * @returns    AgentStatus compatible with agent-store.
 */
export function mapReconstructedStatus(raw: string): AgentStatus {
  switch (raw) {
    case "spawned":
    case "idle":
    case "ready":
      return "idle";
    case "active":
    case "busy":
      return "active";
    case "error":
    case "crashed":
      return "error";
    case "terminated":
    case "despawned":
      return "terminated";
    case "paused":
    case "suspended":
      return "idle"; // closest approximation in the UI model
    default:
      return "idle";
  }
}

/**
 * Map a reconstructed lifecycle state string to an AgentLifecycleState value.
 */
export function mapReconstructedLifecycle(raw: string): AgentLifecycleState {
  const validStates: AgentLifecycleState[] = [
    "initializing", "ready", "active", "paused",
    "suspended", "migrating", "terminating", "terminated", "crashed",
  ];
  if ((validStates as string[]).includes(raw)) {
    return raw as AgentLifecycleState;
  }
  // Map protocol-level terms to UI lifecycle states
  switch (raw) {
    case "pending":   return "initializing";
    case "running":   return "active";
    case "stopped":   return "terminated";
    case "error":     return "crashed";
    default:          return "ready";
  }
}

// ── World-position helper ─────────────────────────────────────────────────────

/**
 * Look up the room-centre world position for a given roomId from the current
 * building definition. Falls back to origin if the room is not found.
 *
 * Used when an agent moved to a new room during replay and the saved live
 * worldPosition is no longer accurate.
 */
export function roomCentreWorldPos(roomId: string): { x: number; y: number; z: number } {
  const room = BUILDING.rooms.find((r) => r.roomId === roomId);
  if (!room) return { x: 0, y: 0, z: 0 };
  return {
    x: room.position.x + room.dimensions.x * 0.5,
    y: room.position.y,
    z: room.position.z + room.dimensions.z * 0.5,
  };
}

// ── Mapper: ReconstructedAgentState → AgentRuntimeState ──────────────────────

/**
 * Map a single reconstructed agent state to an AgentRuntimeState, merging
 * with the live agent's stable fields (def, spawnTs, spawnIndex, localPosition).
 *
 * Dynamic fields (status, roomId, currentTaskId, lifecycleState, worldPosition)
 * are taken from the reconstruction.
 *
 * @param reconstructed  The reconstructed agent state from the pure engine.
 * @param liveAgent      The saved live agent used as the stable-field base.
 *                       null when the agent was dynamically spawned during
 *                       the replay window and has no live counterpart.
 * @returns              A full AgentRuntimeState ready for agent-store.
 */
export function mapReconstructedAgentToRuntime(
  reconstructed: ReconstructedAgentState,
  liveAgent: AgentRuntimeState | null,
): AgentRuntimeState {
  const status      = mapReconstructedStatus(reconstructed.status);
  const lifecycle   = mapReconstructedLifecycle(reconstructed.lifecycleState);
  const newRoomId   = reconstructed.roomId ?? liveAgent?.roomId ?? "lobby";

  // Prefer exact 3D position from spatial layout when available (Sub-AC 9c).
  // Falls back to room-centre-based position from the static building definition.
  const spatialAgentPos = getReplayAgentPosition(reconstructed.agentId);
  const spatialRoomPos  = !spatialAgentPos ? getReplayRoomPosition(newRoomId) : null;

  // Preserve live world-position when room hasn't changed; recompute otherwise
  const roomChanged  = liveAgent && liveAgent.roomId !== newRoomId;
  const worldPos     = spatialAgentPos
    ? spatialAgentPos
    : spatialRoomPos
    ? spatialRoomPos
    : roomChanged
    ? roomCentreWorldPos(newRoomId)
    : (liveAgent?.worldPosition ?? roomCentreWorldPos(newRoomId));

  return {
    def: liveAgent?.def ?? {
      agentId:     reconstructed.agentId,
      name:        reconstructed.agentId,
      role:        "implementer" as const,
      defaultRoom: newRoomId,
      capabilities: [],
      riskClass:   "low" as const,
      summary:     "(reconstructed)",
      visual:      { label: reconstructed.agentId, color: "#888888", emissive: "#555555", icon: "◆" },
    },
    status,
    lifecycleState:        lifecycle,
    isDynamic:             liveAgent?.isDynamic ?? true,
    roomId:                newRoomId,
    localPosition:         liveAgent?.localPosition ?? { x: 0.5, y: 0, z: 0.5 },
    worldPosition:         worldPos,
    currentTaskId:         reconstructed.currentTaskId,
    currentTaskTitle:      null,
    lastStatusChangeTs:    reconstructed.lastEventTs,
    lastLifecycleChangeTs: reconstructed.lastEventTs,
    hovered:               false,
    spawnTs:               liveAgent?.spawnTs ?? reconstructed.lastEventTs,
    spawnIndex:            liveAgent?.spawnIndex ?? 0,
  };
}

// ── Mapper: ReconstructedRoomState → RoomRuntimeState ────────────────────────

/**
 * Map a single reconstructed room state to a RoomRuntimeState.
 *
 * Preserves non-replay UI fields (highlighted, selected, paused) as neutral
 * values so the replay doesn't accidentally set false UI state.
 */
export function mapReconstructedRoomToRuntime(
  reconstructed: ReconstructedRoomState,
): RoomRuntimeState {
  const activity = (["idle", "active", "meeting", "offline"] as const).includes(
    reconstructed.activity as "idle" | "active" | "meeting" | "offline",
  )
    ? (reconstructed.activity as RoomRuntimeState["activity"])
    : "idle";

  return {
    activeMembers: [...reconstructed.activeMembers],
    activity,
    highlighted:  false,
    selected:     false,
    lastEventTs:  reconstructed.lastEventTs,
    paused:       false,
  };
}

// ── Diff application ──────────────────────────────────────────────────────────

/**
 * Compute and apply the reconstructed agent diff to agent-store.
 *
 * Only agents present in the reconstructed state are updated. Agents that
 * existed in the live store but are absent from the reconstruction retain
 * their saved live state (they may not have had any events in this replay
 * window).
 *
 * @param sceneState  Current reconstructed scene state.
 * @param savedLive   Saved live agents from _savedLiveAgents (stable-field source).
 */
export function applyAgentDiff(
  sceneState: ReconstructedSceneState,
  savedLive: Record<string, AgentRuntimeState>,
): Record<string, AgentRuntimeState> {
  // Start from the saved live agents as baseline (preserves non-reconstructed agents)
  const result: Record<string, AgentRuntimeState> = { ...savedLive };

  for (const [agentId, reconstructed] of Object.entries(sceneState.agents)) {
    const liveAgent = savedLive[agentId] ?? null;
    result[agentId] = mapReconstructedAgentToRuntime(reconstructed, liveAgent);
  }

  return result;
}

/**
 * Compute and apply the reconstructed room diff to spatial-store.
 *
 * @param sceneState    Current reconstructed scene state.
 * @param savedLive     Saved live room states from _savedLiveRoomStates.
 */
export function applyRoomDiff(
  sceneState: ReconstructedSceneState,
  savedLive: Record<string, RoomRuntimeState>,
): Record<string, RoomRuntimeState> {
  // Start from saved live rooms as baseline
  const result: Record<string, RoomRuntimeState> = { ...savedLive };

  for (const [roomId, reconstructed] of Object.entries(sceneState.rooms)) {
    void roomId; // suppress lint — roomId is the dict key, room carries roomId internally
    result[reconstructed.roomId] = mapReconstructedRoomToRuntime(reconstructed);
  }

  return result;
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface SceneGraphReplayBridgeStatus {
  /**
   * Whether the bridge is currently active (controller has events + mode=replay).
   */
  active: boolean;
  /**
   * Current reconstructed pipeline states. Empty map when bridge is inactive.
   * Used by ReplayPipelineLayer to render 3D pipeline visualizations.
   */
  pipelines: Record<string, ReconstructedPipelineState>;
  /** Number of agents currently tracked in the reconstruction. */
  agentCount: number;
  /** Number of rooms currently tracked in the reconstruction. */
  roomCount: number;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useSceneGraphReplayBridge — Wires the playback controller to the 3D scene.
 *
 * Mount once in App.tsx alongside <ReplayControllerMount>.
 *
 * On each reconstructed-state update the hook:
 *   1. Merges agent diffs into agent-store._applyReplayAgents()
 *   2. Merges room diffs into spatial-store._applyReplayRoomStates()
 *   3. Exposes pipeline states for direct consumption by ReplayPipelineLayer
 *
 * @returns  SceneGraphReplayBridgeStatus (status data only; no per-frame re-renders)
 */
export function useSceneGraphReplayBridge(): SceneGraphReplayBridgeStatus {
  // ── Reactive reads for display (minimal — only re-render on meaningful change)
  const mode        = useReplayStore((s) => s.mode);
  const isReady     = useReplayControllerStore((s) => s.isReady);
  const sceneState  = useReplayControllerStore((s) => s.sceneState);

  // ── Entered-replay guard ref (avoid duplicate _enterReplayMode calls) ────────
  const enteredRef = useRef(false);

  // ── Enter / exit replay mode lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (mode === "replay" && isReady) {
      if (!enteredRef.current) {
        // Only call _enterReplayMode() if no saved state already exists.
        // useReplayEngine (SceneEventLog-based) may have already saved the live
        // state — calling _enterReplayMode() again would overwrite the snapshot
        // with already-modified replay state.
        const agentSaved   = useAgentStore.getState()._savedLiveAgents;
        const spatialSaved = useSpatialStore.getState()._savedLiveRoomStates;
        if (agentSaved === null) {
          useAgentStore.getState()._enterReplayMode();
        }
        if (spatialSaved === null) {
          useSpatialStore.getState()._enterReplayMode();
        }
        enteredRef.current = true;
      }
    } else {
      if (enteredRef.current) {
        // Restore live state — only if WE were the one that saved it
        // (i.e., _savedLiveAgents is still non-null, meaning useReplayEngine
        //  hasn't exited and restored it yet).
        const agentSaved   = useAgentStore.getState()._savedLiveAgents;
        const spatialSaved = useSpatialStore.getState()._savedLiveRoomStates;
        if (agentSaved !== null) {
          useAgentStore.getState()._exitReplayMode();
        }
        if (spatialSaved !== null) {
          useSpatialStore.getState()._exitReplayMode();
        }
        enteredRef.current = false;
      }
    }
  }, [mode, isReady]);

  // ── Apply diffs on every sceneState update ───────────────────────────────────
  useEffect(() => {
    if (mode !== "replay" || !isReady || !sceneState) return;
    if (!enteredRef.current) return; // guard: enter must have been called first

    const agentState   = useAgentStore.getState();
    const spatialState = useSpatialStore.getState();

    const savedAgents    = agentState._savedLiveAgents    ?? agentState.agents;
    const savedRoomStates = spatialState._savedLiveRoomStates ?? spatialState.roomStates;

    const agentMap = applyAgentDiff(sceneState, savedAgents);
    const roomMap  = applyRoomDiff(sceneState, savedRoomStates);

    agentState._applyReplayAgents(agentMap);
    spatialState._applyReplayRoomStates(roomMap);
  }, [sceneState, mode, isReady]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (enteredRef.current) {
        // Only restore if saved states are still present (not already restored)
        if (useAgentStore.getState()._savedLiveAgents !== null) {
          useAgentStore.getState()._exitReplayMode();
        }
        if (useSpatialStore.getState()._savedLiveRoomStates !== null) {
          useSpatialStore.getState()._exitReplayMode();
        }
        enteredRef.current = false;
      }
    };
  }, []);

  // ── Return status ─────────────────────────────────────────────────────────────
  const active    = mode === "replay" && isReady && !!sceneState;
  const pipelines = sceneState?.pipelines ?? {};
  const agentCount = Object.keys(sceneState?.agents ?? {}).length;
  const roomCount  = Object.keys(sceneState?.rooms  ?? {}).length;

  return { active, pipelines, agentCount, roomCount };
}

// ── Convenience headless component ────────────────────────────────────────────

/**
 * SceneGraphReplayBridge — Headless component that mounts the bridge.
 *
 * Renders null. Place alongside <ReplayControllerMount> in the component tree.
 *
 * Example (App.tsx):
 *   import { SceneGraphReplayBridge } from "./hooks/use-scene-graph-replay-bridge.js";
 *   <ReplayControllerMount events={parsedEvents} />
 *   <SceneGraphReplayBridge />
 *
 * Deep scene components (e.g. ReplayPipelineLayer) can also call
 * useSceneGraphReplayBridge() directly to read pipeline states.
 */
export function SceneGraphReplayBridge(): null {
  useSceneGraphReplayBridge();
  return null;
}
