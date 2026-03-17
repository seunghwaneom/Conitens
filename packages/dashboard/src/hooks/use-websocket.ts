import { useEffect, useRef } from "react";
import { useEventStore } from "../store/event-store.js";

export function useWebSocket(url: string = "ws://localhost:9100") {
  const addEvent = useEventStore((s) => s.addEvent);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        addEvent(event);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
    };
  }, [url, addEvent]);
}
