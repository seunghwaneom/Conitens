/**
 * use-replay-engine.ts — Drives 3D scene replay from the scene event log.
 *
 * AC 9.2: Reads the recorded SceneEventLog and reconstructs 3D scene state
 * at any given timestamp by:
 *   1. Finding the nearest snapshot before the playhead timestamp
 *   2. Applying all log entries from the snapshot forward to the playhead
 *   3. Writing the reconstructed state into agent-store and spatial-store
 *      via silent setters (no new events emitted, recorder is paused)
 *
 * The hook mounts headlessly (renders null). Import and include in App.tsx.
 *
 * Architecture:
 *  - requestAnimationFrame loop advances playhead when playing
 *  - Reconstruction runs on every seek (user drag or auto-play tick)
 *  - Scene recorder is paused during replay to prevent contamination
 *  - Live store state is saved on enterReplay and restored on exitReplay
 *
 * Usage:
 *   // In App.tsx:
 *   const ReplayEngine = () => { useReplayEngine(); return null; };
 *   <ReplayEngine />
 */
import { useEffect, useRef, useCallback } from "react";
import { useReplayStore } from "../store/replay-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import type { AgentRuntimeState } from "../store/agent-store.js";
import type { RoomRuntimeState } from "../store/spatial-store.js";
import type { SceneLogEntry, SceneSnapshot } from "../store/scene-event-log.js";

// ── Type helpers ───────────────────────────────────────────────────────────

type AgentStatus = AgentRuntimeState["status"];

// ── State Reconstruction ───────────────────────────────────────────────────

/**
 * Find the nearest snapshot at or before the target timestamp.
 * Returns null if no snapshots exist or all are after ts.
 */
function findNearestSnapshot(
  ts: number,
  snapshots: SceneSnapshot[],
): SceneSnapshot | null {
  let nearest: SceneSnapshot | null = null;
  for (const snap of snapshots) {
    if (snap.ts <= ts) nearest = snap;
    else break; // snapshots are chronologically ordered
  }
  return nearest;
}

/**
 * Reconstruct agent states at a target timestamp.
 *
 * Algorithm:
 *   1. Start from nearest snapshot.agents (or empty map)
 *   2. Merge with live agent defs (for stable fields: def, spawnTs, etc.)
 *   3. Apply log entries from snap.seqAtSnapshot..targetTs
 */
function reconstructAgents(
  targetTs: number,
  snap: SceneSnapshot | null,
  entries: SceneLogEntry[],
  liveAgents: Record<string, AgentRuntimeState>,
): Record<string, AgentRuntimeState> {
  const agents: Record<string, AgentRuntimeState> = {};

  // Initialize from snapshot (or live agents as baseline)
  const baseAgents = snap
    ? snap.agents
    : Object.fromEntries(
        Object.entries(liveAgents).map(([id, a]) => [
          id,
          {
            agentId: id,
            roomId: a.roomId,
            status: a.status,
            worldPosition: { ...a.worldPosition },
            currentTaskId: a.currentTaskId,
          },
        ]),
      );

  for (const [agentId, snapAgent] of Object.entries(baseAgents)) {
    const live = liveAgents[agentId];
    agents[agentId] = {
      def: live?.def ?? {
        agentId,
        name: agentId,
        role: "implementer" as const,
        defaultRoom: snapAgent.roomId,
        capabilities: [],
        riskClass: "low" as const,
        summary: "",
        visual: { label: agentId, color: "#888888", icon: "◆" },
      },
      status: snapAgent.status as AgentStatus,
      lifecycleState: live?.lifecycleState ?? "ready",
      isDynamic: live?.isDynamic ?? false,
      roomId: snapAgent.roomId,
      localPosition: live?.localPosition ?? { x: 0.5, y: 0, z: 0.5 },
      worldPosition: { ...snapAgent.worldPosition },
      currentTaskId: snapAgent.currentTaskId,
      currentTaskTitle: null,
      lastStatusChangeTs: 0,
      lastLifecycleChangeTs: 0,
      hovered: false,
      spawnTs: live?.spawnTs ?? 0,
      spawnIndex: live?.spawnIndex ?? 0,
    };
  }

  // Apply events from after snapshot up to targetTs
  const startSeq = snap ? snap.seqAtSnapshot : 0;
  for (const entry of entries) {
    if (entry.seq <= startSeq) continue;
    if (entry.ts > targetTs) break;
    if (entry.source !== "agent") continue;
    applyAgentEntry(entry, agents);
  }

  return agents;
}

/**
 * Reconstruct room states at a target timestamp.
 */
function reconstructRooms(
  targetTs: number,
  snap: SceneSnapshot | null,
  entries: SceneLogEntry[],
  liveRoomStates: Record<string, RoomRuntimeState>,
): Record<string, RoomRuntimeState> {
  const rooms: Record<string, RoomRuntimeState> = {};

  // Initialize from snapshot or live rooms
  const baseRooms = snap
    ? snap.rooms
    : Object.fromEntries(
        Object.entries(liveRoomStates).map(([id, rs]) => [
          id,
          {
            roomId: id,
            activeMembers: [...rs.activeMembers],
            activity: rs.activity,
          },
        ]),
      );

  for (const [roomId, snapRoom] of Object.entries(baseRooms)) {
    rooms[roomId] = {
      activeMembers: [...snapRoom.activeMembers],
      activity: snapRoom.activity as RoomRuntimeState["activity"],
      highlighted: false,
      selected: false,
      lastEventTs: 0,
      paused: false,
    };
  }

  // Fill any rooms present in live state but missing from snapshot
  for (const [roomId, rs] of Object.entries(liveRoomStates)) {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        activeMembers: [],
        activity: "idle",
        highlighted: false,
        selected: false,
        lastEventTs: 0,
        paused: false,
      };
    }
    void rs; // suppress lint
  }

  // Apply events from snapshot to targetTs
  const startSeq = snap ? snap.seqAtSnapshot : 0;
  for (const entry of entries) {
    if (entry.seq <= startSeq) continue;
    if (entry.ts > targetTs) break;
    if (entry.source !== "spatial") continue;
    applyRoomEntry(entry, rooms);
  }

  return rooms;
}

/**
 * Apply a single agent SceneLogEntry to the mutable agents map.
 * Entries are expected to be in chronological order (caller ensures this).
 */
function applyAgentEntry(
  entry: SceneLogEntry,
  agents: Record<string, AgentRuntimeState>,
) {
  const p = entry.payload;
  // agentId is injected by the recorder as the outer key
  const agentId = (p.agentId ?? p.agent_id) as string | undefined;
  if (!agentId) return;

  const agent = agents[agentId];
  if (!agent) return;

  switch (entry.category) {
    case "agent.status_changed": {
      const status = p.status as AgentStatus | undefined;
      if (status) {
        agents[agentId] = { ...agent, status };
      }
      break;
    }
    case "agent.moved": {
      const toRoom = p.to_room as string | undefined;
      const pos = p.position as { x: number; y: number; z: number } | undefined;
      if (toRoom) {
        agents[agentId] = {
          ...agent,
          roomId: toRoom,
          worldPosition: pos ?? agent.worldPosition,
        };
      }
      break;
    }
    case "agent.task_started": {
      const taskId = p.task_id as string | undefined;
      const taskTitle = p.task_title as string | undefined;
      agents[agentId] = {
        ...agent,
        status: "active" as AgentStatus,
        currentTaskId: taskId ?? null,
        currentTaskTitle: taskTitle ?? null,
      };
      break;
    }
    case "agent.task_completed": {
      agents[agentId] = {
        ...agent,
        status: "idle" as AgentStatus,
        currentTaskId: null,
        currentTaskTitle: null,
      };
      break;
    }
    case "agent.placed": {
      // Initial placement — set room and world position from payload
      const roomId = p.room_id as string | undefined;
      const worldPos = p.world_position as { x: number; y: number; z: number } | undefined;
      const status = (p.status as AgentStatus | undefined) ?? "inactive";
      agents[agentId] = {
        ...agent,
        roomId: roomId ?? agent.roomId,
        worldPosition: worldPos ?? agent.worldPosition,
        status,
      };
      break;
    }
    default:
      // agent.selected, agent.deselected, agents.initialized — not replayed
      break;
  }
}

/**
 * Apply a single spatial SceneLogEntry to the mutable rooms map.
 */
function applyRoomEntry(
  entry: SceneLogEntry,
  rooms: Record<string, RoomRuntimeState>,
) {
  const p = entry.payload;

  switch (entry.category) {
    case "room.member_joined": {
      const roomId = p.roomId as string | undefined;
      const memberId = p.memberId as string | undefined;
      if (roomId && memberId && rooms[roomId]) {
        if (!rooms[roomId].activeMembers.includes(memberId)) {
          rooms[roomId] = {
            ...rooms[roomId],
            activeMembers: [...rooms[roomId].activeMembers, memberId],
          };
        }
      }
      break;
    }
    case "room.member_left": {
      const roomId = p.roomId as string | undefined;
      const memberId = p.memberId as string | undefined;
      if (roomId && memberId && rooms[roomId]) {
        rooms[roomId] = {
          ...rooms[roomId],
          activeMembers: rooms[roomId].activeMembers.filter((m) => m !== memberId),
        };
      }
      break;
    }
    case "room.activity_changed": {
      const roomId = p.roomId as string | undefined;
      const activity = p.activity as RoomRuntimeState["activity"] | undefined;
      if (roomId && activity && rooms[roomId]) {
        rooms[roomId] = { ...rooms[roomId], activity };
      }
      break;
    }
    // Note: room.paused / room.resumed replay is informational only;
    // we don't reconstruct the paused state since it doesn't affect 3D rendering
    default:
      break;
  }
}

// ── Recorder Status Interface ──────────────────────────────────────────────

export interface ReplayEngineStatus {
  mode: "live" | "replay";
  playing: boolean;
  speed: number;
  progress: number | null;
  elapsed: number;
  duration: number;
  firstEventTs: number;
  lastEventTs: number;
  totalLogEntries: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * useReplayEngine — Mounts the replay system.
 *
 * Place once in App.tsx (renders null). This hook:
 *  1. Maintains a requestAnimationFrame loop when playing
 *  2. Reconstructs scene state at the current playhead on each tick / seek
 *  3. Applies reconstructed state to agent-store and spatial-store silently
 *  4. Pauses scene recording when in replay mode
 *  5. Saves and restores live state on enter/exit
 *
 * External callers drive the playhead via useReplayStore actions:
 *   enterReplay, exitReplay, play, pause, seekToTs, setSpeed, etc.
 *
 * @returns ReplayEngineStatus for display components (re-renders only when
 *   key state changes, not on every frame)
 */
export function useReplayEngine(): ReplayEngineStatus {
  // ── Status selectors (minimal to avoid excessive re-renders) ─────────────
  const mode             = useReplayStore((s) => s.mode);
  const playing          = useReplayStore((s) => s.playing);
  const speed            = useReplayStore((s) => s.speed);
  const progress         = useReplayStore((s) => s.progress);
  const elapsed          = useReplayStore((s) => s.elapsed);
  const duration         = useReplayStore((s) => s.duration);
  const firstEventTs     = useReplayStore((s) => s.firstEventTs);
  const lastEventTs      = useReplayStore((s) => s.lastEventTs);
  const totalLogEntries  = useReplayStore((s) => s.totalLogEntries);

  // ── Stable action refs ───────────────────────────────────────────────────
  const _updatePlayhead  = useReplayStore((s) => s._updatePlayhead);
  const _refreshRange    = useReplayStore((s) => s._refreshRange);

  // ── RAF ref ──────────────────────────────────────────────────────────────
  const rafRef        = useRef<number>(0);
  const lastTimeRef   = useRef<number>(0);

  // ── Apply reconstructed state to stores ──────────────────────────────────
  const applyReconstructedState = useCallback(
    (targetTs: number) => {
      const logState = useSceneEventLog.getState();
      const snap = findNearestSnapshot(targetTs, logState.snapshots);

      // Read SAVED live agents (from agent-store._savedLiveAgents)
      // so we have stable fields (def, spawnTs) even after replay modifications
      const agentState   = useAgentStore.getState();
      const spatialState = useSpatialStore.getState();

      const savedAgents    = agentState._savedLiveAgents ?? agentState.agents;
      const savedRoomStates = spatialState._savedLiveRoomStates ?? spatialState.roomStates;

      const reconstructedAgents = reconstructAgents(
        targetTs,
        snap,
        logState.entries,
        savedAgents,
      );
      const reconstructedRooms = reconstructRooms(
        targetTs,
        snap,
        logState.entries,
        savedRoomStates,
      );

      // Find seq at targetTs for playhead display
      let seqAtTs = 0;
      for (const entry of logState.entries) {
        if (entry.ts <= targetTs) seqAtTs = entry.seq;
        else break;
      }

      // Apply to stores (silent — no events emitted)
      agentState._applyReplayAgents(reconstructedAgents);
      spatialState._applyReplayRoomStates(reconstructedRooms);
      _updatePlayhead(targetTs, seqAtTs);
    },
    [_updatePlayhead],
  );

  // ── Refresh log range (called periodically to keep range current) ─────────
  useEffect(() => {
    function refresh() {
      const logState = useSceneEventLog.getState();
      const { entries } = logState;
      if (entries.length === 0) return;
      const first = entries[0].ts;
      const last  = entries[entries.length - 1].ts;
      _refreshRange(first, last, entries.length);
    }
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [_refreshRange]);

  // ── Enter/Exit replay mode detection ─────────────────────────────────────
  useEffect(() => {
    const modeState = useReplayStore.getState().mode;

    if (modeState === "replay") {
      // Pause the scene recorder so replay state changes aren't captured
      useSceneEventLog.getState().pauseRecording();

      // Save live state in stores
      useAgentStore.getState()._enterReplayMode();
      useSpatialStore.getState()._enterReplayMode();

      // Seek to the playhead position (first event by default)
      const ts = useReplayStore.getState().playheadTs;
      applyReconstructedState(ts);
    } else {
      // Restore live state and resume recording
      useAgentStore.getState()._exitReplayMode();
      useSpatialStore.getState()._exitReplayMode();
      useSceneEventLog.getState().resumeRecording();
    }
  }, [mode, applyReconstructedState]);

  // ── Apply state when playhead changes (seek) ──────────────────────────────
  // Track playhead externally with a subscription to avoid React re-renders
  useEffect(() => {
    const unsub = useReplayStore.subscribe((state, prev) => {
      if (state.mode !== "replay") return;
      if (!state.playing && state.playheadTs !== prev.playheadTs) {
        // User seeked — reconstruct state
        applyReconstructedState(state.playheadTs);
      }
    });
    return unsub;
  }, [applyReconstructedState]);

  // ── RAF playback loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || mode !== "replay") {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      lastTimeRef.current = 0;
      return;
    }

    let active = true;

    function tick(now: number) {
      if (!active) return;

      const store  = useReplayStore.getState();
      if (!store.playing || store.mode !== "replay") {
        lastTimeRef.current = 0;
        return;
      }

      const delta = lastTimeRef.current > 0 ? now - lastTimeRef.current : 0;
      lastTimeRef.current = now;

      if (delta > 0 && delta < 500) { // clamp to avoid huge jumps after tab switch
        const newTs = store.playheadTs + delta * store.speed;

        if (newTs >= store.lastEventTs) {
          // Reached end — apply final state and stop
          applyReconstructedState(store.lastEventTs);
          useReplayStore.setState({
            playheadTs: store.lastEventTs,
            playing: false,
            progress: 1,
            elapsed: store.duration,
          });
          lastTimeRef.current = 0;
          return;
        }

        // Reconstruct and apply scene state at new playhead position
        applyReconstructedState(newTs);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      lastTimeRef.current = 0;
    };
  }, [playing, mode, speed, applyReconstructedState]);

  return {
    mode,
    playing,
    speed,
    progress,
    elapsed,
    duration,
    firstEventTs,
    lastEventTs,
    totalLogEntries,
  };
}

// ── Convenience Component ──────────────────────────────────────────────────

/**
 * ReplayEngine — Headless component that mounts the replay system.
 *
 * Renders null. Include inside the component tree to activate replay support.
 *
 * Example (in App.tsx):
 *   import { ReplayEngine } from "./hooks/use-replay-engine.js";
 *   return (
 *     <div>
 *       <SceneRecorder />
 *       <ReplayEngine />
 *       <CommandCenterScene ... />
 *       <HUD ... />
 *     </div>
 *   );
 */
export function ReplayEngine(): null {
  useReplayEngine();
  return null;
}
