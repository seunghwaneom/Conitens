/**
 * use-scene-recorder.ts — Scene recording mechanism.
 *
 * AC 9.1: Subscribes to agent-store and spatial-store event arrays and
 * pipes translated events into the unified SceneEventLog.
 *
 * Architecture:
 *  - Uses Zustand's vanilla subscribe() API (not React state selectors)
 *    to avoid triggering re-renders on every event emission
 *  - Processes deltas: tracks last-processed index per source store,
 *    only translating *new* events added since last subscription callback
 *  - Batches multiple events per store update into a single recordBatch()
 *    call (single setState, single React render)
 *  - Periodic snapshot timer runs outside React renders (setTimeout)
 *  - Hook returns lightweight status object (recording, totalRecorded,
 *    sessionId) derived from a single Zustand selector — renders only
 *    when those values change, not on every event
 *
 * Mount once in App.tsx:
 *   const SceneRecorder = () => { useSceneRecorder(); return null; };
 *   // render <SceneRecorder /> inside the component tree
 *
 * Or consume the status in the same component:
 *   const { recording, totalRecorded } = useSceneRecorder();
 */
import { useEffect, useRef } from "react";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import {
  useSceneEventLog,
  type SceneEventCategory,
  type AgentSnapshotState,
  type RoomSnapshotState,
} from "../store/scene-event-log.js";
import type { AgentEventType } from "../store/agent-store.js";
import type { SpatialEventType } from "../store/spatial-store.js";

// ── Event Type Mappings ───────────────────────────────────────────────────

/**
 * Translate an AgentEventType (agent-store internal) to a SceneEventCategory.
 * Falls through to "unknown" for any unrecognized types added in future.
 */
function mapAgentEventType(type: AgentEventType): SceneEventCategory {
  switch (type) {
    case "agent.placed":         return "agent.placed";
    case "agent.moved":          return "agent.moved";
    case "agent.status_changed": return "agent.status_changed";
    case "agent.task_started":   return "agent.task_started";
    case "agent.task_completed": return "agent.task_completed";
    case "agent.selected":       return "agent.selected";
    case "agent.deselected":     return "agent.deselected";
    case "agents.initialized":   return "agents.initialized";
    default:                     return "unknown";
  }
}

/**
 * Translate a SpatialEventType (spatial-store internal) to a SceneEventCategory.
 * Falls through to "unknown" for any unrecognized future types.
 */
function mapSpatialEventType(type: SpatialEventType): SceneEventCategory {
  switch (type) {
    case "building.loaded":            return "building.loaded";
    case "building.load_failed":       return "building.load_failed";
    case "room.created":               return "building.loaded"; // Room creation is part of building load
    case "room.member_joined":         return "room.member_joined";
    case "room.member_left":           return "room.member_left";
    case "room.updated":               return "room.activity_changed";
    case "room.selected":              return "room.selected";
    case "room.deselected":            return "room.deselected";
    case "room.focused":               return "room.focused";
    case "room.unfocused":             return "room.unfocused";
    case "room.highlight":             return "room.highlighted";
    case "room.unhighlight":           return "room.unhighlighted";
    case "floor.visibility_changed":   return "unknown"; // Not a scene-replay-relevant event
    case "navigation.drilled_floor":   return "navigation.drilled_floor";
    case "navigation.drilled_room":    return "navigation.drilled_room";
    case "navigation.drilled_agent":   return "navigation.drilled_agent";
    case "navigation.ascended":        return "navigation.ascended";
    case "navigation.reset":           return "navigation.reset";
    case "camera.preset_changed":      return "camera.preset_changed";
    case "camera.mode_changed":        return "camera.mode_changed";
    case "camera.zoom_changed":        return "camera.zoom_changed";
    case "camera.pan_changed":         return "camera.pan_changed";
    case "camera.reset":               return "camera.reset";
    case "surface.clicked":            return "surface.clicked";
    case "surface.dismissed":          return "surface.dismissed";
    default:                           return "unknown";
  }
}

// ── Snapshot Interval ─────────────────────────────────────────────────────

/**
 * How often to take a scene snapshot (milliseconds).
 * 30 seconds gives ≈ 2 snapshots/min over a 2-minute rolling window.
 * Adjust down for more granular seek in replay.
 */
const SNAPSHOT_INTERVAL_MS = 30_000;

// ── Recorder Status ───────────────────────────────────────────────────────

export interface SceneRecorderStatus {
  /** Whether the scene recorder is actively recording events */
  recording: boolean;
  /** Total events recorded this session (survives rolling eviction) */
  totalRecorded: number;
  /** Current session identifier */
  sessionId: string;
  /** Unix timestamp when recording started, or null if not yet started */
  recordingStartTs: number | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * useSceneRecorder — Mounts the scene recording system.
 *
 * Call once from App.tsx. Internally:
 *   1. Starts the SceneEventLog recording session on mount
 *   2. Subscribes to useAgentStore.subscribe / useSpatialStore.subscribe
 *      (vanilla Zustand — outside React render cycle)
 *   3. On each store update, delta-processes new events and calls recordBatch()
 *   4. Runs a periodic snapshot timer every SNAPSHOT_INTERVAL_MS
 *
 * @returns SceneRecorderStatus — lightweight status for HUD/overlay display.
 *   Causes a re-render only when recording, totalRecorded, or sessionId changes.
 */
export function useSceneRecorder(): SceneRecorderStatus {
  // ── Stable action refs (Zustand functions are referentially stable) ─────
  const startRecording = useSceneEventLog((s) => s.startRecording);
  const recordBatch    = useSceneEventLog((s) => s.recordBatch);
  const takeSnapshot   = useSceneEventLog((s) => s.takeSnapshot);

  // ── Status values (minimal selector to minimise re-renders) ─────────────
  const recording        = useSceneEventLog((s) => s.recording);
  const totalRecorded    = useSceneEventLog((s) => s.totalRecorded);
  const sessionId        = useSceneEventLog((s) => s.sessionId);
  const recordingStartTs = useSceneEventLog((s) => s.recordingStartTs);

  // ── Last-processed indices for each store (persisted across re-renders) ──
  const agentIdxRef   = useRef(0);
  const spatialIdxRef = useRef(0);

  // ── Snapshot timer ref (avoid leaking timers on re-render) ───────────────
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 1. Start recording on mount ───────────────────────────────────────────
  useEffect(() => {
    startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── 2. Subscribe to agent-store events (outside React) ───────────────────
  useEffect(() => {
    // Capture stable refs for use inside the subscription callback
    const _recordBatch = recordBatch;

    const unsubAgent = useAgentStore.subscribe((state) => {
      // Delta: only process events we haven't seen yet
      const newEvents = state.events.slice(agentIdxRef.current);
      if (newEvents.length === 0) return;
      agentIdxRef.current = state.events.length;

      // Translate and batch-record
      const inputs = newEvents.map((event) => ({
        ts: event.ts,
        category: mapAgentEventType(event.type),
        source: "agent" as const,
        sourceEventId: event.id,
        payload: {
          ...(event.agentId !== undefined && { agentId: event.agentId }),
          ...event.payload,
        },
      }));

      _recordBatch(inputs);
    });

    return () => {
      unsubAgent();
    };
    // recordBatch is from Zustand — stable reference, safe in empty deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 3. Subscribe to spatial-store events (outside React) ─────────────────
  useEffect(() => {
    const _recordBatch = recordBatch;

    const unsubSpatial = useSpatialStore.subscribe((state) => {
      const newEvents = state.events.slice(spatialIdxRef.current);
      if (newEvents.length === 0) return;
      spatialIdxRef.current = state.events.length;

      const inputs = newEvents.map((event) => ({
        ts: event.ts,
        category: mapSpatialEventType(event.type),
        source: "spatial" as const,
        sourceEventId: event.id,
        payload: event.payload,
      }));

      _recordBatch(inputs);
    });

    return () => {
      unsubSpatial();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 4. Periodic snapshot timer ────────────────────────────────────────────
  useEffect(() => {
    const _takeSnapshot = takeSnapshot;

    function scheduleNext() {
      snapshotTimerRef.current = setTimeout(() => {
        // Read current agent and room state from stores
        const agentState   = useAgentStore.getState();
        const spatialState = useSpatialStore.getState();

        // Build agent snapshot records
        const agentsSnap: Record<string, AgentSnapshotState> = {};
        for (const [agentId, agent] of Object.entries(agentState.agents)) {
          agentsSnap[agentId] = {
            agentId,
            roomId: agent.roomId,
            status: agent.status,
            worldPosition: { ...agent.worldPosition },
            currentTaskId: agent.currentTaskId,
          };
        }

        // Build room snapshot records
        const roomsSnap: Record<string, RoomSnapshotState> = {};
        for (const [roomId, roomState] of Object.entries(spatialState.roomStates)) {
          roomsSnap[roomId] = {
            roomId,
            activeMembers: [...roomState.activeMembers],
            activity: roomState.activity,
          };
        }

        _takeSnapshot(agentsSnap, roomsSnap);
        scheduleNext(); // Reschedule after each snapshot
      }, SNAPSHOT_INTERVAL_MS);
    }

    scheduleNext();

    return () => {
      if (snapshotTimerRef.current !== null) {
        clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { recording, totalRecorded, sessionId, recordingStartTs };
}

// ── Convenience Component ─────────────────────────────────────────────────

/**
 * SceneRecorder — Headless component that mounts the scene recording system.
 *
 * Renders null. Include inside the component tree to activate recording.
 * Status is accessible via useSceneEventLog() selector from any descendant.
 *
 * Example (in App.tsx):
 *   import { SceneRecorder } from "./hooks/use-scene-recorder.js";
 *   // ...
 *   return (
 *     <div>
 *       <SceneRecorder />
 *       <CommandCenterScene />
 *       <HUD />
 *     </div>
 *   );
 */
export function SceneRecorder(): null {
  useSceneRecorder();
  return null;
}
