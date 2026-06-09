import type { CSSProperties } from "react";
import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import {
  getGeneratedSpatialLensSpriteForPixelProp,
  type GeneratedSpatialLensSpriteAsset,
} from "../assets/generatedAssetManifest.js";
import type { PixelPropSpec } from "./roomTemplates.js";
import {
  getPixelLayerIndex,
  OUTLINE_PX,
  PROP_ANCHOR_RULE,
  SHADOW_PX,
  snapPercentToRoomTile,
  SPRITE_SCALE,
} from "./pixelSpriteGrammar.js";
import styles from "../styles/spatial-lens.module.css";

export function PixelProp({ prop }: { prop: PixelPropSpec }) {
  const generatedSprite = getGeneratedSpatialLensSpriteForPixelProp(prop);
  const className = generatedSprite
    ? `${styles["pixel-prop"]} ${styles["pixel-generated-sprite"]}`
    : styles["pixel-prop"];

  if (generatedSprite) {
    return (
      <GeneratedSprite
        sprite={generatedSprite}
        className={className}
        data-pixel-prop={prop.id}
        data-prop-kind={prop.kind}
        data-prop-layer={prop.layer ?? "floor"}
        data-prop-tone={prop.tone ?? "neutral"}
        data-prop-anchor={PROP_ANCHOR_RULE}
        style={toPixelPropStyle(prop, generatedSprite)}
        decorative
      />
    );
  }

  return (
    <span
      className={className}
      data-pixel-prop={prop.id}
      data-prop-kind={prop.kind}
      data-prop-layer={prop.layer ?? "floor"}
      data-prop-tone={prop.tone ?? "neutral"}
      data-prop-anchor={PROP_ANCHOR_RULE}
      style={toPixelPropStyle(prop)}
      aria-hidden="true"
    />
  );
}

function toPixelPropStyle(
  prop: PixelPropSpec,
  generatedSprite?: GeneratedSpatialLensSpriteAsset,
): CSSProperties {
  return {
    "--sprite-scale": generatedSprite ? 1 : SPRITE_SCALE,
    "--sprite-outline": `${OUTLINE_PX}px`,
    "--sprite-shadow": `${SHADOW_PX}px`,
    left: `${snapPercentToRoomTile(prop.x)}%`,
    top: `${snapPercentToRoomTile(prop.y)}%`,
    width: getPixelPropWidth(prop, generatedSprite),
    height: getPixelPropHeight(prop, generatedSprite),
    zIndex: getPixelLayerIndex({ y: prop.y, layer: prop.layer }),
  } as CSSProperties;
}

function getPixelPropWidth(
  prop: PixelPropSpec,
  generatedSprite?: GeneratedSpatialLensSpriteAsset,
): string | undefined {
  if (generatedSprite) {
    return `${generatedSprite.w * generatedSprite.scale}px`;
  }
  return prop.w === undefined ? undefined : `${prop.w}px`;
}

function getPixelPropHeight(
  prop: PixelPropSpec,
  generatedSprite?: GeneratedSpatialLensSpriteAsset,
): string | undefined {
  if (generatedSprite) {
    return `${generatedSprite.h * generatedSprite.scale}px`;
  }
  return prop.h === undefined ? undefined : `${prop.h}px`;
}
