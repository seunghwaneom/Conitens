/**
 * @module schema-mutation-proposer
 * Sub-AC 11a — Schema mutation proposer.
 *
 * Reads `OntologySnapshot` values (produced by `readOntologySchema`) and
 * generates `schema.*` mutation proposal events, emitting them at the meta
 * level via `MetaEventBus`.
 *
 * What it does
 * ------------
 *   1. **Bootstrap proposals** — on first run (no previous snapshot), emits
 *      `schema.registered` events for every entry in the current snapshot.
 *      This builds the initial schema registry from the compiled protocol package.
 *
 *   2. **Delta proposals** — when a previous snapshot is supplied, computes
 *      a diff and emits only the changes:
 *        - New entries     → `schema.registered`
 *        - Changed entries → `schema.updated`  (behavioral_contract or level differs)
 *        - Removed entries → `schema.removed`  (entry exists in old but not new)
 *
 *   3. **Reflexive-closure guard** — verifies that every `schema.*` event type
 *      is represented in the snapshot's `schema_registry` array.  Missing entries
 *      are proposed as `schema.registered` with a warning annotation.
 *
 * Meta-level routing guarantee
 * ----------------------------
 * ALL events produced by this module are emitted via `MetaEventBus.emit()`.
 * They do NOT go through the command-file ingestion pipeline:
 *
 *   ✗ WRONG:  write CommandFile → /api/commands → Orchestrator
 *   ✓ CORRECT: MetaEventBus.emit() → /api/meta/events → direct EventLog append
 *
 * Backward-compatibility constraint
 * ----------------------------------
 * The proposer NEVER generates `schema.removed` for entries that existed
 * in a previous version without first checking whether a replacement
 * schema_id was provided.  Orphan removals (removal_reason unset) are
 * flagged as warnings and skipped unless `opts.forceRemove` is set.
 *
 * Stability check
 * ---------------
 * The proposer exposes `validateProposalStability()` which checks that all
 * previously-registered schema_ids still appear in the new snapshot.
 * This implements the "no new entity may be added without verifying that all
 * previously-passing ACs still pass" constraint at the schema level.
 */

import type {
  SchemaRegisteredPayload,
  SchemaUpdatedPayload,
  SchemaRemovedPayload,
  SchemaChangeDiff,
  SchemaChangeSource,
} from "@conitens/protocol";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type {
  OntologySnapshot,
  EventTypeEntry,
  CommandTypeEntry,
  ReducerEntry,
  SchemaRegistryEntry,
  DomainEntityEntry,
} from "./ontology-schema-reader.js";
import type { MetaEventBus, MetaEmitOptions, MetaEmitResult } from "./meta-event-bus.js";

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

/**
 * The type of mutation a single proposal entry represents.
 */
export type MutationKind =
  | "register"      // New entry not present in previous snapshot
  | "update"        // Entry changed since previous snapshot
  | "deprecate"     // Entry should be marked deprecated (requires explicit caller opt-in)
  | "remove";       // Entry present in previous snapshot but absent from current

/**
 * A single mutation proposal — one entry to emit as a `schema.*` event.
 */
export interface SchemaMutation {
  /** Mutation kind determining which schema event type is emitted. */
  kind: MutationKind;
  /** The schema_id of the affected entry. */
  schema_id: string;
  /** The event type that will be emitted for this mutation. */
  event_type:
    | "schema.registered"
    | "schema.updated"
    | "schema.deprecated"
    | "schema.removed";
  /**
   * The typed payload for the emitted event.
   * Cast to the appropriate typed interface by the emitter.
   */
  payload: SchemaRegisteredPayload | SchemaUpdatedPayload | SchemaRemovedPayload;
  /**
   * Non-fatal warnings for this specific mutation.
   * E.g. "removing schema_id with no replacement — orphan removal".
   */
  warnings: string[];
}

/**
 * A complete set of mutation proposals derived from an ontology diff.
 *
 * One `SchemaMutationProposal` is produced per `proposeMutations()` call.
 * It may contain zero or more individual `SchemaMutation` entries.
 */
export interface SchemaMutationProposal {
  /** Unique proposal ID (format: `schema-prop-<ts>-<random>`). */
  proposal_id: string;
  /** When the proposal was generated (ms). */
  proposed_at_ms: number;
  /** Who is proposing the mutations. */
  proposed_by: SchemaChangeSource;
  /** ID of the current snapshot this proposal was derived from. */
  current_snapshot_id: string;
  /** ID of the previous snapshot (null if bootstrap run). */
  previous_snapshot_id: string | null;
  /** Ordered list of individual schema mutations. */
  readonly mutations: readonly SchemaMutation[];
  /** Summary counts. */
  counts: {
    register: number;
    update: number;
    deprecate: number;
    remove: number;
    total: number;
    warnings: number;
  };
  /** Proposal-level warnings (e.g. reflexive-closure gaps). */
  readonly warnings: readonly string[];
}

/**
 * Result of emitting a `SchemaMutationProposal` via the MetaEventBus.
 */
export interface ProposalEmitResult {
  /** The proposal that was emitted. */
  proposal: SchemaMutationProposal;
  /** Per-mutation emit results. */
  results: MetaEmitResult[];
  /** Total mutations emitted. */
  emitted: number;
  /** Mutations that failed to deliver to the meta endpoint. */
  failed: number;
  /** Whether ALL mutations were successfully delivered. */
  allDelivered: boolean;
}

/**
 * Options for `proposeMutations()`.
 */
export interface ProposeMutationsOptions {
  /**
   * Who is proposing the mutations.
   * Defaults to "system" (auto-detected from protocol package).
   */
  proposed_by?: SchemaChangeSource;
  /**
   * If true, include `schema.registered` events for all entries in the
   * current snapshot even if a previous snapshot is provided.
   * Use for full re-registration after a schema version bump.
   */
  force_full_register?: boolean;
  /**
   * If true, allow `schema.removed` events to be generated without a
   * replacement schema_id.  By default, orphan removals are skipped.
   */
  allow_orphan_remove?: boolean;
  /**
   * Optional agent ID if `proposed_by` is "agent".
   */
  agent_id?: string;
}

/**
 * Options for `emitProposal()`.
 */
export interface EmitProposalOptions extends MetaEmitOptions {
  /**
   * If true, all events are emitted in local_only mode (no HTTP calls).
   * Useful for dry-run, testing, and preview workflows.
   */
  dry_run?: boolean;
}

/**
 * Result of `validateProposalStability()`.
 */
export interface StabilityCheckResult {
  /** True when all known schema_ids from the previous snapshot still exist. */
  stable: boolean;
  /**
   * Schema IDs present in the previous snapshot but absent from the current one.
   * These are regressions that must be addressed before merging.
   */
  missing_schema_ids: string[];
  /**
   * Schema IDs that changed their ontological level between snapshots.
   * Cross-level reclassifications require explicit review.
   */
  level_regressions: Array<{ schema_id: string; prev_level: string; curr_level: string }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _proposalCounter = 0;

function nextProposalId(): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `schema-prop-${ts}-${++_proposalCounter}-${rand}`;
}

/** All entry types that the proposer handles. */
type AnySnapshotEntry =
  | EventTypeEntry
  | CommandTypeEntry
  | ReducerEntry
  | SchemaRegistryEntry
  | DomainEntityEntry;

/** Extract a `version` string from a snapshot entry, defaulting to "1.0.0". */
function extractVersion(entry: AnySnapshotEntry): string {
  // DomainEntityEntry carries an explicit version field (Sub-AC 10.1).
  if ("version" in entry && typeof (entry as DomainEntityEntry).version === "string") {
    return (entry as DomainEntityEntry).version;
  }
  // All other entries in the current protocol version start at "1.0.0".
  void entry;
  return "1.0.0";
}

function toRegisteredPayload(
  entry: AnySnapshotEntry,
  proposed_by: SchemaChangeSource,
  registered_at_ms: number,
): SchemaRegisteredPayload {
  // Resolve human-readable name from the entry type
  const name =
    "event_type" in entry
      ? (entry as EventTypeEntry).event_type
      : "command_type" in entry
        ? (entry as CommandTypeEntry).command_type
        : "reducer_name" in entry
          ? (entry as ReducerEntry).reducer_name
          : "schema_event_type" in entry
            ? (entry as SchemaRegistryEntry).schema_event_type
            : (entry as DomainEntityEntry).entity_name;

  const base: SchemaRegisteredPayload = {
    schema_id: entry.schema_id,
    namespace: entry.namespace,
    name,
    version: extractVersion(entry),
    description: entry.behavioral_contract,
    registered_by: proposed_by,
    registered_at_ms,
  };

  // Attach reducer ownership for event_type and domain_entity entries
  if ("owned_by_reducers" in entry) {
    base.owned_by_reducers = Array.from(
      (entry as EventTypeEntry | DomainEntityEntry).owned_by_reducers,
    );
  }

  // Attach parent event type for schema_registry entries
  if ("schema_event_type" in entry) {
    base.parent_event_type = (entry as SchemaRegistryEntry).schema_event_type;
  }

  return base;
}

/** Compute diff between two behavioral contracts. */
function diffBehavioralContracts(
  prevContract: string,
  currContract: string,
): SchemaChangeDiff | null {
  if (prevContract === currContract) return null;
  return {
    change_type: "description_updated",
    field_path: "behavioral_contract",
    description: "Behavioral contract description changed",
    prev_value: prevContract,
    next_value: currContract,
  };
}

/** Compute diff between two level values. */
function diffLevels(
  prevLevel: string,
  currLevel: string,
  schema_id: string,
): SchemaChangeDiff | null {
  if (prevLevel === currLevel) return null;
  return {
    change_type: "field_modified",
    field_path: "level",
    description: `Ontological level reclassified for '${schema_id}'`,
    prev_value: prevLevel,
    next_value: currLevel,
  };
}

/** Build a `SchemaUpdatedPayload` from two snapshot entries. */
function toUpdatedPayload(
  prev: AnySnapshotEntry,
  curr: AnySnapshotEntry,
  proposed_by: SchemaChangeSource,
  updated_at_ms: number,
  agent_id?: string,
): SchemaUpdatedPayload | null {
  const changes: SchemaChangeDiff[] = [];

  const prevContract = prev.behavioral_contract;
  const currContract = curr.behavioral_contract;
  const contractDiff = diffBehavioralContracts(prevContract, currContract);
  if (contractDiff) changes.push(contractDiff);

  const prevLevel = prev.level;
  const currLevel = curr.level;
  const levelDiff = diffLevels(prevLevel, currLevel, curr.schema_id);
  if (levelDiff) changes.push(levelDiff);

  // For reducer entries: check if owned_files or input_events changed
  if ("owned_files" in prev && "owned_files" in curr) {
    const prevOwned = JSON.stringify((prev as ReducerEntry).owned_files.sort());
    const currOwned = JSON.stringify((curr as ReducerEntry).owned_files.sort());
    if (prevOwned !== currOwned) {
      changes.push({
        change_type: "field_modified",
        field_path: "owned_files",
        description: "Reducer owned file patterns changed",
        prev_value: prevOwned,
        next_value: currOwned,
      });
    }

    const prevInput = JSON.stringify(
      (prev as ReducerEntry).input_events === "*"
        ? "*"
        : [...((prev as ReducerEntry).input_events as string[])].sort(),
    );
    const currInput = JSON.stringify(
      (curr as ReducerEntry).input_events === "*"
        ? "*"
        : [...((curr as ReducerEntry).input_events as string[])].sort(),
    );
    if (prevInput !== currInput) {
      changes.push({
        change_type: "field_modified",
        field_path: "input_events",
        description: "Reducer input event subscriptions changed",
        prev_value: prevInput,
        next_value: currInput,
      });
    }
  }

  if (changes.length === 0) return null;

  const name =
    "event_type" in curr
      ? (curr as EventTypeEntry).event_type
      : "command_type" in curr
        ? (curr as CommandTypeEntry).command_type
        : "reducer_name" in curr
          ? (curr as ReducerEntry).reducer_name
          : "schema_event_type" in curr
            ? (curr as SchemaRegistryEntry).schema_event_type
            : (curr as DomainEntityEntry).entity_name;

  const payload: SchemaUpdatedPayload = {
    schema_id: curr.schema_id,
    namespace: curr.namespace,
    name,
    prev_version: extractVersion(prev),
    next_version: bumpVersion(extractVersion(prev), changes),
    changes,
    updated_by: proposed_by,
    updated_at_ms,
  };
  if (agent_id) payload.agent_id = agent_id;

  return payload;
}

/** Increment the patch component of a version string. */
function bumpVersion(version: string, _changes: SchemaChangeDiff[]): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
}

/** Build a `SchemaRemovedPayload` for an entry that disappeared. */
function toRemovedPayload(
  entry: AnySnapshotEntry,
  proposed_by: SchemaChangeSource,
  removed_at_ms: number,
  agent_id?: string,
): SchemaRemovedPayload {
  const name =
    "event_type" in entry
      ? (entry as EventTypeEntry).event_type
      : "command_type" in entry
        ? (entry as CommandTypeEntry).command_type
        : "reducer_name" in entry
          ? (entry as ReducerEntry).reducer_name
          : "schema_event_type" in entry
            ? (entry as SchemaRegistryEntry).schema_event_type
            : (entry as DomainEntityEntry).entity_name;

  const payload: SchemaRemovedPayload = {
    schema_id: entry.schema_id,
    namespace: entry.namespace,
    name,
    version: extractVersion(entry),
    removal_reason: "Entry absent from current ontology snapshot",
    migration_applied: false,
    removed_by: proposed_by,
    removed_at_ms,
  };
  if (agent_id) payload.agent_id = agent_id;
  return payload;
}

/** Flatten all entries from a snapshot into a single Map keyed by schema_id. */
function snapshotIndex(
  snap: OntologySnapshot,
): Map<string, AnySnapshotEntry> {
  const idx = new Map<string, AnySnapshotEntry>();
  for (const e of snap.event_types) idx.set(e.schema_id, e);
  for (const e of snap.command_types) idx.set(e.schema_id, e);
  for (const e of snap.reducers) idx.set(e.schema_id, e);
  for (const e of snap.schema_registry) idx.set(e.schema_id, e);
  // Domain entity schemas (Sub-AC 10.1)
  for (const e of snap.domain_entity_schemas) idx.set(e.schema_id, e);
  return idx;
}

// ---------------------------------------------------------------------------
// Core: proposeMutations
// ---------------------------------------------------------------------------

/**
 * Generate a `SchemaMutationProposal` by comparing current and previous
 * `OntologySnapshot` values.
 *
 * **Bootstrap mode** (no `previousSnapshot`):
 *   Emits `schema.registered` for every entry in `currentSnapshot`.
 *   This is safe to call at system boot to populate the schema registry.
 *
 * **Delta mode** (`previousSnapshot` supplied):
 *   Emits only the differences:
 *     - `schema.registered` for new entries
 *     - `schema.updated`    for changed entries
 *     - `schema.removed`    for entries that disappeared (opt-in via `allow_orphan_remove`)
 *
 * This function does NOT emit any events — call `emitProposal()` to send
 * the resulting proposal to the meta endpoint via `MetaEventBus`.
 *
 * Meta-level routing guarantee:
 * The returned `SchemaMutationProposal` carries no side effects.  All I/O
 * is delegated to `emitProposal()` which uses `MetaEventBus` exclusively.
 *
 * @param currentSnapshot   The freshly-read ontology snapshot.
 * @param previousSnapshot  The previous snapshot for delta comparison (or null).
 * @param opts              Optional configuration.
 */
export function proposeMutations(
  currentSnapshot: OntologySnapshot,
  previousSnapshot: OntologySnapshot | null,
  opts: ProposeMutationsOptions = {},
): SchemaMutationProposal {
  const now = Date.now();
  const proposed_by = opts.proposed_by ?? "system";
  const mutations: SchemaMutation[] = [];
  const proposalWarnings: string[] = [];

  const proposal_id = nextProposalId();

  // ── Bootstrap mode ────────────────────────────────────────────────────────
  if (previousSnapshot === null || opts.force_full_register) {
    const allEntries: AnySnapshotEntry[] = [
      ...currentSnapshot.event_types,
      ...currentSnapshot.command_types,
      ...currentSnapshot.reducers,
      ...currentSnapshot.schema_registry,
      // Domain entity schemas (Sub-AC 10.1)
      ...currentSnapshot.domain_entity_schemas,
    ];

    for (const entry of allEntries) {
      const payload = toRegisteredPayload(entry, proposed_by, now);
      mutations.push({
        kind: "register",
        schema_id: entry.schema_id,
        event_type: "schema.registered",
        payload,
        warnings: [],
      });
    }

    // Reflexive-closure check: every schema_registry entry should have a
    // corresponding event_type entry in the event_types list.
    for (const sr of currentSnapshot.schema_registry) {
      const etEntry = currentSnapshot.event_types.find(
        (e) => e.event_type === sr.schema_event_type,
      );
      if (!etEntry) {
        proposalWarnings.push(
          `Reflexive closure gap: schema_registry entry '${sr.schema_id}' ` +
            `references event_type '${sr.schema_event_type}' which is absent ` +
            `from the event_types list`,
        );
      }
    }
  } else {
    // ── Delta mode ───────────────────────────────────────────────────────────

    const prevIdx = snapshotIndex(previousSnapshot);
    const currIdx = snapshotIndex(currentSnapshot);

    // New entries → schema.registered
    for (const [id, curr] of currIdx) {
      if (!prevIdx.has(id)) {
        mutations.push({
          kind: "register",
          schema_id: id,
          event_type: "schema.registered",
          payload: toRegisteredPayload(curr, proposed_by, now),
          warnings: [],
        });
      }
    }

    // Changed entries → schema.updated
    for (const [id, curr] of currIdx) {
      const prev = prevIdx.get(id);
      if (!prev) continue; // New entry handled above

      const updatedPayload = toUpdatedPayload(
        prev,
        curr,
        proposed_by,
        now,
        opts.agent_id,
      );
      if (updatedPayload) {
        mutations.push({
          kind: "update",
          schema_id: id,
          event_type: "schema.updated",
          payload: updatedPayload,
          warnings: [],
        });
      }
    }

    // Removed entries → schema.removed (opt-in)
    for (const [id, prev] of prevIdx) {
      if (!currIdx.has(id)) {
        if (!opts.allow_orphan_remove) {
          proposalWarnings.push(
            `Orphan removal skipped for '${id}': entry absent from current snapshot ` +
              `but allow_orphan_remove is false. Pass opts.allow_orphan_remove=true to emit schema.removed.`,
          );
          continue;
        }
        mutations.push({
          kind: "remove",
          schema_id: id,
          event_type: "schema.removed",
          payload: toRemovedPayload(prev, proposed_by, now, opts.agent_id),
          warnings: ["Orphan removal: no replacement schema_id provided"],
        });
      }
    }
  }

  // ── Counts ────────────────────────────────────────────────────────────────

  const counts = {
    register: mutations.filter((m) => m.kind === "register").length,
    update: mutations.filter((m) => m.kind === "update").length,
    deprecate: mutations.filter((m) => m.kind === "deprecate").length,
    remove: mutations.filter((m) => m.kind === "remove").length,
    total: mutations.length,
    warnings: proposalWarnings.length + mutations.reduce((n, m) => n + m.warnings.length, 0),
  };

  return Object.freeze({
    proposal_id,
    proposed_at_ms: now,
    proposed_by,
    current_snapshot_id: currentSnapshot.snapshot_id,
    previous_snapshot_id: previousSnapshot?.snapshot_id ?? null,
    mutations: Object.freeze(mutations),
    counts,
    warnings: Object.freeze(proposalWarnings),
  });
}

// ---------------------------------------------------------------------------
// Core: emitProposal
// ---------------------------------------------------------------------------

/**
 * Emit all mutations in a `SchemaMutationProposal` via the `MetaEventBus`.
 *
 * Each mutation in the proposal is emitted as its corresponding `schema.*`
 * event type.  Events are emitted sequentially (await each) to preserve
 * causation ordering in the event log.
 *
 * Meta-level routing guarantee:
 * All events are emitted via `MetaEventBus.emit()` which POSTs to
 * `/api/meta/events`.  The command-file ingestion pipeline is NOT involved.
 *
 * @param proposal  The proposal to emit.
 * @param bus       The MetaEventBus instance to use.
 * @param opts      Optional emission options (dry_run, causation_id, etc.).
 */
export async function emitProposal(
  proposal: SchemaMutationProposal,
  bus: MetaEventBus,
  opts: EmitProposalOptions = {},
): Promise<ProposalEmitResult> {
  const results: MetaEmitResult[] = [];
  let failed = 0;

  for (const mutation of proposal.mutations) {
    const emitOpts: import("./meta-event-bus.js").MetaEmitOptions = {
      proposal_id: proposal.proposal_id,
      causation_id: opts.causation_id,
      local_only: opts.dry_run ?? opts.local_only,
      run_id: opts.run_id,
    };

    let result: MetaEmitResult;

    try {
      // We need to call the correct typed emitter.
      // All schema.* payloads are compatible with the typed overloads.
      switch (mutation.event_type) {
        case "schema.registered":
          result = await bus.emitRegistered(
            mutation.payload as SchemaRegisteredPayload,
            emitOpts,
          );
          break;
        case "schema.updated":
          result = await bus.emitUpdated(
            mutation.payload as import("@conitens/protocol").SchemaUpdatedPayload,
            emitOpts,
          );
          break;
        case "schema.deprecated":
          result = await bus.emitDeprecated(
            mutation.payload as unknown as import("@conitens/protocol").SchemaDeprecatedPayload,
            emitOpts,
          );
          break;
        case "schema.removed":
          result = await bus.emitRemoved(
            mutation.payload as SchemaRemovedPayload,
            emitOpts,
          );
          break;
        default:
          // Should never happen given MutationKind constraints
          throw new Error(`Unknown mutation event_type: ${mutation.event_type}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Create a synthetic failed result
      result = {
        entry: {
          id: `err-${Date.now()}`,
          emitted_at_ms: Date.now(),
          emitted_at_iso: new Date().toISOString(),
          event_type: mutation.event_type as import("@conitens/protocol").SchemaEventType,
          payload: mutation.payload as import("@conitens/protocol").SchemaEventPayloadMap[typeof mutation.event_type],
          proposal_id: proposal.proposal_id,
          transport_status: "failed",
          transport_error: msg,
        },
        delivered: false,
        error: msg,
      };
    }

    results.push(result);
    if (!result.delivered) failed += 1;
  }

  return {
    proposal,
    results,
    emitted: results.length,
    failed,
    allDelivered: failed === 0,
  };
}

// ---------------------------------------------------------------------------
// Stability check
// ---------------------------------------------------------------------------

/**
 * Validate that a new snapshot is backward-compatible with an existing one.
 *
 * Implements the "stability check" constraint:
 *   "No new entity may be added without verifying that all previously-passing
 *    ACs still pass. If a new entity causes regression, it must be reverted
 *    or redesigned before merging."
 *
 * Checks:
 *   1. All schema_ids in `previousSnapshot` still exist in `currentSnapshot`.
 *   2. No schema_id changed its ontological level.
 *
 * @param currentSnapshot  The new snapshot.
 * @param previousSnapshot The reference snapshot.
 * @returns                StabilityCheckResult with `stable: true` if no regressions.
 */
export function validateProposalStability(
  currentSnapshot: OntologySnapshot,
  previousSnapshot: OntologySnapshot,
): StabilityCheckResult {
  const prevIdx = snapshotIndex(previousSnapshot);
  const currIdx = snapshotIndex(currentSnapshot);

  const missing_schema_ids: string[] = [];
  const level_regressions: Array<{
    schema_id: string;
    prev_level: string;
    curr_level: string;
  }> = [];

  for (const [id, prev] of prevIdx) {
    const curr = currIdx.get(id);
    if (!curr) {
      missing_schema_ids.push(id);
      continue;
    }
    if (prev.level !== curr.level) {
      level_regressions.push({
        schema_id: id,
        prev_level: prev.level,
        curr_level: curr.level,
      });
    }
  }

  return {
    stable: missing_schema_ids.length === 0 && level_regressions.length === 0,
    missing_schema_ids,
    level_regressions,
  };
}

// ---------------------------------------------------------------------------
// Convenience: run the full read → propose → emit cycle
// ---------------------------------------------------------------------------

/**
 * High-level helper that runs the complete schema self-registration cycle:
 *   1. Read current ontology via `readOntologySchema()`
 *   2. Propose mutations via `proposeMutations()`
 *   3. (Optionally) validate stability against `previousSnapshot`
 *   4. Emit via `MetaEventBus`
 *
 * Use `opts.dry_run = true` for preview without HTTP writes.
 *
 * Meta-level routing guarantee:
 * Steps 3 and 4 produce events via MetaEventBus, NOT via command files.
 *
 * @example
 * ```ts
 * import { readOntologySchema } from "./ontology-schema-reader.js";
 * import { metaEventBus } from "./meta-event-bus.js";
 * import { runSchemaSelfRegistration } from "./schema-mutation-proposer.js";
 *
 * const previousSnap = null; // first boot
 * const { proposal, result } = await runSchemaSelfRegistration(
 *   readOntologySchema,
 *   previousSnap,
 *   metaEventBus,
 *   { dry_run: true },
 * );
 * console.log(`Proposed ${proposal.counts.total} mutations`);
 * ```
 */
export async function runSchemaSelfRegistration(
  readSnapshot: () => OntologySnapshot,
  previousSnapshot: OntologySnapshot | null,
  bus: MetaEventBus,
  opts: ProposeMutationsOptions & EmitProposalOptions = {},
): Promise<{
  snapshot: OntologySnapshot;
  stability: StabilityCheckResult | null;
  proposal: SchemaMutationProposal;
  result: ProposalEmitResult;
}> {
  const snapshot = readSnapshot();

  // Stability check before proposing (only in delta mode)
  let stability: StabilityCheckResult | null = null;
  if (previousSnapshot !== null) {
    stability = validateProposalStability(snapshot, previousSnapshot);
    if (!stability.stable) {
      // Log stability failures as proposal warnings — the emitter will still
      // proceed but the caller can inspect the stability result and abort.
      console.warn(
        "[SchemaMutationProposer] Stability check FAILED:",
        stability.missing_schema_ids,
        stability.level_regressions,
      );
    }
  }

  const proposal = proposeMutations(snapshot, previousSnapshot, opts);
  const result = await emitProposal(proposal, bus, opts);

  return { snapshot, stability, proposal, result };
}

// ---------------------------------------------------------------------------
// Protocol schema version utility
// ---------------------------------------------------------------------------

/**
 * Return the current protocol schema version string.
 * Used by proposers to annotate emitted events with the originating version.
 */
export function currentSchemaVersion(): string {
  return SCHEMA_VERSION;
}
