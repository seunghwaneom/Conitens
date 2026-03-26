/**
 * spatial-layout-reconstruction.test.ts — Unit tests for Sub-AC 9c.
 *
 * Tests the pure spatial layout reconstruction engine that replays
 * event_log entries from the nearest layout.init bootstrap up to the
 * replay_state cursor position, producing a reconstructed spatial snapshot.
 *
 * Test ID scheme:
 *   9sl-N : Sub-AC 9c spatial layout reconstruction tests
 *
 * Coverage:
 *   9sl-1  : emptySpatialLayout — initial state shape
 *   9sl-2  : reconstructSpatialLayoutAtIndex — no events, empty layout
 *   9sl-3  : findNearestLayoutInitIndex — returns -1 when no layout.init
 *   9sl-4  : findNearestLayoutInitIndex — finds the last layout.init before cursor
 *   9sl-5  : reconstructSpatialLayoutAtIndex — single layout.init seeds rooms
 *   9sl-6  : reconstructSpatialLayoutAtIndex — layout.init seeds agents
 *   9sl-7  : reconstructSpatialLayoutAtIndex — layout.init seeds fixtures
 *   9sl-8  : layout.node.moved updates room position
 *   9sl-9  : layout.node.moved updates agent position
 *   9sl-10 : layout.node.moved updates fixture position (prop/desk/camera)
 *   9sl-11 : layout.node.moved before cursor is applied; after cursor is skipped
 *   9sl-12 : layout.reset re-seeds from nearest layout.init anchor
 *   9sl-13 : layout.updated with new_snapshot applies rooms/agents/fixtures
 *   9sl-14 : layout.loaded replaces layout state from snapshot
 *   9sl-15 : multiple layout.init events — nearest one wins as anchor
 *   9sl-16 : no layout.init found → hasAnchor = false, empty geometry
 *   9sl-17 : cursor before any layout.init → empty layout
 *   9sl-18 : determinism — same events always produce same output
 *   9sl-19 : reconstructSpatialLayoutAt with timestamp selects correct cursor
 *   9sl-20 : reconstructSpatialLayoutAt with ReplayCursorState
 *   9sl-21 : listRoomIds returns sorted room IDs
 *   9sl-22 : listSpatialAgentIds returns sorted agent IDs
 *   9sl-23 : traceRoomPositionHistory traces positions across events
 *   9sl-24 : layout.init with missing building_id — no anchor seeded
 *   9sl-25 : layout.node.moved creates room node if not seeded yet (defensive)
 *   9sl-26 : layout.node.moved rotation preserved when to_rotation omitted
 *   9sl-27 : second layout.init after first — supersedes anchor
 *   9sl-28 : eventsApplied counts delta events, not layout.init
 *   9sl-29 : anchorSeq and anchorEventIndex reflect layout.init location
 *   9sl-30 : forward-compat — unknown event types in layout domain are skipped
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  emptySpatialLayout,
  findNearestLayoutInitIndex,
  reconstructSpatialLayoutAt,
  reconstructSpatialLayoutAtIndex,
  listRoomIds,
  listSpatialAgentIds,
  listFixtureIds,
  traceRoomPositionHistory,
  type ReconstructedSpatialLayout,
  type Vec3,
} from "../spatial-layout-reconstruction.js";
import type {
  TypedReplayEvent,
  StateChangeReplayEvent,
} from "../event-log-schema.js";
import type { ReplayCursorState } from "../replay-cursor.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

let _seq = 0;
let _ts = 2_000_000; // baseline Unix ms

function nextSeq() {
  return ++_seq;
}
function advanceTs(ms = 100) {
  _ts += ms;
  return _ts;
}

beforeEach(() => {
  _seq = 0;
  _ts = 2_000_000;
});

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRaw(type: string, payload: Record<string, unknown>, tsMs: number): any {
  return {
    schema: "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}-${nextSeq()}`,
    type,
    ts: new Date(tsMs).toISOString(),
    run_id: "run-test",
    actor: { kind: "system", id: "orchestrator" },
    payload,
  };
}

/** Build a StateChangeReplayEvent (layout domain). */
function makeLayoutEvent(
  type: string,
  payload: Record<string, unknown>,
  tsMs?: number,
): StateChangeReplayEvent {
  const ts = tsMs ?? advanceTs();
  return {
    replayCategory: "state_change",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    ts: new Date(ts).toISOString(),
    tsMs: ts,
    actor: { kind: "system", id: "orchestrator" },
    run_id: "run-test",
    seq: nextSeq(),
    raw: makeRaw(type, payload, ts),
    typedPayload: payload,
    domain: "layout",
  };
}

/** Build a non-layout StateChangeReplayEvent. */
function makeNonLayoutEvent(tsMs?: number): StateChangeReplayEvent {
  const ts = tsMs ?? advanceTs();
  return {
    replayCategory: "state_change",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: "task.created" as any,
    ts: new Date(ts).toISOString(),
    tsMs: ts,
    actor: { kind: "system", id: "orchestrator" },
    run_id: "run-test",
    seq: nextSeq(),
    raw: makeRaw("task.created", { task_id: "t1" }, ts),
    typedPayload: { task_id: "t1" },
    domain: "task",
  };
}

/** Build a minimal layout.init payload. */
function makeLayoutInit(rooms: Array<{ room_id: string; position: Vec3; floor?: number }> = []) {
  return {
    layout_id: "main-layout",
    building_id: "main-building",
    rooms: rooms.map((r) => ({
      room_id: r.room_id,
      position: r.position,
      floor: r.floor ?? 0,
    })),
  };
}

/** Build a ReplayCursorState from an index. */
function makeCursor(
  events: readonly TypedReplayEvent[],
  cursorIndex: number,
): ReplayCursorState {
  const totalEvents = events.length;
  const clamped = Math.max(-1, Math.min(totalEvents - 1, cursorIndex));
  const event = clamped >= 0 ? events[clamped] : null;
  return {
    cursorIndex: clamped,
    cursorSeq: event?.seq ?? 0,
    cursorTs: event?.tsMs ?? 0,
    currentEvent: event,
    totalEvents,
    isAtStart: clamped <= 0,
    isAtEnd: clamped >= totalEvents - 1,
    isBeforeStart: clamped === -1,
  };
}

// ── 9sl-1: emptySpatialLayout ─────────────────────────────────────────────────

describe("emptySpatialLayout (9sl-1)", () => {
  it("returns an object with all required top-level fields", () => {
    const s = emptySpatialLayout();
    expect(s).toHaveProperty("ts");
    expect(s).toHaveProperty("seq");
    expect(s).toHaveProperty("eventsApplied");
    expect(s).toHaveProperty("layoutId");
    expect(s).toHaveProperty("buildingId");
    expect(s).toHaveProperty("anchorEventIndex");
    expect(s).toHaveProperty("anchorSeq");
    expect(s).toHaveProperty("hasAnchor");
    expect(s).toHaveProperty("rooms");
    expect(s).toHaveProperty("agents");
    expect(s).toHaveProperty("fixtures");
  });

  it("returns empty geometry maps", () => {
    const s = emptySpatialLayout();
    expect(s.rooms).toEqual({});
    expect(s.agents).toEqual({});
    expect(s.fixtures).toEqual({});
  });

  it("hasAnchor is false", () => {
    const s = emptySpatialLayout();
    expect(s.hasAnchor).toBe(false);
  });

  it("accepts a custom timestamp", () => {
    const s = emptySpatialLayout(12345);
    expect(s.ts).toBe(12345);
  });
});

// ── 9sl-2: reconstructSpatialLayoutAtIndex — empty input ─────────────────────

describe("reconstructSpatialLayoutAtIndex — empty (9sl-2)", () => {
  it("returns empty layout for empty events array", () => {
    const result = reconstructSpatialLayoutAtIndex([], 0);
    expect(result.hasAnchor).toBe(false);
    expect(result.rooms).toEqual({});
  });

  it("returns empty layout for cursorIndex -1", () => {
    const event = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r1", position: vec3(1, 0, 1) }]));
    const result = reconstructSpatialLayoutAtIndex([event], -1);
    expect(result.hasAnchor).toBe(false);
    expect(result.rooms).toEqual({});
  });
});

// ── 9sl-3: findNearestLayoutInitIndex — no layout.init ───────────────────────

describe("findNearestLayoutInitIndex — no layout.init (9sl-3)", () => {
  it("returns -1 when no layout.init event exists", () => {
    const events: TypedReplayEvent[] = [
      makeNonLayoutEvent(),
      makeNonLayoutEvent(),
    ];
    expect(findNearestLayoutInitIndex(events, events.length - 1)).toBe(-1);
  });

  it("returns -1 for empty events array", () => {
    expect(findNearestLayoutInitIndex([], 0)).toBe(-1);
  });

  it("returns -1 when upToIndex is -1", () => {
    const event = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r1", position: vec3(0, 0, 0) }]));
    expect(findNearestLayoutInitIndex([event], -1)).toBe(-1);
  });
});

// ── 9sl-4: findNearestLayoutInitIndex — finds nearest ────────────────────────

describe("findNearestLayoutInitIndex — finds nearest (9sl-4)", () => {
  it("returns the index of the only layout.init", () => {
    const e0 = makeNonLayoutEvent();
    const e1 = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r1", position: vec3(0, 0, 0) }]));
    const e2 = makeNonLayoutEvent();
    const events = [e0, e1, e2];
    expect(findNearestLayoutInitIndex(events, 2)).toBe(1);
  });

  it("returns the LAST layout.init when multiple exist before cursor", () => {
    const e0 = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r1", position: vec3(1, 0, 0) }]));
    const e1 = makeNonLayoutEvent();
    const e2 = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r2", position: vec3(2, 0, 0) }]));
    const e3 = makeNonLayoutEvent();
    const events = [e0, e1, e2, e3];
    expect(findNearestLayoutInitIndex(events, 3)).toBe(2);
  });

  it("does not look past upToIndex", () => {
    const e0 = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r1", position: vec3(1, 0, 0) }]));
    const e1 = makeNonLayoutEvent();
    const e2 = makeLayoutEvent("layout.init", makeLayoutInit([{ room_id: "r2", position: vec3(2, 0, 0) }]));
    const events = [e0, e1, e2];
    // upToIndex = 1 → should only see e0 and e1; e2 is past
    expect(findNearestLayoutInitIndex(events, 1)).toBe(0);
  });
});

// ── 9sl-5: layout.init seeds rooms ───────────────────────────────────────────

describe("layout.init seeds rooms (9sl-5)", () => {
  it("populates rooms from layout.init payload", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([
        { room_id: "ops", position: vec3(0, 0, 0), floor: 1 },
        { room_id: "lab", position: vec3(10, 0, 5), floor: 2 },
      ]),
    );
    const events = [initEvent];
    const result = reconstructSpatialLayoutAtIndex(events, 0);

    expect(result.hasAnchor).toBe(true);
    expect(result.layoutId).toBe("main-layout");
    expect(result.buildingId).toBe("main-building");
    expect(Object.keys(result.rooms)).toHaveLength(2);
    expect(result.rooms["ops"]).toBeDefined();
    expect(result.rooms["ops"].position).toEqual(vec3(0, 0, 0));
    expect(result.rooms["ops"].floor).toBe(1);
    expect(result.rooms["lab"].position).toEqual(vec3(10, 0, 5));
    expect(result.rooms["lab"].floor).toBe(2);
  });

  it("sets default rotation {0,0,0} and scale {1,1,1} when omitted", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const result = reconstructSpatialLayoutAtIndex([initEvent], 0);
    expect(result.rooms["ops"].rotation).toEqual(vec3(0, 0, 0));
    expect(result.rooms["ops"].scale).toEqual(vec3(1, 1, 1));
  });
});

// ── 9sl-6: layout.init seeds agents ──────────────────────────────────────────

describe("layout.init seeds agents (9sl-6)", () => {
  it("populates agents from layout.init payload", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      agents: [
        { agent_id: "manager", room_id: "ops", position: vec3(1, 0, 1) },
        { agent_id: "researcher", room_id: "ops", position: vec3(2, 0, 1) },
      ],
    };
    const initEvent = makeLayoutEvent("layout.init", initPayload);
    const result = reconstructSpatialLayoutAtIndex([initEvent], 0);

    expect(Object.keys(result.agents)).toHaveLength(2);
    expect(result.agents["manager"].roomId).toBe("ops");
    expect(result.agents["manager"].position).toEqual(vec3(1, 0, 1));
    expect(result.agents["researcher"].position).toEqual(vec3(2, 0, 1));
  });

  it("sets default rotation {0,0,0} for agents when omitted", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      agents: [{ agent_id: "manager", room_id: "ops", position: vec3(1, 0, 1) }],
    };
    const result = reconstructSpatialLayoutAtIndex(
      [makeLayoutEvent("layout.init", initPayload)],
      0,
    );
    expect(result.agents["manager"].rotation).toEqual(vec3(0, 0, 0));
  });
});

// ── 9sl-7: layout.init seeds fixtures ────────────────────────────────────────

describe("layout.init seeds fixtures (9sl-7)", () => {
  it("populates fixtures from layout.init payload", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      fixtures: [
        {
          fixture_id: "control-panel-1",
          fixture_type: "control_panel",
          room_id: "ops",
          position: vec3(0, 1, 0),
          initial_config: { panel_id: "cp1" },
        },
      ],
    };
    const result = reconstructSpatialLayoutAtIndex(
      [makeLayoutEvent("layout.init", initPayload)],
      0,
    );

    expect(Object.keys(result.fixtures)).toHaveLength(1);
    const fixture = result.fixtures["control-panel-1"];
    expect(fixture.fixtureType).toBe("control_panel");
    expect(fixture.roomId).toBe("ops");
    expect(fixture.position).toEqual(vec3(0, 1, 0));
    expect(fixture.config).toEqual({ panel_id: "cp1" });
  });
});

// ── 9sl-8: layout.node.moved updates room position ───────────────────────────

describe("layout.node.moved room (9sl-8)", () => {
  it("updates room position after layout.init", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
    });
    const events = [initEvent, moveEvent];
    const result = reconstructSpatialLayoutAtIndex(events, 1);

    expect(result.rooms["ops"].position).toEqual(vec3(5, 0, 5));
  });

  it("updates room rotation when to_rotation is provided", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
      to_rotation: vec3(0, 1.57, 0),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    expect(result.rooms["ops"].rotation).toEqual(vec3(0, 1.57, 0));
  });
});

// ── 9sl-9: layout.node.moved updates agent position ──────────────────────────

describe("layout.node.moved agent (9sl-9)", () => {
  it("updates agent position after layout.init", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      agents: [{ agent_id: "manager", room_id: "ops", position: vec3(1, 0, 1) }],
    };
    const initEvent = makeLayoutEvent("layout.init", initPayload);
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "manager",
      node_type: "agent",
      from_position: vec3(1, 0, 1),
      to_position: vec3(3, 0, 2),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    expect(result.agents["manager"].position).toEqual(vec3(3, 0, 2));
  });
});

// ── 9sl-10: layout.node.moved fixture (prop/desk/camera) ─────────────────────

describe("layout.node.moved fixture node types (9sl-10)", () => {
  it("updates prop position", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "prop-1",
      node_type: "prop",
      from_position: vec3(0, 0, 0),
      to_position: vec3(7, 0, 3),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    expect(result.fixtures["prop-1"]).toBeDefined();
    expect(result.fixtures["prop-1"].position).toEqual(vec3(7, 0, 3));
    expect(result.fixtures["prop-1"].fixtureType).toBe("prop");
  });

  it("updates desk position", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "desk-1",
      node_type: "desk",
      from_position: vec3(0, 0, 0),
      to_position: vec3(2, 0, 1),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    expect(result.fixtures["desk-1"].position).toEqual(vec3(2, 0, 1));
  });
});

// ── 9sl-11: events after cursor are not applied ───────────────────────────────

describe("cursor boundary (9sl-11)", () => {
  it("events after cursorIndex are not applied", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const move1 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
    });
    const move2 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(5, 0, 5),
      to_position: vec3(99, 0, 99),
    });
    const events = [initEvent, move1, move2];

    // Cursor at index 1 — only move1 should be applied, not move2
    const result = reconstructSpatialLayoutAtIndex(events, 1);
    expect(result.rooms["ops"].position).toEqual(vec3(5, 0, 5));
  });
});

// ── 9sl-12: layout.reset re-seeds from anchor ────────────────────────────────

describe("layout.reset (9sl-12)", () => {
  it("re-seeds from the nearest layout.init anchor after a reset", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(50, 0, 50),
    });
    const resetEvent = makeLayoutEvent("layout.reset", {
      layout_id: "main-layout",
      reason: "user_requested",
    });
    const events = [initEvent, moveEvent, resetEvent];
    const result = reconstructSpatialLayoutAtIndex(events, 2);

    // After reset, room should be back at its initial position
    expect(result.rooms["ops"].position).toEqual(vec3(0, 0, 0));
  });
});

// ── 9sl-13: layout.updated with new_snapshot ─────────────────────────────────

describe("layout.updated with new_snapshot (9sl-13)", () => {
  it("applies rooms from new_snapshot", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([
        { room_id: "ops", position: vec3(0, 0, 0) },
        { room_id: "lab", position: vec3(5, 0, 0) },
      ]),
    );
    const updateEvent = makeLayoutEvent("layout.updated", {
      layout_id: "main-layout",
      changed_fields: ["rooms.ops.position"],
      new_snapshot: {
        rooms: [{ room_id: "ops", position: vec3(20, 0, 20) }],
      },
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, updateEvent], 1);

    expect(result.rooms["ops"].position).toEqual(vec3(20, 0, 20));
    // lab was not in new_snapshot and should retain its original position
    expect(result.rooms["lab"].position).toEqual(vec3(5, 0, 0));
  });
});

// ── 9sl-14: layout.loaded replaces layout state ──────────────────────────────

describe("layout.loaded (9sl-14)", () => {
  it("replaces rooms from snapshot field", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const loadedEvent = makeLayoutEvent("layout.loaded", {
      layout_id: "main-layout",
      load_path: ".conitens/layouts/main.json",
      snapshot: {
        layout_id: "main-layout",
        building_id: "main-building",
        rooms: [{ room_id: "saved-room", position: vec3(100, 0, 100) }],
      },
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, loadedEvent], 1);

    // ops should be gone (snapshot replaces entirely)
    expect(result.rooms["ops"]).toBeUndefined();
    expect(result.rooms["saved-room"]).toBeDefined();
    expect(result.rooms["saved-room"].position).toEqual(vec3(100, 0, 100));
  });
});

// ── 9sl-15: multiple layout.init — nearest wins ──────────────────────────────

describe("multiple layout.init events — nearest wins (9sl-15)", () => {
  it("uses the last layout.init before cursor as anchor", () => {
    const init1 = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "old-room", position: vec3(1, 0, 0) }]),
    );
    const nonLayout = makeNonLayoutEvent();
    const init2 = makeLayoutEvent(
      "layout.init",
      {
        layout_id: "main-layout",
        building_id: "main-building",
        rooms: [{ room_id: "new-room", position: vec3(99, 0, 0) }],
      },
    );
    const events = [init1, nonLayout, init2];
    const result = reconstructSpatialLayoutAtIndex(events, 2);

    // Should be seeded from init2, so new-room exists and old-room does not
    expect(result.rooms["new-room"]).toBeDefined();
    expect(result.rooms["old-room"]).toBeUndefined();
    expect(result.anchorEventIndex).toBe(2);
  });

  it("cursor at index 0 uses init1 (before init2)", () => {
    const init1 = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "old-room", position: vec3(1, 0, 0) }]),
    );
    const init2 = makeLayoutEvent(
      "layout.init",
      {
        layout_id: "main-layout",
        building_id: "main-building",
        rooms: [{ room_id: "new-room", position: vec3(99, 0, 0) }],
      },
    );
    const events = [init1, init2];
    const result = reconstructSpatialLayoutAtIndex(events, 0);

    expect(result.rooms["old-room"]).toBeDefined();
    expect(result.rooms["new-room"]).toBeUndefined();
  });
});

// ── 9sl-16: no layout.init → hasAnchor false ─────────────────────────────────

describe("no layout.init → hasAnchor false (9sl-16)", () => {
  it("returns empty layout with hasAnchor false when no layout.init exists", () => {
    const events = [makeNonLayoutEvent(), makeNonLayoutEvent(), makeNonLayoutEvent()];
    const result = reconstructSpatialLayoutAtIndex(events, events.length - 1);
    expect(result.hasAnchor).toBe(false);
    expect(result.rooms).toEqual({});
    expect(result.agents).toEqual({});
    expect(result.fixtures).toEqual({});
  });
});

// ── 9sl-17: cursor before layout.init → empty ────────────────────────────────

describe("cursor before layout.init (9sl-17)", () => {
  it("returns empty layout when cursor index precedes the only layout.init", () => {
    const nonLayout = makeNonLayoutEvent();
    const init = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const events = [nonLayout, init];
    // cursorIndex = 0 is before the layout.init at index 1
    const result = reconstructSpatialLayoutAtIndex(events, 0);
    expect(result.hasAnchor).toBe(false);
  });
});

// ── 9sl-18: determinism ────────────────────────────────────────────────────────

describe("determinism (9sl-18)", () => {
  it("produces identical output for two identical event arrays", () => {
    const buildEvents = () => {
      _seq = 0;
      _ts = 2_000_000;
      return [
        makeLayoutEvent("layout.init", makeLayoutInit([
          { room_id: "r1", position: vec3(1, 0, 2) },
          { room_id: "r2", position: vec3(3, 0, 4) },
        ])),
        makeLayoutEvent("layout.node.moved", {
          layout_id: "main-layout",
          node_id: "r1",
          node_type: "room",
          from_position: vec3(1, 0, 2),
          to_position: vec3(9, 0, 9),
        }),
      ];
    };

    const result1 = reconstructSpatialLayoutAtIndex(buildEvents(), 1);
    const result2 = reconstructSpatialLayoutAtIndex(buildEvents(), 1);
    expect(result1.rooms["r1"].position).toEqual(result2.rooms["r1"].position);
    expect(result1.rooms["r2"].position).toEqual(result2.rooms["r2"].position);
  });
});

// ── 9sl-19: reconstructSpatialLayoutAt with timestamp ────────────────────────

describe("reconstructSpatialLayoutAt with timestamp (9sl-19)", () => {
  it("applies events up to targetTs and excludes those after", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      2_000_100,
    );
    const move1 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
    }, 2_000_200);
    const move2 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(5, 0, 5),
      to_position: vec3(99, 0, 99),
    }, 2_000_400);
    const events = [initEvent, move1, move2];

    // Target ts 2_000_300 — after move1 but before move2
    const result = reconstructSpatialLayoutAt(events, 2_000_300);
    expect(result.rooms["ops"].position).toEqual(vec3(5, 0, 5));
  });
});

// ── 9sl-20: reconstructSpatialLayoutAt with ReplayCursorState ────────────────

describe("reconstructSpatialLayoutAt with ReplayCursorState (9sl-20)", () => {
  it("uses cursorIndex from the cursor state", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const move1 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(7, 0, 7),
    });
    const events = [initEvent, move1];
    const cursor = makeCursor(events, 1);
    const result = reconstructSpatialLayoutAt(events, cursor);
    expect(result.rooms["ops"].position).toEqual(vec3(7, 0, 7));
  });
});

// ── 9sl-21: listRoomIds ────────────────────────────────────────────────────────

describe("listRoomIds (9sl-21)", () => {
  it("returns sorted room IDs", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([
        { room_id: "ops", position: vec3(0, 0, 0) },
        { room_id: "lab", position: vec3(1, 0, 0) },
        { room_id: "exec", position: vec3(2, 0, 0) },
      ]),
    );
    const result = reconstructSpatialLayoutAtIndex([initEvent], 0);
    expect(listRoomIds(result)).toEqual(["exec", "lab", "ops"]);
  });

  it("returns empty array for empty layout", () => {
    expect(listRoomIds(emptySpatialLayout())).toEqual([]);
  });
});

// ── 9sl-22: listSpatialAgentIds ────────────────────────────────────────────────

describe("listSpatialAgentIds (9sl-22)", () => {
  it("returns sorted agent IDs", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      agents: [
        { agent_id: "researcher", room_id: "ops", position: vec3(1, 0, 0) },
        { agent_id: "manager", room_id: "ops", position: vec3(2, 0, 0) },
      ],
    };
    const result = reconstructSpatialLayoutAtIndex(
      [makeLayoutEvent("layout.init", initPayload)],
      0,
    );
    expect(listSpatialAgentIds(result)).toEqual(["manager", "researcher"]);
  });
});

// ── 9sl-23: traceRoomPositionHistory ──────────────────────────────────────────

describe("traceRoomPositionHistory (9sl-23)", () => {
  it("captures initial position from layout.init and subsequent moves", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const move1 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
    });
    const move2 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(5, 0, 5),
      to_position: vec3(10, 0, 10),
    });
    const history = traceRoomPositionHistory([initEvent, move1, move2], "ops");

    expect(history).toHaveLength(3);
    expect(history[0].position).toEqual(vec3(0, 0, 0));
    expect(history[0].eventType).toBe("layout.init");
    expect(history[1].position).toEqual(vec3(5, 0, 5));
    expect(history[1].eventType).toBe("layout.node.moved");
    expect(history[2].position).toEqual(vec3(10, 0, 10));
  });

  it("returns empty array when room not found in events", () => {
    const history = traceRoomPositionHistory([], "nonexistent");
    expect(history).toHaveLength(0);
  });
});

// ── 9sl-24: layout.init with missing building_id ─────────────────────────────

describe("layout.init with missing building_id (9sl-24)", () => {
  it("does not seed when building_id is missing", () => {
    const initEvent = makeLayoutEvent("layout.init", {
      layout_id: "main-layout",
      // no building_id
      rooms: [{ room_id: "ops", position: vec3(0, 0, 0) }],
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent], 0);
    // seedFromLayoutInit should bail early, leaving empty state
    expect(result.hasAnchor).toBe(false);
  });
});

// ── 9sl-25: layout.node.moved creates room node if not seeded ─────────────────

describe("layout.node.moved defensive creation (9sl-25)", () => {
  it("creates a room node on move when not in layout.init (defensive)", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    // Move references a room not in layout.init
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "phantom-room",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(3, 0, 3),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    expect(result.rooms["phantom-room"]).toBeDefined();
    expect(result.rooms["phantom-room"].position).toEqual(vec3(3, 0, 3));
  });
});

// ── 9sl-26: layout.node.moved rotation preserved when to_rotation omitted ─────

describe("layout.node.moved preserves rotation when to_rotation absent (9sl-26)", () => {
  it("does not overwrite rotation when to_rotation is omitted", () => {
    const initPayload = {
      ...makeLayoutInit([]),
      rooms: [{ room_id: "ops", position: vec3(0, 0, 0), rotation: vec3(0, 0.5, 0) }],
      layout_id: "main-layout",
      building_id: "main-building",
    };
    const initEvent = makeLayoutEvent("layout.init", initPayload);
    const moveEvent = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(5, 0, 5),
      // no to_rotation
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, moveEvent], 1);
    // Rotation should be preserved from layout.init
    expect(result.rooms["ops"].rotation).toEqual(vec3(0, 0.5, 0));
  });
});

// ── 9sl-27: second layout.init supersedes anchor ─────────────────────────────

describe("second layout.init supersedes anchor (9sl-27)", () => {
  it("a layout.init in the delta range becomes the new anchor", () => {
    const init1 = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "old-room", position: vec3(0, 0, 0) }]),
    );
    const nonLayout = makeNonLayoutEvent();
    const init2 = makeLayoutEvent("layout.init", {
      layout_id: "main-layout",
      building_id: "main-building",
      rooms: [{ room_id: "new-room", position: vec3(10, 0, 10) }],
    });
    const events = [init1, nonLayout, init2];
    const result = reconstructSpatialLayoutAtIndex(events, 2);

    // init2 is at index 2 (the cursor position) and supersedes init1
    expect(result.rooms["new-room"]).toBeDefined();
    expect(result.rooms["old-room"]).toBeUndefined();
    // anchorEventIndex updated to 2
    expect(result.anchorEventIndex).toBe(2);
  });
});

// ── 9sl-28: eventsApplied counts only deltas ──────────────────────────────────

describe("eventsApplied (9sl-28)", () => {
  it("counts delta events applied after layout.init, not the init itself", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const move1 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(1, 0, 0),
    });
    const move2 = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(1, 0, 0),
      to_position: vec3(2, 0, 0),
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, move1, move2], 2);
    expect(result.eventsApplied).toBe(2);
  });

  it("is 0 when cursor is at the layout.init event itself", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const result = reconstructSpatialLayoutAtIndex([initEvent], 0);
    expect(result.eventsApplied).toBe(0);
  });
});

// ── 9sl-29: anchorSeq and anchorEventIndex ────────────────────────────────────

describe("anchorSeq and anchorEventIndex (9sl-29)", () => {
  it("reflects the layout.init event position in the array", () => {
    const nonLayout = makeNonLayoutEvent();
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const move = makeLayoutEvent("layout.node.moved", {
      layout_id: "main-layout",
      node_id: "ops",
      node_type: "room",
      from_position: vec3(0, 0, 0),
      to_position: vec3(1, 0, 0),
    });
    const events = [nonLayout, initEvent, move];
    const result = reconstructSpatialLayoutAtIndex(events, 2);

    expect(result.anchorEventIndex).toBe(1);
    expect(result.anchorSeq).toBe(initEvent.seq);
  });
});

// ── 9sl-30: forward-compat — unknown layout event types skipped ───────────────

describe("forward-compatibility (9sl-30)", () => {
  it("skips unknown layout domain events without error", () => {
    const initEvent = makeLayoutEvent(
      "layout.init",
      makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
    );
    const unknownEvent = makeLayoutEvent("layout.future_event" as never, {
      layout_id: "main-layout",
      some_new_field: "value",
    });
    const result = reconstructSpatialLayoutAtIndex([initEvent, unknownEvent], 1);

    // Should not throw; ops should still be present at initial position
    expect(result.rooms["ops"]).toBeDefined();
    expect(result.rooms["ops"].position).toEqual(vec3(0, 0, 0));
  });
});

// ── 9sl-extra: listFixtureIds ─────────────────────────────────────────────────

describe("listFixtureIds", () => {
  it("returns sorted fixture IDs", () => {
    const initPayload = {
      ...makeLayoutInit([{ room_id: "ops", position: vec3(0, 0, 0) }]),
      fixtures: [
        { fixture_id: "z-fixture", fixture_type: "prop", room_id: "ops", position: vec3(0, 0, 0) },
        { fixture_id: "a-fixture", fixture_type: "desk", room_id: "ops", position: vec3(1, 0, 0) },
      ],
    };
    const result = reconstructSpatialLayoutAtIndex(
      [makeLayoutEvent("layout.init", initPayload)],
      0,
    );
    expect(listFixtureIds(result)).toEqual(["a-fixture", "z-fixture"]);
  });
});
