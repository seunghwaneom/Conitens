import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRunsStore } from '../runs-store';
import type {
  ForwardBridgeConfig,
  ForwardRunSummary,
  ForwardRunDetailResponse,
} from '../../forward-bridge-types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../forward-bridge.js', () => ({
  forwardGet: vi.fn(),
  parseRunsResponse: vi.fn(),
  parseRunDetailResponse: vi.fn(),
}));

import { forwardGet } from '../../forward-bridge.js';

const mockForwardGet = vi.mocked(forwardGet);

// ── Fixtures ───────────────────────────────────────────────────────────────

const config: ForwardBridgeConfig = { apiRoot: 'http://localhost:3000', token: 'test-token' };

const runSummary: ForwardRunSummary = {
  run_id: 'run-1',
  status: 'active',
  user_request: 'do the thing',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T01:00:00Z',
  latest_iteration_id: 'iter-1',
  latest_iteration_status: 'running',
  counts: {
    iterations: 1,
    validator_results: 0,
    approvals: 0,
    rooms: 1,
    messages: 5,
    tool_events: 2,
    insights: 0,
    handoff_packets: 0,
  },
};

const runDetail: ForwardRunDetailResponse = {
  run: {
    run_id: 'run-1',
    status: 'active',
    user_request: 'do the thing',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T01:00:00Z',
    current_iteration: 1,
    stop_reason: null,
  },
  iterations: [
    { iteration_id: 'iter-1', status: 'running', objective: 'step 1', seq_no: 1 },
  ],
  latest_iteration: { iteration_id: 'iter-1', status: 'running', objective: 'step 1', seq_no: 1 },
  task_plan: null,
  counts: {
    iterations: 1,
    validator_results: 0,
    approvals: 0,
    rooms: 1,
    messages: 5,
    tool_events: 2,
    insights: 0,
    handoff_packets: 0,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function resetStore() {
  useRunsStore.setState({
    runs: [],
    listState: 'idle',
    selectedRunId: null,
    runDetail: null,
    detailState: 'idle',
    error: null,
    activeTab: 'operations',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useRunsStore — initial state', () => {
  beforeEach(resetStore);

  it('runs is an empty array', () => {
    expect(useRunsStore.getState().runs).toEqual([]);
  });

  it('listState is "idle"', () => {
    expect(useRunsStore.getState().listState).toBe('idle');
  });

  it('selectedRunId is null', () => {
    expect(useRunsStore.getState().selectedRunId).toBeNull();
  });

  it('runDetail is null', () => {
    expect(useRunsStore.getState().runDetail).toBeNull();
  });

  it('detailState is "idle"', () => {
    expect(useRunsStore.getState().detailState).toBe('idle');
  });

  it('error is null', () => {
    expect(useRunsStore.getState().error).toBeNull();
  });

  it('activeTab is "operations"', () => {
    expect(useRunsStore.getState().activeTab).toBe('operations');
  });
});

describe('useRunsStore — actions', () => {
  beforeEach(resetStore);

  it('setSelectedRunId updates selectedRunId', () => {
    useRunsStore.getState().setSelectedRunId('run-42');
    expect(useRunsStore.getState().selectedRunId).toBe('run-42');
  });

  it('setSelectedRunId accepts null', () => {
    useRunsStore.setState({ selectedRunId: 'run-1' });
    useRunsStore.getState().setSelectedRunId(null);
    expect(useRunsStore.getState().selectedRunId).toBeNull();
  });

  it('setActiveTab updates activeTab to "intelligence"', () => {
    useRunsStore.getState().setActiveTab('intelligence');
    expect(useRunsStore.getState().activeTab).toBe('intelligence');
  });

  it('setActiveTab updates activeTab to "data"', () => {
    useRunsStore.getState().setActiveTab('data');
    expect(useRunsStore.getState().activeTab).toBe('data');
  });

  it('clearError sets error to null', () => {
    useRunsStore.setState({ error: 'something went wrong' });
    useRunsStore.getState().clearError();
    expect(useRunsStore.getState().error).toBeNull();
  });
});

describe('useRunsStore — fetchRuns', () => {
  beforeEach(() => {
    resetStore();
    mockForwardGet.mockReset();
  });

  it('sets listState to "loading" during fetch', async () => {
    let resolvePromise!: (value: { runs: ForwardRunSummary[] }) => void;
    mockForwardGet.mockReturnValueOnce(
      new Promise<{ runs: ForwardRunSummary[] }>((res) => { resolvePromise = res; }),
    );

    const promise = useRunsStore.getState().fetchRuns(config);
    expect(useRunsStore.getState().listState).toBe('loading');

    resolvePromise({ runs: [] });
    await promise;
  });

  it('clears error when fetch starts', async () => {
    useRunsStore.setState({ error: 'old error' });
    mockForwardGet.mockResolvedValueOnce({ runs: [runSummary] });

    await useRunsStore.getState().fetchRuns(config);
    expect(useRunsStore.getState().error).toBeNull();
  });

  it('on success: sets runs and listState to "ready"', async () => {
    mockForwardGet.mockResolvedValueOnce({ runs: [runSummary] });

    await useRunsStore.getState().fetchRuns(config);

    const state = useRunsStore.getState();
    expect(state.listState).toBe('ready');
    expect(state.runs).toEqual([runSummary]);
    expect(state.error).toBeNull();
  });

  it('on success with filters: calls forwardGet with query string', async () => {
    mockForwardGet.mockResolvedValueOnce({ runs: [] });

    await useRunsStore.getState().fetchRuns(config, { status: 'active' });

    expect(mockForwardGet).toHaveBeenCalledWith(
      config,
      '/runs?status=active',
      expect.any(Function),
    );
  });

  it('on success without filters: calls forwardGet without query string', async () => {
    mockForwardGet.mockResolvedValueOnce({ runs: [] });

    await useRunsStore.getState().fetchRuns(config);

    expect(mockForwardGet).toHaveBeenCalledWith(
      config,
      '/runs',
      expect.any(Function),
    );
  });

  it('on error: sets listState to "error" and populates error message', async () => {
    mockForwardGet.mockRejectedValueOnce(new Error('network failure'));

    await useRunsStore.getState().fetchRuns(config);

    const state = useRunsStore.getState();
    expect(state.listState).toBe('error');
    expect(state.error).toBe('network failure');
  });

  it('on non-Error rejection: sets generic error message', async () => {
    mockForwardGet.mockRejectedValueOnce('unknown failure');

    await useRunsStore.getState().fetchRuns(config);

    expect(useRunsStore.getState().error).toBe('Failed to fetch runs');
  });
});

describe('useRunsStore — fetchRunDetail', () => {
  beforeEach(() => {
    resetStore();
    mockForwardGet.mockReset();
  });

  it('sets detailState to "loading" during fetch', async () => {
    let resolvePromise!: (value: ForwardRunDetailResponse) => void;
    mockForwardGet.mockReturnValueOnce(
      new Promise<ForwardRunDetailResponse>((res) => { resolvePromise = res; }),
    );

    const promise = useRunsStore.getState().fetchRunDetail(config, 'run-1');
    expect(useRunsStore.getState().detailState).toBe('loading');

    resolvePromise(runDetail);
    await promise;
  });

  it('clears error when fetch starts', async () => {
    useRunsStore.setState({ error: 'old error' });
    mockForwardGet.mockResolvedValueOnce(runDetail);

    await useRunsStore.getState().fetchRunDetail(config, 'run-1');
    expect(useRunsStore.getState().error).toBeNull();
  });

  it('on success: sets runDetail and detailState to "ready"', async () => {
    mockForwardGet.mockResolvedValueOnce(runDetail);

    await useRunsStore.getState().fetchRunDetail(config, 'run-1');

    const state = useRunsStore.getState();
    expect(state.detailState).toBe('ready');
    expect(state.runDetail).toEqual(runDetail);
    expect(state.error).toBeNull();
  });

  it('on success: calls forwardGet with URL-encoded run ID', async () => {
    mockForwardGet.mockResolvedValueOnce(runDetail);

    await useRunsStore.getState().fetchRunDetail(config, 'run/with/slashes');

    expect(mockForwardGet).toHaveBeenCalledWith(
      config,
      '/runs/run%2Fwith%2Fslashes',
      expect.any(Function),
    );
  });

  it('on error: sets detailState to "error" and populates error message', async () => {
    mockForwardGet.mockRejectedValueOnce(new Error('not found'));

    await useRunsStore.getState().fetchRunDetail(config, 'run-1');

    const state = useRunsStore.getState();
    expect(state.detailState).toBe('error');
    expect(state.error).toBe('not found');
  });

  it('on non-Error rejection: sets generic error message', async () => {
    mockForwardGet.mockRejectedValueOnce('unknown');

    await useRunsStore.getState().fetchRunDetail(config, 'run-1');

    expect(useRunsStore.getState().error).toBe('Failed to fetch run detail');
  });
});
