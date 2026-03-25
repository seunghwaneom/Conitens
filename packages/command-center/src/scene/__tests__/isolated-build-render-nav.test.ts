/**
 * isolated-build-render-nav.test.ts — Sub-AC 14.1
 *
 * Isolated test infrastructure for the 3D command-center:
 * building-render + navigation tests covering the two primary
 * ontology entity names required by the acceptance criteria:
 *
 *   • agent_instance  — pre-placed inactive agent nodes in the scene graph
 *   • command         — CommandEntity lifecycle and serialization
 *
 * Test sections
 * ─────────────
 * 14.1-I    Scene initialization — scene graph boots without errors,
 *            building node exists, room nodes exist, agent_instance
 *            nodes are pre-placed.
 * 14.1-II   Building geometry render — room dimensions are non-degenerate,
 *            positions are finite, building hierarchy is consistent.
 * 14.1-III  Camera / navigation controls — focus functions produce valid
 *            camera poses for rooms and agent_instance world positions.
 * 14.1-IV   command entity ontology — CommandEntity factory produces valid
 *            entities; lifecycle state starts at "pending"; IDs are unique.
 *
 * Isolation guarantee
 * ───────────────────
 * All tests run in pure Node.js (no React, no WebGL, no DOM).
 * Scene graph operations use the scene-test-harness stubs.
 * Camera focus functions are pure functions exported from CameraRig.tsx.
 * CommandEntity creation is handled by the pure command-entity.ts module.
 *
 * Test ID scheme: 14.1-<section>-<N>
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Scene graph ──────────────────────────────────────────────────────────────
import {
  initializeCommandCenterScene,
  queryBuildingNode,
  queryAgentNode,
  queryAllAgentNodes,
  SCENE_BUILDING_NODE_NAME,
  SCENE_ROOT_NAME,
  SCENE_AGENT_NODE_PREFIX,
  type CommandCenterSceneGraph,
} from "../scene-graph-init.js";

// ── Test harness ─────────────────────────────────────────────────────────────
import {
  resetHarness,
  findAll,
  findByName,
  countNodes,
  captureSceneSnapshot,
  snapshotsEqual,
  makeScene,
  makeGroupNode,
  addToScene,
} from "../../testing/scene-test-harness.js";

// ── Building data ────────────────────────────────────────────────────────────
import { BUILDING, getRoomById, getRoomsForFloor } from "../../data/building.js";

// ── Agent seed ───────────────────────────────────────────────────────────────
import { AGENT_INITIAL_PLACEMENTS, getAgentSeed } from "../../data/agent-seed.js";

// ── Camera navigation (pure functions) ──────────────────────────────────────
import {
  CAMERA_PRESETS,
  CAMERA_TRANSITION_SPEED,
  computeRoomFocusCamera,
  computeAgentFocusCamera,
  computeFloorFocusCamera,
} from "../CameraRig.js";

// ── command entity ontology ──────────────────────────────────────────────────
import {
  createCommandEntity,
  generateCommandEntityId,
  COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE,
  serializeCommandEntity,
  type CommandEntity,
} from "../../data/command-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let scene: CommandCenterSceneGraph;

beforeEach(() => {
  resetHarness();
  scene = initializeCommandCenterScene();
});

// =============================================================================
// Section I — Scene initialization
// =============================================================================

describe("14.1-I: Scene initialization (building + agent_instance placement)", () => {
  it("14.1-I-1: initializeCommandCenterScene() returns a defined result", () => {
    expect(scene).toBeDefined();
    expect(scene.root).toBeDefined();
    expect(scene.buildingNode).toBeDefined();
  });

  it("14.1-I-2: root node is named 'Scene' with type 'Scene'", () => {
    expect(scene.root.name).toBe(SCENE_ROOT_NAME);
    expect(scene.root.type).toBe("Scene");
  });

  it("14.1-I-3: building node is named 'hierarchy-building' and has type 'Group'", () => {
    const building = queryBuildingNode(scene.root);
    expect(building).toBeDefined();
    expect(building?.name).toBe(SCENE_BUILDING_NODE_NAME);
    expect(building?.type).toBe("Group");
  });

  it("14.1-I-4: building node is a direct child of root", () => {
    const directChild = scene.root.children.find(
      (n) => n.name === SCENE_BUILDING_NODE_NAME,
    );
    expect(directChild).toBeDefined();
  });

  it("14.1-I-5: scene contains at least one room node (rooms are part of the building)", () => {
    expect(scene.roomNodes.length).toBeGreaterThan(0);
    expect(scene.roomNodes.length).toBe(BUILDING.rooms.length);
  });

  it("14.1-I-6: agent_instance nodes are pre-placed in the scene graph (at least 1)", () => {
    // agent_instance = scene nodes representing agents — named agent-<id>
    const agentNodes = queryAllAgentNodes(scene.root);
    expect(agentNodes.length).toBeGreaterThan(0);
  });

  it("14.1-I-7: every agent_instance node has status 'inactive' at initialization", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.userData.status).toBe("inactive");
    }
  });

  it("14.1-I-8: every agent_instance node has lifecycleState 'initializing' at boot", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.userData.lifecycleState).toBe("initializing");
    }
  });

  it("14.1-I-9: every agent_instance node has an agentId in userData", () => {
    for (const agentNode of scene.agentNodes) {
      expect(typeof agentNode.userData.agentId).toBe("string");
      expect((agentNode.userData.agentId as string).length).toBeGreaterThan(0);
    }
  });

  it("14.1-I-10: agent_instance node names follow the 'agent-<id>' naming convention", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.name).toMatch(
        new RegExp(`^${SCENE_AGENT_NODE_PREFIX}[\\w-]+$`),
      );
    }
  });

  it("14.1-I-11: every agent_instance is parented under a room node (building hierarchy)", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.parent).not.toBeNull();
      // Parent should be a room node (type Group, named room-*)
      expect(agentNode.parent?.type).toBe("Group");
      expect(agentNode.parent?.name).toMatch(/^room-/);
    }
  });

  it("14.1-I-12: scene graph snapshot is stable across two identical inits", () => {
    resetHarness();
    const scene1 = initializeCommandCenterScene();
    const snap1 = captureSceneSnapshot(scene1.root);

    resetHarness();
    const scene2 = initializeCommandCenterScene();
    const snap2 = captureSceneSnapshot(scene2.root);

    expect(snapshotsEqual(snap1, snap2)).toBe(true);
  });
});

// =============================================================================
// Section II — Building geometry render
// =============================================================================

describe("14.1-II: Building geometry render (non-degenerate, finite, consistent)", () => {
  it("14.1-II-1: every room has positive x/y/z dimensions (non-degenerate mesh bounds)", () => {
    for (const room of BUILDING.rooms) {
      expect(room.dimensions.x, `${room.roomId} width`).toBeGreaterThan(0);
      expect(room.dimensions.y, `${room.roomId} height`).toBeGreaterThan(0);
      expect(room.dimensions.z, `${room.roomId} depth`).toBeGreaterThan(0);
    }
  });

  it("14.1-II-2: every room has a finite world position (no NaN or Infinity)", () => {
    for (const room of BUILDING.rooms) {
      expect(isFinite(room.position.x), `${room.roomId} pos.x`).toBe(true);
      expect(isFinite(room.position.y), `${room.roomId} pos.y`).toBe(true);
      expect(isFinite(room.position.z), `${room.roomId} pos.z`).toBe(true);
    }
  });

  it("14.1-II-3: all room IDs are unique — no duplicate scene-graph nodes", () => {
    const ids = BUILDING.rooms.map((r) => r.roomId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("14.1-II-4: building has at least one floor with at least one room", () => {
    expect(BUILDING.floors.length).toBeGreaterThan(0);
    expect(BUILDING.rooms.length).toBeGreaterThan(0);
  });

  it("14.1-II-5: scene graph room count matches BUILDING.rooms count", () => {
    const roomNodes = scene.buildingNode.children.filter((n) =>
      n.name.startsWith("room-"),
    );
    expect(roomNodes.length).toBe(BUILDING.rooms.length);
  });

  it("14.1-II-6: building node userData carries the canonical buildingId", () => {
    expect(scene.buildingNode.userData.buildingId).toBe(BUILDING.buildingId);
  });

  it("14.1-II-7: building node userData carries floorCount equal to BUILDING.floors.length", () => {
    expect(scene.buildingNode.userData.floorCount).toBe(BUILDING.floors.length);
  });

  it("14.1-II-8: building node userData carries roomCount equal to BUILDING.rooms.length", () => {
    expect(scene.buildingNode.userData.roomCount).toBe(BUILDING.rooms.length);
  });

  it("14.1-II-9: building style is 'low-poly-dark' — confirms dark theme aesthetic", () => {
    expect(BUILDING.style).toBe("low-poly-dark");
  });

  it("14.1-II-10: BUILDING.visual exists with all required visual properties", () => {
    expect(BUILDING.visual.wallColor).toBeDefined();
    expect(BUILDING.visual.floorColor).toBeDefined();
    expect(BUILDING.visual.ceilingColor).toBeDefined();
    expect(typeof BUILDING.visual.accentGlowIntensity).toBe("number");
    expect(typeof BUILDING.visual.gridVisible).toBe("boolean");
  });

  it("14.1-II-11: floor roomIds all reference actual room entries (no dangling pointers)", () => {
    const roomById = new Map(BUILDING.rooms.map((r) => [r.roomId, r]));
    for (const floor of BUILDING.floors) {
      for (const id of floor.roomIds) {
        expect(
          roomById.has(id),
          `floor ${floor.floor} references unknown room '${id}'`,
        ).toBe(true);
      }
    }
  });

  it("14.1-II-12: scene graph root has a total node count greater than 1 (building + rooms + agents)", () => {
    const total = countNodes(scene.root);
    // At minimum: root + building + rooms + agents
    expect(total).toBeGreaterThan(1 + BUILDING.rooms.length);
  });

  it("14.1-II-13: each room has a colorAccent matching the hex color pattern", () => {
    for (const room of BUILDING.rooms) {
      expect(room.colorAccent, `${room.roomId} colorAccent`).toMatch(
        /^#[0-9A-Fa-f]{6}$/,
      );
    }
  });
});

// =============================================================================
// Section III — Camera / navigation controls
// =============================================================================

describe("14.1-III: Camera navigation controls (room focus, agent_instance focus, floor focus)", () => {
  // ── computeRoomFocusCamera ────────────────────────────────────────────────

  describe("computeRoomFocusCamera", () => {
    const firstRoom = BUILDING.rooms[0]!;

    it("14.1-III-1: returns position and target tuples of length 3", () => {
      const result = computeRoomFocusCamera(firstRoom);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("14.1-III-2: all returned values are finite numbers (no NaN/Infinity)", () => {
      const result = computeRoomFocusCamera(firstRoom);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("14.1-III-3: camera Y is above the room midpoint (camera is overhead)", () => {
      const result = computeRoomFocusCamera(firstRoom);
      const roomMidY = firstRoom.position.y + firstRoom.dimensions.y / 2;
      expect(result.position[1]).toBeGreaterThan(roomMidY);
    });

    it("14.1-III-4: camera is not coincident with target (non-zero view direction)", () => {
      const result = computeRoomFocusCamera(firstRoom);
      const dx = result.position[0] - result.target[0];
      const dy = result.position[1] - result.target[1];
      const dz = result.position[2] - result.target[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeGreaterThan(0.1);
    });

    it("14.1-III-5: works for every room without throwing", () => {
      for (const room of BUILDING.rooms) {
        expect(() => computeRoomFocusCamera(room)).not.toThrow();
      }
    });
  });

  // ── computeAgentFocusCamera (agent_instance navigation) ───────────────────

  describe("computeAgentFocusCamera (agent_instance entity)", () => {
    const agentPos = { x: 5.5, y: 3, z: 2.5 };

    it("14.1-III-6: returns position and target tuples of length 3", () => {
      const result = computeAgentFocusCamera(agentPos);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("14.1-III-7: all returned values are finite numbers", () => {
      const result = computeAgentFocusCamera(agentPos);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("14.1-III-8: camera Y is above the agent_instance (elevated perspective)", () => {
      const result = computeAgentFocusCamera(agentPos);
      expect(result.position[1]).toBeGreaterThan(agentPos.y);
    });

    it("14.1-III-9: camera is close to the agent_instance (within 4 world units)", () => {
      const result = computeAgentFocusCamera(agentPos);
      const dx = result.position[0] - agentPos.x;
      const dy = result.position[1] - agentPos.y;
      const dz = result.position[2] - agentPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeLessThan(4);
    });

    it("14.1-III-10: works for agent_instance positions on both floors without throwing", () => {
      // Floor 0 agent
      const f0Agent = { x: 6, y: 0.5, z: 2 };
      // Floor 1 agent
      const f1Agent = { x: 7, y: 3.5, z: 2 };
      expect(() => computeAgentFocusCamera(f0Agent)).not.toThrow();
      expect(() => computeAgentFocusCamera(f1Agent)).not.toThrow();
    });

    it("14.1-III-11: works for all seed agent_instance world positions without throwing", () => {
      for (const seed of AGENT_INITIAL_PLACEMENTS) {
        const wp = seed.position.worldPosition;
        expect(() => computeAgentFocusCamera(wp)).not.toThrow();
      }
    });
  });

  // ── computeFloorFocusCamera ───────────────────────────────────────────────

  describe("computeFloorFocusCamera", () => {
    it("14.1-III-12: returns valid position/target for floor 0", () => {
      const result = computeFloorFocusCamera(0);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("14.1-III-13: floor 1 camera position is higher than floor 0 (upper floors are higher)", () => {
      const f0 = computeFloorFocusCamera(0);
      const f1 = computeFloorFocusCamera(1);
      expect(f1.position[1]).toBeGreaterThan(f0.position[1]);
    });

    it("14.1-III-14: floor focus camera is positioned above the floor it focuses on", () => {
      const FLOOR_H = 3;
      for (let idx = 0; idx < BUILDING.floors.length; idx++) {
        const result = computeFloorFocusCamera(idx);
        const floorCenterY = idx * FLOOR_H + FLOOR_H / 2;
        expect(result.position[1], `floor ${idx} camera Y`).toBeGreaterThan(
          floorCenterY,
        );
      }
    });

    it("14.1-III-15: works for every building floor index without throwing", () => {
      for (let idx = 0; idx < BUILDING.floors.length; idx++) {
        expect(() => computeFloorFocusCamera(idx)).not.toThrow();
      }
    });
  });

  // ── CAMERA_PRESETS ────────────────────────────────────────────────────────

  describe("CAMERA_PRESETS", () => {
    it("14.1-III-16: overhead preset position Y is above total building height", () => {
      const TOTAL_H = 6; // 2 floors × 3 units
      const { position } = CAMERA_PRESETS.overhead;
      expect(position[1]).toBeGreaterThan(TOTAL_H);
    });

    it("14.1-III-17: CAMERA_TRANSITION_SPEED is a positive finite number", () => {
      expect(CAMERA_TRANSITION_SPEED).toBeGreaterThan(0);
      expect(isFinite(CAMERA_TRANSITION_SPEED)).toBe(true);
    });

    it("14.1-III-18: all camera preset position/target tuples have length 3", () => {
      for (const [name, preset] of Object.entries(CAMERA_PRESETS)) {
        expect(preset.position, `${name}.position`).toHaveLength(3);
        expect(preset.target, `${name}.target`).toHaveLength(3);
      }
    });

    it("14.1-III-19: all camera preset values are finite numbers", () => {
      for (const [name, preset] of Object.entries(CAMERA_PRESETS)) {
        for (const v of [...preset.position, ...preset.target]) {
          expect(isFinite(v), `${name} contains non-finite value`).toBe(true);
        }
      }
    });
  });
});

// =============================================================================
// Section IV — command entity ontology
// =============================================================================

describe("14.1-IV: command entity ontology (creation, lifecycle, IDs)", () => {
  it("14.1-IV-1: generateCommandEntityId() produces a string prefixed with 'gui_cmd_'", () => {
    const id = generateCommandEntityId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("gui_cmd_")).toBe(true);
  });

  it("14.1-IV-2: generateCommandEntityId() produces IDs of exactly 34 chars (gui_cmd_ + 26)", () => {
    const id = generateCommandEntityId();
    expect(id.length).toBe(34); // "gui_cmd_" (8) + ULID (26)
  });

  it("14.1-IV-3: generateCommandEntityId() produces unique IDs on successive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(generateCommandEntityId());
    }
    expect(ids.size).toBe(20);
  });

  it("14.1-IV-4: createCommandEntity() returns a defined CommandEntity", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:manager-default",
      action_type: "agent.spawn",
      payload: { agent_id: "manager-default", persona: "manager" },
    });
    expect(entity).toBeDefined();
  });

  it("14.1-IV-5: created command entity has lifecycle_state === 'pending' (initial state)", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:researcher-1",
      action_type: "agent.spawn",
      payload: { agent_id: "researcher-1" },
    });
    expect(entity.lifecycle_state).toBe(COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE);
    expect(entity.lifecycle_state).toBe("pending");
  });

  it("14.1-IV-6: created command entity is frozen (immutable)", () => {
    const entity = createCommandEntity({
      source_entity_id: "building:main",
      action_type: "nav.drill_down",
      payload: { target: "building", id: "main" },
    });
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("14.1-IV-7: command entity carries the source_entity_id from options", () => {
    const entity = createCommandEntity({
      source_entity_id: "room:research-lab",
      action_type: "nav.drill_down",
      payload: {},
    });
    expect(entity.source_entity_id).toBe("room:research-lab");
  });

  it("14.1-IV-8: command entity carries the action_type from options", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:implementer-1",
      action_type: "agent.terminate",
      payload: { reason: "completed" },
    });
    expect(entity.action_type).toBe("agent.terminate");
  });

  it("14.1-IV-9: command entity carries the payload from options", () => {
    const payload = { agent_id: "researcher-1", room_id: "research-lab" };
    const entity = createCommandEntity({
      source_entity_id: "agent:researcher-1",
      action_type: "agent.spawn",
      payload,
    });
    expect(entity.payload).toMatchObject(payload);
  });

  it("14.1-IV-10: command entity ts is a valid ISO 8601 string", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:manager-default",
      action_type: "agent.spawn",
      payload: {},
    });
    // ISO 8601: includes 'T' and 'Z' (or timezone offset)
    expect(entity.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("14.1-IV-11: command entity created_at_ms is a positive finite number", () => {
    const entity = createCommandEntity({
      source_entity_id: "building:main",
      action_type: "nav.drill_down",
      payload: {},
    });
    expect(entity.created_at_ms).toBeGreaterThan(0);
    expect(isFinite(entity.created_at_ms)).toBe(true);
  });

  it("14.1-IV-12: each new command entity has a unique command_id (no collisions in 10 entities)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const entity = createCommandEntity({
        source_entity_id: `agent:agent-${i}`,
        action_type: "agent.spawn",
        payload: { i },
      });
      ids.add(entity.command_id);
    }
    expect(ids.size).toBe(10);
  });

  it("14.1-IV-13: serializeCommandEntity() maps action_type to CommandFile.type field", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:manager-default",
      action_type: "agent.spawn",
      payload: { agent_id: "manager-default" },
    });
    const file = serializeCommandEntity(entity);
    expect(file.type).toBe(entity.action_type);
  });

  it("14.1-IV-14: serializeCommandEntity() maps source_entity_id to causation_id", () => {
    const entity = createCommandEntity({
      source_entity_id: "agent:researcher-1",
      action_type: "agent.spawn",
      payload: {},
    });
    const file = serializeCommandEntity(entity);
    expect(file.causation_id).toBe(entity.source_entity_id);
  });

  it("14.1-IV-15: serializeCommandEntity() preserves status as 'pending'", () => {
    const entity = createCommandEntity({
      source_entity_id: "room:ops-control",
      action_type: "nav.drill_down",
      payload: { room_id: "ops-control" },
    });
    const file = serializeCommandEntity(entity);
    expect(file.status).toBe("pending");
  });
});

// =============================================================================
// Section V — Isolated harness smoke test (meta-infrastructure)
// =============================================================================

describe("14.1-V: Isolated harness — scene infrastructure itself is testable without React/WebGL", () => {
  it("14.1-V-1: makeScene() creates a root node with type 'Scene'", () => {
    const root = makeScene();
    expect(root.name).toBe("Scene");
    expect(root.type).toBe("Scene");
  });

  it("14.1-V-2: makeGroupNode() creates a named Group node", () => {
    const group = makeGroupNode("test-group");
    expect(group.name).toBe("test-group");
    expect(group.type).toBe("Group");
  });

  it("14.1-V-3: addToScene() establishes parent-child relationship", () => {
    const root = makeScene();
    const child = makeGroupNode("child");
    addToScene(root, child);
    expect(root.children).toContain(child);
    expect(child.parent).toBe(root);
  });

  it("14.1-V-4: findByName() locates a node anywhere in the scene graph", () => {
    const root = makeScene();
    const group = makeGroupNode("deep-node");
    const child = makeGroupNode("nested");
    addToScene(root, group);
    addToScene(group, child);
    const found = findByName(root, "deep-node");
    expect(found).toBe(group);
  });

  it("14.1-V-5: findAll() returns all nodes matching a predicate", () => {
    const root = makeScene();
    addToScene(root, makeGroupNode("a"));
    addToScene(root, makeGroupNode("a"));
    addToScene(root, makeGroupNode("b"));
    const found = findAll(root, (n) => n.name === "a");
    expect(found).toHaveLength(2);
  });

  it("14.1-V-6: captureSceneSnapshot() serializes the scene to a stable snapshot", () => {
    const snap = captureSceneSnapshot(scene.root);
    expect(snap.totalNodes).toBeGreaterThan(0);
    expect(snap.nodes).toHaveLength(snap.totalNodes);
  });

  it("14.1-V-7: harness is isolated — no React / Three.js renderer imports needed", () => {
    // If this test file loads without error, the isolation guarantee holds.
    // We verify by confirming scene is fully constructed without any WebGL call.
    expect(scene.buildingNode.userData.style).toBe("low-poly-dark");
    expect(scene.agentNodes.length).toBeGreaterThan(0);
  });
});
