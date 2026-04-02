import type { CSSProperties } from "react";
import type { AgentOfficeProfile } from "./agent-profiles.ts";

export const OFFICE_AVATAR_POSES = [
  "sit",
  "stand",
  "lean",
  "guard",
  "desk",
  "inspect",
] as const;
export type OfficeAvatarPose = (typeof OFFICE_AVATAR_POSES)[number];

export const OFFICE_AVATAR_FACINGS = ["left", "right", "down"] as const;
export type OfficeAvatarFacing = (typeof OFFICE_AVATAR_FACINGS)[number];

interface OfficeAvatarSpriteSpec {
  frameX: number;
  frameY: number;
  backgroundSize: string;
  transform?: string;
}

const CANONICAL_STAGE_SHEETS: Record<AgentOfficeProfile["role"], string> = {
  orchestrator: new URL("../../command-center/public/sprites/agent-orchestrator.png", import.meta.url).href,
  implementer: new URL("../../command-center/public/sprites/agent-implementer.png", import.meta.url).href,
  researcher: new URL("../../command-center/public/sprites/agent-researcher.png", import.meta.url).href,
  reviewer: new URL("../../command-center/public/sprites/agent-reviewer.png", import.meta.url).href,
  validator: new URL("../../command-center/public/sprites/agent-validator.png", import.meta.url).href,
};

const STAGE_FRAME_SIZE = 24;
const STAGE_SHEET_SIZE = "192px 120px";

export const OFFICE_AVATAR_REGISTRY = {
  "stand:down": {
    frameX: 0,
    frameY: 0,
    backgroundSize: STAGE_SHEET_SIZE,
  },
  "stand:left": {
    frameX: 20,
    frameY: 0,
    backgroundSize: STAGE_SHEET_SIZE,
  },
  "stand:right": {
    frameX: 20,
    frameY: 0,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "scaleX(-1)",
  },
  "lean:down": {
    frameX: 40,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px)",
  },
  "lean:left": {
    frameX: 60,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px)",
  },
  "lean:right": {
    frameX: 60,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px) scaleX(-1)",
  },
  "guard:down": {
    frameX: 60,
    frameY: 60,
    backgroundSize: STAGE_SHEET_SIZE,
  },
  "guard:left": {
    frameX: 80,
    frameY: 60,
    backgroundSize: STAGE_SHEET_SIZE,
  },
  "guard:right": {
    frameX: 80,
    frameY: 60,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "scaleX(-1)",
  },
  "inspect:down": {
    frameX: 20,
    frameY: 40,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px)",
  },
  "inspect:left": {
    frameX: 40,
    frameY: 40,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px)",
  },
  "inspect:right": {
    frameX: 40,
    frameY: 40,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(1px) scaleX(-1)",
  },
  "sit:down": {
    frameX: 0,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px)",
  },
  "sit:left": {
    frameX: 20,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px)",
  },
  "sit:right": {
    frameX: 20,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px) scaleX(-1)",
  },
  "desk:down": {
    frameX: 40,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px)",
  },
  "desk:left": {
    frameX: 60,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px)",
  },
  "desk:right": {
    frameX: 60,
    frameY: 20,
    backgroundSize: STAGE_SHEET_SIZE,
    transform: "translateY(2px) scaleX(-1)",
  },
} as const satisfies Record<`${OfficeAvatarPose}:${OfficeAvatarFacing}`, OfficeAvatarSpriteSpec>;

export function resolveOfficeAvatarSprite({
  role,
  pose = "stand",
  facing = "down",
}: {
  role: AgentOfficeProfile["role"];
  pose?: OfficeAvatarPose;
  facing?: OfficeAvatarFacing;
}): CSSProperties {
  const variant = OFFICE_AVATAR_REGISTRY[`${pose}:${facing}`] as OfficeAvatarSpriteSpec;
  return {
    backgroundImage: `url("${CANONICAL_STAGE_SHEETS[role]}")`,
    backgroundPosition: `-${(variant.frameX / 20) * STAGE_FRAME_SIZE}px -${(variant.frameY / 20) * STAGE_FRAME_SIZE}px`,
    backgroundSize: variant.backgroundSize,
    transform: variant.transform,
  };
}
