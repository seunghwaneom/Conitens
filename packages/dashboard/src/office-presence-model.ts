import { getAgentOfficeProfile } from "./agent-profiles.ts";
import { getOfficeSnapshot, type OfficeHandoffSnapshot } from "./dashboard-model.ts";
import { OFFICE_STAGE_ROOMS, type OfficeStageRoomSchema } from "./office-stage-schema.ts";
import {
  compareOfficeTasks,
  getOfficeTaskTone,
  OFFICE_MAX_VISIBLE_ROOM_RESIDENTS,
  OFFICE_MAX_VISIBLE_ROOM_TASKS,
} from "./office-system.ts";
import type { AgentState, EventRecord, TaskState } from "./store/event-store.js";

export interface OfficeResidentPresence {
  agentId: string;
  status: AgentState["status"];
  taskCount: number;
  roleTaskCount: number;
  profile: ReturnType<typeof getAgentOfficeProfile>;
  roomId: string;
  roomLabel: string;
  teamId: OfficeStageRoomSchema["teamId"];
  teamLabel: string;
  roomKind: OfficeStageRoomSchema["kind"];
}

export interface OfficeRoomPresence {
  roomId: string;
  label: string;
  kind: OfficeStageRoomSchema["kind"];
  teamId: OfficeStageRoomSchema["teamId"];
  teamLabel: string;
  snapshot: ReturnType<typeof getOfficeSnapshot>["rooms"][number];
  schema: OfficeStageRoomSchema;
  residents: OfficeResidentPresence[];
  visibleResidents: OfficeResidentPresence[];
  taskNodes: OfficeTaskNode[];
  overflowCount: number;
}

export interface OfficeTaskNode {
  taskId: string;
  state: string;
  tone: ReturnType<typeof getOfficeTaskTone>;
  left: number;
  top: number;
}

export interface OfficePresenceModel {
  occupiedRooms: number;
  activeRooms: number;
  handoffCount: number;
  handoffs: OfficeHandoffSnapshot[];
  rooms: OfficeRoomPresence[];
  residents: OfficeResidentPresence[];
}

export function createOfficePresenceModel({
  agents,
  tasks,
  events,
}: {
  agents: AgentState[];
  tasks: TaskState[];
  events: EventRecord[];
}): OfficePresenceModel {
  const snapshot = getOfficeSnapshot({ agents, tasks, events });
  const roomSchemaMap = new Map(OFFICE_STAGE_ROOMS.map((room) => [room.roomId, room]));
  const tasksByRoom = tasks.reduce<Record<string, TaskState[]>>((acc, task) => {
    const roomId = getAgentOfficeProfile(task.assignee ?? "manager-default").homeRoomId;
    acc[roomId] ??= [];
    acc[roomId].push(task);
    return acc;
  }, {});

  const residents = [...agents]
    .map<OfficeResidentPresence>((agent) => {
      const profile = getAgentOfficeProfile(agent.agentId);
      const room = roomSchemaMap.get(profile.homeRoomId) ?? OFFICE_STAGE_ROOMS[0];
      return {
        agentId: agent.agentId,
        status: agent.status,
        taskCount: tasks.filter((task) => task.assignee === agent.agentId).length,
        roleTaskCount: tasks.filter(
          (task) => task.assignee === agent.agentId && ["blocked", "review", "active"].includes(task.state),
        ).length,
        profile,
        roomId: room.roomId,
        roomLabel: room.label,
        teamId: room.teamId,
        teamLabel: room.teamLabel,
        roomKind: room.kind,
      };
    })
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.agentId.localeCompare(right.agentId);
      }
      return left.status === "running" ? -1 : right.status === "running" ? 1 : 0;
    });

  const residentsByRoom = residents.reduce<Record<string, OfficeResidentPresence[]>>((acc, resident) => {
    acc[resident.roomId] ??= [];
    acc[resident.roomId].push(resident);
    return acc;
  }, {});

  const rooms = OFFICE_STAGE_ROOMS.map<OfficeRoomPresence>((schema) => {
    const snapshotRoom = snapshot.rooms.find((room) => room.roomId === schema.roomId);
    const roomResidents = residentsByRoom[schema.roomId] ?? [];
    return {
      roomId: schema.roomId,
      label: schema.label,
      kind: schema.kind,
      teamId: schema.teamId,
      teamLabel: schema.teamLabel,
      schema,
      snapshot:
        snapshotRoom ?? {
          roomId: schema.roomId,
          label: schema.label,
          kind: schema.kind,
          teamId: schema.teamId,
          teamLabel: schema.teamLabel,
          agentCount: 0,
          runningCount: 0,
          taskCount: 0,
          signalCount: 0,
          latestFamily: null,
          residents: [],
          tone: "neutral",
        },
      residents: roomResidents,
      visibleResidents: roomResidents.slice(
        0,
        Math.min(schema.slots.length, OFFICE_MAX_VISIBLE_ROOM_RESIDENTS),
      ),
      taskNodes: (tasksByRoom[schema.roomId] ?? [])
        .slice()
        .sort((left, right) => compareOfficeTasks(left.state, right.state))
        .slice(0, OFFICE_MAX_VISIBLE_ROOM_TASKS)
        .map((task, index) => ({
          taskId: task.taskId,
          state: task.state,
          tone: getOfficeTaskTone(task.state),
          left: schema.taskAnchors[index]?.left ?? schema.overflowSlot.left,
          top: schema.taskAnchors[index]?.top ?? schema.overflowSlot.top,
        })),
      overflowCount: Math.max(
        0,
        roomResidents.length - Math.min(schema.slots.length, OFFICE_MAX_VISIBLE_ROOM_RESIDENTS),
      ),
    };
  });

  return {
    occupiedRooms: snapshot.occupiedRooms,
    activeRooms: snapshot.activeRooms,
    handoffCount: snapshot.handoffCount,
    handoffs: snapshot.handoffs,
    rooms,
    residents,
  };
}

export function resolveOfficeSelection({
  rooms,
  selectedRoomId,
  selectedResidentId,
}: {
  rooms: OfficeRoomPresence[];
  selectedRoomId?: string | null;
  selectedResidentId?: string | null;
}) {
  const roomMap = new Map(rooms.map((room) => [room.roomId, room]));
  const residentMap = new Map(
    rooms.flatMap((room) => room.residents.map((resident) => [resident.agentId, resident] as const)),
  );

  let nextRoomId: string | null =
    selectedRoomId && roomMap.has(selectedRoomId) ? selectedRoomId : rooms[0]?.roomId ?? null;
  let nextResidentId: string | null =
    selectedResidentId && residentMap.has(selectedResidentId) ? selectedResidentId : null;

  if (nextResidentId) {
    nextRoomId = residentMap.get(nextResidentId)?.roomId ?? nextRoomId;
  }

  if (!nextResidentId && nextRoomId) {
    nextResidentId = roomMap.get(nextRoomId)?.visibleResidents[0]?.agentId ?? null;
  }

  if (!nextRoomId && nextResidentId) {
    nextRoomId = residentMap.get(nextResidentId)?.roomId ?? null;
  }

  return {
    selectedRoomId: nextRoomId,
    selectedResidentId: nextResidentId,
  };
}
