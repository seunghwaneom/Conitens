import type { OfficeHandoffSnapshot } from "./dashboard-model.js";
import type { OfficeResidentPresence, OfficeRoomPresence } from "./office-presence-model.js";
import type { TaskState } from "./store/event-store.js";

export const OFFICE_MAX_VISIBLE_RAIL_AGENTS = 4;
export const OFFICE_MAX_VISIBLE_RAIL_TASKS = 4;
export const OFFICE_MAX_VISIBLE_RAIL_HANDOFFS = 3;

export interface OfficeSidebarRailView {
  visibleResidents: OfficeResidentPresence[];
  visibleTasks: TaskState[];
  visibleHandoffs: OfficeHandoffSnapshot[];
  hiddenResidentCount: number;
  hiddenTaskCount: number;
  hiddenHandoffCount: number;
}

export interface OfficeFocusStripView {
  eyebrow: string;
  headline: string;
  summary: string;
  detail: string;
}

export function buildOfficeSidebarRailView({
  residents,
  queuedTasks,
  handoffs,
}: {
  residents: OfficeResidentPresence[];
  queuedTasks: TaskState[];
  handoffs: OfficeHandoffSnapshot[];
}): OfficeSidebarRailView {
  return {
    visibleResidents: residents.slice(0, OFFICE_MAX_VISIBLE_RAIL_AGENTS),
    visibleTasks: queuedTasks.slice(0, OFFICE_MAX_VISIBLE_RAIL_TASKS),
    visibleHandoffs: handoffs.slice(0, OFFICE_MAX_VISIBLE_RAIL_HANDOFFS),
    hiddenResidentCount: Math.max(0, residents.length - OFFICE_MAX_VISIBLE_RAIL_AGENTS),
    hiddenTaskCount: Math.max(0, queuedTasks.length - OFFICE_MAX_VISIBLE_RAIL_TASKS),
    hiddenHandoffCount: Math.max(0, handoffs.length - OFFICE_MAX_VISIBLE_RAIL_HANDOFFS),
  };
}

export function buildOfficeFocusStripView({
  selectedResident,
  selectedRoom,
  roleLabels,
}: {
  selectedResident: OfficeResidentPresence | null;
  selectedRoom: OfficeRoomPresence | null;
  roleLabels: Record<string, string>;
}): OfficeFocusStripView {
  if (selectedResident) {
    return {
      eyebrow: selectedResident.roomLabel,
      headline: selectedResident.agentId,
      summary: [
        roleLabels[selectedResident.profile.role] ?? selectedResident.profile.role,
        selectedResident.status,
        `${selectedResident.taskCount} active`,
      ].join(" · "),
      detail: `${selectedResident.profile.archetype} lane · stay on ${selectedResident.roomLabel}`,
    };
  }

  if (selectedRoom) {
    return {
      eyebrow: selectedRoom.teamLabel,
      headline: selectedRoom.label,
      summary: [
        `${selectedRoom.snapshot.agentCount} residents`,
        `${selectedRoom.snapshot.taskCount} tasks`,
        selectedRoom.snapshot.latestFamily ?? "stable",
      ].join(" · "),
      detail: selectedRoom.snapshot.runningCount > 0
        ? `${selectedRoom.snapshot.runningCount} live operator lanes in view`
        : "Quiet room held for the next handoff",
    };
  }

  return {
    eyebrow: "Preview focus",
    headline: "No focus selected",
    summary: "Select a room or resident to focus the rail.",
    detail: "The office shell keeps room cadence, task load, and handoff flow visible at a glance.",
  };
}
