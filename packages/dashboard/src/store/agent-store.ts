import { create } from "zustand";

export interface AgentStoreState {
  selectedAgentId: string | null;
  agentView: "fleet" | "profile" | "graph" | "proposals" | "evolution";
  isDemo: boolean;

  // Actions
  selectAgent: (id: string | null) => void;
  setAgentView: (view: AgentStoreState["agentView"]) => void;
  setIsDemo: (demo: boolean) => void;
}

/**
 * Shared agent selection state.
 * SELECTOR PATTERN: All consumers MUST use `useAgentStore(s => s.field)` form
 * to prevent cascade re-renders.
 */
export const useAgentStore = create<AgentStoreState>((set) => ({
  selectedAgentId: null,
  agentView: "fleet",
  isDemo: true,

  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgentView: (view) => set({ agentView: view }),
  setIsDemo: (demo) => set({ isDemo: demo }),
}));
