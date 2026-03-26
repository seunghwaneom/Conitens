/**
 * generate-room-tiles.ts — Generates a 16x16 pixel tileset atlas for room floors.
 *
 * Atlas: 64x32 pixels (4 cols x 2 rows of 16x16 tiles)
 * Layout:
 *   Row 0: control(hex), office(wood), lab(tile), lobby(carpet)
 *   Row 1: archive(stone), corridor(metal), wall(dark border), door(opening)
 *
 * Run: pnpm generate:tiles
 */
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TILE = 16;
const COLS = 4;
const ROWS = 2;
const W = TILE * COLS; // 64
const H = TILE * ROWS; // 32

function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png: PNG, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(png, x0 + dx, y0 + dy, r, g, b, a);
}

// ── Tile painters ─────────────────────────────────────────────────────────────

function paintControl(png: PNG, ox: number, oy: number): void {
  // Hex pattern — dark teal with lighter hex grid
  fillRect(png, ox, oy, TILE, TILE, 15, 30, 40);
  // Hex dots
  for (let y = 0; y < TILE; y += 4)
    for (let x = (y % 8 === 0 ? 0 : 2); x < TILE; x += 4)
      setPixel(png, ox + x, oy + y, 30, 70, 80);
}

function paintOffice(png: PNG, ox: number, oy: number): void {
  // Wood floor — warm brown with plank lines
  fillRect(png, ox, oy, TILE, TILE, 45, 32, 22);
  for (let y = 0; y < TILE; y += 4)
    fillRect(png, ox, oy + y, TILE, 1, 55, 40, 28);
  // Vertical plank dividers
  for (let x = 0; x < TILE; x += 8)
    fillRect(png, ox + x, oy, 1, TILE, 38, 26, 18);
}

function paintLab(png: PNG, ox: number, oy: number): void {
  // Clean tile — light purple-grey with grid
  fillRect(png, ox, oy, TILE, TILE, 35, 28, 45);
  for (let y = 0; y < TILE; y += 4)
    fillRect(png, ox, oy + y, TILE, 1, 45, 35, 55);
  for (let x = 0; x < TILE; x += 4)
    fillRect(png, ox + x, oy, 1, TILE, 45, 35, 55);
}

function paintLobby(png: PNG, ox: number, oy: number): void {
  // Carpet — deep blue-grey with subtle pattern
  fillRect(png, ox, oy, TILE, TILE, 25, 25, 40);
  for (let y = 0; y < TILE; y += 2)
    for (let x = (y % 4 === 0 ? 0 : 1); x < TILE; x += 2)
      setPixel(png, ox + x, oy + y, 30, 30, 50);
}

function paintArchive(png: PNG, ox: number, oy: number): void {
  // Stone — grey with irregular lighter spots
  fillRect(png, ox, oy, TILE, TILE, 35, 35, 38);
  // Random-looking stone pattern (deterministic)
  for (let y = 0; y < TILE; y += 3)
    for (let x = ((y * 7 + 3) % 5); x < TILE; x += 5)
      fillRect(png, ox + x, oy + y, 2, 2, 42, 42, 46);
}

function paintCorridor(png: PNG, ox: number, oy: number): void {
  // Metal grating — dark grey with regular dots
  fillRect(png, ox, oy, TILE, TILE, 22, 24, 28);
  for (let y = 1; y < TILE; y += 3)
    for (let x = 1; x < TILE; x += 3)
      setPixel(png, ox + x, oy + y, 35, 38, 42);
  // Center line
  fillRect(png, ox, oy + 7, TILE, 2, 28, 32, 36);
}

function paintWall(png: PNG, ox: number, oy: number): void {
  // Dark wall border
  fillRect(png, ox, oy, TILE, TILE, 12, 12, 18);
  // Subtle edge highlight
  fillRect(png, ox, oy, TILE, 1, 18, 18, 25);
  fillRect(png, ox, oy, 1, TILE, 18, 18, 25);
}

function paintDoor(png: PNG, ox: number, oy: number): void {
  // Door opening — slightly lighter than wall with gap
  fillRect(png, ox, oy, TILE, TILE, 12, 12, 18);
  // Door opening (center gap)
  fillRect(png, ox + 4, oy + 2, 8, 12, 30, 35, 42);
  // Door frame
  fillRect(png, ox + 3, oy + 1, 1, 14, 20, 22, 28);
  fillRect(png, ox + 12, oy + 1, 1, 14, 20, 22, 28);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const png = new PNG({ width: W, height: H, filterType: -1 });

// Row 0: control, office, lab, lobby
paintControl(png, 0 * TILE, 0);
paintOffice(png, 1 * TILE, 0);
paintLab(png, 2 * TILE, 0);
paintLobby(png, 3 * TILE, 0);

// Row 1: archive, corridor, wall, door
paintArchive(png, 0 * TILE, TILE);
paintCorridor(png, 1 * TILE, TILE);
paintWall(png, 2 * TILE, TILE);
paintDoor(png, 3 * TILE, TILE);

const outDir = resolve(import.meta.dirname ?? ".", "../public/tiles");
mkdirSync(outDir, { recursive: true });
const buffer = PNG.sync.write(png);
const outPath = resolve(outDir, "room-tileset.png");
writeFileSync(outPath, buffer);
console.log(`Generated ${outPath} (${buffer.length} bytes, ${W}x${H})`);
