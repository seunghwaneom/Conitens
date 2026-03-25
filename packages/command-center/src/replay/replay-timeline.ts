/**
 * replay-timeline.ts — Structured replay timeline data model.
 *
 * Sub-AC 9a: Organises TypedReplayEvent arrays (produced by EventLogParser)
 * into a navigable, indexed, queryable data structure for consumption by the
 * 3D replay engine, the ReplayControlPanel component, and the
 * state-reconstruction engine.
 *
 * Why a separate model?
 * ─────────────────────
 * ParseBatchResult is the raw output of a single JSONL file parse. A
 * ReplayTimeline is the *structured* representation of an ordered event stream
 * that may span multiple JSONL files (multiple days). It provides:
 *
 *   1. Guaranteed ascending sort order (tsMs ASC, seq ASC)
 *   2. Pre-computed metadata (start/end, duration, per-category counts)
 *   3. O(log n) binary-search methods for time-based navigation
 *   4. Convenience filters (by agent, category, domain)
 *   5. Multi-batch merging (events from consecutive .jsonl files)
 *
 * Design principles:
 *  - Immutable after construction: the events array is frozen and all
 *    computed fields are derived once at build time.
 *  - Record transparency: every source ParseBatchResult error is carried
 *    into TimelineMetadata.parseErrors so nothing is silently dropped.
 *  - Write-only semantics: the timeline never writes to any store or file.
 *  - Self-contained: no React, Zustand, or Node.js dependencies — usable
 *    in workers, tests, and server-side rendering without modification.
 *
 * Usage:
 * ```ts
 * import { EventLogParser } from "./event-log-parser.js";
 * import { buildTimeline, mergeTimelines } from "./replay-timeline.js";
 *
 * const parser = new EventLogParser();
 * const batch  = parser.parseJsonlText(fileContents);
 * const tl     = buildTimeline(batch);
 *
 * // Navigate
 * const atT = tl.getEventsUpTo(targetTsMs);
 * const range = tl.getEventsInRange(fromMs, toMs);
 * const agentEvs = tl.getAgentEvents("agent-42");
 *
 * // Multi-file merge
 * const combined = mergeTimelines([batch1, batch2, batch3]);
 * ```
 */

import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
  CommandReplayEvent,
  StateChangeReplayEvent,
  ParseError,
  ParseBatchResult,
  ReplayEventCategory,
} from "./event-log-schema.js";

// ── Timeline metadata ────────────────────────────────────────────────────────

/**
 * Computed summary statistics for a ReplayTimeline.
 *
 * All fields are derived from the event stream at construction time and are
 * immutable thereafter. This object is safe to share across React render
 * boundaries without causing spurious re-renders (reference stable).
 */
export interface TimelineMetadata {
  /**
   * ISO 8601 timestamp of the earliest event.
   * Empty string when the timeline contains no events.
   */
  firstEventTs: string;
  /**
   * ISO 8601 timestamp of the most recent event.
   * Empty string when the timeline contains no events.
   */
  lastEventTs: string;
  /** Unix timestamp (ms) of the earliest event. Infinity when empty. */
  firstEventTsMs: number;
  /** Unix timestamp (ms) of the most recent event. -Infinity when empty. */
  lastEventTsMs: number;
  /** Duration in milliseconds (lastEventTsMs − firstEventTsMs). 0 when empty. */
  durationMs: number;
  /** Total number of successfully parsed events in the timeline. */
  totalEvents: number;
  /** Event counts broken down by the three replay categories. */
  categoryCounts: Record<ReplayEventCategory, number>;
  /**
   * Event counts per event-type domain prefix (e.g. "task", "agent", "layout").
   * Keyed by the prefix before the first dot in the canonical type string.
   */
  domainCounts: Record<string, number>;
  /**
   * Number of unique agent IDs referenced in agent_lifecycle events.
   * Agents are identified by `AgentLifecycleReplayEvent.agentId`.
   */
  agentCount: number;
  /**
   * Number of unique run_id values observed across all events.
   * Enables per-session filtering in the replay engine.
   */
  runCount: number;
  /**
   * Number of JSONL lines that could not be parsed into TypedReplayEvent.
   * Accumulated from all ParseBatchResults merged into this timeline.
   */
  parseErrorCount: number;
  /**
   * All parse errors from source ParseBatchResults.
   * Preserved for transparency — operators can inspect exactly which lines
   * were skipped and why.
   */
  parseErrors: readonly ParseError[];
}

// ── ReplayTimeline ───────────────────────────────────────────────────────────

/**
 * A structured, queryable timeline of typed replay events.
 *
 * Instantiate via `buildTimeline(batchResult)` or
 * `mergeTimelines([batch1, batch2, ...])` — do not use `new ReplayTimeline()`
 * directly. The constructor is intentionally not exported.
 *
 * All events are stored in ascending order: tsMs ASC, then seq ASC for
 * tie-breaking. This matches the physical order in .conitens/events/*.jsonl
 * files (assuming the EventLog appends in wall-clock order), so a single-file
 * parse never requires re-sorting.
 */
export class ReplayTimeline {
  /**
   * All events in ascending chronological order (tsMs ASC, seq ASC).
   * The array is frozen at construction time; do not mutate its contents.
   */
  readonly events: readonly TypedReplayEvent[];

  /**
   * Pre-computed timeline summary statistics.
   * Stable reference — safe for memo equality checks.
   */
  readonly metadata: TimelineMetadata;

  /** @internal — Use buildTimeline() or mergeTimelines() instead. */
  constructor(
    events: readonly TypedReplayEvent[],
    metadata: TimelineMetadata,
  ) {
    this.events = events;
    this.metadata = metadata;
  }

  // ── Time-range queries (O(log n)) ─────────────────────────────────────────

  /**
   * Return all events whose `tsMs` is **less than or equal to** `targetTsMs`.
   *
   * Uses binary search — O(log n) — to locate the split point. Suitable for
   * real-time playback: call once per animation frame with the current
   * playhead position.
   *
   * @param targetTsMs - Target timestamp in Unix milliseconds (inclusive)
   * @returns New array of events (never mutates `this.events`)
   */
  getEventsUpTo(targetTsMs: number): TypedReplayEvent[] {
    const splitIdx = this._upperBoundByTs(targetTsMs);
    return this.events.slice(0, splitIdx) as TypedReplayEvent[];
  }

  /**
   * Return all events whose `tsMs` falls within `[fromTsMs, toTsMs]` (both
   * ends inclusive).
   *
   * Performs two binary searches — O(log n). Useful for windowed analysis
   * (e.g. "what happened in the last 10 seconds of the replay?").
   *
   * @param fromTsMs - Start of range (Unix ms, inclusive)
   * @param toTsMs   - End of range (Unix ms, inclusive)
   * @returns New array of events in the range
   */
  getEventsInRange(fromTsMs: number, toTsMs: number): TypedReplayEvent[] {
    if (fromTsMs > toTsMs) return [];
    const startIdx = this._lowerBoundByTs(fromTsMs);
    const endIdx   = this._upperBoundByTs(toTsMs);
    return this.events.slice(startIdx, endIdx) as TypedReplayEvent[];
  }

  /**
   * Find the index of the first event with `tsMs` **greater than** `targetTsMs`.
   *
   * This is the "upper bound" in sorted-array terminology. The returned index
   * is suitable as the exclusive end of a slice:
   *   `events.slice(0, findInsertionIndex(t))` === `getEventsUpTo(t)`
   *
   * Returns `0` when all events are after `targetTsMs`.
   * Returns `events.length` when all events are at or before `targetTsMs`.
   *
   * @param targetTsMs - Target timestamp in Unix milliseconds
   * @returns Zero-based insertion index (0 ≤ index ≤ events.length)
   */
  findInsertionIndex(targetTsMs: number): number {
    return this._upperBoundByTs(targetTsMs);
  }

  // ── Category / domain / agent filters ─────────────────────────────────────

  /**
   * Return all `agent_lifecycle` events, optionally scoped to a single agent.
   *
   * @param agentId - Optional filter: only return events for this agent ID
   * @returns New array of AgentLifecycleReplayEvent
   */
  getAgentEvents(agentId?: string): AgentLifecycleReplayEvent[] {
    const evs = this.events.filter(
      (e): e is AgentLifecycleReplayEvent => e.replayCategory === "agent_lifecycle",
    );
    if (agentId === undefined) return evs;
    return evs.filter((e) => e.agentId === agentId);
  }

  /**
   * Return all `command` category events (command.* and pipeline.* events).
   *
   * @param commandId  - Optional: only return events with this commandId
   * @param pipelineId - Optional: only return events with this pipelineId
   * @returns New array of CommandReplayEvent
   */
  getCommandEvents(commandId?: string, pipelineId?: string): CommandReplayEvent[] {
    const evs = this.events.filter(
      (e): e is CommandReplayEvent => e.replayCategory === "command",
    );
    if (commandId !== undefined) {
      return evs.filter((e) => e.commandId === commandId);
    }
    if (pipelineId !== undefined) {
      return evs.filter((e) => e.pipelineId === pipelineId);
    }
    return evs;
  }

  /**
   * Return all `state_change` events, optionally scoped to a domain prefix.
   *
   * @param domain - Optional: only return events whose type starts with this
   *                 domain prefix (e.g. "task", "layout", "meeting")
   * @returns New array of StateChangeReplayEvent
   */
  getDomainEvents(domain?: string): StateChangeReplayEvent[] {
    const evs = this.events.filter(
      (e): e is StateChangeReplayEvent => e.replayCategory === "state_change",
    );
    if (domain === undefined) return evs;
    return evs.filter((e) => e.domain === domain);
  }

  /**
   * Return all events for a specific run_id.
   *
   * Multi-run timelines (merged from several .jsonl files spanning multiple
   * orchestration sessions) may contain events from distinct runs. This
   * helper isolates a single session.
   *
   * @param runId - The orchestration run_id to filter by
   * @returns New array of TypedReplayEvent
   */
  getRunEvents(runId: string): TypedReplayEvent[] {
    return this.events.filter((e) => e.run_id === runId) as TypedReplayEvent[];
  }

  /**
   * Return the unique set of agent IDs referenced in this timeline.
   * Ordered by first appearance in the event stream.
   */
  getAgentIds(): string[] {
    const seen = new Map<string, number>(); // agentId → first-appearance tsMs
    for (const ev of this.events) {
      if (ev.replayCategory === "agent_lifecycle") {
        const id = (ev as AgentLifecycleReplayEvent).agentId;
        if (!seen.has(id)) seen.set(id, ev.tsMs);
      }
    }
    return [...seen.keys()];
  }

  /**
   * Return the unique set of run_ids referenced in this timeline.
   * Ordered by first appearance.
   */
  getRunIds(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const ev of this.events) {
      if (ev.run_id && !seen.has(ev.run_id)) {
        seen.add(ev.run_id);
        result.push(ev.run_id);
      }
    }
    return result;
  }

  /**
   * Check whether this timeline contains any events.
   * Convenience alias for `metadata.totalEvents === 0`.
   */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  // ── Binary search helpers ─────────────────────────────────────────────────

  /**
   * Lower bound: index of the first event with `tsMs >= target`.
   * Returns `events.length` when all events are before `target`.
   */
  private _lowerBoundByTs(target: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.events[mid].tsMs < target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Upper bound: index of the first event with `tsMs > target`.
   * Returns `0` when all events are after `target`.
   * Returns `events.length` when all events are at or before `target`.
   */
  private _upperBoundByTs(target: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.events[mid].tsMs <= target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Sort events in place: tsMs ASC, then seq ASC for tie-breaking.
 * Stable sort (ES2019+).
 */
function sortEvents(events: TypedReplayEvent[]): TypedReplayEvent[] {
  return events.sort((a, b) => {
    const dt = a.tsMs - b.tsMs;
    return dt !== 0 ? dt : a.seq - b.seq;
  });
}

/**
 * Extract the domain prefix from an event type string.
 * "task.created" → "task", "layout.node.moved" → "layout"
 */
function extractDomain(type: string): string {
  return type.split(".")[0] ?? type;
}

/**
 * Compute TimelineMetadata from a sorted events array and accumulated errors.
 */
function computeMetadata(
  events: readonly TypedReplayEvent[],
  allErrors: ParseError[],
): TimelineMetadata {
  const categoryCounts: Record<ReplayEventCategory, number> = {
    agent_lifecycle: 0,
    command: 0,
    state_change: 0,
  };
  const domainCounts: Record<string, number> = {};
  const agentIds = new Set<string>();
  const runIds   = new Set<string>();

  let firstTsMs = Infinity;
  let lastTsMs  = -Infinity;

  for (const ev of events) {
    categoryCounts[ev.replayCategory]++;

    const domain = extractDomain(ev.type);
    domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;

    if (ev.replayCategory === "agent_lifecycle") {
      agentIds.add((ev as AgentLifecycleReplayEvent).agentId);
    }
    if (ev.run_id) runIds.add(ev.run_id);

    if (ev.tsMs < firstTsMs) firstTsMs = ev.tsMs;
    if (ev.tsMs > lastTsMs)  lastTsMs  = ev.tsMs;
  }

  const hasEvents = events.length > 0;

  return {
    firstEventTs:     hasEvents ? (events[0].ts)                    : "",
    lastEventTs:      hasEvents ? (events[events.length - 1].ts)    : "",
    firstEventTsMs:   hasEvents ? firstTsMs                         : Infinity,
    lastEventTsMs:    hasEvents ? lastTsMs                          : -Infinity,
    durationMs:       hasEvents ? Math.max(0, lastTsMs - firstTsMs) : 0,
    totalEvents:      events.length,
    categoryCounts,
    domainCounts,
    agentCount:       agentIds.size,
    runCount:         runIds.size,
    parseErrorCount:  allErrors.length,
    parseErrors:      Object.freeze([...allErrors]),
  };
}

// ── Public factories ─────────────────────────────────────────────────────────

/**
 * Build a ReplayTimeline from a single ParseBatchResult.
 *
 * Events are sorted into chronological order (tsMs ASC, seq ASC) before
 * being stored. The sort is stable, so events sharing the same millisecond
 * retain their original sequence order.
 *
 * @param batchResult - Output of EventLogParser.parseJsonlText() or parseLines()
 * @returns Immutable ReplayTimeline ready for replay queries
 *
 * @example
 * ```ts
 * const parser = new EventLogParser();
 * const batch  = parser.parseJsonlText(jsonlFileContents);
 * const tl     = buildTimeline(batch);
 *
 * console.log(`${tl.metadata.totalEvents} events over ${tl.metadata.durationMs}ms`);
 * const snapshot = tl.getEventsUpTo(playheadTs);
 * ```
 */
export function buildTimeline(batchResult: ParseBatchResult): ReplayTimeline {
  // Sort a copy so we never mutate the batchResult's array
  const sorted = sortEvents([...batchResult.events]);
  const meta   = computeMetadata(sorted, [...batchResult.errors]);
  return new ReplayTimeline(Object.freeze(sorted), meta);
}

/**
 * Merge multiple ParseBatchResults into a single chronological ReplayTimeline.
 *
 * Intended for multi-day event logs where each .jsonl file is parsed
 * separately and then unified before replay.
 *
 * Duplicate events (same event_id) are **not** deduplicated — the caller is
 * responsible for ensuring each file is supplied at most once.
 *
 * @param batches - Ordered array of ParseBatchResults (any order; will be sorted)
 * @returns Single merged ReplayTimeline with all events in chronological order
 *
 * @example
 * ```ts
 * const parser = new EventLogParser();
 * const [b1, b2] = await Promise.all([
 *   readFile("2026-03-23.jsonl").then(t => parser.parseJsonlText(t)),
 *   readFile("2026-03-24.jsonl").then(t => parser.parseJsonlText(t)),
 * ]);
 * const tl = mergeTimelines([b1, b2]);
 * ```
 */
export function mergeTimelines(batches: ParseBatchResult[]): ReplayTimeline {
  if (batches.length === 0) {
    const empty: ParseBatchResult = {
      events: [],
      errors: [],
      totalLines: 0,
      parsedCount: 0,
      errorCount: 0,
      firstEventTsMs: Infinity,
      lastEventTsMs: -Infinity,
      categoryCounts: { agent_lifecycle: 0, command: 0, state_change: 0 },
    };
    return buildTimeline(empty);
  }
  if (batches.length === 1) {
    // Fast path: no merge needed
    return buildTimeline(batches[0]);
  }

  // Concatenate all events and errors across batches
  const allEvents: TypedReplayEvent[] = [];
  const allErrors: ParseError[]       = [];

  for (const batch of batches) {
    allEvents.push(...batch.events);
    allErrors.push(...batch.errors);
  }

  // Sort the merged set
  const sorted = sortEvents(allEvents);
  const meta   = computeMetadata(sorted, allErrors);
  return new ReplayTimeline(Object.freeze(sorted), meta);
}

/**
 * Build an empty ReplayTimeline (no events, no errors).
 *
 * Useful as the initial value in Zustand stores and React state before
 * the first log file has been loaded.
 */
export function emptyTimeline(): ReplayTimeline {
  const meta: TimelineMetadata = {
    firstEventTs:   "",
    lastEventTs:    "",
    firstEventTsMs: Infinity,
    lastEventTsMs:  -Infinity,
    durationMs:     0,
    totalEvents:    0,
    categoryCounts: { agent_lifecycle: 0, command: 0, state_change: 0 },
    domainCounts:   {},
    agentCount:     0,
    runCount:       0,
    parseErrorCount: 0,
    parseErrors:    Object.freeze([]),
  };
  return new ReplayTimeline(Object.freeze([]), meta);
}
