import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  forwardGetOperatorWorkspace,
  forwardGetOperatorWorkspaces,
  type ForwardBridgeConfig,
  type ForwardOperatorWorkspaceDetailResponse,
  type ForwardOperatorWorkspacesResponse,
} from "../forward-bridge.js";
import { type LoadState } from "./use-operator-screen-data.js";

/**
 * Operator workspace data hooks extracted verbatim from App.tsx. Unlike the
 * read-only screen-data hooks, these expose their raw setData setter because a
 * refresh flow (refreshWorkspacesAndSelection) writes the data imperatively
 * after a mutation, mirroring how use-run-detail-data.ts exposes
 * setSelectedRoomId. Gating conditions, cancel guards, and dependency arrays are
 * preserved exactly from the original inline effects.
 */
interface WorkspacesDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  screen: string;
  liveRevision: number;
}

export function useOperatorWorkspacesData({
  config,
  isOfficePreview,
  screen,
  liveRevision,
}: WorkspacesDataDeps): {
  data: ForwardOperatorWorkspacesResponse | null;
  state: LoadState;
  error: string | null;
  setData: Dispatch<SetStateAction<ForwardOperatorWorkspacesResponse | null>>;
} {
  const [data, setData] = useState<ForwardOperatorWorkspacesResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      isOfficePreview ||
      !config.token.trim() ||
      (
        screen !== "workspaces" &&
        screen !== "workspace-detail" &&
        screen !== "tasks" &&
        screen !== "task-detail"
      )
    ) {
      setData(null);
      setState("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setError(null);
    forwardGetOperatorWorkspaces(config)
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

  return { data, state, error, setData };
}

interface WorkspaceDetailDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  screen: string;
  workspaceId: string | null;
}

export function useOperatorWorkspaceDetailData({
  config,
  isOfficePreview,
  screen,
  workspaceId,
}: WorkspaceDetailDataDeps): {
  data: ForwardOperatorWorkspaceDetailResponse | null;
  state: LoadState;
  error: string | null;
  setData: Dispatch<SetStateAction<ForwardOperatorWorkspaceDetailResponse | null>>;
} {
  const [data, setData] = useState<ForwardOperatorWorkspaceDetailResponse | null>(null);
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
    forwardGetOperatorWorkspace(config, workspaceId)
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
  }, [config, isOfficePreview, screen, workspaceId]);

  return { data, state, error, setData };
}
