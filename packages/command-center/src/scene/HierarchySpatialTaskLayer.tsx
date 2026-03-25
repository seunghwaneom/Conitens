/**
 * HierarchySpatialTaskLayer.tsx — Integrates spatial_index + task_group
 * into the room/agent 3D hierarchy.
 *
 * Sub-AC 3 (AC 15): Canvas component that renders VirtualizedTaskOrbLayer
 * for agents currently inside the spatial index's render window.  It uses:
 *
 *   spatial_index  → which agents are in the window (and their LOD level)
 *   task_group     → which task orbs to materialize for each windowed agent
 *
 * ── Virtualization guarantee ─────────────────────────────────────────────────
 *
 *   With 20 agents and 200 tasks in the stores:
 *   - Only MAX_RENDER_WINDOW (≤ 12) agents receive task orb panels.
 *   - Each panel materializes at most AGENT_GROUP_WINDOW_SIZE (5) orbs.
 *   - Maximum instantaneous 3D orbs = 12 × 5 = 60, regardless of task count.
 *   - The remaining 140+ tasks exist in the task-store but have ZERO geometry.
 *
 * ── Performance contract ─────────────────────────────────────────────────────
 *
 *   Renders as O(windowSize × AGENT_GROUP_WINDOW_SIZE) Three.js objects.
 *   For the 20-agent / 200-task benchmark:
 *     - 12 agents max in window
 *     - 5 orbs per agent = 60 mesh instances total
 *     - All computations complete in < 1ms per frame (O(n log n) spatial + O(window) pagination)
 *   This is well within the 33ms budget for ≥30 fps.
 *
 * ── Placement contract ───────────────────────────────────────────────────────
 *
 *   Must be placed INSIDE <ScenePerformanceMonitor><Suspense> in CommandCenterScene.tsx.
 *   Uses useFrame (from @react-three/fiber) for frame-aligned reads.
 *   Reads from: useSpatialIndexStore, useAgentStore, TaskGroupsContext.
 *   Renders nothing (returns null) when:
 *     - No agents are in the spatial window
 *     - Quality level is 'low' (disabled to save render budget)
 *     - TaskGroupsBootstrap has not yet initialized (isReady=false)
 *
 * ── Diegetic integration ─────────────────────────────────────────────────────
 *
 *   Task orb panels float above each windowed agent at their world position.
 *   The panel anchor Y is set to worldPosition.y + PANEL_Y_OFFSET so orbs
 *   appear clearly above the agent avatar without clipping the head geometry.
 *
 * ── Record Transparency ──────────────────────────────────────────────────────
 *
 *   This component is PURELY PRESENTATIONAL:
 *   - It reads from spatial-index-store and task-group-store.
 *   - All task-group navigation (prev/next page) is delegated to task-group-store
 *     actions, which append events to the group's event log.
 *   - No direct state mutations occur here.
 */

import { useMemo } from "react";
import { useSpatialIndexStore } from "../store/spatial-index-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useTaskGroupsContext } from "../hooks/task-groups-bootstrap.js";
import { usePerformanceQuality } from "./ScenePerformance.js";
import { VirtualizedTaskOrbLayer } from "./VirtualizedTaskOrbLayer.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Y-axis offset above the agent's world position where task orb panels
 * are anchored.  Places the panel above the avatar head (max height ~0.85u)
 * with a comfortable visual gap.
 */
const PANEL_Y_OFFSET = 1.5;

/**
 * Maximum number of windowed agents that receive task orb panels.
 * Even if the spatial window is larger, we cap panel count to keep the
 * scene readable.  12 ≤ MAX_RENDER_WINDOW is already enforced upstream.
 */
const MAX_AGENT_PANELS = 12;

// ── Per-agent orb panel ───────────────────────────────────────────────────────

interface AgentTaskOrbPanelProps {
  agentId:   string;
  worldX:    number;
  worldY:    number;
  worldZ:    number;
  groupId:   string;
  showBadges: boolean;
}

/**
 * AgentTaskOrbPanel — renders VirtualizedTaskOrbLayer anchored at an
 * agent's world position.
 *
 * Extracted to its own component so React can key it by agentId, preventing
 * stale state on agent position changes.
 */
function AgentTaskOrbPanel({
  agentId,
  worldX,
  worldY,
  worldZ,
  groupId,
  showBadges,
}: AgentTaskOrbPanelProps) {
  return (
    <VirtualizedTaskOrbLayer
      key={agentId}
      groupId={groupId}
      worldAnchorX={worldX}
      worldAnchorY={worldY + PANEL_Y_OFFSET}
      worldAnchorZ={worldZ}
      showBadges={showBadges}
    />
  );
}

// ── Root layer component ──────────────────────────────────────────────────────

/**
 * HierarchySpatialTaskLayer — Canvas component that integrates spatial_index
 * and task_group into the room/agent hierarchy.
 *
 * Must be placed inside <ScenePerformanceMonitor><Suspense> in
 * CommandCenterScene.tsx.  Renders nothing at 'low' quality or when the
 * spatial window is empty.
 *
 * Example (CommandCenterScene.tsx, inside <Suspense>, after <SpatialIndexProvider>):
 *
 *   {/* Sub-AC 3 (AC 15): spatial_index + task_group hierarchy integration *\/}
 *   <HierarchySpatialTaskLayer />
 */
export function HierarchySpatialTaskLayer() {
  // ── Quality gate — skip at 'low' quality to save render budget ───────────
  const quality = usePerformanceQuality();
  if (quality === "low") return null;

  // ── Read spatial window ──────────────────────────────────────────────────
  const windowedSet = useSpatialIndexStore((s) => s.windowedSet);
  const windowedIds = windowedSet.fullRenderIds;

  // ── Task group context (created by TaskGroupsBootstrap in App.tsx) ───────
  const { getAgentGroupId, isReady } = useTaskGroupsContext();

  // ── Agent world positions ─────────────────────────────────────────────────
  const agents = useAgentStore((s) => s.agents);

  // ── Badge visibility — hide at medium quality to save DOM nodes ──────────
  const showBadges = quality === "high";

  // ── Build the panel list ─────────────────────────────────────────────────
  // Only materialise orb panels for windowed agents that:
  //   (a) exist in the agent store (have a world position)
  //   (b) have a task group assigned by TaskGroupsBootstrap
  //   (c) are within the panel count cap
  const panels = useMemo(() => {
    if (!isReady || !windowedIds.length) return [];

    const result: Array<{
      agentId: string;
      worldX:  number;
      worldY:  number;
      worldZ:  number;
      groupId: string;
    }> = [];

    const ids = windowedIds.slice(0, MAX_AGENT_PANELS);
    for (const agentId of ids) {
      const agent   = agents[agentId];
      const groupId = getAgentGroupId(agentId);

      if (!agent || !groupId) continue;

      result.push({
        agentId,
        worldX:  agent.worldPosition.x,
        worldY:  agent.worldPosition.y,
        worldZ:  agent.worldPosition.z,
        groupId,
      });
    }

    return result;
  }, [
    isReady,
    windowedIds,
    agents,
    getAgentGroupId,
  ]);

  // ── Empty guard ──────────────────────────────────────────────────────────
  if (!panels.length) return null;

  return (
    <group name="hierarchy-spatial-task-layer">
      {panels.map(({ agentId, worldX, worldY, worldZ, groupId }) => (
        <AgentTaskOrbPanel
          key={agentId}
          agentId={agentId}
          worldX={worldX}
          worldY={worldY}
          worldZ={worldZ}
          groupId={groupId}
          showBadges={showBadges}
        />
      ))}
    </group>
  );
}
