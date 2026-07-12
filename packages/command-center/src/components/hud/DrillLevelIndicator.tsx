/**
 * DrillLevelIndicator — Navigation State Overlay (Sub-AC 3d).
 */
import { useSpatialStore, type DrillLevel } from "../../store/spatial-store.js";

/**
 * Per-level configuration for the DrillLevelIndicator step-ladder.
 * Each level has a canonical icon, accent color, and short label.
 */
const DRILL_LEVEL_META: Record<DrillLevel, { icon: string; color: string; label: string }> = {
  building: { icon: "⬡", color: "#4a6aff", label: "BUILDING" },
  floor:    { icon: "▤", color: "#6a9aff", label: "FLOOR"    },
  room:     { icon: "□", color: "#8ab8ff", label: "ROOM"     },
  agent:    { icon: "◆", color: "#00ffaa", label: "AGENT"    },
};

/** Ordered drill levels */
const DRILL_LEVELS: DrillLevel[] = ["building", "floor", "room", "agent"];

/**
 * DrillLevelIndicator — persistent step-ladder showing where the user
 * currently is in the building → floor → room → agent hierarchy.
 *
 * Always visible. Active level is highlighted with its accent color
 * and a glow shadow. Past levels are dim-blue; future levels are near-black.
 *
 * Positioned in the top-left panel, directly below the data-source subtitle.
 */
export function DrillLevelIndicator() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);

  const currentIdx = DRILL_LEVELS.indexOf(drillLevel);

  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 3,
      }}
      title="Current navigation level in the spatial hierarchy"
    >
      {DRILL_LEVELS.map((lvl, idx) => {
        const meta      = DRILL_LEVEL_META[lvl];
        const isActive  = idx === currentIdx;
        const isPast    = idx < currentIdx;

        return (
          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {idx > 0 && (
              <span
                style={{
                  fontSize: "8px",
                  color: isPast || isActive ? "#2a3a6a" : "#1a1a2a",
                }}
              >
                ›
              </span>
            )}
            <span
              style={{
                fontSize: isActive ? "9px" : "8px",
                letterSpacing: "0.08em",
                fontWeight: isActive ? 700 : 400,
                color: isActive ? meta.color
                     : isPast   ? "#2a3a6a"
                                : "#1c1c2e",
                textShadow: isActive ? `0 0 8px ${meta.color}aa` : "none",
                animation:  isActive ? "hud-level-shimmer 3s ease-in-out infinite" : "none",
                transition: "all 0.25s ease",
              }}
              title={meta.label}
            >
              {meta.icon} {meta.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
