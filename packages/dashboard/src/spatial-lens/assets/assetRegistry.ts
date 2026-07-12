// allow: SIZE_OK - typed asset catalog keeps floor, wall, furniture, and character manifests together for registry validation.
export const SPATIAL_LENS_ASSET_KINDS = [
  "floor",
  "wall",
  "furniture",
  "character",
] as const;

export type SpatialLensAssetKind = (typeof SPATIAL_LENS_ASSET_KINDS)[number];

export interface SpatialLensTileSize {
  readonly w: number;
  readonly h: number;
}

export interface SpatialLensAnchor {
  readonly x: number;
  readonly y: number;
}

export interface SpatialLensSpriteRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SpatialLensAnimationFrame {
  readonly frameId: string;
  readonly sourceRect?: SpatialLensSpriteRect;
  readonly durationMs: number;
}

export interface SpatialLensCssPlaceholder {
  readonly kind: "css";
  readonly className: string;
  readonly label: string;
  readonly tone:
    | "floor"
    | "wall"
    | "furniture"
    | "character";
}

interface SpatialLensAssetBase {
  readonly id: string;
  readonly kind: SpatialLensAssetKind;
  readonly label: string;
  readonly src: string | null;
  readonly tileSize: SpatialLensTileSize;
  readonly anchor: SpatialLensAnchor;
  readonly rotationGroup: string;
  readonly stateGroup: string;
  readonly animationFrames: readonly SpatialLensAnimationFrame[];
  readonly fallback?: SpatialLensCssPlaceholder;
  readonly isPlaceholder?: boolean;
}

export type SpatialLensFloorSurface =
  | "control"
  | "corridor"
  | "lab"
  | "lane"
  | "lobby"
  | "stage"
  | "workspace";

export interface SpatialLensFloorAsset extends SpatialLensAssetBase {
  readonly kind: "floor";
  readonly surface: SpatialLensFloorSurface;
  readonly repeatable: true;
}

export type SpatialLensWallOrientation =
  | "north"
  | "east"
  | "south"
  | "west"
  | "corner";

export interface SpatialLensWallAsset extends SpatialLensAssetBase {
  readonly kind: "wall";
  readonly orientation: SpatialLensWallOrientation;
  readonly repeatable: true;
}

export interface SpatialLensFurnitureAsset extends SpatialLensAssetBase {
  readonly kind: "furniture";
  readonly sourceRect: SpatialLensSpriteRect;
  readonly footprint: SpatialLensTileSize;
  readonly zIndexBand: "floor" | "furniture" | "ceiling";
}

export type SpatialLensCharacterRole =
  | "orchestrator"
  | "implementer"
  | "researcher"
  | "reviewer"
  | "validator"
  | "placeholder";

export type SpatialLensCharacterFacing =
  | "down"
  | "left"
  | "right";

export type SpatialLensCharacterState =
  | "idle"
  | "walking"
  | "working"
  | "reviewing"
  | "blocked";

export interface SpatialLensCharacterAsset extends SpatialLensAssetBase {
  readonly kind: "character";
  readonly role: SpatialLensCharacterRole;
  readonly frameSize: SpatialLensTileSize;
  readonly defaultFacing: SpatialLensCharacterFacing;
  readonly states: readonly SpatialLensCharacterState[];
}

export type SpatialLensAssetManifest =
  | SpatialLensFloorAsset
  | SpatialLensWallAsset
  | SpatialLensFurnitureAsset
  | SpatialLensCharacterAsset;

export const SPATIAL_LENS_MANUAL_IMPORT_ROOT =
  "packages/dashboard/public/spatial-lens";
export const SPATIAL_LENS_PUBLIC_ASSET_ROOT = "/spatial-lens";

const FIXTURE_SPRITE_SHEET = "/office-fixtures.png";
const FIXTURE_CELL_SIZE = 24;
const CHARACTER_CELL_SIZE = 64;

function staticFrames(
  frameId: string,
  sourceRect?: SpatialLensSpriteRect,
): readonly SpatialLensAnimationFrame[] {
  const frame: SpatialLensAnimationFrame = { frameId, durationMs: 0 };
  return sourceRect ? [{ ...frame, sourceRect }] : [frame];
}

function createFloorAsset(
  surface: SpatialLensFloorSurface,
  label: string,
  src: string,
): SpatialLensFloorAsset {
  return {
    id: `floor.${surface}`,
    kind: "floor",
    label,
    src,
    tileSize: { w: 24, h: 24 },
    anchor: { x: 0, y: 0 },
    rotationGroup: "floor.cardinal",
    stateGroup: "floor.static",
    animationFrames: staticFrames("floor.static"),
    surface,
    repeatable: true,
  };
}

function createWallAsset(
  id: string,
  label: string,
  orientation: SpatialLensWallOrientation,
): SpatialLensWallAsset {
  return {
    id,
    kind: "wall",
    label,
    src: null,
    tileSize: { w: 24, h: 24 },
    anchor: { x: 0, y: 0 },
    rotationGroup: `wall.${orientation}`,
    stateGroup: "wall.static",
    animationFrames: staticFrames("wall.static"),
    fallback: {
      kind: "css",
      className: `spatial-lens-wall-${orientation}`,
      label: "CSS wall placeholder",
      tone: "wall",
    },
    orientation,
    repeatable: true,
    isPlaceholder: true,
  };
}

function createFurnitureAsset(
  fixtureId: string,
  label: string,
  spriteIndex: number,
  width: number,
  height: number,
  footprint: SpatialLensTileSize = { w: 1, h: 1 },
): SpatialLensFurnitureAsset {
  const sourceRect = {
    x: spriteIndex * FIXTURE_CELL_SIZE,
    y: 0,
    w: FIXTURE_CELL_SIZE,
    h: FIXTURE_CELL_SIZE,
  };

  return {
    id: `furniture.${fixtureId}`,
    kind: "furniture",
    label,
    src: FIXTURE_SPRITE_SHEET,
    tileSize: { w: width, h: height },
    anchor: { x: 0.5, y: 1 },
    rotationGroup: "furniture.cardinal",
    stateGroup: "furniture.static",
    animationFrames: staticFrames("furniture.static", sourceRect),
    sourceRect,
    footprint,
    zIndexBand: "furniture",
  };
}

const CHARACTER_SPRITES: Record<
  Exclude<SpatialLensCharacterRole, "placeholder">,
  string
> = {
  orchestrator: "/agent-sprites/generated/orchestrator/sprite-sheet-alpha.png",
  implementer: "/agent-sprites/generated/implementer/sprite-sheet-alpha.png",
  researcher: "/agent-sprites/generated/researcher/sprite-sheet-alpha.png",
  reviewer: "/agent-sprites/generated/reviewer/sprite-sheet-alpha.png",
  validator: "/agent-sprites/generated/validator/sprite-sheet-alpha.png",
};

function createCharacterAsset(
  role: Exclude<SpatialLensCharacterRole, "placeholder">,
  label: string,
): SpatialLensCharacterAsset {
  return {
    id: `character.${role}`,
    kind: "character",
    label,
    src: CHARACTER_SPRITES[role],
    tileSize: { w: CHARACTER_CELL_SIZE, h: CHARACTER_CELL_SIZE },
    anchor: { x: 0.5, y: 1 },
    rotationGroup: "character.facing",
    stateGroup: "character.role-state",
    animationFrames: staticFrames("character.idle", {
      x: 0,
      y: 0,
      w: CHARACTER_CELL_SIZE,
      h: CHARACTER_CELL_SIZE,
    }),
    role,
    frameSize: { w: CHARACTER_CELL_SIZE, h: CHARACTER_CELL_SIZE },
    defaultFacing: "down",
    states: ["idle", "walking", "working", "reviewing", "blocked"],
  };
}

export const SPATIAL_LENS_PLACEHOLDER_ASSETS = {
  floor: {
    id: "floor.placeholder",
    kind: "floor",
    label: "Placeholder floor tile",
    src: "/office-floor-stage.png",
    tileSize: { w: 24, h: 24 },
    anchor: { x: 0, y: 0 },
    rotationGroup: "floor.cardinal",
    stateGroup: "floor.static",
    animationFrames: staticFrames("floor.placeholder"),
    surface: "stage",
    repeatable: true,
    isPlaceholder: true,
  },
  wall: createWallAsset("wall.placeholder", "Placeholder wall edge", "north"),
  furniture: {
    id: "furniture.placeholder",
    kind: "furniture",
    label: "Placeholder furniture block",
    src: null,
    tileSize: { w: 24, h: 24 },
    anchor: { x: 0.5, y: 1 },
    rotationGroup: "furniture.cardinal",
    stateGroup: "furniture.static",
    animationFrames: staticFrames("furniture.placeholder"),
    fallback: {
      kind: "css",
      className: "spatial-lens-furniture-placeholder",
      label: "CSS furniture placeholder",
      tone: "furniture",
    },
    sourceRect: { x: 0, y: 0, w: 24, h: 24 },
    footprint: { w: 1, h: 1 },
    zIndexBand: "furniture",
    isPlaceholder: true,
  },
  character: {
    id: "character.placeholder",
    kind: "character",
    label: "Placeholder agent sprite",
    src: null,
    tileSize: { w: 24, h: 24 },
    anchor: { x: 0.5, y: 1 },
    rotationGroup: "character.facing",
    stateGroup: "character.role-state",
    animationFrames: staticFrames("character.placeholder"),
    fallback: {
      kind: "css",
      className: "spatial-lens-character-placeholder",
      label: "CSS character placeholder",
      tone: "character",
    },
    role: "placeholder",
    frameSize: { w: 24, h: 24 },
    defaultFacing: "down",
    states: ["idle"],
    isPlaceholder: true,
  },
} as const satisfies Record<SpatialLensAssetKind, SpatialLensAssetManifest>;

export const SPATIAL_LENS_FLOOR_ASSETS: readonly SpatialLensFloorAsset[] = [
  createFloorAsset("control", "Control room floor", "/office-floor-control.png"),
  createFloorAsset("corridor", "Corridor floor", "/office-floor-corridor.png"),
  createFloorAsset("lab", "Lab floor", "/office-floor-lab.png"),
  createFloorAsset("lane", "Handoff lane floor", "/office-floor-lane.png"),
  createFloorAsset("lobby", "Lobby floor", "/office-floor-lobby.png"),
  createFloorAsset("stage", "Main stage floor", "/office-floor-stage.png"),
  createFloorAsset("workspace", "Workspace floor", "/office-floor-workspace.png"),
];

export const SPATIAL_LENS_WALL_ASSETS: readonly SpatialLensWallAsset[] = [
  createWallAsset("wall.north", "North wall edge", "north"),
  createWallAsset("wall.east", "East wall edge", "east"),
  createWallAsset("wall.south", "South wall edge", "south"),
  createWallAsset("wall.west", "West wall edge", "west"),
  createWallAsset("wall.corner", "Corner wall cap", "corner"),
];

export const SPATIAL_LENS_FURNITURE_ASSETS: readonly SpatialLensFurnitureAsset[] = [
  createFurnitureAsset("desk", "Operator desk", 0, 24, 24, { w: 2, h: 1 }),
  createFurnitureAsset("bench", "Bench", 1, 24, 14, { w: 2, h: 1 }),
  createFurnitureAsset("console", "Console", 2, 24, 16, { w: 2, h: 1 }),
  createFurnitureAsset("reception", "Reception desk", 3, 28, 16, { w: 2, h: 1 }),
  createFurnitureAsset("chair", "Chair", 4, 24, 24),
  createFurnitureAsset("monitor", "Monitor", 5, 24, 24),
  createFurnitureAsset("screen", "Status screen", 6, 24, 24),
  createFurnitureAsset("terminal", "Terminal", 7, 24, 24),
  createFurnitureAsset("plant", "Plant", 8, 24, 24),
  createFurnitureAsset("board", "Review board", 9, 24, 24),
  createFurnitureAsset("reception-return", "Reception return", 10, 18, 24),
  createFurnitureAsset("server", "Server", 11, 20, 24),
  createFurnitureAsset("rack", "Server rack", 12, 20, 24),
  createFurnitureAsset("locker", "Locker", 13, 20, 24),
  createFurnitureAsset("shelf", "Shelf", 14, 20, 24),
  createFurnitureAsset("lamp", "Lamp", 15, 12, 12),
  createFurnitureAsset("note", "Note", 16, 12, 12),
  createFurnitureAsset("coffee", "Coffee", 17, 8, 8),
  createFurnitureAsset("stamp", "Approval stamp", 18, 12, 12),
  createFurnitureAsset("cart", "Cart", 19, 16, 20),
  createFurnitureAsset("cabinet", "Cabinet", 20, 20, 24),
  createFurnitureAsset("couch", "Couch", 21, 24, 14, { w: 2, h: 1 }),
  createFurnitureAsset("clock", "Clock", 22, 10, 10),
  createFurnitureAsset("bulletin", "Bulletin", 23, 16, 12),
  createFurnitureAsset("extinguisher", "Extinguisher", 24, 6, 16),
];

export const SPATIAL_LENS_CHARACTER_ASSETS: readonly SpatialLensCharacterAsset[] = [
  createCharacterAsset("orchestrator", "Orchestrator agent"),
  createCharacterAsset("implementer", "Implementer agent"),
  createCharacterAsset("researcher", "Researcher agent"),
  createCharacterAsset("reviewer", "Reviewer agent"),
  createCharacterAsset("validator", "Validator agent"),
];

export const SPATIAL_LENS_ASSET_MANIFEST: readonly SpatialLensAssetManifest[] = [
  ...SPATIAL_LENS_FLOOR_ASSETS,
  ...SPATIAL_LENS_WALL_ASSETS,
  ...SPATIAL_LENS_FURNITURE_ASSETS,
  ...SPATIAL_LENS_CHARACTER_ASSETS,
  ...Object.values(SPATIAL_LENS_PLACEHOLDER_ASSETS),
];

const SPATIAL_LENS_ASSET_INDEX = new Map(
  SPATIAL_LENS_ASSET_MANIFEST.map((asset) => [asset.id, asset]),
);

export function resolveSpatialLensAsset(
  assetId: string,
): SpatialLensAssetManifest | null {
  return SPATIAL_LENS_ASSET_INDEX.get(assetId) ?? null;
}

export function getSpatialLensAssetsByKind(
  kind: SpatialLensAssetKind,
): SpatialLensAssetManifest[] {
  return SPATIAL_LENS_ASSET_MANIFEST.filter((asset) => asset.kind === kind);
}

export function getSpatialLensAssetIdsByKind(
  kind: SpatialLensAssetKind,
): string[] {
  return getSpatialLensAssetsByKind(kind).map((asset) => asset.id);
}

export function getSpatialLensAssetOrPlaceholder(
  kind: SpatialLensAssetKind,
  assetId: string,
): SpatialLensAssetManifest {
  const asset = resolveSpatialLensAsset(assetId);
  if (asset?.kind === kind) {
    return asset;
  }

  return SPATIAL_LENS_PLACEHOLDER_ASSETS[kind];
}

export function validateSpatialLensAssetManifest(
  assets: readonly SpatialLensAssetManifest[] = SPATIAL_LENS_ASSET_MANIFEST,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const validKinds: readonly string[] = SPATIAL_LENS_ASSET_KINDS;

  for (const asset of assets) {
    if (!asset.id.trim()) {
      errors.push("asset id is required");
    } else if (ids.has(asset.id)) {
      errors.push(`duplicate asset id: ${asset.id}`);
    }
    ids.add(asset.id);

    if (!validKinds.includes(asset.kind)) {
      errors.push(`${asset.id} has unsupported kind: ${asset.kind}`);
    }
    if (!asset.label.trim()) {
      errors.push(`${asset.id} label is required`);
    }
    if (asset.tileSize.w <= 0 || asset.tileSize.h <= 0) {
      errors.push(`${asset.id} tileSize must be positive`);
    }
    if (!Number.isFinite(asset.anchor.x) || !Number.isFinite(asset.anchor.y)) {
      errors.push(`${asset.id} anchor must be finite`);
    }
    if (!asset.rotationGroup.trim()) {
      errors.push(`${asset.id} rotationGroup is required`);
    }
    if (!asset.stateGroup.trim()) {
      errors.push(`${asset.id} stateGroup is required`);
    }
    if (asset.animationFrames.length === 0) {
      errors.push(`${asset.id} needs at least one animation frame`);
    }
    if (asset.src && isRemoteAssetSource(asset.src)) {
      errors.push(`${asset.id} uses a remote asset source`);
    }

    for (const frame of asset.animationFrames) {
      if (!frame.frameId.trim()) {
        errors.push(`${asset.id} has an unnamed animation frame`);
      }
      if (frame.durationMs < 0) {
        errors.push(`${asset.id}/${frame.frameId} has negative durationMs`);
      }
    }
  }

  return errors;
}

function isRemoteAssetSource(src: string): boolean {
  return /^(https?:)?\/\//i.test(src);
}
