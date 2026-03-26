/**
 * sprite-row-walk.ts — Row 2 walk animation (4 frames, horizontal offset cycle).
 *
 * Draws chibi pixel-art agent characters in a walking pose across 4 frames.
 * The character shifts horizontally to simulate lateral movement, with
 * alternating leg positions for a proper walk cycle.
 *
 * Frame layout (48x48 each, placed in Row 2 = y offset 96):
 *   Frame 0: left position  (xOffset = -2), left leg forward
 *   Frame 1: center position (xOffset =  0), legs neutral (passing)
 *   Frame 2: right position (xOffset = +2), right leg forward
 *   Frame 3: center position (xOffset =  0), legs neutral (passing)
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
const ROW_INDEX = 2;
const FRAME_COUNT = 4;
const ROW_Y_OFFSET = ROW_INDEX * FRAME_SIZE; // 96

// Skin color (shared chibi palette)
const SKIN: RoleColor = [255, 220, 185];
// Outline / hair
const OUTLINE: RoleColor = [50, 40, 35];
// Eye color
const EYE: RoleColor = [30, 30, 30];

// Horizontal offset cycle: left, center, right, center
const X_OFFSETS = [-2, 0, 2, 0] as const;

// Leg states per frame: which leg is forward in the walk cycle
type LegState = 'left-forward' | 'neutral' | 'right-forward';
const LEG_STATES: readonly LegState[] = [
  'left-forward',  // Frame 0: stepping left, left leg forward
  'neutral',       // Frame 1: passing through center
  'right-forward', // Frame 2: stepping right, right leg forward
  'neutral',       // Frame 3: passing through center
];

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

// ── Chibi body drawing (walk variant) ────────────────────────────────────────

/**
 * Draws the shared chibi body for a single walk frame.
 *
 * Same proportions as other rows: head 12x12, torso 10x10, legs 4x6.
 * The entire character is shifted by `xOffset` pixels horizontally,
 * and legs are drawn in the specified walk state.
 *
 * Body proportions (chibi = big head, small body):
 *   Head:  12x12 px (rows 6-17 in frame)
 *   Body:  10x10 px (rows 18-27)
 *   Legs:   4x6 px each (rows 28-33)
 */
function drawWalkBody(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  roleColor: RoleColor,
  xOffset: number,
  legState: LegState,
): void {
  // Center offset within 48x48 frame, with horizontal walk shift
  const cx = fx + 18 + xOffset;
  const cy = fy + 6;

  // ── Head (12x12) ──
  fillRect(setPixel, cx, cy, 12, 1, OUTLINE);
  fillRect(setPixel, cx, cy + 1, 1, 10, OUTLINE);
  fillRect(setPixel, cx + 11, cy + 1, 1, 10, OUTLINE);
  fillRect(setPixel, cx, cy + 11, 12, 1, OUTLINE);
  // Hair (top 3 rows inside head)
  fillRect(setPixel, cx + 1, cy + 1, 10, 3, OUTLINE);
  // Skin fill
  fillRect(setPixel, cx + 1, cy + 4, 10, 7, SKIN);
  // Eyes (2x2 each, looking in direction of movement)
  const eyeShift = xOffset > 0 ? 1 : xOffset < 0 ? -1 : 0;
  fillRect(setPixel, cx + 3 + eyeShift, cy + 6, 2, 2, EYE);
  fillRect(setPixel, cx + 7 + eyeShift, cy + 6, 2, 2, EYE);
  // Mouth (small line)
  fillRect(setPixel, cx + 5, cy + 9, 2, 1, [180, 120, 100]);

  // ── Torso (10x10 in role color) ──
  const tx = fx + 19 + xOffset;
  const ty = fy + 18;
  fillRect(setPixel, tx, ty, 10, 10, roleColor);
  // Torso outline
  fillRect(setPixel, tx, ty, 10, 1, OUTLINE);       // top
  fillRect(setPixel, tx, ty, 1, 10, OUTLINE);        // left
  fillRect(setPixel, tx + 9, ty, 1, 10, OUTLINE);    // right
  fillRect(setPixel, tx, ty + 9, 10, 1, OUTLINE);    // bottom

  // ── Arms (3x8 each, swinging opposite to legs) ──
  const armY = ty + 1;
  // Left arm — swings forward when right leg is forward, back when left leg forward
  const leftArmShift = legState === 'right-forward' ? -1 : legState === 'left-forward' ? 1 : 0;
  fillRect(setPixel, tx - 3 + leftArmShift, armY, 3, 8, roleColor);
  fillRect(setPixel, tx - 3 + leftArmShift, armY, 1, 8, OUTLINE);
  fillRect(setPixel, tx - 3 + leftArmShift, armY + 6, 3, 2, SKIN); // hand

  // Right arm — swings opposite to left arm
  const rightArmShift = legState === 'left-forward' ? -1 : legState === 'right-forward' ? 1 : 0;
  fillRect(setPixel, tx + 10 + rightArmShift, armY, 3, 8, roleColor);
  fillRect(setPixel, tx + 12 + rightArmShift, armY, 1, 8, OUTLINE);
  fillRect(setPixel, tx + 10 + rightArmShift, armY + 6, 3, 2, SKIN); // hand

  // ── Legs (4x6 each, walk-cycle positions) ──
  const LEG_COLOR: RoleColor = [80, 80, 120];
  const ly = fy + 28;

  switch (legState) {
    case 'left-forward': {
      // Left leg extended forward (shifted left by 2px)
      fillRect(setPixel, tx + 1 - 2, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 1 - 2, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 1 - 2, ly + 5, 4, 1, OUTLINE);
      // Right leg extended backward (shifted right by 1px)
      fillRect(setPixel, tx + 5 + 1, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 5 + 1, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 5 + 1, ly + 5, 4, 1, OUTLINE);
      break;
    }
    case 'right-forward': {
      // Left leg extended backward (shifted left by 1px)
      fillRect(setPixel, tx + 1 + 1, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 1 + 1, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 1 + 1, ly + 5, 4, 1, OUTLINE);
      // Right leg extended forward (shifted right by 2px)
      fillRect(setPixel, tx + 5 - 2, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 5 - 2, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 5 - 2, ly + 5, 4, 1, OUTLINE);
      break;
    }
    case 'neutral':
    default: {
      // Both legs in neutral position (standard spacing)
      fillRect(setPixel, tx + 1, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 1, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 1, ly + 5, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 5, ly, 4, 6, LEG_COLOR);
      fillRect(setPixel, tx + 5, ly, 4, 1, OUTLINE);
      fillRect(setPixel, tx + 5, ly + 5, 4, 1, OUTLINE);
      break;
    }
  }

  // ── Feet (shoe outlines for grounding) ──
  const SHOE: RoleColor = [40, 35, 30];
  const footY = ly + 5; // at bottom of legs
  switch (legState) {
    case 'left-forward':
      // Left foot forward
      fillRect(setPixel, tx + 1 - 2, footY, 4, 1, SHOE);
      // Right foot back
      fillRect(setPixel, tx + 5 + 1, footY, 4, 1, SHOE);
      break;
    case 'right-forward':
      // Left foot back
      fillRect(setPixel, tx + 1 + 1, footY, 4, 1, SHOE);
      // Right foot forward
      fillRect(setPixel, tx + 5 - 2, footY, 4, 1, SHOE);
      break;
    default:
      fillRect(setPixel, tx + 1, footY, 4, 1, SHOE);
      fillRect(setPixel, tx + 5, footY, 4, 1, SHOE);
      break;
  }
}

// ── Dust particle effects ─────────────────────────────────────────────────────

/**
 * Draw small dust particles behind the character during walk motion.
 * Only shown when the character is at left or right offset (moving).
 */
function drawWalkDust(
  setPixel: PixelSetter,
  fx: number,
  fy: number,
  xOffset: number,
): void {
  if (xOffset === 0) return; // no dust when centered

  const DUST: RoleColor = [200, 190, 170];
  const footY = fy + 34; // near foot level

  if (xOffset < 0) {
    // Moving left — dust trails to the right
    setPixel(fx + 32, footY, DUST[0], DUST[1], DUST[2], 180);
    setPixel(fx + 34, footY - 1, DUST[0], DUST[1], DUST[2], 120);
    setPixel(fx + 36, footY, DUST[0], DUST[1], DUST[2], 80);
  } else {
    // Moving right — dust trails to the left
    setPixel(fx + 14, footY, DUST[0], DUST[1], DUST[2], 180);
    setPixel(fx + 12, footY - 1, DUST[0], DUST[1], DUST[2], 120);
    setPixel(fx + 10, footY, DUST[0], DUST[1], DUST[2], 80);
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Draw Row 2 (walk animation) into the sprite sheet buffer.
 *
 * Renders 4 frames at Row 2 (y = 96..143) with horizontal offset cycle:
 *   Frame 0: xOffset = -2 (left),   left leg forward
 *   Frame 1: xOffset =  0 (center), legs neutral
 *   Frame 2: xOffset = +2 (right),  right leg forward
 *   Frame 3: xOffset =  0 (center), legs neutral
 *
 * @param setPixel    - Callback to set a pixel at absolute (x, y) in the sheet.
 * @param roleColor   - [r, g, b] primary color for the agent role.
 * @param accessoryFn - Optional callback to draw role-specific accessories.
 */
export function drawWalkRow(
  setPixel: PixelSetter,
  roleColor: RoleColor,
  accessoryFn?: AccessoryDrawer,
): void {
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const fx = frame * FRAME_SIZE;
    const fy = ROW_Y_OFFSET;
    const xOffset = X_OFFSETS[frame];
    const legState = LEG_STATES[frame];

    // Draw the walking body with horizontal offset and leg state
    drawWalkBody(setPixel, fx, fy, roleColor, xOffset, legState);

    // Draw dust particles for movement frames
    drawWalkDust(setPixel, fx, fy, xOffset);

    // Draw role-specific accessories if provided
    if (accessoryFn) {
      accessoryFn(setPixel, fx, fy, frame);
    }
  }
}

// ── Standalone test render (can run via tsx) ──────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sprite-row-walk.ts')) {
  console.log('sprite-row-walk.ts — Row 2 Walk Animation');
  console.log(`  Frames: ${FRAME_COUNT}`);
  console.log(`  Row Y offset: ${ROW_Y_OFFSET}px`);
  console.log(`  Frame size: ${FRAME_SIZE}x${FRAME_SIZE}px`);
  console.log(`  Horizontal offsets: [${X_OFFSETS.join(', ')}]`);
  console.log(`  Leg states: [${LEG_STATES.join(', ')}]`);
  console.log('  Walk cycle: left(-2) -> center(0) -> right(+2) -> center(0)');
  console.log('');
  console.log('Available roles:');
  for (const [role, color] of Object.entries(ROLE_COLORS)) {
    console.log(`  ${role}: rgb(${color.join(', ')})`);
  }
}
