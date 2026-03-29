import React, { useRef, useEffect } from "react";
import type { AgentOfficeRole } from "../agent-profiles.ts";
import { drawPixelAvatar } from "../pixel-canvas-avatar.js";

const PORTRAIT_SCALE = 6;
const AVATAR_W = 24;
const AVATAR_H = 32;

export function OfficeCanonicalPortrait({
  role,
  label,
  className,
}: {
  role: AgentOfficeRole;
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPixelAvatar(ctx, role, PORTRAIT_SCALE);
  }, [role]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      title={label}
      aria-label={label}
      width={AVATAR_W * PORTRAIT_SCALE}
      height={AVATAR_H * PORTRAIT_SCALE}
      style={{
        width: "48px",
        height: "64px",
        imageRendering: "pixelated",
      }}
    />
  );
}
