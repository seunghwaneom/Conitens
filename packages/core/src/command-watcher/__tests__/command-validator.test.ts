/**
 * Tests for command-validator.ts
 *
 * Sub-AC 8c: Validates that command files are properly checked against the
 * CommandFile schema before being ingested by the orchestrator pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  validateCommandFile,
  validatePayload,
} from "../command-validator.js";
import { SCHEMA_VERSION } from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeValidSpawnCommand(overrides: Record<string, unknown> = {}) {
  return {
    schema: SCHEMA_VERSION,
    command_id: "cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    type: "agent.spawn",
    ts: "2026-03-24T12:00:00.000Z",
    run_id: "gui-session-abc",
    actor: { kind: "user", id: "gui" },
    payload: {
      agent_id: "researcher-2",
      persona: "researcher",
      room_id: "research-lab",
    },
    ...overrides,
  };
}

function makeValidNavCommand(overrides: Record<string, unknown> = {}) {
  return {
    schema: SCHEMA_VERSION,
    command_id: "cmd_nav_001",
    type: "nav.drill_down",
    ts: "2026-03-24T12:00:00.000Z",
    run_id: "gui-session-abc",
    actor: { kind: "user", id: "gui" },
    payload: {
      level: "room",
      target_id: "research-lab",
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCommandFile — envelope validation
// ─────────────────────────────────────────────────────────────────────────────

describe("validateCommandFile — envelope validation", () => {
  it("accepts a valid agent.spawn command", () => {
    const result = validateCommandFile(makeValidSpawnCommand(), "test.json");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.command.type).toBe("agent.spawn");
      expect(result.command.command_id).toBe("cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    }
  });

  it("accepts a valid nav.drill_down command", () => {
    const result = validateCommandFile(makeValidNavCommand(), "nav.json");
    expect(result.valid).toBe(true);
  });

  it("rejects non-object input", () => {
    const result = validateCommandFile("not an object", "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects null", () => {
    const result = validateCommandFile(null, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects array input", () => {
    const result = validateCommandFile([], "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects wrong schema version", () => {
    const raw = makeValidSpawnCommand({ schema: "wrong-version" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const schemaErr = result.errors.find((e) => e.field === "schema");
      expect(schemaErr?.code).toBe("SCHEMA_MISMATCH");
    }
  });

  it("accepts command without schema field (optional)", () => {
    const raw = makeValidSpawnCommand();
    delete (raw as Record<string, unknown>)["schema"];
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(true);
  });

  it("rejects missing command_id", () => {
    const raw = makeValidSpawnCommand({ command_id: undefined });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const e = result.errors.find((err) => err.field === "command_id");
      expect(e?.code).toBe("MISSING_FIELD");
    }
  });

  it("rejects empty command_id", () => {
    const raw = makeValidSpawnCommand({ command_id: "" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
  });

  it("rejects unknown command type", () => {
    const raw = makeValidSpawnCommand({ type: "unknown.command" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const e = result.errors.find((err) => err.field === "type");
      expect(e?.code).toBe("INVALID_COMMAND_TYPE");
    }
  });

  it("rejects invalid ISO 8601 ts", () => {
    const raw = makeValidSpawnCommand({ ts: "not-a-date" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const e = result.errors.find((err) => err.field === "ts");
      expect(e?.code).toBe("INVALID_ISO8601");
    }
  });

  it("rejects missing run_id", () => {
    const raw = makeValidSpawnCommand({ run_id: undefined });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
  });

  it("rejects invalid actor.kind", () => {
    const raw = makeValidSpawnCommand({
      actor: { kind: "unknown_kind", id: "gui" },
    });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const e = result.errors.find((err) => err.field === "actor.kind");
      expect(e?.code).toBe("INVALID_ACTOR");
    }
  });

  it("rejects empty actor.id", () => {
    const raw = makeValidSpawnCommand({
      actor: { kind: "user", id: "" },
    });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
  });

  it("rejects null payload", () => {
    const raw = makeValidSpawnCommand({ payload: null });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const e = result.errors.find((err) => err.field === "payload");
      expect(e?.code).toBe("MISSING_FIELD");
    }
  });

  it("accepts optional idempotency_key", () => {
    const raw = makeValidSpawnCommand({ idempotency_key: "idem-123" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(true);
  });

  it("accepts optional causation_id", () => {
    const raw = makeValidSpawnCommand({ causation_id: "evt_parent" });
    const result = validateCommandFile(raw, "test.json");
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePayload — per-type payload checks
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePayload — agent lifecycle", () => {
  it("agent.spawn: accepts valid payload", () => {
    const errors = validatePayload("agent.spawn", {
      agent_id: "r2", persona: "researcher", room_id: "lab",
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("agent.spawn: rejects missing agent_id", () => {
    const errors = validatePayload("agent.spawn", {
      persona: "researcher", room_id: "lab",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.agent_id")).toBe(true);
  });

  it("agent.spawn: rejects missing persona", () => {
    const errors = validatePayload("agent.spawn", {
      agent_id: "r2", room_id: "lab",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.persona")).toBe(true);
  });

  it("agent.terminate: requires agent_id", () => {
    const errors = validatePayload("agent.terminate", {}, "test.json");
    expect(errors.some((e) => e.field === "payload.agent_id")).toBe(true);
  });

  it("agent.send_command: requires instruction", () => {
    const errors = validatePayload(
      "agent.send_command",
      { agent_id: "r2" },
      "test.json",
    );
    expect(errors.some((e) => e.field === "payload.instruction")).toBe(true);
  });
});

describe("validatePayload — task operations", () => {
  it("task.create: accepts valid payload", () => {
    const errors = validatePayload("task.create", {
      task_id: "task-001", title: "My Task",
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("task.create: rejects missing title", () => {
    const errors = validatePayload("task.create", {
      task_id: "task-001",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.title")).toBe(true);
  });

  it("task.assign: requires agent_id", () => {
    const errors = validatePayload("task.assign", {
      task_id: "task-001",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.agent_id")).toBe(true);
  });
});

describe("validatePayload — meeting", () => {
  it("meeting.convene: accepts valid payload", () => {
    const errors = validatePayload("meeting.convene", {
      room_id: "ops-control",
      topic: "Sprint planning",
      requested_by: "gui",
      participant_ids: ["manager-1", "implementer-1"],
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("meeting.convene: rejects empty participant_ids", () => {
    const errors = validatePayload("meeting.convene", {
      room_id: "ops-control",
      topic: "Sprint",
      requested_by: "gui",
      participant_ids: [],
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.participant_ids")).toBe(true);
  });

  it("meeting.convene: rejects missing participant_ids", () => {
    const errors = validatePayload("meeting.convene", {
      room_id: "ops-control",
      topic: "Sprint",
      requested_by: "gui",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.participant_ids")).toBe(true);
  });
});

describe("validatePayload — navigation", () => {
  it("nav.drill_down: accepts string target_id", () => {
    const errors = validatePayload("nav.drill_down", {
      level: "room", target_id: "lab",
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("nav.drill_down: accepts numeric target_id", () => {
    const errors = validatePayload("nav.drill_down", {
      level: "floor", target_id: 2,
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("nav.camera_preset: requires preset", () => {
    const errors = validatePayload("nav.camera_preset", {}, "test.json");
    expect(errors.some((e) => e.field === "payload.preset")).toBe(true);
  });

  it("nav.drill_up: accepts empty payload", () => {
    const errors = validatePayload("nav.drill_up", {}, "test.json");
    expect(errors).toHaveLength(0);
  });
});

describe("validatePayload — config", () => {
  it("config.room_mapping: requires mappings array", () => {
    const errors = validatePayload("config.room_mapping", {}, "test.json");
    expect(errors.some((e) => e.field === "payload.mappings")).toBe(true);
  });

  it("config.room_mapping: accepts empty mappings array", () => {
    const errors = validatePayload("config.room_mapping", {
      mappings: [],
    }, "test.json");
    expect(errors).toHaveLength(0);
  });

  it("config.agent_persona: requires patch object", () => {
    const errors = validatePayload("config.agent_persona", {
      persona: "researcher",
    }, "test.json");
    expect(errors.some((e) => e.field === "payload.patch")).toBe(true);
  });

  it("config.building_layout: requires layout object", () => {
    const errors = validatePayload("config.building_layout", {}, "test.json");
    expect(errors.some((e) => e.field === "payload.layout")).toBe(true);
  });
});
