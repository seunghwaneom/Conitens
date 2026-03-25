/**
 * use-command-file-pipeline.test.ts — Unit tests for Sub-AC 8b hook.
 *
 * Tests the hook-level integration between:
 *   - CommandFilePipelineWatcher (data layer)
 *   - command-lifecycle-store (visual store / Sub-AC 8c)
 *   - Global event bus (WebSocket bridge)
 *
 * Test strategy:
 *   The hook itself is headless logic (useRef + useEffect + useCallback).
 *   We test at two levels:
 *     A. Pure watcher logic (no React rendering required)
 *     B. Visual store bridge: pipelineStatusToVisualEventType mapping + store sync
 *
 * All tests are pure TypeScript — no JSDOM, no React rendering environment.
 * The hook's exported constants, mapping logic, and the watcher integration
 * are exercised directly by importing the core modules.
 *
 * Tests:
 *  1. registerPipelineCommand creates pending entity + notifies visual store
 *  2. command.issued event → accepted pipeline state + visual store processing
 *  3. command.acknowledged event → executing pipeline state
 *  4. command.completed event → completed + store sync
 *  5. command.failed event → failed + store error
 *  6. command.rejected event → failed + rejection code
 *  7. Non-command events are ignored by the pipeline
 *  8. Pipeline bridge fires transition callbacks in order
 *  9. Auto-registration from unknown command in WS events
 * 10. Transition log is available after all events
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the core watcher logic (integration equivalent of the hook)
import {
  CommandFilePipelineWatcher,
  mapEventTypeToStatus,
  type CommandPipelineEvent,
} from "../../data/command-file-pipeline.js";

// Test the visual store synchronization
import {
  useCommandLifecycleStore,
} from "../../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(
  type: string,
  command_id: string,
  extra?: Record<string, unknown>,
): CommandPipelineEvent {
  return { type, payload: { command_id, ...extra } };
}

/**
 * Map a pipeline status to the visual store event type (mirrors the private
 * mapping inside the hook).
 */
function pipelineStatusToVisualEvent(status: string): string | null {
  switch (status) {
    case "accepted":
    case "executing":
      return "command.issued";
    case "completed":
      return "command.completed";
    case "failed":
      return "command.failed";
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset store before each test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useCommandLifecycleStore.getState().clearLog();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. registerPipelineCommand — creates pending entity
// ─────────────────────────────────────────────────────────────────────────────

describe("registerPipelineCommand — pending entity creation", () => {
  it("creates entity in pending state", () => {
    const watcher = new CommandFilePipelineWatcher();
    const entity = watcher.registerCommand("hook-cmd-001", "agent.spawn");
    expect(entity.status).toBe("pending");
    expect(entity.command_id).toBe("hook-cmd-001");
  });

  it("is idempotent — second call returns the same entity", () => {
    const watcher = new CommandFilePipelineWatcher();
    const e1 = watcher.registerCommand("hook-cmd-002", "task.create");
    const e2 = watcher.registerCommand("hook-cmd-002", "task.create");
    expect(e1).toBe(e2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. command.issued → accepted + visual store sync
// ─────────────────────────────────────────────────────────────────────────────

describe("command.issued event → pipeline accepted + visual store sync", () => {
  it("pipeline entity transitions to accepted", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-010", "agent.spawn");

    const result = watcher.applyEvent(makeEvent("command.issued", "hook-cmd-010"));
    expect(result?.status).toBe("accepted");
    expect(result?.trigger_event).toBe("command.issued");
  });

  it("pipelineStatusToVisualEvent(accepted) returns command.issued", () => {
    expect(pipelineStatusToVisualEvent("accepted")).toBe("command.issued");
  });

  it("visual store reflects processing after command.issued callback", () => {
    const watcher = new CommandFilePipelineWatcher();
    const store = useCommandLifecycleStore.getState();

    // Pre-register in visual store
    store.addLocalCommand("hook-cmd-011", "agent.spawn");

    // Set up bridge (simulates hook's onTransition callback)
    watcher.setOnTransition((entity) => {
      const visualEvent = pipelineStatusToVisualEvent(entity.status);
      if (visualEvent) {
        store.handleCommandEvent({
          type: visualEvent,
          payload: { command_id: entity.command_id, command_type: entity.command_type },
        });
      }
    });

    watcher.registerCommand("hook-cmd-011", "agent.spawn");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-011"));

    const entry = store.getLogEntries().find((e) => e.command_id === "hook-cmd-011");
    expect(entry?.status).toBe("processing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. command.acknowledged → executing
// ─────────────────────────────────────────────────────────────────────────────

describe("command.acknowledged → executing pipeline state", () => {
  it("transitions accepted → executing", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-020", "task.create");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-020"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-020"));
    expect(watcher.getEntity("hook-cmd-020")?.status).toBe("executing");
  });

  it("pipelineStatusToVisualEvent(executing) returns command.issued", () => {
    // Both accepted and executing map to "processing" in visual store
    expect(pipelineStatusToVisualEvent("executing")).toBe("command.issued");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. command.completed → completed + visual store
// ─────────────────────────────────────────────────────────────────────────────

describe("command.completed → completed pipeline state", () => {
  it("full happy path: pending → accepted → executing → completed", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-030", "agent.spawn");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-030"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-030"));
    watcher.applyEvent(makeEvent("command.completed", "hook-cmd-030"));

    const entity = watcher.getEntity("hook-cmd-030");
    expect(entity?.status).toBe("completed");
    expect(entity?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("visual store reflects completed after bridge sync", () => {
    const watcher = new CommandFilePipelineWatcher();
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("hook-cmd-031", "agent.spawn");

    watcher.setOnTransition((entity) => {
      const visualEvent = pipelineStatusToVisualEvent(entity.status);
      if (visualEvent) {
        store.handleCommandEvent({
          type: visualEvent,
          payload: {
            command_id: entity.command_id,
            command_type: entity.command_type,
            ...(entity.duration_ms !== undefined ? { duration_ms: entity.duration_ms } : {}),
          },
        });
      }
    });

    watcher.registerCommand("hook-cmd-031", "agent.spawn");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-031"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-031"));
    watcher.applyEvent(makeEvent("command.completed", "hook-cmd-031"));

    const entry = store.getLogEntries().find((e) => e.command_id === "hook-cmd-031");
    expect(entry?.status).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. command.failed → failed + error detail
// ─────────────────────────────────────────────────────────────────────────────

describe("command.failed → failed pipeline state", () => {
  it("carries error code + message", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-040", "task.cancel");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-040"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-040"));
    watcher.applyEvent(
      makeEvent("command.failed", "hook-cmd-040", {
        error_code: "AGENT_UNAVAILABLE",
        error_message: "Target agent is not running",
      }),
    );

    const entity = watcher.getEntity("hook-cmd-040");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("AGENT_UNAVAILABLE");
    expect(entity?.error?.message).toBe("Target agent is not running");
  });

  it("visual store reflects failed after bridge sync", () => {
    const watcher = new CommandFilePipelineWatcher();
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("hook-cmd-041", "task.cancel");

    watcher.setOnTransition((entity) => {
      const visualEvent = pipelineStatusToVisualEvent(entity.status);
      if (visualEvent) {
        store.handleCommandEvent({
          type: visualEvent,
          payload: {
            command_id:    entity.command_id,
            command_type:  entity.command_type,
            error_code:    entity.error?.code,
            error_message: entity.error?.message,
          },
        });
      }
    });

    watcher.registerCommand("hook-cmd-041", "task.cancel");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-041"));
    watcher.applyEvent(makeEvent("command.failed", "hook-cmd-041", {
      error_code: "TIMEOUT",
      error_message: "Processing timed out",
    }));

    const entry = store.getLogEntries().find((e) => e.command_id === "hook-cmd-041");
    expect(entry?.status).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. command.rejected → failed
// ─────────────────────────────────────────────────────────────────────────────

describe("command.rejected → failed pipeline state", () => {
  it("rejection at ingestion boundary → failed with rejection code", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-050", "agent.spawn");
    watcher.applyEvent(
      makeEvent("command.rejected", "hook-cmd-050", {
        rejection_code:   "SCHEMA_INVALID",
        rejection_reason: "Missing required field: persona",
      }),
    );

    const entity = watcher.getEntity("hook-cmd-050");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("SCHEMA_INVALID");
  });

  it("mapEventTypeToStatus('command.rejected') returns 'failed'", () => {
    expect(mapEventTypeToStatus("command.rejected")).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Non-command events are ignored
// ─────────────────────────────────────────────────────────────────────────────

describe("Non-command events ignored by pipeline watcher", () => {
  it("pipeline.started does not affect a pending command", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-060", "agent.spawn");

    const result = watcher.applyEvent(makeEvent("pipeline.started", "hook-cmd-060"));
    expect(result).toBeNull();
    expect(watcher.getEntity("hook-cmd-060")?.status).toBe("pending");
  });

  it("task.created does not create a new pipeline entity", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.applyEvent({
      type: "task.created",
      payload: { command_id: "hook-cmd-061", task_id: "task-001" },
    });
    // Should NOT create entity for non-command events (no command_id to map)
    // Actually it will try to apply but mapEventTypeToStatus returns null first
    expect(watcher.getEntity("hook-cmd-061")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Transition callbacks fire in correct order
// ─────────────────────────────────────────────────────────────────────────────

describe("Pipeline bridge: transition callbacks in order", () => {
  it("fires in pending→accepted→executing→completed order", () => {
    const watcher = new CommandFilePipelineWatcher();
    const transitions: string[] = [];

    watcher.setOnTransition((entity) => {
      transitions.push(entity.status);
    });

    watcher.registerCommand("hook-cmd-070", "agent.spawn");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-070"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-070"));
    watcher.applyEvent(makeEvent("command.completed", "hook-cmd-070"));

    expect(transitions).toEqual(["accepted", "executing", "completed"]);
  });

  it("fires once for a direct pending→failed transition", () => {
    const watcher = new CommandFilePipelineWatcher();
    const transitions: string[] = [];
    watcher.setOnTransition((e) => transitions.push(e.status));

    watcher.registerCommand("hook-cmd-071", "task.create");
    watcher.applyEvent(makeEvent("command.rejected", "hook-cmd-071", {
      rejection_code: "AUTH_DENIED",
    }));

    expect(transitions).toEqual(["failed"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Auto-registration from unknown command_id in WS event
// ─────────────────────────────────────────────────────────────────────────────

describe("Auto-registration from WebSocket events", () => {
  it("creates entity automatically when command.issued arrives before register", () => {
    const watcher = new CommandFilePipelineWatcher();
    const result = watcher.applyEvent({
      type: "command.issued",
      payload: { command_id: "hook-auto-001", command_type: "task.assign" },
    });
    expect(result?.command_id).toBe("hook-auto-001");
    expect(result?.status).toBe("accepted");
    expect(result?.command_type).toBe("task.assign");
  });

  it("watcher size increases for auto-registered commands", () => {
    const watcher = new CommandFilePipelineWatcher();
    expect(watcher.size).toBe(0);
    watcher.applyEvent({
      type: "command.issued",
      payload: { command_id: "hook-auto-002", command_type: "agent.spawn" },
    });
    expect(watcher.size).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Transition log completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("Transition log completeness after full lifecycle", () => {
  it("full pipeline log has 4 entries (register + 3 transitions)", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-080", "meeting.convene");
    watcher.applyEvent(makeEvent("command.issued", "hook-cmd-080"));
    watcher.applyEvent(makeEvent("command.acknowledged", "hook-cmd-080"));
    watcher.applyEvent(makeEvent("command.completed", "hook-cmd-080"));

    const log = watcher.getTransitionLog();
    expect(log.length).toBe(4);
    const statuses = log.map((r) => r.to_status);
    expect(statuses).toEqual(["pending", "accepted", "executing", "completed"]);
  });

  it("transition log records trigger_event for each step", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("hook-cmd-081", "agent.spawn");
    watcher.applyEvent(makeEvent("command.queued", "hook-cmd-081"));
    watcher.applyEvent(makeEvent("command.dispatched", "hook-cmd-081"));
    watcher.applyEvent(makeEvent("command.completed", "hook-cmd-081"));

    const log = watcher.getTransitionLog();
    const triggers = log.map((r) => r.trigger_event);
    expect(triggers).toContain("local.registered");
    expect(triggers).toContain("command.queued");
    expect(triggers).toContain("command.dispatched");
    expect(triggers).toContain("command.completed");
  });
});
