import { PixelProp } from "./PixelProp.js";
import { getWallPropSpecs } from "./roomDressing.js";
import type { DoorSpec, RoomTemplate } from "./roomTemplates.js";
import styles from "../styles/spatial-lens.module.css";

export function WallDetailLayer({ template }: { template: RoomTemplate }) {
  return (
    <div className={styles["wall-detail-layer"]} aria-hidden="true">
      {template.doors.map((door) => (
        <DoorFrame key={door.id} door={door} />
      ))}
      {getWallPropSpecs(template).map((prop) => (
        <PixelProp key={prop.id} prop={prop} />
      ))}
    </div>
  );
}

function DoorFrame({ door }: { door: DoorSpec }) {
  return (
    <span
      className={styles["room-door-frame"]}
      data-door-side={door.side}
      data-door-state={door.state}
      style={{
        left: `${door.x}%`,
        top: `${door.y}%`,
      }}
    />
  );
}
