import type { CSSProperties } from "react";
import styles from "../styles/spatial-lens.module.css";
import type { FloorViewportCorridorLane } from "../model/floorGeometry.js";

export function CorridorLane({ lane }: { lane: FloorViewportCorridorLane }) {
  return (
    <span
      aria-hidden="true"
      className={styles["corridor-lane"]}
      data-lane-kind={lane.kind}
      data-lane-axis={lane.axis}
      data-floor-asset={lane.floorAssetId}
      style={toRectStyle(lane.rect)}
    />
  );
}

function toRectStyle(rect: FloorViewportCorridorLane["rect"]): CSSProperties {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  };
}
