import React, { useMemo } from "react";
import type { AgentState, EventRecord, TaskState } from "../store/event-store.js";

function formatUptime(ts: string | undefined): string {
  if (!ts) return "just now";

  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function PixelOffice({
  agents,
  tasks,
  events = [],
}: {
  agents: AgentState[];
  tasks: TaskState[];
  events?: EventRecord[];
}) {
  const runningAgents = agents.filter((agent) => agent.status === "running").length;
  const assignedTasks = tasks.filter((task) => Boolean(task.assignee)).length;

  const agentLastSeenMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      map.set(event.actor.id, event.ts);
    }
    return map;
  }, [events]);

  return (
    <div className="office-frame">
      <div className="office-summary">
        <div className="status-card">
          <span className="status-card-label">agents</span>
          <strong>{agents.length}</strong>
        </div>
        <div className="status-card">
          <span className="status-card-label">running</span>
          <strong>{runningAgents}</strong>
        </div>
        <div className="status-card">
          <span className="status-card-label">assigned tasks</span>
          <strong>{assignedTasks}</strong>
        </div>
      </div>

      <div className="office-map-grid">
        {agents.length === 0 ? (
          <div className="empty-state animated">No agents online. Waiting for heartbeats...</div>
        ) : (
          agents.map((agent) => {
            const activeTasks = tasks.filter((task) => task.assignee === agent.agentId).slice(0, 4);
            return (
              <div key={agent.agentId} className="office-agent-card">
                <div className="office-agent-head">
                  <div>
                    <strong>{agent.agentId}</strong>
                    <div className="muted">{activeTasks.length} assigned tasks</div>
                  </div>
                  <div className="office-agent-status-group">
                    <span className={`office-agent-status ${agent.status}`}>{agent.status}</span>
                    <span className="office-agent-uptime">
                      {formatUptime(agentLastSeenMap.get(agent.agentId))}
                    </span>
                  </div>
                </div>
                <div className="office-agent-tasks">
                  {activeTasks.length === 0 ? (
                    <div className="empty-state compact">No assigned tasks</div>
                  ) : (
                    activeTasks.map((task) => (
                      <div key={task.taskId} className="office-task-card">
                        <strong>{task.taskId}</strong>
                        <div className="muted">{task.state}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
