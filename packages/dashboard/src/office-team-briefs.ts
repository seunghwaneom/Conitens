import type { AgentOfficeRole } from "./agent-profiles.ts";
import type { OfficeStageTeamId } from "./office-stage-schema.ts";

export interface OfficeTeamBrief {
  label: string;
  mission: string;
  cadence: string;
  ambientCue: string;
  fallbackLabel: string;
  stewardRole: AgentOfficeRole;
}

export const OFFICE_TEAM_BRIEFS: Record<OfficeStageTeamId, OfficeTeamBrief> = {
  plan_team: {
    label: "Plan Team",
    mission: "Frames incoming work, locks milestones, and keeps the floorplate sequenced.",
    cadence: "Brief, route, stabilize.",
    ambientCue: "dispatch notes and staged approvals stay closest to the corridor edge",
    fallbackLabel: "floor lead on deck",
    stewardRole: "orchestrator",
  },
  refactor_team: {
    label: "Refactor Team",
    mission: "Owns implementation seams, patch stability, and repair throughput.",
    cadence: "Patch small, verify, hand off.",
    ambientCue: "tool carts and open benches signal active maker space",
    fallbackLabel: "builder station warm",
    stewardRole: "implementer",
  },
  research_team: {
    label: "Research Team",
    mission: "Collects evidence, filters noise, and routes verified context forward.",
    cadence: "Rank sources, cluster notes, surface the next signal.",
    ambientCue: "notes, racks, and reference walls keep the room visibly busy",
    fallbackLabel: "analysis desk standing by",
    stewardRole: "researcher",
  },
  review_team: {
    label: "Review Team",
    mission: "Checks risk, verifies criteria, and keeps the release line honest.",
    cadence: "Inspect, gate, stamp.",
    ambientCue: "terminal glow and gate desks keep the room alert even when quiet",
    fallbackLabel: "gate desk guarded",
    stewardRole: "validator",
  },
  design_team: {
    label: "Design Team",
    mission: "Protects hierarchy, visual quality, and interface readability.",
    cadence: "Compare, trim, refine.",
    ambientCue: "critique screens and boards keep the room active by default",
    fallbackLabel: "critique station ready",
    stewardRole: "reviewer",
  },
  advising_team: {
    label: "Advising Team",
    mission: "Hosts cross-team intake, frames ambiguous asks, and keeps shared decisions moving.",
    cadence: "Receive, reframe, route.",
    ambientCue: "the commons stays warm with a shared table, notes, and intake cues",
    fallbackLabel: "commons steward on watch",
    stewardRole: "orchestrator",
  },
};
