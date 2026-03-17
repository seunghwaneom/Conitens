/**
 * @module ownership
 * RFC-1.0.1 §11 — Reducer ownership table.
 */
import type { EventType } from "./event.js";

export type ReducerName =
  | "TaskReducer" | "DecisionReducer" | "HandoffReducer"
  | "ApprovalReducer" | "StatusReducer" | "TimelineReducer"
  | "ContextReducer" | "MemoryReducer" | "MemoryCuratorReducer"
  | "SQLiteReducer";

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
    inputEvents: ["agent.spawned", "agent.heartbeat", "agent.error", "agent.terminated"],
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
