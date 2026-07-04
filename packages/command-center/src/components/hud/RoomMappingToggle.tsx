/**
 * RoomMappingToggle — opens/closes the room mapping config panel.
 */
import { useRoomMappingStore } from "../../store/room-mapping-store.js";
import { styles } from "./hud-styles.js";

/** Room mapping config toggle button — opens/closes the mapping panel */
export function RoomMappingToggle() {
  const isPanelOpen = useRoomMappingStore((s) => s.isPanelOpen);
  const togglePanel = useRoomMappingStore((s) => s.togglePanel);
  const changeCount = useRoomMappingStore((s) => s.events.length);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={styles.sectionLabel}>CONFIGURATION</div>
      <button
        onClick={togglePanel}
        style={{
          ...styles.presetBtn,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "auto",
          ...(isPanelOpen
            ? {
                background: "rgba(74, 106, 255, 0.2)",
                borderColor: "#4a6aff",
                color: "#aaccff",
              }
            : {}),
        }}
        title="Open/close room mapping configuration panel"
      >
        <span>◎ ROOM MAPPING</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {changeCount > 0 && (
            <span
              style={{
                fontSize: "7px",
                background: "rgba(74, 106, 255, 0.3)",
                borderRadius: 8,
                padding: "1px 4px",
                color: "#aaccff",
              }}
            >
              {changeCount}
            </span>
          )}
          <span style={{ fontSize: "8px", opacity: 0.7 }}>
            {isPanelOpen ? "▼" : "▶"}
          </span>
        </span>
      </button>
    </div>
  );
}
