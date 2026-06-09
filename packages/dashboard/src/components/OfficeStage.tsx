import React, { useEffect, useState } from "react";
import layoutStyles from "../office.module.css";
import stageStyles from "../office-stage.module.css";
import { OfficeRoomScene } from "./OfficeRoomScene.js";
import { getOfficeFixtureStyle } from "../office-fixture-registry.js";
import { FloorViewport } from "../spatial-lens/index.js";
import {
  OFFICE_STAGE_CORRIDORS,
  OFFICE_STAGE_CORRIDOR_FIXTURES,
  OFFICE_STAGE_FOCAL_LANES,
} from "../office-stage-schema.js";
import type { OfficeHandoffSnapshot } from "../dashboard-model.js";
import type { OfficeRoomPresence } from "../office-presence-model.js";
import type { TaskState } from "../store/event-store.js";

type OfficeStageMode = "focused" | "overview" | "classic";

const OFFICE_STAGE_MODE_STORAGE_KEY = "conitens.officeStageMode";

function getInitialStageMode(): OfficeStageMode {
  const stored = window.sessionStorage.getItem(OFFICE_STAGE_MODE_STORAGE_KEY);
  if (stored === "classic" || stored === "overview") {
    return stored;
  }
  return "focused";
}

export function OfficeStage({
  rooms,
  tasks = [],
  handoffs = [],
  selectedRoomId,
  selectedResidentId,
  onSelectRoom,
  onSelectResident,
}: {
  rooms: OfficeRoomPresence[];
  tasks?: TaskState[];
  handoffs?: OfficeHandoffSnapshot[];
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const [stageMode, setStageMode] = useState<OfficeStageMode>(getInitialStageMode);
  const selectedRoom = rooms.find((room) => room.roomId === selectedRoomId) ?? rooms[0] ?? null;
  const liveRoomCount = rooms.filter((room) => room.snapshot.runningCount > 0).length;

  useEffect(() => {
    window.sessionStorage.setItem(OFFICE_STAGE_MODE_STORAGE_KEY, stageMode);
  }, [stageMode]);

  return (
    <section
      className={`${layoutStyles["office-panel"]} ${stageStyles["office-stage-panel"]}`}
      data-stage-mode={stageMode}
    >
      <div className={stageStyles["office-stage-header"]}>
        <div className={stageStyles["office-stage-header-copy"]}>
          <p className={stageStyles["office-stage-kicker"]}>
            {stageMode === "overview" ? "Floor overview" : "Live camera"}
          </p>
          <span className={stageStyles["office-stage-meta"]}>
            {stageMode === "overview"
              ? "Whole-floor topology for debug and orientation."
              : "Focused scene follows the selected room."}
          </span>
        </div>
        <div className={stageStyles["office-stage-status"]}>
          <span className={stageStyles["office-stage-pill"]}>{rooms.length} rooms</span>
          <span className={stageStyles["office-stage-pill"]}>{liveRoomCount} live</span>
          <span className={stageStyles["office-stage-pill"]}>
            {selectedRoom ? `focus ${selectedRoom.label}` : "select a room"}
          </span>
          <div className={stageStyles["office-stage-mode-toggle"]} aria-label="Map mode">
            <button
              className={[
                stageStyles["office-stage-mode-button"],
                stageMode === "focused" ? stageStyles.active : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-pressed={stageMode === "focused"}
              onClick={() => setStageMode("focused")}
            >
              Focused
            </button>
            <button
              className={[
                stageStyles["office-stage-mode-button"],
                stageMode === "overview" ? stageStyles.active : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-pressed={stageMode === "overview"}
              onClick={() => setStageMode("overview")}
            >
              Floor Overview
            </button>
            <button
              className={[
                stageStyles["office-stage-mode-button"],
                stageMode === "classic" ? stageStyles.active : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-pressed={stageMode === "classic"}
              onClick={() => setStageMode("classic")}
            >
              Classic
            </button>
          </div>
        </div>
      </div>

      {stageMode !== "classic" ? (
        <FloorViewport
          rooms={rooms}
          tasks={tasks}
          handoffs={handoffs}
          viewMode={stageMode}
          selectedRoomId={selectedRoomId}
          selectedResidentId={selectedResidentId}
          onSelectRoom={onSelectRoom}
          onSelectResident={onSelectResident}
        />
      ) : (
        <div className={stageStyles["office-stage-shell"]}>
          {OFFICE_STAGE_CORRIDORS.map((corridor, index) => (
            <span
              key={`corridor-${index}`}
              className={stageStyles["office-stage-corridor"]}
              style={{
                left: `${corridor.x}%`,
                top: `${corridor.y}%`,
                width: `${corridor.w}%`,
                height: `${corridor.h}%`,
              }}
              aria-hidden="true"
            />
          ))}
          {OFFICE_STAGE_FOCAL_LANES.map((lane, index) => (
            <span
              key={`focal-lane-${index}`}
              className={stageStyles["office-stage-focal-lane"]}
              style={{
                left: `${lane.x}%`,
                top: `${lane.y}%`,
                width: `${lane.w}%`,
                height: `${lane.h}%`,
              }}
              aria-hidden="true"
            />
          ))}
          {OFFICE_STAGE_CORRIDOR_FIXTURES.map((fixture, index) => (
            <span
              key={`corridor-fixture-${fixture.kind}-${index}`}
              className={stageStyles["office-fixture"]}
              style={{
                ...getOfficeFixtureStyle(fixture.kind),
                left: `${fixture.left}%`,
                top: `${fixture.top}%`,
              }}
              aria-hidden="true"
            />
          ))}
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
      )}
    </section>
  );
}
