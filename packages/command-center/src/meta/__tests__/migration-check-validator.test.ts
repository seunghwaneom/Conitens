/**
 * migration-check-validator.test.ts
 * Sub-AC 11b — Tests for the MigrationCheckValidator.
 *
 * Coverage:
 *   MR-01  schema.registered: schema_id must follow "<namespace>:<name>" format
 *   MR-02  schema.registered: namespace prefix in schema_id must match namespace field
 *   MR-03  schema.registered: version must be valid semver
 *   MR-04  schema.registered: re-registering active schema → warn
 *   MR-05  schema.registered: re-registering removed schema → reject
 *   MR-06  schema.updated: schema_id must exist in registry
 *   MR-07  schema.updated: schema must not be removed
 *   MR-08  schema.updated: prev_version must match current registry version
 *   MR-09  schema.updated: next_version must be a forward semver bump
 *   MR-10  schema.updated: namespace must be immutable
 *   MR-11  schema.updated: field_removed changes on likely-required fields → reject
 *   MR-12  schema.deprecated: schema_id must exist in registry
 *   MR-13  schema.deprecated: schema must not be removed
 *   MR-14  schema.deprecated: replacement_schema_id must be resolvable (if provided)
 *   MR-15  schema.removed: schema_id must exist in registry
 *   MR-16  schema.removed: schema must be deprecated before removal
 *   MR-17  schema.removed: warn if migration_applied=false for event_type namespace
 *   MR-18  schema.migration_started: from_version must be valid semver
 *   MR-19  schema.migration_started: to_version must be valid semver
 *   MR-20  schema.migration_started: to_version must be strictly > from_version
 *   MR-21  schema.migration_started: target_event_types warnings for unresolvable types
 *   MR-22  schema.migration_started: concurrent migration guard
 *   MR-23  schema.migrated: migration_run_id must not be empty
 *   MR-24  schema.migrated: from/to versions must be valid semver
 *   MR-25  schema.migrated: to_version must be ≥ from_version
 *   MR-26  schema.migrated: migrated_event_types must not be empty when events_migrated > 0
 *   MR-27  All events: null/undefined payload → reject
 *   MR-28  All relevant events: empty schema_id → reject
 *
 *   Utility functions:
 *     isValidSemver()
 *     compareSemver()
 *     isSemverBump()
 *     isValidSchemaIdFormat()
 *     extractSchemaIdNamespace()
 *
 *   Options:
 *     strict_mode: warnings escalated to rejections
 *     allow_force_remove: bypasses MR-16
 *     allow_version_downgrade: bypasses MR-09, MR-20, MR-25
 *
 *   Singleton:
 *     migrationCheckValidator singleton exported correctly
 *     useMigrationCheckValidator() returns singleton
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MigrationCheckValidator,
  migrationCheckValidator,
  useMigrationCheckValidator,
  isValidSemver,
  compareSemver,
  isSemverBump,
  isValidSchemaIdFormat,
  extractSchemaIdNamespace,
  type MigrationCheckResult,
  type RegistryEntryView,
} from "../migration-check-validator.js";

// ── Helper builders ────────────────────────────────────────────────────────────

function makeRegistry(entries: RegistryEntryView[]): Map<string, RegistryEntryView> {
  return new Map(entries.map((e) => [e.schema_id, e]));
}

const ACTIVE_ENTRY: RegistryEntryView = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  status: "active",
  version: "1.0.0",
};

const DEPRECATED_ENTRY: RegistryEntryView = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  status: "deprecated",
  version: "1.0.0",
};

const REMOVED_ENTRY: RegistryEntryView = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  status: "removed",
  version: "1.0.0",
};

// ── Utility function tests ─────────────────────────────────────────────────────

describe("isValidSemver", () => {
  it("accepts canonical semver strings", () => {
    expect(isValidSemver("1.0.0")).toBe(true);
    expect(isValidSemver("0.0.1")).toBe(true);
    expect(isValidSemver("10.20.30")).toBe(true);
  });

  it("accepts semver with pre-release suffix", () => {
    expect(isValidSemver("1.0.0-beta.1")).toBe(true);
    expect(isValidSemver("2.0.0-rc.3")).toBe(true);
  });

  it("accepts semver with build metadata", () => {
    expect(isValidSemver("1.0.0+build.1")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isValidSemver("")).toBe(false);
    expect(isValidSemver("1.0")).toBe(false);
    expect(isValidSemver("v1.0.0")).toBe(false);
    expect(isValidSemver("abc")).toBe(false);
    expect(isValidSemver("1.0.0.0")).toBe(false);
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("2.3.4", "2.3.4")).toBe(0);
  });

  it("returns -1 when a < b", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });

  it("returns 1 when a > b", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
  });

  it("returns null for invalid semver", () => {
    expect(compareSemver("not-semver", "1.0.0")).toBeNull();
    expect(compareSemver("1.0.0", "bad")).toBeNull();
  });
});

describe("isSemverBump", () => {
  it("returns true for forward bumps", () => {
    expect(isSemverBump("1.0.0", "1.0.1")).toBe(true);
    expect(isSemverBump("1.0.0", "2.0.0")).toBe(true);
    expect(isSemverBump("1.9.9", "2.0.0")).toBe(true);
  });

  it("returns false for same version", () => {
    expect(isSemverBump("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false for downgrades", () => {
    expect(isSemverBump("1.0.1", "1.0.0")).toBe(false);
    expect(isSemverBump("2.0.0", "1.0.0")).toBe(false);
  });

  it("returns false for invalid semver", () => {
    expect(isSemverBump("not-valid", "1.0.0")).toBe(false);
  });
});

describe("isValidSchemaIdFormat", () => {
  it("accepts valid schema_ids", () => {
    expect(isValidSchemaIdFormat("event_type:task.created")).toBe(true);
    expect(isValidSchemaIdFormat("command_type:agent.spawn")).toBe(true);
    expect(isValidSchemaIdFormat("payload:TaskCreatedPayload")).toBe(true);
    expect(isValidSchemaIdFormat("reducer:TaskReducer")).toBe(true);
  });

  it("rejects schema_ids without a colon", () => {
    expect(isValidSchemaIdFormat("taskCreated")).toBe(false);
    expect(isValidSchemaIdFormat("")).toBe(false);
  });

  it("rejects schema_ids with empty namespace or name", () => {
    expect(isValidSchemaIdFormat(":name")).toBe(false);
    expect(isValidSchemaIdFormat("namespace:")).toBe(false);
  });
});

describe("extractSchemaIdNamespace", () => {
  it("extracts namespace from valid schema_ids", () => {
    expect(extractSchemaIdNamespace("event_type:task.created")).toBe("event_type");
    expect(extractSchemaIdNamespace("command_type:agent.spawn")).toBe("command_type");
  });

  it("returns null for invalid schema_ids", () => {
    expect(extractSchemaIdNamespace("nocoron")).toBeNull();
    expect(extractSchemaIdNamespace("")).toBeNull();
    expect(extractSchemaIdNamespace(":name")).toBeNull();
  });
});

// ── MigrationCheckValidator tests ─────────────────────────────────────────────

describe("MigrationCheckValidator", () => {
  let validator: MigrationCheckValidator;

  beforeEach(() => {
    validator = new MigrationCheckValidator();
  });

  // ── MR-27: Null / undefined payloads ─────────────────────────────────────

  describe("MR-27: null/undefined payload → reject", () => {
    it("rejects null payload for schema.registered", () => {
      const result = validator.check("schema.registered", null, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-27")).toBe(true);
    });

    it("rejects undefined payload for schema.updated", () => {
      const result = validator.check("schema.updated", undefined, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-27")).toBe(true);
    });

    it("rejects null payload for schema.migration_started", () => {
      const result = validator.check("schema.migration_started", null, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-27")).toBe(true);
    });
  });

  // ── MR-01: schema_id format ───────────────────────────────────────────────

  describe("MR-01: schema_id format", () => {
    it("rejects schema.registered with bad schema_id format", () => {
      const result = validator.check("schema.registered", {
        schema_id: "bad_format_no_colon",
        namespace: "event_type",
        version: "1.0.0",
        name: "bad",
        registered_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-01")).toBe(true);
    });

    it("accepts schema.registered with valid schema_id format", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-01")).toBe(false);
    });
  });

  // ── MR-02: namespace prefix matches namespace field ────────────────────────

  describe("MR-02: namespace prefix must match namespace field", () => {
    it("rejects when schema_id prefix does not match namespace", () => {
      const result = validator.check("schema.registered", {
        schema_id: "command_type:task.created",
        namespace: "event_type", // mismatch!
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-02")).toBe(true);
    });

    it("accepts when prefix matches namespace", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-02")).toBe(false);
    });
  });

  // ── MR-03: version semver ─────────────────────────────────────────────────

  describe("MR-03: version must be valid semver", () => {
    it("rejects invalid version in schema.registered", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "not-semver",
        name: "task.created",
        registered_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-03")).toBe(true);
    });

    it("accepts valid semver version", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-03")).toBe(false);
    });
  });

  // ── MR-04: warn on re-registration of active schema ───────────────────────

  describe("MR-04: re-registration of active schema → warn", () => {
    it("warns when re-registering an active schema", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      }, registry);
      expect(result.decision).toBe("warn");
      expect(result.warnings.some((w) => w.rule_id === "MR-04")).toBe(true);
    });

    it("does not warn when registering a new schema", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.new",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.new",
        registered_by: "system",
      }, []);
      expect(result.warnings.some((w) => w.rule_id === "MR-04")).toBe(false);
      expect(result.decision).toBe("accept");
    });
  });

  // ── MR-05: reject re-registration of removed schema ───────────────────────

  describe("MR-05: re-registration of removed schema → reject", () => {
    it("rejects when re-registering a removed schema", () => {
      const registry = [REMOVED_ENTRY];
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-05")).toBe(true);
    });
  });

  // ── MR-06: schema.updated: schema_id must exist ───────────────────────────

  describe("MR-06: schema.updated: schema_id must exist in registry", () => {
    it("rejects when schema_id not in registry", () => {
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-06")).toBe(true);
    });

    it("accepts when schema_id exists in registry", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-06")).toBe(false);
    });
  });

  // ── MR-07: schema.updated: must not be removed ────────────────────────────

  describe("MR-07: schema.updated: schema must not be removed", () => {
    it("rejects updating a removed schema", () => {
      const registry = [REMOVED_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-07")).toBe(true);
    });
  });

  // ── MR-08: prev_version must match current ────────────────────────────────

  describe("MR-08: prev_version must match registry version", () => {
    it("rejects when prev_version is stale", () => {
      const registry = [{ ...ACTIVE_ENTRY, version: "1.0.2" }];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0", // stale — registry says 1.0.2
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-08")).toBe(true);
    });

    it("accepts when prev_version matches registry", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-08")).toBe(false);
    });
  });

  // ── MR-09: next_version must be a forward bump ────────────────────────────

  describe("MR-09: next_version must be a forward semver bump", () => {
    it("rejects when next_version is a downgrade", () => {
      const registry = [{ ...ACTIVE_ENTRY, version: "2.0.0" }];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "2.0.0",
        next_version: "1.9.9", // downgrade!
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-09")).toBe(true);
    });

    it("rejects same version (no bump)", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.0", // same — not a bump
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-09")).toBe(true);
    });

    it("accepts with allow_version_downgrade=true", () => {
      const lenient = new MigrationCheckValidator({ allow_version_downgrade: true });
      const registry = [{ ...ACTIVE_ENTRY, version: "2.0.0" }];
      const result = lenient.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "2.0.0",
        next_version: "1.9.9",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-09")).toBe(false);
    });
  });

  // ── MR-10: namespace immutability ─────────────────────────────────────────

  describe("MR-10: namespace must be immutable on update", () => {
    it("rejects when namespace changes", () => {
      const registry = [ACTIVE_ENTRY]; // namespace is event_type
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "command_type", // changed!
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-10")).toBe(true);
    });

    it("accepts when namespace is unchanged", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type", // same
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [],
        updated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-10")).toBe(false);
    });
  });

  // ── MR-11: required field removals are breaking ───────────────────────────

  describe("MR-11: field_removed changes on required fields → reject", () => {
    it("rejects field removal of likely-required top-level field", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [
          {
            change_type: "field_removed",
            field_path: "task_id",
            description: "Removed task_id field",
          },
        ],
        updated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-11")).toBe(true);
    });

    it("accepts field removal of obviously optional field", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.updated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        prev_version: "1.0.0",
        next_version: "1.0.1",
        changes: [
          {
            change_type: "field_removed",
            field_path: "optional_description",
            description: "Removed optional description field",
          },
        ],
        updated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-11")).toBe(false);
    });
  });

  // ── MR-12/13: schema.deprecated existence checks ─────────────────────────

  describe("MR-12/13: schema.deprecated: schema must exist and not be removed", () => {
    it("rejects deprecating unknown schema (MR-12)", () => {
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:unknown",
        namespace: "event_type",
        name: "unknown",
        version: "1.0.0",
        deprecation_reason: "Replaced",
        deprecated_by: "operator",
      }, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-12")).toBe(true);
    });

    it("rejects deprecating removed schema (MR-13)", () => {
      const registry = [REMOVED_ENTRY];
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        deprecation_reason: "Replaced",
        deprecated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-13")).toBe(true);
    });

    it("accepts deprecating an active schema", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        deprecation_reason: "Replaced by task.spawned",
        deprecated_by: "operator",
      }, registry);
      expect(result.decision).toBe("accept");
    });
  });

  // ── MR-14: replacement_schema_id must be resolvable ───────────────────────

  describe("MR-14: replacement_schema_id validation", () => {
    it("warns when replacement_schema_id is not in registry", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        deprecation_reason: "Replaced",
        replacement_schema_id: "event_type:task.spawned", // not in registry
        deprecated_by: "operator",
      }, registry);
      expect(result.decision).toBe("warn");
      expect(result.warnings.some((w) => w.rule_id === "MR-14")).toBe(true);
    });

    it("rejects when replacement_schema_id has been removed", () => {
      const replacementEntry: RegistryEntryView = {
        schema_id: "event_type:task.spawned",
        namespace: "event_type",
        status: "removed",
        version: "1.0.0",
      };
      const registry = [ACTIVE_ENTRY, replacementEntry];
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        deprecation_reason: "Replaced",
        replacement_schema_id: "event_type:task.spawned",
        deprecated_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-14")).toBe(true);
    });

    it("accepts valid replacement_schema_id", () => {
      const replacementEntry: RegistryEntryView = {
        schema_id: "event_type:task.spawned",
        namespace: "event_type",
        status: "active",
        version: "1.0.0",
      };
      const registry = [ACTIVE_ENTRY, replacementEntry];
      const result = validator.check("schema.deprecated", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        deprecation_reason: "Replaced",
        replacement_schema_id: "event_type:task.spawned",
        deprecated_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-14")).toBe(false);
      expect(result.decision).toBe("accept");
    });
  });

  // ── MR-15: schema.removed: must exist ────────────────────────────────────

  describe("MR-15: schema.removed: schema_id must exist", () => {
    it("rejects removing unknown schema", () => {
      const result = validator.check("schema.removed", {
        schema_id: "event_type:unknown",
        namespace: "event_type",
        name: "unknown",
        version: "1.0.0",
        removal_reason: "Obsolete",
        migration_applied: true,
        affected_event_count: 0,
        removed_by: "operator",
      }, []);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-15")).toBe(true);
    });
  });

  // ── MR-16: schema.removed: must be deprecated first ──────────────────────

  describe("MR-16: schema.removed: must be deprecated before removal", () => {
    it("rejects removing an active (non-deprecated) schema", () => {
      const registry = [ACTIVE_ENTRY];
      const result = validator.check("schema.removed", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        removal_reason: "Obsolete",
        migration_applied: true,
        affected_event_count: 0,
        removed_by: "operator",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-16")).toBe(true);
    });

    it("accepts removing a deprecated schema", () => {
      const registry = [DEPRECATED_ENTRY];
      const result = validator.check("schema.removed", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        removal_reason: "Retired after deprecation",
        migration_applied: true,
        affected_event_count: 0,
        removed_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-16")).toBe(false);
    });

    it("bypasses MR-16 with allow_force_remove=true", () => {
      const forceValidator = new MigrationCheckValidator({ allow_force_remove: true });
      const registry = [ACTIVE_ENTRY];
      const result = forceValidator.check("schema.removed", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        removal_reason: "Emergency removal",
        migration_applied: true,
        affected_event_count: 0,
        removed_by: "operator",
      }, registry);
      expect(result.violations.some((v) => v.rule_id === "MR-16")).toBe(false);
    });
  });

  // ── MR-17: warn if migration_applied=false for event_type ─────────────────

  describe("MR-17: warn when migration_applied=false for event_type schema", () => {
    it("warns when removing event_type schema without migration", () => {
      const registry = [DEPRECATED_ENTRY];
      const result = validator.check("schema.removed", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        removal_reason: "Retired",
        migration_applied: false, // ← should warn
        affected_event_count: 100,
        removed_by: "operator",
      }, registry);
      expect(result.warnings.some((w) => w.rule_id === "MR-17")).toBe(true);
    });

    it("does not warn when migration_applied=true", () => {
      const registry = [DEPRECATED_ENTRY];
      const result = validator.check("schema.removed", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        name: "task.created",
        version: "1.0.0",
        removal_reason: "Retired",
        migration_applied: true,
        affected_event_count: 0,
        removed_by: "operator",
      }, registry);
      expect(result.warnings.some((w) => w.rule_id === "MR-17")).toBe(false);
    });
  });

  // ── MR-18/19: migration version semver ────────────────────────────────────

  describe("MR-18/19: migration_started from/to_version semver", () => {
    it("rejects invalid from_version (MR-18)", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "not-semver",
        to_version: "2.0.0",
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-18")).toBe(true);
    });

    it("rejects invalid to_version (MR-19)", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "not-semver",
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-19")).toBe(true);
    });
  });

  // ── MR-20: migration version ordering ─────────────────────────────────────

  describe("MR-20: to_version must be > from_version", () => {
    it("rejects downgrade migration", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "2.0.0",
        to_version: "1.0.0", // downgrade!
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-20")).toBe(true);
    });

    it("accepts forward migration", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-20")).toBe(false);
    });
  });

  // ── MR-21: target_event_types resolution warnings ─────────────────────────

  describe("MR-21: target_event_types warnings for unresolvable types", () => {
    it("warns when target_event_types are not in registry", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        target_event_types: ["unknown.event"],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      }, []);
      expect(result.warnings.some((w) => w.rule_id === "MR-21")).toBe(true);
    });

    it("does not warn when target_event_types are resolvable", () => {
      const registry: RegistryEntryView[] = [
        { schema_id: "event_type:task.created", namespace: "event_type", status: "active", version: "1.0.0" },
      ];
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        target_event_types: ["task.created"], // resolvable via event_type: prefix
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      }, registry);
      expect(result.warnings.some((w) => w.rule_id === "MR-21")).toBe(false);
    });
  });

  // ── MR-22: concurrent migration guard ────────────────────────────────────

  describe("MR-22: concurrent migration guard", () => {
    it("rejects when another migration is in progress", () => {
      const activeRunIds = new Set<string>(["mig-existing"]);
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      }, [], activeRunIds);
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-22")).toBe(true);
    });

    it("accepts when no migration is in progress", () => {
      const result = validator.check("schema.migration_started", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        target_event_types: [],
        estimated_events_count: 0,
        dry_run: false,
        initiated_by: "operator",
      }, [], new Set());
      expect(result.violations.some((v) => v.rule_id === "MR-22")).toBe(false);
    });
  });

  // ── MR-23: migration_run_id must not be empty ─────────────────────────────

  describe("MR-23: schema.migrated: migration_run_id must not be empty", () => {
    it("rejects empty migration_run_id", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "",
        from_version: "1.0.0",
        to_version: "2.0.0",
        migrated_event_types: ["task.created"],
        events_migrated: 10,
        events_failed: 0,
        dry_run: false,
        migrated_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-23")).toBe(true);
    });

    it("accepts non-empty migration_run_id", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        migrated_event_types: ["task.created"],
        events_migrated: 10,
        events_failed: 0,
        dry_run: false,
        migrated_by: "system",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-23")).toBe(false);
    });
  });

  // ── MR-24/25: migrated versions ───────────────────────────────────────────

  describe("MR-24/25: schema.migrated version validation", () => {
    it("rejects invalid to_version in schema.migrated (MR-24)", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "not-semver",
        migrated_event_types: ["task.created"],
        events_migrated: 0,
        events_failed: 0,
        dry_run: false,
        migrated_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-24")).toBe(true);
    });

    it("rejects downgrade in schema.migrated (MR-25)", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "mig-001",
        from_version: "2.0.0",
        to_version: "1.0.0", // downgrade
        migrated_event_types: [],
        events_migrated: 0,
        events_failed: 0,
        dry_run: false,
        migrated_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-25")).toBe(true);
    });
  });

  // ── MR-26: migrated_event_types must not be empty ─────────────────────────

  describe("MR-26: migrated_event_types must not be empty when events_migrated > 0", () => {
    it("rejects schema.migrated with events_migrated > 0 but empty migrated_event_types", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        migrated_event_types: [], // empty!
        events_migrated: 50,
        events_failed: 0,
        dry_run: false,
        migrated_by: "system",
      });
      expect(result.decision).toBe("reject");
      expect(result.violations.some((v) => v.rule_id === "MR-26")).toBe(true);
    });

    it("accepts schema.migrated with events_migrated=0 and empty migrated_event_types", () => {
      const result = validator.check("schema.migrated", {
        migration_run_id: "mig-001",
        from_version: "1.0.0",
        to_version: "2.0.0",
        migrated_event_types: [],
        events_migrated: 0,
        events_failed: 0,
        dry_run: true,
        migrated_by: "system",
      });
      expect(result.violations.some((v) => v.rule_id === "MR-26")).toBe(false);
    });
  });

  // ── Strict mode ────────────────────────────────────────────────────────────

  describe("strict_mode: warnings escalated to rejections", () => {
    it("escalates warn to reject in strict mode", () => {
      const strictValidator = new MigrationCheckValidator({ strict_mode: true });
      const registry = [ACTIVE_ENTRY];
      // MR-04 would normally produce a warn
      const result = strictValidator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      }, registry);
      expect(result.decision).toBe("reject");
      expect(result.strict_mode).toBe(true);
    });

    it("returns accept in non-strict mode for warnings", () => {
      const lenientValidator = new MigrationCheckValidator({ strict_mode: false });
      const registry = [ACTIVE_ENTRY];
      const result = lenientValidator.check("schema.registered", {
        schema_id: "event_type:task.created",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.created",
        registered_by: "system",
      }, registry);
      expect(result.decision).toBe("warn");
    });
  });

  // ── Result structure ───────────────────────────────────────────────────────

  describe("MigrationCheckResult structure", () => {
    it("includes rules_evaluated in the result", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.new",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.new",
        registered_by: "system",
      }, []);
      expect(result.rules_evaluated.length).toBeGreaterThan(0);
      expect(result.rules_evaluated).toContain("MR-01");
      expect(result.rules_evaluated).toContain("MR-02");
      expect(result.rules_evaluated).toContain("MR-03");
    });

    it("includes event_type in the result", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.new",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.new",
        registered_by: "system",
      }, []);
      expect(result.event_type).toBe("schema.registered");
    });

    it("includes schema_id in the result", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.new",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.new",
        registered_by: "system",
      }, []);
      expect(result.schema_id).toBe("event_type:task.new");
    });

    it("violations and warnings are frozen arrays", () => {
      const result = validator.check("schema.registered", {
        schema_id: "event_type:task.new",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.new",
        registered_by: "system",
      }, []);
      expect(Object.isFrozen(result.violations)).toBe(true);
      expect(Object.isFrozen(result.warnings)).toBe(true);
    });

    it("returns accept for valid schema.validation_started (no migration rules)", () => {
      const result = validator.check("schema.validation_started", {
        validation_run_id: "val-001",
        scope: "full",
        schemas_to_check: 10,
        initiated_by: "system",
        started_at_ms: Date.now(),
      }, []);
      expect(result.decision).toBe("accept");
    });

    it("returns accept for valid schema.validated (no migration rules)", () => {
      const result = validator.check("schema.validated", {
        validation_run_id: "val-001",
        scope: "full",
        schemas_checked: 10,
        schemas_valid: 10,
        schemas_invalid: 0,
        results: [],
        passed: true,
        validated_by: "system",
        validated_at_ms: Date.now(),
        duration_ms: 100,
      }, []);
      expect(result.decision).toBe("accept");
    });
  });

  // ── Singleton export ───────────────────────────────────────────────────────

  describe("migrationCheckValidator singleton", () => {
    it("is a MigrationCheckValidator instance", () => {
      expect(migrationCheckValidator).toBeInstanceOf(MigrationCheckValidator);
    });

    it("useMigrationCheckValidator() returns the singleton", () => {
      expect(useMigrationCheckValidator()).toBe(migrationCheckValidator);
    });

    it("singleton produces valid results", () => {
      const result = migrationCheckValidator.check("schema.registered", {
        schema_id: "event_type:task.test",
        namespace: "event_type",
        version: "1.0.0",
        name: "task.test",
        registered_by: "system",
      }, []);
      expect(result.decision).toBe("accept");
    });
  });
});
