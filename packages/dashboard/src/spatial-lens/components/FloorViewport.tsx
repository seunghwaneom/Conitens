import { useMemo } from "react";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import { PixelThemeProvider } from "./PixelPrimitives.js";
import styles from "../styles/spatial-lens.module.css";
import { BuildingShellLayer } from "./BuildingShellLayer.js";
import { CorridorLayer } from "./CorridorLayer.js";
import { DoorFrameLayer } from "./DoorFrameLayer.js";
import { FloorplateLayer } from "./FloorplateLayer.js";
import { HandoffOverlay } from "./HandoffOverlay.js";
import { RoomZone } from "./RoomZone.js";
import { createFloorViewportModel } from "../model/floorGeometry.js";
import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { TaskState } from "../../store/event-store.js";
import {
  createFloorViewportCameraFrame,
  type FloorViewportCameraMode,
} from "../viewport/viewportCamera.js";
import { AgentLayer } from "../viewport/AgentLayer.js";

export function FloorViewport({
  rooms,
  tasks = [],
  handoffs = [],
  viewMode = "overview",
  selectedRoomId,
  selectedResidentId,
  onSelectRoom,
  onSelectResident,
}: {
  rooms: OfficeRoomPresence[];
  tasks?: TaskState[];
  handoffs?: OfficeHandoffSnapshot[];
  viewMode?: FloorViewportCameraMode;
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const model = useMemo(
    () => createFloorViewportModel({ rooms, handoffs, selectedRoomId }),
    [rooms, handoffs, selectedRoomId],
  );
  const roomModelMap = new Map(model.rooms.map((room) => [room.id, room]));
  const cameraFrame = useMemo(
    () =>
      createFloorViewportCameraFrame({
        rooms: model.rooms,
        handoffRoutes: model.handoffRoutes,
        focusedRoomId: model.selectedRoomId ?? selectedRoomId,
        mode: viewMode,
      }),
    [
      model.handoffRoutes,
      model.rooms,
      model.selectedRoomId,
      selectedRoomId,
      viewMode,
    ],
  );
  const isOverviewMode = viewMode === "overview";
  return (
    <PixelThemeProvider className={styles["spatial-lens-root"]}>
      <div
        className={styles["floor-viewport"]}
        data-spatial-lens-floor="static"
        data-viewport-camera={cameraFrame.mode}
        data-viewport-mode={viewMode}
        data-camera-zoom={cameraFrame.scale}
        data-focused-room-id={cameraFrame.focusRoomId ?? ""}
        data-camera-target-room-id={cameraFrame.targetRoomId ?? ""}
        data-focused-route-framing="overview-topology"
        data-overview-role={isOverviewMode ? "topology" : undefined}
        data-map-task-treatment="room-nodes"
        data-camera-scene-bounds={
          `${cameraFrame.sceneBounds.x},${cameraFrame.sceneBounds.y},` +
          `${cameraFrame.sceneBounds.w},${cameraFrame.sceneBounds.h}`
        }
        data-building-shell="connected"
        data-room-count={model.rooms.length}
        data-live-room-count={model.liveRoomCount}
      >
        {isOverviewMode ? (
          <span className={styles["floor-overview-label"]}>
            1x Floor Overview
          </span>
        ) : null}
        <div
          className={styles["floor-camera"]}
          data-camera-stage="floor"
          style={{
            left: `${cameraFrame.left}%`,
            top: `${cameraFrame.top}%`,
            width: `${cameraFrame.width}%`,
            height: `${cameraFrame.height}%`,
            transform: `scale(${cameraFrame.scale})`,
            transformOrigin: "left top",
          }}
        >
          <FloorplateLayer layout={model.layout} />
          <BuildingShellLayer layout={model.layout} />
          <CorridorLayer
            corridors={model.corridors}
            fixtures={model.corridorFixtures}
          />
          <HandoffOverlay
            routes={model.handoffRoutes}
            blockedMarkers={model.blockedLaneMarkers}
          />
          <div className={styles["room-layer"]}>
            {rooms.map((room) => {
              const roomModel = roomModelMap.get(room.roomId);
              if (!roomModel) return null;
              return (
                <RoomZone
                  key={room.roomId}
                  room={room}
                  model={roomModel}
                  selectedRoomId={model.selectedRoomId ?? selectedRoomId}
                  showGeneratedBackdrops={false}
                  showTaskNodes={true}
                  focusRole="overview"
                  onSelectRoom={onSelectRoom}
                />
              );
            })}
          </div>
          <AgentLayer
            rooms={rooms}
            viewportRooms={model.rooms}
            tasks={tasks}
            handoffs={handoffs}
            operatorFocusOnly={false}
            selectedResidentId={selectedResidentId}
            onSelectResident={onSelectResident}
          />
          <DoorFrameLayer rooms={model.rooms} />
        </div>
      </div>
    </PixelThemeProvider>
  );
}
