/**
 * @module mode
 * RFC-1.0.1 §15 — MODE.md manager.
 *
 * MODE.md changes ONLY provider bindings — never directory structure,
 * event schema, state machine, or reducer logic (I-4).
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventLog } from "../event-log/event-log.js";

export interface ModeConfig {
  currentMode: string;
  bindings: {
    planner: string;
    implementer: string;
    reviewer: string;
    validator: string;
  };
  activeChannels: string[];
  approvalPolicy: {
    default: string;
    highRisk: string;
  };
}

export class ModeManager {
  private readonly conitensDir: string;

  constructor(conitensDir: string) {
    this.conitensDir = conitensDir;
  }

  /**
   * Read and parse MODE.md into structured config.
   */
  async readMode(): Promise<ModeConfig> {
    const modePath = join(this.conitensDir, "MODE.md");
    const content = await readFile(modePath, "utf-8");
    return this.parseModeMd(content);
  }

  /**
   * Switch to a new mode by updating provider bindings.
   * Emits mode.switch_requested + mode.switch_completed events.
   * Does NOT change directory structure, event schema, or state machine (I-4).
   */
  async switchMode(
    newMode: string,
    bindings: ModeConfig["bindings"],
    eventLog: EventLog,
    runId: string,
  ): Promise<void> {
    const current = await this.readMode();

    // Emit mode.switch_requested
    await eventLog.append({
      type: "mode.switch_requested",
      run_id: runId,
      actor: { kind: "system", id: "mode-manager" },
      payload: {
        from: current.currentMode,
        to: newMode,
        bindings,
      },
    });

    // Update MODE.md with new bindings
    const newConfig: ModeConfig = {
      currentMode: newMode,
      bindings,
      activeChannels: current.activeChannels,
      approvalPolicy: current.approvalPolicy,
    };
    await this.writeModeMd(newConfig);

    // Emit mode.switch_completed
    await eventLog.append({
      type: "mode.switch_completed",
      run_id: runId,
      actor: { kind: "system", id: "mode-manager" },
      payload: {
        mode: newMode,
        bindings,
      },
    });
  }

  private parseModeMd(content: string): ModeConfig {
    const modeMatch = content.match(/## Current Mode:\s*(.+)/);
    const currentMode = modeMatch ? modeMatch[1].trim() : "antigravity";

    const bindings = {
      planner: this.extractField(content, "planner") ?? "claude",
      implementer: this.extractField(content, "implementer") ?? "codex",
      reviewer: this.extractField(content, "reviewer") ?? "gemini",
      validator: this.extractField(content, "validator") ?? "claude",
    };

    const channelsMatch = content.match(/### Active Channels\n([\s\S]*?)(?=\n###|\n##|$)/);
    const activeChannels: string[] = [];
    if (channelsMatch) {
      for (const line of channelsMatch[1].split("\n")) {
        const ch = line.replace(/^-\s*/, "").trim();
        if (ch) activeChannels.push(ch);
      }
    }

    const approvalPolicy = {
      default: this.extractField(content, "default") ?? "auto_approve",
      highRisk: this.extractField(content, "high_risk") ?? "human_approval",
    };

    return { currentMode, bindings, activeChannels, approvalPolicy };
  }

  private extractField(content: string, field: string): string | null {
    const regex = new RegExp(`^${field}:\\s*(.+)$`, "m");
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private async writeModeMd(config: ModeConfig): Promise<void> {
    const content = `# MODE.md — Conitens Operating Mode

## Current Mode: ${config.currentMode}

### Provider Bindings
planner: ${config.bindings.planner}
implementer: ${config.bindings.implementer}
reviewer: ${config.bindings.reviewer}
validator: ${config.bindings.validator}

### Active Channels
${config.activeChannels.map((ch) => `- ${ch}`).join("\n")}

### Approval Policy
default: ${config.approvalPolicy.default}
high_risk: ${config.approvalPolicy.highRisk}

### UI Defaults
theme: dark
refresh_interval: 5000
`;
    await writeFile(join(this.conitensDir, "MODE.md"), content);
  }
}
