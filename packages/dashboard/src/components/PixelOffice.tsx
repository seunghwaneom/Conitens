import React, { useEffect, useRef } from "react";
import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { useEventStore } from "../store/event-store.js";

const STATUS_COLORS: Record<string, number> = {
  running: 0x22c55e,
  idle: 0xf59e0b,
  error: 0xef4444,
  terminated: 0x6b7280,
};

const OFFICE_BG = 0x1e293b;
const FLOOR_COLOR = 0x0f172a;

export function PixelOffice() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const { agents, tasks } = useEventStore();

  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new Application();
    appRef.current = app;

    const initApp = async () => {
      await app.init({
        width: canvasRef.current!.clientWidth || 800,
        height: 500,
        background: OFFICE_BG,
        antialias: true,
      });

      canvasRef.current!.appendChild(app.canvas as HTMLCanvasElement);
      drawOffice(app, agents, tasks);
    };

    initApp();

    return () => {
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  // Update office when agents/tasks change
  useEffect(() => {
    if (!appRef.current) return;
    const app = appRef.current;
    // Clear and redraw
    app.stage.removeChildren();
    drawOffice(app, agents, tasks);
  }, [agents, tasks]);

  return (
    <div style={{ padding: "16px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", color: "#94a3b8" }}>
        Pixel Office
      </h2>
      <div
        ref={canvasRef}
        style={{
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #334155",
        }}
      />
    </div>
  );
}

interface AgentState {
  agentId: string;
  status: string;
}

interface TaskState {
  taskId: string;
  state: string;
  assignee?: string;
}

function drawOffice(
  app: Application,
  agents: AgentState[],
  tasks: TaskState[],
) {
  const width = app.screen.width;
  const height = app.screen.height;

  // Draw floor
  const floor = new Graphics();
  floor.rect(20, 20, width - 40, height - 40);
  floor.fill({ color: FLOOR_COLOR });
  floor.stroke({ color: 0x334155, width: 1 });
  app.stage.addChild(floor);

  // Draw grid pattern on floor
  const grid = new Graphics();
  for (let x = 20; x < width - 20; x += 60) {
    grid.moveTo(x, 20);
    grid.lineTo(x, height - 20);
  }
  for (let y = 20; y < height - 20; y += 60) {
    grid.moveTo(20, y);
    grid.lineTo(width - 20, y);
  }
  grid.stroke({ color: 0x1e293b, width: 0.5 });
  app.stage.addChild(grid);

  // Title
  const titleStyle = new TextStyle({
    fontSize: 11,
    fill: 0x64748b,
    fontFamily: "monospace",
  });
  const title = new Text({ text: "Conitens Office", style: titleStyle });
  title.x = 30;
  title.y = 5;
  app.stage.addChild(title);

  // Draw agents
  const spacing = Math.min(180, (width - 100) / Math.max(agents.length, 1));

  agents.forEach((agent, i) => {
    const cx = 100 + i * spacing;
    const cy = height / 2;
    const color = STATUS_COLORS[agent.status] ?? 0x94a3b8;

    // Agent circle
    const circle = new Graphics();
    circle.circle(cx, cy, 28);
    circle.fill({ color, alpha: 0.8 });
    circle.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });
    app.stage.addChild(circle);

    // Pulse effect for running agents
    if (agent.status === "running") {
      const pulse = new Graphics();
      pulse.circle(cx, cy, 35);
      pulse.stroke({ color, width: 1.5, alpha: 0.4 });
      app.stage.addChild(pulse);
    }

    // Agent label
    const labelStyle = new TextStyle({
      fontSize: 12,
      fill: 0xe2e8f0,
      fontFamily: "sans-serif",
      fontWeight: "bold",
    });
    const label = new Text({ text: agent.agentId, style: labelStyle });
    label.anchor.set(0.5);
    label.x = cx;
    label.y = cy + 45;
    app.stage.addChild(label);

    // Status label
    const statusStyle = new TextStyle({
      fontSize: 10,
      fill: color,
      fontFamily: "monospace",
    });
    const statusLabel = new Text({ text: agent.status, style: statusStyle });
    statusLabel.anchor.set(0.5);
    statusLabel.x = cx;
    statusLabel.y = cy + 60;
    app.stage.addChild(statusLabel);

    // Task cards near agent
    const agentTasks = tasks.filter((t) => t.assignee === agent.agentId);
    agentTasks.forEach((task, j) => {
      const taskCard = new Graphics();
      const tx = cx - 40;
      const ty = cy - 70 - j * 25;
      taskCard.roundRect(tx, ty, 80, 20, 4);
      taskCard.fill({ color: 0x1e293b, alpha: 0.9 });
      taskCard.stroke({ color: 0x334155, width: 1 });
      app.stage.addChild(taskCard);

      const taskStyle = new TextStyle({
        fontSize: 9,
        fill: 0x94a3b8,
        fontFamily: "monospace",
      });
      const taskLabel = new Text({
        text: `${task.taskId.slice(-8)} [${task.state}]`,
        style: taskStyle,
      });
      taskLabel.x = tx + 4;
      taskLabel.y = ty + 4;
      app.stage.addChild(taskLabel);
    });
  });

  // Empty state
  if (agents.length === 0) {
    const emptyStyle = new TextStyle({
      fontSize: 14,
      fill: 0x64748b,
      fontFamily: "sans-serif",
    });
    const emptyText = new Text({
      text: "No agents. Start a Conitens session to see agents here.",
      style: emptyStyle,
    });
    emptyText.anchor.set(0.5);
    emptyText.x = width / 2;
    emptyText.y = height / 2;
    app.stage.addChild(emptyText);
  }
}
