import { useEffect, useEffectEvent, useState } from "react";
import {
  openForwardEventStream,
  parseStreamSnapshot,
  type ForwardEventStreamHandle,
  type ForwardBridgeConfig,
  type ForwardStreamSnapshot,
} from "../forward-bridge.js";

export type ForwardStreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

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

  useEffect(() => {
    if (!enabled || !config.token.trim() || !runId) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    setStatus("connecting");
    let source: ForwardEventStreamHandle | null = null;

    openForwardEventStream(
      config,
      { runId, roomId: roomId || undefined },
      {
        onMessage: (event) => {
          if (disposed) {
            return;
          }
          if (event.event === "heartbeat") {
            setStatus("open");
            return;
          }
          if (event.event !== "snapshot") {
            return;
          }
          try {
            dispatchSnapshot(parseStreamSnapshot(JSON.parse(event.data)));
            setStatus("open");
          } catch {
            setStatus("error");
          }
        },
        onOpen: () => {
          if (!disposed) {
            setStatus("open");
          }
        },
        onError: () => {
          if (!disposed) {
            setStatus("error");
          }
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
        if (!disposed) {
          setStatus("error");
        }
      });

    return () => {
      disposed = true;
      source?.close();
      setStatus("closed");
    };
  }, [config, enabled, roomId, runId]);

  return { status };
}
