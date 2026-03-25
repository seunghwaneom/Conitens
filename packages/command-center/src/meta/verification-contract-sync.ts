/**
 * @module verification-contract-sync
 * Sub-AC 11.4 — Verification-contract synchronization.
 *
 * The VerificationContractSyncer maintains a living `VerificationContract`
 * that is updated in lockstep with every applied structural mutation.
 *
 * ─── Purpose ─────────────────────────────────────────────────────────────────
 *
 * The `ontology_schema.verification_contract` is the authoritative list of
 * assertions the spec verifier must check.  When the ontology evolves (entities
 * are added, updated, deprecated, or removed), the contract must evolve with it
 * so that verification always targets the CURRENT schema state, not a historical
 * snapshot.
 *
 * Design constraint (from goal spec):
 *   "When ontology_schema mutates (entities merged, renamed, or restructured),
 *    the verification contract must be updated in the same generation.
 *    Spec verification checks the CURRENT ontology structure, not any historical
 *    one. The ontology_schema.verification_contract field is the authoritative
 *    list of what the verifier should look for."
 *
 * ─── Contract structure ───────────────────────────────────────────────────────
 *
 * A `VerificationContract` is a snapshot of the current set of testable
 * assertions about the ontology.  Each assertion is a `VerificationClause`
 * with a machine-readable `kind` field and a human-readable `label`.
 *
 * Clause kinds:
 *   entity_present    — schema_id must exist in the registry with "active" status
 *   entity_deprecated — schema_id must exist with "deprecated" status
 *   entity_absent     — schema_id must NOT be active (status = "removed" or absent)
 *   count_gte         — at least `expected_min_count` active entries in `namespace`
 *   schema_version_match — current SCHEMA_VERSION must equal `expected_version`
 *
 * ─── Synchronization rules ───────────────────────────────────────────────────
 *
 * Only structural mutations affect the contract:
 *
 *   schema.registered  → ADD   entity_present clause for new schema_id
 *                        UPDATE count_gte clause for its namespace (+1)
 *   schema.updated     → UPDATE entity_present clause (version bump note in label)
 *   schema.deprecated  → CHANGE entity_present → entity_deprecated for schema_id
 *                        UPDATE count_gte clause for its namespace (-1 active)
 *   schema.removed     → REMOVE entity_present/entity_deprecated clause
 *                        ADD    entity_absent clause for schema_id
 *                        UPDATE count_gte clause for its namespace (-1)
 *
 * Non-structural events (validation_started, validated, migration_started,
 * migrated) do NOT change the contract — they are tracking/lifecycle events
 * that record operational progress, not ontology changes.
 *
 * ─── Purity and immutability ─────────────────────────────────────────────────
 *
 * All sync operations are **pure**: they accept an existing VerificationContract
 * and return a new one.  The input contract is never mutated.
 *
 * ─── Derivation from OntologySnapshot ────────────────────────────────────────
 *
 * `deriveFromSnapshot()` produces the initial contract by treating every entry
 * in the snapshot as a registered, active schema entity.  This bootstraps the
 * contract after system start without requiring a full replay of schema events.
 *
 * ─── Meta-level routing guarantee ────────────────────────────────────────────
 *
 * This module has NO dependency on the command-file ingestion pipeline.
 * It reads mutation payloads directly and returns plain values.
 */

import type {
  SchemaEventType,
  SchemaNamespace,
  SchemaRegisteredPayload,
  SchemaUpdatedPayload,
  SchemaDeprecatedPayload,
  SchemaRemovedPayload,
} from "@conitens/protocol";
import { SCHEMA_VERSION, isValidSchemaPayload } from "@conitens/protocol";
import type { OntologySnapshot } from "./ontology-schema-reader.js";

// ---------------------------------------------------------------------------
// Clause types
// ---------------------------------------------------------------------------

/**
 * The kind of assertion a VerificationClause represents.
 *
 * - `entity_present`     — the schema_id MUST be in the registry with "active" status
 * - `entity_deprecated`  — the schema_id MUST be present with "deprecated" status
 * - `entity_absent`      — the schema_id must NOT be active (removed or absent)
 * - `count_gte`          — at least `expected_min_count` active entries in `namespace`
 * - `schema_version_match` — the system's SCHEMA_VERSION must equal `expected_version`
 */
export type VerificationClauseKind =
  | "entity_present"
  | "entity_deprecated"
  | "entity_absent"
  | "count_gte"
  | "schema_version_match";

/**
 * A single testable assertion in the VerificationContract.
 *
 * Clauses are keyed by `clause_id` (stable across generations) and carry
 * enough information for the verifier to check the assertion without additional
 * lookups.
 */
export interface VerificationClause {
  /**
   * Stable, unique identifier for this clause.
   *
   * Format varies by kind:
   *   entity_present / entity_deprecated / entity_absent → "entity:<schema_id>"
   *   count_gte      → "count:<namespace>"
   *   schema_version_match → "schema_version"
   */
  readonly clause_id: string;
  /** The kind of assertion this clause represents. */
  readonly kind: VerificationClauseKind;
  /**
   * The schema_id this clause targets.
   * Set for entity_present / entity_deprecated / entity_absent kinds.
   */
  readonly schema_id?: string;
  /**
   * The namespace this clause targets.
   * Set for count_gte kind; also provided for entity_* clauses for display.
   */
  readonly namespace?: SchemaNamespace;
  /**
   * For entity_present: the version string at the time this clause was created
   * or last updated via schema.updated.  Informational (verifier checks presence,
   * not exact version match).
   *
   * For schema_version_match: the required SCHEMA_VERSION string.
   */
  readonly expected_version?: string;
  /**
   * For count_gte: the minimum number of active entries that must be present
   * in `namespace`.
   */
  readonly expected_min_count?: number;
  /**
   * Human-readable label describing what this clause asserts.
   * Updated when the entity changes (e.g. version bump, deprecation reason).
   */
  readonly label: string;
  /**
   * The generation of the VerificationContract when this clause was first added.
   * Useful for debugging the evolution of the contract over time.
   */
  readonly introduced_at_generation: number;
  /**
   * The generation of the VerificationContract when this clause was last modified.
   */
  readonly last_updated_at_generation: number;
}

// ---------------------------------------------------------------------------
// VerificationContract
// ---------------------------------------------------------------------------

/**
 * The living VerificationContract — the authoritative list of assertions
 * the spec verifier must check at the current point in ontology evolution.
 *
 * A new contract value is produced on each structural mutation; the old value
 * is discarded.  Consumers that need historical contracts should record them
 * via the event log.
 */
export interface VerificationContract {
  /**
   * Unique identifier for this contract instance.
   * Format: `vc-<generation>-<timestamp_ms>`.
   */
  readonly contract_id: string;
  /**
   * The SCHEMA_VERSION string that was current when this contract was generated.
   */
  readonly schema_version: string;
  /**
   * Monotonically-increasing generation counter.
   * Starts at 0 (derived from snapshot) and increments by 1 for each
   * structural mutation that alters the clause set.
   *
   * Non-structural mutations (validation_started, validated, etc.) do NOT
   * increment the generation.
   */
  readonly generation: number;
  /** Wall-clock time (ms) when this contract instance was first produced. */
  readonly generated_at_ms: number;
  /**
   * Wall-clock time (ms) when the most recent structural mutation was applied.
   * Equals `generated_at_ms` for generation=0.
   */
  readonly last_mutated_at_ms: number;
  /**
   * The ordered, immutable set of assertions this contract specifies.
   *
   * Clauses are ordered:
   *   1. schema_version_match (always first)
   *   2. count_gte clauses (one per namespace, sorted alphabetically)
   *   3. entity_present clauses (sorted by schema_id)
   *   4. entity_deprecated clauses (sorted by schema_id)
   *   5. entity_absent clauses (sorted by schema_id)
   */
  readonly clauses: readonly VerificationClause[];
}

// ---------------------------------------------------------------------------
// Sync result
// ---------------------------------------------------------------------------

/**
 * Result returned by `VerificationContractSyncer.sync()`.
 *
 * Describes what changed in the contract as a result of processing one
 * structural schema mutation.
 */
export interface VerificationContractSyncResult {
  /** The new contract after applying the mutation. */
  readonly contract: VerificationContract;
  /**
   * Whether the contract actually changed as a result of this sync.
   * False for non-structural events (validation_started, etc.).
   */
  readonly changed: boolean;
  /** Number of new clauses added. */
  readonly clauses_added: number;
  /** Number of existing clauses updated (kind or label changed). */
  readonly clauses_updated: number;
  /** Number of clauses removed. */
  readonly clauses_removed: number;
  /** The schema event type that was processed. */
  readonly event_type: SchemaEventType;
  /**
   * The schema_id extracted from the event payload.
   * Empty string for non-entity events (validation_started, etc.).
   */
  readonly schema_id: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a stable clause_id for entity clauses. */
function entityClauseId(schemaId: string): string {
  return `entity:${schemaId}`;
}

/** Build a stable clause_id for count clauses. */
function countClauseId(namespace: SchemaNamespace): string {
  return `count:${namespace}`;
}

/** Generate a contract_id string. */
function buildContractId(generation: number, ts: number): string {
  return `vc-${generation}-${ts}`;
}

/** Sort clauses into canonical order. */
function sortClauses(clauses: VerificationClause[]): VerificationClause[] {
  const kindOrder: Record<VerificationClauseKind, number> = {
    schema_version_match: 0,
    count_gte: 1,
    entity_present: 2,
    entity_deprecated: 3,
    entity_absent: 4,
  };
  return clauses.slice().sort((a, b) => {
    const ko = kindOrder[a.kind] - kindOrder[b.kind];
    if (ko !== 0) return ko;
    return (a.clause_id).localeCompare(b.clause_id);
  });
}

/** Produce an immutable VerificationContract from a mutable clause list. */
function buildContract(
  clauses: VerificationClause[],
  generation: number,
  generatedAt: number,
  lastMutatedAt: number,
  schemaVersion: string,
): VerificationContract {
  return Object.freeze({
    contract_id: buildContractId(generation, generatedAt),
    schema_version: schemaVersion,
    generation,
    generated_at_ms: generatedAt,
    last_mutated_at_ms: lastMutatedAt,
    clauses: Object.freeze(sortClauses(clauses)),
  });
}

/** Extract the schema_id from an unknown payload (best-effort). */
function extractSchemaId(payload: unknown): string {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "schema_id" in payload &&
    typeof (payload as Record<string, unknown>).schema_id === "string"
  ) {
    return (payload as Record<string, unknown>).schema_id as string;
  }
  return "";
}

/** Build a no-op SyncResult (contract unchanged). */
function noOpResult(
  contract: VerificationContract,
  event_type: SchemaEventType,
  schema_id: string,
): VerificationContractSyncResult {
  return Object.freeze({
    contract,
    changed: false,
    clauses_added: 0,
    clauses_updated: 0,
    clauses_removed: 0,
    event_type,
    schema_id,
  });
}

// ---------------------------------------------------------------------------
// VerificationContractSyncer
// ---------------------------------------------------------------------------

/**
 * VerificationContractSyncer
 *
 * Derives and updates a `VerificationContract` in lockstep with applied
 * structural mutations.
 *
 * All methods are **pure** — they do not mutate their inputs and produce new
 * VerificationContract values on each structural change.
 *
 * Usage:
 * ```ts
 * const syncer = new VerificationContractSyncer();
 *
 * // Bootstrap from a snapshot:
 * let contract = syncer.deriveFromSnapshot(snapshot);
 *
 * // Update when a mutation is applied:
 * const result = syncer.sync(contract, "schema.registered", payload);
 * contract = result.contract;
 * ```
 */
export class VerificationContractSyncer {
  // ---------------------------------------------------------------------------
  // Public: derive from snapshot
  // ---------------------------------------------------------------------------

  /**
   * Derive the initial VerificationContract from an OntologySnapshot.
   *
   * This bootstraps the contract by treating every entry in the snapshot as
   * an active, registered schema entity.  It does NOT replay historical events
   * — it produces a generation-0 contract that reflects the current protocol
   * state.
   *
   * The derived contract includes:
   *   1. One `schema_version_match` clause for the current SCHEMA_VERSION.
   *   2. One `count_gte` clause per namespace present in the snapshot.
   *   3. One `entity_present` clause per event_type, command_type, reducer,
   *      and schema_registry entry in the snapshot.
   *
   * @param snapshot  The OntologySnapshot to derive the contract from.
   * @returns         A generation-0 VerificationContract.
   */
  deriveFromSnapshot(snapshot: OntologySnapshot): VerificationContract {
    const now = Date.now();
    const generation = 0;
    const clauses: VerificationClause[] = [];

    // ── 1. schema_version_match ─────────────────────────────────────────────
    clauses.push({
      clause_id: "schema_version",
      kind: "schema_version_match",
      expected_version: snapshot.schema_version,
      label: `Schema version must be '${snapshot.schema_version}'`,
      introduced_at_generation: generation,
      last_updated_at_generation: generation,
    });

    // ── 2. Collect namespace counts & entity clauses ─────────────────────────

    const namespaceCounts = new Map<SchemaNamespace, number>();

    // event_types
    for (const et of snapshot.event_types) {
      const ns: SchemaNamespace = "event_type";
      namespaceCounts.set(ns, (namespaceCounts.get(ns) ?? 0) + 1);
      clauses.push({
        clause_id: entityClauseId(et.schema_id),
        kind: "entity_present",
        schema_id: et.schema_id,
        namespace: ns,
        label: `Event type '${et.event_type}' must be registered and active`,
        introduced_at_generation: generation,
        last_updated_at_generation: generation,
      });
    }

    // command_types
    for (const ct of snapshot.command_types) {
      const ns: SchemaNamespace = "command_type";
      namespaceCounts.set(ns, (namespaceCounts.get(ns) ?? 0) + 1);
      clauses.push({
        clause_id: entityClauseId(ct.schema_id),
        kind: "entity_present",
        schema_id: ct.schema_id,
        namespace: ns,
        label: `Command type '${ct.command_type}' must be registered and active`,
        introduced_at_generation: generation,
        last_updated_at_generation: generation,
      });
    }

    // reducers
    for (const r of snapshot.reducers) {
      const ns: SchemaNamespace = "reducer";
      namespaceCounts.set(ns, (namespaceCounts.get(ns) ?? 0) + 1);
      clauses.push({
        clause_id: entityClauseId(r.schema_id),
        kind: "entity_present",
        schema_id: r.schema_id,
        namespace: ns,
        label: `Reducer '${r.reducer_name}' must be registered and active`,
        introduced_at_generation: generation,
        last_updated_at_generation: generation,
      });
    }

    // schema_registry (reflexive closure)
    for (const sr of snapshot.schema_registry) {
      const ns: SchemaNamespace = "protocol";
      namespaceCounts.set(ns, (namespaceCounts.get(ns) ?? 0) + 1);
      clauses.push({
        clause_id: entityClauseId(sr.schema_id),
        kind: "entity_present",
        schema_id: sr.schema_id,
        namespace: ns,
        label: `Schema registry entry '${sr.schema_event_type}' must be registered and active`,
        introduced_at_generation: generation,
        last_updated_at_generation: generation,
      });
    }

    // ── 3. count_gte clauses ─────────────────────────────────────────────────
    for (const [ns, count] of namespaceCounts) {
      clauses.push({
        clause_id: countClauseId(ns),
        kind: "count_gte",
        namespace: ns,
        expected_min_count: count,
        label: `Namespace '${ns}' must have at least ${count} active entries`,
        introduced_at_generation: generation,
        last_updated_at_generation: generation,
      });
    }

    return buildContract(clauses, generation, now, now, snapshot.schema_version);
  }

  // ---------------------------------------------------------------------------
  // Public: sync with a structural mutation
  // ---------------------------------------------------------------------------

  /**
   * Synchronize the contract with one applied structural mutation.
   *
   * Only structural mutations affect the contract:
   *   - schema.registered  → adds entity_present clause
   *   - schema.updated     → updates the entity_present clause label / version note
   *   - schema.deprecated  → changes entity_present to entity_deprecated
   *   - schema.removed     → removes entity_present/deprecated, adds entity_absent
   *
   * Non-structural events (validation_started, validated, migration_started,
   * migrated) return the unchanged contract with `changed: false`.
   *
   * If the payload fails validation, returns the unchanged contract with
   * `changed: false`.
   *
   * @param contract    The current VerificationContract.
   * @param event_type  The applied schema event type.
   * @param payload     The raw (untyped) event payload.
   * @returns           A SyncResult containing the new (or unchanged) contract.
   */
  sync(
    contract: VerificationContract,
    event_type: SchemaEventType,
    payload: unknown,
  ): VerificationContractSyncResult {
    switch (event_type) {
      case "schema.registered":
        return this._syncRegistered(contract, payload);
      case "schema.updated":
        return this._syncUpdated(contract, payload);
      case "schema.deprecated":
        return this._syncDeprecated(contract, payload);
      case "schema.removed":
        return this._syncRemoved(contract, payload);

      // Non-structural — no contract change
      case "schema.validation_started":
      case "schema.validated":
      case "schema.migration_started":
      case "schema.migrated":
        return noOpResult(contract, event_type, extractSchemaId(payload));

      default: {
        // Exhaustiveness guard
        const _e: never = event_type as never;
        void _e;
        return noOpResult(contract, event_type as SchemaEventType, extractSchemaId(payload));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: structural mutation handlers
  // ---------------------------------------------------------------------------

  private _syncRegistered(
    contract: VerificationContract,
    rawPayload: unknown,
  ): VerificationContractSyncResult {
    if (!isValidSchemaPayload("schema.registered", rawPayload)) {
      return noOpResult(contract, "schema.registered", extractSchemaId(rawPayload));
    }
    const payload = rawPayload as SchemaRegisteredPayload;
    const schema_id = payload.schema_id;
    const ns = payload.namespace;

    const newGeneration = contract.generation + 1;
    const now = Date.now();

    // Build new clause list
    const existing = contract.clauses.filter(
      (c) => c.clause_id !== entityClauseId(schema_id),
    );

    // Check whether the entity already has a clause (idempotent registration)
    const alreadyPresent = contract.clauses.some(
      (c) => c.clause_id === entityClauseId(schema_id) && c.kind === "entity_present",
    );
    if (alreadyPresent) {
      // Idempotent — no change
      return noOpResult(contract, "schema.registered", schema_id);
    }

    // Add entity_present clause
    const newEntityClause: VerificationClause = {
      clause_id: entityClauseId(schema_id),
      kind: "entity_present",
      schema_id,
      namespace: ns,
      expected_version: payload.version,
      label: `'${payload.name}' (${schema_id}) must be registered and active (v${payload.version})`,
      introduced_at_generation: newGeneration,
      last_updated_at_generation: newGeneration,
    };

    // Update count_gte clause for namespace
    const countId = countClauseId(ns);
    const existingCount = existing.find((c) => c.clause_id === countId);
    const updatedClauses: VerificationClause[] = existing.filter(
      (c) => c.clause_id !== countId,
    );

    const newCount = (existingCount?.expected_min_count ?? 0) + 1;
    const updatedCountClause: VerificationClause = {
      clause_id: countId,
      kind: "count_gte",
      namespace: ns,
      expected_min_count: newCount,
      label: `Namespace '${ns}' must have at least ${newCount} active entries`,
      introduced_at_generation: existingCount?.introduced_at_generation ?? newGeneration,
      last_updated_at_generation: newGeneration,
    };

    updatedClauses.push(newEntityClause, updatedCountClause);

    const newContract = buildContract(
      updatedClauses,
      newGeneration,
      contract.generated_at_ms,
      now,
      contract.schema_version,
    );

    return Object.freeze({
      contract: newContract,
      changed: true,
      clauses_added: 1,
      clauses_updated: existingCount ? 1 : 0,
      clauses_removed: 0,
      event_type: "schema.registered" as const,
      schema_id,
    });
  }

  private _syncUpdated(
    contract: VerificationContract,
    rawPayload: unknown,
  ): VerificationContractSyncResult {
    if (!isValidSchemaPayload("schema.updated", rawPayload)) {
      return noOpResult(contract, "schema.updated", extractSchemaId(rawPayload));
    }
    const payload = rawPayload as SchemaUpdatedPayload;
    const schema_id = payload.schema_id;

    const existingClause = contract.clauses.find(
      (c) => c.clause_id === entityClauseId(schema_id),
    );

    // If no clause exists (entity not registered), no-op
    if (!existingClause) {
      return noOpResult(contract, "schema.updated", schema_id);
    }

    // If not entity_present, no structural change (e.g. deprecated entity updated — unusual)
    if (existingClause.kind !== "entity_present") {
      return noOpResult(contract, "schema.updated", schema_id);
    }

    const newGeneration = contract.generation + 1;
    const now = Date.now();

    // Update the entity_present clause to reflect the new version
    const updatedEntityClause: VerificationClause = {
      ...existingClause,
      expected_version: payload.next_version,
      label: `'${payload.name}' (${schema_id}) must be registered and active (v${payload.next_version}, updated from v${payload.prev_version})`,
      last_updated_at_generation: newGeneration,
    };

    const updatedClauses: VerificationClause[] = contract.clauses.map((c) =>
      c.clause_id === entityClauseId(schema_id) ? updatedEntityClause : c,
    );

    const newContract = buildContract(
      updatedClauses,
      newGeneration,
      contract.generated_at_ms,
      now,
      contract.schema_version,
    );

    return Object.freeze({
      contract: newContract,
      changed: true,
      clauses_added: 0,
      clauses_updated: 1,
      clauses_removed: 0,
      event_type: "schema.updated" as const,
      schema_id,
    });
  }

  private _syncDeprecated(
    contract: VerificationContract,
    rawPayload: unknown,
  ): VerificationContractSyncResult {
    if (!isValidSchemaPayload("schema.deprecated", rawPayload)) {
      return noOpResult(contract, "schema.deprecated", extractSchemaId(rawPayload));
    }
    const payload = rawPayload as SchemaDeprecatedPayload;
    const schema_id = payload.schema_id;

    const existingClause = contract.clauses.find(
      (c) => c.clause_id === entityClauseId(schema_id),
    );

    // If no entity_present clause exists, nothing to transition
    if (!existingClause || existingClause.kind !== "entity_present") {
      return noOpResult(contract, "schema.deprecated", schema_id);
    }

    const newGeneration = contract.generation + 1;
    const now = Date.now();
    const ns = payload.namespace;

    // Transition entity_present → entity_deprecated
    const deprecatedClause: VerificationClause = {
      clause_id: entityClauseId(schema_id),
      kind: "entity_deprecated",
      schema_id,
      namespace: ns,
      expected_version: payload.version,
      label: `'${payload.name}' (${schema_id}) must be present with deprecated status — reason: ${payload.deprecation_reason}${payload.replacement_schema_id ? `; replace with '${payload.replacement_schema_id}'` : ""}`,
      introduced_at_generation: existingClause.introduced_at_generation,
      last_updated_at_generation: newGeneration,
    };

    // Update count_gte for namespace: deprecated entries no longer count as active
    const countId = countClauseId(ns);
    const existingCount = contract.clauses.find((c) => c.clause_id === countId);
    const newCount = Math.max(0, (existingCount?.expected_min_count ?? 1) - 1);

    const updatedClauses: VerificationClause[] = contract.clauses.map((c) => {
      if (c.clause_id === entityClauseId(schema_id)) return deprecatedClause;
      if (c.clause_id === countId) {
        return {
          ...c,
          expected_min_count: newCount,
          label: `Namespace '${ns}' must have at least ${newCount} active entries`,
          last_updated_at_generation: newGeneration,
        };
      }
      return c;
    });

    const newContract = buildContract(
      updatedClauses,
      newGeneration,
      contract.generated_at_ms,
      now,
      contract.schema_version,
    );

    return Object.freeze({
      contract: newContract,
      changed: true,
      clauses_added: 0,
      clauses_updated: existingCount ? 2 : 1,
      clauses_removed: 0,
      event_type: "schema.deprecated" as const,
      schema_id,
    });
  }

  private _syncRemoved(
    contract: VerificationContract,
    rawPayload: unknown,
  ): VerificationContractSyncResult {
    if (!isValidSchemaPayload("schema.removed", rawPayload)) {
      return noOpResult(contract, "schema.removed", extractSchemaId(rawPayload));
    }
    const payload = rawPayload as SchemaRemovedPayload;
    const schema_id = payload.schema_id;
    const ns = payload.namespace;

    const existingClause = contract.clauses.find(
      (c) => c.clause_id === entityClauseId(schema_id),
    );

    // If already absent, idempotent no-op
    if (!existingClause || existingClause.kind === "entity_absent") {
      return noOpResult(contract, "schema.removed", schema_id);
    }

    const newGeneration = contract.generation + 1;
    const now = Date.now();

    // Replace entity_present / entity_deprecated with entity_absent
    const absentClause: VerificationClause = {
      clause_id: entityClauseId(schema_id),
      kind: "entity_absent",
      schema_id,
      namespace: ns,
      label: `'${payload.name}' (${schema_id}) must NOT be active — permanently removed; reason: ${payload.removal_reason}`,
      introduced_at_generation: newGeneration,
      last_updated_at_generation: newGeneration,
    };

    // Update count_gte — if the existing clause was entity_present (active), decrement
    const countId = countClauseId(ns);
    const existingCount = contract.clauses.find((c) => c.clause_id === countId);
    const wasActive = existingClause.kind === "entity_present";
    const newCount = wasActive
      ? Math.max(0, (existingCount?.expected_min_count ?? 1) - 1)
      : existingCount?.expected_min_count ?? 0;

    const updatedClauses: VerificationClause[] = contract.clauses.map((c) => {
      if (c.clause_id === entityClauseId(schema_id)) return absentClause;
      if (c.clause_id === countId && existingCount) {
        return {
          ...c,
          expected_min_count: newCount,
          label: `Namespace '${ns}' must have at least ${newCount} active entries`,
          last_updated_at_generation: newGeneration,
        };
      }
      return c;
    });

    const newContract = buildContract(
      updatedClauses,
      newGeneration,
      contract.generated_at_ms,
      now,
      contract.schema_version,
    );

    return Object.freeze({
      contract: newContract,
      changed: true,
      // entity clause transitioned (removed old, added new kind) = 1 added, 1 removed
      clauses_added: 1,
      clauses_updated: existingCount ? 1 : 0,
      clauses_removed: 1,
      event_type: "schema.removed" as const,
      schema_id,
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Module-level singleton instance of VerificationContractSyncer.
 * Stateless — all sync operations are pure functions of their inputs.
 */
export const verificationContractSyncer = new VerificationContractSyncer();

/**
 * React / non-React hook accessor for the singleton.
 * Returns the same singleton on every call.
 */
export function useVerificationContractSyncer(): VerificationContractSyncer {
  return verificationContractSyncer;
}

// ---------------------------------------------------------------------------
// Utility: check a single clause against a registry view
// ---------------------------------------------------------------------------

/**
 * A minimal registry view that a verifier implements to check clauses.
 * Matches the `RegistryEntry` shape from `mutation-executor.ts` without
 * creating a direct dependency cycle.
 */
export interface ClauseRegistryView {
  /** Returns the current status of a schema_id, or undefined if not found. */
  getStatus(schema_id: string): "active" | "deprecated" | "removed" | undefined;
  /** Returns the count of active entries in a namespace. */
  countActive(namespace: SchemaNamespace): number;
  /** Returns the current SCHEMA_VERSION in use. */
  getCurrentSchemaVersion(): string;
}

/**
 * Result of checking a single VerificationClause.
 */
export interface ClauseCheckResult {
  /** The clause that was checked. */
  clause: VerificationClause;
  /** Whether the assertion passed. */
  passed: boolean;
  /** Human-readable explanation of the result. */
  message: string;
}

/**
 * Check a single VerificationClause against a registry view.
 *
 * Pure function — no side effects.
 *
 * @param clause    The clause to check.
 * @param registry  A registry view implementing `ClauseRegistryView`.
 * @returns         A `ClauseCheckResult` with pass/fail and a message.
 */
export function checkClause(
  clause: VerificationClause,
  registry: ClauseRegistryView,
): ClauseCheckResult {
  switch (clause.kind) {
    case "entity_present": {
      const status = registry.getStatus(clause.schema_id!);
      const passed = status === "active";
      return {
        clause,
        passed,
        message: passed
          ? `✓ ${clause.schema_id} is active`
          : `✗ ${clause.schema_id} expected active, got ${status ?? "absent"}`,
      };
    }

    case "entity_deprecated": {
      const status = registry.getStatus(clause.schema_id!);
      const passed = status === "deprecated";
      return {
        clause,
        passed,
        message: passed
          ? `✓ ${clause.schema_id} is deprecated (expected)`
          : `✗ ${clause.schema_id} expected deprecated, got ${status ?? "absent"}`,
      };
    }

    case "entity_absent": {
      const status = registry.getStatus(clause.schema_id!);
      const passed = status === "removed" || status === undefined;
      return {
        clause,
        passed,
        message: passed
          ? `✓ ${clause.schema_id} is absent/removed (expected)`
          : `✗ ${clause.schema_id} expected absent/removed, got ${status}`,
      };
    }

    case "count_gte": {
      const actual = registry.countActive(clause.namespace!);
      const min = clause.expected_min_count ?? 0;
      const passed = actual >= min;
      return {
        clause,
        passed,
        message: passed
          ? `✓ namespace '${clause.namespace}' has ${actual} active entries (≥ ${min})`
          : `✗ namespace '${clause.namespace}' has ${actual} active entries (need ≥ ${min})`,
      };
    }

    case "schema_version_match": {
      const actual = registry.getCurrentSchemaVersion();
      const passed = actual === clause.expected_version;
      return {
        clause,
        passed,
        message: passed
          ? `✓ schema version is '${actual}'`
          : `✗ schema version: expected '${clause.expected_version}', got '${actual}'`,
      };
    }

    default: {
      const _e: never = clause.kind as never;
      void _e;
      return {
        clause,
        passed: false,
        message: `✗ Unknown clause kind '${clause.kind as string}'`,
      };
    }
  }
}

/**
 * Check all clauses in a VerificationContract against a registry view.
 *
 * Returns an array of `ClauseCheckResult` in the same order as the contract's
 * `clauses` array.
 *
 * @param contract  The VerificationContract to check.
 * @param registry  A registry view implementing `ClauseRegistryView`.
 * @returns         An ordered array of check results.
 */
export function checkContract(
  contract: VerificationContract,
  registry: ClauseRegistryView,
): ClauseCheckResult[] {
  return contract.clauses.map((clause) => checkClause(clause, registry));
}

/**
 * Summarize the results of a full contract check.
 *
 * Returns a summary string suitable for logging.
 */
export function summarizeContractCheck(results: ClauseCheckResult[]): string {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  return (
    `VerificationContract check: ${passed}/${total} passed` +
    (failed > 0 ? ` (${failed} FAILED)` : " ✓")
  );
}

// ---------------------------------------------------------------------------
// Re-export SchemaNamespace for consumers that only import from this module
// ---------------------------------------------------------------------------
export type { SchemaNamespace };
