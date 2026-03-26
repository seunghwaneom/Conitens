/**
 * Tests for command-archive.ts
 *
 * Sub-AC 8c: Validates that processed command files are correctly moved to
 * the archive directory with properly-formatted timestamped filenames.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import {
  archiveCommandFile,
  safeArchiveCommandFile,
  buildArchiveTimestamp,
  ARCHIVE_SUBDIR,
} from "../command-archive.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let commandsDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "conitens-archive-test-"));
  commandsDir = join(tmpDir, "commands");
  await mkdir(commandsDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildArchiveTimestamp
// ─────────────────────────────────────────────────────────────────────────────

describe("buildArchiveTimestamp", () => {
  it("produces a filesystem-safe timestamp string", () => {
    const d = new Date("2026-03-24T12:34:56.789Z");
    const ts = buildArchiveTimestamp(d);
    expect(ts).toBe("2026-03-24T12-34-56-789");
  });

  it("pads single-digit values with leading zeros", () => {
    const d = new Date("2026-01-05T01:02:03.004Z");
    const ts = buildArchiveTimestamp(d);
    expect(ts).toBe("2026-01-05T01-02-03-004");
  });

  it("does not contain colon characters (Windows-safe)", () => {
    const ts = buildArchiveTimestamp(new Date());
    expect(ts).not.toContain(":");
  });

  it("matches expected format pattern", () => {
    const ts = buildArchiveTimestamp(new Date());
    // 2026-03-24T12-34-56-789 → 23 chars
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// archiveCommandFile
// ─────────────────────────────────────────────────────────────────────────────

describe("archiveCommandFile", () => {
  it("moves the file to the archive subdir", async () => {
    const cmdFile = join(commandsDir, "gui_cmd_001.json");
    await writeFile(cmdFile, '{"type":"test"}', "utf-8");

    const archivePath = await archiveCommandFile(cmdFile, commandsDir);

    // Source file should be gone.
    await expect(access(cmdFile)).rejects.toThrow();

    // Archive file should exist.
    await expect(access(archivePath)).resolves.toBeUndefined();
  });

  it("creates the archive subdirectory if it doesn't exist", async () => {
    const cmdFile = join(commandsDir, "gui_cmd_002.json");
    await writeFile(cmdFile, '{"type":"test"}', "utf-8");

    await archiveCommandFile(cmdFile, commandsDir);

    // Archive subdir should now exist.
    const archiveDir = join(commandsDir, ARCHIVE_SUBDIR);
    await expect(access(archiveDir)).resolves.toBeUndefined();
  });

  it("returns the archive path", async () => {
    const cmdFile = join(commandsDir, "gui_cmd_003.json");
    await writeFile(cmdFile, '{"type":"test"}', "utf-8");

    const archivePath = await archiveCommandFile(cmdFile, commandsDir);

    expect(archivePath).toContain(ARCHIVE_SUBDIR);
    expect(archivePath).toContain("gui_cmd_003.json");
  });

  it("prefixes the archived filename with a timestamp", async () => {
    const cmdFile = join(commandsDir, "gui_cmd_004.json");
    await writeFile(cmdFile, '{"type":"test"}', "utf-8");

    const archivePath = await archiveCommandFile(cmdFile, commandsDir);
    const archivedName = archivePath.split(/[/\\]/).at(-1)!;

    // Should start with timestamp pattern: YYYY-MM-DDTHH-MM-SS-mmm_
    expect(archivedName).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}_/);
  });

  it("preserves original filename suffix in archive name", async () => {
    const cmdFile = join(commandsDir, "my_special_command.json");
    await writeFile(cmdFile, '{"type":"test"}', "utf-8");

    const archivePath = await archiveCommandFile(cmdFile, commandsDir);
    expect(archivePath).toContain("my_special_command.json");
  });

  it("silently succeeds if source file is already gone (ENOENT)", async () => {
    const cmdFile = join(commandsDir, "already_gone.json");
    // Do NOT create the file — simulate already-archived case.

    // Should not throw.
    await expect(archiveCommandFile(cmdFile, commandsDir)).resolves.not.toThrow();
  });

  it("multiple files get unique archive names (timestamp ms resolution)", async () => {
    const file1 = join(commandsDir, "cmd_a.json");
    const file2 = join(commandsDir, "cmd_b.json");
    await writeFile(file1, '{"id":"a"}', "utf-8");
    await writeFile(file2, '{"id":"b"}', "utf-8");

    const a = await archiveCommandFile(file1, commandsDir);
    const b = await archiveCommandFile(file2, commandsDir);

    // Both should exist and be different paths.
    expect(a).not.toBe(b);
    await expect(access(a)).resolves.toBeUndefined();
    await expect(access(b)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeArchiveCommandFile
// ─────────────────────────────────────────────────────────────────────────────

describe("safeArchiveCommandFile", () => {
  it("returns archive path on success", async () => {
    const cmdFile = join(commandsDir, "safe_cmd.json");
    await writeFile(cmdFile, '{"type":"ok"}', "utf-8");

    const result = await safeArchiveCommandFile(cmdFile, commandsDir);
    expect(result).not.toBeNull();
    expect(result).toContain("safe_cmd.json");
  });

  it("returns null if archiving fails (non-existent dir path)", async () => {
    // Pass a commandsDir that is a file, not a directory, to force failure.
    const fakeDir = join(tmpDir, "not-a-dir.txt");
    await writeFile(fakeDir, "notadir", "utf-8");

    const cmdFile = join(commandsDir, "cmd_fail.json");
    await writeFile(cmdFile, '{"type":"ok"}', "utf-8");

    // This will fail because fakeDir is a file, can't create archive subdir inside it.
    const result = await safeArchiveCommandFile(cmdFile, fakeDir);
    expect(result).toBeNull();
  });

  it("does not throw on failure", async () => {
    await expect(
      safeArchiveCommandFile("/nonexistent/path/cmd.json", "/also/invalid"),
    ).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE_SUBDIR constant
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCHIVE_SUBDIR", () => {
  it("is 'archive'", () => {
    expect(ARCHIVE_SUBDIR).toBe("archive");
  });
});
