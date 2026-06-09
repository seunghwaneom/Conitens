import type { CSSProperties } from "react";
import type { FloorViewportHandoffRoute } from "../model/floorGeometry.js";
import styles from "../styles/spatial-lens.module.css";

type ContinuityPart = "source-apron" | "spine-runner" | "target-apron";

interface ContinuityTile {
  readonly part: ContinuityPart;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function FocusedCorridorContinuityLayer({
  routes,
}: {
  routes: readonly FloorViewportHandoffRoute[];
}) {
  const tiles = routes.slice(0, 1).flatMap(routeToContinuityTiles);
  if (tiles.length === 0) return null;

  return (
    <div
      className={styles["focused-corridor-continuity-layer"]}
      data-focused-corridor-continuity-layer="true"
      aria-hidden="true"
    >
      {tiles.map((tile) => (
        <span
          key={tile.part}
          className={styles["focused-corridor-continuity-tile"]}
          data-focused-corridor-continuity={tile.part}
          style={toRectStyle(tile)}
        />
      ))}
    </div>
  );
}

function routeToContinuityTiles(
  route: FloorViewportHandoffRoute,
): ContinuityTile[] {
  const sourceDoor = route.points[1];
  const sourceSpine = route.points[2];
  const targetSpine = route.points[4];
  const targetDoor = route.points[5];
  if (!sourceDoor || !sourceSpine || !targetSpine || !targetDoor) return [];

  const spineLeft = sourceSpine.left;
  const sourceApron = createHorizontalApron(
    "source-apron",
    sourceDoor.left,
    sourceSpine.left,
    sourceDoor.top,
  );
  const targetApron = createHorizontalApron(
    "target-apron",
    targetSpine.left,
    targetDoor.left,
    targetDoor.top,
  );

  return [
    sourceApron,
    {
      part: "spine-runner",
      left: roundOverlayPercent(spineLeft - 1),
      top: roundOverlayPercent(Math.min(sourceSpine.top, targetSpine.top) - 0.4),
      width: 2,
      height: roundOverlayPercent(Math.abs(targetSpine.top - sourceSpine.top) + 0.8),
    },
    targetApron,
  ];
}

function createHorizontalApron(
  part: Extract<ContinuityPart, "source-apron" | "target-apron">,
  fromLeft: number,
  toLeft: number,
  top: number,
): ContinuityTile {
  return {
    part,
    left: roundOverlayPercent(Math.min(fromLeft, toLeft) - 0.8),
    top: roundOverlayPercent(top - 1.3),
    width: roundOverlayPercent(Math.abs(toLeft - fromLeft) + 1.6),
    height: 2.6,
  };
}

function toRectStyle(tile: ContinuityTile): CSSProperties {
  return {
    left: `${tile.left}%`,
    top: `${tile.top}%`,
    width: `${tile.width}%`,
    height: `${tile.height}%`,
  };
}

function roundOverlayPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}
