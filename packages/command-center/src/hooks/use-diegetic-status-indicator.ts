/**
 * use-diegetic-status-indicator.ts — Sub-AC 8c
 *
 * React hook that reads live command lifecycle state for ANY source entity
 * identified by `sourceEntityId`.  Generalises the per-agent
 * CommandStatusBadge pattern to work for agents, ui_fixtures, rooms, tasks,
 * or any other named entity in the Conitens system.
 *
 * Query strategy:
 *   1. Fast path — agentCommandMap[sourceEntityId] for O(1) agent lookup
 *   2. Log scan  — CommandLifecycleEntry.roomId === sourceEntityId
 *      (covers room entities and any entity registered via roomId)
 *   3. Union, deduplicate by command_id
 *
 * Dominant-status priority (highest → renders):
 *   failed (5) > rejected (4) > processing (3) > pending (2) > completed (1) > none (0)
 *
 * Terminal entries remain visible for INDICATOR_TERMINAL_VISIBLE_MS after
 * their last status update, then drop from the result set.
 *
 * The hook is a pure reactive selector — no mutations, no side-effects.
 * It is safe to call from any React component tree position (inside or
 * outside a Canvas).
 *
 * @example
 * ```tsx
 * const { dominantStatus, activeCount, latestEntry } =
 *   useDiegeticStatusIndicator("ops-dashboard-main");
 * ```
 */

import { useMemo } from "react";
import {
  useCommandLifecycleStore,
  COMPLETION_TTL_MS,
  type CommandLifecycleEntry,
  type CommandLifecycleStatus,
} from "../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long terminal entries remain visible in the indicator after the last
 * status change.  Slightly longer than COMPLETION_TTL_MS so the visual
 * confirms resolution before disappearing.
 */
export const INDICATOR_TERMINAL_VISIBLE_MS = COMPLETION_TTL_MS + 2_000;

/**
 * Maximum number of log entries to scan when searching for a non-agent entity.
 * Keeps the selector O(N) but bounds N to prevent slowdowns on large logs.
 */
export const INDICATOR_LOG_SCAN_LIMIT = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Dominant-status priority
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Higher number = rendered as dominant when multiple commands are present.
 *
 * The "none" sentinel is included so computeDominantStatus() works without
 * an explicit initial-value check.
 */
export const DOMINANT_STATUS_PRIORITY: Record<
  CommandLifecycleStatus | "none",
  number
> = {
  failed:     5,
  rejected:   4,
  processing: 3,
  pending:    2,
  completed:  1,
  none:       0,
};

/**
 * Compute the single highest-priority status from a set of entries.
 * Returns null when `entries` is empty.
 */
export function computeDominantStatus(
  entries: CommandLifecycleEntry[],
): CommandLifecycleStatus | null {
  if (entries.length === 0) return null;

  let best: CommandLifecycleStatus | "none" = "none";
  let bestPriority = 0;

  for (const entry of entries) {
    const p = DOMINANT_STATUS_PRIORITY[entry.status] ?? 0;
    if (p > bestPriority) {
      best = entry.status;
      bestPriority = p;
    }
  }

  return best === "none" ? null : best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The reactive state returned by useDiegeticStatusIndicator.
 */
export interface DiegeticStatusIndicatorState {
  /**
   * The highest-priority lifecycle status for this entity, or null if idle.
   *
   * null  → no visible indicator needed
   * other → render indicator with matching color/animation
   */
  dominantStatus: CommandLifecycleStatus | null;

  /**
   * All active (pending/processing) + recently-terminal entries for this entity.
   * Can be used to render per-command sub-badges or tooltip lists.
   */
  entries: CommandLifecycleEntry[];

  /**
   * Count of currently active (pending or processing) commands.
   * Useful for badge count overlays.
   */
  activeCount: number;

  /**
   * The most recently updated entry, or null when entries is empty.
   * Useful for tooltip: shows command_type + status of the "hot" command.
   */
  latestEntry: CommandLifecycleEntry | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns live command lifecycle state for the entity identified by
 * `sourceEntityId`.
 *
 * Re-renders only when the relevant subset of the command-lifecycle-store
 * changes (selector-based, not full-store subscription).
 *
 * @param sourceEntityId  Any entity ID: agent, room, fixture, task, etc.
 */
export function useDiegeticStatusIndicator(
  sourceEntityId: string,
): DiegeticStatusIndicatorState {
  // ── Fast path: per-agent active entries ──────────────────────────────────
  const agentEntries = useCommandLifecycleStore((s) =>
    s.getActiveCommandsForAgent(sourceEntityId),
  );

  // ── Log scan: match by agentId or roomId ─────────────────────────────────
  const logMatches = useCommandLifecycleStore((s) => {
    const nowMs = Date.now();
    return s
      .getLogEntries(INDICATOR_LOG_SCAN_LIMIT)
      .filter((e) => {
        // Only include entries that reference this entity
        if (
          e.agentId !== sourceEntityId &&
          e.roomId !== sourceEntityId
        ) {
          return false;
        }
        // Active entries always included
        if (e.status === "pending" || e.status === "processing") return true;
        // Terminal entries within visibility window
        return (
          nowMs - new Date(e.updatedAt).getTime() < INDICATOR_TERMINAL_VISIBLE_MS
        );
      });
  });

  // ── Merge + deduplicate ────────────────────────────────────────────────────
  return useMemo(() => {
    const seen = new Set<string>();
    const merged: CommandLifecycleEntry[] = [];

    for (const entry of [...agentEntries, ...logMatches]) {
      if (!seen.has(entry.command_id)) {
        seen.add(entry.command_id);
        merged.push(entry);
      }
    }

    if (merged.length === 0) {
      return {
        dominantStatus: null,
        entries: [],
        activeCount: 0,
        latestEntry: null,
      };
    }

    const dominantStatus = computeDominantStatus(merged);

    const activeCount = merged.filter(
      (e) => e.status === "pending" || e.status === "processing",
    ).length;

    // Latest entry: highest updatedAt timestamp
    const latestEntry = merged.reduce<CommandLifecycleEntry | null>(
      (best, e) => {
        if (!best) return e;
        return new Date(e.updatedAt) > new Date(best.updatedAt) ? e : best;
      },
      null,
    );

    return { dominantStatus, entries: merged, activeCount, latestEntry };
  }, [agentEntries, logMatches]);
}
