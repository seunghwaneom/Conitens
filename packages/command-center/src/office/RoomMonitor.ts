/**
 * RoomMonitor — In-room diegetic monitor sprites showing real-time metrics.
 *
 * Each room gets a small pixel-art monitor on the wall showing:
 * - CPU bar (green)
 * - MEM bar (cyan)
 * - Status indicator (room activity color)
 * - Agent count badge
 *
 * Updates every 2 seconds from simulated metrics.
 */
import { Container, Graphics, Text as PixiText, TextStyle } from "pixi.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONITOR_W = 80;
const MONITOR_H = 52;
const BAR_W = 40;
const BAR_H = 6;
const REFRESH_MS = 2000;

const ACCENT_COLORS: Record<string, number> = {
  control:  0x2a7888,
  office:   0x4a6030,
  lab:      0x5a3870,
  lobby:    0x3535a0,
  archive:  0x4a4a50,
  corridor: 0x384048,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonitorEntry {
  roomId: string;
  roomType: string;
  container: Container;
  gfx: Graphics;
  cpuLabel: PixiText;
  memLabel: PixiText;
  agentCountLabel: PixiText;
  statusDot: Graphics;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class RoomMonitorManager {
  private monitors: Map<string, MonitorEntry> = new Map();
  private parentContainer: Container;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(parent: Container) {
    this.parentContainer = parent;
  }

  /** Create a monitor for a room at the given position */
  addMonitor(
    roomId: string,
    roomType: string,
    x: number,
    y: number,
    agentCount: number,
  ): void {
    if (this.monitors.has(roomId)) return;

    const container = new Container();
    container.position.set(x, y);

    const gfx = new Graphics();
    container.addChild(gfx);

    const accent = ACCENT_COLORS[roomType] ?? 0x444466;

    const tinyStyle = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 7,
      fill: 0x889999,
    });

    const cpuLabel = new PixiText({ text: "CPU 0%", style: { ...tinyStyle } });
    cpuLabel.position.set(4, 14);
    container.addChild(cpuLabel);

    const memLabel = new PixiText({ text: "MEM 0%", style: { ...tinyStyle } });
    memLabel.position.set(4, 26);
    container.addChild(memLabel);

    const agentCountLabel = new PixiText({
      text: `${agentCount}A`,
      style: new TextStyle({
        fontFamily: "Courier New, monospace",
        fontSize: 8,
        fill: accent,
        fontWeight: "bold",
      }),
    });
    agentCountLabel.position.set(MONITOR_W - 20, 4);
    container.addChild(agentCountLabel);

    const statusDot = new Graphics();
    statusDot.circle(MONITOR_W - 8, MONITOR_H - 8, 3).fill(0x33aa33);
    container.addChild(statusDot);

    this.parentContainer.addChild(container);

    const entry: MonitorEntry = {
      roomId, roomType, container, gfx,
      cpuLabel, memLabel, agentCountLabel, statusDot,
    };
    this.monitors.set(roomId, entry);

    // Initial draw
    this.drawMonitor(entry, randomMetric(), randomMetric(), agentCount);
  }

  /** Start auto-refresh */
  startRefresh(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      for (const [, entry] of this.monitors) {
        const cpu = randomMetric();
        const mem = randomMetric();
        this.drawMonitor(entry, cpu, mem, 1); // TODO: read from metrics store
      }
    }, REFRESH_MS);
  }

  /** Draw/update a single monitor */
  private drawMonitor(entry: MonitorEntry, cpu: number, mem: number, agents: number): void {
    const { gfx, cpuLabel, memLabel, agentCountLabel, roomType } = entry;
    const accent = ACCENT_COLORS[roomType] ?? 0x444466;

    gfx.clear();

    // Monitor frame
    gfx.rect(0, 0, MONITOR_W, MONITOR_H).fill({ color: 0x0c0c18, alpha: 0.95 });
    gfx.rect(0, 0, MONITOR_W, MONITOR_H).stroke({ color: accent, width: 1.5 });

    // Header line
    gfx.rect(0, 0, MONITOR_W, 12).fill({ color: accent, alpha: 0.3 });

    // Title
    const titleStyle = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 7,
      fill: accent,
      letterSpacing: 1,
    });
    // We reuse gfx for title since we can't easily add/remove text
    // The title is static, drawn once via the container labels

    // CPU bar
    const cpuBarX = 36;
    const cpuBarY = 16;
    gfx.rect(cpuBarX, cpuBarY, BAR_W, BAR_H).fill(0x1a1a2a);
    gfx.rect(cpuBarX, cpuBarY, BAR_W * (cpu / 100), BAR_H).fill(0x33cc55);
    gfx.rect(cpuBarX, cpuBarY, BAR_W, BAR_H).stroke({ color: 0x333344, width: 0.5 });

    // MEM bar
    const memBarX = 36;
    const memBarY = 28;
    gfx.rect(memBarX, memBarY, BAR_W, BAR_H).fill(0x1a1a2a);
    gfx.rect(memBarX, memBarY, BAR_W * (mem / 100), BAR_H).fill(0x33aacc);
    gfx.rect(memBarX, memBarY, BAR_W, BAR_H).stroke({ color: 0x333344, width: 0.5 });

    // Queue dots (bottom row)
    const queueCount = Math.floor(Math.random() * 5);
    for (let i = 0; i < 5; i++) {
      const dotColor = i < queueCount ? 0xffaa33 : 0x222233;
      gfx.circle(8 + i * 10, MONITOR_H - 8, 3).fill(dotColor);
    }

    // Update labels
    cpuLabel.text = `CPU ${cpu}%`;
    memLabel.text = `MEM ${mem}%`;
    agentCountLabel.text = `${agents}A`;

    // Status dot color based on CPU
    entry.statusDot.clear();
    const dotColor = cpu > 80 ? 0xff4444 : cpu > 50 ? 0xffaa33 : 0x33aa33;
    entry.statusDot.circle(MONITOR_W - 8, MONITOR_H - 8, 3).fill(dotColor);
  }

  /** Update agent count for a room */
  updateAgentCount(roomId: string, count: number): void {
    const entry = this.monitors.get(roomId);
    if (entry) {
      entry.agentCountLabel.text = `${count}A`;
    }
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const [, entry] of this.monitors) {
      this.parentContainer.removeChild(entry.container);
      entry.container.destroy({ children: true });
    }
    this.monitors.clear();
  }
}

function randomMetric(): number {
  return Math.floor(20 + Math.random() * 60);
}
