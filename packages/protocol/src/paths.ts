/**
 * @module paths
 * RFC-1.0.1 §2 — 5-Plane taxonomy + operational path classification.
 */

export const PLANES = ["control", "command", "event", "entity", "view"] as const;
export type Plane = (typeof PLANES)[number];
export type PathClass = Plane | "operational";

/**
 * Classify a .conitens/-relative path into its plane or operational zone.
 * @throws Error if path cannot be classified.
 */
export function classifyPath(p: string): PathClass {
  // Operational — outside 5-plane, not replay-relevant
  if (p.startsWith("runtime/locks/"))            return "operational";
  if (p.startsWith("runtime/pids/"))             return "operational";

  // Event — append-only, commit point
  if (p.startsWith("events/"))                   return "event";
  if (p.startsWith("traces/"))                   return "event";

  // Command — intent, deleted after processing
  if (p.startsWith("commands/"))                 return "command";
  if (p.startsWith("mailboxes/"))                return "command";

  // View — generated from events, read-only
  if (p.startsWith("views/"))                    return "view";
  if (p.startsWith("runtime/"))                  return "view";

  // Entity — business objects with per-file ownership
  if (p.startsWith("task-specs/"))               return "entity";
  if (p.startsWith("tasks/"))                    return "entity";
  if (p.startsWith("decisions/"))                return "entity";
  if (p.startsWith("handoffs/"))                 return "entity";
  if (/^agents\/[^/]+\/memory/.test(p))          return "entity";

  // Control — human-authored, rarely changed
  if (p.startsWith("agents/"))                   return "control";
  if (p.startsWith("policies/"))                 return "control";
  if (p.startsWith("config/"))                   return "control";
  if (p === "MODE.md")                           return "control";

  throw new Error(`Unclassified path: ${p}`);
}

// ---------------------------------------------------------------------------
// .notes/ path classification (ADR-0002)
// ---------------------------------------------------------------------------
// Separate from the 5-Plane taxonomy which classifies .conitens/-relative paths.
// Notes zones classify .notes/-relative paths for the Obsidian projection layer.

export const NOTES_ZONES = [
  "inbox", "agents", "workspaces", "runs",
  "comms", "decisions", "memory", "reviews",
  "archive", "index", "events",
] as const;
export type NotesZone = (typeof NOTES_ZONES)[number];

/**
 * Classify a .notes/-relative path into its zone.
 * @throws Error if path cannot be classified.
 */
export function classifyNotesPath(p: string): NotesZone {
  if (p.startsWith("00_Inbox/"))       return "inbox";
  if (p.startsWith("10_Agents/"))      return "agents";
  if (p.startsWith("20_Workspaces/"))  return "workspaces";
  if (p.startsWith("30_Runs/"))        return "runs";
  if (p.startsWith("40_Comms/"))       return "comms";
  if (p.startsWith("50_Decisions/"))   return "decisions";
  if (p.startsWith("60_Memory/"))      return "memory";
  if (p.startsWith("70_Reviews/"))     return "reviews";
  if (p.startsWith("80_Archive/"))     return "archive";
  if (p.startsWith(".index/"))         return "index";
  if (p.startsWith("EVENTS/"))         return "events";
  throw new Error(`Unclassified .notes/ path: ${p}`);
}

/** Check if a .notes/ zone is a projection target (written by reducers). */
export function isProjectionZone(zone: NotesZone): boolean {
  return zone === "agents" || zone === "comms"
      || zone === "reviews" || zone === "runs"
      || zone === "inbox";
}

// ---------------------------------------------------------------------------
// Well-known paths
// ---------------------------------------------------------------------------

export const PATHS = {
  MODE: "MODE.md",
  EVENTS_DIR: "events/",
  TRACES_DIR: "traces/",
  TASK_SPECS_DIR: "task-specs/",
  TASKS_DIR: "tasks/",
  DECISIONS_DIR: "decisions/",
  HANDOFFS_DIR: "handoffs/",
  MAILBOXES_DIR: "mailboxes/",
  COMMANDS_DIR: "commands/",
  VIEWS_DIR: "views/",
  VIEWS_TASKS: "views/TASKS.md",
  VIEWS_DECISIONS: "views/DECISIONS.md",
  VIEWS_STATUS: "views/STATUS.md",
  VIEWS_CONTEXT: "views/CONTEXT.md",
  VIEWS_TIMELINE: "views/TIMELINE.md",
  VIEWS_APPROVALS: "views/APPROVALS.md",
  VIEWS_SCHEMA: "views/SCHEMA.md",
  VIEWS_LAYOUT: "views/LAYOUT.md",
  VIEWS_MEETINGS: "views/MEETINGS.md",
  VIEWS_COMMANDS: "views/COMMANDS.md",
  VIEWS_PIPELINES: "views/PIPELINES.md",
  VIEWS_INTERACTIONS: "views/INTERACTIONS.md",
  VIEWS_FIXTURES: "views/FIXTURES.md",
  RUNTIME_DIR: "runtime/",
  RUNTIME_SCHEMA: "runtime/schema/",
  RUNTIME_LAYOUT: "runtime/layout/",
  RUNTIME_COMMANDS: "runtime/commands/",
  RUNTIME_PIPELINES: "runtime/pipelines/",
  RUNTIME_INTERACTIONS: "runtime/interactions/",
  RUNTIME_FIXTURES: "runtime/fixtures/",
  RUNTIME_SQLITE: "runtime/state.sqlite",
  RUNTIME_HEARTBEAT: "runtime/heartbeat-cache/",
  RUNTIME_LOCKS: "runtime/locks/",
  RUNTIME_PIDS: "runtime/pids/",
  AGENTS_DIR: "agents/",
  POLICIES_DIR: "policies/",
  CONFIG_DIR: "config/",
  // .notes/ Obsidian Vault directories (ADR-0002)
  NOTES_INBOX: ".notes/00_Inbox/",
  NOTES_AGENTS: ".notes/10_Agents/",
  NOTES_WORKSPACES: ".notes/20_Workspaces/",
  NOTES_RUNS: ".notes/30_Runs/",
  NOTES_COMMS: ".notes/40_Comms/",
  NOTES_DECISIONS: ".notes/50_Decisions/",
  NOTES_MEMORY: ".notes/60_Memory/",
  NOTES_REVIEWS: ".notes/70_Reviews/",
  NOTES_ARCHIVE: ".notes/80_Archive/",
  NOTES_INDEX: ".notes/.index/",
} as const;

/** Check if a path is replay-relevant (not operational). */
export function isReplayRelevant(p: string): boolean {
  return classifyPath(p) !== "operational";
}
