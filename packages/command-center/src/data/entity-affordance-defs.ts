/**
 * entity-affordance-defs.ts — Canonical affordance definitions for
 * controllable entities in the 3D command-center.
 *
 * Sub-AC 7a: Define and attach ui_fixture affordances — for each controllable
 * entity type (agent_instance, task, room) create at least one ui_fixture of
 * type control_button, handle, or menu_anchor with a valid parent_entity_id
 * pointing to the owning entity, ensuring affordances are spatially co-located
 * with their parent in the 3D scene.
 *
 * ## Design
 *
 * A `ControlAffordance` is a first-class entity that:
 *  - Carries a stable `affordance_id` (slug)
 *  - Declares its `affordance_kind` (control_button | handle | menu_anchor)
 *  - Points to its owning entity via `parent_entity_type` + `parent_entity_id`
 *  - Defines a `local_offset` from the parent entity's world position (spatial
 *    co-location contract)
 *  - Declares what it does via `action_type` and `action_label`
 *
 * ## Spatial co-location contract
 *
 * Every affordance is rendered at:
 *   world_pos = parent_world_pos + local_offset
 *
 * The `local_offset` values are chosen per-entity-type so affordances never
 * overlap their parent mesh (agents sit at y≈0, tasks float at y≈0.5, rooms
 * span y=0..2.4).  See `AFFORDANCE_Y_BASE_BY_ENTITY_TYPE` for the baselines.
 *
 * ## Affordance prototype tables
 *
 * Each entity type has a static prototype table defining which affordances
 * exist at the class level.  Per-instance affordances are built from these
 * prototypes by `buildAgentAffordances()`, `buildTaskAffordances()`, and
 * `buildRoomAffordances()` — all pure, dependency-free functions that are
 * the primary unit-test targets.
 *
 * ## Record transparency
 *
 * When `buildXAffordances()` is called during scene init, the caller is
 * expected to emit `fixture.control_button_placed` / `fixture.handle_placed` /
 * `fixture.anchor_placed` events for each returned affordance (same pattern as
 * ui-fixture-registry.ts and DashboardPanel.tsx).
 *
 * ## Ontology budget
 *
 * `ControlAffordance` is a *domain-level* entity that reuses the existing
 * spatial-fixture vocabulary.  No new top-level ontology fields are added.
 */

// ---------------------------------------------------------------------------
// Affordance kind discriminator
// ---------------------------------------------------------------------------

/**
 * The three sub-types of control affordance.
 *
 * Maps 1-to-1 to the SpatialFixtureKind type in fixture-interaction-intents.ts
 * (imported from scene layer, but NOT imported here to keep data/ free of
 * scene-layer dependencies — the string literals are duplicated intentionally).
 */
export type AffordanceKind =
  | "control_button"  // primary-click action (pause, cancel, etc.)
  | "handle"          // drag interaction (reposition agent, reorder task)
  | "menu_anchor";    // opens context menu with multiple actions

/** All registered affordance kinds. */
export const AFFORDANCE_KINDS: readonly AffordanceKind[] = [
  "control_button",
  "handle",
  "menu_anchor",
] as const;

/** O(1) membership test. */
export const AFFORDANCE_KIND_SET: ReadonlySet<string> = new Set(AFFORDANCE_KINDS);

/** Type guard: narrows an unknown string to AffordanceKind. */
export function isAffordanceKind(s: string): s is AffordanceKind {
  return AFFORDANCE_KIND_SET.has(s);
}

// ---------------------------------------------------------------------------
// Controllable entity types
// ---------------------------------------------------------------------------

/**
 * Entity types that can host control affordances in the 3D scene.
 *
 * - `agent_instance` — a live agent avatar in a room
 * - `task`           — a task orb floating in the scene
 * - `room`           — a room volume (door/control panel at wall)
 */
export type ControllableEntityType = "agent_instance" | "task" | "room";

/** All registered controllable entity types. */
export const CONTROLLABLE_ENTITY_TYPES: readonly ControllableEntityType[] = [
  "agent_instance",
  "task",
  "room",
] as const;

/** O(1) membership test. */
export const CONTROLLABLE_ENTITY_TYPE_SET: ReadonlySet<string> =
  new Set(CONTROLLABLE_ENTITY_TYPES);

/** Type guard: narrows an unknown string to ControllableEntityType. */
export function isControllableEntityType(s: string): s is ControllableEntityType {
  return CONTROLLABLE_ENTITY_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Local offset type (world-space delta from parent entity origin)
// ---------------------------------------------------------------------------

/** 3D offset from a parent entity's world-space origin. */
export interface AffordanceLocalOffset {
  /** Right-positive X offset in world units. */
  x: number;
  /** Up-positive Y offset in world units. */
  y: number;
  /** Camera-toward-positive Z offset in world units. */
  z: number;
}

// ---------------------------------------------------------------------------
// ControlAffordance — the core entity
// ---------------------------------------------------------------------------

/**
 * A single interactive affordance attached to a controllable entity.
 *
 * The `parent_entity_id` field is the Sub-AC 7a requirement: every affordance
 * must carry a valid reference back to its owning entity so that:
 *   1. The 3D scene can position the affordance at parent_world_pos + local_offset
 *   2. Interaction intents carry enough context to dispatch commands
 *   3. Event-log entries are attributed to the correct entity
 */
export interface ControlAffordance {
  // ── Identity ───────────────────────────────────────────────────────────────
  /** Stable slug identifier (e.g. "agent-mgr-pause-ctrl-btn"). */
  affordance_id: string;

  /** Interactive affordance sub-type. */
  affordance_kind: AffordanceKind;

  // ── Ownership (parent_entity_id is the key Sub-AC 7a field) ───────────────
  /** Domain type of the parent entity that owns this affordance. */
  parent_entity_type: ControllableEntityType;

  /**
   * Stable ID of the parent entity.
   *
   * For agent_instance entities: the agentId (e.g. "manager-1").
   * For task entities:            the taskId  (e.g. "task-42").
   * For room entities:            the roomId  (e.g. "ops-control").
   *
   * This ID is used by:
   *   - The SpatialFixtureLayer to look up the entity's world position
   *   - Interaction intent factories to set entityRef.entityId
   *   - Event-log entries for audit attribution
   */
  parent_entity_id: string;

  // ── Spatial co-location (ensures affordance renders near its parent) ───────
  /**
   * Offset from the parent entity's world-space origin.
   *
   * The affordance renders at:
   *   { x: parent.x + local_offset.x,
   *     y: parent.y + local_offset.y,
   *     z: parent.z + local_offset.z }
   *
   * Positive Y ensures the affordance floats above the parent mesh.
   */
  local_offset: AffordanceLocalOffset;

  // ── Behavioral semantics ───────────────────────────────────────────────────
  /** Human-readable label shown in 3D world (tooltip or badge). */
  action_label: string;

  /**
   * Machine-readable action discriminator.
   *
   * Examples:
   *   "agent.pause", "agent.stop", "agent.reassign"
   *   "task.cancel", "task.reprioritize"
   *   "room.configure", "room.lock"
   */
  action_type: string;

  // ── Visibility ─────────────────────────────────────────────────────────────
  /**
   * The set of parent entity statuses for which this affordance is visible.
   * `null` means "always visible regardless of status".
   *
   * Example: a "start" button is only visible when agent status is "inactive".
   */
  visible_for_statuses: readonly string[] | null;

  // ── Ontology ───────────────────────────────────────────────────────────────
  /** Ontology level (always "domain" for ControlAffordance). */
  ontology_level: "domain";
}

// ---------------------------------------------------------------------------
// Spatial co-location baseline Y offsets per entity type
// ---------------------------------------------------------------------------

/**
 * Baseline Y offset above the parent entity's world-space origin.
 * Chosen so affordances float clearly above their parent mesh:
 *
 *   agent_instance — avatars are ~0.5u tall → affordances at y+0.55
 *   task           — orbs float at y+0.4..0.6 → affordances at y+0.75
 *   room           — rooms span y=0..2.4 → affordances at y+1.20 (waist height)
 */
export const AFFORDANCE_Y_BASE_BY_ENTITY_TYPE: Readonly<
  Record<ControllableEntityType, number>
> = {
  agent_instance: 0.55,
  task:           0.75,
  room:           1.20,
} as const;

/**
 * Horizontal spacing between sibling affordance buttons on the same entity.
 * Mirrors FIXTURE_BUTTON_SPACING in SpatialUiFixture.tsx.
 */
export const AFFORDANCE_BUTTON_SPACING = 0.25 as const;

// ---------------------------------------------------------------------------
// Affordance ID builders — stable naming conventions
// ---------------------------------------------------------------------------

/** Build a stable affordance ID for an agent lifecycle button. */
export function agentAffordanceId(
  agentId: string,
  action: string,
): string {
  return `agent-${agentId}-${action}-ctrl-btn`;
}

/** Build a stable affordance ID for an agent context-menu anchor. */
export function agentMenuAnchorId(agentId: string): string {
  return `agent-${agentId}-menu-anchor`;
}

/** Build a stable affordance ID for an agent reposition handle. */
export function agentHandleId(agentId: string): string {
  return `agent-${agentId}-move-handle`;
}

/** Build a stable affordance ID for a task action button. */
export function taskAffordanceId(
  taskId: string,
  action: string,
): string {
  return `task-${taskId}-${action}-ctrl-btn`;
}

/** Build a stable affordance ID for a task context-menu anchor. */
export function taskMenuAnchorId(taskId: string): string {
  return `task-${taskId}-menu-anchor`;
}

/** Build a stable affordance ID for a room control button. */
export function roomAffordanceId(
  roomId: string,
  action: string,
): string {
  return `room-${roomId}-${action}-ctrl-btn`;
}

/** Build a stable affordance ID for a room context-menu anchor. */
export function roomMenuAnchorId(roomId: string): string {
  return `room-${roomId}-menu-anchor`;
}

// ---------------------------------------------------------------------------
// Per-entity-type affordance builders
// ---------------------------------------------------------------------------

/**
 * Build the canonical set of `ControlAffordance` entities for a single
 * agent instance.
 *
 * Affordance set per agent:
 *   index 0 — primary action button  (kind: control_button)
 *             Action determined by agentStatus:
 *               inactive/terminated → "start"
 *               idle/active/busy    → "pause"
 *               error               → "restart"
 *   index 1 — movement handle        (kind: handle, always present)
 *   index 2 — context-menu anchor    (kind: menu_anchor, always present)
 *
 * @param agentId     — stable agent identifier (becomes parent_entity_id)
 * @param agentStatus — current agent status (gates primary action label)
 */
export function buildAgentAffordances(
  agentId: string,
  agentStatus: string = "inactive",
): ControlAffordance[] {
  const yBase = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.agent_instance;

  // Primary lifecycle button — action depends on current status
  const { actionType, actionLabel } = resolveAgentPrimaryAction(agentStatus);

  const primaryButton: ControlAffordance = {
    affordance_id:       agentAffordanceId(agentId, actionType),
    affordance_kind:     "control_button",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    agentId,
    local_offset:        { x: 0, y: yBase, z: 0 },
    action_label:        actionLabel,
    action_type:         `agent.${actionType}`,
    visible_for_statuses: null,   // always visible (action changes with status)
    ontology_level:      "domain",
  };

  // Movement handle — enables drag-to-reassign in 3D
  const moveHandle: ControlAffordance = {
    affordance_id:       agentHandleId(agentId),
    affordance_kind:     "handle",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    agentId,
    local_offset:        { x: AFFORDANCE_BUTTON_SPACING, y: yBase, z: 0 },
    action_label:        "MOVE",
    action_type:         "agent.reassign",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  // Context-menu anchor — reveals full lifecycle action set
  const menuAnchor: ControlAffordance = {
    affordance_id:       agentMenuAnchorId(agentId),
    affordance_kind:     "menu_anchor",
    parent_entity_type:  "agent_instance",
    parent_entity_id:    agentId,
    local_offset:        { x: AFFORDANCE_BUTTON_SPACING * 2, y: yBase, z: 0 },
    action_label:        "MENU",
    action_type:         "agent.open_menu",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  return [primaryButton, moveHandle, menuAnchor];
}

/**
 * Resolve the primary action type and label for an agent given its status.
 * Mirrors `getAgentFixtureActions()` in use-agent-fixture-command-bridge.ts
 * but returns a single primary action for the first-slot button.
 */
export function resolveAgentPrimaryAction(status: string): {
  actionType: string;
  actionLabel: string;
} {
  switch (status) {
    case "inactive":
    case "terminated":
      return { actionType: "start",   actionLabel: "START" };
    case "idle":
      return { actionType: "stop",    actionLabel: "STOP" };
    case "active":
    case "busy":
      return { actionType: "pause",   actionLabel: "PAUSE" };
    case "error":
      return { actionType: "restart", actionLabel: "RESTART" };
    default:
      return { actionType: "start",   actionLabel: "START" };
  }
}

/**
 * Build the canonical set of `ControlAffordance` entities for a single task.
 *
 * Affordance set per task:
 *   index 0 — cancel button      (kind: control_button)
 *   index 1 — reprioritize button (kind: control_button)
 *   index 2 — context-menu anchor (kind: menu_anchor)
 *
 * Cancel is disabled (still present) for terminal tasks (done, cancelled).
 *
 * @param taskId     — stable task identifier (becomes parent_entity_id)
 * @param taskStatus — current task status (gates cancel visibility)
 */
export function buildTaskAffordances(
  taskId: string,
  taskStatus: string = "pending",
): ControlAffordance[] {
  const yBase = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.task;

  const TERMINAL_STATUSES = ["done", "cancelled", "failed"] as const;
  const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(taskStatus);

  const cancelButton: ControlAffordance = {
    affordance_id:       taskAffordanceId(taskId, "cancel"),
    affordance_kind:     "control_button",
    parent_entity_type:  "task",
    parent_entity_id:    taskId,
    local_offset:        { x: 0, y: yBase, z: 0 },
    action_label:        "CANCEL",
    action_type:         "task.cancel",
    visible_for_statuses: ["pending", "in_progress", "blocked"],
    ontology_level:      "domain",
  };

  const reprioButton: ControlAffordance = {
    affordance_id:       taskAffordanceId(taskId, "reprio"),
    affordance_kind:     "control_button",
    parent_entity_type:  "task",
    parent_entity_id:    taskId,
    local_offset:        { x: AFFORDANCE_BUTTON_SPACING, y: yBase, z: 0 },
    action_label:        "REPRIO",
    action_type:         "task.reprioritize",
    visible_for_statuses: isTerminal ? [] : null,  // null if not terminal
    ontology_level:      "domain",
  };

  const menuAnchor: ControlAffordance = {
    affordance_id:       taskMenuAnchorId(taskId),
    affordance_kind:     "menu_anchor",
    parent_entity_type:  "task",
    parent_entity_id:    taskId,
    local_offset:        { x: AFFORDANCE_BUTTON_SPACING * 2, y: yBase, z: 0 },
    action_label:        "MENU",
    action_type:         "task.open_menu",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  return [cancelButton, reprioButton, menuAnchor];
}

/**
 * Build the canonical set of `ControlAffordance` entities for a single room.
 *
 * Affordance set per room:
 *   index 0 — room-configure button (kind: control_button) — opens room config panel
 *   index 1 — room context-menu anchor (kind: menu_anchor) — reveals room actions
 *
 * Rooms don't have a handle (they're static; agents drag to rooms not rooms themselves).
 *
 * @param roomId — stable room identifier (becomes parent_entity_id)
 */
export function buildRoomAffordances(roomId: string): ControlAffordance[] {
  const yBase = AFFORDANCE_Y_BASE_BY_ENTITY_TYPE.room;

  const configButton: ControlAffordance = {
    affordance_id:       roomAffordanceId(roomId, "configure"),
    affordance_kind:     "control_button",
    parent_entity_type:  "room",
    parent_entity_id:    roomId,
    local_offset:        { x: 0, y: yBase, z: 0 },
    action_label:        "CONFIG",
    action_type:         "room.configure",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  const menuAnchor: ControlAffordance = {
    affordance_id:       roomMenuAnchorId(roomId),
    affordance_kind:     "menu_anchor",
    parent_entity_type:  "room",
    parent_entity_id:    roomId,
    local_offset:        { x: AFFORDANCE_BUTTON_SPACING, y: yBase, z: 0 },
    action_label:        "MENU",
    action_type:         "room.open_menu",
    visible_for_statuses: null,
    ontology_level:      "domain",
  };

  return [configButton, menuAnchor];
}

// ---------------------------------------------------------------------------
// World-position computation (spatial co-location)
// ---------------------------------------------------------------------------

/** 3D world-space position (Y-up, right-handed). */
export interface AffordanceWorldPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Compute the world-space position of a `ControlAffordance` given the
 * parent entity's world-space origin.
 *
 * This is the **spatial co-location contract**: affordances always render at
 *   parent_world_pos + affordance.local_offset
 *
 * Identical arithmetic to `computeFixtureWorldPos` in
 * fixture-interaction-intents.ts — kept separate to avoid the data/ layer
 * importing scene/ utilities.
 *
 * @param parentWorldPos  — parent entity's world-space origin { x, y, z }
 * @param affordance      — the affordance whose local_offset to apply
 * @returns               — world-space position { x, y, z }
 */
export function computeAffordanceWorldPos(
  parentWorldPos: AffordanceWorldPosition,
  affordance: Pick<ControlAffordance, "local_offset">,
): AffordanceWorldPosition {
  return {
    x: parentWorldPos.x + affordance.local_offset.x,
    y: parentWorldPos.y + affordance.local_offset.y,
    z: parentWorldPos.z + affordance.local_offset.z,
  };
}

// ---------------------------------------------------------------------------
// Validation — invariant checks (no I/O)
// ---------------------------------------------------------------------------

/**
 * Validate a single `ControlAffordance` record against the Sub-AC 7a contract:
 *   1. `affordance_id` is non-empty
 *   2. `affordance_kind` is a registered kind
 *   3. `parent_entity_type` is a registered controllable entity type
 *   4. `parent_entity_id` is non-empty (valid reference)
 *   5. `local_offset.y` > 0 (affordance floats ABOVE the parent entity)
 *   6. At least one action is declared (`action_type` non-empty)
 *   7. `ontology_level` is "domain"
 *
 * Returns an array of error strings (empty = valid).
 */
export function validateControlAffordance(a: ControlAffordance): string[] {
  const errors: string[] = [];

  if (!a.affordance_id) {
    errors.push(`affordance_id is required`);
  }
  if (!isAffordanceKind(a.affordance_kind)) {
    errors.push(`unknown affordance_kind "${a.affordance_kind}"`);
  }
  if (!isControllableEntityType(a.parent_entity_type)) {
    errors.push(`unknown parent_entity_type "${a.parent_entity_type}"`);
  }
  if (!a.parent_entity_id) {
    errors.push(`parent_entity_id must be non-empty (affordance_id="${a.affordance_id}")`);
  }
  if (a.local_offset.y <= 0) {
    errors.push(
      `local_offset.y must be > 0 for spatial co-location above parent ` +
      `(affordance_id="${a.affordance_id}", y=${a.local_offset.y})`,
    );
  }
  if (!a.action_type) {
    errors.push(`action_type is required (affordance_id="${a.affordance_id}")`);
  }
  if (a.ontology_level !== "domain") {
    errors.push(
      `ontology_level must be "domain" (affordance_id="${a.affordance_id}")`,
    );
  }

  return errors;
}

/**
 * Validate a full list of affordances.
 *
 * Additional check beyond per-entity validation:
 *   - All affordance_ids are unique within the list
 *   - Each parent_entity_id matches the agentId/taskId/roomId key passed in
 *     (structural integrity check — prevents copy-paste errors)
 *
 * @param affordances  — affordances to validate
 * @param parentId     — expected parent_entity_id for all affordances in the list
 * @returns            — array of error strings (empty = valid)
 */
export function validateAffordanceList(
  affordances: readonly ControlAffordance[],
  parentId: string,
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const a of affordances) {
    // Per-entity validation
    errors.push(...validateControlAffordance(a));

    // Uniqueness
    if (seenIds.has(a.affordance_id)) {
      errors.push(`Duplicate affordance_id "${a.affordance_id}"`);
    }
    seenIds.add(a.affordance_id);

    // Parent reference integrity
    if (a.parent_entity_id !== parentId) {
      errors.push(
        `parent_entity_id mismatch: expected "${parentId}" but got ` +
        `"${a.parent_entity_id}" on affordance "${a.affordance_id}"`,
      );
    }
  }

  // Each entity type must have at least one control_button AND one menu_anchor
  const hasButton  = affordances.some((a) => a.affordance_kind === "control_button");
  const hasAnchor  = affordances.some(
    (a) => a.affordance_kind === "handle" || a.affordance_kind === "menu_anchor",
  );

  if (!hasButton) {
    errors.push(
      `Affordance list for "${parentId}" has no control_button affordance`,
    );
  }
  if (!hasAnchor) {
    errors.push(
      `Affordance list for "${parentId}" has no handle or menu_anchor affordance`,
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Prototype definitions — class-level defaults for well-known entity IDs
// ---------------------------------------------------------------------------

/**
 * Prototype affordances for the known agent persona IDs.
 *
 * These are build-time constants used by tests and the initial scene seed.
 * At runtime, `buildAgentAffordances(agentId, agentStatus)` is called per
 * live agent to produce status-aware affordances.
 */
export const AGENT_AFFORDANCE_PROTOTYPES: readonly ControlAffordance[] = [
  ...buildAgentAffordances("manager-1"),
  ...buildAgentAffordances("implementer-1"),
  ...buildAgentAffordances("researcher-1"),
  ...buildAgentAffordances("validator-1"),
  ...buildAgentAffordances("frontend-reviewer-1"),
];

/**
 * Prototype affordances for well-known room IDs.
 * Used by tests to verify per-room affordance contracts.
 */
export const ROOM_AFFORDANCE_PROTOTYPES: readonly ControlAffordance[] = [
  ...buildRoomAffordances("ops-control"),
  ...buildRoomAffordances("impl-office"),
  ...buildRoomAffordances("research-lab"),
  ...buildRoomAffordances("validation-room"),
  ...buildRoomAffordances("project-main"),
];

/**
 * Prototype task affordances for the seed task IDs.
 * Minimal set — tasks are highly dynamic; prototypes exist for test coverage only.
 */
export const TASK_AFFORDANCE_PROTOTYPES: readonly ControlAffordance[] = [
  ...buildTaskAffordances("task-seed-0"),
  ...buildTaskAffordances("task-seed-1", "in_progress"),
  ...buildTaskAffordances("task-seed-2", "done"),
];

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

/**
 * Collect all prototype affordances by entity type.
 * Useful for validation sweeps in tests and the self-improvement loop.
 */
export const ALL_PROTOTYPE_AFFORDANCES: readonly ControlAffordance[] = [
  ...AGENT_AFFORDANCE_PROTOTYPES,
  ...TASK_AFFORDANCE_PROTOTYPES,
  ...ROOM_AFFORDANCE_PROTOTYPES,
] as const;

/**
 * Return all prototype affordances that belong to a given entity type.
 */
export function getPrototypeAffordancesFor(
  entityType: ControllableEntityType,
): readonly ControlAffordance[] {
  return ALL_PROTOTYPE_AFFORDANCES.filter(
    (a) => a.parent_entity_type === entityType,
  );
}

/**
 * Return all prototype affordances that reference a given parent_entity_id.
 */
export function getAffordancesForEntity(
  parentEntityId: string,
): readonly ControlAffordance[] {
  return ALL_PROTOTYPE_AFFORDANCES.filter(
    (a) => a.parent_entity_id === parentEntityId,
  );
}
