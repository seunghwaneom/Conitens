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
  return (
    <section className={`${layoutStyles["office-panel"]} ${stageStyles["office-stage-panel"]}`}>
      <div className={stageStyles["office-stage-header"]}>
        <div>
          <p className="panel-kicker">PIXEL OFFICE</p>
          <h3 className={stageStyles["office-stage-title"]}>Stage-first operator floorplate</h3>
        </div>
        <p className={stageStyles["office-stage-subtitle"]}>
          One shared floor, six anchored teams, and only the signals needed to route work.
        </p>
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
