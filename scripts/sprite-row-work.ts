/**
 * sprite-row-work.ts — Row 1 work animation (4 frames, alternating arm positions).
 *
 * Draws chibi pixel-art agent characters in a "working" pose across 4 frames.
 * Arms alternate between raised/lowered positions to simulate typing or tool use.
 *
 * Frame layout (48×48 each, placed in Row 1 = y offset 48):
 *   Frame 0: Right arm up, left arm down (working stroke)
 *   Frame 1: Both arms mid (neutral)
 *   Frame 2: Left arm up, right arm down (working stroke mirror)
 *   Frame 3: Both arms mid (neutral, same as frame 1)
 *
 * Exported for use by the main generate-sprite-sheets.ts generator.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** RGBA pixel setter: (x, y, r, g, b, a) */
export type PixelSetter = (
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => void;

/** Role color as [r, g, b] tuple */
export type RoleColor = readonly [number, number, number];

/** Accessory drawer callback — called after body is drawn for each frame */
export type AccessoryDrawer = (
  setPixel: PixelSetter,
  frameX: number,
  frameY: number,
  frame: number,
) => void;

// ── Constants ─────────────────────────────────────────────────────────────────

const FRAME_SIZE = 48;
const ROW_INDEX = 1;
const FRAME_COUNT = 4;
const ROW_Y_OFFSET = ROW_INDEX * FRAME_SIZE; // 48

// Skin color (shared chibi palette)
const SKIN: RoleColor = [255, 220, 185];
// Outline / hair
const OUTLINE: RoleColor = [50, 40, 35];
// Eye color
const EYE: RoleColor = [30, 30, 30];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Role colors ───────────────────────────────────────────────────────────────

export const ROLE_COLORS: Record<string, RoleColor> = {
  orchestrator: hexToRgb('#FF7043'),
  implementer: hexToRgb('#66BB6A'),
  researcher: hexToRgb('#AB47BC'),
  reviewer: hexToRgb('#42A5F5'),
  validator: hexToRgb('#EF5350'),
};

// ── Chibi body drawing ────────────────────────────────────────────────────────

/**
 * Draws the shared chibi body (head, eyes, torso, legs) for a single frame.
 * The body is ~24px wide, ~36px tall, centered in the 48×48 frame.
 *
 * Body proportions (chibi = big head, small body):
 *   Head:  12×12 px (rows 6–17 in frame)
 *   Body:  10×10 px (rows 18–27)
 *   Legs:   4×6 px each (rows 28–33)
 */
function drawBody(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  roleColor: RoleColor,
): void {
  // Center offset within 48×48 frame
  const cx = fx + 18; // body starts at x=18 (12px wide head centered → 18..29)
  const cy = fy + 6;  // top of head at y=6

  // ── Head (12×12) ──
  // Outline top
  fillRect(setPixel, cx, cy, 12, 1, OUTLINE);
  // Outline sides
  fillRect(setPixel, cx, cy + 1, 1, 10, OUTLINE);
  fillRect(setPixel, cx + 11, cy + 1, 1, 10, OUTLINE);
  // Outline bottom
  fillRect(setPixel, cx, cy + 11, 12, 1, OUTLINE);
  // Hair (top 3 rows inside head)
  fillRect(setPixel, cx + 1, cy + 1, 10, 3, OUTLINE);
  // Skin fill
  fillRect(setPixel, cx + 1, cy + 4, 10, 7, SKIN);
  // Eyes (2px squares, looking slightly down for "work" focus)
  fillRect(setPixel, cx + 3, cy + 6, 2, 2, EYE);
  fillRect(setPixel, cx + 7, cy + 6, 2, 2, EYE);
  // Mouth (small line, concentrating)
  fillRect(setPixel, cx + 5, cy + 9, 2, 1, [180, 120, 100]);

  // ── Torso (10×10 in role color) ──
  const tx = fx + 19; // centered under head
  const ty = fy + 18;
  fillRect(setPixel, tx, ty, 10, 10, roleColor);
  // Torso outline
  fillRect(setPixel, tx, ty, 10, 1, OUTLINE);       // top
  fillRect(setPixel, tx, ty, 1, 10, OUTLINE);        // left
  fillRect(setPixel, tx + 9, ty, 1, 10, OUTLINE);    // right
  fillRect(setPixel, tx, ty + 9, 10, 1, OUTLINE);    // bottom

  // ── Legs (two 4×6 blocks) ──
  const ly = fy + 28;
  // Left leg
  fillRect(setPixel, tx + 1, ly, 4, 6, [80, 80, 120]);
  fillRect(setPixel, tx + 1, ly, 4, 1, OUTLINE);
  fillRect(setPixel, tx + 1, ly + 5, 4, 1, OUTLINE);
  // Right leg
  fillRect(setPixel, tx + 5, ly, 4, 6, [80, 80, 120]);
  fillRect(setPixel, tx + 5, ly, 4, 1, OUTLINE);
  fillRect(setPixel, tx + 5, ly + 5, 4, 1, OUTLINE);
}

// ── Arm drawing ──────────────────────────────────────────────────────────────

/**
 * Draw an arm at a given position.
 * @param raised - if true, arm is raised (elbow up, hand at head level);
 *                 if false, arm hangs down at torso side.
 */
function drawArm(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  side: 'left' | 'right',
  raised: boolean,
  roleColor: RoleColor,
): void {
  // Arm is 3px wide, 8px tall (or angled when raised)
  const torsoLeft = fx + 19;
  const torsoRight = fx + 28; // torso right edge (19+9)
  const torsoTop = fy + 18;

  if (side === 'left') {
    const ax = torsoLeft - 3; // arm to the left of torso
    if (raised) {
      // Raised: arm goes up from shoulder (y=18) to y=12, 3px wide
      fillRect(setPixel, ax, fy + 12, 3, 6, roleColor);
      fillRect(setPixel, ax, fy + 12, 3, 1, OUTLINE);
      fillRect(setPixel, ax, fy + 12, 1, 6, OUTLINE);
      // Hand (skin) at top
      fillRect(setPixel, ax, fy + 12, 3, 2, SKIN);
    } else {
      // Down: arm hangs from shoulder level
      fillRect(setPixel, ax, torsoTop + 1, 3, 8, roleColor);
      fillRect(setPixel, ax, torsoTop + 1, 1, 8, OUTLINE);
      fillRect(setPixel, ax, torsoTop + 8, 3, 1, OUTLINE);
      // Hand at bottom
      fillRect(setPixel, ax, torsoTop + 7, 3, 2, SKIN);
    }
  } else {
    const ax = torsoRight; // arm to the right of torso
    if (raised) {
      fillRect(setPixel, ax, fy + 12, 3, 6, roleColor);
      fillRect(setPixel, ax, fy + 12, 3, 1, OUTLINE);
      fillRect(setPixel, ax + 2, fy + 12, 1, 6, OUTLINE);
      // Hand at top
      fillRect(setPixel, ax, fy + 12, 3, 2, SKIN);
    } else {
      fillRect(setPixel, ax, torsoTop + 1, 3, 8, roleColor);
      fillRect(setPixel, ax + 2, torsoTop + 1, 1, 8, OUTLINE);
      fillRect(setPixel, ax, torsoTop + 8, 3, 1, OUTLINE);
      // Hand at bottom
      fillRect(setPixel, ax, torsoTop + 7, 3, 2, SKIN);
    }
  }
}

// ── Tool / work object ───────────────────────────────────────────────────────

/**
 * Draw a small tool or work indicator near the raised hand.
 * This gives visual feedback that the character is actively working.
 */
function drawWorkTool(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  frame: number,
): void {
  // Small sparkle/tool near the active hand side
  // Frames 0,2 have the tool on alternating sides; frames 1,3 show small sparkle center
  if (frame === 0) {
    // Tool on right side (right arm raised)
    const tx = fx + 32;
    const ty = fy + 10;
    fillRect(setPixel, tx, ty, 2, 2, [255, 255, 100]); // yellow sparkle
    fillRect(setPixel, tx + 1, ty + 1, 1, 1, [255, 255, 255]);
  } else if (frame === 2) {
    // Tool on left side (left arm raised)
    const tx = fx + 14;
    const ty = fy + 10;
    fillRect(setPixel, tx, ty, 2, 2, [255, 255, 100]);
    fillRect(setPixel, tx, ty, 1, 1, [255, 255, 255]);
  } else {
    // Neutral frames — small center sparkle
    const tx = fx + 23;
    const ty = fy + 14;
    fillRect(setPixel, tx, ty, 2, 2, [255, 255, 200], 180);
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Draw Row 1 (work animation) into the sprite sheet buffer.
 *
 * Renders 4 frames at Row 1 (y = 48..95) with alternating arm positions:
 *   Frame 0: right arm raised, left arm down
 *   Frame 1: both arms mid (neutral)
 *   Frame 2: left arm raised, right arm down
 *   Frame 3: both arms mid (neutral)
 *
 * @param setPixel  - Callback to set a pixel at absolute (x, y) in the sheet.
 * @param roleColor - [r, g, b] primary color for the agent role.
 * @param accessoryFn - Optional callback to draw role-specific accessories.
 */
export function drawWorkRow(
  setPixel: PixelSetter,
  roleColor: RoleColor,
  accessoryFn?: AccessoryDrawer,
): void {
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const fx = frame * FRAME_SIZE; // frame x offset in sheet
    const fy = ROW_Y_OFFSET;       // row 1 → y=48

    // Draw the base body
    drawBody(setPixel, fx, fy, roleColor);

    // Draw arms based on frame
    switch (frame) {
      case 0:
        // Right arm raised, left arm down
        drawArm(setPixel, fx, fy, 'right', true, roleColor);
        drawArm(setPixel, fx, fy, 'left', false, roleColor);
        break;
      case 1:
        // Both arms at rest (neutral working pose)
        drawArm(setPixel, fx, fy, 'right', false, roleColor);
        drawArm(setPixel, fx, fy, 'left', false, roleColor);
        break;
      case 2:
        // Left arm raised, right arm down
        drawArm(setPixel, fx, fy, 'left', true, roleColor);
        drawArm(setPixel, fx, fy, 'right', false, roleColor);
        break;
      case 3:
        // Both arms at rest (neutral working pose)
        drawArm(setPixel, fx, fy, 'right', false, roleColor);
        drawArm(setPixel, fx, fy, 'left', false, roleColor);
        break;
    }

    // Draw work sparkle / tool indicator
    drawWorkTool(setPixel, fx, fy, frame);

    // Draw role-specific accessories if provided
    if (accessoryFn) {
      accessoryFn(setPixel, fx, fy, frame);
    }
  }
}

// ── Standalone test render (can run via tsx) ──────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sprite-row-work.ts')) {
  // Quick visual verification — prints frame bounding info
  console.log('sprite-row-work.ts — Row 1 Work Animation');
  console.log(`  Frames: ${FRAME_COUNT}`);
  console.log(`  Row Y offset: ${ROW_Y_OFFSET}px`);
  console.log(`  Frame size: ${FRAME_SIZE}×${FRAME_SIZE}px`);
  console.log('  Arm pattern: [R-up/L-down] [neutral] [L-up/R-down] [neutral]');
  console.log('');
  console.log('Available roles:');
  for (const [role, color] of Object.entries(ROLE_COLORS)) {
    console.log(`  ${role}: rgb(${color.join(', ')})`);
  }
}
