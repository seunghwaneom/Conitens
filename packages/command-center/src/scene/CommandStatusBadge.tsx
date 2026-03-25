/**
 * CommandStatusBadge.tsx — Per-agent command lifecycle status indicators in 3D space.
 *
 * Sub-AC 8c: Render command lifecycle state visually in the 3D scene.
 *
 * Attaches color-coded low-poly badges (small octahedra) and animated particles to
 * an agent's position in the 3D world. Each badge represents an in-flight or
 * recently-resolved command associated with this agent.
 *
 * Visual language:
 *   pending    — pulsing yellow octahedron (⋯ command written, awaiting orchestrator)
 *   processing — pulsing blue  octahedron (▷ orchestrator accepted, executing)
 *   completed  — brief green  flash (✓ fades out after FADE_OUT_MS)
 *   failed     — brief red    flash (✗ fades out after FADE_OUT_MS)
 *   rejected   — brief orange flash (⊘ fades out after FADE_OUT_MS)
 *
 * Geometry: small icosahedron (subdivision 0 = 20-face polyhedron) positioned
 * to float in a horizontal arc above the agent head, in the "crown" area.
 * Multiple active commands are stacked vertically / arranged in a small arc.
 *
 * Performance:
 *   - Uses instancing-friendly individual meshes (low badge count per agent)
 *   - HTML label only shown when agent is in range (BADGE_CULL_DIST)
 *   - Bails out (returns null) when there are no active or recent commands
 *
 * Integration:
 *   - Mounted inside AgentAvatar, just after the status indicator dot
 *   - Reads from useCommandLifecycleStore — no prop drilling required
 *
 * @example
 * ```tsx
 * // In AgentAvatar (inside the <group ref={groupRef}>):
 * <CommandStatusBadge agentId={agentId} badgesVisible={badgeVisible} />
 * ```
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import {
  useCommandLifecycleStore,
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleEntry,
  type CommandLifecycleStatus,
} from "../store/command-lifecycle-store.js";
import { AVATAR_DIMENSIONS } from "./AgentAvatar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Badge octahedron radius in world units. */
const BADGE_RADIUS = 0.055;

/** Y offset above TOTAL_HEIGHT for the badge crown. */
const CROWN_Y_OFFSET = 0.22;

/** Horizontal spread between multiple badges (world units). */
const BADGE_SPREAD_X = 0.14;

/** Duration of the pulsing animation cycle in seconds (for pending/processing). */
const PULSE_PERIOD = 1.2;

/** Duration of the completed/failed/rejected fade-out in milliseconds. */
const FADE_OUT_MS = 2_500;

/** Time a terminal entry stays visible before CommandStatusBadge stops rendering it. */
const TERMINAL_VISIBLE_MS = FADE_OUT_MS + 500;

/**
 * Maximum number of badges rendered simultaneously per agent.
 * If more commands are in flight, oldest excess are dropped from visual.
 */
const MAX_VISIBLE_BADGES = 5;

/**
 * Distance-cull: hide badges when camera is farther than this world-unit distance.
 * Matches the BADGE_CULL_DIST in AgentAvatar for consistent behavior.
 */
export const CMD_BADGE_CULL_DIST = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Geometry cache — shared across all badge instances
// ─────────────────────────────────────────────────────────────────────────────

/** Shared icosahedron geometry (subdivision 0 = 20 faces — low-poly look). */
const _sharedOctoGeo = new THREE.IcosahedronGeometry(BADGE_RADIUS, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: SingleCommandBadge
// ─────────────────────────────────────────────────────────────────────────────

interface SingleCommandBadgeProps {
  entry: CommandLifecycleEntry;
  /** Local X position within the badge crown arc. */
  localX: number;
  /** Whether the parent agent badge area is in cull range. */
  inRange: boolean;
}

/**
 * Renders a single low-poly octahedron badge for one command lifecycle entry.
 *
 * Animations:
 *   pending / processing — oscillating Y position + opacity pulse
 *   completed / failed / rejected — scale-down + opacity fade
 */
function SingleCommandBadge({ entry, localX, inRange }: SingleCommandBadgeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.MeshStandardMaterial | null>(null);

  const status       = entry.status as CommandLifecycleStatus;
  const statusColor  = COMMAND_STATUS_COLORS[status];
  const isActive     = status === "pending" || status === "processing";
  const isTerminal   = !isActive;

  // Entry age in ms since last status update.
  const updatedAtMs = useMemo(
    () => new Date(entry.updatedAt).getTime(),
    [entry.updatedAt],
  );

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color:            statusColor,
        emissive:         statusColor,
        emissiveIntensity: isActive ? 0.8 : 0.4,
        roughness:        0.4,
        metalness:        0.3,
        flatShading:      true,
        transparent:      true,
        opacity:          1.0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusColor, isActive],
  );
  matRef.current = mat;

  // Crown Y position — float above TOTAL_HEIGHT
  const crownY = AVATAR_DIMENSIONS.TOTAL_HEIGHT + CROWN_Y_OFFSET;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const m    = matRef.current;
    const t    = clock.getElapsedTime();

    if (isActive) {
      // Pulsing Y bob + opacity throb
      mesh.position.y = crownY + Math.sin(t * (Math.PI * 2 / PULSE_PERIOD)) * 0.025;
      mesh.rotation.y = t * 1.5;
      mesh.rotation.x = t * 0.7;
      if (m) {
        m.opacity        = 0.65 + Math.sin(t * (Math.PI * 2 / PULSE_PERIOD) + 1) * 0.25;
        m.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.3;
      }
    } else {
      // Fade out towards invisible over FADE_OUT_MS
      const ageMs  = Date.now() - updatedAtMs;
      const tFade  = Math.min(ageMs / FADE_OUT_MS, 1.0);
      const opacity = Math.max(0, 1.0 - tFade);
      if (m) {
        m.opacity           = opacity;
        m.emissiveIntensity = 0.4 * opacity;
      }
      // Gentle slow rotation
      mesh.rotation.y += 0.008;
      // Drift upward while fading
      mesh.position.y = crownY + tFade * 0.12;
      mesh.scale.setScalar(Math.max(0.01, 1.0 - tFade * 0.5));
    }
  });

  return (
    <group position={[localX, crownY, 0]}>
      <mesh
        ref={meshRef}
        geometry={_sharedOctoGeo}
        material={mat}
        castShadow={false}
      />
      {/* HTML tooltip: only shown in range, with status icon + short command type */}
      {inRange && (
        <Html
          position={[0, BADGE_RADIUS * 2, 0]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:            3,
              padding:       "1px 4px",
              background:    "rgba(8, 8, 20, 0.85)",
              border:        `1px solid ${statusColor}55`,
              borderRadius:   2,
              backdropFilter: "blur(3px)",
              whiteSpace:     "nowrap",
            }}
          >
            <span
              style={{
                fontSize:  "7px",
                color:     statusColor,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
              }}
            >
              {COMMAND_STATUS_ICONS[status]}
            </span>
            <span
              style={{
                fontSize:      "6px",
                color:         "#8899aa",
                fontFamily:    "'JetBrains Mono', monospace",
                letterSpacing: "0.04em",
                maxWidth:       60,
                overflow:       "hidden",
                textOverflow:   "ellipsis",
              }}
            >
              {entry.command_type.replace("agent.", "").replace("task.", "").replace("nav.", "")}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: CommandStatusBadge
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandStatusBadgeProps {
  /** The agent whose commands should be visualized. */
  agentId: string;
  /**
   * Whether the parent avatar's HTML labels area is within cull distance.
   * Passed down to avoid duplicate distance calculations.
   */
  badgesVisible?: boolean;
}

/**
 * Per-agent command lifecycle status badge layer.
 *
 * Reads active and recently-terminal commands from the command-lifecycle-store
 * and renders a small arc of colored low-poly octahedra above the agent head.
 *
 * Returns null when there are no commands to show (zero render cost).
 */
export function CommandStatusBadge({
  agentId,
  badgesVisible = true,
}: CommandStatusBadgeProps) {
  // Reactive selector — re-renders when agentCommandMap[agentId] changes
  const activeEntries = useCommandLifecycleStore(
    (s) => s.getActiveCommandsForAgent(agentId),
  );

  // Also grab recently-terminal entries from the log (still within TERMINAL_VISIBLE_MS)
  const recentTerminal = useCommandLifecycleStore((s) => {
    const nowMs = Date.now();
    return s
      .getLogEntries(50)
      .filter(
        (e) =>
          e.agentId === agentId &&
          (e.status === "completed" || e.status === "failed" || e.status === "rejected") &&
          nowMs - new Date(e.updatedAt).getTime() < TERMINAL_VISIBLE_MS,
      )
      .slice(0, MAX_VISIBLE_BADGES - activeEntries.length);
  });

  const allEntries: CommandLifecycleEntry[] = [
    ...activeEntries,
    ...recentTerminal,
  ].slice(0, MAX_VISIBLE_BADGES);

  if (allEntries.length === 0) return null;

  // Distribute badges horizontally centered around X=0
  const totalWidth = (allEntries.length - 1) * BADGE_SPREAD_X;
  const startX     = -totalWidth / 2;

  return (
    <group name={`cmd-badges-${agentId}`}>
      {allEntries.map((entry, i) => (
        <SingleCommandBadge
          key={entry.command_id}
          entry={entry}
          localX={startX + i * BADGE_SPREAD_X}
          inRange={badgesVisible}
        />
      ))}
    </group>
  );
}
