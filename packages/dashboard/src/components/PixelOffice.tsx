import React, { useEffect, useMemo, useState } from "react";
import layoutStyles from "../office.module.css";
import { OfficeSidebar } from "./OfficeSidebar.js";
import { OfficeStage } from "./OfficeStage.js";
import { createOfficePresenceModel, resolveOfficeSelection } from "../office-presence-model.js";
import { compareOfficeTasks } from "../office-system.js";
import type { AgentState, EventRecord, TaskState } from "../store/event-store.js";

export function PixelOffice({
  agents,
  tasks,
  events = [],
  onOpenAgent,
}: {
  agents: AgentState[];
  tasks: TaskState[];
  events?: EventRecord[];
  onOpenAgent?: (agentId: string) => void;
}) {
  const office = useMemo(
    () => createOfficePresenceModel({ agents, tasks, events }),
    [agents, tasks, events],
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    const storedRoomId = window.sessionStorage.getItem("conitens.officeFocusRoom");
    return office.rooms.some((room) => room.roomId === storedRoomId)
      ? storedRoomId
      : office.rooms[0]?.roomId ?? null;
  });
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(
    office.residents[0]?.agentId ?? null,
  );

  useEffect(() => {
    const resolved = resolveOfficeSelection({
      rooms: office.rooms,
      selectedRoomId,
      selectedResidentId,
    });
    if (resolved.selectedRoomId !== selectedRoomId) {
      setSelectedRoomId(resolved.selectedRoomId);
    }
    if (resolved.selectedResidentId !== selectedResidentId) {
      setSelectedResidentId(resolved.selectedResidentId);
    }
  }, [office.rooms, selectedResidentId, selectedRoomId]);

  const selectedRoom =
    office.rooms.find((room) => room.roomId === selectedRoomId) ??
    office.rooms[0] ??
    null;
  const selectedResident =
    office.residents.find((resident) => resident.agentId === selectedResidentId) ?? null;
  const queuedTasks = useMemo(
    () =>
      tasks
        .slice()
        .sort((left, right) => compareOfficeTasks(left.state, right.state)),
    [tasks],
  );
  const liveRoomCount = useMemo(
    () => office.rooms.filter((room) => room.snapshot.runningCount > 0).length,
    [office.rooms],
  );
  const runningResidentCount = useMemo(
    () => office.residents.filter((resident) => resident.status === "running").length,
    [office.residents],
  );
  const blockedTaskCount = useMemo(
    () => queuedTasks.filter((task) => task.state === "blocked").length,
    [queuedTasks],
  );
  const selectedRoomTaskCount = selectedRoom?.snapshot.taskCount ?? 0;
  const selectedRoomRunningCount = selectedRoom?.snapshot.runningCount ?? 0;
  const selectedRoomHandoffCount = selectedRoom
    ? office.handoffs.filter((handoff) => {
        const actor = office.residents.find((resident) => resident.agentId === handoff.actorId);
        const target = handoff.targetId
          ? office.residents.find((resident) => resident.agentId === handoff.targetId)
          : null;
        return actor?.roomId === selectedRoom.roomId || target?.roomId === selectedRoom.roomId;
      }).length
    : 0;
  const surfacedTaskCount = queuedTasks.length;
  const activeThreadLabel = selectedResident?.taskCount === 1 ? "thread" : "threads";
  const focusSummary = selectedResident
    ? `${selectedResident.agentId} is in ${selectedResident.roomLabel}, carrying ${selectedResident.taskCount} active ${activeThreadLabel}.`
    : selectedRoom
      ? `${selectedRoom.label} has ${selectedRoomTaskCount} surfaced tasks, ${selectedRoomRunningCount} running lanes, and ${selectedRoomHandoffCount} handoffs touching the room.`
      : "Select a room or resident to inspect the active operating cadence.";
  const roomReason = selectedRoom
    ? `${selectedRoom.label}: ${selectedRoomRunningCount} running, ${selectedRoomTaskCount} tasks, ${selectedRoomHandoffCount} handoffs.`
    : "No room selected.";

  const handleSelectRoom = (roomId: string) => {
    const room = office.rooms.find((entry) => entry.roomId === roomId);
    setSelectedRoomId(roomId);
    setSelectedResidentId(room?.visibleResidents[0]?.agentId ?? null);
  };

  const handleSelectResident = (agentId: string) => {
    const resident = office.residents.find((entry) => entry.agentId === agentId);
    setSelectedResidentId(agentId);
    setSelectedRoomId(resident?.roomId ?? selectedRoomId);
  };

  return (
    <div
      className={layoutStyles["office-frame"]}
      data-office-preview-shell="viewport-dominant"
    >
      <section className={layoutStyles["office-summary-band"]}>
        <div className={layoutStyles["office-summary-copy"]}>
          <p className={layoutStyles["office-summary-kicker"]}>Spatial Lens</p>
          <h2 className={layoutStyles["office-summary-title"]}>
            Current floor posture
          </h2>
          <p className={layoutStyles["office-summary-text"]}>{focusSummary}</p>
          <p className={layoutStyles["office-summary-reason"]}>{roomReason}</p>
        </div>
        <div className={layoutStyles["office-summary-side"]}>
          <div className={layoutStyles["office-summary-grid"]}>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Live Rooms</span>
              <strong>{liveRoomCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{office.rooms.length} total zones</span>
            </div>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Blocked Lanes</span>
              <strong>{blockedTaskCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{runningResidentCount} running operators</span>
            </div>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Handoffs</span>
              <strong>{office.handoffCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{surfacedTaskCount} surfaced tasks</span>
            </div>
          </div>
          <div className={layoutStyles["office-focus-line"]}>
            <span className={layoutStyles["office-focus-label"]}>Focus</span>
            <strong>{selectedResident ? selectedResident.agentId : selectedRoom?.label ?? "No focus selected"}</strong>
            <span className={layoutStyles["office-focus-meta"]}>
              {selectedResident ? `${selectedResident.roomLabel} / ${selectedResident.status}` : "Select a room to inspect load"}
            </span>
            {selectedResident && onOpenAgent ? (
              <button
                className={layoutStyles["office-focus-link"]}
                type="button"
                onClick={() => onOpenAgent(selectedResident.agentId)}
              >
                Open in Agents
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <div className={layoutStyles["office-layout"]}>
        {agents.length === 0 ? (
          <div className="empty-state animated">No agents online. Waiting for heartbeats...</div>
        ) : (
          <>
            <OfficeStage
              rooms={office.rooms}
              tasks={queuedTasks}
              handoffs={office.handoffs}
              selectedRoomId={selectedRoomId}
              selectedResidentId={selectedResidentId}
              onSelectRoom={handleSelectRoom}
              onSelectResident={handleSelectResident}
            />
            <OfficeSidebar
              handoffs={office.handoffs}
              residents={office.residents}
              queuedTasks={queuedTasks}
              selectedRoom={selectedRoom}
              selectedResident={selectedResident}
              selectedResidentId={selectedResidentId}
              onSelectResident={handleSelectResident}
              onOpenAgent={onOpenAgent}
            />
          </>
        )}
      </div>
    </div>
  );
}
