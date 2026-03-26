/**
 * Tests for command-router.ts
 *
 * Sub-AC 8c: Validates that CommandFile objects are routed to the correct
 * pipeline stage (orchestrator vs. navigation) and that the CommandData
 * produced is correctly enriched with provenance metadata.
 */

import { describe, it, expect } from "vitest";
import {
  routeCommandFile,
  isOrchestratorCommand,
  isNavigationCommand,
} from "../command-router.js";
import { SCHEMA_VERSION, type CommandFile } from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeCommandFile<T>(
  type: string,
  payload: T,
  overrides: Omit<Partial<CommandFile>, "payload"> = {},
): CommandFile<T> {
  return {
    schema: SCHEMA_VERSION,
    command_id: "cmd_TEST_001",
    type: type as CommandFile["type"],
    ts: "2026-03-24T12:00:00.000Z",
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    payload,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// isOrchestratorCommand / isNavigationCommand helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("isOrchestratorCommand", () => {
  it("returns true for agent.spawn", () => {
    expect(isOrchestratorCommand("agent.spawn")).toBe(true);
  });

  it("returns true for task.create", () => {
    expect(isOrchestratorCommand("task.create")).toBe(true);
  });

  it("returns true for meeting.convene", () => {
    expect(isOrchestratorCommand("meeting.convene")).toBe(true);
  });

  it("returns true for config.room_mapping", () => {
    expect(isOrchestratorCommand("config.room_mapping")).toBe(true);
  });

  it("returns false for nav.drill_down", () => {
    expect(isOrchestratorCommand("nav.drill_down")).toBe(false);
  });

  it("returns false for nav.camera_preset", () => {
    expect(isOrchestratorCommand("nav.camera_preset")).toBe(false);
  });
});

describe("isNavigationCommand", () => {
  it("returns true for nav.drill_down", () => {
    expect(isNavigationCommand("nav.drill_down")).toBe(true);
  });

  it("returns true for nav.drill_up", () => {
    expect(isNavigationCommand("nav.drill_up")).toBe(true);
  });

  it("returns true for nav.camera_preset", () => {
    expect(isNavigationCommand("nav.camera_preset")).toBe(true);
  });

  it("returns true for nav.focus_entity", () => {
    expect(isNavigationCommand("nav.focus_entity")).toBe(true);
  });

  it("returns false for agent.spawn", () => {
    expect(isNavigationCommand("agent.spawn")).toBe(false);
  });

  it("returns false for task.create", () => {
    expect(isNavigationCommand("task.create")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeCommandFile — stage assignment
// ─────────────────────────────────────────────────────────────────────────────

describe("routeCommandFile — stage assignment", () => {
  it("routes agent.spawn to orchestrator stage", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("orchestrator");
  });

  it("routes task.create to orchestrator stage", () => {
    const cmd = makeCommandFile("task.create", {
      task_id: "t1", title: "Test",
    });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("orchestrator");
  });

  it("routes meeting.convene to orchestrator stage", () => {
    const cmd = makeCommandFile("meeting.convene", {
      room_id: "ops", topic: "Planning", requested_by: "gui",
      participant_ids: ["m1"],
    });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("orchestrator");
  });

  it("routes config.room_mapping to orchestrator stage", () => {
    const cmd = makeCommandFile("config.room_mapping", { mappings: [] });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("orchestrator");
  });

  it("routes nav.drill_down to navigation stage", () => {
    const cmd = makeCommandFile("nav.drill_down", {
      level: "room", target_id: "lab",
    });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("navigation");
  });

  it("routes nav.drill_up to navigation stage", () => {
    const cmd = makeCommandFile("nav.drill_up", { steps: 1 });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("navigation");
  });

  it("routes nav.camera_preset to navigation stage", () => {
    const cmd = makeCommandFile("nav.camera_preset", { preset: "overview" });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("navigation");
  });

  it("routes nav.focus_entity to navigation stage", () => {
    const cmd = makeCommandFile("nav.focus_entity", {
      entity_type: "agent", entity_id: "r2",
    });
    const routed = routeCommandFile(cmd);
    expect(routed.stage).toBe("navigation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeCommandFile — event type translation
// ─────────────────────────────────────────────────────────────────────────────

describe("routeCommandFile — event type translation", () => {
  it("translates agent.spawn → agent.spawned", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("agent.spawned");
  });

  it("translates task.create → task.created", () => {
    const cmd = makeCommandFile("task.create", {
      task_id: "t1", title: "Test",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("task.created");
  });

  it("translates meeting.convene → meeting.started", () => {
    const cmd = makeCommandFile("meeting.convene", {
      room_id: "ops", topic: "Planning", requested_by: "gui",
      participant_ids: ["m1"],
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("meeting.started");
  });

  it("translates nav.drill_down → layout.changed", () => {
    const cmd = makeCommandFile("nav.drill_down", {
      level: "room", target_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("layout.changed");
  });

  it("translates agent.terminate → agent.terminated", () => {
    const cmd = makeCommandFile("agent.terminate", { agent_id: "r2" });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("agent.terminated");
  });

  it("translates task.cancel → task.cancelled", () => {
    const cmd = makeCommandFile("task.cancel", { task_id: "t1" });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("task.cancelled");
  });

  it("translates config.building_layout → layout.updated", () => {
    const cmd = makeCommandFile("config.building_layout", { layout: {} });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.type).toBe("layout.updated");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeCommandFile — payload enrichment
// ─────────────────────────────────────────────────────────────────────────────

describe("routeCommandFile — payload enrichment", () => {
  it("embeds _command_id in payload", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["_command_id"]).toBe("cmd_TEST_001");
  });

  it("embeds _command_type in payload", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["_command_type"]).toBe("agent.spawn");
  });

  it("embeds _gui_ts in payload", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["_gui_ts"]).toBe("2026-03-24T12:00:00.000Z");
  });

  it("embeds _causation_id when provided", () => {
    const cmd = makeCommandFile(
      "agent.spawn",
      { agent_id: "r2", persona: "researcher", room_id: "lab" },
      { causation_id: "evt_parent_123" },
    );
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["_causation_id"]).toBe("evt_parent_123");
  });

  it("does not embed _causation_id when absent", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["_causation_id"]).toBeUndefined();
  });

  it("preserves original payload fields", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
      display_name: "Researcher Two",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.payload["agent_id"]).toBe("r2");
    expect(commandData.payload["persona"]).toBe("researcher");
    expect(commandData.payload["display_name"]).toBe("Researcher Two");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeCommandFile — idempotency key
// ─────────────────────────────────────────────────────────────────────────────

describe("routeCommandFile — idempotency key", () => {
  it("uses explicit idempotency_key when provided", () => {
    const cmd = makeCommandFile(
      "agent.spawn",
      { agent_id: "r2", persona: "researcher", room_id: "lab" },
      { idempotency_key: "explicit-idem-key" },
    );
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.idempotency_key).toBe("explicit-idem-key");
  });

  it("falls back to command_id when no idempotency_key", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.idempotency_key).toBe("cmd_TEST_001");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeCommandFile — run_id and actor passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("routeCommandFile — metadata passthrough", () => {
  it("passes run_id to commandData", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    }, { run_id: "my-run-999" });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.run_id).toBe("my-run-999");
  });

  it("passes actor to commandData", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    }, { actor: { kind: "agent", id: "manager-1" } });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.actor.kind).toBe("agent");
    expect(commandData.actor.id).toBe("manager-1");
  });

  it("passes task_id when present", () => {
    const cmd = makeCommandFile("agent.send_command", {
      agent_id: "r2", instruction: "Do thing",
    }, { task_id: "task-007" });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.task_id).toBe("task-007");
  });

  it("omits task_id when absent", () => {
    const cmd = makeCommandFile("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    });
    const { commandData } = routeCommandFile(cmd);
    expect(commandData.task_id).toBeUndefined();
  });
});
