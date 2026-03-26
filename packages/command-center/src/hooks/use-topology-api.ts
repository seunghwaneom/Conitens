/**
 * use-topology-api.ts — Persistence hook for agent topology links.
 *
 * Sub-AC 7d: Persists topology link changes to the orchestration API.
 *
 * API contract (orchestration server at VITE_ORCHESTRATION_URL or localhost:8081):
 *   GET    /api/topology/links        — list all links
 *   POST   /api/topology/links        — create a link → returns TopologyLink
 *   DELETE /api/topology/links/:id    — remove a link
 *   PUT    /api/topology/links/:id    — update a link
 *
 * Resilience:
 *   - When the backend is unreachable (ECONNREFUSED, timeout), the hook
 *     falls back to localStorage (`conitens_topology_links` key).
 *   - Optimistic writes: the Zustand store is updated immediately and
 *     sync status transitions from "pending" → "synced" / "error".
 *   - Failed writes are retried once after RETRY_DELAY_MS.
 *
 * Usage:
 *   Call useTopologyApi() in App.tsx (or another singleton component)
 *   to activate automatic persistence. The hook is a no-op if
 *   edit mode is never entered.
 *
 * Event sourcing:
 *   All writes are mediated through topology-store actions, which
 *   append events to the immutable event log before any API call.
 *   API failures do NOT roll back the store — the event log retains
 *   the intent, enabling audit and later reconciliation.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  useTopologyStore,
  type TopologyLink,
  type TopologyLinkType,
} from "../store/topology-store.js";

// ── Config ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _viteEnv: Record<string, string> = (import.meta as any).env ?? {};
const ORCHESTRATION_BASE =
  _viteEnv["VITE_ORCHESTRATION_URL"] || "http://localhost:8081";

const TOPOLOGY_API = `${ORCHESTRATION_BASE}/api/topology/links`;
const RETRY_DELAY_MS = 3_000;
const FETCH_TIMEOUT_MS = 5_000;
const LS_KEY = "conitens_topology_links";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fetch with a hard timeout to avoid hanging requests */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

/** Save link snapshot to localStorage (fallback persistence) */
function saveToLocalStorage(links: Record<string, TopologyLink>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Object.values(links)));
  } catch {
    // quota exceeded or storage unavailable — silently ignore
  }
}

/** Load link snapshot from localStorage */
function loadFromLocalStorage(): TopologyLink[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TopologyLink[];
  } catch {
    return [];
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Singleton hook that syncs topology links with the orchestration API.
 *
 * Mount once in App.tsx. Reacts to topology-store event log additions
 * and performs the corresponding API write.
 *
 * On initial mount, attempts to load persisted links from the API
 * (falling back to localStorage) and populates the store.
 */
export function useTopologyApi(): {
  isBackendAvailable: boolean;
} {
  const setSyncStatus   = useTopologyStore((s) => s.setSyncStatus);
  const applyReplayLinks = useTopologyStore((s) => s._applyReplayLinks);

  const backendAvailableRef = useRef(false);
  const retryTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadLinks() {
      try {
        const res = await fetchWithTimeout(TOPOLOGY_API, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as TopologyLink[];
        if (!cancelled) {
          applyReplayLinks(data);
          backendAvailableRef.current = true;
        }
      } catch {
        // Backend unavailable — load from localStorage fallback
        const stored = loadFromLocalStorage();
        if (!cancelled && stored.length > 0) {
          applyReplayLinks(stored);
        }
        backendAvailableRef.current = false;
      }
    }

    void loadLinks();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── API write helper ────────────────────────────────────────────────────────

  const apiCreateLink = useCallback(
    async (link: TopologyLink): Promise<boolean> => {
      setSyncStatus(link.id, "pending");
      try {
        const res = await fetchWithTimeout(TOPOLOGY_API, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            id:            link.id,
            sourceAgentId: link.sourceAgentId,
            targetAgentId: link.targetAgentId,
            linkType:      link.linkType,
            label:         link.label,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSyncStatus(link.id, "synced");
        backendAvailableRef.current = true;
        return true;
      } catch {
        setSyncStatus(link.id, "error");
        backendAvailableRef.current = false;
        // Fallback: persist in localStorage
        saveToLocalStorage(useTopologyStore.getState().links);
        // Schedule retry
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          void apiCreateLink(link);
        }, RETRY_DELAY_MS);
        return false;
      }
    },
    [setSyncStatus],
  );

  const apiRemoveLink = useCallback(
    async (linkId: string): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(`${TOPOLOGY_API}/${linkId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        backendAvailableRef.current = true;
        return true;
      } catch {
        backendAvailableRef.current = false;
        // Fallback: update localStorage
        saveToLocalStorage(useTopologyStore.getState().links);
        return false;
      }
    },
    [],
  );

  const apiUpdateLink = useCallback(
    async (
      linkId: string,
      updates: { linkType?: TopologyLinkType; label?: string },
    ): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(`${TOPOLOGY_API}/${linkId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        backendAvailableRef.current = true;
        return true;
      } catch {
        backendAvailableRef.current = false;
        saveToLocalStorage(useTopologyStore.getState().links);
        return false;
      }
    },
    [],
  );

  // ── React to store events ───────────────────────────────────────────────────
  //
  // We subscribe to the topology event log and process new entries.
  // The events array is append-only, so we track the last processed index.

  const lastProcessedEventRef = useRef(0);

  useEffect(() => {
    const unsubscribe = useTopologyStore.subscribe((state) => {
      const { events, links } = state;
      if (events.length <= lastProcessedEventRef.current) return;

      // Process all unhandled events in order
      for (let i = lastProcessedEventRef.current; i < events.length; i++) {
        const evt = events[i];

        switch (evt.type) {
          case "topology.link.created": {
            const linkId = evt.payload.linkId as string;
            const link   = links[linkId];
            if (link) void apiCreateLink(link);
            break;
          }
          case "topology.link.removed": {
            const linkId = evt.payload.linkId as string;
            void apiRemoveLink(linkId);
            // Always update localStorage to reflect removal
            saveToLocalStorage(links);
            break;
          }
          case "topology.link.updated": {
            const linkId  = evt.payload.linkId as string;
            const updates = evt.payload.updates as { linkType?: TopologyLinkType; label?: string };
            void apiUpdateLink(linkId, updates);
            break;
          }
          default:
            // topology.edit_mode.* and topology.drag.* events: no API write needed
            break;
        }
      }

      lastProcessedEventRef.current = events.length;
    });

    return () => {
      unsubscribe();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [apiCreateLink, apiRemoveLink, apiUpdateLink]);

  return { isBackendAvailable: backendAvailableRef.current };
}
