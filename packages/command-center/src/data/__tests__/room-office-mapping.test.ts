/**
 * room-office-mapping.test.ts — Unit tests for Sub-AC 12 (Sub-AC 1)
 *
 * Validates:
 *   1. Schema version constant is exported and equals 1
 *   2. DEFAULT_ROOM_OFFICE_MAPPING passes validateRoomOfficeMapping() with no errors
 *   3. All three ontology levels are represented (domain, infrastructure, meta)
 *   4. All known agent IDs have domain-level mappings in the config
 *   5. All infrastructure entities map to known rooms (no dangling roomIds)
 *   6. All meta entities map to known rooms
 *   7. Reflexive closure — meta-level "room-mapping" category entry exists
 *   8. Every entity has a non-empty behavioralContract.actions array
 *   9. No duplicate entityIds in the config
 *  10. Query helpers — getMappingsForRoom, getMappingsByLevel, getEntityMapping, etc.
 *  11. buildEntityIndex / buildRoomIndex produce correct O(1) lookup structures
 *  12. initRoomOfficeMapping / getRoomOfficeMapping / resetRoomOfficeMapping lifecycle
 *  13. getCrossRoomEntities returns only entities with canCrossRoomInteract: true
 *  14. formatRoomOccupancySummary returns non-empty string for known rooms
 *  15. Telemetry lives in archive-vault (design constraint: stored separately from EventLog)
 *  16. EventLog lives in archive-vault (append-only, write-once)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ROOM_OFFICE_MAPPING_SCHEMA_VERSION,
  ONTOLOGY_LEVELS,
  KNOWN_ROOM_IDS,
  DEFAULT_ROOM_OFFICE_MAPPING,
  initRoomOfficeMapping,
  getRoomOfficeMapping,
  resetRoomOfficeMapping,
  validateRoomOfficeMapping,
  getMappingsForRoom,
  getMappingsByLevel,
  getMappingsByCategory,
  getEntityMapping,
  getDefaultRoomForEntity,
  buildEntityIndex,
  buildRoomIndex,
  getBehavioralContract,
  getCrossRoomEntities,
  formatRoomOccupancySummary,
  type EntityRoomMapping,
  type RoomOfficeMappingConfig,
} from "../defaults/room-office-mapping.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The 5 static agent IDs from agents.ts */
const EXPECTED_AGENT_IDS = [
  "manager-default",
  "implementer-subagent",
  "researcher-subagent",
  "validator-sentinel",
  "frontend-reviewer",
];

/** Core infrastructure entity IDs expected in the defaults */
const EXPECTED_INFRA_IDS = [
  "event-log",
  "command-pipeline",
  "websocket-bus",
  "task-store",
  "agent-spawner",
  "replay-engine",
  "command-file-ingestion",
  "a2a-client",
  "orchestrator",
];

/** Core meta entity IDs expected in the defaults */
const EXPECTED_META_IDS = [
  "telemetry-collector",
  "schema-registry",
  "self-improvement-pipeline",
  "feedback-store",
  "metrics-aggregator",
  "topology-graph",
  "record-transparency-audit",
  "room-mapping-system",
];

// ---------------------------------------------------------------------------
// 1. Schema version
// ---------------------------------------------------------------------------

describe("ROOM_OFFICE_MAPPING_SCHEMA_VERSION", () => {
  it("is exported and equals 1", () => {
    expect(ROOM_OFFICE_MAPPING_SCHEMA_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Validation passes
// ---------------------------------------------------------------------------

describe("DEFAULT_ROOM_OFFICE_MAPPING", () => {
  it("passes validateRoomOfficeMapping with zero errors", () => {
    const result = validateRoomOfficeMapping(DEFAULT_ROOM_OFFICE_MAPPING);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("has schemaVersion === 1", () => {
    expect(DEFAULT_ROOM_OFFICE_MAPPING.schemaVersion).toBe(1);
  });

  it("has buildingId === 'command-center'", () => {
    expect(DEFAULT_ROOM_OFFICE_MAPPING.buildingId).toBe("command-center");
  });

  it("has at least one mapping per ontology level", () => {
    const levels = ONTOLOGY_LEVELS;
    for (const level of levels) {
      const matches = DEFAULT_ROOM_OFFICE_MAPPING.mappings.filter(
        (m) => m.ontologyLevel === level,
      );
      expect(matches.length, `no mappings for ontology level "${level}"`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. All three ontology levels represented
// ---------------------------------------------------------------------------

describe("ontology levels", () => {
  it("ONTOLOGY_LEVELS contains all three levels in order", () => {
    expect(ONTOLOGY_LEVELS).toEqual(["domain", "infrastructure", "meta"]);
  });

  it("domain level has at least 5 entries (agents + user + project + command)", () => {
    const domain = getMappingsByLevel("domain");
    expect(domain.length).toBeGreaterThanOrEqual(5);
  });

  it("infrastructure level has entries for all core pipeline components", () => {
    const infra = getMappingsByLevel("infrastructure");
    const ids = infra.map((m) => m.entityId);
    for (const id of EXPECTED_INFRA_IDS) {
      expect(ids, `missing infrastructure entity: ${id}`).toContain(id);
    }
  });

  it("meta level has entries for all core observability/evolution components", () => {
    const meta = getMappingsByLevel("meta");
    const ids = meta.map((m) => m.entityId);
    for (const id of EXPECTED_META_IDS) {
      expect(ids, `missing meta entity: ${id}`).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. All static agent IDs have domain-level mappings
// ---------------------------------------------------------------------------

describe("agent mappings (domain level)", () => {
  for (const agentId of EXPECTED_AGENT_IDS) {
    it(`"${agentId}" has a domain-level mapping`, () => {
      const mapping = getEntityMapping(agentId);
      expect(mapping).toBeDefined();
      expect(mapping?.ontologyLevel).toBe("domain");
      expect(mapping?.category).toBe("agent");
    });
  }

  it("manager-default maps to ops-control", () => {
    expect(getDefaultRoomForEntity("manager-default")).toBe("ops-control");
  });

  it("implementer-subagent maps to impl-office", () => {
    expect(getDefaultRoomForEntity("implementer-subagent")).toBe("impl-office");
  });

  it("researcher-subagent maps to research-lab", () => {
    expect(getDefaultRoomForEntity("researcher-subagent")).toBe("research-lab");
  });

  it("validator-sentinel maps to validation-office", () => {
    expect(getDefaultRoomForEntity("validator-sentinel")).toBe("validation-office");
  });

  it("frontend-reviewer maps to review-office", () => {
    expect(getDefaultRoomForEntity("frontend-reviewer")).toBe("review-office");
  });
});

// ---------------------------------------------------------------------------
// 5–6. All entities map to known rooms
// ---------------------------------------------------------------------------

describe("room references", () => {
  const knownRooms = new Set(KNOWN_ROOM_IDS);

  it("every mapping.defaultRoomId references a known room", () => {
    for (const mapping of DEFAULT_ROOM_OFFICE_MAPPING.mappings) {
      expect(
        knownRooms.has(mapping.defaultRoomId),
        `entity "${mapping.entityId}" maps to unknown room "${mapping.defaultRoomId}"`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Reflexive closure
// ---------------------------------------------------------------------------

describe("reflexive closure (meta level)", () => {
  it("has a meta-level 'room-mapping' category entry", () => {
    const entry = getMappingsByCategory("room-mapping");
    expect(entry.length).toBeGreaterThanOrEqual(1);
    expect(entry[0].ontologyLevel).toBe("meta");
  });

  it("validateRoomOfficeMapping does NOT warn about missing reflexive entry", () => {
    const result = validateRoomOfficeMapping(DEFAULT_ROOM_OFFICE_MAPPING);
    const reflexiveWarning = result.warnings.find((w) =>
      w.includes("reflexive closure"),
    );
    expect(reflexiveWarning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Every entity has at least one behavioral action
// ---------------------------------------------------------------------------

describe("behavioral contracts", () => {
  it("every entity has at least one action in behavioralContract.actions", () => {
    for (const mapping of DEFAULT_ROOM_OFFICE_MAPPING.mappings) {
      expect(
        mapping.behavioralContract?.actions?.length,
        `entity "${mapping.entityId}" has empty behavioralContract.actions`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. No duplicate entityIds
// ---------------------------------------------------------------------------

describe("entityId uniqueness", () => {
  it("no two mappings share the same entityId", () => {
    const ids = DEFAULT_ROOM_OFFICE_MAPPING.mappings.map((m) => m.entityId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 10. Query helpers
// ---------------------------------------------------------------------------

describe("getMappingsForRoom", () => {
  it("returns correct entries for ops-control", () => {
    const mappings = getMappingsForRoom("ops-control");
    const ids = mappings.map((m) => m.entityId);
    expect(ids).toContain("manager-default");
    expect(ids).toContain("orchestrator");
  });

  it("returns correct entries for archive-vault", () => {
    const mappings = getMappingsForRoom("archive-vault");
    const ids = mappings.map((m) => m.entityId);
    expect(ids).toContain("event-log");
    expect(ids).toContain("replay-engine");
    expect(ids).toContain("telemetry-collector");
  });

  it("returns empty array for unknown room", () => {
    expect(getMappingsForRoom("nonexistent-room")).toHaveLength(0);
  });
});

describe("getMappingsByLevel", () => {
  it("returns only domain entries for level 'domain'", () => {
    const entries = getMappingsByLevel("domain");
    expect(entries.every((m) => m.ontologyLevel === "domain")).toBe(true);
  });

  it("returns only infrastructure entries for level 'infrastructure'", () => {
    const entries = getMappingsByLevel("infrastructure");
    expect(entries.every((m) => m.ontologyLevel === "infrastructure")).toBe(true);
  });
});

describe("getEntityMapping", () => {
  it("returns the correct mapping for a known entity", () => {
    const m = getEntityMapping("event-log");
    expect(m).toBeDefined();
    expect(m?.ontologyLevel).toBe("infrastructure");
    expect(m?.defaultRoomId).toBe("archive-vault");
  });

  it("returns undefined for unknown entity", () => {
    expect(getEntityMapping("nonexistent-entity")).toBeUndefined();
  });
});

describe("getBehavioralContract", () => {
  it("returns the contract for a known entity", () => {
    const contract = getBehavioralContract("orchestrator");
    expect(contract).toBeDefined();
    expect(contract?.actions.length).toBeGreaterThan(0);
  });

  it("returns undefined for unknown entity", () => {
    expect(getBehavioralContract("ghost-entity")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. Index builders
// ---------------------------------------------------------------------------

describe("buildEntityIndex", () => {
  it("produces a record with all entityIds as keys", () => {
    const index = buildEntityIndex();
    const expectedIds = DEFAULT_ROOM_OFFICE_MAPPING.mappings.map((m) => m.entityId);
    for (const id of expectedIds) {
      expect(index[id]).toBeDefined();
    }
  });

  it("provides O(1) lookup for 'manager-default'", () => {
    const index = buildEntityIndex();
    expect(index["manager-default"].defaultRoomId).toBe("ops-control");
  });
});

describe("buildRoomIndex", () => {
  it("groups all entities by their defaultRoomId", () => {
    const index = buildRoomIndex();
    // ops-control should have manager-default
    const opsEntities = index["ops-control"] ?? [];
    expect(opsEntities.some((m) => m.entityId === "manager-default")).toBe(true);
  });

  it("archive-vault group includes event-log and telemetry-collector", () => {
    const index = buildRoomIndex();
    const archiveEntities = index["archive-vault"] ?? [];
    const archiveIds = archiveEntities.map((m) => m.entityId);
    expect(archiveIds).toContain("event-log");
    expect(archiveIds).toContain("telemetry-collector");
  });
});

// ---------------------------------------------------------------------------
// 12. initRoomOfficeMapping / getRoomOfficeMapping / resetRoomOfficeMapping
// ---------------------------------------------------------------------------

describe("runtime initialization lifecycle", () => {
  beforeEach(() => {
    resetRoomOfficeMapping();
  });

  it("getRoomOfficeMapping returns DEFAULT_ROOM_OFFICE_MAPPING initially", () => {
    const active = getRoomOfficeMapping();
    expect(active.schemaVersion).toBe(DEFAULT_ROOM_OFFICE_MAPPING.schemaVersion);
    expect(active.buildingId).toBe(DEFAULT_ROOM_OFFICE_MAPPING.buildingId);
  });

  it("initRoomOfficeMapping with DEFAULT_ROOM_OFFICE_MAPPING succeeds", () => {
    const result = initRoomOfficeMapping(DEFAULT_ROOM_OFFICE_MAPPING);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("initRoomOfficeMapping with invalid schemaVersion falls back to default", () => {
    const badConfig: RoomOfficeMappingConfig = {
      ...DEFAULT_ROOM_OFFICE_MAPPING,
      schemaVersion: 999,
      mappings: DEFAULT_ROOM_OFFICE_MAPPING.mappings,
    };
    const result = initRoomOfficeMapping(badConfig);
    expect(result.valid).toBe(false);
    // After failure, getRoomOfficeMapping should still return default
    expect(getRoomOfficeMapping().schemaVersion).toBe(1);
  });

  it("resetRoomOfficeMapping restores the default", () => {
    resetRoomOfficeMapping();
    expect(getRoomOfficeMapping().buildingId).toBe("command-center");
  });
});

// ---------------------------------------------------------------------------
// 13. getCrossRoomEntities
// ---------------------------------------------------------------------------

describe("getCrossRoomEntities", () => {
  it("returns only entities with canCrossRoomInteract: true", () => {
    const crossRoom = getCrossRoomEntities();
    for (const m of crossRoom) {
      expect(m.behavioralContract.canCrossRoomInteract).toBe(true);
    }
  });

  it("USER is in cross-room entities (can navigate anywhere)", () => {
    const crossRoom = getCrossRoomEntities();
    expect(crossRoom.some((m) => m.entityId === "USER")).toBe(true);
  });

  it("orchestrator is in cross-room entities", () => {
    const crossRoom = getCrossRoomEntities();
    expect(crossRoom.some((m) => m.entityId === "orchestrator")).toBe(true);
  });

  it("event-log is NOT in cross-room entities (terminal sink)", () => {
    const crossRoom = getCrossRoomEntities();
    expect(crossRoom.some((m) => m.entityId === "event-log")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. formatRoomOccupancySummary
// ---------------------------------------------------------------------------

describe("formatRoomOccupancySummary", () => {
  it("returns a non-empty string for ops-control", () => {
    const summary = formatRoomOccupancySummary("ops-control");
    expect(summary).toBeTruthy();
    expect(summary).toContain("ops-control");
  });

  it("returns a non-empty string for archive-vault", () => {
    const summary = formatRoomOccupancySummary("archive-vault");
    expect(summary).toBeTruthy();
    expect(summary).toContain("archive-vault");
  });

  it("includes ontology level headers in the output", () => {
    const summary = formatRoomOccupancySummary("ops-control");
    // ops-control has domain (manager-default), infrastructure (orchestrator), meta (schema-registry)
    expect(summary).toContain("[DOMAIN]");
    expect(summary).toContain("[INFRASTRUCTURE]");
  });

  it("returns graceful fallback for unknown room", () => {
    const summary = formatRoomOccupancySummary("ghost-room");
    expect(summary).toContain("no entities assigned");
  });
});

// ---------------------------------------------------------------------------
// 15. Telemetry in archive-vault (design constraint)
// ---------------------------------------------------------------------------

describe("design constraint: telemetry stored separately from EventLog", () => {
  it("telemetry-collector lives in archive-vault", () => {
    expect(getDefaultRoomForEntity("telemetry-collector")).toBe("archive-vault");
  });

  it("event-log also lives in archive-vault (but is separate from telemetry)", () => {
    expect(getDefaultRoomForEntity("event-log")).toBe("archive-vault");
  });

  it("telemetry-collector tags include 'separate-storage'", () => {
    const m = getEntityMapping("telemetry-collector");
    expect(m?.tags).toContain("separate-storage");
  });

  it("event-log tags include 'append-only'", () => {
    const m = getEntityMapping("event-log");
    expect(m?.tags).toContain("append-only");
  });
});

// ---------------------------------------------------------------------------
// 16. EventLog is append-only (write-once)
// ---------------------------------------------------------------------------

describe("design constraint: EventLog is append-only", () => {
  it("event-log entity has 'immutable' tag", () => {
    const m = getEntityMapping("event-log");
    expect(m?.tags).toContain("immutable");
  });

  it("event-log behavioralContract.actions includes accept-only language (no mutation)", () => {
    const contract = getBehavioralContract("event-log");
    const actionsStr = contract?.actions.join(" ").toLowerCase() ?? "";
    // Should mention append / accept but NOT delete / mutate / update
    expect(actionsStr).toContain("append");
    expect(actionsStr).not.toContain("delete");
    expect(actionsStr).not.toContain("mutate");
    expect(actionsStr).not.toContain("update");
  });
});
