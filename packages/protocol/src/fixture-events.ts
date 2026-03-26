/**
 * @module fixture-events
 * RFC-1.0.1 §4 Sub-AC 16d — Fixture event types, payloads, type guards, and
 * utilities for the diegetic 3D command-center GUI.
 *
 * Fixtures are interactive 3D affordances embedded in the scene world: control
 * panels, door/drawer handles, lever mechanisms, and push-buttons.  They are
 * the primary "hands-on" bridge between operator manipulation of the 3D world
 * and concrete system behaviour (commands, lifecycle operations, room navigation).
 *
 * Every time the operator manipulates a fixture — toggling a panel, pulling a
 * handle, or pressing a button — a structured `fixture.*` event is appended to
 * the append-only event log.  This satisfies the *record transparency* supreme
 * design principle: all state-changing actions are traceable, replayable, and
 * auditable from the event log alone.
 *
 * Fixture event hierarchy
 * -----------------------
 *   fixture.panel_toggled   — a diegetic control panel was opened or closed;
 *                             may expand inspector, reveal sub-controls, or
 *                             switch room context
 *   fixture.handle_pulled   — a physical handle (door, drawer, lever, valve,
 *                             slider) changed position; maps to agent lifecycle
 *                             or room-navigation commands
 *   fixture.button_pressed  — a diegetic push-button was activated; typically
 *                             spawns a CommandFile via the ingestion pipeline
 *   fixture.state_changed   — generic catch-all for any fixture whose state
 *                             cannot be described by the three specialised events
 *                             above; enables forward-compatible fixture extensions
 *
 * Behavioural contract
 * --------------------
 * Every fixture type MUST declare what it CAN DO (behavioral_contract), not
 * just what it IS.  The `trigger_source` field distinguishes:
 *   - `direct`     — the operator directly manipulated the fixture in the 3D scene
 *   - `command`    — a system command toggled the fixture state programmatically
 *   - `automation` — a rule, trigger, or replay engine changed the fixture state
 *
 * Cross-layer projection
 * ----------------------
 * Fixture events sit at the boundary of the *domain* and *infrastructure*
 * ontology strata.  A fixture manipulation (domain layer) is projected to a
 * CommandFile in the `.conitens/commands/` directory (infrastructure layer)
 * via the diegetic_projection pattern.  The `command_id` field in fixture
 * payloads records the resulting `CommandFile.command_id` for full traceability.
 *
 * Telemetry isolation
 * -------------------
 * Derived telemetry (heat maps, click frequency, dwell histograms) is stored
 * separately from the primary EventLog, consistent with the telemetry isolation
 * constraint.  The `session_id` field ties fixture events to an operator session
 * for per-session analysis without joining external identity tables.
 */
import type { EventType } from "./event.js";

// ---------------------------------------------------------------------------
// Fixture EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical fixture event type strings. */
export const FIXTURE_EVENT_TYPES = [
  "fixture.panel_toggled",
  "fixture.handle_pulled",
  "fixture.button_pressed",
  "fixture.state_changed",
  // Sub-AC 4 additions — scene-level fixture lifecycle events
  "fixture.placed",
  "fixture.removed",
  "fixture.updated",
  // Sub-AC 4 additions — command.state_changed → fixture.state_sync chain
  // Emitted by the FixtureStateSyncReducer when a command.state_changed event
  // is received.  Instructs the 3D scene to update the visual indicator state
  // (colour, icon, label) of a specific fixture to reflect the new command state.
  "fixture.state_sync",
] as const satisfies readonly EventType[];

export type FixtureEventType = (typeof FIXTURE_EVENT_TYPES)[number];

/** O(1) membership test for fixture event types. */
export const FIXTURE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  FIXTURE_EVENT_TYPES,
);

/** Type guard — narrows a string to a FixtureEventType. */
export function isFixtureEventType(s: string): s is FixtureEventType {
  return FIXTURE_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * Describes how a fixture state change was initiated.
 *
 * - `direct`     — operator directly manipulated the fixture in the 3D scene
 * - `command`    — a system command (CommandFile) triggered the state change
 * - `automation` — a rule, scheduled trigger, or replay engine changed the state
 */
export type FixtureTriggerSource = "direct" | "command" | "automation";

/**
 * Kind of physical handle fixture.
 *
 * - `door`    — a hinged door panel (room entry, cabinet door)
 * - `drawer`  — a sliding drawer mechanism
 * - `lever`   — a rotary or toggle lever (switches, valves)
 * - `valve`   — a rotary valve (pipeline/flow control metaphors)
 * - `slider`  — a linear slider track (volume, intensity, progress)
 */
export type HandleKind = "door" | "drawer" | "lever" | "valve" | "slider";

/**
 * Directional intent of a handle pull gesture.
 *
 * - `open`  / `close` — door / drawer semantics
 * - `up`    / `down`  — lever / valve rotation semantics
 * - `left`  / `right` — horizontal slider semantics
 */
export type HandleDirection = "open" | "close" | "up" | "down" | "left" | "right";

/**
 * Kind of button press gesture.
 *
 * - `tap`     — brief press and release (< 500 ms)
 * - `hold`    — sustained press (≥ 500 ms); hold_duration_ms populated on release
 * - `release` — explicit release event after a `hold` gesture
 */
export type ButtonPressKind = "tap" | "hold" | "release";

// ---------------------------------------------------------------------------
// Payload interfaces — one per canonical fixture event type
// ---------------------------------------------------------------------------

/**
 * fixture.panel_toggled
 *
 * Fired when a diegetic control panel in the 3D scene changes between its
 * `open` and `closed` visual states.  Panels are the primary in-world inspector
 * affordance: opening a panel may expand an agent's status display, reveal
 * sub-control buttons, or switch the room drill-down context.
 *
 * Both `prev_state` and `next_state` MUST be included so that the event is
 * fully self-contained and reversible for replay purposes.
 *
 * When a panel toggle spawns a `CommandFile` (e.g. opening the agent panel
 * triggers an agent.status query), `command_id` records the link.
 */
export interface FixturePanelToggledPayload {
  /** Stable identifier of the panel fixture. */
  fixture_id: string;
  /** Human-readable label of the panel (e.g. "Agent Status Panel", "Room Overview"). */
  fixture_name?: string;
  /** Room identifier where this panel fixture is located. */
  room_id?: string;
  /** Panel state before this event. */
  prev_state: "open" | "closed";
  /** Panel state after this event. */
  next_state: "open" | "closed";
  /** How the toggle was initiated. */
  trigger_source?: FixtureTriggerSource;
  /**
   * Actor identifier (agent_id or user session ID) that triggered the toggle.
   * For `direct` source this is the operator; for `command` it is the CommandFile
   * actor; for `automation` it is the rule/trigger engine.
   */
  triggered_by?: string;
  /**
   * If this panel toggle resulted in a command being issued, the `command_id`
   * of the resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the panel toggled. */
  ts_ms?: number;
}

/**
 * fixture.handle_pulled
 *
 * Fired when the operator (or an automated trigger) actuates a physical handle
 * in the 3D scene.  Handles represent lifecycle and navigation metaphors:
 * pulling a door handle enters a room (drill-down navigation), pulling a lever
 * may pause/resume an agent, sliding a slider may adjust a configuration value.
 *
 * The `pull_distance_pct` field records partial actuation (0–100) so that
 * replay agents can reconstruct the exact visual pose of the handle.
 *
 * When the handle pull results in a `CommandFile` being created (i.e. the
 * system interprets the gesture as an intent), `command_id` records the link.
 */
export interface FixtureHandlePulledPayload {
  /** Stable identifier of the handle fixture. */
  fixture_id: string;
  /** Human-readable label of the handle (e.g. "Lab Door", "Pause Lever"). */
  fixture_name?: string;
  /** Room identifier where this handle fixture is located. */
  room_id?: string;
  /** Physical kind of handle mechanism. */
  handle_kind: HandleKind;
  /** Directional intent of the pull gesture. */
  direction?: HandleDirection;
  /**
   * How far the handle was pulled, expressed as a percentage of its full
   * travel range (0 = resting position, 100 = fully actuated).
   * Enables partial/interrupted gestures to be faithfully recorded.
   */
  pull_distance_pct?: number;
  /**
   * Free-form handle/fixture state label before actuation.
   * Examples: "locked", "closed", "running", "paused".
   */
  prev_state?: string;
  /**
   * Free-form handle/fixture state label after actuation.
   * Examples: "open", "unlocked", "paused", "resumed".
   */
  next_state?: string;
  /** How the handle actuation was initiated. */
  trigger_source?: FixtureTriggerSource;
  /** Actor identifier that triggered the handle pull. */
  triggered_by?: string;
  /**
   * If this handle pull resulted in a command being issued, the `command_id`
   * of the resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the handle was actuated. */
  ts_ms?: number;
}

/**
 * fixture.button_pressed
 *
 * Fired when the operator activates a diegetic push-button in the 3D scene.
 * Buttons are the highest-intent fixture affordance: pressing a button
 * typically results in an immediate `CommandFile` being written to the
 * `.conitens/commands/` ingestion directory, which the orchestrator then
 * processes as a first-class command.
 *
 * The `press_kind` field distinguishes quick taps from held presses, enabling
 * the GUI to implement hold-to-confirm safety patterns for destructive
 * operations (e.g. "hold 3 s to terminate agent").
 *
 * The `command_id` SHOULD be populated whenever a button press triggers a
 * command, providing the full operator-intent → command → orchestrator chain.
 */
export interface FixtureButtonPressedPayload {
  /** Stable identifier of the button fixture. */
  fixture_id: string;
  /** Human-readable label of the button (e.g. "Spawn Agent", "Terminate"). */
  fixture_name?: string;
  /** Room identifier where this button fixture is located. */
  room_id?: string;
  /**
   * Identifier of the individual button when the fixture is a multi-button
   * panel.  `undefined` for single-button fixtures.
   */
  button_id?: string;
  /** Human-readable label shown on/near the button (e.g. "SPAWN", "KILL"). */
  button_label?: string;
  /** Kind of press gesture that was recorded. */
  press_kind?: ButtonPressKind;
  /**
   * Duration in milliseconds the button was held before release.
   * Populated only when `press_kind` is `"hold"` or `"release"`.
   */
  hold_duration_ms?: number;
  /** How the button activation was initiated. */
  trigger_source?: FixtureTriggerSource;
  /** Actor identifier that pressed the button. */
  triggered_by?: string;
  /**
   * The `command_id` of the `CommandFile` created as a result of this button
   * press.  SHOULD be populated for any button that issues a system command.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the button was pressed. */
  ts_ms?: number;
}

/**
 * fixture.state_changed
 *
 * Generic catch-all event for any fixture whose state change cannot be
 * adequately described by the three specialised events above.  Designed as an
 * extensibility hook: new fixture archetypes (dials, screens, holographic
 * displays) can emit `fixture.state_changed` events without requiring a new
 * event type registration.
 *
 * Consumers that understand specific `fixture_type` values may down-cast
 * `prev_state` / `next_state` to their known shape.  Unknown types MUST be
 * treated as opaque records — no rejection or error.
 *
 * Both `prev_state` and `next_state` MUST be included so that the event is
 * self-contained and reversible for replay purposes.
 */
export interface FixtureStateChangedPayload {
  /** Stable identifier of the fixture. */
  fixture_id: string;
  /** Human-readable label of the fixture. */
  fixture_name?: string;
  /** Room identifier where this fixture is located. */
  room_id?: string;
  /**
   * Discriminator string describing the fixture archetype.
   * Examples: "dial", "holographic_screen", "status_light", "map_overlay".
   * Consumers may use this to narrow `prev_state` / `next_state` shapes.
   */
  fixture_type?: string;
  /**
   * Snapshot of the fixture's full state before this event.
   * Structure is fixture_type-specific; consumers MUST tolerate unknown shapes.
   */
  prev_state: Record<string, unknown>;
  /**
   * Snapshot of the fixture's full state after this event.
   * Structure is fixture_type-specific; consumers MUST tolerate unknown shapes.
   */
  next_state: Record<string, unknown>;
  /** Human-readable description of what caused the state change. */
  change_cause?: string;
  /** How the state change was initiated. */
  trigger_source?: FixtureTriggerSource;
  /** Actor identifier that caused the state change. */
  triggered_by?: string;
  /**
   * If this state change resulted in a command being issued, the `command_id`
   * of the resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of the state change. */
  ts_ms?: number;
}

/**
 * fixture.placed
 *
 * Fired when a new fixture is instantiated and placed into the 3D scene.
 * This is a scene-composition event that records the initial configuration
 * of a fixture at the moment it enters the world.
 *
 * The `fixture_type` discriminator allows consumers to interpret the
 * `initial_config` field without requiring a full schema lookup.  The
 * `command_id` field, when present, links this placement to the `CommandFile`
 * that triggered it, enabling full operator-intent → placement traceability.
 *
 * Both `position` and `room_id` SHOULD be populated for 3D scene fixtures
 * so that replay agents can reconstruct the exact initial layout.
 */
export interface FixturePlacedPayload {
  /** Stable identifier assigned to this fixture at placement time. */
  fixture_id: string;
  /** Human-readable label of the placed fixture. */
  fixture_name?: string;
  /**
   * Discriminator string describing the fixture archetype.
   * Examples: "control_panel", "door_handle", "button", "dial", "status_light".
   */
  fixture_type: string;
  /** Room identifier where this fixture was placed. */
  room_id?: string;
  /**
   * 3D world-space position where the fixture was placed.
   * Uses the shared layout Y-up right-handed coordinate convention.
   */
  position?: { x: number; y: number; z: number };
  /**
   * Euler rotation angles (degrees) of the fixture at placement time.
   * Uses the shared layout Y-up right-handed coordinate convention.
   */
  rotation?: { x: number; y: number; z: number };
  /**
   * Initial configuration snapshot for this fixture.
   * Structure is fixture_type-specific; consumers MUST tolerate unknown shapes.
   */
  initial_config?: Record<string, unknown>;
  /** How the placement was initiated. */
  trigger_source?: FixtureTriggerSource;
  /**
   * Actor identifier (agent_id or user session ID) that placed the fixture.
   */
  placed_by?: string;
  /**
   * If this placement was triggered by a command, the `command_id` of the
   * resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of placement. */
  ts_ms?: number;
}

/**
 * fixture.removed
 *
 * Fired when a fixture is removed from the 3D scene.  Removal may be triggered
 * by a direct operator action (dragging a fixture to a trash zone), a system
 * command (programmatic scene cleanup), or an automation rule.
 *
 * The `last_known_config` field provides a snapshot of the fixture's final
 * state so that replay agents can reconstruct the scene before removal and
 * self-improvement agents can analyse which fixtures are frequently removed.
 *
 * Recording removals alongside placements (fixture.placed) enables full
 * fixture lifecycle tracking from creation to deletion via the event log alone.
 */
export interface FixtureRemovedPayload {
  /** Stable identifier of the fixture that was removed. */
  fixture_id: string;
  /** Human-readable label of the removed fixture. */
  fixture_name?: string;
  /** Discriminator string describing the fixture archetype (for analytics). */
  fixture_type?: string;
  /** Room identifier where this fixture was located before removal. */
  room_id?: string;
  /**
   * Final configuration snapshot of the fixture at the moment of removal.
   * Enables replay agents to reconstruct the last known state.
   */
  last_known_config?: Record<string, unknown>;
  /**
   * Human-readable reason for the removal.
   * Examples: "layout_reset", "room_cleared", "operator_request".
   */
  removal_reason?: string;
  /** How the removal was initiated. */
  trigger_source?: FixtureTriggerSource;
  /**
   * Actor identifier (agent_id or user session ID) that removed the fixture.
   */
  removed_by?: string;
  /**
   * If this removal was triggered by a command, the `command_id` of the
   * resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of removal. */
  ts_ms?: number;
}

/**
 * fixture.updated
 *
 * Fired when a fixture's configuration, metadata, or position is updated
 * without changing its operational state (which would emit `fixture.state_changed`).
 * Typical uses: renaming a fixture, repositioning it in the scene, changing its
 * visual appearance or display parameters.
 *
 * Both `prev_config` and `next_config` MUST be included so that the event is
 * fully self-contained and reversible for replay purposes.
 *
 * The `update_fields` array, when populated, lists the top-level keys that
 * changed, enabling consumers to apply partial updates without diffing the
 * full config objects.
 */
export interface FixtureUpdatedPayload {
  /** Stable identifier of the fixture that was updated. */
  fixture_id: string;
  /** Human-readable label of the fixture. */
  fixture_name?: string;
  /** Discriminator string describing the fixture archetype. */
  fixture_type?: string;
  /** Room identifier where this fixture is located. */
  room_id?: string;
  /**
   * Snapshot of the fixture's configuration BEFORE this update.
   * Structure is fixture_type-specific; consumers MUST tolerate unknown shapes.
   */
  prev_config: Record<string, unknown>;
  /**
   * Snapshot of the fixture's configuration AFTER this update.
   * Structure is fixture_type-specific; consumers MUST tolerate unknown shapes.
   */
  next_config: Record<string, unknown>;
  /**
   * Top-level keys in the configuration object that changed.
   * When present, consumers MAY use this list to apply incremental updates
   * rather than replacing the full config.
   */
  update_fields?: string[];
  /** Human-readable description of what was updated. */
  update_reason?: string;
  /** How the update was initiated. */
  trigger_source?: FixtureTriggerSource;
  /**
   * Actor identifier (agent_id or user session ID) that performed the update.
   */
  updated_by?: string;
  /**
   * If this update was triggered by a command, the `command_id` of the
   * resulting `CommandFile` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of the update. */
  ts_ms?: number;
}

/**
 * fixture.state_sync  (Sub-AC 4)
 *
 * Emitted by the `FixtureStateSyncReducer` in the `@conitens/core` package
 * whenever a `command.state_changed` event is processed and the associated
 * command has one or more fixture IDs registered for indicator updates.
 *
 * This event is the **downstream half** of the command → fixture indicator-
 * update chain:
 *
 *   command.state_changed (trigger)
 *     → FixtureStateSyncReducer.reduce()
 *       → EventLog.append(fixture.state_sync)   ← this event
 *         → WebSocket bus broadcasts to GUI clients
 *           → 3D scene updates fixture indicator visual state
 *
 * Visual indicator semantics
 * --------------------------
 * Each fixture indicator has a three-part visual state: colour, icon, and
 * label.  The `indicator_state` field in `next_indicator_state` carries these
 * hints.  Consumers MUST tolerate partial or missing visual hints and fall
 * back to a neutral "unknown" state when unrecognised.
 *
 * Standard indicator colour names (for use in `next_indicator_state.color`):
 *   "green"   → success / completed
 *   "yellow"  → in-progress / processing
 *   "orange"  → warning / retrying / queued
 *   "red"     → error / failed / rejected
 *   "blue"    → informational / dispatched
 *   "grey"    → idle / unknown / cancelled
 *
 * Both `prev_indicator_state` and `next_indicator_state` MUST be included so
 * that the event is self-contained and reversible for replay purposes.
 *
 * Telemetry isolation
 * -------------------
 * Derived telemetry (indicator update frequency, dwell durations per state)
 * is stored separately from the primary EventLog.  The `session_id` field
 * ties this event to an operator session for per-session analysis.
 */
export interface FixtureStateSyncPayload {
  /** Stable identifier of the fixture whose indicator is being synced. */
  fixture_id: string;
  /** Human-readable label of the fixture (for debug / replay display). */
  fixture_name?: string;
  /** Room identifier where this fixture is located. */
  room_id?: string;
  /**
   * The `command_id` from the causation `command.state_changed` event.
   * Enables the full traceability chain:
   *   command_id → command.state_changed → fixture.state_sync → scene update
   */
  causation_command_id: string;
  /**
   * Previous visual indicator state snapshot.
   * Structure:
   *   { color?: string; icon?: string; label?: string; command_state?: string }
   * `undefined` when this is the first sync for this fixture (no prior state).
   */
  prev_indicator_state?: Record<string, unknown>;
  /**
   * New visual indicator state snapshot that the 3D scene should render.
   * MUST be non-null.  Structure:
   *   {
   *     color:         string;  // e.g. "green", "red", "yellow", "grey"
   *     icon?:         string;  // optional icon name / emoji
   *     label?:        string;  // optional short human-readable label
   *     command_state: string;  // the command's new state string
   *   }
   */
  next_indicator_state: Record<string, unknown>;
  /**
   * Human-readable description of what triggered this sync.
   * Examples: "command.state_changed:completed", "command.state_changed:failed".
   */
  sync_source?: string;
  /** How this sync was initiated. */
  trigger_source?: FixtureTriggerSource;
  /** Operator session identifier for telemetry grouping. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of the sync. */
  ts_ms?: number;
}

// ---------------------------------------------------------------------------
// Discriminated payload map — maps event type → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical fixture EventType to its strongly-typed payload.
 *
 * @example
 * ```ts
 * function handleFixture<T extends FixtureEventType>(
 *   type: T, payload: FixtureEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface FixtureEventPayloadMap {
  "fixture.panel_toggled":  FixturePanelToggledPayload;
  "fixture.handle_pulled":  FixtureHandlePulledPayload;
  "fixture.button_pressed": FixtureButtonPressedPayload;
  "fixture.state_changed":  FixtureStateChangedPayload;
  // Sub-AC 4 additions — scene-level fixture lifecycle events
  "fixture.placed":         FixturePlacedPayload;
  "fixture.removed":        FixtureRemovedPayload;
  "fixture.updated":        FixtureUpdatedPayload;
  // Sub-AC 4 additions — command.state_changed → fixture.state_sync chain
  "fixture.state_sync":     FixtureStateSyncPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Set of valid panel states for O(1) membership checks. */
const VALID_PANEL_STATES: ReadonlySet<string> = new Set(["open", "closed"]);

/** Set of valid FixtureTriggerSource strings for O(1) membership checks. */
const VALID_TRIGGER_SOURCES: ReadonlySet<string> = new Set<FixtureTriggerSource>([
  "direct", "command", "automation",
]);

/** Set of valid HandleKind strings for O(1) membership checks. */
const VALID_HANDLE_KINDS: ReadonlySet<string> = new Set<HandleKind>([
  "door", "drawer", "lever", "valve", "slider",
]);

/** Set of valid ButtonPressKind strings for O(1) membership checks. */
const VALID_BUTTON_PRESS_KINDS: ReadonlySet<string> = new Set<ButtonPressKind>([
  "tap", "hold", "release",
]);

/**
 * Type guard for fixture.panel_toggled payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - prev_state ("open" | "closed")
 *   - next_state ("open" | "closed")
 */
export function isFixturePanelToggledPayload(
  p: unknown,
): p is FixturePanelToggledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    typeof p["prev_state"] === "string" &&
    VALID_PANEL_STATES.has(p["prev_state"] as string) &&
    typeof p["next_state"] === "string" &&
    VALID_PANEL_STATES.has(p["next_state"] as string)
  );
}

/**
 * Type guard for fixture.handle_pulled payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - handle_kind (valid HandleKind value)
 */
export function isFixtureHandlePulledPayload(
  p: unknown,
): p is FixtureHandlePulledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    typeof p["handle_kind"] === "string" &&
    VALID_HANDLE_KINDS.has(p["handle_kind"] as string)
  );
}

/**
 * Type guard for fixture.button_pressed payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *
 * Optional validated fields:
 *   - press_kind (valid ButtonPressKind value, if present)
 *   - trigger_source (valid FixtureTriggerSource value, if present)
 */
export function isFixtureButtonPressedPayload(
  p: unknown,
): p is FixtureButtonPressedPayload {
  if (!isObject(p)) return false;
  if (typeof p["fixture_id"] !== "string") return false;
  // Optional field validation
  if (
    p["press_kind"] !== undefined &&
    (typeof p["press_kind"] !== "string" ||
      !VALID_BUTTON_PRESS_KINDS.has(p["press_kind"] as string))
  ) {
    return false;
  }
  if (
    p["trigger_source"] !== undefined &&
    (typeof p["trigger_source"] !== "string" ||
      !VALID_TRIGGER_SOURCES.has(p["trigger_source"] as string))
  ) {
    return false;
  }
  return true;
}

/**
 * Type guard for fixture.state_changed payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - prev_state (plain object)
 *   - next_state (plain object)
 */
export function isFixtureStateChangedPayload(
  p: unknown,
): p is FixtureStateChangedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    isObject(p["prev_state"]) &&
    isObject(p["next_state"])
  );
}

/**
 * Type guard for fixture.placed payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - fixture_type (string)
 */
export function isFixturePlacedPayload(
  p: unknown,
): p is FixturePlacedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    typeof p["fixture_type"] === "string"
  );
}

/**
 * Type guard for fixture.removed payloads.
 *
 * Requires:
 *   - fixture_id (string)
 */
export function isFixtureRemovedPayload(
  p: unknown,
): p is FixtureRemovedPayload {
  if (!isObject(p)) return false;
  return typeof p["fixture_id"] === "string";
}

/**
 * Type guard for fixture.updated payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - prev_config (plain object)
 *   - next_config (plain object)
 */
export function isFixtureUpdatedPayload(
  p: unknown,
): p is FixtureUpdatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    isObject(p["prev_config"]) &&
    isObject(p["next_config"])
  );
}

/**
 * Type guard for fixture.state_sync payloads.
 *
 * Requires:
 *   - fixture_id (string)
 *   - causation_command_id (string)
 *   - next_indicator_state (plain object)
 */
export function isFixtureStateSyncPayload(
  p: unknown,
): p is FixtureStateSyncPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["fixture_id"] === "string" &&
    typeof p["causation_command_id"] === "string" &&
    isObject(p["next_indicator_state"])
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator map — event type → type guard function
// ---------------------------------------------------------------------------

/** All fixture payload type-guard functions keyed by event type. */
export const FIXTURE_PAYLOAD_GUARDS: {
  [K in FixtureEventType]: (p: unknown) => p is FixtureEventPayloadMap[K];
} = {
  "fixture.panel_toggled":  isFixturePanelToggledPayload,
  "fixture.handle_pulled":  isFixtureHandlePulledPayload,
  "fixture.button_pressed": isFixtureButtonPressedPayload,
  "fixture.state_changed":  isFixtureStateChangedPayload,
  // Sub-AC 4 additions — scene-level fixture lifecycle events
  "fixture.placed":         isFixturePlacedPayload,
  "fixture.removed":        isFixtureRemovedPayload,
  "fixture.updated":        isFixtureUpdatedPayload,
  // Sub-AC 4 additions — command.state_changed → fixture.state_sync chain
  "fixture.state_sync":     isFixtureStateSyncPayload,
};

// ---------------------------------------------------------------------------
// Generic validator
// ---------------------------------------------------------------------------

/**
 * Validates a payload against the expected shape for a given fixture event
 * type.  Returns `true` and narrows `payload` if validation passes.
 *
 * @example
 * ```ts
 * if (isValidFixturePayload("fixture.button_pressed", event.payload)) {
 *   // payload is FixtureButtonPressedPayload
 *   console.log(event.payload.fixture_id, event.payload.button_label);
 * }
 * ```
 */
export function isValidFixturePayload<T extends FixtureEventType>(
  type: T,
  payload: unknown,
): payload is FixtureEventPayloadMap[T] {
  return FIXTURE_PAYLOAD_GUARDS[type](payload);
}
