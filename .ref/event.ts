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
  // Agent
  "agent.spawned", "agent.heartbeat", "agent.error", "agent.terminated",
  // Message
  "message.received", "message.sent", "message.internal",
  // Memory
  "memory.recalled",
  "memory.update_proposed", "memory.update_approved", "memory.update_rejected",
  // Mode
  "mode.switch_requested", "mode.switch_completed",
  // System
  "system.started", "system.shutdown", "system.reconciliation",
  // Command
  "command.rejected",
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
