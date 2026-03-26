/**
 * replay-timeline.test.ts — Unit tests for the ReplayTimeline data model.
 *
 * Sub-AC 9a: Tests the structured replay timeline data model that organises
 * TypedReplayEvent arrays into a queryable, time-indexed structure.
 *
 * Coverage:
 *   - buildTimeline: construction from ParseBatchResult
 *   - mergeTimelines: multi-batch merging
 *   - emptyTimeline: zero-event sentinel
 *   - metadata fields: all computed values
 *   - getEventsUpTo: binary-search upper-bound query
 *   - getEventsInRange: window query
 *   - findInsertionIndex: raw cursor position
 *   - getAgentEvents: filter by category + agent_id
 *   - getCommandEvents: filter by category + commandId/pipelineId
 *   - getDomainEvents: filter by category + domain prefix
 *   - getRunEvents: filter by run_id
 *   - getAgentIds / getRunIds: distinct ID extraction
 *   - isEmpty: sentinel check
 *
 * Test ID scheme:
 *   9t-N : Sub-AC 9a timeline model tests
 */

import { describe, it, expect } from "vitest";
import {
  ReplayTimeline,
  buildTimeline,
  mergeTimelines,
  emptyTimeline,
  type TimelineMetadata,
} from "../replay-timeline.js";
import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
  CommandReplayEvent,
  StateChangeReplayEvent,
  ParseBatchResult,
  ParseError,
} from "../event-log-schema.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

const BASE_TS = 1_700_000_000_000; // 2023-11-14 approx.
let _seqCounter = 0;
function nextSeq(): number { return ++_seqCounter; }
function resetSeq(): void { _seqCounter = 0; }

/** Minimal raw ConitensEvent envelope */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawEnv(type: string, tsMs: number): any {
  return {
    schema:   "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}-${nextSeq()}`,
    type,
    ts:       new Date(tsMs).toISOString(),
    run_id:   "run-test",
    actor:    { kind: "system" as const, id: "orchestrator" },
    payload:  {},
  };
}

/** Build an AgentLifecycleReplayEvent */
function makeAgentEv(
  agentId: string,
  tsMs: number,
  runId = "run-test",
): AgentLifecycleReplayEvent {
  const seq = nextSeq();
  const raw = rawEnv("agent.spawned", tsMs);
  raw.run_id  = runId;
  raw.event_id = `evt-agent-${tsMs}-${seq}`;
  return {
    replayCategory: "agent_lifecycle",
    raw,
    type:           "agent.spawned",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         runId,
    agentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typedPayload:   { agent_id: agentId, persona: "implementer", capabilities: [] } as any,
  };
}

/** Build a CommandReplayEvent */
function makeCmdEv(
  commandId: string,
  tsMs: number,
  runId = "run-test",
): CommandReplayEvent {
  const seq = nextSeq();
  const raw = rawEnv("command.issued", tsMs);
  raw.run_id  = runId;
  raw.event_id = `evt-cmd-${tsMs}-${seq}`;
  return {
    replayCategory: "command",
    raw,
    type:           "command.issued",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "user", id: "gui" },
    run_id:         runId,
    commandId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typedPayload:   { command_id: commandId, command_type: "agent.spawn", source: "gui", input: {} } as any,
  };
}

/** Build a CommandReplayEvent for a pipeline */
function makePipelineEv(
  pipelineId: string,
  tsMs: number,
  runId = "run-test",
): CommandReplayEvent {
  const seq = nextSeq();
  const raw = rawEnv("pipeline.started", tsMs);
  raw.run_id  = runId;
  raw.event_id = `evt-pipe-${tsMs}-${seq}`;
  return {
    replayCategory: "command",
    raw,
    type:           "pipeline.started",
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         runId,
    pipelineId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typedPayload:   { pipeline_id: pipelineId, pipeline_name: "test", steps: [] } as any,
  };
}

/** Build a StateChangeReplayEvent */
function makeStateEv(
  domain: string,
  tsMs: number,
  runId = "run-test",
  taskId?: string,
): StateChangeReplayEvent {
  const type = `${domain}.created`;
  const seq  = nextSeq();
  const raw  = rawEnv(type, tsMs);
  raw.run_id   = runId;
  raw.event_id = `evt-state-${tsMs}-${seq}`;
  if (taskId) raw.task_id = taskId;
  return {
    replayCategory: "state_change",
    raw,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type:           type as any,
    ts:             new Date(tsMs).toISOString(),
    tsMs,
    seq,
    actor:          { kind: "system", id: "orchestrator" },
    run_id:         runId,
    typedPayload:   {},
    domain,
    taskId,
  };
}

/** Minimal ParseError */
function makeParseError(msg = "parse error"): ParseError {
  return { code: "JSON_PARSE_FAILED", message: msg, lineOffset: 0, rawLine: "" };
}

/** Build a ParseBatchResult from events + optional errors */
function makeBatch(
  events: TypedReplayEvent[],
  errors: ParseError[] = [],
): ParseBatchResult {
  const tsMsVals = events.map((e) => e.tsMs);
  const categoryCounts = {
    agent_lifecycle: events.filter((e) => e.replayCategory === "agent_lifecycle").length,
    command:         events.filter((e) => e.replayCategory === "command").length,
    state_change:    events.filter((e) => e.replayCategory === "state_change").length,
  };
  return {
    events,
    errors,
    totalLines:     events.length + errors.length,
    parsedCount:    events.length,
    errorCount:     errors.length,
    firstEventTsMs: tsMsVals.length > 0 ? Math.min(...tsMsVals) : Infinity,
    lastEventTsMs:  tsMsVals.length > 0 ? Math.max(...tsMsVals) : -Infinity,
    categoryCounts,
  };
}

// ---------------------------------------------------------------------------
// (9t-1) emptyTimeline
// ---------------------------------------------------------------------------

describe("emptyTimeline (9t-1)", () => {
  it("contains no events", () => {
    expect(emptyTimeline().events.length).toBe(0);
  });

  it("isEmpty() returns true", () => {
    expect(emptyTimeline().isEmpty()).toBe(true);
  });

  it("metadata.totalEvents is 0", () => {
    expect(emptyTimeline().metadata.totalEvents).toBe(0);
  });

  it("metadata.firstEventTs is empty string", () => {
    expect(emptyTimeline().metadata.firstEventTs).toBe("");
  });

  it("metadata.lastEventTs is empty string", () => {
    expect(emptyTimeline().metadata.lastEventTs).toBe("");
  });

  it("metadata.firstEventTsMs is Infinity", () => {
    expect(emptyTimeline().metadata.firstEventTsMs).toBe(Infinity);
  });

  it("metadata.lastEventTsMs is -Infinity", () => {
    expect(emptyTimeline().metadata.lastEventTsMs).toBe(-Infinity);
  });

  it("metadata.durationMs is 0", () => {
    expect(emptyTimeline().metadata.durationMs).toBe(0);
  });

  it("metadata.agentCount is 0", () => {
    expect(emptyTimeline().metadata.agentCount).toBe(0);
  });

  it("metadata.runCount is 0", () => {
    expect(emptyTimeline().metadata.runCount).toBe(0);
  });

  it("metadata.parseErrorCount is 0", () => {
    expect(emptyTimeline().metadata.parseErrorCount).toBe(0);
  });

  it("all category counts are 0", () => {
    const { categoryCounts } = emptyTimeline().metadata;
    expect(categoryCounts.agent_lifecycle).toBe(0);
    expect(categoryCounts.command).toBe(0);
    expect(categoryCounts.state_change).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (9t-2) buildTimeline — single batch
// ---------------------------------------------------------------------------

describe("buildTimeline — basic construction (9t-2)", () => {
  it("builds a timeline with 0 events from empty batch", () => {
    const tl = buildTimeline(makeBatch([]));
    expect(tl.isEmpty()).toBe(true);
    expect(tl.metadata.totalEvents).toBe(0);
  });

  it("builds a timeline with 1 event", () => {
    resetSeq();
    const ev = makeAgentEv("a1", BASE_TS);
    const tl = buildTimeline(makeBatch([ev]));
    expect(tl.metadata.totalEvents).toBe(1);
    expect(tl.isEmpty()).toBe(false);
  });

  it("events array length matches parsedCount", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeCmdEv("c1",  BASE_TS + 100),
      makeStateEv("task", BASE_TS + 200),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.events.length).toBe(3);
    expect(tl.metadata.totalEvents).toBe(3);
  });

  it("preserves events in ascending tsMs order (already sorted input)", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 500),
      makeAgentEv("a3", BASE_TS + 1000),
    ];
    const tl = buildTimeline(makeBatch(events));
    for (let i = 1; i < tl.events.length; i++) {
      expect(tl.events[i].tsMs).toBeGreaterThanOrEqual(tl.events[i - 1].tsMs);
    }
  });

  it("sorts events in ascending tsMs order (reversed input)", () => {
    resetSeq();
    const events = [
      makeAgentEv("a3", BASE_TS + 2000),
      makeAgentEv("a2", BASE_TS + 1000),
      makeAgentEv("a1", BASE_TS),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.events[0].tsMs).toBe(BASE_TS);
    expect(tl.events[1].tsMs).toBe(BASE_TS + 1000);
    expect(tl.events[2].tsMs).toBe(BASE_TS + 2000);
  });

  it("tie-breaks same-tsMs events by seq (ascending)", () => {
    resetSeq();
    const a = makeAgentEv("a1", BASE_TS);
    const b = makeAgentEv("a2", BASE_TS);
    // a.seq < b.seq because of resetSeq at top
    const tl = buildTimeline(makeBatch([b, a])); // pass in reverse order
    // After sort, the event with lower seq should come first
    expect(tl.events[0].seq).toBeLessThan(tl.events[1].seq);
  });

  it("does not mutate the source ParseBatchResult events array", () => {
    resetSeq();
    const events = [
      makeAgentEv("a3", BASE_TS + 2000),
      makeAgentEv("a1", BASE_TS),
    ];
    const originalOrder = [events[0].agentId, events[1].agentId];
    buildTimeline(makeBatch(events));
    // Source array should be unchanged
    expect(events[0].agentId).toBe(originalOrder[0]);
    expect(events[1].agentId).toBe(originalOrder[1]);
  });

  it("carries parse errors into metadata", () => {
    resetSeq();
    const errs = [makeParseError("err1"), makeParseError("err2")];
    const tl = buildTimeline(makeBatch([], errs));
    expect(tl.metadata.parseErrorCount).toBe(2);
    expect(tl.metadata.parseErrors.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (9t-3) buildTimeline — metadata computation
// ---------------------------------------------------------------------------

describe("buildTimeline — metadata computation (9t-3)", () => {
  it("computes firstEventTsMs and lastEventTsMs correctly", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 3000),
      makeAgentEv("a3", BASE_TS + 1500),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.firstEventTsMs).toBe(BASE_TS);
    expect(tl.metadata.lastEventTsMs).toBe(BASE_TS + 3000);
  });

  it("computes durationMs as lastEventTsMs - firstEventTsMs", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 5000),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.durationMs).toBe(5000);
  });

  it("durationMs is 0 for single-event timeline", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([makeAgentEv("a1", BASE_TS)]));
    expect(tl.metadata.durationMs).toBe(0);
  });

  it("computes firstEventTs and lastEventTs as ISO strings", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 1000),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.firstEventTs).toBe(new Date(BASE_TS).toISOString());
    expect(tl.metadata.lastEventTs).toBe(new Date(BASE_TS + 1000).toISOString());
  });

  it("categoryCounts.agent_lifecycle counts agent events", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 100),
      makeCmdEv("c1",   BASE_TS + 200),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.categoryCounts.agent_lifecycle).toBe(2);
    expect(tl.metadata.categoryCounts.command).toBe(1);
    expect(tl.metadata.categoryCounts.state_change).toBe(0);
  });

  it("domainCounts maps domain prefix to event count", () => {
    resetSeq();
    const events = [
      makeStateEv("task",   BASE_TS),
      makeStateEv("task",   BASE_TS + 100),
      makeStateEv("layout", BASE_TS + 200),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.domainCounts["task"]).toBe(2);
    expect(tl.metadata.domainCounts["layout"]).toBe(1);
  });

  it("agentCount counts unique agent IDs", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a1", BASE_TS + 100), // same agent, second event
      makeAgentEv("a2", BASE_TS + 200),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.agentCount).toBe(2); // a1, a2
  });

  it("runCount counts unique run_ids", () => {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS,       "run-1"),
      makeAgentEv("a2", BASE_TS + 100, "run-1"),
      makeAgentEv("a3", BASE_TS + 200, "run-2"),
    ];
    const tl = buildTimeline(makeBatch(events));
    expect(tl.metadata.runCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (9t-4) getEventsUpTo — time-based upper-bound query
// ---------------------------------------------------------------------------

describe("getEventsUpTo (9t-4)", () => {
  function makeTimeline() {
    resetSeq();
    const events = [
      makeAgentEv("a1", BASE_TS),          // 0
      makeAgentEv("a2", BASE_TS + 1000),   // 1
      makeAgentEv("a3", BASE_TS + 2000),   // 2
      makeAgentEv("a4", BASE_TS + 3000),   // 3
    ];
    return buildTimeline(makeBatch(events));
  }

  it("returns empty array when targetTs is before all events", () => {
    const tl = makeTimeline();
    expect(tl.getEventsUpTo(BASE_TS - 1).length).toBe(0);
  });

  it("returns all events when targetTs is at or after last event", () => {
    const tl = makeTimeline();
    expect(tl.getEventsUpTo(BASE_TS + 3000).length).toBe(4);
    expect(tl.getEventsUpTo(BASE_TS + 9999).length).toBe(4);
  });

  it("includes event at exactly targetTs", () => {
    const tl = makeTimeline();
    expect(tl.getEventsUpTo(BASE_TS + 1000).length).toBe(2);
  });

  it("returns correct count for each exact boundary", () => {
    const tl = makeTimeline();
    expect(tl.getEventsUpTo(BASE_TS).length).toBe(1);
    expect(tl.getEventsUpTo(BASE_TS + 1000).length).toBe(2);
    expect(tl.getEventsUpTo(BASE_TS + 2000).length).toBe(3);
    expect(tl.getEventsUpTo(BASE_TS + 3000).length).toBe(4);
  });

  it("returns correct count for mid-range values", () => {
    const tl = makeTimeline();
    expect(tl.getEventsUpTo(BASE_TS + 500).length).toBe(1);
    expect(tl.getEventsUpTo(BASE_TS + 1500).length).toBe(2);
  });

  it("returns an independent array (not a live view of internal events)", () => {
    const tl = makeTimeline();
    const slice = tl.getEventsUpTo(BASE_TS + 9999);
    // Modifying the returned array should not affect the internal store
    slice.splice(0, slice.length);
    expect(tl.events.length).toBe(4);
  });

  it("returns empty for empty timeline", () => {
    const tl = emptyTimeline();
    expect(tl.getEventsUpTo(BASE_TS).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (9t-5) getEventsInRange — windowed query
// ---------------------------------------------------------------------------

describe("getEventsInRange (9t-5)", () => {
  function makeTimeline() {
    resetSeq();
    return buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS),          // t+0
      makeAgentEv("a2", BASE_TS + 1000),   // t+1000
      makeAgentEv("a3", BASE_TS + 2000),   // t+2000
      makeAgentEv("a4", BASE_TS + 3000),   // t+3000
    ]));
  }

  it("returns empty when range is reversed (from > to)", () => {
    const tl = makeTimeline();
    expect(tl.getEventsInRange(BASE_TS + 2000, BASE_TS).length).toBe(0);
  });

  it("returns empty when range is entirely before all events", () => {
    const tl = makeTimeline();
    expect(tl.getEventsInRange(BASE_TS - 2000, BASE_TS - 1).length).toBe(0);
  });

  it("returns empty when range is entirely after all events", () => {
    const tl = makeTimeline();
    expect(tl.getEventsInRange(BASE_TS + 5000, BASE_TS + 9999).length).toBe(0);
  });

  it("returns all events when range spans the entire timeline", () => {
    const tl = makeTimeline();
    expect(tl.getEventsInRange(BASE_TS, BASE_TS + 3000).length).toBe(4);
  });

  it("includes events at exactly the boundary timestamps", () => {
    const tl = makeTimeline();
    // [t+1000, t+2000] should include 2 events
    expect(tl.getEventsInRange(BASE_TS + 1000, BASE_TS + 2000).length).toBe(2);
  });

  it("handles a single-event range", () => {
    const tl = makeTimeline();
    expect(tl.getEventsInRange(BASE_TS + 1000, BASE_TS + 1000).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (9t-6) findInsertionIndex
// ---------------------------------------------------------------------------

describe("findInsertionIndex (9t-6)", () => {
  function makeTimeline() {
    resetSeq();
    return buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 1000),
      makeAgentEv("a3", BASE_TS + 2000),
    ]));
  }

  it("returns 0 when targetTs is before all events", () => {
    const tl = makeTimeline();
    expect(tl.findInsertionIndex(BASE_TS - 1)).toBe(0);
  });

  it("returns events.length when targetTs is after all events", () => {
    const tl = makeTimeline();
    expect(tl.findInsertionIndex(BASE_TS + 9999)).toBe(3);
  });

  it("returns correct index at exact event boundaries", () => {
    const tl = makeTimeline();
    expect(tl.findInsertionIndex(BASE_TS)).toBe(1);
    expect(tl.findInsertionIndex(BASE_TS + 1000)).toBe(2);
    expect(tl.findInsertionIndex(BASE_TS + 2000)).toBe(3);
  });

  it("findInsertionIndex(t) === getEventsUpTo(t).length", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS + 500),
      makeAgentEv("a2", BASE_TS + 1500),
    ]));
    const testTs = [
      BASE_TS, BASE_TS + 499, BASE_TS + 500, BASE_TS + 1000, BASE_TS + 1500, BASE_TS + 9999,
    ];
    for (const t of testTs) {
      expect(tl.findInsertionIndex(t)).toBe(tl.getEventsUpTo(t).length);
    }
  });
});

// ---------------------------------------------------------------------------
// (9t-7) getAgentEvents
// ---------------------------------------------------------------------------

describe("getAgentEvents (9t-7)", () => {
  function makeTimeline() {
    resetSeq();
    return buildTimeline(makeBatch([
      makeAgentEv("alpha",   BASE_TS),
      makeAgentEv("alpha",   BASE_TS + 500),
      makeAgentEv("beta",    BASE_TS + 1000),
      makeCmdEv("cmd-1",     BASE_TS + 1500),
      makeStateEv("task",    BASE_TS + 2000),
    ]));
  }

  it("returns all agent_lifecycle events when no agentId specified", () => {
    const tl = makeTimeline();
    expect(tl.getAgentEvents().length).toBe(3);
  });

  it("returns events for a specific agentId", () => {
    const tl = makeTimeline();
    expect(tl.getAgentEvents("alpha").length).toBe(2);
    expect(tl.getAgentEvents("beta").length).toBe(1);
  });

  it("returns empty array for unknown agentId", () => {
    const tl = makeTimeline();
    expect(tl.getAgentEvents("unknown-agent").length).toBe(0);
  });

  it("all returned events have replayCategory === 'agent_lifecycle'", () => {
    const tl = makeTimeline();
    for (const ev of tl.getAgentEvents()) {
      expect(ev.replayCategory).toBe("agent_lifecycle");
    }
  });

  it("all filtered events have the requested agentId", () => {
    const tl = makeTimeline();
    for (const ev of tl.getAgentEvents("alpha")) {
      expect(ev.agentId).toBe("alpha");
    }
  });

  it("returns empty for empty timeline", () => {
    expect(emptyTimeline().getAgentEvents().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (9t-8) getCommandEvents
// ---------------------------------------------------------------------------

describe("getCommandEvents (9t-8)", () => {
  function makeTimeline() {
    resetSeq();
    return buildTimeline(makeBatch([
      makeAgentEv("a1",    BASE_TS),
      makeCmdEv("cmd-A",   BASE_TS + 100),
      makeCmdEv("cmd-B",   BASE_TS + 200),
      makePipelineEv("pipe-X", BASE_TS + 300),
      makeStateEv("task",  BASE_TS + 400),
    ]));
  }

  it("returns all command category events when no filter specified", () => {
    const tl = makeTimeline();
    expect(tl.getCommandEvents().length).toBe(3); // cmd-A, cmd-B, pipe-X
  });

  it("filters by commandId", () => {
    const tl = makeTimeline();
    const res = tl.getCommandEvents("cmd-A");
    expect(res.length).toBe(1);
    expect(res[0].commandId).toBe("cmd-A");
  });

  it("filters by pipelineId", () => {
    const tl = makeTimeline();
    const res = tl.getCommandEvents(undefined, "pipe-X");
    expect(res.length).toBe(1);
    expect(res[0].pipelineId).toBe("pipe-X");
  });

  it("returns empty for unknown commandId", () => {
    const tl = makeTimeline();
    expect(tl.getCommandEvents("cmd-MISSING").length).toBe(0);
  });

  it("all returned events have replayCategory === 'command'", () => {
    const tl = makeTimeline();
    for (const ev of tl.getCommandEvents()) {
      expect(ev.replayCategory).toBe("command");
    }
  });
});

// ---------------------------------------------------------------------------
// (9t-9) getDomainEvents
// ---------------------------------------------------------------------------

describe("getDomainEvents (9t-9)", () => {
  function makeTimeline() {
    resetSeq();
    return buildTimeline(makeBatch([
      makeAgentEv("a1",        BASE_TS),
      makeStateEv("task",      BASE_TS + 100),
      makeStateEv("task",      BASE_TS + 200),
      makeStateEv("layout",    BASE_TS + 300),
      makeStateEv("meeting",   BASE_TS + 400),
      makeCmdEv("cmd-1",       BASE_TS + 500),
    ]));
  }

  it("returns all state_change events when no domain specified", () => {
    const tl = makeTimeline();
    expect(tl.getDomainEvents().length).toBe(4); // task×2, layout, meeting
  });

  it("returns events matching domain prefix", () => {
    const tl = makeTimeline();
    expect(tl.getDomainEvents("task").length).toBe(2);
    expect(tl.getDomainEvents("layout").length).toBe(1);
    expect(tl.getDomainEvents("meeting").length).toBe(1);
  });

  it("returns empty for unknown domain", () => {
    const tl = makeTimeline();
    expect(tl.getDomainEvents("schema").length).toBe(0);
  });

  it("all returned events have replayCategory === 'state_change'", () => {
    const tl = makeTimeline();
    for (const ev of tl.getDomainEvents()) {
      expect(ev.replayCategory).toBe("state_change");
    }
  });

  it("filtered events match the requested domain", () => {
    const tl = makeTimeline();
    for (const ev of tl.getDomainEvents("task")) {
      expect(ev.domain).toBe("task");
    }
  });
});

// ---------------------------------------------------------------------------
// (9t-10) getRunEvents
// ---------------------------------------------------------------------------

describe("getRunEvents (9t-10)", () => {
  it("returns events for a specific run_id", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS,       "run-A"),
      makeAgentEv("a2", BASE_TS + 100, "run-A"),
      makeAgentEv("a3", BASE_TS + 200, "run-B"),
    ]));
    expect(tl.getRunEvents("run-A").length).toBe(2);
    expect(tl.getRunEvents("run-B").length).toBe(1);
  });

  it("returns empty for unknown run_id", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([makeAgentEv("a1", BASE_TS, "run-A")]));
    expect(tl.getRunEvents("run-MISSING").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (9t-11) getAgentIds / getRunIds
// ---------------------------------------------------------------------------

describe("getAgentIds and getRunIds (9t-11)", () => {
  it("getAgentIds returns empty array for empty timeline", () => {
    expect(emptyTimeline().getAgentIds().length).toBe(0);
  });

  it("getAgentIds returns unique agent IDs in first-appearance order", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("beta",  BASE_TS),
      makeAgentEv("alpha", BASE_TS + 100),
      makeAgentEv("beta",  BASE_TS + 200), // duplicate
    ]));
    const ids = tl.getAgentIds();
    expect(ids).toEqual(["beta", "alpha"]);
  });

  it("getRunIds returns empty array for empty timeline", () => {
    expect(emptyTimeline().getRunIds().length).toBe(0);
  });

  it("getRunIds returns unique run_ids in first-appearance order", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS,       "run-2"),
      makeAgentEv("a2", BASE_TS + 100, "run-1"),
      makeAgentEv("a3", BASE_TS + 200, "run-2"), // duplicate
    ]));
    const ids = tl.getRunIds();
    expect(ids).toEqual(["run-2", "run-1"]);
  });

  it("getAgentIds count matches metadata.agentCount", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 100),
      makeAgentEv("a1", BASE_TS + 200),
    ]));
    expect(tl.getAgentIds().length).toBe(tl.metadata.agentCount);
  });

  it("getRunIds count matches metadata.runCount", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([
      makeAgentEv("a1", BASE_TS,       "r-1"),
      makeAgentEv("a2", BASE_TS + 100, "r-2"),
    ]));
    expect(tl.getRunIds().length).toBe(tl.metadata.runCount);
  });
});

// ---------------------------------------------------------------------------
// (9t-12) mergeTimelines
// ---------------------------------------------------------------------------

describe("mergeTimelines (9t-12)", () => {
  it("merging 0 batches returns empty timeline", () => {
    const tl = mergeTimelines([]);
    expect(tl.isEmpty()).toBe(true);
  });

  it("merging 1 batch is equivalent to buildTimeline", () => {
    resetSeq();
    const batch = makeBatch([makeAgentEv("a1", BASE_TS)]);
    const merged = mergeTimelines([batch]);
    const built  = buildTimeline(batch);
    expect(merged.metadata.totalEvents).toBe(built.metadata.totalEvents);
  });

  it("merges events from 2 batches in chronological order", () => {
    resetSeq();
    const batch1 = makeBatch([
      makeAgentEv("a1", BASE_TS),
      makeAgentEv("a2", BASE_TS + 2000),
    ]);
    const batch2 = makeBatch([
      makeAgentEv("a3", BASE_TS + 1000), // between batch1's events
      makeAgentEv("a4", BASE_TS + 3000),
    ]);
    const tl = mergeTimelines([batch1, batch2]);
    expect(tl.metadata.totalEvents).toBe(4);
    // Should be sorted: BASE_TS, +1000, +2000, +3000
    expect(tl.events[0].tsMs).toBe(BASE_TS);
    expect(tl.events[1].tsMs).toBe(BASE_TS + 1000);
    expect(tl.events[2].tsMs).toBe(BASE_TS + 2000);
    expect(tl.events[3].tsMs).toBe(BASE_TS + 3000);
  });

  it("accumulates parse errors from all batches", () => {
    resetSeq();
    const batch1 = makeBatch([], [makeParseError("e1")]);
    const batch2 = makeBatch([], [makeParseError("e2"), makeParseError("e3")]);
    const tl = mergeTimelines([batch1, batch2]);
    expect(tl.metadata.parseErrorCount).toBe(3);
    expect(tl.metadata.parseErrors.length).toBe(3);
  });

  it("merges 3 batches (multi-day scenario)", () => {
    resetSeq();
    const day1 = makeBatch([makeAgentEv("a1", BASE_TS)]);
    const day2 = makeBatch([makeAgentEv("a2", BASE_TS + 86_400_000)]);
    const day3 = makeBatch([makeAgentEv("a3", BASE_TS + 172_800_000)]);
    const tl = mergeTimelines([day1, day2, day3]);
    expect(tl.metadata.totalEvents).toBe(3);
    expect(tl.metadata.durationMs).toBe(172_800_000);
  });

  it("empty batches are ignored gracefully", () => {
    resetSeq();
    const empty = makeBatch([]);
    const filled = makeBatch([makeAgentEv("a1", BASE_TS)]);
    const tl = mergeTimelines([empty, filled, empty]);
    expect(tl.metadata.totalEvents).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (9t-13) ReplayTimeline — immutability invariants
// ---------------------------------------------------------------------------

describe("ReplayTimeline immutability (9t-13)", () => {
  it("events array is frozen (Object.isFrozen)", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([makeAgentEv("a1", BASE_TS)]));
    expect(Object.isFrozen(tl.events)).toBe(true);
  });

  it("metadata.parseErrors is frozen", () => {
    const tl = buildTimeline(makeBatch([], [makeParseError()]));
    expect(Object.isFrozen(tl.metadata.parseErrors)).toBe(true);
  });

  it("getEventsUpTo returns a new array (mutation-safe)", () => {
    resetSeq();
    const tl = buildTimeline(makeBatch([makeAgentEv("a1", BASE_TS)]));
    const result = tl.getEventsUpTo(BASE_TS + 9999);
    result.push(makeAgentEv("a2", BASE_TS + 1)); // mutate returned array
    expect(tl.events.length).toBe(1); // original unchanged
  });
});

// ---------------------------------------------------------------------------
// (9t-14) Integration: EventLogParser → buildTimeline
// ---------------------------------------------------------------------------

describe("Integration: EventLogParser → buildTimeline (9t-14)", () => {
  it("parses a JSONL text and builds a timeline via parser + buildTimeline", async () => {
    const { EventLogParser } = await import("../event-log-parser.js");
    const parser = new EventLogParser();

    const lines = [
      JSON.stringify({
        schema: "conitens.event.v1",
        event_id: "evt-1",
        type: "agent.spawned",
        ts: "2024-06-01T00:00:01.000Z",
        run_id: "run-001",
        actor: { kind: "agent", id: "agent-x" },
        payload: { agent_id: "agent-x", persona: "implementer", run_id: "run-001" },
      }),
      JSON.stringify({
        schema: "conitens.event.v1",
        event_id: "evt-2",
        type: "task.created",
        ts: "2024-06-01T00:00:02.000Z",
        run_id: "run-001",
        actor: { kind: "system", id: "orchestrator" },
        payload: { task_id: "t-1", title: "Test" },
      }),
      "", // blank line — should be skipped
      JSON.stringify({
        schema: "conitens.event.v1",
        event_id: "evt-3",
        type: "command.issued",
        ts: "2024-06-01T00:00:03.000Z",
        run_id: "run-001",
        actor: { kind: "user", id: "gui" },
        payload: { command_id: "cmd-1", command_type: "agent.spawn", source: "gui", input: {} },
      }),
      "NOT VALID JSON", // parse error — should not abort
    ].join("\n");

    const batch = parser.parseJsonlText(lines);
    const tl    = buildTimeline(batch);

    // Should have 3 events (one blank, one error skipped)
    expect(tl.metadata.totalEvents).toBe(3);
    expect(tl.metadata.parseErrorCount).toBe(1);
    expect(tl.metadata.categoryCounts.agent_lifecycle).toBe(1);
    expect(tl.metadata.categoryCounts.state_change).toBe(1);
    expect(tl.metadata.categoryCounts.command).toBe(1);
    expect(tl.metadata.agentCount).toBe(1);
    expect(tl.metadata.runCount).toBe(1);
    expect(tl.metadata.durationMs).toBe(2000); // 3 seconds - 1 second = 2 seconds

    // getAgentEvents
    const agentEvs = tl.getAgentEvents();
    expect(agentEvs.length).toBe(1);
    expect(agentEvs[0].agentId).toBe("agent-x");

    // getDomainEvents
    const taskEvs = tl.getDomainEvents("task");
    expect(taskEvs.length).toBe(1);

    // getCommandEvents
    const cmdEvs = tl.getCommandEvents();
    expect(cmdEvs.length).toBe(1);

    // Time-based query
    const upTo2s = tl.getEventsUpTo(Date.parse("2024-06-01T00:00:02.000Z"));
    expect(upTo2s.length).toBe(2);
  });
});
