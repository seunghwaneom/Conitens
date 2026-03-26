import { describe, it, expect } from 'vitest';
import {
  STATUS_ANIMATION_MAP,
  type AgentStatus,
  type StatusAnimationEntry,
} from '../sprite-animation-types';

describe('STATUS_ANIMATION_MAP', () => {
  const allStatuses: AgentStatus[] = [
    'inactive',
    'idle',
    'active',
    'busy',
    'error',
    'terminated',
  ];

  it('has an entry for every AgentStatus', () => {
    for (const status of allStatuses) {
      expect(STATUS_ANIMATION_MAP[status]).toBeDefined();
    }
  });

  it('maps inactive → greyscale-idle at 0.5× speed', () => {
    const entry: StatusAnimationEntry = STATUS_ANIMATION_MAP.inactive;
    expect(entry.animation).toBe('greyscale-idle');
    expect(entry.speedMultiplier).toBe(0.5);
  });

  it('maps idle → idle at 1× speed', () => {
    const entry = STATUS_ANIMATION_MAP.idle;
    expect(entry.animation).toBe('idle');
    expect(entry.speedMultiplier).toBe(1);
  });

  it('maps active → work at 1× speed', () => {
    const entry = STATUS_ANIMATION_MAP.active;
    expect(entry.animation).toBe('work');
    expect(entry.speedMultiplier).toBe(1);
  });

  it('maps busy → work at 1.5× speed', () => {
    const entry = STATUS_ANIMATION_MAP.busy;
    expect(entry.animation).toBe('work');
    expect(entry.speedMultiplier).toBe(1.5);
  });

  it('maps error → error-flash at 1× speed', () => {
    const entry = STATUS_ANIMATION_MAP.error;
    expect(entry.animation).toBe('error-flash');
    expect(entry.speedMultiplier).toBe(1);
  });

  it('maps terminated → greyscale-idle at 0× speed (frozen)', () => {
    const entry = STATUS_ANIMATION_MAP.terminated;
    expect(entry.animation).toBe('greyscale-idle');
    expect(entry.speedMultiplier).toBe(0);
  });

  it('has exactly 6 entries', () => {
    expect(Object.keys(STATUS_ANIMATION_MAP)).toHaveLength(6);
  });
});
