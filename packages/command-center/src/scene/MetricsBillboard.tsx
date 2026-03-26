/**
 * MetricsBillboard.tsx — 3D billboard sprites for live metrics overlays.
 *
 * Sub-AC 7c: Real-time status & metrics overlay
 *
 * Attaches live CPU, memory, task-queue, and health indicators as
 * 3D billboard sprites to each agent/room node, pulling from the
 * control-plane API (via useControlPlaneMetrics) with automatic
 * fallback to metrics-store data when the API is offline.
 *
 * Exported components:
 *   AgentMetricsBillboard  — attaches to a specific agent avatar
 *   RoomMetricsBillboard   — attaches to a room node (shows aggregates)
 *
 * Design principles:
 *   - Diegetic: all labels live in 3D world space via @react-three/drei Html
 *   - Always-on: billboards are visible at all times (unlike lifecycle panel)
 *     but at reduced opacity when not focused, to avoid visual clutter
 *   - Backing geometry: a thin 3D box behind each HTML panel makes the
 *     billboard feel embedded in the world, not a floating 2D overlay
 *   - Gauge bars: horizontal CSS bars with percent fill — readable at any
 *     camera distance thanks to distanceFactor scaling
 *   - Health indicator: colored square-dot + text label
 *   - Live badge: "LIVE" tag shown when data originates from the API;
 *     "EST" shown when using store-derived fallback
 *
 * Layout (agent billboard, above the name badge):
 *
 *   ┌──────────────────────────────────┐
 *   │ ● HEALTHY           [EST]        │
 *   │ CPU [██████░░░░] 62%             │
 *   │ MEM [████░░░░░░] 48%             │
 *   │ QUEUE 2                          │
 *   └──────────────────────────────────┘
 *
 * Visibility levels:
 *   ambient (default) : opacity 0.45 — always present in peripheral view
 *   hovered           : opacity 0.85 — clear reading on hover
 *   selected/drilled  : opacity 1.00 — fully legible when focused
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import {
  useControlPlaneMetrics,
  HEALTH_COLORS,
  type HealthStatus,
} from "../hooks/use-control-plane-metrics.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/** Agent avatar total height (must match AgentAvatar.tsx constants) */
const AGENT_TOTAL_HEIGHT = 0.55 + 0.1 * 2 + 0.05; // BODY_HEIGHT + HEAD_RADIUS*2 + 0.05 = 0.80

/**
 * Y offset above agent's floor origin for the billboard.
 * Sits above the name badge (~0.95) but below the lifecycle panel (~1.55).
 */
export const AGENT_BILLBOARD_Y = AGENT_TOTAL_HEIGHT + 0.38; // ≈ 1.18

/**
 * Y offset above room floor for the room billboard.
 * Rooms are typically 2.6-3.0 units tall; this places the billboard
 * just above the highest visible wall.
 */
export const ROOM_BILLBOARD_Y = 3.2;

/** distanceFactor for Html components — scales the panel with camera distance */
const DIST_FACTOR_AGENT = 10;
const DIST_FACTOR_ROOM  = 14;

// ── Shared font stack ─────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

// ── Sub-component: Gauge bar ─────────────────────────────────────────────────

interface GaugeBarProps {
  label: string;
  value: number;   // 0-100
  color: string;
}

function GaugeBar({ label, value, color }: GaugeBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  // Derive bar fill colour from value magnitude
  const fillColor = useMemo(() => {
    if (clamped > 80) return "#ff4444";
    if (clamped > 60) return "#ffaa00";
    return color;
  }, [clamped, color]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        whiteSpace: "nowrap",
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: "6px",
          color: "#6666aa",
          fontFamily: FONT,
          letterSpacing: "0.06em",
          width: 22,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      {/* Track */}
      <div
        style={{
          width: 48,
          height: 4,
          background: "rgba(40, 40, 70, 0.8)",
          borderRadius: 2,
          overflow: "hidden",
          border: "1px solid rgba(80, 80, 120, 0.4)",
          flexShrink: 0,
        }}
      >
        {/* Fill */}
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: fillColor,
            borderRadius: 2,
            transition: "width 0.4s ease-out",
            boxShadow: `0 0 4px ${fillColor}88`,
          }}
        />
      </div>

      {/* Value */}
      <span
        style={{
          fontSize: "6px",
          color: fillColor,
          fontFamily: FONT,
          letterSpacing: "0.04em",
          width: 20,
          textAlign: "left",
          flexShrink: 0,
        }}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

// ── Sub-component: Health indicator ──────────────────────────────────────────

function HealthIndicator({
  health,
  isLive,
}: {
  health: HealthStatus;
  isLive: boolean;
}) {
  const color = HEALTH_COLORS[health];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {/* Health dot */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 5px ${color}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "6px",
            color,
            fontFamily: FONT,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {health}
        </span>
      </div>

      {/* Live / estimated badge */}
      <span
        style={{
          fontSize: "5px",
          color: isLive ? "#00aa55" : "#444466",
          fontFamily: FONT,
          letterSpacing: "0.08em",
          background: isLive ? "rgba(0,170,85,0.12)" : "rgba(40,40,60,0.6)",
          border: `1px solid ${isLive ? "#00aa5555" : "#33334455"}`,
          borderRadius: 2,
          padding: "0 3px",
        }}
      >
        {isLive ? "LIVE" : "EST"}
      </span>
    </div>
  );
}

// ── Sub-component: Queue indicator ───────────────────────────────────────────

function QueueIndicator({ count }: { count: number }) {
  const color = count > 5 ? "#ffaa00" : count > 0 ? "#8888cc" : "#444466";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        marginTop: 2,
      }}
    >
      <span
        style={{
          fontSize: "6px",
          color: "#6666aa",
          fontFamily: FONT,
          letterSpacing: "0.06em",
        }}
      >
        QUEUE
      </span>
      <span
        style={{
          fontSize: "7px",
          color,
          fontFamily: FONT,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {count}
      </span>
      {count > 0 && (
        <div
          style={{
            display: "flex",
            gap: 1,
            alignItems: "center",
          }}
        >
          {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: 1,
                background: color,
                opacity: 0.7 + i * 0.06,
              }}
            />
          ))}
          {count > 5 && (
            <span style={{ fontSize: "5px", color, fontFamily: FONT }}>+{count - 5}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Billboard panel shell ─────────────────────────────────────────────────────

/**
 * BillboardPanel — shared panel shell for agent and room metric billboards.
 *
 * Renders a dark glassmorphic card as an HTML overlay anchored in 3D space.
 * Includes a thin 3D backing box for depth perception.
 *
 * Opacity is animated in useFrame based on hover/selection state.
 */
function BillboardPanel({
  yOffset,
  distanceFactor,
  opacity,
  accentColor,
  children,
}: {
  yOffset: number;
  distanceFactor: number;
  opacity: number;
  accentColor: string;
  children: React.ReactNode;
}) {
  // Animated backing box — pulses glow with accentColor
  const backingRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!backingRef.current) return;
    const mat = backingRef.current.material as THREE.MeshBasicMaterial;
    const t = clock.getElapsedTime();
    mat.opacity = opacity * (0.08 + Math.sin(t * 1.2) * 0.02);
  });

  const backingMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      }),
    [accentColor],
  );

  return (
    <group position={[0, yOffset, 0]}>
      {/* Diegetic backing plane — a thin box for 3D depth */}
      <mesh ref={backingRef} material={backingMat} position={[0, 0, -0.01]}>
        <boxGeometry args={[0.72, 0.42, 0.008]} />
      </mesh>

      {/* HTML content billboard */}
      <Html
        center
        distanceFactor={distanceFactor}
        style={{ pointerEvents: "none" }}
        position={[0, 0, 0.01]}
      >
        <div
          style={{
            opacity,
            transition: "opacity 0.25s ease",
            padding: "4px 6px",
            background: "rgba(8, 8, 18, 0.88)",
            border: `1px solid ${accentColor}44`,
            borderRadius: 3,
            backdropFilter: "blur(6px)",
            boxShadow: `0 0 8px ${accentColor}22, inset 0 0 3px rgba(0,0,0,0.5)`,
            minWidth: 88,
          }}
        >
          {/* Top accent strip */}
          <div
            style={{
              height: 1,
              background: `linear-gradient(90deg, transparent, ${accentColor}88, transparent)`,
              marginBottom: 4,
              borderRadius: 1,
            }}
          />
          {children}
        </div>
      </Html>
    </group>
  );
}

// ── AgentMetricsBillboard ─────────────────────────────────────────────────────

interface AgentMetricsBillboardProps {
  /** The agent ID to display metrics for. */
  agentId: string;
  /** Accent colour (typically the agent's role colour). */
  accentColor?: string;
}

/**
 * AgentMetricsBillboard — live metrics billboard for a single agent.
 *
 * Positioned above the agent avatar between the name badge and lifecycle panel.
 * Visibility: semi-transparent by default, full opacity when hovered/drilled.
 *
 * Consumed by AgentAvatar.tsx — rendered as a sibling group inside the
 * agent's root <group>.
 */
export function AgentMetricsBillboard({
  agentId,
  accentColor = "#4a6aff",
}: AgentMetricsBillboardProps) {
  // ── Store subscriptions ────────────────────────────────────────────────
  const agent      = useAgentStore((s) => s.agents[agentId]);
  const drillAgent = useSpatialStore((s) => s.drillAgent);
  const isDrilled  = drillAgent === agentId;

  // ── Opacity based on interaction state ────────────────────────────────
  const opacity = useMemo(() => {
    if (!agent) return 0;
    if (agent.status === "inactive" || agent.status === "terminated") return 0.25;
    if (isDrilled) return 1.0;
    if (agent.hovered) return 0.85;
    return 0.45;
  }, [agent, isDrilled]);

  // ── Live metrics via control-plane API ────────────────────────────────
  const metrics = useControlPlaneMetrics(agentId, "agent");

  if (!agent) return null;

  const roleColor = agent.def.visual.color ?? accentColor;

  return (
    <BillboardPanel
      yOffset={AGENT_BILLBOARD_Y}
      distanceFactor={DIST_FACTOR_AGENT}
      opacity={opacity}
      accentColor={roleColor}
    >
      {/* Health + live/est badge */}
      <HealthIndicator health={metrics.health} isLive={metrics.isLive} />

      {/* CPU gauge */}
      <GaugeBar label="CPU" value={metrics.cpu} color={roleColor} />

      {/* Memory gauge */}
      <GaugeBar label="MEM" value={metrics.memory} color={roleColor} />

      {/* Task queue */}
      <QueueIndicator count={metrics.taskQueue} />
    </BillboardPanel>
  );
}

// ── RoomMetricsBillboard ──────────────────────────────────────────────────────

interface RoomMetricsBillboardProps {
  /** Room ID to display metrics for. */
  roomId: string;
  /** World-space Y position of the room floor (0 for ground floor, 3 for first floor…). */
  floorY?: number;
  /** Accent colour derived from room type. */
  accentColor?: string;
}

/**
 * RoomMetricsBillboard — aggregate metrics billboard for a room node.
 *
 * Floating above the room geometry, showing CPU/MEM/QUEUE aggregates.
 * Visibility: ambient (low opacity) by default; full opacity when room is
 * focused/selected.
 *
 * Consumed by SceneHierarchy.tsx — rendered inside the room group node
 * at NEAR LOD tier.
 */
export function RoomMetricsBillboard({
  roomId,
  floorY = 0,
  accentColor = "#4a6aff",
}: RoomMetricsBillboardProps) {
  // ── Store subscriptions ────────────────────────────────────────────────
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);
  const focusedRoomId  = useSpatialStore((s) => s.focusedRoomId);
  const roomState      = useSpatialStore((s) => s.getRoomState(roomId));
  const drillRoom      = useSpatialStore((s) => s.drillRoom);

  const isSelected = selectedRoomId === roomId;
  const isFocused  = focusedRoomId  === roomId;
  const isDrilled  = drillRoom       === roomId;

  // ── Opacity based on interaction state ────────────────────────────────
  const opacity = useMemo(() => {
    if (isDrilled || isSelected) return 1.0;
    if (isFocused) return 0.85;
    return 0.4;
  }, [isDrilled, isSelected, isFocused]);

  // ── Live metrics via control-plane API ────────────────────────────────
  const metrics = useControlPlaneMetrics(roomId, "room");

  // Use room activity to override health when the API is offline
  const effectiveHealth: HealthStatus = useMemo(() => {
    if (metrics.isLive) return metrics.health;
    switch (roomState.activity) {
      case "error":  return "error";
      case "busy":   return metrics.cpu > 75 ? "degraded" : "healthy";
      case "active": return "healthy";
      case "idle":   return "unknown";
      default:       return "unknown";
    }
  }, [metrics.isLive, metrics.health, roomState.activity, metrics.cpu]);

  // Count agents in this room from agent-store
  const agentCount = useAgentStore((s) =>
    Object.values(s.agents).filter((a) => a.roomId === roomId).length,
  );

  return (
    <group position={[0, floorY + ROOM_BILLBOARD_Y, 0]}>
      <BillboardPanel
        yOffset={0}
        distanceFactor={DIST_FACTOR_ROOM}
        opacity={opacity}
        accentColor={accentColor}
      >
        {/* Header row: room ID + agent count */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <span
            style={{
              fontSize: "6px",
              color: accentColor,
              fontFamily: FONT,
              letterSpacing: "0.08em",
              fontWeight: 700,
              textTransform: "uppercase",
              maxWidth: 60,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {roomId.replace(/-/g, " ")}
          </span>
          <span
            style={{
              fontSize: "5px",
              color: "#7777aa",
              fontFamily: FONT,
              letterSpacing: "0.06em",
            }}
          >
            {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Health + live/est badge */}
        <HealthIndicator health={effectiveHealth} isLive={metrics.isLive} />

        {/* CPU gauge */}
        <GaugeBar label="CPU" value={metrics.cpu} color={accentColor} />

        {/* Memory gauge */}
        <GaugeBar label="MEM" value={metrics.memory} color={accentColor} />

        {/* Task queue */}
        <QueueIndicator count={metrics.taskQueue} />
      </BillboardPanel>
    </group>
  );
}
