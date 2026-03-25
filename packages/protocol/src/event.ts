/**
 * @module event
 * RFC-1.0.1 §4 — Event envelope and EventType dictionary.
 */
import type { SchemaVersion } from "./schema-version.js";

// ---------------------------------------------------------------------------
// EventType — §4.2 canonical dictionary
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  // Task
  "task.created", "task.assigned", "task.status_changed",
  "task.spec_updated", "task.artifact_added",
  "task.completed", "task.failed", "task.cancelled",
  // Handoff
  "handoff.requested", "handoff.accepted",
  "handoff.rejected", "handoff.completed",
  // Decision
  "decision.proposed", "decision.accepted", "decision.rejected",
  // Approval
  "approval.requested", "approval.granted", "approval.denied",
  // Agent — core lifecycle
  "agent.spawned", "agent.heartbeat", "agent.error", "agent.terminated",
  // Agent — extended lifecycle (RFC-1.0.1 §4 Sub-AC 2 extension)
  "agent.migrated", "agent.lifecycle.changed",
  // Agent — idle state (RFC-1.0.1 §4 Sub-AC 2 extension)
  // Emitted when an agent transitions into the idle operational status,
  // i.e. it is ready but has no active task assignment.
  "agent.idle",
  // Agent — health monitoring (RFC-1.0.1 §4 Sub-AC 2)
  "agent.health_changed",
  // Agent — extended state/lifecycle events (Sub-AC 2 additions)
  // These capture capability and persona changes that affect agent behaviour
  // without requiring a full spawn/terminate cycle — enabling hot reconfiguration.
  "agent.capability_changed", // agent's capability tags were dynamically updated
  "agent.persona_updated",    // agent's persona config was hot-reloaded
  // Agent — spatial & assignment (3D command-center)
  "agent.moved", "agent.assigned",
  "agent.status_changed", "agent.task.started", "agent.task.completed",
  // Agent — explicit lifecycle operation events (Sub-AC 16b)
  // These complement agent.lifecycle.changed by providing first-class, queryable
  // events for each named lifecycle operation (spawn-request, pause, resume,
  // suspend, retire, and migration request).
  "agent.spawn_requested",      // pre-spawn intent (bridges command → event layer)
  "agent.paused",               // agent was explicitly paused
  "agent.resumed",              // paused/suspended agent was resumed
  "agent.suspended",            // agent was suspended (system-triggered, resource pressure)
  "agent.retire_requested",     // graceful retirement requested by operator/system
  "agent.retired",              // graceful retirement completed (planned end-of-service)
  "agent.migration_requested",  // pre-migration request (before agent.migrated)
  // Message
  "message.received", "message.sent", "message.internal",
  // Memory
  "memory.recalled",
  "memory.update_proposed", "memory.update_approved", "memory.update_rejected",
  // Mode
  "mode.switch_requested", "mode.switch_completed",
  // System
  "system.started", "system.shutdown", "system.reconciliation",
  // Command — lifecycle events (RFC-1.0.1 §4 Sub-AC 2)
  "command.issued", "command.acknowledged", "command.completed", "command.failed", "command.rejected",
  // Command — control-plane dispatching events (Sub-AC 16b)
  // Model the full journey of a command through the control plane:
  // issued → queued → dispatched → acknowledged → completed | failed
  //                                              → retried → …
  //                                              → timeout
  //                                              → cancelled
  //                                              → escalated → completed | failed
  "command.dispatched",  // command was routed to a specific executor
  "command.queued",      // command entered an executor work queue
  "command.retried",     // command was automatically retried after failure
  "command.timeout",     // command exceeded its execution time limit
  "command.cancelled",   // command was explicitly cancelled before completion
  "command.escalated",   // command escalated to higher authority for approval/execution
  // Command — generic state transition catch-all (Sub-AC 4)
  // Emitted for any command state change not covered by the specific lifecycle events
  // above; carries prev/next state and optional fixture_ids so that the
  // fixture-state-sync reducer can update 3D indicator panels in the scene.
  "command.state_changed",  // generic command state transition (fixture-sync trigger)
  // Pipeline — multi-step execution events (RFC-1.0.1 §4 Sub-AC 3)
  // Stage lifecycle events (Sub-AC 16c) — symmetric start/complete/fail per stage
  "pipeline.started", "pipeline.step",
  "pipeline.stage_started", "pipeline.stage_completed", "pipeline.stage_failed",
  // Task routing events (Sub-AC 16c) — record how tasks are directed to executors
  "pipeline.task_routed",
  "pipeline.completed", "pipeline.failed", "pipeline.cancelled",
  // Layout — 3D command-center spatial layout events
  // layout.init    — spatial-bootstrapping: emitted once per run to seed the
  //                  scene with the full building/room/agent/fixture initial positions.
  // layout.update  — update INITIATED (intent/in-progress; complement to layout.updated)
  // layout.updated — update COMPLETED (past-tense, with diff; all subsequent mutations)
  // layout.reset   — layout restored to its canonical default configuration
  "layout.init",
  "layout.created", "layout.update", "layout.updated", "layout.deleted",
  "layout.node.moved",
  "layout.changed", "layout.reset", "layout.saved", "layout.loaded",
  // Meeting — room-based collaboration events
  "meeting.scheduled",
  "meeting.started", "meeting.ended",
  "meeting.participant.joined", "meeting.participant.left",
  // Meeting — protocol phase events (Sub-AC 10d)
  "meeting.deliberation", "meeting.resolved",
  // Meeting — task spawning events (Sub-AC 10c)
  // Emitted for each SpawnedTask produced when a meeting.resolved transition occurs.
  // Persisted to the EventLog so task provenance is fully traceable from meeting → task.
  "meeting.task.spawned",
  // Meeting — lifecycle control events (Sub-AC 2)
  // Explicit cancellation and rescheduling of meetings so the event log fully
  // captures meeting lifecycle changes without requiring log-scan inference.
  "meeting.cancelled",    // a meeting was explicitly cancelled (before or after start)
  "meeting.rescheduled",  // a meeting's scheduled time and/or room was changed
  // Schema — ontology self-registration & evolution events (RFC-1.0.1 Sub-AC 4)
  "schema.registered", "schema.updated", "schema.deprecated",
  "schema.removed",
  // Schema validation lifecycle (Sub-AC 16c) — symmetric start/complete for validation runs
  "schema.validation_started", "schema.validated",
  // Schema migration lifecycle (Sub-AC 16c) — symmetric start/complete for migration runs
  "schema.migration_started", "schema.migrated",
  // Interaction — 3D command-center GUI operator input events (RFC-1.0.1 §4 Sub-AC 4)
  "interaction.user_input", "interaction.selection_changed",
  "interaction.replay_triggered", "interaction.viewport_changed",
  // Interaction — Sub-AC 4 additions: discrete semantic interaction events
  "interaction.selected",       // operator explicitly selected a single entity
  "interaction.hovered",        // operator is hovering over an entity (high-level)
  "interaction.dismissed",      // operator dismissed a UI element (overlay, tooltip, notification)
  // Interaction — 3D in-world direct manipulation events (Sub-AC 16d)
  // These record low-level pointer/gesture events directly on 3D scene objects,
  // complementing the higher-level selection/viewport/replay events above.
  "interaction.click",          // operator clicked a 3D in-world entity or surface
  "interaction.drag",           // operator dragged a 3D entity or control handle
  "interaction.hover",          // cursor entered or exited a 3D entity's hover zone
  // Interaction — UI feedback events (Sub-AC 2 additions)
  // Close the loop between operator input → system execution → UI acknowledgment.
  // Enabling full traceability of the command-dispatch cycle and notification flow.
  "interaction.command_executed",       // a GUI command was dispatched to the orchestrator
  "interaction.notification_received",  // the GUI received a system notification for the operator
  // Fixture — diegetic in-world interactive fixture state-change events (Sub-AC 16d)
  // Fixtures are interactive 3D affordances (panels, handles, buttons) that bridge
  // operator manipulation to system behaviour via the command-file ingestion pipeline.
  "fixture.panel_toggled",      // a diegetic control panel was opened or closed
  "fixture.handle_pulled",      // a physical handle (door, drawer, lever) was pulled
  "fixture.button_pressed",     // a diegetic button was pressed
  "fixture.state_changed",      // generic fixture state transition (extensibility hook)
  // Fixture — Sub-AC 4 additions: scene-level fixture lifecycle events
  "fixture.placed",             // a new fixture was instantiated and placed in the 3D scene
  "fixture.removed",            // a fixture was removed from the 3D scene
  "fixture.updated",            // a fixture's configuration or metadata was updated
  // Fixture — Sub-AC 4 state-sync chain: command.state_changed → fixture.state_sync
  // Emitted by the FixtureStateSyncReducer when a command.state_changed event is
  // processed; instructs the 3D scene to update the visual indicator state (colour,
  // icon, label) of one or more fixture panels to reflect the new command state.
  // This event is the downstream half of the command → fixture indicator-update chain.
  "fixture.state_sync",         // sync fixture indicator state from a command state change
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Runtime set for O(1) lookup */
export const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

export function isValidEventType(s: string): s is EventType {
  return EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export type ActorKind = "user" | "agent" | "system" | "channel";

export interface Actor {
  kind: ActorKind;
  id: string;
}

// ---------------------------------------------------------------------------
// ConitensEvent — §4.1 envelope
// ---------------------------------------------------------------------------

export interface ConitensEvent {
  schema: SchemaVersion;
  event_id: string;
  type: EventType;
  ts: string;                           // ISO 8601 + timezone

  run_id: string;
  task_id?: string;
  causation_id?: string;
  correlation_id?: string;

  actor: Actor;
  payload: Record<string, unknown>;

  // Redaction — §13
  redacted?: boolean;
  redacted_fields?: string[];

  // Deduplication — §14
  idempotency_key?: string;
  source_message_id?: string;

  // Approval TOCTOU — §9
  approval_subject_hash?: string;
}

// ---------------------------------------------------------------------------
// Agent spatial & lifecycle event payloads — 3D command-center extensions
// ---------------------------------------------------------------------------

/** agent.moved — an agent relocated to a different room/position */
export interface AgentMovedPayload {
  agent_id: string;
  from_room?: string;
  to_room: string;
  position?: { x: number; y: number; z: number };
}

/** agent.assigned — an agent assigned to a room or team */
export interface AgentAssignedPayload {
  agent_id: string;
  room_id: string;
  role?: string;
}

/** agent.status_changed — agent operational status transition */
export interface AgentStatusChangedPayload {
  agent_id: string;
  prev_status: string;
  status: string;
  reason?: string;
}

/** agent.task.started — agent began working on a task */
export interface AgentTaskStartedPayload {
  agent_id: string;
  task_id: string;
  task_title?: string;
}

/** agent.task.completed — agent finished a task */
export interface AgentTaskCompletedPayload {
  agent_id: string;
  task_id: string;
  outcome: "success" | "failure" | "cancelled";
  summary?: string;
}

/** Discriminated map from agent event type → typed payload */
export interface AgentEventPayloadMap {
  "agent.moved": AgentMovedPayload;
  "agent.assigned": AgentAssignedPayload;
  "agent.status_changed": AgentStatusChangedPayload;
  "agent.task.started": AgentTaskStartedPayload;
  "agent.task.completed": AgentTaskCompletedPayload;
}

// ---------------------------------------------------------------------------
// Obsolete alias map — §4.3
// ---------------------------------------------------------------------------

export const OBSOLETE_ALIASES: Readonly<Record<string, EventType>> = {
  "task.updated":       "task.status_changed",
  "message.new":        "message.received",
  "artifact.generated": "task.artifact_added",
  "approval.required":  "approval.requested",
  "memory.updated":     "memory.update_proposed",
};

export function resolveAlias(type: string): EventType | null {
  if (isValidEventType(type)) return type;
  return OBSOLETE_ALIASES[type] ?? null;
}
