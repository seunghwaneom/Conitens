/**
 * topology-store.ts — Zustand store for agent-to-agent communication topology.
 *
 * Sub-AC 7d: Agent wiring & topology editor.
 *
 * Manages:
 *   - Agent-to-agent communication links (directed graph edges)
 *   - Topology edit mode (drag-to-connect interactions)
 *   - Pending link state during drag gesture
 *   - Selected link (for sever/update operations)
 *   - Append-only event log (event sourcing — all mutations recorded)
 *
 * Persistence:
 *   All links are persisted via use-topology-api.ts to the orchestration API
 *   at POST/DELETE /api/topology/links. Falls back to localStorage when the
 *   backend is unavailable.
 *
 * Link types reflect the four communication patterns in Conitens:
 *   direct    — point-to-point message passing (cyan)
 *   delegated — source delegates tasks to target (orange)
 *   broadcast — source fans-out messages to target (green)
 *   subscribe — target listens to source's output stream (purple)
 *
 * Design invariants:
 *   - No self-links (source !== target enforced in createLink)
 *   - No duplicate links (same source+target+type) — deduplicated by key
 *   - Links are directed (A→B ≠ B→A)
 *   - editMode = false prevents accidental topology mutations from 3D scene clicks
 *   - Event log is write-only / append-only (never modified)
 */

import { create } from "zustand";

// ── Link Types ─────────────────────────────────────────────────────────────────

/** The four communication patterns between agents */
export type TopologyLinkType = "direct" | "delegated" | "broadcast" | "subscribe";

/** Visual colour per link type — dark command-center palette */
export const LINK_TYPE_COLOR: Readonly<Record<TopologyLinkType, string>> = {
  direct:    "#40C4FF",   // cyan  — standard message passing
  delegated: "#FF9100",   // amber — task delegation
  broadcast: "#00ff88",   // green — fan-out / publish
  subscribe: "#aa88ff",   // violet — stream subscription
};

/** Descriptive label for link-type selector UI */
export const LINK_TYPE_LABEL: Readonly<Record<TopologyLinkType, string>> = {
  direct:    "Direct",
  delegated: "Delegated",
  broadcast: "Broadcast",
  subscribe: "Subscribe",
};

// ── Core Link Model ────────────────────────────────────────────────────────────

/** A directed communication link between two agents */
export interface TopologyLink {
  /** Unique link ID (UUID-like, generated client-side) */
  id: string;
  /** Source agent ID */
  sourceAgentId: string;
  /** Target agent ID */
  targetAgentId: string;
  /** Communication pattern / link type */
  linkType: TopologyLinkType;
  /** Optional human-readable label (e.g. "task-results", "status-updates") */
  label?: string;
  /** Creation timestamp (ms since epoch) */
  createdTs: number;
  /** Last modification timestamp */
  updatedTs: number;
}

// ── Event Sourcing ─────────────────────────────────────────────────────────────

export type TopologyEventType =
  | "topology.link.created"
  | "topology.link.removed"
  | "topology.link.updated"
  | "topology.edit_mode.enabled"
  | "topology.edit_mode.disabled"
  | "topology.drag.started"
  | "topology.drag.cancelled"
  | "topology.initialized";

export interface TopologyEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: TopologyEventType;
  /** Event timestamp (ms since epoch) */
  ts: number;
  /** Event payload */
  payload: Record<string, unknown>;
}

// ── Drag State ─────────────────────────────────────────────────────────────────

/**
 * State of an in-progress drag-to-connect gesture.
 * Set when the user presses down on a connector port; cleared on release.
 */
export interface PendingLink {
  /** Agent ID that the user started dragging from */
  sourceAgentId: string;
  /** Current world-space cursor position (updated on pointer move) */
  cursorPosition: { x: number; y: number; z: number };
  /** Agent ID currently under cursor (if any) — highlights the potential target */
  hoverTargetId: string | null;
  /** Proposed link type (can be changed via modifier keys or UI selector) */
  linkType: TopologyLinkType;
}

// ── Store Shape ────────────────────────────────────────────────────────────────

interface TopologyStoreState {
  /** All agent-to-agent communication links, keyed by link ID */
  links: Record<string, TopologyLink>;

  /** Whether the topology editor is in interactive editing mode */
  editMode: boolean;

  /** The link type to use when creating new links */
  defaultLinkType: TopologyLinkType;

  /** Partial link being constructed during a drag gesture */
  pendingLink: PendingLink | null;

  /** Currently selected link ID (for sever / update operations) */
  selectedLinkId: string | null;

  /**
   * Append-only event log — all topology mutations are recorded here.
   * Events are used for replay (AC 9) and the self-improvement cycle (AC 7d).
   */
  events: TopologyEvent[];

  /**
   * API sync status — tracks inflight persistence calls per link.
   * Values: "pending" | "synced" | "error"
   */
  syncStatus: Record<string, "pending" | "synced" | "error">;
}

interface TopologyStoreActions {
  /**
   * Create a new directed link from source → target.
   * Returns the new link ID. Skips if a link with the same
   * source, target, and type already exists.
   */
  createLink: (
    sourceAgentId: string,
    targetAgentId: string,
    linkType: TopologyLinkType,
    label?: string,
  ) => string | null;

  /** Remove a link by ID */
  removeLink: (linkId: string) => void;

  /** Update a link's type or label */
  updateLink: (
    linkId: string,
    updates: Partial<Pick<TopologyLink, "linkType" | "label">>,
  ) => void;

  /** Enable / disable topology editing mode */
  setEditMode: (enabled: boolean) => void;

  /** Set the default link type for new connections */
  setDefaultLinkType: (linkType: TopologyLinkType) => void;

  /** Update pending link state during a drag gesture */
  setPendingLink: (pending: PendingLink | null) => void;

  /** Update only the cursor position of the current pending link */
  updatePendingCursor: (
    position: { x: number; y: number; z: number },
    hoverTargetId: string | null,
  ) => void;

  /** Select / deselect a link */
  selectLink: (linkId: string | null) => void;

  /** Update API sync status for a link */
  setSyncStatus: (linkId: string, status: "pending" | "synced" | "error") => void;

  /**
   * Load links from a serialized snapshot (used by replay engine).
   * Does NOT emit events.
   */
  _applyReplayLinks: (links: TopologyLink[]) => void;

  /** Clear all links and events (used by replay reset) */
  _resetTopology: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Generate a compact client-side unique ID */
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Build the deduplication key for a link */
function linkKey(sourceAgentId: string, targetAgentId: string, linkType: TopologyLinkType): string {
  return `${sourceAgentId}→${targetAgentId}:${linkType}`;
}

/** Append an event to the immutable log */
function appendEvent(
  events: TopologyEvent[],
  type: TopologyEventType,
  payload: Record<string, unknown>,
): TopologyEvent[] {
  return [
    ...events,
    {
      id:   makeId("tevt"),
      type,
      ts:   Date.now(),
      payload,
    },
  ];
}

// ── Store Creation ─────────────────────────────────────────────────────────────

export const useTopologyStore = create<TopologyStoreState & TopologyStoreActions>()((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  links:           {},
  editMode:        false,
  defaultLinkType: "direct",
  pendingLink:     null,
  selectedLinkId:  null,
  events:          [],
  syncStatus:      {},

  // ── Actions ────────────────────────────────────────────────────────────────

  createLink: (sourceAgentId, targetAgentId, linkType, label?) => {
    // Guard: no self-links
    if (sourceAgentId === targetAgentId) return null;

    const { links, events } = get();

    // Guard: no duplicate links
    const dupeKey = linkKey(sourceAgentId, targetAgentId, linkType);
    const exists = Object.values(links).some(
      (l) => linkKey(l.sourceAgentId, l.targetAgentId, l.linkType) === dupeKey,
    );
    if (exists) return null;

    const now  = Date.now();
    const id   = makeId("link");
    const link: TopologyLink = {
      id,
      sourceAgentId,
      targetAgentId,
      linkType,
      label,
      createdTs: now,
      updatedTs: now,
    };

    set({
      links:      { ...links, [id]: link },
      syncStatus: { ...get().syncStatus, [id]: "pending" },
      events:     appendEvent(events, "topology.link.created", {
        linkId: id,
        sourceAgentId,
        targetAgentId,
        linkType,
        label: label ?? null,
      }),
    });

    return id;
  },

  removeLink: (linkId) => {
    const { links, events, syncStatus, selectedLinkId } = get();
    if (!links[linkId]) return;

    const { [linkId]: removed, ...remaining } = links;
    const { [linkId]: _ss,    ...remainingSS  } = syncStatus;

    set({
      links:         remaining,
      syncStatus:    remainingSS,
      selectedLinkId: selectedLinkId === linkId ? null : selectedLinkId,
      events:        appendEvent(events, "topology.link.removed", {
        linkId,
        sourceAgentId: removed.sourceAgentId,
        targetAgentId: removed.targetAgentId,
        linkType:      removed.linkType,
      }),
    });
  },

  updateLink: (linkId, updates) => {
    const { links, events } = get();
    const link = links[linkId];
    if (!link) return;

    const updated: TopologyLink = {
      ...link,
      ...updates,
      updatedTs: Date.now(),
    };

    set({
      links:  { ...links, [linkId]: updated },
      events: appendEvent(events, "topology.link.updated", {
        linkId,
        updates,
      }),
    });
  },

  setEditMode: (enabled) => {
    const { events, editMode, pendingLink } = get();
    if (editMode === enabled) return;

    set({
      editMode:    enabled,
      pendingLink: enabled ? pendingLink : null,  // cancel pending drag on mode exit
      selectedLinkId: enabled ? get().selectedLinkId : null,
      events:      appendEvent(events,
        enabled ? "topology.edit_mode.enabled" : "topology.edit_mode.disabled",
        { ts: Date.now() },
      ),
    });
  },

  setDefaultLinkType: (linkType) => {
    set({ defaultLinkType: linkType });
    // Also update pending link if one is in progress
    const { pendingLink } = get();
    if (pendingLink) {
      set({ pendingLink: { ...pendingLink, linkType } });
    }
  },

  setPendingLink: (pending) => {
    const { events, pendingLink: prev } = get();

    if (pending && !prev) {
      // Drag started
      set({
        pendingLink: pending,
        events:      appendEvent(events, "topology.drag.started", {
          sourceAgentId: pending.sourceAgentId,
        }),
      });
    } else if (!pending && prev) {
      // Drag cancelled (no target found on release)
      set({
        pendingLink: null,
        events:      appendEvent(events, "topology.drag.cancelled", {
          sourceAgentId: prev.sourceAgentId,
        }),
      });
    } else {
      set({ pendingLink: pending });
    }
  },

  updatePendingCursor: (position, hoverTargetId) => {
    const { pendingLink } = get();
    if (!pendingLink) return;
    set({
      pendingLink: {
        ...pendingLink,
        cursorPosition: position,
        hoverTargetId,
      },
    });
  },

  selectLink: (linkId) => {
    set({ selectedLinkId: linkId });
  },

  setSyncStatus: (linkId, status) => {
    set((state) => ({
      syncStatus: { ...state.syncStatus, [linkId]: status },
    }));
  },

  _applyReplayLinks: (links) => {
    const byId: Record<string, TopologyLink> = {};
    for (const link of links) byId[link.id] = link;
    set({ links: byId });
  },

  _resetTopology: () => {
    set({
      links:         {},
      pendingLink:   null,
      selectedLinkId: null,
      syncStatus:    {},
      // Preserve events log — do not clear for replay consistency
    });
  },
}));

// ── Selectors (convenience) ────────────────────────────────────────────────────

/**
 * Get all links involving a specific agent (as source or target).
 * Useful for AgentAvatar to know how many connections it has.
 */
export function getAgentLinks(
  links: Record<string, TopologyLink>,
  agentId: string,
): TopologyLink[] {
  return Object.values(links).filter(
    (l) => l.sourceAgentId === agentId || l.targetAgentId === agentId,
  );
}

/**
 * Get all outgoing links from a specific agent.
 */
export function getOutgoingLinks(
  links: Record<string, TopologyLink>,
  agentId: string,
): TopologyLink[] {
  return Object.values(links).filter((l) => l.sourceAgentId === agentId);
}

/**
 * Get all incoming links to a specific agent.
 */
export function getIncomingLinks(
  links: Record<string, TopologyLink>,
  agentId: string,
): TopologyLink[] {
  return Object.values(links).filter((l) => l.targetAgentId === agentId);
}
