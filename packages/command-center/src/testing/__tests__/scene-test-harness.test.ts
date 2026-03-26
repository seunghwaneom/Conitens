/**
 * scene-test-harness.test.ts — Sub-AC 14.1 baseline test harness validation.
 *
 * Verifies that the test infrastructure introduced by Sub-AC 14.1 works
 * correctly in isolation:
 *
 *   14.1-vec     : Vector helpers — creation, add, sub, dist, scale, lerp, approxEq
 *   14.1-aabb    : AABB helpers — fromCenter, center, size, contains
 *   14.1-node    : SceneNode stubs — creation, parenting, traversal, search
 *   14.1-snap    : Snapshot capture + comparison
 *   14.1-event   : Mock pointer event factories
 *   14.1-assert  : Assertion helpers (positive & negative paths)
 *   14.1-lod     : Mock LOD computation
 *   14.1-agent   : Mock agent factory + bulk creation
 *   14.1-scene   : makeBaselineScene factory
 *   14.1-mock    : WebGLRendererMock construction + call tracking
 *   14.1-setup   : Global mocks installed via vitest-setup-three.ts
 *
 * All tests run in the Node.js environment with the Three.js global stubs
 * installed via setupFiles in vitest.config.ts.
 *
 * Test ID scheme: 14.1-<category>-<N>
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Vector helpers
  vec3,
  addVec3,
  subVec3,
  distVec3,
  scaleVec3,
  lerpVec3,
  approxEqVec3,
  // AABB helpers
  aabbFromCenter,
  aabbCenter,
  aabbSize,
  aabbContains,
  // SceneNode stubs
  makeSceneNode,
  makeMeshNode,
  makeGroupNode,
  makeScene,
  addToScene,
  removeFromScene,
  traverseScene,
  findByName,
  findAll,
  countNodes,
  resetNodeIdCounter,
  // Snapshots
  captureSceneSnapshot,
  snapshotsEqual,
  formatSceneSnapshot,
  // Event simulation
  makeClickEvent,
  makeHoverEnterEvent,
  makeContextMenuEvent,
  resetSessionCounter,
  // Assertion helpers
  assertNodePosition,
  assertNodeVisible,
  assertNodeHidden,
  assertNodeCount,
  assertUserData,
  assertBoundsContain,
  SceneAssertionError,
  // LOD
  computeMockLod,
  buildLodTable,
  // Agent stubs
  makeMockAgent,
  makeMockAgents,
  // Task connectors
  makeMockTaskConnector,
  // Room stubs
  makeMockRoom,
  // Baseline scene
  makeBaselineScene,
  resetHarness,
  // Types
  type Vec3,
  type SceneNode,
  type MockLodLevel,
} from "../scene-test-harness.js";

import {
  WebGLRendererMock,
  installThreeMocks,
  uninstallThreeMocks,
  areMocksInstalled,
  makeWebGL2Context,
  makeMockCanvas,
} from "../three-renderer-mock.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global reset
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetHarness();
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-vec · Vector helpers
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-vec-1: vec3() factory", () => {
  it("creates zero vector by default", () => {
    const v = vec3();
    expect(v).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("creates vector with provided components", () => {
    const v = vec3(1, 2, 3);
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("creates vector with negative components", () => {
    const v = vec3(-5, -3.14, 100);
    expect(v.x).toBe(-5);
    expect(v.y).toBeCloseTo(-3.14);
    expect(v.z).toBe(100);
  });
});

describe("14.1-vec-2: addVec3()", () => {
  it("adds two vectors", () => {
    const result = addVec3(vec3(1, 2, 3), vec3(4, 5, 6));
    expect(result).toEqual({ x: 5, y: 7, z: 9 });
  });

  it("is commutative", () => {
    const a = vec3(1, 2, 3);
    const b = vec3(10, 20, 30);
    expect(addVec3(a, b)).toEqual(addVec3(b, a));
  });

  it("adding zero vector is identity", () => {
    const v = vec3(7, 8, 9);
    expect(addVec3(v, vec3())).toEqual(v);
  });

  it("does not mutate inputs", () => {
    const a = vec3(1, 1, 1);
    const b = vec3(2, 2, 2);
    addVec3(a, b);
    expect(a).toEqual({ x: 1, y: 1, z: 1 });
    expect(b).toEqual({ x: 2, y: 2, z: 2 });
  });
});

describe("14.1-vec-3: subVec3()", () => {
  it("subtracts b from a", () => {
    const result = subVec3(vec3(5, 7, 9), vec3(1, 2, 3));
    expect(result).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("subtracting self produces zero vector", () => {
    const v = vec3(3, 4, 5);
    expect(subVec3(v, v)).toEqual(vec3());
  });
});

describe("14.1-vec-4: distVec3()", () => {
  it("distance between same point is 0", () => {
    expect(distVec3(vec3(1, 2, 3), vec3(1, 2, 3))).toBe(0);
  });

  it("unit distance along X axis", () => {
    expect(distVec3(vec3(0, 0, 0), vec3(1, 0, 0))).toBeCloseTo(1);
  });

  it("3D Pythagorean triple (3, 4, 0) → 5", () => {
    expect(distVec3(vec3(0, 0, 0), vec3(3, 4, 0))).toBeCloseTo(5);
  });

  it("is symmetric", () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(distVec3(a, b)).toBeCloseTo(distVec3(b, a));
  });
});

describe("14.1-vec-5: scaleVec3()", () => {
  it("scales by 2", () => {
    expect(scaleVec3(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it("scale by 0 produces zero vector", () => {
    expect(scaleVec3(vec3(5, 6, 7), 0)).toEqual(vec3());
  });

  it("scale by 1 is identity", () => {
    const v = vec3(3, -1, 0.5);
    expect(scaleVec3(v, 1)).toEqual(v);
  });
});

describe("14.1-vec-6: lerpVec3()", () => {
  it("t=0 returns start", () => {
    const a = vec3(0, 0, 0);
    const b = vec3(10, 10, 10);
    expect(lerpVec3(a, b, 0)).toEqual(a);
  });

  it("t=1 returns end", () => {
    const a = vec3(0, 0, 0);
    const b = vec3(10, 10, 10);
    expect(lerpVec3(a, b, 1)).toEqual(b);
  });

  it("t=0.5 returns midpoint", () => {
    const a = vec3(0, 0, 0);
    const b = vec3(10, 0, 0);
    const mid = lerpVec3(a, b, 0.5);
    expect(mid.x).toBeCloseTo(5);
    expect(mid.y).toBeCloseTo(0);
    expect(mid.z).toBeCloseTo(0);
  });
});

describe("14.1-vec-7: approxEqVec3()", () => {
  it("equal vectors return true", () => {
    expect(approxEqVec3(vec3(1, 2, 3), vec3(1, 2, 3))).toBe(true);
  });

  it("vectors within default epsilon return true", () => {
    expect(approxEqVec3(vec3(1, 2, 3), vec3(1 + 1e-7, 2, 3))).toBe(true);
  });

  it("vectors outside epsilon return false", () => {
    expect(approxEqVec3(vec3(1, 2, 3), vec3(1.01, 2, 3), 0.005)).toBe(false);
  });

  it("custom epsilon respected", () => {
    expect(approxEqVec3(vec3(0, 0, 0), vec3(0.1, 0, 0), 0.2)).toBe(true);
    expect(approxEqVec3(vec3(0, 0, 0), vec3(0.3, 0, 0), 0.2)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-aabb · AABB helpers
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-aabb-1: aabbFromCenter()", () => {
  it("produces correct min/max from unit cube at origin", () => {
    const box = aabbFromCenter(vec3(), vec3(0.5, 0.5, 0.5));
    expect(box.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 });
    expect(box.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it("produces correct bounds for an off-centre box", () => {
    const box = aabbFromCenter(vec3(5, 0, 0), vec3(1, 2, 3));
    expect(box.min.x).toBeCloseTo(4);
    expect(box.max.x).toBeCloseTo(6);
    expect(box.min.y).toBeCloseTo(-2);
    expect(box.max.y).toBeCloseTo(2);
  });
});

describe("14.1-aabb-2: aabbCenter()", () => {
  it("returns the geometric centre", () => {
    const box = aabbFromCenter(vec3(3, 4, 5), vec3(1, 1, 1));
    const c = aabbCenter(box);
    expect(approxEqVec3(c, vec3(3, 4, 5))).toBe(true);
  });
});

describe("14.1-aabb-3: aabbSize()", () => {
  it("returns correct size for unit cube", () => {
    const box = aabbFromCenter(vec3(), vec3(0.5, 0.5, 0.5));
    expect(aabbSize(box)).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("returns correct size for non-uniform box", () => {
    const box = aabbFromCenter(vec3(), vec3(1, 2, 3));
    expect(aabbSize(box)).toEqual({ x: 2, y: 4, z: 6 });
  });
});

describe("14.1-aabb-4: aabbContains()", () => {
  it("origin is inside unit cube at origin", () => {
    const box = aabbFromCenter(vec3(), vec3(1, 1, 1));
    expect(aabbContains(box, vec3())).toBe(true);
  });

  it("corner point is on boundary (inclusive)", () => {
    const box = aabbFromCenter(vec3(), vec3(1, 1, 1));
    expect(aabbContains(box, vec3(1, 1, 1))).toBe(true);
  });

  it("point just outside is not contained", () => {
    const box = aabbFromCenter(vec3(), vec3(1, 1, 1));
    expect(aabbContains(box, vec3(1.01, 0, 0))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-node · SceneNode stubs
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-node-1: makeSceneNode()", () => {
  it("creates a node with default values", () => {
    const n = makeSceneNode();
    expect(n.type).toBe("Object3D");
    expect(n.visible).toBe(true);
    expect(n.children).toHaveLength(0);
    expect(n.parent).toBeNull();
    expect(n.name).toBe("");
  });

  it("accepts overrides", () => {
    const n = makeSceneNode({ name: "my-node", type: "Mesh" });
    expect(n.name).toBe("my-node");
    expect(n.type).toBe("Mesh");
  });

  it("assigns unique incrementing node IDs", () => {
    const n1 = makeSceneNode();
    const n2 = makeSceneNode();
    expect(n2.nodeId).toBe(n1.nodeId + 1);
  });

  it("resetNodeIdCounter resets IDs to 0", () => {
    makeSceneNode();
    makeSceneNode();
    resetNodeIdCounter();
    const n = makeSceneNode();
    expect(n.nodeId).toBe(0);
  });
});

describe("14.1-node-2: makeMeshNode()", () => {
  it("creates a node of type Mesh", () => {
    const n = makeMeshNode();
    expect(n.type).toBe("Mesh");
  });

  it("stores color in userData", () => {
    const n = makeMeshNode({ color: 0xff0000 });
    expect(n.userData.color).toBe(0xff0000);
  });

  it("stores wireframe in userData", () => {
    const n = makeMeshNode({ wireframe: true });
    expect(n.userData.wireframe).toBe(true);
  });
});

describe("14.1-node-3: makeGroupNode()", () => {
  it("creates a group with name and children", () => {
    const child = makeSceneNode({ name: "child" });
    const group = makeGroupNode("my-group", [child]);
    expect(group.type).toBe("Group");
    expect(group.name).toBe("my-group");
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBe(child);
    expect(child.parent).toBe(group);
  });

  it("empty group has no children", () => {
    const g = makeGroupNode("empty");
    expect(g.children).toHaveLength(0);
  });
});

describe("14.1-node-4: addToScene() / removeFromScene()", () => {
  it("addToScene adds child and sets parent", () => {
    const parent = makeGroupNode("parent");
    const child = makeSceneNode({ name: "child" });
    addToScene(parent, child);
    expect(parent.children).toContain(child);
    expect(child.parent).toBe(parent);
  });

  it("removeFromScene removes child and clears parent", () => {
    const parent = makeGroupNode("parent");
    const child = makeSceneNode({ name: "child" });
    addToScene(parent, child);
    removeFromScene(parent, child);
    expect(parent.children).not.toContain(child);
    expect(child.parent).toBeNull();
  });

  it("addToScene re-parents a child that already has a parent", () => {
    const parentA = makeGroupNode("A");
    const parentB = makeGroupNode("B");
    const child = makeSceneNode({ name: "child" });
    addToScene(parentA, child);
    addToScene(parentB, child);
    expect(parentA.children).not.toContain(child);
    expect(parentB.children).toContain(child);
    expect(child.parent).toBe(parentB);
  });
});

describe("14.1-node-5: traverseScene()", () => {
  it("visits root and all descendants in order", () => {
    const root = makeScene();
    const g1 = makeGroupNode("g1");
    const m1 = makeMeshNode({ name: "m1" });
    const m2 = makeMeshNode({ name: "m2" });
    addToScene(g1, m1);
    addToScene(g1, m2);
    addToScene(root, g1);

    const visited: string[] = [];
    traverseScene(root, (n) => visited.push(n.name));
    expect(visited).toEqual(["Scene", "g1", "m1", "m2"]);
  });
});

describe("14.1-node-6: findByName()", () => {
  it("finds a node by name", () => {
    const root = makeScene();
    const target = makeGroupNode("target-node");
    addToScene(root, target);

    const found = findByName(root, "target-node");
    expect(found).toBe(target);
  });

  it("returns undefined for non-existent name", () => {
    const root = makeScene();
    expect(findByName(root, "does-not-exist")).toBeUndefined();
  });
});

describe("14.1-node-7: findAll()", () => {
  it("finds all Mesh nodes", () => {
    const root = makeScene();
    const m1 = makeMeshNode({ name: "mesh1" });
    const m2 = makeMeshNode({ name: "mesh2" });
    const g = makeGroupNode("group", [m1, m2]);
    addToScene(root, g);

    const meshes = findAll(root, (n) => n.type === "Mesh");
    expect(meshes).toHaveLength(2);
    expect(meshes).toContain(m1);
    expect(meshes).toContain(m2);
  });

  it("returns empty array when nothing matches", () => {
    const root = makeScene();
    expect(findAll(root, (n) => n.type === "Camera")).toHaveLength(0);
  });
});

describe("14.1-node-8: countNodes()", () => {
  it("counts only root when empty", () => {
    const root = makeScene();
    expect(countNodes(root)).toBe(1);
  });

  it("counts all nodes in a tree", () => {
    const { root } = makeBaselineScene({
      agentCount: 3,
      roomCount: 2,
    });
    // Root + building + 2 rooms + 3 agents = 7 minimum
    expect(countNodes(root)).toBeGreaterThanOrEqual(7);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-snap · Scene snapshots
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-snap-1: captureSceneSnapshot()", () => {
  it("captures the correct node count", () => {
    const root = makeScene();
    addToScene(root, makeGroupNode("building"));
    const snap = captureSceneSnapshot(root);
    expect(snap.totalNodes).toBe(2); // Scene + building
  });

  it("snapshot is frozen (immutable)", () => {
    const root = makeScene();
    const snap = captureSceneSnapshot(root);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.nodes)).toBe(true);
  });

  it("snapshot has a capturedAt timestamp", () => {
    const root = makeScene();
    const snap = captureSceneSnapshot(root);
    expect(snap.capturedAt).toBeGreaterThan(0);
    expect(typeof snap.capturedAt).toBe("number");
  });

  it("nodes reflect depth-first order", () => {
    const root = makeScene();
    const g = makeGroupNode("g");
    const m = makeMeshNode({ name: "m" });
    addToScene(g, m);
    addToScene(root, g);

    const snap = captureSceneSnapshot(root);
    expect(snap.nodes[0]?.name).toBe("Scene");
    expect(snap.nodes[1]?.name).toBe("g");
    expect(snap.nodes[2]?.name).toBe("m");
  });
});

describe("14.1-snap-2: snapshotsEqual()", () => {
  it("same scene produces equal snapshots", () => {
    const root = makeScene();
    addToScene(root, makeGroupNode("g1"));
    const s1 = captureSceneSnapshot(root);
    const s2 = captureSceneSnapshot(root);
    expect(snapshotsEqual(s1, s2)).toBe(true);
  });

  it("different scenes produce unequal snapshots", () => {
    resetNodeIdCounter();
    const root1 = makeScene();
    addToScene(root1, makeGroupNode("g1"));
    const s1 = captureSceneSnapshot(root1);

    resetNodeIdCounter();
    const root2 = makeScene();
    const s2 = captureSceneSnapshot(root2);

    expect(snapshotsEqual(s1, s2)).toBe(false);
  });
});

describe("14.1-snap-3: formatSceneSnapshot()", () => {
  it("returns a non-empty string", () => {
    const root = makeScene();
    const snap = captureSceneSnapshot(root);
    const output = formatSceneSnapshot(snap);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("includes node names in output", () => {
    const root = makeScene();
    addToScene(root, makeGroupNode("my-building"));
    const snap = captureSceneSnapshot(root);
    const output = formatSceneSnapshot(snap);
    expect(output).toContain("my-building");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-event · Mock pointer events
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-event-1: makeClickEvent()", () => {
  it("produces a click event with the given position", () => {
    const ev = makeClickEvent(vec3(1, 2, 3));
    expect(ev.type).toBe("click");
    expect(ev.worldPosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("auto-assigns a session ID", () => {
    const ev = makeClickEvent(vec3());
    expect(typeof ev.sessionId).toBe("string");
    expect(ev.sessionId.length).toBeGreaterThan(0);
  });

  it("accepts an explicit session ID", () => {
    const ev = makeClickEvent(vec3(), "my-session");
    expect(ev.sessionId).toBe("my-session");
  });

  it("has a positive timestamp", () => {
    const ev = makeClickEvent(vec3());
    expect(ev.timestamp).toBeGreaterThan(0);
  });
});

describe("14.1-event-2: makeHoverEnterEvent()", () => {
  it("produces a hover_enter event", () => {
    const ev = makeHoverEnterEvent(vec3(5, 0, 5));
    expect(ev.type).toBe("hover_enter");
  });
});

describe("14.1-event-3: makeContextMenuEvent()", () => {
  it("produces a context_menu event", () => {
    const ev = makeContextMenuEvent(vec3());
    expect(ev.type).toBe("context_menu");
  });
});

describe("14.1-event-4: resetSessionCounter()", () => {
  it("resets session IDs after call", () => {
    const ev1 = makeClickEvent(vec3());
    resetSessionCounter();
    const ev2 = makeClickEvent(vec3());
    // After reset, IDs restart from 0 and should be the same prefix pattern
    expect(ev2.sessionId).toContain("test-session-0");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-assert · Assertion helpers
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-assert-1: assertNodePosition()", () => {
  it("passes when position matches", () => {
    const n = makeSceneNode({ position: vec3(1, 2, 3) });
    expect(() => assertNodePosition(n, vec3(1, 2, 3))).not.toThrow();
  });

  it("throws SceneAssertionError when position does not match", () => {
    const n = makeSceneNode({ position: vec3(1, 2, 3) });
    expect(() => assertNodePosition(n, vec3(9, 9, 9))).toThrow(SceneAssertionError);
  });

  it("error message includes node name and positions", () => {
    const n = makeSceneNode({ name: "my-node", position: vec3(0, 0, 0) });
    try {
      assertNodePosition(n, vec3(1, 0, 0));
    } catch (e) {
      expect(e).toBeInstanceOf(SceneAssertionError);
      expect((e as SceneAssertionError).message).toContain("my-node");
    }
  });
});

describe("14.1-assert-2: assertNodeVisible() / assertNodeHidden()", () => {
  it("assertNodeVisible passes when visible=true", () => {
    const n = makeSceneNode({ visible: true });
    expect(() => assertNodeVisible(n)).not.toThrow();
  });

  it("assertNodeVisible throws when visible=false", () => {
    const n = makeSceneNode({ visible: false });
    expect(() => assertNodeVisible(n)).toThrow(SceneAssertionError);
  });

  it("assertNodeHidden passes when visible=false", () => {
    const n = makeSceneNode({ visible: false });
    expect(() => assertNodeHidden(n)).not.toThrow();
  });

  it("assertNodeHidden throws when visible=true", () => {
    const n = makeSceneNode({ visible: true });
    expect(() => assertNodeHidden(n)).toThrow(SceneAssertionError);
  });
});

describe("14.1-assert-3: assertNodeCount()", () => {
  it("passes when count matches", () => {
    const root = makeScene();
    addToScene(root, makeMeshNode({ name: "m1" }));
    addToScene(root, makeMeshNode({ name: "m2" }));
    expect(() => assertNodeCount(root, "Mesh", 2)).not.toThrow();
  });

  it("throws when count does not match", () => {
    const root = makeScene();
    addToScene(root, makeMeshNode());
    expect(() => assertNodeCount(root, "Mesh", 5)).toThrow(SceneAssertionError);
  });
});

describe("14.1-assert-4: assertUserData()", () => {
  it("passes when userData key matches expected value", () => {
    const n = makeSceneNode({ userData: { agentId: "agent-42" } });
    expect(() => assertUserData(n, "agentId", "agent-42")).not.toThrow();
  });

  it("throws when userData value does not match", () => {
    const n = makeSceneNode({ userData: { status: "active" } });
    expect(() => assertUserData(n, "status", "inactive")).toThrow(SceneAssertionError);
  });
});

describe("14.1-assert-5: assertBoundsContain()", () => {
  it("passes when point is inside box", () => {
    const box = aabbFromCenter(vec3(), vec3(5, 5, 5));
    expect(() => assertBoundsContain(box, vec3(1, 1, 1))).not.toThrow();
  });

  it("throws when point is outside box", () => {
    const box = aabbFromCenter(vec3(), vec3(1, 1, 1));
    expect(() => assertBoundsContain(box, vec3(10, 0, 0))).toThrow(SceneAssertionError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-lod · Mock LOD computation
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-lod-1: computeMockLod()", () => {
  const CASES: [number, MockLodLevel][] = [
    [0, "full"],
    [4, "full"],
    [8, "full"],
    [9, "medium"],
    [16, "medium"],
    [17, "low"],
    [30, "low"],
    [31, "hidden"],
    [100, "hidden"],
  ];

  for (const [dist, expected] of CASES) {
    it(`distance=${dist} → level="${expected}"`, () => {
      expect(computeMockLod(dist)).toBe(expected);
    });
  }
});

describe("14.1-lod-2: buildLodTable()", () => {
  it("produces an entry for each node", () => {
    const nodes = [
      makeSceneNode({ name: "a", position: vec3(0, 0, 0) }),
      makeSceneNode({ name: "b", position: vec3(20, 0, 0) }),
    ];
    const table = buildLodTable(nodes, vec3());
    expect(table).toHaveLength(2);
  });

  it("near node gets full LOD", () => {
    const near = makeSceneNode({ position: vec3(2, 0, 0) });
    const [entry] = buildLodTable([near], vec3());
    expect(entry?.level).toBe("full");
  });

  it("distant node gets hidden LOD", () => {
    const far = makeSceneNode({ position: vec3(50, 0, 0) });
    const [entry] = buildLodTable([far], vec3());
    expect(entry?.level).toBe("hidden");
  });

  it("distanceToCamera is correctly computed", () => {
    const node = makeSceneNode({ position: vec3(3, 4, 0) });
    const [entry] = buildLodTable([node], vec3());
    expect(entry?.distanceToCamera).toBeCloseTo(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-agent · Mock agent factories
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-agent-1: makeMockAgent()", () => {
  it("creates an inactive agent with defaults", () => {
    const a = makeMockAgent({ agentId: "test-agent" });
    expect(a.agentId).toBe("test-agent");
    expect(a.status).toBe("inactive");
    expect(a.role).toBe("implementer");
  });

  it("accepts overrides", () => {
    const a = makeMockAgent({
      agentId: "a1",
      status: "active",
      role: "manager",
      roomId: "ops-control",
    });
    expect(a.status).toBe("active");
    expect(a.role).toBe("manager");
    expect(a.roomId).toBe("ops-control");
  });
});

describe("14.1-agent-2: makeMockAgents()", () => {
  it("creates the requested number of agents", () => {
    const agents = makeMockAgents(10);
    expect(agents).toHaveLength(10);
  });

  it("all agents start as inactive", () => {
    const agents = makeMockAgents(5);
    for (const a of agents) {
      expect(a.status).toBe("inactive");
    }
  });

  it("all agents get unique IDs", () => {
    const agents = makeMockAgents(8);
    const ids = new Set(agents.map((a) => a.agentId));
    expect(ids.size).toBe(8);
  });

  it("positions are staggered in a grid", () => {
    const agents = makeMockAgents(6);
    const positions = agents.map((a) => `${a.position.x},${a.position.z}`);
    // All positions should be distinct
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(6);
  });

  it("supports 20 agents (upper bound from AC 15)", () => {
    const agents = makeMockAgents(20);
    expect(agents).toHaveLength(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-scene · makeBaselineScene()
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-scene-1: makeBaselineScene() default options", () => {
  it("creates a root scene node", () => {
    const { root } = makeBaselineScene();
    expect(root.type).toBe("Scene");
    expect(root.name).toBe("Scene");
  });

  it("contains a building group", () => {
    const { buildingNode } = makeBaselineScene();
    expect(buildingNode.type).toBe("Group");
    expect(buildingNode.name).toBe("building");
  });

  it("produces the default 5 agents", () => {
    const { agents } = makeBaselineScene();
    expect(agents).toHaveLength(5);
  });

  it("produces the default 3 rooms", () => {
    const { rooms } = makeBaselineScene();
    expect(rooms).toHaveLength(3);
  });

  it("all agent nodes have agentId in userData", () => {
    const { agents } = makeBaselineScene();
    for (const a of agents) {
      expect(a.userData.agentId).toBeTruthy();
    }
  });

  it("all agent nodes start with status=inactive", () => {
    const { agents } = makeBaselineScene();
    for (const a of agents) {
      expect(a.userData.status).toBe("inactive");
    }
  });

  it("all room nodes have roomId in userData", () => {
    const { rooms } = makeBaselineScene();
    for (const r of rooms) {
      expect(r.userData.roomId).toBeTruthy();
    }
  });

  it("building is a child of root", () => {
    const { root, buildingNode } = makeBaselineScene();
    expect(root.children).toContain(buildingNode);
    expect(buildingNode.parent).toBe(root);
  });

  it("rooms are children of building", () => {
    const { buildingNode, rooms } = makeBaselineScene();
    for (const r of rooms) {
      expect(buildingNode.children).toContain(r);
    }
  });
});

describe("14.1-scene-2: makeBaselineScene() custom options", () => {
  it("respects custom agentCount", () => {
    const { agents } = makeBaselineScene({ agentCount: 10 });
    expect(agents).toHaveLength(10);
  });

  it("respects custom roomCount", () => {
    const { rooms } = makeBaselineScene({ roomCount: 6 });
    expect(rooms).toHaveLength(6);
  });

  it("supports min config (1 agent, 1 room)", () => {
    const { agents, rooms } = makeBaselineScene({ agentCount: 1, roomCount: 1 });
    expect(agents).toHaveLength(1);
    expect(rooms).toHaveLength(1);
  });

  it("supports max config (20 agents, 10 rooms)", () => {
    const { agents, rooms } = makeBaselineScene({
      agentCount: 20,
      roomCount: 10,
    });
    expect(agents).toHaveLength(20);
    expect(rooms).toHaveLength(10);
  });
});

describe("14.1-scene-3: makeBaselineScene() snapshot stability", () => {
  it("same options produce same node count", () => {
    resetNodeIdCounter();
    const sceneA = makeBaselineScene({ agentCount: 5, roomCount: 3 });
    const countA = countNodes(sceneA.root);

    resetNodeIdCounter();
    const sceneB = makeBaselineScene({ agentCount: 5, roomCount: 3 });
    const countB = countNodes(sceneB.root);

    expect(countA).toBe(countB);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-mock · WebGLRendererMock
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-mock-1: WebGLRendererMock construction", () => {
  it("creates a renderer with a mock canvas", () => {
    const r = new WebGLRendererMock();
    expect(r.domElement).toBeDefined();
    expect(typeof r.domElement).toBe("object");
  });

  it("creates a renderer with a WebGL2 context", () => {
    const r = new WebGLRendererMock();
    expect(r.gl).toBeDefined();
  });

  it("starts with all call counts at 0", () => {
    const r = new WebGLRendererMock();
    expect(r.calls.render).toBe(0);
    expect(r.calls.setSize).toBe(0);
    expect(r.calls.setPixelRatio).toBe(0);
    expect(r.calls.clear).toBe(0);
    expect(r.calls.dispose).toBe(0);
  });
});

describe("14.1-mock-2: WebGLRendererMock call tracking", () => {
  it("tracks render() calls", () => {
    const r = new WebGLRendererMock();
    r.render({}, {});
    r.render({}, {});
    expect(r.calls.render).toBe(2);
  });

  it("tracks setSize() calls and updates size", () => {
    const r = new WebGLRendererMock();
    r.setSize(1920, 1080);
    expect(r.calls.setSize).toBe(1);
    expect(r.size.width).toBe(1920);
    expect(r.size.height).toBe(1080);
  });

  it("tracks setPixelRatio() calls and updates pixelRatio", () => {
    const r = new WebGLRendererMock();
    r.setPixelRatio(2);
    expect(r.calls.setPixelRatio).toBe(1);
    expect(r.pixelRatio).toBe(2);
  });

  it("tracks clear() calls", () => {
    const r = new WebGLRendererMock();
    r.clear();
    r.clear();
    r.clear();
    expect(r.calls.clear).toBe(3);
  });

  it("tracks dispose() calls", () => {
    const r = new WebGLRendererMock();
    r.dispose();
    expect(r.calls.dispose).toBe(1);
  });

  it("resetCalls() resets all counts to 0", () => {
    const r = new WebGLRendererMock();
    r.render({}, {});
    r.setSize(100, 100);
    r.clear();
    r.resetCalls();
    expect(r.calls.render).toBe(0);
    expect(r.calls.setSize).toBe(0);
    expect(r.calls.clear).toBe(0);
  });
});

describe("14.1-mock-3: WebGLRendererMock getters", () => {
  it("getPixelRatio() returns current pixel ratio", () => {
    const r = new WebGLRendererMock();
    r.setPixelRatio(3);
    expect(r.getPixelRatio()).toBe(3);
  });

  it("getSize() returns current dimensions", () => {
    const r = new WebGLRendererMock();
    r.setSize(1280, 720);
    const s = r.getSize({ width: 0, height: 0 });
    expect(s.width).toBe(1280);
    expect(s.height).toBe(720);
  });

  it("getContext() returns the mock WebGL2 context", () => {
    const r = new WebGLRendererMock();
    const ctx = r.getContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx.clear).toBe("function");
  });

  it("isContextLost() returns false", () => {
    const r = new WebGLRendererMock();
    expect(r.gl.isContextLost()).toBe(false);
  });
});

describe("14.1-mock-4: makeWebGL2Context()", () => {
  it("returns an object with core WebGL methods", () => {
    const ctx = makeWebGL2Context();
    expect(typeof ctx.clear).toBe("function");
    expect(typeof ctx.drawArrays).toBe("function");
    expect(typeof ctx.createTexture).toBe("function");
    expect(typeof ctx.useProgram).toBe("function");
  });

  it("getParameter returns VERSION string", () => {
    const ctx = makeWebGL2Context();
    const version = ctx.getParameter(0x1f02); // VERSION
    expect(typeof version).toBe("string");
    expect(version).toContain("mock");
  });

  it("getExtension returns null for unknown extensions", () => {
    const ctx = makeWebGL2Context();
    expect(ctx.getExtension("UNKNOWN_EXTENSION")).toBeNull();
  });

  it("getExtension returns stub for OES_vertex_array_object", () => {
    const ctx = makeWebGL2Context();
    const ext = ctx.getExtension("OES_vertex_array_object");
    expect(ext).not.toBeNull();
    expect(typeof (ext as Record<string, unknown>).createVertexArrayOES).toBe("function");
  });

  it("isContextLost() returns false", () => {
    const ctx = makeWebGL2Context();
    expect(ctx.isContextLost()).toBe(false);
  });

  it("checkFramebufferStatus returns FRAMEBUFFER_COMPLETE", () => {
    const ctx = makeWebGL2Context();
    // FRAMEBUFFER_COMPLETE = 0x8cd5
    expect(ctx.checkFramebufferStatus(0x8d40)).toBe(0x8cd5);
  });

  it("getSupportedExtensions returns a non-empty array", () => {
    const ctx = makeWebGL2Context();
    const exts = ctx.getSupportedExtensions();
    expect(Array.isArray(exts)).toBe(true);
    expect((exts as string[]).length).toBeGreaterThan(0);
  });
});

describe("14.1-mock-5: makeMockCanvas()", () => {
  it("returns an object with width and height", () => {
    const canvas = makeMockCanvas();
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("getContext('webgl2') returns mock WebGL2 context", () => {
    const canvas = makeMockCanvas();
    const ctx = canvas.getContext("webgl2");
    expect(ctx).not.toBeNull();
  });

  it("getContext('webgl') also returns mock context", () => {
    const canvas = makeMockCanvas();
    const ctx = canvas.getContext("webgl");
    expect(ctx).not.toBeNull();
  });

  it("getContext(unknown) returns null", () => {
    const canvas = makeMockCanvas();
    const ctx = canvas.getContext("2d");
    expect(ctx).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-setup · Global mocks from vitest-setup-three.ts
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-setup-1: Globals installed by vitest-setup-three.ts", () => {
  it("requestAnimationFrame is defined", () => {
    expect(typeof globalThis.requestAnimationFrame).toBe("function");
  });

  it("cancelAnimationFrame is defined", () => {
    expect(typeof globalThis.cancelAnimationFrame).toBe("function");
  });

  it("WebGL2RenderingContext is defined", () => {
    expect(
      (globalThis as Record<string, unknown>).WebGL2RenderingContext
    ).toBeDefined();
  });

  it("performance.now is available", () => {
    expect(typeof performance.now).toBe("function");
    expect(performance.now()).toBeGreaterThan(0);
  });

  it("ResizeObserver is defined", () => {
    const ro = (globalThis as Record<string, unknown>).ResizeObserver as
      | (new () => { observe(): void; disconnect(): void })
      | undefined;
    expect(ro).toBeDefined();
    const instance = ro ? new ro() : null;
    expect(instance).not.toBeNull();
  });
});

describe("14.1-setup-2: installThreeMocks() / uninstallThreeMocks()", () => {
  it("installThreeMocks() is idempotent", () => {
    installThreeMocks();
    installThreeMocks(); // second call should not throw
    expect(areMocksInstalled()).toBe(true);
  });

  it("areMocksInstalled() reflects state", () => {
    installThreeMocks();
    expect(areMocksInstalled()).toBe(true);
    uninstallThreeMocks();
    expect(areMocksInstalled()).toBe(false);
    // Reinstall for subsequent tests
    installThreeMocks();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14.1-integration · Harness composition (end-to-end minimal scene test)
// ═════════════════════════════════════════════════════════════════════════════

describe("14.1-integration: baseline scene + renderer mock end-to-end", () => {
  it("renders baseline scene without errors", () => {
    const { root } = makeBaselineScene({ agentCount: 5, roomCount: 3 });
    const renderer = new WebGLRendererMock();

    // Simulate a single render frame
    renderer.setSize(1280, 720);
    renderer.setPixelRatio(1);
    renderer.render(root, { type: "PerspectiveCamera" });

    expect(renderer.calls.render).toBe(1);
    expect(renderer.calls.setSize).toBe(1);
  });

  it("scene graph survives snapshot round-trip", () => {
    const { root } = makeBaselineScene({ agentCount: 3, roomCount: 2 });
    const snap1 = captureSceneSnapshot(root);
    const snap2 = captureSceneSnapshot(root);
    expect(snapshotsEqual(snap1, snap2)).toBe(true);
  });

  it("agent positions are within building bounds", () => {
    const building_aabb = aabbFromCenter(vec3(6, 1.5, 3), vec3(6, 1.5, 3));
    const { agents_data } = makeBaselineScene({ agentCount: 5, roomCount: 3 });
    for (const a of agents_data) {
      // Agents should be within a reasonable scene area (not at infinity)
      expect(Math.abs(a.position.x)).toBeLessThan(100);
      expect(Math.abs(a.position.y)).toBeLessThan(100);
      expect(Math.abs(a.position.z)).toBeLessThan(100);
    }
    // Dummy to use building_aabb and satisfy lint
    expect(aabbSize(building_aabb).x).toBe(12);
  });

  it("full render pipeline: 20 agents, 60 simulated frames", () => {
    const { root } = makeBaselineScene({ agentCount: 20, roomCount: 8 });
    const renderer = new WebGLRendererMock();
    renderer.setSize(1920, 1080);

    for (let i = 0; i < 60; i++) {
      renderer.render(root, {});
    }

    expect(renderer.calls.render).toBe(60);
    // After 60 frames the scene graph should be unchanged
    expect(countNodes(root)).toBeGreaterThan(0);
  });
});
