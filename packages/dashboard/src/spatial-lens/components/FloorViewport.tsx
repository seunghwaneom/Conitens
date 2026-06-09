import { useMemo } from "react";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import { PixelThemeProvider } from "./PixelPrimitives.js";
import styles from "../styles/spatial-lens.module.css";
import { BuildingShellLayer } from "./BuildingShellLayer.js";
import { CorridorLayer } from "./CorridorLayer.js";
import { DoorFrameLayer } from "./DoorFrameLayer.js";
import { FloorplateLayer } from "./FloorplateLayer.js";
import { FocusedCorridorContinuityLayer } from "./FocusedCorridorContinuityLayer.js";
import { FocusedRouteTargetEdge } from "./FocusedRouteTargetEdge.js";
import { HandoffOverlay } from "./HandoffOverlay.js";
import { MinimapDock } from "./MinimapDock.js";
import { RoomZone } from "./RoomZone.js";
import { createFloorViewportModel } from "../model/floorGeometry.js";
import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { TaskState } from "../../store/event-store.js";
import {
  createFloorViewportCameraFrame,
  type FloorViewportCameraMode,
} from "../viewport/viewportCamera.js";
import { AgentLayer, AgentOffscreenRail } from "../viewport/AgentLayer.js";

export function FloorViewport({
  rooms,
  tasks = [],
  handoffs = [],
  viewMode = "focused",
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
  const isFocusedMode = viewMode === "focused";
  const isOverviewMode = viewMode === "overview";
  const focusedRouteFraming =
    isFocusedMode && cameraFrame.targetRoomId
      ? "source-corridor-target-edge"
      : isFocusedMode
        ? "source-room"
        : "overview-topology";
  const focusedRoomLabel =
    rooms.find((room) => room.roomId === cameraFrame.focusRoomId)?.label ??
    "Ops Control";

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
        data-focused-route-framing={focusedRouteFraming}
        data-overview-role={isOverviewMode ? "topology" : undefined}
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
          {isFocusedMode ? (
            <FocusedCorridorContinuityLayer routes={model.handoffRoutes} />
          ) : null}
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
                  showGeneratedBackdrops={isFocusedMode}
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
            selectedResidentId={selectedResidentId}
            onSelectResident={onSelectResident}
          />
          <DoorFrameLayer rooms={model.rooms} />
        </div>
        {isFocusedMode ? (
          <span
            className={styles["focused-source-plaque"]}
            data-focused-source-plaque="true"
          >
            {focusedRoomLabel}
          </span>
        ) : null}
        {isFocusedMode ? (
          <FocusedRouteTargetEdge
            rooms={rooms}
            tasks={tasks}
            handoffs={handoffs}
            targetRoomId={cameraFrame.targetRoomId}
            selectedResidentId={selectedResidentId}
            onSelectResident={onSelectResident}
          />
        ) : null}
        {isFocusedMode ? (
          <MinimapDock
            rooms={model.rooms}
            focusedRoomId={cameraFrame.focusRoomId}
            targetRoomId={cameraFrame.targetRoomId}
            onSelectRoom={onSelectRoom}
          />
        ) : null}
        {isFocusedMode ? (
          <AgentOffscreenRail
            rooms={rooms}
            tasks={tasks}
            handoffs={handoffs}
            selectedResidentId={selectedResidentId}
            focusedRoomId={cameraFrame.focusRoomId}
            targetRoomId={cameraFrame.targetRoomId}
            onSelectResident={onSelectResident}
          />
        ) : null}
      </div>
    </PixelThemeProvider>
  );
}
