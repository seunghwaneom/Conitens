import type { PixelPropKind, PixelPropTone } from "../viewport/roomTemplates.js";

export type GeneratedSpatialLensSpriteKind =
  | "furniture"
  | "prop"
  | "character";

export type GeneratedSpatialLensSpriteScale = 1 | 2 | 3;

export interface GeneratedSpatialLensSpriteAnchor {
  readonly x: number;
  readonly y: number;
}

export interface GeneratedSpatialLensSpriteAsset {
  readonly id: string;
  readonly kind: GeneratedSpatialLensSpriteKind;
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly anchor: GeneratedSpatialLensSpriteAnchor;
  readonly scale: GeneratedSpatialLensSpriteScale;
  readonly pixelPropKind?: PixelPropKind;
}

export interface PixelPropSpriteRequest {
  readonly id: string;
  readonly kind: PixelPropKind;
  readonly tone?: PixelPropTone;
}

export const GENERATED_SPATIAL_LENS_ASSET_ROOT =
  "/assets/spatial-lens/generated";

export const GENERATED_SPATIAL_LENS_SPRITE_SHEET =
  `${GENERATED_SPATIAL_LENS_ASSET_ROOT}/pixel-office-asset-sheet-1x.png`;

export const GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE = {
  w: 384,
  h: 256,
} as const;

export const GENERATED_SPATIAL_LENS_SOURCE_SPRITE_SHEET_SIZE = {
  w: 1536,
  h: 1024,
  downsample: 4,
} as const;

const BOTTOM_CENTER = { x: 0.5, y: 1 } as const;
const CENTER = { x: 0.5, y: 0.5 } as const;
const TOP_LEFT = { x: 0, y: 0 } as const;

function sprite(
  id: string,
  kind: GeneratedSpatialLensSpriteKind,
  rect: Pick<GeneratedSpatialLensSpriteAsset, "x" | "y" | "w" | "h">,
  options: Pick<GeneratedSpatialLensSpriteAsset, "anchor" | "scale"> & {
    readonly pixelPropKind?: PixelPropKind;
  },
): GeneratedSpatialLensSpriteAsset {
  return {
    id,
    kind,
    src: GENERATED_SPATIAL_LENS_SPRITE_SHEET,
    ...rect,
    ...options,
  };
}

export const GENERATED_SPATIAL_LENS_SPRITES = [
  sprite("furniture.consoleDesk", "furniture", { x: 7, y: 6, w: 59, h: 37 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "desk",
  }),
  sprite("furniture.regularDesk", "furniture", { x: 77, y: 6, w: 56, h: 36 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "desk",
  }),
  sprite("furniture.operatorChair", "furniture", { x: 155, y: 10, w: 16, h: 31 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "chair",
  }),
  sprite("prop.monitor", "prop", { x: 194, y: 14, w: 24, h: 22 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "monitor",
  }),
  sprite("prop.doubleMonitor", "prop", { x: 234, y: 14, w: 47, h: 23 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "monitor",
  }),
  sprite("prop.keyboard", "prop", { x: 294, y: 18, w: 33, h: 15 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "keyboard",
  }),
  sprite("prop.laptop", "prop", { x: 342, y: 12, w: 29, h: 26 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "laptop",
  }),
  sprite("furniture.serverRack", "furniture", { x: 11, y: 49, w: 22, h: 37 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "serverRack",
  }),
  sprite("prop.statusBoard", "prop", { x: 46, y: 51, w: 44, h: 31 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "statusBoard",
  }),
  sprite("prop.whiteboard", "prop", { x: 98, y: 52, w: 42, h: 30 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "whiteboard",
  }),
  sprite("prop.checklistBoard", "prop", { x: 152, y: 51, w: 24, h: 33 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "clipboard",
  }),
  sprite("prop.clipboardRack", "prop", { x: 189, y: 57, w: 50, h: 26 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "clipboard",
  }),
  sprite("furniture.stampDesk", "furniture", { x: 248, y: 56, w: 30, h: 26 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "stampPad",
  }),
  sprite("prop.inboxTray", "prop", { x: 292, y: 57, w: 32, h: 25 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "inboxTray",
  }),
  sprite("prop.outboxTray", "prop", { x: 336, y: 57, w: 32, h: 25 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "outboxTray",
  }),
  sprite("prop.documentStack", "prop", { x: 11, y: 92, w: 21, h: 23 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "documentStack",
  }),
  sprite("prop.fileBox", "prop", { x: 51, y: 90, w: 29, h: 26 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "fileBox",
  }),
  sprite("prop.archiveBox", "prop", { x: 102, y: 90, w: 26, h: 26 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("prop.coffeeCup", "prop", { x: 148, y: 94, w: 20, h: 20 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "coffeeCup",
  }),
  sprite("prop.cableRun", "prop", { x: 188, y: 95, w: 46, h: 20 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "cable",
  }),
  sprite("prop.alertLight", "prop", { x: 256, y: 94, w: 15, h: 20 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "alertLight",
  }),
  sprite("prop.greenStatusLight", "prop", { x: 301, y: 96, w: 14, h: 18 }, {
    anchor: CENTER,
    scale: 1,
  }),
  sprite("prop.redStatusLight", "prop", { x: 343, y: 96, w: 14, h: 18 }, {
    anchor: CENTER,
    scale: 1,
  }),
  sprite("prop.routePort", "prop", { x: 12, y: 127, w: 22, h: 20 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "routePort",
  }),
  sprite("prop.packet", "prop", { x: 51, y: 128, w: 25, h: 18 }, {
    anchor: CENTER,
    scale: 1,
  }),
  sprite("prop.barrier", "prop", { x: 134, y: 126, w: 46, h: 21 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "barrier",
  }),
  sprite("prop.cone", "prop", { x: 196, y: 124, w: 19, h: 24 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "cone",
  }),
  sprite("prop.plant", "prop", { x: 232, y: 123, w: 19, h: 27 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "plant",
  }),
  sprite("furniture.shelf", "furniture", { x: 268, y: 124, w: 39, h: 28 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "shelf",
  }),
  sprite("prop.bulletinBoard", "prop", { x: 324, y: 123, w: 44, h: 27 }, {
    anchor: CENTER,
    scale: 1,
    pixelPropKind: "bulletinBoard",
  }),
  sprite("prop.sampleRack", "prop", { x: 9, y: 157, w: 47, h: 31 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "sampleRack",
  }),
  sprite("prop.labMachine", "prop", { x: 128, y: 156, w: 26, h: 32 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
    pixelPropKind: "machine",
  }),
  sprite("prop.reagentBottleCluster", "prop", { x: 178, y: 160, w: 65, h: 22 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("prop.stickyNotes", "prop", { x: 259, y: 161, w: 55, h: 32 }, {
    anchor: TOP_LEFT,
    scale: 1,
    pixelPropKind: "stickyNote",
  }),
  sprite("character.architectIdle", "character", { x: 6, y: 196, w: 19, h: 34 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.architectWorking", "character", { x: 32, y: 198, w: 33, h: 32 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.architectReviewing", "character", { x: 69, y: 198, w: 24, h: 31 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.sentinelIdle", "character", { x: 110, y: 197, w: 18, h: 33 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.sentinelWorking", "character", { x: 132, y: 198, w: 22, h: 32 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.sentinelReviewing", "character", { x: 153, y: 199, w: 24, h: 30 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.workerIdle", "character", { x: 195, y: 194, w: 19, h: 35 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.workerWorking", "character", { x: 219, y: 198, w: 27, h: 31 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.workerReviewing", "character", { x: 248, y: 198, w: 23, h: 31 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.ownerIdle", "character", { x: 316, y: 200, w: 25, h: 29 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
  sprite("character.ownerWorking", "character", { x: 344, y: 199, w: 16, h: 30 }, {
    anchor: BOTTOM_CENTER,
    scale: 1,
  }),
] as const satisfies readonly GeneratedSpatialLensSpriteAsset[];

const GENERATED_SPRITE_BY_ID = new Map(
  GENERATED_SPATIAL_LENS_SPRITES.map((asset) => [asset.id, asset]),
);

const DEFAULT_PIXEL_PROP_SPRITES = {
  desk: "furniture.regularDesk",
  chair: "furniture.operatorChair",
  monitor: "prop.monitor",
  keyboard: "prop.keyboard",
  laptop: "prop.laptop",
  serverRack: "furniture.serverRack",
  fileBox: "prop.fileBox",
  documentStack: "prop.documentStack",
  clipboard: "prop.clipboardRack",
  stampPad: "furniture.stampDesk",
  whiteboard: "prop.whiteboard",
  statusBoard: "prop.statusBoard",
  alertLight: "prop.alertLight",
  plant: "prop.plant",
  shelf: "furniture.shelf",
  coffeeCup: "prop.coffeeCup",
  cable: "prop.cableRun",
  inboxTray: "prop.inboxTray",
  outboxTray: "prop.outboxTray",
  barrier: "prop.barrier",
  cone: "prop.cone",
  routePort: "prop.routePort",
  sampleRack: "prop.sampleRack",
  machine: "prop.labMachine",
  stickyNote: "prop.stickyNotes",
  bulletinBoard: "prop.bulletinBoard",
} as const satisfies Record<PixelPropKind, string>;

export function resolveGeneratedSpatialLensSprite(
  spriteId: string,
): GeneratedSpatialLensSpriteAsset | null {
  return GENERATED_SPRITE_BY_ID.get(spriteId) ?? null;
}

export function getGeneratedSpatialLensSpriteForPixelProp(
  request: PixelPropSpriteRequest,
): GeneratedSpatialLensSpriteAsset | null {
  if (
    request.kind === "desk" &&
    (request.tone === "blue" || request.id.includes("console"))
  ) {
    return resolveGeneratedSpatialLensSprite("furniture.consoleDesk");
  }

  if (
    request.kind === "monitor" &&
    (request.tone === "live" || request.id.includes("console"))
  ) {
    return resolveGeneratedSpatialLensSprite("prop.doubleMonitor");
  }

  const spriteId = DEFAULT_PIXEL_PROP_SPRITES[request.kind];
  return resolveGeneratedSpatialLensSprite(spriteId);
}

export function validateGeneratedSpatialLensSprites(
  sprites: readonly GeneratedSpatialLensSpriteAsset[] =
    GENERATED_SPATIAL_LENS_SPRITES,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const asset of sprites) {
    if (!asset.id.trim()) {
      errors.push("generated sprite id is required");
    } else if (ids.has(asset.id)) {
      errors.push(`duplicate generated sprite id: ${asset.id}`);
    }
    ids.add(asset.id);

    if (asset.src !== GENERATED_SPATIAL_LENS_SPRITE_SHEET) {
      errors.push(`${asset.id} must use the generated Spatial Lens sheet`);
    }
    if (!Number.isInteger(asset.scale) || asset.scale < 1 || asset.scale > 3) {
      errors.push(`${asset.id} scale must be an integer from 1 to 3`);
    }
    if (asset.x < 0 || asset.y < 0 || asset.w <= 0 || asset.h <= 0) {
      errors.push(`${asset.id} has an invalid source rect`);
    }
    if (
      asset.x + asset.w > GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.w ||
      asset.y + asset.h > GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.h
    ) {
      errors.push(`${asset.id} source rect exceeds generated sheet bounds`);
    }
    if (!Number.isFinite(asset.anchor.x) || !Number.isFinite(asset.anchor.y)) {
      errors.push(`${asset.id} anchor must be finite`);
    }
  }
  return errors;
}
