import { useUiStore } from "../store/ui-store.js";
import { useDashboardStore } from "../store/dashboard-store.js";
import { ThreadBrowser } from "../components/ThreadBrowser.js";
import { ThreadDetail } from "../components/ThreadDetail.js";

export function ThreadsScreen() {
  const route = useUiStore((s) => s.route);
  const config = useDashboardStore((s) => s.config);

  if (route.threadId) {
    return (
      <ThreadDetail
        apiBase={config.apiRoot}
        threadId={route.threadId}
        token={config.token}
      />
    );
  }

  return (
    <ThreadBrowser apiBase={config.apiRoot} token={config.token} />
  );
}
