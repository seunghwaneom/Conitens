import { useUiStore } from "../store/ui-store.js";
import { useDashboardStore } from "../store/dashboard-store.js";
import { AgentDetail } from "../components/AgentDetail.js";

export function AgentDetailScreen() {
  const route = useUiStore((s) => s.route);
  const config = useDashboardStore((s) => s.config);

  if (!route.agentId) {
    return null;
  }

  return (
    <AgentDetail
      apiBase={config.apiRoot}
      agentId={route.agentId}
      token={config.token}
    />
  );
}
