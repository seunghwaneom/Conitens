export interface ForwardRoute {
  screen: "runs" | "run-detail" | "office-preview";
  runId: string | null;
}

export function parseForwardRoute(hash: string): ForwardRoute {
  const cleaned = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (!cleaned || cleaned === "runs") {
    return { screen: "runs", runId: null };
  }
  if (cleaned === "office-preview") {
    return { screen: "office-preview", runId: null };
  }
  const match = cleaned.match(/^runs\/([^/]+)$/);
  if (!match) {
    return { screen: "runs", runId: null };
  }
  return { screen: "run-detail", runId: decodeURIComponent(match[1]) };
}

export function buildForwardRoute(route: ForwardRoute): string {
  if (route.screen === "office-preview") {
    return "#/office-preview";
  }
  if (route.screen === "run-detail" && route.runId) {
    return `#/runs/${encodeURIComponent(route.runId)}`;
  }
  return "#/runs";
}
