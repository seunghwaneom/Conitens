import type { FloorViewportRoom } from "../model/floorGeometry.js";
import styles from "../styles/spatial-lens.module.css";

export function FloorMiniMap({
  rooms,
  focusedRoomId,
  targetRoomId,
  onSelectRoom,
}: {
  rooms: readonly FloorViewportRoom[];
  focusedRoomId: string | null;
  targetRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}) {
  return (
    <div className={styles["floor-minimap"]} aria-label="Floor overview">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          className={styles["floor-minimap-room"]}
          data-focused={room.id === focusedRoomId ? "true" : "false"}
          data-route-target={room.id === targetRoomId ? "true" : "false"}
          data-status-tone={room.statusTone}
          style={{
            left: `${room.rect.x}%`,
            top: `${room.rect.y}%`,
            width: `${room.rect.w}%`,
            height: `${room.rect.h}%`,
          }}
          aria-label={`Focus ${room.label}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectRoom(room.id);
          }}
        />
      ))}
    </div>
  );
}
