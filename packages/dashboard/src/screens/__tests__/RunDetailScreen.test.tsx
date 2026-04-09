import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mutable state (available inside vi.mock factories) ─────────────

const { uiState, runsState, dashboardState } = vi.hoisted(() => {
  const uiState: Record<string, unknown> = {
    route: { screen: 'run-detail', runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null },
    theme: 'dark',
  };
  const runsState: Record<string, unknown> = {
    runDetail: null,
    detailState: 'idle',
    error: null,
    fetchRunDetail: () => {},
    activeTab: 'operations',
    setActiveTab: () => {},
  };
  const dashboardState: Record<string, unknown> = {
    config: { apiRoot: 'http://localhost:3000', token: '' },
    liveRevision: 0,
  };
  return { uiState, runsState, dashboardState };
});

// ── Store mocks (selector-aware) ───────────────────────────────────────────

vi.mock('../../store/ui-store.js', () => ({
  useUiStore: (selector: (s: unknown) => unknown) => selector(uiState),
}));

vi.mock('../../store/runs-store.js', () => ({
  useRunsStore: (selector: (s: unknown) => unknown) => selector(runsState),
}));

vi.mock('../../store/dashboard-store.js', () => ({
  useDashboardStore: (selector: (s: unknown) => unknown) => selector(dashboardState),
}));

// ── Hook / component mocks ─────────────────────────────────────────────────

vi.mock('../../hooks/useRunSubPanels.js', () => ({
  useRunSubPanels: () => ({
    replay: null,
    stateDocs: null,
    contextLatest: null,
    roomTimeline: null,
    selectedRoomId: null,
    setSelectedRoomId: () => {},
    replayState: 'idle',
    stateDocsState: 'idle',
    contextState: 'idle',
    roomState: 'idle',
    replayError: null,
    stateDocsError: null,
    contextError: null,
    roomError: null,
    roomOptions: [],
    graphModel: null,
    insightCards: [],
    findingsSummary: '',
    validatorCorrelations: [],
  }),
}));

vi.mock('../../components/ForwardApprovalCenterPanel.js', () => ({
  ForwardApprovalCenterPanel: () => <div data-testid="approval-center" />,
}));

vi.mock('../../components/ForwardReplayPanel.js', () => ({
  ForwardReplayPanel: () => <div data-testid="replay-panel" />,
}));

vi.mock('../../components/ForwardGraphPanel.js', () => ({
  ForwardGraphPanel: () => <div data-testid="graph-panel" />,
}));

vi.mock('../../components/ForwardInsightsPanel.js', () => ({
  ForwardInsightsPanel: () => <div data-testid="insights-panel" />,
}));

vi.mock('../../components/ForwardStateDocsPanel.js', () => ({
  ForwardStateDocsPanel: () => <div data-testid="state-docs-panel" />,
}));

vi.mock('../../components/ForwardContextPanel.js', () => ({
  ForwardContextPanel: () => <div data-testid="context-panel" />,
}));

vi.mock('../../components/ForwardRoomPanel.js', () => ({
  ForwardRoomPanel: () => <div data-testid="room-panel" />,
}));

vi.mock('../../components/ErrorBoundary.js', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../forward-view-model.js', () => ({
  toRunDetailViewModel: () => null,
}));

// ── Import component after mocks ───────────────────────────────────────────

import { RunDetailScreen } from '../RunDetailScreen';

// ── Helpers ────────────────────────────────────────────────────────────────

function setupStores(overrides: {
  runId?: string | null;
  detailState?: string;
  error?: string | null;
} = {}) {
  const { runId = null, detailState = 'idle', error = null } = overrides;

  uiState['route'] = {
    screen: 'run-detail',
    runId,
    taskId: null,
    workspaceId: null,
    threadId: null,
    agentId: null,
  };

  runsState['runDetail'] = null;
  runsState['detailState'] = detailState;
  runsState['error'] = error;
  runsState['fetchRunDetail'] = () => {};
  runsState['activeTab'] = 'operations';
  runsState['setActiveTab'] = () => {};

  dashboardState['config'] = { apiRoot: 'http://localhost:3000', token: '' };
  dashboardState['liveRevision'] = 0;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RunDetailScreen', () => {
  beforeEach(() => {
    setupStores();
  });

  it('renders EmptyState when no runId', () => {
    setupStores({ runId: null });
    render(<RunDetailScreen />);
    expect(screen.getByText(/no run selected/i)).toBeInTheDocument();
  });

  it('renders LoadingState when detailState is loading', () => {
    setupStores({ runId: 'test-run', detailState: 'loading' });
    render(<RunDetailScreen />);
    expect(screen.getByText(/loading run detail/i)).toBeInTheDocument();
  });

  it('renders ErrorDisplay on error', () => {
    setupStores({ runId: 'test-run', detailState: 'error', error: 'Network failure' });
    render(<RunDetailScreen />);
    expect(screen.getByText(/network failure/i)).toBeInTheDocument();
  });
});
