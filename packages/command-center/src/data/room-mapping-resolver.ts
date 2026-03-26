/**
 * room-mapping-resolver.ts — Integrates protocol room-mapping with the 3D scene.
 *
 * Bridges the protocol-level room mapping configuration with the
 * command-center's BuildingDef and spatial store. When a new agent
 * appears (spawned event), this resolver determines which room it
 * should be placed in.
 *
 * Uses event sourcing: all assignment decisions are recorded as
 * spatial events for replay and audit.
 */
import type { BuildingDef, RoomDef } from "./building.js";

// ---------------------------------------------------------------------------
// Types (mirrored from @conitens/protocol to avoid hard dep during bootstrap)
// ---------------------------------------------------------------------------

export type AgentRole =
  | "orchestrator" | "implementer" | "researcher"
  | "validator" | "reviewer" | "planner" | "analyst" | "tester";

export interface RoleRoomMapping {
  roomId: string;
  priority: number;
  reason: string;
}

export interface CapabilityFallback {
  capability: string;
  roomId: string;
  reason: string;
}

export interface SpecialAssignment {
  roomId: string;
  reason: string;
}

export interface RoomMappingConfig {
  schemaVersion: number;
  roleDefaults: Record<AgentRole, RoleRoomMapping>;
  capabilityFallbacks: CapabilityFallback[];
  fallbackRoom: string;
  fallbackReason: string;
  special: Record<string, SpecialAssignment>;
}

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

// ---------------------------------------------------------------------------
// Default Config (same data as protocol's DEFAULT_ROOM_MAPPING)
// ---------------------------------------------------------------------------

const KNOWN_ROLES = new Set<string>([
  "orchestrator", "implementer", "researcher", "validator",
  "reviewer", "planner", "analyst", "tester",
]);

export const DEFAULT_ROOM_MAPPING: RoomMappingConfig = {
  schemaVersion: 1,
  roleDefaults: {
    orchestrator: { roomId: "ops-control", priority: 1, reason: "Orchestrators command from the control room" },
    implementer: { roomId: "impl-office", priority: 1, reason: "Implementers work in the implementation office" },
    researcher: { roomId: "research-lab", priority: 1, reason: "Researchers operate from the research lab" },
    validator: { roomId: "validation-office", priority: 1, reason: "Validators review from the validation office" },
    reviewer: { roomId: "review-office", priority: 1, reason: "Reviewers inspect from the review office" },
    planner: { roomId: "ops-control", priority: 2, reason: "Planners share the control room with orchestrators" },
    analyst: { roomId: "research-lab", priority: 2, reason: "Analysts share the research lab" },
    tester: { roomId: "validation-office", priority: 2, reason: "Testers share the validation office" },
  },
  capabilityFallbacks: [
    { capability: "code-change", roomId: "impl-office", reason: "Code-change agents go to impl office" },
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
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the room for an agent using the cascade:
 * explicit → special → role → capability → fallback
 */
export function resolveAgentRoom(
  agent: AgentDescriptor,
  overrides: Record<string, string> = {},
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): RoomResolution {
  // 1. Explicit override
  const explicit = overrides[agent.agentId];
  if (explicit) {
    return { roomId: explicit, reason: `Explicit assignment for ${agent.agentId}`, source: "explicit" };
  }

  // 2. Special entity
  const special = config.special[agent.agentId];
  if (special) {
    return { roomId: special.roomId, reason: special.reason, source: "special" };
  }

  // 3. Role-based
  if (agent.role && KNOWN_ROLES.has(agent.role)) {
    const mapping = config.roleDefaults[agent.role as AgentRole];
    return { roomId: mapping.roomId, reason: mapping.reason, source: "role" };
  }

  // 4. Capability-based
  if (agent.capabilities?.length) {
    for (const fb of config.capabilityFallbacks) {
      if (agent.capabilities.includes(fb.capability)) {
        return { roomId: fb.roomId, reason: fb.reason, source: "capability" };
      }
    }
  }

  // 5. Fallback
  return { roomId: config.fallbackRoom, reason: config.fallbackReason, source: "fallback" };
}

// ---------------------------------------------------------------------------
// Building Integration
// ---------------------------------------------------------------------------

/**
 * Resolve room assignments for all known agents in a building and return
 * an updated agentAssignments record. Uses the building's existing
 * explicit assignments as overrides, then fills in any missing agents
 * via role/capability/fallback resolution.
 */
export function resolveAllBuildingAssignments(
  building: BuildingDef,
  agents: AgentDescriptor[],
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): Record<string, RoomResolution> {
  const result: Record<string, RoomResolution> = {};
  for (const agent of agents) {
    result[agent.agentId] = resolveAgentRoom(agent, building.agentAssignments, config);
  }
  return result;
}

/**
 * Get the RoomDef for an agent, using the mapping resolver.
 * Returns undefined if the resolved room doesn't exist in the building.
 */
export function getResolvedAgentRoom(
  agent: AgentDescriptor,
  building: BuildingDef,
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): { room: RoomDef | undefined; resolution: RoomResolution } {
  const resolution = resolveAgentRoom(agent, building.agentAssignments, config);
  const room = building.rooms.find((r) => r.roomId === resolution.roomId);
  return { room, resolution };
}

/**
 * Get all roles that map to a given room.
 */
export function getRolesForRoom(
  roomId: string,
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): AgentRole[] {
  return (Object.entries(config.roleDefaults) as [AgentRole, RoleRoomMapping][])
    .filter(([, m]) => m.roomId === roomId)
    .map(([role]) => role);
}

/**
 * Get all unique room IDs that have at least one mapping.
 */
export function getMappedRoomIds(
  config: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): string[] {
  const ids = new Set<string>();
  for (const m of Object.values(config.roleDefaults)) ids.add(m.roomId);
  for (const fb of config.capabilityFallbacks) ids.add(fb.roomId);
  for (const s of Object.values(config.special)) ids.add(s.roomId);
  ids.add(config.fallbackRoom);
  return [...ids];
}
