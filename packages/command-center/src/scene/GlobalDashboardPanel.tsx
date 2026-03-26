/**
 * GlobalDashboardPanel.tsx — Diegetic 3D wall-mounted global control-plane overview.
 *
 * Sub-AC 7e: Global control-plane dashboard panel.
 *
 * A large wall-mounted panel embedded in the 3D scene at the building's
 * north wall (z ≈ 0), centered on the x-axis, visible from the default
 * overview camera position.
 *
 * Shows system-wide state:
 *   ┌────────────────────────────────────────────────────────┐
 *   │  CONITENS CONTROL PLANE  [CONNECTED]          [EST]   │
 *   ├────────────────────────────────────────────────────────┤
 *   │  AGENTS: 5/8 active  ERRORS: 1  THROUGHPUT: 12 ev/s   │
 *   │  CPU ████████░░ 78%   MEM ██████░░ 63%                 │
 *   ├─────────────────────── ROOMS ─────────────────────────┤
 *   │  [● CTRL-0 ACTIVE] [● LAB-1 BUSY] [● OFFICE-2 IDLE]  │
 *   │  [● LOBBY-0 ERROR] [● ARCHIVE-1 IDLE] ...             │
 *   ├─────────────────────── FLOORS ────────────────────────┤
 *   │  F0: 3 agents  active  F1: 2 agents  idle             │
 *   └────────────────────────────────────────────────────────┘
 *
 * Interaction model:
 *   - Clicking a room button calls drillIntoRoom(roomId) → navigates camera
 *   - Clicking a floor row calls drillIntoFloor(floorIndex)
 *   - Clicking "[OVERVIEW]" button calls drillReset() → returns to building view
 *
 * Diegetic design:
 *   - 3D backing geometry (layered boxes) provides depth and shadow
 *   - Corner scan-line corners + pulsing accent strips (useFrame animation)
 *   - Html overlay is always-on-top (occlusionMesh disabled) for readability
 *   - Panel dims to 60% opacity when not visible (camera behind building)
 *
 * Event-sourcing:
 *   - All navigation clicks are routed through spatial-store actions which
 *     append navigation.drilled_* events to the event log — fully replayable.
 *
 * Performance:
 *   - Single Html + single backing mesh — minimal draw calls
 *   - distanceFactor=20 scales content at overview distance
 *   - Memoised derived data to avoid per-frame recomputation
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useMetricsStore } from "../store/metrics-store.js";
import { ROLE_VISUALS } from "./RoomTypeVisuals.js";

// ── Layout constants ────────────────────────────────────────────────────────

/** Building width (must match CommandCenterScene.tsx) */
const BUILDING_W = 12;

/**
 * World-space position of the panel origin.
 * Centred on x, placed above the second floor's ceiling on the north wall (z≈0).
 */
const PANEL_POSITION: [number, number, number] = [BUILDING_W / 2, 7.2, -0.4];

/** Width × height of the backing geometry (world units) */
const PANEL_W = 5.6;
const PANEL_H = 2.8;

/** HTML distanceFactor — scales the CSS panel relative to camera distance */
const DIST_FACTOR = 22;

// ── Visual palette (command-center dark theme) ──────────────────────────────

const C = {
  bg:          "rgba(4, 4, 14, 0.92)",
  border:      "#1e1e44",
  accent:      "#4a6aff",
  accentDim:   "#2a3a88",
  accentGlow:  "rgba(74, 106, 255, 0.18)",
  text:        "#c8c8ee",
  textDim:     "#666699",
  textBright:  "#eeeeff",
  green:       "#00ff88",
  yellow:      "#ffcc00",
  orange:      "#ff8800",
  red:         "#ff4455",
  purple:      "#cc88ff",
  scanline:    "rgba(74, 106, 255, 0.06)",
  panelBorder: "rgba(74, 106, 255, 0.35)",
};

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

// ── Helper: activity → colour ───────────────────────────────────────────────

function activityColor(activity: string, paused: boolean): string {
  if (paused)                   return C.textDim;
  switch (activity) {
    case "busy":   return C.orange;
    case "active": return C.green;
    case "error":  return C.red;
    default:       return C.textDim;   // idle
  }
}

function activityLabel(activity: string, paused: boolean): string {
  if (paused)                   return "PAUSED";
  switch (activity) {
    case "busy":   return "BUSY";
    case "active": return "ACTIVE";
    case "error":  return "ERROR";
    default:       return "IDLE";
  }
}

// ── Sub-component: Horizontal gauge bar ────────────────────────────────────

function MiniGauge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const fillColor =
    clamped > 85 ? C.red :
    clamped > 65 ? C.orange :
    color;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
      <span style={{ fontSize: 7, color: C.textDim, fontFamily: FONT, width: 26, textAlign: "right", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{
        width: 72,
        height: 5,
        background: "rgba(30,30,60,0.8)",
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid rgba(60,60,100,0.5)",
        flexShrink: 0,
      }}>
        <div style={{
          width: `${clamped}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${fillColor}88, ${fillColor})`,
          borderRadius: 2,
          transition: "width 0.6s ease-out",
          boxShadow: `0 0 5px ${fillColor}66`,
        }} />
      </div>
      <span style={{
        fontSize: 7,
        color: fillColor,
        fontFamily: FONT,
        width: 26,
        textAlign: "left",
        flexShrink: 0,
      }}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

// ── Sub-component: KPI badge ────────────────────────────────────────────────

function KpiBadge({
  label,
  value,
  color,
  unit = "",
}: {
  label: string;
  value: number | string;
  color: string;
  unit?: string;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      padding: "4px 7px",
      background: "rgba(15,15,35,0.8)",
      border: `1px solid ${color}33`,
      borderRadius: 3,
      minWidth: 52,
    }}>
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color,
        fontFamily: FONT,
        lineHeight: 1,
        letterSpacing: "0.04em",
      }}>
        {value}{unit && <span style={{ fontSize: 8, color: C.textDim, marginLeft: 1 }}>{unit}</span>}
      </span>
      <span style={{
        fontSize: 6,
        color: C.textDim,
        fontFamily: FONT,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

// ── Sub-component: Room status button ──────────────────────────────────────

function RoomStatusButton({
  roomId,
  roomType,
  activity,
  paused,
  agentCount,
  selected,
  onClick,
}: {
  roomId: string;
  roomType: string;
  activity: string;
  paused: boolean;
  agentCount: number;
  selected: boolean;
  onClick: () => void;
}) {
  const color = activityColor(activity, paused);
  const label = activityLabel(activity, paused);
  const roleVisual = ROLE_VISUALS[roomType as keyof typeof ROLE_VISUALS];
  const typeColor  = roleVisual?.color ?? C.accentDim;
  const typeIcon   = roleVisual?.icon  ?? "▪";

  // Short room label: strip common prefixes
  const shortId = roomId
    .replace(/^room-/, "")
    .replace(/^floor-\d+-/, "")
    .toUpperCase()
    .slice(0, 10);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 6px",
        background: selected
          ? `rgba(74, 106, 255, 0.22)`
          : "rgba(12, 12, 28, 0.9)",
        border: selected
          ? `1px solid ${C.accent}88`
          : `1px solid ${color}33`,
        borderRadius: 3,
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.15s ease",
        outline: "none",
        minWidth: 74,
        maxWidth: 88,
      }}
      title={`${roomId} — ${label} — ${agentCount} agent${agentCount !== 1 ? "s" : ""}`}
    >
      {/* Activity dot */}
      <div style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 5px ${color}`,
        flexShrink: 0,
      }} />
      {/* Type icon */}
      <span style={{
        fontSize: 7,
        color: typeColor,
        fontFamily: FONT,
        flexShrink: 0,
      }}>
        {typeIcon}
      </span>
      {/* Room ID */}
      <span style={{
        fontSize: 6,
        color: C.text,
        fontFamily: FONT,
        letterSpacing: "0.05em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
        maxWidth: 44,
      }}>
        {shortId}
      </span>
      {/* Agent count badge */}
      {agentCount > 0 && (
        <span style={{
          fontSize: 5,
          color: C.accent,
          fontFamily: FONT,
          background: "rgba(74,106,255,0.15)",
          border: `1px solid ${C.accentDim}55`,
          borderRadius: 2,
          padding: "0 2px",
          flexShrink: 0,
        }}>
          {agentCount}
        </span>
      )}
    </button>
  );
}

// ── Sub-component: Floor row ────────────────────────────────────────────────

function FloorRow({
  floorIndex,
  floorName,
  agentCount,
  activity,
  onClick,
}: {
  floorIndex: number;
  floorName: string;
  agentCount: number;
  activity: string;
  onClick: () => void;
}) {
  const color = activity === "error" ? C.red
              : activity === "busy"  ? C.orange
              : activity === "active" ? C.green
              : C.textDim;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        background: "rgba(10,10,24,0.7)",
        border: `1px solid ${color}22`,
        borderRadius: 3,
        cursor: "pointer",
        width: "100%",
        outline: "none",
        transition: "background 0.15s ease",
      }}
    >
      {/* Floor badge */}
      <span style={{
        fontSize: 8,
        color: C.accent,
        fontFamily: FONT,
        fontWeight: 700,
        width: 20,
        flexShrink: 0,
      }}>
        F{floorIndex}
      </span>
      {/* Floor name */}
      <span style={{
        fontSize: 7,
        color: C.text,
        fontFamily: FONT,
        letterSpacing: "0.05em",
        flex: 1,
        textAlign: "left",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {floorName}
      </span>
      {/* Activity indicator */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        flexShrink: 0,
      }}>
        <div style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 4px ${color}`,
        }} />
        <span style={{ fontSize: 6, color, fontFamily: FONT, width: 32, textAlign: "left" }}>
          {activity.toUpperCase()}
        </span>
      </div>
      {/* Agent count */}
      <span style={{
        fontSize: 7,
        color: C.textDim,
        fontFamily: FONT,
        width: 48,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {agentCount} {agentCount === 1 ? "agent" : "agents"}
      </span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * GlobalDashboardPanel — Diegetic 3D wall-mounted control-plane overview panel.
 *
 * Positioned at the building's north wall (z≈0) centred on the x-axis,
 * visible from the default overview camera position at [9.6, 9, 12].
 *
 * Reads from:
 *   - spatial-store  (building definition, room states, navigation actions)
 *   - agent-store    (agent status counts per room)
 *   - metrics-store  (CPU, memory, throughput, connection status)
 *
 * All navigation clicks route through spatial-store actions which append
 * navigation events to the event log for full audit / replay.
 */
export function GlobalDashboardPanel() {
  // ── Store subscriptions ────────────────────────────────────────────────
  const building         = useSpatialStore((s) => s.building);
  const roomStates       = useSpatialStore((s) => s.roomStates);
  const selectedRoomId   = useSpatialStore((s) => s.selectedRoomId);
  const drillRoom        = useSpatialStore((s) => s.drillRoom);
  const drillIntoRoom    = useSpatialStore((s) => s.drillIntoRoom);
  const drillIntoFloor   = useSpatialStore((s) => s.drillIntoFloor);
  const drillReset       = useSpatialStore((s) => s.drillReset);
  const dataSource       = useSpatialStore((s) => s.dataSource);

  const agents           = useAgentStore((s) => s.agents);

  const snapshot         = useMetricsStore((s) => s.snapshot);
  const connectionStatus = useMetricsStore((s) => s.connectionStatus);
  const liveEventCount   = useMetricsStore((s) => s.liveEventCount);

  // ── Derived metrics ────────────────────────────────────────────────────

  const agentCounts = snapshot.agentCounts;

  /** Active + busy agents */
  const activeAgents = agentCounts.active + agentCounts.busy;
  /** Agents in error state */
  const errorAgents  = agentCounts.error;

  /** Throughput: events per tick from metrics store */
  const throughput   = snapshot.system.eventsPerTick;

  /** Per-room agent counts derived from agent-store */
  const agentsByRoom = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of Object.values(agents)) {
      if (a.roomId) m[a.roomId] = (m[a.roomId] ?? 0) + 1;
    }
    return m;
  }, [agents]);

  /** Per-floor aggregated activity */
  const floorActivity = useMemo(() => {
    const out: Record<number, { activity: string; agentCount: number }> = {};
    for (const floor of building.floors) {
      const rooms = building.rooms.filter((r) => r.floor === floor.floor);
      let floorAct = "idle";
      let floorAgents = 0;
      for (const room of rooms) {
        const rs = roomStates[room.roomId];
        if (rs?.activity === "error")       floorAct = "error";
        else if (rs?.activity === "busy" && floorAct !== "error") floorAct = "busy";
        else if (rs?.activity === "active" && floorAct === "idle") floorAct = "active";
        floorAgents += agentsByRoom[room.roomId] ?? 0;
      }
      out[floor.floor] = { activity: floorAct, agentCount: floorAgents };
    }
    return out;
  }, [building, roomStates, agentsByRoom]);

  // ── Connection status display ──────────────────────────────────────────

  const connColor =
    connectionStatus === "connected"  ? C.green  :
    connectionStatus === "degraded"   ? C.yellow :
    connectionStatus === "connecting" ? C.orange :
    C.textDim;

  const connLabel =
    connectionStatus === "connected"  ? "LIVE"    :
    connectionStatus === "degraded"   ? "DEGRAD"  :
    connectionStatus === "connecting" ? "CONN…"   :
    "EST";

  // ── Backing geometry animation ─────────────────────────────────────────

  const cornerTLRef = useRef<THREE.Mesh>(null);
  const cornerTRRef = useRef<THREE.Mesh>(null);
  const stripTopRef = useRef<THREE.Mesh>(null);
  const backingRef  = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Pulsing corner accents
    const pulse = 0.4 + Math.sin(t * 1.5) * 0.25;
    if (cornerTLRef.current) {
      (cornerTLRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    if (cornerTRRef.current) {
      (cornerTRRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }

    // Scrolling top accent strip
    if (stripTopRef.current) {
      const mat = stripTopRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.6 + Math.sin(t * 0.8) * 0.2;
    }

    // Backing panel breathes slightly
    if (backingRef.current) {
      const mat = backingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.88 + Math.sin(t * 0.5) * 0.04;
    }
  });

  // ── Materials (memoised to avoid recreation each render) ──────────────

  const backingMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#020210",
      transparent: true,
      opacity: 0.88,
      side: THREE.FrontSide,
    }),
    [],
  );

  const borderMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#1e1e44",
      transparent: true,
      opacity: 0.9,
      side: THREE.FrontSide,
    }),
    [],
  );

  const accentMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#4a6aff",
      transparent: true,
      opacity: 0.7,
      side: THREE.FrontSide,
    }),
    [],
  );

  const cornerMatL = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#4a6aff",
      transparent: true,
      opacity: 0.5,
      side: THREE.FrontSide,
    }),
    [],
  );

  const cornerMatR = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#ff4455",
      transparent: true,
      opacity: 0.5,
      side: THREE.FrontSide,
    }),
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <group position={PANEL_POSITION}>

      {/* ── 3D Backing geometry (diegetic depth) ─────────────────────── */}

      {/* Outer border frame */}
      <mesh material={borderMat} position={[0, 0, -0.04]}>
        <boxGeometry args={[PANEL_W + 0.12, PANEL_H + 0.12, 0.05]} />
      </mesh>

      {/* Main backing panel */}
      <mesh ref={backingRef} material={backingMat} position={[0, 0, -0.01]}>
        <boxGeometry args={[PANEL_W, PANEL_H, 0.04]} />
      </mesh>

      {/* Top accent strip — full-width cyan line */}
      <mesh ref={stripTopRef} material={accentMat} position={[0, PANEL_H / 2 - 0.04, 0.01]}>
        <boxGeometry args={[PANEL_W - 0.1, 0.04, 0.01]} />
      </mesh>

      {/* Bottom accent strip */}
      <mesh material={accentMat} position={[0, -(PANEL_H / 2 - 0.04), 0.01]}>
        <boxGeometry args={[PANEL_W - 0.1, 0.02, 0.01]} />
      </mesh>

      {/* Corner accents — TL (blue), TR (red for error awareness) */}
      <mesh
        ref={cornerTLRef}
        material={cornerMatL}
        position={[-(PANEL_W / 2 - 0.12), PANEL_H / 2 - 0.12, 0.02]}
      >
        <boxGeometry args={[0.18, 0.18, 0.01]} />
      </mesh>
      <mesh
        ref={cornerTRRef}
        material={cornerMatR}
        position={[PANEL_W / 2 - 0.12, PANEL_H / 2 - 0.12, 0.02]}
      >
        <boxGeometry args={[0.18, 0.18, 0.01]} />
      </mesh>

      {/* Depth side-bars — gives impression of a thick mounted screen */}
      <mesh position={[-(PANEL_W / 2 + 0.025), 0, -0.05]}>
        <boxGeometry args={[0.05, PANEL_H + 0.12, 0.12]} />
        <meshBasicMaterial color="#0a0a22" />
      </mesh>
      <mesh position={[PANEL_W / 2 + 0.025, 0, -0.05]}>
        <boxGeometry args={[0.05, PANEL_H + 0.12, 0.12]} />
        <meshBasicMaterial color="#0a0a22" />
      </mesh>

      {/* ── HTML content overlay ──────────────────────────────────────── */}
      <Html
        center
        distanceFactor={DIST_FACTOR}
        position={[0, 0, 0.06]}
        style={{ pointerEvents: "auto", userSelect: "none" }}
        zIndexRange={[10, 20]}
      >
        <div
          style={{
            width: 480,
            fontFamily: FONT,
            background: C.bg,
            border: `1px solid ${C.panelBorder}`,
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: `0 0 24px ${C.accentGlow}, 0 0 6px rgba(0,0,0,0.9)`,
          }}
        >
          {/* ── Header bar ─────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px 10px",
            background: `linear-gradient(90deg, rgba(74,106,255,0.12), rgba(4,4,14,0.8))`,
            borderBottom: `1px solid ${C.border}`,
          }}>
            {/* Panel title */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6,
                height: 6,
                background: C.accent,
                clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                color: C.textBright,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>
                CONITENS CONTROL PLANE
              </span>
            </div>

            {/* Status badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {/* Connection status */}
              <span style={{
                fontSize: 6,
                color: connColor,
                background: `${connColor}18`,
                border: `1px solid ${connColor}44`,
                borderRadius: 2,
                padding: "1px 4px",
                letterSpacing: "0.08em",
              }}>
                {connLabel}
              </span>
              {/* Data source badge */}
              <span style={{
                fontSize: 6,
                color: dataSource === "yaml" ? C.green : C.textDim,
                background: "rgba(10,10,24,0.8)",
                border: `1px solid ${C.border}`,
                borderRadius: 2,
                padding: "1px 4px",
                letterSpacing: "0.08em",
              }}>
                {dataSource === "yaml" ? "YAML" : "STATIC"}
              </span>
              {/* Live event counter */}
              <span style={{
                fontSize: 6,
                color: C.textDim,
                fontFamily: FONT,
                letterSpacing: "0.06em",
              }}>
                {liveEventCount.toLocaleString()} ev
              </span>
              {/* Reset navigation button */}
              <button
                onClick={(e) => { e.stopPropagation(); drillReset(); }}
                style={{
                  fontSize: 6,
                  color: C.accent,
                  background: "rgba(74,106,255,0.10)",
                  border: `1px solid ${C.accentDim}66`,
                  borderRadius: 2,
                  padding: "1px 5px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  letterSpacing: "0.08em",
                  outline: "none",
                }}
                title="Reset to building overview"
              >
                OVERVIEW
              </button>
            </div>
          </div>

          {/* ── KPI metrics row ────────────────────────────────────── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            borderBottom: `1px solid ${C.border}`,
            flexWrap: "wrap",
          }}>
            {/* Agent counts */}
            <KpiBadge
              label="ACTIVE"
              value={activeAgents}
              color={activeAgents > 0 ? C.green : C.textDim}
            />
            <KpiBadge
              label="IDLE"
              value={agentCounts.idle}
              color={C.text}
            />
            <KpiBadge
              label="ERRORS"
              value={errorAgents}
              color={errorAgents > 0 ? C.red : C.textDim}
            />
            <KpiBadge
              label="QUEUE"
              value={snapshot.taskQueue}
              color={snapshot.taskQueue > 5 ? C.orange : C.text}
            />
            <KpiBadge
              label="THROUGHPUT"
              value={throughput}
              unit="/t"
              color={C.purple}
            />

            {/* Gauge bars */}
            <div style={{ flex: 1, minWidth: 110, marginLeft: 6 }}>
              <MiniGauge label="CPU" value={snapshot.system.cpu} color={C.accent} />
              <MiniGauge label="MEM" value={snapshot.system.memory} color={C.purple} />
            </div>
          </div>

          {/* ── Rooms section ───────────────────────────────────────── */}
          <div style={{ padding: "6px 10px 4px" }}>
            {/* Section header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 5,
            }}>
              <span style={{
                fontSize: 6,
                color: C.textDim,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>
                ROOMS — {building.rooms.length} total
              </span>
              <div style={{ height: 1, flex: 1, background: C.border, margin: "0 8px" }} />
              <span style={{
                fontSize: 6,
                color: C.textDim,
                letterSpacing: "0.06em",
              }}>
                click to drill
              </span>
            </div>

            {/* Room button grid */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              maxHeight: 68,
              overflowY: "auto",
            }}>
              {building.rooms.map((room) => {
                const rs      = roomStates[room.roomId];
                const activity = rs?.activity ?? "idle";
                const paused   = rs?.paused   ?? false;
                const count    = agentsByRoom[room.roomId] ?? 0;
                const isSel    = selectedRoomId === room.roomId || drillRoom === room.roomId;

                return (
                  <RoomStatusButton
                    key={room.roomId}
                    roomId={room.roomId}
                    roomType={room.roomType}
                    activity={activity}
                    paused={paused}
                    agentCount={count}
                    selected={isSel}
                    onClick={() => drillIntoRoom(room.roomId)}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Floors section ──────────────────────────────────────── */}
          <div style={{
            padding: "4px 10px 6px",
            borderTop: `1px solid ${C.border}`,
          }}>
            {/* Section header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 3,
            }}>
              <span style={{
                fontSize: 6,
                color: C.textDim,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginRight: 8,
              }}>
                FLOORS
              </span>
              <div style={{ height: 1, flex: 1, background: C.border }} />
            </div>

            {/* Floor rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {building.floors.map((floor) => {
                const fa = floorActivity[floor.floor] ?? { activity: "idle", agentCount: 0 };
                return (
                  <FloorRow
                    key={floor.floor}
                    floorIndex={floor.floor}
                    floorName={floor.name ?? `Floor ${floor.floor}`}
                    agentCount={fa.agentCount}
                    activity={fa.activity}
                    onClick={() => drillIntoFloor(floor.floor)}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "3px 10px",
            background: "rgba(4,4,14,0.95)",
            borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{
              fontSize: 5,
              color: C.textDim,
              fontFamily: FONT,
              letterSpacing: "0.08em",
            }}>
              TOTAL: {agentCounts.total} AGENTS · {building.rooms.length} ROOMS · {building.floors.length} FLOORS
            </span>
            <span style={{
              fontSize: 5,
              color: C.accentDim,
              fontFamily: FONT,
              letterSpacing: "0.08em",
            }}>
              CONITENS v0.1 · LOCAL
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
}
