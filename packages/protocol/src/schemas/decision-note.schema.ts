/**
 * @module decision-note.schema
 * Zod schema for .notes/50_Decisions/ decision note frontmatter (ADR-0002).
 */
import { z } from "zod";

export const DecisionStatus = z.enum(["proposed", "accepted", "rejected", "superseded"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const DecisionNoteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  thread_id: z.string().optional(),
  workspace: z.string().optional(),
  status: DecisionStatus,
  deciders: z.array(z.string()).min(1),
  rationale: z.string().min(1),
  evidence_refs: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  superseded_by: z.string().optional(),
});

export type DecisionNote = z.infer<typeof DecisionNoteSchema>;
