/**
 * @module task-state
 * RFC-1.0.1 §5 — Task state machine and transition rules.
 */

export const TASK_STATES = [
  "draft", "planned", "assigned", "active",
  "blocked", "review", "done", "failed", "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set(["done", "cancelled"]);

export const VALID_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  draft:     ["planned", "cancelled"],
  planned:   ["assigned", "cancelled"],
  assigned:  ["active", "cancelled"],
  active:    ["blocked", "review", "failed", "cancelled"],
  blocked:   ["active", "failed", "cancelled"],
  review:    ["done", "active", "failed"],
  done:      [],
  failed:    ["assigned"],
  cancelled: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

// ---------------------------------------------------------------------------
// Handoff state machine — §7
// ---------------------------------------------------------------------------

export const HANDOFF_STATES = [
  "requested", "accepted", "rejected", "completed",
] as const;

export type HandoffState = (typeof HANDOFF_STATES)[number];

export const VALID_HANDOFF_TRANSITIONS: Readonly<Record<HandoffState, readonly HandoffState[]>> = {
  requested: ["accepted", "rejected"],
  accepted:  ["completed"],
  rejected:  [],
  completed: [],
};

export function canHandoffTransition(from: HandoffState, to: HandoffState): boolean {
  return VALID_HANDOFF_TRANSITIONS[from].includes(to);
}
