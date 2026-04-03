import React from "react";
import layoutStyles from "../office.module.css";
import stageStyles from "../office-stage-layout.module.css";
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
  return (
    <section className={`${layoutStyles["office-panel"]} ${stageStyles["office-stage-panel"]}`}>
      <div className={stageStyles["office-stage-header"]}>
        <p className={stageStyles["office-stage-kicker"]}>OFFICE STAGE</p>
        <span className={stageStyles["office-stage-meta"]}>
          {rooms.length} rooms / stage-first operator floorplate
        </span>
      </div>

      {/* data-has-selection drives non-selected room dimming in office-room.module.css */}
      <div className={stageStyles["office-stage-shell"]} style={{ position: "relative" }} data-has-selection={selectedRoomId ? "" : undefined}>
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
