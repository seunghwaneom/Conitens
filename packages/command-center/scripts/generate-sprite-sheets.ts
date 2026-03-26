/**
 * generate-sprite-sheets.ts — Generates placeholder pixel-art sprite sheet PNGs.
 *
 * Creates 5 sprite sheets (one per agent role) at public/sprites/agent-{role}.png.
 * Each sheet is 384×240 (8 cols × 5 rows of 48×48 frames).
 *
 * Run: pnpm generate:sprites
 */
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const FRAME_W = 48;
const FRAME_H = 48;
const COLS = 8;
const ROWS = 5;
const SHEET_W = FRAME_W * COLS; // 384
const SHEET_H = FRAME_H * ROWS; // 240

const BODY_W = 24;
const BODY_H = 30;
const HEAD_R = 10; // head radius
const OUTLINE = 2;

// ── Role definitions ──────────────────────────────────────────────────────────

interface RoleDef {
  role: string;
  color: [number, number, number];
  lightColor: [number, number, number];
  accessory: "crown" | "wrench" | "goggles" | "clipboard" | "shield";
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lighten(rgb: [number, number, number], f: number): [number, number, number] {
  return [
    Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * f)),
    Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * f)),
    Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * f)),
  ];
}

function toGreyscale(rgb: [number, number, number]): [number, number, number] {
  const g = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
  return [g, g, g];
}

const ROLES: RoleDef[] = [
  { role: "orchestrator", color: hexToRgb("#FF7043"), lightColor: lighten(hexToRgb("#FF7043"), 0.3), accessory: "crown" },
  { role: "implementer", color: hexToRgb("#66BB6A"), lightColor: lighten(hexToRgb("#66BB6A"), 0.3), accessory: "wrench" },
  { role: "researcher", color: hexToRgb("#AB47BC"), lightColor: lighten(hexToRgb("#AB47BC"), 0.3), accessory: "goggles" },
  { role: "reviewer", color: hexToRgb("#42A5F5"), lightColor: lighten(hexToRgb("#42A5F5"), 0.3), accessory: "clipboard" },
  { role: "validator", color: hexToRgb("#EF5350"), lightColor: lighten(hexToRgb("#EF5350"), 0.3), accessory: "shield" },
];

// ── PNG pixel helpers ─────────────────────────────────────────────────────────

function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number = 255): void {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png: PNG, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number, a: number = 255): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x0 + dx, y0 + dy, r, g, b, a);
    }
  }
}

function fillCircle(png: PNG, cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number = 255): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(png, cx + dx, cy + dy, r, g, b, a);
      }
    }
  }
}

function drawOutlineRect(png: PNG, x0: number, y0: number, w: number, h: number, thickness: number, r: number, g: number, b: number): void {
  // top
  fillRect(png, x0, y0, w, thickness, r, g, b);
  // bottom
  fillRect(png, x0, y0 + h - thickness, w, thickness, r, g, b);
  // left
  fillRect(png, x0, y0, thickness, h, r, g, b);
  // right
  fillRect(png, x0 + w - thickness, y0, thickness, h, r, g, b);
}

function drawOutlineCircle(png: PNG, cx: number, cy: number, radius: number, thickness: number, r: number, g: number, b: number): void {
  const outer = radius;
  const inner = radius - thickness;
  for (let dy = -outer; dy <= outer; dy++) {
    for (let dx = -outer; dx <= outer; dx++) {
      const dist = dx * dx + dy * dy;
      if (dist <= outer * outer && dist > inner * inner) {
        setPixel(png, cx + dx, cy + dy, r, g, b);
      }
    }
  }
}

// ── Character drawing ─────────────────────────────────────────────────────────

interface DrawOpts {
  frameX: number; // top-left X of the 48x48 frame
  frameY: number; // top-left Y of the 48x48 frame
  offsetX: number; // horizontal body offset (walk)
  offsetY: number; // vertical body offset (breathing)
  color: [number, number, number];
  lightColor: [number, number, number];
  accessory: RoleDef["accessory"];
  armUp: boolean; // for work animation
  scale: number; // 1.0 = full, 0.5 = half (spawn-in)
  redTint: boolean; // error flash
}

function drawCharacter(png: PNG, opts: DrawOpts): void {
  const { frameX, frameY, offsetX, offsetY, color, lightColor, accessory, armUp, scale, redTint } = opts;

  const cx = frameX + FRAME_W / 2 + offsetX; // center X
  const bodyW = Math.round(BODY_W * scale);
  const bodyH = Math.round(BODY_H * scale);
  const headR = Math.round(HEAD_R * scale);

  // Body position
  const bodyX = cx - Math.round(bodyW / 2);
  const bodyBottom = frameY + FRAME_H - 4 + offsetY;
  const bodyTop = bodyBottom - bodyH;

  // Head position
  const headCY = bodyTop - headR + 2;

  // Draw body (rounded rect approximated by rect)
  fillRect(png, bodyX, bodyTop, bodyW, bodyH, color[0], color[1], color[2]);
  drawOutlineRect(png, bodyX, bodyTop, bodyW, bodyH, OUTLINE, 0, 0, 0);

  // Draw head
  fillCircle(png, cx, headCY, headR, lightColor[0], lightColor[1], lightColor[2]);
  drawOutlineCircle(png, cx, headCY, headR, OUTLINE, 0, 0, 0);

  // Eyes (2px white dots)
  const eyeY = headCY - 1;
  fillRect(png, cx - 3, eyeY, 2, 2, 255, 255, 255);
  fillRect(png, cx + 2, eyeY, 2, 2, 255, 255, 255);
  // Pupils (1px black)
  setPixel(png, cx - 2, eyeY + 1, 0, 0, 0);
  setPixel(png, cx + 3, eyeY + 1, 0, 0, 0);

  // Arms
  const armY = armUp ? bodyTop - 3 : bodyTop + Math.round(bodyH * 0.4);
  const armLen = Math.round(6 * scale);
  // Left arm
  fillRect(png, bodyX - armLen, armY, armLen, Math.round(3 * scale), color[0], color[1], color[2]);
  // Right arm
  fillRect(png, bodyX + bodyW, armY, armLen, Math.round(3 * scale), color[0], color[1], color[2]);

  // Legs (2 small rects)
  const legW = Math.round(4 * scale);
  const legH = Math.round(4 * scale);
  fillRect(png, cx - legW - 1, bodyBottom, legW, legH, color[0], color[1], color[2]);
  fillRect(png, cx + 2, bodyBottom, legW, legH, color[0], color[1], color[2]);

  // Accessory
  drawAccessory(png, cx, headCY - headR, headR, scale, accessory, color);

  // Red tint overlay for error flash
  if (redTint) {
    const overX = cx - Math.round((bodyW + 8) / 2);
    const overY = headCY - headR - 2;
    const overW = bodyW + 8;
    const overH = bodyH + headR * 2 + 8;
    for (let dy = 0; dy < overH; dy++) {
      for (let dx = 0; dx < overW; dx++) {
        const px = overX + dx;
        const py = overY + dy;
        if (px >= 0 && px < png.width && py >= 0 && py < png.height) {
          const idx = (png.width * py + px) << 2;
          if (png.data[idx + 3] > 0) { // only tint non-transparent pixels
            png.data[idx] = Math.min(255, Math.round(png.data[idx] * 0.5 + 255 * 0.5));
            png.data[idx + 1] = Math.round(png.data[idx + 1] * 0.5);
            png.data[idx + 2] = Math.round(png.data[idx + 2] * 0.5);
          }
        }
      }
    }
  }
}

function drawAccessory(png: PNG, cx: number, topY: number, headR: number, scale: number, accessory: RoleDef["accessory"], color: [number, number, number]): void {
  const s = scale;
  switch (accessory) {
    case "crown": {
      // 3 triangles above head
      const crownY = topY - Math.round(6 * s);
      const crownW = Math.round(12 * s);
      fillRect(png, cx - Math.round(crownW / 2), crownY, crownW, Math.round(4 * s), 255, 215, 0); // gold
      // 3 points
      for (let i = -1; i <= 1; i++) {
        const px = cx + i * Math.round(4 * s);
        fillRect(png, px - 1, crownY - Math.round(3 * s), 2, Math.round(3 * s), 255, 215, 0);
      }
      break;
    }
    case "wrench": {
      // L-shaped wrench to the right of head
      const wx = cx + headR + 1;
      const wy = topY + Math.round(2 * s);
      fillRect(png, wx, wy, Math.round(3 * s), Math.round(8 * s), 180, 180, 180); // grey shaft
      fillRect(png, wx, wy, Math.round(6 * s), Math.round(3 * s), 180, 180, 180); // head
      break;
    }
    case "goggles": {
      // Two circles on the face
      const gy = topY + Math.round(headR * 0.8);
      fillCircle(png, cx - Math.round(4 * s), gy, Math.round(4 * s), 200, 200, 255, 200);
      fillCircle(png, cx + Math.round(4 * s), gy, Math.round(4 * s), 200, 200, 255, 200);
      drawOutlineCircle(png, cx - Math.round(4 * s), gy, Math.round(4 * s), 1, 100, 100, 150);
      drawOutlineCircle(png, cx + Math.round(4 * s), gy, Math.round(4 * s), 1, 100, 100, 150);
      break;
    }
    case "clipboard": {
      // Rectangle to the left of body
      const clx = cx - headR - Math.round(6 * s);
      const cly = topY + Math.round(headR + 4 * s);
      fillRect(png, clx, cly, Math.round(6 * s), Math.round(8 * s), 240, 230, 200);
      drawOutlineRect(png, clx, cly, Math.round(6 * s), Math.round(8 * s), 1, 100, 80, 50);
      break;
    }
    case "shield": {
      // Triangle-ish shield on right arm
      const sx = cx + headR + 1;
      const sy = topY + Math.round(headR + 2 * s);
      const sw = Math.round(7 * s);
      const sh = Math.round(9 * s);
      // Shield body
      fillRect(png, sx, sy, sw, sh - Math.round(3 * s), color[0], color[1], color[2]);
      // Pointed bottom
      for (let i = 0; i < Math.round(3 * s); i++) {
        const w = sw - i * 2;
        if (w > 0) fillRect(png, sx + i, sy + sh - Math.round(3 * s) + i, w, 1, color[0], color[1], color[2]);
      }
      drawOutlineRect(png, sx, sy, sw, sh - Math.round(3 * s), 1, 0, 0, 0);
      break;
    }
  }
}

// ── Row renderers ─────────────────────────────────────────────────────────────

function renderRow(png: PNG, role: RoleDef, row: number, variants: DrawOpts[]): void {
  for (let col = 0; col < variants.length && col < COLS; col++) {
    drawCharacter(png, variants[col]);
  }
}

function makeBaseOpts(role: RoleDef, row: number, col: number): DrawOpts {
  return {
    frameX: col * FRAME_W,
    frameY: row * FRAME_H,
    offsetX: 0,
    offsetY: 0,
    color: role.color,
    lightColor: role.lightColor,
    accessory: role.accessory,
    armUp: false,
    scale: 1.0,
    redTint: false,
  };
}

function generateSheet(role: RoleDef): PNG {
  const png = new PNG({ width: SHEET_W, height: SHEET_H, filterType: -1 });
  // All pixels start transparent (RGBA 0,0,0,0) by default in pngjs

  // Row 0: Idle — breathing offset [0, 1, 2, 1]
  const breathOffsets = [0, -1, -2, -1];
  for (let col = 0; col < 4; col++) {
    const opts = makeBaseOpts(role, 0, col);
    opts.offsetY = breathOffsets[col];
    drawCharacter(png, opts);
  }

  // Row 1: Work — alternating arms [down, up, down, up]
  for (let col = 0; col < 4; col++) {
    const opts = makeBaseOpts(role, 1, col);
    opts.armUp = col % 2 === 1;
    drawCharacter(png, opts);
  }

  // Row 2: Walk — horizontal offset [left, center, right, center]
  const walkOffsets = [-2, 0, 2, 0];
  for (let col = 0; col < 4; col++) {
    const opts = makeBaseOpts(role, 2, col);
    opts.offsetX = walkOffsets[col];
    drawCharacter(png, opts);
  }

  // Row 3: Special — error-flash (0-1) + spawn-in (2-3)
  // Frame 0: normal
  drawCharacter(png, makeBaseOpts(role, 3, 0));
  // Frame 1: red tint
  const errorOpts = makeBaseOpts(role, 3, 1);
  errorOpts.redTint = true;
  drawCharacter(png, errorOpts);
  // Frame 2: spawn-in 50% scale
  const spawnSmall = makeBaseOpts(role, 3, 2);
  spawnSmall.scale = 0.5;
  drawCharacter(png, spawnSmall);
  // Frame 3: spawn-in full size
  drawCharacter(png, makeBaseOpts(role, 3, 3));

  // Row 4: Greyscale idle — same as Row 0 but greyscale colors
  const greyColor = toGreyscale(role.color);
  const greyLight = toGreyscale(role.lightColor);
  for (let col = 0; col < 4; col++) {
    const opts = makeBaseOpts(role, 4, col);
    opts.offsetY = breathOffsets[col];
    opts.color = greyColor;
    opts.lightColor = greyLight;
    drawCharacter(png, opts);
  }

  return png;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const outDir = resolve(import.meta.dirname ?? ".", "../public/sprites");
mkdirSync(outDir, { recursive: true });

// ── Glow radial gradient ──────────────────────────────────────────────────────

function generateGlowRadial(): PNG {
  const size = 64;
  const png = new PNG({ width: size, height: size, filterType: -1 });
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Quadratic falloff: 1.0 at center, 0.0 at edge
      const t = Math.max(0, 1 - (dist / maxR) ** 2);
      const alpha = Math.round(t * 255);
      setPixel(png, x, y, 255, 255, 255, alpha);
    }
  }
  return png;
}

// ── Generate all assets ───────────────────────────────────────────────────────

// Glow radial gradient (shared by all roles)
const glowPng = generateGlowRadial();
const glowBuffer = PNG.sync.write(glowPng);
const glowPath = resolve(outDir, "glow-radial.png");
writeFileSync(glowPath, glowBuffer);
console.log(`✓ ${glowPath} (${glowBuffer.length} bytes)`);

// Per-role sprite sheets
for (const role of ROLES) {
  const png = generateSheet(role);
  const buffer = PNG.sync.write(png);
  const outPath = resolve(outDir, `agent-${role.role}.png`);
  writeFileSync(outPath, buffer);
  console.log(`✓ ${outPath} (${buffer.length} bytes)`);
}

console.log(`\nGenerated ${ROLES.length} sprite sheets at ${outDir}`);
