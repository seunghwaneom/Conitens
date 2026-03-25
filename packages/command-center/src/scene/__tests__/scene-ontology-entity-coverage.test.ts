/**
 * scene-ontology-entity-coverage.test.ts — Sub-AC 14.1
 *
 * Isolated test infrastructure validation covering the two ontology entity
 * names mandated by Sub-AC 1 of AC 14:
 *
 *   • agent_instance — an agent placed as an inactive 3D avatar in the scene
 *   • command        — a user-intent entity written to the command inbox
 *
 * Test groups
 * ───────────
 * 14.1-oe-1 : Scene initialization — baseline scene builds with agent_instance entities
 * 14.1-oe-2 : Building geometry render — BUILDING data supports non-degenerate geometry
 * 14.1-oe-3 : Camera / navigation controls — focus functions produce valid poses for
 *             agent_instance positions and building hierarchy drill-down
 * 14.1-oe-4 : command entity — createCommandEntity produces a valid, frozen entity
 *
 * All tests run in the Node.js environment (no WebGL, no DOM, no React).
 * The scene-test-harness provides structural SceneNode stubs; BUILDING and
 * CameraRig exports provide the canonical data layer.
 *
 * Test ID scheme: 14.1-oe-<group>-<N>
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Scene harness (Sub-AC 14.1 test infrastructure) ──────────────────────────
import {
  makeBaselineScene,
  makeGroupNode,
  makeMeshNode,
  makeScene,
  addToScene,
  countNodes,
  findAll,
  findByName,
  captureSceneSnapshot,
  resetHarness,
  vec3,
  type SceneNode,
} from "../../testing/scene-test-harness.js";

// ── Building data — geometry render ──────────────────────────────────────────
import { BUILDING, getRoomById, getRoomsForFloor } from "../../data/building.js";

// ── Camera rig — navigation controls ─────────────────────────────────────────
import {
  CAMERA_PRESETS,
  CAMERA_TRANSITION_SPEED,
  computeAgentFocusCamera,
  computeRoomFocusCamera,
  computeFloorFocusCamera,
} from "../CameraRig.js";

// ── Command entity ────────────────────────────────────────────────────────────
import {
  createCommandEntity,
  COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE,
  type CommandEntity,
} from "../../data/command-entity.js";

// ── Agent definitions — agent_instance source ─────────────────────────────────
import { AGENTS } from "../../data/agents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global reset
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetHarness();
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-oe-1 : Scene initialization with agent_instance entities
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-oe-1: Scene initialization — agent_instance entities", () => {
  /**
   * An agent_instance is an agent that has been placed into the scene as a 3D
   * entity (avatar mesh) assigned to a room.  On initial load every
   * agent_instance starts in the `inactive` status (AC 2: pre-placed avatars).
   *
   * These tests verify that the test infrastructure can construct a valid
   * scene graph containing agent_instance entities, and that the initial state
   * is correct before any lifecycle events are applied.
   */

  it("scene initializes with agent_instance entities pre-placed and visible", () => {
    // Build a baseline scene with 5 agent_instance entities across 3 rooms
    const { root, agents, agents_data } = makeBaselineScene({
      agentCount: 5,
      roomCount: 3,
    });

    // Every agent_instance must be present in the scene graph
    expect(agents).toHaveLength(5);

    // The scene graph must be non-empty: Scene + building + 3 rooms + 5 agents
    const total = countNodes(root);
    expect(total).toBeGreaterThanOrEqual(1 + 1 + 3 + 5);

    // Every agent_instance starts in the 'inactive' status (AC 2 contract)
    for (const a of agents_data) {
      expect(a.status).toBe("inactive");
    }
  });

  it("each agent_instance is assigned to a room node in the scene hierarchy", () => {
    const { agents, rooms } = makeBaselineScene({ agentCount: 6, roomCount: 3 });

    // Every agent should have a parent that is a room group
    for (const agentNode of agents) {
      expect(agentNode.parent).not.toBeNull();
      // The parent must be one of the room nodes
      const parentIsRoom = rooms.some((r) => r === agentNode.parent);
      expect(parentIsRoom).toBe(true);
    }
  });

  it("agent_instance nodes carry agentId, status, and role in userData", () => {
    const { agents } = makeBaselineScene({ agentCount: 3 });

    for (const agentNode of agents) {
      expect(typeof agentNode.userData.agentId).toBe("string");
      expect(agentNode.userData.agentId).not.toBe("");
      expect(agentNode.userData.status).toBe("inactive");
      expect(typeof agentNode.userData.role).toBe("string");
    }
  });

  it("scene snapshot is deterministic across two identical initialization runs", () => {
    // Run 1
    resetHarness();
    const run1 = makeBaselineScene({ agentCount: 4, roomCount: 2 });
    const snap1 = captureSceneSnapshot(run1.root);

    // Run 2
    resetHarness();
    const run2 = makeBaselineScene({ agentCount: 4, roomCount: 2 });
    const snap2 = captureSceneSnapshot(run2.root);

    // Both runs must produce the same structure
    expect(snap1.totalNodes).toBe(snap2.totalNodes);
  });

  it("AGENTS definitions provide the canonical agent_instance source data", () => {
    // AGENTS is the canonical list from which agent_instance entities are created
    expect(AGENTS.length).toBeGreaterThanOrEqual(5);

    for (const agent of AGENTS) {
      expect(typeof agent.agentId).toBe("string");
      expect(agent.agentId).not.toBe("");
      expect(typeof agent.defaultRoom).toBe("string");
      expect(agent.defaultRoom).not.toBe("");
      // Every agent_instance must have a valid visual configuration
      expect(agent.visual.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("building.agentAssignments maps each agent_instance to a valid room", () => {
    const roomIds = new Set(BUILDING.rooms.map((r) => r.roomId));

    for (const [agentId, roomId] of Object.entries(BUILDING.agentAssignments)) {
      expect(typeof agentId).toBe("string");
      expect(roomIds.has(roomId), `agent '${agentId}' mapped to unknown room '${roomId}'`).toBe(true);
    }
  });

  it("scene can host the full complement of AGENTS (max agent_instance count)", () => {
    const { agents, agents_data } = makeBaselineScene({
      agentCount: AGENTS.length,
      roomCount: 5,
    });

    expect(agents).toHaveLength(AGENTS.length);
    expect(agents_data).toHaveLength(AGENTS.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-oe-2 : Building geometry render
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-oe-2: Building geometry render — non-degenerate scene data", () => {
  /**
   * Before any 3D component mounts, the building data layer must supply valid,
   * non-degenerate geometry parameters.  These tests confirm that the pure data
   * exported from building.ts is in a state that Three.js can render without
   * producing zero-area meshes, NaN values, or missing materials.
   */

  it("BUILDING has at least 2 floors and at least 4 rooms (non-trivial scene)", () => {
    expect(BUILDING.floors.length).toBeGreaterThanOrEqual(2);
    expect(BUILDING.rooms.length).toBeGreaterThanOrEqual(4);
  });

  it("all room dimensions are positive and finite (no degenerate meshes)", () => {
    for (const room of BUILDING.rooms) {
      const { x, y, z } = room.dimensions;
      expect(isFinite(x) && x > 0, `${room.roomId} width must be > 0`).toBe(true);
      expect(isFinite(y) && y > 0, `${room.roomId} height must be > 0`).toBe(true);
      expect(isFinite(z) && z > 0, `${room.roomId} depth must be > 0`).toBe(true);
    }
  });

  it("all room positions are finite (no NaN offsets)", () => {
    for (const room of BUILDING.rooms) {
      const { x, y, z } = room.position;
      expect(isFinite(x), `${room.roomId} pos.x must be finite`).toBe(true);
      expect(isFinite(y), `${room.roomId} pos.y must be finite`).toBe(true);
      expect(isFinite(z), `${room.roomId} pos.z must be finite`).toBe(true);
    }
  });

  it("BUILDING.visual material palette is complete for dark command-center theme", () => {
    const { visual } = BUILDING;
    const hexRe = /^#[0-9A-Fa-f]{6}$/;

    expect(visual.wallColor).toMatch(hexRe);
    expect(visual.floorColor).toMatch(hexRe);
    expect(visual.ceilingColor).toMatch(hexRe);
    expect(visual.gridColor).toMatch(hexRe);
    expect(visual.accentGlowIntensity).toBeGreaterThanOrEqual(0);
    expect(visual.accentGlowIntensity).toBeLessThanOrEqual(1);
  });

  it("building style is 'low-poly-dark' (confirms flat-shaded material policy)", () => {
    expect(BUILDING.style).toBe("low-poly-dark");
  });

  it("rooms fit within the W=12 D=6 building footprint (no out-of-bounds geometry)", () => {
    for (const room of BUILDING.rooms) {
      if (room.roomId === "stairwell") continue; // spans both floors
      expect(room.position.x + room.dimensions.x).toBeLessThanOrEqual(12.01);
      expect(room.position.z + room.dimensions.z).toBeLessThanOrEqual(6.01);
    }
  });

  it("scene node for the building group can be created and populated with room nodes", () => {
    // Constructs the outer building Group, then populates it with one mesh per room
    const buildingGroup = makeGroupNode("hierarchy-building");

    for (const room of BUILDING.rooms) {
      const roomGroup = makeGroupNode(`hierarchy-room-${room.roomId}`);
      roomGroup.position = { ...room.position };
      roomGroup.userData.roomId = room.roomId;
      roomGroup.userData.roomType = room.roomType;
      addToScene(buildingGroup, roomGroup);
    }

    // Building group contains exactly one child node per room
    expect(buildingGroup.children).toHaveLength(BUILDING.rooms.length);

    // Verify the scene sub-graph by wrapping in a root Scene
    const sceneRoot = makeScene([buildingGroup]);
    const allGroups = findAll(sceneRoot, (n) => n.type === "Group");

    // Building + N room groups
    expect(allGroups.length).toBe(1 + BUILDING.rooms.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-oe-3 : Camera / navigation controls
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-oe-3: Camera navigation — agent_instance and room focus", () => {
  /**
   * Navigation is the primary UX mechanism for drilling from building → floor →
   * room → agent_instance.  These tests verify that the pure focus-compute
   * functions produce valid camera poses for every item in the scene hierarchy.
   */

  it("overhead preset is above total building height (bird's-eye overview)", () => {
    const TOTAL_HEIGHT = 6; // 2 floors × 3 units
    const { position } = CAMERA_PRESETS.overhead;
    expect(position[1]).toBeGreaterThan(TOTAL_HEIGHT);
  });

  it("computeAgentFocusCamera returns a valid pose for any agent_instance position", () => {
    // Simulate focus on each AGENT's default room centre-position
    for (const agent of AGENTS) {
      const room = getRoomById(agent.defaultRoom);
      if (!room) continue; // skip if room not in the building definition

      // Agent position at room centre (Y = room start + avatar height)
      const agentPos = {
        x: room.position.x + room.dimensions.x / 2,
        y: room.position.y + 0.5,
        z: room.position.z + room.dimensions.z / 2,
      };

      const pose = computeAgentFocusCamera(agentPos);

      // Position and target must be 3-tuples of finite numbers
      expect(pose.position).toHaveLength(3);
      expect(pose.target).toHaveLength(3);
      for (const v of [...pose.position, ...pose.target]) {
        expect(isFinite(v), `non-finite camera value for agent '${agent.agentId}'`).toBe(true);
      }

      // Camera must be above the agent_instance (looking down)
      expect(pose.position[1]).toBeGreaterThan(agentPos.y);
    }
  });

  it("computeRoomFocusCamera returns a valid pose for every room in the building", () => {
    for (const room of BUILDING.rooms) {
      const pose = computeRoomFocusCamera(room);
      expect(pose.position).toHaveLength(3);
      expect(pose.target).toHaveLength(3);
      for (const v of [...pose.position, ...pose.target]) {
        expect(isFinite(v), `non-finite camera value for room '${room.roomId}'`).toBe(true);
      }
    }
  });

  it("computeFloorFocusCamera returns distinct poses for floor 0 and floor 1", () => {
    const floor0 = computeFloorFocusCamera(0);
    const floor1 = computeFloorFocusCamera(1);

    // Both must be valid
    expect(floor0.position).toHaveLength(3);
    expect(floor1.position).toHaveLength(3);

    // Floor 1 camera must be higher (physically above floor 0)
    expect(floor1.position[1]).toBeGreaterThan(floor0.position[1]);
    expect(floor1.target[1]).toBeGreaterThan(floor0.target[1]);
  });

  it("CAMERA_TRANSITION_SPEED is a positive value enabling smooth navigation", () => {
    expect(CAMERA_TRANSITION_SPEED).toBeGreaterThan(0);
    expect(isFinite(CAMERA_TRANSITION_SPEED)).toBe(true);
  });

  it("camera presets cover all named navigation entry points", () => {
    const required = ["overview", "overhead", "cutaway", "groundFloor", "opsFloor"] as const;
    for (const name of required) {
      const preset = CAMERA_PRESETS[name];
      expect(preset, `preset '${name}' must exist`).toBeDefined();
      expect(preset.position).toHaveLength(3);
      expect(preset.target).toHaveLength(3);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-oe-4 : command entity creation and validation
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-oe-4: command entity — creation, structure, and immutability", () => {
  /**
   * A `command` entity is created whenever the user interacts with a 3D scene
   * affordance.  It bridges the user's intent (e.g. click agent_instance avatar)
   * to the Orchestrator via file-based ingestion (Sub-AC 8.1).
   *
   * These tests confirm that `createCommandEntity()` produces entities that
   * satisfy the ontology contract: unique IDs, correct prefix, pending state,
   * and immutability.
   */

  it("createCommandEntity produces a command entity with 'pending' lifecycle state", () => {
    const entity: CommandEntity = createCommandEntity({
      source_entity_id: "agent:manager-default",
      action_type: "agent.spawn",
      payload: { agentId: "manager-default" },
    });

    expect(entity.lifecycle_state).toBe("pending");
    expect(entity.lifecycle_state).toBe(COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE);
  });

  it("command entity has a unique command_id with the 'gui_cmd_' prefix", () => {
    const e1 = createCommandEntity({
      source_entity_id: "agent:implementer-subagent",
      action_type: "agent.spawn",
      payload: {},
    });
    const e2 = createCommandEntity({
      source_entity_id: "agent:researcher-core",
      action_type: "agent.spawn",
      payload: {},
    });

    // Both entities must have the correct prefix (COMMAND_FILE_PREFIX = "gui_cmd_")
    expect(e1.command_id).toMatch(/^gui_cmd_/);
    expect(e2.command_id).toMatch(/^gui_cmd_/);

    // IDs must be unique across entities
    expect(e1.command_id).not.toBe(e2.command_id);
  });

  it("command entity captures the originating agent_instance via source_entity_id", () => {
    const agentId = "agent:manager-default";
    const entity = createCommandEntity({
      source_entity_id: agentId,
      action_type: "agent.terminate",
      payload: { reason: "user-initiated" },
    });

    // source_entity_id must trace back to the 3D entity (agent_instance)
    expect(entity.source_entity_id).toBe(agentId);
  });

  it("command entity is frozen — immutable after creation (record transparency)", () => {
    const entity = createCommandEntity({
      source_entity_id: "room:ops-control",
      action_type: "nav.drill_down",
      payload: { targetRoomId: "ops-control" },
    });

    // Object.isFrozen confirms the entity cannot be mutated
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("command entity has a valid ISO timestamp (ts) and numeric created_at_ms", () => {
    const before = Date.now();
    const entity = createCommandEntity({
      source_entity_id: "building:command-center",
      action_type: "nav.camera_preset",
      payload: { preset: "overhead" },
    });
    const after = Date.now();

    // ts is a parseable ISO 8601 date
    const parsed = Date.parse(entity.ts);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);

    // created_at_ms is a numeric epoch timestamp in the same range
    expect(entity.created_at_ms).toBeGreaterThanOrEqual(before);
    expect(entity.created_at_ms).toBeLessThanOrEqual(after);
  });

  it("command entity payload is stored and retrievable", () => {
    const payload = { agentId: "implementer-subagent", targetRoom: "impl-office" };
    const entity = createCommandEntity({
      source_entity_id: "agent:implementer-subagent",
      action_type: "agent.assign",
      payload,
    });

    expect(entity.payload.agentId).toBe("implementer-subagent");
    expect(entity.payload.targetRoom).toBe("impl-office");
  });

  it("nav.focus_entity command bridges agent_instance selection to camera navigation", () => {
    /**
     * When a user clicks an agent_instance avatar, the interaction layer creates
     * a nav.focus_entity command entity whose payload contains the agent ID.
     * This test verifies the round-trip from agent_instance click → command entity.
     */
    const agentId = "researcher-core";
    const entity = createCommandEntity({
      source_entity_id: `agent:${agentId}`,
      action_type: "nav.focus_entity",
      payload: { entityType: "agent_instance", entityId: agentId },
    });

    expect(entity.action_type).toBe("nav.focus_entity");
    expect(entity.payload.entityType).toBe("agent_instance");
    expect(entity.payload.entityId).toBe(agentId);
    expect(entity.lifecycle_state).toBe("pending");
  });
});
