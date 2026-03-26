/**
 * TopologyEditor.tsx — 3D drag-to-connect topology editor for agent communication links.
 *
 * Sub-AC 7d: Agent wiring & topology editor.
 *
 * Enables the user to:
 *   1. Enter topology edit mode (via HUD toggle or keyboard shortcut T)
 *   2. Drag from one agent's connector port to another to create a link
 *   3. Click an existing link to select it (showing sever/label controls)
 *   4. Press Delete or click ✕ to sever a selected link
 *   5. Reroute a link by dragging one of its endpoints
 *
 * Architecture:
 *   TopologyEditorLayer       — top-level scene group; mounts when edit mode is ON
 *   AgentConnectorPort        — glowing ring above each agent head; drag source/target
 *   TopologyLink3D            — animated curved tube for an existing link
 *   GhostArcBeam              — preview arc that follows the cursor during a drag
 *   TopologyDragCapturePlane  — invisible plane that captures pointer move/up during drag
 *
 * Interaction FSM:
 *   idle          : hovering over connector ports shows pulse highlight
 *   drag_started  : pointer down on port → pendingLink set in topology-store
 *   drag_active   : pointer move on capture plane → cursor position updated
 *   drag_complete : pointer up on target port → createLink()
 *   drag_cancelled: pointer up on capture plane (no target) → setPendingLink(null)
 *
 * Visual language (dark command-center palette):
 *   Port ring     — small hexagonal ring, role-coloured; pulses on hover
 *   Link beam     — QuadraticBezier TubeGeometry, type-coloured, animated opacity
 *   Ghost arc     — dashed/transparent arc from source port → cursor
 *   Selected link — bright highlight + wider tube + sever button HTML label
 *   Sync pending  — amber "⟳" badge on link when API write is in-flight
 *
 * All state changes pass through topology-store, which appends to the
 * append-only event log. This component is purely presentational — it
 * reads store state and dispatches store actions; it never writes events directly.
 *
 * Performance:
 *   - TubeGeometry disposed on unmount / link removal (useEffect cleanup)
 *   - Per-frame animations use direct Three.js mutation — no React state per frame
 *   - Connector ports are lightweight ring geometries (6 sides)
 *   - Ghost arc is rebuilt only when cursor position changes significantly (debounced)
 */

import {
  useRef,
  useMemo,
  useEffect,
  useCallback,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useTopologyStore, LINK_TYPE_COLOR, type TopologyLink } from "../store/topology-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { AgentRuntimeState } from "../store/agent-store.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Y offset above agent foot position for the connector port ring */
const PORT_Y_OFFSET = 1.10;

/** Radius of the connector port ring */
const PORT_RING_INNER = 0.090;
const PORT_RING_OUTER = 0.160;

/** Arc lift for bezier control point */
const ARC_LIFT = 0.55;

/** Tube geometry radial segments (low-poly) */
const TUBE_RADIAL_SEGS = 4;

/** Tube radius per link type (wider = higher bandwidth / priority) */
const TUBE_RADIUS: Record<string, number> = {
  direct:    0.018,
  delegated: 0.022,
  broadcast: 0.025,
  subscribe: 0.016,
};

/** Ghost arc tube radius */
const GHOST_TUBE_RADIUS = 0.014;

/** Render orders — drawn above all room/floor geometry */
const RO_LINK    = 990;
const RO_PORT    = 991;
const RO_GHOST   = 992;
const RO_SCAN    = 993;
const RO_LABEL   = 994;

/** Minimum cursor movement (world units) to rebuild ghost arc geometry */
const GHOST_REBUILD_THRESHOLD = 0.05;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a QuadraticBezierCurve3 between two world-space points with an arc lift */
function makeBezierCurve(
  from: THREE.Vector3Like,
  to:   THREE.Vector3Like,
  liftExtra = 0,
): THREE.QuadraticBezierCurve3 {
  const f = new THREE.Vector3(from.x, from.y, from.z);
  const t = new THREE.Vector3(to.x,   to.y,   to.z);
  const mid = new THREE.Vector3(
    (from.x + to.x) * 0.5,
    Math.max(from.y, to.y) + ARC_LIFT + liftExtra,
    (from.z + to.z) * 0.5,
  );
  return new THREE.QuadraticBezierCurve3(f, mid, t);
}

/** Build a TubeGeometry from a curve */
function makeTube(curve: THREE.QuadraticBezierCurve3, radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(curve, 20, radius, TUBE_RADIAL_SEGS, false);
}

// ── AgentConnectorPort ─────────────────────────────────────────────────────────

interface AgentConnectorPortProps {
  agent:         AgentRuntimeState;
  isEditMode:    boolean;
  isPendingSource: boolean;
  isPendingTarget: boolean;
  onDragStart:   (agentId: string, event: THREE.Event) => void;
  onDragEnd:     (agentId: string) => void;
}

/**
 * Glowing hexagonal ring rendered above an agent's head in topology edit mode.
 *
 * Acts as both drag source (pointer-down to start a new link) and
 * drop target (pointer-up to complete a link).
 */
function AgentConnectorPort({
  agent,
  isEditMode,
  isPendingSource,
  isPendingTarget,
  onDragStart,
  onDragEnd,
}: AgentConnectorPortProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.MeshBasicMaterial>(null);

  // Determine ring color: source = bright amber, target = bright green, idle = role color
  const roleColor = agent.def.visual?.color ?? "#40C4FF";
  const ringColor = isPendingSource
    ? "#FF9100"  // amber — actively dragging from this port
    : isPendingTarget
    ? "#00ff88"  // green — valid drop target highlighted
    : roleColor;

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) return;
    const t = clock.getElapsedTime();

    if (isPendingSource || isPendingTarget) {
      // Urgent pulse when active
      meshRef.current.scale.setScalar(1.0 + Math.sin(t * 8) * 0.18);
      matRef.current.opacity = 0.85 + Math.sin(t * 8) * 0.15;
    } else {
      // Gentle idle pulse in edit mode
      meshRef.current.scale.setScalar(1.0 + Math.sin(t * 2.5) * 0.06);
      matRef.current.opacity = 0.55 + Math.sin(t * 2.5) * 0.20;
    }

    matRef.current.color.setStyle(ringColor);
  });

  if (!isEditMode) return null;

  const px = agent.worldPosition.x;
  const py = agent.worldPosition.y + PORT_Y_OFFSET;
  const pz = agent.worldPosition.z;

  return (
    <group
      position={[px, py, pz]}
      name={`port-${agent.def.agentId}`}
    >
      {/* Horizontal hexagonal port ring */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RO_PORT}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragStart(agent.def.agentId, e as unknown as THREE.Event);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onDragEnd(agent.def.agentId);
        }}
      >
        <ringGeometry args={[PORT_RING_INNER, PORT_RING_OUTER, 6]} />
        <meshBasicMaterial
          ref={matRef}
          color={ringColor}
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Centre dot */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RO_PORT + 1}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragStart(agent.def.agentId, e as unknown as THREE.Event);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onDragEnd(agent.def.agentId);
        }}
      >
        <circleGeometry args={[PORT_RING_INNER * 0.55, 6]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={0.80}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Agent ID label shown in edit mode */}
      <Html
        center
        distanceFactor={16}
        position={[0, 0.22, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background:    "rgba(8,8,18,0.80)",
            border:        `1px solid ${ringColor}55`,
            borderRadius:  2,
            padding:       "1px 5px",
            fontSize:      "6px",
            fontFamily:    "'JetBrains Mono', monospace",
            color:         ringColor,
            letterSpacing: "0.08em",
            whiteSpace:    "nowrap",
            userSelect:    "none",
          }}
        >
          {agent.def.agentId.length > 12
            ? `${agent.def.agentId.slice(0, 12)}\u2026`
            : agent.def.agentId}
        </div>
      </Html>
    </group>
  );
}

// ── TopologyLinkBeam ───────────────────────────────────────────────────────────

interface TopologyLinkBeamProps {
  link:         TopologyLink;
  fromPos:      THREE.Vector3Like;
  toPos:        THREE.Vector3Like;
  isSelected:   boolean;
  syncStatus:   "pending" | "synced" | "error" | undefined;
  onSelect:     (linkId: string) => void;
  onSever:      (linkId: string) => void;
}

/**
 * Animated curved tube beam representing a single agent-to-agent communication link.
 *
 * Visual states:
 *   Normal   — coloured tube at base opacity, scan pulse on "direct" links
 *   Selected — wider tube, brighter colour, sever button overlay
 *   Pending  — amber glow (API write in-flight)
 *   Error    — red flicker (API write failed)
 */
function TopologyLinkBeam({
  link,
  fromPos,
  toPos,
  isSelected,
  syncStatus,
  onSelect,
  onSever,
}: TopologyLinkBeamProps) {
  const typeColor    = LINK_TYPE_COLOR[link.linkType] ?? "#40C4FF";
  const displayColor = syncStatus === "error"   ? "#ff4444"
                     : syncStatus === "pending"  ? "#FF9100"
                     : typeColor;

  const tubeRadius = (isSelected ? 1.6 : 1.0) * (TUBE_RADIUS[link.linkType] ?? 0.018);

  // Stable material instances — mutated in useFrame for animation
  const tubeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       displayColor,
    transparent: true,
    opacity:     isSelected ? 0.70 : 0.38,
    depthTest:   false,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    color:       displayColor,
    transparent: true,
    opacity:     isSelected ? 0.90 : 0.55,
    depthTest:   false,
    depthWrite:  false,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { tubeMat.dispose(); lineMat.dispose(); }, [tubeMat, lineMat]);

  // Curve — rebuilt when positions change
  const curve = useMemo(
    () => makeBezierCurve(fromPos, toPos, isSelected ? 0.15 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromPos.x, fromPos.y, fromPos.z, toPos.x, toPos.y, toPos.z, isSelected],
  );

  const tubeGeo = useMemo(() => makeTube(curve, tubeRadius), [curve, tubeRadius]);
  const lineGeo = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
    [curve],
  );

  useEffect(() => () => { tubeGeo.dispose(); lineGeo.dispose(); }, [tubeGeo, lineGeo]);

  // Stable Three.js objects — geometry swapped imperatively
  const tubeObj = useMemo(() => {
    const obj = new THREE.Mesh(undefined, tubeMat);
    obj.renderOrder = RO_LINK;
    return obj;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lineObj = useMemo(() => {
    const obj = new THREE.Line(undefined, lineMat);
    obj.renderOrder = RO_LINK;
    return obj;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach geometry
  useEffect(() => { tubeObj.geometry = tubeGeo; }, [tubeObj, tubeGeo]);
  useEffect(() => { lineObj.geometry = lineGeo; }, [lineObj, lineGeo]);

  // Sync colour / opacity when state changes
  useEffect(() => {
    tubeMat.color.setStyle(displayColor);
    lineMat.color.setStyle(displayColor);
    tubeMat.opacity = isSelected ? 0.70 : syncStatus === "pending" ? 0.50 : 0.38;
    lineMat.opacity = isSelected ? 0.90 : syncStatus === "pending" ? 0.65 : 0.55;
  }, [tubeMat, lineMat, displayColor, isSelected, syncStatus]);

  // Scan pulse ref — active on "direct" links and selected links
  const scanRef  = useRef<THREE.Mesh>(null);
  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null);
  curveRef.current = curve;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (syncStatus === "error") {
      // Flicker to signal error
      tubeMat.opacity = 0.15 + Math.abs(Math.sin(t * 6)) * 0.55;
      lineMat.opacity = 0.20 + Math.abs(Math.sin(t * 6)) * 0.60;
    } else if (syncStatus === "pending") {
      // Amber pulse
      tubeMat.opacity = 0.35 + Math.sin(t * 3.5) * 0.20;
      lineMat.opacity = 0.50 + Math.sin(t * 3.5) * 0.20;
    } else if (isSelected) {
      // Bright selected pulse
      tubeMat.opacity = 0.55 + Math.sin(t * 4.0) * 0.20;
      lineMat.opacity = 0.75 + Math.sin(t * 4.0) * 0.15;
    } else {
      // Normal idle
      tubeMat.opacity = 0.25 + Math.sin(t * 1.8) * 0.12;
      lineMat.opacity = 0.42 + Math.sin(t * 1.8) * 0.12;
    }

    // Scan pulse traversal
    if (scanRef.current && curveRef.current && (link.linkType === "direct" || isSelected)) {
      const tNorm = (t * 0.45) % 1.0;
      const pt    = curveRef.current.getPoint(tNorm);
      scanRef.current.position.set(pt.x, pt.y, pt.z);
      const fade = Math.sin(tNorm * Math.PI);
      (scanRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
    }
  });

  // Midpoint for click hit-test and label position
  const midPoint = useMemo(() => curve.getPoint(0.5), [curve]);

  return (
    <group name={`topology-link-${link.id}`}>
      {/* Tube beam */}
      <primitive object={tubeObj} />

      {/* Primary arc line */}
      <primitive object={lineObj} />

      {/* Scan pulse sphere */}
      <mesh ref={scanRef} renderOrder={RO_SCAN}>
        <sphereGeometry args={[0.025, 4, 2]} />
        <meshBasicMaterial
          color={displayColor}
          transparent
          opacity={0.0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Invisible click-target tube — larger radius for easier selection */}
      <mesh
        renderOrder={RO_LINK}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(link.id);
        }}
      >
        <tubeGeometry args={[curve, 12, 0.065, 4, false]} />
        <meshBasicMaterial
          transparent
          opacity={0.0}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Label + sever button shown when selected */}
      {isSelected && (
        <Html
          center
          distanceFactor={12}
          position={[midPoint.x, midPoint.y + 0.25, midPoint.z]}
          renderOrder={RO_LABEL}
        >
          <div
            style={{
              background:    "rgba(8,8,18,0.92)",
              border:        `1px solid ${typeColor}88`,
              borderRadius:  3,
              padding:       "3px 7px",
              display:       "flex",
              alignItems:    "center",
              gap:           6,
              backdropFilter: "blur(4px)",
              boxShadow:     `0 0 8px ${typeColor}40`,
              userSelect:    "none",
            }}
          >
            {/* Type badge */}
            <span
              style={{
                fontSize:      "7px",
                fontFamily:    "'JetBrains Mono', monospace",
                color:         typeColor,
                fontWeight:    700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {link.linkType}
            </span>

            {/* Label (if set) */}
            {link.label && (
              <span
                style={{
                  fontSize:   "6px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color:      "#8888cc",
                  maxWidth:   60,
                  overflow:   "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}
              >
                {link.label}
              </span>
            )}

            {/* Sync status indicator */}
            {syncStatus === "pending" && (
              <span style={{ color: "#FF9100", fontSize: "8px" }}>⟳</span>
            )}
            {syncStatus === "error" && (
              <span style={{ color: "#ff4444", fontSize: "8px" }} title="Sync failed">⚠</span>
            )}

            {/* Sever button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSever(link.id);
              }}
              style={{
                background:   "rgba(255,50,50,0.18)",
                border:       "1px solid #ff444488",
                borderRadius: 2,
                color:        "#ff7777",
                fontSize:     "8px",
                padding:      "1px 5px",
                cursor:       "pointer",
                fontFamily:   "'JetBrains Mono', monospace",
                letterSpacing: "0.05em",
              }}
              title="Sever link"
            >
              ✕ SEVER
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── GhostArcBeam ───────────────────────────────────────────────────────────────

interface GhostArcBeamProps {
  fromPos:   { x: number; y: number; z: number };
  cursorPos: { x: number; y: number; z: number };
  linkType:  string;
}

/**
 * Semi-transparent arc that follows the cursor during a drag-to-connect gesture.
 * Provides immediate visual feedback about the proposed connection path.
 *
 * Renders as a dashed-like pulsing line from the source port → cursor position.
 */
function GhostArcBeam({ fromPos, cursorPos, linkType }: GhostArcBeamProps) {
  const typeColor = (LINK_TYPE_COLOR as Record<string, string>)[linkType] ?? "#40C4FF";

  const ghostMat = useMemo(() => new THREE.LineBasicMaterial({
    color:       typeColor,
    transparent: true,
    opacity:     0.50,
    depthTest:   false,
    depthWrite:  false,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const ghostTubeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       typeColor,
    transparent: true,
    opacity:     0.18,
    depthTest:   false,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { ghostMat.dispose(); ghostTubeMat.dispose(); }, [ghostMat, ghostTubeMat]);

  const curve = useMemo(
    () => makeBezierCurve(
      { x: fromPos.x,   y: fromPos.y + PORT_Y_OFFSET,   z: fromPos.z },
      { x: cursorPos.x, y: cursorPos.y + 0.05, z: cursorPos.z },
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromPos.x, fromPos.y, fromPos.z, cursorPos.x, cursorPos.y, cursorPos.z],
  );

  const lineGeo = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
    [curve],
  );
  const tubeGeo = useMemo(() => makeTube(curve, GHOST_TUBE_RADIUS), [curve]);

  useEffect(() => () => { lineGeo.dispose(); tubeGeo.dispose(); }, [lineGeo, tubeGeo]);

  const lineObj = useMemo(() => {
    const o = new THREE.Line(undefined, ghostMat);
    o.renderOrder = RO_GHOST;
    return o;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tubeObj = useMemo(() => {
    const o = new THREE.Mesh(undefined, ghostTubeMat);
    o.renderOrder = RO_GHOST;
    return o;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { lineObj.geometry = lineGeo; }, [lineObj, lineGeo]);
  useEffect(() => { tubeObj.geometry = tubeGeo; }, [tubeObj, tubeGeo]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Pulsing "searching" animation
    ghostMat.opacity     = 0.30 + Math.sin(t * 5.0) * 0.25;
    ghostTubeMat.opacity = 0.10 + Math.sin(t * 5.0) * 0.10;
    ghostMat.color.setStyle(typeColor);
    ghostTubeMat.color.setStyle(typeColor);
  });

  return (
    <group name="ghost-arc-beam">
      <primitive object={lineObj} />
      <primitive object={tubeObj} />
      {/* Arrow tip at cursor */}
      <mesh
        position={[cursorPos.x, cursorPos.y + 0.05, cursorPos.z]}
        renderOrder={RO_GHOST + 1}
      >
        <octahedronGeometry args={[0.06, 0]} />
        <meshBasicMaterial
          color={typeColor}
          transparent
          opacity={0.65}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ── TopologyDragCapturePlane ───────────────────────────────────────────────────

interface DragCapturePlaneProps {
  active:          boolean;
  onPointerMove:   (worldPos: THREE.Vector3, agentId: string | null) => void;
  onPointerUp:     (agentId: string | null) => void;
  agentPositions:  Array<{ id: string; pos: THREE.Vector3 }>;
}

/**
 * Invisible ground-level plane that captures pointer events during a drag gesture.
 *
 * While a drag is active, this plane sits above all other scene geometry
 * (in terms of renderOrder) so that pointer move events are reliably captured
 * even when the cursor passes over other scene objects.
 *
 * If the cursor is within SNAP_RADIUS world-units of an agent's connector port,
 * the agentId of that agent is passed to onPointerMove / onPointerUp so the
 * caller can highlight the potential target and complete the link.
 */
const SNAP_RADIUS = 0.80;

function TopologyDragCapturePlane({
  active,
  onPointerMove,
  onPointerUp,
  agentPositions,
}: DragCapturePlaneProps) {
  if (!active) return null;

  function findNearestAgent(worldPos: THREE.Vector3): string | null {
    let nearest: string | null = null;
    let nearestDist = SNAP_RADIUS;
    for (const { id, pos } of agentPositions) {
      const dx = worldPos.x - pos.x;
      const dz = worldPos.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest     = id;
      }
    }
    return nearest;
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[6, 0.02, 3]}
      renderOrder={RO_GHOST - 1}
      onPointerMove={(e) => {
        e.stopPropagation();
        const wp = e.point;
        const nearAgent = findNearestAgent(wp);
        onPointerMove(wp, nearAgent);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const wp = e.point;
        const nearAgent = findNearestAgent(wp);
        onPointerUp(nearAgent);
      }}
    >
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial transparent opacity={0.0} depthWrite={false} />
    </mesh>
  );
}

// ── TopologyEditorLayer ────────────────────────────────────────────────────────

/**
 * Top-level scene component for the topology editor.
 *
 * Mounted inside CommandCenterScene (both hierarchy and legacy paths).
 * Renders:
 *   1. All existing topology links as animated beams
 *   2. Connector ports above each agent (edit mode only)
 *   3. Ghost arc during a drag gesture
 *   4. Drag capture plane (edit mode only, during drag)
 *
 * All interaction state is managed in topology-store.
 * No local state is kept here — everything derives from the store.
 */
export function TopologyEditorLayer() {
  const links         = useTopologyStore((s) => s.links);
  const editMode      = useTopologyStore((s) => s.editMode);
  const pendingLink   = useTopologyStore((s) => s.pendingLink);
  const selectedLinkId = useTopologyStore((s) => s.selectedLinkId);
  const defaultLinkType = useTopologyStore((s) => s.defaultLinkType);
  const syncStatus    = useTopologyStore((s) => s.syncStatus);

  const setPendingLink       = useTopologyStore((s) => s.setPendingLink);
  const updatePendingCursor  = useTopologyStore((s) => s.updatePendingCursor);
  const createLink           = useTopologyStore((s) => s.createLink);
  const removeLink           = useTopologyStore((s) => s.removeLink);
  const selectLink           = useTopologyStore((s) => s.selectLink);

  const agents = useAgentStore((s) => s.agents);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((agentId: string, _e: THREE.Event) => {
    setPendingLink({
      sourceAgentId:  agentId,
      cursorPosition: agents[agentId]?.worldPosition ?? { x: 0, y: 0, z: 0 },
      hoverTargetId:  null,
      linkType:       defaultLinkType,
    });
    // Deselect any selected link when starting a new drag
    selectLink(null);
  }, [agents, defaultLinkType, setPendingLink, selectLink]);

  const handleDragEnd = useCallback((targetAgentId: string) => {
    if (!pendingLink) return;
    const { sourceAgentId, linkType } = pendingLink;

    if (targetAgentId && targetAgentId !== sourceAgentId) {
      createLink(sourceAgentId, targetAgentId, linkType);
    }
    setPendingLink(null);
  }, [pendingLink, createLink, setPendingLink]);

  const handleCapturePointerMove = useCallback(
    (worldPos: THREE.Vector3, nearAgentId: string | null) => {
      updatePendingCursor(
        { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        nearAgentId,
      );
    },
    [updatePendingCursor],
  );

  const handleCapturePointerUp = useCallback(
    (nearAgentId: string | null) => {
      if (!pendingLink) return;
      if (nearAgentId && nearAgentId !== pendingLink.sourceAgentId) {
        createLink(pendingLink.sourceAgentId, nearAgentId, pendingLink.linkType);
      }
      setPendingLink(null);
    },
    [pendingLink, createLink, setPendingLink],
  );

  // ── Agent positions for drag-cap snap detection ────────────────────────────

  const agentPositions = useMemo(
    () =>
      Object.values(agents).map((a) => ({
        id:  a.def.agentId,
        pos: new THREE.Vector3(
          a.worldPosition.x,
          a.worldPosition.y,
          a.worldPosition.z,
        ),
      })),
    [agents],
  );

  // ── Click-outside to deselect ──────────────────────────────────────────────

  const { gl } = useThree();
  useEffect(() => {
    if (!selectedLinkId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedLinkId) removeLink(selectedLinkId);
      }
      if (e.key === "Escape") selectLink(null);
    }
    gl.domElement.parentElement?.addEventListener("keydown", onKeyDown);
    return () => gl.domElement.parentElement?.removeEventListener("keydown", onKeyDown);
  }, [selectedLinkId, removeLink, selectLink, gl]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const linkList = useMemo(() => Object.values(links), [links]);

  return (
    <group name="topology-editor-layer">
      {/* Drag capture plane — active only when a drag is in progress */}
      <TopologyDragCapturePlane
        active={editMode && pendingLink !== null}
        onPointerMove={handleCapturePointerMove}
        onPointerUp={handleCapturePointerUp}
        agentPositions={agentPositions}
      />

      {/* ── Existing links ──────────────────────────────────────────────────── */}
      {linkList.map((link) => {
        const src = agents[link.sourceAgentId];
        const tgt = agents[link.targetAgentId];
        if (!src || !tgt) return null;

        // Position connectors at PORT_Y_OFFSET height for both ends
        const fromPos = new THREE.Vector3(
          src.worldPosition.x,
          src.worldPosition.y + PORT_Y_OFFSET,
          src.worldPosition.z,
        );
        const toPos = new THREE.Vector3(
          tgt.worldPosition.x,
          tgt.worldPosition.y + PORT_Y_OFFSET,
          tgt.worldPosition.z,
        );

        return (
          <TopologyLinkBeam
            key={link.id}
            link={link}
            fromPos={fromPos}
            toPos={toPos}
            isSelected={link.id === selectedLinkId}
            syncStatus={syncStatus[link.id]}
            onSelect={(id) => selectLink(id === selectedLinkId ? null : id)}
            onSever={removeLink}
          />
        );
      })}

      {/* ── Connector ports (edit mode only) ──────────────────────────────── */}
      {editMode &&
        Object.values(agents).map((agent) => (
          <AgentConnectorPort
            key={agent.def.agentId}
            agent={agent}
            isEditMode={editMode}
            isPendingSource={pendingLink?.sourceAgentId === agent.def.agentId}
            isPendingTarget={pendingLink?.hoverTargetId  === agent.def.agentId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}

      {/* ── Ghost arc beam (drag in progress) ─────────────────────────────── */}
      {editMode && pendingLink && (
        <GhostArcBeam
          fromPos={agents[pendingLink.sourceAgentId]?.worldPosition ?? { x: 0, y: 0, z: 0 }}
          cursorPos={pendingLink.cursorPosition}
          linkType={pendingLink.linkType}
        />
      )}
    </group>
  );
}

// ── TopologyEditModeIndicator ──────────────────────────────────────────────────

/**
 * Diegetic 3D indicator shown when topology edit mode is active.
 * Floating badge in world-space (not an HTML overlay) confirming mode state.
 */
export function TopologyEditModeIndicator() {
  const editMode = useTopologyStore((s) => s.editMode);
  const meshRef  = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.rotation.y = t * 0.5;
    meshRef.current.scale.setScalar(0.9 + Math.sin(t * 3) * 0.1);
  });

  if (!editMode) return null;

  return (
    <group position={[13.5, 4.5, 3]}>
      {/* Spinning diamond indicator */}
      <mesh ref={meshRef} renderOrder={RO_LABEL}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial
          color="#FF9100"
          transparent
          opacity={0.75}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Label */}
      <Html center distanceFactor={12} position={[0, 0.35, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background:    "rgba(8,8,18,0.90)",
            border:        "1px solid #FF910088",
            borderRadius:  3,
            padding:       "2px 6px",
            fontSize:      "7px",
            fontFamily:    "'JetBrains Mono', monospace",
            color:         "#FF9100",
            fontWeight:    700,
            letterSpacing: "0.12em",
            whiteSpace:    "nowrap",
          }}
        >
          WIRING MODE
        </div>
      </Html>
    </group>
  );
}

// ── TopologyLinkCountBadge ─────────────────────────────────────────────────────

/**
 * Small diegetic badge on each agent showing link count.
 * Rendered as a world-space HTML label. Only visible when editMode is OFF
 * (in edit mode, the full connector port replaces this).
 */
export function AgentTopologyBadge({ agentId }: { agentId: string }) {
  const links    = useTopologyStore((s) => s.links);
  const editMode = useTopologyStore((s) => s.editMode);
  const agent    = useAgentStore((s) => s.agents[agentId]);

  const outgoing = useMemo(
    () => Object.values(links).filter((l) => l.sourceAgentId === agentId).length,
    [links, agentId],
  );
  const incoming = useMemo(
    () => Object.values(links).filter((l) => l.targetAgentId === agentId).length,
    [links, agentId],
  );

  if (!agent || editMode || (outgoing === 0 && incoming === 0)) return null;

  const total = outgoing + incoming;
  const color = total > 3 ? "#FF9100" : total > 1 ? "#40C4FF" : "#8888cc";

  return (
    <Html
      center
      distanceFactor={14}
      position={[
        agent.worldPosition.x,
        agent.worldPosition.y + PORT_Y_OFFSET + 0.18,
        agent.worldPosition.z,
      ]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background:    "rgba(8,8,18,0.82)",
          border:        `1px solid ${color}55`,
          borderRadius:  2,
          padding:       "1px 4px",
          fontSize:      "6px",
          fontFamily:    "'JetBrains Mono', monospace",
          color,
          letterSpacing: "0.06em",
          whiteSpace:    "nowrap",
        }}
      >
        ↑{outgoing} ↓{incoming}
      </div>
    </Html>
  );
}

// ── useTopologyKeyboardShortcuts ───────────────────────────────────────────────

/**
 * Keyboard shortcuts for the topology editor.
 * T — toggle edit mode
 * Escape — exit edit mode / cancel drag
 * Delete/Backspace — sever selected link
 *
 * Called from App.tsx (headless, no render output).
 */
export function useTopologyKeyboardShortcuts() {
  const setEditMode  = useTopologyStore((s) => s.setEditMode);
  const editMode     = useTopologyStore((s) => s.editMode);
  const selectedLinkId = useTopologyStore((s) => s.selectedLinkId);
  const removeLink   = useTopologyStore((s) => s.removeLink);
  const selectLink   = useTopologyStore((s) => s.selectLink);
  const setPendingLink = useTopologyStore((s) => s.setPendingLink);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore keystrokes in input fields
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "t" || e.key === "T") {
        setEditMode(!editMode);
      } else if (e.key === "Escape") {
        if (editMode) {
          // Cancel pending drag first, then exit mode
          const pending = useTopologyStore.getState().pendingLink;
          if (pending) {
            setPendingLink(null);
          } else {
            setEditMode(false);
          }
        }
        selectLink(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedLinkId) {
        removeLink(selectedLinkId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode, selectedLinkId, setEditMode, removeLink, selectLink, setPendingLink]);
}
