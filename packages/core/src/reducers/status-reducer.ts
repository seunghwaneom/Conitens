/**
 * @module reducers
 * RFC-1.0.1 §11 — StatusReducer: owns views/STATUS.md.
 *
 * Invariants enforced:
 *   I-2: Rebuilds views/STATUS.md from events only — never reads runtime/.
 *   Input events: agent.spawned, agent.heartbeat, agent.error, agent.terminated.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConitensEvent } from "@conitens/protocol";
import type { BaseReducer } from "./base-reducer.js";

interface AgentStatus {
  agentId: string;
  status: "running" | "error" | "terminated";
  lastHeartbeat?: string;
  lastError?: string;
  spawnedAt?: string;
  terminatedAt?: string;
}

export class StatusReducer implements BaseReducer {
  readonly name = "StatusReducer";
  readonly inputEvents = [
    "agent.spawned",
    "agent.heartbeat",
    "agent.error",
    "agent.terminated",
  ];

  /** In-memory agent status rebuilt from events (no runtime/ reads — I-2). */
  private agents = new Map<string, AgentStatus>();

  async reduce(event: ConitensEvent, conitensDir: string): Promise<void> {
    if (!event.type.startsWith("agent.")) return;

    const agentId = event.actor.id;

    switch (event.type) {
      case "agent.spawned":
        this.agents.set(agentId, {
          agentId,
          status: "running",
          spawnedAt: event.ts,
        });
        break;

      case "agent.heartbeat": {
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.lastHeartbeat = event.ts;
          agent.status = "running";
        }
        break;
      }

      case "agent.error": {
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.status = "error";
          agent.lastError = event.payload.message as string | undefined;
        }
        break;
      }

      case "agent.terminated": {
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.status = "terminated";
          agent.terminatedAt = event.ts;
        }
        break;
      }
    }

    await this.writeStatusView(conitensDir);
  }

  private async writeStatusView(conitensDir: string): Promise<void> {
    const viewsDir = join(conitensDir, "views");
    await mkdir(viewsDir, { recursive: true });

    const lines = ["# Agent Status", ""];

    if (this.agents.size === 0) {
      lines.push("_No agents registered._");
    } else {
      for (const [, agent] of this.agents) {
        const icon =
          agent.status === "running" ? "■" :
          agent.status === "error"   ? "!" : "□";
        const heartbeatPart = agent.lastHeartbeat ? ` (last: ${agent.lastHeartbeat})` : "";
        lines.push(`- [${icon}] **${agent.agentId}**: ${agent.status}${heartbeatPart}`);
      }
    }

    await writeFile(join(viewsDir, "STATUS.md"), lines.join("\n") + "\n");
  }

  /** Reset in-memory state for replay. */
  reset(): void {
    this.agents.clear();
  }
}
