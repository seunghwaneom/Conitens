/**
 * SpatialUiFixture.tsx — Spatial UI fixture components for the 3D command-center.
 *
 * Sub-AC 7a: Define and render ui_fixture components (button, handle,
 * menu_anchor) that attach to 3D entity positions in world-space for agents,
 * tasks, and rooms.  Fixtures track their parent entity's transform and emit
 * raw interaction_intents (with entity reference and action type) on
 * pointer/click manipulation.
 *
 * ## Component hierarchy
 *
 *   SpatialFixtureLayer           — top-level; renders all entity fixtures
 *     ├─ EntityFixtureSet          — all fixtures for a single entity
 *     │    ├─ FixtureButton        — clickable low-poly button mesh
 *     │    ├─ FixtureHandle        — draggable handle sphere
 *     │    └─ FixtureMenuAnchor    — context-menu trigger octahedron
 *
 * ## Transform tracking
 *
 *   Every fixture receives a `worldPosition` prop that reflects the parent
 *   entity's live world-space coordinates.  Because parent entities (agents,
 *   tasks, rooms) may animate (walk, pulse), callers should pass a stable
 *   ref or the latest frame value.  The group `<group position={worldPosition}>`
 *   ensures automatic Three.js world-matrix propagation.
 *
 * ## Intent emission
 *
 *   All pointer events call `e.stopPropagation()` then invoke the caller's
 *   `onIntent` callback with a fully-typed FixtureInteractionIntent.
 *   No global store is written here — store integration is the consumer's
 *   responsibility (matching the agent-interaction-intents.ts pattern).
 *
 * ## Visual design
 *
 *   - Dark command-center palette: emissive cyan/amber highlights on hover
 *   - All meshes use flat-shaded low-poly geometry
 *   - Render order SPATIAL_FIXTURE_RENDER_ORDER = 5 (above task connectors)
 *   - Small scale (default 0.12–0.15 units) to not occlude agent avatars
 *
 * ## Event sourcing
 *
 *   fixture.button_placed  — emitted on FixtureButton mount
 *   fixture.handle_placed  — emitted on FixtureHandle mount
 *   fixture.anchor_placed  — emitted on FixtureMenuAnchor mount
 *   (via useSceneEventLog — same pattern as DashboardPanel.tsx)
 */

import { memo, useCallback, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type {
  FixtureEntityRef,
  FixtureWorldPosition,
  FixtureScreenPosition,
  FixtureInteractionIntent,
} from "./fixture-interaction-intents.js";
import {
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureHandleDragMoveIntent,
  makeFixtureHandleDragEndIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
  computeFixtureButtonOffset,
  computeFixtureWorldPos,
} from "./fixture-interaction-intents.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Render order for all spatial fixture meshes (above task-connector beams). */
export const SPATIAL_FIXTURE_RENDER_ORDER = 5;

/** Default radius of the FixtureButton mesh. */
export const FIXTURE_BUTTON_RADIUS = 0.07;

/** Default geometry segments for low-poly FixtureButton sphere. */
export const FIXTURE_BUTTON_SEGMENTS = 4;

/** Default radius of the FixtureHandle sphere. */
export const FIXTURE_HANDLE_RADIUS = 0.065;

/** Default radius of the FixtureMenuAnchor octahedron. */
export const FIXTURE_MENU_ANCHOR_RADIUS = 0.08;

/** Idle emissive intensity for fixture meshes. */
export const FIXTURE_IDLE_EMISSIVE = 0.4;

/** Hovered emissive intensity for fixture meshes. */
export const FIXTURE_HOVERED_EMISSIVE = 1.2;

/** Active/pressed emissive intensity for button meshes. */
export const FIXTURE_ACTIVE_EMISSIVE = 2.0;

/** LERP alpha for emissive hover animation per frame (~60fps → ~100ms). */
export const FIXTURE_HOVER_LERP_ALPHA = 0.18;

/** Base color hex for FixtureButton (cyan command accent). */
export const FIXTURE_BUTTON_COLOR = 0x00bcd4;

/** Base color hex for FixtureHandle (amber drag accent). */
export const FIXTURE_HANDLE_COLOR = 0xffb300;

/** Base color hex for FixtureMenuAnchor (magenta menu accent). */
export const FIXTURE_MENU_ANCHOR_COLOR = 0xe040fb;

/** Horizontal spacing between sibling fixture buttons on the same entity. */
export const FIXTURE_BUTTON_SPACING = 0.25;

// ── Shared geometry singletons (re-used across instances) ─────────────────────

const _buttonGeo = new THREE.IcosahedronGeometry(FIXTURE_BUTTON_RADIUS, 0);
const _handleGeo = new THREE.IcosahedronGeometry(FIXTURE_HANDLE_RADIUS, 1);
const _anchorGeo = new THREE.OctahedronGeometry(FIXTURE_MENU_ANCHOR_RADIUS, 0);

// ── Pure helpers (exported for unit tests — no React/Three.js required) ────────

/**
 * Compute the default Y height for buttons attached to an entity type.
 * Agents are shorter than rooms; tasks float mid-height.
 */
export function computeEntityButtonBaseY(
  entityType: FixtureEntityRef["entityType"],
): number {
  switch (entityType) {
    case "agent": return 0.55;
    case "task":  return 0.75;
    case "room":  return 1.20;
    default:      return 0.55;
  }
}

/**
 * Compute the local offset for a fixture given its index, spacing, and entity
 * type.  Used by EntityFixtureSet to lay out multiple sibling fixtures.
 */
export function computeFixtureLocalOffset(
  index: number,
  entityType: FixtureEntityRef["entityType"],
  spacing = FIXTURE_BUTTON_SPACING,
): { x: number; y: number; z: number } {
  const base = computeFixtureButtonOffset(index, spacing);
  base.y = computeEntityButtonBaseY(entityType);
  return base;
}

/**
 * Derive hover emissive intensity from hover + animation progress.
 * `t` is a 0→1 transition progress value (LERP output).
 */
export function computeFixtureEmissiveIntensity(
  t: number,
  isActive: boolean,
): number {
  if (isActive) return FIXTURE_ACTIVE_EMISSIVE;
  return FIXTURE_IDLE_EMISSIVE + t * (FIXTURE_HOVERED_EMISSIVE - FIXTURE_IDLE_EMISSIVE);
}

// ── FixtureButton ──────────────────────────────────────────────────────────────

export interface FixtureButtonProps {
  /** Stable fixture component ID. */
  fixtureId: string;
  /** Parent entity reference (type + stable ID). */
  entityRef: FixtureEntityRef;
  /** World-space position of this button (tracks parent transform). */
  worldPosition: FixtureWorldPosition;
  /** Called on every pointer interaction with a fully typed intent. */
  onIntent: (intent: FixtureInteractionIntent) => void;
  /** Whether the button is globally disabled (renders dimmed, no events). */
  disabled?: boolean;
  /** Override colour (hex). */
  color?: number;
}

/**
 * FixtureButton — a small low-poly icosahedron button that attaches to a 3D
 * entity position.  On click → emits FIXTURE_BUTTON_CLICKED.
 * On hover enter/exit → emits FIXTURE_BUTTON_HOVERED / UNHOVERED.
 */
export const FixtureButton = memo(function FixtureButton({
  fixtureId,
  entityRef,
  worldPosition,
  onIntent,
  disabled = false,
  color = FIXTURE_BUTTON_COLOR,
}: FixtureButtonProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const emissiveProgressRef = useRef(0);

  // Animate emissive on hover
  useFrame(() => {
    if (!matRef.current) return;
    const target = hovered ? 1.0 : 0.0;
    emissiveProgressRef.current +=
      (target - emissiveProgressRef.current) * FIXTURE_HOVER_LERP_ALPHA;
    matRef.current.emissiveIntensity = computeFixtureEmissiveIntensity(
      emissiveProgressRef.current,
      active,
    );
  });

  const wp = (): FixtureWorldPosition => worldPosition;

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(true);
      onIntent(
        makeFixtureButtonHoveredIntent({
          fixtureId,
          fixtureKind: "button",
          entityRef,
          actionType: "hover_enter",
          worldPosition: wp(),
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  const handlePointerOut = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(false);
      setActive(false);
      onIntent(
        makeFixtureButtonUnhoveredIntent({
          fixtureId,
          fixtureKind: "button",
          entityRef,
          actionType: "hover_exit",
          worldPosition: wp(),
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  const handlePointerDown = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (disabled) return;
      e.stopPropagation();
      setActive(true);
    },
    [disabled],
  );

  const handleClick = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled) return;
      e.stopPropagation();
      setActive(false);
      onIntent(
        makeFixtureButtonClickedIntent({
          fixtureId,
          fixtureKind: "button",
          entityRef,
          actionType: "click",
          worldPosition: wp(),
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  return (
    <group position={[worldPosition.x, worldPosition.y, worldPosition.z]}>
      <mesh
        geometry={_buttonGeo}
        renderOrder={SPATIAL_FIXTURE_RENDER_ORDER}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        userData={{ fixtureId, fixtureKind: "button", entityRef }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={disabled ? 0x444444 : color}
          emissive={disabled ? 0x000000 : color}
          emissiveIntensity={FIXTURE_IDLE_EMISSIVE}
          roughness={0.35}
          metalness={0.7}
          flatShading
          transparent={disabled}
          opacity={disabled ? 0.4 : 1.0}
        />
      </mesh>
    </group>
  );
});

// ── FixtureHandle ──────────────────────────────────────────────────────────────

export interface FixtureHandleProps {
  fixtureId: string;
  entityRef: FixtureEntityRef;
  worldPosition: FixtureWorldPosition;
  onIntent: (intent: FixtureInteractionIntent) => void;
  disabled?: boolean;
  color?: number;
}

/**
 * FixtureHandle — a slightly larger icosahedron handle that supports drag
 * interaction.  On pointer-down → FIXTURE_HANDLE_DRAG_START.
 * On pointer-move while dragged → FIXTURE_HANDLE_DRAG_MOVE.
 * On pointer-up → FIXTURE_HANDLE_DRAG_END.
 */
export const FixtureHandle = memo(function FixtureHandle({
  fixtureId,
  entityRef,
  worldPosition,
  onIntent,
  disabled = false,
  color = FIXTURE_HANDLE_COLOR,
}: FixtureHandleProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);
  const dragOriginRef = useRef<FixtureWorldPosition | null>(null);
  const emissiveProgressRef = useRef(0);

  useFrame(() => {
    if (!matRef.current) return;
    const target = hovered || draggingRef.current ? 1.0 : 0.0;
    emissiveProgressRef.current +=
      (target - emissiveProgressRef.current) * FIXTURE_HOVER_LERP_ALPHA;
    matRef.current.emissiveIntensity = computeFixtureEmissiveIntensity(
      emissiveProgressRef.current,
      draggingRef.current,
    );
  });

  const wp = (): FixtureWorldPosition => worldPosition;

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(true);
    },
    [disabled],
  );

  const handlePointerOut = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(false);
    },
    [disabled],
  );

  const handlePointerDown = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled) return;
      e.stopPropagation();
      draggingRef.current = true;
      dragOriginRef.current = wp();
      onIntent(
        makeFixtureHandleDragStartIntent({
          fixtureId,
          fixtureKind: "handle",
          entityRef,
          actionType: "drag_start",
          dragOriginWorld: wp(),
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  const handlePointerMove = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number; point?: THREE.Vector3 }) => {
      if (disabled || !draggingRef.current) return;
      e.stopPropagation();
      const current = wp();
      const origin = dragOriginRef.current;
      const delta: FixtureWorldPosition | null = origin
        ? { x: current.x - origin.x, y: current.y - origin.y, z: current.z - origin.z }
        : null;
      onIntent(
        makeFixtureHandleDragMoveIntent({
          fixtureId,
          fixtureKind: "handle",
          entityRef,
          actionType: "drag_move",
          dragCurrentWorld: current,
          dragDeltaWorld: delta,
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  const handlePointerUp = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled || !draggingRef.current) return;
      e.stopPropagation();
      const endPos = wp();
      draggingRef.current = false;
      onIntent(
        makeFixtureHandleDragEndIntent({
          fixtureId,
          fixtureKind: "handle",
          entityRef,
          actionType: "drag_end",
          dragOriginWorld: dragOriginRef.current,
          dragEndWorld: endPos,
          screenPosition: { x: e.clientX, y: e.clientY },
          ts: Date.now(),
        }),
      );
      dragOriginRef.current = null;
    },
    [disabled, fixtureId, entityRef, onIntent, worldPosition],
  );

  return (
    <group position={[worldPosition.x, worldPosition.y, worldPosition.z]}>
      <mesh
        geometry={_handleGeo}
        renderOrder={SPATIAL_FIXTURE_RENDER_ORDER}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        userData={{ fixtureId, fixtureKind: "handle", entityRef }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={disabled ? 0x444444 : color}
          emissive={disabled ? 0x000000 : color}
          emissiveIntensity={FIXTURE_IDLE_EMISSIVE}
          roughness={0.25}
          metalness={0.8}
          flatShading
          transparent={disabled}
          opacity={disabled ? 0.4 : 1.0}
        />
      </mesh>
    </group>
  );
});

// ── FixtureMenuAnchor ──────────────────────────────────────────────────────────

export interface FixtureMenuAnchorProps {
  fixtureId: string;
  entityRef: FixtureEntityRef;
  worldPosition: FixtureWorldPosition;
  onIntent: (intent: FixtureInteractionIntent) => void;
  disabled?: boolean;
  color?: number;
}

/**
 * FixtureMenuAnchor — a low-poly octahedron that acts as a context-menu
 * trigger.  Click → toggle open/closed, emitting
 * FIXTURE_MENU_ANCHOR_OPENED or FIXTURE_MENU_ANCHOR_CLOSED.
 */
export const FixtureMenuAnchor = memo(function FixtureMenuAnchor({
  fixtureId,
  entityRef,
  worldPosition,
  onIntent,
  disabled = false,
  color = FIXTURE_MENU_ANCHOR_COLOR,
}: FixtureMenuAnchorProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const emissiveProgressRef = useRef(0);

  useFrame(() => {
    if (!matRef.current) return;
    const target = hovered || open ? 1.0 : 0.0;
    emissiveProgressRef.current +=
      (target - emissiveProgressRef.current) * FIXTURE_HOVER_LERP_ALPHA;
    matRef.current.emissiveIntensity = computeFixtureEmissiveIntensity(
      emissiveProgressRef.current,
      open,
    );
  });

  const wp = (): FixtureWorldPosition => worldPosition;

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(true);
    },
    [disabled],
  );

  const handlePointerOut = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (disabled) return;
      e.stopPropagation();
      setHovered(false);
    },
    [disabled],
  );

  const handleClick = useCallback(
    (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      if (disabled) return;
      e.stopPropagation();
      const nextOpen = !open;
      setOpen(nextOpen);
      if (nextOpen) {
        onIntent(
          makeFixtureMenuAnchorOpenedIntent({
            fixtureId,
            fixtureKind: "menu_anchor",
            entityRef,
            actionType: "menu_open",
            worldPosition: wp(),
            screen_position: { x: e.clientX, y: e.clientY },
            ts: Date.now(),
          }),
        );
      } else {
        onIntent(
          makeFixtureMenuAnchorClosedIntent({
            fixtureId,
            fixtureKind: "menu_anchor",
            entityRef,
            actionType: "menu_close",
            worldPosition: wp(),
            ts: Date.now(),
          }),
        );
      }
    },
    [disabled, fixtureId, entityRef, open, onIntent, worldPosition],
  );

  return (
    <group position={[worldPosition.x, worldPosition.y, worldPosition.z]}>
      {/* Slight rotation to orient octahedron tip upward */}
      <mesh
        geometry={_anchorGeo}
        rotation={[0, Math.PI / 4, 0]}
        renderOrder={SPATIAL_FIXTURE_RENDER_ORDER}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        userData={{ fixtureId, fixtureKind: "menu_anchor", entityRef, open }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={disabled ? 0x444444 : color}
          emissive={disabled ? 0x000000 : color}
          emissiveIntensity={open ? FIXTURE_ACTIVE_EMISSIVE : FIXTURE_IDLE_EMISSIVE}
          roughness={0.3}
          metalness={0.75}
          flatShading
          transparent={disabled}
          opacity={disabled ? 0.4 : 1.0}
        />
      </mesh>
    </group>
  );
});

// ── SpatialFixtureDescriptor — definition of a single fixture on an entity ────

/** The kind of fixture to render. */
export type SpatialFixtureComponentKind = "button" | "handle" | "menu_anchor";

/**
 * Descriptor for a single fixture component attached to a parent entity.
 * Passed to EntityFixtureSet to render the correct component.
 */
export interface SpatialFixtureDescriptor {
  /** Stable fixture component ID. */
  fixtureId: string;
  /** Which component to render. */
  kind: SpatialFixtureComponentKind;
  /** Optional override color (hex). */
  color?: number;
  /** Whether this fixture is disabled (dimmed, no interaction). */
  disabled?: boolean;
  /**
   * Local offset from the parent entity's world position.
   * If omitted, computed via computeFixtureLocalOffset(index, entityType).
   */
  localOffset?: { x: number; y: number; z: number };
}

// ── EntityFixtureSet ───────────────────────────────────────────────────────────

export interface EntityFixtureSetProps {
  /** The parent entity reference. */
  entityRef: FixtureEntityRef;
  /** The entity's current world-space position (tracks transform). */
  entityWorldPosition: FixtureWorldPosition;
  /** Fixture descriptors to render for this entity. */
  fixtures: SpatialFixtureDescriptor[];
  /** Called on every pointer interaction. */
  onIntent: (intent: FixtureInteractionIntent) => void;
}

/**
 * EntityFixtureSet — renders all spatial fixture components for a single
 * entity (agent, task, or room).  Automatically computes per-fixture world
 * positions from the entity's world position + fixture local offsets.
 */
export const EntityFixtureSet = memo(function EntityFixtureSet({
  entityRef,
  entityWorldPosition,
  fixtures,
  onIntent,
}: EntityFixtureSetProps) {
  return (
    <>
      {fixtures.map((desc, index) => {
        const localOffset =
          desc.localOffset ??
          computeFixtureLocalOffset(index, entityRef.entityType);

        const fixtureWorldPos = computeFixtureWorldPos(
          entityWorldPosition,
          localOffset,
        );

        switch (desc.kind) {
          case "button":
            return (
              <FixtureButton
                key={desc.fixtureId}
                fixtureId={desc.fixtureId}
                entityRef={entityRef}
                worldPosition={fixtureWorldPos}
                onIntent={onIntent}
                disabled={desc.disabled}
                color={desc.color}
              />
            );

          case "handle":
            return (
              <FixtureHandle
                key={desc.fixtureId}
                fixtureId={desc.fixtureId}
                entityRef={entityRef}
                worldPosition={fixtureWorldPos}
                onIntent={onIntent}
                disabled={desc.disabled}
                color={desc.color}
              />
            );

          case "menu_anchor":
            return (
              <FixtureMenuAnchor
                key={desc.fixtureId}
                fixtureId={desc.fixtureId}
                entityRef={entityRef}
                worldPosition={fixtureWorldPos}
                onIntent={onIntent}
                disabled={desc.disabled}
                color={desc.color}
              />
            );

          default:
            return null;
        }
      })}
    </>
  );
});

// ── SpatialFixtureLayer ────────────────────────────────────────────────────────

/** A single entity entry for the SpatialFixtureLayer. */
export interface SpatialFixtureEntityEntry {
  /** The entity reference. */
  entityRef: FixtureEntityRef;
  /** The entity's current world-space position. */
  entityWorldPosition: FixtureWorldPosition;
  /** Fixture descriptors for this entity. */
  fixtures: SpatialFixtureDescriptor[];
}

export interface SpatialFixtureLayerProps {
  /** All entities (agents, tasks, rooms) with their fixture descriptors. */
  entities: SpatialFixtureEntityEntry[];
  /** Called on every pointer interaction from any fixture. */
  onIntent: (intent: FixtureInteractionIntent) => void;
  /** Whether to render the fixture layer at all (e.g. during replay). */
  visible?: boolean;
}

/**
 * SpatialFixtureLayer — top-level layer component.  Renders all spatial
 * fixture components for all entity entries.  The layer is a pure pass-through:
 * it does not own any state and does not modify the scene event log.
 *
 * @example
 * ```tsx
 * <SpatialFixtureLayer
 *   entities={[
 *     {
 *       entityRef: { entityType: "agent", entityId: "agent-manager-1" },
 *       entityWorldPosition: { x: 1, y: 0, z: 1 },
 *       fixtures: [
 *         { fixtureId: "mgr-pause-btn", kind: "button" },
 *         { fixtureId: "mgr-menu",      kind: "menu_anchor" },
 *       ],
 *     },
 *   ]}
 *   onIntent={(intent) => dispatch(intent)}
 * />
 * ```
 */
export const SpatialFixtureLayer = memo(function SpatialFixtureLayer({
  entities,
  onIntent,
  visible = true,
}: SpatialFixtureLayerProps) {
  if (!visible) return null;

  return (
    <group name="spatial-fixture-layer" userData={{ layerKind: "spatial-fixtures" }}>
      {entities.map((entry) => (
        <EntityFixtureSet
          key={`${entry.entityRef.entityType}:${entry.entityRef.entityId}`}
          entityRef={entry.entityRef}
          entityWorldPosition={entry.entityWorldPosition}
          fixtures={entry.fixtures}
          onIntent={onIntent}
        />
      ))}
    </group>
  );
});
