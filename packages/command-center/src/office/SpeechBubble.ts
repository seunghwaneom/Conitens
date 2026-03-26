/**
 * SpeechBubble — Floating speech bubbles above agents in the pixel office.
 *
 * Max 4 concurrent bubbles (visibility budget per Architect recommendation).
 * Bubbles auto-dismiss after a duration. Prioritized by recency.
 */
import { Container, Graphics, Text as PixiText, TextStyle } from "pixi.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BUBBLES = 4;
const DEFAULT_DURATION = 5000; // ms
const BUBBLE_PAD = 8;
const BUBBLE_RADIUS = 6;
const MAX_TEXT_WIDTH = 160;
const TAIL_SIZE = 6;
const BUBBLE_Y_OFFSET = -50; // above agent

// ── Types ─────────────────────────────────────────────────────────────────────

interface BubbleEntry {
  id: string;
  agentId: string;
  container: Container;
  createdAt: number;
  duration: number;
  targetX: number;
  targetY: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class SpeechBubbleManager {
  private bubbles: BubbleEntry[] = [];
  private parentContainer: Container;

  constructor(parent: Container) {
    this.parentContainer = parent;
  }

  /**
   * Show a speech bubble above an agent.
   * @param agentId — which agent
   * @param text — bubble content
   * @param x — agent screen X
   * @param y — agent screen Y
   * @param type — "info" | "approval" | "error" | "output"
   * @param duration — auto-dismiss in ms (0 = sticky)
   */
  show(
    agentId: string,
    text: string,
    x: number,
    y: number,
    type: "info" | "approval" | "error" | "output" = "info",
    duration: number = DEFAULT_DURATION,
  ): void {
    // Remove existing bubble for this agent
    this.dismissAgent(agentId);

    // Enforce max bubble budget
    while (this.bubbles.length >= MAX_BUBBLES) {
      const oldest = this.bubbles.shift();
      if (oldest) {
        this.parentContainer.removeChild(oldest.container);
        oldest.container.destroy({ children: true });
      }
    }

    // Create bubble
    const container = new Container();
    const gfx = new Graphics();
    container.addChild(gfx);

    // Colors by type
    const colors = {
      info:     { bg: 0x1a1a2e, border: 0x444466, text: 0xccccdd },
      approval: { bg: 0x1a2e1a, border: 0x44aa44, text: 0x88ff88 },
      error:    { bg: 0x2e1a1a, border: 0xaa4444, text: 0xff8888 },
      output:   { bg: 0x1a1a2e, border: 0x4466aa, text: 0x88aaff },
    };
    const c = colors[type];

    // Text
    const style = new TextStyle({
      fontFamily: "Courier New, monospace",
      fontSize: 10,
      fill: c.text,
      wordWrap: true,
      wordWrapWidth: MAX_TEXT_WIDTH,
      lineHeight: 14,
    });
    const textObj = new PixiText({ text: truncate(text, 120), style });
    textObj.position.set(BUBBLE_PAD, BUBBLE_PAD);
    container.addChild(textObj);

    // Measure text for bubble size
    const tw = Math.min(textObj.width, MAX_TEXT_WIDTH);
    const th = textObj.height;
    const bw = tw + BUBBLE_PAD * 2;
    const bh = th + BUBBLE_PAD * 2;

    // Bubble background
    gfx.roundRect(0, 0, bw, bh, BUBBLE_RADIUS).fill({ color: c.bg, alpha: 0.92 });
    gfx.roundRect(0, 0, bw, bh, BUBBLE_RADIUS).stroke({ color: c.border, width: 1.5 });

    // Tail (small triangle pointing down)
    const tailX = bw / 2;
    gfx.moveTo(tailX - TAIL_SIZE, bh);
    gfx.lineTo(tailX, bh + TAIL_SIZE);
    gfx.lineTo(tailX + TAIL_SIZE, bh);
    gfx.closePath();
    gfx.fill({ color: c.bg, alpha: 0.92 });
    gfx.stroke({ color: c.border, width: 1.5 });

    // Type indicator icon
    const icons: Record<string, string> = {
      info: "💬",
      approval: "⚑",
      error: "⚠",
      output: "▸",
    };
    const iconStyle = new TextStyle({ fontSize: 10, fill: c.border });
    const icon = new PixiText({ text: icons[type] ?? "💬", style: iconStyle });
    icon.position.set(bw - 16, 2);
    container.addChild(icon);

    // Position bubble above agent
    container.position.set(x - bw / 2, y + BUBBLE_Y_OFFSET - bh);

    this.parentContainer.addChild(container);

    this.bubbles.push({
      id: `${agentId}-${Date.now()}`,
      agentId,
      container,
      createdAt: Date.now(),
      duration,
      targetX: x,
      targetY: y,
    });
  }

  /** Update bubble positions (follow agents) and auto-dismiss expired ones */
  tick(): void {
    const now = Date.now();
    const expired: number[] = [];

    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (b.duration > 0 && now - b.createdAt > b.duration) {
        expired.push(i);
      }
    }

    // Remove expired (reverse order to preserve indices)
    for (let i = expired.length - 1; i >= 0; i--) {
      const idx = expired[i];
      const b = this.bubbles[idx];
      this.parentContainer.removeChild(b.container);
      b.container.destroy({ children: true });
      this.bubbles.splice(idx, 1);
    }
  }

  /** Update a bubble's position (when agent moves) */
  updatePosition(agentId: string, x: number, y: number): void {
    const b = this.bubbles.find((b) => b.agentId === agentId);
    if (!b) return;
    const bw = b.container.width;
    const bh = b.container.height;
    b.container.position.set(x - bw / 2, y + BUBBLE_Y_OFFSET - bh);
    b.targetX = x;
    b.targetY = y;
  }

  /** Dismiss all bubbles for an agent */
  dismissAgent(agentId: string): void {
    this.bubbles = this.bubbles.filter((b) => {
      if (b.agentId === agentId) {
        this.parentContainer.removeChild(b.container);
        b.container.destroy({ children: true });
        return false;
      }
      return true;
    });
  }

  /** Dismiss all bubbles */
  clear(): void {
    for (const b of this.bubbles) {
      this.parentContainer.removeChild(b.container);
      b.container.destroy({ children: true });
    }
    this.bubbles = [];
  }

  get count(): number {
    return this.bubbles.length;
  }

  destroy(): void {
    this.clear();
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}
