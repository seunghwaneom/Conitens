/** Shared helpers — single source of truth for presentation logic. */

/** Extract the event "family" prefix (e.g. "task" from "task.created"). */
export function getEventFamily(type: string): string {
  return type.split(".")[0] ?? "system";
}

/** Map a task/agent state string to a semantic tone class. */
export function getTaskTone(state: string): string {
  switch (state) {
    case "running":
    case "active":
    case "done":
      return "success";
    case "review":
      return "info";
    case "error":
    case "blocked":
    case "failed":
      return "danger";
    case "assigned":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Canonical task transition table — the single source of truth is
 * @conitens/protocol (task-state.ts, RFC-1.0.1 §5). Re-exported so the
 * dashboard's client-side validation cannot drift from the protocol machine.
 */
export { VALID_TRANSITIONS } from "@conitens/protocol";

import { VALID_TRANSITIONS as PROTOCOL_VALID_TRANSITIONS } from "@conitens/protocol";

/**
 * Validate a transition before emitting a drag event. Drag source/target come
 * from untrusted UI state and may be any string, so — unlike the protocol's
 * canTransition — this tolerates unknown states and returns false rather than
 * throwing.
 */
export function isValidTransition(from: string, to: string): boolean {
  return (PROTOCOL_VALID_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
}
