import type { CSSProperties } from "react";
import type { AgentOfficeProfile } from "./agent-profiles.ts";
import {
  GENERATED_AGENT_SPRITE_MANIFEST,
  type AgentMotionProfile,
} from "./agent-sprite-manifest.generated.ts";

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

interface OfficeAvatarVariantSpec {
  frameOffset: number;
  transform?: string;
}

export interface OfficeAvatarFrameSpec {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface OfficeAvatarSpriteSpec extends CSSProperties {
  readonly source: "sprite-gen";
  readonly atlasPath: string;
  readonly motionProfile: AgentMotionProfile;
  readonly frames: readonly OfficeAvatarFrameSpec[];
  readonly fps: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly cycleSeconds: number;
}

export const OFFICE_AVATAR_REGISTRY = {
  "stand:down": {
    frameOffset: 0,
  },
  "stand:left": {
    frameOffset: 1,
  },
  "stand:right": {
    frameOffset: 1,
    transform: "scaleX(-1)",
  },
  "lean:down": {
    frameOffset: 2,
    transform: "translateY(1px)",
  },
  "lean:left": {
    frameOffset: 3,
    transform: "translateY(1px)",
  },
  "lean:right": {
    frameOffset: 3,
    transform: "translateY(1px) scaleX(-1)",
  },
  "guard:down": {
    frameOffset: 4,
  },
  "guard:left": {
    frameOffset: 5,
  },
  "guard:right": {
    frameOffset: 5,
    transform: "scaleX(-1)",
  },
  "inspect:down": {
    frameOffset: 2,
    transform: "translateY(1px)",
  },
  "inspect:left": {
    frameOffset: 3,
    transform: "translateY(1px)",
  },
  "inspect:right": {
    frameOffset: 3,
    transform: "translateY(1px) scaleX(-1)",
  },
  "sit:down": {
    frameOffset: 6,
    transform: "translateY(2px)",
  },
  "sit:left": {
    frameOffset: 6,
    transform: "translateY(2px)",
  },
  "sit:right": {
    frameOffset: 6,
    transform: "translateY(2px) scaleX(-1)",
  },
  "desk:down": {
    frameOffset: 7,
    transform: "translateY(2px)",
  },
  "desk:left": {
    frameOffset: 7,
    transform: "translateY(2px)",
  },
  "desk:right": {
    frameOffset: 7,
    transform: "translateY(2px) scaleX(-1)",
  },
} as const satisfies Record<`${OfficeAvatarPose}:${OfficeAvatarFacing}`, OfficeAvatarVariantSpec>;

export function resolveOfficeAvatarSprite({
  role,
  pose = "stand",
  facing = "down",
}: {
  role: AgentOfficeProfile["role"];
  pose?: OfficeAvatarPose;
  facing?: OfficeAvatarFacing;
}): OfficeAvatarSpriteSpec {
  const roleManifest = GENERATED_AGENT_SPRITE_MANIFEST.roles[role];
  const variant: OfficeAvatarVariantSpec = OFFICE_AVATAR_REGISTRY[`${pose}:${facing}`];
  const orderedFrames = roleManifest.frames.map((_, index, frames) => {
    const frameIndex = (index + variant.frameOffset) % frames.length;
    return frames[frameIndex];
  });
  const atlasPath = `/${roleManifest.atlasPath}`;
  return {
    source: "sprite-gen",
    atlasPath,
    motionProfile: roleManifest.motionProfile,
    frames: orderedFrames,
    fps: roleManifest.fps,
    frameWidth: roleManifest.cellWidth,
    frameHeight: roleManifest.cellHeight,
    sheetWidth: roleManifest.sheetWidth,
    sheetHeight: roleManifest.sheetHeight,
    cycleSeconds: orderedFrames.length / roleManifest.fps,
    backgroundImage: `url("${atlasPath}")`,
    backgroundSize: `${roleManifest.sheetWidth}px ${roleManifest.sheetHeight}px`,
    transform: variant.transform,
  };
}
