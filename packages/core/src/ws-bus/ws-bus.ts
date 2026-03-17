/**
 * @module ws-bus
 * RFC-1.0.1 §17 Layer 3 — WebSocket real-time event bus.
 *
 * Broadcasts ConitensEvents to all connected dashboard/adapter clients.
 */

import { WebSocketServer } from "ws";
import type { WebSocket as WS } from "ws";
import type { IncomingMessage } from "node:http";
import type { ConitensEvent } from "@conitens/protocol";

export class WebSocketBus {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WS>();
  private readonly authToken: string | null;

  constructor(authToken: string | null = null) {
    this.authToken = authToken;
  }

  /**
   * Start the WebSocket server on the given port.
   * If authToken was provided at construction, clients must supply
   * ?token=<authToken> in their connection URL.
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port });

      this.wss.on("connection", (ws: WS, req: IncomingMessage) => {
        // If auth token is configured, validate it
        if (this.authToken) {
          const url = new URL(req.url ?? "", `http://localhost:${port}`);
          const token = url.searchParams.get("token");
          if (token !== this.authToken) {
            ws.close(4001, "Unauthorized");
            return;
          }
        }

        this.clients.add(ws);
        ws.on("close", () => {
          this.clients.delete(ws);
        });
        ws.on("error", () => {
          this.clients.delete(ws);
        });
      });

      this.wss.on("listening", () => resolve());
      this.wss.on("error", (err) => reject(err));
    });
  }

  /**
   * Broadcast a ConitensEvent to all connected clients.
   */
  broadcast(event: ConitensEvent): void {
    if (!this.wss) return;

    const data = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * Get the number of connected clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Gracefully stop the WebSocket server.
   */
  async stop(): Promise<void> {
    if (!this.wss) return;

    // Close all client connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss!.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }
}
