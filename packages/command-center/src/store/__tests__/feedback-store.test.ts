/**
 * feedback-store.test.ts — Unit tests for Sub-AC 8d: End-to-end feedback loop.
 *
 * Tests the Zustand feedback-store that bridges Orchestrator command results
 * back to the 3D scene (toast notifications + 3D error highlights).
 *
 * Sub-AC 8d coverage:
 *   - ingestResults: appends new CommandResults, de-duplicates by command_id,
 *     respects MAX_RESULT_LOG ring-buffer, generates toasts + error highlights
 *   - addToast: creates ToastNotification with correct shape and expiry
 *   - dismissToast: removes specific toast by id
 *   - pruneExpiredToasts: removes toasts whose expiresAt < now
 *   - setErrorHighlight: upserts per-entity highlight
 *   - clearErrorHighlight: removes by (kind, id)
 *   - clearAllErrorHighlights: empties the array
 *   - setPollStatus: updates polling status
 *   - getResultByCommandId: selector by command_id
 *   - getErrorHighlight: selector by (kind, id)
 *   - hasAgentErrors: derived boolean
 *   - processResultSideEffects (via ingestResults):
 *       "processed" → success toast, clear agent/task error highlights
 *       "error"     → error toast + setErrorHighlight for agent/task
 *       "rejected"  → warning toast
 *       "pending"   → no toast (transitional state)
 *   - MAX_RESULT_LOG, DEFAULT_TOAST_DURATION_MS, ERROR_TOAST_DURATION_MS constants
 *
 * Test ID scheme:
 *   8d-N : Sub-AC 8d feedback store
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useFeedbackStore,
  MAX_RESULT_LOG,
  DEFAULT_TOAST_DURATION_MS,
  ERROR_TOAST_DURATION_MS,
} from "../feedback-store.js";
import type { CommandResult } from "../feedback-store.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetStore() {
  useFeedbackStore.setState({
    resultLog:       [],
    processedIds:    new Set<string>(),
    lastResultTs:    null,
    toasts:          [],
    errorHighlights: [],
    pollStatus:      "idle",
  });
}

let _cmdCounter = 0;
function makeResult(
  overrides: Partial<CommandResult> = {},
): CommandResult {
  const id = `cmd-${++_cmdCounter}`;
  return {
    command_id:   id,
    command_type: "agent.spawn",
    status:       "processed",
    ts:           new Date(Date.now()).toISOString(),
    message:      "OK",
    ...overrides,
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe("Constants (8d-1)", () => {
  it("MAX_RESULT_LOG is a positive integer", () => {
    expect(Number.isInteger(MAX_RESULT_LOG)).toBe(true);
    expect(MAX_RESULT_LOG).toBeGreaterThan(0);
  });

  it("DEFAULT_TOAST_DURATION_MS is positive", () => {
    expect(DEFAULT_TOAST_DURATION_MS).toBeGreaterThan(0);
  });

  it("ERROR_TOAST_DURATION_MS >= DEFAULT_TOAST_DURATION_MS (errors shown longer)", () => {
    expect(ERROR_TOAST_DURATION_MS).toBeGreaterThanOrEqual(DEFAULT_TOAST_DURATION_MS);
  });
});

// ── ingestResults — basic ──────────────────────────────────────────────────────

describe("ingestResults — basic ingestion (8d-2)", () => {
  beforeEach(resetStore);

  it("appends a new result to resultLog", () => {
    const r = makeResult();
    useFeedbackStore.getState().ingestResults([r]);
    expect(useFeedbackStore.getState().resultLog).toHaveLength(1);
    expect(useFeedbackStore.getState().resultLog[0].command_id).toBe(r.command_id);
  });

  it("stores the command_id in processedIds", () => {
    const r = makeResult();
    useFeedbackStore.getState().ingestResults([r]);
    expect(useFeedbackStore.getState().processedIds.has(r.command_id)).toBe(true);
  });

  it("updates lastResultTs to the most-recent ts", () => {
    const r1 = makeResult({ ts: "2026-03-24T10:00:00.000Z" });
    const r2 = makeResult({ ts: "2026-03-24T10:01:00.000Z" });
    useFeedbackStore.getState().ingestResults([r1, r2]);
    expect(useFeedbackStore.getState().lastResultTs).toBe("2026-03-24T10:01:00.000Z");
  });

  it("is a no-op for an empty array", () => {
    useFeedbackStore.getState().ingestResults([]);
    expect(useFeedbackStore.getState().resultLog).toHaveLength(0);
  });
});

// ── ingestResults — de-duplication ────────────────────────────────────────────

describe("ingestResults — de-duplication (8d-3)", () => {
  beforeEach(resetStore);

  it("skips already-processed command_ids", () => {
    const r = makeResult();
    useFeedbackStore.getState().ingestResults([r]);
    useFeedbackStore.getState().ingestResults([r]); // second call with same id
    expect(useFeedbackStore.getState().resultLog).toHaveLength(1);
  });

  it("processes new results even when duplicates are mixed in", () => {
    const r1 = makeResult();
    const r2 = makeResult();
    useFeedbackStore.getState().ingestResults([r1]);
    useFeedbackStore.getState().ingestResults([r1, r2]); // r1 is dupe
    expect(useFeedbackStore.getState().resultLog).toHaveLength(2);
  });
});

// ── ingestResults — ring-buffer ───────────────────────────────────────────────

describe("ingestResults — ring-buffer (8d-4)", () => {
  beforeEach(resetStore);

  it(`caps resultLog at MAX_RESULT_LOG (${MAX_RESULT_LOG})`, () => {
    const batch = Array.from({ length: MAX_RESULT_LOG + 10 }, () => makeResult());
    useFeedbackStore.getState().ingestResults(batch);
    expect(useFeedbackStore.getState().resultLog.length).toBeLessThanOrEqual(MAX_RESULT_LOG);
  });

  it("retains the NEWEST results when trimming", () => {
    const batch = Array.from({ length: MAX_RESULT_LOG + 5 }, (_, i) =>
      makeResult({ command_id: `overflow-${i}` }),
    );
    useFeedbackStore.getState().ingestResults(batch);
    const log = useFeedbackStore.getState().resultLog;
    // Last entry should be the most-recent
    expect(log[log.length - 1].command_id).toBe(`overflow-${MAX_RESULT_LOG + 4}`);
  });
});

// ── addToast ───────────────────────────────────────────────────────────────────

describe("addToast (8d-5)", () => {
  beforeEach(resetStore);

  it("adds a toast to the toasts array", () => {
    useFeedbackStore.getState().addToast("info", "Test toast");
    expect(useFeedbackStore.getState().toasts).toHaveLength(1);
  });

  it("assigns a unique string id to each toast", () => {
    useFeedbackStore.getState().addToast("info", "A");
    useFeedbackStore.getState().addToast("info", "B");
    const ids = useFeedbackStore.getState().toasts.map((t) => t.id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(typeof ids[0]).toBe("string");
    expect(ids[0].length).toBeGreaterThan(0);
  });

  it("stores the level and title correctly", () => {
    useFeedbackStore.getState().addToast("success", "Command processed");
    const toast = useFeedbackStore.getState().toasts[0];
    expect(toast.level).toBe("success");
    expect(toast.title).toBe("Command processed");
  });

  it("uses ERROR_TOAST_DURATION_MS for error level", () => {
    const before = Date.now();
    useFeedbackStore.getState().addToast("error", "Oops");
    const toast = useFeedbackStore.getState().toasts[0];
    expect(toast.expiresAt - toast.createdAt).toBeGreaterThanOrEqual(ERROR_TOAST_DURATION_MS - 10);
    void before;
  });

  it("uses DEFAULT_TOAST_DURATION_MS for non-error levels", () => {
    useFeedbackStore.getState().addToast("info", "Note");
    const toast = useFeedbackStore.getState().toasts[0];
    expect(toast.expiresAt - toast.createdAt).toBeGreaterThanOrEqual(DEFAULT_TOAST_DURATION_MS - 10);
  });

  it("respects custom durationMs option", () => {
    useFeedbackStore.getState().addToast("warning", "Warn", { durationMs: 1234 });
    const toast = useFeedbackStore.getState().toasts[0];
    expect(toast.expiresAt - toast.createdAt).toBeCloseTo(1234, -1);
  });

  it("stores optional correlation ids", () => {
    useFeedbackStore.getState().addToast("success", "Done", {
      command_id: "cmd-abc",
      agent_id:   "agent-1",
      task_id:    "task-2",
    });
    const toast = useFeedbackStore.getState().toasts[0];
    expect(toast.command_id).toBe("cmd-abc");
    expect(toast.agent_id).toBe("agent-1");
    expect(toast.task_id).toBe("task-2");
  });
});

// ── dismissToast ───────────────────────────────────────────────────────────────

describe("dismissToast (8d-6)", () => {
  beforeEach(resetStore);

  it("removes the toast with the matching id", () => {
    useFeedbackStore.getState().addToast("info", "A");
    const id = useFeedbackStore.getState().toasts[0].id;
    useFeedbackStore.getState().dismissToast(id);
    expect(useFeedbackStore.getState().toasts).toHaveLength(0);
  });

  it("leaves other toasts untouched", () => {
    useFeedbackStore.getState().addToast("info", "A");
    useFeedbackStore.getState().addToast("info", "B");
    const idA = useFeedbackStore.getState().toasts[0].id;
    useFeedbackStore.getState().dismissToast(idA);
    expect(useFeedbackStore.getState().toasts).toHaveLength(1);
    expect(useFeedbackStore.getState().toasts[0].title).toBe("B");
  });

  it("is a no-op for an unknown id", () => {
    useFeedbackStore.getState().addToast("info", "A");
    useFeedbackStore.getState().dismissToast("nonexistent-id");
    expect(useFeedbackStore.getState().toasts).toHaveLength(1);
  });
});

// ── pruneExpiredToasts ─────────────────────────────────────────────────────────

describe("pruneExpiredToasts (8d-7)", () => {
  beforeEach(resetStore);

  it("removes expired toasts", () => {
    // Manually insert an already-expired toast
    useFeedbackStore.setState((s) => ({
      toasts: [
        ...s.toasts,
        {
          id:        "expired-toast",
          level:     "info" as const,
          title:     "Old",
          createdAt: Date.now() - 10_000,
          expiresAt: Date.now() - 1,   // already expired
        },
      ],
    }));
    useFeedbackStore.getState().pruneExpiredToasts();
    expect(useFeedbackStore.getState().toasts).toHaveLength(0);
  });

  it("keeps non-expired toasts", () => {
    useFeedbackStore.getState().addToast("info", "Fresh"); // default 5 s expiry
    useFeedbackStore.getState().pruneExpiredToasts();
    expect(useFeedbackStore.getState().toasts).toHaveLength(1);
  });
});

// ── setErrorHighlight / clearErrorHighlight ────────────────────────────────────

describe("setErrorHighlight (8d-8)", () => {
  beforeEach(resetStore);

  it("adds a new error highlight", () => {
    useFeedbackStore.getState().setErrorHighlight({
      kind: "agent", id: "agent-1", message: "crashed", since: Date.now(),
    });
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(1);
  });

  it("upserts (replaces) an existing highlight for the same entity", () => {
    const now = Date.now();
    useFeedbackStore.getState().setErrorHighlight({
      kind: "agent", id: "agent-1", message: "first", since: now,
    });
    useFeedbackStore.getState().setErrorHighlight({
      kind: "agent", id: "agent-1", message: "second", since: now + 100,
    });
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(1);
    expect(useFeedbackStore.getState().errorHighlights[0].message).toBe("second");
  });

  it("allows different kinds for the same id", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "x", message: "a", since: 0 });
    useFeedbackStore.getState().setErrorHighlight({ kind: "task",  id: "x", message: "b", since: 0 });
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(2);
  });
});

describe("clearErrorHighlight (8d-9)", () => {
  beforeEach(resetStore);

  it("removes the matching highlight", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "a1", message: "err", since: 0 });
    useFeedbackStore.getState().clearErrorHighlight("agent", "a1");
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(0);
  });

  it("leaves other highlights untouched", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "a1", message: "e", since: 0 });
    useFeedbackStore.getState().setErrorHighlight({ kind: "task",  id: "t1", message: "e", since: 0 });
    useFeedbackStore.getState().clearErrorHighlight("agent", "a1");
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(1);
    expect(useFeedbackStore.getState().errorHighlights[0].kind).toBe("task");
  });
});

describe("clearAllErrorHighlights (8d-10)", () => {
  beforeEach(resetStore);

  it("removes all highlights", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "a", message: "e", since: 0 });
    useFeedbackStore.getState().setErrorHighlight({ kind: "task",  id: "b", message: "e", since: 0 });
    useFeedbackStore.getState().clearAllErrorHighlights();
    expect(useFeedbackStore.getState().errorHighlights).toHaveLength(0);
  });
});

// ── setPollStatus ──────────────────────────────────────────────────────────────

describe("setPollStatus (8d-11)", () => {
  beforeEach(resetStore);

  const statuses = ["polling", "idle", "error", "disconnected"] as const;
  for (const s of statuses) {
    it(`sets pollStatus to "${s}"`, () => {
      useFeedbackStore.getState().setPollStatus(s);
      expect(useFeedbackStore.getState().pollStatus).toBe(s);
    });
  }
});

// ── Selectors ──────────────────────────────────────────────────────────────────

describe("getResultByCommandId (8d-12)", () => {
  beforeEach(resetStore);

  it("returns the result with the matching command_id", () => {
    const r = makeResult({ command_id: "find-me" });
    useFeedbackStore.getState().ingestResults([r]);
    const found = useFeedbackStore.getState().getResultByCommandId("find-me");
    expect(found).toBeDefined();
    expect(found?.command_id).toBe("find-me");
  });

  it("returns undefined for an unknown command_id", () => {
    const found = useFeedbackStore.getState().getResultByCommandId("nope");
    expect(found).toBeUndefined();
  });
});

describe("getErrorHighlight (8d-13)", () => {
  beforeEach(resetStore);

  it("returns the matching highlight", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "room", id: "lab", message: "overflow", since: 0 });
    const h = useFeedbackStore.getState().getErrorHighlight("room", "lab");
    expect(h).toBeDefined();
    expect(h?.message).toBe("overflow");
  });

  it("returns undefined when no match", () => {
    expect(useFeedbackStore.getState().getErrorHighlight("agent", "nobody")).toBeUndefined();
  });
});

describe("hasAgentErrors (8d-14)", () => {
  beforeEach(resetStore);

  it("returns false when no agent highlights", () => {
    expect(useFeedbackStore.getState().hasAgentErrors()).toBe(false);
  });

  it("returns true when an agent highlight is present", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "a1", message: "err", since: 0 });
    expect(useFeedbackStore.getState().hasAgentErrors()).toBe(true);
  });

  it("returns false when only task/room highlights are present", () => {
    useFeedbackStore.getState().setErrorHighlight({ kind: "task", id: "t1", message: "err", since: 0 });
    useFeedbackStore.getState().setErrorHighlight({ kind: "room", id: "r1", message: "err", since: 0 });
    expect(useFeedbackStore.getState().hasAgentErrors()).toBe(false);
  });
});

// ── ingestResults → side effects (toast + error highlights) ───────────────────

describe("ingestResults side-effects: 'processed' result (8d-15)", () => {
  beforeEach(resetStore);

  it("generates a success toast", () => {
    useFeedbackStore.getState().ingestResults([makeResult({ status: "processed" })]);
    const toasts = useFeedbackStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[toasts.length - 1].level).toBe("success");
  });

  it("clears agent error highlight on 'processed' result with agent_update", () => {
    // First, set an error highlight
    useFeedbackStore.getState().setErrorHighlight({ kind: "agent", id: "a1", message: "prior error", since: 0 });
    // Then ingest a success result for that agent
    useFeedbackStore.getState().ingestResults([
      makeResult({
        status:       "processed",
        agent_update: { agent_id: "a1", status: "idle" },
      }),
    ]);
    // Error highlight should be cleared
    expect(useFeedbackStore.getState().getErrorHighlight("agent", "a1")).toBeUndefined();
  });
});

describe("ingestResults side-effects: 'error' result (8d-16)", () => {
  beforeEach(resetStore);

  it("generates an error toast", () => {
    useFeedbackStore.getState().ingestResults([makeResult({ status: "error" })]);
    const toasts = useFeedbackStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[toasts.length - 1].level).toBe("error");
  });

  it("creates agent error highlight when agent_update is present", () => {
    useFeedbackStore.getState().ingestResults([
      makeResult({
        status:       "error",
        agent_update: { agent_id: "a-err" },
        error:        { code: "EXEC_FAIL", message: "crash" },
      }),
    ]);
    const h = useFeedbackStore.getState().getErrorHighlight("agent", "a-err");
    expect(h).toBeDefined();
    expect(h?.kind).toBe("agent");
  });

  it("error toast uses ERROR_TOAST_DURATION_MS (longer duration)", () => {
    useFeedbackStore.getState().ingestResults([makeResult({ status: "error" })]);
    const toast = useFeedbackStore.getState().toasts[useFeedbackStore.getState().toasts.length - 1];
    expect(toast.expiresAt - toast.createdAt).toBeGreaterThanOrEqual(ERROR_TOAST_DURATION_MS - 10);
  });
});

describe("ingestResults side-effects: 'rejected' result (8d-17)", () => {
  beforeEach(resetStore);

  it("generates a warning toast", () => {
    useFeedbackStore.getState().ingestResults([makeResult({ status: "rejected" })]);
    const toasts = useFeedbackStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[toasts.length - 1].level).toBe("warning");
  });
});
