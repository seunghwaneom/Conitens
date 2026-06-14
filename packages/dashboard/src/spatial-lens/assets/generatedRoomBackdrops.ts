import { GENERATED_SPATIAL_LENS_ASSET_ROOT } from "./generatedAssetManifest.ts";
import type { RoomTemplateId } from "../viewport/roomTemplates.ts";

export type GeneratedSpatialLensRoomBackdropUsage = "room" | "target-edge";
export type GeneratedSpatialLensRoomBackdropCurationSource =
  | "sprite-gen-component-row"
  | "sprite-gen-sheet-unpack";

export interface GeneratedSpatialLensRoomBackdropCuration {
  readonly source: GeneratedSpatialLensRoomBackdropCurationSource;
  readonly tileW: number;
  readonly tileH: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface GeneratedSpatialLensRoomBackdrop {
  readonly id: string;
  readonly roomId: RoomTemplateId;
  readonly usage: GeneratedSpatialLensRoomBackdropUsage;
  readonly src: string;
  readonly w: number;
  readonly h: number;
  readonly backgroundPosition: string;
  readonly backgroundSize: string;
  readonly opacity: number;
  readonly curation: GeneratedSpatialLensRoomBackdropCuration;
}

const roomBackdrop = (
  id: string,
  roomId: RoomTemplateId,
  usage: GeneratedSpatialLensRoomBackdropUsage,
  srcName: string,
  w: number,
  h: number,
  options: Pick<
    GeneratedSpatialLensRoomBackdrop,
    "backgroundPosition" | "backgroundSize" | "opacity" | "curation"
  >,
): GeneratedSpatialLensRoomBackdrop => ({
  id,
  roomId,
  usage,
  src: `${GENERATED_SPATIAL_LENS_ASSET_ROOT}/${srcName}`,
  w,
  h,
  ...options,
});

export const GENERATED_SPATIAL_LENS_ROOM_BACKDROPS = [
  roomBackdrop(
    "room.ops-control.generated-backdrop",
    "ops-control",
    "room",
    "ops-control-room-backdrop.png",
    1661,
    947,
    {
      backgroundPosition: "50% 48%",
      backgroundSize: "cover",
      opacity: 0.5,
      curation: {
        source: "sprite-gen-component-row",
        tileW: 16,
        tileH: 16,
        anchorX: 0.5,
        anchorY: 1,
      },
    },
  ),
  roomBackdrop(
    "room.validation-office.generated-backdrop",
    "validation-office",
    "room",
    "validation-office-room-backdrop.png",
    1810,
    869,
    {
      backgroundPosition: "48% 52%",
      backgroundSize: "cover",
      opacity: 0.48,
      curation: {
        source: "sprite-gen-component-row",
        tileW: 16,
        tileH: 16,
        anchorX: 0.5,
        anchorY: 1,
      },
    },
  ),
  roomBackdrop(
    "edge.validation-office.generated-backdrop",
    "validation-office",
    "target-edge",
    "validation-office-room-backdrop.png",
    1810,
    869,
    {
      backgroundPosition: "44% 50%",
      backgroundSize: "auto 100%",
      opacity: 0.42,
      curation: {
        source: "sprite-gen-component-row",
        tileW: 18,
        tileH: 18,
        anchorX: 0.5,
        anchorY: 1,
      },
    },
  ),
] as const satisfies readonly GeneratedSpatialLensRoomBackdrop[];

export function resolveGeneratedSpatialLensRoomBackdrop(
  roomId: string,
  usage: GeneratedSpatialLensRoomBackdropUsage = "room",
): GeneratedSpatialLensRoomBackdrop | null {
  return (
    GENERATED_SPATIAL_LENS_ROOM_BACKDROPS.find(
      (backdrop) => backdrop.roomId === roomId && backdrop.usage === usage,
    ) ?? null
  );
}

export function validateGeneratedSpatialLensRoomBackdrops(): string[] {
  return GENERATED_SPATIAL_LENS_ROOM_BACKDROPS.flatMap((backdrop) => {
    const errors: string[] = [];
    if (!backdrop.src.startsWith(`${GENERATED_SPATIAL_LENS_ASSET_ROOT}/`)) {
      errors.push(`${backdrop.id} must be served from the generated asset root`);
    }
    if (backdrop.w <= 0 || backdrop.h <= 0) {
      errors.push(`${backdrop.id} must declare positive dimensions`);
    }
    if (backdrop.opacity <= 0 || backdrop.opacity > 1) {
      errors.push(`${backdrop.id} must use a visible bounded opacity`);
    }
    if (
      backdrop.curation.source !== "sprite-gen-component-row" &&
      backdrop.curation.source !== "sprite-gen-sheet-unpack"
    ) {
      errors.push(`${backdrop.id} has an invalid curation source`);
    }
    if (backdrop.curation.tileW <= 0 || backdrop.curation.tileH <= 0) {
      errors.push(`${backdrop.id} curation grid must declare positive tiles`);
    }
    if (
      backdrop.curation.anchorX < 0 ||
      backdrop.curation.anchorX > 1 ||
      backdrop.curation.anchorY < 0 ||
      backdrop.curation.anchorY > 1
    ) {
      errors.push(`${backdrop.id} curation anchor must stay normalized`);
    }
    return errors;
  });
}
