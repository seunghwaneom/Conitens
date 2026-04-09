import { create } from "zustand";
import {
  readInitialBridgeConfig,
  persistBridgeConfig,
  type ForwardBridgeConfig,
} from "../forward-bridge.js";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface DashboardStoreState {
  config: ForwardBridgeConfig;
  draftConfig: ForwardBridgeConfig;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  liveRevision: number;

  setDraftConfig: (updater: ForwardBridgeConfig | ((prev: ForwardBridgeConfig) => ForwardBridgeConfig)) => void;
  connect: (draft: ForwardBridgeConfig) => void;
  bumpRevision: () => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

export const useDashboardStore = create<DashboardStoreState>((set, get) => {
  const initial = readInitialBridgeConfig();

  return {
    config: initial,
    draftConfig: { ...initial },
    connectionStatus: initial.token.trim() ? "connected" : "disconnected",
    connectionError: null,
    liveRevision: 0,

    setDraftConfig: (updater) => {
      set((state) => ({
        draftConfig:
          typeof updater === "function" ? updater(state.draftConfig) : updater,
      }));
    },

    connect: (draft) => {
      const cleaned: ForwardBridgeConfig = {
        apiRoot: draft.apiRoot.trim().replace(/\/+$/, ""),
        token: draft.token.trim(),
      };
      persistBridgeConfig(cleaned);
      set({
        config: cleaned,
        draftConfig: { ...cleaned },
        connectionStatus: cleaned.token ? "connected" : "disconnected",
        connectionError: null,
        liveRevision: get().liveRevision + 1,
      });
    },

    bumpRevision: () => {
      set((state) => ({ liveRevision: state.liveRevision + 1 }));
    },

    setConnectionStatus: (status, error = null) => {
      set({ connectionStatus: status, connectionError: error });
    },
  };
});
