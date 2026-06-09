export const PIXEL_STATUS_TONES = [
  "live",
  "active",
  "review",
  "blocked",
  "idle",
  "success",
] as const;

export type PixelStatusTone = (typeof PIXEL_STATUS_TONES)[number];

export interface PixelStatusToken {
  label: string;
  cssVar: string;
  foregroundVar: string;
  borderVar: string;
}

export const PIXEL_STATUS_TOKENS: Record<PixelStatusTone, PixelStatusToken> = {
  live: {
    label: "live",
    cssVar: "--spatial-accent-live",
    foregroundVar: "--spatial-accent-live-ink",
    borderVar: "--spatial-accent-live-border",
  },
  active: {
    label: "active",
    cssVar: "--spatial-accent-active",
    foregroundVar: "--spatial-accent-active-ink",
    borderVar: "--spatial-accent-active-border",
  },
  review: {
    label: "review",
    cssVar: "--spatial-accent-review",
    foregroundVar: "--spatial-accent-review-ink",
    borderVar: "--spatial-accent-review-border",
  },
  blocked: {
    label: "blocked",
    cssVar: "--spatial-accent-blocked",
    foregroundVar: "--spatial-accent-blocked-ink",
    borderVar: "--spatial-accent-blocked-border",
  },
  idle: {
    label: "idle",
    cssVar: "--spatial-accent-idle",
    foregroundVar: "--spatial-accent-idle-ink",
    borderVar: "--spatial-accent-idle-border",
  },
  success: {
    label: "success",
    cssVar: "--spatial-accent-success",
    foregroundVar: "--spatial-accent-success-ink",
    borderVar: "--spatial-accent-success-border",
  },
};

export const PIXEL_THEME_TOKEN_NAMES = [
  "--spatial-bg-shell",
  "--spatial-bg-floor",
  "--spatial-bg-panel",
  "--spatial-border-strong",
  "--spatial-border-muted",
  "--spatial-text-strong",
  "--spatial-text-muted",
  "--spatial-shadow-hard",
  "--spatial-accent-live",
  "--spatial-accent-active",
  "--spatial-accent-review",
  "--spatial-accent-blocked",
  "--spatial-accent-idle",
  "--spatial-accent-success",
] as const;

const STATUS_TONE_BY_STATE: Record<string, PixelStatusTone> = {
  live: "live",
  running: "live",
  active: "active",
  working: "active",
  success: "success",
  completed: "success",
  complete: "success",
  done: "success",
  passed: "success",
  review: "review",
  reviewing: "review",
  assigned: "review",
  waiting: "review",
  blocked: "blocked",
  error: "blocked",
  failed: "blocked",
  failure: "blocked",
  idle: "idle",
  quiet: "idle",
  neutral: "idle",
  planned: "idle",
  draft: "idle",
  cancelled: "idle",
  terminated: "idle",
};

export function normalizePixelStatusTone(state: string | null | undefined): PixelStatusTone {
  return STATUS_TONE_BY_STATE[(state ?? "").trim().toLowerCase()] ?? "idle";
}
