/**
 * RoomNavigator — quick-access buttons to focus on any room.
 */
import { useSpatialStore } from "../../store/spatial-store.js";
import { styles } from "./hud-styles.js";
import { ROOM_TYPE_ICONS } from "./room-type-meta.js";

/** Room navigation list — quick-access buttons to focus on any room */
export function RoomNavigator() {
  const rooms         = useSpatialStore((s) => s.building.rooms);
  const roomStates    = useSpatialStore((s) => s.roomStates);
  const selectRoom    = useSpatialStore((s) => s.selectRoom);
  const focusRoom     = useSpatialStore((s) => s.focusRoom);
  const focusedRoomId = useSpatialStore((s) => s.focusedRoomId);
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.sectionLabel}>NAVIGATE TO ROOM</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflowY: "auto" }}>
        {rooms.map((room) => {
          const icon         = ROOM_TYPE_ICONS[room.roomType] ?? "?";
          const isFocused    = focusedRoomId === room.roomId;
          const isSelected   = selectedRoomId === room.roomId;
          const isHighlighted = roomStates[room.roomId]?.highlighted ?? false;
          const isActive     = isFocused || isSelected;

          return (
            <button
              key={room.roomId}
              onClick={() => {
                selectRoom(room.roomId);
                focusRoom(room.roomId);
              }}
              style={{
                ...styles.presetBtn,
                display: "flex",
                alignItems: "center",
                gap: 4,
                textAlign: "left",
                pointerEvents: "auto",
                fontSize: "8px",
                padding: "3px 6px",
                transition: "all 0.15s ease",
                ...(isActive ? {
                  background: "rgba(74, 106, 255, 0.2)",
                  borderColor: room.colorAccent,
                  color: room.colorAccent,
                } : isHighlighted ? {
                  // 3D-hover feedback: subtle left accent + glow
                  background: `${room.colorAccent}14`,
                  borderColor: `${room.colorAccent}66`,
                  borderLeftColor: room.colorAccent,
                  borderLeftWidth: 2,
                  color: `${room.colorAccent}cc`,
                } : {}),
              }}
              title={`Navigate to ${room.name}${isHighlighted ? " (hovered in 3D)" : ""}`}
            >
              <span style={{ color: room.colorAccent, fontSize: "10px" }}>{icon}</span>
              <span>{room.name}</span>
              {/* Highlight dot — appears when the room is hovered in the 3D scene */}
              {isHighlighted && !isActive && (
                <span
                  style={{
                    display:         "inline-block",
                    width:           4,
                    height:          4,
                    borderRadius:    "50%",
                    backgroundColor: room.colorAccent,
                    boxShadow:       `0 0 4px ${room.colorAccent}`,
                    animation:       "hud-pulse 1.2s ease-in-out infinite",
                    flexShrink:      0,
                  }}
                />
              )}
              <span style={{ color: "#444466", marginLeft: "auto" }}>F{room.floor}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
