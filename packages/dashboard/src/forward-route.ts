export interface ForwardRoute {
  screen:
    | "overview" | "inbox"
    | "tasks" | "task-detail"
    | "workspaces" | "workspace-detail"
    | "runs" | "run-detail"
    | "office-preview"
    | "threads" | "thread-detail"
    | "agents" | "agent-detail"
    | "approvals"
    | "bg-cli" | "tokens" | "weekly-report";
  runId: string | null;
  taskId: string | null;
  workspaceId?: string | null;
  threadId: string | null;
  agentId: string | null;
}

const NULL_IDS = { runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null } as const;

export function parseForwardRoute(hash: string): ForwardRoute {
  const cleaned = hash.replace(/^#/, "").replace(/^\/+/, "");
  const [path, query = ""] = cleaned.split("?");
  const params = new URLSearchParams(query);

  if (!path || path === "overview") {
    return { screen: "overview", ...NULL_IDS };
  }
  if (path === "inbox") return { screen: "inbox", ...NULL_IDS };
  if (path === "tasks") return { screen: "tasks", ...NULL_IDS };
  if (path === "workspaces") return { screen: "workspaces", ...NULL_IDS };
  if (path === "runs") {
    return { screen: "runs", ...NULL_IDS, runId: params.get("selected") };
  }
  if (path === "office-preview") return { screen: "office-preview", ...NULL_IDS };
  if (path === "threads") return { screen: "threads", ...NULL_IDS };
  if (path === "agents") return { screen: "agents", ...NULL_IDS };
  if (path === "approvals") return { screen: "approvals", ...NULL_IDS };
  if (path === "bg-cli") return { screen: "bg-cli", ...NULL_IDS };
  if (path === "tokens") return { screen: "tokens", ...NULL_IDS };
  if (path === "weekly-report") return { screen: "weekly-report", ...NULL_IDS };

  const taskMatch = path.match(/^tasks\/([^/]+)$/);
  if (taskMatch) {
    return { screen: "task-detail", ...NULL_IDS, taskId: decodeURIComponent(taskMatch[1]) };
  }
  const workspaceMatch = path.match(/^workspaces\/([^/]+)$/);
  if (workspaceMatch) {
    return { screen: "workspace-detail", ...NULL_IDS, workspaceId: decodeURIComponent(workspaceMatch[1]) };
  }
  const threadMatch = path.match(/^threads\/([^/]+)$/);
  if (threadMatch) {
    return { screen: "thread-detail", ...NULL_IDS, threadId: decodeURIComponent(threadMatch[1]) };
  }
  const agentMatch = path.match(/^agents\/([^/]+)$/);
  if (agentMatch) {
    return { screen: "agent-detail", ...NULL_IDS, agentId: decodeURIComponent(agentMatch[1]) };
  }
  const runMatch = path.match(/^runs\/([^/]+)$/);
  if (runMatch) {
    return { screen: "run-detail", ...NULL_IDS, runId: decodeURIComponent(runMatch[1]) };
  }
  return { screen: "overview", ...NULL_IDS };
}

export function buildForwardRoute(route: ForwardRoute): string {
  if (route.screen === "overview") return "#/overview";
  if (route.screen === "inbox") return "#/inbox";
  if (route.screen === "tasks") return "#/tasks";
  if (route.screen === "task-detail" && route.taskId) {
    return `#/tasks/${encodeURIComponent(route.taskId)}`;
  }
  if (route.screen === "workspaces") return "#/workspaces";
  if (route.screen === "workspace-detail" && route.workspaceId) {
    return `#/workspaces/${encodeURIComponent(route.workspaceId)}`;
  }
  if (route.screen === "office-preview") return "#/office-preview";
  if (route.screen === "threads") return "#/threads";
  if (route.screen === "thread-detail" && route.threadId) {
    return `#/threads/${encodeURIComponent(route.threadId)}`;
  }
  if (route.screen === "agents") return "#/agents";
  if (route.screen === "agent-detail" && route.agentId) {
    return `#/agents/${encodeURIComponent(route.agentId)}`;
  }
  if (route.screen === "approvals") return "#/approvals";
  if (route.screen === "runs") {
    return route.runId
      ? `#/runs?selected=${encodeURIComponent(route.runId)}`
      : "#/runs";
  }
  if (route.screen === "bg-cli") return "#/bg-cli";
  if (route.screen === "tokens") return "#/tokens";
  if (route.screen === "weekly-report") return "#/weekly-report";
  if (route.screen === "run-detail" && route.runId) {
    return `#/runs/${encodeURIComponent(route.runId)}`;
  }
  return "#/overview";
}
