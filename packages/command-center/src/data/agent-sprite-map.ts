/**
 * agent-sprite-map.ts — Per-role sprite sheet configuration map.
 *
 * Provides a `createSpriteConfig` helper that stamps out a SpriteSheetConfig
 * for any agent role, and the pre-built `AGENT_SPRITE_MAP` record that maps
 * all five AgentRole values to their corresponding sprite sheet configs.
 *
 * Each role resolves to `/sprites/agent-{role}.png` and shares the canonical
 * BASE_SPRITE_SHEET animation clip layout (8 cols × 5 rows, 48×48 per frame).
 */

import type { AgentRole } from './agents';
import type { SpriteSheetConfig } from './sprite-sheet-config';
import { BASE_SPRITE_SHEET } from './sprite-sheet-config';

// ── Helper ──────────────────────────────────────────────────────────────────

/**
 * Creates a `SpriteSheetConfig` for a given agent role by cloning the
 * `BASE_SPRITE_SHEET` layout and pointing `sheetPath` to the role-specific
 * sprite image at `/sprites/agent-{role}.png`.
 *
 * @param role - One of the five canonical AgentRole values.
 * @returns A fully-configured SpriteSheetConfig for the role.
 */
export function createSpriteConfig(role: AgentRole): SpriteSheetConfig {
  return {
    ...BASE_SPRITE_SHEET,
    sheetPath: `/sprites/agent-${role}.png`,
  };
}

// ── Agent Sprite Map ────────────────────────────────────────────────────────

/**
 * Pre-built record mapping every `AgentRole` to its `SpriteSheetConfig`.
 *
 * - orchestrator → `/sprites/agent-orchestrator.png`
 * - implementer  → `/sprites/agent-implementer.png`
 * - researcher   → `/sprites/agent-researcher.png`
 * - reviewer     → `/sprites/agent-reviewer.png`
 * - validator    → `/sprites/agent-validator.png`
 *
 * All entries share the same grid layout and animation clips from
 * `BASE_SPRITE_SHEET`; only the `sheetPath` differs.
 */
export const AGENT_SPRITE_MAP: Record<AgentRole, SpriteSheetConfig> = {
  orchestrator: createSpriteConfig('orchestrator'),
  implementer:  createSpriteConfig('implementer'),
  researcher:   createSpriteConfig('researcher'),
  reviewer:     createSpriteConfig('reviewer'),
  validator:    createSpriteConfig('validator'),
} as const;
