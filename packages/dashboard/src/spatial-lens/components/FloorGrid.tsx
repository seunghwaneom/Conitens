import type { CSSProperties } from "react";
import styles from "../styles/spatial-lens.module.css";
import {
  resolveSpatialLensAsset,
  type SpatialLensFurnitureAsset,
} from "../assets/assetRegistry.js";
import { CorridorLane } from "./CorridorLane.js";
import type {
  FloorViewportCorridorLane,
  FloorViewportFixture,
} from "../model/floorGeometry.js";

const FIXTURE_SPRITE_SHEET_WIDTH = 600;
const FIXTURE_SPRITE_SHEET_HEIGHT = 24;

export function FloorGrid({
  corridors,
  fixtures,
}: {
  corridors: readonly FloorViewportCorridorLane[];
  fixtures: readonly FloorViewportFixture[];
}) {
  return (
    <div className={styles["floor-grid"]} aria-hidden="true">
      <span className={styles["floor-grid-overlay"]} />
      {corridors.map((lane) => (
        <CorridorLane key={lane.id} lane={lane} />
      ))}
      {fixtures.map((fixture) => (
        <span
          key={fixture.id}
          className={styles["floor-fixture"]}
          data-fixture-kind={fixture.kind}
          style={toFixtureStyle(fixture)}
        />
      ))}
    </div>
  );
}

export function toFixtureStyle(fixture: FloorViewportFixture): CSSProperties {
  const asset = resolveSpatialLensAsset(fixture.assetId);
  if (!asset || asset.kind !== "furniture" || !asset.src) {
    return {
      left: `${fixture.left}%`,
      top: `${fixture.top}%`,
    };
  }

  return {
    left: `${fixture.left}%`,
    top: `${fixture.top}%`,
    ...toFurnitureSpriteStyle(asset),
  };
}

export function toFurnitureSpriteStyle(asset: SpatialLensFurnitureAsset): CSSProperties {
  return {
    width: `${asset.tileSize.w}px`,
    height: `${asset.tileSize.h}px`,
    backgroundImage: `url("${asset.src}")`,
    backgroundPosition: `-${asset.sourceRect.x}px -${asset.sourceRect.y}px`,
    backgroundSize: `${FIXTURE_SPRITE_SHEET_WIDTH}px ${FIXTURE_SPRITE_SHEET_HEIGHT}px`,
    backgroundRepeat: "no-repeat",
  };
}
