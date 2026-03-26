/**
 * sprite-row-special.ts — Row 3 special animations (error-flash + spawn-in).
 *
 * Draws chibi pixel-art agent characters across 4 frames in Row 3:
 *
 *   Frame 0 — error-flash: normal character pose (error state base).
 *   Frame 1 — error-flash: same pose with 50% red (#FF0000) tint overlay
 *             blended into every non-transparent pixel.
 *   Frame 2 — spawn-in: character at 50% scale, centered, with sparkle
 *             particles indicating materialisation.
 *   Frame 3 — spawn-in: full-size character with arms raised and residual
 *             sparkles indicating spawn completion.
 *
 * Exported for use by the main generate-sprite-sheets.ts generator.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** RGBA pixel setter: (x, y, r, g, b, a) */
export type PixelSetter = (
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => void;

/** RGBA pixel getter: (x, y) → [r, g, b, a] */
export type PixelGetter = (x: number, y: number) => [number, number, number, number];

/** Role color as [r, g, b] tuple */
export type RoleColor = readonly [number, number, number];

/** Accessory drawer callback */
export type AccessoryDrawer = (
  setPixel: PixelSetter,
  frameX: number,
  frameY: number,
  frame: number,
) => void;

// ── Constants ──────────────────────────────────────────────────────────────

const FRAME_SIZE = 48;
const ROW_INDEX = 3;
const FRAME_COUNT = 4;
const ROW_Y_OFFSET = ROW_INDEX * FRAME_SIZE; // 144

// Skin color (shared chibi palette)
const SKIN: RoleColor = [255, 220, 185];
// Outline / hair
const OUTLINE: RoleColor = [50, 40, 35];
// Eye color
const EYE: RoleColor = [30, 30, 30];

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): RoleColor {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Draw a filled rectangle */
function fillRect(
  setPixel: PixelSetter,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RoleColor,
  alpha = 255,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(x + dx, y + dy, color[0], color[1], color[2], alpha);
    }
  }
}

// ── Role colors ────────────────────────────────────────────────────────────

export const ROLE_COLORS: Record<string, RoleColor> = {
  orchestrator: hexToRgb('#FF7043'),
  implementer: hexToRgb('#66BB6A'),
  researcher: hexToRgb('#AB47BC'),
  reviewer: hexToRgb('#42A5F5'),
  validator: hexToRgb('#EF5350'),
};

// ── Chibi body drawing (full size) ────────────────────────────────────────

/**
 * Draws the shared chibi body for a single frame at full scale.
 * Same proportions as other rows: head 12×12, torso 10×10, legs 4×6.
 */
function drawBodyFull(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  roleColor: RoleColor,
  armState: 'down' | 'both-up' = 'down',
): void {
  const cx = fx + 18;
  const cy = fy + 6;

  // ── Head (12×12) ──
  fillRect(setPixel, cx, cy, 12, 1, OUTLINE);
  fillRect(setPixel, cx, cy + 1, 1, 10, OUTLINE);
  fillRect(setPixel, cx + 11, cy + 1, 1, 10, OUTLINE);
  fillRect(setPixel, cx, cy + 11, 12, 1, OUTLINE);
  // Hair (top 3 rows)
  fillRect(setPixel, cx + 1, cy + 1, 10, 3, OUTLINE);
  // Skin fill
  fillRect(setPixel, cx + 1, cy + 4, 10, 7, SKIN);
  // Eyes (2×2)
  fillRect(setPixel, cx + 3, cy + 6, 2, 2, EYE);
  fillRect(setPixel, cx + 7, cy + 6, 2, 2, EYE);
  // Mouth
  fillRect(setPixel, cx + 5, cy + 9, 2, 1, [180, 120, 100]);

  // ── Torso (10×10) ──
  const tx = fx + 19;
  const ty = fy + 18;
  fillRect(setPixel, tx, ty, 10, 10, roleColor);
  fillRect(setPixel, tx, ty, 10, 1, OUTLINE);
  fillRect(setPixel, tx, ty, 1, 10, OUTLINE);
  fillRect(setPixel, tx + 9, ty, 1, 10, OUTLINE);
  fillRect(setPixel, tx, ty + 9, 10, 1, OUTLINE);

  // ── Arms (3×8 each) ──
  const armY = armState === 'both-up' ? fy + 12 : ty + 1;
  const armH = armState === 'both-up' ? 6 : 8;
  // Left arm
  fillRect(setPixel, tx - 3, armY, 3, armH, roleColor);
  fillRect(setPixel, tx - 3, armY, 1, armH, OUTLINE);
  if (armState === 'both-up') {
    fillRect(setPixel, tx - 3, armY, 3, 2, SKIN); // hand at top
  } else {
    fillRect(setPixel, tx - 3, armY + armH - 2, 3, 2, SKIN);
  }
  // Right arm
  fillRect(setPixel, tx + 10, armY, 3, armH, roleColor);
  fillRect(setPixel, tx + 12, armY, 1, armH, OUTLINE);
  if (armState === 'both-up') {
    fillRect(setPixel, tx + 10, armY, 3, 2, SKIN);
  } else {
    fillRect(setPixel, tx + 10, armY + armH - 2, 3, 2, SKIN);
  }

  // ── Legs (4×6 each) ──
  const ly = fy + 28;
  fillRect(setPixel, tx + 1, ly, 4, 6, [80, 80, 120]);
  fillRect(setPixel, tx + 1, ly, 4, 1, OUTLINE);
  fillRect(setPixel, tx + 1, ly + 5, 4, 1, OUTLINE);
  fillRect(setPixel, tx + 5, ly, 4, 6, [80, 80, 120]);
  fillRect(setPixel, tx + 5, ly, 4, 1, OUTLINE);
  fillRect(setPixel, tx + 5, ly + 5, 4, 1, OUTLINE);
}

// ── Half-size body drawing (50% scale) ────────────────────────────────────

/**
 * Draws a 50%-scale chibi character, centered in the frame.
 *
 * At half scale:
 *   Hair:  7×2 px
 *   Head:  7×6 px (skin)
 *   Eyes:  1×1 px each
 *   Body:  5×5 px (role color)
 *   Legs omitted (still materialising)
 */
function drawBodyHalf(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  roleColor: RoleColor,
): void {
  // Center the half-size figure in the 48×48 frame
  const cx = fx + 24; // horizontal center
  const cy = fy + 18; // vertical center (shifted down for balanced look)

  // Hair (7×2)
  fillRect(setPixel, cx - 3, cy, 7, 2, OUTLINE);
  // Head (7×6, skin)
  fillRect(setPixel, cx - 3, cy + 2, 7, 6, SKIN);
  // Head outline
  setPixel(cx - 3, cy + 2, OUTLINE[0], OUTLINE[1], OUTLINE[2], 255);
  setPixel(cx + 3, cy + 2, OUTLINE[0], OUTLINE[1], OUTLINE[2], 255);
  // Eyes (1×1 each)
  setPixel(cx - 2, cy + 4, EYE[0], EYE[1], EYE[2], 255);
  setPixel(cx + 1, cy + 4, EYE[0], EYE[1], EYE[2], 255);
  // Body (5×5, role color)
  fillRect(setPixel, cx - 2, cy + 8, 5, 5, roleColor);
  // Body outline
  fillRect(setPixel, cx - 2, cy + 8, 5, 1, OUTLINE);
  fillRect(setPixel, cx - 2, cy + 12, 5, 1, OUTLINE);
}

// ── Sparkle effects ──────────────────────────────────────────────────────

/** Draw materialisation sparkles around 50%-scale spawn figure */
function drawSpawnSparkles(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
): void {
  const cx = fx + 24;
  const cy = fy + 18;
  const WHITE: RoleColor = [255, 255, 255];

  // 5 sparkle particles radiating outward
  setPixel(cx - 9, cy - 2, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx + 8, cy + 1, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx - 5, cy + 14, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx + 6, cy + 12, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx, cy - 4, WHITE[0], WHITE[1], WHITE[2], 255);
}

/** Draw residual sparkles around a full-size spawned character */
function drawCompletionSparkles(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
): void {
  const cx = fx + 24;
  const WHITE: RoleColor = [255, 255, 255];

  // 6 sparkle particles around the full-size figure
  setPixel(cx - 12, fy + 8, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx + 11, fy + 12, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx - 8, fy + 30, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx + 8, fy + 6, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx - 10, fy + 20, WHITE[0], WHITE[1], WHITE[2], 255);
  setPixel(cx + 9, fy + 24, WHITE[0], WHITE[1], WHITE[2], 255);
}

// ── Red tint overlay ────────────────────────────────────────────────────

/**
 * Apply a 50% red tint overlay to a rectangular region.
 *
 * For each non-transparent pixel, the RGB channels are blended 50/50
 * with pure red (#FF0000):
 *   R' = min(255, round(R × 0.5 + 255 × 0.5))
 *   G' = round(G × 0.5)
 *   B' = round(B × 0.5)
 *   A' unchanged
 */
function applyRedTint(
  setPixel: PixelSetter,
  getPixel: PixelGetter,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const [r, g, b, a] = getPixel(x, y);
      if (a > 0) {
        setPixel(
          x,
          y,
          Math.min(255, Math.round(r * 0.5 + 255 * 0.5)),
          Math.round(g * 0.5),
          Math.round(b * 0.5),
          a,
        );
      }
    }
  }
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Draw Row 3 (special animations) into the sprite sheet buffer.
 *
 * Renders 4 frames at Row 3 (y = 144..191):
 *   Frame 0: error-flash — normal character pose
 *   Frame 1: error-flash — 50% red tint overlay on all opaque pixels
 *   Frame 2: spawn-in — 50% scale character with sparkles
 *   Frame 3: spawn-in — full-size character with arms raised + sparkles
 *
 * @param setPixel    - Callback to set a pixel at absolute (x, y) in the sheet.
 * @param getPixel    - Callback to read a pixel at absolute (x, y) in the sheet.
 * @param roleColor   - [r, g, b] primary color for the agent role.
 * @param accessoryFn - Optional callback to draw role-specific accessories.
 */
export function drawSpecialRow(
  setPixel: PixelSetter,
  getPixel: PixelGetter,
  roleColor: RoleColor,
  accessoryFn?: AccessoryDrawer,
): void {
  // ── Frame 0: error-flash base (normal pose) ──────────────────────────
  const f0x = 0 * FRAME_SIZE;
  drawBodyFull(setPixel, f0x, ROW_Y_OFFSET, roleColor, 'down');
  if (accessoryFn) accessoryFn(setPixel, f0x, ROW_Y_OFFSET, 0);

  // ── Frame 1: error-flash with 50% red tint ──────────────────────────
  const f1x = 1 * FRAME_SIZE;
  drawBodyFull(setPixel, f1x, ROW_Y_OFFSET, roleColor, 'down');
  if (accessoryFn) accessoryFn(setPixel, f1x, ROW_Y_OFFSET, 1);
  // Apply red overlay to all opaque pixels in frame 1
  applyRedTint(setPixel, getPixel, f1x, ROW_Y_OFFSET, FRAME_SIZE, FRAME_SIZE);

  // ── Frame 2: spawn-in at 50% scale ──────────────────────────────────
  const f2x = 2 * FRAME_SIZE;
  drawBodyHalf(setPixel, f2x, ROW_Y_OFFSET, roleColor);
  drawSpawnSparkles(setPixel, f2x, ROW_Y_OFFSET);

  // ── Frame 3: spawn-in complete (full scale, arms raised) ─────────────
  const f3x = 3 * FRAME_SIZE;
  drawBodyFull(setPixel, f3x, ROW_Y_OFFSET, roleColor, 'both-up');
  if (accessoryFn) accessoryFn(setPixel, f3x, ROW_Y_OFFSET, 3);
  drawCompletionSparkles(setPixel, f3x, ROW_Y_OFFSET);
}

// ── Standalone test ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sprite-row-special.ts')) {
  console.log('sprite-row-special.ts — Row 3 Special Animations');
  console.log(`  Frames: ${FRAME_COUNT}`);
  console.log(`  Row Y offset: ${ROW_Y_OFFSET}px`);
  console.log(`  Frame size: ${FRAME_SIZE}×${FRAME_SIZE}px`);
  console.log('  Layout:');
  console.log('    Frame 0: error-flash — normal pose');
  console.log('    Frame 1: error-flash — 50% red tint overlay');
  console.log('    Frame 2: spawn-in   — 50% scale + sparkles');
  console.log('    Frame 3: spawn-in   — full scale, arms raised + sparkles');
  console.log('');
  console.log('Available roles:');
  for (const [role, color] of Object.entries(ROLE_COLORS)) {
    console.log(`  ${role}: rgb(${color.join(', ')})`);
  }
}
