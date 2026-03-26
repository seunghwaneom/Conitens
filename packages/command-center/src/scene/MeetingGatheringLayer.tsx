/**
 * MeetingGatheringLayer — Sub-AC 10a/10b: Spatial agent gathering visual feedback
 * and protocol stage indicators.
 *
 * Renders diegetic 3D visual feedback within the building when one or more
 * active meeting gatherings are in progress:
 *
 *   1. GatheringFloorRing
 *      An animated low-poly ring on the floor of the meeting room, pulsing
 *      outward to signal "agents are converging here."  Color: gold (#FFD700)
 *      matching the MeetingOrbitRing used on individual agent avatars so the
 *      spatial grouping reads at a glance.
 *
 *   2. GatheringRoomGlow
 *      A semi-transparent expanded box (slightly larger than the room volume)
 *      that pulses in opacity to mark the meeting room's boundary.
 *      Rendered at renderOrder 2 so it underlays room-volume labels.
 *
 *   3. GatheringConfirmationBadge
 *      A world-space HTML badge anchored at the room's center, slightly above
 *      ceiling level.  Shows:
 *        "⚑ MEETING IN PROGRESS · N AGENTS"
 *      Only appears once all agents are gathered (status === "gathered").
 *
 *      Sub-AC 10b: Badge now includes a protocol stage indicator showing the
 *      current meeting phase (CONVENE → DELIBERATE → RESOLVE → ADJOURN) with
 *      stage-specific color coding and a progress dot row.
 *
 *   4. GatheringParticipantRays
 *      For each gathered participant, a thin vertical beam rises from the
 *      agent's meeting-room position to confirm spatial membership.
 *      Height ≈ 0.8 units; color matches the participant's role color.
 *      Rendered only in high/medium quality to keep draw-call budget.
 *
 * Design principles:
 *   - Pure geometry (no external assets) — low-poly stylized aesthetic
 *   - All visual state is derived from agentStore.meetingGatherings +
 *     meetingStore.getActiveSessions() — no new state added here
 *   - Transparent when no meetings are active (zero render cost)
 *   - Guard: renders nothing when meetingGatherings map is empty
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useAgentStore, type MeetingGathering } from "../store/agent-store.js";
import { useMeetingStore } from "../store/meeting-store.js";
import type { MeetingStage } from "../store/meeting-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { usePerformanceQuality } from "./ScenePerformance.js";

// ── Sub-AC 10b: Protocol Stage Configuration ──────────────────────

/**
 * Visual configuration for each protocol stage.
 *
 * color:       Badge accent color for the stage label.
 * label:       Uppercase display string shown in the stage badge.
 * step:        1-based position in the four-stage lifecycle.
 * glowColor:   Room glow tint override — distinguishes stages diegetically.
 *
 * The stages form a linear lifecycle:
 *   convene(1) → deliberate(2) → resolve(3) → adjourn(4)
 *
 * Color ladder:
 *   convene    → cyan   (#00CCFF) — "gathering, starting"
 *   deliberate → gold   (#FFD700) — "active discussion"
 *   resolve    → amber  (#FF8800) — "reaching decision"
 *   adjourn    → coral  (#FF5555) — "ending / concluded"
 */
export interface MeetingStageConfig {
  label: string;
  color: string;
  glowColor: string;
  step: 1 | 2 | 3 | 4;
}

export const STAGE_CONFIG: Record<MeetingStage, MeetingStageConfig> = {
  convene:    { label: "CONVENE",    color: "#00CCFF", glowColor: "#00CCFF", step: 1 },
  deliberate: { label: "DELIBERATE", color: "#FFD700", glowColor: "#FFD700", step: 2 },
  resolve:    { label: "RESOLVE",    color: "#FF8800", glowColor: "#FF8800", step: 3 },
  adjourn:    { label: "ADJOURN",    color: "#FF5555", glowColor: "#FF5555", step: 4 },
};

/**
 * Returns the stage config for a given MeetingStage.
 * Falls back to "convene" config if stage is undefined/unknown.
 *
 * Exported for use in scene tests (pure function — no React deps).
 */
export function getMeetingStageConfig(stage?: MeetingStage): MeetingStageConfig {
  if (!stage || !(stage in STAGE_CONFIG)) return STAGE_CONFIG.convene;
  return STAGE_CONFIG[stage];
}

/**
 * Returns the set of progress dots for the stage indicator.
 * Active stage dot is filled; previous dots are also filled; future dots are empty.
 *
 * Exported for use in scene tests (pure function — no React deps).
 */
export function buildStageProgressDots(
  currentStep: 1 | 2 | 3 | 4,
): Array<{ filled: boolean; stage: MeetingStage }> {
  const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
  return stages.map((s, i) => ({
    stage: s,
    filled: i < currentStep,
  }));
}

/** Total number of protocol stages (used for progress display). */
export const MEETING_STAGE_COUNT = 4 as const;

// ── Constants ──────────────────────────────────────────────────────

/** Ring animation speed (radians per second for the outer pulse ring) */
const RING_PULSE_SPEED = 1.8;
/** Maximum opacity of the gathering glow box */
const GLOW_MAX_OPACITY = 0.12;
/** How far the glow extends beyond the room boundary (world units) */
const GLOW_MARGIN = 0.15;
/** Gold color matching MeetingOrbitRing in AgentAvatar.tsx */
const GATHERING_COLOR = "#FFD700";
/** Confirmation badge Y offset above room top (world units) */
const BADGE_Y_OFFSET = 0.6;

// ── GatheringFloorRing ──────────────────────────────────────────────

/**
 * Animated floor ring at the meeting room's center.
 *
 * Three concentric rings pulse outward at different phase offsets, creating
 * a "ripple" effect that reads as "activity here."
 */
function GatheringFloorRing({
  cx,
  cz,
  y,
}: {
  cx: number;
  cz: number;
  y: number;
}) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Three rings with staggered phases create an outward pulse wave
    const rings = [ring1Ref, ring2Ref, ring3Ref];
    rings.forEach((ref, i) => {
      if (!ref.current) return;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      const phase = (t * RING_PULSE_SPEED + i * 0.6) % (Math.PI * 2);
      mat.opacity = 0.08 + Math.sin(phase) * 0.18;
      // Subtle scale pulse
      const scale = 1 + Math.sin(phase) * 0.04;
      ref.current.scale.set(scale, scale, scale);
    });
  });

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: GATHERING_COLOR,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      }),
    [],
  );

  return (
    <group position={[cx, y + 0.02, cz]}>
      {/* Ring 1 — innermost */}
      <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.5, 0.8, 8]} />
      </mesh>
      {/* Ring 2 — middle */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} material={ringMat.clone()}>
        <ringGeometry args={[0.85, 1.1, 8]} />
      </mesh>
      {/* Ring 3 — outer */}
      <mesh ref={ring3Ref} rotation={[-Math.PI / 2, 0, 0]} material={ringMat.clone()}>
        <ringGeometry args={[1.15, 1.35, 8]} />
      </mesh>
    </group>
  );
}

// ── GatheringRoomGlow ───────────────────────────────────────────────

/**
 * Semi-transparent expanded bounding box that pulses around the meeting room.
 * Rendered as a wireframe-like overlay to avoid obscuring the room geometry.
 *
 * Sub-AC 10b: Accepts an optional stageGlowColor to tint the glow based on
 * the current protocol stage. Defaults to GATHERING_COLOR (gold) when no
 * stage color is provided (backward compatible).
 */
function GatheringRoomGlow({
  cx,
  cy,
  cz,
  w,
  h,
  d,
  stageGlowColor,
}: {
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  /** Sub-AC 10b: optional stage-specific glow color. Defaults to GATHERING_COLOR. */
  stageGlowColor?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const effectiveColor = stageGlowColor ?? GATHERING_COLOR;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    const t = clock.getElapsedTime();
    mat.opacity = GLOW_MAX_OPACITY * (0.6 + Math.sin(t * 1.4) * 0.4);
  });

  return (
    <mesh
      ref={meshRef}
      position={[cx, cy, cz]}
      renderOrder={2}
    >
      <boxGeometry
        args={[
          w + GLOW_MARGIN * 2,
          h + GLOW_MARGIN,
          d + GLOW_MARGIN * 2,
        ]}
      />
      <meshBasicMaterial
        color={effectiveColor}
        transparent
        opacity={GLOW_MAX_OPACITY}
        side={THREE.BackSide} // Back-face only to avoid z-fighting with room faces
        depthWrite={false}
      />
    </mesh>
  );
}

// ── GatheringParticipantRay ─────────────────────────────────────────

/**
 * Thin vertical beam at an agent's gathering position.
 * Confirms spatial membership: "this agent is gathered here."
 */
function GatheringParticipantRay({
  wx,
  wy,
  wz,
  color,
}: {
  wx: number;
  wy: number;
  wz: number;
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const RAY_HEIGHT = 0.8;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.2 + Math.sin(clock.getElapsedTime() * 2.5) * 0.15;
  });

  return (
    <mesh
      ref={meshRef}
      position={[wx, wy + RAY_HEIGHT / 2, wz]}
      renderOrder={3}
    >
      <cylinderGeometry args={[0.015, 0.005, RAY_HEIGHT, 4]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.3}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── GatheringConfirmationBadge ──────────────────────────────────────

/**
 * World-anchored HTML badge above the meeting room confirming gathering status.
 *
 * Sub-AC 10a: Shows "⚑ MEETING IN PROGRESS · N AGENTS"
 * Sub-AC 10b: Adds protocol stage indicator showing current phase
 *             (CONVENE / DELIBERATE / RESOLVE / ADJOURN) with color coding
 *             and a progress dot row.
 *
 * Appears only when status === "gathered" (not while gathering is in progress).
 */
function GatheringConfirmationBadge({
  cx,
  cz: _cz,
  roofY,
  participantCount,
  sessionTitle,
  meetingStage,
}: {
  cx: number;
  cz: number;
  roofY: number;
  participantCount: number;
  sessionTitle?: string;
  /** Sub-AC 10b: current protocol stage for the meeting. */
  meetingStage?: MeetingStage;
}) {
  const stageConfig = getMeetingStageConfig(meetingStage);
  const progressDots = buildStageProgressDots(stageConfig.step);

  return (
    <Html
      position={[cx, roofY + BADGE_Y_OFFSET, 0]}
      center
      distanceFactor={10}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
        }}
      >
        {/* Primary gathering confirmation badge */}
        <div
          style={{
            background: "rgba(10, 10, 20, 0.9)",
            border: "1px solid rgba(255, 215, 0, 0.6)",
            borderRadius: 4,
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            backdropFilter: "blur(4px)",
            boxShadow: "0 0 8px rgba(255, 215, 0, 0.3)",
          }}
        >
          <span
            style={{
              fontSize: "9px",
              color: "#FFD700",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: "0.1em",
              whiteSpace: "nowrap",
            }}
          >
            ⚑ MEETING IN PROGRESS
          </span>
          <span
            style={{
              fontSize: "8px",
              color: "#FFAA00",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            · {participantCount} AGENTS
          </span>
        </div>

        {/* Sub-AC 10b: Protocol stage indicator ─────────────────────── */}
        <div
          data-testid="protocol-stage-indicator"
          data-stage={meetingStage ?? "convene"}
          style={{
            background: "rgba(10, 10, 20, 0.88)",
            border: `1px solid ${stageConfig.color}88`,
            borderRadius: 4,
            padding: "3px 8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            backdropFilter: "blur(4px)",
            boxShadow: `0 0 6px ${stageConfig.color}44`,
            minWidth: 90,
          }}
        >
          {/* Stage label */}
          <span
            data-testid="stage-label"
            style={{
              fontSize: "8px",
              color: stageConfig.color,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            ◈ {stageConfig.label}
          </span>

          {/* Progress dots: one dot per stage; filled = completed/current */}
          <div
            data-testid="stage-progress-dots"
            style={{
              display: "flex",
              gap: 4,
              alignItems: "center",
            }}
          >
            {progressDots.map((dot, idx) => (
              <span
                key={dot.stage}
                data-testid={`stage-dot-${idx}`}
                data-filled={dot.filled}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: dot.filled ? stageConfig.color : "rgba(255,255,255,0.18)",
                  border: `1px solid ${dot.filled ? stageConfig.color : "rgba(255,255,255,0.3)"}`,
                  display: "inline-block",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>

          {/* Step counter e.g. "2 / 4" */}
          <span
            data-testid="stage-step-counter"
            style={{
              fontSize: "7px",
              color: `${stageConfig.color}99`,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
            }}
          >
            STAGE {stageConfig.step} / {MEETING_STAGE_COUNT}
          </span>
        </div>

        {/* Session title (if available) */}
        {sessionTitle && (
          <div
            style={{
              background: "rgba(10, 10, 20, 0.75)",
              border: "1px solid rgba(255, 215, 0, 0.25)",
              borderRadius: 3,
              padding: "2px 6px",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: "7px",
                color: "#998866",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
              }}
            >
              {sessionTitle}
            </span>
          </div>
        )}

        {/* Gathered confirmation marker */}
        <div
          style={{
            fontSize: "6px",
            color: "#00FF88",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          ✓ GATHERED
        </div>
      </div>
    </Html>
  );
}

// ── Single Gathering Renderer ───────────────────────────────────────

/**
 * Renders all visual elements for a single active meeting gathering.
 *
 * Sub-AC 10b: Reads meetingEntity from the meeting store to obtain the
 * current protocol stage, which is passed to GatheringConfirmationBadge
 * for the stage indicator display.
 */
function ActiveGathering({ gathering }: { gathering: MeetingGathering }) {
  const quality = usePerformanceQuality();

  // Look up the meeting room's world-space dimensions
  const room = useSpatialStore((s) =>
    s.building.rooms.find((r) => r.roomId === gathering.roomId),
  );

  // Get the session for title display
  const session = useMeetingStore((s) => s.getSession(gathering.meetingId));

  // Sub-AC 10b: Get the Meeting domain entity for protocol stage display
  const meetingEntity = useMeetingStore((s) => s.getMeetingEntity(gathering.meetingId));

  // Get gathered agents for participant ray rendering
  const gatheredAgents = useAgentStore((s) => {
    if (quality === "low") return []; // Skip rays at low quality
    return Object.keys(gathering.participantHomeRooms)
      .map((id) => s.agents[id])
      .filter((a) => a != null && a.roomId === gathering.roomId);
  });

  if (!room || gathering.status === "dispersed") return null;

  // World-space room center
  const cx = room.position.x + room.dimensions.x / 2;
  const cy = room.position.y + room.dimensions.y / 2;
  const cz = room.position.z + room.dimensions.z / 2;
  const roofY = room.position.y + room.dimensions.y;

  const participantCount = Object.keys(gathering.participantHomeRooms).length;

  // Sub-AC 10b: derive stage-specific glow color from the meeting entity
  const currentStage = meetingEntity?.stage;
  const stageConf = getMeetingStageConfig(currentStage);

  return (
    <group name={`gathering-${gathering.meetingId}`}>
      {/* Floor ring at the meeting room center */}
      <GatheringFloorRing cx={cx} cz={cz} y={room.position.y} />

      {/* Room glow boundary — Sub-AC 10b: tint shifts with protocol stage */}
      {quality !== "low" && (
        <GatheringRoomGlow
          cx={cx}
          cy={cy}
          cz={cz}
          w={room.dimensions.x}
          h={room.dimensions.y}
          d={room.dimensions.z}
          stageGlowColor={stageConf.glowColor}
        />
      )}

      {/* Participant confirmation rays (high/medium quality only) */}
      {quality !== "low" && gatheredAgents.map((agent) => (
        <GatheringParticipantRay
          key={agent.def.agentId}
          wx={agent.worldPosition.x}
          wy={agent.worldPosition.y}
          wz={agent.worldPosition.z}
          color={agent.def.visual?.color ?? "#FFD700"}
        />
      ))}

      {/* Gathering confirmation badge with protocol stage indicator (Sub-AC 10b) */}
      {gathering.status === "gathered" && (
        <GatheringConfirmationBadge
          cx={cx}
          cz={cz}
          roofY={roofY}
          participantCount={participantCount}
          sessionTitle={session?.shared_context?.topic ?? session?.title}
          meetingStage={currentStage}
        />
      )}
    </group>
  );
}

// ── MeetingGatheringLayer (exported) ───────────────────────────────

/**
 * MeetingGatheringLayer — root entry point for meeting gathering visualization.
 *
 * Renders an ActiveGathering for each entry in meetingGatherings that is NOT
 * yet dispersed.  The guard on the top-level (gatherings.length === 0) ensures
 * zero render cost when no meetings are active.
 *
 * Sub-AC 10a deliverables this component provides:
 *   - Agents visually gathered in meeting room (via agent-store position update)
 *   - Floor ring pulse confirming agents have converged
 *   - "MEETING IN PROGRESS · N AGENTS" confirmation badge
 *   - Room glow boundary marking the gathering space
 *   - Per-agent vertical rays confirming spatial membership
 *
 * All state is read from agentStore and meetingStore — no local state, no props.
 * Rendered in both hierarchy and legacy modes (independent of building scene graph).
 */
export function MeetingGatheringLayer() {
  const meetingGatherings = useAgentStore((s) => s.meetingGatherings);

  // Filter to only active gatherings (exclude dispersed)
  const activeGatherings = Object.values(meetingGatherings).filter(
    (g) => g.status !== "dispersed",
  );

  // Guard: nothing to render
  if (activeGatherings.length === 0) return null;

  return (
    <group name="meeting-gathering-layer">
      {activeGatherings.map((gathering) => (
        <ActiveGathering
          key={gathering.meetingId}
          gathering={gathering}
        />
      ))}
    </group>
  );
}
