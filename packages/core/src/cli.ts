/**
 * @module cli
 * Conitens CLI entry point.
 *
 * Commands: init, serve, replay, doctor
 */

import { join } from "node:path";
import { initConitens } from "./init/init.js";
import { EventLog } from "./event-log/event-log.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { TaskReducer } from "./reducers/task-reducer.js";
import { StatusReducer } from "./reducers/status-reducer.js";
import { MemoryReducer } from "./reducers/memory-reducer.js";
import { MemoryCuratorReducer } from "./reducers/memory-curator-reducer.js";
import { WebSocketBus } from "./ws-bus/ws-bus.js";
import { ContinensMcpServer } from "./mcp/mcp-server.js";
import { replayAll } from "./replay/replay.js";

export interface CliOptions {
  rootDir: string;
  wsPort?: number;
}

function createReducers() {
  return [
    new TaskReducer(),
    new StatusReducer(),
    new MemoryReducer(),
    new MemoryCuratorReducer(),
  ];
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];
  const rootDir = process.cwd();
  const conitensDir = join(rootDir, ".conitens");
  const eventsDir = join(conitensDir, "events");

  switch (command) {
    case "init": {
      const force = args.includes("--force");
      await initConitens({ rootDir, force });
      console.log(".conitens/ initialized successfully.");
      break;
    }

    case "serve": {
      const wsPort = parseInt(args[1] ?? "9100", 10);
      const eventLog = new EventLog(eventsDir);
      const reducers = createReducers();
      const wsBus = new WebSocketBus();

      const orchestrator = new Orchestrator({
        eventLog,
        conitensDir,
        reducers,
      });

      const mcpServer = new ContinensMcpServer({ conitensDir, eventsDir });

      await wsBus.start(wsPort);
      console.log(`Conitens server running — WebSocket on port ${wsPort}`);
      console.log(`MCP server ready (${mcpServer.listTools().length} tools)`);
      console.log("Press Ctrl+C to stop.");

      process.on("SIGINT", async () => {
        console.log("\nShutting down...");
        await wsBus.stop();
        process.exit(0);
      });

      // Keep alive
      await new Promise(() => {});
      break;
    }

    case "replay": {
      const fromDate = args[1];
      const reducers = createReducers();
      const { eventCount } = await replayAll(eventsDir, conitensDir, reducers, fromDate);
      console.log(`Replayed ${eventCount} events. State rebuilt.`);
      break;
    }

    case "doctor": {
      console.log("Running diagnostics...");
      const checks = [
        { name: "events/ exists", check: () => import("node:fs/promises").then(f => f.access(eventsDir)) },
        { name: "MODE.md exists", check: () => import("node:fs/promises").then(f => f.access(join(conitensDir, "MODE.md"))) },
        { name: "agents/ exists", check: () => import("node:fs/promises").then(f => f.access(join(conitensDir, "agents"))) },
      ];

      for (const { name, check } of checks) {
        try {
          await check();
          console.log(`  [PASS] ${name}`);
        } catch {
          console.log(`  [FAIL] ${name}`);
        }
      }
      break;
    }

    default:
      console.log("Conitens v2 — Multi-Agent Collaboration OS");
      console.log("");
      console.log("Commands:");
      console.log("  init [--force]     Initialize .conitens/ directory");
      console.log("  serve [port]       Start orchestrator + WebSocket + MCP");
      console.log("  replay [fromDate]  Replay events to rebuild state");
      console.log("  doctor             Run diagnostics");
      break;
  }
}
