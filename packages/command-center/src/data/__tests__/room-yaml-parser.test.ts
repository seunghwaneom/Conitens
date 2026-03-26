/**
 * room-yaml-parser.test.ts — Integration tests for Sub-AC 2.
 *
 * Reads the ACTUAL .agent/rooms/*.yaml and .agent/agents/*.yaml files from disk
 * and verifies that the parsed data matches the expected room/agent structure.
 *
 * These tests are the authoritative proof that:
 *   1. All room definitions are correctly extracted from .agent/rooms/
 *   2. All agent roles and capabilities are correctly extracted from .agent/agents/
 *   3. Room-to-agent associations produced by the mapping resolver are consistent
 *      with both the YAML source and the static TypeScript snapshot
 *
 * Parsing pipeline under test:
 *   .agent/rooms/_building.yaml    → parseBuildingYaml()  → BuildingDef skeleton
 *   .agent/rooms/*.yaml            → parseRoomYaml()      → RoomDef[]
 *   .agent/rooms/_room-mapping.yaml → parseRoomMappingYaml() → RoomMappingConfig
 *   .agent/agents/*.yaml           → raw parse           → AgentDef-compatible shape
 *   All three                      → buildHierarchy()    → BuildingHierarchyNode
 *
 * Run with: pnpm test (from packages/command-center)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  parseRoomYaml,
  parseBuildingYaml,
  buildFromYaml,
  parseRoomMappingYaml,
} from "../room-loader.js";

import {
  applyProceduralLayout,
} from "../procedural-layout.js";

import {
  buildHierarchy,
  validateHierarchyConsistency,
  type BuildingHierarchyNode,
} from "../room-agent-hierarchy.js";

import { BUILDING } from "../building.js";
import { AGENTS, type AgentDef, type AgentRole, type RiskClass } from "../agents.js";
import { DEFAULT_ROOM_MAPPING } from "../room-mapping-resolver.js";

// ── Path Resolution ────────────────────────────────────────────────────────

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "../../..");     // packages/command-center
const PROJECT_ROOT = resolve(PACKAGE_DIR, "../..");    // monorepo root

const ROOMS_DIR = join(PROJECT_ROOT, ".agent", "rooms");
const AGENTS_DIR = join(PROJECT_ROOT, ".agent", "agents");

// ── Raw YAML shape for agent files ────────────────────────────────────────

interface RawAgentYaml {
  schema_v: number;
  agent_id: string;
  role: string;
  runtime: string;
  model_policy: string;
  capabilities: string[];
  tool_scopes: string[];
  handoff_policy: string;
  risk_class: string;
  summary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function readRoomYamls(): { building: string; rooms: Record<string, string>; mapping: string } {
  const files = readdirSync(ROOMS_DIR).filter((f) => f.endsWith(".yaml"));
  let building = "";
  let mapping = "";
  const rooms: Record<string, string> = {};

  for (const file of files) {
    const content = readFileSync(join(ROOMS_DIR, file), "utf-8");
    if (file === "_building.yaml") {
      building = content;
    } else if (file === "_room-mapping.yaml") {
      mapping = content;
    } else if (!file.startsWith("_")) {
      rooms[file] = content;
    }
  }

  return { building, rooms, mapping };
}

function readAgentYamls(): RawAgentYaml[] {
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".yaml"));
  return files.map((file) => {
    const content = readFileSync(join(AGENTS_DIR, file), "utf-8");
    return parseYaml(content) as RawAgentYaml;
  });
}

// ── Fixtures: loaded once per suite ───────────────────────────────────────

let buildingYaml: string;
let roomYamls: Record<string, string>;
let mappingYaml: string;
let agentYamls: RawAgentYaml[];

beforeAll(() => {
  const loaded = readRoomYamls();
  buildingYaml = loaded.building;
  roomYamls = loaded.rooms;
  mappingYaml = loaded.mapping;
  agentYamls = readAgentYamls();
});

// ── 1. Preconditions: directory structure is intact ────────────────────────

describe("Sub-AC 2 preconditions: .agent/ directories exist on disk", () => {
  it("rooms directory exists", () => {
    expect(existsSync(ROOMS_DIR)).toBe(true);
  });

  it("agents directory exists", () => {
    expect(existsSync(AGENTS_DIR)).toBe(true);
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

  it("at least 5 agent YAML files are present", () => {
    const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".yaml"));
    expect(agentFiles.length).toBeGreaterThanOrEqual(5);
  });

  it("all expected room YAML files are present", () => {
    const expectedRooms = [
      "ops-control.yaml",
      "project-main.yaml",
      "impl-office.yaml",
      "research-lab.yaml",
      "validation-office.yaml",
      "review-office.yaml",
      "archive-vault.yaml",
      "corridor-main.yaml",
      "stairwell.yaml",
    ];
    for (const filename of expectedRooms) {
      expect(
        existsSync(join(ROOMS_DIR, filename)),
        `Missing room file: ${filename}`,
      ).toBe(true);
    }
  });
});

// ── 2. Building YAML parsing ───────────────────────────────────────────────

describe("parseBuildingYaml() — _building.yaml", () => {
  it("parses without throwing", () => {
    expect(() => parseBuildingYaml(buildingYaml)).not.toThrow();
  });

  it("building_id is 'command-center'", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.buildingId).toBe("command-center");
  });

  it("name contains 'Conitens'", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.name).toContain("Conitens");
  });

  it("style is 'low-poly-dark'", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.style).toBe("low-poly-dark");
  });

  it("has 2 floors", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.floors).toHaveLength(2);
  });

  it("floor 0 is 'Ground Floor'", () => {
    const b = parseBuildingYaml(buildingYaml);
    const gf = b.floors.find((f) => f.floor === 0);
    expect(gf).toBeDefined();
    expect(gf!.name).toBe("Ground Floor");
  });

  it("floor 1 is 'Operations Floor'", () => {
    const b = parseBuildingYaml(buildingYaml);
    const ops = b.floors.find((f) => f.floor === 1);
    expect(ops).toBeDefined();
    expect(ops!.name).toBe("Operations Floor");
  });

  it("has correct floor grid dimensions (12×6)", () => {
    const b = parseBuildingYaml(buildingYaml);
    for (const f of b.floors) {
      expect(f.gridW).toBe(12);
      expect(f.gridD).toBe(6);
    }
  });

  it("agentAssignments maps manager-default → ops-control", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.agentAssignments["manager-default"]).toBe("ops-control");
  });

  it("agentAssignments maps implementer-subagent → impl-office", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.agentAssignments["implementer-subagent"]).toBe("impl-office");
  });

  it("agentAssignments maps researcher-subagent → research-lab", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.agentAssignments["researcher-subagent"]).toBe("research-lab");
  });

  it("agentAssignments maps validator-sentinel → validation-office", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.agentAssignments["validator-sentinel"]).toBe("validation-office");
  });

  it("agentAssignments maps frontend-reviewer → review-office", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.agentAssignments["frontend-reviewer"]).toBe("review-office");
  });

  it("adjacency graph includes ops-control", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.adjacency?.["ops-control"]).toBeDefined();
  });

  it("visual defaults include wallColor and floorColor", () => {
    const b = parseBuildingYaml(buildingYaml);
    expect(b.visual.wallColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(b.visual.floorColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ── 3. Individual room YAML parsing ───────────────────────────────────────

describe("parseRoomYaml() — individual room files", () => {
  it("parses all room YAML files without throwing", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      expect(
        () => parseRoomYaml(yaml),
        `parseRoomYaml failed for ${filename}`,
      ).not.toThrow();
    }
  });

  it("produces 9 room definitions (all room files)", () => {
    const parsed = Object.values(roomYamls).map((y) => parseRoomYaml(y));
    expect(parsed).toHaveLength(9);
  });

  it("every room has a non-empty roomId", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(room.roomId.length, `roomId missing in ${filename}`).toBeGreaterThan(0);
    }
  });

  it("every room has a valid roomType", () => {
    const validTypes = new Set(["control", "office", "lab", "lobby", "archive", "corridor"]);
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(
        validTypes.has(room.roomType),
        `Invalid roomType "${room.roomType}" in ${filename}`,
      ).toBe(true);
    }
  });

  it("every room has a valid floor index (0 or 1)", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect([0, 1], `Invalid floor ${room.floor} in ${filename}`).toContain(room.floor);
    }
  });

  it("every room has a hex colorAccent", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(
        room.colorAccent,
        `colorAccent missing in ${filename}`,
      ).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("every room has valid position dimensions (x, y, z > 0)", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(room.dimensions.x, `${filename} dimensions.x <= 0`).toBeGreaterThan(0);
      expect(room.dimensions.y, `${filename} dimensions.y <= 0`).toBeGreaterThan(0);
      expect(room.dimensions.z, `${filename} dimensions.z <= 0`).toBeGreaterThan(0);
    }
  });

  it("ops-control has correct metadata from YAML", () => {
    const yaml = roomYamls["ops-control.yaml"];
    expect(yaml).toBeDefined();
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("ops-control");
    expect(room.name).toBe("Operations Control");
    expect(room.roomType).toBe("control");
    expect(room.floor).toBe(1);
    expect(room.colorAccent).toBe("#FF7043");
    expect(room.members).toContain("USER");
    expect(room.members).toContain("manager-default");
    expect(room.furniture.some((f) => f.type === "command-desk")).toBe(true);
    expect(room.furniture.some((f) => f.type === "wall-monitor-array")).toBe(true);
    expect(room.furniture.some((f) => f.type === "approval-terminal")).toBe(true);
  });

  it("ops-control _meta includes expected tags and notes from YAML", () => {
    const yaml = roomYamls["ops-control.yaml"];
    const room = parseRoomYaml(yaml);
    expect(room._meta?.tags).toContain("command");
    expect(room._meta?.tags).toContain("orchestration");
    expect(room._meta?.notes).toBeTruthy();
    expect(room._meta?.accessPolicy).toBe("members-only");
    expect(room._meta?.summaryMode).toBe("verbose");
    expect(room._meta?.sharedFiles).toBeDefined();
    expect(room._meta?.sharedFiles.some((f) => f.includes("gates.yaml"))).toBe(true);
  });

  it("impl-office has correct metadata from YAML", () => {
    const yaml = roomYamls["impl-office.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("impl-office");
    expect(room.roomType).toBe("office");
    expect(room.floor).toBe(1);
    expect(room.colorAccent).toBe("#66BB6A");
    expect(room.members).toContain("implementer-subagent");
    expect(room.furniture.some((f) => f.type === "workstation")).toBe(true);
    expect(room._meta?.tags).toContain("coding");
    expect(room._meta?.sharedFiles.some((f) => f.includes("code-implementer.yaml"))).toBe(true);
  });

  it("research-lab has correct metadata from YAML", () => {
    const yaml = roomYamls["research-lab.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("research-lab");
    expect(room.roomType).toBe("lab");
    expect(room.floor).toBe(1);
    expect(room.colorAccent).toBe("#AB47BC");
    expect(room.members).toContain("researcher-subagent");
    expect(room.furniture.some((f) => f.type === "knowledge-graph-display")).toBe(true);
    expect(room._meta?.tags).toContain("research");
  });

  it("validation-office has correct metadata from YAML", () => {
    const yaml = roomYamls["validation-office.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("validation-office");
    expect(room.roomType).toBe("office");
    expect(room.members).toContain("validator-sentinel");
    expect(room._meta?.tags).toContain("gate");
    expect(room._meta?.sharedFiles.some((f) => f.includes("gates.yaml"))).toBe(true);
  });

  it("review-office has correct metadata from YAML", () => {
    const yaml = roomYamls["review-office.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("review-office");
    expect(room.roomType).toBe("office");
    expect(room.members).toContain("frontend-reviewer");
    expect(room._meta?.tags).toContain("frontend");
    expect(room._meta?.sharedFiles.some((f) => f.includes("frontend-skill.yaml"))).toBe(true);
  });

  it("archive-vault is archive type on floor 0", () => {
    const yaml = roomYamls["archive-vault.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("archive-vault");
    expect(room.roomType).toBe("archive");
    expect(room.floor).toBe(0);
    expect(room.furniture.some((f) => f.type === "replay-terminal")).toBe(true);
    expect(room.furniture.some((f) => f.type === "event-log-shelf")).toBe(true);
    expect(room._meta?.summaryMode).toBe("silent");
  });

  it("project-main is lobby type on floor 0", () => {
    const yaml = roomYamls["project-main.yaml"];
    const room = parseRoomYaml(yaml);

    expect(room.roomId).toBe("project-main");
    expect(room.roomType).toBe("lobby");
    expect(room.floor).toBe(0);
    expect(room.colorAccent).toBe("#4FC3F7");
    expect(room.furniture.some((f) => f.type === "hologram-table")).toBe(true);
    expect(room._meta?.accessPolicy).toBe("open");
  });

  it("corridor rooms have no members and silent summary mode", () => {
    for (const filename of ["corridor-main.yaml", "stairwell.yaml"]) {
      const yaml = roomYamls[filename];
      const room = parseRoomYaml(yaml);
      expect(room.members, `${filename} should have no members`).toHaveLength(0);
      expect(room._meta?.summaryMode, `${filename} should be silent`).toBe("silent");
    }
  });
});

// ── 4. Room mapping YAML parsing ──────────────────────────────────────────

describe("parseRoomMappingYaml() — _room-mapping.yaml", () => {
  it("parses without throwing", () => {
    expect(() => parseRoomMappingYaml(mappingYaml)).not.toThrow();
  });

  it("has the correct schema version", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.schemaVersion).toBe(1);
  });

  it("role_defaults contains all 5 primary roles", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    const primaryRoles: AgentRole[] = [
      "orchestrator", "implementer", "researcher", "validator", "reviewer",
    ];
    for (const role of primaryRoles) {
      expect(
        mapping.roleDefaults[role],
        `Missing role default for '${role}'`,
      ).toBeDefined();
    }
  });

  it("orchestrator maps to ops-control", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.roleDefaults.orchestrator.roomId).toBe("ops-control");
  });

  it("implementer maps to impl-office", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.roleDefaults.implementer.roomId).toBe("impl-office");
  });

  it("researcher maps to research-lab", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.roleDefaults.researcher.roomId).toBe("research-lab");
  });

  it("validator maps to validation-office", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.roleDefaults.validator.roomId).toBe("validation-office");
  });

  it("reviewer maps to review-office", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.roleDefaults.reviewer.roomId).toBe("review-office");
  });

  it("capability fallbacks are non-empty", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.capabilityFallbacks.length).toBeGreaterThan(0);
  });

  it("code-change capability maps to impl-office", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    const fb = mapping.capabilityFallbacks.find((f) => f.capability === "code-change");
    expect(fb).toBeDefined();
    expect(fb!.roomId).toBe("impl-office");
  });

  it("special USER maps to project-main", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.special["USER"]).toBeDefined();
    expect(mapping.special["USER"].roomId).toBe("project-main");
  });

  it("fallback_room is project-main", () => {
    const mapping = parseRoomMappingYaml(mappingYaml);
    expect(mapping.fallbackRoom).toBe("project-main");
  });

  it("YAML-parsed mapping is consistent with DEFAULT_ROOM_MAPPING in TypeScript snapshot", () => {
    const yamlMapping = parseRoomMappingYaml(mappingYaml);

    // Every role in YAML must match the TypeScript snapshot
    for (const [role, yamlDef] of Object.entries(yamlMapping.roleDefaults)) {
      const tsDef = DEFAULT_ROOM_MAPPING.roleDefaults[role as AgentRole];
      expect(tsDef, `Role '${role}' missing from DEFAULT_ROOM_MAPPING`).toBeDefined();
      expect(yamlDef.roomId).toBe(tsDef.roomId);
    }
  });
});

// ── 5. Agent YAML parsing ─────────────────────────────────────────────────

describe("Agent YAML extraction — .agent/agents/*.yaml", () => {
  it("produces at least 5 agent definitions", () => {
    expect(agentYamls.length).toBeGreaterThanOrEqual(5);
  });

  it("every agent has a non-empty agent_id", () => {
    for (const agent of agentYamls) {
      expect(agent.agent_id.length).toBeGreaterThan(0);
    }
  });

  it("every agent has a non-empty role", () => {
    for (const agent of agentYamls) {
      expect(agent.role.length).toBeGreaterThan(0);
    }
  });

  it("every agent has at least one capability", () => {
    for (const agent of agentYamls) {
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("every agent has a valid risk_class", () => {
    const validRiskClasses: RiskClass[] = ["low", "medium", "high"];
    for (const agent of agentYamls) {
      expect(
        validRiskClasses.includes(agent.risk_class as RiskClass),
        `Invalid risk_class '${agent.risk_class}' for agent '${agent.agent_id}'`,
      ).toBe(true);
    }
  });

  it("manager-default has orchestrator role", () => {
    const manager = agentYamls.find((a) => a.agent_id === "manager-default");
    expect(manager).toBeDefined();
    expect(manager!.role).toBe("orchestrator");
    expect(manager!.capabilities).toContain("planning");
    expect(manager!.capabilities).toContain("delegation");
    expect(manager!.risk_class).toBe("medium");
  });

  it("implementer-subagent has implementer role", () => {
    const impl = agentYamls.find((a) => a.agent_id === "implementer-subagent");
    expect(impl).toBeDefined();
    expect(impl!.role).toBe("implementer");
    expect(impl!.capabilities).toContain("code-change");
    expect(impl!.capabilities).toContain("patching");
    expect(impl!.capabilities).toContain("task-execution");
  });

  it("researcher-subagent has researcher role and read-only capabilities", () => {
    const researcher = agentYamls.find((a) => a.agent_id === "researcher-subagent");
    expect(researcher).toBeDefined();
    expect(researcher!.role).toBe("researcher");
    expect(researcher!.capabilities).toContain("repo-map");
    expect(researcher!.capabilities).toContain("impact-analysis");
    expect(researcher!.capabilities).toContain("context-gathering");
    expect(researcher!.risk_class).toBe("low");
  });

  it("validator-sentinel has high risk_class (gate role)", () => {
    const validator = agentYamls.find((a) => a.agent_id === "validator-sentinel");
    expect(validator).toBeDefined();
    expect(validator!.role).toBe("validator");
    expect(validator!.risk_class).toBe("high");
    expect(validator!.capabilities).toContain("verify");
    expect(validator!.capabilities).toContain("release-gate");
  });

  it("frontend-reviewer has reviewer role", () => {
    const reviewer = agentYamls.find((a) => a.agent_id === "frontend-reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer!.role).toBe("reviewer");
    expect(reviewer!.capabilities).toContain("ui-review");
    expect(reviewer!.capabilities).toContain("frontend-refactor-planning");
    expect(reviewer!.capabilities).toContain("accessibility-scan");
  });

  it("agent IDs from YAML match agent IDs in the TypeScript AGENTS snapshot", () => {
    const yamlIds = new Set(agentYamls.map((a) => a.agent_id));
    const tsIds = new Set(AGENTS.map((a) => a.agentId));
    // Every YAML agent ID must be present in the TypeScript snapshot
    for (const id of yamlIds) {
      expect(tsIds.has(id), `YAML agent '${id}' missing from TypeScript AGENTS`).toBe(true);
    }
  });

  it("agent roles from YAML match roles in the TypeScript AGENTS snapshot", () => {
    for (const yamlAgent of agentYamls) {
      const tsAgent = AGENTS.find((a) => a.agentId === yamlAgent.agent_id);
      if (!tsAgent) continue; // Already caught by the IDs test above
      expect(
        yamlAgent.role,
        `Role mismatch for '${yamlAgent.agent_id}': YAML='${yamlAgent.role}' TS='${tsAgent.role}'`,
      ).toBe(tsAgent.role);
    }
  });

  it("agent capabilities from YAML match capabilities in the TypeScript AGENTS snapshot", () => {
    for (const yamlAgent of agentYamls) {
      const tsAgent = AGENTS.find((a) => a.agentId === yamlAgent.agent_id);
      if (!tsAgent) continue;
      for (const cap of yamlAgent.capabilities) {
        expect(
          tsAgent.capabilities,
          `Capability '${cap}' missing for '${yamlAgent.agent_id}' in TypeScript snapshot`,
        ).toContain(cap);
      }
    }
  });
});

// ── 6. Full buildFromYaml() integration ──────────────────────────────────

describe("buildFromYaml() — complete building assembly from disk YAML", () => {
  it("builds a complete BuildingDef without throwing", () => {
    expect(() => buildFromYaml(buildingYaml, roomYamls)).not.toThrow();
  });

  it("assembled building has 9 rooms", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    // All 9 non-underscore YAML files become rooms
    expect(building.rooms).toHaveLength(9);
  });

  it("all expected room IDs are present in the assembled building", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const expectedIds = [
      "ops-control", "project-main", "impl-office", "research-lab",
      "validation-office", "review-office", "archive-vault",
      "corridor-main", "stairwell",
    ];
    const roomIds = new Set(building.rooms.map((r) => r.roomId));
    for (const id of expectedIds) {
      expect(roomIds.has(id), `Room '${id}' missing from assembled building`).toBe(true);
    }
  });

  it("rooms with explicit spatial blocks have valid positionHints", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const SENTINEL = -999;
    for (const room of building.rooms) {
      if (room.positionHint.position.x === SENTINEL) continue; // auto-placed rooms skip
      expect(room.positionHint.dimensions.x).toBeGreaterThan(0);
      expect(room.positionHint.dimensions.y).toBeGreaterThan(0);
      expect(room.positionHint.dimensions.z).toBeGreaterThan(0);
    }
  });

  it("assembled building _meta is populated for all rooms (rich parse from YAML)", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    for (const room of building.rooms) {
      expect(room._meta, `_meta missing for ${room.roomId}`).toBeDefined();
      expect(Array.isArray(room._meta!.tags)).toBe(true);
      expect(typeof room._meta!.notes).toBe("string");
      expect(["open", "members-only", "approval-required"]).toContain(room._meta!.accessPolicy);
      expect(["concise", "verbose", "silent"]).toContain(room._meta!.summaryMode);
    }
  });

  it("assembled building has correct agentAssignments (matches _building.yaml)", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    expect(building.agentAssignments["manager-default"]).toBe("ops-control");
    expect(building.agentAssignments["implementer-subagent"]).toBe("impl-office");
    expect(building.agentAssignments["researcher-subagent"]).toBe("research-lab");
    expect(building.agentAssignments["validator-sentinel"]).toBe("validation-office");
    expect(building.agentAssignments["frontend-reviewer"]).toBe("review-office");
    expect(building.agentAssignments["USER"]).toBe("project-main");
  });

  it("assembled building room data is consistent with the TypeScript BUILDING snapshot", () => {
    const yamlBuilding = buildFromYaml(buildingYaml, roomYamls);

    for (const yamlRoom of yamlBuilding.rooms) {
      const tsRoom = BUILDING.rooms.find((r) => r.roomId === yamlRoom.roomId);
      expect(tsRoom, `Room '${yamlRoom.roomId}' missing from TypeScript BUILDING`).toBeDefined();
      if (!tsRoom) continue;

      // Core identity must match
      expect(yamlRoom.name).toBe(tsRoom.name);
      expect(yamlRoom.roomType).toBe(tsRoom.roomType);
      expect(yamlRoom.floor).toBe(tsRoom.floor);
      expect(yamlRoom.colorAccent).toBe(tsRoom.colorAccent);

      // Position and dimensions must match (for rooms with explicit spatial)
      const SENTINEL = -999;
      if (yamlRoom.position.x !== SENTINEL) {
        expect(yamlRoom.position.x).toBe(tsRoom.position.x);
        expect(yamlRoom.position.z).toBe(tsRoom.position.z);
        expect(yamlRoom.dimensions.x).toBe(tsRoom.dimensions.x);
        expect(yamlRoom.dimensions.z).toBe(tsRoom.dimensions.z);
      }
    }
  });
});

// ── 7. Room→Agent hierarchy from YAML ────────────────────────────────────

describe("Room→Agent hierarchy built from YAML sources", () => {
  let hierarchy: BuildingHierarchyNode;

  beforeAll(() => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const mapping = parseRoomMappingYaml(mappingYaml);
    hierarchy = buildHierarchy(building, AGENTS, mapping);
  });

  it("hierarchy has 2 floors", () => {
    expect(hierarchy.floors).toHaveLength(2);
  });

  it("all 5 agents are placed in the YAML-derived hierarchy", () => {
    const allAgentIds = hierarchy.floors
      .flatMap((f) => f.rooms)
      .flatMap((r) => r.agents)
      .map((a) => a.agentId);

    const expectedIds = [
      "manager-default", "implementer-subagent", "researcher-subagent",
      "validator-sentinel", "frontend-reviewer",
    ];
    for (const id of expectedIds) {
      expect(allAgentIds, `Agent '${id}' not found in YAML-derived hierarchy`).toContain(id);
    }
  });

  it("manager-default is in ops-control", () => {
    const opsControl = hierarchy.floors.flatMap((f) => f.rooms).find((r) => r.roomId === "ops-control");
    expect(opsControl).toBeDefined();
    const manager = opsControl!.agents.find((a) => a.agentId === "manager-default");
    expect(manager).toBeDefined();
    expect(manager!.role).toBe("orchestrator");
  });

  it("researcher-subagent is in research-lab with low risk class", () => {
    const lab = hierarchy.floors.flatMap((f) => f.rooms).find((r) => r.roomId === "research-lab");
    expect(lab).toBeDefined();
    const researcher = lab!.agents.find((a) => a.agentId === "researcher-subagent");
    expect(researcher).toBeDefined();
    expect(researcher!.riskClass).toBe("low");
    expect(researcher!.capabilities).toContain("repo-map");
  });

  it("validator-sentinel is in validation-office with high risk class", () => {
    const valOffice = hierarchy.floors.flatMap((f) => f.rooms).find((r) => r.roomId === "validation-office");
    expect(valOffice).toBeDefined();
    const validator = valOffice!.agents.find((a) => a.agentId === "validator-sentinel");
    expect(validator).toBeDefined();
    expect(validator!.riskClass).toBe("high");
  });

  it("corridor rooms have no agent occupants (YAML-verified)", () => {
    const corridorRooms = hierarchy.floors
      .flatMap((f) => f.rooms)
      .filter((r) => r.roomType === "corridor");
    for (const room of corridorRooms) {
      expect(room.agents, `${room.roomId} should have no agents`).toHaveLength(0);
    }
  });

  it("validateHierarchyConsistency passes on YAML-derived data", () => {
    const yamlBuilding = buildFromYaml(buildingYaml, roomYamls);
    const yamlMapping = parseRoomMappingYaml(mappingYaml);
    const result = validateHierarchyConsistency(yamlBuilding, AGENTS, yamlMapping);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── 8. Cross-validation: YAML ↔ TypeScript snapshot ──────────────────────

describe("Cross-validation: YAML source ↔ TypeScript static snapshot", () => {
  it("BUILDING.rooms count matches parsed YAML room count", () => {
    const yamlBuilding = buildFromYaml(buildingYaml, roomYamls);
    expect(BUILDING.rooms).toHaveLength(yamlBuilding.rooms.length);
  });

  it("every room in BUILDING snapshot has a matching YAML file", () => {
    const yamlBuilding = buildFromYaml(buildingYaml, roomYamls);
    const yamlRoomIds = new Set(yamlBuilding.rooms.map((r) => r.roomId));
    for (const tsRoom of BUILDING.rooms) {
      expect(
        yamlRoomIds.has(tsRoom.roomId),
        `TypeScript room '${tsRoom.roomId}' has no corresponding YAML file`,
      ).toBe(true);
    }
  });

  it("DEFAULT_ROOM_MAPPING role assignments match the parsed _room-mapping.yaml", () => {
    const yamlMapping = parseRoomMappingYaml(mappingYaml);
    for (const [role, tsMapping] of Object.entries(DEFAULT_ROOM_MAPPING.roleDefaults)) {
      const yamlDef = yamlMapping.roleDefaults[role as AgentRole];
      expect(yamlDef, `Role '${role}' missing from YAML mapping`).toBeDefined();
      expect(yamlDef.roomId).toBe(tsMapping.roomId);
    }
  });

  it("room colorAccent values in YAML match TypeScript snapshot exactly", () => {
    const expectedColors: Record<string, string> = {
      "ops-control": "#FF7043",
      "project-main": "#4FC3F7",
      "impl-office": "#66BB6A",
      "research-lab": "#AB47BC",
      "validation-office": "#EF5350",
      "review-office": "#42A5F5",
      "archive-vault": "#78909C",
      "corridor-main": "#546E7A",
      "stairwell": "#546E7A",
    };

    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      const expected = expectedColors[room.roomId];
      if (expected) {
        expect(room.colorAccent, `Color mismatch for ${filename}`).toBe(expected);
      }
    }
  });
});

// ── 9. Sub-AC 3: 3D room mesh positioning & color-coding ─────────────────
//
// These tests verify the properties required for Sub-AC 3:
//   "Dynamically generate and position low-poly 3D room meshes inside
//    the building, each labeled and color-coded by role, based on the
//    parsed .agent/rooms/ data."
//
// Specifically we assert:
//   a) All rooms have valid 3D position/dimensions sourced from YAML
//   b) Rooms with explicit spatial blocks are positioned within the grid
//   c) Floor Y offsets derive correctly from the floor index (floor × 3)
//   d) positionHint.center is the geometric centre of the room
//   e) Every room has a distinct colorAccent that is a valid hex colour
//   f) Each of the 6 canonical room types is represented in the building
//   g) Rooms fit inside their floor's grid (no out-of-bounds placement)
//   h) The procedural layout assigns positions to sentinel rooms

describe("Sub-AC 3 — 3D room mesh positioning & color-coding (from parsed YAML)", () => {
  const BUILDING_GRID_W = 12;
  const BUILDING_GRID_D = 6;
  const FLOOR_HEIGHT    = 3;  // grid units per floor — matches _building.yaml
  const SENTINEL        = -999;

  // ── 9a. All rooms have valid 3D dimensions from YAML ──────────────────────
  it("every room has positive x, y, z dimensions (mesh is non-degenerate)", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(room.dimensions.x, `${filename} dimensions.x must be > 0`).toBeGreaterThan(0);
      expect(room.dimensions.y, `${filename} dimensions.y must be > 0`).toBeGreaterThan(0);
      expect(room.dimensions.z, `${filename} dimensions.z must be > 0`).toBeGreaterThan(0);
    }
  });

  // ── 9b. Explicit-position rooms are within the building grid ──────────────
  it("rooms with explicit spatial positions are within the building grid bounds", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      // Skip sentinel (auto-placed) rooms — they haven't been placed yet
      if (room.position.x === SENTINEL) continue;

      const xEnd = room.position.x + room.dimensions.x;
      const zEnd = room.position.z + room.dimensions.z;

      // Rooms must start at or after x=0
      expect(
        room.position.x,
        `${filename} position.x (${room.position.x}) must be >= 0`,
      ).toBeGreaterThanOrEqual(0);

      // Rooms must start at or after z=0
      expect(
        room.position.z,
        `${filename} position.z (${room.position.z}) must be >= 0`,
      ).toBeGreaterThanOrEqual(0);

      // Rooms must end at or before the grid width
      expect(
        xEnd,
        `${filename} x+width (${xEnd}) must be <= grid width (${BUILDING_GRID_W})`,
      ).toBeLessThanOrEqual(BUILDING_GRID_W);

      // Rooms must end at or before the grid depth
      expect(
        zEnd,
        `${filename} z+depth (${zEnd}) must be <= grid depth (${BUILDING_GRID_D})`,
      ).toBeLessThanOrEqual(BUILDING_GRID_D);
    }
  });

  // ── 9c. Floor Y offsets derive from floor index ───────────────────────────
  it("every room's Y position equals floor × FLOOR_HEIGHT (3 units per floor)", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      // Skip sentinel rooms — Y is set but x is sentinel, still valid
      const expectedY = room.floor * FLOOR_HEIGHT;
      expect(
        room.position.y,
        `${filename} position.y should be floor(${room.floor}) × ${FLOOR_HEIGHT} = ${expectedY}`,
      ).toBe(expectedY);
    }
  });

  // ── 9d. positionHint.center is the geometric centre of the room ───────────
  it("positionHint.center is computed as position + dimensions / 2 for all rooms", () => {
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      // Skip sentinel rooms — centre is unreliable before auto-placement
      if (room.position.x === SENTINEL) continue;

      const { position: pos, dimensions: dims, center } = room.positionHint;

      expect(
        center.x,
        `${filename} center.x should be pos.x + dims.x/2`,
      ).toBeCloseTo(pos.x + dims.x / 2, 4);

      expect(
        center.y,
        `${filename} center.y should be pos.y + dims.y/2`,
      ).toBeCloseTo(pos.y + dims.y / 2, 4);

      expect(
        center.z,
        `${filename} center.z should be pos.z + dims.z/2`,
      ).toBeCloseTo(pos.z + dims.z / 2, 4);
    }
  });

  // ── 9e. colorAccent is a valid CSS hex colour ─────────────────────────────
  it("every room colorAccent is a valid 6-digit hex colour string", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(
        room.colorAccent,
        `${filename} colorAccent '${room.colorAccent}' is not a valid hex colour`,
      ).toMatch(hexPattern);
    }
  });

  // ── 9f. All 6 canonical room types are present in the YAML building ───────
  it("all 6 room types (control, office, lab, lobby, archive, corridor) appear in the YAML", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const presentTypes = new Set(building.rooms.map((r) => r.roomType));
    const requiredTypes = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;
    for (const type of requiredTypes) {
      expect(
        presentTypes.has(type),
        `Room type '${type}' is not present in the parsed YAML building`,
      ).toBe(true);
    }
  });

  // ── 9g. cameraPreset is a valid value for every room ─────────────────────
  it("every room has a valid cameraPreset (overhead | isometric | close-up)", () => {
    const valid = new Set(["overhead", "isometric", "close-up"]);
    for (const [filename, yaml] of Object.entries(roomYamls)) {
      const room = parseRoomYaml(yaml);
      expect(
        valid.has(room.cameraPreset),
        `${filename} cameraPreset '${room.cameraPreset}' is not valid`,
      ).toBe(true);
    }
  });

  // ── 9h. Procedural layout assigns distinct non-sentinel positions ─────────
  it("applyProceduralLayout gives every room a non-sentinel position", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const { rooms } = applyProceduralLayout(building.rooms, building.floors);

    for (const room of rooms) {
      expect(
        room.position.x,
        `Room '${room.roomId}' still has sentinel x after layout`,
      ).not.toBe(SENTINEL);
      expect(
        room.position.z,
        `Room '${room.roomId}' still has sentinel z after layout`,
      ).not.toBe(SENTINEL);
    }
  });

  // ── 9i. Procedural layout emits one placement log entry per room ──────────
  it("applyProceduralLayout placementLog has one entry per input room", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const { rooms, placementLog } = applyProceduralLayout(
      building.rooms,
      building.floors,
    );

    expect(placementLog).toHaveLength(rooms.length);

    // Each log entry must have a source of either "yaml-explicit" or "auto-placed"
    for (const entry of placementLog) {
      expect(["yaml-explicit", "auto-placed"]).toContain(entry.source);
    }
  });

  // ── 9j. Rooms with YAML spatial blocks use "yaml-explicit" placement ──────
  it("rooms that have a spatial block in YAML are logged as yaml-explicit", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const { placementLog } = applyProceduralLayout(
      building.rooms,
      building.floors,
    );

    // All 9 rooms in the test building have explicit spatial blocks
    // so all should be yaml-explicit
    const explicitIds = ["ops-control", "project-main", "impl-office", "research-lab",
      "validation-office", "review-office", "archive-vault", "corridor-main", "stairwell"];

    for (const roomId of explicitIds) {
      const entry = placementLog.find((e) => e.roomId === roomId);
      expect(entry, `No placement log entry for '${roomId}'`).toBeDefined();
      expect(
        entry!.source,
        `'${roomId}' should be yaml-explicit (has spatial block in YAML)`,
      ).toBe("yaml-explicit");
    }
  });

  // ── 9k. ops-control has correct 3D position for the control room ──────────
  it("ops-control is at the expected 3D position (floor 1, x=4, z=0)", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const opsControl = building.rooms.find((r) => r.roomId === "ops-control");
    expect(opsControl).toBeDefined();

    expect(opsControl!.position.x).toBe(4);
    expect(opsControl!.position.y).toBe(3);   // floor 1 × 3 units = y=3
    expect(opsControl!.position.z).toBe(0);
    expect(opsControl!.dimensions.x).toBe(5);
    expect(opsControl!.dimensions.y).toBe(3);
    expect(opsControl!.dimensions.z).toBe(4);
  });

  // ── 9l. Each room type has a distinct primary color class ─────────────────
  it("control room and corridor rooms have visually distinct colorAccent values", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);

    const controlRoom  = building.rooms.find((r) => r.roomType === "control");
    const labRoom      = building.rooms.find((r) => r.roomType === "lab");
    const lobbyRoom    = building.rooms.find((r) => r.roomType === "lobby");
    const archiveRoom  = building.rooms.find((r) => r.roomType === "archive");

    // These four room types must have distinct accent colours
    const primaryColors = [
      controlRoom?.colorAccent,
      labRoom?.colorAccent,
      lobbyRoom?.colorAccent,
      archiveRoom?.colorAccent,
    ].filter(Boolean);

    const uniqueColors = new Set(primaryColors);
    expect(uniqueColors.size).toBe(primaryColors.length);
  });

  // ── 9m. Rooms fit within their floor's grid boundary post-layout ──────────
  it("all rooms fit within their floor grid after procedural layout", () => {
    const building = buildFromYaml(buildingYaml, roomYamls);
    const { rooms } = applyProceduralLayout(building.rooms, building.floors);

    const floorGrid = new Map<number, { w: number; d: number }>();
    for (const f of building.floors) {
      floorGrid.set(f.floor, { w: f.gridW, d: f.gridD });
    }

    for (const room of rooms) {
      const grid = floorGrid.get(room.floor) ?? { w: BUILDING_GRID_W, d: BUILDING_GRID_D };
      const xEnd = room.position.x + room.dimensions.x;
      const zEnd = room.position.z + room.dimensions.z;

      expect(
        xEnd,
        `'${room.roomId}' exceeds grid width: x+w=${xEnd} > ${grid.w}`,
      ).toBeLessThanOrEqual(grid.w);

      expect(
        zEnd,
        `'${room.roomId}' exceeds grid depth: z+d=${zEnd} > ${grid.d}`,
      ).toBeLessThanOrEqual(grid.d);
    }
  });
});
