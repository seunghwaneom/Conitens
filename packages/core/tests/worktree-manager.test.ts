import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WorktreeManager } from "../src/worktree/worktree-manager.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("WorktreeManager", () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    // Create a temporary git repo with an initial commit
    tempDir = await mkdtemp(join(tmpdir(), "conitens-wt-test-"));
    await git(tempDir, "init", "-b", "main");
    await git(tempDir, "config", "user.email", "test@test.com");
    await git(tempDir, "config", "user.name", "Test");
    await writeFile(join(tempDir, "README.md"), "# Test\n");
    await git(tempDir, "add", ".");
    await git(tempDir, "commit", "-m", "initial commit");

    manager = new WorktreeManager(tempDir);
  });

  afterEach(async () => {
    // Clean up all worktrees before removing temp dir
    try {
      const worktrees = await manager.listWorktrees();
      for (const wt of worktrees) {
        await manager.cleanupWorktree(wt.agentId);
      }
    } catch {
      // Best effort cleanup
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("createWorktree creates branch and worktree directory", async () => {
    const info = await manager.createWorktree("claude", "task-0001");

    expect(info.agentId).toBe("claude");
    expect(info.taskId).toBe("task-0001");
    expect(info.branch).toBe("conitens/claude/task-0001");
    expect(info.path).toContain("claude");

    // Verify branch exists
    const branches = await git(tempDir, "branch", "--list", "conitens/claude/*");
    expect(branches).toContain("conitens/claude/task-0001");
  });

  it("createWorktree throws if worktree already exists", async () => {
    await manager.createWorktree("codex", "task-0002");

    await expect(
      manager.createWorktree("codex", "task-0003"),
    ).rejects.toThrow("already exists");
  });

  it("listWorktrees returns created worktrees", async () => {
    await manager.createWorktree("claude", "task-0010");

    const worktrees = await manager.listWorktrees();
    expect(worktrees.length).toBe(1);
    expect(worktrees[0].agentId).toBe("claude");
    expect(worktrees[0].taskId).toBe("task-0010");
    expect(worktrees[0].branch).toBe("conitens/claude/task-0010");
  });

  it("cleanupWorktree removes worktree and branch", async () => {
    await manager.createWorktree("gemini", "task-0020");

    const before = await manager.listWorktrees();
    expect(before.length).toBe(1);

    await manager.cleanupWorktree("gemini");

    const after = await manager.listWorktrees();
    expect(after.length).toBe(0);

    // Verify branch is deleted
    const branches = await git(tempDir, "branch", "--list", "conitens/gemini/*");
    expect(branches).toBe("");
  });

  it("cleanupWorktree with deleteBranch=false preserves branch", async () => {
    await manager.createWorktree("claude", "task-0030");
    await manager.cleanupWorktree("claude", false);

    // Worktree gone but branch preserved
    const worktrees = await manager.listWorktrees();
    expect(worktrees.length).toBe(0);

    const branches = await git(tempDir, "branch", "--list", "conitens/claude/*");
    expect(branches).toContain("conitens/claude/task-0030");
  });

  it("mergeWorktree performs --no-ff merge", async () => {
    // Create worktree and make a commit in it
    const info = await manager.createWorktree("claude", "task-merge");

    await writeFile(join(info.path, "agent-output.txt"), "work done\n");
    await git(info.path, "add", ".");
    await git(info.path, "commit", "-m", "agent work");

    // Merge back
    const result = await manager.mergeWorktree("claude");
    expect(result.merged).toBe(true);
    expect(result.branch).toBe("conitens/claude/task-merge");

    // Verify merge commit exists in main
    const log = await git(tempDir, "log", "--oneline", "-3");
    expect(log).toContain("merge:");
  });

  it("mergeWorktree throws for unknown agent", async () => {
    await expect(
      manager.mergeWorktree("nonexistent"),
    ).rejects.toThrow("No worktree found");
  });
});
