/**
 * @module ownership
 * RFC-1.0.1 §11 — Reducer ownership table.
 */
import type { EventType } from "./event.js";

export type ReducerName =
  | "TaskReducer" | "DecisionReducer" | "HandoffReducer"
  | "ApprovalReducer" | "StatusReducer" | "TimelineReducer"
  | "ContextReducer" | "MemoryReducer" | "MemoryCuratorReducer"
  | "SQLiteReducer"
  | "LayoutReducer" | "MeetingReducer"
  | "CommandReducer" | "PipelineReducer"
  | "SchemaReducer"
  | "InteractionReducer"
  | "FixtureReducer";

export interface ReducerDescriptor {
  name: ReducerName;
  ownedFiles: string[];
  inputEvents: EventType[] | "*";
  readsFrom: string[];
}

export const REDUCERS: readonly ReducerDescriptor[] = [
  {
    name: "TaskReducer",
    ownedFiles: ["tasks/*.md", "views/TASKS.md"],
    inputEvents: [
      "task.created", "task.assigned", "task.status_changed",
      "task.spec_updated", "task.artifact_added",
      "task.completed", "task.failed", "task.cancelled",
    ],
    readsFrom: ["task-specs/*.md"],
  },
  {
    name: "DecisionReducer",
    ownedFiles: ["decisions/*.md", "views/DECISIONS.md"],
    inputEvents: ["decision.proposed", "decision.accepted", "decision.rejected"],
    readsFrom: [],
  },
  {
    name: "HandoffReducer",
    ownedFiles: ["handoffs/*.md"],
    inputEvents: [
      "handoff.requested", "handoff.accepted",
      "handoff.rejected", "handoff.completed",
    ],
    readsFrom: ["tasks/*.md"],
  },
  {
    name: "ApprovalReducer",
    ownedFiles: ["views/APPROVALS.md"],
    inputEvents: ["approval.requested", "approval.granted", "approval.denied"],
    readsFrom: [],
  },
  {
    name: "StatusReducer",
    ownedFiles: ["views/STATUS.md"],
    inputEvents: [
      "agent.spawned", "agent.heartbeat", "agent.error", "agent.terminated",
      "agent.migrated", "agent.lifecycle.changed",
      "agent.idle", "agent.health_changed",
      "agent.capability_changed", "agent.persona_updated",
      "agent.moved", "agent.assigned",
      "agent.status_changed", "agent.task.started", "agent.task.completed",
      "agent.spawn_requested", "agent.paused", "agent.resumed",
      "agent.suspended", "agent.retire_requested", "agent.retired",
      "agent.migration_requested",
    ],
    readsFrom: [],
  },
  {
    name: "TimelineReducer",
    ownedFiles: ["views/TIMELINE.md"],
    inputEvents: "*",
    readsFrom: [],
  },
  {
    name: "ContextReducer",
    ownedFiles: ["views/CONTEXT.md"],
    inputEvents: ["task.completed", "decision.accepted", "mode.switch_requested", "mode.switch_completed"],
    readsFrom: ["task-specs/*.md", "decisions/*.md"],
  },
  {
    name: "MemoryReducer",
    ownedFiles: ["agents/*/memory.proposed.md"],
    inputEvents: ["decision.accepted", "task.completed", "message.received", "message.sent", "message.internal"],
    readsFrom: [],
  },
  {
    name: "MemoryCuratorReducer",
    ownedFiles: ["agents/*/memory.md"],
    inputEvents: ["memory.update_approved"],
    readsFrom: ["agents/*/memory.proposed.md"],
  },
  {
    name: "SQLiteReducer",
    ownedFiles: ["runtime/state.sqlite"],
    inputEvents: "*",
    readsFrom: [],
  },
  {
    name: "LayoutReducer",
    ownedFiles: ["views/LAYOUT.md", "runtime/layout/*.json"],
    inputEvents: [
      // Spatial bootstrapping — seeds the full initial scene on cold-start
      "layout.init",
      "layout.created", "layout.update", "layout.updated", "layout.deleted",
      "layout.node.moved",
      "layout.changed", "layout.reset", "layout.saved", "layout.loaded",
    ],
    readsFrom: [],
  },
  {
    name: "MeetingReducer",
    ownedFiles: ["views/MEETINGS.md"],
    inputEvents: [
      "meeting.scheduled",
      "meeting.started", "meeting.ended",
      "meeting.participant.joined", "meeting.participant.left",
      "meeting.deliberation", "meeting.resolved",
      "meeting.task.spawned", "meeting.cancelled", "meeting.rescheduled",
    ],
    readsFrom: [],
  },
  {
    name: "CommandReducer",
    // Maintains a rolling audit log of all issued/completed/failed/rejected commands.
    ownedFiles: ["views/COMMANDS.md", "runtime/commands/*.json"],
    inputEvents: [
      "command.issued", "command.acknowledged",
      "command.completed", "command.failed", "command.rejected",
      "command.dispatched", "command.queued", "command.retried",
      "command.timeout", "command.cancelled", "command.escalated",
      "command.state_changed",
    ],
    readsFrom: [],
  },
  {
    name: "PipelineReducer",
    // Maintains a rolling execution history for all pipeline runs.
    // Sub-AC 16c: stage lifecycle (stage_started, stage_completed, stage_failed)
    // and task routing (task_routed) are now first-class events tracked here.
    ownedFiles: ["views/PIPELINES.md", "runtime/pipelines/*.json"],
    inputEvents: [
      "pipeline.started", "pipeline.step",
      // Stage lifecycle events (Sub-AC 16c)
      "pipeline.stage_started", "pipeline.stage_completed", "pipeline.stage_failed",
      // Task routing events (Sub-AC 16c)
      "pipeline.task_routed",
      "pipeline.completed", "pipeline.failed", "pipeline.cancelled",
    ],
    readsFrom: [],
  },
  {
    name: "SchemaReducer",
    // Maintains the schema registry view and per-entry JSON snapshots.
    // Satisfies the reflexive-closure requirement: the ontology is
    // representable within itself (RFC-1.0.1 Sub-AC 4).
    // Sub-AC 16c: validation_started and migration_started are tracked here to
    // provide symmetric start/complete boundaries for validation and migration runs.
    ownedFiles: ["views/SCHEMA.md", "runtime/schema/*.json"],
    inputEvents: [
      "schema.registered", "schema.updated", "schema.deprecated",
      "schema.removed",
      // Validation lifecycle (Sub-AC 16c)
      "schema.validation_started", "schema.validated",
      // Migration lifecycle (Sub-AC 16c)
      "schema.migration_started", "schema.migrated",
    ],
    readsFrom: [],
  },
  {
    name: "InteractionReducer",
    // Records all 3D GUI operator interactions — input, selection, replay,
    // viewport changes, and direct 3D in-world pointer events (click, drag,
    // hover) — for audit, session replay, and self-improvement analysis.
    // Sub-AC 16d: click, drag, and hover events are now tracked here alongside
    // the higher-level input/selection/replay/viewport events.
    // Telemetry derived from these events is stored separately from the primary
    // EventLog per the telemetry isolation constraint (RFC-1.0.1 §4 Sub-AC 4).
    ownedFiles: ["views/INTERACTIONS.md", "runtime/interactions/*.json"],
    inputEvents: [
      // High-level GUI input events (RFC-1.0.1 §4 Sub-AC 4)
      "interaction.user_input",
      "interaction.selection_changed",
      "interaction.replay_triggered",
      "interaction.viewport_changed",
      // Low-level 3D in-world pointer / gesture events (Sub-AC 16d)
      "interaction.click",
      "interaction.drag",
      "interaction.hover",
      "interaction.selected", "interaction.hovered",
      "interaction.dismissed",
      "interaction.command_executed",
      "interaction.notification_received",
    ],
    readsFrom: [],
  },
  {
    name: "FixtureReducer",
    // Records all diegetic in-world fixture state changes — panel toggles,
    // handle pulls, button presses, and generic state transitions — for audit,
    // session replay, and command traceability analysis.
    // Sub-AC 16d: fixtures are the primary bridge between operator 3D-world
    // manipulation and system commands (CommandFile ingestion pipeline).
    // The FixtureReducer maintains:
    //   - views/FIXTURES.md: human-readable fixture state audit log
    //   - runtime/fixtures/*.json: per-fixture state snapshots for replay
    // Telemetry derived from fixture events (activation heatmaps, dwell times,
    // command-conversion rates) is stored separately per the telemetry isolation
    // constraint.
    ownedFiles: ["views/FIXTURES.md", "runtime/fixtures/*.json"],
    inputEvents: [
      // Operational state-change events (diegetic interactions)
      "fixture.panel_toggled",
      "fixture.handle_pulled",
      "fixture.button_pressed",
      "fixture.state_changed",
      // Scene-level fixture lifecycle events (Sub-AC 1 / Sub-AC 4)
      "fixture.placed",
      "fixture.removed",
      "fixture.updated",
      // NOTE: fixture.state_sync is emitted BY FixtureStateSyncReducer, not
      // consumed by FixtureReducer — listed here for audit completeness only.
      // FixtureStateSyncReducer must NOT subscribe to this event (infinite loop risk).
      "fixture.state_sync",
    ],
    readsFrom: [],
  },
];

/**
 * Find the owner (reducer or "human") of a .conitens/-relative path.
 */
export function findOwner(path: string): ReducerName | "human" | null {
  // Human-owned paths
  if (path.startsWith("task-specs/")) return "human";

  for (const r of REDUCERS) {
    for (const pattern of r.ownedFiles) {
      if (matchPattern(pattern, path)) return r.name;
    }
  }
  return null;
}

function matchPattern(pattern: string, path: string): boolean {
  // Convert glob pattern to regex
  // "tasks/*.md" matches "tasks/task-0001.md"
  // "agents/*/memory.proposed.md" matches "agents/claude/memory.proposed.md"
  // "views/TASKS.md" matches exactly "views/TASKS.md"
  const regexStr = "^" + pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]+")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*")
    + "$";
  return new RegExp(regexStr).test(path);
}
