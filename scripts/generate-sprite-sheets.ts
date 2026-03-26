#!/usr/bin/env tsx
/**
 * generate-sprite-sheets.ts — Pixel agent sprite sheet generator.
 *
 * Generates 5 PNG sprite sheets (384×240, 8 cols × 5 rows of 48×48 frames)
 * for the agent roles: orchestrator, implementer, researcher, reviewer, validator.
 *
 * Row layout:
 *   Row 0 — idle (4 frames, 1-2px breathing offset)
 *   Row 1 — work (4 frames, alternating arm positions)
 *   Row 2 — walk (4 frames, horizontal offset cycle)
 *   Row 3 — frames 0-1 error-flash, frames 2-3 spawn-in
 *   Row 4 — greyscale idle (luminance of Row 0)
 *
 * Run: npx tsx scripts/generate-sprite-sheets.ts
 */

import { PNG } from "pngjs";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Constants ────────────────────────────────────────────────────────────────

const FRAME_W = 48;
const FRAME_H = 48;
const COLS = 8;
const ROWS = 5;
const SHEET_W = FRAME_W * COLS; // 384
const SHEET_H = FRAME_H * ROWS; // 240

const OUTPUT_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "..",
  "packages",
  "command-center",
  "public",
  "textures",
);

// ── Role Definitions ─────────────────────────────────────────────────────────

interface RoleVisual {
  id: string;
  /** Primary color hex */
  color: string;
  /** Skin tone */
  skin: string;
  /** Eye color */
  eyes: string;
  /** Accessory description for drawing */
  accessory: "crown" | "wrench" | "goggles" | "clipboard" | "shield";
}

const ROLES: RoleVisual[] = [
  { id: "orchestrator", color: "#FF7043", skin: "#FFD5B8", eyes: "#333333", accessory: "crown" },
  { id: "implementer", color: "#66BB6A", skin: "#FFD5B8", eyes: "#333333", accessory: "wrench" },
  { id: "researcher", color: "#AB47BC", skin: "#FFD5B8", eyes: "#333333", accessory: "goggles" },
  { id: "reviewer", color: "#42A5F5", skin: "#FFD5B8", eyes: "#333333", accessory: "clipboard" },
  { id: "validator", color: "#EF5350", skin: "#FFD5B8", eyes: "#333333", accessory: "shield" },
];

// ── Color Utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** ITU-R BT.601 luminance */
function luminance(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

// ── PNG Pixel Helpers ────────────────────────────────────────────────────────

function setPixel(
  png: PNG,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (y * png.width + x) * 4;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function getPixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (y * png.width + x) * 4;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
}

function fillRect(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x + dx, y + dy, r, g, b, a);
    }
  }
}

// ── Chibi Character Drawing ──────────────────────────────────────────────────

/**
 * Draws a chibi-style pixel character into a single 48×48 frame.
 *
 * Body proportions (chibi): large head (~16px), small body (~14px), short legs (~8px).
 * All characters share the same proportions but differ in color and accessory.
 *
 * @param png       Target PNG
 * @param fx        Frame top-left X (in sheet coordinates)
 * @param fy        Frame top-left Y (in sheet coordinates)
 * @param role      Role visual config
 * @param yOffset   Vertical breathing offset (0, 1, or 2 px down)
 * @param armState  Arm state: 'down' | 'up-left' | 'up-right' | 'both-up'
 * @param xOffset   Horizontal walk offset
 */
function drawChibiCharacter(
  png: PNG,
  fx: number,
  fy: number,
  role: RoleVisual,
  yOffset: number = 0,
  armState: "down" | "up-left" | "up-right" | "both-up" = "down",
  xOffset: number = 0,
): void {
  const [cr, cg, cb] = hexToRgb(role.color);
  const [sr, sg, sb] = hexToRgb(role.skin);
  const [er, eg, eb] = hexToRgb(role.eyes);

  // Base positions (centered in 48×48, with yOffset for breathing)
  const centerX = fx + 24 + xOffset;
  const baseY = fy + 6 + yOffset;

  // ── Hair / top of head ──
  fillRect(png, centerX - 7, baseY, 14, 3, cr, cg, cb);

  // ── Head (skin, 14×12) ──
  fillRect(png, centerX - 7, baseY + 3, 14, 12, sr, sg, sb);

  // ── Eyes (2×2 each, spaced) ──
  fillRect(png, centerX - 4, baseY + 7, 2, 2, er, eg, eb);
  fillRect(png, centerX + 2, baseY + 7, 2, 2, er, eg, eb);

  // ── Mouth (small line) ──
  fillRect(png, centerX - 1, baseY + 11, 2, 1, er, eg, eb);

  // ── Body / shirt (role color, 10×10) ──
  const bodyTop = baseY + 15;
  fillRect(png, centerX - 5, bodyTop, 10, 10, cr, cg, cb);

  // ── Arms (3×8 each) ──
  const armTop = bodyTop + 1;
  // Left arm
  if (armState === "up-left" || armState === "both-up") {
    fillRect(png, centerX - 8, bodyTop - 5, 3, 8, cr, cg, cb);
  } else {
    fillRect(png, centerX - 8, armTop, 3, 8, cr, cg, cb);
  }
  // Right arm
  if (armState === "up-right" || armState === "both-up") {
    fillRect(png, centerX + 5, bodyTop - 5, 3, 8, cr, cg, cb);
  } else {
    fillRect(png, centerX + 5, armTop, 3, 8, cr, cg, cb);
  }

  // ── Legs (3×8 each, dark shade of role color) ──
  const legR = Math.max(0, cr - 60);
  const legG = Math.max(0, cg - 60);
  const legB = Math.max(0, cb - 60);
  const legTop = bodyTop + 10;
  fillRect(png, centerX - 4, legTop, 3, 8, legR, legG, legB);
  fillRect(png, centerX + 1, legTop, 3, 8, legR, legG, legB);

  // ── Feet (4×2 each) ──
  const feetR = Math.max(0, cr - 90);
  const feetG = Math.max(0, cg - 90);
  const feetB = Math.max(0, cb - 90);
  fillRect(png, centerX - 5, legTop + 8, 4, 2, feetR, feetG, feetB);
  fillRect(png, centerX + 1, legTop + 8, 4, 2, feetR, feetG, feetB);

  // ── Accessory ──
  drawAccessory(png, centerX, baseY, role);
}

function drawAccessory(
  png: PNG,
  centerX: number,
  baseY: number,
  role: RoleVisual,
): void {
  const [cr, cg, cb] = hexToRgb(role.color);
  switch (role.accessory) {
    case "crown": {
      // ── Orchestrator: Gold crown with jewels ──
      // Crown base band (wide, sits on top of hair)
      fillRect(png, centerX - 6, baseY - 2, 12, 2, 255, 215, 0);
      // Crown rim (darker gold for depth)
      fillRect(png, centerX - 6, baseY - 1, 12, 1, 218, 165, 0);
      // Three tall crown points
      fillRect(png, centerX - 5, baseY - 5, 2, 3, 255, 215, 0);
      fillRect(png, centerX - 1, baseY - 6, 2, 4, 255, 215, 0); // center taller
      fillRect(png, centerX + 3, baseY - 5, 2, 3, 255, 215, 0);
      // Jewels on crown points (red, blue, red)
      setPixel(png, centerX - 5, baseY - 5, 220, 40, 40);
      setPixel(png, centerX - 1, baseY - 6, 60, 120, 255);
      setPixel(png, centerX + 3, baseY - 5, 220, 40, 40);
      // Sparkle highlight on center jewel
      setPixel(png, centerX, baseY - 6, 255, 255, 255);
      break;
    }

    case "wrench": {
      // ── Implementer: Wrench held in right hand ──
      // Wrench handle (dark grey, vertical)
      fillRect(png, centerX + 9, baseY + 18, 2, 8, 140, 140, 140);
      // Wrench handle grip (slightly lighter)
      fillRect(png, centerX + 9, baseY + 22, 2, 3, 100, 100, 100);
      // Wrench jaw (top, open-end shape)
      fillRect(png, centerX + 8, baseY + 16, 4, 2, 180, 180, 180);
      fillRect(png, centerX + 8, baseY + 16, 1, 3, 180, 180, 180);
      fillRect(png, centerX + 11, baseY + 16, 1, 3, 180, 180, 180);
      // Metallic highlight
      setPixel(png, centerX + 9, baseY + 17, 220, 220, 220);
      // Small gear/bolt near wrench (shows building)
      setPixel(png, centerX + 13, baseY + 19, 255, 215, 0);
      setPixel(png, centerX + 12, baseY + 20, 255, 215, 0);
      // Tool belt (horizontal stripe across waist)
      fillRect(png, centerX - 5, baseY + 24, 10, 1, 139, 90, 43);
      // Belt buckle
      setPixel(png, centerX, baseY + 24, 255, 215, 0);
      break;
    }

    case "goggles": {
      // ── Researcher: Science goggles with strap ──
      // Goggle strap (goes around head)
      fillRect(png, centerX - 8, baseY + 6, 2, 3, 120, 60, 160);
      fillRect(png, centerX + 6, baseY + 6, 2, 3, 120, 60, 160);
      // Left goggle lens frame (silver)
      fillRect(png, centerX - 6, baseY + 5, 5, 5, 200, 200, 210);
      // Left lens (tinted purple/blue)
      fillRect(png, centerX - 5, baseY + 6, 3, 3, 140, 80, 200);
      // Lens glare (highlight)
      setPixel(png, centerX - 5, baseY + 6, 200, 180, 255);
      // Right goggle lens frame (silver)
      fillRect(png, centerX + 1, baseY + 5, 5, 5, 200, 200, 210);
      // Right lens (tinted purple/blue)
      fillRect(png, centerX + 2, baseY + 6, 3, 3, 140, 80, 200);
      // Lens glare
      setPixel(png, centerX + 2, baseY + 6, 200, 180, 255);
      // Bridge between lenses
      fillRect(png, centerX - 1, baseY + 7, 2, 1, 200, 200, 210);
      // Antennae/sensor on top of goggles
      setPixel(png, centerX + 4, baseY + 4, 80, 255, 80);
      setPixel(png, centerX + 4, baseY + 3, 80, 255, 80);
      break;
    }

    case "clipboard": {
      // ── Reviewer: Clipboard with checklist held in left hand ──
      // Clipboard board (brown wood/cork)
      fillRect(png, centerX - 12, baseY + 16, 5, 8, 180, 140, 90);
      // Clipboard edge (darker)
      fillRect(png, centerX - 12, baseY + 16, 5, 1, 139, 90, 43);
      fillRect(png, centerX - 12, baseY + 16, 1, 8, 139, 90, 43);
      // Metal clip at top
      fillRect(png, centerX - 11, baseY + 15, 3, 2, 190, 190, 200);
      setPixel(png, centerX - 10, baseY + 14, 190, 190, 200);
      // Paper (white area)
      fillRect(png, centerX - 11, baseY + 17, 3, 6, 245, 245, 245);
      // Checklist lines (small green checkmarks and grey lines)
      setPixel(png, centerX - 11, baseY + 18, 80, 200, 80);   // ✓
      fillRect(png, centerX - 10, baseY + 18, 2, 1, 160, 160, 160); // line
      setPixel(png, centerX - 11, baseY + 20, 80, 200, 80);   // ✓
      fillRect(png, centerX - 10, baseY + 20, 2, 1, 160, 160, 160); // line
      setPixel(png, centerX - 11, baseY + 22, 200, 80, 80);   // ✗ (red)
      fillRect(png, centerX - 10, baseY + 22, 2, 1, 160, 160, 160); // line
      // Pencil tucked behind ear
      fillRect(png, centerX + 7, baseY + 2, 1, 5, 255, 215, 0);
      setPixel(png, centerX + 7, baseY + 7, 255, 130, 130); // eraser
      setPixel(png, centerX + 7, baseY + 1, 60, 60, 60);    // tip
      break;
    }

    case "shield": {
      // ── Validator: Shield with checkmark emblem ──
      // Shield body (role-colored, classic shield shape)
      fillRect(png, centerX + 8, baseY + 16, 6, 7, cr, cg, cb);
      // Shield tapers at bottom (pointed)
      fillRect(png, centerX + 9, baseY + 23, 4, 1, cr, cg, cb);
      fillRect(png, centerX + 10, baseY + 24, 2, 1, cr, cg, cb);
      // Shield border (white metallic edge)
      // Top edge
      fillRect(png, centerX + 8, baseY + 16, 6, 1, 240, 240, 255);
      // Left edge
      fillRect(png, centerX + 8, baseY + 16, 1, 7, 240, 240, 255);
      // Right edge
      fillRect(png, centerX + 13, baseY + 16, 1, 7, 200, 200, 220);
      // Center boss/emblem area (darker center)
      fillRect(png, centerX + 10, baseY + 18, 2, 3, Math.max(0, cr - 40), Math.max(0, cg - 40), Math.max(0, cb - 40));
      // White checkmark emblem on shield
      setPixel(png, centerX + 10, baseY + 20, 255, 255, 255);
      setPixel(png, centerX + 11, baseY + 19, 255, 255, 255);
      setPixel(png, centerX + 12, baseY + 18, 255, 255, 255);
      // Shoulder guard (small pauldron)
      fillRect(png, centerX + 5, baseY + 15, 3, 2, 200, 200, 220);
      fillRect(png, centerX + 5, baseY + 15, 3, 1, 240, 240, 255);
      break;
    }
  }
}

// ── Row Renderers ────────────────────────────────────────────────────────────

/**
 * Row 0 — Idle animation: 4 frames with 1-2px vertical breathing offset.
 *
 * Breathing cycle: frame 0 = 0px, frame 1 = 1px, frame 2 = 2px, frame 3 = 1px
 * This creates a gentle up-down bobbing motion when looped.
 */
function renderRow0Idle(png: PNG, role: RoleVisual): void {
  const breathingOffsets = [0, 1, 2, 1]; // smooth breathing cycle
  const row = 0;

  for (let col = 0; col < 4; col++) {
    const fx = col * FRAME_W;
    const fy = row * FRAME_H;
    const yOff = breathingOffsets[col];

    drawChibiCharacter(png, fx, fy, role, yOff, "down", 0);
  }
}

/**
 * Row 1 — Work animation: 4 frames with alternating arm positions.
 *
 * Arm cycle simulates typing / tool use:
 *   Frame 0: right arm raised, left arm down  (working stroke)
 *   Frame 1: both arms down                   (neutral return)
 *   Frame 2: left arm raised, right arm down   (mirror stroke)
 *   Frame 3: both arms down                   (neutral return)
 *
 * Each frame also draws a small work sparkle near the active hand
 * to reinforce the "working" visual.
 */
function renderRow1Work(png: PNG, role: RoleVisual): void {
  const armStates: Array<"down" | "up-left" | "up-right" | "both-up"> = [
    "up-right",  // Frame 0: right arm raised working stroke
    "down",      // Frame 1: neutral
    "up-left",   // Frame 2: left arm raised mirror stroke
    "down",      // Frame 3: neutral
  ];
  const row = 1;

  for (let col = 0; col < 4; col++) {
    const fx = col * FRAME_W;
    const fy = row * FRAME_H;
    drawChibiCharacter(png, fx, fy, role, 0, armStates[col], 0);

    // Work sparkle / tool indicator near active hand
    drawWorkSparkle(png, fx, fy, col);
  }
}

/**
 * Draws a small sparkle or tool flash near the raised arm to indicate work.
 *
 * Frame 0: sparkle on the right side (right arm raised)
 * Frame 1: small center sparkle (neutral, residual glow)
 * Frame 2: sparkle on the left side (left arm raised)
 * Frame 3: small center sparkle (neutral, residual glow)
 */
function drawWorkSparkle(
  png: PNG,
  fx: number,
  fy: number,
  frame: number,
): void {
  if (frame === 0) {
    // Sparkle near right hand (right arm raised)
    setPixel(png, fx + 33, fy + 11, 255, 255, 100, 255);
    setPixel(png, fx + 34, fy + 10, 255, 255, 200, 255);
    setPixel(png, fx + 32, fy + 10, 255, 255, 255, 200);
  } else if (frame === 2) {
    // Sparkle near left hand (left arm raised)
    setPixel(png, fx + 14, fy + 11, 255, 255, 100, 255);
    setPixel(png, fx + 13, fy + 10, 255, 255, 200, 255);
    setPixel(png, fx + 15, fy + 10, 255, 255, 255, 200);
  } else {
    // Neutral frames — dim center sparkle (residual glow)
    setPixel(png, fx + 24, fy + 14, 255, 255, 200, 140);
    setPixel(png, fx + 25, fy + 15, 255, 255, 180, 100);
  }
}

/**
 * Row 2 — Walk animation: 4 frames with horizontal offset cycle.
 *
 * Cycle: left(-2), center(0), right(+2), center(0)
 *
 * Walk-specific enhancements over the base character:
 *   - Horizontal offset shifts the entire character left/right
 *   - Arms swing opposite to legs for natural walking motion
 *   - Legs alternate stride positions (forward/back vs together)
 *   - Stride frames (0, 2) get a 1px vertical bounce
 *   - Ground shadow drawn beneath feet for depth
 *   - Dust particles trail behind on movement frames
 */
function renderRow2Walk(png: PNG, role: RoleVisual): void {
  const xOffsets = [-2, 0, 2, 0];
  // Arms swing opposite to the stride direction for natural walk
  const armStates: Array<"down" | "up-left" | "up-right" | "both-up"> = [
    "up-right",  // Frame 0: stepping left, right arm forward
    "down",      // Frame 1: passing center, arms relaxed
    "up-left",   // Frame 2: stepping right, left arm forward
    "down",      // Frame 3: passing center, arms relaxed
  ];
  // Stride frames bounce up 1px
  const vBounces = [-1, 0, -1, 0];
  const row = 2;

  const [cr, cg, cb] = hexToRgb(role.color);

  for (let col = 0; col < 4; col++) {
    const fx = col * FRAME_W;
    const fy = row * FRAME_H;
    const xOff = xOffsets[col];
    const vBounce = vBounces[col];

    // Draw base character with horizontal offset, arm swing, and bounce
    drawChibiCharacter(png, fx, fy, role, vBounce, armStates[col], xOff);

    // ── Walk-specific leg overdraw ──
    // Override default leg positions with alternating stride positions
    drawWalkLegs(png, fx, fy, role, xOff, vBounce, col);

    // ── Ground shadow ──
    const shadowX = fx + 24 + xOff;
    const shadowY = fy + 6 + vBounce + 15 + 10 + 8 + 2; // below feet
    for (let dx = -6; dx <= 5; dx++) {
      const alpha = Math.max(40, 80 - Math.abs(dx) * 12);
      setPixel(png, shadowX + dx, shadowY, 0, 0, 0, alpha);
      setPixel(png, shadowX + dx, shadowY + 1, 0, 0, 0, Math.round(alpha * 0.5));
    }

    // ── Dust particles (only on movement frames) ──
    if (xOff !== 0) {
      drawWalkDust(png, fx, fy, xOff, vBounce);
    }
  }
}

/**
 * Draw walk-specific leg positions overriding the default static legs.
 *
 * Frame 0 (left stride):  left leg forward (-2px), right leg back (+1px)
 * Frame 1 (passing):      legs together (neutral)
 * Frame 2 (right stride): right leg forward (+2px), left leg back (-1px)
 * Frame 3 (passing):      legs together (neutral)
 */
function drawWalkLegs(
  png: PNG,
  fx: number,
  fy: number,
  role: RoleVisual,
  xOff: number,
  vBounce: number,
  frameIdx: number,
): void {
  const [cr, cg, cb] = hexToRgb(role.color);
  // Darker shade for legs (pants)
  const legR = Math.max(0, cr - 60);
  const legG = Math.max(0, cg - 60);
  const legB = Math.max(0, cb - 60);
  // Even darker for shoes
  const shoeR = Math.max(0, cr - 90);
  const shoeG = Math.max(0, cg - 90);
  const shoeB = Math.max(0, cb - 90);

  const centerX = fx + 24 + xOff;
  const baseY = fy + 6 + vBounce;
  const legTop = baseY + 25; // bodyTop(15) + bodyH(10) = 25

  // Clear the default leg area first (4px tall clear band)
  for (let y = legTop; y < legTop + 10; y++) {
    for (let x = centerX - 6; x < centerX + 6; x++) {
      setPixel(png, x, y, 0, 0, 0, 0);
    }
  }

  if (frameIdx === 0) {
    // Left leg extended forward (shifted left by 2px from center)
    fillRect(png, centerX - 6, legTop, 3, 8, legR, legG, legB);
    fillRect(png, centerX - 7, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
    // Right leg back (shifted right by 1px)
    fillRect(png, centerX + 2, legTop + 1, 3, 7, legR, legG, legB);
    fillRect(png, centerX + 2, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
  } else if (frameIdx === 2) {
    // Right leg extended forward (shifted right by 2px from center)
    fillRect(png, centerX + 3, legTop, 3, 8, legR, legG, legB);
    fillRect(png, centerX + 3, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
    // Left leg back (shifted left by 1px)
    fillRect(png, centerX - 5, legTop + 1, 3, 7, legR, legG, legB);
    fillRect(png, centerX - 6, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
  } else {
    // Frames 1 and 3: legs together (passing position)
    fillRect(png, centerX - 4, legTop, 3, 8, legR, legG, legB);
    fillRect(png, centerX - 5, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
    fillRect(png, centerX + 1, legTop, 3, 8, legR, legG, legB);
    fillRect(png, centerX + 1, legTop + 8, 4, 2, shoeR, shoeG, shoeB);
  }
}

/**
 * Draw dust particles trailing behind the character during walk movement.
 * Particles appear on the opposite side of travel direction.
 */
function drawWalkDust(
  png: PNG,
  fx: number,
  fy: number,
  xOff: number,
  vBounce: number,
): void {
  const footY = fy + 6 + vBounce + 35; // near foot level
  const dustColor = { r: 200, g: 190, b: 170 };

  if (xOff < 0) {
    // Moving left → dust trails to the right
    setPixel(png, fx + 34, footY, dustColor.r, dustColor.g, dustColor.b, 180);
    setPixel(png, fx + 36, footY - 1, dustColor.r, dustColor.g, dustColor.b, 120);
    setPixel(png, fx + 38, footY, dustColor.r, dustColor.g, dustColor.b, 60);
  } else {
    // Moving right → dust trails to the left
    setPixel(png, fx + 13, footY, dustColor.r, dustColor.g, dustColor.b, 180);
    setPixel(png, fx + 11, footY - 1, dustColor.r, dustColor.g, dustColor.b, 120);
    setPixel(png, fx + 9, footY, dustColor.r, dustColor.g, dustColor.b, 60);
  }
}

/**
 * Row 3 — Special animations.
 *
 * Frames 0-1: error-flash
 *   Frame 0 — normal character pose (error state base).
 *   Frame 1 — same pose with a 50% red (#FF0000) tint overlay blended
 *             into every non-transparent pixel.
 *
 * Frames 2-3: spawn-in
 *   Frame 2 — character rendered at 50% scale (half-size), centered in
 *             the frame, with sparkle particles to indicate materialising.
 *   Frame 3 — full-size character with arms raised and residual sparkles
 *             to show spawn completion.
 */
function renderRow3Special(png: PNG, role: RoleVisual): void {
  const row = 3;
  const rowY = row * FRAME_H;

  // ── Frame 0: error-flash base (normal pose) ──────────────────────────
  drawChibiCharacter(png, 0 * FRAME_W, rowY, role, 0, "down", 0);

  // ── Frame 1: error-flash red tint (50% red overlay) ──────────────────
  drawChibiCharacter(png, 1 * FRAME_W, rowY, role, 0, "down", 0);
  // Blend every opaque pixel 50/50 with pure red (#FF0000)
  for (let y = rowY; y < rowY + FRAME_H; y++) {
    for (let x = FRAME_W; x < 2 * FRAME_W; x++) {
      const [r, g, b, a] = getPixel(png, x, y);
      if (a > 0) {
        setPixel(
          png,
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

  // ── Frame 2: spawn-in at 50% scale ──────────────────────────────────
  // Draw a half-size approximation of the character, centered in frame.
  // At 50% scale: head ~7×6, body ~5×5, no legs (still materialising).
  const spawnX = 2 * FRAME_W;
  const [cr, cg, cb] = hexToRgb(role.color);
  const [sr, sg, sb] = hexToRgb(role.skin);
  const [er, eg, eb] = hexToRgb(role.eyes);
  const cx = spawnX + 24; // centered horizontally
  const cy = rowY + 18;   // vertically centered for half-height figure

  // Half-size hair (7×2)
  fillRect(png, cx - 3, cy, 7, 2, cr, cg, cb);
  // Half-size head (7×6, skin)
  fillRect(png, cx - 3, cy + 2, 7, 6, sr, sg, sb);
  // Half-size eyes (1×1 each)
  setPixel(png, cx - 2, cy + 4, er, eg, eb);
  setPixel(png, cx + 1, cy + 4, er, eg, eb);
  // Half-size body (5×5, role color)
  fillRect(png, cx - 2, cy + 8, 5, 5, cr, cg, cb);

  // Sparkle particles (materialisation effect)
  setPixel(png, cx - 9, cy - 2, 255, 255, 255);
  setPixel(png, cx + 8, cy + 1, 255, 255, 255);
  setPixel(png, cx - 5, cy + 14, 255, 255, 255);
  setPixel(png, cx + 6, cy + 12, 255, 255, 255);
  setPixel(png, cx, cy - 4, 255, 255, 255);

  // ── Frame 3: spawn-in complete (full scale, arms raised) ─────────────
  drawChibiCharacter(png, 3 * FRAME_W, rowY, role, 0, "both-up", 0);
  // Residual sparkles around the fully-spawned character
  const f3cx = 3 * FRAME_W + 24;
  setPixel(png, f3cx - 12, rowY + 8, 255, 255, 255);
  setPixel(png, f3cx + 11, rowY + 12, 255, 255, 255);
  setPixel(png, f3cx - 8, rowY + 30, 255, 255, 255);
  setPixel(png, f3cx + 8, rowY + 6, 255, 255, 255);
  setPixel(png, f3cx - 10, rowY + 20, 255, 255, 255);
  setPixel(png, f3cx + 9, rowY + 24, 255, 255, 255);
}

/**
 * Row 4 — Greyscale versions of Row 0 using BT.601 luminance formula.
 */
function renderRow4Greyscale(png: PNG): void {
  const srcRow = 0;
  const dstRow = 4;

  for (let col = 0; col < COLS; col++) {
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const sx = col * FRAME_W + x;
        const sy = srcRow * FRAME_H + y;
        const dx = col * FRAME_W + x;
        const dy = dstRow * FRAME_H + y;

        const [r, g, b, a] = getPixel(png, sx, sy);
        const grey = luminance(r, g, b);
        setPixel(png, dx, dy, grey, grey, grey, a);
      }
    }
  }
}

// ── Main Generator ───────────────────────────────────────────────────────────

function generateSpriteSheet(role: RoleVisual): PNG {
  const png = new PNG({ width: SHEET_W, height: SHEET_H });
  // Initialize to fully transparent
  png.data.fill(0);

  renderRow0Idle(png, role);
  renderRow1Work(png, role);
  renderRow2Walk(png, role);
  renderRow3Special(png, role);
  renderRow4Greyscale(png);

  return png;
}

function main(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const role of ROLES) {
    const png = generateSpriteSheet(role);
    const filename = `agent-${role.id}.png`;
    const outPath = path.join(OUTPUT_DIR, filename);

    const buffer = PNG.sync.write(png);
    fs.writeFileSync(outPath, buffer);

    console.log(`✓ ${filename} (${SHEET_W}×${SHEET_H})`);
  }

  console.log(`\nGenerated ${ROLES.length} sprite sheets in ${OUTPUT_DIR}`);
}

main();
