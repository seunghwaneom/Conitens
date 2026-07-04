/**
 * FloorToggles — floor visibility toggle buttons.
 */
import { useSpatialStore } from "../../store/spatial-store.js";
import { styles } from "./hud-styles.js";

/** Floor visibility toggle buttons */
export function FloorToggles() {
  const floors = useSpatialStore((s) => s.building.floors);
  const floorVisibility = useSpatialStore((s) => s.floorVisibility);
  const toggleFloorVisibility = useSpatialStore((s) => s.toggleFloorVisibility);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.sectionLabel}>FLOORS</div>
      <div style={{ display: "flex", gap: 4 }}>
        {floors.map((f) => (
          <button
            key={f.floor}
            onClick={() => toggleFloorVisibility(f.floor)}
            style={{
              ...styles.presetBtn,
              ...(floorVisibility[f.floor] ? styles.presetBtnActive : {}),
              pointerEvents: "auto",
            }}
          >
            F{f.floor} {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}
