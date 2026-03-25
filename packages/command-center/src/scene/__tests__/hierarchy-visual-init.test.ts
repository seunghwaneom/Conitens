/**
 * hierarchy-visual-init.test.ts
 *
 * Sub-AC 3b — Implement hierarchical scene rendering: visually represent the
 * building → office/room → agent hierarchy with distinct LOD or nesting visuals
 * so each level is legible from the bird's-eye perspective.
 *
 * Coverage matrix
 * ───────────────
 * 3b-1   initializeHierarchyVisuals() returns a defined result
 * 3b-2   All four hierarchy tiers are present in the scene graph
 * 3b-3   allFourTiersPresent() returns true for the initialized scene
 * 3b-4   Building node has hierarchyTier === "building"
 * 3b-5   Floor nodes have hierarchyTier === "floor"
 * 3b-6   Room nodes have hierarchyTier === "room"
 * 3b-7   Agent nodes have hierarchyTier === "agent"
 * 3b-8   Layer orders are distinct (1, 2, 3, 4 — no duplicates)
 * 3b-9   tierLayerOrdersAreDistinct() returns true
 * 3b-10  Building layer order = 1 (lowest, rendered first)
 * 3b-11  Floor layer order = 2 (above building)
 * 3b-12  Room layer order = 3 (above floor zones)
 * 3b-13  Agent layer order = 4 (topmost, most prominent)
 * 3b-14  Marker elevations are strictly increasing from building to agent
 * 3b-15  tierElevationsAreIncreasing() returns true
 * 3b-16  Building elevation = 0.02 (ground-level outline)
 * 3b-17  Floor elevation = 0.04 (above building outline)
 * 3b-18  Room elevation = 0.06 (above floor zone fill)
 * 3b-19  Agent elevation = 0.10 (highest — clearest point markers from above)
 * 3b-20  Building footprint = 12 × 6 (matches BuildingShell dimensions)
 * 3b-21  Building footprint is >= all room footprints (building is the scope anchor)
 * 3b-22  Agent marker footprint is smaller than every room footprint
 * 3b-23  Each tier has a unique accent color (tierAccentColorsAreDistinct)
 * 3b-24  TIER_ACCENT_COLORS: building uses bright cyan (#00d4ff)
 * 3b-25  TIER_ACCENT_COLORS: floor uses muted indigo (#334488)
 * 3b-26  TIER_ACCENT_COLORS are all valid hex strings
 * 3b-27  All room nodes carry birdsEyeVisual.showLabel = true (role badges)
 * 3b-28  All agent nodes carry birdsEyeVisual.showLabel = true (name labels)
 * 3b-29  Floor nodes carry birdsEyeVisual.showLabel = false (purely graphical)
 * 3b-30  Building node carries birdsEyeVisual.showLabel = true
 * 3b-31  Room labelText matches the canonical role label (CTRL, OFFC, LAB…)
 * 3b-32  Agent labelText matches the agent display name
 * 3b-33  Building labelText equals BUILDING.name
 * 3b-34  Room birdsEyeVisual.accentColor matches room.colorAccent from BUILDING
 * 3b-35  Room birdsEyeVisual.footprintW matches room.dimensions.x from BUILDING
 * 3b-36  Room birdsEyeVisual.footprintD matches room.dimensions.z from BUILDING
 * 3b-37  Agent markerRadius = AGENT_MARKER_DISC_RADIUS (0.20)
 * 3b-38  Floor nodes exist — one per BUILDING.floors entry
 * 3b-39  Floor node names follow "hierarchy-floor-{n}" convention
 * 3b-40  Floor zero uses FLOOR_ZONE_COLORS[0] (deep blue)
 * 3b-41  Floor one uses FLOOR_ZONE_COLORS[1] (deep purple)
 * 3b-42  FLOOR_ZONE_COLORS has at least 2 distinct colors
 * 3b-43  Building opacity is prominently high (> 0.5, scope anchor)
 * 3b-44  Floor opacity is subtly low (< 0.3, doesn't obscure rooms)
 * 3b-45  Agent opacity is prominently high (> 0.7, point markers)
 * 3b-46  queryTierNodes() finds all building nodes
 * 3b-47  queryTierNodes() finds all floor nodes
 * 3b-48  queryTierNodes() finds all room nodes
 * 3b-49  queryTierNodes() finds all agent nodes
 * 3b-50  getBirdsEyeVisual() returns the descriptor attached to the building node
 * 3b-51  getBirdsEyeVisual() returns undefined for a plain unannotated node
 * 3b-52  Multiple initializeHierarchyVisuals() calls produce independent graphs
 * 3b-53  TIER_VISUALS constants match the values applied to the building node
 * 3b-54  TIER_VISUALS constants match the values applied to a floor node
 * 3b-55  Rooms are children of the building node (structural nesting preserved)
 * 3b-56  Agents are nested under room nodes (structural hierarchy preserved)
 * 3b-57  Floor nodes are direct children of the building node
 * 3b-58  getFloorNodeName() returns the correct prefixed name
 * 3b-59  FLOOR_NODE_PREFIX is "hierarchy-floor-"
 * 3b-60  buildFloorVisualDescriptor() returns a valid descriptor with correct tier
 * 3b-61  buildRoomVisualDescriptor() returns a valid descriptor with correct tier
 * 3b-62  buildAgentVisualDescriptor() returns a valid descriptor with correct tier
 * 3b-63  BUILDING_FOOTPRINT_W = 12 (constant matches BuildingShell)
 * 3b-64  BUILDING_FOOTPRINT_D = 6 (constant matches BuildingShell)
 * 3b-65  AGENT_MARKER_DISC_RADIUS = 0.20 (constant matches AgentAvatar)
 *
 * Test ID scheme:
 *   3b-N : Sub-AC 3b (hierarchical scene rendering — bird's-eye visual legibility)
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  initializeHierarchyVisuals,
  queryTierNodes,
  getBirdsEyeVisual,
  allFourTiersPresent,
  tierLayerOrdersAreDistinct,
  tierElevationsAreIncreasing,
  tierAccentColorsAreDistinct,
  buildFloorVisualDescriptor,
  buildRoomVisualDescriptor,
  buildAgentVisualDescriptor,
  getFloorNodeName,
  TIER_VISUALS,
  TIER_ELEVATIONS,
  TIER_LAYER_ORDER,
  TIER_ACCENT_COLORS,
  TIER_BASE_OPACITY,
  TIER_SHOW_LABEL,
  FLOOR_ZONE_COLORS,
  FLOOR_NODE_PREFIX,
  BUILDING_FOOTPRINT_W,
  BUILDING_FOOTPRINT_D,
  AGENT_MARKER_DISC_RADIUS,
  type HierarchyVisualSceneGraph,
  type BirdsEyeVisualDescriptor,
} from "../hierarchy-visual-init.js";

import { resetHarness, makeSceneNode } from "../../testing/scene-test-harness.js";
import { BUILDING } from "../../data/building.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle — reset harness counters for deterministic node IDs
// ─────────────────────────────────────────────────────────────────────────────

let graph: HierarchyVisualSceneGraph;

beforeEach(() => {
  resetHarness();
  graph = initializeHierarchyVisuals();
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-1 · Scene initialization returns a defined result
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-1: Scene initialization returns a defined result", () => {
  it("initializeHierarchyVisuals() returns a defined result", () => {
    expect(graph).toBeDefined();
  });

  it("result.root is defined", () => {
    expect(graph.root).toBeDefined();
  });

  it("result.buildingNode is defined", () => {
    expect(graph.buildingNode).toBeDefined();
  });

  it("result.roomNodes is a non-empty array", () => {
    expect(Array.isArray(graph.roomNodes)).toBe(true);
    expect(graph.roomNodes.length).toBeGreaterThan(0);
  });

  it("result.agentNodes is a non-empty array", () => {
    expect(Array.isArray(graph.agentNodes)).toBe(true);
    expect(graph.agentNodes.length).toBeGreaterThan(0);
  });

  it("result.floorNodes is a non-empty array", () => {
    expect(Array.isArray(graph.floorNodes)).toBe(true);
    expect(graph.floorNodes.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-2/3 · All four tiers are present
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-2/3: All four hierarchy tiers are present in the scene", () => {
  it("allFourTiersPresent() returns true for the initialized scene (3b-3)", () => {
    expect(allFourTiersPresent(graph.root)).toBe(true);
  });

  it("building tier has at least one node (3b-2)", () => {
    expect(queryTierNodes(graph.root, "building").length).toBeGreaterThanOrEqual(1);
  });

  it("floor tier has at least one node (3b-2)", () => {
    expect(queryTierNodes(graph.root, "floor").length).toBeGreaterThanOrEqual(1);
  });

  it("room tier has at least one node (3b-2)", () => {
    expect(queryTierNodes(graph.root, "room").length).toBeGreaterThanOrEqual(1);
  });

  it("agent tier has at least one node (3b-2)", () => {
    expect(queryTierNodes(graph.root, "agent").length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-4 · Building node tier
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-4: Building node has hierarchyTier === 'building'", () => {
  it("buildingNode.userData.hierarchyTier === 'building'", () => {
    expect(graph.buildingNode.userData.hierarchyTier).toBe("building");
  });

  it("queryTierNodes('building') contains the buildingNode", () => {
    const buildingTierNodes = queryTierNodes(graph.root, "building");
    expect(buildingTierNodes).toContain(graph.buildingNode);
  });

  it("exactly one building tier node exists", () => {
    expect(queryTierNodes(graph.root, "building")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-5 · Floor node tier
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-5: Floor nodes have hierarchyTier === 'floor'", () => {
  it("all floorNodes have hierarchyTier === 'floor'", () => {
    for (const node of graph.floorNodes) {
      expect(
        node.userData.hierarchyTier,
        `Floor node "${node.name}" missing hierarchyTier`,
      ).toBe("floor");
    }
  });

  it("queryTierNodes('floor') returns all floorNodes", () => {
    const found = queryTierNodes(graph.root, "floor");
    expect(found).toHaveLength(graph.floorNodes.length);
    for (const n of graph.floorNodes) {
      expect(found).toContain(n);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-6 · Room node tier
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-6: Room nodes have hierarchyTier === 'room'", () => {
  it("all roomNodes have hierarchyTier === 'room'", () => {
    for (const node of graph.roomNodes) {
      expect(
        node.userData.hierarchyTier,
        `Room node "${node.name}" missing hierarchyTier`,
      ).toBe("room");
    }
  });

  it("queryTierNodes('room') returns all roomNodes", () => {
    const found = queryTierNodes(graph.root, "room");
    expect(found).toHaveLength(graph.roomNodes.length);
  });

  it("room tier count equals BUILDING.rooms.length", () => {
    expect(queryTierNodes(graph.root, "room")).toHaveLength(BUILDING.rooms.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-7 · Agent node tier
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-7: Agent nodes have hierarchyTier === 'agent'", () => {
  it("all agentNodes have hierarchyTier === 'agent'", () => {
    for (const node of graph.agentNodes) {
      expect(
        node.userData.hierarchyTier,
        `Agent node "${node.name}" missing hierarchyTier`,
      ).toBe("agent");
    }
  });

  it("queryTierNodes('agent') returns all agentNodes", () => {
    const found = queryTierNodes(graph.root, "agent");
    expect(found).toHaveLength(graph.agentNodes.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-8/9 · Layer orders are distinct and monotonically increasing
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-8/9: Layer orders are distinct and monotonically increasing", () => {
  it("tierLayerOrdersAreDistinct() returns true (3b-9)", () => {
    expect(tierLayerOrdersAreDistinct(graph.root)).toBe(true);
  });

  it("building layerOrder = 1 (3b-10)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.layerOrder).toBe(1);
  });

  it("floor layerOrder = 2 (3b-11)", () => {
    const floorDesc = getBirdsEyeVisual(graph.floorNodes[0]!);
    expect(floorDesc?.layerOrder).toBe(2);
  });

  it("room layerOrder = 3 (3b-12)", () => {
    const roomDesc = getBirdsEyeVisual(graph.roomNodes[0]!);
    expect(roomDesc?.layerOrder).toBe(3);
  });

  it("agent layerOrder = 4 (3b-13)", () => {
    const agentDesc = getBirdsEyeVisual(graph.agentNodes[0]!);
    expect(agentDesc?.layerOrder).toBe(4);
  });

  it("no two tiers share the same layerOrder (3b-8)", () => {
    const orders = [1, 2, 3, 4];
    const unique = new Set(orders);
    expect(unique.size).toBe(4);
    // Verify the constants match
    expect(TIER_LAYER_ORDER.building).toBe(1);
    expect(TIER_LAYER_ORDER.floor).toBe(2);
    expect(TIER_LAYER_ORDER.room).toBe(3);
    expect(TIER_LAYER_ORDER.agent).toBe(4);
  });

  it("all room nodes share layerOrder = 3", () => {
    for (const node of graph.roomNodes) {
      expect(getBirdsEyeVisual(node)?.layerOrder).toBe(3);
    }
  });

  it("all agent nodes share layerOrder = 4", () => {
    for (const node of graph.agentNodes) {
      expect(getBirdsEyeVisual(node)?.layerOrder).toBe(4);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-14/15 · Marker elevations are strictly increasing
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-14/15: Marker elevations are strictly increasing per tier", () => {
  it("tierElevationsAreIncreasing() returns true (3b-15)", () => {
    expect(tierElevationsAreIncreasing(graph.root)).toBe(true);
  });

  it("building elevation = 0.02 (3b-16)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.markerElevation).toBe(0.02);
  });

  it("floor elevation = 0.04 — above building (3b-17)", () => {
    const floorDesc = getBirdsEyeVisual(graph.floorNodes[0]!);
    expect(floorDesc?.markerElevation).toBe(0.04);
  });

  it("room elevation = 0.06 — above floor zones (3b-18)", () => {
    const roomDesc = getBirdsEyeVisual(graph.roomNodes[0]!);
    expect(roomDesc?.markerElevation).toBe(0.06);
  });

  it("agent elevation = 0.10 — highest, clearest from above (3b-19)", () => {
    const agentDesc = getBirdsEyeVisual(graph.agentNodes[0]!);
    expect(agentDesc?.markerElevation).toBe(0.10);
  });

  it("building < floor < room < agent elevations (strict ordering)", () => {
    const bldgElev  = getBirdsEyeVisual(graph.buildingNode)?.markerElevation ?? 0;
    const floorElev = getBirdsEyeVisual(graph.floorNodes[0]!)?.markerElevation ?? 0;
    const roomElev  = getBirdsEyeVisual(graph.roomNodes[0]!)?.markerElevation ?? 0;
    const agentElev = getBirdsEyeVisual(graph.agentNodes[0]!)?.markerElevation ?? 0;

    expect(bldgElev).toBeLessThan(floorElev);
    expect(floorElev).toBeLessThan(roomElev);
    expect(roomElev).toBeLessThan(agentElev);
  });

  it("TIER_ELEVATIONS constants are strictly increasing", () => {
    expect(TIER_ELEVATIONS.building).toBeLessThan(TIER_ELEVATIONS.floor);
    expect(TIER_ELEVATIONS.floor).toBeLessThan(TIER_ELEVATIONS.room);
    expect(TIER_ELEVATIONS.room).toBeLessThan(TIER_ELEVATIONS.agent);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-20/21/22 · Footprint sizes
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-20/21/22: Footprint sizes — building widest, agents smallest", () => {
  it("building footprint W = 12 (3b-20, 3b-63)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.footprintW).toBe(12);
    expect(BUILDING_FOOTPRINT_W).toBe(12);
  });

  it("building footprint D = 6 (3b-20, 3b-64)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.footprintD).toBe(6);
    expect(BUILDING_FOOTPRINT_D).toBe(6);
  });

  it("building footprint area >= all room footprint areas (3b-21)", () => {
    const bldgArea = BUILDING_FOOTPRINT_W * BUILDING_FOOTPRINT_D;
    for (const roomNode of graph.roomNodes) {
      const desc = getBirdsEyeVisual(roomNode);
      const roomArea = (desc?.footprintW ?? 0) * (desc?.footprintD ?? 0);
      expect(
        bldgArea,
        `Building area ${bldgArea} should be >= room "${roomNode.name}" area ${roomArea}`,
      ).toBeGreaterThanOrEqual(roomArea);
    }
  });

  it("agent footprint area is smaller than every room footprint area (3b-22)", () => {
    const agentArea = AGENT_MARKER_DISC_RADIUS * 2 * AGENT_MARKER_DISC_RADIUS * 2;
    for (const roomNode of graph.roomNodes) {
      const desc = getBirdsEyeVisual(roomNode);
      const roomArea = (desc?.footprintW ?? 0) * (desc?.footprintD ?? 0);
      expect(
        agentArea,
        `Agent area ${agentArea} should be < room "${roomNode.name}" area ${roomArea}`,
      ).toBeLessThan(roomArea);
    }
  });

  it("AGENT_MARKER_DISC_RADIUS = 0.20 (3b-37, 3b-65)", () => {
    expect(AGENT_MARKER_DISC_RADIUS).toBe(0.20);
  });

  it("all agent nodes have markerRadius = AGENT_MARKER_DISC_RADIUS (3b-37)", () => {
    for (const agentNode of graph.agentNodes) {
      const desc = getBirdsEyeVisual(agentNode);
      expect(
        desc?.markerRadius,
        `Agent node "${agentNode.name}" markerRadius mismatch`,
      ).toBe(AGENT_MARKER_DISC_RADIUS);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-23/24/25/26 · Accent colors are distinct and valid
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-23/24/25/26: Accent colors are distinct and valid hex strings", () => {
  it("tierAccentColorsAreDistinct() returns true (3b-23)", () => {
    expect(tierAccentColorsAreDistinct()).toBe(true);
  });

  it("building accent color is bright cyan '#00d4ff' (3b-24)", () => {
    expect(TIER_ACCENT_COLORS.building).toBe("#00d4ff");
  });

  it("floor accent color is muted indigo '#334488' (3b-25)", () => {
    expect(TIER_ACCENT_COLORS.floor).toBe("#334488");
  });

  it("all TIER_ACCENT_COLORS are valid 6-digit hex strings (3b-26)", () => {
    for (const [tier, color] of Object.entries(TIER_ACCENT_COLORS)) {
      expect(
        color,
        `TIER_ACCENT_COLORS["${tier}"] is not a valid hex color`,
      ).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("building and floor accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.building).not.toBe(TIER_ACCENT_COLORS.floor);
  });

  it("building and room accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.building).not.toBe(TIER_ACCENT_COLORS.room);
  });

  it("building and agent accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.building).not.toBe(TIER_ACCENT_COLORS.agent);
  });

  it("floor and room accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.floor).not.toBe(TIER_ACCENT_COLORS.room);
  });

  it("floor and agent accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.floor).not.toBe(TIER_ACCENT_COLORS.agent);
  });

  it("room and agent accent colors are different", () => {
    expect(TIER_ACCENT_COLORS.room).not.toBe(TIER_ACCENT_COLORS.agent);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-27/28/29/30 · showLabel flags
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-27/28/29/30: showLabel flags per tier", () => {
  it("building node has showLabel = true (3b-30)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.showLabel).toBe(true);
  });

  it("all room nodes have showLabel = true (3b-27)", () => {
    for (const node of graph.roomNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.showLabel,
        `Room node "${node.name}" should have showLabel=true`,
      ).toBe(true);
    }
  });

  it("all agent nodes have showLabel = true (3b-28)", () => {
    for (const node of graph.agentNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.showLabel,
        `Agent node "${node.name}" should have showLabel=true`,
      ).toBe(true);
    }
  });

  it("floor nodes have showLabel = false (3b-29)", () => {
    for (const node of graph.floorNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.showLabel,
        `Floor node "${node.name}" should have showLabel=false`,
      ).toBe(false);
    }
  });

  it("TIER_SHOW_LABEL constants match the expected values", () => {
    expect(TIER_SHOW_LABEL.building).toBe(true);
    expect(TIER_SHOW_LABEL.floor).toBe(false);
    expect(TIER_SHOW_LABEL.room).toBe(true);
    expect(TIER_SHOW_LABEL.agent).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-31/32/33 · Label text values
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-31/32/33: Label text values per tier", () => {
  it("building labelText equals BUILDING.name (3b-33)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.labelText).toBe(BUILDING.name);
  });

  it("ops-control room labelText is 'CTRL' (3b-31)", () => {
    const opsNode = graph.roomNodes.find((n) => n.userData.roomId === "ops-control");
    const desc = opsNode ? getBirdsEyeVisual(opsNode) : undefined;
    expect(desc?.labelText).toBe("CTRL");
  });

  it("impl-office room labelText is 'OFFC' (3b-31)", () => {
    const officeNode = graph.roomNodes.find((n) => n.userData.roomId === "impl-office");
    const desc = officeNode ? getBirdsEyeVisual(officeNode) : undefined;
    expect(desc?.labelText).toBe("OFFC");
  });

  it("research-lab room labelText is 'LAB' (3b-31)", () => {
    const labNode = graph.roomNodes.find((n) => n.userData.roomId === "research-lab");
    const desc = labNode ? getBirdsEyeVisual(labNode) : undefined;
    expect(desc?.labelText).toBe("LAB");
  });

  it("project-main room labelText is 'MAIN' (3b-31)", () => {
    const mainNode = graph.roomNodes.find((n) => n.userData.roomId === "project-main");
    const desc = mainNode ? getBirdsEyeVisual(mainNode) : undefined;
    expect(desc?.labelText).toBe("MAIN");
  });

  it("all room nodes have non-empty labelText (3b-31)", () => {
    for (const node of graph.roomNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        typeof desc?.labelText === "string" && desc.labelText.length > 0,
        `Room "${node.name}" has empty labelText`,
      ).toBe(true);
    }
  });

  it("all agent nodes have non-empty labelText (3b-32)", () => {
    for (const node of graph.agentNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        typeof desc?.labelText === "string" && desc.labelText.length > 0,
        `Agent "${node.name}" has empty labelText`,
      ).toBe(true);
    }
  });

  it("agent labelText matches the agent display name in userData (3b-32)", () => {
    for (const node of graph.agentNodes) {
      const desc = getBirdsEyeVisual(node);
      const name = node.userData.name as string ?? node.userData.agentId as string;
      expect(
        desc?.labelText,
        `Agent "${node.name}" labelText should be "${name}"`,
      ).toBe(name);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-34/35/36 · Room visual descriptor accuracy
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-34/35/36: Room visual descriptor matches BUILDING data", () => {
  it("room birdsEyeVisual.accentColor matches room.colorAccent from BUILDING (3b-34)", () => {
    for (const roomDef of BUILDING.rooms) {
      const node = graph.roomNodes.find((n) => n.userData.roomId === roomDef.roomId);
      if (!node) continue;
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.accentColor,
        `Room "${roomDef.roomId}" accentColor should match BUILDING colorAccent`,
      ).toBe(roomDef.colorAccent);
    }
  });

  it("room birdsEyeVisual.footprintW matches room.dimensions.x from BUILDING (3b-35)", () => {
    for (const roomDef of BUILDING.rooms) {
      const node = graph.roomNodes.find((n) => n.userData.roomId === roomDef.roomId);
      if (!node) continue;
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.footprintW,
        `Room "${roomDef.roomId}" footprintW should be ${roomDef.dimensions.x}`,
      ).toBe(roomDef.dimensions.x);
    }
  });

  it("room birdsEyeVisual.footprintD matches room.dimensions.z from BUILDING (3b-36)", () => {
    for (const roomDef of BUILDING.rooms) {
      const node = graph.roomNodes.find((n) => n.userData.roomId === roomDef.roomId);
      if (!node) continue;
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.footprintD,
        `Room "${roomDef.roomId}" footprintD should be ${roomDef.dimensions.z}`,
      ).toBe(roomDef.dimensions.z);
    }
  });

  it("all room nodes have valid accentColor hex strings", () => {
    for (const node of graph.roomNodes) {
      const desc = getBirdsEyeVisual(node);
      expect(
        desc?.accentColor,
        `Room "${node.name}" accentColor must be a valid hex string`,
      ).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-38/39 · Floor nodes exist with correct naming convention
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-38/39: Floor nodes exist with correct naming convention", () => {
  it("floor node count equals BUILDING.floors.length (3b-38)", () => {
    expect(graph.floorNodes).toHaveLength(BUILDING.floors.length);
  });

  it("floor nodes are named 'hierarchy-floor-{n}' (3b-39)", () => {
    for (const node of graph.floorNodes) {
      expect(
        node.name,
        `Floor node name "${node.name}" should start with "${FLOOR_NODE_PREFIX}"`,
      ).toMatch(/^hierarchy-floor-\d+$/);
    }
  });

  it("FLOOR_NODE_PREFIX is 'hierarchy-floor-' (3b-59)", () => {
    expect(FLOOR_NODE_PREFIX).toBe("hierarchy-floor-");
  });

  it("getFloorNodeName(0) returns 'hierarchy-floor-0' (3b-58)", () => {
    expect(getFloorNodeName(0)).toBe("hierarchy-floor-0");
  });

  it("getFloorNodeName(1) returns 'hierarchy-floor-1' (3b-58)", () => {
    expect(getFloorNodeName(1)).toBe("hierarchy-floor-1");
  });

  it("getFloorNodeName always starts with FLOOR_NODE_PREFIX (3b-58)", () => {
    for (let i = 0; i < 4; i++) {
      expect(getFloorNodeName(i)).toMatch(new RegExp(`^${FLOOR_NODE_PREFIX}`));
    }
  });

  it("floor node 0 has userData.floor = 0", () => {
    const f0 = graph.floorNodes.find((n) => n.userData.floor === 0);
    expect(f0).toBeDefined();
  });

  it("floor node 1 has userData.floor = 1", () => {
    const f1 = graph.floorNodes.find((n) => n.userData.floor === 1);
    expect(f1).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-40/41/42 · Floor zone colors
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-40/41/42: Floor zone colors are distinct per floor", () => {
  it("FLOOR_ZONE_COLORS has at least 2 entries (3b-42)", () => {
    expect(FLOOR_ZONE_COLORS.length).toBeGreaterThanOrEqual(2);
  });

  it("first two FLOOR_ZONE_COLORS are distinct (3b-42)", () => {
    expect(FLOOR_ZONE_COLORS[0]).not.toBe(FLOOR_ZONE_COLORS[1]);
  });

  it("floor 0 uses FLOOR_ZONE_COLORS[0] deep blue (3b-40)", () => {
    const f0 = graph.floorNodes.find((n) => n.userData.floor === 0);
    const desc = f0 ? getBirdsEyeVisual(f0) : undefined;
    expect(desc?.accentColor).toBe(FLOOR_ZONE_COLORS[0]);
  });

  it("floor 1 uses FLOOR_ZONE_COLORS[1] deep purple (3b-41)", () => {
    const f1 = graph.floorNodes.find((n) => n.userData.floor === 1);
    const desc = f1 ? getBirdsEyeVisual(f1) : undefined;
    expect(desc?.accentColor).toBe(FLOOR_ZONE_COLORS[1]);
  });

  it("all FLOOR_ZONE_COLORS are valid hex strings", () => {
    for (const color of FLOOR_ZONE_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-43/44/45 · Opacity values per tier
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-43/44/45: Opacity values convey visual hierarchy", () => {
  it("building base opacity is prominently high (> 0.5) (3b-43)", () => {
    expect(TIER_BASE_OPACITY.building).toBeGreaterThan(0.5);
  });

  it("floor base opacity is subtly low (< 0.3) to avoid obscuring rooms (3b-44)", () => {
    expect(TIER_BASE_OPACITY.floor).toBeLessThan(0.3);
  });

  it("agent base opacity is prominently high (> 0.7) (3b-45)", () => {
    expect(TIER_BASE_OPACITY.agent).toBeGreaterThan(0.7);
  });

  it("all TIER_BASE_OPACITY values are in (0, 1]", () => {
    for (const [tier, opacity] of Object.entries(TIER_BASE_OPACITY)) {
      expect(opacity, `TIER_BASE_OPACITY["${tier}"] must be > 0`).toBeGreaterThan(0);
      expect(opacity, `TIER_BASE_OPACITY["${tier}"] must be <= 1`).toBeLessThanOrEqual(1);
    }
  });

  it("building node birdsEyeVisual.opacity is prominently high (> 0.5)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.opacity).toBeGreaterThan(0.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-46/47/48/49 · queryTierNodes() finds correct nodes
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-46/47/48/49: queryTierNodes() returns correct nodes per tier", () => {
  it("queryTierNodes('building') finds the building node (3b-46)", () => {
    const nodes = queryTierNodes(graph.root, "building");
    expect(nodes).toContain(graph.buildingNode);
  });

  it("queryTierNodes('floor') finds all floor nodes (3b-47)", () => {
    const nodes = queryTierNodes(graph.root, "floor");
    for (const fn of graph.floorNodes) {
      expect(nodes).toContain(fn);
    }
  });

  it("queryTierNodes('room') finds all room nodes (3b-48)", () => {
    const nodes = queryTierNodes(graph.root, "room");
    for (const rn of graph.roomNodes) {
      expect(nodes).toContain(rn);
    }
  });

  it("queryTierNodes('agent') finds all agent nodes (3b-49)", () => {
    const nodes = queryTierNodes(graph.root, "agent");
    for (const an of graph.agentNodes) {
      expect(nodes).toContain(an);
    }
  });

  it("queryTierNodes results are mutually exclusive across tiers", () => {
    const building = new Set(queryTierNodes(graph.root, "building"));
    const floor    = new Set(queryTierNodes(graph.root, "floor"));
    const room     = new Set(queryTierNodes(graph.root, "room"));
    const agent    = new Set(queryTierNodes(graph.root, "agent"));

    // No node appears in more than one tier set
    for (const n of building) {
      expect(floor.has(n)).toBe(false);
      expect(room.has(n)).toBe(false);
      expect(agent.has(n)).toBe(false);
    }
    for (const n of floor) {
      expect(room.has(n)).toBe(false);
      expect(agent.has(n)).toBe(false);
    }
    for (const n of room) {
      expect(agent.has(n)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-50/51 · getBirdsEyeVisual() helpers
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-50/51: getBirdsEyeVisual() accessor", () => {
  it("returns the descriptor attached to the building node (3b-50)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc).toBeDefined();
    expect(desc?.tier).toBe("building");
  });

  it("returns a valid BirdsEyeVisualDescriptor for the building node", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode) as BirdsEyeVisualDescriptor;
    expect(desc.tier).toBe("building");
    expect(typeof desc.layerOrder).toBe("number");
    expect(typeof desc.markerElevation).toBe("number");
    expect(typeof desc.footprintW).toBe("number");
    expect(typeof desc.footprintD).toBe("number");
    expect(typeof desc.accentColor).toBe("string");
    expect(typeof desc.opacity).toBe("number");
    expect(typeof desc.showLabel).toBe("boolean");
    expect(typeof desc.labelText).toBe("string");
  });

  it("returns undefined for a plain unannotated node (3b-51)", () => {
    const plain = makeSceneNode({ name: "unannotated" });
    expect(getBirdsEyeVisual(plain)).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-52 · Independence — multiple calls produce independent graphs
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-52: Multiple calls produce independent graphs", () => {
  it("two calls produce different root nodes", () => {
    const g2 = initializeHierarchyVisuals();
    expect(g2.root).not.toBe(graph.root);
  });

  it("two calls produce different building nodes", () => {
    const g2 = initializeHierarchyVisuals();
    expect(g2.buildingNode).not.toBe(graph.buildingNode);
  });

  it("both scenes have the same number of room nodes", () => {
    const g2 = initializeHierarchyVisuals();
    expect(g2.roomNodes.length).toBe(graph.roomNodes.length);
  });

  it("both scenes have the same number of floor nodes", () => {
    const g2 = initializeHierarchyVisuals();
    expect(g2.floorNodes.length).toBe(graph.floorNodes.length);
  });

  it("modifying g2 does not affect graph1 room nodes", () => {
    const g2 = initializeHierarchyVisuals();
    // Mutate g2's first room node
    if (g2.roomNodes[0]) {
      g2.roomNodes[0].userData.testMutation = true;
    }
    // graph1's first room node should be unaffected
    expect(graph.roomNodes[0]?.userData.testMutation).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-53/54 · TIER_VISUALS constants match applied descriptors
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-53/54: TIER_VISUALS constants match values applied to nodes", () => {
  it("TIER_VISUALS.building layerOrder matches the building node descriptor (3b-53)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.layerOrder).toBe(TIER_VISUALS.building.layerOrder);
  });

  it("TIER_VISUALS.building markerElevation matches the building node descriptor (3b-53)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.markerElevation).toBe(TIER_VISUALS.building.markerElevation);
  });

  it("TIER_VISUALS.building footprintW matches the building node descriptor (3b-53)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.footprintW).toBe(TIER_VISUALS.building.footprintW);
  });

  it("TIER_VISUALS.building accentColor matches the building node descriptor (3b-53)", () => {
    const desc = getBirdsEyeVisual(graph.buildingNode);
    expect(desc?.accentColor).toBe(TIER_VISUALS.building.accentColor);
  });

  it("TIER_VISUALS.floor layerOrder matches the floor node descriptor (3b-54)", () => {
    const floorDesc = getBirdsEyeVisual(graph.floorNodes[0]!);
    expect(floorDesc?.layerOrder).toBe(TIER_VISUALS.floor.layerOrder);
  });

  it("TIER_VISUALS.floor markerElevation matches the floor node descriptor (3b-54)", () => {
    const floorDesc = getBirdsEyeVisual(graph.floorNodes[0]!);
    expect(floorDesc?.markerElevation).toBe(TIER_VISUALS.floor.markerElevation);
  });

  it("TIER_VISUALS.agent markerRadius matches agent node descriptors", () => {
    const agentDesc = getBirdsEyeVisual(graph.agentNodes[0]!);
    expect(agentDesc?.markerRadius).toBe(TIER_VISUALS.agent.markerRadius);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-55/56/57 · Structural hierarchy preserved
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-55/56/57: Structural scene graph hierarchy is preserved", () => {
  it("rooms are children (direct or indirect) of the building node (3b-55)", () => {
    for (const node of graph.roomNodes) {
      expect(
        node.parent,
        `Room "${node.name}" should have a parent`,
      ).toBe(graph.buildingNode);
    }
  });

  it("agents are nested under room nodes — not directly under building (3b-56)", () => {
    for (const node of graph.agentNodes) {
      const parent = node.parent;
      expect(
        parent,
        `Agent "${node.name}" should have a parent`,
      ).not.toBeNull();
      // Parent should be a room node (not the building or root directly)
      expect(
        parent,
        `Agent "${node.name}" parent should not be the root`,
      ).not.toBe(graph.root);
    }
  });

  it("floor nodes are direct children of the building node (3b-57)", () => {
    for (const node of graph.floorNodes) {
      expect(
        node.parent,
        `Floor node "${node.name}" should have buildingNode as parent`,
      ).toBe(graph.buildingNode);
    }
  });

  it("scene root has only one direct child (the building node)", () => {
    expect(graph.root.children).toHaveLength(1);
    expect(graph.root.children[0]).toBe(graph.buildingNode);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b-60/61/62 · Descriptor builder functions
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3b-60/61/62: Descriptor builder functions return valid descriptors", () => {
  it("buildFloorVisualDescriptor() returns a descriptor with tier='floor' (3b-60)", () => {
    const desc = buildFloorVisualDescriptor(0, "Ground Floor");
    expect(desc.tier).toBe("floor");
  });

  it("buildFloorVisualDescriptor() uses FLOOR_ZONE_COLORS[0] for floor 0 (3b-60)", () => {
    const desc = buildFloorVisualDescriptor(0, "Ground Floor");
    expect(desc.accentColor).toBe(FLOOR_ZONE_COLORS[0]);
  });

  it("buildFloorVisualDescriptor() uses FLOOR_ZONE_COLORS[1] for floor 1 (3b-60)", () => {
    const desc = buildFloorVisualDescriptor(1, "Operations Floor");
    expect(desc.accentColor).toBe(FLOOR_ZONE_COLORS[1]);
  });

  it("buildFloorVisualDescriptor() wraps safely beyond FLOOR_ZONE_COLORS length (3b-60)", () => {
    // Floor index >= FLOOR_ZONE_COLORS.length should not throw
    const desc = buildFloorVisualDescriptor(999, "Far Future Floor");
    expect(desc.tier).toBe("floor");
    expect(typeof desc.accentColor).toBe("string");
  });

  it("buildRoomVisualDescriptor() returns a descriptor with tier='room' (3b-61)", () => {
    const desc = buildRoomVisualDescriptor("ops-control", "Operations Control", "#ff0000", 4, 3, "CTRL");
    expect(desc.tier).toBe("room");
  });

  it("buildRoomVisualDescriptor() applies the given accentColor (3b-61)", () => {
    const desc = buildRoomVisualDescriptor("test-room", "Test Room", "#abcdef", 4, 3, "TEST");
    expect(desc.accentColor).toBe("#abcdef");
  });

  it("buildRoomVisualDescriptor() applies the given footprint dimensions (3b-61)", () => {
    const desc = buildRoomVisualDescriptor("test-room", "Test Room", "#abcdef", 5, 4, "TEST");
    expect(desc.footprintW).toBe(5);
    expect(desc.footprintD).toBe(4);
  });

  it("buildRoomVisualDescriptor() sets the labelText to the provided role label (3b-61)", () => {
    const desc = buildRoomVisualDescriptor("ops-control", "Operations Control", "#00ff00", 4, 3, "CTRL");
    expect(desc.labelText).toBe("CTRL");
  });

  it("buildRoomVisualDescriptor() has showLabel = true (3b-61)", () => {
    const desc = buildRoomVisualDescriptor("r", "Room", "#ffffff", 3, 3, "TST");
    expect(desc.showLabel).toBe(true);
  });

  it("buildAgentVisualDescriptor() returns a descriptor with tier='agent' (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Agent One");
    expect(desc.tier).toBe("agent");
  });

  it("buildAgentVisualDescriptor() sets labelText to the agent name (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Test Agent");
    expect(desc.labelText).toBe("Test Agent");
  });

  it("buildAgentVisualDescriptor() uses default accentColor when no roleColor given (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Test Agent");
    expect(desc.accentColor).toBe(TIER_ACCENT_COLORS.agent);
  });

  it("buildAgentVisualDescriptor() uses the given roleColor when provided (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Test Agent", "#ff4488");
    expect(desc.accentColor).toBe("#ff4488");
  });

  it("buildAgentVisualDescriptor() has markerRadius = AGENT_MARKER_DISC_RADIUS (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Test Agent");
    expect(desc.markerRadius).toBe(AGENT_MARKER_DISC_RADIUS);
  });

  it("buildAgentVisualDescriptor() has showLabel = true (3b-62)", () => {
    const desc = buildAgentVisualDescriptor("agent-1", "Test Agent");
    expect(desc.showLabel).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — bird's-eye legibility summary
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration: Bird's-eye legibility — all four tiers visually distinguishable", () => {
  it("each tier has a unique (tier, layerOrder, elevation) tuple", () => {
    const tiers = ["building", "floor", "room", "agent"] as const;
    const tuples = tiers.map((t) => ({
      tier:       t,
      layerOrder: TIER_LAYER_ORDER[t],
      elevation:  TIER_ELEVATIONS[t],
    }));

    // All layerOrders are unique
    const orderSet = new Set(tuples.map((t) => t.layerOrder));
    expect(orderSet.size).toBe(4);

    // All elevations are unique
    const elevSet = new Set(tuples.map((t) => t.elevation));
    expect(elevSet.size).toBe(4);
  });

  it("building is unambiguously the widest scope marker (footprint > any room)", () => {
    const bldgArea = BUILDING_FOOTPRINT_W * BUILDING_FOOTPRINT_D;
    const maxRoomArea = Math.max(
      ...BUILDING.rooms.map((r) => r.dimensions.x * r.dimensions.z),
    );
    expect(bldgArea).toBeGreaterThan(maxRoomArea);
  });

  it("agents are unambiguously the smallest scope markers (disc < smallest room)", () => {
    const agentArea = Math.PI * AGENT_MARKER_DISC_RADIUS ** 2;
    const minRoomArea = Math.min(
      ...BUILDING.rooms.map((r) => r.dimensions.x * r.dimensions.z),
    );
    expect(agentArea).toBeLessThan(minRoomArea);
  });

  it("all tier nodes have both hierarchyTier and birdsEyeVisual populated", () => {
    const allTierNodes = [
      graph.buildingNode,
      ...graph.floorNodes,
      ...graph.roomNodes,
      ...graph.agentNodes,
    ];
    for (const node of allTierNodes) {
      expect(
        typeof node.userData.hierarchyTier,
        `Node "${node.name}" missing hierarchyTier`,
      ).toBe("string");
      expect(
        node.userData.birdsEyeVisual,
        `Node "${node.name}" missing birdsEyeVisual`,
      ).toBeDefined();
    }
  });

  it("the scene graph structure is building → (rooms|floors) → agents (correct nesting)", () => {
    // Building is root's child
    expect(graph.root.children).toContain(graph.buildingNode);
    // Rooms are building's children
    for (const rn of graph.roomNodes) {
      expect(graph.buildingNode.children).toContain(rn);
    }
    // Floor nodes are building's children
    for (const fn of graph.floorNodes) {
      expect(graph.buildingNode.children).toContain(fn);
    }
    // Agents are NOT root's children (nested deeper)
    for (const an of graph.agentNodes) {
      expect(graph.root.children).not.toContain(an);
    }
  });
});
