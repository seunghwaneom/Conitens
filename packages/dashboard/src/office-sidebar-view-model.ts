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
  headline: string;
  summary: string;
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
      headline: selectedResident.agentId,
      summary: [
        selectedResident.roomLabel,
        roleLabels[selectedResident.profile.role] ?? selectedResident.profile.role,
        selectedResident.status,
        `${selectedResident.taskCount} active`,
      ].join(" · "),
    };
  }

  if (selectedRoom) {
    return {
      headline: selectedRoom.label,
      summary: [
        selectedRoom.teamLabel,
        `${selectedRoom.snapshot.agentCount} residents`,
        `${selectedRoom.snapshot.taskCount} tasks`,
        selectedRoom.snapshot.latestFamily ?? "stable",
      ].join(" · "),
    };
  }

  return {
    headline: "No focus selected",
    summary: "Select a room or resident to focus the rail.",
  };
}
