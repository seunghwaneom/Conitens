/**
 * Minimap — Corner minimap showing full building layout with agent dots.
 *
 * Fixed-size overlay in the bottom-left corner. Click to navigate.
 * Shows all rooms as colored rectangles, agents as bright dots.
 */
import { Container, Graphics, Text as PixiText, TextStyle } from "pixi.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MINIMAP_W = 180;
const MINIMAP_H = 120;
const MINIMAP_PAD = 8;
const MINIMAP_MARGIN = 12;
const AGENT_DOT_R = 3;

const ROOM_COLORS: Record<string, number> = {
  control:  0x2a7888,
  office:   0x4a6030,
  lab:      0x5a3870,
  lobby:    0x3535a0,
  archive:  0x4a4a50,
  corridor: 0x384048,
};

const ROLE_COLORS: Record<string, number> = {
  orchestrator: 0xff7043,
  implementer:  0x66bb6a,
  researcher:   0xab47bc,
  reviewer:     0x42a5f5,
  validator:    0xef5350,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomRect {
  roomId: string;
  roomType: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AgentDot {
  agentId: string;
  role: string;
  x: number;
  y: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class MinimapManager {
  private container: Container;
  private bg: Graphics;
  private roomsGfx: Graphics;
  private agentsGfx: Graphics;
  private viewportGfx: Graphics;
  private rooms: RoomRect[] = [];
  private agents: AgentDot[] = [];
  private scaleX = 1;
  private scaleY = 1;
  private offsetX = 0;
  private offsetY = 0;
  private onNavigate: ((x: number, y: number) => void) | null = null;

  constructor(
    private stage: Container,
    private screenW: number,
    private screenH: number,
  ) {
    this.container = new Container();
    // Position at bottom-left, fixed to stage (not scene)
    this.container.position.set(MINIMAP_MARGIN, screenH - MINIMAP_H - MINIMAP_MARGIN);

    this.bg = new Graphics();
    this.roomsGfx = new Graphics();
    this.agentsGfx = new Graphics();
    this.viewportGfx = new Graphics();

    this.container.addChild(this.bg);
    this.container.addChild(this.roomsGfx);
    this.container.addChild(this.agentsGfx);
    this.container.addChild(this.viewportGfx);

    // Title
    const title = new PixiText({
      text: "MAP",
      style: new TextStyle({ fontFamily: "Courier New, monospace", fontSize: 8, fill: 0x667788, letterSpacing: 2 }),
    });
    title.position.set(MINIMAP_PAD, 2);
    this.container.addChild(title);

    // Background
    this.bg.rect(0, 0, MINIMAP_W, MINIMAP_H).fill({ color: 0x0a0a14, alpha: 0.9 });
    this.bg.rect(0, 0, MINIMAP_W, MINIMAP_H).stroke({ color: 0x333344, width: 1 });

    stage.addChild(this.container);

    // Click handler
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
    this.container.on("pointerdown", (e) => {
      const local = this.container.toLocal(e.global);
      const worldX = (local.x - MINIMAP_PAD) / this.scaleX + this.offsetX;
      const worldY = (local.y - MINIMAP_PAD - 12) / this.scaleY + this.offsetY;
      this.onNavigate?.(worldX, worldY);
    });
  }

  /** Set room layout data */
  setRooms(rooms: RoomRect[], totalW: number, totalH: number): void {
    this.rooms = rooms;
    const contentW = MINIMAP_W - MINIMAP_PAD * 2;
    const contentH = MINIMAP_H - MINIMAP_PAD * 2 - 12;
    this.scaleX = contentW / totalW;
    this.scaleY = contentH / totalH;
    const scale = Math.min(this.scaleX, this.scaleY);
    this.scaleX = scale;
    this.scaleY = scale;

    // Center
    this.offsetX = 0;
    this.offsetY = 0;

    this.drawRooms();
  }

  /** Set navigation callback */
  setNavigateCallback(cb: (x: number, y: number) => void): void {
    this.onNavigate = cb;
  }

  private drawRooms(): void {
    this.roomsGfx.clear();
    for (const room of this.rooms) {
      const color = ROOM_COLORS[room.roomType] ?? 0x333344;
      const rx = MINIMAP_PAD + (room.x - this.offsetX) * this.scaleX;
      const ry = MINIMAP_PAD + 12 + (room.y - this.offsetY) * this.scaleY;
      const rw = room.w * this.scaleX;
      const rh = room.h * this.scaleY;
      this.roomsGfx.rect(rx, ry, rw, rh).fill({ color, alpha: 0.6 });
      this.roomsGfx.rect(rx, ry, rw, rh).stroke({ color, width: 0.5 });
    }
  }

  /** Update agent positions on minimap */
  updateAgents(agents: AgentDot[]): void {
    this.agents = agents;
    this.agentsGfx.clear();
    for (const agent of agents) {
      const color = ROLE_COLORS[agent.role] ?? 0xffffff;
      const ax = MINIMAP_PAD + (agent.x - this.offsetX) * this.scaleX;
      const ay = MINIMAP_PAD + 12 + (agent.y - this.offsetY) * this.scaleY;
      this.agentsGfx.circle(ax, ay, AGENT_DOT_R).fill(color);
    }
  }

  /** Draw viewport indicator rectangle */
  updateViewport(panX: number, panY: number, zoom: number, viewW: number, viewH: number): void {
    this.viewportGfx.clear();
    // Visible area in world coordinates
    const worldW = viewW / zoom;
    const worldH = viewH / zoom;
    const worldX = -panX / zoom;
    const worldY = -panY / zoom;

    const rx = MINIMAP_PAD + (worldX - this.offsetX) * this.scaleX;
    const ry = MINIMAP_PAD + 12 + (worldY - this.offsetY) * this.scaleY;
    const rw = worldW * this.scaleX;
    const rh = worldH * this.scaleY;

    this.viewportGfx.rect(rx, ry, rw, rh).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
  }

  /** Reposition on window resize */
  resize(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.container.position.set(MINIMAP_MARGIN, screenH - MINIMAP_H - MINIMAP_MARGIN);
  }

  destroy(): void {
    this.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
