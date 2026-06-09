import type { CSSProperties } from "react";
import type { FloorViewportRoom } from "../model/floorGeometry.js";
import {
  getRoomDoorPlacements,
  resolveRoomDoorPoint,
} from "../viewport/roomPlacement.js";
import type { RoomDoorPlacement } from "../viewport/roomPlacement.js";
import styles from "../styles/spatial-lens.module.css";

export function DoorFrameLayer({
  rooms,
}: {
  rooms: readonly FloorViewportRoom[];
}) {
  return (
    <div className={styles["door-frame-layer"]} aria-hidden="true">
      {rooms.flatMap((room) =>
        getRoomDoorPlacements(room.id).map((door) => (
          <span
            key={door.id}
            className={styles["room-door-frame"]}
            data-door-room={room.id}
            data-door-role={door.role}
            data-door-side={door.side}
            data-door-state={door.state}
            data-door-corridor-node={door.corridorNodeId}
            style={toDoorFrameStyle(room, door)}
          />
        )),
      )}
    </div>
  );
}

function toDoorFrameStyle(
  room: FloorViewportRoom,
  door: RoomDoorPlacement,
): CSSProperties {
  const point = resolveRoomDoorPoint(room.rect, door);
  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
  };
}
