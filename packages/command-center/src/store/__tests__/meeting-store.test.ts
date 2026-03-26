/**
 * Tests for useMeetingStore.
 *
 * Sub-AC 10b: Agent collaboration session spawning — frontend store.
 *
 * Verifies that:
 *   - upsertSession() creates and updates session handles
 *   - handleLiveMeetingEvent() processes meeting.* WS events correctly
 *   - getActiveSessions() / getSessionForRoom() return correct results
 *   - Event log grows with every mutation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useMeetingStore } from "../meeting-store.js";
import type { SessionHandle, TranscriptEntry } from "../meeting-store.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeHandle(overrides: Partial<SessionHandle> = {}): SessionHandle {
  const id = `mtg-test-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  return {
    session_id: id,
    status:     "active",
    room_id:    "ops-control",
    title:      "Test Meeting",
    started_at: new Date().toISOString(),
    ended_at:   null,
    participants: [
      {
        participant_id:   "manager-default",
        participant_kind: "agent",
        assigned_role:    "facilitator",
        capabilities:     [],
      },
    ],
    shared_context: {
      meeting_id: id,
      topic:      "Test Meeting",
      agenda:     "",
      workspace:  {},
      created_at: new Date().toISOString(),
    },
    channel: {
      channel_id:      `ch-${id}`,
      message_count:   1,
      last_message_at: null,
    },
    ...overrides,
  };
}

function resetStore(): void {
  useMeetingStore.setState({ sessions: {}, events: [], selectedSessionId: null });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("useMeetingStore.upsertSession", () => {
  beforeEach(resetStore);

  it("stores a new session handle", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const stored = useMeetingStore.getState().sessions[handle.session_id];
    expect(stored).toEqual(handle);
  });

  it("records a session_received event for new sessions", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const events = useMeetingStore.getState().events;
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("meeting.session_received");
    expect(events[0].sessionId).toBe(handle.session_id);
  });

  it("records a session_updated event when upserting existing session", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    // Upsert again with updated participant count
    const updated = { ...handle, participants: [] };
    useMeetingStore.getState().upsertSession(updated);
    const events = useMeetingStore.getState().events;
    expect(events.length).toBe(2);
    expect(events[1].type).toBe("meeting.session_updated");
  });

  it("updates existing session in store", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const updated = { ...handle, status: "ended" as const, ended_at: new Date().toISOString() };
    useMeetingStore.getState().upsertSession(updated);
    const stored = useMeetingStore.getState().sessions[handle.session_id];
    expect(stored.status).toBe("ended");
  });
});

describe("useMeetingStore.handleLiveMeetingEvent", () => {
  beforeEach(resetStore);

  it("creates a session from meeting.started event", () => {
    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.started",
      payload: {
        meeting_id:      "mtg-ws-001",
        room_id:         "research-lab",
        title:           "WS Meeting",
        initiated_by:    "user",
        participant_ids: [],
      },
    });
    const sessions = useMeetingStore.getState().sessions;
    expect(sessions["mtg-ws-001"]).toBeDefined();
    expect(sessions["mtg-ws-001"].status).toBe("active");
    expect(sessions["mtg-ws-001"].room_id).toBe("research-lab");
  });

  it("does not overwrite richer HTTP-sourced session with WS meeting.started", () => {
    const handle = makeHandle({ session_id: "mtg-ws-002", participants: [
      {
        participant_id:   "manager-default",
        participant_kind: "agent",
        assigned_role:    "facilitator",
        capabilities:     ["planning"],
      },
    ] });
    useMeetingStore.getState().upsertSession(handle);

    // WS event arrives for the same session — should NOT overwrite
    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.started",
      payload: { meeting_id: "mtg-ws-002", room_id: "other", participant_ids: [] },
    });

    const stored = useMeetingStore.getState().sessions["mtg-ws-002"];
    expect(stored.room_id).toBe(handle.room_id); // original room preserved
    expect(stored.participants.length).toBe(1);   // participants preserved
  });

  it("transitions session to ended on meeting.ended event", () => {
    const handle = makeHandle({ session_id: "mtg-ws-003" });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.ended",
      payload: { meeting_id: "mtg-ws-003", outcome: "completed" },
      ts:      new Date().toISOString(),
    });

    const stored = useMeetingStore.getState().sessions["mtg-ws-003"];
    expect(stored.status).toBe("ended");
    expect(stored.ended_at).not.toBeNull();
  });

  it("adds participant on meeting.participant.joined", () => {
    const handle = makeHandle({ session_id: "mtg-ws-004", participants: [] });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().handleLiveMeetingEvent({
      type: "meeting.participant.joined",
      payload: {
        meeting_id:       "mtg-ws-004",
        participant_id:   "implementer-subagent",
        participant_kind: "agent",
        role:             "contributor",
      },
    });

    const stored = useMeetingStore.getState().sessions["mtg-ws-004"];
    expect(stored.participants.length).toBe(1);
    expect(stored.participants[0].participant_id).toBe("implementer-subagent");
    expect(stored.participants[0].assigned_role).toBe("contributor");
  });

  it("is idempotent for participant.joined (same participant)", () => {
    const handle = makeHandle({ session_id: "mtg-ws-005", participants: [
      { participant_id: "manager-default", participant_kind: "agent", assigned_role: "facilitator", capabilities: [] },
    ] });
    useMeetingStore.getState().upsertSession(handle);

    // Join again for the same participant
    useMeetingStore.getState().handleLiveMeetingEvent({
      type: "meeting.participant.joined",
      payload: { meeting_id: "mtg-ws-005", participant_id: "manager-default", participant_kind: "agent", role: "facilitator" },
    });

    const stored = useMeetingStore.getState().sessions["mtg-ws-005"];
    expect(stored.participants.length).toBe(1); // no duplicate
  });

  it("removes participant on meeting.participant.left", () => {
    const handle = makeHandle({ session_id: "mtg-ws-006", participants: [
      { participant_id: "manager-default",      participant_kind: "agent", assigned_role: "facilitator",  capabilities: [] },
      { participant_id: "implementer-subagent", participant_kind: "agent", assigned_role: "contributor",  capabilities: [] },
    ] });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().handleLiveMeetingEvent({
      type: "meeting.participant.left",
      payload: { meeting_id: "mtg-ws-006", participant_id: "implementer-subagent", participant_kind: "agent" },
    });

    const stored = useMeetingStore.getState().sessions["mtg-ws-006"];
    expect(stored.participants.length).toBe(1);
    expect(stored.participants[0].participant_id).toBe("manager-default");
  });
});

describe("useMeetingStore getters", () => {
  beforeEach(resetStore);

  it("getActiveSessions returns only active sessions", () => {
    useMeetingStore.getState().upsertSession(makeHandle({ session_id: "a1", status: "active" }));
    useMeetingStore.getState().upsertSession(makeHandle({ session_id: "a2", status: "ended" }));
    useMeetingStore.getState().upsertSession(makeHandle({ session_id: "a3", status: "active" }));

    const active = useMeetingStore.getState().getActiveSessions();
    expect(active.length).toBe(2);
    expect(active.every((s) => s.status === "active")).toBe(true);
  });

  it("getSessionForRoom returns active session in room", () => {
    useMeetingStore.getState().upsertSession(makeHandle({
      session_id: "r1",
      room_id:    "ops-control",
      status:     "active",
    }));
    useMeetingStore.getState().upsertSession(makeHandle({
      session_id: "r2",
      room_id:    "research-lab",
      status:     "active",
    }));

    const s = useMeetingStore.getState().getSessionForRoom("ops-control");
    expect(s).toBeDefined();
    expect(s!.session_id).toBe("r1");
  });

  it("getSessionForRoom returns undefined for rooms with no active session", () => {
    const s = useMeetingStore.getState().getSessionForRoom("empty-room");
    expect(s).toBeUndefined();
  });

  it("selectSession sets selectedSessionId", () => {
    useMeetingStore.getState().selectSession("mtg-selected");
    expect(useMeetingStore.getState().selectedSessionId).toBe("mtg-selected");
  });
});

// ── Sub-AC 10c: appendTranscript ──────────────────────────────────────────────

describe("useMeetingStore.appendTranscript (Sub-AC 10c)", () => {
  beforeEach(resetStore);

  function makeEntry(overrides: Partial<Omit<TranscriptEntry, "id">> = {}): Omit<TranscriptEntry, "id"> {
    return {
      speaker:     "manager-default",
      speakerKind: "agent",
      text:        "Hello collaborators",
      ts:          Date.now(),
      ...overrides,
    };
  }

  it("creates a transcript feed for the session", () => {
    const handle = makeHandle({ session_id: "sess-10c" });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().appendTranscript("sess-10c", makeEntry());
    const feed = useMeetingStore.getState().transcripts["sess-10c"];
    expect(feed).toBeDefined();
    expect(feed.length).toBe(1);
  });

  it("assigns a unique id to each transcript entry", () => {
    const handle = makeHandle({ session_id: "sess-10c-2" });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().appendTranscript("sess-10c-2", makeEntry({ text: "A" }));
    useMeetingStore.getState().appendTranscript("sess-10c-2", makeEntry({ text: "B" }));
    const feed = useMeetingStore.getState().transcripts["sess-10c-2"];
    expect(feed[0].id).toBeDefined();
    expect(feed[1].id).toBeDefined();
    expect(feed[0].id).not.toBe(feed[1].id);
  });

  it("preserves text content of entries", () => {
    const handle = makeHandle({ session_id: "sess-10c-3" });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().appendTranscript("sess-10c-3", makeEntry({ text: "Hello from agent" }));
    const feed = useMeetingStore.getState().transcripts["sess-10c-3"];
    expect(feed[0].text).toBe("Hello from agent");
  });

  it("emits a meeting.transcript_appended event", () => {
    const handle = makeHandle({ session_id: "sess-10c-4" });
    useMeetingStore.getState().upsertSession(handle);
    const eventsBefore = useMeetingStore.getState().events.length;
    useMeetingStore.getState().appendTranscript("sess-10c-4", makeEntry());
    const events = useMeetingStore.getState().events;
    expect(events.length).toBeGreaterThan(eventsBefore);
    const evt = events.find((e) => e.type === "meeting.transcript_appended");
    expect(evt).toBeDefined();
    expect(evt?.sessionId).toBe("sess-10c-4");
  });

  it("emitted event payload includes speaker and text_length", () => {
    const handle = makeHandle({ session_id: "sess-10c-5" });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().appendTranscript("sess-10c-5", makeEntry({ speaker: "researcher-1", text: "abc", speakerKind: "agent" }));
    const evt = useMeetingStore.getState().events.find(
      (e) => e.type === "meeting.transcript_appended",
    );
    expect(evt?.payload).toMatchObject({ speaker: "researcher-1", text_length: 3 });
  });

  it("appends multiple entries in order", () => {
    const handle = makeHandle({ session_id: "sess-10c-6" });
    useMeetingStore.getState().upsertSession(handle);
    for (let i = 0; i < 5; i++) {
      useMeetingStore.getState().appendTranscript("sess-10c-6", makeEntry({ text: `msg-${i}` }));
    }
    const feed = useMeetingStore.getState().transcripts["sess-10c-6"];
    expect(feed.length).toBe(5);
    expect(feed[0].text).toBe("msg-0");
    expect(feed[4].text).toBe("msg-4");
  });

  it("works for unknown sessionId (creates new feed)", () => {
    // No prior upsertSession — store should create the transcript feed anyway
    useMeetingStore.getState().appendTranscript("orphan-session", makeEntry());
    const feed = useMeetingStore.getState().transcripts["orphan-session"];
    expect(feed).toBeDefined();
    expect(feed.length).toBe(1);
  });
});

// ── Sub-AC 10c: terminateSession (optimistic) ─────────────────────────────────

describe("useMeetingStore.terminateSession (Sub-AC 10c)", () => {
  beforeEach(resetStore);

  it("sets session status to 'ended' optimistically", async () => {
    const handle = makeHandle({ session_id: "term-1", status: "active" });
    useMeetingStore.getState().upsertSession(handle);
    // terminateSession makes an HTTP call; in test environment fetch will fail
    // but the optimistic update should still fire before any await
    const promise = useMeetingStore.getState().terminateSession("term-1");
    // Optimistic update is synchronous (before any await)
    expect(useMeetingStore.getState().sessions["term-1"].status).toBe("ended");
    // Await to let the async path settle (it will fail silently on fetch error)
    await promise.catch(() => {/* expected in test environment */});
  });

  it("sets ended_at on the session", async () => {
    const handle = makeHandle({ session_id: "term-2", status: "active" });
    useMeetingStore.getState().upsertSession(handle);
    await useMeetingStore.getState().terminateSession("term-2").catch(() => {});
    expect(useMeetingStore.getState().sessions["term-2"].ended_at).not.toBeNull();
  });

  it("emits meeting.terminate_requested and meeting.session_ended events", async () => {
    const handle = makeHandle({ session_id: "term-3", status: "active" });
    useMeetingStore.getState().upsertSession(handle);
    await useMeetingStore.getState().terminateSession("term-3").catch(() => {});
    const types = useMeetingStore.getState().events.map((e) => e.type);
    expect(types).toContain("meeting.terminate_requested");
    expect(types).toContain("meeting.session_ended");
  });

  it("is a no-op for sessions that are not active", async () => {
    const handle = makeHandle({ session_id: "term-4", status: "ended" });
    useMeetingStore.getState().upsertSession(handle);
    const eventsBefore = useMeetingStore.getState().events.length;
    await useMeetingStore.getState().terminateSession("term-4").catch(() => {});
    // No new events should be emitted for an already-ended session
    expect(useMeetingStore.getState().events.length).toBe(eventsBefore);
  });

  it("is a no-op for unknown session_ids", async () => {
    const eventsBefore = useMeetingStore.getState().events.length;
    await useMeetingStore.getState().terminateSession("nonexistent-session").catch(() => {});
    expect(useMeetingStore.getState().events.length).toBe(eventsBefore);
  });
});
