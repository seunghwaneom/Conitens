export interface ForwardRoute {
  screen: "overview" | "inbox" | "tasks" | "task-detail" | "workspaces" | "workspace-detail" | "runs" | "run-detail" | "office-preview" | "agents";
  runId: string | null;
  taskId: string | null;
  workspaceId?: string | null;
}

export function parseForwardRoute(hash: string): ForwardRoute {
  const cleaned = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (!cleaned || cleaned === "overview") {
    return { screen: "overview", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "inbox") {
    return { screen: "inbox", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "tasks") {
    return { screen: "tasks", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "workspaces") {
    return { screen: "workspaces", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "runs") {
    return { screen: "runs", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "office-preview") {
    return { screen: "office-preview", runId: null, taskId: null, workspaceId: null };
  }
  if (cleaned === "agents") {
    return { screen: "agents", runId: null, taskId: null, workspaceId: null };
  }
  const taskMatch = cleaned.match(/^tasks\/([^/]+)$/);
  if (taskMatch) {
    return { screen: "task-detail", runId: null, taskId: decodeURIComponent(taskMatch[1]), workspaceId: null };
  }
  const workspaceMatch = cleaned.match(/^workspaces\/([^/]+)$/);
  if (workspaceMatch) {
    return { screen: "workspace-detail", runId: null, taskId: null, workspaceId: decodeURIComponent(workspaceMatch[1]) };
  }
  const match = cleaned.match(/^runs\/([^/]+)$/);
  if (!match) {
    return { screen: "runs", runId: null, taskId: null, workspaceId: null };
  }
  return { screen: "run-detail", runId: decodeURIComponent(match[1]), taskId: null, workspaceId: null };
}

export function buildForwardRoute(route: ForwardRoute): string {
  if (route.screen === "overview") {
    return "#/overview";
  }
  if (route.screen === "inbox") {
    return "#/inbox";
  }
  if (route.screen === "tasks") {
    return "#/tasks";
  }
  if (route.screen === "task-detail" && route.taskId) {
    return `#/tasks/${encodeURIComponent(route.taskId)}`;
  }
  if (route.screen === "workspaces") {
    return "#/workspaces";
  }
  if (route.screen === "workspace-detail" && route.workspaceId) {
    return `#/workspaces/${encodeURIComponent(route.workspaceId)}`;
  }
  if (route.screen === "office-preview") {
    return "#/office-preview";
  }
  if (route.screen === "agents") {
    return "#/agents";
  }
  if (route.screen === "run-detail" && route.runId) {
    return `#/runs/${encodeURIComponent(route.runId)}`;
  }
  return "#/runs";
}
