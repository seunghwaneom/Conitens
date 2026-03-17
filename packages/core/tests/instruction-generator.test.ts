import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initConitens } from "../src/init/init.js";
import { InstructionGenerator } from "../src/generator/instruction-generator.js";

describe("InstructionGenerator", () => {
  let tempDir: string;
  let conitensDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-gen-test-"));
    conitensDir = join(tempDir, ".conitens");
    await initConitens({ rootDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates AGENTS.md with DO NOT EDIT header", async () => {
    const generator = new InstructionGenerator(tempDir, conitensDir);
    const files = await generator.generate();

    expect(files.length).toBeGreaterThanOrEqual(1);

    const agentsMd = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("GENERATED");
    expect(agentsMd).toContain("DO NOT EDIT");
  });

  it("includes all registered agents", async () => {
    const generator = new InstructionGenerator(tempDir, conitensDir);
    await generator.generate();

    const agentsMd = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("claude");
    expect(agentsMd).toContain("codex");
    expect(agentsMd).toContain("gemini");
  });

  it("includes provider bindings from MODE.md", async () => {
    const generator = new InstructionGenerator(tempDir, conitensDir);
    await generator.generate();

    const agentsMd = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("antigravity");
    expect(agentsMd).toContain("Planner");
    expect(agentsMd).toContain("Implementer");
  });

  it("includes agent roles from persona.yaml", async () => {
    const generator = new InstructionGenerator(tempDir, conitensDir);
    await generator.generate();

    const agentsMd = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("planner");
    expect(agentsMd).toContain("implementer");
    expect(agentsMd).toContain("reviewer");
  });
});
