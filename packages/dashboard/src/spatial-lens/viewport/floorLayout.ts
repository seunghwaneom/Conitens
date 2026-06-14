export interface FloorLayoutRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FloorLayoutPoint {
  readonly left: number;
  readonly top: number;
}

export type FloorplateZoneTone =
  | "shell"
  | "left-wing"
  | "right-wing"
  | "commons-wing"
  | "service";

export interface FloorplateZone {
  readonly id: string;
  readonly rect: FloorLayoutRect;
  readonly tone: FloorplateZoneTone;
}

export type BuildingWallRole = "outer" | "inner" | "trim";
export type BuildingWallOrientation = "horizontal" | "vertical";

export interface BuildingWallSegment {
  readonly id: string;
  readonly rect: FloorLayoutRect;
  readonly role: BuildingWallRole;
  readonly orientation: BuildingWallOrientation;
}

export interface StructuralColumn {
  readonly id: string;
  readonly point: FloorLayoutPoint;
  readonly size: "small" | "large";
}

export interface SpatialLensBuildingLayout {
  readonly bounds: FloorLayoutRect;
  readonly floorplateZones: readonly FloorplateZone[];
  readonly wallSegments: readonly BuildingWallSegment[];
  readonly columns: readonly StructuralColumn[];
}

export const SPATIAL_LENS_BUILDING_LAYOUT = {
  bounds: { x: 1, y: 1, w: 94, h: 96 },
  floorplateZones: [
    { id: "floorplate.left-wing", rect: { x: 1, y: 1, w: 35, h: 60 }, tone: "left-wing" },
    { id: "floorplate.center-spine", rect: { x: 33, y: 0, w: 27, h: 100 }, tone: "shell" },
    { id: "floorplate.right-wing", rect: { x: 58, y: 1, w: 35, h: 53 }, tone: "right-wing" },
    { id: "floorplate.commons-wing", rect: { x: 31, y: 57, w: 30, h: 40 }, tone: "commons-wing" },
    { id: "floorplate.research-wing", rect: { x: 58, y: 55, w: 35, h: 29 }, tone: "right-wing" },
    { id: "floorplate.bottom-service", rect: { x: 31, y: 81, w: 32, h: 17 }, tone: "service" },
  ],
  wallSegments: [
    { id: "wall.outer.north-left", rect: { x: 1, y: 1, w: 35, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.outer.north-center", rect: { x: 33, y: 0, w: 27, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.outer.north-right", rect: { x: 58, y: 1, w: 35, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.outer.west-upper", rect: { x: 1, y: 1, w: 2.4, h: 60 }, role: "outer", orientation: "vertical" },
    { id: "wall.outer.west-lower", rect: { x: 31, y: 57, w: 2.4, h: 40 }, role: "outer", orientation: "vertical" },
    { id: "wall.outer.east-upper", rect: { x: 90.6, y: 1, w: 2.4, h: 53 }, role: "outer", orientation: "vertical" },
    { id: "wall.outer.east-lower", rect: { x: 90.6, y: 55, w: 2.4, h: 29 }, role: "outer", orientation: "vertical" },
    { id: "wall.outer.south-left", rect: { x: 31, y: 94.6, w: 24, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.outer.south-center", rect: { x: 33, y: 97.6, w: 27, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.outer.south-right", rect: { x: 58, y: 81.6, w: 35, h: 2.4 }, role: "outer", orientation: "horizontal" },
    { id: "wall.inner.left-corridor-edge", rect: { x: 35.4, y: 3, w: 1.2, h: 90 }, role: "inner", orientation: "vertical" },
    { id: "wall.inner.right-corridor-edge", rect: { x: 57.4, y: 3, w: 1.2, h: 90 }, role: "inner", orientation: "vertical" },
    { id: "wall.trim.top-operations", rect: { x: 3, y: 23.8, w: 30, h: 0.8 }, role: "trim", orientation: "horizontal" },
    { id: "wall.trim.impl-commons", rect: { x: 3, y: 60.4, w: 52, h: 0.8 }, role: "trim", orientation: "horizontal" },
    { id: "wall.trim.right-wing-seam", rect: { x: 58, y: 26.6, w: 35, h: 0.8 }, role: "trim", orientation: "horizontal" },
    { id: "wall.trim.review-seam", rect: { x: 58, y: 54.6, w: 35, h: 0.8 }, role: "trim", orientation: "horizontal" },
  ],
  columns: [
    { id: "column.north-junction-left", point: { left: 35.7, top: 3.6 }, size: "large" },
    { id: "column.north-junction-right", point: { left: 57.7, top: 3.6 }, size: "large" },
    { id: "column.mid-junction-left", point: { left: 35.7, top: 60.5 }, size: "small" },
    { id: "column.mid-junction-right", point: { left: 57.7, top: 54.2 }, size: "small" },
    { id: "column.south-junction-left", point: { left: 35.7, top: 94.8 }, size: "large" },
    { id: "column.south-junction-right", point: { left: 57.7, top: 81.8 }, size: "large" },
  ],
} as const satisfies SpatialLensBuildingLayout;
