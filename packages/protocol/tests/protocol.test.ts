/**
 * @conitens/protocol tests — RFC-1.0.1 invariant validation
 *
 * These tests run BEFORE any orchestrator/reducer/adapter code exists.
 * They lock the protocol contract so that implementation cannot drift.
 */
import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  EVENT_TYPES, isValidEventType, resolveAlias, OBSOLETE_ALIASES,
  TASK_STATES, VALID_TRANSITIONS, canTransition, isTerminal,
  HANDOFF_STATES, VALID_HANDOFF_TRANSITIONS, canHandoffTransition,
  classifyPath, PATHS, isReplayRelevant,
  REDUCERS, findOwner, type ReducerName,
  computeSubjectHash, verifySubjectHash, isHighRiskCommand,
  makeIdempotencyKey,
  redactString, redactPayload, DEFAULT_PATTERNS,
  LAYOUT_EVENT_TYPES, LAYOUT_EVENT_TYPE_SET, isLayoutEventType,
  // layout.init — spatial bootstrapping (Sub-AC 1)
  isLayoutInitPayload,
  // layout.update (INITIATED) / layout.updated (COMPLETED) — Sub-AC 1
  isLayoutUpdatePayload,
  isLayoutCreatedPayload, isLayoutUpdatedPayload, isLayoutDeletedPayload,
  isLayoutNodeMovedPayload,
  isLayoutResetPayload, isLayoutSavedPayload,
  isLayoutLoadedPayload, isLayoutChangedPayload,
  isValidLayoutPayload, LAYOUT_PAYLOAD_GUARDS,
  MEETING_EVENT_TYPES, MEETING_EVENT_TYPE_SET, isMeetingEventType,
  isMeetingScheduledPayload,
  isMeetingStartedPayload, isMeetingEndedPayload,
  isMeetingParticipantJoinedPayload, isMeetingParticipantLeftPayload,
  // Sub-AC 10d protocol phase event type guards
  isMeetingDeliberationPayload, isMeetingResolvedPayload,
  isValidMeetingPayload, MEETING_PAYLOAD_GUARDS,
  SCHEMA_EVENT_TYPES, SCHEMA_EVENT_TYPE_SET, isSchemaEventType,
  isSchemaRegisteredPayload, isSchemaUpdatedPayload,
  isSchemaDeprecatedPayload, isSchemaRemovedPayload,
  isSchemaValidatedPayload, isSchemaMigratedPayload,
  isValidSchemaPayload, SCHEMA_PAYLOAD_GUARDS,
  PIPELINE_EVENT_TYPES, PIPELINE_EVENT_TYPE_SET, isPipelineEventType,
  isPipelineStartedPayload, isPipelineStepPayload,
  isPipelineStageCompletedPayload, isPipelineCompletedPayload,
  isPipelineFailedPayload, isPipelineCancelledPayload,
  isValidPipelinePayload, PIPELINE_PAYLOAD_GUARDS,
  INTERACTION_EVENT_TYPES, INTERACTION_EVENT_TYPE_SET, isInteractionEventType,
  isInteractionUserInputPayload,
  isInteractionSelectionChangedPayload,
  isInteractionReplayTriggeredPayload,
  isInteractionViewportChangedPayload,
  isInteractionSelectedPayload,
  isInteractionHoveredPayload,
  isInteractionDismissedPayload,
  isValidInteractionPayload, INTERACTION_PAYLOAD_GUARDS,
  FIXTURE_EVENT_TYPES, FIXTURE_EVENT_TYPE_SET, isFixtureEventType,
  isFixturePanelToggledPayload,
  isFixtureHandlePulledPayload,
  isFixtureButtonPressedPayload,
  isFixtureStateChangedPayload,
  isFixturePlacedPayload,
  isFixtureRemovedPayload,
  isFixtureUpdatedPayload,
  isValidFixturePayload, FIXTURE_PAYLOAD_GUARDS,
} from "../src/index.js";

// ===========================================================================
// §4 — EventType exhaustiveness
// ===========================================================================

describe("EventType", () => {
  it("has no duplicates", () => {
    const set = new Set(EVENT_TYPES);
    expect(set.size).toBe(EVENT_TYPES.length);
  });

  it("includes all RFC-1.0.1 required types", () => {
    const required = [
      "task.created", "task.spec_updated",
      "handoff.completed",       // RFC-1.0.1 (from errata E-2)
      "command.rejected",        // RFC-1.0.1 (from errata E-5)
      "memory.update_proposed", "memory.update_approved", "memory.update_rejected",
      "approval.requested", "approval.granted", "approval.denied",
    ];
    for (const t of required) {
      expect(isValidEventType(t), `missing: ${t}`).toBe(true);
    }
  });

  it("rejects invalid types", () => {
    expect(isValidEventType("task.updated")).toBe(false);
    expect(isValidEventType("bogus")).toBe(false);
  });

  it("resolves obsolete aliases to canonical types", () => {
    expect(resolveAlias("task.updated")).toBe("task.status_changed");
    expect(resolveAlias("message.new")).toBe("message.received");
    expect(resolveAlias("artifact.generated")).toBe("task.artifact_added");
    expect(resolveAlias("approval.required")).toBe("approval.requested");
  });

  it("resolveAlias returns null for unknown types", () => {
    expect(resolveAlias("completely.unknown")).toBeNull();
  });

  it("resolveAlias returns canonical type as-is", () => {
    expect(resolveAlias("task.created")).toBe("task.created");
  });

  it("schema version is correct", () => {
    expect(SCHEMA_VERSION).toBe("conitens.event.v1");
  });
});

// ===========================================================================
// §5 — Task state machine
// ===========================================================================

describe("TaskState", () => {
  it("defines exactly 9 states", () => {
    expect(TASK_STATES).toHaveLength(9);
  });

  it("allows valid transitions", () => {
    expect(canTransition("draft", "planned")).toBe(true);
    expect(canTransition("active", "review")).toBe(true);
    expect(canTransition("review", "done")).toBe(true);
    expect(canTransition("failed", "assigned")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransition("draft", "active")).toBe(false);
    expect(canTransition("done", "active")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
    expect(canTransition("review", "planned")).toBe(false);
  });

  it("terminal states have no outgoing transitions", () => {
    expect(VALID_TRANSITIONS.done).toHaveLength(0);
    expect(VALID_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it("identifies terminal states", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("active")).toBe(false);
  });

  it("every non-terminal state can reach cancelled", () => {
    for (const state of TASK_STATES) {
      if (state === "done" || state === "cancelled" || state === "failed") continue;
      expect(canTransition(state, "cancelled"), `${state} → cancelled`).toBe(true);
    }
  });

  it("failed can only go to assigned (re-assignment)", () => {
    expect(VALID_TRANSITIONS.failed).toEqual(["assigned"]);
  });
});

describe("HandoffState", () => {
  it("allows requested → accepted → completed", () => {
    expect(canHandoffTransition("requested", "accepted")).toBe(true);
    expect(canHandoffTransition("accepted", "completed")).toBe(true);
  });

  it("allows requested → rejected", () => {
    expect(canHandoffTransition("requested", "rejected")).toBe(true);
  });

  it("rejected and completed are terminal", () => {
    expect(VALID_HANDOFF_TRANSITIONS.rejected).toHaveLength(0);
    expect(VALID_HANDOFF_TRANSITIONS.completed).toHaveLength(0);
  });
});

// ===========================================================================
// §2 — Path classification (table-driven)
// ===========================================================================

describe("classifyPath", () => {
  const cases: [string, ReturnType<typeof classifyPath>][] = [
    // Event
    ["events/2026-03-17.jsonl", "event"],
    ["traces/trace-2026-03-17.jsonl", "event"],
    // Command
    ["commands/cmd-001.md", "command"],
    ["mailboxes/claude/inbox/msg-001.md", "command"],
    ["mailboxes/broadcast/msg-002.md", "command"],
    // View
    ["views/TASKS.md", "view"],
    ["views/APPROVALS.md", "view"],
    ["views/CONTEXT.md", "view"],
    ["views/STATUS.md", "view"],
    ["runtime/state.sqlite", "view"],
    ["runtime/heartbeat-cache/claude.json", "view"],
    // Operational
    ["runtime/locks/agent-claude.lock", "operational"],
    ["runtime/pids/orchestrator.pid", "operational"],
    // Entity
    ["task-specs/task-0001.md", "entity"],
    ["tasks/task-0001.md", "entity"],
    ["decisions/ADR-0001.md", "entity"],
    ["handoffs/handoff-20260317-001.md", "entity"],
    ["agents/claude/memory.md", "entity"],
    ["agents/claude/memory.proposed.md", "entity"],
    ["agents/codex/memory.sqlite", "entity"],
    // Control
    ["agents/claude/persona.yaml", "control"],
    ["agents/claude/recall-policy.yaml", "control"],
    ["policies/redaction.yaml", "control"],
    ["config/hub.yaml", "control"],
    ["MODE.md", "control"],
  ];

  for (const [path, expected] of cases) {
    it(`${path} → ${expected}`, () => {
      expect(classifyPath(path)).toBe(expected);
    });
  }

  it("throws on unclassified path", () => {
    expect(() => classifyPath("unknown/file.txt")).toThrow("Unclassified");
  });

  it("operational paths are not replay-relevant", () => {
    expect(isReplayRelevant("runtime/locks/x.lock")).toBe(false);
    expect(isReplayRelevant("runtime/pids/x.pid")).toBe(false);
  });

  it("view paths are replay-relevant", () => {
    expect(isReplayRelevant("views/STATUS.md")).toBe(true);
    expect(isReplayRelevant("runtime/state.sqlite")).toBe(true);
  });
});

// ===========================================================================
// §11 — Ownership uniqueness
// ===========================================================================

describe("Ownership", () => {
  it("no file pattern is owned by multiple reducers", () => {
    const allPatterns: string[] = [];
    for (const r of REDUCERS) {
      for (const p of r.ownedFiles) {
        expect(allPatterns).not.toContain(p);
        allPatterns.push(p);
      }
    }
  });

  it("findOwner returns correct reducer for known files", () => {
    expect(findOwner("tasks/task-0001.md")).toBe("TaskReducer");
    expect(findOwner("views/TASKS.md")).toBe("TaskReducer");
    expect(findOwner("views/APPROVALS.md")).toBe("ApprovalReducer");
    expect(findOwner("views/STATUS.md")).toBe("StatusReducer");
    expect(findOwner("views/CONTEXT.md")).toBe("ContextReducer");
    expect(findOwner("agents/claude/memory.proposed.md")).toBe("MemoryReducer");
    expect(findOwner("agents/claude/memory.md")).toBe("MemoryCuratorReducer");
    expect(findOwner("runtime/state.sqlite")).toBe("SQLiteReducer");
  });

  it("findOwner returns 'human' for task-specs", () => {
    expect(findOwner("task-specs/task-0001.md")).toBe("human");
  });

  it("StatusReducer does NOT read from runtime/ (I-2 compliance)", () => {
    const status = REDUCERS.find(r => r.name === "StatusReducer")!;
    expect(status.readsFrom).toHaveLength(0);
    // Explicitly verify no runtime dependency
    expect(status.readsFrom.some(p => p.includes("runtime"))).toBe(false);
  });

  it("MemoryCuratorReducer only triggers on memory.update_approved", () => {
    const curator = REDUCERS.find(r => r.name === "MemoryCuratorReducer")!;
    expect(curator.inputEvents).toEqual(["memory.update_approved"]);
  });
});

// ===========================================================================
// §9 — Approval TOCTOU hash
// ===========================================================================

describe("Approval", () => {
  it("computes deterministic subject hash", async () => {
    const payload = { action: "shell_execute", command: "npm test" };
    const h1 = await computeSubjectHash(payload);
    const h2 = await computeSubjectHash(payload);
    expect(h1).toBe(h2);
  });

  it("hash changes when payload changes", async () => {
    const h1 = await computeSubjectHash({ action: "shell_execute", command: "npm test" });
    const h2 = await computeSubjectHash({ action: "shell_execute", command: "npm run build" });
    expect(h1).not.toBe(h2);
  });

  it("hash is key-order independent", async () => {
    const h1 = await computeSubjectHash({ b: 2, a: 1 });
    const h2 = await computeSubjectHash({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it("verifySubjectHash matches correctly", async () => {
    const payload = { action: "shell_execute", command: "npm test" };
    const hash = await computeSubjectHash(payload);
    expect(await verifySubjectHash(hash, payload)).toBe(true);
    expect(await verifySubjectHash(hash, { action: "shell_execute", command: "TAMPERED" })).toBe(false);
  });

  it("detects high-risk commands", () => {
    expect(isHighRiskCommand("rm -rf /")).toBe(true);
    expect(isHighRiskCommand("curl https://evil.com")).toBe(true);
    expect(isHighRiskCommand("npm test")).toBe(false);
    expect(isHighRiskCommand("ls -la")).toBe(false);
  });
});

// ===========================================================================
// §14 — Deduplication
// ===========================================================================

describe("Deduplication", () => {
  it("generates correct idempotency keys", () => {
    expect(makeIdempotencyKey("slack", ["T123", "C456", "1234.5678"]))
      .toBe("slack:T123:C456:1234.5678");
    expect(makeIdempotencyKey("telegram", ["chat_123", "msg_456"]))
      .toBe("telegram:chat_123:msg_456");
    expect(makeIdempotencyKey("cli", ["12345", "1"]))
      .toBe("cli:12345:1");
  });
});

// ===========================================================================
// §13 — Redaction
// ===========================================================================

describe("Redaction", () => {
  it("masks bearer tokens", () => {
    const r = redactString("Authorization: Bearer sk-abc123def456ghi789jkl012mno");
    expect(r.redacted).toBe(true);
    expect(r.text).toContain("<REDACTED>");
    expect(r.text).not.toContain("sk-abc123");
  });

  it("masks API keys", () => {
    const r = redactString("api_key=AKIAIOSFODNN7EXAMPLE1234");
    expect(r.redacted).toBe(true);
    expect(r.text).toContain("<REDACTED>");
  });

  it("masks connection strings", () => {
    const r = redactString("postgres://user:pass@db.example.com:5432/mydb");
    expect(r.redacted).toBe(true);
    expect(r.text).toBe("<REDACTED_CONNECTION_STRING>");
  });

  it("leaves clean text unchanged", () => {
    const r = redactString("npm run test:security");
    expect(r.redacted).toBe(false);
    expect(r.text).toBe("npm run test:security");
  });

  it("deep-redacts payload objects", () => {
    const r = redactPayload({
      command: "curl -H 'Authorization: Bearer sk-supersecretkey123456789' https://api.com",
      safe_field: "hello world",
    });
    expect(r.redacted).toBe(true);
    expect(r.redacted_fields).toContain("payload.command");
    expect(JSON.stringify(r.payload)).not.toContain("supersecret");
  });

  it("handles nested objects", () => {
    const r = redactPayload({
      config: { database: { url: "postgres://admin:s3cret@db.internal:5432/prod" } },
    });
    expect(r.redacted).toBe(true);
    expect(r.redacted_fields.some(f => f.includes("config.database.url"))).toBe(true);
  });
});

// ===========================================================================
// Layout event types — §4 extension for 3D command-center
// ===========================================================================

describe("Layout EventTypes", () => {
  it("layout.init, layout.update, layout.reset and core layout events are in EVENT_TYPES (Sub-AC 1)", () => {
    // Spatial bootstrapping events — Sub-AC 1 requirements
    expect(isValidEventType("layout.init")).toBe(true);
    expect(isValidEventType("layout.update")).toBe(true);
    expect(isValidEventType("layout.reset")).toBe(true);
    // Core CRUD layout events
    expect(isValidEventType("layout.created")).toBe(true);
    expect(isValidEventType("layout.updated")).toBe(true);
    expect(isValidEventType("layout.deleted")).toBe(true);
    expect(isValidEventType("layout.node.moved")).toBe(true);
  });

  it("all canonical layout event types are in EVENT_TYPES", () => {
    for (const t of LAYOUT_EVENT_TYPES) {
      expect(isValidEventType(t), `missing: ${t}`).toBe(true);
    }
  });

  it("LAYOUT_EVENT_TYPES has no duplicates", () => {
    const set = new Set(LAYOUT_EVENT_TYPES);
    expect(set.size).toBe(LAYOUT_EVENT_TYPES.length);
  });

  it("isLayoutEventType correctly narrows layout event strings", () => {
    // Sub-AC 1: spatial bootstrapping events
    expect(isLayoutEventType("layout.init")).toBe(true);
    expect(isLayoutEventType("layout.update")).toBe(true);
    expect(isLayoutEventType("layout.reset")).toBe(true);
    // Other canonical layout events
    expect(isLayoutEventType("layout.created")).toBe(true);
    expect(isLayoutEventType("layout.updated")).toBe(true);
    expect(isLayoutEventType("layout.deleted")).toBe(true);
    expect(isLayoutEventType("layout.node.moved")).toBe(true);
    expect(isLayoutEventType("layout.saved")).toBe(true);
    expect(isLayoutEventType("layout.loaded")).toBe(true);
    expect(isLayoutEventType("layout.changed")).toBe(true);
  });

  it("isLayoutEventType rejects non-layout event strings", () => {
    expect(isLayoutEventType("task.created")).toBe(false);
    expect(isLayoutEventType("agent.moved")).toBe(false);
    expect(isLayoutEventType("layout.unknown")).toBe(false);
    expect(isLayoutEventType("")).toBe(false);
  });

  it("LAYOUT_EVENT_TYPE_SET size matches LAYOUT_EVENT_TYPES length", () => {
    expect(LAYOUT_EVENT_TYPE_SET.size).toBe(LAYOUT_EVENT_TYPES.length);
  });
});

describe("Layout payload type guards", () => {
  // --- layout.init — spatial bootstrapping (Sub-AC 1) ---
  describe("isLayoutInitPayload", () => {
    const minimalValidPayload = {
      layout_id: "main-layout",
      building_id: "conitens-hq",
      rooms: [
        { room_id: "ops-control", position: { x: 4, y: 3, z: 0 } },
        { room_id: "impl-office", position: { x: 10, y: 3, z: 0 } },
      ],
    };

    it("accepts a minimal valid payload (layout_id, building_id, non-empty rooms)", () => {
      expect(isLayoutInitPayload(minimalValidPayload)).toBe(true);
    });

    it("accepts a full payload with agents, fixtures, source, initiated_by, and snapshot", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [
          { room_id: "ops-control", position: { x: 4, y: 3, z: 0 }, floor: 1 },
          { room_id: "impl-office", position: { x: 10, y: 3, z: 0 }, floor: 1 },
        ],
        agents: [
          { agent_id: "manager-default", room_id: "ops-control", position: { x: 2, y: 0, z: 2 } },
        ],
        fixtures: [
          { fixture_id: "ops-control.command-desk.0", fixture_type: "command-desk",
            room_id: "ops-control", position: { x: 2.5, y: 0, z: 2 } },
        ],
        source: "config",
        initiated_by: "system",
        snapshot: { room_count: 2, agent_count: 1 },
        snapshot_schema_version: "layout-init@1.0.0",
      })).toBe(true);
    });

    it("accepts payload with source='replay' (cold-start replay scenario)", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [{ room_id: "ops-control", position: { x: 4, y: 3, z: 0 } }],
        source: "replay",
        initiated_by: "replay-engine",
      })).toBe(true);
    });

    it("accepts payload with source='migration'", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [{ room_id: "r1", position: { x: 0, y: 0, z: 0 } }],
        source: "migration",
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutInitPayload({
        building_id: "conitens-hq",
        rooms: [{ room_id: "r1", position: { x: 0, y: 0, z: 0 } }],
      })).toBe(false);
    });

    it("rejects non-string layout_id", () => {
      expect(isLayoutInitPayload({
        layout_id: 42,
        building_id: "conitens-hq",
        rooms: [{ room_id: "r1", position: { x: 0, y: 0, z: 0 } }],
      })).toBe(false);
    });

    it("rejects missing building_id", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        rooms: [{ room_id: "r1", position: { x: 0, y: 0, z: 0 } }],
      })).toBe(false);
    });

    it("rejects non-string building_id", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: { id: "conitens-hq" },
        rooms: [{ room_id: "r1", position: { x: 0, y: 0, z: 0 } }],
      })).toBe(false);
    });

    it("rejects missing rooms array", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
      })).toBe(false);
    });

    it("rejects empty rooms array (must be non-empty)", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [],
      })).toBe(false);
    });

    it("rejects rooms array with non-object entries", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: ["room-string"],
      })).toBe(false);
    });

    it("rejects rooms array with entries missing room_id", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [{ position: { x: 0, y: 0, z: 0 } }],
      })).toBe(false);
    });

    it("rejects rooms array with entries missing position Vec3", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [{ room_id: "r1", position: { x: 0, y: 0 } }],
      })).toBe(false);
    });

    it("rejects rooms with non-Vec3 position (string instead)", () => {
      expect(isLayoutInitPayload({
        layout_id: "main-layout",
        building_id: "conitens-hq",
        rooms: [{ room_id: "r1", position: "0,0,0" }],
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutInitPayload(null)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isLayoutInitPayload(undefined)).toBe(false);
    });

    it("rejects primitive string", () => {
      expect(isLayoutInitPayload("layout.init")).toBe(false);
    });

    it("isValidLayoutPayload dispatches correctly for layout.init", () => {
      expect(isValidLayoutPayload("layout.init", minimalValidPayload)).toBe(true);
      expect(isValidLayoutPayload("layout.init", {})).toBe(false);
      expect(isValidLayoutPayload("layout.init", { layout_id: "x", building_id: "y", rooms: [] })).toBe(false);
    });

    it("isLayoutInitPayload is covered by LAYOUT_PAYLOAD_GUARDS['layout.init']", () => {
      const guard = LAYOUT_PAYLOAD_GUARDS["layout.init"];
      expect(typeof guard).toBe("function");
      expect(guard(minimalValidPayload)).toBe(true);
      expect(guard({})).toBe(false);
    });
  });

  // --- layout.update — update INITIATED (Sub-AC 1) ---
  describe("isLayoutUpdatePayload", () => {
    it("accepts minimal payload with only layout_id", () => {
      expect(isLayoutUpdatePayload({ layout_id: "main-layout" })).toBe(true);
    });

    it("accepts full payload with all optional fields", () => {
      expect(isLayoutUpdatePayload({
        layout_id: "main-layout",
        fields_to_update: ["camera.position", "rooms.lab.scale"],
        reason: "user_drag",
        initiated_by: "user-operator",
      })).toBe(true);
    });

    it("accepts payload with empty fields_to_update array", () => {
      expect(isLayoutUpdatePayload({
        layout_id: "main-layout",
        fields_to_update: [],
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutUpdatePayload({ reason: "config_reload" })).toBe(false);
    });

    it("rejects non-string layout_id", () => {
      expect(isLayoutUpdatePayload({ layout_id: 99 })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutUpdatePayload(null)).toBe(false);
    });

    it("isValidLayoutPayload dispatches correctly for layout.update", () => {
      expect(isValidLayoutPayload("layout.update", { layout_id: "main-layout" })).toBe(true);
      expect(isValidLayoutPayload("layout.update", {})).toBe(false);
    });

    it("isLayoutUpdatePayload is covered by LAYOUT_PAYLOAD_GUARDS['layout.update']", () => {
      const guard = LAYOUT_PAYLOAD_GUARDS["layout.update"];
      expect(typeof guard).toBe("function");
      expect(guard({ layout_id: "x" })).toBe(true);
      expect(guard({})).toBe(false);
    });
  });

  // --- layout.created (Sub-AC 1) ---
  describe("isLayoutCreatedPayload", () => {
    it("accepts minimal payload with only layout_id", () => {
      expect(isLayoutCreatedPayload({ layout_id: "main" })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isLayoutCreatedPayload({
        layout_id: "main",
        name: "Main Layout",
        description: "Primary 3D command-center view",
        created_by: "user-admin",
        initial_snapshot: { rooms: [], camera: {} },
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutCreatedPayload({ name: "Orphan" })).toBe(false);
    });

    it("rejects non-string layout_id", () => {
      expect(isLayoutCreatedPayload({ layout_id: 42 })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutCreatedPayload(null)).toBe(false);
    });

    it("isValidLayoutPayload dispatches correctly for layout.created", () => {
      expect(isValidLayoutPayload("layout.created", { layout_id: "main" })).toBe(true);
      expect(isValidLayoutPayload("layout.created", {})).toBe(false);
    });
  });

  // --- layout.deleted (Sub-AC 1) ---
  describe("isLayoutDeletedPayload", () => {
    it("accepts minimal payload with only layout_id", () => {
      expect(isLayoutDeletedPayload({ layout_id: "old-layout" })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isLayoutDeletedPayload({
        layout_id: "old-layout",
        reason: "replaced_by_new",
        deleted_by: "agent-manager",
        prev_snapshot: { rooms: [{ id: "r1" }] },
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutDeletedPayload({ reason: "migration" })).toBe(false);
    });

    it("rejects non-string layout_id", () => {
      expect(isLayoutDeletedPayload({ layout_id: false })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutDeletedPayload(null)).toBe(false);
    });

    it("isValidLayoutPayload dispatches correctly for layout.deleted", () => {
      expect(isValidLayoutPayload("layout.deleted", { layout_id: "old-layout" })).toBe(true);
      expect(isValidLayoutPayload("layout.deleted", {})).toBe(false);
    });
  });

  // --- layout.updated ---
  describe("isLayoutUpdatedPayload", () => {
    it("accepts valid payload", () => {
      expect(isLayoutUpdatedPayload({
        layout_id: "main",
        changed_fields: ["camera.position", "rooms.lab.scale"],
      })).toBe(true);
    });

    it("accepts payload with optional snapshots", () => {
      expect(isLayoutUpdatedPayload({
        layout_id: "main",
        changed_fields: ["viewport.fov"],
        prev_snapshot: { fov: 60 },
        new_snapshot: { fov: 75 },
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutUpdatedPayload({ changed_fields: ["x"] })).toBe(false);
    });

    it("rejects missing changed_fields", () => {
      expect(isLayoutUpdatedPayload({ layout_id: "main" })).toBe(false);
    });

    it("rejects non-string entries in changed_fields", () => {
      expect(isLayoutUpdatedPayload({ layout_id: "main", changed_fields: [1, 2] })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutUpdatedPayload(null)).toBe(false);
    });
  });

  // --- layout.node.moved ---
  describe("isLayoutNodeMovedPayload", () => {
    const validPayload = {
      layout_id: "main",
      node_id: "room-lab",
      node_type: "room",
      from_position: { x: 0, y: 0, z: 0 },
      to_position: { x: 10, y: 0, z: 5 },
    };

    it("accepts valid payload", () => {
      expect(isLayoutNodeMovedPayload(validPayload)).toBe(true);
    });

    it("accepts all valid node_type values", () => {
      const validTypes = ["room", "desk", "agent", "camera", "building", "prop"] as const;
      for (const node_type of validTypes) {
        expect(isLayoutNodeMovedPayload({ ...validPayload, node_type }),
          `node_type "${node_type}" should be valid`).toBe(true);
      }
    });

    it("accepts optional rotation fields", () => {
      expect(isLayoutNodeMovedPayload({
        ...validPayload,
        from_rotation: { x: 0, y: 0, z: 0 },
        to_rotation: { x: 0, y: 1.57, z: 0 },
      })).toBe(true);
    });

    it("accepts optional scale fields", () => {
      expect(isLayoutNodeMovedPayload({
        ...validPayload,
        from_scale: { x: 1, y: 1, z: 1 },
        to_scale: { x: 2, y: 2, z: 2 },
      })).toBe(true);
    });

    it("rejects invalid node_type", () => {
      expect(isLayoutNodeMovedPayload({ ...validPayload, node_type: "unknown" })).toBe(false);
    });

    it("rejects missing from_position", () => {
      const { from_position: _fp, ...rest } = validPayload;
      expect(isLayoutNodeMovedPayload(rest)).toBe(false);
    });

    it("rejects non-numeric Vec3 component", () => {
      expect(isLayoutNodeMovedPayload({
        ...validPayload,
        from_position: { x: "bad", y: 0, z: 0 },
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isLayoutNodeMovedPayload(null)).toBe(false);
    });
  });

  // --- layout.reset ---
  describe("isLayoutResetPayload", () => {
    it("accepts minimal payload with only layout_id", () => {
      expect(isLayoutResetPayload({ layout_id: "main" })).toBe(true);
    });

    it("accepts payload with optional fields", () => {
      expect(isLayoutResetPayload({
        layout_id: "main",
        reason: "user_requested",
        prev_snapshot: { rooms: [] },
      })).toBe(true);
    });

    it("rejects missing layout_id", () => {
      expect(isLayoutResetPayload({ reason: "x" })).toBe(false);
    });

    it("rejects non-string layout_id", () => {
      expect(isLayoutResetPayload({ layout_id: 42 })).toBe(false);
    });
  });

  // --- layout.saved ---
  describe("isLayoutSavedPayload", () => {
    it("accepts valid payload", () => {
      expect(isLayoutSavedPayload({
        layout_id: "main",
        save_path: "runtime/layout/main.json",
        snapshot: { rooms: [], camera: {} },
      })).toBe(true);
    });

    it("rejects missing save_path", () => {
      expect(isLayoutSavedPayload({
        layout_id: "main",
        snapshot: {},
      })).toBe(false);
    });

    it("rejects non-object snapshot", () => {
      expect(isLayoutSavedPayload({
        layout_id: "main",
        save_path: "runtime/layout/main.json",
        snapshot: "invalid",
      })).toBe(false);
    });
  });

  // --- layout.loaded ---
  describe("isLayoutLoadedPayload", () => {
    it("accepts valid payload", () => {
      expect(isLayoutLoadedPayload({
        layout_id: "main",
        load_path: "runtime/layout/main.json",
        snapshot: { rooms: [] },
      })).toBe(true);
    });

    it("rejects missing load_path", () => {
      expect(isLayoutLoadedPayload({
        layout_id: "main",
        snapshot: {},
      })).toBe(false);
    });
  });

  // --- layout.changed ---
  describe("isLayoutChangedPayload", () => {
    it("accepts valid payload", () => {
      expect(isLayoutChangedPayload({
        layout_id: "main",
        change_type: "room_added",
      })).toBe(true);
    });

    it("accepts payload with optional details", () => {
      expect(isLayoutChangedPayload({
        layout_id: "main",
        change_type: "theme_changed",
        details: { from: "dark", to: "light" },
      })).toBe(true);
    });

    it("rejects missing change_type", () => {
      expect(isLayoutChangedPayload({ layout_id: "main" })).toBe(false);
    });
  });

  // --- isValidLayoutPayload dispatcher ---
  describe("isValidLayoutPayload", () => {
    it("dispatches to correct guard for layout.updated", () => {
      expect(isValidLayoutPayload("layout.updated", {
        layout_id: "main",
        changed_fields: ["camera.position"],
      })).toBe(true);
    });

    it("dispatches to correct guard for layout.node.moved", () => {
      expect(isValidLayoutPayload("layout.node.moved", {
        layout_id: "main",
        node_id: "room-lab",
        node_type: "room",
        from_position: { x: 0, y: 0, z: 0 },
        to_position: { x: 10, y: 0, z: 5 },
      })).toBe(true);
    });

    it("returns false when payload does not match event type schema", () => {
      // An empty object should fail layout.updated (missing changed_fields)
      expect(isValidLayoutPayload("layout.updated", { layout_id: "main" })).toBe(false);
    });
  });

  // --- LAYOUT_PAYLOAD_GUARDS completeness ---
  it("LAYOUT_PAYLOAD_GUARDS covers all LAYOUT_EVENT_TYPES", () => {
    for (const t of LAYOUT_EVENT_TYPES) {
      expect(typeof LAYOUT_PAYLOAD_GUARDS[t], `guard for "${t}" should be a function`).toBe("function");
    }
  });
});

// ===========================================================================
// Meeting event types — §4 extension for room-based collaboration
// ===========================================================================

describe("Meeting EventTypes", () => {
  it("all canonical meeting event types are in EVENT_TYPES (Sub-AC 1)", () => {
    expect(isValidEventType("meeting.scheduled")).toBe(true);
    expect(isValidEventType("meeting.started")).toBe(true);
    expect(isValidEventType("meeting.ended")).toBe(true);
    expect(isValidEventType("meeting.participant.joined")).toBe(true);
    expect(isValidEventType("meeting.participant.left")).toBe(true);
  });

  it("MEETING_EVENT_TYPES has exactly 10 entries (5 original + 2 Sub-AC 10d protocol phase events + 1 Sub-AC 10c task spawning event + 2 Sub-AC 2 lifecycle control events)", () => {
    expect(MEETING_EVENT_TYPES).toHaveLength(10);
  });

  it("MEETING_EVENT_TYPES has no duplicates", () => {
    const set = new Set(MEETING_EVENT_TYPES);
    expect(set.size).toBe(MEETING_EVENT_TYPES.length);
  });

  it("every MEETING_EVENT_TYPES entry is a valid EventType", () => {
    for (const t of MEETING_EVENT_TYPES) {
      expect(isValidEventType(t), `missing in EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("MEETING_EVENT_TYPE_SET size matches MEETING_EVENT_TYPES length", () => {
    expect(MEETING_EVENT_TYPE_SET.size).toBe(MEETING_EVENT_TYPES.length);
  });

  it("isMeetingEventType correctly narrows meeting event strings", () => {
    expect(isMeetingEventType("meeting.scheduled")).toBe(true);
    expect(isMeetingEventType("meeting.started")).toBe(true);
    expect(isMeetingEventType("meeting.ended")).toBe(true);
    expect(isMeetingEventType("meeting.participant.joined")).toBe(true);
    expect(isMeetingEventType("meeting.participant.left")).toBe(true);
    // Sub-AC 10d protocol phase events
    expect(isMeetingEventType("meeting.deliberation")).toBe(true);
    expect(isMeetingEventType("meeting.resolved")).toBe(true);
  });

  it("meeting.deliberation and meeting.resolved are in EVENT_TYPES (Sub-AC 10d)", () => {
    expect(isValidEventType("meeting.deliberation")).toBe(true);
    expect(isValidEventType("meeting.resolved")).toBe(true);
  });

  it("isMeetingEventType rejects non-meeting strings", () => {
    expect(isMeetingEventType("task.created")).toBe(false);
    expect(isMeetingEventType("layout.updated")).toBe(false);
    expect(isMeetingEventType("meeting.unknown")).toBe(false);
    expect(isMeetingEventType("")).toBe(false);
  });
});

describe("Meeting payload type guards", () => {
  // --- meeting.scheduled (Sub-AC 1) ---
  describe("isMeetingScheduledPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: "mtg-future-001",
        room_id: "ops-control",
        scheduled_by: "user-admin",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: "mtg-future-001",
        room_id: "ops-control",
        title: "Weekly Agent Sync",
        scheduled_by: "agent-manager",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
        expected_duration_ms: 3600000,
        invited_participant_ids: ["agent-implementer", "agent-researcher"],
        agenda: "Review sprint progress and assign next tasks",
      })).toBe(true);
    });

    it("rejects missing meeting_id", () => {
      expect(isMeetingScheduledPayload({
        room_id: "ops-control",
        scheduled_by: "user-admin",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(false);
    });

    it("rejects missing room_id", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: "mtg-001",
        scheduled_by: "user-admin",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(false);
    });

    it("rejects missing scheduled_by", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(false);
    });

    it("rejects missing scheduled_at_iso", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        scheduled_by: "user-admin",
      })).toBe(false);
    });

    it("rejects non-string fields", () => {
      expect(isMeetingScheduledPayload({
        meeting_id: 42,
        room_id: "ops-control",
        scheduled_by: "user-admin",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingScheduledPayload(null)).toBe(false);
    });

    it("isValidMeetingPayload dispatches correctly for meeting.scheduled", () => {
      expect(isValidMeetingPayload("meeting.scheduled", {
        meeting_id: "mtg-future-001",
        room_id: "ops-control",
        scheduled_by: "user-admin",
        scheduled_at_iso: "2026-03-25T14:00:00Z",
      })).toBe(true);
      // Missing scheduled_at_iso should fail
      expect(isValidMeetingPayload("meeting.scheduled", {
        meeting_id: "mtg-future-001",
        room_id: "ops-control",
        scheduled_by: "user-admin",
      })).toBe(false);
    });
  });

  // --- meeting.started ---
  describe("isMeetingStartedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        initiated_by: "agent-orchestrator",
        participant_ids: [],
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        title: "Sprint planning",
        initiated_by: "agent-orchestrator",
        participant_ids: ["agent-implementer", "agent-researcher"],
        agenda: "Review tasks for current sprint",
        scheduled_duration_ms: 3600000,
      })).toBe(true);
    });

    it("accepts payload with participants list", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-002",
        room_id: "research-lab",
        initiated_by: "user-admin",
        participant_ids: ["agent-a", "agent-b", "agent-c"],
      })).toBe(true);
    });

    it("rejects missing meeting_id", () => {
      expect(isMeetingStartedPayload({
        room_id: "ops-control",
        initiated_by: "agent-orchestrator",
        participant_ids: [],
      })).toBe(false);
    });

    it("rejects missing room_id", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        initiated_by: "agent-orchestrator",
        participant_ids: [],
      })).toBe(false);
    });

    it("rejects missing initiated_by", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        participant_ids: [],
      })).toBe(false);
    });

    it("rejects missing participant_ids", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        initiated_by: "agent-orchestrator",
      })).toBe(false);
    });

    it("rejects non-string entries in participant_ids", () => {
      expect(isMeetingStartedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        initiated_by: "agent-orchestrator",
        participant_ids: [1, 2, 3],
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingStartedPayload(null)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isMeetingStartedPayload("meeting-started")).toBe(false);
    });
  });

  // --- meeting.ended ---
  describe("isMeetingEndedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isMeetingEndedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isMeetingEndedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        ended_by: "agent-orchestrator",
        duration_ms: 1800000,
        outcome: "completed",
        summary: "Agreed on sprint tasks and assignments",
        decisions: ["decision-ADR-0042", "decision-ADR-0043"],
      })).toBe(true);
    });

    it("accepts all valid outcome values", () => {
      const outcomes = ["completed", "cancelled", "timed_out", "error"] as const;
      for (const outcome of outcomes) {
        expect(isMeetingEndedPayload({
          meeting_id: "mtg-001",
          room_id: "ops-control",
          outcome,
        }), `outcome "${outcome}" should be accepted`).toBe(true);
      }
    });

    it("rejects invalid outcome value", () => {
      expect(isMeetingEndedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        outcome: "unknown_outcome",
      })).toBe(false);
    });

    it("rejects non-string entries in decisions array", () => {
      expect(isMeetingEndedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        decisions: [42, true],
      })).toBe(false);
    });

    it("rejects non-array decisions", () => {
      expect(isMeetingEndedPayload({
        meeting_id: "mtg-001",
        room_id: "ops-control",
        decisions: "decision-001",
      })).toBe(false);
    });

    it("rejects missing meeting_id", () => {
      expect(isMeetingEndedPayload({ room_id: "ops-control" })).toBe(false);
    });

    it("rejects missing room_id", () => {
      expect(isMeetingEndedPayload({ meeting_id: "mtg-001" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingEndedPayload(null)).toBe(false);
    });
  });

  // --- meeting.participant.joined ---
  describe("isMeetingParticipantJoinedPayload", () => {
    const validPayload = {
      meeting_id: "mtg-001",
      room_id: "ops-control",
      participant_id: "agent-implementer",
      participant_kind: "agent",
    };

    it("accepts valid payload", () => {
      expect(isMeetingParticipantJoinedPayload(validPayload)).toBe(true);
    });

    it("accepts all valid participant_kind values", () => {
      const kinds = ["agent", "user", "system"] as const;
      for (const participant_kind of kinds) {
        expect(isMeetingParticipantJoinedPayload({ ...validPayload, participant_kind }),
          `participant_kind "${participant_kind}" should be accepted`).toBe(true);
      }
    });

    it("accepts payload with optional role", () => {
      expect(isMeetingParticipantJoinedPayload({
        ...validPayload,
        role: "facilitator",
      })).toBe(true);
    });

    it("rejects invalid participant_kind", () => {
      expect(isMeetingParticipantJoinedPayload({
        ...validPayload,
        participant_kind: "robot",
      })).toBe(false);
    });

    it("rejects missing participant_id", () => {
      const { participant_id: _id, ...rest } = validPayload;
      expect(isMeetingParticipantJoinedPayload(rest)).toBe(false);
    });

    it("rejects missing participant_kind", () => {
      const { participant_kind: _kind, ...rest } = validPayload;
      expect(isMeetingParticipantJoinedPayload(rest)).toBe(false);
    });

    it("rejects missing meeting_id", () => {
      expect(isMeetingParticipantJoinedPayload({
        room_id: "ops-control",
        participant_id: "agent-implementer",
        participant_kind: "agent",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingParticipantJoinedPayload(null)).toBe(false);
    });
  });

  // --- meeting.participant.left ---
  describe("isMeetingParticipantLeftPayload", () => {
    const validPayload = {
      meeting_id: "mtg-001",
      room_id: "ops-control",
      participant_id: "agent-implementer",
      participant_kind: "agent",
    };

    it("accepts valid payload without reason", () => {
      expect(isMeetingParticipantLeftPayload(validPayload)).toBe(true);
    });

    it("accepts all valid leave reason values", () => {
      const reasons = ["completed", "ejected", "disconnected", "error"] as const;
      for (const reason of reasons) {
        expect(isMeetingParticipantLeftPayload({ ...validPayload, reason }),
          `reason "${reason}" should be accepted`).toBe(true);
      }
    });

    it("rejects invalid reason value", () => {
      expect(isMeetingParticipantLeftPayload({
        ...validPayload,
        reason: "quit",
      })).toBe(false);
    });

    it("rejects invalid participant_kind", () => {
      expect(isMeetingParticipantLeftPayload({
        ...validPayload,
        participant_kind: "bot",
      })).toBe(false);
    });

    it("rejects missing participant_id", () => {
      const { participant_id: _id, ...rest } = validPayload;
      expect(isMeetingParticipantLeftPayload(rest)).toBe(false);
    });

    it("rejects missing meeting_id", () => {
      expect(isMeetingParticipantLeftPayload({
        room_id: "ops-control",
        participant_id: "agent-implementer",
        participant_kind: "agent",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingParticipantLeftPayload(null)).toBe(false);
    });
  });

  // --- meeting.deliberation (Sub-AC 10d) ---
  describe("isMeetingDeliberationPayload", () => {
    const validPayload = {
      meeting_id:   "mtg-delib-001",
      room_id:      "ops-room",
      initiated_by: "manager-default",
    };

    it("accepts minimal valid payload (meeting_id, room_id, initiated_by)", () => {
      expect(isMeetingDeliberationPayload(validPayload)).toBe(true);
    });

    it("accepts payload with optional request_id and note", () => {
      expect(isMeetingDeliberationPayload({
        ...validPayload,
        request_id: "req-abc",
        note: "Starting deliberation now",
      })).toBe(true);
    });

    it("rejects missing meeting_id", () => {
      const { meeting_id: _m, ...rest } = validPayload;
      expect(isMeetingDeliberationPayload(rest)).toBe(false);
    });

    it("rejects missing room_id", () => {
      const { room_id: _r, ...rest } = validPayload;
      expect(isMeetingDeliberationPayload(rest)).toBe(false);
    });

    it("rejects missing initiated_by", () => {
      const { initiated_by: _i, ...rest } = validPayload;
      expect(isMeetingDeliberationPayload(rest)).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingDeliberationPayload(null)).toBe(false);
    });

    it("isValidMeetingPayload dispatches correctly for meeting.deliberation", () => {
      expect(isValidMeetingPayload("meeting.deliberation", validPayload)).toBe(true);
    });
  });

  // --- meeting.resolved (Sub-AC 10d) ---
  describe("isMeetingResolvedPayload", () => {
    const validPayload = {
      meeting_id:     "mtg-res-001",
      room_id:        "strategy-room",
      resolution_id:  "res-abc123",
      outcome:        "accepted" as const,
      summary:        "Agreed to proceed",
      resolved_by:    "manager-default",
      decision_count: 2,
      task_count:     1,
    };

    it("accepts valid payload with all required fields", () => {
      expect(isMeetingResolvedPayload(validPayload)).toBe(true);
    });

    it("accepts all valid outcome values", () => {
      const outcomes = ["accepted", "rejected", "deferred", "modified", "abandoned"] as const;
      for (const outcome of outcomes) {
        expect(isMeetingResolvedPayload({ ...validPayload, outcome }),
          `outcome "${outcome}" should be accepted`).toBe(true);
      }
    });

    it("rejects invalid outcome value", () => {
      expect(isMeetingResolvedPayload({ ...validPayload, outcome: "unknown" })).toBe(false);
    });

    it("rejects missing meeting_id", () => {
      const { meeting_id: _m, ...rest } = validPayload;
      expect(isMeetingResolvedPayload(rest)).toBe(false);
    });

    it("rejects missing resolution_id", () => {
      const { resolution_id: _r, ...rest } = validPayload;
      expect(isMeetingResolvedPayload(rest)).toBe(false);
    });

    it("rejects missing decision_count", () => {
      const { decision_count: _d, ...rest } = validPayload;
      expect(isMeetingResolvedPayload(rest)).toBe(false);
    });

    it("rejects non-number decision_count", () => {
      expect(isMeetingResolvedPayload({ ...validPayload, decision_count: "3" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isMeetingResolvedPayload(null)).toBe(false);
    });

    it("isValidMeetingPayload dispatches correctly for meeting.resolved", () => {
      expect(isValidMeetingPayload("meeting.resolved", validPayload)).toBe(true);
    });
  });

  // --- isValidMeetingPayload dispatcher ---
  describe("isValidMeetingPayload", () => {
    it("dispatches to correct guard for meeting.started", () => {
      expect(isValidMeetingPayload("meeting.started", {
        meeting_id: "mtg-001",
        room_id: "ops-control",
        initiated_by: "agent-orchestrator",
        participant_ids: ["agent-a"],
      })).toBe(true);
    });

    it("dispatches to correct guard for meeting.ended", () => {
      expect(isValidMeetingPayload("meeting.ended", {
        meeting_id: "mtg-001",
        room_id: "ops-control",
      })).toBe(true);
    });

    it("dispatches to correct guard for meeting.participant.joined", () => {
      expect(isValidMeetingPayload("meeting.participant.joined", {
        meeting_id: "mtg-001",
        room_id: "ops-control",
        participant_id: "agent-researcher",
        participant_kind: "agent",
      })).toBe(true);
    });

    it("dispatches to correct guard for meeting.participant.left", () => {
      expect(isValidMeetingPayload("meeting.participant.left", {
        meeting_id: "mtg-001",
        room_id: "ops-control",
        participant_id: "agent-researcher",
        participant_kind: "agent",
        reason: "completed",
      })).toBe(true);
    });

    it("returns false when payload does not match event type schema", () => {
      // meeting.started requires initiated_by and participant_ids
      expect(isValidMeetingPayload("meeting.started", {
        meeting_id: "mtg-001",
        room_id: "ops-control",
      })).toBe(false);
    });
  });

  // --- MEETING_PAYLOAD_GUARDS completeness ---
  it("MEETING_PAYLOAD_GUARDS covers all MEETING_EVENT_TYPES", () => {
    for (const t of MEETING_EVENT_TYPES) {
      expect(typeof MEETING_PAYLOAD_GUARDS[t], `guard for "${t}" should be a function`).toBe("function");
    }
  });
});

// ===========================================================================
// Cross-cutting invariant tests
// ===========================================================================

describe("Cross-cutting invariants", () => {
  it("all view paths in PATHS are classified as view", () => {
    const viewPaths = [
      PATHS.VIEWS_TASKS, PATHS.VIEWS_DECISIONS, PATHS.VIEWS_STATUS,
      PATHS.VIEWS_CONTEXT, PATHS.VIEWS_TIMELINE, PATHS.VIEWS_APPROVALS,
    ];
    for (const p of viewPaths) {
      expect(classifyPath(p), `${p} should be view`).toBe("view");
    }
  });

  it("all view files owned by a reducer are in views/ or runtime/", () => {
    for (const r of REDUCERS) {
      for (const f of r.ownedFiles) {
        // Exclude entity-level reducer files (tasks/*, decisions/*, etc.)
        if (f.startsWith("views/") || f.startsWith("runtime/") || f.startsWith("agents/")) continue;
        if (f.startsWith("tasks/") || f.startsWith("decisions/") || f.startsWith("handoffs/")) continue;
        throw new Error(`Unexpected owned file pattern: ${f} in ${r.name}`);
      }
    }
  });

  it("every EventType prefix maps to at least one reducer", () => {
    const prefixes = new Set(EVENT_TYPES.map(t => t.split(".")[0]));
    // System and command events may not have dedicated reducers
    const exemptPrefixes = new Set(["system", "command"]);
    for (const prefix of prefixes) {
      if (exemptPrefixes.has(prefix)) continue;
      const hasReducer = REDUCERS.some(r =>
        r.inputEvents === "*" ||
        r.inputEvents.some(e => e.startsWith(prefix + "."))
      );
      expect(hasReducer, `no reducer handles ${prefix}.* events`).toBe(true);
    }
  });
});

// ===========================================================================
// Schema event types — §4 Sub-AC 4: ontology self-registration & evolution
// ===========================================================================

describe("Schema EventTypes", () => {
  it("all six canonical schema event types are in EVENT_TYPES", () => {
    expect(isValidEventType("schema.registered")).toBe(true);
    expect(isValidEventType("schema.updated")).toBe(true);
    expect(isValidEventType("schema.deprecated")).toBe(true);
    expect(isValidEventType("schema.removed")).toBe(true);
    expect(isValidEventType("schema.validated")).toBe(true);
    expect(isValidEventType("schema.migrated")).toBe(true);
  });

  it("SCHEMA_EVENT_TYPES has exactly 8 entries (6 original + 2 Sub-AC 16c lifecycle events)", () => {
    expect(SCHEMA_EVENT_TYPES).toHaveLength(8);
  });

  it("SCHEMA_EVENT_TYPES has no duplicates", () => {
    const set = new Set(SCHEMA_EVENT_TYPES);
    expect(set.size).toBe(SCHEMA_EVENT_TYPES.length);
  });

  it("every SCHEMA_EVENT_TYPES entry is a valid EventType", () => {
    for (const t of SCHEMA_EVENT_TYPES) {
      expect(isValidEventType(t), `missing in EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("SCHEMA_EVENT_TYPE_SET size matches SCHEMA_EVENT_TYPES length", () => {
    expect(SCHEMA_EVENT_TYPE_SET.size).toBe(SCHEMA_EVENT_TYPES.length);
  });

  it("isSchemaEventType correctly narrows schema event strings", () => {
    expect(isSchemaEventType("schema.registered")).toBe(true);
    expect(isSchemaEventType("schema.updated")).toBe(true);
    expect(isSchemaEventType("schema.deprecated")).toBe(true);
    expect(isSchemaEventType("schema.removed")).toBe(true);
    expect(isSchemaEventType("schema.validated")).toBe(true);
    expect(isSchemaEventType("schema.migrated")).toBe(true);
  });

  it("isSchemaEventType rejects non-schema strings", () => {
    expect(isSchemaEventType("task.created")).toBe(false);
    expect(isSchemaEventType("layout.updated")).toBe(false);
    expect(isSchemaEventType("schema.unknown")).toBe(false);
    expect(isSchemaEventType("schema")).toBe(false);
    expect(isSchemaEventType("")).toBe(false);
  });

  it("SchemaReducer is defined and owns schema paths", () => {
    const schemaReducer = REDUCERS.find(r => r.name === "SchemaReducer");
    expect(schemaReducer).toBeDefined();
    expect(schemaReducer!.ownedFiles).toContain("views/SCHEMA.md");
    expect(schemaReducer!.ownedFiles).toContain("runtime/schema/*.json");
  });

  it("SchemaReducer input events match all SCHEMA_EVENT_TYPES", () => {
    const schemaReducer = REDUCERS.find(r => r.name === "SchemaReducer")!;
    expect(schemaReducer.inputEvents).not.toBe("*");
    const inputEvents = schemaReducer.inputEvents as string[];
    for (const t of SCHEMA_EVENT_TYPES) {
      expect(inputEvents, `SchemaReducer should handle ${t}`).toContain(t);
    }
  });

  it("findOwner returns 'SchemaReducer' for schema view files", () => {
    expect(findOwner("views/SCHEMA.md")).toBe("SchemaReducer");
    expect(findOwner("runtime/schema/event_type:task.created.json")).toBe("SchemaReducer");
  });
});

describe("Schema payload type guards", () => {
  // --- schema.registered ---
  describe("isSchemaRegisteredPayload", () => {
    const validPayload = {
      schema_id: "event_type:task.created",
      namespace: "event_type",
      name: "task.created",
      version: "1.0.0",
      registered_by: "system",
    };

    it("accepts minimal valid payload", () => {
      expect(isSchemaRegisteredPayload(validPayload)).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isSchemaRegisteredPayload({
        ...validPayload,
        description: "Emitted when a new task is created in the system.",
        json_schema: { type: "object", properties: { task_id: { type: "string" } } },
        registered_at_ms: Date.now(),
        owned_by_reducers: ["TaskReducer", "TimelineReducer"],
        parent_event_type: "task.created",
      })).toBe(true);
    });

    it("accepts all valid namespace values", () => {
      const namespaces = ["event_type", "command_type", "payload", "reducer", "protocol", "gui_model"] as const;
      for (const namespace of namespaces) {
        expect(isSchemaRegisteredPayload({ ...validPayload, namespace }),
          `namespace "${namespace}" should be valid`).toBe(true);
      }
    });

    it("accepts all valid registered_by values", () => {
      const sources = ["system", "agent", "operator"] as const;
      for (const registered_by of sources) {
        expect(isSchemaRegisteredPayload({ ...validPayload, registered_by }),
          `registered_by "${registered_by}" should be valid`).toBe(true);
      }
    });

    it("rejects missing schema_id", () => {
      const { schema_id: _id, ...rest } = validPayload;
      expect(isSchemaRegisteredPayload(rest)).toBe(false);
    });

    it("rejects missing namespace", () => {
      const { namespace: _ns, ...rest } = validPayload;
      expect(isSchemaRegisteredPayload(rest)).toBe(false);
    });

    it("rejects missing name", () => {
      const { name: _n, ...rest } = validPayload;
      expect(isSchemaRegisteredPayload(rest)).toBe(false);
    });

    it("rejects missing version", () => {
      const { version: _v, ...rest } = validPayload;
      expect(isSchemaRegisteredPayload(rest)).toBe(false);
    });

    it("rejects missing registered_by", () => {
      const { registered_by: _rb, ...rest } = validPayload;
      expect(isSchemaRegisteredPayload(rest)).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaRegisteredPayload(null)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isSchemaRegisteredPayload("schema.registered")).toBe(false);
    });
  });

  // --- schema.updated ---
  describe("isSchemaUpdatedPayload", () => {
    const validPayload = {
      schema_id: "event_type:task.created",
      namespace: "event_type",
      name: "task.created",
      prev_version: "1.0.0",
      next_version: "1.1.0",
      changes: [
        {
          change_type: "field_added",
          field_path: "properties.priority",
          description: "Added optional priority field",
        },
      ],
      updated_by: "operator",
    };

    it("accepts valid payload", () => {
      expect(isSchemaUpdatedPayload(validPayload)).toBe(true);
    });

    it("accepts payload with optional fields", () => {
      expect(isSchemaUpdatedPayload({
        ...validPayload,
        agent_id: "agent-schema-manager",
        updated_at_ms: Date.now(),
        new_json_schema: { type: "object" },
      })).toBe(true);
    });

    it("rejects missing prev_version", () => {
      const { prev_version: _pv, ...rest } = validPayload;
      expect(isSchemaUpdatedPayload(rest)).toBe(false);
    });

    it("rejects missing next_version", () => {
      const { next_version: _nv, ...rest } = validPayload;
      expect(isSchemaUpdatedPayload(rest)).toBe(false);
    });

    it("rejects non-array changes", () => {
      expect(isSchemaUpdatedPayload({ ...validPayload, changes: "description_updated" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaUpdatedPayload(null)).toBe(false);
    });
  });

  // --- schema.deprecated ---
  describe("isSchemaDeprecatedPayload", () => {
    const validPayload = {
      schema_id: "event_type:task.updated",
      namespace: "event_type",
      name: "task.updated",
      version: "1.0.0",
      deprecation_reason: "Superseded by task.status_changed which provides richer status context.",
      deprecated_by: "system",
    };

    it("accepts minimal valid payload", () => {
      expect(isSchemaDeprecatedPayload(validPayload)).toBe(true);
    });

    it("accepts payload with replacement info and sunset date", () => {
      expect(isSchemaDeprecatedPayload({
        ...validPayload,
        replacement_schema_id: "event_type:task.status_changed",
        replacement_name: "task.status_changed",
        sunset_date: "2027-01-01",
        deprecated_at_ms: Date.now(),
      })).toBe(true);
    });

    it("rejects missing deprecation_reason", () => {
      const { deprecation_reason: _dr, ...rest } = validPayload;
      expect(isSchemaDeprecatedPayload(rest)).toBe(false);
    });

    it("rejects missing deprecated_by", () => {
      const { deprecated_by: _db, ...rest } = validPayload;
      expect(isSchemaDeprecatedPayload(rest)).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaDeprecatedPayload(null)).toBe(false);
    });
  });

  // --- schema.removed ---
  describe("isSchemaRemovedPayload", () => {
    const validPayload = {
      schema_id: "event_type:artifact.generated",
      namespace: "event_type",
      name: "artifact.generated",
      version: "1.0.0",
      removal_reason: "Alias for task.artifact_added; fully retired after migration.",
      migration_applied: true,
      removed_by: "operator",
    };

    it("accepts valid payload", () => {
      expect(isSchemaRemovedPayload(validPayload)).toBe(true);
    });

    it("accepts payload with optional fields", () => {
      expect(isSchemaRemovedPayload({
        ...validPayload,
        affected_event_count: 42,
        removed_at_ms: Date.now(),
      })).toBe(true);
    });

    it("rejects missing migration_applied", () => {
      const { migration_applied: _ma, ...rest } = validPayload;
      expect(isSchemaRemovedPayload(rest)).toBe(false);
    });

    it("rejects non-boolean migration_applied", () => {
      expect(isSchemaRemovedPayload({ ...validPayload, migration_applied: "yes" })).toBe(false);
    });

    it("rejects missing removal_reason", () => {
      const { removal_reason: _rr, ...rest } = validPayload;
      expect(isSchemaRemovedPayload(rest)).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaRemovedPayload(null)).toBe(false);
    });
  });

  // --- schema.validated ---
  describe("isSchemaValidatedPayload", () => {
    const validPayload = {
      validation_run_id: "val-run-001",
      scope: "full",
      schemas_checked: 55,
      schemas_valid: 55,
      schemas_invalid: 0,
      passed: true,
      validated_by: "system",
    };

    it("accepts valid payload", () => {
      expect(isSchemaValidatedPayload(validPayload)).toBe(true);
    });

    it("accepts payload with results array", () => {
      expect(isSchemaValidatedPayload({
        ...validPayload,
        results: [
          { schema_id: "event_type:task.created", valid: true },
          { schema_id: "event_type:schema.registered", valid: true },
        ],
        validated_at_ms: Date.now(),
        duration_ms: 150,
      })).toBe(true);
    });

    it("accepts all valid scope values", () => {
      const scopes = ["full", "event_types", "payloads", "reducers", "single"] as const;
      for (const scope of scopes) {
        expect(isSchemaValidatedPayload({ ...validPayload, scope }),
          `scope "${scope}" should be valid`).toBe(true);
      }
    });

    it("rejects missing validation_run_id", () => {
      const { validation_run_id: _vri, ...rest } = validPayload;
      expect(isSchemaValidatedPayload(rest)).toBe(false);
    });

    it("rejects missing schemas_checked", () => {
      const { schemas_checked: _sc, ...rest } = validPayload;
      expect(isSchemaValidatedPayload(rest)).toBe(false);
    });

    it("rejects non-boolean passed", () => {
      expect(isSchemaValidatedPayload({ ...validPayload, passed: "yes" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaValidatedPayload(null)).toBe(false);
    });
  });

  // --- schema.migrated ---
  describe("isSchemaMigratedPayload", () => {
    const validPayload = {
      migration_run_id: "mig-run-001",
      from_version: "conitens.event.v1",
      to_version: "conitens.event.v2",
      migrated_event_types: ["task.artifact_added", "task.spec_updated"],
      events_migrated: 1024,
      dry_run: false,
      migrated_by: "operator",
    };

    it("accepts valid payload", () => {
      expect(isSchemaMigratedPayload(validPayload)).toBe(true);
    });

    it("accepts dry-run migration payload", () => {
      expect(isSchemaMigratedPayload({ ...validPayload, dry_run: true })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isSchemaMigratedPayload({
        ...validPayload,
        events_failed: 2,
        date_range: { from: "2026-01-01", to: "2026-03-24" },
        migrated_at_ms: Date.now(),
        duration_ms: 5000,
      })).toBe(true);
    });

    it("rejects missing migration_run_id", () => {
      const { migration_run_id: _mri, ...rest } = validPayload;
      expect(isSchemaMigratedPayload(rest)).toBe(false);
    });

    it("rejects missing from_version", () => {
      const { from_version: _fv, ...rest } = validPayload;
      expect(isSchemaMigratedPayload(rest)).toBe(false);
    });

    it("rejects non-array migrated_event_types", () => {
      expect(isSchemaMigratedPayload({
        ...validPayload,
        migrated_event_types: "task.artifact_added",
      })).toBe(false);
    });

    it("rejects non-boolean dry_run", () => {
      expect(isSchemaMigratedPayload({ ...validPayload, dry_run: "false" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isSchemaMigratedPayload(null)).toBe(false);
    });
  });

  // --- isValidSchemaPayload dispatcher ---
  describe("isValidSchemaPayload", () => {
    it("dispatches to correct guard for schema.registered", () => {
      expect(isValidSchemaPayload("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        registered_by: "system",
      })).toBe(true);
    });

    it("dispatches to correct guard for schema.updated", () => {
      expect(isValidSchemaPayload("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.1.0",
        changes: [],
        updated_by: "operator",
      })).toBe(true);
    });

    it("dispatches to correct guard for schema.deprecated", () => {
      expect(isValidSchemaPayload("schema.deprecated", {
        schema_id: "event_type:task.updated",
        namespace: "event_type",
        name: "task.updated",
        version: "1.0.0",
        deprecation_reason: "Superseded.",
        deprecated_by: "system",
      })).toBe(true);
    });

    it("dispatches to correct guard for schema.removed", () => {
      expect(isValidSchemaPayload("schema.removed", {
        schema_id: "event_type:artifact.generated",
        namespace: "event_type",
        name: "artifact.generated",
        version: "1.0.0",
        removal_reason: "Fully retired.",
        migration_applied: true,
        removed_by: "operator",
      })).toBe(true);
    });

    it("dispatches to correct guard for schema.validated", () => {
      expect(isValidSchemaPayload("schema.validated", {
        validation_run_id: "val-run-002",
        scope: "event_types",
        schemas_checked: 10,
        schemas_valid: 10,
        schemas_invalid: 0,
        passed: true,
        validated_by: "system",
      })).toBe(true);
    });

    it("dispatches to correct guard for schema.migrated", () => {
      expect(isValidSchemaPayload("schema.migrated", {
        migration_run_id: "mig-run-002",
        from_version: "conitens.event.v1",
        to_version: "conitens.event.v2",
        migrated_event_types: [],
        events_migrated: 0,
        dry_run: true,
        migrated_by: "system",
      })).toBe(true);
    });

    it("returns false when payload does not match event type schema", () => {
      // schema.registered requires schema_id, namespace, name, version, registered_by
      expect(isValidSchemaPayload("schema.registered", {
        schema_id: "event_type:task.created",
      })).toBe(false);
    });
  });

  // --- SCHEMA_PAYLOAD_GUARDS completeness ---
  it("SCHEMA_PAYLOAD_GUARDS covers all SCHEMA_EVENT_TYPES", () => {
    for (const t of SCHEMA_EVENT_TYPES) {
      expect(typeof SCHEMA_PAYLOAD_GUARDS[t], `guard for "${t}" should be a function`).toBe("function");
    }
  });
});

// ===========================================================================
// §4 Sub-AC 3 — Pipeline EventType: pipeline.* canonical dictionary
// ===========================================================================

describe("PipelineEventType (Sub-AC 3)", () => {
  // --- EventType membership ---
  it("registers all pipeline.* types in the global EVENT_TYPES dictionary", () => {
    const pipelineTypes = [
      "pipeline.started",
      "pipeline.step",
      "pipeline.stage_completed",
      "pipeline.completed",
      "pipeline.failed",
      "pipeline.cancelled",
    ];
    for (const t of pipelineTypes) {
      expect(isValidEventType(t), `EVENT_TYPES missing: ${t}`).toBe(true);
    }
  });

  it("PIPELINE_EVENT_TYPES contains all 9 canonical pipeline event types (6 original + 3 Sub-AC 16c)", () => {
    // Original 6
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.started");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.step");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.stage_completed");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.completed");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.failed");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.cancelled");
    // Sub-AC 16c additions: stage lifecycle + task routing
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.stage_started");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.stage_failed");
    expect(PIPELINE_EVENT_TYPES).toContain("pipeline.task_routed");
    expect(PIPELINE_EVENT_TYPES.length).toBe(9);
  });

  it("PIPELINE_EVENT_TYPE_SET provides O(1) membership for all types", () => {
    for (const t of PIPELINE_EVENT_TYPES) {
      expect(PIPELINE_EVENT_TYPE_SET.has(t), `set missing: ${t}`).toBe(true);
    }
  });

  it("isPipelineEventType narrows to PipelineEventType", () => {
    expect(isPipelineEventType("pipeline.started")).toBe(true);
    expect(isPipelineEventType("pipeline.step")).toBe(true);
    expect(isPipelineEventType("pipeline.stage_completed")).toBe(true);
    expect(isPipelineEventType("pipeline.completed")).toBe(true);
    expect(isPipelineEventType("pipeline.failed")).toBe(true);
    expect(isPipelineEventType("pipeline.cancelled")).toBe(true);
  });

  it("isPipelineEventType rejects non-pipeline types", () => {
    expect(isPipelineEventType("pipeline.unknown")).toBe(false);
    expect(isPipelineEventType("task.created")).toBe(false);
    expect(isPipelineEventType("")).toBe(false);
    expect(isPipelineEventType("schema.registered")).toBe(false);
  });

  it("PIPELINE_EVENT_TYPES has no duplicates", () => {
    const set = new Set(PIPELINE_EVENT_TYPES);
    expect(set.size).toBe(PIPELINE_EVENT_TYPES.length);
  });

  it("all PIPELINE_EVENT_TYPES are also valid EVENT_TYPES", () => {
    for (const t of PIPELINE_EVENT_TYPES) {
      expect(isValidEventType(t), `${t} not in global EVENT_TYPES`).toBe(true);
    }
  });

  // --- pipeline.started ---
  describe("pipeline.started payload", () => {
    it("accepts a valid payload", () => {
      expect(isPipelineStartedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps: ["validate", "provision", "activate"],
      })).toBe(true);
    });

    it("accepts payload with optional fields", () => {
      expect(isPipelineStartedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps: ["validate"],
        initiated_by_command: "cmd-xyz",
        initiated_by_task: "task-001",
        started_at_ms: 1700000000000,
      })).toBe(true);
    });

    it("rejects payload missing pipeline_id", () => {
      expect(isPipelineStartedPayload({
        pipeline_name: "agent-bootstrap",
        steps: ["validate"],
      })).toBe(false);
    });

    it("rejects payload with non-string steps", () => {
      expect(isPipelineStartedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps: [1, 2, 3],
      })).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isPipelineStartedPayload(null)).toBe(false);
      expect(isPipelineStartedPayload("pipeline.started")).toBe(false);
    });
  });

  // --- pipeline.step ---
  describe("pipeline.step payload", () => {
    it("accepts a valid started step payload", () => {
      expect(isPipelineStepPayload({
        pipeline_id: "pipe-abc123",
        step_index: 0,
        step_name: "validate",
        step_status: "started",
      })).toBe(true);
    });

    it("accepts a valid completed step payload", () => {
      expect(isPipelineStepPayload({
        pipeline_id: "pipe-abc123",
        step_index: 1,
        step_name: "provision",
        step_status: "completed",
        output: { room_id: "room-01" },
        duration_ms: 150,
      })).toBe(true);
    });

    it("accepts a failed step payload", () => {
      expect(isPipelineStepPayload({
        pipeline_id: "pipe-abc123",
        step_index: 0,
        step_name: "validate",
        step_status: "failed",
        error_code: "SCHEMA_INVALID",
        error_message: "Payload missing required field",
      })).toBe(true);
    });

    it("rejects payload missing step_index", () => {
      expect(isPipelineStepPayload({
        pipeline_id: "pipe-abc123",
        step_name: "validate",
        step_status: "started",
      })).toBe(false);
    });
  });

  // --- pipeline.stage_completed (Sub-AC 3 new type) ---
  describe("pipeline.stage_completed payload", () => {
    it("accepts a minimal valid payload", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 0,
        stage_name: "validation",
        step_names: ["schema_check", "auth_check"],
        steps_total: 2,
        steps_completed: 2,
      })).toBe(true);
    });

    it("accepts payload with optional fields", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 1,
        stage_name: "execution",
        step_names: ["spawn_agent", "assign_task"],
        steps_total: 2,
        steps_completed: 2,
        steps_skipped: 0,
        duration_ms: 320,
        stage_artifacts: {
          spawn_agent: { agent_id: "agent-007" },
          assign_task: { task_id: "task-999" },
        },
      })).toBe(true);
    });

    it("accepts a stage with skipped steps", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 2,
        stage_name: "cleanup",
        step_names: ["notify", "archive"],
        steps_total: 2,
        steps_completed: 1,
        steps_skipped: 1,
      })).toBe(true);
    });

    it("rejects payload missing pipeline_id", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_name: "agent-bootstrap",
        stage_index: 0,
        stage_name: "validation",
        step_names: ["check"],
        steps_total: 1,
        steps_completed: 1,
      })).toBe(false);
    });

    it("rejects payload missing stage_index", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_name: "validation",
        step_names: ["check"],
        steps_total: 1,
        steps_completed: 1,
      })).toBe(false);
    });

    it("rejects payload missing stage_name", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 0,
        step_names: ["check"],
        steps_total: 1,
        steps_completed: 1,
      })).toBe(false);
    });

    it("rejects payload where step_names contains non-strings", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 0,
        stage_name: "validation",
        step_names: [1, 2],
        steps_total: 2,
        steps_completed: 2,
      })).toBe(false);
    });

    it("rejects payload where steps_total is not a number", () => {
      expect(isPipelineStageCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        stage_index: 0,
        stage_name: "validation",
        step_names: ["check"],
        steps_total: "2",
        steps_completed: 1,
      })).toBe(false);
    });

    it("rejects null and non-objects", () => {
      expect(isPipelineStageCompletedPayload(null)).toBe(false);
      expect(isPipelineStageCompletedPayload(undefined)).toBe(false);
      expect(isPipelineStageCompletedPayload("stage")).toBe(false);
      expect(isPipelineStageCompletedPayload(42)).toBe(false);
    });
  });

  // --- pipeline.completed ---
  describe("pipeline.completed payload", () => {
    it("accepts a valid payload", () => {
      expect(isPipelineCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps_total: 3,
        steps_completed: 3,
      })).toBe(true);
    });

    it("accepts payload with artifacts", () => {
      expect(isPipelineCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps_total: 3,
        steps_completed: 3,
        steps_skipped: 0,
        duration_ms: 750,
        artifacts: { validate: {}, provision: { room: "r1" } },
      })).toBe(true);
    });

    it("rejects payload missing steps_total", () => {
      expect(isPipelineCompletedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        steps_completed: 3,
      })).toBe(false);
    });
  });

  // --- pipeline.failed ---
  describe("pipeline.failed payload", () => {
    it("accepts a valid payload", () => {
      expect(isPipelineFailedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        failed_step_index: 1,
        failed_step_name: "provision",
        error_code: "ROOM_UNAVAILABLE",
        error_message: "Target room is at capacity",
        steps_completed: 1,
      })).toBe(true);
    });

    it("rejects payload missing error fields", () => {
      expect(isPipelineFailedPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        failed_step_index: 1,
        failed_step_name: "provision",
        steps_completed: 1,
      })).toBe(false);
    });
  });

  // --- pipeline.cancelled (Sub-AC 3 new type) ---
  describe("pipeline.cancelled payload", () => {
    it("accepts a minimal valid payload", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        cancellation_code: "USER_REQUESTED",
        cancellation_reason: "Operator cancelled via GUI",
        steps_completed: 2,
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        cancellation_code: "WATCHDOG_TIMEOUT",
        cancellation_reason: "Pipeline exceeded 30s maximum runtime",
        steps_completed: 1,
        steps_in_progress: 1,
        cancelled_by_command: "cmd-cancel-789",
        cancelled_by_actor: "watchdog",
        duration_ms: 30001,
      })).toBe(true);
    });

    it("accepts PARENT_CANCELLED code for cascading cancellation", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-child-456",
        pipeline_name: "agent-sub-task",
        cancellation_code: "PARENT_CANCELLED",
        cancellation_reason: "Parent pipeline pipe-parent-001 was cancelled",
        steps_completed: 0,
      })).toBe(true);
    });

    it("rejects payload missing pipeline_id", () => {
      expect(isPipelineCancelledPayload({
        pipeline_name: "agent-bootstrap",
        cancellation_code: "USER_REQUESTED",
        cancellation_reason: "Operator cancelled",
        steps_completed: 0,
      })).toBe(false);
    });

    it("rejects payload missing cancellation_code", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        cancellation_reason: "Operator cancelled",
        steps_completed: 0,
      })).toBe(false);
    });

    it("rejects payload missing cancellation_reason", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        cancellation_code: "USER_REQUESTED",
        steps_completed: 0,
      })).toBe(false);
    });

    it("rejects payload where steps_completed is not a number", () => {
      expect(isPipelineCancelledPayload({
        pipeline_id: "pipe-abc123",
        pipeline_name: "agent-bootstrap",
        cancellation_code: "USER_REQUESTED",
        cancellation_reason: "Operator cancelled",
        steps_completed: "2",
      })).toBe(false);
    });

    it("rejects null and non-objects", () => {
      expect(isPipelineCancelledPayload(null)).toBe(false);
      expect(isPipelineCancelledPayload(undefined)).toBe(false);
      expect(isPipelineCancelledPayload("cancelled")).toBe(false);
    });
  });

  // --- isValidPipelinePayload generic dispatcher ---
  describe("isValidPipelinePayload generic dispatcher", () => {
    it("dispatches to correct guard for pipeline.started", () => {
      expect(isValidPipelinePayload("pipeline.started", {
        pipeline_id: "p1",
        pipeline_name: "boot",
        steps: ["a"],
      })).toBe(true);
    });

    it("dispatches to correct guard for pipeline.step", () => {
      expect(isValidPipelinePayload("pipeline.step", {
        pipeline_id: "p1",
        step_index: 0,
        step_name: "a",
        step_status: "completed",
      })).toBe(true);
    });

    it("dispatches to correct guard for pipeline.stage_completed", () => {
      expect(isValidPipelinePayload("pipeline.stage_completed", {
        pipeline_id: "p1",
        pipeline_name: "boot",
        stage_index: 0,
        stage_name: "init",
        step_names: ["a"],
        steps_total: 1,
        steps_completed: 1,
      })).toBe(true);
    });

    it("dispatches to correct guard for pipeline.completed", () => {
      expect(isValidPipelinePayload("pipeline.completed", {
        pipeline_id: "p1",
        pipeline_name: "boot",
        steps_total: 1,
        steps_completed: 1,
      })).toBe(true);
    });

    it("dispatches to correct guard for pipeline.failed", () => {
      expect(isValidPipelinePayload("pipeline.failed", {
        pipeline_id: "p1",
        pipeline_name: "boot",
        failed_step_index: 0,
        failed_step_name: "a",
        error_code: "ERR",
        error_message: "fail",
        steps_completed: 0,
      })).toBe(true);
    });

    it("dispatches to correct guard for pipeline.cancelled", () => {
      expect(isValidPipelinePayload("pipeline.cancelled", {
        pipeline_id: "p1",
        pipeline_name: "boot",
        cancellation_code: "USER_REQUESTED",
        cancellation_reason: "test",
        steps_completed: 0,
      })).toBe(true);
    });

    it("returns false when payload does not match event type schema", () => {
      expect(isValidPipelinePayload("pipeline.stage_completed", {
        pipeline_id: "p1",
      })).toBe(false);

      expect(isValidPipelinePayload("pipeline.cancelled", {
        pipeline_id: "p1",
        pipeline_name: "boot",
      })).toBe(false);
    });
  });

  // --- PIPELINE_PAYLOAD_GUARDS completeness ---
  it("PIPELINE_PAYLOAD_GUARDS covers all PIPELINE_EVENT_TYPES", () => {
    for (const t of PIPELINE_EVENT_TYPES) {
      expect(
        typeof PIPELINE_PAYLOAD_GUARDS[t],
        `guard for "${t}" should be a function`,
      ).toBe("function");
    }
  });
});

// ===========================================================================
// Interaction event types — §4 Sub-AC 4 extension for 3D GUI interactions
// ===========================================================================

describe("Interaction EventTypes", () => {
  it("all interaction event types are in EVENT_TYPES", () => {
    for (const t of INTERACTION_EVENT_TYPES) {
      expect(isValidEventType(t), `missing: ${t}`).toBe(true);
    }
  });

  it("includes all four original required interaction event types", () => {
    expect(isValidEventType("interaction.user_input")).toBe(true);
    expect(isValidEventType("interaction.selection_changed")).toBe(true);
    expect(isValidEventType("interaction.replay_triggered")).toBe(true);
    expect(isValidEventType("interaction.viewport_changed")).toBe(true);
  });

  it("includes Sub-AC 4 discrete semantic interaction event types", () => {
    expect(isValidEventType("interaction.selected")).toBe(true);
    expect(isValidEventType("interaction.hovered")).toBe(true);
    expect(isValidEventType("interaction.dismissed")).toBe(true);
  });

  it("INTERACTION_EVENT_TYPES has no duplicates", () => {
    const set = new Set(INTERACTION_EVENT_TYPES);
    expect(set.size).toBe(INTERACTION_EVENT_TYPES.length);
  });

  it("isInteractionEventType correctly narrows interaction event strings", () => {
    expect(isInteractionEventType("interaction.user_input")).toBe(true);
    expect(isInteractionEventType("interaction.selection_changed")).toBe(true);
    expect(isInteractionEventType("interaction.replay_triggered")).toBe(true);
    expect(isInteractionEventType("interaction.viewport_changed")).toBe(true);
    // Sub-AC 4 additions
    expect(isInteractionEventType("interaction.selected")).toBe(true);
    expect(isInteractionEventType("interaction.hovered")).toBe(true);
    expect(isInteractionEventType("interaction.dismissed")).toBe(true);
  });

  it("isInteractionEventType rejects non-interaction event strings", () => {
    expect(isInteractionEventType("task.created")).toBe(false);
    expect(isInteractionEventType("layout.created")).toBe(false);
    expect(isInteractionEventType("interaction.unknown")).toBe(false);
    expect(isInteractionEventType("")).toBe(false);
  });

  it("INTERACTION_EVENT_TYPE_SET size matches INTERACTION_EVENT_TYPES length", () => {
    expect(INTERACTION_EVENT_TYPE_SET.size).toBe(INTERACTION_EVENT_TYPES.length);
  });
});

describe("Interaction payload type guards", () => {
  // --- interaction.user_input ---
  describe("isInteractionUserInputPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isInteractionUserInputPayload({
        input_id: "inp-001",
        input_value: "spawn agent manager",
        surface: "command_bar",
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isInteractionUserInputPayload({
        input_id: "inp-002",
        input_value: "spawn agent manager",
        surface: "command_bar",
        command_id: "cmd-abc123",
        parsed_as_command: true,
        session_id: "sess-001",
        submitted_at_ms: 1711234567890,
      })).toBe(true);
    });

    it("accepts all valid surface values", () => {
      const surfaces = ["command_bar", "context_menu", "inspector", "timeline", "scene", "keyboard", "toolbar"];
      for (const s of surfaces) {
        expect(isInteractionUserInputPayload({ input_id: "x", input_value: "y", surface: s }), `surface: ${s}`).toBe(true);
      }
    });

    it("rejects invalid surface value", () => {
      expect(isInteractionUserInputPayload({
        input_id: "inp-001",
        input_value: "test",
        surface: "unknown_surface",
      })).toBe(false);
    });

    it("rejects missing input_id", () => {
      expect(isInteractionUserInputPayload({
        input_value: "test",
        surface: "command_bar",
      })).toBe(false);
    });

    it("rejects missing input_value", () => {
      expect(isInteractionUserInputPayload({
        input_id: "inp-001",
        surface: "command_bar",
      })).toBe(false);
    });

    it("rejects missing surface", () => {
      expect(isInteractionUserInputPayload({
        input_id: "inp-001",
        input_value: "test",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionUserInputPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.user_input", () => {
      expect(isValidInteractionPayload("interaction.user_input", {
        input_id: "inp-001",
        input_value: "test",
        surface: "command_bar",
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.user_input", {})).toBe(false);
    });
  });

  // --- interaction.selection_changed ---
  describe("isInteractionSelectionChangedPayload", () => {
    it("accepts minimal valid payload with empty arrays (cleared selection)", () => {
      expect(isInteractionSelectionChangedPayload({
        next_selection: [],
        prev_selection: [],
      })).toBe(true);
    });

    it("accepts payload with selected entities", () => {
      expect(isInteractionSelectionChangedPayload({
        next_selection: ["agent-manager"],
        next_selection_kind: "agent",
        prev_selection: [],
        is_multi_select: false,
        drill_depth: 2,
        active_room_id: "control-room",
        session_id: "sess-001",
        surface: "scene",
      })).toBe(true);
    });

    it("accepts multi-select payload", () => {
      expect(isInteractionSelectionChangedPayload({
        next_selection: ["agent-manager", "agent-researcher"],
        prev_selection: ["agent-manager"],
        is_multi_select: true,
      })).toBe(true);
    });

    it("rejects missing next_selection", () => {
      expect(isInteractionSelectionChangedPayload({
        prev_selection: [],
      })).toBe(false);
    });

    it("rejects non-string elements in next_selection", () => {
      expect(isInteractionSelectionChangedPayload({
        next_selection: [42],
        prev_selection: [],
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionSelectionChangedPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.selection_changed", () => {
      expect(isValidInteractionPayload("interaction.selection_changed", {
        next_selection: ["agent-x"],
        prev_selection: [],
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.selection_changed", {
        next_selection: "not-array",
        prev_selection: [],
      })).toBe(false);
    });
  });

  // --- interaction.replay_triggered ---
  describe("isInteractionReplayTriggeredPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isInteractionReplayTriggeredPayload({
        replay_session_id: "replay-001",
        phase: "started",
      })).toBe(true);
    });

    it("accepts all valid phase values", () => {
      const phases = ["started", "paused", "resumed", "stopped", "seeked", "completed"];
      for (const phase of phases) {
        expect(isInteractionReplayTriggeredPayload({ replay_session_id: "r1", phase }), `phase: ${phase}`).toBe(true);
      }
    });

    it("accepts payload with all optional fields", () => {
      expect(isInteractionReplayTriggeredPayload({
        replay_session_id: "replay-001",
        phase: "seeked",
        replay_from: "2026-03-24T00:00:00Z",
        replay_to: "2026-03-24T01:00:00Z",
        current_position: "2026-03-24T00:30:00Z",
        current_event_index: 42,
        playback_speed: 2.0,
        spatial_mode: true,
        session_id: "sess-001",
      })).toBe(true);
    });

    it("rejects invalid phase value", () => {
      expect(isInteractionReplayTriggeredPayload({
        replay_session_id: "r1",
        phase: "unknown_phase",
      })).toBe(false);
    });

    it("rejects missing replay_session_id", () => {
      expect(isInteractionReplayTriggeredPayload({ phase: "started" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionReplayTriggeredPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.replay_triggered", () => {
      expect(isValidInteractionPayload("interaction.replay_triggered", {
        replay_session_id: "r1",
        phase: "started",
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.replay_triggered", {
        replay_session_id: "r1",
      })).toBe(false);
    });
  });

  // --- interaction.viewport_changed ---
  describe("isInteractionViewportChangedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isInteractionViewportChangedPayload({
        change_kind: "pan",
      })).toBe(true);
    });

    it("accepts all valid change_kind values", () => {
      const kinds = ["pan", "orbit", "zoom", "preset", "focus", "reset"];
      for (const kind of kinds) {
        expect(isInteractionViewportChangedPayload({ change_kind: kind }), `change_kind: ${kind}`).toBe(true);
      }
    });

    it("accepts payload with full camera transition data", () => {
      expect(isInteractionViewportChangedPayload({
        change_kind: "orbit",
        from_position: { x: 0, y: 10, z: 20 },
        to_position: { x: 5, y: 10, z: 15 },
        from_target: { x: 0, y: 0, z: 0 },
        to_target: { x: 0, y: 0, z: 0 },
        from_fov_deg: 60,
        to_fov_deg: 60,
        session_id: "sess-001",
        surface: "scene",
      })).toBe(true);
    });

    it("accepts preset payload with preset_name", () => {
      expect(isInteractionViewportChangedPayload({
        change_kind: "preset",
        preset_name: "overview",
      })).toBe(true);
    });

    it("accepts focus payload with focused_entity_id", () => {
      expect(isInteractionViewportChangedPayload({
        change_kind: "focus",
        focused_entity_id: "agent-manager",
      })).toBe(true);
    });

    it("rejects invalid change_kind value", () => {
      expect(isInteractionViewportChangedPayload({
        change_kind: "teleport",
      })).toBe(false);
    });

    it("rejects missing change_kind", () => {
      expect(isInteractionViewportChangedPayload({})).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionViewportChangedPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.viewport_changed", () => {
      expect(isValidInteractionPayload("interaction.viewport_changed", {
        change_kind: "zoom",
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.viewport_changed", {
        change_kind: "invalid",
      })).toBe(false);
    });
  });

  // --- interaction.selected (Sub-AC 4) ---
  describe("isInteractionSelectedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isInteractionSelectedPayload({
        selection_id: "sel-001",
        entity_id: "agent-manager",
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isInteractionSelectedPayload({
        selection_id: "sel-002",
        entity_id: "room-lab",
        entity_kind: "room",
        drill_depth: 2,
        active_room_id: "room-lab",
        surface: "scene",
        session_id: "sess-001",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing selection_id", () => {
      expect(isInteractionSelectedPayload({ entity_id: "agent-x" })).toBe(false);
    });

    it("rejects missing entity_id", () => {
      expect(isInteractionSelectedPayload({ selection_id: "sel-001" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionSelectedPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.selected", () => {
      expect(isValidInteractionPayload("interaction.selected", {
        selection_id: "sel-001",
        entity_id: "agent-x",
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.selected", {
        entity_id: "agent-x",
      })).toBe(false);
    });
  });

  // --- interaction.hovered (Sub-AC 4) ---
  describe("isInteractionHoveredPayload", () => {
    it("accepts minimal valid payload with is_hovering=true", () => {
      expect(isInteractionHoveredPayload({
        entity_id: "agent-manager",
        is_hovering: true,
      })).toBe(true);
    });

    it("accepts minimal valid payload with is_hovering=false", () => {
      expect(isInteractionHoveredPayload({
        entity_id: "agent-manager",
        is_hovering: false,
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isInteractionHoveredPayload({
        entity_id: "room-ops",
        entity_kind: "room",
        is_hovering: true,
        tooltip_text: "Operations Control Room",
        surface: "scene",
        session_id: "sess-002",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing entity_id", () => {
      expect(isInteractionHoveredPayload({ is_hovering: true })).toBe(false);
    });

    it("rejects missing is_hovering", () => {
      expect(isInteractionHoveredPayload({ entity_id: "agent-x" })).toBe(false);
    });

    it("rejects non-boolean is_hovering", () => {
      expect(isInteractionHoveredPayload({
        entity_id: "agent-x",
        is_hovering: "true",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionHoveredPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.hovered", () => {
      expect(isValidInteractionPayload("interaction.hovered", {
        entity_id: "room-lab",
        is_hovering: true,
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.hovered", {
        entity_id: "room-lab",
      })).toBe(false);
    });
  });

  // --- interaction.dismissed (Sub-AC 4) ---
  describe("isInteractionDismissedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isInteractionDismissedPayload({
        dismissed_id: "panel-agent-status",
        dismissed_kind: "panel",
      })).toBe(true);
    });

    it("accepts all valid dismissed_kind values", () => {
      const kinds = ["panel", "tooltip", "notification", "modal", "overlay", "menu"];
      for (const k of kinds) {
        expect(isInteractionDismissedPayload(
          { dismissed_id: "x", dismissed_kind: k },
        ), `dismissed_kind: ${k}`).toBe(true);
      }
    });

    it("accepts all valid dismiss_reason values", () => {
      const reasons = ["explicit", "focus_loss", "timeout", "escape_key"];
      for (const r of reasons) {
        expect(isInteractionDismissedPayload({
          dismissed_id: "x",
          dismissed_kind: "panel",
          dismiss_reason: r,
        }), `dismiss_reason: ${r}`).toBe(true);
      }
    });

    it("accepts payload with all optional fields", () => {
      expect(isInteractionDismissedPayload({
        dismissed_id: "tooltip-agent-x",
        dismissed_kind: "tooltip",
        dismiss_reason: "focus_loss",
        dismissed_after_ms: 1250,
        surface: "scene",
        session_id: "sess-003",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing dismissed_id", () => {
      expect(isInteractionDismissedPayload({ dismissed_kind: "panel" })).toBe(false);
    });

    it("rejects invalid dismissed_kind", () => {
      expect(isInteractionDismissedPayload({
        dismissed_id: "x",
        dismissed_kind: "unknown_kind",
      })).toBe(false);
    });

    it("rejects invalid dismiss_reason", () => {
      expect(isInteractionDismissedPayload({
        dismissed_id: "x",
        dismissed_kind: "panel",
        dismiss_reason: "bad_reason",
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isInteractionDismissedPayload(null)).toBe(false);
    });

    it("isValidInteractionPayload dispatches correctly for interaction.dismissed", () => {
      expect(isValidInteractionPayload("interaction.dismissed", {
        dismissed_id: "notif-001",
        dismissed_kind: "notification",
      })).toBe(true);
      expect(isValidInteractionPayload("interaction.dismissed", {
        dismissed_id: "notif-001",
      })).toBe(false);
    });
  });

  // --- INTERACTION_PAYLOAD_GUARDS completeness ---
  it("INTERACTION_PAYLOAD_GUARDS covers all INTERACTION_EVENT_TYPES", () => {
    for (const t of INTERACTION_EVENT_TYPES) {
      expect(
        typeof INTERACTION_PAYLOAD_GUARDS[t],
        `guard for "${t}" should be a function`,
      ).toBe("function");
    }
  });
});

// ===========================================================================
// Sub-AC 4 — Fixture EventTypes (scene-level lifecycle)
// ===========================================================================

describe("Fixture EventTypes", () => {
  it("all fixture event types are in EVENT_TYPES", () => {
    for (const t of FIXTURE_EVENT_TYPES) {
      expect(isValidEventType(t), `missing: ${t}`).toBe(true);
    }
  });

  it("includes original fixture event types", () => {
    expect(isValidEventType("fixture.panel_toggled")).toBe(true);
    expect(isValidEventType("fixture.handle_pulled")).toBe(true);
    expect(isValidEventType("fixture.button_pressed")).toBe(true);
    expect(isValidEventType("fixture.state_changed")).toBe(true);
  });

  it("includes Sub-AC 4 scene-level fixture lifecycle event types", () => {
    expect(isValidEventType("fixture.placed")).toBe(true);
    expect(isValidEventType("fixture.removed")).toBe(true);
    expect(isValidEventType("fixture.updated")).toBe(true);
  });

  it("FIXTURE_EVENT_TYPES has no duplicates", () => {
    const set = new Set(FIXTURE_EVENT_TYPES);
    expect(set.size).toBe(FIXTURE_EVENT_TYPES.length);
  });

  it("isFixtureEventType correctly narrows fixture event strings", () => {
    expect(isFixtureEventType("fixture.panel_toggled")).toBe(true);
    expect(isFixtureEventType("fixture.placed")).toBe(true);
    expect(isFixtureEventType("fixture.removed")).toBe(true);
    expect(isFixtureEventType("fixture.updated")).toBe(true);
  });

  it("isFixtureEventType rejects non-fixture strings", () => {
    expect(isFixtureEventType("task.created")).toBe(false);
    expect(isFixtureEventType("fixture.unknown")).toBe(false);
    expect(isFixtureEventType("")).toBe(false);
  });

  it("FIXTURE_EVENT_TYPE_SET size matches FIXTURE_EVENT_TYPES length", () => {
    expect(FIXTURE_EVENT_TYPE_SET.size).toBe(FIXTURE_EVENT_TYPES.length);
  });
});

describe("Fixture payload type guards", () => {
  // --- fixture.panel_toggled (existing) ---
  describe("isFixturePanelToggledPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixturePanelToggledPayload({
        fixture_id: "panel-001",
        prev_state: "closed",
        next_state: "open",
      })).toBe(true);
    });

    it("rejects missing fixture_id", () => {
      expect(isFixturePanelToggledPayload({ prev_state: "closed", next_state: "open" })).toBe(false);
    });

    it("rejects invalid prev_state", () => {
      expect(isFixturePanelToggledPayload({
        fixture_id: "panel-001",
        prev_state: "half_open",
        next_state: "open",
      })).toBe(false);
    });
  });

  // --- fixture.handle_pulled (existing) ---
  describe("isFixtureHandlePulledPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixtureHandlePulledPayload({
        fixture_id: "handle-lab-door",
        handle_kind: "door",
      })).toBe(true);
    });

    it("rejects invalid handle_kind", () => {
      expect(isFixtureHandlePulledPayload({
        fixture_id: "handle-x",
        handle_kind: "rope",
      })).toBe(false);
    });
  });

  // --- fixture.button_pressed (existing) ---
  describe("isFixtureButtonPressedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixtureButtonPressedPayload({ fixture_id: "btn-spawn" })).toBe(true);
    });

    it("rejects missing fixture_id", () => {
      expect(isFixtureButtonPressedPayload({ button_label: "SPAWN" })).toBe(false);
    });
  });

  // --- fixture.state_changed (existing) ---
  describe("isFixtureStateChangedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixtureStateChangedPayload({
        fixture_id: "dial-001",
        prev_state: { value: 0 },
        next_state: { value: 50 },
      })).toBe(true);
    });

    it("rejects non-object prev_state", () => {
      expect(isFixtureStateChangedPayload({
        fixture_id: "dial-001",
        prev_state: "off",
        next_state: { value: 50 },
      })).toBe(false);
    });
  });

  // --- fixture.placed (Sub-AC 4) ---
  describe("isFixturePlacedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixturePlacedPayload({
        fixture_id: "panel-ops-001",
        fixture_type: "control_panel",
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isFixturePlacedPayload({
        fixture_id: "btn-spawn-001",
        fixture_name: "Spawn Agent Button",
        fixture_type: "button",
        room_id: "room-ops",
        position: { x: 1.5, y: 0, z: 2.0 },
        rotation: { x: 0, y: 90, z: 0 },
        initial_config: { label: "SPAWN", color: "green" },
        trigger_source: "direct",
        placed_by: "operator-session-001",
        command_id: "cmd-place-001",
        session_id: "sess-001",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing fixture_id", () => {
      expect(isFixturePlacedPayload({ fixture_type: "control_panel" })).toBe(false);
    });

    it("rejects missing fixture_type", () => {
      expect(isFixturePlacedPayload({ fixture_id: "panel-001" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isFixturePlacedPayload(null)).toBe(false);
    });

    it("isValidFixturePayload dispatches correctly for fixture.placed", () => {
      expect(isValidFixturePayload("fixture.placed", {
        fixture_id: "panel-001",
        fixture_type: "status_light",
      })).toBe(true);
      expect(isValidFixturePayload("fixture.placed", {
        fixture_id: "panel-001",
      })).toBe(false);
    });
  });

  // --- fixture.removed (Sub-AC 4) ---
  describe("isFixtureRemovedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixtureRemovedPayload({ fixture_id: "panel-ops-001" })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isFixtureRemovedPayload({
        fixture_id: "btn-spawn-001",
        fixture_name: "Spawn Agent Button",
        fixture_type: "button",
        room_id: "room-ops",
        last_known_config: { label: "SPAWN", color: "green" },
        removal_reason: "layout_reset",
        trigger_source: "command",
        removed_by: "system",
        command_id: "cmd-remove-001",
        session_id: "sess-001",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing fixture_id", () => {
      expect(isFixtureRemovedPayload({ fixture_type: "button" })).toBe(false);
    });

    it("rejects null", () => {
      expect(isFixtureRemovedPayload(null)).toBe(false);
    });

    it("isValidFixturePayload dispatches correctly for fixture.removed", () => {
      expect(isValidFixturePayload("fixture.removed", {
        fixture_id: "panel-001",
      })).toBe(true);
      expect(isValidFixturePayload("fixture.removed", {})).toBe(false);
    });
  });

  // --- fixture.updated (Sub-AC 4) ---
  describe("isFixtureUpdatedPayload", () => {
    it("accepts minimal valid payload", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "panel-ops-001",
        prev_config: { label: "OLD" },
        next_config: { label: "NEW" },
      })).toBe(true);
    });

    it("accepts empty config objects", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "panel-001",
        prev_config: {},
        next_config: {},
      })).toBe(true);
    });

    it("accepts payload with all optional fields", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "btn-spawn-001",
        fixture_name: "Spawn Agent Button",
        fixture_type: "button",
        room_id: "room-ops",
        prev_config: { label: "SPAWN", color: "green" },
        next_config: { label: "SPAWN AGENT", color: "blue" },
        update_fields: ["label", "color"],
        update_reason: "branding_update",
        trigger_source: "direct",
        updated_by: "operator-session-001",
        command_id: "cmd-update-001",
        session_id: "sess-001",
        ts_ms: 1711234567890,
      })).toBe(true);
    });

    it("rejects missing fixture_id", () => {
      expect(isFixtureUpdatedPayload({
        prev_config: {},
        next_config: {},
      })).toBe(false);
    });

    it("rejects missing prev_config", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "panel-001",
        next_config: {},
      })).toBe(false);
    });

    it("rejects non-object prev_config", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "panel-001",
        prev_config: "old",
        next_config: {},
      })).toBe(false);
    });

    it("rejects missing next_config", () => {
      expect(isFixtureUpdatedPayload({
        fixture_id: "panel-001",
        prev_config: {},
      })).toBe(false);
    });

    it("rejects null", () => {
      expect(isFixtureUpdatedPayload(null)).toBe(false);
    });

    it("isValidFixturePayload dispatches correctly for fixture.updated", () => {
      expect(isValidFixturePayload("fixture.updated", {
        fixture_id: "panel-001",
        prev_config: { x: 1 },
        next_config: { x: 2 },
      })).toBe(true);
      expect(isValidFixturePayload("fixture.updated", {
        fixture_id: "panel-001",
        prev_config: {},
      })).toBe(false);
    });
  });

  // --- FIXTURE_PAYLOAD_GUARDS completeness ---
  it("FIXTURE_PAYLOAD_GUARDS covers all FIXTURE_EVENT_TYPES", () => {
    for (const t of FIXTURE_EVENT_TYPES) {
      expect(
        typeof FIXTURE_PAYLOAD_GUARDS[t],
        `guard for "${t}" should be a function`,
      ).toBe("function");
    }
  });
});
