/**
 * HUD — Head-Up Display overlay for the 3D command center.
 *
 * Provides a diegetic-style overlay with:
 * - Building title & status
 * - Floor selector with visibility toggle
 * - Camera preset controls
 * - Legend for room types
 * - Selected room detail panel
 * - Room mapping panel (open via MAPPING button)
 * - Data source indicator
 *
 * Connected to the spatial store for dynamic data.
 */
import { type CameraPreset } from "../scene/CameraRig.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useRoomMappingStore } from "../store/room-mapping-store.js";
import { RoomMappingPanel } from "./RoomMappingPanel.js";
import { ReplayControlPanel } from "./ReplayControlPanel.js";
import { ReplayModeOverlay } from "./ReplayModeOverlay.js";
import { ConveneMeetingDialog } from "./ConveneMeetingDialog.js";
import { ActiveSessionsPanel } from "./ActiveSessionsPanel.js";
import { MeetingSessionPanel } from "./MeetingSessionPanel.js";
import { MeetingProtocolPanel } from "./MeetingProtocolPanel.js";
import { TaskManagementPanel } from "./TaskManagementPanel.js";
import { NavigationBreadcrumb } from "./NavigationBreadcrumb.js";
import { styles } from "./hud/hud-styles.js";
import {
  ROOM_TYPE_COLORS,
  ROOM_TYPE_ICONS,
  ROOM_TYPE_SHAPES,
  ROOM_TYPE_ANIM,
} from "./hud/room-type-meta.js";
import { RoomDetailPanel } from "./hud/RoomDetailPanel.js";
import { RoomNavigator } from "./hud/RoomNavigator.js";
import { FloorToggles } from "./hud/FloorToggles.js";
import { CameraModeControls } from "./hud/CameraModeControls.js";
import { AgentRoster } from "./hud/AgentRoster.js";
import { AgentDetailPanel } from "./hud/AgentDetailPanel.js";
import { BuildingContextPanel } from "./hud/BuildingContextPanel.js";
import { FloorContextPanel } from "./hud/FloorContextPanel.js";
import { DrillLevelIndicator } from "./hud/DrillLevelIndicator.js";
import { FocusedNodeHighlight } from "./hud/FocusedNodeHighlight.js";
import { RoomMappingToggle } from "./hud/RoomMappingToggle.js";
import { DataSourceStatusIndicator } from "./hud/DataSourceStatusIndicator.js";

interface HUDProps {
  cameraPreset: CameraPreset;
  onPresetChange: (preset: CameraPreset) => void;
}

export function HUD({ cameraPreset, onPresetChange }: HUDProps) {
  const building = useSpatialStore((s) => s.building);
  const dataSource = useSpatialStore((s) => s.dataSource);
  const loading = useSpatialStore((s) => s.loading);
  const spatialEventCount = useSpatialStore((s) => s.events.length);
  const agentEventCount = useAgentStore((s) => s.events.length);
  const agentCount = useAgentStore((s) => Object.keys(s.agents).length);
  const mappingEventCount = useRoomMappingStore((s) => s.events.length);
  const isMappingPanelOpen = useRoomMappingStore((s) => s.isPanelOpen);

  return (
    <div style={styles.container}>
      {/* Top-left: Title + nav level indicator + focused-node highlight */}
      <div style={styles.topLeft}>
        <div style={styles.title}>
          <span style={styles.titleMark}>&gt;</span> CONITENS // COMMAND_CENTER
        </div>
        <div style={styles.subtitle}>
          3D Spatial Visualization
          {loading && <span style={{ color: "#4a6aff", marginLeft: 8 }}>LOADING...</span>}
          {!loading && (
            <span style={{ color: dataSource === "yaml" ? "#00cc66" : "#555577", marginLeft: 8 }}>
              [{dataSource.toUpperCase()}]
            </span>
          )}
        </div>

        {/*
         * Sub-AC 3d: Current-level indicator — step-ladder showing position in
         * the building → floor → room → agent hierarchy. Always visible.
         */}
        <DrillLevelIndicator />

        {/*
         * Sub-AC 3d: Focused-node highlight — shows which room/agent is currently
         * hovered, selected, or camera-locked, with a pulsing accent-color badge.
         */}
        <FocusedNodeHighlight />
      </div>

      {/*
       * Top-center navigation controls (Sub-AC 3.3 + 4a):
       *
       * At building level: BuildingContextPanel (Sub-AC 4a — aggregate stats,
       *                    inline rename, START ALL / STOP ALL, floor list)
       * Below building:    NavigationBreadcrumb (Sub-AC 3.3 — dedicated breadcrumb
       *                    HUD overlay; path navigation + click-to-navigate-up +
       *                    back button + home button + ESC key support)
       *                  + FloorContextPanel (Sub-AC 4a — floor stats, rename,
       *                    START ALL / STOP ALL on floor, room quick-select)
       */}
      <BuildingContextPanel />
      <NavigationBreadcrumb />
      <FloorContextPanel />

      {/* Top-right: Camera mode + presets/controls + floor toggles */}
      <div style={styles.topRight}>
        <CameraModeControls cameraPreset={cameraPreset} onPresetChange={onPresetChange} />
        <FloorToggles />
        <RoomNavigator />
        <AgentRoster />
        <RoomMappingToggle />
      </div>

      {/* Bottom-left: Legend with role icons, geometry names, and animation type */}
      <div style={styles.bottomLeft}>
        <div style={styles.sectionLabel}>ROOM TYPES</div>
        <div style={styles.legendGrid}>
          {Object.entries(ROOM_TYPE_COLORS).map(([type, color]) => (
            <div key={type} style={styles.legendItem}>
              {/* Color swatch */}
              <span
                style={{
                  ...styles.legendDot,
                  backgroundColor: color,
                  boxShadow: `0 0 4px ${color}66`,
                }}
              />
              {/* Role icon */}
              <span style={{ color, fontSize: "11px", lineHeight: 1 }}>
                {ROOM_TYPE_ICONS[type] ?? "?"}
              </span>
              {/* Type name */}
              <span style={{ ...styles.legendText, color }}>{type}</span>
              {/* Geometry shape */}
              <span style={{ fontSize: "7px", color: "#444466", marginLeft: 1 }}>
                {ROOM_TYPE_SHAPES[type] ?? "?"}
              </span>
              {/* Animation indicator */}
              {ROOM_TYPE_ANIM[type] && ROOM_TYPE_ANIM[type] !== "none" && (
                <span style={{ fontSize: "6px", color: `${color}88`, marginLeft: 1 }}>
                  ↻{ROOM_TYPE_ANIM[type].slice(0, 3)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-right: Building info + agent count */}
      <div style={styles.bottomRight}>
        <div style={styles.sectionLabel}>BUILDING</div>
        <div style={styles.infoText}>
          {building.floors.length} floors · {building.rooms.length} rooms ·{" "}
          {agentCount} agents
        </div>
        <div style={styles.infoTextDim}>
          {building.floors[0]?.gridW ?? 12}x{building.floors[0]?.gridD ?? 6} grid · {building.style}
        </div>
        <div style={styles.infoTextDim}>
          Events: {spatialEventCount + agentEventCount + mappingEventCount}{" "}
          (spatial: {spatialEventCount}, agent: {agentEventCount}, mapping: {mappingEventCount})
        </div>
      </div>

      {/* Selected room detail panel (middle-right) */}
      <RoomDetailPanel />

      {/* Selected agent detail panel (middle-left) */}
      <AgentDetailPanel />

      {/* Room mapping configuration panel (center modal, when open) */}
      {isMappingPanelOpen && <RoomMappingPanel />}

      {/*
        Sub-AC 10a: Meeting convocation dialog — centred modal, appears when
        conveneDialogRoomId is set (via right-click 3D room node OR the
        ⚑ CONVENE button in RoomDetailPanel).
        Emits meeting.convene_requested to the spatial event log + control-plane bus.
        ConveneMeetingDialog self-manages open/close via the spatial store.
      */}
      <ConveneMeetingDialog />

      {/*
        Sub-AC 10d: Meeting protocol control panel — right-side overlay.
        Shows protocol stage progress, attending agents, spawned tasks, and
        event-log audit trail for the active meeting in the selected room.
        Also renders a CONVENE button when no meeting is active.
        Verifiable end-to-end via event_log inspection in the panel itself.
      */}
      <MeetingProtocolPanel />

      {/*
        Sub-AC 10b/10c: Active sessions panel — bottom-right HUD corner.
        Lists all active collaboration sessions with participant count,
        role badges, and INSPECT / terminate controls.
      */}
      <ActiveSessionsPanel />

      {/*
        Sub-AC 10c: Meeting session detail panel — left-side overlay.
        Full session detail: status, participants, transcript feed, termination.
        Appears when a session is selected via ActiveSessionsPanel → INSPECT.
      */}
      <MeetingSessionPanel />

      {/*
        Sub-AC 7b: Task management panel — centred modal for create / cancel /
        reprioritize task operations triggered from 3D room or agent context menus.
        Panel opens via useTaskManagementStore; emits orchestration_commands with
        task payloads via useActionDispatcher → useCommandFileWriter.
        Renders null when closed (zero overhead in live mode).
      */}
      <TaskManagementPanel />

      {/*
        AC 9.3: Replay mode overlay — global viewport visual indicators that
        unmistakably distinguish replay from live observation.
        Renders null in live mode (zero overhead).
        In replay mode: vignette border, corner brackets, top progress bar,
        floating mode badge, playhead timestamp, and keyboard shortcut hints.
        Also registers Space/←/→/Esc keyboard controls for replay.
      */}
      <ReplayModeOverlay />

      {/*
        AC 9.2: Replay control panel — bottom-center, above data source indicator.
        Provides play/pause/seek/speed controls for 3D scene event log replay.
        Always visible: shows REC indicator in live mode, transport controls
        in replay mode.
      */}
      <ReplayControlPanel />

      {/*
        Sub-AC 6c: Data source status indicator — bottom-center.
        Shows whether display surfaces are live (orchestrator WS connected)
        or running on simulated Brownian-noise metrics.
      */}
      <DataSourceStatusIndicator />
    </div>
  );
}
