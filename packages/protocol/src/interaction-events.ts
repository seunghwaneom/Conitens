/**
 * @module interaction-events
 * RFC-1.0.1 §4 Sub-AC 4 extension — Interaction event types, payloads, type
 * guards, and utilities for the 3D diegetic command-center GUI.
 *
 * Interaction events record first-class GUI input actions: every time the
 * operator clicks, selects, types, triggers a replay, or pans the viewport, a
 * structured `interaction.*` event is appended to the event log.
 *
 * Recording user interactions as events — rather than treating them as
 * ephemeral UI state — satisfies the *record transparency* supreme design
 * principle: all state-changing actions are traceable, replayable, and auditable
 * from the event log alone.
 *
 * Interaction event hierarchy
 * ---------------------------
 *   interaction.user_input        — the operator submitted a text command or
 *                                   input value via a GUI input field
 *   interaction.selection_changed — the active selection set in the 3D world
 *                                   changed (entity focused / unfocused)
 *   interaction.replay_triggered  — a 3D event-log replay was initiated,
 *                                   paused, resumed, or stopped by the operator
 *   interaction.viewport_changed  — the 3D camera / viewport was transformed
 *                                   (position, orientation, zoom, preset)
 *
 * Design notes
 * ------------
 * • These events are *meta-layer* events: they record how the operator
 *   interacts with the GUI, not changes to domain entities.
 * • They are written to the append-only event log (write-only recording) so
 *   that replay, audit, and self-improvement agents can analyse usage patterns.
 * • Telemetry derived from interaction events is stored separately from the
 *   primary EventLog, per the telemetry isolation constraint.
 * • The `session_id` field ties a sequence of interaction events to a single
 *   operator session, enabling per-session analysis without joining external
 *   identity tables.
 * • All positional/spatial data uses the shared `Vec3` type consistent with
 *   the layout and agent-lifecycle modules.
 */
import type { EventType } from "./event.js";

// ---------------------------------------------------------------------------
// Interaction EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical interaction event type strings. */
export const INTERACTION_EVENT_TYPES = [
  // High-level GUI input events (RFC-1.0.1 §4 Sub-AC 4)
  "interaction.user_input",
  "interaction.selection_changed",
  "interaction.replay_triggered",
  "interaction.viewport_changed",
  // Discrete semantic interaction events (Sub-AC 4 additions)
  "interaction.selected",
  "interaction.hovered",
  "interaction.dismissed",
  // Low-level 3D in-world pointer / gesture events (Sub-AC 16d)
  "interaction.click",
  "interaction.drag",
  "interaction.hover",
  // UI feedback events (Sub-AC 2 additions)
  // Close the loop from operator input → orchestrator action → UI acknowledgment.
  "interaction.command_executed",       // a GUI command was dispatched to the orchestrator
  "interaction.notification_received",  // the GUI received a system notification for the operator
] as const satisfies readonly EventType[];

export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

/** O(1) membership test for interaction event types. */
export const INTERACTION_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  INTERACTION_EVENT_TYPES,
);

/** Type guard — narrows a string to an InteractionEventType. */
export function isInteractionEventType(s: string): s is InteractionEventType {
  return INTERACTION_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * Identifies the GUI surface that originated an interaction event.
 *
 * - `command_bar`   — the top-of-screen text-input command bar
 * - `context_menu`  — a right-click / long-press context menu
 * - `inspector`     — the entity-inspector side panel
 * - `timeline`      — the bottom event-timeline scrubber
 * - `scene`         — direct click / tap on the 3D scene canvas
 * - `keyboard`      — keyboard shortcut with no visible UI element
 * - `toolbar`       — icon toolbar action button
 */
export type InteractionSurface =
  | "command_bar"
  | "context_menu"
  | "inspector"
  | "timeline"
  | "scene"
  | "keyboard"
  | "toolbar";

/**
 * Semantic category of the entity that was selected or deselected.
 *
 * Mirrors `LayoutNodeType` for scene objects and adds higher-level domain
 * entity categories.
 *
 * - `room`     — a room node in the building
 * - `desk`     — a desk / workstation within a room
 * - `agent`    — an agent node
 * - `building` — the building as a whole (top-level drill target)
 * - `task`     — a task card / task entity
 * - `event`    — an event entry in the timeline
 * - `pipeline` — a pipeline execution node
 * - `prop`     — a decorative scene prop (non-interactive by default)
 */
export type SelectableEntityKind =
  | "room"
  | "desk"
  | "agent"
  | "building"
  | "task"
  | "event"
  | "pipeline"
  | "prop";

/**
 * Lifecycle phase of an interaction-triggered replay session.
 *
 * - `started`  — a new replay session began (event log scrubbing starts)
 * - `paused`   — replay was paused at the current position
 * - `resumed`  — a paused replay was resumed
 * - `stopped`  — replay was terminated (returns to live view)
 * - `seeked`   — the playback head was jumped to a specific event index / time
 * - `completed`— replay ran to the end of the recorded event log
 */
export type ReplayPhase =
  | "started"
  | "paused"
  | "resumed"
  | "stopped"
  | "seeked"
  | "completed";

/**
 * How the viewport was changed.
 *
 * - `pan`      — camera was translated in the X/Z ground plane
 * - `orbit`    — camera was rotated around a focal point
 * - `zoom`     — camera distance / field-of-view changed
 * - `preset`   — camera jumped to a named preset position
 * - `focus`    — camera auto-framed a selected entity
 * - `reset`    — camera was reset to the default home position
 */
export type ViewportChangeKind =
  | "pan"
  | "orbit"
  | "zoom"
  | "preset"
  | "focus"
  | "reset";

/**
 * Which pointer button was used for a click or drag event.
 *
 * Follows the W3C PointerEvent `button` convention mapped to semantic names:
 * - `primary`   — left mouse button / primary touch / stylus tip
 * - `secondary` — right mouse button / long-press context activation
 * - `middle`    — middle mouse button / scroll-wheel click
 */
export type PointerButton = "primary" | "secondary" | "middle";

/**
 * Modifier keys held at the time of an interaction event.
 *
 * All fields are optional and default to `false` when absent.
 */
export interface ModifierKeys {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/**
 * Lifecycle phase of a drag gesture.
 *
 * - `started`   — pointer was pressed and moved beyond the drag threshold
 * - `moved`     — pointer moved while dragging (may fire many times)
 * - `ended`     — pointer was released, completing the drag
 * - `cancelled` — drag was cancelled (e.g. Escape key, pointer capture lost)
 */
export type DragPhase = "started" | "moved" | "ended" | "cancelled";

/**
 * Lifecycle phase of a hover (pointer-enter / pointer-leave) event.
 *
 * - `entered` — cursor entered the entity's interactive hover zone
 * - `exited`  — cursor left the entity's interactive hover zone
 */
export type HoverPhase = "entered" | "exited";

// ---------------------------------------------------------------------------
// Payload interfaces — one per canonical interaction event type
// ---------------------------------------------------------------------------

/**
 * interaction.user_input
 *
 * Fired when the operator submits a text command, search query, or other
 * free-form input via the GUI.  The raw `input_value` is recorded verbatim;
 * redaction rules from the `@conitens/protocol` redaction module MUST be
 * applied before appending this event to the log.
 *
 * The `command_id` field, when present, links this input event to the
 * `CommandFile` that was generated from it, enabling full traceability from
 * user intent → command file → orchestrator action.
 */
export interface InteractionUserInputPayload {
  /** Unique identifier for this input event (correlation aid). */
  input_id: string;
  /**
   * The raw text value entered by the operator.
   * MUST be redacted before storage if it contains secrets or PII.
   */
  input_value: string;
  /** GUI surface where the input was captured. */
  surface: InteractionSurface;
  /**
   * If this input was parsed as a structured command, the resulting
   * CommandFile `command_id` — enables input → command traceability.
   */
  command_id?: string;
  /**
   * Whether the input was successfully parsed as a recognised command.
   * `false` indicates the input was unrecognised or malformed.
   */
  parsed_as_command?: boolean;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment input was submitted. */
  submitted_at_ms?: number;
}

/**
 * interaction.selection_changed
 *
 * Fired whenever the operator's active selection set in the 3D scene changes:
 * clicking an entity, Ctrl+clicking to multi-select, or pressing Escape to
 * clear the selection.
 *
 * Both `prev_selection` and `next_selection` MUST be included so that the
 * event is fully self-contained and reversible for replay purposes.
 *
 * The `drill_depth` field tracks the current building → floor → room → desk
 * drill-down level at the time of selection, helping replay agents reconstruct
 * the exact view state.
 */
export interface InteractionSelectionChangedPayload {
  /**
   * Stable identifier(s) of the entity/entities that were selected AFTER
   * this event.  Empty array means the selection was cleared.
   */
  next_selection: string[];
  /**
   * Entity kind of the primary selected entity (first item in
   * `next_selection`).  Undefined when the selection was cleared.
   */
  next_selection_kind?: SelectableEntityKind;
  /**
   * Stable identifier(s) of the entity/entities that were selected BEFORE
   * this event.  Empty array means there was no prior selection.
   */
  prev_selection: string[];
  /**
   * Whether this is a multi-select action (Ctrl+click or equivalent).
   * When `true`, `next_selection` may contain more than one entity id.
   */
  is_multi_select?: boolean;
  /**
   * Current drill-down depth in the building hierarchy at time of selection.
   * 0 = building overview, 1 = floor, 2 = room, 3 = desk/agent.
   */
  drill_depth?: number;
  /** The room_id the operator is currently "inside" (drill context). */
  active_room_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** GUI surface where the selection change was initiated. */
  surface?: InteractionSurface;
}

/**
 * interaction.replay_triggered
 *
 * Fired when the operator interacts with the 3D event-log replay system:
 * starting, pausing, resuming, stopping, seeking, or completing a replay.
 *
 * The `replay_session_id` groups all replay lifecycle events for a single
 * scrubbing session, enabling analytics on how operators navigate the timeline.
 *
 * Timestamps in this payload are event-log positions (event indices or ISO
 * timestamps from the log), NOT wall-clock times, so that the replay is
 * reproducible independently of when it was triggered.
 */
export interface InteractionReplayTriggeredPayload {
  /** Unique identifier for this replay session. */
  replay_session_id: string;
  /** Lifecycle phase of the replay at the time of this event. */
  phase: ReplayPhase;
  /**
   * The event-log timestamp (ISO 8601) or index at which replay begins or
   * was seeked to.  Required for `started` and `seeked` phases.
   */
  replay_from?: string;
  /**
   * The event-log timestamp (ISO 8601) or index at which replay ends.
   * `undefined` means replay runs to the end of the log.
   */
  replay_to?: string;
  /**
   * Current playback position in the event log (ISO 8601 timestamp of the
   * last event rendered).  Populated on `paused`, `resumed`, `seeked`,
   * `stopped`, and `completed` phases.
   */
  current_position?: string;
  /**
   * Zero-based index of the last event rendered at the time of this lifecycle
   * change.  Enables fast O(1) replay seek without timestamp parsing.
   */
  current_event_index?: number;
  /**
   * Playback speed multiplier (1.0 = real-time, 2.0 = 2× speed, etc.).
   * Defaults to 1.0 if not specified.
   */
  playback_speed?: number;
  /**
   * Whether the replay includes spatial animation (agents moving through
   * rooms) or only event-log text changes.
   */
  spatial_mode?: boolean;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
}

/**
 * interaction.viewport_changed
 *
 * Fired whenever the 3D camera or viewport configuration changes as a result
 * of direct operator input (mouse drag, scroll wheel, keyboard navigation,
 * or preset selection).
 *
 * Both `from_*` and `to_*` fields MUST be included so that the event is
 * self-contained and reversible for replay purposes.
 *
 * Camera coordinate system follows a right-handed Y-up convention consistent
 * with the `Vec3` type used throughout the layout module.
 */
export interface InteractionViewportChangedPayload {
  /** What kind of viewport transformation occurred. */
  change_kind: ViewportChangeKind;
  /**
   * Camera world-space position before the change.
   * Coordinates use the shared layout Y-up right-handed convention.
   */
  from_position?: { x: number; y: number; z: number };
  /**
   * Camera world-space position after the change.
   */
  to_position?: { x: number; y: number; z: number };
  /**
   * Camera look-at target (focal point) before the change.
   */
  from_target?: { x: number; y: number; z: number };
  /**
   * Camera look-at target (focal point) after the change.
   */
  to_target?: { x: number; y: number; z: number };
  /**
   * Camera vertical field-of-view in degrees before the change.
   * Applicable to perspective cameras only.
   */
  from_fov_deg?: number;
  /**
   * Camera vertical field-of-view in degrees after the change.
   */
  to_fov_deg?: number;
  /**
   * Named preset the camera jumped to, when `change_kind` is "preset".
   * Examples: "overview", "room_control", "lab_close", "agent_focus".
   */
  preset_name?: string;
  /**
   * Entity id the camera auto-framed, when `change_kind` is "focus".
   */
  focused_entity_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** GUI surface that initiated the viewport change. */
  surface?: InteractionSurface;
}

/**
 * interaction.selected
 *
 * Fired when the operator explicitly selects a single entity in the 3D world.
 * This is a high-level semantic event that complements `interaction.selection_changed`:
 * whereas `selection_changed` describes any change to the full selection set
 * (including multi-select and deselect), `selected` is a focused event that
 * fires once per entity selection action and always refers to a single entity.
 *
 * Use this event when you need a simple "entity was selected" signal without
 * the prev/next set bookkeeping required by `selection_changed`.  Consumers
 * that need full set semantics SHOULD listen to `selection_changed` instead.
 *
 * The `entity_id` field is REQUIRED — use `interaction.selection_changed` with
 * an empty `next_selection` array to record a deselection.
 */
export interface InteractionSelectedPayload {
  /** Unique identifier for this selection event (correlation aid). */
  selection_id: string;
  /** Stable identifier of the entity that was selected. */
  entity_id: string;
  /** Semantic kind of the selected entity. */
  entity_kind?: SelectableEntityKind;
  /**
   * Current drill-down depth in the building hierarchy at time of selection.
   * 0 = building overview, 1 = floor, 2 = room, 3 = desk/agent.
   */
  drill_depth?: number;
  /** The room_id the operator is currently "inside" (drill context). */
  active_room_id?: string;
  /** GUI surface that originated the selection. */
  surface?: InteractionSurface;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of selection. */
  ts_ms?: number;
}

/**
 * interaction.hovered
 *
 * High-level semantic hover event: fired when the operator moves their cursor
 * over a domain entity in the 3D world and the GUI system registers intent to
 * highlight, tooltip, or pre-fetch data for that entity.
 *
 * This event differs from `interaction.hover` (Sub-AC 16d) in granularity:
 * - `interaction.hover` fires at the raw pointer-enter / pointer-leave level
 *   and requires a `hover_id` to correlate the matching entered/exited pair.
 * - `interaction.hovered` fires once per logical "hover on entity X" gesture
 *   and records whether the hover is beginning or ending, plus optional metadata
 *   about what the system displayed in response (tooltip text, highlight kind).
 *
 * Consumers that drive tooltip rendering SHOULD use `interaction.hovered`;
 * consumers that compute dwell time or heat maps SHOULD use `interaction.hover`.
 */
export interface InteractionHoveredPayload {
  /** Stable identifier of the entity being hovered. */
  entity_id: string;
  /** Semantic kind of the hovered entity. */
  entity_kind?: SelectableEntityKind;
  /**
   * Whether the hover is starting (`true`) or ending (`false`).
   * A value of `true` indicates the operator moved onto the entity;
   * `false` indicates the cursor has left the entity's hover zone.
   */
  is_hovering: boolean;
  /** Human-readable tooltip text displayed for this hover, if any. */
  tooltip_text?: string;
  /** GUI surface where the hover event occurred. */
  surface?: InteractionSurface;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the hover state changed. */
  ts_ms?: number;
}

/**
 * interaction.dismissed
 *
 * Fired when the operator explicitly dismisses a UI overlay, pop-up panel,
 * tooltip, notification banner, modal dialog, or any other transient GUI
 * element.  Recording dismissals enables self-improvement agents to analyse
 * which UI elements are dismissed quickly (indicating low value) and which
 * are kept open (indicating high engagement).
 *
 * The `dismissed_kind` field categorises what was dismissed so that analytics
 * consumers do not need to parse `dismissed_id` strings.  The optional
 * `dismissed_after_ms` pre-computes the time from display to dismissal,
 * saving analytics consumers from performing the join against the display event.
 */
export interface InteractionDismissedPayload {
  /** Stable identifier of the UI element that was dismissed. */
  dismissed_id: string;
  /**
   * Semantic category of what was dismissed.
   *
   * - `panel`        — inspector or detail panel
   * - `tooltip`      — hover tooltip
   * - `notification` — system notification banner
   * - `modal`        — blocking modal dialog
   * - `overlay`      — non-modal overlay
   * - `menu`         — context menu or dropdown
   */
  dismissed_kind: "panel" | "tooltip" | "notification" | "modal" | "overlay" | "menu";
  /**
   * How the dismissal was triggered.
   *
   * - `explicit`   — operator pressed close/dismiss button
   * - `focus_loss` — element auto-dismissed when focus moved away
   * - `timeout`    — element auto-dismissed after a display timeout
   * - `escape_key` — operator pressed Escape
   */
  dismiss_reason?: "explicit" | "focus_loss" | "timeout" | "escape_key";
  /**
   * How long (in ms) the UI element was visible before dismissal.
   * Enables engagement analytics without joining against a display event.
   */
  dismissed_after_ms?: number;
  /** GUI surface that originated the dismiss action. */
  surface?: InteractionSurface;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of dismissal. */
  ts_ms?: number;
}

/**
 * interaction.click
 *
 * Fired when the operator performs a pointer click directly on a 3D in-world
 * entity or on the empty scene canvas.  Captures both the semantic entity
 * context (which entity, what kind) and the raw spatial context (3D world
 * position, screen coordinates, modifier keys held).
 *
 * This is a lower-level event than `interaction.selection_changed` — a click
 * MAY produce a selection change, but not all clicks do (e.g. clicking an
 * already-selected entity, clicking a fixture button, or a right-click that
 * opens a context menu without changing selection).
 *
 * The `command_id` field links this click to any `CommandFile` that was
 * spawned as a result, enabling full click → command → orchestrator traceability.
 */
export interface InteractionClickPayload {
  /** Unique identifier for this click event (correlation aid). */
  click_id: string;
  /**
   * Stable identifier of the entity that was clicked.
   * `undefined` means the click hit empty scene space.
   */
  entity_id?: string;
  /**
   * Semantic kind of the clicked entity.
   * `undefined` when `entity_id` is absent (empty-space click).
   */
  entity_kind?: SelectableEntityKind;
  /**
   * 3D world-space position of the click ray intersection point.
   * Uses the shared layout Y-up right-handed coordinate convention.
   */
  position: { x: number; y: number; z: number };
  /**
   * Viewport pixel coordinates (CSS pixels, origin top-left) at the time
   * of the click.  Useful for correlating with screen-space UI overlays.
   */
  screen_position?: { x: number; y: number };
  /** Which pointer button was used. */
  button: PointerButton;
  /** Modifier keys held at the time of the click. */
  modifiers?: ModifierKeys;
  /** Whether this click was part of a double-click gesture. */
  double_click?: boolean;
  /** GUI surface that received the click event. */
  surface: InteractionSurface;
  /**
   * If this click spawned a `CommandFile` (e.g. fixture activation),
   * the resulting command's `command_id` for full traceability.
   */
  command_id?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the click was registered. */
  ts_ms?: number;
}

/**
 * interaction.drag
 *
 * Fired at each phase of a pointer drag gesture on a 3D in-world entity or
 * control surface.  A complete drag emits at minimum two events: `started`
 * and either `ended` or `cancelled`.  Optional `moved` events may be emitted
 * at a throttled rate during continuous pointer motion.
 *
 * Drag events are essential for recording fixture handle pulls, entity
 * repositioning, and viewport manipulation that cannot be captured as discrete
 * clicks.
 *
 * The `drag_id` correlates all phase events for a single drag gesture so that
 * replay agents can reconstruct the full motion trajectory.
 */
export interface InteractionDragPayload {
  /** Unique identifier grouping all phase events for this drag gesture. */
  drag_id: string;
  /** Current phase of the drag lifecycle. */
  phase: DragPhase;
  /**
   * Stable identifier of the entity being dragged.
   * `undefined` when dragging empty scene space (e.g. viewport orbit).
   */
  entity_id?: string;
  /** Semantic kind of the dragged entity. */
  entity_kind?: SelectableEntityKind;
  /**
   * 3D world-space position where the drag started (always set for the
   * `started` phase; may be omitted in `moved` events for bandwidth economy).
   */
  from_position: { x: number; y: number; z: number };
  /**
   * 3D world-space position where the drag ended.
   * Required for the `ended` and `cancelled` phases.
   */
  to_position?: { x: number; y: number; z: number };
  /**
   * 3D world-space position of the pointer at the time of this event.
   * Required for `moved` phase events; represents the running drag endpoint.
   */
  current_position?: { x: number; y: number; z: number };
  /**
   * Incremental 3D movement delta since the previous drag event.
   * Useful for `moved` phase consumers that want velocity / gesture speed.
   */
  delta?: { x: number; y: number; z: number };
  /** Which pointer button is held during the drag. */
  button?: PointerButton;
  /** Modifier keys held throughout this drag phase. */
  modifiers?: ModifierKeys;
  /** GUI surface that originated the drag. */
  surface: InteractionSurface;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of this drag phase event. */
  ts_ms?: number;
}

/**
 * interaction.hover
 *
 * Fired when the operator's cursor enters or exits a 3D in-world entity's
 * interactive hover zone.  Hover events drive tooltip display, entity
 * highlight, and pre-fetch of entity detail data — they must be recorded to
 * enable replay agents to reconstruct the full visual state of the scene.
 *
 * The `hover_id` links the matching `entered` and `exited` event pair so that
 * hover dwell time can be computed without an additional join.  The
 * `dwell_ms` field in `exited` events pre-computes this value.
 */
export interface InteractionHoverPayload {
  /** Unique identifier linking the paired entered/exited events. */
  hover_id: string;
  /** Whether the cursor entered or exited the hover zone. */
  phase: HoverPhase;
  /**
   * Stable identifier of the hovered entity.
   * `undefined` means the cursor moved over empty scene space.
   */
  entity_id?: string;
  /** Semantic kind of the hovered entity. */
  entity_kind?: SelectableEntityKind;
  /**
   * 3D world-space position of the cursor ray intersection point.
   * Uses the shared layout Y-up right-handed coordinate convention.
   */
  position?: { x: number; y: number; z: number };
  /** Viewport pixel coordinates (CSS pixels, origin top-left). */
  screen_position?: { x: number; y: number };
  /** GUI surface where the hover event occurred. */
  surface: InteractionSurface;
  /**
   * Duration in milliseconds the cursor dwelt over the entity before exiting.
   * Populated only in `exited` phase events; computed as `exited_ts - entered_ts`.
   */
  dwell_ms?: number;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of the hover phase change. */
  ts_ms?: number;
}

// ---------------------------------------------------------------------------
// Discriminated payload map — maps event type → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical interaction EventType to its strongly-typed payload.
 *
 * @example
 * ```ts
 * function handleInteraction<T extends InteractionEventType>(
 *   type: T, payload: InteractionEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface InteractionEventPayloadMap {
  "interaction.user_input":       InteractionUserInputPayload;
  "interaction.selection_changed": InteractionSelectionChangedPayload;
  "interaction.replay_triggered": InteractionReplayTriggeredPayload;
  "interaction.viewport_changed": InteractionViewportChangedPayload;
  // Sub-AC 4 additions — discrete semantic interaction events
  "interaction.selected":         InteractionSelectedPayload;
  "interaction.hovered":          InteractionHoveredPayload;
  "interaction.dismissed":        InteractionDismissedPayload;
  // Sub-AC 16d — 3D in-world direct manipulation events
  "interaction.click":            InteractionClickPayload;
  "interaction.drag":             InteractionDragPayload;
  "interaction.hover":            InteractionHoverPayload;
  // Sub-AC 2 additions — UI feedback events
  "interaction.command_executed":       InteractionCommandExecutedPayload;
  "interaction.notification_received":  InteractionNotificationReceivedPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Set of valid InteractionSurface strings for O(1) membership checks. */
const VALID_SURFACES: ReadonlySet<string> = new Set<InteractionSurface>([
  "command_bar", "context_menu", "inspector", "timeline", "scene", "keyboard", "toolbar",
]);

/** Set of valid ReplayPhase strings for O(1) membership checks. */
const VALID_REPLAY_PHASES: ReadonlySet<string> = new Set<ReplayPhase>([
  "started", "paused", "resumed", "stopped", "seeked", "completed",
]);

/** Set of valid ViewportChangeKind strings for O(1) membership checks. */
const VALID_VIEWPORT_CHANGE_KINDS: ReadonlySet<string> = new Set<ViewportChangeKind>([
  "pan", "orbit", "zoom", "preset", "focus", "reset",
]);

/** Set of valid PointerButton strings for O(1) membership checks. */
const VALID_POINTER_BUTTONS: ReadonlySet<string> = new Set<PointerButton>([
  "primary", "secondary", "middle",
]);

/** Set of valid DragPhase strings for O(1) membership checks. */
const VALID_DRAG_PHASES: ReadonlySet<string> = new Set<DragPhase>([
  "started", "moved", "ended", "cancelled",
]);

/** Set of valid HoverPhase strings for O(1) membership checks. */
const VALID_HOVER_PHASES: ReadonlySet<string> = new Set<HoverPhase>([
  "entered", "exited",
]);

/**
 * Type guard for interaction.user_input payloads.
 *
 * Requires: input_id (string), input_value (string), surface (valid value).
 */
export function isInteractionUserInputPayload(
  p: unknown,
): p is InteractionUserInputPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["input_id"] === "string" &&
    typeof p["input_value"] === "string" &&
    typeof p["surface"] === "string" &&
    VALID_SURFACES.has(p["surface"] as string)
  );
}

/**
 * Type guard for interaction.selection_changed payloads.
 *
 * Requires: next_selection (string[]), prev_selection (string[]).
 * Both arrays may be empty (representing cleared or no prior selection).
 */
export function isInteractionSelectionChangedPayload(
  p: unknown,
): p is InteractionSelectionChangedPayload {
  if (!isObject(p)) return false;
  return (
    Array.isArray(p["next_selection"]) &&
    (p["next_selection"] as unknown[]).every(id => typeof id === "string") &&
    Array.isArray(p["prev_selection"]) &&
    (p["prev_selection"] as unknown[]).every(id => typeof id === "string")
  );
}

/**
 * Type guard for interaction.replay_triggered payloads.
 *
 * Requires: replay_session_id (string), phase (valid ReplayPhase value).
 */
export function isInteractionReplayTriggeredPayload(
  p: unknown,
): p is InteractionReplayTriggeredPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["replay_session_id"] === "string" &&
    typeof p["phase"] === "string" &&
    VALID_REPLAY_PHASES.has(p["phase"] as string)
  );
}

/**
 * Type guard for interaction.viewport_changed payloads.
 *
 * Requires: change_kind (valid ViewportChangeKind value).
 */
export function isInteractionViewportChangedPayload(
  p: unknown,
): p is InteractionViewportChangedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["change_kind"] === "string" &&
    VALID_VIEWPORT_CHANGE_KINDS.has(p["change_kind"] as string)
  );
}

/** Set of valid dismissed_kind strings for O(1) membership checks. */
const VALID_DISMISSED_KINDS: ReadonlySet<string> = new Set([
  "panel", "tooltip", "notification", "modal", "overlay", "menu",
]);

/** Set of valid dismiss_reason strings for O(1) membership checks. */
const VALID_DISMISS_REASONS: ReadonlySet<string> = new Set([
  "explicit", "focus_loss", "timeout", "escape_key",
]);

/**
 * Type guard for interaction.selected payloads.
 *
 * Requires:
 *   - selection_id (string)
 *   - entity_id (string)
 */
export function isInteractionSelectedPayload(
  p: unknown,
): p is InteractionSelectedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["selection_id"] === "string" &&
    typeof p["entity_id"] === "string"
  );
}

/**
 * Type guard for interaction.hovered payloads.
 *
 * Requires:
 *   - entity_id (string)
 *   - is_hovering (boolean)
 */
export function isInteractionHoveredPayload(
  p: unknown,
): p is InteractionHoveredPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["entity_id"] === "string" &&
    typeof p["is_hovering"] === "boolean"
  );
}

/**
 * Type guard for interaction.dismissed payloads.
 *
 * Requires:
 *   - dismissed_id (string)
 *   - dismissed_kind (valid value)
 */
export function isInteractionDismissedPayload(
  p: unknown,
): p is InteractionDismissedPayload {
  if (!isObject(p)) return false;
  if (typeof p["dismissed_id"] !== "string") return false;
  if (
    typeof p["dismissed_kind"] !== "string" ||
    !VALID_DISMISSED_KINDS.has(p["dismissed_kind"] as string)
  ) {
    return false;
  }
  if (
    p["dismiss_reason"] !== undefined &&
    (typeof p["dismiss_reason"] !== "string" ||
      !VALID_DISMISS_REASONS.has(p["dismiss_reason"] as string))
  ) {
    return false;
  }
  return true;
}

/**
 * Type guard for interaction.click payloads.
 *
 * Requires:
 *   - click_id (string)
 *   - position (object with x, y, z numbers)
 *   - button (valid PointerButton value)
 *   - surface (valid InteractionSurface value)
 */
export function isInteractionClickPayload(
  p: unknown,
): p is InteractionClickPayload {
  if (!isObject(p)) return false;
  if (typeof p["click_id"] !== "string") return false;
  if (typeof p["button"] !== "string" || !VALID_POINTER_BUTTONS.has(p["button"] as string)) return false;
  if (typeof p["surface"] !== "string" || !VALID_SURFACES.has(p["surface"] as string)) return false;
  const pos = p["position"];
  if (!isObject(pos)) return false;
  return (
    typeof (pos as Record<string, unknown>)["x"] === "number" &&
    typeof (pos as Record<string, unknown>)["y"] === "number" &&
    typeof (pos as Record<string, unknown>)["z"] === "number"
  );
}

/**
 * Type guard for interaction.drag payloads.
 *
 * Requires:
 *   - drag_id (string)
 *   - phase (valid DragPhase value)
 *   - from_position (object with x, y, z numbers)
 *   - surface (valid InteractionSurface value)
 */
export function isInteractionDragPayload(
  p: unknown,
): p is InteractionDragPayload {
  if (!isObject(p)) return false;
  if (typeof p["drag_id"] !== "string") return false;
  if (typeof p["phase"] !== "string" || !VALID_DRAG_PHASES.has(p["phase"] as string)) return false;
  if (typeof p["surface"] !== "string" || !VALID_SURFACES.has(p["surface"] as string)) return false;
  const from = p["from_position"];
  if (!isObject(from)) return false;
  return (
    typeof (from as Record<string, unknown>)["x"] === "number" &&
    typeof (from as Record<string, unknown>)["y"] === "number" &&
    typeof (from as Record<string, unknown>)["z"] === "number"
  );
}

/**
 * Type guard for interaction.hover payloads.
 *
 * Requires:
 *   - hover_id (string)
 *   - phase (valid HoverPhase value)
 *   - surface (valid InteractionSurface value)
 */
export function isInteractionHoverPayload(
  p: unknown,
): p is InteractionHoverPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["hover_id"] === "string" &&
    typeof p["phase"] === "string" &&
    VALID_HOVER_PHASES.has(p["phase"] as string) &&
    typeof p["surface"] === "string" &&
    VALID_SURFACES.has(p["surface"] as string)
  );
}

// ---------------------------------------------------------------------------
// Sub-AC 2 — UI feedback payload interfaces
// ---------------------------------------------------------------------------

/**
 * interaction.command_executed  (Sub-AC 2)
 *
 * Fired when a structured GUI command is dispatched to the orchestrator via
 * the command-file ingestion pipeline.  This event closes the observability
 * loop between operator intent (interaction.user_input) and orchestrator
 * acknowledgment (command.acknowledged / command.completed).
 *
 * Whereas `interaction.user_input` records the raw text the operator typed,
 * this event records the *outcome* of parsing and dispatching that input as
 * a structured command — enabling end-to-end traceability:
 *   operator input → command parsed → command dispatched → executed
 *
 * Consumers correlate this event with the CommandFile record via `command_id`
 * and with the orchestrator outcome via the `command.*` event chain.
 */
export interface InteractionCommandExecutedPayload {
  /** Unique identifier for this execution event (correlation aid). */
  execution_id: string;
  /**
   * The CommandFile `command_id` that was dispatched.
   * Enables traceability to the full command record.
   */
  command_id: string;
  /**
   * The GuiCommandType string (e.g. "agent.spawn", "task.create").
   * Stored here for queryability without joining the CommandFile record.
   */
  command_type: string;
  /**
   * Immediate dispatch status at the time this event is emitted.
   * - `submitted`    — command file written to inbox; orchestrator not yet confirmed
   * - `acknowledged` — orchestrator confirmed receipt (command.acknowledged received)
   * - `failed`       — dispatch failed before acknowledgment
   */
  status: "submitted" | "acknowledged" | "failed";
  /**
   * Human-readable error message when `status` is "failed".
   * Absent for non-error statuses.
   */
  error_message?: string;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment of dispatch. */
  ts_ms?: number;
}

/**
 * interaction.notification_received  (Sub-AC 2)
 *
 * Fired when the GUI receives a notification from the system and presents it
 * to the operator (banner, toast, badge, or modal alert).  Recording
 * notifications as events enables self-improvement agents to analyse:
 *   - Which notifications operators acknowledge quickly vs dismiss slowly
 *   - Notification frequency and fatigue patterns
 *   - Correlation between notifications and subsequent operator actions
 *
 * This event is emitted when the notification is *received and displayed*,
 * not when it is dismissed — use `interaction.dismissed` for dismissal.
 *
 * The optional `source_event_id` links this notification to the domain event
 * that triggered it (e.g. an `agent.error` or `task.failed` event), forming
 * a traceable chain from system state change → notification → operator action.
 */
export interface InteractionNotificationReceivedPayload {
  /** Unique identifier for this notification instance. */
  notification_id: string;
  /**
   * Semantic category of the notification.
   * - `info`    — informational message (low urgency)
   * - `warning` — potential issue that may need attention
   * - `error`   — error condition that likely requires operator action
   * - `success` — confirmation of a completed operation
   */
  notification_kind: "info" | "warning" | "error" | "success";
  /** Short human-readable title of the notification. */
  title: string;
  /** Full notification body text, if any. */
  message?: string;
  /**
   * event_id of the domain event that triggered this notification.
   * Links the notification back to the root cause in the event log.
   */
  source_event_id?: string;
  /**
   * Whether this notification requires the operator to take an explicit action
   * (e.g. approve/deny, acknowledge error) before it can be dismissed.
   */
  action_required?: boolean;
  /** Session identifier grouping this event with concurrent interactions. */
  session_id?: string;
  /** Monotonic wall-clock time (ms) at the moment the notification appeared. */
  ts_ms?: number;
}

/** Set of valid command execution status strings for O(1) membership checks. */
const VALID_COMMAND_EXEC_STATUSES: ReadonlySet<string> = new Set([
  "submitted", "acknowledged", "failed",
]);

/** Set of valid notification kind strings for O(1) membership checks. */
const VALID_NOTIFICATION_KINDS: ReadonlySet<string> = new Set([
  "info", "warning", "error", "success",
]);

/**
 * Type guard for interaction.command_executed payloads.
 *
 * Requires: execution_id (string), command_id (string),
 *           command_type (string), status (valid value).
 */
export function isInteractionCommandExecutedPayload(
  p: unknown,
): p is InteractionCommandExecutedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["execution_id"]  === "string" &&
    typeof p["command_id"]    === "string" &&
    typeof p["command_type"]  === "string" &&
    typeof p["status"]        === "string" &&
    VALID_COMMAND_EXEC_STATUSES.has(p["status"] as string)
  );
}

/**
 * Type guard for interaction.notification_received payloads.
 *
 * Requires: notification_id (string), notification_kind (valid value),
 *           title (string).
 */
export function isInteractionNotificationReceivedPayload(
  p: unknown,
): p is InteractionNotificationReceivedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["notification_id"]   === "string" &&
    typeof p["notification_kind"] === "string" &&
    VALID_NOTIFICATION_KINDS.has(p["notification_kind"] as string) &&
    typeof p["title"]             === "string"
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator map — event type → type guard function
// ---------------------------------------------------------------------------

/** All interaction payload type-guard functions keyed by event type. */
export const INTERACTION_PAYLOAD_GUARDS: {
  [K in InteractionEventType]: (p: unknown) => p is InteractionEventPayloadMap[K];
} = {
  "interaction.user_input":        isInteractionUserInputPayload,
  "interaction.selection_changed": isInteractionSelectionChangedPayload,
  "interaction.replay_triggered":  isInteractionReplayTriggeredPayload,
  "interaction.viewport_changed":  isInteractionViewportChangedPayload,
  // Sub-AC 4 additions — discrete semantic interaction events
  "interaction.selected":          isInteractionSelectedPayload,
  "interaction.hovered":           isInteractionHoveredPayload,
  "interaction.dismissed":         isInteractionDismissedPayload,
  // Sub-AC 16d — 3D in-world direct manipulation events
  "interaction.click":             isInteractionClickPayload,
  "interaction.drag":              isInteractionDragPayload,
  "interaction.hover":             isInteractionHoverPayload,
  // Sub-AC 2 additions — UI feedback events
  "interaction.command_executed":       isInteractionCommandExecutedPayload,
  "interaction.notification_received":  isInteractionNotificationReceivedPayload,
};

// ---------------------------------------------------------------------------
// Generic validator
// ---------------------------------------------------------------------------

/**
 * Validates a payload against the expected shape for a given interaction
 * event type.  Returns `true` and narrows `payload` if validation passes.
 *
 * @example
 * ```ts
 * if (isValidInteractionPayload("interaction.user_input", event.payload)) {
 *   // payload is InteractionUserInputPayload
 *   console.log(event.payload.input_id, event.payload.surface);
 * }
 * ```
 */
export function isValidInteractionPayload<T extends InteractionEventType>(
  type: T,
  payload: unknown,
): payload is InteractionEventPayloadMap[T] {
  return INTERACTION_PAYLOAD_GUARDS[type](payload);
}
