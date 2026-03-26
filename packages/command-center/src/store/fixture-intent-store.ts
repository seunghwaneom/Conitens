/**
 * fixture-intent-store.ts — Zustand store for fixture affordance interaction intents.
 *
 * Sub-AC 7b: Interaction intent production — records every user interaction
 * (click, drag, hover-select) on a control_button, handle, or menu_anchor as a
 * typed FixtureInteractionIntent with correct source affordance reference.
 *
 * Design
 * ──────
 * Mirrors the design of interaction-intent-store.ts (agent layer) but targets
 * the fixture affordance layer.  Every emitted intent is:
 *   • Appended to a fixed-size ring buffer (FIXTURE_INTENT_BUFFER_MAX)
 *   • Forwarded to the scene event log (category "fixture.interaction_intent")
 *   • Fully JSON-serialisable (record transparency invariant)
 *
 * stopPropagation contract
 * ────────────────────────
 * The store does NOT call stopPropagation().  Callers (use-affordance-interaction-
 * handlers.ts) MUST call e.stopPropagation() BEFORE invoking emitFixtureIntent().
 * This keeps the store pure (no DOM/R3F dependencies) and independently testable.
 *
 * Scene event log integration
 * ───────────────────────────
 * Each intent is forwarded to the scene event log via recordEntry() with
 * category "fixture.interaction_intent".  If the log is not recording, the
 * intent is still stored in the local buffer.
 *
 * Source affordance reference
 * ────────────────────────────
 * Every intent carries the full source affordance reference:
 *   • intent.fixtureId   — affordance_id of the ControlAffordance
 *   • intent.fixtureKind — "button" | "handle" | "menu_anchor"
 *   • intent.entityRef   — { entityType, entityId } from parent entity
 *
 * Usage
 * ─────
 *   const { emitFixtureIntent } = useFixtureIntentStore();
 *   emitFixtureIntent(makeFixtureButtonClickedIntent({ ... }));
 */

import { create } from "zustand";
import { useSceneEventLog } from "./scene-event-log.js";
import type {
  FixtureInteractionIntent,
  FixtureInteractionIntentKind,
} from "../scene/fixture-interaction-intents.js";

// Re-export types for consumers
export type { FixtureInteractionIntent, FixtureInteractionIntentKind };

// ── Scene event log category ──────────────────────────────────────────────────

/**
 * Category tag used when forwarding fixture interaction intents to the scene
 * event log.  Stable identifier for replay engine.
 */
export const FIXTURE_INTERACTION_INTENT_CATEGORY =
  "fixture.interaction_intent" as const;

// ── Ring buffer ───────────────────────────────────────────────────────────────

/** Maximum number of intents retained in the ring buffer. */
export const FIXTURE_INTENT_BUFFER_MAX = 200;

// ── Store shape ───────────────────────────────────────────────────────────────

export interface FixtureIntentStoreState {
  // ── Data ──────────────────────────────────────────────────────────────────
  /**
   * Append-only ring buffer of recent fixture interaction intents.
   * Oldest entries are evicted once FIXTURE_INTENT_BUFFER_MAX is reached.
   * Read-only from outside the store.
   */
  readonly intents: ReadonlyArray<FixtureInteractionIntent>;

  /**
   * Total number of intents emitted this session (monotonic, survives
   * ring-buffer eviction — reflects true cumulative count).
   */
  readonly totalEmitted: number;

  /**
   * The most recently emitted intent, or null if none yet.
   */
  readonly lastIntent: FixtureInteractionIntent | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Emit a fixture interaction intent.
   *
   * Appends to the local ring buffer AND forwards to the scene event log.
   * Callers MUST have already called event.stopPropagation() before invoking.
   *
   * @param intent — A fully-constructed FixtureInteractionIntent (any variant)
   */
  emitFixtureIntent: (intent: FixtureInteractionIntent) => void;

  /**
   * Return all intents for a given fixtureId (most-recent first).
   * O(n) scan — suitable for inspector panels, not per-frame use.
   */
  getIntentsForFixture: (fixtureId: string) => FixtureInteractionIntent[];

  /**
   * Return all intents of a given kind (most-recent first).
   * Useful for filtering e.g. all FIXTURE_HANDLE_DRAG_END events.
   */
  getIntentsByKind: (
    kind: FixtureInteractionIntentKind,
  ) => FixtureInteractionIntent[];

  /**
   * Return all intents whose entityRef.entityId matches the given entityId.
   * Useful for inspector panels — show "last interaction on this agent's buttons".
   */
  getIntentsForEntity: (entityId: string) => FixtureInteractionIntent[];

  /**
   * Return all intents whose entityRef.entityType matches the given entity type.
   */
  getIntentsByEntityType: (
    entityType: string,
  ) => FixtureInteractionIntent[];

  /** Clear all stored intents (e.g., on session reset). */
  clearIntents: () => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function appendWithRingEviction<T>(
  arr: ReadonlyArray<T>,
  item: T,
  maxSize: number,
): T[] {
  const next = [...arr, item];
  if (next.length > maxSize) {
    return next.slice(next.length - maxSize);
  }
  return next;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useFixtureIntentStore = create<FixtureIntentStoreState>(
  (set, get) => ({
    intents:      [],
    totalEmitted: 0,
    lastIntent:   null,

    // ── emitFixtureIntent ───────────────────────────────────────────────────
    emitFixtureIntent: (intent: FixtureInteractionIntent) => {
      const { intents, totalEmitted } = get();

      // 1. Append to local ring buffer
      const nextIntents = appendWithRingEviction(
        intents,
        intent,
        FIXTURE_INTENT_BUFFER_MAX,
      );

      set({
        intents:      nextIntents,
        totalEmitted: totalEmitted + 1,
        lastIntent:   intent,
      });

      // 2. Forward to scene event log (write-only, fire-and-forget)
      //    Access via getState() to avoid React context coupling — this store
      //    must remain usable outside component trees (e.g., in tests).
      try {
        const sceneLog = useSceneEventLog.getState();
        if (sceneLog.recording) {
          sceneLog.recordEntry({
            ts:       intent.ts,
            category: FIXTURE_INTERACTION_INTENT_CATEGORY as Parameters<
              typeof sceneLog.recordEntry
            >[0]["category"],
            source:   "agent",
            payload:  intent as unknown as Record<string, unknown>,
          });
        }
      } catch {
        // Scene event log is not available (e.g., test environment without
        // store provider).  Emit silently — intent captured in local buffer.
      }
    },

    // ── getIntentsForFixture ────────────────────────────────────────────────
    getIntentsForFixture: (fixtureId: string) =>
      [...get().intents]
        .filter((i) => i.fixtureId === fixtureId)
        .reverse(),

    // ── getIntentsByKind ────────────────────────────────────────────────────
    getIntentsByKind: (kind: FixtureInteractionIntentKind) =>
      [...get().intents]
        .filter((i) => i.intent === kind)
        .reverse(),

    // ── getIntentsForEntity ─────────────────────────────────────────────────
    getIntentsForEntity: (entityId: string) =>
      [...get().intents]
        .filter((i) => i.entityRef.entityId === entityId)
        .reverse(),

    // ── getIntentsByEntityType ──────────────────────────────────────────────
    getIntentsByEntityType: (entityType: string) =>
      [...get().intents]
        .filter((i) => i.entityRef.entityType === entityType)
        .reverse(),

    // ── clearIntents ────────────────────────────────────────────────────────
    clearIntents: () => {
      set({ intents: [], totalEmitted: 0, lastIntent: null });
    },
  }),
);
