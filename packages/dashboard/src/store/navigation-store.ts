import { create } from "zustand";

export interface NavigationStoreState {
  route: string;
  detailTab: string;

  // Actions
  setRoute: (route: string) => void;
  setDetailTab: (tab: string) => void;
}

/**
 * Shared navigation state.
 * SELECTOR PATTERN: All consumers MUST use `useNavigationStore(s => s.field)` form
 * to prevent cascade re-renders.
 */
export const useNavigationStore = create<NavigationStoreState>((set) => ({
  route: "office",
  detailTab: "state",

  setRoute: (route) => set({ route }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
