/**
 * PixelOffice — 2D pixel-art office view for agent orchestration.
 *
 * Renders a top-down pixel office using PixiJS 8 (vanilla, no @pixi/react).
 * Claw Empire style: procedural room layout, animated agent sprites,
 * status-driven positioning, pixel-perfect rendering.
 *
 * Architecture:
 *   - PixiJS Application managed imperatively via useRef + useEffect
 *   - Subscribes to Zustand stores (agent-store, spatial-store) via store.subscribe()
 *   - Lazy-mounted: only when viewMode === "2d" (Three.js unmounted)
 *   - NearestFilter (scaleMode: "nearest") for pixel crispness
 */
import { useRef, useEffect, useCallback } from "react";
import { Application, Container, Graphics, Text as PixiText, TextStyle, Sprite, Texture, Assets } from "pixi.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import type { RoomDef } from "../data/building.js";
import type { AgentStatus } from "../data/agents.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_SIZE = 32;
const ROOM_PAD = 2; // padding between rooms in tiles
const FLOOR_GAP = 4; // gap between floors in tiles
const AGENT_SIZE = 28; // agent sprite size in pixels
const BG_COLOR = 0x0a0a14; // dark background matching command center theme

/** Room type → floor color */
const ROOM_COLORS: Record<string, number> = {
  control:  0x1e3040,
  office:   0x2d2218,
  lab:      0x231c2d,
  lobby:    0x191928,
  archive:  0x232326,
  corridor: 0x16181c,
};

/** Room type → accent border color */
const ROOM_ACCENTS: Record<string, number> = {
  control:  0x1e7080,
  office:   0x3d5028,
  lab:      0x452d55,
  lobby:    0x2a2a50,
  archive:  0x3a3a40,
  corridor: 0x283038,
};

/** Agent role → color */
const ROLE_COLORS: Record<string, number> = {
  orchestrator: 0xff7043,
  implementer:  0x66bb6a,
  researcher:   0xab47bc,
  reviewer:     0x42a5f5,
  validator:    0xef5350,
};

/** Status → desk position offset from room center (in pixels) */
const STATUS_POSITIONS: Record<AgentStatus, { dx: number; dz: number }> = {
  active:     { dx: -20, dz: -15 },  // at desk (back of room)
  busy:       { dx: -20, dz: -15 },  // at desk
  idle:       { dx: 10, dz: 10 },    // open area (center-ish)
  inactive:   { dx: 25, dz: 20 },    // near door
  terminated: { dx: 25, dz: 20 },    // near door
  error:      { dx: -20, dz: -15 },  // at desk (with error visual)
};

/** Status → agent body opacity */
const STATUS_OPACITY: Record<AgentStatus, number> = {
  active: 1.0, busy: 1.0, idle: 0.8, inactive: 0.45, terminated: 0.2, error: 0.85,
};

// ── Room layout computation ───────────────────────────────────────────────────

interface RoomLayout {
  room: RoomDef;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
}

function computeRoomLayouts(rooms: RoomDef[]): { layouts: RoomLayout[]; totalW: number; totalH: number } {
  const floor0 = rooms.filter((r) => r.floor === 0);
  const floor1 = rooms.filter((r) => r.floor === 1);

  const layouts: RoomLayout[] = [];
  let maxX = 0;
  let maxY = 0;

  // Layout floor 0 rooms in a column on the left
  let y0 = TILE_SIZE * 2; // top margin for label
  for (const room of floor0) {
    const w = room.dimensions.x * TILE_SIZE;
    const h = room.dimensions.z * TILE_SIZE;
    layouts.push({ room, screenX: TILE_SIZE, screenY: y0, screenW: w, screenH: h });
    y0 += h + ROOM_PAD * TILE_SIZE;
    maxX = Math.max(maxX, TILE_SIZE + w);
    maxY = Math.max(maxY, y0);
  }

  // Layout floor 1 rooms in a column on the right
  const floor1X = maxX + FLOOR_GAP * TILE_SIZE;
  let y1 = TILE_SIZE * 2; // top margin for label
  for (const room of floor1) {
    const w = room.dimensions.x * TILE_SIZE;
    const h = room.dimensions.z * TILE_SIZE;
    layouts.push({ room, screenX: floor1X, screenY: y1, screenW: w, screenH: h });
    y1 += h + ROOM_PAD * TILE_SIZE;
    maxX = Math.max(maxX, floor1X + w);
    maxY = Math.max(maxY, y1);
  }

  return { layouts, totalW: maxX + TILE_SIZE, totalH: maxY + TILE_SIZE };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawRoom(g: Graphics, layout: RoomLayout): void {
  const { room, screenX, screenY, screenW, screenH } = layout;
  const floorColor = ROOM_COLORS[room.roomType] ?? ROOM_COLORS.corridor;
  const accentColor = ROOM_ACCENTS[room.roomType] ?? ROOM_ACCENTS.corridor;

  // Floor fill
  g.rect(screenX, screenY, screenW, screenH);
  g.fill(floorColor);

  // Border
  g.rect(screenX, screenY, screenW, screenH);
  g.stroke({ color: accentColor, width: 2 });

  // Inner grid lines (subtle tile grid)
  for (let tx = TILE_SIZE; tx < screenW; tx += TILE_SIZE) {
    g.moveTo(screenX + tx, screenY);
    g.lineTo(screenX + tx, screenY + screenH);
    g.stroke({ color: accentColor, width: 0.5, alpha: 0.15 });
  }
  for (let ty = TILE_SIZE; ty < screenH; ty += TILE_SIZE) {
    g.moveTo(screenX, screenY + ty);
    g.lineTo(screenX + screenW, screenY + ty);
    g.stroke({ color: accentColor, width: 0.5, alpha: 0.15 });
  }

  // Desk rectangle (back wall)
  const deskW = Math.min(screenW * 0.6, 80);
  const deskH = 12;
  const deskX = screenX + (screenW - deskW) / 2;
  const deskY = screenY + 16;
  g.rect(deskX, deskY, deskW, deskH);
  g.fill(0x2a2a3a);
  g.stroke({ color: 0x3a3a4a, width: 1 });

  // Monitor on desk (small bright rectangle)
  const monW = 16;
  const monH = 8;
  g.rect(deskX + (deskW - monW) / 2, deskY + 2, monW, monH);
  g.fill(accentColor);
  g.stroke({ color: 0x555566, width: 1 });
}

function drawAgent(g: Graphics, x: number, y: number, roleColor: number, status: AgentStatus): void {
  const opacity = STATUS_OPACITY[status];

  // Body (rounded rectangle)
  const bodyW = 14;
  const bodyH = 18;
  g.roundRect(x - bodyW / 2, y - bodyH / 2 + 4, bodyW, bodyH, 3);
  g.fill({ color: roleColor, alpha: opacity });
  g.stroke({ color: 0x000000, width: 1, alpha: opacity });

  // Head (circle)
  g.circle(x, y - 6, 7);
  g.fill({ color: lightenColor(roleColor), alpha: opacity });
  g.stroke({ color: 0x000000, width: 1, alpha: opacity });

  // Eyes
  g.circle(x - 2, y - 7, 1.5);
  g.fill({ color: 0xffffff, alpha: opacity });
  g.circle(x + 2, y - 7, 1.5);
  g.fill({ color: 0xffffff, alpha: opacity });

  // Status glow for active/busy
  if (status === "active" || status === "busy") {
    g.circle(x, y, 18);
    g.fill({ color: roleColor, alpha: 0.15 });
  }

  // Error flash
  if (status === "error") {
    g.circle(x, y, 16);
    g.fill({ color: 0xff0000, alpha: 0.2 });
  }

  // Greyscale overlay for inactive/terminated
  if (status === "inactive" || status === "terminated") {
    g.circle(x, y, 14);
    g.fill({ color: 0x333344, alpha: 0.3 });
  }
}

function lightenColor(color: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + 60);
  const g = Math.min(255, ((color >> 8) & 0xff) + 60);
  const b = Math.min(255, (color & 0xff) + 60);
  return (r << 16) | (g << 8) | b;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PixelOffice() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const roomGraphicsRef = useRef<Graphics | null>(null);
  const agentGraphicsRef = useRef<Graphics | null>(null);
  const labelsContainerRef = useRef<Container | null>(null);
  const layoutsRef = useRef<RoomLayout[]>([]);

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();
    let mounted = true;

    (async () => {
      await app.init({
        background: BG_COLOR,
        resizeTo: containerRef.current!,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (!mounted) { app.destroy(); return; }

      // Pixel-perfect rendering
      containerRef.current!.appendChild(app.canvas);
      app.canvas.style.imageRendering = "pixelated";

      appRef.current = app;

      // Create layers
      const roomGfx = new Graphics();
      const agentGfx = new Graphics();
      const labelsContainer = new Container();

      app.stage.addChild(roomGfx);
      app.stage.addChild(labelsContainer);
      app.stage.addChild(agentGfx);

      roomGraphicsRef.current = roomGfx;
      agentGraphicsRef.current = agentGfx;
      labelsContainerRef.current = labelsContainer;

      // Initial render
      renderScene();

      // Subscribe to store changes for reactive updates
      const unsubAgent = useAgentStore.subscribe(() => renderAgents());
      const unsubSpatial = useSpatialStore.subscribe(() => renderScene());

      // Tick loop for animations
      app.ticker.add(() => {
        // Future: animate agent walking, particles, etc.
      });

      // Cleanup subscriptions on unmount
      return () => {
        unsubAgent();
        unsubSpatial();
      };
    })();

    return () => {
      mounted = false;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  const renderScene = useCallback(() => {
    const roomGfx = roomGraphicsRef.current;
    const labelsContainer = labelsContainerRef.current;
    if (!roomGfx || !labelsContainer) return;

    const building = useSpatialStore.getState().building;
    const { layouts, totalW, totalH } = computeRoomLayouts(building.rooms);
    layoutsRef.current = layouts;

    // Clear and redraw rooms
    roomGfx.clear();

    // Floor labels
    labelsContainer.removeChildren();

    const labelStyle = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 14,
      fill: 0x888899,
      letterSpacing: 2,
    });

    const floor0Label = new PixiText({ text: "F0  GROUND FLOOR", style: labelStyle });
    floor0Label.position.set(TILE_SIZE, 8);
    labelsContainer.addChild(floor0Label);

    // Find floor 1 X offset
    const floor1Layouts = layouts.filter((l) => l.room.floor === 1);
    if (floor1Layouts.length > 0) {
      const f1x = floor1Layouts[0].screenX;
      const floor1Label = new PixiText({ text: "F1  OPERATIONS FLOOR", style: labelStyle });
      floor1Label.position.set(f1x, 8);
      labelsContainer.addChild(floor1Label);
    }

    // Draw rooms
    for (const layout of layouts) {
      drawRoom(roomGfx, layout);

      // Room name label
      const nameStyle = new TextStyle({
        fontFamily: "Courier New, monospace",
        fontSize: 10,
        fill: ROOM_ACCENTS[layout.room.roomType] ?? 0x555566,
        letterSpacing: 1,
      });
      const nameLabel = new PixiText({ text: layout.room.name, style: nameStyle });
      nameLabel.position.set(
        layout.screenX + 6,
        layout.screenY + layout.screenH - 16,
      );
      labelsContainer.addChild(nameLabel);

      // Room type badge
      const typeStyle = new TextStyle({
        fontFamily: "Courier New, monospace",
        fontSize: 8,
        fill: 0x555566,
      });
      const typeLabel = new PixiText({
        text: layout.room.roomType.toUpperCase(),
        style: typeStyle,
      });
      typeLabel.position.set(
        layout.screenX + layout.screenW - 40,
        layout.screenY + 4,
      );
      labelsContainer.addChild(typeLabel);
    }

    // Render agents on top
    renderAgents();
  }, []);

  const renderAgents = useCallback(() => {
    const agentGfx = agentGraphicsRef.current;
    if (!agentGfx) return;

    agentGfx.clear();

    const agents = useAgentStore.getState().agents;
    const layouts = layoutsRef.current;

    for (const [agentId, agent] of Object.entries(agents)) {
      if (!agent?.def) continue;

      // Find the room layout for this agent
      const roomLayout = layouts.find((l) => l.room.roomId === agent.roomId);
      if (!roomLayout) continue;

      const roleColor = ROLE_COLORS[agent.def.role] ?? 0x888888;
      const statusPos = STATUS_POSITIONS[agent.status] ?? STATUS_POSITIONS.idle;

      // Agent position = room center + status offset
      const ax = roomLayout.screenX + roomLayout.screenW / 2 + statusPos.dx;
      const ay = roomLayout.screenY + roomLayout.screenH / 2 + statusPos.dz;

      drawAgent(agentGfx, ax, ay, roleColor, agent.status);

      // Agent name label
      const nameStyle = new TextStyle({
        fontFamily: "Courier New, monospace",
        fontSize: 8,
        fill: roleColor,
        align: "center",
      });
      // Draw name using Graphics text (avoid creating PixiText in render loop)
      // For now, draw a small role indicator
      const label = agent.def.visual?.label ?? agent.def.role.slice(0, 3).toUpperCase();
      agentGfx.rect(ax - 10, ay + 16, 20, 10);
      agentGfx.fill({ color: 0x0a0a14, alpha: 0.8 });

      // Simple text via small rectangles representing the label
      // (PixiText in render loop is expensive — we'll use a label container in future)
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: `#${BG_COLOR.toString(16).padStart(6, "0")}`,
      }}
    />
  );
}
