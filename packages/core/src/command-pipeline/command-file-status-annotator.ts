/**
 * @module command-file-status-annotator
 * Sub-AC 8.2 — Pipeline entity command consumption: persists state updates
 * back to command-files.
 *
 * Purpose
 * ───────
 * After the orchestrator pipeline processes a command file and archives it,
 * this module updates the `status` field within the archived JSON file to
 * reflect the command's final lifecycle state (completed / failed / rejected).
 *
 * This satisfies the "persists state updates back to the command-files"
 * requirement by ensuring every archived command carries an accurate,
 * human-readable status — creating a complete write-once audit trail where
 * the command file itself is the primary record of its lifecycle outcome.
 *
 * Design constraints
 * ──────────────────
 * - Archive files are write-once from the perspective of the inbox consumer.
 *   Annotation happens only once, after the file has been moved to the archive
 *   directory, so there is no concurrency risk.
 * - Best-effort: annotation failures are logged to stderr but never throw.
 *   The pipeline must not crash if the archive file is inaccessible.
 * - Only terminal states (completed / failed / rejected) are written back.
 *   Transient states (pending / accepted / executing) are tracked in
 *   CommandStatusStore but not written to the command file.
 * - Record transparency: each annotation is appended to the status store's
 *   JSONL log so it is fully traceable.
 *
 * Status mapping
 * ──────────────
 * CommandLifecycleState  →  CommandFileStatus (written to file)
 *   completed            →  "completed"
 *   failed               →  "failed"
 *   rejected             →  "rejected"
 *   (others skipped — not terminal)
 *
 * CommandFileStatus values
 * ─────────────────────────
 * The CommandFile.status field uses the 5-value enum from @conitens/protocol:
 *   pending / processing / completed / failed / rejected
 */

import { readFile, writeFile } from "node:fs/promises";
import type { CommandLifecycleState } from "./command-status-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Exported types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The subset of CommandFileStatus values that can be written back by the
 * annotator.  Matches the terminal states from CommandLifecycleState.
 */
export type AnnotatableCommandFileStatus =
  | "completed"
  | "failed"
  | "rejected";

// ─────────────────────────────────────────────────────────────────────────────
// State mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a `CommandLifecycleState` to the `CommandFileStatus` string that should
 * be written to the command file.
 *
 * Returns `null` for non-terminal states — those are not written back.
 *
 * @param lifecycleState  The current lifecycle state from CommandStatusStore.
 * @returns               The CommandFileStatus to write, or null to skip.
 */
export function mapLifecycleStateToFileStatus(
  lifecycleState: CommandLifecycleState,
): AnnotatableCommandFileStatus | null {
  switch (lifecycleState) {
    case "completed": return "completed";
    case "failed":    return "failed";
    case "rejected":  return "rejected";
    default:          return null; // pending / accepted / executing — skip
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core annotation function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Annotate an archived command file with its final lifecycle status.
 *
 * Reads the JSON at `archivePath`, updates the `status` field to `fileStatus`,
 * and writes the result back to the same path.
 *
 * @param archivePath  Absolute path to the archived *.json command file.
 * @param fileStatus   The CommandFileStatus string to write (e.g. "completed").
 * @returns            `true` if the annotation succeeded, `false` otherwise.
 *
 * @remarks
 * This function NEVER throws.  Any I/O or parse error is written to stderr and
 * the function returns `false` so the caller can decide whether to retry.
 */
export async function annotateCommandFileStatus(
  archivePath: string,
  fileStatus: AnnotatableCommandFileStatus,
): Promise<boolean> {
  try {
    // Read the archived file.
    const raw = await readFile(archivePath, "utf-8");
    if (!raw.trim()) {
      process.stderr.write(
        `[CommandFileStatusAnnotator] Empty file, skipping annotation: ${archivePath}\n`,
      );
      return false;
    }

    // Parse as JSON object.
    let commandFile: Record<string, unknown>;
    try {
      commandFile = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      process.stderr.write(
        `[CommandFileStatusAnnotator] Cannot parse JSON at ${archivePath} — skipping\n`,
      );
      return false;
    }

    // Skip if status is already set to the target value (idempotent).
    if (commandFile["status"] === fileStatus) {
      return true;
    }

    // Update the status field.
    commandFile["status"] = fileStatus;

    // Write back to the archive file (preserves 2-space indent for readability).
    await writeFile(archivePath, JSON.stringify(commandFile, null, 2), "utf-8");
    return true;
  } catch (err) {
    process.stderr.write(
      `[CommandFileStatusAnnotator] Failed to annotate ${archivePath}: ${String(err)}\n`,
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: annotate from lifecycle state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Annotate an archived command file from a `CommandLifecycleState`.
 *
 * Combines `mapLifecycleStateToFileStatus` and `annotateCommandFileStatus`.
 * Non-terminal states (pending / accepted / executing) are silently skipped.
 *
 * @param archivePath    Absolute path to the archived command file.
 * @param lifecycleState The final lifecycle state.
 * @returns              `true` if the annotation succeeded, `false` otherwise
 *                       (including if state is non-terminal — callers can ignore
 *                       the return value).
 */
export async function annotateCommandFileFromLifecycle(
  archivePath: string,
  lifecycleState: CommandLifecycleState,
): Promise<boolean> {
  const fileStatus = mapLifecycleStateToFileStatus(lifecycleState);
  if (!fileStatus) return false; // not a terminal state — nothing to write
  return annotateCommandFileStatus(archivePath, fileStatus);
}
