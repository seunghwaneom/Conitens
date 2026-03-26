/**
 * ReplayDiegeticTimeline.tsx — Sub-AC 9.3 (AC 9)
 *
 * Diegetic 3D in-world timeline visualization for scene replay.
 *
 * This component renders a physically-present low-poly timeline above
 * the building's north wall so the replay scrub position is encoded
 * in world-space geometry — not just a 2D HUD overlay.  It is the
 * canonical "replay in the world" affordance required by the diegetic
 * immersion principle.
 *
 * Visual anatomy
 * ──────────────
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  DensityBars  ← low-poly vertical slabs (event density)     │
 *  │  TrackRail    ← flat horizontal bar (timeline axis)          │
 *  │  PlayheadCursor ← animated diamond that slides along rail    │
 *  │  ProgressFill  ← colored slab that grows from left          │
 *  │  Html badges  ← time readout + mode label (diegetic overlay) │
 *  └─────────────────────────────────────────────────────────────┘
 *
 * Position in world
 * ──────────────────
 *   - Floats above the north wall at Y = TIMELINE_Y (≈ 8.5 world units)
 *   - Horizontally centred on the building (X = BUILDING_W / 2)
 *   - Z offset slightly behind the north wall (Z = -1.0)
 *   - renderOrder 995 (below diegetic metric displays, above fog)
 *
 * Performance contract
 * ────────────────────
 *   - All per-frame animation runs through `useFrame` ref mutations —
 *     no React state updates in the animation path.
 *   - Geometry objects are created once via useMemo.
 *   - playheadRef.current.position.x is mutated directly by useFrame.
 *   - progressFillRef.current.scale.x is mutated directly by useFrame.
 *   - MeshStandardMaterial emissiveIntensity is mutated directly.
 *
 * Visibility guard
 * ─────────────────
 *   Renders nothing when mode === "live" (zero overhead in live mode).
 *
 * Isolation
 * ─────────
 *   Reads only from useReplayStore and useSceneEventLog — does NOT
 *   trigger scene recording or emit new events.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useReplayStore } from "../store/replay-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";

// ── Layout constants ───────────────────────────────────────────────────────────

/** X centre of the timeline bar (matches building centre). */
const TIMELINE_X = 6.0;

/** Y position: floats above the building's highest floor. */
const TIMELINE_Y = 8.5;

/** Z position: north wall of the building is at Z = 0; sit slightly behind. */
const TIMELINE_Z = -0.8;

/** Total length of the timeline track (world units). */
const TRACK_W = 11.0;

/** Thickness (height) of the flat track rail. */
const TRACK_H = 0.06;

/** Depth (extrusion) of the track rail. */
const TRACK_D = 0.03;

/** Width of the playhead diamond geometry. */
const PLAYHEAD_SIZE = 0.18;

/** Number of event-density histogram bars. */
const N_BARS = 50;

/** Maximum height of a density bar (world units). */
const BAR_MAX_H = 0.45;

/** Width of each density bar (world units). */
const BAR_W = (TRACK_W / N_BARS) * 0.72;

/** Height of the progress fill slab. */
const PROGRESS_SLAB_H = 0.035;

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_IDLE   = "#2a3a6a";  // track + bar tint in paused state
const COLOR_PLAY   = "#4a6aff";  // active play accent
const COLOR_HEAD_PLAY  = "#6a8aff";
const COLOR_HEAD_PAUSE = "#4455aa";
const COLOR_FILL   = "#3a5aff";
const EMISSIVE_BAR = "#0a1030";

// ── Density computation ───────────────────────────────────────────────────────

/**
 * Compute normalised event density histogram from entry timestamps.
 *
 * @param entries   Array of {ts: number} items.
 * @param firstTs   Start of the observable range (ms).
 * @param lastTs    End of the observable range (ms).
 * @param buckets   Number of histogram buckets.
 * @returns  Array of length `buckets` with values in [0, 1].
 */
export function computeDensityBuckets(
  entries: Array<{ ts: number }>,
  firstTs: number,
  lastTs: number,
  buckets: number,
): number[] {
  const range = lastTs - firstTs;
  if (range <= 0 || entries.length === 0) return new Array(buckets).fill(0);

  const counts = new Array(buckets).fill(0);
  for (const e of entries) {
    const idx = Math.min(
      buckets - 1,
      Math.floor(((e.ts - firstTs) / range) * buckets),
    );
    if (idx >= 0 && idx < buckets) counts[idx]++;
  }

  const maxCount = Math.max(1, ...counts);
  return counts.map((c) => c / maxCount);
}

// ── Time formatting ───────────────────────────────────────────────────────────

/** Format an absolute Unix timestamp as HH:MM:SS */
function fmtTs(ts: number): string {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Format milliseconds as M:SS */
function fmtMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "0:00";
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── TrackRail ────────────────────────────────────────────────────────────────

/**
 * TrackRail — the flat horizontal bar that is the timeline axis.
 * Animates emissive glow when playing.
 */
function TrackRail({ playing }: { playing: boolean }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    if (playing) {
      matRef.current.emissiveIntensity =
        0.15 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
    } else {
      matRef.current.emissiveIntensity = 0.05;
    }
  });

  return (
    <mesh
      position={[TIMELINE_X, TIMELINE_Y, TIMELINE_Z]}
      renderOrder={995}
    >
      <boxGeometry args={[TRACK_W, TRACK_H, TRACK_D]} />
      <meshStandardMaterial
        ref={matRef}
        color={playing ? COLOR_PLAY : COLOR_IDLE}
        emissive={playing ? COLOR_PLAY : COLOR_IDLE}
        emissiveIntensity={0.05}
        roughness={0.6}
        metalness={0.4}
        flatShading
        depthTest={false}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// ── PlayheadCursor ────────────────────────────────────────────────────────────

/**
 * PlayheadCursor — an animated diamond shape that slides along the track rail.
 * Its X position is updated each frame via useFrame without React state.
 */
function PlayheadCursor({ playing }: { playing: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null!);

  // Subscribe to progress imperatively — no per-frame re-render
  useFrame(() => {
    if (!groupRef.current || !matRef.current) return;

    const store    = useReplayStore.getState();
    const progress = store.progress ?? 0;
    const targetX  = TIMELINE_X - TRACK_W / 2 + progress * TRACK_W;

    // Smooth lerp to avoid jarring jumps on seek
    groupRef.current.position.x = THREE.MathUtils.lerp(
      groupRef.current.position.x,
      targetX,
      0.25,
    );

    // Pulsing emissive when playing
    if (playing) {
      const t = Date.now() * 0.003;
      matRef.current.emissiveIntensity = 0.7 + Math.sin(t) * 0.3;
    } else {
      matRef.current.emissiveIntensity = 0.4;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[TIMELINE_X - TRACK_W / 2, TIMELINE_Y, TIMELINE_Z]}
      renderOrder={997}
    >
      {/* Diamond octahedron playhead */}
      <mesh>
        <octahedronGeometry args={[PLAYHEAD_SIZE, 0]} />
        <meshStandardMaterial
          ref={matRef}
          color={playing ? COLOR_HEAD_PLAY : COLOR_HEAD_PAUSE}
          emissive={playing ? COLOR_HEAD_PLAY : COLOR_HEAD_PAUSE}
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.6}
          flatShading
          depthTest={false}
        />
      </mesh>

      {/* Vertical needle descending from diamond to rail */}
      <mesh position={[0, -(PLAYHEAD_SIZE + TRACK_H / 2 + 0.06), 0]}>
        <boxGeometry args={[0.025, 0.15, 0.025]} />
        <meshBasicMaterial
          color={playing ? COLOR_HEAD_PLAY : COLOR_HEAD_PAUSE}
          transparent
          opacity={0.7}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

// ── ProgressFill ─────────────────────────────────────────────────────────────

/**
 * ProgressFill — a colored slab that scales from 0 to TRACK_W along X,
 * encoding playback progress as a physically-filled track segment.
 *
 * Scale.x is mutated directly by useFrame to avoid React re-renders.
 */
function ProgressFill() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    const store    = useReplayStore.getState();
    const progress = store.progress ?? 0;

    // Scale x from origin at left edge
    const targetScale = Math.max(0.001, progress);
    meshRef.current.scale.x = THREE.MathUtils.lerp(
      meshRef.current.scale.x,
      targetScale,
      0.25,
    );

    // Position: anchor left edge to start of track
    meshRef.current.position.x =
      TIMELINE_X - TRACK_W / 2 + (meshRef.current.scale.x * TRACK_W) / 2;
  });

  return (
    <mesh
      ref={meshRef}
      // Initial position/scale set to near-zero
      position={[TIMELINE_X - TRACK_W / 2, TIMELINE_Y, TIMELINE_Z + TRACK_D / 2 + 0.008]}
      scale={[0.001, 1, 1]}
      renderOrder={996}
    >
      <boxGeometry args={[TRACK_W, PROGRESS_SLAB_H, 0.025]} />
      <meshStandardMaterial
        color={COLOR_FILL}
        emissive={COLOR_FILL}
        emissiveIntensity={0.6}
        roughness={0.2}
        depthTest={false}
        transparent
        opacity={0.75}
      />
    </mesh>
  );
}

// ── DensityBars ───────────────────────────────────────────────────────────────

interface DensityBarsProps {
  entries:   Array<{ ts: number }>;
  firstTs:   number;
  lastTs:    number;
  playing:   boolean;
}

/**
 * DensityBars — a row of N_BARS low-poly vertical slabs arranged along the
 * track, each scaled in Y to show the event density in that time bucket.
 *
 * These are purely presentational — they encode the historical event density
 * of the log, not the live feed.  They do not update every frame.
 */
function DensityBars({ entries, firstTs, lastTs, playing }: DensityBarsProps) {
  const density = useMemo(
    () => computeDensityBuckets(entries, firstTs, lastTs, N_BARS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries.length, firstTs, lastTs],
  );

  const barPositions = useMemo(() => {
    const positions: [number, number, number, number][] = [];
    const step = TRACK_W / N_BARS;
    for (let i = 0; i < N_BARS; i++) {
      const h   = Math.max(0.01, density[i] * BAR_MAX_H);
      const x   = TIMELINE_X - TRACK_W / 2 + i * step + step / 2;
      const y   = TIMELINE_Y + TRACK_H / 2 + h / 2;
      const z   = TIMELINE_Z;
      positions.push([x, y, z, h]);
    }
    return positions;
  }, [density]);

  return (
    <>
      {barPositions.map(([x, y, z, h], i) => (
        <mesh
          key={i}
          position={[x, y, z]}
          renderOrder={994}
        >
          <boxGeometry args={[BAR_W, h, TRACK_D * 0.7]} />
          <meshStandardMaterial
            color={playing ? COLOR_PLAY : COLOR_IDLE}
            emissive={EMISSIVE_BAR}
            emissiveIntensity={0.2}
            roughness={0.8}
            metalness={0.1}
            flatShading
            transparent
            opacity={0.45}
            depthTest={false}
          />
        </mesh>
      ))}
    </>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

/**
 * StatusBadge — diegetic Html label anchored above the playhead area.
 *
 * Shows:
 *  - Mode glyph (◈ REPLAY or ⏸ PAUSED)
 *  - Current playhead time (HH:MM:SS)
 *  - Elapsed / total (M:SS / M:SS)
 *
 * Position: above the centre of the track rail.
 */
function StatusBadge({
  playing,
  playheadTs,
  elapsed,
  duration,
}: {
  playing:    boolean;
  playheadTs: number;
  elapsed:    number;
  duration:   number;
}) {
  return (
    <Html
      position={[TIMELINE_X, TIMELINE_Y + BAR_MAX_H + 0.55, TIMELINE_Z]}
      distanceFactor={14}
      style={{ pointerEvents: "none" }}
      occlude={false}
    >
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            "2px",
          background:     "rgba(4, 6, 18, 0.88)",
          border:         "1px solid rgba(74, 106, 255, 0.35)",
          borderRadius:   3,
          padding:        "4px 10px",
          backdropFilter: "blur(6px)",
          whiteSpace:     "nowrap",
          transform:      "translate(-50%, 0)",
        }}
      >
        {/* Mode label */}
        <span
          style={{
            fontSize:      "8px",
            fontFamily:    "'JetBrains Mono', monospace",
            fontWeight:    700,
            letterSpacing: "0.12em",
            color:         playing ? "#6a8aff" : "#4a6aff",
            textShadow:    "0 0 6px #4a6affaa",
          }}
        >
          ◈ {playing ? "PLAYING" : "PAUSED"}
        </span>

        {/* Absolute timestamp */}
        <span
          style={{
            fontSize:      "11px",
            fontFamily:    "'JetBrains Mono', monospace",
            fontWeight:    700,
            letterSpacing: "0.1em",
            color:         "#7799dd",
          }}
        >
          {fmtTs(playheadTs)}
        </span>

        {/* Elapsed / total */}
        <span
          style={{
            fontSize:      "7px",
            fontFamily:    "'JetBrains Mono', monospace",
            color:         "#333355",
            letterSpacing: "0.05em",
          }}
        >
          <span style={{ color: "#555577" }}>{fmtMs(elapsed)}</span>
          <span style={{ color: "#222244", margin: "0 3px" }}>/</span>
          <span style={{ color: "#333355" }}>{fmtMs(duration)}</span>
        </span>
      </div>
    </Html>
  );
}

// ── LeftEndcap / RightEndcap ──────────────────────────────────────────────────

/** Vertical accent pillar at the left end of the track. */
function LeftEndcap() {
  return (
    <mesh
      position={[TIMELINE_X - TRACK_W / 2, TIMELINE_Y + BAR_MAX_H / 2, TIMELINE_Z]}
      renderOrder={995}
    >
      <boxGeometry args={[0.06, BAR_MAX_H + TRACK_H, TRACK_D]} />
      <meshStandardMaterial
        color={COLOR_PLAY}
        emissive={COLOR_PLAY}
        emissiveIntensity={0.4}
        roughness={0.3}
        metalness={0.5}
        depthTest={false}
        flatShading
      />
    </mesh>
  );
}

/** Vertical accent pillar at the right end of the track. */
function RightEndcap() {
  return (
    <mesh
      position={[TIMELINE_X + TRACK_W / 2, TIMELINE_Y + BAR_MAX_H / 2, TIMELINE_Z]}
      renderOrder={995}
    >
      <boxGeometry args={[0.06, BAR_MAX_H + TRACK_H, TRACK_D]} />
      <meshStandardMaterial
        color={COLOR_IDLE}
        emissive={COLOR_IDLE}
        emissiveIntensity={0.2}
        roughness={0.4}
        metalness={0.4}
        depthTest={false}
        flatShading
      />
    </mesh>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ReplayDiegeticTimeline — Diegetic 3D in-world replay timeline visualization.
 *
 * Place inside the R3F <Canvas> in CommandCenterScene.tsx.
 *
 * Guard: renders nothing when mode === "live" — zero overhead in live mode.
 *
 * Example (CommandCenterScene.tsx):
 *   import { ReplayDiegeticTimeline } from "./ReplayDiegeticTimeline.js";
 *   // Inside the Canvas:
 *   <ReplayDiegeticTimeline />
 */
export function ReplayDiegeticTimeline() {
  const mode       = useReplayStore((s) => s.mode);
  const playing    = useReplayStore((s) => s.playing);
  const playheadTs = useReplayStore((s) => s.playheadTs);
  const elapsed    = useReplayStore((s) => s.elapsed);
  const duration   = useReplayStore((s) => s.duration);
  const firstTs    = useReplayStore((s) => s.firstEventTs);
  const lastTs     = useReplayStore((s) => s.lastEventTs);

  // Read event entries for density histogram (snapshot, not reactive per-frame)
  const entries    = useSceneEventLog((s) => s.entries);

  // Guard: only render in replay mode
  if (mode !== "replay") return null;

  return (
    <group name="replay-diegetic-timeline">
      {/* Track rail */}
      <TrackRail playing={playing} />

      {/* Progress fill (scales with playback) */}
      <ProgressFill />

      {/* Event density histogram bars */}
      <DensityBars
        entries={entries}
        firstTs={firstTs}
        lastTs={lastTs}
        playing={playing}
      />

      {/* Moving playhead cursor */}
      <PlayheadCursor playing={playing} />

      {/* Left / right end caps */}
      <LeftEndcap />
      <RightEndcap />

      {/* Diegetic time display */}
      <StatusBadge
        playing={playing}
        playheadTs={playheadTs}
        elapsed={elapsed}
        duration={duration}
      />
    </group>
  );
}
