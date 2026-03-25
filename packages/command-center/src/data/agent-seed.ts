/**
 * agent-seed.ts — Static seed dataset of pre-placed agents.
 *
 * Defines the canonical initial positions for all static agents in the
 * 3D command center. Each agent is pre-placed at a specific desk or
 * workstation within their assigned room/office on initial load.
 *
 * Design principles:
 *   - Positions are explicitly specified per agent, not computed at runtime.
 *     This ensures stable, deterministic placement in the 3D scene.
 *   - All seed agents start in "inactive" status and "initializing" lifecycle
 *     state per the agent state machine (AgentStatus + AgentLifecycleState).
 *   - inactiveFlags captures per-agent activation requirements so the
 *     lifecycle control plane (AC 7a) knows whether confirmation is required.
 *   - worldPosition is derived from building.ts room coordinates + localPosition;
 *     it is informational and will be recomputed by the spatial store on load.
 *
 * Coordinate system (mirrors building.ts):
 *   - localPosition: (x, y, z) in [0..1] range relative to the room origin.
 *     x = left-right, y = height (0 = floor), z = front-back.
 *   - worldPosition: localPosition projected into building world space.
 *     x = room.position.x + local.x * room.dimensions.x
 *     y = room.position.y + local.y * room.dimensions.y
 *     z = room.position.z + local.z * room.dimensions.z
 *
 * Inactive state flags:
 *   - isInactive: always true in seed data (agents not yet spawned)
 *   - canBeActivated: can this agent be started via lifecycle controls?
 *   - requiresConfirmation: must user confirm before activation?
 *   - autoActivateOnTask: should the agent auto-start when a task is assigned?
 *
 * Usage:
 *   import { AGENT_INITIAL_PLACEMENTS, getAgentSeed, getSeedForRoom } from './agent-seed.js';
 *
 *   // Look up a specific agent's seed record
 *   const seed = getAgentSeed('manager-default');
 *   console.log(seed?.position.worldPosition); // { x: 6.5, y: 3, z: 2 }
 *
 *   // Get all agents in a room
 *   const opsAgents = getSeedForRoom('ops-control');
 *
 * AC traceability:
 *   Sub-AC 2a: agent data model with initial positions and inactive state flags.
 */

import type { AgentStatus, AgentLifecycleState } from "./agents.js";
import type { RoomType } from "./building.js";

// ── Initial Position Model ────────────────────────────────────────────────

/**
 * Explicit 3D position for an agent at the start of a session.
 *
 * localPosition is the authoritative value — worldPosition is derived and
 * provided for convenience/documentation only. The spatial store will
 * recompute worldPosition once the building is fully loaded.
 */
export interface AgentInitialPosition {
  /**
   * Position relative to the room origin, in [0..1] range.
   * (0.5, 0, 0.5) = room centre at floor level.
   */
  localPosition: { x: number; y: number; z: number };
  /**
   * Pre-computed world-space position (room.position + local * room.dimensions).
   * Recalculated by spatial store on building load; provided here for reference.
   */
  worldPosition: { x: number; y: number; z: number };
  /**
   * Name of the furniture slot this agent is positioned at.
   * Matches a FurnitureSlot.type value in the room's furniture array.
   * Null for agents that don't sit at a specific piece of furniture.
   */
  furnitureSlot: string | null;
}

// ── Inactive State Flags ──────────────────────────────────────────────────

/**
 * Per-agent inactive state configuration.
 *
 * All seed agents start as inactive (not yet spawned into the active
 * orchestrator pool). These flags determine how the lifecycle control
 * plane (AC 7a) handles activation.
 *
 * Design:
 *   - isInactive is always `true` in the seed — it is a type literal
 *     to make seed records distinguishable from runtime states.
 *   - canBeActivated governs whether the "Start" button is available.
 *   - requiresConfirmation gates high-risk agents behind a confirm dialog.
 *   - autoActivateOnTask is a hint for the orchestrator to start the agent
 *     automatically when the first task is dispatched to it.
 */
export interface AgentInactiveStateFlags {
  /** Discriminant: always `true` in seed records. */
  readonly isInactive: true;
  /**
   * Whether this agent can be activated via lifecycle controls.
   * All pre-placed static agents support activation; dynamic agents
   * may set this to false if they are placeholders only.
   */
  canBeActivated: boolean;
  /**
   * Whether activating this agent requires explicit user confirmation.
   * Recommended for high-risk agents (riskClass = "high") to prevent
   * accidental spawning of destructive operations.
   */
  requiresConfirmation: boolean;
  /**
   * Whether the agent should auto-start when a task is assigned to it.
   * If true, assigning a task to this agent implicitly transitions it
   * from inactive → idle → active without a separate lifecycle command.
   */
  autoActivateOnTask: boolean;
  /**
   * Human-readable explanation of why the agent starts inactive.
   * Shown in the lifecycle control panel HUD tooltip.
   */
  inactiveReason: string;
}

// ── Agent Seed Record ─────────────────────────────────────────────────────

/**
 * Complete seed record for a single pre-placed agent.
 *
 * Combines identity, spatial placement, and inactive state configuration
 * into one value object. Consumed by agent-store.ts during initializeAgents()
 * and by the 3D scene to place inactive avatars at startup.
 */
export interface AgentSeedRecord {
  /** Agent unique identifier — matches AgentDef.agentId */
  agentId: string;
  /** Human-readable display name */
  name: string;
  /** Room this agent is assigned to */
  roomId: string;
  /** Floor index (0 = ground floor, 1 = operations floor) */
  floor: number;
  /** Functional room type — influences HUD rendering */
  officeType: RoomType;
  /** Initial 3D position within the room */
  position: AgentInitialPosition;
  /** Initial lifecycle flags (all agents start inactive) */
  inactiveFlags: AgentInactiveStateFlags;
  /**
   * Initial operational status.
   * Always "inactive" in the seed dataset — set as a literal type
   * so callers can narrow without runtime checks.
   */
  initialStatus: Extract<AgentStatus, "inactive">;
  /**
   * Initial lifecycle state machine position.
   * Always "initializing" in the seed dataset.
   */
  initialLifecycleState: Extract<AgentLifecycleState, "initializing">;
  /**
   * Spawn stagger index — controls fade-in animation order in the 3D scene.
   * Lower index = fades in earlier. 0-based across all seeded agents.
   */
  spawnIndex: number;
}

// ── Static Seed Dataset ───────────────────────────────────────────────────

/**
 * AGENT_INITIAL_PLACEMENTS — canonical seed dataset for all 5 static agents.
 *
 * Agent positions are derived from the furniture layout in building.ts:
 *
 *   manager-default   → ops-control command-desk        (floor 1)
 *   implementer-subagent → impl-office workstation      (floor 1)
 *   researcher-subagent  → research-lab analysis-desk   (floor 1)
 *   validator-sentinel   → validation-office review-desk (floor 1)
 *   frontend-reviewer    → review-office review-desk     (floor 1)
 *
 * World-space computation reference (all rooms on floor 1, y-base = 3):
 *   worldPos.x = room.position.x + localPos.x * room.dimensions.x
 *   worldPos.y = room.position.y + localPos.y * room.dimensions.y
 *   worldPos.z = room.position.z + localPos.z * room.dimensions.z
 *
 * This array is append-only — do not mutate entries. To register a dynamic
 * agent use agent-store.ts registerAgent() instead.
 */
export const AGENT_INITIAL_PLACEMENTS: Readonly<AgentSeedRecord[]> = Object.freeze([
  // ── Floor 1: Operations Floor ────────────────────────────────────────────

  /**
   * Manager (Orchestrator) — Operations Control
   *
   * Room: ops-control  position {x:4, y:3, z:0}  dimensions {x:5, y:3, z:4}
   * Desk: command-desk (local 2.5, 0, 2)
   * Local:  (2.5/5=0.50, 0, 2/4=0.50)
   * World:  (4+0.5*5=6.5, 3+0*3=3.0, 0+0.5*4=2.0)
   */
  {
    agentId: "manager-default",
    name: "Manager",
    roomId: "ops-control",
    floor: 1,
    officeType: "control",
    position: {
      localPosition: { x: 0.50, y: 0, z: 0.50 },
      worldPosition: { x: 6.50, y: 3.0, z: 2.00 },
      furnitureSlot: "command-desk",
    },
    inactiveFlags: {
      isInactive: true,
      canBeActivated: true,
      requiresConfirmation: true,   // Orchestrator spawning is high-impact
      autoActivateOnTask: false,
      inactiveReason:
        "Orchestrator agent requires explicit start — initiates delegation chains and approval flows.",
    },
    initialStatus: "inactive",
    initialLifecycleState: "initializing",
    spawnIndex: 0,
  },

  /**
   * Implementer (Code executor) — Implementation Office
   *
   * Room: impl-office  position {x:0, y:3, z:0}  dimensions {x:4, y:3, z:3}
   * Desk: workstation-1 (local 1, 0, 1.5)
   * Local:  (1/4=0.25, 0, 1.5/3=0.50)
   * World:  (0+0.25*4=1.0, 3+0*3=3.0, 0+0.5*3=1.5)
   */
  {
    agentId: "implementer-subagent",
    name: "Implementer",
    roomId: "impl-office",
    floor: 1,
    officeType: "office",
    position: {
      localPosition: { x: 0.25, y: 0, z: 0.50 },
      worldPosition: { x: 1.00, y: 3.0, z: 1.50 },
      furnitureSlot: "workstation",
    },
    inactiveFlags: {
      isInactive: true,
      canBeActivated: true,
      requiresConfirmation: false,
      autoActivateOnTask: true,     // Auto-starts when implementation task arrives
      inactiveReason:
        "Standing by for implementation tasks. Will activate automatically on task assignment.",
    },
    initialStatus: "inactive",
    initialLifecycleState: "initializing",
    spawnIndex: 1,
  },

  /**
   * Researcher (Context gatherer) — Research Lab
   *
   * Room: research-lab  position {x:0, y:3, z:3}  dimensions {x:4, y:3, z:3}
   * Desk: analysis-desk (local 2, 0, 1.5)
   * Local:  (2/4=0.50, 0, 1.5/3=0.50)
   * World:  (0+0.5*4=2.0, 3+0*3=3.0, 3+0.5*3=4.5)
   */
  {
    agentId: "researcher-subagent",
    name: "Researcher",
    roomId: "research-lab",
    floor: 1,
    officeType: "lab",
    position: {
      localPosition: { x: 0.50, y: 0, z: 0.50 },
      worldPosition: { x: 2.00, y: 3.0, z: 4.50 },
      furnitureSlot: "analysis-desk",
    },
    inactiveFlags: {
      isInactive: true,
      canBeActivated: true,
      requiresConfirmation: false,
      autoActivateOnTask: true,     // Auto-starts when research task arrives
      inactiveReason:
        "Standing by for context-gathering tasks. Low-risk; activates automatically on assignment.",
    },
    initialStatus: "inactive",
    initialLifecycleState: "initializing",
    spawnIndex: 2,
  },

  /**
   * Validator (Release gate) — Validation Office
   *
   * Room: validation-office  position {x:9, y:3, z:0}  dimensions {x:3, y:3, z:3}
   * Desk: review-desk (local 1.5, 0, 1.5)
   * Local:  (1.5/3=0.50, 0, 1.5/3=0.50)
   * World:  (9+0.5*3=10.5, 3+0*3=3.0, 0+0.5*3=1.5)
   */
  {
    agentId: "validator-sentinel",
    name: "Validator",
    roomId: "validation-office",
    floor: 1,
    officeType: "office",
    position: {
      localPosition: { x: 0.50, y: 0, z: 0.50 },
      worldPosition: { x: 10.50, y: 3.0, z: 1.50 },
      furnitureSlot: "review-desk",
    },
    inactiveFlags: {
      isInactive: true,
      canBeActivated: true,
      requiresConfirmation: true,   // Validator controls release gates — high risk
      autoActivateOnTask: false,
      inactiveReason:
        "Release-gate agent. Requires explicit activation — controls pipeline approval decisions.",
    },
    initialStatus: "inactive",
    initialLifecycleState: "initializing",
    spawnIndex: 3,
  },

  /**
   * Frontend Reviewer (UI/UX auditor) — Frontend Review Office
   *
   * Room: review-office  position {x:9, y:3, z:3}  dimensions {x:3, y:3, z:3}
   * Desk: review-desk (local 1.5, 0, 1.5)
   * Local:  (1.5/3=0.50, 0, 1.5/3=0.50)
   * World:  (9+0.5*3=10.5, 3+0*3=3.0, 3+0.5*3=4.5)
   */
  {
    agentId: "frontend-reviewer",
    name: "Frontend Reviewer",
    roomId: "review-office",
    floor: 1,
    officeType: "office",
    position: {
      localPosition: { x: 0.50, y: 0, z: 0.50 },
      worldPosition: { x: 10.50, y: 3.0, z: 4.50 },
      furnitureSlot: "review-desk",
    },
    inactiveFlags: {
      isInactive: true,
      canBeActivated: true,
      requiresConfirmation: false,
      autoActivateOnTask: true,     // Auto-starts when UI review task arrives
      inactiveReason:
        "Standing by for UI/accessibility review tasks. Activates automatically on assignment.",
    },
    initialStatus: "inactive",
    initialLifecycleState: "initializing",
    spawnIndex: 4,
  },
]);

// ── Lookup Map ────────────────────────────────────────────────────────────

/**
 * Pre-computed O(1) lookup: agentId → AgentSeedRecord.
 * Avoids linear scans in hot rendering paths.
 */
export const AGENT_SEED_MAP: Readonly<Record<string, AgentSeedRecord>> = Object.freeze(
  Object.fromEntries(AGENT_INITIAL_PLACEMENTS.map((s) => [s.agentId, s])),
);

/**
 * Pre-computed O(1) lookup: roomId → AgentSeedRecord[].
 * Used by the 3D scene to query all inactive avatars for a given room.
 */
export const ROOM_SEED_MAP: Readonly<Record<string, readonly AgentSeedRecord[]>> = Object.freeze(
  AGENT_INITIAL_PLACEMENTS.reduce<Record<string, AgentSeedRecord[]>>((acc, seed) => {
    if (!acc[seed.roomId]) acc[seed.roomId] = [];
    acc[seed.roomId].push(seed);
    return acc;
  }, {}),
);

// ── Query Helpers ─────────────────────────────────────────────────────────

/**
 * Get the seed record for a specific agent.
 * Returns undefined if the agent is not in the static seed dataset.
 */
export function getAgentSeed(agentId: string): AgentSeedRecord | undefined {
  return AGENT_SEED_MAP[agentId];
}

/**
 * Get all seed records for agents placed in a specific room.
 * Returns an empty array if no agents are seeded for that room.
 */
export function getSeedForRoom(roomId: string): readonly AgentSeedRecord[] {
  return ROOM_SEED_MAP[roomId] ?? [];
}

/**
 * Get all seed records for agents on a specific floor.
 */
export function getSeedForFloor(floor: number): readonly AgentSeedRecord[] {
  return AGENT_INITIAL_PLACEMENTS.filter((s) => s.floor === floor);
}

/**
 * Get all seed records that require confirmation to activate.
 * Used by the lifecycle control panel to know which "Start" buttons
 * should show a confirmation dialog.
 */
export function getConfirmationRequiredSeeds(): readonly AgentSeedRecord[] {
  return AGENT_INITIAL_PLACEMENTS.filter((s) => s.inactiveFlags.requiresConfirmation);
}

/**
 * Get all seed records that auto-activate on task assignment.
 * Used by the task store when a task is assigned to a currently inactive agent.
 */
export function getAutoActivateSeeds(): readonly AgentSeedRecord[] {
  return AGENT_INITIAL_PLACEMENTS.filter((s) => s.inactiveFlags.autoActivateOnTask);
}

/**
 * Compute the world-space position of an agent given a room's position/dimensions
 * and the agent's local position from the seed record.
 *
 * This mirrors the computation in agent-store.ts computeWorldPosition().
 * Provided here so the seed data can be validated independently.
 *
 * @param localPos - Local position from AgentInitialPosition.localPosition
 * @param roomPosition - Room origin in world space (RoomDef.position)
 * @param roomDimensions - Room extents (RoomDef.dimensions)
 */
export function computeWorldFromLocal(
  localPos: { x: number; y: number; z: number },
  roomPosition: { x: number; y: number; z: number },
  roomDimensions: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: roomPosition.x + localPos.x * roomDimensions.x,
    y: roomPosition.y + localPos.y * roomDimensions.y,
    z: roomPosition.z + localPos.z * roomDimensions.z,
  };
}

/**
 * Validate that the pre-computed worldPosition in a seed record is consistent
 * with a given room's position and dimensions.
 *
 * Returns true if the stored worldPosition matches the computed value within
 * a tolerance of 0.001 units (to handle floating-point rounding).
 */
export function validateSeedWorldPosition(
  seed: AgentSeedRecord,
  roomPosition: { x: number; y: number; z: number },
  roomDimensions: { x: number; y: number; z: number },
  tolerance = 0.001,
): boolean {
  const computed = computeWorldFromLocal(seed.position.localPosition, roomPosition, roomDimensions);
  const stored = seed.position.worldPosition;
  return (
    Math.abs(computed.x - stored.x) <= tolerance &&
    Math.abs(computed.y - stored.y) <= tolerance &&
    Math.abs(computed.z - stored.z) <= tolerance
  );
}

/**
 * Format a one-line summary of a seed record for debug display.
 *
 * Example:
 *   "[inactive] manager-default  ops-control/control  F1  pos(6.5, 3.0, 2.0)  confirmRequired"
 */
export function formatSeedSummary(seed: AgentSeedRecord): string {
  const pos = seed.position.worldPosition;
  const flags: string[] = [];
  if (seed.inactiveFlags.requiresConfirmation) flags.push("confirmRequired");
  if (seed.inactiveFlags.autoActivateOnTask) flags.push("autoActivate");
  const flagStr = flags.length > 0 ? `  ${flags.join(", ")}` : "";
  return (
    `[${seed.initialStatus}] ${seed.agentId.padEnd(24)} ` +
    `${seed.roomId}/${seed.officeType}  ` +
    `F${seed.floor}  ` +
    `pos(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})` +
    flagStr
  );
}

/**
 * Format a multi-line summary of the entire seed dataset.
 * Useful for logging during startup, self-improvement analysis, and debug panels.
 */
export function formatSeedDatasetSummary(): string {
  const lines: string[] = [
    `Agent Seed Dataset — ${AGENT_INITIAL_PLACEMENTS.length} agents pre-placed`,
    `${"─".repeat(72)}`,
  ];
  for (const seed of AGENT_INITIAL_PLACEMENTS) {
    lines.push(`  ${formatSeedSummary(seed)}`);
  }
  const confirmCount = getConfirmationRequiredSeeds().length;
  const autoCount = getAutoActivateSeeds().length;
  lines.push(`${"─".repeat(72)}`);
  lines.push(`  Require confirmation: ${confirmCount}  |  Auto-activate on task: ${autoCount}`);
  return lines.join("\n");
}
