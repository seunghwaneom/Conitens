import type { CSSProperties } from "react";
import type {
  FloorLayoutPoint,
  FloorLayoutRect,
  SpatialLensBuildingLayout,
} from "../viewport/floorLayout.js";
import styles from "../styles/spatial-lens.module.css";

export function BuildingShellLayer({
  layout,
}: {
  layout: SpatialLensBuildingLayout;
}) {
  return (
    <div className={styles["building-shell-layer"]} aria-hidden="true">
      {layout.wallSegments.map((wall) => (
        <span
          key={wall.id}
          className={styles["building-wall"]}
          data-building-wall={wall.id}
          data-wall-role={wall.role}
          data-wall-orientation={wall.orientation}
          style={toRectStyle(wall.rect)}
        />
      ))}
      {layout.columns.map((column) => (
        <span
          key={column.id}
          className={styles["structural-column"]}
          data-column-size={column.size}
          style={toPointStyle(column.point)}
        />
      ))}
    </div>
  );
}

function toRectStyle(rect: FloorLayoutRect): CSSProperties {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  };
}

function toPointStyle(point: FloorLayoutPoint): CSSProperties {
  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
  };
}
