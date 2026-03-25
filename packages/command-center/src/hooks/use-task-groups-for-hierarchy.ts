/**
 * use-task-groups-for-hierarchy.ts — Auto-manages task_group entities for the
 * room/agent hierarchy.
 *
 * Sub-AC 3 (AC 15): Integration layer that wires the task_group infrastructure
 * entity into the domain-layer room/agent hierarchy.  This hook:
 *
 *   1. Injects the task-store reference into task-group-store so that
 *      getGroupWindow() can query live task data (required once per session).
 *
 *   2. Creates one task_group per room and one per agent when rooms become
 *      available.  Each group pins itself to the matching room/agent, enabling
 *      VirtualizedTaskOrbLayer to float task orbs at the correct world position.
 *
 *   3. Exposes getRoomGroupId() and getAgentGroupId() so scene components can
 *      obtain the task group ID for rendering without direct store access.
 *
 *   4. Cleans up all created groups on unmount to prevent group accumulation
 *      across hot-reloads.
 *
 * ── Ontology level ──────────────────────────────────────────────────────────
 *   INFRASTRUCTURE — wires task_group (infrastructure) to the room/agent
 *   hierarchy (domain) without mutating domain-level task or agent data.
 *   Additions here must not regress domain-level behaviors.
 *
 * ── Behavioral contract ─────────────────────────────────────────────────────
 *   "hierarchy.createRoomGroups"   — create one task group per building room
 *   "hierarchy.createAgentGroups"  — create one task group per agent
 *   "hierarchy.getRoomGroup"       — get groupId for a room (null if not ready)
 *   "hierarchy.getAgentGroup"      — get groupId for an agent (null if not ready)
 *   "hierarchy.teardownGroups"     — delete all managed groups on unmount
 *
 * ── Record Transparency ──────────────────────────────────────────────────────
 *   Every task group creation/deletion appends a task_group.created /
 *   task_group.deleted event to the task-group-store's append-only log.
 *   This enables full session replay of which task windows were visible
 *   at any historical moment.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 *   Groups are created once per mount.  A subsequent render with the same
 *   rooms/agents does NOT re-create groups.  Only adding entirely new rooms
 *   or agents (after the first initialization) triggers new group creation.
 *
 * ── JSX components ───────────────────────────────────────────────────────────
 *   The React context (TaskGroupsContext) and provider component
 *   (TaskGroupsBootstrap) are in a companion .tsx file:
 *     src/hooks/task-groups-bootstrap.tsx
 *   This file is pure TypeScript with no JSX so it can be imported in .ts
 *   test files without a JSX transform.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useTaskGroupStore, injectTaskStoreRefForGroups } from "../store/task-group-store.js";
import { useTaskStore } from "../store/task-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default window size for room-level task groups.
 * Rooms show up to 10 task orbs at once in the 3D scene.
 */
export const ROOM_GROUP_WINDOW_SIZE = 10;

/**
 * Window size for agent-level task groups.
 * Agent panels show up to 5 task orbs (focused view, not room-wide).
 */
export const AGENT_GROUP_WINDOW_SIZE = 5;

// ── Behavioral Contract Interface ─────────────────────────────────────────────

/**
 * TaskGroupsForHierarchyContract — Declares what this integration entity
 * CAN DO (verb-first specification per ontology requirements).
 */
export interface TaskGroupsForHierarchyContract {
  /**
   * "hierarchy.createRoomGroups" — Ensure a task group exists for a given
   * roomId.  No-op if the group already exists.  Returns the groupId.
   */
  "hierarchy.createRoomGroups": (roomId: string) => string;

  /**
   * "hierarchy.createAgentGroups" — Ensure a task group exists for a given
   * agentId.  Filters to only that agent's tasks.  Returns the groupId.
   */
  "hierarchy.createAgentGroups": (agentId: string) => string;

  /**
   * "hierarchy.getRoomGroup" — Return the groupId for a room, or null if
   * the group has not been created yet.
   */
  "hierarchy.getRoomGroup": (roomId: string) => string | null;

  /**
   * "hierarchy.getAgentGroup" — Return the groupId for an agent, or null
   * if the group has not been created yet.
   */
  "hierarchy.getAgentGroup": (agentId: string) => string | null;

  /**
   * "hierarchy.teardownGroups" — Delete all groups managed by this hook.
   * Called automatically on unmount.
   */
  "hierarchy.teardownGroups": () => void;
}

// ── Return type ───────────────────────────────────────────────────────────────

/**
 * TaskGroupsForHierarchy — The API returned by useTaskGroupsForHierarchy().
 */
export interface TaskGroupsForHierarchy {
  /**
   * Get the task group ID for a specific room.
   * Returns null when the hook has not yet initialized (isReady=false).
   */
  getRoomGroupId(roomId: string): string | null;

  /**
   * Get the task group ID for a specific agent.
   * Returns null when the hook has not yet initialized (isReady=false).
   */
  getAgentGroupId(agentId: string): string | null;

  /**
   * Whether the task groups have been created and are queryable.
   * Becomes true after the first initialization pass completes.
   */
  isReady: boolean;

  /**
   * Number of room-level groups currently managed.
   * Useful for HUD diagnostics and self-improvement analysis.
   */
  roomGroupCount: number;

  /**
   * Number of agent-level groups currently managed.
   * Useful for HUD diagnostics and self-improvement analysis.
   */
  agentGroupCount: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useTaskGroupsForHierarchy — Auto-manages task_group entities for the
 * building hierarchy.
 *
 * Mounts one task group per room and one per agent on first initialization.
 * All groups are deleted on hook unmount to keep the store clean across
 * hot-reloads and remounts.
 *
 * Must be mounted OUTSIDE the Three.js Canvas (uses useEffect + useState).
 * Recommended mount point: in App.tsx next to the other store-injection effects.
 *
 * @example
 *   // In App.tsx or a dedicated bootstrap component (task-groups-bootstrap.tsx):
 *   function TaskGroupsBootstrap({ children }) {
 *     const taskGroups = useTaskGroupsForHierarchy();
 *     return <TaskGroupsContext.Provider value={taskGroups}>{children}</TaskGroupsContext.Provider>;
 *   }
 */
export function useTaskGroupsForHierarchy(): TaskGroupsForHierarchy {
  const createTaskGroup = useTaskGroupStore((s) => s.createTaskGroup);
  const deleteTaskGroup = useTaskGroupStore((s) => s.deleteTaskGroup);

  // Track group IDs in refs (not state) so lookup functions are always fresh
  // without requiring re-renders just to read them.
  const roomGroupMap  = useRef<Map<string, string>>(new Map());
  const agentGroupMap = useRef<Map<string, string>>(new Map());

  // isReady is state so consumers can subscribe to the transition false → true
  const [isReady, setIsReady] = useState(false);

  const building = useSpatialStore((s) => s.building);
  const agents   = useAgentStore((s) => s.agents);

  // ── Step 1: Inject task-store ref into task-group-store ─────────────────
  // Must happen before any getGroupWindow() calls.  Idempotent — called once
  // on mount and whenever the stores are reloaded.
  useEffect(() => {
    injectTaskStoreRefForGroups(() => useTaskStore.getState());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Create task groups for all rooms ─────────────────────────────
  useEffect(() => {
    if (!building.rooms.length) return;

    for (const room of building.rooms) {
      if (roomGroupMap.current.has(room.roomId)) continue; // already created

      const groupId = createTaskGroup({
        name:          `${room.name} — Tasks`,
        description:   `Active tasks pinned to room "${room.roomId}"`,
        filter:        { includeTerminal: false },
        windowSize:    ROOM_GROUP_WINDOW_SIZE,
        pinnedRoomId:  room.roomId,
      });

      roomGroupMap.current.set(room.roomId, groupId);
    }
  }, [building.rooms, createTaskGroup]);

  // ── Step 3: Create task groups for all agents ────────────────────────────
  // Re-runs when agents are added/removed (e.g. dynamic agent registration).
  useEffect(() => {
    const agentEntries = Object.entries(agents);
    if (!agentEntries.length) return;

    for (const [agentId, agentState] of agentEntries) {
      if (agentGroupMap.current.has(agentId)) continue; // already created

      const groupId = createTaskGroup({
        name:           `${agentState.def.name} — Tasks`,
        description:    `Tasks assigned to agent "${agentId}"`,
        filter:         { agentIds: [agentId], includeTerminal: false },
        windowSize:     AGENT_GROUP_WINDOW_SIZE,
        pinnedAgentId:  agentId,
      });

      agentGroupMap.current.set(agentId, groupId);
    }

    // Mark ready once both rooms and agents have at least some groups
    if (roomGroupMap.current.size > 0 && !isReady) {
      setIsReady(true);
    }
  }, [agents, createTaskGroup, isReady]);

  // Separate effect to set isReady once rooms are processed
  useEffect(() => {
    if (roomGroupMap.current.size > 0 && !isReady) {
      setIsReady(true);
    }
  }, [building.rooms, isReady]);

  // ── Cleanup: delete all groups on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      for (const groupId of roomGroupMap.current.values()) {
        deleteTaskGroup(groupId);
      }
      for (const groupId of agentGroupMap.current.values()) {
        deleteTaskGroup(groupId);
      }
      roomGroupMap.current.clear();
      agentGroupMap.current.clear();
    };
  }, [deleteTaskGroup]);

  // ── Stable query functions ────────────────────────────────────────────────
  const getRoomGroupId = useCallback(
    (roomId: string): string | null => roomGroupMap.current.get(roomId) ?? null,
    [],
  );

  const getAgentGroupId = useCallback(
    (agentId: string): string | null => agentGroupMap.current.get(agentId) ?? null,
    [],
  );

  return {
    getRoomGroupId,
    getAgentGroupId,
    isReady,
    roomGroupCount:  roomGroupMap.current.size,
    agentGroupCount: agentGroupMap.current.size,
  };
}
