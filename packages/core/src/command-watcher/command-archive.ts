/**
 * @module command-archive
 * Sub-AC 8c — Archive utility for processed command files.
 *
 * After ingestion, command files are moved to an archive sub-directory
 * instead of being deleted, preserving a write-once audit trail that
 * satisfies the "record transparency" design principle without polluting
 * the active command inbox.
 *
 * Archive path format:
 *   <commandsDir>/archive/<YYYY-MM-DD>T<HH-MM-SS-mmm>_<original-filename>
 *
 * The archive directory is created on first use (idempotent).
 */

import { mkdir, rename, unlink, stat } from "node:fs/promises";
import { join, basename } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Archive sub-directory name (relative to the commands inbox dir)
// ─────────────────────────────────────────────────────────────────────────────

export const ARCHIVE_SUBDIR = "archive";

// ─────────────────────────────────────────────────────────────────────────────
// Core archive function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move a processed command file into the archive sub-directory.
 *
 * @param commandPath  Absolute path to the command file to archive.
 * @param commandsDir  Absolute path to the commands inbox directory
 *                     (the archive sub-dir is created inside it).
 * @returns            Absolute path of the archived file.
 *
 * @throws             Only if the source file is unreadable for a reason
 *                     other than ENOENT (already deleted is silently ignored).
 */
export async function archiveCommandFile(
  commandPath: string,
  commandsDir: string,
): Promise<string> {
  const archiveDir = join(commandsDir, ARCHIVE_SUBDIR);
  await mkdir(archiveDir, { recursive: true });

  // Build a sortable, collision-resistant archive filename.
  // Format: 2026-03-24T12-00-00-123_gui_cmd_01ARZ.json
  const now = new Date();
  const ts = buildArchiveTimestamp(now);
  const archivedName = `${ts}_${basename(commandPath)}`;
  const archivePath = join(archiveDir, archivedName);

  try {
    await rename(commandPath, archivePath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      // Source file already gone — nothing to archive.
      return archivePath;
    }
    if (e.code === "EXDEV") {
      // Cross-device move (rare on Windows): fall back to copy + delete.
      await copyAndDelete(commandPath, archivePath);
      return archivePath;
    }
    throw err;
  }

  return archivePath;
}

/**
 * Best-effort archive — never throws. Logs errors to stderr.
 * Used in error paths where we do not want a secondary failure.
 */
export async function safeArchiveCommandFile(
  commandPath: string,
  commandsDir: string,
): Promise<string | null> {
  try {
    return await archiveCommandFile(commandPath, commandsDir);
  } catch (err) {
    process.stderr.write(
      `[CommandArchive] Failed to archive ${commandPath}: ${String(err)}\n`,
    );
    // Fall back to deletion so the file does not block the inbox.
    await safeDeleteCommandFile(commandPath);
    return null;
  }
}

/**
 * Best-effort delete — never throws.
 */
export async function safeDeleteCommandFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Already deleted or locked — ignore.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a filesystem-safe ISO-8601-like timestamp string.
 * Colons are replaced with hyphens so it is valid on all platforms.
 * Example: "2026-03-24T12-00-00-123"
 */
export function buildArchiveTimestamp(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}-${pad2(d.getUTCMinutes())}-${pad2(d.getUTCSeconds())}-${pad3(d.getUTCMilliseconds())}`
  );
}

/**
 * Copy source → dest, then delete source.
 * Used only for EXDEV (cross-device rename).
 */
async function copyAndDelete(src: string, dest: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const content = await readFile(src);
  await writeFile(dest, content);
  await safeDeleteCommandFile(src);
}
