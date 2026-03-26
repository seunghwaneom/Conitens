/**
 * use-hierarchy-navigation.ts — Sub-AC 3b
 *
 * Hierarchy state model and navigation controller for the 4-level spatial
 * hierarchy:  building → office → room → agent
 *
 * Design principles:
 * ──────────────────
 *  - "office" is the canonical term for the floor-level group (a floor is an
 *    office suite containing multiple rooms).  The spatial-store uses the
 *    internal term "floor"; this hook exposes "office" as the public API so
 *    the rest of the GUI remains consistent with the task description.
 *  - Pure computation:  computeHierarchyPosition() is extracted as a pure
 *    function so the navigation logic is fully testable in Node without a
 *    React environment.
 *  - Event-sourcing compliance:  all mutations are delegated to the
 *    spatial-store which writes append-only navigation events.
 *  - Behavioral contract:  every action is named with a verb-first identifier
 *    (navigate.*) to satisfy the ontology noun-verb symmetry requirement.
 *  - Ontology level:  INFRASTRUCTURE — bridges the domain hierarchy model
 *    (room-agent-hierarchy.ts) with the infrastructure spatial-store.
 *
 * Exported API
 * ────────────
 *  HierarchyDepth                — "building" | "office" | "room" | "agent"
 *  HierarchyPosition             — current navigation state with resolved nodes
 *  HierarchyNavigationContract   — behavioral contract (verb-first names)
 *  HierarchyNavigationController — full return type of useHierarchyNavigation()
 *  computeHierarchyPosition()    — pure function (testable without DOM/React)
 *  drillLevelToDepth()           — utility: DrillLevel → HierarchyDepth
 *  depthToDrillLevel()           — utility: HierarchyDepth → DrillLevel
 *  useHierarchyNavigation()      — the React hook
 *
 * @module hooks/use-hierarchy-navigation
 */

import { useSpatialStore, type DrillLevel } from "../store/spatial-store.js";
import {
  DEFAULT_BUILDING_HIERARCHY,
  getFloorNode,
  getRoomNode,
  type BuildingHierarchyNode,
  type FloorHierarchyNode,
  type RoomHierarchyNode,
  type AgentInRoom,
} from "../data/room-agent-hierarchy.js";

// ── HierarchyDepth type ────────────────────────────────────────────────────────

/**
 * The 4 depth levels in the spatial hierarchy.
 *
 * Note: the spatial-store uses the internal term "floor" for the second level;
 * this module uses "office" as the public-facing term (a floor is an office
 * suite).  Conversion helpers are provided below.
 */
export type HierarchyDepth = "building" | "office" | "room" | "agent";

// ── Depth ↔ DrillLevel conversions ────────────────────────────────────────────

/**
 * Map from internal spatial-store DrillLevel to the public HierarchyDepth.
 * Only "floor" → "office" differs; all other levels are identity mappings.
 */
export const DRILL_LEVEL_TO_DEPTH: Readonly<Record<DrillLevel, HierarchyDepth>> = {
  building: "building",
  floor:    "office",
  room:     "room",
  agent:    "agent",
} as const;

/**
 * Map from public HierarchyDepth back to the internal spatial-store DrillLevel.
 * Only "office" → "floor" differs; all other levels are identity mappings.
 */
export const DEPTH_TO_DRILL_LEVEL: Readonly<Record<HierarchyDepth, DrillLevel>> = {
  building: "building",
  office:   "floor",
  room:     "room",
  agent:    "agent",
} as const;

/**
 * Convert a spatial-store DrillLevel to the public HierarchyDepth.
 * @param level  internal drill level
 * @returns      public hierarchy depth
 */
export function drillLevelToDepth(level: DrillLevel): HierarchyDepth {
  return DRILL_LEVEL_TO_DEPTH[level];
}

/**
 * Convert a public HierarchyDepth to the internal spatial-store DrillLevel.
 * @param depth  public hierarchy depth
 * @returns      internal drill level
 */
export function depthToDrillLevel(depth: HierarchyDepth): DrillLevel {
  return DEPTH_TO_DRILL_LEVEL[depth];
}

// ── HierarchyPosition ─────────────────────────────────────────────────────────

/**
 * The current navigation position in the spatial hierarchy.
 *
 * Combines the depth level with the actual resolved hierarchy nodes so
 * components never need to call hierarchy query helpers directly.
 *
 * Invariants:
 *  - officeNode is non-null only when depth is "office", "room", or "agent"
 *  - roomNode is non-null only when depth is "room" or "agent"
 *  - agentNode is non-null only when depth is "agent"
 */
export interface HierarchyPosition {
  /** Current depth (public term — "office" maps to internal "floor") */
  depth: HierarchyDepth;
  /**
   * The building node — always present; serves as the root of the hierarchy
   * tree and provides the list of offices (floors), totalRooms, totalAgents.
   */
  buildingNode: BuildingHierarchyNode;
  /**
   * The currently active office (floor) node.
   * Populated when depth is "office", "room", or "agent".
   * Null at "building" depth.
   */
  officeNode: FloorHierarchyNode | null;
  /**
   * The currently active room node.
   * Populated when depth is "room" or "agent".
   * Null at "building" or "office" depth.
   */
  roomNode: RoomHierarchyNode | null;
  /**
   * The currently active agent node.
   * Populated when depth is "agent".
   * Null at all shallower levels.
   */
  agentNode: AgentInRoom | null;
}

// ── Behavioral contract ───────────────────────────────────────────────────────

/**
 * HierarchyNavigationContract — verb-first behavioral specification.
 *
 * Documents every action this controller CAN DO, following the ontology
 * requirement that entity types declare their behavioral_contract (what they
 * can DO, not just what they ARE) to prevent noun-verb asymmetry.
 *
 * All actions are event-sourced via the spatial-store; the contract here is
 * the domain-facing API rather than the implementation detail.
 */
export interface HierarchyNavigationContract {
  /**
   * "navigate.drillIntoOffice"
   * Transition from the building overview into a specific office (floor).
   * Sets depth to "office" and activates the floor's room list.
   * Clears any previously active room/agent context.
   */
  "navigate.drillIntoOffice": (floorIndex: number) => void;

  /**
   * "navigate.drillIntoRoom"
   * Transition into a specific room within the current office.
   * Sets depth to "room", focuses the camera, and selects the room.
   * Can be called from any depth — will resolve the office context
   * automatically from the room's floor property.
   */
  "navigate.drillIntoRoom": (roomId: string) => void;

  /**
   * "navigate.drillIntoAgent"
   * Transition into a specific agent's detail view.
   * Sets depth to "agent" while preserving the current office/room context.
   * Requires a worldPosition for camera focus.
   */
  "navigate.drillIntoAgent": (
    agentId: string,
    worldPosition: { x: number; y: number; z: number },
  ) => void;

  /**
   * "navigate.drillUp"
   * Ascend one level in the hierarchy:
   *   agent → room → office → building
   * No-op at the "building" level (already at root).
   */
  "navigate.drillUp": () => void;

  /**
   * "navigate.reset"
   * Return immediately to the "building" overview from any depth.
   * Clears all active office/room/agent context.
   */
  "navigate.reset": () => void;
}

// ── HierarchyNavigationController ────────────────────────────────────────────

/**
 * The full return type of useHierarchyNavigation().
 *
 * Provides the current navigation position, guard flags, navigation actions,
 * and pre-computed data slices at the current hierarchy level — eliminating
 * the need for callers to perform ad-hoc hierarchy queries.
 */
export interface HierarchyNavigationController {
  // ── Position ──────────────────────────────────────────────────────────────
  /** Full navigation position with resolved hierarchy nodes. */
  position: HierarchyPosition;

  // ── Guards ────────────────────────────────────────────────────────────────
  /**
   * True when drill-up is possible (depth is not "building").
   * Use to conditionally render Back / Escape buttons.
   */
  canDrillUp: boolean;

  // ── Navigation actions (match behavioral contract) ────────────────────────
  /** Drill into a specific office (floor) by index. */
  drillIntoOffice: HierarchyNavigationContract["navigate.drillIntoOffice"];
  /** Drill into a specific room by ID. */
  drillIntoRoom:   HierarchyNavigationContract["navigate.drillIntoRoom"];
  /** Drill into a specific agent by ID + world position. */
  drillIntoAgent:  HierarchyNavigationContract["navigate.drillIntoAgent"];
  /** Ascend one level. */
  drillUp:         HierarchyNavigationContract["navigate.drillUp"];
  /** Reset to building overview. */
  reset:           HierarchyNavigationContract["navigate.reset"];

  // ── Contextual data slices ────────────────────────────────────────────────
  /**
   * All offices (floors) in the building — always available regardless of depth.
   * Use this to render the floor selector / BuildingEntryHint panel.
   */
  officesInBuilding: FloorHierarchyNode[];

  /**
   * Rooms within the currently active office.
   * Null when no office is active (depth is "building").
   * Use this to render the FloorContextPanel room list.
   */
  roomsInCurrentOffice: RoomHierarchyNode[] | null;

  /**
   * Agents assigned to the currently active room.
   * Null when no room is active (depth is "building" or "office").
   * Use this to render agent cards in the RoomDetailPanel.
   */
  agentsInCurrentRoom: AgentInRoom[] | null;
}

// ── computeHierarchyPosition (pure function) ──────────────────────────────────

/**
 * Pure function — compute the HierarchyPosition from raw spatial-store values
 * and a BuildingHierarchyNode.
 *
 * Extracted from the hook so it can be tested in Node without React.
 * The hook simply calls this with the current store slice.
 *
 * @param drillLevel  raw DrillLevel from spatial-store
 * @param drillFloor  raw floor index from spatial-store (null above floor level)
 * @param drillRoom   raw room ID from spatial-store (null above room level)
 * @param drillAgent  raw agent ID from spatial-store (null above agent level)
 * @param hierarchy   building hierarchy (defaults to DEFAULT_BUILDING_HIERARCHY)
 * @returns           resolved HierarchyPosition
 */
export function computeHierarchyPosition(
  drillLevel: DrillLevel,
  drillFloor: number | null,
  drillRoom: string | null,
  drillAgent: string | null,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): HierarchyPosition {
  const depth = drillLevelToDepth(drillLevel);

  // Resolve office (floor) node — only when at or below office level
  const officeNode: FloorHierarchyNode | null =
    drillFloor !== null && depth !== "building"
      ? (getFloorNode(drillFloor, hierarchy) ?? null)
      : null;

  // Resolve room node — only when at or below room level
  const roomNode: RoomHierarchyNode | null =
    drillRoom !== null && (depth === "room" || depth === "agent")
      ? (getRoomNode(drillRoom, hierarchy) ?? null)
      : null;

  // Resolve agent node — only when at agent level; search in the room first,
  // then fall back to a full hierarchy scan if the room context is missing
  // (defensive: drillIntoAgent can be called before drillIntoRoom in edge cases).
  let agentNode: AgentInRoom | null = null;
  if (drillAgent !== null && depth === "agent") {
    if (roomNode) {
      agentNode = roomNode.agents.find((a) => a.agentId === drillAgent) ?? null;
    }
    // Fallback: scan all rooms in all floors
    if (!agentNode) {
      outer: for (const floor of hierarchy.floors) {
        for (const room of floor.rooms) {
          const found = room.agents.find((a) => a.agentId === drillAgent);
          if (found) {
            agentNode = found;
            break outer;
          }
        }
      }
    }
  }

  return {
    depth,
    buildingNode: hierarchy,
    officeNode,
    roomNode,
    agentNode,
  };
}

// ── canDrillUp (pure utility) ─────────────────────────────────────────────────

/**
 * Pure utility: returns true when drill-up is possible (not at root).
 *
 * @param depth  current hierarchy depth
 * @returns      true when ascend is possible
 */
export function canNavigateDrillUp(depth: HierarchyDepth): boolean {
  return depth !== "building";
}

// ── useHierarchyNavigation hook ───────────────────────────────────────────────

/**
 * useHierarchyNavigation — Hierarchy navigation controller hook.
 *
 * Combines the spatial-store drill state with the room-agent hierarchy to
 * produce a rich navigation state object and action API.
 *
 * The hook subscribes to the minimal slice of the spatial-store required for
 * navigation — it does NOT subscribe to camera state, room runtime states, or
 * any other store slices, keeping re-renders focused.
 *
 * @param hierarchy  building hierarchy to use (defaults to DEFAULT_BUILDING_HIERARCHY)
 *                   Pass a custom hierarchy when the building has been reloaded
 *                   from YAML (e.g., from the spatial-store's building prop).
 *
 * @example
 *   function FloorSelector() {
 *     const nav = useHierarchyNavigation();
 *     return (
 *       <ul>
 *         {nav.officesInBuilding.map((office) => (
 *           <li key={office.floor}>
 *             <button onClick={() => nav.drillIntoOffice(office.floor)}>
 *               {office.name}
 *             </button>
 *           </li>
 *         ))}
 *       </ul>
 *     );
 *   }
 */
export function useHierarchyNavigation(
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): HierarchyNavigationController {
  // ── Subscribe to minimal spatial-store slices ────────────────────────────
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);

  // ── Subscribe to spatial-store actions ──────────────────────────────────
  const drillIntoFloor  = useSpatialStore((s) => s.drillIntoFloor);
  const _drillIntoRoom  = useSpatialStore((s) => s.drillIntoRoom);
  const _drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);
  const drillAscend     = useSpatialStore((s) => s.drillAscend);
  const drillReset      = useSpatialStore((s) => s.drillReset);

  // ── Compute navigation position (pure function) ──────────────────────────
  const position = computeHierarchyPosition(
    drillLevel,
    drillFloor,
    drillRoom,
    drillAgent,
    hierarchy,
  );

  // ── Derive guards and contextual slices ──────────────────────────────────
  const canDrillUp = canNavigateDrillUp(position.depth);

  return {
    // Position
    position,

    // Guards
    canDrillUp,

    // Navigation actions — map public "office" API to internal "floor" API
    drillIntoOffice: drillIntoFloor,
    drillIntoRoom:   _drillIntoRoom,
    drillIntoAgent:  _drillIntoAgent,
    drillUp:         drillAscend,
    reset:           drillReset,

    // Contextual data slices
    officesInBuilding:    hierarchy.floors,
    roomsInCurrentOffice: position.officeNode?.rooms ?? null,
    agentsInCurrentRoom:  position.roomNode?.agents ?? null,
  };
}

export default useHierarchyNavigation;
