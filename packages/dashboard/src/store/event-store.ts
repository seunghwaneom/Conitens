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

      // Update tasks from task events (immutable: replace matched entry, never mutate in place)
      let tasks = state.tasks;
      if (event.type.startsWith("task.")) {
        const taskId = event.task_id ?? (event.payload.task_id as string);
        if (taskId) {
          const existing = tasks.find((t) => t.taskId === taskId);
          const patchTask = (patch: Partial<TaskState>): TaskState[] =>
            tasks.map((t) => (t.taskId === taskId ? { ...t, ...patch } : t));
          if (event.type === "task.created") {
            if (!existing) tasks = [...tasks, { taskId, state: "draft" }];
          } else if (event.type === "task.assigned" && existing) {
            tasks = patchTask({ assignee: event.payload.assignee as string, state: "assigned" });
          } else if (event.type === "task.status_changed" && existing) {
            tasks = patchTask({ state: event.payload.to as string });
          } else if (event.type === "task.completed" && existing) {
            tasks = patchTask({ state: "done" });
          }
        }
      }

      // Update agents from agent events (immutable: replace matched entry, never mutate in place)
      let agents = state.agents;
      if (event.type.startsWith("agent.")) {
        const agentId = event.actor.id;
        const existing = agents.find((a) => a.agentId === agentId);
        const patchAgent = (status: AgentState["status"]): AgentState[] =>
          agents.map((a) => (a.agentId === agentId ? { ...a, status } : a));
        if (event.type === "agent.spawned") {
          if (!existing) agents = [...agents, { agentId, status: "running" }];
          else agents = patchAgent("running");
        } else if (event.type === "agent.terminated" && existing) {
          agents = patchAgent("terminated");
        } else if (event.type === "agent.error" && existing) {
          agents = patchAgent("error");
        }
      }

      return { events, tasks, agents };
    }),

  setTasks: (tasks) => set({ tasks }),
  setAgents: (agents) => set({ agents }),
}));
