import { useEffect, useMemo, useState } from "react";
import {
  forwardGet,
  parseReplayResponse,
  parseStateDocsResponse,
  parseContextLatestResponse,
  parseRoomTimelineResponse,
  type ForwardBridgeConfig,
  type ForwardRunDetailResponse,
  type ForwardReplayResponse,
  type ForwardStateDocsResponse,
  type ForwardContextLatestResponse,
  type ForwardRoomTimelineResponse,
} from "../forward-bridge.js";
import {
  toInsightCardViewModels,
  summarizeFindingsDocument,
  summarizeValidatorCorrelations,
  extractRoomOptions,
  pickNextRoomId,
  type RoomOptionViewModel,
  type InsightCardViewModel,
} from "../forward-view-model.js";
import { deriveForwardGraphModel } from "../forward-graph.js";

type LoadState = "idle" | "loading" | "ready" | "error";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface UseRunSubPanelsResult {
  replay: ForwardReplayResponse | null;
  stateDocs: ForwardStateDocsResponse | null;
  contextLatest: ForwardContextLatestResponse | null;
  roomTimeline: ForwardRoomTimelineResponse | null;
  selectedRoomId: string | null;
  setSelectedRoomId: (id: string | null) => void;
  replayState: LoadState;
  stateDocsState: LoadState;
  contextState: LoadState;
  roomState: LoadState;
  replayError: string | null;
  stateDocsError: string | null;
  contextError: string | null;
  roomError: string | null;
  roomOptions: RoomOptionViewModel[];
  graphModel: ReturnType<typeof deriveForwardGraphModel> | null;
  insightCards: InsightCardViewModel[];
  findingsSummary: string;
  validatorCorrelations: string[];
}

export function useRunSubPanels(
  config: ForwardBridgeConfig,
  runId: string | null,
  runDetail: ForwardRunDetailResponse | null,
  liveRevision: number,
): UseRunSubPanelsResult {
  const [replay, setReplay] = useState<ForwardReplayResponse | null>(null);
  const [stateDocs, setStateDocs] = useState<ForwardStateDocsResponse | null>(null);
  const [contextLatest, setContextLatest] = useState<ForwardContextLatestResponse | null>(null);
  const [roomTimeline, setRoomTimeline] = useState<ForwardRoomTimelineResponse | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [replayState, setReplayState] = useState<LoadState>("idle");
  const [stateDocsState, setStateDocsState] = useState<LoadState>("idle");
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [roomState, setRoomState] = useState<LoadState>("idle");

  const [replayError, setReplayError] = useState<string | null>(null);
  const [stateDocsError, setStateDocsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  // ── Fetch replay / stateDocs / contextLatest ────────────────────────
  useEffect(() => {
    if (!config.token.trim() || !runId) {
      return;
    }

    let cancelled = false;
    setReplayState("loading");
    setStateDocsState("loading");
    setContextState("loading");
    setReplayError(null);
    setStateDocsError(null);
    setContextError(null);

    const encodedId = encodeURIComponent(runId);
    Promise.allSettled([
      forwardGet(config, `/runs/${encodedId}/replay`, parseReplayResponse),
      forwardGet(config, `/runs/${encodedId}/state-docs`, parseStateDocsResponse),
      forwardGet(config, `/runs/${encodedId}/context-latest`, parseContextLatestResponse),
    ]).then(([replayResult, stateDocsResult, contextResult]) => {
      if (cancelled) return;

      if (replayResult.status === "fulfilled") {
        setReplay(replayResult.value);
        setReplayState("ready");
      } else {
        setReplay(null);
        setReplayState("error");
        setReplayError(toErrorMessage(replayResult.reason));
      }

      if (stateDocsResult.status === "fulfilled") {
        setStateDocs(stateDocsResult.value);
        setStateDocsState("ready");
      } else {
        setStateDocs(null);
        setStateDocsState("error");
        setStateDocsError(toErrorMessage(stateDocsResult.reason));
      }

      if (contextResult.status === "fulfilled") {
        setContextLatest(contextResult.value);
        setContextState("ready");
      } else {
        setContextLatest(null);
        setContextState("error");
        setContextError(toErrorMessage(contextResult.reason));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config, runId, liveRevision]);

  // ── Room timeline fetch ─────────────────────────────────────────────
  useEffect(() => {
    if (!config.token.trim() || !selectedRoomId) {
      setRoomTimeline(null);
      setRoomState("idle");
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setRoomState("loading");
    setRoomError(null);
    forwardGet(config, `/rooms/${encodeURIComponent(selectedRoomId)}/timeline`, parseRoomTimelineResponse)
      .then((payload) => {
        if (cancelled) return;
        setRoomTimeline(payload);
        setRoomState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRoomTimeline(null);
        setRoomState("error");
        setRoomError(toErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedRoomId]);

  // ── Derived view models ─────────────────────────────────────────────
  const roomOptions = useMemo(
    () => (replay ? extractRoomOptions(replay) : []),
    [replay],
  );

  // Auto-select first room when options change
  useEffect(() => {
    setSelectedRoomId((current) => pickNextRoomId(current, roomOptions));
  }, [roomOptions]);

  const graphModel = useMemo(
    () => (runDetail && replay ? deriveForwardGraphModel(runDetail, replay, roomTimeline) : null),
    [runDetail, replay, roomTimeline],
  );

  const insightCards = useMemo(
    () => toInsightCardViewModels(replay, roomTimeline),
    [replay, roomTimeline],
  );

  const findingsSummary = useMemo(
    () => summarizeFindingsDocument(stateDocs),
    [stateDocs],
  );

  const validatorCorrelations = useMemo(
    () => summarizeValidatorCorrelations(replay),
    [replay],
  );

  return {
    replay,
    stateDocs,
    contextLatest,
    roomTimeline,
    selectedRoomId,
    setSelectedRoomId,
    replayState,
    stateDocsState,
    contextState,
    roomState,
    replayError,
    stateDocsError,
    contextError,
    roomError,
    roomOptions,
    graphModel,
    insightCards,
    findingsSummary,
    validatorCorrelations,
  };
}
