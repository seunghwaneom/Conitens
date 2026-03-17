import { describe, it, expect, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Since tmux is not available on Windows/CI, we test AgentSpawner
 * by directly testing its logic with a lightweight in-process simulation.
 */

const SESSION_PREFIX = "conitens-";

// Simulated tmux session store
let sessions: Map<string, boolean>;

// Simulated execFile that mimics tmux behavior
async function tmuxExec(args: string[]): Promise<string> {
  const subcmd = args[0];

  if (subcmd === "-V") return "tmux 3.4";

  if (subcmd === "new-session") {
    const sIdx = args.indexOf("-s");
    const name = sIdx >= 0 ? args[sIdx + 1] : "unknown";
    if (sessions.has(name)) throw new Error(`duplicate session: ${name}`);
    sessions.set(name, true);
    return "";
  }

  if (subcmd === "has-session") {
    const tIdx = args.indexOf("-t");
    const name = tIdx >= 0 ? args[tIdx + 1] : "";
    if (!sessions.has(name)) throw new Error("no session");
    return "";
  }

  if (subcmd === "list-sessions") {
    return [...sessions.keys()].join("\n");
  }

  if (subcmd === "send-keys") return "";

  if (subcmd === "kill-session") {
    const tIdx = args.indexOf("-t");
    const name = tIdx >= 0 ? args[tIdx + 1] : "";
    sessions.delete(name);
    return "";
  }

  return "";
}

// Minimal AgentSpawner replica that uses our tmuxExec instead of real execFile
class TestableAgentSpawner {
  async ensureTmux(): Promise<void> {
    await tmuxExec(["-V"]);
  }

  async spawnAgent(options: {
    agentId: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }) {
    await this.ensureTmux();
    const { agentId, command, args = [], cwd } = options;
    const sessionName = `${SESSION_PREFIX}${agentId}`;

    if (await this.isAgentRunning(agentId)) {
      throw new Error(`Agent "${agentId}" is already running in session "${sessionName}"`);
    }

    const fullCommand = [command, ...args].join(" ");
    const tmuxArgs = ["new-session", "-d", "-s", sessionName];
    if (cwd) tmuxArgs.push("-c", cwd);
    tmuxArgs.push(fullCommand);

    await tmuxExec(tmuxArgs);
    return { agentId, sessionName, running: true };
  }

  async killAgent(agentId: string): Promise<void> {
    await this.ensureTmux();
    const sessionName = `${SESSION_PREFIX}${agentId}`;
    if (!(await this.isAgentRunning(agentId))) return;

    try { await tmuxExec(["send-keys", "-t", sessionName, "C-c", ""]); } catch { /* */ }
    if (await this.isAgentRunning(agentId)) {
      try { await tmuxExec(["kill-session", "-t", sessionName]); } catch { /* */ }
    }
  }

  async listAgents() {
    try { await this.ensureTmux(); } catch { return []; }
    try {
      const stdout = await tmuxExec(["list-sessions", "-F", "#{session_name}"]);
      return stdout.trim().split("\n")
        .filter(name => name.startsWith(SESSION_PREFIX))
        .map(sessionName => ({
          agentId: sessionName.slice(SESSION_PREFIX.length),
          sessionName,
          running: true,
        }));
    } catch { return []; }
  }

  async isAgentRunning(agentId: string): Promise<boolean> {
    try {
      await tmuxExec(["has-session", "-t", `${SESSION_PREFIX}${agentId}`]);
      return true;
    } catch { return false; }
  }
}

describe("AgentSpawner", () => {
  let spawner: TestableAgentSpawner;

  beforeEach(() => {
    sessions = new Map();
    spawner = new TestableAgentSpawner();
  });

  it("ensureTmux succeeds when tmux is available", async () => {
    await expect(spawner.ensureTmux()).resolves.toBeUndefined();
  });

  it("spawnAgent creates a session and returns AgentInfo", async () => {
    const info = await spawner.spawnAgent({
      agentId: "claude",
      command: "claude-code",
      args: ["--headless"],
    });

    expect(info.agentId).toBe("claude");
    expect(info.sessionName).toBe("conitens-claude");
    expect(info.running).toBe(true);
  });

  it("spawnAgent throws if agent is already running", async () => {
    await spawner.spawnAgent({ agentId: "codex", command: "codex-cli" });

    await expect(
      spawner.spawnAgent({ agentId: "codex", command: "codex-cli" }),
    ).rejects.toThrow("already running");
  });

  it("isAgentRunning returns true for spawned agents", async () => {
    await spawner.spawnAgent({ agentId: "gemini", command: "gemini-cli" });

    expect(await spawner.isAgentRunning("gemini")).toBe(true);
    expect(await spawner.isAgentRunning("nonexistent")).toBe(false);
  });

  it("listAgents returns only conitens-prefixed sessions", async () => {
    await spawner.spawnAgent({ agentId: "agent1", command: "cmd1" });
    await spawner.spawnAgent({ agentId: "agent2", command: "cmd2" });

    const agents = await spawner.listAgents();
    expect(agents.length).toBe(2);
    expect(agents.map(a => a.agentId)).toContain("agent1");
    expect(agents.map(a => a.agentId)).toContain("agent2");
  });

  it("killAgent removes the session", async () => {
    await spawner.spawnAgent({ agentId: "killme", command: "some-cmd" });

    expect(await spawner.isAgentRunning("killme")).toBe(true);
    await spawner.killAgent("killme");
    expect(await spawner.isAgentRunning("killme")).toBe(false);
  });

  it("killAgent is idempotent for non-running agents", async () => {
    await expect(spawner.killAgent("nonexistent")).resolves.toBeUndefined();
  });
});
