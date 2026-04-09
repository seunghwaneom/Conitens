import React from "react";
import { useUiStore } from "../store/ui-store.js";
import { useDashboardStore } from "../store/dashboard-store.js";

const ThreadsScreen = React.lazy(() =>
  import("./ThreadsScreen.js").then((m) => ({
    default: m.ThreadsScreen,
  })),
);
const AgentDetailScreen = React.lazy(() =>
  import("./AgentDetailScreen.js").then((m) => ({
    default: m.AgentDetailScreen,
  })),
);
const ApprovalsScreen = React.lazy(() =>
  import("./ApprovalsScreen.js").then((m) => ({
    default: m.ApprovalsScreen,
  })),
);
const BackgroundCLIPanel = React.lazy(() =>
  import("../components/BackgroundCLIPanel.js").then((m) => ({
    default: m.BackgroundCLIPanel,
  })),
);
const TokenBudgetPanel = React.lazy(() =>
  import("../components/TokenBudgetPanel.js").then((m) => ({
    default: m.TokenBudgetPanel,
  })),
);
const WeeklyReportPanel = React.lazy(() =>
  import("../components/WeeklyReportPanel.js").then((m) => ({
    default: m.WeeklyReportPanel,
  })),
);

const AgentsScreen = React.lazy(() =>
  import("./AgentsScreen.js").then((m) => ({ default: m.AgentsScreen })),
);
const TasksScreen = React.lazy(() =>
  import("./TasksScreen.js").then((m) => ({ default: m.TasksScreen })),
);
const WorkspacesScreen = React.lazy(() =>
  import("./WorkspacesScreen.js").then((m) => ({ default: m.WorkspacesScreen })),
);
const ForwardDashboardScreen = React.lazy(() =>
  import("./ForwardDashboardScreen.js").then((m) => ({
    default: m.ForwardDashboardScreen,
  })),
);
const RunDetailScreen = React.lazy(() =>
  import("./RunDetailScreen.js").then((m) => ({
    default: m.RunDetailScreen,
  })),
);
const OfficeScreen = React.lazy(() =>
  import("./OfficeScreen.js").then((m) => ({
    default: m.OfficeScreen,
  })),
);

const SUSPENSE_FALLBACK = (
  <p className="forward-empty">Loading...</p>
);

export function AppRouter() {
  const route = useUiStore((s) => s.route);
  const config = useDashboardStore((s) => s.config);

  if (route.screen === "office-preview") {
    return (
      <main className="forward-main forward-main-preview">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <OfficeScreen />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "run-detail" && route.runId) {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <RunDetailScreen />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "agent-detail" && route.agentId) {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <AgentDetailScreen />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "threads" || (route.screen === "thread-detail" && route.threadId)) {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <ThreadsScreen />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "approvals") {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <ApprovalsScreen />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "bg-cli") {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <BackgroundCLIPanel apiBase={config.apiRoot} token={config.token} />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "tokens") {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <TokenBudgetPanel apiBase={config.apiRoot} token={config.token} />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "weekly-report") {
    return (
      <main className="forward-main">
        <React.Suspense fallback={SUSPENSE_FALLBACK}>
          <WeeklyReportPanel apiBase={config.apiRoot} token={config.token} />
        </React.Suspense>
      </main>
    );
  }

  if (route.screen === "agents") {
    return (
      <React.Suspense fallback={SUSPENSE_FALLBACK}>
        <AgentsScreen />
      </React.Suspense>
    );
  }

  if (route.screen === "tasks" || route.screen === "task-detail") {
    return (
      <React.Suspense fallback={SUSPENSE_FALLBACK}>
        <TasksScreen />
      </React.Suspense>
    );
  }

  if (route.screen === "workspaces" || route.screen === "workspace-detail") {
    return (
      <React.Suspense fallback={SUSPENSE_FALLBACK}>
        <WorkspacesScreen />
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={SUSPENSE_FALLBACK}>
      <ForwardDashboardScreen />
    </React.Suspense>
  );
}
