/**
 * replay-store.ts — Replay controller state for 3D scene playback.
 *
 * AC 9.2: Provides playback state management (play/pause/seek/speed) and
 * coordinates with agent-store, spatial-store, and scene-event-log to
 * reconstruct 3D scene state at any given timestamp.
 *
 * Architecture:
 *  - Pure playback state store (no reconstruction logic here)
 *  - Reconstruction runs in use-replay-engine.ts (the "driver" hook)
 *  - Replay mode suspends live recording in scene-event-log so replay
 *    state changes are NOT captured as new session events
 *  - On exit: live state is restored from saved snapshots in each store
 *
 * Design principles:
 *  - Record transparency: replay mode is always visually indicated
 *  - Write-only EventLog: replay state changes bypass the event log
 *  - Spatial state via event sourcing: scene reconstructed from log entries
 */
import { create } from "zustand";

// ── Playback Speed ─────────────────────────────────────────────────────────

/** Supported playback multipliers */
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
export type ReplaySpeed = typeof REPLAY_SPEEDS[number];

// ── Replay Mode ────────────────────────────────────────────────────────────

/** Whether the system is in live observation or historical replay */
export type ReplayMode = "live" | "replay";

// ── Store Shape ────────────────────────────────────────────────────────────

export interface ReplayStoreState {
  // ── Playback state ─────────────────────────────────────────────────
  /** Current mode: live or replay */
  mode: ReplayMode;
  /** Whether playback is actively advancing */
  playing: boolean;
  /** Playback speed multiplier */
  speed: number;
  /**
   * Playhead position (Unix ms).
   * Within [firstEventTs, lastEventTs] when in replay mode.
   */
  playheadTs: number;
  /**
   * Approximate seq number at the current playhead.
   * Computed from entries during reconstruction.
   */
  playheadSeq: number;

  // ── Timeline range ─────────────────────────────────────────────────
  /** Timestamp of the first log entry (start of seekable range) */
  firstEventTs: number;
  /** Timestamp of the last log entry (end of seekable range) */
  lastEventTs: number;
  /** Total log entries across the seekable range */
  totalLogEntries: number;

  // ── Computed helpers ───────────────────────────────────────────────
  /** Progress through the log: 0..1 (null when no range) */
  progress: number | null;
  /** Elapsed time from first event to playhead (ms) */
  elapsed: number;
  /** Total duration (lastEventTs - firstEventTs) in ms */
  duration: number;

  // ── Actions ────────────────────────────────────────────────────────
  /**
   * Transition to replay mode.
   * Caller (use-replay-engine) is responsible for:
   *   1. Pausing the scene recorder
   *   2. Saving live store state
   * Sets playhead to the beginning of the log.
   */
  enterReplay: (firstTs: number, lastTs: number, totalEntries: number) => void;
  /**
   * Return to live mode.
   * Caller (use-replay-engine) is responsible for:
   *   1. Restoring live store state
   *   2. Resuming the scene recorder
   */
  exitReplay: () => void;
  /** Start or resume playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle play/pause */
  togglePlay: () => void;
  /**
   * Seek to an absolute timestamp.
   * Clamps to [firstEventTs, lastEventTs].
   * Does NOT trigger reconstruction — that is done by the engine hook.
   */
  seekToTs: (ts: number) => void;
  /**
   * Seek by normalized progress (0..1).
   * Convenience wrapper over seekToTs.
   */
  seekToProgress: (progress: number) => void;
  /**
   * Set playback speed multiplier.
   * Should be one of REPLAY_SPEEDS but clamped to safe range anyway.
   */
  setSpeed: (speed: number) => void;
  /**
   * Advance playhead by one "step" forward (one log entry).
   * Auto-pauses if already playing.
   */
  stepForward: () => void;
  /**
   * Retreat playhead by one "step" backward (one log entry).
   * Auto-pauses if already playing.
   */
  stepBackward: () => void;
  /**
   * Update internal playhead position and seq (called by engine each frame).
   * This is a low-level method; external callers should use seekToTs instead.
   */
  _updatePlayhead: (ts: number, seq: number) => void;
  /**
   * Refresh the timeline range from the current scene-event-log state.
   * Called when entering replay mode and periodically during live recording.
   */
  _refreshRange: (firstTs: number, lastTs: number, total: number) => void;
}

// ── Store Implementation ───────────────────────────────────────────────────

export const useReplayStore = create<ReplayStoreState>((set, get) => ({
  mode: "live",
  playing: false,
  speed: 1,
  playheadTs: 0,
  playheadSeq: 0,
  firstEventTs: 0,
  lastEventTs: 0,
  totalLogEntries: 0,
  progress: null,
  elapsed: 0,
  duration: 0,

  // ── enterReplay ──────────────────────────────────────────────────
  enterReplay: (firstTs, lastTs, totalEntries) => {
    set({
      mode: "replay",
      playing: false,
      playheadTs: firstTs,
      playheadSeq: 0,
      firstEventTs: firstTs,
      lastEventTs: lastTs,
      totalLogEntries: totalEntries,
      progress: 0,
      elapsed: 0,
      duration: Math.max(0, lastTs - firstTs),
    });
  },

  // ── exitReplay ───────────────────────────────────────────────────
  exitReplay: () => {
    set({
      mode: "live",
      playing: false,
      playheadTs: 0,
      playheadSeq: 0,
      progress: null,
      elapsed: 0,
    });
  },

  // ── play ─────────────────────────────────────────────────────────
  play: () => {
    const state = get();
    if (state.mode !== "replay") return;
    // If at end, rewind to start before playing
    if (state.playheadTs >= state.lastEventTs) {
      set({
        playing: true,
        playheadTs: state.firstEventTs,
        playheadSeq: 0,
        progress: 0,
        elapsed: 0,
      });
    } else {
      set({ playing: true });
    }
  },

  // ── pause ────────────────────────────────────────────────────────
  pause: () => set({ playing: false }),

  // ── togglePlay ───────────────────────────────────────────────────
  togglePlay: () => {
    const { playing, mode, play, pause } = get();
    if (mode !== "replay") return;
    if (playing) pause();
    else play();
  },

  // ── seekToTs ─────────────────────────────────────────────────────
  seekToTs: (ts) => {
    const { firstEventTs, lastEventTs, duration } = get();
    const clamped = Math.max(firstEventTs, Math.min(lastEventTs, ts));
    const elapsed = clamped - firstEventTs;
    const progress = duration > 0 ? elapsed / duration : 0;
    set({ playheadTs: clamped, elapsed, progress });
  },

  // ── seekToProgress ───────────────────────────────────────────────
  seekToProgress: (progress) => {
    const { firstEventTs, duration } = get();
    const clamped = Math.max(0, Math.min(1, progress));
    const ts = firstEventTs + clamped * duration;
    get().seekToTs(ts);
  },

  // ── setSpeed ─────────────────────────────────────────────────────
  setSpeed: (speed) => {
    const clamped = Math.max(0.1, Math.min(16, speed));
    set({ speed: clamped });
  },

  // ── stepForward / stepBackward ────────────────────────────────────
  stepForward: () => {
    set({ playing: false });
    // Engine hook will handle advancing by one entry on next tick
    set((state) => {
      if (state.mode !== "replay") return state;
      // Advance by ~100ms as a single step
      const stepMs = 100;
      const newTs = Math.min(state.lastEventTs, state.playheadTs + stepMs);
      const elapsed = newTs - state.firstEventTs;
      const progress = state.duration > 0 ? elapsed / state.duration : 0;
      return { playheadTs: newTs, elapsed, progress };
    });
  },

  stepBackward: () => {
    set({ playing: false });
    set((state) => {
      if (state.mode !== "replay") return state;
      const stepMs = 100;
      const newTs = Math.max(state.firstEventTs, state.playheadTs - stepMs);
      const elapsed = newTs - state.firstEventTs;
      const progress = state.duration > 0 ? elapsed / state.duration : 0;
      return { playheadTs: newTs, elapsed, progress };
    });
  },

  // ── _updatePlayhead ───────────────────────────────────────────────
  _updatePlayhead: (ts, seq) => {
    const { firstEventTs, duration } = get();
    const elapsed = ts - firstEventTs;
    const progress = duration > 0 ? elapsed / duration : 0;
    set({ playheadTs: ts, playheadSeq: seq, elapsed, progress });
  },

  // ── _refreshRange ─────────────────────────────────────────────────
  _refreshRange: (firstTs, lastTs, total) => {
    set((state) => ({
      firstEventTs: firstTs,
      lastEventTs: lastTs,
      totalLogEntries: total,
      duration: Math.max(0, lastTs - firstTs),
      // Clamp playhead if out of range
      playheadTs: Math.max(firstTs, Math.min(lastTs, state.playheadTs)),
    }));
  },
}));
