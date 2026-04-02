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

interface SeedDemoData {
  tasks?: TaskState[];
  agents?: AgentState[];
  events?: EventRecord[];
}

interface EventStoreState {
  events: EventRecord[];
  tasks: TaskState[];
  agents: AgentState[];
  addEvent: (event: EventRecord) => void;
  setTasks: (tasks: TaskState[]) => void;
  setAgents: (agents: AgentState[]) => void;
  seedDemo: (data: SeedDemoData) => void;
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
          const exists = tasks.some((t) => t.taskId === taskId);
          if (event.type === "task.created") {
            if (!exists) {
              tasks = [...tasks, { taskId, state: "draft" }];
            }
          } else if (event.type === "task.assigned") {
            tasks = tasks.map((t) =>
              t.taskId === taskId
                ? { ...t, assignee: event.payload.assignee as string, state: "assigned" }
                : t
            );
          } else if (event.type === "task.status_changed") {
            tasks = tasks.map((t) =>
              t.taskId === taskId
                ? { ...t, state: event.payload.to as string }
                : t
            );
          } else if (event.type === "task.completed") {
            tasks = tasks.map((t) =>
              t.taskId === taskId ? { ...t, state: "done" } : t
            );
          }
        }
      }

      // Update agents from agent events
      let agents = state.agents;
      if (event.type.startsWith("agent.")) {
        const agentId = event.actor.id;
        const exists = agents.some((a) => a.agentId === agentId);
        if (event.type === "agent.spawned") {
          if (!exists) {
            agents = [...agents, { agentId, status: "running" }];
          } else {
            agents = agents.map((a) =>
              a.agentId === agentId ? { ...a, status: "running" } : a
            );
          }
        } else if (event.type === "agent.terminated") {
          agents = agents.map((a) =>
            a.agentId === agentId ? { ...a, status: "terminated" } : a
          );
        } else if (event.type === "agent.error") {
          agents = agents.map((a) =>
            a.agentId === agentId ? { ...a, status: "error" } : a
          );
        }
      }

      return { events, tasks, agents };
    }),

  setTasks: (tasks) => set({ tasks }),
  setAgents: (agents) => set({ agents }),

  seedDemo: (data) =>
    set((state) => ({
      tasks: data.tasks ?? state.tasks,
      agents: data.agents ?? state.agents,
      events: data.events ?? state.events,
    })),
}));
