/**
 * @module generator
 * RFC-1.0.1 §16 — Instruction generator.
 *
 * Reads persona.yaml + MODE.md + policies to generate
 * AGENTS.md and other instruction files.
 * All generated files include the DO NOT EDIT header.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ModeManager } from "../mode/mode-manager.js";
import type { ModeConfig } from "../mode/mode-manager.js";

const GENERATED_HEADER = "<!-- ⚠️ GENERATED — DO NOT EDIT -->";

export interface GeneratedFile {
  path: string;
  content: string;
}

export class InstructionGenerator {
  private readonly conitensDir: string;
  private readonly projectRoot: string;

  constructor(projectRoot: string, conitensDir: string) {
    this.projectRoot = projectRoot;
    this.conitensDir = conitensDir;
  }

  /**
   * Generate all instruction files from canonical sources.
   * Sources: agents/{id}/persona.yaml + MODE.md + policies/{id}.yaml
   */
  async generate(): Promise<GeneratedFile[]> {
    const modeManager = new ModeManager(this.conitensDir);
    const mode = await modeManager.readMode();

    const agents = await this.readAgentPersonas();

    const files: GeneratedFile[] = [];

    // Generate AGENTS.md
    const agentsMd = this.generateAgentsMd(agents, mode);
    files.push({ path: join(this.projectRoot, "AGENTS.md"), content: agentsMd });
    await writeFile(join(this.projectRoot, "AGENTS.md"), agentsMd);

    return files;
  }

  private async readAgentPersonas(): Promise<
    Array<{ id: string; displayName: string; cliTool: string; roles: string[] }>
  > {
    const agentsDir = join(this.conitensDir, "agents");
    const agents: Array<{
      id: string;
      displayName: string;
      cliTool: string;
      roles: string[];
    }> = [];

    try {
      const entries = await readdir(agentsDir);
      for (const entry of entries) {
        try {
          const personaContent = await readFile(
            join(agentsDir, entry, "persona.yaml"),
            "utf-8",
          );
          const id = this.yamlField(personaContent, "agent_id") ?? entry;
          const displayName = this.yamlField(personaContent, "display_name") ?? entry;
          const cliTool = this.yamlField(personaContent, "cli_tool") ?? `${entry}-cli`;
          const rolesMatch = personaContent.match(/roles:\n((?:\s+-\s+.+\n?)*)/);
          const roles = rolesMatch
            ? rolesMatch[1]
                .split("\n")
                .map((l) => l.replace(/^\s+-\s+/, "").trim())
                .filter(Boolean)
            : [];
          agents.push({ id, displayName, cliTool, roles });
        } catch {
          // Skip agents without persona.yaml
        }
      }
    } catch {
      // No agents directory
    }

    return agents;
  }

  private yamlField(content: string, field: string): string | null {
    const regex = new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, "m");
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private generateAgentsMd(
    agents: Array<{ id: string; displayName: string; cliTool: string; roles: string[] }>,
    mode: ModeConfig,
  ): string {
    const lines = [
      GENERATED_HEADER,
      "",
      "# AGENTS.md — Conitens v2 Agent Registry",
      "",
      `**Mode**: ${mode.currentMode}`,
      "",
      "## Provider Bindings",
      "",
      `| Role | Agent |`,
      `|------|-------|`,
      `| Planner | ${mode.bindings.planner} |`,
      `| Implementer | ${mode.bindings.implementer} |`,
      `| Reviewer | ${mode.bindings.reviewer} |`,
      `| Validator | ${mode.bindings.validator} |`,
      "",
      "## Registered Agents",
      "",
    ];

    for (const agent of agents) {
      lines.push(`### ${agent.displayName} (\`${agent.cliTool}\`)`);
      lines.push("");
      lines.push(`- **ID**: ${agent.id}`);
      lines.push(`- **Roles**: ${agent.roles.join(", ") || "none"}`);
      lines.push("");
    }

    lines.push(`---`);
    lines.push(`_Generated from .conitens/agents/*/persona.yaml + MODE.md_`);
    lines.push("");

    return lines.join("\n");
  }
}
