/**
 * agent-store.ts — Zustand store for agent avatar state.
 *
 * Event-sourced agent state management. Tracks:
 *   - Agent runtime state (status, position, current task)
 *   - Agent placement within rooms
 *   - Agent lifecycle events (append-only log)
 *
 * On initial load, all agents from AGENTS definitions are placed
 * in their default rooms as "inactive" avatars.
 *
 * All mutations are recorded as agent events for replay capability.
 *
 * AC2: Agents are pre-placed as inactive avatars on initial load.
 *   - Status starts as "inactive" (not yet spawned)
 *   - spawnTs records when the agent was placed (for fade-in animation)
 *   - spawnIndex provides stagger offset for sequential fade-in
 *   - Positions are recomputed when building is (re-)loaded from YAML
 */
import { create } from "zustand";
import {
  AGENTS,
  type AgentDef,
  type AgentStatus,
  type AgentLifecycleState,
  AGENT_LIFECYCLE_TRANSITIONS,
  TERMINAL_LIFECYCLE_STATES,
} from "../data/agents.js";
import { BUILDING, type BuildingDef, type RoomDef } from "../data/building.js";
// Lazy import to avoid circular deps — spatial store is accessed via .getState() only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _spatialStoreRef: (() => { building: { rooms: RoomDef[] } }) | null = null;
/**
 * Inject the spatial store getter after both stores are created.
 * Called from App.tsx once both stores are initialized.
 * Used by moveAgent to look up current (possibly YAML-loaded) room data.
 */
export function injectSpatialStoreRef(
  getState: () => { building: { rooms: RoomDef[] } },
) {
  _spatialStoreRef = getState;
}
/** Get current building rooms — prefers spatial store over static fallback */
function getCurrentRooms(): RoomDef[] {
  return _spatialStoreRef?.().building.rooms ?? BUILDING.rooms;
}

// ── Agent Event Types ──────────────────────────────────────────────

export type AgentEventType =
  | "agent.placed"         // Initial placement on load
  | "agent.status_changed" // Status transition
  | "agent.moved"          // Moved to different room
  | "agent.task_started"   // Began working on task
  | "agent.task_completed" // Finished task
  | "agent.selected"       // User selected this agent
  | "agent.deselected"     // User deselected agent
  | "agent.command_sent"   // User sent a manual command to agent
  | "agent.restarted"      // Agent was manually restarted (reset to idle)
  | "agents.initialized"   // All agents placed at startup
  // ── AC 7a: Lifecycle controls ──────────────────────────────────────
  | "agent.started"        // Agent transitioned from inactive/terminated → idle
  | "agent.stopped"        // Agent terminated by user lifecycle action
  | "agent.paused"         // Agent paused (active/busy → idle, task suspended)
  // ── Sub-AC 4a: Office-layer bulk lifecycle controls ────────────────
  | "agents.bulk_started"  // All eligible agents started (building/floor scope)
  | "agents.bulk_stopped"  // All non-terminated agents stopped (building/floor scope)
  // ── Sub-AC 15a: Dynamic registry events ───────────────────────────
  | "agent.spawned"          // Agent dynamically registered at runtime
  | "agent.despawned"        // Agent unregistered / removed from registry
  | "agent.lifecycle_changed" // Agent lifecycle state machine transition
  | "registry.updated"       // Agent registry contents changed
  // ── Sub-AC 10a: Meeting gathering events ──────────────────────────
  | "agent.meeting_gathering"   // Individual agent repositioned to meeting room
  | "agents.meeting_gathered"   // All participants gathered in meeting room
  | "agents.meeting_dispersed"; // All participants returned to home rooms

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  ts: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

// ── Agent Runtime State ────────────────────────────────────────────

export interface AgentRuntimeState {
  /** Agent definition reference */
  def: AgentDef;
  /** Current operational status */
  status: AgentStatus;
  /**
   * Coarse-grained lifecycle state (Sub-AC 15a).
   * Tracks the agent's position in the lifecycle FSM:
   * initializing → ready → active → ... → terminated/crashed
   */
  lifecycleState: AgentLifecycleState;
  /** Whether this agent was dynamically registered (vs static AGENTS definition) */
  isDynamic: boolean;
  /** Current room assignment */
  roomId: string;
  /** Position within room (local coords, 0-1 range relative to room) */
  localPosition: { x: number; y: number; z: number };
  /** World-space position (computed from room + local) */
  worldPosition: { x: number; y: number; z: number };
  /** Current task ID (if working) */
  currentTaskId: string | null;
  /** Current task title */
  currentTaskTitle: string | null;
  /** Last status change timestamp */
  lastStatusChangeTs: number;
  /** Last lifecycle state change timestamp (Sub-AC 15a) */
  lastLifecycleChangeTs: number;
  /** Whether the avatar is hovered */
  hovered: boolean;
  /**
   * Timestamp when this agent was placed (ms since epoch).
   * Used by AgentAvatar for staggered fade-in animation on initial load.
   */
  spawnTs: number;
  /**
   * Sequential index within the batch placement (0-based).
   * Drives stagger delay: avatar N fades in after N * STAGGER_MS ms.
   */
  spawnIndex: number;
}

// ── Meeting Gathering State (Sub-AC 10a) ────────────────────────────

/**
 * Runtime record of an active or completed meeting gathering.
 *
 * Created by gatherAgentsForMeeting() when a meeting starts.
 * Cleared by disperseAgentsFromMeeting() when the meeting ends.
 *
 * Agents in a "gathered" state have been moved to the meeting room and
 * arranged in a circular formation via computeCircularFormationPosition().
 * Their original roomId is preserved in participantHomeRooms so they can
 * return home when the meeting ends.
 */
export interface MeetingGathering {
  /** Meeting session ID (from SessionHandle.session_id) */
  meetingId: string;
  /** Room where agents are gathered */
  roomId: string;
  /**
   * Snapshot of each participant's home room BEFORE gathering.
   * Key: agentId, Value: original roomId.
   * Used by disperseAgentsFromMeeting to restore positions.
   */
  participantHomeRooms: Record<string, string>;
  /** Timestamp when gathering was initiated (ms since epoch) */
  gatheredAt: number;
  /** Gathering lifecycle status */
  status: "gathering" | "gathered" | "dispersed";
}

// ── Store Shape ────────────────────────────────────────────────────

interface AgentStoreState {
  /** Per-agent runtime state */
  agents: Record<string, AgentRuntimeState>;
  /**
   * Dynamic agent registry — canonical source of all known agent definitions.
   * Starts pre-populated with static AGENTS; grows/shrinks via registerAgent/unregisterAgent.
   * Record<agentId, AgentDef> for O(1) lookup. (Sub-AC 15a)
   */
  agentRegistry: Record<string, AgentDef>;
  /** Append-only agent event log */
  events: AgentEvent[];
  /** Currently selected agent ID */
  selectedAgentId: string | null;
  /** Whether agents have been initialized */
  initialized: boolean;
  /** Feature flag: render agents as pixel-art sprites instead of 3D geometry. Runtime-togglable. */
  usePixelSprites: boolean;
  /** Toggle the pixel sprite rendering mode. */
  setUsePixelSprites: (value: boolean) => void;
  /** View mode: "2d" = PixiJS pixel office (default), "3d" = Three.js command center. */
  viewMode: "2d" | "3d";
  /** Switch between 2D pixel office and 3D command center. */
  setViewMode: (mode: "2d" | "3d") => void;

  // ── Sub-AC 15a: Dynamic Registry Actions ─────────────────────────
  /**
   * Dynamically register and place a new agent at runtime.
   * - Adds the AgentDef to agentRegistry
   * - Creates AgentRuntimeState with grid-based position
   * - Records agent.spawned + registry.updated events
   * Supports 3-20 concurrent agents without hardcoded limits.
   */
  registerAgent: (def: AgentDef, options?: { roomId?: string; spawnIndex?: number }) => void;
  /**
   * Unregister (despawn) an agent — removes from both agents map and agentRegistry.
   * Records agent.despawned + registry.updated events.
   * No-op if agentId not found.
   */
  unregisterAgent: (agentId: string, reason?: string) => void;
  /**
   * Transition an agent's lifecycle state machine (Sub-AC 15a).
   * Validates the transition is legal; records agent.lifecycle_changed event.
   * No-op if agent not found or transition invalid.
   */
  updateAgentLifecycle: (
    agentId: string,
    nextState: AgentLifecycleState,
    options?: { trigger?: string; reason?: string },
  ) => void;
  /** Get total number of agents in the registry (static + dynamic) */
  getRegistrySize: () => number;
  /** Get all agents sorted by spawnIndex for stable rendering order */
  getAgentsSorted: () => AgentRuntimeState[];

  // ── Actions ──────────────────────────────────────────────────────
  /** Initialize all agents in their default rooms (uses static BUILDING fallback) */
  initializeAgents: () => void;
  /**
   * Re-initialize agents with positions derived from a dynamically-loaded building.
   * Called when the spatial store loads building data from YAML.
   * Preserves current status/task state; only updates positions.
   */
  reinitializePositions: (building: BuildingDef) => void;
  /** Select an agent */
  selectAgent: (agentId: string | null) => void;
  /** Set agent hover state */
  setAgentHovered: (agentId: string, hovered: boolean) => void;
  /** Change agent status */
  changeAgentStatus: (agentId: string, status: AgentStatus, reason?: string) => void;
  /** Move agent to a different room */
  moveAgent: (agentId: string, toRoomId: string) => void;
  /** Start a task for an agent */
  startAgentTask: (agentId: string, taskId: string, taskTitle?: string) => void;
  /** Complete current agent task */
  completeAgentTask: (agentId: string, outcome: "success" | "failure" | "cancelled") => void;
  /**
   * Send a manual command to an agent (event-sourced).
   * Records a agent.command_sent event, sets status to "active",
   * and stores the command as the currentTaskTitle for display.
   */
  sendAgentCommand: (agentId: string, command: string) => void;
  /**
   * Restart an agent — clears current task, resets status to "idle".
   * Records an agent.restarted event.
   */
  restartAgent: (agentId: string) => void;

  // ── AC 7a: Explicit lifecycle control actions ─────────────────────
  /**
   * Start an agent — transitions inactive or terminated agent to "idle".
   * Records an agent.started event with previous status preserved in payload.
   * No-op if the agent is already in an active state.
   */
  startAgent: (agentId: string) => void;
  /**
   * Stop an agent — terminates the agent regardless of current state.
   * Clears current task. Records an agent.stopped event.
   * This is a destructive action — callers must confirm before invoking.
   */
  stopAgent: (agentId: string) => void;
  /**
   * Pause an agent — suspends active/busy agents back to "idle".
   * Preserves current task ID in the event payload for potential resume.
   * Records an agent.paused event.
   */
  pauseAgent: (agentId: string) => void;

  /** Get agent by ID */
  getAgent: (agentId: string) => AgentRuntimeState | undefined;
  /** Get all agents in a room */
  getAgentsInRoom: (roomId: string) => AgentRuntimeState[];
  /** Get all agents as array */
  getAllAgents: () => AgentRuntimeState[];

  // ── Sub-AC 4a: Office-layer bulk lifecycle controls ────────────────
  /**
   * Start all inactive/terminated agents in scope.
   *
   * Scope controls which agents are targeted:
   *   "building" → all agents in all rooms
   *   "floor"    → only agents whose room is on the given floor (requires floorIndex)
   *
   * Room→floor lookups are performed via _spatialStoreRef.
   * Emits a single agents.bulk_started event recording which agents were started.
   * Per-agent guard (inactive|terminated only) is respected — no-op for already-live agents.
   */
  startAllAgentsInScope: (scope: "building" | "floor", floorIndex?: number) => void;
  /**
   * Stop all non-terminated agents in scope.
   *
   * Scope controls which agents are targeted (same as startAllAgentsInScope).
   * Emits a single agents.bulk_stopped event recording which agents were stopped.
   * Guard: skips already-terminated agents.
   */
  stopAllAgentsInScope: (scope: "building" | "floor", floorIndex?: number) => void;

  // ── Sub-AC 10a: Meeting Gathering ────────────────────────────────
  /**
   * Active meeting gatherings keyed by meeting_id.
   * Populated by gatherAgentsForMeeting(); cleared by disperseAgentsFromMeeting().
   */
  meetingGatherings: Record<string, MeetingGathering>;

  /**
   * Reposition all participant agents to the meeting room in a circular formation.
   *
   * For each participantId:
   *   1. Records their current roomId as homeRoomId in the gathering snapshot.
   *   2. Computes a circular formation local position via computeCircularFormationPosition().
   *   3. Moves the agent to the meeting room with the new local position.
   *   4. Emits an agent.meeting_gathering event per agent.
   *   5. Emits a single agents.meeting_gathered event when all participants are placed.
   *
   * Idempotent: if a gathering already exists for this meetingId, no-op.
   * Unknown participantIds (not in agents map) are silently skipped.
   * Unknown meetingRoomId → no-op with console.warn.
   */
  gatherAgentsForMeeting: (
    meetingId: string,
    meetingRoomId: string,
    participantIds: string[],
  ) => void;

  /**
   * Restore all gathered agents to their home rooms after a meeting ends.
   *
   * Looks up the MeetingGathering record for meetingId:
   *   1. For each participant, moves them back to participantHomeRooms[agentId].
   *   2. Emits a single agents.meeting_dispersed event.
   *   3. Marks the gathering as "dispersed" in meetingGatherings.
   *
   * No-op if meetingId has no gathering record or is already dispersed.
   */
  disperseAgentsFromMeeting: (meetingId: string) => void;

  /**
   * Get the gathering record for a meeting (or undefined if none exists).
   */
  getMeetingGathering: (meetingId: string) => MeetingGathering | undefined;

  // ── AC 9.2: Replay support ───────────────────────────────────────
  /**
   * Saved live agents map from before replay mode was entered.
   * Null when in live mode. Used by use-replay-engine for stable
   * base fields (def, spawnTs, spawnIndex) during state reconstruction.
   */
  _savedLiveAgents: Record<string, AgentRuntimeState> | null;
  /**
   * Save current agents and enter replay mode.
   * Called by use-replay-engine when transitioning to replay.
   * Does NOT emit events — replay state changes are write-only silent.
   */
  _enterReplayMode: () => void;
  /**
   * Restore saved live agents and exit replay mode.
   * Called by use-replay-engine when returning to live mode.
   * Does NOT emit events.
   */
  _exitReplayMode: () => void;
  /**
   * Directly apply a reconstructed agents map (replay state).
   * Bypasses event logging — used exclusively by the replay engine.
   * Recording is always paused before this is called.
   */
  _applyReplayAgents: (agents: Record<string, AgentRuntimeState>) => void;
}

// ── Helpers ────────────────────────────────────────────────────────

let agentEventCounter = 0;
function nextAgentEventId(): string {
  return `ae-${Date.now()}-${++agentEventCounter}`;
}

/**
 * Compute a local position offset for an agent within a room.
 * Uses a grid layout that scales from 1 to 20+ agents without overlap.
 *
 * Grid strategy (Sub-AC 15a — supports 3-20 agents):
 *   - 1 agent:    center (0.5, 0, 0.5)
 *   - 2 agents:   2-col row
 *   - 3-4 agents: 2×2 grid
 *   - 5-9 agents: 3-col grid
 *   - 10-16 agents: 4-col grid
 *   - 17-25 agents: 5-col grid
 *
 * Coordinates are in [0.15, 0.85] range to leave room margins.
 */
export function computeLocalPosition(
  agentIndex: number,
  totalAgents: number,
): { x: number; y: number; z: number } {
  if (totalAgents <= 0) return { x: 0.5, y: 0, z: 0.5 };
  if (totalAgents === 1) return { x: 0.5, y: 0, z: 0.5 };

  // Determine grid column count based on total agents
  const cols =
    totalAgents <= 2  ? 2 :
    totalAgents <= 4  ? 2 :
    totalAgents <= 9  ? 3 :
    totalAgents <= 16 ? 4 :
    5; // supports up to 25 agents

  const rows = Math.ceil(totalAgents / cols);
  const col = agentIndex % cols;
  const row = Math.floor(agentIndex / cols);

  // Distribute within [0.15, 0.85] on x and z to leave room margins
  const margin = 0.15;
  const usableSpan = 1 - 2 * margin; // 0.70

  const xStep = cols > 1 ? usableSpan / (cols - 1) : 0;
  const zStep = rows > 1 ? usableSpan / (rows - 1) : 0;

  return {
    x: cols > 1 ? margin + col * xStep : 0.5,
    y: 0,
    z: rows > 1 ? margin + row * zStep : 0.5,
  };
}

/**
 * Compute world-space position from room def + local position.
 */
function computeWorldPosition(
  room: RoomDef,
  localPos: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: room.position.x + localPos.x * room.dimensions.x,
    y: room.position.y + localPos.y * room.dimensions.y,
    z: room.position.z + localPos.z * room.dimensions.z,
  };
}

/**
 * Compute a local position for an agent within a circular meeting formation.
 *
 * Sub-AC 10a: Meeting gathering uses a circular arrangement so participants
 * visually encircle the room center — more evocative of a real meeting than
 * the standard grid layout used for normal room placement.
 *
 * Layout rules:
 *   - 1 participant: center (0.5, 0, 0.5)
 *   - 2+ participants: evenly spaced on a circle centered at (0.5, 0, 0.5)
 *   - Circle radius scales with participant count:
 *       ≤ 4 participants → radius 0.26  (tight inner circle)
 *       ≤ 8 participants → radius 0.30  (comfortable spacing)
 *       > 8 participants → radius 0.34  (outer ring to avoid overlap)
 *   - First agent is placed at angle -π/2 (top of circle, z-axis direction)
 *     so the formation reads as "gathered around the table"
 *
 * All coordinates are in [0, 1] local room space (same as computeLocalPosition).
 *
 * Exported for unit tests (Sub-AC 10a test coverage).
 *
 * @param agentIndex      - 0-based index within the meeting participant list
 * @param totalParticipants - Total number of participants in the meeting
 * @returns Local position {x, y, z} in [0,1] range
 */
export function computeCircularFormationPosition(
  agentIndex: number,
  totalParticipants: number,
): { x: number; y: number; z: number } {
  if (totalParticipants <= 0) return { x: 0.5, y: 0, z: 0.5 };
  if (totalParticipants === 1) return { x: 0.5, y: 0, z: 0.5 };

  // Radius scales with participant count to maintain spacing and avoid crowding
  const radius =
    totalParticipants <= 4 ? 0.26 :
    totalParticipants <= 8 ? 0.30 :
    0.34;

  // Evenly distribute agents around the circle starting from top (angle = -π/2)
  const angle = (agentIndex / totalParticipants) * 2 * Math.PI - Math.PI / 2;

  const x = 0.5 + Math.cos(angle) * radius;
  const z = 0.5 + Math.sin(angle) * radius;

  // Clamp to [0.10, 0.90] to guarantee positions stay within room bounds
  return {
    x: Math.max(0.10, Math.min(0.90, x)),
    y: 0,
    z: Math.max(0.10, Math.min(0.90, z)),
  };
}

/** Stagger delay between consecutive avatar fade-ins (ms) */
const SPAWN_STAGGER_MS = 180;

/**
 * Build initial agent states from a registry + building assignments.
 *
 * Sub-AC 15a: Accepts a registry Record rather than hard-coded AGENTS array
 * so dynamic agents registered before initializeAgents() are also placed.
 *
 * @param registry - Map of agentId → AgentDef (defaults to AGENTS-derived map)
 * @param building - Building definition to use for room lookups.
 *   Defaults to the static BUILDING constant (used on first load).
 * @param now - Current timestamp (ms). Used for spawnTs.
 */
function buildInitialAgentStates(
  registry: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.agentId, a])),
  building: BuildingDef = BUILDING,
  now: number = Date.now(),
): Record<string, AgentRuntimeState> {
  const states: Record<string, AgentRuntimeState> = {};

  // Group agents by room for position distribution
  const roomAgents: Record<string, AgentDef[]> = {};
  for (const agent of Object.values(registry)) {
    const roomId = agent.defaultRoom;
    if (!roomAgents[roomId]) roomAgents[roomId] = [];
    roomAgents[roomId].push(agent);
  }

  // Global spawn index for stagger calculation (across all rooms)
  let globalIndex = 0;

  for (const [roomId, agents] of Object.entries(roomAgents)) {
    // Prefer the dynamically-loaded building's room data, fall back to static
    const room = building.rooms.find((r) => r.roomId === roomId)
      ?? BUILDING.rooms.find((r) => r.roomId === roomId);
    if (!room) {
      console.warn(`[agent-store] Room '${roomId}' not found — agents skipped:`, agents.map((a) => a.agentId));
      continue;
    }

    agents.forEach((agent, index) => {
      const localPos = computeLocalPosition(index, agents.length);
      const worldPos = computeWorldPosition(room, localPos);
      const idx = globalIndex++;

      states[agent.agentId] = {
        def: agent,
        status: "inactive",
        lifecycleState: "initializing",
        isDynamic: false,
        roomId,
        localPosition: localPos,
        worldPosition: worldPos,
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: 0,
        lastLifecycleChangeTs: 0,
        hovered: false,
        // Staggered spawn: each agent is placed STAGGER_MS after the previous
        spawnTs: now + idx * SPAWN_STAGGER_MS,
        spawnIndex: idx,
      };
    });
  }

  return states;
}

/**
 * Recompute positions for all agents in a room after membership changes.
 * Preserves all other agent state; only updates localPosition + worldPosition.
 * Used by registerAgent/unregisterAgent/moveAgent for grid re-layout.
 */
function recomputeRoomPositions(
  agents: Record<string, AgentRuntimeState>,
  roomId: string,
  room: RoomDef,
): Record<string, AgentRuntimeState> {
  const inRoom = Object.values(agents)
    .filter((a) => a.roomId === roomId)
    .sort((a, b) => a.spawnIndex - b.spawnIndex);

  const total = inRoom.length;
  const updates: Record<string, AgentRuntimeState> = { ...agents };

  inRoom.forEach((agent, i) => {
    const localPos = computeLocalPosition(i, total);
    const worldPos = computeWorldPosition(room, localPos);
    updates[agent.def.agentId] = { ...agent, localPosition: localPos, worldPosition: worldPos };
  });

  return updates;
}

// ── Store ──────────────────────────────────────────────────────────

// Build the initial registry from static AGENTS (used as Zustand initial value)
const _INITIAL_REGISTRY: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.agentId, a]),
);

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  agents: {},
  agentRegistry: { ..._INITIAL_REGISTRY },
  events: [],
  selectedAgentId: null,
  initialized: false,
  usePixelSprites: true,
  setUsePixelSprites: (value: boolean) => set({ usePixelSprites: value }),
  viewMode: "2d" as "2d" | "3d",
  setViewMode: (mode: "2d" | "3d") => set({ viewMode: mode }),
  meetingGatherings: {},
  _savedLiveAgents: null,

  // ── Sub-AC 15a: Dynamic Registry ──────────────────────────────────────────

  registerAgent: (def, options = {}) => {
    set((state) => {
      const now = Date.now();
      const roomId = options.roomId ?? def.defaultRoom;

      // Determine room for position calculation
      const room =
        getCurrentRooms().find((r) => r.roomId === roomId) ??
        BUILDING.rooms.find((r) => r.roomId === roomId);

      // Count existing agents in target room for grid position
      const existingInRoom = Object.values(state.agents).filter(
        (a) => a.roomId === roomId,
      );
      const newTotalInRoom = existingInRoom.length + 1;

      // Global spawn index = total agents so far
      const globalSpawnIndex = options.spawnIndex ?? Object.keys(state.agents).length;

      // Compute positions for the new agent
      const localPos = computeLocalPosition(existingInRoom.length, newTotalInRoom);
      const worldPos = room
        ? computeWorldPosition(room, localPos)
        : { x: 0, y: 0, z: 0 };

      // Recompute positions for existing agents in the room (grid re-layout)
      let updatedAgents: Record<string, AgentRuntimeState> = { ...state.agents };
      if (room && existingInRoom.length > 0) {
        updatedAgents = recomputeRoomPositions(updatedAgents, roomId, room);
      }

      // Place new agent
      updatedAgents[def.agentId] = {
        def,
        status: "inactive",
        lifecycleState: "initializing",
        isDynamic: true,
        roomId,
        localPosition: localPos,
        worldPosition: worldPos,
        currentTaskId: null,
        currentTaskTitle: null,
        lastStatusChangeTs: now,
        lastLifecycleChangeTs: now,
        hovered: false,
        spawnTs: now,
        spawnIndex: globalSpawnIndex,
      };

      // Add to registry
      const updatedRegistry = { ...state.agentRegistry, [def.agentId]: def };

      const spawnEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.spawned",
        ts: now,
        agentId: def.agentId,
        payload: {
          agent_id: def.agentId,
          role: def.role,
          room_id: roomId,
          is_dynamic: true,
          spawn_index: globalSpawnIndex,
          world_position: updatedAgents[def.agentId].worldPosition,
          registry_size: Object.keys(updatedRegistry).length,
        },
      };

      const registryEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "registry.updated",
        ts: now,
        payload: {
          operation: "register",
          agent_id: def.agentId,
          registry_size: Object.keys(updatedRegistry).length,
          registry_ids: Object.keys(updatedRegistry),
        },
      };

      return {
        agents: updatedAgents,
        agentRegistry: updatedRegistry,
        events: [...state.events, spawnEvent, registryEvent],
      };
    });
  },

  unregisterAgent: (agentId, reason) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const roomId = agent.roomId;

      // Remove agent from agents map
      const withoutAgent = { ...state.agents };
      delete withoutAgent[agentId];

      // Recompute positions for remaining agents in the same room
      const room =
        getCurrentRooms().find((r) => r.roomId === roomId) ??
        BUILDING.rooms.find((r) => r.roomId === roomId);
      const finalAgents = room
        ? recomputeRoomPositions(withoutAgent, roomId, room)
        : withoutAgent;

      // Remove from registry
      const updatedRegistry = { ...state.agentRegistry };
      delete updatedRegistry[agentId];

      const despawnEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.despawned",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          reason: reason ?? "unregistered",
          prev_status: agent.status,
          prev_lifecycle: agent.lifecycleState,
          room_id: roomId,
          registry_size_after: Object.keys(updatedRegistry).length,
        },
      };

      const registryEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "registry.updated",
        ts: now,
        payload: {
          operation: "unregister",
          agent_id: agentId,
          registry_size: Object.keys(updatedRegistry).length,
          registry_ids: Object.keys(updatedRegistry),
        },
      };

      // Deselect if this agent was selected
      const selectedAgentId =
        state.selectedAgentId === agentId ? null : state.selectedAgentId;

      return {
        agents: finalAgents,
        agentRegistry: updatedRegistry,
        events: [...state.events, despawnEvent, registryEvent],
        selectedAgentId,
      };
    });
  },

  updateAgentLifecycle: (agentId, nextState, options = {}) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      // Validate transition is allowed by the FSM
      const prevState = agent.lifecycleState;
      const allowedNext = AGENT_LIFECYCLE_TRANSITIONS[prevState] as readonly AgentLifecycleState[];
      if (!allowedNext.includes(nextState)) {
        console.warn(
          `[agent-store] Invalid lifecycle transition ${prevState} → ${nextState} for agent ${agentId}`,
        );
        return state;
      }

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.lifecycle_changed",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_state: prevState,
          next_state: nextState,
          trigger: options.trigger ?? "user_command",
          reason: options.reason,
        },
      };

      // Derive operational status from new lifecycle state
      const newStatus = deriveStatusFromLifecycle(nextState, agent.status);

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            lifecycleState: nextState,
            status: newStatus,
            lastLifecycleChangeTs: now,
            lastStatusChangeTs: newStatus !== agent.status ? now : agent.lastStatusChangeTs,
            // Clear task when entering terminal states
            currentTaskId: TERMINAL_LIFECYCLE_STATES.has(nextState) ? null : agent.currentTaskId,
            currentTaskTitle: TERMINAL_LIFECYCLE_STATES.has(nextState) ? null : agent.currentTaskTitle,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  getRegistrySize: () => Object.keys(get().agentRegistry).length,

  getAgentsSorted: () =>
    Object.values(get().agents).sort((a, b) => a.spawnIndex - b.spawnIndex),

  // ── Core Actions ──────────────────────────────────────────────────────────

  initializeAgents: () => {
    if (get().initialized) return;

    const now = Date.now();
    // Use the current agentRegistry (may include dynamically pre-registered agents)
    const { agentRegistry } = get();
    const agents = buildInitialAgentStates(agentRegistry, BUILDING, now);

    // Create placement events for each agent — event-sourced audit trail
    const placementEvents: AgentEvent[] = Object.values(agents).map((a) => ({
      id: nextAgentEventId(),
      type: "agent.placed" as AgentEventType,
      ts: a.spawnTs, // Use staggered spawnTs for accurate event timing
      agentId: a.def.agentId,
      payload: {
        agent_id: a.def.agentId,
        room_id: a.roomId,
        status: "inactive",
        lifecycle_state: "initializing",
        role: a.def.role,
        spawn_index: a.spawnIndex,
        world_position: a.worldPosition,
        local_position: a.localPosition,
        source: "initial_placement",
      },
    }));

    // Batch initialization event — records the full placement manifest
    const initEvent: AgentEvent = {
      id: nextAgentEventId(),
      type: "agents.initialized",
      ts: now,
      payload: {
        agent_count: Object.keys(agentRegistry).length,
        agent_ids: Object.keys(agentRegistry),
        placement_count: Object.keys(agents).length,
        building_source: "static",
      },
    };

    set({
      agents,
      events: [...placementEvents, initEvent],
      initialized: true,
    });
  },

  reinitializePositions: (building) => {
    const { agents, initialized } = get();
    if (!initialized) return; // Must initialize first

    const now = Date.now();

    // Group by room for grid re-layout (Sub-AC 15a: preserves correct grid for N agents)
    const byRoom: Record<string, AgentRuntimeState[]> = {};
    for (const agent of Object.values(agents)) {
      if (!byRoom[agent.roomId]) byRoom[agent.roomId] = [];
      byRoom[agent.roomId].push(agent);
    }

    const updatedAgents: Record<string, AgentRuntimeState> = {};

    for (const [roomId, roomAgents] of Object.entries(byRoom)) {
      const room = building.rooms.find((r) => r.roomId === roomId)
        ?? BUILDING.rooms.find((r) => r.roomId === roomId);

      if (!room) {
        roomAgents.forEach((a) => { updatedAgents[a.def.agentId] = a; });
        continue;
      }

      // Sort by spawnIndex for stable grid assignment, then recompute positions
      const sorted = roomAgents.slice().sort((a, b) => a.spawnIndex - b.spawnIndex);
      sorted.forEach((existingAgent, i) => {
        const localPos = computeLocalPosition(i, sorted.length);
        const worldPos = computeWorldPosition(room, localPos);
        updatedAgents[existingAgent.def.agentId] = {
          ...existingAgent,
          localPosition: localPos,
          worldPosition: worldPos,
        };
      });
    }

    const reinitEvent: AgentEvent = {
      id: nextAgentEventId(),
      type: "agents.initialized",
      ts: now,
      payload: {
        agent_count: Object.keys(updatedAgents).length,
        agent_ids: Object.keys(updatedAgents),
        building_source: "yaml",
        event: "positions_recomputed",
      },
    };

    set((state) => ({
      agents: updatedAgents,
      events: [...state.events, reinitEvent],
    }));
  },

  selectAgent: (agentId) => {
    const prev = get().selectedAgentId;
    const events: AgentEvent[] = [];

    if (prev) {
      events.push({
        id: nextAgentEventId(),
        type: "agent.deselected",
        ts: Date.now(),
        agentId: prev,
        payload: { agent_id: prev },
      });
    }
    if (agentId) {
      events.push({
        id: nextAgentEventId(),
        type: "agent.selected",
        ts: Date.now(),
        agentId,
        payload: { agent_id: agentId },
      });
    }

    set((state) => ({
      selectedAgentId: agentId,
      events: [...state.events, ...events],
    }));
  },

  setAgentHovered: (agentId, hovered) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent || agent.hovered === hovered) return state;
      return {
        agents: {
          ...state.agents,
          [agentId]: { ...agent, hovered },
        },
      };
    });
  },

  changeAgentStatus: (agentId, status, reason) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.status_changed",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_status: agent.status,
          status,
          reason,
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status,
            lastStatusChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  moveAgent: (agentId, toRoomId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      // Prefer the live (possibly YAML-loaded) building; fall back to static
      const room =
        getCurrentRooms().find((r) => r.roomId === toRoomId) ??
        BUILDING.rooms.find((r) => r.roomId === toRoomId);
      if (!room) return state;

      const fromRoomId = agent.roomId;

      // Move agent to new room (positions recomputed below)
      let updatedAgents: Record<string, AgentRuntimeState> = {
        ...state.agents,
        [agentId]: { ...agent, roomId: toRoomId },
      };

      // Recompute grid positions for both source room and destination room
      const fromRoom =
        getCurrentRooms().find((r) => r.roomId === fromRoomId) ??
        BUILDING.rooms.find((r) => r.roomId === fromRoomId);

      if (fromRoom && fromRoomId !== toRoomId) {
        updatedAgents = recomputeRoomPositions(updatedAgents, fromRoomId, fromRoom);
      }
      updatedAgents = recomputeRoomPositions(updatedAgents, toRoomId, room);

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.moved",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          from_room: fromRoomId,
          to_room: toRoomId,
          position: updatedAgents[agentId]?.worldPosition,
        },
      };

      return {
        agents: updatedAgents,
        events: [...state.events, event],
      };
    });
  },

  startAgentTask: (agentId, taskId, taskTitle) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.task_started",
        ts: now,
        agentId,
        payload: { agent_id: agentId, task_id: taskId, task_title: taskTitle },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "active" as AgentStatus,
            currentTaskId: taskId,
            currentTaskTitle: taskTitle ?? null,
            lastStatusChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  completeAgentTask: (agentId, outcome) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.task_completed",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          task_id: agent.currentTaskId,
          outcome,
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "idle" as AgentStatus,
            currentTaskId: null,
            currentTaskTitle: null,
            lastStatusChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  sendAgentCommand: (agentId, command) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const taskId = `cmd-${now}`;
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.command_sent",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          command,
          prev_status: agent.status,
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "active" as AgentStatus,
            currentTaskId: taskId,
            // Truncate long commands for display in the 3D badge
            currentTaskTitle: command.length > 40 ? `${command.slice(0, 40)}…` : command,
            lastStatusChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  restartAgent: (agentId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.restarted",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_status: agent.status,
          prev_task_id: agent.currentTaskId,
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "idle" as AgentStatus,
            lifecycleState: "ready" as AgentLifecycleState,
            currentTaskId: null,
            currentTaskTitle: null,
            lastStatusChangeTs: now,
            lastLifecycleChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  // ── AC 7a: Lifecycle controls ──────────────────────────────────────

  startAgent: (agentId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;
      // Only start agents that are inactive or terminated
      if (agent.status !== "inactive" && agent.status !== "terminated") return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.started",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_status: agent.status,
          new_status: "idle",
          triggered_by: "lifecycle_control",
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "idle" as AgentStatus,
            lifecycleState: "ready" as AgentLifecycleState,
            currentTaskId: null,
            currentTaskTitle: null,
            lastStatusChangeTs: now,
            lastLifecycleChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  stopAgent: (agentId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;
      // Cannot stop an already terminated agent
      if (agent.status === "terminated") return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.stopped",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_status: agent.status,
          prev_task_id: agent.currentTaskId,
          triggered_by: "lifecycle_control",
          confirmed: true, // Caller is responsible for confirmation
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "terminated" as AgentStatus,
            lifecycleState: "terminated" as AgentLifecycleState,
            currentTaskId: null,
            currentTaskTitle: null,
            lastStatusChangeTs: now,
            lastLifecycleChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  pauseAgent: (agentId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;
      // Only pause active or busy agents
      if (agent.status !== "active" && agent.status !== "busy") return state;

      const now = Date.now();
      const event: AgentEvent = {
        id: nextAgentEventId(),
        type: "agent.paused",
        ts: now,
        agentId,
        payload: {
          agent_id: agentId,
          prev_status: agent.status,
          suspended_task_id: agent.currentTaskId,
          suspended_task_title: agent.currentTaskTitle,
          triggered_by: "lifecycle_control",
        },
      };

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status: "idle" as AgentStatus,
            lifecycleState: "paused" as AgentLifecycleState,
            // Keep task info for potential resume (not cleared on pause)
            lastStatusChangeTs: now,
            lastLifecycleChangeTs: now,
          },
        },
        events: [...state.events, event],
      };
    });
  },

  getAgent: (agentId) => get().agents[agentId],

  getAgentsInRoom: (roomId) =>
    Object.values(get().agents).filter((a) => a.roomId === roomId),

  getAllAgents: () => Object.values(get().agents),

  // ── Sub-AC 4a: Office-layer bulk lifecycle controls ────────────────

  startAllAgentsInScope: (scope, floorIndex) => {
    set((state) => {
      const now = Date.now();

      // Resolve which rooms are in scope (for floor scope, need spatial store)
      const roomsInScope: Set<string> | null =
        scope === "floor" && floorIndex !== undefined
          ? (() => {
              const building = _spatialStoreRef?.().building;
              if (!building) return null;
              const roomIds = new Set(
                building.rooms
                  .filter((r) => r.floor === floorIndex)
                  .map((r) => r.roomId),
              );
              return roomIds;
            })()
          : null; // null = all rooms (building scope)

      const toStart: string[] = [];
      const updatedAgents: Record<string, AgentRuntimeState> = { ...state.agents };

      for (const [agentId, agent] of Object.entries(state.agents)) {
        // Check scope filter
        if (roomsInScope !== null && !roomsInScope.has(agent.roomId)) continue;
        // Guard: only start inactive/terminated agents
        if (agent.status !== "inactive" && agent.status !== "terminated") continue;

        toStart.push(agentId);
        updatedAgents[agentId] = {
          ...agent,
          status: "idle" as AgentStatus,
          lifecycleState: "ready" as AgentLifecycleState,
          currentTaskId: null,
          currentTaskTitle: null,
          lastStatusChangeTs: now,
          lastLifecycleChangeTs: now,
        };
      }

      if (toStart.length === 0) return state; // No eligible agents — no-op

      const bulkEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agents.bulk_started",
        ts: now,
        payload: {
          scope,
          floor_index: floorIndex ?? null,
          started_ids: toStart,
          started_count: toStart.length,
          triggered_by: "office_layer_control",
        },
      };

      return {
        agents: updatedAgents,
        events: [...state.events, bulkEvent],
      };
    });
  },

  stopAllAgentsInScope: (scope, floorIndex) => {
    set((state) => {
      const now = Date.now();

      // Resolve room scope (same logic as startAllAgentsInScope)
      const roomsInScope: Set<string> | null =
        scope === "floor" && floorIndex !== undefined
          ? (() => {
              const building = _spatialStoreRef?.().building;
              if (!building) return null;
              const roomIds = new Set(
                building.rooms
                  .filter((r) => r.floor === floorIndex)
                  .map((r) => r.roomId),
              );
              return roomIds;
            })()
          : null; // null = all rooms (building scope)

      const toStop: string[] = [];
      const updatedAgents: Record<string, AgentRuntimeState> = { ...state.agents };

      for (const [agentId, agent] of Object.entries(state.agents)) {
        // Check scope filter
        if (roomsInScope !== null && !roomsInScope.has(agent.roomId)) continue;
        // Guard: skip already-terminated agents
        if (agent.status === "terminated") continue;

        toStop.push(agentId);
        updatedAgents[agentId] = {
          ...agent,
          status: "terminated" as AgentStatus,
          lifecycleState: "terminated" as AgentLifecycleState,
          currentTaskId: null,
          currentTaskTitle: null,
          lastStatusChangeTs: now,
          lastLifecycleChangeTs: now,
        };
      }

      if (toStop.length === 0) return state; // No eligible agents — no-op

      const bulkEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agents.bulk_stopped",
        ts: now,
        payload: {
          scope,
          floor_index: floorIndex ?? null,
          stopped_ids: toStop,
          stopped_count: toStop.length,
          triggered_by: "office_layer_control",
        },
      };

      return {
        agents: updatedAgents,
        events: [...state.events, bulkEvent],
      };
    });
  },

  // ── Sub-AC 10a: Meeting gathering ────────────────────────────────────────

  getMeetingGathering: (meetingId) => {
    return get().meetingGatherings[meetingId];
  },

  gatherAgentsForMeeting: (meetingId, meetingRoomId, participantIds) => {
    set((state) => {
      // Idempotent: skip if already gathered (but allow re-gather if dispersed)
      const existing = state.meetingGatherings[meetingId];
      if (existing && existing.status !== "dispersed") {
        return state;
      }

      // Resolve meeting room definition
      const meetingRoom =
        getCurrentRooms().find((r) => r.roomId === meetingRoomId) ??
        BUILDING.rooms.find((r) => r.roomId === meetingRoomId);

      if (!meetingRoom) {
        console.warn(
          `[agent-store] gatherAgentsForMeeting: meeting room '${meetingRoomId}' not found — skipping`,
        );
        return state;
      }

      const now = Date.now();

      // Filter to only participantIds that map to actual agents
      const validParticipantIds = participantIds.filter((id) => !!state.agents[id]);

      if (validParticipantIds.length === 0) {
        return state;
      }

      // Snapshot participant home rooms BEFORE moving anyone
      const participantHomeRooms: Record<string, string> = {};
      for (const agentId of validParticipantIds) {
        participantHomeRooms[agentId] = state.agents[agentId].roomId;
      }

      // Move agents to circular formation in meeting room
      let updatedAgents: Record<string, AgentRuntimeState> = { ...state.agents };
      const gatheringEvents: AgentEvent[] = [];

      validParticipantIds.forEach((agentId, i) => {
        const agent = updatedAgents[agentId];
        if (!agent) return;

        const localPos = computeCircularFormationPosition(i, validParticipantIds.length);
        const worldPos = computeWorldPosition(meetingRoom, localPos);
        const fromRoomId = agent.roomId;

        updatedAgents[agentId] = {
          ...agent,
          roomId: meetingRoomId,
          localPosition: localPos,
          worldPosition: worldPos,
        };

        // Per-agent gathering event
        gatheringEvents.push({
          id: nextAgentEventId(),
          type: "agent.meeting_gathering",
          ts: now,
          agentId,
          payload: {
            agent_id: agentId,
            meeting_id: meetingId,
            from_room: fromRoomId,
            to_room: meetingRoomId,
            formation_index: i,
            formation_total: validParticipantIds.length,
            world_position: worldPos,
          },
        });
      });

      // Recompute grid layout for rooms that lost agents
      const affectedSourceRooms = new Set<string>();
      for (const agentId of validParticipantIds) {
        const homeRoom = participantHomeRooms[agentId];
        if (homeRoom !== meetingRoomId) {
          affectedSourceRooms.add(homeRoom);
        }
      }

      for (const roomId of affectedSourceRooms) {
        const room =
          getCurrentRooms().find((r) => r.roomId === roomId) ??
          BUILDING.rooms.find((r) => r.roomId === roomId);
        if (room) {
          updatedAgents = recomputeRoomPositions(updatedAgents, roomId, room);
        }
      }

      // But override meeting-room agents with their circular positions (recomputeRoomPositions
      // would reset them to the grid layout — restore circular positions)
      validParticipantIds.forEach((agentId, i) => {
        const agent = updatedAgents[agentId];
        if (!agent || agent.roomId !== meetingRoomId) return;
        const localPos = computeCircularFormationPosition(i, validParticipantIds.length);
        const worldPos = computeWorldPosition(meetingRoom, localPos);
        updatedAgents[agentId] = { ...agent, localPosition: localPos, worldPosition: worldPos };
      });

      // Aggregate gathered event
      const gatheredEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agents.meeting_gathered",
        ts: now,
        payload: {
          meeting_id: meetingId,
          room_id: meetingRoomId,
          participant_ids: validParticipantIds,
          participant_count: validParticipantIds.length,
        },
      };

      // Build gathering record
      const gathering: MeetingGathering = {
        meetingId,
        roomId: meetingRoomId,
        participantHomeRooms,
        gatheredAt: now,
        status: "gathered",
      };

      return {
        agents: updatedAgents,
        meetingGatherings: {
          ...state.meetingGatherings,
          [meetingId]: gathering,
        },
        events: [...state.events, ...gatheringEvents, gatheredEvent],
      };
    });
  },

  disperseAgentsFromMeeting: (meetingId) => {
    set((state) => {
      const gathering = state.meetingGatherings[meetingId];

      // No-op: no gathering record or already dispersed
      if (!gathering || gathering.status === "dispersed") {
        return state;
      }

      const now = Date.now();

      let updatedAgents: Record<string, AgentRuntimeState> = { ...state.agents };

      // Move each participant back to their home room
      const affectedRooms = new Set<string>();
      affectedRooms.add(gathering.roomId); // meeting room loses agents

      for (const [agentId, homeRoomId] of Object.entries(gathering.participantHomeRooms)) {
        const agent = updatedAgents[agentId];
        if (!agent) continue;

        // Move to home room — position will be recomputed via recomputeRoomPositions below
        updatedAgents[agentId] = { ...agent, roomId: homeRoomId };
        affectedRooms.add(homeRoomId);
      }

      // Recompute grid positions for all affected rooms
      for (const roomId of affectedRooms) {
        const room =
          getCurrentRooms().find((r) => r.roomId === roomId) ??
          BUILDING.rooms.find((r) => r.roomId === roomId);
        if (room) {
          updatedAgents = recomputeRoomPositions(updatedAgents, roomId, room);
        }
      }

      const dispersedEvent: AgentEvent = {
        id: nextAgentEventId(),
        type: "agents.meeting_dispersed",
        ts: now,
        payload: {
          meeting_id: meetingId,
          meeting_room_id: gathering.roomId,
          participant_ids: Object.keys(gathering.participantHomeRooms),
          participant_count: Object.keys(gathering.participantHomeRooms).length,
        },
      };

      return {
        agents: updatedAgents,
        meetingGatherings: {
          ...state.meetingGatherings,
          [meetingId]: { ...gathering, status: "dispersed" },
        },
        events: [...state.events, dispersedEvent],
      };
    });
  },

  // ── AC 9.2: Replay support ────────────────────────────────────────────────

  _enterReplayMode: () => {
    const { agents } = get();
    // Deep-copy the agents map so mutations during replay don't affect the save
    const saved: Record<string, AgentRuntimeState> = {};
    for (const [id, a] of Object.entries(agents)) {
      saved[id] = { ...a, localPosition: { ...a.localPosition }, worldPosition: { ...a.worldPosition } };
    }
    set({ _savedLiveAgents: saved });
  },

  _exitReplayMode: () => {
    const { _savedLiveAgents } = get();
    if (_savedLiveAgents !== null) {
      set({ agents: _savedLiveAgents, _savedLiveAgents: null });
    }
  },

  _applyReplayAgents: (replayAgents) => {
    // Silent update — does NOT append to events array
    set({ agents: replayAgents });
  },
}));

// ── Utility functions (exported) ────────────────────────────────────────────

/**
 * Derive a compatible AgentStatus from a lifecycle state transition (Sub-AC 15a).
 * Used when a lifecycle FSM transition implicitly changes the operational status.
 */
export function deriveStatusFromLifecycle(
  lifecycleState: AgentLifecycleState,
  currentStatus: AgentStatus,
): AgentStatus {
  switch (lifecycleState) {
    case "initializing": return "inactive";
    case "ready":        return "idle";
    case "active":       return "active";
    case "paused":       return currentStatus === "error" ? "error" : "idle";
    case "suspended":    return "idle";
    case "migrating":    return "busy";
    case "terminating":  return "busy";
    case "terminated":   return "terminated";
    case "crashed":      return "error";
    default:             return currentStatus;
  }
}
