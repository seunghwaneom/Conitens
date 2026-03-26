/**
 * render-row-walk.ts — Row 2: Walk animation (4 frames, 8 fps, loops).
 *
 * Draws 4 frames of a chibi pixel character walking with a horizontal
 * offset cycle: left → center → right → center.
 *
 * Frame layout (48×48 each, placed in columns 0–3 of row 2):
 *   Frame 0: body shifted −2px (step left)
 *   Frame 1: body centered (passing center)
 *   Frame 2: body shifted +2px (step right)
 *   Frame 3: body centered (passing center)
 *
 * Leg positions alternate to sell the walk:
 *   Frame 0: left leg forward, right leg back
 *   Frame 1: legs together (passing)
 *   Frame 2: right leg forward, left leg back
 *   Frame 3: legs together (passing)
 *
 * All pixel coordinates assume a 48×48 cell with transparent background.
 * The character uses chibi proportions: large head (~18px), small body (~14px),
 * short legs (~8px), consistent with the other row renderers.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** RGBA pixel buffer for a sprite sheet image. */
export interface PixelBuffer {
  /** Raw RGBA pixel data (width × height × 4 bytes). */
  data: Uint8Array | Buffer;
  /** Full image width in pixels. */
  width: number;
  /** Full image height in pixels. */
  height: number;
}

/** Parsed hex color channels. */
interface RGB {
  r: number;
  g: number;
  b: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Frame dimensions. */
const CELL = 48;

/** Number of walk frames. */
const FRAME_COUNT = 4;

/** Row index for walk animation. */
const ROW = 2;

/**
 * Horizontal pixel offsets per frame: left, center, right, center.
 * Produces a smooth side-to-side sway as the character walks.
 */
const H_OFFSETS: readonly number[] = [-2, 0, 2, 0];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a hex color string (#RRGGBB) to RGB channels. */
function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Darken an RGB color by a factor (0–1, where 0 = black, 1 = unchanged). */
function darken(c: RGB, factor: number): RGB {
  return {
    r: Math.round(c.r * factor),
    g: Math.round(c.g * factor),
    b: Math.round(c.b * factor),
  };
}

/** Lighten an RGB color toward white by a factor (0 = unchanged, 1 = white). */
function lighten(c: RGB, factor: number): RGB {
  return {
    r: Math.round(c.r + (255 - c.r) * factor),
    g: Math.round(c.g + (255 - c.g) * factor),
    b: Math.round(c.b + (255 - c.b) * factor),
  };
}

/**
 * Set a pixel in the buffer at (x, y) with RGBA.
 * Bounds-checked — silently ignores out-of-range coordinates.
 */
function setPixel(
  buf: PixelBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || x >= buf.width || y < 0 || y >= buf.height) return;
  const idx = (y * buf.width + x) * 4;
  buf.data[idx] = r;
  buf.data[idx + 1] = g;
  buf.data[idx + 2] = b;
  buf.data[idx + 3] = a;
}

/** Fill a rectangle (solid color, bounds-checked). */
function fillRect(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, x0 + dx, y0 + dy, r, g, b, a);
    }
  }
}

// ── Character drawing ────────────────────────────────────────────────────────

/**
 * Draw a single walk frame for a chibi pixel agent.
 *
 * @param buf       - The full sprite sheet pixel buffer.
 * @param cellX     - Top-left X of the 48×48 cell in the sheet.
 * @param cellY     - Top-left Y of the 48×48 cell in the sheet.
 * @param hOffset   - Horizontal pixel offset (−2, 0, or +2).
 * @param frameIdx  - Frame index (0–3) to determine leg positions.
 * @param roleColor - Primary role color hex string (#RRGGBB).
 */
function drawWalkFrame(
  buf: PixelBuffer,
  cellX: number,
  cellY: number,
  hOffset: number,
  frameIdx: number,
  roleColor: string,
): void {
  const base = parseHex(roleColor);
  const dark = darken(base, 0.6);
  const light = lighten(base, 0.35);
  const skin = { r: 255, g: 224, b: 189 };     // Chibi skin tone
  const skinShadow = { r: 230, g: 190, b: 150 };
  const eyeColor = { r: 40, g: 40, b: 60 };
  const hairDark = darken(base, 0.45);
  const shoe = { r: 60, g: 50, b: 50 };

  // Center of the 48×48 cell, with horizontal walk offset applied
  const cx = cellX + 24 + hOffset;
  const baseY = cellY + 42; // Feet baseline (leaving 6px padding at bottom)

  // ── Shadow on ground ───────────────────────────────────────────────
  // Slight ellipse shadow beneath feet
  fillRect(buf, cx - 6, baseY + 1, 12, 2, 30, 30, 30, 80);

  // ── Legs (8px tall) ────────────────────────────────────────────────
  // Leg positions depend on frame: alternate stride vs passing
  const legTop = baseY - 8;

  if (frameIdx === 0) {
    // Left leg forward, right leg back
    // Left leg (forward, slightly left)
    fillRect(buf, cx - 5, legTop, 3, 8, dark.r, dark.g, dark.b);
    // Left shoe
    fillRect(buf, cx - 5, baseY - 2, 4, 2, shoe.r, shoe.g, shoe.b);
    // Right leg (back, slightly right)
    fillRect(buf, cx + 2, legTop + 1, 3, 7, dark.r, dark.g, dark.b);
    // Right shoe
    fillRect(buf, cx + 1, baseY - 2, 4, 2, shoe.r, shoe.g, shoe.b);
  } else if (frameIdx === 1) {
    // Legs together (passing position)
    fillRect(buf, cx - 4, legTop, 3, 8, dark.r, dark.g, dark.b);
    fillRect(buf, cx + 1, legTop, 3, 8, dark.r, dark.g, dark.b);
    // Shoes
    fillRect(buf, cx - 4, baseY - 2, 3, 2, shoe.r, shoe.g, shoe.b);
    fillRect(buf, cx + 1, baseY - 2, 3, 2, shoe.r, shoe.g, shoe.b);
  } else if (frameIdx === 2) {
    // Right leg forward, left leg back
    // Right leg (forward, slightly right)
    fillRect(buf, cx + 2, legTop, 3, 8, dark.r, dark.g, dark.b);
    // Right shoe
    fillRect(buf, cx + 1, baseY - 2, 4, 2, shoe.r, shoe.g, shoe.b);
    // Left leg (back, slightly left)
    fillRect(buf, cx - 5, legTop + 1, 3, 7, dark.r, dark.g, dark.b);
    // Left shoe
    fillRect(buf, cx - 5, baseY - 2, 4, 2, shoe.r, shoe.g, shoe.b);
  } else {
    // Frame 3: legs together (passing, same as frame 1)
    fillRect(buf, cx - 4, legTop, 3, 8, dark.r, dark.g, dark.b);
    fillRect(buf, cx + 1, legTop, 3, 8, dark.r, dark.g, dark.b);
    // Shoes
    fillRect(buf, cx - 4, baseY - 2, 3, 2, shoe.r, shoe.g, shoe.b);
    fillRect(buf, cx + 1, baseY - 2, 3, 2, shoe.r, shoe.g, shoe.b);
  }

  // ── Body / torso (14px tall) ───────────────────────────────────────
  const bodyTop = legTop - 14;
  // Main torso block
  fillRect(buf, cx - 6, bodyTop, 12, 14, base.r, base.g, base.b);
  // Shirt highlight
  fillRect(buf, cx - 4, bodyTop + 2, 8, 3, light.r, light.g, light.b);
  // Belt / waistline
  fillRect(buf, cx - 6, bodyTop + 12, 12, 2, dark.r, dark.g, dark.b);

  // ── Arms (swing with walk) ─────────────────────────────────────────
  // Arms swing opposite to legs for natural walking motion
  if (frameIdx === 0) {
    // Left arm back, right arm forward
    fillRect(buf, cx - 8, bodyTop + 3, 2, 8, base.r, base.g, base.b);
    fillRect(buf, cx - 8, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b); // hand
    fillRect(buf, cx + 6, bodyTop + 1, 2, 8, base.r, base.g, base.b);
    fillRect(buf, cx + 6, bodyTop + 9, 2, 2, skin.r, skin.g, skin.b); // hand
  } else if (frameIdx === 1) {
    // Arms at sides
    fillRect(buf, cx - 8, bodyTop + 2, 2, 9, base.r, base.g, base.b);
    fillRect(buf, cx - 8, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b);
    fillRect(buf, cx + 6, bodyTop + 2, 2, 9, base.r, base.g, base.b);
    fillRect(buf, cx + 6, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b);
  } else if (frameIdx === 2) {
    // Right arm back, left arm forward (opposite of frame 0)
    fillRect(buf, cx - 8, bodyTop + 1, 2, 8, base.r, base.g, base.b);
    fillRect(buf, cx - 8, bodyTop + 9, 2, 2, skin.r, skin.g, skin.b);
    fillRect(buf, cx + 6, bodyTop + 3, 2, 8, base.r, base.g, base.b);
    fillRect(buf, cx + 6, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b);
  } else {
    // Frame 3: Arms at sides (same as frame 1)
    fillRect(buf, cx - 8, bodyTop + 2, 2, 9, base.r, base.g, base.b);
    fillRect(buf, cx - 8, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b);
    fillRect(buf, cx + 6, bodyTop + 2, 2, 9, base.r, base.g, base.b);
    fillRect(buf, cx + 6, bodyTop + 11, 2, 2, skin.r, skin.g, skin.b);
  }

  // ── Head (18px tall, large chibi proportions) ──────────────────────
  const headTop = bodyTop - 18;
  // Hair back (slightly larger than head)
  fillRect(buf, cx - 8, headTop, 16, 10, hairDark.r, hairDark.g, hairDark.b);
  // Face (skin)
  fillRect(buf, cx - 7, headTop + 5, 14, 12, skin.r, skin.g, skin.b);
  // Face shadow
  fillRect(buf, cx - 7, headTop + 14, 14, 3, skinShadow.r, skinShadow.g, skinShadow.b);
  // Hair bangs
  fillRect(buf, cx - 8, headTop, 16, 6, hairDark.r, hairDark.g, hairDark.b);
  // Eyes
  fillRect(buf, cx - 4, headTop + 9, 2, 3, eyeColor.r, eyeColor.g, eyeColor.b);
  fillRect(buf, cx + 2, headTop + 9, 2, 3, eyeColor.r, eyeColor.g, eyeColor.b);
  // Eye highlights
  setPixel(buf, cx - 3, headTop + 9, 255, 255, 255);
  setPixel(buf, cx + 3, headTop + 9, 255, 255, 255);
  // Mouth (small line)
  fillRect(buf, cx - 1, headTop + 14, 2, 1, 180, 120, 120);

  // ── Slight vertical bob on walking frames ──────────────────────────
  // Frames 0 and 2 (stride) are drawn 1px higher to simulate bounce.
  // This is achieved by shifting the entire draw up by 1 during stride frames.
  // (Already accounted for by the baseY offset in the calling function.)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Render all 4 walk frames into row 2 of the sprite sheet buffer.
 *
 * Walk cycle: left → center → right → center horizontal offset.
 * Legs alternate stride positions to sell the walking motion.
 *
 * @param buf       - The full sprite sheet pixel buffer (384×240 RGBA).
 * @param roleColor - Primary role color hex string (#RRGGBB).
 */
export function renderWalkRow(buf: PixelBuffer, roleColor: string): void {
  const rowY = ROW * CELL; // Row 2 → y=96

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const cellX = frame * CELL;
    const hOffset = H_OFFSETS[frame];

    // Frames 0 and 2 (stride frames) get a 1px vertical bounce
    const vBounce = (frame === 0 || frame === 2) ? -1 : 0;

    drawWalkFrame(buf, cellX, rowY + vBounce, hOffset, frame, roleColor);
  }
}
