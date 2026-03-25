/**
 * ReplayModeOverlay.tsx — Full-viewport visual indicators for replay mode.
 *
 * AC 9.3: Provides global visual feedback that clearly distinguishes the GUI
 * from live observation when 3D scene replay is active:
 *
 *  Visual indicators (replay mode only):
 *   - Blue-tinted vignette glow border around the entire viewport
 *   - Corner-bracket ornaments (top-left, top-right, bottom-left, bottom-right)
 *   - Top-edge progress bar tracking playhead position
 *   - Floating "◈ REPLAY / PAUSED" mode stamp (top-right, distinct from HUD panel)
 *   - Floating playhead timestamp badge (top-center, shows HH:MM:SS + elapsed/total)
 *   - Keyboard shortcut guide (lower-left, subtle)
 *
 *  Keyboard controls (active only while mode === "replay"):
 *   - Space / K   → play / pause
 *   - ← Arrow / J → step backward (100ms)
 *   - → Arrow / L → step forward  (100ms)
 *   - Escape      → exit replay, return to live mode
 *
 * Design principles:
 *  - Record transparency: replay mode is always unmistakably indicated
 *  - Zero overhead in live mode (renders null, no event listeners attached)
 *  - Dark command-center aesthetic: #4a6aff blue palette, monospace type
 *
 * Usage: Mount once inside HUD component. Renders nothing in live mode.
 */
import { useEffect } from "react";
import { useReplayStore } from "../store/replay-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";

// ── Time Formatting ─────────────────────────────────────────────────────────

/** Format milliseconds as MM:SS.mmm */
function formatMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "00:00.000";
  const totalSec = Math.floor(ms / 1_000);
  const mins   = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const secs   = (totalSec % 60).toString().padStart(2, "0");
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

// ── Keyboard Controls Hook ──────────────────────────────────────────────────

/**
 * Register keyboard shortcuts for replay control.
 * Only attaches listeners while mode === "replay".
 * Safely deregisters on cleanup or when exiting replay.
 *
 * Keys:
 *   Space / K   — play / pause
 *   ArrowLeft / J — step backward
 *   ArrowRight / L — step forward
 *   Escape — exit replay
 */
function useReplayKeyboardControls(mode: "live" | "replay") {
  useEffect(() => {
    if (mode !== "replay") return;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip if the user is typing in a form field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const store = useReplayStore.getState();
      if (store.mode !== "replay") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          store.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          store.stepForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          store.stepBackward();
          break;
        case "Escape":
          e.preventDefault();
          store.exitReplay();
          break;
        // Vim-style navigation keys (no preventDefault — allow other handlers)
        case "KeyK":
          store.togglePlay();
          break;
        case "KeyJ":
          store.stepBackward();
          break;
        case "KeyL":
          store.stepForward();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Thin progress bar running along the top edge of the viewport */
function ReplayProgressBar({ progress }: { progress: number | null }) {
  const pct = Math.max(0, Math.min(100, (progress ?? 0) * 100));

  return (
    <div
      aria-hidden="true"
      style={{
        position:   "absolute",
        top:        0,
        left:       0,
        right:      0,
        height:     3,
        background: "rgba(10, 10, 26, 0.6)",
        zIndex:     101,
        pointerEvents: "none",
      }}
    >
      {/* Filled portion */}
      <div
        style={{
          position:   "absolute",
          top:        0,
          left:       0,
          height:     "100%",
          width:      `${pct}%`,
          background: "linear-gradient(90deg, #4a6aff, #6a8aff)",
          boxShadow:  "0 0 6px #4a6aff88",
          transition: "width 0.08s linear",
        }}
      />
    </div>
  );
}

/** Corner bracket ornaments — all four corners */
function CornerBrackets() {
  const shared: React.CSSProperties = {
    position:      "absolute",
    width:         22,
    height:        22,
    pointerEvents: "none",
    zIndex:        102,
    opacity:       0.7,
  };

  const border = "2px solid rgba(74, 106, 255, 0.65)";

  return (
    <>
      {/* Top-left */}
      <div
        aria-hidden="true"
        style={{
          ...shared,
          top:         8,
          left:        8,
          borderTop:   border,
          borderLeft:  border,
        }}
      />
      {/* Top-right */}
      <div
        aria-hidden="true"
        style={{
          ...shared,
          top:          8,
          right:        8,
          borderTop:    border,
          borderRight:  border,
        }}
      />
      {/* Bottom-left */}
      <div
        aria-hidden="true"
        style={{
          ...shared,
          bottom:      8,
          left:        8,
          borderBottom: border,
          borderLeft:   border,
        }}
      />
      {/* Bottom-right */}
      <div
        aria-hidden="true"
        style={{
          ...shared,
          bottom:       8,
          right:        8,
          borderBottom: border,
          borderRight:  border,
        }}
      />
    </>
  );
}

/**
 * Floating "◈ REPLAY" / "⏸ PAUSED" badge — top-right area.
 *
 * Positioned to sit above the camera preset controls without overlapping
 * the HUD panel sections at the edges.
 */
function ReplayModeBadge({ playing }: { playing: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position:        "absolute",
        top:             44,
        right:           16,
        display:         "flex",
        alignItems:      "center",
        gap:             6,
        background:      "rgba(6, 8, 24, 0.90)",
        border:          "1px solid rgba(74, 106, 255, 0.45)",
        borderRadius:    4,
        padding:         "4px 10px",
        backdropFilter:  "blur(8px)",
        pointerEvents:   "none",
        zIndex:          103,
        boxShadow:       "0 0 18px rgba(74, 106, 255, 0.14), 0 2px 8px rgba(0,0,0,0.5)",
      }}
    >
      {/* Glyph + label */}
      <span
        style={{
          fontSize:      "9px",
          fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
          fontWeight:    700,
          letterSpacing: "0.14em",
          color:         "#4a6aff",
          textShadow:    "0 0 10px #4a6affaa",
        }}
      >
        ◈ REPLAY
      </span>

      {/* Play state pill */}
      {playing ? (
        <span
          style={{
            fontSize:      "7px",
            fontFamily:    "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
            color:         "#88aaff",
            animation:     "hud-pulse 1s ease-in-out infinite",
          }}
        >
          ▶ PLAYING
        </span>
      ) : (
        <span
          style={{
            fontSize:      "7px",
            fontFamily:    "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
            color:         "#555577",
          }}
        >
          ⏸ PAUSED
        </span>
      )}
    </div>
  );
}

/**
 * Floating timestamp display — top-center.
 *
 * Shows:
 *  - Absolute time at playhead: HH:MM:SS
 *  - Elapsed / total: MM:SS.mmm / MM:SS.mmm
 *  - Event count + snapshot count
 *
 * Positioned to sit below the DrillBreadcrumb/BuildingEntryHint (top ≈ 38–60)
 * without covering the navigation panels.
 */
function PlayheadTimestamp({
  playheadTs,
  elapsed,
  duration,
  totalEntries,
  snapshotCount,
}: {
  playheadTs:     number;
  elapsed:        number;
  duration:       number;
  totalEntries:   number;
  snapshotCount:  number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position:       "absolute",
        top:            44,
        left:           "50%",
        transform:      "translateX(-50%)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            1,
        background:     "rgba(4, 6, 18, 0.90)",
        border:         "1px solid rgba(74, 106, 255, 0.22)",
        borderRadius:   4,
        padding:        "5px 14px",
        backdropFilter: "blur(10px)",
        pointerEvents:  "none",
        zIndex:         103,
        boxShadow:      "0 2px 14px rgba(74, 106, 255, 0.09)",
      }}
    >
      {/* HH:MM:SS absolute timestamp — primary readout */}
      <div
        style={{
          fontSize:      "16px",
          fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
          fontWeight:    700,
          color:         "#7799dd",
          letterSpacing: "0.12em",
          lineHeight:    1,
        }}
      >
        {formatAbsoluteTs(playheadTs)}
      </div>

      {/* MM:SS.mmm / MM:SS.mmm */}
      <div
        style={{
          fontSize:      "8px",
          fontFamily:    "'JetBrains Mono', monospace",
          color:         "#333355",
          letterSpacing: "0.06em",
          lineHeight:    1.4,
        }}
      >
        <span style={{ color: "#555577" }}>{formatMs(elapsed)}</span>
        <span style={{ color: "#2a2a44", margin: "0 3px" }}>/</span>
        <span style={{ color: "#333355" }}>{formatMs(duration)}</span>
      </div>

      {/* Entry / snapshot statistics */}
      <div
        style={{
          fontSize:      "7px",
          fontFamily:    "'JetBrains Mono', monospace",
          color:         "#222244",
          letterSpacing: "0.05em",
        }}
      >
        {totalEntries} evt · {snapshotCount} snap
      </div>
    </div>
  );
}

/**
 * Keyboard shortcut hint list — lower-left corner.
 * Very subtle; meant for discoverability without distraction.
 */
function KeyboardHints() {
  const hints: [string, string][] = [
    ["SPACE",  "play / pause"],
    ["← →",    "step backward / forward"],
    ["ESC",    "exit replay"],
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        position:      "absolute",
        bottom:        108,  // sits above ReplayControlPanel + DataSourceStatusIndicator
        left:          16,
        display:       "flex",
        flexDirection: "column",
        gap:           3,
        pointerEvents: "none",
        zIndex:        20,
        opacity:       0.7,
      }}
    >
      {hints.map(([key, desc]) => (
        <div
          key={key}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        6,
            fontSize:   "7px",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <kbd
            style={{
              background:    "rgba(20, 20, 45, 0.75)",
              border:        "1px solid rgba(60,60,100,0.5)",
              borderRadius:  2,
              padding:       "1px 4px",
              color:         "#333366",
              fontSize:      "6px",
              letterSpacing: "0.05em",
              minWidth:      36,
              textAlign:     "center",
              fontFamily:    "inherit",
            }}
          >
            {key}
          </kbd>
          <span style={{ color: "#1c1c30", letterSpacing: "0.06em" }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * ReplayModeOverlay — Mounts once in the HUD; renders nothing in live mode.
 *
 * In replay mode renders:
 *  1. Vignette border glow
 *  2. Corner bracket ornaments
 *  3. Top-edge progress bar
 *  4. "◈ REPLAY" badge (top-right)
 *  5. Playhead timestamp (top-center)
 *  6. Keyboard shortcut hints (lower-left)
 *
 * Also registers keyboard shortcuts while in replay mode:
 *   Space → play/pause · ←/→ → step · Escape → exit
 */
export function ReplayModeOverlay() {
  const mode          = useReplayStore((s) => s.mode);
  const playing       = useReplayStore((s) => s.playing);
  const elapsed       = useReplayStore((s) => s.elapsed);
  const duration      = useReplayStore((s) => s.duration);
  const playheadTs    = useReplayStore((s) => s.playheadTs);
  const progress      = useReplayStore((s) => s.progress);
  const totalEntries  = useReplayStore((s) => s.totalLogEntries);
  const snapshotCount = useSceneEventLog((s) => s.snapshots.length);

  // Register keyboard shortcuts (no-op in live mode)
  useReplayKeyboardControls(mode);

  // In live mode: render nothing
  if (mode !== "replay") return null;

  return (
    <>
      {/* ── Vignette border glow ─────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          inset:         0,
          pointerEvents: "none",
          zIndex:        4,
          boxShadow: [
            "inset 0 0 90px rgba(74, 106, 255, 0.10)",
            "inset 0 0 6px  rgba(74, 106, 255, 0.22)",
          ].join(", "),
          border:        "1.5px solid rgba(74, 106, 255, 0.30)",
          borderRadius:  1,
        }}
      />

      {/* ── Top progress bar ─────────────────────────────────────────────── */}
      <ReplayProgressBar progress={progress} />

      {/* ── Corner brackets ──────────────────────────────────────────────── */}
      <CornerBrackets />

      {/* ── Mode badge (top-right) ───────────────────────────────────────── */}
      <ReplayModeBadge playing={playing} />

      {/* ── Playhead timestamp (top-center) ─────────────────────────────── */}
      <PlayheadTimestamp
        playheadTs={playheadTs}
        elapsed={elapsed}
        duration={duration}
        totalEntries={totalEntries}
        snapshotCount={snapshotCount}
      />

      {/* ── Keyboard shortcut hints (lower-left) ────────────────────────── */}
      <KeyboardHints />
    </>
  );
}
