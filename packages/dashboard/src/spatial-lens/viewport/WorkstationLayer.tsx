import { PixelProp } from "./PixelProp.js";
import { getWorkstationPropSpecs } from "./roomDressing.js";
import type { RoomTemplate } from "./roomTemplates.js";
import styles from "../styles/spatial-lens.module.css";

export function WorkstationLayer({ template }: { template: RoomTemplate }) {
  return (
    <div className={styles["workstation-layer"]} aria-hidden="true">
      {getWorkstationPropSpecs(template).map((prop) => (
        <PixelProp key={prop.id} prop={prop} />
      ))}
    </div>
  );
}
