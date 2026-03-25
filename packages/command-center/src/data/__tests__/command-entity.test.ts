/**
 * command-entity.test.ts — Sub-AC 8.1: Command entity creation tests.
 *
 * Validates the command entity schema, factory, serialiser, and validation
 * helpers defined in `data/command-entity.ts`.
 *
 * Test groups:
 *  A. CommandEntity schema field presence
 *  B. Factory: createCommandEntity() correctness
 *  C. Factory: lifecycle_state defaults to "pending"
 *  D. Factory: source_entity_id propagation
 *  E. Serialiser: serializeCommandEntity() field mapping
 *  F. Serialiser: validation and error cases
 *  G. Validation: isCommandEntity() type guard
 *  H. Inbox writer: writeCommandEntityToInbox() (network mocked)
 *  I. Convenience: createAndWriteCommandEntity()
 *  J. Constants and type exports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createCommandEntity,
  serializeCommandEntity,
  writeCommandEntityToInbox,
  createAndWriteCommandEntity,
  isCommandEntity,
  generateCommandEntityId,
  COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE,
  COMMAND_ENTITY_DEFAULT_RUN_ID,
  type CommandEntity,
  type CommandEntityLifecycleState,
  type CreateCommandEntityOptions,
  type WriteCommandEntityResult,
} from "../command-entity.js";

import {
  COMMAND_FILE_PREFIX,
  COMMAND_FILE_INITIAL_STATUS,
  SCHEMA_VERSION,
  DEFAULT_GUI_ACTOR,
  isGuiCommandType,
  type CommandFile,
} from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal valid options for createCommandEntity(). */
function makeOpts(
  overrides?: Partial<CreateCommandEntityOptions>,
): CreateCommandEntityOptions {
  return {
    source_entity_id: "agent:researcher-1",
    action_type:      "agent.spawn",
    payload: {
      agent_id:     "researcher-1",
      persona:      "researcher",
      room_id:      "research-lab",
      display_name: "Researcher-1",
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. CommandEntity schema field presence
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-A — CommandEntity schema fields", () => {

  it("8.1a-1: entity has command_id field", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity).toHaveProperty("command_id");
    expect(typeof entity.command_id).toBe("string");
    expect(entity.command_id.length).toBeGreaterThan(0);
  });

  it("8.1a-2: entity has source_entity_id field", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity).toHaveProperty("source_entity_id");
    expect(typeof entity.source_entity_id).toBe("string");
    expect(entity.source_entity_id.length).toBeGreaterThan(0);
  });

  it("8.1a-3: entity has action_type field", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity).toHaveProperty("action_type");
    expect(typeof entity.action_type).toBe("string");
    expect(entity.action_type.length).toBeGreaterThan(0);
  });

  it("8.1a-4: entity has payload field (object)", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity).toHaveProperty("payload");
    expect(typeof entity.payload).toBe("object");
    expect(entity.payload).not.toBeNull();
  });

  it("8.1a-5: entity has lifecycle_state field", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity).toHaveProperty("lifecycle_state");
    expect(typeof entity.lifecycle_state).toBe("string");
  });

  it("8.1a-6: entity is frozen (immutable)", () => {
    const entity = createCommandEntity(makeOpts());
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("8.1a-7: entity has all five required Sub-AC 8.1 fields simultaneously", () => {
    const entity = createCommandEntity(makeOpts());
    const keys = Object.keys(entity);
    expect(keys).toContain("command_id");
    expect(keys).toContain("source_entity_id");
    expect(keys).toContain("action_type");
    expect(keys).toContain("payload");
    expect(keys).toContain("lifecycle_state");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Factory: createCommandEntity() correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-B — createCommandEntity() factory", () => {

  it("8.1b-1: uses provided source_entity_id verbatim", () => {
    const entity = createCommandEntity(makeOpts({
      source_entity_id: "room:research-lab",
    }));
    expect(entity.source_entity_id).toBe("room:research-lab");
  });

  it("8.1b-2: uses provided action_type verbatim", () => {
    const entity = createCommandEntity(makeOpts({ action_type: "task.cancel" }));
    expect(entity.action_type).toBe("task.cancel");
  });

  it("8.1b-3: uses provided payload verbatim", () => {
    const payload = { agent_id: "manager-1", persona: "manager", room_id: "ops" };
    const entity = createCommandEntity(makeOpts({ payload }));
    expect(entity.payload).toEqual(payload);
  });

  it("8.1b-4: generates unique command_id for each call", () => {
    const a = createCommandEntity(makeOpts());
    const b = createCommandEntity(makeOpts());
    expect(a.command_id).not.toBe(b.command_id);
  });

  it("8.1b-5: generated command_id starts with COMMAND_FILE_PREFIX", () => {
    const entity = createCommandEntity(makeOpts());
    expect(entity.command_id.startsWith(COMMAND_FILE_PREFIX)).toBe(true);
  });

  it("8.1b-6: generated command_id has correct total length (prefix + 26 chars)", () => {
    const entity = createCommandEntity(makeOpts());
    const expectedLen = COMMAND_FILE_PREFIX.length + 26;
    expect(entity.command_id.length).toBe(expectedLen);
  });

  it("8.1b-7: accepts explicit command_id override", () => {
    const myId = `${COMMAND_FILE_PREFIX}01HXXXXXXXXXXXXXXXXXXXXXAB`;
    const entity = createCommandEntity(makeOpts({ command_id: myId }));
    expect(entity.command_id).toBe(myId);
  });

  it("8.1b-8: accepts explicit ts override", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const entity = createCommandEntity(makeOpts({ ts }));
    expect(entity.ts).toBe(ts);
  });

  it("8.1b-9: ts is a valid ISO 8601 string when not overridden", () => {
    const entity = createCommandEntity(makeOpts());
    expect(typeof entity.ts).toBe("string");
    expect(new Date(entity.ts).getTime()).toBeGreaterThan(0);
  });

  it("8.1b-10: created_at_ms is a positive number", () => {
    const entity = createCommandEntity(makeOpts());
    expect(typeof entity.created_at_ms).toBe("number");
    expect(entity.created_at_ms).toBeGreaterThan(0);
  });

  it("8.1b-11: works with all action_type values (agent lifecycle)", () => {
    const agentTypes = [
      "agent.spawn",
      "agent.terminate",
      "agent.restart",
      "agent.pause",
      "agent.resume",
      "agent.assign",
      "agent.send_command",
    ] as const;
    for (const t of agentTypes) {
      const entity = createCommandEntity(makeOpts({ action_type: t }));
      expect(entity.action_type).toBe(t);
      expect(entity.lifecycle_state).toBe("pending");
    }
  });

  it("8.1b-12: works with task operation action types", () => {
    const taskTypes = ["task.create", "task.assign", "task.cancel", "task.update_spec"] as const;
    for (const t of taskTypes) {
      const entity = createCommandEntity(makeOpts({ action_type: t, payload: { task_id: "t-1", title: "T" } }));
      expect(entity.action_type).toBe(t);
    }
  });

  it("8.1b-13: works with nav and config action types", () => {
    const entity = createCommandEntity(makeOpts({
      action_type: "nav.drill_down",
      source_entity_id: "building:main",
      payload: { level: "room", target_id: "lab" },
    }));
    expect(entity.action_type).toBe("nav.drill_down");
    expect(entity.source_entity_id).toBe("building:main");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Factory: lifecycle_state defaults to "pending"
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-C — lifecycle_state is always pending at creation", () => {

  it("8.1c-1: lifecycle_state is 'pending' for agent.spawn", () => {
    const entity = createCommandEntity(makeOpts({ action_type: "agent.spawn" }));
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-2: lifecycle_state is 'pending' for agent.terminate", () => {
    const entity = createCommandEntity(makeOpts({ action_type: "agent.terminate" }));
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-3: lifecycle_state is 'pending' for task.create", () => {
    const entity = createCommandEntity(makeOpts({ action_type: "task.create", payload: { task_id: "t-1", title: "T" } }));
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-4: lifecycle_state is 'pending' for meeting.convene", () => {
    const entity = createCommandEntity(makeOpts({
      action_type: "meeting.convene",
      payload: {
        room_id: "conference",
        topic: "Sync",
        participant_ids: ["agent-1"],
        requested_by: "user",
      },
    }));
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-5: lifecycle_state is 'pending' for navigation commands", () => {
    const entity = createCommandEntity(makeOpts({
      action_type: "nav.camera_preset",
      source_entity_id: "building:main",
      payload: { preset: "overview" },
    }));
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-6: COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE constant equals 'pending'", () => {
    expect(COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE).toBe("pending");
  });

  it("8.1c-7: lifecycle_state cannot be changed (entity is frozen)", () => {
    const entity = createCommandEntity(makeOpts());
    expect(() => {
      // @ts-expect-error — testing immutability at runtime
      (entity as Record<string, unknown>)["lifecycle_state"] = "accepted";
    }).toThrow();
    // State is still pending after attempted mutation
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1c-8: lifecycle_state is assignable to CommandEntityLifecycleState", () => {
    const entity = createCommandEntity(makeOpts());
    const state: CommandEntityLifecycleState = entity.lifecycle_state;
    expect(state).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Factory: source_entity_id propagation
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-D — source_entity_id represents the originating 3D entity", () => {

  it("8.1d-1: agent entity format preserved", () => {
    const entity = createCommandEntity(makeOpts({ source_entity_id: "agent:manager-1" }));
    expect(entity.source_entity_id).toBe("agent:manager-1");
  });

  it("8.1d-2: room entity format preserved", () => {
    const entity = createCommandEntity(makeOpts({ source_entity_id: "room:ops-center" }));
    expect(entity.source_entity_id).toBe("room:ops-center");
  });

  it("8.1d-3: building entity format preserved", () => {
    const entity = createCommandEntity(makeOpts({
      source_entity_id: "building:main",
      action_type: "config.building_layout",
      payload: { layout: {} },
    }));
    expect(entity.source_entity_id).toBe("building:main");
  });

  it("8.1d-4: task entity format preserved", () => {
    const entity = createCommandEntity(makeOpts({
      source_entity_id: "task:t-001",
      action_type: "task.cancel",
      payload: { task_id: "t-001" },
    }));
    expect(entity.source_entity_id).toBe("task:t-001");
  });

  it("8.1d-5: fixture entity format preserved", () => {
    const entity = createCommandEntity(makeOpts({
      source_entity_id: "fixture:spawn-btn-researcher-1",
    }));
    expect(entity.source_entity_id).toBe("fixture:spawn-btn-researcher-1");
  });

  it("8.1d-6: two entities with different source_entity_ids are distinguishable", () => {
    const a = createCommandEntity(makeOpts({ source_entity_id: "agent:researcher-1" }));
    const b = createCommandEntity(makeOpts({ source_entity_id: "agent:manager-1" }));
    expect(a.source_entity_id).not.toBe(b.source_entity_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Serialiser: serializeCommandEntity() field mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-E — serializeCommandEntity() maps entity to CommandFile", () => {

  it("8.1e-1: serialised file has correct schema version", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(file.schema).toBe(SCHEMA_VERSION);
  });

  it("8.1e-2: command_id is preserved in serialised file", () => {
    const myId = `${COMMAND_FILE_PREFIX}01HXXXXXXXXXXXXXXXXXXXXXCD`;
    const entity = createCommandEntity(makeOpts({ command_id: myId }));
    const file = serializeCommandEntity(entity);
    expect(file.command_id).toBe(myId);
  });

  it("8.1e-3: action_type maps to CommandFile.type", () => {
    const entity = createCommandEntity(makeOpts({ action_type: "task.assign" }));
    const file = serializeCommandEntity(entity);
    expect(file.type).toBe("task.assign");
  });

  it("8.1e-4: payload is preserved in serialised file", () => {
    const payload = { agent_id: "researcher-2", persona: "researcher", room_id: "lab" };
    const entity = createCommandEntity(makeOpts({ payload }));
    const file = serializeCommandEntity(entity);
    expect(file.payload).toEqual(payload);
  });

  it("8.1e-5: lifecycle_state 'pending' maps to CommandFile.status 'pending'", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(file.status).toBe("pending");
    expect(file.status).toBe(COMMAND_FILE_INITIAL_STATUS);
  });

  it("8.1e-6: source_entity_id is forwarded to causation_id", () => {
    const entity = createCommandEntity(makeOpts({ source_entity_id: "agent:researcher-1" }));
    const file = serializeCommandEntity(entity);
    expect(file.causation_id).toBe("agent:researcher-1");
  });

  it("8.1e-7: actor is DEFAULT_GUI_ACTOR", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(file.actor).toEqual(DEFAULT_GUI_ACTOR);
    expect(file.actor.kind).toBe("user");
    expect(file.actor.id).toBe("gui");
  });

  it("8.1e-8: run_id defaults to COMMAND_ENTITY_DEFAULT_RUN_ID", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(file.run_id).toBe(COMMAND_ENTITY_DEFAULT_RUN_ID);
  });

  it("8.1e-9: run_id override is respected", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity, "custom-session-xyz");
    expect(file.run_id).toBe("custom-session-xyz");
  });

  it("8.1e-10: ts is preserved from entity", () => {
    const ts = "2026-03-25T12:00:00.000Z";
    const entity = createCommandEntity(makeOpts({ ts }));
    const file = serializeCommandEntity(entity);
    expect(file.ts).toBe(ts);
  });

  it("8.1e-11: created_at_ms is a number in the serialised file", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(typeof file.created_at_ms).toBe("number");
    expect(file.created_at_ms).toBeGreaterThan(0);
  });

  it("8.1e-12: idempotency_key equals command_id", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(file.idempotency_key).toBe(entity.command_id);
  });

  it("8.1e-13: serialised file passes JSON round-trip", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    const json = JSON.stringify(file);
    const parsed = JSON.parse(json) as CommandFile;
    expect(parsed.command_id).toBe(entity.command_id);
    expect(parsed.type).toBe(entity.action_type);
    expect(parsed.status).toBe("pending");
    expect(parsed.causation_id).toBe(entity.source_entity_id);
  });

  it("8.1e-14: serialised file.type is a valid GuiCommandType", () => {
    const entity = createCommandEntity(makeOpts());
    const file = serializeCommandEntity(entity);
    expect(isGuiCommandType(file.type)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Serialiser: validation and error cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-F — serializeCommandEntity() validation", () => {

  it("8.1f-1: throws if action_type is not a registered GuiCommandType", () => {
    // Create an entity with a valid action_type, then mutate to test the guard
    const entity = createCommandEntity(makeOpts());
    // Build a fake entity with invalid action_type
    const badEntity: CommandEntity = {
      ...entity,
      action_type: "agent.unknown_action",
    };
    expect(() => serializeCommandEntity(badEntity)).toThrow(/Unknown action_type/);
  });

  it("8.1f-2: error message includes the offending action_type", () => {
    const entity = createCommandEntity(makeOpts());
    const badEntity: CommandEntity = {
      ...entity,
      action_type: "totally.invalid",
    };
    try {
      serializeCommandEntity(badEntity);
      expect.fail("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("totally.invalid");
    }
  });

  it("8.1f-3: does NOT throw for all valid GuiCommandType values", () => {
    const validTypes = [
      "agent.spawn", "agent.terminate", "agent.restart",
      "agent.pause", "agent.resume", "agent.assign", "agent.send_command",
      "task.create", "task.assign", "task.cancel", "task.update_spec",
      "meeting.convene",
      "nav.drill_down", "nav.drill_up", "nav.camera_preset", "nav.focus_entity",
      "config.room_mapping", "config.agent_persona", "config.building_layout",
      "pipeline.trigger", "pipeline.chain", "pipeline.cancel",
    ] as const;

    for (const t of validTypes) {
      const entity = createCommandEntity(makeOpts({ action_type: t }));
      expect(() => serializeCommandEntity(entity)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Validation: isCommandEntity() type guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-G — isCommandEntity() type guard", () => {

  it("8.1g-1: returns true for a valid entity from createCommandEntity()", () => {
    const entity = createCommandEntity(makeOpts());
    expect(isCommandEntity(entity)).toBe(true);
  });

  it("8.1g-2: returns false for null", () => {
    expect(isCommandEntity(null)).toBe(false);
  });

  it("8.1g-3: returns false for a plain string", () => {
    expect(isCommandEntity("cmd_001")).toBe(false);
  });

  it("8.1g-4: returns false for an empty object", () => {
    expect(isCommandEntity({})).toBe(false);
  });

  it("8.1g-5: returns false when command_id is missing", () => {
    const { command_id: _, ...rest } = createCommandEntity(makeOpts());
    expect(isCommandEntity(rest)).toBe(false);
  });

  it("8.1g-6: returns false when source_entity_id is missing", () => {
    const { source_entity_id: _, ...rest } = createCommandEntity(makeOpts());
    expect(isCommandEntity(rest)).toBe(false);
  });

  it("8.1g-7: returns false when action_type is missing", () => {
    const { action_type: _, ...rest } = createCommandEntity(makeOpts());
    expect(isCommandEntity(rest)).toBe(false);
  });

  it("8.1g-8: returns false when payload is missing", () => {
    const { payload: _, ...rest } = createCommandEntity(makeOpts());
    expect(isCommandEntity(rest)).toBe(false);
  });

  it("8.1g-9: returns false when lifecycle_state is missing", () => {
    const { lifecycle_state: _, ...rest } = createCommandEntity(makeOpts());
    expect(isCommandEntity(rest)).toBe(false);
  });

  it("8.1g-10: returns false when source_entity_id is an empty string", () => {
    const entity = { ...createCommandEntity(makeOpts()), source_entity_id: "" };
    expect(isCommandEntity(entity)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. Inbox writer: writeCommandEntityToInbox() (network mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-H — writeCommandEntityToInbox() (mocked network)", () => {

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("8.1h-1: returns success:true and correct command_id on 202 response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:     true,
      status: 202,
      text:   async () => "",
    } as Response);

    const entity = createCommandEntity(makeOpts());
    const result = await writeCommandEntityToInbox(entity);

    expect(result.success).toBe(true);
    expect(result.command_id).toBe(entity.command_id);
    expect(result.error).toBeUndefined();
  });

  it("8.1h-2: POSTs JSON to /api/commands endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok:     true,
      status: 202,
      text:   async () => "",
    } as Response);
    global.fetch = mockFetch;

    const entity = createCommandEntity(makeOpts());
    await writeCommandEntityToInbox(entity);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/commands");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("8.1h-3: body contains serialised CommandFile with status=pending", async () => {
    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementationOnce((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return Promise.resolve({ ok: true, status: 202, text: async () => "" } as Response);
    });

    const entity = createCommandEntity(makeOpts());
    await writeCommandEntityToInbox(entity);

    expect(capturedBody).not.toBeNull();
    const body = capturedBody as Record<string, unknown>;
    expect(body["command_id"]).toBe(entity.command_id);
    expect(body["status"]).toBe("pending");
    expect(body["type"]).toBe(entity.action_type);
    expect(body["causation_id"]).toBe(entity.source_entity_id);
  });

  it("8.1h-4: returns success:false on non-ok HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:     false,
      status: 422,
      text:   async () => "Unprocessable Entity",
    } as Response);

    const entity = createCommandEntity(makeOpts());
    const result = await writeCommandEntityToInbox(entity);

    expect(result.success).toBe(false);
    expect(result.command_id).toBe(entity.command_id);
    expect(result.error).toContain("422");
  });

  it("8.1h-5: returns success:false on network error (fetch throws)", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const entity = createCommandEntity(makeOpts());
    const result = await writeCommandEntityToInbox(entity);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("8.1h-6: returns success:false with error when action_type is invalid", async () => {
    // Entity with bad action_type should fail during serialisation
    const entity = createCommandEntity(makeOpts());
    const badEntity: CommandEntity = { ...entity, action_type: "bad.action" };

    const result = await writeCommandEntityToInbox(badEntity);
    expect(result.success).toBe(false);
    expect(result.error).toContain("bad.action");
  });

  it("8.1h-7: command_id in result matches entity.command_id on failure", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("timeout"));

    const entity = createCommandEntity(makeOpts());
    const result = await writeCommandEntityToInbox(entity);

    expect(result.command_id).toBe(entity.command_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Convenience: createAndWriteCommandEntity()
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-I — createAndWriteCommandEntity() convenience helper", () => {

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("8.1i-1: returns entity and result together", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 202, text: async () => "",
    } as Response);

    const { entity, result } = await createAndWriteCommandEntity(makeOpts());

    expect(entity).toBeDefined();
    expect(result).toBeDefined();
    expect(isCommandEntity(entity)).toBe(true);
    expect(result.command_id).toBe(entity.command_id);
  });

  it("8.1i-2: entity has lifecycle_state 'pending' even after successful write", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 202, text: async () => "",
    } as Response);

    const { entity } = await createAndWriteCommandEntity(makeOpts());
    // The entity is immutable — lifecycle_state stays "pending" on the GUI side
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("8.1i-3: result.success is false when write fails", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("offline"));

    const { entity, result } = await createAndWriteCommandEntity(makeOpts());
    expect(result.success).toBe(false);
    // Entity is still created (write failure does not prevent entity creation)
    expect(isCommandEntity(entity)).toBe(true);
  });

  it("8.1i-4: entity.source_entity_id matches the opts value", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 202, text: async () => "",
    } as Response);

    const { entity } = await createAndWriteCommandEntity(
      makeOpts({ source_entity_id: "room:war-room" }),
    );
    expect(entity.source_entity_id).toBe("room:war-room");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. Constants and type exports
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 8.1-J — Constants and exports", () => {

  it("8.1j-1: COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE is 'pending'", () => {
    expect(COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE).toBe("pending");
  });

  it("8.1j-2: COMMAND_ENTITY_DEFAULT_RUN_ID is a non-empty string", () => {
    expect(typeof COMMAND_ENTITY_DEFAULT_RUN_ID).toBe("string");
    expect(COMMAND_ENTITY_DEFAULT_RUN_ID.length).toBeGreaterThan(0);
  });

  it("8.1j-3: generateCommandEntityId produces the ULID prefix", () => {
    const id = generateCommandEntityId();
    expect(id.startsWith(COMMAND_FILE_PREFIX)).toBe(true);
  });

  it("8.1j-4: generateCommandEntityId produces 26-char suffix", () => {
    const id = generateCommandEntityId();
    const suffix = id.slice(COMMAND_FILE_PREFIX.length);
    expect(suffix.length).toBe(26);
  });

  it("8.1j-5: generateCommandEntityId produces only Crockford base32 characters in suffix", () => {
    const VALID_CHARS = new Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    for (let i = 0; i < 20; i++) {
      const id = generateCommandEntityId();
      const suffix = id.slice(COMMAND_FILE_PREFIX.length);
      for (const ch of suffix) {
        expect(VALID_CHARS.has(ch)).toBe(true);
      }
    }
  });

  it("8.1j-6: all five CommandEntityLifecycleState values are well-known strings", () => {
    const states: CommandEntityLifecycleState[] = [
      "pending", "accepted", "executing", "completed", "failed",
    ];
    for (const s of states) {
      expect(typeof s).toBe("string");
    }
  });

  it("8.1j-7: COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE is a member of the valid state set", () => {
    const validStates: CommandEntityLifecycleState[] = [
      "pending", "accepted", "executing", "completed", "failed",
    ];
    expect(validStates).toContain(COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE);
  });
});
