/**
 * sprite-sheet-config.ts — Sprite sheet configuration types and default config.
 *
 * Defines the layout and animation clip metadata for pixel agent avatar
 * sprite sheets. Each sheet is a grid of fixed-size frames organized into
 * rows of animation clips.
 *
 * Default sheet: 384×240 pixels (8 columns × 5 rows, 48×48 per frame).
 */

// ── Animation Clip ──────────────────────────────────────────────────────────

/**
 * Describes a single animation clip within a sprite sheet row.
 *
 * @property row         - Zero-based row index in the sheet (top = 0).
 * @property startColumn - Zero-based column where the clip begins.
 * @property frameCount  - Number of consecutive frames in the clip.
 * @property fps         - Playback speed in frames per second.
 * @property loop        - Whether the animation loops or stops at the last frame.
 */
export interface SpriteAnimationClip {
  /** Zero-based row index in the sprite sheet (top row = 0). */
  readonly row: number;
  /** Zero-based column where this clip's first frame begins. */
  readonly startColumn: number;
  /** Number of consecutive frames in this animation clip. */
  readonly frameCount: number;
  /** Base playback rate in frames per second. */
  readonly fps: number;
  /** If true the animation loops; if false it stops on the last frame. */
  readonly loop: boolean;
}

// ── Sprite Sheet Config ─────────────────────────────────────────────────────

/**
 * Full configuration for a sprite sheet texture.
 *
 * Combines the physical layout (path, frame dimensions, grid size) with
 * a dictionary of named animation clips that reference rows/columns
 * within the sheet.
 *
 * @property sheetPath   - Import path or URL to the sprite sheet image.
 * @property frameWidth  - Width of a single frame in pixels.
 * @property frameHeight - Height of a single frame in pixels.
 * @property columns     - Number of columns in the sheet grid.
 * @property rows        - Number of rows in the sheet grid.
 * @property animations  - Named animation clips keyed by animation name.
 */
export interface SpriteSheetConfig {
  /** Import path or URL to the sprite sheet image asset. */
  readonly sheetPath: string;
  /** Width of a single frame in pixels (e.g. 48). */
  readonly frameWidth: number;
  /** Height of a single frame in pixels (e.g. 48). */
  readonly frameHeight: number;
  /** Number of columns in the sprite sheet grid. */
  readonly columns: number;
  /** Number of rows in the sprite sheet grid. */
  readonly rows: number;
  /** Named animation clips, keyed by animation name (e.g. "idle", "working"). */
  readonly animations: Record<string, SpriteAnimationClip>;
}

// ── Base Sprite Sheet ──────────────────────────────────────────────────────

/**
 * Base sprite sheet configuration with the canonical 6-clip animation set
 * for pixel agent avatars.
 *
 * Layout: 8 columns × 5 rows, 48×48 pixels per frame (384×240 total).
 *
 * Clips:
 * - idle           — Row 0, Col 0, 4 frames @ 6 fps, loops
 * - work           — Row 1, Col 0, 4 frames @ 8 fps, loops
 * - walk           — Row 2, Col 0, 4 frames @ 8 fps, loops
 * - error-flash    — Row 3, Col 0, 2 frames @ 12 fps, loops
 * - spawn-in       — Row 3, Col 2, 2 frames @ 8 fps, no loop
 * - greyscale-idle — Row 4, Col 0, 4 frames @ 6 fps, loops
 */
export const BASE_SPRITE_SHEET: SpriteSheetConfig = {
  sheetPath: '/textures/agent-sprite-sheet.png',
  frameWidth: 48,
  frameHeight: 48,
  columns: 8,
  rows: 5,
  animations: {
    'idle':            { row: 0, startColumn: 0, frameCount: 4, fps: 6,  loop: true  },
    'work':            { row: 1, startColumn: 0, frameCount: 4, fps: 8,  loop: true  },
    'walk':            { row: 2, startColumn: 0, frameCount: 4, fps: 8,  loop: true  },
    'error-flash':     { row: 3, startColumn: 0, frameCount: 2, fps: 12, loop: true  },
    'spawn-in':        { row: 3, startColumn: 2, frameCount: 2, fps: 8,  loop: false },
    'greyscale-idle':  { row: 4, startColumn: 0, frameCount: 4, fps: 6,  loop: true  },
  },
} as const;
