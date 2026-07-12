import React from "react";
import type { AgentOfficeProfile } from "../agent-profiles.js";
import {
  resolveOfficeAvatarSprite,
  type OfficeAvatarFacing,
  type OfficeAvatarPose,
} from "../office-avatar-sprites.js";
import type { AgentMotionProfile } from "../agent-sprite-manifest.generated.js";
import stageStyles from "../office-stage.module.css";

const DEFAULT_SPRITE_DISPLAY_SCALE = 2;

export function OfficeAvatar({
  profile,
  label,
  selected = false,
  pose,
  facing,
  motionProfile,
  displayScale = DEFAULT_SPRITE_DISPLAY_SCALE,
}: {
  profile: AgentOfficeProfile;
  label: string;
  selected?: boolean;
  pose?: OfficeAvatarPose;
  facing?: OfficeAvatarFacing;
  motionProfile?: AgentMotionProfile;
  displayScale?: 2 | 3 | 4;
}) {
  const sprite = resolveOfficeAvatarSprite({ role: profile.role, pose, facing });
  const activeMotionProfile = motionProfile ?? sprite.motionProfile;

  return (
    <span
      className={[
        stageStyles["office-pixel-avatar"],
        selected ? stageStyles.selected : "",
      ].filter(Boolean).join(" ")}
      data-agent-avatar-source="sprite-gen"
      data-agent-role={profile.role}
      data-motion-profile={activeMotionProfile}
      style={
        {
          "--office-accent": profile.accent,
          "--agent-cycle-duration": `${sprite.cycleSeconds.toFixed(3)}s`,
          "--agent-frame-count": sprite.frames.length,
          "--agent-frame-width": `${sprite.frameWidth * displayScale}px`,
          "--agent-frame-height": `${sprite.frameHeight * displayScale}px`,
          "--agent-base-transform": sprite.transform ?? "translateX(0)",
        } as React.CSSProperties
      }
      title={`${label} / ${profile.archetype}`}
    >
      <span className={stageStyles["agent-sprite-frame-stack"]} aria-hidden="true">
        {sprite.frames.map((frame, index) => (
          <span
            key={`${frame.x}-${frame.y}-${index}`}
            className={stageStyles["agent-sprite-frame"]}
            style={
              {
                "--agent-frame-index": index,
                animationDelay: `${-(sprite.cycleSeconds / sprite.frames.length) * index}s`,
                backgroundImage: sprite.backgroundImage,
                backgroundPosition: `-${frame.x * displayScale}px -${frame.y * displayScale}px`,
                backgroundSize: `${sprite.sheetWidth * displayScale}px ${sprite.sheetHeight * displayScale}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
      <span className={stageStyles["office-pixel-mark"]}>{profile.mark}</span>
    </span>
  );
}
