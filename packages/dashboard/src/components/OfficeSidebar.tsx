import React from "react";
import layoutStyles from "../office.module.css";
import sidebarStyles from "../office-sidebar.module.css";
import type { OfficeHandoffSnapshot } from "../dashboard-model.js";
import type { OfficeResidentPresence, OfficeRoomPresence } from "../office-presence-model.js";
import type { TaskState } from "../store/event-store.js";
import { OFFICE_TEAM_BRIEFS } from "../office-team-briefs.js";
import { getTaskTone } from "../utils.js";

const ROLE_LABELS = {
  orchestrator: "orchestrator",
  implementer: "implementer",
  researcher: "researcher",
  reviewer: "reviewer",
  validator: "validator",
} as const;

function getQueueProgress(state: string) {
  switch (state) {
    case "blocked":
      return 24;
    case "review":
      return 68;
    case "active":
      return 82;
    case "assigned":
      return 46;
    default:
      return 34;
  }
}

export function OfficeSidebar({
  handoffs,
  residents,
  queuedTasks,
  selectedRoom,
  selectedResident,
  selectedResidentId,
  onSelectResident,
}: {
  handoffs: OfficeHandoffSnapshot[];
  residents: OfficeResidentPresence[];
  queuedTasks: TaskState[];
  selectedRoom: OfficeRoomPresence | null;
  selectedResident: OfficeResidentPresence | null;
  selectedResidentId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const teamBrief = selectedRoom ? OFFICE_TEAM_BRIEFS[selectedRoom.teamId] : null;

  return (
    <aside className={`${layoutStyles["office-panel"]} ${sidebarStyles["office-rail"]}`}>
      <section className={sidebarStyles["office-rail-section"]}>
        <div className="section-head">
          <p className="panel-kicker">ACTIVE AGENTS</p>
          <span className="section-meta">{residents.length} online</span>
        </div>
        <div className={sidebarStyles["office-staff-list"]}>
          {residents.length === 0 ? (
            <div className="empty-state compact">No residents online</div>
          ) : (
            residents.map((resident) => (
              <button
                key={resident.agentId}
                type="button"
                className={[
                  sidebarStyles["office-staff-row"],
                  resident.agentId === selectedResidentId ? sidebarStyles.selected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelectResident(resident.agentId)}
              >
                <div className={sidebarStyles["office-staff-main"]}>
                  <span
                    className={[
                      sidebarStyles["office-status-dot"],
                      sidebarStyles[`status-${resident.profile.role}`],
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{resident.agentId}</strong>
                    <div className="muted">
                      {resident.teamLabel} / {ROLE_LABELS[resident.profile.role]}
                    </div>
                  </div>
                </div>
                <span className={`badge ${resident.status === "running" ? "info" : "neutral"}`}>
                  {resident.status}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className={sidebarStyles["office-rail-section"]}>
        <div className="section-head">
          <p className="panel-kicker">TASK QUEUE</p>
          <span className="section-meta">{queuedTasks.length} surfaced</span>
        </div>
        <div className={sidebarStyles["office-data-list"]}>
          {queuedTasks.length === 0 ? (
            <div className="empty-state compact">No queued tasks in the current view</div>
          ) : (
            queuedTasks.map((task) => {
              const tone = getTaskTone(task.state);
              return (
                <div key={task.taskId} className={sidebarStyles["office-data-row"]}>
                  <div className={sidebarStyles["office-task-main"]}>
                    <strong>{task.taskId}</strong>
                    <div className="muted">{task.assignee ?? "unassigned"}</div>
                    <div className={sidebarStyles["office-progress-track"]} aria-hidden="true">
                      <span
                        className={[sidebarStyles["office-progress-bar"], sidebarStyles[tone]].join(" ")}
                        style={{ width: `${getQueueProgress(task.state)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`badge state ${tone}`}>{task.state}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className={sidebarStyles["office-rail-section"]}>
        <div className="section-head">
          <p className="panel-kicker">RECENT HANDOFFS</p>
          <span className="section-meta">{handoffs.length} live routes</span>
        </div>
        <div className={sidebarStyles["office-data-list"]}>
          {handoffs.length === 0 ? (
            <div className="empty-state compact">No live handoff routes</div>
          ) : (
            handoffs.map((handoff) => (
              <div key={handoff.id} className={sidebarStyles["office-data-row"]}>
                <div>
                  <strong>
                    {handoff.fromLabel} → {handoff.toLabel}
                  </strong>
                  <div className="muted">
                    {handoff.actorId}
                    {handoff.targetId ? ` / ${handoff.targetId}` : ""}
                  </div>
                </div>
                <div className={sidebarStyles["office-route-meta"]}>
                  <span className="chip info">{handoff.taskId}</span>
                  <span className="muted">{handoff.timestamp.slice(11, 19)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={sidebarStyles["office-focus-card"]}>
        {selectedResident ? (
          <>
            <div className={sidebarStyles["office-focus-head"]}>
              <strong>{selectedResident.agentId}</strong>
              <span className="muted">{selectedResident.roomLabel}</span>
            </div>
            <p className={sidebarStyles["office-focus-copy"]}>{selectedResident.profile.voice}</p>
            <div className={sidebarStyles["office-focus-meta"]}>
              <span>{selectedResident.taskCount} assigned tasks</span>
              <span>{selectedResident.roleTaskCount} priority tasks</span>
              <span>{selectedResident.profile.signatureProp}</span>
            </div>
          </>
        ) : selectedRoom ? (
          <>
            <div className={sidebarStyles["office-focus-head"]}>
              <strong>{selectedRoom.label}</strong>
              <span className="muted">{selectedRoom.teamLabel}</span>
            </div>
            <p className={sidebarStyles["office-focus-copy"]}>
              {teamBrief?.mission ?? "Shared room context is stable."}
            </p>
            <div className={sidebarStyles["office-focus-meta"]}>
              <span>{selectedRoom.snapshot.agentCount} residents</span>
              <span>{selectedRoom.snapshot.taskCount} tasks</span>
              <span>{selectedRoom.snapshot.latestFamily ?? "stable"}</span>
            </div>
          </>
        ) : (
          <p className={sidebarStyles["office-focus-copy"]}>
            Select a room or resident to focus the rail.
          </p>
        )}
      </section>
    </aside>
  );
}

