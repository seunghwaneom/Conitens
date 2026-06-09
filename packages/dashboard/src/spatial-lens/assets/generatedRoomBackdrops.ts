import { GENERATED_SPATIAL_LENS_ASSET_ROOT } from "./generatedAssetManifest.ts";
import type { RoomTemplateId } from "../viewport/roomTemplates.ts";

export type GeneratedSpatialLensRoomBackdropUsage = "room" | "target-edge";

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
    "backgroundPosition" | "backgroundSize" | "opacity"
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
    return errors;
  });
}
