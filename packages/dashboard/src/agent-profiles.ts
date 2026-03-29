export const OFFICE_CANONICAL_ROLES = [
  "orchestrator",
  "implementer",
  "researcher",
  "reviewer",
  "validator",
] as const;

export type AgentOfficeRole = (typeof OFFICE_CANONICAL_ROLES)[number];

export interface AgentOfficeProfile {
  role: AgentOfficeRole;
  mark: string;
  accent: string;
  hair: string;
  outfit: string;
  skin: string;
  accessory: "crown" | "toolbelt" | "visor" | "goggles" | "shield";
  stance: "upright" | "lean" | "desk" | "inspect" | "guard";
  homeRoomId: string;
  archetype: string;
  voice: string;
  signatureProp: string;
  habits: string[];
  longTermFocus: string[];
  sharedMemoryRole: string;
  approvedGrowthPath: string;
}

export const OFFICE_AGENT_PROFILES: Record<AgentOfficeRole, AgentOfficeProfile> = {
  orchestrator: {
    role: "orchestrator",
    mark: OFFICE_CANONICAL_ROLE_CONTRACT.orchestrator.icon,
    accent: "#ff7043",
    hair: "#5b4133",
    outfit: "#365c82",
    skin: "#f2c8a3",
    accessory: "crown",
    stance: "upright",
    homeRoomId: OFFICE_CANONICAL_ROLE_CONTRACT.orchestrator.defaultRoom,
    archetype: "Floor lead",
    voice: "calm, procedural, ownership-first",
    signatureProp: "dispatch tablet",
    habits: ["scan-pressure", "rebalance-load", "frame-next-step"],
    longTermFocus: ["delegation patterns", "approval timing", "room load balancing"],
    sharedMemoryRole: "curates team-wide operating heuristics and escalation norms",
    approvedGrowthPath: "earns more refined orchestration rituals, not more authority",
  },
  implementer: {
    role: "implementer",
    mark: OFFICE_CANONICAL_ROLE_CONTRACT.implementer.icon,
    accent: "#66bb6a",
    hair: "#2f3137",
    outfit: "#5a7f4d",
    skin: "#f0c3a1",
    accessory: "toolbelt",
    stance: "lean",
    homeRoomId: OFFICE_CANONICAL_ROLE_CONTRACT.implementer.defaultRoom,
    archetype: "Builder",
    voice: "direct, technical, execution-biased",
    signatureProp: "tool roll",
    habits: ["deep-work", "patch-small", "verify-before-handoff"],
    longTermFocus: ["patch patterns", "regression traps", "preferred file seams"],
    sharedMemoryRole: "contributes reusable implementation tactics and repair notes",
    approvedGrowthPath: "gains better craft habits and sharper defaults, not louder personality",
  },
  researcher: {
    role: "researcher",
    mark: OFFICE_CANONICAL_ROLE_CONTRACT.researcher.icon,
    accent: "#ab47bc",
    hair: "#6a4b7c",
    outfit: "#8d6cb8",
    skin: "#eec7b0",
    accessory: "goggles",
    stance: "desk",
    homeRoomId: OFFICE_CANONICAL_ROLE_CONTRACT.researcher.defaultRoom,
    archetype: "Analyst",
    voice: "evidence-first, caveated, synthesis-oriented",
    signatureProp: "field notebook",
    habits: ["source-rank", "note-cluster", "surface-dead-end"],
    longTermFocus: ["source quality", "dead ends", "reference clusters"],
    sharedMemoryRole: "maintains institutional recall of prior investigations",
    approvedGrowthPath: "becomes more precise and better at filtering noise over time",
  },
  reviewer: {
    role: "reviewer",
    mark: OFFICE_CANONICAL_ROLE_CONTRACT.reviewer.icon,
    accent: "#42a5f5",
    hair: "#8a5b3e",
    outfit: "#4c78b6",
    skin: "#f4cfb5",
    accessory: "visor",
    stance: "inspect",
    homeRoomId: OFFICE_CANONICAL_ROLE_CONTRACT.reviewer.defaultRoom,
    archetype: "Visual critic",
    voice: "restrained, product-language focused, hierarchy-aware",
    signatureProp: "inspection stylus",
    habits: ["trim-noise", "protect-hierarchy", "scan-accessibility"],
    longTermFocus: ["UI heuristics", "accessibility notes", "frontend regression hotspots"],
    sharedMemoryRole: "records interface conventions and anti-slop rules for the team",
    approvedGrowthPath: "develops stronger taste and sharper exception handling, not ornament",
  },
  validator: {
    role: "validator",
    mark: OFFICE_CANONICAL_ROLE_CONTRACT.validator.icon,
    accent: "#ef5350",
    hair: "#3d3d46",
    outfit: "#d05b58",
    skin: "#f0c4a6",
    accessory: "shield",
    stance: "guard",
    homeRoomId: OFFICE_CANONICAL_ROLE_CONTRACT.validator.defaultRoom,
    archetype: "Gatekeeper",
    voice: "strict, evidence-demanding, release-minded",
    signatureProp: "approval stamp",
    habits: ["hold-the-line", "demand-proof", "close-the-loop"],
    longTermFocus: ["verify failures", "release criteria", "risk signatures"],
    sharedMemoryRole: "keeps the approved operational safety record coherent",
    approvedGrowthPath: "becomes more trustworthy and precise without becoming permissive",
  },
};

export function getAgentOfficeProfile(agentId: string): AgentOfficeProfile {
  const normalized = agentId.toLowerCase();

  if (
    normalized.includes("architect") ||
    normalized.includes("manager") ||
    normalized.includes("owner") ||
    normalized.includes("ops")
  ) {
    return OFFICE_AGENT_PROFILES.orchestrator;
  }

  if (normalized.includes("worker") || normalized.includes("implement")) {
    return OFFICE_AGENT_PROFILES.implementer;
  }

  if (normalized.includes("research")) {
    return OFFICE_AGENT_PROFILES.researcher;
  }

  if (
    normalized.includes("sentinel") ||
    normalized.includes("validator") ||
    normalized.includes("verify")
  ) {
    return OFFICE_AGENT_PROFILES.validator;
  }

  if (normalized.includes("review")) {
    return OFFICE_AGENT_PROFILES.reviewer;
  }

  return OFFICE_AGENT_PROFILES.orchestrator;
}
import { OFFICE_CANONICAL_ROLE_CONTRACT } from "./office-sprite-contract.ts";
