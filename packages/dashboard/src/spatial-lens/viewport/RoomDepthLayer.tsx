import type { RoomTemplate } from "./roomTemplates.js";
import styles from "../styles/spatial-lens.module.css";

const ROOM_DEPTH_ACCENTS = [
  "back-wall-shadow",
  "baseboard",
  "work-mat",
  "foreground-lip",
] as const;

export function RoomDepthLayer({ template }: { template: RoomTemplate }) {
  return (
    <div
      className={styles["room-depth-layer"]}
      data-room-depth-layer={template.roomId}
      data-room-depth-theme={template.theme}
      aria-hidden="true"
    >
      {ROOM_DEPTH_ACCENTS.map((accent) => (
        <span
          key={accent}
          className={styles["room-depth-accent"]}
          data-room-depth-accent={accent}
        />
      ))}
    </div>
  );
}
