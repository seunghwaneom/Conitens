/**
 * DiegeticCommandStatusIndicator.tsx — Sub-AC 8c
 *
 * Diegetic 3D status indicator that reflects live command lifecycle state for
 * ANY sourceEntityId (agent, ui_fixture, room, task, or other entity).
 *
 * The component renders directly in the 3D world at the provided `position`,
 * making command state a first-class spatial concern ("diegetic" — integrated
 * into the game world, not overlaid as a HUD element).
 *
 * ─── Visual language ────────────────────────────────────────────────────────
 *
 *   idle       — renders null  (zero draw cost)
 *   pending    — pulsing yellow torus ring + yellow icosahedron gem  ⋯
 *   processing — fast-rotating blue torus ring + blue gem  ▷
 *   completed  — static green ring + green gem, shrinks & fades out  ✓
 *   failed     — rapid-pulsing red ring + red gem, alarm strobe  ✗
 *   rejected   — slow orange ring + orange gem, drift-fades  ⊘
 *
 * ─── Geometry ────────────────────────────────────────────────────────────────
 *
 *   Outer ring  — THREE.TorusGeometry (low segment count for low-poly look)
 *   Inner badge — THREE.IcosahedronGeometry (subdivision 0 — 20-face gem)
 *   HTML label  — status icon + active count + latest command type
 *                 hidden when entity is outside INDICATOR_CULL_DIST
 *
 * ─── Performance ─────────────────────────────────────────────────────────────
 *
 *   - Both geometries are created once per component instance (useMemo)
 *   - Materials are re-created only when `dominantStatus` changes
 *   - Animations run in useFrame (no React re-renders per frame)
 *   - Returns null when dominantStatus is null (zero R3F overhead)
 *   - HTML label is hidden beyond INDICATOR_CULL_DIST to preserve frame budget
 *
 * ─── Integration ─────────────────────────────────────────────────────────────
 *
 *   Mount this component inside a CommandCenterScene at the world position of
 *   any entity whose command lifecycle should be visualised in-world.
 *
 * @example
 * ```tsx
 * // On a ui_fixture (dashboard panel)
 * <DiegeticCommandStatusIndicator
 *   sourceEntityId="ops-dashboard-main"
 *   position={[2.0, 1.8, -3.0]}
 *   entityType="fixture"
 * />
 *
 * // On an agent (in addition to or instead of CommandStatusBadge)
 * <DiegeticCommandStatusIndicator
 *   sourceEntityId={agentId}
 *   position={agentWorldPos}
 *   entityType="agent"
 *   scale={0.8}
 * />
 * ```
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";

import {
  useDiegeticStatusIndicator,
  DOMINANT_STATUS_PRIORITY,
  type DiegeticStatusIndicatorState,
} from "../hooks/use-diegetic-status-indicator.js";
import {
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleStatus,
} from "../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** World-unit radius of the indicator torus ring. */
export const INDICATOR_RING_RADIUS = 0.18;

/** Tube radius of the torus cross-section. */
export const INDICATOR_RING_TUBE_RADIUS = 0.022;

/** Radius of the central icosahedron badge gem. */
export const INDICATOR_GEM_RADIUS = 0.06;

/** Y offset above the provided position (floats above entity). */
export const INDICATOR_FLOAT_Y = 0.28;

/** Distance (world units) beyond which the HTML label is hidden. */
export const INDICATOR_CULL_DIST = 20;

/** Torus rotation speed in radians/sec for the processing state. */
const RING_ROTATION_SPEED_PROCESSING = 2.2;

/** Torus rotation speed in radians/sec for the pending state (slow pulse). */
const RING_ROTATION_SPEED_PENDING = 0.6;

/** Pulse period (seconds) for active states. */
const PULSE_PERIOD_S = 1.1;

/** How fast the failed "alarm" throbs (higher = faster). */
const FAILED_ALARM_SPEED = 5.0;

/** Duration of fade-out for terminal states (ms). */
const TERMINAL_FADE_MS = 2_800;

// Torus segment counts — low for stylized low-poly look
const RING_RADIAL_SEGS = 6;
const RING_TUBE_SEGS   = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Shared geometry (created once at module load — reused across all instances)
// ─────────────────────────────────────────────────────────────────────────────

const _sharedRingGeo = new THREE.TorusGeometry(
  INDICATOR_RING_RADIUS,
  INDICATOR_RING_TUBE_RADIUS,
  RING_TUBE_SEGS,
  RING_RADIAL_SEGS,
);

const _sharedGemGeo = new THREE.IcosahedronGeometry(INDICATOR_GEM_RADIUS, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Animation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the elapsed-time animation parameters for each lifecycle status.
 * All values are computed statelessly from `t` (THREE.Clock.getElapsedTime).
 */
function computeAnimParams(
  status: CommandLifecycleStatus,
  t: number,
  updatedAtMs: number,
): {
  ringRotX: number;
  ringRotY: number;
  ringRotZ: number;
  ringOpacity: number;
  ringEmissive: number;
  ringScale: number;
  gemOpacity: number;
  gemEmissive: number;
  gemScale: number;
} {
  const age      = Date.now() - updatedAtMs;
  const fadeFrac = Math.min(age / TERMINAL_FADE_MS, 1.0);

  switch (status) {
    case "pending": {
      const pulse = 0.55 + Math.sin((t * Math.PI * 2) / PULSE_PERIOD_S) * 0.35;
      return {
        ringRotX:    0,
        ringRotY:    t * RING_ROTATION_SPEED_PENDING,
        ringRotZ:    t * 0.3,
        ringOpacity: pulse,
        ringEmissive: 0.6 + Math.sin(t * 2) * 0.25,
        ringScale:   1.0 + Math.sin(t * 1.5) * 0.06,
        gemOpacity:  pulse,
        gemEmissive: 0.8,
        gemScale:    1.0,
      };
    }

    case "processing": {
      const pulse = 0.7 + Math.sin((t * Math.PI * 2) / PULSE_PERIOD_S) * 0.2;
      return {
        ringRotX:    t * 0.4,
        ringRotY:    t * RING_ROTATION_SPEED_PROCESSING,
        ringRotZ:    t * -0.6,
        ringOpacity: pulse,
        ringEmissive: 1.0,
        ringScale:   1.0,
        gemOpacity:  0.8 + Math.sin(t * 3) * 0.15,
        gemEmissive: 1.2,
        gemScale:    1.0 + Math.sin(t * 4) * 0.04,
      };
    }

    case "completed": {
      const remain = Math.max(0, 1.0 - fadeFrac);
      return {
        ringRotX:    0,
        ringRotY:    t * 0.2,
        ringRotZ:    0,
        ringOpacity: remain,
        ringEmissive: 0.5 * remain,
        ringScale:   1.0 + fadeFrac * 0.3,  // expands as it fades
        gemOpacity:  remain,
        gemEmissive: 0.6 * remain,
        gemScale:    Math.max(0.01, 1.0 - fadeFrac * 0.8),
      };
    }

    case "failed": {
      const alarm = 0.4 + Math.abs(Math.sin(t * FAILED_ALARM_SPEED)) * 0.6;
      const remain = Math.max(0, 1.0 - fadeFrac);
      return {
        ringRotX:    Math.sin(t * FAILED_ALARM_SPEED * 0.5) * 0.2,
        ringRotY:    t * 0.8,
        ringRotZ:    0,
        ringOpacity: alarm * remain,
        ringEmissive: 1.5 * alarm * remain,
        ringScale:   1.0 + Math.sin(t * FAILED_ALARM_SPEED) * 0.08,
        gemOpacity:  alarm * remain,
        gemEmissive: 2.0 * alarm * remain,
        gemScale:    1.0 + Math.sin(t * FAILED_ALARM_SPEED * 1.3) * 0.12,
      };
    }

    case "rejected": {
      const remain = Math.max(0, 1.0 - fadeFrac);
      return {
        ringRotX:    0,
        ringRotY:    t * 0.4,
        ringRotZ:    0,
        ringOpacity: remain * 0.75,
        ringEmissive: 0.4 * remain,
        ringScale:   1.0,
        gemOpacity:  remain * 0.7,
        gemEmissive: 0.5 * remain,
        gemScale:    Math.max(0.01, 1.0 - fadeFrac * 0.6),
      };
    }

    default: {
      return {
        ringRotX: 0, ringRotY: 0, ringRotZ: 0,
        ringOpacity: 0, ringEmissive: 0, ringScale: 1,
        gemOpacity: 0, gemEmissive: 0, gemScale: 1,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner animated indicator mesh
// ─────────────────────────────────────────────────────────────────────────────

interface IndicatorMeshProps {
  status: CommandLifecycleStatus;
  updatedAtMs: number;
  indicatorState: DiegeticStatusIndicatorState;
  showLabel: boolean;
  scale: number;
}

function IndicatorMesh({
  status,
  updatedAtMs,
  indicatorState,
  showLabel,
  scale,
}: IndicatorMeshProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const gemRef  = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const gemMatRef  = useRef<THREE.MeshStandardMaterial | null>(null);

  const color = COMMAND_STATUS_COLORS[status];

  const ringMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: 0.8,
        roughness:         0.3,
        metalness:         0.5,
        flatShading:       true,
        transparent:       true,
        opacity:           0.9,
        side:              THREE.DoubleSide,
      }),
    // Re-create when status changes (color changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color],
  );
  ringMatRef.current = ringMat;

  const gemMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: 1.0,
        roughness:         0.2,
        metalness:         0.7,
        flatShading:       true,
        transparent:       true,
        opacity:           0.95,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color],
  );
  gemMatRef.current = gemMat;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const params = computeAnimParams(status, t, updatedAtMs);

    if (ringRef.current) {
      const ring = ringRef.current;
      ring.rotation.x = params.ringRotX;
      ring.rotation.y = params.ringRotY;
      ring.rotation.z = params.ringRotZ;
      ring.scale.setScalar(params.ringScale * scale);
    }
    if (ringMatRef.current) {
      ringMatRef.current.opacity           = params.ringOpacity;
      ringMatRef.current.emissiveIntensity = params.ringEmissive;
    }

    if (gemRef.current) {
      gemRef.current.scale.setScalar(params.gemScale * scale);
      gemRef.current.rotation.y = t * 1.4;
      gemRef.current.rotation.x = t * 0.5;
    }
    if (gemMatRef.current) {
      gemMatRef.current.opacity           = params.gemOpacity;
      gemMatRef.current.emissiveIntensity = params.gemEmissive;
    }
  });

  const icon             = COMMAND_STATUS_ICONS[status];
  const latestType       = indicatorState.latestEntry?.command_type ?? "";
  const shortType        = latestType
    .replace(/^agent\./, "")
    .replace(/^task\./, "")
    .replace(/^nav\./, "");
  const activeCount      = indicatorState.activeCount;

  return (
    <>
      {/* Outer torus ring */}
      <mesh
        ref={ringRef}
        geometry={_sharedRingGeo}
        material={ringMat}
        castShadow={false}
        receiveShadow={false}
      />

      {/* Central gem */}
      <mesh
        ref={gemRef}
        geometry={_sharedGemGeo}
        material={gemMat}
        castShadow={false}
      />

      {/* HTML holographic label — only shown when in cull range */}
      {showLabel && (
        <Html
          position={[0, INDICATOR_RING_RADIUS + 0.06, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            4,
              padding:        "2px 6px",
              background:     "rgba(6, 8, 20, 0.88)",
              border:         `1px solid ${color}66`,
              borderRadius:   3,
              backdropFilter: "blur(4px)",
              boxShadow:      `0 0 6px ${color}44`,
              whiteSpace:     "nowrap",
            }}
          >
            {/* Status icon */}
            <span
              style={{
                fontSize:   "9px",
                color,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
              }}
            >
              {icon}
            </span>

            {/* Active count badge — only shown if > 1 */}
            {activeCount > 1 && (
              <span
                style={{
                  fontSize:        "7px",
                  color:           "#fff",
                  background:      color,
                  borderRadius:    "2px",
                  padding:         "0 3px",
                  fontFamily:      "'JetBrains Mono', monospace",
                  fontWeight:      700,
                  minWidth:        12,
                  textAlign:       "center",
                }}
              >
                {activeCount}
              </span>
            )}

            {/* Latest command type — short form */}
            {shortType && (
              <span
                style={{
                  fontSize:      "6.5px",
                  color:         "#8899bb",
                  fontFamily:    "'JetBrains Mono', monospace",
                  letterSpacing: "0.03em",
                  maxWidth:       72,
                  overflow:       "hidden",
                  textOverflow:   "ellipsis",
                }}
              >
                {shortType}
              </span>
            )}
          </div>
        </Html>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/** Entity type hints for visual tuning — does not affect query logic. */
export type IndicatorEntityType = "agent" | "fixture" | "room" | "task" | "other";

export interface DiegeticCommandStatusIndicatorProps {
  /**
   * The entity whose command lifecycle state should be visualised.
   * May be an agent ID, fixture ID, room ID, task ID, or any entity ID.
   */
  sourceEntityId: string;

  /**
   * World-space position for the indicator group.
   * The indicator floats INDICATOR_FLOAT_Y units above this point.
   *
   * Default: [0, 0, 0]
   */
  position?: [number, number, number];

  /**
   * Semantic hint about the entity type.
   * Currently used for ARIA/debug naming; reserved for per-type visual
   * adjustments in future sub-ACs.
   *
   * Default: "other"
   */
  entityType?: IndicatorEntityType;

  /**
   * Whether the indicator should render HTML labels (distance culling).
   * Pass false when the entity is beyond the cull distance to avoid
   * adding DOM nodes for off-screen entities.
   *
   * Default: true
   */
  labelsVisible?: boolean;

  /**
   * Uniform scale multiplier applied to the ring and gem geometry.
   * Use < 1.0 for small entities, > 1.0 for large rooms / buildings.
   *
   * Default: 1.0
   */
  scale?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diegetic 3D command status indicator for any source entity.
 *
 * Reads live command lifecycle state via useDiegeticStatusIndicator and
 * renders an animated, color-coded ring + gem badge in 3D world space.
 *
 * Returns null when the entity has no active or recently-resolved commands
 * (zero render cost when idle).
 */
export function DiegeticCommandStatusIndicator({
  sourceEntityId,
  position = [0, 0, 0],
  entityType = "other",
  labelsVisible = true,
  scale = 1.0,
}: DiegeticCommandStatusIndicatorProps) {
  const indicatorState = useDiegeticStatusIndicator(sourceEntityId);

  // No commands → nothing to render
  if (!indicatorState.dominantStatus) return null;

  const { dominantStatus, latestEntry } = indicatorState;
  const updatedAtMs = latestEntry
    ? new Date(latestEntry.updatedAt).getTime()
    : Date.now();

  const [px, py, pz] = position;

  return (
    <group
      position={[px, py + INDICATOR_FLOAT_Y, pz]}
      name={`diegetic-status-${entityType}-${sourceEntityId}`}
    >
      <IndicatorMesh
        status={dominantStatus}
        updatedAtMs={updatedAtMs}
        indicatorState={indicatorState}
        showLabel={labelsVisible}
        scale={scale}
      />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for consumer convenience
// ─────────────────────────────────────────────────────────────────────────────

export {
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleStatus,
} from "../store/command-lifecycle-store.js";

export {
  DOMINANT_STATUS_PRIORITY,
  computeDominantStatus,
  type DiegeticStatusIndicatorState,
} from "../hooks/use-diegetic-status-indicator.js";
