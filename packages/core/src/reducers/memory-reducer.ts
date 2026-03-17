/**
 * @module reducers/memory-reducer
 * RFC-1.0.1 §11-12 — MemoryReducer.
 * Owns: agents/{agentId}/memory.proposed.md
 * Input events: decision.accepted, task.completed, message.received, message.sent, message.internal
 * Reads from: (nothing)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ConitensEvent } from "@conitens/protocol";
import type { BaseReducer } from "./base-reducer.js";

interface MemoryEntry {
  ts: string;
  source: string; // event type
  content: string;
  actor: string;
}

export class MemoryReducer implements BaseReducer {
  readonly name = "MemoryReducer";
  readonly inputEvents = [
    "decision.accepted",
    "task.completed",
    "message.received",
    "message.sent",
    "message.internal",
  ];

  // agentId -> proposed memory entries
  private proposed = new Map<string, MemoryEntry[]>();

  async reduce(event: ConitensEvent, conitensDir: string): Promise<void> {
    const agentId = this.extractAgentId(event);
    if (!agentId) return;

    const entry: MemoryEntry = {
      ts: event.ts,
      source: event.type,
      content: this.summarize(event),
      actor: event.actor.id,
    };

    if (!this.proposed.has(agentId)) {
      this.proposed.set(agentId, []);
    }
    this.proposed.get(agentId)!.push(entry);

    await this.writeProposedMemory(agentId, conitensDir);
  }

  private extractAgentId(event: ConitensEvent): string | null {
    // For agent-targeted events, use the actor
    if (event.actor.kind === "agent") return event.actor.id;
    // For task events, use the assignee if available
    if (event.payload.assignee) return event.payload.assignee as string;
    // For messages, use the recipient or actor
    if (event.payload.to) return event.payload.to as string;
    // Default: skip
    return null;
  }

  private summarize(event: ConitensEvent): string {
    switch (event.type) {
      case "decision.accepted":
        return `Decision accepted: ${event.payload.title ?? event.payload.decision_id ?? "unknown"}`;
      case "task.completed":
        return `Task completed: ${event.task_id ?? "unknown"}`;
      case "message.received":
      case "message.sent":
      case "message.internal":
        return `Message (${event.type.split(".")[1]}): ${(event.payload.body as string)?.slice(0, 200) ?? ""}`;
      default:
        return `${event.type}: ${JSON.stringify(event.payload).slice(0, 200)}`;
    }
  }

  private async writeProposedMemory(agentId: string, conitensDir: string): Promise<void> {
    const filePath = join(conitensDir, "agents", agentId, "memory.proposed.md");
    await mkdir(dirname(filePath), { recursive: true });

    const entries = this.proposed.get(agentId) ?? [];
    const lines = [
      "<!-- Proposed memory updates — awaiting human review -->",
      "",
      `# Proposed Memory: ${agentId}`,
      "",
      ...entries.map(
        (e) => `- **[${e.ts.slice(0, 19)}]** (${e.source}) ${e.content}`
      ),
      "",
    ];

    await writeFile(filePath, lines.join("\n") + "\n");
  }

  /** Reset in-memory state for replay. */
  reset(): void {
    this.proposed.clear();
  }
}
