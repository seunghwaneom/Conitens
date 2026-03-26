/**
 * scene-event-log.ts — Unified append-only scene event log.
 *
 * AC 9.1: Implements the central "recording tape" for the 3D replay system.
 * Captures every scene state change — agent movements, status transitions,
 * room occupancy changes — as a timestamped, sequenced log entry.
 *
 * Design principles (from project constraints):
 *  - Write-only event recording: entries are NEVER mutated after append
 *  - Telemetry stored separately from application event logs (this store is
 *    distinct from agent-store.events / spatial-store.events which are
 *    operational event logs; this is the scene-level recording layer)
 *  - Spatial state managed via event sourcing: all state changes go through
 *    the event log, not direct state manipulation
 *  - Rolling window eviction prevents unbounded memory growth
 *  - Session-scoped: each browser session gets a unique sessionId
 *  - Source-tagged: every entry carries the originating store for filtering
 *
 * Usage:
 *   const { entries, totalRecorded } = useSceneEventLog();
 *   const { recordEntry, startRecording } = useSceneEventLog();
 *
 * The recording mechanism (use-scene-recorder.ts hook) subscribes to
 * agent-store and spatial-store, translates their events into SceneLogEntry
 * records, and appends them here.
 */
import { create } from "zustand";

// ── Scene Event Categories ─────────────────────────────────────────────────

/**
 * Semantic categories for scene log entries.
 * These are stable replay-engine identifiers — add new values
 * rather than changing existing ones to preserve replay compatibility.
 */
export type SceneEventCategory =
  // ── Agent lifecycle ──────────────────────────────────────────────
  | "agent.placed"            // Initial avatar placement on load
  | "agent.moved"             // Avatar relocated to different room
  | "agent.status_changed"    // Operational status transition
  | "agent.task_started"      // Agent began working on a task
  | "agent.task_completed"    // Agent finished a task
  | "agent.selected"          // User selected this agent
  | "agent.deselected"        // User deselected agent
  | "agents.initialized"      // Full batch placement complete
  // ── Room occupancy ───────────────────────────────────────────────
  | "room.member_joined"      // An agent joined a room
  | "room.member_left"        // An agent left a room
  | "room.activity_changed"   // Room activity level updated
  | "room.selected"           // Room selected in UI
  | "room.deselected"         // Room deselected
  | "room.focused"            // Camera focused on room
  | "room.unfocused"          // Room unfocused
  | "room.highlighted"        // Room hovered / highlighted
  | "room.unhighlighted"      // Room hover cleared
  // ── Building ─────────────────────────────────────────────────────
  | "building.loaded"         // Building definition loaded from YAML/static
  | "building.load_failed"    // Building load error
  // ── Navigation (drill-down hierarchy) ────────────────────────────
  | "navigation.drilled_floor"  // User drilled into a floor
  | "navigation.drilled_room"   // User drilled into a room
  | "navigation.drilled_agent"  // User drilled into an agent
  | "navigation.ascended"       // User ascended in hierarchy
  | "navigation.reset"          // Navigation reset to building view
  // ── Camera ───────────────────────────────────────────────────────
  | "camera.preset_changed"   // Perspective preset switched
  | "camera.mode_changed"     // perspective ↔ birdsEye mode
  | "camera.zoom_changed"     // Bird's-eye zoom level changed
  | "camera.pan_changed"      // Bird's-eye pan offset changed
  | "camera.reset"            // Camera reset to default
  // ── Surface (diegetic UI) ─────────────────────────────────────────
  | "surface.clicked"         // User activated a diegetic display panel
  | "surface.dismissed"       // User dismissed a display panel
  // ── Layout bootstrapping (Sub-AC 9a) ─────────────────────────────
  | "layout.init"             // Bootstrap seed event: full initial spatial state
  // ── Recording meta-events ─────────────────────────────────────────
  | "recording.started"       // Recording session began
  | "recording.cleared"       // Log cleared, new session started
  // ── Passthrough ──────────────────────────────────────────────────
  | "unknown";                // Unrecognized source event type

/** Which Zustand store emitted the underlying event */
export type SceneEventSource = "agent" | "spatial" | "system";

// ── Scene Log Entry ───────────────────────────────────────────────────────

/**
 * A single entry in the scene event log.
 *
 * Represents one atomic, state-changing action captured during live
 * simulation. Entries are append-only — they are NEVER mutated after
 * being recorded.
 *
 * Fields are designed to be serialisable to JSON for export / replay.
 */
export interface SceneLogEntry {
  /** Unique entry ID (generated by this log, independent of source store) */
  id: string;
  /** Unix timestamp (ms) — copied from source event */
  ts: number;
  /** ISO-8601 timestamp string for human readability and log export */
  tsIso: string;
  /** Semantic category (stable identifier for replay engine) */
  category: SceneEventCategory;
  /** Originating store */
  source: SceneEventSource;
  /** ID of the source event in the originating store (for cross-referencing) */
  sourceEventId?: string;
  /** Recording session this entry belongs to */
  sessionId: string;
  /**
   * Monotonic sequence number within the session (1-based).
   * Strictly increasing — never reused within a session.
   * Enables gapless replay and ordering without relying on wall-clock.
   */
  seq: number;
  /** Contextual payload (agent ID, room ID, position, status, etc.) */
  payload: Record<string, unknown>;
}

// ── Scene Snapshot ────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of the complete scene state.
 *
 * Snapshots are checkpoint records used by the replay engine to
 * "fast-forward" to a moment in time without replaying every event
 * from the beginning of the session.
 *
 * Taken automatically every SNAPSHOT_INTERVAL log entries.
 */
export interface SceneSnapshot {
  /** Snapshot ID (unique, same format as SceneLogEntry.id) */
  id: string;
  /** When this snapshot was taken (Unix ms) */
  ts: number;
  /** ISO-8601 timestamp */
  tsIso: string;
  /** Session it belongs to */
  sessionId: string;
  /** Log entry seq number at the moment of the snapshot */
  seqAtSnapshot: number;
  /** Per-agent state at snapshot time */
  agents: Record<string, AgentSnapshotState>;
  /** Per-room state at snapshot time */
  rooms: Record<string, RoomSnapshotState>;
}

/** Agent state fields captured in a snapshot */
export interface AgentSnapshotState {
  agentId: string;
  roomId: string;
  status: string;
  worldPosition: { x: number; y: number; z: number };
  currentTaskId: string | null;
}

/** Room state fields captured in a snapshot */
export interface RoomSnapshotState {
  roomId: string;
  activeMembers: string[];
  activity: string;
}

// ── Recording Constants ───────────────────────────────────────────────────

/** Maximum log entries retained in memory (rolling eviction after this) */
export const MAX_LOG_ENTRIES = 10_000;

/**
 * How many log entries between automatic snapshots.
 * Lower values = faster replay seek; higher values = less memory.
 */
export const SNAPSHOT_ENTRY_INTERVAL = 200;

/** Maximum number of snapshots to retain */
export const MAX_SNAPSHOTS = 50;

// ── Store Shape ───────────────────────────────────────────────────────────

export interface SceneEventLogState {
  // ── Data ──────────────────────────────────────────────────────────
  /** Append-only scene event log (rolling window of MAX_LOG_ENTRIES) */
  entries: SceneLogEntry[];
  /**
   * Periodic snapshots enabling replay seek.
   * Rolling window of MAX_SNAPSHOTS.
   */
  snapshots: SceneSnapshot[];
  /** Current recording session identifier (UUID or timestamp-based) */
  sessionId: string;
  /** Whether recording is active (entries are only appended when true) */
  recording: boolean;
  /**
   * Total entries recorded this session (monotonic — survives rolling eviction).
   * Shows the true cumulative event count, not just what's in memory.
   */
  totalRecorded: number;
  /** Current sequence counter (1-based; incremented with every recordEntry call) */
  seq: number;
  /** Unix timestamp (ms) when recording started (null if never started) */
  recordingStartTs: number | null;

  // ── Actions ───────────────────────────────────────────────────────
  /**
   * Start a new recording session.
   * Records a "recording.started" meta-event as the first log entry.
   * No-op if already recording.
   */
  startRecording: () => void;
  /** Pause recording — new events are silently dropped until resumed */
  pauseRecording: () => void;
  /** Resume a previously paused recording */
  resumeRecording: () => void;
  /**
   * Clear the log and begin a fresh session.
   * Issues a new sessionId, resets seq to 1, clears all entries and snapshots.
   * The new session's first entry is a "recording.cleared" meta-event.
   */
  clearLog: () => void;
  /**
   * Record a single scene event.
   *
   * Silently dropped if recording === false.
   * Implements rolling window: oldest entry is evicted when MAX_LOG_ENTRIES reached.
   * Automatically triggers a snapshot every SNAPSHOT_ENTRY_INTERVAL entries
   * (snapshot data must be provided by the recorder hook via takeSnapshot()).
   */
  recordEntry: (
    input: Omit<SceneLogEntry, "id" | "tsIso" | "sessionId" | "seq">,
  ) => void;
  /**
   * Record a batch of entries atomically (single setState call).
   * Useful for processing a burst of source events without intermediate renders.
   */
  recordBatch: (
    inputs: Array<Omit<SceneLogEntry, "id" | "tsIso" | "sessionId" | "seq">>,
  ) => void;
  /**
   * Take a manual snapshot of the current scene state.
   * Called by the recorder hook on a timer, passing agent and room state
   * extracted from agent-store and spatial-store.
   *
   * Does nothing if:
   *   - recording is false
   *   - fewer than SNAPSHOT_ENTRY_INTERVAL entries since last snapshot
   */
  takeSnapshot: (
    agents: Record<string, AgentSnapshotState>,
    rooms: Record<string, RoomSnapshotState>,
  ) => void;
  /**
   * Force an immediate snapshot regardless of the interval gate.
   * Used when the recording is about to be paused or cleared.
   */
  forceSnapshot: (
    agents: Record<string, AgentSnapshotState>,
    rooms: Record<string, RoomSnapshotState>,
  ) => void;

  // ── Selectors ─────────────────────────────────────────────────────
  /** Return all entries with ts >= the given timestamp */
  getEntriesSince: (ts: number) => SceneLogEntry[];
  /** Return all entries in a given seq range [fromSeq, toSeq] (inclusive) */
  getEntriesBySeqRange: (fromSeq: number, toSeq: number) => SceneLogEntry[];
  /** Return all entries with the given category */
  getEntriesByCategory: (category: SceneEventCategory) => SceneLogEntry[];
  /** Return all entries from a specific source store */
  getEntriesBySource: (source: SceneEventSource) => SceneLogEntry[];
  /**
   * Return the nearest snapshot at or before a given timestamp.
   * Returns null if no snapshots exist or all are after ts.
   */
  getNearestSnapshot: (ts: number) => SceneSnapshot | null;
  /**
   * Return the nearest snapshot at or before a given seq number.
   */
  getNearestSnapshotBySeq: (seq: number) => SceneSnapshot | null;
  /**
   * Export the full log as a JSON string.
   * Safe to download or send to analysis tools.
   */
  exportLog: () => string;
}

// ── ID Generation ─────────────────────────────────────────────────────────

let _entryCounter = 0;

function nextEntryId(): string {
  return `sl-${Date.now()}-${++_entryCounter}`;
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Rolling Window Helper ─────────────────────────────────────────────────

/**
 * Append entries to the array, evicting the oldest when the limit is exceeded.
 * Returns a new array (immutable operation).
 */
function appendWithEviction<T>(arr: T[], items: T[], maxSize: number): T[] {
  const combined = [...arr, ...items];
  if (combined.length > maxSize) {
    return combined.slice(combined.length - maxSize);
  }
  return combined;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useSceneEventLog = create<SceneEventLogState>((set, get) => {
  /** Internal helper: build a SceneLogEntry from raw input */
  function buildEntry(
    input: Omit<SceneLogEntry, "id" | "tsIso" | "sessionId" | "seq">,
    sessionId: string,
    seq: number,
  ): SceneLogEntry {
    return {
      id: nextEntryId(),
      tsIso: new Date(input.ts).toISOString(),
      sessionId,
      seq,
      ...input,
    };
  }

  return {
    entries: [],
    snapshots: [],
    sessionId: generateSessionId(),
    recording: false,
    totalRecorded: 0,
    seq: 0,
    recordingStartTs: null,

    // ── startRecording ────────────────────────────────────────────
    startRecording: () => {
      const state = get();
      if (state.recording) return; // Already recording — no-op

      const ts = Date.now();
      const seq = state.seq + 1;
      const startEntry = buildEntry(
        {
          ts,
          category: "recording.started",
          source: "system",
          payload: {
            sessionId: state.sessionId,
            startTs: ts,
          },
        },
        state.sessionId,
        seq,
      );

      set({
        recording: true,
        recordingStartTs: ts,
        seq,
        entries: appendWithEviction(state.entries, [startEntry], MAX_LOG_ENTRIES),
        totalRecorded: state.totalRecorded + 1,
      });
    },

    // ── pauseRecording ────────────────────────────────────────────
    pauseRecording: () => {
      set({ recording: false });
    },

    // ── resumeRecording ───────────────────────────────────────────
    resumeRecording: () => {
      set({ recording: true });
    },

    // ── clearLog ──────────────────────────────────────────────────
    clearLog: () => {
      const state = get();
      const newSessionId = generateSessionId();
      const ts = Date.now();

      const clearEntry = buildEntry(
        {
          ts,
          category: "recording.cleared",
          source: "system",
          payload: {
            newSessionId,
            prevSessionId: state.sessionId,
            prevTotalRecorded: state.totalRecorded,
          },
        },
        newSessionId,
        1,
      );

      set({
        entries: [clearEntry],
        snapshots: [],
        sessionId: newSessionId,
        recording: true,
        totalRecorded: 1,
        seq: 1,
        recordingStartTs: ts,
      });
    },

    // ── recordEntry ───────────────────────────────────────────────
    recordEntry: (input) => {
      const state = get();
      if (!state.recording) return;

      const seq = state.seq + 1;
      const entry = buildEntry(input, state.sessionId, seq);

      set({
        entries: appendWithEviction(state.entries, [entry], MAX_LOG_ENTRIES),
        seq,
        totalRecorded: state.totalRecorded + 1,
      });
    },

    // ── recordBatch ───────────────────────────────────────────────
    recordBatch: (inputs) => {
      const state = get();
      if (!state.recording || inputs.length === 0) return;

      let seq = state.seq;
      const newEntries = inputs.map((input) => {
        seq += 1;
        return buildEntry(input, state.sessionId, seq);
      });

      set({
        entries: appendWithEviction(state.entries, newEntries, MAX_LOG_ENTRIES),
        seq,
        totalRecorded: state.totalRecorded + inputs.length,
      });
    },

    // ── takeSnapshot ──────────────────────────────────────────────
    takeSnapshot: (agents, rooms) => {
      const state = get();
      if (!state.recording) return;

      // Interval gate: skip if insufficient entries since last snapshot
      const lastSnap = state.snapshots[state.snapshots.length - 1];
      if (lastSnap && state.seq - lastSnap.seqAtSnapshot < SNAPSHOT_ENTRY_INTERVAL) {
        return;
      }

      const ts = Date.now();
      const snapshot: SceneSnapshot = {
        id: nextEntryId(),
        ts,
        tsIso: new Date(ts).toISOString(),
        sessionId: state.sessionId,
        seqAtSnapshot: state.seq,
        agents: { ...agents },
        rooms: { ...rooms },
      };

      set({
        snapshots: appendWithEviction(state.snapshots, [snapshot], MAX_SNAPSHOTS),
      });
    },

    // ── forceSnapshot ─────────────────────────────────────────────
    forceSnapshot: (agents, rooms) => {
      const state = get();
      if (!state.recording) return;

      const ts = Date.now();
      const snapshot: SceneSnapshot = {
        id: nextEntryId(),
        ts,
        tsIso: new Date(ts).toISOString(),
        sessionId: state.sessionId,
        seqAtSnapshot: state.seq,
        agents: { ...agents },
        rooms: { ...rooms },
      };

      set({
        snapshots: appendWithEviction(state.snapshots, [snapshot], MAX_SNAPSHOTS),
      });
    },

    // ── getEntriesSince ───────────────────────────────────────────
    getEntriesSince: (ts) => get().entries.filter((e) => e.ts >= ts),

    // ── getEntriesBySeqRange ───────────────────────────────────────
    getEntriesBySeqRange: (fromSeq, toSeq) =>
      get().entries.filter((e) => e.seq >= fromSeq && e.seq <= toSeq),

    // ── getEntriesByCategory ──────────────────────────────────────
    getEntriesByCategory: (category) =>
      get().entries.filter((e) => e.category === category),

    // ── getEntriesBySource ────────────────────────────────────────
    getEntriesBySource: (source) =>
      get().entries.filter((e) => e.source === source),

    // ── getNearestSnapshot ────────────────────────────────────────
    getNearestSnapshot: (ts) => {
      const snaps = get().snapshots;
      if (snaps.length === 0) return null;
      let nearest: SceneSnapshot | null = null;
      for (const snap of snaps) {
        if (snap.ts <= ts) {
          nearest = snap;
        } else {
          break; // snapshots are chronological; no need to continue
        }
      }
      return nearest;
    },

    // ── getNearestSnapshotBySeq ───────────────────────────────────
    getNearestSnapshotBySeq: (seq) => {
      const snaps = get().snapshots;
      if (snaps.length === 0) return null;
      let nearest: SceneSnapshot | null = null;
      for (const snap of snaps) {
        if (snap.seqAtSnapshot <= seq) {
          nearest = snap;
        } else {
          break;
        }
      }
      return nearest;
    },

    // ── exportLog ─────────────────────────────────────────────────
    exportLog: () => {
      const {
        entries,
        snapshots,
        sessionId,
        totalRecorded,
        recordingStartTs,
        seq,
      } = get();
      const exportRecord = {
        schema: "scene-event-log@1.0.0",
        sessionId,
        totalRecorded,
        entriesInMemory: entries.length,
        recordingStartTs,
        exportTs: Date.now(),
        exportTsIso: new Date().toISOString(),
        currentSeq: seq,
        snapshotCount: snapshots.length,
        entries,
        snapshots,
      };
      return JSON.stringify(exportRecord, null, 2);
    },
  };
});
