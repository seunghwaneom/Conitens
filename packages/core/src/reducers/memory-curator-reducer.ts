/**
 * @module reducers/memory-curator-reducer
 * RFC-1.0.1 §11-12 — MemoryCuratorReducer.
 * Owns: agents/{agentId}/memory.md
 * Input events: memory.update_approved ONLY
 * Reads from: agents/{agentId}/memory.proposed.md (read-only)
 *
 * Gate: human approval required. This reducer ONLY fires on memory.update_approved.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ConitensEvent } from "@conitens/protocol";
import type { BaseReducer } from "./base-reducer.js";
import { validateId } from "../utils/safe-path.js";

interface CuratedEntry {
  ts: string;
  content: string;
  approvedBy: string;
}

export class MemoryCuratorReducer implements BaseReducer {
  readonly name = "MemoryCuratorReducer";
  readonly inputEvents = ["memory.update_approved"];

  // agentId -> curated memory entries
  private curated = new Map<string, CuratedEntry[]>();

  async reduce(event: ConitensEvent, conitensDir: string): Promise<void> {
    // ONLY respond to memory.update_approved — this is the gate
    if (event.type !== "memory.update_approved") return;

    const agentId = event.payload.agent_id as string;
    if (!agentId) return;
    validateId(agentId, "agent_id");

    const entry: CuratedEntry = {
      ts: event.ts,
      content: (event.payload.content as string) ?? "Approved memory update",
      approvedBy: event.actor.id,
    };

    if (!this.curated.has(agentId)) {
      this.curated.set(agentId, []);
    }
    this.curated.get(agentId)!.push(entry);

    await this.writeCuratedMemory(agentId, conitensDir);
  }

  private async writeCuratedMemory(agentId: string, conitensDir: string): Promise<void> {
    const filePath = join(conitensDir, "agents", agentId, "memory.md");
    await mkdir(dirname(filePath), { recursive: true });

    const entries = this.curated.get(agentId) ?? [];
    const lines = [
      "<!-- Curated agent memory — updated only via memory.update_approved events -->",
      "",
      `# Memory: ${agentId}`,
      "",
      ...entries.map(
        (e) => `- **[${e.ts.slice(0, 19)}]** ${e.content} _(approved by ${e.approvedBy})_`
      ),
      "",
    ];

    await writeFile(filePath, lines.join("\n") + "\n");
  }

  /** Reset in-memory state for replay. */
  reset(): void {
    this.curated.clear();
  }
}
