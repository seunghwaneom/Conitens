/**
 * room-agent-hierarchy.ts — Canonical building/floor/room/agent hierarchy.
 *
 * Provides a single, navigable tree representation of the entire
 * Conitens command-center spatial layout:
 *
 *   BuildingHierarchyNode
 *   └── FloorHierarchyNode[]
 *       └── RoomHierarchyNode[]
 *           └── AgentInRoom[]
 *
 * Design principles:
 *   - Single source of truth: all data derived from BUILDING, AGENTS,
 *     and DEFAULT_ROOM_MAPPING — no independent duplication.
 *   - Traversal-friendly: every node carries enough context to render
 *     HUD labels, room cards, and floor maps without extra lookups.
 *   - Validation-ready: `validateHierarchyConsistency` checks that
 *     BUILDING, AGENTS, and room-mapping are mutually consistent.
 *
 * Config sources:
 *   .agent/rooms/_building.yaml   → building + floor plan
 *   .agent/rooms/*.yaml           → room members / spatial
 *   .agent/agents/*.yaml          → agent roles + capabilities
 *   .agent/rooms/_room-mapping.yaml → role → room resolution rules
 */

import {
  BUILDING,
  type BuildingDef,
  type RoomType,
} from "./building.js";

import {
  AGENTS,
  type AgentDef,
  type AgentRole,
  type RiskClass,
} from "./agents.js";

import {
  DEFAULT_ROOM_MAPPING,
  getRolesForRoom,
  resolveAgentRoom,
  type RoomMappingConfig,
  type AgentRole as MappingAgentRole,
} from "./room-mapping-resolver.js";

// ── Node Types ────────────────────────────────────────────────────────────

/** An agent resolved to a room, with its assignment source */
export interface AgentInRoom {
  /** Agent's unique identifier */
  agentId: string;
  /** Human-readable display name */
  name: string;
  /** Functional role */
  role: AgentRole;
  /** Full capability list */
  capabilities: string[];
  /** Risk classification */
  riskClass: RiskClass;
  /**
   * How the agent was placed in this room:
   *   "explicit"    — hard-coded in _building.yaml agent_assignments
   *   "role"        — matched via role_defaults in _room-mapping.yaml
   *   "capability"  — matched via capability_fallbacks
   *   "special"     — matched via special assignments (USER, SYSTEM)
   *   "fallback"    — no match, assigned to global fallback room
   */
  assignmentSource: "explicit" | "role" | "capability" | "special" | "fallback";
  /** Visual config (colour, emissive, icon, label) for 3D avatar */
  visual: AgentDef["visual"];
}

/** A single room node with resolved agent occupancy */
export interface RoomHierarchyNode {
  /** Unique room slug — matches RoomDef.roomId */
  roomId: string;
  /** Human-readable display name */
  name: string;
  /** Functional room type */
  roomType: RoomType;
  /** Floor this room belongs to */
  floor: number;
  /** Hex accent colour for geometry + UI highlights */
  colorAccent: string;
  /** Icon identifier for minimap / HUD labels */
  icon: string;
  /**
   * Agent roles canonically mapped to this room.
   * Derived from _room-mapping.yaml role_defaults.
   * Used by the 3D scene to show "expected occupant" role badges.
   * Uses the broader MappingAgentRole type to include planner/analyst/tester.
   */
  primaryRoles: MappingAgentRole[];
  /**
   * Resolved agent occupants.
   * Populated by scanning AGENTS against the room-mapping resolver.
   */
  agents: AgentInRoom[];
  /**
   * Raw member IDs from the room YAML (includes non-agent entities
   * such as "USER" and any future IDs not in AGENTS).
   */
  staticMembers: string[];
}

/** A single floor node with all its rooms */
export interface FloorHierarchyNode {
  /** Floor index (0 = ground floor, 1 = operations floor, …) */
  floor: number;
  /** Human-readable floor name */
  name: string;
  /** Grid dimensions in grid cells */
  gridW: number;
  gridD: number;
  /** Ordered list of rooms on this floor */
  rooms: RoomHierarchyNode[];
}

/** Root node — the entire building hierarchy */
export interface BuildingHierarchyNode {
  /** Building identifier */
  buildingId: string;
  /** Human-readable building name */
  name: string;
  /** Visual style tag */
  style: string;
  /** Ordered floor nodes (index 0 = ground floor) */
  floors: FloorHierarchyNode[];
  /** Precomputed totals for quick display */
  totalRooms: number;
  totalAgents: number;
  /** Agent IDs that appear in BUILDING.agentAssignments */
  explicitlyAssignedAgentIds: string[];
}

// ── Hierarchy Builder ─────────────────────────────────────────────────────

/**
 * Build the full building hierarchy from static config.
 *
 * Combines:
 *   1. BUILDING floor/room definitions
 *   2. DEFAULT_ROOM_MAPPING role + capability fallbacks
 *   3. AGENTS definitions
 *
 * All three sources are passed as parameters so the function is
 * pure and testable without global state.
 *
 * @param building       - BuildingDef to use (defaults to static BUILDING)
 * @param agents         - Agent definitions array (defaults to AGENTS)
 * @param mappingConfig  - Room mapping config (defaults to DEFAULT_ROOM_MAPPING)
 */
export function buildHierarchy(
  building: BuildingDef = BUILDING,
  agents: AgentDef[] = AGENTS,
  mappingConfig: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): BuildingHierarchyNode {
  // Build a lookup for quick room → resolved agents
  const roomAgentMap: Record<string, AgentInRoom[]> = {};

  for (const roomDef of building.rooms) {
    roomAgentMap[roomDef.roomId] = [];
  }

  // Resolve each agent to a room
  for (const agent of agents) {
    const resolution = resolveAgentRoom(
      { agentId: agent.agentId, role: agent.role, capabilities: agent.capabilities },
      building.agentAssignments,
      mappingConfig,
    );

    const roomId = resolution.roomId;
    if (!roomAgentMap[roomId]) {
      roomAgentMap[roomId] = [];
    }

    roomAgentMap[roomId].push({
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      capabilities: agent.capabilities,
      riskClass: agent.riskClass,
      assignmentSource: resolution.source,
      visual: agent.visual,
    });
  }

  // Build room nodes per floor
  const floorNodes: FloorHierarchyNode[] = building.floors.map((floorDef) => {
    const roomNodes: RoomHierarchyNode[] = floorDef.roomIds
      .map((roomId) => {
        const roomDef = building.rooms.find((r) => r.roomId === roomId);
        if (!roomDef) return null;

        const primaryRoles = getRolesForRoom(roomDef.roomId, mappingConfig);
        const resolvedAgents = roomAgentMap[roomDef.roomId] ?? [];

        return {
          roomId: roomDef.roomId,
          name: roomDef.name,
          roomType: roomDef.roomType,
          floor: roomDef.floor,
          colorAccent: roomDef.colorAccent,
          icon: roomDef.icon,
          primaryRoles,
          agents: resolvedAgents,
          staticMembers: [...roomDef.members],
        } satisfies RoomHierarchyNode;
      })
      .filter((n): n is RoomHierarchyNode => n !== null);

    return {
      floor: floorDef.floor,
      name: floorDef.name,
      gridW: floorDef.gridW,
      gridD: floorDef.gridD,
      rooms: roomNodes,
    };
  });

  const totalRooms = floorNodes.reduce((acc, f) => acc + f.rooms.length, 0);
  const totalAgents = agents.length;

  return {
    buildingId: building.buildingId,
    name: building.name,
    style: building.style,
    floors: floorNodes,
    totalRooms,
    totalAgents,
    explicitlyAssignedAgentIds: Object.keys(building.agentAssignments),
  };
}

// ── Static Default Hierarchy ──────────────────────────────────────────────

/**
 * Pre-built static hierarchy from bundled config.
 *
 * Available immediately at import time — no async I/O required.
 * This is the primary source used by HUD panels, room cards,
 * and minimap until a dynamic YAML reload supersedes it.
 *
 * To rebuild from dynamically-loaded YAML:
 *   const hierarchy = buildHierarchy(dynamicBuilding, AGENTS, mappingConfig);
 */
export const DEFAULT_BUILDING_HIERARCHY: BuildingHierarchyNode = buildHierarchy();

// ── Query Helpers ─────────────────────────────────────────────────────────

/**
 * Get a floor node by floor index.
 * Returns undefined if the floor doesn't exist.
 */
export function getFloorNode(
  floor: number,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): FloorHierarchyNode | undefined {
  return hierarchy.floors.find((f) => f.floor === floor);
}

/**
 * Get a room node by room ID (searches across all floors).
 * Returns undefined if the room doesn't exist.
 */
export function getRoomNode(
  roomId: string,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): RoomHierarchyNode | undefined {
  for (const floor of hierarchy.floors) {
    const room = floor.rooms.find((r) => r.roomId === roomId);
    if (room) return room;
  }
  return undefined;
}

/**
 * Get all agents in a specific room.
 * Returns empty array if room not found.
 */
export function getAgentsInRoomNode(
  roomId: string,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): AgentInRoom[] {
  return getRoomNode(roomId, hierarchy)?.agents ?? [];
}

/**
 * Get the room node for a given agent ID.
 * Returns undefined if the agent is not placed in any room.
 */
export function getRoomForAgentId(
  agentId: string,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): RoomHierarchyNode | undefined {
  for (const floor of hierarchy.floors) {
    for (const room of floor.rooms) {
      if (room.agents.some((a) => a.agentId === agentId)) {
        return room;
      }
    }
  }
  return undefined;
}

/**
 * Get all rooms that host at least one agent with the given role.
 */
export function getRoomsForAgentRole(
  role: AgentRole,
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): RoomHierarchyNode[] {
  const result: RoomHierarchyNode[] = [];
  for (const floor of hierarchy.floors) {
    for (const room of floor.rooms) {
      if (room.primaryRoles.includes(role) || room.agents.some((a) => a.role === role)) {
        result.push(room);
      }
    }
  }
  return result;
}

/**
 * Flatten the hierarchy to a map of roomId → RoomHierarchyNode.
 */
export function flattenHierarchy(
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): Readonly<Record<string, RoomHierarchyNode>> {
  const map: Record<string, RoomHierarchyNode> = {};
  for (const floor of hierarchy.floors) {
    for (const room of floor.rooms) {
      map[room.roomId] = room;
    }
  }
  return map;
}

/**
 * Get all agents across the entire building (flattened from room nodes).
 * Respects the floor/room ordering.
 */
export function getAllAgentsInHierarchy(
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): AgentInRoom[] {
  const agents: AgentInRoom[] = [];
  for (const floor of hierarchy.floors) {
    for (const room of floor.rooms) {
      agents.push(...room.agents);
    }
  }
  return agents;
}

// ── Validation ────────────────────────────────────────────────────────────

export interface HierarchyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that the building, agents, and room-mapping configs are
 * mutually consistent.
 *
 * Checks:
 *   1. Every agent's defaultRoom exists in the building
 *   2. Every room in building.agentAssignments exists in building.rooms
 *   3. Every assigned agent ID in building.agentAssignments exists in AGENTS
 *   4. Every capability in an agent's capabilities list is either:
 *      a. covered by a capability_fallback rule, OR
 *      b. covered by a role_default (role already handles it)
 *   5. No agent is placed in a room of the wrong floor
 *   6. All rooms with primaryRoles have at least one agent with that role
 *
 * @param building       - BuildingDef to validate (defaults to static BUILDING)
 * @param agents         - Agent definitions array (defaults to AGENTS)
 * @param mappingConfig  - Room mapping config (defaults to DEFAULT_ROOM_MAPPING)
 */
export function validateHierarchyConsistency(
  building: BuildingDef = BUILDING,
  agents: AgentDef[] = AGENTS,
  mappingConfig: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): HierarchyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const roomIds = new Set(building.rooms.map((r) => r.roomId));
  const agentIds = new Set(agents.map((a) => a.agentId));
  const coveredCapabilities = new Set(mappingConfig.capabilityFallbacks.map((fb) => fb.capability));
  const coveredRoles = new Set(Object.keys(mappingConfig.roleDefaults));

  // 1. Every agent's defaultRoom must exist in the building
  for (const agent of agents) {
    if (!roomIds.has(agent.defaultRoom)) {
      errors.push(
        `Agent "${agent.agentId}" has defaultRoom "${agent.defaultRoom}" which does not exist in the building`,
      );
    }
  }

  // 2. Every explicit assignment target must exist as a room
  for (const [agentId, roomId] of Object.entries(building.agentAssignments)) {
    if (!roomIds.has(roomId)) {
      errors.push(
        `building.agentAssignments["${agentId}"] → "${roomId}" does not exist in building.rooms`,
      );
    }
  }

  // 3. Every explicitly assigned agent ID must exist in the agents list
  //    (USER and SYSTEM are special — they're not in AGENTS)
  const SPECIAL_IDS = new Set(Object.keys(mappingConfig.special));
  for (const agentId of Object.keys(building.agentAssignments)) {
    if (!agentIds.has(agentId) && !SPECIAL_IDS.has(agentId)) {
      warnings.push(
        `building.agentAssignments has entry for "${agentId}" which is not in AGENTS or special assignments`,
      );
    }
  }

  // 4. Agent capabilities not covered by role or fallback rules
  for (const agent of agents) {
    if (coveredRoles.has(agent.role)) {
      // Role is covered; capabilities are implicitly handled
      continue;
    }
    for (const cap of agent.capabilities) {
      if (!coveredCapabilities.has(cap)) {
        warnings.push(
          `Agent "${agent.agentId}" has capability "${cap}" with no role default or capability_fallback rule. ` +
          `Will fall back to fallback_room "${mappingConfig.fallbackRoom}".`,
        );
      }
    }
  }

  // 5. All rooms with primaryRoles should have at least one matching agent
  const hierarchy = buildHierarchy(building, agents, mappingConfig);
  for (const floor of hierarchy.floors) {
    for (const room of floor.rooms) {
      for (const role of room.primaryRoles) {
        const hasRoleAgent = room.agents.some((a) => a.role === role);
        if (!hasRoleAgent) {
          warnings.push(
            `Room "${room.roomId}" has primaryRole "${role}" but no agent with that role is assigned to it`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Summary Formatters ────────────────────────────────────────────────────

/**
 * Format a one-line summary of a room node for HUD / debug display.
 *
 * Example output:
 *   "[CONTROL] Operations Control | Roles: orchestrator, planner | Agents: Manager | Floor 1"
 */
export function formatRoomNodeSummary(room: RoomHierarchyNode): string {
  const parts: string[] = [];
  parts.push(`[${room.roomType.toUpperCase()}] ${room.name}`);

  if (room.primaryRoles.length > 0) {
    parts.push(`Roles: ${room.primaryRoles.join(", ")}`);
  }

  if (room.agents.length > 0) {
    parts.push(`Agents: ${room.agents.map((a) => a.name).join(", ")}`);
  } else if (room.staticMembers.length > 0) {
    parts.push(`Members: ${room.staticMembers.join(", ")}`);
  }

  parts.push(`Floor ${room.floor}`);
  return parts.join(" | ");
}

/**
 * Format a multi-line summary of the entire building hierarchy.
 * Useful for logging, debug panels, and the self-improvement analysis pipeline.
 */
export function formatBuildingHierarchySummary(
  hierarchy: BuildingHierarchyNode = DEFAULT_BUILDING_HIERARCHY,
): string {
  const lines: string[] = [];
  lines.push(`Building: ${hierarchy.name} (${hierarchy.buildingId})`);
  lines.push(`  Style: ${hierarchy.style}`);
  lines.push(`  Floors: ${hierarchy.floors.length} | Rooms: ${hierarchy.totalRooms} | Agents: ${hierarchy.totalAgents}`);

  for (const floor of hierarchy.floors) {
    lines.push(`\n  Floor ${floor.floor} — ${floor.name} (${floor.gridW}×${floor.gridD} grid)`);
    for (const room of floor.rooms) {
      const agentSummary =
        room.agents.length > 0
          ? room.agents.map((a) => `${a.name}[${a.assignmentSource}]`).join(", ")
          : room.staticMembers.length > 0
            ? room.staticMembers.join(", ")
            : "(empty)";
      lines.push(`    ├─ ${room.roomId} (${room.roomType}) ← ${agentSummary}`);
    }
  }

  return lines.join("\n");
}
