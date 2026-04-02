export const OFFICE_GRID_SIZE = 8;
export const OFFICE_AGENT_SPRITE_SIZE = 32;
export const OFFICE_MAX_VISIBLE_ROOM_TASKS = 2;
export const OFFICE_MAX_VISIBLE_ROOM_RESIDENTS = 4;

export type OfficeRoomPriority = "hero" | "support" | "quiet";
export type OfficeTaskNodeTone = "danger" | "warning" | "info" | "neutral";

const TASK_TONE_BY_STATE: Record<string, OfficeTaskNodeTone> = {
  blocked: "danger",
  error: "danger",
  failed: "danger",
  review: "warning",
  assigned: "warning",
  active: "info",
  running: "info",
  planned: "neutral",
  done: "neutral",
  draft: "neutral",
  cancelled: "neutral",
};

const TASK_PRIORITY_SCORE: Record<string, number> = {
  blocked: 0,
  review: 1,
  active: 2,
  assigned: 3,
  planned: 4,
  draft: 5,
  done: 6,
  cancelled: 7,
};

export function getOfficeTaskTone(state: string): OfficeTaskNodeTone {
  return TASK_TONE_BY_STATE[state] ?? "neutral";
}

export function compareOfficeTasks(leftState: string, rightState: string) {
  return (TASK_PRIORITY_SCORE[leftState] ?? 99) - (TASK_PRIORITY_SCORE[rightState] ?? 99);
}
