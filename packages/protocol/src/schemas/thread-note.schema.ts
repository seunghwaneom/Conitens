/**
 * @module thread-note.schema
 * Zod schema for .notes/40_Comms/ thread note frontmatter (ADR-0002).
 */
import { z } from "zod";

export const ThreadKind = z.enum(["user_agent", "agent_agent", "agent_agent_user"]);
export type ThreadKind = z.infer<typeof ThreadKind>;

export const ThreadStatus = z.enum(["open", "closed", "archived"]);
export type ThreadStatus = z.infer<typeof ThreadStatus>;

export const ThreadNoteSchema = z.object({
  id: z.string().min(1),
  kind: ThreadKind,
  workspace: z.string().min(1),
  run: z.string().optional(),
  participants: z.array(z.string()).min(1),
  status: ThreadStatus,
  visibility: z.enum(["internal", "external"]).default("internal"),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  tags: z.array(z.string()).default([]),
  linked_notes: z.array(z.string()).default([]),
  prompt_tokens_est: z.number().int().nonnegative().optional(),
  completion_tokens_est: z.number().int().nonnegative().optional(),
  compression_ratio: z.number().min(0).max(1).optional(),
  source_message_count: z.number().int().nonnegative().optional(),
});

export type ThreadNote = z.infer<typeof ThreadNoteSchema>;
