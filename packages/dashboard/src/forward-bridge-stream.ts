import { parseForwardEventStreamChunk } from "./forward-bridge-parsers.ts";
import type {
  ForwardBridgeConfig,
  ForwardEventStreamHandle,
  ForwardStreamEventMessage,
} from "./forward-bridge-types.ts";

function normalizeApiRoot(apiRoot: string): string {
  return apiRoot.replace(/\/+$/, "");
}

export async function openForwardEventStream(
  config: ForwardBridgeConfig,
  filters: { runId?: string; roomId?: string } = {},
  handlers: {
    onMessage?: (message: ForwardStreamEventMessage) => void;
    onOpen?: () => void;
    onError?: (error: unknown) => void;
    onClose?: () => void;
  } = {},
): Promise<ForwardEventStreamHandle> {
  const search = new URLSearchParams();
  if (filters.runId) search.set("run_id", filters.runId);
  if (filters.roomId) search.set("room_id", filters.roomId);
  const controller = new AbortController();
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}/events/stream?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "text/event-stream",
    },
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  handlers.onOpen?.();

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const closed = (async () => {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          const parsed = parseForwardEventStreamChunk(buffer);
          for (const event of parsed.events) {
            handlers.onMessage?.(event);
          }
          handlers.onClose?.();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseForwardEventStreamChunk(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) {
          handlers.onMessage?.(event);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error);
      }
    }
  })();

  return {
    close() {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
    closed,
  };
}
