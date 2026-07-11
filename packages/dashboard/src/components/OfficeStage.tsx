import { useEffect, useRef } from "react";
import layoutStyles from "../office.module.css";
import stageStyles from "../office-stage.module.css";
import { AgentCharacterStage } from "./AgentCharacterStage.js";
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
import type { EventRecord, TaskState } from "../store/event-store.js";

export type OfficeStageMode = "focused" | "overview" | "classic";

export const OFFICE_STAGE_MODE_STORAGE_KEY = "conitens.officeStageMode";

const OFFICE_STAGE_MODES = [
  { mode: "focused", label: "Agents" },
  { mode: "overview", label: "Topology" },
  { mode: "classic", label: "Classic" },
] as const satisfies readonly { readonly mode: OfficeStageMode; readonly label: string }[];

export function getInitialOfficeStageMode(): OfficeStageMode {
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
  events = [],
  stageMode,
  selectedRoomId,
  selectedResidentId,
  onStageModeChange,
  onSelectRoom,
  onSelectResident,
}: {
  rooms: OfficeRoomPresence[];
  tasks?: TaskState[];
  handoffs?: OfficeHandoffSnapshot[];
  events?: EventRecord[];
  stageMode: OfficeStageMode;
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onStageModeChange: (stageMode: OfficeStageMode) => void;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const selectedRoom = rooms.find((room) => room.roomId === selectedRoomId) ?? rooms[0] ?? null;
  const liveRoomCount = rooms.filter((room) => room.snapshot.runningCount > 0).length;
  const activeModeIndex = OFFICE_STAGE_MODES.findIndex((entry) => entry.mode === stageMode);
  const tabRefs = useRef<Record<OfficeStageMode, HTMLButtonElement | null>>({
    focused: null,
    overview: null,
    classic: null,
  });
  const shouldFocusSelectedTab = useRef(false);

  useEffect(() => {
    if (!shouldFocusSelectedTab.current) return;
    shouldFocusSelectedTab.current = false;
    tabRefs.current[stageMode]?.focus();
  }, [stageMode]);

  const selectModeByOffset = (offset: -1 | 1) => {
    const nextIndex =
      (activeModeIndex + offset + OFFICE_STAGE_MODES.length) % OFFICE_STAGE_MODES.length;
    shouldFocusSelectedTab.current = true;
    onStageModeChange(OFFICE_STAGE_MODES[nextIndex].mode);
  };

  return (
    <section
      className={`${layoutStyles["office-panel"]} ${stageStyles["office-stage-panel"]}`}
      data-stage-mode={stageMode}
    >
      <div className={stageStyles["office-stage-header"]}>
        <div className={stageStyles["office-stage-header-copy"]}>
          <p className={stageStyles["office-stage-kicker"]}>
            {stageMode === "focused"
              ? "Agent cast"
              : stageMode === "overview"
                ? "Runtime topology"
                : "Live camera"}
          </p>
          <span className={stageStyles["office-stage-meta"]}>
            {stageMode === "focused"
              ? "Agent characters, role motion, and current handoff signal."
              : stageMode === "overview"
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
          <div
            className={stageStyles["office-stage-mode-toggle"]}
            role="tablist"
            aria-label="Office stage mode"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectModeByOffset(1);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectModeByOffset(-1);
              }
            }}
          >
            {OFFICE_STAGE_MODES.map((entry) => {
              const isSelected = stageMode === entry.mode;
              return (
                <button
                  key={entry.mode}
                  id={getStageTabId(entry.mode)}
                  ref={(node) => {
                    tabRefs.current[entry.mode] = node;
                  }}
                  className={[
                    stageStyles["office-stage-mode-button"],
                    isSelected ? stageStyles.active : "",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={getStagePanelId(entry.mode)}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => onStageModeChange(entry.mode)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {OFFICE_STAGE_MODES.map((entry) => {
        const isSelected = stageMode === entry.mode;
        return (
          <div
            key={`${entry.mode}-panel`}
            id={getStagePanelId(entry.mode)}
            role="tabpanel"
            aria-labelledby={getStageTabId(entry.mode)}
            hidden={!isSelected}
            className={stageStyles["office-stage-tabpanel"]}
          >
            {isSelected && entry.mode === "focused" ? (
              <AgentCharacterStage
                residents={rooms.flatMap((room) => room.residents)}
                tasks={tasks}
                handoffs={handoffs}
                selectedResidentId={selectedResidentId}
                onSelectResident={onSelectResident}
              />
            ) : null}
            {isSelected && entry.mode === "overview" ? (
              <FloorViewport
                rooms={rooms}
                tasks={tasks}
                handoffs={handoffs}
                viewMode="overview"
                selectedRoomId={selectedRoomId}
                selectedResidentId={selectedResidentId}
                onSelectRoom={onSelectRoom}
                onSelectResident={onSelectResident}
              />
            ) : null}
            {isSelected && entry.mode === "classic" ? (
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
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function getStageTabId(mode: OfficeStageMode): string {
  return `office-stage-${mode}-tab`;
}

function getStagePanelId(mode: OfficeStageMode): string {
  return `office-stage-${mode}-panel`;
}
