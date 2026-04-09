import { create } from "zustand";

export interface TaskState {
  taskId: string;
  state: string;
  assignee?: string;
}

export interface AgentState {
  agentId: string;
  status: "running" | "idle" | "error" | "terminated";
}

export interface EventRecord {
  event_id: string;
  type: string;
  ts: string;
  actor: { kind: string; id: string };
  task_id?: string;
  payload: Record<string, unknown>;
}

interface EventStoreState {
  events: EventRecord[];
  tasks: TaskState[];
  agents: AgentState[];
  addEvent: (event: EventRecord) => void;
  setTasks: (tasks: TaskState[]) => void;
  setAgents: (agents: AgentState[]) => void;
}

export const useEventStore = create<EventStoreState>((set) => ({
  events: [],
  tasks: [],
  agents: [],

  addEvent: (event) =>
    set((state) => {
      const events = [...state.events, event].slice(-200); // Keep last 200

      // Update tasks from task events
      let tasks = state.tasks;
      if (event.type.startsWith("task.")) {
        const taskId = event.task_id ?? (event.payload.task_id as string);
        if (taskId) {
          if (event.type === "task.created") {
            if (!state.tasks.some((t) => t.taskId === taskId)) {
              tasks = [...state.tasks, { taskId, state: "draft" }];
            }
          } else {
            tasks = state.tasks.map((t) => {
              if (t.taskId !== taskId) return t;
              if (event.type === "task.assigned") {
                return { ...t, assignee: event.payload.assignee as string, state: "assigned" };
              }
              if (event.type === "task.status_changed") {
                return { ...t, state: event.payload.to as string };
              }
              if (event.type === "task.completed") {
                return { ...t, state: "done" };
              }
              return t;
            });
          }
        }
      }

      // Update agents from agent events
      let agents = state.agents;
      if (event.type.startsWith("agent.")) {
        const agentId = event.actor.id;
        if (event.type === "agent.spawned") {
          if (!state.agents.some((a) => a.agentId === agentId)) {
            agents = [...state.agents, { agentId, status: "running" }];
          } else {
            agents = state.agents.map((a) =>
              a.agentId === agentId ? { ...a, status: "running" as const } : a
            );
          }
        } else if (event.type === "agent.terminated") {
          agents = state.agents.map((a) =>
            a.agentId === agentId ? { ...a, status: "terminated" as const } : a
          );
        } else if (event.type === "agent.error") {
          agents = state.agents.map((a) =>
            a.agentId === agentId ? { ...a, status: "error" as const } : a
          );
        }
      }

      return { events, tasks, agents };
    }),

  setTasks: (tasks) => set({ tasks }),
  setAgents: (agents) => set({ agents }),
}));
