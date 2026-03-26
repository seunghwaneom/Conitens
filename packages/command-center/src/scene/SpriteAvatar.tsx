/**
 * SpriteAvatar — Pixel-art billboard sprite rendering for agent avatars.
 *
 * Renders an agent as an animated 2D sprite sheet inside the 3D scene.
 * Uses SpriteMaterial with UV offset animation driven by useSpriteAnimator.
 *
 * Key design decisions:
 *   - sprite.raycast = no-op → invisible cylinder collider handles all interaction
 *   - SpriteMaterial.opacity = STATUS_CONFIG[status].opacity × lodFadeFactor
 *   - Greyscale handled by STATUS_ANIMATION_MAP (selects greyscale-idle row)
 *   - Additive glow overlay for active/busy/error (emissiveMul >= 0.5)
 *   - Spawn-in animation plays on first mount, then transitions to status clip
 *   - LOD: FAR=dot, MID=static frame, NEAR=full animation
 *
 * Sits inside AgentAvatar's <group> → inherits position, scale fade-in, pointer events.
 */
import { useRef, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useSpriteAnimator } from "../hooks/use-sprite-animator.js";
import { AGENT_SPRITE_MAP } from "../data/agent-sprite-map.js";
import { STATUS_ANIMATION_MAP } from "../data/sprite-animation-types.js";
import { STATUS_CONFIG } from "./AgentAvatar.js";
import {
  SPRITE_LOD,
  SPRITE_LOD_DETAIL,
  getSpriteLodLevel,
  type SpriteLodVisibility,
} from "./lod-drill-policy.js";
import type { AgentRole, AgentStatus } from "../data/agents.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Vertical offset so sprite base aligns with FootRing at Y=0. */
export const SPRITE_Y_OFFSET = 0.25;

/** Invisible cylinder collider dimensions: [radiusTop, radiusBottom, height, segments]. */
export const SPRITE_COLLIDER_ARGS: [number, number, number, number] = [0.2, 0.2, 0.6, 6];

/** Sprite scale in world units. */
const SPRITE_SCALE: [number, number, number] = [0.5, 0.5, 1];

/** Radius for the FAR LOD dot. */
const FAR_DOT_RADIUS = 0.06;

/** No-op raycast function — disables sprite raycasting. */
const NOOP_RAYCAST = () => {};

/** Path to the shared radial gradient glow texture. */
const GLOW_TEXTURE_PATH = "/sprites/glow-radial.png";

/** Scale of the glow overlay sprite (slightly larger than the character). */
const GLOW_SCALE: [number, number, number] = [0.7, 0.7, 1];

/** Minimum emissiveMul threshold for showing the glow overlay. */
const GLOW_THRESHOLD = 0.5;

// ── Pure helpers (exported for testing) ───────────────────────────────────────

/** Whether the glow overlay should be rendered for a given emissiveMul value. */
export function shouldShowGlow(emissiveMul: number): boolean {
  return emissiveMul >= GLOW_THRESHOLD;
}

/** Compute glow overlay opacity from emissiveMul. Range: 0.0–0.4 (clamped). */
export function computeGlowOpacity(emissiveMul: number): number {
  if (emissiveMul < GLOW_THRESHOLD) return 0;
  return Math.min(0.4, (emissiveMul - GLOW_THRESHOLD) * 0.8);
}

// ── LOD fade helpers ──────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── Inner component (inside Suspense) ─────────────────────────────────────────

interface SpriteAvatarInnerProps {
  role: AgentRole;
  status: AgentStatus;
  roleColor: string;
}

function SpriteAvatarInner({ role, status, roleColor }: SpriteAvatarInnerProps) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  const colliderRef = useRef<THREE.Mesh>(null);
  const worldPosVec = useRef(new THREE.Vector3());
  const frozenOffset = useRef(new THREE.Vector2());
  const lodAnimateRef = useRef(true);

  // Spawn-in state — plays spawn-in clip on first mount, then transitions to status clip
  const isSpawning = useRef(true);

  // Resolve animation from status (or spawn-in on first mount)
  const entry = STATUS_ANIMATION_MAP[status] ?? STATUS_ANIMATION_MAP.idle;
  const config = AGENT_SPRITE_MAP[role];

  const activeAnimation = isSpawning.current ? "spawn-in" : entry.animation;
  const activeSpeed = isSpawning.current ? 1 : entry.speedMultiplier;

  // Drive sprite animation — speed is 0 when LOD suppresses animation
  const { texture, offset, repeat, finished } = useSpriteAnimator(
    config,
    activeAnimation,
    lodAnimateRef.current ? activeSpeed : 0,
  );

  // Transition from spawn-in to status animation when spawn clip finishes
  if (isSpawning.current && finished) {
    isSpawning.current = false;
  }

  // Glow overlay state
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive;
  const showGlow = shouldShowGlow(statusCfg.emissiveMul);
  const glowOpacity = computeGlowOpacity(statusCfg.emissiveMul);

  const camera = useThree((s) => s.camera);
  const statusOpacity = STATUS_CONFIG[status]?.opacity ?? STATUS_CONFIG.inactive.opacity;

  // Per-frame LOD computation and material updates
  useFrame(() => {
    if (!spriteRef.current) return;

    // Robust world position extraction
    spriteRef.current.getWorldPosition(worldPosVec.current);
    const dist = camera.position.distanceTo(worldPosVec.current);

    // LOD level
    const lodLevel = getSpriteLodLevel(dist);
    const detail: SpriteLodVisibility = SPRITE_LOD_DETAIL[lodLevel];

    // Track animate state for next useSpriteAnimator call
    lodAnimateRef.current = detail.animate;

    // Smooth fade factors at boundaries
    // MID→FAR transition: fade sprite out between 17.5 and 18.0
    const fadeMidFar = 1 - clamp01((dist - (SPRITE_LOD.far - 0.5)) / 0.5);

    // Final opacity = status base × LOD fade
    const finalOpacity = statusOpacity * (detail.showSprite ? fadeMidFar : 0);

    // Update sprite material
    const mat = spriteRef.current.material as THREE.SpriteMaterial;
    mat.opacity = finalOpacity;
    mat.visible = detail.showSprite;

    // Update UV offset — freeze at current frame when LOD suppresses animation
    if (mat.map) {
      if (detail.animate) {
        mat.map.offset.copy(offset);
        frozenOffset.current.copy(offset);
      } else {
        // MID: keep last frozen offset (static frame)
        mat.map.offset.copy(frozenOffset.current);
      }
      mat.map.repeat.copy(repeat);
    }

    // FAR dot visibility
    if (dotRef.current) {
      dotRef.current.visible = detail.showDot;
      const dotMat = dotRef.current.material as THREE.MeshBasicMaterial;
      dotMat.opacity = clamp01((dist - (SPRITE_LOD.far - 0.5)) / 0.5);
    }

    // Glow overlay — only visible at NEAR LOD when emissiveMul >= threshold
    if (glowRef.current) {
      const showGlowNow = showGlow && detail.animate; // only at NEAR
      glowRef.current.visible = showGlowNow;
      if (showGlowNow) {
        const glowMat = glowRef.current.material as THREE.SpriteMaterial;
        glowMat.opacity = glowOpacity * fadeMidFar;
      }
    }
  });

  // Load glow texture via drei (Suspense-compatible, cached across all agents)
  const glowTexture = useTexture(GLOW_TEXTURE_PATH) as THREE.Texture;

  return (
    <>
      {/* Glow overlay — additive blend, behind the character sprite */}
      {showGlow && (
        <sprite
          ref={glowRef}
          scale={GLOW_SCALE}
          position={[0, SPRITE_Y_OFFSET, -0.01]}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTexture}
            color={roleColor}
            blending={THREE.AdditiveBlending}
            transparent
            opacity={glowOpacity}
            depthWrite={false}
          />
        </sprite>
      )}

      {/* Animated sprite billboard */}
      <sprite
        ref={spriteRef}
        scale={SPRITE_SCALE}
        position={[0, SPRITE_Y_OFFSET, 0]}
        raycast={NOOP_RAYCAST}
      >
        <spriteMaterial
          map={texture}
          transparent
          opacity={statusOpacity}
          depthWrite={false}
        />
      </sprite>

      {/* FAR LOD dot — tiny role-colored sphere */}
      <mesh
        ref={dotRef}
        position={[0, SPRITE_Y_OFFSET, 0]}
        visible={false}
      >
        <sphereGeometry args={[FAR_DOT_RADIUS, 6, 4]} />
        <meshBasicMaterial
          color={roleColor}
          transparent
          opacity={0}
        />
      </mesh>

      {/* Invisible cylinder collider for click/hover interaction */}
      <mesh
        ref={colliderRef}
        position={[0, SPRITE_COLLIDER_ARGS[2] / 2, 0]}
        visible={false}
      >
        <cylinderGeometry args={SPRITE_COLLIDER_ARGS} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface SpriteAvatarProps {
  role: AgentRole;
  status: AgentStatus;
  roleColor: string;
}

/**
 * SpriteAvatar — Suspense-wrapped pixel-art billboard sprite for an agent.
 *
 * Renders inside AgentAvatar's <group>. The Suspense boundary shows nothing
 * while the sprite sheet texture loads (the parent group's FootRing is already visible).
 */
export function SpriteAvatar({ role, status, roleColor }: SpriteAvatarProps) {
  return (
    <Suspense fallback={null}>
      <SpriteAvatarInner role={role} status={status} roleColor={roleColor} />
    </Suspense>
  );
}
