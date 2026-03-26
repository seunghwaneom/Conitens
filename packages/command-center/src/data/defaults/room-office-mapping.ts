/**
 * room-office-mapping.ts — Static defaults: room-to-office mapping
 *   for the Conitens 3D Command Center.
 *
 * Sub-AC 12 (Sub-AC 1): Define default room-to-office mapping configuration
 * (static defaults file/schema) specifying which agent types and infrastructure
 * entities belong to which rooms by default.
 *
 * Design principles:
 *   - THREE-LEVEL ONTOLOGY: Every entity is classified as domain, infrastructure,
 *     or meta — additions to infrastructure/meta levels must not regress domain behavior.
 *   - STATIC: Zero I/O on import. All defaults are inlined constants.
 *   - SCHEMA-VERSIONED: configVersion on every config enables safe migration.
 *   - BEHAVIORAL CONTRACTS: Each mapping entry declares what the entity CAN DO
 *     (behavioral_contract), not just what it IS (noun-verb symmetry principle).
 *   - RECORD TRANSPARENCY: Every assignment carries a rationale string; the
 *     defaults are append-only-auditable and traceable.
 *   - REFLEXIVE CLOSURE: The meta layer maps the mapping system itself, enabling
 *     self-improvement analysis of this very file.
 *
 * Ontology levels (stratified, non-regressing):
 *   DOMAIN       — what exists in the world (agents, tasks, projects, meetings)
 *   INFRASTRUCTURE — how the system processes intent (EventLog, pipelines, buses)
 *   META         — how the system observes and evolves itself (telemetry, schema,
 *                  self-improvement, feedback)
 *
 * Coordinate system: x = width, y = floor height (3 units/floor), z = depth.
 * Room IDs match _building.yaml and room-config-schema.ts verbatim.
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/**
 * Version of the room-office-mapping schema.
 * Increment on any breaking change to EntityRoomMapping, OntologyLevel, or
 * RoomOfficeMappingConfig.
 */
export const ROOM_OFFICE_MAPPING_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Ontology levels
// ---------------------------------------------------------------------------

/**
 * Three-level ontology classification for all entities in the system.
 *
 * The stratification is strict and non-regressing:
 *   domain       — Entities that exist in the world (agents, tasks, projects, users)
 *   infrastructure — Entities that process or route intent (stores, pipelines, buses)
 *   meta         — Entities that observe and evolve the system (telemetry, schema, AI)
 */
export type OntologyLevel = "domain" | "infrastructure" | "meta";

/** All valid ontology levels (ordered: domain < infrastructure < meta) */
export const ONTOLOGY_LEVELS: readonly OntologyLevel[] = [
  "domain",
  "infrastructure",
  "meta",
] as const;

// ---------------------------------------------------------------------------
// Entity categories
// ---------------------------------------------------------------------------

/**
 * Domain entity categories — what exists in the world.
 */
export type DomainEntityCategory =
  | "agent"          // AI agent persona (orchestrator, implementer, etc.)
  | "user"           // Human operator / user session
  | "task"           // Unit of work assigned to an agent
  | "project"        // Top-level project scope
  | "meeting"        // Coordination meeting between agents
  | "command";       // User-issued command (first-class bridging entity)

/**
 * Infrastructure entity categories — how the system processes intent.
 */
export type InfrastructureEntityCategory =
  | "event-log"          // Append-only event log (EventLog)
  | "command-pipeline"   // Command ingestion + routing pipeline
  | "websocket-bus"      // Real-time WebSocket event bus
  | "task-store"         // Task state storage and query layer
  | "agent-spawner"      // Agent lifecycle management (spawn/terminate)
  | "replay-engine"      // Event-log replay and state reconstruction
  | "command-file"       // File-based command ingestion (write-only)
  | "a2a-client"         // Agent-to-Agent protocol client
  | "orchestrator";      // Central orchestrator process

/**
 * Meta entity categories — how the system observes and evolves itself.
 */
export type MetaEntityCategory =
  | "telemetry"           // Telemetry collection (stored separately from EventLog)
  | "schema-registry"     // Schema versioning and migration registry
  | "self-improvement"    // Automated self-analysis and GUI improvement pipeline
  | "feedback-store"      // User/agent feedback collection and analysis
  | "metrics-aggregator"  // Metrics rollup and aggregation engine
  | "topology-graph"      // Network topology and agent connectivity graph
  | "record-audit"        // Record transparency and audit trail management
  | "room-mapping";       // Room mapping system itself (reflexive closure)

/** Union of all entity categories across all three ontology levels */
export type EntityCategory =
  | DomainEntityCategory
  | InfrastructureEntityCategory
  | MetaEntityCategory;

// ---------------------------------------------------------------------------
// Assignment source (mirrors room-mapping-resolver.ts RoomResolution)
// ---------------------------------------------------------------------------

/**
 * How the room assignment was determined — mirrors the resolution cascade
 * in room-mapping-resolver.ts but extended for all three ontology levels.
 *
 *   explicit     — Hard-coded in the defaults config (this file)
 *   role         — Derived from the entity's role (agents only)
 *   capability   — Derived from the entity's declared capabilities
 *   functional   — Derived from the entity's functional responsibility
 *   special      — Special system-level entity (USER, SYSTEM)
 *   fallback     — No match found; global fallback room used
 */
export type AssignmentSource =
  | "explicit"
  | "role"
  | "capability"
  | "functional"
  | "special"
  | "fallback";

// ---------------------------------------------------------------------------
// Behavioral contract
// ---------------------------------------------------------------------------

/**
 * Behavioral contract for a room assignment.
 *
 * Declares what the entity CAN DO in its assigned room.
 * This prevents noun-verb asymmetry: every entity must have at
 * least one declared action, not just a structural description.
 *
 * Each action in `actions` is a present-tense verb phrase:
 *   e.g. "emit events", "ingest commands", "replay state", "render 3D avatar"
 */
export interface BehavioralContract {
  /**
   * What the entity can DO in its assigned room.
   * At least one action is required.
   */
  actions: readonly string[];

  /**
   * What the entity OBSERVES or READS from its assigned room.
   * Optional — some entities only produce, not consume.
   */
  reads?: readonly string[];

  /**
   * What the entity EMITS or WRITES to the system from its assigned room.
   * Optional — some entities only consume, not produce.
   */
  emits?: readonly string[];

  /**
   * Whether the entity can INITIATE transitions that affect other rooms.
   * Default: false
   */
  canCrossRoomInteract?: boolean;
}

// ---------------------------------------------------------------------------
// Entity-to-room mapping entry
// ---------------------------------------------------------------------------

/**
 * A single entity-to-room assignment entry in the defaults config.
 *
 * Covers all three ontology levels uniformly, with explicit behavioral
 * contracts and full audit trail.
 */
export interface EntityRoomMapping {
  // ── Identity ──────────────────────────────────────────────────────────
  /** Unique entity identifier (kebab-case slug) */
  entityId: string;

  /** Human-readable display name for HUD panels */
  displayName: string;

  /** Ontology level: domain | infrastructure | meta */
  ontologyLevel: OntologyLevel;

  /** Fine-grained category within the ontology level */
  category: EntityCategory;

  // ── Room assignment ────────────────────────────────────────────────────
  /** Default room ID (matches RoomConfigEntry.roomId) */
  defaultRoomId: string;

  /**
   * How this default room was determined.
   * Used for audit trail and override precedence logic.
   */
  assignmentSource: AssignmentSource;

  /** Human-readable rationale for this room assignment */
  rationale: string;

  // ── Behavioral contract ────────────────────────────────────────────────
  /**
   * What this entity CAN DO in its assigned room.
   * Mandatory — prevents noun-verb asymmetry.
   */
  behavioralContract: BehavioralContract;

  // ── Visual hints ──────────────────────────────────────────────────────
  /** Hex colour for 3D avatar / HUD chip representation */
  colorAccent?: string;

  /** Unicode icon for minimap and HUD labels */
  icon?: string;

  // ── Optional metadata ─────────────────────────────────────────────────
  /**
   * Priority ordering within the room (lower = higher priority).
   * Used for seat / slot allocation when maxOccupancy is constrained.
   */
  priority?: number;

  /**
   * Whether this entity can be temporarily relocated to another room
   * during runtime (e.g. a migrating agent).
   */
  relocatable?: boolean;

  /** Freeform tags for filtering and categorisation */
  tags?: readonly string[];
}

// ---------------------------------------------------------------------------
// Versioned config container
// ---------------------------------------------------------------------------

/**
 * Top-level versioned room-office-mapping configuration.
 *
 * Holds all entity-to-room assignments across all three ontology levels.
 * Schema-versioned so the loader can detect drift and migrate.
 */
export interface RoomOfficeMappingConfig {
  /** Schema version — increment on breaking changes */
  schemaVersion: number;

  /**
   * ISO 8601 timestamp of config generation.
   * Used by self-improvement pipeline to detect stale defaults.
   */
  configuredAt: string;

  /** Building ID this mapping applies to (matches room-config-schema buildingId) */
  buildingId: string;

  /**
   * All entity-to-room mappings across all three ontology levels.
   *
   * Ordered: domain entities first, then infrastructure, then meta.
   * Within each level, alphabetical by entityId for deterministic ordering.
   */
  mappings: readonly EntityRoomMapping[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result of validating a RoomOfficeMappingConfig */
export interface RoomOfficeMappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Known room IDs in the Conitens Command Center building.
 * Used during validation to catch references to non-existent rooms.
 * Mirrors DEFAULT_ROOM_CONFIG.rooms[*].roomId from room-config-schema.ts.
 */
export const KNOWN_ROOM_IDS: readonly string[] = [
  "project-main",
  "archive-vault",
  "stairwell",
  "ops-control",
  "impl-office",
  "research-lab",
  "corridor-main",
  "validation-office",
  "review-office",
] as const;

/**
 * Validate a RoomOfficeMappingConfig for structural integrity.
 *
 * Checks:
 *   1. schemaVersion matches ROOM_OFFICE_MAPPING_SCHEMA_VERSION
 *   2. Every mapping has a non-empty entityId and defaultRoomId
 *   3. Every defaultRoomId references a known room
 *   4. Every ontologyLevel is a known level
 *   5. Every category is a known category (loose check — logs warning for unknowns)
 *   6. No duplicate entityIds
 *   7. Every behavioralContract has at least one action
 *   8. Meta-level mappings must include the room-mapping reflexive entry
 */
export function validateRoomOfficeMapping(
  config: RoomOfficeMappingConfig,
): RoomOfficeMappingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema version
  if (config.schemaVersion !== ROOM_OFFICE_MAPPING_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion mismatch: expected ${ROOM_OFFICE_MAPPING_SCHEMA_VERSION}, got ${config.schemaVersion}`,
    );
  }

  const knownRooms = new Set(KNOWN_ROOM_IDS);
  const seenIds = new Set<string>();
  const validLevels = new Set<string>(ONTOLOGY_LEVELS);

  for (const mapping of config.mappings) {
    const prefix = `[${mapping.entityId || "<missing-id>"}]`;

    // 2. Required fields
    if (!mapping.entityId) errors.push(`${prefix} missing entityId`);
    if (!mapping.displayName) errors.push(`${prefix} missing displayName`);
    if (!mapping.defaultRoomId) errors.push(`${prefix} missing defaultRoomId`);

    // 3. Known room reference
    if (mapping.defaultRoomId && !knownRooms.has(mapping.defaultRoomId)) {
      errors.push(
        `${prefix} defaultRoomId "${mapping.defaultRoomId}" does not reference a known room`,
      );
    }

    // 4. Valid ontology level
    if (!validLevels.has(mapping.ontologyLevel)) {
      errors.push(`${prefix} invalid ontologyLevel: "${mapping.ontologyLevel}"`);
    }

    // 5. Category (loose check — warn on unknown values)
    if (!mapping.category) {
      warnings.push(`${prefix} missing category — entity will not appear in type indexes`);
    }

    // 6. Duplicate entityId
    if (seenIds.has(mapping.entityId)) {
      errors.push(`Duplicate entityId: "${mapping.entityId}"`);
    } else {
      seenIds.add(mapping.entityId);
    }

    // 7. Behavioral contract — at least one action required
    if (!mapping.behavioralContract?.actions?.length) {
      errors.push(
        `${prefix} behavioralContract.actions is empty — every entity must declare at least one action`,
      );
    }
  }

  // 8. Reflexive closure check — meta level must include room-mapping entry
  const hasReflexiveEntry = config.mappings.some(
    (m) => m.ontologyLevel === "meta" && m.category === "room-mapping",
  );
  if (!hasReflexiveEntry) {
    warnings.push(
      "No meta-level 'room-mapping' entry found — ontology reflexive closure is incomplete",
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Default configuration — all three ontology levels
// ---------------------------------------------------------------------------

/**
 * DEFAULT_ROOM_OFFICE_MAPPING — canonical static defaults for the
 * Conitens 3D Command Center.
 *
 * Ordered: domain entities → infrastructure entities → meta entities.
 * Within each level: alphabetical by entityId.
 *
 * This constant is the single source of truth loaded at system initialization.
 * To override at runtime, use initRoomOfficeMapping().
 */
export const DEFAULT_ROOM_OFFICE_MAPPING: RoomOfficeMappingConfig = {
  schemaVersion: ROOM_OFFICE_MAPPING_SCHEMA_VERSION,
  configuredAt: "2026-03-24T00:00:00.000Z",
  buildingId: "command-center",
  mappings: [
    // ═══════════════════════════════════════════════════════════════════
    // DOMAIN LEVEL — what exists in the world
    // ═══════════════════════════════════════════════════════════════════

    // ── Human operator ─────────────────────────────────────────────────
    {
      entityId: "USER",
      displayName: "Human Operator",
      ontologyLevel: "domain",
      category: "user",
      defaultRoomId: "project-main",
      assignmentSource: "special",
      rationale: "The human operator enters the system via the project lobby, the central overview room.",
      behavioralContract: {
        actions: [
          "navigate to any room",
          "issue commands via command-file",
          "approve agent actions requiring human review",
          "observe diegetic 3D scene state",
          "drill into room for agent interaction",
        ],
        reads: [
          "project overview metrics",
          "active task list",
          "agent status indicators",
        ],
        emits: [
          "command files",
          "approval decisions",
          "navigation events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#4FC3F7",
      icon: "👤",
      priority: 0,
      relocatable: true,
      tags: ["human", "operator", "entry-point"],
    },

    // ── Agent: manager-default (orchestrator) ──────────────────────────
    {
      entityId: "manager-default",
      displayName: "Manager (Orchestrator)",
      ontologyLevel: "domain",
      category: "agent",
      defaultRoomId: "ops-control",
      assignmentSource: "role",
      rationale: "Orchestrators command from the control room — the primary decision hub of the operations floor.",
      behavioralContract: {
        actions: [
          "spawn sub-agents via AgentSpawner",
          "delegate bounded tasks to implementer/researcher/validator",
          "approve or reject agent action proposals",
          "maintain conversation ownership",
          "route commands to correct agent rooms",
        ],
        reads: [
          "active task queue",
          "agent lifecycle states",
          "approval-required event queue",
        ],
        emits: [
          "task.created events",
          "agent.spawn commands",
          "approval.granted / approval.denied events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "♛",
      priority: 1,
      relocatable: false,
      tags: ["agent", "orchestrator", "primary", "approval"],
    },

    // ── Agent: implementer-subagent ────────────────────────────────────
    {
      entityId: "implementer-subagent",
      displayName: "Implementer (Sub-agent)",
      ontologyLevel: "domain",
      category: "agent",
      defaultRoomId: "impl-office",
      assignmentSource: "role",
      rationale: "Implementers work in the implementation office — focused code-change workspace.",
      behavioralContract: {
        actions: [
          "apply file edits and patches",
          "execute bounded implementation tasks",
          "emit task.completed events on task completion",
          "request clarification from orchestrator",
        ],
        reads: [
          "task instructions from orchestrator",
          "codebase via read tools",
          "existing file content",
        ],
        emits: [
          "task.completed events",
          "patch.applied events",
          "task.blocked events when blocked",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#66BB6A",
      icon: "⚙",
      priority: 1,
      relocatable: true,
      tags: ["agent", "implementer", "code-change"],
    },

    // ── Agent: researcher-subagent ─────────────────────────────────────
    {
      entityId: "researcher-subagent",
      displayName: "Researcher (Sub-agent)",
      ontologyLevel: "domain",
      category: "agent",
      defaultRoomId: "research-lab",
      assignmentSource: "role",
      rationale: "Researchers operate from the research lab — read-heavy discovery and analysis workspace.",
      behavioralContract: {
        actions: [
          "explore repository structure via repo-map",
          "perform impact analysis on proposed changes",
          "gather context for orchestrator decision-making",
          "produce structured research summaries",
        ],
        reads: [
          "full codebase (read-only)",
          "event log for historical context",
          "task scope from orchestrator",
        ],
        emits: [
          "research.completed events with structured output",
          "context.gathered events",
          "impact.analysis.completed events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#AB47BC",
      icon: "🔬",
      priority: 1,
      relocatable: true,
      tags: ["agent", "researcher", "analysis", "read-only"],
    },

    // ── Agent: validator-sentinel ──────────────────────────────────────
    {
      entityId: "validator-sentinel",
      displayName: "Validator (Sentinel)",
      ontologyLevel: "domain",
      category: "agent",
      defaultRoomId: "validation-office",
      assignmentSource: "role",
      rationale: "Validators review from the validation office — the release-gate checkpoint.",
      behavioralContract: {
        actions: [
          "verify implementation against acceptance criteria",
          "perform pre-release checks",
          "gate task completion behind evidence verification",
          "surface blockers to orchestrator",
        ],
        reads: [
          "task completion evidence",
          "test results and coverage reports",
          "acceptance criteria from task definition",
        ],
        emits: [
          "validation.passed events",
          "validation.failed events with blocker details",
          "release.gate.cleared events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#EF5350",
      icon: "🛡",
      priority: 1,
      relocatable: false,
      tags: ["agent", "validator", "release-gate", "high-risk"],
    },

    // ── Agent: frontend-reviewer ───────────────────────────────────────
    {
      entityId: "frontend-reviewer",
      displayName: "Frontend Reviewer",
      ontologyLevel: "domain",
      category: "agent",
      defaultRoomId: "review-office",
      assignmentSource: "role",
      rationale: "Reviewers inspect from the review office — dedicated UI/UX review and accessibility workspace.",
      behavioralContract: {
        actions: [
          "review frontend surfaces against heuristics",
          "scan for accessibility violations",
          "produce bounded refactor guidance",
          "emit review.completed events with structured findings",
        ],
        reads: [
          "frontend source code and components",
          "accessibility audit tools",
          "UI heuristic checklists",
        ],
        emits: [
          "review.completed events",
          "accessibility.issues.found events",
          "refactor.proposal events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#42A5F5",
      icon: "👁",
      priority: 1,
      relocatable: true,
      tags: ["agent", "reviewer", "ui-review", "accessibility"],
    },

    // ── Project entity ─────────────────────────────────────────────────
    {
      entityId: "project-scope",
      displayName: "Project Scope",
      ontologyLevel: "domain",
      category: "project",
      defaultRoomId: "project-main",
      assignmentSource: "functional",
      rationale: "The project overview and scope document is the anchor of the lobby — the entry point for all users.",
      behavioralContract: {
        actions: [
          "display project overview to entering users",
          "provide navigation map to all rooms",
          "show active task summary",
          "anchor agent assignments to project context",
        ],
        reads: ["project metadata", "active agent list", "task summary"],
        emits: ["project.loaded events"],
        canCrossRoomInteract: false,
      },
      colorAccent: "#4FC3F7",
      icon: "📋",
      priority: 2,
      relocatable: false,
      tags: ["project", "overview", "lobby"],
    },

    // ── Command entity (first-class bridging entity) ───────────────────
    {
      entityId: "command-entity",
      displayName: "Command (User Intent Bridge)",
      ontologyLevel: "domain",
      category: "command",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Commands are first-class entities bridging user intent to orchestrator action. They materialize in the control room where the orchestrator processes them.",
      behavioralContract: {
        actions: [
          "represent a discrete user intent as a typed entity",
          "be ingested by the CommandPipeline for routing",
          "trigger agent actions on successful routing",
          "emit command.ingested events on acceptance",
        ],
        reads: ["command-file from .conitens/commands/ directory"],
        emits: [
          "command.ingested events",
          "command.routed events",
          "command.rejected events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "⌘",
      priority: 3,
      relocatable: false,
      tags: ["command", "first-class", "user-intent"],
    },

    // ═══════════════════════════════════════════════════════════════════
    // INFRASTRUCTURE LEVEL — how the system processes intent
    // ═══════════════════════════════════════════════════════════════════

    // ── A2AClient (Agent-to-Agent protocol) ────────────────────────────
    {
      entityId: "a2a-client",
      displayName: "A2A Client (Agent-to-Agent Protocol)",
      ontologyLevel: "infrastructure",
      category: "a2a-client",
      defaultRoomId: "corridor-main",
      assignmentSource: "functional",
      rationale: "The A2A protocol client mediates inter-agent communication. It lives in the main corridor — the spatial backbone connecting all agent workrooms.",
      behavioralContract: {
        actions: [
          "route agent-to-agent messages across room boundaries",
          "enforce message schema validation before delivery",
          "buffer messages when target agent is unavailable",
          "emit message.delivered and message.failed events",
        ],
        reads: [
          "agent registry for target resolution",
          "room adjacency graph for routing decisions",
        ],
        emits: [
          "a2a.message.sent events",
          "a2a.message.delivered events",
          "a2a.message.failed events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#546E7A",
      icon: "↔",
      priority: 1,
      relocatable: false,
      tags: ["infrastructure", "a2a", "inter-agent", "corridor"],
    },

    // ── AgentSpawner ───────────────────────────────────────────────────
    {
      entityId: "agent-spawner",
      displayName: "Agent Spawner (Lifecycle Manager)",
      ontologyLevel: "infrastructure",
      category: "agent-spawner",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Agent lifecycle management (spawn, pause, terminate) is a control-plane operation — located in the control room alongside the orchestrator.",
      behavioralContract: {
        actions: [
          "spawn new agent processes on orchestrator request",
          "terminate agents on completion or error",
          "pause and resume agent execution",
          "emit agent.spawned / agent.terminated lifecycle events",
          "enforce room assignments for newly spawned agents",
        ],
        reads: [
          "agent persona definitions from .agent/agents/",
          "room assignments from room-office-mapping defaults",
          "orchestrator spawn commands",
        ],
        emits: [
          "agent.spawned events",
          "agent.terminated events",
          "agent.paused events",
          "agent.resumed events",
          "agent.crashed events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "⚡",
      priority: 1,
      relocatable: false,
      tags: ["infrastructure", "lifecycle", "spawner", "control-plane"],
    },

    // ── CommandFileIngestion ───────────────────────────────────────────
    {
      entityId: "command-file-ingestion",
      displayName: "Command File Ingestion Pipeline",
      ontologyLevel: "infrastructure",
      category: "command-file",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Command files written to .conitens/commands/ are the primary write interface. The ingestion watcher lives in the control room — closest to the orchestrator.",
      behavioralContract: {
        actions: [
          "watch .conitens/commands/ for new command files",
          "parse and validate command file schema",
          "route parsed commands to the correct agent via CommandPipeline",
          "archive processed command files to .conitens/processed/",
          "emit command.ingested events on successful parsing",
        ],
        reads: [
          ".conitens/commands/*.json command files",
          "command schema from @conitens/protocol",
        ],
        emits: [
          "command.ingested events",
          "command.validation.failed events",
          "command.routed events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#FF7043",
      icon: "📥",
      priority: 2,
      relocatable: false,
      tags: ["infrastructure", "command-file", "ingestion", "write-interface"],
    },

    // ── CommandPipeline ────────────────────────────────────────────────
    {
      entityId: "command-pipeline",
      displayName: "Command Pipeline (Routing Engine)",
      ontologyLevel: "infrastructure",
      category: "command-pipeline",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "The command routing pipeline is a control-plane entity — it maps incoming commands to target agents and orchestrates execution flow from the control room.",
      behavioralContract: {
        actions: [
          "validate incoming command structure against protocol schema",
          "route commands to the designated target agent",
          "enforce command execution ordering and idempotency",
          "emit pipeline stage events at each routing checkpoint",
        ],
        reads: [
          "agent registry for target resolution",
          "command schema from @conitens/protocol",
          "orchestrator routing rules",
        ],
        emits: [
          "pipeline.stage.entered events",
          "pipeline.stage.completed events",
          "pipeline.command.rejected events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "⇒",
      priority: 1,
      relocatable: false,
      tags: ["infrastructure", "pipeline", "routing", "command-plane"],
    },

    // ── EventLog ───────────────────────────────────────────────────────
    {
      entityId: "event-log",
      displayName: "Event Log (Append-Only Record)",
      ontologyLevel: "infrastructure",
      category: "event-log",
      defaultRoomId: "archive-vault",
      assignmentSource: "functional",
      rationale: "The event log is the append-only, write-once source of truth. It lives in the Archive Vault — the read-only room dedicated to historical data and replay.",
      behavioralContract: {
        actions: [
          "accept append-only event writes (no mutation or deletion)",
          "serve ordered event sequences to replay consumers",
          "enforce schema validation on incoming event payloads",
          "partition events by type, agent, and timestamp",
        ],
        reads: [
          "incoming event payloads from all system components",
          "event schema from @conitens/protocol",
        ],
        emits: [
          "No direct event emissions — EventLog is the terminal sink",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#78909C",
      icon: "📜",
      priority: 1,
      relocatable: false,
      tags: ["infrastructure", "event-log", "append-only", "immutable", "record-transparency"],
    },

    // ── Orchestrator ───────────────────────────────────────────────────
    {
      entityId: "orchestrator",
      displayName: "Orchestrator (Central Coordinator)",
      ontologyLevel: "infrastructure",
      category: "orchestrator",
      defaultRoomId: "ops-control",
      assignmentSource: "explicit",
      rationale: "The central orchestrator process owns task routing, agent coordination, and approval boundaries. It anchors to the control room — the primary command hub.",
      behavioralContract: {
        actions: [
          "maintain the active task queue and routing table",
          "coordinate agent spawning via AgentSpawner",
          "enforce approval boundaries before high-risk actions",
          "emit orchestrator.ready and orchestrator.shutdown events",
          "broadcast system state to WebSocketBus",
        ],
        reads: [
          "command queue from CommandPipeline",
          "agent status from AgentSpawner",
          "task state from TaskStore",
        ],
        emits: [
          "orchestrator.ready events",
          "orchestrator.shutdown events",
          "task.routed events",
          "system.state.broadcast events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "🎛",
      priority: 0,
      relocatable: false,
      tags: ["infrastructure", "orchestrator", "control-plane", "primary"],
    },

    // ── ReplayEngine ───────────────────────────────────────────────────
    {
      entityId: "replay-engine",
      displayName: "Replay Engine (State Reconstruction)",
      ontologyLevel: "infrastructure",
      category: "replay-engine",
      defaultRoomId: "archive-vault",
      assignmentSource: "functional",
      rationale: "The replay engine reads the event log to reconstruct historical states. It co-locates with the EventLog in the Archive Vault.",
      behavioralContract: {
        actions: [
          "read event log sequences for state reconstruction",
          "apply event reducers to rebuild world state at any timestamp",
          "drive 3D scene replay at user-controlled playback speed",
          "emit replay.started, replay.stepped, replay.ended events",
        ],
        reads: [
          "event log from EventLog",
          "event schema from @conitens/protocol",
          "playback controls from user",
        ],
        emits: [
          "replay.started events",
          "replay.stepped events",
          "replay.ended events",
          "scene.state.restored events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#78909C",
      icon: "⏮",
      priority: 2,
      relocatable: false,
      tags: ["infrastructure", "replay", "state-reconstruction", "archive"],
    },

    // ── TaskStore ──────────────────────────────────────────────────────
    {
      entityId: "task-store",
      displayName: "Task Store (State Layer)",
      ontologyLevel: "infrastructure",
      category: "task-store",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Task storage and query is a control-plane concern — the orchestrator in the control room is the primary consumer of task state.",
      behavioralContract: {
        actions: [
          "store task records with status, priority, and agent assignment",
          "serve task queries (by agent, status, priority) to consumers",
          "enforce TaskState machine transitions via canTaskTransition()",
          "emit task.state.changed events on transition",
        ],
        reads: [
          "task creation commands from orchestrator",
          "task update events from agents",
        ],
        emits: [
          "task.created events",
          "task.state.changed events",
          "task.completed events",
          "task.failed events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#FF7043",
      icon: "📊",
      priority: 2,
      relocatable: false,
      tags: ["infrastructure", "task-store", "state", "control-plane"],
    },

    // ── WebSocketBus ───────────────────────────────────────────────────
    {
      entityId: "websocket-bus",
      displayName: "WebSocket Event Bus (Real-time Stream)",
      ontologyLevel: "infrastructure",
      category: "websocket-bus",
      defaultRoomId: "corridor-main",
      assignmentSource: "functional",
      rationale: "The WebSocket bus is the real-time communication backbone connecting all rooms. It lives in the main corridor — the spatial connector of the operations floor.",
      behavioralContract: {
        actions: [
          "stream live events to all connected 3D GUI clients",
          "broadcast state changes as WebSocket messages",
          "maintain client connection registry",
          "throttle and debounce high-frequency metric events",
        ],
        reads: [
          "events from all system components via subscription",
          "client connection requests",
        ],
        emits: [
          "ws.client.connected events",
          "ws.client.disconnected events",
          "ws.broadcast.sent events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#546E7A",
      icon: "📡",
      priority: 1,
      relocatable: false,
      tags: ["infrastructure", "websocket", "real-time", "bus", "connector"],
    },

    // ═══════════════════════════════════════════════════════════════════
    // META LEVEL — how the system observes and evolves itself
    // ═══════════════════════════════════════════════════════════════════

    // ── FeedbackStore ──────────────────────────────────────────────────
    {
      entityId: "feedback-store",
      displayName: "Feedback Store (User & Agent Feedback)",
      ontologyLevel: "meta",
      category: "feedback-store",
      defaultRoomId: "research-lab",
      assignmentSource: "functional",
      rationale: "Feedback analysis is a research-level activity. The feedback store co-locates with the Researcher in the research lab for analysis and pattern-mining.",
      behavioralContract: {
        actions: [
          "collect and store structured user feedback entries",
          "collect agent self-assessment signals",
          "expose feedback summaries to the SelfImprovementPipeline",
          "emit feedback.received events on new entries",
        ],
        reads: [
          "user feedback inputs from HUD panels",
          "agent performance signals from TaskStore",
        ],
        emits: [
          "feedback.received events",
          "feedback.analysis.completed events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#AB47BC",
      icon: "💬",
      priority: 2,
      relocatable: false,
      tags: ["meta", "feedback", "analysis", "self-improvement"],
    },

    // ── MetricsAggregator ──────────────────────────────────────────────
    {
      entityId: "metrics-aggregator",
      displayName: "Metrics Aggregator (Rollup Engine)",
      ontologyLevel: "meta",
      category: "metrics-aggregator",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Aggregated metrics are displayed on the diegetic HUD panels in the control room. The metrics engine co-locates with its primary consumer — the orchestrator.",
      behavioralContract: {
        actions: [
          "aggregate raw telemetry into rollup metrics at configurable intervals",
          "provide metric snapshots to 3D diegetic displays",
          "detect metric threshold violations and raise alerts",
          "emit metrics.snapshot.ready events",
        ],
        reads: [
          "raw telemetry events from TelemetryCollector",
          "task state from TaskStore",
          "agent lifecycle events from AgentSpawner",
        ],
        emits: [
          "metrics.snapshot.ready events",
          "metrics.threshold.exceeded events",
          "metrics.rollup.completed events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#FF7043",
      icon: "📈",
      priority: 2,
      relocatable: false,
      tags: ["meta", "metrics", "aggregator", "diegetic-display"],
    },

    // ── RecordTransparencyAudit ────────────────────────────────────────
    {
      entityId: "record-transparency-audit",
      displayName: "Record Transparency Audit (Supreme Design Principle)",
      ontologyLevel: "meta",
      category: "record-audit",
      defaultRoomId: "archive-vault",
      assignmentSource: "explicit",
      rationale: "Record transparency is the supreme design principle. The audit entity lives in the Archive Vault alongside the EventLog — the most direct expression of transparent record-keeping.",
      behavioralContract: {
        actions: [
          "audit all state-changing actions for event-sourced traceability",
          "verify that every mutation has a corresponding EventLog entry",
          "surface audit gaps as transparency.violation events",
          "generate periodic transparency reports for self-improvement analysis",
        ],
        reads: [
          "EventLog for completeness verification",
          "agent action traces",
          "command execution records",
        ],
        emits: [
          "transparency.audit.passed events",
          "transparency.violation events",
          "transparency.report.generated events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#78909C",
      icon: "🔍",
      priority: 0,
      relocatable: false,
      tags: ["meta", "transparency", "audit", "supreme-principle", "archive"],
    },

    // ── RoomMappingSystem (reflexive closure) ─────────────────────────
    {
      entityId: "room-mapping-system",
      displayName: "Room Mapping System (Reflexive Closure)",
      ontologyLevel: "meta",
      category: "room-mapping",
      defaultRoomId: "ops-control",
      assignmentSource: "explicit",
      rationale: "The room mapping system must be representable within itself (reflexive closure). It lives in the control room — where system configuration is managed and where self-improvement commands originate.",
      behavioralContract: {
        actions: [
          "define and enforce default entity-to-room assignments",
          "validate room assignments against known room IDs",
          "expose room mapping queries for 3D scene and HUD panels",
          "accept runtime overrides via initRoomOfficeMapping()",
          "support self-improvement mutations via schema-safe migration",
        ],
        reads: [
          "this configuration file itself (reflexive)",
          "room-config-schema.ts for room ID validation",
          "ontology level definitions",
        ],
        emits: [
          "room-mapping.initialized events",
          "room-mapping.override.applied events",
          "room-mapping.validation.failed events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#FF7043",
      icon: "🗺",
      priority: 0,
      relocatable: false,
      tags: ["meta", "room-mapping", "reflexive", "self-referential", "ontology"],
    },

    // ── SchemaRegistry ─────────────────────────────────────────────────
    {
      entityId: "schema-registry",
      displayName: "Schema Registry (Migration & Versioning)",
      ontologyLevel: "meta",
      category: "schema-registry",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Schema versioning and migration is a control-plane concern. Schema mutations must be backward-compatible; the registry co-locates with the orchestrator in the control room.",
      behavioralContract: {
        actions: [
          "track all schema versions across all modules",
          "validate that schema mutations are backward-compatible",
          "provide migration functions for EventLog consumers",
          "emit schema.updated events on version increment",
        ],
        reads: [
          "schema version constants from all protocol modules",
          "EventLog entry schemas for backward-compat validation",
        ],
        emits: [
          "schema.updated events",
          "schema.migration.required events",
          "schema.backward.compat.violated events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#FF7043",
      icon: "🔖",
      priority: 1,
      relocatable: false,
      tags: ["meta", "schema", "versioning", "migration", "backward-compat"],
    },

    // ── SelfImprovementPipeline ────────────────────────────────────────
    {
      entityId: "self-improvement-pipeline",
      displayName: "Self-Improvement Pipeline (GUI Evolution)",
      ontologyLevel: "meta",
      category: "self-improvement",
      defaultRoomId: "research-lab",
      assignmentSource: "functional",
      rationale: "Self-improvement analysis is a research activity. The pipeline reads EventLog records, analyzes GUI behavior, and produces improvement proposals — co-located with the Researcher in the research lab.",
      behavioralContract: {
        actions: [
          "analyze EventLog for recurring patterns and inefficiencies",
          "propose GUI improvements based on usage telemetry",
          "generate schema-safe config mutations for room-mapping",
          "emit improvement.proposal.generated events",
          "gate all proposals behind human approval before application",
        ],
        reads: [
          "EventLog via ReplayEngine for historical analysis",
          "FeedbackStore for user and agent signals",
          "Telemetry for usage patterns",
          "current room-mapping config (reflexive input)",
        ],
        emits: [
          "improvement.proposal.generated events",
          "improvement.applied events",
          "improvement.rejected events",
        ],
        canCrossRoomInteract: true,
      },
      colorAccent: "#AB47BC",
      icon: "🧠",
      priority: 1,
      relocatable: false,
      tags: ["meta", "self-improvement", "research", "evolution", "reflexive"],
    },

    // ── TelemetryCollector ─────────────────────────────────────────────
    {
      entityId: "telemetry-collector",
      displayName: "Telemetry Collector (Stored Separately)",
      ontologyLevel: "meta",
      category: "telemetry",
      defaultRoomId: "archive-vault",
      assignmentSource: "explicit",
      rationale: "Telemetry is stored SEPARATELY from the EventLog per design constraints. It lives in the Archive Vault alongside the EventLog, clearly partitioned by its own storage namespace.",
      behavioralContract: {
        actions: [
          "collect performance and usage telemetry from all system components",
          "store telemetry in a partition SEPARATE from EventLog",
          "expose telemetry summaries to MetricsAggregator",
          "enforce telemetry privacy — no PII, no user content",
        ],
        reads: [
          "system performance metrics from all components",
          "3D scene render performance from R3F",
          "WebSocket connection metrics",
        ],
        emits: [
          "telemetry.collected events (to separate storage)",
          "telemetry.threshold.exceeded events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#78909C",
      icon: "📡",
      priority: 3,
      relocatable: false,
      tags: ["meta", "telemetry", "monitoring", "separate-storage", "archive"],
    },

    // ── TopologyGraph ──────────────────────────────────────────────────
    {
      entityId: "topology-graph",
      displayName: "Topology Graph (Network & Agent Connectivity)",
      ontologyLevel: "meta",
      category: "topology-graph",
      defaultRoomId: "ops-control",
      assignmentSource: "functional",
      rationale: "Network topology and agent connectivity is visualized on the diegetic HUD in the control room — the central monitoring hub.",
      behavioralContract: {
        actions: [
          "maintain live graph of agent-to-agent connections",
          "track room occupancy and agent migration events",
          "provide topology snapshots for 3D force-graph rendering",
          "detect topology anomalies and disconnected agents",
        ],
        reads: [
          "agent lifecycle events from AgentSpawner",
          "A2A message routing events from A2AClient",
          "room assignment changes from room-mapping",
        ],
        emits: [
          "topology.updated events",
          "topology.anomaly.detected events",
          "topology.snapshot.ready events",
        ],
        canCrossRoomInteract: false,
      },
      colorAccent: "#FF7043",
      icon: "🕸",
      priority: 2,
      relocatable: false,
      tags: ["meta", "topology", "graph", "monitoring", "control-plane"],
    },
  ],
} as const satisfies RoomOfficeMappingConfig;

// ---------------------------------------------------------------------------
// Runtime initialization
// ---------------------------------------------------------------------------

/**
 * Active room-office-mapping configuration.
 * Initialized to DEFAULT_ROOM_OFFICE_MAPPING; may be overridden at runtime.
 */
let _activeMappingConfig: RoomOfficeMappingConfig = DEFAULT_ROOM_OFFICE_MAPPING;

/**
 * Initialise the room-office-mapping configuration.
 *
 * Called once at application startup (before the 3D scene renders).
 * Validates the config before activating it.
 *
 * @param config - Override config; defaults to DEFAULT_ROOM_OFFICE_MAPPING
 * @returns Validation result — callers can surface errors to the HUD
 */
export function initRoomOfficeMapping(
  config: RoomOfficeMappingConfig = DEFAULT_ROOM_OFFICE_MAPPING,
): RoomOfficeMappingValidationResult {
  const result = validateRoomOfficeMapping(config);

  if (!result.valid) {
    console.error(
      `[room-office-mapping] initRoomOfficeMapping: config failed validation ` +
      `(${result.errors.length} errors). Falling back to DEFAULT_ROOM_OFFICE_MAPPING.`,
      result.errors,
    );
    _activeMappingConfig = DEFAULT_ROOM_OFFICE_MAPPING;
    return result;
  }

  if (result.warnings.length > 0) {
    console.warn(
      `[room-office-mapping] initRoomOfficeMapping: ${result.warnings.length} warnings.`,
      result.warnings,
    );
  }

  _activeMappingConfig = config;
  return result;
}

/**
 * Get the currently active room-office-mapping configuration.
 */
export function getRoomOfficeMapping(): Readonly<RoomOfficeMappingConfig> {
  return _activeMappingConfig;
}

/**
 * Reset to DEFAULT_ROOM_OFFICE_MAPPING.
 * Useful in tests and for rolling back experimental configs.
 */
export function resetRoomOfficeMapping(): void {
  _activeMappingConfig = DEFAULT_ROOM_OFFICE_MAPPING;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get all entity mappings for a specific room.
 *
 * @param roomId - Target room ID
 * @param config - Config to search (defaults to active)
 */
export function getMappingsForRoom(
  roomId: string,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): EntityRoomMapping[] {
  return config.mappings.filter((m) => m.defaultRoomId === roomId) as EntityRoomMapping[];
}

/**
 * Get all entity mappings at a specific ontology level.
 *
 * @param level  - OntologyLevel to filter by
 * @param config - Config to search (defaults to active)
 */
export function getMappingsByLevel(
  level: OntologyLevel,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): EntityRoomMapping[] {
  return config.mappings.filter((m) => m.ontologyLevel === level) as EntityRoomMapping[];
}

/**
 * Get a single EntityRoomMapping by entityId.
 *
 * @param entityId - Entity identifier
 * @param config   - Config to search (defaults to active)
 */
export function getEntityMapping(
  entityId: string,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): EntityRoomMapping | undefined {
  return config.mappings.find((m) => m.entityId === entityId) as EntityRoomMapping | undefined;
}

/**
 * Get all entity mappings for a specific category.
 *
 * @param category - EntityCategory to filter by
 * @param config   - Config to search (defaults to active)
 */
export function getMappingsByCategory(
  category: EntityCategory,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): EntityRoomMapping[] {
  return config.mappings.filter((m) => m.category === category) as EntityRoomMapping[];
}

/**
 * Get the default room ID for a specific entity.
 *
 * @param entityId - Entity identifier
 * @param config   - Config to search (defaults to active)
 * @returns        - Room ID, or undefined if entity not found
 */
export function getDefaultRoomForEntity(
  entityId: string,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): string | undefined {
  return config.mappings.find((m) => m.entityId === entityId)?.defaultRoomId;
}

/**
 * Build a flat entityId → EntityRoomMapping index for O(1) lookup.
 *
 * @param config - Config to index (defaults to active)
 */
export function buildEntityIndex(
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): Readonly<Record<string, EntityRoomMapping>> {
  const index: Record<string, EntityRoomMapping> = {};
  for (const mapping of config.mappings) {
    index[mapping.entityId] = mapping as EntityRoomMapping;
  }
  return index;
}

/**
 * Build a flat roomId → EntityRoomMapping[] index for O(1) room lookup.
 *
 * @param config - Config to index (defaults to active)
 */
export function buildRoomIndex(
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): Readonly<Record<string, EntityRoomMapping[]>> {
  const index: Record<string, EntityRoomMapping[]> = {};
  for (const mapping of config.mappings) {
    if (!index[mapping.defaultRoomId]) {
      index[mapping.defaultRoomId] = [];
    }
    index[mapping.defaultRoomId].push(mapping as EntityRoomMapping);
  }
  return index;
}

/**
 * Get the behavioral contract for a specific entity.
 *
 * @param entityId - Entity identifier
 * @param config   - Config to search (defaults to active)
 */
export function getBehavioralContract(
  entityId: string,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): BehavioralContract | undefined {
  return config.mappings.find((m) => m.entityId === entityId)?.behavioralContract;
}

/**
 * Get all entities that can interact across room boundaries.
 *
 * These entities drive diegetic cross-room connectors in the 3D scene.
 *
 * @param config - Config to search (defaults to active)
 */
export function getCrossRoomEntities(
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): EntityRoomMapping[] {
  return config.mappings.filter(
    (m) => m.behavioralContract.canCrossRoomInteract === true,
  ) as EntityRoomMapping[];
}

/**
 * Format a human-readable summary of all mappings for a room.
 * Used by diegetic room nameplates in the 3D scene.
 *
 * @param roomId - Target room ID
 * @param config - Config to search (defaults to active)
 */
export function formatRoomOccupancySummary(
  roomId: string,
  config: RoomOfficeMappingConfig = _activeMappingConfig,
): string {
  const mappings = getMappingsForRoom(roomId, config);
  if (mappings.length === 0) return `${roomId}: no entities assigned`;

  const byLevel: Record<OntologyLevel, string[]> = {
    domain: [],
    infrastructure: [],
    meta: [],
  };

  for (const m of mappings) {
    byLevel[m.ontologyLevel].push(`${m.icon ?? "•"} ${m.displayName}`);
  }

  const lines: string[] = [`=== ${roomId} ===`];
  for (const level of ONTOLOGY_LEVELS) {
    if (byLevel[level].length > 0) {
      lines.push(`[${level.toUpperCase()}]`);
      lines.push(...byLevel[level].map((e) => `  ${e}`));
    }
  }
  return lines.join("\n");
}
