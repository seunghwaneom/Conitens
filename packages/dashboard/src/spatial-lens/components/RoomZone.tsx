import type { CSSProperties } from "react";
import { TaskNode } from "../../components/TaskNode.js";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import styles from "../styles/spatial-lens.module.css";
import { resolveSpatialLensAsset } from "../assets/assetRegistry.js";
import { toFixtureStyle } from "./FloorGrid.js";
import type { FloorViewportRoom } from "../model/floorGeometry.js";
import { GeneratedRoomBackdropLayer } from "../viewport/GeneratedRoomBackdropLayer.js";
import { OperationalOverlayLayer } from "../viewport/OperationalOverlayLayer.js";
import { RoomDepthLayer } from "../viewport/RoomDepthLayer.js";
import { RoomDressingLayer } from "../viewport/RoomDressingLayer.js";
import { RoomKitLayer } from "../viewport/RoomKitLayer.js";
import { getRoomTemplate } from "../viewport/roomTemplates.js";
import { WallDetailLayer } from "../viewport/WallDetailLayer.js";
import { WorkstationLayer } from "../viewport/WorkstationLayer.js";

export function RoomZone({
  room,
  model,
  selectedRoomId,
  showGeneratedBackdrops = false,
  onSelectRoom,
}: {
  room: OfficeRoomPresence;
  model: FloorViewportRoom;
  selectedRoomId: string | null;
  showGeneratedBackdrops?: boolean;
  onSelectRoom: (roomId: string) => void;
}) {
  const latestFamily = room.snapshot.latestFamily ?? "stable";
  const template = getRoomTemplate(model.id);
  const floorStyle = template ? {} : getRoomFloorStyle(model);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={room.roomId === selectedRoomId}
      className={[
        styles["room-zone"],
        room.roomId === selectedRoomId ? styles.selected : "",
      ].filter(Boolean).join(" ")}
      data-room-kind={model.kind}
      data-room-id={model.id}
      data-room-priority={model.priority}
      data-room-theme={template?.theme ?? model.kind}
      data-wall-style={template?.wallStyle ?? "default-wall"}
      data-status-tone={model.statusTone}
      data-building-connected="true"
      style={toRoomZoneStyle(model)}
      onClick={() => onSelectRoom(room.roomId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRoom(room.roomId);
        }
      }}
    >
      <span className={`${styles["room-post"]} ${styles["post-nw"]}`} aria-hidden="true" />
      <span className={`${styles["room-post"]} ${styles["post-ne"]}`} aria-hidden="true" />
      <span className={`${styles["room-post"]} ${styles["post-sw"]}`} aria-hidden="true" />
      <span className={`${styles["room-post"]} ${styles["post-se"]}`} aria-hidden="true" />
      {room.schema.windows.map((window, index) => (
        <span
          key={`${room.roomId}-window-${index}`}
          className={styles["room-window"]}
          style={{
            left: `${window.left}%`,
            top: `${window.top}%`,
            width: `${window.width}%`,
          }}
          aria-hidden="true"
        />
      ))}
      {room.schema.doors.map((door, index) => (
        <span
          key={`${room.roomId}-door-${index}`}
          className={styles["room-door"]}
          data-door-state={door.state}
          style={{ left: `${door.left}%`, top: `${door.top}%` }}
          aria-hidden="true"
        />
      ))}
      <div className={styles["room-titlebar"]}>
        <div className={styles["room-title-copy"]}>
          <strong>{model.label}</strong>
          <span>{model.teamLabel}</span>
        </div>
      </div>
      <span className={styles["room-status"]} data-status-tone={model.statusTone}>
        {model.occupancyLabel}
      </span>
      <div className={styles["room-stats"]}>
        <span>{model.residentCount} seated</span>
        <span>{model.taskCount} tasks</span>
        <span>{latestFamily}</span>
      </div>
      <div
        className={styles["room-floor"]}
        data-room-floor-id={model.id}
        data-floor-style={template?.floorStyle ?? model.floorSurface}
        style={floorStyle}
      >
        {template ? (
          <>
            {showGeneratedBackdrops ? (
              <GeneratedRoomBackdropLayer roomId={template.roomId} />
            ) : null}
            <RoomDepthLayer template={template} />
            <RoomKitLayer template={template} />
            <WallDetailLayer template={template} />
            <WorkstationLayer template={template} />
            <RoomDressingLayer template={template} />
            <OperationalOverlayLayer template={template} />
          </>
        ) : null}
        <div className={styles["room-fixture-layer"]} aria-hidden="true">
          {template
            ? null
            : model.fixtures.map((fixture) => (
                <span
                  key={fixture.id}
                  className={styles["floor-fixture"]}
                  data-fixture-kind={fixture.kind}
                  style={toFixtureStyle(fixture)}
                />
              ))}
          {room.taskNodes.map((taskNode) => (
            <TaskNode
              key={taskNode.taskId}
              taskId={taskNode.taskId}
              tone={taskNode.tone}
              left={taskNode.left}
              top={taskNode.top}
            />
          ))}
        </div>
        <div className={styles["room-agent-layer"]} aria-hidden="true">
          {room.overflowCount > 0 && (
            <span
              className={styles["room-overflow"]}
              style={{
                left: `${room.schema.overflowSlot.left}%`,
                top: `${room.schema.overflowSlot.top}%`,
              }}
            >
              +{room.overflowCount}
            </span>
          )}
          {room.residents.length === 0 && (
            <span className={styles["room-awaiting"]}>awaiting crew</span>
          )}
        </div>
      </div>
    </div>
  );
}

function toRoomZoneStyle(model: FloorViewportRoom): CSSProperties {
  return {
    left: `${model.rect.x}%`,
    top: `${model.rect.y}%`,
    width: `${model.rect.w}%`,
    height: `${model.rect.h}%`,
  };
}

function getRoomFloorStyle(model: FloorViewportRoom): CSSProperties {
  const asset = resolveSpatialLensAsset(model.floorAssetId);
  if (!asset || asset.kind !== "floor" || !asset.src) {
    return {};
  }

  return {
    backgroundImage: `url("${asset.src}")`,
  };
}
