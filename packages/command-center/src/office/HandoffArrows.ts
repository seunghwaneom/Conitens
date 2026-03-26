/**
 * HandoffArrows — Animated arrows showing agent-to-agent task handoffs.
 *
 * Draws dashed animated arrows between agents when tasks are handed off.
 * Arrow color matches the source agent's role color.
 * Pulse animation via dash offset cycling.
 */
import { Container, Graphics } from "pixi.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArrowEntry {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: number;
  createdAt: number;
  duration: number; // ms, 0 = permanent until removed
}

const ARROW_HEAD_SIZE = 8;
const DASH_LENGTH = 6;
const GAP_LENGTH = 4;
const ANIM_SPEED = 40; // pixels per second

// ── Manager ───────────────────────────────────────────────────────────────────

export class HandoffArrowManager {
  private arrows: ArrowEntry[] = [];
  private gfx: Graphics;
  private parentContainer: Container;
  private elapsed = 0;

  constructor(parent: Container) {
    this.parentContainer = parent;
    this.gfx = new Graphics();
    parent.addChild(this.gfx);
  }

  /** Add a handoff arrow between two points */
  addArrow(
    id: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
    duration: number = 5000,
  ): void {
    // Remove existing with same ID
    this.removeArrow(id);
    this.arrows.push({ id, fromX, fromY, toX, toY, color, createdAt: Date.now(), duration });
  }

  /** Remove an arrow by ID */
  removeArrow(id: string): void {
    this.arrows = this.arrows.filter((a) => a.id !== id);
  }

  /** Tick — redraw arrows with animated dash offset, remove expired */
  tick(dt: number): void {
    this.elapsed += dt;

    // Remove expired arrows
    const now = Date.now();
    this.arrows = this.arrows.filter((a) => a.duration === 0 || now - a.createdAt < a.duration);

    // Redraw
    this.gfx.clear();
    const dashOffset = (this.elapsed * ANIM_SPEED) % (DASH_LENGTH + GAP_LENGTH);

    for (const arrow of this.arrows) {
      this.drawDashedArrow(arrow, dashOffset);
    }
  }

  private drawDashedArrow(arrow: ArrowEntry, dashOffset: number): void {
    const { fromX, fromY, toX, toY, color } = arrow;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) return;

    const ux = dx / dist;
    const uy = dy / dist;

    // Draw dashed line
    const totalDash = DASH_LENGTH + GAP_LENGTH;
    let pos = dashOffset;

    while (pos < dist - ARROW_HEAD_SIZE) {
      const startPos = Math.max(0, pos);
      const endPos = Math.min(dist - ARROW_HEAD_SIZE, pos + DASH_LENGTH);

      if (endPos > startPos && startPos >= 0) {
        const sx = fromX + ux * startPos;
        const sy = fromY + uy * startPos;
        const ex = fromX + ux * endPos;
        const ey = fromY + uy * endPos;

        this.gfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ color, width: 2, alpha: 0.7 });
      }

      pos += totalDash;
    }

    // Arrow head
    const tipX = toX;
    const tipY = toY;
    const baseX = toX - ux * ARROW_HEAD_SIZE;
    const baseY = toY - uy * ARROW_HEAD_SIZE;
    const perpX = -uy * ARROW_HEAD_SIZE * 0.5;
    const perpY = ux * ARROW_HEAD_SIZE * 0.5;

    this.gfx.moveTo(tipX, tipY);
    this.gfx.lineTo(baseX + perpX, baseY + perpY);
    this.gfx.lineTo(baseX - perpX, baseY - perpY);
    this.gfx.closePath();
    this.gfx.fill({ color, alpha: 0.8 });

    // Glow dot at source
    this.gfx.circle(fromX, fromY, 4).fill({ color, alpha: 0.4 });
  }

  /** Add demo arrows between agents */
  addDemoArrows(
    agentPositions: Map<string, { x: number; y: number; color: number }>,
  ): void {
    const entries = Array.from(agentPositions.entries());
    if (entries.length < 2) return;

    // Manager → Implementer handoff
    const manager = entries.find(([id]) => id.includes("manager"));
    const impl = entries.find(([id]) => id.includes("implementer"));
    if (manager && impl) {
      this.addArrow(
        "handoff-mgr-impl",
        manager[1].x, manager[1].y,
        impl[1].x, impl[1].y,
        manager[1].color,
        15000,
      );
    }

    // Implementer → Reviewer handoff
    const reviewer = entries.find(([id]) => id.includes("reviewer"));
    if (impl && reviewer) {
      this.addArrow(
        "handoff-impl-rev",
        impl[1].x, impl[1].y,
        reviewer[1].x, reviewer[1].y,
        impl[1].color,
        15000,
      );
    }
  }

  clear(): void {
    this.arrows = [];
    this.gfx.clear();
  }

  destroy(): void {
    this.clear();
    this.parentContainer.removeChild(this.gfx);
    this.gfx.destroy();
  }
}
