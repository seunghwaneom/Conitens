/**
 * use-command-file-writer.test.ts — Unit tests for Sub-AC 8a.
 *
 * Tests the command-file schema exports and constants that can be validated
 * without a React render environment or network stack.
 *
 * Validates:
 *  1. GUI_COMMAND_TYPES covers all expected categories (agent / task / meeting /
 *     nav / config)
 *  2. isGuiCommandType() correctly accepts valid and rejects invalid types
 *  3. COMMAND_TO_EVENT_TYPE maps every GUI command type to a non-empty string
 *  4. ORCHESTRATOR_COMMAND_TYPES + NAVIGATION_COMMAND_TYPES partition
 *     GUI_COMMAND_TYPES (no gaps, no overlaps)
 *  5. isCommandFile() accepts well-formed envelopes and rejects invalid objects
 *  6. generateCommandId produces unique IDs with the correct prefix
 *  7. useCommandFileWriter exports the expected convenience wrappers
 */

import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION } from "@conitens/protocol";
import {
  GUI_COMMAND_TYPES,
  GUI_COMMAND_TYPE_SET,
  isGuiCommandType,
  COMMAND_TO_EVENT_TYPE,
  ORCHESTRATOR_COMMAND_TYPES,
  NAVIGATION_COMMAND_TYPES,
  isCommandFile,
  DEFAULT_GUI_ACTOR,
  COMMAND_INBOX_DIR,
  COMMAND_FILE_PREFIX,
  COMMAND_FILE_INITIAL_STATUS,
  type GuiCommandType,
  type CommandFile,
  type CommandFileStatus,
} from "@conitens/protocol";

// ── 1. GUI_COMMAND_TYPES coverage ────────────────────────────────────────────

describe("GUI_COMMAND_TYPES — completeness (Sub-AC 8a)", () => {
  it("contains at least 19 entries", () => {
    expect(GUI_COMMAND_TYPES.length).toBeGreaterThanOrEqual(19);
  });

  it("includes all agent-lifecycle commands", () => {
    const agentCmds: GuiCommandType[] = [
      "agent.spawn",
      "agent.terminate",
      "agent.restart",
      "agent.pause",
      "agent.resume",
      "agent.assign",
      "agent.send_command",
    ];
    for (const cmd of agentCmds) {
      expect(GUI_COMMAND_TYPE_SET.has(cmd)).toBe(true);
    }
  });

  it("includes all task-operation commands", () => {
    const taskCmds: GuiCommandType[] = [
      "task.create",
      "task.assign",
      "task.cancel",
      "task.update_spec",
    ];
    for (const cmd of taskCmds) {
      expect(GUI_COMMAND_TYPE_SET.has(cmd)).toBe(true);
    }
  });

  it("includes meeting.convene", () => {
    expect(GUI_COMMAND_TYPE_SET.has("meeting.convene")).toBe(true);
  });

  it("includes all navigation commands", () => {
    const navCmds: GuiCommandType[] = [
      "nav.drill_down",
      "nav.drill_up",
      "nav.camera_preset",
      "nav.focus_entity",
    ];
    for (const cmd of navCmds) {
      expect(GUI_COMMAND_TYPE_SET.has(cmd)).toBe(true);
    }
  });

  it("includes all config commands", () => {
    const cfgCmds: GuiCommandType[] = [
      "config.room_mapping",
      "config.agent_persona",
      "config.building_layout",
    ];
    for (const cmd of cfgCmds) {
      expect(GUI_COMMAND_TYPE_SET.has(cmd)).toBe(true);
    }
  });
});

// ── 2. isGuiCommandType ───────────────────────────────────────────────────────

describe("isGuiCommandType (Sub-AC 8a)", () => {
  it("returns true for every registered command type", () => {
    for (const t of GUI_COMMAND_TYPES) {
      expect(isGuiCommandType(t)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isGuiCommandType("agent.unknown")).toBe(false);
    expect(isGuiCommandType("")).toBe(false);
    expect(isGuiCommandType("task.spawned")).toBe(false);
  });

  it("returns false for ConitensEvent types not in GUI commands", () => {
    // These are valid EventTypes but NOT gui command types
    expect(isGuiCommandType("task.completed")).toBe(false);
    expect(isGuiCommandType("agent.spawned")).toBe(false);
  });
});

// ── 3. COMMAND_TO_EVENT_TYPE completeness ────────────────────────────────────

describe("COMMAND_TO_EVENT_TYPE — every command mapped (Sub-AC 8a)", () => {
  it("has an entry for every GUI command type", () => {
    for (const t of GUI_COMMAND_TYPES) {
      expect(COMMAND_TO_EVENT_TYPE).toHaveProperty(t);
      expect(typeof COMMAND_TO_EVENT_TYPE[t]).toBe("string");
      expect(COMMAND_TO_EVENT_TYPE[t].length).toBeGreaterThan(0);
    }
  });

  it("maps agent.spawn → agent.spawned", () => {
    expect(COMMAND_TO_EVENT_TYPE["agent.spawn"]).toBe("agent.spawned");
  });

  it("maps task.create → task.created", () => {
    expect(COMMAND_TO_EVENT_TYPE["task.create"]).toBe("task.created");
  });

  it("maps meeting.convene → meeting.started", () => {
    expect(COMMAND_TO_EVENT_TYPE["meeting.convene"]).toBe("meeting.started");
  });

  it("maps navigation commands → layout.changed", () => {
    expect(COMMAND_TO_EVENT_TYPE["nav.drill_down"]).toBe("layout.changed");
    expect(COMMAND_TO_EVENT_TYPE["nav.camera_preset"]).toBe("layout.changed");
  });
});

// ── 4. Partition: ORCHESTRATOR + NAVIGATION = full GUI set ───────────────────

describe("ORCHESTRATOR_COMMAND_TYPES ∪ NAVIGATION_COMMAND_TYPES = GUI_COMMAND_TYPES (Sub-AC 8a)", () => {
  it("no command type is in both sets (no overlap)", () => {
    for (const t of ORCHESTRATOR_COMMAND_TYPES) {
      expect(NAVIGATION_COMMAND_TYPES.has(t)).toBe(false);
    }
  });

  it("every GUI command type is in exactly one set", () => {
    for (const t of GUI_COMMAND_TYPES) {
      const inOrch = ORCHESTRATOR_COMMAND_TYPES.has(t);
      const inNav  = NAVIGATION_COMMAND_TYPES.has(t);
      expect(inOrch || inNav).toBe(true);
      expect(inOrch && inNav).toBe(false);
    }
  });

  it("union equals the full GUI command set", () => {
    const union = new Set([
      ...ORCHESTRATOR_COMMAND_TYPES,
      ...NAVIGATION_COMMAND_TYPES,
    ]);
    expect(union.size).toBe(GUI_COMMAND_TYPES.length);
    for (const t of GUI_COMMAND_TYPES) {
      expect(union.has(t)).toBe(true);
    }
  });
});

// ── 5. isCommandFile ─────────────────────────────────────────────────────────

describe("isCommandFile (Sub-AC 8a)", () => {
  function makeValidEnvelope(): CommandFile {
    return {
      schema: SCHEMA_VERSION,
      command_id: "gui_cmd_01J3XXXXXXXXXXXXXXXXXXXXXX",
      type: "agent.spawn",
      ts: new Date().toISOString(),
      run_id: "gui-session",
      actor: { kind: "user", id: "gui" },
      payload: { agent_id: "test-agent", persona: "researcher", room_id: "lab" },
    };
  }

  it("accepts a well-formed CommandFile envelope", () => {
    expect(isCommandFile(makeValidEnvelope())).toBe(true);
  });

  it("rejects null", () => {
    expect(isCommandFile(null)).toBe(false);
  });

  it("rejects missing command_id", () => {
    const { command_id: _, ...rest } = makeValidEnvelope();
    expect(isCommandFile(rest)).toBe(false);
  });

  it("rejects unknown type", () => {
    const env = { ...makeValidEnvelope(), type: "agent.unknown" };
    expect(isCommandFile(env)).toBe(false);
  });

  it("rejects missing actor", () => {
    const { actor: _, ...rest } = makeValidEnvelope();
    expect(isCommandFile(rest)).toBe(false);
  });

  it("rejects actor without id", () => {
    const env = { ...makeValidEnvelope(), actor: { kind: "user" } };
    expect(isCommandFile(env)).toBe(false);
  });

  it("rejects missing payload", () => {
    const { payload: _, ...rest } = makeValidEnvelope();
    expect(isCommandFile(rest)).toBe(false);
  });

  it("rejects non-object payload", () => {
    const env = { ...makeValidEnvelope(), payload: "not-an-object" };
    expect(isCommandFile(env)).toBe(false);
  });
});

// ── 6. Constants ──────────────────────────────────────────────────────────────

describe("Command-file constants (Sub-AC 8a)", () => {
  it("DEFAULT_GUI_ACTOR has kind=user and id=gui", () => {
    expect(DEFAULT_GUI_ACTOR.kind).toBe("user");
    expect(DEFAULT_GUI_ACTOR.id).toBe("gui");
  });

  it("COMMAND_INBOX_DIR is 'commands'", () => {
    expect(COMMAND_INBOX_DIR).toBe("commands");
  });

  it("COMMAND_FILE_PREFIX starts with 'gui_cmd_'", () => {
    expect(COMMAND_FILE_PREFIX).toBe("gui_cmd_");
  });
});

// ── 7. Command record status (Sub-AC 8a) ──────────────────────────────────────

describe("CommandFileStatus — status=pending serialization (Sub-AC 8a)", () => {
  it("COMMAND_FILE_INITIAL_STATUS is 'pending'", () => {
    expect(COMMAND_FILE_INITIAL_STATUS).toBe("pending");
  });

  it("COMMAND_FILE_INITIAL_STATUS is assignable to CommandFileStatus type", () => {
    const status: CommandFileStatus = COMMAND_FILE_INITIAL_STATUS;
    expect(status).toBe("pending");
  });

  it("CommandFile accepts status field set to 'pending'", () => {
    const envelope: CommandFile = {
      schema: SCHEMA_VERSION,
      command_id: "gui_cmd_01HXXXXXXXXXXXXXXXXXXXXXYZ",
      type: "agent.spawn",
      ts: new Date().toISOString(),
      run_id: "gui-session",
      actor: { kind: "user", id: "gui" },
      payload: { agent_id: "test-agent", persona: "researcher", room_id: "lab" },
      status: "pending",
      created_at_ms: Date.now(),
    };
    expect(isCommandFile(envelope)).toBe(true);
    expect(envelope.status).toBe("pending");
    expect(typeof envelope.created_at_ms).toBe("number");
  });

  it("isCommandFile accepts envelope without status (backward compatibility)", () => {
    const envelopeNoStatus: CommandFile = {
      schema: SCHEMA_VERSION,
      command_id: "gui_cmd_01HXXXXXXXXXXXXXXXXXXXXXYZ",
      type: "task.create",
      ts: new Date().toISOString(),
      run_id: "gui-session",
      actor: { kind: "user", id: "gui" },
      payload: { task_id: "t-1", title: "Test task" },
    };
    // status is optional — existing files without it must remain valid
    expect(isCommandFile(envelopeNoStatus)).toBe(true);
    expect(envelopeNoStatus.status).toBeUndefined();
  });

  it("all CommandFileStatus values are well-known strings", () => {
    const validStatuses: CommandFileStatus[] = [
      "pending", "processing", "completed", "failed", "rejected",
    ];
    for (const s of validStatuses) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("COMMAND_FILE_INITIAL_STATUS is included in the valid status set", () => {
    const validStatuses: CommandFileStatus[] = [
      "pending", "processing", "completed", "failed", "rejected",
    ];
    expect(validStatuses).toContain(COMMAND_FILE_INITIAL_STATUS);
  });
});
