import type { ForwardBridgeConfig } from "./forward-bridge-types.ts";

export interface TaskFilterState {
  status: string;
  ownerAgentId: string;
  includeArchived: boolean;
}

export interface SavedTaskFilterPreset extends TaskFilterState {
  id: string;
  name: string;
}

const API_ROOT_KEY = "conitens.forward.apiRoot";
const TASK_FILTER_STATE_KEY = "conitens.forward.taskFilters.current";
const TASK_FILTER_PRESETS_KEY = "conitens.forward.taskFilters.presets";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readInitialBridgeConfig(): ForwardBridgeConfig {
  const params = new URLSearchParams(window.location.search);
  const apiRootFromQuery = params.get("api");
  if (params.has("token")) {
    params.delete("token");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }
  const storedApiRoot = window.localStorage.getItem(API_ROOT_KEY);
  return {
    apiRoot: apiRootFromQuery || storedApiRoot || "http://127.0.0.1:8785/api",
    token: "",
  };
}

export function persistBridgeConfig(config: ForwardBridgeConfig): void {
  window.localStorage.setItem(API_ROOT_KEY, config.apiRoot);
}

export function readInitialTaskFilterState(): TaskFilterState {
  const parsed = readJson<Partial<TaskFilterState>>(TASK_FILTER_STATE_KEY, {});
  return {
    status: typeof parsed.status === "string" && parsed.status ? parsed.status : "all",
    ownerAgentId: typeof parsed.ownerAgentId === "string" ? parsed.ownerAgentId : "",
    includeArchived: Boolean(parsed.includeArchived),
  };
}

export function persistTaskFilterState(state: TaskFilterState): void {
  window.localStorage.setItem(TASK_FILTER_STATE_KEY, JSON.stringify(state));
}

export function readSavedTaskFilterPresets(): SavedTaskFilterPreset[] {
  const parsed = readJson<unknown[]>(TASK_FILTER_PRESETS_KEY, []);
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : `preset-${Date.now().toString(36)}`,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Saved filter",
      status: typeof item.status === "string" && item.status ? item.status : "all",
      ownerAgentId: typeof item.ownerAgentId === "string" ? item.ownerAgentId : "",
      includeArchived: Boolean(item.includeArchived),
    }));
}

export function persistSavedTaskFilterPresets(presets: SavedTaskFilterPreset[]): void {
  window.localStorage.setItem(TASK_FILTER_PRESETS_KEY, JSON.stringify(presets));
}
