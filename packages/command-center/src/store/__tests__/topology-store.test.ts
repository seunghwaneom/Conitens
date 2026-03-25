/**
 * topology-store.test.ts — Unit tests for the topology Zustand store.
 *
 * Sub-AC 7d: Agent wiring & topology editor.
 *
 * Tests cover:
 *   - createLink: valid creation, self-link prevention, duplicate prevention
 *   - removeLink: correct removal, deselection, event emission
 *   - updateLink: field updates, timestamp updates
 *   - editMode: toggle, pending link cleared on exit
 *   - setPendingLink / updatePendingCursor: drag state management
 *   - Event sourcing: all mutations recorded in events array
 *   - Selectors: getAgentLinks, getOutgoingLinks, getIncomingLinks
 *   - Replay: _applyReplayLinks, _resetTopology
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTopologyStore, getAgentLinks, getOutgoingLinks, getIncomingLinks } from "../topology-store.js";

// Reset store state before each test
beforeEach(() => {
  useTopologyStore.setState({
    links:          {},
    editMode:       false,
    defaultLinkType: "direct",
    pendingLink:    null,
    selectedLinkId: null,
    events:         [],
    syncStatus:     {},
  });
});

// ── createLink ─────────────────────────────────────────────────────────────────

describe("createLink", () => {
  it("creates a valid link and returns its ID", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    expect(id).not.toBeNull();
    const links = useTopologyStore.getState().links;
    expect(Object.keys(links)).toHaveLength(1);
    const link = Object.values(links)[0];
    expect(link.sourceAgentId).toBe("agent-1");
    expect(link.targetAgentId).toBe("agent-2");
    expect(link.linkType).toBe("direct");
  });

  it("rejects self-links (source === target)", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-1", "direct");
    expect(id).toBeNull();
    expect(Object.keys(useTopologyStore.getState().links)).toHaveLength(0);
  });

  it("rejects duplicate links with same source, target, and type", () => {
    useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    const id2 = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    expect(id2).toBeNull();
    expect(Object.keys(useTopologyStore.getState().links)).toHaveLength(1);
  });

  it("allows duplicate source-target if link types differ", () => {
    useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    const id2 = useTopologyStore.getState().createLink("agent-1", "agent-2", "delegated");
    expect(id2).not.toBeNull();
    expect(Object.keys(useTopologyStore.getState().links)).toHaveLength(2);
  });

  it("treats A→B and B→A as distinct links", () => {
    useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    const id2 = useTopologyStore.getState().createLink("agent-2", "agent-1", "direct");
    expect(id2).not.toBeNull();
    expect(Object.keys(useTopologyStore.getState().links)).toHaveLength(2);
  });

  it("stores optional label", () => {
    useTopologyStore.getState().createLink("agent-1", "agent-2", "subscribe", "results-stream");
    const link = Object.values(useTopologyStore.getState().links)[0];
    expect(link.label).toBe("results-stream");
  });

  it("sets sync status to 'pending' on creation", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct");
    expect(useTopologyStore.getState().syncStatus[id!]).toBe("pending");
  });

  it("emits a topology.link.created event", () => {
    useTopologyStore.getState().createLink("agent-1", "agent-2", "broadcast");
    const events = useTopologyStore.getState().events;
    const createdEvt = events.find((e) => e.type === "topology.link.created");
    expect(createdEvt).toBeDefined();
    expect(createdEvt!.payload.sourceAgentId).toBe("agent-1");
    expect(createdEvt!.payload.targetAgentId).toBe("agent-2");
    expect(createdEvt!.payload.linkType).toBe("broadcast");
  });
});

// ── removeLink ─────────────────────────────────────────────────────────────────

describe("removeLink", () => {
  it("removes an existing link", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().removeLink(id);
    expect(useTopologyStore.getState().links[id]).toBeUndefined();
  });

  it("clears selectedLinkId if the removed link was selected", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.setState({ selectedLinkId: id });
    useTopologyStore.getState().removeLink(id);
    expect(useTopologyStore.getState().selectedLinkId).toBeNull();
  });

  it("does NOT clear selectedLinkId if a different link was selected", () => {
    const id1 = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    const id2 = useTopologyStore.getState().createLink("agent-1", "agent-3", "direct")!;
    useTopologyStore.setState({ selectedLinkId: id2 });
    useTopologyStore.getState().removeLink(id1);
    expect(useTopologyStore.getState().selectedLinkId).toBe(id2);
  });

  it("removes sync status for the removed link", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().removeLink(id);
    expect(useTopologyStore.getState().syncStatus[id]).toBeUndefined();
  });

  it("emits a topology.link.removed event", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    const prevEventCount = useTopologyStore.getState().events.length;
    useTopologyStore.getState().removeLink(id);
    const events = useTopologyStore.getState().events;
    expect(events.length).toBe(prevEventCount + 1);
    const removedEvt = events[events.length - 1];
    expect(removedEvt.type).toBe("topology.link.removed");
    expect(removedEvt.payload.linkId).toBe(id);
  });

  it("is a no-op for unknown link IDs", () => {
    const prevLinkCount = Object.keys(useTopologyStore.getState().links).length;
    useTopologyStore.getState().removeLink("nonexistent-id");
    expect(Object.keys(useTopologyStore.getState().links).length).toBe(prevLinkCount);
  });
});

// ── updateLink ─────────────────────────────────────────────────────────────────

describe("updateLink", () => {
  it("updates linkType", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().updateLink(id, { linkType: "delegated" });
    expect(useTopologyStore.getState().links[id].linkType).toBe("delegated");
  });

  it("updates label", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().updateLink(id, { label: "new-label" });
    expect(useTopologyStore.getState().links[id].label).toBe("new-label");
  });

  it("bumps updatedTs", async () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    const originalTs = useTopologyStore.getState().links[id].updatedTs;
    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 2));
    useTopologyStore.getState().updateLink(id, { linkType: "subscribe" });
    expect(useTopologyStore.getState().links[id].updatedTs).toBeGreaterThan(originalTs);
  });

  it("emits a topology.link.updated event", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().updateLink(id, { linkType: "broadcast" });
    const events = useTopologyStore.getState().events;
    const updatedEvt = events.find((e) => e.type === "topology.link.updated");
    expect(updatedEvt).toBeDefined();
    expect(updatedEvt!.payload.linkId).toBe(id);
  });
});

// ── editMode ───────────────────────────────────────────────────────────────────

describe("editMode", () => {
  it("toggles edit mode on", () => {
    useTopologyStore.getState().setEditMode(true);
    expect(useTopologyStore.getState().editMode).toBe(true);
  });

  it("toggles edit mode off", () => {
    useTopologyStore.getState().setEditMode(true);
    useTopologyStore.getState().setEditMode(false);
    expect(useTopologyStore.getState().editMode).toBe(false);
  });

  it("clears pendingLink when edit mode is disabled", () => {
    useTopologyStore.getState().setEditMode(true);
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "agent-1",
      cursorPosition: { x: 1, y: 0, z: 1 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    expect(useTopologyStore.getState().pendingLink).not.toBeNull();
    useTopologyStore.getState().setEditMode(false);
    expect(useTopologyStore.getState().pendingLink).toBeNull();
  });

  it("clears selectedLinkId when edit mode is disabled", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().setEditMode(true);
    useTopologyStore.setState({ selectedLinkId: id });
    useTopologyStore.getState().setEditMode(false);
    expect(useTopologyStore.getState().selectedLinkId).toBeNull();
  });

  it("emits topology.edit_mode.enabled event", () => {
    useTopologyStore.getState().setEditMode(true);
    const events = useTopologyStore.getState().events;
    expect(events.some((e) => e.type === "topology.edit_mode.enabled")).toBe(true);
  });

  it("emits topology.edit_mode.disabled event", () => {
    useTopologyStore.getState().setEditMode(true);
    useTopologyStore.getState().setEditMode(false);
    const events = useTopologyStore.getState().events;
    expect(events.some((e) => e.type === "topology.edit_mode.disabled")).toBe(true);
  });

  it("is a no-op if mode is already in the target state", () => {
    const prevEventCount = useTopologyStore.getState().events.length;
    useTopologyStore.getState().setEditMode(false);  // already false
    expect(useTopologyStore.getState().events.length).toBe(prevEventCount);
  });
});

// ── pendingLink / drag state ───────────────────────────────────────────────────

describe("pendingLink and drag state", () => {
  it("sets pendingLink on setPendingLink call", () => {
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "agent-1",
      cursorPosition: { x: 2, y: 0, z: 2 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    expect(useTopologyStore.getState().pendingLink).not.toBeNull();
    expect(useTopologyStore.getState().pendingLink?.sourceAgentId).toBe("agent-1");
  });

  it("emits topology.drag.started event when transitioning null → pending", () => {
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "agent-1",
      cursorPosition: { x: 0, y: 0, z: 0 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    const events = useTopologyStore.getState().events;
    expect(events.some((e) => e.type === "topology.drag.started")).toBe(true);
  });

  it("emits topology.drag.cancelled event when transitioning pending → null", () => {
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "agent-1",
      cursorPosition: { x: 0, y: 0, z: 0 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    useTopologyStore.getState().setPendingLink(null);
    const events = useTopologyStore.getState().events;
    expect(events.some((e) => e.type === "topology.drag.cancelled")).toBe(true);
  });

  it("updatePendingCursor updates position and hoverTargetId", () => {
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "agent-1",
      cursorPosition: { x: 0, y: 0, z: 0 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    useTopologyStore.getState().updatePendingCursor({ x: 5, y: 0, z: 5 }, "agent-3");
    const pending = useTopologyStore.getState().pendingLink;
    expect(pending?.cursorPosition.x).toBe(5);
    expect(pending?.cursorPosition.z).toBe(5);
    expect(pending?.hoverTargetId).toBe("agent-3");
  });

  it("updatePendingCursor is a no-op when pendingLink is null", () => {
    // Should not throw
    useTopologyStore.getState().updatePendingCursor({ x: 5, y: 0, z: 5 }, "agent-1");
    expect(useTopologyStore.getState().pendingLink).toBeNull();
  });
});

// ── selectLink ─────────────────────────────────────────────────────────────────

describe("selectLink", () => {
  it("sets selectedLinkId", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().selectLink(id);
    expect(useTopologyStore.getState().selectedLinkId).toBe(id);
  });

  it("clears selectedLinkId when null is passed", () => {
    const id = useTopologyStore.getState().createLink("agent-1", "agent-2", "direct")!;
    useTopologyStore.getState().selectLink(id);
    useTopologyStore.getState().selectLink(null);
    expect(useTopologyStore.getState().selectedLinkId).toBeNull();
  });
});

// ── Event sourcing ─────────────────────────────────────────────────────────────

describe("event sourcing", () => {
  it("events array is append-only — never shrinks on normal operations", () => {
    useTopologyStore.getState().createLink("a", "b", "direct");
    const count1 = useTopologyStore.getState().events.length;
    useTopologyStore.getState().setEditMode(true);
    const count2 = useTopologyStore.getState().events.length;
    expect(count2).toBeGreaterThan(count1);
  });

  it("each event has a unique id and positive timestamp", () => {
    useTopologyStore.getState().createLink("a", "b", "direct");
    useTopologyStore.getState().createLink("b", "c", "subscribe");
    const events = useTopologyStore.getState().events;
    const ids = events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    events.forEach((e) => expect(e.ts).toBeGreaterThan(0));
  });
});

// ── Selectors ──────────────────────────────────────────────────────────────────

describe("selectors", () => {
  it("getAgentLinks returns links involving the agent as source or target", () => {
    useTopologyStore.getState().createLink("a1", "a2", "direct");
    useTopologyStore.getState().createLink("a3", "a1", "subscribe");
    useTopologyStore.getState().createLink("a2", "a3", "broadcast");
    const links = useTopologyStore.getState().links;
    const a1Links = getAgentLinks(links, "a1");
    expect(a1Links).toHaveLength(2);
  });

  it("getOutgoingLinks returns only links sourced from the agent", () => {
    useTopologyStore.getState().createLink("a1", "a2", "direct");
    useTopologyStore.getState().createLink("a3", "a1", "subscribe");
    const links = useTopologyStore.getState().links;
    expect(getOutgoingLinks(links, "a1")).toHaveLength(1);
    expect(getOutgoingLinks(links, "a1")[0].targetAgentId).toBe("a2");
  });

  it("getIncomingLinks returns only links targeting the agent", () => {
    useTopologyStore.getState().createLink("a1", "a2", "direct");
    useTopologyStore.getState().createLink("a3", "a2", "subscribe");
    const links = useTopologyStore.getState().links;
    expect(getIncomingLinks(links, "a2")).toHaveLength(2);
  });
});

// ── Replay helpers ─────────────────────────────────────────────────────────────

describe("replay helpers", () => {
  it("_applyReplayLinks replaces links with provided snapshot", () => {
    useTopologyStore.getState().createLink("a1", "a2", "direct");
    const snapshot = [
      {
        id:            "snap-link-1",
        sourceAgentId: "b1",
        targetAgentId: "b2",
        linkType:      "broadcast" as const,
        createdTs:     1000,
        updatedTs:     1001,
      },
    ];
    useTopologyStore.getState()._applyReplayLinks(snapshot);
    const links = useTopologyStore.getState().links;
    expect(Object.keys(links)).toHaveLength(1);
    expect(links["snap-link-1"]).toBeDefined();
    expect(links["snap-link-1"].linkType).toBe("broadcast");
  });

  it("_resetTopology clears links, pendingLink, selectedLinkId, and syncStatus", () => {
    useTopologyStore.getState().createLink("a1", "a2", "direct");
    useTopologyStore.getState().setEditMode(true);
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "a1",
      cursorPosition: { x: 1, y: 0, z: 1 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    useTopologyStore.getState()._resetTopology();
    const state = useTopologyStore.getState();
    expect(Object.keys(state.links)).toHaveLength(0);
    expect(state.pendingLink).toBeNull();
    expect(state.selectedLinkId).toBeNull();
    expect(Object.keys(state.syncStatus)).toHaveLength(0);
    // Events are NOT cleared by reset (preserves audit trail)
    expect(state.events.length).toBeGreaterThan(0);
  });
});

// ── setSyncStatus ──────────────────────────────────────────────────────────────

describe("setSyncStatus", () => {
  it("updates sync status for a link", () => {
    const id = useTopologyStore.getState().createLink("a1", "a2", "direct")!;
    useTopologyStore.getState().setSyncStatus(id, "synced");
    expect(useTopologyStore.getState().syncStatus[id]).toBe("synced");
  });

  it("can set error status", () => {
    const id = useTopologyStore.getState().createLink("a1", "a2", "direct")!;
    useTopologyStore.getState().setSyncStatus(id, "error");
    expect(useTopologyStore.getState().syncStatus[id]).toBe("error");
  });
});

// ── setDefaultLinkType ─────────────────────────────────────────────────────────

describe("setDefaultLinkType", () => {
  it("changes the default link type", () => {
    useTopologyStore.getState().setDefaultLinkType("delegated");
    expect(useTopologyStore.getState().defaultLinkType).toBe("delegated");
  });

  it("updates pendingLink.linkType if a drag is in progress", () => {
    useTopologyStore.getState().setPendingLink({
      sourceAgentId:  "a1",
      cursorPosition: { x: 0, y: 0, z: 0 },
      hoverTargetId:  null,
      linkType:       "direct",
    });
    useTopologyStore.getState().setDefaultLinkType("subscribe");
    expect(useTopologyStore.getState().pendingLink?.linkType).toBe("subscribe");
  });
});
