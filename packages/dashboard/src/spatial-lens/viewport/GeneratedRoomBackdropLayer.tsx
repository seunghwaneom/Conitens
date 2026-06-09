import type { CSSProperties } from "react";
import {
  resolveGeneratedSpatialLensRoomBackdrop,
  type GeneratedSpatialLensRoomBackdropUsage,
} from "../assets/generatedRoomBackdrops.js";
import styles from "../styles/spatial-lens.module.css";

export function GeneratedRoomBackdropLayer({
  roomId,
  usage = "room",
}: {
  roomId: string;
  usage?: GeneratedSpatialLensRoomBackdropUsage;
}) {
  const backdrop = resolveGeneratedSpatialLensRoomBackdrop(roomId, usage);
  if (!backdrop) return null;

  return (
    <span
      className={styles["generated-room-backdrop-layer"]}
      data-generated-room-backdrop={backdrop.id}
      data-generated-room-backdrop-room={backdrop.roomId}
      data-generated-room-backdrop-usage={backdrop.usage}
      style={{
        "--generated-room-backdrop-opacity": backdrop.opacity,
        backgroundImage: `url("${backdrop.src}")`,
        backgroundPosition: backdrop.backgroundPosition,
        backgroundSize: backdrop.backgroundSize,
      } as CSSProperties}
      aria-hidden="true"
    />
  );
}
