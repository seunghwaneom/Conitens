import { useEffect, useState } from "react";
import {
  forwardGet,
  forwardGetOperatorAgents,
  forwardGetOperatorInbox,
  forwardGetOperatorSummary,
  forwardGetOperatorTaskReconcilePreview,
  forwardGetOperatorTasks,
  forwardGetOperatorWakeReadiness,
  parseRunsResponse,
  type ForwardBridgeConfig,
  type ForwardOperatorAgentsResponse,
  type ForwardOperatorInboxResponse,
  type ForwardOperatorSummaryResponse,
  type ForwardOperatorTaskReconcilePreviewResponse,
  type ForwardOperatorTasksResponse,
  type ForwardOperatorWakeReadinessResponse,
  type ForwardRunSummary,
} from "../forward-bridge.js";

/** Async load lifecycle shared by every forward data surface. */
export type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Read-only screen data hooks extracted verbatim from App.tsx. Each owns its
 * own {data, state, error} triple and fetches when its screen is active and a
 * live bridge token is present. The gating conditions, cancel guards, and
 * dependency arrays are preserved exactly from the original inline effects.
 */
interface ScreenDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  screen: string;
  liveRevision: number;
}

export function useOperatorSummaryData({
  config,
  isOfficePreview,
  screen,
  liveRevision,
}: ScreenDataDeps): {
  data: ForwardOperatorSummaryResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorSummaryResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || screen !== "overview" || !config.token.trim()) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorSummary(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, liveRevision]);

  return { data, state, error };
}

export function useOperatorWakeReadinessData({
  config,
  isOfficePreview,
  screen,
  liveRevision,
}: ScreenDataDeps): {
  data: ForwardOperatorWakeReadinessResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorWakeReadinessResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || screen !== "overview" || !config.token.trim()) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorWakeReadiness(config, { limit: 12 })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, liveRevision]);

  return { data, state, error };
}

export function useOperatorAgentsData({
  config,
  isOfficePreview,
  screen,
  liveRevision,
}: ScreenDataDeps): {
  data: ForwardOperatorAgentsResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorAgentsResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || screen !== "agents" || !config.token.trim()) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorAgents(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, liveRevision]);

  return { data, state, error };
}

export function useOperatorInboxData({
  config,
  isOfficePreview,
  screen,
  liveRevision,
}: ScreenDataDeps): {
  data: ForwardOperatorInboxResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorInboxResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || screen !== "inbox" || !config.token.trim()) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorInbox(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, liveRevision]);

  return { data, state, error };
}

interface TaskDetailDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  screen: string;
  taskId: string | null;
  liveRevision: number;
}

export function useOperatorTaskReconcileData({
  config,
  isOfficePreview,
  screen,
  taskId,
  liveRevision,
}: TaskDetailDataDeps): {
  data: ForwardOperatorTaskReconcilePreviewResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorTaskReconcilePreviewResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || screen !== "task-detail" || !taskId) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    const activeTaskId = taskId;
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorTaskReconcilePreview(config, activeTaskId)
      .then((payload) => {
        if (cancelled || payload.task_id !== activeTaskId) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, taskId, liveRevision]);

  return { data, state, error };
}

interface WorkspaceDetailDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  screen: string;
  workspaceId: string | null;
  liveRevision: number;
}

export function useOperatorWorkspaceLinkedTasksData({
  config,
  isOfficePreview,
  screen,
  workspaceId,
  liveRevision,
}: WorkspaceDetailDataDeps): {
  data: ForwardOperatorTasksResponse | null;
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardOperatorTasksResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || screen !== "workspace-detail" || !workspaceId) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorTasks(config, { workspaceRef: workspaceId, includeArchived: true })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setData(null);
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, screen, workspaceId, liveRevision]);

  return { data, state, error };
}

interface RunsDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  liveRevision: number;
}

export function useRunsData({ config, isOfficePreview, liveRevision }: RunsDataDeps): {
  data: ForwardRunSummary[];
  state: LoadState;
  error: string | null;
} {
  const [data, setData] = useState<ForwardRunSummary[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim()) {
      setData([]);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGet(config, "/runs", parseRunsResponse)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload.runs);
        setState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, liveRevision]);

  return { data, state, error };
}
