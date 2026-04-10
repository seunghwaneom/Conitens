import { useEffect, useMemo, useState } from "react";
import {
  forwardGet,
  parseRunDetailResponse,
  parseRunsResponse,
  type ForwardBridgeConfig,
  type ForwardRunDetailResponse,
  type ForwardRunSummary,
} from "../forward-bridge.js";
import { toRunDetailViewModel, toRunListItemViewModel } from "../forward-view-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useRunsData(
  config: ForwardBridgeConfig,
  liveRevision: number,
  routeRunId: string | null = null,
) {
  const [runs, setRuns] = useState<ForwardRunSummary[]>([]);
  const [listState, setListState] = useState<PanelState>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detailResponse, setDetailResponse] = useState<ForwardRunDetailResponse | null>(null);
  const [detailState, setDetailState] = useState<PanelState>("idle");
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.token.trim()) {
      setRuns([]);
      setSelectedRunId(null);
      setListState("idle");
      setListError(null);
      return;
    }

    let cancelled = false;
    setListState("loading");
    setListError(null);
    forwardGet(config, "/runs", parseRunsResponse)
      .then((payload) => {
        if (cancelled) return;
        setRuns(payload.runs);
        setListState("ready");
        setSelectedRunId((current) =>
          current && payload.runs.some((run) => run.run_id === current)
            ? current
            : payload.runs[0]?.run_id ?? null,
        );
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setRuns([]);
        setSelectedRunId(null);
        setListState("error");
        setListError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, liveRevision]);

  useEffect(() => {
    if (routeRunId && routeRunId !== selectedRunId) {
      setSelectedRunId(routeRunId);
    }
  }, [routeRunId, selectedRunId]);

  useEffect(() => {
    if (!config.token.trim() || !selectedRunId) {
      setDetailResponse(null);
      setDetailState("idle");
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailState("loading");
    setDetailError(null);
    forwardGet(
      config,
      `/runs/${encodeURIComponent(selectedRunId)}`,
      parseRunDetailResponse,
    )
      .then((payload) => {
        if (cancelled) return;
        setDetailResponse(payload);
        setDetailState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailResponse(null);
        setDetailState("error");
        setDetailError(toErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [config, selectedRunId, liveRevision]);

  const runItems = useMemo(
    () => runs.map(toRunListItemViewModel),
    [runs],
  );
  const detail = useMemo(
    () => (detailResponse ? toRunDetailViewModel(detailResponse) : null),
    [detailResponse],
  );

  return {
    runs,
    runItems,
    listState,
    listError,
    selectedRunId,
    setSelectedRunId,
    detail,
    detailState,
    detailError,
  };
}
