import { useEffect, useState } from "react";
import {
  forwardGetOperatorAgents,
  forwardGetOperatorInbox,
  forwardGetOperatorSummary,
  forwardGetOperatorWakeReadiness,
  type ForwardBridgeConfig,
  type ForwardOperatorAgentsResponse,
  type ForwardOperatorInboxResponse,
  type ForwardOperatorSummaryResponse,
  type ForwardOperatorWakeReadinessResponse,
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
