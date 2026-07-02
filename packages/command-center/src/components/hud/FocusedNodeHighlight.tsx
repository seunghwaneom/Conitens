/**
 * FocusedNodeHighlight — diegetic badge for the currently focused 3D node.
 */
import { useSpatialStore } from "../../store/spatial-store.js";
import { useAgentStore } from "../../store/agent-store.js";
import { ROOM_TYPE_ICONS } from "./room-type-meta.js";

/**
 * FocusedNodeHighlight — diegetic badge shown in the top-left panel when
 * a node is actively focused in the 3D scene (hovered, selected, or camera-locked).
 *
 * Priority order: agent selection > room selection > room camera-focus > any 3D hover.
 *
 * Shows the node name, icon, and a pulsing dot in the node's accent color.
 * Disappears automatically when nothing is focused.
 */
export function FocusedNodeHighlight() {
  const focusedRoomId  = useSpatialStore((s) => s.focusedRoomId);
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);
  const roomStates     = useSpatialStore((s) => s.roomStates);
  const building       = useSpatialStore((s) => s.building);
  const drillLevel     = useSpatialStore((s) => s.drillLevel);
  const drillFloor     = useSpatialStore((s) => s.drillFloor);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const agents          = useAgentStore((s) => s.agents);

  let label    = "";
  let color    = "#4a6aff";
  let icon     = "○";
  let subtitle = "";

  if (selectedAgentId && agents[selectedAgentId]) {
    const agent = agents[selectedAgentId];
    label    = agent.def.visual.label;
    color    = agent.def.visual.color;
    icon     = agent.def.visual.icon;
    subtitle = agent.status.toUpperCase();
  } else if (selectedRoomId) {
    const room = building.rooms.find((r) => r.roomId === selectedRoomId);
    if (room) {
      label    = room.name;
      color    = room.colorAccent;
      icon     = ROOM_TYPE_ICONS[room.roomType] ?? "□";
      subtitle = `${room.roomType.toUpperCase()} · F${room.floor}`;
    }
  } else if (focusedRoomId) {
    const room = building.rooms.find((r) => r.roomId === focusedRoomId);
    if (room) {
      label    = room.name;
      color    = room.colorAccent;
      icon     = ROOM_TYPE_ICONS[room.roomType] ?? "□";
      subtitle = "CAM LOCKED";
    }
  } else if (drillLevel === "floor" && drillFloor !== null) {
    // Show current floor as the focused node when at floor level
    const floorDef = building.floors.find((f) => f.floor === drillFloor);
    if (floorDef) {
      label    = `F${floorDef.floor} ${floorDef.name}`;
      color    = "#6a8aff";
      icon     = "▤";
      subtitle = "FLOOR ACTIVE";
    }
  } else {
    // Any room currently hovered in the 3D scene
    const hovered = building.rooms.find((r) => roomStates[r.roomId]?.highlighted);
    if (hovered) {
      label    = hovered.name;
      color    = hovered.colorAccent;
      icon     = ROOM_TYPE_ICONS[hovered.roomType] ?? "□";
      subtitle = "HOVER";
    }
  }

  if (!label) return null;

  return (
    <div
      style={{
        marginTop: 6,
        display:    "inline-flex",
        alignItems: "center",
        gap: 5,
        padding:    "3px 7px",
        background: `${color}14`,
        border:     `1px solid ${color}44`,
        borderRadius: 3,
        maxWidth:   220,
        animation:  "hud-focus-glow 2.4s ease-in-out infinite",
        backdropFilter: "blur(4px)",
      }}
      title="Currently focused node in the 3D scene"
    >
      {/* Pulsing dot */}
      <span
        style={{
          display:         "inline-block",
          width:           5,
          height:          5,
          borderRadius:    "50%",
          backgroundColor: color,
          boxShadow:       `0 0 6px ${color}`,
          flexShrink:      0,
          animation:       "hud-pulse 1.6s ease-in-out infinite",
        }}
      />
      {/* Node label */}
      <span
        style={{
          fontSize:      "9px",
          color:         `${color}dd`,
          fontWeight:    700,
          letterSpacing: "0.06em",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}
      >
        {icon} {label}
      </span>
      {/* Context subtitle */}
      {subtitle && (
        <span
          style={{
            fontSize:      "7px",
            color:         "#444466",
            letterSpacing: "0.05em",
            flexShrink:    0,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
