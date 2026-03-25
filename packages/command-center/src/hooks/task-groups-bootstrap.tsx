/**
 * task-groups-bootstrap.tsx — React context and provider component for
 * the task_group hierarchy integration.
 *
 * Sub-AC 3 (AC 15): Companion file to use-task-groups-for-hierarchy.ts.
 * Contains the React context and JSX components that are split into a
 * separate .tsx file to keep the hook file pure TypeScript (no JSX transform
 * needed for unit tests that import only the hook).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   // In App.tsx — wraps the app so the Canvas can read group IDs:
 *   import { TaskGroupsBootstrap } from "./hooks/task-groups-bootstrap.js";
 *
 *   <TaskGroupsBootstrap>
 *     <CommandCenterScene />
 *   </TaskGroupsBootstrap>
 *
 *   // In HierarchySpatialTaskLayer.tsx — reads group IDs from context:
 *   import { useTaskGroupsContext } from "./hooks/task-groups-bootstrap.js";
 *
 *   const { getAgentGroupId, isReady } = useTaskGroupsContext();
 */

import { createContext, useContext, type ReactNode } from "react";
import {
  useTaskGroupsForHierarchy,
  type TaskGroupsForHierarchy,
} from "./use-task-groups-for-hierarchy.js";

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * TaskGroupsContext — Provides the TaskGroupsForHierarchy API to all
 * descendants.  Default value has isReady=false and no-op query functions
 * so components that render before initialization degrade gracefully.
 */
export const TaskGroupsContext = createContext<TaskGroupsForHierarchy>({
  getRoomGroupId:  () => null,
  getAgentGroupId: () => null,
  isReady:         false,
  roomGroupCount:  0,
  agentGroupCount: 0,
});

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * useTaskGroupsContext — Read the TaskGroupsForHierarchy API from context.
 *
 * Components inside the Three.js Canvas (e.g. HierarchySpatialTaskLayer)
 * use this to query task group IDs without re-running the full hook
 * (useEffect is not allowed inside the Canvas render tree).
 *
 * Returns the default empty context when TaskGroupsBootstrap is not mounted
 * above in the tree — components degrade gracefully rather than throwing.
 *
 * @example
 *   const { getAgentGroupId, isReady } = useTaskGroupsContext();
 *   if (!isReady) return null;
 *   const groupId = getAgentGroupId("agent-alpha");
 */
export function useTaskGroupsContext(): TaskGroupsForHierarchy {
  return useContext(TaskGroupsContext);
}

// ── Provider component ────────────────────────────────────────────────────────

export interface TaskGroupsBootstrapProps {
  /** Children to wrap. The Canvas and all scene components should be children. */
  children?: ReactNode;
}

/**
 * TaskGroupsBootstrap — Provider + headless bootstrap in one component.
 *
 * Mounts useTaskGroupsForHierarchy and provides the resulting API via
 * TaskGroupsContext so all descendants (including Three.js Canvas children
 * via HierarchySpatialTaskLayer) can access task group IDs.
 *
 * Renders children directly — no extra DOM wrapper element.
 *
 * ── Record transparency ───────────────────────────────────────────────────────
 *   Group creation/deletion events are appended to the task-group-store event
 *   log by useTaskGroupsForHierarchy.  This component simply provides context;
 *   it does not mutate any state directly.
 *
 * ── Integration with App.tsx ──────────────────────────────────────────────────
 *   Mounted in App.tsx, wrapping the ActionDispatcherProvider content so all
 *   bridge components, the Canvas, and the HUD all have access to the context.
 *
 * @example
 *   // App.tsx
 *   <TaskGroupsBootstrap>
 *     <div style={{ width: '100%', height: '100%' }}>
 *       <CommandCenterScene />
 *       <HUD />
 *     </div>
 *   </TaskGroupsBootstrap>
 */
export function TaskGroupsBootstrap({ children }: TaskGroupsBootstrapProps) {
  const taskGroups = useTaskGroupsForHierarchy();

  return (
    <TaskGroupsContext.Provider value={taskGroups}>
      {children}
    </TaskGroupsContext.Provider>
  );
}
