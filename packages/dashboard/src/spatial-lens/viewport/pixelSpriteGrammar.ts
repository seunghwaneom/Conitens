import type { PixelPropLayer } from "./roomTemplates.ts";

export const TILE_PX = 16;
export const ROOM_TILE_COLUMNS = 24;
export const ROOM_TILE_ROWS = 24;
export const SPRITE_SCALE = 2;
export const OUTLINE_PX = 2;
export const SHADOW_PX = 1;
export const WALL_HEIGHT_TILES = 2;
export const CHARACTER_W = 24;
export const CHARACTER_H = 32;
export const PROP_ANCHOR_RULE = "bottom-center";

export const ALLOWED_PIXEL_COLORS = {
  outline: "#182431",
  shadow: "#0e141d",
  wallDark: "#243244",
  wallLight: "#c2b18d",
  floorWarm: "#cfa86e",
  floorCool: "#b9d2d8",
  woodTop: "#9a602e",
  woodFront: "#6d3f21",
  paper: "#fff4d6",
  blue: "#4aa8ff",
  green: "#5fcb7c",
  red: "#ec5f64",
  amber: "#e4af48",
  metal: "#7e8b96",
  plant: "#58b96c",
} as const;

const LAYER_Z_OFFSETS: Record<PixelPropLayer, number> = {
  wall: -20,
  floor: 0,
  workstation: 10,
  operational: 20,
};

export function snapPercentToRoomTile(
  value: number,
  tiles = ROOM_TILE_COLUMNS,
): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Number(((Math.round((clamped / 100) * tiles) / tiles) * 100).toFixed(3));
}

export function getPixelLayerIndex({
  y,
  layer = "floor",
}: {
  y: number;
  layer?: PixelPropLayer;
}): number {
  return LAYER_Z_OFFSETS[layer] + Math.round(y * 10);
}

export function comparePixelY(
  a: { readonly id: string; readonly y: number; readonly layer?: PixelPropLayer },
  b: { readonly id: string; readonly y: number; readonly layer?: PixelPropLayer },
): number {
  const yDelta =
    getPixelLayerIndex({ y: a.y, layer: a.layer }) -
    getPixelLayerIndex({ y: b.y, layer: b.layer });
  if (yDelta !== 0) return yDelta;
  return a.id.localeCompare(b.id);
}
