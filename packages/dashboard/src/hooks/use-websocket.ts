import { useEffect, useRef, useState } from "react";
import { useEventStore } from "../store/event-store.js";

export type WebSocketStatus = "connecting" | "open" | "closed" | "error";

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(url: string = "ws://localhost:9100") {
  const addEvent = useEventStore((s) => s.addEvent);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const [status, setStatus] = useState<WebSocketStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) {
          attemptRef.current = 0;
          setStatus("open");
        }
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          addEvent(event);
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onerror = () => {
        if (!disposed) {
          setStatus("error");
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("closed");
        const delay = Math.min(
          BASE_DELAY * Math.pow(2, attemptRef.current),
          MAX_DELAY,
        );
        attemptRef.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [addEvent, url]);

  return { status, url };
}
