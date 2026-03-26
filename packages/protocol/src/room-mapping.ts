/**
 * @module room-mapping
 * Default room mapping configuration — assigns agent roles/capabilities
 * to predefined rooms with sensible defaults.
 *
 * Resolution order:
 *   1. Explicit override (agentAssignments in BuildingDef)
 *   2. Role-based default
 *   3. Capability-based fallback
 *   4. Global fallback room
 *
 * Config source: .agent/rooms/_room-mapping.yaml
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Known agent roles that map to rooms */
export type AgentRole =
  | "orchestrator"
  | "implementer"
  | "researcher"
  | "validator"
  | "reviewer"
  | "planner"
  | "analyst"
  | "tester";

/** A single role→room mapping entry */
export interface RoleRoomMapping {
  roomId: string;
  /** Lower = higher priority (1 = primary occupant) */
  priority: number;
  /** Human-readable reason for this assignment */
  reason: string;
}

/** A capability→room fallback entry */
export interface CapabilityFallback {
  capability: string;
  roomId: string;
  reason: string;
}

/** Special (non-agent) entity assignment */
export interface SpecialAssignment {
  roomId: string;
  reason: string;
}

/** Complete room mapping configuration */
export interface RoomMappingConfig {
  schemaVersion: number;
  /** Role → default room mapping */
  roleDefaults: Record<AgentRole, RoleRoomMapping>;
  /** Ordered list of capability-based fallbacks */
  capabilityFallbacks: CapabilityFallback[];
  /** Room used when no match is found */
  fallbackRoom: string;
  fallbackReason: string;
  /** Non-agent entity assignments */
  special: Record<string, SpecialAssignment>;
}

// ---------------------------------------------------------------------------
// Default Configuration (mirrors .agent/rooms/_room-mapping.yaml)
// ---------------------------------------------------------------------------

export const DEFAULT_ROOM_MAPPING: RoomMappingConfig = {
  schemaVersion: 1,
  roleDefaults: {
    orchestrator: {
      roomId: "ops-control",
      priority: 1,
      reason: "Orchestrators command from the control room",
    },
    implementer: {
      roomId: "impl-office",
      priority: 1,
      reason: "Implementers work in the implementation office",
    },
    researcher: {
      roomId: "research-lab",
      priority: 1,
      reason: "Researchers operate from the research lab",
    },
    validator: {
      roomId: "validation-office",
      priority: 1,
      reason: "Validators review from the validation office",
    },
    reviewer: {
      roomId: "review-office",
      priority: 1,
      reason: "Reviewers inspect from the review office",
    },
    planner: {
      roomId: "ops-control",
      priority: 2,
      reason: "Planners share the control room with orchestrators",
    },
    analyst: {
      roomId: "research-lab",
      priority: 2,
      reason: "Analysts share the research lab",
    },
    tester: {
      roomId: "validation-office",
      priority: 2,
      reason: "Testers share the validation office",
    },
  },
  capabilityFallbacks: [
    { capability: "code-change", roomId: "impl-office", reason: "Agents with code-change capability go to impl office" },
    { capability: "patching", roomId: "impl-office", reason: "Patching agents go to impl office" },
    { capability: "repo-map", roomId: "research-lab", reason: "Repo-map agents go to research lab" },
    { capability: "impact-analysis", roomId: "research-lab", reason: "Impact-analysis agents go to research lab" },
    { capability: "context-gathering", roomId: "research-lab", reason: "Context-gathering agents go to research lab" },
    { capability: "verify", roomId: "validation-office", reason: "Verify-capable agents go to validation office" },
    { capability: "review", roomId: "validation-office", reason: "Review-capable agents go to validation office" },
    { capability: "ui-review", roomId: "review-office", reason: "UI-review agents go to review office" },
    { capability: "accessibility-scan", roomId: "review-office", reason: "Accessibility agents go to review office" },
    { capability: "planning", roomId: "ops-control", reason: "Planning agents go to ops control" },
    { capability: "delegation", roomId: "ops-control", reason: "Delegation agents go to ops control" },
    { capability: "workflow-control", roomId: "ops-control", reason: "Workflow-control agents go to ops control" },
    { capability: "approval-boundary", roomId: "ops-control", reason: "Approval-boundary agents co-locate with orchestrators in ops control" },
    { capability: "task-execution", roomId: "impl-office", reason: "Task-execution agents work from the implementation office" },
    { capability: "release-gate", roomId: "validation-office", reason: "Release-gate agents operate from the validation office" },
    { capability: "frontend-refactor-planning", roomId: "review-office", reason: "Frontend-refactor-planning agents work from the review office" },
  ],
  fallbackRoom: "project-main",
  fallbackReason: "Unmatched agents default to the project lobby",
  special: {
    USER: { roomId: "project-main", reason: "The operator enters via the project lobby" },
    SYSTEM: { roomId: "ops-control", reason: "System-level events originate from ops control" },
  },
};

// ---------------------------------------------------------------------------
// Known roles set for validation
// ---------------------------------------------------------------------------

export const KNOWN_ROLES: ReadonlySet<string> = new Set<string>(
  Object.keys(DEFAULT_ROOM_MAPPING.roleDefaults),
);

export function isKnownRole(role: string): role is AgentRole {
  return KNOWN_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Resolution Logic
// ---------------------------------------------------------------------------

export interface AgentDescriptor {
  agentId: string;
  role?: string;
  capabilities?: string[];
}

export interface RoomResolution {
  roomId: string;
  reason: string;
  source: "explicit" | "role" | "capability" | "special" | "fallback";
}

/**
 * Resolve the default room for an agent using the mapping config.
 *
 * @param agent       - Agent descriptor (id, role, capabilities)
 * @param overrides   - Explicit agent→room overrides (from BuildingDef.agentAssignments)
 * @param config      - Room mapping config (defaults to DEFAULT_ROOM_MAPPING)
 * @returns Resolution result with roomId, reason, and source
 */
export function resolveAgentRoom(
  agent: AgentDescriptor,
  overrides: Record<string, string> = {},
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): RoomResolution {
  // 1. Explicit override
  const explicit = overrides[agent.agentId];
  if (explicit) {
    return {
      roomId: explicit,
      reason: `Explicit assignment for ${agent.agentId}`,
      source: "explicit",
    };
  }

  // 2. Special entity check
  const special = config.special[agent.agentId];
  if (special) {
    return {
      roomId: special.roomId,
      reason: special.reason,
      source: "special",
    };
  }

  // 3. Role-based default
  if (agent.role && isKnownRole(agent.role)) {
    const mapping = config.roleDefaults[agent.role];
    return {
      roomId: mapping.roomId,
      reason: mapping.reason,
      source: "role",
    };
  }

  // 4. Capability-based fallback
  if (agent.capabilities && agent.capabilities.length > 0) {
    for (const fb of config.capabilityFallbacks) {
      if (agent.capabilities.includes(fb.capability)) {
        return {
          roomId: fb.roomId,
          reason: fb.reason,
          source: "capability",
        };
      }
    }
  }

  // 5. Global fallback
  return {
    roomId: config.fallbackRoom,
    reason: config.fallbackReason,
    source: "fallback",
  };
}

/**
 * Resolve rooms for multiple agents at once.
 * Returns a map of agentId → RoomResolution.
 */
export function resolveAllAgentRooms(
  agents: AgentDescriptor[],
  overrides: Record<string, string> = {},
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): Record<string, RoomResolution> {
  const result: Record<string, RoomResolution> = {};
  for (const agent of agents) {
    result[agent.agentId] = resolveAgentRoom(agent, overrides, config);
  }
  return result;
}

/**
 * Get all rooms that have at least one role mapped to them.
 * Useful for determining which rooms should be "active" in the 3D scene.
 */
export function getMappedRoomIds(
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): string[] {
  const roomIds = new Set<string>();
  for (const mapping of Object.values(config.roleDefaults)) {
    roomIds.add(mapping.roomId);
  }
  for (const fb of config.capabilityFallbacks) {
    roomIds.add(fb.roomId);
  }
  for (const s of Object.values(config.special)) {
    roomIds.add(s.roomId);
  }
  roomIds.add(config.fallbackRoom);
  return [...roomIds];
}

/**
 * Get all roles mapped to a specific room.
 */
export function getRolesForRoom(
  roomId: string,
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): AgentRole[] {
  const roles: AgentRole[] = [];
  for (const [role, mapping] of Object.entries(config.roleDefaults)) {
    if (mapping.roomId === roomId) {
      roles.push(role as AgentRole);
    }
  }
  return roles;
}
