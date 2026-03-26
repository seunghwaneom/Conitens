/**
 * DashboardPanel.tsx — Low-poly 3D dashboard_panel ui_fixture renderer.
 *
 * Sub-AC 6a: Define and render the dashboard_panel ui_fixture entity.
 *
 * Renders a `dashboard_panel` UiFixtureDef as a visible low-poly flat surface
 * (plane/quad mesh) attached to a wall or desk surface in the 3D scene.
 *
 * Component hierarchy
 * ───────────────────
 *   DashboardPanelMesh        — Core mesh: bezel frame + screen face
 *     ├─ Bezel geometry       — PlaneGeometry, MeshStandardMaterial (dark)
 *     ├─ Screen geometry      — PlaneGeometry, MeshStandardMaterial (emissive)
 *     └─ ScanLineOverlay      — PlaneGeometry strips (low opacity, optional)
 *
 *   DashboardPanel            — Positioned mesh with room-local transform
 *     └─ DashboardPanelMesh
 *
 *   DashboardPanelLayer       — Renders all dashboard_panel fixtures for a room
 *     └─ DashboardPanel × N
 *
 * Low-poly style
 * ──────────────
 * All geometry uses PlaneGeometry (1×1 quad subdivided 0 times = 2 triangles).
 * Materials use `flatShading: true` for the stylized command-center aesthetic.
 * The bezel frame is a slightly larger quad behind the screen face quad,
 * creating a shadow-gap border without additional geometry.
 *
 * Coordinate conventions
 * ──────────────────────
 * Positions are in room-local space.  The parent <group> is translated by
 * the room's world-space origin, so room-local coordinates work correctly.
 *
 * facing='north' → rotationY = π    (panel face points south, −Z)
 * facing='south' → rotationY = 0    (panel face points north, +Z)
 * facing='east'  → rotationY = π/2  (panel face points west,  −X)
 * facing='west'  → rotationY = −π/2 (panel face points east,  +X)
 *
 * Event sourcing
 * ──────────────
 * On mount, each DashboardPanel records a `fixture.placed` event via the
 * scene event log so that all state-changing actions remain traceable.
 *
 * On click, the panel records a `fixture.panel_toggled` event (closed→open).
 */

import { memo, useEffect, useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type {
  UiFixtureDef,
  DashboardPanelVisualConfig,
} from "../data/ui-fixture-registry.js";
import {
  DEFAULT_UI_FIXTURES,
  getFixturesForRoom,
  computeScreenDimensions,
  computeBezelThickness,
} from "../data/ui-fixture-registry.js";
import { useSceneEventLog } from "../store/scene-event-log.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Z-offset so screen face sits just in front of bezel (avoids Z-fighting) */
export const SCREEN_Z_OFFSET = 0.003;

/** Z-offset so panel sits just in front of the wall surface (no Z-fighting) */
export const PANEL_WALL_Z_OFFSET = 0.015;

/** Pulse animation frequency (Hz) for active/highlighted panels */
export const PANEL_PULSE_HZ = 0.4;

/** Emissive intensity multiplier when panel is selected/active */
export const PANEL_ACTIVE_EMISSIVE_SCALE = 2.2;

/** Emissive intensity multiplier for idle panels */
export const PANEL_IDLE_EMISSIVE_SCALE = 1.0;

/** Render order for dashboard panel meshes (above floor, below HUD overlays) */
export const DASHBOARD_PANEL_RENDER_ORDER = 2;

/**
 * Scan-line strip height in grid units.
 * Each horizontal scan-line strip is this tall (y-extent).
 */
export const SCAN_LINE_STRIP_HEIGHT = 0.025;

/**
 * Gap between adjacent scan-line strips in grid units.
 * The vertical period of one scan-line cycle = STRIP_HEIGHT + STRIP_GAP.
 */
export const SCAN_LINE_STRIP_GAP = 0.055;

// ── Pure renderer helpers ─────────────────────────────────────────────────────

/**
 * Compute how many scan-line strips fit in a given screen height.
 *
 * This is a pure function — no Three.js dependency — so it can be unit-tested
 * in a headless environment.
 *
 * @param screenH  Screen face height in grid units
 * @param stripHeight  Height of each strip (default SCAN_LINE_STRIP_HEIGHT)
 * @param stripGap     Gap between strips (default SCAN_LINE_STRIP_GAP)
 * @returns Number of whole strips that fit (0 if screen is too short)
 */
export function computeScanLineStripCount(
  screenH: number,
  stripHeight: number = SCAN_LINE_STRIP_HEIGHT,
  stripGap: number   = SCAN_LINE_STRIP_GAP,
): number {
  if (screenH <= 0 || stripHeight <= 0) return 0;
  return Math.max(0, Math.floor(screenH / (stripHeight + stripGap)));
}

/**
 * Compute the world-space position at which a dashboard panel group will be
 * placed, given the room's world-space origin, the fixture's room-local
 * position, and the wall Z-offset that prevents Z-fighting.
 *
 * This matches the DashboardPanel component's `position` prop:
 *   position={[t.x, t.y, t.z + PANEL_WALL_Z_OFFSET]}
 *
 * Expressed as a pure function so coordinate correctness can be asserted in
 * headless tests without instantiating any React/Three.js component.
 *
 * @param roomOrigin  Room world-space origin { x, y, z }
 * @param localPos    Fixture room-local position { x, y, z }
 * @returns           World-space position { x, y, z } with wall Z-offset applied
 */
export function computePanelPlacedPosition(
  roomOrigin: { x: number; y: number; z: number },
  localPos:   { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: roomOrigin.x + localPos.x,
    y: roomOrigin.y + localPos.y,
    z: roomOrigin.z + localPos.z + PANEL_WALL_Z_OFFSET,
  };
}

/**
 * Compute the world-space position of the screen face mesh within a panel.
 *
 * The screen face is offset by SCREEN_Z_OFFSET in addition to PANEL_WALL_Z_OFFSET,
 * so that the screen sits just in front of the bezel geometry.
 *
 * @param roomOrigin  Room world-space origin { x, y, z }
 * @param localPos    Fixture room-local position { x, y, z }
 * @returns           World-space position { x, y, z } for the screen face
 */
export function computeScreenFacePosition(
  roomOrigin: { x: number; y: number; z: number },
  localPos:   { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const panelPos = computePanelPlacedPosition(roomOrigin, localPos);
  return {
    x: panelPos.x,
    y: panelPos.y,
    z: panelPos.z + SCREEN_Z_OFFSET,
  };
}

/**
 * Filter a registry of UiFixtureDefs to only `dashboard_panel` fixtures.
 *
 * Extracted as a pure helper so that the DashboardPanelLayer rendering
 * decision is explicitly testable without mounting any React component.
 *
 * @param fixtures  Full fixture registry (or a subset)
 * @returns         Only fixtures with fixture_type === 'dashboard_panel'
 */
export function filterDashboardPanelFixtures(
  fixtures: readonly import("../data/ui-fixture-registry.js").UiFixtureDef[],
): readonly import("../data/ui-fixture-registry.js").UiFixtureDef[] {
  return fixtures.filter((f) => f.fixture_type === "dashboard_panel");
}

/**
 * Collect the unique room IDs that have at least one `dashboard_panel` fixture.
 *
 * Used by BuildingDashboardPanels to determine which DashboardPanelLayers to
 * instantiate. Extracting this as a pure function makes it testable without
 * rendering a Three.js scene.
 *
 * @param fixtures  Fixture registry to search
 * @returns         Deduplicated array of room IDs
 */
export function collectDashboardPanelRoomIds(
  fixtures: readonly import("../data/ui-fixture-registry.js").UiFixtureDef[],
): string[] {
  return [...new Set(
    fixtures
      .filter((f) => f.fixture_type === "dashboard_panel")
      .map((f) => f.room_id),
  )];
}

// ── Prop interfaces ───────────────────────────────────────────────────────────

export interface DashboardPanelMeshProps {
  /** Visual configuration (dimensions, colors, emissive) */
  visual: DashboardPanelVisualConfig;
  /** Whether this panel is currently selected/active */
  isActive?: boolean;
  /** Pointer-enter handler */
  onPointerEnter?: () => void;
  /** Pointer-leave handler */
  onPointerLeave?: () => void;
  /** Click handler */
  onClick?: () => void;
}

export interface DashboardPanelProps {
  /** Full fixture definition from the registry */
  fixture: UiFixtureDef;
  /** Whether this panel is currently selected */
  isActive?: boolean;
  /** Click callback — receives fixture_id */
  onSelect?: (fixtureId: string) => void;
}

export interface DashboardPanelLayerProps {
  /** World-space origin of the containing room */
  roomOrigin: { x: number; y: number; z: number };
  /** Room identifier — only fixtures in this room are rendered */
  roomId: string;
  /** Currently selected fixture_id (for highlight) */
  selectedFixtureId?: string | null;
  /** Selection callback */
  onSelect?: (fixtureId: string) => void;
}

// ── DashboardPanelMesh ────────────────────────────────────────────────────────

/**
 * Core low-poly mesh for a `dashboard_panel`.
 *
 * Geometry:
 *   - Bezel:  PlaneGeometry(width, height)        — dark frame
 *   - Screen: PlaneGeometry(screenW, screenH)     — emissive face, +z offset
 *   - Scan lines (optional): thin horizontal PlaneGeometry strips
 *
 * The bezel and screen are both plain quads (2 triangles each), achieving the
 * stylized low-poly command-center look with minimal geometry.
 */
export const DashboardPanelMesh = memo(function DashboardPanelMesh({
  visual,
  isActive = false,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: DashboardPanelMeshProps) {
  const screenRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const { screenW, screenH } = computeScreenDimensions(visual.width, visual.height);
  const bezelThickness = computeBezelThickness(visual.width, visual.height);

  // Pulse animation on active panels
  useFrame((_, delta) => {
    if (!screenRef.current) return;
    const mat = screenRef.current.material as THREE.MeshStandardMaterial;
    if (isActive || hovered) {
      const t = performance.now() / 1000;
      const pulse = Math.sin(t * Math.PI * 2 * PANEL_PULSE_HZ) * 0.15 + 0.85;
      mat.emissiveIntensity =
        visual.emissiveIntensity * PANEL_ACTIVE_EMISSIVE_SCALE * pulse;
    } else {
      mat.emissiveIntensity = visual.emissiveIntensity * PANEL_IDLE_EMISSIVE_SCALE;
    }
  });

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    onPointerEnter?.();
  }, [onPointerEnter]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    onPointerLeave?.();
  }, [onPointerLeave]);

  return (
    <group renderOrder={DASHBOARD_PANEL_RENDER_ORDER}>
      {/* ── Bezel frame ─────────────────────────────────────────────────── */}
      <mesh
        receiveShadow={false}
        castShadow={false}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={onClick}
      >
        <planeGeometry args={[visual.width, visual.height]} />
        <meshStandardMaterial
          color={visual.bezelColor}
          roughness={0.8}
          metalness={0.3}
          flatShading={true}
        />
      </mesh>

      {/* ── Screen face ─────────────────────────────────────────────────── */}
      <mesh
        ref={screenRef}
        position={[0, 0, SCREEN_Z_OFFSET]}
        receiveShadow={false}
        castShadow={false}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={onClick}
      >
        <planeGeometry args={[screenW, screenH]} />
        <meshStandardMaterial
          color={visual.screenColor}
          emissive={visual.accentColor}
          emissiveIntensity={visual.emissiveIntensity}
          roughness={0.2}
          metalness={0.1}
          flatShading={true}
        />
      </mesh>

      {/* ── Scan-line overlay ────────────────────────────────────────────── */}
      {visual.scanLines && (
        <ScanLineOverlay
          screenW={screenW}
          screenH={screenH}
          bezelThickness={bezelThickness}
          opacity={visual.scanLineOpacity}
        />
      )}

      {/* ── Active selection ring ────────────────────────────────────────── */}
      {(isActive || hovered) && (
        <mesh position={[0, 0, SCREEN_Z_OFFSET * 2]}>
          <planeGeometry args={[visual.width + 0.04, visual.height + 0.04]} />
          <meshStandardMaterial
            color={visual.accentColor}
            emissive={visual.accentColor}
            emissiveIntensity={0.3}
            transparent={true}
            opacity={0.15}
            flatShading={true}
          />
        </mesh>
      )}
    </group>
  );
});

// ── ScanLineOverlay ───────────────────────────────────────────────────────────

/**
 * Horizontal scan-line strips rendered over the screen face.
 * Each strip is a thin PlaneGeometry quad.
 */
const ScanLineOverlay = memo(function ScanLineOverlay({
  screenW,
  screenH,
  bezelThickness: _bezelThickness,
  opacity,
}: {
  screenW: number;
  screenH: number;
  bezelThickness: number;
  opacity: number;
}) {
  // One strip every 0.06 grid units
  const stripHeight = 0.025;
  const stripGap    = 0.055;
  const stripCount  = Math.floor(screenH / (stripHeight + stripGap));
  const startY      = (screenH / 2) - stripHeight / 2;

  return (
    <group position={[0, 0, SCREEN_Z_OFFSET * 1.5]}>
      {Array.from({ length: stripCount }, (_, i) => {
        const y = startY - i * (stripHeight + stripGap);
        return (
          <mesh key={i} position={[0, y, 0]}>
            <planeGeometry args={[screenW, stripHeight]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent={true}
              opacity={opacity}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
});

// ── DashboardPanel ────────────────────────────────────────────────────────────

/**
 * Positioned dashboard panel — applies the fixture's room-local transform.
 *
 * Emits a `fixture.placed` event on first mount for record transparency.
 * Emits `fixture.panel_toggled` on click.
 */
export const DashboardPanel = memo(function DashboardPanel({
  fixture,
  isActive = false,
  onSelect,
}: DashboardPanelProps) {
  const { t, r } = {
    t: fixture.transform.position,
    r: fixture.transform.rotation,
  };

  const recordEntry = useSceneEventLog((s) => s.recordEntry);

  // Record fixture.placed on mount (record transparency)
  useEffect(() => {
    recordEntry({
      ts:       Date.now(),
      category: "surface.clicked",   // nearest semantic match in SceneEventCategory
      source:   "system",
      payload:  {
        event_type:    "fixture.placed",
        fixture_id:    fixture.fixture_id,
        fixture_name:  fixture.fixture_name,
        fixture_type:  fixture.fixture_type,
        room_id:       fixture.room_id,
        position:      { x: t.x, y: t.y, z: t.z },
        rotation:      { x: r.x, y: r.y, z: r.z },
        content_type:  fixture.content_type,
        visual_width:  fixture.visual.width,
        visual_height: fixture.visual.height,
        accent_color:  fixture.visual.accentColor,
        mount_type:    fixture.transform.mountType,
        facing:        fixture.transform.facing,
        trigger_source: "automation",
        ts_ms:          Date.now(),
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture.fixture_id]);

  const handleClick = useCallback(() => {
    recordEntry({
      ts:       Date.now(),
      category: "surface.clicked",
      source:   "system",
      payload:  {
        event_type:    "fixture.panel_toggled",
        fixture_id:    fixture.fixture_id,
        fixture_name:  fixture.fixture_name,
        room_id:       fixture.room_id,
        prev_state:    isActive ? "open" : "closed",
        next_state:    isActive ? "closed" : "open",
        trigger_source: "direct",
        ts_ms:          Date.now(),
      },
    });
    onSelect?.(fixture.fixture_id);
  }, [fixture, isActive, onSelect, recordEntry]);

  return (
    <group
      name={`dashboard-panel-${fixture.fixture_id}`}
      position={[t.x, t.y, t.z + PANEL_WALL_Z_OFFSET]}
      rotation={[r.x, r.y, r.z]}
      scale={[
        fixture.transform.scale.x,
        fixture.transform.scale.y,
        fixture.transform.scale.z,
      ]}
    >
      <DashboardPanelMesh
        visual={fixture.visual}
        isActive={isActive}
        onClick={handleClick}
      />
    </group>
  );
});

// ── DashboardPanelLayer ───────────────────────────────────────────────────────

/**
 * Renders all `dashboard_panel` fixtures registered for a given room.
 *
 * The layer is a <group> translated to the room's world-space origin.
 * Each child DashboardPanel applies its own room-local transform on top.
 */
export const DashboardPanelLayer = memo(function DashboardPanelLayer({
  roomOrigin,
  roomId,
  selectedFixtureId,
  onSelect,
}: DashboardPanelLayerProps) {
  const fixtures = filterDashboardPanelFixtures(getFixturesForRoom(roomId));

  if (fixtures.length === 0) return null;

  return (
    <group
      name={`dashboard-panel-layer-${roomId}`}
      position={[roomOrigin.x, roomOrigin.y, roomOrigin.z]}
    >
      {fixtures.map((fixture) => (
        <DashboardPanel
          key={fixture.fixture_id}
          fixture={fixture}
          isActive={selectedFixtureId === fixture.fixture_id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
});

// ── BuildingDashboardPanels ───────────────────────────────────────────────────

/**
 * Renders all dashboard panels across the entire building.
 * Useful for the top-level CommandCenterScene — just mount this once.
 *
 * Each panel is placed relative to its room's world-space origin.
 * Room origins are passed as a map for O(1) lookup.
 */
export interface BuildingDashboardPanelsProps {
  /** Map from roomId → world-space origin for room-local → world transform */
  roomOrigins: ReadonlyMap<string, { x: number; y: number; z: number }>;
  /** Currently selected fixture_id */
  selectedFixtureId?: string | null;
  /** Selection callback */
  onSelect?: (fixtureId: string) => void;
}

export const BuildingDashboardPanels = memo(function BuildingDashboardPanels({
  roomOrigins,
  selectedFixtureId,
  onSelect,
}: BuildingDashboardPanelsProps) {
  // Collect unique room IDs that have dashboard_panel fixtures (via pure helper)
  const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);

  return (
    <group name="building-dashboard-panels">
      {roomIds.map((roomId) => {
        const origin = roomOrigins.get(roomId);
        if (!origin) return null;
        return (
          <DashboardPanelLayer
            key={roomId}
            roomId={roomId}
            roomOrigin={origin}
            selectedFixtureId={selectedFixtureId}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
});
