/**
 * ui-fixture-store.ts — Zustand entity store for `ui_fixture` entities.
 *
 * Sub-AC 6a (Sub-AC 1): Define and register a ui_fixture entity of
 * fixture_type 'dashboard_panel' in the entity store, including spatial
 * position/transform data and required metadata fields per the ontology_schema.
 *
 * This store is the runtime entity registry for all `ui_fixture` instances
 * (dashboards panels, control panels, status lights, info kiosks).
 *
 * Design principles (matching the wider store layer):
 *   - EVENT-SOURCED: every state change appends a `UiFixtureStoreEvent`
 *   - APPEND-ONLY:   the events log is never truncated (record transparency)
 *   - STATIC INIT:   `initFixtures()` seeds from DEFAULT_UI_FIXTURES at boot;
 *                    zero I/O — all defaults are inlined in the registry
 *   - BEHAVIORAL:    every fixture has a non-empty `behavioral_contract.actions`
 *   - REFLEXIVE:     the store can register itself as a ui_fixture entry
 *
 * Event sourcing contract:
 *   fixture.placed        — entity registered (initial placement or runtime add)
 *   fixture.updated       — entity fields mutated after placement
 *   fixture.removed       — entity unregistered
 *   fixture.panel_toggled — panel interacted with by operator (click/select)
 *   fixture.initialized   — all default fixtures registered on scene boot
 *
 * Ontology budget note:
 *   `ui_fixture` entities are domain-level; the store does not add top-level
 *   ontology fields — it uses the existing `UiFixtureDef` shape defined in
 *   ui-fixture-registry.ts.
 */

import { create } from "zustand";
import {
  DEFAULT_UI_FIXTURES,
  validateUiFixtureRegistry,
  isUiFixtureType,
  type UiFixtureDef,
  type UiFixtureType,
  type UiFixtureTransform,
  type DashboardPanelVisualConfig,
  type DashboardPanelMetadata,
} from "../data/ui-fixture-registry.js";

// ---------------------------------------------------------------------------
// Re-export data types for consumers
// ---------------------------------------------------------------------------

export type {
  UiFixtureDef,
  UiFixtureType,
  UiFixtureTransform,
  DashboardPanelVisualConfig,
  DashboardPanelMetadata,
};

// ---------------------------------------------------------------------------
// Store event types (event-sourcing)
// ---------------------------------------------------------------------------

/**
 * Discriminated event types emitted by the ui-fixture store.
 * Every mutation appends one or more events for full audit traceability.
 */
export type UiFixtureEventType =
  | "fixture.placed"        // Entity registered (initial or runtime)
  | "fixture.updated"       // Entity fields mutated after placement
  | "fixture.removed"       // Entity unregistered
  | "fixture.panel_toggled" // Panel interacted with by operator
  | "fixture.initialized";  // All default fixtures registered on boot

/** A single event record in the ui-fixture event log. */
export interface UiFixtureStoreEvent {
  /** Monotonically increasing sequence number. */
  seq: number;
  /** Event type discriminator. */
  type: UiFixtureEventType;
  /** The fixture_id this event pertains to. */
  fixtureId: string;
  /** Timestamp (ms since epoch). */
  ts: number;
  /** Optional metadata (mutation diff, toggle state, etc.). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

/**
 * Visual selection state for a fixture (e.g. when an operator clicks it).
 */
export interface UiFixtureSelectionState {
  /** fixture_id of the selected fixture, or null if none. */
  selectedFixtureId: string | null;
  /** When the selection was made (ms since epoch). */
  selectedAt: number | null;
}

// ---------------------------------------------------------------------------
// Store state shape
// ---------------------------------------------------------------------------

/**
 * The full state shape of the ui-fixture Zustand store.
 *
 * Key design decisions:
 *   - `fixtures` is a Record<fixture_id, UiFixtureDef> for O(1) lookup
 *   - `fixtureIds` is an ordered array for stable iteration order
 *   - `events` is an append-only audit log (never truncated)
 *   - `initialized` flags whether the default fixtures have been seeded
 */
export interface UiFixtureState {
  // ── Entity registry ──────────────────────────────────────────────────────
  /** Registered fixtures keyed by fixture_id. */
  fixtures: Record<string, UiFixtureDef>;
  /** Ordered list of registered fixture_ids (insertion order). */
  fixtureIds: string[];
  /** Whether initFixtures() has been called (prevents double-seeding). */
  initialized: boolean;

  // ── Selection state ───────────────────────────────────────────────────────
  /** Currently selected fixture, or null. */
  selectedFixtureId: string | null;
  /** When the selection was made. */
  selectedAt: number | null;

  // ── Event log (append-only) ───────────────────────────────────────────────
  /** Append-only audit log of all store events. */
  events: UiFixtureStoreEvent[];
  /** Next sequence number. */
  seq: number;

  // ── Validation ────────────────────────────────────────────────────────────
  /** Validation errors from the last validateFixtures() call. */
  validationErrors: string[];

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Seed the store with all DEFAULT_UI_FIXTURES.
   * Idempotent: if `initialized === true`, this is a no-op.
   * Emits `fixture.placed` for each fixture and `fixture.initialized` at end.
   */
  initFixtures: () => void;

  /**
   * Register a single fixture entity.
   * Emits `fixture.placed` (or `fixture.updated` if fixture_id already exists).
   *
   * @param fixture  A fully-populated UiFixtureDef entity.
   */
  registerFixture: (fixture: UiFixtureDef) => void;

  /**
   * Remove a fixture by fixture_id.
   * Emits `fixture.removed`. No-op if fixture_id not found.
   *
   * @param fixtureId  The stable fixture identifier.
   */
  removeFixture: (fixtureId: string) => void;

  /**
   * Select a fixture (operator click / highlight).
   * Emits `fixture.panel_toggled`.
   *
   * @param fixtureId  Fixture to select, or null to deselect.
   */
  selectFixture: (fixtureId: string | null) => void;

  /**
   * Run the registry validation and store results.
   * Returns the validation errors array.
   */
  validateFixtures: () => string[];

  // ── Selectors (derived, not Zustand derived state — simple getters) ───────
  /**
   * Get a single UiFixtureDef by fixture_id.
   * Returns undefined if not registered.
   */
  getFixture: (fixtureId: string) => UiFixtureDef | undefined;

  /**
   * Get all registered fixtures for a given room.
   */
  getFixturesForRoom: (roomId: string) => UiFixtureDef[];

  /**
   * Get all registered fixtures of a given type.
   */
  getFixturesByType: (fixtureType: UiFixtureType) => UiFixtureDef[];

  /**
   * Get all registered `dashboard_panel` fixtures.
   */
  getDashboardPanels: () => UiFixtureDef[];

  /**
   * Get the current fixture count.
   */
  getFixtureCount: () => number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a next sequence number from current state. */
function nextSeq(current: number): number {
  return current + 1;
}

/** Build a UiFixtureStoreEvent. */
function makeEvent(
  seq: number,
  type: UiFixtureEventType,
  fixtureId: string,
  meta?: Record<string, unknown>,
): UiFixtureStoreEvent {
  return { seq, type, fixtureId, ts: Date.now(), meta };
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useUiFixtureStore = create<UiFixtureState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  fixtures: {},
  fixtureIds: [],
  initialized: false,
  selectedFixtureId: null,
  selectedAt: null,
  events: [],
  seq: 0,
  validationErrors: [],

  // ── initFixtures ─────────────────────────────────────────────────────────
  initFixtures: () => {
    const state = get();
    if (state.initialized) return; // idempotent

    const fixtures: Record<string, UiFixtureDef> = {};
    const fixtureIds: string[] = [];
    const newEvents: UiFixtureStoreEvent[] = [];
    let seq = state.seq;

    for (const fixture of DEFAULT_UI_FIXTURES) {
      fixtures[fixture.fixture_id] = fixture;
      fixtureIds.push(fixture.fixture_id);
      seq = nextSeq(seq);
      newEvents.push(
        makeEvent(seq, "fixture.placed", fixture.fixture_id, {
          fixture_type: fixture.fixture_type,
          room_id: fixture.room_id,
          ontology_level: fixture.ontology_level,
          position: fixture.transform.position,
          facing: fixture.transform.facing,
          mountType: fixture.transform.mountType,
        }),
      );
    }

    // Emit fixture.initialized once all placements are recorded
    seq = nextSeq(seq);
    newEvents.push(
      makeEvent(seq, "fixture.initialized", "registry", {
        count: fixtureIds.length,
        dashboard_panels: fixtureIds.filter(
          (id) => fixtures[id].fixture_type === "dashboard_panel",
        ).length,
      }),
    );

    set({
      fixtures,
      fixtureIds,
      initialized: true,
      events: [...state.events, ...newEvents],
      seq,
    });
  },

  // ── registerFixture ───────────────────────────────────────────────────────
  registerFixture: (fixture: UiFixtureDef) => {
    const state = get();
    const isUpdate = !!state.fixtures[fixture.fixture_id];
    const seq = nextSeq(state.seq);

    const newFixtures = { ...state.fixtures, [fixture.fixture_id]: fixture };
    const newIds = isUpdate
      ? state.fixtureIds
      : [...state.fixtureIds, fixture.fixture_id];

    const event = makeEvent(
      seq,
      isUpdate ? "fixture.updated" : "fixture.placed",
      fixture.fixture_id,
      {
        fixture_type: fixture.fixture_type,
        room_id: fixture.room_id,
        ontology_level: fixture.ontology_level,
        position: fixture.transform.position,
        facing: fixture.transform.facing,
        mountType: fixture.transform.mountType,
        is_update: isUpdate,
      },
    );

    set({
      fixtures: newFixtures,
      fixtureIds: newIds,
      events: [...state.events, event],
      seq,
    });
  },

  // ── removeFixture ─────────────────────────────────────────────────────────
  removeFixture: (fixtureId: string) => {
    const state = get();
    if (!state.fixtures[fixtureId]) return; // not registered — no-op

    const newFixtures = { ...state.fixtures };
    delete newFixtures[fixtureId];

    const seq = nextSeq(state.seq);
    const event = makeEvent(seq, "fixture.removed", fixtureId);

    set({
      fixtures: newFixtures,
      fixtureIds: state.fixtureIds.filter((id) => id !== fixtureId),
      // Clear selection if the removed fixture was selected
      selectedFixtureId:
        state.selectedFixtureId === fixtureId ? null : state.selectedFixtureId,
      selectedAt:
        state.selectedFixtureId === fixtureId ? null : state.selectedAt,
      events: [...state.events, event],
      seq,
    });
  },

  // ── selectFixture ─────────────────────────────────────────────────────────
  selectFixture: (fixtureId: string | null) => {
    const state = get();
    const seq = nextSeq(state.seq);
    const event = makeEvent(
      seq,
      "fixture.panel_toggled",
      fixtureId ?? "none",
      { prev: state.selectedFixtureId, next: fixtureId },
    );

    set({
      selectedFixtureId: fixtureId,
      selectedAt: fixtureId ? Date.now() : null,
      events: [...state.events, event],
      seq,
    });
  },

  // ── validateFixtures ──────────────────────────────────────────────────────
  validateFixtures: () => {
    const state = get();
    const errors = validateUiFixtureRegistry(Object.values(state.fixtures));
    set({ validationErrors: errors });
    return errors;
  },

  // ── Selectors ─────────────────────────────────────────────────────────────
  getFixture: (fixtureId: string) => get().fixtures[fixtureId],

  getFixturesForRoom: (roomId: string) =>
    Object.values(get().fixtures).filter((f) => f.room_id === roomId),

  getFixturesByType: (fixtureType: UiFixtureType) =>
    Object.values(get().fixtures).filter((f) => f.fixture_type === fixtureType),

  getDashboardPanels: () =>
    Object.values(get().fixtures).filter(
      (f) => f.fixture_type === "dashboard_panel",
    ),

  getFixtureCount: () => get().fixtureIds.length,
}));

// ---------------------------------------------------------------------------
// Convenience re-exports for consumers
// ---------------------------------------------------------------------------

export { isUiFixtureType };
