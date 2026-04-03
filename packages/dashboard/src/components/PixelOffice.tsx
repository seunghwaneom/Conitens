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
  const liveRouteCount = office.handoffs.length;
  const activeThreadLabel = selectedResident?.taskCount === 1 ? "thread" : "threads";
  const liveRouteLabel = liveRouteCount === 1 ? "route" : "routes";
  const priorityTask = queuedTasks[0] ?? null;
  const latestHandoff = office.handoffs[0] ?? null;
  const selectedRoomSummary = selectedRoom
    ? `${selectedRoom.snapshot.agentCount} residents · ${selectedRoom.snapshot.taskCount} tasks`
    : "Select a room to inspect room load";
  const priorityTaskSummary = priorityTask
    ? `${priorityTask.state} · ${priorityTask.assignee ?? "unassigned"}`
    : "No queued work";
  const latestHandoffSummary = latestHandoff
    ? `${latestHandoff.fromLabel} -> ${latestHandoff.toLabel} · ${latestHandoff.timestamp.slice(11, 16)}`
    : "No live route";

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
          <p className={layoutStyles["office-summary-kicker"]}>Operator Preview</p>
          <h2 className={layoutStyles["office-summary-title"]}>
            Quiet-control stage for checking room density, routing, and crew focus.
          </h2>
          <p className={layoutStyles["office-summary-text"]}>
            {selectedResident
              ? `${selectedResident.agentId} is anchored in ${selectedResident.roomLabel} with ${selectedResident.taskCount} active ${activeThreadLabel} in view.`
              : selectedRoom
                ? `${selectedRoom.label} is carrying ${selectedRoom.snapshot.taskCount} surfaced tasks across ${selectedRoom.snapshot.agentCount} visible residents.`
                : "Select a room or resident to inspect the current operating cadence."}
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
            <div className={layoutStyles["office-summary-item"]}>
              <span className={layoutStyles["office-summary-label"]}>Live Routes</span>
              <strong>{liveRouteCount}</strong>
              <span className={layoutStyles["office-summary-note"]}>{liveRouteLabel} visible in the handoff trail</span>
            </div>
          </div>
          <div className={layoutStyles["office-signal-strip"]}>
            <div className={layoutStyles["office-signal-item"]}>
              <span className={layoutStyles["office-signal-label"]}>Focus</span>
              <strong>{selectedResident ? selectedResident.agentId : selectedRoom?.label ?? "No focus"}</strong>
              <p>{selectedResident ? `${selectedResident.roomLabel} · ${selectedResident.status}` : selectedRoomSummary}</p>
            </div>
            <div className={layoutStyles["office-signal-item"]}>
              <span className={layoutStyles["office-signal-label"]}>Queue Head</span>
              <strong>{priorityTask?.taskId ?? "Queue clear"}</strong>
              <p>{priorityTaskSummary}</p>
            </div>
            <div className={layoutStyles["office-signal-item"]}>
              <span className={layoutStyles["office-signal-label"]}>Latest Route</span>
              <strong>{latestHandoff?.taskId ?? "No recent handoff"}</strong>
              <p>{latestHandoffSummary}</p>
            </div>
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
