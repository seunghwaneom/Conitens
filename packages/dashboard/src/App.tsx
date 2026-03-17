import React, { useState } from "react";
import { useEventStore } from "./store/event-store.js";
import { useWebSocket } from "./hooks/use-websocket.js";
import { KanbanBoard } from "./components/KanbanBoard.js";
import { Timeline } from "./components/Timeline.js";

type Tab = "overview" | "kanban" | "timeline";

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: active ? 600 : 400,
  color: active ? "#38bdf8" : "#94a3b8",
  borderBottom: active ? "2px solid #38bdf8" : "2px solid transparent",
  cursor: "pointer",
  background: "none",
  border: "none",
  borderBottomWidth: "2px",
  borderBottomStyle: "solid",
  borderBottomColor: active ? "#38bdf8" : "transparent",
});

export function App() {
  const { tasks, agents, events } = useEventStore();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Connect to WebSocket bus
  useWebSocket();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header style={{ padding: "12px 24px", background: "#1e293b", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: "16px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#38bdf8" }}>Conitens v2</h1>
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
          {agents.length} agents | {tasks.length} tasks | {events.length} events
        </span>
      </header>

      {/* Tab Navigation */}
      <nav style={{ display: "flex", gap: "4px", padding: "0 24px", background: "#1e293b", borderBottom: "1px solid #334155" }}>
        <button style={tabStyle(activeTab === "overview")} onClick={() => setActiveTab("overview")}>Overview</button>
        <button style={tabStyle(activeTab === "kanban")} onClick={() => setActiveTab("kanban")}>Kanban</button>
        <button style={tabStyle(activeTab === "timeline")} onClick={() => setActiveTab("timeline")}>Timeline</button>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "overview" && (
          <div style={{ display: "flex", height: "100%" }}>
            {/* Sidebar — Agent Status */}
            <aside style={{ width: "240px", padding: "16px", background: "#1e293b", borderRight: "1px solid #334155", overflowY: "auto" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#94a3b8" }}>Agents</h2>
              {agents.length === 0 && <p style={{ fontSize: "13px", color: "#64748b" }}>No agents</p>}
              {agents.map((agent) => (
                <div key={agent.agentId} style={{ padding: "8px", marginBottom: "4px", borderRadius: "6px", background: "#0f172a" }}>
                  <span style={{ color: agent.status === "running" ? "#22c55e" : agent.status === "error" ? "#ef4444" : "#94a3b8" }}>
                    {agent.status === "running" ? "●" : agent.status === "error" ? "!" : "○"}
                  </span>{" "}
                  <span style={{ fontSize: "13px" }}>{agent.agentId}</span>
                </div>
              ))}
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
              <section style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#94a3b8" }}>Tasks</h2>
                {tasks.length === 0 && <p style={{ fontSize: "13px", color: "#64748b" }}>No tasks</p>}
                {tasks.map((task) => (
                  <div key={task.taskId} style={{ padding: "8px 12px", marginBottom: "4px", borderRadius: "6px", background: "#1e293b", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px" }}>{task.taskId}</span>
                    <span style={{ fontSize: "12px", color: task.state === "done" ? "#22c55e" : task.state === "active" ? "#38bdf8" : "#94a3b8" }}>{task.state}</span>
                  </div>
                ))}
              </section>

              <section>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#94a3b8" }}>Event Log</h2>
                {events.slice(-20).map((event) => (
                  <div key={event.event_id} style={{ fontSize: "12px", color: "#64748b", padding: "2px 0", fontFamily: "monospace" }}>
                    [{event.ts.slice(11, 19)}] {event.type} — {event.actor.id}
                  </div>
                ))}
              </section>
            </main>
          </div>
        )}

        {activeTab === "kanban" && <KanbanBoard />}
        {activeTab === "timeline" && <Timeline />}
      </div>
    </div>
  );
}
