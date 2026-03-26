/**
 * @module command-watcher
 * Sub-AC 8c — File-watcher and ingestion handler for the commands inbox.
 *
 * Public surface:
 *   CommandWatcher          — main watcher class
 *   CommandWatcherOptions   — constructor config
 *   CommandProcessedEvent   — emitted on success
 *   CommandFailedEvent      — emitted on failure
 *   validateCommandFile     — schema validation utility
 *   CommandValidationResult — result type
 *   CommandValidationError  — error descriptor
 *   routeCommandFile        — pipeline stage router
 *   isOrchestratorCommand   — predicate helper
 *   isNavigationCommand     — predicate helper
 *   archiveCommandFile      — archive utility
 *   safeArchiveCommandFile  — best-effort archive
 *   buildArchiveTimestamp   — timestamp formatter
 *   ARCHIVE_SUBDIR          — "archive" constant
 */

export {
  CommandWatcher,
  type CommandWatcherOptions,
  type CommandProcessedEvent,
  type CommandFailedEvent,
} from "./command-watcher.js";

export {
  validateCommandFile,
  validatePayload,
  type CommandValidationResult,
  type CommandValidationError,
  type ValidationErrorCode,
} from "./command-validator.js";

export {
  routeCommandFile,
  makeRejectedRoute,
  isOrchestratorCommand,
  isNavigationCommand,
  type CommandPipelineStage,
  type OrchestratorRoutedCommand,
  type RejectedRoutedCommand,
  type RoutedCommand,
} from "./command-router.js";

export {
  archiveCommandFile,
  safeArchiveCommandFile,
  safeDeleteCommandFile,
  buildArchiveTimestamp,
  ARCHIVE_SUBDIR,
} from "./command-archive.js";
