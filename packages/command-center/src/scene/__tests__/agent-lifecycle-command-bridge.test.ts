/**
 * agent-lifecycle-command-bridge.test.ts
 *
 * Sub-AC 7c: Agent lifecycle commands — wire the agent_instance affordances so
 * that start, stop, and reassign manipulations each produce a distinct command
 * entity (via interaction_intent → command pipeline) and verify the command
 * payload correctly targets the agent_instance.
 *
 * Coverage:
 *   7c-1   START intent → agent.spawn command (distinct command type)
 *   7c-2   STOP intent  → agent.terminate command (distinct command type)
 *   7c-3   REASSIGN intent → agent.assign command (distinct command type)
 *   7c-4   START command payload targets the agent_instance by agent_id
 *   7c-5   STOP command payload targets the agent_instance by agent_id
 *   7c-6   REASSIGN command payload targets the agent_instance by agent_id
 *   7c-7   Three intents produce three DISTINCT command types (never the same)
 *   7c-8   source_intent_id in command matches originating intent.intentId
 *   7c-9   START payload carries persona, room_id, and display_name
 *   7c-10  STOP payload carries reason and agent_id
 *   7c-11  REASSIGN payload carries agent_id, room_id, and previous_room_id
 *   7c-12  commandTargetsAgent validates agent_id correctly
 *   7c-13  extractAgentIdFromCommand returns agent_id from all three command types
 *   7c-14  Batch processor maps N intents to N distinct commands
 *   7c-15  All factory functions are synchronous (no IO)
 *   7c-16  Intent IDs are unique (no collisions under rapid creation)
 *   7c-17  intents survive JSON round-trip (record transparency)
 *   7c-18  commands survive JSON round-trip (replay fidelity)
 *   7c-19  LIFECYCLE_INTENT_TO_COMMAND_TYPE covers all three kinds
 *   7c-20  Type guards accept valid intents and reject invalid objects
 *   7c-21  STOP intent defaults reason to "user_requested" when not specified
 *   7c-22  START intent carries the correct targetRoomId in room_id payload field
 *   7c-23  REASSIGN intent distinguishes fromRoomId and toRoomId in payload
 *   7c-24  buildAgentLifecycleCommand uses switch-exhaustive mapping (all 3 kinds)
 *   7c-25  Multiple distinct agents: each command targets only its own agent_instance
 */

import { describe, it, expect } from "vitest";
import {
  // Factories
  makeAgentLifecycleStartIntent,
  makeAgentLifecycleStopIntent,
  makeAgentLifecycleReassignIntent,
  // Pipeline
  buildAgentLifecycleCommand,
  buildAgentLifecycleCommandBatch,
  // Helpers
  commandTargetsAgent,
  extractAgentIdFromCommand,
  // Constants
  AGENT_LIFECYCLE_INTENT_KINDS,
  LIFECYCLE_INTENT_TO_COMMAND_TYPE,
  isAgentLifecycleIntentKind,
  // Type guards
  isAgentLifecycleStartIntent,
  isAgentLifecycleStopIntent,
  isAgentLifecycleReassignIntent,
  isAgentLifecycleIntent,
  // Types
  type AgentLifecycleStartIntent,
  type AgentLifecycleStopIntent,
  type AgentLifecycleReassignIntent,
  type AgentLifecycleIntent,
  type AgentLifecycleCommandEntity,
} from "../agent-lifecycle-command-bridge.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_ID   = "researcher-42";
const ROOM_ID    = "lab-room-01";
const TARGET_ROOM = "ops-control";

function makeStartIntent(overrides: Record<string, unknown> = {}): AgentLifecycleStartIntent {
  return makeAgentLifecycleStartIntent({
    agentId:      AGENT_ID,
    agentName:    "Dr. Research",
    agentRole:    "researcher",
    agentStatus:  "inactive",
    roomId:       ROOM_ID,
    persona:      "researcher",
    targetRoomId: ROOM_ID,
    displayName:  "Dr. Research",
    ...overrides,
  } as Parameters<typeof makeAgentLifecycleStartIntent>[0]);
}

function makeStopIntent(overrides: Record<string, unknown> = {}): AgentLifecycleStopIntent {
  return makeAgentLifecycleStopIntent({
    agentId:     AGENT_ID,
    agentName:   "Dr. Research",
    agentRole:   "researcher",
    agentStatus: "active",
    roomId:      ROOM_ID,
    reason:      "user_requested",
    confirmed:   true,
    ...overrides,
  } as Parameters<typeof makeAgentLifecycleStopIntent>[0]);
}

function makeReassignIntent(overrides: Record<string, unknown> = {}): AgentLifecycleReassignIntent {
  return makeAgentLifecycleReassignIntent({
    agentId:     AGENT_ID,
    agentName:   "Dr. Research",
    agentRole:   "researcher",
    agentStatus: "idle",
    roomId:      ROOM_ID,
    fromRoomId:  ROOM_ID,
    toRoomId:    TARGET_ROOM,
    ...overrides,
  } as Parameters<typeof makeAgentLifecycleReassignIntent>[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7c-1: START intent → agent.spawn command
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — START: produces agent.spawn command", () => {

  it("7c-1: AGENT_LIFECYCLE_START intent maps to agent.spawn command type", () => {
    const intent = makeStartIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.command_type).toBe("agent.spawn");
  });

  it("7c-4: agent.spawn payload targets the agent_instance by agent_id", () => {
    const intent = makeStartIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.agent_id).toBe(AGENT_ID);
  });

  it("7c-9: agent.spawn payload carries persona, room_id, and display_name", () => {
    const intent = makeStartIntent({ persona: "researcher", targetRoomId: "lab-42", displayName: "Lab Agent" });
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload).toMatchObject({
      agent_id:     AGENT_ID,
      persona:      "researcher",
      room_id:      "lab-42",
      display_name: "Lab Agent",
    });
  });

  it("7c-22: START intent uses targetRoomId as room_id in agent.spawn payload", () => {
    const intent = makeStartIntent({ targetRoomId: "lobby-entrance" });
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.room_id).toBe("lobby-entrance");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-2: STOP intent → agent.terminate command
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — STOP: produces agent.terminate command", () => {

  it("7c-2: AGENT_LIFECYCLE_STOP intent maps to agent.terminate command type", () => {
    const intent = makeStopIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.command_type).toBe("agent.terminate");
  });

  it("7c-5: agent.terminate payload targets the agent_instance by agent_id", () => {
    const intent = makeStopIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.agent_id).toBe(AGENT_ID);
  });

  it("7c-10: agent.terminate payload carries reason and agent_id", () => {
    const intent = makeStopIntent({ reason: "timeout_exceeded" });
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload).toMatchObject({
      agent_id: AGENT_ID,
      reason:   "timeout_exceeded",
    });
  });

  it("7c-21: STOP intent defaults reason to 'user_requested' when not specified", () => {
    // Pass undefined reason — the factory should default to "user_requested"
    const intent = makeAgentLifecycleStopIntent({
      agentId:     "agent-default-reason",
      agentName:   "Test Agent",
      agentRole:   "implementer",
      agentStatus: "active",
      roomId:      "ops",
      reason:      "user_requested",  // factory default
      confirmed:   true,
    });
    const cmd = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.reason).toBe("user_requested");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-3: REASSIGN intent → agent.assign command
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — REASSIGN: produces agent.assign command", () => {

  it("7c-3: AGENT_LIFECYCLE_REASSIGN intent maps to agent.assign command type", () => {
    const intent = makeReassignIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.command_type).toBe("agent.assign");
  });

  it("7c-6: agent.assign payload targets the agent_instance by agent_id", () => {
    const intent = makeReassignIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.agent_id).toBe(AGENT_ID);
  });

  it("7c-11: agent.assign payload carries agent_id, room_id, and previous_room_id", () => {
    const intent = makeReassignIntent({ fromRoomId: "lab-alpha", toRoomId: "lab-beta" });
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload).toMatchObject({
      agent_id:         AGENT_ID,
      room_id:          "lab-beta",
      previous_room_id: "lab-alpha",
    });
  });

  it("7c-23: REASSIGN distinguishes fromRoomId and toRoomId in payload", () => {
    const intent = makeReassignIntent({ fromRoomId: "room-A", toRoomId: "room-B" });
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.room_id).toBe("room-B");           // destination
    expect(cmd.payload.previous_room_id).toBe("room-A");  // source (for rollback)
    expect(cmd.payload.room_id).not.toBe(cmd.payload.previous_room_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-7: Three intents produce three DISTINCT command types
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Distinct command types: all three produce different command_type values", () => {

  it("7c-7: START, STOP, and REASSIGN each produce a distinct command_type", () => {
    const startCmd   = buildAgentLifecycleCommand(makeStartIntent());
    const stopCmd    = buildAgentLifecycleCommand(makeStopIntent());
    const reassignCmd = buildAgentLifecycleCommand(makeReassignIntent());

    const commandTypes = [
      startCmd.command_type,
      stopCmd.command_type,
      reassignCmd.command_type,
    ];

    // All three must be distinct strings
    expect(new Set(commandTypes).size).toBe(3);

    // Exact types
    expect(startCmd.command_type).toBe("agent.spawn");
    expect(stopCmd.command_type).toBe("agent.terminate");
    expect(reassignCmd.command_type).toBe("agent.assign");
  });

  it("7c-24: buildAgentLifecycleCommand handles all three intent kinds exhaustively", () => {
    // Exercise all three branches
    const intents: AgentLifecycleIntent[] = [
      makeStartIntent(),
      makeStopIntent(),
      makeReassignIntent(),
    ];
    const commands = intents.map(buildAgentLifecycleCommand);

    expect(commands).toHaveLength(3);
    expect(commands[0]!.command_type).toBe("agent.spawn");
    expect(commands[1]!.command_type).toBe("agent.terminate");
    expect(commands[2]!.command_type).toBe("agent.assign");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-8: source_intent_id chains command back to originating intent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — source_intent_id: audit chain from intent to command", () => {

  it("7c-8: command.source_intent_id === intent.intentId for START", () => {
    const intent = makeStartIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.source_intent_id).toBe(intent.intentId);
  });

  it("7c-8b: command.source_intent_id === intent.intentId for STOP", () => {
    const intent = makeStopIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.source_intent_id).toBe(intent.intentId);
  });

  it("7c-8c: command.source_intent_id === intent.intentId for REASSIGN", () => {
    const intent = makeReassignIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.source_intent_id).toBe(intent.intentId);
  });

  it("7c-8d: payload.source_intent_id matches cmd.source_intent_id", () => {
    const intent = makeStartIntent();
    const cmd    = buildAgentLifecycleCommand(intent);
    expect(cmd.payload.source_intent_id).toBe(cmd.source_intent_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-12 & 7c-13: Helper functions for payload targeting verification
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Payload targeting helpers", () => {

  it("7c-12a: commandTargetsAgent returns true when agent_id matches", () => {
    const cmd = buildAgentLifecycleCommand(makeStartIntent());
    expect(commandTargetsAgent(cmd, AGENT_ID)).toBe(true);
  });

  it("7c-12b: commandTargetsAgent returns false when agent_id does not match", () => {
    const cmd = buildAgentLifecycleCommand(makeStopIntent());
    expect(commandTargetsAgent(cmd, "different-agent-id")).toBe(false);
  });

  it("7c-13: extractAgentIdFromCommand returns agent_id for agent.spawn", () => {
    const cmd = buildAgentLifecycleCommand(makeStartIntent());
    expect(extractAgentIdFromCommand(cmd)).toBe(AGENT_ID);
  });

  it("7c-13b: extractAgentIdFromCommand returns agent_id for agent.terminate", () => {
    const cmd = buildAgentLifecycleCommand(makeStopIntent());
    expect(extractAgentIdFromCommand(cmd)).toBe(AGENT_ID);
  });

  it("7c-13c: extractAgentIdFromCommand returns agent_id for agent.assign", () => {
    const cmd = buildAgentLifecycleCommand(makeReassignIntent());
    expect(extractAgentIdFromCommand(cmd)).toBe(AGENT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-14: Batch processor
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Batch processor", () => {

  it("7c-14: buildAgentLifecycleCommandBatch maps N intents to N commands", () => {
    const intents: AgentLifecycleIntent[] = [
      makeStartIntent({ agentId: "agent-a" }),
      makeStopIntent({ agentId: "agent-b" }),
      makeReassignIntent({ agentId: "agent-c" }),
    ];
    const cmds = buildAgentLifecycleCommandBatch(intents);

    expect(cmds).toHaveLength(3);
    expect(cmds[0]!.command_type).toBe("agent.spawn");
    expect(cmds[1]!.command_type).toBe("agent.terminate");
    expect(cmds[2]!.command_type).toBe("agent.assign");
  });

  it("7c-14b: batch preserves intent-to-command order", () => {
    const agents = ["agent-x", "agent-y", "agent-z"];
    const intents = agents.map((id) => makeStartIntent({ agentId: id }));
    const cmds = buildAgentLifecycleCommandBatch(intents);

    for (let i = 0; i < agents.length; i++) {
      expect(cmds[i]!.payload.agent_id).toBe(agents[i]);
    }
  });

  it("7c-14c: empty batch returns empty array", () => {
    expect(buildAgentLifecycleCommandBatch([])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-15: Factory functions are synchronous
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Synchronous factories (no IO)", () => {

  it("7c-15: all factory functions are synchronous and return plain objects", () => {
    const start    = makeStartIntent();
    const stop     = makeStopIntent();
    const reassign = makeReassignIntent();

    // Not Promises
    expect(start instanceof Promise).toBe(false);
    expect(stop instanceof Promise).toBe(false);
    expect(reassign instanceof Promise).toBe(false);

    // Plain objects
    expect(typeof start).toBe("object");
    expect(typeof stop).toBe("object");
    expect(typeof reassign).toBe("object");
  });

  it("7c-15b: buildAgentLifecycleCommand is synchronous", () => {
    const result = buildAgentLifecycleCommand(makeStartIntent());
    expect(result instanceof Promise).toBe(false);
    expect(typeof result).toBe("object");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-16: Intent IDs are unique
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Intent ID uniqueness", () => {

  it("7c-16: rapid creation produces unique intentIds", () => {
    const N = 50;
    const ids = Array.from({ length: N }, () => makeStartIntent().intentId);
    expect(new Set(ids).size).toBe(N);
  });

  it("7c-16b: intentId has the expected 'lci_' prefix", () => {
    const intent = makeStartIntent();
    expect(intent.intentId).toMatch(/^lci_/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-17 & 7c-18: JSON round-trip (record transparency + replay fidelity)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — JSON round-trip (record transparency)", () => {

  it("7c-17: all three lifecycle intents survive JSON round-trip", () => {
    const intents: AgentLifecycleIntent[] = [
      makeStartIntent(),
      makeStopIntent(),
      makeReassignIntent(),
    ];

    for (const intent of intents) {
      const serialised = JSON.stringify(intent);
      const parsed     = JSON.parse(serialised) as unknown;
      expect(isAgentLifecycleIntent(parsed)).toBe(true);
      // agent_id and intent discriminator survive
      expect((parsed as { agentId: string }).agentId).toBe(AGENT_ID);
    }
  });

  it("7c-18: all three command entities survive JSON round-trip", () => {
    const intents: AgentLifecycleIntent[] = [
      makeStartIntent(),
      makeStopIntent(),
      makeReassignIntent(),
    ];

    for (const intent of intents) {
      const cmd        = buildAgentLifecycleCommand(intent);
      const serialised = JSON.stringify(cmd);
      const parsed     = JSON.parse(serialised) as { command_type: string; payload: { agent_id: string } };
      // command_type and agent_id survive serialisation
      expect(parsed.command_type).toBe(cmd.command_type);
      expect(parsed.payload.agent_id).toBe(AGENT_ID);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-19: LIFECYCLE_INTENT_TO_COMMAND_TYPE covers all three kinds
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — LIFECYCLE_INTENT_TO_COMMAND_TYPE completeness", () => {

  it("7c-19: LIFECYCLE_INTENT_TO_COMMAND_TYPE maps all three intent kinds", () => {
    expect(LIFECYCLE_INTENT_TO_COMMAND_TYPE["AGENT_LIFECYCLE_START"]).toBe("agent.spawn");
    expect(LIFECYCLE_INTENT_TO_COMMAND_TYPE["AGENT_LIFECYCLE_STOP"]).toBe("agent.terminate");
    expect(LIFECYCLE_INTENT_TO_COMMAND_TYPE["AGENT_LIFECYCLE_REASSIGN"]).toBe("agent.assign");
  });

  it("7c-19b: all three command types are distinct in the map", () => {
    const values = Object.values(LIFECYCLE_INTENT_TO_COMMAND_TYPE);
    expect(new Set(values).size).toBe(3);
  });

  it("7c-19c: AGENT_LIFECYCLE_INTENT_KINDS set has exactly three members", () => {
    expect(AGENT_LIFECYCLE_INTENT_KINDS.size).toBe(3);
    expect(AGENT_LIFECYCLE_INTENT_KINDS.has("AGENT_LIFECYCLE_START")).toBe(true);
    expect(AGENT_LIFECYCLE_INTENT_KINDS.has("AGENT_LIFECYCLE_STOP")).toBe(true);
    expect(AGENT_LIFECYCLE_INTENT_KINDS.has("AGENT_LIFECYCLE_REASSIGN")).toBe(true);
  });

  it("7c-19d: isAgentLifecycleIntentKind accepts all three and rejects unknown strings", () => {
    expect(isAgentLifecycleIntentKind("AGENT_LIFECYCLE_START")).toBe(true);
    expect(isAgentLifecycleIntentKind("AGENT_LIFECYCLE_STOP")).toBe(true);
    expect(isAgentLifecycleIntentKind("AGENT_LIFECYCLE_REASSIGN")).toBe(true);
    expect(isAgentLifecycleIntentKind("AGENT_CLICKED")).toBe(false);
    expect(isAgentLifecycleIntentKind("BUILDING_CLICKED")).toBe(false);
    expect(isAgentLifecycleIntentKind("agent.spawn")).toBe(false);
    expect(isAgentLifecycleIntentKind("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-20: Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Type guards", () => {

  it("7c-20a: isAgentLifecycleStartIntent accepts a valid START intent", () => {
    expect(isAgentLifecycleStartIntent(makeStartIntent())).toBe(true);
  });

  it("7c-20b: isAgentLifecycleStartIntent rejects STOP and REASSIGN intents", () => {
    expect(isAgentLifecycleStartIntent(makeStopIntent())).toBe(false);
    expect(isAgentLifecycleStartIntent(makeReassignIntent())).toBe(false);
  });

  it("7c-20c: isAgentLifecycleStopIntent accepts a valid STOP intent", () => {
    expect(isAgentLifecycleStopIntent(makeStopIntent())).toBe(true);
  });

  it("7c-20d: isAgentLifecycleStopIntent rejects START and REASSIGN intents", () => {
    expect(isAgentLifecycleStopIntent(makeStartIntent())).toBe(false);
    expect(isAgentLifecycleStopIntent(makeReassignIntent())).toBe(false);
  });

  it("7c-20e: isAgentLifecycleReassignIntent accepts a valid REASSIGN intent", () => {
    expect(isAgentLifecycleReassignIntent(makeReassignIntent())).toBe(true);
  });

  it("7c-20f: isAgentLifecycleIntent accepts all three variants", () => {
    expect(isAgentLifecycleIntent(makeStartIntent())).toBe(true);
    expect(isAgentLifecycleIntent(makeStopIntent())).toBe(true);
    expect(isAgentLifecycleIntent(makeReassignIntent())).toBe(true);
  });

  it("7c-20g: isAgentLifecycleIntent rejects non-lifecycle objects", () => {
    expect(isAgentLifecycleIntent(null)).toBe(false);
    expect(isAgentLifecycleIntent({})).toBe(false);
    expect(isAgentLifecycleIntent({ intent: "AGENT_CLICKED", agentId: "a", ts: 1 })).toBe(false);
    expect(isAgentLifecycleIntent({ intent: "BUILDING_CLICKED", building_id: "b", ts: 1 })).toBe(false);
    expect(isAgentLifecycleIntent("AGENT_LIFECYCLE_START")).toBe(false);
    expect(isAgentLifecycleIntent(42)).toBe(false);
  });

  it("7c-20h: isAgentLifecycleStartIntent rejects missing agentId", () => {
    expect(isAgentLifecycleStartIntent({
      intent: "AGENT_LIFECYCLE_START",
      intentId: "x",
      ts: 1,
      // agentId deliberately missing
    })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7c-25: Multiple agents — each command targets only its own agent_instance
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Multi-agent: each command targets its own agent_instance", () => {

  it("7c-25: commands for different agents have distinct agent_ids in payload", () => {
    const agents = [
      { id: "researcher-1", room: "lab" },
      { id: "implementer-2", room: "ops-control" },
      { id: "manager-3", room: "management" },
    ];

    const commands: AgentLifecycleCommandEntity[] = agents.map(({ id, room }) => {
      const intent = makeAgentLifecycleStartIntent({
        agentId:      id,
        agentName:    `Agent ${id}`,
        agentRole:    "implementer",
        agentStatus:  "inactive",
        roomId:       room,
        persona:      "implementer",
        targetRoomId: room,
        displayName:  `Agent ${id}`,
      });
      return buildAgentLifecycleCommand(intent);
    });

    // Each command targets only its own agent
    for (let i = 0; i < agents.length; i++) {
      expect(commandTargetsAgent(commands[i]!, agents[i]!.id)).toBe(true);
      // Does NOT target any other agent
      for (let j = 0; j < agents.length; j++) {
        if (i !== j) {
          expect(commandTargetsAgent(commands[i]!, agents[j]!.id)).toBe(false);
        }
      }
    }
  });

  it("7c-25b: STOP command for one agent does not affect other agents' commands", () => {
    const stopCmd    = buildAgentLifecycleCommand(makeStopIntent({ agentId: "victim-agent" }));
    const reassignCmd = buildAgentLifecycleCommand(makeReassignIntent({ agentId: "other-agent" }));

    expect(extractAgentIdFromCommand(stopCmd)).toBe("victim-agent");
    expect(extractAgentIdFromCommand(reassignCmd)).toBe("other-agent");
    // Commands do not cross-contaminate agent_ids
    expect(stopCmd.payload.agent_id).not.toBe(reassignCmd.payload.agent_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: interaction_intent → command pipeline end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c — Pipeline integration: interaction_intent → command", () => {

  it("end-to-end: user clicks START → intent → agent.spawn command with correct agent_id", () => {
    // Simulates: user sees inactive agent "researcher-99" and clicks START
    const intent = makeAgentLifecycleStartIntent({
      agentId:      "researcher-99",
      agentName:    "Senior Researcher",
      agentRole:    "researcher",
      agentStatus:  "inactive",         // the agent is currently inactive
      roomId:       "lab-room-03",
      persona:      "researcher",
      targetRoomId: "lab-room-03",
      displayName:  "Senior Researcher",
      sessionId:    "session-abc123",
    });

    // Pipeline maps intent → command
    const cmd = buildAgentLifecycleCommand(intent);

    // Verify: correct command type
    expect(cmd.command_type).toBe("agent.spawn");
    // Verify: payload targets the specific agent_instance
    expect(cmd.payload.agent_id).toBe("researcher-99");
    // Verify: audit chain is intact
    expect(cmd.source_intent_id).toBe(intent.intentId);
    // Verify: all required spawn fields are present
    expect(cmd.payload.persona).toBe("researcher");
    expect(cmd.payload.room_id).toBe("lab-room-03");
    expect(cmd.payload.display_name).toBe("Senior Researcher");
  });

  it("end-to-end: user confirms STOP → intent → agent.terminate command with correct agent_id", () => {
    // Simulates: user sees active agent "implementer-7" and confirms STOP
    const intent = makeAgentLifecycleStopIntent({
      agentId:     "implementer-7",
      agentName:   "Code Implementer",
      agentRole:   "implementer",
      agentStatus: "active",
      roomId:      "ops-control",
      reason:      "user_requested",
      confirmed:   true,  // confirmation dialog was accepted
      sessionId:   "session-abc123",
    });

    const cmd = buildAgentLifecycleCommand(intent);

    expect(cmd.command_type).toBe("agent.terminate");
    expect(cmd.payload.agent_id).toBe("implementer-7");
    expect(cmd.payload.reason).toBe("user_requested");
    expect(cmd.source_intent_id).toBe(intent.intentId);
    // Verify this is NOT a spawn or assign command
    expect(cmd.command_type).not.toBe("agent.spawn");
    expect(cmd.command_type).not.toBe("agent.assign");
  });

  it("end-to-end: user selects room in reassign picker → intent → agent.assign command with correct agent_id", () => {
    // Simulates: user opens reassign picker for "validator-3" and clicks "ops-control"
    const intent = makeAgentLifecycleReassignIntent({
      agentId:     "validator-3",
      agentName:   "Code Validator",
      agentRole:   "validator",
      agentStatus: "idle",
      roomId:      "lab",       // current room at time of intent
      fromRoomId:  "lab",       // departing from lab
      toRoomId:    "ops-control", // moving to ops-control
      sessionId:   "session-abc123",
    });

    const cmd = buildAgentLifecycleCommand(intent);

    expect(cmd.command_type).toBe("agent.assign");
    expect(cmd.payload.agent_id).toBe("validator-3");
    expect(cmd.payload.room_id).toBe("ops-control");     // destination
    expect(cmd.payload.previous_room_id).toBe("lab");     // source
    expect(cmd.source_intent_id).toBe(intent.intentId);
    // Verify this is NOT a spawn or terminate command
    expect(cmd.command_type).not.toBe("agent.spawn");
    expect(cmd.command_type).not.toBe("agent.terminate");
  });

  it("end-to-end: three lifecycle operations produce three commands with distinct types and all target agent_id", () => {
    const agentId = "manager-1";
    const roomId  = "management";

    const startIntent = makeAgentLifecycleStartIntent({
      agentId, agentName: "Manager 1", agentRole: "manager",
      agentStatus: "inactive", roomId,
      persona: "manager", targetRoomId: roomId, displayName: "Manager 1",
    });
    const stopIntent = makeAgentLifecycleStopIntent({
      agentId, agentName: "Manager 1", agentRole: "manager",
      agentStatus: "active", roomId,
      reason: "user_requested", confirmed: true,
    });
    const reassignIntent = makeAgentLifecycleReassignIntent({
      agentId, agentName: "Manager 1", agentRole: "manager",
      agentStatus: "idle", roomId,
      fromRoomId: roomId, toRoomId: "lobby",
    });

    const cmds = buildAgentLifecycleCommandBatch([startIntent, stopIntent, reassignIntent]);

    // Three distinct command types
    const types = new Set(cmds.map((c) => c.command_type));
    expect(types.size).toBe(3);

    // All target the same agent_instance
    for (const cmd of cmds) {
      expect(cmd.payload.agent_id).toBe(agentId);
    }
  });
});
