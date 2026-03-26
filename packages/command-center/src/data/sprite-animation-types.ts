/**
 * sprite-animation-types.ts — Status-to-animation mapping entry type.
 *
 * Maps an agent status (idle, working, error, etc.) to a named animation row
 * in the sprite sheet, with a speed multiplier controlling playback rate.
 *
 * Part of the sprite sheet configuration system for pixel agent avatars.
 */

// ── Status Animation Entry ───────────────────────────────────────────────────

/**
 * Maps a single agent status to its sprite-sheet animation parameters.
 *
 * @property animation  - Name of the animation row in the sprite sheet
 *                        (e.g. "idle", "working", "error", "success", "offline").
 * @property speedMultiplier - Playback speed factor. 1.0 = normal speed,
 *                             0 = frozen (no frame advance), 2.0 = double speed.
 */
export interface StatusAnimationEntry {
  /** Animation row name matching a key in SpriteSheetConfig.animations. */
  readonly animation: string;

  /**
   * Multiplier applied to the base frame rate.
   * - 0   → animation is frozen (no frame advance).
   * - 1.0 → normal playback speed.
   * - >1  → faster playback.
   */
  readonly speedMultiplier: number;
}

// ── Agent Status ────────────────────────────────────────────────────────────

/**
 * All recognised agent statuses for the command center.
 */
export type AgentStatus = 'inactive' | 'idle' | 'active' | 'busy' | 'error' | 'terminated';

// ── Status → Animation Map ──────────────────────────────────────────────────

/**
 * Maps every {@link AgentStatus} to a sprite-sheet animation clip name
 * and a speed multiplier controlling playback rate.
 *
 * | Status       | Animation       | Speed |
 * |------------- |---------------- |-------|
 * | inactive     | greyscale-idle  | 0.5   |
 * | idle         | idle            | 1     |
 * | active       | work            | 1     |
 * | busy         | work            | 1.5   |
 * | error        | error-flash     | 1     |
 * | terminated   | greyscale-idle  | 0     |
 */
export const STATUS_ANIMATION_MAP: Readonly<Record<AgentStatus, StatusAnimationEntry>> = {
  inactive:   { animation: 'greyscale-idle', speedMultiplier: 0.5 },
  idle:       { animation: 'idle',           speedMultiplier: 1   },
  active:     { animation: 'work',           speedMultiplier: 1   },
  busy:       { animation: 'work',           speedMultiplier: 1.5 },
  error:      { animation: 'error-flash',    speedMultiplier: 1   },
  terminated: { animation: 'greyscale-idle', speedMultiplier: 0   },
};
