/**
 * @module agent-spawner
 * RFC-1.0.1 — tmux-based agent process spawner and lifecycle manager.
 *
 * Each CLI agent (claude, codex, gemini) runs in its own tmux session,
 * providing process isolation and the ability to attach/detach for debugging.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SpawnOptions {
  /** Agent identifier (e.g., "claude", "codex", "gemini") */
  agentId: string;
  /** Command to execute (e.g., "claude-code", "codex-cli") */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables to pass to the agent process */
  env?: Record<string, string>;
  /** Working directory for the agent */
  cwd?: string;
}

export interface AgentInfo {
  agentId: string;
  sessionName: string;
  running: boolean;
}

const SESSION_PREFIX = "conitens-";

export class AgentSpawner {
  /**
   * Check if tmux is available on this system.
   * @throws Error with install instructions if tmux is not found
   */
  async ensureTmux(): Promise<void> {
    try {
      await execFileAsync("tmux", ["-V"]);
    } catch {
      throw new Error(
        "tmux is not installed. Agent spawning requires tmux.\n" +
          "Install instructions:\n" +
          "  macOS:   brew install tmux\n" +
          "  Ubuntu:  sudo apt install tmux\n" +
          "  Windows: Use WSL2 with tmux installed",
      );
    }
  }

  /**
   * Spawn an agent in a new tmux session.
   * Session name: conitens-{agentId}
   */
  async spawnAgent(options: SpawnOptions): Promise<AgentInfo> {
    await this.ensureTmux();

    const { agentId, command, args = [], env = {}, cwd } = options;
    const sessionName = `${SESSION_PREFIX}${agentId}`;

    // Check if session already exists
    if (await this.isAgentRunning(agentId)) {
      throw new Error(
        `Agent "${agentId}" is already running in session "${sessionName}"`,
      );
    }

    // Validate inputs to prevent shell injection via tmux
    // tmux interprets its command argument through a shell, so we must
    // reject dangerous characters in command/args
    const DANGEROUS = /[;&|`$(){}!#]/;
    if (DANGEROUS.test(command)) {
      throw new Error(`Unsafe command: "${command}" contains shell metacharacters`);
    }
    for (const arg of args) {
      if (DANGEROUS.test(arg)) {
        throw new Error(`Unsafe argument: "${arg}" contains shell metacharacters`);
      }
    }

    // Validate agentId (used in session name)
    if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      throw new Error(`Invalid agentId: "${agentId}" must be alphanumeric/dash/underscore`);
    }

    // Build the full command string for tmux
    // Safe because we validated no shell metacharacters above
    const fullCommand = [command, ...args].join(" ");

    // Build tmux new-session args
    const tmuxArgs = [
      "new-session",
      "-d", // detached
      "-s",
      sessionName, // session name
    ];

    if (cwd) {
      tmuxArgs.push("-c", cwd); // working directory
    }

    tmuxArgs.push(fullCommand);

    // Build environment: merge current env with custom env
    const spawnEnv = { ...process.env, ...env };

    await execFileAsync("tmux", tmuxArgs, { env: spawnEnv });

    return {
      agentId,
      sessionName,
      running: true,
    };
  }

  /**
   * Gracefully kill an agent's tmux session.
   * Sends SIGTERM first, waits briefly, then forces kill if needed.
   */
  async killAgent(agentId: string): Promise<void> {
    await this.ensureTmux();

    const sessionName = `${SESSION_PREFIX}${agentId}`;

    if (!(await this.isAgentRunning(agentId))) {
      return; // Already stopped, idempotent
    }

    // Send Ctrl-C to the process in the session
    try {
      await execFileAsync("tmux", ["send-keys", "-t", sessionName, "C-c", ""]);
    } catch {
      // Ignore — session may have already exited
    }

    // Wait briefly for graceful shutdown
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    // Force kill the session if still alive
    if (await this.isAgentRunning(agentId)) {
      try {
        await execFileAsync("tmux", ["kill-session", "-t", sessionName]);
      } catch {
        // Session may have exited between check and kill
      }
    }
  }

  /**
   * List all running Conitens agent sessions.
   */
  async listAgents(): Promise<AgentInfo[]> {
    try {
      await this.ensureTmux();
    } catch {
      return []; // tmux not installed — no agents running
    }

    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-sessions",
        "-F",
        "#{session_name}",
      ]);

      return stdout
        .trim()
        .split("\n")
        .filter((name) => name.startsWith(SESSION_PREFIX))
        .map((sessionName) => ({
          agentId: sessionName.slice(SESSION_PREFIX.length),
          sessionName,
          running: true,
        }));
    } catch {
      // tmux server not running — no sessions
      return [];
    }
  }

  /**
   * Check if a specific agent is currently running.
   */
  async isAgentRunning(agentId: string): Promise<boolean> {
    const sessionName = `${SESSION_PREFIX}${agentId}`;

    try {
      await execFileAsync("tmux", ["has-session", "-t", sessionName]);
      return true;
    } catch {
      return false;
    }
  }
}
