import React, { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import { demoAgents, demoEvents, demoTasks } from "./demo-data.js";
import { ApprovalGate } from "./components/ApprovalGate.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { KanbanBoard } from "./components/KanbanBoard.js";
import { OverviewDashboard } from "./components/OverviewDashboard.js";
import { PixelOffice } from "./components/PixelOffice.js";
import { TaskDetailModal } from "./components/TaskDetailModal.js";
import { Timeline } from "./components/Timeline.js";
import {
  DASHBOARD_PANEL_COPY,
  DASHBOARD_TAB_HOTKEYS,
  DASHBOARD_TABS,
  type DashboardPanelTab,
  deriveDashboardMetrics,
  getConnectionPresentation,
  getQueuedTasks,
  getRecentEvents,
  getTabBadges,
  resolveDashboardData,
} from "./dashboard-model.js";
import { useWebSocket } from "./hooks/use-websocket.js";
import { useEventStore } from "./store/event-store.js";

type Tab = (typeof DASHBOARD_TABS)[number];

const APP_KEY_LEGEND = [
  { key: DASHBOARD_TAB_HOTKEYS.overview, label: "Overview" },
  { key: DASHBOARD_TAB_HOTKEYS.kanban, label: "Board" },
  { key: DASHBOARD_TAB_HOTKEYS.timeline, label: "Timeline" },
  { key: DASHBOARD_TAB_HOTKEYS.office, label: "Office" },
  { key: "Esc", label: "Close task" },
];

export function App() {
  const liveTasks = useEventStore((state) => state.tasks);
  const liveAgents = useEventStore((state) => state.agents);
  const liveEvents = useEventStore((state) => state.events);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const connection = useWebSocket();

  const { tasks, agents, events, isDemo } = useMemo(
    () =>
      resolveDashboardData(
        {
          tasks: liveTasks,
          agents: liveAgents,
          events: liveEvents,
        },
        {
          tasks: demoTasks,
          agents: demoAgents,
          events: demoEvents,
        },
      ),
    [liveAgents, liveEvents, liveTasks],
  );

  const metrics = useMemo(
    () => deriveDashboardMetrics(agents, tasks, events),
    [agents, tasks, events],
  );

  const selectedTask = selectedTaskId ? tasks.find((t) => t.taskId === selectedTaskId) : null;

  const recentEvents = useMemo(() => getRecentEvents(events), [events]);
  const queuedTasks = useMemo(() => getQueuedTasks(tasks), [tasks]);
  const tabBadges = useMemo(() => getTabBadges(tasks, events), [events, tasks]);
  const connectionPresentation = useMemo(
    () => getConnectionPresentation(isDemo, connection.status),
    [connection.status, isDemo],
  );

  const openTab = (tab: Tab) => {
    startTransition(() => setActiveTab(tab));
  };

  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const tagName = (event.target as HTMLElement | null)?.tagName ?? "";
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
      return;
    }

    switch (event.key) {
      case DASHBOARD_TAB_HOTKEYS.overview:
        openTab("overview");
        break;
      case DASHBOARD_TAB_HOTKEYS.kanban:
        openTab("kanban");
        break;
      case DASHBOARD_TAB_HOTKEYS.timeline:
        openTab("timeline");
        break;
      case DASHBOARD_TAB_HOTKEYS.office:
        openTab("office");
        break;
      case "Escape":
        setSelectedTaskId(null);
        break;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const activePanelTab = activeTab === "overview" ? null : (activeTab as DashboardPanelTab);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark">&gt;</span>
          <span>Conitens // control_plane</span>
        </div>
        <div className="app-header-meta">
          <span className={`badge ${connectionPresentation.tone}`}>
            {connectionPresentation.label}
          </span>
          <span className="header-stats">
            {agents.length} agents | {tasks.length} tasks | {events.length} events
          </span>
        </div>
      </header>

      <nav className="app-nav">
        <div className="app-nav-tabs">
          {DASHBOARD_TABS.map((tab) => {
            const badge = tabBadges[tab];
            return (
              <button
                key={tab}
                className={`app-nav-button${activeTab === tab ? " active" : ""}`}
                onClick={() => openTab(tab)}
                title={`Hotkey ${DASHBOARD_TAB_HOTKEYS[tab]}`}
              >
                {tab.toUpperCase()}
                {badge != null && badge > 0 && <span className="tab-badge">{badge}</span>}
              </button>
            );
          })}
        </div>
        <div className="app-nav-legend" aria-label="Keyboard shortcuts">
          {APP_KEY_LEGEND.map((item) => (
            <span key={item.key} className="app-key-item">
              <span className="app-key">{item.key}</span>
              <span className="app-key-label">{item.label}</span>
            </span>
          ))}
        </div>
      </nav>

      <div className="app-content">
        <ErrorBoundary>
          {activePanelTab ? (
            <DashboardTabPanel
              title={DASHBOARD_PANEL_COPY[activePanelTab].title}
              subtitle={DASHBOARD_PANEL_COPY[activePanelTab].subtitle}
              hideHeader={activePanelTab === "office"}
              className={activePanelTab === "office" ? "office-tab-shell" : undefined}
              panelClassName={activePanelTab === "office" ? "office-tab-panel" : undefined}
            >
              {activePanelTab === "kanban" ? (
                <KanbanBoard tasks={tasks} onSelectTask={setSelectedTaskId} />
              ) : activePanelTab === "timeline" ? (
                <Timeline events={events} />
              ) : (
                <PixelOffice agents={agents} tasks={tasks} events={events} />
              )}
            </DashboardTabPanel>
          ) : (
            <OverviewDashboard
              tasks={tasks}
              queuedTasks={queuedTasks}
              agents={agents}
              recentEvents={recentEvents}
              metrics={metrics}
              connectionStatus={connection.status}
              isDemo={isDemo}
              onOpenBoard={() => openTab("kanban")}
              onOpenTimeline={() => openTab("timeline")}
            />
          )}

          <ApprovalGate events={events} />

          {selectedTask && (
            <TaskDetailModal
              task={selectedTask}
              events={events}
              onClose={() => setSelectedTaskId(null)}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

function DashboardTabPanel({
  title,
  subtitle,
  children,
  hideHeader = false,
  className,
  panelClassName,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  hideHeader?: boolean;
  className?: string;
  panelClassName?: string;
}) {
  return (
    <div className={className ? `tab-shell ${className}` : "tab-shell"}>
      <section className={panelClassName ? `tab-panel ${panelClassName}` : "tab-panel"}>
        {!hideHeader && (
          <div className="tab-panel-header">
            <h2 className="tab-panel-title">{title}</h2>
            <p className="tab-panel-subtitle">{subtitle}</p>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
