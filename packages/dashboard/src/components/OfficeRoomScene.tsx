import React from "react";
import { OfficeAvatar } from "./OfficeAvatar.js";
import { TaskNode } from "./TaskNode.js";
import { getOfficeFixtureStyle } from "../office-fixture-registry.js";
import type { OfficeRoomPresence } from "../office-presence-model.js";
import stageStyles from "../office-stage.module.css";

function getRoomBadgeLabel(room: OfficeRoomPresence) {
  if (room.snapshot.runningCount > 0) return "live";
  if (room.snapshot.agentCount > 0) return "occupied";
  return "quiet";
}

export function OfficeRoomScene({
  room,
  selectedRoomId,
  selectedResidentId,
  onSelectRoom,
  onSelectResident,
}: {
  room: OfficeRoomPresence;
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const stationMap = new Map(room.schema.stationAnchors.map((station) => [station.id, station]));
  const latestFamily = room.snapshot.latestFamily ?? "stable";

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        stageStyles["office-room-tile"],
        stageStyles[`area-${room.roomId}`],
        stageStyles[`kind-${room.kind}`],
        stageStyles[`tone-${room.schema.floorTone ?? room.kind}`],
        stageStyles[`priority-${room.schema.priority}`],
        stageStyles[`status-${room.snapshot.tone}`],
        room.roomId === selectedRoomId ? stageStyles.selected : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onSelectRoom(room.roomId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRoom(room.roomId);
        }
      }}
    >
      <span className={`${stageStyles["office-room-post"]} ${stageStyles["post-nw"]}`} aria-hidden="true" />
      <span className={`${stageStyles["office-room-post"]} ${stageStyles["post-ne"]}`} aria-hidden="true" />
      <span className={`${stageStyles["office-room-post"]} ${stageStyles["post-sw"]}`} aria-hidden="true" />
      <span className={`${stageStyles["office-room-post"]} ${stageStyles["post-se"]}`} aria-hidden="true" />
      {room.schema.windows.map((window, index) => (
        <span
          key={`${room.roomId}-window-${index}`}
          className={stageStyles["office-room-window"]}
          style={{ left: `${window.left}%`, top: `${window.top}%`, width: `${window.width}%` }}
          aria-hidden="true"
        />
      ))}
      {room.schema.doors.map((door, index) => (
        <span
          key={`${room.roomId}-door-${index}`}
          className={[stageStyles["office-room-door"], stageStyles[door.state]].join(" ")}
          style={{ left: `${door.left}%`, top: `${door.top}%` }}
          aria-hidden="true"
        />
      ))}
      <div className={stageStyles["office-room-meta"]}>
        <div>
          <strong>{room.label}</strong>
        </div>
        <span className={`badge ${room.snapshot.tone}`}>{getRoomBadgeLabel(room)}</span>
      </div>
      <div className={stageStyles["office-room-stats"]}>
        <span>{room.snapshot.agentCount} seated</span>
        <span>{room.snapshot.taskCount} tasks</span>
        <span>{latestFamily}</span>
      </div>
      <div className={stageStyles["office-room-scene"]} aria-hidden="true">
        <div className={stageStyles["office-room-fixtures"]}>
          {room.schema.fixtureClusters.flatMap((cluster) =>
            cluster.fixtures.map((fixture, index) => (
              <span
                key={`${cluster.id}-${fixture.kind}-${index}`}
                className={stageStyles["office-fixture"]}
                style={{
                  ...getOfficeFixtureStyle(fixture.kind),
                  left: `${fixture.left}%`,
                  top: `${fixture.top}%`,
                }}
              />
            )),
          )}
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
        <div className={stageStyles["office-room-avatars"]}>
          {room.visibleResidents.map((resident, index) => {
            const slot = room.schema.slots[index];
            const station = stationMap.get(slot.stationId);
            if (!station) return null;
            return (
              <button
                key={resident.agentId}
                type="button"
                className={[
                  stageStyles["office-room-avatar-slot"],
                  stageStyles[`status-${resident.status}`],
                  resident.agentId === selectedResidentId ? stageStyles.selected : "",
                ].filter(Boolean).join(" ")}
              style={{
                  left: `${station.left + (slot.offsetX ?? 0)}%`,
                  top: `${station.top + (slot.offsetY ?? 0)}%`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectResident(resident.agentId);
                }}
              >
                <span className={stageStyles["office-avatar-ring"]} aria-hidden="true" />
                <span className={stageStyles["office-avatar-shadow"]} aria-hidden="true" />
                <OfficeAvatar
                  profile={resident.profile}
                  label={resident.agentId}
                  selected={resident.agentId === selectedResidentId}
                  pose={slot.pose}
                  facing={slot.facing}
                />
              </button>
            );
          })}
          {room.overflowCount > 0 && (
            <span
              className={stageStyles["office-room-overflow"]}
              style={{
                left: `${room.schema.overflowSlot.left}%`,
                top: `${room.schema.overflowSlot.top}%`,
              }}
            >
              +{room.overflowCount}
            </span>
          )}
          {room.residents.length === 0 && (
            <span className={stageStyles["office-room-awaiting"]}>
              awaiting crew
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
