import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  forwardGet,
  parseContextLatestResponse,
  parseReplayResponse,
  parseRoomTimelineResponse,
  parseRunDetailResponse,
  parseStateDocsResponse,
  type ForwardBridgeConfig,
  type ForwardContextLatestResponse,
  type ForwardReplayResponse,
  type ForwardRoomTimelineResponse,
  type ForwardRunDetailResponse,
  type ForwardStateDocsResponse,
} from "../forward-bridge.js";
import { extractRoomOptions, pickNextRoomId } from "../forward-view-model.js";
import { toErrorMessage } from "../utils.js";
import { type LoadState } from "./use-operator-screen-data.js";

interface RunDetailDataDeps {
  config: ForwardBridgeConfig;
  isOfficePreview: boolean;
  activeLinkedRunId: string | null;
  liveRevision: number;
  streamRevision: number;
}

interface RunDetailData {
  selectedRun: ForwardRunDetailResponse | null;
  replay: ForwardReplayResponse | null;
  stateDocs: ForwardStateDocsResponse | null;
  contextLatest: ForwardContextLatestResponse | null;
  roomTimeline: ForwardRoomTimelineResponse | null;
  selectedRoomId: string | null;
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>;
  detailState: LoadState;
  replayState: LoadState;
  stateDocsState: LoadState;
  contextState: LoadState;
  roomState: LoadState;
  detailError: string | null;
  replayError: string | null;
  stateDocsError: string | null;
  contextError: string | null;
  roomError: string | null;
}

/**
 * Run-detail data subsystem extracted verbatim from App.tsx. One effect fetches
 * detail/replay/state-docs/context in parallel (and seeds selectedRoomId from
 * the replay's room options); a second effect fetches the room timeline off the
 * selected room. selectedRoomId + setSelectedRoomId are exposed because the
 * render's room selector drives them. Gating conditions, cancel guards, and
 * dependency arrays are preserved exactly from the original inline effects.
 */
export function useRunDetailData({
  config,
  isOfficePreview,
  activeLinkedRunId,
  liveRevision,
  streamRevision,
}: RunDetailDataDeps): RunDetailData {
  const [selectedRun, setSelectedRun] = useState<ForwardRunDetailResponse | null>(null);
  const [replay, setReplay] = useState<ForwardReplayResponse | null>(null);
  const [stateDocs, setStateDocs] = useState<ForwardStateDocsResponse | null>(null);
  const [contextLatest, setContextLatest] = useState<ForwardContextLatestResponse | null>(null);
  const [roomTimeline, setRoomTimeline] = useState<ForwardRoomTimelineResponse | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [replayState, setReplayState] = useState<LoadState>("idle");
  const [stateDocsState, setStateDocsState] = useState<LoadState>("idle");
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [roomState, setRoomState] = useState<LoadState>("idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [stateDocsError, setStateDocsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || !activeLinkedRunId) {
      setSelectedRun(null);
      setReplay(null);
      setStateDocs(null);
      setContextLatest(null);
      setRoomTimeline(null);
      setSelectedRoomId(null);
      setDetailState("idle");
      setReplayState("idle");
      setStateDocsState("idle");
      setContextState("idle");
      setRoomState("idle");
      setDetailError(null);
      setReplayError(null);
      setStateDocsError(null);
      setContextError(null);
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setDetailState("loading");
    setReplayState("loading");
    setStateDocsState("loading");
    setContextState("loading");
    setRoomState("idle");
    setDetailError(null);
    setReplayError(null);
    setStateDocsError(null);
    setContextError(null);
    setRoomError(null);
    Promise.allSettled([
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}`, parseRunDetailResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/replay`, parseReplayResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/state-docs`, parseStateDocsResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/context-latest`, parseContextLatestResponse),
    ])
      .then(([detailResult, replayResult, stateDocsResult, contextResult]) => {
        if (cancelled) {
          return;
        }
        if (detailResult.status === "fulfilled") {
          setSelectedRun(detailResult.value);
          setDetailState("ready");
          setDetailError(null);
        } else {
          setSelectedRun(null);
          setDetailState("error");
          setDetailError(toErrorMessage(detailResult.reason));
        }

        if (replayResult.status === "fulfilled") {
          setReplay(replayResult.value);
          setReplayState("ready");
          setReplayError(null);
          const roomOptions = extractRoomOptions(replayResult.value);
          setSelectedRoomId((current) => pickNextRoomId(current, roomOptions));
        } else {
          setReplay(null);
          setReplayState("error");
          setReplayError(toErrorMessage(replayResult.reason));
          setRoomTimeline(null);
          setSelectedRoomId(null);
          setRoomState("idle");
          setRoomError(null);
        }

        if (stateDocsResult.status === "fulfilled") {
          setStateDocs(stateDocsResult.value);
          setStateDocsState("ready");
          setStateDocsError(null);
        } else {
          setStateDocs(null);
          setStateDocsState("error");
          setStateDocsError(toErrorMessage(stateDocsResult.reason));
        }

        if (contextResult.status === "fulfilled") {
          setContextLatest(contextResult.value);
          setContextState("ready");
          setContextError(null);
        } else {
          setContextLatest(null);
          setContextState("error");
          setContextError(toErrorMessage(contextResult.reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeLinkedRunId, config, liveRevision, streamRevision, isOfficePreview]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || !selectedRoomId) {
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
        if (cancelled) {
          return;
        }
        setRoomTimeline(payload);
        setRoomState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setRoomTimeline(null);
        setRoomState("error");
        setRoomError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedRoomId, isOfficePreview, liveRevision, streamRevision]);

  return {
    selectedRun,
    replay,
    stateDocs,
    contextLatest,
    roomTimeline,
    selectedRoomId,
    setSelectedRoomId,
    detailState,
    replayState,
    stateDocsState,
    contextState,
    roomState,
    detailError,
    replayError,
    stateDocsError,
    contextError,
    roomError,
  };
}
