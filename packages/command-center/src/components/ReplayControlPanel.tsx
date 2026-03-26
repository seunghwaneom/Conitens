/**
 * ReplayControlPanel.tsx — 3D scene replay playback controls.
 *
 * AC 9.2: Provides the user-facing controls for the replay system:
 *  - Play / Pause button with visual state
 *  - Seek slider with clickable timeline
 *  - Playback speed selector (0.25× → 8×)
 *  - Step forward / backward (one logical step)
 *  - Elapsed / Total time display
 *  - Event density histogram on the timeline
 *  - Enter / Exit replay mode toggle
 *  - Export log as JSON
 *
 * Design follows the dark command-center aesthetic: monospace font,
 * dim blue palette, translucent glass backgrounds, neon accent on active
 * state, and a pulsing REC indicator in live mode.
 *
 * Positioned: bottom-center, sitting immediately above the data-source
 * status indicator so the two controls form a coherent bottom-center stack.
 */
import { useRef } from "react";
import { useReplayStore, REPLAY_SPEEDS } from "../store/replay-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";

// ── Time Formatting ────────────────────────────────────────────────────────

/** Format milliseconds as MM:SS.mmm */
function formatMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "00:00.000";
  const totalSec = Math.floor(ms / 1_000);
  const mins  = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const secs  = (totalSec % 60).toString().padStart(2, "0");
  const millis = Math.floor(ms % 1_000).toString().padStart(3, "0");
  return `${mins}:${secs}.${millis}`;
}

/** Format an absolute Unix timestamp as HH:MM:SS */
function formatAbsoluteTs(ts: number): string {
  if (!ts || ts === 0) return "--:--:--";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ── Event Density Histogram ────────────────────────────────────────────────

/**
 * Compute a density histogram for the event timeline.
 * Returns an array of normalized bucket heights (0..1) for rendering.
 */
function computeDensityBuckets(
  entries: Array<{ ts: number }>,
  firstTs: number,
  lastTs: number,
  buckets: number = 60,
): number[] {
  const range = lastTs - firstTs;
  if (range <= 0 || entries.length === 0) return new Array(buckets).fill(0);

  const counts = new Array(buckets).fill(0);
  for (const e of entries) {
    const idx = Math.min(
      buckets - 1,
      Math.floor(((e.ts - firstTs) / range) * buckets),
    );
    if (idx >= 0) counts[idx]++;
  }

  const maxCount = Math.max(1, ...counts);
  return counts.map((c) => c / maxCount);
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Neon pulsing REC indicator */
function RecIndicator() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "7px",
        letterSpacing: "0.1em",
        color: "#ff4444",
        fontWeight: 700,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: "#ff4444",
          boxShadow: "0 0 6px #ff4444",
          animation: "hud-pulse 1.2s ease-in-out infinite",
        }}
      />
      REC
    </span>
  );
}

/** Speed selector pill buttons */
function SpeedSelector() {
  const speed    = useReplayStore((s) => s.speed);
  const setSpeed = useReplayStore((s) => s.setSpeed);

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      <span style={{ fontSize: "7px", color: "#444466", marginRight: 2 }}>SPD</span>
      {REPLAY_SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          title={`Set playback speed to ${s}×`}
          style={{
            padding: "2px 5px",
            fontSize: "7px",
            fontFamily: "inherit",
            letterSpacing: "0.04em",
            background: speed === s ? "rgba(74, 106, 255, 0.25)" : "rgba(15, 15, 30, 0.6)",
            border: `1px solid ${speed === s ? "#4a6aff" : "#222244"}`,
            borderRadius: 2,
            color: speed === s ? "#aaccff" : "#555577",
            cursor: "pointer",
            transition: "all 0.12s ease",
            lineHeight: 1,
          }}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

/** Seek slider with event density histogram overlay */
function SeekBar() {
  const mode         = useReplayStore((s) => s.mode);
  const progress     = useReplayStore((s) => s.progress);
  const firstEventTs = useReplayStore((s) => s.firstEventTs);
  const lastEventTs  = useReplayStore((s) => s.lastEventTs);
  const seekToProgress = useReplayStore((s) => s.seekToProgress);
  const entries      = useSceneEventLog((s) => s.entries);

  const barRef = useRef<HTMLDivElement>(null);

  const pct = (progress ?? 0) * 100;
  const density = computeDensityBuckets(entries, firstEventTs, lastEventTs, 80);
  const hasRange = lastEventTs > firstEventTs;
  const isActive = mode === "replay";

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isActive || !hasRange || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const p    = Math.max(0, Math.min(1, x / rect.width));
    seekToProgress(p);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isActive || !hasRange || !(e.buttons & 1) || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const p    = Math.max(0, Math.min(1, x / rect.width));
    seekToProgress(p);
  }

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      style={{
        position: "relative",
        width: "100%",
        height: 28,
        background: "rgba(10, 10, 22, 0.7)",
        border: `1px solid ${isActive ? "#2a3a6a" : "#1a1a2a"}`,
        borderRadius: 3,
        cursor: isActive && hasRange ? "pointer" : "default",
        overflow: "hidden",
        userSelect: "none",
      }}
      title={isActive ? "Click or drag to seek" : "Enter replay mode to seek"}
    >
      {/* Event density histogram */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
          opacity: isActive ? 0.35 : 0.12,
        }}
      >
        {density.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(2, h * 100)}%`,
              background: "#4a6aff",
              borderRadius: "1px 1px 0 0",
            }}
          />
        ))}
      </div>

      {/* Progress fill */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, rgba(74,106,255,0.18), rgba(74,106,255,0.08))",
            borderRight: "2px solid #4a6aff",
            transition: "width 0.08s linear",
          }}
        />
      )}

      {/* Playhead cursor */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `calc(${pct}% - 1px)`,
            width: 2,
            background: "#6a8aff",
            boxShadow: "0 0 6px #4a6aff",
            transition: "left 0.08s linear",
          }}
        />
      )}

      {/* "Click to enter replay" hint when in live mode */}
      {!isActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "7px",
            color: "#333355",
            letterSpacing: "0.08em",
          }}
        >
          ENTER REPLAY TO SEEK
        </div>
      )}
    </div>
  );
}

/** Transport controls: step-back, play/pause, step-forward */
function TransportControls() {
  const mode         = useReplayStore((s) => s.mode);
  const playing      = useReplayStore((s) => s.playing);
  const togglePlay   = useReplayStore((s) => s.togglePlay);
  const stepForward  = useReplayStore((s) => s.stepForward);
  const stepBackward = useReplayStore((s) => s.stepBackward);

  const isActive = mode === "replay";

  const btnBase: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: "11px",
    fontFamily: "inherit",
    background: isActive ? "rgba(20, 20, 40, 0.8)" : "rgba(10, 10, 20, 0.5)",
    border: `1px solid ${isActive ? "#333366" : "#1a1a2a"}`,
    borderRadius: 3,
    color: isActive ? "#7777aa" : "#333344",
    cursor: isActive ? "pointer" : "default",
    letterSpacing: "0.02em",
    transition: "all 0.12s ease",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const playBtnStyle: React.CSSProperties = {
    ...btnBase,
    padding: "4px 12px",
    fontSize: "12px",
    ...(isActive && playing
      ? {
          background: "rgba(74, 106, 255, 0.2)",
          borderColor: "#4a6aff",
          color: "#aaccff",
          boxShadow: "0 0 8px rgba(74,106,255,0.3)",
        }
      : isActive
      ? {
          background: "rgba(74, 106, 255, 0.10)",
          borderColor: "#3a3a7a",
          color: "#8888cc",
        }
      : {}),
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={isActive ? stepBackward : undefined}
        disabled={!isActive}
        title="Step backward (100ms)"
        style={btnBase}
      >
        ◁◁
      </button>
      <button
        onClick={isActive ? togglePlay : undefined}
        disabled={!isActive}
        title={playing ? "Pause replay" : "Play replay"}
        style={playBtnStyle}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button
        onClick={isActive ? stepForward : undefined}
        disabled={!isActive}
        title="Step forward (100ms)"
        style={btnBase}
      >
        ▷▷
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

/**
 * ReplayControlPanel — Complete 3D scene replay control strip.
 *
 * Renders at the bottom-center of the HUD, above the DataSourceStatusIndicator.
 * Always visible — shows REC indicator in live mode, playback controls in
 * replay mode. The timeline seek bar is always rendered to show event density
 * (grayed out in live mode).
 */
export function ReplayControlPanel() {
  const mode         = useReplayStore((s) => s.mode);
  const playing      = useReplayStore((s) => s.playing);
  const elapsed      = useReplayStore((s) => s.elapsed);
  const duration     = useReplayStore((s) => s.duration);
  const firstEventTs = useReplayStore((s) => s.firstEventTs);
  const lastEventTs  = useReplayStore((s) => s.lastEventTs);
  const totalEntries = useReplayStore((s) => s.totalLogEntries);
  const playheadTs   = useReplayStore((s) => s.playheadTs);

  const { enterReplay, exitReplay, _refreshRange } = useReplayStore.getState();
  const { entries, snapshots, exportLog } = useSceneEventLog.getState();

  const isReplay = mode === "replay";

  function handleEnterReplay() {
    const logState  = useSceneEventLog.getState();
    const logEntries = logState.entries;
    if (logEntries.length === 0) return;
    const first = logEntries[0].ts;
    const last  = logEntries[logEntries.length - 1].ts;
    _refreshRange(first, last, logEntries.length);
    enterReplay(first, last, logEntries.length);
  }

  function handleExitReplay() {
    exitReplay();
  }

  function handleExportLog() {
    const json = exportLog();
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `conitens-scene-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const liveEntriesCount = useSceneEventLog((s) => s.entries.length);
  const totalRecorded    = useSceneEventLog((s) => s.totalRecorded);
  const snapshotCount    = useSceneEventLog((s) => s.snapshots.length);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 46, // above DataSourceStatusIndicator (bottom: 16, height ~28)
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: isReplay
          ? "rgba(8, 10, 28, 0.94)"
          : "rgba(5, 8, 16, 0.82)",
        border: `1px solid ${isReplay ? "#2a3a6a" : "#1a1a2a"}`,
        borderRadius: 5,
        padding: "7px 10px",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
        userSelect: "none",
        zIndex: 20,
        boxShadow: isReplay
          ? "0 2px 18px rgba(74,106,255,0.18), 0 0 0 1px rgba(74,106,255,0.08)"
          : "0 2px 10px rgba(0,0,0,0.5)",
        transition: "all 0.2s ease",
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left: mode badge + rec indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: isReplay ? "#4a6aff" : "#444466",
              textShadow: isReplay ? "0 0 8px #4a6affaa" : "none",
            }}
          >
            {isReplay ? "◈ REPLAY" : "◉ TIMELINE"}
          </span>
          {!isReplay && <RecIndicator />}
          {isReplay && playing && (
            <span
              style={{
                fontSize: "7px",
                color: "#4a6aff",
                letterSpacing: "0.08em",
                animation: "hud-pulse 1s ease-in-out infinite",
              }}
            >
              PLAYING
            </span>
          )}
          {isReplay && !playing && (
            <span style={{ fontSize: "7px", color: "#555577", letterSpacing: "0.08em" }}>
              PAUSED
            </span>
          )}
        </div>

        {/* Center: timestamps */}
        <div
          style={{
            fontSize: "9px",
            fontFamily: "inherit",
            color: isReplay ? "#7788cc" : "#333355",
            letterSpacing: "0.05em",
          }}
        >
          {isReplay ? (
            <>
              <span style={{ color: "#8899dd" }}>{formatMs(elapsed)}</span>
              <span style={{ color: "#333355", margin: "0 4px" }}>/</span>
              <span style={{ color: "#444466" }}>{formatMs(duration)}</span>
              <span style={{ color: "#222244", marginLeft: 6, fontSize: "7px" }}>
                @ {formatAbsoluteTs(playheadTs)}
              </span>
            </>
          ) : (
            <span style={{ color: "#333355" }}>
              {liveEntriesCount} evt · {snapshotCount} snap · {totalRecorded} total
            </span>
          )}
        </div>

        {/* Right: enter/exit + export */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={handleExportLog}
            title="Export event log as JSON"
            style={{
              padding: "2px 6px",
              fontSize: "7px",
              fontFamily: "inherit",
              background: "rgba(15, 15, 30, 0.6)",
              border: "1px solid #222244",
              borderRadius: 2,
              color: "#444466",
              cursor: "pointer",
              letterSpacing: "0.06em",
              transition: "all 0.12s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#6677aa";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#333366";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#444466";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#222244";
            }}
          >
            ↓ EXPORT
          </button>
          <button
            onClick={isReplay ? handleExitReplay : handleEnterReplay}
            disabled={!isReplay && liveEntriesCount === 0}
            title={isReplay ? "Exit replay and return to live view" : "Enter replay mode"}
            style={{
              padding: "2px 8px",
              fontSize: "7px",
              fontFamily: "inherit",
              letterSpacing: "0.08em",
              background: isReplay
                ? "rgba(255, 80, 80, 0.12)"
                : liveEntriesCount > 0
                ? "rgba(74, 106, 255, 0.12)"
                : "rgba(10, 10, 20, 0.5)",
              border: `1px solid ${isReplay ? "#aa3333" : liveEntriesCount > 0 ? "#3a4aaa" : "#1a1a2a"}`,
              borderRadius: 2,
              color: isReplay ? "#ff8888" : liveEntriesCount > 0 ? "#8899dd" : "#222244",
              cursor: !isReplay && liveEntriesCount === 0 ? "default" : "pointer",
              transition: "all 0.12s ease",
            }}
          >
            {isReplay ? "✕ EXIT" : "▶ REPLAY"}
          </button>
        </div>
      </div>

      {/* ── Seek bar ─────────────────────────────────────────────────────── */}
      <SeekBar />

      {/* ── Transport + speed controls ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <TransportControls />
        <SpeedSelector />

        {/* Snapshot count + entry range info */}
        <div style={{ fontSize: "7px", color: "#333355", textAlign: "right", letterSpacing: "0.05em" }}>
          {isReplay ? (
            <>
              <span>
                {totalEntries} evt · {snapshotCount} snaps
              </span>
              <br />
              <span style={{ color: "#222244" }}>
                {formatAbsoluteTs(firstEventTs)} → {formatAbsoluteTs(lastEventTs)}
              </span>
            </>
          ) : (
            <span>
              {snapshotCount} snap{snapshotCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
