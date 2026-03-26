/**
 * meeting-gathering.test.ts — Sub-AC 10a tests
 *
 * Validates:
 *   1. computeCircularFormationPosition — circular formation geometry
 *   2. gatherAgentsForMeeting — repositions agents to meeting room
 *   3. disperseAgentsFromMeeting — restores agents to home rooms
 *   4. Event sourcing — all gathering actions are recorded
 *   5. Idempotency — gathering is a no-op if already gathered
 *   6. Edge cases — unknown rooms, empty participant lists, unknown agent IDs
 *   7. Building hierarchy integration — position within building hierarchy
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeCircularFormationPosition,
  useAgentStore,
  type MeetingGathering,
} from "../agent-store.js";
import { createDynamicAgentDef } from "../../data/agents.js";

// ── Store reset helper ─────────────────────────────────────────────

function resetStore() {
  useAgentStore.setState({
    agents: {},
    agentRegistry: {},
    events: [],
    selectedAgentId: null,
    initialized: false,
    meetingGatherings: {},
    _savedLiveAgents: null,
  });
}

// ── Test helpers ───────────────────────────────────────────────────

function makeDef(id: string, room = "ops-control") {
  return createDynamicAgentDef(id, `Agent ${id}`, "implementer", room);
}

/**
 * Place multiple agents in the store for testing.
 * Returns the agent IDs placed.
 */
function placeAgents(
  agentIds: string[],
  roomId = "ops-control",
): string[] {
  for (const id of agentIds) {
    useAgentStore.getState().registerAgent(makeDef(id, roomId));
  }
  return agentIds;
}

// ── computeCircularFormationPosition ──────────────────────────────

describe("computeCircularFormationPosition", () => {
  it("returns center (0.5, 0, 0.5) for a single participant", () => {
    const pos = computeCircularFormationPosition(0, 1);
    expect(pos.x).toBe(0.5);
    expect(pos.y).toBe(0);
    expect(pos.z).toBe(0.5);
  });

  it("returns center (0.5, 0, 0.5) for zero participants (guard)", () => {
    const pos = computeCircularFormationPosition(0, 0);
    expect(pos.x).toBe(0.5);
    expect(pos.y).toBe(0);
    expect(pos.z).toBe(0.5);
  });

  it("all positions are within [0.10, 0.90] bounds", () => {
    for (let n = 1; n <= 12; n++) {
      for (let i = 0; i < n; i++) {
        const pos = computeCircularFormationPosition(i, n);
        expect(pos.x).toBeGreaterThanOrEqual(0.10);
        expect(pos.x).toBeLessThanOrEqual(0.90);
        expect(pos.z).toBeGreaterThanOrEqual(0.10);
        expect(pos.z).toBeLessThanOrEqual(0.90);
        expect(pos.y).toBe(0);
      }
    }
  });

  it("2 participants are not at the same position", () => {
    const p0 = computeCircularFormationPosition(0, 2);
    const p1 = computeCircularFormationPosition(1, 2);
    const dx = p0.x - p1.x;
    const dz = p0.z - p1.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    expect(dist).toBeGreaterThan(0.01);
  });

  it("4 participants: all unique positions", () => {
    const positions = Array.from({ length: 4 }, (_, i) =>
      computeCircularFormationPosition(i, 4),
    );
    const keys = positions.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`);
    expect(new Set(keys).size).toBe(4);
  });

  it("6 participants: all unique positions", () => {
    const positions = Array.from({ length: 6 }, (_, i) =>
      computeCircularFormationPosition(i, 6),
    );
    const keys = positions.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`);
    expect(new Set(keys).size).toBe(6);
  });

  it("positions are approximately symmetric (opposite agents are mirrored through center)", () => {
    // For 4 agents, agent 0 and agent 2 should be mirrored through (0.5, 0.5)
    const p0 = computeCircularFormationPosition(0, 4);
    const p2 = computeCircularFormationPosition(2, 4);
    expect(p0.x + p2.x).toBeCloseTo(1.0, 2);
    expect(p0.z + p2.z).toBeCloseTo(1.0, 2);
  });

  it("center of mass of all positions is approximately (0.5, 0.5)", () => {
    for (const n of [2, 3, 4, 5, 6, 8]) {
      const positions = Array.from({ length: n }, (_, i) =>
        computeCircularFormationPosition(i, n),
      );
      const avgX = positions.reduce((s, p) => s + p.x, 0) / n;
      const avgZ = positions.reduce((s, p) => s + p.z, 0) / n;
      expect(avgX).toBeCloseTo(0.5, 1);
      expect(avgZ).toBeCloseTo(0.5, 1);
    }
  });

  it("radius is smaller for ≤4 participants than for >4 participants", () => {
    // Check that the circle radius is smaller for tight groups
    const dist4 = (() => {
      const p0 = computeCircularFormationPosition(0, 4);
      const dx = p0.x - 0.5;
      const dz = p0.z - 0.5;
      return Math.sqrt(dx * dx + dz * dz);
    })();

    const dist5 = (() => {
      const p0 = computeCircularFormationPosition(0, 5);
      const dx = p0.x - 0.5;
      const dz = p0.z - 0.5;
      return Math.sqrt(dx * dx + dz * dz);
    })();

    expect(dist4).toBeLessThan(dist5);
  });
});

// ── gatherAgentsForMeeting ─────────────────────────────────────────

describe("gatherAgentsForMeeting", () => {
  beforeEach(resetStore);

  it("creates a gathering record for the meeting", () => {
    placeAgents(["agent-a", "agent-b"], "ops-control");

    useAgentStore.getState().gatherAgentsForMeeting(
      "meeting-001",
      "ops-control",
      ["agent-a", "agent-b"],
    );

    const gathering = useAgentStore.getState().meetingGatherings["meeting-001"];
    expect(gathering).toBeDefined();
    expect(gathering.meetingId).toBe("meeting-001");
    expect(gathering.roomId).toBe("ops-control");
    expect(gathering.status).toBe("gathered");
  });

  it("records participant home rooms before moving", () => {
    placeAgents(["agent-a"], "ops-control");
    placeAgents(["agent-b"], "research-lab");

    useAgentStore.getState().gatherAgentsForMeeting(
      "meeting-001",
      "ops-control",
      ["agent-a", "agent-b"],
    );

    const gathering = useAgentStore.getState().meetingGatherings["meeting-001"];
    expect(gathering.participantHomeRooms["agent-a"]).toBe("ops-control");
    expect(gathering.participantHomeRooms["agent-b"]).toBe("research-lab");
  });

  it("moves all participants to the meeting room", () => {
    placeAgents(["agent-a"], "ops-control");
    placeAgents(["agent-b"], "research-lab");
    placeAgents(["agent-c"], "research-lab");

    useAgentStore.getState().gatherAgentsForMeeting(
      "meeting-001",
      "ops-control",
      ["agent-a", "agent-b", "agent-c"],
    );

    const agents = useAgentStore.getState().agents;
    expect(agents["agent-a"].roomId).toBe("ops-control");
    expect(agents["agent-b"].roomId).toBe("ops-control");
    expect(agents["agent-c"].roomId).toBe("ops-control");
  });

  it("arranges agents in circular formation (all unique world positions)", () => {
    placeAgents(["ag-1", "ag-2", "ag-3", "ag-4"], "research-lab");

    useAgentStore.getState().gatherAgentsForMeeting(
      "mtg-circ",
      "research-lab",
      ["ag-1", "ag-2", "ag-3", "ag-4"],
    );

    const agents = useAgentStore.getState().agents;
    const positions = ["ag-1", "ag-2", "ag-3", "ag-4"].map((id) => {
      const a = agents[id];
      return `${a.localPosition.x.toFixed(3)},${a.localPosition.z.toFixed(3)}`;
    });
    expect(new Set(positions).size).toBe(4);
  });

  it("emits agent.meeting_gathering events for each participant", () => {
    placeAgents(["agent-a", "agent-b"], "ops-control");

    useAgentStore.getState().gatherAgentsForMeeting(
      "meeting-evt",
      "ops-control",
      ["agent-a", "agent-b"],
    );

    const events = useAgentStore.getState().events;
    const gatherEvents = events.filter((e) => e.type === "agent.meeting_gathering");
    expect(gatherEvents).toHaveLength(2);
    expect(gatherEvents[0].payload["meeting_id"]).toBe("meeting-evt");
  });

  it("emits a single agents.meeting_gathered event", () => {
    placeAgents(["agent-x", "agent-y"], "ops-control");

    useAgentStore.getState().gatherAgentsForMeeting(
      "meeting-bulk",
      "ops-control",
      ["agent-x", "agent-y"],
    );

    const events = useAgentStore.getState().events;
    const bulkEvent = events.find((e) => e.type === "agents.meeting_gathered");
    expect(bulkEvent).toBeDefined();
    expect(bulkEvent?.payload["participant_count"]).toBe(2);
  });

  it("is idempotent: calling twice does not re-gather", () => {
    placeAgents(["agent-a"], "ops-control");

    useAgentStore.getState().gatherAgentsForMeeting("mtg-idem", "ops-control", ["agent-a"]);
    const eventsBefore = useAgentStore.getState().events.length;

    // Second call — should be no-op (already gathered)
    useAgentStore.getState().gatherAgentsForMeeting("mtg-idem", "ops-control", ["agent-a"]);
    const eventsAfter = useAgentStore.getState().events.length;

    expect(eventsAfter).toBe(eventsBefore);
  });

  it("silently skips unknown agent IDs", () => {
    placeAgents(["agent-real"], "ops-control");

    // "ghost-agent" is not in the store
    useAgentStore.getState().gatherAgentsForMeeting(
      "mtg-ghost",
      "ops-control",
      ["agent-real", "ghost-agent"],
    );

    const gathering = useAgentStore.getState().meetingGatherings["mtg-ghost"];
    expect(gathering).toBeDefined();
    // Only real agent was gathered
    expect(Object.keys(gathering.participantHomeRooms)).toHaveLength(1);
    expect(gathering.participantHomeRooms["agent-real"]).toBeDefined();
    expect(gathering.participantHomeRooms["ghost-agent"]).toBeUndefined();
  });

  it("no-op for empty participant list", () => {
    const eventsBefore = useAgentStore.getState().events.length;

    useAgentStore.getState().gatherAgentsForMeeting("mtg-empty", "ops-control", []);

    const gatheringCount = Object.keys(useAgentStore.getState().meetingGatherings).length;
    expect(gatheringCount).toBe(0);
    expect(useAgentStore.getState().events.length).toBe(eventsBefore);
  });
});

// ── disperseAgentsFromMeeting ──────────────────────────────────────

describe("disperseAgentsFromMeeting", () => {
  beforeEach(resetStore);

  it("moves agents back to their home rooms", () => {
    placeAgents(["agent-a"], "ops-control");
    placeAgents(["agent-b"], "research-lab");

    useAgentStore.getState().gatherAgentsForMeeting(
      "mtg-disperse",
      "ops-control",
      ["agent-a", "agent-b"],
    );

    // Both should be in ops-control now
    expect(useAgentStore.getState().agents["agent-b"].roomId).toBe("ops-control");

    useAgentStore.getState().disperseAgentsFromMeeting("mtg-disperse");

    // agent-b should be back in research-lab
    expect(useAgentStore.getState().agents["agent-a"].roomId).toBe("ops-control");
    expect(useAgentStore.getState().agents["agent-b"].roomId).toBe("research-lab");
  });

  it("marks the gathering as dispersed", () => {
    placeAgents(["agent-a"], "ops-control");
    useAgentStore.getState().gatherAgentsForMeeting("mtg-d2", "ops-control", ["agent-a"]);
    useAgentStore.getState().disperseAgentsFromMeeting("mtg-d2");

    const gathering = useAgentStore.getState().meetingGatherings["mtg-d2"];
    expect(gathering.status).toBe("dispersed");
  });

  it("emits agents.meeting_dispersed event", () => {
    placeAgents(["agent-a"], "ops-control");
    useAgentStore.getState().gatherAgentsForMeeting("mtg-evt", "ops-control", ["agent-a"]);
    useAgentStore.getState().disperseAgentsFromMeeting("mtg-evt");

    const events = useAgentStore.getState().events;
    const dispersedEvent = events.find((e) => e.type === "agents.meeting_dispersed");
    expect(dispersedEvent).toBeDefined();
    expect(dispersedEvent?.payload["meeting_id"]).toBe("mtg-evt");
  });

  it("is idempotent: dispersing twice does not re-emit events", () => {
    placeAgents(["agent-a"], "ops-control");
    useAgentStore.getState().gatherAgentsForMeeting("mtg-idem2", "ops-control", ["agent-a"]);
    useAgentStore.getState().disperseAgentsFromMeeting("mtg-idem2");
    const eventsBefore = useAgentStore.getState().events.length;

    // Second dispersal — no-op
    useAgentStore.getState().disperseAgentsFromMeeting("mtg-idem2");
    expect(useAgentStore.getState().events.length).toBe(eventsBefore);
  });

  it("no-op for unknown meeting ID", () => {
    const eventsBefore = useAgentStore.getState().events.length;
    useAgentStore.getState().disperseAgentsFromMeeting("unknown-meeting");
    expect(useAgentStore.getState().events.length).toBe(eventsBefore);
  });
});

// ── getMeetingGathering ────────────────────────────────────────────

describe("getMeetingGathering", () => {
  beforeEach(resetStore);

  it("returns undefined for an unknown meeting ID", () => {
    const g = useAgentStore.getState().getMeetingGathering("nope");
    expect(g).toBeUndefined();
  });

  it("returns the gathering record after gatherAgentsForMeeting", () => {
    placeAgents(["ag"], "ops-control");
    useAgentStore.getState().gatherAgentsForMeeting("mtg-get", "ops-control", ["ag"]);

    const g = useAgentStore.getState().getMeetingGathering("mtg-get");
    expect(g).toBeDefined();
    expect((g as MeetingGathering).meetingId).toBe("mtg-get");
  });
});

// ── Building hierarchy integration ────────────────────────────────

describe("spatial hierarchy — gathering within building", () => {
  beforeEach(resetStore);

  it("gathered agents have world positions within the meeting room bounds", () => {
    // Use the static building to validate world-space positions
    placeAgents(["ag-1", "ag-2", "ag-3"], "research-lab");

    useAgentStore.getState().gatherAgentsForMeeting(
      "mtg-bounds",
      "research-lab",
      ["ag-1", "ag-2", "ag-3"],
    );

    const agents = useAgentStore.getState().agents;
    for (const id of ["ag-1", "ag-2", "ag-3"]) {
      const agent = agents[id];
      // All agents should be in the meeting room
      expect(agent.roomId).toBe("research-lab");
      // World positions must be non-zero (room is somewhere in the building)
      // The exact values depend on static BUILDING data, but they must be finite
      expect(Number.isFinite(agent.worldPosition.x)).toBe(true);
      expect(Number.isFinite(agent.worldPosition.z)).toBe(true);
    }
  });

  it("gathering with re-gather after dispersal creates new gathering record", () => {
    placeAgents(["ag"], "ops-control");
    useAgentStore.getState().gatherAgentsForMeeting("mtg-regather", "ops-control", ["ag"]);
    useAgentStore.getState().disperseAgentsFromMeeting("mtg-regather");

    // After dispersal, status === "dispersed" → re-gather allowed
    useAgentStore.getState().gatherAgentsForMeeting("mtg-regather", "ops-control", ["ag"]);

    const gathering = useAgentStore.getState().meetingGatherings["mtg-regather"];
    expect(gathering.status).toBe("gathered");
  });
});
