/**
 * @module reducers
 * RFC-1.0.1 §11 Sub-AC 4 — FixtureStateSyncReducer
 *
 * Implements the command.state_changed → fixture.state_sync causal chain.
 *
 * When a `command.state_changed` event is processed:
 *   1. Extract `fixture_ids` from the event payload.
 *   2. For each fixture, compute the new visual indicator state
 *      (colour, icon, label) from the command's `next_state`.
 *   3. Append a `fixture.state_sync` event to the EventLog via the injected
 *      EventLog dependency.  The WebSocket bus then broadcasts this event to
 *      all connected GUI clients, which update their fixture indicator meshes.
 *
 * Design decisions
 * ----------------
 * - The EventLog is injected at construction time so this reducer can emit
 *   follow-up events without going through the command-file ingestion pipeline.
 *   This keeps the chain synchronous within a single `processCommand()` call
 *   and avoids a file-system round-trip.
 *
 * - In-memory `indicatorState` is rebuilt from events during replay (via
 *   `reset()` + re-run).  The reducer never reads from the file system for
 *   its own state — satisfying the I-2 invariant.
 *
 * - Visual indicator colours follow the standard palette defined in
 *   `FixtureStateSyncPayload` JSDoc:
 *     "green"   → completed
 *     "yellow"  → processing / acknowledged / dispatched
 *     "orange"  → retrying / queued / escalated
 *     "red"     → failed / rejected / timeout / cancelled
 *     "blue"    → issued / pending
 *     "grey"    → unknown / idle / default
 *
 * Record transparency
 * -------------------
 * Every `fixture.state_sync` event appended here is an immutable audit record.
 * The 3D scene indicator update is a *projection* of this event — it can be
 * fully reconstructed by replaying the event log.
 */

import type { ConitensEvent, EventType } from "@conitens/protocol";
import type { BaseReducer } from "./base-reducer.js";
import type { EventLog } from "../event-log/event-log.js";

// ---------------------------------------------------------------------------
// Visual indicator state helpers
// ---------------------------------------------------------------------------

/**
 * In-memory snapshot of a fixture's current indicator state.
 * Built from `fixture.state_sync` events during replay.
 */
interface FixtureIndicatorRecord {
  /** fixture_id this record belongs to. */
  fixtureId: string;
  /** The command_id that last caused this fixture's indicator to sync. */
  lastCommandId: string;
  /** The command's last known state string. */
  lastCommandState: string;
  /** Computed visual indicator snapshot at the time of the last sync. */
  indicatorState: Record<string, unknown>;
  /** ISO 8601 timestamp of the last sync. */
  lastSyncTs: string;
}

/**
 * Compute a visual indicator state from a command state string.
 *
 * Follows the standard colour palette from `FixtureStateSyncPayload` JSDoc.
 * Returns a plain object suitable for use as `next_indicator_state` in the
 * `fixture.state_sync` payload.
 */
function computeIndicatorState(
  commandState: string,
  commandId: string,
): Record<string, unknown> {
  // Colour mapping — standard palette
  const colour = stateToColour(commandState);
  const icon   = stateToIcon(commandState);
  const label  = stateToLabel(commandState);

  return {
    color:         colour,
    icon:          icon,
    label:         label,
    command_id:    commandId,
    command_state: commandState,
  };
}

function stateToColour(state: string): string {
  switch (state) {
    case "completed":                 return "green";
    case "processing":
    case "acknowledged":
    case "dispatched":                return "yellow";
    case "retrying":
    case "queued":
    case "escalated":                 return "orange";
    case "failed":
    case "rejected":
    case "timeout":
    case "cancelled":                 return "red";
    case "issued":
    case "pending":                   return "blue";
    default:                          return "grey";
  }
}

function stateToIcon(state: string): string {
  switch (state) {
    case "completed":   return "✓";
    case "processing":
    case "acknowledged":
    case "dispatched":  return "⟳";
    case "retrying":    return "↺";
    case "queued":      return "⏳";
    case "escalated":   return "↑";
    case "failed":      return "✗";
    case "rejected":    return "⊘";
    case "timeout":     return "⏱";
    case "cancelled":   return "⊗";
    case "issued":
    case "pending":     return "○";
    default:            return "?";
  }
}

function stateToLabel(state: string): string {
  // Title-case the state string with spaces for underscores
  return state
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// FixtureStateSyncReducer
// ---------------------------------------------------------------------------

/**
 * Subscribes to `command.state_changed` events and emits a `fixture.state_sync`
 * event for each fixture listed in the event's `fixture_ids` array.
 *
 * Injecting the EventLog at construction allows follow-up events to be appended
 * synchronously within the same `processCommand()` call without file I/O.
 */
export class FixtureStateSyncReducer implements BaseReducer {
  readonly name = "FixtureStateSyncReducer";

  /**
   * Subscribe only to `command.state_changed` events.
   * The reducer ignores all other event types.
   */
  readonly inputEvents: EventType[] = ["command.state_changed"];

  /** Injected EventLog for emitting follow-up `fixture.state_sync` events. */
  private readonly eventLog: EventLog;

  /** In-memory fixture indicator state (reset on replay). */
  private indicatorState = new Map<string, FixtureIndicatorRecord>();

  /** Re-entrancy guard — prevents infinite loops if fixture.state_sync
   *  is ever accidentally subscribed to by this or another sync reducer. */
  private reducing = false;

  constructor(eventLog: EventLog) {
    this.eventLog = eventLog;
  }

  /**
   * Handle a `command.state_changed` event.
   *
   * For each `fixture_id` in `event.payload.fixture_ids`:
   *   1. Compute the new visual indicator state from `next_state`.
   *   2. Capture the previous indicator state (for backward-compatible replay).
   *   3. Append a `fixture.state_sync` event to the EventLog.
   *   4. Update in-memory indicator state.
   *
   * @param event       The `command.state_changed` ConitensEvent.
   * @param conitensDir Absolute path to the .conitens/ directory (unused here).
   */
  async reduce(event: ConitensEvent, _conitensDir: string): Promise<void> {
    if (event.type !== "command.state_changed") return;
    // Re-entrancy guard: if we're already inside reduce(), bail out.
    // This prevents infinite loops if runReducers() processes our emitted
    // fixture.state_sync events synchronously.
    if (this.reducing) return;
    this.reducing = true;
    try {
      await this._doReduce(event, _conitensDir);
    } finally {
      this.reducing = false;
    }
  }

  private async _doReduce(event: ConitensEvent, _conitensDir: string): Promise<void> {

    const payload = event.payload as {
      command_id?: unknown;
      next_state?: unknown;
      prev_state?: unknown;
      fixture_ids?: unknown;
    };

    // Validate required payload fields
    const commandId = typeof payload.command_id === "string" ? payload.command_id : null;
    const nextState  = typeof payload.next_state  === "string" ? payload.next_state  : null;
    const prevState  = typeof payload.prev_state  === "string" ? payload.prev_state  : "unknown";

    if (!commandId || !nextState) {
      // Malformed payload — skip silently (the orchestrator's validation
      // layer should have caught this, but we defend here too).
      return;
    }

    // Extract fixture_ids — may be absent (no fixture sync needed)
    const fixtureIds: string[] = Array.isArray(payload.fixture_ids)
      ? (payload.fixture_ids as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [];

    if (fixtureIds.length === 0) return; // no fixtures to sync

    // Compute new indicator state once — shared across all affected fixtures
    const nextIndicatorState = computeIndicatorState(nextState, commandId);
    const syncSource = `command.state_changed:${nextState}`;
    const tsMs = typeof payload === "object" && payload !== null &&
      typeof (payload as Record<string, unknown>)["ts_ms"] === "number"
      ? (payload as Record<string, unknown>)["ts_ms"] as number
      : Date.now();

    // Process each fixture
    for (const fixtureId of fixtureIds) {
      const prev = this.indicatorState.get(fixtureId);
      const prevIndicatorState: Record<string, unknown> | undefined =
        prev ? { ...prev.indicatorState } : undefined;

      // Append fixture.state_sync event — this is the downstream half of the chain
      const syncEvent = await this.eventLog.append({
        type: "fixture.state_sync",
        run_id: event.run_id,
        task_id: event.task_id,
        actor: { kind: "system", id: "fixture-state-sync-reducer" },
        causation_id: event.event_id,
        correlation_id: event.correlation_id,
        payload: {
          fixture_id: fixtureId,
          causation_command_id: commandId,
          prev_indicator_state:  prevIndicatorState,
          next_indicator_state:  nextIndicatorState,
          sync_source:           syncSource,
          trigger_source:        "automation" as const,
          ts_ms:                 tsMs,
        },
      });

      // Update in-memory indicator state
      this.indicatorState.set(fixtureId, {
        fixtureId,
        lastCommandId:    commandId,
        lastCommandState: nextState,
        indicatorState:   nextIndicatorState,
        lastSyncTs:       syncEvent.ts,
      });
    }
  }

  /**
   * Reset in-memory indicator state for replay.
   * The EventLog contains the canonical source of truth; this map is a cache.
   */
  reset(): void {
    this.indicatorState.clear();
  }

  // ---------------------------------------------------------------------------
  // Public read-only accessors (for testing and GUI projection)
  // ---------------------------------------------------------------------------

  /**
   * Get the current in-memory indicator record for a fixture.
   * Returns `undefined` if no sync has been processed for this fixture yet.
   */
  getIndicatorRecord(fixtureId: string): Readonly<FixtureIndicatorRecord> | undefined {
    return this.indicatorState.get(fixtureId);
  }

  /**
   * Get all current in-memory indicator records.
   * Returns a snapshot array — mutations to the returned objects are not
   * reflected in the reducer's internal state.
   */
  getAllIndicatorRecords(): ReadonlyArray<Readonly<FixtureIndicatorRecord>> {
    return Array.from(this.indicatorState.values());
  }

  /**
   * Number of fixture indicators currently tracked.
   */
  get indicatorCount(): number {
    return this.indicatorState.size;
  }
}
