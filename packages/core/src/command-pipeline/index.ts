/**
 * @module command-pipeline
 * Sub-AC 8b — Orchestrator pipeline reader with lifecycle state tracking.
 *
 * Public surface:
 *   CommandPipelineReader        — main pipeline reader class
 *   CommandPipelineReaderOptions — constructor config
 *   CommandStatusChangedEvent    — emitted on every lifecycle state transition
 *   CommandStatusStore           — companion status store
 *   CommandLifecycleState        — union of all valid lifecycle states
 *   CommandStatusRecord          — per-transition status record
 *   canCommandTransition         — state machine predicate
 *   TERMINAL_COMMAND_STATES      — set of terminal states
 *   VALID_COMMAND_TRANSITIONS    — full transition table
 */

export {
  CommandPipelineReader,
  type CommandPipelineReaderOptions,
  type CommandStatusChangedEvent,
} from "./command-pipeline-reader.js";

export {
  CommandStatusStore,
  canCommandTransition,
  TERMINAL_COMMAND_STATES,
  VALID_COMMAND_TRANSITIONS,
  type CommandLifecycleState,
  type CommandStatusRecord,
} from "./command-status-store.js";

export {
  annotateCommandFileStatus,
  annotateCommandFileFromLifecycle,
  mapLifecycleStateToFileStatus,
  type AnnotatableCommandFileStatus,
} from "./command-file-status-annotator.js";
