/**
 * spatial-store.ts — Zustand store for 3D spatial state.
 *
 * Event-sourced spatial state management. The store holds:
 *   - Building definition (loaded from YAML or static fallback)
 *   - Room states (occupancy, activity, highlight)
 *   - Spatial events log (append-only, for replay)
 *   - Loading state
 *
 * All mutations are recorded as spatial events, enabling
 * the replay and self-improvement capabilities.
 */
import { create } from "zustand";
import type { BuildingDef, RoomDef } from "../data/building.js";
import { BUILDING } from "../data/building.js";
import type { RoomPlacementEntry } from "../data/procedural-layout.js";

// ── Spatial Event Types ──────────────────────────────────────────────

export type CameraMode = "perspective" | "birdsEye";

/** Bird's-eye view sub-presets. "pixel-office" adds pixel-art floor textures and integer zoom snap. */
export type BirdsEyePreset = "default" | "pixel-office";

/**
 * Named camera presets for the perspective orbit camera.
 * Defined here (in the store) so both CameraRig and App.tsx can import
 * the type without a circular dependency.
 */
export type CameraPreset =
  | "overview"
  | "overhead"
  | "cutaway"
  | "groundFloor"
  | "opsFloor";

export type SpatialEventType =
  | "building.loaded"
  | "building.load_failed"
  | "building.selected"
  | "building.deselected"
  | "building.renamed"
  | "floor.renamed"
  | "office.start_all"
  | "office.stop_all"
  | "room.created"
  | "room.updated"
  | "room.member_joined"
  | "room.member_left"
  | "room.highlight"
  | "room.unhighlight"
  | "room.selected"
  | "room.deselected"
  | "room.focused"
  | "room.unfocused"
  | "floor.visibility_changed"
  | "camera.preset_changed"
  | "camera.mode_changed"
  | "camera.zoom_changed"
  | "camera.pan_changed"
  | "camera.reset"
  | "navigation.drilled_floor"
  | "navigation.drilled_room"
  | "navigation.drilled_agent"
  | "navigation.ascended"
  | "navigation.reset"
  | "surface.clicked"
  | "surface.dismissed"
  | "room.paused"
  | "room.resumed"
  | "room.label_updated"
  | "room.parent_updated"
  | "meeting.convene_requested";

// ── Meeting Convocation ──────────────────────────────────────────────────────

/**
 * Structured meeting convocation request emitted when the user triggers the
 * "Convene Meeting" action on a room or office node in the 3D GUI.
 *
 * Matches the MeetingStartedPayload shape from @conitens/protocol so it
 * can be forwarded directly to the control-plane event bus.
 */
export interface MeetingConveneRequest {
  /** Room in which the meeting will take place. */
  roomId: string;
  /** Short human-readable meeting title / topic. */
  topic: string;
  /** Optional detailed agenda for the meeting. */
  agenda: string;
  /** IDs of agents/users to include as participants. */
  participantIds: string[];
  /**
   * Soft deadline in milliseconds from meeting start.
   * Zero or absent means no time limit.
   */
  scheduledDurationMs?: number;
  /** Who requested the meeting ("user" for manual GUI triggers). */
  requestedBy: string;
}

// ── Drill-Down Navigation ─────────────────────────────────────────────

/**
 * Drill-down hierarchy level.
 * Represents how deep the user has navigated into the spatial hierarchy:
 *   building → floor → room → agent
 */
export type DrillLevel = "building" | "floor" | "room" | "agent";

export interface SpatialEvent {
  id: string;
  type: SpatialEventType;
  ts: number;
  payload: Record<string, unknown>;
}

// ── Room Runtime State ───────────────────────────────────────────────

export interface RoomRuntimeState {
  /** Currently active members (from live events) */
  activeMembers: string[];
  /** Room activity level: idle, active, busy, error */
  activity: "idle" | "active" | "busy" | "error";
  /** Whether the room is highlighted (hovered/focused) */
  highlighted: boolean;
  /** Whether the room is selected */
  selected: boolean;
  /** Last event timestamp for this room */
  lastEventTs: number;
  /**
   * Whether the room has been paused via a lifecycle command.
   * Paused rooms display a distinctive badge and suppress agent activity.
   * Event-sourced: produces room.paused / room.resumed events.
   */
  paused: boolean;
}

// ── Store Shape ──────────────────────────────────────────────────────

interface SpatialStoreState {
  /** The building definition — starts with static, replaced by dynamic */
  building: BuildingDef;
  /** Per-room runtime state */
  roomStates: Record<string, RoomRuntimeState>;
  /** Append-only spatial event log */
  events: SpatialEvent[];
  /** Data source: "static" (hardcoded) or "yaml" (loaded from configs) */
  dataSource: "static" | "yaml";
  /** Loading state */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Selected room ID */
  selectedRoomId: string | null;
  /** Focused room ID (camera target for inspection) */
  focusedRoomId: string | null;
  /** Floor visibility (true = visible) */
  floorVisibility: Record<number, boolean>;
  /** Camera mode: perspective orbit or bird's-eye orthographic */
  cameraMode: CameraMode;
  /**
   * Active perspective camera preset (event-sourced).
   * Stored here so camera state is fully replayable from the event log.
   */
  cameraPreset: CameraPreset;
  /** Bird's-eye sub-preset ("default" or "pixel-office") */
  birdsEyePreset: BirdsEyePreset;
  /** Bird's-eye zoom level (orthographic frustum half-size) */
  birdsEyeZoom: number;
  /** Bird's-eye pan offset [x, z] from building center */
  birdsEyePan: [number, number];
  /**
   * Procedural room-creation log — one entry per room, written when
   * the building loads from YAML.  Append-only for replay / audit.
   * Empty when using the static fallback.
   */
  roomCreationLog: RoomPlacementEntry[];

  // ── Drill-Down Navigation State ───────────────────────────────────
  /**
   * Current drill-down level: building (default) → floor → room → agent.
   * Single-clicking a node transitions down one level.
   * ESC / back-button ascends one level.
   */
  drillLevel: DrillLevel;
  /** Floor index when drilled into floor/room/agent level (null at building) */
  drillFloor: number | null;
  /** Room ID when drilled into room/agent level (null at building/floor) */
  drillRoom: string | null;
  /** Agent ID when drilled into agent level (null above agent) */
  drillAgent: string | null;

  // ── Building / Office Selection State (Sub-AC 4a) ────────────────
  /**
   * Whether the building node itself is explicitly selected (context-panel open).
   * Distinct from drill-level navigation — this flag gates the BuildingContextPanel.
   * True when the user clicks the building header or the building click zone at
   * the "building" drill level without drilling further.
   */
  buildingSelected: boolean;

  // ── Surface Interaction State ─────────────────────────────────────
  /**
   * ID of the currently active (focused) display surface.
   * Set when user clicks a diegetic panel (monitor, wall panel, hologram).
   * Null means no surface is focused.
   */
  activeSurfaceId: string | null;
  /**
   * Room ID of the currently active surface (for detail panel context).
   */
  activeSurfaceRoomId: string | null;

  // ── Actions ──────────────────────────────────────────────────────
  /** Load a building definition (from YAML or other source) */
  loadBuilding: (building: BuildingDef, source: "static" | "yaml") => void;
  /**
   * Store the procedural room-creation log produced by the layout engine.
   * Called once after a successful YAML load + layout pass.
   */
  setRoomCreationLog: (log: RoomPlacementEntry[]) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Select a room */
  selectRoom: (roomId: string | null) => void;
  /** Highlight a room (hover) */
  highlightRoom: (roomId: string) => void;
  /** Unhighlight a room */
  unhighlightRoom: (roomId: string) => void;
  /** Focus camera on a room (for inspection) */
  focusRoom: (roomId: string | null) => void;
  /** Toggle floor visibility */
  toggleFloorVisibility: (floor: number) => void;
  /** Set camera mode (perspective or birdsEye) */
  setCameraMode: (mode: CameraMode) => void;
  /**
   * Set the active perspective camera preset.
   * Records a camera.preset_changed event for replay / audit.
   */
  setCameraPreset: (preset: CameraPreset) => void;
  /**
   * Reset both camera mode to perspective/overview and bird's-eye view
   * to the default centered position.  Records a camera.reset event.
   */
  resetCamera: () => void;
  /** Set bird's-eye sub-preset ("default" or "pixel-office") */
  setBirdsEyePreset: (preset: BirdsEyePreset) => void;
  /** Set bird's-eye zoom level */
  setBirdsEyeZoom: (zoom: number) => void;
  /** Set bird's-eye pan offset */
  setBirdsEyePan: (pan: [number, number]) => void;
  /** Update room activity from a live event */
  updateRoomActivity: (roomId: string, activity: RoomRuntimeState["activity"]) => void;
  /** Record a member joining a room */
  memberJoined: (roomId: string, memberId: string) => void;
  /** Record a member leaving a room */
  memberLeft: (roomId: string, memberId: string) => void;
  /** Get rooms for a given floor (computed) */
  getRoomsForFloor: (floor: number) => RoomDef[];
  /** Get a room by ID */
  getRoomById: (roomId: string) => RoomDef | undefined;
  /** Get room runtime state */
  getRoomState: (roomId: string) => RoomRuntimeState;

  // ── Drill-Down Navigation Actions ─────────────────────────────────
  /**
   * Drill into a floor — transitions camera to floor-level view.
   * Sets drillLevel → "floor".
   */
  drillIntoFloor: (floorIndex: number) => void;
  /**
   * Drill into a room — transitions camera to room-level view.
   * Also selects + focuses the room.
   * Sets drillLevel → "room".
   */
  drillIntoRoom: (roomId: string) => void;
  /**
   * Drill into an agent — transitions camera to agent-level view.
   * Also selects the agent.
   * Sets drillLevel → "agent".
   */
  drillIntoAgent: (agentId: string, worldPosition: { x: number; y: number; z: number }) => void;
  /**
   * Ascend one level in the drill-down hierarchy.
   * agent → room → floor → building
   * Called by ESC key or back-button.
   */
  drillAscend: () => void;
  /**
   * Reset navigation to the building-level view (overview).
   */
  drillReset: () => void;

  // ── Room Lifecycle Commands ────────────────────────────────────────
  /**
   * Pause a room — suppresses agent activity and shows a PAUSED badge.
   * Records a room.paused event for full audit / replay.
   * Idempotent: no-op if room is already paused.
   */
  pauseRoom: (roomId: string) => void;
  /**
   * Resume a paused room — clears the PAUSED badge.
   * Records a room.resumed event for full audit / replay.
   * Idempotent: no-op if room is not paused.
   */
  resumeRoom: (roomId: string) => void;

  // ── Room Label & Hierarchy Editing ────────────────────────────────
  /**
   * Update a room's display name/label at runtime.
   * Records a room.label_updated event for audit / replay.
   * No-op if the room doesn't exist or the name hasn't changed.
   */
  updateRoomLabel: (roomId: string, newName: string) => void;
  /**
   * Update a room's parent relationship in the hierarchy.
   * Records a room.parent_updated event for audit / replay.
   * Pass null as parentRoomId to remove the parent relationship.
   * No-op if the room doesn't exist.
   */
  updateRoomParent: (roomId: string, parentRoomId: string | null) => void;

  // ── Building / Office Interactivity (Sub-AC 4a) ──────────────────
  /**
   * Select or deselect the building node (gates BuildingContextPanel visibility).
   * Records building.selected / building.deselected events for audit trail.
   * Idempotent: no-op if already in the target state.
   */
  selectBuilding: (selected: boolean) => void;
  /**
   * Rename the building — updates building.name in state and records a
   * building.renamed event for full record transparency.
   * No-op if the name is unchanged.
   */
  updateBuildingName: (name: string) => void;
  /**
   * Rename a floor/office — updates the matching FloorDef.name in state and
   * records a floor.renamed event for full record transparency.
   * No-op if the floor is not found or the name is unchanged.
   */
  updateFloorName: (floor: number, name: string) => void;
  /**
   * Record an "office.start_all" or "office.stop_all" event when the GUI
   * triggers a bulk lifecycle command.
   *
   * The event is written here for record transparency; actual agent state
   * mutations are performed by agent-store.startAllAgentsInScope /
   * stopAllAgentsInScope so that agent lifecycle rules (guard conditions,
   * per-agent events) are correctly enforced.
   */
  recordOfficeBulkLifecycle: (
    type: "office.start_all" | "office.stop_all",
    scope: "building" | "floor",
    floorIndex?: number,
  ) => void;

  // ── Surface Interaction Actions ───────────────────────────────────
  /**
   * Set the active display surface (called when user clicks a diegetic panel).
   * Pass null to dismiss any active panel.
   * Records surface.clicked / surface.dismissed events for event sourcing.
   */
  setActiveSurface: (surfaceId: string | null, roomId?: string | null) => void;

  // ── Meeting Convocation ────────────────────────────────────────────
  /**
   * Room ID for which the "Convene Meeting" dialog is currently open.
   * Null when the dialog is closed.
   * Set by right-click on a 3D room node or via the RoomDetailPanel button.
   */
  conveneDialogRoomId: string | null;
  /**
   * Open the "Convene Meeting" dialog for a specific room.
   * Also selects the room so the RoomDetailPanel is visible.
   */
  openConveneDialog: (roomId: string) => void;
  /**
   * Close the "Convene Meeting" dialog without submitting.
   */
  closeConveneDialog: () => void;
  /**
   * Submit a meeting convocation request.
   *
   * Records a `meeting.convene_requested` event to the append-only spatial
   * event log (record transparency) and attempts to forward the request to
   * the control-plane event bus via a fire-and-forget HTTP POST.
   * Closes the convene dialog after submission.
   */
  convokeMeeting: (request: MeetingConveneRequest) => void;

  // ── AC 9.2: Replay support ────────────────────────────────────────
  /**
   * Saved live room states from before replay mode was entered.
   * Null when in live mode.
   */
  _savedLiveRoomStates: Record<string, RoomRuntimeState> | null;
  /**
   * Save current room states and prepare for replay mode.
   * Called by use-replay-engine when transitioning to replay.
   * Does NOT emit events.
   */
  _enterReplayMode: () => void;
  /**
   * Restore saved live room states and exit replay mode.
   * Called by use-replay-engine when returning to live mode.
   * Does NOT emit events.
   */
  _exitReplayMode: () => void;
  /**
   * Directly apply a reconstructed room states map (replay state).
   * Bypasses event logging — used exclusively by the replay engine.
   */
  _applyReplayRoomStates: (roomStates: Record<string, RoomRuntimeState>) => void;
}

/** Generate a simple unique ID for spatial events */
let eventCounter = 0;
function nextEventId(): string {
  return `se-${Date.now()}-${++eventCounter}`;
}

/** Create the default runtime state for a room */
function defaultRoomState(room: RoomDef): RoomRuntimeState {
  return {
    activeMembers: [...room.members],
    activity: room.members.length > 0 ? "idle" : "idle",
    highlighted: false,
    selected: false,
    lastEventTs: 0,
    paused: false,
  };
}

/** Initialize room states from a building definition */
function initRoomStates(building: BuildingDef): Record<string, RoomRuntimeState> {
  const states: Record<string, RoomRuntimeState> = {};
  for (const room of building.rooms) {
    states[room.roomId] = defaultRoomState(room);
  }
  return states;
}

/** Initialize floor visibility (all visible) */
function initFloorVisibility(building: BuildingDef): Record<number, boolean> {
  const vis: Record<number, boolean> = {};
  for (const floor of building.floors) {
    vis[floor.floor] = true;
  }
  return vis;
}

// ── Store ────────────────────────────────────────────────────────────

export const useSpatialStore = create<SpatialStoreState>((set, get) => ({
  building: BUILDING,
  roomStates: initRoomStates(BUILDING),
  events: [],
  dataSource: "static",
  loading: false,
  error: null,
  selectedRoomId: null,
  focusedRoomId: null,
  floorVisibility: initFloorVisibility(BUILDING),
  cameraMode: "perspective" as CameraMode,
  cameraPreset: "overview" as CameraPreset,
  birdsEyePreset: "pixel-office" as BirdsEyePreset,
  birdsEyeZoom: 10,
  birdsEyePan: [0, 0] as [number, number],
  roomCreationLog: [],
  // Drill-down navigation — start at building overview level
  drillLevel: "building" as DrillLevel,
  drillFloor: null,
  drillRoom: null,
  drillAgent: null,
  // Building / office selection — not selected initially
  buildingSelected: false,
  // Surface interaction — no surface active initially
  activeSurfaceId: null,
  activeSurfaceRoomId: null,
  // Replay support — null when in live mode
  _savedLiveRoomStates: null,
  // Meeting convocation dialog — closed by default
  conveneDialogRoomId: null,

  loadBuilding: (building, source) => {
    const ts = Date.now();

    // One building.loaded event + one room.created event per room.
    // This gives us a complete event trace of every procedurally-generated
    // room, enabling full replay and self-improvement analysis.
    const events: SpatialEvent[] = [
      {
        id: nextEventId(),
        type: "building.loaded",
        ts,
        payload: {
          buildingId: building.buildingId,
          roomCount: building.rooms.length,
          source,
        },
      },
      // Per-room creation events — record transparency for every room
      ...building.rooms.map((room) => ({
        id: nextEventId(),
        type: "room.created" as SpatialEventType,
        ts,
        payload: {
          roomId: room.roomId,
          name: room.name,
          floor: room.floor,
          roomType: room.roomType,
          position: room.position,
          dimensions: room.dimensions,
          members: room.members,
          colorAccent: room.colorAccent,
        },
      })),
    ];

    set({
      building,
      roomStates: initRoomStates(building),
      dataSource: source,
      loading: false,
      error: null,
      floorVisibility: initFloorVisibility(building),
      events: [...get().events, ...events],
    });
  },

  setRoomCreationLog: (log) => set({ roomCreationLog: log }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => {
    if (error) {
      const event: SpatialEvent = {
        id: nextEventId(),
        type: "building.load_failed",
        ts: Date.now(),
        payload: { error },
      };
      set((state) => ({
        error,
        loading: false,
        events: [...state.events, event],
      }));
    } else {
      set({ error });
    }
  },

  selectRoom: (roomId) => {
    const prev = get().selectedRoomId;
    const events: SpatialEvent[] = [];

    if (prev) {
      events.push({
        id: nextEventId(),
        type: "room.deselected",
        ts: Date.now(),
        payload: { roomId: prev },
      });
    }
    if (roomId) {
      events.push({
        id: nextEventId(),
        type: "room.selected",
        ts: Date.now(),
        payload: { roomId },
      });
    }

    set((state) => {
      const roomStates = { ...state.roomStates };
      if (prev && roomStates[prev]) {
        roomStates[prev] = { ...roomStates[prev], selected: false };
      }
      if (roomId && roomStates[roomId]) {
        roomStates[roomId] = { ...roomStates[roomId], selected: true };
      }
      return {
        selectedRoomId: roomId,
        roomStates,
        events: [...state.events, ...events],
      };
    });
  },

  focusRoom: (roomId) => {
    const prev = get().focusedRoomId;
    const events: SpatialEvent[] = [];

    if (prev) {
      events.push({
        id: nextEventId(),
        type: "room.unfocused",
        ts: Date.now(),
        payload: { roomId: prev },
      });
    }
    if (roomId) {
      events.push({
        id: nextEventId(),
        type: "room.focused",
        ts: Date.now(),
        payload: { roomId },
      });
    }

    set((state) => ({
      focusedRoomId: roomId,
      events: [...state.events, ...events],
    }));
  },

  highlightRoom: (roomId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs || rs.highlighted) return state;
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: { ...rs, highlighted: true },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.highlight" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId },
          },
        ],
      };
    });
  },

  unhighlightRoom: (roomId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs || !rs.highlighted) return state;
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: { ...rs, highlighted: false },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.unhighlight" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId },
          },
        ],
      };
    });
  },

  toggleFloorVisibility: (floor) => {
    set((state) => ({
      floorVisibility: {
        ...state.floorVisibility,
        [floor]: !state.floorVisibility[floor],
      },
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "floor.visibility_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { floor, visible: !state.floorVisibility[floor] },
        },
      ],
    }));
  },

  setCameraMode: (mode) => {
    const prev = get().cameraMode;
    if (prev === mode) return;
    set((state) => ({
      cameraMode: mode,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "camera.mode_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { from: prev, to: mode },
        },
      ],
    }));
  },

  setCameraPreset: (preset) => {
    const prev = get().cameraPreset;
    if (prev === preset) return;
    set((state) => ({
      cameraPreset: preset,
      // Switching a preset implicitly activates perspective mode
      cameraMode: "perspective" as CameraMode,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "camera.preset_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { from: prev, to: preset },
        },
      ],
    }));
  },

  resetCamera: () => {
    set((state) => ({
      cameraMode: "perspective" as CameraMode,
      cameraPreset: "overview" as CameraPreset,
      birdsEyeZoom: 10,
      birdsEyePan: [0, 0] as [number, number],
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "camera.reset" as SpatialEventType,
          ts: Date.now(),
          payload: { to: "overview" },
        },
      ],
    }));
  },

  setBirdsEyePreset: (preset) => {
    const prev = get().birdsEyePreset;
    if (prev === preset) return;
    set((state) => ({
      birdsEyePreset: preset,
      // Switching to a bird's-eye preset implicitly activates birdsEye mode
      cameraMode: "birdsEye" as CameraMode,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "birdsEye.preset_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { from: prev, to: preset },
        },
      ],
    }));
  },

  setBirdsEyeZoom: (zoom) => {
    const clamped = Math.max(3, Math.min(25, zoom));
    set((state) => ({
      birdsEyeZoom: clamped,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "camera.zoom_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { zoom: clamped },
        },
      ],
    }));
  },

  setBirdsEyePan: (pan) => {
    set((state) => ({
      birdsEyePan: pan,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "camera.pan_changed" as SpatialEventType,
          ts: Date.now(),
          payload: { x: pan[0], z: pan[1] },
        },
      ],
    }));
  },

  updateRoomActivity: (roomId, activity) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs) return state;
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: { ...rs, activity, lastEventTs: Date.now() },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.updated" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId, activity },
          },
        ],
      };
    });
  },

  memberJoined: (roomId, memberId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs) return state;
      if (rs.activeMembers.includes(memberId)) return state;
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: {
            ...rs,
            activeMembers: [...rs.activeMembers, memberId],
            lastEventTs: Date.now(),
          },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.member_joined" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId, memberId },
          },
        ],
      };
    });
  },

  memberLeft: (roomId, memberId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs) return state;
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: {
            ...rs,
            activeMembers: rs.activeMembers.filter((m) => m !== memberId),
            lastEventTs: Date.now(),
          },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.member_left" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId, memberId },
          },
        ],
      };
    });
  },

  // ── Drill-Down Navigation Implementations ────────────────────────

  drillIntoFloor: (floorIndex) => {
    set((state) => ({
      drillLevel: "floor" as DrillLevel,
      drillFloor: floorIndex,
      drillRoom: null,
      drillAgent: null,
      // Clear room/agent selection when ascending back to floor
      selectedRoomId: null,
      focusedRoomId: null,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "navigation.drilled_floor" as SpatialEventType,
          ts: Date.now(),
          payload: { floorIndex, from: state.drillLevel },
        },
      ],
    }));
  },

  drillIntoRoom: (roomId) => {
    const room = get().building.rooms.find((r) => r.roomId === roomId);
    if (!room) return;
    const prev = get().selectedRoomId;
    const roomStates = { ...get().roomStates };
    if (prev && roomStates[prev]) {
      roomStates[prev] = { ...roomStates[prev], selected: false };
    }
    if (roomStates[roomId]) {
      roomStates[roomId] = { ...roomStates[roomId], selected: true };
    }
    set((state) => ({
      drillLevel: "room" as DrillLevel,
      drillFloor: room.floor,
      drillRoom: roomId,
      drillAgent: null,
      selectedRoomId: roomId,
      focusedRoomId: roomId,
      roomStates,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "navigation.drilled_room" as SpatialEventType,
          ts: Date.now(),
          payload: { roomId, floor: room.floor, from: state.drillLevel },
        },
        {
          id: nextEventId(),
          type: "room.selected" as SpatialEventType,
          ts: Date.now(),
          payload: { roomId },
        },
        {
          id: nextEventId(),
          type: "room.focused" as SpatialEventType,
          ts: Date.now(),
          payload: { roomId },
        },
      ],
    }));
  },

  drillIntoAgent: (agentId, worldPosition) => {
    set((state) => ({
      drillLevel: "agent" as DrillLevel,
      drillAgent: agentId,
      // Preserve floor/room context from current state
      drillFloor: state.drillFloor,
      drillRoom: state.drillRoom,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "navigation.drilled_agent" as SpatialEventType,
          ts: Date.now(),
          payload: {
            agentId,
            worldPosition,
            from: state.drillLevel,
            fromRoom: state.drillRoom,
          },
        },
      ],
    }));
  },

  drillAscend: () => {
    const { drillLevel, drillFloor, drillRoom } = get();

    if (drillLevel === "agent") {
      // agent → room (keep room context, just unset agent)
      set((state) => ({
        drillLevel: "room" as DrillLevel,
        drillAgent: null,
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "navigation.ascended" as SpatialEventType,
            ts: Date.now(),
            payload: { from: "agent", to: "room", roomId: drillRoom },
          },
        ],
      }));
    } else if (drillLevel === "room") {
      // room → floor (clear room selection)
      const roomStates = { ...get().roomStates };
      if (drillRoom && roomStates[drillRoom]) {
        roomStates[drillRoom] = { ...roomStates[drillRoom], selected: false };
      }
      set((state) => ({
        drillLevel: "floor" as DrillLevel,
        drillRoom: null,
        drillAgent: null,
        selectedRoomId: null,
        focusedRoomId: null,
        roomStates,
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "navigation.ascended" as SpatialEventType,
            ts: Date.now(),
            payload: { from: "room", to: "floor", floorIndex: drillFloor },
          },
        ],
      }));
    } else if (drillLevel === "floor") {
      // floor → building (reset to overview)
      set((state) => ({
        drillLevel: "building" as DrillLevel,
        drillFloor: null,
        drillRoom: null,
        drillAgent: null,
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "navigation.ascended" as SpatialEventType,
            ts: Date.now(),
            payload: { from: "floor", to: "building" },
          },
        ],
      }));
    }
    // building level: no-op (already at root)
  },

  drillReset: () => {
    const roomStates = { ...get().roomStates };
    const prevRoom = get().selectedRoomId;
    if (prevRoom && roomStates[prevRoom]) {
      roomStates[prevRoom] = { ...roomStates[prevRoom], selected: false };
    }
    set((state) => ({
      drillLevel: "building" as DrillLevel,
      drillFloor: null,
      drillRoom: null,
      drillAgent: null,
      selectedRoomId: null,
      focusedRoomId: null,
      roomStates,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "navigation.reset" as SpatialEventType,
          ts: Date.now(),
          payload: { from: state.drillLevel },
        },
      ],
    }));
  },

  // ── Room Lifecycle Commands ────────────────────────────────────────

  pauseRoom: (roomId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs || rs.paused) return state; // idempotent
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: { ...rs, paused: true, activity: "idle" as const },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.paused" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId },
          },
        ],
      };
    });
  },

  resumeRoom: (roomId) => {
    set((state) => {
      const rs = state.roomStates[roomId];
      if (!rs || !rs.paused) return state; // idempotent
      return {
        roomStates: {
          ...state.roomStates,
          [roomId]: { ...rs, paused: false },
        },
        events: [
          ...state.events,
          {
            id: nextEventId(),
            type: "room.resumed" as SpatialEventType,
            ts: Date.now(),
            payload: { roomId },
          },
        ],
      };
    });
  },

  // ── Room Label & Hierarchy ─────────────────────────────────────────

  updateRoomLabel: (roomId, newName) => {
    const room = get().building.rooms.find((r) => r.roomId === roomId);
    if (!room || room.name === newName) return; // no-op
    set((state) => ({
      building: {
        ...state.building,
        rooms: state.building.rooms.map((r) =>
          r.roomId === roomId ? { ...r, name: newName } : r,
        ),
      },
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "room.label_updated" as SpatialEventType,
          ts: Date.now(),
          payload: { roomId, from_name: room.name, to_name: newName },
        },
      ],
    }));
  },

  updateRoomParent: (roomId, parentRoomId) => {
    const room = get().building.rooms.find((r) => r.roomId === roomId);
    if (!room) return; // no-op — room not found
    const prevParent = (room as RoomDef & { parentRoomId?: string | null }).parentRoomId ?? null;
    if (prevParent === parentRoomId) return; // no-op — same parent
    set((state) => ({
      building: {
        ...state.building,
        rooms: state.building.rooms.map((r) =>
          r.roomId === roomId
            ? ({ ...r, parentRoomId } as RoomDef & { parentRoomId?: string | null })
            : r,
        ),
      },
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "room.parent_updated" as SpatialEventType,
          ts: Date.now(),
          payload: { roomId, from_parent: prevParent, to_parent: parentRoomId },
        },
      ],
    }));
  },

  // ── Building / Office Interactivity (Sub-AC 4a) ──────────────────

  selectBuilding: (selected) => {
    const current = get().buildingSelected;
    if (current === selected) return; // idempotent
    set((state) => ({
      buildingSelected: selected,
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: (selected ? "building.selected" : "building.deselected") as SpatialEventType,
          ts: Date.now(),
          payload: { selected, building_id: state.building.buildingId },
        },
      ],
    }));
  },

  updateBuildingName: (name) => {
    const current = get().building.name;
    if (current === name) return; // no-op
    set((state) => ({
      building: { ...state.building, name },
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "building.renamed" as SpatialEventType,
          ts: Date.now(),
          payload: {
            building_id: state.building.buildingId,
            from_name: current,
            to_name: name,
          },
        },
      ],
    }));
  },

  updateFloorName: (floor, name) => {
    const floorDef = get().building.floors.find((f) => f.floor === floor);
    if (!floorDef || floorDef.name === name) return; // no-op
    set((state) => ({
      building: {
        ...state.building,
        floors: state.building.floors.map((f) =>
          f.floor === floor ? { ...f, name } : f,
        ),
      },
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: "floor.renamed" as SpatialEventType,
          ts: Date.now(),
          payload: {
            floor,
            from_name: floorDef.name,
            to_name: name,
          },
        },
      ],
    }));
  },

  recordOfficeBulkLifecycle: (type, scope, floorIndex) => {
    set((state) => ({
      events: [
        ...state.events,
        {
          id: nextEventId(),
          type: type as SpatialEventType,
          ts: Date.now(),
          payload: {
            scope,
            floor_index: floorIndex ?? null,
            building_id: state.building.buildingId,
            triggered_by: "office_layer_control",
          },
        },
      ],
    }));
  },

  // ── Surface Interaction ────────────────────────────────────────────

  setActiveSurface: (surfaceId, roomId) => {
    const prev = get().activeSurfaceId;
    const events: SpatialEvent[] = [];

    if (prev && prev !== surfaceId) {
      events.push({
        id: nextEventId(),
        type: "surface.dismissed",
        ts: Date.now(),
        payload: { surfaceId: prev },
      });
    }
    if (surfaceId) {
      events.push({
        id: nextEventId(),
        type: "surface.clicked",
        ts: Date.now(),
        payload: { surfaceId, roomId: roomId ?? null },
      });
    }

    set((state) => ({
      activeSurfaceId: surfaceId,
      activeSurfaceRoomId: roomId ?? null,
      events: [...state.events, ...events],
    }));
  },

  getRoomsForFloor: (floor) => {
    return get().building.rooms.filter((r) => {
      if (r.roomId === "stairwell") return floor === 0 || floor === 1;
      return r.floor === floor;
    });
  },

  getRoomById: (roomId) => {
    return get().building.rooms.find((r) => r.roomId === roomId);
  },

  getRoomState: (roomId) => {
    return (
      get().roomStates[roomId] ?? {
        activeMembers: [],
        activity: "idle" as const,
        highlighted: false,
        selected: false,
        lastEventTs: 0,
        paused: false,       // AC 4: required by RoomRuntimeState; default false for unknown rooms
      }
    );
  },

  // ── AC 9.2: Replay support ────────────────────────────────────────────────

  _enterReplayMode: () => {
    const { roomStates } = get();
    // Deep-copy room states so mutations during replay don't affect the save
    const saved: Record<string, RoomRuntimeState> = {};
    for (const [id, rs] of Object.entries(roomStates)) {
      saved[id] = { ...rs, activeMembers: [...rs.activeMembers] };
    }
    set({ _savedLiveRoomStates: saved });
  },

  _exitReplayMode: () => {
    const { _savedLiveRoomStates } = get();
    if (_savedLiveRoomStates !== null) {
      set({ roomStates: _savedLiveRoomStates, _savedLiveRoomStates: null });
    }
  },

  _applyReplayRoomStates: (replayRoomStates) => {
    // Silent update — does NOT append to events array
    set({ roomStates: replayRoomStates });
  },

  // ── Meeting Convocation ─────────────────────────────────────────────────

  openConveneDialog: (roomId) => {
    // Also select the room so the RoomDetailPanel becomes visible
    const prev = get().selectedRoomId;
    const evts: SpatialEvent[] = [];
    if (prev && prev !== roomId) {
      evts.push({ id: nextEventId(), type: "room.deselected", ts: Date.now(), payload: { roomId: prev } });
    }
    evts.push({ id: nextEventId(), type: "room.selected", ts: Date.now(), payload: { roomId } });
    set((state) => {
      const roomStates = { ...state.roomStates };
      if (prev && roomStates[prev]) roomStates[prev] = { ...roomStates[prev], selected: false };
      if (roomStates[roomId]) roomStates[roomId] = { ...roomStates[roomId], selected: true };
      return {
        selectedRoomId: roomId,
        conveneDialogRoomId: roomId,
        roomStates,
        events: [...state.events, ...evts],
      };
    });
  },

  closeConveneDialog: () => {
    set({ conveneDialogRoomId: null });
  },

  convokeMeeting: (request) => {
    const meetingId = `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const event: SpatialEvent = {
      id: nextEventId(),
      type: "meeting.convene_requested",
      ts: Date.now(),
      payload: {
        meeting_id: meetingId,
        room_id: request.roomId,
        title: request.topic,
        agenda: request.agenda,
        participant_ids: request.participantIds,
        scheduled_duration_ms: request.scheduledDurationMs,
        initiated_by: request.requestedBy,
      },
    };

    // 1. Append to spatial event log (primary event sourcing — record transparency)
    set((state) => ({
      conveneDialogRoomId: null,
      events: [...state.events, event],
    }));

    // 2. POST to the meeting orchestration HTTP server (port 8081).
    //    On success: dispatch the returned SessionHandle to the meeting store.
    //    On failure: silently ignore — the convene_requested event is preserved
    //    in the spatial event log for full record transparency.
    //
    //    Sub-AC 10b: The backend instantiates a CollaborationSession with role
    //    assignments, shared context, and communication channel, returning a
    //    live SessionHandle that the frontend stores for display.
    const convenePayload = {
      roomId:              request.roomId,
      topic:               request.topic,
      agenda:              request.agenda,
      participantIds:      request.participantIds,
      scheduledDurationMs: request.scheduledDurationMs,
      requestedBy:         request.requestedBy,
      // pass the pre-generated meeting_id so the backend can reuse it
      meeting_id:          meetingId,
    };

    fetch("http://localhost:8081/api/convene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convenePayload),
    })
      .then(async (resp) => {
        if (!resp.ok) return;
        const data = await resp.json() as { success?: boolean; session?: unknown };
        if (data?.success && data?.session) {
          // Lazy import to avoid circular deps — meeting-store is a separate Zustand slice.
          // We use dynamic import so this module doesn't statically depend on meeting-store.
          import("./meeting-store.js")
            .then(({ useMeetingStore }) => {
              // Cast via unknown → SessionHandle: the backend guarantees the shape,
              // and the meeting-store's type guard will surface any mismatch at runtime.
              useMeetingStore.getState().upsertSession(
                data.session as Parameters<
                  typeof useMeetingStore.getState extends () => infer R
                    ? R extends { upsertSession: (h: infer H) => void } ? (h: H) => void : never
                    : never
                >[0],
              );
            })
            .catch(() => {
              // Non-fatal: meeting-store may not be initialised yet
            });
        }
      })
      .catch(() => {
        // Meeting HTTP server may not be running; event preserved in local log
      });

    // 3. Legacy fallback: also forward to the ws-bus HTTP endpoint on port 8080
    //    so existing orchestrators that listen on that port also receive the event.
    const controlPlanePayload = {
      schema: "1.0",
      event_id: event.id,
      type: "meeting.started",
      ts: new Date(event.ts).toISOString(),
      actor: { kind: "user", id: request.requestedBy },
      payload: event.payload,
    };
    fetch("http://localhost:8080/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(controlPlanePayload),
    }).catch(() => {
      // ws-bus port 8080 only handles WebSocket upgrades; HTTP will fail — that's expected
    });
  },
}));
