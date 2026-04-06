/**
 * Export Zod schemas to JSON Schema files for Python validation.
 * Uses Zod v4 built-in toJSONSchema().
 * Run: npx tsx packages/protocol/src/schemas/export-json-schemas.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

if (typeof (z as Record<string, unknown>).toJSONSchema !== "function") {
  throw new Error("Zod >=4.0.0 required for z.toJSONSchema(). Run: pnpm add zod@latest");
}

import { ThreadNoteSchema } from "./thread-note.schema.js";
import { AgentCardSchema } from "./agent-card.schema.js";
import { DecisionNoteSchema } from "./decision-note.schema.js";
import { MemoryNoteSchema } from "./memory-note.schema.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const OUT_DIR = resolve(__dirname, "../../schemas");

mkdirSync(OUT_DIR, { recursive: true });

const entries: Array<[string, z.ZodType]> = [
  ["thread-note", ThreadNoteSchema],
  ["agent-card", AgentCardSchema],
  ["decision-note", DecisionNoteSchema],
  ["memory-note", MemoryNoteSchema],
];

for (const [name, schema] of entries) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  const outPath = resolve(OUT_DIR, `${name}.schema.json`);
  writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");
  console.log(`Written: ${outPath}`);
}

console.log(`\nExported ${entries.length} JSON Schema files to ${OUT_DIR}`);
