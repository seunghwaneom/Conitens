/**
 * lod-drill-policy.test.ts — Unit tests for Sub-AC 3.4.
 *
 * "Implement level-of-detail (LOD) rendering logic that progressively
 * reveals more geometry, agent status indicators, and metadata as the
 * camera drills deeper into the hierarchy."
 *
 * All tested functions are pure (no React, no Three.js, no store) so
 * this suite runs fully in Node.js without a browser or WebGL context.
 *
 * Coverage matrix
 * ───────────────
 * 3.4-lod   Core LOD computation (computeDistanceLOD, computeEffectiveLOD)
 * 3.4-thr   Threshold constants — coherence and ordering
 * 3.4-rel   Drill relationship helpers (floor / room / agent)
 * 3.4-pro   Drill promotion rules (target → NEAR, ancestor → MID, etc.)
 * 3.4-agt   Agent status indicator progressive detail layers
 * 3.4-rom   Room metadata progressive detail layers
 * 3.4-flo   Floor metadata progressive detail layers
 * 3.4-bld   Building metadata progressive detail layers
 * 3.4-agg   computeFullDrillLODs aggregator
 * 3.4-inc   Inclusion invariant — NEAR includes all MID content (additive)
 *
 * Test ID scheme:
 *   3.4-lod-N : Core LOD computation
 *   3.4-thr-N : Threshold constant tests
 *   3.4-rel-N : Drill relationship helper tests
 *   3.4-pro-N : Drill promotion rule tests
 *   3.4-agt-N : Agent status detail tests
 *   3.4-rom-N : Room metadata detail tests
 *   3.4-flo-N : Floor metadata detail tests
 *   3.4-bld-N : Building metadata detail tests
 *   3.4-agg-N : Aggregator tests
 *   3.4-inc-N : Inclusion invariant tests
 */

import { describe, it, expect } from "vitest";
import {
  // Types
  type LODLevel,
  type DrillLevel,
  type DrillRelationship,
  // Constants
  LOD_RANK,
  DRILL_DEPTH,
  THRESHOLDS,
  DRILL_PROMOTION,
  AGENT_STATUS_DETAIL,
  ROOM_METADATA_DETAIL,
  FLOOR_METADATA_DETAIL,
  BUILDING_METADATA_DETAIL,
  // Core functions
  computeDistanceLOD,
  computeEffectiveLOD,
  // Relationship helpers
  getFloorDrillRelationship,
  getRoomDrillRelationship,
  getAgentDrillRelationship,
  // Convenience accessors
  getAgentStatusDetail,
  getRoomMetadataDetail,
  getFloorMetadataDetail,
  getBuildingMetadataDetail,
  // Aggregator
  computeFullDrillLODs,
} from "../lod-drill-policy.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-thr — Threshold constant coherence
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-thr — LOD distance threshold constants", () => {
  // 3.4-thr-1
  it("building thresholds: near < far", () => {
    expect(THRESHOLDS.building.near).toBeLessThan(THRESHOLDS.building.far);
  });

  // 3.4-thr-2
  it("floor thresholds: near < far", () => {
    expect(THRESHOLDS.floor.near).toBeLessThan(THRESHOLDS.floor.far);
  });

  // 3.4-thr-3
  it("agent thresholds: near < far", () => {
    expect(THRESHOLDS.agent.near).toBeLessThan(THRESHOLDS.agent.far);
  });

  // 3.4-thr-4
  it("building.near = 18 (matches SceneHierarchy.tsx LOD_BUILDING_NEAR)", () => {
    expect(THRESHOLDS.building.near).toBe(18);
  });

  // 3.4-thr-5
  it("building.far = 38 (matches SceneHierarchy.tsx LOD_BUILDING_FAR)", () => {
    expect(THRESHOLDS.building.far).toBe(38);
  });

  // 3.4-thr-6
  it("floor.near = 14 (matches SceneHierarchy.tsx LOD_FLOOR_NEAR)", () => {
    expect(THRESHOLDS.floor.near).toBe(14);
  });

  // 3.4-thr-7
  it("floor.far = 30 (matches SceneHierarchy.tsx LOD_FLOOR_FAR)", () => {
    expect(THRESHOLDS.floor.far).toBe(30);
  });

  // 3.4-thr-8
  it("agent.near = 6 (matches SceneHierarchy.tsx LOD_AGENT_NEAR)", () => {
    expect(THRESHOLDS.agent.near).toBe(6);
  });

  // 3.4-thr-9
  it("agent.far = 14 (matches SceneHierarchy.tsx LOD_AGENT_FAR)", () => {
    expect(THRESHOLDS.agent.far).toBe(14);
  });

  // 3.4-thr-10
  it("all near thresholds are positive", () => {
    expect(THRESHOLDS.building.near).toBeGreaterThan(0);
    expect(THRESHOLDS.floor.near).toBeGreaterThan(0);
    expect(THRESHOLDS.agent.near).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-lod — Core LOD computation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-lod — computeDistanceLOD", () => {
  const { near, far } = THRESHOLDS.floor;

  // 3.4-lod-1
  it("distance < near → 'near'", () => {
    expect(computeDistanceLOD(near - 1, near, far)).toBe("near");
  });

  // 3.4-lod-2
  it("distance = 0 → 'near'", () => {
    expect(computeDistanceLOD(0, near, far)).toBe("near");
  });

  // 3.4-lod-3
  it("distance = near (boundary) → 'mid'", () => {
    expect(computeDistanceLOD(near, near, far)).toBe("mid");
  });

  // 3.4-lod-4
  it("distance between near and far → 'mid'", () => {
    const mid = (near + far) / 2;
    expect(computeDistanceLOD(mid, near, far)).toBe("mid");
  });

  // 3.4-lod-5
  it("distance = far (boundary) → 'far'", () => {
    expect(computeDistanceLOD(far, near, far)).toBe("far");
  });

  // 3.4-lod-6
  it("distance > far → 'far'", () => {
    expect(computeDistanceLOD(far + 100, near, far)).toBe("far");
  });

  // 3.4-lod-7
  it("works with building thresholds", () => {
    const { near: bn, far: bf } = THRESHOLDS.building;
    expect(computeDistanceLOD(10, bn, bf)).toBe("near");    // 10 < 18
    expect(computeDistanceLOD(25, bn, bf)).toBe("mid");     // 18 ≤ 25 < 38
    expect(computeDistanceLOD(50, bn, bf)).toBe("far");     // 50 ≥ 38
  });

  // 3.4-lod-8
  it("works with agent thresholds", () => {
    const { near: an, far: af } = THRESHOLDS.agent;
    expect(computeDistanceLOD(3, an, af)).toBe("near");     // 3 < 6
    expect(computeDistanceLOD(10, an, af)).toBe("mid");     // 6 ≤ 10 < 14
    expect(computeDistanceLOD(20, an, af)).toBe("far");     // 20 ≥ 14
  });
});

describe("Sub-AC 3.4-lod — LOD_RANK ordering", () => {
  // 3.4-lod-9
  it("NEAR has the highest rank", () => {
    expect(LOD_RANK["near"]).toBeGreaterThan(LOD_RANK["mid"]);
    expect(LOD_RANK["near"]).toBeGreaterThan(LOD_RANK["far"]);
  });

  // 3.4-lod-10
  it("MID has a higher rank than FAR", () => {
    expect(LOD_RANK["mid"]).toBeGreaterThan(LOD_RANK["far"]);
  });

  // 3.4-lod-11
  it("FAR has rank 0 (lowest)", () => {
    expect(LOD_RANK["far"]).toBe(0);
  });
});

describe("Sub-AC 3.4-lod — DRILL_DEPTH ordering", () => {
  // 3.4-lod-12
  it("drill depth increases: building < floor < room < agent", () => {
    expect(DRILL_DEPTH["building"]).toBeLessThan(DRILL_DEPTH["floor"]);
    expect(DRILL_DEPTH["floor"]).toBeLessThan(DRILL_DEPTH["room"]);
    expect(DRILL_DEPTH["room"]).toBeLessThan(DRILL_DEPTH["agent"]);
  });

  // 3.4-lod-13
  it("building has depth 0", () => {
    expect(DRILL_DEPTH["building"]).toBe(0);
  });

  // 3.4-lod-14
  it("agent has depth 3 (deepest)", () => {
    expect(DRILL_DEPTH["agent"]).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-pro — Drill promotion rules
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-pro — computeEffectiveLOD promotion rules", () => {
  // 3.4-pro-1
  it("target promotion always yields 'near' regardless of distance LOD", () => {
    const relations: DrillRelationship = "target";
    expect(computeEffectiveLOD("far",  relations)).toBe("near");
    expect(computeEffectiveLOD("mid",  relations)).toBe("near");
    expect(computeEffectiveLOD("near", relations)).toBe("near");
  });

  // 3.4-pro-2
  it("ancestor promotion promotes FAR to MID", () => {
    expect(computeEffectiveLOD("far", "ancestor")).toBe("mid");
  });

  // 3.4-pro-3
  it("ancestor promotion does not demote NEAR to MID", () => {
    expect(computeEffectiveLOD("near", "ancestor")).toBe("near");
  });

  // 3.4-pro-4
  it("ancestor promotion keeps MID at MID", () => {
    expect(computeEffectiveLOD("mid", "ancestor")).toBe("mid");
  });

  // 3.4-pro-5
  it("sibling promotion does not change the LOD (no promotion)", () => {
    expect(computeEffectiveLOD("far",  "sibling")).toBe("far");
    expect(computeEffectiveLOD("mid",  "sibling")).toBe("mid");
    expect(computeEffectiveLOD("near", "sibling")).toBe("near");
  });

  // 3.4-pro-6
  it("'none' relationship does not change the LOD (no promotion)", () => {
    expect(computeEffectiveLOD("far",  "none")).toBe("far");
    expect(computeEffectiveLOD("mid",  "none")).toBe("mid");
    expect(computeEffectiveLOD("near", "none")).toBe("near");
  });

  // 3.4-pro-7
  it("DRILL_PROMOTION constant: target maps to 'near'", () => {
    expect(DRILL_PROMOTION["target"]).toBe("near");
  });

  // 3.4-pro-8
  it("DRILL_PROMOTION constant: ancestor maps to 'mid'", () => {
    expect(DRILL_PROMOTION["ancestor"]).toBe("mid");
  });

  // 3.4-pro-9
  it("DRILL_PROMOTION constant: sibling maps to 'far' (no promotion)", () => {
    expect(DRILL_PROMOTION["sibling"]).toBe("far");
  });

  // 3.4-pro-10
  it("DRILL_PROMOTION constant: none maps to 'far' (no promotion)", () => {
    expect(DRILL_PROMOTION["none"]).toBe("far");
  });

  // 3.4-pro-11
  it("promotion example: floor 20 units away (MID by distance) with target relation → NEAR", () => {
    // Scenario: camera at 20 units from floor centre (MID range).
    // User has drilled into this floor (target).
    // Effective LOD should be NEAR.
    const distanceLOD = computeDistanceLOD(20, THRESHOLDS.floor.near, THRESHOLDS.floor.far);
    expect(distanceLOD).toBe("mid");
    expect(computeEffectiveLOD(distanceLOD, "target")).toBe("near");
  });

  // 3.4-pro-12
  it("promotion example: floor 40 units away (FAR by distance) with ancestor relation → MID", () => {
    // Scenario: camera at 40 units from floor (FAR by distance).
    // User has drilled into a room on this floor (ancestor).
    // Effective LOD should be MID so the floor context is legible.
    const distanceLOD = computeDistanceLOD(40, THRESHOLDS.floor.near, THRESHOLDS.floor.far);
    expect(distanceLOD).toBe("far");
    expect(computeEffectiveLOD(distanceLOD, "ancestor")).toBe("mid");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-rel — Drill relationship helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-rel — getFloorDrillRelationship", () => {
  // 3.4-rel-1
  it("at 'building' level → 'none' for any floor", () => {
    expect(getFloorDrillRelationship(0, "building", null)).toBe("none");
    expect(getFloorDrillRelationship(1, "building", null)).toBe("none");
    expect(getFloorDrillRelationship(0, "building", 0)).toBe("none");
  });

  // 3.4-rel-2
  it("at 'floor' level with null drillFloor → 'none'", () => {
    expect(getFloorDrillRelationship(0, "floor", null)).toBe("none");
  });

  // 3.4-rel-3
  it("drilled floor == this floor at 'floor' level → 'target'", () => {
    expect(getFloorDrillRelationship(0, "floor", 0)).toBe("target");
    expect(getFloorDrillRelationship(1, "floor", 1)).toBe("target");
  });

  // 3.4-rel-4
  it("drilled floor != this floor at 'floor' level → 'sibling'", () => {
    expect(getFloorDrillRelationship(0, "floor", 1)).toBe("sibling");
    expect(getFloorDrillRelationship(1, "floor", 0)).toBe("sibling");
  });

  // 3.4-rel-5
  it("at 'room' level with this floor == drillFloor → 'ancestor'", () => {
    expect(getFloorDrillRelationship(1, "room", 1)).toBe("ancestor");
  });

  // 3.4-rel-6
  it("at 'room' level with this floor != drillFloor → 'sibling'", () => {
    expect(getFloorDrillRelationship(0, "room", 1)).toBe("sibling");
  });

  // 3.4-rel-7
  it("at 'agent' level with this floor == drillFloor → 'ancestor'", () => {
    expect(getFloorDrillRelationship(0, "agent", 0)).toBe("ancestor");
  });

  // 3.4-rel-8
  it("at 'agent' level with this floor != drillFloor → 'sibling'", () => {
    expect(getFloorDrillRelationship(1, "agent", 0)).toBe("sibling");
  });
});

describe("Sub-AC 3.4-rel — getRoomDrillRelationship", () => {
  // 3.4-rel-9
  it("at 'building' level → 'none'", () => {
    expect(getRoomDrillRelationship("ops-control", "building", null)).toBe("none");
  });

  // 3.4-rel-10
  it("at 'floor' level → 'none' (rooms not yet in drill context)", () => {
    expect(getRoomDrillRelationship("ops-control", "floor", null)).toBe("none");
    expect(getRoomDrillRelationship("ops-control", "floor", "ops-control")).toBe("none");
  });

  // 3.4-rel-11
  it("at 'room' level with drillRoom == roomId → 'target'", () => {
    expect(getRoomDrillRelationship("ops-control", "room", "ops-control")).toBe("target");
  });

  // 3.4-rel-12
  it("at 'room' level with drillRoom != roomId → 'sibling'", () => {
    expect(getRoomDrillRelationship("impl-office", "room", "ops-control")).toBe("sibling");
  });

  // 3.4-rel-13
  it("at 'room' level with null drillRoom → 'none'", () => {
    expect(getRoomDrillRelationship("ops-control", "room", null)).toBe("none");
  });

  // 3.4-rel-14
  it("at 'agent' level with drillRoom == roomId → 'ancestor'", () => {
    expect(getRoomDrillRelationship("ops-control", "agent", "ops-control")).toBe("ancestor");
  });

  // 3.4-rel-15
  it("at 'agent' level with drillRoom != roomId → 'sibling'", () => {
    expect(getRoomDrillRelationship("impl-office", "agent", "ops-control")).toBe("sibling");
  });
});

describe("Sub-AC 3.4-rel — getAgentDrillRelationship", () => {
  // 3.4-rel-16
  it("at 'building' level → 'none'", () => {
    expect(getAgentDrillRelationship("manager-default", "building", null)).toBe("none");
  });

  // 3.4-rel-17
  it("at 'floor' level → 'none'", () => {
    expect(getAgentDrillRelationship("manager-default", "floor", null)).toBe("none");
    expect(getAgentDrillRelationship("manager-default", "floor", "manager-default")).toBe("none");
  });

  // 3.4-rel-18
  it("at 'room' level → 'none' (agents not yet in drill context)", () => {
    expect(getAgentDrillRelationship("manager-default", "room", null)).toBe("none");
    expect(getAgentDrillRelationship("manager-default", "room", "manager-default")).toBe("none");
  });

  // 3.4-rel-19
  it("at 'agent' level with drillAgent == agentId → 'target'", () => {
    expect(getAgentDrillRelationship("manager-default", "agent", "manager-default")).toBe("target");
  });

  // 3.4-rel-20
  it("at 'agent' level with drillAgent != agentId → 'sibling'", () => {
    expect(getAgentDrillRelationship("impl-worker", "agent", "manager-default")).toBe("sibling");
  });

  // 3.4-rel-21
  it("at 'agent' level with null drillAgent → 'none'", () => {
    expect(getAgentDrillRelationship("manager-default", "agent", null)).toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-agt — Agent status detail progressive reveal
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-agt — AGENT_STATUS_DETAIL progressive reveal", () => {
  // 3.4-agt-1
  it("FAR: body not shown", () => {
    expect(AGENT_STATUS_DETAIL["far"].showBody).toBe(false);
  });

  // 3.4-agt-2
  it("FAR: no status dot shown", () => {
    expect(AGENT_STATUS_DETAIL["far"].showStatusDot).toBe(false);
  });

  // 3.4-agt-3
  it("FAR: no name badge, no ring, no task count, no lifecycle label", () => {
    const detail = AGENT_STATUS_DETAIL["far"];
    expect(detail.showNameBadge).toBe(false);
    expect(detail.showStatusRing).toBe(false);
    expect(detail.showTaskCount).toBe(false);
    expect(detail.showLifecycleLabel).toBe(false);
  });

  // 3.4-agt-4
  it("MID: body shown", () => {
    expect(AGENT_STATUS_DETAIL["mid"].showBody).toBe(true);
  });

  // 3.4-agt-5
  it("MID: status dot shown", () => {
    expect(AGENT_STATUS_DETAIL["mid"].showStatusDot).toBe(true);
  });

  // 3.4-agt-6
  it("MID: name badge NOT shown (revealed at NEAR only)", () => {
    expect(AGENT_STATUS_DETAIL["mid"].showNameBadge).toBe(false);
  });

  // 3.4-agt-7
  it("MID: task count NOT shown (revealed at NEAR only)", () => {
    expect(AGENT_STATUS_DETAIL["mid"].showTaskCount).toBe(false);
  });

  // 3.4-agt-8
  it("NEAR: all fields shown", () => {
    const detail = AGENT_STATUS_DETAIL["near"];
    expect(detail.showBody).toBe(true);
    expect(detail.showStatusDot).toBe(true);
    expect(detail.showNameBadge).toBe(true);
    expect(detail.showStatusRing).toBe(true);
    expect(detail.showTaskCount).toBe(true);
    expect(detail.showLifecycleLabel).toBe(true);
  });

  // 3.4-agt-9
  it("getAgentStatusDetail convenience accessor returns same object", () => {
    expect(getAgentStatusDetail("near")).toEqual(AGENT_STATUS_DETAIL["near"]);
    expect(getAgentStatusDetail("mid")).toEqual(AGENT_STATUS_DETAIL["mid"]);
    expect(getAgentStatusDetail("far")).toEqual(AGENT_STATUS_DETAIL["far"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-rom — Room metadata progressive reveal
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-rom — ROOM_METADATA_DETAIL progressive reveal", () => {
  // 3.4-rom-1
  it("FAR: no footprint, no type label, no accent ring", () => {
    const detail = ROOM_METADATA_DETAIL["far"];
    expect(detail.showFootprint).toBe(false);
    expect(detail.showTypeLabel).toBe(false);
    expect(detail.showAccentRing).toBe(false);
  });

  // 3.4-rom-2
  it("FAR: no metrics billboard, no full geometry, no member count", () => {
    const detail = ROOM_METADATA_DETAIL["far"];
    expect(detail.showMetricsBillboard).toBe(false);
    expect(detail.showFullGeometry).toBe(false);
    expect(detail.showMemberCount).toBe(false);
  });

  // 3.4-rom-3
  it("MID: footprint shown", () => {
    expect(ROOM_METADATA_DETAIL["mid"].showFootprint).toBe(true);
  });

  // 3.4-rom-4
  it("MID: type label shown", () => {
    expect(ROOM_METADATA_DETAIL["mid"].showTypeLabel).toBe(true);
  });

  // 3.4-rom-5
  it("MID: accent ring shown", () => {
    expect(ROOM_METADATA_DETAIL["mid"].showAccentRing).toBe(true);
  });

  // 3.4-rom-6
  it("MID: metrics billboard NOT shown (NEAR only)", () => {
    expect(ROOM_METADATA_DETAIL["mid"].showMetricsBillboard).toBe(false);
  });

  // 3.4-rom-7
  it("MID: full geometry NOT shown (NEAR only)", () => {
    expect(ROOM_METADATA_DETAIL["mid"].showFullGeometry).toBe(false);
  });

  // 3.4-rom-8
  it("NEAR: all fields shown", () => {
    const detail = ROOM_METADATA_DETAIL["near"];
    expect(detail.showFootprint).toBe(true);
    expect(detail.showTypeLabel).toBe(true);
    expect(detail.showAccentRing).toBe(true);
    expect(detail.showMetricsBillboard).toBe(true);
    expect(detail.showFullGeometry).toBe(true);
    expect(detail.showMemberCount).toBe(true);
  });

  // 3.4-rom-9
  it("getRoomMetadataDetail accessor returns correct objects", () => {
    expect(getRoomMetadataDetail("near")).toEqual(ROOM_METADATA_DETAIL["near"]);
    expect(getRoomMetadataDetail("mid")).toEqual(ROOM_METADATA_DETAIL["mid"]);
    expect(getRoomMetadataDetail("far")).toEqual(ROOM_METADATA_DETAIL["far"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-flo — Floor metadata progressive reveal
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-flo — FLOOR_METADATA_DETAIL progressive reveal", () => {
  // 3.4-flo-1
  it("FAR: slab shown, type dots shown", () => {
    expect(FLOOR_METADATA_DETAIL["far"].showSlab).toBe(true);
    expect(FLOOR_METADATA_DETAIL["far"].showTypeDots).toBe(true);
  });

  // 3.4-flo-2
  it("FAR: no room footprints, no labels, no walls, no agents, no metrics", () => {
    const detail = FLOOR_METADATA_DETAIL["far"];
    expect(detail.showRoomFootprints).toBe(false);
    expect(detail.showRoomLabels).toBe(false);
    expect(detail.showRoomWalls).toBe(false);
    expect(detail.showAgents).toBe(false);
    expect(detail.showMetrics).toBe(false);
  });

  // 3.4-flo-3
  it("MID: room footprints shown, type labels shown", () => {
    expect(FLOOR_METADATA_DETAIL["mid"].showRoomFootprints).toBe(true);
    expect(FLOOR_METADATA_DETAIL["mid"].showRoomLabels).toBe(true);
  });

  // 3.4-flo-4
  it("MID: type dots hidden (replaced by footprints)", () => {
    expect(FLOOR_METADATA_DETAIL["mid"].showTypeDots).toBe(false);
  });

  // 3.4-flo-5
  it("MID: room walls NOT shown (NEAR only)", () => {
    expect(FLOOR_METADATA_DETAIL["mid"].showRoomWalls).toBe(false);
  });

  // 3.4-flo-6
  it("MID: agents NOT shown at floor MID LOD", () => {
    expect(FLOOR_METADATA_DETAIL["mid"].showAgents).toBe(false);
  });

  // 3.4-flo-7
  it("NEAR: all fields that add detail are shown", () => {
    const detail = FLOOR_METADATA_DETAIL["near"];
    expect(detail.showSlab).toBe(true);
    expect(detail.showRoomLabels).toBe(true);
    expect(detail.showRoomWalls).toBe(true);
    expect(detail.showAgents).toBe(true);
    expect(detail.showMetrics).toBe(true);
  });

  // 3.4-flo-8
  it("getFloorMetadataDetail accessor returns correct objects", () => {
    expect(getFloorMetadataDetail("near")).toEqual(FLOOR_METADATA_DETAIL["near"]);
    expect(getFloorMetadataDetail("far")).toEqual(FLOOR_METADATA_DETAIL["far"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-bld — Building metadata progressive reveal
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-bld — BUILDING_METADATA_DETAIL progressive reveal", () => {
  // 3.4-bld-1
  it("FAR: silhouette shown", () => {
    expect(BUILDING_METADATA_DETAIL["far"].showSilhouette).toBe(true);
  });

  // 3.4-bld-2
  it("FAR: no full shell, no edge wireframe, no name badge, no floor dividers", () => {
    const detail = BUILDING_METADATA_DETAIL["far"];
    expect(detail.showFullShell).toBe(false);
    expect(detail.showEdgeWireframe).toBe(false);
    expect(detail.showNameBadge).toBe(false);
    expect(detail.showFloorDividers).toBe(false);
  });

  // 3.4-bld-3
  it("MID: edge wireframe shown, name badge shown, floor dividers shown", () => {
    const detail = BUILDING_METADATA_DETAIL["mid"];
    expect(detail.showEdgeWireframe).toBe(true);
    expect(detail.showNameBadge).toBe(true);
    expect(detail.showFloorDividers).toBe(true);
  });

  // 3.4-bld-4
  it("MID: no full shell (NEAR only)", () => {
    expect(BUILDING_METADATA_DETAIL["mid"].showFullShell).toBe(false);
  });

  // 3.4-bld-5
  it("MID: silhouette NOT shown (replaced by wireframe)", () => {
    expect(BUILDING_METADATA_DETAIL["mid"].showSilhouette).toBe(false);
  });

  // 3.4-bld-6
  it("NEAR: full shell shown", () => {
    expect(BUILDING_METADATA_DETAIL["near"].showFullShell).toBe(true);
  });

  // 3.4-bld-7
  it("NEAR: no edge wireframe (replaced by full geometry)", () => {
    expect(BUILDING_METADATA_DETAIL["near"].showEdgeWireframe).toBe(false);
  });

  // 3.4-bld-8
  it("getBuildingMetadataDetail accessor returns correct objects", () => {
    expect(getBuildingMetadataDetail("near")).toEqual(BUILDING_METADATA_DETAIL["near"]);
    expect(getBuildingMetadataDetail("mid")).toEqual(BUILDING_METADATA_DETAIL["mid"]);
    expect(getBuildingMetadataDetail("far")).toEqual(BUILDING_METADATA_DETAIL["far"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-inc — Inclusion invariant: NEAR ⊇ MID ⊇ FAR
// (NEAR reveals everything MID reveals + more; MID reveals everything FAR does + more)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-inc — Inclusion invariant: NEAR ⊇ MID ⊇ FAR", () => {
  /**
   * Helper: check that wherever FAR flag = true, MID flag is also true.
   * Uses a string-indexed cast to work with all the typed detail objects.
   */
  function checkMidIncludesFar(
    far: { [key: string]: boolean },
    mid: { [key: string]: boolean },
    _label: string,
  ) {
    for (const key of Object.keys(far)) {
      if (far[key] === true) {
        expect(mid[key]).toBe(true);
      }
    }
  }

  /**
   * Helper: check that wherever MID flag = true, NEAR flag is also true.
   */
  function checkNearIncludesMid(
    mid: { [key: string]: boolean },
    near: { [key: string]: boolean },
    _label: string,
  ) {
    for (const key of Object.keys(mid)) {
      if (mid[key] === true) {
        expect(near[key]).toBe(true);
      }
    }
  }

  // 3.4-inc-1
  it("agent status: MID includes all FAR detail flags", () => {
    checkMidIncludesFar(
      AGENT_STATUS_DETAIL["far"] as unknown as { [key: string]: boolean },
      AGENT_STATUS_DETAIL["mid"] as unknown as { [key: string]: boolean },
      "AGENT",
    );
  });

  // 3.4-inc-2
  it("agent status: NEAR includes all MID detail flags", () => {
    checkNearIncludesMid(
      AGENT_STATUS_DETAIL["mid"] as unknown as { [key: string]: boolean },
      AGENT_STATUS_DETAIL["near"] as unknown as { [key: string]: boolean },
      "AGENT",
    );
  });

  // 3.4-inc-3
  it("room metadata: MID includes all FAR detail flags", () => {
    checkMidIncludesFar(
      ROOM_METADATA_DETAIL["far"] as unknown as { [key: string]: boolean },
      ROOM_METADATA_DETAIL["mid"] as unknown as { [key: string]: boolean },
      "ROOM",
    );
  });

  // 3.4-inc-4
  it("room metadata: NEAR includes all MID detail flags", () => {
    checkNearIncludesMid(
      ROOM_METADATA_DETAIL["mid"] as unknown as { [key: string]: boolean },
      ROOM_METADATA_DETAIL["near"] as unknown as { [key: string]: boolean },
      "ROOM",
    );
  });

  // 3.4-inc-5
  it("floor metadata: MID includes all FAR slab visibility", () => {
    // Slab is shown at all levels
    expect(FLOOR_METADATA_DETAIL["far"].showSlab).toBe(true);
    expect(FLOOR_METADATA_DETAIL["mid"].showSlab).toBe(true);
    expect(FLOOR_METADATA_DETAIL["near"].showSlab).toBe(true);
  });

  // 3.4-inc-6
  it("building metadata: NEAR includes all MID structural detail flags", () => {
    // Floor dividers are shown at MID and NEAR
    expect(BUILDING_METADATA_DETAIL["mid"].showFloorDividers).toBe(true);
    expect(BUILDING_METADATA_DETAIL["near"].showFloorDividers).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4-agg — computeFullDrillLODs aggregator
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3.4-agg — computeFullDrillLODs at each drill level", () => {
  // ── building level ─────────────────────────────────────────────────────────

  // 3.4-agg-1
  it("building level, close camera: building=near, others=null", () => {
    const result = computeFullDrillLODs("building", null, null, null, 10, null, null);
    expect(result.building).toBe("near"); // distance < 18 → near
    expect(result.floor).toBeNull();
    expect(result.room).toBeNull();
    expect(result.agent).toBeNull();
  });

  // 3.4-agg-2
  it("building level, far camera: building=far", () => {
    const result = computeFullDrillLODs("building", null, null, null, 50, null, null);
    expect(result.building).toBe("far");
  });

  // ── floor level ────────────────────────────────────────────────────────────

  // 3.4-agg-3
  it("floor level, drilled floor: floor is promoted to NEAR even if camera 20 units away", () => {
    // Camera 20 units from floor (MID by distance alone = 14-30 range)
    // Drill target = floor 0, relation = "target" → must be NEAR
    const result = computeFullDrillLODs("floor", 0, null, null, 10, 20, null);
    expect(result.floor).toBe("near");
    expect(result.room).toBeNull();
    expect(result.agent).toBeNull();
  });

  // 3.4-agg-4
  it("floor level, building is an ancestor → building = at least MID", () => {
    const result = computeFullDrillLODs("floor", 0, null, null, 50, 20, null);
    // Camera at 50 from building (FAR by distance) but building is ancestor → MID min
    expect(result.building).toBe("mid");
  });

  // ── room level ─────────────────────────────────────────────────────────────

  // 3.4-agg-5
  it("room level, drilled room: room promoted to NEAR", () => {
    // Room distance assumed from floor cam dist = 20 (MID range)
    const result = computeFullDrillLODs("room", 1, "ops-control", null, 10, 20, null);
    expect(result.room).toBe("near");
  });

  // 3.4-agg-6
  it("room level, floor is ancestor → floor = at least MID", () => {
    // Floor cam dist = 35 (FAR by distance alone) but floor is ancestor → MID min
    const result = computeFullDrillLODs("room", 1, "ops-control", null, 10, 35, null);
    expect(result.floor).toBe("mid");
  });

  // 3.4-agg-7
  it("room level, building is ancestor → building = at least MID", () => {
    const result = computeFullDrillLODs("room", 1, "ops-control", null, 50, 20, null);
    expect(result.building).toBe("mid");
  });

  // ── agent level ────────────────────────────────────────────────────────────

  // 3.4-agg-8
  it("agent level, drilled agent: agent promoted to NEAR (even 10 units away)", () => {
    // Agent cam dist = 10 (MID range: 6-14) but agent is target → NEAR
    const result = computeFullDrillLODs("agent", 1, "ops-control", "manager-default", 10, 15, 10);
    expect(result.agent).toBe("near");
  });

  // 3.4-agg-9
  it("agent level: all ancestors (building, floor, room) get at least ancestor/target promotion", () => {
    const result = computeFullDrillLODs("agent", 1, "ops-control", "manager-default", 50, 40, 3);
    // Building and floor are ancestors → promoted to at least MID
    expect(LOD_RANK[result.building]).toBeGreaterThanOrEqual(LOD_RANK["mid"]);
    expect(result.floor).not.toBeNull();
    if (result.floor) expect(LOD_RANK[result.floor]).toBeGreaterThanOrEqual(LOD_RANK["mid"]);
    // Room is an ancestor of the drilled agent → promoted to at least MID
    // (room becomes "target" with NEAR only when drillLevel === "room"; here it's "agent")
    expect(result.room).not.toBeNull();
    if (result.room) expect(LOD_RANK[result.room]).toBeGreaterThanOrEqual(LOD_RANK["mid"]);
    // The drilled agent itself is always NEAR
    expect(result.agent).toBe("near");
  });

  // 3.4-agg-10
  it("result shape: all 4 keys present in the output object", () => {
    const result = computeFullDrillLODs("building", null, null, null, 10, null, null);
    expect("building" in result).toBe(true);
    expect("floor" in result).toBe(true);
    expect("room" in result).toBe(true);
    expect("agent" in result).toBe(true);
  });

  // 3.4-agg-11
  it("building level: floor, room, agent are all null", () => {
    const result = computeFullDrillLODs("building", null, null, null, 10, null, null);
    expect(result.floor).toBeNull();
    expect(result.room).toBeNull();
    expect(result.agent).toBeNull();
  });

  // 3.4-agg-12
  it("drill depth ordering: deeper drill → more NEAR promotions", () => {
    // Count how many NEAR values appear at each drill depth
    const building = computeFullDrillLODs("building", null, null, null, 10, null, null);
    const floor    = computeFullDrillLODs("floor", 0, null, null, 10, 20, null);
    const room     = computeFullDrillLODs("room", 0, "ops-control", null, 10, 20, null);
    const agent    = computeFullDrillLODs("agent", 0, "ops-control", "mgr", 10, 20, 5);

    const countNear = (r: ReturnType<typeof computeFullDrillLODs>) =>
      [r.building, r.floor, r.room, r.agent].filter((v) => v === "near").length;

    expect(countNear(building)).toBeLessThanOrEqual(countNear(floor));
    expect(countNear(floor)).toBeLessThanOrEqual(countNear(room));
    expect(countNear(room)).toBeLessThanOrEqual(countNear(agent));
  });
});
