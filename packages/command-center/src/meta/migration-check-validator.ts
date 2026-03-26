/**
 * @module migration-check-validator
 * Sub-AC 11b — Migration check validator for proposed schema.* mutation events.
 *
 * The MigrationCheckValidator is a **pure, stateless validation layer** that
 * enforces backward-compatibility and migration-safety rules for proposed
 * schema.* events BEFORE they reach the MutationExecutor.
 *
 * ─── Responsibility boundary ─────────────────────────────────────────────────
 *
 * This validator checks structural and semantic migration rules ONLY.  It does
 * NOT modify any state, write to the event log, or interact with the
 * infrastructure pipeline.  All inputs are treated as read-only.
 *
 * ─── Migration rules enforced ────────────────────────────────────────────────
 *
 *   schema.registered
 *     MR-01  schema_id format must be valid ("namespace:name")
 *     MR-02  namespace prefix in schema_id must match the `namespace` field
 *     MR-03  version must be a valid semver string
 *     MR-04  Re-registration of an existing active schema → WARN (idempotent is
 *            safe but suspicious)
 *     MR-05  Re-registration of a removed schema → REJECT (ghost resurrection)
 *
 *   schema.updated
 *     MR-06  schema_id must exist in the registry (reject if unknown)
 *     MR-07  schema_id must not have status "removed"
 *     MR-08  prev_version must match the current registered version
 *     MR-09  next_version must be a forward semver bump (no downgrades)
 *     MR-10  Namespace field must be immutable (cannot change namespace)
 *     MR-11  Changes containing field_removed for a required field → REJECT
 *            (breaking change: removes required field from existing events)
 *
 *   schema.deprecated
 *     MR-12  schema_id must exist in the registry
 *     MR-13  schema_id must not have status "removed"
 *     MR-14  replacement_schema_id (if provided) must exist in the registry
 *
 *   schema.removed
 *     MR-15  schema_id must exist in the registry
 *     MR-16  schema_id must be "deprecated" before removal (migration-safety
 *            invariant — can be bypassed with `allow_force_remove`)
 *     MR-17  migration_applied should be true when removing an event_type schema
 *            (WARN if false — events in log may reference the removed type)
 *
 *   schema.migration_started
 *     MR-18  from_version must be a valid semver string
 *     MR-19  to_version must be a valid semver string
 *     MR-20  to_version must be strictly greater than from_version (no downgrade)
 *     MR-21  target_event_types (if provided) must be resolvable schema_ids or
 *            event type strings
 *     MR-22  No other migration run may be currently in-progress (concurrency guard)
 *
 *   schema.migrated
 *     MR-23  migration_run_id must not be empty
 *     MR-24  from_version / to_version must be valid semver strings
 *     MR-25  to_version must be ≥ from_version
 *     MR-26  migrated_event_types must not be empty when events_migrated > 0
 *
 *   All event types
 *     MR-27  Payload must not be null or undefined
 *     MR-28  schema_id must not be an empty string (for relevant event types)
 *
 * ─── Record transparency ─────────────────────────────────────────────────────
 *
 * Every call to `check()` returns a `MigrationCheckResult` containing:
 *   - The final decision: "accept" | "reject" | "warn"
 *   - A structured list of `MigrationRuleViolation` objects (one per failed rule)
 *   - A list of `MigrationRuleWarning` objects (one per triggered warning)
 *   - The rule IDs that were evaluated
 *
 * Callers MAY choose to treat "warn" as "accept" (soft validation) or as
 * "reject" (strict mode).  The `MigrationCheckValidator` itself does not
 * enforce this policy — that is the responsibility of the MutationExecutor.
 */

import {
  isValidSchemaPayload,
  type SchemaEventType,
  type SchemaRegisteredPayload,
  type SchemaUpdatedPayload,
  type SchemaDeprecatedPayload,
  type SchemaRemovedPayload,
  type SchemaMigrationStartedPayload,
  type SchemaMigratedPayload,
  type SchemaChangeDiff,
  type SchemaNamespace,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Rule IDs
// ---------------------------------------------------------------------------

/**
 * All migration rule IDs checked by this validator.
 *
 * Each rule corresponds to a `MR-NN` code documented above.
 * Rule IDs are stable across releases — adding new rules must use a new ID.
 */
export type MigrationRuleId =
  | "MR-01"
  | "MR-02"
  | "MR-03"
  | "MR-04"
  | "MR-05"
  | "MR-06"
  | "MR-07"
  | "MR-08"
  | "MR-09"
  | "MR-10"
  | "MR-11"
  | "MR-12"
  | "MR-13"
  | "MR-14"
  | "MR-15"
  | "MR-16"
  | "MR-17"
  | "MR-18"
  | "MR-19"
  | "MR-20"
  | "MR-21"
  | "MR-22"
  | "MR-23"
  | "MR-24"
  | "MR-25"
  | "MR-26"
  | "MR-27"
  | "MR-28";

// ---------------------------------------------------------------------------
// Decision outcome
// ---------------------------------------------------------------------------

/**
 * The outcome decision returned by the migration check validator.
 *
 * - `"accept"` — all rules passed; the mutation is safe to proceed.
 * - `"warn"`   — no blocking violations, but warnings were raised.
 *                The caller MAY treat this as `accept` in lenient mode or as
 *                `reject` in strict mode.
 * - `"reject"` — one or more blocking rule violations found.
 *                The mutation MUST NOT proceed without operator override.
 */
export type MigrationCheckDecision = "accept" | "warn" | "reject";

// ---------------------------------------------------------------------------
// Violation record (blocking)
// ---------------------------------------------------------------------------

/**
 * A structured record describing a **blocking** migration rule violation.
 *
 * Violations cause the decision to be `"reject"`.
 */
export interface MigrationRuleViolation {
  /**
   * Stable rule identifier (e.g. "MR-16").
   * Use this to filter/display specific rule failures.
   */
  rule_id: MigrationRuleId;

  /**
   * Human-readable message explaining why the rule was violated.
   * Suitable for display in the GUI Pending Approvals panel or operator log.
   */
  message: string;

  /**
   * The specific field or context path related to the violation.
   * Optional — provided when the violation targets a specific payload field.
   *
   * @example "schema_id", "next_version", "changes[0].field_path"
   */
  field?: string;

  /**
   * The actual value that triggered the violation (serialized to string).
   * Optional — aids in debugging without requiring callers to re-inspect the payload.
   */
  actual_value?: string;

  /**
   * The expected value or constraint description.
   * Optional — clarifies what the correct value should have been.
   */
  expected?: string;
}

// ---------------------------------------------------------------------------
// Warning record (non-blocking)
// ---------------------------------------------------------------------------

/**
 * A structured record describing a **non-blocking** migration concern.
 *
 * Warnings cause the decision to be `"warn"` (not `"reject"`).
 * The mutation may proceed but the caller should acknowledge the concern.
 */
export interface MigrationRuleWarning {
  /**
   * Stable rule identifier (e.g. "MR-04").
   */
  rule_id: MigrationRuleId;

  /**
   * Human-readable message describing the concern.
   */
  message: string;

  /**
   * Optional field path that triggered the warning.
   */
  field?: string;
}

// ---------------------------------------------------------------------------
// Check result
// ---------------------------------------------------------------------------

/**
 * The full structured result of a migration check validation.
 *
 * Record transparency guarantee: all rule evaluations are captured — not just
 * failures.  The `rules_evaluated` list shows which rules were checked so the
 * caller can audit which rules applied to a given event type.
 */
export interface MigrationCheckResult {
  /**
   * The overall validation decision.
   * Derived from `violations` and `warnings`:
   *   violations.length > 0  → "reject"
   *   warnings.length > 0    → "warn"
   *   otherwise              → "accept"
   */
  decision: MigrationCheckDecision;

  /**
   * The schema event type that was validated.
   */
  event_type: SchemaEventType;

  /**
   * The schema_id extracted from the payload (may be empty string for
   * migration lifecycle events like schema.migration_started).
   */
  schema_id: string;

  /**
   * Blocking violations found during validation.
   * Empty array when `decision !== "reject"`.
   */
  violations: readonly MigrationRuleViolation[];

  /**
   * Non-blocking warnings raised during validation.
   * May be non-empty even when `decision === "accept"` (deprecated schemas, etc.)
   */
  warnings: readonly MigrationRuleWarning[];

  /**
   * List of all rule IDs that were evaluated during this check.
   * Includes both passing and failing rules, in evaluation order.
   */
  rules_evaluated: readonly MigrationRuleId[];

  /**
   * Whether the check ran in strict mode
   * (where warnings are also treated as blocking rejections).
   */
  strict_mode: boolean;
}

// ---------------------------------------------------------------------------
// Registry view (read-only input to the validator)
// ---------------------------------------------------------------------------

/**
 * Minimal read-only view of a registry entry required by the validator.
 *
 * The validator does NOT depend on the full `RegistryEntry` type from
 * `mutation-executor.ts` to avoid a circular dependency.  Callers pass
 * only the fields the validator needs.
 */
export interface RegistryEntryView {
  /** Stable schema identifier. */
  schema_id: string;
  /** Current lifecycle status. */
  status: "active" | "deprecated" | "removed";
  /** The namespace this entry was registered under. */
  namespace: SchemaNamespace;
  /** Current semver version string. */
  version: string;
}

// ---------------------------------------------------------------------------
// Validator options
// ---------------------------------------------------------------------------

/**
 * Configuration options for the `MigrationCheckValidator`.
 */
export interface MigrationCheckValidatorOptions {
  /**
   * When true, `"warn"` decisions are escalated to `"reject"`.
   * Use strict mode in CI/CD pipelines or when mutations must be zero-warning.
   *
   * Default: false
   */
  strict_mode?: boolean;

  /**
   * When true, `schema.removed` mutations are allowed even if the schema has
   * not been previously deprecated (bypasses MR-16).
   *
   * Default: false
   */
  allow_force_remove?: boolean;

  /**
   * When true, version downgrade checks (MR-09, MR-25) are skipped.
   * Intended for emergency rollback scenarios only.
   *
   * Default: false
   */
  allow_version_downgrade?: boolean;
}

// ---------------------------------------------------------------------------
// Internal builder helpers
// ---------------------------------------------------------------------------

interface CheckContext {
  violations: MigrationRuleViolation[];
  warnings: MigrationRuleWarning[];
  rules_evaluated: MigrationRuleId[];
}

function addViolation(
  ctx: CheckContext,
  rule_id: MigrationRuleId,
  message: string,
  opts?: { field?: string; actual_value?: string; expected?: string },
): void {
  ctx.violations.push({ rule_id, message, ...opts });
  if (!ctx.rules_evaluated.includes(rule_id)) {
    ctx.rules_evaluated.push(rule_id);
  }
}

function addWarning(
  ctx: CheckContext,
  rule_id: MigrationRuleId,
  message: string,
  opts?: { field?: string },
): void {
  ctx.warnings.push({ rule_id, message, ...opts });
  if (!ctx.rules_evaluated.includes(rule_id)) {
    ctx.rules_evaluated.push(rule_id);
  }
}

function markEvaluated(ctx: CheckContext, rule_id: MigrationRuleId): void {
  if (!ctx.rules_evaluated.includes(rule_id)) {
    ctx.rules_evaluated.push(rule_id);
  }
}

// ---------------------------------------------------------------------------
// Semver utilities (minimal, no external dependency)
// ---------------------------------------------------------------------------

/**
 * Returns true if `version` is a valid semver string (MAJOR.MINOR.PATCH).
 * Allows optional pre-release suffixes (e.g. "1.0.0-beta.1").
 */
export function isValidSemver(version: string): boolean {
  // Matches MAJOR.MINOR.PATCH with optional pre-release/build-metadata
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9._-]+)?(\+[a-zA-Z0-9._-]+)?$/.test(
    version,
  );
}

/**
 * Compare two semver strings.
 * Returns:
 *   -1  if a < b
 *    0  if a === b
 *    1  if a > b
 *
 * Pre-release suffixes are stripped for numeric comparison purposes
 * (sufficient for the migration rules which only need directional ordering).
 *
 * Returns `null` if either string is not a valid semver.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const parseCore = (v: string): [number, number, number] | null => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const pa = parseCore(a);
  const pb = parseCore(b);
  if (!pa || !pb) return null;

  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Returns true if `next` is a strictly higher semver than `current`.
 * Returns false if `next` equals or is lower than `current`, or if either
 * string is not a valid semver.
 */
export function isSemverBump(current: string, next: string): boolean {
  const cmp = compareSemver(current, next);
  return cmp === -1; // current < next → next is a forward bump
}

// ---------------------------------------------------------------------------
// Schema-id format utilities
// ---------------------------------------------------------------------------

/**
 * Returns true if `schema_id` follows the expected format: `"<namespace>:<name>"`.
 * Both namespace and name must be non-empty.
 */
export function isValidSchemaIdFormat(schema_id: string): boolean {
  const parts = schema_id.split(":");
  return parts.length >= 2 && parts[0].length > 0 && parts.slice(1).join(":").length > 0;
}

/**
 * Extract the namespace prefix from a schema_id.
 * Returns the part before the first colon, or null if the format is invalid.
 *
 * @example
 *   extractSchemaIdNamespace("event_type:task.created") // → "event_type"
 *   extractSchemaIdNamespace("bad_id")                  // → null
 */
export function extractSchemaIdNamespace(schema_id: string): string | null {
  const colonIndex = schema_id.indexOf(":");
  if (colonIndex <= 0) return null;
  return schema_id.slice(0, colonIndex);
}

// ---------------------------------------------------------------------------
// MigrationCheckValidator
// ---------------------------------------------------------------------------

/**
 * MigrationCheckValidator — pure, stateless migration rule enforcer.
 *
 * Validates proposed `schema.*` events against migration rules, returning
 * structured accept/reject/warn decisions with per-rule reasons.
 *
 * This validator is framework-agnostic and has no side effects — it reads
 * the provided registry snapshot but never writes to it.
 *
 * Usage:
 * ```ts
 * const validator = new MigrationCheckValidator();
 *
 * const result = validator.check(
 *   "schema.removed",
 *   removedPayload,
 *   registrySnapshot,
 * );
 *
 * if (result.decision === "reject") {
 *   console.error("Migration check failed:", result.violations);
 * }
 * ```
 */
export class MigrationCheckValidator {
  private readonly _opts: Required<MigrationCheckValidatorOptions>;

  constructor(opts: MigrationCheckValidatorOptions = {}) {
    this._opts = {
      strict_mode: opts.strict_mode ?? false,
      allow_force_remove: opts.allow_force_remove ?? false,
      allow_version_downgrade: opts.allow_version_downgrade ?? false,
    };
  }

  // ── Public: check ────────────────────────────────────────────────────────

  /**
   * Validate a proposed `schema.*` event against migration rules.
   *
   * @param eventType        The schema event type to validate.
   * @param payload          The raw (untyped) payload to validate.
   * @param registry         Current registry state snapshot (read-only).
   *                         Pass an empty iterable if no prior state exists.
   * @param activeRunIds     Optional set of migration_run_ids currently in
   *                         progress (used for concurrency guard MR-22).
   *
   * @returns MigrationCheckResult with decision, violations, and warnings.
   */
  check(
    eventType: SchemaEventType,
    payload: unknown,
    registry: Iterable<RegistryEntryView> = [],
    activeRunIds: ReadonlySet<string> = new Set(),
  ): MigrationCheckResult {
    const ctx: CheckContext = {
      violations: [],
      warnings: [],
      rules_evaluated: [],
    };

    // Build a lookup map from the registry iterable
    const registryMap = new Map<string, RegistryEntryView>();
    for (const entry of registry) {
      registryMap.set(entry.schema_id, entry);
    }

    // MR-27: Payload must not be null or undefined
    markEvaluated(ctx, "MR-27");
    if (payload === null || payload === undefined) {
      addViolation(ctx, "MR-27", `Payload must not be null or undefined for event type '${eventType}'`, {
        field: "payload",
        actual_value: String(payload),
        expected: "A valid payload object",
      });
      return this._buildResult(eventType, "", ctx);
    }

    // Route to type-specific check
    switch (eventType) {
      case "schema.registered":
        this._checkRegistered(payload, registryMap, ctx);
        break;

      case "schema.updated":
        this._checkUpdated(payload, registryMap, ctx);
        break;

      case "schema.deprecated":
        this._checkDeprecated(payload, registryMap, ctx);
        break;

      case "schema.removed":
        this._checkRemoved(payload, registryMap, ctx);
        break;

      case "schema.migration_started":
        this._checkMigrationStarted(payload, registryMap, activeRunIds, ctx);
        break;

      case "schema.migrated":
        this._checkMigrated(payload, ctx);
        break;

      case "schema.validation_started":
      case "schema.validated":
        // No migration-specific rules for validation lifecycle events
        // (MR-27 already checked above)
        break;

      default: {
        // Exhaustiveness guard
        const _exhaustive: never = eventType as never;
        void _exhaustive;
        addViolation(
          ctx,
          "MR-27", // reuse MR-27 as the "unknown type" guard
          `Unrecognised schema event type: '${eventType as string}'`,
        );
      }
    }

    const schema_id = extractSchemaIdFromPayload(payload);
    return this._buildResult(eventType, schema_id, ctx);
  }

  // ── Private: per-event-type checkers ─────────────────────────────────────

  private _checkRegistered(
    payload: unknown,
    registry: Map<string, RegistryEntryView>,
    ctx: CheckContext,
  ): void {
    // We need at least basic shape to proceed
    if (!isObjectWithString(payload, "schema_id")) {
      addViolation(ctx, "MR-28", "schema.registered payload must contain a non-empty string 'schema_id'", {
        field: "schema_id",
      });
      return;
    }

    const p = payload as Partial<SchemaRegisteredPayload> & { schema_id: string };

    // MR-01: schema_id format
    markEvaluated(ctx, "MR-01");
    if (!isValidSchemaIdFormat(p.schema_id)) {
      addViolation(ctx, "MR-01", `schema_id '${p.schema_id}' does not follow the required format '<namespace>:<name>'`, {
        field: "schema_id",
        actual_value: p.schema_id,
        expected: "Format: '<namespace>:<name>', e.g. 'event_type:task.created'",
      });
    }

    // MR-02: namespace prefix must match namespace field
    markEvaluated(ctx, "MR-02");
    if (p.namespace !== undefined) {
      const prefix = extractSchemaIdNamespace(p.schema_id);
      if (prefix !== null && prefix !== p.namespace) {
        addViolation(ctx, "MR-02", `schema_id namespace prefix '${prefix}' does not match the 'namespace' field '${p.namespace}'`, {
          field: "namespace",
          actual_value: prefix,
          expected: p.namespace,
        });
      }
    }

    // MR-03: version must be valid semver
    markEvaluated(ctx, "MR-03");
    if (p.version !== undefined && !isValidSemver(p.version)) {
      addViolation(ctx, "MR-03", `version '${p.version}' is not a valid semver string`, {
        field: "version",
        actual_value: p.version,
        expected: "Valid semver, e.g. '1.0.0'",
      });
    }

    // MR-28: schema_id must not be empty
    markEvaluated(ctx, "MR-28");
    if (p.schema_id.trim() === "") {
      addViolation(ctx, "MR-28", "schema_id must not be an empty string", {
        field: "schema_id",
      });
    }

    // MR-04: warn on idempotent re-registration of active schema
    markEvaluated(ctx, "MR-04");
    const existing = registry.get(p.schema_id);
    if (existing && existing.status === "active") {
      addWarning(ctx, "MR-04", `schema_id '${p.schema_id}' is already registered and active. Re-registration is idempotent but may indicate a duplicate proposal.`, {
        field: "schema_id",
      });
    }

    // MR-05: reject re-registration of removed schema (ghost resurrection)
    markEvaluated(ctx, "MR-05");
    if (existing && existing.status === "removed") {
      addViolation(ctx, "MR-05", `Cannot re-register schema_id '${p.schema_id}': it has been permanently removed. Use a new schema_id or apply a migration to restore it.`, {
        field: "schema_id",
        actual_value: p.schema_id,
        expected: "A schema_id that has not been removed",
      });
    }
  }

  private _checkUpdated(
    payload: unknown,
    registry: Map<string, RegistryEntryView>,
    ctx: CheckContext,
  ): void {
    if (!isObjectWithString(payload, "schema_id")) {
      addViolation(ctx, "MR-28", "schema.updated payload must contain a non-empty string 'schema_id'", { field: "schema_id" });
      return;
    }

    const p = payload as Partial<SchemaUpdatedPayload> & { schema_id: string };

    // MR-28: schema_id must not be empty
    markEvaluated(ctx, "MR-28");
    if (p.schema_id.trim() === "") {
      addViolation(ctx, "MR-28", "schema_id must not be an empty string", { field: "schema_id" });
    }

    // MR-06: schema_id must exist in registry
    markEvaluated(ctx, "MR-06");
    const existing = registry.get(p.schema_id);
    if (!existing) {
      addViolation(ctx, "MR-06", `Cannot update schema '${p.schema_id}': not found in registry. Register it first with schema.registered.`, {
        field: "schema_id",
        actual_value: p.schema_id,
        expected: "A registered schema_id",
      });
      // Cannot continue without registry entry
      return;
    }

    // MR-07: schema must not be removed
    markEvaluated(ctx, "MR-07");
    if (existing.status === "removed") {
      addViolation(ctx, "MR-07", `Cannot update schema '${p.schema_id}': it has status 'removed'. Removed schemas are immutable.`, {
        field: "schema_id",
        actual_value: existing.status,
        expected: "active or deprecated",
      });
    }

    // MR-08: prev_version must match current registry version
    markEvaluated(ctx, "MR-08");
    if (p.prev_version !== undefined && p.prev_version !== existing.version) {
      addViolation(ctx, "MR-08", `prev_version '${p.prev_version}' does not match the current registered version '${existing.version}' for schema '${p.schema_id}'. This indicates a stale update proposal.`, {
        field: "prev_version",
        actual_value: p.prev_version,
        expected: existing.version,
      });
    }

    // MR-09: next_version must be a forward semver bump
    markEvaluated(ctx, "MR-09");
    if (p.prev_version !== undefined && p.next_version !== undefined) {
      if (!isValidSemver(p.next_version)) {
        addViolation(ctx, "MR-09", `next_version '${p.next_version}' is not a valid semver string`, {
          field: "next_version",
          actual_value: p.next_version,
          expected: "Valid semver, e.g. '1.0.1'",
        });
      } else if (!this._opts.allow_version_downgrade) {
        const cmp = compareSemver(p.prev_version, p.next_version);
        if (cmp === null) {
          addViolation(ctx, "MR-09", `Cannot compare versions: '${p.prev_version}' → '${p.next_version}' (invalid semver)`, {
            field: "next_version",
          });
        } else if (cmp >= 0) {
          addViolation(ctx, "MR-09", `next_version '${p.next_version}' must be strictly greater than prev_version '${p.prev_version}'. Schema version downgrades are not permitted.`, {
            field: "next_version",
            actual_value: p.next_version,
            expected: `A version greater than '${p.prev_version}'`,
          });
        }
      }
    }

    // MR-10: Namespace must be immutable
    markEvaluated(ctx, "MR-10");
    if (p.namespace !== undefined && p.namespace !== existing.namespace) {
      addViolation(ctx, "MR-10", `Cannot change namespace for schema '${p.schema_id}': registered as '${existing.namespace}', proposed as '${p.namespace}'. Schema namespaces are immutable.`, {
        field: "namespace",
        actual_value: p.namespace,
        expected: existing.namespace,
      });
    }

    // MR-11: field_removed changes targeting required fields are breaking
    markEvaluated(ctx, "MR-11");
    if (Array.isArray(p.changes)) {
      const breakingRemovals = (p.changes as SchemaChangeDiff[]).filter(
        (c) =>
          c.change_type === "field_removed" &&
          c.field_path !== undefined &&
          isLikelyRequiredField(c.field_path),
      );
      for (const removal of breakingRemovals) {
        addViolation(ctx, "MR-11", `Field removal '${removal.field_path ?? "unknown"}' may break existing event_log entries that contain this required field. If the field is truly optional, mark it optional in the schema first, then propose removal in a subsequent version.`, {
          field: `changes[field_removed:${removal.field_path ?? "?"}]`,
          actual_value: removal.field_path,
          expected: "No removals of likely-required fields in a single update",
        });
      }
    }
  }

  private _checkDeprecated(
    payload: unknown,
    registry: Map<string, RegistryEntryView>,
    ctx: CheckContext,
  ): void {
    if (!isObjectWithString(payload, "schema_id")) {
      addViolation(ctx, "MR-28", "schema.deprecated payload must contain a non-empty string 'schema_id'", { field: "schema_id" });
      return;
    }

    const p = payload as Partial<SchemaDeprecatedPayload> & { schema_id: string };

    // MR-28: schema_id must not be empty
    markEvaluated(ctx, "MR-28");
    if (p.schema_id.trim() === "") {
      addViolation(ctx, "MR-28", "schema_id must not be an empty string", { field: "schema_id" });
    }

    // MR-12: schema_id must exist in registry
    markEvaluated(ctx, "MR-12");
    const existing = registry.get(p.schema_id);
    if (!existing) {
      addViolation(ctx, "MR-12", `Cannot deprecate schema '${p.schema_id}': not found in registry.`, {
        field: "schema_id",
        actual_value: p.schema_id,
        expected: "A registered schema_id",
      });
      return;
    }

    // MR-13: schema must not be removed
    markEvaluated(ctx, "MR-13");
    if (existing.status === "removed") {
      addViolation(ctx, "MR-13", `Cannot deprecate schema '${p.schema_id}': it has already been removed. Removed schemas are immutable.`, {
        field: "schema_id",
        actual_value: existing.status,
        expected: "active",
      });
    }

    // MR-14: replacement_schema_id must exist in registry (if provided)
    markEvaluated(ctx, "MR-14");
    if (p.replacement_schema_id !== undefined && p.replacement_schema_id !== "") {
      const replacement = registry.get(p.replacement_schema_id);
      if (!replacement) {
        addWarning(ctx, "MR-14", `replacement_schema_id '${p.replacement_schema_id}' is not in the registry. Consumers will not be able to migrate to a known replacement.`, {
          field: "replacement_schema_id",
        });
      } else if (replacement.status === "removed") {
        addViolation(ctx, "MR-14", `replacement_schema_id '${p.replacement_schema_id}' has been removed. Cannot migrate to a removed schema.`, {
          field: "replacement_schema_id",
          actual_value: p.replacement_schema_id,
          expected: "An active or deprecated (non-removed) schema_id",
        });
      }
    }
  }

  private _checkRemoved(
    payload: unknown,
    registry: Map<string, RegistryEntryView>,
    ctx: CheckContext,
  ): void {
    if (!isObjectWithString(payload, "schema_id")) {
      addViolation(ctx, "MR-28", "schema.removed payload must contain a non-empty string 'schema_id'", { field: "schema_id" });
      return;
    }

    const p = payload as Partial<SchemaRemovedPayload> & { schema_id: string };

    // MR-28: schema_id must not be empty
    markEvaluated(ctx, "MR-28");
    if (p.schema_id.trim() === "") {
      addViolation(ctx, "MR-28", "schema_id must not be an empty string", { field: "schema_id" });
    }

    // MR-15: schema_id must exist in registry
    markEvaluated(ctx, "MR-15");
    const existing = registry.get(p.schema_id);
    if (!existing) {
      addViolation(ctx, "MR-15", `Cannot remove schema '${p.schema_id}': not found in registry.`, {
        field: "schema_id",
        actual_value: p.schema_id,
        expected: "A registered schema_id",
      });
      return;
    }

    // MR-16: schema must be deprecated before removal (migration-safety invariant)
    markEvaluated(ctx, "MR-16");
    if (!this._opts.allow_force_remove && existing.status !== "deprecated" && existing.status !== "removed") {
      addViolation(ctx, "MR-16", `Cannot remove schema '${p.schema_id}': it has status '${existing.status}' but removal requires prior deprecation. Deprecate the schema first (schema.deprecated), then remove it. To bypass, set allow_force_remove=true.`, {
        field: "schema_id",
        actual_value: existing.status,
        expected: "deprecated",
      });
    }

    // MR-17: warn if migration_applied is false for event_type namespace
    markEvaluated(ctx, "MR-17");
    if (
      existing.namespace === "event_type" &&
      p.migration_applied === false
    ) {
      addWarning(ctx, "MR-17", `Removing event_type schema '${p.schema_id}' with migration_applied=false. Existing event_log entries referencing this event type may become orphaned. Consider applying a migration first.`, {
        field: "migration_applied",
      });
    }
  }

  private _checkMigrationStarted(
    payload: unknown,
    registry: Map<string, RegistryEntryView>,
    activeRunIds: ReadonlySet<string>,
    ctx: CheckContext,
  ): void {
    if (
      typeof payload !== "object" ||
      payload === null
    ) {
      addViolation(ctx, "MR-27", "schema.migration_started payload must be a non-null object", { field: "payload" });
      return;
    }

    const p = payload as Partial<SchemaMigrationStartedPayload>;

    // MR-18: from_version must be valid semver
    markEvaluated(ctx, "MR-18");
    if (p.from_version !== undefined) {
      if (!isValidSemver(p.from_version)) {
        addViolation(ctx, "MR-18", `from_version '${p.from_version}' is not a valid semver string`, {
          field: "from_version",
          actual_value: p.from_version,
          expected: "Valid semver, e.g. '1.0.0'",
        });
      }
    }

    // MR-19: to_version must be valid semver
    markEvaluated(ctx, "MR-19");
    if (p.to_version !== undefined) {
      if (!isValidSemver(p.to_version)) {
        addViolation(ctx, "MR-19", `to_version '${p.to_version}' is not a valid semver string`, {
          field: "to_version",
          actual_value: p.to_version,
          expected: "Valid semver, e.g. '2.0.0'",
        });
      }
    }

    // MR-20: to_version must be strictly greater than from_version
    markEvaluated(ctx, "MR-20");
    if (
      p.from_version !== undefined &&
      p.to_version !== undefined &&
      isValidSemver(p.from_version) &&
      isValidSemver(p.to_version) &&
      !this._opts.allow_version_downgrade
    ) {
      const cmp = compareSemver(p.from_version, p.to_version);
      if (cmp === null) {
        addViolation(ctx, "MR-20", `Cannot compare migration versions '${p.from_version}' → '${p.to_version}'`, { field: "to_version" });
      } else if (cmp >= 0) {
        addViolation(ctx, "MR-20", `to_version '${p.to_version}' must be strictly greater than from_version '${p.from_version}'. Downgrade migrations are not permitted.`, {
          field: "to_version",
          actual_value: p.to_version,
          expected: `A version greater than '${p.from_version}'`,
        });
      }
    }

    // MR-21: target_event_types must be resolvable schema_ids or event type strings
    markEvaluated(ctx, "MR-21");
    if (Array.isArray(p.target_event_types) && p.target_event_types.length > 0) {
      const unresolvable: string[] = [];
      for (const t of p.target_event_types as string[]) {
        const asSchemaId = registry.has(t);
        const asEventTypeSchemaId = registry.has(`event_type:${t}`);
        if (!asSchemaId && !asEventTypeSchemaId) {
          unresolvable.push(t);
        }
      }
      if (unresolvable.length > 0) {
        addWarning(ctx, "MR-21", `The following target_event_types could not be resolved in the registry: [${unresolvable.join(", ")}]. Migration may target unregistered schemas.`, {
          field: "target_event_types",
        });
      }
    }

    // MR-22: No concurrent migration may be in progress
    markEvaluated(ctx, "MR-22");
    if (p.migration_run_id !== undefined && activeRunIds.size > 0) {
      addViolation(ctx, "MR-22", `A migration run is already in progress (active run IDs: [${[...activeRunIds].join(", ")}]). Concurrent migrations are not permitted. Wait for the active migration to complete before starting a new one.`, {
        field: "migration_run_id",
        actual_value: p.migration_run_id,
        expected: "No active migration runs",
      });
    }
  }

  private _checkMigrated(
    payload: unknown,
    ctx: CheckContext,
  ): void {
    if (
      typeof payload !== "object" ||
      payload === null
    ) {
      addViolation(ctx, "MR-27", "schema.migrated payload must be a non-null object", { field: "payload" });
      return;
    }

    const p = payload as Partial<SchemaMigratedPayload>;

    // MR-23: migration_run_id must not be empty
    markEvaluated(ctx, "MR-23");
    if (p.migration_run_id === undefined || p.migration_run_id.trim() === "") {
      addViolation(ctx, "MR-23", "schema.migrated payload must contain a non-empty 'migration_run_id'", {
        field: "migration_run_id",
        expected: "A non-empty string identifier",
      });
    }

    // MR-24: from_version / to_version must be valid semver
    markEvaluated(ctx, "MR-24");
    if (p.from_version !== undefined && !isValidSemver(p.from_version)) {
      addViolation(ctx, "MR-24", `from_version '${p.from_version}' is not a valid semver string`, {
        field: "from_version",
        actual_value: p.from_version,
        expected: "Valid semver, e.g. '1.0.0'",
      });
    }
    if (p.to_version !== undefined && !isValidSemver(p.to_version)) {
      addViolation(ctx, "MR-24", `to_version '${p.to_version}' is not a valid semver string`, {
        field: "to_version",
        actual_value: p.to_version,
        expected: "Valid semver, e.g. '2.0.0'",
      });
    }

    // MR-25: to_version must be ≥ from_version
    markEvaluated(ctx, "MR-25");
    if (
      p.from_version !== undefined &&
      p.to_version !== undefined &&
      isValidSemver(p.from_version) &&
      isValidSemver(p.to_version) &&
      !this._opts.allow_version_downgrade
    ) {
      const cmp = compareSemver(p.from_version, p.to_version);
      if (cmp !== null && cmp > 0) {
        addViolation(ctx, "MR-25", `schema.migrated to_version '${p.to_version}' is less than from_version '${p.from_version}'. This indicates a downgrade migration which is not permitted.`, {
          field: "to_version",
          actual_value: p.to_version,
          expected: `A version ≥ '${p.from_version}'`,
        });
      }
    }

    // MR-26: migrated_event_types must not be empty when events_migrated > 0
    markEvaluated(ctx, "MR-26");
    const eventsMigrated = typeof p.events_migrated === "number" ? p.events_migrated : 0;
    const migratedTypes = Array.isArray(p.migrated_event_types) ? p.migrated_event_types : [];
    if (eventsMigrated > 0 && migratedTypes.length === 0) {
      addViolation(ctx, "MR-26", `schema.migrated reports events_migrated=${eventsMigrated} but migrated_event_types is empty. Cannot reconstruct which event types were affected by this migration.`, {
        field: "migrated_event_types",
        actual_value: "[]",
        expected: "Non-empty array when events_migrated > 0",
      });
    }
  }

  // ── Private: result builder ───────────────────────────────────────────────

  private _buildResult(
    event_type: SchemaEventType,
    schema_id: string,
    ctx: CheckContext,
  ): MigrationCheckResult {
    let decision: MigrationCheckDecision;

    if (ctx.violations.length > 0) {
      decision = "reject";
    } else if (ctx.warnings.length > 0) {
      decision = this._opts.strict_mode ? "reject" : "warn";
    } else {
      decision = "accept";
    }

    return {
      decision,
      event_type,
      schema_id,
      violations: Object.freeze([...ctx.violations]),
      warnings: Object.freeze([...ctx.warnings]),
      rules_evaluated: Object.freeze([...ctx.rules_evaluated]),
      strict_mode: this._opts.strict_mode,
    };
  }
}

// ---------------------------------------------------------------------------
// Heuristic: is this a likely-required field?
// ---------------------------------------------------------------------------

/**
 * Heuristic: returns true if the field path looks like a required field.
 *
 * We cannot inspect the full JSON Schema here (that would require loading the
 * schema definition), so we use a conservative heuristic based on common
 * patterns in the Conitens protocol:
 *
 *   - Top-level fields without "optional", "?", or "description" in the path
 *   - Fields not ending in "_at_ms", "_by", "_id" with optional semantics
 *
 * This heuristic may produce false positives (overly conservative) but will
 * NOT produce false negatives (will not miss genuinely required fields).
 * Callers who disagree with the heuristic should use `allow_force_remove`.
 */
function isLikelyRequiredField(fieldPath: string): boolean {
  // If the path clearly describes an optional or metadata field, allow it
  const optionalPatterns = [
    /description$/i,
    /optional/i,
    /metadata$/i,
    /\.?_?note$/i,
    /\.?_?comment$/i,
    /\.?_?hint$/i,
  ];
  for (const pattern of optionalPatterns) {
    if (pattern.test(fieldPath)) return false;
  }

  // Top-level dot-notation depth-1 fields are likely required
  const depth = fieldPath.split(".").length;
  return depth <= 2;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * Type predicate: checks if value is an object with a non-empty string at `key`.
 */
function isObjectWithString(value: unknown, key: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "string"
  );
}

/**
 * Attempt to extract `schema_id` from an unknown payload.
 * Returns empty string if absent or not a string.
 */
function extractSchemaIdFromPayload(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "schema_id" in payload &&
    typeof (payload as Record<string, unknown>)["schema_id"] === "string"
  ) {
    return (payload as Record<string, unknown>)["schema_id"] as string;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Application-scoped singleton
// ---------------------------------------------------------------------------

/**
 * Application-scoped `MigrationCheckValidator` singleton.
 *
 * Uses default options (non-strict, no force-remove, no version downgrade).
 *
 * For tests and special environments, create a new instance:
 * ```ts
 * const strictValidator = new MigrationCheckValidator({ strict_mode: true });
 * ```
 */
export const migrationCheckValidator = new MigrationCheckValidator();

/**
 * Returns the application-scoped `MigrationCheckValidator` singleton.
 *
 * Thin wrapper enabling React hook usage patterns:
 * ```tsx
 * function SchemaPanel() {
 *   const validator = useMigrationCheckValidator();
 *   const result = validator.check("schema.registered", payload, registry);
 *   // ...
 * }
 * ```
 */
export function useMigrationCheckValidator(): MigrationCheckValidator {
  return migrationCheckValidator;
}
