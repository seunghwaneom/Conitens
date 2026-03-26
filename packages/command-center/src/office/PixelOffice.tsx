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

    // Grid lines
    for (let gx = SCALE; gx < w; gx += SCALE) {
      g.moveTo(x + gx, y).lineTo(x + gx, y + h).stroke({ color: accent, width: 1, alpha: 0.1 });
    }
    for (let gy = SCALE; gy < h; gy += SCALE) {
      g.moveTo(x, y + gy).lineTo(x + w, y + gy).stroke({ color: accent, width: 1, alpha: 0.1 });
    }

    // Border
    g.rect(x, y, w, h).stroke({ color: accent, width: 2 });

    // Desk (top area)
    const deskW = Math.min(w * 0.5, 120);
    const deskH = 16;
    const deskX = x + (w - deskW) / 2;
    const deskY = y + 24;
    g.rect(deskX, deskY, deskW, deskH).fill(0x252535).stroke({ color: 0x353545, width: 1 });

    // Monitor on desk
    const monW = 24;
    const monH = 12;
    g.rect(deskX + (deskW - monW) / 2, deskY + 2, monW, monH).fill(accent).stroke({ color: 0x555566, width: 1 });

    // Chair (small circle below desk)
    g.circle(deskX + deskW / 2, deskY + deskH + 14, 6).fill(0x2a2a3a).stroke({ color: 0x3a3a4a, width: 1 });
  }
}

function drawAgents(g: Graphics, labels: Container, layouts: RoomLayout[]): void {
  g.clear();
  labels.removeChildren();

  const agents = useAgentStore.getState().agents;

  for (const [, agent] of Object.entries(agents)) {
    if (!agent?.def) continue;

    const rl = layouts.find((l) => l.room.roomId === agent.roomId);
    if (!rl) continue;

    const role = agent.def.role;
    const status = agent.status;
    const color = ROLE_COLORS[role] ?? 0x888888;
    const off = STATUS_OFFSETS[status] ?? { dx: 0, dy: 0 };
    const opacity = STATUS_OPACITY[status] ?? 0.8;

    // Position: room center + status offset (in room-relative grid units)
    const ax = rl.x + rl.w / 2 + off.dx * rl.w * 0.4;
    const ay = rl.y + rl.h / 2 + off.dy * rl.h * 0.4;

    // Glow for active/busy
    if (status === "active" || status === "busy") {
      g.circle(ax, ay, 24).fill({ color, alpha: 0.12 });
    }
    if (status === "error") {
      g.circle(ax, ay, 22).fill({ color: 0xff0000, alpha: 0.15 });
    }

    // Body
    g.roundRect(ax - 10, ay - 4, 20, 24, 4).fill({ color, alpha: opacity }).stroke({ color: 0x000000, width: 1.5, alpha: opacity });

    // Head
    const headColor = lighten(color);
    g.circle(ax, ay - 14, 10).fill({ color: headColor, alpha: opacity }).stroke({ color: 0x000000, width: 1.5, alpha: opacity });

    // Eyes
    g.circle(ax - 3, ay - 15, 2).fill({ color: 0xffffff, alpha: opacity });
    g.circle(ax + 3, ay - 15, 2).fill({ color: 0xffffff, alpha: opacity });
    g.circle(ax - 2.5, ay - 14.5, 1).fill({ color: 0x000000, alpha: opacity });
    g.circle(ax + 3.5, ay - 14.5, 1).fill({ color: 0x000000, alpha: opacity });

    // Greyscale overlay for inactive/terminated
    if (status === "inactive" || status === "terminated") {
      g.circle(ax, ay - 2, 18).fill({ color: 0x333344, alpha: 0.35 });
    }

    // Name label
    const nameStyle = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 10,
      fill: color,
      align: "center",
      letterSpacing: 1,
    });
    const nameTxt = new PixiText({ text: agent.def.name, style: nameStyle });
    nameTxt.anchor.set(0.5, 0);
    nameTxt.position.set(ax, ay + 24);
    labels.addChild(nameTxt);

    // Status badge
    const statusStyle = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 8,
      fill: status === "error" ? 0xff4444 : 0x666677,
      align: "center",
    });
    const statusTxt = new PixiText({ text: status.toUpperCase(), style: statusStyle });
    statusTxt.anchor.set(0.5, 0);
    statusTxt.position.set(ax, ay + 36);
    labels.addChild(statusTxt);
  }
}

function lighten(c: number): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + 50);
  const g = Math.min(255, ((c >> 8) & 0xff) + 50);
  const b = Math.min(255, (c & 0xff) + 50);
  return (r << 16) | (g << 8) | b;
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
      const agentGfx = new Graphics();
      const roomLabels = new Container();
      const agentLabels = new Container();

      scene.addChild(roomGfx);
      scene.addChild(roomLabels);
      scene.addChild(agentGfx);
      scene.addChild(agentLabels);

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

      // Initial agent draw
      drawAgents(agentGfx, agentLabels, layouts);

      // Subscribe to agent changes
      const unsub = useAgentStore.subscribe(() => {
        drawAgents(agentGfx, agentLabels, layouts);
      });

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
      const totalW = Math.max(...layouts.map((l) => l.x + l.w), 400);
      const totalH = Math.max(...layouts.map((l) => l.y + l.h), 400);
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
