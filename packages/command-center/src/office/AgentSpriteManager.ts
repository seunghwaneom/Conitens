/**
 * AgentSpriteManager — Manages animated PixiJS sprites for agents.
 *
 * Loads sprite sheet textures, creates per-agent Sprite objects,
 * drives frame animation via ticker, and handles walking interpolation.
 */
import { Container, Sprite, Texture, Rectangle, Assets, Graphics, Text as PixiText, TextStyle } from "pixi.js";
import type { AgentStatus } from "../data/agents.js";

// ── Sprite Sheet Layout (locked from Seed 1) ─────────────────────────────────

const FRAME_W = 48;
const FRAME_H = 48;
const COLS = 8;
const ROWS = 5;

/** Animation clips matching BASE_SPRITE_SHEET */
const CLIPS: Record<string, { row: number; startCol: number; frames: number; fps: number; loop: boolean }> = {
  idle:            { row: 0, startCol: 0, frames: 4, fps: 6, loop: true },
  work:            { row: 1, startCol: 0, frames: 4, fps: 8, loop: true },
  walk:            { row: 2, startCol: 0, frames: 4, fps: 8, loop: true },
  "error-flash":   { row: 3, startCol: 0, frames: 2, fps: 12, loop: true },
  "spawn-in":      { row: 3, startCol: 2, frames: 2, fps: 8, loop: false },
  "greyscale-idle": { row: 4, startCol: 0, frames: 4, fps: 6, loop: true },
};

/** Status → animation clip + speed */
const STATUS_ANIM: Record<AgentStatus, { clip: string; speed: number }> = {
  inactive:   { clip: "greyscale-idle", speed: 0.5 },
  idle:       { clip: "idle", speed: 1 },
  active:     { clip: "work", speed: 1 },
  busy:       { clip: "work", speed: 1.5 },
  error:      { clip: "error-flash", speed: 1 },
  terminated: { clip: "greyscale-idle", speed: 0 },
};

const WALK_SPEED = 80; // pixels per second

const ROLE_COLORS: Record<string, number> = {
  orchestrator: 0xff7043,
  implementer:  0x66bb6a,
  researcher:   0xab47bc,
  reviewer:     0x42a5f5,
  validator:    0xef5350,
};

// ── Agent State ───────────────────────────────────────────────────────────────

interface AgentSpriteState {
  container: Container;
  sprite: Sprite;
  nameLabel: PixiText;
  statusLabel: PixiText;
  /** Current screen position */
  x: number;
  y: number;
  /** Target screen position (for walking) */
  targetX: number;
  targetY: number;
  /** Is currently walking? */
  walking: boolean;
  /** Current animation clip name */
  clipName: string;
  /** Current frame index */
  frame: number;
  /** Time accumulator for frame advance */
  elapsed: number;
  /** Speed multiplier */
  speed: number;
  /** Agent role (for texture selection) */
  role: string;
  /** Agent status */
  status: AgentStatus;
  /** All frame textures for this role's sprite sheet */
  frameTextures: Texture[][];  // [row][col]
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class AgentSpriteManager {
  private agents: Map<string, AgentSpriteState> = new Map();
  private parentContainer: Container;
  private texturesLoaded: Map<string, Texture[][]> = new Map();

  constructor(parent: Container) {
    this.parentContainer = parent;
  }

  /** Load a sprite sheet texture and slice into frame textures */
  async loadRoleTexture(role: string): Promise<Texture[][]> {
    if (this.texturesLoaded.has(role)) return this.texturesLoaded.get(role)!;

    const path = `/sprites/agent-${role}.png`;
    const baseTexture = await Assets.load(path);

    const frames: Texture[][] = [];
    for (let row = 0; row < ROWS; row++) {
      const rowFrames: Texture[] = [];
      for (let col = 0; col < COLS; col++) {
        const frame = new Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
        rowFrames.push(new Texture({ source: baseTexture.source, frame }));
      }
      frames.push(rowFrames);
    }

    this.texturesLoaded.set(role, frames);
    return frames;
  }

  /** Create or update an agent sprite */
  async setAgent(
    agentId: string,
    role: string,
    name: string,
    status: AgentStatus,
    targetX: number,
    targetY: number,
  ): Promise<void> {
    let state = this.agents.get(agentId);

    if (!state) {
      // Create new agent
      const frameTextures = await this.loadRoleTexture(role);
      const container = new Container();
      const sprite = new Sprite(frameTextures[0][0]);
      sprite.anchor.set(0.5, 0.8); // anchor near feet
      sprite.scale.set(1.2); // slightly larger for visibility

      const color = ROLE_COLORS[role] ?? 0x888888;

      const nameLabel = new PixiText({
        text: name,
        style: new TextStyle({
          fontFamily: "Courier New, monospace",
          fontSize: 10,
          fill: color,
          align: "center",
          letterSpacing: 1,
        }),
      });
      nameLabel.anchor.set(0.5, 0);
      nameLabel.position.set(0, 28);

      const statusLabel = new PixiText({
        text: status.toUpperCase(),
        style: new TextStyle({
          fontFamily: "Courier New, monospace",
          fontSize: 8,
          fill: 0x666677,
          align: "center",
        }),
      });
      statusLabel.anchor.set(0.5, 0);
      statusLabel.position.set(0, 40);

      container.addChild(sprite);
      container.addChild(nameLabel);
      container.addChild(statusLabel);
      this.parentContainer.addChild(container);

      state = {
        container,
        sprite,
        nameLabel,
        statusLabel,
        x: targetX,
        y: targetY,
        targetX,
        targetY,
        walking: false,
        clipName: "idle",
        frame: 0,
        elapsed: 0,
        speed: 1,
        role,
        status,
        frameTextures,
      };
      container.position.set(targetX, targetY);
      this.agents.set(agentId, state);
    }

    // Update target and status
    const prevTarget = { x: state.targetX, y: state.targetY };
    state.targetX = targetX;
    state.targetY = targetY;
    state.status = status;

    // If target changed, start walking
    const dx = targetX - state.x;
    const dy = targetY - state.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      state.walking = true;
    }

    // Update animation based on status
    const anim = STATUS_ANIM[status] ?? STATUS_ANIM.idle;
    if (!state.walking) {
      state.clipName = anim.clip;
      state.speed = anim.speed;
    }

    // Update status label
    state.statusLabel.text = status.toUpperCase();
    state.statusLabel.style.fill = status === "error" ? 0xff4444 : 0x666677;

    // Update opacity
    const opacity = status === "terminated" ? 0.25 : status === "inactive" ? 0.5 : 1;
    state.container.alpha = opacity;
  }

  /** Tick — advance animations and walking */
  tick(dt: number): void {
    for (const [, state] of this.agents) {
      // Walking interpolation
      if (state.walking) {
        const dx = state.targetX - state.x;
        const dy = state.targetY - state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
          // Arrived
          state.x = state.targetX;
          state.y = state.targetY;
          state.walking = false;
          // Switch back to status animation
          const anim = STATUS_ANIM[state.status] ?? STATUS_ANIM.idle;
          state.clipName = anim.clip;
          state.speed = anim.speed;
          state.frame = 0;
          state.elapsed = 0;
        } else {
          // Move toward target
          const step = WALK_SPEED * dt;
          const ratio = Math.min(step / dist, 1);
          state.x += dx * ratio;
          state.y += dy * ratio;
          state.clipName = "walk";
          state.speed = 1;
        }

        state.container.position.set(state.x, state.y);
      }

      // Frame animation
      const clip = CLIPS[state.clipName];
      if (!clip || state.speed === 0) continue;

      const effectiveFps = clip.fps * state.speed;
      if (effectiveFps <= 0) continue;

      state.elapsed += dt;
      const frameDur = 1 / effectiveFps;

      if (state.elapsed >= frameDur) {
        state.elapsed -= frameDur;
        if (state.elapsed >= frameDur) state.elapsed = 0; // clamp

        const nextFrame = state.frame + 1;
        if (nextFrame >= clip.frames) {
          state.frame = clip.loop ? 0 : clip.frames - 1;
        } else {
          state.frame = nextFrame;
        }
      }

      // Update sprite texture
      const col = clip.startCol + state.frame;
      const row = clip.row;
      if (state.frameTextures[row]?.[col]) {
        state.sprite.texture = state.frameTextures[row][col];
      }
    }
  }

  /** Remove all agents */
  clear(): void {
    for (const [, state] of this.agents) {
      this.parentContainer.removeChild(state.container);
      state.container.destroy({ children: true });
    }
    this.agents.clear();
  }

  destroy(): void {
    this.clear();
    this.texturesLoaded.clear();
  }
}
