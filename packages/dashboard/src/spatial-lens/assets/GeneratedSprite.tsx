import type { CSSProperties, HTMLAttributes } from "react";
import {
  GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE,
  resolveGeneratedSpatialLensSprite,
  type GeneratedSpatialLensSpriteAsset,
  type GeneratedSpatialLensSpriteScale,
} from "./generatedAssetManifest.js";

export interface GeneratedSpriteProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly sprite: GeneratedSpatialLensSpriteAsset | string;
  readonly scale?: GeneratedSpatialLensSpriteScale;
  readonly decorative?: boolean;
}

export function GeneratedSprite({
  sprite,
  scale,
  decorative = true,
  style,
  ...spanProps
}: GeneratedSpriteProps) {
  const resolved =
    typeof sprite === "string" ? resolveGeneratedSpatialLensSprite(sprite) : sprite;

  if (!resolved) {
    return null;
  }

  const spriteScale = scale ?? resolved.scale;

  return (
    <span
      {...spanProps}
      aria-hidden={decorative ? true : spanProps["aria-hidden"]}
      data-generated-sprite={resolved.id}
      style={{
        ...toGeneratedSpriteStyle(resolved, spriteScale),
        ...style,
      }}
    />
  );
}

export function toGeneratedSpriteStyle(
  sprite: GeneratedSpatialLensSpriteAsset,
  scale: GeneratedSpatialLensSpriteScale = sprite.scale,
): CSSProperties {
  return {
    display: "inline-block",
    width: `${sprite.w * scale}px`,
    height: `${sprite.h * scale}px`,
    backgroundImage: `url("${sprite.src}")`,
    backgroundPosition: `-${sprite.x * scale}px -${sprite.y * scale}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize:
      `${GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.w * scale}px ` +
      `${GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE.h * scale}px`,
    imageRendering: "pixelated",
  };
}
