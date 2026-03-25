/**
 * @conitens/protocol — Sub-AC 16c: pipeline.* and schema.* EventType tests
 *
 * Validates that:
 *
 *  [Pipeline stage transitions — Sub-AC 16c]
 *  1.  pipeline.stage_started, pipeline.stage_failed, and pipeline.task_routed
 *      are registered in the master EVENT_TYPES array.
 *  2.  All three are registered in PIPELINE_EVENT_TYPES.
 *  3.  No duplicates are introduced into EVENT_TYPES or PIPELINE_EVENT_TYPES.
 *  4.  PIPELINE_EVENT_TYPES remains an exact subset of EVENT_TYPES (no dangling
 *      references).
 *  5.  PIPELINE_PAYLOAD_GUARDS has an entry for every PIPELINE_EVENT_TYPES member
 *      (exhaustiveness check).
 *  6.  Type guards for new pipeline events correctly accept valid payloads and
 *      reject invalid/incomplete ones.
 *  7.  isValidPipelinePayload dispatches correctly for all pipeline event types.
 *
 *  [Schema evolution/validation lifecycle — Sub-AC 16c]
 *  8.  schema.validation_started and schema.migration_started are registered in
 *      EVENT_TYPES.
 *  9.  Both are registered in SCHEMA_EVENT_TYPES.
 *  10. No duplicates are introduced.
 *  11. SCHEMA_PAYLOAD_GUARDS has an entry for every SCHEMA_EVENT_TYPES member.
 *  12. Type guards for new schema events correctly accept valid payloads and
 *      reject invalid ones.
 *  13. isValidSchemaPayload dispatches correctly for new schema event types.
 *
 *  [Regression — Sub-AC 16c must not break 16b or prior]
 *  14. All previously-registered pipeline.* and schema.* event types remain valid.
 *  15. EVENT_TYPES as a whole has no duplicates after all 16c additions.
 *
 * Record transparency is the supreme design principle: each acceptance criterion
 * is tested independently so no AC can be skipped due to another's failure.
 */
import { describe, it, expect } from "vitest";
import {
  // Master registry
  EVENT_TYPES,
  isValidEventType,
  // Pipeline module
  PIPELINE_EVENT_TYPES,
  PIPELINE_EVENT_TYPE_SET,
  isPipelineEventType,
  PIPELINE_PAYLOAD_GUARDS,
  isValidPipelinePayload,
  // New pipeline type guards (Sub-AC 16c)
  isPipelineStageStartedPayload,
  isPipelineStageFailedPayload,
  isPipelineTaskRoutedPayload,
  // Pre-existing pipeline type guards (regression)
  isPipelineStartedPayload,
  isPipelineStepPayload,
  isPipelineStageCompletedPayload,
  isPipelineCompletedPayload,
  isPipelineFailedPayload,
  isPipelineCancelledPayload,
  // Schema module
  SCHEMA_EVENT_TYPES,
  SCHEMA_EVENT_TYPE_SET,
  isSchemaEventType,
  SCHEMA_PAYLOAD_GUARDS,
  isValidSchemaPayload,
  // New schema type guards (Sub-AC 16c)
  isSchemaValidationStartedPayload,
  isSchemaMigrationStartedPayload,
  // Pre-existing schema type guards (regression)
  isSchemaRegisteredPayload,
  isSchemaUpdatedPayload,
  isSchemaDeprecatedPayload,
  isSchemaRemovedPayload,
  isSchemaValidatedPayload,
  isSchemaMigratedPayload,
} from "../src/index.js";

// =============================================================================
// §1 — New pipeline.* EventTypes are registered in master EVENT_TYPES
// =============================================================================

describe("Sub-AC 16c: new pipeline.* EventTypes — master registry", () => {
  const NEW_PIPELINE_EVENT_TYPES = [
    "pipeline.stage_started",
    "pipeline.stage_failed",
    "pipeline.task_routed",
  ] as const;

  it("pipeline.stage_started is in EVENT_TYPES", () => {
    expect(isValidEventType("pipeline.stage_started")).toBe(true);
  });

  it("pipeline.stage_failed is in EVENT_TYPES", () => {
    expect(isValidEventType("pipeline.stage_failed")).toBe(true);
  });

  it("pipeline.task_routed is in EVENT_TYPES", () => {
    expect(isValidEventType("pipeline.task_routed")).toBe(true);
  });

  it("all new pipeline.* types are in EVENT_TYPES (loop)", () => {
    for (const t of NEW_PIPELINE_EVENT_TYPES) {
      expect(isValidEventType(t), `missing from EVENT_TYPES: ${t}`).toBe(true);
    }
  });
});

// =============================================================================
// §2 — New pipeline.* EventTypes are registered in PIPELINE_EVENT_TYPES
// =============================================================================

describe("Sub-AC 16c: new pipeline.* EventTypes — module registry", () => {
  it("pipeline.stage_started is in PIPELINE_EVENT_TYPES", () => {
    expect(isPipelineEventType("pipeline.stage_started")).toBe(true);
  });

  it("pipeline.stage_failed is in PIPELINE_EVENT_TYPES", () => {
    expect(isPipelineEventType("pipeline.stage_failed")).toBe(true);
  });

  it("pipeline.task_routed is in PIPELINE_EVENT_TYPES", () => {
    expect(isPipelineEventType("pipeline.task_routed")).toBe(true);
  });

  it("PIPELINE_EVENT_TYPE_SET membership matches isPipelineEventType", () => {
    expect(PIPELINE_EVENT_TYPE_SET.has("pipeline.stage_started")).toBe(true);
    expect(PIPELINE_EVENT_TYPE_SET.has("pipeline.stage_failed")).toBe(true);
    expect(PIPELINE_EVENT_TYPE_SET.has("pipeline.task_routed")).toBe(true);
  });
});

// =============================================================================
// §3 — No duplicates after Sub-AC 16c pipeline extension
// =============================================================================

describe("Sub-AC 16c: pipeline.* no duplicates", () => {
  it("EVENT_TYPES has no duplicates", () => {
    const s = new Set(EVENT_TYPES);
    expect(s.size).toBe(EVENT_TYPES.length);
  });

  it("PIPELINE_EVENT_TYPES has no duplicates", () => {
    expect(PIPELINE_EVENT_TYPE_SET.size).toBe(PIPELINE_EVENT_TYPES.length);
  });
});

// =============================================================================
// §4 — PIPELINE_EVENT_TYPES is an exact subset of EVENT_TYPES
// =============================================================================

describe("Sub-AC 16c: PIPELINE_EVENT_TYPES subset check", () => {
  it("all PIPELINE_EVENT_TYPES entries are in master EVENT_TYPES (no dangling refs)", () => {
    for (const t of PIPELINE_EVENT_TYPES) {
      expect(isValidEventType(t), `dangling reference: ${t}`).toBe(true);
    }
  });

  it("PIPELINE_EVENT_TYPES matches pipeline.* subset of EVENT_TYPES exactly", () => {
    const fromMaster = (EVENT_TYPES as readonly string[])
      .filter(t => t.startsWith("pipeline."))
      .sort();
    const fromModule = [...PIPELINE_EVENT_TYPES].sort();
    expect(fromMaster).toEqual(fromModule);
  });
});

// =============================================================================
// §5 — PIPELINE_PAYLOAD_GUARDS exhaustiveness
// =============================================================================

describe("Sub-AC 16c: PIPELINE_PAYLOAD_GUARDS exhaustiveness", () => {
  it("has an entry for every PIPELINE_EVENT_TYPES member", () => {
    for (const t of PIPELINE_EVENT_TYPES) {
      expect(
        PIPELINE_PAYLOAD_GUARDS[t],
        `PIPELINE_PAYLOAD_GUARDS missing entry for: ${t}`,
      ).toBeDefined();
      expect(typeof PIPELINE_PAYLOAD_GUARDS[t]).toBe("function");
    }
  });

  it("contains entries for all three new Sub-AC 16c pipeline types", () => {
    expect(typeof PIPELINE_PAYLOAD_GUARDS["pipeline.stage_started"]).toBe("function");
    expect(typeof PIPELINE_PAYLOAD_GUARDS["pipeline.stage_failed"]).toBe("function");
    expect(typeof PIPELINE_PAYLOAD_GUARDS["pipeline.task_routed"]).toBe("function");
  });
});

// =============================================================================
// §6a — Type guard: pipeline.stage_started
// =============================================================================

describe("isPipelineStageStartedPayload", () => {
  const VALID: Record<string, unknown> = {
    pipeline_id:   "pipe_01J3ABC",
    pipeline_name: "agent-bootstrap",
    stage_index:   1,
    stage_name:    "provisioning",
    step_names:    ["room_assign", "resource_alloc"],
    steps_total:   2,
  };

  it("accepts a minimal valid payload", () => {
    expect(isPipelineStageStartedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isPipelineStageStartedPayload({
      ...VALID,
      started_at_ms: 1_700_000_000_000,
      stage_input:   { room_preference: "research-lab" },
    })).toBe(true);
  });

  it("accepts first stage (stage_index = 0)", () => {
    expect(isPipelineStageStartedPayload({
      ...VALID,
      stage_index: 0,
      stage_name: "validation",
      step_names: ["schema_check", "auth_check"],
    })).toBe(true);
  });

  it("accepts empty step_names array (zero-step stage is allowed)", () => {
    expect(isPipelineStageStartedPayload({
      ...VALID,
      step_names:  [],
      steps_total: 0,
    })).toBe(true);
  });

  it("rejects when pipeline_id is missing", () => {
    const { pipeline_id: _, ...rest } = VALID;
    expect(isPipelineStageStartedPayload(rest)).toBe(false);
  });

  it("rejects when pipeline_name is missing", () => {
    const { pipeline_name: _, ...rest } = VALID;
    expect(isPipelineStageStartedPayload(rest)).toBe(false);
  });

  it("rejects when stage_index is not a number", () => {
    expect(isPipelineStageStartedPayload({ ...VALID, stage_index: "1" })).toBe(false);
  });

  it("rejects when stage_name is missing", () => {
    const { stage_name: _, ...rest } = VALID;
    expect(isPipelineStageStartedPayload(rest)).toBe(false);
  });

  it("rejects when step_names is not an array", () => {
    expect(isPipelineStageStartedPayload({ ...VALID, step_names: "step1,step2" })).toBe(false);
  });

  it("rejects when step_names contains non-string elements", () => {
    expect(isPipelineStageStartedPayload({ ...VALID, step_names: [1, 2] })).toBe(false);
  });

  it("rejects when steps_total is not a number", () => {
    expect(isPipelineStageStartedPayload({ ...VALID, steps_total: "2" })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isPipelineStageStartedPayload(null)).toBe(false);
    expect(isPipelineStageStartedPayload("string")).toBe(false);
    expect(isPipelineStageStartedPayload(42)).toBe(false);
    expect(isPipelineStageStartedPayload([])).toBe(false);
    expect(isPipelineStageStartedPayload(undefined)).toBe(false);
  });
});

// =============================================================================
// §6b — Type guard: pipeline.stage_failed
// =============================================================================

describe("isPipelineStageFailedPayload", () => {
  const VALID: Record<string, unknown> = {
    pipeline_id:       "pipe_01J3ABC",
    pipeline_name:     "agent-bootstrap",
    stage_index:       1,
    stage_name:        "provisioning",
    step_names:        ["room_assign", "resource_alloc"],
    failed_step_index: 1,
    failed_step_name:  "resource_alloc",
    error_code:        "RESOURCE_UNAVAILABLE",
    error_message:     "No available slots in research-lab",
    steps_completed:   1,
  };

  it("accepts a minimal valid payload", () => {
    expect(isPipelineStageFailedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isPipelineStageFailedPayload({
      ...VALID,
      duration_ms:      1_500,
      pipeline_aborted: true,
    })).toBe(true);
  });

  it("accepts pipeline_aborted = false (stage failed but pipeline continues)", () => {
    expect(isPipelineStageFailedPayload({
      ...VALID,
      pipeline_aborted: false,
    })).toBe(true);
  });

  it("accepts failed_step_index = 0 (first step failed)", () => {
    expect(isPipelineStageFailedPayload({
      ...VALID,
      failed_step_index: 0,
      failed_step_name:  "room_assign",
      steps_completed:   0,
    })).toBe(true);
  });

  it("rejects when pipeline_id is missing", () => {
    const { pipeline_id: _, ...rest } = VALID;
    expect(isPipelineStageFailedPayload(rest)).toBe(false);
  });

  it("rejects when stage_name is missing", () => {
    const { stage_name: _, ...rest } = VALID;
    expect(isPipelineStageFailedPayload(rest)).toBe(false);
  });

  it("rejects when failed_step_index is not a number", () => {
    expect(isPipelineStageFailedPayload({ ...VALID, failed_step_index: "1" })).toBe(false);
  });

  it("rejects when failed_step_name is missing", () => {
    const { failed_step_name: _, ...rest } = VALID;
    expect(isPipelineStageFailedPayload(rest)).toBe(false);
  });

  it("rejects when error_code is missing", () => {
    const { error_code: _, ...rest } = VALID;
    expect(isPipelineStageFailedPayload(rest)).toBe(false);
  });

  it("rejects when error_message is missing", () => {
    const { error_message: _, ...rest } = VALID;
    expect(isPipelineStageFailedPayload(rest)).toBe(false);
  });

  it("rejects when steps_completed is not a number", () => {
    expect(isPipelineStageFailedPayload({ ...VALID, steps_completed: "1" })).toBe(false);
  });

  it("rejects when step_names contains non-string elements", () => {
    expect(isPipelineStageFailedPayload({ ...VALID, step_names: [null, 2] })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isPipelineStageFailedPayload(null)).toBe(false);
    expect(isPipelineStageFailedPayload(undefined)).toBe(false);
    expect(isPipelineStageFailedPayload(42)).toBe(false);
  });
});

// =============================================================================
// §6c — Type guard: pipeline.task_routed
// =============================================================================

describe("isPipelineTaskRoutedPayload", () => {
  const VALID: Record<string, unknown> = {
    pipeline_id:   "pipe_01J3ABC",
    pipeline_name: "task-dispatch",
    task_id:       "task-99",
    executor_id:   "researcher-2",
    executor_kind: "agent",
  };

  it("accepts a minimal valid payload", () => {
    expect(isPipelineTaskRoutedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isPipelineTaskRoutedPayload({
      ...VALID,
      task_type:             "research",
      routing_strategy:      "capability_match",
      routing_score:         0.87,
      alternative_executors: ["researcher-1", "implementer-2"],
      routing_rationale:     "highest capability_score for task_type=research",
      routed_at_ms:          1_700_000_000_000,
    })).toBe(true);
  });

  it("accepts all valid executor_kind values", () => {
    for (const kind of ["agent", "orchestrator", "pipeline", "system"]) {
      expect(isPipelineTaskRoutedPayload({ ...VALID, executor_kind: kind })).toBe(true);
    }
  });

  it("rejects invalid executor_kind", () => {
    expect(isPipelineTaskRoutedPayload({ ...VALID, executor_kind: "human" })).toBe(false);
    expect(isPipelineTaskRoutedPayload({ ...VALID, executor_kind: "" })).toBe(false);
    expect(isPipelineTaskRoutedPayload({ ...VALID, executor_kind: "queue" })).toBe(false);
  });

  it("rejects when pipeline_id is missing", () => {
    const { pipeline_id: _, ...rest } = VALID;
    expect(isPipelineTaskRoutedPayload(rest)).toBe(false);
  });

  it("rejects when pipeline_name is missing", () => {
    const { pipeline_name: _, ...rest } = VALID;
    expect(isPipelineTaskRoutedPayload(rest)).toBe(false);
  });

  it("rejects when task_id is missing", () => {
    const { task_id: _, ...rest } = VALID;
    expect(isPipelineTaskRoutedPayload(rest)).toBe(false);
  });

  it("rejects when executor_id is missing", () => {
    const { executor_id: _, ...rest } = VALID;
    expect(isPipelineTaskRoutedPayload(rest)).toBe(false);
  });

  it("rejects when executor_kind is missing", () => {
    const { executor_kind: _, ...rest } = VALID;
    expect(isPipelineTaskRoutedPayload(rest)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isPipelineTaskRoutedPayload(null)).toBe(false);
    expect(isPipelineTaskRoutedPayload(undefined)).toBe(false);
    expect(isPipelineTaskRoutedPayload("string")).toBe(false);
    expect(isPipelineTaskRoutedPayload(42)).toBe(false);
  });
});

// =============================================================================
// §7 — isValidPipelinePayload end-to-end dispatch
// =============================================================================

describe("Sub-AC 16c: isValidPipelinePayload end-to-end dispatch", () => {
  it("dispatches correctly for pipeline.stage_started", () => {
    expect(isValidPipelinePayload("pipeline.stage_started", {
      pipeline_id:   "pipe-1",
      pipeline_name: "agent-bootstrap",
      stage_index:   0,
      stage_name:    "validation",
      step_names:    ["schema_check"],
      steps_total:   1,
    })).toBe(true);
  });

  it("dispatches correctly for pipeline.stage_failed", () => {
    expect(isValidPipelinePayload("pipeline.stage_failed", {
      pipeline_id:       "pipe-1",
      pipeline_name:     "agent-bootstrap",
      stage_index:       1,
      stage_name:        "provisioning",
      step_names:        ["room_assign"],
      failed_step_index: 0,
      failed_step_name:  "room_assign",
      error_code:        "ROOM_FULL",
      error_message:     "No free desk slots",
      steps_completed:   0,
    })).toBe(true);
  });

  it("dispatches correctly for pipeline.task_routed", () => {
    expect(isValidPipelinePayload("pipeline.task_routed", {
      pipeline_id:   "pipe-1",
      pipeline_name: "task-dispatch",
      task_id:       "task-42",
      executor_id:   "researcher-1",
      executor_kind: "agent",
    })).toBe(true);
  });

  it("rejects invalid payload for pipeline.stage_started", () => {
    expect(isValidPipelinePayload("pipeline.stage_started", {
      pipeline_id: "pipe-1",
      // missing required fields
    })).toBe(false);
  });

  it("rejects invalid payload for pipeline.task_routed", () => {
    expect(isValidPipelinePayload("pipeline.task_routed", {
      pipeline_id:   "pipe-1",
      pipeline_name: "task-dispatch",
      task_id:       "task-42",
      executor_id:   "researcher-1",
      executor_kind: "invalid_kind",  // invalid
    })).toBe(false);
  });
});

// =============================================================================
// §8 — New schema.* EventTypes are registered in master EVENT_TYPES
// =============================================================================

describe("Sub-AC 16c: new schema.* EventTypes — master registry", () => {
  it("schema.validation_started is in EVENT_TYPES", () => {
    expect(isValidEventType("schema.validation_started")).toBe(true);
  });

  it("schema.migration_started is in EVENT_TYPES", () => {
    expect(isValidEventType("schema.migration_started")).toBe(true);
  });
});

// =============================================================================
// §9 — New schema.* EventTypes are registered in SCHEMA_EVENT_TYPES
// =============================================================================

describe("Sub-AC 16c: new schema.* EventTypes — module registry", () => {
  it("schema.validation_started is in SCHEMA_EVENT_TYPES", () => {
    expect(isSchemaEventType("schema.validation_started")).toBe(true);
  });

  it("schema.migration_started is in SCHEMA_EVENT_TYPES", () => {
    expect(isSchemaEventType("schema.migration_started")).toBe(true);
  });

  it("SCHEMA_EVENT_TYPE_SET membership matches isSchemaEventType", () => {
    expect(SCHEMA_EVENT_TYPE_SET.has("schema.validation_started")).toBe(true);
    expect(SCHEMA_EVENT_TYPE_SET.has("schema.migration_started")).toBe(true);
  });
});

// =============================================================================
// §10 — No duplicates after Sub-AC 16c schema extension
// =============================================================================

describe("Sub-AC 16c: schema.* no duplicates", () => {
  it("SCHEMA_EVENT_TYPES has no duplicates", () => {
    expect(SCHEMA_EVENT_TYPE_SET.size).toBe(SCHEMA_EVENT_TYPES.length);
  });

  it("SCHEMA_EVENT_TYPES matches schema.* subset of EVENT_TYPES exactly", () => {
    const fromMaster = (EVENT_TYPES as readonly string[])
      .filter(t => t.startsWith("schema."))
      .sort();
    const fromModule = [...SCHEMA_EVENT_TYPES].sort();
    expect(fromMaster).toEqual(fromModule);
  });
});

// =============================================================================
// §11 — SCHEMA_PAYLOAD_GUARDS exhaustiveness
// =============================================================================

describe("Sub-AC 16c: SCHEMA_PAYLOAD_GUARDS exhaustiveness", () => {
  it("has an entry for every SCHEMA_EVENT_TYPES member", () => {
    for (const t of SCHEMA_EVENT_TYPES) {
      expect(
        SCHEMA_PAYLOAD_GUARDS[t],
        `SCHEMA_PAYLOAD_GUARDS missing entry for: ${t}`,
      ).toBeDefined();
      expect(typeof SCHEMA_PAYLOAD_GUARDS[t]).toBe("function");
    }
  });

  it("contains entries for both new Sub-AC 16c schema types", () => {
    expect(typeof SCHEMA_PAYLOAD_GUARDS["schema.validation_started"]).toBe("function");
    expect(typeof SCHEMA_PAYLOAD_GUARDS["schema.migration_started"]).toBe("function");
  });
});

// =============================================================================
// §12a — Type guard: schema.validation_started
// =============================================================================

describe("isSchemaValidationStartedPayload", () => {
  const VALID: Record<string, unknown> = {
    validation_run_id: "val_run_01J3ABC",
    scope:             "full",
    initiated_by:      "system",
  };

  it("accepts a minimal valid payload", () => {
    expect(isSchemaValidationStartedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isSchemaValidationStartedPayload({
      ...VALID,
      schemas_to_check:    42,
      agent_id:            "meta-agent-1",
      triggered_by_command: "cmd_01J3XYZ",
      started_at_ms:       1_700_000_000_000,
    })).toBe(true);
  });

  it("accepts all valid scope values", () => {
    for (const scope of ["full", "event_types", "payloads", "reducers", "single"]) {
      expect(isSchemaValidationStartedPayload({ ...VALID, scope })).toBe(true);
    }
  });

  it("accepts initiated_by = 'agent' with agent_id", () => {
    expect(isSchemaValidationStartedPayload({
      ...VALID,
      initiated_by: "agent",
      agent_id:     "meta-agent-1",
    })).toBe(true);
  });

  it("accepts initiated_by = 'operator'", () => {
    expect(isSchemaValidationStartedPayload({
      ...VALID,
      initiated_by: "operator",
    })).toBe(true);
  });

  it("rejects when validation_run_id is missing", () => {
    const { validation_run_id: _, ...rest } = VALID;
    expect(isSchemaValidationStartedPayload(rest)).toBe(false);
  });

  it("rejects when scope is missing", () => {
    const { scope: _, ...rest } = VALID;
    expect(isSchemaValidationStartedPayload(rest)).toBe(false);
  });

  it("rejects when initiated_by is missing", () => {
    const { initiated_by: _, ...rest } = VALID;
    expect(isSchemaValidationStartedPayload(rest)).toBe(false);
  });

  it("rejects when validation_run_id is not a string", () => {
    expect(isSchemaValidationStartedPayload({ ...VALID, validation_run_id: 123 })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isSchemaValidationStartedPayload(null)).toBe(false);
    expect(isSchemaValidationStartedPayload(undefined)).toBe(false);
    expect(isSchemaValidationStartedPayload("string")).toBe(false);
    expect(isSchemaValidationStartedPayload(42)).toBe(false);
    expect(isSchemaValidationStartedPayload([])).toBe(false);
  });
});

// =============================================================================
// §12b — Type guard: schema.migration_started
// =============================================================================

describe("isSchemaMigrationStartedPayload", () => {
  const VALID: Record<string, unknown> = {
    migration_run_id:   "mig_run_01J3ABC",
    from_version:       "conitens.event.v1",
    to_version:         "conitens.event.v2",
    target_event_types: ["task.created", "agent.spawned"],
    dry_run:            false,
    initiated_by:       "operator",
  };

  it("accepts a minimal valid payload", () => {
    expect(isSchemaMigrationStartedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isSchemaMigrationStartedPayload({
      ...VALID,
      estimated_events_count: 5_000,
      agent_id:               "meta-agent-1",
      triggered_by_command:   "cmd_01J3XYZ",
      started_at_ms:          1_700_000_000_000,
    })).toBe(true);
  });

  it("accepts dry_run = true", () => {
    expect(isSchemaMigrationStartedPayload({
      ...VALID,
      dry_run: true,
    })).toBe(true);
  });

  it("accepts empty target_event_types (global migration with type inferred elsewhere)", () => {
    expect(isSchemaMigrationStartedPayload({
      ...VALID,
      target_event_types: [],
    })).toBe(true);
  });

  it("accepts initiated_by = 'agent'", () => {
    expect(isSchemaMigrationStartedPayload({
      ...VALID,
      initiated_by: "agent",
      agent_id:     "meta-agent-1",
    })).toBe(true);
  });

  it("rejects when migration_run_id is missing", () => {
    const { migration_run_id: _, ...rest } = VALID;
    expect(isSchemaMigrationStartedPayload(rest)).toBe(false);
  });

  it("rejects when from_version is missing", () => {
    const { from_version: _, ...rest } = VALID;
    expect(isSchemaMigrationStartedPayload(rest)).toBe(false);
  });

  it("rejects when to_version is missing", () => {
    const { to_version: _, ...rest } = VALID;
    expect(isSchemaMigrationStartedPayload(rest)).toBe(false);
  });

  it("rejects when target_event_types is not an array", () => {
    expect(isSchemaMigrationStartedPayload({
      ...VALID,
      target_event_types: "task.created",
    })).toBe(false);
  });

  it("rejects when dry_run is missing", () => {
    const { dry_run: _, ...rest } = VALID;
    expect(isSchemaMigrationStartedPayload(rest)).toBe(false);
  });

  it("rejects when dry_run is not a boolean", () => {
    expect(isSchemaMigrationStartedPayload({ ...VALID, dry_run: 0 })).toBe(false);
    expect(isSchemaMigrationStartedPayload({ ...VALID, dry_run: "false" })).toBe(false);
  });

  it("rejects when initiated_by is missing", () => {
    const { initiated_by: _, ...rest } = VALID;
    expect(isSchemaMigrationStartedPayload(rest)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isSchemaMigrationStartedPayload(null)).toBe(false);
    expect(isSchemaMigrationStartedPayload(undefined)).toBe(false);
    expect(isSchemaMigrationStartedPayload("string")).toBe(false);
    expect(isSchemaMigrationStartedPayload([])).toBe(false);
  });
});

// =============================================================================
// §13 — isValidSchemaPayload end-to-end dispatch
// =============================================================================

describe("Sub-AC 16c: isValidSchemaPayload end-to-end dispatch", () => {
  it("dispatches correctly for schema.validation_started", () => {
    expect(isValidSchemaPayload("schema.validation_started", {
      validation_run_id: "val-run-1",
      scope:             "full",
      initiated_by:      "system",
    })).toBe(true);
  });

  it("dispatches correctly for schema.migration_started", () => {
    expect(isValidSchemaPayload("schema.migration_started", {
      migration_run_id:   "mig-run-1",
      from_version:       "conitens.event.v1",
      to_version:         "conitens.event.v2",
      target_event_types: ["task.created"],
      dry_run:            true,
      initiated_by:       "operator",
    })).toBe(true);
  });

  it("rejects invalid payload for schema.validation_started", () => {
    expect(isValidSchemaPayload("schema.validation_started", {
      validation_run_id: "val-run-1",
      // missing scope and initiated_by
    })).toBe(false);
  });

  it("rejects invalid payload for schema.migration_started", () => {
    expect(isValidSchemaPayload("schema.migration_started", {
      migration_run_id: "mig-run-1",
      from_version:     "v1",
      to_version:       "v2",
      // missing target_event_types, dry_run, initiated_by
    })).toBe(false);
  });
});

// =============================================================================
// §14 — Regression: previously-registered pipeline.* and schema.* events
// =============================================================================

describe("Sub-AC 16c: regression — previously-registered pipeline.* events", () => {
  const EXISTING_PIPELINE_TYPES = [
    "pipeline.started",
    "pipeline.step",
    "pipeline.stage_completed",
    "pipeline.completed",
    "pipeline.failed",
    "pipeline.cancelled",
  ] as const;

  it("all pre-existing pipeline.* types remain in EVENT_TYPES", () => {
    for (const t of EXISTING_PIPELINE_TYPES) {
      expect(isValidEventType(t), `regressed: ${t}`).toBe(true);
    }
  });

  it("all pre-existing pipeline.* types remain in PIPELINE_EVENT_TYPES", () => {
    for (const t of EXISTING_PIPELINE_TYPES) {
      expect(isPipelineEventType(t), `regressed from module: ${t}`).toBe(true);
    }
  });

  it("pre-existing pipeline type guards still work correctly", () => {
    // pipeline.started
    expect(isPipelineStartedPayload({
      pipeline_id:   "p-1",
      pipeline_name: "test",
      steps:         ["step-a"],
    })).toBe(true);

    // pipeline.step
    expect(isPipelineStepPayload({
      pipeline_id:  "p-1",
      step_index:   0,
      step_name:    "step-a",
      step_status:  "started",
    })).toBe(true);

    // pipeline.stage_completed
    expect(isPipelineStageCompletedPayload({
      pipeline_id:    "p-1",
      pipeline_name:  "test",
      stage_index:    0,
      stage_name:     "validation",
      step_names:     ["schema_check"],
      steps_total:    1,
      steps_completed: 1,
    })).toBe(true);

    // pipeline.completed
    expect(isPipelineCompletedPayload({
      pipeline_id:    "p-1",
      pipeline_name:  "test",
      steps_total:    3,
      steps_completed: 3,
    })).toBe(true);

    // pipeline.failed
    expect(isPipelineFailedPayload({
      pipeline_id:        "p-1",
      pipeline_name:      "test",
      failed_step_index:  1,
      failed_step_name:   "step-b",
      error_code:         "STEP_FAILED",
      error_message:      "step failed",
      steps_completed:    1,
    })).toBe(true);

    // pipeline.cancelled
    expect(isPipelineCancelledPayload({
      pipeline_id:          "p-1",
      pipeline_name:        "test",
      cancellation_code:    "USER_REQUESTED",
      cancellation_reason:  "Operator cancelled",
      steps_completed:      2,
    })).toBe(true);
  });
});

describe("Sub-AC 16c: regression — previously-registered schema.* events", () => {
  const EXISTING_SCHEMA_TYPES = [
    "schema.registered",
    "schema.updated",
    "schema.deprecated",
    "schema.removed",
    "schema.validated",
    "schema.migrated",
  ] as const;

  it("all pre-existing schema.* types remain in EVENT_TYPES", () => {
    for (const t of EXISTING_SCHEMA_TYPES) {
      expect(isValidEventType(t), `regressed: ${t}`).toBe(true);
    }
  });

  it("all pre-existing schema.* types remain in SCHEMA_EVENT_TYPES", () => {
    for (const t of EXISTING_SCHEMA_TYPES) {
      expect(isSchemaEventType(t), `regressed from module: ${t}`).toBe(true);
    }
  });

  it("pre-existing schema type guards still work correctly", () => {
    // schema.registered
    expect(isSchemaRegisteredPayload({
      schema_id:      "event_type:task.created",
      namespace:      "event_type",
      name:           "task.created",
      version:        "1.0.0",
      registered_by:  "system",
    })).toBe(true);

    // schema.updated
    expect(isSchemaUpdatedPayload({
      schema_id:     "event_type:task.created",
      namespace:     "event_type",
      name:          "task.created",
      prev_version:  "1.0.0",
      next_version:  "1.1.0",
      changes:       [{ change_type: "field_added", description: "added priority field" }],
      updated_by:    "operator",
    })).toBe(true);

    // schema.deprecated
    expect(isSchemaDeprecatedPayload({
      schema_id:          "event_type:message.new",
      namespace:          "event_type",
      name:               "message.new",
      version:            "1.0.0",
      deprecation_reason: "Replaced by message.received",
      deprecated_by:      "system",
    })).toBe(true);

    // schema.removed
    expect(isSchemaRemovedPayload({
      schema_id:         "event_type:artifact.generated",
      namespace:         "event_type",
      name:              "artifact.generated",
      version:           "1.0.0",
      removal_reason:    "Replaced by task.artifact_added",
      migration_applied: true,
      removed_by:        "system",
    })).toBe(true);

    // schema.validated
    expect(isSchemaValidatedPayload({
      validation_run_id: "val-run-1",
      scope:             "full",
      schemas_checked:   86,
      schemas_valid:     86,
      schemas_invalid:   0,
      passed:            true,
      validated_by:      "system",
    })).toBe(true);

    // schema.migrated
    expect(isSchemaMigratedPayload({
      migration_run_id:    "mig-run-1",
      from_version:        "conitens.event.v1",
      to_version:          "conitens.event.v2",
      migrated_event_types: ["task.created"],
      events_migrated:     1_000,
      dry_run:             false,
      migrated_by:         "system",
    })).toBe(true);
  });
});

// =============================================================================
// §15 — Global deduplication check after all 16c additions
// =============================================================================

describe("Sub-AC 16c: global EVENT_TYPES deduplication check", () => {
  it("EVENT_TYPES has no duplicates after Sub-AC 16c additions", () => {
    const s = new Set(EVENT_TYPES);
    expect(s.size).toBe(EVENT_TYPES.length);
  });

  it("all 9 pipeline.* EventTypes are reachable from EVENT_TYPES", () => {
    const pipelineTypes = (EVENT_TYPES as readonly string[]).filter(t =>
      t.startsWith("pipeline."),
    );
    // 6 original + 3 new (stage_started, stage_failed, task_routed)
    expect(pipelineTypes.length).toBe(9);
  });

  it("all 8 schema.* EventTypes are reachable from EVENT_TYPES", () => {
    const schemaTypes = (EVENT_TYPES as readonly string[]).filter(t =>
      t.startsWith("schema."),
    );
    // 6 original + 2 new (validation_started, migration_started)
    expect(schemaTypes.length).toBe(8);
  });

  it("no other RFC-1.0.1 event types were inadvertently removed", () => {
    const requiredTypes = [
      // Tasks
      "task.created", "task.assigned", "task.status_changed", "task.completed",
      // Agents
      "agent.spawned", "agent.heartbeat", "agent.terminated",
      // Commands
      "command.issued", "command.acknowledged", "command.completed",
      // Meetings
      "meeting.scheduled", "meeting.started", "meeting.ended",
      // Layout
      "layout.created", "layout.updated",
      // Interactions
      "interaction.user_input", "interaction.selection_changed",
    ];
    for (const t of requiredTypes) {
      expect(isValidEventType(t), `unexpectedly removed: ${t}`).toBe(true);
    }
  });
});
