import type { AgentOfficeRole } from "./agent-profiles.ts";

export type AgentCharacterPortraitSource = "imagegen-large-pixel-avatar";

export interface AgentCharacterPortraitSpec {
  readonly role: AgentOfficeRole;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly source: AgentCharacterPortraitSource;
}

export const AGENT_CHARACTER_PORTRAITS = {
  orchestrator: {
    role: "orchestrator",
    src: "/agent-portraits/generated/orchestrator.png",
    width: 288,
    height: 512,
    source: "imagegen-large-pixel-avatar",
  },
  implementer: {
    role: "implementer",
    src: "/agent-portraits/generated/implementer.png",
    width: 288,
    height: 512,
    source: "imagegen-large-pixel-avatar",
  },
  researcher: {
    role: "researcher",
    src: "/agent-portraits/generated/researcher.png",
    width: 288,
    height: 512,
    source: "imagegen-large-pixel-avatar",
  },
  reviewer: {
    role: "reviewer",
    src: "/agent-portraits/generated/reviewer.png",
    width: 288,
    height: 512,
    source: "imagegen-large-pixel-avatar",
  },
  validator: {
    role: "validator",
    src: "/agent-portraits/generated/validator.png",
    width: 288,
    height: 512,
    source: "imagegen-large-pixel-avatar",
  },
} as const satisfies Record<AgentOfficeRole, AgentCharacterPortraitSpec>;

export function resolveAgentCharacterPortrait(
  role: AgentOfficeRole,
): AgentCharacterPortraitSpec {
  return AGENT_CHARACTER_PORTRAITS[role];
}
