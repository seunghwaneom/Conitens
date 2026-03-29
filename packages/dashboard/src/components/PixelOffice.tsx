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
        .sort((left, right) => compareOfficeTasks(left.state, right.state))
        .slice(0, 6),
    [tasks],
  );

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
