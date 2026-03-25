/**
 * VirtualizedTaskOrbLayer.tsx — 3D virtualized task orb renderer.
 *
 * Sub-AC 2 (AC 15): Only materializes task orbs for the VISIBLE WINDOW
 * of a task_group.  Tasks outside the window have zero 3D geometry.
 *
 * ── Virtualization Contract ────────────────────────────────────────────────
 *
 * With hundreds of tasks in the task-store, naively rendering all of them as
 * 3D objects would create:
 *   - N octahedron meshes
 *   - N animated materials (pulsing in useFrame)
 *   - Up to 4 PointLights
 *   - N×M BatchedConnectorLines geometry entries
 *
 * VirtualizedTaskOrbLayer enforces the guarantee:
 *
 *   visibleTasks.length ≤ group.windowSize  (always ≤ 25, default 10)
 *
 * Only the `visibleTasks` from the TaskGroupWindow are turned into mesh nodes.
 * All other tasks in the store exist in memory but have NO 3D representation.
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *   VirtualizedTaskOrbLayer (this file)
 *     └─ reads  TaskGroupWindow  from task-group-store
 *     └─ renders one VirtualizedOrbNode per visibleTask
 *     └─ renders TaskGroupPaginationPanel (diegetic prev/next/label)
 *
 *   VirtualizedOrbNode
 *     └─ low-poly octahedron (same geometry as TaskNodeOrb in TaskConnectors)
 *     └─ priority-colored + status-animated
 *     └─ diegetic title badge (Html)
 *
 *   TaskGroupPaginationPanel
 *     └─ floating Html panel with window label + prev/next controls
 *     └─ anchored to the group's pinnedAgent position or a fixed offset
 *
 * ── Visual Language ────────────────────────────────────────────────────────
 *
 * Task orbs follow the same color conventions as TaskConnectors.tsx:
 *   Orb body  ← task priority  (critical=red, high=orange, normal=cyan, low=teal)
 *   Animation ← task status    (active=pulsing, blocked=flicker, assigned=steady)
 *
 * The pagination panel is rendered as a dark-theme HTML overlay anchored in
 * world space (via drei <Html>), maintaining the diegetic command-center
 * aesthetic while providing clear "1-10 of 47 ▶" affordances.
 *
 * ── Integration ───────────────────────────────────────────────────────────
 *
 * Usage from CommandCenterScene.tsx (or an agent panel component):
 *
 *   // Show the active tasks for agent "alpha", 10 at a time:
 *   <VirtualizedTaskOrbLayer
 *     groupId="group-agent-alpha"
 *     worldAnchorX={agentPos.x}
 *     worldAnchorY={agentPos.y + 2.0}
 *     worldAnchorZ={agentPos.z}
 *   />
 *
 * The groupId must first be created via useTaskGroupStore().createTaskGroup().
 * CommandCenterScene can create groups lazily (first use) or eagerly (on load).
 *
 * ── Record Transparency ───────────────────────────────────────────────────
 *
 * This component is PURELY PRESENTATIONAL.  It reads from task-group-store
 * and task-store; it never writes state directly.  All navigation actions
 * (nextPage/prevPage/gotoPage) are dispatched via task-group-store actions,
 * which append events to the group's event log for full replay.
 *
 * ── Performance notes ─────────────────────────────────────────────────────
 *
 * - Maximum React component instances created: windowSize (default 10)
 * - useFrame animation: O(windowSize) per frame (constant, never O(totalTasks))
 * - Html badges: one per visible orb (not per total task)
 * - No DOM nodes for non-visible tasks
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useTaskGroupStore } from "../store/task-group-store.js";
import type { TaskGroupWindow } from "../store/task-group-store.js";
import type { TaskRecord, TaskPriority, TaskStatus } from "../data/task-types.js";
import {
  ORB_FLOAT_Y,
  ORB_SPREAD_RADIUS,
  ORB_SIZE,
  RENDER_ORDER_ORB,
  PRIORITY_COLOR,
  STATUS_BEAM_COLOR,
} from "./TaskConnectors.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Horizontal spacing between task orbs in a row when the group panel
 * renders a compact horizontal strip (used when windowSize ≤ 5).
 * Exported so tests can verify grid geometry without coupling to a magic number.
 */
export const ORB_ROW_SPACING = 0.55;

/**
 * Grid layout: columns per row when windowSize > 5.
 * Orbs are arranged in a COLS×ROWS grid above the panel anchor.
 */
const GRID_COLS = 5;

/**
 * Vertical row spacing in the grid layout.
 */
const GRID_ROW_Y = 0.65;

/**
 * Y offset from worldAnchorY to the first row of orbs.
 */
const ORB_PANEL_Y_OFFSET = 0.30;

/**
 * Render order for the pagination panel background — between scene geometry
 * and task orbs so it's always visible but doesn't occlude orbs.
 */
const RENDER_ORDER_PANEL = 996;

// ── Color helpers (mirrors TaskConnectors.tsx) ────────────────────────────────

function priorityColorHex(priority: TaskPriority): string {
  return PRIORITY_COLOR[priority] ?? "#40C4FF";
}

function statusColorHex(status: TaskStatus): string {
  return STATUS_BEAM_COLOR[status] ?? "#444466";
}

function isActiveStatus(status: TaskStatus): boolean {
  return status === "active" || status === "review";
}

function isBlockedStatus(status: TaskStatus): boolean {
  return status === "blocked";
}

// ── Orb position computation ───────────────────────────────────────────────────

/**
 * Compute world-space positions for a window of task orbs.
 *
 * Layout strategy:
 *   ≤ 5 tasks → single horizontal row centered on the anchor
 *   > 5 tasks → grid (GRID_COLS wide) with rows stacked upward
 *
 * This is a PURE function — no Three.js, no React, fully testable.
 *
 * @param tasks      - The visible task window (≤ windowSize items).
 * @param anchorX    - World X of the panel anchor.
 * @param anchorY    - World Y of the panel anchor.
 * @param anchorZ    - World Z of the panel anchor.
 * @returns          Map of taskId → [worldX, worldY, worldZ].
 */
export function computeVirtualizedOrbPositions(
  tasks: Pick<TaskRecord, "taskId">[],
  anchorX: number,
  anchorY: number,
  anchorZ: number,
): Record<string, readonly [number, number, number]> {
  const n = tasks.length;
  if (n === 0) return {};

  const positions: Record<string, readonly [number, number, number]> = {};

  if (n <= GRID_COLS) {
    // Single row — center the strip on the anchor
    const totalWidth = (n - 1) * ORB_ROW_SPACING;
    const startX     = anchorX - totalWidth / 2;
    for (let i = 0; i < n; i++) {
      positions[tasks[i].taskId] = [
        startX + i * ORB_ROW_SPACING,
        anchorY + ORB_PANEL_Y_OFFSET + ORB_FLOAT_Y * 0.4,
        anchorZ,
      ];
    }
  } else {
    // Grid: fill cols left-to-right, rows bottom-to-top
    const totalCols    = Math.min(n, GRID_COLS);
    const totalRows    = Math.ceil(n / GRID_COLS);
    const totalWidth   = (totalCols - 1) * ORB_ROW_SPACING;
    const startX       = anchorX - totalWidth / 2;
    const startY       = anchorY + ORB_PANEL_Y_OFFSET + ORB_FLOAT_Y * 0.4;

    for (let i = 0; i < n; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      positions[tasks[i].taskId] = [
        startX + col * ORB_ROW_SPACING,
        startY + (totalRows - 1 - row) * GRID_ROW_Y,
        anchorZ,
      ];
    }
  }

  return positions;
}

// ── VirtualizedOrbNode ─────────────────────────────────────────────────────────

interface VirtualizedOrbNodeProps {
  task: TaskRecord;
  position: readonly [number, number, number];
  showBadge?: boolean;
}

/**
 * A single low-poly task orb for the virtualized layer.
 *
 * Shares the same octahedron geometry and color conventions as TaskNodeOrb
 * in TaskConnectors.tsx but is optimized for the windowed/paginated context:
 *   - No PointLight (the pagination layer is not spatially attached to agents)
 *   - No connector beam (group panels are not tied to a specific agent position)
 *   - Compact animation (single pulsing scale, no scan pulse)
 *
 * This deliberately lighter implementation keeps the window-level rendering
 * budget low.  For connector-level rendering (where spatial relationship to
 * agents matters), use TaskConnectors.tsx.
 */
function VirtualizedOrbNode({
  task,
  position,
  showBadge = true,
}: VirtualizedOrbNodeProps) {
  const meshRef   = useRef<THREE.Mesh>(null);
  const ringRef   = useRef<THREE.Mesh>(null);

  const priorityColor = priorityColorHex(task.priority);
  const beamColor     = statusColorHex(task.status);
  const isActive      = isActiveStatus(task.status);
  const isBlocked     = isBlockedStatus(task.status);
  const isCritical    = task.priority === "critical";
  const isHighPri     = task.priority === "critical" || task.priority === "high";

  // Per-frame animation — runs on the GPU-scheduled frame, never setState
  const timeRef = useRef(Math.random() * Math.PI * 2); // random phase per orb
  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;
    if (!meshRef.current) return;

    let scale = 1.0;

    if (isActive) {
      // Smooth pulse: scale 0.88 ↔ 1.12
      scale = 1.0 + Math.sin(t * 2.2) * 0.12;
    } else if (isBlocked) {
      // Nervous flicker: irregular amplitude
      scale = 1.0 + (Math.sin(t * 4.5) * 0.08 + Math.sin(t * 11.3) * 0.04);
    }

    meshRef.current.scale.setScalar(scale);

    if (ringRef.current) {
      // Glow ring counter-rotates slowly for visual interest
      ringRef.current.rotation.z += delta * (isActive ? 0.6 : 0.2);
    }
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      {/* Octahedron body — matches the low-poly stylized language */}
      <mesh
        ref={meshRef}
        renderOrder={RENDER_ORDER_ORB}
      >
        <octahedronGeometry args={[ORB_SIZE, 0]} />
        <meshStandardMaterial
          color={priorityColor}
          emissive={priorityColor}
          emissiveIntensity={isActive ? 1.0 : isCritical ? 0.7 : 0.4}
          metalness={0.3}
          roughness={0.5}
          transparent
          opacity={0.92}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Hexagonal glow ring */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER_ORB}
      >
        <ringGeometry args={[ORB_SIZE * 1.1, ORB_SIZE * 1.9, 6]} />
        <meshBasicMaterial
          color={priorityColor}
          transparent
          opacity={isActive ? 0.35 : 0.18}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Corona — critical / high priority only */}
      {isHighPri && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER_ORB - 1}
        >
          <ringGeometry args={[ORB_SIZE * 2.8, ORB_SIZE * 4.4, 6]} />
          <meshBasicMaterial
            color={priorityColor}
            transparent
            opacity={isCritical ? 0.28 : 0.15}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Diegetic title badge */}
      {showBadge && (
        <Html
          center
          distanceFactor={14}
          position={[0, ORB_SIZE + 0.13, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(8,8,18,0.90)",
              border: `1px solid ${priorityColor}${isCritical ? "99" : "50"}`,
              borderRadius: 2,
              padding: "1px 4px",
              display: "flex",
              alignItems: "center",
              gap: 3,
              backdropFilter: "blur(3px)",
              boxShadow: isCritical ? `0 0 6px ${priorityColor}60` : undefined,
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: beamColor,
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: "6px",
                color: priorityColor,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
                maxWidth: "60px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {task.title.length > 14
                ? `${task.title.slice(0, 14)}\u2026`
                : task.title}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── TaskGroupPaginationPanel ────────────────────────────────────────────────────

interface PaginationPanelProps {
  window: TaskGroupWindow;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Diegetic pagination panel anchored in world space.
 *
 * Renders below the orb grid as an Html overlay:
 *
 *   [group name]
 *   ◀  3–10 of 47  ▶
 *
 * Buttons dispatch nextPage/prevPage to the task-group-store.
 * Uses the dark command-center aesthetic (near-black bg, cyan accents).
 *
 * Rendered via drei <Html> so it maintains world-space position but
 * uses crisp 2D DOM rendering for text legibility.
 */
function TaskGroupPaginationPanel({
  window: win,
  anchorX,
  anchorY,
  anchorZ,
  onPrev,
  onNext,
}: PaginationPanelProps) {
  if (win.totalPages <= 1 && win.filteredCount === 0) return null;

  return (
    <Html
      center
      distanceFactor={18}
      position={[anchorX, anchorY - 0.15, anchorZ]}
      style={{ pointerEvents: "auto" }}
      renderOrder={RENDER_ORDER_PANEL}
    >
      <div
        style={{
          background:    "rgba(4,6,20,0.92)",
          border:        "1px solid rgba(64,196,255,0.30)",
          borderRadius:  4,
          padding:       "3px 7px",
          minWidth:      90,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           2,
          backdropFilter: "blur(4px)",
          boxShadow:     "0 0 8px rgba(64,196,255,0.12)",
          userSelect:    "none",
        }}
      >
        {/* Group name */}
        <div
          style={{
            fontSize:      "6px",
            color:         "rgba(64,196,255,0.70)",
            fontFamily:    "'JetBrains Mono', monospace",
            fontWeight:    700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            maxWidth:      80,
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
          }}
        >
          {win.groupName}
        </div>

        {/* Navigation row */}
        <div
          style={{
            display:     "flex",
            alignItems:  "center",
            gap:         4,
          }}
        >
          {/* Prev button */}
          <button
            onClick={onPrev}
            disabled={!win.hasPrev}
            style={{
              background:  "transparent",
              border:      "none",
              color:       win.hasPrev ? "#40C4FF" : "rgba(64,196,255,0.25)",
              cursor:      win.hasPrev ? "pointer" : "default",
              fontSize:    "9px",
              padding:     "0 2px",
              lineHeight:  1,
            }}
            title="Previous page"
          >
            ◀
          </button>

          {/* Window label */}
          <span
            style={{
              fontSize:      "6px",
              color:         "rgba(200,230,255,0.85)",
              fontFamily:    "'JetBrains Mono', monospace",
              letterSpacing: "0.04em",
              whiteSpace:    "nowrap",
            }}
          >
            {win.windowLabel}
          </span>

          {/* Next button */}
          <button
            onClick={onNext}
            disabled={!win.hasNext}
            style={{
              background:  "transparent",
              border:      "none",
              color:       win.hasNext ? "#40C4FF" : "rgba(64,196,255,0.25)",
              cursor:      win.hasNext ? "pointer" : "default",
              fontSize:    "9px",
              padding:     "0 2px",
              lineHeight:  1,
            }}
            title="Next page"
          >
            ▶
          </button>
        </div>
      </div>
    </Html>
  );
}

// ── VirtualizedTaskOrbLayer ────────────────────────────────────────────────────

export interface VirtualizedTaskOrbLayerProps {
  /**
   * The task group ID to render.
   * The group must exist in useTaskGroupStore before this component mounts.
   */
  groupId: string;

  /**
   * World-space X coordinate of the panel anchor.
   * The orb grid and pagination panel are centered on this point.
   */
  worldAnchorX: number;

  /**
   * World-space Y coordinate of the panel anchor (base of the orb grid).
   */
  worldAnchorY: number;

  /**
   * World-space Z coordinate of the panel anchor.
   */
  worldAnchorZ: number;

  /**
   * Whether to show diegetic title badges on each orb.
   * Defaults to true.  Set to false at 'low' quality.
   */
  showBadges?: boolean;
}

/**
 * Root component for the virtualized task-group orb layer.
 *
 * VIRTUALIZATION GUARANTEE:
 *   Regardless of how many tasks are in the store (could be hundreds),
 *   this component creates AT MOST `group.windowSize` Three.js mesh instances.
 *   Tasks outside the visible window have ZERO 3D representation.
 *
 * Navigation:
 *   The diegetic pagination panel dispatches nextPage/prevPage to the
 *   task-group-store, which emits events and updates currentPage.
 *   The React subscription (useTaskGroupStore selector) triggers a re-render,
 *   which materializes the NEW window's orbs and unmounts the old ones.
 *
 * Performance:
 *   Re-renders only when the group's currentPage, filter, or windowSize changes.
 *   useFrame animation runs on visible orbs only (O(windowSize), not O(N)).
 */
export function VirtualizedTaskOrbLayer({
  groupId,
  worldAnchorX,
  worldAnchorY,
  worldAnchorZ,
  showBadges = true,
}: VirtualizedTaskOrbLayerProps) {
  // ── Store subscriptions ──────────────────────────────────────────────────
  const nextPage = useTaskGroupStore((s) => s.nextPage);
  const prevPage = useTaskGroupStore((s) => s.prevPage);

  // getGroupWindow is called as a reactive selector so the layer re-renders
  // when the group's currentPage or filter changes (e.g. via prevPage/nextPage).
  // We read the FULL window object so any property change triggers re-render.
  const win: TaskGroupWindow = useTaskGroupStore(
    (s) => s.getGroupWindow(groupId),
  );

  // ── Orb positions (pure computation, memoized on window change) ──────────
  const positions = useMemo(
    () => computeVirtualizedOrbPositions(
      win.visibleTasks,
      worldAnchorX,
      worldAnchorY,
      worldAnchorZ,
    ),
    // Re-compute when the visible task IDs, anchor, or count changes.
    // We use a stable key derived from the task IDs to avoid unnecessary
    // recomputation when tasks update their metadata but not their position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      win.visibleTasks.map((t) => t.taskId).join(","),
      worldAnchorX,
      worldAnchorY,
      worldAnchorZ,
    ],
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (win.visibleTasks.length === 0 && win.filteredCount === 0) {
    return null;
  }

  return (
    <group name={`task-group-orbs-${groupId}`}>
      {/*
       * ── VIRTUALIZED ORB NODES ───────────────────────────────────────────
       * ONLY the visibleTasks window is rendered as 3D geometry.
       * Tasks outside this window have no Three.js representation.
       */}
      {win.visibleTasks.map((task) => {
        const pos = positions[task.taskId];
        if (!pos) return null;
        return (
          <VirtualizedOrbNode
            key={task.taskId}
            task={task}
            position={pos}
            showBadge={showBadges}
          />
        );
      })}

      {/*
       * ── DIEGETIC PAGINATION PANEL ──────────────────────────────────────
       * Floating Html overlay anchored in world space.
       * Provides window label ("3–10 of 47") and prev/next navigation.
       * Shown even when totalPages === 1 so the user knows they are
       * seeing the complete set.
       */}
      <TaskGroupPaginationPanel
        window={win}
        anchorX={worldAnchorX}
        anchorY={worldAnchorY}
        anchorZ={worldAnchorZ}
        onPrev={() => prevPage(groupId)}
        onNext={() => nextPage(groupId)}
      />
    </group>
  );
}
