/**
 * @module worktree
 * Git worktree manager for isolated agent workspaces.
 *
 * Each agent gets its own git worktree so multiple agents can work
 * on different tasks simultaneously without file conflicts.
 * Worktrees are stored in .conitens-worktrees/{agentId}/ relative to the repo root.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { rm, access } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  agentId: string;
  taskId: string;
  branch: string;
  path: string;
}

export class WorktreeManager {
  /** Root directory of the git repository */
  private readonly repoRoot: string;
  /** Base directory for worktrees */
  private readonly worktreeBase: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.worktreeBase = join(repoRoot, ".conitens-worktrees");
  }

  /**
   * Create a new worktree for an agent working on a task.
   *
   * Creates branch: conitens/{agentId}/{taskId}
   * Worktree path: .conitens-worktrees/{agentId}/
   */
  async createWorktree(agentId: string, taskId: string): Promise<WorktreeInfo> {
    const branch = `conitens/${agentId}/${taskId}`;
    const worktreePath = join(this.worktreeBase, agentId);

    // Check if worktree already exists
    const exists = await access(worktreePath).then(() => true, () => false);
    if (exists) {
      throw new Error(
        `Worktree already exists for agent "${agentId}" at ${worktreePath}. ` +
        `Clean up with cleanupWorktree("${agentId}") first.`
      );
    }

    // Create a new branch from HEAD and add worktree
    await execFileAsync("git", [
      "worktree", "add",
      "-b", branch,     // create new branch
      worktreePath,      // worktree path
    ], { cwd: this.repoRoot });

    return { agentId, taskId, branch, path: worktreePath };
  }

  /**
   * Merge an agent's worktree branch back into the current branch.
   * Uses --no-ff to preserve merge history.
   */
  async mergeWorktree(agentId: string): Promise<{ merged: boolean; branch: string }> {
    // Find the branch for this agent's worktree
    const worktrees = await this.listWorktrees();
    const worktree = worktrees.find(w => w.agentId === agentId);

    if (!worktree) {
      throw new Error(`No worktree found for agent "${agentId}"`);
    }

    // Merge with --no-ff from the main repo
    await execFileAsync("git", [
      "merge", "--no-ff",
      "-m", `merge: ${worktree.branch} (agent: ${agentId})`,
      worktree.branch,
    ], { cwd: this.repoRoot });

    return { merged: true, branch: worktree.branch };
  }

  /**
   * Remove a worktree and optionally delete its branch.
   */
  async cleanupWorktree(agentId: string, deleteBranch = true): Promise<void> {
    const worktreePath = join(this.worktreeBase, agentId);

    // Remove the worktree via git
    try {
      await execFileAsync("git", [
        "worktree", "remove", "--force", worktreePath,
      ], { cwd: this.repoRoot });
    } catch {
      // If git worktree remove fails, try manual cleanup
      await rm(worktreePath, { recursive: true, force: true });
      // Prune stale worktree references
      await execFileAsync("git", ["worktree", "prune"], { cwd: this.repoRoot });
    }

    // Optionally delete the branch
    if (deleteBranch) {
      try {
        const { stdout } = await execFileAsync("git", [
          "branch", "--list", `conitens/${agentId}/*`,
        ], { cwd: this.repoRoot });

        const branches = stdout.trim().split("\n").map(b => b.trim()).filter(Boolean);
        for (const branch of branches) {
          try {
            await execFileAsync("git", [
              "branch", "-D", branch,
            ], { cwd: this.repoRoot });
          } catch {
            // Branch may already be deleted or is current
          }
        }
      } catch {
        // No matching branches
      }
    }
  }

  /**
   * List all active Conitens-managed worktrees.
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const raw = await this.listWorktreesRaw();
    return raw.filter(entry => entry.branch.startsWith("conitens/"));
  }

  /**
   * Get raw worktree list from git.
   */
  private async listWorktreesRaw(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync("git", [
        "worktree", "list", "--porcelain",
      ], { cwd: this.repoRoot });

      const entries: WorktreeInfo[] = [];
      let currentPath = "";
      let currentBranch = "";

      for (const line of stdout.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          currentBranch = line.slice("branch refs/heads/".length);
        } else if (line === "") {
          if (currentBranch.startsWith("conitens/")) {
            // Parse: conitens/{agentId}/{taskId}
            const parts = currentBranch.split("/");
            if (parts.length >= 3) {
              entries.push({
                agentId: parts[1],
                taskId: parts.slice(2).join("/"),
                branch: currentBranch,
                path: currentPath,
              });
            }
          }
          currentPath = "";
          currentBranch = "";
        }
      }

      return entries;
    } catch {
      return [];
    }
  }
}
