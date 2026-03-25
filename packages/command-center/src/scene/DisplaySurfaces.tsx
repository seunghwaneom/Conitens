/**
 * DisplaySurfaces — Low-poly 3D in-world display surface objects.
 *
 * Three categories of diegetic display surface, each a placeable scene
 * object within the building hierarchy:
 *
 *  1. MonitorSurface    — desk/wall-mounted screen with bezel + stand
 *  2. WallPanelSurface  — large wall-mounted display panel with frame
 *  3. HologramStand     — floor pedestal projecting a holographic display
 *
 * Each surface exposes:
 *  - Low-poly Three.js geometry (flat-shaded for stylized command-center look)
 *  - Dark command-center materials with emissive screen faces
 *  - Anchor point (world position + rotation) for deterministic scene placement
 *
 * Display surfaces are placed from room furniture slots via the
 * FURNITURE_TO_DISPLAY_KIND registry and buildDisplaySurfaceDefs() helper.
 *
 * ── Anchor coordinate convention ──────────────────────────────────────────
 *   facing='north' → screen normal points south (−Z) → rotationY = π
 *   facing='south' → screen normal points north (+Z) → rotationY = 0
 *   facing='east'  → screen normal points west  (−X) → rotationY = π/2
 *   facing='west'  → screen normal points east  (+X) → rotationY = −π/2
 *   facing='up'    → floor-standing (hologram stand)  → rotationY = 0
 *
 * ── Geometry sizes (all in grid units, 1 unit ≈ 1 m) ─────────────────────
 *   Monitor     : bezel 1.0 × 0.65 × 0.04 · screen 0.88 × 0.54
 *   WallPanel   : frame 1.8 × 1.1 × 0.05  · screen 1.64 × 0.95
 *   HologramStand: base ⌀0.7 × 0.08 (8-sided) · column ⌀0.09 × 0.75
 *                  platform ⌀0.36 × 0.04   · ring torus r=0.28 · panel 0.4 × 0.52
 */

import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomDef, FurnitureSlot } from "../data/building.js";
import { useMetricsTexture, textureSizeForKind, KIOSK_TEX_W, KIOSK_TEX_H } from "../hooks/use-metrics-texture.js";
import { SURFACE_REFRESH_INTERVALS, DEFAULT_REFRESH_INTERVAL_MS } from "../data/data-source-config.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { DiegeticDetailPanel } from "./DiegeticDetailPanel.js";

// ── Material palette constants ────────────────────────────────────────────

const CLR_BEZEL     = "#1a1a2a";   // monitor/panel frame dark body
const CLR_STAND     = "#141420";   // monitor stand / pedestal
const CLR_BRACKET   = "#222233";   // wall bracket hardware
const CLR_SCAN_LINE = "#ffffff";   // scan-line strips (low opacity)

// ── Types ─────────────────────────────────────────────────────────────────

export type DisplaySurfaceKind = "monitor" | "wall-panel" | "hologram-stand" | "floor-kiosk";

/**
 * Facing direction — which direction the screen's front normal points.
 * The viewer must be on the *opposite* side to see the display.
 */
export type DisplayFacing = "north" | "south" | "east" | "west" | "up";

/** How the surface attaches to building geometry. */
export type DisplayMountType = "wall" | "desk" | "floor";

/**
 * Anchor point — everything needed to deterministically place a display
 * surface within the 3D building hierarchy.
 *
 * All coordinates are in world space (room.position already factored in).
 */
export interface DisplaySurfaceAnchor {
  /** World-space position of the surface's mount/origin point */
  worldPos: [number, number, number];
  /**
   * Y-axis rotation (radians) to orient the screen face toward the viewer.
   * Derived from `facing` via facingToRotationY().
   */
  rotationY: number;
  /** Which architectural surface this display is mounted on/near */
  facing: DisplayFacing;
  /** Attachment style — affects whether a stand/bracket is rendered */
  mountType: DisplayMountType;
}

/**
 * Complete display surface definition — geometry + placement + style.
 * Built from a RoomDef furniture slot via buildDisplaySurfaceDefs().
 */
export interface DisplaySurfaceDef {
  /** Unique scene identifier: "<roomId>/<slotIndex>/<furnitureType>" */
  id: string;
  /** Geometric/visual category */
  kind: DisplaySurfaceKind;
  /** Human-readable label from furniture slot type */
  label: string;
  /** Placement anchor in world space */
  anchor: DisplaySurfaceAnchor;
  /** Room accent color — applied to screen emissive tint */
  accentColor: string;
  /** Owning room identifier */
  roomId: string;
}

// ── Registry: furniture type → display surface kind ───────────────────────

/**
 * Maps furniture slot types (from building.ts) to the display surface
 * kind that should render them.  Only display-surface furniture is listed;
 * desks, shelves, etc. are handled elsewhere.
 */
export const FURNITURE_TO_DISPLAY_KIND: Readonly<Record<string, DisplaySurfaceKind>> = {
  // Wall panels (large mounted displays)
  "status-board":        "wall-panel",
  "timeline-wall":       "wall-panel",
  "wall-monitor-array":  "wall-panel",
  "task-board":          "wall-panel",
  "gate-status-board":   "wall-panel",

  // Monitors (desk or wall-mounted single screens)
  "diff-screen":            "monitor",
  "ui-preview-screen":      "monitor",
  "approval-terminal":      "monitor",
  "file-browser-terminal":  "monitor",
  "replay-terminal":        "monitor",

  // Holographic stands (floor pedestals with projections)
  "hologram-table":          "hologram-stand",
  "knowledge-graph-display": "hologram-stand",

  // Floor kiosks (Sub-AC 6a: freestanding terminal pedestals)
  "info-kiosk":     "floor-kiosk",
  "agent-terminal": "floor-kiosk",
  "status-kiosk":   "floor-kiosk",
} as const;

// ── Anchor utilities ──────────────────────────────────────────────────────

/** Convert a DisplayFacing to the Y-axis rotation that orients the screen face. */
function facingToRotationY(facing: DisplayFacing): number {
  switch (facing) {
    case "north": return Math.PI;        // screen looks south (−Z)
    case "south": return 0;              // screen looks north (+Z)
    case "east":  return Math.PI / 2;    // screen looks west  (−X)
    case "west":  return -Math.PI / 2;   // screen looks east  (+X)
    case "up":    return 0;              // floor-standing
  }
}

/**
 * Infer which direction a furniture slot faces from its normalised position
 * within the room.  Slots within 18% of a wall edge are treated as mounted
 * on that wall; otherwise the surface is floor-standing.
 */
function inferFacing(slot: FurnitureSlot, room: RoomDef): DisplayFacing {
  const rx = slot.position.x / room.dimensions.x;
  const rz = slot.position.z / room.dimensions.z;

  if (rz > 0.82) return "north";  // near north wall → faces into room (south)
  if (rz < 0.18) return "south";  // near south wall → faces into room (north)
  if (rx > 0.82) return "east";   // near east wall  → faces into room (west)
  if (rx < 0.18) return "west";   // near west wall  → faces into room (east)
  return "up";                    // centre of room  → floor-standing
}

/**
 * Decide mount type from facing and slot height.
 *  - facing='up' (floor-standing)                   → floor
 *  - height > 0.8 grid units and near a wall         → wall
 *  - height <= 0.8 grid units and near a wall/desk   → desk
 */
function inferMountType(slot: FurnitureSlot, facing: DisplayFacing): DisplayMountType {
  if (facing === "up") return "floor";
  return slot.position.y > 0.8 ? "wall" : "desk";
}

// ── Builder: RoomDef furniture → DisplaySurfaceDef[] ─────────────────────

/**
 * Convert a room's furniture slots into an array of DisplaySurfaceDef objects
 * ready to be rendered by DisplaySurfaceObject.
 *
 * Only slots whose type appears in FURNITURE_TO_DISPLAY_KIND are converted.
 * World positions are computed as room.position + slot.position.
 */
export function buildDisplaySurfaceDefs(room: RoomDef): DisplaySurfaceDef[] {
  const defs: DisplaySurfaceDef[] = [];

  room.furniture.forEach((slot, idx) => {
    const kind = FURNITURE_TO_DISPLAY_KIND[slot.type];
    if (!kind) return; // not a display surface furniture type

    const facing = inferFacing(slot, room);
    const mountType = inferMountType(slot, facing);
    const rotationY = facingToRotationY(facing);

    const worldPos: [number, number, number] = [
      room.position.x + slot.position.x,
      room.position.y + slot.position.y,
      room.position.z + slot.position.z,
    ];

    defs.push({
      id: `${room.roomId}/${idx}/${slot.type}`,
      kind,
      label: slot.type,
      anchor: { worldPos, rotationY, facing, mountType },
      accentColor: room.colorAccent,
      roomId: room.roomId,
    });
  });

  return defs;
}

// ── Shared material factory hooks ─────────────────────────────────────────

function useBezelMaterial() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CLR_BEZEL,
        roughness: 0.75,
        metalness: 0.35,
        flatShading: true,
      }),
    [],
  );
}

function useStandMaterial() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CLR_STAND,
        roughness: 0.85,
        metalness: 0.25,
        flatShading: true,
      }),
    [],
  );
}

function useBracketMaterial() {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CLR_BRACKET,
        roughness: 0.8,
        metalness: 0.4,
        flatShading: true,
      }),
    [],
  );
}

function useScreenMaterial(accentColor: string, emissiveIntensity = 0.55) {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentColor).multiplyScalar(0.12),
        emissive: accentColor,
        emissiveIntensity,
        roughness: 0.2,
        metalness: 0.05,
        flatShading: false,     // smooth for screen face
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor, emissiveIntensity],
  );
}

/**
 * Canvas-texture screen material — uses a live CanvasTexture for both
 * colour map and emissive map so metrics charts appear on the screen face.
 *
 * `toneMapped: false` keeps the chart colours faithful without ACES
 * compression pushing them towards grey.
 */
function useCanvasScreenMaterial(
  accentColor: string,
  texture: THREE.CanvasTexture,
  emissiveIntensity = 0.45,
) {
  // Rebuild material only when the texture reference itself changes
  // (stable across ticks because the texture object is memoised in the hook).
  return useMemo(() => {
    void accentColor; // keep dep for potential future use
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x080c14),   // very dark base so the texture shows clearly
      map: texture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texture,
      emissiveIntensity,
      roughness: 0.15,
      metalness: 0.02,
      flatShading: false,
      toneMapped: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, emissiveIntensity]);
}

/**
 * Canvas-texture hologram material — transparent with a canvas-texture
 * overlay so hologram panels display live metrics charts.
 */
function useCanvasHologramMaterial(
  texture: THREE.CanvasTexture,
  opacity = 0.78,
) {
  return useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff),
      map: texture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texture,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      flatShading: false,
      toneMapped: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, opacity]);
}

function useHologramMaterial(accentColor: string, opacity = 0.45) {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        flatShading: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor, opacity],
  );
}

// ── ActiveIndicatorLine ───────────────────────────────────────────────────

/**
 * Thin animated border line that appears around a display surface when it is
 * the active (focused) surface.  Pulsing opacity communicates selection state
 * without covering the screen content.
 *
 * @param width  – surface bezel/frame width
 * @param height – surface bezel/frame height
 * @param depth  – surface bezel/frame depth (used to offset z so line is in front)
 * @param color  – accent color of the surface's room
 */
function ActiveIndicatorLine({
  width,
  height,
  depth,
  color,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
}) {
  const lineRef = useRef<THREE.Line>(null);

  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const t     = clock.getElapsedTime();
    const pulse = 0.45 + Math.sin(t * 3.2) * 0.30;
    (lineRef.current.material as THREE.LineBasicMaterial).opacity = pulse;
  });

  const hw = width  / 2 + 0.020;
  const hh = height / 2 + 0.020;
  const z  = depth  / 2 + 0.010;

  const points = useMemo(
    () => [
      new THREE.Vector3(-hw, -hh, z),
      new THREE.Vector3( hw, -hh, z),
      new THREE.Vector3( hw,  hh, z),
      new THREE.Vector3(-hw,  hh, z),
      new THREE.Vector3(-hw, -hh, z), // close the loop manually (lineLoop equivalent)
    ],
    [hw, hh, z],
  );

  const geometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(points),
    [points],
  );

  return (
    // @ts-expect-error — r3f lineSegments, ref type is compatible at runtime
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.7}
      />
    </line>
  );
}

// ── MonitorSurface ────────────────────────────────────────────────────────

/**
 * MonitorSurface — low-poly desktop / wall-mounted screen.
 *
 * Geometry (all relative to screen-face centre, which sits at the anchor):
 *   bezel   : box  1.00 × 0.65 × 0.040 — dark metallic frame
 *   screen  : plane 0.88 × 0.54         — emissive accent-tinted face
 *   glare   : plane 0.22 × 0.14 (corner) — faint bright specular highlight
 *   neck    : box  0.040 × 0.26 × 0.040  — only for desk/wall-desk mount
 *   base    : box  0.32 × 0.030 × 0.16   — only for desk mount
 *
 * Anchor (worldPos) should point to the screen-centre in world space.
 */
function MonitorSurface({ def }: { def: DisplaySurfaceDef }) {
  const { anchor, accentColor } = def;
  const [wx, wy, wz] = anchor.worldPos;

  const bezelMat = useBezelMaterial();
  const standMat = useStandMaterial();

  // ── Canvas texture for the screen face ──
  // Each monitor type uses its configured per-surface refresh interval
  const [texW, texH] = textureSizeForKind("monitor");
  const refreshMs = SURFACE_REFRESH_INTERVALS[def.label] ?? DEFAULT_REFRESH_INTERVAL_MS;
  const canvasTex  = useMetricsTexture(def.label, accentColor, texW, texH, refreshMs);
  const screenMat  = useCanvasScreenMaterial(accentColor, canvasTex, 0.45);

  // Faint corner-highlight (glare streak) — low-opacity bright box
  const glareMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.06,
      }),
    [],
  );

  const showStand = anchor.mountType === "desk";   // desk mount has stand
  const showWallBracket = anchor.mountType === "wall"; // wall mount has bracket arms

  // Bezel dimensions
  const BW = 1.00, BH = 0.65, BD = 0.040;
  // Screen inset
  const SW = 0.88, SH = 0.54;
  // Stand dims
  const NECK_H = 0.26, NECK_W = 0.040;
  const BASE_W = 0.32, BASE_H = 0.030, BASE_D = 0.16;

  // ── In-world interaction ────────────────────────────────────────────
  const activeSurfaceId = useSpatialStore((s) => s.activeSurfaceId);
  const setActiveSurface = useSpatialStore((s) => s.setActiveSurface);
  const isActive = activeSurfaceId === def.id;

  // Hover ref — avoids re-renders on pointer move; only useFrame reads it
  const hoverRef     = useRef(false);
  const screenMeshRef = useRef<THREE.Mesh>(null);

  // Smooth hover/active glow — lerp emissiveIntensity each frame
  const BASE_EMISSIVE = 0.45;
  useFrame(() => {
    if (!screenMeshRef.current) return;
    const mat    = screenMeshRef.current.material as THREE.MeshStandardMaterial;
    const target = isActive ? 0.78 : hoverRef.current ? 0.62 : BASE_EMISSIVE;
    mat.emissiveIntensity += (target - mat.emissiveIntensity) * 0.14;
  });

  return (
    <group position={[wx, wy, wz]} rotation={[0, anchor.rotationY, 0]} name={`display-monitor-${def.id}`}>
      {/* ── Bezel frame ── */}
      <mesh material={bezelMat} castShadow receiveShadow>
        <boxGeometry args={[BW, BH, BD]} />
      </mesh>

      {/* ── Screen face — interactive + emissive ── */}
      <mesh
        ref={screenMeshRef}
        position={[0, 0, BD / 2 + 0.002]}
        material={screenMat}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverRef.current = false;
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveSurface(isActive ? null : def.id, def.roomId);
        }}
      >
        <planeGeometry args={[SW, SH]} />
      </mesh>

      {/* ── Glare highlight — top-left corner strip ── */}
      <mesh
        position={[-SW / 2 + 0.11, SH / 2 - 0.07, BD / 2 + 0.003]}
        rotation={[0, 0, Math.PI / 5]}
        material={glareMat}
      >
        <planeGeometry args={[0.22, 0.045]} />
      </mesh>

      {/* ── Scan-line strips (2 thin horizontal lines across screen) ── */}
      <ScanLines width={SW} height={SH} zOffset={BD / 2 + 0.004} count={3} />

      {/* ── Active selection indicator — pulsing border ── */}
      {isActive && (
        <ActiveIndicatorLine width={BW} height={BH} depth={BD} color={accentColor} />
      )}

      {/* ── Desk stand: neck + base ── */}
      {showStand && (
        <group>
          {/* Neck */}
          <mesh
            position={[0, -BH / 2 - NECK_H / 2, -BD / 4]}
            material={standMat}
          >
            <boxGeometry args={[NECK_W, NECK_H, NECK_W]} />
          </mesh>
          {/* Base */}
          <mesh
            position={[0, -BH / 2 - NECK_H - BASE_H / 2, -BD / 4]}
            material={standMat}
          >
            <boxGeometry args={[BASE_W, BASE_H, BASE_D]} />
          </mesh>
        </group>
      )}

      {/* ── Wall bracket: two horizontal arms behind bezel ── */}
      {showWallBracket && (
        <WallBracket width={BW} depth={0.08} material={standMat} />
      )}

      {/* ── In-world detail panel — visible when surface is active ── */}
      {isActive && <DiegeticDetailPanel def={def} />}
    </group>
  );
}

// ── WallPanelSurface ──────────────────────────────────────────────────────

/**
 * WallPanelSurface — large wall-mounted display panel.
 *
 * Geometry (relative to panel-face centre at anchor):
 *   frame    : box  1.80 × 1.10 × 0.050 — dark metallic outer frame
 *   screen   : plane 1.64 × 0.95         — emissive accent-tinted display
 *   scanLines: 5 thin horizontal planes   — subtle HUD scan-line effect
 *   topBar   : box  1.64 × 0.030 × 0.010 — accent-coloured top border
 *   mounts   : 2× box  0.06 × 0.20 × 0.06 — bracket hardware at top/bottom
 */
function WallPanelSurface({ def }: { def: DisplaySurfaceDef }) {
  const { anchor, accentColor } = def;
  const [wx, wy, wz] = anchor.worldPos;

  const bezelMat   = useBezelMaterial();
  const bracketMat = useBracketMaterial();

  // ── Canvas texture for the screen face ──
  // Wall panels use their configured per-surface refresh interval
  const [texW, texH] = textureSizeForKind("wall-panel");
  const refreshMs = SURFACE_REFRESH_INTERVALS[def.label] ?? DEFAULT_REFRESH_INTERVAL_MS;
  const canvasTex  = useMetricsTexture(def.label, accentColor, texW, texH, refreshMs);
  const screenMat  = useCanvasScreenMaterial(accentColor, canvasTex, 0.42);

  const topBarMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.3,
        flatShading: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  const FW = 1.80, FH = 1.10, FD = 0.050;
  const SW = 1.64, SH = 0.95;
  const MNT_W = 0.06, MNT_H = 0.20, MNT_D = 0.06;

  // ── In-world interaction ────────────────────────────────────────────
  const activeSurfaceId  = useSpatialStore((s) => s.activeSurfaceId);
  const setActiveSurface = useSpatialStore((s) => s.setActiveSurface);
  const isActive         = activeSurfaceId === def.id;

  const hoverRef      = useRef(false);
  const screenMeshRef = useRef<THREE.Mesh>(null);

  const BASE_EMISSIVE = 0.42;
  useFrame(() => {
    if (!screenMeshRef.current) return;
    const mat    = screenMeshRef.current.material as THREE.MeshStandardMaterial;
    const target = isActive ? 0.78 : hoverRef.current ? 0.62 : BASE_EMISSIVE;
    mat.emissiveIntensity += (target - mat.emissiveIntensity) * 0.14;
  });

  return (
    <group position={[wx, wy, wz]} rotation={[0, anchor.rotationY, 0]} name={`display-wallpanel-${def.id}`}>
      {/* ── Outer frame ── */}
      <mesh material={bezelMat} castShadow receiveShadow>
        <boxGeometry args={[FW, FH, FD]} />
      </mesh>

      {/* ── Screen face — interactive ── */}
      <mesh
        ref={screenMeshRef}
        position={[0, 0, FD / 2 + 0.002]}
        material={screenMat}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverRef.current = false;
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveSurface(isActive ? null : def.id, def.roomId);
        }}
      >
        <planeGeometry args={[SW, SH]} />
      </mesh>

      {/* ── Scan lines ── */}
      <ScanLines width={SW} height={SH} zOffset={FD / 2 + 0.004} count={5} />

      {/* ── Top accent bar ── */}
      <mesh position={[0, FH / 2 - 0.020, FD / 2 + 0.003]} material={topBarMat}>
        <boxGeometry args={[SW, 0.025, 0.008]} />
      </mesh>

      {/* ── Mounting brackets (top & bottom) ── */}
      <mesh position={[-FW / 2 + MNT_W / 2 + 0.06, FH / 2 - MNT_H / 2, -FD / 2 - MNT_D / 2]} material={bracketMat} castShadow>
        <boxGeometry args={[MNT_W, MNT_H, MNT_D]} />
      </mesh>
      <mesh position={[FW / 2 - MNT_W / 2 - 0.06, FH / 2 - MNT_H / 2, -FD / 2 - MNT_D / 2]} material={bracketMat} castShadow>
        <boxGeometry args={[MNT_W, MNT_H, MNT_D]} />
      </mesh>

      {/* ── Active selection indicator ── */}
      {isActive && (
        <ActiveIndicatorLine width={FW} height={FH} depth={FD} color={accentColor} />
      )}

      {/* ── In-world detail panel ── */}
      {isActive && <DiegeticDetailPanel def={def} />}
    </group>
  );
}

// ── HologramStand ─────────────────────────────────────────────────────────

/**
 * HologramStandSurface — floor-standing pedestal with holographic projection.
 *
 * Geometry (Y-up, relative to floor base centre at anchor):
 *   base     : cylinder r=0.35/0.28 h=0.08 8-seg  — wide octagonal footprint
 *   column   : cylinder r=0.045     h=0.75 6-seg   — narrow low-poly pillar
 *   platform : cylinder r=0.20/0.18 h=0.040 8-seg  — top cap
 *   ring     : torus r=0.28 tube=0.018 4×14-seg    — rotating outer ring
 *   innerRing: torus r=0.18 tube=0.012 4×10-seg    — counter-rotating inner ring
 *   panel    : plane 0.42 × 0.54                   — pulsing holographic face
 *   glow     : plane 0.42 × 0.54 (larger, very faint) — bloom spread
 *
 * Animations (via useFrame):
 *   ring    : Y-rotation at +0.35 rad/s
 *   innerRing: Y-rotation at −0.55 rad/s
 *   panel   : opacity pulsing 0.30–0.55 at ~0.8 Hz
 *   glow    : opacity pulsing inverse to panel
 */
function HologramStandSurface({ def }: { def: DisplaySurfaceDef }) {
  const { anchor, accentColor } = def;
  const [wx, wy, wz] = anchor.worldPos;

  const ringRef      = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const panelRef     = useRef<THREE.Mesh>(null);
  const glowRef      = useRef<THREE.Mesh>(null);

  const standMat     = useStandMaterial();
  const screenMat    = useScreenMaterial(accentColor, 0.65);
  const ringMat      = useHologramMaterial(accentColor, 0.70);
  const innerRingMat = useHologramMaterial(accentColor, 0.50);

  // ── Canvas texture for the hologram panel face ──
  // Hologram stands use their configured per-surface refresh interval (fastest)
  const [texW, texH] = textureSizeForKind("hologram-stand");
  const refreshMs    = SURFACE_REFRESH_INTERVALS[def.label] ?? DEFAULT_REFRESH_INTERVAL_MS;
  const canvasTex    = useMetricsTexture(def.label, accentColor, texW, texH, refreshMs);
  const panelMat     = useCanvasHologramMaterial(canvasTex, 0.72);

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  // Platform cap top accent
  const capMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.5,
        flatShading: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  // ── In-world interaction ────────────────────────────────────────────
  const activeSurfaceId  = useSpatialStore((s) => s.activeSurfaceId);
  const setActiveSurface = useSpatialStore((s) => s.setActiveSurface);
  const isActive         = activeSurfaceId === def.id;

  const hoverRef = useRef(false);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.35;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.y = -t * 0.55;
    }
    if (panelRef.current) {
      const baseOpacity = isActive ? 0.72 : hoverRef.current ? 0.65 : 0.35;
      const pulse = baseOpacity + Math.sin(t * 0.8 * Math.PI * 2) * 0.12;
      const baseEmissive = isActive ? 0.65 : hoverRef.current ? 0.55 : 0.38;
      const emPulse = baseEmissive + Math.sin(t * 0.8 * Math.PI * 2) * 0.14;
      (panelRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emPulse;
      (panelRef.current.material as THREE.MeshStandardMaterial).opacity = pulse;
    }
    if (glowRef.current) {
      const baseGlow = isActive ? 0.18 : hoverRef.current ? 0.12 : 0.06;
      const glow = baseGlow + Math.cos(t * 0.8 * Math.PI * 2) * 0.03;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = glow;
    }
  });

  // The anchor.worldPos is at floor level (y = room.position.y + slot.position.y)
  // We stack components upward from there
  const BASE_H    = 0.08;
  const COL_H     = 0.75;
  const PLATFORM_H= 0.040;
  const HOLO_Y    = BASE_H + COL_H + PLATFORM_H + 0.26; // hologram hovers above platform

  return (
    <group position={[wx, wy, wz]} name={`display-holostand-${def.id}`}>
      {/* ── Octagonal base disc ── */}
      <mesh position={[0, BASE_H / 2, 0]} material={standMat} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.35, BASE_H, 8]} />
      </mesh>

      {/* ── Hexagonal column ── */}
      <mesh position={[0, BASE_H + COL_H / 2, 0]} material={standMat} castShadow>
        <cylinderGeometry args={[0.045, 0.055, COL_H, 6]} />
      </mesh>

      {/* ── Top platform cap ── */}
      <mesh position={[0, BASE_H + COL_H + PLATFORM_H / 2, 0]} material={standMat} castShadow>
        <cylinderGeometry args={[0.18, 0.20, PLATFORM_H, 8]} />
      </mesh>
      {/* Accent ring on top of platform */}
      <mesh position={[0, BASE_H + COL_H + PLATFORM_H + 0.003, 0]} material={capMat}>
        <cylinderGeometry args={[0.18, 0.18, 0.006, 8]} />
      </mesh>

      {/* ── Outer hologram ring (rotates) ── */}
      <mesh ref={ringRef} position={[0, HOLO_Y, 0]} material={ringMat}>
        {/* torusGeometry: radius, tube, radialSegments, tubularSegments */}
        <torusGeometry args={[0.28, 0.018, 4, 14]} />
      </mesh>

      {/* ── Inner counter-rotating ring ── */}
      <mesh ref={innerRingRef} position={[0, HOLO_Y, 0]} material={innerRingMat}>
        <torusGeometry args={[0.17, 0.012, 4, 10]} />
      </mesh>

      {/* ── Holographic panel (pulsing, interactive) ── */}
      <mesh
        ref={panelRef}
        position={[0, HOLO_Y, 0]}
        material={panelMat}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverRef.current = false;
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveSurface(isActive ? null : def.id, def.roomId);
        }}
      >
        <planeGeometry args={[0.42, 0.52]} />
      </mesh>

      {/* ── Bloom glow spread behind panel ── */}
      <mesh ref={glowRef} position={[0, HOLO_Y, -0.01]} material={glowMat}>
        <planeGeometry args={[0.60, 0.72]} />
      </mesh>

      {/* ── Vertical energy beam from platform to ring ── */}
      <EnergyBeam
        fromY={BASE_H + COL_H + PLATFORM_H}
        toY={HOLO_Y}
        accentColor={accentColor}
      />

      {/* ── In-world detail panel ── */}
      {isActive && <DiegeticDetailPanel def={def} />}
    </group>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────

/**
 * ScanLines — thin horizontal line strips overlaid on a screen surface.
 * Evenly distributed across the screen height. Rendered as flat planes
 * with very low opacity for a retro CRT / command-console aesthetic.
 */
function ScanLines({
  width,
  height,
  zOffset,
  count = 4,
}: {
  width: number;
  height: number;
  zOffset: number;
  count?: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: CLR_SCAN_LINE,
        transparent: true,
        opacity: 0.035,
      }),
    [],
  );

  const lines = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      arr.push(t * height);
    }
    return arr;
  }, [count, height]);

  return (
    <>
      {lines.map((y, i) => (
        <mesh key={i} position={[0, y, zOffset]} material={mat}>
          <planeGeometry args={[width, height / (count * 2.5)]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * WallBracket — two short horizontal arms behind a wall-mounted screen.
 * Provides visual cue that the surface is bolted to the wall.
 */
function WallBracket({
  width,
  depth,
  material,
}: {
  width: number;
  depth: number;
  material: THREE.MeshStandardMaterial;
}) {
  const ARM_W = 0.05, ARM_H = 0.06;
  const spread = width * 0.3; // ±30% from centre

  return (
    <group>
      <mesh position={[-spread, 0, -depth / 2]} material={material}>
        <boxGeometry args={[ARM_W, ARM_H, depth]} />
      </mesh>
      <mesh position={[spread, 0, -depth / 2]} material={material}>
        <boxGeometry args={[ARM_W, ARM_H, depth]} />
      </mesh>
    </group>
  );
}

/**
 * EnergyBeam — vertical translucent cylinder representing the hologram
 * energy feed from the pedestal platform up to the projection ring.
 */
function EnergyBeam({
  fromY,
  toY,
  accentColor,
}: {
  fromY: number;
  toY: number;
  accentColor: string;
}) {
  const beamRef = useRef<THREE.Mesh>(null);
  const height = toY - fromY;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  useFrame(({ clock }) => {
    if (beamRef.current) {
      const pulse = 0.08 + Math.sin(clock.getElapsedTime() * 1.5) * 0.04;
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  return (
    <mesh ref={beamRef} position={[0, fromY + height / 2, 0]} material={mat}>
      <cylinderGeometry args={[0.03, 0.03, height, 6, 1, true]} />
    </mesh>
  );
}

// ── FloorKioskSurface ─────────────────────────────────────────────────────

/**
 * FloorKioskSurface — low-poly freestanding information / control terminal.
 *
 * Physical anatomy (Y-up, relative to floor-level base centre at anchor):
 *
 *   base     : CylinderGeometry r=0.28/0.32 h=0.04 8-seg  — wide octagonal
 *              footprint, non-slip floor contact zone.
 *   pedestal : CylinderGeometry r=0.095/0.11 h=0.48 6-seg — hexagonal
 *              low-poly column.
 *   housing  : BoxGeometry 0.46 × 0.58 × 0.20              — upper body block
 *              housing the screen electronics.
 *   side fins: BoxGeometry 0.036 × 0.58 × 0.22 (×2)        — left + right
 *              structural fins; right fin hosts status LEDs.
 *   top cap  : BoxGeometry 0.50 × 0.028 × 0.22              — flat lid with
 *              accent edge strip.
 *   bezel    : BoxGeometry 0.40 × 0.28 × 0.030              — screen frame;
 *              slightly tilted backward for ergonomic viewing angle.
 *   screen   : PlaneGeometry 0.34 × 0.22                    — emissive canvas-
 *              texture face carrying live metric charts.
 *   keyboard : BoxGeometry 0.28 × 0.018 × 0.14              — input ledge
 *              protruding below the screen.
 *   LED strip: 3 × BoxGeometry 0.010 × 0.010 × 0.010        — status indicators
 *              on the right fin (green / amber / red).
 *
 * ── Screen coordinates (local space, facing +Z toward viewer) ────────────
 *   housing top-face Y ≈ 1.10  (0.04 base + 0.48 pedestal + 0.58 housing)
 *   screen centre Y  ≈ 0.92   (upper two-thirds of housing)
 *   keyboard Y       ≈ 0.68   (lower quarter of housing)
 *
 * ── Interactivity ────────────────────────────────────────────────────────
 *   Hover  → screen emissive intensity lerps from 0.48 → 0.65
 *   Click  → setActiveSurface (spatial-store)
 *   Active → ActiveIndicatorLine pulsing border + DiegeticDetailPanel
 */
const FloorKioskSurface = memo(function FloorKioskSurface({
  def,
}: {
  def: DisplaySurfaceDef;
}) {
  const { anchor, accentColor } = def;
  const [wx, wy, wz] = anchor.worldPos;

  const standMat   = useStandMaterial();
  const bezelMat   = useBezelMaterial();
  const bracketMat = useBracketMaterial();

  // ── Canvas texture for the screen face ──────────────────────────────────
  void KIOSK_TEX_W; void KIOSK_TEX_H; // imported constants validated at module level
  const [texW, texH] = textureSizeForKind("floor-kiosk");
  const refreshMs    = SURFACE_REFRESH_INTERVALS[def.label] ?? DEFAULT_REFRESH_INTERVAL_MS;
  const canvasTex    = useMetricsTexture(def.label, accentColor, texW, texH, refreshMs);
  const screenMat    = useCanvasScreenMaterial(accentColor, canvasTex, 0.48);

  // Top-cap accent material
  const capAccentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color:             accentColor,
        emissive:          accentColor,
        emissiveIntensity: 0.45,
        roughness:         0.5,
        metalness:         0.4,
        flatShading:       true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  // LED status indicator materials — green / amber / red
  const ledMats = useMemo(
    () => [
      new THREE.MeshBasicMaterial({ color: "#00ff88" }),   // green  — ok
      new THREE.MeshBasicMaterial({ color: "#ffcc00" }),   // amber  — warn
      new THREE.MeshBasicMaterial({ color: "#ff4455" }),   // red    — error
    ],
    [],
  );

  // ── In-world interaction ─────────────────────────────────────────────────
  const activeSurfaceId  = useSpatialStore((s) => s.activeSurfaceId);
  const setActiveSurface = useSpatialStore((s) => s.setActiveSurface);
  const isActive         = activeSurfaceId === def.id;

  const hoverRef      = useRef(false);
  const screenMeshRef = useRef<THREE.Mesh>(null);

  // Lerp screen emissive intensity toward hover/active target each frame
  const BASE_EMISSIVE = 0.48;
  useFrame(() => {
    if (!screenMeshRef.current) return;
    const mat    = screenMeshRef.current.material as THREE.MeshStandardMaterial;
    const target = isActive ? 0.80 : hoverRef.current ? 0.65 : BASE_EMISSIVE;
    mat.emissiveIntensity += (target - mat.emissiveIntensity) * 0.14;
  });

  // Geometry dimensions
  const BASE_H     = 0.04;
  const PED_H      = 0.48;
  const HOUS_H     = 0.58;
  const HOUS_W     = 0.46;
  const HOUS_D     = 0.20;
  const HOUS_BASE  = BASE_H + PED_H;                  // 0.52 — housing starts here
  const HOUS_CY    = HOUS_BASE + HOUS_H / 2;          // 0.81 — housing centre Y

  // Screen tilt and position (slight ergonomic backward tilt ~10°)
  const SCREEN_TILT = -0.18; // rad — backward tilt, top away from viewer
  const SCREEN_CY   = HOUS_BASE + HOUS_H * 0.68;     // upper 2/3 of housing
  const SCREEN_FZ   = HOUS_D / 2 + 0.032;            // in front of housing body

  const BZ_W = 0.40, BZ_H = 0.28, BZ_D = 0.030;     // bezel dims
  const SC_W = 0.34, SC_H = 0.22;                    // screen dims
  const KB_Y = HOUS_BASE + HOUS_H * 0.24;            // keyboard Y
  const KB_Z = HOUS_D / 2 + 0.072;                   // keyboard protrusion

  // Top cap Y (one step above housing top)
  const CAP_Y   = HOUS_BASE + HOUS_H + 0.014;

  // Status LEDs: stacked vertically on the right fin
  const LED_X  =  HOUS_W / 2 + 0.036 + 0.012;     // just outside right fin
  const LED_ZF = HOUS_D / 2 - 0.010;               // near front face
  const LED_Y_TOP = HOUS_BASE + HOUS_H * 0.90;
  const LED_Y_MID = HOUS_BASE + HOUS_H * 0.80;
  const LED_Y_BOT = HOUS_BASE + HOUS_H * 0.70;

  return (
    <group
      position={[wx, wy, wz]}
      rotation={[0, anchor.rotationY, 0]}
      name={`display-kiosk-${def.id}`}
    >
      {/* ── Octagonal base disc ── */}
      <mesh position={[0, BASE_H / 2, 0]} material={standMat} receiveShadow castShadow>
        <cylinderGeometry args={[0.28, 0.32, BASE_H, 8]} />
      </mesh>

      {/* ── Hexagonal pedestal column ── */}
      <mesh position={[0, BASE_H + PED_H / 2, 0]} material={standMat} castShadow>
        <cylinderGeometry args={[0.095, 0.11, PED_H, 6]} />
      </mesh>

      {/* ── Upper housing body ── */}
      <mesh position={[0, HOUS_CY, 0]} material={bezelMat} castShadow receiveShadow>
        <boxGeometry args={[HOUS_W, HOUS_H, HOUS_D]} />
      </mesh>

      {/* ── Left fin ── */}
      <mesh
        position={[-(HOUS_W / 2 + 0.018), HOUS_CY, 0]}
        material={bracketMat}
        castShadow
      >
        <boxGeometry args={[0.036, HOUS_H, HOUS_D + 0.02]} />
      </mesh>

      {/* ── Right fin ── */}
      <mesh
        position={[HOUS_W / 2 + 0.018, HOUS_CY, 0]}
        material={bracketMat}
        castShadow
      >
        <boxGeometry args={[0.036, HOUS_H, HOUS_D + 0.02]} />
      </mesh>

      {/* ── Top cap ── */}
      <mesh position={[0, CAP_Y, 0]} material={bezelMat} castShadow>
        <boxGeometry args={[HOUS_W + 0.04, 0.028, HOUS_D + 0.04]} />
      </mesh>

      {/* Top cap accent strip — thin emissive edge at front */}
      <mesh position={[0, CAP_Y + 0.014 + 0.003, HOUS_D / 2 + 0.022]} material={capAccentMat}>
        <boxGeometry args={[HOUS_W + 0.04, 0.006, 0.010]} />
      </mesh>

      {/* ── Screen bezel (tilted) ── */}
      <group position={[0, SCREEN_CY, SCREEN_FZ]} rotation={[SCREEN_TILT, 0, 0]}>
        {/* Bezel frame */}
        <mesh material={bezelMat} position={[0, 0, 0]} castShadow>
          <boxGeometry args={[BZ_W, BZ_H, BZ_D]} />
        </mesh>

        {/* Screen face — interactive, canvas-texture driven */}
        <mesh
          ref={screenMeshRef}
          position={[0, 0, BZ_D / 2 + 0.002]}
          material={screenMat}
          onPointerOver={(e) => {
            e.stopPropagation();
            hoverRef.current = true;
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            hoverRef.current = false;
            document.body.style.cursor = "auto";
          }}
          onClick={(e) => {
            e.stopPropagation();
            setActiveSurface(isActive ? null : def.id, def.roomId);
          }}
        >
          <planeGeometry args={[SC_W, SC_H]} />
        </mesh>

        {/* Scan lines on screen */}
        <ScanLines width={SC_W} height={SC_H} zOffset={BZ_D / 2 + 0.004} count={3} />

        {/* Active selection indicator */}
        {isActive && (
          <ActiveIndicatorLine width={BZ_W} height={BZ_H} depth={BZ_D} color={accentColor} />
        )}
      </group>

      {/* ── Keyboard / input ledge ── */}
      <mesh position={[0, KB_Y, KB_Z]} material={bezelMat}>
        <boxGeometry args={[0.28, 0.018, 0.14]} />
      </mesh>

      {/* Keyboard accent strip */}
      <mesh position={[0, KB_Y + 0.010, KB_Z + 0.068]} material={capAccentMat}>
        <boxGeometry args={[0.24, 0.005, 0.006]} />
      </mesh>

      {/* ── Status LEDs on right fin ── */}
      {ledMats.map((mat, i) => {
        const ledY = [LED_Y_TOP, LED_Y_MID, LED_Y_BOT][i]!;
        return (
          <mesh key={i} position={[LED_X, ledY, LED_ZF]} material={mat}>
            <boxGeometry args={[0.010, 0.010, 0.010]} />
          </mesh>
        );
      })}

      {/* ── In-world detail panel when surface is active ── */}
      {isActive && <DiegeticDetailPanel def={def} />}
    </group>
  );
});

FloorKioskSurface.displayName = "FloorKioskSurface";

// ── DisplaySurfaceObject — dispatcher ─────────────────────────────────────

/**
 * DisplaySurfaceObject — renders the correct surface component for a def.
 * Use this as the single entry point for rendering any display surface.
 */
export function DisplaySurfaceObject({ def }: { def: DisplaySurfaceDef }) {
  switch (def.kind) {
    case "monitor":
      return <MonitorSurface def={def} />;
    case "wall-panel":
      return <WallPanelSurface def={def} />;
    case "hologram-stand":
      return <HologramStandSurface def={def} />;
    case "floor-kiosk":
      return <FloorKioskSurface def={def} />;
    default:
      return null;
  }
}

// ── RoomDisplaySurfaces — room-level aggregator ───────────────────────────

/**
 * RoomDisplaySurfaces — renders all display surfaces for a given room.
 *
 * Iterates the room's furniture slots, converts display-surface slots to
 * DisplaySurfaceDef objects (via buildDisplaySurfaceDefs), and renders each
 * via DisplaySurfaceObject.
 *
 * Memoized per-room so only updates when the room definition changes.
 *
 * Usage (inside Room component):
 *   <RoomDisplaySurfaces room={room} />
 */
export function RoomDisplaySurfaces({ room }: { room: RoomDef }) {
  const defs = useMemo(() => buildDisplaySurfaceDefs(room), [room]);

  if (defs.length === 0) return null;

  return (
    <group name={`displays-${room.roomId}`}>
      {defs.map((def) => (
        <DisplaySurfaceObject key={def.id} def={def} />
      ))}
    </group>
  );
}

// ── DisplaySurfacesLayer — scene-level orchestrator ───────────────────────

/**
 * DisplaySurfacesLayer — Sub-AC 6a scene-level component.
 *
 * Iterates every room in the spatial-store building definition, calls
 * `buildDisplaySurfaceDefs` to extract display-surface furniture slots,
 * and renders a `DisplaySurfaceObject` for each one.
 *
 * This provides the complete set of physical in-world panels:
 *   • Wall-mounted monitors  (bezel + canvas-texture screen)
 *   • Large wall panels      (frame + scan-lines + canvas-texture)
 *   • Hologram stands        (pedestal + floating rings + hologram panel)
 *   • Floor kiosks           (octagonal base + column + tilted screen + LEDs)
 *
 * ── Integration note ────────────────────────────────────────────────────
 *   Add this component inside the <ScenePerformanceMonitor><Suspense> block
 *   in CommandCenterScene.tsx.  It is independent of the scene graph mode
 *   (hierarchy or legacy) — surfaces are always rendered.
 *
 * ── Event-sourcing transparency ─────────────────────────────────────────
 *   All surface click/dismiss interactions append 'surface.clicked' and
 *   'surface.dismissed' events to the spatial-store event log via
 *   `setActiveSurface()`.  Surfaces are therefore fully replayable.
 *
 * ── Performance ─────────────────────────────────────────────────────────
 *   Each surface only re-renders when its room definition changes
 *   (RoomDisplaySurfaces is memoized per-room).  Canvas textures are
 *   redrawn independently at per-surface refresh intervals (500ms – 5000ms).
 */
export function DisplaySurfacesLayer() {
  const building = useSpatialStore((s) => s.building);

  // Flatten all display-surface defs from every room in the building
  const allDefs = useMemo(
    () => building.rooms.flatMap((room) => buildDisplaySurfaceDefs(room)),
    // Stringify rooms array length + first/last room IDs as a shallow proxy
    // for building changes — avoids expensive deep equality on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [building.rooms],
  );

  if (allDefs.length === 0) return null;

  return (
    <group name="display-surfaces-layer">
      {allDefs.map((def) => (
        <DisplaySurfaceObject key={def.id} def={def} />
      ))}
    </group>
  );
}
