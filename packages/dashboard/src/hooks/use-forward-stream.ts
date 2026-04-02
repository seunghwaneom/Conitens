import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  openForwardEventStream,
  parseStreamSnapshot,
  type ForwardEventStreamHandle,
  type ForwardBridgeConfig,
  type ForwardStreamSnapshot,
} from "../forward-bridge.js";

export type ForwardStreamStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error"
  | "reconnecting"
  | "failed";

const MAX_ATTEMPTS = 10;

function calcBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

export function useForwardStream({
  config,
  runId,
  roomId,
  enabled,
  onSnapshot,
}: {
  config: ForwardBridgeConfig;
  runId: string | null;
  roomId: string | null;
  enabled: boolean;
  onSnapshot: (snapshot: ForwardStreamSnapshot) => void;
}) {
  const [status, setStatus] = useState<ForwardStreamStatus>("idle");
  const dispatchSnapshot = useEffectEvent(onSnapshot);

  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !config.token.trim() || !runId) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    attemptRef.current = 0;
    const resolvedRunId: string = runId;

    function clearRetryTimer(): void {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }

    let source: ForwardEventStreamHandle | null = null;

    function connect(): void {
      if (disposed) return;

      if (attemptRef.current === 0) {
        setStatus("connecting");
      } else {
        setStatus("reconnecting");
      }

      openForwardEventStream(
        config,
        { runId: resolvedRunId, roomId: roomId || undefined },
        {
          onMessage: (event) => {
            if (disposed) return;
            if (event.event === "heartbeat") {
              setStatus("open");
              return;
            }
            if (event.event !== "snapshot") return;
            try {
              dispatchSnapshot(parseStreamSnapshot(JSON.parse(event.data)));
              setStatus("open");
            } catch {
              setStatus("error");
            }
          },
          onOpen: () => {
            if (disposed) return;
            attemptRef.current = 0;
            setStatus("open");
          },
          onError: () => {
            if (disposed) return;
            source?.close();
            source = null;

            const attempt = attemptRef.current;
            if (attempt >= MAX_ATTEMPTS) {
              setStatus("failed");
              return;
            }

            attemptRef.current = attempt + 1;
            setStatus("reconnecting");

            const delay = calcBackoffDelay(attempt);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              connect();
            }, delay);
          },
        },
      )
        .then((stream) => {
          if (disposed) {
            stream.close();
            return;
          }
          source = stream;
        })
        .catch(() => {
          if (disposed) return;

          const attempt = attemptRef.current;
          if (attempt >= MAX_ATTEMPTS) {
            setStatus("failed");
            return;
          }

          attemptRef.current = attempt + 1;
          setStatus("reconnecting");

          const delay = calcBackoffDelay(attempt);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            connect();
          }, delay);
        });
    }

    connect();

    return () => {
      disposed = true;
      clearRetryTimer();
      source?.close();
      setStatus("closed");
    };
  }, [config, enabled, roomId, runId]);

  return { status };
}
