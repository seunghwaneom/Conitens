import { create } from "zustand";
import {
  forwardGet,
  parseRunsResponse,
  parseRunDetailResponse,
  type ForwardBridgeConfig,
  type ForwardRunSummary,
  type ForwardRunDetailResponse,
} from "../forward-bridge.js";

type LoadState = "idle" | "loading" | "ready" | "error";
type ActiveTab = "operations" | "intelligence" | "data";

interface RunsStoreState {
  // ── Run list ─────────────────────────────────────────────────────────
  runs: ForwardRunSummary[];
  listState: LoadState;

  // ── Run detail ────────────────────────────────────────────────────────
  selectedRunId: string | null;
  runDetail: ForwardRunDetailResponse | null;
  detailState: LoadState;

  // ── Shared error ──────────────────────────────────────────────────────
  error: string | null;

  // ── UI ────────────────────────────────────────────────────────────────
  activeTab: ActiveTab;

  // ── Actions ───────────────────────────────────────────────────────────
  setSelectedRunId: (id: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  fetchRuns: (
    config: ForwardBridgeConfig,
    filters?: Record<string, string>,
  ) => Promise<void>;
  fetchRunDetail: (config: ForwardBridgeConfig, runId: string) => Promise<void>;
  clearError: () => void;
}

export const useRunsStore = create<RunsStoreState>((set) => ({
  // ── Run list ───────────────────────────────────────────────────────────
  runs: [],
  listState: "idle",

  // ── Run detail ─────────────────────────────────────────────────────────
  selectedRunId: null,
  runDetail: null,
  detailState: "idle",

  // ── Shared error ───────────────────────────────────────────────────────
  error: null,

  // ── UI ─────────────────────────────────────────────────────────────────
  activeTab: "operations",

  // ── Actions ────────────────────────────────────────────────────────────
  setSelectedRunId: (id) => set({ selectedRunId: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  fetchRuns: async (config, filters) => {
    set({ listState: "loading", error: null });
    try {
      const suffix =
        filters && Object.keys(filters).length > 0
          ? `?${new URLSearchParams(filters).toString()}`
          : "";
      const payload = await forwardGet(
        config,
        `/runs${suffix}`,
        parseRunsResponse,
      );
      set({ runs: payload.runs, listState: "ready" });
    } catch (err: unknown) {
      set({
        listState: "error",
        error: err instanceof Error ? err.message : "Failed to fetch runs",
      });
    }
  },

  fetchRunDetail: async (config, runId) => {
    set({ detailState: "loading", error: null });
    try {
      const payload = await forwardGet(
        config,
        `/runs/${encodeURIComponent(runId)}`,
        parseRunDetailResponse,
      );
      set({ runDetail: payload, detailState: "ready" });
    } catch (err: unknown) {
      set({
        detailState: "error",
        error:
          err instanceof Error ? err.message : "Failed to fetch run detail",
      });
    }
  },

  clearError: () => set({ error: null }),
}));
