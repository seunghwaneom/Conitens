import React from "react";
import layoutStyles from "../office.module.css";
import stageStyles from "../office-stage.module.css";
import { OfficeRoomScene } from "./OfficeRoomScene.js";
import type { OfficeRoomPresence } from "../office-presence-model.js";

export function OfficeStage({
  rooms,
  selectedRoomId,
  selectedResidentId,
  onSelectRoom,
  onSelectResident,
}: {
  rooms: OfficeRoomPresence[];
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const selectedRoom = rooms.find((room) => room.roomId === selectedRoomId) ?? rooms[0] ?? null;
  const liveRoomCount = rooms.filter((room) => room.snapshot.runningCount > 0).length;

  return (
    <section className={`${layoutStyles["office-panel"]} ${stageStyles["office-stage-panel"]}`}>
      <div className={stageStyles["office-stage-header"]}>
        <div className={stageStyles["office-stage-header-copy"]}>
          <p className={stageStyles["office-stage-kicker"]}>OFFICE STAGE</p>
          <span className={stageStyles["office-stage-meta"]}>stage-first operator floorplate</span>
        </div>
        <div className={stageStyles["office-stage-status"]}>
          <span className={stageStyles["office-stage-pill"]}>{rooms.length} rooms</span>
          <span className={stageStyles["office-stage-pill"]}>{liveRoomCount} live</span>
          <span className={stageStyles["office-stage-pill"]}>
            {selectedRoom ? `focus ${selectedRoom.label}` : "select a room"}
          </span>
        </div>
      </div>

      <div className={stageStyles["office-stage-shell"]}>
        {rooms.map((room) => (
          <OfficeRoomScene
            key={room.roomId}
            room={room}
            selectedRoomId={selectedRoomId}
            selectedResidentId={selectedResidentId}
            onSelectRoom={onSelectRoom}
            onSelectResident={onSelectResident}
          />
        ))}
      </div>
    </section>
  );
}
