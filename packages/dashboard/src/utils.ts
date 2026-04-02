/** Shared helpers — single source of truth for presentation logic. */

/** Convert an ISO timestamp to a human-readable relative time string. */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

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
 * Minimal valid-transition map mirroring the protocol's VALID_TRANSITIONS.
 * Used for client-side validation before emitting drag events.
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["planned", "cancelled"],
  planned: ["assigned", "cancelled"],
  assigned: ["active", "cancelled"],
  active: ["blocked", "review", "cancelled"],
  blocked: ["active", "cancelled"],
  review: ["active", "done", "failed"],
  done: [],
  failed: ["assigned", "cancelled"],
  cancelled: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
