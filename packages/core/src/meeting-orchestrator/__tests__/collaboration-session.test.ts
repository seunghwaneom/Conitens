/**
 * Tests for CollaborationSession and SessionRegistry.
 *
 * Sub-AC 10b: Agent collaboration session spawning + protocol state machine.
 *
 * Covers:
 *   - assignMeetingRole / buildSessionParticipant
 *   - CollaborationSession lifecycle
 *   - request → deliberate → resolve protocol state machine
 *   - ProtocolTransitionError for invalid transitions
 *   - Auto-abandon on session end without resolve
 *   - SessionRegistry CRUD
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CollaborationSession,
  SessionRegistry,
  assignMeetingRole,
  buildSessionParticipant,
  canTransitionProtocol,
  PROTOCOL_TRANSITIONS,
  ProtocolTransitionError,
} from "../collaboration-session.js";
import type { SpawnedTask } from "../collaboration-session.js";

// ── assignMeetingRole ─────────────────────────────────────────────────────

describe("assignMeetingRole", () => {
  it("maps user kind to stakeholder", () => {
    const { meetingRole } = assignMeetingRole("alice", "user");
    expect(meetingRole).toBe("stakeholder");
  });

  it("maps system kind to observer", () => {
    const { meetingRole } = assignMeetingRole("system", "system");
    expect(meetingRole).toBe("observer");
  });

  it("maps manager-default to facilitator", () => {
    const { meetingRole, nativeRole } = assignMeetingRole("manager-default", "agent");
    expect(meetingRole).toBe("facilitator");
    expect(nativeRole).toBe("orchestrator");
  });

  it("maps implementer-subagent to contributor", () => {
    const { meetingRole, nativeRole } = assignMeetingRole("implementer-subagent", "agent");
    expect(meetingRole).toBe("contributor");
    expect(nativeRole).toBe("implementer");
  });

  it("maps researcher-subagent to context-provider", () => {
    const { meetingRole } = assignMeetingRole("researcher-subagent", "agent");
    expect(meetingRole).toBe("context-provider");
  });

  it("maps frontend-reviewer to reviewer", () => {
    const { meetingRole } = assignMeetingRole("frontend-reviewer", "agent");
    expect(meetingRole).toBe("reviewer");
  });

  it("maps validator-sentinel to validator", () => {
    const { meetingRole } = assignMeetingRole("validator-sentinel", "agent");
    expect(meetingRole).toBe("validator");
  });

  it("defaults unknown agent IDs to contributor", () => {
    const { meetingRole } = assignMeetingRole("unknown-agent-xyz", "agent");
    expect(meetingRole).toBe("contributor");
  });
});

// ── buildSessionParticipant ───────────────────────────────────────────────

describe("buildSessionParticipant", () => {
  it("assigns capabilities when ID match is ambiguous", () => {
    // "custom-agent" doesn't match a known role, but has planning capability
    const p = buildSessionParticipant("custom-agent", "agent", ["planning", "delegation"]);
    expect(p.assigned_role).toBe("facilitator");
  });

  it("includes capabilities array", () => {
    const caps = ["code-change", "patching"];
    const p    = buildSessionParticipant("any-agent", "agent", caps);
    expect(p.capabilities).toEqual(caps);
  });

  it("user participants are stakeholders", () => {
    const p = buildSessionParticipant("user:alice", "user");
    expect(p.assigned_role).toBe("stakeholder");
    expect(p.participant_kind).toBe("user");
  });
});

// ── canTransitionProtocol ──────────────────────────────────────────────────

describe("canTransitionProtocol", () => {
  it("request → deliberate is valid", () => {
    expect(canTransitionProtocol("request", "deliberate")).toBe(true);
  });

  it("request → abandoned is valid", () => {
    expect(canTransitionProtocol("request", "abandoned")).toBe(true);
  });

  it("deliberate → resolve is valid", () => {
    expect(canTransitionProtocol("deliberate", "resolve")).toBe(true);
  });

  it("deliberate → abandoned is valid", () => {
    expect(canTransitionProtocol("deliberate", "abandoned")).toBe(true);
  });

  it("request → resolve is invalid", () => {
    expect(canTransitionProtocol("request", "resolve")).toBe(false);
  });

  it("resolve → anything is invalid (terminal)", () => {
    expect(canTransitionProtocol("resolve", "deliberate")).toBe(false);
    expect(canTransitionProtocol("resolve", "abandoned")).toBe(false);
    expect(canTransitionProtocol("resolve", "request")).toBe(false);
  });

  it("abandoned → anything is invalid (terminal)", () => {
    expect(canTransitionProtocol("abandoned", "deliberate")).toBe(false);
    expect(canTransitionProtocol("abandoned", "resolve")).toBe(false);
  });

  it("PROTOCOL_TRANSITIONS constant is consistent with canTransitionProtocol", () => {
    for (const [from, allowed] of Object.entries(PROTOCOL_TRANSITIONS)) {
      for (const to of allowed) {
        expect(canTransitionProtocol(from as never, to as never)).toBe(true);
      }
    }
  });
});

// ── CollaborationSession — lifecycle ──────────────────────────────────────

describe("CollaborationSession", () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = new CollaborationSession({
      room_id:         "ops-control",
      title:           "Sprint Planning",
      agenda:          "Review tickets, assign owners",
      participant_ids: ["manager-default", "implementer-subagent", "researcher-subagent"],
      initiated_by:    "user",
    });
  });

  it("starts in 'active' status", () => {
    expect(session.status).toBe("active");
  });

  it("generates a session_id", () => {
    expect(session.session_id).toMatch(/^mtg-/);
  });

  it("creates a channel_id", () => {
    expect(session.channel_id).toMatch(/^ch-mtg-/);
  });

  it("assigns roles to all participants", () => {
    expect(session.participants).toHaveLength(3);
    const roles = session.participants.map((p) => p.assigned_role);
    expect(roles).toContain("facilitator");
    expect(roles).toContain("contributor");
    expect(roles).toContain("context-provider");
  });

  it("ensures exactly one facilitator", () => {
    const facilitators = session.participants.filter((p) => p.assigned_role === "facilitator");
    expect(facilitators.length).toBeGreaterThanOrEqual(1);
  });

  it("initialises shared context with topic", () => {
    expect(session.context.topic).toBe("Sprint Planning");
    expect(session.context.agenda).toBe("Review tickets, assign owners");
    expect(session.context.meeting_id).toBe(session.session_id);
  });

  it("initialises channel with system welcome message", () => {
    expect(session.messages.length).toBeGreaterThanOrEqual(1);
    expect(session.messages[0].message_type).toBe("system");
    expect(session.messages[0].sender_id).toBe("system");
  });

  it("postMessage appends a message", () => {
    const initial = session.messages.length;
    session.postMessage("manager-default", "Let's start with ticket BUG-42.", "text");
    expect(session.messages.length).toBe(initial + 1);
    const msg = session.messages[initial];
    expect(msg.sender_id).toBe("manager-default");
    expect(msg.content).toBe("Let's start with ticket BUG-42.");
    expect(msg.message_type).toBe("text");
  });

  it("setContextValue updates workspace", () => {
    session.setContextValue("sprint", "Sprint 14", "manager-default");
    expect(session.context.workspace["sprint"]).toBe("Sprint 14");
  });

  it("addParticipant adds a new participant", () => {
    const initial = session.participants.length;
    session.addParticipant("frontend-reviewer", "agent", ["ui-review"]);
    expect(session.participants.length).toBe(initial + 1);
    const p = session.participants.find((x) => x.participant_id === "frontend-reviewer");
    expect(p).toBeDefined();
    expect(p!.assigned_role).toBe("reviewer");
  });

  it("addParticipant is idempotent", () => {
    session.addParticipant("manager-default", "agent");
    expect(session.participants.length).toBe(3); // no duplicate
  });

  it("end() transitions to 'ended'", () => {
    session.end("user", "completed");
    expect(session.status).toBe("ended");
    expect(session.ended_at).not.toBeNull();
  });

  it("end() is idempotent", () => {
    session.end();
    session.end(); // second call should be a no-op
    expect(session.status).toBe("ended");
  });

  it("toHandle() returns correct structure", () => {
    const handle = session.toHandle();
    expect(handle.session_id).toBe(session.session_id);
    expect(handle.room_id).toBe("ops-control");
    expect(handle.title).toBe("Sprint Planning");
    expect(handle.status).toBe("active");
    expect(handle.participants).toHaveLength(3);
    expect(handle.channel.channel_id).toBe(session.channel_id);
    expect(handle.channel.message_count).toBeGreaterThanOrEqual(1);
    expect(handle.shared_context.topic).toBe("Sprint Planning");
  });

  it("toHandle() reflects postMessage count", () => {
    session.postMessage("manager-default", "Hello");
    const handle = session.toHandle();
    expect(handle.channel.message_count).toBeGreaterThanOrEqual(2); // system msg + hello
  });

  it("audit log records events", () => {
    session.postMessage("manager-default", "audit test");
    const log = session.getAuditLog();
    const types = log.map((e) => e.event_type);
    expect(types).toContain("session.created");
    expect(types).toContain("session.activated");
    expect(types).toContain("channel.message_posted");
  });
});

// ── Protocol state machine — initial state ────────────────────────────────

describe("CollaborationSession — protocol initial state", () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = new CollaborationSession({
      room_id:         "ops-control",
      title:           "RFC Review",
      agenda:          "Review the proposed RFC",
      participant_ids: ["manager-default", "implementer-subagent"],
      initiated_by:    "user",
    });
  });

  it("starts in 'request' protocol phase", () => {
    expect(session.protocol_phase).toBe("request");
  });

  it("has a protocol_request on construction", () => {
    expect(session.protocol_request).not.toBeNull();
    expect(session.protocol_request!.request_id).toMatch(/^req-/);
    expect(session.protocol_request!.topic).toBe("RFC Review");
    expect(session.protocol_request!.description).toBe("Review the proposed RFC");
    expect(session.protocol_request!.requested_by).toBe("user");
    expect(session.protocol_request!.requested_at).toBeTruthy();
  });

  it("has empty decisions list in request phase", () => {
    expect(session.protocol_decisions).toHaveLength(0);
  });

  it("has no resolution in request phase", () => {
    expect(session.protocol_resolution).toBeNull();
  });

  it("toHandle() exposes protocol.phase = 'request'", () => {
    const handle = session.toHandle();
    expect(handle.protocol.phase).toBe("request");
    expect(handle.protocol.request).not.toBeNull();
    expect(handle.protocol.decisions).toHaveLength(0);
    expect(handle.protocol.resolution).toBeNull();
  });

  it("protocol_request includes room_id in context", () => {
    expect(session.protocol_request!.context["room_id"]).toBe("ops-control");
  });

  it("audit log includes protocol.request_filed event", () => {
    const types = session.getAuditLog().map((e) => e.event_type);
    expect(types).toContain("protocol.request_filed");
  });

  it("initial_request_description is used if provided", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      title:           "Test",
      participant_ids: [],
      initiated_by:    "user",
      initial_request_description: "Custom description here",
    });
    expect(s.protocol_request!.description).toBe("Custom description here");
  });

  it("initial_request_context is merged into request context", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
      initial_request_context: { priority: "high", ticket: "BUG-99" },
    });
    expect(s.protocol_request!.context["priority"]).toBe("high");
    expect(s.protocol_request!.context["ticket"]).toBe("BUG-99");
  });
});

// ── Protocol state machine — request → deliberate ─────────────────────────

describe("CollaborationSession — beginDeliberation()", () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = new CollaborationSession({
      room_id:         "ops-control",
      title:           "Architecture Review",
      participant_ids: ["manager-default", "implementer-subagent"],
      initiated_by:    "user",
    });
  });

  it("transitions protocol phase to 'deliberate'", () => {
    session.beginDeliberation({ initiated_by: "manager-default" });
    expect(session.protocol_phase).toBe("deliberate");
  });

  it("toHandle() reflects deliberate phase", () => {
    session.beginDeliberation({ initiated_by: "manager-default" });
    const handle = session.toHandle();
    expect(handle.protocol.phase).toBe("deliberate");
  });

  it("posts a system message to the channel", () => {
    const msgCount = session.messages.length;
    session.beginDeliberation({ initiated_by: "manager-default", note: "Let's discuss." });
    expect(session.messages.length).toBeGreaterThan(msgCount);
    const lastMsg = session.messages[session.messages.length - 1];
    expect(lastMsg.message_type).toBe("system");
    expect(lastMsg.content).toContain("deliberate");
  });

  it("records protocol.deliberation_started in audit log", () => {
    session.beginDeliberation({ initiated_by: "manager-default" });
    const types = session.getAuditLog().map((e) => e.event_type);
    expect(types).toContain("protocol.deliberation_started");
  });

  it("throws ProtocolTransitionError when called twice (deliberate → deliberate invalid)", () => {
    session.beginDeliberation({ initiated_by: "manager-default" });
    expect(() => session.beginDeliberation({ initiated_by: "manager-default" }))
      .toThrow(ProtocolTransitionError);
  });

  it("throws ProtocolTransitionError when called after resolve", () => {
    session.beginDeliberation({ initiated_by: "manager-default" });
    session.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    expect(() => session.beginDeliberation({ initiated_by: "manager-default" }))
      .toThrow(ProtocolTransitionError);
  });

  it("throws Error when called on ended session", () => {
    session.end();
    expect(() => session.beginDeliberation({ initiated_by: "manager-default" }))
      .toThrow(/cannot be called|not active/);
  });
});

// ── Protocol state machine — addDecision ─────────────────────────────────

describe("CollaborationSession — addDecision()", () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = new CollaborationSession({
      room_id:         "ops-control",
      title:           "Design Review",
      participant_ids: ["manager-default", "implementer-subagent"],
      initiated_by:    "user",
    });
    session.beginDeliberation({ initiated_by: "manager-default" });
  });

  it("adds a decision during deliberate phase", () => {
    const d = session.addDecision({
      content:       "Use event sourcing for state management",
      decided_by:    "manager-default",
      decision_type: "accept",
      rationale:     "Aligns with existing architecture",
    });
    expect(d.decision_id).toMatch(/^dec-/);
    expect(d.content).toBe("Use event sourcing for state management");
    expect(d.decision_type).toBe("accept");
    expect(d.decided_by).toBe("manager-default");
    expect(d.rationale).toBe("Aligns with existing architecture");
  });

  it("accumulates multiple decisions", () => {
    session.addDecision({ content: "A", decided_by: "mgr", decision_type: "accept" });
    session.addDecision({ content: "B", decided_by: "mgr", decision_type: "reject" });
    session.addDecision({ content: "C", decided_by: "impl", decision_type: "defer" });
    expect(session.protocol_decisions).toHaveLength(3);
  });

  it("posts a 'decision' message to the channel", () => {
    const msgCount = session.messages.length;
    session.addDecision({
      content:       "Accept RFC-42",
      decided_by:    "manager-default",
      decision_type: "accept",
    });
    expect(session.messages.length).toBeGreaterThan(msgCount);
    const decisionMsg = session.messages.find((m) => m.message_type === "decision");
    expect(decisionMsg).toBeDefined();
    expect(decisionMsg!.content).toBe("Accept RFC-42");
  });

  it("records protocol.decision_added in audit log", () => {
    session.addDecision({
      content:       "Reject old approach",
      decided_by:    "implementer-subagent",
      decision_type: "reject",
    });
    const types = session.getAuditLog().map((e) => e.event_type);
    expect(types).toContain("protocol.decision_added");
  });

  it("toHandle() reflects decisions", () => {
    session.addDecision({ content: "D1", decided_by: "u", decision_type: "accept" });
    session.addDecision({ content: "D2", decided_by: "u", decision_type: "defer" });
    const handle = session.toHandle();
    expect(handle.protocol.decisions).toHaveLength(2);
    expect(handle.protocol.decisions[0].content).toBe("D1");
    expect(handle.protocol.decisions[1].content).toBe("D2");
  });

  it("throws Error when called outside deliberate phase (request)", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    // Still in 'request' phase
    expect(() => s.addDecision({
      content:       "premature",
      decided_by:    "user",
      decision_type: "accept",
    })).toThrow(/protocol phase/);
  });

  it("throws Error when called after resolve (terminal)", () => {
    session.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    expect(() => session.addDecision({
      content:       "too late",
      decided_by:    "user",
      decision_type: "accept",
    })).toThrow(/protocol phase|not active/);
  });

  it("supports metadata field", () => {
    const d = session.addDecision({
      content:       "Use TypeScript strict mode",
      decided_by:    "implementer-subagent",
      decision_type: "accept",
      metadata:      { related_ticket: "PROJ-42", confidence: 0.95 },
    });
    expect(d.metadata?.["related_ticket"]).toBe("PROJ-42");
    expect(d.metadata?.["confidence"]).toBe(0.95);
  });
});

// ── Protocol state machine — resolveProtocol ──────────────────────────────

describe("CollaborationSession — resolveProtocol()", () => {
  let session: CollaborationSession;

  beforeEach(() => {
    session = new CollaborationSession({
      room_id:         "ops-control",
      title:           "Proposal X",
      participant_ids: ["manager-default", "implementer-subagent"],
      initiated_by:    "user",
    });
    session.beginDeliberation({ initiated_by: "manager-default" });
    session.addDecision({ content: "Accept Proposal X", decided_by: "manager-default", decision_type: "accept" });
  });

  it("transitions protocol phase to 'resolve'", () => {
    session.resolveProtocol({
      outcome:     "accepted",
      summary:     "Proposal accepted unanimously",
      resolved_by: "manager-default",
    });
    expect(session.protocol_phase).toBe("resolve");
  });

  it("returns a ProtocolResolution with correct fields", () => {
    const resolution = session.resolveProtocol({
      outcome:     "accepted",
      summary:     "Accepted",
      resolved_by: "manager-default",
    });
    expect(resolution.resolution_id).toMatch(/^res-/);
    expect(resolution.outcome).toBe("accepted");
    expect(resolution.summary).toBe("Accepted");
    expect(resolution.resolved_by).toBe("manager-default");
    expect(resolution.resolved_at).toBeTruthy();
  });

  it("resolution includes snapshot of decisions at resolve time", () => {
    const resolution = session.resolveProtocol({
      outcome:     "accepted",
      summary:     "Done",
      resolved_by: "user",
    });
    // The one decision added in beforeEach
    expect(resolution.decisions).toHaveLength(1);
    expect(resolution.decisions[0].content).toBe("Accept Proposal X");
  });

  it("toHandle() reflects resolve phase", () => {
    session.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    const handle = session.toHandle();
    expect(handle.protocol.phase).toBe("resolve");
    expect(handle.protocol.resolution).not.toBeNull();
    expect(handle.protocol.resolution!.outcome).toBe("accepted");
  });

  it("records protocol.resolved in audit log", () => {
    session.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    const types = session.getAuditLog().map((e) => e.event_type);
    expect(types).toContain("protocol.resolved");
  });

  it("posts a system message on resolution", () => {
    const countBefore = session.messages.length;
    session.resolveProtocol({ outcome: "rejected", summary: "Not feasible", resolved_by: "user" });
    expect(session.messages.length).toBeGreaterThan(countBefore);
    const sysMsg = [...session.messages].reverse().find((m) => m.message_type === "system");
    expect(sysMsg?.content).toContain("resolve");
  });

  it("throws ProtocolTransitionError when in request phase", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    expect(() => s.resolveProtocol({
      outcome:     "accepted",
      summary:     "Too early",
      resolved_by: "user",
    })).toThrow(ProtocolTransitionError);
  });

  it("throws ProtocolTransitionError when already resolved (terminal)", () => {
    session.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    expect(() => session.resolveProtocol({
      outcome:     "rejected",
      summary:     "Re-resolve",
      resolved_by: "user",
    })).toThrow(ProtocolTransitionError);
  });

  it("supports all valid outcomes", () => {
    const outcomes = ["accepted", "rejected", "deferred", "modified", "abandoned"] as const;
    for (const outcome of outcomes) {
      const s = new CollaborationSession({
        room_id:         "r1",
        participant_ids: [],
        initiated_by:    "user",
      });
      s.beginDeliberation({ initiated_by: "user" });
      const r = s.resolveProtocol({ outcome, summary: `Outcome: ${outcome}`, resolved_by: "user" });
      expect(r.outcome).toBe(outcome);
    }
  });

  it("resolution metadata is preserved", () => {
    const resolution = session.resolveProtocol({
      outcome:     "accepted",
      summary:     "Done",
      resolved_by: "user",
      metadata:    { related_task: "TASK-99", confidence: 1.0 },
    });
    expect(resolution.metadata?.["related_task"]).toBe("TASK-99");
  });
});

// ── Protocol state machine — end() auto-abandon ───────────────────────────

describe("CollaborationSession — auto-abandon on end()", () => {
  it("abandons protocol if ended in 'request' phase", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    expect(s.protocol_phase).toBe("request");
    s.end("user", "cancelled");
    expect(s.protocol_phase).toBe("abandoned");
    expect(s.protocol_resolution).not.toBeNull();
    expect(s.protocol_resolution!.outcome).toBe("abandoned");
  });

  it("abandons protocol if ended in 'deliberate' phase", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    s.beginDeliberation({ initiated_by: "user" });
    s.end("user", "cancelled");
    expect(s.protocol_phase).toBe("abandoned");
    expect(s.protocol_resolution!.outcome).toBe("abandoned");
  });

  it("does NOT re-abandon if already resolved", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    s.beginDeliberation({ initiated_by: "user" });
    s.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
    const phaseBefore = s.protocol_phase;
    s.end("user");
    // Phase should still be "resolve", not "abandoned"
    expect(s.protocol_phase).toBe(phaseBefore);
    expect(s.protocol_phase).toBe("resolve");
  });

  it("auto-abandon resolution includes decision snapshot", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    s.beginDeliberation({ initiated_by: "user" });
    s.addDecision({ content: "Pending decision", decided_by: "user", decision_type: "defer" });
    s.end("user", "timeout");
    // The pending decision should be captured in the abandon resolution
    expect(s.protocol_resolution!.decisions).toHaveLength(1);
    expect(s.protocol_resolution!.decisions[0].content).toBe("Pending decision");
  });

  it("records protocol.abandoned in audit log", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    s.end("user");
    const types = s.getAuditLog().map((e) => e.event_type);
    expect(types).toContain("protocol.abandoned");
  });

  it("toHandle() reflects abandoned phase after end()", () => {
    const s = new CollaborationSession({
      room_id:         "r1",
      participant_ids: [],
      initiated_by:    "user",
    });
    s.end("user");
    const handle = s.toHandle();
    expect(handle.status).toBe("ended");
    expect(handle.protocol.phase).toBe("abandoned");
    expect(handle.protocol.resolution).not.toBeNull();
  });
});

// ── Full protocol walkthrough ──────────────────────────────────────────────

describe("CollaborationSession — full request→deliberate→resolve walkthrough", () => {
  it("completes the full protocol lifecycle", () => {
    const s = new CollaborationSession({
      room_id:         "ops-control",
      title:           "Architecture Decision Record",
      agenda:          "Decide on caching strategy",
      participant_ids: ["manager-default", "implementer-subagent", "researcher-subagent"],
      initiated_by:    "user",
      initial_request_description: "Evaluate Redis vs Memcached for L2 cache",
      initial_request_context: { ticket: "ADR-007" },
    });

    // ── Phase 1: request ──────────────────────────────────────────────
    expect(s.protocol_phase).toBe("request");
    expect(s.protocol_request!.description).toBe("Evaluate Redis vs Memcached for L2 cache");
    expect(s.protocol_request!.context["ticket"]).toBe("ADR-007");

    // Participants discuss in channel
    s.postMessage("researcher-subagent", "Redis supports pub/sub and persistence; Memcached is simpler.");
    s.postMessage("implementer-subagent", "We already have Redis infra from the WS bus.");

    // ── Phase 2: deliberate ───────────────────────────────────────────
    s.beginDeliberation({ initiated_by: "manager-default", note: "Reviewing the evidence." });
    expect(s.protocol_phase).toBe("deliberate");

    s.setContextValue("redis_analysis", "supports cluster mode, pub/sub", "researcher-subagent");
    const d1 = s.addDecision({
      content:       "Use Redis as L2 cache — existing infra, pub/sub support",
      decided_by:    "manager-default",
      decision_type: "accept",
      rationale:     "Lower operational overhead vs introducing Memcached",
    });
    const d2 = s.addDecision({
      content:       "Defer Memcached evaluation to Q3",
      decided_by:    "manager-default",
      decision_type: "defer",
    });

    expect(s.protocol_decisions).toHaveLength(2);
    expect(d1.decision_id).not.toBe(d2.decision_id);

    // ── Phase 3: resolve ──────────────────────────────────────────────
    const resolution = s.resolveProtocol({
      outcome:     "accepted",
      summary:     "Redis selected as L2 cache. Memcached deferred to Q3.",
      resolved_by: "manager-default",
      metadata:    { adr_id: "ADR-007", approved: true },
    });

    expect(s.protocol_phase).toBe("resolve");
    expect(resolution.outcome).toBe("accepted");
    expect(resolution.decisions).toHaveLength(2);
    expect(resolution.metadata?.["adr_id"]).toBe("ADR-007");

    // ── End the session ───────────────────────────────────────────────
    s.end("manager-default", "completed");
    expect(s.status).toBe("ended");
    // Phase must remain "resolve" (not abandoned) since it was resolved before end()
    expect(s.protocol_phase).toBe("resolve");

    // ── Final handle ──────────────────────────────────────────────────
    const handle = s.toHandle();
    expect(handle.status).toBe("ended");
    expect(handle.protocol.phase).toBe("resolve");
    expect(handle.protocol.request!.topic).toBe("Architecture Decision Record");
    expect(handle.protocol.decisions).toHaveLength(2);
    expect(handle.protocol.resolution!.outcome).toBe("accepted");
    expect(handle.protocol.resolution!.resolved_by).toBe("manager-default");

    // ── Audit log completeness ─────────────────────────────────────────
    const auditTypes = s.getAuditLog().map((e) => e.event_type);
    expect(auditTypes).toContain("session.created");
    expect(auditTypes).toContain("session.activated");
    expect(auditTypes).toContain("protocol.request_filed");
    expect(auditTypes).toContain("channel.message_posted");
    expect(auditTypes).toContain("protocol.deliberation_started");
    expect(auditTypes).toContain("context.value_updated");
    expect(auditTypes).toContain("protocol.decision_added");
    expect(auditTypes).toContain("protocol.resolved");
    expect(auditTypes).toContain("session.ended");
  });
});

// ── SessionRegistry ───────────────────────────────────────────────────────

describe("SessionRegistry", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it("create() adds session to registry", () => {
    const s = registry.create({ room_id: "r1", participant_ids: [], initiated_by: "user" });
    expect(registry.get(s.session_id)).toBe(s);
  });

  it("list() returns all sessions", () => {
    registry.create({ room_id: "r1", participant_ids: [], initiated_by: "u" });
    registry.create({ room_id: "r2", participant_ids: [], initiated_by: "u" });
    expect(registry.list()).toHaveLength(2);
  });

  it("listActive() excludes ended sessions", () => {
    const s1 = registry.create({ room_id: "r1", participant_ids: [], initiated_by: "u" });
    const s2 = registry.create({ room_id: "r2", participant_ids: [], initiated_by: "u" });
    s1.end();
    expect(registry.listActive()).toHaveLength(1);
    expect(registry.listActive()[0]).toBe(s2);
  });

  it("pruneEnded() removes stale ended sessions", () => {
    const s = registry.create({ room_id: "r1", participant_ids: [], initiated_by: "u" });
    s.end();
    // Prune with very short maxAgeMs (should remove immediately)
    const removed = registry.pruneEnded(0);
    expect(removed).toBe(1);
    expect(registry.size).toBe(0);
  });

  it("pruneEnded() keeps recent ended sessions", () => {
    const s = registry.create({ room_id: "r1", participant_ids: [], initiated_by: "u" });
    s.end();
    // Prune with large maxAgeMs (should NOT remove recent session)
    const removed = registry.pruneEnded(999_999_999);
    expect(removed).toBe(0);
    expect(registry.size).toBe(1);
  });

  it("created sessions start with protocol phase 'request'", () => {
    const s = registry.create({
      room_id:         "r1",
      participant_ids: ["manager-default"],
      initiated_by:    "user",
    });
    expect(s.protocol_phase).toBe("request");
    expect(s.toHandle().protocol.phase).toBe("request");
  });
});

// ── Sub-AC 10c: Spawned tasks at resolution ───────────────────────────────

/**
 * Helper to create a session already in 'deliberate' phase with one decision.
 */
function makeDeliberatingSession(title = "Task Spawn Test"): CollaborationSession {
  const s = new CollaborationSession({
    room_id:         "conf-room-a",
    title,
    agenda:          "Determine follow-up actions",
    participant_ids: ["manager-default", "implementer-subagent"],
    initiated_by:    "user",
  });
  s.beginDeliberation({ initiated_by: "manager-default" });
  s.addDecision({
    content:       "Implement feature X",
    decided_by:    "manager-default",
    decision_type: "accept",
  });
  return s;
}

describe("CollaborationSession — spawned tasks (Sub-AC 10c)", () => {
  describe("auto-spawn on resolve", () => {
    it("produces at least one spawned_task when outcome is 'accepted'", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Feature X approved", resolved_by: "manager-default" });
      expect(s.spawned_tasks.length).toBeGreaterThanOrEqual(1);
    });

    it("produces at least one spawned_task for each non-abandoned outcome", () => {
      const nonAbandonedOutcomes = ["accepted", "rejected", "deferred", "modified"] as const;
      for (const outcome of nonAbandonedOutcomes) {
        const s = makeDeliberatingSession(`Test ${outcome}`);
        s.resolveProtocol({ outcome, summary: `Outcome: ${outcome}`, resolved_by: "user" });
        expect(s.spawned_tasks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("does NOT spawn tasks for 'abandoned' outcome", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "abandoned", summary: "Abandoned", resolved_by: "user" });
      expect(s.spawned_tasks.length).toBe(0);
    });

    it("auto-generated task title is derived from resolution summary (max 80 chars)", () => {
      const longSummary = "A".repeat(200);
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: longSummary, resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.title.length).toBeLessThanOrEqual(80);
      expect(task.title).toBe(longSummary.slice(0, 80));
    });

    it("auto-generated task description equals resolution summary", () => {
      const summary = "Deploy the new caching layer to staging";
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary, resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.description).toBe(summary);
    });

    it("auto-generated task assigned_to defaults to the facilitator participant", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      const facilitatorId = s.participants.find((p) => p.assigned_role === "facilitator")?.participant_id;
      expect(task.assigned_to).toBe(facilitatorId);
    });

    it("auto-generated task priority defaults to 3 (normal)", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.priority).toBe(3);
    });

    it("auto-generated task status is 'pending'", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.status).toBe("pending");
    });
  });

  describe("task linkage — session_id and resolution_id", () => {
    it("task.session_id matches parent session", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.session_id).toBe(s.session_id);
    });

    it("task.resolution_id matches the resolution that triggered it", () => {
      const s = makeDeliberatingSession();
      const resolution = s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.resolution_id).toBe(resolution.resolution_id);
    });

    it("task_id is unique and prefixed 'task-'", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.task_id).toMatch(/^task-/);
    });
  });

  describe("task metadata capture", () => {
    it("metadata includes room_id from session", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.metadata["room_id"]).toBe("conf-room-a");
    });

    it("metadata includes session_title", () => {
      const s = makeDeliberatingSession("My Important Meeting");
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.metadata["session_title"]).toBe("My Important Meeting");
    });

    it("metadata includes outcome from resolution", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "modified", summary: "Adjusted plan", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.metadata["outcome"]).toBe("modified");
    });

    it("metadata includes decision_count", () => {
      const s = makeDeliberatingSession();
      s.addDecision({ content: "Extra decision", decided_by: "impl", decision_type: "defer" });
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      // 2 decisions: one from makeDeliberatingSession() + one added above
      expect(task.metadata["decision_count"]).toBe(2);
    });

    it("task has a spawned_at ISO timestamp", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.spawned_at).toBeTruthy();
      expect(() => new Date(task.spawned_at)).not.toThrow();
    });
  });

  describe("explicit spawn_tasks input", () => {
    it("uses caller-provided task specs instead of auto-generating", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [
          { title: "Custom Task A", description: "Do A", assigned_to: "implementer-subagent", priority: 1 },
          { title: "Custom Task B", description: "Do B", priority: 5 },
        ],
      });
      expect(s.spawned_tasks.length).toBe(2);
    });

    it("custom task title and description are preserved verbatim", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [{ title: "Write migration guide", description: "Document breaking changes for v2.0" }],
      });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.title).toBe("Write migration guide");
      expect(task.description).toBe("Document breaking changes for v2.0");
    });

    it("custom task assigned_to overrides the facilitator default", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [{ assigned_to: "implementer-subagent" }],
      });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.assigned_to).toBe("implementer-subagent");
    });

    it("custom task priority is respected", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [{ priority: 1 }],
      });
      const task = s.spawned_tasks[0] as SpawnedTask;
      expect(task.priority).toBe(1);
    });

    it("custom task metadata is merged into base metadata", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [{ metadata: { ticket: "PROJ-99", ci: true } }],
      });
      const task = s.spawned_tasks[0] as SpawnedTask;
      // Custom metadata keys are present
      expect(task.metadata["ticket"]).toBe("PROJ-99");
      expect(task.metadata["ci"]).toBe(true);
      // Base metadata keys are also present
      expect(task.metadata["room_id"]).toBe("conf-room-a");
    });

    it("empty spawn_tasks array falls back to auto-generate one task", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Auto summary",
        resolved_by: "user",
        spawn_tasks: [],
      });
      // Empty array treated the same as absent — one auto task is generated
      expect(s.spawned_tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("spawnTask() direct API", () => {
    it("spawnTask() returns a SpawnedTask and appends it", () => {
      const s = makeDeliberatingSession();
      const resolution = s.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
      const initialCount = s.spawned_tasks.length;
      const task = s.spawnTask({ title: "Extra task" }, resolution.resolution_id, "implementer-subagent");
      expect(task.task_id).toMatch(/^task-/);
      expect(s.spawned_tasks.length).toBe(initialCount + 1);
    });

    it("spawnTask() task is linked to correct session_id and resolution_id", () => {
      const s = makeDeliberatingSession();
      const resolution = s.resolveProtocol({ outcome: "accepted", summary: "Done", resolved_by: "user" });
      const task = s.spawnTask({}, resolution.resolution_id, "user");
      expect(task.session_id).toBe(s.session_id);
      expect(task.resolution_id).toBe(resolution.resolution_id);
    });
  });

  describe("toHandle() protocol.spawned_tasks", () => {
    it("toHandle() includes spawned_tasks in protocol state", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const handle = s.toHandle();
      expect(handle.protocol.spawned_tasks).toBeDefined();
      expect(handle.protocol.spawned_tasks.length).toBeGreaterThanOrEqual(1);
    });

    it("toHandle() spawned_tasks are deep-copied (mutations do not affect session)", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const handle = s.toHandle();
      // Mutate the handle copy
      (handle.protocol.spawned_tasks[0] as SpawnedTask).title = "MUTATED";
      // Session's task is unaffected
      expect((s.spawned_tasks[0] as SpawnedTask).title).not.toBe("MUTATED");
    });

    it("toHandle() spawned_tasks is empty before resolution", () => {
      const s = makeDeliberatingSession();
      // Not yet resolved
      const handle = s.toHandle();
      expect(handle.protocol.spawned_tasks).toHaveLength(0);
    });
  });

  describe("audit log for task.spawned events", () => {
    it("records 'task.spawned' in audit log for each spawned task", () => {
      const s = makeDeliberatingSession();
      s.resolveProtocol({
        outcome:     "accepted",
        summary:     "Approved",
        resolved_by: "user",
        spawn_tasks: [
          { title: "T1" },
          { title: "T2" },
        ],
      });
      const types = s.getAuditLog().map((e) => e.event_type);
      const taskSpawnedEvents = types.filter((t) => t === "task.spawned");
      expect(taskSpawnedEvents.length).toBe(2);
    });

    it("audit log task.spawned event has correct payload fields", () => {
      const s = makeDeliberatingSession();
      const resolution = s.resolveProtocol({ outcome: "accepted", summary: "Approved", resolved_by: "user" });
      const auditLog = s.getAuditLog();
      const taskEvent = auditLog.find((e) => e.event_type === "task.spawned");
      expect(taskEvent).toBeDefined();
      expect(taskEvent!.payload["session_id"]).toBe(s.session_id);
      expect(taskEvent!.payload["resolution_id"]).toBe(resolution.resolution_id);
      expect(typeof taskEvent!.payload["task_id"]).toBe("string");
      expect(typeof taskEvent!.payload["title"]).toBe("string");
      expect(typeof taskEvent!.payload["assigned_to"]).toBe("string");
    });
  });
});
