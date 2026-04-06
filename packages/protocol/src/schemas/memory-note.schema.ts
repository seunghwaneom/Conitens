/**
 * @module memory-note.schema
 * Zod schema for .notes/60_Memory/ memory note frontmatter (ADR-0002).
 */
import { z } from "zod";

export const MemoryKind = z.enum([
  "fact", "preference", "pattern", "playbook", "lesson", "identity",
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryStatus = z.enum(["proposed", "approved", "rejected", "archived"]);
export type MemoryStatus = z.infer<typeof MemoryStatus>;

export const MemoryNoteSchema = z.object({
  id: z.string().min(1),
  kind: MemoryKind,
  agent_id: z.string().min(1),
  namespace: z.string().min(1),
  status: MemoryStatus,
  content: z.string().min(1),
  source_thread: z.string().optional(),
  source_run: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  review_required: z.boolean().default(false),
});

export type MemoryNote = z.infer<typeof MemoryNoteSchema>;
