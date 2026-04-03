/**
 * PixelOffice — 2D pixel-art office view for agent orchestration.
 *
 * Claw Empire style: PixiJS 8, procedural room layout, animated agent sprites,
 * status-driven positioning, pixel-perfect rendering, pan/zoom camera.
 *
 * Architecture:
 *   - PixiJS Application managed imperatively via useRef + useEffect
 *   - Subscribes to Zustand stores via store.subscribe()
 *   - Pan: drag with mouse / shift+drag. Zoom: scroll wheel.
 */
import { useRef, useEffect } from "react";
import { Application, Container, Graphics, Text as PixiText, TextStyle } from "pixi.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { AgentSpriteManager } from "./AgentSpriteManager.js";
import { SpeechBubbleManager } from "./SpeechBubble.js";
import { RoomMonitorManager } from "./RoomMonitor.js";
import { HandoffArrowManager } from "./HandoffArrows.js";
import { MinimapManager } from "./Minimap.js";
import type { RoomDef } from "../data/building.js";
import type { AgentStatus } from "../data/agents.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Pixels per grid unit — controls overall scale */
const SCALE = 64;
/** Padding between rooms in pixels */
const ROOM_PAD = 16;
/** Gap between floor columns in pixels */
const FLOOR_GAP = 48;
/** Top margin for floor label */
const LABEL_H = 36;
/** Background color */
const BG_COLOR = 0x0a0a14;

/** Min/max zoom */
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.0;

// ── Colors ────────────────────────────────────────────────────────────────────

const ROOM_COLORS: Record<string, number> = {
  control:  0x152530,
  office:   0x2a2015,
  lab:      0x201828,
  lobby:    0x181825,
  archive:  0x1e1e22,
  corridor: 0x141618,
};

const ROOM_ACCENTS: Record<string, number> = {
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

const STATUS_OFFSETS: Record<AgentStatus, { dx: number; dy: number }> = {
  active:     { dx: 0, dy: -0.3 },
  busy:       { dx: 0, dy: -0.3 },
  idle:       { dx: 0.2, dy: 0.2 },
  inactive:   { dx: 0.3, dy: 0.35 },
  terminated: { dx: 0.3, dy: 0.35 },
  error:      { dx: 0, dy: -0.3 },
};

const STATUS_OPACITY: Record<AgentStatus, number> = {
  active: 1, busy: 1, idle: 0.8, inactive: 0.5, terminated: 0.25, error: 0.9,
};

// ── Layout ────────────────────────────────────────────────────────────────────

interface RoomLayout {
  room: RoomDef;
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeLayouts(rooms: RoomDef[]): RoomLayout[] {
  const floor0 = rooms.filter((r) => r.floor === 0);
  const floor1 = rooms.filter((r) => r.floor === 1);

  const layouts: RoomLayout[] = [];

  // Compute max width for floor 0
  let f0MaxW = 0;
  let f0Y = LABEL_H;
  for (const room of floor0) {
    const w = room.dimensions.x * SCALE;
    const h = room.dimensions.z * SCALE;
    f0MaxW = Math.max(f0MaxW, w);
    layouts.push({ room, x: ROOM_PAD, y: f0Y, w, h });
    f0Y += h + ROOM_PAD;
  }

  // Floor 1 starts after floor 0 column + gap
  const f1X = ROOM_PAD + f0MaxW + FLOOR_GAP;
  let f1Y = LABEL_H;
  for (const room of floor1) {
    const w = room.dimensions.x * SCALE;
    const h = room.dimensions.z * SCALE;
    layouts.push({ room, x: f1X, y: f1Y, w, h });
    f1Y += h + ROOM_PAD;
  }

  return layouts;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawRooms(g: Graphics, layouts: RoomLayout[]): void {
  g.clear();

  for (const { room, x, y, w, h } of layouts) {
    const fill = ROOM_COLORS[room.roomType] ?? 0x141618;
    const accent = ROOM_ACCENTS[room.roomType] ?? 0x384048;

    // Floor fill 
    g.rect(x, y, w, h).fill(fill);

    // Subtle checkered or grid pattern
    for (let gx = SCALE; gx < w; gx += SCALE) {
      g.moveTo(x + gx, y).lineTo(x + gx, y + h).stroke({ color: accent, width: 1, alpha: 0.15 });
    }
    for (let gy = SCALE; gy < h; gy += SCALE) {
      g.moveTo(x, y + gy).lineTo(x + w, y + gy).stroke({ color: accent, width: 1, alpha: 0.15 });
    }

    // Walls (Outer border + inner depth for top/bottom walls)
    const wallThick = 4;
    g.rect(x, y, w, h).stroke({ color: accent, width: 2 });
    g.rect(x, y, w, wallThick).fill(accent);           // Top wall
    g.rect(x, y + h - wallThick, w, wallThick).fill(accent); // Bottom wall
    
    // Draw specific room props based on type
    if (room.roomType === "lobby") {
      // Reception desk
      g.rect(x + w / 2 - 40, y + h / 2 - 20, 80, 20).fill(0x353545).stroke({ color: 0x454555, width: 1 });
      // Sofas
      g.roundRect(x + 20, y + 20, 40, 20, 4).fill(0x2a3a4a).stroke({ color: 0x3a4a5a, width: 1 });
      g.roundRect(x + Math.max(w - 60, 70), y + 20, 40, 20, 4).fill(0x2a3a4a).stroke({ color: 0x3a4a5a, width: 1 });
      // Plants
      g.circle(x + 20, y + h - 20, 8).fill(0x4CAF50).stroke({ color: 0x388E3C, width: 1 });
      g.circle(x + Math.max(w - 20, 30), y + h - 20, 8).fill(0x4CAF50).stroke({ color: 0x388E3C, width: 1 });
    } 
    else if (room.roomType === "control" || room.roomType === "office") {
      // Main central command desk
      const deskW = Math.min(w * 0.6, 160);
      const deskH = 24;
      const deskX = x + (w - deskW) / 2;
      const deskY = y + 30;
      g.roundRect(deskX, deskY, deskW, deskH, 2).fill(0x222233).stroke({ color: 0x3c3c4c, width: 1 });
      
      // Multiple Monitors
      const monW = 20;
      const monH = 10;
      for (let i = 0; i < 3; i++) {
        if (deskX + 10 + i * 40 + monW > deskX + deskW) break;
        g.rect(deskX + 10 + i * 40, deskY + 4, monW, monH).fill(0x111115).stroke({ color: accent, width: 1 });
        // screen glow
        g.rect(deskX + 12 + i * 40, deskY + 6, monW - 4, monH - 4).fill(accent);
      }
      // Chairs
      g.circle(deskX + deskW * 0.3, deskY + deskH + 15, 6).fill(0x1a1a2a);
      g.circle(deskX + deskW * 0.7, deskY + deskH + 15, 6).fill(0x1a1a2a);
      
      if (room.roomType === "office") {
         // Whiteboard against top wall
         g.rect(x + 20, y + 2, Math.min(w - 40, 100), 4).fill(0xeeeeee);
      }
    }
    else if (room.roomType === "lab" || room.roomType === "archive") {
      // Server racks
      const rackW = 24;
      const rackH = 40;
      for (let i = 0; i < 5; i++) {
        const rx = x + 20 + i * (rackW + 10);
        if (rx + rackW > x + w - 10) continue;
        const ry = y + 24;
        g.rect(rx, ry, rackW, rackH).fill(0x1c1c24).stroke({ color: 0x2c2c34, width: 1 });
        // blinking lights represented as small blocks
        g.rect(rx + 4, ry + 4, 4, 4).fill(0x00FF00); 
        g.rect(rx + 4, ry + 12, 4, 4).fill(0x00cc00);
        g.rect(rx + 16, ry + 20, 4, 4).fill(0xFF3333); 
      }
    }
  }
}

/** Compute agent target position within a room based on status */
function agentPosition(rl: RoomLayout, status: AgentStatus): { x: number; y: number } {
  const off = STATUS_OFFSETS[status] ?? { dx: 0, dy: 0 };
  return {
    x: rl.x + rl.w / 2 + off.dx * rl.w * 0.4,
    y: rl.y + rl.h / 2 + off.dy * rl.h * 0.4,
  };
}

/** Sync agents from store to sprite manager */
async function syncAgents(
  spriteManager: AgentSpriteManager,
  bubbleManager: SpeechBubbleManager,
  layouts: RoomLayout[],
): Promise<void> {
  const agents = useAgentStore.getState().agents;

  for (const [agentId, agent] of Object.entries(agents)) {
    if (!agent?.def) continue;

    const rl = layouts.find((l) => l.room.roomId === agent.roomId);
    if (!rl) continue;

    const pos = agentPosition(rl, agent.status);
    await spriteManager.setAgent(agentId, agent.def.role, agent.def.name, agent.status, pos.x, pos.y);
  }
}

/** Demo: show speech bubbles for inactive agents */
function showDemoBubbles(
  bubbleManager: SpeechBubbleManager,
  layouts: RoomLayout[],
): void {
  const agents = useAgentStore.getState().agents;
  const entries = Object.entries(agents);

  // Show a welcome bubble on the first agent
  if (entries.length > 0) {
    const [agentId, agent] = entries[0];
    if (agent?.def) {
      const rl = layouts.find((l) => l.room.roomId === agent.roomId);
      if (rl) {
        const pos = agentPosition(rl, agent.status);
        bubbleManager.show(agentId, "Awaiting task assignment...", pos.x, pos.y, "info", 8000);
      }
    }
  }

  // Show approval bubble on second agent
  if (entries.length > 1) {
    const [agentId, agent] = entries[1];
    if (agent?.def) {
      const rl = layouts.find((l) => l.room.roomId === agent.roomId);
      if (rl) {
        const pos = agentPosition(rl, agent.status);
        bubbleManager.show(agentId, "Ready to implement", pos.x, pos.y, "approval", 10000);
      }
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PixelOffice() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const app = new Application();
    let mounted = true;

    (async () => {
      await app.init({
        background: BG_COLOR,
        resizeTo: el,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (!mounted) { app.destroy(true); return; }

      el.appendChild(app.canvas);
      app.canvas.style.imageRendering = "pixelated";
      appRef.current = app;

      // Scene container (for pan/zoom)
      const scene = new Container();
      app.stage.addChild(scene);

      // Layers
      const roomGfx = new Graphics();
      const roomLabels = new Container();
      const agentContainer = new Container();
      const bubbleContainer = new Container();

      scene.addChild(roomGfx);
      scene.addChild(roomLabels);
      scene.addChild(agentContainer);
      scene.addChild(bubbleContainer);

      // Monitor layer (between rooms and agents)
      const monitorContainer = new Container();
      scene.addChild(monitorContainer);

      // Arrow layer (between monitors and agents)
      const arrowContainer = new Container();
      scene.addChild(arrowContainer);

      // Managers
      const spriteManager = new AgentSpriteManager(agentContainer);
      const bubbleManager = new SpeechBubbleManager(bubbleContainer);
      const monitorManager = new RoomMonitorManager(monitorContainer);
      const arrowManager = new HandoffArrowManager(arrowContainer);

      // Minimap (fixed to stage, not scene — unaffected by pan/zoom)
      const minimap = new MinimapManager(app.stage, el.clientWidth, el.clientHeight);

      // Compute layout
      const building = useSpatialStore.getState().building;
      const layouts = computeLayouts(building.rooms);

      // Draw static rooms
      drawRooms(roomGfx, layouts);

      // Room name labels
      const labelStyle = new TextStyle({ fontFamily: "Courier New, monospace", fontSize: 12, fill: 0x888899, letterSpacing: 1 });
      for (const rl of layouts) {
        const txt = new PixiText({ text: rl.room.name, style: new TextStyle({ ...labelStyle, fill: ROOM_ACCENTS[rl.room.roomType] ?? 0x888899 }) });
        txt.position.set(rl.x + 8, rl.y + rl.h - 20);
        roomLabels.addChild(txt);

        // Room type badge (top-right)
        const typeTxt = new PixiText({ text: rl.room.roomType.toUpperCase(), style: new TextStyle({ fontFamily: "Courier New, monospace", fontSize: 9, fill: 0x555566 }) });
        typeTxt.position.set(rl.x + rl.w - 60, rl.y + 6);
        roomLabels.addChild(typeTxt);
      }

      // Floor labels
      const floorStyle = new TextStyle({ fontFamily: "Courier New, monospace", fontSize: 16, fill: 0x667788, letterSpacing: 3 });
      const f0 = new PixiText({ text: "F0  GROUND FLOOR", style: floorStyle });
      f0.position.set(ROOM_PAD, 8);
      roomLabels.addChild(f0);

      const f1layouts = layouts.filter((l) => l.room.floor === 1);
      if (f1layouts.length > 0) {
        const f1 = new PixiText({ text: "F1  OPERATIONS FLOOR", style: floorStyle });
        f1.position.set(f1layouts[0].x, 8);
        roomLabels.addChild(f1);
      }

      // Add in-room monitors (top-right of each room)
      for (const rl of layouts) {
        const agentCount = Object.values(useAgentStore.getState().agents)
          .filter((a) => a?.roomId === rl.room.roomId).length;
        monitorManager.addMonitor(
          rl.room.roomId,
          rl.room.roomType,
          rl.x + rl.w - 88, // top-right corner
          rl.y + 4,
          agentCount,
        );
      }
      monitorManager.startRefresh();

      // Minimap: set room data
      const totalW = Math.max(...layouts.map((l) => l.x + l.w), 400);
      const totalH = Math.max(...layouts.map((l) => l.y + l.h), 400);
      minimap.setRooms(
        layouts.map((l) => ({ roomId: l.room.roomId, roomType: l.room.roomType, x: l.x, y: l.y, w: l.w, h: l.h })),
        totalW, totalH,
      );
      minimap.setNavigateCallback((wx, wy) => {
        // Navigate: center view on clicked world position
        panX = el.clientWidth / 2 - wx * zoom;
        panY = el.clientHeight / 2 - wy * zoom;
        applyTransform();
      });

      // Initial agent sync (loads sprite textures)
      syncAgents(spriteManager, bubbleManager, layouts);

      // Show demo speech bubbles + handoff arrows after sprites load
      setTimeout(() => {
        showDemoBubbles(bubbleManager, layouts);

        // Demo handoff arrows
        const agentPositions = new Map<string, { x: number; y: number; color: number }>();
        const agents = useAgentStore.getState().agents;
        for (const [agentId, agent] of Object.entries(agents)) {
          if (!agent?.def) continue;
          const rl = layouts.find((l) => l.room.roomId === agent.roomId);
          if (!rl) continue;
          const pos = agentPosition(rl, agent.status);
          const ROLE_C: Record<string, number> = { orchestrator: 0xff7043, implementer: 0x66bb6a, researcher: 0xab47bc, reviewer: 0x42a5f5, validator: 0xef5350 };
          agentPositions.set(agentId, { x: pos.x, y: pos.y, color: ROLE_C[agent.def.role] ?? 0x888888 });
        }
        arrowManager.addDemoArrows(agentPositions);

        // Update minimap agents
        const agentDots = Array.from(agentPositions.entries()).map(([id, p]) => {
          const agent = agents[id];
          return { agentId: id, role: agent?.def?.role ?? "implementer", x: p.x, y: p.y };
        });
        minimap.updateAgents(agentDots);
      }, 2000);

      // Subscribe to agent changes
      const unsub = useAgentStore.subscribe(() => {
        syncAgents(spriteManager, bubbleManager, layouts);
      });

      // Animation ticker — drives sprite frames + walking + bubble/arrow expiry
      app.ticker.add((ticker) => {
        const dt = ticker.deltaTime / 60; // convert to seconds
        spriteManager.tick(dt);
        bubbleManager.tick();
        arrowManager.tick(dt);
        minimap.updateViewport(panX, panY, zoom, el.clientWidth, el.clientHeight);
      });

      // ── Keyboard Navigation ─────────────────────────────────────────
      const onKeyDown = (e: KeyboardEvent) => {
        // 1-9: jump to room by index
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && num <= layouts.length) {
          const rl = layouts[num - 1];
          const cx = rl.x + rl.w / 2;
          const cy = rl.y + rl.h / 2;
          zoom = 1.2; // zoom in
          panX = el.clientWidth / 2 - cx * zoom;
          panY = el.clientHeight / 2 - cy * zoom;
          applyTransform();
          return;
        }
        // ESC: zoom out to see all rooms
        if (e.key === "Escape") {
          zoom = Math.min(el.clientWidth / (totalW + 40), el.clientHeight / (totalH + 40), MAX_ZOOM);
          zoom = Math.max(zoom, MIN_ZOOM);
          panX = (el.clientWidth - totalW * zoom) / 2;
          panY = (el.clientHeight - totalH * zoom) / 2;
          applyTransform();
          return;
        }
      };
      window.addEventListener("keydown", onKeyDown);

      // ── Pan / Zoom ────────────────────────────────────────────────
      let zoom = 1.0;
      let panX = 0;
      let panY = 0;
      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let panStartX = 0;
      let panStartY = 0;

      function applyTransform() {
        scene.scale.set(zoom);
        scene.position.set(panX, panY);
      }

      // Center the view initially
      const viewW = el.clientWidth;
      const viewH = el.clientHeight;
      zoom = Math.min(viewW / (totalW + 40), viewH / (totalH + 40), MAX_ZOOM);
      zoom = Math.max(zoom, MIN_ZOOM);
      panX = (viewW - totalW * zoom) / 2;
      panY = (viewH - totalH * zoom) / 2;
      applyTransform();

      const canvas = app.canvas;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));

        // Zoom toward mouse position
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        panX = mx - (mx - panX) * (newZoom / zoom);
        panY = my - (my - panY) * (newZoom / zoom);
        zoom = newZoom;
        applyTransform();
      };

      const onPointerDown = (e: PointerEvent) => {
        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = panX;
        panStartY = panY;
        canvas.style.cursor = "grabbing";
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        panX = panStartX + (e.clientX - dragStartX);
        panY = panStartY + (e.clientY - dragStartY);
        applyTransform();
      };

      const onPointerUp = () => {
        dragging = false;
        canvas.style.cursor = "grab";
      };

      canvas.style.cursor = "grab";
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointerleave", onPointerUp);

      // Cleanup
      return () => {
        unsub();
        spriteManager.destroy();
        bubbleManager.destroy();
        monitorManager.destroy();
        arrowManager.destroy();
        minimap.destroy();
        window.removeEventListener("keydown", onKeyDown);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointerleave", onPointerUp);
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        background: `#${BG_COLOR.toString(16).padStart(6, "0")}`,
        overflow: "hidden",
      }}
    />
  );
}
