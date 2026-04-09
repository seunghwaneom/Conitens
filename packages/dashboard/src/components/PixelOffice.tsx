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
}: {
  agents: AgentState[];
  tasks: TaskState[];
  events?: EventRecord[];
}) {
  const office = useMemo(
    () => createOfficePresenceModel({ agents, tasks, events }),
    [agents, tasks, events],
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(office.rooms[0]?.roomId ?? null);
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
  const surfacedTaskCount = queuedTasks.length;
  const activeThreadLabel = selectedResident?.taskCount === 1 ? "thread" : "threads";

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
    <div className={layoutStyles["office-frame"]}>
      <section className={layoutStyles["office-summary-band"]}>
        <div className={layoutStyles["office-summary-copy"]}>
          <p className={layoutStyles["office-summary-kicker"]}>Spatial Lens</p>
          <h2 className={layoutStyles["office-summary-title"]}>
            Ops floor map
          </h2>
          <p className={layoutStyles["office-summary-text"]}>
            {selectedResident
              ? `${selectedResident.agentId} anchors ${selectedResident.roomLabel} with ${selectedResident.taskCount} active ${activeThreadLabel} in view.`
              : selectedRoom
                ? `${selectedRoom.label} currently carries ${selectedRoom.snapshot.taskCount} surfaced tasks across ${selectedRoom.snapshot.agentCount} visible residents.`
                : "Select a room or resident to inspect the active operating cadence."}
          </p>
        </div>
        <div className={layoutStyles["office-summary-side"]}>
          <div className={layoutStyles["office-summary-grid"]}>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Live Rooms</span>
              <strong>{liveRoomCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{office.rooms.length} total zones</span>
            </div>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Running Agents</span>
              <strong>{runningResidentCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{office.residents.length} online operators</span>
            </div>
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Surfaced Tasks</span>
              <strong>{surfacedTaskCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>queue + review lanes</span>
            </div>
          </div>
          <div className={layoutStyles["office-focus-line"]}>
            <span className={layoutStyles["office-focus-label"]}>Focus</span>
            <strong>{selectedResident ? selectedResident.agentId : selectedRoom?.label ?? "No focus selected"}</strong>
            <span className={layoutStyles["office-focus-meta"]}>
              {selectedResident ? `${selectedResident.roomLabel} · ${selectedResident.status}` : "Select a room to inspect load"}
            </span>
          </div>
        </div>
      </section>
      <nav className={layoutStyles["office-room-strip"]} aria-label="Room focus">
        {office.rooms.map((room) => {
          const isActive = room.roomId === selectedRoomId;
          return (
            <button
              key={room.roomId}
              type="button"
              className={`${layoutStyles["office-room-chip"]}${isActive ? ` ${layoutStyles["office-room-chip-active"]}` : ""}`}
              onClick={() => handleSelectRoom(room.roomId)}
            >
              <span>{room.label}</span>
              <strong>{room.snapshot.taskCount}</strong>
            </button>
          );
        })}
      </nav>
      <div className={layoutStyles["office-layout"]}>
        {agents.length === 0 ? (
          <div className="empty-state animated">No agents online. Waiting for heartbeats...</div>
        ) : (
          <>
            <OfficeStage
              rooms={office.rooms}
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
            />
          </>
        )}
      </div>
    </div>
  );
}
