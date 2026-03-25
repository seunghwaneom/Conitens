/**
 * AgentAvatar — Low-poly stylized 3D agent avatar.
 *
 * Each agent is represented as a low-poly humanoid figure:
 *   - Capsule body (cylinder + hemispheres)
 *   - Sphere head (icosahedron, flatShading)
 *   - Role-colored glow ring at feet
 *   - Floating name badge (diegetic HTML label)
 *   - Status indicator (color + animation)
 *
 * Sub-AC 2b — Distinct inactive visual styling:
 *   - Inactive agents have DESATURATED color (not just dimmed) via desaturateHexColor()
 *   - Low emissive (emissiveMul 0.15) + low opacity (0.45) convey "dormant"
 *   - Idle pose: a slow head-bob + subtle lean sway unique to inactive state
 *   - "INACTIVE · AWAITING SPAWN" label appears on hover
 *   - Staggered fade-in: spawnIndex × STAGGER_MS sequencing
 *
 * AC2 — Inactive pre-placement behavior:
 *   - Agents start as "inactive" on initial load (not yet spawned)
 *   - Staggered fade-in: each avatar fades in with a delay based on spawnIndex
 *   - spawnIndex × STAGGER_MS determines when the fade begins
 *   - Inactive state: dimmed (low opacity), muted emissive, no animation
 *   - "INACTIVE — AWAITING SPAWN" label appears on hover
 *
 * All state changes are event-sourced through the agent store.
 */
import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { AgentRuntimeState } from "../store/agent-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useMeetingStore } from "../store/meeting-store.js";
import { useViewWindowStore } from "../store/view-window-store.js";
import { AgentLifecyclePanel } from "./AgentLifecyclePanel.js";
import { AgentCommandDispatch } from "./AgentCommandDispatch.js";
import { AgentMetricsBillboard } from "./MetricsBillboard.js";
import { CommandStatusBadge } from "./CommandStatusBadge.js";
import {
  useDistanceCull,
  usePerformanceQuality,
} from "./ScenePerformance.js";
import { useAgentInteractionHandlers } from "../hooks/use-agent-interaction-handlers.js";

/** Stagger delay in ms between consecutive avatar fade-ins */
const STAGGER_MS = 180;
/** Duration of the fade-in animation in ms */
const FADE_IN_DURATION_MS = 800;

// ── Color Utilities ─────────────────────────────────────────────────

/**
 * desaturateHexColor — Blend a hex color towards its luminance-matched grey.
 *
 * Used for Sub-AC 2b to make *inactive* and *terminated* agents visually
 * distinct from active agents: their role color is converted to a cold
 * near-grey rather than just dimmed via opacity.
 *
 * Algorithm:
 *   1. Parse hex → linear RGB
 *   2. Compute perceptual luminance (Rec. 709 weights)
 *   3. Lerp each channel: colorChannel * (1 - factor) + luminance * factor
 *   4. Re-encode as hex
 *
 * @param hex    — Input color as CSS hex string (#rrggbb or #rgb)
 * @param factor — Desaturation amount: 0 = full color, 1 = full grey
 * @returns      — Hex string with reduced saturation
 */
export function desaturateHexColor(hex: string, factor: number): string {
  // Normalize short hex (#rgb → #rrggbb)
  const normalized = hex.replace(
    /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,
    "#$1$1$2$2$3$3",
  );
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return hex; // passthrough on invalid

  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  // Rec. 709 luminance (perceptual grey)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Mix towards grey by factor
  const rOut = r * (1 - factor) + lum * factor;
  const gOut = g * (1 - factor) + lum * factor;
  const bOut = b * (1 - factor) + lum * factor;

  // Clamp + re-encode
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(rOut)}${toHex(gOut)}${toHex(bOut)}`;
}

// ── Exported Constants (for testing & external consumers) ──────────

/** Avatar mesh dimensions in world units (exported for Sub-AC 2b tests) */
export const AVATAR_DIMENSIONS = {
  BODY_HEIGHT: 0.55,
  BODY_RADIUS: 0.12,
  HEAD_RADIUS: 0.1,
  /** Full height including head + gap above shoulders */
  get TOTAL_HEIGHT() {
    return this.BODY_HEIGHT + this.HEAD_RADIUS * 2 + 0.05;
  },
} as const;

/**
 * Sub-AC 15c: Distance thresholds for HTML overlay culling.
 *
 * HTML badges (name label, status, meeting role) are costly DOM elements —
 * each forces layout recalculation when camera moves.  Hiding them beyond
 * these thresholds keeps DOM work proportional to visible agents, not all agents.
 *
 * BADGE_CULL_DIST    — hide badge HTML when camera is farther than this
 * METRICS_CULL_DIST  — hide metrics billboard when camera is farther than this
 *
 * These values are tuned so badges remain visible at comfortable operating zoom
 * (< ~18 units) but disappear at overview zoom (> ~18 units) where they would
 * be illegible anyway.
 */
const BADGE_CULL_DIST   = 18;
const METRICS_CULL_DIST = 12;

// ── Constants ──────────────────────────────────────────────────────

/** Avatar dimensions (in world units) — aliased from AVATAR_DIMENSIONS for internal use */
const BODY_HEIGHT  = AVATAR_DIMENSIONS.BODY_HEIGHT;
const BODY_RADIUS  = AVATAR_DIMENSIONS.BODY_RADIUS;
const HEAD_RADIUS  = AVATAR_DIMENSIONS.HEAD_RADIUS;
const TOTAL_HEIGHT = AVATAR_DIMENSIONS.TOTAL_HEIGHT;

/**
 * Status → visual config.
 *
 * Sub-AC 2b: 'inactive' and 'terminated' states receive extra desaturation
 * applied on top of the opacity + emissive reductions.  The desatFactor field
 * controls how far the role color is bleached toward neutral grey via
 * desaturateHexColor().  A factor of 0 keeps the full hue; 1.0 = full grey.
 *
 * Exported so tests can assert the documented design values.
 */
export const STATUS_CONFIG: Record<
  string,
  { opacity: number; emissiveMul: number; animate: boolean; desatFactor: number }
> = {
  inactive:   { opacity: 0.45, emissiveMul: 0.15, animate: false, desatFactor: 0.72 },
  idle:       { opacity: 0.75, emissiveMul: 0.4,  animate: false, desatFactor: 0.0  },
  active:     { opacity: 0.95, emissiveMul: 0.8,  animate: true,  desatFactor: 0.0  },
  busy:       { opacity: 1.0,  emissiveMul: 1.0,  animate: true,  desatFactor: 0.0  },
  error:      { opacity: 0.85, emissiveMul: 0.6,  animate: true,  desatFactor: 0.0  },
  terminated: { opacity: 0.2,  emissiveMul: 0.05, animate: false, desatFactor: 0.9  },
};

// ── Avatar Body (low-poly capsule) ─────────────────────────────────

/**
 * Low-poly capsule body: 6-sided cylinder trunk + top hemisphere shoulders.
 *
 * Sub-AC 2b: The `color` and `emissive` props are already pre-desaturated by
 * the parent `AgentAvatar` component when the agent is in 'inactive' or
 * 'terminated' state.  This component receives the final display color without
 * needing to know the agent status itself — keeping concerns separated.
 */
function AvatarBody({
  color,
  emissive,
  opacity,
  emissiveIntensity,
}: {
  color: string;
  emissive: string;
  opacity: number;
  emissiveIntensity: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness: 0.7,
        metalness: 0.2,
        flatShading: true,
        transparent: true,
        opacity,
      }),
    [color, emissive, opacity, emissiveIntensity],
  );

  return (
    <group>
      {/* Main body cylinder — 6-sided for stylized low-poly look */}
      <mesh position={[0, BODY_HEIGHT / 2, 0]} material={mat} castShadow>
        <cylinderGeometry args={[BODY_RADIUS * 0.85, BODY_RADIUS, BODY_HEIGHT, 6]} />
      </mesh>
      {/* Shoulders (top hemisphere) — 6×4 segments keeps the faceted low-poly aesthetic */}
      <mesh position={[0, BODY_HEIGHT, 0]} material={mat} castShadow>
        <sphereGeometry args={[BODY_RADIUS * 0.85, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

// ── Avatar Head ────────────────────────────────────────────────────

/**
 * Icosahedron head — subdivision-1 gives a satisfying low-poly facet count
 * without looking like a pure sphere.
 *
 * Sub-AC 2b: Head emissive is 20% brighter than body (×1.2 multiplier) so
 * the "face" remains legible even at low emissive levels during inactive state.
 * Color desaturation is applied upstream (same as AvatarBody).
 */
function AvatarHead({
  color,
  emissive,
  opacity,
  emissiveIntensity,
}: {
  color: string;
  emissive: string;
  opacity: number;
  emissiveIntensity: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: emissiveIntensity * 1.2,
        roughness: 0.5,
        metalness: 0.3,
        flatShading: true,
        transparent: true,
        opacity,
      }),
    [color, emissive, opacity, emissiveIntensity],
  );

  return (
    <mesh position={[0, BODY_HEIGHT + HEAD_RADIUS + 0.04, 0]} material={mat} castShadow>
      <icosahedronGeometry args={[HEAD_RADIUS, 1]} />
    </mesh>
  );
}

// ── Foot Ring (role-colored glow) ──────────────────────────────────

function FootRing({
  color,
  opacity,
  status,
}: {
  color: string;
  opacity: number;
  status: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    if (status === "active" || status === "busy") {
      mat.opacity = opacity * (0.4 + Math.sin(clock.getElapsedTime() * 2.5) * 0.2);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 0.01, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[BODY_RADIUS * 0.6, BODY_RADIUS * 1.4, 6]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity * 0.35}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Status Indicator Dot ───────────────────────────────────────────

function StatusDot({ status, color }: { status: string; color: string }) {
  const dotColor = useMemo(() => {
    switch (status) {
      case "inactive":   return "#555566";
      case "idle":       return "#888899";
      case "active":     return "#00ff88";
      case "busy":       return "#ffaa00";
      case "error":      return "#ff4444";
      case "terminated": return "#333344";
      default:           return color;
    }
  }, [status, color]);

  return (
    <mesh position={[0, TOTAL_HEIGHT + 0.06, 0]}>
      <sphereGeometry args={[0.025, 4, 4]} />
      <meshBasicMaterial color={dotColor} />
    </mesh>
  );
}

// ── Meeting Orbit Ring (Sub-AC 10c) ────────────────────────────────

/**
 * Animated orbit ring shown around agents that are participants in an
 * active collaboration session. Rotates around the Y-axis and pulses
 * to make session participants immediately distinguishable in the 3D scene.
 */
function MeetingOrbitRing({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    // Rotate the ring around the agent
    groupRef.current.rotation.y = t * 1.4;
    // Vertical bob: the ring floats up and down slightly
    groupRef.current.position.y = BODY_HEIGHT / 2 + Math.sin(t * 2.1) * 0.06;
    // Pulse opacity via material
    const mat = groupRef.current.children[0]?.children[0] as THREE.Mesh | undefined;
    if (mat) {
      const m = (mat as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = 0.35 + Math.sin(t * 3.5) * 0.2;
    }
  });

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    [color],
  );

  // Outer diamond-tilt orbit ring
  return (
    <group ref={groupRef} position={[0, BODY_HEIGHT / 2, 0]}>
      <group rotation={[Math.PI / 4, 0, 0]}>
        <mesh material={ringMat}>
          <ringGeometry args={[BODY_RADIUS * 1.7, BODY_RADIUS * 2.1, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Floating Name Badge ────────────────────────────────────────────

function AgentBadge({
  agent,
  fadeOpacity,
  meetingRole,
}: {
  agent: AgentRuntimeState;
  fadeOpacity: number;
  meetingRole?: string | null;
}) {
  const { def, status, hovered } = agent;
  const statusColor = useMemo(() => {
    switch (status) {
      case "inactive":   return "#555566";
      case "idle":       return "#888899";
      case "active":     return "#00ff88";
      case "busy":       return "#ffaa00";
      case "error":      return "#ff4444";
      case "terminated": return "#333344";
      default:           return def.visual.color;
    }
  }, [status, def.visual.color]);

  // Badge base opacity — modulated by fade-in animation
  const baseOpacity = hovered ? 1 : (status === "inactive" ? 0.5 : 0.75);
  const effectiveOpacity = baseOpacity * fadeOpacity;

  return (
    <Html
      position={[0, TOTAL_HEIGHT + 0.15, 0]}
      center
      distanceFactor={12}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          opacity: effectiveOpacity,
          transition: "opacity 0.2s ease",
        }}
      >
        {/* Name label */}
        <div
          style={{
            background: "rgba(10, 10, 20, 0.8)",
            border: `1px solid ${hovered ? def.visual.color : "#333355"}`,
            borderRadius: 3,
            padding: "2px 5px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            backdropFilter: "blur(4px)",
            transition: "border-color 0.2s ease",
          }}
        >
          <span
            style={{
              fontSize: "8px",
              color: status === "inactive" ? `${def.visual.color}88` : def.visual.color,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.06em",
            }}
          >
            {def.visual.icon}
          </span>
          <span
            style={{
              fontSize: "7px",
              color: hovered ? def.visual.color : (status === "inactive" ? "#555577" : "#7777aa"),
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.06em",
              fontWeight: hovered ? 700 : 400,
              whiteSpace: "nowrap",
              transition: "color 0.2s ease",
            }}
          >
            {def.name}
          </span>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: statusColor,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        </div>
        {/* Inactive: show "AWAITING SPAWN" label on hover */}
        {status === "inactive" && hovered && (
          <div
            style={{
              fontSize: "6px",
              color: "#444466",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "rgba(10, 10, 20, 0.7)",
              padding: "1px 4px",
              borderRadius: 2,
              border: "1px solid #333355",
            }}
          >
            INACTIVE · AWAITING SPAWN
          </div>
        )}
        {/* Active/busy/error: show status + task */}
        {(status === "active" || status === "busy" || status === "error") && (
          <div
            style={{
              fontSize: "6px",
              color: statusColor,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {status}
            {agent.currentTaskTitle && ` · ${agent.currentTaskTitle}`}
          </div>
        )}
        {/* Sub-AC 10c: In-meeting role badge */}
        {meetingRole && (
          <div
            style={{
              fontSize: "6px",
              color: "#FFD700",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "rgba(255, 215, 0, 0.12)",
              border: "1px solid rgba(255, 215, 0, 0.4)",
              borderRadius: 2,
              padding: "1px 4px",
              marginTop: 1,
            }}
          >
            ⚑ IN MEETING · {meetingRole.toUpperCase().slice(0, 8)}
          </div>
        )}
      </div>
    </Html>
  );
}

// ── Main Avatar Component ──────────────────────────────────────────

interface AgentAvatarProps {
  agentId: string;
  /**
   * Sub-AC 15.2: view_window culling gate.
   *
   * When false, the avatar group is hidden (visible=false) so the GPU issues
   * no draw calls for this agent.  The React component stays mounted to avoid
   * Three.js object disposal and re-creation overhead on frustum transitions.
   *
   * Defaults to true so avatars render normally before the view-window store
   * has been populated (first-frame bootstrap period).
   */
  viewWindowVisible?: boolean;
}

/**
 * Renders a single agent avatar in the 3D scene.
 * Reads from the agent store for status and position.
 * Supports hover interaction and selection.
 *
 * AC2: Staggered fade-in on initial load.
 *   - Avatar starts invisible (scale=0, opacity=0) until spawnTs is reached
 *   - Then fades in over FADE_IN_DURATION_MS with a scale pop-in effect
 *   - spawnIndex × STAGGER_MS provides sequential staging
 */
export function AgentAvatar({ agentId, viewWindowVisible = true }: AgentAvatarProps) {
  const agent = useAgentStore((s) => s.agents[agentId]);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  // Note: selectAgent and setAgentHovered are accessed inside useAgentInteractionHandlers;
  // they are NOT needed directly in this component since Sub-AC 4c moved all handler
  // logic into the hook.  Only selectedAgentId remains here for the isSelected flag.

  // Sub-AC 10c: check if this agent is in an active meeting session
  const meetingSession = useMeetingStore((s) => s.getSessionForParticipant(agentId));
  const inMeeting = meetingSession != null;
  const meetingRole = inMeeting
    ? (meetingSession.participants.find((p) => p.participant_id === agentId)?.assigned_role ?? null)
    : null;

  const groupRef = useRef<THREE.Group>(null);
  // Smooth scale progress — updated every frame in useFrame (no React state needed)
  const fadeRef = useRef(0);
  // React state for badge visibility — only updated once per avatar when spawn completes
  // (prevents HTML badge from appearing before the 3D avatar pops in)
  const [badgeVisible, setBadgeVisible] = useState(false);

  const isSelected = selectedAgentId === agentId;

  // Compute visual properties from status
  const statusCfg = STATUS_CONFIG[agent?.status ?? "inactive"] ?? STATUS_CONFIG.inactive;
  const { color: rawColor, emissive: rawEmissive } = agent?.def.visual ?? {
    color: "#555566",
    emissive: "#333344",
  };

  /**
   * Sub-AC 2b: Apply color desaturation for inactive/terminated agents.
   *
   * `desatFactor` in STATUS_CONFIG controls how far the role color bleeds
   * toward luminance-matched grey:
   *   - inactive   → 72% desaturated  (cold, dormant appearance)
   *   - terminated → 90% desaturated  (near-monochrome, visually "dead")
   *   - all others → 0% (full role color retained)
   *
   * Both the diffuse `color` and the `emissive` tint are desaturated so
   * the lighting interaction also loses saturation (not just the flat surface).
   */
  const color   = useMemo(() => desaturateHexColor(rawColor,   statusCfg.desatFactor), [rawColor,   statusCfg.desatFactor]);
  const emissive = useMemo(() => desaturateHexColor(rawEmissive, statusCfg.desatFactor), [rawEmissive, statusCfg.desatFactor]);

  // Sub-AC 10c: boost emissive for meeting participants
  const emissiveIntensity = statusCfg.emissiveMul * 0.5 * (inMeeting ? 1.6 : 1.0);

  // Sub-AC 15c: Distance-based HTML culling.
  // useDistanceCull triggers a React re-render ONLY when the boundary is crossed,
  // so there is no per-frame overhead beyond a single Vector3.distanceTo call.
  const wx = agent?.worldPosition.x ?? 0;
  const wy = agent?.worldPosition.y ?? 0;
  const wz = agent?.worldPosition.z ?? 0;
  const badgeInRange   = useDistanceCull(wx, wy + 0.8, wz, BADGE_CULL_DIST);
  const metricsInRange = useDistanceCull(wx, wy + 0.8, wz, METRICS_CULL_DIST);

  // Sub-AC 15c: Quality level — hide expensive HTML at 'low' quality
  const quality = usePerformanceQuality();
  const showHtml = quality !== "low";

  // Staggered spawn animation + idle/active animation
  useFrame(({ clock }) => {
    if (!groupRef.current || !agent) return;
    const t = clock.getElapsedTime();
    const nowMs = Date.now();

    // ── Staggered fade-in (AC2) ────────────────────────────────
    const spawnTs = agent.spawnTs ?? 0;
    if (nowMs < spawnTs) {
      // Not yet time to appear — stay hidden
      groupRef.current.scale.setScalar(0);
      fadeRef.current = 0;
      return;
    }

    const elapsed = nowMs - spawnTs;
    if (elapsed < FADE_IN_DURATION_MS) {
      // Fade in with scale pop: ease-out-back style
      const progress = elapsed / FADE_IN_DURATION_MS;
      // Smooth step: 0 → 1
      const smooth = progress * progress * (3 - 2 * progress);
      // Slight overshoot pop: scale goes 0 → 1.08 → 1.0
      const scaleFactor = smooth < 0.8
        ? (smooth / 0.8) * 1.08
        : 1.08 - ((smooth - 0.8) / 0.2) * 0.08;
      fadeRef.current = smooth;
      groupRef.current.scale.setScalar(scaleFactor);

      // Show badge about halfway through the animation
      if (smooth >= 0.5 && !badgeVisible) {
        setBadgeVisible(true);
      }
    } else {
      // Fully appeared — set to 1 and normalize scale
      if (fadeRef.current < 1) {
        fadeRef.current = 1;
        if (!badgeVisible) setBadgeVisible(true);
      }
      // Reset scale to 1 (or status animation will override below)
      groupRef.current.scale.setScalar(1);
    }

    // ── Status-based animation (post-spawn) ───────────────────
    if (statusCfg.animate) {
      // Active: gentle breathing + slight sway
      const breathe = 1 + Math.sin(t * 2) * 0.03;
      groupRef.current.scale.set(breathe, breathe, breathe);
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
    } else if (agent.status === "inactive") {
      /**
       * Sub-AC 2b: Distinct INACTIVE idle pose.
       *
       * Three layered motions combine to create a "sleeping sentinel" look:
       *   1. Slow vertical bob  — very gentle rise/fall (Y: ±0.012 over ~7 s cycle)
       *      Conveys weight at rest rather than active floating
       *   2. Lean sway          — slight forward/back tilt (X: ±1.8°) at a different
       *      frequency so the two motions never perfectly cancel, giving organic feel
       *   3. Slow drift rotation — imperceptibly slow Y rotation (full cycle ~42 s)
       *      Makes the agent look vaguely "surveying" without active movement
       *
       * All amplitudes are purposefully smaller than active/busy motion so the
       * inactive state reads as "quiet" at a glance.
       */
      if (fadeRef.current >= 1) {
        // 1. Vertical bob (0.9 rad/s ≈ 7 s period)
        groupRef.current.position.y = agent.worldPosition.y + Math.sin(t * 0.9) * 0.012;
        // 2. Lean sway: forward/back tilt at slightly different frequency
        groupRef.current.rotation.x = Math.sin(t * 0.55) * 0.032;
        // 3. Very slow drift rotation
        groupRef.current.rotation.y = Math.sin(t * 0.15) * 0.12;
      }
    } else if (agent.status === "terminated") {
      // Terminated: no movement, slight slump (lean forward)
      if (fadeRef.current >= 1) {
        groupRef.current.rotation.x = 0.08; // fixed forward slump
      }
    }

    // Selection highlight: gentle rotation
    if (isSelected) {
      groupRef.current.rotation.y = Math.sin(t * 0.8) * 0.15;
    }
  });

  /**
   * Sub-AC 4c: Typed interaction handlers from the dedicated hook.
   *
   * useAgentInteractionHandlers() returns four strongly-typed callbacks:
   *   onPointerOver  — hover_enter intent + cursor + store hover flag
   *   onPointerOut   — hover_exit  intent + cursor restore + store hover flag
   *   onClick        — click intent + drill navigation (Sub-AC 3c)
   *   onContextMenu  — context_menu intent + opens agent context-menu portal
   *
   * All four handlers call event.stopPropagation() as their FIRST operation,
   * ensuring the R3F event does not bubble up to parent RoomVolume,
   * BuildingShell, or canvas-level pointer handlers.
   *
   * The previous hand-rolled handlePointerOver / handlePointerOut / handleClick
   * callbacks are replaced by these; the drill-into logic (drillIntoAgent,
   * drillAgent, isDrilled) is now encapsulated inside the hook.
   */
  const {
    onPointerOver: handlePointerOver,
    onPointerOut:  handlePointerOut,
    onClick:       handleClick,
    onContextMenu: handleContextMenu,
  } = useAgentInteractionHandlers(agentId);

  const drillAgent = useSpatialStore((s) => s.drillAgent);
  const isDrilled = drillAgent === agentId;

  if (!agent) return null;

  const { worldPosition } = agent;

  return (
    <group
      ref={groupRef}
      visible={viewWindowVisible}
      position={[worldPosition.x, worldPosition.y, worldPosition.z]}
      name={`agent-${agentId}`}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Body */}
      <AvatarBody
        color={color}
        emissive={emissive}
        opacity={statusCfg.opacity}
        emissiveIntensity={emissiveIntensity}
      />

      {/* Head */}
      <AvatarHead
        color={color}
        emissive={emissive}
        opacity={statusCfg.opacity}
        emissiveIntensity={emissiveIntensity}
      />

      {/* Foot ring glow */}
      <FootRing
        color={color}
        opacity={statusCfg.opacity}
        status={agent.status}
      />

      {/* Status indicator dot */}
      <StatusDot status={agent.status} color={color} />

      {/*
       * Sub-AC 8c: Command lifecycle status badges.
       * Shows color-coded low-poly octahedra above the agent for any in-flight
       * or recently-terminal commands targeting this agent.
       * Zero render cost when no commands are active.
       */}
      <CommandStatusBadge
        agentId={agentId}
        badgesVisible={showHtml && badgeInRange}
      />

      {/* Sub-AC 10c: Meeting orbit ring — shown when agent is a session participant */}
      {inMeeting && <MeetingOrbitRing color="#FFD700" />}

      {/*
       * Diegetic name badge — only shown after avatar spawns in (AC2).
       *
       * Sub-AC 15c: hidden when camera is beyond BADGE_CULL_DIST (badgeInRange=false)
       * or when quality='low' (showHtml=false).  The 3D mesh avatar remains fully
       * visible at all times; only the DOM Html overlay is culled.
       *
       * Override: always show badge when agent is selected or drilled — even if far.
       */}
      {badgeVisible && showHtml && (badgeInRange || isSelected || isDrilled) && (
        <AgentBadge agent={agent} fadeOpacity={1} meetingRole={meetingRole} />
      )}

      {/*
       * Sub-AC 7c: Metrics billboard — always-on live metrics overlay.
       * Floats above the name badge (Y ≈ 1.18). Shows CPU, MEM, QUEUE,
       * and HEALTH pulled from the control-plane API or metrics-store fallback.
       * Opacity varies: 0.25 for inactive, 0.45 ambient, 0.85 hovered, 1.0 drilled.
       *
       * Sub-AC 15c: tighter cull distance (METRICS_CULL_DIST) — metrics are
       * unreadable beyond ~12 units anyway. Override for drilled agent.
       */}
      {badgeVisible && showHtml && (metricsInRange || isDrilled) && (
        <AgentMetricsBillboard
          agentId={agentId}
          accentColor={color}
        />
      )}

      {/* Selection outline ring */}
      {isSelected && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[BODY_RADIUS * 1.5, BODY_RADIUS * 2.0, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/*
       * AC 7a: Lifecycle control panel — floats above the agent in 3D space.
       * Only renders when this agent is the active drill target.
       * Shows START / STOP / RESTART / PAUSE with inline confirmation dialog.
       */}
      {agent && isDrilled && (
        <AgentLifecyclePanel agent={agent} />
      )}

      {/*
       * Sub-AC 7b: Command dispatch terminal — in-world text input panel.
       * Floats above the lifecycle panel (Y = 3.9 vs lifecycle Y = 1.55).
       * Provides a terminal-style interface for sending commands/prompts
       * directly to the selected agent from 3D space.
       * Only renders when this agent is the active drill target.
       */}
      {agent && isDrilled && (
        <AgentCommandDispatch agent={agent} />
      )}
    </group>
  );
}

// ── Room Agents Group ──────────────────────────────────────────────

/**
 * Renders all agent avatars assigned to a specific room.
 */
export function RoomAgents({ roomId }: { roomId: string }) {
  const agentIds = useAgentStore((s) =>
    Object.values(s.agents)
      .filter((a) => a.roomId === roomId)
      .map((a) => a.def.agentId),
  );

  if (agentIds.length === 0) return null;

  return (
    <group name={`room-agents-${roomId}`}>
      {agentIds.map((id) => (
        <AgentAvatar key={id} agentId={id} />
      ))}
    </group>
  );
}

// ── All Agents Layer ───────────────────────────────────────────────

/**
 * Renders all agent avatars across all rooms.
 * This is the top-level component included in the scene.
 *
 * Sub-AC 15.2: view_window culling integration.
 *
 * Subscribes to the view-window-store's visibleIds (a frozen array reference
 * that only changes when the visible set content changes — NOT every frame).
 * Builds a Set for O(1) membership lookup and passes `viewWindowVisible` down
 * to each AgentAvatar.
 *
 * When the store has no snapshot yet (visibleIds is empty, i.e., the first few
 * frames before ViewWindowProvider has run), ALL agents are rendered (fallback
 * to render-all mode).  This prevents the scene from appearing empty during the
 * bootstrap period.
 *
 * The AgentAvatar sets `visible={viewWindowVisible}` on its root Three.js group,
 * so culled agents incur no GPU draw calls while their React components stay
 * mounted (no Three.js object disposal overhead on frustum transitions).
 */
export function AgentAvatarsLayer() {
  const agentIds = useAgentStore((s) => Object.keys(s.agents));

  // Subscribe to the full snapshot so we can check both entities.length
  // (to detect bootstrap vs. real-data state) AND visibleIds for filtering.
  // The snapshot reference changes only when setSnapshot() is called
  // (i.e., when the visible entity set actually changes), preventing
  // unnecessary re-renders on frames where nothing crosses a frustum boundary.
  const snapshot = useViewWindowStore((s) => s.snapshot);

  // hasSnapshot: true once the ViewWindowProvider has run at least one frame
  // and populated the snapshot with entity data.
  //
  // Using entities.length (not visibleIds.length) as the sentinel:
  //   - Before first frame: entities=[] → hasSnapshot=false → render all (bootstrap)
  //   - After first frame with all agents culled: entities=[20 entries], visibleIds=[]
  //     → hasSnapshot=true → render 0 agents (correct culling behaviour)
  const hasSnapshot = snapshot.entities.length > 0;

  // Build a Set for O(1) agent membership test.
  // Rebuilt only when the snapshot reference changes (visible set changes).
  const visibleSet = useMemo(
    () => new Set<string>(snapshot.visibleIds),
    [snapshot],
  );

  return (
    <group name="agent-avatars-layer">
      {agentIds.map((id) => (
        <AgentAvatar
          key={id}
          agentId={id}
          // Render all agents when view window has no data yet (bootstrap).
          // Once the view window snapshot contains entities, only render
          // agents whose ID appears in the visible set.
          viewWindowVisible={!hasSnapshot || visibleSet.has(id)}
        />
      ))}
    </group>
  );
}
