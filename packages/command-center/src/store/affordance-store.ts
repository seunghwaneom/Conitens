/**
 * affordance-store.ts — Zustand entity store for `ControlAffordance` entities.
 *
 * Sub-AC 7a: Spatial affordance attachment — persist at least one ui_fixture
 * entity (control_button, handle, or menu_anchor) for each controllable entity
 * type (agent_instance, task, room) with a valid parent_entity_id linking the
 * affordance to its owning entity, and correct 3D spatial positioning via
 * local_offset in the scene graph.
 *
 * ## Design
 *
 * The store is the runtime registry for all `ControlAffordance` entities that
 * have been attached to 3D scene objects.  It mirrors the design of
 * `ui-fixture-store.ts` (dashboard panels) but targets interactive controls —
 * buttons, handles, and menu anchors — that are children of specific entities.
 *
 * Key differences from `ui-fixture-store`:
 *   - Affordances are parented to entities (not rooms) via `parent_entity_id`
 *   - Affordances travel with their parent (same world-space transform update)
 *   - Multiple affordances per entity are the norm (button + handle + anchor)
 *
 * ## Event sourcing
 *
 *   affordance.placed         — entity registered (initial or runtime)
 *   affordance.updated        — entity fields mutated after placement
 *   affordance.removed        — entity unregistered
 *   affordance.initialized    — all prototype affordances seeded on boot
 *   affordance.toggled        — operator interacted with an affordance
 *
 * ## Record transparency
 *
 * Every state mutation appends an `AffordanceStoreEvent` to the append-only
 * `events` array.  The initial seed (`initAffordances()`) emits one
 * `affordance.placed` per entity and one `affordance.initialized` at the end.
 *
 * ## Ontology budget
 *
 * `ControlAffordance` is a domain-level entity that reuses the existing
 * spatial-fixture vocabulary.  No new top-level ontology fields are added.
 */

import { create } from "zustand";
import {
  AGENT_AFFORDANCE_PROTOTYPES,
  TASK_AFFORDANCE_PROTOTYPES,
  ROOM_AFFORDANCE_PROTOTYPES,
  buildAgentAffordances,
  buildTaskAffordances,
  buildRoomAffordances,
  computeAffordanceWorldPos,
  validateAffordanceList,
  isAffordanceKind,
  isControllableEntityType,
  type ControlAffordance,
  type AffordanceKind,
  type ControllableEntityType,
  type AffordanceWorldPosition,
} from "../data/entity-affordance-defs.js";

// ---------------------------------------------------------------------------
// Re-export data types for consumers
// ---------------------------------------------------------------------------

export type {
  ControlAffordance,
  AffordanceKind,
  ControllableEntityType,
  AffordanceWorldPosition,
};

// ---------------------------------------------------------------------------
// All default prototype affordances — seeded on boot
// ---------------------------------------------------------------------------

/**
 * All prototype affordances concatenated across entity types.
 * Used as the initial seed for `initAffordances()`.
 */
export const ALL_PROTOTYPE_AFFORDANCES: readonly ControlAffordance[] = [
  ...AGENT_AFFORDANCE_PROTOTYPES,
  ...TASK_AFFORDANCE_PROTOTYPES,
  ...ROOM_AFFORDANCE_PROTOTYPES,
] as const;

// ---------------------------------------------------------------------------
// Store event types (event-sourcing)
// ---------------------------------------------------------------------------

/**
 * Discriminated event types emitted by the affordance store.
 * Every mutation appends one or more events for full audit traceability.
 */
export type AffordanceEventType =
  | "affordance.placed"      // Entity registered (initial placement or runtime)
  | "affordance.updated"     // Entity fields mutated after placement
  | "affordance.removed"     // Entity unregistered
  | "affordance.initialized" // All prototype affordances registered on boot
  | "affordance.toggled";    // Operator interacted with an affordance

/** A single event record in the affordance event log. */
export interface AffordanceStoreEvent {
  /** Monotonically increasing sequence number. */
  seq: number;
  /** Event type discriminator. */
  type: AffordanceEventType;
  /** The affordance_id this event pertains to. */
  affordanceId: string;
  /** The parent entity type. */
  parentEntityType?: ControllableEntityType;
  /** The parent entity ID — core Sub-AC 7a field. */
  parentEntityId?: string;
  /** Affordance kind. */
  affordanceKind?: AffordanceKind;
  /** Timestamp (ms since epoch). */
  ts: number;
  /** Optional metadata (mutation diff, placement details, etc.). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Store state shape
// ---------------------------------------------------------------------------

/**
 * The full state shape of the affordance Zustand store.
 *
 * Key design decisions:
 *   - `affordances` is Record<affordance_id, ControlAffordance> for O(1) lookup
 *   - `affordanceIds` is an ordered array for stable iteration order
 *   - `events` is an append-only audit log (never truncated)
 *   - `initialized` flags whether the default affordances have been seeded
 */
export interface AffordanceState {
  // ── Entity registry ──────────────────────────────────────────────────────
  /** Registered affordances keyed by affordance_id. */
  affordances: Record<string, ControlAffordance>;
  /** Ordered list of registered affordance_ids (insertion order). */
  affordanceIds: string[];
  /** Whether initAffordances() has been called (prevents double-seeding). */
  initialized: boolean;

  // ── Selection state ───────────────────────────────────────────────────────
  /** Currently selected affordance_id, or null. */
  selectedAffordanceId: string | null;

  // ── Event log (append-only) ───────────────────────────────────────────────
  /** Append-only audit log of all store events. */
  events: AffordanceStoreEvent[];
  /** Next sequence number. */
  seq: number;

  // ── Validation ────────────────────────────────────────────────────────────
  /** Validation errors from the last validateAffordances() call. */
  validationErrors: string[];

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Seed the store with all prototype affordances for well-known entity IDs.
   * Idempotent: if `initialized === true`, this is a no-op.
   * Emits `affordance.placed` for each affordance and `affordance.initialized` at end.
   */
  initAffordances: () => void;

  /**
   * Register a single affordance entity.
   * Emits `affordance.placed` (or `affordance.updated` if affordance_id exists).
   *
   * @param affordance  A fully-populated ControlAffordance entity.
   */
  registerAffordance: (affordance: ControlAffordance) => void;

  /**
   * Register all affordances for a single agent entity.
   * Convenience wrapper around `registerAffordance` for bulk agent placement.
   *
   * @param agentId     The stable agent ID (becomes parent_entity_id).
   * @param agentStatus Current agent status (gates primary action).
   */
  registerAgentAffordances: (agentId: string, agentStatus?: string) => void;

  /**
   * Register all affordances for a single task entity.
   * Convenience wrapper around `registerAffordance` for bulk task placement.
   *
   * @param taskId     The stable task ID (becomes parent_entity_id).
   * @param taskStatus Current task status (gates cancel visibility).
   */
  registerTaskAffordances: (taskId: string, taskStatus?: string) => void;

  /**
   * Register all affordances for a single room entity.
   * Convenience wrapper around `registerAffordance` for bulk room placement.
   *
   * @param roomId  The stable room ID (becomes parent_entity_id).
   */
  registerRoomAffordances: (roomId: string) => void;

  /**
   * Remove an affordance by affordance_id.
   * Emits `affordance.removed`. No-op if affordance_id not found.
   */
  removeAffordance: (affordanceId: string) => void;

  /**
   * Select an affordance (operator click / highlight).
   * Emits `affordance.toggled`.
   *
   * @param affordanceId  Affordance to select, or null to deselect.
   */
  selectAffordance: (affordanceId: string | null) => void;

  /**
   * Run the registry validation and store results.
   * Returns the validation errors array.
   */
  validateAffordances: () => string[];

  // ── Selectors ─────────────────────────────────────────────────────────────
  /**
   * Get a single ControlAffordance by affordance_id.
   * Returns undefined if not registered.
   */
  getAffordance: (affordanceId: string) => ControlAffordance | undefined;

  /**
   * Get all registered affordances for a given parent entity.
   * Returns all affordances whose parent_entity_id matches.
   */
  getAffordancesForEntity: (
    parentEntityId: string,
    parentEntityType?: ControllableEntityType,
  ) => ControlAffordance[];

  /**
   * Get all registered affordances for a given entity type.
   * Returns all affordances whose parent_entity_type matches.
   */
  getAffordancesByEntityType: (
    entityType: ControllableEntityType,
  ) => ControlAffordance[];

  /**
   * Get all registered affordances of a given kind.
   */
  getAffordancesByKind: (kind: AffordanceKind) => ControlAffordance[];

  /**
   * Compute the world-space position of an affordance given its parent's
   * current world-space position.
   *
   * This is the spatial co-location contract from entity-affordance-defs.ts:
   *   world_pos = parent_world_pos + affordance.local_offset
   */
  computeWorldPosition: (
    affordanceId: string,
    parentWorldPos: AffordanceWorldPosition,
  ) => AffordanceWorldPosition | null;

  /**
   * Get the current affordance count.
   */
  getAffordanceCount: () => number;

  /**
   * Check whether at least one affordance of each required kind exists for
   * all three controllable entity types (Sub-AC 7a coverage check).
   *
   * Returns true if:
   *   - At least one agent_instance affordance exists with a control_button
   *   - At least one task affordance exists with a control_button
   *   - At least one room affordance exists with a control_button
   */
  hasFullEntityTypeCoverage: () => boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a next sequence number from current state. */
function nextSeq(current: number): number {
  return current + 1;
}

/** Build an AffordanceStoreEvent. */
function makeEvent(
  seq: number,
  type: AffordanceEventType,
  affordanceId: string,
  affordance?: ControlAffordance,
  meta?: Record<string, unknown>,
): AffordanceStoreEvent {
  return {
    seq,
    type,
    affordanceId,
    parentEntityType: affordance?.parent_entity_type,
    parentEntityId:   affordance?.parent_entity_id,
    affordanceKind:   affordance?.affordance_kind,
    ts: Date.now(),
    meta,
  };
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useAffordanceStore = create<AffordanceState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  affordances:         {},
  affordanceIds:       [],
  initialized:         false,
  selectedAffordanceId: null,
  events:              [],
  seq:                 0,
  validationErrors:    [],

  // ── initAffordances ────────────────────────────────────────────────────────
  initAffordances: () => {
    const state = get();
    if (state.initialized) return; // idempotent

    const affordances: Record<string, ControlAffordance> = {};
    const affordanceIds: string[] = [];
    const newEvents: AffordanceStoreEvent[] = [];
    let seq = state.seq;

    for (const affordance of ALL_PROTOTYPE_AFFORDANCES) {
      affordances[affordance.affordance_id] = affordance;
      affordanceIds.push(affordance.affordance_id);
      seq = nextSeq(seq);
      newEvents.push(
        makeEvent(seq, "affordance.placed", affordance.affordance_id, affordance, {
          affordance_kind:     affordance.affordance_kind,
          parent_entity_type:  affordance.parent_entity_type,
          parent_entity_id:    affordance.parent_entity_id,
          local_offset:        affordance.local_offset,
          action_type:         affordance.action_type,
          ontology_level:      affordance.ontology_level,
        }),
      );
    }

    // Emit affordance.initialized once all placements are recorded
    seq = nextSeq(seq);
    newEvents.push(
      makeEvent(seq, "affordance.initialized", "registry", undefined, {
        total_count:        affordanceIds.length,
        agent_count:        affordanceIds.filter(
          (id) => affordances[id].parent_entity_type === "agent_instance",
        ).length,
        task_count:         affordanceIds.filter(
          (id) => affordances[id].parent_entity_type === "task",
        ).length,
        room_count:         affordanceIds.filter(
          (id) => affordances[id].parent_entity_type === "room",
        ).length,
        control_button_count: affordanceIds.filter(
          (id) => affordances[id].affordance_kind === "control_button",
        ).length,
        handle_count:         affordanceIds.filter(
          (id) => affordances[id].affordance_kind === "handle",
        ).length,
        menu_anchor_count:    affordanceIds.filter(
          (id) => affordances[id].affordance_kind === "menu_anchor",
        ).length,
      }),
    );

    set({
      affordances,
      affordanceIds,
      initialized: true,
      events:      [...state.events, ...newEvents],
      seq,
    });
  },

  // ── registerAffordance ─────────────────────────────────────────────────────
  registerAffordance: (affordance: ControlAffordance) => {
    const state  = get();
    const isUpdate = !!state.affordances[affordance.affordance_id];
    const seq    = nextSeq(state.seq);

    const newAffordances = {
      ...state.affordances,
      [affordance.affordance_id]: affordance,
    };
    const newIds = isUpdate
      ? state.affordanceIds
      : [...state.affordanceIds, affordance.affordance_id];

    const event = makeEvent(
      seq,
      isUpdate ? "affordance.updated" : "affordance.placed",
      affordance.affordance_id,
      affordance,
      { is_update: isUpdate },
    );

    set({
      affordances:   newAffordances,
      affordanceIds: newIds,
      events:        [...state.events, event],
      seq,
    });
  },

  // ── registerAgentAffordances ───────────────────────────────────────────────
  registerAgentAffordances: (agentId: string, agentStatus = "inactive") => {
    const built = buildAgentAffordances(agentId, agentStatus);
    for (const a of built) {
      get().registerAffordance(a);
    }
  },

  // ── registerTaskAffordances ────────────────────────────────────────────────
  registerTaskAffordances: (taskId: string, taskStatus = "pending") => {
    const built = buildTaskAffordances(taskId, taskStatus);
    for (const a of built) {
      get().registerAffordance(a);
    }
  },

  // ── registerRoomAffordances ────────────────────────────────────────────────
  registerRoomAffordances: (roomId: string) => {
    const built = buildRoomAffordances(roomId);
    for (const a of built) {
      get().registerAffordance(a);
    }
  },

  // ── removeAffordance ───────────────────────────────────────────────────────
  removeAffordance: (affordanceId: string) => {
    const state = get();
    if (!state.affordances[affordanceId]) return; // not registered — no-op

    const newAffordances = { ...state.affordances };
    delete newAffordances[affordanceId];

    const seq   = nextSeq(state.seq);
    const event = makeEvent(seq, "affordance.removed", affordanceId);

    set({
      affordances:          newAffordances,
      affordanceIds:        state.affordanceIds.filter((id) => id !== affordanceId),
      selectedAffordanceId: state.selectedAffordanceId === affordanceId
        ? null
        : state.selectedAffordanceId,
      events:               [...state.events, event],
      seq,
    });
  },

  // ── selectAffordance ───────────────────────────────────────────────────────
  selectAffordance: (affordanceId: string | null) => {
    const state = get();
    const seq   = nextSeq(state.seq);
    const event = makeEvent(
      seq,
      "affordance.toggled",
      affordanceId ?? "none",
      affordanceId ? state.affordances[affordanceId] : undefined,
      { prev: state.selectedAffordanceId, next: affordanceId },
    );

    set({
      selectedAffordanceId: affordanceId,
      events:               [...state.events, event],
      seq,
    });
  },

  // ── validateAffordances ────────────────────────────────────────────────────
  validateAffordances: () => {
    const state = get();
    const errors: string[] = [];

    // Group by parentEntityId and validate each group
    const byParent = new Map<string, ControlAffordance[]>();
    for (const a of Object.values(state.affordances)) {
      const arr = byParent.get(a.parent_entity_id) ?? [];
      arr.push(a);
      byParent.set(a.parent_entity_id, arr);
    }

    for (const [parentId, list] of byParent.entries()) {
      errors.push(...validateAffordanceList(list, parentId));
    }

    set({ validationErrors: errors });
    return errors;
  },

  // ── Selectors ─────────────────────────────────────────────────────────────
  getAffordance: (affordanceId: string) =>
    get().affordances[affordanceId],

  getAffordancesForEntity: (
    parentEntityId: string,
    parentEntityType?: ControllableEntityType,
  ) => {
    const all = Object.values(get().affordances);
    return all.filter((a) => {
      if (a.parent_entity_id !== parentEntityId) return false;
      if (parentEntityType && a.parent_entity_type !== parentEntityType) return false;
      return true;
    });
  },

  getAffordancesByEntityType: (entityType: ControllableEntityType) =>
    Object.values(get().affordances).filter(
      (a) => a.parent_entity_type === entityType,
    ),

  getAffordancesByKind: (kind: AffordanceKind) =>
    Object.values(get().affordances).filter((a) => a.affordance_kind === kind),

  computeWorldPosition: (
    affordanceId: string,
    parentWorldPos: AffordanceWorldPosition,
  ): AffordanceWorldPosition | null => {
    const a = get().affordances[affordanceId];
    if (!a) return null;
    return computeAffordanceWorldPos(parentWorldPos, a);
  },

  getAffordanceCount: () => get().affordanceIds.length,

  hasFullEntityTypeCoverage: () => {
    const all = Object.values(get().affordances);

    const hasAgentButton = all.some(
      (a) => a.parent_entity_type === "agent_instance" &&
             a.affordance_kind   === "control_button",
    );
    const hasTaskButton = all.some(
      (a) => a.parent_entity_type === "task" &&
             a.affordance_kind   === "control_button",
    );
    const hasRoomButton = all.some(
      (a) => a.parent_entity_type === "room" &&
             a.affordance_kind   === "control_button",
    );

    return hasAgentButton && hasTaskButton && hasRoomButton;
  },
}));

// ---------------------------------------------------------------------------
// Convenience re-exports
// ---------------------------------------------------------------------------

export {
  buildAgentAffordances,
  buildTaskAffordances,
  buildRoomAffordances,
  isAffordanceKind,
  isControllableEntityType,
};
