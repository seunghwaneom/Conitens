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
