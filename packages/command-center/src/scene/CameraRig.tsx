/**
 * CameraRig — Orbit camera with preset positions and room-focus navigation.
 *
 * Provides smooth orbit controls with constraints suitable for
 * the isometric command-center view. Supports:
 *   - Named camera presets (overview, overhead, cutaway, etc.)
 *   - Room-focus mode: smooth animated transition to inspect a specific room
 *   - Keyboard navigation (1-5 for presets, Escape to reset)
 *
 * Camera transitions use lerp-based animation for smooth movement.
 */
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useCallback, type ElementRef } from "react";
import * as THREE from "three";

/** OrbitControls instance type derived from @react-three/drei (avoids three-stdlib direct import) */
type OrbitControlsImpl = ElementRef<typeof OrbitControls>;
import type { RoomDef } from "../data/building.js";
import { useSpatialStore, type CameraPreset } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";

const BUILDING_W = 12;
const BUILDING_D = 6;
const TOTAL_H = 6;

/** Camera preset definitions */
export const CAMERA_PRESETS = {
  /** Default isometric overview of the full building */
  overview: {
    position: [BUILDING_W * 0.8, TOTAL_H * 1.5, BUILDING_D * 2] as [number, number, number],
    target: [BUILDING_W / 2, TOTAL_H * 0.3, BUILDING_D / 2] as [number, number, number],
  },
  /** Top-down view */
  overhead: {
    position: [BUILDING_W / 2, TOTAL_H * 2.5, BUILDING_D / 2 + 0.01] as [number, number, number],
    target: [BUILDING_W / 2, 0, BUILDING_D / 2] as [number, number, number],
  },
  /** Front-facing cutaway view */
  cutaway: {
    position: [BUILDING_W / 2, TOTAL_H * 0.6, -BUILDING_D * 1.2] as [number, number, number],
    target: [BUILDING_W / 2, TOTAL_H * 0.4, BUILDING_D / 2] as [number, number, number],
  },
  /** Focus on ground floor */
  groundFloor: {
    position: [BUILDING_W * 0.6, 3, -BUILDING_D * 0.8] as [number, number, number],
    target: [BUILDING_W / 2, 1.5, BUILDING_D / 2] as [number, number, number],
  },
  /** Focus on operations floor */
  opsFloor: {
    position: [BUILDING_W * 0.6, 6, -BUILDING_D * 0.8] as [number, number, number],
    target: [BUILDING_W / 2, 4.5, BUILDING_D / 2] as [number, number, number],
  },
} as const;

/**
 * Re-export CameraPreset from the spatial store so existing imports of
 * `CameraPreset` from CameraRig.js continue to work unchanged.
 * The canonical definition lives in the store for event-sourcing.
 */
export type { CameraPreset };

// ── Room Focus Camera ───────────────────────────────────────────────

/**
 * Compute camera position + target to inspect a specific floor.
 * Positions the camera at a 3/4 angle showing the full floor from slightly
 * above, as a mid-level drill-down view.
 */
export function computeFloorFocusCamera(floorIndex: number): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const FLOOR_H = 3;
  const cy = floorIndex * FLOOR_H + FLOOR_H / 2; // Center Y of this floor
  // Isometric-ish angle showing the full floor
  return {
    position: [
      BUILDING_W * 0.9,
      cy + FLOOR_H * 1.1,
      -BUILDING_D * 0.7,
    ] as [number, number, number],
    target: [BUILDING_W / 2, cy, BUILDING_D / 2] as [number, number, number],
  };
}

/**
 * Compute close-up camera position + target to inspect a specific agent.
 * Positions the camera very close to the agent for an intimate view.
 */
export function computeAgentFocusCamera(worldPos: { x: number; y: number; z: number }): {
  position: [number, number, number];
  target: [number, number, number];
} {
  // Position camera at ~45° above and slightly in front of the agent
  return {
    position: [
      worldPos.x + 1.2,
      worldPos.y + 1.8,
      worldPos.z - 1.8,
    ] as [number, number, number],
    target: [
      worldPos.x,
      worldPos.y + 0.4, // Aim at agent's "chest"
      worldPos.z,
    ] as [number, number, number],
  };
}

/** Compute camera position + target to inspect a specific room */
export function computeRoomFocusCamera(room: RoomDef): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const cx = room.position.x + room.dimensions.x / 2;
  const cy = room.position.y + room.dimensions.y / 2;
  const cz = room.position.z + room.dimensions.z / 2;

  // Compute viewing distance based on room size
  const maxDim = Math.max(room.dimensions.x, room.dimensions.z);
  const viewDist = maxDim * 1.8 + 2;
  const viewHeight = room.dimensions.y * 1.2 + 1.5;

  // Position the camera at a 3/4 angle looking into the room
  const angle = -Math.PI / 5; // Slight angle from front
  const posX = cx + Math.sin(angle) * viewDist;
  const posZ = cz - Math.cos(angle) * viewDist * 0.6;
  const posY = cy + viewHeight;

  return {
    position: [posX, posY, posZ],
    target: [cx, cy, cz],
  };
}

// ── Animated Camera Transition ──────────────────────────────────────

interface CameraTransition {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  progress: number;
  active: boolean;
}

/**
 * Lerp speed — controls how fast the camera transitions.
 * Exported for testing and configuration.
 */
export const CAMERA_TRANSITION_SPEED = 3.5;

// ── CameraRig Component ─────────────────────────────────────────────

interface CameraRigProps {
  preset?: CameraPreset;
  /** Room to focus on (from store selection) — overrides preset when set */
  focusRoomId?: string | null;
  /** Callback when camera transition completes */
  onTransitionComplete?: () => void;
}

export function CameraRig({
  preset = "overview",
  focusRoomId,
  onTransitionComplete,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const transitionRef = useRef<CameraTransition>({
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    progress: 1,
    active: false,
  });

  const getRoomById = useSpatialStore((s) => s.getRoomById);

  // Drill-down state subscription
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);

  // Agent positions for agent-level camera
  const agents = useAgentStore((s) => s.agents);

  /** Start an animated camera transition */
  const startTransition = useCallback(
    (toPos: [number, number, number], toTarget: [number, number, number]) => {
      const t = transitionRef.current;
      t.fromPos.copy(camera.position);
      if (controlsRef.current) {
        t.fromTarget.copy(controlsRef.current.target);
      }
      t.toPos.set(...toPos);
      t.toTarget.set(...toTarget);
      t.progress = 0;
      t.active = true;
    },
    [camera],
  );

  // ── Drill-level camera transitions ─────────────────────────────────
  // React to drill level changes and animate camera to the appropriate view.
  useEffect(() => {
    if (drillLevel === "agent" && drillAgent) {
      const agent = agents[drillAgent];
      if (agent) {
        const focus = computeAgentFocusCamera(agent.worldPosition);
        startTransition(focus.position, focus.target);
      }
    } else if (drillLevel === "room" && drillRoom) {
      const room = getRoomById(drillRoom);
      if (room) {
        const focus = computeRoomFocusCamera(room);
        startTransition(focus.position, focus.target);
      }
    } else if (drillLevel === "floor" && drillFloor !== null) {
      const focus = computeFloorFocusCamera(drillFloor);
      startTransition(focus.position, focus.target);
    } else if (drillLevel === "building") {
      const overview = CAMERA_PRESETS.overview;
      startTransition(overview.position, overview.target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillLevel, drillFloor, drillRoom, drillAgent]);

  // Handle preset changes (only when at building level without drill)
  useEffect(() => {
    if (drillLevel !== "building") return; // Drill takes precedence
    if (focusRoomId) return; // Room focus takes precedence
    const p = CAMERA_PRESETS[preset];
    startTransition(p.position, p.target);
  }, [preset, focusRoomId, startTransition, drillLevel]);

  // Handle explicit room focus (from HUD INSPECT button — not drill-down)
  useEffect(() => {
    if (!focusRoomId) return;
    if (drillLevel === "room" || drillLevel === "agent") return; // Drill takes precedence
    const room = getRoomById(focusRoomId);
    if (!room) return;
    const focus = computeRoomFocusCamera(room);
    startTransition(focus.position, focus.target);
  }, [focusRoomId, getRoomById, startTransition, drillLevel]);

  // Animate camera transition each frame
  useFrame((_, delta) => {
    const t = transitionRef.current;
    if (!t.active || !controlsRef.current) return;

    t.progress = Math.min(1, t.progress + delta * CAMERA_TRANSITION_SPEED);

    // Use smoothstep easing for a nice feel
    const ease = t.progress * t.progress * (3 - 2 * t.progress);

    camera.position.lerpVectors(t.fromPos, t.toPos, ease);
    controlsRef.current.target.lerpVectors(t.fromTarget, t.toTarget, ease);
    controlsRef.current.update();

    if (t.progress >= 1) {
      t.active = false;
      onTransitionComplete?.();
    }
  });

  // Keyboard shortcuts for camera navigation
  useEffect(() => {
    const presetKeys: Record<string, CameraPreset> = {
      "1": "overview",
      "2": "overhead",
      "3": "cutaway",
      "4": "groundFloor",
      "5": "opsFloor",
    };

    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const p = presetKeys[e.key];
      if (p) {
        // Preset keys only apply at building level
        const { drillLevel } = useSpatialStore.getState();
        if (drillLevel === "building") {
          const preset = CAMERA_PRESETS[p];
          startTransition(preset.position, preset.target);
        }
      }

      // Escape: ascend one drill level (or reset camera at building level)
      if (e.key === "Escape") {
        const store = useSpatialStore.getState();
        if (store.drillLevel !== "building") {
          store.drillAscend();
        } else {
          // At root — reset camera to overview and clear any selection
          const overview = CAMERA_PRESETS.overview;
          startTransition(overview.position, overview.target);
          store.selectRoom(null);
        }
      }

      // B: switch to bird's-eye orthographic camera
      if (e.key === "b" || e.key === "B") {
        useSpatialStore.getState().setCameraMode("birdsEye");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [startTransition]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={2}
      maxDistance={40}
      maxPolarAngle={Math.PI * 0.48}
      minPolarAngle={Math.PI * 0.05}
      enablePan
      panSpeed={0.5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
    />
  );
}
