import React, { useRef, useEffect } from "react";
import type { AgentOfficeProfile } from "../agent-profiles.js";
import { drawPixelAvatar } from "../pixel-canvas-avatar.js";
import type { OfficeAvatarFacing, OfficeAvatarPose } from "../office-avatar-sprites.js";
import stageStyles from "../office-stage.module.css";

const AVATAR_SCALE = 4;
const AVATAR_W = 24;
const AVATAR_H = 32;

export function OfficeAvatar({
  profile,
  label,
  selected = false,
  pose,
  facing,
}: {
  profile: AgentOfficeProfile;
  label: string;
  selected?: boolean;
  pose?: OfficeAvatarPose;
  facing?: OfficeAvatarFacing;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPixelAvatar(ctx, profile.role, AVATAR_SCALE);
  }, [profile.role]);

  return (
    <span
      className={[
        stageStyles["office-pixel-avatar"],
        selected ? stageStyles.selected : "",
      ].filter(Boolean).join(" ")}
      style={{ "--office-accent": profile.accent } as React.CSSProperties}
      title={`${label} / ${profile.archetype}`}
    >
      <canvas
        ref={canvasRef}
        width={AVATAR_W * AVATAR_SCALE}
        height={AVATAR_H * AVATAR_SCALE}
        style={{
          width: `${AVATAR_W}px`,
          height: `${AVATAR_H}px`,
          imageRendering: "pixelated",
        }}
        aria-hidden="true"
      />
      <span className={stageStyles["office-pixel-mark"]}>{profile.mark}</span>
    </span>
  );
}
