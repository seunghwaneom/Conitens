import { useDashboardStore } from "../store/dashboard-store.js";
import { ApprovalCenter } from "../components/ApprovalCenter.js";

export function ApprovalsScreen() {
  const config = useDashboardStore((s) => s.config);

  return (
    <ApprovalCenter apiBase={config.apiRoot} token={config.token} />
  );
}
