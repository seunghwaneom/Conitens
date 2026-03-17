import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketBus } from "../src/ws-bus/ws-bus.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";
import WebSocket from "ws";

function makeEvent(type: string): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: `evt_ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: type as ConitensEvent["type"],
    ts: new Date().toISOString(),
    run_id: "run_test",
    actor: { kind: "system", id: "test" },
    payload: {},
  };
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<ConitensEvent> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe("WebSocketBus", () => {
  let bus: WebSocketBus;
  const PORT = 19100 + Math.floor(Math.random() * 1000);
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    bus = new WebSocketBus();
    await bus.start(PORT);
  });

  afterEach(async () => {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    clients.length = 0;
    await bus.stop();
  });

  it("broadcasts event to a connected client", async () => {
    const client = await connectClient(PORT);
    clients.push(client);

    const event = makeEvent("task.created");
    const msgPromise = waitForMessage(client);
    bus.broadcast(event);

    const received = await msgPromise;
    expect(received.event_id).toBe(event.event_id);
    expect(received.type).toBe("task.created");
  });

  it("broadcasts to multiple clients", async () => {
    const client1 = await connectClient(PORT);
    const client2 = await connectClient(PORT);
    clients.push(client1, client2);

    const event = makeEvent("agent.spawned");
    const p1 = waitForMessage(client1);
    const p2 = waitForMessage(client2);
    bus.broadcast(event);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.event_id).toBe(event.event_id);
    expect(r2.event_id).toBe(event.event_id);
  });

  it("tracks client count", async () => {
    expect(bus.clientCount).toBe(0);

    const client1 = await connectClient(PORT);
    clients.push(client1);
    // Small delay for server to register connection
    await new Promise(r => setTimeout(r, 50));
    expect(bus.clientCount).toBe(1);

    const client2 = await connectClient(PORT);
    clients.push(client2);
    await new Promise(r => setTimeout(r, 50));
    expect(bus.clientCount).toBe(2);
  });

  it("stop() closes server cleanly", async () => {
    const client = await connectClient(PORT);
    clients.push(client);

    await bus.stop();

    // Attempting to connect should fail
    await expect(
      connectClient(PORT),
    ).rejects.toThrow();
  });
});
