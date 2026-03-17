/**
 * @conitens/core — Headless orchestrator for Conitens v2
 *
 * Phase 1 implementation: event log, init, orchestrator, reducers,
 * agent spawner, worktree manager, replay/recovery.
 */

// Phase 1 Week 1
export * from "./event-log/index.js";
export * from "./init/index.js";

// Phase 1 Week 2
export * from "./agent-spawner/index.js";
export * from "./worktree/index.js";

// Phase 1 Week 3
export * from "./reducers/index.js";
export * from "./orchestrator/index.js";
export * from "./replay/index.js";

// Phase 2 Week 5
export * from "./ws-bus/index.js";

// Traces
export * from "./traces/index.js";

// Phase 4
export * from "./channels/index.js";
export * from "./mode/index.js";
export * from "./generator/index.js";

// Phase 5
export * from "./mcp/index.js";
export * from "./a2a/index.js";
export * from "./plugins/index.js";
