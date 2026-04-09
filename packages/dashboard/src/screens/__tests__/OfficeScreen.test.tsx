import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OfficeScreen } from '../OfficeScreen';

// ── Component / data mocks ─────────────────────────────────────────────────

vi.mock('../../components/PixelOffice.js', () => ({
  PixelOffice: ({ agents, tasks, events }: { agents: unknown[]; tasks: unknown[]; events: unknown[] }) => (
    <div
      data-testid="pixel-office"
      data-agents={agents.length}
      data-tasks={tasks.length}
      data-events={events.length}
    />
  ),
}));

vi.mock('../../demo-data.js', () => ({
  demoAgents: [{ id: 'agent-1' }],
  demoTasks: [{ id: 'task-1' }],
  demoEvents: [{ id: 'event-1' }],
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OfficeScreen', () => {
  it('mounts without errors', () => {
    const { getByTestId } = render(<OfficeScreen />);
    expect(getByTestId('pixel-office')).toBeInTheDocument();
  });
});
