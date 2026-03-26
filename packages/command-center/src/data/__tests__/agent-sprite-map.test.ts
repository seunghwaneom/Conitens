import { describe, it, expect } from 'vitest';
import { createSpriteConfig, AGENT_SPRITE_MAP } from '../agent-sprite-map';
import { BASE_SPRITE_SHEET } from '../sprite-sheet-config';
import type { AgentRole } from '../agents';

const ALL_ROLES: AgentRole[] = [
  'orchestrator',
  'implementer',
  'researcher',
  'reviewer',
  'validator',
];

describe('createSpriteConfig', () => {
  it('returns a SpriteSheetConfig with the correct sheetPath for the role', () => {
    const config = createSpriteConfig('orchestrator');
    expect(config.sheetPath).toBe('/sprites/agent-orchestrator.png');
  });

  it('preserves BASE_SPRITE_SHEET layout properties', () => {
    const config = createSpriteConfig('researcher');
    expect(config.frameWidth).toBe(48);
    expect(config.frameHeight).toBe(48);
    expect(config.columns).toBe(8);
    expect(config.rows).toBe(5);
  });

  it('includes all animation clips from BASE_SPRITE_SHEET', () => {
    const config = createSpriteConfig('reviewer');
    expect(Object.keys(config.animations)).toEqual(
      Object.keys(BASE_SPRITE_SHEET.animations),
    );
    expect(config.animations).toEqual(BASE_SPRITE_SHEET.animations);
  });
});

describe('AGENT_SPRITE_MAP', () => {
  it('has entries for all 5 agent roles', () => {
    expect(Object.keys(AGENT_SPRITE_MAP).sort()).toEqual([...ALL_ROLES].sort());
  });

  it.each(ALL_ROLES)(
    'maps "%s" to /sprites/agent-%s.png',
    (role) => {
      const config = AGENT_SPRITE_MAP[role];
      expect(config.sheetPath).toBe(`/sprites/agent-${role}.png`);
    },
  );

  it.each(ALL_ROLES)(
    '"%s" entry shares BASE_SPRITE_SHEET animations',
    (role) => {
      expect(AGENT_SPRITE_MAP[role].animations).toEqual(
        BASE_SPRITE_SHEET.animations,
      );
    },
  );

  it.each(ALL_ROLES)(
    '"%s" entry has 48×48 frame size and 8×5 grid',
    (role) => {
      const c = AGENT_SPRITE_MAP[role];
      expect(c.frameWidth).toBe(48);
      expect(c.frameHeight).toBe(48);
      expect(c.columns).toBe(8);
      expect(c.rows).toBe(5);
    },
  );
});
