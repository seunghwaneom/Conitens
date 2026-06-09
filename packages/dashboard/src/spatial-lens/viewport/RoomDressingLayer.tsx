import { PixelProp } from "./PixelProp.js";
import { getRoomFloorPropSpecs } from "./roomDressing.js";
import type { RoomTemplate } from "./roomTemplates.js";
import styles from "../styles/spatial-lens.module.css";

export function RoomDressingLayer({ template }: { template: RoomTemplate }) {
  return (
    <div className={styles["room-dressing-layer"]} aria-hidden="true">
      {getRoomFloorPropSpecs(template).map((prop) => (
        <PixelProp key={prop.id} prop={prop} />
      ))}
    </div>
  );
}
