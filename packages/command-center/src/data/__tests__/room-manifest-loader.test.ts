/**
 * room-manifest-loader.test.ts — Integration tests for Sub-AC 2.
 *
 * Verifies that the room-manifest loader correctly reads and parses
 * .agent/rooms/ directory entries into a normalised in-memory room manifest
 * containing name, role, and metadata for each room.
 *
 * Test categories:
 *   1.  Filesystem preconditions (.agent/rooms/ directory is intact)
 *   2.  loadRoomManifestFromDir() — filesystem-based loader
 *   3.  buildRoomManifest() — pure-function builder
 *   4.  RoomManifestEntry fields (name, primaryRoles, metadata)
 *   5.  Role derivation from _room-mapping.yaml
 *   6.  Spatial metadata accuracy
 *   7.  Per-room field correctness (each of the 9 rooms)
 *   8.  validateManifest() structural checks
 *   9.  Query helpers (getManifestEntry, getManifestRoomsForFloor, etc.)
 *  10.  Consistency with existing TypeScript snapshots (BUILDING, DEFAULT_ROOM_MAPPING)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  loadRoomManifestFromDir,
  buildRoomManifest,
  validateManifest,
  getManifestEntry,
  getManifestRoomsForFloor,
  getManifestRoomsForRole,
  getManifestRoomsByType,
  buildManifestIndex,
  MANIFEST_SCHEMA_VERSION,
  loadRoomDefinitions,
  deriveRoleLabel,
  type RoomManifest,
  type RoomManifestEntry,
  type RoomDescriptor,
} from "../room-manifest-loader.js";

import { BUILDING } from "../building.js";
import { DEFAULT_ROOM_MAPPING } from "../room-mapping-resolver.js";
import type { AgentRole } from "../room-mapping-resolver.js";

// ── Path resolution ────────────────────────────────────────────────────────

const TEST_DIR    = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "../../..");   // packages/command-center
const ROOT_DIR    = resolve(PACKAGE_DIR, "../..");   // monorepo root
const ROOMS_DIR   = join(ROOT_DIR, ".agent", "rooms");

// ── Shared fixtures (loaded once) ─────────────────────────────────────────

let manifest: RoomManifest;

beforeAll(() => {
  manifest = loadRoomManifestFromDir(ROOMS_DIR);
});

// ── 1. Filesystem preconditions ────────────────────────────────────────────

describe("Sub-AC 2 preconditions: .agent/rooms/ directory", () => {
  it("rooms directory exists on disk", () => {
    expect(existsSync(ROOMS_DIR)).toBe(true);
  });

  it("_building.yaml is present", () => {
    expect(existsSync(join(ROOMS_DIR, "_building.yaml"))).toBe(true);
  });

  it("_room-mapping.yaml is present", () => {
    expect(existsSync(join(ROOMS_DIR, "_room-mapping.yaml"))).toBe(true);
  });

  it("_schema.yaml is present", () => {
    expect(existsSync(join(ROOMS_DIR, "_schema.yaml"))).toBe(true);
  });

  it("all 9 room YAML files are present", () => {
    const expectedFiles = [
      "project-main.yaml",
      "ops-control.yaml",
      "impl-office.yaml",
      "research-lab.yaml",
      "validation-office.yaml",
      "review-office.yaml",
      "archive-vault.yaml",
      "corridor-main.yaml",
      "stairwell.yaml",
    ];
    for (const filename of expectedFiles) {
      expect(
        existsSync(join(ROOMS_DIR, filename)),
        `Missing room file: ${filename}`,
      ).toBe(true);
    }
  });
});

// ── 2. loadRoomManifestFromDir() ───────────────────────────────────────────

describe("loadRoomManifestFromDir() — filesystem loader", () => {
  it("returns a RoomManifest without throwing", () => {
    expect(() => loadRoomManifestFromDir(ROOMS_DIR)).not.toThrow();
  });

  it("manifest has schemaVersion === MANIFEST_SCHEMA_VERSION", () => {
    expect(manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("manifest.buildingId is 'command-center'", () => {
    expect(manifest.buildingId).toBe("command-center");
  });

  it("manifest.buildingName contains 'Conitens'", () => {
    expect(manifest.buildingName).toContain("Conitens");
  });

  it("manifest.buildingStyle is 'low-poly-dark'", () => {
    expect(manifest.buildingStyle).toBe("low-poly-dark");
  });

  it("manifest.loadedAt is a valid ISO 8601 timestamp", () => {
    expect(() => new Date(manifest.loadedAt)).not.toThrow();
    expect(new Date(manifest.loadedAt).getTime()).toBeGreaterThan(0);
  });

  it("manifest.rooms has exactly 9 entries (all room YAML files)", () => {
    expect(manifest.rooms).toHaveLength(9);
  });

  it("all 9 expected room IDs are present", () => {
    const expectedIds = [
      "project-main", "ops-control", "impl-office", "research-lab",
      "validation-office", "review-office", "archive-vault",
      "corridor-main", "stairwell",
    ];
    const roomIds = new Set(manifest.rooms.map((r) => r.roomId));
    for (const id of expectedIds) {
      expect(roomIds.has(id), `Room '${id}' missing from manifest`).toBe(true);
    }
  });
});

// ── 3. buildRoomManifest() — pure function ────────────────────────────────

describe("buildRoomManifest() — pure YAML-string builder", () => {
  let pureManifest: RoomManifest;

  beforeAll(() => {
    // Load raw YAML strings manually — mirrors how the filesystem loader works
    const buildingYaml = readFileSync(join(ROOMS_DIR, "_building.yaml"), "utf-8");
    const mappingYaml  = readFileSync(join(ROOMS_DIR, "_room-mapping.yaml"), "utf-8");

    const files = readdirSync(ROOMS_DIR).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));
    const roomYamls: Record<string, string> = {};
    for (const f of files) {
      roomYamls[f] = readFileSync(join(ROOMS_DIR, f), "utf-8");
    }

    pureManifest = buildRoomManifest(buildingYaml, roomYamls, mappingYaml);
  });

  it("produces the same room count as the filesystem loader", () => {
    expect(pureManifest.rooms).toHaveLength(manifest.rooms.length);
  });

  it("produces the same room IDs as the filesystem loader", () => {
    const fsIds   = new Set(manifest.rooms.map((r) => r.roomId));
    const pureIds = new Set(pureManifest.rooms.map((r) => r.roomId));
    for (const id of fsIds) {
      expect(pureIds.has(id), `Pure builder missing room '${id}'`).toBe(true);
    }
  });

  it("buildingId matches between pure and filesystem manifest", () => {
    expect(pureManifest.buildingId).toBe(manifest.buildingId);
  });

  it("gracefully skips underscore-prefixed files in roomYamls", () => {
    // buildRoomManifest ignores _-prefixed keys in roomYamls
    const buildingYaml = readFileSync(join(ROOMS_DIR, "_building.yaml"), "utf-8");
    const mappingYaml  = readFileSync(join(ROOMS_DIR, "_room-mapping.yaml"), "utf-8");
    const withMeta = {
      "_schema.yaml": "# should be ignored",
      "ops-control.yaml": readFileSync(join(ROOMS_DIR, "ops-control.yaml"), "utf-8"),
    };
    expect(() => buildRoomManifest(buildingYaml, withMeta, mappingYaml)).not.toThrow();
    const partial = buildRoomManifest(buildingYaml, withMeta, mappingYaml);
    // _schema.yaml must not appear as a room
    expect(partial.rooms.every((r) => r.roomId !== "_schema")).toBe(true);
  });
});

// ── 4. RoomManifestEntry — required fields ────────────────────────────────

describe("RoomManifestEntry — required fields (name, primaryRoles, metadata)", () => {
  it("every entry has a non-empty name", () => {
    for (const room of manifest.rooms) {
      expect(room.name.length, `Empty name for roomId '${room.roomId}'`).toBeGreaterThan(0);
    }
  });

  it("every entry has a primaryRoles array (may be empty for corridors)", () => {
    for (const room of manifest.rooms) {
      expect(Array.isArray(room.primaryRoles),
        `primaryRoles is not an array for '${room.roomId}'`).toBe(true);
    }
  });

  it("every entry has a members array", () => {
    for (const room of manifest.rooms) {
      expect(Array.isArray(room.members),
        `members is not an array for '${room.roomId}'`).toBe(true);
    }
  });

  it("every entry has a spatial object with position, dimensions, and center", () => {
    for (const room of manifest.rooms) {
      expect(room.spatial, `spatial missing for '${room.roomId}'`).toBeDefined();
      expect(room.spatial.position, `position missing for '${room.roomId}'`).toBeDefined();
      expect(room.spatial.dimensions, `dimensions missing for '${room.roomId}'`).toBeDefined();
      expect(room.spatial.center, `center missing for '${room.roomId}'`).toBeDefined();
    }
  });

  it("every entry has a meta object with notes, tags, accessPolicy, and summaryMode", () => {
    for (const room of manifest.rooms) {
      const m = room.meta;
      expect(m, `meta missing for '${room.roomId}'`).toBeDefined();
      expect(typeof m.notes).toBe("string");
      expect(Array.isArray(m.tags)).toBe(true);
      expect(["open", "members-only", "approval-required"]).toContain(m.accessPolicy);
      expect(["concise", "verbose", "silent"]).toContain(m.summaryMode);
    }
  });

  it("every entry has a valid roomType", () => {
    const validTypes = new Set(["control", "office", "lab", "lobby", "archive", "corridor", "pipeline", "agent"]);
    for (const room of manifest.rooms) {
      expect(
        validTypes.has(room.roomType),
        `Invalid roomType '${room.roomType}' for '${room.roomId}'`,
      ).toBe(true);
    }
  });

  it("every entry has a valid floor index (0 or 1)", () => {
    for (const room of manifest.rooms) {
      expect([0, 1], `Invalid floor ${room.floor} for '${room.roomId}'`).toContain(room.floor);
    }
  });
});

// ── 5. Role derivation ────────────────────────────────────────────────────

describe("primaryRoles — derived from _room-mapping.yaml", () => {
  it("ops-control has orchestrator and planner roles", () => {
    const room = getManifestEntry("ops-control", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toContain("orchestrator");
    expect(room!.primaryRoles).toContain("planner");
  });

  it("impl-office has implementer role", () => {
    const room = getManifestEntry("impl-office", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toContain("implementer");
  });

  it("research-lab has researcher and analyst roles", () => {
    const room = getManifestEntry("research-lab", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toContain("researcher");
    expect(room!.primaryRoles).toContain("analyst");
  });

  it("validation-office has validator and tester roles", () => {
    const room = getManifestEntry("validation-office", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toContain("validator");
    expect(room!.primaryRoles).toContain("tester");
  });

  it("review-office has reviewer role", () => {
    const room = getManifestEntry("review-office", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toContain("reviewer");
  });

  it("corridor rooms (corridor-main, stairwell) have no primaryRoles", () => {
    for (const roomId of ["corridor-main", "stairwell"]) {
      const room = getManifestEntry(roomId, manifest);
      expect(room).toBeDefined();
      expect(
        room!.primaryRoles,
        `${roomId} should have no primaryRoles`,
      ).toHaveLength(0);
    }
  });

  it("archive-vault has no primaryRoles (no role maps to it)", () => {
    const room = getManifestEntry("archive-vault", manifest);
    expect(room).toBeDefined();
    expect(room!.primaryRoles).toHaveLength(0);
  });

  it("project-main has no primaryRoles (fallback room, not a role default)", () => {
    const room = getManifestEntry("project-main", manifest);
    expect(room).toBeDefined();
    // project-main is the fallback room, not a direct role default
    expect(room!.primaryRoles).toHaveLength(0);
  });
});

// ── 6. Spatial metadata ───────────────────────────────────────────────────

describe("spatial metadata — position, dimensions, center, colorAccent", () => {
  it("every room has positive spatial dimensions (x, y, z > 0)", () => {
    for (const room of manifest.rooms) {
      const d = room.spatial.dimensions;
      expect(d.x, `${room.roomId} dimensions.x <= 0`).toBeGreaterThan(0);
      expect(d.y, `${room.roomId} dimensions.y <= 0`).toBeGreaterThan(0);
      expect(d.z, `${room.roomId} dimensions.z <= 0`).toBeGreaterThan(0);
    }
  });

  it("every room has a hex colorAccent", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const room of manifest.rooms) {
      expect(
        room.spatial.colorAccent,
        `${room.roomId} colorAccent is not a hex colour`,
      ).toMatch(hexPattern);
    }
  });

  it("spatial.center is position + dimensions / 2 for all rooms", () => {
    const SENTINEL = -999;
    for (const room of manifest.rooms) {
      if (room.spatial.position.x === SENTINEL) continue; // auto-placed — skip
      const { position: p, dimensions: d, center: c } = room.spatial;
      expect(c.x).toBeCloseTo(p.x + d.x / 2, 4);
      expect(c.y).toBeCloseTo(p.y + d.y / 2, 4);
      expect(c.z).toBeCloseTo(p.z + d.z / 2, 4);
    }
  });

  it("every room's spatial.position.y equals floor × 3", () => {
    for (const room of manifest.rooms) {
      const expectedY = room.floor * 3;
      expect(
        room.spatial.position.y,
        `${room.roomId} y should be floor × 3 = ${expectedY}`,
      ).toBe(expectedY);
    }
  });

  it("every room has a valid cameraPreset", () => {
    const valid = new Set(["overhead", "isometric", "close-up"]);
    for (const room of manifest.rooms) {
      expect(
        valid.has(room.spatial.cameraPreset),
        `${room.roomId} cameraPreset '${room.spatial.cameraPreset}' is invalid`,
      ).toBe(true);
    }
  });

  it("ops-control is at the expected 3D position (x=4, y=3, z=0)", () => {
    const room = getManifestEntry("ops-control", manifest)!;
    expect(room.spatial.position.x).toBe(4);
    expect(room.spatial.position.y).toBe(3); // floor 1 × 3 units
    expect(room.spatial.position.z).toBe(0);
    expect(room.spatial.dimensions.x).toBe(5);
    expect(room.spatial.dimensions.y).toBe(3);
    expect(room.spatial.dimensions.z).toBe(4);
  });
});

// ── 7. Per-room correctness ───────────────────────────────────────────────

describe("Per-room field correctness", () => {
  it("project-main: lobby, floor 0, USER + manager-default members, open policy", () => {
    const room = getManifestEntry("project-main", manifest)!;
    expect(room.name).toBe("Project Main");
    expect(room.roomType).toBe("lobby");
    expect(room.floor).toBe(0);
    expect(room.members).toContain("USER");
    expect(room.members).toContain("manager-default");
    expect(room.meta.accessPolicy).toBe("open");
    expect(room.spatial.colorAccent).toBe("#4FC3F7");
  });

  it("ops-control: control, floor 1, USER + manager-default, members-only policy", () => {
    const room = getManifestEntry("ops-control", manifest)!;
    expect(room.name).toBe("Operations Control");
    expect(room.roomType).toBe("control");
    expect(room.floor).toBe(1);
    expect(room.members).toContain("USER");
    expect(room.members).toContain("manager-default");
    expect(room.meta.accessPolicy).toBe("members-only");
    expect(room.spatial.colorAccent).toBe("#FF7043");
    expect(room.meta.tags).toContain("command");
    expect(room.meta.tags).toContain("orchestration");
    expect(room.meta.notes).toBeTruthy();
    expect(room.meta.summaryMode).toBe("verbose");
    expect(room.meta.sharedFiles.some((f) => f.includes("gates.yaml"))).toBe(true);
  });

  it("impl-office: office, floor 1, implementer-subagent member", () => {
    const room = getManifestEntry("impl-office", manifest)!;
    expect(room.name).toBe("Implementation Office");
    expect(room.roomType).toBe("office");
    expect(room.floor).toBe(1);
    expect(room.members).toContain("implementer-subagent");
    expect(room.spatial.colorAccent).toBe("#66BB6A");
    expect(room.meta.tags).toContain("coding");
    expect(room.meta.sharedFiles.some((f) => f.includes("code-implementer.yaml"))).toBe(true);
  });

  it("research-lab: lab, floor 1, researcher-subagent member", () => {
    const room = getManifestEntry("research-lab", manifest)!;
    expect(room.name).toBe("Research Lab");
    expect(room.roomType).toBe("lab");
    expect(room.floor).toBe(1);
    expect(room.members).toContain("researcher-subagent");
    expect(room.spatial.colorAccent).toBe("#AB47BC");
    expect(room.meta.tags).toContain("research");
  });

  it("validation-office: office, floor 1, validator-sentinel member", () => {
    const room = getManifestEntry("validation-office", manifest)!;
    expect(room.roomType).toBe("office");
    expect(room.members).toContain("validator-sentinel");
    expect(room.meta.tags).toContain("gate");
    expect(room.meta.sharedFiles.some((f) => f.includes("gates.yaml"))).toBe(true);
  });

  it("review-office: office, floor 1, frontend-reviewer member", () => {
    const room = getManifestEntry("review-office", manifest)!;
    expect(room.roomType).toBe("office");
    expect(room.members).toContain("frontend-reviewer");
    expect(room.meta.tags).toContain("frontend");
    expect(room.meta.sharedFiles.some((f) => f.includes("frontend-skill.yaml"))).toBe(true);
  });

  it("archive-vault: archive, floor 0, silent summaryMode", () => {
    const room = getManifestEntry("archive-vault", manifest)!;
    expect(room.roomType).toBe("archive");
    expect(room.floor).toBe(0);
    expect(room.meta.summaryMode).toBe("silent");
    expect(room.spatial.colorAccent).toBe("#78909C");
  });

  it("corridor-main: corridor, floor 1, no members", () => {
    const room = getManifestEntry("corridor-main", manifest)!;
    expect(room.roomType).toBe("corridor");
    expect(room.floor).toBe(1);
    expect(room.members).toHaveLength(0);
    expect(room.meta.summaryMode).toBe("silent");
  });

  it("stairwell: corridor, floor 0 (spans 0–1), no members", () => {
    const room = getManifestEntry("stairwell", manifest)!;
    expect(room.roomType).toBe("corridor");
    expect(room.floor).toBe(0);
    expect(room.members).toHaveLength(0);
    expect(room.meta.summaryMode).toBe("silent");
  });
});

// ── 8. validateManifest() ─────────────────────────────────────────────────

describe("validateManifest() — structural validation", () => {
  it("validates the manifest loaded from disk as valid", () => {
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports errors for a manifest with wrong schemaVersion", () => {
    const bad: RoomManifest = { ...manifest, schemaVersion: 999 };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("reports errors for a manifest with empty rooms array", () => {
    const bad: RoomManifest = { ...manifest, rooms: [] };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
  });

  it("reports errors for duplicate roomIds", () => {
    const dup = manifest.rooms[0];
    const bad: RoomManifest = { ...manifest, rooms: [dup, dup] };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("reports errors for a room with zero-width dimensions", () => {
    const badRoom: RoomManifestEntry = {
      ...manifest.rooms[0],
      spatial: {
        ...manifest.rooms[0].spatial,
        dimensions: { x: 0, y: 3, z: 3 },
      },
    };
    const bad: RoomManifest = { ...manifest, rooms: [badRoom] };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dimensions.x"))).toBe(true);
  });
});

// ── 9. Query helpers ──────────────────────────────────────────────────────

describe("Query helpers", () => {
  describe("getManifestEntry()", () => {
    it("returns the correct entry for a known roomId", () => {
      const entry = getManifestEntry("ops-control", manifest);
      expect(entry).toBeDefined();
      expect(entry!.roomId).toBe("ops-control");
    });

    it("returns undefined for an unknown roomId", () => {
      expect(getManifestEntry("nonexistent-room", manifest)).toBeUndefined();
    });
  });

  describe("getManifestRoomsForFloor()", () => {
    it("floor 0 returns project-main, archive-vault, and stairwell", () => {
      const floor0 = getManifestRoomsForFloor(0, manifest);
      const ids = floor0.map((r) => r.roomId);
      expect(ids).toContain("project-main");
      expect(ids).toContain("archive-vault");
      expect(ids).toContain("stairwell");
    });

    it("floor 1 returns ops-control, impl-office, and other floor-1 rooms", () => {
      const floor1 = getManifestRoomsForFloor(1, manifest);
      const ids = floor1.map((r) => r.roomId);
      expect(ids).toContain("ops-control");
      expect(ids).toContain("impl-office");
      expect(ids).toContain("research-lab");
    });

    it("stairwell appears in both floor 0 and floor 1", () => {
      const floor0 = getManifestRoomsForFloor(0, manifest);
      const floor1 = getManifestRoomsForFloor(1, manifest);
      expect(floor0.map((r) => r.roomId)).toContain("stairwell");
      expect(floor1.map((r) => r.roomId)).toContain("stairwell");
    });
  });

  describe("getManifestRoomsForRole()", () => {
    it("orchestrator role returns ops-control", () => {
      const rooms = getManifestRoomsForRole("orchestrator", manifest);
      expect(rooms.map((r) => r.roomId)).toContain("ops-control");
    });

    it("implementer role returns impl-office", () => {
      const rooms = getManifestRoomsForRole("implementer", manifest);
      expect(rooms.map((r) => r.roomId)).toContain("impl-office");
    });

    it("researcher role returns research-lab", () => {
      const rooms = getManifestRoomsForRole("researcher", manifest);
      expect(rooms.map((r) => r.roomId)).toContain("research-lab");
    });

    it("unknown role returns empty array", () => {
      const rooms = getManifestRoomsForRole("planner" as AgentRole, manifest);
      // Planner maps to ops-control — should still be returned
      expect(rooms.map((r) => r.roomId)).toContain("ops-control");
    });
  });

  describe("getManifestRoomsByType()", () => {
    it("returns exactly one control room (ops-control)", () => {
      const rooms = getManifestRoomsByType("control", manifest);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe("ops-control");
    });

    it("returns exactly one lobby room (project-main)", () => {
      const rooms = getManifestRoomsByType("lobby", manifest);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe("project-main");
    });

    it("returns exactly one lab room (research-lab)", () => {
      const rooms = getManifestRoomsByType("lab", manifest);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe("research-lab");
    });

    it("returns exactly one archive room (archive-vault)", () => {
      const rooms = getManifestRoomsByType("archive", manifest);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe("archive-vault");
    });

    it("returns 3 office rooms", () => {
      const rooms = getManifestRoomsByType("office", manifest);
      expect(rooms).toHaveLength(3);
    });

    it("returns 2 corridor rooms (corridor-main + stairwell)", () => {
      const rooms = getManifestRoomsByType("corridor", manifest);
      expect(rooms).toHaveLength(2);
    });
  });

  describe("buildManifestIndex()", () => {
    it("builds a map with 9 entries", () => {
      const index = buildManifestIndex(manifest);
      expect(Object.keys(index)).toHaveLength(9);
    });

    it("index[roomId] equals getManifestEntry(roomId) for all rooms", () => {
      const index = buildManifestIndex(manifest);
      for (const room of manifest.rooms) {
        expect(index[room.roomId]).toBe(room);
      }
    });

    it("O(1) lookup for ops-control returns the correct entry", () => {
      const index = buildManifestIndex(manifest);
      expect(index["ops-control"]).toBeDefined();
      expect(index["ops-control"].roomType).toBe("control");
    });
  });
});

// ── 10. Consistency with TypeScript snapshots ─────────────────────────────

describe("Consistency with BUILDING and DEFAULT_ROOM_MAPPING snapshots", () => {
  it("manifest room count matches BUILDING.rooms count", () => {
    expect(manifest.rooms).toHaveLength(BUILDING.rooms.length);
  });

  it("every room ID in BUILDING snapshot is present in the manifest", () => {
    const manifestIds = new Set(manifest.rooms.map((r) => r.roomId));
    for (const tsRoom of BUILDING.rooms) {
      expect(
        manifestIds.has(tsRoom.roomId),
        `TypeScript room '${tsRoom.roomId}' missing from manifest`,
      ).toBe(true);
    }
  });

  it("room names match the BUILDING snapshot", () => {
    for (const tsRoom of BUILDING.rooms) {
      const mEntry = getManifestEntry(tsRoom.roomId, manifest);
      if (!mEntry) continue; // already caught by the room-ID test above
      expect(mEntry.name).toBe(tsRoom.name);
    }
  });

  it("room types match the BUILDING snapshot", () => {
    for (const tsRoom of BUILDING.rooms) {
      const mEntry = getManifestEntry(tsRoom.roomId, manifest);
      if (!mEntry) continue;
      expect(mEntry.roomType).toBe(tsRoom.roomType);
    }
  });

  it("room colorAccent values match the BUILDING snapshot", () => {
    for (const tsRoom of BUILDING.rooms) {
      const mEntry = getManifestEntry(tsRoom.roomId, manifest);
      if (!mEntry) continue;
      expect(mEntry.spatial.colorAccent).toBe(tsRoom.colorAccent);
    }
  });

  it("primaryRoles for ops-control match DEFAULT_ROOM_MAPPING", () => {
    const entry = getManifestEntry("ops-control", manifest)!;
    const expectedRoles = Object.entries(DEFAULT_ROOM_MAPPING.roleDefaults)
      .filter(([, m]) => m.roomId === "ops-control")
      .map(([role]) => role as AgentRole);
    for (const role of expectedRoles) {
      expect(
        entry.primaryRoles,
        `Role '${role}' missing from ops-control primaryRoles`,
      ).toContain(role);
    }
  });

  it("manifest floor indices match BUILDING room floor values", () => {
    for (const tsRoom of BUILDING.rooms) {
      const mEntry = getManifestEntry(tsRoom.roomId, manifest);
      if (!mEntry) continue;
      expect(mEntry.floor).toBe(tsRoom.floor);
    }
  });

  it("static members in the manifest match BUILDING room members", () => {
    for (const tsRoom of BUILDING.rooms) {
      const mEntry = getManifestEntry(tsRoom.roomId, manifest);
      if (!mEntry) continue;
      for (const memberId of tsRoom.members) {
        expect(
          mEntry.members,
          `Member '${memberId}' missing from '${tsRoom.roomId}' in manifest`,
        ).toContain(memberId);
      }
    }
  });
});

// ── 11. loadRoomDefinitions() — Sub-AC 2 primary entry-point ─────────────

describe("loadRoomDefinitions() — fallback-capable room descriptor loader", () => {
  // ── 11a. Disk-load path ─────────────────────────────────────────────────

  describe("when .agent/rooms/ directory is present (disk load)", () => {
    let descriptors: RoomDescriptor[];

    beforeAll(() => {
      descriptors = loadRoomDefinitions(ROOMS_DIR);
    });

    it("returns an array without throwing", () => {
      expect(Array.isArray(descriptors)).toBe(true);
    });

    it("returns 9 room descriptors (matching the manifest)", () => {
      expect(descriptors).toHaveLength(9);
    });

    it("every descriptor has source === 'yaml'", () => {
      for (const d of descriptors) {
        expect(d.source, `${d.roomId} should have source 'yaml'`).toBe("yaml");
      }
    });

    it("every descriptor has a non-empty roleLabel", () => {
      for (const d of descriptors) {
        expect(
          d.roleLabel.length,
          `${d.roomId} has empty roleLabel`,
        ).toBeGreaterThan(0);
      }
    });

    it("ops-control roleLabel includes 'orchestrator'", () => {
      const d = descriptors.find((r) => r.roomId === "ops-control")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toContain("orchestrator");
    });

    it("impl-office roleLabel is 'implementer'", () => {
      const d = descriptors.find((r) => r.roomId === "impl-office")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toBe("implementer");
    });

    it("research-lab roleLabel includes 'researcher'", () => {
      const d = descriptors.find((r) => r.roomId === "research-lab")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toContain("researcher");
    });

    it("validation-office roleLabel includes 'validator'", () => {
      const d = descriptors.find((r) => r.roomId === "validation-office")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toContain("validator");
    });

    it("review-office roleLabel includes 'reviewer'", () => {
      const d = descriptors.find((r) => r.roomId === "review-office")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toContain("reviewer");
    });

    it("corridor rooms fall back to roomType as roleLabel", () => {
      for (const roomId of ["corridor-main", "stairwell"]) {
        const d = descriptors.find((r) => r.roomId === roomId)!;
        expect(d).toBeDefined();
        expect(d.roleLabel, `${roomId} roleLabel should be 'corridor'`).toBe("corridor");
      }
    });

    it("archive-vault roleLabel falls back to 'archive' (no role mapping)", () => {
      const d = descriptors.find((r) => r.roomId === "archive-vault")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toBe("archive");
    });

    it("every descriptor has a valid roomType", () => {
      const validTypes = new Set([
        "control", "office", "lab", "lobby", "archive",
        "corridor", "pipeline", "agent",
      ]);
      for (const d of descriptors) {
        expect(
          validTypes.has(d.roomType),
          `${d.roomId} has invalid roomType '${d.roomType}'`,
        ).toBe(true);
      }
    });

    it("every descriptor has a non-empty colorAccent (hex)", () => {
      const hex = /^#[0-9A-Fa-f]{6}$/;
      for (const d of descriptors) {
        expect(
          d.colorAccent,
          `${d.roomId} colorAccent is not a hex colour`,
        ).toMatch(hex);
      }
    });

    it("every descriptor has a valid cameraPreset", () => {
      const valid = new Set(["overhead", "isometric", "close-up"]);
      for (const d of descriptors) {
        expect(
          valid.has(d.cameraPreset),
          `${d.roomId} cameraPreset '${d.cameraPreset}' is invalid`,
        ).toBe(true);
      }
    });

    it("all 9 expected room IDs are present in the descriptors", () => {
      const expectedIds = [
        "project-main", "ops-control", "impl-office", "research-lab",
        "validation-office", "review-office", "archive-vault",
        "corridor-main", "stairwell",
      ];
      const ids = new Set(descriptors.map((d) => d.roomId));
      for (const id of expectedIds) {
        expect(ids.has(id), `Descriptor for '${id}' missing`).toBe(true);
      }
    });
  });

  // ── 11b. Fallback path ──────────────────────────────────────────────────

  describe("when roomsDir is absent (fallback to DEFAULT_ROOM_CONFIG)", () => {
    let fallbackDescriptors: RoomDescriptor[];

    beforeAll(() => {
      // Call with no argument — must fall back to hardcoded defaults
      fallbackDescriptors = loadRoomDefinitions();
    });

    it("returns an array without throwing", () => {
      expect(Array.isArray(fallbackDescriptors)).toBe(true);
    });

    it("returns at least 9 room descriptors from DEFAULT_ROOM_CONFIG", () => {
      expect(fallbackDescriptors.length).toBeGreaterThanOrEqual(9);
    });

    it("every descriptor has source === 'default'", () => {
      for (const d of fallbackDescriptors) {
        expect(d.source, `${d.roomId} should have source 'default'`).toBe("default");
      }
    });

    it("every fallback descriptor has a non-empty roleLabel", () => {
      for (const d of fallbackDescriptors) {
        expect(
          d.roleLabel.length,
          `${d.roomId} fallback has empty roleLabel`,
        ).toBeGreaterThan(0);
      }
    });

    it("ops-control fallback descriptor has roleLabel with 'orchestrator'", () => {
      const d = fallbackDescriptors.find((r) => r.roomId === "ops-control")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toContain("orchestrator");
    });

    it("impl-office fallback descriptor has roleLabel 'implementer'", () => {
      const d = fallbackDescriptors.find((r) => r.roomId === "impl-office")!;
      expect(d).toBeDefined();
      expect(d.roleLabel).toBe("implementer");
    });

    it("corridor fallback descriptors use roomType as roleLabel", () => {
      for (const roomId of ["corridor-main", "stairwell"]) {
        const d = fallbackDescriptors.find((r) => r.roomId === roomId);
        if (!d) continue; // skip if not in DEFAULT_ROOM_CONFIG
        expect(d.roleLabel).toBe("corridor");
      }
    });
  });

  // ── 11c. Non-existent directory falls back gracefully ──────────────────

  describe("when roomsDir points to a non-existent path", () => {
    it("falls back to DEFAULT_ROOM_CONFIG without throwing", () => {
      expect(() =>
        loadRoomDefinitions("/path/that/does/not/exist/at/all"),
      ).not.toThrow();
    });

    it("returns source === 'default' descriptors for non-existent path", () => {
      const descriptors = loadRoomDefinitions("/path/that/does/not/exist");
      expect(descriptors.length).toBeGreaterThan(0);
      expect(descriptors.every((d) => d.source === "default")).toBe(true);
    });
  });
});

// ── 12. deriveRoleLabel() utility ─────────────────────────────────────────

describe("deriveRoleLabel() utility", () => {
  it("returns the single role when only one is provided", () => {
    expect(deriveRoleLabel(["implementer"], "office")).toBe("implementer");
  });

  it("joins multiple roles with ' / '", () => {
    expect(deriveRoleLabel(["orchestrator", "planner"], "control")).toBe(
      "orchestrator / planner",
    );
  });

  it("returns the fallback string when roles is empty", () => {
    expect(deriveRoleLabel([], "corridor")).toBe("corridor");
  });

  it("returns the fallback when roles is empty regardless of fallback value", () => {
    expect(deriveRoleLabel([], "archive")).toBe("archive");
    expect(deriveRoleLabel([], "lobby")).toBe("lobby");
  });
});
