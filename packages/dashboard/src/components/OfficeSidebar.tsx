import React from "react";
import layoutStyles from "../office.module.css";
import sidebarStyles from "../office-sidebar.module.css";
import type { OfficeHandoffSnapshot } from "../dashboard-model.js";
import type { OfficeResidentPresence, OfficeRoomPresence } from "../office-presence-model.js";
import { buildOfficeFocusStripView, buildOfficeSidebarRailView } from "../office-sidebar-view-model.ts";
import type { TaskState } from "../store/event-store.js";
import { getTaskTone } from "../utils.js";

const ROLE_LABELS = {
  orchestrator: "orchestrator",
  implementer: "implementer",
  researcher: "researcher",
  reviewer: "reviewer",
  validator: "validator",
} as const;

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
  const rail = buildOfficeSidebarRailView({ residents, queuedTasks, handoffs });
  const focus = buildOfficeFocusStripView({
    selectedResident,
    selectedRoom,
    roleLabels: ROLE_LABELS,
  });
  const focusModeLabel = selectedResident ? "agent focus" : selectedRoom ? "room focus" : "preview";

  return (
    <aside className={`${layoutStyles["office-panel"]} ${sidebarStyles["office-rail"]}`}>
      <section className={`${sidebarStyles["office-rail-section"]} ${sidebarStyles.agents}`}>
        <div className="section-head">
          <p className="panel-kicker">ACTIVE AGENTS</p>
          <span className={sidebarStyles["office-section-count"]}>{residents.length} online</span>
        </div>
        <div className={sidebarStyles["office-staff-list"]}>
          {rail.visibleResidents.length === 0 ? (
            <div className="empty-state compact">No residents online</div>
          ) : (
            rail.visibleResidents.map((resident) => {
              const isBlocked = queuedTasks.some(
                (t) => t.assignee === resident.agentId && t.state === "blocked"
              );
              return (
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
                        isBlocked
                          ? sidebarStyles["status-blocked"]
                          : sidebarStyles[`status-${resident.profile.role}`],
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{resident.agentId}</strong>
                      <div className="muted">
                        {resident.profile.archetype} / {resident.roomLabel}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${isBlocked ? "danger" : resident.status === "running" ? "info" : "neutral"}`}>
                    {resident.status}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {rail.hiddenResidentCount > 0 ? (
          <div className={sidebarStyles["office-overflow-chip"]}>+{rail.hiddenResidentCount} more agents off-rail</div>
        ) : null}
      </section>

      <section className={`${sidebarStyles["office-rail-section"]} ${sidebarStyles.queue}`}>
        <div className="section-head">
          <p className="panel-kicker">TASK QUEUE</p>
          <span className={sidebarStyles["office-section-count"]}>{queuedTasks.length} surfaced</span>
        </div>
        <div className={sidebarStyles["office-data-list"]}>
          {rail.visibleTasks.length === 0 ? (
            <div className="empty-state compact">No queued tasks in the current view</div>
          ) : (
            rail.visibleTasks.map((task) => {
              const tone = getTaskTone(task.state);
              return (
                <div
                  key={task.taskId}
                  className={[
                    sidebarStyles["office-data-row"],
                    sidebarStyles["office-task-row"],
                    sidebarStyles[tone],
                  ].join(" ")}
                >
                  <div className={sidebarStyles["office-task-main"]}>
                    <strong>{task.taskId}</strong>
                    <div className="muted">
                      {(task.assignee ?? "unassigned")} / {task.state}
                    </div>
                  </div>
                  <span className={`badge state ${tone}`}>{task.state}</span>
                </div>
              );
            })
          )}
        </div>
        {rail.hiddenTaskCount > 0 ? (
          <div className={sidebarStyles["office-overflow-chip"]}>+{rail.hiddenTaskCount} more queued tasks</div>
        ) : null}
      </section>

      <section className={`${sidebarStyles["office-rail-section"]} ${sidebarStyles.handoffs}`}>
        <div className="section-head">
          <p className="panel-kicker">RECENT HANDOFFS</p>
          <span className={sidebarStyles["office-section-count"]}>
            {handoffs.length} live {handoffs.length === 1 ? "route" : "routes"}
          </span>
        </div>
        <div className={sidebarStyles["office-data-list"]}>
          {rail.visibleHandoffs.length === 0 ? (
            <div className="empty-state compact">No live handoff routes</div>
          ) : (
            rail.visibleHandoffs.map((handoff) => (
              <div key={handoff.id} className={sidebarStyles["office-data-row"]}>
                <div>
                  <strong>
                    {handoff.fromLabel} to {handoff.toLabel}
                  </strong>
                  <div className="muted">
                    {handoff.actorId}
                    {handoff.targetId ? ` to ${handoff.targetId}` : ""}
                    {` / ${handoff.timestamp.slice(11, 19)}`}
                  </div>
                </div>
                <div className={sidebarStyles["office-route-meta"]}>
                  <span className="chip info">{handoff.taskId}</span>
                </div>
              </div>
            ))
          )}
        </div>
        {rail.hiddenHandoffCount > 0 ? (
          <div className={sidebarStyles["office-overflow-chip"]}>+{rail.hiddenHandoffCount} more handoffs in backlog</div>
        ) : null}
      </section>

      <section className={sidebarStyles["office-focus-card"]}>
        <p className={sidebarStyles["office-focus-kicker"]}>{focus.eyebrow}</p>
        <div className={sidebarStyles["office-focus-head"]}>
          <strong>{focus.headline}</strong>
          <span className={sidebarStyles["office-focus-pill"]}>{focusModeLabel}</span>
        </div>
        <p className={sidebarStyles["office-focus-copy"]}>{focus.summary}</p>
        <p className={sidebarStyles["office-focus-detail"]}>{focus.detail}</p>
      </section>
    </aside>
  );
}

