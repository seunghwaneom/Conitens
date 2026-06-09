import type { CSSProperties } from "react";
import type {
  FloorLayoutRect,
  SpatialLensBuildingLayout,
} from "../viewport/floorLayout.js";
import styles from "../styles/spatial-lens.module.css";

export function FloorplateLayer({
  layout,
}: {
  layout: SpatialLensBuildingLayout;
}) {
  return (
    <div className={styles["floorplate-layer"]} aria-hidden="true">
      {layout.floorplateZones.map((zone) => (
        <span
          key={zone.id}
          className={styles["floorplate-zone"]}
          data-floorplate-zone={zone.id}
          data-floorplate-tone={zone.tone}
          style={toRectStyle(zone.rect)}
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
