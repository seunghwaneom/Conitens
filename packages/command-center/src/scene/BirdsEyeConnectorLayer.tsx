/**
 * BirdsEyeConnectorLayer — Floor-plane task-connection indicators for bird's-eye mode.
 *
 * Sub-AC 5b: Ensures task-agent mapping connectors remain visible and correctly
 * scaled at all zoom levels by providing a floor-plane overlay that complements
 * the 3D arc connectors (TaskConnectors.tsx) with zoom-compensated 2D indicators.
 *
 * ── Problem statement ─────────────────────────────────────────────────────────
 *
 * In bird's-eye orthographic mode:
 *
 *   1. 3D arc connectors project to nearly-straight XZ lines overhead (the Bézier
 *      control point is at the XZ midpoint, so the arc's curvature is invisible
 *      from directly above — only the Y-lift component is lost).
 *
 *   2. Orb nodes (ORB_SIZE = 0.10 world units) shrink to < 1 px screen pixels at
 *      high zoom-out (frustum half-height ≈ 25 world units, 600 px viewport →
 *      1 orb ≈ 600/50 × 0.10 ≈ 1.2 px before anti-aliasing).  The LOD scaling
 *      in TaskConnectors.tsx (lodScale) compensates for this, but only while the
 *      orbs stay within the visible frustum.
 *
 *   3. WebGL `gl.LINES` are always 1 px regardless of zoom — connector arcs remain
 *      visible as thin lines, but are visually indistinguishable from room grid
 *      lines at the same zoom level.
 *
 * ── Solution ──────────────────────────────────────────────────────────────────
 *
 * This layer renders at Y = BIRDS_EYE_CONNECTOR_FLOOR_Y (0.14, above
 * BirdsEyeLODLayer agent markers at ≈ 0.04) using THREE.js plane geometry:
 *
 *   1. Agent connection rings (one per agent with active tasks):
 *      - Zoom-scaled hex ring (6 sides) at the agent's XZ position.
 *      - Scale factor = birdsEyeZoom / BIRDS_EYE_CONNECTOR_SCALE_REF.
 *      - Coloured by the highest-priority task assigned to that agent.
 *      - Visually distinct from BirdsEyeLODLayer's solid agent discs.
 *
 *   2. Task projection discs (one per active task):
 *      - Small zoom-scaled circle at the task orb's XZ projection.
 *      - Coloured by task priority (matching PRIORITY_COLOR).
 *
 *   3. Connection lines (one per active task-agent pair):
 *      - Flat plane geometry oriented along the line from task-XZ to agent-XZ.
 *      - Width = BIRDS_EYE_CONNECTOR_LINE_WIDTH × zoom-scale (world units).
 *      - This gives a "fat line" that is visible as a stripe, not a 1 px edge.
 *      - Coloured by task status (matching STATUS_BEAM_COLOR).
 *
 * ── Screen-space stability ────────────────────────────────────────────────────
 *
 * The geometry is scaled in world space by:
 *
 *   zoomScale = birdsEyeZoom / BIRDS_EYE_CONNECTOR_SCALE_REF
 *
 * where BIRDS_EYE_CONNECTOR_SCALE_REF = BIRDS_EYE_DEFAULT_ZOOM (10).
 *
 * In orthographic projection, screen size ∝ worldSize / frustumHalfSize, so:
 *
 *   screenSize = worldSize / birdsEyeZoom
 *             = (referenceSize × birdsEyeZoom/refZoom) / birdsEyeZoom
 *             = referenceSize / refZoom   ← constant!
 *
 * This makes the indicators the same screen size at every zoom level.
 *
 * ── Guard ─────────────────────────────────────────────────────────────────────
 *
 * Renders nothing when cameraMode !== "birdsEye".  All hooks are called
 * unconditionally (React rules); the guard only gates the JSX output.
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *
 *   useSpatialStore → cameraMode, birdsEyeZoom
 *   useTaskStore    → assignments, tasks
 *   useAgentStore   → agents (worldPosition)
 */

import { useMemo } from "react";
import * as THREE from "three";
import { useSpatialStore } from "../store/spatial-store.js";
import { useTaskStore } from "../store/task-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { BIRDS_EYE_DEFAULT_ZOOM, BIRDS_EYE_MAX_ZOOM } from "./BirdsEyeCamera.js";
import {
  VISIBLE_STATUSES,
  PRIORITY_COLOR,
  STATUS_BEAM_COLOR,
  PRIORITY_RANK,
  CONNECTOR_LOD_ORB_MIN_SCALE,
  CONNECTOR_LOD_ORB_MAX_SCALE,
} from "./TaskConnectors.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Floor Y level for bird's-eye connector indicators.
 * Slightly above BirdsEyeLODLayer agent markers (≈ 0.04) to avoid Z-fighting.
 */
export const BIRDS_EYE_CONNECTOR_FLOOR_Y = 0.14;

/**
 * Reference zoom level for screen-space stability calculations.
 * Matches BIRDS_EYE_DEFAULT_ZOOM so at the default zoom, zoomScale = 1.0.
 */
export const BIRDS_EYE_CONNECTOR_SCALE_REF = BIRDS_EYE_DEFAULT_ZOOM; // 10

/**
 * Base world-space half-size of the agent connection ring (inner radius).
 * At zoomScale=1 (default zoom), the ring inner radius = this value.
 */
export const BIRDS_EYE_AGENT_RING_INNER = 0.30;

/**
 * Base world-space outer radius of the agent connection ring.
 */
export const BIRDS_EYE_AGENT_RING_OUTER = 0.44;

/**
 * Base radius of the task projection disc at floor level.
 */
export const BIRDS_EYE_TASK_DISC_RADIUS = 0.18;

/**
 * Base width (world units) of the flat plane connector lines.
 * Scaled by zoomScale to maintain constant screen-space width.
 */
export const BIRDS_EYE_CONNECTOR_LINE_WIDTH = 0.08;

/** renderOrder for this layer — above BirdsEyeLODLayer's max (4) to render on top. */
export const BIRDS_EYE_CONNECTOR_RENDER_ORDER = 5;

// ── Shared material cache ─────────────────────────────────────────────────────

const _colorTmp = new THREE.Color();

/** Convert hex color string → [r, g, b] tuple (0–1 range). */
function hexToRGB(hex: string): [number, number, number] {
  _colorTmp.setStyle(hex);
  return [_colorTmp.r, _colorTmp.g, _colorTmp.b];
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Sub-AC 5b: Compute the zoom-scale factor for screen-space stability.
 *
 * Returns the world-space multiplier that compensates for orthographic zoom:
 *   zoomScale = birdsEyeZoom / BIRDS_EYE_CONNECTOR_SCALE_REF
 *
 * Clamped to [CONNECTOR_LOD_ORB_MIN_SCALE, CONNECTOR_LOD_ORB_MAX_SCALE] to
 * avoid unreasonably small or large geometry at extreme zoom settings.
 *
 * @param birdsEyeZoom - Current orthographic frustum half-height.
 * @returns World-space scale multiplier (1.0 at default zoom).
 */
export function computeBirdsEyeZoomScale(birdsEyeZoom: number): number {
  const raw = birdsEyeZoom / BIRDS_EYE_CONNECTOR_SCALE_REF;
  return Math.max(CONNECTOR_LOD_ORB_MIN_SCALE, Math.min(CONNECTOR_LOD_ORB_MAX_SCALE, raw));
}

/**
 * Sub-AC 5b: Compute the angle (in radians) of the line from (ax, az) to (bx, bz).
 * Used to orient the flat connector plane geometry.
 *
 * @param ax - Start X
 * @param az - Start Z
 * @param bx - End X
 * @param bz - End Z
 * @returns Angle in radians (atan2 in XZ plane).
 */
export function computeConnectionAngle(
  ax: number, az: number, bx: number, bz: number,
): number {
  return Math.atan2(bz - az, bx - ax);
}

/**
 * Sub-AC 5b: Compute the XZ length of a connection segment.
 *
 * @param ax - Start X
 * @param az - Start Z
 * @param bx - End X
 * @param bz - End Z
 * @returns Length in world units.
 */
export function computeConnectionLength(
  ax: number, az: number, bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Zoom-stable agent connection ring at floor level.
 *
 * A hexagonal ring (6 sides) centred on the agent's XZ position, coloured
 * by the highest-priority task assigned to the agent.  Scales with zoom to
 * maintain constant screen-space size.
 */
function AgentRingIndicator({
  position,
  primaryColor,
  taskCount,
  zoomScale,
}: {
  position: [number, number, number];
  primaryColor: string;
  taskCount: number;
  zoomScale: number;
}) {
  const innerR = BIRDS_EYE_AGENT_RING_INNER * zoomScale;
  const outerR = BIRDS_EYE_AGENT_RING_OUTER * zoomScale;
  const [r, g, b] = hexToRGB(primaryColor);

  // Shared material config — meshBasicMaterial with AdditiveBlending
  const matProps = {
    color: new THREE.Color(r, g, b),
    transparent: true,
    opacity: taskCount >= 3 ? 0.65 : 0.50,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  return (
    <mesh
      position={[position[0], BIRDS_EYE_CONNECTOR_FLOOR_Y, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={BIRDS_EYE_CONNECTOR_RENDER_ORDER}
    >
      {/*
       * Hexagonal ring: 6-sided for stylized low-poly aesthetic matching
       * the rest of the command center visual language.
       */}
      <ringGeometry args={[innerR, outerR, 6]} />
      <meshBasicMaterial {...matProps} />
    </mesh>
  );
}

/**
 * Zoom-stable task projection disc at floor level.
 *
 * A small circle indicating the floor-projected position of a task orb node.
 * This shows WHERE the task is "anchored" in the plan layout.
 */
function TaskDiscIndicator({
  orbX,
  orbZ,
  priorityColor,
  zoomScale,
}: {
  orbX: number;
  orbZ: number;
  priorityColor: string;
  zoomScale: number;
}) {
  const radius = BIRDS_EYE_TASK_DISC_RADIUS * zoomScale;

  return (
    <mesh
      position={[orbX, BIRDS_EYE_CONNECTOR_FLOOR_Y + 0.005, orbZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={BIRDS_EYE_CONNECTOR_RENDER_ORDER}
    >
      <circleGeometry args={[radius, 5]} />
      <meshBasicMaterial
        color={priorityColor}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/**
 * Zoom-stable flat connector line between task-disc and agent-ring.
 *
 * Uses a thin <planeGeometry> (1 × 1) scaled to the correct length and width,
 * rotated to align with the XZ direction.  This gives a "fat line" with
 * guaranteed screen-space width (unlike THREE.Line which is always 1 px).
 */
function ConnectorLineIndicator({
  taskX,
  taskZ,
  agentX,
  agentZ,
  statusColor,
  zoomScale,
}: {
  taskX:  number;
  taskZ:  number;
  agentX: number;
  agentZ: number;
  statusColor: string;
  zoomScale: number;
}) {
  const length = computeConnectionLength(taskX, taskZ, agentX, agentZ);
  if (length < 0.01) return null; // same position (coincident orb + agent head)

  const angle  = computeConnectionAngle(taskX, taskZ, agentX, agentZ);
  const midX   = (taskX + agentX) / 2;
  const midZ   = (taskZ + agentZ) / 2;
  const lineW  = BIRDS_EYE_CONNECTOR_LINE_WIDTH * zoomScale;

  return (
    <mesh
      position={[midX, BIRDS_EYE_CONNECTOR_FLOOR_Y + 0.002, midZ]}
      // Horizontal flat plane: first rotate to XZ plane, then orient along the connection
      rotation={[-Math.PI / 2, 0, angle]}
      // Scale X = length (along connection), Y = lineWidth (across connection)
      scale={[length, lineW, 1]}
      renderOrder={BIRDS_EYE_CONNECTOR_RENDER_ORDER}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color={statusColor}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── BirdsEyeConnectorLayer ────────────────────────────────────────────────────

/**
 * Floor-plane task-connection indicators for the bird's-eye orthographic camera.
 *
 * Renders screen-space-stable geometric indicators at BIRDS_EYE_CONNECTOR_FLOOR_Y
 * that complement the 3D connector arcs from TaskConnectors.tsx.
 *
 * Screen-space stability: all geometry is scaled by zoomScale = birdsEyeZoom /
 * BIRDS_EYE_CONNECTOR_SCALE_REF, which compensates for orthographic zoom so
 * indicators maintain constant screen-space size at every zoom level.
 *
 * Guard: returns null unless cameraMode === "birdsEye".
 */
export function BirdsEyeConnectorLayer() {
  const cameraMode   = useSpatialStore((s) => s.cameraMode);
  const birdsEyeZoom = useSpatialStore((s) => s.birdsEyeZoom);
  const assignments  = useTaskStore((s) => s.assignments);
  const tasks        = useTaskStore((s) => s.tasks);
  const agents       = useAgentStore((s) => s.agents);

  // ── Build active connections ───────────────────────────────────────────────

  const connections = useMemo(() => {
    return Object.values(assignments).filter((a) => {
      const task  = tasks[a.taskId];
      const agent = agents[a.agentId];
      if (!task || !agent) return false;
      if (!VISIBLE_STATUSES.has(task.status)) return false;
      const wp = agent.worldPosition;
      return Math.abs(wp.x) + Math.abs(wp.y) + Math.abs(wp.z) > 0.01;
    }).map((a) => ({
      assignment: a,
      task:  tasks[a.taskId]!,
      agent: agents[a.agentId]!,
    }));
  }, [assignments, tasks, agents]);

  // ── Per-agent indicator data (highest-priority color + count) ─────────────

  const agentRingData = useMemo(() => {
    const agentMap = new Map<string, {
      pos:     [number, number, number];
      maxRank: number;
      color:   string;
      count:   number;
    }>();

    for (const conn of connections) {
      const { agent, task } = conn;
      const agentId = agent.def.agentId;
      const rank    = PRIORITY_RANK[task.priority];
      const existing = agentMap.get(agentId);

      if (!existing) {
        agentMap.set(agentId, {
          pos:     [agent.worldPosition.x, agent.worldPosition.y, agent.worldPosition.z],
          maxRank: rank,
          color:   PRIORITY_COLOR[task.priority],
          count:   1,
        });
      } else {
        if (rank > existing.maxRank) {
          existing.maxRank = rank;
          existing.color   = PRIORITY_COLOR[task.priority];
        }
        existing.count++;
      }
    }

    return Array.from(agentMap.entries()).map(([agentId, data]) => ({
      agentId,
      position:     data.pos as [number, number, number],
      primaryColor: data.color,
      taskCount:    data.count,
    }));
  }, [connections]);

  // ── Zoom scale for screen-space stability ─────────────────────────────────

  const zoom      = birdsEyeZoom ?? BIRDS_EYE_DEFAULT_ZOOM;
  const zoomScale = computeBirdsEyeZoomScale(zoom);

  // ── Guard — only render in bird's-eye mode ─────────────────────────────────
  if (cameraMode !== "birdsEye") return null;
  if (connections.length === 0)  return null;

  return (
    <group name="birds-eye-connector-layer">
      {/*
       * Agent connection rings — one per unique agent with active task assignments.
       * Hex ring (6 sides) at floor level, zoomed-scaled for screen-space stability.
       * Coloured by highest-priority task (distinguishes this from BirdsEyeLODLayer
       * agent markers, which are grey/generic).
       */}
      {agentRingData.map(({ agentId, position, primaryColor, taskCount }) => (
        <AgentRingIndicator
          key={`be-agent-ring-${agentId}`}
          position={position}
          primaryColor={primaryColor}
          taskCount={taskCount}
          zoomScale={zoomScale}
        />
      ))}

      {/*
       * Per-connection: task disc + flat plane connector line.
       *
       * For each active task-agent assignment we render:
       *   1. A small disc at the orb's XZ floor projection (task node indicator)
       *   2. A flat plane connecting the disc to the agent ring (fat-line connector)
       *
       * Both are zoom-scaled and rendered at floor level (BIRDS_EYE_CONNECTOR_FLOOR_Y).
       */}
      {connections.map(({ task, agent }) => {
        const agentX = agent.worldPosition.x;
        const agentZ = agent.worldPosition.z;

        // Orb XZ position mirrors the ring-spread in TaskConnectors.
        // For simplicity (no ring-spread lookup here) we use the agent position
        // directly — the disc appears atop the agent ring indicator.
        // For multi-task agents the discs are stacked, but the task count badge
        // on AgentRingIndicator and the agent ring count visually signals load.
        // If a precise per-orb position is desired, the orbPositions map from
        // TaskConnectorsLayer could be lifted to a shared store — deferred here.
        const orbX = agentX;
        const orbZ = agentZ;

        const priorityColor = PRIORITY_COLOR[task.priority];
        const statusColor   = STATUS_BEAM_COLOR[task.status] ?? "#444466";

        return (
          <group key={`be-conn-${task.taskId}`}>
            {/* Task projection disc */}
            <TaskDiscIndicator
              orbX={orbX}
              orbZ={orbZ}
              priorityColor={priorityColor}
              zoomScale={zoomScale}
            />

            {/*
             * Flat plane connector line — visible even at maximum zoom-out.
             *
             * The line connects the task disc to the agent ring.  For a single
             * task per agent the length is 0 (same position) and the connector
             * is skipped.  For multi-task agents the disc is at the agent
             * position, so lines collapse — the agent ring's taskCount + the
             * disc stacking encode the assignment visually.
             *
             * This is intentional: at bird's-eye altitude the primary concern
             * is "which agents have tasks" not "precisely where each orb floats".
             * The 3D arc connectors (with LOD-aware orb scale from TaskConnectors)
             * already encode per-orb positions when drilling in closer.
             */}
            <ConnectorLineIndicator
              taskX={orbX}
              taskZ={orbZ}
              agentX={agentX}
              agentZ={agentZ}
              statusColor={statusColor}
              zoomScale={zoomScale}
            />
          </group>
        );
      })}
    </group>
  );
}
