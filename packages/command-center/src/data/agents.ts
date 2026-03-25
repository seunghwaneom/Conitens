/**
 * Agent persona definitions — derived from .agent/agents/*.yaml.
 *
 * Each agent has:
 *   - Identity (id, display name, role)
 *   - Capabilities and risk classification
 *   - Visual config (color, icon) for the 3D avatar
 *   - Default room assignment (from building.agentAssignments)
 *
 * These are the canonical agent definitions for the 3D command center.
 * In production, loaded dynamically from YAML; embedded here for fast iteration.
 */

// ── Types ──────────────────────────────────────────────────────────

export type AgentRole =
  | "orchestrator"
  | "implementer"
  | "researcher"
  | "reviewer"
  | "validator";

export type AgentStatus =
  | "inactive"   // Pre-placed, not yet spawned
  | "idle"       // Spawned but waiting for work
  | "active"     // Currently working on a task
  | "busy"       // Heavy workload
  | "error"      // Error state
  | "terminated" // Shut down
  ;

/**
 * Coarse-grained lifecycle state for the agent state machine.
 * Mirrors RFC-1.0.1 §4 AgentLifecycleState from @conitens/protocol.
 * Used for per-agent lifecycle tracking in the 3D command center.
 *
 * State machine:
 *   initializing → [ready, crashed]
 *   ready        → [active, paused, terminating, crashed]
 *   active       → [paused, suspended, migrating, terminating, crashed]
 *   paused       → [active, terminating, crashed]
 *   suspended    → [active, paused, terminating, crashed]
 *   migrating    → [terminated, crashed]
 *   terminating  → [terminated, crashed]
 *   terminated, crashed → [] (terminal states)
 */
export type AgentLifecycleState =
  | "initializing"  // Agent persona loading / setup
  | "ready"         // Persona loaded, waiting for first task
  | "active"        // Executing a task
  | "paused"        // Execution suspended (user or system hold)
  | "suspended"     // Long-term hold, resources released
  | "migrating"     // State transfer in progress
  | "terminating"   // Graceful shutdown in progress
  | "terminated"    // Agent process has ended gracefully
  | "crashed";      // Agent ended unexpectedly

/** Valid lifecycle state transitions. */
export const AGENT_LIFECYCLE_TRANSITIONS: Record<AgentLifecycleState, readonly AgentLifecycleState[]> = {
  initializing: ["ready", "crashed"],
  ready:        ["active", "paused", "terminating", "crashed"],
  active:       ["paused", "suspended", "migrating", "terminating", "crashed"],
  paused:       ["active", "terminating", "crashed"],
  suspended:    ["active", "paused", "terminating", "crashed"],
  migrating:    ["terminated", "crashed"],
  terminating:  ["terminated", "crashed"],
  terminated:   [],
  crashed:      [],
};

/** Returns true if the lifecycle transition prev → next is valid. */
export function isValidLifecycleTransition(
  prev: AgentLifecycleState,
  next: AgentLifecycleState,
): boolean {
  return (AGENT_LIFECYCLE_TRANSITIONS[prev] as readonly AgentLifecycleState[]).includes(next);
}

/** Terminal lifecycle states — no transitions possible. */
export const TERMINAL_LIFECYCLE_STATES = new Set<AgentLifecycleState>(["terminated", "crashed"]);

export type RiskClass = "low" | "medium" | "high";

export interface AgentDef {
  agentId: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  riskClass: RiskClass;
  summary: string;
  /** Visual configuration for 3D avatar */
  visual: {
    /** Primary color — matches room accent */
    color: string;
    /** Emissive glow color */
    emissive: string;
    /** Unicode icon for HUD labels */
    icon: string;
    /** Short label (3-4 chars) */
    label: string;
  };
  /** Default room assignment */
  defaultRoom: string;
}

// ── Role → Visual Mapping ──────────────────────────────────────────

const ROLE_COLORS: Record<AgentRole, { color: string; emissive: string; icon: string; label: string }> = {
  orchestrator: { color: "#FF7043", emissive: "#FF4500", icon: "♛", label: "MGR" },
  implementer:  { color: "#66BB6A", emissive: "#33AA33", icon: "⚙", label: "IMP" },
  researcher:   { color: "#AB47BC", emissive: "#9933CC", icon: "🔬", label: "RES" },
  reviewer:     { color: "#42A5F5", emissive: "#2196F3", icon: "👁", label: "REV" },
  validator:    { color: "#EF5350", emissive: "#F44336", icon: "🛡", label: "VAL" },
};

// ── Agent Definitions ──────────────────────────────────────────────

export const AGENTS: AgentDef[] = [
  {
    agentId: "manager-default",
    name: "Manager",
    role: "orchestrator",
    capabilities: ["planning", "delegation", "workflow-control", "approval-boundary"],
    riskClass: "medium",
    summary: "Keeps conversation ownership and delegates bounded work through typed handoffs.",
    visual: ROLE_COLORS.orchestrator,
    defaultRoom: "ops-control",
  },
  {
    agentId: "implementer-subagent",
    name: "Implementer",
    role: "implementer",
    capabilities: ["code-change", "patching", "task-execution"],
    riskClass: "medium",
    summary: "Owns bounded implementation steps behind gate and verify rules.",
    visual: ROLE_COLORS.implementer,
    defaultRoom: "impl-office",
  },
  {
    agentId: "researcher-subagent",
    name: "Researcher",
    role: "researcher",
    capabilities: ["repo-map", "impact-analysis", "context-gathering"],
    riskClass: "low",
    summary: "Handles read-heavy discovery and research substeps.",
    visual: ROLE_COLORS.researcher,
    defaultRoom: "research-lab",
  },
  {
    agentId: "frontend-reviewer",
    name: "Frontend Reviewer",
    role: "reviewer",
    capabilities: ["ui-review", "frontend-refactor-planning", "accessibility-scan"],
    riskClass: "low",
    summary: "Reviews frontend surfaces against heuristics and returns bounded refactor guidance.",
    visual: ROLE_COLORS.reviewer,
    defaultRoom: "review-office",
  },
  {
    agentId: "validator-sentinel",
    name: "Validator",
    role: "validator",
    capabilities: ["verify", "review", "release-gate"],
    riskClass: "high",
    summary: "Checks verify evidence before completion and surfaces blockers.",
    visual: ROLE_COLORS.validator,
    defaultRoom: "validation-office",
  },
];

/** Map: agentId → AgentDef */
export const AGENT_MAP: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.agentId, a]),
);

/** Get agent definition by ID */
export function getAgentDef(agentId: string): AgentDef | undefined {
  return AGENT_MAP[agentId];
}

/** Get all agents assigned to a specific room */
export function getAgentsForRoom(roomId: string): AgentDef[] {
  return AGENTS.filter((a) => a.defaultRoom === roomId);
}

/**
 * Create a minimal AgentDef for a dynamically spawned agent.
 * Used by the dynamic agent registry when registering a runtime agent.
 */
export function createDynamicAgentDef(
  agentId: string,
  name: string,
  role: AgentRole,
  defaultRoom: string,
  options?: Partial<Omit<AgentDef, "agentId" | "name" | "role" | "defaultRoom">>,
): AgentDef {
  const roleVisual = ROLE_COLORS[role] ?? ROLE_COLORS.implementer;
  return {
    agentId,
    name,
    role,
    capabilities: options?.capabilities ?? [],
    riskClass: options?.riskClass ?? "low",
    summary: options?.summary ?? `Dynamically registered ${role} agent`,
    visual: options?.visual ?? roleVisual,
    defaultRoom,
  };
}
