/**
 * @module agent-card.schema
 * Zod schema for .notes/10_Agents/ agent card frontmatter (ADR-0002).
 */
import { z } from "zod";

export const AgentRole = z.enum(["supervisor", "recorder", "improver", "worker"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const AgentStatus = z.enum(["active", "archived", "draft"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentCardSchema = z.object({
  id: z.string().min(1),
  role: AgentRole,
  public_persona: z.string().min(1),
  private_policy: z.object({
    approval_required_for: z.array(z.string()).default([]),
  }).optional(),
  skills: z.array(z.string()).default([]),
  memory_namespace: z.string().min(1),
  hermes_profile: z.string().optional(),
  handoff_required_fields: z.array(z.string()).default([
    "objective", "constraints", "decisions", "evidence_refs", "next_actions",
  ]),
  obsidian_note: z.string().optional(),
  status: AgentStatus.default("draft"),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;
